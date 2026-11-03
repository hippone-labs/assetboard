// Run with the browser tool's filename option. Uses an isolated page and never saves.
// A new day redraws the board with motion: past midnight a record moves into its new band of 即将到来 with a slide, changed day counts
// fade in, and under reduced motion the same redraw happens without animation.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.clock.install({time:new Date('2026-11-03T23:58:00')});
  await p.goto('http://127.0.0.1:4317/');
  const setup=()=>p.evaluate(()=>{
   localStorage.removeItem('assetboard-view-v1');save=()=>{};
   state={blocks:[{id:'domain'}],assets:[
    {id:'eight',type:'domain',name:'eight.example.com',provider:'Registrar',date:'2026-11-11',dateKind:'expire',source:'manual'},
    {id:'today',type:'domain',name:'today.example.net',provider:'Registrar',date:'2026-11-03',dateKind:'expire',source:'manual'},
    {id:'far',type:'domain',name:'far.example.org',provider:'Registrar',date:'2026-12-20',dateKind:'expire',source:'manual'}
   ]};setView('upcoming');setLayout('list');render();
   window.__moves=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,opts){__moves.push({id:this.dataset.asset||this.dataset.group||'',from:frames[0]});return animate.call(this,frames,opts);};
  });
  const band=id=>p.evaluate(id=>document.querySelector(`#board [data-asset="${id}"]`)?.closest('.group')?.dataset.group,id);
  const when=id=>p.evaluate(id=>document.querySelector(`#board [data-asset="${id}"] .r-when`)?.textContent,id);
  await setup();
  const eightBefore=await band('eight'),textBefore=await when('far');
  check(eightBefore==='month'&&await band('today')==='week','Before midnight: 8 days is in 30 天内, today in 7 天内');
  await p.clock.fastForward('03:00');await p.clock.runFor(300);
  check(await band('eight')==='week'&&await band('today')==='overdue','After midnight both records are in their new bands');
  check(await when('far')!==textBefore,'Day counts are counted from the new day');
  const moves=await p.evaluate(()=>__moves);
  check(moves.some(m=>m.id==='eight'&&/translate/.test(m.from.transform)),'The record that changed band slides there');
  check(moves.some(m=>m.id==='far'&&m.from.opacity<1),'A row whose text changed fades in');
  check(moves.some(m=>m.id==='overdue'&&m.from.opacity===0),'A band that appears fades in');
  // Reduced motion: the same redraw, nothing animated.
  await p.emulateMedia({reducedMotion:'reduce'});
  await setup();const farBefore=await when('far');await p.clock.fastForward('24:00:00');await p.clock.runFor(300);
  check(await when('far')!==farBefore,'Reduced motion still redraws on a new day');
  check(await p.evaluate(()=>!__moves.length),'Reduced motion animates nothing');
  check(!errors.length,'No page errors: '+errors.join(' | '));
 } finally {await p.evaluate(()=>localStorage.removeItem('assetboard-view-v1')).catch(()=>{});await p.close();}
}
