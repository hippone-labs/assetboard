// Run with the browser tool's filename option. Assetboard Pro's licence (pro/web/license-pro.js) with the Mac app faked (nativeStore.pro):
// 设置 › Assetboard Pro and 关于 in each state, buying through openExternal, activation through the bridge turning Pro on in place
// (the fake app checks the real test licence with the test key, as License.swift does), a refused key, removal, the demo refusing to
// activate, ?free registering nothing, and the section at 390px. Never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const browser=page.context().browser();
 // The test pair (pro/tests/fixtures/license-test-key.json) and a licence it signed (the one License.swift's --test-license holds).
 const testKey='VvZRbb0zp8qzeuJCvVl_2uR6OstgCy8k_DP36Gh70EE';
 const testLicence='ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwMjYtMTAtMDEiLCJ1cGQiOiIyMDI3LTEwLTAxIn0.mnc5ocIp7nZzHWA98jKO4U__jBbRQToHh25-RCdiFh3GMbic-v73TYKSDlItDNCT1A8fawoWkSVgPPcHfacbBA';
 const open=async(pro,{demo=false,width=1280,free=false}={})=>{
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});
  await p.addInitScript(({pro,demo,testKey})=>{
   window.__sent=[];
   // The app's side of licenseActivate: verify with the (test) public key and answer like AppDelegate.activateLicense.
   const unb64=t=>Uint8Array.from(atob(t.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-t.length%4)%4)),c=>c.charCodeAt(0));
   const verify=async text=>{const parts=text.trim().split('.');if(parts.length!==3||parts[0]!=='ASB1')return null;
    const key=await crypto.subtle.importKey('raw',unb64(testKey),{name:'Ed25519'},false,['verify']);
    if(!await crypto.subtle.verify('Ed25519',key,unb64(parts[2]),new TextEncoder().encode('ASB1.'+parts[1])))return null;
    const o=JSON.parse(new TextDecoder().decode(unb64(parts[1])));return o.v===1&&o.plan==='pro'?o:null;};
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='licenseActivate')verify(m.text).then(o=>window.assetboardLicenseResult(o?{ok:true,state:{on:true,kind:'licensed',id:o.id}}:{ok:false,error:'许可证被改过',state:{on:false,kind:'free'}}));
    if(demo&&!['save','evidenceList','toolbarState','openExternal','copyText','focusSearch','windowChrome','themePref','themeColor','reminders'].includes(m.action))setTimeout(()=>window.assetboardDemoBlocked?.(),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,version:'2026.11.1',pro,demo};
  },{pro,demo,testKey});
  await p.goto('http://127.0.0.1:4317/'+(free?'?free':''));
  if(!demo)await p.evaluate(()=>{save=()=>{};state={...state,assets:[{id:'d1',type:'domain',name:'notes.example',provider:'R',account:'',purpose:'',date:isoDay(localDay()+10),dateKind:'expire',cost:'$12 / 年',art:'generic',source:'manual'}]};render();});
  return {p,context,errors};
 };
 const sent=(p,action)=>p.evaluate(action=>window.__sent.filter(m=>m.action===action),action);
 const section=p=>p.evaluate(()=>{prefsDialog('pro');const m=document.querySelector('#modal'),pane=m.querySelector('#prefs-pane-pro');return {open:m.open,view:m.dataset.view,shown:!!pane&&!pane.hidden,state:pane?.querySelector('#pro-state')?.textContent,
  actions:[...(pane?.querySelectorAll('[data-action]')||[])].map(b=>b.dataset.action),key:!!pane?.querySelector('#pro-key'),price:pane?.querySelector('.pro-price')?.textContent||'',text:pane?.textContent||''};});
 const edition=p=>p.evaluate(()=>{prefsDialog('about');return document.querySelector('#prefs-pane-about .prefs-edition')?.textContent;});
 const loaded=p=>p.evaluate(()=>({on:proOn(),built:proBuilt(),review:!!document.querySelector('#sidebar [data-action="review"]'),probe:!!proSlots.serverProbe,methods:Object.keys(proSlots.agentMethods).length,ledger:!!proAction('export-ledger')}));

 // Without a licence: the free features, one hint in the cost panel, the section sells and takes a key; the real test licence activates in place.
 let {p,context,errors}=await open({on:false,kind:'free'});
 try{
  const off=await loaded(p);
  check(!off.on&&off.built&&!off.review&&!off.probe&&off.methods===0&&!off.ledger,'Pro runs without a licence: '+JSON.stringify(off));
  check(await edition(p)==='免费版','关于 does not say the free edition');
  check(await p.evaluate(()=>{costDialog();const hints=document.querySelectorAll('#modal .pro-note [data-action="pro-dialog"]');return hints.length===1&&!document.querySelector('#modal .forecast');}),'the cost panel lacks its one Pro line');
  const s=await section(p);
  check(s.open&&s.view==='prefs'&&s.shown&&s.state==='免费版','the free section is wrong: '+JSON.stringify(s));
  check(s.actions.includes('pro-buy')&&s.actions.includes('pro-recover')&&s.actions.includes('pro-activate')&&!s.actions.includes('pro-remove')&&s.key,'the free section offers the wrong buttons: '+s.actions.join(', '));
  check(s.price.includes('US$10')&&s.price.includes('终身更新')&&s.price.includes('不限台数')&&s.text.includes('购买 Pro（US$10）')&&!/试用|HK\$|trial/i.test(s.text),'the price line is wrong: '+s.price);
  await p.click('#modal [data-action="pro-buy"]');
  const buy=await sent(p,'openExternal');
  check(buy.length===1&&buy[0].url===await p.evaluate(()=>PRO_BUY_URL)&&/^https:\/\/buy\.stripe\.com\//.test(buy[0].url),'buying does not open the Payment Link: '+JSON.stringify(buy));
  await p.click('#modal [data-action="pro-recover"]');
  check((await sent(p,'openExternal'))[1]?.url==='https://pay.assetboard.app/recover?lang=zh','找回 does not open the recover page');
  await p.click('#modal [data-action="pro-activate"]');
  check(!(await sent(p,'licenseActivate')).length&&await p.evaluate(()=>document.activeElement.id==='pro-key'),'an empty key must focus the field, not send');
  await p.fill('#pro-key','  ASB1.eyJ2IjoxfQ.c2ln  ');await p.press('#pro-key','Enter');
  const act=await sent(p,'licenseActivate');
  check(act.length===1&&act[0].text==='ASB1.eyJ2IjoxfQ.c2ln','Enter does not send the trimmed key: '+JSON.stringify(act));
  await p.waitForFunction(()=>document.querySelector('#pro-status')?.textContent==='许可证被改过');
  check(await p.evaluate(()=>!document.querySelector('#pro-activate').disabled&&document.querySelector('#pro-status').classList.contains('bad')&&!proOn()),'a refused key is not reported in place');
  // A changed signature is refused too.
  await p.fill('#pro-key',testLicence.slice(0,-12)+(testLicence.at(-12)==='A'?'B':'A')+testLicence.slice(-11));await p.click('#pro-activate');
  await p.waitForTimeout(150);
  check(!(await p.evaluate(()=>proOn())),'a tampered licence turned Pro on');
  await p.fill('#pro-key',testLicence);await p.click('#pro-activate');
  await p.waitForFunction(()=>proOn());await p.waitForTimeout(100);
  const now=await loaded(p);
  check(now.on&&now.review&&now.probe&&now.methods>0&&now.ledger,'the test licence does not turn Pro on in place: '+JSON.stringify(now));
  check(await p.evaluate(()=>document.querySelector('#toast').textContent.includes('Pro 已激活')&&document.querySelector('#modal').open&&document.querySelector('#modal').dataset.view==='prefs'),'activation does not say so and keep 设置 open');
  const l=await section(p);
  check(l.state==='已激活 · 许可证 K3Q7-NVHM'&&l.actions.includes('pro-remove')&&!l.actions.includes('pro-buy')&&!l.key&&!l.price,'the licensed section is wrong: '+JSON.stringify(l));
  check(await edition(p)==='Assetboard Pro','关于 does not show the Pro edition');
  check(await p.evaluate(()=>{costDialog();return !document.querySelector('#modal .pro-note')&&!!document.querySelector('#modal .cost-more');}),'the cost panel keeps its hint after activation');
  await section(p);await p.click('#modal [data-action="pro-remove"]');
  check(await p.evaluate(()=>document.querySelector('#modal').dataset.view==='confirm'),'removing does not ask first');
  await p.click('#confirm-yes');
  check((await sent(p,'licenseRemove')).length===1,'confirming does not send licenseRemove');
  await p.evaluate(()=>window.assetboardLicenseResult({ok:true,removed:true,state:{on:false,kind:'free'}}));
  check(await p.evaluate(()=>document.querySelector('#toast').textContent.includes('下次启动')),'removal does not say when it takes effect');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // A licence the app checked at launch: Pro from the start, no hints, no marks.
 ({p,context,errors}=await open({on:true,kind:'licensed',id:'K3Q7NVHM'}));
 try{
  const on=await loaded(p);
  check(on.on&&on.review&&on.probe&&on.methods>0,'a licence at launch does not load Pro: '+JSON.stringify(on));
  check(await p.evaluate(()=>{prefsDialog('features');return !document.querySelector('#modal .pro-tag')&&!document.querySelector('#modal input.prefs-switch:disabled');}),'licensed 设置 still locks a switch');
  check((await section(p)).state==='已激活 · 许可证 K3Q7-NVHM','the licensed line is wrong');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // The demo shows Pro; buying is allowed, activating is refused like every other write.
 ({p,context,errors}=await open({on:true,kind:'demo'},{demo:true}));
 try{
  check((await loaded(p)).on,'the demo does not show Pro');
  const d=await section(p);
  check(d.shown&&d.state==='演示模式：显示全部 Pro 功能','the demo section is wrong: '+JSON.stringify(d));
  check(await edition(p)==='演示（显示 Pro 功能）','关于 does not name the demo');
  await section(p);await p.fill('#pro-key','ASB1.a.b');await p.click('#modal [data-action="pro-activate"]');
  await p.waitForTimeout(50);
  check(!(await sent(p,'licenseActivate')).length&&await p.evaluate(()=>document.querySelector('#toast').textContent.includes('演示模式')),'the demo sends a key or stays quiet');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // The browser has no licence: free features, and ?demo shows Pro.
 ({p,context,errors}=await (async()=>{const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4317/');return {p,context,errors};})());
 try{
  check(await p.evaluate(()=>!proOn()&&proBuilt()&&!proSlots.projectNav),'the browser runs Pro without a licence');
  await p.goto('http://127.0.0.1:4317/?demo');
  check(await p.evaluate(()=>proOn()&&!!proSlots.projectNav),'?demo does not show Pro');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // ?free from a full checkout: no section, no hints, nothing registered.
 ({p,context,errors}=await open({on:true,kind:'licensed',id:'K3Q7NVHM'},{free:true}));
 try{
  check(await p.evaluate(()=>{prefsDialog('general');return !proBuilt()&&!proLoaded()&&!proOn()&&!document.querySelector('#prefs-tab-pro')&&!Object.keys(proSlots.actions).length;}),'?free still shows the licence section or Pro');
  check(await edition(p)==='免费版','?free 关于 does not say the free edition');
  check(await p.evaluate(()=>{costDialog();return !document.querySelector('#modal .pro-note');}),'?free shows a Pro hint');
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // 390px: the section fits without sideways scrolling.
 ({p,context,errors}=await open({on:false,kind:'free'},{width:390}));
 try{
  await section(p);
  const fit=await p.evaluate(()=>{const c=document.querySelector('#modal-content');return {scroll:c.scrollWidth,client:c.clientWidth,wide:[...c.querySelectorAll('*')].filter(el=>!el.closest('.prefs-nav')&&el.getBoundingClientRect().right>innerWidth+1).map(el=>el.className||el.tagName)};});
  check(fit.scroll<=fit.client&&!fit.wide.length,'the section overflows at 390px: '+JSON.stringify(fit));
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}
 return 'ok';
}
