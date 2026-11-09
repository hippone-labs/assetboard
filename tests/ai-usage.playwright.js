// Run with the browser tool's filename option. AI 额度与用量: the demo's made-up readings on the AI 订阅 view (band order, row lines,
// detail facts, the dialog and its confirmation before an endpoint is turned on), contrast in light and dark, 390px; then a faked
// Mac host (not demo): readings arrive through window.assetboardAiUsage from the same readers, the MCP methods (read, the local
// switch only, usageSource on update_asset), and switching the feature off. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const audit=(p,selector)=>p.evaluate(selector=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>{
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
  await until(p,()=>typeof aiUsageDialog==='function'&&typeof render==='function');
  return {p,errors};
 };
 try {
  // The demo: Claude Max nearly used up this week, ChatGPT Plus on pace to run out, Copilot idle for weeks, then the good news.
  for(const scheme of ['light','dark']){
   const {p,errors}=await open({scheme});
   await p.evaluate(()=>setView('ai'));
   const band=await p.evaluate(()=>[...document.querySelectorAll('.aq-band .aq-line')].map(li=>[li.className,li.textContent]));
   check(band.length===3,'one line per subscription: '+JSON.stringify(band));
   check(/Claude Max.*本周.*88%/.test(band[0][1])&&/amber/.test(band[0][0]),'tightest first, amber: '+band[0][1]);
   check(/ChatGPT Plus.*照现在的速度/.test(band[1][1])&&/GitHub Copilot Pro.*19 天没用.*天后续费/.test(band[2][1]),'pace, then idle: '+JSON.stringify(band));
   const rows=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.row[data-asset]')].map(r=>[r.dataset.asset,r.querySelector('.ai-quota')?.textContent||''])));
   check(rows['demo-a1']==='','a plan of a vendor nothing here uses has no line');
   check(/本周 88%/.test(rows['demo-a2'])&&/3 天后重置/.test(rows['demo-a2'])&&/本期值 2\.7×/.test(rows['demo-a2']),'Claude row: '+rows['demo-a2']);
   check(/高级请求 29%/.test(rows['demo-a4'])&&/本机 19 天没用/.test(rows['demo-a4']),'Copilot row: '+rows['demo-a4']);
   check(await p.evaluate(()=>document.querySelector('.row[data-asset="demo-a2"] .aq-hot')?.textContent.includes('88%')&&!document.querySelector('.row[data-asset="demo-a5"] .aq-hot')),'amber only on the window nearly used up');
   check(await p.evaluate(()=>document.querySelectorAll('.ai-quota .live-meter').length>=4),'thin meters');
   // The detail: windows from the tightest, this period at API prices, value, last used, overage, models, where the reading came from.
   await p.evaluate(()=>showDetail('demo-a2'));
   const facts=await p.evaluate(()=>document.querySelector('#detail').textContent);
   for(const word of ['额度','本周 88%','本周 · Opus 52%','5 小时 41%','本期用量','折合 API 价','本期用量按 API 价是订阅价的 2.7 倍','最近使用','Claude Code、opencode','按量 $12.34 / $50.00','主要模型','claude-opus-4-8','用量接口'])check(facts.includes(word),'detail lacks '+word);
   check(await p.evaluate(()=>document.querySelectorAll('#detail .aq-win').length===3),'three windows');
   const low=[...await audit(p,'.aq-band *,.ai-quota *,.ai-quota,#detail .aq-wins *,#detail .fact *')].filter(r=>r.ratio<4.5);
   check(!low.length,`${scheme}: low contrast `+JSON.stringify(low.slice(0,4)));
   // The dialog: every vendor and the record it lands on, every tool with its switches; an endpoint asks before it is on.
   await p.evaluate(()=>aiUsageDialog());
   check(await p.evaluate(()=>document.querySelectorAll('.aq-sources tbody tr').length===7&&document.querySelectorAll('.aq-vendor').length===5),'7 tools, 5 vendors');
   check(await p.evaluate(()=>!!document.querySelector('.aq-vendor [data-action="detail"][data-id="demo-a2"]')),'Claude lands on Claude Max');
   check(await p.evaluate(()=>!document.querySelector('[data-action="ai-usage-local"][data-id="antigravity"]')),'Antigravity has no local files');
   await p.click('[data-action="ai-usage-api"][data-id="codex"]');
   await until(p,()=>document.querySelector('#modal').dataset.view==='confirm');
   check(/不是公开 API/.test(await p.textContent('#modal-content')),'the confirmation says what it does');
   await p.click('#confirm-no');
   await until(p,()=>document.querySelector('#modal').open&&document.querySelector('#modal').dataset.view==='ai-usage');
   check(!(await p.isChecked('[data-action="ai-usage-api"][data-id="codex"]')),'cancel keeps it off');
   const lowDialog=(await audit(p,'#modal .ai-usage *')).filter(r=>r.ratio<4.5);
   check(!lowDialog.length,`${scheme}: low contrast in the dialog `+JSON.stringify(lowDialog.slice(0,4)));
   check(!errors.length,errors.join(' | '));
  }
  // 390px: the band and the lines fit.
  {const {p}=await open({width:390});await p.evaluate(()=>setView('ai'));check(await p.evaluate(()=>document.documentElement.scrollWidth<=391&&!!document.querySelector('.aq-band')),'390px overflow');}
  // The browser without the Mac app reads nothing and says so to agents.
  {const {p}=await open({url:''});check(await p.evaluate(()=>{try{agentMethods.aiUsage({});return false;}catch(e){return /Mac App/.test(e.message);}}),'browser: no readings');}

  // A faked Mac host: the page asks for readings at launch, they come back through assetboardAiUsage from the same readers.
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,aiUsage:{sources:[{id:'claude',local:true,api:false,hasLocal:true},{id:'codex',local:true,api:false,hasLocal:true}]},data:{blocks:[{id:'ai',folded:false}],assets:[
    {id:'c1',type:'ai',name:'Claude Pro',provider:'Anthropic',cost:'$20 / 月',cycle:'monthly',dateKind:'renew',source:'manual',art:'generic'},
    {id:'g1',type:'ai',name:'ChatGPT Plus',provider:'OpenAI',cost:'$20 / 月',cycle:'monthly',dateKind:'renew',source:'manual',art:'generic'}]}};
  };
  const {p,errors}=await open({url:'',init:`(${host.toString()})();`});
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='aiUsageStart')),'asks for readings at launch');
  await p.evaluate(()=>{
   const store=aiUsageStore(),now=Date.now(),t=new Date(now-3600000).toISOString(),reset=Math.floor(now/1000)+5400;
   store.feed('claude','jsonl',JSON.stringify({type:'assistant',sessionId:'s',timestamp:t,requestId:'r1',message:{id:'m1',model:'claude-sonnet-4-5',content:[{type:'text',text:'never shown'}],usage:{input_tokens:100,output_tokens:2000,cache_read_input_tokens:9000}}})+'\n','f1',now);
   store.feed('codex','jsonl',[{timestamp:t,type:'turn_context',payload:{model:'gpt-5'}},{timestamp:t,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,cached_input_tokens:0,output_tokens:10,total_tokens:110},last_token_usage:{input_tokens:100,cached_input_tokens:0,output_tokens:10,total_tokens:110}},rate_limits:{primary:{used_percent:97,window_minutes:300,resets_at:reset},plan_type:'plus'}}}].map(o=>JSON.stringify(o)).join('\n')+'\n','f2',now);
   window.assetboardAiUsage({snapshot:store.snapshot(now),settings:{sources:[{id:'claude',local:true,api:false,hasLocal:true},{id:'codex',local:true,api:false,hasLocal:true}]}});
   setView('ai');
  });
  const lines=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.row[data-asset]')].map(r=>[r.dataset.asset,r.querySelector('.ai-quota')?.textContent||''])));
  check(/本期 \$0\.0\d/.test(lines.c1)&&/5 小时 97%/.test(lines.g1),'lines from the readers: '+JSON.stringify(lines));
  check(!(await p.textContent('#board')).includes('never shown'),'no conversation text');
  // MCP: the reading as data, the signal, the local switch only.
  const read=await p.evaluate(()=>agentMethods.aiUsage({}));
  check(read.vendors.find(v=>v.vendor==='openai')?.assetId==='g1'&&read.signals[0]?.kind==='full'&&read.signals[0].assetId==='g1','list_ai_usage: '+JSON.stringify(read.signals));
  check(await p.evaluate(()=>agentMethods.get({id:'g1'}).usage?.windows?.[0]?.usedPercent===97),'get_asset carries the usage');
  check(await p.evaluate(()=>{try{agentMethods.aiUsageSet({source:'codex',endpoint:true});return false;}catch(e){return /只能由你/.test(e.message);}}),'an agent cannot turn an endpoint on');
  await p.evaluate(()=>agentMethods.aiUsageSet({source:'codex',local:false}));
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='aiUsageSet'&&m.id==='codex'&&m.local===false&&!('api' in m))),'local switch sent');
  check(await p.evaluate(()=>{try{agentMethods.update({id:'c1',fields:{usageSource:'nobody'}});return false;}catch(e){return /usageSource/.test(e.message);}}),'a bad usageSource is refused');
  await p.evaluate(()=>agentMethods.update({id:'c1',fields:{usageSource:'none'}}));
  check(await p.evaluate(()=>!document.querySelector('.row[data-asset="c1"] .ai-quota')&&state.assets.find(a=>a.id==='c1').usageSource==='none'),'usageSource none hides the reading');
  // The page turns an endpoint on only with the confirmation.
  await p.evaluate(()=>aiUsageDialog());await p.click('[data-action="ai-usage-api"][data-id="claude"]');
  await until(p,()=>document.querySelector('#modal').dataset.view==='confirm');await p.click('#confirm-yes');
  check(await until(p,()=>window.__sent.some(m=>m.action==='aiUsageSet'&&m.id==='claude'&&m.api===true&&m.confirm===true)),'endpoint on after the confirmation');
  // Off in 设置 › 功能: the app is told to stop and the lines go.
  await p.evaluate(()=>{$('#modal').close();setFeatureNow('aiUsage',false);});
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='aiUsageStop')&&!document.querySelector('.ai-quota')&&!document.querySelector('.aq-band')),'feature off');
  check(!errors.length,errors.join(' | '));
  return 'ok';
 } finally { for(const c of contexts)await c.close(); }
}
