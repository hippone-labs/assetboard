// v15 shell (2026-10-15): sidebar views and counts, grouped overview without truncation, list/grid, folding, category views, search, inspector docking,
// resize without rebuilding, narrow layout, native and demo modes. Run with the browser tool's filename option; never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.waitForTimeout(300);
 const mod=process.platform==='darwin'?'Meta':'Control';
 const groups=()=>p.evaluate(()=>[...document.querySelectorAll('#board .group')].map(g=>g.dataset.group).join());
 try{
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{try{localStorage.removeItem('assetboard-view-v1');}catch{}});
  await p.reload();
  await p.evaluate(()=>{save=()=>{};const day=n=>isoDay(localDay()+n),ago=n=>new Date(Date.now()-n*36e5).toISOString(),old='2025-01-01T00:00:00Z'; // dated records added long ago, so 定期清理 has them
   const asset=(id,type,name,extra={})=>({id,type,name,provider:'Test',account:'',purpose:'',date:'',cost:'',art:'generic',url:'',source:'manual',...extra});
   const domains=Array.from({length:120},(_,i)=>asset('d'+i,'domain',`shell-${i}.test`,{updatedAt:ago(i+1),...(i===3?{date:day(-1),createdAt:old}:i===5?{date:day(10),createdAt:old}:{})}));
   const repos=Array.from({length:40},(_,i)=>asset('r'+i,'repository',`org/repo-${i}`,{source:'github',externalId:String(i),account:'org',provider:'GitHub',updatedAt:ago(i+1)}));
   state={blocks:['domain','server','repository','license'].map(id=>({id,width:50,height:null,density:'full',folded:false})),assets:[...domains,...repos,asset('s0','server','vps-a',{updatedAt:ago(1),createdAt:old,cost:'$6/月',date:day(4),dateKind:'renew',cycle:'monthly'}),asset('x0','server','old-box',{hiddenAt:'2026-01-01T00:00:00Z'})],deletedExternalIds:[]};history=[];future=[];render();});
  await settle();

  // Sidebar: two views, then the categories in board order with counts and urgency (an empty one dimmed, no 0); 已隐藏 only when something is hidden.
  const nav=await p.evaluate(()=>[...document.querySelectorAll('#sidebar .nav-item')].map(n=>`${n.dataset.id}:${n.querySelector('.nav-count')?.textContent||''}`).join());
  // 定期清理 is a Pro tool: it is listed only when the Pro scripts are loaded.
  const review=await p.evaluate(()=>proSlots.toolsNav.length>0)?'review:3,':'';
  check(nav===`upcoming:3,all:99+,panorama:,domain:99+,server:1,repository:40,license:,hidden:1,${review}export:,prefs:`,'Sidebar lists views, categories and counts (99+ cap): '+nav);
  check(await p.evaluate(()=>document.querySelector('#sidebar .nav-item[data-id="license"]').hasAttribute('data-empty')&&!document.querySelector('#sidebar .nav-item[data-id="server"]').hasAttribute('data-empty')),'An empty category steps back without a 0');
  check(await p.evaluate(()=>document.querySelector('#sidebar .nav-item[data-id="all"] .nav-count').title==='161'),'A capped count shows the real number on hover');
  check(await p.evaluate(()=>document.querySelector('#sidebar .nav-item[data-id="all"]').getAttribute('aria-current')==='page'&&document.querySelector('#sidebar .nav-item[data-id="domain"]').getAttribute('aria-label').includes('120 项')),'The current view is marked and labels carry real counts');
  check(await p.evaluate(()=>!!document.querySelector('#sidebar .nav-item[data-id="domain"] .nav-dot.overdue')&&!!document.querySelector('#sidebar .nav-item[data-id="server"] .nav-dot.soon')),'Categories with urgent dates carry a red or amber dot');

  // The overview shows everything: no truncation, no 查看全部; empty categories stay in the sidebar only.
  check(await p.locator('#board [data-asset]').count()===161&&await p.locator('#board [data-action="all"]').count()===0,'Every visible record is listed in the overview');
  check(await groups()==='domain,server,repository','Groups follow the sidebar order and skip empty categories: '+await groups());
  check(await p.evaluate(()=>document.querySelector('#view-title').textContent==='全部资产'&&/99\+ 项/.test(document.querySelector('#view-meta').textContent)&&document.querySelector('#view-meta span').title==='161 项'&&/1 已过期/.test(document.querySelector('#view-meta').textContent)),'The bar names the view and its counts');
  const cols=await p.evaluate(()=>{const xs=sel=>new Set([...document.querySelectorAll(sel)].slice(0,20).map(n=>Math.round(n.getBoundingClientRect().left)));return [xs('#board .group[data-group="domain"] .r-sub').size,new Set([...document.querySelectorAll('#board .group[data-group="domain"] .r-date')].slice(0,20).map(n=>Math.round(n.getBoundingClientRect().right))).size,xs('#board .group[data-group="domain"] .r-text').size];});
  check(cols.every(n=>n===1),'Columns line up row to row: '+cols);

  // Group headers stick under the bar while their rows scroll.
  await p.evaluate(()=>boardScroller().scrollTo(0,1600));await settle();
  const stuck=await p.evaluate(()=>{const head=document.querySelector('#board .group[data-group="domain"] .group-head'),bar=document.querySelector('#topbar').getBoundingClientRect();return {head:Math.round(head.getBoundingClientRect().top),bar:Math.round(bar.bottom),scrolled:boardScroller().scrollTop};});
  check(Math.abs(stuck.head-stuck.bar)<2,'The group header sticks under the bar: '+JSON.stringify(stuck));
  await p.evaluate(()=>boardScroller().scrollTo(0,0));

  // Folding: one click folds a group (stored on the block, undoable); ⌥-click folds every group.
  await p.click('#board .group[data-group="domain"] .group-title');await settle();
  check(await p.evaluate(()=>state.blocks.find(b=>b.id==='domain').folded&&!document.querySelector('#board .group[data-group="domain"] .group-body')&&document.querySelector('#board .group[data-group="domain"] .group-title').getAttribute('aria-expanded')==='false'),'A click folds the group');
  await p.keyboard.press(`${mod}+z`);await settle();
  check(await p.evaluate(()=>!state.blocks.find(b=>b.id==='domain').folded),'⌘Z unfolds it');
  await p.click('#board .group[data-group="server"] .group-title',{modifiers:['Alt']});await settle();
  check(await p.evaluate(()=>['domain','server','repository'].every(id=>state.blocks.find(b=>b.id===id).folded)&&document.querySelectorAll('#board .group-body').length===0),'⌥-click folds every group');
  await p.click('#board .group[data-group="server"] .group-title',{modifiers:['Alt']});await settle();
  check(await p.evaluate(()=>document.querySelectorAll('#board .group-body').length===3),'⌥-click again unfolds them all');

  // List/grid toggle and the chosen view survive a reload (a per-viewer convenience, not part of the board).
  await p.click('#layout-toggle [data-id="grid"]');await p.click('#sidebar .nav-item[data-id="repository"]');await settle();
  check(await p.evaluate(()=>document.querySelector('#view-title').textContent==='代码仓库'&&document.querySelectorAll('#board .gcard').length===40&&!document.querySelector('#board .group-head')),'A category view lists only its records, without a group header');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).layout==='grid'&&!('view' in state)&&!('layout' in state)),'The view is kept per viewer, outside the board');
  const kept=await p.evaluate(()=>JSON.stringify(state));
  await p.reload();await p.evaluate(kept=>{save=()=>{};state=JSON.parse(kept);render();},kept);await settle();
  check(await p.evaluate(()=>currentView()==='repository'&&layoutMode==='grid'&&!!document.querySelector('#sidebar .nav-item[data-id="repository"].active')),'View and layout come back after a reload');
  await p.click('#layout-toggle [data-id="list"]');

  // + in a category view opens the capture panel for that category; 手动填写 opens its form.
  await p.click('#add-block');check(await p.evaluate(()=>$('#modal').dataset.view==='capture'&&$('#modal-title').textContent==='添加代码仓库资产'),'+ in a category view offers 识别 for that category');
  await p.click('#capture [data-action="capture-manual"]');check(await p.evaluate(()=>document.querySelector('#asset-form')?.dataset.type==='repository'),'手动填写 opens the category form');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});
  // An empty category: one line and one action; the ⋯ can remove it, but never a category that holds records.
  await p.click('#sidebar .nav-item[data-id="license"]');await settle();
  check(await p.evaluate(()=>{const e=document.querySelector('#board .view-empty');return !!e&&/还没有软件授权/.test(e.textContent)&&e.querySelectorAll('button').length===1;}),'An empty category shows one line and one action');
  await p.click('#view-menu');check(await p.locator('#modal [data-action="remove-block"]').count()===1,'An empty category can leave the sidebar');
  await p.click('#modal [data-action="remove-block"]');await settle();
  check(await p.evaluate(()=>!state.blocks.some(b=>b.id==='license')&&currentView()==='all'&&!document.querySelector('#sidebar [data-id="license"]')),'Removing it returns to the overview');
  await p.click('#sidebar .nav-item[data-id="server"]');await p.click('#view-menu');
  check(await p.locator('#modal [data-action="remove-block"]').count()===0,'A category with records cannot be removed');
  await p.evaluate(()=>$('#modal').close());
  await p.click('#sidebar .nav-item[data-id="all"]');await settle();

  // Search: results grouped by category, hidden matches last; picking a sidebar view clears the search.
  await p.fill('#search','o');await settle();
  check(await p.evaluate(()=>document.querySelector('#view-title').textContent==='搜索'&&[...document.querySelectorAll('#board .group')].map(g=>g.dataset.group).join()==='repository,hidden'&&!!document.querySelector('#board .group[data-group="hidden"] [data-asset="x0"] [data-action="restore-asset"]')),'Search groups results by category with hidden matches last: '+await groups());
  check(await p.evaluate(()=>!document.querySelector('#sidebar .nav-item.active')),'No sidebar view is marked while searching');
  await p.click('#sidebar .nav-item[data-id="upcoming"]');await settle();
  check((await p.inputValue('#search'))===''&&await p.evaluate(()=>currentView()==='upcoming'),'A sidebar view clears the search');
  check(await p.evaluate(()=>[...document.querySelectorAll('#board .group')].map(g=>g.dataset.group).join()==='overdue,week,month'),'即将到来 bands: '+await groups());
  check(await p.evaluate(()=>{const r=document.querySelector('#board [data-asset="s0"]');return /服务器/.test(r.querySelector('.r-sub').textContent)&&r.querySelector('.r-cost').textContent==='$6/月';}),'即将到来 rows name their category and cost');
  await p.click('#sidebar .nav-item[data-id="all"]');await settle();

  // Inspector: docked inside the card beside the list, at every desktop width (it narrows: 380, 340 below 1280, 320 below 1100).
  const boardNode=await p.evaluate(()=>{window.__firstRow=document.querySelector('#board [data-asset]');return document.querySelector('#board').dataset.size;});
  check(boardNode==='l','A wide main area lays rows out in one line');
  await p.click('#board [data-asset="d0"] .item-open');await settle();
  const docked=()=>p.evaluate(()=>{const m=document.querySelector('#main').getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect(),d=document.querySelector('#detail').getBoundingClientRect();return b.right<=d.left+1&&Math.abs(d.right-m.right)<1&&d.top>m.top&&getComputedStyle(document.querySelector('#detail')).boxShadow!=='none';});
  check(await docked(),'The inspector docks beside the list, inside the card');
  await p.setViewportSize({width:1100,height:800});await settle();
  check(await docked()&&await p.evaluate(()=>Math.round(document.querySelector('#detail').getBoundingClientRect().width))===340,'At 1100 px it stays docked, narrower');
  check(await p.evaluate(()=>window.__firstRow===document.querySelector('#board [data-asset]')),'Resizing keeps the rows (no rebuild)');
  await p.keyboard.press('Escape');await settle();
  await p.setViewportSize({width:900,height:800});await settle();
  check(await p.evaluate(()=>document.querySelector('#board').dataset.size==='m'&&window.__firstRow===document.querySelector('#board [data-asset]')),'A narrower main area switches the row layout by class, keeping the DOM');
  check(await p.evaluate(()=>{const r=document.querySelector('#board [data-asset="d0"]'),n=r.querySelector('.r-text').getBoundingClientRect(),s=r.querySelector('.r-sub').getBoundingClientRect();return s.top>=n.bottom-1;}),'Name and source stack on a narrow main area');

  // Phone width: the sidebar becomes a strip of pills, nothing overflows sideways, rows keep their date.
  await p.setViewportSize({width:390,height:844});await settle();
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at 390px');
  check(await p.evaluate(()=>{const s=document.querySelector('#sidebar').getBoundingClientRect(),m=document.querySelector('#main').getBoundingClientRect();return s.height<60&&m.top>=s.bottom-1&&m.left===0;}),'The sidebar turns into a strip above the content');
  check(await p.evaluate(()=>{const r=document.querySelector('#board [data-asset="d3"]').getBoundingClientRect(),d=document.querySelector('#board [data-asset="d3"] .r-date').getBoundingClientRect();return d.width>20&&d.right<=r.right+1;}),'Dates stay visible inside the row');
  await p.setViewportSize({width:1440,height:900});await settle();

  // Reduced motion: folding and moving do not animate.
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.click('#board .group[data-group="domain"] .group-title');
  check(await p.evaluate(()=>document.getAnimations().length===0),'Reduced motion: no fold animation');
  await p.click('#board .group[data-group="domain"] .group-title');await p.emulateMedia({reducedMotion:'no-preference'});

  // Welcome: no records, the sidebar still frames the page.
  await p.evaluate(()=>{state={blocks:[],assets:[],deletedExternalIds:[]};render();});
  check(await p.evaluate(()=>!document.querySelector('#welcome').hidden&&document.querySelector('#board').hidden&&[...document.querySelectorAll('#sidebar .nav-item')].map(n=>n.dataset.id).join()==='upcoming,all,prefs'&&document.querySelector('#layout-toggle').hidden),'With no records the welcome shows beside the two views and 设置');
  // Sidebar labels cut their end with an ellipsis, never the bottom of their letters: the label's box holds the whole line.
  const cut=await p.evaluate(()=>[...document.querySelectorAll('#sidebar .nav-label')].filter(l=>l.getClientRects().length).filter(l=>{const r=document.createRange();r.selectNodeContents(l);const t=r.getBoundingClientRect(),b=l.getBoundingClientRect();return t.bottom>b.bottom+0.5||t.top<b.top-0.5;}).map(l=>l.textContent));
  check(!cut.length,'Sidebar labels keep their descenders: '+cut.join());
  check(!errors.length,'No page errors: '+errors.join());
  await context.close();

  // Mac app: no system toolbar; the page's top bar has search and the window-wide tools, the card's bar the view's; demo mode never saves.
  const native=await page.context().browser().newContext({viewport:{width:1280,height:800}});const n=await native.newPage();const nerr=[];n.on('pageerror',e=>nerr.push(e.message));
  await n.addInitScript(()=>{window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m.action);}}}};window.__ASSETBOARD_NATIVE__={demo:true,data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false};});
  await n.goto('http://127.0.0.1:4317/');await n.waitForTimeout(300);
  check(await n.evaluate(()=>{const shown=sel=>{const el=document.querySelector(sel);return !!el&&!el.hidden&&el.getClientRects().length>0;};
   return shown('#topnav #search')&&shown('#topnav #inbox-button')&&shown('#topbar .toolbar #add-block')&&shown('#topbar .toolbar #import-button')&&!document.querySelector('#layout-toggle').hidden&&!!document.querySelector('#topbar .demo-badge');}),
   'Native: search and window tools in the top bar; title, switch, actions and demo badge in the card\'s bar');
  check(await n.evaluate(()=>{const head=document.querySelector('#board .group-head');return parseFloat(getComputedStyle(head).top)===0&&boardScroller()===document.querySelector('#board');}),'Native: the board scrolls under the card\'s bar and group headers stick at its top');
  await n.click('#board .group .group-title');await n.click('#layout-toggle [data-id="grid"]');await n.waitForTimeout(200);
  check(await n.evaluate(()=>!window.__sent.includes('save')),'Demo mode never saves');
  check(!nerr.length,'No native page errors: '+nerr.join());
  await native.close();
  return 'PASS: sidebar views, counts, dots and 99+, overview without truncation, aligned columns, sticky group headers, fold with ⌥ and undo, list/grid and view kept per viewer, category views with + and empty state, remove only empty categories, grouped search with hidden last, 即将到来 bands, inspector docked/overlay, resize without rebuild, stacked rows, 390px strip, reduced motion, welcome, native bar, demo never saves';
 }finally{await context.close().catch(()=>{});}
}
