// Run with the browser tool's filename option. 本机设备: the demo's Mac on the board and in the inspector (facts, a disk that is
// nearly full, the serial number veiled in privacy mode); then a faked Mac host (not demo): the page asks at launch with a request
// id only, the first answer adds one device record and its block, the same facts again change nothing, a changed fact updates
// the record without touching its name, a failed or malformed answer does nothing, a deleted record stays deleted, and 设置 › 功能
// stops the asking. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,50));}};
 const contexts=[];
 const open=async({url='?demo',init=null}={})=>{
  const context=await page.context().browser().newContext({viewport:{width:1400,height:900},reducedMotion:'reduce',locale:'zh-CN'});contexts.push(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(init)await p.addInitScript(init);
  await p.goto('http://127.0.0.1:4317/'+url);
  await until(p,()=>typeof render==='function'&&typeof deviceDetailFacts==='function');
  await p.evaluate(()=>{save=()=>{};});
  return {p,errors};
 };
 const facts=p=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#detail-content .fact')].map(f=>[f.children[0].textContent,f.children[1].textContent])));
 try {
  {const {p,errors}=await open();
   check(await p.evaluate(()=>!!document.querySelector('#board [data-asset="demo-m1"]')),'the demo Mac is on the board');
   await p.evaluate(()=>showDetail('demo-m1'));
   let f=await facts(p);
   check(f['型号']==='Mac15,6'&&f['芯片']==='Apple M3 Pro'&&f['内存']==='18 GB'&&f['系统']==='macOS 15.2'&&f['磁盘']==='已用 62% · 剩 380 GB，共 1 TB'&&f['电池']==='86% · 循环 212 次'&&f['序列号']==='DEMO0C02X1Y2'&&/读取$/.test(f['本机']||'')&&f['来源']==='本机读取','the inspector lists the facts: '+JSON.stringify(f));
   await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='demo-m1');a.disk={total:1e12,free:5e10};showDetail('demo-m1');});
   check(await p.evaluate(()=>!!document.querySelector('#detail-content .device-amber')),'a disk 95% full is marked');
   await p.evaluate(()=>setPrivacy(true));
   f=await facts(p);
   check(f['序列号']&&f['序列号']!=='DEMO0C02X1Y2'&&f['型号']==='Mac15,6','privacy mode veils the serial number and leaves the model: '+JSON.stringify(f));
   await p.evaluate(()=>setPrivacy(false));
   check(!errors.length,errors.join(' | '));}

  // A faked Mac host.
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'domain'}],assets:[{id:'d1',type:'domain',name:'one.example.com',cost:'未知',art:'generic'}]}};
  };
  const {p,errors}=await open({url:'',init:`(${host.toString()})();`});
  const asked=()=>p.evaluate(()=>window.__sent.filter(m=>m.action==='deviceInfo'));
  const ask=(await until(p,()=>window.__sent.find(m=>m.action==='deviceInfo')));
  check(JSON.stringify(Object.keys(ask).sort())==='["action","requestId"]'&&ask.requestId>0,'asks at launch with a request id and nothing else: '+JSON.stringify(ask));
  const read=over=>({ok:true,hardwareId:'0123456789abcdef',name:'studio-book',model:'Mac15,8',chip:'Apple M3 Max',memoryBytes:36*2**30,osVersion:'15.2',serial:'C02TEST1234',
   disk:{total:2e12,free:1.2e12},battery:{percent:72,charging:true,cycles:40},at:new Date().toISOString(),requestId:ask.requestId,...over});
  const devices=()=>p.evaluate(()=>state.assets.filter(a=>a.type==='device').map(a=>({id:a.id,name:a.name,osVersion:a.osVersion,seenAt:a.seenAt,uuid:JSON.stringify(a).includes('IOPlatform')})));
  await p.evaluate(r=>window.assetboardDeviceInfo(r),read());
  let list=await devices();
  check(list.length===1&&list[0].id==='device-local-0123456789abcdef'&&list[0].name==='studio-book','the first answer adds this Mac: '+JSON.stringify(list));
  check(await p.evaluate(()=>state.blocks.some(b=>b.id==='device')&&!!document.querySelector('#board [data-asset="device-local-0123456789abcdef"]')),'with its block, on the board');
  const seen=list[0].seenAt;
  await p.evaluate(r=>window.assetboardDeviceInfo(r),read({at:new Date(Date.now()+60000).toISOString()}));
  check((await devices())[0].seenAt===seen,'the same facts change nothing');
  await p.evaluate(()=>{state.assets.find(a=>a.type==='device').name='Work laptop';});
  await p.evaluate(r=>window.assetboardDeviceInfo(r),read({osVersion:'15.3',name:'renamed'}));
  list=await devices();
  check(list.length===1&&list[0].osVersion==='15.3'&&list[0].name==='Work laptop','a changed fact updates the record; the name stays the person’s: '+JSON.stringify(list));
  for(const bad of [{ok:false,error:'no hardware id'},{ok:true,hardwareId:'IOPlatformUUID-12345678'},null])await p.evaluate(r=>window.assetboardDeviceInfo(r),bad);
  check((await devices()).length===1&&!(await devices())[0].uuid,'a failed or malformed answer does nothing');
  await p.evaluate(()=>deleteAssets(['device-local-0123456789abcdef']));
  await p.evaluate(r=>window.assetboardDeviceInfo(r),read({osVersion:'15.4'}));
  check((await devices()).length===0&&await p.evaluate(()=>state.deletedExternalIds.includes('local:0123456789abcdef')),'a deleted record stays deleted');
  // 设置 › 功能: off stops the asking.
  await p.evaluate(()=>{setFeature('localDevice',false);window.__sent.length=0;deviceAsked=0;deviceDue();});
  check((await asked()).length===0,'switched off, nothing is asked');
  await p.evaluate(()=>{setFeature('localDevice',true);deviceSwitch(true);});
  check((await asked()).length===1,'switched on, it asks at once');
  check(!errors.length,errors.join(' | '));
 } finally { for(const c of contexts)await c.close(); }
}
