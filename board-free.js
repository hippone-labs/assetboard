// Free placement on the tile wall, under the 冰箱贴 skin only (theme.js): a panel is a magnet that goes wherever it is dragged, and
// stays there. The quiet skin keeps the packed columns of board-wall.js.
// The rules (MARK: Rules) are plain functions of rectangles, so tests/board-free.test.js runs them without a page:
//  - panels never overlap once a drag is over, and never leave the wall (x in 0…width−column, y ≥ 0);
//  - while a panel is dragged it may cover others for a moment: a panel it touches is only nudged a few pixels; when the pointer
//    rests for FREE_FEEL.dwell ms the touched panels give way, sliding over FREE_FEEL.yield ms; a fast pass (faster than
//    FREE_FEEL.speed px/ms) moves nobody;
//  - a panel that gives way looks for the nearest free place to its sides or above first (a move down costs FREE_DOWN times as
//    much), and only the panels it was pushed onto move after it; panels nobody touched stay where they are;
//  - a slight press (less than FREE_FEEL.yieldAt % of the smaller panel covered, or only the gap) moves nobody: on release the
//    dragged panel itself goes to the nearest free place;
//  - near a column's place (FREE_FEEL.snap px) a panel snaps onto it; dragged further it is as free as anywhere.
// The values are the prototype's, the feel the person chose; there is no control for them in the app.
// Where panels are (the base) is kept on this device only (localStorage, FREE_KEY): per panel its column coordinate u (x over a
// column step), its top y and its height h when placed. A wall drawn with other heights (another density, records added or
// removed) keeps the gaps between a panel and those above it, so panels follow their column instead of jumping; another column
// count (a narrower window, the inspector) packs the same panels into the columns there are, keeping their order, and the
// placement comes back when the width does. 排整齐 puts every panel on its column's place, in the columns they are nearest;
// it, a drag and ⌥ + arrows are steps of the board's undo (⌘Z).
// Loaded after board-wall.js and before app.js; the app.js helpers used here are called only at render and event time.
const FREE_FEEL=Object.freeze({dwell:300,yield:420,nudge:8,speed:1,drop:380,snap:48,yieldAt:50});
const FREE_GAP=20,FREE_STEP=6,FREE_DOWN=2.2,FREE_BONUS=160,FREE_ANCHOR=8,FREE_STILL=60,FREE_SAFE=24;
const FREE_KEY='assetboard-wall-places-v1';

