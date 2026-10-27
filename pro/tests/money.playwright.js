// Run with the browser tool's filename option. v21 money: 已续费 (R) with payment and price, charges waiting in 即将到来, the inspector's
// payments, price marks, projects with the shutdown list, the review round, exports, the form's billing/promotion/project fields,
// the agent methods (free, one-off, promotion, batch update and delete with action status, payments, renew, forecast, history),
// the delete-request banner, and the top bar staying flush right. Uses an isolated page and never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.waitForTimeout(250);
 const mod=process.platform==='darwin'?'Meta':'Control';
 const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
 const asset=id=>p.evaluate(id=>JSON.parse(JSON.stringify(state.assets.find(a=>a.id===id)||null)),id);
 // "Today" is pinned to 2026-10-22: notes.dev (day 10) then renews on 11-01, so October has no charge and must still show.
 await p.clock.setFixedTime(new Date('2026-10-22T12:00:00'));
 try{
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{try{localStorage.removeItem('assetboard-view-v1');}catch{}});
  await p.reload();
  await p.evaluate(()=>{save=()=>{noteCostChanges();};const day=n=>isoDay(localDay()+n),old='2025-01-01T00:00:00Z';
   const a=(id,type,name,extra={})=>({id,type,name,provider:'Test',account:'',purpose:'',date:'',cost:'',art:'generic',url:'',source:'manual',createdAt:old,...extra});
   state={blocks:['domain','server','subscription','ai','repository'].map(id=>({id,width:50,height:null,density:'full',folded:false})),assets:[
    a('d1','domain','notes.dev',{date:day(10),dateKind:'expire',cost:'$12 / 年',project:'notes',payments:[{id:'p0',paidOn:day(-355),amount:9.5,currency:'USD',months:12,covers:day(-355),via:'renew',status:'paid'}]}),
    a('s1','server','box',{date:day(-3),dateKind:'renew',cycle:'monthly',cost:'$6 / 月',project:'notes',links:['d2']}),
    a('d2','domain','blog.dev',{date:day(200),dateKind:'expire',links:['s1']}),
    a('u1','subscription','Notes Pro',{date:day(-5),dateKind:'renew',cycle:'monthly',cost:'$8 / 月'}),
    a('r1','repository','me/notes',{project:'notes'})
   ],deletedExternalIds:[],paymentsSince:day(-40)};history=[];future=[];rememberCosts();setView('all');render();});
  await settle();

  // A price rise against the last payment shows on the row.
  check(await p.locator('#board [data-asset="d1"] .price-mark.up').count()===1,'The row marks the price rise');

  // 已续费 with R: the term chips, the amount for that term, the date moves, the payment is written, one undo.
  await p.locator('#board [data-asset="d1"] .item-open').focus();await p.keyboard.press('r');await settle();
  check(await p.evaluate(()=>$('#modal').open&&$('#modal').dataset.view==='renew'),'R opens the renewal');
  check(await p.locator('#renew-form [name="amount"]').inputValue()==='12','The amount follows the price for one term');
  await p.click('#renew-form [data-choice="renewStep"]:nth-of-type(2)');
  check(await p.locator('#renew-form [name="amount"]').inputValue()==='24','Two years suggest twice the yearly price');
  await p.click('#renew-form [data-choice="renewStep"]:nth-of-type(1)');
  await p.fill('#renew-form [name="amount"]','15');await settle();
  check(await p.locator('#renew-form .renew-cost').isVisible()&&(await p.locator('#renew-form .renew-cost').innerText()).includes('$15 / 年'),'A different amount offers to update the price');
  const before=(await asset('d1')).date;
  await p.click('#renew-form [type="submit"]');await settle();
  let d1=await asset('d1');
  check(d1.date===await p.evaluate(b=>addMonths(b,12),before)&&d1.payments.length===2&&d1.payments[1].amount===15&&d1.payments[1].covers===before&&d1.cost==='$15 / 年','Renewed: '+JSON.stringify([d1.date,d1.cost,d1.payments.at(-1)]));
  check(d1.costHistory?.at(-1)?.source==='renew'&&d1.costHistory.at(-1).amountFrom===12&&d1.costHistory.at(-1).amountTo===15,'The price change is in the history: '+JSON.stringify(d1.costHistory));
  await p.keyboard.press(`${mod}+z`);await settle();
  d1=await asset('d1');check(d1.date===before&&d1.payments.length===1&&d1.cost==='$12 / 年','One undo restores date, payment and price');

  // Charges waiting: 即将到来 opens with them; paid as usual, a different amount, and not taken.
  await p.click('#sidebar .nav-item[data-id="upcoming"]');await settle();
  check(await p.locator('#board .charges-band .charge-row').count()===2,'Two charges wait in 即将到来');
  await p.click('#board .charges-band [data-action="charge-paid"][data-id="s1"]');await settle();
  check((await asset('s1')).payments?.[0]?.amount===6&&await p.locator('#board .charges-band .charge-row').count()===1,'已扣款 records the usual amount');
  await p.click('#board .charges-band [data-action="charge-edit"][data-id="u1"]');await settle();
  await p.fill('#payment-form [name="amount"]','9.5');await p.check('#payment-form [name="updateCost"]');await p.click('#payment-form [type="submit"]');await settle();
  const u1=await asset('u1');
  check(u1.payments[0].amount===9.5&&u1.payments[0].covers===u1.date&&u1.cost==='$9.5 / 月'&&!await p.locator('#board .charges-band').count(),'A different amount is recorded and becomes the price: '+JSON.stringify([u1.cost,u1.payments]));
  await p.keyboard.press(`${mod}+z`);await settle();
  await p.click('#board .charges-band [data-action="charge-missed"][data-id="u1"]');await settle();
  check((await asset('u1')).payments[0].status==='missed','没扣 records a missed charge');

  // The inspector: payments with this year's total, removing a record, the renew button.
  await p.evaluate(()=>showDetail('s1',{focus:false}));await settle();
  check(await p.locator('#detail .pay-section .pay-list li').count()===1&&(await p.locator('#detail .pay-year').innerText()).includes('$6.00')&&await p.locator('#detail [data-action="renew"]').count()===1,'The inspector lists payments and offers 已续费');
  await p.hover('#detail .pay-list li');await p.click('#detail .pay-remove');await settle();
  check(!(await asset('s1')).payments,'A payment can be removed');

  // Projects: sidebar entry, its view with totals, the shutdown list in deadline order with what is shared, and finishing steps.
  check(await p.locator('#sidebar .nav-projects .nav-item[data-id="project:notes"]').count()===1,'Projects are listed in the sidebar');
  await p.click('#sidebar .nav-item[data-id="project:notes"]');await settle();
  check(await p.evaluate(()=>$('#view-title').textContent==='notes'&&document.querySelectorAll('#board [data-asset]').length===3),'The project view shows its records');
  await p.click('#board [data-action="shutdown"]');await settle();
  const steps=await p.evaluate(()=>[...document.querySelectorAll('#shutdown-form .shutdown-step strong')].map(n=>n.textContent));
  check(steps.join()==='notes.dev,box,me/notes','Shutdown steps follow the deadlines: '+steps);
  check((await p.locator('#shutdown-form .shutdown-warn').innerText()).includes('blog.dev'),'A record shared outside the project is flagged');
  await p.check('#shutdown-form input[value="s1"]');await p.check('#shutdown-form input[value="r1"]');await p.click('#shutdown-form [type="submit"]');await settle();
  check((await asset('s1')).stopped===true&&(await asset('r1')).stopped===true,'Finished steps stop the records');
  await p.keyboard.press(`${mod}+z`);await settle();

  // The review round: K keeps (and rests the record), H hides, → skips; closing keeps what was decided.
  await p.click('#sidebar [data-action="review"]');await settle();
  const first=await p.evaluate(()=>reviewRun.ids[0]);
  await p.keyboard.press('k');await settle();
  check(!!(await asset(first)).reviewedAt,'K marks the record as reviewed');
  const second=await p.evaluate(()=>reviewRun?.ids[reviewRun.index]);
  if(second){await p.keyboard.press('h');await settle();check(!!(await asset(second)).hiddenAt,'H hides the record');}
  await p.evaluate(()=>$('#modal').close());await settle();
  await p.evaluate(()=>{for(const a of state.assets){delete a.hiddenAt;delete a.reviewedAt;}render();});

  // Exports download in the browser: calendar, ledger, handover.
  await p.click('#sidebar [data-action="export"]');await settle();
  const grab=async action=>{const [download]=await Promise.all([p.waitForEvent('download'),p.click(`#modal [data-action="${action}"]`)]);return {name:download.suggestedFilename(),text:require('fs').readFileSync(await download.path(),'utf8')};};
  const ics=await grab('export-ics');
  check(ics.name.endsWith('.ics')&&ics.text.includes('BEGIN:VEVENT')&&ics.text.includes('SUMMARY:notes.dev 到期'),'Calendar export');
  await p.click('#modal [data-action="ledger-year"][data-id="all"]');
  const ledger=await grab('export-ledger');
  check(ledger.name.endsWith('.csv')&&ledger.text.includes('notes.dev')&&ledger.text.includes('9.50,USD'),'Ledger export: '+ledger.text.slice(0,200));
  const handover=await grab('export-handover');
  check(handover.name.endsWith('.html')&&handover.text.includes('资产交接清单')&&handover.text.includes('notes.dev'),'Handover export');
  await p.evaluate(()=>$('#modal').close());

  // The cost panel: paid this year, a forecast by month, splits by project.
  await p.evaluate(()=>{setView('all');costDialog();});await settle();
  check(await p.locator('#modal .forecast .forecast-bar').count()===12&&(await p.locator('#modal-content').innerText()).includes('按项目'),'Cost panel has the forecast and the project split');
  const bars=await p.locator('#modal .forecast .forecast-bar').evaluateAll(list=>list.map(b=>b.getAttribute('title')));
  check(bars[0].startsWith('2026-10：')&&/[^0-9.]0(\.00)?$/.test(bars[0])&&bars[1].startsWith('2026-11：')&&bars[11].startsWith('2027-09：'),'Forecast keeps the month without a charge as 0, across the month end: '+bars.join(' | '));
  await p.evaluate(()=>$('#modal').close());

  // The form: free billing, a promotion and a project.
  await p.evaluate(()=>assetForm('ai','',{name:'Grok'}));await settle();
  await p.evaluate(()=>{$('#asset-form .more-fields').open=true;});
  await p.fill('#asset-form [name="amount"]','30');await p.click('#asset-form [data-choice="currency"][data-value="USD"]');
  await p.click('#asset-form [data-choice="cycle"][data-value="monthly"]');
  await p.fill('#asset-form [name="promoAmount"]','8');await p.fill('#asset-form [name="promoEnd"]','2099-12-31');
  await p.fill('#asset-form [name="project"]','notes');
  check(!await p.locator('#asset-form [name="responsiblePerson"], #asset-form [data-choice="ownerType"]').count(),'The form has no owner or person in charge');
  await p.click('#asset-form [type="submit"]');await settle();
  const grok=await p.evaluate(()=>JSON.parse(JSON.stringify(state.assets.find(a=>a.name==='Grok'))));
  check(grok.promotion?.amount===8&&grok.promotion.regularAmount===30&&grok.promotion.currency==='USD'&&grok.project==='notes','The form saves promotion and project: '+JSON.stringify(grok));
  check(await p.evaluate(id=>costTotals([state.assets.find(a=>a.id===id)],{currency:'USD',rates:{USD:1}}).monthly,grok.id)===8,'Totals use the promo price');
  await p.evaluate(()=>assetForm('ai','',{name:'Gemini'}));await p.fill('#asset-form [name="amount"]','0');await p.click('#asset-form [type="submit"]');await settle();
  check(await p.evaluate(()=>billingTypeOf(state.assets.find(a=>a.name==='Gemini')))==='free','Amount 0 in the form is free');

  // Agents: free, one-off, promotion, filters and grouping.
  const added=(await call('add',{items:[{name:'Supabase',type:'subscription',amount:0},{name:'Play Console',type:'license',amount:25,currency:'USD',billingType:'one_off',project:'notes'},{name:'Grok API',type:'ai',amount:30,currency:'USD',cycle:'monthly',promotion:{end:'2099-01-31',amount:8}}]})).result;
  check(added.added.length===3,'Agent add: '+JSON.stringify(added));
  const [supa,play,grokApi]=added.added.map(x=>x.id);
  const supaGot=(await call('get',{id:supa})).result,grokGot=(await call('get',{id:grokApi})).result;
  check(supaGot.billingType==='free'&&supaGot.cost==='免费','Amount 0 from an agent is free');
  check(grokGot.promotion.regularAmount===30&&grokGot.currentPrice.amount===8&&grokGot.currentPrice.basis==='promotion','The promotion takes the current price as the regular one');
  const totals=(await call('totals',{currency:'USD',groupBy:'project'})).result;
  check(totals.notCounted.free.includes(supa)&&totals.notCounted.oneOff.includes(play)&&totals.oneOffTotal===25&&totals.groups.some(g=>g.project==='notes'),'Totals separate free and one-off and group by project: '+JSON.stringify({nc:totals.notCounted,g:totals.groups}));
  check((await call('list',{project:'notes',billingType:'one_off'})).result.assets.map(a=>a.id).join()===play,'List filters by project and billing type');
  check(/billingType/.test((await call('update',{id:play,fields:{billingType:'weekly'}})).error),'Unknown billing type is refused');
  check(/promotion/.test((await call('update',{id:play,fields:{promotion:{amount:3}}})).error),'A promotion without an end is refused');
  check(!(await call('update',{id:grokApi,fields:{promotion:null}})).result.asset.promotion,'promotion null removes it');

  // Batch update: per-item results, one undo step.
  const histBefore=await p.evaluate(()=>history.length);
  const batch=(await call('updateMany',{updates:[{id:supa,fields:{notes:'free tier'}},{id:'nope',fields:{notes:'x'}},{id:play,fields:{amount:-1}},{id:grokApi,fields:{notes:'Ana'}}]})).result;
  check(batch.updated===2&&batch.failed===2&&batch.results[1].ok===false&&batch.results[3].asset.notes==='Ana','Batch update reports each item: '+JSON.stringify(batch));
  check(await p.evaluate(()=>history.length)===histBefore+1,'A batch is one undo step');

  // Payments, renew, charges, forecast, history, projects from agents.
  const pay=(await call('recordPayment',{id:'s1',amount:6,currency:'USD',covers:(await asset('s1')).date})).result;
  check(pay.payment.amount===6&&!(pay.asset.unconfirmedCharges||[]).length,'Agent records a payment');
  check((await call('charges')).result.charges.every(c=>c.id!=='s1'),'Answered charges leave the list');
  const renewed=(await call('renew',{id:'d1',until:'2030-01-01',amount:30,currency:'USD'})).result;
  check(renewed.asset.date==='2030-01-01'&&renewed.payment.amount===30,'Agent renews');
  const forecast=(await call('forecast',{months:3,currency:'USD'})).result;
  check(forecast.items.length>0&&forecast.byMonth.length>=3&&typeof forecast.total==='number','Agent forecast');
  const hist=(await call('costHistory',{id:'u1'})).result;
  check(Array.isArray(hist.history)&&Array.isArray(hist.payments),'Agent cost history with payments');
  check((await call('projects')).result.projects.some(x=>x.name==='notes'),'Agent lists projects');

  // Delete requests: one action, a banner while a form is busy, one list, statuses readable afterwards.
  await p.evaluate(()=>assetForm('domain','d2'));await p.fill('#asset-form [name="notes"]','editing');
  const req=(await call('deleteMany',{ids:[supa,play,'ghost'],reason:'cleanup'})).result;
  check(req.status==='pending'&&req.actionId&&req.notFound[0]==='ghost','Batch delete returns an action: '+JSON.stringify(req));
  check((await call('action',{id:req.actionId})).result.status==='pending','The action is pending');
  check(await p.locator('#action-banner').isVisible()&&(await p.locator('#action-banner').innerText()).includes('2'),'A banner shows while the form is open');
  check((await call('delete',{id:supa})).result.alreadyPending?.[0]?.actionId===req.actionId,'Asking again points to the waiting request');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});await settle();
  await p.evaluate(()=>{if(!agentDeleteOpen)agentDeleteDialog();});await settle();
  check(await p.locator('#agent-delete input[name="agent-delete"]').count()===2&&!await p.locator('#action-banner').count(),'Both wait in one list and the banner goes: '+await p.locator('#agent-delete input[name="agent-delete"]').count()+' '+await p.locator('#action-banner').count()+' '+await p.evaluate(()=>agentDeleteOpen+' '+$('#modal').dataset.view+' '+intake.length));
  await p.uncheck(`#agent-delete input[name="agent-delete"] >> nth=1`);await p.click('#agent-delete-yes');await settle();
  const done=(await call('action',{id:req.actionId})).result;
  check(done.status==='done'&&done.items.map(i=>i.status).sort().join()==='deleted,kept'&&done.resolvedAt,'Statuses after confirming: '+JSON.stringify(done));
  check((await call('actions',{status:'done'})).result.actions[0].id===req.actionId,'Actions can be listed by status');
  await p.keyboard.press(`${mod}+z`);await settle();
  check((await call('action',{id:req.actionId})).result.status==='done','Undo does not rewrite what the agent was told');
  const req2=(await call('deleteMany',{ids:[supa]})).result;await settle();
  await p.click('#agent-delete-no');await settle();
  check((await call('action',{id:req2.actionId})).result.status==='cancelled','全部保留 cancels the request');

  // The top bar stays flush right on wide windows (the eye, layout and search do not drift left).
  for(const width of [1920,1100]){
   await p.setViewportSize({width,height:800});await p.evaluate(()=>closeDetail());await settle();
   const gap=await p.evaluate(()=>{const bar=document.querySelector('#topbar').getBoundingClientRect(),items=[...document.querySelectorAll('#topbar .actions > *, #topbar > .layout-toggle')].filter(e=>e.getClientRects().length),right=Math.max(...items.map(e=>e.getBoundingClientRect().right));return Math.round(bar.right-right);});
   check(gap>=8&&gap<=28,`Top bar is flush right at ${width}px (gap ${gap})`);
  }
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: price rise mark, R renews with term amounts/price update/history and one undo, charges paid/different/missed, inspector payments and removal, project view and shutdown order/shared/finish, review K/H, ics/csv/html exports, cost forecast and project split, form promotion/project/owner/free, agent free/one-off/promotion/filters/groupBy/refusals, batch update with one undo, payments/renew/charges/forecast/history/projects, batch delete with banner, one list, statuses outside undo, cancel, flush-right top bar';
}
