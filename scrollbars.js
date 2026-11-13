// 滚动条 (material.css, the "滚动条" layer): when a bar's capsule is shown. The page draws every bar itself; a scroller gets
// .sb-on while it scrolls (and SB_HOLD ms after) and while the pointer is within SB_NEAR px of its bar, so the capsule is there to
// be dragged before it is reached. The capsule comes in over 80 ms and fades over 400 ms (--sb-a, a registered number, animated
// here because a scroll bar takes no CSS transition); under less motion it changes at once. html.sb-classic says the system
// draws its bars always (a mouse, or 「显示滚动条：始终」): read from a probe that keeps the system's bar, at load, on focus and on
// resize; the capsule is then faint at rest instead of hidden. Wheel, trackpad, keys and dragging the capsule are the browser's.
const SB_HOLD=900,SB_NEAR=28;
const sbState={near:new Set(),scrolled:new Map(),on:new Set(),runs:new WeakMap()};
function sbClassicProbe(){
 const probe=document.createElement('div');probe.className='sb-probe';probe.setAttribute('aria-hidden','true');
 probe.style.cssText='position:absolute;top:-200px;left:0;width:60px;height:60px;overflow:scroll;visibility:hidden;pointer-events:none';
 document.body.append(probe);const classic=probe.offsetWidth-probe.clientWidth>0;probe.remove();
 document.documentElement.classList.toggle('sb-classic',classic);return classic;
}
function sbSet(el){
 const want=sbState.near.has(el)||sbState.scrolled.has(el);if(want===sbState.on.has(el))return;
 want?sbState.on.add(el):sbState.on.delete(el);el.classList.toggle('sb-on',want);
 if(!el.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const rest=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sb-rest'))||0;
 const run=sbState.runs.get(el),from=run?.playState==='running'?parseFloat(getComputedStyle(el).getPropertyValue('--sb-a')):want?rest:1;run?.cancel();
 try{sbState.runs.set(el,el.animate([{'--sb-a':from},{'--sb-a':want?1:rest}],{duration:want?80:400,easing:want?'cubic-bezier(.2,0,0,1)':'cubic-bezier(.3,0,1,1)'}));}catch{}
}
// the scrollers under a point: the element and its ancestors that scroll, with a bar near the pointer
function sbScrolls(el){
 const s=getComputedStyle(el),may=el===document.documentElement?/auto|scroll|visible/:/auto|scroll/;
 return (may.test(s.overflowY)&&el.scrollHeight>el.clientHeight)||(may.test(s.overflowX)&&el.scrollWidth>el.clientWidth);
}
function sbNearAt(x,y,target){
 const near=new Set();
 for(let el=target instanceof Element?target:null;el;el=el.parentElement){
  if(el===document.body||!sbScrolls(el))continue;
  const r=el===document.documentElement?{left:0,top:0,right:innerWidth,bottom:innerHeight}:el.getBoundingClientRect();
  const v=el.scrollHeight>el.clientHeight&&x<=r.right&&x>=r.right-SB_NEAR,h=el.scrollWidth>el.clientWidth&&y<=r.bottom&&y>=r.bottom-SB_NEAR;
  if(v||h)near.add(el);
 }
 return near;
}
function sbPoint(near){const was=sbState.near;sbState.near=near;for(const el of was)if(!near.has(el))sbSet(el);for(const el of near)sbSet(el);}
function sbScrolled(el){
 if(!(el instanceof Element))return;clearTimeout(sbState.scrolled.get(el));
 sbState.scrolled.set(el,setTimeout(()=>{sbState.scrolled.delete(el);sbSet(el);},SB_HOLD));sbSet(el);
}
(()=>{
 let moved=null;
 document.addEventListener('scroll',e=>sbScrolled(e.target===document?document.documentElement:e.target),{capture:true,passive:true});
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const first=!moved;moved=e;
  if(first)requestAnimationFrame(()=>{const m=moved;moved=null;sbPoint(sbNearAt(m.clientX,m.clientY,m.target));});},{passive:true});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)sbPoint(new Set());});
 const probe=()=>{if(document.body)sbClassicProbe();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',probe);else probe();
 let wait=0;addEventListener('focus',probe);addEventListener('resize',()=>{clearTimeout(wait);wait=setTimeout(probe,300);});
})();
