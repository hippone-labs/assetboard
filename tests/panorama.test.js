const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../asset-data.js'),P=require('../panorama.js');
const day=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const ago=n=>new Date(Date.now()-n*86400000).toISOString();
function board(){
 const a=[
  {id:'s1',type:'server',name:'tokyo',updatedAt:ago(2),ips:['203.0.113.10','2001:db8::10'],date:day(10),dateKind:'renew'},
  {id:'s2',type:'server',name:'osaka',updatedAt:ago(9),ips:['198.51.100.24'],date:day(-1),dateKind:'renew'},
  {id:'s3',type:'server',name:'nas',updatedAt:ago(30),ips:['192.168.1.20']},
  {id:'s4',type:'server',name:'frankfurt',updatedAt:ago(5),ips:['198.51.100.9'],date:day(200),dateKind:'renew'},
  {id:'u1',type:'subscription',name:'Vultr',updatedAt:ago(1),date:day(5),dateKind:'renew'},{id:'u2',type:'subscription',name:'Hetzner',updatedAt:ago(1)},
  ...Array.from({length:6},(_,i)=>({id:'d'+i,type:'domain',name:'d'+i+'.test',updatedAt:ago(i+1)})),
  ...Array.from({length:4},(_,i)=>({id:'r'+i,type:'repository',name:'r'+i,updatedAt:ago(i+1)})),
  {id:'db',type:'database',name:'pg',updatedAt:ago(3)},{id:'li',type:'license',name:'lic',updatedAt:ago(4)},
  {id:'lone',type:'domain',name:'parked.test',updatedAt:ago(1)},{id:'lonerepo',type:'repository',name:'idea',updatedAt:ago(2)},{id:'hid',type:'domain',name:'hidden.test',hiddenAt:'2026-01-01'}
 ];
 const link=(x,y)=>D.linkRelation(a,x,y).ok||assert.fail(x+y);
 link('s1','u1');link('s4','u1');link('s2','u2');
 for(let i=0;i<6;i++)link('d'+i,'s1');
 for(let i=0;i<4;i++)link('r'+i,'s1');link('db','s1');link('li','s1');link('hid','s1');
 link('d0','s2');link('r0','s2');D.setLinkMeta(a,'d0','s2',{standby:true});D.setLinkMeta(a,'d1','s1',{proxied:true});
 return a;
}
const build=(a,extra)=>P.buildPanorama(a,extra);

