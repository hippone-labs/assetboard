// Run with the browser tool's filename option. Uses its own contexts; saves only to their localStorage.
// The board's room for the detail (app.js, boardRoom; material.css, body.detail-room): when the detail card comes in or goes back,
// the panels on the left wait until the card's act is over (the card itself, under 冰箱贴 also the figure), then slide to their new
// places over 0.3–0.4 s, eased in and out, instead of jumping there. Quick toggles end in the last state with nothing left running;
// less motion makes the room at once; under 冰箱贴 the panels' free places are kept.
// What is drawn is sampled once a frame. A machine that draws slowly (GitHub's hosted Macs draw in software, frames 50–150 ms apart
// under load) sees fewer places on the way and a slide that seems to start later and end sooner than it does, by up to one frame:
// the limits below that are read off the frames are widened by the longest frame past 40 ms. At 60 frames a second nothing changes,
// and the slide's own timing (0.3–0.4 s, eased in and out) is checked exactly.
async (page) => {
 const browser=page.context().browser();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const contexts=[];let p;
 const open=async({skin='quiet',scene='',motion='no-preference'}={})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:motion});contexts.push(context);
  await context.addInitScript(([skin,scene])=>{localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1',skin);if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);},[skin,scene]);
  p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/?demo');await p.waitForTimeout(500);
  await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});await p.waitForTimeout(800);
  return errors;
 };
 // every panel's place on the wall (its layout box, without the slide's translate) and where it is drawn, frame by frame
 const places=()=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#board .wall>.group')].map(n=>[n.dataset.group,{x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth}])));
 const watch=(act)=>p.evaluate(async act=>{
  const wall=document.querySelector('#board .wall'),panels=[...wall.children].filter(n=>n.dataset.group),t0=performance.now(),frames=[];let durations=[];
  if(act==='open')document.querySelector('#board [data-asset] .item-open').click();else closeDetail();
  await new Promise(done=>{const f=()=>{const w=wall.getBoundingClientRect();
   const anims=panels.flatMap(n=>n.getAnimations());if(anims.length&&!durations.length)durations=anims.map(a=>({d:a.effect.getTiming().duration,e:a.effect.getTiming().easing}));
   frames.push({t:performance.now()-t0,card:!!document.querySelector('.detail-leave')||$('#detail').getAnimations().length>0,at:Object.fromEntries(panels.map(n=>{const t=getComputedStyle(n).translate.split(' ').map(parseFloat);return [n.dataset.group,{x:n.offsetLeft+(t[0]||0),y:n.offsetTop+(t[1]||0)}];}))});
   if(performance.now()-t0<1100)requestAnimationFrame(f);else done();};f();});
  return {frames,durations};
 },act);
 // a panel that moves far is drawn at several places between where it was and where it goes, in order: a slide, not a jump
 const slid=(label,frames,from,to,durations)=>{
  const moved=Object.keys(to).filter(id=>Math.hypot(to[id].x-from[id].x,to[id].y-from[id].y)>100);
  check(moved.length,`${label}: some panel changes place ${JSON.stringify({from,to})}`);
  // the longest time between two frames, and how much of it is past 40 ms (none at 60 frames a second)
  const frame=Math.max(...frames.slice(1).map((fr,i)=>fr.t-frames[i].t)),slack=Math.max(0,frame-40);
  // the ease is between 5 % and 95 % of the way for about 205 ms of its 340, so frames at most `frame` apart draw it there at least
  // 205/frame times: four up to 50 ms apart; a jump is drawn there at no place
  const places=Math.max(1,Math.min(4,Math.floor(200/frame)));
  for(const id of moved){
   const d=Math.hypot(to[id].x-from[id].x,to[id].y-from[id].y),done=fr=>Math.hypot(fr.at[id].x-from[id].x,fr.at[id].y-from[id].y)/d;
   const between=frames.filter(fr=>done(fr)>.05&&done(fr)<.95);
   check(between.length>=places,`${label}: ${id} is drawn at ${between.length} places on its way, ${places} or more at frames up to ${Math.round(frame)} ms apart (a slide, not a jump) ${JSON.stringify(frames.map(fr=>[Math.round(fr.t),Math.round(fr.at[id].x),Math.round(fr.at[id].y)]))}`);
   let last=-1;for(const fr of frames){const v=done(fr);check(v>=last-.02,`${label}: ${id} goes one way`);last=Math.max(last,v);}
   const end=frames[frames.length-1].at[id];
   check(Math.abs(end.x-to[id].x)<1&&Math.abs(end.y-to[id].y)<1,`${label}: ${id} ends in its place ${JSON.stringify(end)} ${JSON.stringify(to[id])}`);
   // the card first: while it moves, no panel does
   const during=frames.filter(fr=>fr.card);
   check(during.length&&during.every(fr=>done(fr)<.01),`${label}: ${id} waits for the card ${JSON.stringify(during.map(fr=>[Math.round(fr.t),done(fr).toFixed(2)]))}`);
   // and soon after it: within 180 ms of the last frame the card moves in (the card's act is 0.24 s, the figure's 0.3 s), counted
   // from there rather than from the click, since a slow machine runs the wait for the act late; there the start is seen up to two
   // frames late (the one that lays the board out for the slide, then the one that draws its first step)
   const start=frames.find(fr=>done(fr)>.01),finish=frames.find(fr=>done(fr)>.995),card=Math.max(...during.map(fr=>fr.t));
   check(start&&finish&&finish.t-start.t>=250-slack&&finish.t-start.t<=460+slack&&start.t-card<=180+2*slack,`${label}: ${id} slides from ${start?.t|0} to ${finish?.t|0} ms, the card moving until ${card|0} ms (frames up to ${Math.round(frame)} ms apart)`);
  }
  check(durations.length&&durations.every(x=>x.d>=300&&x.d<=400&&/cubic-bezier|ease-in-out/.test(x.e)),`${label}: the slide takes 0.3–0.4 s, eased in and out ${JSON.stringify(durations)}`);
 };
 const calm=()=>p.evaluate(()=>({anims:[...document.querySelectorAll('#board, #board *')].flatMap(n=>n.getAnimations()).length,room:document.body.classList.contains('detail-room'),open:!$('#detail').hidden,held:document.querySelector('#board .wall')?.style.width||''}));
 try {
  for(const c of [{skin:'quiet'},{skin:'magnet',scene:'kitchen'},{skin:'magnet',scene:'city'}]){
   const label=c.scene||c.skin;
   const errors=await open(c);
   const wide=await places();
   const opened=await watch('open'),narrow=await places();
   slid(`${label} open`,opened.frames,wide,narrow,opened.durations);
   check(JSON.stringify(narrow)!==JSON.stringify(wide),`${label}: the panels make room for the card`);
   let s=await calm();check(!s.anims&&s.room&&s.open&&!s.held,`${label}: open, nothing left running ${JSON.stringify(s)}`);
   const closed=await watch('close'),back=await places();
   slid(`${label} close`,closed.frames,narrow,back,closed.durations);
   check(JSON.stringify(back)===JSON.stringify(wide),`${label}: closed, every panel is back in its place ${JSON.stringify({wide,back})}`);
   s=await calm();check(!s.anims&&!s.room&&!s.open&&!s.held,`${label}: closed, nothing left running ${JSON.stringify(s)}`);

   // quick toggles: no panel left halfway, the room of the last state, the same places as a slow toggle
   await p.evaluate(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<7;i++){if(i%2===0)document.querySelector('#board [data-asset] .item-open').click();else closeDetail();await wait(40+i*25);}
    await wait(900);});
   s=await calm();check(!s.anims&&s.room&&s.open&&!s.held,`${label}: after quick toggles the card is open, the room made, nothing running ${JSON.stringify(s)}`);
   check(JSON.stringify(await places())===JSON.stringify(narrow),`${label}: after quick toggles the panels are where an open card puts them`);
   await p.evaluate(()=>closeDetail());await p.waitForTimeout(900);
   check(JSON.stringify(await places())===JSON.stringify(wide),`${label}: and back after closing`);
   check(!errors.length,`${label}: page errors: ${errors.join(' | ')}`);
  }

  // 冰箱贴: a panel the person moved keeps its place, and the kept places are not rewritten by the room
  await open({skin:'magnet',scene:'server'});
  const moved=await p.evaluate(()=>{const id=document.querySelector('#board .wall>.group').dataset.group;freeKeyMove(id,'ArrowDown');freeKeyMove(id,'ArrowDown');return id;});
  await p.waitForTimeout(800);
  const placed=await places(),base=await p.evaluate(()=>JSON.stringify(freeBase));
  check(base!=='null'&&placed[moved].y>=70,`冰箱贴: the moved panel is kept lower ${JSON.stringify(placed[moved])} ${base}`);
  await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());await p.waitForTimeout(900);
  await p.evaluate(()=>closeDetail());await p.waitForTimeout(900);
  check(JSON.stringify(await places())===JSON.stringify(placed)&&await p.evaluate(()=>JSON.stringify(freeBase))===base,`冰箱贴: after the card the moved panel is where it was put ${JSON.stringify(await places())}`);

  // less motion: the room at once, no slide, in both skins
  for(const skin of ['quiet','magnet']){
   await open({skin,motion:'reduce'});
   const wide=await places();
   await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());
   const at=await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r({room:document.body.classList.contains('detail-room'),anims:[...document.querySelectorAll('#board .wall>.group')].flatMap(n=>n.getAnimations()).length}))));
   check(at.room&&!at.anims&&JSON.stringify(await places())!==JSON.stringify(wide),`less motion (${skin}): the room is made at once, without a slide ${JSON.stringify(at)}`);
   await p.evaluate(()=>closeDetail());
   check(await p.evaluate(()=>!document.body.classList.contains('detail-room'))&&JSON.stringify(await places())===JSON.stringify(wide),`less motion (${skin}): closing gives the room back at once`);
  }
  return 'PASS: the panels slide to their places after the detail card, in both skins';
 } finally { for(const c of contexts)await c.close(); }
}
