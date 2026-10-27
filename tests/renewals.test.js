const test=require('node:test');
const assert=require('node:assert/strict');
const {recordPayment,removePayment,pendingCharges,renewOptions,renewAsset,confirmCharge,priceChange,paidTotals,ledgerRows,ledgerCsv,csvCell,
 monthsBetween,cleanProject,projectNames,shutdownPlan,reviewQueue,calendarIcs,icsFold,handoverHtml,rdapFacts,rdapCompare,registryPhaseOf,pendingRenewals,confirmRenewal,costTotals}=require('../asset-data.js');

const at=day=>new Date(`${day}T10:00:00`);

test('recordPayment keeps one answer per due date and refuses unreadable money',()=>{
 const a={id:'a',name:'vps'};
 assert.equal(recordPayment(a,{paidOn:'2026-10-01',amount:0,currency:'USD'}),null);
 assert.equal(recordPayment(a,{paidOn:'2026-13-01',amount:5,currency:'USD'}),null);
 assert.equal(recordPayment(a,{paidOn:'2026-10-01',amount:5,currency:'usd'}),null);
 recordPayment(a,{paidOn:'2026-10-01',amount:6,currency:'USD',covers:'2026-10-01',months:1});
 recordPayment(a,{paidOn:'2026-10-02',amount:6.5,currency:'USD',covers:'2026-10-01',months:1});
 assert.equal(a.payments.length,1);
 assert.equal(a.payments[0].amount,6.5);
 const missed=recordPayment(a,{paidOn:'2026-11-02',covers:'2026-11-01',status:'missed'});
 assert.equal(missed.amount,0);
 assert.equal(a.payments.length,2);
 assert.ok(removePayment(a,missed.id));
 assert.equal(a.payments.length,1);
});

test('pendingCharges asks about charges that came due since payments began, once each',()=>{
 const base={type:'server',dateKind:'renew',cycle:'monthly',cost:'$6 / 月',createdAt:'2026-01-01T00:00:00Z'};
 const assets=[
  {...base,id:'s',name:'tokyo',date:'2026-07-05'},
  {...base,id:'h',name:'hidden',date:'2026-07-05',hiddenAt:'2026-08-01'},
  {...base,id:'x',name:'stopped',date:'2026-07-05',stopped:true},
  {...base,id:'e',name:'expire',date:'2026-07-05',dateKind:'expire'},
  {...base,id:'n',name:'new',date:'2026-07-05',createdAt:'2026-10-10T00:00:00Z'}
 ];
 const pending=pendingCharges(assets,{now:at('2026-10-10'),since:'2026-08-20'});
 assert.deepEqual(pending.map(p=>`${p.asset.id}:${p.due}`),['s:2026-09-05','s:2026-10-05']);
 assert.equal(pending[0].money.value,6);
 confirmCharge(assets[0],'2026-09-05',{now:at('2026-10-10')});
 confirmCharge(assets[0],'2026-10-05',{missed:true,now:at('2026-10-10')});
 assert.deepEqual(pendingCharges(assets,{now:at('2026-10-10'),since:'2026-08-20'}),[]);
 assert.equal(assets[0].payments.find(p=>p.covers==='2026-09-05').amount,6);
 assert.equal(assets[0].payments.find(p=>p.covers==='2026-09-05').paidOn,'2026-09-05');
 // The window is capped: a long-closed app does not bring back a year of questions.
 assert.deepEqual(pendingCharges([{...base,id:'o',name:'old',date:'2025-01-05'}],{now:at('2026-10-10')}).map(p=>p.due),['2026-09-05','2026-10-05']);
});

test('renewOptions start from the next due date, or the old date of an expired one-off',()=>{
 const yearly=renewOptions({date:'2025-03-01',cycle:'yearly',dateKind:'expire'},at('2026-10-21'));
 assert.equal(yearly.base,'2027-03-01');
 assert.deepEqual(yearly.options.map(o=>o.until),['2028-03-01','2029-03-01','2030-03-01','2032-03-01']);
 const expired=renewOptions({date:'2026-10-01',dateKind:'expire'},at('2026-10-21'));
 assert.equal(expired.base,'2026-10-01');
 assert.equal(expired.options[0].until,'2027-10-01');
 assert.equal(renewOptions({date:'2026-01-31',cycle:'monthly'},at('2026-10-21')).options[0].until,'2026-11-30');
 assert.deepEqual(renewOptions({},at('2026-10-21')),{base:'',options:[]});
});