test('panorama groups lanes under accounts, accounts by size then name, unaccounted last',()=>{
 const m=build(board());
 assert.deepEqual(m.accounts.map(x=>x.id),['u1','u2',null],'Vultr has two servers, Hetzner one, the NAS has no account');
 assert.deepEqual(m.accounts[0].lanes.map(l=>l.id),['s1','s4'],'servers inside an account follow recency');
 assert.deepEqual(m.accounts[2].lanes.map(l=>l.id),['s3']);
 assert.equal(m.accounts[0].tone,'amber','the account carries its own expiry colour');assert.equal(m.accounts[2].asset,null);
 assert.deepEqual(m.lanes.map(l=>[l.id,l.tone]),[['s1','amber'],['s4',''],['s2','red'],['s3','']].sort((x,y)=>m.lanes.findIndex(l=>l.id===x[0])-m.lanes.findIndex(l=>l.id===y[0])),'lane tone is the server\'s own date state');
 assert.deepEqual(Object.fromEntries(m.totals.map(t=>[t.key,t.n])),{server:4,domain:7,repository:5,database:2},'hub types without any (deployment, storage) stay out of the totals');
});
test('lanes: address, grouped mounts in recency order, real totals, hidden count, standby and proxied marks',()=>{
 const m=build(board()),lane=id=>m.lanes.find(l=>l.id===id);
 const s1=lane('s1');
 assert.equal(s1.ip.ip,'203.0.113.10');assert.equal(s1.ip.more,'v6');assert.equal(lane('s3').ip.inner,true);
 assert.deepEqual(s1.groups.map(g=>[g.key,g.total]),[['domain',6],['repository',4],['database',2],['storage',0]],'licences ride with databases');
 assert.deepEqual(s1.groups[0].chips.map(c=>c.id),['d0','d1','d2','d3','d4','d5'],'newest update first');
 assert.equal(s1.total,12);assert.equal(s1.hidden,1,'hidden mounts are counted, not drawn');
 assert.ok(!s1.groups[0].chips.some(c=>c.id==='hid'));
 const d1=s1.groups[0].chips[1];assert.equal(d1.proxied,true);assert.equal(d1.standby,false);
 const osaka=lane('s2').groups[0].chips[0];assert.deepEqual([osaka.id,osaka.standby,osaka.alsoOn],['d0',true,1],'the copy on the other server knows about its sibling');
 assert.equal(s1.groups[0].chips[0].alsoOn,1);assert.equal(s1.groups[0].chips[2].alsoOn,0);
 assert.deepEqual([...m.shared].map(([id,l])=>id+':'+l.join('+')).sort(),['d0:s1+s2','r0:s1+s2']);
});
test('manual order wins inside a lane, then recency',()=>{
 const m=build(board(),{cardOrder:{domain:['d5','d3']}});
 assert.deepEqual(m.lanes.find(l=>l.id==='s1').groups[0].chips.map(c=>c.id),['d5','d3','d0','d1','d2','d4']);
});
test('unmounted holds only things on no server, quietly, and caps at seven',()=>{
 let a=board();const m=build(a);
 assert.deepEqual(m.unmounted.items.map(c=>c.id),['lone','lonerepo']);assert.equal(m.unmounted.total,2);
 assert.ok(!m.unmounted.items.some(c=>c.id==='hid'),'hidden things are not listed');
 a.push(...Array.from({length:9},(_,i)=>({id:'x'+i,type:'domain',name:'x'+i,updatedAt:ago(20+i)})));
 const big=build(a),capped=P.capUnmounted(big);
 assert.equal(capped.shown.length,7);assert.equal(capped.more,4);assert.equal(P.capUnmounted(big,true).shown.length,11);
 assert.ok(!big.unmounted.items.some(c=>['db','li','d0'].includes(c.id)));
 // A thing whose only server is hidden is neither on a lane nor loose.
 a=board();a.find(x=>x.id==='s3').hiddenAt='2026-01-01';D.linkRelation(a,'lone','s3');
 const m2=build(a);assert.ok(!m2.unmounted.items.some(c=>c.id==='lone'));assert.equal(m2.hiddenLanes,1);assert.ok(!m2.lanes.some(l=>l.id==='s3'));
});
test('stopped marks and empty boards',()=>{
 const a=board();a.find(x=>x.id==='d2').stopped=true;a.find(x=>x.id==='s4').stopped=true;
 const m=build(a);assert.equal(m.lanes.find(l=>l.id==='s1').groups[0].chips.find(c=>c.id==='d2').stopped,true);assert.equal(m.lanes.find(l=>l.id==='s4').stopped,true);
 const empty=build([]);assert.deepEqual([empty.accounts.length,empty.lanes.length,empty.unmounted.total,empty.totals.find(t=>t.key==='server')],[0,0,0,undefined]);
 const only=build([{id:'s',type:'server',name:'solo'}]);assert.equal(only.lanes.length,1);assert.deepEqual(only.accounts.map(x=>x.id),[null]);
 assert.equal(build([{id:'s',type:'server',name:'solo'}]).lanes[0].ip,null);
});
test('capChips and what a card shows: per-group caps, one group gets the card cap, open groups show all, compact counts every kid',()=>{
 assert.deepEqual(P.capChips([1,2,3,4,5],3),{shown:[1,2,3],more:2});assert.deepEqual(P.capChips([1],0),{shown:[],more:1});assert.deepEqual(P.capChips([],4),{shown:[],more:0});
 const m=build(board()),lane=m.lanes.find(l=>l.id==='s1');
 const v=P.laneView(lane);
 assert.deepEqual(v.groups.map(g=>[g.key,g.shown.length,g.more,g.total]),[['domain',4,2,6],['repository',3,1,4],['database',2,0,2]],'empty groups are left out');
 assert.equal(v.hidden,1);
 const open=P.laneView(lane,{open:new Set(['s1:domain'])});assert.deepEqual([open.groups[0].shown.length,open.groups[0].more,open.groups[0].open],[6,0,true]);
 const a=board();for(let i=0;i<8;i++){a.push({id:'q'+i,type:'domain',name:'q'+i+'.test',updatedAt:ago(40+i)});D.linkRelation(a,'q'+i,'s4');}
 const solo=P.laneView(build(a).lanes.find(l=>l.id==='s4'));assert.deepEqual(solo.groups.map(g=>[g.key,g.shown.length,g.more]),[['domain',P.PANORAMA_CARD_CAP,8-P.PANORAMA_CARD_CAP]],'a card with one group uses the whole card cap');
 const c=P.laneView(lane,{compact:true});
 assert.equal(c.compact,true);assert.equal(c.dots.length,12);assert.equal(c.more,0);assert.deepEqual(c.dots[1],{id:'d1',tone:'',stopped:false});
});
test('keyboard order walks accounts, lanes, then each lane\'s chips, then the unmounted strip',()=>{
 const m=build(board()),order=P.panoramaOrder(m);
 assert.deepEqual(order.slice(0,3).map(x=>x.kind+':'+x.id),['lane:s1','chip:d0','chip:d1']);
 const laneIds=order.filter(x=>x.kind==='lane').map(x=>x.id);assert.deepEqual(laneIds,['s1','s4','s2','s3']);
 assert.deepEqual(order.slice(-2).map(x=>x.id+'@'+x.group),['lone@unmounted','lonerepo@unmounted']);
});

