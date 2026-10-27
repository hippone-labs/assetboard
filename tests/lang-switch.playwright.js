// Run with the browser tool's filename option. 设置 › 语言: in the browser a choice reloads the page in that language and comes back
// with 设置 open; in the Mac app the page only tells the app (which rebuilds its menus and loads the page again with `reopen`).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const until=async fn=>{for(let i=0;i<100;i++){if(await p.evaluate(fn).catch(()=>false))return;await p.waitForTimeout(50);}throw new Error('timeout: '+fn);};
 try {
  await p.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('assetboard-prototype-v1',JSON.stringify({blocks:[{id:'domain',folded:false}],assets:[{id:'d1',type:'domain',name:'example.com',source:'manual',art:'generic'}]}));}});
  await p.goto('http://127.0.0.1:4317/');await until(()=>typeof prefsDialog==='function'&&!!$('#sidebar'));
  await p.evaluate(()=>prefsDialog());
  check(await p.locator('#modal [data-action="prefs-lang"]').count()===2,'Two languages offered');
  await p.click('#modal [data-action="prefs-lang"][data-id="en"]');
  await until(()=>document.documentElement.lang==='en'&&$('#modal').open&&$('#modal').dataset.view==='prefs');
  check(await p.evaluate(()=>$('#sidebar').textContent.includes('All assets')&&state.assets.length===1),'English after the reload, board kept, 设置 open again');
  await p.click('#modal [data-action="prefs-lang"][data-id="zh"]');
  await until(()=>document.documentElement.lang==='zh-CN'&&$('#modal').open);
  check(await p.evaluate(()=>$('#sidebar').textContent.includes('全部资产')),'Back in Chinese');
  // The Mac app: the page asks, the app does the rest; a page loaded with reopen opens 设置.
  const mac=await context.newPage();
  await mac.addInitScript(()=>{window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain',folded:false}],assets:[]},lang:'en',reopen:'prefs',cloudflareConnected:false,githubConnected:false};});
  await mac.goto('http://127.0.0.1:4317/');
  for(let i=0;i<100&&!await mac.evaluate(()=>$('#modal')?.open===true).catch(()=>false);i++)await mac.waitForTimeout(50);
  check(await mac.evaluate(()=>$('#modal').dataset.view==='prefs'&&document.documentElement.lang==='en'),'reopen: 设置 opens in the language the app passed');
  await mac.click('#modal [data-action="prefs-lang"][data-id="zh"]');
  check(await mac.evaluate(()=>JSON.stringify(window.__sent.filter(m=>m.action==='preference'))==='[{"action":"preference","key":"lang","value":"zh"}]'&&document.documentElement.lang==='en'),'The Mac page only tells the app');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS';
}