// MARK: Rules
// geo: {W wall width, cols, colW column width, gap}. A rect: {id,x,y,w,h}.
function freeGeo(width,cols,gap=FREE_GAP){const n=Math.max(1,cols|0);return {W:width,cols:n,gap,colW:Math.min(width,Math.floor((width-gap*(n-1))/n*100)/100)};}
const freeStepOf=geo=>geo.colW+geo.gap;
function freeOverlaps(a,b,g=FREE_GAP){return a.x<b.x+b.w+g&&a.x+a.w+g>b.x&&a.y<b.y+b.h+g&&a.y+a.h+g>b.y;}
function freeClampX(x,geo){return Math.min(Math.max(0,x),Math.max(0,geo.W-geo.colW));}
function freeMoveCost(dx,dy){return Math.hypot(dx,dy>0?dy*FREE_DOWN:dy);}
// The share of the smaller of two rects that the other covers (0…1).
function freeCover(a,b){const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);return Math.max(0,ox)*Math.max(0,oy)/Math.min(a.w*a.h,b.w*b.h);}
// The free place nearest to r among the placed rects: candidates are r's own place, the wall's edges and each placed rect's sides.
function freeNearest(r,placed,geo){
 const {w,h}=r,g=geo.gap,maxX=Math.max(0,geo.W-w),xs=new Set([r.x,0,maxX]),ys=new Set([r.y,0]);
 for(const q of placed){xs.add(q.x);xs.add(q.x+q.w+g);xs.add(q.x-w-g);ys.add(q.y);ys.add(q.y+q.h+g);ys.add(q.y-h-g);}
 const cands=[];
 for(const x of xs){if(x<0||x>maxX+.01)continue;for(const y of ys){if(y<0)continue;cands.push({x,y,c:freeMoveCost(x-r.x,y-r.y)});}}
 cands.sort((a,b)=>a.c-b.c);
 for(const c of cands){const t={x:c.x,y:c.y,w,h};if(!placed.some(q=>freeOverlaps(t,q,g)))return {...r,x:c.x,y:c.y,c:c.c};}
 const y=Math.max(0,...placed.map(q=>q.y+q.h+g));return {...r,y,c:freeMoveCost(0,y-r.y)};
}
// Where every panel goes. First pass, in priority order (the dragged panel first): a panel whose place touches nobody placed
// keeps it. Then the ones that collided, top to bottom, each take the nearest free place; when that is far, the last resort is
// right under the panel that hit it, and the panels that were there move on in their turn (only that stretch of the column).
function freeResolve(rects,order,geo,first=null){
 const g=geo.gap,ids=[...new Set([...(first?[first]:[]),...order.filter(id=>rects.has(id)),...rects.keys()])];
 let placed=[];const out=new Map(),queue=[];
 for(const id of ids){const r={...rects.get(id)};if(id===first||!placed.some(q=>freeOverlaps(r,q,g))){placed.push(r);out.set(id,r);}else queue.push(r);}
 const rank=new Map(ids.map((id,i)=>[id,i])),fixed=new Set(first?[first]:[]);
 for(let guard=0;queue.length&&guard<400;guard++){
  queue.sort((a,b)=>a.y-b.y||rank.get(a.id)-rank.get(b.id));
  const r=queue.shift(),free=freeNearest(r,placed,geo);
  const hitters=placed.filter(q=>freeOverlaps(r,q,g)&&q.y+q.h/2<=r.y+r.h/2);
  let pushY=hitters.length?Math.max(...hitters.map(q=>q.y+q.h+g)):null;
  if(pushY!==null&&placed.some(q=>fixed.has(q.id)&&freeOverlaps({...r,y:pushY},q,g)))pushY=null;
  if(pushY===null||free.c<=freeMoveCost(0,pushY-r.y)+FREE_BONUS){placed.push(free);out.set(r.id,free);continue;}
  const t={...r,y:pushY},victims=placed.filter(q=>!fixed.has(q.id)&&freeOverlaps(t,q,g));
  if(victims.some(v=>v.y+v.h/2<t.y+t.h/2)){placed.push(free);out.set(r.id,free);continue;}
  placed=placed.filter(q=>!victims.includes(q));for(const v of victims){out.delete(v.id);queue.push({...v});}
  placed.push(t);out.set(r.id,t);
 }
 for(const r of queue){const f=freeNearest(r,placed,geo);placed.push(f);out.set(r.id,f);}
 for(const r of out.values())delete r.c;
 return out;
}
// The packed wall: each panel to the top of the shortest column.
function freeGrid(ids,heights,geo){
 const cols=Array(geo.cols).fill(0),out=new Map(),step=freeStepOf(geo);
 for(const id of ids){let c=0;for(let k=1;k<geo.cols;k++)if(cols[k]<cols[c]-1)c=k;const h=heights.get(id)||100;out.set(id,{id,x:c*step,y:cols[c],w:geo.colW,h});cols[c]+=h+geo.gap+FREE_STEP;}
 return out;
}
// 排整齐: every panel to its column's place, keeping the column it is nearest and its order in it; a column far taller than the
// shortest gives its next panel to that one.
function freeTidy(list,geo){
 const items=[...list].sort((a,b)=>a.y-b.y||a.x-b.x),n=geo.cols,step=freeStepOf(geo),cols=Array(n).fill(0),out=new Map();
 const avg=items.reduce((s,r)=>s+r.h,0)/Math.max(1,items.length);
 for(const r of items){let c=Math.min(n-1,Math.max(0,Math.round(r.x/step)));let m=0;for(let k=1;k<n;k++)if(cols[k]<cols[m])m=k;if(cols[c]-cols[m]>avg*.9)c=m;
  out.set(r.id,{id:r.id,x:c*step,y:cols[c],w:geo.colW,h:r.h});cols[c]+=r.h+geo.gap+FREE_STEP;}
 return out;
}
// A new panel's place: the free one nearest the top left.
function freeSpot(list,w,h,geo){
 const g=geo.gap,xs=new Set([0,Math.max(0,geo.W-w)]),ys=new Set([0]);let best=null;
 for(const r of list){xs.add(r.x);xs.add(r.x+r.w+g);ys.add(r.y);ys.add(r.y+r.h+g);}
 for(const x of xs){if(x<0||x>geo.W-w+.5)continue;for(const y of ys){const c={x,y,w,h};if(list.some(q=>freeOverlaps(c,q,g)))continue;const d=Math.hypot(x,y*1.15);if(!best||d<best.d)best={x,y,d};}}
 return best?{x:best.x,y:best.y}:{x:0,y:Math.max(0,...list.map(r=>r.y+r.h+g))};
}
// A slight press: the dragged rect touches others (or only their gap) but covers less than feel.yieldAt % of any; its own nearest
// free place, when that is close. Null when it touches nobody, presses hard, or the free place is far.
function freeSettle(me,others,geo,feel=FREE_FEEL){
 const hits=others.filter(q=>freeOverlaps(me,q,geo.gap));if(!hits.length)return null;
 if(Math.max(...hits.map(q=>freeCover(me,q)))*100>=feel.yieldAt)return null;
 const f=freeNearest(me,others,geo);if(Math.hypot(f.x-me.x,f.y-me.y)>Math.max(me.h,geo.colW)*.6)return null;
 return {x:f.x,y:f.y};
}
// Near a column's place the panel snaps onto it.
function freeSnapX(x,geo,feel=FREE_FEEL){
 if(!feel.snap)return x;const step=freeStepOf(geo);let best=null;
 for(let c=0;c<geo.cols;c++){const cx=freeClampX(c*step,geo);if(best===null||Math.abs(x-cx)<Math.abs(x-best))best=cx;}
 return best!==null&&Math.abs(x-best)<=feel.snap?best:x;
}
// The small push a touched panel gets while the dragged one moves slowly over it: away from the dragged one's centre, up to
// feel.nudge px, more for more cover.
function freeNudges(me,others,feel=FREE_FEEL,slow=true){
 const out=new Map(),mx=me.x+me.w/2,my=me.y+me.h/2;
 for(const r of others){
  if(!slow||!feel.nudge||!freeOverlaps(me,r,0)){out.set(r.id,{dx:0,dy:0});continue;}
  const amt=feel.nudge*Math.min(1,freeCover(me,r)*4),vx=r.x+r.w/2-mx,vy=r.y+r.h/2-my,l=Math.hypot(vx,vy)||1;
  out.set(r.id,{dx:vx/l*amt,dy:vy/l*amt});
 }
 return out;
}
// The kept places on a wall of these heights and columns, as rects. The panels the base has nothing for are left out.
function freeDerive(base,ids,heights,geo){
 const items=base?.items||{},step=freeStepOf(geo),w=geo.colW,out=new Map();
 const src=ids.filter(id=>items[id]&&Number.isFinite(items[id].u)&&Number.isFinite(items[id].y)).map(id=>{const b=items[id],h=heights.get(id)||100;return {id,u:b.u,x:freeClampX(Math.round(b.u*step*100)/100,geo),y:Math.max(0,b.y),hs:b.h>0?b.h:h,h,w};});
 if(!src.length)return out;
 // Another column count: the same panels packed into the columns there are, each in the one nearest its place, in their order.
 if(base.cols&&base.cols!==geo.cols){
  const scale=(geo.cols-1)/Math.max(1,base.cols-1),list=src.map(r=>({...r,x:Math.round(Math.min(Math.max(0,r.u),base.cols-1)*scale)*step}));
  return freeTidy(list,geo);
 }
 src.sort((a,b)=>a.y-b.y||a.x-b.x);
 const done=[];
 for(const r of src){
  const above=done.filter(q=>q.x<r.x+w&&q.x+w>r.x&&q.y+q.hs<=r.y+1);
  r.ny=Math.max(0,above.length?Math.max(...above.map(q=>q.ny+q.h+(r.y-(q.y+q.hs)))):r.y);
  done.push(r);out.set(r.id,{id:r.id,x:r.x,y:r.ny,w,h:r.h});
 }
 return out;
}
// The base that keeps a layout: every panel at its rect, on this wall's columns and heights.
function freeBaseOf(layout,geo,order){const step=freeStepOf(geo),items={};for(const [id,r] of layout)items[id]={u:Math.round(r.x/step*1e4)/1e4,y:Math.round(r.y*100)/100,h:r.h};return {cols:geo.cols,items,order:[...order]};}

