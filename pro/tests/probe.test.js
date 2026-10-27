// Probe data sources (task-11): CF-Server-Monitor answers become servers, servers are matched to cards, and the words shown.
// Mock answers only, shaped like CF-Server-Monitor's GET /api/servers (API.md); no panel is called.
const test=require('node:test');
const assert=require('node:assert/strict');
const {probeServers,matchProbeServers,probeSummary,probeGauges,probeBytes,probeAgo,probeDemoAnswer,PROBE_ONLINE_MS}=require('../web/probe-data.js');
const now=Date.UTC(2026,9,23,12,0,0),MB=1024*1024,GB=1024*MB;

const cfsm=(rows,extra={})=>({servers:rows,stats:{total:rows.length},sysConfig:{},...extra});
const row=(id,name,fields={})=>({id,name,cpu:12.4,ram_used:512,ram_total:2048,disk_used:10240,disk_total:40960,net_rx_monthly:3*GB,net_tx_monthly:GB,traffic_calc_type:'total',last_updated:now-60000,ip_v4:'1',ip_v6:'0',...fields});

test('CF-Server-Monitor answers become probe servers',()=>{
 const [s]=probeServers('cfsm',cfsm([row('a1','tokyo-vps',{traffic_limit:'1000'})]),now);
 assert.equal(s.id,'a1');assert.equal(s.name,'tokyo-vps');assert.equal(s.online,true);
 assert.equal(s.cpu,12.4);
 assert.deepEqual(s.mem,{used:512*MB,total:2048*MB});assert.deepEqual(s.disk,{used:10240*MB,total:40960*MB});
 assert.equal(s.traffic,4*GB,'total = in + out this month');assert.equal(s.trafficLimit,1000*GB);
 assert.deepEqual(s.ips,[],'ip_v4/ip_v6 are reachability flags, never addresses');
 const v=probeSummary(s,now);
 assert.deepEqual([v.status,v.cpu,v.mem,v.disk,v.traffic,v.seen],['在线','12%','25%','25%','4 GB / 1000 GB','最后上报于 1 分钟前']);
});

test('offline after five minutes without a report; the newest report wins',()=>{
 const [late]=probeServers('cfsm',cfsm([row('a','x',{last_updated:now-PROBE_ONLINE_MS-1})]),now);
 assert.equal(late.online,false);assert.equal(probeSummary(late,now).status,'离线');assert.equal(probeSummary(late,now).tone,'red');
 const [fresh]=probeServers('cfsm',cfsm([row('a','x',{last_updated:now-PROBE_ONLINE_MS-1})],{latestReportUpdates:[{serverId:'a',reportTs:now-1000}]}),now);
 assert.equal(fresh.online,true);
 const [never]=probeServers('cfsm',cfsm([row('b','y',{last_updated:null})]),now);
 assert.equal(never.online,false);assert.equal(probeAgo(never.lastSeen,now),'从未上报');
});

test('traffic counts the way the panel is set to count it',()=>{
 const t=type=>probeServers('cfsm',cfsm([row('a','x',{traffic_calc_type:type,net_rx_monthly:5*GB,net_tx_monthly:2*GB})]),now)[0].traffic;
 assert.equal(t('total'),7*GB);assert.equal(t('dl'),5*GB);assert.equal(t('ul'),2*GB);assert.equal(t('max'),5*GB);
});

test('odd answers are refused or read safely',()=>{
 assert.throws(()=>probeServers('cfsm',{error:'unauthorized',code:401},now),/没有服务器列表/);
 assert.throws(()=>probeServers('nezha',cfsm([]),now),/不认识/);
 const list=probeServers('cfsm',cfsm([row('a','',{}),null,'x',row('b','ok',{cpu:'abc',ram_total:0,disk_used:null}),row('c','hot',{cpu:250})]),now);
 assert.deepEqual(list.map(s=>s.id),['b','c'],'rows without id or name are skipped');
 assert.equal(list[0].cpu,null);assert.equal(list[0].mem,null);assert.equal(list[0].disk,null);
 assert.equal(list[1].cpu,100,'clamped');
 const v=probeSummary(list[0],now);assert.equal(v.cpu,'');assert.equal(v.mem,'');
});

