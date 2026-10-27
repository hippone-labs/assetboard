// v22 lenses: switch between where things run, who pays, what you sign in with and projects, remembered per viewer; deployment services are cards too; drags write the lens's own link.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaOpen==='function');await p.evaluate(()=>{try{localStorage.removeItem('assetboard.panorama');}catch{}panoLens='';});await p.waitForTimeout(200);
  await p.keyboard.press('p');await p.waitForTimeout(250);
  // The demo has more hosting links than payments, so it opens on where things run.
  const first=await p.evaluate(()=>({lens:panoLens,segs:[...document.querySelectorAll('.pano-lens .seg')].map(b=>b.textContent+':'+b.getAttribute('aria-pressed'))}));
  // 按项目 is Pro: the free edition (the public copy, ?free) has no such lens.
  const projects=await p.evaluate(()=>projectsOn());
  check(first.lens==='host'&&first.segs.join()==='运行在哪:true,谁在付钱:false,用什么登录:false'+(projects?',按项目:false':''),'Opens on host; every lens with cards is on the switch: '+JSON.stringify(first));
  // Who pays: one card per bank card, its masked number, what it pays for; recurring things without a card wait in the loose card.
  await p.click('.pano-lens [data-lens="pay"]');await p.waitForTimeout(200);
  const pay=await p.evaluate(()=>({cards:[...document.querySelectorAll('.pano-card')].map(c=>c.dataset.lane+'='+[...c.querySelectorAll('.pano-chip')].map(x=>x.dataset.chip).join('+')),sub:document.querySelector('.pano-card[data-lane="demo-c1"] .pl-prov')?.textContent,tone:document.querySelector('.pano-card[data-lane="demo-c2"]').classList.contains('amber'),loose:document.querySelector('.pano-loose')?.getAttribute('aria-label'),looseIds:[...document.querySelectorAll('.pano-loose .pano-chip')].map(c=>c.dataset.chip),focus:document.activeElement?.dataset.lens}));
  check(pay.cards.join()==='demo-c1=demo-a1+demo-u3+demo-d3,demo-c2=demo-u1+demo-u2','Cards hold what they pay for: '+pay.cards.join());
  check(pay.sub==='Visa •••• 4242'&&pay.tone,'Card shows network and last four; the card near expiry is amber: '+JSON.stringify(pay));
  check(pay.loose==='没记付款卡，2 项'&&pay.looseIds.join()==='demo-d1,demo-s1'&&pay.focus==='pay','The yearly domain and the monthly server have no card; focus stays on the switch: '+JSON.stringify(pay));
  // Remembered across opening and reloads.
  await p.keyboard.press('Escape');await p.keyboard.press('p');await p.waitForTimeout(200);
  check(await p.evaluate(()=>panoLens)==='pay','The lens is remembered when reopening');
  await p.reload();await until(p,()=>typeof panoramaOpen==='function');await p.evaluate(()=>panoramaOpen(true));await p.waitForTimeout(200);
  check(await p.evaluate(()=>panoLens==='pay'&&document.querySelector('.pano-lens [aria-pressed="true"]').dataset.lens==='pay'),'…and across reloads');
  // Dragging the server onto a card records that the card pays for it, as one undo step.
  // A box is read once the element is there and drawn (全景 may be redrawing at that moment).
  const box=async sel=>{for(let i=0;i<50;i++){const b=await p.locator(sel).first().boundingBox().catch(()=>null);if(b)return b;await p.waitForTimeout(40);}throw new Error('Not on screen: '+sel);};
  const drag=async(sel,target)=>{const a=await box(sel),b=await box(target);await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(a.x+a.width/2+10,a.y+a.height/2+6,{steps:3});await p.mouse.move(b.x+b.width/2,b.y+30,{steps:8});await p.waitForTimeout(60);await p.mouse.up();await p.waitForTimeout(250);};
  await drag('.pano-loose .pano-chip[data-chip="demo-s1"]','.pano-card[data-lane="demo-c1"]');
  const after=await p.evaluate(()=>({kind:linkKind(state.assets.find(a=>a.id==='demo-s1'),state.assets.find(a=>a.id==='demo-c1')),on:!!document.querySelector('.pano-card[data-lane="demo-c1"] .pano-chip[data-chip="demo-s1"]'),loose:!!document.querySelector('.pano-loose'),toast:document.querySelector('#toast')?.textContent||''}));
  check(after.kind.kind==='pay'&&after.on&&after.loose&&/由 Visa 信用卡 付款/.test(after.toast),'The card now pays for tokyo-vps: '+JSON.stringify(after));
  await p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await p.waitForTimeout(200);
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='demo-s1').links.includes('demo-c1')&&!!document.querySelector('.pano-loose .pano-chip[data-chip="demo-s1"]')),'Undo takes the payment link back');
  // Where things run: a deployment service is a card with what it deploys and points at; a loose domain can be dropped on it.
  await p.evaluate(()=>{state.assets.push({id:'dep1',type:'deployment',name:'web-app',provider:'Vercel',updatedAt:new Date().toISOString(),source:'manual'});linkRelation(state.assets,'demo-r2','dep1');render();panoSetLens('host');});await p.waitForTimeout(200);
  const host=await p.evaluate(()=>({card:[...document.querySelectorAll('.pano-card[data-hub="deployment"] .pano-chip')].map(c=>c.dataset.chip).join(),last:[...document.querySelectorAll('.pano-card')].at(-1).dataset.lane,loose:[...document.querySelectorAll('.pano-loose .pano-chip')].map(c=>c.dataset.chip)}));
  check(host.card==='demo-r2'&&host.last==='dep1'&&!host.loose.includes('demo-r2'),'The deployment card holds its repository and comes after the servers: '+JSON.stringify(host));
  // The free demo has fewer repositories, so everything loose may already show.
  if(await p.locator('.pano-loose [data-loose-more]').count()){await p.click('.pano-loose [data-loose-more]');await p.waitForTimeout(150);}
  await drag('.pano-loose .pano-chip[data-chip="demo-r3"]','.pano-card[data-lane="dep1"]');
  check(await p.evaluate(()=>linkKind(state.assets.find(a=>a.id==='demo-r3'),state.assets.find(a=>a.id==='dep1')).kind==='deploy'),'A repository dropped on a deployment service deploys to it');
  // Drag targets follow the lens: a repository cannot go on a bank card or on storage.
  check(await p.evaluate(()=>!canHang(state.assets,'demo-r3','demo-c1','host')&&canHang(state.assets,'demo-d3','dep1','host')),'Targets follow the lens');
  // Focusing a deployment service: the rail lists every hub, the bar names it, and back returns.
  await p.click('.pano-card[data-lane="dep1"] [data-lane-head]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>document.querySelector('.pano-hero')?.dataset.hero==='dep1'&&document.querySelectorAll('.pf-srv').length===4&&document.querySelector('.pano-here').textContent==='web-app'&&!document.querySelector('.pano-lens')),'Focus works for any hub; the switch hides while focused');
  await p.click('.pano-back');await p.waitForTimeout(200);
  check(await p.evaluate(()=>!document.querySelector('.pano-hero')&&!!document.querySelector('.pano-lens')),'Back to the cards');
  // What you sign in with: the Google account holds what logs in with it; its card shows the masked address.
  await p.click('.pano-lens [data-lens="login"]');await p.waitForTimeout(200);
  const login=await p.evaluate(()=>({cards:[...document.querySelectorAll('.pano-card')].map(c=>c.dataset.lane+'='+[...c.querySelectorAll('.pano-chip')].map(x=>x.dataset.chip).sort().join('+')),sub:document.querySelector('.pano-card[data-lane="demo-g1"] .pl-prov')?.textContent,loose:!!document.querySelector('.pano-loose')}));
  check(login.cards.join()==='demo-g1=demo-a1+demo-u1'&&/^s.*@example\.com$/.test(login.sub)&&login.sub!=='someone@example.com'&&!login.loose,'Login cards, masked address, nothing loose: '+JSON.stringify(login));
  // By project: one card per project label; dragging a thing to another project relabels it; the hero opens the project view.
  if(projects){
  await p.click('.pano-lens [data-lens="project"]');await p.waitForTimeout(200);
  const proj=await p.evaluate(()=>({cards:[...document.querySelectorAll('.pano-card')].map(c=>c.dataset.lane+':'+c.querySelectorAll('.pano-chip').length),hub:document.querySelector('.pano-card').dataset.hub,totals:[...document.querySelectorAll('.pano-total')].map(t=>t.dataset.toggle).join()}));
  check(proj.cards.join()==='project:notes-lab:4,project:studio:3'&&proj.hub==='project'&&proj.totals.startsWith('project,'),'A card per project, bigger first: '+JSON.stringify(proj));
  await drag('.pano-card[data-lane="project:notes-lab"] .pano-chip[data-chip="demo-d2"]','.pano-card[data-lane="project:studio"]');
  const moved=await p.evaluate(()=>({project:state.assets.find(a=>a.id==='demo-d2').project,toast:document.querySelector('#toast')?.textContent||''}));
  check(moved.project==='studio'&&/已归入 studio/.test(moved.toast),'Dropping on another project relabels it: '+JSON.stringify(moved));
  await p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await p.waitForTimeout(200);
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='demo-d2').project==='notes-lab'),'Undo puts it back');
  await p.click('.pano-card[data-lane="project:studio"] [data-lane-head]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>document.querySelector('.pano-here')?.textContent==='studio'),'A project can be focused');
  await p.click('.pano-hero [data-hero-head]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>!panoOpen&&currentView()==='project:studio'),'Its hero opens the project on the board');
  }
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: login and project lenses, host by default, switch, pay cards with masked numbers and expiry tone, loose recurring costs, remembered, drag sets the payment, undo, deployment card, drop to deploy, lens-bound targets, focus any hub';
 }finally{await context.close();}
}
