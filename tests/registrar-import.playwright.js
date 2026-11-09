// Run with the browser tool's filename option. 从注册商导入 (Namecheap, Porkbun) with a fake Mac host that answers registrarSync itself:
// the import window and 设置 › 连接 open it, the credentials are checked before anything is sent and never kept in the page, the answer
// becomes domain records (same-name ones asked about), a sync again sends no credentials, disconnecting keeps the records; the
// browser, the demo and ?free have no way in. Light and dark contrast of the dialog. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  window.__sent=[];window.__answer=null;
  window.webkit={messageHandlers:{assetboard:{postMessage(m){
   window.__sent.push(JSON.parse(JSON.stringify(m)));
   if(m?.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m?.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m?.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:false,ghAccounts:[],sshConfig:false}),5);
   if(m?.action==='registrarDisconnect')setTimeout(()=>window.assetboardRegistrarResult({ok:true,source:m.source,disconnected:true}),5);
   if(m?.action==='registrarSync'&&window.__answer)setTimeout(()=>window.assetboardRegistrarResult(window.__answer(m)),5);
  }}}};
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,registrars:{namecheap:false,porkbun:false},data:{blocks:[{id:'domain'}],assets:[
   {id:'own',type:'domain',name:'example.org',provider:'Namecheap',source:'manual',date:'2027-01-01',dateKind:'expire',art:'generic'}]}};
 };
 const contrast=async(p,label)=>p.evaluate(label=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
  const bad=[],walker=document.createTreeWalker(document.querySelector('#modal[open]'),NodeFilter.SHOW_TEXT);let checked=0;
  while(walker.nextNode()){
   const el=walker.currentNode.parentElement;if(!walker.currentNode.textContent.trim()||!el||el.closest('svg,[hidden],button:disabled'))continue;
   const style=getComputedStyle(el);if(style.visibility!=='visible'||!el.getClientRects().length)continue;
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0)layers.push(c);}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const color=parse(style.color),size=parseFloat(style.fontSize),need=size>=24||(size>=18.66&&Number(style.fontWeight)>=700)?3:4.5,value=ratio(over(color,bg),bg);checked++;
   if(value<need)bad.push(`${label}: "${walker.currentNode.textContent.trim().slice(0,30)}" ${value.toFixed(2)}`);
  }
  return checked?bad:[`${label}: nothing checked`];
 },label);
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof registrarDialog==='function');
  await p.evaluate(()=>{save=()=>{};});
  // The import window names it; it opens Namecheap first, with what Namecheap needs and why.
  await p.evaluate(()=>importHub());
  check(await p.locator('#modal [data-action="registrar-import"]').count()===1,'The import window offers 注册商');
  await p.click('#modal [data-action="registrar-import"]');await p.waitForSelector('#registrar-form');
  const nc=await p.evaluate(()=>({fields:[...document.querySelectorAll('#registrar-form input[name]')].map(i=>`${i.name}:${i.type}`),note:document.querySelector('.registrar-note').textContent,status:$('#registrar-status').textContent,picked:document.querySelector('#registrar-form [data-action="registrar-pick"][aria-checked="true"]').dataset.id}));
  check(nc.picked==='namecheap'&&nc.fields.join()==='apiUser:text,apiKey:password,clientIp:text','Namecheap asks for user, key (hidden) and IP: '+nc.fields);
  check(/白名单/.test(nc.note)&&/IPv4/.test(nc.note)&&/只调用读取域名列表/.test(nc.note)&&/整个账号/.test(nc.note),'The note explains the whitelisted IP and the wide key: '+nc.note);
  check(nc.status==='未连接','Not connected yet');
  await p.click('#registrar-form [data-action="registrar-key"]');
  check(await p.evaluate(()=>__sent.some(m=>m.action==='openExternal'&&m.url==='https://ap.www.namecheap.com/settings/tools/apiaccess/')),'建 API Key opens Namecheap\'s API page through the app');
  for(const scheme of ['light','dark']){await p.emulateMedia({colorScheme:scheme});await p.waitForTimeout(400);const bad=await contrast(p,scheme+' registrar');check(!bad.length,bad.join(' | '));}
  await p.emulateMedia({colorScheme:'light'});

  // Checked before anything is sent: a local address is not the whitelisted one.
  await p.fill('#registrar-form [name="apiUser"]','apiexample');await p.fill('#registrar-form [name="apiKey"]','0123456789abcdef0123456789abcdef');await p.fill('#registrar-form [name="clientIp"]','192.168.1.109');
  await p.click('#registrar-sync');
  check(/公网/.test(await p.locator('#registrar-status').innerText())&&!await p.evaluate(()=>__sent.some(m=>m.action==='registrarSync')),'A local IP is refused in the page');
  check(await p.locator('#registrar-form [name="apiKey"]').inputValue()!=='','What was typed stays to be corrected');
  // Right: the credentials go to the app once, the fields empty, the answer becomes records.
  await p.evaluate(()=>{window.__answer=m=>({ok:true,connected:true,source:m.source,account:m.credentials?.apiUser||'apiexample',complete:true,domains:[
   {id:'127',name:'example.com',expires:'02/15/2027',autoRenew:'false',status:'active'},{id:'381',name:'example.net',expires:'04/28/2027',autoRenew:'true',status:'active'},{id:'9',name:'example.org',expires:'06/01/2027',autoRenew:'true',status:'active'},{id:'bad id',name:'nope'}]});});
  await p.fill('#registrar-form [name="clientIp"]','203.0.113.10');await p.click('#registrar-sync');
  // The new domains are listed to pick from first (tests/connect-pick.playwright.js); all of them are taken here.
  await p.waitForSelector('#connect-pick');
  check(await p.evaluate(()=>!state.assets.some(a=>a.source==='namecheap')),'Nothing lands before the pick');
  await p.click('#connect-pick [data-action="connect-import"]');
  await until(p,()=>state.assets.some(a=>a.source==='namecheap'));
  const sent=await p.evaluate(()=>__sent.filter(m=>m.action==='registrarSync'));
  check(sent.length===1&&sent[0].source==='namecheap'&&JSON.stringify(sent[0].credentials)===JSON.stringify({apiUser:'apiexample',apiKey:'0123456789abcdef0123456789abcdef',clientIp:'203.0.113.10'}),'One request with the typed credentials: '+JSON.stringify(sent));
  const after=await p.evaluate(()=>({assets:state.assets.map(a=>({id:a.id,name:a.name,source:a.source,date:a.date,cycle:a.cycle,autoRenew:a.autoRenew,provider:a.provider})),
   connected:nativeStore.registrars.namecheap,modal:$('#modal').dataset.view,open:$('#modal').open,text:document.querySelector('#modal[open]')?.innerText||'',
   kept:JSON.stringify(state).includes('0123456789abcdef0123456789abcdef')||JSON.stringify(localStorage).includes('0123456789abcdef0123456789abcdef')}));
  check(!after.kept,'The key is nowhere in the board or the page storage');
  check(after.connected,'Namecheap shows as connected');
  const com=after.assets.find(a=>a.name==='example.com'),net=after.assets.find(a=>a.name==='example.net');
  check(com?.source==='namecheap'&&com.date==='2027-02-15'&&com.cycle===''&&com.autoRenew==='off'&&com.provider==='Namecheap','example.com: '+JSON.stringify(com));
  check(net?.date==='2027-04-28'&&net.cycle==='yearly'&&net.autoRenew==='on','example.net: '+JSON.stringify(net));
  check(after.assets.filter(a=>a.name==='example.org').length===1&&after.assets.find(a=>a.name==='example.org').source==='manual','The hand-made example.org is not doubled');
  check(after.open&&after.text.includes('同名')&&after.text.includes('example.org')&&after.text.includes('不是有效的域名'),'The same-name record and the unreadable row are asked about: '+after.text);
  // Ticking the same-name record makes it the registrar's.
  await p.check('#modal input[name="collision"]');await p.click('#modal [data-action="apply-collisions"]');await p.waitForTimeout(100);
  check(await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='own');return a.source==='namecheap'&&a.date==='2027-06-01'&&a.externalId==='9';}),'The ticked record takes the registrar\'s values');
  // The record: source in the detail, the row's account tag, locked name for agents.
  const shown=await p.evaluate(()=>{const a=state.assets.find(x=>x.name==='example.com');showDetail(a.id);return {detail:$('#detail').textContent,label:sourceLabel(a),
   agent:assetboardAgent({requestId:'r',via:'mcp',method:'get',params:{id:a.id}}),rename:(()=>{try{agentPrepareUpdate(a.id,{name:'renamed.example'});return {ok:true};}catch(error){return {ok:false,error:error.message};}})()};});
  check(shown.label==='Namecheap · active'&&shown.detail.includes('从 Namecheap 读取'),'The detail names the registrar: '+shown.label);
  check(shown.agent.ok&&shown.agent.result.source==='namecheap'&&shown.agent.result.autoRenew==='off','Agents read the registrar record: '+JSON.stringify(shown.agent).slice(0,200));
  check(!shown.rename.ok&&/Namecheap/.test(shown.rename.error||''),'Agents cannot rename a registrar record: '+JSON.stringify(shown.rename));
  await p.evaluate(()=>closeDetail());

  // 设置 › 连接 lists both registrars; a sync again sends no credentials and marks what the registrar no longer returns.
  await p.evaluate(()=>prefsDialog('connections'));
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal [data-action="registrar-import"]')].map(b=>b.dataset.id).join())==='namecheap,porkbun','设置 › 连接 lists both registrars');
  await p.click('#modal [data-action="registrar-import"][data-id="namecheap"]');await p.waitForSelector('#registrar-form');
  check(await p.locator('#registrar-status').innerText()==='已连接'&&await p.locator('#registrar-sync').innerText()==='重新同步','Connected: 重新同步');
  await p.evaluate(()=>{window.__answer=m=>({ok:true,connected:true,source:m.source,account:'apiexample',complete:true,domains:[{id:'127',name:'example.com',expires:'02/15/2028',autoRenew:'true',status:'active'}]});});
  await p.click('#registrar-sync');
  await until(p,()=>state.assets.find(a=>a.name==='example.com')?.date==='2028-02-15');
  const again=await p.evaluate(()=>({last:__sent.filter(m=>m.action==='registrarSync').at(-1),missing:state.assets.filter(a=>a.syncMissing).map(a=>a.name).sort()}));
  check(again.last.credentials===null,'A sync again sends no credentials: '+JSON.stringify(again.last));
  check(again.missing.join()==='example.net,example.org','What the registrar no longer returns is marked, not removed: '+again.missing);

  // Porkbun: its two keys; a refusal shows in the dialog and changes nothing.
  await p.evaluate(()=>registrarDialog('porkbun'));
  check(await p.evaluate(()=>[...document.querySelectorAll('#registrar-form input[name]')].map(i=>`${i.name}:${i.type}`).join())==='apiKey:password,secretKey:password','Porkbun asks for its two keys');
  await p.fill('#registrar-form [name="apiKey"]','sk1_'+'b'.repeat(32));await p.fill('#registrar-form [name="secretKey"]','pk1_'+'a'.repeat(32));await p.click('#registrar-sync');
  check(/pk1_/.test(await p.locator('#registrar-status').innerText()),'Swapped keys are named');
  await p.evaluate(()=>{window.__answer=m=>({ok:false,source:m.source,error:'Porkbun 拒绝了请求：Invalid API key.'});});
  const before=await p.evaluate(()=>JSON.stringify(state.assets));
  await p.fill('#registrar-form [name="apiKey"]','pk1_'+'a'.repeat(32));await p.fill('#registrar-form [name="secretKey"]','sk1_'+'b'.repeat(32));await p.click('#registrar-sync');
  await until(p,()=>/Invalid API key/.test($('#registrar-status')?.textContent||''));
  check(await p.evaluate(b=>JSON.stringify(state.assets)===b&&!nativeStore.registrars.porkbun&&!$('#registrar-sync').disabled,before),'A refusal changes nothing and the button works again');
  // Disconnecting Namecheap keeps its records.
  await p.evaluate(()=>registrarDialog('namecheap'));await p.click('#registrar-disconnect');
  await until(p,()=>nativeStore.registrars.namecheap===false);
  check(await p.evaluate(()=>state.assets.filter(a=>a.source==='namecheap').length===3&&$('#registrar-status').textContent==='未连接'),'Disconnecting keeps the records');
  // Deleting a registrar record keeps it deleted at the next sync.
  await p.evaluate(()=>{const a=state.assets.find(x=>x.name==='example.com');rememberDeleted(a);state.assets=state.assets.filter(x=>x!==a);window.__answer=m=>({ok:true,connected:true,source:m.source,account:'apiexample',complete:true,domains:[{id:'127',name:'example.com',expires:'02/15/2028',autoRenew:'true',status:'active'}]});window.assetboardRegistrarResult(window.__answer({source:'namecheap'}));});
  check(await p.evaluate(()=>!state.assets.some(a=>a.name==='example.com')&&state.deletedExternalIds.includes('namecheap:127')),'A deleted registrar record stays deleted');
 } finally { await p.close(); }

 // ?free (the edition without connectors) and the browser have no way in; the demo answers with made-up domains (demo-data.js).
 for(const [url,native] of [['/?free',true],['/',false]]){
  const q=await page.context().newPage();
  try{
   if(native)await q.addInitScript(`(${host.toString()})();`);
   await q.goto('http://127.0.0.1:4317'+url);await until(q,()=>typeof importHub==='function');
   const r=await q.evaluate(()=>{importHub();const hub=!!document.querySelector('#modal [data-action="registrar-import"]');prefsDialog('connections');const prefs=!!document.querySelector('#modal [data-action="registrar-import"]');$('#modal').close();registrarDialog();return {hub,prefs,open:!!document.querySelector('#registrar-form'),toast:$('#toast').textContent};});
   check(!r.hub&&!r.prefs,`${url}: no registrar entry (${JSON.stringify(r)})`);
   if(!native)check(!r.open&&/Mac App|演示/.test(r.toast),`${url}: registrarDialog explains instead of opening: ${r.toast}`);
  } finally { await q.close(); }
 }
 const d=await page.context().newPage();
 try{
  await d.goto('http://127.0.0.1:4317/?demo');await until(d,()=>typeof importHub==='function');
  const r=await d.evaluate(()=>{importHub();const hub=!!document.querySelector('#modal [data-action="registrar-import"]');registrarDialog('porkbun');return {hub,open:!!$('#registrar-form')};});
  check(r.hub&&r.open,'The demo offers the registrars: '+JSON.stringify(r));
  await d.fill('#registrar-form [name="apiKey"]','pk1_'+'a'.repeat(32));await d.fill('#registrar-form [name="secretKey"]','sk1_'+'b'.repeat(32));await d.click('#registrar-sync');
  await d.waitForSelector('#connect-pick');
  check(await d.evaluate(()=>document.querySelectorAll('#connect-pick input[name="connect-take"]').length===3),'The demo lists three domains to pick');
 } finally { await d.close(); }
 return 'ok';
}
