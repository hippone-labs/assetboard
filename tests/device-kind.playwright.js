// Run with the browser tool's filename option. 设备种类: the device form asks what the device is and its warranty date, with no amount
// (a bought machine is no running cost); the kind is saved, shown in the inspector and as the tile; this Mac counts as a Mac without
// saying so; an agent can set it and is refused anything else. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const p=await page.context().newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.setViewportSize({width:1400,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.waitForFunction(()=>typeof assetForm==='function');
  await p.evaluate(()=>{save=()=>{};state={blocks:[],assets:[{id:'mine',type:'device',name:'MacBook Pro',provider:'Apple',source:'local',externalId:'x',chip:'Apple M3 Max'}]};render();});
  check(await p.evaluate(()=>deviceKindOf(state.assets[0])==='mac'),'this Mac is a Mac without a stored kind');

  await p.evaluate(()=>assetForm('device'));
  const form=await p.evaluate(()=>({kinds:[...document.querySelectorAll('#asset-form [data-choice="deviceKind"]')].map(b=>b.dataset.value),cost:[...document.querySelectorAll('#asset-form [name="amount"],#asset-form [name="cost"],#asset-form [name="promoAmount"]')].some(e=>e.offsetParent),date:/保修到期/.test(document.querySelector('#asset-form').textContent)}));
  check(form.kinds.join()===',mac,iphone,ipad,watch,phone,computer,router,other','the form offers every kind: '+form.kinds.join());
  check(form.date&&!form.cost,'a warranty date and no amount, not even a promotion: '+JSON.stringify(form));
  await p.fill('#asset-form [name="name"]','备用 iPhone');
  await p.click('#asset-form [data-choice="deviceKind"][data-value="iphone"]');
  await p.fill('#asset-form [name="date"]','2027-09-30');
  await p.locator('#asset-form [type="submit"]').click();await p.waitForTimeout(200);
  const saved=await p.evaluate(()=>state.assets.find(a=>a.name==='备用 iPhone'));
  check(saved?.type==='device'&&saved.deviceKind==='iphone'&&saved.date==='2027-09-30'&&saved.dateKind==='expire','kind and warranty date saved: '+JSON.stringify(saved));
  check(await p.evaluate(id=>!!document.querySelector(`#board [data-asset="${id}"] .tile path[d="M11 18.5h2"]`),saved.id),'the tile is a phone');
  await p.evaluate(id=>showDetail(id),saved.id);
  check(await p.evaluate(()=>/种类\s*iPhone/.test(document.querySelector('#detail').textContent)),'the inspector names the kind');

  // An agent may set it, and only to a known kind.
  await p.evaluate(id=>agentMethods.update({id,fields:{deviceKind:'ipad'}}),saved.id);
  check(await p.evaluate(id=>state.assets.find(a=>a.id===id).deviceKind==='ipad',saved.id),'an agent sets the kind');
  check(await p.evaluate(id=>{try{agentMethods.update({id,fields:{deviceKind:'toaster'}});return false;}catch(e){return /deviceKind/.test(e.message);}},saved.id),'an unknown kind is refused');
  check(await p.evaluate(id=>agentMethods.get?agentMethods.get({id}).deviceKind==='ipad':true,saved.id),'and reads it back');
  check(!errors.length,errors.join(' | '));
  return 'PASS: the device form with kinds and a warranty date and no amount, kind saved, tile and inspector, this Mac a Mac, agent writes checked';
 } finally { await p.close(); }
}
