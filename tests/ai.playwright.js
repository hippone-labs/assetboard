// Run with the browser tool's filename option. Stubs the Swift bridge, so no key, network or disk is used.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const nativeDialogs=[];p.on('dialog',dialog=>{nativeDialogs.push(dialog.type());dialog.dismiss();});
 await p.addInitScript(()=>{
  const ai={provider:'anthropic',baseURL:'https://api.anthropic.com',model:'claude-opus-5-5',autoImages:true,host:'api.anthropic.com'};
  window.__sent=[];window.__aiFail=false;
  window.__rows=[
   {id:'apple-1',kind:'gmail',source:'Apple <no_reply@email.apple.com>',title:'Your receipt from Apple.',body:'Total ¥89.00',importedAt:'2026-09-20T00:00:00Z',payload:JSON.stringify({date:'Sat, 19 Sep 2026 08:00:00 +0000'})},
   {id:'reg-1',kind:'gmail',source:'Registrar <billing@registrar.example>',title:'Renewal reminder',body:'Please renew soon.',importedAt:'2026-09-20T00:00:00Z',payload:JSON.stringify({date:'Sun, 20 Sep 2026 08:00:00 +0000'})}
  ];
  window.__aiReply=message=>message.evidenceId==='apple-1'
   ?'```json\n{"items":[{"name":"iCloud+ 200GB","merchant":"Apple","type":"storage","amount":"21","currency":"CNY","cycle":"monthly","paidDate":"2026-09-19","quote":"iCloud+ 200GB ¥21/月"},{"name":"Apple Music","merchant":"Apple","type":"subscription","amount":"11","currency":"CNY","cycle":"monthly","date":"2099-10-19","dateKind":"renew"}]}\n```'
   :'{"items":[{"name":"example-notes.cn","merchant":"Registrar","type":"domain","amount":"69","currency":"CNY","cycle":"yearly","date":"2099-10-20","dateKind":"expire"}]}';
  const replies={
   save:m=>assetboardSaved(m.sequence,true),
   evidenceList:()=>assetboardEvidenceList(JSON.parse(JSON.stringify(window.__rows))),
   aiRecognize:m=>assetboardAIResult(window.__aiFail?{kind:'recognize',requestId:m.requestId,ok:false,error:'API key 无效或没有权限'}:{kind:'recognize',requestId:m.requestId,ok:true,evidenceId:m.evidenceId||null,ai:{provider:'anthropic',model:'claude-opus-5-5',at:'2026-09-29T00:00:00Z',text:window.__aiReply(m)}}),
   aiSave:m=>assetboardAIResult({kind:'settings',ok:true,ai:{provider:m.provider,baseURL:m.baseURL,model:m.model,autoImages:m.autoImages,host:new URL(m.baseURL).host},aiKeySaved:true})
  };
  window.webkit={messageHandlers:{assetboard:{postMessage(message){window.__sent.push(message);if(replies[message.action])setTimeout(()=>replies[message.action](message),5);}}}};
  window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain',width:50,collapsed:false,height:null}],assets:[{id:'keep',type:'domain',name:'keep.dev',provider:'R',account:'',art:'generic',source:'manual'}]},cloudflareConnected:false,githubConnected:false,gmailConfigured:true,ai,aiKeySaved:true};
 });
 // The receipts and AI replies are dated September 2026; "today" is pinned there so the next charge after a paid date stays put.
 await p.clock.setFixedTime(new Date('2026-09-29T12:00:00'));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>evidenceRows.length===2);
  await p.evaluate(()=>inboxDialog());
  check(await p.locator('[data-action="ai-batch"]').isVisible(),'Inbox offers batch AI recognition when configured');

  // Reviewing a group sends only that email, by id, after an explicit click.
  await p.locator('[data-action="candidate-review"][data-id^="apple.com"]').click();
  check((await p.locator('.ai-panel').innerText()).includes('api.anthropic.com'),'Review says where the data goes');
  check(!(await p.evaluate(()=>__sent.some(m=>m.action==='aiRecognize'))),'Nothing is sent before the person asks');
  await p.locator('[data-action="ai-recognize"]').click();
  await p.waitForSelector('.ai-item');
  const request=await p.evaluate(()=>__sent.find(m=>m.action==='aiRecognize'));
  check(request.evidenceId==='apple-1'&&!request.text&&!('apiKey' in request),'The page sends an evidence id, never content or keys');
  check(await p.locator('.ai-item').count()===2,'Both items from one receipt are offered');
  check((await p.locator('.candidate-review .facts').innerText()).includes('iCloud+ 200GB'),'First AI item is shown by default');
  check((await p.locator('.candidate-review .facts').innerText()).includes('2026-10-19'),'Paid date plus monthly cycle gives the next charge');

  // Record the second item, then the review returns for the remaining one.
  await p.locator('.ai-item input[value="1"]').check();
  check((await p.locator('.candidate-review .facts').innerText()).includes('Apple Music'),'Choosing an item updates the facts');
  await p.locator('[data-action="candidate-apply"]').click();
  check(await p.locator('#asset-form [name="name"]').inputValue()==='Apple Music','Form uses the chosen item');
  check(await p.locator('#asset-form [name="dateKind"]').inputValue()==='renew'&&await p.locator('#asset-form [name="cycle"]').inputValue()==='monthly','Form carries date kind and cycle');
  check((await p.locator('#asset-form [name="notes"]').inputValue()).includes('AI 识别（claude-opus-5-5）'),'Notes record that AI was used');
  await p.locator('#asset-form [type="submit"]').click();
  check(await p.locator('.ai-item').count()===2&&(await p.locator('.ai-item input:checked').getAttribute('value'))==='0','Review reopens on the unrecorded item');
  check((await p.locator('.ai-item').nth(1).innerText()).includes('已记录'),'Recorded item is marked');
  await p.locator('[data-action="candidate-apply"]').click();
  await p.locator('#asset-form [type="submit"]').click();
  const decisions=await p.evaluate(()=>state.evidenceDecisions['apple-1']);
  check(decisions.status==='created'&&decisions.recorded.sort().join()==='0,1','Both items are recorded against the email');
  check(await p.evaluate(()=>['iCloud+ 200GB','Apple Music'].every(name=>state.assets.some(a=>a.name===name))),'Two assets were created');
  check(await p.evaluate(()=>state.assets.find(a=>a.name==='iCloud+ 200GB').type==='storage'),'AI category is used');

  // Batch asks first, counts only groups without an AI reading, and marks results.
  await p.evaluate(()=>inboxDialog(false));
  await p.locator('[data-action="ai-batch"]').click();
  check((await p.locator('.confirm-message').innerText()).includes('1 组'),'Batch confirmation states the count');
  await p.locator('#confirm-yes').click();
  await until(p,()=>!aiBatchState&&candidates().every(c=>c.ai));
  check(await p.evaluate(()=>__sent.filter(m=>m.action==='aiRecognize').map(m=>m.evidenceId).join())==='apple-1,reg-1','Batch sent the remaining group once');
  check(await p.evaluate(()=>candidates().find(c=>c.ai?.rowId==='reg-1').name==='example-notes.cn'),'Batch result updates the candidate');

  // Failures stay visible in the review and do not change data.
  await p.evaluate(()=>{window.__aiFail=true;inboxDialog(false);});
  await p.locator('#paste-text').fill('Your plan renews soon.');
  await p.locator('#paste-form button[type="submit"]').click();
  await p.locator('[data-action="ai-recognize"]').click();
  await p.waitForSelector('.ai-error');
  check((await p.locator('.ai-error').innerText()).includes('API key 无效'),'AI errors are shown in place');
  check(await p.evaluate(()=>__sent.filter(m=>m.action==='aiRecognize').at(-1).text==='Your plan renews soon.'),'Pasted text is sent only when asked');

  // Settings: switching provider replaces untouched defaults, and the key field is cleared after sending.
  await p.evaluate(()=>aiDialog());
  await p.locator('#ai-form [name="provider"]').selectOption('openai');
  check(await p.locator('#ai-form [name="baseURL"]').inputValue()===''&&await p.locator('#ai-form [name="model"]').inputValue()==='','Provider defaults are swapped');
  await p.locator('#ai-form [name="baseURL"]').fill('http://127.0.0.1:11434/v1');
  await p.locator('#ai-form [name="model"]').fill('qwen2.5vl:7b');
  await p.locator('#ai-form [name="apiKey"]').fill('secret-key');
  await p.locator('#ai-form [type="submit"]').click();
  const saved=await p.evaluate(()=>__sent.find(m=>m.action==='aiSave'));
  check(saved.apiKey==='secret-key'&&saved.provider==='openai','Settings go to the host for verification');
  await until(p,()=>nativeStore.ai.model==='qwen2.5vl:7b');
  check(await p.evaluate(()=>!JSON.stringify(state).includes('secret-key')),'The key never enters board state');

  // Without a configured model the review only offers setup.
  await p.evaluate(()=>{nativeStore.ai=null;nativeStore.aiKeySaved=false;inboxDialog(false);});
  await p.locator('[data-action="candidate-review"]').first().click();
  check(await p.locator('.ai-note [data-action="ai-settings"]').isVisible()&&await p.locator('[data-action="ai-recognize"]').count()===0,'Unconfigured review offers setup only');
  check(nativeDialogs.length===0,'No native dialogs');
  return 'PASS: explicit AI request by evidence id, multi-item review and recording, batch with confirmation, errors, settings and key handling, unconfigured state';
 } finally { await p.close(); }
}
