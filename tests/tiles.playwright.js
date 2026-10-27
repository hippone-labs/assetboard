// Category icons and row type (DESIGN-PRINCIPLES §9 rules 13–15, v15). Run with the browser tool's filename option.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const errors=[];p.on('pageerror',error=>errors.push(error.message));
 try {
  await p.setViewportSize({width:1440,height:900});
  await p.goto('http://127.0.0.1:4317/?demo');
  await until(p,()=>typeof render==='function'&&document.querySelector('#board [data-asset]'));
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const result=await p.evaluate(png=>{
   const types=Object.keys(cats),missing=types.filter(t=>!icons[t]),shapes=new Set(types.map(t=>icons[t]));
   state.blocks=types.map(id=>({id,width:25,height:null,density:'full',folded:false}));
   state.assets=types.map((type,i)=>({id:'t-'+type,type,name:'示例 '+type,provider:'示例来源',account:'demo',purpose:'只在悬停和详情出现的用途',source:'manual',art:'generic',updatedAt:new Date(Date.now()-i*1000).toISOString()}));
   state.assets.push({id:'t-site',type:'domain',name:'site.example',provider:'示例',siteIcon:png,source:'manual',art:'generic',updatedAt:new Date().toISOString()},
    {id:'t-custom',type:'server',name:'自定义图标',provider:'示例',iconData:png.replace('image/png','image/webp'),siteIcon:png,source:'manual',art:'generic',updatedAt:new Date().toISOString()},
    {id:'t-card',type:'bankcard',name:'带站点图标的卡',provider:'示例银行',network:'Visa',last4:'4821',siteIcon:png,source:'manual',art:'generic',updatedAt:new Date().toISOString()});
   setLayout('list');setView('all');
   const tileOf=id=>document.querySelector(`#board [data-asset="${id}"] .item-open .tile`);
   const typeTiles=types.map(t=>{const el=tileOf('t-'+t),head=document.querySelector(`#board .group[data-group="${t}"] .group-title .g-icon svg`),nav=document.querySelector(`#sidebar .nav-item[data-block="${t}"] svg`);return {t,ok:!!el&&el.classList.contains('type-art')&&!!el.querySelector('svg')&&!el.querySelector('img')&&!!head&&!!nav,stroke:el?.querySelector('svg')?.getAttribute('stroke-width'),size:Math.round(el?.querySelector('svg')?.getBoundingClientRect().width||0)};});
   const site=tileOf('t-site'),custom=tileOf('t-custom'),bank=tileOf('t-card');
   const rows=[...document.querySelectorAll('#board .row')];
   const serif=[...document.querySelectorAll('body, #board *, #sidebar *, #topbar *')].map(el=>getComputedStyle(el).fontFamily).filter(f=>/Georgia|Times|(^|,\s*)serif|Avenir|Menlo/i.test(f.replace(/sans-serif/gi,'')));
   const heights=new Set(rows.map(el=>Math.round(el.getBoundingClientRect().height)));
   return {missing,distinct:shapes.size===types.length,typeTiles,
    site:!!site&&site.classList.contains('site-art')&&!!site.querySelector('img')&&!site.querySelector('svg'),
    custom:!!custom&&custom.classList.contains('custom-art')&&!custom.classList.contains('site-art')&&custom.querySelector('img')?.getAttribute('src').startsWith('data:image/webp'),
    bank:!!bank&&!!bank.querySelector('img')&&!bank.querySelector('svg'),
    serif:[...new Set(serif)],heights:[...heights],
    purposeOnRow:[...document.querySelectorAll('#board .item-open')].filter(el=>el.textContent.includes('只在悬停')).length,
    purposeHover:document.querySelector('#board [data-asset="t-domain"] .item-open').title.includes('只在悬停'),
    nameWeight:getComputedStyle(document.querySelector('#board .r-name')).fontWeight,nameSize:getComputedStyle(document.querySelector('#board .r-name')).fontSize,subSize:getComputedStyle(document.querySelector('#board .r-sub')).fontSize};
  },png);
  check(!result.missing.length,'Categories without an icon: '+result.missing.join(', '));
  check(result.distinct,'Every category icon is distinct');
  for(const t of result.typeTiles)check(t.ok&&t.stroke==='1.5'&&t.size===16,`Category ${t.t}: every row carries the 1.5px line icon at 16px when there is no real icon, and so do its group title and sidebar item: `+JSON.stringify(t));
  check(result.site,'A fetched site icon replaces the category icon');
  check(result.custom,'A custom icon wins over a site icon and the category icon');
  check(result.bank,'Priority types use a real icon too when there is one');
  check(!result.serif.length,'Only system sans-serif fonts: '+result.serif.join(' | '));
  check(result.heights.length===1&&result.heights[0]<=44,'Every list row has one height, at most 44px: '+result.heights.join());
  check(result.purposeOnRow===0&&result.purposeHover,'Purpose lives in the hover title and inspector, not on the row');
  check(result.nameWeight==='500'&&result.nameSize==='13px'&&result.subSize==='12px','Row type: name 13/500, source 12: '+JSON.stringify(result));

  // The same tile shows up wherever the asset does: inspector, 即将到来, grid cards, hidden rows and search.
  const spots=await p.evaluate(()=>{
   const out={};showDetail('t-site');out.inspector=!!document.querySelector('#detail .detail-head .tile.lg.site-art img');closeDetail();
   const day=new Date();day.setDate(day.getDate()+3);const a=state.assets.find(x=>x.id==='t-database');a.date=day.toISOString().slice(0,10);
   setView('upcoming');const up=document.querySelector('#board [data-asset="t-database"]');out.upcoming=!!up?.querySelector('.tile.type-art svg')&&!!up.querySelector('.r-date.warn .dot')&&/数据库/.test(up.querySelector('.r-sub').textContent);
   setView('all');setLayout('grid');const g=document.querySelector('#board [data-asset="t-custom"] .tile');out.grid=!!g&&Math.round(g.getBoundingClientRect().width)===32&&!!g.querySelector('img');
   const sizes=new Set([...document.querySelectorAll('#board .group[data-group="domain"] .gcard')].map(el=>Math.round(el.getBoundingClientRect().height)));out.gridEven=sizes.size===1;
   setLayout('list');state.assets.find(x=>x.id==='t-license').hiddenAt=new Date().toISOString();setView('hidden');
   const h=document.querySelector('#board [data-asset="t-license"]');out.hidden=!!h?.querySelector('.tile.type-art')&&h.querySelector('.r-text').getBoundingClientRect().height>=14&&!!h.querySelector('[data-action="restore-asset"]');
   setView('all');return out;});
  for(const [k,v] of Object.entries(spots))check(v,'Tile expectation failed in '+k);
  // Hovering a row reveals actions without changing its height.
  // A row's box, waiting for it if the board is being drawn again at that moment.
  const row=p.locator('#board [data-asset="t-server"]'),box=async()=>{await row.waitFor({state:'visible'});return (await row.boundingBox())?.height??(await row.boundingBox()).height;};
  const rest=await box();await row.hover();await p.waitForTimeout(250);
  check(Math.abs(await box()-rest)<.5,'Hover must not change the row height');
  await p.mouse.move(1,1);
  await p.fill('#search','只在悬停');await p.waitForTimeout(250);
  check(await p.locator('#board .row').count()>0&&await p.locator('#board .card-hit').count()>0,'Search results say when the match is in the purpose');
  await p.fill('#search','');
  check(!errors.length,'Page errors: '+errors.join(' | '));
  return 'PASS: every category has a distinct 1.5px icon on rows, group titles and the sidebar, real icons win, system sans only, one row height, purpose only on hover, row type, tiles in inspector/即将到来/grid/hidden/search, even grid cards, stable hover height';
 } finally { await p.close(); }
}
