// Run with the browser tool's filename option. The import gate on the page: password manager exports and secret files are refused
// with one line and nothing is read, written or sent to the AI; secret rows and columns force the preview and stay out; quoted
// multi-line cells make one record; only pasted text and mail go to the AI on their own; the agent add tool refuses keys.
// Fake bridge, made-up data (example.* names, test card numbers, fake keys).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  window.__sent=[];
  const replies={save:m=>assetboardSaved(m.sequence,true),evidenceList:()=>assetboardEvidenceList([]),aiRecognize:m=>assetboardAIResult({kind:'recognize',requestId:m.requestId,ok:false,error:'stub'})};
  window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);if(replies[m.action])setTimeout(()=>replies[m.action](m),5);}}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:{blocks:[{id:'domain'}],assets:[]},cloudflareConnected:false,githubConnected:false,ai:{provider:'anthropic',baseURL:'https://api.anthropic.com',model:'claude-opus-5-5',autoImages:true,host:'api.anthropic.com'},aiKeySaved:true};
 });
 // Built at run time, so a scan of the tree for key and token prefixes stays clean.
 const FAKE_TOKEN='gh'+'p_'+'FAKE'.repeat(7);
 const KEY=['-----','BEGIN OPENSSH PRIVATE KEY-----\nFAKEFAKEFAKEFAKE\n-----END OPENSSH PRIVATE KEY-----'].join('');
 const reset=()=>p.evaluate(()=>{$('#modal').open&&$('#modal').close();hideToast?.();state={blocks:[{id:'domain'}],assets:[],deletedExternalIds:[]};history=[];future=[];pasteRow=null;render();window.__sent=[];});
 const sent=action=>p.evaluate(action=>__sent.filter(m=>m.action===action).length,action);
 const toastText=()=>p.evaluate(()=>$('#toast').classList.contains('show')?$('#toast').textContent:'');
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof importGate==='function'&&typeof routeImportText==='function'&&!!state);

  // Password manager exports: one line, no records, no review, no AI, no save.
  for(const [name,text] of [
   ['bitwarden_export.csv','folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,Example,"Backup codes:\nFAKE1, FAKE2, FAKE3, FAKE4",,0,https://example.com,me@example.com,FakePw1,JBSWY3DPEHPK3PXP\n'],
   ['Passwords.csv','Title,URL,Username,Password,Notes,OTPAuth\nExample,https://example.com/,me@example.com,FakePw1,"Some notes\nMore notes on new line",otpauth://totp/test?secret=examplesecret\n'],
   ['Chrome Passwords.csv','name,url,username,password,note\r\nexample.com,https://example.com/,me@example.com,FakePw1,"First line\r\nSecond line"\r\n']
  ]){
   await reset();
   await p.evaluate(([text,name])=>routeImportText(text,{filename:name}),[text,name]);
   check((await toastText()).includes('这是密码管理器导出，没有读入，用完请删掉这个文件'),`${name}: the refusal line is shown: ${await toastText()}`);
   check(await p.evaluate(()=>state.assets.length===0&&!pasteRow&&!$('#modal').open),`${name}: nothing is read`);
   check(await sent('save')===0&&await sent('aiRecognize')===0,`${name}: nothing saved or sent`);
  }
  // The same export dropped as a file, and pasted with ⌘V.
  await reset();
  await p.evaluate(()=>handleImportFiles([new File(['Title,URL,Username,Password,Notes,OTPAuth\nExample,https://example.com/,me,FakePw1,,\n'],'Passwords.csv',{type:'text/csv'})]));
  await until(p,()=>$('#toast').textContent.includes('密码管理器导出'));
  check(await p.evaluate(()=>state.assets.length===0&&!intake.length),'A dropped export leaves nothing queued or written');

  // Secret files and spreadsheets are not even read.
  await reset();
  await p.evaluate(()=>{window.__read=[];const file=(text,name,type='')=>{const f=new File([text],name,{type});f.text=()=>{__read.push(name);return Promise.resolve(text);};return f;};
   return handleImportFiles([file('API_KEY=FAKE\nDEBUG=1','.env'),file('FAKE','id_ed25519'),file('PK\u0003\u0004','bills.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')]);});
  check(await p.evaluate(()=>__read.length===0),'.env, a private key and .xlsx are not read: '+await p.evaluate(()=>__read.join()));
  const refusal=await toastText();
  check(refusal.includes('.env 是密钥文件')&&refusal.includes('id_ed25519 是密钥文件')&&refusal.includes('bills.xlsx：不支持这种文件'),'Each refused file is named: '+refusal);
  check(await sent('aiRecognize')===0&&await p.evaluate(()=>!pasteRow),'Nothing reaches a review card or the AI');

  // Pasted text holding a key or .env lines is refused before review or AI; a card number is masked.
  for(const text of [KEY,'DATABASE_URL=postgres://db.example.com/app\nAPI_KEY=FAKE\nDEBUG=1','2FA otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP']){
   await reset();
   await p.evaluate(text=>routeImportText(text),text);
   check((await toastText()).includes('这段文字里有'),'Refused paste says why: '+await toastText());
   check(await p.evaluate(()=>!pasteRow)&&await sent('aiRecognize')===0,'Refused paste is not reviewed or sent');
  }
  await reset();
  await p.evaluate(()=>routeImportText('Example Notes Pro renews on 2099-10-06 for $15.00/month, card 4111 1111 1111 1111'));
  check(await p.evaluate(()=>pasteRow&&!pasteRow.body.includes('4111 1111')&&pasteRow.body.includes('•••• 1111')),'Pasted card number is masked to its last 4 digits');
  await until(p,()=>__sent.some(m=>m.action==='aiRecognize'));
  check(await p.evaluate(()=>!__sent.find(m=>m.action==='aiRecognize').text.includes('4111 1111')),'The AI gets the masked text');

  // Only pasted text and mail go to the AI on their own: a dropped text file is reviewed and waits for a click.
  await reset();
  await p.evaluate(()=>handleImportFiles([new File(['Example Notes Pro renews on 2099-10-06 for $15.00/month'],'notes.txt',{type:'text/plain'})]));
  await until(p,()=>!!pasteRow);
  await p.waitForTimeout(100);
  check(await sent('aiRecognize')===0,'A dropped .txt is not sent to the AI on its own');
  await reset();
  await p.evaluate(()=>handleImportFiles([new File(['From: Example <billing@example.com>\nSubject: Receipt\nContent-Type: text/plain\n\nExample Notes Pro $15.00/month'],'receipt.eml',{type:'message/rfc822'})]));
  await until(p,()=>__sent.some(m=>m.action==='aiRecognize'));

  // A secret column, with no conflict, stops at the preview instead of being written.
  await reset();
  await p.evaluate(()=>routeImportText('名称,类别,Password\nalpha.example.com,域名,FakePw1\n'));
  check(await p.locator('#modal[data-view="import-preview"]').count()===1,'A dropped secret column forces the preview');
  check((await p.locator('#import-preview').textContent()).includes('Password'),'The preview names the dropped column');
  check(await sent('save')===0,'Nothing is written before Import');
  await p.locator('[data-action="import-apply"]').click();
  check(await p.evaluate(()=>state.assets.length===1&&!JSON.stringify(state).includes('FakePw1')),'Import writes the row without the secret');

  // Rows with a card number or a key are refused and listed; the rest imports; quoted multi-line notes stay one record.
  await reset();
  await p.evaluate(key=>routeImportText(`名称,类别,备注\nok.example.com,域名,"first line\nsecond line, with commas, and, more"\nMy Card,银行卡,card 4111 1111 1111 1111\nbox-1,服务器,"${key}"\n`,{filename:'list.csv'}),KEY);
  check(await p.locator('#modal[data-view="import-preview"]').count()===1,'Refused rows force the preview');
  const preview=await p.locator('#import-preview').textContent();
  check(preview.includes('已拒收')&&preview.includes('完整卡号')&&preview.includes('私钥')&&preview.includes('第 4 行')&&preview.includes('第 5 行'),'The preview lists refused rows by line and reason: '+preview);
  check(!preview.includes('4111')&&!preview.includes('second line,'),'Neither the secret nor a broken-off note line shows up');
  await p.locator('[data-action="import-apply"]').click();
  const written=await p.evaluate(()=>state.assets.map(a=>[a.name,a.notes]));
  check(written.length===1&&written[0][0]==='ok.example.com'&&written[0][1]==='first line\nsecond line, with commas, and, more','Only the clean row is written, with its whole note: '+JSON.stringify(written));

  // A board backup restores no record holding a card number.
  await reset();
  await p.evaluate(()=>routeImportText(JSON.stringify({blocks:[{id:'domain'}],assets:[{id:'b1',type:'domain',name:'fine.example.com'},{id:'b2',type:'domain',name:'card.example.com',notes:'4111111111111111'}]}),{filename:'Assetboard-backup.json'}));
  check(await p.locator('#modal[data-view="import-preview"]').count()===1&&(await p.locator('#import-preview').textContent()).includes('card.example.com'),'The backup preview names the refused record');
  await p.locator('[data-action="import-apply"]').click();
  check(await p.evaluate(()=>state.assets.map(a=>a.name).join()==='fine.example.com'),'Only the clean record is restored');

  // The MCP and CLI add tool refuses keys, tokens and TOTP secrets like card numbers.
  await reset();
  const add=items=>p.evaluate(items=>assetboardAgent({requestId:'g',method:'add',params:{items}}),items);
  const reply=(await add([{name:'box-1',type:'server',notes:KEY},{name:'ci',notes:FAKE_TOKEN},{name:'pay',notes:'4111 1111 1111 1111'},{name:'mail',notes:'otpauth://totp/x?secret=A'},{name:'fine.example.com'}])).result;
  check(reply.added.length===1&&reply.added[0].name==='fine.example.com','Only the clean asset is added: '+JSON.stringify(reply));
  check(reply.errors.length===4&&reply.errors[2].error.includes('完整卡号')&&reply.errors[0].error.includes('私钥'),'Each refusal says why: '+JSON.stringify(reply.errors));
  const update=await p.evaluate(([id,notes])=>assetboardAgent({requestId:'u',method:'update',params:{id,fields:{notes}}}),[reply.added[0].id,KEY]);
  check(update.ok===false&&update.error.includes('私钥'),'An update refuses a key too: '+JSON.stringify(update));

  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: password manager exports and secret files refused unread, secret paste refused, card masked, AI only for paste and mail, secret rows and columns force the preview, multi-line notes, backup and agent add screened';
}
