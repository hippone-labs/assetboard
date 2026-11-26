// Run with the browser tool's filename option. 其他设备 with a faked Mac host (not demo): off until switched (the page tells the
// app not to listen), the dialog's explanation and 打开; then the app's events: a pairing code shown big with 一致 / 不一致, the
// answer sent back, waiting, paired; a paired Mac read at once, its answer made into its own device record with its name, its
// 正在做 on its own screen in the object panorama, a failed read worded quietly; unpairing after a confirmation; switching off.
// The demo has no other Macs. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,50));}};
 const contexts=[];
 const open=async({url='',init=null}={})=>{
  const context=await page.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce',locale:'zh-CN'});contexts.push(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(init)await p.addInitScript(init);
  await p.goto('http://127.0.0.1:4317/'+url);
  await until(p,()=>typeof render==='function'&&typeof peersDialog==='function');
  await p.evaluate(()=>{save=()=>{};});
  return {p,errors};
 };
 const PEER='a1b2c3d4e5f60718';
 try {
  {const {p,errors}=await open({url:'?demo'});
   await p.evaluate(()=>peersDialog());
   check(await p.evaluate(()=>/演示模式不连接/.test(document.querySelector('#modal-content').textContent)),'the demo connects to nothing');
   check(!errors.length,errors.join(' | '));}

  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'domain'}],assets:[{id:'d1',type:'domain',name:'one.example.com',cost:'未知',art:'generic'}]}};
  };
  const {p,errors}=await open({init:`(${host.toString()})();`});
  const sent=op=>p.evaluate(op=>window.__sent.filter(m=>m.action==='peers'&&m.op===op),op);
  // At launch the page asks the app, which keeps on or off (the page's own storage starts empty each launch).
  await until(p,()=>window.__sent.some(m=>m.action==='peers'&&m.op==='list'));
  await p.evaluate(()=>window.assetboardPeers({peers:[],found:[],listening:false,enabled:false}));
  check(await p.evaluate(()=>!featureOn('peers')&&!window.__sent.some(m=>m.op==='enable'))&&(await sent('read')).length===0,'off until switched: nothing listens, nothing is read');
  // Opening 其他设备 (设置 › 连接) is the intent to pair: it switches the feature on, with no other step.
  await p.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<button id="open-peers" data-action="peers-open" hidden>x</button>');document.querySelector('#open-peers').click();});
  check(await p.evaluate(()=>featureOn('peers')&&window.__sent.some(m=>m.op==='enable'&&m.on===true)&&window.__sent.some(m=>m.op==='list')),'opening it switches it on and the app listens');
  check(await p.evaluate(()=>/局域网上可被发现/.test(document.querySelector('#modal-content').textContent)),'the dialog says this Mac can be found');

  // Opening it also asks the local Tailscale for the tailnet's Macs; one is paired with a click instead of a typed address.
  check((await sent('tailnet')).length===1,'opening it asks for the tailnet Macs');
  await p.evaluate(()=>window.assetboardPeers({tailnet:{state:'ok',macs:[{name:'mac-mini',host:'mac-mini.tail0.ts.net',online:true},{name:'Studio',host:'studio.tail0.ts.net',online:false},{name:'bad',host:'x;y',online:true}]}}));
  const tailnet=await p.evaluate(()=>({hosts:[...document.querySelectorAll('[data-action="peers-pair-host"][data-host]')].map(b=>b.dataset.host),text:document.querySelector('#modal-content').textContent}));
  check(tailnet.hosts.join()==='mac-mini.tail0.ts.net,studio.tail0.ts.net'&&/Tailscale 里的 Mac/.test(tailnet.text)&&/studio\.tail0\.ts\.net · (离线|Offline)/.test(tailnet.text),'the tailnet Macs are listed, offline marked, a bad address dropped: '+JSON.stringify(tailnet.hosts));
  await p.click('[data-action="peers-pair-host"][data-host="studio.tail0.ts.net"]');
  check((await sent('pair')).at(-1)?.host==='studio.tail0.ts.net','pairing a tailnet Mac sends its MagicDNS name');
  await p.evaluate(()=>window.assetboardPeers({tailnet:{state:'stopped',macs:[]}}));
  check(await p.evaluate(()=>/Tailscale 没有连接/.test(document.querySelector('#modal-content').textContent)&&!document.querySelector('[data-host]')),'a stopped Tailscale says so');
  await p.evaluate(()=>window.assetboardPeers({tailnet:{state:'none',macs:[]}}));
  check(await p.evaluate(()=>!/Tailscale 里的 Mac/.test(document.querySelector('#modal-content').textContent)),'without Tailscale the section is not shown');

  // The app answers with what it found, then a pairing begins.
  await p.evaluate(()=>window.assetboardPeers({peers:[],found:['mac-mini'],listening:true}));
  check(await p.evaluate(()=>!!document.querySelector('[data-action="peers-pair"][data-id="mac-mini"]')),'a Mac found on this network can be paired');
  await p.click('[data-action="peers-pair"][data-id="mac-mini"]');
  check((await sent('pair')).at(-1)?.service==='mac-mini','pairing asks the app for that Mac');
  // The Mac that started it only shows the code and waits: nothing to confirm here.
  await p.evaluate(()=>window.assetboardPeers({pairing:{state:'waiting',role:'client',code:'042917',name:'mac-mini'}}));
  const code=await p.evaluate(()=>({text:document.querySelector('.peer-code')?.textContent,allow:document.querySelectorAll('[data-action="peers-confirm"][data-id="yes"]').length,body:document.querySelector('#modal-content').textContent}));
  check(code.text==='042 917'&&code.allow===0&&/在 mac-mini 上点「允许」/.test(code.body),'the starting Mac shows the code and asks for 允许 on the other: '+JSON.stringify(code));
  await p.evaluate(id=>{window.__sent.length=0;window.assetboardPeers({pairing:{state:'paired',role:'client',name:'mac-mini',id},peers:[{id,name:'mac-mini',host:'192.0.2.40',pairedAt:new Date().toISOString(),sync:true,syncFirst:'here',syncSince:Date.now(),syncDone:false}]});},PEER);
  const read=await until(p,()=>window.__sent.find(m=>m.action==='peers'&&m.op==='read'));
  check(read.id===PEER,'a new pairing is read at once: '+JSON.stringify(read));
  check(await p.evaluate(id=>window.__sent.some(m=>m.op==='readBoard'&&m.id===id)&&peerSyncOf(id)?.on&&peerSyncOf(id).first==='here',PEER),'and its board too: the starting Mac syncs, keeping its own board');
  check(await p.evaluate(()=>/已和 mac-mini 配对，资产板开始同步/.test(document.querySelector('#toast').textContent)),'paired, said in a toast');

  // Its answer: its device record, and its sessions on its screen.
  await p.evaluate(id=>{const now=Date.now()/1000;window.assetboardPeerFacts({ok:true,id,name:'mac-mini',at:new Date().toISOString(),
   device:{ok:true,hardwareId:'00000000000000b2',name:'Mac mini',model:'Mac14,3',chip:'Apple M2',memoryBytes:16*2**30,osVersion:'15.2',serial:'C02MINI0001',disk:{total:5e11,free:2e11},at:new Date().toISOString()},
   sessions:{ok:true,at:new Date().toISOString(),home:'/Users/demo',processes:[{pid:1,ppid:0},{pid:9,ppid:1,name:'claude',path:'/opt/homebrew/bin/claude',cwd:'/Users/demo/projects/api',start:Math.round(now-600)}],
    repos:{'/Users/demo/projects/api':{root:'/Users/demo/projects/api',gitdir:'/Users/demo/projects/api/.git',head:'ref: refs/heads/main'}},files:{}}});},PEER);
  const rec=await p.evaluate(()=>state.assets.find(a=>a.type==='device'));
  check(rec&&rec.name==='mac-mini'&&rec.source==='peer'&&rec.peerId===PEER&&rec.model==='Mac14,3','its answer is its own device record: '+JSON.stringify(rec));
  await p.evaluate(id=>showDetail(id),rec.id);
  check(await p.evaluate(()=>[...document.querySelectorAll('#detail-content .fact')].some(f=>f.textContent.includes('从配对的 Mac 读取'))),'its source says it was read from a paired Mac');
  await p.evaluate(()=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();panoramaOpen(true);panoSetStyle('objects');});
  check(await p.evaluate(()=>document.querySelector('#panorama').dataset.style)==='objects','the object panorama is drawn');
  const screen=await until(p,id=>{const m=document.querySelector(`#panorama [data-chip="${id}"]`);return m&&{sessions:m.dataset.sessions,text:m.querySelector('.po-screen')?.innerText.replace(/\s+/g,' ')};},rec.id);
  check(screen.sessions==='1'&&/正在做 · 1 个会话/.test(screen.text)&&/Claude Code/.test(screen.text),'its 正在做 is on its own screen: '+JSON.stringify(screen));
  const mine=await p.evaluate(()=>document.querySelector('#panorama [data-mac]:not(.other-device)')?.dataset.sessions);
  check(mine==='0','this Mac’s screen does not show the other Mac’s sessions: '+mine);
  await p.evaluate(()=>panoramaOpen(false));

  // 同步资产板, as the starting Mac: it takes only what changed over there since the pairing.
  const before=await p.evaluate(()=>state.assets.map(a=>a.id).sort().join());
  await p.evaluate(id=>{const old=new Date(Date.now()-86400000*30).toISOString(),fresh=new Date(Date.now()+60000).toISOString();
   window.assetboardPeerBoard({ok:true,id,name:'mac-mini',board:{blocks:[{id:'domain'}],deletedExternalIds:[],assets:[
    {id:'old1',type:'domain',name:'deleted-long-ago.example.com',updatedAt:old,links:[]},
    {id:'new1',type:'domain',name:'made-there.example.com',updatedAt:fresh,links:[]},
    {id:'device-local-bbbbbbbbbbbbbbbb',type:'device',name:'Mac mini',source:'local',externalId:'bbbbbbbbbbbbbbbb',updatedAt:fresh}]}});},PEER);
  const after=await p.evaluate(()=>state.assets.map(a=>a.id).sort());
  check(after.includes('new1')&&!after.includes('old1')&&!after.includes('device-local-bbbbbbbbbbbbbbbb'),'only what changed there comes over, and not that Mac’s own record: '+JSON.stringify({before,after}));
  check(await p.evaluate(()=>/从 mac-mini 同步：新增 1/.test(document.querySelector('#toast').textContent)),'the sync says what it brought');
  await p.evaluate(()=>peersDialog());
  check(await p.evaluate(()=>/资产板同步中/.test(document.querySelector('#modal-content').textContent)),'the dialog says the board syncs');
  await p.evaluate(id=>window.assetboardPeerBoard({ok:false,id,error:'not-synced'}),PEER);
  check(await p.evaluate(()=>/对方还没打开同步/.test(document.querySelector('#modal-content').textContent)),'until that Mac turns it on too, it says so');
  await p.click(`[data-action="peers-sync-stop"][data-id="${PEER}"]`);
  check((await sent('sync')).at(-1)?.on===false&&await p.evaluate(id=>!peerSyncOn(id),PEER),'stopping tells the app and stops reading the board');
  check(await p.evaluate(id=>!!document.querySelector(`[data-action="peers-sync"][data-id="${id}"]`),PEER),'and it can be turned on again');
  // As the Mac asked: one confirmation, with whose board to start from.
  await p.evaluate(()=>{window.__sent.length=0;window.assetboardPeers({pairing:{state:'code',role:'server',code:'318004',name:'mac-air'}});});
  const ask=await p.evaluate(()=>({title:document.querySelector('#modal-title').textContent,code:document.querySelector('.peer-code')?.textContent,modes:[...document.querySelectorAll('[data-action="peers-confirm"][data-id="yes"]')].map(b=>b.dataset.mode)}));
  check(/mac-air 想和这台配对/.test(ask.title)&&ask.code==='318 004'&&ask.modes.join()==='there,merge','the Mac asked shows the code and allows once, choosing whose board: '+JSON.stringify(ask));
  await p.click('[data-action="peers-confirm"][data-mode="there"]');
  check((await sent('confirm')).at(-1)?.ok===true&&(await sent('confirm')).at(-1)?.mode==='there','允许 tells the app, with whose board to start from');
  await p.evaluate(()=>window.assetboardPeers({pairing:{state:'paired',role:'server',name:'mac-air',id:'0f0f0f0f0f0f0f0f'},peers:[...peersNow.peers,{id:'0f0f0f0f0f0f0f0f',name:'mac-air',host:'',pairedAt:new Date().toISOString(),sync:true,syncFirst:'there',syncSince:Date.now(),syncDone:false}]}));
  check(await p.evaluate(()=>peerSyncOf('0f0f0f0f0f0f0f0f')?.first==='there'),'having allowed with “start from mac-air”, this Mac takes its board once');
  // The app says it is on at the next launch: the page follows.
  await p.evaluate(()=>{setFeature('peers',false);window.assetboardPeers({enabled:true});});
  check(await p.evaluate(()=>featureOn('peers')),'on, as the app keeps it, survives the page starting empty');
  // A failed read is worded quietly in the dialog.
  await p.evaluate(id=>{window.assetboardPeerFacts({ok:false,id,name:'mac-mini',error:'unreachable'});peersDialog();},PEER);
  check(await p.evaluate(()=>/连不上/.test(document.querySelector('#modal-content').textContent)&&!document.querySelector('#modal-content .red')),'a failed read says so, with no fault colour');
  // Unpairing asks first.
  await p.click('[data-action="peers-unpair"]');
  check(await p.evaluate(()=>/解除配对？/.test(document.querySelector('#modal-title').textContent)),'unpairing asks first');
  await p.click('#confirm-yes');
  await until(p,()=>window.__sent.some(m=>m.op==='unpair'));
  check((await sent('unpair')).at(-1)?.id===PEER,'then tells the app');
  // Off: the app stops listening and nothing is read.
  await p.evaluate(()=>{setFeature('peers',false);peersSwitch(false);window.__sent.length=0;peerAsked=0;peersDue();});
  check((await sent('read')).length===0&&await p.evaluate(()=>true),'switched off, nothing is read');
  check(!errors.length,errors.join(' | '));
 } finally { for(const c of contexts)await c.close(); }
}
