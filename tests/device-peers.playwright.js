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
  const enable=await until(p,()=>window.__sent.find(m=>m.action==='peers'&&m.op==='enable'));
  check(enable.on===false,'off until switched: the app is told not to listen: '+JSON.stringify(enable));
  check((await sent('read')).length===0,'nothing is read while off');
  await p.evaluate(()=>peersDialog());
  check(await p.evaluate(()=>/局域网上可被发现/.test(document.querySelector('#modal-content').textContent)&&!!document.querySelector('[data-action="peers-enable"]')),'the dialog explains, and offers 打开');
  await p.click('[data-action="peers-enable"]');
  check(await p.evaluate(()=>featureOn('peers')&&window.__sent.some(m=>m.op==='enable'&&m.on===true)),'打开 switches it on and the app listens');

  // The app answers with what it found, then a pairing begins.
  await p.evaluate(()=>window.assetboardPeers({peers:[],found:['mac-mini'],listening:true}));
  check(await p.evaluate(()=>!!document.querySelector('[data-action="peers-pair"][data-id="mac-mini"]')),'a Mac found on this network can be paired');
  await p.click('[data-action="peers-pair"][data-id="mac-mini"]');
  check((await sent('pair')).at(-1)?.service==='mac-mini','pairing asks the app for that Mac');
  await p.evaluate(()=>window.assetboardPeers({pairing:{state:'code',role:'client',code:'042917',name:'mac-mini'}}));
  const code=await p.evaluate(()=>({text:document.querySelector('.peer-code')?.textContent,yes:!!document.querySelector('[data-action="peers-confirm"][data-id="yes"]'),no:!!document.querySelector('[data-action="peers-confirm"][data-id="no"]')}));
  check(code.text==='042 917'&&code.yes&&code.no,'the code is shown big with 一致 and 不一致: '+JSON.stringify(code));
  await p.click('[data-action="peers-confirm"][data-id="yes"]');
  check((await sent('confirm')).at(-1)?.ok===true,'一致 tells the app');
  await p.evaluate(()=>window.assetboardPeers({pairing:{state:'waiting',role:'client',code:'042917',name:'mac-mini'}}));
  check(await p.evaluate(()=>/等 mac-mini 上的人确认/.test(document.querySelector('#modal-content').textContent)),'then it waits for the other Mac');
  await p.evaluate(id=>{window.__sent.length=0;window.assetboardPeers({pairing:{state:'paired',name:'mac-mini',id},peers:[{id,name:'mac-mini',host:'192.0.2.40',pairedAt:new Date().toISOString()}]});},PEER);
  const read=await until(p,()=>window.__sent.find(m=>m.action==='peers'&&m.op==='read'));
  check(read.id===PEER,'a new pairing is read at once: '+JSON.stringify(read));
  check(await p.evaluate(()=>/已和 mac-mini 配对/.test(document.querySelector('#toast').textContent)),'paired, said in a toast');

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
