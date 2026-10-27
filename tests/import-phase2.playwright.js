// Phase-2 import: Cloudflare prefilled token URL, SSH/eml routing, account tags, multi OCR accept, local CLI detect UI.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const setup=async()=>{
  const context=await page.context().browser().newContext();const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{
   window.__saves=[];window.__sent=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){
    window.__sent.push(m);
    if(m.action==='save'){window.__saves.push(m);setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:true,ghAccounts:['alice','bob'],sshConfig:true,ghPath:'/opt/homebrew/bin/gh'}),10);
    if(m.action==='sshConfigImport')setTimeout(()=>window.assetboardSshResult?.({ok:true,text:['Host demo-box','  HostName 203.0.113.10','  User deploy','  Port 22',''].join('\n')}),20);
    if(m.action==='githubSyncLocal')setTimeout(()=>window.assetboardGitHubResult?.({ok:true,connected:false,accounts:['alice','bob'],repositories:[{id:11,name:'alice/site',owner:'alice',private:false,archived:false,url:'https://github.com/alice/site',updatedAt:'2026-10-01T00:00:00Z'},{id:12,name:'bob/api',owner:'bob',private:true,archived:false,url:'https://github.com/bob/api',updatedAt:'2026-10-02T00:00:00Z'}],warnings:[]}),30);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof importHub==='function'&&typeof parseSshConfig==='function');
  return {p,context,errors};
 };

 let {p,context,errors}=await setup();
 try {
  await p.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice','bob'],sshConfig:true};importHub();});
  await p.waitForTimeout(50);
  const hub=await p.locator('#modal[data-view="import"]').textContent();
  // gh in the hub is Pro (pro/web/import-pro.js); the free copy only offers SSH here.
  if(await p.evaluate(()=>proSlots.importCli.length))check(hub.includes('alice')&&hub.includes('bob'),'Hub lists gh accounts: '+hub.slice(0,200));
  check(hub.includes('~/.ssh/config'),'Hub offers ssh import');
  check((await p.locator('#import-file').getAttribute('accept')||'').includes('.eml'),'File picker accepts eml');
  check((await p.locator('#import-file').getAttribute('multiple'))!==null,'File picker allows multiple');
 } finally { await context.close(); }

 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>cloudflareDialog());
  const link=await p.locator('[data-action="setup-cloudflare"]').getAttribute('data-url');
  check(link&&link.includes('permissionGroupKeys=')&&link.includes('profile/api-tokens'),'Cloudflare button carries prefilled token URL');
  const decoded=decodeURIComponent(link.split('permissionGroupKeys=')[1].split('&')[0]);
  const keys=JSON.parse(decoded).map(x=>x.key);
  check(keys.includes('zone')&&keys.includes('workers_r2'),'Prefill includes zone and r2: '+keys);
 } finally { await context.close(); }

 ({p,context,errors}=await setup());
 try {
  const eml=['From: billing@example-vps.test','Subject: Invoice','Content-Type: text/plain','','Amount due: $6.00'].join('\r\n');
  await p.evaluate(raw=>routeImportText(raw,{filename:'invoice.eml'}),eml);
  check(await p.locator('#modal').evaluate(d=>d.open),'Eml opens review modal');
  check((await p.locator('#modal-title').textContent()).includes('核对')||(await p.locator('#modal-content').textContent()).includes('Invoice'),'Eml review shows content');
 } finally { await context.close(); }

 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice'],sshConfig:true};importHub();});
  await p.waitForSelector('[data-action="ssh-import"]');
  await p.evaluate(()=>window.webkit.messageHandlers.assetboard.postMessage({action:'sshConfigImport'}));
  await p.waitForTimeout(100);
  const names=await p.evaluate(()=>state.assets.filter(a=>a.source==='ssh').map(a=>a.name));
  check(names.includes('demo-box'),'SSH import adds host: '+names);
  check(await p.evaluate(()=>document.querySelector('#board [data-asset] .account-tag')?.textContent==='deploy'||state.assets.some(a=>a.account==='deploy')),'SSH account tag / account field set');
 } finally { await context.close(); }

 ({p,context,errors}=await setup());
 try {
  await p.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice','bob'],sshConfig:false};});
  await p.evaluate(()=>githubDialog());
  await p.waitForSelector('[data-action="github-local-sync"]');
  await p.evaluate(()=>window.webkit.messageHandlers.assetboard.postMessage({action:'githubSyncLocal'}));
  await p.waitForTimeout(120);
  const accounts=await p.evaluate(()=>[...new Set(state.assets.filter(a=>a.source==='github').map(a=>a.account))].sort());
  check(JSON.stringify(accounts)===JSON.stringify(['alice','bob']),'Multi-account gh merge tags owners: '+accounts);
  await p.waitForTimeout(50);
  const tags=await p.evaluate(()=>[...document.querySelectorAll('#board .account-tag')].map(el=>el.textContent).sort());
  check(tags.includes('alice')&&tags.includes('bob'),'Board shows account tags: '+tags);
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 return 'PASS: phase2 hub CLI detect, Cloudflare prefill URL, eml route, ssh import, gh multi-account tags';
}
