// Run with the browser tool's filename option. The add panel, chip/date/cost form controls and Inbox files; the Swift bridge is stubbed, so no key, network or disk is used.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const open=async({ai=false}={})=>{
  const context=await page.context().browser().newContext({viewport:{width:1280,height:1000}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({ai})=>{
   if(!ai)return;
   window.__sent=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>assetboardSaved(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>assetboardEvidenceList([]),5);
    if(m.action==='aiRecognize')setTimeout(()=>assetboardAIResult({kind:'recognize',requestId:m.requestId,ok:true,evidenceId:null,ai:{provider:'anthropic',model:'m',at:'2026-10-20T00:00:00Z',text:'{"items":[{"name":"Notion Plus","merchant":"Notion","type":"subscription","amount":"10","currency":"USD","cycle":"monthly","date":"2099-11-01","dateKind":"renew"}]}'}}),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false,ai:{provider:'anthropic',baseURL:'https://api.anthropic.com',model:'m',autoImages:true,host:'api.anthropic.com'},aiKeySaved:true};
  },{ai});
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof captureDialog==='function');
  if(!ai)await p.evaluate(()=>{localStorage.clear();state={blocks:[],assets:[],deletedExternalIds:[]};save=()=>{};render();});
  return {p,context,errors};
 };

 // Without a model: one typed line fills the form by rules; nothing leaves the page.
 let {p,context,errors}=await open();
 try {
  const val=n=>p.locator(`#asset-form [name="${n}"]`).inputValue();
  await p.evaluate(()=>addAsset());
  check(await p.locator('#modal[data-view="capture"]').count()===1,'Add opens the capture panel in the overview');
  check((await p.locator('.capture-note').innerText()).includes('不上传'),'The panel says nothing is uploaded');
  await p.fill('#capture-text','example.com namecheap 2027-03-01 $11/年');await p.press('#capture-text','Enter');await p.waitForSelector('#asset-form');
  check(await val('name')==='example.com'&&await val('type')==='domain'&&await val('provider')==='namecheap'&&await val('date')==='2027-03-01','Name, type, provider and date come from the line');
  check(await val('amount')==='11'&&await val('currency')==='USD'&&await val('cycle')==='yearly','Amount, currency and cycle come from the line');
  check(await p.locator('#asset-form select').count()===0,'The form has no dropdowns');
  await p.click('#asset-form [type="submit"]');await p.waitForTimeout(200);
  const saved=await p.evaluate(()=>state.assets[0]);
  check(saved.type==='domain'&&saved.cost==='$11 / 年'&&saved.date==='2027-03-01'&&saved.cycle==='yearly','Saved as typed: '+JSON.stringify(saved));

  // Type follows the name until it is picked by hand; dates and costs are typed or one click.
  await p.evaluate(()=>assetForm('subscription'));
  await p.fill('#asset-form [name="name"]','github.com/me/repo');
  check(await val('type')==='repository','The category follows the name');
  check(await p.locator('[data-choice="type"][data-value="license"]').isHidden(),'The category list starts folded to the chosen one');
  await p.click('#asset-form [data-unfold]');await p.click('[data-choice="type"][data-value="license"]');
  check(await p.locator('[data-choice="type"][data-value="repository"]').isHidden(),'Picking a category folds the list again');await p.fill('#asset-form [name="name"]','foo.com');
  check(await val('type')==='license','A hand-picked category is kept');
  await p.fill('#asset-form [name="date"]','99');await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>!document.querySelector('#asset-form [name="date"]').validity.valid),'A date that cannot be read blocks saving');
  await p.fill('#asset-form [name="date"]','');await p.click('.quick[data-add-months="12"]');
  check(/^\d{4}-\d{2}-\d{2}$/.test(await val('date')),'+1 年 fills a date');
  await p.fill('#asset-form [name="date"]','3/1');await p.locator('#asset-form [name="date"]').blur();
  check(/^\d{4}-03-01$/.test(await val('date')),'3/1 becomes a full date');
  await p.fill('#asset-form [name="amount"]','abc');await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>!document.querySelector('#asset-form [name="amount"]').validity.valid),'A non-numeric amount blocks saving');
  await p.fill('#asset-form [name="amount"]','89');await p.click('[data-choice="currency"][data-value="CNY"]');await p.click('[data-choice="cycle"][data-value="monthly"]');
  await p.click('#asset-form [type="submit"]');await p.waitForTimeout(200);
  check(await p.evaluate(()=>{const a=state.assets.find(x=>x.name==='foo.com');return a.type==='license'&&a.cost==='¥89 / 月';}),'Amount, currency and cycle make the cost text');

  // A free-text cost from before is kept, not rewritten.
  await p.evaluate(()=>{state.assets.push({id:'old',type:'domain',name:'old.dev',provider:'R',cost:'约 100 元左右',source:'manual',art:'generic'});render();assetForm('domain','old');});
  await p.click('#asset-form [type="submit"]');await p.waitForTimeout(200);
  check(await p.evaluate(()=>state.assets.find(x=>x.id==='old').cost)==='约 100 元左右','Free-text cost survives an edit');

  // Region by name, network chip toggles.
  await p.evaluate(()=>assetForm('bankcard'));
  await p.fill('#asset-form [name="name"]','汇丰 One');await p.fill('#asset-form [name="regionText"]','中国香港');
  check(await val('region')==='HK','A region typed by name resolves to its code');
  await p.click('[data-choice="network"][data-value="Visa"]');check(await val('network')==='Visa','Network chip selects');
  await p.click('[data-choice="network"][data-value="Visa"]');check(await val('network')==='','Clicking it again clears');
  await p.fill('#asset-form [name="regionText"]','不存在');await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>!document.querySelector('#asset-form [name="regionText"]').validity.valid),'An unknown region blocks saving');

  // Everything from outside the window goes through one queue. An Inbox file stops at the preview.
  const agent=(name)=>JSON.stringify({assetboard:1,items:[{name,type:'domain',date:'2027-01-01'},{type:'domain'}]});
  const count=()=>p.evaluate(()=>state.assets.length),queued=()=>p.evaluate(()=>intake.length),view=()=>p.evaluate(()=>$('#modal').open?$('#modal').dataset.view:'');
  const before=await count();
  await p.evaluate(a=>{$('#modal').close();window.assetboardIntake([{source:'inbox',name:'a.json',text:a},{source:'inbox',name:'bad.json',text:'nope'},{source:'inbox',name:'big.json',error:'文件超过 1 MB'}]);},agent('agent.dev'));
  check(await view()==='import-preview','An Inbox file opens the import preview');
  check(await count()===before,'Nothing is written before confirming');
  check((await p.locator('#import-preview').textContent()).includes('agent.dev'),'The preview lists the item');
  check(await queued()===1,'Only the readable file is queued: '+await queued());

  // Cancelling keeps it; it can be opened again from 待确认 and leaves the queue once imported.
  await p.evaluate(()=>$('#modal').close());
  check(await queued()===1&&(await p.locator('#inbox-button').getAttribute('aria-label')).includes('1'),'A cancelled preview stays queued and counted');
  await p.evaluate(()=>inboxDialog(false));
  check((await p.locator('.inbox').innerText()).includes('a.json'),'待确认 lists the queued file');
  await p.click('[data-action="intake-open"]');
  check(await view()==='import-preview','It opens again');
  await p.click('[data-action="import-apply"]');
  check(await p.evaluate(()=>state.assets.some(a=>a.name==='agent.dev'))&&await queued()===0,'Imported, and gone from the queue');

  // An unsaved form is never replaced: what arrives waits.
  await p.evaluate(()=>assetForm('domain'));await p.fill('#asset-form [name="name"]','typing.dev');
  await p.evaluate(a=>window.assetboardIntake([{source:'inbox',name:'b.json',text:a},{source:'service',name:'选中的文字',text:'Renews 2099-01-01'}]),agent('later.dev'));
  check(await p.locator('#asset-form [name="name"]').inputValue()==='typing.dev','The form being typed in stays');
  check(await queued()===2&&(await p.locator('#toast').innerText()).includes('待确认'),'Both wait, and a toast says where');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();inboxDialog(false);});
  await p.click('[data-action="intake-discard"]');
  check(await queued()===1&&!(await p.evaluate(()=>state.assets.some(a=>a.name==='later.dev'))),'Discarding drops it without writing');
  await p.click('[data-action="intake-open"]');
  check(await view()==='capture'&&await p.inputValue('#capture-text')==='Renews 2099-01-01'&&await queued()===0,'Services text fills the add panel when opened');

  // Several files from the Dock: each is previewed in turn; the next opens after the first is imported.
  await p.evaluate(()=>{$('#modal').close();window.assetboardIntake([{source:'open',name:'x.csv',text:'名称,类别\nopened.com,域名\n'},{source:'open',name:'y.csv',text:'名称,类别\nsecond.com,域名\n'}]);});
  check(await view()==='import-preview'&&await queued()===2,'The first Dock file is previewed, the second waits');
  await p.click('[data-action="import-apply"]');
  check(await view()==='import-preview'&&(await p.locator('#import-preview').textContent()).includes('second.com'),'The second opens next');
  await p.click('[data-action="import-apply"]');
  check(await p.evaluate(()=>['opened.com','second.com'].every(n=>state.assets.some(a=>a.name===n)))&&await queued()===0,'Both are imported');

  // In the window: several tables are all read, and the agent format is understood there too.
  await p.evaluate(()=>handleImportFiles([new File(['名称,类别\nw1.com,域名\n'],'w1.csv'),new File(['名称,类别\nw2.com,域名\n'],'w2.csv')]));
  await until(p,()=>['w1.com','w2.com'].every(n=>state.assets.some(a=>a.name===n)),null,{timeout:5000});
  await p.evaluate(a=>handleImportFiles([new File([a],'from-agent.json')]),agent('dropped.dev'));
  await p.waitForSelector('#modal[data-view="import-preview"]');
  check((await p.locator('#import-preview').textContent()).includes('dropped.dev'),'Agent JSON dropped in the window opens its preview, not a backup error');
  await p.evaluate(()=>$('#modal').close());
  check(await queued()===1,'It stays queued after closing');
  await p.evaluate(()=>{intake=[];syncToolbar();});
  check(errors.length===0,'No page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 // With a model: the text is sent only on the click, and the answer goes to the review.
 ({p,context,errors}=await open({ai:true}));
 try {
  await p.evaluate(()=>addAsset());
  await p.evaluate(()=>window.assetboardIntake([{source:'service',name:'选中的文字',text:'Notion Plus $10 monthly'}]));
  check(await p.inputValue('#capture-text')==='Notion Plus $10 monthly','Services text fills the empty add panel');
  check(!(await p.evaluate(()=>__sent.some(m=>m.action==='aiRecognize'))),'Text from the Services menu is not sent to the model by itself');

  // A line the rules read in full stays on this Mac even with a model set up.
  await p.fill('#capture-text','example.com namecheap 2027-03-01 $11/年');await p.press('#capture-text','Enter');
  await p.waitForSelector('#asset-form');
  check(await p.locator('#asset-form [name="name"]').inputValue()==='example.com'&&!(await p.evaluate(()=>__sent.some(m=>m.action==='aiRecognize'))),'A domain line is read locally, not sent');

  // An Inbox file leaves its folder only once imported or discarded.
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();window.assetboardIntake([{source:'inbox',name:'c.json',text:JSON.stringify({assetboard:1,items:[{name:'acked.dev',type:'domain'}]})},{source:'inbox',name:'d.json',text:JSON.stringify({assetboard:1,items:[{name:'tossed.dev',type:'domain'}]})}]);});
  check(!(await p.evaluate(()=>__sent.some(m=>m.action==='intakeDone'))),'Nothing is moved while the preview is open');
  await p.click('[data-action="import-apply"]');
  await p.evaluate(()=>$('#modal').close());
  await p.evaluate(()=>{inboxDialog(false);});await p.click('[data-action="intake-discard"]');
  check(JSON.stringify(await p.evaluate(()=>__sent.filter(m=>m.action==='intakeDone').map(m=>m.name)))==='["c.json","d.json"]','Imported and discarded files are reported back by name');
  await p.evaluate(()=>$('#modal').close());

  // A recognised screenshot does not replace a form being typed in.
  await p.evaluate(()=>assetForm('domain'));await p.fill('#asset-form [name="name"]','still-here.dev');
  await p.evaluate(()=>assetboardOCRResult({ok:true,id:'ocr-x',title:'shot.png'}));
  await until(p,()=>document.querySelector('#toast').innerText.includes('shot.png'),null,{timeout:3000});
  check(await p.locator('#asset-form [name="name"]').inputValue()==='still-here.dev','The form stays while the screenshot waits in 待确认');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});

  await p.evaluate(()=>addAsset());
  await p.evaluate(()=>addAsset());
  check((await p.locator('.capture-note').innerText()).includes('api.anthropic.com'),'The panel says where the text goes');
  await p.fill('#capture-text','Notion Plus $10 monthly, renews 2099-11-01');
  check(!(await p.evaluate(()=>__sent.some(m=>m.action==='aiRecognize'))),'Typing sends nothing');
  await p.press('#capture-text','Enter');
  await p.waitForSelector('.candidate-review');
  const request=await p.evaluate(()=>__sent.find(m=>m.action==='aiRecognize'));
  check(request.text.includes('Notion Plus')&&!('apiKey' in request),'The text is sent once, never a key');
  check((await p.locator('.candidate-review .facts').innerText()).includes('Notion Plus'),'The review shows the model\'s reading');
  await p.locator('[data-action="candidate-apply"]').click();
  check(await p.locator('#asset-form [name="name"]').inputValue()==='Notion Plus'&&await p.locator('#asset-form [name="amount"]').inputValue()==='10','The form is filled from it');
  check(errors.length===0,'No page errors: '+errors.join(' | '));
 } finally { await context.close(); }
}
