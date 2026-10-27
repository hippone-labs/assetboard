// Run with the browser tool's filename option. Privacy mode: the eye in the bar masks names, accounts and IPs in rows, tooltips, the inspector and the panorama, is remembered, and never changes records; search still finds by the real name.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof setPrivacy==='function');
  await p.evaluate(()=>{localStorage.clear();state={blocks:[],assets:[
   {id:'d',type:'domain',name:'secret-project.dev',provider:'Cloudflare',account:'me@corp.com',source:'manual',art:'generic'},
   {id:'s',type:'server',name:'tokyo-box',provider:'Vultr',ips:['203.0.113.42'],source:'manual',art:'generic'},
   {id:'r',type:'repository',name:'acme/internal-tool',provider:'GitHub',account:'acme',source:'github',externalId:'1',art:'generic'}
  ],deletedExternalIds:[]};save=()=>{};render();});
  const board=()=>p.locator('#board').innerText();
  check((await board()).includes('secret-project.dev')&&(await board()).includes('203.0.113.42'),'Plain by default');

  await p.click('#privacy-toggle');
  const masked=await board();
  check(!masked.includes('secret-project')&&masked.includes('s••••••.dev')&&!masked.includes('203.0.113.42')&&!masked.includes('internal-tool')&&!masked.includes('me@corp.com'),'Names, IPs and accounts are masked: '+masked.slice(0,300));
  const leaks=await p.evaluate(()=>[...document.querySelectorAll('#board [title],#board [aria-label]')].map(n=>n.title+' / '+n.getAttribute('aria-label')).filter(t=>/secret-project|tokyo-box|203\.0\.113|internal-tool/.test(t)));check(!leaks.length,'Tooltips and labels are masked too: '+leaks.join(' | '));
  check(await p.evaluate(()=>$('#privacy-toggle').getAttribute('aria-pressed')==='true'&&JSON.parse(localStorage.getItem('assetboard-view-v1')).privacy===true),'The eye is pressed and remembered');
  await p.evaluate(()=>showDetail('s'));
  const detail=await p.locator('#detail').innerText();
  check(!detail.includes('tokyo-box')&&!detail.includes('203.0.113.42'),'The inspector is masked: '+detail.slice(0,200));
  check(await p.evaluate(()=>document.querySelector('#detail .ip-pill').dataset.ip==='203.0.113.42'),'Copy still gives the real address');
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='d').name==='secret-project.dev'),'Records are untouched');
  await p.fill('#search','secret');
  check(await p.locator('#board [data-asset="d"]').count()===1,'Search finds by the real name');
  await p.fill('#search','');
  await p.evaluate(()=>{closeDetail();panoramaOpen(true);});
  check(!(await p.locator('#panorama').innerText()).includes('203.0.113.42')&&!(await p.locator('#panorama').innerText()).includes('tokyo-box'),'The panorama is masked');
  await p.evaluate(()=>panoramaOpen(false));
  await p.click('#privacy-toggle');
  check((await board()).includes('secret-project.dev'),'Turning it off shows everything again');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: plain by default, names/IPs/accounts masked in rows, tooltips, inspector and panorama, remembered, copy and search use real values, records untouched, off again';
}
