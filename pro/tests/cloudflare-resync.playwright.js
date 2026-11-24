// Run with the browser tool's filename option. task-09: a domain bought on Cloudflare after connecting is found by itself when the
// app reports the connection (on launch and on coming back) and the last sync is over 12 hours old, quietly and only once: it waits
// in 待引入 with one quiet line; the Cloudflare dialog says when it last synced and its 重新同步 reads again at once and lists what is
// new to pick; the detail says where to sync. Uses an isolated
// page with a stubbed bridge (no token, no network) and never saves to disk.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(fn,arg,timeout=5000)=>{const end=Date.now()+timeout;for(;;){const v=await p.evaluate(fn,arg);if(v)return v;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext(),p=await context.newPage();
 try {
  await p.addInitScript(()=>{
   const old=new Date(Date.now()-2*86400000).toISOString();
   window.__sent=[];
   window.__answer=[{kind:'zone',id:'z1',name:'kept.example',account:'Acct',status:'active'},{kind:'zone',id:'z2',name:'bought.example',account:'Acct',status:'active'},
    {kind:'registrar',id:'acct:bought.example',name:'bought.example',account:'Acct',status:'active',expiresAt:'2027-10-01T00:00:00Z',autoRenew:true}];
   window.webkit={messageHandlers:{assetboard:{postMessage(msg){
    if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
    if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(msg.action==='cloudflareSync'){window.__sent.push(msg);setTimeout(()=>window.assetboardCloudflareResult({ok:true,connected:true,resources:window.__answer,queriedKinds:['zone','registrar'],warnings:[]}),30);}
   }}}};
   window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'official'},data:{blocks:[{id:'domain',width:50,height:null,density:'full',folded:false}],assets:[
    {id:'cloudflare-zone-z1',type:'domain',name:'kept.example',syncName:'kept.example',provider:'Cloudflare',account:'Acct',source:'cloudflare',resourceKind:'zone',externalId:'z1',syncStatus:'active',syncedAt:old,art:'generic',event:'active'}],deletedExternalIds:[]},
    cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(()=>typeof autoSyncCloudflare==='function'&&typeof state!=='undefined');
  await p.evaluate(()=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();window.assetboardConnectionState({cloudflareConnected:true,cloudflareChecking:false});});
  await until(()=>heldItems(state,'cloudflare').some(a=>a.name==='bought.example'));
  const auto=await p.evaluate(()=>({sent:window.__sent.map(m=>m.token),held:heldItems(state,'cloudflare').filter(a=>a.name==='bought.example').length,date:heldItems(state,'cloudflare').find(a=>a.name==='bought.example').date,landed:state.assets.some(a=>a.name==='bought.example'),modal:document.querySelector('#modal').open,toast:document.querySelector('#toast').textContent}));
  check(auto.sent.length===1&&auto.sent[0]==='','the app syncs once by itself with the kept token: '+JSON.stringify(auto.sent));
  check(auto.held===1&&auto.date==='2027-10-01'&&!auto.landed,'the new domain waits once, with its expiry: '+JSON.stringify(auto));
  check(!auto.modal&&/Cloudflare 有 1 项新资产待引入/.test(auto.toast),'an automatic sync is quiet, a toast only: '+JSON.stringify(auto));
  // Coming back to the front right after: no second request.
  await p.evaluate(()=>window.assetboardConnectionState({notifications:'allowed'}));
  await new Promise(r=>setTimeout(r,150));
  check(await p.evaluate(()=>window.__sent.length)===1,'a fresh sync is not repeated');
  // The dialog: when it last synced, and 重新同步 reads again now.
  await p.evaluate(()=>{window.__answer=[...window.__answer,{kind:'zone',id:'z3',name:'another.example',account:'Acct',status:'pending'}];cloudflareDialog();});
  const dialog=await p.evaluate(()=>({button:document.querySelector('#cloudflare-sync').textContent,note:document.querySelector('.cloudflare-last')?.textContent||''}));
  check(dialog.button==='重新同步'&&/上次同步/.test(dialog.note)&&/重新同步/.test(dialog.note),'the dialog says how to bring in new domains: '+JSON.stringify(dialog));
  await p.locator('#cloudflare-sync').click();
  await until(()=>!!document.querySelector('#connect-pick'));
  check(await p.evaluate(()=>[...document.querySelectorAll('#connect-pick input[name="connect-take"]')].map(i=>i.value).sort().join()==='cloudflare-zone-z2,cloudflare-zone-z3'),'重新同步 reads again and lists both new domains to pick');
  await p.locator('#connect-pick [data-action="connect-import"]').click();
  const manual=await p.evaluate(()=>({sent:window.__sent.length,count:state.assets.length,modal:document.querySelector('#modal').open}));
  check(manual.sent===2&&manual.count===3&&!manual.modal,'picking brings them in and closes: '+JSON.stringify(manual));
  // The detail of a synced domain says where to sync.
  const detail=await p.evaluate(()=>{showDetail('cloudflare-zone-z1');return document.querySelector('#detail-content').textContent;});
  check(/同步 Cloudflare/.test(detail),'the detail names the way to sync: '+detail.slice(0,200));
  return 'ok';
 } finally { await context.close(); }
}
