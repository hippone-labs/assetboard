// Run with the browser tool's filename option. 正在做, interface only: the demo's sessions are held in memory (count, tool,
// repository, branch, busy or idle) and never drawn on the board; 设置 › 功能 switches the collector off and on apart from
// AI 额度与用量 and 外部工具接入; then a faked Mac host (not demo): the page asks at launch with nothing but a request id, the
// answer comes back through assetboardCodingSessions, arguments and anything unlisted in it are never kept, the reading stays
// out of the board, localStorage and what AI tools are given, a failed read clears it, and the switch stops the asking.
// Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const contexts=[];
 const open=async({scheme='light',width=1400,url='?demo',init=null}={})=>{
  const context=await page.context().browser().newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce',locale:'zh-CN'});contexts.push(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(init)await p.addInitScript(init);
  await p.goto('http://127.0.0.1:4317/'+url);
  await until(p,()=>typeof codingData==='function'&&typeof codingSummary==='function'&&typeof render==='function');
  return {p,errors};
 };
 const summary=p=>p.evaluate(()=>{
  const sum=codingSummary(codingData());
  return {total:sum.total,idle:sum.idle,tools:sum.tools.map(t=>({id:t.id,name:t.name,count:t.count,sessions:t.sessions.map(s=>({tool:s.tool,repo:s.repo,branch:s.branch,path:s.path,state:s.state,minutes:s.minutes}))}))};
 });
 try {
  {const {p,errors}=await open();
   check(await p.evaluate(()=>!document.querySelector('#board .doing')&&!document.querySelector('.doing')),'nothing is drawn on the board');
   const s=await summary(p);
   check(s.total===4&&s.idle===1&&s.tools.map(t=>`${t.name}|${t.count}`).join()==='Claude Code|2,Codex|1,Cursor|1','the demo reading: '+JSON.stringify(s));
   const [busy,idle]=s.tools[0].sessions;
   check(busy.state==='active'&&busy.repo==='atlas-ui'&&busy.branch==='feat/column-widths'&&busy.minutes===38&&busy.path==='~/projects/atlas-ui','the busy session: '+JSON.stringify(busy));
   check(idle.state==='idle'&&idle.repo==='notes-api'&&idle.branch==='fix/token-refresh'&&idle.minutes===135,'the idle one, named after the main repository of its worktree: '+JSON.stringify(idle));
   const cursor=s.tools[2].sessions[0];
   check(cursor.state==='running'&&!cursor.repo&&!cursor.branch&&cursor.minutes===260,'an application is only said to run: '+JSON.stringify(cursor));
   check(await p.evaluate(()=>!JSON.stringify(state).includes('column-widths')&&!JSON.stringify({...localStorage}).includes('column-widths')),'never in the board or localStorage');
   check(!errors.length,errors.join(' | '));}

  // 设置 › 功能: its own switch, apart from AI 额度与用量 and 外部工具接入.
  {const {p,errors}=await open();
   await p.evaluate(()=>prefsDialog('features'));
   const row=await p.evaluate(()=>{const t=document.querySelector('#modal [data-action="prefs-feature"][data-id="codingSessions"]');return t&&{on:t.checked,others:['aiUsage','agent','pulls'].map(id=>document.querySelector(`#modal [data-action="prefs-feature"][data-id="${id}"]`)?.checked)};});
   check(row&&row.on&&row.others.every(v=>v===true),'a switch of its own, on: '+JSON.stringify(row));
   check(await p.evaluate(()=>/不读对话内容和命令行参数/.test(FEATURES.codingSessions.note)&&FEATURES.codingSessions.on===true&&!FEATURES.codingSessions.pro&&!FEATURES.codingSessions.full),'free, on, and says what it reads');
   await p.click('#modal [data-action="prefs-feature"][data-id="codingSessions"]');
   check(await p.evaluate(()=>!featureOn('codingSessions')&&featureOn('aiUsage')&&featureOn('agent')&&codingData().length===0),'off: the reading goes, the other features stay');
   await p.click('#modal [data-action="prefs-feature"][data-id="codingSessions"]');
   check(await p.evaluate(()=>featureOn('codingSessions')&&codingSummary(codingData()).total===4),'on again');
   await p.evaluate(()=>{setFeatureNow('aiUsage',false);setFeatureNow('agent',false);});
   check(await p.evaluate(()=>codingSummary(codingData()).total===4),'AI 额度与用量 and 外部工具接入 off leave it');
   check(!errors.length,errors.join(' | '));}

  // The browser without the demo has no Mac to ask: nothing collected, no switch.
  {const {p,errors}=await open({url:''});
   await p.evaluate(()=>{state.assets=[{id:'a1',type:'domain',name:'one.example.com',cost:'未知',art:'generic'}];save=()=>{};render();prefsDialog('features');});
   check(await p.evaluate(()=>codingData().length===0&&!document.querySelector('#modal [data-id="codingSessions"]')&&!document.querySelector('#board .doing')),'the browser offers none of it');
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
  check(await p.evaluate(()=>codingData().length===0),'nothing before the first reading');
  const now=Date.now()/1000,ago=m=>Math.round(now-m*60-20),home='/Users/demo';
  const answer={ok:true,at:new Date().toISOString(),home,requestId:ask.requestId,
   processes:[{pid:1,ppid:0},{pid:9,ppid:1,name:'claude',path:'/opt/homebrew/bin/claude',cwd:home+'/projects/api',start:ago(50),args:'claude -p SECRET-PROMPT',env:'TOKEN=SECRET-TOKEN'},
    {pid:10,ppid:1,name:'codex',path:'/opt/homebrew/bin/codex',cwd:home+'/projects/<img src=x onerror=window.__x=1>',start:ago(5)}],
   repos:{[home+'/projects/api']:{root:home+'/projects/api',gitdir:home+'/projects/api/.git',head:'ref: refs/heads/main',config:'SECRET-REMOTE'}},
   files:{claude:[{dir:'-Users-demo-projects-api',mtime:ago(30),birth:ago(50),name:'SECRET-FILE.jsonl',text:'SECRET-WORDS'}]}};
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);
  const read=await summary(p);
  check(read.total===2&&read.tools[0].name==='Claude Code'&&read.tools[0].sessions[0].repo==='api'&&read.tools[0].sessions[0].state==='idle'&&read.tools[0].sessions[0].branch==='main'&&read.tools[0].sessions[0].minutes===50,'the answer is kept: '+JSON.stringify(read));
  check(read.tools[1].sessions[0].repo==='<img src=x onerror=window.__x=1>'&&await p.evaluate(()=>!window.__x),'a folder’s name is data, never run as markup');
  const kept=await p.evaluate(()=>JSON.stringify([codingReadings,state,{...localStorage},{...sessionStorage}]));
  check(!/SECRET/.test(kept),'arguments, environment, file names and contents never reach the page’s memory, the board or storage');
  check(!/projects\/api|refs\/heads/.test(await p.evaluate(()=>JSON.stringify([state,{...localStorage}]))),'the reading is in memory only');
  const agent=await p.evaluate(()=>{const call=(method,params={})=>assetboardAgent({method,params});return JSON.stringify([Object.keys(agentMethods),call('hello'),call('list'),call('types'),call('codingSessions'),call('sessions')]);});
  check(!/codingSessions"|"sessions"/.test(JSON.parse(agent)[0].join('","')+'"')&&!/projects\/api|feat\/|"main"/.test(agent)&&/"ok":false/.test(JSON.stringify(JSON.parse(agent)[4])),'MCP and assetboard-cli have no way to read it: '+agent.slice(0,200));
  await p.evaluate(()=>{window.__sent.length=0;codingAsked=0;codingDue();});
  const again=await until(p,()=>window.__sent.find(m=>m.action==='codingSessions'));
  answer.processes[1].cwd=home+'/projects/web';answer.repos={};
  await p.evaluate(a=>window.assetboardCodingSessions(a),{...answer,requestId:again.requestId});
  check((await summary(p)).tools[0].sessions[0].repo==="web"&&(await summary(p)).tools[0].sessions[0].path==="~/projects/web","a new reading replaces the previous one");
  await p.evaluate(()=>window.assetboardCodingSessions({ok:false}));
  check(await p.evaluate(()=>codingData().length===0),'a failed read clears it');
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);check((await summary(p)).total===2,'and the next good one brings it back');
  await p.evaluate(()=>{window.__sent.length=0;setFeatureNow('codingSessions',false);codingAsked=0;codingDue();});
  check(await p.evaluate(()=>!Object.keys(codingReadings).length&&codingData().length===0&&!window.__sent.some(m=>m.action==='codingSessions')),'off: nothing kept, nothing asked');
  await p.evaluate(a=>window.assetboardCodingSessions(a),answer);check(await p.evaluate(()=>codingData().length===0),'a late answer while off is dropped');
  await p.evaluate(()=>setFeatureNow('codingSessions',true));
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='codingSessions')),'on: asks at once');
  await p.evaluate(()=>{setFeature('codingSessions',true);localStorage.removeItem('assetboard-features-v1');});
  check(!errors.length,errors.join(' | '));
 } finally {
  for(const context of contexts)await context.close().catch(()=>{});
 }
}
