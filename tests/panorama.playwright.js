// v13b P2: the read-only overview. Entry, layers of Esc, lanes and chips from the demo board, caps, unmounted strip, keyboard, density, honesty about status.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaOpen==='function');await p.waitForTimeout(300);
  const open=()=>p.evaluate(()=>!document.querySelector('#panorama').hidden);
  // Entry by key and by the toolbar button; focus lands inside, the board stays out of reach.
  await p.focus('#board [data-asset="demo-d2"] .item-open');await p.keyboard.press('p');await p.waitForTimeout(250);
  check(await open(),'P opens the panorama');
  const st=await p.evaluate(()=>({role:document.querySelector('#panorama').getAttribute('role'),label:document.querySelector('#panorama').getAttribute('aria-label'),inert:document.querySelector('main').inert,mainHidden:getComputedStyle(document.querySelector('main')).visibility,focusIn:!!document.activeElement.closest('#panorama'),title:document.querySelector('.pano-tag').textContent,tip:document.querySelector('.pano-tag').title}));
  check(st.role==='dialog'&&/登记状态，非实时/.test(st.label)&&st.inert&&st.mainHidden==='hidden'&&st.focusIn,'A named dialog; the board is inert and hidden: '+JSON.stringify(st));
  check(st.title==='登记状态 · 非实时'&&/不探测网络/.test(st.tip),'The registered-status label is always shown: '+st.title);
  // P on a mounted card lands on its server (focused state); the first Esc goes back to the overview, the second closes.
  check(await p.evaluate(()=>document.querySelector('.pano-hero')?.dataset.hero)==='demo-s1','P on a mounted card focuses its server');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);check(await open(),'Esc from the focused state returns to the overview');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(!(await open())&&await p.evaluate(()=>document.activeElement.closest('[data-asset]')?.dataset.asset==='demo-d2'),'Esc closes and returns focus to the card');
  await p.click('#panorama-button');await p.waitForTimeout(250);check(await open(),'The toolbar icon opens it');
  check(await p.evaluate(()=>document.querySelector('#panorama-button').getAttribute('aria-label')==='全景（P）'),'The icon is named');
  // Content: accounts as trays, one lane per server, caps and real totals, unmounted strip.
  const m=await p.evaluate(()=>({trays:[...document.querySelectorAll('.pano-card')].map(c=>c.dataset.lane+':'+(c.querySelector('.pl-band span')?.textContent||'')),lanes:[...document.querySelectorAll('.pano-lane')].map(l=>l.dataset.lane),totals:[...document.querySelectorAll('.pano-total')].map(t=>t.getAttribute('aria-label')),tokyo:[...document.querySelectorAll('.pano-chip[data-lane="demo-s1"]')].map(c=>c.dataset.chip),ip:document.querySelector('[data-lane="demo-s1"] .pl-ip').textContent.trim(),loose:document.querySelector('.pano-loose').getAttribute('aria-label'),looseChips:document.querySelectorAll('.pano-loose .pano-chip').length,more:document.querySelector('.pano-loose [data-loose-more]')?.textContent}));
  check(m.trays.join()==='demo-s1:Acme Cloud,demo-s2:Acme Cloud,demo-s3:'&&m.lanes.at(-1)==='demo-s3','One card per server, its account on the card, the server without one last: '+m.trays.join());
  const repos=await p.evaluate(()=>state.assets.filter(a=>a.type==='repository'&&!a.hiddenAt).length);
  check(m.totals.join()===`服务器 3,域名 3,仓库 ${repos},数据库 1`,'Totals count visible things: '+m.totals.join());
  check(m.tokyo.join()==='demo-d1,demo-d2,demo-r0,demo-r1,demo-db1','tokyo-vps lists its domains, repositories and database (the hidden domain stays out): '+m.tokyo.join());
  check(/203\.0\.113\.10/.test(m.ip),'Lane shows the address: '+m.ip);
  // The free demo has five repositories, all but the two on tokyo-vps loose and under the cap.
  if(await p.evaluate(()=>proLoaded()))check(m.loose==='未挂载，12 项'&&m.looseChips===7&&m.more==='+5','Unmounted card: 12 things, seven shown then +N: '+JSON.stringify(m));
  else check(m.loose==='未挂载，3 项'&&m.looseChips===3&&!m.more,'Unmounted card in the free demo: 3 things, no +N: '+JSON.stringify(m));
  check(await p.evaluate(()=>!document.querySelector('.pano-loose .warn,.pano-loose .red,.pano-loose .amber')),'The unmounted strip raises no warning');
  // Honest wording and no green. 在线/离线 may appear only where a probe (Pro, 探针数据源) reports it.
  const words=await p.evaluate(()=>{const c=document.querySelector('#panorama').cloneNode(true);c.querySelectorAll('.pano-probe').forEach(n=>n.remove());c.querySelectorAll('[data-lane-head],[data-hero],.pano-lane[data-lane]').forEach(n=>{const id=n.dataset.laneHead||n.dataset.hero||n.dataset.lane;if(typeof probeState==='function'&&probeState(state.assets.find(a=>a.id===id)))n.querySelectorAll('.pl-state').forEach(x=>x.remove());});return c.textContent;});
  check(!/运行中|在线|正常运行|健康|可用率/.test(words),'No live-status wording: '+words.slice(0,120));
  const green=await p.evaluate(()=>[...document.querySelectorAll('#panorama *')].some(n=>{const c=getComputedStyle(n);return [c.color,c.backgroundColor].some(v=>{const m=v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);return m&&+m[2]>+m[1]+40&&+m[2]>+m[3]+40&&c.display!=='none';});}));
  check(!green,'No green anywhere in the overview');
  check(await p.evaluate(()=>document.querySelectorAll('#panorama [style*="animation"],#panorama .pulse').length===0),'No pulsing indicators');
  // Marks: standby, proxied, copies on several servers.
  const marks=await p.evaluate(()=>{const c=id=>document.querySelector(`.pano-chip[data-chip="${id}"][data-lane="demo-s2"]`),t=document.querySelector('.pano-chip[data-chip="demo-d2"]');return {standby:!!c('demo-d1')?.querySelector('.pc-flag'),alt:!!c('demo-d1')?.querySelector('.pc-alt'),proxied:!!t?.querySelector('.pc-px'),label:c('demo-d1')?.getAttribute('aria-label')};});
  check(marks.standby&&marks.alt&&marks.proxied&&/备用/.test(marks.label)&&/另挂在 1 台服务器/.test(marks.label),'Standby, copy and proxy marks with a spoken label: '+JSON.stringify(marks));
  // Hover one copy: every copy gets the ring.
  await p.hover('.pano-chip[data-chip="demo-d1"][data-lane="demo-s1"]');await p.waitForTimeout(80);
  check(await p.evaluate(()=>document.querySelectorAll('.pano-chip.peer').length)===2,'Hovering a shared thing rings both copies');
  await p.mouse.move(2,300);await p.waitForTimeout(80);
  check(await p.evaluate(()=>document.querySelectorAll('.pano-chip.peer').length)===0,'Leaving removes the rings');
  // Expanding the unmounted strip and a lane group.
  // (The free demo's strip already shows everything, so there is nothing to expand.)
  if(await p.evaluate(()=>proLoaded())){
   await p.click('[data-loose-more]');await p.waitForTimeout(100);
   check(await p.evaluate(()=>document.querySelectorAll('.pano-loose .pano-chip').length)===12,'The strip expands to every item');
   await p.click('[data-loose-more]');
  }
  // Keyboard: arrows move between lanes and chips; Enter opens the detail above; Esc peels layers.
  await p.focus('[data-lane-head="demo-s1"]');await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-d1','Down from a lane head goes to its first chip');
  await p.keyboard.press('ArrowDown');check(await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-d2','Down walks the chips');
  await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.activeElement.dataset.lane)==='demo-s2','Right moves to the next lane');
  await p.keyboard.press('ArrowLeft');check(await p.evaluate(()=>document.activeElement.dataset.lane)==='demo-s1','Left moves back');
  await p.focus('.pano-chip[data-chip="demo-d2"]');
  // Board shortcuts do nothing here.
  const before=await p.evaluate(()=>JSON.stringify(state.assets.map(a=>[a.id,a.hiddenAt,a.name])));
  for(const k of ['h','e','f','x','n','i','o'])await p.keyboard.press(k);await p.waitForTimeout(150);
  check(await p.evaluate(()=>JSON.stringify(state.assets.map(a=>[a.id,a.hiddenAt,a.name])))===before&&!(await p.evaluate(()=>$('#modal').open)),'Board letter keys are inert in the read-only overview');
  await p.keyboard.press('Enter');await p.waitForSelector('#detail:not([hidden])');
  check(await p.evaluate(()=>document.querySelector('#detail h2').textContent)==='notes-lab.dev','Enter opens the thing\'s detail');
  check(await p.evaluate(()=>{const r=document.querySelector('#detail').getBoundingClientRect(),el=document.elementFromPoint(r.left+r.width/2,r.top+40);return !!el?.closest('#detail');}),'The detail sits above the overview');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(await open()&&await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-d2'&&await p.evaluate(()=>document.querySelector('#detail').hidden),'Esc closes the detail first and returns to the same chip');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);check(!(await open()),'A second Esc closes the overview');
  await p.keyboard.press('p');await p.waitForTimeout(100);await p.keyboard.press('p');await p.waitForTimeout(100);
  check(!(await open()),'P toggles');
  // P never fires while typing or with a dialog open.
  await p.focus('#search');await p.keyboard.type('p');check(!(await open())&&await p.inputValue('#search')==='p','P types into the search box');await p.fill('#search','');
  // v22 cards: each card is as tall as what it holds, so a small board leaves no stretched blocks; a big board steps down to compact cards.
  await p.keyboard.press('Escape');await p.evaluate(()=>document.activeElement.blur());
  const level=async(w,h)=>{await p.setViewportSize({width:w,height:h});await p.evaluate(()=>{panoramaOpen(false);panoramaOpen(true);});await p.waitForTimeout(250);return p.evaluate(()=>({layout:document.querySelector('.pano-body').dataset.layout,compact:document.querySelectorAll('.pano-card.compact').length,cards:document.querySelectorAll('.pano-card').length,overflowX:document.querySelector('.pano-body').scrollWidth>document.querySelector('.pano-body').clientWidth+1,tallest:Math.max(...[...document.querySelectorAll('.pano-card')].map(n=>n.getBoundingClientRect().height))}));};
  let d=await level(1320,822);check(d.layout==='cards'&&d.cards===3&&!d.compact&&d.tallest<400,'Roomy window: full cards sized by content '+JSON.stringify(d));
  check(await p.evaluate(()=>{const b=[...document.querySelectorAll('.pano-card,.pano-loose')].map(n=>n.getBoundingClientRect());return b.every((x,i)=>b.every((y,j)=>i>=j||Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top))<1));}),'Cards never overlap');
  check(await p.evaluate(()=>[...document.querySelectorAll('.pano-card .pano-chip')].every(n=>n.querySelector('.pc-ic svg'))),'Every row keeps its type glyph');
  check(await p.evaluate(()=>/拖到这里/.test(document.querySelector('.pano-card[data-lane="demo-s3"] .pl-empty')?.textContent||'')),'An empty card says it takes drops');
  d=await level(390,800);check(!d.overflowX,'No sideways scroll when narrow: '+JSON.stringify(d));
  await p.setViewportSize({width:1320,height:822});
  await p.evaluate(()=>{panoramaOpen(false);for(let i=0;i<30;i++)state.assets.push({id:'bulk'+i,type:'server',name:'node-'+i,provider:'Vultr',ips:['198.51.100.'+(i+1)],updatedAt:new Date(Date.now()-i*3600e3).toISOString(),source:'manual'});render();panoramaOpen(true);});await p.waitForTimeout(300);
  d=await p.evaluate(()=>({lanes:document.querySelectorAll('.pano-card').length,compact:document.querySelectorAll('.pano-card.compact').length,overflowX:document.querySelector('.pano-body').scrollWidth>document.querySelector('.pano-body').clientWidth+1}));
  check(d.lanes===33&&d.compact===33&&!d.overflowX,'Many servers step down to compact cards without sideways scroll: '+JSON.stringify(d));
  // Empty board: a quiet line and one add button; no lanes.
  // No servers (and no logins or projects) but cards: the panorama opens on who pays instead of an empty screen.
  await p.evaluate(()=>{panoramaOpen(false);state.assets=state.assets.filter(a=>a.type!=='server'&&a.type!=='google');for(const a of state.assets)delete a.project;render();panoramaOpen(true);});await p.waitForTimeout(200);
  check(await p.evaluate(()=>panoLens==='pay'&&document.querySelectorAll('.pano-card[data-hub="bankcard"]').length===2&&!document.querySelector('.pano-lens')),'No servers: the pay lens, and no switch with only one lens: '+await p.evaluate(()=>panoLens));
  await p.evaluate(()=>{panoramaOpen(false);state.assets=state.assets.filter(a=>a.type!=='bankcard');render();panoramaOpen(true);});await p.waitForTimeout(200);
  check(await p.evaluate(()=>!!document.querySelector('.pano-empty button[aria-label="添加服务器"]')&&!document.querySelector('.pano-lane')),'No hubs at all: one add button');
  await p.evaluate(()=>panoramaOpen(false));
  // Reduced motion: the overview appears without an animation.
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>panoramaOpen(true));
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('#panorama')).animationName)==='none','Reduced motion: no animation');
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: entry by P and icon, Esc layers with focus return, trays/lanes/chips/caps, unmounted strip, status wording and no green, marks, shared rings, keyboard, read-only, cards sized by content, no overlap, narrow, many servers compact, empty, reduced motion';
 }finally{await context.close();}
}
