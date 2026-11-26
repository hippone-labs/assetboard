// Run with the browser tool's filename option. Tailscale 在线状态 and 从 Tailscale 添加 with a faked Mac host (not demo): off until
// switched (no status on any row, nothing asked); on, the app's node list makes a matched server and device say online or offline
// with when last seen, beside the probe line's place; 导入 › Tailscale asks once, lists the nodes not on the board with a device or
// server choice, and adds one (one undo step) or all. The demo reads nothing. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,50));}};
 const context=await page.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce',locale:'zh-CN'});
 try {
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'server'},{id:'device'}],assets:[
    {id:'s1',type:'server',name:'aether-home',provider:'自建',host:'aether-home.tail0.ts.net',cost:'未知',art:'generic'},
    {id:'s2',type:'server',name:'tokyo-vps',provider:'Vultr',ips:['203.0.113.10'],cost:'$6/月',art:'generic'},
    {id:'d1',type:'device',name:'hans的Mac mini',provider:'Apple',cost:'未知',art:'generic'}]}};
  };
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof render==='function'&&typeof tailnetDialog==='function');
  await p.evaluate(()=>{save=()=>{};});
  const asked=()=>p.evaluate(()=>window.__sent.filter(m=>m.action==='tailnetStatus').length);
  check(await p.evaluate(()=>!featureOn('tailnet')),'the app said nothing, so it starts off');
  const nodes=lastSeen=>({state:'ok',nodes:[
   {id:'n1',name:'hans的Mac mini',dns:'hansmac-mini.tail0.ts.net',ips:['100.79.13.91'],os:'macos',online:true,lastSeen:''},
   {id:'n2',name:'aether-home',dns:'aether-home.tail0.ts.net',ips:['100.64.0.3'],os:'linux',online:false,lastSeen},
   {id:'n3',name:'iPhone 16',dns:'iphone-16.tail0.ts.net',ips:['100.64.0.4'],os:'ios',online:true,lastSeen:''},
   {id:'n4',name:'pi',dns:'pi.tail0.ts.net',ips:['100.64.0.5'],os:'linux',online:true,lastSeen:''}]});
  const rowText=id=>p.evaluate(id=>document.querySelector(`#board [data-asset="${id}"]`)?.textContent||'',id);

  // Off until switched: the app is not asked, and an answer changes no row.
  await p.waitForTimeout(2200);
  check(await asked()===0,'off: the local Tailscale is not asked');
  await p.evaluate(a=>window.assetboardTailnet(a),nodes(new Date(Date.now()-3*3600e3).toISOString()));
  check(!/Tailscale/.test(await rowText('s1'))&&await p.evaluate(()=>probeState(state.assets.find(a=>a.id==='s1')))===null,'off: no status from an answer');

  // On: asks at once; a matched server and device say online or offline with when last seen; an unmatched server says nothing.
  await p.evaluate(()=>setFeatureNow('tailnet',true));
  check(await asked()===2&&await p.evaluate(()=>window.__sent.some(m=>m.action==='tailnetStatus'&&m.remember===true&&m.read===false)),'switching on tells the app to remember it, and asks once');
  await p.evaluate(a=>window.assetboardTailnet(a),nodes(new Date(Date.now()-3*3600e3).toISOString()));
  check(/离线 · 3 小时前 · Tailscale/.test(await rowText('s1')),'a server matched by its MagicDNS name is offline, last seen 3 hours ago: '+await rowText('s1'));
  check(/在线 · Tailscale/.test(await rowText('d1')),'a device matched by its name is online: '+await rowText('d1'));
  check(!/Tailscale/.test(await rowText('s2')),'a server that is no node says nothing');
  check(await p.evaluate(()=>{const s=probeState(state.assets.find(a=>a.id==='s1'));return s&&s.online===false&&s.tone==='red';}),'probeState carries it, so the panorama and the overview count it');

  // 导入 › Tailscale: asks again, lists what is not on the board (the phone and the Pi), each with a device or server choice.
  await p.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<button id="ti" data-action="tailnet-import" hidden>x</button>');document.querySelector('#ti').click();});
  check(await asked()===3,'opening 从 Tailscale 添加 reads once more');
  const list=await p.evaluate(()=>[...document.querySelectorAll('[data-action="tailnet-add"]')].map(b=>[b.dataset.id,document.querySelector(`[data-tailnet-kind="${b.dataset.id}"]`).value]));
  check(JSON.stringify(list)==='[["n3","device"],["n4","server"]]','the phone as a device, the Pi as a server, nothing already on the board: '+JSON.stringify(list));
  await p.selectOption('[data-tailnet-kind="n3"]','device');
  await p.click('[data-action="tailnet-add"][data-id="n3"]');
  const added=await p.evaluate(()=>state.assets.find(a=>a.source==='tailscale'));
  check(added?.type==='device'&&added.name==='iPhone 16'&&added.externalId==='n3'&&added.host==='iphone-16.tail0.ts.net'&&added.provider==='Apple'&&added.deviceKind==='iphone','the phone recorded as a device, an iPhone: '+JSON.stringify(added));
  check(/在线 · Tailscale/.test(await rowText(added.id)),'and it shows online at once');
  await p.evaluate(id=>showDetail(id),added.id);
  check(await p.evaluate(()=>/种类\s*iPhone/.test(document.querySelector('#detail').textContent)&&/Tailscale\s*在线 · iphone-16\.tail0\.ts\.net/.test(document.querySelector('#detail').textContent)),'the inspector says what it is and what it was matched to');
  check(await p.evaluate(id=>!!document.querySelector(`#board [data-asset="${id}"] .tile path[d="M11 18.5h2"]`),added.id),'its tile is a phone');
  await p.evaluate(()=>closeDetail());
  check(await p.evaluate(()=>document.querySelectorAll('[data-action="tailnet-add"]').length===1),'the list now has only the Pi');
  await p.click('#toast .toast-undo');
  check(await p.evaluate(()=>!state.assets.some(a=>a.source==='tailscale')),'undo takes the record back');

  // The app's remembered switch wins over the page's empty storage at the next launch.
  {const q=await context.newPage();await q.addInitScript(`(${host.toString()})();window.__ASSETBOARD_NATIVE__.tailnetOn=true;`);await q.goto('http://127.0.0.1:4317/');
   await until(q,()=>typeof tailnetOn==='function');check(await q.evaluate(()=>featureOn('tailnet')&&tailnetOn()),'a relaunch with the app\'s switch on starts on');await q.close();}

  // A stopped Tailscale says so.
  await p.evaluate(()=>{window.assetboardTailnet({state:'stopped',nodes:[]});});
  check(await p.evaluate(()=>/Tailscale 没有连接/.test(document.querySelector('#modal-content').textContent)),'a stopped Tailscale says so');
  check(!/Tailscale/.test(await rowText('s1')),'and no row claims a status');
  check(!errors.length,errors.join(' | '));
  return 'PASS: off until switched, a matched server offline with its last-seen time and a device online, nothing for others, 从 Tailscale 添加 lists what is not on the board as device or server, adds with undo (an iPhone with its kind, the inspector row, a phone tile), a stopped Tailscale';
 } finally { await context.close(); }
}
