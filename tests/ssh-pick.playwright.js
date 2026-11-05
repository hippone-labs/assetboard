// Adding a server from ~/.ssh/config (Mac): the form offers the hosts the app read, picking one fills in name, host, user, port
// and the IP, the alias stays on the record and the detail shows it. Never saves for real (the fake app answers saves). The
// browser version has no file and shows no picker; the demo shows the demo hosts.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const browser=page.context().browser();
 const open=async(url,stub)=>{const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(stub)await p.addInitScript(stub);await p.goto(url);
  for(let i=0;i<100&&!await p.evaluate(()=>typeof state!=='undefined'&&document.readyState==='complete');i++)await wait(40);return {context,p,errors};};
 const until=async(p,fn,arg)=>{for(let i=0;i<120;i++){if(await p.evaluate(fn,arg))return;await wait(40);}throw new Error('Timed out: '+String(fn).slice(0,90));};
 // The Mac app, stubbed: ~/.ssh/config has two hosts; one is already a record.
 const mac=await open('http://127.0.0.1:4317/',()=>{
  window.__sent=[];
  const config='Host tokyo\n  HostName 203.0.113.10\n  User deploy\n  Port 2222\nHost lab\n  HostName lab.example.net\n';
  window.webkit={messageHandlers:{assetboard:{postMessage(msg){window.__sent.push(msg.action);
   if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);
   if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(msg.action==='sshConfigHosts')setTimeout(()=>window.assetboardSshHosts({ok:true,text:config}),20);
  }}}};
  window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'server',folded:false}],assets:[{id:'s0',type:'server',name:'lab box',provider:'Example',source:'manual',art:'generic',cost:'未知',sshAlias:'lab'}]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
 });
 try{
  await mac.p.evaluate(()=>assetForm('server'));
  await until(mac.p,()=>document.querySelectorAll('#asset-form select[name="sshPick"] option').length===3);
  check(mac.p.evaluate(()=>window.__sent.includes('sshConfigHosts')),'the form asks the app for the hosts');
  const options=await mac.p.evaluate(()=>[...document.querySelectorAll('#asset-form select[name="sshPick"] option')].map(o=>o.textContent));
  check(options[1].startsWith('tokyo · 203.0.113.10')&&/lab · lab\.example\.net · 已有记录/.test(options[2]),'hosts with their address; a recorded one says so: '+options.join(' | '));
  await mac.p.selectOption('#asset-form select[name="sshPick"]','tokyo');
  const filled=await mac.p.evaluate(()=>{const f=document.getElementById('asset-form');return [f.elements.name.value,f.elements.host.value,f.elements.sshUser.value,f.elements.sshPort.value,f.elements.ips.value,f.elements.sshAlias.value];});
  check(filled.join('|')==='tokyo|203.0.113.10|deploy|2222|203.0.113.10|tokyo','picking fills name, host, user, port, IP and keeps the alias: '+filled.join('|'));
  // A typed name is kept when the pick changes; a filled-by-pick one follows.
  await mac.p.fill('#asset-form [name="name"]','东京主力');
  await mac.p.selectOption('#asset-form select[name="sshPick"]','lab');
  const again=await mac.p.evaluate(()=>{const f=document.getElementById('asset-form');return [f.elements.name.value,f.elements.host.value,f.elements.sshAlias.value];});
  check(again.join('|')==='东京主力|lab.example.net|lab','the typed name stays, the host follows the pick: '+again.join('|'));
  await mac.p.selectOption('#asset-form select[name="sshPick"]','tokyo');
  await mac.p.click('#asset-form button[type="submit"]');
  await until(mac.p,()=>state.assets.length===2);
  const saved=await mac.p.evaluate(()=>{const a=state.assets.find(a=>a.id!=='s0');return [a.name,a.host,a.sshUser,a.sshPort,a.sshAlias,(a.ips||[]).join(',')];});
  check(saved.join('|')==='东京主力|203.0.113.10|deploy|2222|tokyo|203.0.113.10','the record keeps the alias and the fields: '+saved.join('|'));
  await mac.p.evaluate(()=>showDetail(state.assets.find(a=>a.id!=='s0').id));
  await until(mac.p,()=>/ssh tokyo/.test(document.querySelector('#detail')?.textContent||''));
  // Editing shows the pick selected; clearing it drops the alias.
  await mac.p.evaluate(()=>assetForm('server',state.assets.find(a=>a.id!=='s0').id));
  await until(mac.p,()=>document.querySelector('#asset-form select[name="sshPick"]')?.value==='tokyo');
  await mac.p.selectOption('#asset-form select[name="sshPick"]','');
  await mac.p.click('#asset-form button[type="submit"]');
  await until(mac.p,()=>!state.assets.find(a=>a.id!=='s0').sshAlias);
  check(!mac.errors.length,'no page errors: '+mac.errors.join(' | '));
 }finally{await mac.context.close();}
 // The browser: no file, no picker, a plain form.
 const web=await open('http://127.0.0.1:4317/');
 try{
  await web.p.evaluate(()=>{save=()=>{};assetForm('server');});
  await wait(200);
  check(await web.p.evaluate(()=>!document.querySelector('#asset-form select[name="sshPick"]')&&!!document.querySelector('#asset-form [name="host"]')),'the browser form has the SSH fields but no picker');
 }finally{await web.context.close();}
 return 'ok';
}
