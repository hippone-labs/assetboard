// SSH 直读: the fixed read-only command, the reading of what it prints (a made-up Linux host in fixtures/ssh-linux.txt, shaped like a
// real one), sessions with rates and backoff, the probe server it becomes and its place after the panels. No ssh is run.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const d=require('../web/probe-ssh-data.js');
const {matchProbeServers,probeGauges,probeSummary}=require('../web/probe-data.js');
const sample=fs.readFileSync(path.join(__dirname,'fixtures/ssh-linux.txt'),'utf8');
const KB=1024,now=Date.UTC(2026,9,23,12,0,0);

test('the command is the one in the Mac app, word for word',()=>{
 const swift=fs.readFileSync(path.join(__dirname,'../../desktop/SSHProbe.swift'),'utf8');
 const command=/static let remoteCommand = "([^"]*)"/.exec(swift)?.[1];
 assert.equal(command,d.SSH_PROBE_COMMAND);
 const options=/static let options: \[String\] = \[([^\]]*)\]/.exec(swift)?.[1];
 assert.deepEqual(JSON.parse(`[${options.replace(/\s+/g,' ')}]`),d.SSH_PROBE_OPTIONS);
});

test('the command only reads: a fixed list, no sudo, no writing, no installing, no downloading',()=>{
 const c=d.SSH_PROBE_COMMAND;
 assert.match(c,/^env LC_ALL=C sh -c '[^']*'$/,'one quoted script, nothing outside it');
 const script=c.slice(c.indexOf("'")+1,-1);
 const steps=script.split('; ').map(s=>s.trim());
 // Every step is an echo of a section mark or one of these reads.
 const allowed=['uname -sm','head -n 1 /proc/stat','sleep 1','getconf _NPROCESSORS_ONLN','cat /proc/meminfo','df -P -k /','cat /proc/net/dev','cat /proc/uptime','cat /proc/loadavg'];
 for(const step of steps)assert.ok(/^echo @@[a-z0-9]+$/.test(step)||allowed.includes(step),'unexpected step: '+step);
 assert.deepEqual(steps.filter(s=>!s.startsWith('echo ')),['uname -sm','head -n 1 /proc/stat','sleep 1','head -n 1 /proc/stat','getconf _NPROCESSORS_ONLN','cat /proc/meminfo','df -P -k /','cat /proc/net/dev','cat /proc/uptime','cat /proc/loadavg']);
 for(const bad of [/sudo/,/>/,/</,/\|/,/&/,/\brm\b/,/\btee\b/,/curl/,/wget/,/\bapt/,/\byum\b/,/\bdnf\b/,/\bpip\b/,/install/,/\bchmod\b/,/\bmv\b/,/\bcp\b/,/\bdd\b/,/`/,/\$/,/\\/,/\bsu\b/,/\bkill/,/\bnc\b/,/\bbash\b/])
  assert.doesNotMatch(c,bad,'the command has '+bad);
 // ssh itself: batch mode, a short connect timeout, host keys never accepted or written from here.
 const o=d.SSH_PROBE_OPTIONS.join(' ');
 assert.match(o,/BatchMode=yes/);assert.match(o,/ConnectTimeout=\d+/);assert.match(o,/UpdateHostKeys=no/);
 assert.doesNotMatch(o,/StrictHostKeyChecking|accept-new|UserKnownHostsFile|ProxyCommand|LocalCommand=(?!no)/i);
 assert.match(d.sshCommandLine('box'),/^\/usr\/bin\/ssh -o BatchMode=yes .* -- box "env LC_ALL=C/);
 assert.equal(d.SSH_PROBE_STEPS.length,8);
});

test('a Linux host is read: CPU from two samples, memory, the root disk, interfaces without loopback, uptime, load',()=>{
 const p=d.parseSshProbe(sample);
 assert.equal(p.supported,true);assert.equal(p.os,'Linux');assert.equal(p.arch,'x86_64');
 assert.equal(Math.round(p.cpu*10)/10,89.1,'(101 - 11 idle) / 101 ticks');
 assert.deepEqual(p.mem,{used:(4013364-740724)*KB,total:4013364*KB},'used = total - available');
 assert.deepEqual(p.disk,{used:7542188*KB,total:(7542188+2012480)*KB},'as df counts its capacity');
 assert.deepEqual(p.net,{rx:17284208546,tx:11516046893},'lo is left out');
 assert.equal(p.uptime,262904.83);assert.deepEqual(p.load,[6.52,5.4,7.54]);assert.equal(p.cores,2);
});

test('not Linux, cut short or garbage: said, not guessed',()=>{
 assert.deepEqual(d.parseSshProbe('@@uname\nDarwin arm64\n@@stat1\n@@end\n'),{supported:false,os:'Darwin',arch:'arm64'});
 assert.equal(d.parseSshProbe('@@uname\nFreeBSD amd64\n').supported,false);
 assert.throws(()=>d.parseSshProbe('bash: line 1: oops'),/读不到/);
 assert.throws(()=>d.parseSshProbe(sample.split('@@df')[0]),/不完整/);
 const odd=d.parseSshProbe('@@uname\nLinux aarch64\n@@stat1\ncpu x\n@@stat2\n@@meminfo\nMemTotal: 0 kB\n@@df\n@@netdev\n@@uptime\n@@loadavg\n@@nproc\nn/a\n@@end\n');
 assert.deepEqual([odd.cpu,odd.mem,odd.disk,odd.net,odd.load,odd.cores],[null,null,null,null,null,null]);
 // Old kernels without MemAvailable; a mount point with a space; container and bridge interfaces left out.
 const older=d.parseSshProbe(sample.replace(/MemAvailable:.*\n/,'').replace(/\/dev\/sda1.*/,'/dev/mapper/root vg 100 40 60 40% /')
  .replace('@@uptime','docker0: 999 1 0 0 0 0 0 0 999 1 0 0 0 0 0 0\nveth12ab: 5 1 0 0 0 0 0 0 5 1 0 0 0 0 0 0\n@@uptime'));
 assert.deepEqual(older.mem,{used:(4013364-231072-5840-1922068)*KB,total:4013364*KB});
 assert.deepEqual(older.disk,{used:40*KB,total:100*KB});
 assert.deepEqual(older.net,{rx:17284208546,tx:11516046893});
});

test('sessions: the rate comes from two readings, history is capped, a reboot gives no rate',()=>{
 const later=sample.replace('17284208546','17294208546').replace('11516046893','11517046893').replace('262904.83','262964.83');
 let h=d.sshSession('box');
 h=d.sshRecord(h,{output:sample,at:now},now);
 assert.equal(h.rate,null,'one reading has no rate');assert.equal(h.history.length,1);assert.equal(h.lastOk,now);
 h=d.sshRecord(h,{output:later,at:now+60000},now+60000);
 assert.deepEqual(h.rate,{rx:10000000/60,tx:1000000/60});
 assert.equal(Math.round(h.history[1].net),Math.round(11000000/60));
 const rebooted=d.sshRecord(h,{output:sample.replace('262904.83','30.00'),at:now+120000},now+120000);
 assert.equal(rebooted.rate,null);
 let long=d.sshSession('box');for(let i=0;i<d.SSH_HISTORY+5;i++)long=d.sshRecord(long,{output:sample,at:now+i*1000},now);
 assert.equal(long.history.length,d.SSH_HISTORY);
 assert.equal(h.history.length,2,'the old session is left as it was');
});

test('failures: backoff doubles, hosts that need the person wait longest, a skipped host shows nothing',()=>{
 const ms=60000;let h=d.sshSession('box');
 assert.equal(d.sshDue(h,now,ms),true,'never tried: ask');
 h={...h,pending:true,tried:now};assert.equal(d.sshDue(h,now+90000,ms),false,'one request at a time');
 assert.equal(d.sshDue(h,now+130000,ms),true,'a lost request counts as done');
 h=d.sshRecord({...h,tried:now},{reason:'down',error:'Operation timed out'},now);
 assert.equal(h.fails,1);assert.equal(d.sshDue(h,now+ms,ms),false);assert.equal(d.sshDue(h,now+2*ms,ms),true);
 const down=d.sshServer(h,{name:'box',host:'203.0.113.5'},now,ms);
 assert.equal(down.online,false,'cannot be reached: offline');assert.deepEqual(down.ips,['203.0.113.5']);assert.match(down.error,/连不上/);
 for(const reason of ['hostkey','auth','unsupported']){
  const blocked=d.sshRecord({...d.sshSession('edge'),tried:now},{reason,error:'x'},now);
  assert.equal(d.sshServer(blocked,{name:'edge',host:'edge.example.net'},now,ms),null,reason+': skipped');
  assert.equal(d.sshDue(blocked,now+10*ms,ms),false);assert.equal(d.sshDue(blocked,now+16*ms,ms),true);
 }
 assert.match(d.sshProblem({alias:'edge',reason:'hostkey'}),/先在终端里连一次 ssh edge/);
 assert.match(d.sshProblem({alias:'edge',reason:'auth'}),/先在终端里连一次/);
 assert.match(d.sshProblem({alias:'mac',reason:'unsupported',error:'Darwin'}),/不支持/);
 const mac=d.sshRecord(d.sshSession('mac'),{output:'@@uname\nDarwin arm64\n@@end\n'},now);
 assert.equal(mac.reason,'unsupported');
});

test('a host becomes a probe server, drawn with the same gauges; fresh while read within three intervals',()=>{
 const ms=60000;let h=d.sshRecord(d.sshSession('Build-Box'),{output:sample,at:now-ms},now-ms);
 h=d.sshRecord(h,{output:sample.replace('17284208546','17284268546'),at:now},now);
 const s=d.sshServer(h,{name:'Build-Box',host:'Build.Example.NET.'},now,ms);
 assert.equal(s.id,'Build-Box');assert.deepEqual(s.hostnames,['build-box','build.example.net']);assert.deepEqual(s.ips,[]);
 assert.equal(s.online,true);assert.equal(s.history.length,2);
 const g=probeGauges(s,now);
 assert.deepEqual(g.map(x=>x.key),['cpu','mem','disk','net']);
 assert.equal(g[3].value,'1000 B/s');assert.match(g[3].label,/网速 ↓ 1000 B\/s ↑ 0 B\/s/);
 assert.equal(probeSummary(s,now).diskPct,79);
 assert.equal(d.sshServer(h,{},now+3*ms+1,ms).online,false,'old readings are offline');
});

test('matching: an SSH host finds its card by alias, HostName or IP; a panel takes a card first (as probe-pro.js runs it)',()=>{
 const ms=60000,read=(alias)=>d.sshRecord(d.sshSession(alias),{output:sample,at:now},now);
 const ssh=[d.sshServer(read('build-box'),{name:'build-box',host:'198.51.100.77'},now,ms),d.sshServer(read('tokyo'),{name:'tokyo',host:'203.0.113.10'},now,ms),
  d.sshServer(read('db'),{name:'db',host:'db.example.net'},now,ms)];
 const assets=[{id:'s1',type:'server',name:'tokyo-vps',ips:['203.0.113.10']},{id:'s4',type:'server',name:'whatever',ips:['198.51.100.77']},
  {id:'s5',type:'server',name:'database',host:'db.example.net'}];
 const panel=matchProbeServers(assets,[{id:'cf',servers:[{id:'a',name:'tokyo-vps',hostnames:[],ips:[]}]}]);
 const rest=matchProbeServers(assets.filter(a=>!panel.links.has(a.id)),[{id:'ssh',servers:ssh}]);
 assert.equal(panel.links.get('s1').source,'cf');
 assert.deepEqual(Object.fromEntries([...rest.links].map(([id,x])=>[id,x.server.id+':'+x.how])),{s4:'build-box:ip',s5:'db:host'});
 assert.deepEqual(rest.unmatched.map(x=>x.server.id),['tokyo'],'the panel wins the card both could have');
});

test('the demo goes through the same reading',()=>{
 for(let tick=0;tick<30;tick++){const p=d.parseSshProbe(d.sshDemoOutput('frankfurt-vps',tick).output);assert.ok(p.cpu>=0&&p.cpu<=100&&p.mem&&p.disk&&p.net);}
 assert.equal(d.parseSshProbe(d.sshDemoOutput('mac-mini',1).output).supported,false);
 assert.equal(d.sshDemoOutput('edge-01',1).reason,'hostkey');
 assert.ok(d.SSH_DEMO_ENABLED.every(a=>d.SSH_DEMO_CONFIG.includes('Host '+a)));
 assert.doesNotMatch(d.SSH_DEMO_CONFIG,/\b(?!(198\.51\.100|203\.0\.113)\.)\d+\.\d+\.\d+\.\d+\b/,'documentation addresses only');
});

test('done for the person: hosts whose card is found are turned on, except those switched off by hand or shown by a panel',()=>{
 const hosts=[{name:'box',host:'198.51.100.7'},{name:'edge',host:'Edge.Example.NET.'},{name:'build',host:'198.51.100.8'},{name:'old',host:'198.51.100.9'},
  {name:'tokyo',host:'203.0.113.10'},{name:'none',host:'198.51.100.60'},{name:'twin',host:'198.51.100.70'},{name:'gone',host:'198.51.100.80'}];
 const assets=[{id:'c1',type:'server',name:'whatever',ips:['198.51.100.7']},{id:'c2',type:'server',name:'edge-node',host:'edge.example.net'},
  {id:'c3',type:'server',name:'build',source:'ssh',externalId:'build'},{id:'c4',type:'server',name:'old',ips:['198.51.100.9']},
  {id:'c5',type:'server',name:'tokyo-vps',ips:['203.0.113.10']},{id:'c6',type:'server',name:'a',ips:['198.51.100.70']},{id:'c7',type:'server',name:'b',ips:['198.51.100.70']},
  {id:'c8',type:'server',name:'hidden',ips:['198.51.100.80'],hiddenAt:'2026-01-01'},{id:'d1',type:'domain',name:'none'}];
 assert.equal(d.sshCardFor(hosts[0],assets).id,'c1','by IP');
 assert.equal(d.sshCardFor(hosts[1],assets).id,'c2','by HostName');
 assert.equal(d.sshCardFor(hosts[2],assets).id,'c3','by alias');
 assert.equal(d.sshCardFor(hosts[6],assets),null,'two cards: left to the person');
 assert.equal(d.sshCardFor(hosts[7],assets),null,'hidden cards are left out');
 const on=d.sshAutoAliases(hosts,assets,{enabled:['BOX'],disabled:['old'],covered:new Set(['c5'])});
 assert.deepEqual(on,['edge','build'],'not one already on, switched off by hand, shown by a panel, with no card or with two');
});