// A drag, as a clock-driven session (the page feeds it pointer positions and the time; the tests feed it numbers).
//  move(x,y,t,dist)  the panel's wanted top-left in wall coordinates and how far the pointer went since the last move; gives the
//                    panel's place (clamped, snapped) and the nudges
//  due(t)            the rest is checked: true when the touched panels gave way (layout has changed)
//  drop()            the end: the layout and the ids that moved
function freeSession({id,layout,rects,order,geo,feel=FREE_FEEL,t=0}){
 const copy=m=>new Map([...m].map(([k,v])=>[k,{...v}])),me0=layout.get(id);
 const s={id,geo,feel,rects:copy(rects),order:[id,...order.filter(x=>x!==id)],pre:copy(layout),layout:copy(layout),x:me0.x,y:me0.y,w:me0.w,h:me0.h,ax:me0.x,ay:me0.y,armed:null,speed:0,lastT:t,yields:0};
 s.me=()=>({id,x:s.x,y:s.y,w:s.w,h:s.h});
 s.others=()=>[...s.layout.values()].filter(q=>q.id!==id);
 // A pointer that has not moved for FREE_STILL ms is at rest, however fast it came.
 s.speedAt=at=>at-s.lastT>FREE_STILL?0:s.speed;
 s.nudges=at=>freeNudges(s.me(),s.others(),feel,s.speedAt(at)<=feel.speed);
 s.move=(x,y,at,dist)=>{
  const dt=Math.max(1,at-s.lastT);s.speed=s.speed*.6+(dist/dt)*.4;s.lastT=at;
  s.x=freeSnapX(freeClampX(x,geo),geo,feel);s.y=Math.max(0,y);s.rects.set(id,s.me());
  if(Math.hypot(s.x-s.ax,s.y-s.ay)>FREE_ANCHOR){s.ax=s.x;s.ay=s.y;s.armed=at;}
  return {x:s.x,y:s.y,nudges:s.nudges(at)};
 };
 s.due=at=>{
  if(s.armed===null||at-s.armed<feel.dwell)return false;
  if(s.speedAt(at)>feel.speed){s.armed=at;return false;}
  s.armed=null;s.ax=s.x;s.ay=s.y;
  if(freeSettle(s.me(),s.others(),geo,feel))return false;
  const next=freeResolve(s.rects,s.order,geo,id),changed=[...next].some(([k,r])=>k!==id&&(Math.abs(r.x-s.layout.get(k).x)>.5||Math.abs(r.y-s.layout.get(k).y)>.5));
  s.layout=next;if(changed)s.yields++;return changed;
 };
 s.drop=()=>{
  const spot=freeSettle(s.me(),s.others(),geo,feel);if(spot){s.x=spot.x;s.y=spot.y;}
  s.rects.set(id,s.me());s.layout=freeResolve(s.rects,s.order,geo,id);
  const moved=[...s.layout].filter(([k,r])=>{const q=s.pre.get(k);return k===id||!q||Math.abs(q.x-r.x)>.5||Math.abs(q.y-r.y)>.5;}).map(([k])=>k);
  return {layout:s.layout,moved};
 };
 return s;
}

