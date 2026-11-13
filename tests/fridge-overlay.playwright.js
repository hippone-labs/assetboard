// Run with the browser tool's filename option. Uses its own contexts; saves only to their localStorage.
// Under 冰箱贴 the detail card covers the wall and does not take its width (app.js, detailOverlaysWall; material.css): opening
// or closing it leaves every panel where it was and the column count as it was, with no panel sliding; opening the panorama
// (which closes the detail) is the same. The uncovered part of the wall still takes the pointer. The quiet skin still makes
// room, the panels sliding (tests/detail-room.playwright.js).
async (page) => {
 const browser=page.context().browser();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const contexts=[];let p;
 const open=async({skin='magnet',scene='kitchen',motion='no-preference'}={})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:motion});contexts.push(context);
  await context.addInitScript(([skin,scene])=>{localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1',skin);if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);},[skin,scene]);
  p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/?demo');await p.waitForTimeout(500);
  await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});
  await p.waitForFunction(()=>roomTarget===null&&!roomMove&&!document.getAnimations().length,null,{timeout:5000,polling:50}).catch(()=>{});
  return errors;
 };
 const settle=async()=>{await p.waitForTimeout(400);
  await p.waitForFunction(()=>roomTarget===null&&!roomMove&&!/\bfig-(pull|push)\b/.test(document.body.className)&&!document.querySelector('.detail-leave'),null,{timeout:5000,polling:50}).catch(()=>{});
  await p.waitForTimeout(80);};
 const layout=()=>p.evaluate(()=>{
  const wall=document.querySelector('#board .wall'),board=document.querySelector('#board'),detail=document.querySelector('#detail');
  const wr=wall.getBoundingClientRect(),br=board.getBoundingClientRect(),dr=detail.getBoundingClientRect();
  return {cols:+wall.dataset.cols,width:wall.clientWidth,board:board.clientWidth,places:Object.fromEntries([...wall.querySelectorAll(':scope > .group')].map(n=>[n.dataset.group,{x:Math.round(n.offsetLeft),y:Math.round(n.offsetTop),w:Math.round(n.offsetWidth)}])),
   margin:getComputedStyle(board).marginRight,room:document.body.classList.contains('detail-room'),open:!detail.hidden,
   cover:dr.left<br.right-40,card:detail.hidden?null:{l:dr.left,r:dr.right,t:dr.top,b:dr.bottom},wall:{l:wr.left,r:wr.right,t:wr.top,b:wr.bottom}};
 });
 const slides=()=>p.evaluate(()=>[...document.querySelectorAll('#board .wall > .group')].flatMap(n=>n.getAnimations()).map(a=>({id:a.effect?.target?.dataset?.group,d:a.effect?.getTiming?.().duration,k:a.effect?.getKeyframes?.().map(k=>k.translate||k.width||'')})));
 try {
  for(const scene of ['kitchen','handdrawn']){
   const errors=await open({skin:'magnet',scene});
   const closed=await layout();
   check(closed.cols>=3&&!closed.open&&!closed.room&&closed.margin==='0px',`${scene}: the wall is open, the card is closed ${JSON.stringify({cols:closed.cols,open:closed.open,room:closed.room,margin:closed.margin})}`);
   await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());
   const during=await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r({anims:[...document.querySelectorAll('#board .wall > .group')].flatMap(n=>n.getAnimations()).length,cols:+document.querySelector('#board .wall').dataset.cols,width:document.querySelector('#board .wall').clientWidth})))));
   check(!during.anims&&during.cols===closed.cols&&during.width===closed.width,`${scene}: opening does not slide the panels or change the columns ${JSON.stringify(during)}`);
   await settle();
   const opened=await layout();
   check(opened.open&&opened.room&&opened.cols===closed.cols&&opened.width===closed.width&&opened.board===closed.board,`${scene}: open, the wall keeps its columns and its width ${JSON.stringify({closed:{cols:closed.cols,width:closed.width,board:closed.board},opened:{cols:opened.cols,width:opened.width,board:opened.board,room:opened.room}})}`);
   check(JSON.stringify(opened.places)===JSON.stringify(closed.places),`${scene}: open, every panel stays where it was ${JSON.stringify({closed:closed.places,opened:opened.places})}`);
   check(!(await slides()).length,`${scene}: open, no panel is sliding`);
   check(opened.cover&&opened.card.l<opened.wall.r-40,`${scene}: the card covers the wall ${JSON.stringify({card:opened.card,wall:opened.wall})}`);
   // the part the card does not cover still takes the pointer (a drag can start there)
   const hit=await p.evaluate(()=>{const wall=document.querySelector('#board .wall'),wr=wall.getBoundingClientRect(),d=document.querySelector('#detail').getBoundingClientRect();
    const x=Math.round(wr.left+24),y=Math.round(wr.top+Math.min(80,wr.height/3));
    const n=document.elementFromPoint(x,y);return {x,y,tag:n&&n.tagName,id:n&&n.id,inside:!!n?.closest('#board'),detail:!!n?.closest('#detail')};});
   check(hit.inside&&!hit.detail,`${scene}: a point on the uncovered wall hits the board, not the card ${JSON.stringify(hit)}`);
   await p.evaluate(()=>closeDetail());await settle();
   const back=await layout();
   check(!back.open&&!back.room&&back.cols===closed.cols&&back.width===closed.width&&JSON.stringify(back.places)===JSON.stringify(closed.places),`${scene}: closed, every panel is where it was ${JSON.stringify({closed:closed.places,back:back.places})}`);

   // a panel the person moved stays put while the card opens and closes
   const moved=await p.evaluate(()=>{const id=document.querySelector('#board .wall>.group').dataset.group;freeKeyMove(id,'ArrowDown');freeKeyMove(id,'ArrowDown');return id;});
   await settle();
   const placed=await layout();
   check(placed.places[moved].y>=closed.places[moved].y+70,`${scene}: the moved panel is kept lower ${JSON.stringify({from:closed.places[moved],to:placed.places[moved]})}`);
   await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());await settle();
   const over=await layout();
   check(over.open&&JSON.stringify(over.places)===JSON.stringify(placed.places)&&over.cols===placed.cols,`${scene}: with a moved panel, opening the card leaves every place ${JSON.stringify({placed:placed.places,over:over.places})}`);
   await p.evaluate(()=>closeDetail());await settle();
   check(JSON.stringify((await layout()).places)===JSON.stringify(placed.places),`${scene}: and closing leaves them too`);

   // the panorama closes the detail; coming back, the wall is as it was
   await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());await settle();
   await p.evaluate(()=>panoramaOpen(true));await p.waitForTimeout(300);
   await p.evaluate(()=>panoramaOpen(false));await settle();
   const afterPano=await layout();
   check(!afterPano.open&&afterPano.cols===placed.cols&&JSON.stringify(afterPano.places)===JSON.stringify(placed.places),`${scene}: after the panorama every panel is where it was ${JSON.stringify({placed:placed.places,after:afterPano.places})}`);
   check(!errors.length,`${scene}: page errors: ${errors.join(' | ')}`);
  }

  // the quiet skin still makes room for the card
  const errors=await open({skin:'quiet',scene:''});
  const wide=await layout();
  await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());await settle();
  const narrow=await layout();
  check(narrow.open&&narrow.room&&(narrow.cols!==wide.cols||narrow.width<wide.width-40),`quiet: the wall makes room for the card ${JSON.stringify({wide:{cols:wide.cols,width:wide.width},narrow:{cols:narrow.cols,width:narrow.width}})}`);
  check(JSON.stringify(narrow.places)!==JSON.stringify(wide.places),`quiet: the panels change place ${JSON.stringify({wide:wide.places,narrow:narrow.places})}`);
  await p.evaluate(()=>closeDetail());await settle();
  const back=await layout();
  check(!back.open&&!back.room&&JSON.stringify(back.places)===JSON.stringify(wide.places),`quiet: closed, every panel is back ${JSON.stringify({wide:wide.places,back:back.places})}`);
  check(!errors.length,`quiet: page errors: ${errors.join(' | ')}`);
  return 'PASS: under 冰箱贴 the detail covers the wall; the quiet skin still makes room';
 } finally { for(const c of contexts)await c.close(); }
}
