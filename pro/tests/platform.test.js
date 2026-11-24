const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../web/platform-data.js');

test('which tokens can do more than read: Vercel and Render always, Supabase unless scoped (sbp_fc), Upstash never',()=>{
 assert.equal(P.platformWide('supabase','sbp_fc1234'),false);
 assert.equal(P.platformWide('supabase','sbp_1234'),true);
 assert.equal(P.platformWide('vercel','vcp_x'),true);
 assert.equal(P.platformWide('render','rnd_x'),true);
 assert.equal(P.platformWide('upstash','key'),false);
 assert.equal(P.platformWide('heroku','x'),true,'an unknown platform is taken as broad');
 for(const [kind,def] of Object.entries(P.PLATFORM_KINDS)){assert.match(def.tokenUrl,/^https:\/\//);assert.ok(def.readOnly||def.wide,kind);assert.ok(P.platformIntervalOk(def.interval),kind);}
 assert.equal(P.platformIntervalOk(30),false);assert.equal(P.platformIntervalOk(60),true);assert.equal(P.platformIntervalOk(3601),false);
});

test('what a state means: paused and failed are red, on the way amber, serving quiet',()=>{
 const line=(kind,item)=>P.platformLine(kind,item,Date.UTC(2026,10,3));
 assert.deepEqual([line('supabase',{state:'INACTIVE'}).tone,line('supabase',{state:'INACTIVE'}).text],['red','已暂停']);
 assert.equal(line('supabase',{state:'ACTIVE_HEALTHY'}).tone,'');
 assert.equal(line('supabase',{state:'COMING_UP'}).tone,'amber');
 assert.deepEqual([line('vercel',{state:'ERROR'}).tone,line('vercel',{state:'ERROR'}).text],['red','部署失败']);
 assert.equal(line('vercel',{state:'PAUSED'}).text,'已暂停');
 assert.equal(line('render',{kind:'service',state:'suspended',detail:'billing'}).text,'因账单暂停');
 assert.equal(line('render',{kind:'service',state:'running',deploy:'build_failed'}).tone,'red');
 assert.equal(line('render',{kind:'service',state:'running',deploy:'live'}).text,'运行中');
 assert.equal(line('upstash',{kind:'redis',state:'passive'}).tone,'amber');
 assert.deepEqual([line('supabase',{state:'SOMETHING_NEW'}).tone,line('supabase',{state:'SOMETHING_NEW'}).text],['amber','SOMETHING_NEW'],'an unknown state is shown as said, amber');
 assert.match(line('vercel',{state:'READY'}).label,/^Vercel：已上线$/);
});

test('a free Render database: its expiry in the line, amber within a week, red once past',()=>{
 const now=Date.UTC(2026,10,3);
 const soon=P.platformLine('render',{kind:'postgres',state:'available',expires:'2026-11-08T00:00:00Z'},now);
 assert.deepEqual([soon.tone,soon.text],['amber','可用 · 2026-11-08 到期']);
 const later=P.platformLine('render',{kind:'postgres',state:'available',expires:'2026-12-20T00:00:00Z'},now);
 assert.equal(later.tone,'');
 const gone=P.platformLine('render',{kind:'postgres',state:'available',expires:'2026-11-01T00:00:00Z'},now);
 assert.deepEqual([gone.tone,gone.text],['red','可用 · 2026-11-01 已到期']);
});

test('matching: a hand link wins, then the id in the record\'s link, then the name; ties and wrong kinds are left alone',()=>{
 const sources=[{id:'s1',kind:'supabase',items:[{id:'abcdefghijklmnopqrst',name:'notes-db',kind:'project',state:'INACTIVE'},{id:'zzzzzzzzzzzzzzzzzzzz',name:'twin',kind:'project',state:'ACTIVE_HEALTHY'}]},
  {id:'v1',kind:'vercel',items:[{id:'prj_123456',name:'notes-site',kind:'project',state:'READY'},{id:'prj_999999',name:'twin',kind:'project',state:'READY'}]}];
 const assets=[
  {id:'a',type:'database',name:'Notes DB',url:'https://supabase.com/dashboard/project/abcdefghijklmnopqrst'},
  {id:'b',type:'deployment',name:'Notes-Site'},
  {id:'c',type:'database',name:'twin'},{id:'d',type:'database',name:'twin'},
  {id:'e',type:'deployment',name:'other',platformLink:{source:'v1',id:'prj_999999'}},
  {id:'f',type:'domain',name:'notes-site'},
  {id:'g',type:'database',name:'notes-db',platformLink:{none:true}}
 ];
 const m=P.matchPlatformItems(assets,sources);
 assert.equal(m.links.get('a').how,'url');assert.equal(m.links.get('a').item.id,'abcdefghijklmnopqrst');
 assert.equal(m.links.get('b').how,'name');
 assert.equal(m.links.get('e').how,'manual');
 assert.ok(!m.links.has('c')&&!m.links.has('d'),'two records named twin: left for the person');
 assert.ok(!m.links.has('f'),'a domain is never a platform project');
 assert.ok(!m.links.has('g'),'kept out by hand');
 assert.deepEqual(m.unmatched.map(x=>x.item.id).sort(),['zzzzzzzzzzzzzzzzzzzz']);
 assert.deepEqual(P.fitsOf('vercel',{kind:'project'}),['deployment']);
 assert.deepEqual(P.fitsOf('render',{kind:'postgres'}),['database']);
});
