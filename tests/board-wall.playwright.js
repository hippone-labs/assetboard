// Run with the browser tool's filename option. Uses an isolated page; saves only to its own localStorage.
// Tile wall (board-wall.js): the default 全部资产, three columns at the usual window widths (two, then one, on a narrower window; a
// fourth on a very wide one), a tile of one to three lines with nothing cut in any density; panels move by drag and ⌥ + arrows
// and keep their order after a reload; rows keep the list's ⌥↑↓ and click; three densities by ⌘−/⌘= and the switch, kept on this
// device, the line at the top of the view staying put; the peek and 详细 list the facts (masked in privacy mode); the skin is a
// setting that changes no layout. AI plans show their readings and 待引入 is a line under the wall.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const settle=()=>p.waitForTimeout(120);
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
    {id:'n1',type:'server',name:'bare-box',cost:'$3 / 月',source:'manual'},
    {id:'h1',type:'domain',name:'gone.example.org',provider:'Registrar',hiddenAt:'2026-01-01T00:00:00Z',source:'manual'}
   ],deletedExternalIds:[]};
   localStorage.setItem(key,JSON.stringify(board));});
  await p.reload();await settle();
  const panels=()=>p.locator('#board .wall > .group').evaluateAll(els=>els.map(e=>e.dataset.group).join(','));

  // The default: the wall, in columns; every live record once; a click opens the inspector.
  check(await p.evaluate(()=>layoutMode==='wall'&&!!document.querySelector('#board .wall')&&+document.querySelector('#board .wall').dataset.cols>1),'A wide window opens 全部资产 as the wall, in columns');
  check(await p.locator('#layout-toggle [data-id="wall"][aria-pressed="true"]').count()===1&&await p.locator('#density-toggle:not([hidden]) [data-action="density"]').count()===3,'The layout switch marks the wall; the density switch is shown');
  const ids=await p.locator('#board .wall [data-asset]').evaluateAll(els=>els.map(e=>e.dataset.asset).sort().join(','));
  check(ids==='d1,d2,d3,n1,r1,s1','Every live record once, the hidden one left out: '+ids);
  check(await panels()==='domain,server,repository','A panel per category with records, in category order: '+await panels());
  check(await p.locator('#board .wall-empty [data-action="add-asset"][data-id="license"]').count()===1,'An empty category is a quiet line that adds to it');
  check(await p.locator('#board .group[data-group="repository"] .g-cost').count()===0,'A one-record panel leaves out the monthly sum');
  const long=await p.locator('#board [data-asset="d2"] .r-text').evaluate(e=>({cut:e.scrollWidth>e.clientWidth+1,lines:Math.round(e.offsetHeight/18),inside:e.closest('.group').getBoundingClientRect().right>=e.getBoundingClientRect().right}));
  check(!long.cut&&long.lines>1&&long.inside,'A long name wraps inside its panel, nothing of it cut: '+JSON.stringify(long));
  const overlap=await p.evaluate(()=>{const r=[...document.querySelectorAll('#board .wall > .group')].map(n=>n.getBoundingClientRect());return r.some((a,i)=>r.some((b,j)=>i<j&&a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1));});
  check(!overlap,'Panels never overlap');
  await p.locator('#board [data-asset="d1"] .item-open').click();
  check(await p.evaluate(()=>activeAsset==='d1'&&!$('#detail').hidden),'A line opens the inspector');
  await p.evaluate(()=>closeDetail());

  // Narrow: one column.
  await p.setViewportSize({width:560,height:900});await settle();
  check(await p.evaluate(()=>document.querySelector('#board .wall').dataset.cols==='1'),'A narrow window gets one column');
  await p.setViewportSize({width:1500,height:900});await settle();

  // Three columns are the wall in every density; a tile is one to three lines and nothing in it is cut, at the usual window widths.
  const shown=()=>p.evaluate(()=>{const wall=document.querySelector('#board .wall'),seen=e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length,cut=e=>e.scrollWidth>e.clientWidth+1;
   const cutIn=[...wall.querySelectorAll('.g-name,.g-cost,.r-text,.r-sub,.r-sub *,.r-date,.r-cost,.live-line,.live-line *,.fact-v')].filter(e=>seen(e)&&cut(e)).map(e=>e.className+':'+e.textContent.slice(0,24));
   const out=[...wall.querySelectorAll('.r-line>*,.r-facts,.live-line,.group-head>*')].filter(e=>seen(e)&&e.getBoundingClientRect().right>e.closest('.group').getBoundingClientRect().right+.5).map(e=>e.className);
   return {cols:+wall.dataset.cols,width:Math.round(parseFloat(wall.firstElementChild.style.width)),cutIn,out};});
  for(const width of [1280,1440,1728]){
   await p.setViewportSize({width,height:900});await settle();
   for(const id of ['glance','standard','detail']){
    await p.evaluate(id=>setDensity(id),id);await settle();
    const got=await shown();
    check(got.cols===3&&got.width>=280&&!got.cutIn.length&&!got.out.length,`${width} wide, ${id}: three columns, every text whole and inside its panel: `+JSON.stringify(got));
   }
  }
  await p.evaluate(()=>setDensity('standard'));await settle();
  const lines=await p.evaluate(()=>{const top=(id,sel)=>Math.round(document.querySelector(`#board [data-asset="${id}"] ${sel}`).getBoundingClientRect().top),has=(id,sel)=>!!document.querySelector(`#board [data-asset="${id}"] ${sel}`);
   return {sub:document.querySelector('#board [data-asset="s1"] .r-sub').innerText,second:top('s1','.r-sub')>top('s1','.r-name')+10&&Math.abs(top('s1','.r-cost')-top('s1','.r-sub'))<4,first:Math.abs(top('s1','.r-date')-top('s1','.r-name'))<4,
    d1:top('d1','.r-cost')>top('d1','.r-name')+10,bare:has('n1','.r-second')||has('n1','.r-sub'),bareCost:Math.abs(top('n1','.r-cost')-top('n1','.r-name'))<4,one:document.querySelector('#board [data-asset="n1"]').offsetHeight<document.querySelector('#board [data-asset="s1"]').offsetHeight};});
  check(/203\.0\.113\.10/.test(lines.sub)&&/Host/.test(lines.sub)&&lines.first&&lines.second&&lines.d1,'标准 in three columns: the day count beside the name, the IP and platform on a second line with the price at its end: '+JSON.stringify(lines));
  check(!lines.bare&&lines.bareCost&&lines.one,'A record with nothing for the second line has none: one line, the price beside the name: '+JSON.stringify(lines));
  // The window decides the columns: two when three do not fit, a fourth only when three would be wider than a tile reads well.
  for(const [width,cols] of [[1040,2],[2400,4]]){
   await p.setViewportSize({width,height:900});await settle();
   const got=await shown();
   check(got.cols===cols&&!got.cutIn.length&&!got.out.length,`${width} wide: ${cols} columns, nothing cut: `+JSON.stringify(got));
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
  await p.mouse.move(head.x+head.width*.5,head.y+head.height/2);await p.mouse.down();
  await p.mouse.move(head.x+head.width*.5-20,head.y+head.height/2+10,{steps:4});
  check(await p.locator('#board .wall > .group.is-dragging').count()===1&&await p.locator('#board .wall > .drop-slot').count()===1,'A dragged panel is lifted and leaves a slot');
  await p.mouse.move(to.x+to.width*.3,to.y+20,{steps:12});await p.waitForTimeout(150);await p.mouse.up();await p.waitForTimeout(400);
  check(await panels()==='repository,server,domain','A dropped panel takes the place under the pointer: '+await panels());
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
  check(await density()==='detail'&&await p.locator('#board .r-facts').count()===6,'⌘= opens 详细: every line lists its facts');
  const facts=await p.locator('#board [data-asset="d1"] .r-facts').innerText();
  check(/Cloudflare/.test(facts)&&/ops@example\.com/.test(facts)&&/keep/.test(facts)&&!/本机目录|DNS 托管|备案/.test(facts),'详细 lists the known facts and leaves the empty ones out: '+facts);
  await p.keyboard.press('Control+Minus');await p.keyboard.press('Control+Minus');await settle();
  check(await density()==='glance'&&!(await p.locator('#board .r-facts').count())&&await p.locator('#board [data-asset="s1"] .r-cost').evaluate(e=>getComputedStyle(e).display==='none'),'⌘− twice reaches 全局: no price, no facts');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).density==='glance'),'The density is kept in the view preferences');
  await p.reload();await settle();
  check(await density()==='glance','The density is kept after a reload');
  await p.locator('#density-toggle [data-id="standard"]').click();await settle();
  check(await density()==='standard'&&await p.locator('#density-toggle [data-id="standard"][aria-checked="true"]').count()===1,'The switch sets a density');
  // The line at the top of the view stays where it was when the density changes.
  await p.setViewportSize({width:1500,height:420});await settle();
  await p.evaluate(()=>boardScroller().scrollTo(0,260));await settle();
  const before=await p.evaluate(()=>{const top=document.querySelector('#topbar').getBoundingClientRect().bottom,el=[...document.querySelectorAll('#board .wall [data-asset]')].find(n=>n.getBoundingClientRect().top>=top-1);return {id:el.dataset.asset,y:el.getBoundingClientRect().top};});
  await p.evaluate(()=>setDensity('detail'));await settle();
  const after=await p.evaluate(id=>document.querySelector(`#board .wall [data-asset="${id}"]`).getBoundingClientRect().top,before.id);
  check(Math.abs(after-before.y)<3,'Changing the density keeps the top line in place: '+JSON.stringify({before,after}));
  await p.evaluate(()=>{setDensity('standard');boardScroller().scrollTo(0,0);});await p.setViewportSize({width:1500,height:900});await settle();

  // The peek: the facts of a line beside its panel, after a rest of the pointer; gone on a press.
  await p.locator('#board [data-asset="s1"] .r-name').hover();await p.waitForTimeout(650);
  check(await p.locator('#wall-peek:not([hidden])').count()===1&&/203\.0\.113\.10/.test(await p.locator('#wall-peek').innerText()),'Resting on a line shows its facts in the peek');
  await p.mouse.move(5,5);await p.mouse.down();await p.mouse.up();
  check(await p.locator('#wall-peek[hidden]').count()===1,'The peek goes on a press');
  // Privacy mode masks the facts too.
  await p.evaluate(()=>{setPrivacy(true);setDensity('detail');});await settle();
  const masked=await p.locator('#board [data-asset="s1"] .r-facts').innerText();
  check(!/203\.0\.113\.10/.test(masked),'Privacy mode masks an IP in the facts: '+masked);
  await p.evaluate(()=>{setPrivacy(false);setDensity('standard');});

  // The skin: a setting that changes how panels look, not where they are.
  const boxes=()=>p.locator('#board .wall > .group').evaluateAll(els=>els.map(e=>[e.style.left,e.style.top,e.style.width].join()).join('|'));
  const quietBoxes=await boxes();
  await p.evaluate(()=>prefsDialog());await settle();
  await p.locator('#modal [data-action="prefs-section"][data-id="look"]').click();await settle();
  check(await p.locator('#modal [data-action="prefs-theme"]').isVisible()&&await p.locator('#modal [data-action="prefs-density"][data-id="standard"][aria-checked="true"]').isVisible(),'外观 holds the theme, the skin and the density together');
  await p.locator('#modal [data-action="prefs-skin"][data-id="magnet"]').click();await settle();
  check(await p.evaluate(()=>document.documentElement.dataset.skin==='magnet'&&localStorage.getItem('assetboard-skin-v1')==='magnet'),'设置 › 外观 sets the 冰箱贴 skin, kept on this device');
  await p.evaluate(()=>$('#modal').close());await settle();
  check(await boxes()===quietBoxes,'A skin moves no panel');
  check(await p.locator('#board .wall > .group').first().evaluate(e=>getComputedStyle(e).rotate!=='none'&&getComputedStyle(e).rotate!=='0deg'||e.style.getPropertyValue('--tilt')==='0.00'),'冰箱贴 tilts the panels a little');
  await p.evaluate(()=>setSkin('quiet'));

  // The list is a choice in the layout switch, kept; a search, another view and the hidden pile are never the wall.
  await p.locator('#layout-toggle [data-id="list"]').click();await settle();
  check(!(await p.locator('#board .wall').count())&&await p.locator('#board .group-body.list .row').count()===6,'The layout switch goes back to the list');
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
  check(/本周 88%/.test(await p.locator('#board .wall [data-asset="demo-a2"] .ai-quota').innerText()),'An AI plan on the wall shows its reading');
  await p.evaluate(()=>setDensity('detail'));await settle();
  const ai=await p.locator('#board .wall [data-asset="demo-a2"] .r-facts').innerText();
  check(/额度/.test(ai)&&/本周 88%/.test(ai)&&/本期用量/.test(ai),'详细 lists an AI plan\'s limits and period use: '+ai);
  check(await p.locator('#board .wall-pending [data-action="connect-pending"][data-id="cloudflare"]').count()===1,'待引入 is a quiet line under the wall');
  await p.locator('#board .wall-pending [data-action="connect-pending"]').click();await settle();
  check(await p.locator('#modal .connect-pick').count()===1,'待引入 under the wall opens the pick');
  await p.evaluate(()=>{$('#modal').close();setDensity('standard');});
  if(errors.length)throw new Error(errors.join(' | '));
  return 'PASS: tile wall default, three columns with whole lines at 1280/1440/1728 in every density, narrow single column, panel moves kept, row moves, densities kept and anchored, peek, privacy, skin, AI readings, 待引入';
 } finally { await p.close(); }
}
