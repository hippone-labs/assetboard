// The panorama's 实物 drawing (OBJECT-PANORAMA.md): the switch, one object per visible asset and what each category is drawn as, state,
// the inspector, keyboard, privacy, the 正在做 screen (empty, with sessions, and fed by coding-sessions.js's interface), live readings
// through the existing slot, falling back to cards when it does not fit, the window by day and by night, and contrast in both.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const browser=page.context().browser(),errors=[],contexts=[];
 const open=async({width=1600,height=1000,scheme='light',query='?demo',init=null}={})=>{
  const context=await browser.newContext({viewport:{width,height},colorScheme:scheme,reducedMotion:'reduce'});contexts.push(context);
  if(init)await context.addInitScript(init);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/'+query);await until(p,()=>typeof panoramaOpen==='function'&&typeof objectsPaint==='function');await p.waitForTimeout(200);
  return p;
 };
 const style=p=>p.evaluate(()=>({painted:document.querySelector('#panorama').dataset.style,pressed:document.querySelector('.pano-style [aria-pressed="true"]')?.dataset.style||'',fell:document.querySelector('.pano-fell')?.textContent||'',tier:document.querySelector('.pano-body')?.dataset.tier||''}));
 const shapes=p=>p.evaluate(()=>{const out={};for(const n of document.querySelectorAll('#panorama [data-obj]'))out[n.dataset.obj]=(out[n.dataset.obj]||0)+1;return out;});
 // Every object and the Mac inside the scene, and no two of them on top of each other.
 const layout=p=>p.evaluate(()=>{
  const body=document.querySelector('.pano-body.objects').getBoundingClientRect(),nodes=[...document.querySelectorAll('#panorama [data-obj],#panorama [data-mac]')],rects=nodes.map(n=>n.getBoundingClientRect());
  const name=n=>n.dataset.chip||'mac',out=[],over=[];
  rects.forEach((r,i)=>{if(r.left<body.left-1||r.right>body.right+1||r.top<body.top-1||r.bottom>body.bottom+1)out.push(name(nodes[i]));
   for(let j=i+1;j<rects.length;j++){const q=rects[j];if(Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1)over.push(name(nodes[i])+'×'+name(nodes[j]));}});
  return {n:nodes.length,out,over};
 });
 // Text against the flat fill under it (the contrast test's reading), inside the scene and the bar.
 const contrast=(p,label)=>p.evaluate(label=>{
  const parse=value=>{const m=(value.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(top,bottom)=>({r:top.r*top.a+bottom.r*(1-top.a),g:top.g*top.a+bottom.g*(1-top.a),b:top.b*top.a+bottom.b*(1-top.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
  const found=[],seen=new Set(),walker=document.createTreeWalker(document.querySelector('#panorama'),NodeFilter.SHOW_TEXT);let checked=0;
  while(walker.nextNode()){
   const el=walker.currentNode.parentElement;if(!walker.currentNode.textContent.trim()||!el||seen.has(el)||el.closest('svg,[hidden]'))continue;seen.add(el);
   const cs=getComputedStyle(el);if(cs.visibility!=='visible'||!el.getClientRects().length)continue;
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const size=parseFloat(cs.fontSize),need=size>=24||(size>=18.66&&Number(cs.fontWeight)>=700)?3:4.5,value=ratio(over(parse(cs.color),bg),bg);checked++;
   if(value<need)found.push(`${label}: "${walker.currentNode.textContent.trim().slice(0,20)}" <${el.tagName.toLowerCase()}.${[...el.classList].join('.')}> in .${[...(el.closest('.po,.po-mac,.po-home,.pano-bar')||el).classList].join('.')} ${value.toFixed(2)} < ${need}`);
  }
  return {checked,found};
 },label);
 // A board with every category, a stopped server, a machine at home, an overdue ticket and a domain with no registrar. All made up.
 const fullBoard=p=>p.evaluate(()=>{
  const day=o=>isoDay(localDay()+o),base={account:'',source:'manual',art:'generic',cost:'未知',url:'',notes:''};
  const assets=[
   {id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',purpose:'API 服务',ips:['203.0.113.10'],date:day(26),dateKind:'renew',cycle:'monthly',cost:'$6/月',links:['db1']},
   {id:'s2',type:'server',name:'frankfurt-vps',provider:'Hetzner',ips:['198.51.100.24'],date:day(200),dateKind:'renew',cycle:'yearly'},
   {id:'s3',type:'server',name:'home-nas',provider:'自建',purpose:'照片备份',ips:['192.168.8.20']},
   {id:'s4',type:'server',name:'old-box',provider:'Vultr',ips:['203.0.113.77'],stopped:true},
   {id:'db1',type:'database',name:'postgres-main',provider:'ManagedDB',port:'5432',links:['s1']},
   {id:'st1',type:'storage',name:'photo-archive',provider:'R2'},{id:'dp1',type:'deployment',name:'notes-web',provider:'Pages'},
   {id:'d1',type:'domain',name:'studio.example.com',provider:'Cloudflare',purpose:'工作室主站',date:day(12),dateKind:'expire'},
   {id:'d2',type:'domain',name:'notes.example.org',provider:'Cloudflare',date:day(160),dateKind:'expire'},
   {id:'d3',type:'domain',name:'shop.example.net',provider:'Namecheap',date:day(-8),dateKind:'expire'},
   {id:'d4',type:'domain',name:'side.example.io',provider:'Porkbun',date:day(300),dateKind:'expire'},
   {id:'d5',type:'domain',name:'lab.example.dev',provider:'',date:day(90),dateKind:'expire'},
   {id:'c1',type:'bankcard',name:'Visa 信用卡',provider:'示例银行',network:'Visa',last4:'4242',date:day(400),dateKind:'expire'},
   {id:'c2',type:'bankcard',name:'多币种借记卡',provider:'示例钱包',network:'Mastercard',last4:'8812',date:day(24),dateKind:'expire'},
   {id:'p1',type:'phone',name:'保号小号',provider:'示例运营商',phone:'+1 555 010 0199',region:'US',date:day(70),dateKind:'renew'},
   {id:'ap1',type:'appleid',name:'美区 Apple ID',provider:'Apple',account:'someone@example.com',region:'US'},
   {id:'g1',type:'google',name:'美区 Google 账号',provider:'Google',account:'someone@example.com',region:'US'},
   {id:'u1',type:'subscription',name:'Notes Pro',provider:'Acme',purpose:'写作',date:day(-25),dateKind:'expire',cost:'$8/月'},
   {id:'u2',type:'subscription',name:'Design Studio',provider:'Acme',purpose:'界面设计',date:day(21),dateKind:'renew',cycle:'yearly',cost:'$96 / 年'},
   {id:'u3',type:'subscription',name:'Acme Cloud',provider:'Acme',date:day(70),dateKind:'renew',cycle:'quarterly',cost:'$12/月'},
   {id:'a1',type:'ai',name:'AI Pro',provider:'Acme AI',date:day(48),dateKind:'renew',cycle:'monthly',cost:'$20/月'},
   {id:'l1',type:'license',name:'Pixel Editor 3',provider:'Acme Soft',cost:'$59',date:day(500),dateKind:'expire'},
   ...['atlas-ui','notes-api','pixel-kit'].map((n,i)=>({id:'r'+i,type:'repository',name:'acme-labs/'+n,provider:'GitHub',account:'acme-labs',source:'github',externalId:'x'+i,event:i%2?'私有仓库':'公开仓库',pushedAt:new Date(Date.now()-i*5*86400000).toISOString()}))
  ].map(a=>({...base,links:[],...a}));
  save=()=>{};state={blocks:[],assets,cardOrder:{}};render();
 });
 // No reading of 正在做: the demo's made-up one is gone, and a page that has coding-sessions.js reads nothing.
 const noWork=p=>p.evaluate(()=>{window.assetboardDemoWork=null;if(typeof codingData==='function')window.codingData=()=>[];});
 try{
  // ---- The switch: cards until chosen, objects after, remembered on this device --------------------------------------------------
  const p=await open();
  await p.keyboard.press('p');await p.waitForTimeout(250);
  let st=await style(p);
  check(st.painted==='cards'&&st.pressed==='cards'&&!st.fell,'The panorama opens as cards until objects are chosen: '+JSON.stringify(st));
  const sw=await p.evaluate(()=>({label:document.querySelector('.pano-style').getAttribute('aria-label'),names:[...document.querySelectorAll('.pano-style .seg')].map(b=>b.textContent).join(),lens:document.querySelectorAll('.pano-lens .seg').length}));
  check(sw.label==='画法'&&sw.names==='卡片,实物'&&sw.lens>=2,'The bar has the 画法 switch beside the lenses: '+JSON.stringify(sw));
  await p.click('.pano-style [data-style="objects"]');await p.waitForTimeout(250);
  st=await style(p);
  check(st.painted==='objects'&&st.pressed==='objects'&&st.tier==='1'&&!st.fell,'实物 draws the scene at full size in a 1600×1000 window: '+JSON.stringify(st));
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard.panorama')).style==='objects'&&document.activeElement?.dataset.style==='objects'&&document.querySelector('#pano-live').textContent==='实物画法'),'The choice is saved, the switch keeps focus and the change is announced');
  check(await p.evaluate(()=>!document.querySelector('.pano-lens')&&!document.querySelector('.pano-card')&&document.querySelector('.pano-legend').hidden&&!!document.querySelector('.pano-tag')),'The lenses and the cards\' legend step aside; the status tag stays');

  // ---- One object per visible asset, each category as its own thing -------------------------------------------------------------
  const demo=await p.evaluate(()=>({visible:state.assets.filter(a=>!a.hiddenAt).map(a=>a.id).sort().join(),drawn:[...document.querySelectorAll('#panorama [data-obj]')].map(n=>n.dataset.chip).sort().join(),zones:[...document.querySelectorAll('.pz')].map(z=>z.dataset.zone+':'+z.querySelector('.pz-label').textContent).join(),hidden:!!document.querySelector('[data-chip="demo-d4"]')}));
  check(demo.visible===demo.drawn&&!demo.hidden,'Every visible asset is drawn once and the hidden domain is not: '+demo.drawn);
  check(demo.zones==='desk:本机,server:服务器,data:数据,domain:域名,wallet:付款与号码,id:登录账号,pass:订阅,repository:仓库','The zones in order: '+demo.zones);
  const sh=await shapes(p);
  check(JSON.stringify(sh)===JSON.stringify({mac:1,rack:2,tower:1,drum:2,plate:3,card:2,key:1,ticket:3,pass:5,folder:14}),'The demo board\'s things: '+JSON.stringify(sh));
  const homes=await p.evaluate(()=>[...document.querySelectorAll('.po-home')].map(h=>[h.className.replace('po-home ',''),h.querySelector('.po-roof b').textContent,!!h.querySelector('.po-cloud'),[...h.querySelectorAll('[data-obj]')].map(n=>n.dataset.chip).join(),h.getAttribute('aria-label')].join('|')));
  check(homes.join(' ; ')==='on-cloud|Cloudflare|true|demo-d3|Cloudflare，1 个域名 ; on-rail|Namecheap|false|demo-d1,demo-d2|Namecheap，2 个域名','Cloudflare\'s domain hangs under a cloud, Namecheap\'s under a rail with its name: '+homes.join(' ; '));
  const srv=await p.evaluate(()=>({nas:document.querySelector('[data-chip="demo-s3"]').dataset.obj,tag:document.querySelector('[data-chip="demo-s3"] .po-tag')?.textContent,nasLabel:document.querySelector('[data-chip="demo-s3"]').getAttribute('aria-label'),tokyo:document.querySelector('[data-chip="demo-s1"]').dataset.obj,ip:document.querySelector('[data-chip="demo-s1"] .ip-text').textContent,grill:!!document.querySelector('[data-chip="demo-s1"] .po-grill'),stack:document.querySelectorAll('.po-stack .po-rack').length,tokyoH:document.querySelector('[data-chip="demo-s1"]').offsetHeight,nasH:document.querySelector('[data-chip="demo-s3"]').offsetHeight}));
  check(srv.nas==='tower'&&srv.tag==='本地'&&/本地机器/.test(srv.nasLabel)&&srv.tokyo==='rack'&&srv.grill&&srv.stack===2&&srv.ip==='203.0.113.10'&&srv.nasH>srv.tokyoH*1.8,'Cloud servers are 1U chassis in a stack; the self-hosted one is a tower marked 本地: '+JSON.stringify(srv));
  const card=await p.evaluate(()=>{const n=document.querySelector('[data-chip="demo-c1"]');return {text:n.innerText.replace(/\s+/g,' ').trim(),pan:n.querySelector('.po-pan').textContent,label:n.getAttribute('aria-label'),digits:(n.innerText.match(/\d{5,}/g)||[]).length,chip:!!n.querySelector('.po-chip')};});
  check(card.pan==='•••• 4242'&&card.chip&&!card.digits&&/尾号 4242/.test(card.label)&&/Visa/.test(card.text),'A bank card shows its network and the tail of its number only: '+JSON.stringify(card));
  const db=await p.evaluate(()=>{const n=document.querySelector('[data-chip="demo-db1"]');return {obj:n.dataset.obj,text:n.innerText.replace(/\s+/g,' ').trim(),top:!!n.querySelector('.po-drumtop')};});
  check(db.obj==='drum'&&db.top&&/postgres-main/.test(db.text)&&/驻在 tokyo-vps/.test(db.text)&&/5432/.test(db.text),'A database is a drum that says where it sits: '+JSON.stringify(db));
  const neutral=await p.evaluate(()=>{const sat=c=>{const [r,g,b]=c.match(/[\d.]+/g).map(Number);const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return mx?(mx-mn)/mx:0;};return ['demo-c1','demo-db1','demo-s1','demo-g1','demo-r0'].map(id=>{const n=document.querySelector(`[data-chip="${id}"]`),el=n.dataset.obj==='key'?n.querySelector('.po-keytag'):n;return +sat(getComputedStyle(el).backgroundColor).toFixed(2);});});
  check(neutral.every(v=>v<.12),'Cards, drums, chassis and folders are neutral, never a hue: '+neutral.join());

  // ---- State: the date tints a plate, curls a ticket's corner, lights a lamp; words always say it ---------------------------------
  const state1=await p.evaluate(()=>{const q=id=>document.querySelector(`[data-chip="${id}"]`);return {d1:q('demo-d1').className,d1Label:q('demo-d1').getAttribute('aria-label'),d3:q('demo-d3').className,d3Text:q('demo-d3').querySelector('.po-when').textContent,d2:q('demo-d2').className,u1Curl:!!q('demo-u1').querySelector('.po-curl'),u1Stub:q('demo-u1').querySelector('.po-stub').textContent,u1Perf:!!q('demo-u1').querySelector('.po-perf'),u1Hole:!!q('demo-u1').querySelector('.po-hole'),u2Curl:!!q('demo-u2').querySelector('.po-curl'),u2Stub:q('demo-u2').querySelector('.po-stub').textContent,a1Clip:!!q('demo-a1').querySelector('.po-clip'),s1Led:q('demo-s1').querySelector('.po-led').className,s2Led:q('demo-s2').querySelector('.po-led').className,tally:document.querySelector('.po-tally').getAttribute('aria-label'),tag:document.querySelector('.pano-tag').textContent};});
  check(/\bamber\b/.test(state1.d1)&&/12 天后到期/.test(state1.d1Label)&&/Namecheap/.test(state1.d1Label)&&/\bred\b/.test(state1.d3)&&/已过期 2 天/.test(state1.d3Text)&&!/amber|red/.test(state1.d2),'A plate turns amber when due and red when expired, and says so: '+JSON.stringify(state1));
  check(state1.u1Curl&&state1.u1Hole&&state1.u1Perf&&state1.u1Stub==='月票'&&!state1.u2Curl&&state1.u2Stub==='年票'&&state1.a1Clip,'A ticket has its hole, tear line and stub (月票, 年票); one due soon curls a corner; an AI plan hangs on a clip: '+JSON.stringify(state1));
  check(state1.s1Led==='po-led amber'&&state1.s2Led==='po-led','A chassis lamp is amber when a charge is near and unlit otherwise (never green without a reading): '+state1.s1Led+' / '+state1.s2Led);
  const counts=await p.evaluate(()=>{const m=buildObjects(state.assets,{});return m.tally;});
  check(state1.tally===`${counts.ok} 正常，${counts.amber} 注意，${counts.red} 异常`&&counts.red===1&&counts.amber>=3,'The bar counts fine, needs a look, overdue: '+state1.tally);
  check(state1.tag==='登记状态 · 非实时','Without a reading the tag says recorded, not live: '+state1.tag);
  let lay=await layout(p);
  check(lay.n===34&&!lay.out.length&&!lay.over.length,'Nothing overlaps and nothing leaves the scene at 1600×1000: '+JSON.stringify(lay));

  // ---- The window: there, faint, still, out of the way ---------------------------------------------------------------------------
  const win=await p.evaluate(()=>{const w=document.querySelector('.po-window');return {hidden:w.getAttribute('aria-hidden'),events:getComputedStyle(w).pointerEvents,sun:getComputedStyle(w.querySelector('.sun')).display,moon:getComputedStyle(w.querySelector('.moon')).display,moving:document.querySelector('#panorama').getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.target?.closest?.('.pano-body')).length,scheme:document.documentElement.dataset.scheme};});
  check(win.hidden==='true'&&win.events==='none'&&win.sun!=='none'&&win.moon==='none'&&win.moving===0&&win.scheme==='light','By day (light) the window shows the sun; it takes no pointer and nothing in the scene moves: '+JSON.stringify(win));
  let cr=await contrast(p,'light demo');check(cr.checked>100&&!cr.found.length,`Light: text keeps its contrast (${cr.checked} checked):\n`+cr.found.join('\n'));

  // ---- The inspector, the keyboard, privacy --------------------------------------------------------------------------------------
  await p.click('[data-chip="demo-db1"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>!document.querySelector('#detail').hidden&&activeAsset==='demo-db1'&&!document.querySelector('#panorama').hidden),'Clicking an object opens its inspector over the scene');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  check(await p.evaluate(()=>document.querySelector('#detail').hidden&&!document.querySelector('#panorama').hidden),'Esc closes the inspector first');
  await p.focus('[data-chip="demo-s1"]');await p.keyboard.press('ArrowRight');
  check(await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-s2','→ walks the drawing order');
  await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-s2','↓ from the top chassis lands on the one under it: '+await p.evaluate(()=>document.activeElement.dataset.chip));
  await p.keyboard.press('ArrowDown');
  const below=await p.evaluate(()=>{const a=document.activeElement,s2=document.querySelector('[data-chip="demo-s2"]');return {id:a.dataset.chip,under:a.getBoundingClientRect().top>=s2.getBoundingClientRect().bottom-2};});
  check(below.id&&below.id!=='demo-s2'&&below.under,'↓ again leaves the stack for the nearest thing below: '+JSON.stringify(below));
  await p.keyboard.press('ArrowUp');check(await p.evaluate(()=>document.activeElement.dataset.chip)==='demo-s2','↑ goes back up');
  await p.keyboard.press('Enter');await p.waitForTimeout(250);
  check(await p.evaluate(()=>!document.querySelector('#detail').hidden&&activeAsset==='demo-s2'),'Enter opens the focused object');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await p.evaluate(()=>setPrivacy(true));await p.waitForTimeout(200);
  const veiled=await p.evaluate(()=>({name:document.querySelector('[data-chip="demo-s1"] .po-nm b').textContent,ip:document.querySelector('[data-chip="demo-s1"] .ip-text').textContent,label:document.querySelector('[data-chip="demo-s1"]').getAttribute('aria-label'),mail:document.querySelector('[data-chip="demo-g1"]').innerText,work:document.querySelector('[data-mac]').innerText,painted:document.querySelector('#panorama').dataset.style}));
  check(veiled.painted==='objects'&&!/tokyo-vps/.test(veiled.name+veiled.label)&&!/203\.0\.113\.10/.test(veiled.ip+veiled.label)&&!/someone|美区/.test(veiled.mail)&&!/atlas-ui/.test(veiled.work),'Privacy mode veils names, addresses, accounts and the repositories on the screen: '+JSON.stringify(veiled));
  await p.evaluate(()=>setPrivacy(false));await p.waitForTimeout(150);
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelector('#panorama').hidden),'Esc closes the panorama');
  // P on a board card: the scene opens with that asset's server in hand, not the cards' focused state.
  await p.focus('#board [data-asset="demo-d2"] .item-open');await p.keyboard.press('p');await p.waitForTimeout(250);
  check(await p.evaluate(()=>document.querySelector('#panorama').dataset.style==='objects'&&!document.querySelector('.pano-hero')&&document.activeElement.dataset.chip==='demo-s1'),'P on a mounted card opens the scene on its server');

  // ---- 正在做 on the Mac: the demo's reading, then the empty state ------------------------------------------------------------------
  const mac=await p.evaluate(()=>{const m=document.querySelector('[data-mac]');return {form:m.dataset.mac,n:m.dataset.sessions,head:m.querySelector('.po-work').textContent,lines:[...m.querySelectorAll('.po-work-l')].map(l=>l.textContent),label:m.getAttribute('aria-label'),role:m.getAttribute('role'),button:!!m.closest('button')||!!m.querySelector('button'),nav:m.hasAttribute('data-nav')};});
  check(mac.form==='laptop'&&mac.n==='4'&&mac.head==='正在做 · 4 个会话'&&mac.lines.join('|')==='Claude Code · 2 个会话 · atlas-ui · 38 分钟|Codex · 1 个会话 · pixel-kit · 12 分钟|Cursor · 1 个会话 · 260 分钟','The Mac\'s screen lists the demo\'s sessions by tool: '+JSON.stringify(mac));
  check(mac.button&&mac.nav&&/^studio-book，设备，Apple M3 Pro · 18 GB，正在做 · 4 个会话，Claude Code/.test(mac.label)&&await p.evaluate(()=>document.querySelector('[data-mac]').dataset.chip==='demo-m1'),'With this Mac\'s record (本机设备) the Mac is that record, a button that opens it: '+mac.label);
  // Without the record the Mac is only the carrier of the screen: a labelled group, nothing to open.
  await p.evaluate(()=>{state.assets=state.assets.filter(a=>a.type!=='device');panoramaRender();});
  const bare=await p.evaluate(()=>{const m=document.querySelector('[data-mac]');return {label:m.getAttribute('aria-label'),role:m.getAttribute('role'),button:!!m.closest('button'),chip:m.dataset.chip||''};});
  check(bare.role==='group'&&/^本机，正在做 · 4 个会话，Claude Code/.test(bare.label)&&!bare.button&&!bare.chip,'Without a device record the Mac is a labelled group, not an asset: '+JSON.stringify(bare));
  check(await p.evaluate(()=>!/\/Users\/|\/home\//.test(document.querySelector('[data-mac]').innerText)),'No path is shown on the screen');
  await noWork(p);await p.evaluate(()=>panoramaRender());
  const idle=await p.evaluate(()=>{const m=document.querySelector('[data-mac]');return {n:m.dataset.sessions,cls:m.className,text:m.querySelector('.po-screen').innerText.replace(/\s+/g,' ').trim(),label:m.getAttribute('aria-label'),h:m.offsetHeight,tone:m.querySelectorAll('.red,.amber,.po-stamp').length};});
  check(idle.n==='0'&&/no-work/.test(idle.cls)&&idle.text==='本机 正在做 现在没有会话'&&idle.label==='本机，正在做，现在没有会话'&&!idle.tone&&idle.h>150,'Without a reading the screen keeps its place and says so quietly, with no fault colour: '+JSON.stringify(idle));
  cr=await contrast(p,'light empty screen');check(!cr.found.length,'The empty screen keeps its contrast:\n'+cr.found.join('\n'));
  // coding-sessions.js's interface, once the page has it: codingData() gives the readings, codingSummary() sums them.
  await p.evaluate(()=>{
   const at=m=>new Date(Date.now()-m*60000-5000).toISOString();
   window.codingData=()=>[{host:{id:'local',kind:'local',name:'Mac mini'},at:at(0),sessions:[{tool:'codex',pid:7,repo:'ledger-cli',branch:'main',detached:false,path:'~/projects/ledger-cli',startedAt:at(9),activeAt:at(1),tracked:true}]},{host:{id:'srv',kind:'server',name:'tokyo'},at:at(0),sessions:[{tool:'claude',pid:9,repo:'elsewhere',branch:'main',detached:false,path:'~',startedAt:at(3),activeAt:at(1),tracked:true}]}];
   window.codingSummary=(readings,now)=>{window.__summed=readings.map(r=>r.host.id).join();return sessionSummary(readings,now);};
   panoramaRender();
  });
  const fed=await p.evaluate(()=>{const m=document.querySelector('[data-mac]');return {form:m.dataset.mac,head:m.querySelector('.po-work').textContent,lines:[...m.querySelectorAll('.po-work-l')].map(l=>l.textContent).join('|'),summed:window.__summed,box:!!m.querySelector('.po-box')};});
  check(fed.head==='正在做 · 1 个会话'&&fed.lines==='Codex · 1 个会话 · ledger-cli · 9 分钟'&&fed.summed==='local'&&fed.form==='mini'&&fed.box,'With coding-sessions.js on the page its codingData() and codingSummary() feed the screen: this Mac\'s reading only, a desktop when the host says Mac mini: '+JSON.stringify(fed));
  lay=await layout(p);check(!lay.out.length&&!lay.over.length,'The desktop Mac sits in the scene without overlap: '+JSON.stringify(lay));
  await p.evaluate(()=>{delete window.codingData;delete window.codingSummary;});

  // ---- Live readings come through the existing slot; nothing here asks for them ---------------------------------------------------
  await p.evaluate(()=>{window.__probe=proSlots.serverProbe;proSlots.serverProbe={status:a=>a.id==='demo-s2'?{text:'在线',tone:'',online:true}:a.id==='demo-s3'?{text:'离线 · 3 分钟前',tone:'red',online:false}:null,rowHtml:()=>'',panoHtml:a=>a.id==='demo-s2'?'<span class="pano-probe live-line on" data-probe-pano="demo-s2">CPU 8%</span>':''};render();});
  const live=await p.evaluate(()=>{const q=id=>document.querySelector(`[data-chip="${id}"]`);return {s2:q('demo-s2').querySelector('.po-led').className,s2Stat:q('demo-s2').querySelector('.po-stat').textContent,gauge:q('demo-s2').querySelector('.pano-probe')?.textContent,s3:q('demo-s3').querySelector('.po-led').className,s3Stat:q('demo-s3').querySelector('.po-stat').textContent,s1:q('demo-s1').querySelector('.po-led').className,s1Gauge:!!q('demo-s1').querySelector('.pano-probe'),tag:document.querySelector('.pano-tag').textContent,painted:document.querySelector('#panorama').dataset.style};});
  check(live.painted==='objects'&&live.s2==='po-led green'&&live.s2Stat==='在线'&&live.gauge==='CPU 8%'&&live.s3==='po-led red'&&/离线 · 3 分钟前/.test(live.s3Stat)&&live.s1==='po-led amber'&&!live.s1Gauge,'A reading lights the lamp (green up, red down) and adds its line; a server without one keeps its registered state: '+JSON.stringify(live));
  check(live.tag==='登记状态 · 含实时读数','With readings on the board the tag says so: '+live.tag);
  await p.evaluate(()=>{proSlots.serverProbe=window.__probe;render();});
  check(await p.evaluate(()=>document.querySelector('.pano-tag').textContent==='登记状态 · 非实时'&&document.querySelector('[data-chip="demo-s2"] .po-led').className==='po-led'),'Readings gone, the lamps go out: only what is registered is drawn');

  // ---- Every category, each its own thing ---------------------------------------------------------------------------------------
  await fullBoard(p);await p.waitForTimeout(200);
  const all=await shapes(p);
  check(JSON.stringify(all)===JSON.stringify({rack:3,tower:1,drum:1,bucket:1,container:1,plate:5,card:2,sim:1,passport:1,key:1,ticket:3,pass:1,deed:1,folder:3}),'Every category is drawn as its own thing: '+JSON.stringify(all));
  const full=await p.evaluate(()=>{const q=id=>document.querySelector(`[data-chip="${id}"]`),t=id=>q(id).innerText.replace(/\s+/g,' ').trim();return {
   homes:[...document.querySelectorAll('.po-home')].map(h=>h.className.replace('po-home ','')+':'+h.querySelector('.po-roof b').textContent).join(),
   stamp:q('u1').querySelector('.po-stamp')?.textContent,u1:q('u1').className,u1Curl:!!q('u1').querySelector('.po-curl'),u2Curl:!!q('u2').querySelector('.po-curl'),u3Stub:q('u3').querySelector('.po-stub').textContent,u1Label:q('u1').getAttribute('aria-label'),
   stopped:q('s4').className,stoppedStat:q('s4').querySelector('.po-stat').textContent,stoppedLed:q('s4').querySelector('.po-led').className,nas:q('s3').dataset.obj,
   sim:t('p1'),passport:t('ap1'),key:t('g1'),deed:t('l1'),seal:!!q('l1').querySelector('.po-seal'),bucket:t('st1'),bail:!!q('st1').querySelector('.po-bail'),container:t('dp1'),doors:!!q('dp1').querySelector('.po-doors'),
   lock:[...document.querySelectorAll('.po-folder')].map(f=>!!f.querySelector('.ui-icon')).join(),c2:t('c2'),c1When:!!q('c1').querySelector('.po-when'),d5Label:q('d5').getAttribute('aria-label')};});
  check(full.homes==='on-cloud:Cloudflare,on-rail:Namecheap,on-rail:Porkbun,on-none:未记注册商'&&/未记注册商/.test(full.d5Label),'Each registrar has its own rail, and a domain without one is not passed off as Cloudflare\'s: '+full.homes);
  check(full.stamp==='过期'&&/\bred\b/.test(full.u1)&&!full.u1Curl&&full.u2Curl&&full.u3Stub==='季票'&&/已过期 25 天/.test(full.u1Label),'An overdue ticket is stamped 过期, one due soon curls: '+JSON.stringify([full.stamp,full.u1,full.u2Curl,full.u3Stub]));
  check(/stopped/.test(full.stopped)&&full.stoppedStat==='已停用'&&full.stoppedLed==='po-led off'&&full.nas==='tower','A stopped server says 已停用 with its lamp out: '+full.stopped);
  check(/保号小号/.test(full.sim)&&/\+1 ••• 0199/.test(full.sim)&&!/555 010/.test(full.sim)&&/示例运营商/.test(full.sim),'A phone number is a SIM with the middle of the number covered: '+full.sim);
  check(/^Apple ID 美区 Apple ID so•••@example\.com 美国$/.test(full.passport)&&/美区 Google 账号 so•••@example\.com 美国/.test(full.key),'An Apple ID is a passport with its region, a Google account a key with a name tag; the mail is covered: '+full.passport+' / '+full.key);
  check(/Pixel Editor 3 Acme Soft \$59/.test(full.deed)&&full.seal&&/photo-archive R2/.test(full.bucket)&&full.bail&&/notes-web Pages/.test(full.container)&&full.doors,'A licence is a deed with a seal, object storage a pail, a deployment service a container: '+[full.deed,full.bucket,full.container].join(' / '));
  check(full.lock==='false,true,false'&&/24 天后到期/.test(full.c2)&&!full.c1When,'A private repository carries a lock; a card says when it is about to expire and is quiet otherwise: '+full.lock+' '+full.c2);
  lay=await layout(p);check(lay.n===26&&!lay.out.length&&!lay.over.length,'The full board: nothing overlaps, nothing leaves the scene: '+JSON.stringify(lay));
  cr=await contrast(p,'light full');check(!cr.found.length,`Light, every category: contrast (${cr.checked} checked):\n`+cr.found.join('\n'));
  // S marks a thing stopped from the scene, as on the cards.
  await p.focus('[data-chip="s2"]');await p.keyboard.press('s');await p.waitForTimeout(200);
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='s2').stopped===true&&/stopped/.test(document.querySelector('[data-chip="s2"]').className)&&document.activeElement.dataset.chip==='s2'),'S on an object marks it stopped and keeps focus');

  // ---- Too much for a screen: cards, with nothing dropped; back to objects when it fits ------------------------------------------
  await p.evaluate(()=>{const extra=Array.from({length:150},(_,i)=>({id:'x'+i,type:'repository',name:'acme-labs/repo-'+i,provider:'GitHub',account:'acme-labs',source:'manual',art:'generic',cost:'未知',url:'',notes:'',links:[]}));window.__few=state.assets;state={...state,assets:[...state.assets,...extra]};render();});
  st=await style(p);
  const fellBack=await p.evaluate(()=>({objects:document.querySelectorAll('#panorama [data-obj]').length,cards:document.querySelectorAll('.pano-card').length,lens:!!document.querySelector('.pano-lens'),repos:[...document.querySelectorAll('.pano-total')].map(t=>t.getAttribute('aria-label')).find(t=>/^仓库/.test(t)),note:document.querySelector('.pano-fell')?.getAttribute('role')}));
  check(st.painted==='cards'&&st.pressed==='objects'&&st.fell==='放不下，先用卡片'&&!fellBack.objects&&fellBack.cards>0&&fellBack.lens&&fellBack.repos==='仓库 153'&&fellBack.note==='note','173 things do not fit: the whole board is drawn as cards, the choice stays, the bar says why, and every repository is still counted: '+JSON.stringify({st,fellBack}));
  await p.evaluate(()=>{state={...state,assets:window.__few};render();});
  st=await style(p);check(st.painted==='objects'&&!st.fell,'Fewer things: the scene comes back by itself: '+JSON.stringify(st));
  await p.click('.pano-style [data-style="cards"]');await p.waitForTimeout(200);
  st=await style(p);check(st.painted==='cards'&&st.pressed==='cards'&&!st.fell&&await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard.panorama')).style==='cards'&&!document.querySelector('.pano-body.objects')),'卡片 switches back, and that is saved: '+JSON.stringify(st));

  // ---- A smaller window: the scene steps down a size, then gives way to cards; resizing brings it back ------------------------
  const q=await open({width:1400,height:900});
  await q.evaluate(()=>{localStorage.setItem('assetboard.panorama',JSON.stringify({lens:'',hide:{},style:'objects'}));});
  await q.reload();await until(q,()=>typeof objectsPaint==='function');await q.waitForTimeout(200);
  await q.keyboard.press('p');await q.waitForTimeout(250);
  st=await style(q);check(st.painted==='objects'&&st.pressed==='objects','The saved choice opens the scene: '+JSON.stringify(st));
  lay=await layout(q);check(lay.n===34&&!lay.out.length&&!lay.over.length,'1400×900: all 33 things and the Mac, no overlap: '+JSON.stringify(lay));
  await q.setViewportSize({width:1240,height:760});await q.waitForTimeout(350);
  st=await style(q);lay=st.painted==='objects'?await layout(q):null;
  check(st.painted==='cards'||(st.tier==='0.86'&&lay.n===34&&!lay.out.length&&!lay.over.length),'1240×760: the smaller size with everything in it, or cards: '+JSON.stringify({st,lay}));
  const small=await q.evaluate(()=>{const s=document.querySelector('.po-scene');return s?{zoom:s.style.zoom,font:parseFloat(getComputedStyle(document.querySelector('.po-cap')).fontSize)*parseFloat(s.style.zoom)}:null;});
  check(!small||small.font>=9.5,'The smaller size keeps its captions readable: '+JSON.stringify(small));
  await q.setViewportSize({width:1000,height:760});await q.waitForTimeout(350);
  st=await style(q);
  const narrow=await q.evaluate(()=>({w:document.querySelector('#panorama').clientWidth,cards:document.querySelectorAll('.pano-card').length,objects:document.querySelectorAll('#panorama [data-obj]').length,chips:new Set([...document.querySelectorAll('.pano-chip')].map(c=>c.dataset.chip)).size,sw:!!document.querySelector('.pano-style [data-style="objects"][aria-pressed="true"]')}));
  check(st.painted==='cards'&&st.pressed==='objects'&&st.fell&&narrow.w<900&&narrow.cards===3&&!narrow.objects&&narrow.sw,'A narrow window (under 900 px of panorama) draws the cards, with the choice kept: '+JSON.stringify({st,narrow}));
  // The sidebar changes the panorama's width without the window changing: the scene is measured again, never clipped.
  await q.setViewportSize({width:1180,height:860});await q.waitForTimeout(350);
  const widths=[];
  for(const step of ['fold','unfold']){
   await q.evaluate(()=>document.querySelector('#sidebar-toggle').click());await q.waitForTimeout(600);
   st=await style(q);lay=st.painted==='objects'?await layout(q):null;
   const width=await q.evaluate(()=>document.querySelector('#panorama').clientWidth);
   check(st.painted==='objects'?lay.n===34&&!lay.out.length&&!lay.over.length:st.fell&&(await q.evaluate(()=>document.querySelectorAll('.pano-card').length))===3,`Sidebar ${step} (panorama ${width} px): the whole scene or the cards, never a clipped scene: `+JSON.stringify({st,lay}));
   widths.push(width);
  }
  check(widths[0]>widths[1]+100,'Folding the sidebar gave the panorama its width: '+widths.join(' → '));
  // The bar keeps its title on one line and its close button in reach at every width, in both drawings.
  for(const width of [1240,1000,900,800,700]){
   await q.setViewportSize({width,height:760});await q.waitForTimeout(250);
   const bar=await q.evaluate(()=>{const b=document.querySelector('.pano-bar').getBoundingClientRect(),c=document.querySelector('.pano-close').getBoundingClientRect(),s=document.querySelector('.pano-style').getBoundingClientRect(),t=document.querySelector('.pano-title');return {close:Math.round(c.right-b.right),sw:Math.round(s.right-b.right),lines:Math.round(t.offsetHeight/parseFloat(getComputedStyle(t).lineHeight)||1),tip:document.querySelector('.pano-style [data-style="objects"]').title};});
   check(bar.close<=0&&bar.sw<=0&&bar.lines<=1&&(width>=1240||bar.tip==='放不下，先用卡片'),`At ${width} px the bar still holds the switch and the close button: `+JSON.stringify(bar));
  }
  await q.setViewportSize({width:1600,height:560});await q.waitForTimeout(350);
  st=await style(q);check(st.painted==='cards'&&st.fell,'A short window too: '+JSON.stringify(st));
  await q.setViewportSize({width:1600,height:1000});await q.waitForTimeout(350);
  st=await style(q);check(st.painted==='objects'&&st.tier==='1'&&!st.fell,'Wide and tall again: the scene is back at full size: '+JSON.stringify(st));

  // ---- Night: the dark board, the moon, the same contrast ------------------------------------------------------------------------
  const d=await open({scheme:'dark'});
  await d.keyboard.press('p');await d.waitForTimeout(250);await d.click('.pano-style [data-style="objects"]');await d.waitForTimeout(250);
  const night=await d.evaluate(()=>{const w=document.querySelector('.po-window');return {scheme:document.documentElement.dataset.scheme,sun:getComputedStyle(w.querySelector('.sun')).display,moon:getComputedStyle(w.querySelector('.moon')).display,painted:document.querySelector('#panorama').dataset.style,sky:getComputedStyle(w.querySelector('.sky')).fill};});
  check(night.scheme==='dark'&&night.painted==='objects'&&night.sun==='none'&&night.moon!=='none','By night (dark) the window shows the moon: '+JSON.stringify(night));
  cr=await contrast(d,'dark demo');check(cr.checked>100&&!cr.found.length,`Dark: text keeps its contrast (${cr.checked} checked):\n`+cr.found.join('\n'));
  await noWork(d);await fullBoard(d);await d.waitForTimeout(200);
  cr=await contrast(d,'dark full');check(!cr.found.length,`Dark, every category and the empty screen: contrast (${cr.checked} checked):\n`+cr.found.join('\n'));
  lay=await layout(d);check(!lay.out.length&&!lay.over.length,'Dark: nothing overlaps: '+JSON.stringify(lay));
  // The dark fridge door is night as well: the drawing follows the board's light or dark, whatever sets it.
  const e=await open({scheme:'light',init:()=>{try{localStorage.setItem('assetboard-skin-v1','magnet');localStorage.setItem('assetboard-fridge-scene-v1','city');}catch{}}});
  await e.keyboard.press('p');await e.waitForTimeout(250);await e.click('.pano-style [data-style="objects"]');await e.waitForTimeout(250);
  const door=await e.evaluate(()=>({scheme:document.documentElement.dataset.scheme,moon:getComputedStyle(document.querySelector('.po-window .moon')).display,painted:document.querySelector('#panorama').dataset.style}));
  check(door.scheme==='dark'&&door.moon!=='none'&&door.painted==='objects','A dark 冰箱贴 door is night too: '+JSON.stringify(door));
  cr=await contrast(e,'dark door');check(!cr.found.length,'On the dark door:\n'+cr.found.join('\n'));

  // ---- A new reading from coding-sessions.js redraws the screen and only the screen ----------------------------------------------
  // Stood in for here on a page without the module (with it, the demo board's reading never changes).
  if(!await p.evaluate(()=>typeof parseCodingAnswer==='function')){
  const f=await open({init:()=>{window.__readings=[];window.codingData=()=>window.__readings;window.assetboardCodingSessions=reading=>{window.__readings=[reading];};}});
  await f.keyboard.press('p');await f.waitForTimeout(250);await f.click('.pano-style [data-style="objects"]');await f.waitForTimeout(250);
  check(await f.evaluate(()=>document.querySelector('[data-mac]').dataset.sessions)==='0','The module is on the page and has read nothing yet: the empty state, not the demo\'s reading');
  await f.evaluate(()=>{document.querySelector('[data-chip="demo-s1"]').dataset.kept='1';const at=m=>new Date(Date.now()-m*60000-5000).toISOString();window.assetboardCodingSessions({host:{id:'local',kind:'local',name:''},at:at(0),sessions:[{tool:'claude',pid:1,repo:'atlas-ui',branch:'main',detached:false,path:'~/projects/atlas-ui',startedAt:at(4),activeAt:at(0),tracked:true}]});});
  const pushed=await f.evaluate(()=>({head:document.querySelector('[data-mac] .po-work').textContent,line:document.querySelector('[data-mac] .po-work-l').textContent,kept:document.querySelector('[data-chip="demo-s1"]').dataset.kept,stored:window.__readings.length}));
  check(pushed.head==='正在做 · 1 个会话'&&pushed.line==='Claude Code · 1 个会话 · atlas-ui · 4 分钟'&&pushed.kept==='1'&&pushed.stored===1,'A reading handed to assetboardCodingSessions reaches the module and the screen, and the rest of the scene is left alone: '+JSON.stringify(pushed));
  }

  // ---- English -------------------------------------------------------------------------------------------------------------------
  const en=await open({query:'?demo&lang=en'});
  await en.keyboard.press('p');await en.waitForTimeout(250);await en.click('.pano-style [data-style="objects"]');await en.waitForTimeout(250);
  const eng=await en.evaluate(()=>({sw:[...document.querySelectorAll('.pano-style .seg')].map(b=>b.textContent).join(),head:document.querySelector('[data-mac] .po-work').textContent,line:document.querySelector('[data-mac] .po-work-l').textContent,zones:[...document.querySelectorAll('.pz-label')].map(z=>z.textContent).join(),cjk:[...document.querySelectorAll('.pano-bar,.po-scene')].map(n=>n.innerText).join(' ').match(/[㐀-鿿]+/g)||[]}));
  check(eng.sw==='Cards,Objects'&&eng.head==='In progress · 4 sessions'&&eng.line==='Claude Code · 2 sessions · atlas-ui · 38 minutes'&&!eng.cjk.length,'In English: '+JSON.stringify(eng));
  lay=await layout(en);check(!lay.out.length&&!lay.over.length,'English: nothing overlaps: '+JSON.stringify(lay));
  check(!errors.length,'No page errors: '+errors.join(' | '));
  return 'panorama objects ok';
 }finally{for(const c of contexts)await c.close();}
}
