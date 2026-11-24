// Run with the browser tool's filename option. The modules here are free and in the official build: the official build (the Mac app faked,
// nativeStore.pro {on:true, kind:'official'}) has every Pro feature on (external tools changing and deleting records, the weekly
// registry check, the 12-hour Cloudflare sync, live status) with no licence anywhere and no section of its own in 设置; 关于 says 官方版.
// A build from source (the app sends no pro) has none of them and says 源码构建; the free features (the ledger,
// projects, the shutdown list and 定期清理, MCP and the command line for lookups and adding, the Inbox folder, the connectors and AI)
// stay on either way, and an edit without Pro keeps everything. Never saves for real (the fake app answers saves).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const browser=page.context().browser();
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
 const open=async official=>{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});
  await p.addInitScript(({official,assets})=>{
   window.__sent=[];window.__replies=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='agentReply')window.__replies.push(JSON.parse(m.reply));
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain'},{id:'subscription'}],assets,cardOrder:{},rdapAuto:true},cloudflareConnected:true,githubConnected:false,version:'2026.11.1',
    ...(official?{pro:{on:true,kind:'official'}}:{})};
  },{official,assets:[
   {id:'d1',type:'domain',name:'notes.example',provider:'Registrar',account:'',purpose:'',date:day(40),dateKind:'expire',cycle:'yearly',cost:'$12 / 年',art:'generic',source:'manual',project:'notes-app',
    payments:[{id:'pay-1',paidOn:day(-330),amount:10,currency:'USD',months:12,covers:'',via:'renew',status:'paid'}]},
   {id:'s1',type:'subscription',name:'Mail Plan',provider:'Mail Co',account:'',purpose:'',date:day(5),dateKind:'renew',cycle:'monthly',cost:'$5 / 月',art:'generic',source:'manual',project:'notes-app'},
   {id:'cf1',type:'domain',name:'cf.example',provider:'Cloudflare',account:'',purpose:'',date:'',art:'generic',source:'cloudflare',externalId:'z1',syncedAt:new Date(Date.now()-3*86400000).toISOString()}]});
  await p.goto('http://127.0.0.1:4317/');
  await p.waitForFunction(()=>typeof render==='function'&&!!document.querySelector('#board .row'));
  return {p,context,errors};
 };
 const agent=(p,call)=>p.evaluate(call=>{window.__replies=[];window.assetboardAgent({requestId:'r1',...call});return window.__replies[0];},call);
 const facts=(p,id)=>p.evaluate(id=>{showDetail(id,{focus:false});return document.querySelector('#detail').textContent;},id);
 const results={};
 for(const official of [false,true]){
  const {p,context,errors}=await open(official);
  try{
   const r=await p.evaluate(()=>({
    on:proOn(),
    // 付款账本、未来 12 个月预测、价格变动
    ledgerCard:(()=>{exportDialog();return !!document.querySelector('#modal [data-action="export-ledger"]');})(),
    forecast:(()=>{costDialog();return !!document.querySelector('#modal .forecast, #modal .cost-more');})(),
    costHint:(()=>{costDialog();return document.querySelectorAll('#modal .pro-note [data-action="pro-dialog"]').length;})(),
    priceMark:!!document.querySelector('#board [data-asset="d1"] .price-mark.up'),
    recordPayment:!!proAction('payment-add'),
    // 每周自动核对注册局 (stored on, sent only with Pro)
    rdapAuto:rdapAutoOn(),
    rdapSwitch:(()=>{prefsDialog('features');const s=document.querySelector('#modal [data-action="rdap-auto"]');return {checked:s?.checked,disabled:s?.disabled,tag:!!s?.parentElement.querySelector('.pro-tag')};})(),
    // Cloudflare 定时同步
    cfAuto:(document.querySelector('#modal').open&&document.querySelector('#modal').close(),window.__sent.some(m=>m.action==='cloudflareSync')||autoSyncCloudflare()),
    // 项目、关停清单、定期清理
    projectNav:!!document.querySelector('#sidebar .nav-projects'),
    shutdown:!!proAction('shutdown'),
    review:!!document.querySelector('#sidebar [data-action="review"]'),
    // 探针
    probe:typeof probeOn==='function'&&probeOn(),
    // Slots for what is still to come
    future:['remindersApp','snapshot','handoverPack'].every(k=>Object.hasOwn(proSlots,k))
   }));
   // MCP and the command line: lookups and adding free, changing and deleting Pro
   r.mcpList=(await agent(p,{via:'mcp',method:'list',params:{}}))?.ok;
   r.mcpAdd=await agent(p,{via:'mcp',method:'add',params:{items:[{type:'domain',name:'added.example'}]}});
   r.cliList=await agent(p,{via:'cli',method:'list',params:{}});
   r.mcpForecast=(await agent(p,{via:'mcp',method:'forecast',params:{}}))?.ok;
   r.mcpUpdate=await agent(p,{via:'mcp',method:'update',params:{id:'s1',fields:{purpose:'mail'}}});
   r.cliPayment=await agent(p,{via:'cli',method:'recordPayment',params:{id:'s1',amount:5,currency:'USD'}});
   // Inbox 文件夹
   r.inbox=await p.evaluate(()=>{window.assetboardIntake([{source:'inbox',name:'drop.json',text:JSON.stringify({assetboard:1,items:[{type:'domain',name:'inbox.example'}]})}]);
    return {preview:document.querySelector('#modal')?.open&&document.querySelector('#modal').dataset.view==='import-preview',toast:document.querySelector('#toast').textContent};});
   await p.evaluate(()=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();});
   // What Pro recorded stays readable, and an edit without Pro keeps it.
   r.detail=await facts(p,'d1');
   r.kept=await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='d1');assetForm('domain','d1');const f=document.querySelector('#modal form');f.querySelector('[name="name"]').value='notes2.example';f.requestSubmit();
    const b=state.assets.find(x=>x.id==='d1');return {name:b.name,project:b.project,payments:(b.payments||[]).length,rdapAuto:state.rdapAuto===true};});
   // The free features stay: AI recognition, connecting Cloudflare and GitHub, the MCP setup.
   // 设置 has no section of its own for these modules; 关于 names the edition.
   r.panel=await p.evaluate(()=>{prefsDialog('pro');const pane=document.querySelector('#prefs-pane-pro'),text=pane?.textContent||'';
    prefsDialog('about');const edition=document.querySelector('#prefs-pane-about .prefs-edition')?.textContent||'';$('#modal').close();
    return {there:!!pane,text,tab:!!document.querySelector('#prefs-tab-pro'),edition};});
   r.free=await p.evaluate(()=>{importHub();const acts=[...document.querySelectorAll('#modal [data-action]')].map(b=>b.dataset.action);$('#modal').close();
    captureDialog();const ai=!!document.querySelector('#capture .capture-note [data-action="ai-settings"]');$('#modal').close();
    return {ai,cloudflare:acts.includes('cloudflare-import'),agent:acts.includes('agent-setup')};});
   check(!errors.length,(official?'official':'source')+' page errors: '+errors.join(' | '));
   results[official?'pro':'free']=r;
  }finally{await context.close();}
 }
 const f=results.free,o=results.pro;
 const say=JSON.stringify;
 const free=r=>r.ledgerCard&&r.forecast&&r.costHint===0&&r.priceMark&&r.recordPayment&&r.projectNav&&r.shutdown&&r.review;
 // A build from source: no Pro
 check(!f.on,'Pro is on in a build without the Pro modules');
 check(!f.rdapAuto&&f.rdapSwitch.checked===undefined&&!f.rdapSwitch.tag,'a build without Pro shows the weekly registry switch: '+say(f.rdapSwitch));
 check(!f.panel.there&&f.panel.edition==='源码构建','a build from source shows a section of its own or the wrong edition: '+say(f.panel));
 check(!f.cfAuto,'Cloudflare syncs on its own without Pro');
 check(!f.probe,'probes run without Pro');
 check(f.mcpUpdate?.ok===false&&/只在官方安装包里/.test(f.mcpUpdate.error)&&f.cliPayment?.ok===false&&/官方安装包/.test(f.cliPayment.error),'a change to a record goes through without Pro: '+say([f.mcpUpdate,f.cliPayment]));
 // Free either way
 check(free(f),'the ledger, projects, the shutdown list or 定期清理 are locked without Pro: '+say(f));
 check(f.mcpList===true&&f.mcpAdd?.ok===true&&f.cliList?.ok===true&&f.mcpForecast===true,'lookups or adding are locked without Pro: '+say([f.mcpList,f.mcpAdd,f.cliList,f.mcpForecast]));
 check(f.inbox.preview,'the Inbox folder does not import without Pro: '+say(f.inbox));
 check(f.detail.includes('notes-app')&&f.detail.includes('涨价')&&f.detail.includes('付款')&&f.detail.includes('$10'),'the detail lacks the project, price change or payments: '+f.detail.slice(0,400));
 check(f.kept.name==='notes2.example'&&f.kept.project==='notes-app'&&f.kept.payments===1&&f.kept.rdapAuto,'an edit without Pro lost something: '+say(f.kept));
 check(f.free.ai&&f.free.cloudflare&&f.free.agent&&f.future,'a free feature is missing without Pro: '+say(f.free));
 // On in the official build, with no licence
 check(!o.panel.there&&o.panel.edition==='官方版','设置 names the modules or the wrong edition: '+say(o.panel));
 check(o.on&&free(o),'a free feature is missing with Pro: '+say(o));
 check(o.rdapAuto&&o.rdapSwitch.checked&&!o.rdapSwitch.disabled&&!o.rdapSwitch.tag,'the weekly registry check stays locked with Pro: '+say(o.rdapSwitch));
 check(o.cfAuto,'Cloudflare does not sync on its own with Pro');
 check(o.probe,'probes stay locked with Pro');
 check(o.mcpList===true&&o.mcpAdd?.ok===true&&o.cliList?.ok===true&&o.mcpForecast===true&&o.mcpUpdate?.ok===true&&o.cliPayment?.ok===true,'MCP or command line changes stay locked with Pro: '+say([o.mcpUpdate,o.cliPayment]));
 check(o.inbox.preview,'the Inbox folder does not import with Pro: '+say(o.inbox));
 check(o.kept.project==='notes-app'&&o.kept.payments===1,'an edit with Pro lost data: '+say(o.kept));
 check(o.free.ai&&o.free.cloudflare&&o.free.agent,'a free feature is missing with Pro: '+say(o.free));
 return 'ok';
}
