// Run with the browser tool's filename option. Uses an isolated page; saves only to its own localStorage.
// Under 冰箱贴 a drawing of the board leaves the panels where they are: after a panel was moved, a redraw (a GitHub status read
// draws the board several times), another view and back, and the panorama opened and closed keep every panel at its place, with
// no panel sliding (the panels of a new drawing used to fly in from the wall's corner every time). A move still slides.
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
   const board={blocks:[{id:'domain'},{id:'server'},{id:'repository'},{id:'database'},{id:'ai'}],assets:[
    rec('d1','domain','one.example.com',12),rec('d2','domain','two.example.com',40),rec('s1','server','edge-1',5),rec('s2','server','edge-2',30),
    {id:'r1',type:'repository',name:'atlas',provider:'GitHub',source:'manual'},{id:'r2',type:'repository',name:'orbit',provider:'GitHub',source:'manual'},
    rec('b1','database','main-db',60),rec('a1','ai','Claude',9)],deletedExternalIds:[]};
   localStorage.setItem(key,JSON.stringify(board));});
  // Every slide of a panel: a transition of its place, or an animation (the board's own slide of a moved group).
  await p.addInitScript(()=>{window.__slides=[];
   const animate=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.matches?.('#board .wall > .group'))window.__slides.push('animate '+this.dataset.group);return animate.apply(this,args);};
   document.addEventListener('transitionrun',e=>{if(e.target.matches?.('#board .wall > .group')&&['left','top'].includes(e.propertyName))window.__slides.push(e.propertyName+' '+e.target.dataset.group);},true);});
  await p.reload();await wait(600);
  // The inspector closed, so the wall keeps its width (the panorama closes it; a narrower wall has other columns).
  await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});await wait(600);
  check(await p.locator('#board .wall.free').count()===1,'冰箱贴 places the wall freely');
  const places=()=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#board .wall > .group')].map(n=>[n.dataset.group,[Math.round(parseFloat(n.style.left)),Math.round(parseFloat(n.style.top))]])));
  const slides=async()=>{await wait(700);return p.evaluate(()=>{const s=window.__slides;window.__slides=[];return s;});};
  check(!(await slides()).some(s=>/^(left|top) /.test(s)),'A drawing never flies the panels in from the corner');

  // A panel moved by the person (⌥ → on its title): it slides, and its place is kept.
  await p.locator('#board .group-title[data-id="ai"]').focus();
  const before=await places();
  await p.keyboard.press('Alt+ArrowLeft');
  check((await slides()).some(s=>/ ai$/.test(s)),'A moved panel slides to its new place');
  const moved=await places();
  check(JSON.stringify(moved)!==JSON.stringify(before),'⌥ ← moved the panel: '+JSON.stringify({before,moved}));

  const same=async label=>{const now=await places(),s=await slides();
   check(JSON.stringify(now)===JSON.stringify(moved),`${label}: every panel keeps its place: `+JSON.stringify({moved,now}));
   check(!s.length,`${label}: no panel slides: `+s.slice(0,8).join(', '));};
  // A GitHub status read draws the board at its start and its end (pullsRedraw); any redraw is the same.
  for(let i=0;i<3;i++)await p.evaluate(()=>typeof pullsRedraw==='function'?pullsRedraw():render());
  await same('Three redraws, as a GitHub status read');
  await p.evaluate(()=>dayRender());
  await same('The redraw of a new day');
  await p.evaluate(()=>setView('domain'));await wait(200);await p.evaluate(()=>setView('all'));
  await same('Another view and back to 全部资产');
  await p.evaluate(()=>panoramaOpen(true));await wait(300);await p.evaluate(()=>panoramaOpen(false));
  await same('The panorama opened and closed');
  await p.reload();await wait(600);await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});await slides();
  check(JSON.stringify(await places())===JSON.stringify(moved),'A reload keeps every place: '+JSON.stringify(await places()));
  check(!errors.length,'No page errors: '+errors.join(' | '));
 } finally {await p.close();}
}
