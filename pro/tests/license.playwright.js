// Run with the browser tool's filename option. Assetboard Pro's licence (pro/web/license-pro.js) with the Mac app faked (nativeStore.pro):
// the sidebar line and the panel in each state, the Pro marks while Pro is off, activation through the bridge turning Pro on in place,
// a refused key, removal, the demo refusing to activate, ?free registering nothing, and the panel at 390px. Never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const browser=page.context().browser();
 const open=async(pro,{demo=false,width=1280,free=false}={})=>{
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});
  await p.addInitScript(({pro,demo})=>{
   window.__sent=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(demo&&!['save','evidenceList','toolbarState','openExternal','copyText','focusSearch','windowChrome','themePref','themeColor','reminders'].includes(m.action))setTimeout(()=>window.assetboardDemoBlocked?.(),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false,pro,demo};
  },{pro,demo});
  await p.goto('http://127.0.0.1:4317/'+(free?'?free':''));
  if(!demo)await p.evaluate(()=>{save=()=>{};state={...state,assets:[{id:'d1',type:'domain',name:'notes.dev',provider:'R',account:'',purpose:'',date:isoDay(localDay()+10),dateKind:'expire',cost:'$12 / 年',art:'generic',source:'manual'}]};render();});
  return {p,context,errors};
 };
 const sent=(p,action)=>p.evaluate(action=>window.__sent.filter(m=>m.action===action),action);
 const navLine=p=>p.evaluate(()=>{const el=document.querySelector('#sidebar .pro-nav');return el?{text:el.textContent,title:el.title}:null;});
 const panel=p=>p.evaluate(()=>{proDialog();const m=document.querySelector('#modal');return {open:m.open,view:m.dataset.view,state:m.querySelector('#pro-state')?.textContent,kind:m.querySelector('#pro-state')?.className,
  actions:[...m.querySelectorAll('[data-action]')].map(b=>b.dataset.action),key:!!m.querySelector('#pro-key'),price:m.querySelector('.pro-price')?.textContent||'',text:m.textContent};});
 const hub=p=>p.evaluate(()=>{importHub();const m=document.querySelector('#modal');return {tags:m.querySelectorAll('.pro-tag').length,actions:[...m.querySelectorAll('[data-action]')].map(b=>b.dataset.action)};});
 const loaded=p=>p.evaluate(()=>({pro:proLoaded(),off:proOff,review:!!document.querySelector('#sidebar [data-action="review"]'),probe:!!proSlots.serverProbe,methods:Object.keys(proSlots.agentMethods).length}));

 // A trial: everything on, the sidebar counts the days, the panel sells and takes a key.
 let {p,context,errors}=await open({on:true,kind:'trial',daysLeft:12});
 try{
  const line=await navLine(p);
  check(line&&line.text.includes('Assetboard Pro')&&line.text.includes('12 天')&&line.title==='试用还剩 12 天','the trial line is wrong: '+JSON.stringify(line));
  const on=await loaded(p);
  check(on.pro&&!on.off&&on.review&&on.probe&&on.methods>0,'the trial does not load Pro: '+JSON.stringify(on));
  const t=await panel(p);
  check(t.open&&t.view==='pro'&&t.state==='试用还剩 12 天'&&t.kind.includes('trial'),'the trial panel is wrong: '+JSON.stringify(t));
  check(t.actions.includes('pro-buy')&&t.actions.includes('pro-recover')&&t.actions.includes('pro-activate')&&!t.actions.includes('pro-renew')&&!t.actions.includes('pro-remove')&&t.key,'the trial panel offers the wrong buttons: '+t.actions.join(', '));
  check(t.price.includes('HK$39')&&t.price.includes('永久更新')&&!t.price.includes('一年')&&!t.price.includes('续'),'the price line is wrong: '+t.price);
  check(!t.text.includes('定价'),'the panel must not use the word 定价');
  await p.click('#modal [data-action="pro-buy"]');
  const buy=await sent(p,'openExternal');
  check(buy.length===1&&buy[0].url==='https://buy.stripe.com/28E4gB8T7gdIbniadUdMI01?locale=zh','buying does not open the HK$39 Payment Link: '+JSON.stringify(buy));
  await p.evaluate(()=>{proDialog();});await p.click('#modal [data-action="pro-recover"]');
  check((await sent(p,'openExternal')).length===2&&/\/recover\?lang=zh$/.test((await sent(p,'openExternal'))[1].url),'找回许可证 does not open the recover page');
  check(!(await p.evaluate(()=>{importHub();return document.querySelector('#modal .pro-tag');})),'the trial shows Pro tags in the import window');
  // The last days turn the count amber.
  await p.evaluate(()=>{window.__ASSETBOARD_NATIVE__.pro={on:true,kind:'trial',daysLeft:2};render();});
  check(await p.evaluate(()=>!!document.querySelector('#sidebar .pro-nav .nav-count.soon')),'2 days left is not marked');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // After the trial: no Pro slots, the three marked sources and the cost line open the panel; a key goes through the bridge; a refused key
 // says why; an accepted one turns Pro on in place.
 ({p,context,errors}=await open({on:false,kind:'expired'}));
 try{
  const off=await loaded(p);
  check(!off.pro&&off.off&&!off.review&&!off.probe&&off.methods===0,'expired still loads Pro: '+JSON.stringify(off));
  const line=await navLine(p);
  check(line&&line.text.trim()==='Assetboard Pro'&&line.title==='试用已结束','the expired line is wrong: '+JSON.stringify(line));
  const h=await hub(p);
  check(h.tags===3&&h.actions.filter(a=>a==='pro-dialog').length===3&&!h.actions.includes('cloudflare-import')&&!h.actions.includes('probe-sources'),'the import window does not mark the Pro sources: '+JSON.stringify(h));
  await p.click('#modal [data-action="pro-dialog"]');
  check(await p.evaluate(()=>document.querySelector('#modal').dataset.view==='pro'),'a marked source does not open the panel');
  check(await p.evaluate(()=>{costDialog();return !!document.querySelector('#modal .pro-note [data-action="pro-dialog"]');}),'the cost panel lacks its Pro line');
  const e=await panel(p);
  check(e.state==='试用已结束'&&e.kind.includes('expired')&&e.actions.includes('pro-buy')&&e.key,'the expired panel is wrong: '+JSON.stringify(e));
  await p.click('#modal [data-action="pro-activate"]');
  check(!(await sent(p,'licenseActivate')).length&&await p.evaluate(()=>document.activeElement.id==='pro-key'),'an empty key must focus the field, not send');
  await p.fill('#pro-key','  ASB1.eyJ2IjoxfQ.c2ln  ');await p.press('#pro-key','Enter');
  const act=await sent(p,'licenseActivate');
  check(act.length===1&&act[0].text==='ASB1.eyJ2IjoxfQ.c2ln','Enter does not send the trimmed key: '+JSON.stringify(act));
  check(await p.evaluate(()=>document.querySelector('#pro-activate').disabled&&document.querySelector('#pro-status').textContent==='验证中…'),'activation does not wait');
  await p.evaluate(()=>window.assetboardLicenseResult({ok:false,error:'许可证被改过',state:{on:false,kind:'expired'}}));
  check(await p.evaluate(()=>!document.querySelector('#pro-activate').disabled&&document.querySelector('#pro-status').textContent==='许可证被改过'&&document.querySelector('#modal').open),'a refused key is not reported in place');
  await p.evaluate(()=>window.assetboardLicenseResult({ok:true,state:{on:true,kind:'licensed',id:'K3Q7NVHM',updatesUntil:'9999-12-31',buildDate:'2026-11-01'}}));
  await p.waitForTimeout(150);
  const now=await loaded(p);
  check(now.pro&&!now.off&&now.review&&now.probe&&now.methods>0,'an accepted key does not turn Pro on in place: '+JSON.stringify(now));
  check(await p.evaluate(()=>!document.querySelector('#modal').open&&document.querySelector('#toast').textContent.includes('Pro 已激活')),'activation does not close the panel and say so');
  const lic=await navLine(p);
  check(lic&&lic.text.trim()==='Assetboard Pro'&&lic.title==='许可证 K3Q7-NVHM · 永久更新','the licensed line is wrong: '+JSON.stringify(lic));
  const h2=await hub(p);
  check(h2.tags===0&&h2.actions.includes('cloudflare-import')&&h2.actions.includes('probe-sources'),'the import window keeps Pro tags after activation: '+JSON.stringify(h2));
  const l=await panel(p);
  check(l.state==='许可证 K3Q7-NVHM · 永久更新'&&!l.actions.includes('pro-renew')&&l.actions.includes('pro-remove')&&!l.actions.includes('pro-buy')&&!l.key&&!l.price,'the licensed panel is wrong: '+JSON.stringify(l));
  await p.evaluate(()=>proDialog());await p.click('#modal [data-action="pro-remove"]');
  check(await p.evaluate(()=>document.querySelector('#modal').dataset.view==='confirm'),'removing does not ask first');
  await p.click('#confirm-yes');
  check((await sent(p,'licenseRemove')).length===1,'confirming does not send licenseRemove');
  await p.evaluate(()=>window.assetboardLicenseResult({ok:true,removed:true,state:{on:false,kind:'expired'}}));
  check(await p.evaluate(()=>document.querySelector('#toast').textContent.includes('下次启动')),'removal does not say when it takes effect');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // A licence whose updates end before this build: the panel says both dates, offers a purchase, the older versions and a key.
 ({p,context,errors}=await open({on:false,kind:'lapsed',id:'K3Q7NVHM',updatesUntil:'2026-06-01',buildDate:'2026-09-15'}));
 try{
  const l=await panel(p);
  check(l.state==='这一版发布于 2026-09-15，你的更新期到 2026-06-01'&&l.kind.includes('lapsed'),'the lapsed line is wrong: '+l.state);
  check(!l.actions.includes('pro-renew')&&l.actions.includes('pro-buy')&&l.actions.includes('pro-older')&&l.actions.includes('pro-remove')&&l.key&&l.text.includes('2026-06-01 之前的版本'),'the lapsed panel is wrong: '+JSON.stringify(l));
  await p.click('#modal [data-action="pro-older"]');
  check((await sent(p,'openExternal'))[0]?.url==='https://assetboard.app/downloads/','下载旧版本 does not open the downloads page');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // The demo runs as a trial: the panel opens and buying is allowed, activating is refused like every other write.
 ({p,context,errors}=await open({on:true,kind:'trial',daysLeft:14},{demo:true}));
 try{
  check((await loaded(p)).pro,'the demo does not show Pro');
  const d=await panel(p);
  check(d.open&&d.state==='试用还剩 14 天','the demo panel is wrong: '+JSON.stringify(d));
  await p.fill('#pro-key','ASB1.a.b');await p.click('#modal [data-action="pro-activate"]');
  await p.waitForTimeout(50);
  check(!(await sent(p,'licenseActivate')).length&&await p.evaluate(()=>document.querySelector('#toast').textContent.includes('演示模式')),'the demo sends a key or stays quiet');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // ?free from a full checkout: the licence script registers nothing, like the other Pro scripts.
 ({p,context,errors}=await open({on:true,kind:'trial',daysLeft:14},{free:true}));
 try{
  check(!(await navLine(p))&&!(await p.evaluate(()=>proLoaded()||Object.keys(proSlots.actions).length)),'?free still shows the licence line');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // 390px: the panel fits without sideways scrolling.
 ({p,context,errors}=await open({on:false,kind:'expired'},{width:390}));
 try{
  await panel(p);
  const fit=await p.evaluate(()=>{const c=document.querySelector('#modal-content');return {scroll:c.scrollWidth,client:c.clientWidth,wide:[...c.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>el.className||el.tagName)};});
  check(fit.scroll<=fit.client&&!fit.wide.length,'the panel overflows at 390px: '+JSON.stringify(fit));
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}
 return 'ok';
}