test('matching: IP, then hostname, then name; manual links win; ties are left to the person',()=>{
 const servers=[
  {id:'p-ip',name:'srv-a',hostnames:['a.example.net'],ips:['203.0.113.10'],online:true},
  {id:'p-host',name:'srv-b',hostnames:['b.example.net'],ips:[],online:true},
  {id:'p-name',name:'Tokyo-VPS.',hostnames:[],ips:[],online:false},
  {id:'p-tie',name:'twin',hostnames:[],ips:[],online:true},
  {id:'p-manual',name:'nas-home',hostnames:[],ips:[],online:false},
  {id:'p-v6',name:'v6-only',hostnames:[],ips:['2001:db8::10'],online:true}
 ];
 const assets=[
  {id:'s-ip',type:'server',name:'whatever',ips:['203.0.113.10']},
  {id:'s-host',type:'server',name:'box',host:'B.example.net'},
  {id:'s-name',type:'server',name:'tokyo-vps'},
  {id:'s-twin1',type:'server',name:'twin'},{id:'s-twin2',type:'server',name:'twin'},
  {id:'s-manual',type:'server',name:'home-nas',probeLink:{source:'src',id:'p-manual'}},
  {id:'s-v6',type:'server',name:'six',ips:['2001:0db8:0000::0010']},
  {id:'s-off',type:'server',name:'srv-a',probeLink:{none:true}},
  {id:'s-hidden',type:'server',name:'srv-b',hiddenAt:'2026-01-01'},
  {id:'d1',type:'domain',name:'tokyo-vps'}
 ];
 const {links,unmatched}=matchProbeServers(assets,[{id:'src',servers}]);
 const got=Object.fromEntries([...links].map(([id,x])=>[id,x.server.id+':'+x.how]));
 assert.deepEqual(got,{'s-manual':'p-manual:manual','s-ip':'p-ip:ip','s-v6':'p-v6:ip','s-host':'p-host:host','s-name':'p-name:name'});
 assert.deepEqual(unmatched.map(x=>x.server.id),['p-tie'],'two cards called twin: the person decides');
});

test('a manual link to a server that is gone is just unmatched; two sources keep their own ids',()=>{
 const assets=[{id:'s1',type:'server',name:'one',probeLink:{source:'gone',id:'x'}},{id:'s2',type:'server',name:'one'}];
 const sources=[{id:'a',servers:[{id:'1',name:'one',hostnames:[],ips:[]}]},{id:'b',servers:[{id:'1',name:'two',hostnames:[],ips:[]}]}];
 const {links,unmatched}=matchProbeServers(assets,sources);
 assert.equal(links.has('s1'),false,'a card with a link is not matched automatically');
 assert.equal(links.get('s2').source,'a');
 assert.deepEqual(unmatched.map(x=>x.source+'/'+x.server.id),['b/1']);
});

test('numbers read like people write them',()=>{
 assert.equal(probeBytes(0),'0 B');assert.equal(probeBytes(1536),'1.5 KB');assert.equal(probeBytes(118*GB),'118 GB');assert.equal(probeBytes(12.5*GB),'12.5 GB');
 assert.equal(probeAgo(now-30000,now),'刚刚');assert.equal(probeAgo(now-47*60000,now),'47 分钟前');assert.equal(probeAgo(now-3*3600000,now),'3 小时前');assert.equal(probeAgo(now-5*86400000,now),'5 天前');
});

test('the demo panel goes through the same reading and matching',()=>{
 const list=probeServers('cfsm',probeDemoAnswer(now),now);
 assert.equal(list.length,4);
 assert.deepEqual(list.map(s=>s.online),[true,true,false,true]);
 const assets=[{id:'demo-s1',type:'server',name:'tokyo-vps'},{id:'demo-s2',type:'server',name:'frankfurt-vps'},{id:'demo-s3',type:'server',name:'home-nas',probeLink:{source:'demo-probe',id:'cf3'}}];
 const {links,unmatched}=matchProbeServers(assets,[{id:'demo-probe',servers:list}]);
 assert.equal(links.size,3);assert.equal(links.get('demo-s3').server.online,false);
 assert.deepEqual(unmatched.map(x=>x.server.name),['lab-pi']);
});

