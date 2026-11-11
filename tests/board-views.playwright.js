// Run with the browser tool's filename option. Uses an isolated page and never saves.
// The calm board (2026-11-03): the overview strip of 全部资产, dates without pills, a group's cost a month, the day count on grid
// cards, the 12-month timeline and the month calendar of 即将到来, and that the chosen views are kept per viewer.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{
   localStorage.removeItem('assetboard-view-v1');save=()=>{};history.length=0;
   const day=offset=>isoDay(localDay()+offset);
   state={blocks:[{id:'domain'},{id:'server'},{id:'subscription'},{id:'repository'}],assets:[
    {id:'soon',type:'domain',name:'soon.example.com',provider:'Registrar',date:day(12),dateKind:'expire',cycle:'yearly',cost:'$12 / 年',source:'manual'},
    {id:'late',type:'domain',name:'late.example.net',provider:'Registrar',date:day(-3),dateKind:'expire',source:'manual'},
    {id:'far',type:'domain',name:'far.example.org',provider:'Registrar',date:day(160),dateKind:'expire',cycle:'yearly',cost:'$24 / 年',source:'manual'},
    {id:'vps',type:'server',name:'edge-vps',provider:'Host',ips:['203.0.113.10'],host:'203.0.113.10',date:day(5),dateKind:'renew',cycle:'monthly',cost:'$6 / 月',source:'manual'},
    {id:'tool',type:'subscription',name:'Editor Pro',provider:'Editor',date:day(40),dateKind:'renew',cycle:'monthly',cost:'$8 / 月',source:'manual'},
    {id:'repo',type:'repository',name:'atlas-ui',provider:'GitHub',source:'manual'}
   ]};setView('all');setLayout('list');render();
  });
  // Overview strip: four buttons, the money ones into the cost panel, the others into 即将到来.
  const tiles=p.locator('#board .overview .ov-tile');
  check(await tiles.count()===4,'The overview has four tiles');
  check(/2/.test(await tiles.nth(1).locator('.ov-value').innerText())&&(await tiles.nth(1).getAttribute('class')).includes('soon'),'Two records fall due within 30 days');
  check((await tiles.nth(2).locator('.ov-value').innerText())==='1'&&(await tiles.nth(2).getAttribute('class')).includes('overdue'),'One overdue record needs attention');
  check(/\$/.test(await tiles.nth(3).locator('.ov-value').innerText()),'The yearly total is money');
  check(!(await p.locator('#view-meta .meta-flag.soon,#view-meta .meta-flag.overdue').count()),'The header leaves the due flags to the strip');
  // A due date is a pill (2026-11-06, user decision); an ordinary date is plain text.
  const pill=await p.evaluate(()=>{const d=document.querySelector('[data-asset="soon"] .r-date'),f=document.querySelector('[data-asset="far"] .r-date');const cs=getComputedStyle(d),fs=getComputedStyle(f);return {bg:cs.backgroundColor,pad:cs.paddingLeft,warn:d.classList.contains('warn'),farBg:fs.backgroundColor,farPad:fs.paddingLeft};});
  check(pill.warn&&pill.bg!=='rgba(0, 0, 0, 0)'&&pill.pad!=='0px'&&(pill.farBg==='rgba(0, 0, 0, 0)'||pill.farBg==='transparent')&&pill.farPad==='0px','A soon date is a pill, a far one is text: '+JSON.stringify(pill));
  // Five aligned columns: date and cost sit side by side on one line in the wide list.
  const cols=await p.evaluate(()=>{const r=document.querySelector('[data-asset="soon"]');const d=r.querySelector('.r-date').getBoundingClientRect(),c=r.querySelector('.r-cost').getBoundingClientRect();return {same:Math.abs(d.top-c.top)<4,order:c.left>d.right};});
  check(cols.same&&cols.order,'Date and cost are two columns: '+JSON.stringify(cols));
  check(/\/\s*月/.test(await p.locator('.group[data-group="server"] .g-cost').innerText()),'A group head gives its cost a month');
  // Grid: dated cards lead with the day count and a cycle bar; a card in a special state keeps its line.
  await p.click('#layout-toggle [data-id="grid"]');
  check((await p.locator('[data-asset="far"] .g-hero b').innerText())==='160','The day count is the real number, not 99+');
  check(await p.locator('[data-asset="soon"] .g-bar').count()===1&&(await p.locator('[data-asset="soon"] .g-hero').getAttribute('class')).includes('soon'),'A soon card has a bar and amber count');
  check(!(await p.locator('[data-asset="repo"] .g-hero').count()),'An undated card has no count');
  check(/到期/.test(await p.locator('[data-asset="soon"] .r-date').innerText())&&!/天后/.test(await p.locator('[data-asset="soon"] .r-date').innerText()),'Under the count the card gives the date itself');
  // Timeline: one row per dated record, monthly charges as later dots, the overdue one at the left in red, undated ones counted.
  await p.click('#layout-toggle [data-id="timeline"]');
  check(await p.locator('#board .tl-row').count()===5,'Five dated records on the timeline');
  check(await p.locator('[data-asset="vps"] .tl-mark.later').count()>=10,'A monthly charge repeats through the year');
  check((await p.locator('[data-asset="late"] .tl-mark').first().getAttribute('class')).includes('overdue'),'Overdue is red');
  check(/1/.test(await p.locator('#board .tl-note').innerText()),'The undated record is counted');
  // A date at the far end of the year puts its label on the left of the dot: nothing reaches past the chart, so the chart never
  // scrolls sideways and no scrollbar lands on the Today label or the note under the chart. The chart runs from the first of this
  // month through twelve whole months, so the date is taken five days before that end, inside the chart on any day of the month.
  const edge=await p.evaluate(async()=>{const end=dayNumber(addMonths(isoDay(localDay()).slice(0,8)+'01',12));state.assets.push({id:'edge',type:'domain',name:'edge.example.com',provider:'Registrar',date:isoDay(end-5),dateKind:'expire',cycle:'yearly',cost:'$9.90 / 年',source:'manual'});render();
   const t=document.querySelector('#board .timeline'),label=document.querySelector('[data-asset="edge"] .tl-label'),track=label.parentElement.getBoundingClientRect(),l=label.getBoundingClientRect();
   const out={before:label.classList.contains('before'),inside:l.right<=track.right+1,scroll:t.scrollWidth-t.clientWidth};state.assets=state.assets.filter(a=>a.id!=='edge');render();return out;});
  check(edge.before&&edge.inside&&edge.scroll<=0,'A late label stays inside the chart: '+JSON.stringify(edge));
  // The today line is measured on the chart, which keeps its 680px when the board is narrower and scrolls.
  const line=await p.evaluate(()=>{const t=document.querySelector('#board .timeline');t.style.width='420px';const today=document.querySelector('.tl-today').getBoundingClientRect().left,chart=document.querySelector('.tl-chart'),name=parseFloat(getComputedStyle(t).getPropertyValue('--tl-name')),at=parseFloat(chart.style.getPropertyValue('--tl-at')),c=chart.getBoundingClientRect();const out={scrolls:t.scrollWidth>t.clientWidth,off:Math.abs(today-(c.left+name+(c.width-6-name)*at))};t.style.width='';return out;});
  check(line.scrolls&&line.off<2,'The today line follows the chart when it scrolls: '+JSON.stringify(line));
  await p.click('[data-asset="far"] .tl-name');
  check(await p.evaluate(()=>activeAsset==='far'&&!$('#detail').hidden),'A timeline row opens the inspector');
  await p.evaluate(()=>closeDetail());
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).board==='timeline'),'The timeline is remembered');
  // Searching shows a list even while the timeline is chosen.
  await p.fill('#search','atlas');await p.waitForTimeout(150);
  check(await p.locator('#board .row[data-asset="repo"]').count()===1&&await p.locator('#layout-toggle [data-id="timeline"]').isHidden(),'A search is a list');
  await p.fill('#search','');await p.waitForTimeout(150);
  // Calendar: 即将到来 switches to a month; amounts on the days, the total beside them, months step back and forth.
  await p.click('#sidebar .nav-item[data-id="upcoming"]');
  check(await p.locator('#layout-toggle [data-id="calendar"]').isVisible(),'即将到来 offers the calendar');
  await p.click('#layout-toggle [data-id="calendar"]');
  check(await p.locator('#board .cal-day.today').count()===1,'Today is marked');
  check(/\$/.test(await p.locator('#board .cal-total').innerText()),'The month has a total');
  const month=await p.locator('#board .cal-title').innerText();
  await p.click('#board [data-action="calendar-month"][data-id="1"]');
  check((await p.locator('#board .cal-title').innerText())!==month&&!(await p.locator('#board .cal-day.today').count()),'Next month has no today');
  check(await p.locator('#board .cal-ev').filter({hasText:'Editor Pro'}).count()>=1||await p.locator('#board .cal-ev').filter({hasText:'edge-vps'}).count()>=1,'A monthly charge shows next month too');
  await p.click('#board [data-action="calendar-month"][data-id="0"]');
  check((await p.locator('#board .cal-title').innerText())===month,'本月 comes back');
  await p.locator('#board .cal-ev').first().click();
  check(await p.evaluate(()=>!$('#detail').hidden),'A calendar entry opens the inspector');
  await p.evaluate(()=>closeDetail());
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-view-v1')).upcoming==='calendar'&&layoutMode==='timeline'),'The two choices are kept apart');
  // Narrow: the calendar becomes its list; nothing scrolls sideways.
  await p.setViewportSize({width:390,height:800});await p.waitForTimeout(250);
  check(await p.locator('#board .cal-grid').isHidden()&&await p.locator('#board .cal-list li').count()>=1,'At 390px the month is a list');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll at 390px');
  await p.evaluate(()=>{setLayout('list');setView('all');setLayout('list');});
  check(!errors.length,'No page errors: '+errors.join(' | '));
 } finally {await p.evaluate(()=>localStorage.removeItem('assetboard-view-v1')).catch(()=>{});await p.close();}
}
