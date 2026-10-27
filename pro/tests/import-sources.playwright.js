// Run with the browser tool's filename option. The Pro connectors in the import window (pro/web/import-pro.js): in the Mac app
// with gh detected, gh with its accounts, MCP 接入 and Cloudflare; without gh, the token button; under 添加资产, the import
// link naming them and MCP 接入. Uses an isolated page and never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext(),p=await context.newPage();
 try {
  await p.addInitScript(()=>{
   window.webkit={messageHandlers:{assetboard:{postMessage(msg){
    if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
    if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(msg.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.(window.__localCli),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  const hub=cli=>p.evaluate(cli=>{window.__localCli=cli;importHub();
   return {actions:[...document.querySelectorAll('#modal[data-view="import"] [data-action]')].map(el=>el.dataset.action),cli:document.querySelector('#modal .import-cli')?.textContent||''};},cli);
  const full=await hub({gh:true,ghAccounts:['alice','bob'],sshConfig:true});
  for(const action of ['github-local-sync','agent-setup','cloudflare-import','ssh-import','ocr-import'])check(full.actions.includes(action),`the import window lacks ${action}: ${full.actions.join(', ')}`);
  check(full.cli.includes('alice')&&full.cli.includes('bob'),'gh lists its accounts: '+full.cli);
  const token=await hub({gh:false,ghAccounts:[],sshConfig:false});
  check(token.actions.includes('github-import')&&!token.actions.includes('github-local-sync'),'without gh the token button stands in: '+token.actions.join(', '));
  const capture=await p.evaluate(()=>{captureDialog();const box=document.querySelector('#capture .capture-links');
   return {actions:[...box.querySelectorAll('[data-action]')].map(el=>el.dataset.action),text:box.textContent};});
  check(capture.actions.includes('import-hub')&&capture.actions.includes('agent-setup')&&/GitHub/.test(capture.text)&&/MCP/.test(capture.text),'添加资产 offers the Pro ways in: '+capture.text);
  return 'ok';
 } finally { await context.close(); }
}
