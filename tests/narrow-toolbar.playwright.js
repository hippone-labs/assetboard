// The narrow window's bar (material.css, the narrow bar): under 761px the page scrolls and the bar sticks to its top. At 390px and
// every width up to 760, in 中文 and English, in the quiet skin light and dark and on two 冰箱贴 doors: every control of the bar is
// whole, inside the bar and the window, clear of every other control, and the one a click at its centre reaches, before and after
// the page scrolls under it (the bar stays at the top, the board below it); the view's title and the demo badge are not cut. At
// 390px it also goes through every view and layout, clicks the controls for real, puts the banner under the wrapped bar, and checks
// the bar is solid with Reduce transparency and still glass without it. Wide windows keep the one-row bar. Demo data only.
async (page) => {
 const browser=page.context().browser();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const widths=[390,414,480,520,560,600,640,720,760];
 const open=async({lang='zh',skin='quiet',scene='',scheme='light',motion='no-preference',transparency='no-preference',width=390}={})=>{
  const context=await browser.newContext({viewport:{width,height:760},reducedMotion:motion,colorScheme:scheme});
  await context.addInitScript(([lang,skin,scene])=>{localStorage.setItem('assetboard-lang-v1',lang);localStorage.setItem('assetboard-skin-v1',skin);if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);},[lang,skin,scene]);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  // Chromium on macOS takes Reduce transparency from the system (on in GitHub's hosted images); the page is given it here, and the
  // scheme and the motion again, since this call replaces the media features Playwright set.
  await (await context.newCDPSession(p)).send('Emulation.setEmulatedMedia',{media:'',features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:motion},{name:'prefers-reduced-transparency',value:transparency}]});
  await p.goto('http://127.0.0.1:4317/?demo');await p.waitForTimeout(500);
  return {context,p,errors,label:`${lang} ${skin}${scene?' '+scene:''} ${scheme}`};
 };
 const done=async s=>{await s.context.close();check(!s.errors.length,s.label+': page errors: '+s.errors.join(' | '));};
 const settle=p=>p.waitForTimeout(150);
 const scroll=async(p,y)=>{await p.evaluate(y=>window.scrollTo(0,y),y);await settle(p);};
 // Every visible control of the bar, measured; the problems found.
 const audit=p=>p.evaluate(()=>{
  const bar=document.querySelector('#topbar'),b=bar.getBoundingClientRect(),problems=[];
  const name=n=>n.id||n.dataset.id||n.getAttribute('aria-label')||n.textContent.trim()||n.className;
  const controls=[...bar.querySelectorAll('button,input,select,a[href]')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
  const rects=controls.map(n=>n.getBoundingClientRect());
  controls.forEach((n,i)=>{const r=rects[i];
   if(!n.closest("#view-meta")&&(r.width<20||r.height<20))problems.push(`${name(n)} is ${Math.round(r.width)}×${Math.round(r.height)}`);
   if(r.left<b.left-.5||r.right>b.right+.5||r.top<b.top-.5||r.bottom>b.bottom+.5)problems.push(`${name(n)} leaves the bar`);
   if(r.left<-.5||r.right>innerWidth+.5)problems.push(`${name(n)} leaves the window`);
   // Cut by a parent that clips it.
   for(let a=n.parentElement;a&&a!==document.body;a=a.parentElement){if(getComputedStyle(a).overflowX==='visible')continue;const q=a.getBoundingClientRect();if(r.left<q.left-.5||r.right>q.right+.5)problems.push(`${name(n)} is cut by ${a.id||a.className}`);}
   const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
   if(!hit||!n.contains(hit))problems.push(`a click on ${name(n)} reaches ${hit?name(hit.closest("button,input,a")||hit):"nothing"}`);
   controls.forEach((m,j)=>{if(j<=i||m.contains(n)||n.contains(m))return;const q=rects[j];
    if(q.left<r.right-.5&&q.right>r.left+.5&&q.top<r.bottom-.5&&q.bottom>r.top+.5)problems.push(`${name(n)} overlaps ${name(m)}`);});
  });
  // The title and the badge are whole (the meta beside them may give way).
  for(const n of bar.querySelectorAll('#view-title,.demo-badge'))if(n.getClientRects().length&&n.scrollWidth>n.clientWidth+1)problems.push(`${name(n)} is cut: "${n.textContent}"`);
  const board=document.querySelector('#board').getBoundingClientRect();
  return {problems,top:b.top,bottom:b.bottom,height:b.height,board:board.top,n:controls.length,pos:getComputedStyle(bar).position};
 });
 const expectClean=(a,where)=>check(!a.problems.length&&a.n>=4,where+': '+JSON.stringify(a));

 // Every width, four looks, both languages: at the top of the page and scrolled under the bar.
 const looks=[{lang:'zh',skin:'quiet',scheme:'light'},{lang:'en',skin:'quiet',scheme:'light'},{lang:'zh',skin:'quiet',scheme:'dark'},{lang:'en',skin:'quiet',scheme:'dark'},
  {lang:'zh',skin:'magnet',scene:'kitchen'},{lang:'en',skin:'magnet',scene:'kitchen',motion:'reduce'},{lang:'zh',skin:'magnet',scene:'city',motion:'reduce'},{lang:'en',skin:'magnet',scene:'city'}];
 for(const look of looks){
  const s=await open(look);
  for(const width of widths){
   await s.p.setViewportSize({width,height:760});await settle(s.p);
   const where=`${s.label} ${width}px`;
   const top=await audit(s.p);expectClean(top,where);
   check(top.pos==='sticky'&&top.board>=top.bottom-.5,where+': the board starts under the bar: '+JSON.stringify(top));
   await scroll(s.p,500);
   const under=await audit(s.p);expectClean(under,where+', scrolled');
   check(Math.abs(under.top)<.5&&Math.abs(under.height-top.height)<.5,where+': the bar sticks to the top when scrolled: '+JSON.stringify(under));
   await scroll(s.p,0);
  }
  await done(s);
 }

 // 390px: every view, every layout; the clicks land; the banner sits under the wrapped bar; Reduce transparency.
 for(const lang of ['zh','en']){
  const s=await open({lang}),p=s.p;
  const views=await p.evaluate(()=>['all','upcoming','hidden',...Object.keys(cats)]);
  for(const v of views){
   await p.evaluate(v=>setView(v),v);await settle(p);
   expectClean(await audit(p),`${s.label} 390px, view ${v}`);
  }
  await p.evaluate(()=>setView('all'));await settle(p);
  for(const layout of ['list','grid','timeline','wall']){
   const button=p.locator(`#layout-toggle [data-id="${layout}"]`);
   await button.click();await settle(p);
   check(await button.getAttribute('aria-pressed')==='true',`${s.label} 390px: a click on ${layout} switches the layout`);
   expectClean(await audit(p),`${s.label} 390px, layout ${layout}`);
  }
  await scroll(p,500);
  const privacy=p.locator('#privacy-toggle');
  await privacy.click();check(await privacy.getAttribute('aria-pressed')==='true','A click on the privacy toggle under the scrolled bar turns it on');
  await privacy.click();check(await privacy.getAttribute('aria-pressed')==='false','and off');
  await p.locator('#add-block').click();await settle(p);
  check(await p.evaluate(()=>$('#modal').open),'A click on add opens the add dialog');
  await p.evaluate(()=>$('#modal').close());await settle(p);
  // A delete request waiting: the banner sticks under the bar's real height, not under a one-row bar.
  await p.evaluate(()=>{intake.push({id:'narrow-test',deleteId:'demo-s1'});syncActionBanner();});await scroll(p,600);
  const banner=await p.evaluate(()=>{const b=$('#action-banner').getBoundingClientRect(),bar=$('#topbar').getBoundingClientRect();return {top:b.top,bar:bar.bottom};});
  check(banner.top>=banner.bar-.5,'The banner sits under the wrapped bar: '+JSON.stringify(banner));
  expectClean(await audit(p),`${s.label} 390px, with the banner`);
  await p.evaluate(()=>{intake=intake.filter(i=>i.id!=='narrow-test');syncActionBanner();});
  await done(s);
 }
 const fill=p=>p.evaluate(()=>{const c=getComputedStyle($('#topbar'));return {bg:c.backgroundColor,blur:c.backdropFilter};});
 for(const look of [{skin:'quiet',scheme:'dark'},{skin:'magnet',scene:'kitchen'}]){
  let s=await open({...look,transparency:'reduce'});
  let f=await fill(s.p);check(/^rgb\(/.test(f.bg)&&f.blur==='none',s.label+': with Reduce transparency the narrow bar is solid: '+JSON.stringify(f));
  expectClean(await audit(s.p),s.label+' 390px, Reduce transparency');
  await done(s);
  s=await open(look);
  f=await fill(s.p);check(/^rgba\(.*0?\.\d+\)$/.test(f.bg)&&/blur/.test(f.blur),s.label+': otherwise it is glass: '+JSON.stringify(f));
  await done(s);
 }

 // Wide windows: the bar is one row of the card's bar height, as before.
 for(const width of [1024,1400]){
  const s=await open({width});
  const row=await s.p.evaluate(()=>{const bar=$('#topbar'),b=bar.getBoundingClientRect(),mids=[...bar.querySelectorAll('button')].filter(n=>n.getClientRects().length&&!n.closest('#view-meta')).map(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2;});
   return {height:b.height,barH:parseFloat(getComputedStyle(bar).getPropertyValue('--bar-h')),spread:Math.max(...mids)-Math.min(...mids)};});
  check(Math.abs(row.height-row.barH)<.5&&row.spread<1,`${width}px: one row: `+JSON.stringify(row));
  await done(s);
 }
 return 'ok';
}
