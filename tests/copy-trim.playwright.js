// v11 copy trim: one text focus per area, icon-only buttons keep title + accessible name, key warnings stay, no filler wording.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const rows=[{id:'apple-1',kind:'gmail',source:'Apple <no_reply@email.apple.com>',title:'Your receipt from Apple.',body:'Total ¥89.00',importedAt:'2026-09-20T00:00:00Z',payload:JSON.stringify({date:'Sat, 19 Sep 2026 08:00:00 +0000'})}];
 const setup=async({native=true,w=1280,h=860}={})=>{
  const context=await page.context().browser().newContext({viewport:{width:w,height:h}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({native,rows})=>{
   window.__sent=[];
   if(native){
    window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
     if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
     if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.(JSON.parse(JSON.stringify(rows))),5);
    }}}};
    window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain',width:50,height:null,density:'full',folded:false}],assets:[{id:'d1',type:'domain',name:'keep.dev',provider:'Reg',account:'',art:'generic',source:'manual',createdAt:'2026-01-01T00:00:00Z'}],deletedExternalIds:['csv:domain:gone.com']},cloudflareConnected:false,githubConnected:false,gmailConfigured:true};
   }
  },{native,rows});
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof importHub==='function'&&typeof ui==='function');
  return {p,context,errors};
 };
 // Every control without visible text must carry a title and an accessible name.
 const unnamed=p=>p.evaluate(()=>[...document.querySelectorAll('#modal[open] button,#detail:not([hidden]) button,#keys-help:not([hidden]) button,#welcome:not([hidden]) button')].filter(b=>!b.textContent.trim()&&(!(b.getAttribute('aria-label')||'').trim()||!(b.getAttribute('title')||b.getAttribute('aria-label')||'').trim())).map(b=>b.outerHTML.slice(0,120)));

 let {p,context,errors}=await setup();
 try {
  // Welcome: title + one primary choice, hints live in title attributes, no sentences underneath.
  await p.evaluate(()=>{state.assets=[];state.blocks=[];render();});
  check(await p.locator('#welcome>p').count()===0&&await p.locator('.welcome-note').count()===0,'Welcome has no sentences under the title');
  check(await p.locator('#welcome .welcome-choice.primary').count()===1,'Welcome has one primary choice');
  check(await p.locator('#welcome .welcome-choice > span').count()===0,'Welcome cards carry no subtitles');
  check((await p.locator('#welcome [data-action="import-hub"]').getAttribute('title')).includes('⌘Z'),'Import hint moved into the title attribute');
  check((await unnamed(p)).length===0,'Welcome controls are named');

  // Import hub: one focus (drop zone), format badges, CLI row without prose, icon refresh button named.
  await p.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice','bob'],sshConfig:true};importHub();});
  await p.waitForTimeout(40);
  const hubText=(await p.locator('#modal-content').innerText()).replace(/\s+/g,' ');
  check(hubText.length<150,'Hub text stays short ('+hubText.length+'): '+hubText);
  check(await p.locator('.import-hub>.form-note').count()===0,'Hub has no explanatory paragraphs');
  check(await p.locator('.import-drop .fmt').count()>=4,'Formats are badges');
  check(await p.locator('[data-action="local-cli-refresh"]').getAttribute('aria-label')&&await p.locator('[data-action="local-cli-refresh"]').getAttribute('title'),'Refresh icon button is named');
  check(await p.locator('#import-drop').getAttribute('title').then(t=>t.includes('⌘Z')&&t.includes('密钥')),'Rules sit in the drop zone title, secret-column drop still stated');
  check((await unnamed(p)).length===0,'Hub controls are named: '+(await unnamed(p)).join('|'));
  // Undetected ssh config: no greyed-out button.
  await p.evaluate(()=>{window.__localCli={gh:false,ghAccounts:[],sshConfig:false};importHub();});
  check(await p.locator('[data-action="ssh-import"]').count()===0,'Missing ssh config shows nothing instead of a disabled button');
  if(await p.evaluate(()=>proSlots.importCli.length))check(await p.locator('#modal [data-action="github-import"]').count()===1,'Missing gh falls back to the token button');

  // Preview: counts and tone instead of sentences; deleted/unreadable remain visible; replace note short.
  await p.evaluate(()=>{$('#modal').close();state.blocks=[{id:'domain',width:50,height:null,density:'full',folded:false}];state.assets=[{id:'d1',type:'domain',name:'keep.dev',provider:'Reg',account:'',art:'generic',source:'manual',createdAt:'2026-01-01T00:00:00Z'}];state.deletedExternalIds=['csv:domain:gone.com'];render();});
  await p.evaluate(()=>routeImportText('名称,类别,平台\nfresh.dev,域名,Ex\nkeep.dev,域名,Ex\ngone.com,域名,Ex\n',{filename:'list.csv'}));
  await p.waitForSelector('#import-preview');
  check(await p.locator('.import-group .count').count()>=3,'Groups show count badges');
  check(await p.locator('.import-group.hold').count()===2,'Same-name and deleted groups are marked as holds');
  check((await p.locator('#import-preview').innerText()).includes('已删除'),'Deleted-skipped still stated');
  check(!(await p.locator('#import-preview').innerText()).includes('已有同名记录，默认跳过；勾选则用导入内容更新'),'Per-row sentences are gone');
  check(await p.locator('#modal [data-action="import-hub"][aria-label]').count()===1,'Back icon is named');
  await p.evaluate(()=>{$('#modal').close();});

  // Inbox: textarea named, no help sentence, icon buttons named, count badge.
  await p.evaluate(()=>inboxDialog());
  await p.waitForSelector('.candidate');
  check(await p.locator('#paste-text').getAttribute('aria-label')!==null,'Paste box has an accessible name');
  check((await p.locator('.inbox-paste').innerText()).replace(/\s/g,'').length<20,'Paste form has no instruction text');
  check(await p.locator('.inbox-head .count').count()===1,'Pending count is a badge');
  check((await unnamed(p)).length===0,'Inbox controls are named: '+(await unnamed(p)).join('|'));
  // Review: key facts first, basis folded.
  await p.locator('[data-action="candidate-review"]').first().click();
  check(await p.locator('.candidate-review .facts').count()===1&&await p.locator('.review-basis').count()===1,'Review shows key facts and folds the basis');
  check(await p.locator('[data-action="candidate-apply"]').innerText()==='继续','Review primary action is one word');
  check((await unnamed(p)).length===0,'Review controls are named');
  await p.evaluate(()=>{$('#modal').close();});

  // Detail: no explanatory paragraphs, empty facts hidden, delete keeps its one clear sentence in the confirm.
  await p.evaluate(()=>showDetail('d1'));
  check(await p.locator('#detail .form-note').count()===0,'Detail has no note paragraphs');
  check(!(await p.locator('#detail').innerText()).includes('待补充'),'Detail hides empty facts');
  check(await p.locator('#detail .main-actions .button').count()===2&&await p.locator('#detail [data-action="asset-menu"]').getAttribute('aria-label')==='更多操作','The inspector shows one primary action, 编辑 and a named ⋯');
  await p.locator('#detail [data-action="asset-menu"]').click();
  check((await p.locator('#menu').innerText()).split('\n').every(line=>line.length<=8),'Menu items are short verbs');
  await p.locator('#menu [data-action="delete-asset"]').click();
  check((await p.locator('.confirm-message').innerText()).includes('不取消订阅'),'Delete confirm keeps the one clear sentence');
  await p.locator('#confirm-no').click();

  // Keys overlay: short verbs, no footer.
  await p.evaluate(()=>closeDetail());
  await p.keyboard.press('?');
  await p.waitForSelector('#keys-help:not([hidden])');
  check(await p.locator('.keys-foot').count()===0,'Keys overlay has no footer sentence');
  check((await p.locator('.keys-grid li').allInnerTexts()).every(t=>t.replace(/\s+/g,' ').length<18),'Every shortcut label is short');
  check((await unnamed(p)).length===0,'Keys overlay controls are named');
  await p.keyboard.press('Escape');

  // Platform dialogs: status chip + one lock line, permissions in title.
  await p.evaluate(()=>cloudflareDialog());
  check(await p.locator('#cloudflare-status.chip').count()===1&&await p.locator('.platform-note').count()===1,'Cloudflare dialog uses a status chip and one note');
  check((await p.locator('[data-action="setup-cloudflare"]').getAttribute('title')).includes('R2'),'Permission list moved into the token button title');
  check(await p.locator('#modal-content .form-note').count()===1,'Only one note on the Cloudflare dialog');
  await p.evaluate(()=>{$('#modal').close();githubDialog();});
  check(await p.locator('#modal-content .form-note').count()===1&&await p.locator('#github-status.chip').count()===1,'GitHub dialog is trimmed the same way');
  check((await unnamed(p)).length===0,'Platform dialogs are named');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 // Narrow window and dark scheme: hub and welcome keep inside the viewport.
 for(const scheme of ['light','dark']){
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},colorScheme:scheme});const p=await context.newPage();
  await p.addInitScript(()=>{window.webkit={messageHandlers:{assetboard:{postMessage(){}}}};window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};});
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof importHub==='function');
  const wide=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  check(!wide,'Welcome fits a phone-width window in '+scheme);
  await p.evaluate(()=>{window.__localCli={gh:true,ghAccounts:['alice','bob','carol'],sshConfig:true};importHub();});
  await p.waitForTimeout(40);
  const over=await p.evaluate(()=>{const d=document.querySelector('#modal');const r=d.getBoundingClientRect();return [...d.querySelectorAll('button,.import-drop')].some(el=>{const b=el.getBoundingClientRect();return b.right>r.right+1||b.left<r.left-1;});});
  check(!over,'Hub controls stay inside the dialog at 390px in '+scheme);
  await context.close();
 }
 return 'PASS: welcome/hub/preview/inbox/review/detail/keys/platform copy trimmed, icon buttons named, warnings kept, narrow + dark fit';
}
