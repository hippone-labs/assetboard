// Free placement's rules (board-free.js) on plain rectangles: panels never overlap and never leave the wall, a slight press moves
// nobody, touched panels give way only after the pointer rests, a fast pass moves nobody, untouched panels stay, a panel snaps near
// a column, 排整齐 puts panels on the columns, and kept places follow other heights and column counts.
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../board-free.js');

const geo=F.freeGeo(1146,3);
const step=geo.colW+geo.gap;
const ids=['a','b','c','d','e','f','g'];
const heights=new Map([['a',180],['b',240],['c',140],['d',300],['e',120],['f',200],['g',160]]);
const grid=()=>F.freeGrid(ids,heights,geo);
function sound(layout,label=''){
 const list=[...layout.values()];
 for(const r of list){
  assert.ok(r.x>=-.01&&r.x<=geo.W-geo.colW+.01,`${label} ${r.id} inside the wall across: ${r.x}`);
  assert.ok(r.y>=0,`${label} ${r.id} inside the wall down: ${r.y}`);
 }
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)assert.ok(!F.freeOverlaps(list[i],list[j],geo.gap-.01),`${label} ${list[i].id} and ${list[j].id} overlap`);
}
const same=(a,b,id)=>Math.abs(a.get(id).x-b.get(id).x)<.5&&Math.abs(a.get(id).y-b.get(id).y)<.5;
// A drag as the page feeds it: from the panel's place to (x,y) in `steps` moves, `ms` apart.
function dragTo(s,x,y,t,steps=10,ms=16){
 const x0=s.x,y0=s.y;let px=x0,py=y0;
 for(let i=1;i<=steps;i++){const nx=x0+(x-x0)*i/steps,ny=y0+(y-y0)*i/steps;t+=ms;s.move(nx,ny,t,Math.hypot(nx-px,ny-py));px=nx;py=ny;}
 return t;
}
const session=(id,layout=grid())=>F.freeSession({id,layout,rects:layout,order:ids,geo,t:0});

test('the packed wall and any resolved wall: no overlap, inside the wall',()=>{
 sound(grid(),'grid');
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let round=0;round<200;round++){
  const rects=new Map(ids.map(id=>[id,{id,x:Math.min(geo.W-geo.colW,rnd()*geo.W),y:rnd()*900,w:geo.colW,h:heights.get(id)}]));
  const first=round%2?ids[round%ids.length]:null;
  const out=F.freeResolve(rects,ids,geo,first);
  sound(out,'round '+round);
  if(first)assert.ok(same(out,rects,first),'the dragged panel keeps its place');
 }
});

test('touched panels give way only after the pointer rests for the dwell',()=>{
 const g=grid(),s=session('a',g),b=g.get('b');
 const t=dragTo(s,b.x,b.y+10,0,12,40),rest=s.armed;
 assert.ok(rest!==null&&rest<=t,'the last real move started the rest');
 assert.ok(!s.due(rest+F.FREE_FEEL.dwell-1),'not before the dwell');
 assert.ok(same(s.layout,g,'b'),'b holds its place while the pointer has not rested');
 const nudge=s.nudges(t).get('b');
 assert.ok(Math.hypot(nudge.dx,nudge.dy)>0&&Math.hypot(nudge.dx,nudge.dy)<=F.FREE_FEEL.nudge+.01,'b is only nudged, a few px: '+JSON.stringify(nudge));
 assert.ok(s.due(rest+F.FREE_FEEL.dwell),'after the dwell b gives way');
 assert.ok(!same(s.layout,g,'b'),'b moved');
 const {layout,moved}=s.drop();
 sound(layout,'after the drop');
 for(const id of ids)if(!moved.includes(id))assert.ok(same(layout,g,id),id+' was not touched and stays');
});

test('a fast pass over panels moves nobody',()=>{
 const g=grid(),s=session('e',g),b=g.get('b'),far=g.get('c');
 // across b at about 3 px/ms, never resting, then on to an empty stretch under column 3
 let t=dragTo(s,b.x,b.y,0,8,8);
 for(const at of [t+1,t+8])assert.ok(!s.due(at),'no give-way mid-pass');
 t=dragTo(s,far.x,1200,t,10,8);
 for(const id of ids)if(id!=='e')assert.ok(same(s.layout,g,id),id+' stays during the pass');
 const {layout}=s.drop();
 for(const id of ids)if(id!=='e')assert.ok(same(layout,g,id),id+' stays after the pass');
 sound(layout,'fast pass');
});

test('a fast pass that stops on a panel still gives way after a rest',()=>{
 const g=grid(),s=session('a',g),b=g.get('b');
 const t=dragTo(s,b.x,b.y+20,0,4,8);
 assert.ok(s.due(t+F.FREE_FEEL.dwell),'a pointer that stopped is at rest');
});

// Three panels in column 1 (a at the top, b lower, with room between) and c in column 3.
const roomy=()=>new Map([['a',{id:'a',x:0,y:0,w:geo.colW,h:200}],['b',{id:'b',x:0,y:400,w:geo.colW,h:200}],['c',{id:'c',x:2*step,y:0,w:geo.colW,h:140}]]);
const roomySession=(id,g)=>F.freeSession({id,layout:g,rects:g,order:['a','b','c'],geo,t:0});

