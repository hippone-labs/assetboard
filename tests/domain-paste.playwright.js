// Run with the browser tool's filename option. A pasted domain or web address becomes a domain record whose expiry date and registrar
// come from the registry (RDAP through the Mac app, answered here by a fake host); a pasted list of domains becomes a record each and
// is filled one by one; only empty fields are filled. The browser version and the demo say they do not ask. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  const rdap=(date,registrar,status=['active'])=>({events:[{eventAction:'expiration',eventDate:`${date}T00:00:00Z`}],status,nameservers:[{ldhName:'NS1.EXAMPLE.NET'}],entities:[{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text',registrar]]]}]});
  const answers={'example.com':{ok:true,json:rdap('2027-03-01','NameCheap, Inc.')},'example.net':{ok:true,json:rdap('2028-01-15','Porkbun LLC')},'example.org':{ok:false,error:'注册局查不到这个域名'}};
  window.__asked=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(m){
   if(m?.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m?.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m?.action!=='rdap')return;window.__asked.push(m.domain);setTimeout(()=>window.assetboardRdap({requestId:m.requestId,...answers[m.domain]}),5);}}}};
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'domain'}],assets:[]}};
 };
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof rdapFormFill==='function');
  await p.evaluate(()=>{save=()=>{};rdapFillGapMs=5;});
  const val=n=>p.locator(`#asset-form [name="${n}"]`).inputValue();
  // A web address pasted into 添加资产: the domain form, asked of the registry at once, filled where empty.
  await p.evaluate(()=>captureDialog());
  await p.fill('#capture-text','https://www.example.com/pricing');await p.press('#capture-text','Enter');await p.waitForSelector('#asset-form');
  check(await val('name')==='example.com'&&await val('type')==='domain','The address becomes the domain record example.com');
  await until(p,()=>document.querySelector('#asset-form [name="date"]')?.value==='2027-03-01');
  check(await p.evaluate(()=>JSON.stringify(window.__asked))==='["example.com"]','One lookup, for the domain: '+await p.evaluate(()=>window.__asked));
  check(await val('provider')==='Namecheap','The registrar fills the empty registrar field: '+await val('provider'));
  check(await p.locator('[data-choice="dateKind"][data-value="expire"]').getAttribute('aria-pressed')==='true'||await p.locator('[data-choice="dateKind"][data-value="expire"]').getAttribute('aria-checked')==='true','The date is an expiry date');
  const status=await p.locator('#rdap-fill-status').innerText();
  check(status.includes('2027-03-01')&&status.includes('Namecheap'),'The form says what the registry read: '+status);
  await p.click('#asset-form [type="submit"]');await p.waitForTimeout(150);
  const saved=await p.evaluate(()=>state.assets.find(a=>a.name==='example.com'));
  check(saved?.date==='2027-03-01'&&saved.provider==='Namecheap'&&saved.registryRegistrar==='NameCheap, Inc.'&&saved.registryCheckedAt&&saved.registryNS?.[0]==='ns1.example.net'&&!saved.registryExpires,'The saved record keeps the check: '+JSON.stringify(saved));

  // A typed date and registrar stay; a registry date that differs is only named, and waits on the record.
  await p.evaluate(()=>assetForm('domain'));
  await p.fill('#asset-form [name="name"]','example.net');await p.fill('#asset-form [name="provider"]','My Registrar');await p.fill('#asset-form [name="date"]','2027-12-01');
  await p.click('#asset-form [data-action="rdap-fill"]');
  await until(p,()=>/2028-01-15/.test(document.querySelector('#rdap-fill-status')?.textContent||''));
  check(await val('date')==='2027-12-01'&&await val('provider')==='My Registrar','Typed values are never replaced');
  check((await p.locator('#rdap-fill-status').innerText()).includes('和填写的日期不同'),'The difference is named');
  await p.click('#asset-form [type="submit"]');await p.waitForTimeout(150);
  const typed=await p.evaluate(()=>state.assets.find(a=>a.name==='example.net'));
  check(typed.date==='2027-12-01'&&typed.registryExpires==='2028-01-15','The registry date waits in the detail: '+JSON.stringify(typed));

  // A lookup that fails says so and fills nothing; a name that is not a domain asks nothing.
  await p.evaluate(()=>assetForm('domain'));await p.fill('#asset-form [name="name"]','example.org');await p.click('#asset-form [data-action="rdap-fill"]');
  await until(p,()=>/没有查到/.test(document.querySelector('#rdap-fill-status')?.textContent||''));
  check(await val('date')==='','A failed lookup fills nothing');
  const before=await p.evaluate(()=>window.__asked.length);
  await p.fill('#asset-form [name="name"]','not a domain');await p.click('#asset-form [data-action="rdap-fill"]');
  check(await p.evaluate(n=>window.__asked.length===n,before)&&(await p.locator('#rdap-fill-status').innerText()).includes('不是域名'),'Nothing is asked for a name that is not a domain');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});

  // An edit form has no fill button (the ⋯ menu's 核对注册局日期 is there); other categories neither.
  check(await p.evaluate(()=>{assetForm('domain',state.assets[0].id);const edit=!!document.querySelector('#asset-form [data-action="rdap-fill"]');assetFormSnapshot=null;assetForm('server');const server=!!document.querySelector('#asset-form [data-action="rdap-fill"]');assetFormSnapshot=null;$('#modal').close();return !edit&&!server;}),'Only a new domain form offers the fill');

  // One domain pasted on the board (⌘V path): the same form.
  await p.evaluate(()=>routeImportText('www.example.com'));await p.waitForSelector('#asset-form');
  check(await val('name')==='example.com'&&await val('type')==='domain','A pasted domain opens the domain form');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();state.assets=[];window.__asked=[];});

  // A pasted list: a record each, then the registry fills them one after another; a failure waits.
  await p.evaluate(()=>routeImportText('example.com\nhttps://example.net/shop\nexample.org'));
  await until(p,()=>state.assets.length===3&&!rdapFillBusy&&!rdapFillQueue.length&&window.__asked.length===3);
  const list=await p.evaluate(()=>Object.fromEntries(state.assets.map(a=>[a.name,{date:a.date,provider:a.provider,checked:!!a.registryCheckedAt,tried:!!a.registryTriedAt,type:a.type,source:a.source}])));
  check(list['example.com'].date==='2027-03-01'&&list['example.com'].provider==='Namecheap'&&list['example.com'].checked,'example.com filled: '+JSON.stringify(list));
  check(list['example.net'].date==='2028-01-15'&&list['example.net'].provider==='Porkbun','example.net filled: '+JSON.stringify(list));
  check(list['example.org'].date===''&&list['example.org'].tried&&!list['example.org'].checked,'A failed lookup leaves the record undated and waits: '+JSON.stringify(list));
  check(Object.values(list).every(a=>a.type==='domain'&&a.source==='csv'),'All are domain records from the import');
  check((await p.evaluate(()=>sourceLabel(state.assets[0]))).includes('粘贴的域名'),'The source names the pasted list');
  // Pasting the same list again adds nothing and asks nothing.
  await p.evaluate(()=>{window.__asked=[];routeImportText('example.com\nexample.net');});await p.waitForTimeout(200);
  check(await p.evaluate(()=>state.assets.length===3&&window.__asked.length===0),'The same list again adds and asks nothing');
 } finally { await p.close(); }

 // The browser: no registry lookup, and the form and the list import say why.
 const b=await page.context().newPage();
 try{
  await b.goto('http://127.0.0.1:4317/');await until(b,()=>typeof captureDialog==='function');
  await b.evaluate(()=>{localStorage.clear();state={blocks:[],assets:[],deletedExternalIds:[]};save=()=>{};render();captureDialog();});
  await b.fill('#capture-text','example.com');await b.press('#capture-text','Enter');await b.waitForSelector('#asset-form');
  const note=await b.locator('#asset-form .rdap-fill-note').innerText();
  check(note.includes('Mac App')&&note.includes('网络记录')&&!await b.locator('#asset-form [data-action="rdap-fill"]').count(),'The browser form explains the missing lookup: '+note);
  await b.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();routeImportText('example.com\nexample.net');});
  await until(b,()=>state.assets.length===2);
  check((await b.locator('#toast').innerText()).includes('Mac App'),'The list import says where the dates come from');
 } finally { await b.close(); }
 // The demo asks nothing either.
 const d=await page.context().newPage();
 try{
  await d.goto('http://127.0.0.1:4317/?demo');await until(d,()=>typeof assetForm==='function');
  check((await d.evaluate(()=>{assetForm('domain');return document.querySelector('#asset-form .rdap-fill-note')?.textContent||'';})).includes('演示'),'The demo form says it does not ask');
 } finally { await d.close(); }
 return 'ok';
}
