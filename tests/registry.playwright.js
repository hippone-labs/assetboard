// Run with the browser tool's filename option. Fakes the Mac host. Nothing reads as all clear when it is not: a frozen domain is red,
// labelled 冻结 and listed first in 即将到来; a registrar or NS change is one amber line there and in the detail (知道了 clears it);
// a renewal nobody answered stays, counts in the sidebar and the menu bar, and past the grace reads as possibly expired; a TLD without
// RDAP says so in the ⋯ menu; a manual check stores the hold and nameservers; the first domain import asks once about the weekly
// check. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  const day=n=>{const d=new Date(Date.now()+n*86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  window.__sent=[];window.__rdap=null;
  window.webkit={messageHandlers:{assetboard:{postMessage(m){
   window.__sent.push(m);
   if(m?.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m?.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m?.action==='rdap'&&window.__rdap)setTimeout(()=>window.assetboardRdap({requestId:m.requestId,ok:true,json:window.__rdap}),5);
  }}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'official'},demo:false,cloudflareConnected:false,githubConnected:false,data:{paymentsSince:day(-800),blocks:[{id:'domain'}],assets:[
   {id:'held',type:'domain',name:'held.example',date:day(200),dateKind:'expire',source:'manual',registryHold:'client',registryCheckedAt:new Date().toISOString(),art:'generic'},
   {id:'moved',type:'domain',name:'moved.example',date:day(300),dateKind:'expire',source:'manual',registryRegistrar:'Other Registrar',registryNS:['park1.example.org'],registryChange:{at:new Date().toISOString(),ns:['ns1.example.net','ns2.example.net']},art:'generic'},
   {id:'lapsed',type:'domain',name:'lapsed.example',date:day(-430),dateKind:'expire',cycle:'yearly',createdAt:new Date(Date.now()-500*86400000).toISOString(),source:'manual',art:'generic'},
   {id:'fresh',type:'domain',name:'fresh.example',date:day(-367),dateKind:'expire',cycle:'yearly',createdAt:new Date(Date.now()-500*86400000).toISOString(),source:'manual',art:'generic'},
   {id:'island',type:'domain',name:'shop.example.io',date:day(250),dateKind:'expire',source:'manual',art:'generic'},
   {id:'plain',type:'domain',name:'plain.example',date:day(150),dateKind:'expire',source:'manual',art:'generic'}]}};
 };
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof registryAlerts==='function'&&document.querySelector('#sidebar .nav-item'));
  // Rows: frozen in red, the renewal past its grace reads as possibly expired, the one within it still asks.
  const rows=await p.evaluate(()=>Object.fromEntries(['held','lapsed','fresh','plain'].map(id=>[id,eventInfo(state.assets.find(a=>a.id===id))])));
  check(rows.held.text==='冻结'&&rows.held.cls.includes('overdue'),'A frozen domain is red and says 冻结: '+JSON.stringify(rows.held));
  check(rows.lapsed.text.startsWith('可能已过期')&&rows.lapsed.cls.includes('overdue'),'Past the grace, unanswered, it reads as expired: '+JSON.stringify(rows.lapsed));
  check(rows.fresh.text.startsWith('续上了吗')&&!rows.fresh.cls.includes('overdue'),'Within the grace it still asks: '+JSON.stringify(rows.fresh));
  check(rows.plain.cls==='','A plain future domain is calm: '+JSON.stringify(rows.plain));
  // The sidebar counts them: two overdue (frozen, lapsed), one due soon (fresh).
  const due=await p.evaluate(()=>dueLevels(liveAssets()));
  check(due.overdue===2&&due.soon===1,'The sidebar counts frozen and unanswered: '+JSON.stringify(due));
  const nav=await p.evaluate(()=>{const n=document.querySelector('#sidebar [data-id="upcoming"] .nav-count');return n?{text:n.textContent,overdue:n.classList.contains('overdue')}:null;});
  check(nav&&nav.text==='3'&&nav.overdue,'即将到来 in the sidebar shows 3 in red: '+JSON.stringify(nav));
  // The menu bar badge counts them too, frozen first.
  const summary=await p.evaluate(()=>{statusSent='';window.__sent=[];syncStatusItem();return window.__sent.find(m=>m.action==='statusSummary')?.summary;});
  check(summary&&summary.badge>=3&&summary.items[0].id==='held'&&summary.items[0].level==='overdue','The menu bar names the frozen domain first: '+JSON.stringify(summary));
  check(summary.items.some(i=>i.id==='lapsed'&&i.level==='overdue')&&summary.items.some(i=>i.id==='fresh'&&i.level==='soon'),'and the unanswered renewals');
  // 即将到来: the change line, the frozen group first among groups, the renewals band still asking.
  await p.evaluate(()=>setView('upcoming'));
  const view=await p.evaluate(()=>({note:[...document.querySelectorAll('#board .registry-note')].map(n=>n.textContent),groups:[...document.querySelectorAll('#board section.group')].map(g=>g.dataset.group),frozen:[...document.querySelectorAll('#board [data-group="frozen"] [data-asset]')].map(r=>r.dataset.asset),held:document.querySelectorAll('#board .row[data-asset="held"]').length,renewals:[...document.querySelectorAll('#board .renewal-row')].map(r=>r.dataset.asset+':'+r.textContent)}));
  check(view.note.length===1&&view.note[0].includes('moved.example')&&view.note[0].includes('注册商或 NS 变了'),'One amber line for the change: '+JSON.stringify(view.note));
  check(view.groups[0]==='frozen'||view.groups[1]==='frozen','The frozen group comes first: '+view.groups);
  check(JSON.stringify(view.frozen)==='["held"]'&&view.held===1,'The frozen domain is listed once: '+JSON.stringify(view));
  check(view.renewals.some(r=>r.startsWith('lapsed:')&&r.includes('可能已过期'))&&view.renewals.some(r=>r.startsWith('fresh:')),'Both renewals are still asked: '+JSON.stringify(view.renewals));
  // The detail: 冻结 in red, the change in amber; 知道了 clears the change.
  const facts=await p.evaluate(()=>{showDetail('held');const f=[...document.querySelectorAll('#detail-content .fact')].find(x=>x.textContent.startsWith('注册局'));return {text:f?.textContent||'',bad:!!f?.querySelector('.fact-bad'),agreed:[...document.querySelectorAll('#detail-content .fact')].some(x=>x.textContent.includes('核对一致'))};});
  check(facts.text.includes('冻结')&&facts.text.includes('注册商冻结')&&facts.bad&&!facts.agreed,'The detail shows 冻结 in red, never 一致: '+JSON.stringify(facts));
  const changed=await p.evaluate(()=>{showDetail('moved');const f=[...document.querySelectorAll('#detail-content .fact')].find(x=>x.querySelector('.fact-warn'));return f?{text:f.textContent,title:f.querySelector('.fact-warn').title}:null;});
  check(changed&&changed.text.includes('注册商或 NS 变了')&&changed.title.includes('ns1.example.net')&&changed.title.includes('park1.example.org'),'The detail names the change: '+JSON.stringify(changed));
  await p.click('#detail-content [data-action="rdap-seen"]');
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='moved').registryChange&&!document.querySelector('#board .registry-note')),'知道了 clears it here and in 即将到来');
  // A TLD without RDAP: the ⋯ menu says so instead of offering a check.
  const menu=await p.evaluate(()=>{const items=assetMenuItems(state.assets.find(a=>a.id==='island'));return {none:items.find(i=>i.action==='rdap-none')?.label,check:items.some(i=>i.action==='rdap')};});
  check(menu.none==='注册局没有提供 RDAP'&&!menu.check,'The menu says the registry has no RDAP: '+JSON.stringify(menu));
  check(await p.evaluate(()=>assetMenuItems(state.assets.find(a=>a.id==='plain')).some(i=>i.action==='rdap')),'Other domains keep the check');
  check(await p.evaluate(()=>!rdapAutoDue(new Date()).includes('island')),'The weekly check skips it');
  // A manual check: a hold with the same date is reported as frozen, and the registrar and nameservers are stored.
  await p.evaluate(()=>{save=()=>{};const a=state.assets.find(x=>x.id==='plain');window.__rdap={events:[{eventAction:'expiration',eventDate:a.date+'T00:00:00Z'}],status:['clientHold'],entities:[{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Example Registrar']]]}],nameservers:[{ldhName:'ns1.example.net'},{ldhName:'ns2.example.net'}]};rdapCheck('plain');});
  await until(p,()=>$('#modal').open&&$('#modal').textContent.includes('冻结'));
  const plain=await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='plain');return {hold:a.registryHold,ns:a.registryNS,registrar:a.registryRegistrar,text:$('#modal').textContent};});
  check(plain.hold==='client'&&JSON.stringify(plain.ns)==='["ns1.example.net","ns2.example.net"]'&&plain.registrar==='Example Registrar','The check stores hold, registrar and NS: '+JSON.stringify(plain));
  check(!plain.text.includes('一致'),'and never says 一致');
  await p.click('#confirm-yes');
  // The next check sees other nameservers and no hold: the hold goes, the change is noted.
  await p.evaluate(()=>{window.__rdap={...window.__rdap,status:['active'],nameservers:[{ldhName:'park1.example.org'}]};rdapCheck('plain');});
  await until(p,()=>!!state.assets.find(x=>x.id==='plain').registryChange);
  const after=await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='plain');return {hold:a.registryHold||'',change:a.registryChange,toast:$('#toast').textContent};});
  check(!after.hold&&JSON.stringify(after.change.ns)==='["ns1.example.net","ns2.example.net"]'&&after.toast.includes('注册商或 NS 变了'),'A later check clears the hold and notes the NS change: '+JSON.stringify(after));
  // Importing domains asks once whether to turn on the weekly check.
  check(await p.evaluate(()=>!state.rdapAuto&&!state.rdapAsked),'Weekly check off and not asked yet');
  await p.evaluate(()=>routeImportText('名称,类别\nalpha.example,域名\nbeta.example,域名\n'));
  await until(p,()=>$('#toast').classList.contains('ask'));
  const ask=await p.evaluate(()=>({text:$('#toast').textContent,on:!!$('#toast [data-action="rdap-ask-on"]'),asked:state.rdapAsked}));
  check(ask.text.includes('新增 2')&&ask.text.includes('只问该后缀的注册局，记在网络记录里')&&ask.on&&ask.asked===true,'The import result asks: '+JSON.stringify(ask));
  await p.click('#toast [data-action="rdap-ask-on"]');
  check(await p.evaluate(()=>state.rdapAuto===true),'打开每周核对 turns it on');
  await p.evaluate(()=>{delete state.rdapAuto;routeImportText('名称,类别\ngamma.example,域名\n');});
  await p.waitForTimeout(100);
  check(await p.evaluate(()=>!$('#toast').classList.contains('ask')&&state.assets.some(a=>a.name==='gamma.example')),'Asked only once');
 }finally{await p.close();}
 return 'PASS';
}
