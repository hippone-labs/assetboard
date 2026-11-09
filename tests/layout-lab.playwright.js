// Run with the browser tool's filename option. Uses an isolated page and never saves.
// Layout lab (layout-lab.js): without ?lab the list is the list; with it a bar switches between the list and the three prototypes,
// each listing every live record once and opening the inspector from a record.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  const seed=()=>{localStorage.removeItem('assetboard-view-v1');save=()=>{};history.length=0;const day=offset=>isoDay(localDay()+offset);
   state={blocks:[{id:'domain'},{id:'server'},{id:'repository'}],assets:[
    {id:'d1',type:'domain',name:'soon.example.com',provider:'Cloudflare',account:'ops.team.long-mailbox@example.com',date:day(12),dateKind:'expire',cycle:'yearly',cost:'$12 / 年',source:'manual'},
    {id:'d2',type:'domain',name:'late.example.net',provider:'Cloudflare',date:day(-3),dateKind:'expire',source:'manual'},
    {id:'s1',type:'server',name:'edge-vps',provider:'Host',ips:['203.0.113.10'],host:'203.0.113.10',date:day(5),dateKind:'renew',cycle:'monthly',cost:'$6 / 月',source:'manual'},
    {id:'r1',type:'repository',name:'atlas-ui',provider:'GitHub',source:'manual'},
    {id:'h1',type:'domain',name:'gone.example.org',provider:'Registrar',hiddenAt:'2026-01-01T00:00:00Z',source:'manual'}
   ]};setView('all');setLayout('list');render();};
  await p.goto('http://127.0.0.1:4317/');await p.evaluate(seed);
  check(!(await p.locator('#board .lab-bar').count())&&await p.locator('#board .row').count()===4,'Without ?lab the list is drawn as it is');
  for(const [lab,item] of [['wall','.lab-line'],['track','.lab-row'],['accounts','.lab-line']]){
   await p.goto(`http://127.0.0.1:4317/?lab=${lab}`);await p.evaluate(seed);
   check(await p.locator('#board .lab-bar .lab-pick.on').getAttribute('href').then(h=>h.includes('lab='+lab)),lab+': the bar marks the chosen layout');
   check(await p.locator('#board .overview').count()===1&&!(await p.locator('#board .row').count()),lab+': the overview stays, the list rows go');
   const ids=await p.locator(`#board ${item}`).evaluateAll(els=>els.map(e=>e.dataset.asset).sort().join(','));
   check(ids==='d1,d2,r1,s1',lab+': every live record once, the hidden one left out: '+ids);
   await p.locator(`#board ${item}[data-asset="d1"]`).click();
   check(await p.evaluate(()=>activeAsset==='d1'&&!$('#detail').hidden),lab+': a record opens the inspector');
  }
  // By account: one Cloudflare card, its account written out whole.
  await p.goto('http://127.0.0.1:4317/?lab=accounts');await p.evaluate(seed);
  check((await p.locator('#board .lab-card[aria-label="Cloudflare"] .lab-line').count())===2&&(await p.locator('#board .lab-card[aria-label="Cloudflare"] .lab-account').innerText())==='ops.team.long-mailbox@example.com','A provider is one card with its account in full');
  // A search, another view or another layout is not the lab's.
  await p.evaluate(()=>{setLayout('grid');});
  check(!(await p.locator('#board .lab-card').count())&&await p.locator('#board .gcard').count()>0,'The grid is the grid under ?lab');
  if(errors.length)throw new Error(errors.join(' | '));
  return 'PASS: layout lab off by default; wall, track and accounts list every live record and open the inspector';
 } finally { await p.close(); }
}
