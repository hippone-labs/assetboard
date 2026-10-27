// 「为全部资产获取网站图标」 with a fake native bridge standing in for the vendor sites: no network, nothing saved to disk.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const setup=async({demo=false,scheme='light',locale='en-US'}={})=>{
  const context=await page.context().browser().newContext({colorScheme:scheme,locale});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({demo})=>{
   const canvasIcon=color=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,32,32);return c.toDataURL('image/png');};
   // A black mark on a transparent square, like DigitalOcean's or Render's own icons.
   const black=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle='#000';g.beginPath();g.arc(16,16,9,0,Math.PI*2);g.fill();return c.toDataURL('image/png');})();
   window.__sent=[];window.__failHost='';window.__inflight=0;window.__maxInflight=0;window.__hold=false;window.__held=[];
   const answer=m=>{window.__inflight--;const h=m.host;window.assetboardIconResult(h==='bandwagonhost.com'||h===window.__failHost?{requestId:m.requestId,ok:false,error:'没有在 bandwagonhost.com 找到可用的图标。有的网站会拒绝自动下载，可以在「编辑资料」里上传图标。'}:{requestId:m.requestId,ok:true,host:h,dataUrl:h==='digitalocean.com'?black:canvasIcon('#3a7')});};
   window.__release=()=>{const held=window.__held.splice(0);held.forEach(m=>setTimeout(()=>answer(m),5));};
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='iconFetch'){window.__inflight++;window.__maxInflight=Math.max(window.__maxInflight,window.__inflight);if(window.__hold)window.__held.push(m);else setTimeout(()=>answer(m),20+Math.random()*40);}
   }}}};
   const A=(id,type,name,provider,extra={})=>({id,type,name,provider,account:'',art:'generic',source:'manual',updatedAt:'2026-10-0'+(1+id.length%8)+'T00:00:00Z',...extra});
   window.__ASSETBOARD_NATIVE__={demo,data:{blocks:[{id:'domain',width:50,height:null},{id:'server',width:50,height:null},{id:'deployment',width:50,height:null}],assets:[
    A('d1','domain','secret-project.dev','Cloudflare',{url:'https://secret-project.dev'}),A('d2','domain','private-shop.cn','阿里云'),A('d3','domain','unknown-reg.org','某注册商'),
    A('p1','deployment','secret-pages','',{source:'cloudflare',externalId:'p1'}),
    A('s1','server','box-one','Vultr'),A('s2','server','box-two','Vultr'),A('s3','server','box-three','Hetzner',{siteIcon:black,siteIconHost:'hetzner.com'}),
    A('s4','server','box-four','DigitalOcean'),A('s5','server','box-five','搬瓦工'),A('s6','server','box-six','Linode',{hiddenAt:'2026-10-01T00:00:00Z'})]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
  },{demo});
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof iconBatchDialog==='function'&&document.querySelector('#board [data-asset]'));
  return {p,context,errors};
 };
 // Confirm step: vendor homepages only, nothing contacted yet.
 let {p,context,errors}=await setup();
 try {
  await p.evaluate(()=>iconBatchDialog());
  const listed=await p.locator('.icon-batch-hosts li strong').allTextContents();
  check(JSON.stringify(listed.sort())===JSON.stringify(['aliyun.com','bandwagonhost.com','cloudflare.com','digitalocean.com','hetzner.com','vultr.com']),'Confirm lists each platform once, those with icons too: '+listed);
  check(await p.locator('.icon-batch-hosts li[data-platform="hetzner.com"] .tile img').count()===1&&await p.locator('.icon-batch-hosts li[data-platform="vultr.com"] .tile img').count()===0&&await p.locator('.icon-batch-hosts li[data-platform="vultr.com"] .tile svg').count()===1,'A row shows the icon its assets have, the globe otherwise');
  check((await p.locator('.icon-batch-lead').textContent())==='7 项待获取','The lead counts the assets 开始 would change, in the UI language: '+await p.locator('.icon-batch-lead').textContent());
  // Bare icons: no tile background, border or shadow; favicon and globe the same size.
  const bare=await p.locator('.icon-batch-hosts .tile').evaluateAll(tiles=>tiles.map(t=>{const s=getComputedStyle(t),g=t.querySelector('img,svg').getBoundingClientRect();return [s.backgroundColor,s.boxShadow,s.borderTopWidth,Math.round(g.width),Math.round(g.height)].join(' ');}));
  check(bare.length===6&&bare.every(b=>b==='rgba(0, 0, 0, 0) none 0px 18 18'),'Row icons are bare and 18px: '+JSON.stringify(bare.filter(b=>b!=='rgba(0, 0, 0, 0) none 0px 18 18')));
  const text=await p.locator('#icon-batch').textContent();
  for(const name of ['secret-project','private-shop','secret-pages','box-one','unknown-reg'])check(!text.includes(name),'The confirm step must not show asset names: '+name);
  check(text.includes('1 项没有识别出平台')&&text.includes('1 项已有网站图标')&&text.includes('1 项已隐藏'),'Skipped assets are counted: '+text);
  check(await p.evaluate(()=>!__sent.some(m=>m.action==='iconFetch')),'Nothing is fetched before confirmation');
  // Cancel mid-run changes nothing.
  await p.evaluate(()=>{__hold=true;});
  await p.locator('[data-action="icon-batch-start"]').click();
  check(await p.locator('#icon-batch progress').count()===1,'A quiet progress bar shows while fetching');
  check(await p.evaluate(()=>__inflight)===3,'Three requests at a time');
  // Replies still arrive after stopping; wait until every one has been handled rather than a fixed time.
  await p.locator('[data-action="icon-batch-cancel"]').click();await p.evaluate(()=>{__hold=false;__release();});await until(p,()=>__inflight===0);
  check(await p.evaluate(()=>state.assets.filter(a=>a.siteIcon).length)===1,'Stopping keeps every asset as it was');
  check(await p.evaluate(()=>!iconBatch),'Stopping ends the run');

  // Full run: one request per vendor host, at most three in flight, failures reported, existing icon kept, one undo.
  await p.evaluate(()=>{__sent.length=0;__maxInflight=0;__inflight=0;iconBatchDialog();});
  await p.locator('[data-action="icon-batch-start"]').click();
  await p.locator('#icon-batch-done').waitFor();
  const fetched=await p.evaluate(()=>__sent.filter(m=>m.action==='iconFetch').map(m=>m.host).sort());
  check(JSON.stringify(fetched)===JSON.stringify(['aliyun.com','bandwagonhost.com','cloudflare.com','digitalocean.com','vultr.com']),'Each vendor is contacted exactly once: '+fetched);
  check(await p.evaluate(()=>__maxInflight)<=3,'Never more than three requests in flight');
  const result=await p.evaluate(()=>Object.fromEntries(state.assets.map(a=>[a.id,a.siteIconHost||''])));
  check(result.d1==='cloudflare.com'&&result.p1==='cloudflare.com'&&result.s1==='vultr.com'&&result.s2==='vultr.com'&&result.d2==='aliyun.com','Shared icons reach every asset of the vendor: '+JSON.stringify(result));
  check(result.s3==='hetzner.com'&&!result.d3&&!result.s5&&!result.s6,'Existing, unknown, failed and hidden assets are untouched');
  check((await p.locator('#icon-batch-done').textContent()).includes('bandwagonhost.com')&&(await p.locator('#icon-batch-done').textContent()).includes('官网没有可下载的图标'),'Failures are reported with a reason');
  check(await p.locator('#board [data-asset="s5"] .tile.type-art').count()===1&&await p.locator('#board [data-asset="s5"] .site-art').count()===0,'A failed vendor keeps the category icon');
  await p.locator('#icon-batch-done [data-action="icon-batch-cancel"]').click();
  await p.locator('#toast .toast-undo').click();
  check(await p.evaluate(()=>state.assets.filter(a=>a.siteIcon).map(a=>a.id).join())==='s3','One undo removes every icon from the run');
  await p.keyboard.press('Meta+Shift+z');await p.waitForTimeout(100);
  check(await p.evaluate(()=>state.assets.filter(a=>a.siteIcon).length)===7,'Redo brings them back');

  // A new asset of a known vendor reuses the icon already on this Mac; overwriting is opt-in and fetches fresh icons.
  await p.evaluate(()=>{state.assets.push({id:'s7',type:'server',name:'box-seven',provider:'Vultr',art:'generic',source:'manual',updatedAt:'2026-10-09T00:00:00Z'});render();__sent.length=0;iconBatchDialog();});
  const vultr=p.locator('.icon-batch-hosts li[data-platform="vultr.com"]');
  check(await vultr.locator('.tile img').count()===1&&(await vultr.locator('.chip').textContent())==='2/3'&&/2 项已有图标/.test(await vultr.locator('.chip').getAttribute('title')),'A row with some icons shows one and counts n/m: '+await vultr.locator('.chip').textContent());
  check((await p.locator('.icon-batch-hosts li[data-platform="bandwagonhost.com"] .icon-row-error').textContent()).includes('官网没有可下载的图标'),'The last failure stays in its row');
  check((await p.locator('.icon-batch-lead strong').textContent())==='2'&&(await p.locator('[data-action="icon-batch-start"]').textContent())==='开始','Known icons are reused, only the missing ones count');
  check(await p.locator('#icon-batch-overwrite').count()===1,'Overwriting is offered when icons exist');
  await p.locator('#icon-batch-overwrite').check();
  check((await p.locator('.icon-batch-lead strong').textContent())==='9'&&await p.locator('#icon-batch-overwrite').evaluate(e=>e===document.activeElement&&e.checked),'Overwrite counts every asset again and keeps focus on the switch');
  await p.locator('#icon-batch-overwrite').uncheck();
  // The switch (自动获取 lives in 设置): the box right before its words, on the left, the words on one line.
  const switches=await p.locator('#icon-batch .check-row').evaluateAll(rows=>rows.map(row=>{const box=row.querySelector('input').getBoundingClientRect(),words=row.querySelector('span').getBoundingClientRect(),list=document.querySelector('#icon-batch .icon-batch-hosts').getBoundingClientRect();return {gap:words.left-box.right,left:box.left-list.left,lines:Math.round(words.height/parseFloat(getComputedStyle(row).lineHeight))};}));
  check(switches.length===1&&switches.every(s=>s.gap>=4&&s.gap<=12&&Math.abs(s.left)<=4&&s.lines===1),'Switch words sit next to their boxes on one line: '+JSON.stringify(switches));
  await p.locator('#modal').evaluate(d=>d.close());
  check(await p.evaluate(()=>!__sent.some(m=>m.action==='iconFetch')),'Closing the confirm step fetches nothing');

  // One row on its own: fetched again, applied at once to every asset of the row, one undo; nothing else is asked.
  await p.evaluate(()=>{__sent.length=0;iconBatchDialog();});
  await p.locator('li[data-platform="vultr.com"] [data-action="icon-row-fetch"]').click();
  await until(p,()=>!iconRowRequests.size);
  check(await p.evaluate(()=>JSON.stringify(__sent.filter(m=>m.action==='iconFetch').map(m=>m.host)))==='["vultr.com"]','A row fetch asks its own platform once');
  check(await p.evaluate(()=>['s1','s2','s7'].every(id=>state.assets.find(a=>a.id===id).siteIconHost==='vultr.com')),'The row fetch reaches every asset of the row');
  check(await p.locator('li[data-platform="vultr.com"] .tile img').count()===1&&(await p.locator('li[data-platform="vultr.com"] .chip').textContent())==='3 项'&&await p.locator('#modal').evaluate(d=>d.open),'The row redraws in place, the dialog stays open');
  check(await p.locator('li[data-platform="vultr.com"] [data-action="icon-row-fetch"]').evaluate(b=>b===document.activeElement),'Focus stays on the row');
  // A failure is said in its row, nothing changes, no other dialog.
  await p.locator('li[data-platform="bandwagonhost.com"] [data-action="icon-row-fetch"]').click();
  await until(p,()=>!iconRowRequests.size);
  check((await p.locator('li[data-platform="bandwagonhost.com"] .icon-row-error').textContent()).includes('官网没有可下载的图标')&&await p.evaluate(()=>!state.assets.find(a=>a.id==='s5').siteIcon&&$('#modal-title').textContent==='获取网站图标'),'A failed row says why in place');

  // A site of the person's choosing: checked in place, Esc closes only the field, a good one is fetched, kept and used later.
  const edit=async host=>{await p.locator(`li[data-platform="${host}"] [data-action="icon-site-edit"]`).click();return p.locator(`li[data-platform="${host}"] .icon-site-form input`);};
  let field=await edit('bandwagonhost.com');
  check(await field.evaluate(e=>e===document.activeElement),'The site field takes focus');
  await field.fill('192.168.1.1');await field.press('Enter');
  field=p.locator('li[data-platform="bandwagonhost.com"] .icon-site-form input');
  check(await field.getAttribute('aria-invalid')==='true'&&(await p.locator('#icon-site-error').textContent()).includes('不接受 IP')&&await field.evaluate(e=>e===document.activeElement&&e.value==='192.168.1.1'),'An unusable site is refused in place, the text kept');
  check(await p.evaluate(()=>!__sent.some(m=>m.action==='iconFetch'&&m.host==='192.168.1.1')),'A refused site is never asked');
  await field.press('Escape');
  check(await p.locator('#modal').evaluate(d=>d.open)&&await p.locator('.icon-site-form').count()===0&&await p.locator('li[data-platform="bandwagonhost.com"] [data-action="icon-site-edit"]').evaluate(b=>b===document.activeElement),'Esc closes the field, not the dialog');
  field=await edit('bandwagonhost.com');await field.fill('https://www.bwh.example.com/start');await field.press('Enter');
  await until(p,()=>!iconRowRequests.size);
  check(await p.evaluate(()=>__sent.filter(m=>m.action==='iconFetch').map(m=>m.host).at(-1))==='www.bwh.example.com','The named site is asked, not the default');
  check(await p.evaluate(()=>state.iconSites?.['bandwagonhost.com']==='www.bwh.example.com'&&state.assets.find(a=>a.id==='s5').siteIconHost==='www.bwh.example.com'),'The site is kept for the platform and its asset gets the icon');
  check((await p.locator('li[data-platform="bandwagonhost.com"] .icon-row-note').textContent()).includes('www.bwh.example.com')&&await p.locator('li[data-platform="bandwagonhost.com"] .icon-row-error').count()===0,'The row names the site and drops the old failure');
  // A failing named site: said under the field, nothing kept.
  field=await edit('digitalocean.com');await field.fill('do.example.org');
  await p.evaluate(()=>{__failHost='do.example.org';});await field.press('Enter');
  await until(p,()=>!iconRowRequests.size);
  check(await p.locator('li[data-platform="digitalocean.com"] .icon-site-form input').inputValue()==='do.example.org'&&(await p.locator('#icon-site-error').textContent()).includes('官网没有可下载的图标')&&await p.evaluate(()=>!state.iconSites['digitalocean.com']),'A named site that fails is not kept and says why under the field');
  await p.locator('li[data-platform="digitalocean.com"] [data-action="icon-site-cancel"]').click();
  // 新添加的资产 of that platform reuse the icon from its named site; a platform with a named site but no icon yet asks that site.
  await p.locator('#modal').evaluate(d=>d.close());
  await p.evaluate(()=>{__sent.length=0;state.iconSites['linode.com']='www.linode.example.com';state.assets.push({id:'s8',type:'server',name:'box-eight',provider:'搬瓦工',art:'generic',source:'manual'},{id:'s9',type:'server',name:'box-nine',provider:'Linode',art:'generic',source:'manual'});save();render();});
  await until(p,()=>state.assets.find(a=>a.id==='s9').siteIcon);
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='s8').siteIconHost==='www.bwh.example.com'&&JSON.stringify(__sent.filter(m=>m.action==='iconFetch').map(m=>m.host))==='["www.linode.example.com"]'),'Automatic icons use the named site: '+await p.evaluate(()=>JSON.stringify(__sent.filter(m=>m.action==='iconFetch').map(m=>m.host))));
  // Clearing goes back to the platform's own site, undoably.
  await p.evaluate(()=>iconBatchDialog());
  field=await edit('bandwagonhost.com');
  check(await field.inputValue()==='www.bwh.example.com','The field shows the site in use');
  await p.locator('li[data-platform="bandwagonhost.com"] [data-action="icon-site-clear"]').click();
  check(await p.evaluate(()=>!('bandwagonhost.com' in (state.iconSites||{})))&&await p.locator('li[data-platform="bandwagonhost.com"] .icon-row-note').count()===0,'Clearing restores the default site');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.iconSites?.['bandwagonhost.com']==='www.bwh.example.com'),'Clearing can be undone');
  // Narrow window: the dialog with an open field does not scroll sideways.
  await p.evaluate(()=>{$('#modal').close();iconBatchDialog();});await p.setViewportSize({width:390,height:800});
  await edit('cloudflare.com');
  check(await p.evaluate(()=>{const c=$('#modal-content'),d=$('#modal');return c.scrollWidth<=c.clientWidth+1&&d.getBoundingClientRect().right<=innerWidth;}),'No sideways overflow at 390px');
  await p.setViewportSize({width:1400,height:900});
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 // Dark mode: a black mark on transparency gets a light backing.
 ({p,context,errors}=await setup({scheme:'dark'}));
 try {
  await until(p,()=>document.querySelector('#board [data-asset="s3"] .tile.mark-dark'));
  check(await p.locator('#board [data-asset="s3"] .tile').evaluate(e=>{const c=getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number);return c[0]>200&&c[1]>200&&c[2]>200;}),'The backing is light in dark mode');
 } finally { await context.close(); }

 // Demo mode: the batch never opens and nothing is fetched.
 ({p,context,errors}=await setup({demo:true,locale:'en-US'}));
 try {
  await p.evaluate(()=>iconBatchDialog());
  check(await p.evaluate(()=>document.querySelector('#modal').open&&!!document.querySelector('#icon-batch .icon-batch-hosts')),'Demo mode opens the dialog, for screenshots');
  check(await p.evaluate(()=>navigator.language)==='en-US'&&(await p.locator('.icon-batch-lead').textContent())==='4 项待获取','A Chinese UI in an en-US browser still reads 4 项待获取: '+await p.locator('.icon-batch-lead').textContent());
  const demoRows=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#icon-batch li[data-platform]')].map(li=>[li.dataset.platform,[li.querySelector('.tile img')?'icon':'globe',li.querySelector('.icon-row-error,.icon-row-note')?.textContent||'',li.querySelector('.chip').textContent]])));
  check(demoRows['github.com']?.[0]==='icon'&&demoRows['hetzner.com']?.[0]==='icon'&&demoRows['hetzner.com'][1]==='hetzner.example.com'&&demoRows['vultr.com']?.[0]==='globe'&&demoRows['vultr.com'][1].includes('官网没有可下载的图标')&&demoRows['cloudflare.com']?.[0]==='globe'&&demoRows['namecheap.com']?.[2]==='1/2','The demo shows fetched, named-site, failed, missing and partial rows: '+JSON.stringify(demoRows));
  await p.locator('li[data-platform="vultr.com"] [data-action="icon-row-fetch"]').click();
  await until(p,()=>!iconRowRequests.size);
  check(await p.evaluate(()=>!!state.assets.find(a=>a.id==='demo-s1').siteIcon&&!__sent.some(m=>m.action==='iconFetch'||m.action==='save')),'Demo mode answers with a built-in mark and sends nothing, not even a save');
 } finally { await context.close(); }
 return 'PASS: every platform listed with its current icon (globe when none, n/m when partial), no fetch before confirm, row fetch and in-row failure, named site checked in place (Esc, failure, kept, auto icons use it, clear and undo), switch layout, 390px, 3 in flight, stop keeps data, one request per vendor shared by its assets, existing/unknown/hidden untouched, failure reasons, category fallback, one undo and redo, opt-in overwrite with local reuse, dark backing, demo opens without network';
}
