// Run with the browser tool's filename option. Uses an isolated page; saves only to its own localStorage.
// Free placement under 冰箱贴 (board-free.js), with a real mouse: panels never overlap and stay inside the wall; a panel dragged
// onto another only nudges it until the pointer rests, then the other gives way; a fast pass moves nobody; a slight press moves
// nobody and the dragged panel settles beside; a drag does not fold the panel; places are kept after a reload; 排整齐 and ⌘Z;
// Esc puts a drag back; a density, a narrow window and a new category keep the wall sound, and the wide window gets its places
// back; the quiet skin packs columns again. The door and its figure: four scenes, a dark one takes the dark scheme, the figure
// holds still for less motion.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const wait=ms=>p.waitForTimeout(ms);
 try {
  await p.setViewportSize({width:1500,height:1000});
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{localStorage.clear();localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1','magnet');localStorage.setItem('assetboard-fridge-scene-v1','kitchen');
   const day=o=>isoDay(localDay()+o),rec=(id,type,name,o)=>({id,type,name,provider:'Example',date:day(o),dateKind:'expire',source:'manual'});
   const board={blocks:[{id:'domain'},{id:'server'},{id:'repository'},{id:'database'},{id:'bankcard'},{id:'ai'},{id:'phone'}],assets:[
    rec('d1','domain','one.example.com',12),rec('d2','domain','two.example.com',40),rec('d3','domain','three.example.com',90),
    rec('s1','server','edge-1',5),rec('s2','server','edge-2',30),
    rec('r1','repository','atlas',0),rec('r2','repository','orbit',0),rec('r3','repository','paper',0),rec('r4','repository','tiny',0),
    rec('b1','database','main-db',60),rec('c1','bankcard','Visa',300),rec('a1','ai','Claude',9),rec('a2','ai','Copilot',20)],deletedExternalIds:[]};
   localStorage.setItem(key,JSON.stringify(board));});
  await p.reload();await wait(300);
  // The official build opens the first record on a wide window; under 冰箱贴 the card covers the wall and would catch a
  // drag that starts on a panel in the right-hand columns. These checks are of free placement, so the card stays closed.
  await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});await wait(400);
  const rects=()=>p.evaluate(()=>{const wall=document.querySelector('#board .wall');return [...wall.children].filter(n=>n.dataset.group).map(n=>({id:n.dataset.group,x:parseFloat(n.style.left),y:parseFloat(n.style.top),w:n.offsetWidth,h:n.offsetHeight}));});
  const sound=async label=>{
   const list=await rects(),W=await p.locator('#board .wall').evaluate(e=>e.clientWidth);
   for(const r of list)check(r.x>=-.5&&r.x+r.w<=W+.5&&r.y>=0,`${label}: ${r.id} leaves the wall ${JSON.stringify(r)} in ${W}`);
   for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw new Error(`${label}: ${a.id} and ${b.id} overlap`);}
   return list;
  };
  const at=(list,id)=>list.find(r=>r.id===id);
  const still=(before,after,ids)=>ids.every(id=>Math.abs(at(before,id).x-at(after,id).x)<1&&Math.abs(at(before,id).y-at(after,id).y)<1);
  // A point on a panel's head (its title), in the page.
  const head=id=>p.locator(`#board .wall > .group[data-group="${id}"] .group-head`).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.left+60,y:r.top+r.height/2};});
  const wallTop=()=>p.locator('#board .wall').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top};});

  check(await p.locator('#board .wall.free').count()===1,'冰箱贴 places the wall freely');
  check(await p.evaluate(()=>document.documentElement.dataset.scene==='kitchen'&&getComputedStyle(document.querySelector('.fridge-scene')).display==='block'),'The kitchen door is behind the wall');
  check(await p.locator('#board .wall .wall-pin').count()>0&&await p.locator('#board .wall .wall-tape').count()>0,'Panels carry pins and tape by turns');
  check(await p.locator('#density-toggle [data-action="wall-tidy"]').count()===1,'排整齐 is in the toolbar');
  const start=await sound('the first wall');
  const others=(id,except=[])=>start.map(r=>r.id).filter(x=>x!==id&&!except.includes(x));

  // Onto another panel, slowly, then a rest: only nudged at first, then it gives way; the rest stay.
  const from=await head('ai'),target=at(start,'domain'),w0=await wallTop();
  await p.mouse.move(from.x,from.y);await p.mouse.down();
  const aiR=at(start,'ai'),dx=from.x-(w0.x+aiR.x),dy=from.y-(w0.y+aiR.y);
  const goal={x:w0.x+target.x+dx,y:w0.y+target.y+40+dy};
  for(let i=1;i<=24;i++){await p.mouse.move(from.x+(goal.x-from.x)*i/24,from.y+(goal.y-from.y)*i/24);await wait(16);}
  await wait(120);
  const early=await rects();
  check(still(start,early,['domain']),'Before the rest the touched panel holds its place');
  check(await p.locator('#board .wall > .group[data-group="domain"]').evaluate(e=>e.style.translate!==''),'…and is only nudged');
  await wait(650);
  const yielded=await rects();
  check(!still(start,yielded,['domain']),'After the rest the touched panel gives way');
  await p.screenshot({path:'/tmp/board-free-yield.png'}).catch(()=>{});
  await p.mouse.up();await wait(600);
  const afterYield=await sound('after a drop that pushed');
  check(await p.locator('#board .wall > .group[data-group="ai"].folded').count()===0,'A drag by the title does not fold the panel');
  const pushed=afterYield.filter(r=>!still(start,afterYield,[r.id])).map(r=>r.id);
  check(pushed.includes('ai')&&pushed.length<start.length,'Only the dragged panel and the ones in its way moved: '+pushed.join(','));

  // A fast pass across panels to an empty place: nobody else moves.
  const before=await rects(),s1=await head('server'),dom=at(before,'domain'),w1=await wallTop();
  await p.mouse.move(s1.x,s1.y);await p.mouse.down();
  await p.mouse.move(w1.x+dom.x+80,w1.y+dom.y+20,{steps:4});
  const bottom=Math.max(...before.map(r=>r.y+r.h));
  await p.mouse.move(w1.x+dom.x+80,w1.y+bottom+120,{steps:4});
  await wait(500);await p.mouse.up();await wait(600);
  const afterFast=await sound('after a fast pass');
  check(still(before,afterFast,others('server')),'A fast pass moves nobody');

  // A slight press: just under another panel's bottom edge, a rest, and a drop: nobody moves, the dragged one settles beside.
  const b2=await rects(),low=b2.reduce((m,r)=>r.y+r.h>m.y+m.h?r:m),mover=b2.find(r=>r.id!==low.id&&r.id!=='server')||b2[0],m0=await head(mover.id),w2=await wallTop();
  const mdx=m0.x-(w2.x+mover.x),mdy=m0.y-(w2.y+mover.y);
  await p.mouse.move(m0.x,m0.y);await p.mouse.down();
  const pressGoal={x:w2.x+low.x+mdx,y:w2.y+low.y+low.h-25+mdy};
  for(let i=1;i<=20;i++){await p.mouse.move(m0.x+(pressGoal.x-m0.x)*i/20,m0.y+(pressGoal.y-m0.y)*i/20);await wait(16);}
  await wait(700);
  check(still(b2,await rects(),[low.id]),'A slight press makes nobody give way');
  await p.mouse.up();await wait(600);
  const afterPress=await sound('after a slight press');
  check(still(b2,afterPress,b2.map(r=>r.id).filter(id=>id!==mover.id)),'After a slight press only the dragged panel moved');

  // Kept after a reload.
  await p.reload();await wait(400);
  check(still(afterPress,await rects(),afterPress.map(r=>r.id)),'Places are kept after a reload');

  // Esc puts a drag back.
  const e0=await head('repository');await p.mouse.move(e0.x,e0.y);await p.mouse.down();await p.mouse.move(e0.x+200,e0.y+300,{steps:8});await wait(450);
  await p.keyboard.press('Escape');await p.mouse.up();await wait(600);
  check(still(afterPress,await rects(),afterPress.map(r=>r.id)),'Esc puts everything back');

  // 排整齐, then ⌘Z.
  await p.locator('#density-toggle [data-action="wall-tidy"]').click();await wait(500);
  const tidy=await sound('tidied');
  const cols=await p.evaluate(()=>freeView.geo);const step=cols.colW+cols.gap;
  check(tidy.every(r=>[0,1,2].some(c=>Math.abs(r.x-c*step)<1)),'排整齐 puts every panel on a column');
  await p.keyboard.press('Control+z');await wait(500);
  check(still(afterPress,await rects(),afterPress.map(r=>r.id)),'⌘Z takes 排整齐 back');
  await p.keyboard.press('Control+Shift+z');await wait(500);
  check(still(tidy,await rects(),tidy.map(r=>r.id)),'Redo puts it back in columns');
  await p.keyboard.press('Control+z');await wait(400);

  // Other densities, a narrow window, a new category: sound; the wide window gets its places back.
  for(const d of ['detail','glance','standard']){await p.evaluate(d=>setDensity(d),d);await wait(300);await sound('density '+d);}
  check(still(afterPress,await rects(),afterPress.map(r=>r.id)),'Back in 标准 the places are as they were');
  await p.screenshot({path:'/tmp/board-free-standard.png'}).catch(()=>{});
  await p.setViewportSize({width:1000,height:1000});await wait(400);await sound('a narrow window');
  await p.setViewportSize({width:700,height:1000});await wait(400);await sound('a single column');
  await p.setViewportSize({width:1500,height:1000});await wait(400);
  check(still(afterPress,await rects(),afterPress.map(r=>r.id)),'The wide window gets its places back');
  await p.evaluate(()=>{checkpoint();state.assets.push({id:'p1',type:'phone',name:'+65 8000 0000',provider:'Example',source:'manual'},{id:'d4',type:'domain',name:'four.example.com',provider:'Example',source:'manual'});save();render();});await wait(400);
  await sound('a new category and a new record');
  check(await p.locator('#board .wall > .group[data-group="phone"]').count()===1,'The new category has its panel');
  await p.evaluate(()=>{state.assets=state.assets.filter(a=>!['r2','r3','r4'].includes(a.id));save();render();});await wait(400);
  await sound('records removed');
  // ⌥ + arrows move a panel a column aside.
  const k0=at(await rects(),'bankcard');await p.locator('#board .group-title[data-id="bankcard"]').focus();await p.keyboard.press(k0.x>10?'Alt+ArrowLeft':'Alt+ArrowRight');await wait(500);
  const k1=at(await sound('after ⌥ + arrow'),'bankcard');check(Math.abs(k1.x-k0.x)>step/2,'⌥ + arrow moves a panel a column aside');

  // The doors: a dark one takes the dark scheme; the figure holds still for less motion; the quiet skin packs columns again.
  for(const s of ['city','handdrawn','server','kitchen']){await p.evaluate(s=>{setScene(s);render();},s);await wait(150);check(await p.evaluate(s=>document.documentElement.dataset.scene===s&&document.documentElement.dataset.scheme===(['city','server'].includes(s)?'dark':'light'),s),'Scene '+s+' with its scheme');}
  check(/chef\.gif|chef@2x\.gif/.test(await p.locator('.scene-figure').evaluate(e=>getComputedStyle(e).backgroundImage)),'The figure moves');
  await p.emulateMedia({reducedMotion:'reduce'});await wait(100);
  check(/chef(@2x)?\.png/.test(await p.locator('.scene-figure').evaluate(e=>getComputedStyle(e).backgroundImage)),'With less motion the figure holds still');
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.evaluate(()=>{setSkin('quiet');render();});await wait(300);
  check(await p.locator('#board .wall.free').count()===0&&await p.evaluate(()=>getComputedStyle(document.querySelector('.fridge-scene')).display==='none'),'The quiet skin packs columns, without a door');
  check(await p.locator('#density-toggle [data-action="wall-tidy"]').count()===0,'排整齐 is only for 冰箱贴');
  if(errors.length)throw new Error(errors.join(' | '));
  return 'PASS: free placement: sound walls, rest before giving way, fast pass and slight press move nobody, kept, Esc, 排整齐 and undo, densities, widths, new categories, ⌥ + arrows, doors';
 } finally {await p.close();}
}