test('gauges: numbers for the drawing, words for the tip and the screen reader',()=>{
 const [s]=probeServers('cfsm',cfsm([row('a1','tokyo-vps',{traffic_limit:'100'})]),now);
 const g=probeGauges(s,now);
 assert.deepEqual(g.map(x=>[x.key,x.pct,x.value,x.unit]),[['cpu',12,'12','%'],['mem',25,'25','%'],['disk',25,'25','%'],['net',4,'4 GB','']]);
 assert.deepEqual(g.map(x=>x.label),['CPU 12%','内存 25%，512 MB / 2 GB','磁盘 25%，10 GB / 40 GB','本月流量 4 GB / 100 GB（4%）']);
 // No limit: the traffic has no share to draw; unknown readings draw nothing at all.
 const [open]=probeServers('cfsm',cfsm([row('b','x',{traffic_limit:''})]),now);
 assert.equal(probeGauges(open,now).find(x=>x.key==='net').pct,null);
 const [bare]=probeServers('cfsm',cfsm([row('c','y',{cpu:null,ram_total:0,disk_total:null,net_rx_monthly:null,net_tx_monthly:null})]),now);
 assert.deepEqual(probeGauges(bare,now),[]);
 // Over the limit the bar is full, not past it.
 const [over]=probeServers('cfsm',cfsm([row('d','z',{traffic_limit:'1'})]),now);
 assert.equal(probeGauges(over,now).find(x=>x.key==='net').pct,100);
});

// ---- task-15: read-only token, history, live ------------------------------------------------------------------------------------
const fs=require('node:fs'),path=require('node:path');
const data=require('../web/probe-data.js');

