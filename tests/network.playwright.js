// v13 A: a server's addresses. Source column of the row (second line when narrow), copy pills in the detail, form validation, search by address.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof render==='function');await p.waitForTimeout(300);
  const card=id=>`#board [data-asset="${id}"]`;
  const line=await p.evaluate(()=>{const sub=document.querySelector('#board [data-asset="demo-s1"] .ip-sub'),r=sub.getBoundingClientRect();return {text:sub.textContent.trim(),h:r.height,more:sub.querySelector('.ip-more')?.textContent,prov:sub.querySelector('.ip-prov')?.textContent,tabular:getComputedStyle(sub).fontVariantNumeric};});
  check(/^203\.0\.113\.10\s*\+v6\s*·\s*Vultr$/.test(line.text.replace(/\s+/g,' ')),'Public v4 first, +v6 marker, provider last: '+line.text);
  check(line.h<18,'The address line never wraps: '+line.h);check(/tabular/.test(line.tabular),'Digits are tabular');
  const nas=await p.evaluate(()=>{const sub=document.querySelector('#board [data-asset="demo-s3"] .ip-sub');return {text:sub.textContent.trim(),inner:!!sub.querySelector('.ip-inner'),title:sub.querySelector('.ip-inner')?.title};});
  check(nas.inner&&/192\.168\.1\.20/.test(nas.text)&&nas.title==='内网地址','Inner addresses carry a named 内 mark: '+JSON.stringify(nas));
  // No address, no line: a server without any keeps the provider text.
  await p.evaluate(()=>{state.assets.push({id:'bare',type:'server',name:'bare-vps',provider:'Linode',updatedAt:new Date().toISOString(),source:'manual'});render();});
  check(await p.evaluate(()=>!document.querySelector('#board [data-asset="bare"] .ip-sub')&&/Linode/.test(document.querySelector('#board [data-asset="bare"] .r-sub')?.textContent||'')),'Server without an address keeps the provider line');
  // Quick action copies the address and is named.
  const quick=await p.evaluate(()=>[...document.querySelectorAll('#board [data-asset="demo-s1"] .quick-action')].map(b=>b.getAttribute('aria-label')+'|'+b.title));
  check(quick.some(q=>q==='复制 IP · tokyo-vps|复制 IP'),'Row offers a named copy-IP action: '+quick.join());
  await p.evaluate(()=>{window.__copied=[];navigator.clipboard.writeText=async t=>{window.__copied.push(t);};});
  await p.evaluate(()=>document.querySelector('#board [data-asset="demo-s1"] [data-quick="copy-ip"]').click());await p.waitForTimeout(150);
  check(await p.evaluate(()=>window.__copied[0]==='203.0.113.10'&&/已复制 IP/.test(document.querySelector('#toast').textContent)),'Copy action puts the address on the clipboard');
  // Detail: one pill per address, each copies its own address.
  await p.click('#board [data-asset="demo-s1"] .item-open');await p.waitForSelector('#detail:not([hidden])');
  const pills=await p.evaluate(()=>[...document.querySelectorAll('#detail .ip-pill')].map(b=>b.textContent.trim()+'|'+b.getAttribute('aria-label')));
  check(pills.length===2&&pills[1]==='2001:db8::10|复制 IP 2001:db8::10','Detail lists every address as a copy pill: '+pills.join());
  await p.click('#detail .ip-pill >> nth=1');await p.waitForTimeout(150);
  check(await p.evaluate(()=>window.__copied.at(-1)==='2001:db8::10'&&/已复制 IP/.test(document.querySelector('#toast').textContent)),'Pill copies its own address');
  // Search finds a server by address.
  await p.evaluate(()=>closeDetail());await p.fill('#search','203.0.113');await p.waitForTimeout(250);
  check(await p.evaluate(()=>[...document.querySelectorAll('#board [data-asset]')].map(n=>n.dataset.asset).join()==='demo-s1'),'Searching an address finds the server');
  await p.fill('#search','');await p.waitForTimeout(200);
  // Form: prefilled, invalid and surplus addresses are refused with a hint, valid ones are stored normalised.
  await p.evaluate(()=>showDetail('demo-s1'));await p.click('#detail [data-action="edit-asset"]');await p.waitForSelector('#asset-form');
  check(await p.inputValue('#asset-form [name="ips"]')==='203.0.113.10, 2001:db8::10','Form is prefilled with the stored addresses');
  const hostLabel=await p.evaluate(()=>[...document.querySelectorAll('#asset-form .action-fields label')].map(l=>l.firstChild.textContent.trim()).join());
  check(hostLabel==='SSH 主机,IP,SSH 用户,SSH 端口','Host is the SSH target, IP is its own field: '+hostLabel);
  await p.fill('#asset-form [name="ips"]','203.0.113.10, nope');await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>/最多 4 个有效 IP/.test(document.querySelector('#asset-form [name="ips"]').validationMessage)),'A bad address is refused with a one-line hint');
  await p.fill('#asset-form [name="ips"]','203.0.113.1 203.0.113.2 203.0.113.3 203.0.113.4 203.0.113.5');await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>!!document.querySelector('#asset-form [name="ips"]').validationMessage),'More than four addresses are refused');
  await p.fill('#asset-form [name="ips"]','198.51.100.7,2001:DB8:0:0:0:0:0:7  198.51.100.7');await p.click('#asset-form [type="submit"]');await p.waitForTimeout(300);
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(a=>a.id==='demo-s1').ips)===JSON.stringify(['198.51.100.7','2001:db8::7'])),'Valid addresses are stored normalised and de-duplicated');
  check(await p.evaluate(()=>document.querySelector('#board [data-asset="demo-s1"] .ip-text').textContent==='198.51.100.7'),'Row shows the new address');
  // Narrow window: the provider is cut before the address.
  await p.setViewportSize({width:400,height:800});await p.waitForTimeout(250);
  const narrow=await p.evaluate(()=>{const sub=document.querySelector('#board [data-asset="demo-s1"] .ip-sub'),t=sub.querySelector('.ip-text').getBoundingClientRect(),r=sub.getBoundingClientRect();return {h:r.height,ipFits:t.right<=r.right+0.5};});
  check(narrow.h<18&&narrow.ipFits,'Narrow window keeps the address whole on one line: '+JSON.stringify(narrow));
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: address line (public v4, +v6, inner mark, no wrap), copy action and pills, search by address, form validation and normalising, narrow window';
 }finally{await context.close();}
}
