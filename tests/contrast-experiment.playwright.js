async(page)=>{
 // 撞色 (an experiment, off by default): nothing changes without ?contrast; with it, in light and dark, the overview is one pure
 // black panel and its first figure is the only pure white on screen (service favicons keep their white backing plate); in dark
 // the window is pure black and the text one step below white.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,100));}};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const read=()=>{
  const white='rgb(255, 255, 255)',root=document.documentElement;
  const whites=[...document.querySelectorAll('body *:not(.site-mark)')].filter(el=>{
   const box=el.getBoundingClientRect();if(!box.width||!box.height||box.bottom<0||box.top>innerHeight)return false;
   const s=getComputedStyle(el),text=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
   return s.visibility!=='hidden'&&(text&&s.color===white||s.backgroundColor===white);
  }).map(el=>el.className);
  return {on:root.dataset.contrast||'',panel:getComputedStyle(document.querySelector('.overview')).backgroundColor,whites,
   first:document.querySelector('.overview .ov-value').className,canvas:root.style.getPropertyValue('--tone-canvas'),ink:root.style.getPropertyValue('--tone-ink')};
 };
 for(const scheme of ['light','dark']){
  const context=await page.context().browser().newContext({colorScheme:scheme,viewport:{width:1400,height:900}});
  try{
   const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const off=await p.evaluate(read);
   check(!off.on&&off.panel!=='rgb(0, 0, 0)'&&off.canvas!=='0,0,0',`${scheme}: the experiment is on without ?contrast: ${JSON.stringify(off)}`);
   await p.goto('http://127.0.0.1:4317/?demo&contrast');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const on=await p.evaluate(read);
   check(on.on==='on',`${scheme}: ?contrast does not turn the experiment on`);
   check(on.panel==='rgb(0, 0, 0)',`${scheme}: the overview is not a pure black panel: ${on.panel}`);
   check(on.whites.length===1&&on.whites[0]===on.first,`${scheme}: white is not on the first figure alone: ${JSON.stringify(on.whites)}`);
   if(scheme==='dark')check(on.canvas==='0,0,0'&&on.ink==='200,200,200',`dark: the window is not black with dimmed text: ${on.canvas} / ${on.ink}`);
   else check(on.canvas===off.canvas&&on.ink===off.ink,`light: the experiment changed the theme: ${JSON.stringify([off.canvas,on.canvas])}`);
   check(!errors.length,`${scheme}: page errors: ${errors.join('; ')}`);
  }finally{await context.close();}
 }
}
