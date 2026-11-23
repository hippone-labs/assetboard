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
