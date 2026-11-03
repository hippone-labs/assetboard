const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

test('a record can serve several projects: one name stays a string, several become a list, none drops the field',()=>{
 assert.deepEqual(D.parseProjects('notes-app， blog、notes-app; ,'),['notes-app','blog']);
 assert.deepEqual(D.projectsOf({project:'  notes-app '}),['notes-app']);
 assert.deepEqual(D.projectsOf({project:['a','a','b','']}),['a','b']);
 assert.deepEqual(D.projectsOf({}),[]);
 const a={id:'db'};
 D.setProjects(a,['web','blog']);assert.deepEqual(a.project,['web','blog']);
 D.setProjects(a,'web');assert.equal(a.project,'web');
 D.setProjects(a,[]);assert.equal('project' in a,false);
 assert.equal(D.parseProjects(Array.from({length:12},(_,i)=>'p'+i)).length,D.PROJECTS_PER_ASSET);
});

test('projects count shared records in each; the shutdown list keeps what another project still uses',()=>{
 const assets=[
  {id:'db',type:'database',name:'shared-db',provider:'Supabase',project:['web','blog']},
  {id:'site',type:'deployment',name:'web-site',provider:'Vercel',project:'web'},
  {id:'old',type:'deployment',name:'old-site',provider:'Netlify',project:'blog',hiddenAt:'2026-01-01T00:00:00Z'}
 ];
 assert.deepEqual(D.projectNames(assets),[{name:'web',count:2},{name:'blog',count:1}]);
 assert.deepEqual(D.projectAssets(assets,'blog').map(a=>a.id),['db']);
 assert.equal(D.inProject(assets[0],'web'),true);assert.equal(D.inProject(assets[0],''),false);
 const plan=D.shutdownPlan(assets,'web',{now:new Date(2026,10,3)});
 assert.deepEqual(plan.steps.map(s=>s.asset.id),['site']);
 assert.deepEqual(plan.shared.map(x=>[x.asset.id,x.projects]),[['db',['blog']]]);
 const rows=D.ledgerRows([{...assets[0],payments:[{paidOn:'2026-10-01',amount:25,currency:'USD'}]}],{});
 assert.equal(rows[0].project,'web / blog');
});

test('sleep rules come from the provider or the app host, and hold only for free records',()=>{
 assert.equal(D.sleepRuleOf({type:'database',provider:'Supabase'}).id,'supabase');
 assert.equal(D.sleepRuleOf({type:'database',provider:'Supabase',cost:'$25 / 月'}),null,'a paid project does not pause');
 assert.equal(D.sleepRuleOf({type:'deployment',provider:'',url:'https://example.onrender.com'}).id,'render');
 assert.equal(D.sleepRuleOf({type:'deployment',keepAlive:{url:'https://example.hf.space/health',every:720}}).id,'huggingface');
 assert.equal(D.sleepRuleOf({type:'deployment',provider:'Vercel'}),null,'Vercel does not sleep');
 assert.equal(D.sleepRuleOf({type:'domain',provider:'Supabase'}),null);
 assert.equal(D.sleepRuleOf({type:'database',provider:'MongoDB Atlas'}).every,null,'a request does not keep Atlas awake');
 for(const rule of D.SLEEP_RULES){assert.match(rule.source,/^https:\/\//);assert.ok(rule.brief&&rule.types.every(t=>D.KEEPALIVE_TYPES.includes(t)));assert.ok(rule.every===null||D.KEEPALIVE_EVERY.includes(rule.every),rule.id);}
});

test('keep-alive settings take a plain http(s) address and become a GitHub Actions workflow',()=>{
 assert.deepEqual(D.cleanKeepAlive({url:'https://app.example.com/health',every:10}),{url:'https://app.example.com/health',every:10});
 assert.equal(D.cleanKeepAlive({url:'https://app.example.com',every:7}).every,1440,'unknown intervals fall back to a day');
 for(const url of ['ftp://app.example.com','https://user:pass@app.example.com','https://app.example.com/?q=\'x','not a url','https://app.example.com/?token=ghp_'+'a'.repeat(36)])assert.equal(D.cleanKeepAlive({url,every:10}),null,url);
 assert.equal(D.keepAliveCron(10),'*/10 * * * *');assert.equal(D.keepAliveCron(1440),'17 3 * * *');
 const yaml=D.keepAliveWorkflow({name:'Notes API',keepAlive:{url:'https://api.example.com/health',every:60}});
 assert.match(yaml,/^name: keep-alive-notes-api\n/);
 assert.match(yaml,/cron: '17 \* \* \* \*'/);
 assert.match(yaml,/curl -fsS --http1\.1 --max-time 90 --retry 2 -o \/dev\/null 'https:\/\/api\.example\.com\/health'/);
 assert.equal(D.keepAliveWorkflow({name:'x'}),'');
});

test('deployment and database presets include the common free hosts, each with a vendor icon',()=>{
 for(const name of ['Vercel','Netlify','Render','Railway','Fly.io','Koyeb','Hugging Face','Streamlit','Zeabur','Deno Deploy'])assert.ok(D.providerPresets('deployment').includes(name),name);
 for(const name of ['Supabase','Neon','Turso','Upstash','Appwrite'])assert.ok(D.providerPresets('database').includes(name),name);
 for(const name of [...D.providerPresets('deployment'),...D.providerPresets('database')])assert.ok(D.iconVendor({type:'subscription',provider:name}),name);
});
