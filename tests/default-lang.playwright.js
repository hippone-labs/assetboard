// Run with the browser tool's filename option. A board nobody chose a language for opens in English, in the browser and in the
// Mac app; 设置 › 语言 › 简体中文 switches it, and the choice is kept from then on.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const until=async fn=>{for(let i=0;i<100;i++){if(await p.evaluate(fn).catch(()=>false))return;await p.waitForTimeout(50);}throw new Error('timeout: '+fn);};
 try {
  // A new install: no language stored (the runner's 中文 is taken away on the first load only).
  await p.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.removeItem('assetboard-lang-v1');localStorage.setItem('assetboard-prototype-v1',JSON.stringify({blocks:[{id:'domain',folded:false}],assets:[{id:'d1',type:'domain',name:'example.com',source:'manual',art:'generic'}]}));}});
  await p.goto('http://127.0.0.1:4317/');await until(()=>typeof prefsDialog==='function'&&!!$('#sidebar'));
  check(await p.evaluate(()=>document.documentElement.lang==='en'&&appLang==='en'),'English by default');
  check(await p.evaluate(()=>$('#sidebar').textContent.includes('All assets')&&!$('#sidebar').textContent.includes('全部资产')),'The sidebar is in English');
  check(await p.evaluate(()=>localStorage.getItem('assetboard-lang-v1')===null),'The default is not written down as a choice');
  await p.evaluate(()=>prefsDialog());
  check(await p.locator('#modal [data-action="prefs-lang"][data-id="en"][aria-checked="true"]').count()===1,'设置 shows English as the language');
  await p.click('#modal [data-action="prefs-lang"][data-id="zh"]');
  await until(()=>document.documentElement.lang==='zh-CN'&&$('#modal').open&&$('#modal').dataset.view==='prefs');
  check(await p.evaluate(()=>$('#sidebar').textContent.includes('全部资产')&&state.assets.length===1),'Chinese after the switch, board kept');
  check(await p.evaluate(()=>localStorage.getItem('assetboard-lang-v1')==='zh'),'The choice is stored');
  await p.reload();await until(()=>!!$('#sidebar')&&typeof appLang==='string');
  check(await p.evaluate(()=>appLang==='zh'&&$('#sidebar').textContent.includes('全部资产')),'A chosen language is kept on the next start');
  // The Mac app passes its own language; a page given none (or one it does not know) is English too.
  for(const [lang,want] of [[undefined,'en'],['xx','en'],['zh','zh']]){
   const mac=await context.newPage();
   await mac.addInitScript(lang=>{localStorage.removeItem('assetboard-lang-v1');window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
    window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain',folded:false}],assets:[]},...(lang?{lang}:{}),cloudflareConnected:false,githubConnected:false};},lang);
   await mac.goto('http://127.0.0.1:4317/');
   for(let i=0;i<100&&!await mac.evaluate(()=>!!$('#sidebar')).catch(()=>false);i++)await mac.waitForTimeout(50);
   check(await mac.evaluate(()=>appLang)===want,`Mac app passing ${lang}: ${want}`);
   await mac.close();
  }
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS';
}
