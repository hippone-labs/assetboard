// Run with the browser tool's filename option. 平台状态 (part of 实时状态), against a stubbed Mac app: with 实时状态 on, a connected
// Supabase source is read on launch and its paused project shows on the matching database as one red line, counts in the 实时 tile
// and has a detail row; each source's reading interval is the person's; a Vercel token (which cannot be read-only) is kept only
// after a confirmation, and declining sends nothing; tokens and readings never reach the board; the demo shows made-up states and
// asks the app for nothing.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg)=>{for(let i=0;i<150;i++){if(await p.evaluate(fn,arg))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+String(fn).slice(0,90));};
 const browser=page.context().browser();
 const open=async(init)=>{const context=await browser.newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(init);await p.goto('http://127.0.0.1:4317/');return {context,p,errors};};
 const mac=await open(()=>{
  try{localStorage.setItem('assetboard-features-v1',JSON.stringify({probe:true}));}catch{}
  window.__sent=[];
  let sources=[{id:'s1',kind:'supabase',name:'',interval:300,wide:false,hasToken:true}];
  const items={s1:[{id:'abcdefghijklmnopqrst',name:'notes-db',kind:'project',state:'INACTIVE',region:'us-east-1'}],v1:[{id:'prj_123456',name:'notes-site',kind:'project',state:'READY'}]};
  const reply=r=>setTimeout(()=>window.assetboardPlatform?.(r),5);
  window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));
   if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(m.action==='platformRead'){reply({source:m.id,loading:true});reply({source:m.id,items:items[m.id]||[],at:Date.now()});}
   if(m.action==='platformSave'){
    const wide=m.kind!=='upstash'&&!(m.kind==='supabase'&&String(m.secret||'sbp_fc').startsWith('sbp_fc'));
    if(m.secret&&wide&&!m.wide){reply({error:'这个令牌权限大，要先确认',needsConfirm:true});return;}
    const id=m.id||(m.kind==='vercel'?'v1':'x'+sources.length);
    sources=[...sources.filter(s=>s.id!==id),{id,kind:m.kind,name:m.name||'',interval:m.interval||300,wide:!!m.wide,hasToken:true}];
    reply({sources,saved:id});if(m.secret)window.assetboardPlatform&&setTimeout(()=>{window.__sent.push({action:'platformRead',id,fromSave:true});reply({source:id,items:items[id]||[],at:Date.now()});},10);
   }
  }}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:{blocks:[{id:'database',folded:false},{id:'deployment',folded:false}],assets:[
   {id:'db',type:'database',name:'Notes database',provider:'Supabase',source:'manual',url:'https://supabase.com/dashboard/project/abcdefghijklmnopqrst'},
   {id:'site',type:'deployment',name:'notes-site',provider:'Vercel',source:'manual'}]},
   cloudflareConnected:false,githubConnected:false,probeSources:[],sshProbe:{enabled:[],interval:60},platformSources:[{id:'s1',kind:'supabase',name:'',interval:300,wide:false,hasToken:true}]};
 });
 const {p}=mac;
 try{
  await until(p,()=>!!document.querySelector('[data-platform-row="db"] .live-text'));
  const row=await p.evaluate(()=>{const el=document.querySelector('[data-platform-row="db"]');return {text:el.querySelector('.live-text').textContent,cls:el.className,label:el.getAttribute('aria-label')};});
  check(row.text==='已暂停'&&/\bred\b/.test(row.cls)&&/Supabase：已暂停/.test(row.label),'the paused project is one red line on its record: '+JSON.stringify(row));
  check(await p.evaluate(()=>window.__sent.filter(m=>m.action==='platformRead'&&m.id==='s1').length===1),'read once on launch');
  check(await p.evaluate(()=>!document.querySelector('[data-platform-row="site"]')),'nothing on a record no source covers');
  const tile=await p.evaluate(()=>{const t=[...document.querySelectorAll('.overview .ov-tile')].find(x=>x.querySelector('.ov-label').textContent==='实时');return t?{value:t.querySelector('.ov-value').textContent,note:t.querySelector('.ov-note').textContent,cls:t.className}:null;});
  check(tile&&tile.value==='0 / 1'&&/1 离线/.test(tile.note)&&/overdue/.test(tile.cls),'the 实时 tile counts it: '+JSON.stringify(tile));
  const fact=await p.evaluate(()=>{showDetail('db');return document.querySelector('#detail-content [data-platform-detail="db"]')?.textContent||'';});
  check(/平台状态/.test(fact)&&/已暂停/.test(fact),'the detail has a 平台状态 row: '+fact);
  // The interval is the source's own.
  await p.evaluate(()=>platformDialog());
  check(await p.evaluate(()=>document.querySelector('#modal').dataset.view==='platform'&&!!document.querySelector('.platform-interval[data-id="s1"]')),'the dialog lists the source with its interval');
  await p.evaluate(()=>{const box=document.querySelector('.platform-interval[data-id="s1"]');box.querySelector('.live-unit').value='60';const n=box.querySelector('.live-every');n.value='10';n.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(p,()=>window.__sent.some(m=>m.action==='platformSave'&&m.id==='s1'&&m.interval===600&&!m.secret));
  const tooOften=await p.evaluate(()=>{const box=document.querySelector('.platform-interval[data-id="s1"]');box.querySelector('.live-unit').value='1';const n=box.querySelector('.live-every');n.value='20';n.dispatchEvent(new Event('change',{bubbles:true}));return n.validationMessage;});
  check(!!tooOften&&await p.evaluate(()=>!window.__sent.some(m=>m.action==='platformSave'&&m.interval===20)),'20 seconds is refused for a platform: '+tooOften);
  // Vercel: no read-only token, so it is said first. Declining sends nothing.
  await p.evaluate(()=>{platformDialog();document.querySelector('.platform-add').open=true;document.querySelector('#platform-form [data-choice="platformKind"][data-value="vercel"]').click();});
  await until(p,()=>/没有只读令牌/.test(document.querySelector('#platform-help')?.textContent||''));
  await p.fill('#platform-secret','vcp_faketoken123');
  await p.evaluate(()=>document.querySelector('#platform-form [type="submit"]').click());
  await until(p,()=>document.querySelector('#modal').dataset.view==='confirm');
  const said=await p.evaluate(()=>document.querySelector('#modal-content').textContent);
  check(/不能只读/.test(said)&&/钥匙串/.test(said),'the confirmation says what the token can do: '+said);
  await p.evaluate(()=>document.querySelector('#confirm-no').click());
  await until(p,()=>document.querySelector('#modal').dataset.view==='platform');
  check(await p.evaluate(()=>!window.__sent.some(m=>m.action==='platformSave'&&m.kind==='vercel')),'declining sends nothing');
  // Again, and connect anyway: the source is kept as 权限大 and its project shows on the deployment.
  check(await p.evaluate(()=>document.querySelector('.platform-add').open),'after the confirmation the form is open again');
  await p.evaluate(()=>document.querySelector('#platform-form [data-choice="platformKind"][data-value="vercel"]').click());
  await p.fill('#platform-secret','vcp_faketoken123');
  await p.evaluate(()=>document.querySelector('#platform-form [type="submit"]').click());
  await until(p,()=>document.querySelector('#modal').dataset.view==='confirm');
  await p.evaluate(()=>document.querySelector('#confirm-yes').click());
  await until(p,()=>window.__sent.some(m=>m.action==='platformSave'&&m.kind==='vercel'&&m.wide===true&&m.secret==='vcp_faketoken123'));
  await until(p,()=>/已上线/.test(document.querySelector('[data-platform-row="site"] .live-text')?.textContent||''));
  check(await p.evaluate(()=>/权限大/.test(document.querySelector('.platform-sources [data-source="v1"]')?.textContent||'')),'a broad token is marked 权限大 in the list');
  check(await p.evaluate(()=>!document.querySelector('#platform-secret').value),'the token field is emptied');
  // A hand link: undoable, kept on the record; the token and readings never reach the board.
  await p.evaluate(()=>{document.querySelector('#modal').close();showDetail('site');document.querySelector('[data-action="platform-unlink"][data-id="site"]').click();});
  await until(p,()=>!document.querySelector('[data-platform-row="site"]'));
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='site').platformLink?.none===true),'unlinking keeps the record out');
  await p.evaluate(()=>undo());
  await until(p,()=>!!document.querySelector('[data-platform-row="site"]'));
  const saved=await p.evaluate(()=>window.__sent.filter(m=>m.action==='save').map(m=>JSON.stringify(m)).join('\n'));
  check(saved&&!/vcp_|sbp_|INACTIVE|READY|已暂停|已上线/.test(saved),'tokens and readings never reach the board');
  check(await p.evaluate(()=>window.__sent.every(m=>!/^platform/.test(m.action)||['platformList','platformSave','platformRemove','platformRead'].includes(m.action))),'only platform messages');
  check(!mac.errors.length,'page errors: '+mac.errors.join(' | '));
 }finally{await mac.context.close();}

 // The demo reads no platform.
 const demo=await open(()=>{window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent=(window.__sent||[]).concat(m.action);if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:null,demo:true,cloudflareConnected:false,githubConnected:false,probeSources:[]};});
 try{
  await until(demo.p,()=>document.querySelectorAll('[data-platform-row] .live-text').length>=3);
  const lines=await demo.p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-platform-row]')].map(el=>[el.dataset.platformRow,el.querySelector('.live-text').textContent])));
  check(lines['demo-p1']==='已上线'&&lines['demo-p2']==='部署失败'&&lines['demo-db2']==='已暂停','the demo shows made-up platform states: '+JSON.stringify(lines));
  check(await demo.p.evaluate(()=>!(window.__sent||[]).some(a=>/^platform/.test(a))),'the demo asks the app for nothing');
  await demo.p.evaluate(()=>{platformDialog();document.querySelector('.platform-add').open=true;document.querySelector('#platform-secret').value='sbp_fcdemo';document.querySelector('#platform-form [type="submit"]').click();});
  check(await demo.p.evaluate(()=>/演示模式/.test(document.querySelector('#platform-status').textContent)&&platform.sources.length===3),'connecting is refused in the demo');
  check(!demo.errors.length,'demo page errors: '+demo.errors.join(' | '));
 }finally{await demo.context.close();}
 return 'PASS: a paused Supabase project as one red line, the 实时 tile, the detail row; a source\'s own interval; a Vercel token kept only after confirming (declining sends nothing), marked 权限大; links undo; nothing reaches the board; the demo shows made-up states and asks for nothing';
}
