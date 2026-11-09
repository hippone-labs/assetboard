// Run with the browser tool's filename option. Uses an isolated page and never saves.
// ?free shows the board without the Pro modules from any checkout (what building this repository alone gives): the payment ledger,
// 待确认扣款, projects with revenue and splits, the shutdown list and 定期清理, the connectors, AI recognition, MCP and the command line
// are all there. External tools look up, add (a name the board already has is skipped, never overwritten) and import from 待引入; changing
// or deleting a record that is there is refused. No licence panel, no Pro hint, no live status.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const p=await page.context().newPage();
 try {
  await p.goto('http://127.0.0.1:4317/?free');
  const seen=await p.evaluate(()=>{
   save=()=>{};
   state={...state,assets:[{id:'sub',type:'subscription',name:'Editor Pro',provider:'Editor',account:'',purpose:'',date:isoDay(localDay()+6),dateKind:'renew',cycle:'monthly',cost:'$10 / 月',art:'generic',source:'manual',
    payments:[{id:'m1',paidOn:isoDay(localDay()-30),covers:isoDay(localDay()-30),amount:10,currency:'USD'}]}]};
   render();costDialog();
   const cost=document.querySelector('#modal').innerHTML;$('#modal').close();
   const call=(method,params={},via='mcp')=>assetboardAgent({requestId:'f',via,method,params});
   // Pro's methods are not there at all; the free reads answer.
   const missing=['probeSources','sshHosts','iconSite','iconFetch','syncUnblock'].map(m=>call(m));
   const reads=['iconPlatforms','cloudflareStatus','syncBlocklist','forecast','costHistory','projects','charges','list'].map(m=>call(m));
   return {pro:{probe:proSlots.serverProbe,platform:proSlots.platformProbe,methods:Object.keys(proSlots.agentMethods)},
    missing:missing.every(r=>!r.ok&&/未知方法/.test(r.error)),reads:reads.map(r=>r.ok),cli:call('list',{},'cli').ok,
    costMore:cost.includes('cost-more'),menu:assetMenuItems(state.assets[0],true).map(x=>x.action).filter(Boolean),
    licence:proBuilt(),hint:proHint('x')+proTag()};
  });
  check(!seen.pro.probe&&!seen.pro.platform&&!seen.pro.methods.length,'Pro filled something in ?free: '+JSON.stringify(seen.pro));
  check(seen.missing,'Pro agent methods answer in ?free');
  check(seen.reads.every(Boolean),'a free read is refused in ?free: '+seen.reads.join());
  check(seen.cli,'the command line is refused in ?free');
  check(seen.costMore,'the cost panel lost paid / forecast in ?free');
  check(seen.menu.includes('payment-add')&&seen.menu.includes('renew'),'the asset menu lost 记一笔 or 已续费: '+seen.menu.join());
  check(!seen.licence&&!seen.hint,'?free shows the licence panel or a Pro hint');
  // Adding is free and never overwrites: a name the category already has is skipped and the record stays as it was. Changing,
  // deleting, payments and project figures wait for Pro.
  const agent=await p.evaluate(()=>{
   state={...state,assets:[{id:'d1',type:'domain',name:'keep.example',provider:'Registrar',account:'',purpose:'old',date:'2027-01-01',dateKind:'expire',cost:'$10 / 年',art:'generic',source:'manual'},
    {id:'s1',type:'server',name:'box-one',provider:'Hosting',account:'',purpose:'',date:'',dateKind:'expire',cost:'未知',art:'generic',source:'manual',links:['a1']},
    {id:'a1',type:'subscription',name:'Hosting account',provider:'Hosting',account:'',purpose:'',date:'',dateKind:'expire',cost:'未知',art:'generic',source:'manual',links:['s1']}]};
   const before=JSON.stringify(state.assets.find(a=>a.id==='d1'));
   const call=(method,params={},via='mcp')=>assetboardAgent({requestId:'f',via,method,params});
   const same=call('add',{items:[{name:'Keep.example',type:'domain',purpose:'new',date:'2030-01-01'},{name:'fresh.example',type:'domain'}]},'cli');
   const swap=call('add',{items:[{name:'Other account',type:'subscription',linkTo:['s1']}]});
   const writes=['update','updateMany','updateProject','delete','deleteMany','recordPayment','renew'].map(m=>call(m,{id:'d1',fields:{purpose:'x'}}));
   const s1=state.assets.find(a=>a.id==='s1');
   return {same:same.result,kept:JSON.stringify(state.assets.find(a=>a.id==='d1'))===before,fresh:state.assets.some(a=>a.name==='fresh.example'),
    swap:swap.result,links:s1.links,writes:writes.map(r=>r.ok?'ok':r.error)};
  });
  check(agent.same?.added.length===1&&agent.same.skipped.length===1&&agent.same.skipped[0].id==='d1'&&agent.kept&&agent.fresh,'add overwrote or lost a record: '+JSON.stringify(agent.same));
  check(agent.swap?.added.length===1&&agent.swap.warnings.some(w=>w.link==='s1'&&/Pro/.test(w.error))&&agent.links.join()==='a1','add took another account off a server: '+JSON.stringify(agent));
  check(agent.writes.every(e=>/修改和删除已有资产在 Assetboard Pro 里/.test(e)),'a change went through without Pro: '+agent.writes.join(' | '));
  // A monthly charge that came due five days ago is asked about in 即将到来 and the detail.
  const charges=await p.evaluate(()=>{
   state={...state,assets:[{id:'u1',type:'subscription',name:'Notes Pro',provider:'Notes',account:'',purpose:'',date:isoDay(localDay()-5),dateKind:'renew',cycle:'monthly',cost:'$8 / 月',art:'generic',source:'manual',createdAt:'2025-01-01T00:00:00Z'}],paymentsSince:isoDay(localDay()-40)};
   setView('upcoming');render();
   return {band:!!document.querySelector('#board [data-group="charges"]'),detail:paymentsSection(state.assets[0]).includes('charge-paid')};
  });
  check(charges.band&&charges.detail,'?free does not ask about 待确认扣款: '+JSON.stringify(charges));
  // Projects: the sidebar group, the field in the form, the project view with its figures and 全景 按项目.
  const projects=await p.evaluate(()=>{
   if(typeof panoramaOpen==='function')panoramaOpen(false);
   state={...state,assets:[{id:'pr1',type:'domain',name:'notes-lab.example',provider:'Registrar',account:'',purpose:'',date:'',dateKind:'expire',cost:'$12 / 年',art:'generic',source:'manual',project:'notes-lab'},
    {id:'pr2',type:'server',name:'box-one',provider:'Hosting',account:'',purpose:'',date:'',dateKind:'expire',cost:'$5 / 月',art:'generic',source:'manual',project:'notes-lab',links:['pr1']}]};
   view='project:notes-lab';render();
   const sidebar=document.querySelector('#sidebar').innerText,shown=currentView(),bar=!!document.querySelector('#board .pj-bar');
   assetForm('domain','pr1');const field=!!document.querySelector('#asset-form').elements.project;$('#modal').close();
   return {view:shown,sidebar,bar,field,lens:panoramaLenses(state.assets),agent:assetboardAgent({requestId:'t',via:'mcp',method:'projects',params:{}}).result?.projects?.map(x=>x.name)};
  });
  check(projects.view==='project:notes-lab'&&projects.sidebar.includes('notes-lab')&&projects.bar&&projects.field,'?free projects: '+JSON.stringify(projects));
  check(projects.lens.includes('project'),'?free 全景 lost 按项目: '+projects.lens.join());
  check(projects.agent?.join()==='notes-lab','?free agent projects: '+JSON.stringify(projects.agent));
 } finally { await p.close(); }
 // The import window of the Mac app without the Pro modules (native, gh detected): gh, MCP 接入, Cloudflare, the registrars and the
 // cloud platforms; 添加资产 names them and offers 配置 AI; no 探针 or SSH 直读.
 const context=await page.context().browser().newContext(),m=await context.newPage();
 try {
  await m.addInitScript(()=>{
   window.webkit={messageHandlers:{assetboard:{postMessage(msg){
    if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
    if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(msg.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:true,ghAccounts:['alice'],sshConfig:true}),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false};
  });
  await m.goto('http://127.0.0.1:4317/?free');
  const hub=async()=>m.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice'],sshConfig:true};importHub();
   return [...document.querySelectorAll('#modal[data-view="import"] [data-action]')].map(el=>el.dataset.action);});
  let actions=await hub();
  await m.waitForTimeout(40);actions=[...actions,...await hub()];
  const want=['agent-setup','cloudflare-import','github-local-sync','registrar-import','cloud-import','ssh-import','ocr-import'].filter(a=>!actions.includes(a));
  check(!want.length,'the import window without Pro lacks: '+want.join(', '));
  check(!actions.includes('probe-sources')&&!actions.includes('ssh-probe-open'),'the import window without Pro offers live status: '+actions.join(', '));
  const capture=await m.evaluate(()=>{captureDialog();const box=document.querySelector('#capture');
   return {actions:[...box.querySelectorAll('.capture-links [data-action]')].map(el=>el.dataset.action),text:box.querySelector('.capture-links').textContent,ai:!!box.querySelector('.capture-note [data-action="ai-settings"]')};});
  check(capture.actions.includes('agent-setup')&&/GitHub/.test(capture.text)&&capture.ai,'添加资产 without Pro: '+JSON.stringify(capture));
  check(await m.evaluate(()=>!!document.querySelector('#topnav-actions [data-action="agent-setup"]')),'the top bar lost its MCP button');
  const prefs=await m.evaluate(()=>{prefsDialog('connections');const tabs=[...document.querySelectorAll('#modal [role="tab"]')].map(t=>t.id);
   return {tabs,rows:[...document.querySelectorAll('#modal [data-action]')].map(el=>el.dataset.action)};});
  check(prefs.tabs.includes('prefs-tab-mcp')&&!prefs.tabs.includes('prefs-tab-pro'),'设置 without Pro: '+prefs.tabs.join());
  check(['cloudflare-import','github-import','ai-settings','agent-setup'].every(a=>prefs.rows.includes(a)),'设置 › 连接 without Pro: '+prefs.rows.join());
 } finally { await context.close(); }
 // The demo without the Pro modules shows the GitHub sync like the full one, and no live status.
 const d=await page.context().newPage();
 try {
  await d.goto('http://127.0.0.1:4317/?demo&free');
  const demo=await d.evaluate(()=>({repos:state.assets.filter(a=>a.type==='repository').map(a=>a.source),probe:state.assets.some(a=>a.probeLink)}));
  check(demo.repos.length>5&&demo.repos.every(s=>s==='github')&&!demo.probe,'the demo without Pro: '+JSON.stringify(demo));
 } finally { await d.close(); }
 return 'ok';
}
