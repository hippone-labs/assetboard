async(page)=>{
 // 撞色 (an experiment, off by default): nothing changes without ?contrast; with it, in light and dark, the theme stays as it
 // is, the overview is one field in the accent's hue (deep, not black), and its first figure is the only pure white on screen
 // (service favicons keep their white backing plate).
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,100));}};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const read=()=>{
  const white='rgb(255, 255, 255)',root=document.documentElement;
  const whites=[...document.querySelectorAll('body *:not(.site-mark)')].filter(el=>{
   const box=el.getBoundingClientRect();if(!box.width||!box.height||box.bottom<0||box.top>innerHeight)return false;
   const s=getComputedStyle(el),text=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
   return s.visibility!=='hidden'&&(text&&s.color===white||s.backgroundColor===white);
  }).map(el=>el.className);
  // The panel as sRGB: a color-mix() background reads back as oklab(), so paint it on a pixel.
  const g=document.createElement('canvas').getContext('2d');g.fillStyle=getComputedStyle(document.querySelector('.overview')).backgroundColor;g.fillRect(0,0,1,1);
  const [r,gr,b,a]=g.getImageData(0,0,1,1).data;
  return {on:root.dataset.contrast||'',panel:a?[r,gr,b]:null,whites,
   first:document.querySelector('.overview .ov-value').className,canvas:root.style.getPropertyValue('--tone-canvas'),ink:root.style.getPropertyValue('--tone-ink')};
 };
 for(const scheme of ['light','dark']){
  const context=await page.context().browser().newContext({colorScheme:scheme,viewport:{width:1400,height:900}});
  try{
   const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const off=await p.evaluate(read);
   check(!off.on&&!off.panel,`${scheme}: the experiment is on without ?contrast: ${JSON.stringify(off)}`);
   await p.goto('http://127.0.0.1:4317/?demo&contrast');await until(p,()=>!!document.querySelector('.overview .ov-value'));
   const on=await p.evaluate(read);
   check(on.on==='on',`${scheme}: ?contrast does not turn the experiment on`);
   const [r,,b]=on.panel||[];
   check(b>r+20&&b<140,`${scheme}: the overview is not a deep field in the ink accent's hue: ${on.panel}`);
   check(on.whites.length===1&&on.whites[0]===on.first,`${scheme}: white is not on the first figure alone: ${JSON.stringify(on.whites)}`);
   check(on.canvas===off.canvas&&on.ink===off.ink,`${scheme}: the experiment changed the theme: ${JSON.stringify([off.canvas,on.canvas,off.ink,on.ink])}`);
   check(!errors.length,`${scheme}: page errors: ${errors.join('; ')}`);
  }finally{await context.close();}
 }
}
