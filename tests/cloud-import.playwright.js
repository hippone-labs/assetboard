// Run with the browser tool's filename option. 从云平台导入 (Hetzner, DigitalOcean, Vercel) with a fake Mac host that answers
// cloudImportSync itself: the import window and 设置 › 连接 open it, the token is checked before anything is sent and never kept in the
// page, Vercel's wide token needs a tick, the answer becomes server, deployment, database and domain records (same-name ones asked
// about), agents read, add, update and delete them under the platform rules, a sync again sends no token, disconnecting keeps the
// records; the Mac app has a way in without the Pro modules too (?free), the browser none. Light and dark contrast of the dialog. Never writes data.
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
   if(m?.action==='cloudImportDisconnect')setTimeout(()=>window.assetboardCloudImportResult({ok:true,source:m.source,disconnected:true}),5);
   if(m?.action==='cloudImportSync'&&window.__answer)setTimeout(()=>window.assetboardCloudImportResult(window.__answer(m)),5);
  }}}};
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,registrars:{namecheap:false,porkbun:false},cloudImports:{hetzner:false,digitalocean:false,vercel:false},data:{blocks:[{id:'server'}],assets:[
   {id:'own',type:'server',name:'web-2',provider:'Hetzner',source:'manual',cost:'',art:'generic'}]}};
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
 const hetznerToken='a1'.repeat(32),servers=extra=>[
  {kind:'server',id:'42',name:'web-1',status:'running',ips:['203.0.113.10'],region:'DE',price:{currency:'EUR',value:4.5101},detail:'CX22 · Falkenstein'},
  {kind:'server',id:'43',name:'web-2',status:'off',ips:['203.0.113.11'],region:'FI',price:{currency:'EUR',value:4.5101}},...extra];
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof cloudDialog==='function');
  await p.evaluate(()=>{save=()=>{};});
  // The import window names it; it opens Hetzner first, with what Hetzner needs and why.
  await p.evaluate(()=>importHub());
  check(await p.locator('#modal [data-action="cloud-import"]').count()===1,'The import window offers 云平台');
  await p.click('#modal [data-action="cloud-import"]');await p.waitForSelector('#cloud-form');
  const hz=await p.evaluate(()=>({fields:[...document.querySelectorAll('#cloud-form input[name]')].map(i=>`${i.name}:${i.type}`),note:document.querySelector('.registrar-note').textContent,status:$('#cloud-status').textContent,picked:document.querySelector('#cloud-form [data-action="cloud-pick"][aria-checked="true"]').dataset.id,wide:!!$('#cloud-wide')}));
  check(hz.picked==='hetzner'&&hz.fields.join()==='token:password,project:text'&&!hz.wide,'Hetzner asks for the token (hidden) and an optional project, no tick: '+hz.fields);
  check(/Read/.test(hz.note)&&/只读取服务器列表/.test(hz.note),'The note says to make a Read token: '+hz.note);
  check(hz.status==='未连接','Not connected yet');
  await p.click('#cloud-form [data-action="cloud-key"]');
  check(await p.evaluate(()=>__sent.some(m=>m.action==='openExternal'&&m.url==='https://console.hetzner.com/projects')),'建令牌 opens Hetzner Console through the app');
  for(const scheme of ['light','dark']){await p.emulateMedia({colorScheme:scheme});await p.waitForTimeout(400);const bad=await contrast(p,scheme+' cloud');check(!bad.length,bad.join(' | '));}
  await p.emulateMedia({colorScheme:'light'});

  // Checked before anything is sent.
  await p.fill('#cloud-form [name="token"]','too-short');await p.click('#cloud-sync');
  check(/64/.test(await p.locator('#cloud-status').innerText())&&!await p.evaluate(()=>__sent.some(m=>m.action==='cloudImportSync')),'A malformed token is refused in the page');
  // Right: the token goes to the app once, the fields empty, the answer becomes records.
  await p.evaluate(s=>{window.__answer=m=>({ok:true,connected:true,source:m.source,account:m.credentials?.project||'main',complete:true,queriedKinds:['server'],resources:s,warnings:[]});},servers([{kind:'server',id:'bad id',name:'nope'}]));
  await p.fill('#cloud-form [name="token"]',hetznerToken);await p.fill('#cloud-form [name="project"]','main');await p.click('#cloud-sync');
  // The new servers are listed to pick from first (tests/connect-pick.playwright.js); all of them are taken here.
  await p.waitForSelector('#connect-pick');
  check(await p.evaluate(()=>!state.assets.some(a=>a.source==='hetzner')&&[...document.querySelectorAll('#connect-pick input[name="connect-take"]')].map(i=>i.value).join()==='hetzner-server-42'),'Nothing lands before the pick; web-1 is offered (web-2 is asked about after)');
  await p.click('#connect-pick [data-action="connect-import"]');
  await until(p,()=>state.assets.some(a=>a.source==='hetzner'));
  const sent=await p.evaluate(()=>__sent.filter(m=>m.action==='cloudImportSync'));
  check(sent.length===1&&sent[0].source==='hetzner'&&JSON.stringify(sent[0].credentials)===JSON.stringify({token:hetznerToken,project:'main'}),'One request with the typed token: '+JSON.stringify(sent));
  const after=await p.evaluate(t=>({assets:state.assets.map(a=>({id:a.id,name:a.name,source:a.source,ips:a.ips,region:a.region,cost:a.cost,cycle:a.cycle,provider:a.provider,account:a.account})),
   connected:nativeStore.cloudImports.hetzner,open:$('#modal').open,text:document.querySelector('#modal[open]')?.innerText||'',
   kept:JSON.stringify(state).includes(t)||JSON.stringify(localStorage).includes(t)}),hetznerToken);
  check(!after.kept,'The token is nowhere in the board or the page storage');
  check(after.connected,'Hetzner shows as connected');
  const web=after.assets.find(a=>a.name==='web-1');
  check(web?.source==='hetzner'&&web.ips.join()==='203.0.113.10'&&web.region==='DE'&&web.cost==='€4.51 / 月'&&web.cycle==='monthly'&&web.provider==='Hetzner'&&web.account==='main','web-1: '+JSON.stringify(web));
  check(after.assets.filter(a=>a.name==='web-2').length===1&&after.assets.find(a=>a.name==='web-2').source==='manual','The hand-made web-2 is not doubled');
  check(after.open&&after.text.includes('同名')&&after.text.includes('web-2')&&after.text.includes('读不懂'),'The same-name record and the unreadable row are asked about: '+after.text);
  await p.check('#modal input[name="collision"]');await p.click('#modal [data-action="apply-collisions"]');await p.waitForTimeout(100);
  check(await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='own');return a.source==='hetzner'&&a.region==='FI'&&a.externalId==='43'&&a.cost==='€4.51 / 月';}),'The ticked record takes the platform\'s values and the price for its empty cost');
  // The record on the board: the server row shows its address, the detail names the platform.
  const shown=await p.evaluate(()=>{const a=state.assets.find(x=>x.name==='web-1');showDetail(a.id);return {detail:$('#detail').textContent,label:sourceLabel(a),row:document.querySelector(`[data-id="${a.id}"]`)?.textContent||''};});
  check(shown.label==='Hetzner · running'&&shown.detail.includes('从 Hetzner 读取'),'The detail names the platform: '+shown.label);
  check(shown.row.includes('203.0.113'),'The server row shows its address: '+shown.row.slice(0,120));
  await p.evaluate(()=>closeDetail());

  // Agents (MCP): read with the address masked, update what is the person's, never rename; add a record by hand that the next sync
  // asks about; a deleted one stays deleted.
  const agent=await p.evaluate(()=>{
   const a=state.assets.find(x=>x.name==='web-1');
   const read=assetboardAgent({requestId:'r1',via:'mcp',method:'get',params:{id:a.id}});
   const listed=agentMethods.list({type:'server',query:'hetzner'});
   const attempt=input=>{try{agentPrepareUpdate(a.id,input);return {ok:true};}catch(error){return {ok:false,error:error.message};}};
   const added=agentMethods.add({items:[{type:'server',name:'web-9',provider:'Hetzner'}]});
   return {read,listed:listed.assets.map(x=>x.name),rename:attempt({name:'renamed'}),move:attempt({type:'database'}),notes:attempt({notes:'primary',purpose:'API'}),added};
  });
  check(agent.read.ok&&agent.read.result.source==='hetzner'&&agent.read.result.region==='DE'&&agent.read.result.masked?.includes('ips')&&!JSON.stringify(agent.read.result.ips).includes('203.0.113.10'),'Agents read the record with the address masked: '+JSON.stringify(agent.read).slice(0,300));
  check(agent.listed.includes('web-1'),'Agents find it by its platform: '+agent.listed);
  check(!agent.rename.ok&&/Hetzner/.test(agent.rename.error)&&!agent.move.ok,'Agents cannot rename it or move it to another category: '+JSON.stringify(agent.rename));
  check(agent.notes.ok,'Agents may change the person\'s fields: '+JSON.stringify(agent.notes));
  check(agent.added.added?.length===1||agent.added.added===1,'An agent adds a server by hand: '+JSON.stringify(agent.added));
  await p.evaluate(s=>{const a=state.assets.find(x=>x.name==='web-1');rememberDeleted(a);state.assets=state.assets.filter(x=>x!==a);
   window.assetboardCloudImportResult({ok:true,source:'hetzner',account:'main',complete:true,queriedKinds:['server'],resources:s});},servers([{kind:'server',id:'44',name:'web-9',status:'running'}]));
  const synced=await p.evaluate(()=>({deleted:!state.assets.some(a=>a.name==='web-1')&&state.deletedExternalIds.includes('hetzner:server:42'),asked:document.querySelector('#modal[open]')?.innerText||''}));
  check(synced.deleted,'A deleted cloud record stays deleted');
  check(synced.asked.includes('web-9'),'The agent\'s same-name record is asked about: '+synced.asked);
  await p.evaluate(()=>$('#modal').close());

  // 设置 › 连接 lists the three; a sync again sends no token (marking what is no longer returned is in tests/cloud-import.test.js).
  await p.evaluate(()=>prefsDialog('connections'));
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal [data-action="cloud-import"]')].map(b=>b.dataset.id).join())==='hetzner,digitalocean,vercel','设置 › 连接 lists the three platforms');
  await p.click('#modal [data-action="cloud-import"][data-id="hetzner"]');await p.waitForSelector('#cloud-form');
  check(await p.locator('#cloud-status').innerText()==='已连接'&&await p.locator('#cloud-sync').innerText()==='重新同步','Connected: 重新同步');
  await p.evaluate(()=>{window.__answer=m=>({ok:true,connected:true,source:m.source,account:'main',complete:true,queriedKinds:['server'],resources:[{kind:'server',id:'43',name:'web-2',status:'running',region:'FI'}]});});
  await p.click('#cloud-sync');
  await until(p,()=>state.assets.find(a=>a.id==='own')?.syncStatus==='running');
  const again=await p.evaluate(()=>({last:__sent.filter(m=>m.action==='cloudImportSync').at(-1),missing:state.assets.filter(a=>a.syncMissing).map(a=>a.name).sort()}));
  check(again.last.credentials===null,'A sync again sends no token: '+JSON.stringify(again.last));
  check(again.missing.join()==='','Every Hetzner record is still returned: '+again.missing);

  // DigitalOcean: a kind the token may not read is named; records land in their categories.
  await p.evaluate(()=>cloudDialog('digitalocean'));
  check(await p.evaluate(()=>[...document.querySelectorAll('#cloud-form input[name]')].map(i=>`${i.name}:${i.type}`).join())==='token:password','DigitalOcean asks for the token only');
  await p.evaluate(()=>{window.__answer=m=>({ok:true,connected:true,source:m.source,account:'My Team',complete:true,queriedKinds:['droplet','app'],warnings:['令牌没有 database:read 权限，数据库没有读取'],resources:[
   {kind:'droplet',id:'3164444',name:'app-1',status:'active',ips:['198.51.100.7'],region:'NL',price:{currency:'USD',value:6},url:'https://cloud.digitalocean.com/droplets/3164444'},
   {kind:'app',id:'4f6c71e2',name:'notes-web',status:'active',url:'https://cloud.digitalocean.com/apps/4f6c71e2'}]});});
  await p.fill('#cloud-form [name="token"]','dop_v1_'+'0f'.repeat(32));await p.click('#cloud-sync');
  await p.waitForSelector('#connect-pick');await p.click('#connect-pick [data-action="connect-import"]');
  await until(p,()=>state.assets.some(a=>a.source==='digitalocean'));
  const ocean=await p.evaluate(()=>({types:state.assets.filter(a=>a.source==='digitalocean').map(a=>`${a.name}:${a.type}:${a.cost}`).sort(),text:document.querySelector('#modal[open]')?.innerText||''}));
  check(ocean.types.join()==='app-1:server:$6 / 月,notes-web:deployment:未知','Droplets are servers, apps deployments: '+ocean.types);
  check(ocean.text.includes('database:read'),'The skipped kind is named: '+ocean.text);
  await p.evaluate(()=>$('#modal').close());

  // Vercel: the token can do a lot, so a new one needs the tick; a refusal shows in the dialog and changes nothing.
  await p.evaluate(()=>cloudDialog('vercel'));
  check(await p.evaluate(()=>!!$('#cloud-wide')&&/权限大/.test($('#cloud-form').textContent)&&/没有只读/.test(document.querySelector('.registrar-note').textContent)),'Vercel says its token is wide and asks for a tick');
  await p.fill('#cloud-form [name="token"]','AbCdEf0123456789xyZ_-123');await p.click('#cloud-sync');
  check(/勾选/.test(await p.locator('#cloud-status').innerText())&&!await p.evaluate(()=>__sent.some(m=>m.action==='cloudImportSync'&&m.source==='vercel')),'Without the tick nothing is sent');
  await p.evaluate(()=>{window.__answer=m=>({ok:false,source:m.source,error:'Vercel 拒绝了请求：Not authorized'});});
  const before=await p.evaluate(()=>JSON.stringify(state.assets));
  await p.check('#cloud-wide');await p.click('#cloud-sync');
  await until(p,()=>/Not authorized/.test($('#cloud-status')?.textContent||''));
  check(await p.evaluate(b=>JSON.stringify(state.assets)===b&&!nativeStore.cloudImports.vercel&&!$('#cloud-sync').disabled,before),'A refusal changes nothing and the button works again');
  // Disconnecting Hetzner keeps its records.
  await p.evaluate(()=>cloudDialog('hetzner'));await p.click('#cloud-disconnect');
  await until(p,()=>nativeStore.cloudImports.hetzner===false);
  check(await p.evaluate(()=>state.assets.some(a=>a.source==='hetzner')&&$('#cloud-status').textContent==='未连接'),'Disconnecting keeps the records');
 } finally { await p.close(); }

 // Without the Pro modules (?free) the Mac app still offers the platforms; the browser has no way in; the demo answers with made-up
 // resources (demo-data.js).
 for(const [url,native] of [['/?free',true],['/',false]]){
  const q=await page.context().newPage();
  try{
   if(native)await q.addInitScript(`(${host.toString()})();`);
   await q.goto('http://127.0.0.1:4317'+url);await until(q,()=>typeof importHub==='function');
   const r=await q.evaluate(()=>{importHub();const hub=!!document.querySelector('#modal [data-action="cloud-import"]');prefsDialog('connections');const prefs=!!document.querySelector('#modal [data-action="cloud-import"]');$('#modal').close();cloudDialog();return {hub,prefs,open:!!document.querySelector('#cloud-form'),toast:$('#toast').textContent};});
   if(native)check(r.hub&&r.prefs&&r.open,`${url}: the cloud platforms are there (${JSON.stringify(r)})`);
   else check(!r.hub&&!r.prefs,`${url}: no cloud entry (${JSON.stringify(r)})`);
   if(!native)check(!r.open&&/Mac App|演示/.test(r.toast),`${url}: cloudDialog explains instead of opening: ${r.toast}`);
  } finally { await q.close(); }
 }
 const d=await page.context().newPage();
 try{
  await d.goto('http://127.0.0.1:4317/?demo');await until(d,()=>typeof importHub==='function');
  const r=await d.evaluate(()=>{importHub();const hub=!!document.querySelector('#modal [data-action="cloud-import"]');prefsDialog('connections');const prefs=!!document.querySelector('#modal [data-action="cloud-import"][data-id="hetzner"]');cloudDialog('hetzner');return {hub,prefs,open:!!$('#cloud-form')};});
  check(r.hub&&r.prefs&&r.open,'The demo offers the cloud platforms: '+JSON.stringify(r));
  await d.fill('#cloud-form [name="token"]','a1'.repeat(32));await d.click('#cloud-sync');await d.waitForSelector('#connect-pick');
  check(await d.evaluate(()=>document.querySelectorAll('#connect-pick input[name="connect-take"]').length===3&&!state.assets.some(a=>a.source==='hetzner')),'The demo answers in the page and lists three servers to pick');
 } finally { await d.close(); }
 return 'ok';
}
