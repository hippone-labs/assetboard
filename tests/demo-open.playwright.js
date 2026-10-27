// Demo mode (the Mac app's --demo): a file opened from the Dock or 打开方式 still stops at the import preview; confirming it writes
// to the demo board only, and nothing is saved. Inbox files and the Services menu are still ignored there.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=5000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext(),p=await context.newPage();
 try {
  await p.addInitScript(()=>{
   window.__messages=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__messages.push(m.action);if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
   window.__ASSETBOARD_NATIVE__={demo:true,data:null,cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof demoMode!=='undefined'&&demoMode&&state.assets.length>0);
  const before=await p.evaluate(()=>state.assets.length);
  await p.evaluate(()=>{$('#modal').open&&$('#modal').close();window.assetboardIntake([
   {source:'inbox',name:'a.json',text:JSON.stringify({assetboard:1,items:[{name:'inbox-only.dev',type:'domain'}]})},
   {source:'service',name:'选中的文字',text:'Renews 2099-01-01'},
   {source:'open',name:'servers-backup-2026-10-22.json',text:JSON.stringify([{id:'0f1e2d3c-4b5a-4968-8776-655443322110',name:'demo-opened',server_group:'Default',region:'JP',tags:'',note:'',price:'5.00',billing_cycle:'month',auto_renewal:'1',currency:'$',expire_date:'2027-01-01',traffic_limit:''}])}
  ]);});
  const preview=await until(p,()=>document.querySelector('#import-preview')?.textContent);
  check(preview.includes('demo-opened')&&preview.includes('CF-Server-Monitor'),'the opened file did not reach the preview: '+preview);
  check(await p.evaluate(()=>state.assets.length)===before,'the demo wrote before the preview was confirmed');
  await p.click('[data-action="import-apply"]');
  check(await until(p,()=>state.assets.some(a=>a.name==='demo-opened')),'confirming did not add to the demo board');
  const after=await p.evaluate(()=>({names:state.assets.map(a=>a.name),messages:window.__messages,capture:!!document.querySelector('#capture')?.open}));
  check(!after.names.includes('inbox-only.dev'),'the demo took an Inbox file');
  check(!after.messages.includes('save'),'the demo asked to save: '+after.messages.join());
  check(!after.capture,'the demo opened the Services text');
 } finally { await context.close(); }
 return 'ok';
}
