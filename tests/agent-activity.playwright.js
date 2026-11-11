// Run with the browser tool's filename option. MCP 操作记录 and the connected tools, with a fake Mac host: every call is logged with
// the tool that made it (from clientInfo, parent programs or environment names, else 未知客户端), writes with each field before and
// after, never a token; the host gets each row to keep; agents read the log masked; 设置 › MCP lists the tools (configured, called,
// last used, a config to copy) and the log with filters by tool, time and kind, newest first; the demo shows made-up rows, with and
// without the Pro modules (?free). Never writes data.
async (page) => {
 // A scheme is set when the board has taken it (<html data-scheme>, from the change event the browser sends on its next frame) and
 // the transitions it started have run out; a fixed wait can end before both on a slow runner.
 const atScheme=async(p,scheme)=>{await p.emulateMedia({colorScheme:scheme});await p.waitForFunction(s=>document.documentElement.dataset.scheme===s,scheme);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await p.evaluate(()=>Promise.race([Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,5000))]));};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  window.__sent=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(m){
   window.__sent.push(JSON.parse(JSON.stringify(m)));
   if(m?.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m?.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m?.action==='agentConfigs')setTimeout(()=>window.assetboardAgentConfigs?.([{id:'claude-code',path:'~/.claude.json',found:true,configured:true},{id:'codex',path:'~/.codex/config.toml',found:true,configured:false},{id:'cursor',path:'~/.cursor/mcp.json',found:false,configured:false}]),5);
  }}}};
  window.__ASSETBOARD_NATIVE__={demo:false,pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},cloudflareConnected:false,githubConnected:false,cliPath:'/Applications/Assetboard.app/Contents/MacOS/assetboard-cli',
   agentLog:[{id:'old',at:'2026-01-02T03:04:05.000Z',client:{id:'codex',name:'Codex',by:'clientInfo'},via:'mcp',method:'list',tool:'list_assets',kind:'read',ok:true,count:2}],
   agentClients:[{id:'codex',name:'Codex',first:'2026-01-02T03:04:05.000Z',last:'2026-01-02T03:04:05.000Z',calls:1,by:'clientInfo'}],
   agentConfigs:[{id:'claude-code',path:'~/.claude.json',found:true,configured:true}],
   data:{blocks:[{id:'server'},{id:'bankcard'}],assets:[
    {id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',source:'manual',art:'generic',ips:['203.0.113.10'],cost:'$6/月',date:'2027-01-01',dateKind:'renew',cycle:'monthly'},
    {id:'c1',type:'bankcard',name:'Visa',last4:'4242',network:'Visa',source:'manual',art:'generic'}],deletedExternalIds:[]}};
 };
 const contrast=async(p,label)=>p.evaluate(label=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
  const bad=[],walker=document.createTreeWalker(document.querySelector('#modal[open]'),NodeFilter.SHOW_TEXT);let checked=0;
  while(walker.nextNode()){
   const el=walker.currentNode.parentElement;if(!walker.currentNode.textContent.trim()||!el||el.closest('svg,[hidden],button:disabled')||el.closest('details:not([open])')&&!el.closest('summary'))continue;
   const style=getComputedStyle(el);if(style.visibility!=='visible'||!el.getClientRects().length)continue;
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0)layers.push(c);}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const color=parse(style.color),size=parseFloat(style.fontSize),need=size>=24||(size>=18.66&&Number(style.fontWeight)>=700)?3:4.5,value=ratio(over(color,bg),bg);checked++;
   if(value<need)bad.push(`${label}: "${walker.currentNode.textContent.trim().slice(0,30)}" ${value.toFixed(2)}`);
  }
  return checked?bad:[`${label}: nothing checked`];
 },label);
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof assetboardAgent==='function');
  await p.evaluate(()=>{save=()=>{};});
  const call=(method,params,client,via='mcp')=>p.evaluate(([method,params,client,via])=>assetboardAgent({requestId:'r',method,params,via,client}),[method,params,client,via]);
  // A write: who, what, each field before and after; a token in a field is never written down.
  // A token sent in a field is refused by the board, and the refusal is logged without it.
  const refused=await call('update',{id:'s1',fields:{notes:'key ghp_abcdefghijklmnopqrstuvwxyz0123'}},{name:'claude-code'});
  check(!refused.ok&&await p.evaluate(()=>agentLogRows[0].ok===false&&!JSON.stringify(agentLogRows).includes('ghp_')&&!JSON.stringify(__sent.filter(m=>m.action==='agentLog')).includes('ghp_')),'A refused token is not in the log');
  await p.evaluate(()=>{agentLogRows.shift();__sent.length=0;delete agentSeen['claude-code'];});
  const wrote=await call('update',{id:'s1',fields:{cost:'$7/月',date:'2027-02-01',notes:'renewed'}},{name:'claude-code',version:'2.1.4',processes:['zsh'],env:[]});
  check(wrote.ok,'The update works: '+JSON.stringify(wrote).slice(0,200));
  const row=await p.evaluate(()=>agentLogRows[0]);
  check(row.client.id==='claude-code'&&row.client.name==='Claude Code'&&row.client.by==='clientInfo'&&row.kind==='write'&&row.tool==='update_asset'&&row.ok,'Who and what: '+JSON.stringify(row).slice(0,300));
  const fields=Object.fromEntries(row.changes[0].fields.map(f=>[f.field,f]));
  check(row.changes[0].id==='s1'&&row.changes[0].op==='update'&&fields.cost.from==='$6/月'&&fields.cost.to==='$7/月'&&fields.date.from==='2027-01-01'&&fields.date.to==='2027-02-01','Before and after: '+JSON.stringify(row.changes));
  check(fields.notes.to==='renewed','Notes too');
  const sent=await p.evaluate(()=>__sent.filter(m=>m.action==='agentLog'));
  check(sent.length===1&&sent[0].entry.id===row.id&&sent[0].client.id==='claude-code'&&sent[0].client.calls===1,'The host gets the row and the tool to keep: '+JSON.stringify(sent).slice(0,300));
  // Reads, from a tool known by its parent program, by environment, and one that says nothing.
  await call('get',{id:'s1'},{processes:['node','codex']});
  await call('list',{type:'server',query:'tokyo'},{env:['CLAUDECODE']});
  await call('list',{},{});
  await call('totals',{},{},'cli');
  await call('hello',{},{name:'cursor-vscode'});
  const reads=await p.evaluate(()=>agentLogRows.slice(0,4).map(r=>[r.client.id,r.client.by,r.kind,r.tool,JSON.stringify(r.params||{}),r.count??'']));
  check(JSON.stringify(reads[3].slice(0,4))===JSON.stringify(['codex','process','read','get_asset']),'A parent program names the tool: '+JSON.stringify(reads));
  check(reads[2][0]==='claude-code'&&reads[2][1]==='env'&&/tokyo/.test(reads[2][4])&&reads[2][5]===1,'Environment names, the query and the count: '+JSON.stringify(reads[2]));
  check(reads[1][0]==='unknown'&&reads[0][0]==='cli','Nothing known: 未知客户端; the command line: '+JSON.stringify(reads));
  check(await p.evaluate(()=>agentSeen.cursor&&!agentLogRows.some(r=>r.method==='hello')),'hello marks the tool as seen without a log row');
  // A refused call is logged too.
  await call('update',{id:'nope',fields:{notes:'x'}},{name:'codex-mcp-client'});
  check(await p.evaluate(()=>agentLogRows[0].ok===false&&/找不到/.test(agentLogRows[0].error)),'A failed call is logged with its reason');
  // Bank cards: an agent with cards allowed changes one; the log keeps it, but list_agent_activity withholds it once cards are off again.
  await p.evaluate(()=>{setFeature('agentCards',true);});
  await call('update',{id:'c1',fields:{notes:'frozen?'}},{name:'claude-code'});
  await p.evaluate(()=>{setFeature('agentCards',false);});
  const activity=await call('activity',{client:'claude-code',kind:'write'},{name:'claude-code'});
  check(activity.ok&&activity.result.entries.length===2&&activity.result.entries[0].changes[0].withheld===true&&!JSON.stringify(activity.result.entries[0]).includes('frozen'),'list_agent_activity withholds a bank card change: '+JSON.stringify(activity.result).slice(0,300));
  const masked=activity.result.entries[1].changes[0].fields;
  check(masked.some(f=>f.field==='cost'),'Writes come with their fields: '+JSON.stringify(masked));
  const agents=await call('agents',{},{name:'claude-code'});
  check(agents.ok&&agents.result.configured.some(c=>c.id==='claude-code'&&c.configured)&&agents.result.seen.some(c=>c.id==='codex'&&c.calls>=2),'list_agents: '+JSON.stringify(agents.result).slice(0,300));
  // 设置 › MCP: the tools and the log; filters; copy a config; clear.
  await p.evaluate(()=>prefsDialog('mcp'));
  // Codex has called but its config file does not name Assetboard (set up some other way): 连过, and its config to copy.
  await until(p,()=>__sent.some(m=>m.action==='agentConfigs')&&agentConfigs.length===3&&document.querySelector('.agent-row[data-client="codex"] .chip')?.textContent==='连过');
  const pane=await p.evaluate(()=>({rows:[...document.querySelectorAll('#prefs-pane-mcp .agent-list>.agent-row')].map(r=>r.dataset.client),claude:document.querySelector('.agent-row[data-client="claude-code"]').textContent,
   log:[...document.querySelectorAll('#prefs-pane-mcp .act-row')].map(r=>r.querySelector('.act-line strong').textContent),write:[...document.querySelectorAll('#prefs-pane-mcp .act-row.write .act-fields')].map(x=>x.textContent).join('|')}));
  check(pane.rows[0]==='claude-code'&&/已配置/.test(pane.claude)&&/最近/.test(pane.claude)&&/次调用/.test(pane.claude),'Claude Code first: set up, last used, calls: '+JSON.stringify(pane));
  check(pane.log.length===10&&pane.log[0]==='Claude Code'&&pane.log.at(-1)==='Codex','Newest first, the injected old row last: '+pane.log);
  check(/费用\$6\/月→\$7\/月/.test(pane.write.replace(/\s/g,'')),'A write shows the change: '+pane.write);
  for(const scheme of ['light','dark']){await atScheme(p,scheme);const bad=await contrast(p,scheme+' mcp');check(!bad.length,bad.join(' | '));}
  await p.emulateMedia({colorScheme:'light'});
  await p.click('#prefs-pane-mcp [data-action="agent-log-filter"][data-kind="client"][data-id="codex"]');
  check(await p.evaluate(()=>[...document.querySelectorAll('#prefs-pane-mcp .act-row')].every(r=>r.querySelector('.act-line strong').textContent==='Codex')),'Filtered by tool');
  await p.click('#prefs-pane-mcp [data-action="agent-log-filter"][data-kind="days"][data-id="1"]');
  check(await p.evaluate(()=>document.querySelectorAll('#prefs-pane-mcp .act-row').length===2),'Today only drops the January row');
  await p.click('#prefs-pane-mcp [data-action="agent-log-filter"][data-kind="kind"][data-id="failed"]');
  check(await p.evaluate(()=>document.querySelectorAll('#prefs-pane-mcp .act-row').length===1),'Failed only');
  await p.click('.agent-row[data-client="codex"] [data-action="agent-config-copy"]');
  check(await p.evaluate(()=>__sent.some(m=>m.action==='copyText'&&m.text==='codex mcp add assetboard -- "/Applications/Assetboard.app/Contents/MacOS/assetboard-cli" mcp')),'Copy config gives the Codex command');
  await p.click('#prefs-pane-mcp [data-action="agent-log-clear"]');await p.click('#confirm-yes');
  check(await p.evaluate(()=>agentLogRows.length===0&&__sent.some(m=>m.action==='agentLogClear')),'Clearing empties the log here and in the app');
 } finally { await p.close(); }
 // The demo shows the page with made-up rows and calls nothing, with or without the Pro modules.
 for(const url of ['/?demo','/?demo&free']){
  const q=await page.context().newPage();
  try{
   await q.goto('http://127.0.0.1:4317'+url);await until(q,()=>typeof prefsDialog==='function');
   const r=await q.evaluate(()=>{prefsDialog('mcp');return {tab:!!document.querySelector('#prefs-tab-mcp'),rows:document.querySelectorAll('#prefs-pane-mcp .act-row').length,tools:document.querySelectorAll('#prefs-pane-mcp .agent-row').length};});
   check(r.tab&&r.rows>=5&&r.tools>=4,`${url} shows tools and a log: ${JSON.stringify(r)}`);
  } finally { await q.close(); }
 }
 return 'ok';
}
