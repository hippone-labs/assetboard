async(page)=>{
 // 撞色 (an experiment, off by default): nothing changes without ?contrast; with it, in light and dark, the overview is one black
 // panel and its first figure is the only white text in it; the chosen sidebar item is not white.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,100));}};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const read=()=>{
  const values=[...document.querySelectorAll('.overview .ov-value')].map(el=>getComputedStyle(el).color);
  return {on:document.documentElement.dataset.contrast||'',panel:getComputedStyle(document.querySelector('.overview')).backgroundColor,values,
   nav:getComputedStyle(document.querySelector('#sidebar .nav-item.active')).color};
 };
 const white='rgb(255, 255, 255)';
 for(const scheme of ['light','dark']){
  const context=await page.context().browser().newContext({colorScheme:scheme});
  try{
   const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const off=await p.evaluate(read);
   check(!off.on&&off.panel!=='rgb(10, 10, 10)'&&off.panel!=='rgb(0, 0, 0)',`${scheme}: the experiment is on without ?contrast: ${JSON.stringify(off)}`);
   await p.goto('http://127.0.0.1:4317/?demo&contrast');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const on=await p.evaluate(read);
   check(on.on==='on',`${scheme}: ?contrast does not turn the experiment on`);
   check(['rgb(10, 10, 10)','rgb(0, 0, 0)'].includes(on.panel),`${scheme}: the overview is not a black panel: ${on.panel}`);
   check(on.values[0]===white&&on.values.slice(1).every(c=>c!==white),`${scheme}: white is not on the first figure alone: ${on.values}`);
   check(on.nav!==white,`${scheme}: the chosen sidebar item is white`);
   check(!errors.length,`${scheme}: page errors: ${errors.join('; ')}`);
  }finally{await context.close();}
 }
}
