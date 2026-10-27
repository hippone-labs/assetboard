// Pro: SSH 直读, the pure part. The Mac app runs one fixed read-only command over the system's ssh (desktop/SSHProbe.swift); this
// file is that command as the settings show it, the reading of what it prints, the per-host session kept in memory (history for the
// sparklines, rates from two samples, backoff after failures), and the probe server it becomes, in the same shape as
// probe-data.js's. No DOM, no bridge: probe-ssh-pro.js draws, the tests read this file directly. Loaded after probe-data.js.
// Node (the tests) has no i18n.js loaded before this file: take its tr(), which answers in Chinese.
if(typeof module!=='undefined'&&typeof tr==='undefined')globalThis.tr=require('../../i18n.js').tr;
(function(root){
 const asset=typeof module!=='undefined'&&typeof window==='undefined'?require('../../asset-data.js'):root;

 // The command line, exactly as desktop/SSHProbe.swift has it (pro/tests/probe-ssh.test.js checks they are the same).
 const SSH_PROBE_OPTIONS=['-o','BatchMode=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2',
  '-o','UpdateHostKeys=no','-o','ClearAllForwardings=yes','-o','ForwardAgent=no','-o','ForwardX11=no',
  '-o','PermitLocalCommand=no','-o','RemoteCommand=none','-o','RequestTTY=no','-n','-T'];
 const SSH_PROBE_COMMAND="env LC_ALL=C sh -c 'echo @@uname; uname -sm; echo @@stat1; head -n 1 /proc/stat; sleep 1; echo @@stat2; head -n 1 /proc/stat; echo @@nproc; getconf _NPROCESSORS_ONLN; echo @@meminfo; cat /proc/meminfo; echo @@df; df -P -k /; echo @@netdev; cat /proc/net/dev; echo @@uptime; cat /proc/uptime; echo @@loadavg; cat /proc/loadavg; echo @@end'";
 // The commands inside it, one per line, with what each reads (the settings list them under the verbatim command).
 const SSH_PROBE_STEPS=[['uname -sm',tr('系统和架构（只支持 Linux）')],['head -n 1 /proc/stat',tr('CPU 计数，隔 1 秒（sleep 1）读两次')],
  ['getconf _NPROCESSORS_ONLN',tr('CPU 核数')],['cat /proc/meminfo',tr('内存')],['df -P -k /',tr('根分区用量')],['cat /proc/net/dev',tr('网卡收发字节（两次读取之差算网速）')],
  ['cat /proc/uptime',tr('开机时长')],['cat /proc/loadavg',tr('负载')]];
 const sshCommandLine=alias=>['/usr/bin/ssh',...SSH_PROBE_OPTIONS,'--',alias||tr('<别名>'),SSH_PROBE_COMMAND].map(p=>/[\s']/.test(p)?`"${p}"`:p).join(' ');

 const SSH_INTERVALS=[30,60,120,300],SSH_DEFAULT_INTERVAL=60,SSH_HISTORY=60,SSH_MAX_WAIT=15*60*1000;

 // Reading. The output is sections, each after a line "@@name"; a Linux host prints all of them and ends with @@end.
 function sshSections(text){
  const out={};let name=null;
  for(const line of String(text||'').split(/\r?\n/)){
   const m=/^@@([a-z0-9]+)$/.exec(line.trim());
   if(m){name=m[1];out[name]=out[name]||[];continue;}
   if(name)out[name].push(line);
  }
  return out;
 }
 const int=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
 function cpuTicks(line){
  const f=String(line||'').trim().split(/\s+/);if(f[0]!=='cpu')return null;
  // user nice system idle iowait irq softirq steal; guest time is already inside user.
  const n=f.slice(1,9).map(Number);if(n.length<4||n.some(x=>!Number.isFinite(x)))return null;
  const total=n.reduce((a,b)=>a+b,0),idle=n[3]+(n[4]||0);return {total,idle};
 }
 // Interfaces that only carry what a real one already carried (loopback, containers, bridges, tunnels) are left out of the rate.
 const VIRTUAL_NIC=/^(lo|veth|docker|br-|virbr|cni|flannel|cali|kube|vxlan|tun|tap|wg|tailscale|zt|ifb|dummy)/;
 function parseSshProbe(text){
  const sec=sshSections(text);
  if(!sec.uname)throw new Error(tr('读不到命令输出'));
  const [os='',arch='']=(sec.uname.find(l=>l.trim())||'').trim().split(/\s+/);
  if(os!=='Linux')return {supported:false,os:os||tr('未知系统'),arch};
  if(!sec.end)throw new Error(tr('命令输出不完整'));
  const a=cpuTicks(sec.stat1?.[0]),b=cpuTicks(sec.stat2?.[0]);
  const dt=a&&b?b.total-a.total:0,cpu=dt>0?Math.min(100,Math.max(0,(dt-(b.idle-a.idle))/dt*100)):null;
  const mi={};for(const l of sec.meminfo||[]){const m=/^(\w+(?:\(\w+\))?):\s+(\d+)\s*kB/.exec(l);if(m)mi[m[1]]=+m[2]*1024;}
  const avail=mi.MemAvailable??(mi.MemFree!=null?mi.MemFree+(mi.Buffers||0)+(mi.Cached||0):null);
  const mem=mi.MemTotal>0&&avail!=null?{used:Math.max(0,mi.MemTotal-avail),total:mi.MemTotal}:null;
  let disk=null;
  for(const l of (sec.df||[]).slice(1)){const m=/^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\/.*)$/.exec(l.trim());
   if(m&&m[6]==='/'){const used=+m[3]*1024,free=+m[4]*1024;if(used+free>0)disk={used,total:used+free};}}
  let rx=0,tx=0,nics=0;
  for(const l of sec.netdev||[]){const m=/^\s*([^:\s]+):\s*(.*)$/.exec(l);if(!m||VIRTUAL_NIC.test(m[1]))continue;
   const f=m[2].trim().split(/\s+/).map(Number);if(f.length<9||!Number.isFinite(f[0])||!Number.isFinite(f[8]))continue;rx+=f[0];tx+=f[8];nics++;}
  const up=int((sec.uptime?.[0]||'').trim().split(/\s+/)[0]);
  const la=(sec.loadavg?.[0]||'').trim().split(/\s+/).slice(0,3).map(Number);
  const cores=int((sec.nproc?.[0]||'').trim());
  return {supported:true,os,arch,cpu,mem,disk,net:nics?{rx,tx}:null,uptime:up,load:la.length===3&&la.every(Number.isFinite)?la:null,cores:cores>0?cores:null};
 }

 // A host's session: what the board knows about it since the app opened. Never saved.
 const sshSession=alias=>({alias,reading:null,at:0,lastOk:0,tried:0,pending:false,fails:0,reason:'',error:'',rate:null,history:[]});
 // A result from the app: {output, at} or {reason, error}. Returns the next session; the old one is left as it was.
 function sshRecord(h,r,now=Date.now()){
  const next={...h,pending:false,history:h.history.slice()};
  const fail=(reason,error)=>{next.fails=h.fails+1;next.reason=reason;next.error=error;return next;};
  if(r.output==null)return fail(r.reason||'other',String(r.error||''));
  let p;try{p=parseSshProbe(r.output);}catch(e){return fail('other',e.message);}
  if(!p.supported)return fail('unsupported',p.os);
  const at=Number(r.at)||now,prev=h.reading;
  // A rate needs two readings of the same boot; a counter that went back means a reboot or a reset.
  let rate=null;
  if(prev?.net&&p.net&&h.at&&at>h.at&&(prev.uptime==null||p.uptime==null||p.uptime>=prev.uptime)){
   const s=(at-h.at)/1000,rx=(p.net.rx-prev.net.rx)/s,tx=(p.net.tx-prev.net.tx)/s;if(rx>=0&&tx>=0)rate={rx,tx};
  }
  next.reading=p;next.at=at;next.lastOk=at;next.fails=0;next.reason='';next.error='';next.rate=rate;
  next.history.push({t:at,cpu:p.cpu,mem:p.mem?p.mem.used/p.mem.total*100:null,net:rate?rate.rx+rate.tx:null});
  if(next.history.length>SSH_HISTORY)next.history.splice(0,next.history.length-SSH_HISTORY);
  return next;
 }
 // Whether to ask again: once per interval, twice as long after each failure in a row (at most 15 minutes); a host that needs the
 // person (a password, a host key, not Linux) waits the longest until they press 刷新. A request lost for two minutes counts as done.
 function sshDue(h,now,intervalMs){
  if(h.pending&&now-h.tried<120000)return false;
  if(!h.tried)return true;
  const wait=['hostkey','auth','unsupported','missing'].includes(h.reason)?SSH_MAX_WAIT:h.fails?Math.min(intervalMs*2**Math.min(h.fails,6),SSH_MAX_WAIT):intervalMs;
  return now-h.tried>=wait-1500;
 }
 // Online while the last reading is fresh (three intervals, at least two minutes) and the last try reached the host.
 function sshOnline(h,now,intervalMs){return !!h.lastOk&&h.reason!=='down'&&now-h.lastOk<Math.max(3*intervalMs,120000);}

 // The words for why a host is skipped or failed: the person can do something about the first two.
 function sshProblem(h){
  const alias=h.alias;
  return {hostkey:tr('需要确认主机指纹：先在终端里连一次 ssh {alias}',{alias}),auth:tr('需要密码或密钥没加载：先在终端里连一次 ssh {alias}（或 ssh-add）',{alias}),
   unsupported:tr('不支持：{os} 不是 Linux',{os:h.error||tr('这台')}),down:h.error?tr('连不上：{error}',{error:h.error}):tr('连不上'),missing:tr('~/.ssh/config 里已没有这个别名'),
   other:h.error?tr('读取失败：{error}',{error:h.error}):tr('读取失败')}[h.reason]||'';
 }

 // The same in two or three words, for the settings row (the full sentence goes in its tip).
 const sshProblemShort=h=>({hostkey:tr('需确认指纹'),auth:tr('需要密码'),unsupported:tr('不支持'),down:tr('连不上'),missing:tr('别名已不在'),other:tr('读取失败')}[h.reason]||'');

 // The probe server for a host, or null while there is nothing to show: never tried, or skipped before it was ever read (a host
 // that wants a password or a host key, or is not Linux). One that cannot be reached at all shows as offline.
 // `host` is its ~/.ssh/config entry ({name, host}), for matching by HostName or IP.
 function sshServer(h,host,now,intervalMs){
  if(!h.lastOk&&h.reason!=='down')return null;
  const p=h.reading,target=String(host?.host||'').trim(),ip=asset.normalizeIp(target)?.ip;
  return {id:h.alias,name:h.alias,hostnames:[...new Set([h.alias,target].map(x=>String(x).trim().toLowerCase().replace(/\.$/,'')).filter(Boolean))],ips:ip?[ip]:[],
   online:sshOnline(h,now,intervalMs),cpu:p?.cpu??null,mem:p?.mem||null,disk:p?.disk||null,traffic:null,trafficLimit:null,lastSeen:h.lastOk||null,
   rate:h.rate,history:h.history,uptime:p?.uptime??null,load:p?.load||null,cores:p?.cores||null,error:h.reason?sshProblem(h):'',region:''};
 }

 // Which server card a ~/.ssh/config host ({name, host}) is: the card with its HostName's IP, or its HostName or alias as the
 // card's host or name (an imported card keeps the alias as externalId). Hidden cards are left out; null when none or several.
 const sshKey=v=>String(v??'').trim().toLowerCase().replace(/\.$/,'');
 function sshCardFor(host,assets){
  const cards=(assets||[]).filter(a=>a.type==='server'&&!a.hiddenAt),alias=sshKey(host?.name),target=sshKey(host?.host),ip=asset.normalizeIp(target)?.ip;
  for(const fits of [a=>!!ip&&asset.assetIps(a).some(x=>x.ip===ip),a=>!!target&&[a.host,a.name].map(sshKey).includes(target),
   a=>!!alias&&[a.host,a.name,a.source==='ssh'?a.externalId:''].map(sshKey).includes(alias)]){
   const found=cards.filter(fits);if(found.length===1)return found[0];if(found.length>1)return null;
  }
  return null;
 }
 // The hosts to turn on for the person: those whose card was found, that are not on yet, were never switched off by hand, and
 // whose card no panel already shows (`covered`: card ids a panel is linked to; a panel's reading wins anyway).
 function sshAutoAliases(hosts,assets,{enabled=[],disabled=[],covered=new Set()}={}){
  const on=new Set(enabled.map(sshKey)),off=new Set(disabled.map(sshKey));
  return (hosts||[]).filter(h=>!on.has(sshKey(h.name))&&!off.has(sshKey(h.name))).filter(h=>{const card=sshCardFor(h,assets);return card&&!covered.has(card.id);}).map(h=>h.name);
 }

 // The demo (`--demo`, `?demo`): made-up hosts and made-up output, read through the same code; ssh is never run.
 const SSH_DEMO_CONFIG='Host frankfurt-vps\n  HostName 198.51.100.24\n  Port 2222\nHost tokyo-vps\n  HostName 203.0.113.10\nHost edge-01\n  HostName edge-01.example.net\nHost mac-mini\n  HostName 198.51.100.40\nHost scratch-vm\n  HostName 198.51.100.99\n';
 const SSH_DEMO_ENABLED=['frankfurt-vps','tokyo-vps','edge-01','mac-mini'];
 function sshDemoOutput(alias,tick){
  if(alias==='edge-01')return {reason:'hostkey',error:'Host key verification failed.'};
  if(alias==='mac-mini')return {output:'@@uname\nDarwin arm64\n@@stat1\n@@end\n'};
  const w=x=>Math.round(x),busy=alias==='frankfurt-vps'?38+22*Math.sin(tick/2.3)+9*Math.sin(tick*1.7):9+4*Math.sin(tick/3);
  const base=1e6+tick*5000,used=w(10*busy),idle=1000-used;
  const memTotal=8*1024*1024,avail=w(memTotal*(0.46-0.08*Math.sin(tick/5)));
  const rx=w(4.2e10+tick*(2.6e7+9e6*Math.sin(tick/2))),tx=w(1.1e10+tick*(8e6+3e6*Math.cos(tick/3)));
  return {output:['@@uname','Linux x86_64','@@stat1',`cpu  ${base} 0 ${base/4} ${base*3} 10 0 0 0 0 0`,'@@stat2',`cpu  ${base+used*0.8} 0 ${base/4+used*0.2} ${base*3+idle} 10 0 0 0 0 0`,
   '@@nproc','4','@@meminfo',`MemTotal:       ${memTotal} kB`,`MemFree:         ${w(avail/3)} kB`,`MemAvailable:    ${avail} kB`,
   '@@df','Filesystem     1024-blocks      Used Available Capacity Mounted on','/dev/vda1         82045336  50331648  31713688      62% /',
   '@@netdev','Inter-|   Receive                                                |  Transmit',' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
   `    lo: 99999 10 0 0 0 0 0 0 99999 10 0 0 0 0 0 0`,`  eth0: ${rx} 100 0 0 0 0 0 0 ${tx} 100 0 0 0 0 0 0`,
   '@@uptime',`${864000+tick*60}.12 1000.00`,'@@loadavg','1.21 0.98 0.87 2/310 4242','@@end',''].join('\n')};
 }

 const api={SSH_PROBE_OPTIONS,SSH_PROBE_COMMAND,SSH_PROBE_STEPS,SSH_INTERVALS,SSH_DEFAULT_INTERVAL,SSH_HISTORY,sshCommandLine,sshSections,parseSshProbe,
  sshSession,sshRecord,sshDue,sshOnline,sshProblem,sshProblemShort,sshServer,sshCardFor,sshAutoAliases,SSH_DEMO_CONFIG,SSH_DEMO_ENABLED,sshDemoOutput};
 if(typeof module!=='undefined'&&typeof window==='undefined')module.exports=api;else root.probeSshData=api;
})(typeof window!=='undefined'?window:globalThis);
