// v13b P5: the manual "stopped" mark. A registered fact: hollow ring, muted name, same place, S key, inspector menu item, undo, panorama in step.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof toggleStopped==='function');await p.waitForTimeout(300);
  const order=()=>p.evaluate(()=>[...document.querySelectorAll('#board [data-asset]')].map(n=>n.dataset.asset).join());
  const stopped=id=>p.evaluate(i=>!!state.assets.find(a=>a.id===i).stopped,id);
  const before=await order();
  // Inspector: one quiet item in the ⋯ menu, no confirmation.
  await p.click('#board [data-asset="demo-d2"] .item-open');await p.waitForSelector('#detail:not([hidden])');
  const menuItem=async()=>{await p.click('#detail [data-action="asset-menu"]');await p.waitForSelector('#menu:not([hidden])');return p.evaluate(()=>document.querySelector('#menu [data-action="toggle-stopped"]')?.textContent);};
  check((await menuItem()).startsWith('标为停用'),'Inspector menu offers 标为停用');
  await p.click('#menu [data-action="toggle-stopped"]');await p.waitForTimeout(200);
  check(await stopped('demo-d2'),'Marked stopped');
  check(await p.evaluate(()=>/已标为停用/.test(document.querySelector('#toast').textContent)&&!!document.querySelector('#toast .toast-undo')),'Toast with undo');
  check((await menuItem()).startsWith('恢复启用'),'The item flips to 恢复启用');await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  const st=await p.evaluate(()=>{const c=document.querySelector('#board [data-asset="demo-d2"]'),o=document.querySelector('#board [data-asset="demo-d1"]');return {cls:c.classList.contains('stopped'),ring:c.querySelector('.stop-ring')?.getAttribute('aria-label'),label:c.querySelector('.item-open').getAttribute('aria-label'),color:getComputedStyle(c.querySelector('.r-text')).color,other:getComputedStyle(o.querySelector('.r-text')).color,ringBox:getComputedStyle(c.querySelector('.stop-ring')).backgroundColor};});
  check(st.cls&&st.ring==='已停用'&&/已停用/.test(st.label),'Ring, class and spoken label: '+JSON.stringify(st));
  check(st.color!==st.other,'The name goes muted: '+st.color+' vs '+st.other);
  check(await order()===before,'Nothing moves: a stopped card keeps its place');
  // A stopped record is not chased: its date stays readable but uncoloured, and it leaves 即将到来 and the due counts.
  const quiet=await p.evaluate(()=>{const a={...state.assets.find(x=>x.id==='demo-d2'),date:isoDay(localDay(new Date())+3),cycle:'',stopped:true};return {cls:eventInfo(a).cls,text:eventInfo(a).text,listed:upcomingEvents([a]).length,due:dueLevels([a])};});
  check(quiet.cls===''&&/3 天后/.test(quiet.text)&&quiet.listed===0&&quiet.due.soon===0,'Stopped is quiet: '+JSON.stringify(quiet));
  await p.keyboard.press('Control+z');await p.waitForTimeout(200);
  check(!(await stopped('demo-d2')),'⌘Z restores');
  // S on a focused board card toggles and keeps focus on the card.
  await p.focus('#board [data-asset="demo-d2"] .item-open');await p.keyboard.press('s');await p.waitForTimeout(200);
  check(await stopped('demo-d2')&&await p.evaluate(()=>document.activeElement.closest('[data-asset]')?.dataset.asset==='demo-d2'),'S marks it and focus stays');
  await p.keyboard.press('s');await p.waitForTimeout(200);check(!(await stopped('demo-d2')),'S again brings it back');
  // Accounts cannot be stopped: a short note, no change.
  const sub=await p.evaluate(()=>state.assets.find(a=>['appleid','google','bankcard'].includes(a.type)&&!a.hiddenAt).id);
  await p.focus(`#board [data-asset="${sub}"] .item-open`);await p.keyboard.press('s');await p.waitForTimeout(150);
  check(!(await stopped(sub))&&await p.evaluate(()=>/不用标停用/.test(document.querySelector('#toast').textContent)),'Accounts have no stopped state, with a short note');
  // Panorama stays in step and S works there too.
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{document.activeElement.blur();});await p.keyboard.press('p');await p.waitForTimeout(250);
  await p.focus('.pano-chip[data-chip="demo-d2"]');await p.keyboard.press('s');await p.waitForTimeout(200);
  check(await stopped('demo-d2')&&await p.evaluate(()=>document.querySelector('.pano-chip[data-chip="demo-d2"]').classList.contains('stopped')&&!!document.querySelector('.pano-chip[data-chip="demo-d2"] .pd.off')&&document.activeElement.dataset.chip==='demo-d2'),'S in the panorama: hollow dot, muted chip, focus kept');
  await p.focus('[data-lane-head="demo-s2"]');await p.keyboard.press('s');await p.waitForTimeout(200);
  check(await p.evaluate(()=>document.querySelector('.pano-lane[data-lane="demo-s2"]').classList.contains('stopped')&&!!document.querySelector('.pano-lane[data-lane="demo-s2"] .pano-lane-head .pd.off')&&/已停用/.test(document.querySelector('.pano-lane[data-lane="demo-s2"] .pano-lane-head').getAttribute('aria-label'))),'A stopped server lane says 已停用');
  await p.click('[data-lane-head="demo-s2"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>document.querySelector('.pano-hero').classList.contains('stopped')&&/已停用/.test(document.querySelector('.pano-hero .ph-st').textContent)&&!!document.querySelector('.pf-srv.on .pd.off')),'Focused: hero and rail show it');
  await p.keyboard.press('s');await p.waitForTimeout(200);
  check(!(await stopped('demo-s2')),'S on the hero toggles the server');
  await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.waitForTimeout(150);
  // Honest: nothing in the UI claims a live state for it, except what a probe (Pro, 探针数据源) reports, which is set aside here.
  const words=await p.evaluate(()=>{const s=document.createElement('style');s.textContent='.r-probe,.pano-probe,.probe-facts{display:none!important}';document.head.append(s);const t=document.body.innerText;s.remove();return t;});check(!/运行中|在线|已下线|宕机/.test(words),'No live-state wording');
  // Persisted with the asset, so backups carry it.
  check(await p.evaluate(()=>JSON.stringify(state).includes('"stopped":true')),'Stored on the asset');
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: inspector menu item, ring + muted name + spoken label, nothing moves, undo, S on board and panorama, accounts excluded, stopped lane/hero/rail, stored on the asset';
 }finally{await context.close();}
}
