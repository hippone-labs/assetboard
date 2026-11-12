// The update offer (desktop/Updater.swift → window.assetboardUpdateOffer): the notes in the interface language as a list, the other
// language folded under its own name, 下载并安装 / 稍后 answered back to the app, and no offer over a dialog that is open.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const notes={en:'- All Assets reads as a ledger.\n- Paste a domain and the form opens\n  with the expiry date filled in.',zh:'- 「全部资产」改成账本样式。\n- 粘贴一个域名，直接打开域名表单。'};
 for(const lang of ['zh','en']){
  const context=await page.context().browser().newContext({viewport:{width:1280,height:800},locale:lang==='zh'?'zh-CN':'en-US'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  try {
   await p.addInitScript(lang=>{window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);}}}};
    window.__ASSETBOARD_NATIVE__={demo:false,lang,version:'2026.11.7',cloudflareConnected:false,githubConnected:false,data:{blocks:[],assets:[]}};},lang);
   await p.goto('http://127.0.0.1:4317/');await p.waitForTimeout(500);
   check(await p.evaluate(notes=>window.assetboardUpdateOffer({version:'2026.11.8',notes}),notes)===true,`${lang}: the offer is shown`);
   const shown=await p.evaluate(()=>{const c=$('#modal-content'),main=c.querySelector('.update-offer>.update-notes'),other=c.querySelector('.update-other');
    return {title:$('#modal-title').textContent,current:c.querySelector('.update-offer>.form-note')?.textContent,items:[...main.querySelectorAll('li')].map(li=>li.textContent),
     lang:main.lang,folded:other&&!other.open,summary:other?.querySelector('summary').textContent,otherVisible:other?.querySelector('.update-notes li').checkVisibility(),
     buttons:[...c.querySelectorAll('.confirm-actions button')].map(b=>b.textContent)};});
   const main=lang==='zh'?['「全部资产」改成账本样式。','粘贴一个域名，直接打开域名表单。']:['All Assets reads as a ledger.','Paste a domain and the form opens with the expiry date filled in.'];
   check(shown.title==='Assetboard 2026.11.8'&&JSON.stringify(shown.items)===JSON.stringify(main)&&shown.lang===(lang==='zh'?'zh-CN':'en'),`${lang}: the interface language's notes come first: `+JSON.stringify(shown));
   check(shown.folded&&!shown.otherVisible&&shown.summary===(lang==='zh'?'English':'简体中文'),`${lang}: the other language is folded under its name: `+JSON.stringify(shown));
   check(shown.current===(lang==='zh'?'当前版本 2026.11.7':'Current version 2026.11.7')&&JSON.stringify(shown.buttons)===JSON.stringify(lang==='zh'?['下载并安装','稍后']:['Download and Install','Later']),`${lang}: version and buttons: `+JSON.stringify(shown));
   await p.click('.update-other summary');
   check(await p.evaluate(()=>$('.update-other .update-notes li').checkVisibility()),`${lang}: the other language opens`);
   await p.click('#update-install');
   let sent=await p.evaluate(()=>window.__sent.filter(m=>m.action==='updateChoice'));
   check(!(await p.evaluate(()=>$('#modal').open))&&JSON.stringify(sent)==='[{"action":"updateChoice","install":true,"version":"2026.11.8"}]',`${lang}: 下载并安装 answers once: `+JSON.stringify(sent));
   // Escape is 稍后; notes in one language only show that language with nothing folded.
   await p.evaluate(()=>window.assetboardUpdateOffer({version:'2026.11.9',notes:{en:'- Fixes'}}));
   check(await p.evaluate(()=>!$('.update-other')&&$('.update-notes li').textContent==='Fixes'),`${lang}: notes in one language only`);
   // the answer goes to the app when the dialog has closed: wait for it, up to 3 s on a slow machine
   await p.keyboard.press('Escape');await p.waitForFunction(()=>window.__sent.some(m=>m.action==='updateChoice'&&m.version==='2026.11.9'),null,{timeout:3000,polling:25}).catch(()=>{});
   sent=await p.evaluate(()=>window.__sent.filter(m=>m.action==='updateChoice').at(-1));
   check(sent.install===false&&sent.version==='2026.11.9',`${lang}: closing is 稍后: `+JSON.stringify(sent));
   // Another dialog stays: the app asks in an alert instead.
   await p.evaluate(()=>{confirmDialog('Test','Keep me','OK');});
   check(await p.evaluate(()=>window.assetboardUpdateOffer({version:'2026.11.8',notes:{en:'- x'}}))===false&&await p.evaluate(()=>$('#modal').dataset.view==='confirm'),`${lang}: no offer over an open dialog`);
   check(!errors.length,'Page errors: '+errors.join(' | '));
  } finally { await context.close(); }
 }
 return 'PASS';
}