if(typeof module!=='undefined')module.exports={FREE_FEEL,FREE_GAP,freeGeo,freeOverlaps,freeCover,freeNearest,freeResolve,freeGrid,freeTidy,freeSpot,freeSettle,freeSnapX,freeNudges,freeDerive,freeBaseOf,freeSession};

// MARK: The wall
// The base, read once; a demo keeps it in memory only.
let freeBase=(()=>{try{const v=JSON.parse(localStorage.getItem(FREE_KEY)||'null');return v&&typeof v==='object'&&v.items&&typeof v.items==='object'?{cols:v.cols|0,items:v.items,order:Array.isArray(v.order)?v.order.filter(x=>typeof x==='string'):[]}:null;}catch{return null;}})();
let freeView=null,freeDrag=null,freeStillTimer=0;
function freeDemo(){return typeof demoMode!=='undefined'&&demoMode;}
function writeFreeBase(){if(freeDemo())return;try{if(freeBase)localStorage.setItem(FREE_KEY,JSON.stringify(freeBase));else localStorage.removeItem(FREE_KEY);}catch{}}
function freeOn(){return typeof boardSkin!=='undefined'&&boardSkin==='magnet';}
function freeShown(){return freeOn()&&!!document.querySelector('#board .wall.free');}
// Lays the panels out from the base (or packed, before anything was moved), without touching a panel being dragged. Called by
// packWall for every drawing and resize.
function freePack(wall,items,width){
 if(freeDrag?.started&&freeView?.wall===wall){freeDrag.dirty=true;return;}
 const cols=wallColumns(width,FREE_GAP),geo=freeGeo(width,cols);
 if(freeView&&freeView.wall===wall&&Math.abs(freeView.geo.W-width)>.5){wall.classList.add('free-still');clearTimeout(freeStillTimer);freeStillTimer=setTimeout(()=>wall.classList.remove('free-still'),160);}
 wall.dataset.cols=cols;
 for(const n of items)n.style.width=geo.colW+'px';
 const ids=items.map(n=>n.dataset.group),heights=new Map(items.map(n=>[n.dataset.group,n.offsetHeight]));
 let rects;
 if(freeBase){
  rects=freeDerive(freeBase,ids,heights,geo);
  // A panel the base has nothing for (a category that just got its first record) takes the free place nearest the top left,
  // kept at once.
  const missing=ids.filter(id=>!rects.has(id));
  if(missing.length){
   let laid=freeResolve(rects,freeBase.order,geo);
   for(const id of missing){const h=heights.get(id),s=freeSpot([...laid.values()],geo.colW,h,geo);rects.set(id,{id,x:s.x,y:s.y,w:geo.colW,h});laid=freeResolve(rects,freeBase.order,geo);}
   if(freeBase.cols===geo.cols){const step=freeStepOf(geo);for(const id of missing){const r=rects.get(id);freeBase.items[id]={u:Math.round(r.x/step*1e4)/1e4,y:r.y,h:r.h};}freeBase.order=[...freeBase.order,...missing.filter(id=>!freeBase.order.includes(id))];writeFreeBase();}
  }
 }else rects=freeGrid(ids,heights,geo);
 // Top to bottom: a panel that grew pushes the ones under it, not the ones above.
 const order=[...rects.values()].sort((a,b)=>a.y-b.y||a.x-b.x).map(r=>r.id);
 const layout=freeResolve(rects,order,geo);
 freeView={wall,geo,heights,rects,layout,order:freeBase?.order?.length?[...freeBase.order.filter(id=>rects.has(id)),...ids.filter(id=>!freeBase.order.includes(id))]:ids};
 freePlace(layout);
}
function freePlace(layout,skip=null){
 const {wall}=freeView;let bottom=0;
 for(const n of wall.children){const r=layout.get(n.dataset.group);if(!r)continue;bottom=Math.max(bottom,r.y+r.h);if(n.dataset.group===skip)continue;n.style.left=r.x+'px';n.style.top=r.y+'px';}
 if(freeDrag?.started)bottom=Math.max(bottom,freeDrag.s.y+freeDrag.s.h,parseFloat(wall.style.height)||0);
 wall.style.height=Math.ceil(bottom+FREE_SAFE)+'px';
}
// A step of the board's undo: the base before the change (app.js undo() and redo() take entries that start with 'wall:').
function freeCheckpoint(){if(typeof checkpointEntry==='function')checkpointEntry('wall:'+JSON.stringify(freeBase));}
function freeEntry(){return 'wall:'+JSON.stringify(freeBase);}
function freeRestore(entry){try{const v=JSON.parse(entry.slice(5));freeBase=v&&v.items?v:null;}catch{freeBase=null;}writeFreeBase();skipLayoutAnimation=false;render();}
// Keeps a layout as the base: the panels in `moved` at their place in it, every other at its kept place for these heights.
function freeCommit(layout,moved,first){
 const v=freeView,step=freeStepOf(v.geo),items={...(freeBase?.items||{})};
 const same=freeBase&&freeBase.cols===v.geo.cols;
 for(const [id,r] of layout){const keep=same&&!moved.includes(id)?v.rects.get(id):null;items[id]={u:keep&&freeBase.items[id]?freeBase.items[id].u:Math.round(r.x/step*1e4)/1e4,y:Math.round((keep||r).y*100)/100,h:r.h};}
 freeBase={cols:v.geo.cols,items,order:[...(first?[first]:[]),...v.order.filter(id=>id!==first)]};writeFreeBase();
}
function freeTidyWall(){
 const v=freeView;if(!v||!freeShown())return false;
 freeCheckpoint();
 const t=freeTidy([...v.layout.values()],v.geo);
 freeBase=freeBaseOf(t,v.geo,[...t.keys()]);writeFreeBase();render();
 toast(tr('已排整齐'),true);return true;
}
// ⌥ + arrows on a panel's title: a column to either side, or a little up or down; the panels in the way give way at once.
function freeKeyMove(id,key){
 const v=freeView,r=v?.layout.get(id);if(!r)return false;
 const step=freeStepOf(v.geo),x=key==='ArrowLeft'?r.x-step:key==='ArrowRight'?r.x+step:r.x,y=key==='ArrowUp'?r.y-40:key==='ArrowDown'?r.y+40:r.y;
 const nx=freeSnapX(freeClampX(x,v.geo),v.geo),ny=Math.max(0,y);if(Math.abs(nx-r.x)<.5&&Math.abs(ny-r.y)<.5){toast(tr('已经到边了'));return false;}
 const rects=new Map([...v.rects].map(([k,q])=>[k,{...q}]));rects.set(id,{...r,x:nx,y:ny});
 const next=freeResolve(rects,[id,...v.order],v.geo,id),moved=[...next].filter(([k,q])=>{const p=v.layout.get(k);return k===id||Math.abs(p.x-q.x)>.5||Math.abs(p.y-q.y)>.5;}).map(([k])=>k);
 freeCheckpoint();freeCommit(next,moved,id);render();toast(tr('面板已移动'),true);return true;
}