test('renewAsset moves the date, records what was paid and can update the price',()=>{
 const a={id:'d',type:'domain',name:'notes.dev',date:'2026-10-01',dateKind:'expire',cost:'$12 / 年'};
 const result=renewAsset(a,{until:'2027-10-01',amount:15.5,currency:'USD',paidOn:'2026-10-20',updateCost:true,now:at('2026-10-21')});
 assert.equal(result.ok,true);
 assert.equal(a.date,'2027-10-01');
 assert.equal(a.event,'2027-10-01 到期');
 assert.equal(a.cost,'$15.5 / 年');
 assert.deepEqual([a.payments[0].covers,a.payments[0].months,a.payments[0].amount],['2026-10-01',12,15.5]);
 // Three years at once does not rewrite a yearly price.
 const multi=renewAsset(a,{until:'2030-10-01',amount:40,currency:'USD',updateCost:true,now:at('2026-10-21')});
 assert.equal(multi.months,36);assert.equal(multi.costChanged,false);assert.equal(a.cost,'$15.5 / 年');
 assert.equal(renewAsset(a,{until:'2029-01-01',now:at('2026-10-21')}).ok,false);
 // Renewing without an amount just moves the date.
 const free={id:'f',name:'f',date:'2026-10-01'};
 assert.equal(renewAsset(free,{until:'2027-10-01',now:at('2026-10-21')}).payment,null);
 assert.equal(free.payments,undefined);
});

test('monthsBetween counts whole months, month ends included',()=>{
 assert.equal(monthsBetween('2026-01-31','2026-02-28'),1);
 assert.equal(monthsBetween('2026-03-01','2027-03-01'),12);
 assert.equal(monthsBetween('2026-03-01','2026-03-20'),null);
});

test('priceChange compares the price with the last payment per month and in one currency',()=>{
 const a={cost:'$18 / 年',cycle:'yearly',payments:[{id:'1',paidOn:'2025-03-01',amount:10.98,currency:'USD',months:12,covers:'2025-03-01',status:'paid'}]};
 const change=priceChange(a);
 assert.equal(change.up,true);assert.equal(change.before,10.98);assert.equal(change.after,18);assert.equal(change.basis,'cost');
 a.cost='$10.98 / 年';assert.equal(priceChange(a),null);
 a.payments.push({id:'2',paidOn:'2026-03-01',amount:18,currency:'USD',months:12,covers:'2026-03-01',status:'paid'});
 a.cost='$18 / 年';
 assert.equal(priceChange(a).basis,'payments');
 assert.equal(priceChange({cost:'¥ 100 / 年',payments:[{id:'1',paidOn:'2025-03-01',amount:10,currency:'USD',months:12,status:'paid'}]}),null);
});

test('ledger rows, totals and a spreadsheet-safe CSV',()=>{
 const assets=[
  {id:'a',type:'server',name:'=cmd()',provider:'Vultr',project:'notes',payments:[{id:'1',paidOn:'2026-02-01',amount:6,currency:'USD',months:1,covers:'2026-02-01',status:'paid'},{id:'2',paidOn:'2026-03-01',amount:0,currency:'',covers:'2026-03-01',status:'missed'}]},
  {id:'b',type:'domain',name:'x, "y"',provider:'平台待补充',payments:[{id:'3',paidOn:'2025-12-30',amount:80,currency:'CNY',months:12,status:'paid'},{id:'4',paidOn:'2026-01-15',amount:85,currency:'CNY',months:12,status:'paid'}]}
 ];
 const rows=ledgerRows(assets,{from:'2026-01-01',to:'2026-12-31',typeName:t=>({server:'服务器',domain:'域名'})[t]});
 assert.deepEqual(rows.map(r=>`${r.date} ${r.name} ${r.amount}`),['2026-01-15 x, "y" 85','2026-02-01 =cmd() 6']);
 assert.equal(rows[0].provider,'');
 assert.deepEqual(paidTotals(assets,{from:'2026-01-01',to:'2026-12-31'}).byCurrency,[['CNY',85],['USD',6]]);
 const csv=ledgerCsv(rows,{converted:{currency:'CNY',rates:{USD:1,CNY:7}}});
 assert.ok(csv.startsWith('﻿付款日期,'));
 assert.ok(csv.includes('"x, ""y"""'));
 assert.ok(csv.includes("'=cmd()"));
 assert.ok(csv.includes('6.00,USD,1,2026-02-01,,42.00'));
 assert.equal(csvCell('-1'),"'-1");
});

