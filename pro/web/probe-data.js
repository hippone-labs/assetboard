// Pro: probe data sources (探针数据源), the pure part: what each kind of panel answers, turned into one shape of server; which probe
// server is which server card; and the words and numbers shown for it. No DOM, no bridge: pro/web/probe-pro.js draws, and the
// tests read this file directly. Loaded after asset-data.js (it uses normalizeIp and assetIps) and before probe-pro.js.
//
// A probe server, whatever the panel: {id, name, hostnames:[...], ips:[...normalized], online, cpu (%), mem/disk {used,total} (bytes),
// traffic (bytes this month, as the panel counts it), trafficLimit (bytes or null), lastSeen (ms or null)}. Any number can be null.
// Node (the tests) has no i18n.js loaded before this file: take its tr(), which answers in Chinese.
if(typeof module!=='undefined'&&typeof tr==='undefined')globalThis.tr=require('../../i18n.js').tr;
(function(root){
 const asset=typeof module!=='undefined'&&typeof window==='undefined'?require('../../asset-data.js'):root;
 const MB=1024*1024,GB=1024*MB;
 // A panel's server counts as online while its last report is this fresh; CF-Server-Monitor uses the same 5 minutes.
 const PROBE_ONLINE_MS=5*60*1000;
 const num=value=>{const n=typeof value==='number'?value:parseFloat(value);return Number.isFinite(n)?n:null;};
 const pair=(used,total,unit)=>{const u=num(used),t=num(total);return u==null||t==null||t<=0?null:{used:Math.max(0,u)*unit,total:t*unit};};
 const ipList=values=>[...new Set(values.map(v=>asset.normalizeIp(v)?.ip).filter(Boolean))];

 // Kinds. Each says how the panel's answer becomes servers; the Mac app's ProbeKind (desktop/ProbeSource.swift) says which
 // read-only path to GET and how to send the credential. Adding Nezha or Komari is one entry here and one there.
 const PROBE_KINDS={
  cfsm:{
   name:'CF-Server-Monitor',
   // GET /api/servers (and /api/history/all, /api/ws): public on a public site; a private one is read with the panel's own account
   // (the Mac app logs in, keeps the JWT in memory). It never gives addresses (ip_v4/ip_v6 are only "0"/"1" reachability flags)
   // and has no hostname field, so its servers are matched by name.
   account:true,
   credential:tr('私有面板填面板后台的账号密码（就是面板管理员账号）；只存在这台 Mac 的钥匙串里。公开面板留空。'),
   servers(json,now=Date.now()){
    if(!json||!Array.isArray(json.servers))throw new Error(tr('面板的回答里没有服务器列表'));
    const reports=new Map((Array.isArray(json.latestReportUpdates)?json.latestReportUpdates:[]).map(r=>[String(r?.serverId),num(r?.reportTs)]));
    return json.servers.filter(s=>s&&typeof s==='object'&&s.id!=null&&String(s.name??'').trim()).slice(0,500).map(s=>{
     const id=String(s.id),seen=Math.max(num(s.last_updated)||0,reports.get(id)||0)||null;
     const rx=num(s.net_rx_monthly),tx=num(s.net_tx_monthly),calc=String(s.traffic_calc_type||'total');
     const traffic=rx==null&&tx==null?null:calc==='dl'?rx||0:calc==='ul'?tx||0:calc==='max'?Math.max(rx||0,tx||0):(rx||0)+(tx||0);
     const limit=num(s.traffic_limit),cpu=num(s.cpu);
     return {id,name:String(s.name).trim().slice(0,100),hostnames:[],ips:[],online:seen!=null&&now-seen<PROBE_ONLINE_MS,
      cpu:cpu==null?null:Math.min(100,Math.max(0,cpu)),mem:pair(s.ram_used,s.ram_total,MB),disk:pair(s.disk_used,s.disk_total,MB),
      traffic,trafficLimit:limit&&limit>0?limit*GB:null,lastSeen:seen,region:String(s.region||'').toUpperCase().slice(0,2)};
    });
   }
  }
 };
 function probeServers(kind,json,now=Date.now()){
  const def=PROBE_KINDS[kind];if(!def)throw new Error(tr('不认识的探针类型'));
  return def.servers(json,now).map(s=>({...s,ips:ipList(s.ips||[]),hostnames:(s.hostnames||[]).map(h=>String(h).trim().toLowerCase().replace(/\.$/,'')).filter(Boolean)}));
 }

 // Matching. A link the person made (asset.probeLink = {source, id}) always wins, and {none:true} keeps a card out of automatic
 // matching. Otherwise, in this order, a probe server and a server card pair up when they share an IP address (v4 or v6), then a
 // hostname (the card's host or name against the probe's hostnames), then the plain name (case and a trailing dot ignored).
 // A pair is taken only when it is the only one on both sides at that step; ties are left for the person to link.
 const nameKey=value=>String(value??'').trim().toLowerCase().replace(/\.$/,'');
 function matchProbeServers(assets,sources){
  const servers=[];for(const src of sources||[])for(const s of src.servers||[])servers.push({source:src.id,server:s,key:src.id+'\u0000'+s.id});
  const byKey=new Map(servers.map(x=>[x.key,x])),links=new Map(),claimed=new Set();
  const cards=(assets||[]).filter(a=>a.type==='server');
  for(const a of cards){
   const l=a.probeLink;if(!l||l.none||!l.source||l.id==null)continue;
   const x=byKey.get(l.source+'\u0000'+l.id);if(x&&!claimed.has(x.key)){links.set(a.id,{...x,how:'manual'});claimed.add(x.key);}
  }
  const open=cards.filter(a=>!a.hiddenAt&&!a.probeLink&&!links.has(a.id));
  const steps=[
   ['ip',(a,s)=>{const mine=asset.assetIps(a).map(x=>x.ip);return s.ips.some(ip=>mine.includes(ip));}],
   ['host',(a,s)=>{const names=[a.host,a.name].map(nameKey).filter(Boolean);return s.hostnames.some(h=>names.includes(h));}],
   ['name',(a,s)=>{const n=nameKey(s.name);return !!n&&(nameKey(a.name)===n||nameKey(a.host)===n);}]
  ];
  for(const [how,fits] of steps){
   const free=servers.filter(x=>!claimed.has(x.key)),cand=open.filter(a=>!links.has(a.id));
   const pairs=[];for(const x of free)for(const a of cand)if(fits(a,x.server))pairs.push([x,a]);
   for(const [x,a] of pairs){
    if(pairs.filter(p=>p[0]===x).length!==1||pairs.filter(p=>p[1]===a).length!==1)continue;
    links.set(a.id,{...x,how});claimed.add(x.key);
   }
  }
  return {links,unmatched:servers.filter(x=>!claimed.has(x.key))};
 }

 // Words and numbers.
 function probeBytes(bytes){
  if(bytes==null)return '';const units=['B','KB','MB','GB','TB','PB'];let v=Math.max(0,bytes),i=0;
  while(v>=1024&&i<units.length-1){v/=1024;i++;}
  return `${v>=100||i===0?Math.round(v):v>=10?v.toFixed(1).replace(/\.0$/,''):v.toFixed(2).replace(/\.?0+$/,'')} ${units[i]}`;
 }
 const pct=(p)=>p==null?null:Math.round(p.used/p.total*100);
 function probeAgo(ms,now=Date.now()){
  if(!ms)return tr('从未上报');const m=Math.floor(Math.max(0,now-ms)/60000);
  return m<1?tr('刚刚'):m<60?tr('{n} 分钟前',{n:m}):m<48*60?tr('{n} 小时前',{n:Math.floor(m/60)}):tr('{n} 天前',{n:Math.floor(m/1440)});
 }
 function probeSummary(s,now=Date.now()){
  return {online:!!s.online,status:s.online?tr('在线'):tr('离线'),tone:s.online?'':'red',cpu:s.cpu==null?'':`${Math.round(s.cpu)}%`,
   mem:pct(s.mem)==null?'':`${pct(s.mem)}%`,disk:pct(s.disk)==null?'':`${pct(s.disk)}%`,
   memText:s.mem?`${probeBytes(s.mem.used)} / ${probeBytes(s.mem.total)}`:'',diskText:s.disk?`${probeBytes(s.disk.used)} / ${probeBytes(s.disk.total)}`:'',
   traffic:s.traffic==null?'':probeBytes(s.traffic)+(s.trafficLimit?` / ${probeBytes(s.trafficLimit)}`:''),
   seen:tr('最后上报于 {ago}',{ago:probeAgo(s.lastSeen,now)}),ago:probeAgo(s.lastSeen,now),
   // The same as numbers 0–100 for the gauges (null when the panel did not say); traffic only has a share when there is a limit.
   cpuPct:s.cpu==null?null:Math.round(s.cpu),memPct:pct(s.mem),diskPct:pct(s.disk),trafficUsed:s.traffic==null?'':probeBytes(s.traffic),
   trafficPct:s.traffic!=null&&s.trafficLimit?Math.min(100,Math.round(s.traffic/s.trafficLimit*100)):null};
 }

 // The gauges for one server, in the order they are drawn: three rings (CPU, 内存, 磁盘) and the month's traffic. Each carries the
 // words a screen reader and the hover tip say; the drawing itself shows only an icon and a number.
 function probeGauges(s,now=Date.now()){
  const v=probeSummary(s,now),list=[];
  if(v.cpuPct!=null)list.push({key:'cpu',pct:v.cpuPct,value:String(v.cpuPct),unit:'%',label:`CPU ${v.cpu}`});
  if(v.memPct!=null)list.push({key:'mem',pct:v.memPct,value:String(v.memPct),unit:'%',label:tr('内存 {pct}，{text}',{pct:v.mem,text:v.memText})});
  if(v.diskPct!=null)list.push({key:'disk',pct:v.diskPct,value:String(v.diskPct),unit:'%',label:tr('磁盘 {pct}，{text}',{pct:v.disk,text:v.diskText})});
  if(v.trafficUsed)list.push({key:'net',pct:v.trafficPct,value:v.trafficUsed,unit:'',label:tr('本月流量 {traffic}',{traffic:v.traffic})+(v.trafficPct!=null?tr('（{pct}%）',{pct:v.trafficPct}):'')});
  // A source that reads the interfaces itself (SSH 直读) has no month's total but a rate, from its last two readings.
  else if(s.rate)list.push({key:'net',pct:null,value:`${probeBytes(s.rate.rx+s.rate.tx)}/s`,unit:'',label:tr('网速 ↓ {rx}/s ↑ {tx}/s',{rx:probeBytes(s.rate.rx),tx:probeBytes(s.rate.tx)})});
  return list;
 }

 // The demo's panel (`--demo`, `?demo`): made up, shaped like a CF-Server-Monitor answer, read through the same code. Two servers
 // match by name, one is linked by hand in demo-data.js (it is called differently on the panel) and is offline, one matches nothing.
 function probeDemoAnswer(now=Date.now()){
  const mb=gb=>gb*1024;
  const row=(id,name,cpu,ram,ramTotal,disk,diskTotal,rx,tx,ago,limit='')=>({id,name,cpu,ram_used:mb(ram),ram_total:mb(ramTotal),disk_used:mb(disk),disk_total:mb(diskTotal),
   net_rx_monthly:rx*GB,net_tx_monthly:tx*GB,traffic_calc_type:'total',traffic_limit:limit,last_updated:now-ago*60000,ip_v4:'1',ip_v6:'0'});
  return {servers:[row('cf1','tokyo-vps',23,0.8,2,21,55,118,64,0.4,'1000'),row('cf2','frankfurt-vps',6,1.9,4,150,240,32,12,1),
   row('cf3','nas-home',0,3,8,1500,3600,4,1,47),row('cf4','lab-pi',41,0.6,1,9,29,2,1,2)],stats:{total:4}};
 }
 const PROBE_DEMO_SOURCE={id:'demo-probe',kind:'cfsm',name:tr('演示探针'),url:'https://status.example.com',hasLogin:false,username:''};

 // ---- task-15: errors, history, live updates ----------------------------------------------------------------------------------
 // A refused read, by the reason the Mac app gives (desktop/ProbeSource.swift ProbeKind.refusal): a wrong or missing account, a
 // human check (Turnstile) the app cannot pass, a private panel without an account, or anything else. All keep what was read before.
 function probeErrorKind(status,reason){
  if(['credentials','turnstile','private'].includes(reason))return reason;
  return status===401?'private':'net';
 }
 const PROBE_ERROR_WORDS={credentials:tr('用户名或密码不对'),turnstile:tr('面板开了人机验证：为 Assetboard 关掉，或把面板设为公开'),private:tr('面板不公开：请填写面板账号')};
 const PROBE_ERROR_ICONS={credentials:'key',turnstile:'shield',private:'user'};
 // History: CF-Server-Monitor's GET /api/history/all?id=&hours= (hours from a fixed list; anonymous reads stop at 24) gives about
 // 120 rows {timestamp, cpu, ram_used, ram_total, …}. The cards draw the last 24 hours of CPU and 内存.
 const PROBE_HISTORY_HOURS=24;
 function probeHistoryPoints(rows,limit=120){
  const list=(Array.isArray(rows)?rows:[]).map(r=>({t:num(r?.timestamp),cpu:num(r?.cpu),used:num(r?.ram_used),total:num(r?.ram_total)})).filter(r=>r.t!=null).sort((a,b)=>a.t-b.t);
  const step=Math.max(1,Math.ceil(list.length/limit)),kept=list.filter((_,i)=>i%step===0||i===list.length-1);
  const cpu=kept.filter(r=>r.cpu!=null).map(r=>({t:r.t,v:Math.min(100,Math.max(0,r.cpu))}));
  const mem=kept.filter(r=>r.used!=null&&r.total>0).map(r=>({t:r.t,v:Math.min(100,Math.max(0,r.used/r.total*100))}));
  return {cpu,mem};
 }
 function probeHistoryWords(points){
  const say=(name,list)=>{if(list.length<2)return '';const vs=list.map(p=>p.v),avg=Math.round(vs.reduce((a,b)=>a+b,0)/vs.length),max=Math.round(Math.max(...vs));return tr('{name} 平均 {avg}%，最高 {max}%',{name,avg,max});};
  return [say('CPU',points.cpu),say(tr('内存'),points.mem)].filter(Boolean).join(tr('；'));
 }
 // A sparkline's path in a w×h box: x over the time span, y from 0 (bottom) to 100 % (top), a 1 px margin so the stroke shows.
 function probeSparkPath(points,w,h){
  if(!points||points.length<2)return '';
  const t0=points[0].t,span=Math.max(1,points[points.length-1].t-t0),y=v=>(h-1-(h-2)*v/100).toFixed(1);
  return points.map((p,i)=>`${i?'L':'M'}${((p.t-t0)/span*w).toFixed(1)} ${y(p.v)}`).join('');
 }
 // Live: a batchUpdate from /api/ws carries, per server, samples whose data are the changed fields (the last one a full report).
 // They are laid over the rows read last; the time of the newest sample becomes the last report.
 function probeMergeUpdates(rows,updates){
  const byId=new Map((rows||[]).map(r=>[String(r.id),{...r}]));let changed=0;
  for(const u of Array.isArray(updates)?updates:[]){
   const row=byId.get(String(u?.serverId));if(!row||!Array.isArray(u.samples))continue;
   for(const sample of u.samples){if(!sample||typeof sample.data!=='object'||!sample.data)continue;
    for(const [k,v] of Object.entries(sample.data))if(k!=='id'&&k!=='name'&&(typeof v==='number'||typeof v==='string'))row[k]=v;
    const ts=num(sample.ts);if(ts!=null&&ts>(num(row.last_updated)||0))row.last_updated=ts;changed++;}
  }
  return {rows:[...byId.values()],changed};
 }
 // Reconnecting: 1 s, 2 s, 4 s … up to 60 s, each with jitter (half to the whole of it), so many apps do not knock at once.
 const PROBE_BACKOFF_MAX=60000;
 function probeBackoff(attempt,random=Math.random()){const base=Math.min(PROBE_BACKOFF_MAX,1000*2**Math.max(0,attempt));return Math.round(base/2+Math.max(0,Math.min(1,random))*base/2);}
 // Statuses after which the socket is not tried again until the next refresh by hand: refused (401/403), not offered (426/503).
 const PROBE_LIVE_GIVE_UP=[401,403,426,503];
 // The demo's 24 hours: smooth made-up curves, offline ones stop where the server went quiet.
 function probeDemoHistory(serverId,now=Date.now()){
  const seed=[...String(serverId)].reduce((a,c)=>a+c.charCodeAt(0),0),rows=[],quiet={cf3:47}[serverId]||0;
  for(let i=119;i>=0;i--){const t=now-i*12*60000;if(quiet&&t>now-quiet*60000)continue;const k=(119-i)/119*Math.PI*4+seed;
   rows.push({timestamp:t,cpu:Math.max(1,18+14*Math.sin(k)+6*Math.sin(k*3.1)+(seed%7)),ram_total:4096,ram_used:Math.round(4096*(0.38+0.08*Math.sin(k/2)+(seed%5)/40))});}
  return rows;
 }

 // The one kind there is, so the form never asks.
 const PROBE_KIND_DEFAULT='cfsm';
 // What the person types as the panel's address, made into its origin: https:// when no scheme is given, any path, query or
 // fragment (a pasted /admin#/admin) dropped, the host lower-cased. Empty when it cannot be a panel: another scheme, a user or
 // password in it, spaces, no host.
 function probeNormalizeUrl(text){
  let t=String(text??'').trim();if(!t||t.length>300||/\s/.test(t))return '';
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(t))t='https://'+t.replace(/^\/+/,'');
  let u;try{u=new URL(t);}catch{return '';}
  if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password)return '';
  return u.origin;
 }
 // A refused first read that an account can fix (the panel is not public); a human check (Turnstile) cannot be fixed by one.
 function probeNeedsAccount(status,reason){return reason!=='turnstile'&&reason!=='credentials'&&(status===401||status===403||reason==='private');}

 const api={PROBE_KIND_DEFAULT,probeNormalizeUrl,probeNeedsAccount,PROBE_ONLINE_MS,PROBE_KINDS,probeErrorKind,PROBE_ERROR_WORDS,PROBE_ERROR_ICONS,PROBE_HISTORY_HOURS,probeHistoryPoints,probeHistoryWords,probeSparkPath,probeMergeUpdates,PROBE_BACKOFF_MAX,probeBackoff,PROBE_LIVE_GIVE_UP,probeDemoHistory,probeServers,matchProbeServers,probeBytes,probeAgo,probeSummary,probeGauges,probeDemoAnswer,PROBE_DEMO_SOURCE};
 if(typeof module!=='undefined'&&typeof window==='undefined')module.exports=api;else root.probeData=api;
})(typeof window!=='undefined'?window:globalThis);