test('the probe code only calls the login and the four read paths: one POST (action login), everything else GET',()=>{
 const root=path.join(__dirname,'..','..');
 // The code itself: comments out, and the Swift file up to its test double and self-test (which name refused paths on purpose).
 const code=text=>text.split('\n').filter(line=>!/^\s*\/\//.test(line)).map(line=>line.replace(/\s\/\/ .*$/,'')).join('\n');
 const swift=code(fs.readFileSync(path.join(root,'desktop','ProbeSource.swift'),'utf8').split('final class MockProbeProtocol')[0]);
 const web=code(['pro/web/probe-data.js','pro/web/probe-pro.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n'));
 const allowed=['/admin/api','/api/servers','/api/server','/api/history/all','/api/ws'];
 const named=new Set([...(swift+web).matchAll(/"(\/(?:api|admin)\/[A-Za-z0-9/_-]*)"|'(\/(?:api|admin)\/[A-Za-z0-9/_-]*)'/g)].map(m=>m[1]||m[2]));
 assert.ok(named.size>=5);
 for(const p of named)assert.ok(allowed.includes(p),`not an allowed path: ${p}`);
 assert.match(swift,/static let allowedPaths: Set<String> = \["\/admin\/api", "\/api\/servers", "\/api\/server", "\/api\/history\/all", "\/api\/ws"\]/);
 // Methods: GET for reads; the one POST is the login, built in one place with a body that is exactly the login.
 assert.deepEqual([...swift.matchAll(/httpMethod = "([A-Z]+)"/g)].map(m=>m[1]).sort(),['GET','POST']);
 assert.match(swift,/if case \.login = read \{ return "POST" \}\s*return "GET"/);
 const actions=[...swift.matchAll(/"action": "([a-z_]+)"/g)].map(m=>m[1]);
 assert.deepEqual(actions,['login'],'the only admin action is login');
 assert.match(swift,/\["action": "login", "username": login\.username, "password": login\.password\]/);
 for(const bad of ['/update','/clearHistory','/updateDatabase','"PUT"','"DELETE"','"PATCH"','save_settings','"list"','export_servers','?token=','token=\\('])assert.ok(!(swift+web).includes(bad),`probe code mentions ${bad}`);
 // The JWT and the password go in headers or the login body only, never in a URL; cookies are never kept.
 assert.ok(!/URLQueryItem\(name: "(token|auth_token|ws_token|password|username)"/.test(swift));
 assert.equal((swift.match(/httpShouldHandleCookies = false/g)||[]).length,3,'reads, login and the socket all drop cookies');
 // The page's only messages to the app are the probe actions; none carries a path.
 const sent=[...web.matchAll(/probeSend\(\{action:'([A-Za-z]+)'/g)].map(m=>m[1]);
 const allowedMessages=JSON.parse(web.match(/const PROBE_MESSAGES=(\[[^\]]*\])/)[1].replaceAll("'",'"'));
 assert.ok(sent.length>=5);for(const m of sent)assert.ok(allowedMessages.includes(m),m);
 // The socket's one outgoing message is the subscription.
 assert.equal((swift.match(/\.send\(/g)||[]).length,1);
 assert.match(swift,/"type": "subscribe", "scope": "all"/);
});

test('refusals: a wrong account, a human check, a private panel, each with short words and an icon',()=>{
 assert.equal(data.probeErrorKind(401,'credentials'),'credentials');assert.equal(data.probeErrorKind(403,'turnstile'),'turnstile');
 assert.equal(data.probeErrorKind(401,'private'),'private');assert.equal(data.probeErrorKind(401,''),'private');
 assert.equal(data.probeErrorKind(0,'net'),'net');assert.equal(data.probeErrorKind(500),'net');
 assert.match(data.PROBE_ERROR_WORDS.credentials,/用户名或密码/);assert.match(data.PROBE_ERROR_WORDS.turnstile,/人机验证/);assert.match(data.PROBE_ERROR_WORDS.private,/账号/);
 for(const k of ['credentials','turnstile','private'])assert.ok(data.PROBE_ERROR_ICONS[k],k);
 assert.equal(data.PROBE_KINDS.cfsm.account,true);assert.match(data.PROBE_KINDS.cfsm.credential,/钥匙串/);
 assert.ok(!/READ_TOKEN|JWT|完整管理权限/.test(data.PROBE_KINDS.cfsm.credential),'no token copy left');
});

test('history: rows become CPU and 内存 points, sorted, thinned, clamped; words give average and peak',()=>{
 const rows=[{timestamp:3000,cpu:150,ram_used:2048,ram_total:4096},{timestamp:1000,cpu:10,ram_used:1024,ram_total:4096},{timestamp:2000,cpu:null,ram_used:5,ram_total:0},{cpu:5}];
 const p=data.probeHistoryPoints(rows);
 assert.deepEqual(p.cpu,[{t:1000,v:10},{t:3000,v:100}]);
 assert.deepEqual(p.mem,[{t:1000,v:25},{t:3000,v:50}]);
 assert.equal(data.probeHistoryWords(p),'CPU 平均 55%，最高 100%；内存 平均 38%，最高 50%');
 const many=Array.from({length:500},(_,i)=>({timestamp:i*1000,cpu:i%100,ram_used:1,ram_total:2}));
 const thin=data.probeHistoryPoints(many);
 assert.ok(thin.cpu.length<=121&&thin.cpu.length>=100,'thinned to about 120 points: '+thin.cpu.length);
 assert.equal(thin.cpu.at(-1).t,499000,'the newest point stays');
 assert.deepEqual(data.probeHistoryPoints(null),{cpu:[],mem:[]});
 assert.equal(data.probeHistoryWords({cpu:[{t:1,v:5}],mem:[]}),'','one point says nothing');
});

test('sparkline path: time across, 0–100 % up the box, nothing for fewer than two points',()=>{
 assert.equal(data.probeSparkPath([{t:0,v:0},{t:10,v:100}],100,20),'M0.0 19.0L100.0 1.0');
 assert.equal(data.probeSparkPath([{t:0,v:50},{t:5,v:50},{t:10,v:50}],10,12),'M0.0 6.0L5.0 6.0L10.0 6.0');
 assert.equal(data.probeSparkPath([{t:0,v:5}],10,10),'');assert.equal(data.probeSparkPath([],10,10),'');
});

test('live updates lay changed fields over the last rows; the newest sample is the last report',()=>{
 const rows=[{id:'a',name:'tokyo',cpu:10,ram_used:100,last_updated:1000},{id:'b',name:'paris',cpu:5,last_updated:1000}];
 const r=data.probeMergeUpdates(rows,[{serverId:'a',samples:[{ts:2000,data:{cpu:20}},{ts:3000,data:{cpu:30,ram_used:200,name:'evil',nested:{x:1}}}]},{serverId:'zzz',samples:[{ts:9,data:{cpu:1}}]},{serverId:'b',samples:'no'}]);
 assert.equal(r.changed,2);
 const a=r.rows.find(x=>x.id==='a');
 assert.deepEqual([a.cpu,a.ram_used,a.last_updated,a.name,a.nested],[30,200,3000,'tokyo',undefined],'numbers and strings merge; id, name and objects do not');
 assert.equal(rows[0].cpu,10,'the input rows are not changed');
 assert.equal(r.rows.find(x=>x.id==='b').cpu,5);
 assert.equal(data.probeMergeUpdates(rows,null).changed,0);
 // Merged rows read back through the same reading as a full list.
 const [s]=data.probeServers('cfsm',{servers:[{...a,ram_total:400}]},3000+1000);
 assert.equal(s.cpu,30);assert.equal(s.online,true);assert.equal(s.mem.used/s.mem.total,.5);
});

test('reconnecting backs off 1 s, 2 s, 4 s … to 60 s, with jitter between half and all of it',()=>{
 assert.equal(data.probeBackoff(0,0),500);assert.equal(data.probeBackoff(0,1),1000);
 assert.equal(data.probeBackoff(1,1),2000);assert.equal(data.probeBackoff(2,1),4000);assert.equal(data.probeBackoff(3,.5),6000);
 assert.equal(data.probeBackoff(10,1),60000);assert.equal(data.probeBackoff(30,0),30000,'capped before the jitter');
 for(let i=0;i<200;i++){const n=i%12,d=data.probeBackoff(n);const base=Math.min(60000,1000*2**n);assert.ok(d>=base/2&&d<=base,`${n}: ${d}`);}
 assert.equal(data.probeBackoff(-3,1),1000);assert.equal(data.probeBackoff(2,7),4000,'random is clamped');
 assert.deepEqual(data.PROBE_LIVE_GIVE_UP,[401,403,426,503]);
});

test('the demo has 24 hours of history for its servers; the offline one stops where it went quiet',()=>{
 const now=Date.UTC(2026,9,23,12),on=data.probeDemoHistory('cf1',now),off=data.probeDemoHistory('cf3',now);
 assert.equal(on.length,120);assert.ok(on.at(-1).timestamp===now&&on[0].timestamp===now-119*12*60000);
 assert.ok(off.at(-1).timestamp<=now-47*60000&&off.length<120);
 const p=data.probeHistoryPoints(on);assert.ok(p.cpu.length===120&&p.mem.length===120&&p.cpu.every(x=>x.v>0&&x.v<=100));
});

test('the panel address: https added, path and fragment dropped, nonsense refused',()=>{
 const n=data.probeNormalizeUrl;
 assert.equal(n('status.example.com'),'https://status.example.com');
 assert.equal(n('  https://status.example.com/admin#/admin  '),'https://status.example.com');
 assert.equal(n('HTTPS://Status.Example.COM/'),'https://status.example.com');
 assert.equal(n('http://192.0.2.5:8080/x/y?z=1'),'http://192.0.2.5:8080');
 assert.equal(n('panel.example.org:8443/dashboard'),'https://panel.example.org:8443');
 assert.equal(n('https://status.example.com:443'),'https://status.example.com');
 assert.equal(n('[2001:db8::1]:9000'),'https://[2001:db8::1]:9000');
 for(const bad of ['','   ','ftp://status.example.com','https://user:pw@status.example.com','user:pw@status.example.com','javascript:alert(1)','not a host','https://','x'.repeat(301)])assert.equal(n(bad),'',JSON.stringify(bad));
 assert.equal(data.PROBE_KIND_DEFAULT,'cfsm');assert.ok(data.PROBE_KINDS[data.PROBE_KIND_DEFAULT]);
});

test('a first read that asks for an account opens the account fields; a human check does not',()=>{
 assert.equal(data.probeNeedsAccount(401,'private'),true);assert.equal(data.probeNeedsAccount(401,''),true);assert.equal(data.probeNeedsAccount(403,'net'),true);
 assert.equal(data.probeNeedsAccount(403,'turnstile'),false,'an account cannot pass Turnstile');
 assert.equal(data.probeNeedsAccount(401,'credentials'),false,'already asked: the words say what is wrong');
 assert.equal(data.probeNeedsAccount(0,'net'),false);assert.equal(data.probeNeedsAccount(500,'net'),false);
});
