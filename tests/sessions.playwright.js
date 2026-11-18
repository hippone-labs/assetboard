// Run with the browser tool's filename option. 正在做: the demo's sessions under the overview of 全部资产 (the count, each tool's
// sessions with repository, branch and time, the idle one grey), light and dark (contrast), under 冰箱贴, at 390px, in English and
// with names masked; only in 全部资产; 设置 › 功能 switches it off and on apart from AI 额度与用量 and 外部工具接入; then a faked Mac
// host (not demo): the page asks at launch with nothing but a request id, the answer comes back through assetboardCodingSessions,
// arguments and anything unlisted in it are never shown or kept, the reading stays out of the board, localStorage and what AI tools
// are given, a failed read clears the block, and the switch stops the asking. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const audit=(p,selector)=>p.evaluate(selector=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll(selector)].filter(el=>!el.closest('[aria-hidden="true"]')&&!el.classList.contains('sr-only')&&el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>{
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const [x,y]=[lum(over(parse(getComputedStyle(el).color),bg)),lum(bg)].sort((m,n)=>n-m);return {text:el.textContent.trim().slice(0,40),ratio:(x+.05)/(y+.05)};
  });
 },selector);
 const contexts=[];
 const open=async({scheme='light',width=1400,url='?demo',init=null}={})=>{
  const context=await page.context().browser().newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce',locale:'zh-CN'});contexts.push(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(init)await p.addInitScript(init);
  await p.goto('http://127.0.0.1:4317/'+url);
  await until(p,()=>typeof codingHtml==='function'&&typeof render==='function');
  return {p,errors};
 };
 const block=p=>p.evaluate(()=>{const el=document.querySelector('#board .doing');if(!el)return null;const text=n=>n?.textContent.replace(/\s+/g,' ').trim()||'';
  return {n:text(el.querySelector('.doing-main .ov-value')),note:text(el.querySelector('.doing-main .ov-note')),after:el.previousElementSibling?.className||'',
   tools:[...el.querySelectorAll('.doing-tool')].map(t=>({label:t.getAttribute('aria-label'),name:text(t.querySelector('.doing-name b')),n:text(t.querySelector('.doing-n')),
    sessions:[...t.querySelectorAll('.doing-session')].map(s=>({cls:s.className.replace('doing-session ','').trim(),repo:text(s.querySelector('.doing-repo')),branch:text(s.querySelector('.doing-branch')),time:text(s.querySelector('.doing-time')),title:s.title,
     dot:getComputedStyle(s.querySelector('.doing-dot')).backgroundColor,color:getComputedStyle(s.querySelector('.doing-repo')||s).color}))}))};});
 try {
  for(const scheme of ['light','dark']){
   const {p,errors}=await open({scheme});
   const b=await block(p);
   check(b&&b.n==='4'&&/^个会话 · 1 个空闲 · 本机$/.test(b.note)&&/overview/.test(b.after),'the count leads, under the overview: '+JSON.stringify(b));
   check(b.tools.map(t=>`${t.name}|${t.n}`).join()==='Claude Code|2 个会话,Codex|1 个会话,Cursor|1 个会话','each tool and its sessions: '+JSON.stringify(b.tools));
   check(b.tools[0].label==='Claude Code · 2 个会话 · atlas-ui · 38 分钟','the tool in one line: '+b.tools[0].label);
   const [busy,idle]=b.tools[0].sessions;
   check(busy.cls==='active'&&busy.repo==='atlas-ui'&&busy.branch==='feat/column-widths'&&busy.time==='38 分钟','the busy session: '+JSON.stringify(busy));
   check(idle.cls==='idle'&&idle.repo==='notes-api'&&idle.branch==='fix/token-refresh'&&/^2 小时 15 分钟 ?· ?空闲$/.test(idle.time)&&/最近一次写入 47 分钟前/.test(idle.title),'the idle one, named after the main repository of its worktree: '+JSON.stringify(idle));
   check(idle.color!==busy.color&&/rgba\(0, 0, 0, 0\)|transparent/.test(idle.dot)&&!/rgba\(0, 0, 0, 0\)/.test(busy.dot),'idle is grey with a hollow dot: '+JSON.stringify([busy.color,idle.color,busy.dot,idle.dot]));
   check(busy.title==='~/projects/atlas-ui','the folder, from ~: '+busy.title);
   const cursor=b.tools[2].sessions[0];
   check(cursor.cls==='running'&&!cursor.repo&&!cursor.branch&&/运行中/.test(cursor.time)&&/4 小时 20 分钟/.test(cursor.time),'an application is only said to run: '+JSON.stringify(cursor));
   // Neutral: no red, amber or accent anywhere in the block.
   const hues=await p.evaluate(()=>[...document.querySelectorAll('#board .doing, #board .doing *')].flatMap(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor,s.boxShadow];}).join(' ').match(/rgba?\([^)]+\)/g).map(c=>c.match(/[\d.]+/g).map(Number)).filter(([r,g,b,a=1])=>a>0&&Math.max(r,g,b)-Math.min(r,g,b)>28));
   check(!hues.length,`${scheme}: only greys: `+JSON.stringify(hues.slice(0,4)));
   const low=(await audit(p,'#board .doing *')).filter(x=>x.ratio<4.5);
   check(!low.length,`${scheme}: low contrast `+JSON.stringify(low.slice(0,4)));
   check(await p.evaluate(()=>!document.querySelector('.doing button,.doing a,.doing [data-action]')),'nothing to press');
   // Only in 全部资产; not in a category, 即将到来 or a search.
   for(const view of ['repository','upcoming','ai']){await p.evaluate(v=>setView(v),view);check(!(await block(p)),`not in ${view}`);}
   await p.evaluate(()=>setView('all'));check(!!(await block(p)),'back in 全部资产');
   for(const layout of ['list','grid']){await p.evaluate(l=>setLayout(l),layout);check((await block(p))?.n==='4',`in the ${layout} layout`);}
   // Names masked with the board's.
   await p.evaluate(()=>setPrivacy(true));
   const masked=await block(p);
   check(masked.tools[0].sessions[0].repo!=='atlas-ui'&&masked.tools[0].sessions[0].branch!=='feat/column-widths'&&!masked.tools[0].sessions[0].title&&!/atlas-ui/.test(masked.tools[0].label)&&masked.n==='4','masked with the board: '+JSON.stringify(masked.tools[0]));
   await p.evaluate(()=>setPrivacy(false));
   // The demo keeps nothing and no AI tool is given it.
   check(await p.evaluate(()=>!JSON.stringify(state).includes('column-widths')&&!JSON.stringify({...localStorage}).includes('column-widths')),'never in the board or localStorage');
   check(!errors.length,errors.join(' | '));
  }
  // 设置 › 功能: its own switch, apart from AI 额度与用量 and 外部工具接入.
  {const {p,errors}=await open();
   await p.evaluate(()=>prefsDialog('features'));
   const row=await p.evaluate(()=>{const t=document.querySelector('#modal [data-action="prefs-feature"][data-id="codingSessions"]');return t&&{on:t.checked,text:t.closest('.prefs-row,label,div')?.parentElement?.textContent||'',others:['aiUsage','agent','pulls'].map(id=>document.querySelector(`#modal [data-action="prefs-feature"][data-id="${id}"]`)?.checked)};});
   check(row&&row.on&&row.others.every(v=>v===true),'a switch of its own, on: '+JSON.stringify(row));
   check(await p.evaluate(()=>/不读对话内容和命令行参数/.test(FEATURES.codingSessions.note)&&FEATURES.codingSessions.on===true&&!FEATURES.codingSessions.pro&&!FEATURES.codingSessions.full),'free, on, and says what it reads');
   await p.click('#modal [data-action="prefs-feature"][data-id="codingSessions"]');
   check(await p.evaluate(()=>!featureOn('codingSessions')&&featureOn('aiUsage')&&featureOn('agent')&&!document.querySelector('#board .doing')&&!!document.querySelector('#board .overview')),'off: the block goes, the other features stay');
   await p.click('#modal [data-action="prefs-feature"][data-id="codingSessions"]');
   check(await p.evaluate(()=>featureOn('codingSessions')&&!!document.querySelector('#board .doing')),'on again');
   await p.evaluate(()=>{setFeatureNow('aiUsage',false);setFeatureNow('agent',false);});
   check(await p.evaluate(()=>!!document.querySelector('#board .doing')),'AI 额度与用量 and 外部工具接入 off leave it');
   check(!errors.length,errors.join(' | '));}
  // 390px fits; English.
  {const {p,errors}=await open({width:390});
   check(await p.evaluate(()=>!!document.querySelector('#board .doing')&&document.documentElement.scrollWidth<=391&&[...document.querySelectorAll('.doing-session')].every(s=>s.getBoundingClientRect().right<=391)),'fits 390px');
   check(!errors.length,errors.join(' | '));}
  {const {p,errors}=await open({url:'?demo&lang=en'});
   const b=await block(p);
   check(b.n==='4'&&b.note==='sessions · 1 idle · this Mac'&&b.tools[0].label==='Claude Code · 2 sessions · atlas-ui · 38 minutes'&&/Idle/.test(b.tools[0].sessions[1].time)&&!/[一-鿿]/.test(JSON.stringify(b)),'English: '+JSON.stringify(b));
   check(!errors.length,errors.join(' | '));}
  // 冰箱贴: on the door, readable.
  {const {p,errors}=await open({init:"localStorage.setItem('assetboard-skin-v1','magnet')"});
   check(await p.evaluate(()=>document.documentElement.dataset.skin==='magnet'&&!!document.querySelector('#board .doing')),'冰箱贴 shows it');
   const low=(await audit(p,'#board .doing *')).filter(x=>x.ratio<4.5);
   check(!low.length,'冰箱贴: low contrast '+JSON.stringify(low.slice(0,4)));
   check(!errors.length,errors.join(' | '));}
  // The browser without the demo has no Mac to ask: nothing shown, no switch.
  {const {p,errors}=await open({url:''});
   await p.evaluate(()=>{state.assets=[{id:'a1',type:'domain',name:'one.example.com',cost:'未知',art:'generic'}];save=()=>{};render();prefsDialog('features');});
   check(await p.evaluate(()=>!document.querySelector('#board .doing')&&!document.querySelector('#modal [data-id="codingSessions"]')),'the browser offers none of it');
   check(!errors.length,errors.join(' | '));}

  // A faked Mac host.
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[],assets:[{id:'d1',type:'domain',name:'one.example.com',cost:'未知',art:'generic'}]}};
  };
  const {p,errors}=await open({url:'',init:`(${host.toString()})();`});
  await p.evaluate(()=>{save=()=>{};});
  const ask=await until(p,()=>window.__sent.find(m=>m.action==='codingSessions'));
  check(JSON.stringify(Object.keys(ask).sort())==='["action","requestId"]'&&ask.requestId>0,'asks with a request id and nothing else: '+JSON.stringify(ask));
  check(!(await block(p)),'nothing before the first reading');
  const now=Date.now()/1000,ago=m=>Math.round(now-m*60-20),home='/Users/demo';
  const answer={ok:true,at:new Date().toISOString(),home,requestId:ask.requestId,
   processes:[{pid:1,ppid:0},{pid:9,ppid:1,name:'claude',path:'/opt/homebrew/bin/claude',cwd:home+'/projects/api',start:ago(50),args:'claude -p SECRET-PROMPT',env:'TOKEN=SECRET-TOKEN'},
    {pid:10,ppid:1,name:'codex',path:'/opt/homebrew/bin/codex',cwd:home+'/projects/<img src=x onerror=window.__x=1>',start:ago(5)}],
   repos:{[home+'/projects/api']:{root:home+'/projects/api',gitdir:home+'/projects/api/.git',head:'ref: refs/heads/main',config:'SECRET-REMOTE'}},
   files:{claude:[{dir:'-Users-demo-projects-api',mtime:ago(30),birth:ago(50),name:'SECRET-FILE.jsonl',text:'SECRET-WORDS'}]}};
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);
  const read=await block(p);
  check(read&&read.n==='2'&&read.tools[0].label==='Claude Code · 1 个会话 · api · 50 分钟'&&read.tools[0].sessions[0].cls==='idle'&&read.tools[0].sessions[0].branch==='main','the answer is drawn: '+JSON.stringify(read));
  check(read.tools[1].sessions[0].repo==='<img src=x onerror=window.__x=1>'&&await p.evaluate(()=>!window.__x&&!document.querySelector('.doing img')),'a folder’s name is text, never markup');
  const kept=await p.evaluate(()=>JSON.stringify([codingReadings,state,{...localStorage},{...sessionStorage},document.querySelector('#board').innerHTML]));
  check(!/SECRET/.test(kept),'arguments, environment, file names and contents never reach the page’s memory, the board or storage');
  check(!/projects\/api|refs\/heads/.test(await p.evaluate(()=>JSON.stringify([state,{...localStorage}]))),'the reading is in memory only');
  // AI tools are not given it: no method, and no answer of theirs carries a session.
  const agent=await p.evaluate(()=>{const call=(method,params={})=>assetboardAgent({method,params});return JSON.stringify([Object.keys(agentMethods),call('hello'),call('list'),call('types'),call('codingSessions'),call('sessions')]);});
  check(!/codingSessions"|"sessions"/.test(JSON.parse(agent)[0].join('","')+'"')&&!/projects\/api|feat\/|"main"/.test(agent)&&/"ok":false/.test(JSON.stringify(JSON.parse(agent)[4])),'MCP and assetboard-cli have no way to read it: '+agent.slice(0,200));
  // The durations and the next reading redraw the block alone.
  await p.evaluate(()=>{window.__renders=0;const r=render;render=(...a)=>{window.__renders++;return r(...a);};window.__sent.length=0;codingAsked=0;codingDue();});
  const again=await until(p,()=>window.__sent.find(m=>m.action==='codingSessions'));
  answer.processes[1].cwd=home+'/projects/web';answer.repos={};
  await p.evaluate(a=>window.assetboardCodingSessions(a),{...answer,requestId:again.requestId});
  check((await block(p)).tools[0].sessions[0].repo==='web'&&await p.evaluate(()=>window.__renders===0),'a new reading replaces the block without drawing the board again');
  // A failed read shows nothing stale.
  await p.evaluate(()=>window.assetboardCodingSessions({ok:false}));
  check(!(await block(p)),'a failed read clears it');
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);check(!!(await block(p)),'and the next good one brings it back');
  // Off: forgotten, and the Mac is not asked again; on: asked at once.
  await p.evaluate(()=>{window.__sent.length=0;setFeatureNow('codingSessions',false);codingAsked=0;codingDue();});
  check(await p.evaluate(()=>!document.querySelector('#board .doing')&&!Object.keys(codingReadings).length&&!window.__sent.some(m=>m.action==='codingSessions')),'off: nothing kept, nothing asked');
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);check(!(await block(p)),'a late answer while off is dropped');
  await p.evaluate(()=>setFeatureNow('codingSessions',true));
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='codingSessions')),'on: asks at once');
  await p.evaluate(()=>{setFeature('codingSessions',true);localStorage.removeItem('assetboard-features-v1');});
  check(!errors.length,errors.join(' | '));
 } finally {
  for(const context of contexts)await context.close().catch(()=>{});
 }
}
