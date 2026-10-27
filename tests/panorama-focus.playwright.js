// v13b P3: the focused state. One server as the protagonist, a rail of all servers, three columns, Esc layers, shared rings, P from the board.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaOpen==='function');await p.waitForTimeout(300);
  await p.evaluate(()=>{const add=(id,type,name)=>{state.assets.push({id,type,name,provider:'x',updatedAt:new Date(Date.now()-state.assets.length*864e5).toISOString(),source:'manual',links:['demo-s1']});state.assets.find(a=>a.id==='demo-s1').links.push(id);};for(let i=0;i<5;i++)add('xd'+i,'domain','site-'+i+'.dev');for(let i=0;i<4;i++)add('xr'+i,'repository','acme-labs/extra-'+i);render();});
  const q=sel=>p.evaluate(s=>document.querySelector(s)?.textContent||'',sel);
  await p.keyboard.press('p');await p.waitForTimeout(200);
  // Clicking a lane head makes that server the protagonist; the overview is replaced, not stacked.
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(300);
  const f=await p.evaluate(()=>({hero:document.querySelector('.pano-hero')?.dataset.hero,name:document.querySelector('.ph-nm')?.textContent,ips:[...document.querySelectorAll('.ph-ips .ip-pill')].map(n=>n.dataset.ip),rail:[...document.querySelectorAll('.pf-srv')].map(n=>n.dataset.pick+(n.getAttribute('aria-current')?'*':'')),acct:document.querySelector('.pf-acct')?.getAttribute('aria-label'),cols:[...document.querySelectorAll('.pf-col')].map(c=>c.dataset.group+':'+c.querySelectorAll('.pano-chip').length+':'+(c.querySelector('h3 span')?.textContent)),lanes:document.querySelectorAll('.pano-lane').length,focusIn:document.activeElement?.matches('[data-hero-head]'),fs:getComputedStyle(document.querySelector('.ph-nm')).fontSize,loose:!!document.querySelector('.pano-loose')}));
  check(f.hero==='demo-s1'&&f.name==='tokyo-vps'&&f.lanes===0,'The hero is the chosen server and the lanes are gone: '+JSON.stringify(f));
  check(f.ips.join()==='203.0.113.10,2001:db8::10','All addresses sit on the hero: '+f.ips);
  check(f.rail.join()==='demo-s1*,demo-s2,demo-s3','Every server is in the rail, the current one marked: '+f.rail);
  check(/Acme Cloud/.test(f.acct),'The account sits above the hero: '+f.acct);
  check(f.cols.length===3&&/^domain:6:\d+$/.test(f.cols[0])&&/^repository:/.test(f.cols[1])&&/^database:/.test(f.cols[2]),'Three columns, capped at six with the real total in the header: '+f.cols);
  check(await p.evaluate(()=>document.querySelector('.pf-col[data-group="domain"] .pano-more')?.textContent)&&f.focusIn&&f.fs==='17px'&&f.loose,'+N under a full column, focus on the hero, 17px name, unmounted strip still visible: '+JSON.stringify(f));
  check(await p.evaluate(()=>document.querySelectorAll('#panorama .pano-lane,#panorama svg line,#panorama svg path.link').length===0),'No lines or lane clones');
  // The hero carries the server's registered status and counts; the header total is the real number even when the column is capped.
  await p.click('.pf-col[data-group="domain"] .pano-more');await p.waitForTimeout(100);
  const total=await p.evaluate(()=>({n:document.querySelectorAll('.pf-col[data-group="domain"] .pano-chip').length,h:document.querySelector('.pf-col[data-group="domain"] h3 span').textContent}));
  check(String(total.n)===total.h,'Expanding shows every domain: '+JSON.stringify(total));
  // Esc layers: detail first, then back to the overview on the same lane, then close.
  await p.focus('[data-hero-head]');await p.keyboard.press('Enter');await p.waitForSelector('#detail:not([hidden])');
  check(await q('#detail h2')==='tokyo-vps','Enter on the hero opens the server\'s detail');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(await p.evaluate(()=>!!document.querySelector('.pano-hero')&&document.querySelector('#detail').hidden),'Esc closes the detail and stays focused on the server');
  await p.keyboard.press('Escape');await p.waitForTimeout(250);
  const back=await p.evaluate(()=>({hero:!!document.querySelector('.pano-hero'),lanes:document.querySelectorAll('.pano-lane').length,at:document.activeElement?.dataset.laneHead,open:!document.querySelector('#panorama').hidden}));
  check(!back.hero&&back.lanes===3&&back.at==='demo-s1'&&back.open,'Esc returns to the overview with focus on the same lane: '+JSON.stringify(back));
  // Without a keyboard: the title turns into a back button while focused, and the sidebar's 全景 entry also leads back to the map.
  check(await p.evaluate(()=>!document.querySelector('.pano-back')),'No back button on the overview');
  await p.click('[data-lane-head="demo-s2"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>document.querySelector('.pano-here')?.textContent)==='frankfurt-vps','The bar names the focused server');
  await p.click('.pano-back');await p.waitForTimeout(250);
  const clicked=await p.evaluate(()=>({hero:!!document.querySelector('.pano-hero'),lanes:document.querySelectorAll('.pano-lane').length,at:document.activeElement?.dataset.laneHead}));
  check(!clicked.hero&&clicked.lanes===3&&clicked.at==='demo-s2','The back button returns to the overview on the same lane: '+JSON.stringify(clicked));
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(250);
  await p.click('#sidebar [data-action="panorama"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>!document.querySelector('.pano-hero')&&!document.querySelector('#panorama').hidden),'The sidebar entry leads back to the map, it does not close it');
  // Rail: arrows move without switching, Enter switches, the hero changes.
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(250);
  await p.focus('.pf-srv.on');await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>document.activeElement.dataset.pick==='demo-s2'&&document.querySelector('.pano-hero').dataset.hero==='demo-s1'),'Down in the rail moves focus only');
  await p.keyboard.press('Enter');await p.waitForTimeout(300);
  const sw=await p.evaluate(()=>({hero:document.querySelector('.pano-hero').dataset.hero,on:document.querySelector('.pf-srv.on')?.dataset.pick,ips:[...document.querySelectorAll('.ph-ips .ip-pill')].map(n=>n.dataset.ip).join()}));
  check(sw.hero==='demo-s2'&&sw.on==='demo-s2'&&sw.ips==='198.51.100.24','Enter on a rail entry switches the hero: '+JSON.stringify(sw));
  check(await p.evaluate(()=>document.activeElement.dataset.pick==='demo-s2'),'Focus stays on the rail entry after switching');
  // Spatial keys: right goes to the hero, down into the columns, left back to the rail.
  await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.activeElement.matches('[data-hero-head]')),'Right from the rail lands on the hero');
  await p.keyboard.press('ArrowDown');check(await p.evaluate(()=>document.activeElement.matches('.pf-col .pano-chip')),'Down from the hero walks into the first column');
  await p.keyboard.press('ArrowLeft');check(await p.evaluate(()=>document.activeElement.classList.contains('on')),'Left from the first column returns to the current rail entry');
  // Shared things ring the other server in the rail.
  await p.click('.pf-srv[data-pick="demo-s1"]');await p.waitForTimeout(250);
  await p.hover('.pf-col .pano-chip[data-chip="demo-d1"]');await p.waitForTimeout(80);
  check(await p.evaluate(()=>[...document.querySelectorAll('.pf-srv.peer')].map(n=>n.dataset.pick).join())==='demo-s2','Hovering a shared domain rings the other server in the rail');
  await p.mouse.move(2,500);await p.waitForTimeout(80);
  check(await p.evaluate(()=>document.querySelectorAll('.peer').length)===0,'Leaving removes it');
  // Hiding the focused server returns to the overview instead of leaving a stale hero.
  await p.evaluate(()=>{state.assets.find(a=>a.id==='demo-s1').hiddenAt=new Date().toISOString();render();});await p.waitForTimeout(200);
  check(await p.evaluate(()=>!document.querySelector('.pano-hero')&&document.querySelectorAll('.pano-lane').length===2),'A hidden server drops the focus');
  await p.evaluate(()=>{delete state.assets.find(a=>a.id==='demo-s1').hiddenAt;render();});
  // Status wording and green stay out of the focused state, and nothing pulses.
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(250);
  // 在线/离线 may appear only where a probe (Pro, 探针数据源) reports it.
  const words=await p.evaluate(()=>{const c=document.querySelector('#panorama').cloneNode(true);c.querySelectorAll('.pano-probe').forEach(n=>n.remove());c.querySelectorAll('[data-lane-head],[data-hero],.pano-lane[data-lane]').forEach(n=>{const id=n.dataset.laneHead||n.dataset.hero||n.dataset.lane;if(typeof probeState==='function'&&probeState(state.assets.find(a=>a.id===id)))n.querySelectorAll('.pl-state').forEach(x=>x.remove());});return c.textContent;});check(!/运行中|在线|正常运行|健康|可用率/.test(words),'No live-status wording');
  check(await p.evaluate(()=>[...document.querySelectorAll('#panorama *')].every(n=>getComputedStyle(n).animationName==='none'||n===document.querySelector('#panorama'))),'Nothing pulses');
  // Motion: a 200 ms flip on entry; none under reduced motion.
  await p.keyboard.press('Escape');await p.waitForTimeout(250);
  const flip=await p.evaluate(()=>{document.querySelector('[data-lane-head="demo-s2"]').click();return document.getAnimations().filter(a=>a.effect?.getTiming().duration===200).length;});
  check(flip===1,'Entering focus plays one 200 ms flip: '+flip);
  await p.keyboard.press('Escape');await p.waitForTimeout(300);
  await p.emulateMedia({reducedMotion:'reduce'});
  const calm=await p.evaluate(()=>{document.querySelector('[data-lane-head="demo-s2"]').click();return document.getAnimations().filter(a=>a.effect?.target?.closest?.('#panorama')&&a.effect.getTiming().duration!==0).length;});
  check(calm===0,'Reduced motion: no flip ('+calm+')');
  await p.keyboard.press('Escape');await p.waitForTimeout(100);await p.emulateMedia({reducedMotion:'no-preference'});
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  // P from the board: on a server card it focuses that server, on a mounted card it focuses its server, on a loose card it opens the overview.
  const pOn=async sel=>{await p.focus(sel);await p.keyboard.press('p');await p.waitForTimeout(250);const r=await p.evaluate(()=>document.querySelector('.pano-hero')?.dataset.hero||'overview');await p.keyboard.press('Escape');await p.waitForTimeout(150);if(await p.evaluate(()=>!document.querySelector('#panorama').hidden))await p.keyboard.press('Escape');await p.waitForTimeout(150);return r;};
  check(await pOn('#board [data-asset="demo-s2"] .item-open')==='demo-s2','P on a server card focuses that server');
  check(await pOn('#board [data-asset="demo-d2"] .item-open')==='demo-s1','P on a mounted card focuses the server it sits on');
  const loose=await p.evaluate(()=>state.assets.find(a=>a.type==='repository'&&!a.hiddenAt&&!serverChain(state.assets,a).servers.length)?.id);
  check(await pOn(`#board [data-asset="${loose}"] .item-open`)==='overview','P on an unmounted card opens the overview');
  // Narrow window: rail becomes a strip, columns stack, no sideways scroll.
  await p.setViewportSize({width:390,height:844});await p.keyboard.press('p');await p.waitForTimeout(250);await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(250);
  const n=await p.evaluate(()=>{const b=document.querySelector('.pano-body'),r=document.querySelector('.pano-rail').getBoundingClientRect();return {layout:b.dataset.layout,over:b.scrollWidth>b.clientWidth+1,stripH:r.height<120,cols:getComputedStyle(document.querySelector('.pf-cols')).gridTemplateColumns.split(' ').length};});
  check(n.layout==='stack'&&!n.over&&n.stripH&&n.cols===1,'Narrow: strip rail and one column: '+JSON.stringify(n));
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: focus by click, hero with addresses/account/status, rail of servers, capped columns with real totals and expand, Esc layers, rail switching, spatial arrows, shared ring in the rail, hidden server drops focus, no live wording/pulse, 200 ms flip and reduced motion, P from the board, narrow';
 }finally{await context.close();}
}
