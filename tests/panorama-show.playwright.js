// v13b P6: presentation mode. Masked addresses (hover/⌥ reveal), bar fades but the status tag stays, Esc layers, scale on big screens, native hook.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaPresent==='function');await p.waitForTimeout(300);
  const ips=()=>p.evaluate(()=>[...document.querySelectorAll('#panorama .ip-text')].map(n=>n.textContent));
  await p.keyboard.press('p');await p.waitForTimeout(200);
  check((await ips()).includes('203.0.113.10'),'Normal mode shows the whole address');
  await p.click('[data-action="pano-show"]');await p.waitForTimeout(200);
  const m=await ips();check(m.length&&m.every(t=>/•••/.test(t)||/••••/.test(t)),'Presentation masks every address: '+m);
  check(await p.evaluate(()=>!/203\.0\.113\.10/.test(document.querySelector('#panorama').innerText)&&![...document.querySelectorAll('#panorama [aria-label],#panorama [title]')].some(n=>/203\.0\.113\.10/.test((n.getAttribute('aria-label')||'')+(n.getAttribute('title')||'')))),'The full address is nowhere in text or labels');
  check(await p.evaluate(()=>document.querySelector('[data-action="pano-show"]').getAttribute('aria-pressed')==='true'),'The toggle reports pressed');
  // Hover reveals one address; ⌥ reveals all while held.
  await p.hover('.pano-lane[data-lane="demo-s1"] .ip-text');await p.waitForTimeout(100);
  check(await p.evaluate(()=>document.querySelector('.pano-lane[data-lane="demo-s1"] .ip-text').textContent)==='203.0.113.10','Hover shows the address');
  await p.mouse.move(2,400);await p.waitForTimeout(100);
  check(/•••/.test(await p.evaluate(()=>document.querySelector('.pano-lane[data-lane="demo-s1"] .ip-text').textContent)),'Leaving masks it again');
  await p.keyboard.down('Alt');await p.waitForTimeout(150);check((await ips()).includes('203.0.113.10'),'⌥ held shows them');
  await p.keyboard.up('Alt');await p.waitForTimeout(150);check((await ips()).every(t=>/•/.test(t)),'Releasing ⌥ masks again');
  // The bar fades after 3 s of nothing; the registered-status tag stays; any move brings it back.
  // Waited for until the fade has finished (a slow runner is still mid-transition at a fixed time), at most 8 s.
  await p.mouse.move(2,401);
  const look=()=>p.evaluate(()=>({idle:document.querySelector('#panorama').classList.contains('idle'),title:getComputedStyle(document.querySelector('.pano-title')).opacity,tag:getComputedStyle(document.querySelector('.pano-tag')).opacity}));
  await until(p,()=>document.querySelector('#panorama').classList.contains('idle')&&getComputedStyle(document.querySelector('.pano-title')).opacity==='0',undefined,{timeout:8000}).catch(()=>{});
  const idle=await look();
  check(idle.idle&&idle.title==='0'&&idle.tag==='1','Bar fades, tag stays: '+JSON.stringify(idle));
  await p.mouse.move(300,300);
  check(await until(p,()=>!document.querySelector('#panorama').classList.contains('idle')&&getComputedStyle(document.querySelector('.pano-title')).opacity==='1',undefined,{timeout:5000}).then(()=>true,()=>false),'Moving brings the bar back');
  // Focused state is masked too (hero pills, rail), copying still gives the real address.
  await p.click('[data-lane-head="demo-s1"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>[...document.querySelectorAll('.ph-ips .ip-pill')].every(n=>/•/.test(n.textContent)&&/\d+\.\d+\.\d+\.\d+|:/.test(n.dataset.ip))&&[...document.querySelectorAll('.pf-srv small')].every(n=>/•/.test(n.textContent))),'Hero and rail are masked, the copy value is the real one');
  // Esc: focus first, then presentation, then close.
  await p.keyboard.press('Escape');await p.waitForTimeout(150);check(await p.evaluate(()=>!document.querySelector('.pano-hero')&&document.querySelector('#panorama').classList.contains('show')),'First Esc leaves the focused state');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);check(await p.evaluate(()=>!document.querySelector('#panorama').classList.contains('show')&&!document.querySelector('#panorama').hidden)&&(await ips()).includes('203.0.113.10'),'Second Esc leaves presentation and unmasks');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);check(await p.evaluate(()=>document.querySelector('#panorama').hidden),'Third Esc closes');
  // Closing resets presentation (the mask never silently carries into the next visit).
  await p.keyboard.press('p');await p.waitForTimeout(150);check((await ips()).includes('203.0.113.10'),'Reopening starts unmasked');
  // Big screen: the body scales, at most 1.5×, and the lanes still fit without sideways scroll.
  await p.setViewportSize({width:1920,height:1080});await p.click('[data-action="pano-show"]');await p.waitForTimeout(300);
  const z=await p.evaluate(()=>{const b=document.querySelector('.pano-body');return {zoom:b.style.zoom,over:b.scrollWidth>b.clientWidth+1,size:getComputedStyle(document.querySelector('.pl-nm')).fontSize};});
  check(+z.zoom>1&&+z.zoom<=1.5&&!z.over,'Scaled up on a big screen: '+JSON.stringify(z));
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(await p.evaluate(()=>!document.querySelector('.pano-body').style.zoom),'Scale is gone with presentation');
  // Native full screen drives it too, and keeps it across a close and reopen while it lasts.
  await p.evaluate(()=>panoramaNative(true));await p.waitForTimeout(150);
  check((await ips()).every(t=>/•/.test(t)),'Native full screen turns presentation on');
  await p.evaluate(()=>panoramaOpen(false));await p.evaluate(()=>panoramaOpen(true));await p.waitForTimeout(150);
  check((await ips()).every(t=>/•/.test(t)),'Reopening inside native full screen stays masked');
  await p.evaluate(()=>panoramaNative(false));await p.waitForTimeout(150);check((await ips()).includes('203.0.113.10'),'Leaving full screen unmasks');
  // Reduced motion: the bar changes without a transition.
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>panoramaPresent(true));
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('.pano-title')).transitionDuration)==='0s','Reduced motion: no fade transition');
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: masked addresses everywhere (text and labels), hover/⌥ reveal, idle bar with the tag kept, focused state masked, Esc layers, reset on close, 1.5× cap, native full screen hook, reduced motion';
 }finally{await context.close();}
}
