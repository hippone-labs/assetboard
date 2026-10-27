// Run with the browser tool's filename option. Keyboard map (search, list and grid focus moves, sidebar, inspector, menu, hide, 放到前面, reorder, undo/redo, forms, help overlay) and category quick actions; never saves.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',error=>errors.push(error.message));
 const settle=()=>p.waitForTimeout(300);
 const mod=process.platform==='darwin'?'Meta':'Control';
 const focused=()=>p.evaluate(()=>{const el=document.activeElement;return {id:el?.closest?.('[data-asset]')?.dataset.asset||'',cls:el?.className||'',tag:el?.tagName||'',group:el?.closest?.('.group')?.dataset.group||'',nav:el?.closest?.('#sidebar')?el.dataset.id:''};});
 const order=group=>p.evaluate(group=>[...document.querySelectorAll(`#board .group[data-group="${group}"] .group-body > [data-asset]`)].map(el=>el.dataset.asset),group);
 const key=async k=>{await p.keyboard.press(k);await settle();};
 try {
  await p.setViewportSize({width:1440,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{save=()=>{};window.__copied=[];copyText=(text,done)=>{window.__copied.push(text);toast(done);};window.__opened=[];window.open=url=>{window.__opened.push(url);};
   const ago=n=>new Date(Date.now()-n*36e5).toISOString();
   const asset=(id,type,name,extra={})=>({id,type,name,provider:'Test',account:'',purpose:'Keyboard test',event:'',date:'',cost:'',art:'generic',url:'',source:'manual',...extra});
   const domains=Array.from({length:16},(_,i)=>asset('d'+i,'domain','key-'+i+'.test',{updatedAt:ago(i+1),url:i===0?'https://dash.example.org/key-0':''}));
   const servers=[asset('s0','server','vps-a',{updatedAt:ago(1),host:'203.0.113.10',sshUser:'deploy',url:'https://console.example.org/a'}),asset('s1','server','vps-b',{updatedAt:ago(2),host:'198.51.100.24',sshPort:'2222'}),asset('s2','server','nas',{updatedAt:ago(3)})];
   const repos=[asset('r0','repository','demo-org/site',{updatedAt:ago(1),url:'https://github.com/demo-org/site',source:'github',externalId:'1'})];
   state={blocks:[{id:'domain',width:50,height:null,density:'full',folded:false},{id:'server',width:50,height:null,density:'full',folded:false},{id:'repository',width:100,height:null,density:'full',folded:false}],assets:[...domains,...servers,...repos],deletedExternalIds:[]};history=[];future=[];setLayout('list');setView('all');});
  await settle();

  // Help overlay and search.
  await key('Shift+Slash');
  check(await p.locator('#keys-help:not([hidden]) .keys-card').count()===1,'? opens the shortcut overlay');
  check(await p.evaluate(()=>{const s=getComputedStyle(document.querySelector('.keys-card'));return parseFloat(s.animationDuration)<=.2;}),'Overlay motion stays within 0.2s');
  check(!(await p.locator('#keys-help').innerText()).includes('交换'),'The overlay no longer lists swaps');
  await key('Escape');
  check(await p.locator('#keys-help').isHidden(),'Esc closes the overlay');
  await key('Slash');
  check(await p.evaluate(()=>document.activeElement.id==='search'),'/ focuses search');
  await p.keyboard.type('nhfx');await settle();
  check(!(await p.evaluate(()=>document.querySelector('#modal').open))&&(await p.inputValue('#search'))==='nhfx','Letters typed into search are not captured');
  await key('Escape');check((await p.inputValue('#search'))==='','Esc clears the search first');
  await key('Escape');
  await key(`${mod}+k`);
  check(await p.evaluate(()=>document.activeElement.id==='search'),'⌘K focuses search');
  await key('ArrowDown');
  let f=await focused();check(f.id==='d0','↓ in search jumps to the first row: '+JSON.stringify(f));
  check(await p.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle==='solid'),'Keyboard focus draws a ring around the row');

  // List: ↑/↓ walk in reading order and pass through group titles; ← goes to the sidebar and → comes back.
  await key('ArrowDown');f=await focused();check(f.id==='d1','↓ moves to the next row');
  await key('ArrowUp');await key('ArrowUp');f=await focused();check(f.id==='d0'||f.nav==='','↑ walks back');
  await p.focus('#board [data-asset="d15"] .item-open');
  await key('ArrowDown');f=await focused();check(f.group==='server'&&/group-title/.test(f.cls),'↓ after the last row reaches the next group title: '+JSON.stringify(f));
  await key('ArrowDown');f=await focused();check(f.id==='s0','↓ again enters the group');
  await key('ArrowRight');f=await focused();check(f.id==='s0','→ in a list does nothing');
  await key('ArrowLeft');f=await focused();check(f.nav==='all','← moves to the active sidebar item: '+JSON.stringify(f));
  await key('ArrowDown');f=await focused();check(f.nav==='panorama','↓ in the sidebar moves to the next item (the panorama entry)');await key('ArrowDown');f=await focused();check(f.nav==='domain','↓ again reaches the categories');
  await key('ArrowRight');f=await focused();check(!!f.id||/group-title/.test(f.cls),'→ from the sidebar returns to the board');
  // Enter on a sidebar item switches the view.
  await p.focus('#sidebar .nav-item[data-id="server"]');await key('Enter');
  check(await p.evaluate(()=>currentView()==='server'&&document.querySelector('#view-title').textContent==='服务器'),'Enter on a sidebar category shows it');
  await p.focus('#sidebar .nav-item[data-id="all"]');await key('Enter');

  // Grid: ←/→ inside a group, ↓ to the nearest card below.
  await p.click('#layout-toggle [data-id="grid"]');await settle();
  await p.focus('#board [data-asset="d0"] .item-open');
  await key('ArrowRight');f=await focused();check(f.id==='d1','→ in the grid moves to the next card');
  await key('ArrowLeft');await key('ArrowDown');f=await focused();
  const below=await p.evaluate(()=>{const cards=[...document.querySelectorAll('#board .group[data-group="domain"] .gcard')],x=cards[0].getBoundingClientRect().left;return cards.find(el=>Math.abs(el.getBoundingClientRect().left-x)<2&&el!==cards[0]).dataset.asset;});
  check(f.id===below,'↓ in the grid keeps the column: '+f.id+' vs '+below);
  await p.click('#layout-toggle [data-id="list"]');await settle();

  // Enter opens the inspector and moves focus into it; Esc closes it and returns focus.
  await p.focus('#board [data-asset="s0"] .item-open');
  await key('Enter');check(await p.locator('#detail').isVisible()&&await p.evaluate(()=>document.activeElement.id==='close-detail'),'Enter opens the inspector with focus inside');
  check(await p.locator('#detail .quick-row [data-quick="copy-ip"]').count()===1,'The inspector lists the quick actions beyond the row');
  check(await p.evaluate(()=>document.body.classList.contains('inspecting')&&document.querySelector('#board').getBoundingClientRect().right<=document.querySelector('#detail').getBoundingClientRect().left+1),'The inspector docks beside the list, inside the card');
  check(await p.locator('#board [data-asset="s0"].selected').count()===1,'The open record is selected in the list');
  await key('Escape');check(await p.locator('#detail').isHidden(),'Esc closes the inspector');
  f=await focused();check(f.id==='s0','Focus returns to the row');
  // A click keeps focus in the list, and ↓ carries the inspector along.
  await p.click('#board [data-asset="s0"] .item-open');await settle();
  f=await focused();check(f.id==='s0','A click leaves focus on the row');
  await key('ArrowDown');
  check(await p.evaluate(()=>activeAsset==='s1'&&document.querySelector('#detail h2').textContent==='vps-b'&&!!document.querySelector('#board [data-asset="s1"].selected')),'↓ moves the selection and the inspector follows');
  // ⋯ opens the menu from the keyboard; arrows move, Esc closes and returns focus.
  await p.focus('#detail [data-action="asset-menu"]');await key('Enter');
  check(await p.evaluate(()=>!document.querySelector('#menu').hidden&&document.activeElement.classList.contains('menu-item')&&document.querySelector('#detail [data-action="asset-menu"]').getAttribute('aria-expanded')==='true'),'Enter on ⋯ opens the menu with the first item focused');
  await key('End');check(await p.evaluate(()=>document.activeElement.dataset.action==='delete-asset'),'End reaches 删除');
  await key('ArrowDown');check(await p.evaluate(()=>document.activeElement.dataset.action==='pin-front'),'↓ wraps to the top');
  await key('Escape');check(await p.evaluate(()=>document.querySelector('#menu').hidden&&document.activeElement.dataset.action==='asset-menu'&&!$('#detail').hidden),'Esc closes only the menu and returns focus to ⋯');
  await key('Escape');
  // Right-click on a row opens the same actions plus open/edit/copy.
  await p.click('#board [data-asset="s0"] .item-open',{button:'right'});await settle();
  const items=await p.evaluate(()=>[...document.querySelectorAll('#menu .menu-item')].map(n=>n.dataset.action));
  check(items[0]==='external'&&items.includes('edit-asset')&&items.includes('quick')&&items.at(-1)==='delete-asset','The context menu lists open, edit, quick actions and the rest: '+items.join());
  await key('Escape');

  // Quick actions: at most two, only on hover/focus, keyboard O and ⌘C.
  check(await p.locator('#board [data-asset="s0"] .quick-action').count()===2,'Server row shows two quick actions');
  check(await p.locator('#board [data-asset="s2"] .quick-action').count()===0,'No quick actions without a link or host');
  await p.mouse.move(5,890);await p.focus('#board [data-asset="s0"] .item-open');await settle();
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('[data-asset="s1"] .quick-action')).opacity==='0'),'Quick actions stay hidden until hover or focus');
  check(await p.evaluate(()=>getComputedStyle(document.querySelector('[data-asset="s0"] .quick-action')).opacity==='1'),'Focusing a row reveals its quick actions');
  await key(`${mod}+c`);
  check((await p.evaluate(()=>window.__copied)).join()==='ssh deploy@203.0.113.10','⌘C on a server copies the SSH command');
  await key('o');
  check((await p.evaluate(()=>window.__opened)).join()==='https://console.example.org/a','O opens the console link');
  await p.focus('#board [data-asset="r0"] .item-open');await key(`${mod}+c`);
  check((await p.evaluate(()=>window.__copied)).pop()==='https://github.com/demo-org/site.git','⌘C on a repository copies the clone URL');

  // 放到前面, undo and redo.
  await p.focus('#board [data-asset="d3"] .item-open');
  await key('f');
  check((await order('domain'))[0]==='d3','F puts the row first');
  f=await focused();check(f.id==='d3','Focus follows the row');
  await key(`${mod}+z`);check((await order('domain'))[0]==='d0','⌘Z undoes 放到前面');
  await key(`${mod}+Shift+z`);check((await order('domain'))[0]==='d3','⇧⌘Z redoes it');
  await key(`${mod}+z`);

  // ⌥↓ moves one place; in a list ⌥→ does nothing.
  await p.focus('#board [data-asset="d0"] .item-open');
  await key('Alt+ArrowDown');
  check((await order('domain')).slice(0,2).join()==='d1,d0','⌥↓ moves the row down');
  await key('Alt+ArrowRight');check((await order('domain')).slice(0,2).join()==='d1,d0','⌥→ in a list does nothing');
  await key(`${mod}+z`);

  // Hide moves focus to the neighbour; restore from 已隐藏.
  await p.focus('#board [data-asset="d1"] .item-open');
  await key('h');
  check(await p.evaluate(()=>!!state.assets.find(a=>a.id==='d1').hiddenAt),'H hides the row');
  f=await focused();check(f.id==='d2','Focus moves to the next row after hiding: '+f.id);
  check(await p.locator('#sidebar .nav-item[data-id="hidden"]').count()===1,'已隐藏 appears in the sidebar');
  await p.click('#sidebar .nav-item[data-id="hidden"]');await settle();
  check(await p.locator('#board .row.is-hidden .quick-action').count()===0&&await p.locator('#board [data-asset="d1"] [data-action="restore-asset"]').count()===1,'Hidden rows offer 恢复, no quick actions');
  await p.focus('#board [data-asset="d1"] .item-open');
  await key('h');
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='d1').hiddenAt),'H on a hidden row restores it');
  check(await p.evaluate(()=>currentView()==='all')&&await p.locator('#sidebar .nav-item[data-id="hidden"]').count()===0,'With nothing hidden the view falls back to 全部资产');

  // N opens the capture panel for the focused group; 手动填写 gives its form, ⌘Enter saves, Esc closes.
  await p.focus('#board [data-asset="s1"] .item-open');
  await key('n');
  check(await p.evaluate(()=>$('#modal').dataset.view==='capture'&&$('#modal-title').textContent==='添加服务器资产'),'N opens the capture panel for the focused group');
  await p.click('#capture [data-action="capture-manual"]');
  check(await p.evaluate(()=>document.querySelector('#asset-form')?.dataset.type==='server'),'手动填写 opens the form for that group');
  await p.fill('#asset-form [name="name"]','vps-new');await p.fill('#asset-form [name="host"]','bad host');
  await key(`${mod}+Enter`);
  check(await p.evaluate(()=>document.querySelector('#modal').open&&!state.assets.some(a=>a.name==='vps-new')),'Invalid host blocks saving');
  await p.fill('#asset-form [name="host"]','192.0.2.5');
  await key(`${mod}+Enter`);
  check(await p.evaluate(()=>!document.querySelector('#modal').open&&state.assets.find(a=>a.name==='vps-new')?.host==='192.0.2.5'),'⌘Enter saves the form with the host');
  await p.evaluate(()=>document.activeElement.blur());
  await key('n');
  check(await p.evaluate(()=>document.querySelector('#modal').open&&!document.querySelector('#asset-form')),'N in the overview asks for the category first');
  await key('Escape');
  check(!(await p.evaluate(()=>document.querySelector('#modal').open)),'Esc closes the dialog');
  await p.evaluate(()=>{setView('server');document.activeElement.blur();});await key('n');
  check(await p.evaluate(()=>$('#modal').dataset.view==='capture'&&$('#modal-title').textContent==='添加服务器资产'),'N in a category view adds to it');
  await key('Escape');await p.evaluate(()=>setView('all'));
  await p.focus('#board [data-asset="s0"] .item-open');await key('e');
  check(await p.evaluate(()=>document.querySelector('#asset-form')?.dataset.id==='s0'),'E edits the focused row');
  await key('h');
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='s0').hiddenAt),'Letters inside the form are not captured');
  await key('Escape');

  check(!errors.length,'Page errors: '+errors.join(' | '));
  return 'PASS: ? overlay, / and ⌘K search, ↓ from search, list ↑/↓ through group titles with a focus ring, sidebar ←/→/↑/↓/Enter, grid arrows, Enter/Esc inspector docked with selection, ↓ carries the inspector, ⋯ and context menu by keyboard, quick actions (two max, hover/focus only, ⌘C copy, O open, none on hidden rows), F with ⌘Z/⇧⌘Z, ⌥↓ reorder, H hide and restore from 已隐藏, N/E forms with ⌘Enter and validation';
 } finally { await p.close(); }
}