test('moveMount: move here, also here, unlink, and the refusals',()=>{
 const servers=(a,id)=>D.serverChain(a,a.find(x=>x.id===id)).servers.map(s=>s.id).sort();
 // Move: d1 sits on s1 only; the link to s1 goes, s2 appears, the proxied mark of the old link goes with it.
 let a=board();
 let r=P.moveMount(a,'d1',{from:'s1',to:'s2'});
 assert.deepEqual([r.ok,r.kind,r.server.id],[true,'move','s2']);assert.deepEqual(servers(a,'d1'),['s2']);assert.equal(D.linkMetaOf(a.find(x=>x.id==='d1'),'s1').proxied,false);
 // Also: d2 keeps s1 and gains s2.
 a=board();r=P.moveMount(a,'d2',{from:'s1',to:'s2',keep:true});
 assert.deepEqual([r.ok,r.kind],[true,'also']);assert.deepEqual(servers(a,'d2'),['s1','s2']);
 // Move onto a server it already sits on: only the old link goes (no duplicate), and the old one is the only change.
 a=board();r=P.moveMount(a,'d0',{from:'s1',to:'s2'});
 assert.equal(r.ok,true);assert.deepEqual(servers(a,'d0'),['s2']);assert.equal(a.find(x=>x.id==='d0').links.filter(x=>x==='s2').length,1);
 // Same lane: nothing happens.
 a=board();const before=JSON.stringify(a);r=P.moveMount(a,'d1',{from:'s1',to:'s1'});
 assert.deepEqual([r.ok,r.kind],[false,'same']);assert.equal(JSON.stringify(a),before);
 // From the unmounted strip: a plain attach, with or without the modifier.
 a=board();r=P.moveMount(a,'lone',{from:'',to:'s3'});assert.deepEqual([r.ok,r.kind],[true,'also']);assert.deepEqual(servers(a,'lone'),['s3']);
 // Unmounted strip as the target: only the lane it came out of is unlinked; another server keeps it.
 a=board();r=P.moveMount(a,'d0',{from:'s1',to:null});
 assert.deepEqual([r.ok,r.kind,r.server.id],[true,'detach','s1']);assert.deepEqual(servers(a,'d0'),['s2']);
 a=board();r=P.moveMount(a,'lone',{from:'',to:null});assert.deepEqual([r.ok,r.kind],[false,'none']);
 // Refusals: servers and accounts do not move, a domain cannot hang on a subscription or a domain.
 a=board();const before2=JSON.stringify(a);
 for(const args of [['s1',{from:'',to:'s2'}],['u1',{from:'',to:'s2'}],['d1',{from:'s1',to:'u2'}],['d1',{from:'s1',to:'d2'}],['d1',{from:'s1',to:'missing'}]]){const out=P.moveMount(a,args[0],args[1]);assert.deepEqual([out.ok,out.kind],[false,'illegal'],JSON.stringify(args));}
 assert.equal(JSON.stringify(a),before2);
});

