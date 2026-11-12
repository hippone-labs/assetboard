// Run with the browser tool's filename option. Common AI plans: picking a vendor and a plan in the form fills name, vendor, price,
// cycle and link (按月 / 按年 where both exist), the 从常见 AI 套餐添加 list adds several in one undoable step, contrast in light and
// dark, 390px, and demo mode. save() is stubbed or a no-op, so nothing is written.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const audit=(p,selector)=>p.evaluate(selector=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>{
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const [x,y]=[lum(over(parse(getComputedStyle(el).color),bg)),lum(bg)].sort((m,n)=>n-m);return {text:el.textContent.trim().slice(0,30),ratio:(x+.05)/(y+.05)};
  });
 },selector);
 const open=async({scheme='light',width=1280,demo=false}={})=>{
  const context=await page.context().browser().newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/'+(demo?'?demo':''));
  // The browser holds no licence: turn Pro on in place, as an activation does.
  await p.evaluate(()=>{proEnable();render();});
  await until(p,()=>typeof aiPlansDialog==='function'&&typeof render==='function');
  if(!demo)await p.evaluate(()=>{localStorage.clear();state={blocks:[{id:'ai',folded:false}],assets:[{id:'c1',type:'ai',name:'Claude Pro',provider:'Anthropic',cost:'$20 / 月',cycle:'monthly',dateKind:'renew',source:'manual',art:'generic'}],deletedExternalIds:[]};window.__saves=0;save=()=>{window.__saves++;};render();});
  return {p,context,errors};
 };
 const val=(p,n)=>p.locator(`#asset-form [name="${n}"]`).inputValue();
 const ratios=[];
 let {p,context,errors}=await open();
 try {
  // The AI category's + opens its form, which links to the list and has the vendors that have plans as chips.
  await p.evaluate(()=>setView('ai'));await p.evaluate(()=>addAsset());
  check(await p.locator('#asset-form [data-action="ai-plans"]').count()===1,'The AI form links to the plan list');
  check(await p.locator('#asset-form[data-type="ai"]').count()===1,'The form is for an AI plan');
  const vendors=await p.locator('#asset-form .provider-picks [data-provider]').evaluateAll(b=>b.map(x=>x.dataset.provider));
  check(['OpenAI','Anthropic','Gemini','Cursor','GitHub Copilot','Midjourney'].every(n=>vendors.includes(n)),'Vendors with plans are chips: '+vendors);
  check(!(await p.locator('#plan-picks [data-plan]').count()),'No plan chips before a vendor is chosen');
  await p.click('#asset-form [data-provider="Anthropic"]');
  const plans=await p.locator('#plan-picks [data-plan]').evaluateAll(b=>b.map(x=>x.textContent));
  check(plans.join('|')==='Pro$20|Max$100|Ultra$200','Claude plans with their price: '+plans.join('|'));
  check((await p.locator('#plan-picks [data-plan="Claude Max"]').getAttribute('title')).includes('价格核对于 2026-11-02'),'The chip names the day prices were checked');
  // One click fills everything but the date.
  await p.click('#plan-picks [data-plan="Claude Pro"]');
  check(await val(p,'name')==='Claude Pro'&&await val(p,'provider')==='Anthropic'&&await val(p,'amount')==='20'&&await val(p,'currency')==='USD'&&await val(p,'cycle')==='monthly'&&await val(p,'dateKind')==='renew','Fields filled: '+JSON.stringify(await p.evaluate(()=>Object.fromEntries(new FormData(document.querySelector('#asset-form'))))));
  check(await val(p,'url')==='https://claude.ai/settings/billing','The management link is filled');
  check(await p.evaluate(()=>document.activeElement?.name==='date'),'Focus moves to the date');
  check(await p.locator('#plan-picks [data-plan="Claude Pro"][aria-pressed="true"]').count()===1,'The picked plan is marked');
  // 按年 where the vendor sells a year.
  check(await p.locator('#plan-picks [data-plan-cycle]').count()===2,'Monthly and yearly offered for Claude Pro');
  await p.click('#plan-picks [data-plan-cycle="yearly"]');
  check(await val(p,'amount')==='200'&&await val(p,'cycle')==='yearly','Yearly price and cycle');
  // Picking another plan replaces a plan name, never one the person typed.
  await p.click('#plan-picks [data-plan="Claude Max"]');
  check(await val(p,'name')==='Claude Max'&&await val(p,'amount')==='100'&&await val(p,'cycle')==='monthly'&&!(await p.locator('#plan-picks [data-plan-cycle]').count()),'Another plan replaces the plan fields');
  await p.fill('#asset-form [name="name"]','My Claude');
  await p.click('#plan-picks [data-plan="Claude Ultra"]');
  check(await val(p,'name')==='My Claude'&&await val(p,'amount')==='200','A typed name is kept');
  // Another vendor brings its own plans.
  await p.click('#asset-form [data-provider="Midjourney"]');
  check(await p.locator('#plan-picks [data-plan="Midjourney Standard"]').count()===1&&!(await p.locator('#plan-picks [data-plan^="Claude"]').count()),'Plans follow the vendor');
  await p.fill('#asset-form [name="name"]','');await p.click('#plan-picks [data-plan="Midjourney Standard"]');await p.click('#plan-picks [data-plan-cycle="yearly"]');
  await p.fill('#asset-form [name="date"]','2099-03-01');
  ratios.push(...(await audit(p,'#plan-picks .choice,#plan-picks .plan-price')).map(r=>({...r,scheme:'light',where:'form'})));
  await p.click('#asset-form [type="submit"]');
  const added=await until(p,()=>state.assets.find(a=>a.name==='Midjourney Standard'));
  check(added.cost==='$288 / 年'&&added.cycle==='yearly'&&added.provider==='Midjourney'&&added.dateKind==='renew'&&added.date==='2099-03-01'&&added.url==='https://www.midjourney.com/account','Saved record: '+JSON.stringify(added));

  // 从常见 AI 套餐添加: several at once, one undo.
  await p.evaluate(()=>addDialog());await p.click('#add-panel [data-action="ai-plans"]');
  check(await p.locator('#ai-plans-form').count()===1,'The plan list opens');
  check((await p.locator('#ai-plans-form .form-note').innerText()).includes('2026-11-02'),'The list names the day prices were checked');
  const claude=p.locator('#ai-plans-form .plan-row',{hasText:'Claude Pro'}).locator('input[name="plan"]');
  check(await claude.isDisabled()&&await claude.isChecked(),'A plan already on the board is ticked off');
  check(await p.locator('#ai-plans-form [type="submit"]').isDisabled(),'Nothing to add yet');
  await p.locator('#ai-plans-form .plan-row',{hasText:'ChatGPT Plus'}).locator('input[name="plan"]').check();
  const kimi=p.locator('#ai-plans-form .plan-row',{hasText:'Kimi Pro (CN)'});
  await kimi.locator('input[name="plan"]').check();await kimi.locator('[data-value="yearly"]').click();
  check((await p.locator('#ai-plans-form [type="submit"]').innerText())==='添加 2 项','The button counts the ticks');
  ratios.push(...(await audit(p,'#ai-plans-form legend,#ai-plans-form .check-label span,#ai-plans-form .plan-price,#ai-plans-form .choice,#ai-plans-form .form-note')).map(r=>({...r,scheme:'light',where:'list'})));
  const before=await p.evaluate(()=>({n:state.assets.length,saves:window.__saves}));
  await p.click('#ai-plans-form [type="submit"]');
  const batch=await p.evaluate(()=>state.assets.filter(a=>['ChatGPT Plus','Kimi Pro (CN)'].includes(a.name)).map(a=>({name:a.name,cost:a.cost,cycle:a.cycle,provider:a.provider,type:a.type,dateKind:a.dateKind,source:a.source})));
  check(batch.length===2&&batch.some(a=>a.name==='ChatGPT Plus'&&a.cost==='$20 / 月'&&a.cycle==='monthly'&&a.provider==='OpenAI')&&batch.some(a=>a.cost==='¥1908 / 年'&&a.cycle==='yearly'&&a.provider==='Kimi')&&batch.every(a=>a.type==='ai'&&a.dateKind==='renew'&&a.source==='manual'),'Batch added: '+JSON.stringify(batch));
  check(await p.evaluate(b=>state.assets.length===b.n+2&&window.__saves===b.saves+1,before),'Saved once');
  check(!(await p.evaluate(()=>$('#modal').open)),'The list closes');
  check(await p.locator('#board [data-asset]',{hasText:'ChatGPT Plus'}).count()===1,'The new plan is on the board');
  await p.evaluate(()=>undo());
  check(await p.evaluate(b=>state.assets.length===b.n&&!state.assets.some(a=>a.name==='ChatGPT Plus'),before),'One undo removes the batch');

  // Agents (assetboard-cli, MCP) name a plan; fields given beside it win, an unknown plan is refused, types lists the plans.
  const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
  const viaAgent=await call('add',{items:[{plan:'google  AI pro',date:'2099-05-01'},{plan:'Kimi Plus',cycle:'yearly',name:'Kimi (work)'},{plan:'ChatGPT Go',cycle:'yearly'},{plan:'Claude Mega'}]});
  check(viaAgent.ok&&viaAgent.result.added.length===3&&viaAgent.result.errors.length===1&&/未知套餐/.test(viaAgent.result.errors[0].error),'Agent adds by plan name: '+JSON.stringify(viaAgent.result));
  const agentRows=await p.evaluate(()=>Object.fromEntries(state.assets.filter(a=>a.source==='agent').map(a=>[a.name,{type:a.type,provider:a.provider,cost:a.cost,cycle:a.cycle,date:a.date||'',dateKind:a.dateKind}])));
  check(JSON.stringify(agentRows)===JSON.stringify({'Google AI Pro':{type:'ai',provider:'Gemini',cost:'$19.99 / 月',cycle:'monthly',date:'2099-05-01',dateKind:'renew'},'Kimi (work)':{type:'ai',provider:'Kimi',cost:'$180 / 年',cycle:'yearly',date:'',dateKind:'renew'},'ChatGPT Go':{type:'ai',provider:'OpenAI',cost:'$8 / 月',cycle:'monthly',date:'',dateKind:'renew'}}),'Agent plan fields: '+JSON.stringify(agentRows));
  const aiType=(await call('types')).result.find(t=>t.id==='ai');
  check(aiType.plans.some(x=>x.name==='Claude Pro'&&x.cost==='$20 / 月'&&x.yearlyCost==='$200 / 年'&&x.checked==='2026-11-02'),'types lists the plans');
  await p.evaluate(()=>undo());

  // 390px: the form picker and the list fit without sideways scrolling.
  await p.setViewportSize({width:390,height:800});
  // the wall repacks for the new width in a ResizeObserver, with the next frame: measure once a frame is drawn
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await p.evaluate(()=>assetForm('ai',null,{provider:'Gemini'}));
  const fitForm=await p.evaluate(()=>{const m=document.querySelector('#modal').getBoundingClientRect(),c=[...document.querySelectorAll('#plan-picks .choice')].map(b=>b.getBoundingClientRect());return {page:document.documentElement.scrollWidth>innerWidth,modal:document.querySelector('#modal-content').scrollWidth>document.querySelector('#modal-content').clientWidth,inside:c.every(r=>r.right<=m.right+0.5),n:c.length};});
  check(!fitForm.page&&!fitForm.modal&&fitForm.inside&&fitForm.n===4,'Form picker fits at 390px: '+JSON.stringify(fitForm));
  await p.evaluate(()=>aiPlansDialog());
  const fitList=await p.evaluate(()=>{const c=document.querySelector('#modal-content');return {page:document.documentElement.scrollWidth>innerWidth,modal:c.scrollWidth>c.clientWidth};});
  check(!fitList.page&&!fitList.modal,'Plan list fits at 390px: '+JSON.stringify(fitList));
  check(!errors.length,'No page errors: '+errors.join('; '));
 } finally {await context.close();}

 // Dark: the same text against its own backgrounds.
 ({p,context,errors}=await open({scheme:'dark'}));
 try {
  await p.evaluate(()=>assetForm('ai',null,{provider:'Anthropic',name:'Claude Pro',cycle:'monthly'}));
  ratios.push(...(await audit(p,'#plan-picks .choice,#plan-picks .plan-price')).map(r=>({...r,scheme:'dark',where:'form'})));
  await p.evaluate(()=>aiPlansDialog());
  await p.locator('#ai-plans-form .plan-row',{hasText:'Midjourney Pro'}).locator('[data-value="yearly"]').click();
  ratios.push(...(await audit(p,'#ai-plans-form legend,#ai-plans-form .check-label span,#ai-plans-form .plan-price,#ai-plans-form .choice,#ai-plans-form .form-note')).map(r=>({...r,scheme:'dark',where:'list'})));
  check(!errors.length,'No page errors (dark): '+errors.join('; '));
 } finally {await context.close();}
 const low=ratios.filter(r=>r.ratio<4.5);
 check(ratios.some(r=>r.scheme==='dark'&&r.where==='list')&&ratios.some(r=>r.scheme==='light'&&r.where==='form')&&!low.length,'Contrast: '+JSON.stringify(low.length?low:ratios.length));

 // Demo: the list and the form work in memory and nothing is stored.
 ({p,context,errors}=await open({demo:true}));
 try {
  const n=await p.evaluate(()=>state.assets.length);
  await p.evaluate(()=>aiPlansDialog());
  const row=p.locator('#ai-plans-form .plan-row',{hasText:'GitHub Copilot Pro+'});
  await row.locator('input[name="plan"]').check();await p.click('#ai-plans-form [type="submit"]');
  check(await p.evaluate(n=>state.assets.length===n+1&&state.assets.some(a=>a.name==='GitHub Copilot Pro+'&&a.cost==='$39 / 月'),n),'Demo adds in memory');
  check(await p.evaluate(()=>!localStorage.getItem('assetboard-prototype-v1')),'Demo stores nothing');
  check(!errors.length,'No page errors (demo): '+errors.join('; '));
 } finally {await context.close();}
 return `PASS: form plan picker (vendor chips, plan chips with price and checked date, one-click fill, 按月/按年, typed name kept), saved record, multi-add in one save and one undo, 390px, contrast ${ratios.length} texts ≥ 4.5 (min ${Math.min(...ratios.map(r=>r.ratio)).toFixed(1)}), demo in memory only`;
}
