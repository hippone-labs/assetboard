// The object panorama's derivations (panorama-objects.js): what each category is drawn as, where a domain hangs, state from the
// date and from a reading, the zones, and the 正在做 screen from readings in coding-sessions.js's shape.
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../asset-data.js'),O=require('../panorama-objects.js');
const day=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const TYPES=['domain','repository','server','deployment','storage','database','subscription','ai','license','bankcard','phone','appleid','google'];
function board(){
 const a=[
  {id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',ips:['203.0.113.10'],date:day(10),dateKind:'renew'},
  {id:'s2',type:'server',name:'home-nas',provider:'自建',ips:['192.0.2.20']},
  {id:'s3',type:'server',name:'osaka-vps',provider:'Vultr',ips:['198.51.100.24'],stopped:true,date:day(-3),dateKind:'renew'},
  {id:'db1',type:'database',name:'postgres-main',links:['s1']},{id:'st1',type:'storage',name:'photo-archive',links:['dp1']},{id:'dp1',type:'deployment',name:'notes-web'},
  {id:'d1',type:'domain',name:'a.example.com',provider:'Namecheap',date:day(12),dateKind:'expire'},
  {id:'d2',type:'domain',name:'b.example.org',provider:'Namecheap'},
  {id:'d3',type:'domain',name:'c.example.net',provider:'Cloudflare',date:day(-2),dateKind:'expire'},
  {id:'d4',type:'domain',name:'d.example.dev',dnsHost:'Cloudflare'},
  {id:'d5',type:'domain',name:'e.example.io'},
  {id:'d6',type:'domain',name:'f.example.app',provider:'Porkbun',hiddenAt:'2026-01-01T00:00:00Z'},
  {id:'u1',type:'subscription',name:'Notes Pro',date:day(200),dateKind:'renew',cycle:'yearly'},{id:'a1',type:'ai',name:'AI Pro'},{id:'l1',type:'license',name:'Pixel Editor'},
  {id:'c1',type:'bankcard',name:'Visa',last4:'4242'},{id:'p1',type:'phone',name:'Number',phone:'+1 555 010 0199'},
  {id:'ap1',type:'appleid',name:'Apple ID'},{id:'g1',type:'google',name:'Google'},
  {id:'r1',type:'repository',name:'acme-labs/atlas-ui'}
 ];
 return a.map(x=>({links:[],...x}));
}

test('every category has its own shape; a server is a rack in the cloud and a tower at home',()=>{
 const shapes=TYPES.map(type=>O.objectShape({type,ips:['203.0.113.1']}));
 assert.ok(shapes.every(Boolean),'a shape for every category: '+shapes.join());
 assert.equal(new Set(shapes).size,TYPES.length,'no two categories share a shape');
 assert.deepEqual(Object.keys(O.OBJECT_SHAPES).sort(),[...TYPES].sort());
 const place=a=>O.serverPlace({type:'server',...a});
 assert.equal(place({ips:['203.0.113.10']}),'cloud');
 assert.equal(place({ips:['203.0.113.10','10.0.0.5']}),'cloud','one public address is enough to be in the cloud');
 assert.equal(place({ips:['192.168.1.20','10.0.0.5']}),'local','only inner addresses');
 assert.equal(place({host:'192.168.1.20'}),'local','the host stands in when no address is stored');
 assert.equal(place({host:'nas.local'}),'local');assert.equal(place({host:'localhost'}),'local');assert.equal(place({host:'box.example.com'}),'cloud');
 for(const provider of ['自建','Self-hosted','Home lab','本机','local'])assert.equal(place({provider,ips:['203.0.113.10']}),'local',provider);
 assert.equal(place({provider:'Homeric Cloud',ips:['203.0.113.10']}),'cloud','a word that only starts like one is not it');
 assert.equal(place({}),'cloud');
 assert.equal(O.objectShape({type:'server',ips:['10.0.0.2']}),'tower');assert.equal(O.objectShape({type:'server',ips:['203.0.113.2']}),'rack');
 assert.equal(O.objectShape({type:'device'}),'','a category this drawing does not know has no shape');
});

test('a domain hangs under its registrar, else its DNS host; only Cloudflare is a cloud',()=>{
 assert.deepEqual(O.domainHome({provider:'Cloudflare'}),{key:'cloudflare',name:'Cloudflare',cloud:true});
 assert.deepEqual(O.domainHome({provider:' Name Cheap ',dnsHost:'Cloudflare'}),{key:'namecheap',name:'Name Cheap',cloud:false},'the registrar wins over the DNS host');
 assert.equal(O.domainHome({dnsHost:'Cloudflare'}).cloud,true);
 assert.deepEqual(O.domainHome({}),{key:'',name:'',cloud:false});
 const zone=O.buildObjects(board()).zones.find(z=>z.key==='domain');
 assert.deepEqual(zone.groups.map(g=>[g.name,g.cloud,g.items.map(o=>o.id).join()]),[['Cloudflare',true,'d3,d4'],['Namecheap',false,'d1,d2'],['',false,'d5']],'the cloud first, then registrars, then the domains with none; a hidden domain is in no group');
 assert.deepEqual(zone.items.map(o=>o.id),['d3','d4','d1','d2','d5'],'the zone lists them in the order they are drawn');
});

test('state: amber when due soon, red when overdue, green only from a reading, nothing once stopped',()=>{
 const st=(a,live)=>O.objectState({type:'server',...a},{live});
 assert.equal(st({}).tone,'');assert.equal(st({date:day(200),dateKind:'expire'}).tone,'');
 assert.equal(st({date:day(12),dateKind:'expire'}).tone,'amber');assert.equal(st({date:day(-2),dateKind:'expire'}).tone,'red');
 assert.equal(st({},{text:'在线',tone:'',online:true}).tone,'green','a reading that says up lights green');
 assert.equal(st({}).live,null,'no reading, no green');
 assert.equal(st({},{text:'离线',tone:'red',online:false}).tone,'red');
 assert.equal(st({},{text:'在线',tone:'amber',online:true}).tone,'amber','up but tight');
 assert.equal(st({date:day(12),dateKind:'expire'},{text:'在线',tone:'',online:true}).tone,'amber','the date still counts under a good reading');
 assert.equal(st({date:day(-2),dateKind:'expire'},{text:'在线',tone:'amber',online:true}).tone,'red','the worse of the two');
 const stopped=st({stopped:true,date:day(-2),dateKind:'expire'},{text:'离线',tone:'red',online:false});
 assert.deepEqual([stopped.tone,stopped.dateTone,stopped.stopped,stopped.live],['','',true,null],'a stopped record has no tone and no reading');
 assert.match(st({date:day(12),dateKind:'expire'}).label,/12/);
});

test('the scene: every visible asset once, in zones, with its host and a tally',()=>{
 const assets=board(),m=O.buildObjects(assets,{live:a=>a.id==='s1'?{text:'在线',tone:'',online:true}:a.id==='db1'?{text:'已暂停',tone:'red',online:false}:null});
 assert.deepEqual(m.zones.map(z=>z.key),['server','data','domain','wallet','id','pass','repository']);
 const ids=O.objectOrder(m),visible=assets.filter(a=>!a.hiddenAt).map(a=>a.id);
 assert.equal(m.total,visible.length);assert.deepEqual([...ids].sort(),[...visible].sort(),'nothing visible is left out, nothing is drawn twice');
 const by=id=>m.zones.flatMap(z=>z.items).find(o=>o.id===id);
 assert.deepEqual(m.zones[0].items.map(o=>o.id+':'+o.shape),['s1:rack','s3:rack','s2:tower'],'racks first, then the towers');
 assert.deepEqual(m.zones[1].items.map(o=>o.shape),['drum','bucket','container']);
 assert.deepEqual(m.zones.find(z=>z.key==='pass').items.map(o=>o.shape),['ticket','pass','deed']);
 assert.deepEqual(by('db1').hosts.map(h=>h.id),['s1'],'a database knows the server it sits on');
 assert.deepEqual(by('st1').hosts.map(h=>h.id),['dp1'],'a bucket the deployment service');
 assert.deepEqual(by('d1').hosts,[]);assert.equal(by('d1').home.name,'Namecheap');
 assert.deepEqual([by('s1').tone,by('db1').tone,by('s3').tone,by('s3').stopped],['amber','red','',true],'s1 is up but due in 10 days; the database is read as down; the stopped server has no tone');
 assert.equal(m.live,2,'two objects carry a reading');
 assert.deepEqual(m.tally,{red:2,amber:2,off:1,ok:m.total-5},'red: the paused database and the expired domain; amber: s1 and the domain due in 12 days');
 assert.deepEqual(O.buildObjects([]).zones,[],'an empty board has no zones');
 const ordered=O.buildObjects(assets,{cardOrder:{domain:['d2']}}).zones.find(z=>z.key==='domain').groups.find(g=>g.key==='namecheap');
 assert.deepEqual(ordered.items.map(o=>o.id),['d2','d1'],'the wall\'s own order is kept inside a group');
});

test('the scene needs room: narrow or short windows draw cards',()=>{
 assert.equal(O.objectsRoom(O.OBJECT_MIN_W,O.OBJECT_MIN_H),true);
 assert.equal(O.objectsRoom(O.OBJECT_MIN_W-1,2000),false);assert.equal(O.objectsRoom(2000,O.OBJECT_MIN_H-1),false);
 assert.deepEqual(O.OBJECT_TIERS,[1.4,1.25,1.12,1,.86]);
});

const now=Date.parse('2026-11-18T08:00:00Z'),at=minutes=>new Date(now-minutes*60000).toISOString();
const session=(tool,repo,started,active,extra={})=>({tool,pid:100+started,repo,branch:'main',detached:false,path:repo?'~/projects/'+repo:'',startedAt:at(started),activeAt:active==null?'':at(active),tracked:active!=null,...extra});
const reading=(sessions,host={id:'local',kind:'local',name:''})=>({host,at:at(0),sessions});

test('正在做: no reading or no session is the empty state',()=>{
 const empty={total:0,active:0,lines:[],more:0,host:''};
 assert.deepEqual(O.workScreen([],{now}),empty);assert.deepEqual(O.workScreen(null,{now}),empty);assert.deepEqual(O.workScreen(undefined,{now}),empty);
 assert.deepEqual(O.workScreen([reading([])],{now}),empty);
 assert.deepEqual(O.workScreen([{host:{id:'local',kind:'local',name:''},at:at(0)}],{now}),empty,'a reading without a session list');
 assert.deepEqual(O.workScreen([reading([session('claude','atlas-ui',5,1)],{id:'m2',kind:'mac',name:'mini'})],{now}),empty,'another machine\'s sessions are not this Mac\'s');
});

test('正在做: a line per tool with its leading session, summed as codingSummary sums',()=>{
 const r=reading([session('claude','notes-api',135,47),session('claude','atlas-ui',38,.5),session('codex','pixel-kit',12,1),session('cursor','',260,null)]);
 const s=O.sessionSummary([r],now);
 assert.deepEqual([s.total,s.active,s.idle,s.hosts],[4,2,1,1]);
 assert.deepEqual(s.tools.map(t=>[t.id,t.name,t.count,t.active,t.idle]),[['claude','Claude Code',2,1,1],['codex','Codex',1,1,0],['cursor','Cursor',1,0,0]]);
 assert.deepEqual(s.tools[0].sessions.map(x=>[x.repo,x.state,x.minutes,x.host]),[['atlas-ui','active',38,'local'],['notes-api','idle',135,'local']],'the busy session leads');
 assert.equal(s.tools[2].sessions[0].state,'running','a tool whose files are not followed is only running');
 const w=O.workScreen([r],{now});
 assert.deepEqual(w,{total:4,active:2,more:0,host:'',lines:[{id:'claude',name:'Claude Code',count:2,repo:'atlas-ui',minutes:38},{id:'codex',name:'Codex',count:1,repo:'pixel-kit',minutes:12},{id:'cursor',name:'Cursor',count:1,repo:'',minutes:260}]});
 assert.deepEqual(O.workScreen(r,{now}).total,4,'one reading, not in a list');
 const capped=O.workScreen([reading([session('claude','a',1,0),session('codex','b',2,0),session('cursor','',3,null),session('grok','d',4,null)])],{now,cap:3});
 assert.deepEqual([capped.lines.length,capped.more],[3,1],'three lines, the rest counted');
 assert.equal(O.workScreen([reading([session('claude','a',0,null,{startedAt:''})])],{now}).lines[0].minutes,null,'no start time, no minutes');
 assert.equal(O.sessionSummary([reading([session('newtool','x',3,1)])],now).tools[0].name,'newtool','a tool this file has no name for keeps its id');
});

test('正在做: the page\'s own codingSummary is used when it is handed in',()=>{
 const seen=[],summary=(readings,t)=>{seen.push([readings.length,t]);return {total:2,active:1,idle:1,hosts:1,tools:[{id:'claude',name:'Claude Code',count:2,active:1,idle:1,sessions:[{repo:'atlas-ui',minutes:7,state:'active'},{repo:'notes-api',minutes:90,state:'idle'}]}]};};
 const w=O.workScreen([reading([session('claude','ignored',1,0)]),reading([session('codex','remote',1,0)],{id:'srv',kind:'server',name:'tokyo'})],{now,summary});
 assert.deepEqual(seen,[[1,now]],'it is given this machine\'s readings only, and the time');
 assert.deepEqual(w.lines,[{id:'claude',name:'Claude Code',count:2,repo:'atlas-ui',minutes:7}]);
 assert.deepEqual(O.workScreen([reading([session('claude','a',1,0)])],{now,summary:()=>({total:0,tools:[]})}).total,0);
});

test('the Mac is a laptop unless a hint names a desktop',()=>{
 assert.equal(O.macForm(),'laptop');assert.equal(O.macForm('',undefined),'laptop');assert.equal(O.macForm('studio-mbp.local'),'laptop','a laptop named after a room');
 assert.equal(O.macForm('Demo MacBook Pro'),'laptop');
 for(const name of ['Mac mini','home-macmini','Mac Studio','iMac','Mac Pro'])assert.equal(O.macForm('',name),'mini',name);
});