// ---- v22 lenses ----
function cloud(){
 const a=[
  {id:'v',type:'deployment',name:'web-app',provider:'Vercel',updatedAt:ago(1)},{id:'b',type:'storage',name:'assets',provider:'R2',updatedAt:ago(2)},
  {id:'s',type:'server',name:'vps',updatedAt:ago(3)},
  {id:'r',type:'repository',name:'web',updatedAt:ago(1)},{id:'d',type:'domain',name:'app.test',updatedAt:ago(1)},{id:'cdn',type:'domain',name:'cdn.app.test',updatedAt:ago(2)},
  {id:'pg',type:'database',name:'neon',updatedAt:ago(1)},{id:'park',type:'domain',name:'parked.test',updatedAt:ago(5)},
  {id:'card',type:'bankcard',name:'Visa',last4:'4242',date:day(20),dateKind:'expire',updatedAt:ago(1)},{id:'old',type:'bankcard',name:'Old',hiddenAt:'2026-01-01',updatedAt:ago(9)},
  {id:'ai',type:'ai',name:'AI Pro',cost:'$20/月',updatedAt:ago(1)},{id:'tool',type:'subscription',name:'Tool',cost:'$8/月',updatedAt:ago(2)},
  {id:'free',type:'subscription',name:'Free tier',cost:'免费',updatedAt:ago(3)},{id:'unpriced',type:'subscription',name:'Mystery',updatedAt:ago(4)}
 ];
 const link=(x,y)=>D.linkRelation(a,x,y).ok||assert.fail(x+y);
 link('r','v');link('d','v');link('pg','v');link('b','v');link('cdn','b');link('ai','card');link('v','card');link('s','card');
 return a;
}
test('host lens: deployment services and storage are hubs too, with what they deploy, point at and use',()=>{
 const m=P.buildPanorama(cloud(),{lens:'host'}),lane=id=>m.lanes.find(l=>l.id===id);
 assert.deepEqual(m.lanes.map(l=>l.id),['s','v','b'],'servers first, then deployment services, then storage');
 assert.deepEqual(m.accounts.map(b=>b.id),[null,'type:deployment','type:storage']);
 assert.deepEqual(lane('v').groups.filter(g=>g.total).map(g=>g.key+':'+g.chips.map(c=>c.id)),['domain:d','repository:r','database:pg','storage:b']);
 assert.deepEqual(lane('b').groups.filter(g=>g.total).map(g=>g.key+':'+g.chips.map(c=>c.id)),['domain:cdn']);
 assert.deepEqual(m.unmounted.items.map(c=>c.id),['park'],'only things on no hub are loose');
 assert.deepEqual(m.totals.map(t=>t.key+':'+t.n),['server:1','deployment:1','storage:1','domain:3','repository:1','database:1']);
});
test('pay lens: cards hold what they pay for; loose = recurring costs with no card',()=>{
 const a=cloud(),m=P.buildPanorama(a,{lens:'pay'});
 assert.deepEqual(m.lanes.map(l=>l.id),['card'],'hidden cards stay out');assert.equal(m.hiddenLanes,1);
 assert.deepEqual(m.lanes[0].groups.filter(g=>g.total).map(g=>g.key+':'+g.chips.map(c=>c.id).join('+')),['service:ai','infra:v+s']);
 assert.equal(m.lanes[0].tone,'amber','the card carries its own expiry colour');
 assert.deepEqual(m.unmounted.items.map(c=>c.id),['tool'],'free and unpriced things never ask for a card');
 assert.deepEqual(m.accounts.map(b=>b.id),[null],'one band without a head');
});
test('lenses on offer and the one to open on',()=>{
 const a=cloud();assert.deepEqual(P.panoramaLenses(a),['host','pay']);
 assert.deepEqual(P.panoramaLenses(board()),['host']);
 assert.equal(P.pickLens(a,'pay'),'pay','the remembered lens wins while it has hubs');
 assert.equal(P.pickLens(board(),'pay'),'host','a remembered lens with nothing in it falls back');
 assert.equal(P.pickLens(a,''),'host','more links in host (5 kids) than pay (3)');
 const cards=[{id:'c',type:'bankcard',name:'c'},{id:'x',type:'ai',name:'x'},{id:'y',type:'ai',name:'y'},{id:'z',type:'server',name:'z'}];D.linkRelation(cards,'x','c');D.linkRelation(cards,'y','c');
 assert.equal(P.pickLens(cards,''),'pay','a board whose links are all payments opens on pay');
 assert.equal(P.pickLens([],''),'host');
});
test('canHang and moveMount follow the lens',()=>{
 let a=cloud();
 assert.equal(P.canHang(a,'park','v','host'),true);assert.equal(P.canHang(a,'park','b','host'),true);assert.equal(P.canHang(a,'r','b','host'),false,'a repository does not hang on storage');
 assert.equal(P.canHang(a,'tool','card','pay'),true);assert.equal(P.canHang(a,'tool','v','pay'),false);assert.equal(P.canHang(a,'park','card','host'),false);
 let r=P.moveMount(a,'park',{from:'',to:'v'});assert.deepEqual([r.ok,r.kind],[true,'also']);assert.ok(P.buildPanorama(a).lanes.find(l=>l.id==='v').groups[0].chips.some(c=>c.id==='park'));
 a=cloud();r=P.moveMount(a,'tool',{from:'',to:'card',lens:'pay'});assert.deepEqual([r.ok,r.kind,r.server.id],[true,'also','card']);
 assert.equal(P.buildPanorama(a,{lens:'pay'}).unmounted.total,0);
 r=P.moveMount(a,'ai',{from:'card',to:null,lens:'pay'});assert.deepEqual([r.ok,r.kind],[true,'detach']);
 r=P.moveMount(a,'ai',{from:'',to:'s',lens:'pay'});assert.deepEqual([r.ok,r.kind],[false,'illegal'],'only cards take payments');
});
test('type toggles: hidden hub types drop their cards, hidden kid groups drop their rows and loose items, the last hub type stays',()=>{
 const a=cloud();
 let m=P.buildPanorama(a,{hide:['storage','domain']});
 assert.deepEqual(m.lanes.map(l=>l.id),['s','v'],'no storage card');
 const v=m.lanes.find(l=>l.id==='v');
 assert.deepEqual(v.groups.map(g=>g.key),['repository','database'],'the storage group goes with the hub type of the same key, domains are off');
 assert.deepEqual([v.total,v.off],[2,2],'what is off is counted apart, so the card does not read as empty');
 assert.deepEqual(m.unmounted.items.map(c=>c.id),[],'the parked domain leaves the loose card too');
 assert.deepEqual(m.totals.filter(t=>t.off).map(t=>t.key),['storage','domain'],'totals still list what is off, marked');
 m=P.buildPanorama(a,{hide:['server','deployment','storage']});
 assert.deepEqual(m.lanes.map(l=>l.id),['s'],'hiding every hub type keeps the first one that has cards');
 m=P.buildPanorama(a,{hide:['nonsense']});assert.equal(m.lanes.length,3,'unknown keys are ignored');
 m=P.buildPanorama(a,{lens:'pay',hide:['infra']});
 assert.deepEqual(m.lanes[0].groups.map(g=>g.key),['service','domain']);assert.equal(m.lanes[0].off,2);
});
test('hubCandidates and setHubKids: tick what hangs on a hub, one write each way, other hubs kept',()=>{
 const a=cloud();
 const g=P.hubCandidates(a,'b','host');
 assert.deepEqual(g.map(x=>x.key+':'+x.items.map(i=>i.asset.id+(i.on?'*':'')+(i.elsewhere.length?'@'+i.elsewhere.map(h=>h.id):'')).join(',')),['domain:cdn*,park,d@v'],'storage only takes domains: on it first, then loose, then on other hubs');
 let r=P.setHubKids(a,'b',['park','d'],'host');
 assert.deepEqual([r.added.sort(),r.removed],[['d','park'],['cdn']]);
 assert.ok(D.linkedAssets(a,a.find(x=>x.id==='d')).some(x=>x.id==='v'),'d stays on the deployment too');
 r=P.setHubKids(a,'b',['park','d'],'host');assert.deepEqual([r.added,r.removed],[[],[]],'no change, no write');
 assert.deepEqual(P.hubCandidates(a,'card','pay').flatMap(x=>x.items).filter(i=>!i.asset.hiddenAt).map(i=>i.asset.id).includes('tool'),true,'a card offers what it could pay for');
 r=P.setHubKids(a,'card',['ai','v','s','tool'],'pay');assert.deepEqual(r.added,['tool']);
 assert.deepEqual(P.hubCandidates(a,'nope'),[]);assert.deepEqual(P.hubCandidates(a,'r','host'),[],'not a hub in this lens');
});
test('login lens: Apple IDs and Google accounts hold what signs in with them, nothing is loose',()=>{
 const a=cloud();a.push({id:'g',type:'google',name:'Google',updatedAt:ago(1)});
 D.linkRelation(a,'ai','g');D.linkRelation(a,'v','g');D.linkRelation(a,'r','g');
 const m=P.buildPanorama(a,{lens:'login'});
 assert.deepEqual(m.lanes.map(l=>l.id),['g']);
 assert.deepEqual(m.lanes[0].groups.filter(g=>g.total).map(g=>g.key+':'+g.chips.map(c=>c.id)),['service:ai','infra:v','repository:r']);
 assert.equal(m.unmounted.total,0);assert.ok(P.panoramaLenses(a).includes('login'));
 assert.equal(P.canHang(a,'tool','g','login'),true);assert.equal(P.canHang(a,'s','g','login'),false,'servers do not sign in with a Google account');
});
test('project lens: one virtual card per project; dropping or ticking sets the label, one project per thing',()=>{
 const a=cloud();for(const [id,p] of [['d','web'],['r','web'],['v','web'],['ai','web'],['park','old'],['hidden','web']])if(a.find(x=>x.id===id))a.find(x=>x.id===id).project=p;
 assert.ok(P.panoramaLenses(a).includes('project'));
 let m=P.buildPanorama(a,{lens:'project'});
 assert.deepEqual(m.lanes.map(l=>l.id+':'+l.total),['project:web:4','project:old:1'],'bigger projects first');
 assert.equal(m.lanes[0].hub.virtual,true);assert.deepEqual(m.accounts.map(b=>b.id),[null]);
 assert.deepEqual(m.lanes[0].groups.filter(g=>g.total).map(g=>g.key+':'+g.chips.map(c=>c.id)),['domain:d','repository:r','infra:v','service:ai']);
 assert.equal(m.unmounted.total,0,'having no project is normal');
 assert.deepEqual(m.totals.map(t=>t.key+':'+t.n),['project:2','domain:2','repository:1','infra:1','service:1'],'kinds count only what has a project');
 assert.equal(P.panoramaHub(a,'project:web','project').name,'web');assert.equal(P.panoramaHub(a,'project:nope','project'),null);
 let r=P.moveMount(a,'park',{from:'project:old',to:'project:web',keep:true,lens:'project'});
 assert.deepEqual([r.ok,r.kind,a.find(x=>x.id==='park').project],[true,'move','web'],'⌥ cannot keep two projects; it moves');
 assert.equal(P.panoramaLenses(a).includes('project'),true);assert.deepEqual(P.buildPanorama(a,{lens:'project'}).lanes.map(l=>l.id),['project:web'],'an emptied project disappears');
 r=P.moveMount(a,'park',{from:'project:web',to:null,lens:'project'});assert.deepEqual([r.ok,r.kind,'project' in a.find(x=>x.id==='park')],[true,'detach',false]);
 const g=P.hubCandidates(a,'project:web','project');assert.ok(g.some(x=>x.items.some(i=>i.asset.id==='card'&&!i.on)),'any kind can join a project');
 r=P.setHubKids(a,'project:web',['d','r','v','card'],'project');
 assert.deepEqual([r.added,r.removed],[['card'],['ai']]);assert.equal(a.find(x=>x.id==='ai').project,undefined);
});
