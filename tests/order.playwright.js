// Run with the browser tool's filename option. Display order by recency, manual front/auto, drag and keyboard reorder, drag to a sidebar category; never saves.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',error=>errors.push(error.message));
 const settle=()=>p.waitForTimeout(450);
 const center=async locator=>{const box=await locator.boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};};
 const drag=async(from,to)=>{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+8,from.y+3,{steps:3});await p.mouse.move(to.x,to.y,{steps:16});await p.waitForTimeout(150);await p.mouse.up();await settle();};
 const shown=group=>p.evaluate(group=>[...document.querySelectorAll(`#board .group[data-group="${group}"] .group-body > [data-asset]`)].map(el=>el.dataset.asset),group);
 const undo=()=>p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
 const menu=async action=>{await p.click('#detail [data-action="asset-menu"]');await p.waitForSelector('#menu:not([hidden])');if(action)await p.click(`#menu [data-action="${action}"]`);};
 try {
  await p.setViewportSize({width:1440,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{save=()=>{};const day=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);},ago=n=>new Date(Date.now()-n*36e5).toISOString();
   const asset=(id,type,name,extra={})=>({id,type,name,provider:'Test',account:'',purpose:'Order test',event:'',date:'',cost:'',art:'generic',url:'',source:'manual',...extra});
   // d0 is the most recent; stored order is shuffled; d19 is the oldest but due tomorrow.
   const domains=Array.from({length:20},(_,i)=>asset('d'+i,'domain','order-'+i+'.test',{updatedAt:ago(i+1),...(i===19?{date:day(1),dateKind:'expire'}:{})})).sort((a,b)=>(a.id.length-b.id.length)||(b.id<a.id?1:-1)).reverse();
   const repos=Array.from({length:10},(_,i)=>asset('r'+i,'repository','org/repo-'+i,{source:'github',externalId:'x'+i,updatedAt:ago(i+1)}));
   const legacy=['l2','l0','l1'].map(id=>asset(id,'server','legacy-'+id));
   state={blocks:[{id:'domain',width:100,height:null,density:'full',folded:false},{id:'repository',width:100,height:null,density:'full',folded:false},{id:'server',width:100,height:null,density:'full',folded:false}],assets:[...domains,...repos,...legacy],deletedExternalIds:[]};history=[];setLayout('list');setView('all');});
  await settle();
  let ids=await shown('domain');
  check(ids.join()===Array.from({length:20},(_,i)=>'d'+i).join(),'The overview lists every record, most recently updated first: '+ids.join());
  check(ids.at(-1)==='d19','Urgency does not pull a record forward');
  await p.click('#sidebar .nav-item[data-id="upcoming"]');await settle();
  check((await p.locator('#board').innerText()).includes('order-19.test'),'The urgent record reaches 即将到来');
  await p.click('#sidebar .nav-item[data-id="all"]');await settle();
  check((await shown('server')).join()==='l2,l0,l1','Records without dates keep their stored order');
  // 放到前面 / 恢复自动排序 from the inspector menu, by keyboard, with undo.
  await p.evaluate(()=>showDetail('d15'));await menu();
  check(await p.evaluate(()=>document.activeElement?.dataset.action==='pin-front'),'The menu opens with 放到前面 focused');
  await p.keyboard.press('Enter');await settle();
  ids=await shown('domain');
  check(ids[0]==='d15'&&ids[1]==='d0'&&ids.length===20,'放到前面 puts the record first and the rest follow recency: '+ids.join());
  check(await p.evaluate(()=>JSON.stringify(state.cardOrder.domain))==='["d15"]','Only the chosen record becomes manual order');
  await menu();check(await p.locator('#menu [data-action="auto-order"]').count()===1,'The menu offers 恢复自动排序');await p.keyboard.press('Escape');
  await p.evaluate(()=>closeDetail());await undo();await settle();
  check((await shown('domain'))[0]==='d0'&&!(await p.evaluate(()=>state.cardOrder?.domain?.length)),'⌘Z undoes 放到前面');
  await p.focus('#board [data-asset="d15"] .item-open');await p.keyboard.press('f');await settle();
  check((await shown('domain'))[0]==='d15'&&await p.evaluate(()=>document.activeElement.closest('[data-asset]')?.dataset.asset==='d15'),'F puts the focused record first and keeps focus on it');
  await p.evaluate(()=>showDetail('d15'));await menu('auto-order');await settle();
  check((await shown('domain'))[0]==='d0'&&await p.evaluate(()=>!state.cardOrder?.domain),'恢复自动排序 clears the manual order');
  await menu();check(!(await p.locator('#menu [data-action="auto-order"]').count()),'恢复自动排序 leaves the menu once nothing is manual');await p.keyboard.press('Escape');
  await p.evaluate(()=>closeDetail());
  // A newer record goes first without touching the manual order.
  await p.evaluate(()=>{state.assets.push({id:'fresh',type:'domain',name:'fresh.test',provider:'Test',account:'',purpose:'',source:'manual',art:'generic',createdAt:new Date().toISOString()});render();});await settle();
  check((await shown('domain'))[0]==='fresh','A just-added record shows first');
  await p.evaluate(()=>{state.assets=state.assets.filter(a=>a.id!=='fresh');render();});await settle();
  // Drag a row within its group: the slot follows the pointer, the drop stores the touched prefix, ⌘Z undoes it.
  const d0=await center(p.locator('#board [data-asset="d0"]'));
  await drag(await center(p.locator('#board [data-asset="d3"]')),{x:d0.x,y:d0.y-8});
  ids=await shown('domain');
  check(ids.slice(0,5).join()==='d3,d0,d1,d2,d4','Dragging a row above another reorders the list: '+ids.slice(0,6).join());
  check(await p.evaluate(()=>state.cardOrder.domain.join()==='d3,d0,d1,d2'),'Only the touched prefix is stored');
  check(!(await p.locator('.drop-slot,.is-dragging').count())&&!(await p.evaluate(()=>document.body.classList.contains('drag-active'))),'Drag leaves nothing behind');
  await undo();await settle();check((await shown('domain'))[0]==='d0','⌘Z undoes the drag');
  // ⌥↓ moves the focused row one place and keeps focus.
  await p.focus('#board [data-asset="d0"] .item-open');await p.keyboard.press('Alt+ArrowDown');await settle();
  check((await shown('domain')).slice(0,2).join()==='d1,d0'&&await p.evaluate(()=>document.activeElement.closest('[data-asset]')?.dataset.asset==='d0'),'⌥↓ moves the row down and keeps focus');
  await undo();await settle();
  // In the grid, dragging works sideways too.
  await p.click('#layout-toggle [data-id="grid"]');await settle();
  await p.evaluate(()=>document.querySelector('#board .group[data-group="repository"]').scrollIntoView({block:'start'}));await settle();
  const r1=await center(p.locator('#board [data-asset="r1"]'));
  await drag(await center(p.locator('#board [data-asset="r8"]')),{x:r1.x-30,y:r1.y});
  check((await shown('repository')).slice(0,3).join()==='r0,r8,r1','A grid card dropped before another takes its place: '+(await shown('repository')).join());
  await undo();await settle();
  await p.click('#layout-toggle [data-id="list"]');await p.evaluate(()=>boardScroller().scrollTo(0,0));await settle();
  // Dropping a row on another category in the sidebar changes its category; synced records refuse.
  await drag(await center(p.locator('#board [data-asset="d5"]')),await center(p.locator('#sidebar .nav-item[data-block="server"]')));
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='d5').type==='server')&&/已移到「服务器」/.test(await p.textContent('#toast')),'A row dropped on a sidebar category moves there');
  await undo();await settle();check(await p.evaluate(()=>state.assets.find(a=>a.id==='d5').type==='domain'),'⌘Z moves it back');
  await p.evaluate(()=>document.querySelector('#board [data-asset="r2"]').scrollIntoView({block:'center'}));await settle();
  const from=await center(p.locator('#board [data-asset="r2"]')),to=await center(p.locator('#sidebar .nav-item[data-block="server"]'));
  await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+8,from.y+3,{steps:3});await p.mouse.move(to.x,to.y,{steps:16});await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelector('#sidebar .nav-item[data-block="server"]').classList.contains('drop-refused')&&/不能改类别/.test(document.querySelector('.float-tip')?.textContent||'')),'A synced record is refused, with a reason');
  await p.mouse.up();await settle();
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='r2').type==='repository'),'The refused record keeps its category');
  // Sidebar categories reorder by drag; the overview follows.
  await p.evaluate(()=>boardScroller().scrollTo(0,0));
  const domainNav=await center(p.locator('#sidebar .nav-item[data-block="domain"]'));
  await drag(await center(p.locator('#sidebar .nav-item[data-block="server"]')),{x:domainNav.x,y:domainNav.y-6});
  check(await p.evaluate(()=>state.blocks.map(b=>b.id).join()==='server,domain,repository'&&[...document.querySelectorAll('#board .group')].map(g=>g.dataset.group).join()==='server,domain,repository'),'Dragging a sidebar category reorders the groups: '+await p.evaluate(()=>state.blocks.map(b=>b.id).join()));
  await undo();await settle();
  check(await p.evaluate(()=>state.blocks.map(b=>b.id).join()==='domain,repository,server'),'⌘Z restores the category order');
  check(!errors.length,'Page errors: '+errors.join(' | '));
  return 'PASS: recency order with every record shown, urgency never promotes, stored order without dates, 放到前面 from the menu and F with undo, 恢复自动排序, new record first, row drag and ⌥↓ with undo, grid drag, drop on a sidebar category with refusal for synced records, sidebar category reorder';
 } finally { await p.close(); }
}
