// v13b P4: drag a chip onto another server (move here / ⌥ also here / unmounted strip = unlink), cancel paths, undo, focused state, keyboard twin.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaOpen==='function');await p.waitForTimeout(300);
  const servers=id=>p.evaluate(i=>serverChain(state.assets,state.assets.find(a=>a.id===i)).servers.map(s=>s.id).sort().join(),id);
  const center=async sel=>{const b=await p.locator(sel).first().boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,b};};
  const history0=()=>p.evaluate(()=>history.length);
  const open=async()=>{if(await p.evaluate(()=>document.querySelector('#panorama').hidden))await p.keyboard.press('p');await p.waitForTimeout(200);};
  await open();
  // A log of every way the detail opens (showDetail: the event that led to it, its target and the call stack) and of the detail
  // showing and hiding, with the test's steps in between; printed in full when a wait runs out.
  await p.evaluate(()=>{
   const say=n=>n&&n.tagName?n.tagName+'.'+String(n.className).trim().replace(/\s+/g,'.')+(n.dataset?.chip?'#'+n.dataset.chip:'')+(n.dataset?.lane?'['+n.dataset.lane+']':'')+(n.dataset?.pick?'@'+n.dataset.pick:''):String(n);
   const log=window.__log=[],now=()=>Math.round(performance.now()),show=window.showDetail;
   window.showDetail=function(id,...rest){const e=window.event;log.push({t:now(),open:id,wasOpen:!$('#detail').hidden,event:e?{type:e.type,target:say(e.target),at:Math.round(e.timeStamp),x:e.clientX,y:e.clientY,trusted:e.isTrusted}:null,
    stack:String(new Error().stack).split('\n').slice(2,8).map(l=>l.trim().replace(/https?:\/\/[^/]+\//,'')).join(' < ')});return show.call(this,id,...rest);};
   new MutationObserver(()=>log.push({t:now(),detail:$('#detail').hidden?'hidden':'shown'})).observe($('#detail'),{attributes:true,attributeFilter:['hidden']});
   for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{if(e.target.closest?.('#panorama,#detail'))log.push({t:now(),[type]:say(e.target),at:Math.round(e.timeStamp)});},true);
  });
  const step=name=>p.evaluate(([name])=>window.__log.push({t:Math.round(performance.now()),step:name}),[name]);
  check(await servers('demo-d2')==='demo-s1','Start: notes-lab.dev sits on tokyo-vps');
  await step('wobble click');
  // A press with a small wobble is still a click: it opens the detail and nothing moves.
  let c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+2,c.y+1);await p.mouse.up();await p.waitForTimeout(150);
  check(await p.evaluate(()=>!document.querySelector('#detail').hidden&&document.querySelector('#detail h2').textContent==='notes-lab.dev'),'Under 4px is a click, not a drag');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await step('drag to frankfurt');
  // Drag to frankfurt-vps: lifted ghost, dashed hole, legal lanes bright and the rest at 55%, a slot in the target, then the drop moves it.
  const h0=await history0();
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');
  const t=await center('.pano-lane[data-lane="demo-s2"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+30,c.y+10,{steps:3});await p.mouse.move(t.x,t.y,{steps:8});await p.waitForTimeout(250);
  const mid=await p.evaluate(()=>({ghost:!!document.querySelector('.pano-ghost'),hole:!!document.querySelector('.pano-chip.drag-hole'),dragging:document.querySelector('#panorama').classList.contains('dragging'),on:document.querySelector('.drop-on')?.dataset.lane,slot:!!document.querySelector('.pano-lane[data-lane="demo-s2"] .pano-slot'),dim:getComputedStyle(document.querySelector('.pano-lane[data-lane="demo-s1"]')).opacity,bright:getComputedStyle(document.querySelector('.pano-lane[data-lane="demo-s2"]')).opacity,shadow:getComputedStyle(document.querySelector('.pano-ghost')).boxShadow!=='none',live:document.querySelector('#pano-live').textContent}));
  check(mid.ghost&&mid.hole&&mid.dragging&&mid.on==='demo-s2'&&mid.slot,'Lifted ghost, hole, snapped target with a slot: '+JSON.stringify(mid));
  check(mid.dim==='0.55'&&mid.bright==='1'&&mid.shadow,'Others at 55%, target bright, ghost raised: '+JSON.stringify(mid));
  check(/移到 frankfurt-vps/.test(mid.live),'The move is announced: '+mid.live);
  await p.mouse.up();await p.waitForTimeout(250);
  check(await servers('demo-d2')==='demo-s2','Dropped: now on frankfurt-vps only');
  check(await p.evaluate(()=>document.querySelector('#detail').hidden&&!document.querySelector('.pano-ghost')&&!document.querySelector('.dragging')&&!document.querySelector('.drag-hole')),'No detail from the drop, ghost and states cleaned up');
  // The click a release makes can arrive late on a busy machine (the Mac runner): it still opens nothing, and a real click after it does.
  await p.evaluate(()=>new Promise(r=>setTimeout(()=>{document.querySelector('#panorama .pano-chip[data-chip="demo-d2"]').click();r();},200)));
  check(await p.evaluate(()=>document.querySelector('#detail').hidden),'A late click after a drop opens no detail');
  check(await p.evaluate(()=>/已移到 frankfurt-vps/.test(document.querySelector('#toast').textContent)&&!!document.querySelector('#toast .toast-undo')),'Toast with undo');
  check(await history0()===h0+1,'One drag is one undo step');
  await p.keyboard.press('Control+z');await p.waitForTimeout(250);
  check(await servers('demo-d2')==='demo-s1','⌘Z puts it back');
  await step('alt drop');
  // ⌥ at the drop = also here.
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');const t2=await center('.pano-lane[data-lane="demo-s2"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(t2.x,t2.y,{steps:10});await p.keyboard.down('Alt');await p.mouse.up();await p.keyboard.up('Alt');await p.waitForTimeout(250);
  check(await servers('demo-d2')==='demo-s1,demo-s2','⌥ drop keeps the old server and adds the new one');
  check(await p.evaluate(()=>/也挂到 frankfurt-vps/.test(document.querySelector('#toast').textContent)),'Toast says also');
  await p.keyboard.press('Control+z');await p.waitForTimeout(250);
  await step('onto strip');
  // Onto the unmounted strip: unlinks from the lane it left.
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');const lz=await center('.pano-loose');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(lz.x,lz.y,{steps:10});await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelector('.pano-loose').classList.contains('drop-on')),'The unmounted strip is a target');
  await p.mouse.up();await p.waitForTimeout(250);
  check(await servers('demo-d2')===''&&await p.evaluate(()=>!!document.querySelector('.pano-loose-chips [data-chip="demo-d2"]')||!!document.querySelector('[data-loose-more]')),'Unlinked and now unmounted');
  await p.keyboard.press('Control+z');await p.waitForTimeout(250);
  check(await servers('demo-d2')==='demo-s1','Undo relinks');
  await step('cancel paths');
  // Cancel paths: Esc mid-drag, drop in empty space, drop back on the origin lane. State never changes.
  const snap=()=>p.evaluate(()=>JSON.stringify(state.assets.map(a=>[a.id,a.links])));const before=await snap();const h1=await history0();
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(t.x,t.y,{steps:6});await p.keyboard.press('Escape');await p.waitForTimeout(250);
  check(await p.evaluate(()=>!document.querySelector('.pano-ghost')&&!document.querySelector('.dragging')&&!document.querySelector('#panorama').hidden),'Esc cancels the drag and keeps the overview open');
  await p.mouse.up();await p.waitForTimeout(100);
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(700,28,{steps:6});
  check(await p.evaluate(()=>!document.querySelector('.drop-on')),'Nothing snaps in empty space');await p.mouse.up();await p.waitForTimeout(300);
  // Released on the lane's own head: inside the lane it came from, and far enough from the chip to be a drag on any layout (a point
  // fixed below the lane's centre landed on the chip itself on the Mac runner, which made it a click that opened the detail).
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');const origin=await center('.pano-lane[data-lane="demo-s1"] .pano-lane-head');
  check(Math.hypot(origin.x-c.x,origin.y-c.y)>20,'The release point is away from the chip: '+JSON.stringify({c,origin}));
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(origin.x,origin.y,{steps:6});
  check(await p.evaluate(()=>!!panoDrag&&!document.querySelector('.drop-on')),'The lane it came from is not a target');await p.mouse.up();await p.waitForTimeout(300);
  check(await p.evaluate(()=>$('#detail').hidden&&!panoFocus),'No cancelled drag opened the detail or the focused state');
  check(await snap()===before&&await history0()===h1,'Cancelled drags change nothing and leave no undo step');
  await step('from strip');
  // From the unmounted strip onto a lane: attaches (no detach target when it came from there).
  const looseId=await p.evaluate(()=>document.querySelector('.pano-loose-chips .pano-chip').dataset.chip);
  c=await center(`.pano-loose .pano-chip[data-chip="${looseId}"]`);const t3=await center('.pano-lane[data-lane="demo-s3"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(t3.x,t3.y,{steps:10});
  check(await p.evaluate(()=>!document.querySelector('.pano-loose').classList.contains('drop-ok')),'Coming from the strip there is no unlink target');
  await p.mouse.up();await p.waitForTimeout(250);
  check(await servers(looseId)==='demo-s3','Dropped from the strip onto home-nas');
  await p.keyboard.press('Control+z');await p.waitForTimeout(200);
  await step('focused rail drop');
  // Focused state: drop on a rail entry.
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(300);
  c=await center('.pf-col .pano-chip[data-chip="demo-d2"]');const rail=await center('.pf-srv[data-pick="demo-s2"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(rail.x,rail.y,{steps:10});await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelector('.drop-on')?.dataset.pick==='demo-s2'),'A rail entry is a target in the focused state');
  await p.mouse.up();await p.waitForTimeout(250);
  check(await servers('demo-d2')==='demo-s2'&&await p.evaluate(()=>document.querySelector('.pano-hero').dataset.hero==='demo-s1'&&!document.querySelector('.pf-col .pano-chip[data-chip="demo-d2"]')),'Moved off the hero server; the hero stays');
  // The steps below wait for the state they need, not for a fixed time (the Mac runner is slower); a wait that runs out says where things stand.
  // What the page looked like when Esc arrived (capture, before any handler) and once every handler had run.
  await p.evaluate(()=>{const look=e=>({detail:!$('#detail').hidden,asset:activeAsset,focus:panoFocus,target:(n=>n&&(n.tagName+'.'+n.className+(n.dataset?.pick?'#'+n.dataset.pick:'')))(e.target),prevented:e.defaultPrevented});
   addEventListener('keydown',e=>{if(e.key==='Escape')window.__esc={before:look(e)};},true);addEventListener('keydown',e=>{if(e.key==='Escape'&&window.__esc)window.__esc.after=look(e);});});
  const where=()=>p.evaluate(()=>JSON.stringify({esc:window.__esc||null,asset:activeAsset,focus:panoFocus,drag:!!panoDrag,link:!!panoLink,press:!!panoPress,detail:!$('#detail').hidden,menu:!$('#menu').hidden,modal:$('#modal').open,
   active:(n=>n&&(n.tagName+'.'+n.className+(n.dataset.pick?'#'+n.dataset.pick:'')))(document.activeElement),servers:serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).join()}));
  const settle=async(fn,what)=>{try{await until(p,fn,undefined,{timeout:5000});}catch{console.log('panorama-drag log ('+what+'):\n'+(await p.evaluate(()=>window.__log.map(x=>JSON.stringify(x)).join('\n'))));throw new Error(what+': '+await where());}};
  await p.keyboard.press('Control+z');
  await settle(()=>serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).join()==='demo-s1'&&!panoDrag&&!panoPress&&!!document.querySelector('.pf-col .pano-chip[data-chip="demo-d2"]'),'⌘Z puts it back on the hero');
  await step('keyboard twin');
  // Keyboard twin: L outlines the legal servers, arrows choose, Enter moves, ⌥Enter also, Esc cancels.
  await p.keyboard.press('Escape');
  await settle(()=>!panoFocus&&!!document.querySelector('.pano-lane .pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]'),'Esc leaves the focused state');
  await p.focus('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');await p.keyboard.press('l');
  await settle(()=>!!panoLink&&document.querySelectorAll('.drop-ok').length>0,'L starts linking');
  const kb=await p.evaluate(()=>({ok:[...document.querySelectorAll('.drop-ok')].map(n=>n.dataset.lane||(n.classList.contains('pano-loose')?'loose':'?')),on:document.querySelector('.drop-on')?.dataset.lane,live:document.querySelector('#pano-live').textContent}));
  check(kb.ok.join()==='demo-s2,demo-s3,loose'&&kb.on==='demo-s2','L outlines frankfurt, home-nas and the strip, the first one chosen: '+JSON.stringify(kb));
  await p.keyboard.press('ArrowRight');check(await p.evaluate(()=>document.querySelector('.drop-on').dataset.lane)==='demo-s3','→ chooses the next');
  await p.keyboard.press('Escape');await settle(()=>!panoLink&&!document.querySelector('.drop-ok'),'Esc cancels linking');
  check(await servers('demo-d2')==='demo-s1'&&await p.evaluate(()=>!document.querySelector('.drop-ok')&&document.activeElement.dataset.chip==='demo-d2'),'Esc cancels and returns to the chip');
  await p.keyboard.press('l');await p.keyboard.press('Enter');await settle(()=>serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).sort().join()==='demo-s2','Enter moves it');
  check(await servers('demo-d2')==='demo-s2','Enter moves it to the chosen server');
  await p.keyboard.press('Control+z');await settle(()=>serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).sort().join()==='demo-s1'&&!!document.querySelector('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]'),'⌘Z puts it back');
  await p.focus('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');await p.keyboard.press('l');await p.keyboard.press('Alt+Enter');await settle(()=>serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).sort().join()==='demo-s1,demo-s2','⌥Enter also hangs it');
  check(await servers('demo-d2')==='demo-s1,demo-s2','⌥Enter also hangs it there');
  await p.keyboard.press('Control+z');await settle(()=>serverChain(state.assets,state.assets.find(a=>a.id==='demo-d2')).servers.map(s=>s.id).sort().join()==='demo-s1','⌘Z undoes ⌥Enter');
  // Reduced motion: a cancelled drag does not glide.
  await p.emulateMedia({reducedMotion:'reduce'});
  c=await center('.pano-chip[data-chip="demo-d2"][data-lane="demo-s1"]');
  await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+50,c.y+20,{steps:4});await p.keyboard.press('Escape');
  check(await p.evaluate(()=>!document.querySelector('.pano-ghost')),'Reduced motion: the ghost is gone at once');await p.mouse.up();
  // Board: L on a card opens the link picker (the manual path outside the panorama).
  await p.emulateMedia({reducedMotion:'no-preference'});await p.mouse.up();await p.keyboard.press('Escape');await p.waitForTimeout(200);if(await p.evaluate(()=>!document.querySelector('#panorama').hidden))await p.keyboard.press('Escape');await p.waitForTimeout(200);
  await p.focus('#board [data-asset="demo-d2"] .item-open');await p.keyboard.press('l');await p.waitForTimeout(200);
  check(await p.evaluate(()=>$('#modal').open&&/关联到/.test(document.querySelector('#modal').textContent)),'L on a board card opens the link picker');
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: 4px threshold, lifted ghost + hole + slot + 55% dim, move/⌥ also/unmounted unlink, one undo step, cancel paths, from the strip, focused rail target, keyboard L twin, reduced motion';
 }finally{await context.close();}
}
