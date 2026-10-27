// Run with the browser tool's filename option. Icons without asking: a new record of a known platform gets its site icon (reused when one is on this Mac, fetched once per host otherwise, not retried after a failure), the switch turns it off, 获取图标 in the inspector fetches one on request (including from a service's own management link), and the sidebar opens 获取网站图标.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{
   const png=color=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,32,32);return c.toDataURL('image/png');};
   window.__fetched=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){
    if(m.action==='save')setTimeout(()=>assetboardSaved(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>assetboardEvidenceList([]),5);
    if(m.action==='iconFetch'){window.__fetched.push(m.host);setTimeout(()=>assetboardIconResult(m.host==='down.example'||m.host==='revolut.com'?{requestId:m.requestId,ok:false,error:'无法连接'}:{requestId:m.requestId,ok:true,host:m.host,dataUrl:png(m.host==='wise.com'?'#9c3':'#36c')}),20);}
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[
    {id:'gh',type:'repository',name:'me/app',provider:'GitHub',source:'manual',art:'generic',siteIcon:png('#111'),siteIconHost:'github.com'},
    {id:'old',type:'subscription',name:'Old Wise thing',provider:'Wise',source:'manual',art:'generic'}
   ]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false,ai:null,aiKeySaved:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof autoIcons==='function'&&document.querySelector('#board [data-asset]'));
  const add=items=>p.evaluate(items=>{state.assets.push(...items.map(x=>({source:'manual',art:'generic',...x})));save();render();},items);

  // Records already on the board are left alone; a new one of a known platform is fetched, once per host.
  await add([{id:'w1',type:'bankcard',name:'Wise 卡',provider:'Wise'},{id:'w2',type:'subscription',name:'Wise 会员',provider:'Wise'}]);
  await until(p,()=>['w1','w2'].every(id=>state.assets.find(a=>a.id===id).siteIcon));
  check(await p.evaluate(()=>__fetched.join()==='wise.com'),'One request for the shared host: '+await p.evaluate(()=>__fetched.join()));
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='old').siteIcon),'Records from before are not fetched');
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='w1').siteIconHost==='wise.com'&&!!document.querySelector('#board [data-asset="w1"] .tile img')),'The icon is stored and shown');

  // An icon already on this Mac is reused without a request; unknown platforms are not contacted.
  await add([{id:'g2',type:'repository',name:'me/other',provider:'GitHub'},{id:'x',type:'subscription',name:'小众服务',provider:'某公司',url:'https://tool.example'}]);
  await until(p,()=>state.assets.find(a=>a.id==='g2').siteIcon);
  await p.waitForTimeout(100);
  check(await p.evaluate(()=>__fetched.join()==='wise.com'&&!state.assets.find(a=>a.id==='x').siteIcon),'Reused icon, no request for an unknown host: '+await p.evaluate(()=>__fetched.join()));

  // A failed host is not asked again in this launch.
  await add([{id:'r1',type:'bankcard',name:'Revolut',provider:'Revolut'}]);
  await until(p,()=>__fetched.includes('revolut.com'));await p.waitForTimeout(80);
  await add([{id:'r2',type:'subscription',name:'Revolut Metal',provider:'Revolut'}]);await p.waitForTimeout(100);
  check(await p.evaluate(()=>__fetched.filter(h=>h==='revolut.com').length===1),'A failed host is tried once');

  // The batch lists a service's own link host; the switch in 设置 turns automatic fetching off and is saved with the board.
  await p.click('#sidebar [data-action="icon-batch"]');
  check(await p.evaluate(()=>$('#modal-title').textContent==='获取网站图标'),'The sidebar opens the dialog');
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal .icon-batch-hosts strong')].some(s=>s.textContent==='tool.example')),'The batch lists a service\'s own management link host');
  await p.evaluate(()=>$('#modal').close());
  await p.click('#sidebar [data-action="prefs"]');await p.click('#modal [data-action="prefs-section"][data-id="features"]');
  check(await p.locator('#modal input[data-action="auto-icons"]').isChecked(),'Auto is on by default');
  await p.click('#modal input[data-action="auto-icons"]');
  check(await p.evaluate(()=>state.autoIcons===false),'Off is stored');
  await p.evaluate(()=>$('#modal').close());
  await add([{id:'c1',type:'ai',name:'ChatGPT Plus',provider:'OpenAI'}]);await p.waitForTimeout(100);
  check(await p.evaluate(()=>!__fetched.includes('chatgpt.com')&&!state.assets.find(a=>a.id==='c1').siteIcon),'Nothing is fetched while off');

  // 获取图标 in the inspector: on request, from the management link for an unknown service; undoable; failure says so.
  await p.evaluate(()=>showDetail('x'));
  check(await p.evaluate(()=>/tool\.example/.test(document.querySelector('#detail [data-action="icon-fetch"]').title)),'The button names the site');
  await p.click('#detail [data-action="icon-fetch"]');
  await until(p,()=>state.assets.find(a=>a.id==='x').siteIcon);
  check(await p.evaluate(()=>!document.querySelector('#detail [data-action="icon-fetch"]')&&/已配上图标/.test($('#toast').textContent)),'The icon lands, the button goes away');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='x').siteIcon),'A requested icon can be undone');
  await p.evaluate(()=>{state.assets.push({id:'bad',type:'ai',name:'Down',provider:'某家',url:'https://down.example',source:'manual',art:'generic'});save();render();showDetail('bad');});
  await p.click('#detail [data-action="icon-fetch"]');
  await until(p,()=>/没有从 down\.example 拿到图标/.test($('#toast').textContent));
  await p.evaluate(()=>{state.assets.push({id:'nohost',type:'server',name:'my-box',provider:'自建',source:'manual',art:'generic'});save();render();showDetail('nohost');});
  await p.click('#detail [data-action="icon-fetch"]');
  check(await p.evaluate(()=>$('#modal').open&&!!$('#icon-form')),'With no site to guess, the button opens the 网站图标 dialog');
  await p.evaluate(()=>$('#modal').close());
  // The form offers the category's common vendors as chips and suggestions; a chip fills the field, typing keeps the chips in step.
  await p.evaluate(()=>assetForm('server'));
  check(await p.evaluate(()=>document.querySelectorAll('#asset-form [data-provider]').length===8&&document.querySelectorAll('#provider-list option').length>8&&$('#asset-form [name="provider"]').getAttribute('list')==='provider-list'),'Chips and suggestions for servers');
  await p.click('#asset-form [data-provider="AWS"]');
  check(await p.evaluate(()=>$('#asset-form [name="provider"]').value==='AWS'&&document.querySelector('#asset-form [data-provider="AWS"]').getAttribute('aria-pressed')==='true'),'A chip fills the provider');
  await p.click('#asset-form [data-choice="type"][data-value="domain"]').catch(()=>p.evaluate(()=>setChoice($('#asset-form'),'type','domain')));
  check(await p.evaluate(()=>!!document.querySelector('#asset-form [data-provider="Namecheap"]')),'Switching category switches the vendors');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: new known-platform records fetched once per host, old records left alone, icons reused without requests, unknown hosts not auto-contacted, failures not retried, sidebar entry, switch off stored and honored, inspector button by link host, undo, failure toast, dialog when no host';
}
