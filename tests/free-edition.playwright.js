// Run with the browser tool's filename option. Uses an isolated page and never saves.
// ?free shows the free edition from any checkout: no Pro panels or menu items, even when the Pro scripts are loaded. That includes
// 待确认扣款 (in 即将到来, the detail and the menu bar summary) and the MCP / GitHub / Cloudflare / Gmail ways in.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 try {
  await p.goto('http://127.0.0.1:4317/?free');
  const seen=await p.evaluate(()=>{
   save=()=>{};
   state={...state,assets:[{id:'sub',type:'subscription',name:'Editor Pro',provider:'Editor',account:'',purpose:'',date:isoDay(localDay()+6),dateKind:'renew',cycle:'monthly',cost:'$10 / 月',art:'generic',source:'manual',
    payments:[{id:'m1',paidOn:isoDay(localDay()-30),covers:isoDay(localDay()-30),amount:10,currency:'USD'}]}]};
   render();costDialog();
   const cost=document.querySelector('#modal').innerHTML;
   // The agent interface keeps only the core methods: the probe, SSH 直读, icon and Cloudflare tools are Pro.
   const agent=['probeSources','probeSourceAdd','sshHosts','sshSet','iconPlatforms','iconFetch','cloudflareSync','syncBlocklist'].map(method=>assetboardAgent({requestId:'f',method,params:{}}));
   return {slots:Object.entries(proSlots).filter(([k,v])=>Array.isArray(v)?v.length:['actions','agentMethods','agentConfirms','agentFields'].includes(k)?Object.keys(v).length:v).map(([k])=>k),
    agent:agent.every(r=>!r.ok&&/未知方法/.test(r.error))&&!/probe|ssh|icon|cloudflare|sync/i.test(agent[0].error.split('可用：')[1]??'probe'),
    costMore:cost.includes('cost-more'),menu:assetMenuItems(state.assets[0],true).map(x=>x.action).filter(Boolean)};
  });
  check(!seen.slots.length,'Pro slots filled in ?free: '+seen.slots.join(', '));
  check(seen.agent,'Pro agent methods answer in ?free');
  check(!seen.costMore,'the cost panel shows the Pro part in ?free');
  check(!seen.menu.includes('payment-add'),'the asset menu offers 记一笔付款 in ?free');
  check(seen.menu.includes('renew'),'the asset menu lost 已续费 in ?free');
  // A monthly charge that came due five days ago: the free edition does not ask about it anywhere.
  const charges=await p.evaluate(()=>{
   state={...state,assets:[{id:'u1',type:'subscription',name:'Notes Pro',provider:'Notes',account:'',purpose:'',date:isoDay(localDay()-5),dateKind:'renew',cycle:'monthly',cost:'$8 / 月',art:'generic',source:'manual',createdAt:'2025-01-01T00:00:00Z'}],paymentsSince:isoDay(localDay()-40)};
   setView('upcoming');render();
   return {due:pendingCharges(state.assets,{since:state.paymentsSince}).length,asked:pendingChargesAsked(state.assets).length,
    band:!!document.querySelector('#board [data-group="charges"]'),rows:document.querySelectorAll('#board [data-action="charge-paid"]').length,
    detail:paymentsSection(state.assets[0]).includes('charge-paid'),board:document.querySelector('#board').innerText};
  });
  check(charges.due===1,'the sample charge is not due, so the check proves nothing');
  check(!charges.asked&&!charges.band&&!charges.rows&&!charges.board.includes('待确认扣款'),'?free shows 待确认扣款 in 即将到来');
  check(!charges.detail,'?free asks about the charge in the detail');
  // 添加资产: only the free ways in, and no Pro names.
  const capture=await p.evaluate(()=>{captureDialog();const box=document.querySelector('#capture .capture-links');
   return {actions:[...box.querySelectorAll('[data-action]')].map(el=>el.dataset.action),text:box.textContent};});
  check(!capture.actions.includes('agent-setup'),'?free 添加资产 links to MCP 接入');
  check(!/MCP|GitHub|Cloudflare|Gmail/.test(capture.text),'?free 添加资产 names a Pro source: '+capture.text);
  check(capture.actions.includes('import-hub'),'?free 添加资产 lost its import link');
  // 项目 is Pro: no sidebar group, detail row, form field, project view or 全景 按项目, yet the label a record has survives
  // editing, a table import over it, a backup restore and the exports.
  const projects=await p.evaluate(()=>{
   if(typeof panoramaOpen==='function')panoramaOpen(false);
   state={...state,assets:[{id:'pr1',type:'domain',name:'notes-lab.example',provider:'Registrar',account:'',purpose:'',date:'',dateKind:'expire',cost:'未知',art:'generic',source:'manual',project:'notes-lab'},
    {id:'pr2',type:'server',name:'box-one',provider:'Hosting',account:'',purpose:'',date:'',dateKind:'expire',cost:'未知',art:'generic',source:'csv',externalId:'server:box-one',project:'notes-lab'}]};
   // A project view remembered from the full edition falls back to 全部资产.
   view='project:notes-lab';render();
   const sidebar=document.querySelector('#sidebar').innerText,shown=currentView();
   showDetail('pr1');const detail=document.querySelector('#detail')?.innerText||'';
   assetForm('domain','pr1');const form=document.querySelector('#asset-form'),field=!!form.elements.project,summary=form.querySelector('summary').textContent;
   form.elements.purpose.value='site';form.requestSubmit();
   return {view:shown,sidebar,detail,field,summary};
  });
  await p.waitForTimeout(100);
  Object.assign(projects,await p.evaluate(()=>{
   const afterEdit=state.assets.find(a=>a.id==='pr1');
   const plan=planImport(state,[{name:'box-one',type:'server',provider:'Hosting',account:'',date:'2027-01-01',dateKind:'expire',cycle:'',cost:'',url:'',notes:'',purpose:'',source:'csv',externalId:'server:box-one'}]);
   const imported=applyImport(state,plan,{applySame:plan.skippedSame.map(r=>r.assetId)}).assets.find(a=>a.id==='pr2');
   const backup=parseBoardBackup(JSON.stringify({blocks:[],assets:[{...afterEdit,purpose:'restored'}]}));
   const restored=applyBoardBackup(state,planBoardBackup(state,backup,{mode:'merge'})).assets.find(a=>a.id==='pr1');
   const handover=handoverHtml(state,{types:Object.fromEntries(Object.entries(cats).map(([id,c])=>[id,c.name])),order:categoryIds()});
   panoramaOpen(true);const lenses=[...document.querySelectorAll('.pano-lens .seg')].map(b=>b.dataset.lens);panoramaOpen(false);
   return {on:projectsOn(),edited:afterEdit.project+'|'+afterEdit.purpose,imported:imported.project+'|'+imported.date,restored:restored.project+'|'+restored.purpose,
    handover:handover.includes('notes-lab'),lens:panoramaLenses(state.assets,panoSkip()),lenses,agent:assetboardAgent({requestId:'t',method:'projects',params:{}}).result?.projects};
  }));
  check(!projects.on,'?free has projects switched on');
  check(projects.view==='all','?free opened a project view: '+projects.view);
  check(!projects.sidebar.includes('项目')&&!projects.detail.includes('项目'),'?free shows 项目 in the sidebar or the detail');
  check(!projects.field&&!projects.summary.includes('项目'),'?free 编辑 offers a project field: '+projects.summary);
  check(!projects.lens.includes('project')&&!projects.lenses.includes('project'),'?free 全景 offers 按项目: '+projects.lenses.join());
  check(Array.isArray(projects.agent)&&!projects.agent.length,'?free agent lists projects');
  check(projects.edited==='notes-lab|site','editing in ?free dropped the project: '+projects.edited);
  check(projects.imported==='notes-lab|2027-01-01','a table import over it dropped the project: '+projects.imported);
  check(projects.restored==='notes-lab|restored','a backup restore dropped the project: '+projects.restored);
  check(projects.handover,'the handover export lost the project');
 } finally { await p.close(); }
 // The import window as the free Mac app shows it (native, gh detected): no GitHub, MCP, Cloudflare or Gmail entry.
 const context=await page.context().browser().newContext(),m=await context.newPage();
 try {
  await m.addInitScript(()=>{
   window.webkit={messageHandlers:{assetboard:{postMessage(msg){
    if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
    if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(msg.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:true,ghAccounts:['alice'],sshConfig:true}),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await m.goto('http://127.0.0.1:4317/?free');
  const hub=async()=>m.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice'],sshConfig:true};importHub();
   return [...document.querySelectorAll('#modal[data-view="import"] [data-action]')].map(el=>el.dataset.action);});
  let actions=await hub();
  await m.waitForTimeout(40);actions=[...actions,...await hub()];
  const pro=['agent-setup','cloudflare-import','gmail-import','github-local-sync','github-import'].filter(a=>actions.includes(a));
  check(!pro.length,'the free import window offers Pro entries: '+pro.join(', '));
  check(!await m.evaluate(()=>/\bgh\b|alice/.test(document.querySelector('#modal .import-cli')?.textContent||'')),'the free import window names gh');
  check(actions.includes('ssh-import')&&actions.includes('ocr-import'),'the free import window lost ~/.ssh/config or 截图: '+actions.join(', '));
  const capture=await m.evaluate(()=>{captureDialog();const box=document.querySelector('#capture .capture-links');
   return {actions:[...box.querySelectorAll('[data-action]')].map(el=>el.dataset.action),text:box.textContent};});
  check(!capture.actions.includes('agent-setup')&&!/MCP|GitHub|Cloudflare|Gmail/.test(capture.text),'the free Mac app\'s 添加资产 offers a Pro source: '+capture.text);
  check(/截图/.test(capture.text)&&/ssh/.test(capture.text),'the free Mac app\'s 添加资产 should name its own sources: '+capture.text);
  // AI recognition is Pro: no 配置 AI under 添加资产.
  const note=await m.evaluate(()=>{captureDialog();const el=document.querySelector('#capture .capture-note');return {ai:!!el.querySelector('[data-action="ai-settings"]'),text:el.textContent};});
  check(!note.ai&&!/AI/.test(note.text),'the free Mac app\'s 添加资产 offers 配置 AI: '+note.text);
  // The page's agent interface reports no charges waiting.
  const agent=await m.evaluate(()=>{state.assets=[{id:'u1',type:'subscription',name:'Notes Pro',provider:'Notes',account:'',purpose:'',date:isoDay(localDay()-5),dateKind:'renew',cycle:'monthly',cost:'$8 / 月',art:'generic',source:'manual',createdAt:'2025-01-01T00:00:00Z'}];state.paymentsSince=isoDay(localDay()-40);
   return {due:pendingCharges(state.assets,{since:state.paymentsSince}).length,list:assetboardAgent({requestId:'t',method:'charges',params:{}}).result?.charges,asset:agentAsset(state.assets[0])};});
  check(agent.due===1&&Array.isArray(agent.list)&&!agent.list.length&&!('unconfirmedCharges' in agent.asset),'the free agent interface reports charges: '+JSON.stringify(agent));
 } finally { await context.close(); }
 // The free demo does not show a GitHub sync it does not have: a few repositories written down by hand, no account tag.
 const d=await page.context().newPage();
 try {
  await d.goto('http://127.0.0.1:4317/?demo&free');
  const repos=await d.evaluate(()=>state.assets.filter(a=>a.type==='repository').map(a=>({name:a.name,source:a.source,account:a.account})));
  check(repos.length>0&&repos.length<=5&&repos.every(r=>r.source==='manual'&&!r.account&&!r.name.includes('/')),'the free demo repositories: '+JSON.stringify(repos));
  check(!await d.evaluate(()=>!!document.querySelector('#board .account-tag')),'the free demo shows an account tag');
 } finally { await d.close(); }
 return 'ok';
}
