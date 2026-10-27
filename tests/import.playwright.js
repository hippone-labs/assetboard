// Unified import: paste/drop CSV & JSON, preview groups, direct write, batch undo, 100-row cap, blacklist restore, demo sample without saving.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const setup=async({demo=false,native=true}={})=>{
  const context=await page.context().browser().newContext();const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({demo,native})=>{
   window.__saves=[];
   if(native){
    window.webkit={messageHandlers:{assetboard:{postMessage(m){
     if(m.action==='save'){window.__saves.push(m);setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}
     if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    }}}};
    const board={blocks:[{id:'domain',width:50,height:null,density:'full',folded:false}],assets:[
     {id:'existing',type:'domain',name:'taken.com',provider:'Manual',account:'',art:'generic',source:'manual',createdAt:'2026-01-01T00:00:00Z'}
    ],deletedExternalIds:['csv:domain:gone.com']};
    window.__ASSETBOARD_NATIVE__={demo,data:board,cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
   }
   if(demo)window.assetboardDemoBoard=()=>({blocks:[{id:'domain',width:50}],assets:[{id:'demo1',type:'domain',name:'demo-only.com',provider:'Demo',source:'demo',art:'generic'}],deletedExternalIds:[]});
  },{demo,native});
  await p.goto('http://127.0.0.1:4317/'+(demo&&!native?'?demo':''));
  await until(p,()=>typeof importHub==='function'&&typeof planImport==='function');
  return {p,context,errors};
 };

 // Welcome wording + hub from welcome card (native hides the HTML toolbar).
 let {p,context,errors}=await setup();
 try {
  await p.evaluate(()=>{state.assets=[];state.blocks=[];render();});
  check(await p.locator('#welcome:not([hidden])').count()===1,'Empty board shows welcome');
  const welcome=await p.locator('#welcome').textContent();
  check(welcome.includes('Cloudflare')&&!welcome.includes('Zone'),'Welcome names Cloudflare without detail copy');
  await p.locator('#welcome [data-action="import-hub"]').click();
  check(await p.locator('#modal[data-view="import"]').count()===1,'Import hub opens from welcome');
  check(await p.locator('#import-drop').count()===1,'Drop zone is present');
 } finally { await context.close(); }

 // Browser toolbar import button (no native chrome).
 ({p,context,errors}=await setup({native:false}));
 try {
  await p.evaluate(()=>{localStorage.clear();state={blocks:[{id:'domain',width:50}],assets:[{id:'x',type:'domain',name:'x.com',source:'manual',art:'generic'}],deletedExternalIds:[]};history=[];future=[];render();});
  await p.locator('#import-button').click();
  check(await p.locator('#modal[data-view="import"]').count()===1,'Browser toolbar opens import hub');
 } finally { await context.close(); }

 // Paste CSV: blacklist forces preview; restore + undo.
 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>{state.assets=[{id:'existing',type:'domain',name:'taken.com',provider:'Manual',source:'manual',art:'generic'}];state.deletedExternalIds=['csv:domain:gone.com'];state.blocks=[{id:'domain',width:50}];history=[];future=[];render();});
  const csv='名称,类别,平台\nfresh.dev,域名,Example\ntaken.com,域名,Example\ngone.com,域名,Example\n';
  await p.evaluate(text=>routeImportText(text,{filename:'list.csv'}),csv);
  check(await p.locator('#modal[data-view="import-preview"]').count()===1,'Blacklist forces preview');
  const preview=await p.locator('#import-preview').textContent();
  check(preview.includes('已删除')&&preview.includes('新增'),'Preview lists deleted-skipped and new rows');
  await p.locator('input[name="import-restore"]').check();
  await p.locator('[data-action="import-apply"]').click();
  const names=await p.evaluate(()=>state.assets.map(a=>a.name).sort());
  check(names.includes('fresh.dev')&&names.includes('gone.com')&&names.filter(n=>n==='taken.com').length===1,'Apply adds fresh+restored, keeps one taken.com: '+names);
  check(!(await p.evaluate(()=>state.deletedExternalIds.includes('csv:domain:gone.com'))),'Restored key leaves the blacklist');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.some(a=>a.name==='fresh.dev')&&state.deletedExternalIds.includes('csv:domain:gone.com')),'Undo restores pre-import state');
 } finally { await context.close(); }

 // No-conflict CSV writes directly.
 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>{state={blocks:[],assets:[],deletedExternalIds:[]};history=[];future=[];render();});
  await p.evaluate(()=>routeImportText('名称,类别\nalpha.dev,域名\nbeta.dev,域名\n'));
  check(!(await p.evaluate(()=>document.querySelector('#modal')?.open)),'No preview when there is no conflict');
  check(await p.evaluate(()=>state.assets.map(a=>a.name).sort().join(',')),'alpha.dev,beta.dev');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.assets.length===0),'Batch undo clears both rows');
 } finally { await context.close(); }

 // 100-row cap.
 ({p,context,errors}=await setup());
 try {
  const lines=['名称,类别',...Array.from({length:105},(_,i)=>`site-${i}.com,域名`)];
  await p.evaluate(text=>routeImportText(text),lines.join('\n'));
  check(await p.locator('#modal[data-view="import-preview"]').count()===1,'Over-limit import opens preview');
  check((await p.locator('#import-preview').textContent()).includes('100'),'Preview mentions the 100-row cap');
 } finally { await context.close(); }

 // JSON backup merge.
 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>{state={blocks:[{id:'domain',width:50}],assets:[{id:'keep',type:'domain',name:'old.com',source:'manual',art:'generic',notes:'local'}],deletedExternalIds:[]};history=[];future=[];render();});
  const backup=JSON.stringify({blocks:[{id:'domain',width:50},{id:'server',width:50}],assets:[{id:'keep',type:'domain',name:'new.com',source:'manual',notes:'backup'},{id:'extra',type:'server',name:'box-1',source:'manual',art:'generic'}]});
  await p.evaluate(text=>routeImportText(text,{filename:'Assetboard-backup.json'}),backup);
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='keep').name==='new.com'&&state.assets.some(a=>a.id==='extra')),'JSON merge updates by id and adds new');
 } finally { await context.close(); }

 // Demo sample: in-memory only, no saves.
 ({p,context,errors}=await setup({demo:true}));
 try {
  await p.evaluate(()=>importHub());
  check(await p.locator('[data-action="import-demo-sample"]').count()===1,'Demo hub offers sample CSV');
  await p.locator('[data-action="import-demo-sample"]').click();
  await p.waitForTimeout(200);
  const after=await p.evaluate(()=>({names:state.assets.map(a=>a.name),saves:window.__saves.length,demo:document.documentElement.classList.contains('demo-mode')}));
  check(after.demo,'Demo mode class is on');
  check(after.names.some(n=>/sample-studio|demo-box|Example Notes/.test(n)),'Sample rows appear in memory: '+after.names);
  check(after.saves===0,'Demo import does not post save messages');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 return 'PASS: import hub, welcome wording, CSV paste with preview groups, blacklist restore, direct write, batch undo, 100-row cap, JSON merge, demo sample without save';
}
