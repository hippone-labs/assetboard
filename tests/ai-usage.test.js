// AI 额度与用量 (ai-usage.js): the readers on made-up sample files shaped like each tool's own (tests/fixtures/ai-usage), the
// usage endpoints' answers, the store's dedupe and window choice, and what a subscription record shows. No real data, no network.
process.env.TZ='UTC';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const U=require('../ai-usage.js');

const root=path.join(__dirname,'fixtures','ai-usage');
const NOW=Date.parse('2026-11-08T12:00:00Z');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const walk=(dir,test)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),test):test(e.name)?[path.join(dir,e.name)]:[]):[];
// What the Mac app does (desktop/AIUsage.swift): find each tool's files where it keeps them and hand them over as they are.
function scanFixtures(store){
 for(const f of walk(path.join(root,'claude/projects'),n=>n.endsWith('.jsonl')))store.feed('claude','jsonl',fs.readFileSync(f,'utf8'),f,NOW);
 for(const f of walk(path.join(root,'codex/sessions'),n=>/^rollout-.*\.jsonl$/.test(n)))store.feed('codex','jsonl',fs.readFileSync(f,'utf8'),f,NOW);
 for(const f of walk(path.join(root,'copilot/session-state'),n=>n==='events.jsonl'))store.feed('copilot','jsonl',fs.readFileSync(f,'utf8'),f,NOW);
 for(const f of walk(path.join(root,'grok/sessions'),n=>n==='usage.json'))store.feed('grok','json',fs.readFileSync(f,'utf8'),f,NOW);
 for(const f of walk(path.join(root,'opencode/storage/message'),n=>n.endsWith('.json')))store.feed('opencode','json',fs.readFileSync(f,'utf8'),path.basename(f,'.json'),NOW);
 store.feed('opencode','rows',JSON.parse(read('rows/opencode-session_message.json')),'db',NOW);
 store.feed('grok','rows',JSON.parse(read('rows/grok-usage_events.json')),'db',NOW);
 store.feed('cursor','rows',JSON.parse(read('rows/cursor-ItemTable.json')),'db',NOW);
 return store;
}
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≈ ${b}`);

test('AI usage: Claude Code logs give tokens per reply (largest copy of a repeated line), API-price cost, the limit hit and the local block',()=>{
 const store=U.aiUsageStore();
 store.feed('claude','jsonl',read('claude/projects/demo-app/5b1c0d2e-0000-4000-8000-000000000001.jsonl'),'s1',NOW);
 assert.equal(store.size(),2,'two replies: the repeated content-block line is one, the October line is past 35 days, the error line is no reply');
 const v=store.snapshot(NOW).vendors.anthropic;
 assert.deepEqual(v.sources,['claude']);
 close(v.days['2026-11-08'].cost,0.45,0.0051);
 assert.equal(v.days['2026-11-08'].tokens,12+845+2048+40960+3000+12000+200000);
 assert.ok(v.models['claude-sonnet-4-5-20250929']&&v.models['claude-opus-4-8']);
 close(v.models['claude-sonnet-4-5-20250929'].cost,0.03,0.006);close(v.models['claude-opus-4-8'].cost,0.42,0.006);
 assert.deepEqual(v.limitHit,{at:Date.parse('2026-11-08T11:00:00Z'),resetsAt:Date.parse('2026-11-08T15:00:00Z')});
 assert.equal(v.block.start,Date.parse('2026-11-08T09:00:00Z'));assert.equal(v.block.end,Date.parse('2026-11-08T14:00:00Z'));
 assert.equal(v.last,Date.parse('2026-11-08T10:40:00Z'));
 // Fed again (a rescan), nothing doubles.
 store.feed('claude','jsonl',read('claude/projects/demo-app/5b1c0d2e-0000-4000-8000-000000000001.jsonl'),'s1',NOW);
 assert.equal(store.size(),2);close(store.snapshot(NOW).vendors.anthropic.days['2026-11-08'].cost,v.days['2026-11-08'].cost);
 // Past five hours of quiet the block is over.
 assert.equal(store.snapshot(Date.parse('2026-11-08T16:00:00Z')).vendors.anthropic.block,undefined);
});

test('AI usage: Codex rollouts give the turn tokens (cached input apart) and the plan rate limits the server last reported',()=>{
 const store=U.aiUsageStore();store.feed('codex','jsonl',read('codex/sessions/2026/11/08/rollout-2026-11-08T10-00-00-0199aaaa-0000-7000-8000-000000000001.jsonl'),'r1',NOW);
 const v=store.snapshot(NOW).vendors.openai;
 assert.equal(store.size(),2);
 assert.equal(v.plan,'plus');assert.equal(v.windowsFrom,'local');
 // The later event wins; resets_in_seconds counts from the event's own time.
 assert.deepEqual(v.windows,[{id:'5h',used:64,resetsAt:Date.parse('2026-11-08T10:05:09Z')+7200000,minutes:300},{id:'week',used:83,resetsAt:Date.parse('2026-11-12T08:00:00Z'),minutes:10080}]);
 assert.deepEqual(v.credits,{has:false,unlimited:false,balance:0});
 const m=v.models['gpt-5.2-codex'];assert.equal(m.n,2);
 assert.equal(m.tokens,15000+5000+400+5000+25000+1000);
 close(m.cost,0.06,0.0051);
 // A window whose reset has passed reads as spent and empty.
 const later=store.snapshot(Date.parse('2026-11-08T13:00:00Z')).vendors.openai.windows[0];assert.equal(later.used,0);assert.equal(later.rolled,true);
});

test('AI usage: Copilot CLI, Grok (usage.json and grok.db), opencode (files and SQLite rows) and Cursor plan rows',()=>{
 const snap=scanFixtures(U.aiUsageStore()).snapshot(NOW);
 const c=snap.vendors.copilot;
 assert.equal(c.bySource.copilot.n,2);assert.equal(c.bySource.copilot.premium,2);
 close(c.bySource.copilot.cost,0,0.0051);
 const g=snap.vendors.grok;
 assert.equal(g.bySource.grok.n,4,'two turns and two grok.db rows');
 // Turn 1 costs its ticks (0.0212), turn 2's cost is partial so it is priced, the grok.db rows keep their own micro-dollars.
 close(g.days['2026-11-06'].cost,0.03,0.0051);close(g.days['2026-11-05'].cost,0.01,0.0051);
 assert.equal(g.models['grok-code-fast-1'].tokens,11000+900+10000+10000+1200+30000);
 // opencode's usage goes to the vendor whose plan it spends; Zen / Go stays with opencode.
 assert.deepEqual(snap.vendors.anthropic.sources,['claude','opencode']);close(snap.vendors.anthropic.bySource.opencode.cost,0.05);
 assert.ok(snap.vendors.openai.bySource.opencode.cost>0,'cost 0 is priced from the tokens');
 close(snap.vendors.opencode.bySource.opencode.cost,0.01,0.0051);
 assert.equal(snap.vendors.cursor.plan,'pro');assert.equal(snap.vendors.cursor.status,'active');
 assert.ok(snap.sources.cursor.found&&snap.sources.opencode.found&&!snap.sources.antigravity.found);
});

test('AI usage: nothing but numbers, model names and times leaves a reader',()=>{
 const text=JSON.stringify(scanFixtures(U.aiUsageStore()).snapshot(NOW));
 for(const leak of ['fictional','/work/','secret','example.com','instructions','Read','sess-0001','ses_demo','5b1c0d2e'])assert.ok(!text.includes(leak),`snapshot leaks ${leak}`);
});

test('AI usage: the usage endpoints, read leniently',()=>{
 const api=name=>JSON.parse(read('api/'+name));
 const claude=U.AI_API.claude(api('claude-oauth-usage.json'));
 assert.deepEqual(claude.windows.map(w=>[w.id,w.used,w.label||'']),[['5h',41,''],['week',88,''],['week-opus',52,'Opus']]);
 assert.equal(claude.windows[0].resetsAt,Date.parse('2026-11-08T14:00:00Z'));
 assert.deepEqual(claude.extra,{used:12.34,limit:50,currency:'USD'});
 const codex=U.AI_API.codex(api('codex-wham-usage.json'));
 assert.deepEqual(codex.windows,[{id:'week',used:96,resetsAt:Date.parse('2026-11-08T14:00:00Z'),minutes:10080}],'a lone weekly window in the primary slot is weekly');
 assert.equal(codex.plan,'pro');assert.equal(codex.credits.balance,125);
 assert.ok(!JSON.stringify(codex).includes('example.com'),'the email is not kept');
 const cursor=U.AI_API.cursor(api('cursor-usage-summary.json'));
 assert.deepEqual(cursor.windows,[{id:'month',used:30,resetsAt:Date.parse('2026-12-01T00:00:00Z'),minutes:null}]);assert.deepEqual(cursor.extra,{used:5,limit:100,currency:'USD'});
 const copilot=U.AI_API.copilot(api('copilot-internal-user.json'));
 assert.equal(copilot.plan,'individual');assert.equal(copilot.windows.length,1,'unlimited chat is no window');
 assert.deepEqual(copilot.windows[0],{id:'premium',used:29,resetsAt:Date.parse('2026-12-01'),minutes:null,limit:300,left:213});
 const free=U.AI_API.copilot(api('copilot-free.json'));assert.deepEqual(free.windows.map(w=>[w.id,w.used,w.limit]),[['chat',20,50],['completions',25,2000]]);
 const grok=U.AI_API.grok(api('grok-billing-credits.json'));
 assert.deepEqual(grok.windows,[{id:'week',used:37.5,resetsAt:Date.parse('2026-11-12T00:00:00Z'),minutes:10080}]);assert.equal(grok.plan,'supergrok');assert.deepEqual(grok.extra,{used:0,limit:20,currency:'USD'});
 const go=U.AI_API.opencode(api('opencode-go-usage.json'));assert.deepEqual(go.windows.map(w=>[w.id,w.used]),[['5h',18],['week',44],['month',100]]);
 const ag=U.AI_API.antigravity(api('antigravity-quota-summary.json'));
 // Three spellings of the remaining fraction; a bucket without one is left out, not read as empty or full.
 assert.deepEqual(ag.windows.map(w=>[w.id,w.used]),[['week-gemini',18],['5h-gemini',91],['week-other',36]]);
 const status=U.AI_API.antigravity(api('antigravity-user-status.json'));assert.equal(status.plan,'Google AI Pro');assert.deepEqual(status.windows.map(w=>[w.label,w.used]),[['Gemini 3 Pro (High)',40]]);
 for(const fn of Object.values(U.AI_API))assert.doesNotThrow(()=>{fn(null);fn({});fn([]);},'empty answers are no error');
});

test('AI usage: an endpoint answer is fresher than the local one, and errors stay per source',()=>{
 const store=scanFixtures(U.aiUsageStore());
 store.feed('claude','api',read('api/claude-oauth-usage.json'),'',NOW);
 const v=store.snapshot(NOW).vendors.anthropic;
 assert.equal(v.windowsFrom,'api');assert.equal(v.windows[1].used,88);assert.equal(v.extra.limit,50);
 store.feed('codex','api',read('api/codex-wham-usage.json'),'',NOW+1000);
 assert.equal(store.snapshot(NOW+1000).vendors.openai.windows[0].used,96);
 store.fail('cursor','HTTP 401',NOW);assert.equal(store.snapshot(NOW).sources.cursor.error,'HTTP 401');
 store.clear('cursor');assert.equal(store.snapshot(NOW).vendors.cursor,undefined);
 assert.equal(store.feed('nobody','jsonl','{}'),0);
});

test('AI usage: a subscription record finds its vendor; one record per vendor shows the reading',()=>{
 const ai=(id,f)=>({id,type:'ai',name:'',provider:'',...f});
 assert.equal(U.aiVendorOf(ai('a',{name:'Claude Max',provider:'Anthropic'})),'anthropic');
 assert.equal(U.aiVendorOf(ai('a',{name:'ChatGPT Plus',provider:'OpenAI'})),'openai');
 assert.equal(U.aiVendorOf(ai('a',{name:'Google AI Pro',provider:'Gemini'})),'google');
 assert.equal(U.aiVendorOf(ai('a',{name:'SuperGrok',provider:''})),'grok');
 assert.equal(U.aiVendorOf(ai('a',{name:'GitHub Copilot Pro',provider:'GitHub Copilot'})),'copilot');
 assert.equal(U.aiVendorOf(ai('a',{name:'Midjourney Pro',provider:'Midjourney'})),'');
 assert.equal(U.aiVendorOf(ai('a',{name:'Team plan',provider:'Acme',usageSource:'cursor'})),'cursor','set by hand');
 assert.equal(U.aiVendorOf(ai('a',{name:'Claude Pro',provider:'Anthropic',usageSource:'none'})),'','switched off by hand');
 assert.equal(U.aiVendorOf({type:'subscription',name:'Claude Pro'}),'');
 const owners=U.aiUsageOwners([ai('old',{name:'Claude Pro',provider:'Anthropic',stopped:true}),ai('max',{name:'Claude Max',provider:'Anthropic'}),ai('hid',{name:'ChatGPT Plus',provider:'OpenAI',hiddenAt:'2026-01-01'}),ai('gpt',{name:'ChatGPT Pro 200',provider:'OpenAI'}),ai('hand',{name:'Old Claude',provider:'Anthropic',usageSource:'anthropic',stopped:true})]);
 assert.deepEqual([...owners],[['anthropic','hand'],['openai','gpt']],'a hand link wins; otherwise the first in use');
});

test('AI usage: the billing period follows the record date and cycle',()=>{
 const p=U.aiPeriod({date:'2026-11-20',cycle:'monthly'},NOW);
 assert.equal(p.start,new Date(2026,9,20).getTime());assert.equal(p.end,new Date(2026,10,20).getTime());assert.ok(p.fromDate);
 const rolled=U.aiPeriod({date:'2026-08-03',cycle:'monthly'},NOW);assert.equal(rolled.end,new Date(2026,11,3).getTime(),'a past date rolls forward by cycles');
 const none=U.aiPeriod({},NOW);assert.equal(none.end-none.start,30*86400000);assert.ok(!none.fromDate);
});

test('AI usage: a record\'s quota, value for money and the ranked signals',()=>{
 const day=n=>U.aiDayKey(NOW-n*86400000);
 const snap={vendors:{
  anthropic:{vendor:'anthropic',sources:['claude'],windows:[{id:'5h',used:41,resetsAt:NOW+2*3600000,minutes:300},{id:'week',used:97,resetsAt:NOW+3*86400000,minutes:10080}],windowsFrom:'api',days:{[day(1)]:{tokens:9e6,cost:120,n:400},[day(3)]:{tokens:3e6,cost:40,n:100}},last:NOW-3600000,models:{},bySource:{}},
  openai:{vendor:'openai',sources:['codex'],windows:[{id:'5h',used:30,resetsAt:NOW+4*3600000,minutes:300},{id:'week',used:40,resetsAt:NOW+86400000,minutes:10080}],days:{[day(20)]:{tokens:1e5,cost:2,n:5}},last:NOW-20*86400000,models:{},bySource:{}},
  cursor:{vendor:'cursor',sources:['cursor'],windows:[{id:'month',used:20,resetsAt:NOW+20*86400000,minutes:null}],days:{[day(2)]:{tokens:1e4,cost:1,n:3}},last:NOW-2*86400000,models:{},bySource:{}},
  grok:{vendor:'grok',sources:['grok'],windows:[{id:'week',used:60,resetsAt:NOW+86400000,minutes:10080}],days:{[day(1)]:{tokens:1e6,cost:45,n:30}},last:NOW-86400000,models:{},bySource:{}}
 }};
 const assets=[
  {id:'max',type:'ai',name:'Claude Max',provider:'Anthropic',cost:'$100 / 月',cycle:'monthly',date:'2026-11-20',dateKind:'renew'},
  {id:'plus',type:'ai',name:'ChatGPT Plus',provider:'OpenAI',cost:'$20 / 月',cycle:'monthly',date:'2026-11-12',dateKind:'renew'},
  {id:'cur',type:'ai',name:'Cursor Super',provider:'Cursor',cost:'$100 / 月',cycle:'monthly',date:'2026-11-12',dateKind:'renew'},
  {id:'grk',type:'ai',name:'Grok Premium',provider:'Grok',cost:'$30 / 月',cycle:'monthly',date:'2026-11-25',dateKind:'renew'},
  {id:'mj',type:'ai',name:'Midjourney Pro',provider:'Midjourney',cost:'$60 / 月',cycle:'monthly'}];
 const usd={max:100,plus:20,cur:100,grk:30};
 const q=U.aiQuotaOf(assets[0],snap,{now:NOW,monthlyUsd:100});
 assert.equal(q.top.id,'week');assert.equal(q.windows.map(w=>w.id).join(),'week,5h','tightest first');
 assert.equal(q.period.cost,160);assert.equal(q.value,1.6);assert.equal(q.idleDays,0);
 assert.equal(U.aiQuotaOf(assets[4],snap,{now:NOW}),null,'no reading for a vendor nothing here uses');
 const signals=U.aiQuotaSignals(assets,snap,{now:NOW,monthlyUsd:a=>usd[a.id]??null});
 assert.deepEqual(signals.map(s=>[s.kind,s.id]),[['full','max'],['idle','plus'],['low','cur'],['value','max'],['value','grk']]);
 assert.equal(signals.find(s=>s.kind==='idle').days,20);
 assert.ok(signals.filter(s=>s.level==='amber').every(s=>['full','tight','idle'].includes(s.kind)));
 // On pace: 60% of a week gone in under half of it runs out early.
 const pace=U.aiQuotaOf(assets[3],{vendors:{grok:{...snap.vendors.grok,windows:[{id:'week',used:60,resetsAt:NOW+4*86400000,minutes:10080}]}}},{now:NOW,monthlyUsd:30});
 assert.ok(pace.pace>100);
 assert.deepEqual(U.aiQuotaSignals([assets[3]],{vendors:{grok:{...snap.vendors.grok,windows:[{id:'week',used:60,resetsAt:NOW+4*86400000,minutes:10080}]}}},{now:NOW,monthlyUsd:()=>30}).map(s=>s.kind),['tight','value']);
});

test('AI usage: prices cover the models the tools write, and an unknown one is not priced',()=>{
 for(const m of ['claude-opus-4-8','claude-sonnet-4-5-20250929','claude-haiku-4-5','claude-fable-5','gpt-5.2-codex','gpt-5','gpt-6.1-sol','grok-code-fast-1','grok-4.3','gemini-3-pro'])assert.ok(U.aiPriceOf(m),m);
 assert.equal(U.aiPriceOf('claude-opus-4-1')[1],15,'old Opus at its old price');assert.equal(U.aiPriceOf('claude-opus-4-8')[1],5);
 assert.equal(U.aiCostOf({m:'some-local-model',i:1000,o:1000}),null);
 close(U.aiCostOf({m:'claude-sonnet-4-5',i:1e6,o:0,cw:0,cr:0}),3);
 assert.ok(Object.values(U.AI_USAGE_SOURCES).every(s=>U.AI_USAGE_VENDORS[s.vendor]&&/^https?:\/\//.test(s.api)));
});
