// Run with the browser tool's filename option. Uses an isolated page; saves only to its own localStorage.
// Tile wall (board-wall.js): the default 全部资产, three columns at the usual window widths (two, then one, on a narrower window; a
// fourth on a very wide one). A tile is a fixed structure: one line in 全局, two in 标准 (the fields in columns that line up down a
// panel, the price at the right end), a line per fact in 详细; every tile of a density is as tall as the others, and a text too
// long for its place is cut on its line (a domain, an address or a long identifier in the middle) with the whole of it in its title
// and the peek, the day count, state and price never cut. Panels move by drag and ⌥ + arrows and keep their order after a reload;
// rows keep the list's ⌥↑↓ and click; three densities by ⌘−/⌘= and the switch, kept on this device, the line at the top of the view
// staying put; the peek and 详细 list the facts (masked in privacy mode); the skin is a setting that keeps the columns, the order and the tiles. AI plans
// show their readings and 待引入 is a line under the wall.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 // the wall repacks for a new width in a ResizeObserver: after a change, wait until it is packed for the width it has (up to 3 s on
 // a slow machine)
 const settle=async()=>{await p.waitForTimeout(120);
  await p.waitForFunction(()=>{const w=document.querySelector('#board .wall');return !w||!wallHold&&Math.abs(wallWidth-w.clientWidth)<=.5;},null,{timeout:3000,polling:50}).catch(()=>{});};
 try {
  await p.setViewportSize({width:1500,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{localStorage.clear();const day=o=>isoDay(localDay()+o);
   const board={blocks:[{id:'domain'},{id:'server'},{id:'repository'},{id:'license'}],assets:[
    {id:'d1',type:'domain',name:'soon.example.com',provider:'Cloudflare',account:'ops@example.com',date:day(12),dateKind:'expire',cycle:'yearly',cost:'$12 / 年',source:'manual',notes:'keep'},
    {id:'d2',type:'domain',name:'a-very-long-domain-name-that-does-not-fit-in-a-panel.example.net',provider:'Cloudflare',date:day(-3),dateKind:'expire',source:'manual'},
    {id:'d3',type:'domain',name:'third.example.org',provider:'Namecheap',date:day(200),dateKind:'expire',source:'manual'},
    {id:'s1',type:'server',name:'edge-vps',provider:'Host',ips:['203.0.113.10'],host:'203.0.113.10',date:day(5),dateKind:'renew',cycle:'monthly',cost:'$6 / 月',source:'manual'},
    {id:'r1',type:'repository',name:'atlas-ui',provider:'GitHub',source:'manual'},
    {id:'s2',type:'server',name:'production-kubernetes-worker-node-pool-b-eu-central-1a-replica-set-0042',provider:'A Hosting Company With A Long Name',ips:['2001:0db8:85a3:0000:0000:8a2e:0370:7334'],date:day(40),dateKind:'renew',cycle:'monthly',cost:'€49.90 / 月',source:'manual',notes:'A note long enough that it does not fit on one line of a tile in any of the usual window widths, so it is cut there.'},
    {id:'n1',type:'server',name:'bare-box',cost:'$3 / 月',source:'manual'},
    {id:'n2',type:'server',name:'一台名字很长很长很长很长很长很长很长很长很长很长很长很长的服务器',source:'manual'},
    {id:'h1',type:'domain',name:'gone.example.org',provider:'Registrar',hiddenAt:'2026-01-01T00:00:00Z',source:'manual'}
   ],deletedExternalIds:[]};
   localStorage.setItem(key,JSON.stringify(board));});
  await p.reload();await settle();
  const panels=()=>p.locator('#board .wall > .group').evaluateAll(els=>els.map(e=>e.dataset.group).join(','));

  // The default: the wall, in columns; every live record once; a click opens the inspector.
  check(await p.evaluate(()=>layoutMode==='wall'&&!!document.querySelector('#board .wall')&&+document.querySelector('#board .wall').dataset.cols>1),'A wide window opens 全部资产 as the wall, in columns');
  check(await p.locator('#layout-toggle [data-id="wall"][aria-pressed="true"]').count()===1&&await p.locator('#density-toggle:not([hidden]) [data-action="density"]').count()===3,'The layout switch marks the wall; the density switch is shown');
  const ids=await p.locator('#board .wall [data-asset]').evaluateAll(els=>els.map(e=>e.dataset.asset).sort().join(','));
  check(ids==='d1,d2,d3,n1,n2,r1,s1,s2','Every live record once, the hidden one left out: '+ids);
  check(await panels()==='domain,server,repository','A panel per category with records, in category order: '+await panels());
  check(await p.locator('#board .wall-empty [data-action="add-asset"][data-id="license"]').count()===1,'An empty category is a quiet line that adds to it');
  check(await p.locator('#board .group[data-group="repository"] .g-cost').count()===0,'A one-record panel leaves out the monthly sum');
  // A name too long for its line is cut on it: a domain in the middle, its registered name kept; a name in words at its end. The
  // whole name is the element's text and its title, and the day count beside it is whole.
  const long=await p.evaluate(()=>{const of=id=>{const row=document.querySelector(`#board [data-asset="${id}"]`),e=row.querySelector('.r-text'),full=e.querySelector('.w-full')||e,date=row.querySelector('.r-date');
   return {text:e.textContent,title:e.title,mid:e.classList.contains('w-mid'),head:e.dataset.head||'',tail:e.dataset.tail||'',cut:full.scrollWidth>full.clientWidth+1,oneLine:e.offsetHeight<=20,inside:e.getBoundingClientRect().right<=row.getBoundingClientRect().right,tailWhole:!e.dataset.tail||getComputedStyle(e,'::after').width!=='auto'&&e.getBoundingClientRect().width>=parseFloat(getComputedStyle(e,'::after').width),dateWhole:!date||date.scrollWidth<=date.clientWidth+1};};
   return {d2:of('d2'),n2:of('n2'),s2:of('s2'),d1:of('d1')};});
  const d2name='a-very-long-domain-name-that-does-not-fit-in-a-panel.example.net';
  check(long.d2.text===d2name&&long.d2.title===d2name&&long.d2.cut&&long.d2.oneLine&&long.d2.inside&&long.d2.dateWhole,'A long name stays on one line inside its panel, cut, the whole of it its text and title, the day count whole: '+JSON.stringify(long.d2));
  check(long.d2.mid&&long.d2.head==='a-very-long-domain-name-that-does-not-fit-in-a-panel'&&long.d2.tail==='.example.net'&&long.d2.tailWhole,'A long domain is cut in the middle and keeps its registered name: '+JSON.stringify(long.d2));
  check(long.s2.mid&&long.s2.tail==='t-0042'&&long.s2.cut&&long.s2.oneLine,'A long identifier is cut in the middle and keeps its end: '+JSON.stringify(long.s2));
  check(!long.n2.mid&&long.n2.cut&&long.n2.oneLine&&long.n2.inside&&/很长/.test(long.n2.title),'A long name in words is cut at its end: '+JSON.stringify(long.n2));
  check(long.d1.mid&&!long.d1.cut&&long.d1.text==='soon.example.com','A name that fits is whole: '+JSON.stringify(long.d1));
  const overlap=await p.evaluate(()=>{const r=[...document.querySelectorAll('#board .wall > .group')].map(n=>n.getBoundingClientRect());return r.some((a,i)=>r.some((b,j)=>i<j&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));});
  check(!overlap,'Panels never overlap');
  await p.locator('#board [data-asset="d1"] .item-open').click();
  check(await p.evaluate(()=>activeAsset==='d1'&&!$('#detail').hidden),'A line opens the inspector');
  await p.evaluate(()=>closeDetail());

  // Narrow: one column.
  await p.setViewportSize({width:560,height:900});await settle();
  check(await p.evaluate(()=>document.querySelector('#board .wall').dataset.cols==='1'),'A narrow window gets one column');
  await p.setViewportSize({width:1500,height:900});await settle();

  // Three columns are the wall in every density. Every tile of a density is as tall as the others (详细: a line per fact, so as
  // tall as its facts are many); nothing wraps or leaves its panel, and the day count, the state and the price are whole.
  const shown=()=>p.evaluate(()=>{const wall=document.querySelector('#board .wall'),seen=e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length,cut=e=>e.scrollWidth>e.clientWidth+1;
   const keyCut=[...wall.querySelectorAll('.r-date,.r-cost,.g-cost,.g-count')].filter(e=>seen(e)&&cut(e)).map(e=>e.className+':'+e.textContent.slice(0,24));
   const out=[...wall.querySelectorAll('.r-line>*,.r-fields .f,.r-facts,.live-line,.group-head>*')].filter(e=>seen(e)&&e.getBoundingClientRect().right>e.closest('.group').getBoundingClientRect().right+.5).map(e=>e.className);
   const tall=[...wall.querySelectorAll('.r-line,.r-fields .f,.fact-k,.fact-v:not(.fact-lines)')].filter(e=>seen(e)&&e.offsetHeight>19).map(e=>e.className+':'+e.textContent.slice(0,24));
   const rows=[...wall.querySelectorAll('.row')],facts=r=>r.querySelectorAll('.fact-k').length+r.querySelectorAll('.fact-k.gap').length*.5;
   const heights=[...new Set(rows.map(r=>r.offsetHeight))],perFact=[...new Set(rows.map(r=>r.offsetHeight+'/'+facts(r)))].length===[...new Set(rows.map(facts))].length;
   return {cols:+wall.dataset.cols,width:Math.round(parseFloat(wall.firstElementChild.style.width)),keyCut,out,tall,heights,perFact,heads:[...new Set([...wall.querySelectorAll('.group-head')].map(e=>e.offsetHeight))]};});
  for(const width of [1280,1440,1728]){
   await p.setViewportSize({width,height:900});await settle();
   for(const id of ['glance','standard','detail']){
    await p.evaluate(id=>setDensity(id),id);await settle();
    const got=await shown();
    check(got.cols===3&&got.width>=280&&!got.keyCut.length&&!got.out.length&&!got.tall.length,`${width} wide, ${id}: three columns, every line one line inside its panel, the day counts and prices whole: `+JSON.stringify(got));
    check(got.heads.length===1&&(id==='detail'?got.perFact:got.heights.length===1),`${width} wide, ${id}: every tile is as tall as the others${id==='detail'?' with as many facts':''}, every panel head too: `+JSON.stringify(got));
   }
  }
  await p.evaluate(()=>setDensity('standard'));await settle();
  // 标准: the day count beside the name; under them the fields in columns that start at the same place in every tile of a panel, and
  // the price at the right end. A field the record has nothing for is left empty, the others keep their columns.
  const lines=await p.evaluate(()=>{const q=(id,sel)=>document.querySelector(`#board [data-asset="${id}"] ${sel}`),box=(id,sel)=>q(id,sel)?.getBoundingClientRect(),near=(a,b)=>Math.abs(a-b)<1.5;
   return {ip:q('s1','.f-1').textContent,platform:q('s1','.f-2').textContent,first:near(box('s1','.r-date').top+box('s1','.r-date').height/2,box('s1','.r-name').top+box('s1','.r-name').height/2),second:box('s1','.f-1').top>box('s1','.r-name').top+10&&Math.abs(box('s1','.r-cost').top-box('s1','.f-1').top)<3,
    edge:near(box('s1','.r-cost').right,box('s1','.r-line').right)&&near(box('s2','.r-cost').right,box('s2','.r-line').right)&&near(box('n1','.r-cost').right,box('n1','.r-line').right),
    columns:near(box('s1','.f-1').left,box('s2','.f-1').left)&&near(box('s1','.f-2').left,box('s2','.f-2').left)&&near(box('d1','.f-2').left,box('s1','.f-2').left-box('s1','.f-1').left+box('d1','.f-1').left),
    s2:{ip:q('s2','.f-1 .ip-text').title,mid:q('s2','.f-1 .ip-text').classList.contains('w-mid'),platform:q('s2','.f-2 .w-text').title,cost:q('s2','.r-cost').textContent,costWhole:q('s2','.r-cost').scrollWidth<=q('s2','.r-cost').clientWidth+1},
    bare:!q('n1','.f')&&!!q('n1','.r-fields'),same:q('n1','').offsetHeight===q('s1','').offsetHeight&&q('n2','').offsetHeight===q('s1','').offsetHeight,
    d3:!q('d3','.f-2')&&near(box('d3','.f-1').left,box('d1','.f-1').left),account:q('d1','.f-2').textContent};});
  check(/203\.0\.113\.10/.test(lines.ip)&&lines.platform==='Host'&&lines.first&&lines.second&&lines.edge,'标准: the day count beside the name, the IP and the platform under them, the price at the right end of the tile: '+JSON.stringify(lines));
  check(lines.columns&&lines.d3&&lines.account==='ops@example.com','The fields are columns: each starts at the same place in every tile of a panel, with or without its neighbour: '+JSON.stringify(lines));
  check(/7334$/.test(lines.s2.ip)&&lines.s2.mid&&lines.s2.platform==='A Hosting Company With A Long Name'&&/49\.90/.test(lines.s2.cost)&&lines.s2.costWhole,'A long address and a long platform are cut in their columns, whole in their titles; the price is whole: '+JSON.stringify(lines.s2));
  check(lines.bare&&lines.same,'A record with nothing for the fields is as tall as the others: '+JSON.stringify(lines));
  // The window decides the columns: two when three do not fit, a fourth only when three would be wider than a tile reads well.
  for(const [width,cols] of [[1040,2],[2400,4]]){
   await p.setViewportSize({width,height:900});await settle();
   const got=await shown();
   check(got.cols===cols&&!got.keyCut.length&&!got.out.length&&!got.tall.length&&got.heights.length===1,`${width} wide: ${cols} columns, the tiles the same: `+JSON.stringify(got));
  }
  await p.setViewportSize({width:1500,height:900});await settle();

  // A panel moves with ⌥ + arrows on its title, and keeps the place after a reload (saved with the board).
  await p.locator('#board .group-title[data-id="domain"]').focus();
  await p.keyboard.press('Alt+ArrowRight');await settle();
  check(await panels()==='server,domain,repository','⌥→ moves a panel one place: '+await panels());
  check(await p.evaluate(()=>document.activeElement?.dataset.id==='domain'),'The moved panel keeps the focus');
  check(await p.evaluate(()=>state.blocks.map(b=>b.id).join(','))==='server,domain,repository,license','The sidebar order is the same order');
  // Dragging a panel by its header: picked up, its place a slot, dropped where the pointer is.
  const head=await p.locator('#board .group[data-group="repository"] .group-head').boundingBox(),to=await p.locator('#board .group[data-group="server"]').boundingBox();
  await p.evaluate(()=>{window.__trace=[];const ps=window.placeSlot,ms=window.moveSlot,order=g=>[...g.container.children].map(n=>n===g.slot?'SLOT':n.dataset.group||'').filter(Boolean).join(',');
   window.placeSlot=function(g){window.__trace.push(`place t=${Math.round(performance.now())} x=${Math.round(g.x)} y=${Math.round(g.y)} lock=${Math.round((g.lockUntil||0)-performance.now())} still=${g.still?Math.round(g.still.x)+','+Math.round(g.still.y):''} slot=${g.slotRect?Math.round(g.slotRect.left)+'-'+Math.round(g.slotRect.right):''} ${order(g)}`);return ps(g);};
   window.moveSlot=function(g,mode,ref){const r=ms(g,mode,ref);window.__trace.push(`  move ${mode} ${ref?.dataset?.group||''} -> ${order(g)}`);return r;};});
  await p.mouse.move(head.x+head.width*.5,head.y+head.height/2);await p.mouse.down();
  await p.mouse.move(head.x+head.width*.5-20,head.y+head.height/2+10,{steps:4});
  check(await p.locator('#board .wall > .group.is-dragging').count()===1&&await p.locator('#board .wall > .drop-slot').count()===1,'A dragged panel is lifted and leaves a slot');
  await p.mouse.move(to.x+to.width*.3,to.y+20,{steps:12});await p.waitForTimeout(150);
  // a slow machine takes the pointer's moves late: release once the slot is under the pointer, up to 2 s
  await p.waitForFunction(([x,y])=>{const r=document.querySelector('#board .wall > .drop-slot')?.getBoundingClientRect();return r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;},[to.x+to.width*.3,to.y+20],{timeout:2000,polling:50}).catch(()=>{});
  await p.mouse.up();await p.waitForTimeout(400);
  check(await panels()==='repository,server,domain','A dropped panel takes the place under the pointer: '+await panels()+` (pointer ${Math.round(to.x+to.width*.3)},${Math.round(to.y+20)})\n`+(await p.evaluate(()=>window.__trace.join('\n'))));
  await p.reload();await settle();
  check(await panels()==='repository,server,domain','The panel order is kept after a reload: '+await panels());

  // Rows: ⌥↓ moves a line within its panel, as in the list.
  await p.locator('#board [data-asset="d1"] .item-open').focus();
  await p.keyboard.press('Alt+ArrowDown');await settle();
  const rows=await p.locator('#board .group[data-group="domain"] [data-asset]').evaluateAll(els=>els.map(e=>e.dataset.asset).join(','));
  check(rows.indexOf('d1')>0,'⌥↓ moves a line down within its panel: '+rows);
  check(await p.evaluate(()=>document.activeElement?.closest('[data-asset]')?.dataset.asset==='d1'),'The moved line keeps the focus');

  // Densities: ⌘= and ⌘−, and the switch; kept on this device.
  const density=()=>p.evaluate(()=>document.querySelector('#board .wall').dataset.density);
  check(await density()==='standard','The wall starts at 标准');
  await p.locator('#board .group-title').first().focus();
  await p.keyboard.press('Control+Equal');await settle();
  check(await density()==='detail'&&await p.locator('#board .r-facts').count()===7,'⌘= opens 详细: every line with a fact lists its facts');
  const facts=await p.locator('#board [data-asset="d1"] .r-facts').innerText();
  check(/Cloudflare/.test(facts)&&/ops@example\.com/.test(facts)&&/keep/.test(facts)&&!/本机目录|DNS 托管|备案/.test(facts),'详细 lists the known facts and leaves the empty ones out: '+facts);
  const note=await p.locator('#board [data-asset="s2"] .r-facts .fact-v').last().evaluate(e=>({cut:e.scrollWidth>e.clientWidth+1,oneLine:e.offsetHeight<=17,title:e.title}));
  check(note.cut&&note.oneLine&&/so it is cut there\.$/.test(note.title),'A long fact is one line in 详细, cut, whole in its title: '+JSON.stringify(note));
  const keys=await p.evaluate(()=>[...new Set([...document.querySelectorAll('#board .group[data-group="server"] .fact-v')].map(e=>Math.round(e.getBoundingClientRect().left)))]);
  check(keys.length===1,'The facts\' values start at one place down a panel: '+keys);
  await p.keyboard.press('Control+Minus');await p.keyboard.press('Control+Minus');await settle();
  check(await density()==='glance'&&!(await p.locator('#board .r-facts').count())&&!(await p.locator('#board .wall .row :is(.r-cost,.r-fields)').count()),'⌘− twice reaches 全局: no price, no facts');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).density==='glance'),'The density is kept in the view preferences');
  await p.reload();await settle();
  check(await density()==='glance','The density is kept after a reload');
  await p.locator('#density-toggle [data-id="standard"]').click();await settle();
  check(await density()==='standard'&&await p.locator('#density-toggle [data-id="standard"][aria-checked="true"]').count()===1,'The switch sets a density');
  // The line at the top of the view stays where it was when the density changes.
  await p.setViewportSize({width:1500,height:420});await settle();
  await p.evaluate(()=>boardScroller().scrollTo(0,170));await settle();
  const before=await p.evaluate(()=>{const top=document.querySelector('#topbar').getBoundingClientRect().bottom,el=[...document.querySelectorAll('#board .wall [data-asset]')].find(n=>n.getBoundingClientRect().top>=top-1);return {id:el.dataset.asset,y:el.getBoundingClientRect().top};});
  await p.evaluate(()=>setDensity('detail'));await settle();
  const after=await p.evaluate(id=>document.querySelector(`#board .wall [data-asset="${id}"]`).getBoundingClientRect().top,before.id);
  check(Math.abs(after-before.y)<3,'Changing the density keeps the top line in place: '+JSON.stringify({before,after}));
  await p.evaluate(()=>{setDensity('standard');boardScroller().scrollTo(0,0);});await p.setViewportSize({width:1500,height:900});await settle();

  // The peek: the facts of a line beside its panel, after a rest of the pointer; gone on a press.
  await p.locator('#board [data-asset="s1"] .r-name').hover();await p.waitForTimeout(650);
  check(await p.locator('#wall-peek:not([hidden])').count()===1&&/203\.0\.113\.10/.test(await p.locator('#wall-peek').innerText()),'Resting on a line shows its facts in the peek');
  await p.mouse.move(5,5);await p.mouse.down();await p.mouse.up();
  await p.locator('#board [data-asset="s2"] .r-name').hover();await p.waitForTimeout(650);
  const peek=await p.locator('#wall-peek').innerText();
  check(/production-kubernetes-worker-node-pool-b-eu-central-1a-replica-set-0042/.test(peek)&&/A Hosting Company With A Long Name/.test(peek)&&/so it is cut there\./.test(peek)&&await p.locator('#wall-peek').evaluate(e=>![...e.querySelectorAll('*')].some(n=>n.scrollWidth>n.clientWidth+1)),'The peek has the whole of what a tile cuts: '+peek);
  await p.mouse.move(5,5);await p.mouse.down();await p.mouse.up();
  check(await p.locator('#wall-peek[hidden]').count()===1,'The peek goes on a press');
  // Privacy mode masks the facts too.
  await p.evaluate(()=>{setPrivacy(true);setDensity('detail');});await settle();
  const masked=await p.locator('#board [data-asset="s1"] .r-facts').innerText();
  check(!/203\.0\.113\.10/.test(masked),'Privacy mode masks an IP in the facts: '+masked);
  await p.evaluate(()=>{setPrivacy(false);setDensity('standard');});

  // The skin: a setting that changes how panels look and how they are placed (冰箱贴 freely, board-free.playwright.js), never the
  // columns, the order or the tiles.
  const boxes=()=>p.locator('#board .wall > .group').evaluateAll(els=>{const xs=[...new Set(els.map(e=>Math.round(parseFloat(e.style.left))))].sort((a,b)=>a-b);return els.map(e=>[e.dataset.group,xs.indexOf(Math.round(parseFloat(e.style.left))),e.querySelectorAll('[data-asset]').length].join()).join('|');});
  const quietBoxes=await boxes();
  await p.evaluate(()=>prefsDialog());await settle();
  await p.locator('#modal [data-action="prefs-section"][data-id="look"]').click();await settle();
  check(await p.locator('#modal [data-action="prefs-theme"]').isVisible()&&await p.locator('#modal [data-action="prefs-density"][data-id="standard"][aria-checked="true"]').isVisible(),'外观 holds the theme, the skin and the density together');
  await p.locator('#modal [data-action="prefs-skin"][data-id="magnet"]').click();await settle();
  check(await p.evaluate(()=>document.documentElement.dataset.skin==='magnet'&&localStorage.getItem('assetboard-skin-v1')==='magnet'),'设置 › 外观 sets the 冰箱贴 skin, kept on this device');
  await p.evaluate(()=>$('#modal').close());await settle();
  check(await boxes()===quietBoxes,'A skin keeps the columns, the order and the tiles: '+await boxes()+' vs '+quietBoxes);
  check(await p.locator('#board .wall.free').count()===1,'冰箱贴 places the panels freely');
  check(await p.locator('#board .wall > .group').first().evaluate(e=>getComputedStyle(e).rotate!=='none'&&getComputedStyle(e).rotate!=='0deg'||e.style.getPropertyValue('--tilt')==='0.00'),'冰箱贴 tilts the panels a little');
  await p.evaluate(()=>setSkin('quiet'));

  // The list is a choice in the layout switch, kept; a search, another view and the hidden pile are never the wall.
  await p.locator('#layout-toggle [data-id="list"]').click();await settle();
  check(!(await p.locator('#board .wall').count())&&await p.locator('#board .group-body.list .row').count()===8,'The layout switch goes back to the list');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).board==='list'),'The list is kept as the choice');
  await p.locator('#layout-toggle [data-id="wall"]').click();await settle();
  await p.evaluate(()=>setView('domain'));await settle();
  check(!(await p.locator('#board .wall').count())&&await p.locator('#layout-toggle [data-id="wall"]').isHidden()&&await p.locator('#density-toggle').isHidden(),'A category view is a list, without the wall in the switch');
  await p.evaluate(()=>{setView('all');$('#search').value='soon';$('#search').dispatchEvent(new Event('input',{bubbles:true}));});await settle();
  check(!(await p.locator('#board .wall').count()),'A search is a list');

  // The demo on the wall: an AI plan's line carries its reading, 详细 and the peek its limits and period use; what a connected
  // platform read and the board does not hold yet is a quiet 待引入 line that opens the pick.
  await p.goto('http://127.0.0.1:4317/?demo');await settle();
  await p.evaluate(()=>{setView('all');setLayout('wall');state.connectPending={cloudflare:{at:new Date().toISOString(),items:[{id:'x',type:'domain',name:'x.example.com',source:'cloudflare'}]}};setDensity('standard');render();});await settle();
  const quota=await p.locator('#board .wall [data-asset="demo-a2"] .ai-quota').evaluate(e=>({text:e.textContent,said:e.title,field:!!e.closest('.f-2'),pct:e.querySelector('.aq-pct').scrollWidth<=e.querySelector('.aq-pct').clientWidth+1,same:e.closest('.row').offsetHeight===document.querySelector('#board .wall [data-asset="demo-a1"]').offsetHeight}));
  check(/88%本周/.test(quota.text)&&/本周 88%/.test(quota.said)&&quota.field&&quota.pct&&quota.same,'An AI plan on the wall shows its reading as a field of its tile, the share whole, the tile as tall as the others: '+JSON.stringify(quota));
  await p.evaluate(()=>setDensity('detail'));await settle();
  const ai=await p.locator('#board .wall [data-asset="demo-a2"] .r-facts').innerText();
  check(/额度/.test(ai)&&/本周 88%/.test(ai)&&/本期用量/.test(ai),'详细 lists an AI plan\'s limits and period use: '+ai);
  check(await p.locator('#board .wall-pending [data-action="connect-pending"][data-id="cloudflare"]').count()===1,'待引入 is a quiet line under the wall');
  await p.locator('#board .wall-pending [data-action="connect-pending"]').click();await settle();
  check(await p.locator('#modal .connect-pick').count()===1,'待引入 under the wall opens the pick');
  await p.evaluate(()=>{$('#modal').close();setDensity('standard');});
  if(errors.length)throw new Error(errors.join(' | '));
  return 'PASS: tile wall default, three columns of tiles of one height at 1280/1440/1728 in every density, long texts cut on their line and whole in the title and the peek, fields in columns, narrow single column, panel moves kept, row moves, densities kept and anchored, peek, privacy, skin, AI readings, 待引入';
 } finally { await p.close(); }
}
