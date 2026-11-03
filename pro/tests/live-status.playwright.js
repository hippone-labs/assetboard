// Run with the browser tool's filename option. 实时状态 (the probe feature): in a stubbed Mac app it is off until 设置 › 功能 turns it
// on; then 读取间隔 sits under it (a number with 秒 / 分钟 and the common ones; outside 15 s – 60 min is refused), a server read
// over SSH shows one line of memory, network and load, and 全部资产's overview gains a 实时 tile. The demo: the same, made up.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg)=>{for(let i=0;i<150;i++){if(await p.evaluate(fn,arg))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+String(fn).slice(0,90));};
 const browser=page.context().browser();
 const open=async(init,arg)=>{const context=await browser.newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(init,arg);await p.goto('http://127.0.0.1:4317/');return {context,p,errors};};
 // The Mac app, stubbed: one host in ~/.ssh/config that matches the server card, answering a fixed Linux reading.
 const mac=await open(()=>{
  window.__sent=[];window.__interval=60;
  const config='Host box-one\n  HostName 192.0.2.10\n';
  const out=['@@uname','Linux x86_64','@@stat1','cpu  100 0 100 800 0 0 0 0 0 0','@@stat2','cpu  110 0 110 880 0 0 0 0 0 0','@@nproc','2','@@meminfo','MemTotal:        4000000 kB','MemAvailable:    1000000 kB',
   '@@df','Filesystem 1024-blocks Used Available Capacity Mounted','/dev/vda1 10000 5000 5000 50% /','@@netdev','Inter-|   Receive','  eth0: RX 0 0 0 0 0 0 0 TX 0 0 0 0 0 0 0','@@uptime','1000.0 900.0','@@loadavg','0.42 0.30 0.20 1/100 4242','@@end',''].join('\n');
  // Answers are made when they arrive, so a late one carries the interval as it is then, as the app's own would.
  const reply=r=>setTimeout(()=>window.assetboardSshProbe?.(typeof r==='function'?r():r),5);
  window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
   if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
   if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   const list=()=>({list:{enabled:['box-one'],disabled:[],interval:window.__interval,config}});
   if(m.action==='sshProbeList'||m.action==='sshProbeSet'||m.action==='sshProbeAuto')reply(list);
   if(m.action==='sshProbeInterval'){window.__interval=m.seconds;reply(list);}
   if(m.action==='sshProbeRun')for(const alias of m.aliases){window.__n=(window.__n||0)+1;reply({result:{alias,output:out.replace('RX',String(1000*window.__n)).replace('TX',String(2000*window.__n)),at:Date.now()}});}
  }}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:{blocks:[{id:'server',folded:false}],assets:[
   {id:'s1',type:'server',name:'box-one',provider:'Example Cloud',source:'manual',host:'box-one',cost:'$5 / 月',cycle:'monthly',date:'2099-01-01',dateKind:'renew'}]},
   cloudflareConnected:false,githubConnected:false,probeSources:[],sshProbe:{enabled:['box-one'],interval:60}};
 });
 const {p}=mac;
 try{
  await until(p,()=>typeof prefsDialog==='function');
  check(await p.evaluate(()=>!probeOn()&&!document.querySelector('[data-probe-row]')&&!document.querySelector('.overview.five')),'off until turned on: no reading, no 实时 tile');
  check(await p.evaluate(()=>!window.__sent.some(m=>/^sshProbeRun|^probeRefresh/.test(m.action))),'nothing is read while off');
  await p.evaluate(()=>prefsDialog('features'));
  const row=await p.evaluate(()=>[...document.querySelectorAll('#modal .prefs-row')].map(r=>r.textContent).find(t=>t.includes('实时状态'))||'');
  check(/实时状态/.test(row)&&await p.evaluate(()=>!document.querySelector('#modal .live-interval')),'the switch is named 实时状态; no interval while off: '+row);
  await p.evaluate(()=>{const s=document.querySelector('#modal [data-action="prefs-feature"][data-id="probe"]');s.click();});
  await until(p,()=>probeOn()&&!!document.querySelector('#modal .live-interval'));
  await until(p,()=>window.__sent.some(m=>m.action==='sshProbeRun'));
  // The interval is the person's: a preset, a number in minutes, and a refusal outside the range.
  await p.evaluate(()=>document.querySelector('#modal .live-interval [data-action="live-every"][data-id="300"]').click());
  await until(p,()=>window.__interval===300&&sshProbe.interval===300);
  await p.evaluate(()=>{const n=document.querySelector('#modal .live-every'),u=document.querySelector('#modal .live-unit');u.value='60';n.value='2';n.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(p,()=>window.__interval===120&&sshProbe.interval===120);
  const refused=await p.evaluate(()=>{const before=sshProbe.interval,asked=window.__sent.filter(m=>m.action==='sshProbeInterval').length,n=document.querySelector('#modal .live-every'),u=document.querySelector('#modal .live-unit');u.value='60';n.value='90';n.dispatchEvent(new Event('change',{bubbles:true}));return {msg:n.validationMessage,kept:sshProbe.interval===before,sent:window.__sent.filter(m=>m.action==='sshProbeInterval').length-asked};});
  check(refused.msg&&refused.kept&&refused.sent===0,'90 minutes is refused in place and nothing is sent: '+JSON.stringify(refused));
  await p.evaluate(()=>document.querySelector('#modal').close());
  // A second reading gives a rate; the row is one line, and the overview has its 实时 tile.
  await p.evaluate(()=>sshPoll(true));
  await until(p,()=>/↓/.test(document.querySelector('[data-probe-row="s1"] .live-text')?.textContent||''));
  const line=await p.evaluate(()=>document.querySelector('[data-probe-row="s1"] .live-text').textContent);
  check(/^内存 75% · ↓.*\/s ↑.*\/s · 负载 0\.42$/.test(line),'one line of memory, network and load: '+line);
  check(await p.evaluate(()=>!document.querySelector('[data-probe-row="s1"] .pg,[data-probe-row="s1"] svg.ps-mini')),'no gauges on the row');
  const tile=await p.evaluate(()=>{const t=[...document.querySelectorAll('.overview .ov-tile')].find(x=>x.querySelector('.ov-label').textContent==='实时');return t?{value:t.querySelector('.ov-value').textContent,note:t.querySelector('.ov-note').textContent,five:t.parentElement.classList.contains('five')}:null;});
  check(tile&&tile.value==='1 / 1'&&tile.note==='都有读数'&&tile.five,'the 实时 tile: '+JSON.stringify(tile));
  const saved=await p.evaluate(()=>window.__sent.filter(m=>m.action==='save').map(m=>JSON.stringify(m)).join('\n'));
  check(!/MemTotal|负载|interval/.test(saved),'readings and the interval never reach the board');
  check(!mac.errors.length,'page errors: '+mac.errors.join(' | '));
 }finally{await mac.context.close();}

 // The demo: 实时状态 is on, its readings made up, and the interval changes in memory only.
 const demo=await open(()=>{window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent=(window.__sent||[]).concat(m.action);if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:null,demo:true,cloudflareConnected:false,githubConnected:false,probeSources:[]};});
 try{
  await until(demo.p,()=>document.querySelectorAll('[data-probe-row] .live-text').length>=2);
  check(await demo.p.evaluate(()=>[...document.querySelectorAll('.overview .ov-label')].some(l=>l.textContent==='实时')),'the demo shows the 实时 tile');
  await demo.p.evaluate(()=>{prefsDialog('features');document.querySelector('#modal .live-interval [data-action="live-every"][data-id="30"]').click();});
  check(await demo.p.evaluate(()=>sshProbe.interval===30&&!(window.__sent||[]).some(a=>/^ssh|^probe/.test(a))),'the demo keeps the interval in memory and asks the app for nothing');
  check(!demo.errors.length,'demo page errors: '+demo.errors.join(' | '));
 }finally{await demo.context.close();}
 return 'PASS: 实时状态 off until turned on; 读取间隔 presets, minutes and refusal; one line per server; the 实时 tile; nothing in the board; the demo';
}
