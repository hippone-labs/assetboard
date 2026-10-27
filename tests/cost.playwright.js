// Run with the browser tool's filename option. 费用: the header total, the panel with currency switch, rates from the app (asked only when needed, once), records keeping their own currency, amount/currency stored on save, and the agent's amount/currency and totals.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{
   window.__sent=[];window.__saved=null;
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save'){window.__saved=m.data;setTimeout(()=>assetboardSaved(m.sequence,true),5);}
    if(m.action==='evidenceList')setTimeout(()=>assetboardEvidenceList([]),5);
    if(m.action==='fxRates')setTimeout(()=>{assetboardFxRates({ok:true,date:'2026-10-20',source:'欧洲央行参考汇率',fetchedOn:'2026-10-21',rates:{USD:1,CNY:7,EUR:0.5,GBP:0.8,HKD:7.8,JPY:150,SGD:1.3,AUD:1.4,CAD:1.4}});window.__fxReplies=(window.__fxReplies||0)+1;},20);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[
    {id:'a',type:'subscription',name:'Notion',cost:'$10 / 月',cycle:'monthly',source:'manual',art:'generic'},
    {id:'b',type:'domain',name:'example.com',cost:'¥ 84 / 年',cycle:'yearly',source:'manual',art:'generic'},
    {id:'c',type:'subscription',name:'Figma',cost:'€6 / 3 个月',cycle:'quarterly',source:'manual',art:'generic'},
    {id:'o',type:'license',name:'Sketch',cost:'$99',source:'manual',art:'generic'},
    {id:'u',type:'ai',name:'Midjourney',cost:'约 100 元左右',source:'manual',art:'generic'},
    {id:'h',type:'ai',name:'Old AI',cost:'$20 / 月',hiddenAt:'2026-01-01T00:00:00Z',source:'manual',art:'generic'}
   ]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false,ai:null,aiKeySaved:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof costDialog==='function'&&!!document.querySelector('#view-meta .meta-cost'));

  // Rates are asked for once, because something needs converting; the header shows the converted monthly total.
  await until(p,()=>fx.fallback===false);
  check(await p.evaluate(()=>__sent.filter(m=>m.action==='fxRates').length===1),'Rates are asked for once');
  // With no choice made the most used currency is the default; CNY is pinned here for the numbers below.
  await p.evaluate(()=>{displayCurrency='CNY';render();});
  check((await p.locator('#view-meta .meta-cost').innerText())==='¥105.00 / 月','Header total in CNY: '+await p.locator('#view-meta .meta-cost').innerText());

  // The panel: totals, what is left out, per category, largest first, the rates used.
  await p.click('#view-meta .meta-cost');
  const text=await p.locator('#modal-content').innerText();
  check(text.includes('¥105.00')&&text.includes('¥1,260'),'Monthly and yearly totals: '+text.slice(0,200));
  check(text.includes('计入 3 项')&&text.includes('1 项没填周期')&&text.includes('1 项金额无法识别'),'What is counted and what is not');
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal .cost-items li .text-button')].map(b=>b.textContent).join()==='Notion,Figma,example.com'),'Largest first');
  check(await p.evaluate(()=>document.querySelectorAll('#modal .cost-type').length===2),'One bar per category');
  check(text.includes('欧洲央行参考汇率 2026-10-20')&&!text.includes('上次'),'The rates used are named');
  check(text.includes('$10.00 / 月')||text.includes('$10 / 月'),'Each record shows its own currency');

  // Switching the currency changes totals, header and the remembered choice, never the records.
  await p.click('#modal [data-action="cost-currency"][data-id="USD"]');
  check((await p.locator('#modal .cost-totals strong').first().innerText())==='$15.00','USD total: '+await p.locator('#modal .cost-totals strong').first().innerText());
  check((await p.locator('#view-meta .meta-cost').innerText())==='$15.00 / 月','The header follows');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).currency==='USD'),'The choice is remembered per viewer');
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='b').cost==='¥ 84 / 年'),'Records keep their own currency');
  await p.click('#modal [data-action="cost-refresh"]');
  check(await p.evaluate(()=>__sent.filter(m=>m.action==='fxRates').pop().force===true),'Refresh asks for fresh rates');
  await until(p,()=>window.__fxReplies===2);
  await p.evaluate(()=>$('#modal').close());

  // A row in another currency carries the converted cost as a hint, and a yearly one what it comes to a month; a category view totals only its records.
  const rowHint=await p.locator('#board [data-asset="b"] .r-cost').getAttribute('title');
  check(rowHint==='约 $12.00 / 年，每月约 $1.00','Row hint in the chosen currency, with the monthly share: '+rowHint);
  await p.evaluate(()=>setView('domain'));
  check((await p.locator('#view-meta .meta-cost').innerText())==='$1.00 / 月','A category view totals its own records');
  await p.evaluate(()=>setView('all'));

  // Offline: kept rates come back marked, and the panel says so.
  await p.evaluate(()=>assetboardFxRates({ok:false,error:'没有取到今天的汇率',date:'2026-10-19',source:'欧洲央行参考汇率',rates:{USD:1,CNY:7,EUR:0.5,GBP:0.8,HKD:7.8,JPY:150,SGD:1.3,AUD:1.4,CAD:1.4}}));
  await p.click('#view-meta .meta-cost');
  check((await p.locator('#modal-content').innerText()).includes('2026-10-19（今天没有取到，用的是上次的）'),'Stale rates are marked');
  await p.evaluate(()=>$('#modal').close());

  // Saving stores amount and currency next to the text; the form offers the main currencies.
  await p.evaluate(()=>{state.assets.find(a=>a.id==='a').notes='x';save();});
  check(await p.evaluate(()=>{const a=__saved.assets.find(x=>x.id==='a'),u=__saved.assets.find(x=>x.id==='u');return a.amount===10&&a.currency==='USD'&&!('amount' in u);}),'Saved records carry amount and currency; free text carries none');
  await p.evaluate(()=>assetForm('subscription','a'));
  check(await p.evaluate(()=>['CNY','USD','EUR','GBP','HKD','JPY'].every(c=>document.querySelector(`#asset-form [data-choice="currency"][data-value="${c}"]`))),'The form offers the six main currencies');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});

  // Agent: amount + currency become the cost; totals in any main currency.
  const call=(method,params)=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
  const added=await call('add',{items:[{name:'Claude Pro',type:'ai',amount:20,currency:'usd',cycle:'monthly'}]});
  const claude=(await call('get',{id:added.result.added[0].id})).result;
  check(claude.cost==='$20 / 月'&&claude.amount===20&&claude.currency==='USD','amount + currency + cycle become the cost: '+JSON.stringify([claude.cost,claude.amount,claude.currency]));
  check((await call('update',{id:'b',fields:{currency:'HKD'}})).result.asset.cost==='HK$84 / 年','currency alone corrects the currency of the amount');
  check(/amount/.test((await call('update',{id:'b',fields:{amount:-3}})).error)&&/currency/.test((await call('update',{id:'b',fields:{amount:3,currency:'XYZ'}})).error),'Bad amount or currency is refused');
  const totals=(await call('totals',{currency:'CNY'})).result;
  check(totals.currency==='CNY'&&totals.monthly>0&&totals.items[0].name==='Claude Pro'&&totals.notCounted.noCycle.includes('o')&&totals.rates.date==='2026-10-19','Agent totals: '+JSON.stringify({m:totals.monthly,first:totals.items[0]?.name}));
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: rates asked once when needed, header total, panel totals/left out/categories/largest/rates, currency switch remembered without touching records, refresh, row hint, category scope, stale rates marked, amount/currency saved, six currencies in the form, agent amount/currency and totals';
}