test('projects: names by use, and a shutdown plan in deadline order with what is shared',()=>{
 const assets=[
  {id:'d',type:'domain',name:'notes.dev',project:' Notes ',date:'2026-12-01',dateKind:'expire',cycle:'yearly',cost:'$12 / 年'},
  {id:'s',type:'server',name:'box',project:'Notes',date:'2026-10-25',dateKind:'renew',cycle:'monthly',cost:'$6 / 月',links:['other']},
  {id:'r',type:'repository',name:'me/notes',project:'Notes'},
  {id:'c',type:'bankcard',name:'Visa',project:'Notes'},
  {id:'other',type:'domain',name:'blog.dev',project:'Blog'},
  {id:'h',type:'subscription',name:'gone',project:'Notes',hiddenAt:'2026-01-01'}
 ];
 assert.equal(cleanProject('  a   b '),'a b');
 assert.deepEqual(projectNames(assets),[{name:'Notes',count:4},{name:'Blog',count:1}]);
 const plan=shutdownPlan(assets,'Notes',{now:at('2026-10-21'),currency:'USD',rates:{USD:1}});
 assert.deepEqual(plan.steps.map(s=>s.asset.id),['s','d','r']);
 assert.equal(plan.steps[0].action,'备份数据，然后删除实例');
 assert.equal(plan.steps[0].days,4);
 assert.deepEqual(plan.steps[0].shared,['blog.dev']);
 assert.equal(plan.steps[1].action,'关掉自动续费，或转出给别人');
 assert.deepEqual(plan.kept.map(a=>a.id),['c']);
 assert.equal(Math.round(plan.monthlySaving*100),700);
});

test('reviewQueue puts expensive, untouched records first and rests recently reviewed ones',()=>{
 const now=at('2026-10-21'),old='2025-10-01T00:00:00Z';
 const assets=[
  {id:'cheap',type:'subscription',name:'cheap',cost:'$1 / 月',cycle:'monthly',createdAt:old},
  {id:'dear',type:'subscription',name:'dear',cost:'$30 / 月',cycle:'monthly',createdAt:old},
  {id:'fresh',type:'subscription',name:'fresh',cost:'$50 / 月',cycle:'monthly',createdAt:old,reviewedAt:'2026-10-01T00:00:00Z'},
  {id:'card',type:'bankcard',name:'card',date:'2027-01-01'},
  {id:'free',type:'repository',name:'free'},
  {id:'dated',type:'domain',name:'dated.dev',date:'2027-01-01',createdAt:old}
 ];
 assert.deepEqual(reviewQueue(assets,{now,currency:'USD',rates:{USD:1}}).map(x=>x.asset.id),['dear','cheap','dated']);
});

