// Run with the browser tool's filename option. Each Pro feature of the plan (2026-11-02) is locked without a licence and unlocked with
// one, the Mac app faked (nativeStore.pro as License.swift reports it after checking the test licence); what Pro recorded stays readable
// and survives an edit without it; the free features stay on. Never saves for real (the fake app answers saves).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const browser=page.context().browser();
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
 const open=async licensed=>{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});
  await p.addInitScript(({licensed,assets})=>{
   window.__sent=[];window.__replies=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='agentReply')window.__replies.push(JSON.parse(m.reply));
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain'},{id:'subscription'}],assets,cardOrder:{},rdapAuto:true},cloudflareConnected:true,githubConnected:false,version:'2026.11.1',
    pro:licensed?{on:true,kind:'licensed',id:'K3Q7NVHM'}:{on:false,kind:'free'}};
  },{licensed,assets:[
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
 for(const licensed of [false,true]){
  const {p,context,errors}=await open(licensed);
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
   // MCP: lookups free, writes and the command line Pro
   r.mcpList=(await agent(p,{via:'mcp',method:'list',params:{}}))?.ok;
   r.mcpAdd=await agent(p,{via:'mcp',method:'add',params:{items:[{type:'domain',name:'added.example'}]}});
   r.cliList=await agent(p,{via:'cli',method:'list',params:{}});
   r.mcpForecast=(await agent(p,{via:'mcp',method:'forecast',params:{}}))?.ok;
   // Inbox 文件夹
   r.inbox=await p.evaluate(()=>{window.assetboardIntake([{source:'inbox',name:'drop.json',text:JSON.stringify({assetboard:1,items:[{type:'domain',name:'inbox.example'}]})}]);
    return {preview:document.querySelector('#modal')?.open&&document.querySelector('#modal').dataset.view==='import-preview',toast:document.querySelector('#toast').textContent};});
   await p.evaluate(()=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();});
   // What Pro recorded stays readable, and an edit without Pro keeps it.
   r.detail=await facts(p,'d1');
   r.kept=await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='d1');assetForm('domain','d1');const f=document.querySelector('#modal form');f.querySelector('[name="name"]').value='notes2.example';f.requestSubmit();
    const b=state.assets.find(x=>x.id==='d1');return {name:b.name,project:b.project,payments:(b.payments||[]).length,rdapAuto:state.rdapAuto===true};});
   // The free features stay: AI recognition, connecting Cloudflare and GitHub, the read-only MCP setup.
   r.free=await p.evaluate(()=>{importHub();const acts=[...document.querySelectorAll('#modal [data-action]')].map(b=>b.dataset.action);
    return {ai:!!proSlots.captureAiLink,cloudflare:acts.includes('cloudflare-import'),agent:acts.includes('agent-setup')};});
   check(!errors.length,(licensed?'licensed':'free')+' page errors: '+errors.join(' | '));
   results[licensed?'pro':'free']=r;
  }finally{await context.close();}
 }
 const f=results.free,o=results.pro;
 const say=JSON.stringify;
 // Locked without a licence
 check(!f.on,'Pro is on without a licence');
 check(!f.ledgerCard&&!f.forecast&&f.costHint===1&&!f.priceMark&&!f.recordPayment,'the ledger, forecast or price marks are open without Pro: '+say(f));
 check(!f.rdapAuto&&f.rdapSwitch.checked&&f.rdapSwitch.disabled&&f.rdapSwitch.tag,'the weekly registry check is not locked (kept on, disabled, marked): '+say(f.rdapSwitch));
 check(!f.cfAuto,'Cloudflare syncs on its own without Pro');
 check(!f.projectNav&&!f.shutdown&&!f.review,'projects, the shutdown list or 定期清理 are open without Pro: '+say(f));
 check(!f.probe,'probes run without Pro');
 check(f.mcpList===true&&f.mcpAdd?.ok===false&&/Pro/.test(f.mcpAdd.error)&&f.cliList?.ok===false&&/命令行/.test(f.cliList.error)&&f.mcpForecast===false,'MCP is not read-only, or the command line is open, without Pro: '+say([f.mcpList,f.mcpAdd,f.cliList,f.mcpForecast]));
 check(!f.inbox.preview&&/Inbox/.test(f.inbox.toast),'the Inbox folder imports without Pro: '+say(f.inbox));
 // What Pro recorded is shown read-only and kept
 check(f.detail.includes('notes-app')&&f.detail.includes('涨价')&&f.detail.includes('付款')&&f.detail.includes('$10'),'Pro data is not shown read-only: '+f.detail.slice(0,400));
 check(f.kept.name==='notes2.example'&&f.kept.project==='notes-app'&&f.kept.payments===1&&f.kept.rdapAuto,'an edit without Pro lost what Pro recorded: '+say(f.kept));
 check(f.free.ai&&f.free.cloudflare&&f.free.agent&&f.future,'a free feature is missing without Pro: '+say(f.free));
 // Unlocked with the licence
 check(o.on&&o.ledgerCard&&o.forecast&&o.costHint===0&&o.priceMark&&o.recordPayment,'the ledger, forecast or price marks stay locked with Pro: '+say(o));
 check(o.rdapAuto&&o.rdapSwitch.checked&&!o.rdapSwitch.disabled&&!o.rdapSwitch.tag,'the weekly registry check stays locked with Pro: '+say(o.rdapSwitch));
 check(o.cfAuto,'Cloudflare does not sync on its own with Pro');
 check(o.projectNav&&o.shutdown&&o.review&&o.probe,'projects, 定期清理 or probes stay locked with Pro: '+say(o));
 check(o.mcpList===true&&o.mcpAdd?.ok===true&&o.cliList?.ok===true&&o.mcpForecast===true,'MCP writes or the command line stay locked with Pro: '+say([o.mcpAdd,o.cliList]));
 check(o.inbox.preview,'the Inbox folder does not import with Pro: '+say(o.inbox));
 check(o.kept.project==='notes-app'&&o.kept.payments===1,'an edit with Pro lost data: '+say(o.kept));
 check(o.free.ai&&o.free.cloudflare&&o.free.agent,'a free feature is missing with Pro: '+say(o.free));
 return 'ok';
}
