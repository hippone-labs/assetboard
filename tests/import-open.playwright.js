// Run with the browser tool's filename option. task-10: opening 导入 asks the Mac app once to look for gh and ~/.ssh/config; the
// window is there at once and stays usable while the app looks (检测中 in that row only); the answer redraws that row, not the
// window, so it does not ask again (it used to: an endless loop of gh runs while the window was open); reopening soon after
// reuses the answer, 重新检测 asks once more, and nothing is asked after the window closes. Isolated page, stubbed bridge.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const context=await page.context().browser().newContext(),p=await context.newPage();
 try {
  await p.addInitScript(()=>{
   window.__asks=0;window.__hold=null;
   window.webkit={messageHandlers:{assetboard:{postMessage(msg){
    if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
    if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    // Detection answers only when the test lets it (window.__answer()), like a slow gh.
    if(msg.action==='localCliDetect'){window.__asks++;window.__answer=()=>window.assetboardLocalCliDetect({gh:false,ghAccounts:[],sshConfig:true});}
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  for(let i=0;i<100&&!await p.evaluate(()=>typeof importHub==='function');i++)await wait(40);
  await p.evaluate(()=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();});
  await p.locator('#import-button').click();
  const opened=await p.evaluate(()=>({view:document.querySelector('#modal').dataset.view,open:document.querySelector('#modal').open,asks:window.__asks,
   wait:document.querySelector('#modal .import-cli-wait')?.textContent||'',busy:document.querySelector('[data-action="local-cli-refresh"]').disabled}));
  check(opened.open&&opened.view==='import','the import window opens at once: '+JSON.stringify(opened));
  check(opened.asks===1&&/检测/.test(opened.wait)&&opened.busy,'one detection, shown as in progress in its row: '+JSON.stringify(opened));
  // While gh is still being looked at, the rest of the window works.
  await p.evaluate(()=>{document.querySelector('#import-drop').dataset.mark='same';});
  await wait(200);
  check(await p.evaluate(()=>window.__asks)===1,'no further asks while waiting');
  await p.evaluate(()=>window.__answer());
  await wait(200);
  const answered=await p.evaluate(()=>({asks:window.__asks,mark:document.querySelector('#import-drop')?.dataset.mark,ssh:!!document.querySelector('#modal [data-action="ssh-import"]'),
   wait:!!document.querySelector('#modal .import-cli-wait'),busy:document.querySelector('[data-action="local-cli-refresh"]').disabled}));
  check(answered.asks===1,'the answer does not ask again (no loop): '+answered.asks);
  check(answered.mark==='same','the answer redraws only its row, not the window');
  check(answered.ssh&&!answered.wait&&!answered.busy,'the row shows what was found: '+JSON.stringify(answered));
  // Closing and reopening soon after reuses the answer.
  await p.locator('#close-modal').click();
  await p.locator('#import-button').click();
  await wait(150);
  check(await p.evaluate(()=>window.__asks)===1,'a fresh answer is reused on reopen');
  check(await p.evaluate(()=>!!document.querySelector('#modal [data-action="ssh-import"]')),'the reopened window shows it at once');
  // 重新检测 asks once; a late answer after closing changes nothing and asks nothing.
  await p.locator('[data-action="local-cli-refresh"]').click();
  check(await p.evaluate(()=>window.__asks)===2,'重新检测 asks again');
  await p.locator('#close-modal').click();
  await p.evaluate(()=>window.__answer());
  await wait(200);
  check(await p.evaluate(()=>window.__asks)===2&&!await p.evaluate(()=>document.querySelector('#modal').open),'nothing runs after the window is closed');
  // Other sources stay usable from the window while gh is slow.
  await p.locator('#import-button').click();
  await p.locator('#modal [data-action="manual-import"]').click();
  check(await p.evaluate(()=>document.querySelector('#modal').open),'手动 still opens');
  return 'ok';
 } finally { await context.close(); }
}
