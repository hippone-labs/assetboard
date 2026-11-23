const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

test('AI plans: every entry is a valid plan from an official page, with a unique name and a known vendor',()=>{
 assert.ok(D.AI_PLANS.length>=20);
 assert.equal(new Set(D.AI_PLANS.map(p=>p.name.toLowerCase())).size,D.AI_PLANS.length,'names are unique');
 for(const p of D.AI_PLANS){
  assert.ok(D.PROVIDER_PRESETS.ai.includes(p.provider),`${p.name}: provider ${p.provider} is an ai preset`);
  assert.ok(D.iconVendor({type:'ai',name:p.name,provider:p.provider}),`${p.name}: has a vendor icon`);
  assert.ok(p.plan&&p.name.length<=100&&p.name.includes(p.plan),`${p.name}: plan label is part of the name`);
  assert.ok(typeof p.amount==='number'&&p.amount>0&&Number.isFinite(p.amount),`${p.name}: amount`);
  assert.ok(D.MAIN_CURRENCIES.includes(p.currency),`${p.name}: currency ${p.currency}`);
  assert.equal(p.cycle,'monthly',`${p.name}: cycle`);
  assert.ok(D.billingCycles[p.cycle]);
  if('yearly' in p)assert.ok(p.yearly>0&&p.yearly<p.amount*12,`${p.name}: a yearly price is a discount on 12 months`);
  assert.match(p.source,/^https:\/\/[a-z0-9.-]+\//,`${p.name}: source`);
  if(p.url)assert.match(p.url,/^https:\/\/[a-z0-9.-]+\//,`${p.name}: url`);
  assert.equal(p.checked,D.AI_PLANS_CHECKED);assert.match(p.checked,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!/example\./.test(p.source+(p.url||'')));
 }
 // Every vendor with plans is offered, in the preset order.
 assert.deepEqual(D.aiPlanProviders(),D.PROVIDER_PRESETS.ai.filter(n=>D.AI_PLANS.some(p=>p.provider===n)));
 assert.ok(['OpenAI','Anthropic','Gemini','Cursor','GitHub Copilot','Midjourney'].every(n=>D.aiPlanProviders().includes(n)));
 assert.deepEqual(D.aiPlansFor('Anthropic').map(p=>p.name),['Claude Pro','Claude Max','Claude Ultra']);
 assert.deepEqual(D.aiPlansFor('Nobody'),[]);
});

test('AI plans: a plan becomes record fields in the stored cost format, monthly or yearly',()=>{
 const pro=D.findAiPlan('  claude   PRO ');
 assert.equal(pro.name,'Claude Pro');assert.equal(D.findAiPlan('Claude Pro Max'),null);assert.equal(D.findAiPlan(''),null);
 assert.deepEqual(D.aiPlanFields(pro),{name:'Claude Pro',provider:'Anthropic',cost:'$20 / 月',cycle:'monthly',dateKind:'renew',url:'https://claude.ai/settings/billing'});
 assert.deepEqual(D.aiPlanFields(pro,'yearly'),{name:'Claude Pro',provider:'Anthropic',cost:'$200 / 年',cycle:'yearly',dateKind:'renew',url:'https://claude.ai/settings/billing'});
 // A plan without a yearly price stays monthly; one without a known management page has no url.
 assert.deepEqual(D.aiPlanFields(D.findAiPlan('ChatGPT Go'),'yearly'),{name:'ChatGPT Go',provider:'OpenAI',cost:'$8 / 月',cycle:'monthly',dateKind:'renew'});
 assert.equal(D.aiPlanFields(D.findAiPlan('Google AI Pro')).cost,'$19.99 / 月');
 assert.equal(D.aiPlanFields(D.findAiPlan('Kimi Plus (CN)')).cost,'¥99 / 月');
 // The cost reads back as the amount, currency and cycle the plan says, like every other cost.
 for(const p of D.AI_PLANS)for(const cycle of p.yearly?['monthly','yearly']:['monthly']){
  const f=D.aiPlanFields(p,cycle),money=D.costAmount(f),parts=D.costParts(f.cost);
  assert.equal(money.value,cycle==='yearly'?p.yearly:p.amount,f.cost);assert.equal(money.currency,p.currency);assert.equal(money.months,cycle==='yearly'?12:1);
  assert.equal(Number(parts.value),money.value);
  // The management link names the vendor first (Google AI is managed at Google One, so it gets the Google icon).
  assert.equal(D.iconVendor({type:'ai',...f}).host,(f.url?D.vendorForHost(new URL(f.url).hostname):D.iconVendor({type:'ai',name:'x',provider:p.provider})).host,`${p.name}: icon follows the vendor`);
 }
});

test('AI plans: a price in another currency is the vendor\'s own where it has one, else its listed price at the rates',()=>{
 const plan={name:'Sample Plus',provider:'Sample',amount:20,yearly:200,currency:'USD',prices:{EUR:{amount:22,yearly:216},GBP:{amount:18}}},rates={USD:1,EUR:.9,GBP:.75,JPY:158.13,HKD:7.85};
 assert.deepEqual(D.aiPlanPrice(plan,'USD'),{currency:'USD',value:20,cycle:'monthly',listed:true});
 assert.deepEqual(D.aiPlanPrice(plan,'EUR','yearly'),{currency:'EUR',value:216,cycle:'yearly',listed:true});
 // No yearly price in pounds: the monthly one, never the dollar year.
 assert.deepEqual(D.aiPlanPrice(plan,'GBP','yearly'),{currency:'GBP',value:18,cycle:'monthly',listed:true});
 assert.equal(D.aiPlanPrice(plan,'JPY'),null);assert.equal(D.aiPlanPrice(null,'USD'),null);
 assert.deepEqual(D.aiPlanPriceIn(plan,'EUR','monthly',rates),{currency:'EUR',value:22,cycle:'monthly',listed:true});
 assert.deepEqual(D.aiPlanPriceIn(plan,'HKD','monthly',rates),{currency:'HKD',value:157,cycle:'monthly',listed:false});
 assert.deepEqual(D.aiPlanPriceIn(plan,'JPY','yearly',rates),{currency:'JPY',value:31626,cycle:'yearly',listed:false});
 assert.equal(D.aiPlanPriceIn(plan,'XXX','monthly',rates),null);
 assert.equal(D.aiPlanFields(plan,'monthly','EUR').cost,'€22 / 月');assert.equal(D.aiPlanFields(plan,'yearly','EUR').cost,'€216 / 年');
 assert.equal(D.aiPlanFields(plan,'monthly','JPY').cost,'$20 / 月','a currency the vendor does not sell in falls back to the listed one');
 const plus=D.findAiPlan('ChatGPT Plus'),gpro=D.findAiPlan('Google AI Pro');
 assert.equal(D.aiPlanFields(plus,'monthly','EUR').cost,'€23 / 月');assert.equal(D.aiPlanFields(plus,'monthly','GBP').cost,'£20 / 月');assert.equal(D.aiPlanPrice(plus,'JPY'),null);
 assert.equal(D.aiPlanPrice(gpro,'JPY').value,2900);assert.equal(D.aiPlanPrice(gpro,'GBP').value,18.99);assert.equal(D.aiPlanPrice(D.findAiPlan('Claude Max'),'EUR'),null);
 // Every other price in the table: a main currency, a positive amount, an official page; a yearly price only beside the plan's own.
 for(const p of D.AI_PLANS)for(const [code,x] of Object.entries(p.prices||{})){
  assert.ok(D.MAIN_CURRENCIES.includes(code)&&code!==p.currency,`${p.name} ${code}`);assert.ok(x.amount>0&&(x.yearly==null||x.yearly>x.amount&&p.yearly>0),`${p.name} ${code} amount`);
  assert.match(x.source||'',/^https:\/\//,`${p.name} ${code} source`);
 }
});

test('AI plans: a store price, and a store in a currency the app does not keep, in US dollars at the day\'s rate',()=>{
 const plan={name:'Sample Plus',provider:'Sample',amount:20,yearly:200,currency:'USD',channels:[{id:'app-store',amount:24.99,currency:'USD',source:'https://apps.apple.com/us/app/x/id1'},{id:'app-store-tr',amount:500,currency:'TRY',source:'https://apps.apple.com/tr/app/x/id1'},{id:'nowhere',amount:1,currency:'USD'}]};
 assert.deepEqual(D.aiPlanChannelPrice(plan,'app-store'),{currency:'USD',value:24.99,cycle:'monthly',listed:true});
 assert.equal(D.aiPlanChannelPrice(plan,'app-store','yearly').cycle,'monthly','no yearly price in the store: its monthly one');
 assert.equal(D.aiPlanChannelPrice(plan,'google-play'),null);assert.equal(D.aiPlanFields(plan,'monthly','USD','app-store').cost,'$24.99 / 月');
 assert.equal(D.aiPlanFields(plan,'monthly','USD','google-play').cost,'$20 / 月','a store the plan is not sold in is the site');
 // Lira without a rate is no price; with one it is dollars, the store's own figure kept beside it.
 const had=D.AI_STORE_RATES.TRY;delete D.AI_STORE_RATES.TRY;assert.equal(D.aiPlanChannelPrice(plan,'app-store-tr'),null);assert.deepEqual(D.aiPlanChannels(plan).map(c=>c.id),['app-store']);
 D.AI_STORE_RATES.TRY={perUSD:40,date:'2026-11-23',source:'https://rates.example/'};
 assert.deepEqual(D.aiPlanChannelPrice(plan,'app-store-tr'),{currency:'USD',value:12.5,cycle:'monthly',listed:false,local:{currency:'TRY',amount:500},rateDate:'2026-11-23'});
 if(had)D.AI_STORE_RATES.TRY=had;else delete D.AI_STORE_RATES.TRY;
 // The table's own: a known store, a positive price, the store's page, and a rate for every currency the app does not keep.
 for(const p of D.AI_PLANS)for(const c of p.channels||[]){
  assert.ok(D.AI_PLAN_CHANNELS[c.id]&&c.amount>0,`${p.name} ${c.id}`);assert.match(c.source||'',/^https:\/\/(apps\.apple\.com|play\.google\.com)\//,`${p.name} ${c.id} source`);
  assert.ok(D.aiPlanChannelPrice(p,c.id),`${p.name} ${c.id} has a price`);
 }
 for(const [code,r] of Object.entries(D.AI_STORE_RATES)){assert.ok(r.perUSD>0&&/^\d{4}-\d\d-\d\d$/.test(r.date)&&/^https:\/\//.test(r.source),code);}
});
