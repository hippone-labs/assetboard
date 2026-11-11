// Run with the browser tool's filename option. Connect, then pick: with a fake Mac host, a platform's answer lists its new records to
// pick from (all ticked; what the board holds from it as 已引入) and nothing lands unasked; what is not picked waits in the sidebar's
// 待引入, the 设置 › 连接 row and the add form; turning items down keeps later reads from offering them; a read with nothing new says
// so; the automatic Cloudflare sync only holds what it finds; agents list and import what waits; undo puts it back. Never writes data.
async (page) => {
 // A scheme is set when the board has taken it (<html data-scheme>, from the change event the browser sends on its next frame) and
 // the transitions it started have run out; a fixed wait can end before both on a slow runner.
 const atScheme=async(p,scheme)=>{await p.emulateMedia({colorScheme:scheme});await p.waitForFunction(s=>document.documentElement.dataset.scheme===s,scheme);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await p.evaluate(()=>Promise.race([Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,5000))]));};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  window.__sent=[];window.__answer=null;
  window.webkit={messageHandlers:{assetboard:{postMessage(m){
   window.__sent.push(JSON.parse(JSON.stringify(m)));
   if(m?.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m?.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m?.action==='cloudflareSync'&&window.__answer)setTimeout(()=>window.assetboardCloudflareResult(window.__answer(m)),5);
  }}}};
  window.__ASSETBOARD_NATIVE__={demo:false,pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},cloudflareConnected:false,githubConnected:false,registrars:{namecheap:false,porkbun:false},cloudImports:{hetzner:false,digitalocean:false,vercel:false},
   data:{blocks:[{id:'domain'}],assets:[{id:'own',type:'domain',name:'mine.example.com',provider:'Namecheap',source:'manual',art:'generic'}],deletedExternalIds:[]}};
 };
 const zones=names=>({ok:true,queriedKinds:['zone','pages','workers','r2'],resources:names.map((name,i)=>({kind:name.includes('.')?'zone':'pages',id:'z'+name.length+'-'+i,name,account:'Acme',status:'active'}))});
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
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof cloudflareDialog==='function');
  await p.evaluate(()=>{save=()=>{};});
  // Connecting: the answer opens the pick list at once, every new record ticked, nothing on the board yet.
  await p.evaluate(z=>{window.__answer=()=>z;cloudflareDialog();},zones(['a.example.com','b.example.com','c.example.com','site']));
  await p.fill('#cloudflare-token','token-typed-here');await p.click('#cloudflare-sync');
  await p.waitForSelector('#connect-pick');
  const first=await p.evaluate(()=>({rows:[...document.querySelectorAll('#connect-pick input[name="connect-take"]')].map(i=>[i.value,i.checked]),board:state.assets.filter(a=>a.source==='cloudflare').length,
   go:document.querySelector('#connect-pick [data-action="connect-import"]').textContent,title:$('#modal-title').textContent,groups:[...document.querySelectorAll('#connect-pick .import-group h3')].map(h=>h.textContent)}));
  check(first.rows.length===4&&first.rows.every(([,on])=>on)&&first.board===0,'Every new record is offered, ticked, and none is on the board: '+JSON.stringify(first));
  check(first.go==='引入 4 项'&&/Cloudflare/.test(first.title)&&first.groups.some(g=>g.startsWith('域名'))&&first.groups.some(g=>g.startsWith('部署')),'Grouped by category with one action: '+JSON.stringify(first));
  check(!await p.evaluate(()=>JSON.stringify(state).includes('token-typed-here')),'The token is not kept in the page');
  for(const scheme of ['light','dark']){await atScheme(p,scheme);const bad=await contrast(p,scheme+' pick');check(!bad.length,bad.join(' | '));}
  await p.emulateMedia({colorScheme:'light'});
  // Untick one: the count follows, 没勾的不再提醒 appears; import the rest.
  await p.locator('#connect-pick input[name="connect-take"]').nth(1).uncheck();
  check(await p.evaluate(()=>document.querySelector('#connect-pick [data-action="connect-import"]').textContent==='引入 3 项'&&!document.querySelector('#connect-pick .connect-ignore').hidden&&$('#connect-all').indeterminate),'The count, 全选 and 没勾的不再提醒 follow the ticks');
  await p.click('#connect-pick [data-action="connect-import"]');
  const picked=await p.evaluate(()=>({board:state.assets.filter(a=>a.source==='cloudflare').map(a=>a.name).sort(),held:heldItems(state,'cloudflare').map(a=>a.name),open:$('#modal').open,toast:$('#toast').textContent,
   nav:document.querySelector('#sidebar [data-action="connect-pending"]')?.textContent||''}));
  check(picked.board.join()==='a.example.com,c.example.com,site'&&picked.held.join()==='b.example.com'&&!picked.open,'The ticked ones land, the other waits: '+JSON.stringify(picked));
  check(/已引入 3 项，1 项留在待引入/.test(picked.toast)&&/待引入\s*1/.test(picked.nav),'The toast says what waits, and the sidebar shows 待引入 1: '+JSON.stringify(picked));
  // Undo takes the import back, held list included.
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.some(a=>a.source==='cloudflare')&&heldItems(state,'cloudflare').length===4),'Undo puts the picked records back in 待引入');
  await p.evaluate(()=>redo());
  // 设置 › 连接 names what waits; the sidebar entry opens the list, with what is on the board as 已引入.
  await p.evaluate(()=>prefsDialog('connections'));
  // (The Cloudflare row is in the full build only; without pro/ the check is skipped.)
  check(await p.evaluate(()=>!proBuilt()||document.querySelector('#modal .connect-chip[data-id="cloudflare"]')?.textContent==='1 项待引入'),'The connection row says 1 项待引入');
  await p.evaluate(()=>$('#modal').close());
  await p.click('#sidebar [data-action="connect-pending"]');await p.waitForSelector('#connect-pick');
  check(await p.evaluate(()=>document.querySelectorAll('#connect-pick input[name="connect-take"]').length===1&&/已引入 · 3/.test(document.querySelector('#connect-pick .connect-done summary').textContent)),'The list holds the waiting one and names the 3 imported');
  await p.evaluate(()=>$('#modal').close());
  // The add form offers what waits for its category, and one pick imports it.
  await p.evaluate(()=>assetForm('domain'));
  const options=await p.evaluate(()=>[...document.querySelectorAll('#asset-form select[name="connectPick"] option')].map(o=>o.value));
  check(options.includes('cloudflare|cloudflare-zone-z13-1'),'The domain form offers the waiting domain: '+options);
  await p.selectOption('#asset-form select[name="connectPick"]','cloudflare|cloudflare-zone-z13-1');
  check(await p.evaluate(()=>!$('#modal').open&&state.assets.some(a=>a.name==='b.example.com'&&a.source==='cloudflare')&&heldCount(state)===0&&!document.querySelector('#sidebar [data-action="connect-pending"]')),'Picking in the form imports it; 待引入 leaves the sidebar');
  // A read with nothing new says so without a list.
  await p.evaluate(()=>cloudflareDialog());await p.click('#cloudflare-sync');
  await until(p,()=>/都已在大板里/.test($('#toast').textContent));
  check(await p.evaluate(()=>!$('#connect-pick')),'Nothing new: no list');
  // Turning down: a new zone appears, the person says not to suggest it; later reads skip it.
  await p.evaluate(z=>{window.__answer=()=>z;cloudflareDialog();},zones(['a.example.com','b.example.com','c.example.com','site','d.example.com']));
  await p.click('#cloudflare-sync');await p.waitForSelector('#connect-pick');
  check(await p.evaluate(()=>!!document.querySelector('#connect-pick .chip.ok')&&/新/.test(document.querySelector('#connect-pick .chip.ok').textContent)),'A record found after the first read is marked 新');
  await p.locator('#connect-pick input[name="connect-take"]').uncheck();
  await p.click('#connect-pick [data-action="connect-ignore"]');
  check(await p.evaluate(()=>heldCount(state)===0&&state.deletedExternalIds.includes('cloudflare:zone:z13-4')),'Turned down: off the list and on the sync blocklist');
  await p.evaluate(()=>cloudflareDialog());await p.click('#cloudflare-sync');
  await until(p,()=>/都已在大板里/.test($('#toast').textContent));
  // The automatic sync holds what it finds and says so in one quiet line.
  await p.evaluate(z=>{window.__answer=null;nativeStore.cloudflareConnected=true;state.assets.forEach(a=>{if(a.source==='cloudflare')a.syncedAt='2020-01-01T00:00:00Z';});cloudflareAutoTried=0;$('#modal').close();autoSyncCloudflare();window.assetboardCloudflareResult(z);},zones(['a.example.com','b.example.com','c.example.com','site','d.example.com','e.example.com']));
  const auto=await p.evaluate(()=>({held:heldItems(state,'cloudflare').map(a=>a.name),landed:state.assets.some(a=>a.name==='e.example.com'),toast:$('#toast').textContent,act:$('#toast [data-action="connect-pending"]')?.textContent}));
  check(auto.held.join()==='e.example.com'&&!auto.landed&&/Cloudflare 有 1 项新资产待引入/.test(auto.toast)&&auto.act==='查看','The automatic sync only holds: '+JSON.stringify(auto));
  // Agents: list what waits (read, free) and import it (a write).
  const agent=await p.evaluate(()=>({list:assetboardAgent({requestId:'a',via:'mcp',method:'connectPending',params:{}}),take:assetboardAgent({requestId:'b',via:'mcp',method:'connectImport',params:{source:'cloudflare'}}),after:heldCount(state)}));
  check(agent.list.ok&&agent.list.result.sources[0].source==='cloudflare'&&agent.list.result.sources[0].items[0].name==='e.example.com'&&agent.list.result.sources[0].items[0].new===true,'list_import_candidates: '+JSON.stringify(agent.list).slice(0,300));
  check(agent.take.ok&&agent.take.result.added===1&&agent.after===0,'import_candidates: '+JSON.stringify(agent.take).slice(0,300));
  check(/没有待引入/.test((await p.evaluate(()=>assetboardAgent({requestId:'c',via:'mcp',method:'connectImport',params:{source:'cloudflare'}}))).error),'Nothing waits: a reason');
  // Disconnecting forgets the list.
  await p.evaluate(z=>{state.connectPending={cloudflare:{at:new Date().toISOString(),items:[{id:'x',type:'domain',name:'x.example.com',source:'cloudflare'}]}};window.assetboardCloudflareResult({ok:true,disconnected:true});},null);
  check(await p.evaluate(()=>heldCount(state)===0),'Disconnecting forgets what waited');
 } finally { await p.close(); }
 return 'ok';
}