// MARK: Dragging
// Anywhere on a panel but its lines (which keep their own drag) and its buttons; a mouse starts after 4px, a touch after a long
// press. Esc puts everything back.
function freeEl(id){return freeView?.wall.querySelector(`:scope > .group[data-group="${CSS.escape(id)}"]`);}
function freeWallPoint(x,y){const r=freeView.wall.getBoundingClientRect();return {x:x-r.left,y:y-r.top};}
if(typeof document!=='undefined')document.addEventListener('pointerdown',e=>{
 if(freeDrag||!e.isPrimary||e.button!==0||!freeShown())return;
 const el=e.target.closest?.('#board .wall.free > .group');
 if(!el||e.target.closest('[data-asset],.g-actions,.r-actions,input,select,textarea,a'))return;
 const id=el.dataset.group,r=freeView?.layout.get(id);if(!r)return;
 const p=freeWallPoint(e.clientX,e.clientY);
 const d=freeDrag={id,el,pointer:e.pointerId,touch:e.pointerType==='touch',ox:p.x-r.x,oy:p.y-r.y,x0:e.clientX,y0:e.clientY,px:e.clientX,py:e.clientY,last:null,started:false,timer:0,dwell:0,frame:0};
 if(d.touch)d.timer=setTimeout(()=>{if(freeDrag===d)freeBegin(d);},300);
 addEventListener('pointermove',freeMove);addEventListener('pointerup',freeEnd);addEventListener('pointercancel',freeEnd);
});
function freeBegin(d){
 const v=freeView;if(!v||!d.el.isConnected){freeRelease();return;}
 clearTimeout(d.timer);d.started=true;d.before=freeEntry();
 if(typeof hidePeek==='function')hidePeek();if(typeof closeMenu==='function')closeMenu(false);
 d.s=freeSession({id:d.id,layout:v.layout,rects:v.rects,order:v.order,geo:v.geo,t:performance.now()});
 for(const n of v.wall.children)n.classList.remove('free-top','free-drop');
 v.wall.classList.add('free-dragging');d.el.classList.add('free-drag');document.body.classList.add('drag-active');
 getSelection()?.removeAllRanges();
}
function freeMove(e){
 const d=freeDrag;if(!d||e.pointerId!==d.pointer)return;
 const dist=Math.hypot(e.clientX-d.px,e.clientY-d.py);d.px=e.clientX;d.py=e.clientY;d.dist=(d.dist||0)+dist;
 if(!d.started){const moved=Math.hypot(e.clientX-d.x0,e.clientY-d.y0);if(d.touch){if(moved>8)freeRelease();}else if(moved>4)freeBegin(d);if(!d.started)return;}
 if(!d.el.isConnected){freeCancel();return;}
 if(!d.frame)d.frame=requestAnimationFrame(()=>freeTick(d));
}
function freeTick(d){
 d.frame=0;if(freeDrag!==d||!d.started)return;
 const board=boardScroller(),br=board.getBoundingClientRect(),top=board===document.scrollingElement?0:br.top,bottom=board===document.scrollingElement?innerHeight:br.bottom;
 const sc=d.py>bottom-48?Math.min(18,(d.py-(bottom-48))/3):d.py<top+36?-Math.min(18,(top+36-d.py)/3):0;
 if(sc)board.scrollTop+=sc;
 const p=freeWallPoint(d.px,d.py),dist=d.dist||0;d.dist=0;
 const at=performance.now(),armed=d.s.armed,{x,y,nudges}=d.s.move(p.x-d.ox,p.y-d.oy,at,dist);
 d.el.style.left=x+'px';d.el.style.top=y+'px';
 const wall=freeView.wall,need=y+d.s.h+FREE_SAFE;if(need>(parseFloat(wall.style.height)||0))wall.style.height=Math.ceil(need)+'px';
 freeNudge(nudges);
 // A pointer that stops is at rest FREE_STILL ms later, however fast it came: the nudges are drawn again then, as no move will.
 clearTimeout(d.still);d.still=setTimeout(()=>{if(freeDrag===d)freeNudge(d.s.nudges(performance.now()));},FREE_STILL+1);
 if(d.s.armed!==armed)freeArm(d);
 if(sc)d.frame=requestAnimationFrame(()=>freeTick(d));
}
function freeNudge(nudges){for(const [id,{dx,dy}] of nudges){const el=freeEl(id);if(el)el.style.translate=dx||dy?`${dx.toFixed(1)}px ${dy.toFixed(1)}px`:'';}}
function freeArm(d){clearTimeout(d.dwell);if(d.s.armed===null)return;d.dwell=setTimeout(()=>{if(freeDrag!==d)return;const at=Math.max(performance.now(),d.s.armed+d.s.feel.dwell);freeNudge(d.s.nudges(at));if(d.s.due(at)){freeNudge(new Map([...d.s.layout.keys()].map(k=>[k,{dx:0,dy:0}])));freePlace(d.s.layout,d.id);}else freeArm(d);},Math.max(0,d.s.armed+d.s.feel.dwell-performance.now()));}
function freeRelease(){const d=freeDrag;if(!d)return;clearTimeout(d.timer);clearTimeout(d.dwell);clearTimeout(d.still);cancelAnimationFrame(d.frame);removeEventListener('pointermove',freeMove);removeEventListener('pointerup',freeEnd);removeEventListener('pointercancel',freeEnd);freeDrag=null;}
function freeCleanup(d){
 const wall=freeView?.wall;document.body.classList.remove('drag-active');
 if(wall){wall.classList.remove('free-dragging');for(const n of wall.children)n.style.translate='';}
 d.el.classList.remove('free-drag');
}
function freeEnd(e){
 const d=freeDrag;if(!d||e.pointerId!==d.pointer)return;
 if(!d.started){freeRelease();return;}
 if(e.type==='pointercancel'){freeCancel();return;}
 suppressClick=true;setTimeout(()=>suppressClick=false,0);
 d.px=e.clientX;d.py=e.clientY;freeTick(d);
 const {layout,moved}=d.s.drop();freeRelease();freeCleanup(d);
 const changed=moved.some(id=>id!==d.id)||Math.abs(d.s.pre.get(d.id).x-layout.get(d.id).x)>.5||Math.abs(d.s.pre.get(d.id).y-layout.get(d.id).y)>.5;
 if(changed){if(typeof checkpointEntry==='function')checkpointEntry(d.before);freeCommit(layout,moved,d.id);}
 // The landing: the panel slides to its place and settles like a magnet meeting the door; the panels in its way give way.
 d.el.classList.add('free-top');
 if(!reduceMotion()){d.el.classList.add('free-drop');setTimeout(()=>d.el.classList.remove('free-drop'),FREE_FEEL.drop+40);}
 if(d.dirty||!changed){freePack(freeView.wall,[...freeView.wall.children].filter(n=>n.dataset.group),freeView.wall.clientWidth);}
 else{freeView.layout=layout;freeView.rects=freeDerive(freeBase,[...layout.keys()],freeView.heights,freeView.geo);freeView.order=[...freeBase.order];freePlace(layout);}
}
function freeCancel(){
 const d=freeDrag;if(!d)return;freeRelease();
 if(d.started){freeCleanup(d);freePlace(d.s.pre);}
}
if(typeof document!=='undefined')addEventListener('keydown',e=>{if(e.key!=='Escape'||!freeDrag?.started)return;e.preventDefault();e.stopImmediatePropagation();suppressClick=true;addEventListener('pointerup',()=>setTimeout(()=>suppressClick=false,0),{once:true,capture:true});freeCancel();},true);
if(typeof document!=='undefined')addEventListener('resize',()=>{if(freeDrag?.started)freeCancel();});