test('reviewQueue starts the clock when a record is added and lets it join only after the quiet days',()=>{
 const now=at('2026-10-22'),sub=extra=>({type:'subscription',cost:'$10 / 月',cycle:'monthly',...extra});
 const ids=assets=>reviewQueue(assets,{now,currency:'USD',rates:{USD:1}}).map(x=>x.asset.id);
 assert.deepEqual(ids([sub({id:'new',name:'new',createdAt:'2026-10-20T08:00:00Z'})]),[],'Just added: waits');
 assert.deepEqual(ids([sub({id:'d79',name:'d79',createdAt:'2026-08-04T10:00:00'})]),[],'79 days after adding: still waits');
 assert.deepEqual(ids([sub({id:'d80',name:'d80',createdAt:'2026-08-03T10:00:00'})]),['d80'],'80 days after adding: joins');
 assert.deepEqual(ids([sub({id:'kept',name:'kept',createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-02-01T00:00:00Z',reviewedAt:'2026-09-01T00:00:00Z'})]),[],'Old but reviewed lately: waits');
 assert.deepEqual(ids([sub({id:'oldupd',name:'oldupd',updatedAt:'2026-10-10T00:00:00Z'})]),[],'No createdAt: updatedAt starts the clock');
 assert.deepEqual(ids([sub({id:'bare',name:'bare'})]),['bare'],'No time at all: joins');
 assert.deepEqual(ids([sub({id:'edited',name:'edited',createdAt:'2025-01-01T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z'})]),['edited'],'An edit does not restart the clock');
});

test('calendarIcs writes repeating all-day events with 09:00 alarms and folded, escaped lines',()=>{
 const ics=calendarIcs([
  {id:'a',name:'tokyo, vps; 东京服务器东京服务器东京服务器东京服务器东京服务器',date:'2026-11-05',dateKind:'renew',cycle:'monthly',cost:'$6 / 月',provider:'Vultr'},
  {id:'b',name:'notes.dev',date:'2027-03-01',dateKind:'expire'},
  {id:'c',name:'hidden',date:'2027-03-01',hiddenAt:'2026-01-01'},
  {id:'d',name:'nodate'}
 ],{now:new Date('2026-10-21T00:00:00Z')});
 assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
 assert.ok(ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1'));
 assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105'));
 assert.ok(ics.includes('DTEND;VALUE=DATE:20261106'));
 assert.ok(ics.includes('tokyo\\, vps\\; '));
 assert.ok(ics.includes('TRIGGER:-P2DT15H')&&ics.includes('TRIGGER:-PT15H')&&ics.includes('TRIGGER:-P29DT15H'));
 for(const line of ics.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75,line);
 assert.equal(icsFold('x'.repeat(80)),'x'.repeat(75)+'\r\n '+'x'.repeat(5));
});

test('handoverHtml lists live records by category, escapes everything and can mask',()=>{
 const board={assets:[
  {id:'d',type:'domain',name:'<b>notes.dev</b>',provider:'Namecheap',account:'me@example.org',date:'2027-03-01',cost:'$12 / 年',url:'https://ap.www.namecheap.com',notes:'transfer code is in 1Password',links:['c']},
  {id:'c',type:'bankcard',name:'Visa',last4:'4242',network:'Visa',cardStatus:'closed'},
  {id:'h',type:'domain',name:'gone.dev',hiddenAt:'2026-01-01'}
 ]};
 const html=handoverHtml(board,{now:at('2026-10-21'),types:{domain:'域名',bankcard:'银行卡'},order:['domain','bankcard']});
 assert.ok(html.includes('&lt;b&gt;notes.dev&lt;/b&gt;'));
 assert.ok(!html.includes('gone.dev'));
 assert.ok(html.indexOf('<h2>域名</h2>')<html.indexOf('<h2>银行卡</h2>'));
 assert.ok(html.includes('me@example.org')&&html.includes('Visa •••• 4242，发卡方停业'),'the card row carries its status');
 const masked=handoverHtml(board,{now:at('2026-10-21'),mask:true,types:{domain:'域名'}});
 assert.ok(!masked.includes('me@example.org')&&masked.includes('名称和账号已遮挡'));
});

test('rdapFacts reads the expiry and registrar; rdapCompare checks the stored date',()=>{
 const json={events:[{eventAction:'registration',eventDate:'2020-03-01T10:00:00Z'},{eventAction:'expiration',eventDate:'2027-03-01T23:59:59Z'}],entities:[{roles:['registrar'],vcardArray:['vcard',[['version',{},'text','4.0'],['fn',{},'text','NameCheap, Inc.']]]}]};
 assert.deepEqual(rdapFacts(json),{expires:'2027-03-01',registrar:'NameCheap, Inc.',phase:''});
 assert.deepEqual(rdapFacts(null),{expires:'',registrar:'',phase:''});
 assert.equal(rdapCompare({date:'2027-03-01'},{expires:'2027-03-01'}).state,'same');
 assert.equal(rdapCompare({date:'2026-03-01',cycle:'yearly'},{expires:'2027-03-01'},at('2026-10-21')).state,'same');
 assert.deepEqual(rdapCompare({date:'2026-12-01'},{expires:'2027-03-01'}),{state:'differs',registry:'2027-03-01',stored:'2026-12-01'});
 assert.equal(rdapCompare({},{expires:'2027-03-01'}).state,'missing');
 assert.equal(rdapCompare({date:'2027-03-01'},{expires:''}).state,'unknown');
});

test('costTotals is unchanged by payments',()=>{
 const a={type:'server',cost:'$6 / 月',cycle:'monthly',payments:[{id:'1',paidOn:'2026-01-01',amount:6,currency:'USD',months:1,status:'paid'}]};
 assert.equal(costTotals([a],{currency:'USD',rates:{USD:1}}).monthly,6);
});

test('billing types: zero and 免费 are free, explicit one-off is summed apart, a missing cycle stays unknown',()=>{
 const {isFreeCost,billingTypeOf}=require('../asset-data.js');
 for(const text of ['0','$0','¥0 / 月','USD 0','免费','Free tier','0.00'])assert.ok(isFreeCost(text),text);
 for(const text of ['','$10','未知','10 / 月'])assert.ok(!isFreeCost(text),text);
 assert.equal(billingTypeOf({cost:'0'}),'free');
 assert.equal(billingTypeOf({cost:'$5 / 月'}),'recurring');
 assert.equal(billingTypeOf({cost:'$25'}),'unknown');
 assert.equal(billingTypeOf({cost:'$25',billingType:'one_off'}),'one_off');
 const t=costTotals([
  {id:'g',type:'ai',name:'Gemini',cost:'0'},{id:'s',type:'database',name:'Supabase',cost:'$0 / 月',cycle:'monthly'},
  {id:'p',type:'license',name:'Play Console',cost:'$25',billingType:'one_off'},{id:'u',type:'license',name:'?',cost:'$25'},
  {id:'r',type:'subscription',name:'r',cost:'$10 / 月'}
 ],{currency:'USD',rates:{USD:1}});
 assert.deepEqual([t.free.map(a=>a.id),t.oneOff.map(a=>a.id),t.noCycle.map(a=>a.id),t.unreadable.map(a=>a.id)],[['g','s'],['p'],['u'],[]]);
 assert.equal(t.oneOffTotal,25);assert.equal(t.monthly,10);
});

test('promotions price the promo window, then the regular price, and settle into the cost with history',()=>{
 const {validPromotion,moneyOn,settlePromotions,dayNumber}=require('../asset-data.js');
 assert.equal(validPromotion({end:'2026-12-31',amount:8,regularAmount:0,currency:'USD'}),null);
 assert.equal(validPromotion({start:'2027-01-01',end:'2026-12-31',amount:8,regularAmount:30,currency:'USD'}),null);
 const grok={id:'g',type:'ai',name:'Grok',cost:'$30 / 月',cycle:'monthly',dateKind:'renew',date:'2026-11-05',promotion:{start:'2026-09-01',end:'2026-12-31',amount:8,regularAmount:30,currency:'usd'}};
 assert.equal(moneyOn(grok,dayNumber('2026-11-05')).value,8);
 assert.equal(moneyOn(grok,dayNumber('2027-01-05')).value,30);
 assert.equal(moneyOn(grok,dayNumber('2027-01-05')).basis,'regular');
 assert.equal(costTotals([grok],{currency:'USD',rates:{USD:1},now:at('2026-11-01')}).monthly,8);
 grok.cost='$8 / 月';
 assert.deepEqual(settlePromotions([grok],at('2026-12-31')),[]);
 assert.equal(settlePromotions([grok],at('2027-01-01')).length,1);
 assert.equal(grok.cost,'$30 / 月');
 assert.ok(grok.promotion.settledAt);
 assert.deepEqual([grok.costHistory[0].amountFrom,grok.costHistory[0].amountTo,grok.costHistory[0].currencyTo,grok.costHistory[0].source],[8,30,'USD','promotion-end']);
 assert.deepEqual(settlePromotions([grok],at('2027-02-01')),[],'settles once');
});

test('noteCostChange records old and new amounts only when the text changed',()=>{
 const {noteCostChange}=require('../asset-data.js');
 const a={cost:'¥ 99 / 年'};
 assert.equal(noteCostChange(a,'¥ 99 / 年'),null);
 const entry=noteCostChange(a,'¥ 89 / 年','agent',new Date('2026-10-21T00:00:00Z'));
 assert.deepEqual([entry.amountFrom,entry.amountTo,entry.currencyFrom,entry.currencyTo,entry.source,entry.at],[89,99,'CNY','CNY','agent','2026-10-21T00:00:00.000Z']);
 a.cost='免费';noteCostChange(a,'¥ 99 / 年');
 assert.equal(a.costHistory.at(-1).amountTo,0);
});

test('costForecast prices each charge on its own day: promo end, trial end, renewals, one-offs and undated spreads',()=>{
 const {costForecast}=require('../asset-data.js');
 const f=costForecast([
  {id:'g',type:'ai',name:'Grok',cost:'$8 / 月',cycle:'monthly',dateKind:'renew',date:'2026-11-05',promotion:{end:'2026-12-31',amount:8,regularAmount:30,currency:'USD'}},
  {id:'t',type:'subscription',name:'Trial',cost:'$10 / 月',cycle:'monthly',dateKind:'trial',date:'2027-01-10'},
  {id:'d',type:'domain',name:'x.dev',cost:'$12 / 年',dateKind:'expire',date:'2026-12-01'},
  {id:'o',type:'license',name:'Play',cost:'$25',billingType:'one_off',date:'2026-11-20'},
  {id:'s',type:'server',name:'box',cost:'$6 / 月'},
  {id:'f',type:'ai',name:'Gemini',cost:'0'},
  {id:'u',type:'license',name:'?',cost:'$40'}
 ],{from:'2026-11-01',to:'2027-01-31',currency:'USD',rates:{USD:1},now:at('2026-10-21')});
 const of=id=>f.items.filter(i=>i.id===id).map(i=>`${i.date}:${i.amount}:${i.basis}`);
 assert.deepEqual(of('g'),['2026-11-05:8:promotion','2026-12-05:8:promotion','2027-01-05:30:promotion-ended']);
 assert.deepEqual(of('t'),['2027-01-10:10:trial-ends']);
 assert.deepEqual(of('d'),['2026-12-01:12:charge']);
 assert.deepEqual(of('o'),['2026-11-20:25:one_off']);
 assert.equal(of('s').length,3);
 assert.equal(of('f').length,0);
 assert.deepEqual(f.notCounted.noCycle,['u']);
 assert.equal(f.total,8+8+30+10+12+25+18);
 assert.deepEqual(f.byMonth.map(m=>m.month),['2026-11','2026-12','2027-01']);
});

test('costForecast lists every month in range, months without a charge as 0',()=>{
 const {costForecast}=require('../asset-data.js');
 // Today is 2026-10-22; the yearly domain renews 2026-11-01 (just over the month end) and the plan is charged in January only.
 const f=costForecast([
  {id:'d',type:'domain',name:'x.dev',cost:'$12 / 年',dateKind:'expire',date:'2026-11-01'},
  {id:'p',type:'subscription',name:'Plan',cost:'$30 / 年',cycle:'yearly',dateKind:'renew',date:'2027-01-15'}
 ],{from:'2026-10-22',to:'2027-09-30',currency:'USD',rates:{USD:1},now:at('2026-10-22')});
 assert.deepEqual(f.byMonth.map(m=>m.month),['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08','2027-09']);
 assert.deepEqual(f.byMonth.map(m=>m.total),[0,12,0,30,0,0,0,0,0,0,0,0]);
 assert.equal(f.total,42);
 const none=costForecast([],{from:'2026-10-22',to:'2027-09-30',currency:'USD',rates:{USD:1}});
 assert.equal(none.byMonth.length,12);assert.equal(none.items.length,0);assert.equal(none.total,0);
});

test('rdapFacts reads the lifecycle phase; past expiry the registry date is not taken as a renewal',()=>{
 const json=phase=>({status:['client transfer prohibited',...phase],events:[{eventAction:'expiration',eventDate:'2027-03-01T00:00:00Z'}]});
 assert.equal(rdapFacts(json(['auto renew period'])).phase,'autoRenew');
 assert.equal(rdapFacts(json(['Redemption Period'])).phase,'redemption');
 assert.equal(rdapFacts(json(['redemption period','pending delete'])).phase,'pendingDelete','the later phase wins');
 assert.equal(rdapFacts(json([])).phase,'');
 assert.deepEqual(rdapCompare({date:'2026-03-01'},rdapFacts(json(['auto renew period']))),{state:'phase',phase:'autoRenew',registry:'2027-03-01'});
 const checked={registryPhase:'redemption',registryCheckedAt:'2026-10-01T10:00:00Z'};
 assert.equal(registryPhaseOf(checked,at('2026-10-20')),'redemption');
 assert.equal(registryPhaseOf(checked,at('2026-12-20')),'','an old reading is no longer shown');
 assert.equal(registryPhaseOf({registryPhase:'bogus',registryCheckedAt:'2026-10-01'},at('2026-10-02')),'');
});

test('pendingRenewals asks about an auto-renewing expiry from the day after; the answer rolls it on or lets it expire',()=>{
 const domain=()=>({id:'d',name:'auto.dev',date:'2025-10-05',dateKind:'expire',cycle:'yearly',cost:'$10 / 年',createdAt:'2025-01-01T00:00:00Z'});
 assert.deepEqual(pendingRenewals([domain()],{now:at('2026-10-05')}),[],'not on the day itself');
 const [c]=pendingRenewals([domain()],{now:at('2026-10-07')});
 assert.equal(c.due,'2026-10-05');assert.equal(c.days,2);
 assert.deepEqual(pendingRenewals([domain()],{now:at('2026-12-01')}),[],'outside the confirm window');
 assert.deepEqual(pendingRenewals([{...domain(),dateKind:'renew'}],{now:at('2026-10-07')}),[],'charges are pendingCharges');
 assert.deepEqual(pendingRenewals([{...domain(),cycle:''}],{now:at('2026-10-07')}),[],'a one-off expiry just expires');
 assert.deepEqual(pendingRenewals([{...domain(),stopped:true}],{now:at('2026-10-07')}),[]);
 const yes=domain();yes.registryPhase='autoRenew';
 const done=confirmRenewal(yes,'2026-10-05',{now:at('2026-10-07')});
 assert.equal(done.renewed,true);assert.equal(yes.date,'2027-10-05');assert.equal(yes.cycle,'yearly');assert.equal(yes.registryPhase,undefined);
 assert.equal(done.payment.amount,10);assert.equal(done.payment.covers,'2026-10-05');
 assert.deepEqual(pendingRenewals([yes],{now:at('2026-10-07')}),[]);
 const unknown={...domain(),cost:'未知'};assert.equal(confirmRenewal(unknown,'2026-10-05',{now:at('2026-10-07')}).payment,null);assert.equal(unknown.date,'2027-10-05');
 const no=domain();
 assert.equal(confirmRenewal(no,'2026-10-05',{renewed:false,now:at('2026-10-07')}).renewed,false);
 assert.equal(no.date,'2026-10-05');assert.equal(no.cycle,'');
 assert.deepEqual(pendingRenewals([no],{now:at('2026-10-07')}),[]);
 assert.equal(confirmRenewal({date:'2026-10-05'},'2026-10-05'),null,'needs a cycle');
});

test('a repeating keep-alive deadline is asked about too, with its own words',()=>{
 const phone={id:'p',type:'phone',name:'giffgaff',provider:'giffgaff',date:'2026-04-05',dateKind:'keep',cycle:'halfyearly',createdAt:'2026-01-01T00:00:00Z'};
 const [c]=pendingRenewals([phone],{now:at('2026-10-07')});
 assert.equal(c.kind,'keep');assert.equal(c.due,'2026-10-05');
 const D=require('../asset-data.js');
 assert.equal(D.confirmWords[c.kind].ask,'保号做了吗');
 const done={...phone};D.confirmRenewal(done,'2026-10-05');assert.equal(done.date,'2027-04-05');
 const lapsed={...phone};D.confirmRenewal(lapsed,'2026-10-05',{renewed:false});
 assert.equal(lapsed.cycle,'');assert.ok(D.runsOut(lapsed));
 assert.ok(D.reminderPlan([phone],new Date(2026,9,1,8)).some(r=>r.body==='昨天是保号期限，这次保号做了吗'));
});

test('lifecycle rules give the stage after expiry and the days left; unknown providers get none',()=>{
 const D=require('../asset-data.js');
 const ecs={type:'server',name:'web-1',provider:'阿里云',date:'2026-10-01',dateKind:'expire'};
 assert.equal(D.lifecycleOf(ecs,at('2026-10-01')),null,'not on the day itself');
 assert.deepEqual((({gone,daysLeft,label})=>({gone,daysLeft,label}))(D.lifecycleOf(ecs,at('2026-10-02'))),{gone:false,daysLeft:13,label:'已停机 · 还剩 14 天'});
 assert.equal(D.lifecycleOf(ecs,at('2026-10-16')).gone,true);
 assert.equal(D.lifecycleOf({...ecs,cycle:'yearly'},at('2026-10-05')),null,'a repeating date is asked about, not timed');
 assert.equal(D.lifecycleOf({...ecs,provider:'Hetzner'},at('2026-10-05')),null);
 const dom={type:'domain',name:'shop.com',provider:'Namecheap',date:'2026-10-01',dateKind:'expire'};
 assert.equal(D.lifecycleOf(dom,at('2026-11-05')).stage.label,'赎回期');
 assert.equal(D.lifecycleRule({...dom,name:'shop.io'}),null,'country-code domains follow their own registry rules');
 assert.equal(D.lifecycleRule({type:'database',provider:'Render',cost:'$7 / 月'}),null,'the Render rule is for the free database only');
 assert.ok(D.lifecycleRule({type:'database',provider:'Render',cost:'免费',dateKind:'expire'}));
 // Reminders follow the stages instead of days 3 and 14, and the usual leads carry the consequence.
 const plan=D.reminderPlan([ecs],new Date(2026,8,20,8)).map(r=>[r.when.slice(0,10),r.body]);
 assert.ok(plan.some(([day,body])=>day==='2026-09-24'&&body==='7 天后到期，过期即停机，约 15 天后释放，数据不可恢复'));
 assert.ok(plan.some(([day,body])=>day==='2026-10-02'&&body.startsWith('已过期，已停机：续费后恢复')));
 assert.ok(plan.some(([day,body])=>day==='2026-10-13'&&body==='已停机只剩 3 天：续费后恢复，数据还在'));
 assert.ok(!plan.some(([day])=>day==='2026-10-04'),'no generic day-3 note when a rule applies');
});

test('cardOutlook lists the next month of charges and recent missed ones on what the card pays',()=>{
 const D=require('../asset-data.js');
 const a=[{id:'card',type:'bankcard',name:'Visa',date:'2028-01-31'},
  {id:'sub',type:'subscription',name:'Editor',date:'2026-01-12',dateKind:'renew',cycle:'monthly',cost:'$10 / 月',payments:[{id:'x',paidOn:'2026-09-12',covers:'2026-09-12',status:'missed',amount:0,currency:''}]},
  {id:'dom',type:'domain',name:'a.com',date:'2025-10-20',dateKind:'expire',cycle:'yearly',cost:'$12 / 年'},
  {id:'far',type:'subscription',name:'Far',date:'2026-12-20',dateKind:'renew',cycle:'yearly',cost:'$99 / 年'}];
 for(const id of ['sub','dom','far'])D.linkRelation(a,'card',id);
 const look=D.cardOutlook(a,a[0],{now:at('2026-10-05')});
 assert.deepEqual(look.upcoming.map(u=>[u.asset.id,u.due]),[['sub','2026-10-12'],['dom','2026-10-20']]);
 assert.deepEqual(look.totals,[['USD',22]]);
 assert.deepEqual(look.missed.map(m=>m.asset.id),['sub']);
 assert.equal(D.cardOutlook(a,a[0],{now:at('2026-12-01')}).missed.length,0,'older than 60 days');
});

test('a number that is some account\'s only one: who it locks out, directly and through sign-in, and its reminders say so',()=>{
 const D=require('../asset-data.js');
 const assets=[
  {id:'uk',type:'phone',name:'英国号',date:'2026-10-10',dateKind:'keep',cycle:'halfyearly',links:['g','a','b']},
  {id:'hk',type:'phone',name:'香港号',links:['b']},
  {id:'g',type:'google',name:'Google 主号',links:['uk','gpt','cur']},
  {id:'a',type:'appleid',name:'美区主号',links:['uk']},
  {id:'b',type:'appleid',name:'港区备用',links:['uk','hk']},
  {id:'gpt',type:'ai',name:'ChatGPT Plus',links:['g']},
  {id:'cur',type:'subscription',name:'Cursor',links:['g']}
 ];
 const by=id=>assets.find(x=>x.id===id),ids=list=>list.map(x=>x.id).sort();
 assert.deepEqual(ids(D.verifyNumbers(assets,by('b'))),['hk','uk']);
 const reach=D.phoneReach(assets,by('uk'));
 assert.deepEqual(ids(reach.only),['a','g']);assert.deepEqual(ids(reach.backed),['b']);assert.deepEqual(ids(reach.via),['cur','gpt'],'what signs in through the locked accounts');
 assert.equal(D.phoneStake(assets,by('uk')),'Google 主号、美区主号只靠它收验证码，连同经它们登录的 2 项');
 assert.equal(D.phoneStake(assets,by('hk')),'','a backup number locks nobody out');
 // A hidden backup does not count, so the account falls back to having one number.
 by('hk').hiddenAt='2026-01-01';assert.deepEqual(ids(D.phoneReach(assets,by('uk')).only),['a','b','g']);
 assert.ok(D.phoneStake(assets,by('uk')).startsWith('Google 主号、美区主号 等 3 个账号'));delete by('hk').hiddenAt;
 // The reminder for the number's keep date carries the stake.
 const plan=D.reminderPlan(assets,new Date(2026,9,1,8));
 assert.ok(plan.some(r=>r.body==='7 天后保号到期 · Google 主号、美区主号只靠它收验证码，连同经它们登录的 2 项'),JSON.stringify(plan.map(r=>r.body)));
});

test('an automatic sync that stopped shows up per source and account; manual sources and fresh ones do not',()=>{
 const D=require('../asset-data.js'),now=new Date(2026,9,23,10);
 const at=day=>new Date(2026,9,day,9).toISOString();
 const assets=[
  {id:'a',source:'cloudflare',account:'Work',syncedAt:at(15)},{id:'b',source:'cloudflare',account:'Work',syncedAt:at(18)},
  {id:'c',source:'cloudflare',account:'Home',syncedAt:at(22)},
  {id:'d',source:'cloudflare',account:'Old',syncedAt:at(1),hiddenAt:'x'},{id:'e',source:'cloudflare',account:'Gone',syncedAt:at(1),syncMissing:true},
  {id:'g',source:'github',account:'me',syncedAt:at(1)},{id:'m',source:'manual'}
 ];
 const stale=D.staleSyncs(assets,{now,auto:['cloudflare']});
 assert.deepEqual(stale.map(g=>[g.name,g.account,g.days,g.count]),[['Cloudflare','Work',5,2]],'the newest sync of the account counts');
 assert.deepEqual(D.staleSyncs(assets,{now}),[],'nothing is automatic, nothing is stale');
 assert.equal(D.staleSyncs([{source:'cloudflare',syncedAt:at(20)}],{now,auto:['cloudflare']}).length,0,`within ${D.STALE_SYNC_DAYS} days is fine`);
});

test('missed reminders: what went off between the last look and now, one entry per record, latest first',()=>{
 const D=require('../asset-data.js');
 const assets=[
  {id:'d',name:'gone.dev',date:'2026-10-20',dateKind:'expire'},
  {id:'s',name:'Editor Pro',date:'2026-10-24',dateKind:'renew',cycle:'monthly'},
  {id:'f',name:'far.dev',date:'2027-03-01',dateKind:'expire'},
  {id:'x',name:'stopped.dev',date:'2026-10-20',dateKind:'expire',stopped:true}
 ];
 // Away from the 15th, 20:00 to the 23rd, 10:00.
 const missed=D.missedReminders(assets,new Date(2026,9,15,20),new Date(2026,9,23,10));
 assert.deepEqual(missed.map(m=>[m.id,m.day]),[['s','2026-10-23'],['d','2026-10-23']],'the same day goes by name: '+JSON.stringify(missed));
 assert.ok(!missed.some(m=>m.id==='f'||m.id==='x'),'nothing far off, nothing stopped');
 // Before 09:00 today's reminders have not gone off yet.
 assert.deepEqual(D.missedReminders(assets,new Date(2026,9,22,20),new Date(2026,9,23,8)).map(m=>m.id),[]);
 // Back the same evening: nothing new.
 assert.deepEqual(D.missedReminders(assets,new Date(2026,9,23,10),new Date(2026,9,23,20)).map(m=>m.id),[]);
});

