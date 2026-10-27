// Run with the browser tool's filename option. Uses an isolated page and never saves.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const nativeDialogs=[];p.on('dialog',dialog=>{nativeDialogs.push(dialog.type());dialog.dismiss();});
 try {
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{
   save=()=>{};history.length=0;
   const day=offset=>isoDay(localDay()+offset),year=offset=>{const d=new Date();d.setDate(d.getDate()+offset);d.setFullYear(d.getFullYear()-1);return isoDay(localDay(d));};
   state={...state,paymentsSince:'',blocks:[{id:'domain',width:50,collapsed:false,height:null},{id:'server',width:50,collapsed:false,height:null},{id:'phone',width:50,collapsed:false,height:null},{id:'bankcard',width:50,collapsed:false,height:null},{id:'subscription',width:50,collapsed:false,height:null}],assets:[
    {id:'auto',type:'domain',name:'auto.dev',provider:'Cloudflare',account:'',purpose:'',date:year(-2),dateKind:'expire',cycle:'yearly',cost:'$10 / 年',art:'generic',source:'manual',createdAt:'2024-01-01T00:00:00Z'},
    {id:'keep',type:'phone',name:'英国 giffgaff',provider:'giffgaff',account:'',purpose:'',date:isoDay(dayNumber(addMonths(day(-3),-6))),dateKind:'keep',cycle:'halfyearly',art:'generic',source:'manual',createdAt:'2024-01-01T00:00:00Z'},
    {id:'ecs',type:'server',name:'web-1',provider:'阿里云',account:'',purpose:'',date:day(-4),dateKind:'expire',cost:'¥ 800 / 年',art:'generic',source:'manual'},
    {id:'card',type:'bankcard',name:'Visa',provider:'Bank',account:'',purpose:'',date:'2030-01-31',art:'generic',source:'manual',last4:'4242'},
    {id:'sub',type:'subscription',name:'Editor Pro',provider:'Editor',account:'',purpose:'',date:day(6),dateKind:'renew',cycle:'monthly',cost:'$10 / 月',art:'generic',source:'manual',
     payments:[{id:'m1',paidOn:day(-20),covers:day(-20),status:'missed',amount:0,currency:''}]}
   ]};
   linkRelation(state.assets,'card','sub');
   render();
  });
  await p.locator('#sidebar .nav-item[data-id="upcoming"]').click();
  // 待确认续费: the auto-renewal and the keep-alive wait for an answer instead of rolling on.
  const band=p.locator('.group[data-group="renewals"]');
  check(await band.count()===1,'Pending renewals band is shown');
  check(await band.locator('.renewal-row').count()===2,'Both the domain and the number are asked about');
  check((await band.locator('[data-asset="keep"] [data-action="renewal-yes"]').innerText())==='做了','Keep-alive uses its own words');
  check((await p.locator('[data-asset="auto"] .r-date').first().innerText()).includes('续上了吗'),'The row asks instead of showing next year');
  await band.locator('[data-asset="auto"] [data-action="renewal-no"]').click();
  check(await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='auto');return a.cycle===''&&assetDateStatus(a).level==='overdue';}),'Not renewed makes it an expiry');
  await p.evaluate(()=>showDetail('keep'));
  check(await p.locator('#detail-content [data-action="renewal-yes"]').count()===1,'A phone asks in its own detail too');
  await p.locator('#detail-content [data-action="renewal-yes"]').click();
  check(await p.evaluate(()=>pendingRenewals(state.assets).length===0),'Answered renewals leave the band');
  // After expiry on a known rule: the row says how long is left, the detail shows the timeline.
  check((await p.locator('[data-asset="ecs"] .r-date').first().innerText()).includes('已停机 · 还剩'),'Server row shows days before release');
  await p.evaluate(()=>showDetail('ecs'));
  check((await p.locator('#detail-content').innerText()).includes('过期后'),'Detail lists the after-expiry timeline');
  // …as a short chain under its label, the current stage marked, what each stage allows in its tip.
  const life=await p.evaluate(()=>({steps:[...document.querySelectorAll('#detail-content .life-step')].map(n=>n.textContent),now:document.querySelector('#detail-content .life-step.now')?.textContent,tip:document.querySelector('#detail-content .life-step')?.title,block:!!document.querySelector('#detail-content .fact-block .life-steps')}));
  check(life.block&&life.steps.join('|')==='已停机 1–14 天|释放'&&life.now==='已停机 1–14 天'&&/数据还在/.test(life.tip),'The timeline chain: '+JSON.stringify(life));
  // A card: missed charges and the next month of charges.
  await p.evaluate(()=>showDetail('card'));
  const detail=await p.locator('#detail-content').innerText();
  check(detail.includes('没扣成'),'Card shows a recent missed charge');
  check(detail.includes('未来 30 天要扣 1 笔'),'Card shows the coming charges');
  check(nativeDialogs.length===0,'No native alert/confirm dialogs: '+nativeDialogs.join(','));
  return 'PASS: pending renewals and keep-alives, not-renewed becomes expired, lifecycle row and timeline, card outlook';
 } finally { await p.close(); }
}
