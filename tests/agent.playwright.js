// Run with the browser tool's filename option. The agent interface on the page side (what assetboard-cli and its MCP server reach): reads, adds and edits at once with undo, deletes only after confirming.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof assetboardAgent==='function');
  await p.evaluate(()=>{localStorage.clear();state={blocks:[{id:'domain'}],assets:[
   {id:'d1',type:'domain',name:'example.com',provider:'Namecheap',source:'manual',date:'2027-03-01',dateKind:'expire',art:'generic',notes:'主站'},
   {id:'g1',type:'repository',name:'me/app',provider:'GitHub',source:'github',art:'generic'},
   {id:'h1',type:'domain',name:'old.dev',provider:'Porkbun',source:'manual',art:'generic',hiddenAt:'2026-01-01T00:00:00Z'}],deletedExternalIds:[]};save=()=>{};render();});
  const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);

  // Reads.
  const types=await call('types');
  check(types.ok&&types.result.length===13&&types.result.some(t=>t.id==='domain'&&t.name==='域名'),'types lists every category');
  let list=await call('list',{type:'domain'});
  check(list.ok&&list.result.total===1&&list.result.assets[0].id==='d1'&&list.result.assets[0].typeName==='域名','list filters by type and leaves hidden records out');
  list=await call('list',{type:'domain',includeHidden:true});
  check(list.result.total===2&&list.result.assets.find(a=>a.id==='h1').hidden===true,'includeHidden adds hidden records, marked');
  list=await call('list',{query:'主站'});
  check(list.result.total===1&&list.result.assets[0].id==='d1','query also searches notes');
  check((await call('get',{id:'d1'})).result.provider==='Namecheap','get returns the record');
  check(/找不到/.test((await call('get',{id:'nope'})).error),'get of an unknown id is an error');
  check(/未知方法/.test((await call('drop_table')).error),'An unknown method is an error');
  check(/未知类别/.test((await call('list',{type:'pets'})).error),'An unknown type is an error');

  // Adds: written at once, checked like the form, one undo for the batch.
  const added=await call('add',{items:[
   {name:'Notion Plus',type:'subscription',provider:'Notion',cost:'$10 / 月',cycle:'monthly',dateKind:'renew',date:'2099-11-01',color:'blue'},
   {name:'example.com',type:'domain'},
   {name:'bad-date.dev',type:'domain',date:'someday'},
   {name:'card',type:'bankcard',notes:'4111 1111 1111 1111'},
   {name:'x',type:'pets'},
   {type:'domain'},
   {name:'Apple 主号',type:'appleid',region:'us'}
  ]});
  check(added.ok&&added.result.added.length===2,'Two valid items are added: '+JSON.stringify(added.result));
  check(added.result.skipped.length===1&&added.result.skipped[0].id==='d1','A same-name record is skipped with its id');
  check(added.result.errors.length===4&&added.result.errors.some(e=>/date/.test(e.error))&&added.result.errors.some(e=>/卡号/.test(e.error))&&added.result.errors.some(e=>/未知类别/.test(e.error))&&added.result.errors.some(e=>/name/.test(e.error)),'Bad date, a card number, an unknown type and a missing name are refused');
  check(added.result.warnings.length===1&&added.result.warnings[0].ignored[0]==='color','Unknown fields are reported as ignored');
  const notion=await p.evaluate(()=>state.assets.find(a=>a.name==='Notion Plus'));
  check(notion&&notion.source==='agent'&&notion.event==='2099-11-01 扣款'&&notion.cycle==='monthly'&&!('color' in notion),'The new record has its fields, its event and source agent');
  check(await p.evaluate(()=>state.assets.find(a=>a.type==='appleid')?.provider==='Apple'&&state.assets.find(a=>a.type==='appleid').region==='US'),'Fixed providers and region codes follow the form');
  check(await p.evaluate(()=>!!document.querySelector(`#board [data-asset="${state.assets.find(a=>a.name==='Notion Plus').id}"]`)),'The board shows the new record');
  check((await p.locator('#toast').innerText()).includes('外部工具添加了 2 项'),'A toast says what the agent added');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.assets.length===3),'One undo removes the whole batch');
  await p.evaluate(()=>redo());
  check(await p.evaluate(()=>state.assets.length===5),'Redo brings it back');

  // Edits.
  let updated=await call('update',{id:'d1',fields:{date:'2028-03-01',notes:'续了一年'}});
  check(updated.ok&&updated.result.asset.date==='2028-03-01'&&updated.result.asset.event==='2028-03-01 到期'&&updated.result.asset.notes==='续了一年','update changes fields and the event');
  check(await p.evaluate(()=>!!state.assets.find(a=>a.id==='d1').updatedAt),'update stamps updatedAt');
  check(/同步/.test((await call('update',{id:'g1',fields:{name:'other/app'}})).error),'A synced record keeps its name');
  check((await call('update',{id:'g1',fields:{notes:'主仓库'}})).ok,'A synced record still takes notes');
  check(/没有/.test((await call('update',{id:'d1',fields:{}})).error),'An empty update is refused');
  check(/不能为空/.test((await call('update',{id:'d1',fields:{name:' '}})).error),'An empty name is refused');
  check(/url/.test((await call('update',{id:'d1',fields:{url:'javascript:alert(1)'}})).error),'An unsafe link is refused');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='g1').notes),'Edits undo one by one');
  // hidden and stopped, like 隐藏 and 已停用: booleans, on updates only, stopped only where the app offers it.
  updated=await call('update',{id:'d1',fields:{hidden:true,stopped:true}});
  check(updated.ok&&updated.result.asset.hidden===true&&updated.result.asset.stopped===true&&await p.evaluate(()=>!!state.assets.find(a=>a.id==='d1').hiddenAt),'update hides and stops: '+JSON.stringify(updated.error||''));
  check((await call('list',{type:'domain'})).result.total===0,'A hidden record leaves the list');
  updated=await call('update',{id:'d1',fields:{hidden:false,stopped:false}});
  check(updated.ok&&updated.result.asset.hidden===false&&await p.evaluate(()=>{const a=state.assets.find(a=>a.id==='d1');return !('hiddenAt' in a)&&!('stopped' in a);}),'and shows and resumes, leaving no empty fields');
  check(/true 或 false/.test((await call('update',{id:'d1',fields:{hidden:'yes'}})).error)&&/true 或 false/.test((await call('update',{id:'d1',fields:{stopped:1}})).error),'hidden and stopped need booleans');
  const accountId=await p.evaluate(()=>state.assets.find(a=>['appleid','google'].includes(a.type))?.id);
  check(!!accountId&&/停用/.test((await call('update',{id:accountId,fields:{stopped:true}})).error),'An account cannot be marked stopped');
  await p.evaluate(()=>{undo();undo();});
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='d1').hiddenAt&&!state.assets.find(a=>a.id==='d1').stopped),'Each undoes on its own');

  // Deletes only ask: the record stays until confirmed here.
  const asked=await call('delete',{id:'d1',reason:'域名已转出'});
  check(asked.ok&&asked.result.status==='pending'&&await p.evaluate(()=>state.assets.some(a=>a.id==='d1')),'delete returns pending and keeps the record');
  check(await p.evaluate(()=>$('#modal').dataset.view==='agent-delete'&&$('#modal-title').textContent==='删除「example.com」？'&&$('#modal-content').textContent.includes('域名已转出')),'One request: the confirmation names the record and the reason');
  await call('delete',{id:'d1'});
  check(await p.locator('#agent-delete input[name="agent-delete"]').count()===1,'Asking twice for the same record lists it once');
  // More requests join the open list, all ticked; one click deletes the ticked ones in one undo step.
  const agentIds=await p.evaluate(()=>state.assets.filter(a=>a.source==='agent').map(a=>a.id));
  for(const id of agentIds)await call('delete',{id});
  check(await p.evaluate(n=>$('#modal-title').textContent===`删除 ${n} 项资产？`&&document.querySelectorAll('#agent-delete input:checked').length===n,agentIds.length+1),'Requests arriving meanwhile join one list, all ticked');
  check((await p.locator('#agent-delete-yes').innerText())===`删除全部 ${agentIds.length+1} 项`,'The button counts what will go');
  await p.locator('#agent-delete input[name="agent-delete"]').nth(1).uncheck();
  check((await p.locator('#agent-delete-yes').innerText())===`删除 ${agentIds.length} 项`,'Unticking one updates the count');
  const before=await p.evaluate(()=>state.assets.length);
  await p.click('#agent-delete-yes');
  check(await p.evaluate(n=>state.assets.length===n-2&&!state.assets.some(a=>a.id==='d1')&&!$('#modal').open&&!intake.some(i=>i.deleteId),before),'The ticked records go, the unticked one stays, every request is answered');
  check((await p.locator('#toast').innerText()).includes('已删除 2 项，保留 1 项'),'The toast says what was deleted and kept');
  await p.evaluate(()=>undo());
  check(await p.evaluate(n=>state.assets.length===n,before),'One undo brings the batch back');
  // Keeping (button or Esc) answers every listed request and deletes nothing.
  await call('delete',{id:'h1'});await call('delete',{id:'d1'});
  await p.click('#agent-delete-no');
  check(await p.evaluate(n=>state.assets.length===n&&!$('#modal').open&&!intake.some(i=>i.deleteId),before),'全部保留 keeps everything');
  await call('delete',{id:'h1'});await p.keyboard.press('Escape');
  await until(p,()=>!$('#modal').open&&!intake.some(i=>i.deleteId));
  check(await p.evaluate(n=>state.assets.length===n,before),'Esc keeps everything too');
  // The menu delete still asks for one record on its own.
  await p.evaluate(()=>{confirmDeleteAsset('h1');});await p.click('#confirm-yes');
  check(await p.evaluate(()=>!state.assets.some(a=>a.id==='h1')),'The menu delete still works');
  await p.evaluate(()=>undo());
  // While a form is open, the request waits in 待确认 instead of replacing it.
  await p.evaluate(()=>assetForm('domain','h1'));await p.fill('#asset-form [name="notes"]','editing');
  await call('delete',{id:'h1'});await call('delete',{id:'h1'});
  check(await p.evaluate(()=>!!$('#asset-form')&&intake.filter(i=>i.deleteId==='h1').length===1),'With a form open the request queues once in 待确认');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();intake=[];});
  // The add panel leads to Agent 接入 (a Pro link, pro/web/import-pro.js); in the browser it explains that the interface lives in the Mac app.
  if(await p.evaluate(()=>proSlots.captureLinks.length)){
   await p.evaluate(()=>captureDialog());await p.click('#capture [data-action="agent-setup"]');
   check(await p.evaluate(()=>$('#modal').dataset.view==='agent'&&/Mac App/.test($('#modal-content').textContent)),'The add panel opens Agent 接入');
   await p.evaluate(()=>$('#modal').close());
  }
  // Categories carry their common vendors for agents to choose from; fixed-vendor categories name theirs.
  const kinds=(await p.evaluate(()=>assetboardAgent({requestId:'t',method:'types',params:{}}))).result;
  check(kinds.find(k=>k.id==='server').providers.includes('Hetzner')&&kinds.find(k=>k.id==='appleid').provider==='Apple'&&!('providers' in kinds.find(k=>k.id==='appleid')),'types lists vendors per category');
  check(!errors.length,'Page errors: '+errors.join(' | '));
  // In the Mac app: one tab per tool, each block copied on its own, the chosen tool remembered.
  const mac=await page.context().browser().newContext({viewport:{width:1100,height:820}});const m=await mac.newPage();
  await m.addInitScript(()=>{window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(x){window.__sent.push(x);if(x.action==='save')setTimeout(()=>assetboardSaved(x.sequence,true),5);if(x.action==='evidenceList')setTimeout(()=>assetboardEvidenceList([]),5);}}}};window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},ai:null,cliPath:'/Applications/Assetboard.app/Contents/MacOS/assetboard-cli'};});
  await m.goto('http://127.0.0.1:4317/');await until(m,()=>typeof agentSetupDialog==='function');
  await m.evaluate(()=>agentSetupDialog());
  check(await m.locator('.agent-tabs .choice').count()===5&&await m.evaluate(()=>document.querySelector('.agent-tabs [aria-checked="true"]').dataset.id==='claude-code'),'Five tools, Claude Code first');
  await m.click('[data-action="agent-tab"][data-id="codex"]');
  const codex=await m.locator('.agent-tool pre').allInnerTexts();
  check(codex.length===2&&codex[0].startsWith('codex mcp add assetboard -- "/Applications/')&&codex[1].startsWith('[mcp_servers.assetboard]')&&codex[1].includes('args = ["mcp"]'),'Codex: the command and the TOML are separate blocks');
  await m.locator('.agent-tool [data-action="agent-copy"]').nth(1).click();
  check(await m.evaluate(()=>__sent.filter(x=>x.action==='copyText').pop().text.startsWith('[mcp_servers.assetboard]')),'Each block copies on its own');
  await m.click('[data-action="agent-tab"][data-id="cursor"]');
  check(JSON.parse(await m.locator('.agent-tool pre').innerText()).mcpServers.assetboard.args[0]==='mcp','Cursor gets mcpServers JSON');
  await m.reload();await until(m,()=>typeof agentSetupDialog==='function');await m.evaluate(()=>agentSetupDialog());
  check(await m.evaluate(()=>document.querySelector('.agent-tabs [aria-checked="true"]').dataset.id==='cursor'),'The chosen tool is remembered');
  // Icons: iconHost is fetched by the app and applied when it arrives; icon is checked like an uploaded one; replies carry no image data.
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await m.evaluate(png=>{$('#modal').close();state={blocks:[],assets:[],deletedExternalIds:[]};save=()=>{};render();window.__icon=png;
   const post=window.webkit.messageHandlers.assetboard.postMessage;window.webkit.messageHandlers.assetboard.postMessage=x=>{post(x);
    if(x.action==='iconFetch')setTimeout(()=>assetboardIconResult(x.host==='bad.example'?{requestId:x.requestId,ok:false,error:'这个网站没有图标'}:{requestId:x.requestId,ok:true,host:x.host,dataUrl:window.__icon}),20);};},png);
  const mcall=(method,params)=>m.evaluate(([method,params])=>assetboardAgent({requestId:'m',method,params}),[method,params]);
  const withIcon=await mcall('add',{items:[{name:'Wise',type:'bankcard',iconHost:'wise.com'},{name:'Bad',type:'subscription',iconHost:'bad.example'},{name:'Own',type:'subscription',icon:png}]});
  check(withIcon.result.added.length===3&&withIcon.result.added[0].iconStatus==='fetching'&&!('iconStatus' in withIcon.result.added[2]),'iconHost starts a fetch; an icon given directly needs none');
  const [wise,bad,own]=withIcon.result.added.map(x=>x.id);
  await until(m,id=>!!state.assets.find(a=>a.id===id)?.siteIcon,wise);
  const got=(await mcall('get',{id:wise})).result;
  check(got.hasSiteIcon&&got.siteIconHost==='wise.com'&&!('siteIcon' in got)&&!('iconStatus' in got),'The fetched icon is applied and the reply has no image data');
  await until(m,id=>agentIconStatus.get(id)?.startsWith('failed'),bad);
  check((await mcall('get',{id:bad})).result.iconStatus==='failed: 这个网站没有图标','A failed fetch is visible through get');
  const ownRec=(await mcall('get',{id:own})).result;
  check(ownRec.hasCustomIcon&&!('iconData' in ownRec)&&await m.evaluate(id=>!!customIconSrc(state.assets.find(a=>a.id===id)),own),'An icon passed directly becomes the custom icon');
  check(!JSON.stringify((await mcall('list',{})).result).includes('base64'),'list carries no image data');
  check(/icon/.test((await mcall('update',{id:own,fields:{icon:'data:text/html;base64,PGgxPg=='}})).error),'A non-image icon is refused');
  const big='data:image/png;base64,'+'A'.repeat(360000);
  check(/256 KB/.test((await mcall('update',{id:own,fields:{icon:big}})).error),'An icon over 256 KB is refused');
  check((await mcall('update',{id:own,fields:{icon:''}})).result.asset.hasCustomIcon===false,'An empty icon removes the custom icon');
  check((await mcall('update',{id:wise,fields:{iconHost:''}})).result.asset.hasSiteIcon===false,'An empty iconHost removes the site icon');
  check((await mcall('update',{id:wise,fields:{iconHost:'wise.com'}})).result.asset.iconStatus==='fetching','update can fetch again');
  await mac.close();
 } finally { await context.close(); }
 return 'PASS: types, list by type/query/hidden, get, unknown method/type/id, add with checks, skipped same names, ignored fields, toast, one undo per batch, update with event and synced guard, unsafe url, hidden and stopped, delete only after confirming, queued while a form is open, deletes confirmed together in one list, five tool tabs with separate copy blocks and a remembered choice, icons by host or data with status and no image data in replies';
}
