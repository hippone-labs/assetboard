// Run with the browser tool's filename option. Folding the sidebar to a column of icons: the button at the left of the top bar, ⌘\
// (by the key) and ⌃⌘S (the same) fold and unfold it, the card takes the width, the choice is remembered (a sidebar hidden by an
// earlier version comes back folded). Folded (variant B, 2026-10-23) the column is fixed: 即将到来, 全部资产, 全景, 域名, 服务器 and 更多;
// no numbers anywhere, a red/amber dot at the icon's top right only for real due items (更多 takes the worst of what it holds),
// `name · count` as the tip, the count and due state in the label, a white tint for the selected item; 更多 is a menu with every
// other category (and projects, 已隐藏, tools), worked by keyboard. Expanded keeps its in-place 更多; the narrow strip still fits.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof toggleSidebar==='function');
  await p.evaluate(day=>{localStorage.clear();state={blocks:[],assets:[{id:'d',type:'domain',name:'a.dev',provider:'Cloudflare',source:'manual',art:'generic',date:day,dateKind:'expire',project:'notes-lab'},
   {id:'s',type:'server',name:'box',provider:'Hosting',source:'manual',art:'generic'}],deletedExternalIds:[]};save=()=>{};render();},day(-2));
  const left=sel=>p.evaluate(sel=>Math.round(document.querySelector(sel).getBoundingClientRect().left),sel);
  const width=()=>p.evaluate(()=>Math.round($('#sidebar').getBoundingClientRect().width));
  check(await left('#main')===228&&await width()===228&&await p.evaluate(()=>$('#sidebar-toggle').getAttribute('aria-pressed')==='true'),'Expanded by default');
  check(await p.evaluate(()=>{const r=$('#sidebar-toggle').getBoundingClientRect(),bar=$('#topnav').getBoundingClientRect();return r.top>=bar.top&&r.bottom<=bar.bottom;}),'The button sits in the top bar');

  await p.click('#sidebar-toggle');
  check(await left('#main')===56&&await width()===56,'Folded: a column of icons, the card takes the width: '+await left('#main'));
  const rail=await p.evaluate(()=>{const shown=n=>n.getClientRects().length&&getComputedStyle(n).display!=='none';return {labels:[...document.querySelectorAll('#sidebar .nav-label')].filter(shown).length,
   counts:[...document.querySelectorAll('#sidebar .nav-count,#sidebar .nav-dot')].filter(shown).length,digits:[...document.querySelectorAll('#sidebar .nav-item')].filter(shown).map(n=>n.innerText.trim()).join(''),
   titles:[...document.querySelectorAll('#sidebar .nav-item[title]')].length,label:$('#sidebar-toggle').getAttribute('aria-label'),stored:JSON.parse(localStorage.getItem('assetboard-view-v1')).rail};});
  check(!rail.labels&&!rail.counts&&!rail.digits&&!rail.titles,'No names, numbers or native titles in the column: '+JSON.stringify(rail));
  check(rail.label==='展开侧边栏（⌘\\）'&&rail.stored===true,'Relabelled and remembered: '+JSON.stringify(rail));
  // Dots: the domain has an overdue record (red), the server nothing due (no dot), 即将到来 carries the overdue one.
  const dots=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#sidebar .nav-item')].map(n=>[n.dataset.block||n.dataset.id,n.querySelector('.rail-dot')?.className.replace('rail-dot ','')||''])));
  check(dots.domain==='overdue'&&dots.server===''&&dots.upcoming==='overdue'&&dots.all===''&&dots.panorama==='','Dots only where something is due: '+JSON.stringify(dots));
  const labels=await p.evaluate(()=>({d:$('#sidebar [data-block="domain"]').getAttribute('aria-label'),s:$('#sidebar [data-block="server"]').getAttribute('aria-label'),u:$('#sidebar [data-id="upcoming"]').getAttribute('aria-label'),a:$('#sidebar [data-id="all"]').getAttribute('aria-label')}));
  check(labels.d==='域名，1 项，1 项已过期'&&labels.s==='服务器，1 项'&&labels.u==='即将到来，1 项，1 项已过期'&&labels.a==='全部资产，2 项','Labels say name, count and due state: '+JSON.stringify(labels));
  // The dot sits at the icon's top right, overlapping only its corner.
  const spot=await p.evaluate(()=>{const n=$('#sidebar [data-block="domain"]'),i=n.querySelector('svg').getBoundingClientRect(),d=n.querySelector('.rail-dot').getBoundingClientRect();return {right:d.left>i.left+i.width/2,top:d.top<i.top+i.height/3,inside:d.right<=n.getBoundingClientRect().right};});
  check(spot.right&&spot.top&&spot.inside,'The dot sits at the top right of the icon: '+JSON.stringify(spot));
  // The tip: name · count, beside the icon, on hover and on keyboard focus; gone when the pointer leaves.
  await p.hover('#sidebar .nav-item[data-block="domain"]');
  await until(p,()=>$('#rail-tip')&&!$('#rail-tip').hidden);
  const tip=await p.evaluate(()=>{const t=$('#rail-tip').getBoundingClientRect(),n=$('#sidebar [data-block="domain"]').getBoundingClientRect();return {text:$('#rail-tip').textContent,beside:t.left>=n.right&&Math.abs((t.top+t.height/2)-(n.top+n.height/2))<2,hidden:$('#rail-tip').getAttribute('aria-hidden')};});
  check(tip.text==='域名·1'&&tip.beside&&tip.hidden==='true','Tip shows name · count beside the icon: '+JSON.stringify(tip));
  await p.mouse.move(700,500);
  check(await p.evaluate(()=>$('#rail-tip').hidden),'The tip goes with the pointer');
  await p.focus('#sidebar .nav-item[data-id="all"]');await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>!$('#rail-tip').hidden&&$('#rail-tip').textContent==='全景'),'Keyboard focus shows the tip too: '+await p.evaluate(()=>$('#rail-tip').textContent));
  // Selected: a white tint (no accent wash) with the icon in the accent.
  await p.evaluate(()=>setView('domain'));
  const sel=await p.evaluate(()=>{const n=$('#sidebar [data-block="domain"]'),cs=getComputedStyle(n),icon=getComputedStyle(n.querySelector('svg')).color,accent=`rgb(${getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').trim().split(',').map(Number).join(', ')})`;return {bg:cs.backgroundColor,icon,accent,current:n.getAttribute('aria-current')};});
  check(/^rgba\(255, 255, 255, 0\.6/.test(sel.bg)&&sel.icon===sel.accent&&sel.current==='page','Selected: white tint, accent icon: '+JSON.stringify(sel));
  await p.emulateMedia({colorScheme:'dark'});await p.evaluate(()=>render());
  const dark=await p.evaluate(()=>getComputedStyle($('#sidebar [data-block="domain"]')).backgroundColor);
  check(/^rgba\(255, 255, 255, 0\.0[5-9]/.test(dark),'Selected in dark: a very faint white: '+dark);
  await p.emulateMedia({colorScheme:'light'});await p.evaluate(()=>{setView('all');render();});
  await p.reload();await until(p,()=>typeof toggleSidebar==='function');
  check(await width()===56,'Still folded after reload');

  await p.keyboard.press('Meta+Backslash');
  check(await width()===228&&await p.evaluate(()=>!$('#sidebar .nav-item[data-block="domain"]')?.title),'⌘\\ unfolds it, and the tips go');
  await p.keyboard.press('Control+Meta+s');
  check(await width()===56,'⌃⌘S folds it too');
  await p.evaluate(()=>panoramaOpen(true));
  check(await left('#panorama')===56,'The panorama sits in the card');
  await p.evaluate(()=>{panoramaOpen(false);toggleSidebar(true);});
  check(await width()===228,'toggleSidebar(true) unfolds');

  // A sidebar hidden by an earlier version comes back folded.
  await p.evaluate(()=>localStorage.setItem('assetboard-view-v1',JSON.stringify({view:'all',sidebar:false})));
  await p.reload();await until(p,()=>typeof toggleSidebar==='function');
  check(await width()===56,'An old hidden sidebar comes back folded');

  // Many categories, folded to icons: the column stays 即将到来 · 全部资产 · 全景 · 域名 · 服务器 · 更多 whatever is due or current;
  // 更多 holds the rest. Expanded keeps its own rule (only empty categories fold) and opens 更多 in place.
  await p.evaluate(day=>{toggleSidebar(false);localStorage.removeItem('assetboard-view-v1');navMoreOpen=false;const types=Object.keys(cats),assets=[];
   types.forEach((type,i)=>{if(type==='google')return;for(let n=0;n<=i;n++)assets.push({id:`${type}-${n}`,type,name:`${type} ${n}`,provider:'示例',source:'manual',art:'generic'});});
   assets.push({id:'due-license',type:'license',name:'过期授权',provider:'示例',source:'manual',art:'generic',date:day,dateKind:'expire'});
   assets.push({id:'due-server',type:'server',name:'快到期',provider:'示例',source:'manual',art:'generic',date:isoDay(localDay()+10),dateKind:'expire'});
   state={blocks:types.map(id=>({id,width:50,height:null,density:'full',folded:false})),assets,deletedExternalIds:[]};setView('all');},day(-3));
  const railNav=()=>p.evaluate(()=>({column:[...document.querySelectorAll('#sidebar .nav-item')].map(n=>n.dataset.block||n.dataset.id),all:categoryIds(),
   more:$('#sidebar .nav-more')?.getAttribute('aria-expanded')??null,due:$('#sidebar .nav-more')?.querySelector('.rail-dot')?.className??'',label:$('#sidebar .nav-more')?.getAttribute('aria-label')??'',
   active:$('#sidebar .nav-more')?.classList.contains('active')}));
  let r=await railNav();
  const column=['upcoming','all','panorama',...r.all.filter(id=>id==='domain'||id==='server'),'more'].join();
  check(r.column.join()===column,'Folded: the fixed column, its two categories in the person\'s order: '+JSON.stringify(r));
  check(r.due==='rail-dot overdue'&&r.label===`更多，${r.all.length-2} 个类别，1 项已过期`&&r.more==='false','更多 takes the worst dot of what it holds and says so: '+JSON.stringify(r));
  check(await p.evaluate(()=>$('#sidebar [data-block="server"] .rail-dot')?.className)==='rail-dot soon','A server due in 10 days is amber');
  // The current category, when it is in 更多, makes 更多 the selected item.
  await p.evaluate(()=>setView('database'));r=await railNav();
  check(r.column.join()===column&&r.active&&/当前：数据库/.test(r.label),'A folded current category selects 更多: '+JSON.stringify(r));
  await p.evaluate(()=>setView('all'));
  // Keyboard: down the column to 更多, Enter opens the menu beside it with every other category, arrows move, Enter picks
  // (focus returns to the column, on 更多, now selected), Esc closes and returns focus.
  await p.focus('#sidebar .nav-item[data-id="upcoming"]');
  for(let n=0;n<10&&!await p.evaluate(()=>document.activeElement?.classList.contains('nav-more'));n++)await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>document.activeElement?.classList.contains('nav-more')),'Arrow keys reach 更多');
  await p.keyboard.press('Enter');
  const menu=await p.evaluate(()=>{const m=$('#menu'),r=m.getBoundingClientRect(),a=$('#sidebar .nav-more').getBoundingClientRect();return {open:!m.hidden&&m.classList.contains('rail-menu'),expanded:$('#sidebar .nav-more').getAttribute('aria-expanded'),
   cats:[...m.querySelectorAll('.menu-item[data-block]')].map(n=>n.dataset.block),roles:[...m.querySelectorAll('.menu-item')].every(n=>n.getAttribute('role')==='menuitem'),beside:r.left>=a.right,focus:document.activeElement?.closest('#menu')?document.activeElement.dataset.id:null,
   dueEntry:m.querySelector('[data-block="license"] .nav-dot.overdue')?1:0,tipHidden:$('#rail-tip').hidden};});
  check(menu.open&&menu.expanded==='true'&&menu.roles&&menu.beside&&menu.tipHidden,'Enter opens the 更多 menu beside the column: '+JSON.stringify(menu));
  check(menu.cats.join()===r.all.filter(id=>id!=='domain'&&id!=='server').join()&&menu.focus===menu.cats[0]&&menu.dueEntry,'It lists every other category, focus on the first: '+JSON.stringify(menu));
  await p.keyboard.press('ArrowDown');
  check(await p.evaluate(id=>document.activeElement.dataset.block===id,menu.cats[1]),'Arrow keys move in the menu');
  await p.keyboard.press('Escape');
  check(await p.evaluate(()=>$('#menu').hidden&&document.activeElement?.classList.contains('nav-more')&&$('#sidebar .nav-more').getAttribute('aria-expanded')==='false'),'Esc closes it and returns focus to 更多');
  // End reaches the tools at the bottom; Home and a step down pick the second category.
  await p.keyboard.press('Enter');await p.keyboard.press('End');
  check(await p.evaluate(()=>document.activeElement.dataset.id==='prefs'),'End reaches the last entry (设置 comes last)');
  await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
  check(await p.evaluate(id=>$('#menu').hidden&&currentView()===id,menu.cats[1]),'Enter picks an entry: '+menu.cats[1]);
  check(await p.evaluate(()=>document.activeElement?.classList.contains('nav-more')&&$('#sidebar .nav-more').classList.contains('active')),'Focus stays on the column, 更多 selected');
  // A click picks too, and a second click on 更多 closes the menu.
  await p.evaluate(()=>setView('all'));await p.click('#sidebar .nav-more');await p.click('#menu .menu-item[data-block="database"]');
  check(await p.evaluate(()=>currentView()==='database'&&$('#menu').hidden),'A click on an entry opens that category');
  await p.click('#sidebar .nav-more');await p.click('#sidebar .nav-more');
  check(await p.evaluate(()=>$('#menu').hidden),'A second click on 更多 closes the menu');
  // ⌥↓ on 域名 still reorders the categories (the column follows the person's order).
  await p.evaluate(()=>setView('all'));
  const before=await p.evaluate(()=>categoryIds().indexOf('domain'));
  await p.focus('#sidebar .nav-item[data-block="domain"]');await p.keyboard.press('Alt+ArrowDown');
  check(await p.evaluate(b=>categoryIds().indexOf('domain')===b+1&&document.activeElement?.dataset.block==='domain',before),'⌥↓ on a column category moves it and keeps focus');
  await p.keyboard.press('Control+z');
  // Expanded is unchanged: 更多 opens in place and is remembered.
  await p.evaluate(()=>{toggleSidebar(true);state.assets=state.assets.filter(a=>a.type!=='database'&&a.type!=='license');render();});
  r=await railNav();
  check(r.more==='false'&&!r.column.includes('database')&&!r.column.includes('license'),'Expanded: empty categories fold under 更多: '+JSON.stringify(r));
  await p.click('#sidebar .nav-more');
  check(await p.evaluate(()=>!!$('#nav-more-list [data-block="database"]')&&$('#menu').hidden&&JSON.parse(localStorage.getItem('assetboard-view-v1')).more===true),'Expanded: 更多 opens in place (no menu) and is remembered');
  await p.click('#sidebar .nav-more');
  // Expanded: one empty category is listed, not folded.
  await p.evaluate(()=>{state.assets.push({id:'db-back',type:'database',name:'db',provider:'示例',source:'manual',art:'generic'},{id:'lic-back',type:'license',name:'lic',provider:'示例',source:'manual',art:'generic'});render();});
  r=await railNav();
  check(r.more===null&&r.column.includes('google'),'Expanded: a single empty category is listed: '+JSON.stringify(r));

  // Every theme, light and dark: each dot keeps 3:1 against its ring (plain, hovered and selected), and red and amber stay apart.
  await p.evaluate(day=>{state.assets.push({id:'late-domain',type:'domain',name:'late.example',provider:'示例',source:'manual',art:'generic',date:day,dateKind:'expire'});toggleSidebar(false);setView('server');},day(-1));
  const lows=[];
  for(const scheme of ['light','dark']){
   await p.emulateMedia({colorScheme:scheme});
   lows.push(...await p.evaluate(()=>{
    const rgb=v=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle='#000';c.fillStyle=v;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3);};
    const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((t,v,i)=>t+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
    const out=[];
    for(const [id]of themePresets){themePref={id};applyBoardTheme();
     for(const n of document.querySelectorAll('#sidebar .rail-dot')){const cs=getComputedStyle(n),dot=rgb(cs.backgroundColor),root=getComputedStyle(n.closest('.nav-item'));
      for(const ring of [cs.boxShadow.replace(/\s-?[\d.]+px.*$/,''),root.getPropertyValue('--rail-ring-hover'),root.getPropertyValue('--rail-ring-selected')]){const v=ratio(dot,rgb(ring.trim()));if(v<3)out.push(`${id} ${document.documentElement.dataset.scheme} ${n.className} ${v.toFixed(2)}`);}}
     const red=rgb(getComputedStyle(document.documentElement).getPropertyValue('--dot-red')),amber=rgb(getComputedStyle(document.documentElement).getPropertyValue('--dot-amber'));
     if(Math.abs(red[1]-amber[1])<40)out.push(`${id}: red and amber too close`);}
    themePref=null;applyBoardTheme();return out;}));
  }
  await p.emulateMedia({colorScheme:'light'});
  check(!lows.length,'Dots stay clear of their rings in every theme: '+lows.join(' | '));
  check(await p.evaluate(()=>document.querySelectorAll('#sidebar .rail-dot.soon').length&&document.querySelectorAll('#sidebar .rail-dot.overdue').length),'Both colours were measured');
  await p.evaluate(()=>{setView('all');toggleSidebar(true);});

  await p.setViewportSize({width:390,height:800});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=390&&getComputedStyle($('#sidebar-toggle')).display==='none'),'Narrow: the strip layout fits and has no fold button');
  // A folded sidebar on a narrow window is the strip with every entry, not the column.
  await p.evaluate(()=>toggleSidebar(false));
  check(await p.evaluate(()=>!document.querySelector('#sidebar .rail-dot')&&!!$('#sidebar [data-block="license"]')&&document.documentElement.scrollWidth<=390),'Narrow and folded: the strip keeps its entries, no rail dots');
  // The column comes back from the media query's change event, which fires on a later frame: wait for it.
  await p.setViewportSize({width:1280,height:800});
  const back=await until(p,column=>{const got=[...document.querySelectorAll('#sidebar .nav-item')].map(n=>n.dataset.block||n.dataset.id).join();return got===column&&got;},column,{timeout:3000}).catch(()=>p.evaluate(()=>[...document.querySelectorAll('#sidebar .nav-item')].map(n=>n.dataset.block||n.dataset.id).join()));
  check(back===column,'Wide again: the column is back: '+back);
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS';
}