test('a slight press moves nobody; the dragged panel goes to the nearest free place',()=>{
 const g=roomy(),s=roomySession('c',g);
 // c's bottom 30px into b: a fifth of c
 const t=dragTo(s,0,290,0,10,40);
 assert.ok(F.freeOverlaps(s.me(),g.get('b'),0),'c does press on b');
 assert.ok(!s.due(t+F.FREE_FEEL.dwell+50),'no give-way for a slight press');
 const {layout,moved}=s.drop();
 assert.deepEqual(moved.filter(id=>id!=='c'),[],'only the dragged panel moved');
 for(const id of ['a','b'])assert.ok(same(layout,g,id),id+' stays');
 sound(layout,'slight press');
 const c=layout.get('c');assert.ok(Math.hypot(c.x-0,c.y-290)<120,'it settled near where it was let go: '+JSON.stringify(c));
});

test('a press into the gap only moves nobody',()=>{
 const g=roomy(),s=roomySession('c',g);
 dragTo(s,0,208,0,10,40);
 assert.ok(!F.freeOverlaps(s.me(),g.get('a'),0)&&F.freeOverlaps(s.me(),g.get('a'),geo.gap),'c is in a\'s gap only');
 const {layout,moved}=s.drop();
 assert.deepEqual(moved.filter(id=>id!=='c'),[]);
 assert.ok(Math.abs(layout.get('c').y-220)<.5,'c steps out of the gap: '+layout.get('c').y);
 sound(layout,'gap press');
});

test('a hard press after a rest: the pressed panel gives way, the others stay',()=>{
 const g=roomy(),s=roomySession('c',g);
 const t=dragTo(s,0,330,0,10,40);
 assert.ok(s.due(t+F.FREE_FEEL.dwell),'b gives way');
 const {layout}=s.drop();
 assert.ok(same(layout,g,'a'),'a was not touched and stays');
 sound(layout,'hard press');
});

test('a panel that gives way goes aside or up before down, and nobody else is disturbed',()=>{
 // two panels in column 1, nothing in columns 2 and 3 at the top: the hit one moves aside, not down.
 const two=['p','q'],h=new Map([['p',200],['q',200]]),g=F.freeGrid(two,h,F.freeGeo(1146,3));
 g.set('q',{id:'q',x:0,y:400,w:geo.colW,h:200});
 const s=F.freeSession({id:'q',layout:g,rects:g,order:two,geo,t:0});
 const t=dragTo(s,0,20,0,10,40);
 assert.ok(s.due(t+F.FREE_FEEL.dwell));
 const p=s.layout.get('p');
 assert.ok(p.y<=20+.5,'p did not go down: '+JSON.stringify(p));
 sound(s.drop().layout,'aside');
});

test('near a column a panel snaps onto it; dragged further it is free',()=>{
 assert.equal(F.freeSnapX(step+30,geo),step);
 assert.equal(F.freeSnapX(step-47,geo),step);
 assert.equal(F.freeSnapX(step+100,geo),step+100);
 assert.ok(Math.abs(F.freeSnapX(2*step-20,geo)-2*step)<.05);
});

test('排整齐 puts every panel on a column, without overlap, keeping the columns they were nearest',()=>{
 const messy=new Map(ids.map((id,i)=>[id,{id,x:Math.min(geo.W-geo.colW,i*137%900),y:i*90,w:geo.colW,h:heights.get(id)}]));
 const laid=F.freeResolve(messy,ids,geo);
 const tidy=F.freeTidy([...laid.values()],geo);
 sound(tidy,'tidy');
 for(const r of tidy.values())assert.ok([0,step,2*step].some(x=>Math.abs(r.x-x)<.01),'on a column: '+r.x);
});

test('kept places: the same wall comes back as it was; other heights keep the gaps; other columns come back',()=>{
 const g=grid(),base=F.freeBaseOf(g,geo,ids);
 const again=F.freeDerive(base,ids,heights,geo);
 for(const id of ids)assert.ok(same(again,g,id),id+' comes back at its place');
 // b grows by 100: what was under b moves down by 100, the rest stays
 const taller=new Map(heights);taller.set('b',heights.get('b')+100);
 const grown=F.freeDerive(base,ids,taller,geo),bx=g.get('b').x;
 for(const id of ids){
  const under=g.get(id).x===bx&&g.get(id).y>g.get('b').y;
  assert.ok(Math.abs(grown.get(id).y-(g.get(id).y+(under?100:0)))<.5,`${id} ${under?'follows b':'stays'}`);
 }
 // a narrow wall: two columns, no overlap, inside; the wide wall again gives the same places
 const narrow=F.freeGeo(700,2),two=F.freeResolve(F.freeDerive(base,ids,heights,narrow),ids,narrow);
 for(const r of two.values())assert.ok(r.x<=narrow.W-narrow.colW+.01&&r.y>=0);
 const l2=[...two.values()];for(let i=0;i<l2.length;i++)for(let j=i+1;j<l2.length;j++)assert.ok(!F.freeOverlaps(l2[i],l2[j],narrow.gap-.01));
 const back=F.freeDerive(base,ids,heights,geo);for(const id of ids)assert.ok(same(back,g,id));
});

test('a new panel takes a free place',()=>{
 const g=grid(),spot=F.freeSpot([...g.values()],geo.colW,150,geo),r={id:'new',...spot,w:geo.colW,h:150};
 for(const q of g.values())assert.ok(!F.freeOverlaps(r,q,geo.gap-.01));
});
