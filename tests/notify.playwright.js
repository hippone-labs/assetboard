// Run with the browser tool's filename option. Fakes the Mac host (no demo) to check the reminder plan sent to Swift,
// the notifications-off note in 即将到来 (contrast in light and dark, 390px) and that demo mode sends no plan. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  const day=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.toISOString().slice(0,10);};
  window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
  window.__ASSETBOARD_NATIVE__={demo:DEMO,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'domain',width:50},{id:'subscription',width:50}],assets:[
   {id:'d1',type:'domain',name:'example.dev',provider:'Registrar',account:'',date:day(20),dateKind:'expire',cost:'¥ 89 / 年',art:'generic',source:'manual'},
   {id:'s1',type:'subscription',name:'Editor Pro',provider:'Editor',account:'',date:day(10),dateKind:'renew',cycle:'monthly',art:'generic',source:'manual'}]}};
 };
 const audit=()=>p.evaluate(()=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll('.notify-off span,.notify-off button')].map(el=>{
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const [x,y]=[lum(over(parse(getComputedStyle(el).color),bg)),lum(bg)].sort((m,n)=>n-m);return {text:el.textContent,ratio:(x+.05)/(y+.05)};
  });
 });
 let p;
 try {
  const ratios=[];
  for(const scheme of ['light','dark']){
   p=await page.context().newPage();
   await p.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
   await p.addInitScript(`(${host.toString().replace('DEMO','false')})();`);
   await p.goto('http://127.0.0.1:4317/');
   await until(p,()=>window.__sent.some(m=>m.action==='reminders'));
   if(scheme==='light'){
    const plan=await p.evaluate(()=>window.__sent.find(m=>m.action==='reminders').items);
    check(plan.length>=3&&plan.every(r=>/^reminder-\d{4}-\d{2}-\d{2}$/.test(r.id)&&/T09:00$/.test(r.when)),'Plan shape: '+JSON.stringify(plan[0]));
    check(plan.some(r=>r.title==='example.dev'&&r.body==='7 天后到期 · ¥ 89 / 年'&&r.assetId==='d1'),'Domain 7-day reminder: '+JSON.stringify(plan));
    check(plan.some(r=>r.title==='Editor Pro'&&r.body==='3 天后扣款'),'Monthly charge 3-day reminder');
    check(await p.evaluate(()=>{const before=window.__sent.filter(m=>m.action==='reminders').length;save();return window.__sent.filter(m=>m.action==='reminders').length===before;}),'An unchanged plan is not sent again');
   }
   await p.evaluate(()=>setView('upcoming'));
   check(!(await p.locator('.notify-off').count()),'No note before the system has answered');
   await p.evaluate(()=>assetboardConnectionState({notifications:'denied'}));
   check(await p.locator('#board .notify-off').isVisible(),'Note shows when notifications are off');
   ratios.push(...(await audit()).map(r=>({...r,scheme})));
   if(scheme==='light'){
    await p.click('.notify-off [data-action="notification-settings"]');
    check(await p.evaluate(()=>window.__sent.some(m=>m.action==='openNotificationSettings')),'The button asks the Mac app to open the settings');
    await p.setViewportSize({width:390,height:800});
    const fit=await p.evaluate(()=>{const n=document.querySelector('.notify-off').getBoundingClientRect(),b=document.querySelector('.notify-off .button').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,inside:b.right<=n.right+0.5&&n.right<=innerWidth};});
    check(!fit.overflow&&fit.inside,'Note fits at 390px: '+JSON.stringify(fit));
    await p.evaluate(()=>assetboardConnectionState({notifications:'allowed'}));
    check(!(await p.locator('.notify-off').count()),'The note goes once notifications are allowed');
   }
   await p.close();p=null;
  }
  const low=ratios.filter(r=>r.ratio<4.5);
  check(ratios.length===4&&!low.length,'Note contrast: '+JSON.stringify(low.length?low:ratios));
  p=await page.context().newPage();
  await p.addInitScript(`(${host.toString().replace('DEMO','true')})();`);
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof render==='function'&&document.querySelector('#board [data-asset]'));
  await p.evaluate(()=>{setView('upcoming');save();});
  check(!(await p.evaluate(()=>window.__sent.some(m=>m.action==='reminders'))),'Demo mode sends no reminder plan');
  return `PASS: reminder plan sent by the page (shape, lead days, cost, no resend when unchanged), notifications-off note only when denied, settings bridge, 390px fit, contrast ${ratios.map(r=>r.ratio.toFixed(1)).join('/')}, demo sends nothing`;
 } finally { if(p)await p.close(); }
}
