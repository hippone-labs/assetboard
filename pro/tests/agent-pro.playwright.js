// Run with the browser tool's filename option. The Pro agent methods behind the MCP tools for probe sources, SSH 直读, site icons and
// the Cloudflare sync (pro/web/agent-pro.js), against a stubbed Mac app: every method answers at once, slow work is looked up later,
// removing a source, turning SSH 直读 on and unblocking a sync item wait for the person in the app (allowed or declined there), board
// changes undo with ⌘Z, and no reply carries an account, a password, a token, an ssh HostName, an address, a user or a key file, even
// when the app's own errors name them. The demo refuses the calls. All names, addresses and keys here are made up.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,90));await wait(40);}};
 const browser=page.context().browser();
 const SECRETS=['admin-fake-user','pw-fake-1','203.0.113.10','198.51.100.7','deploy-user','ops-person','2222','id_fake_key','HostName','IdentityFile','cfTOKENabcdefghijklmnopqrstuvwxyz0123'];
 const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 // The Mac app, stubbed; `saved` is a board the app kept (a restart), else the sample below.
 const stub=saved=>{
  const now=Date.now(),GB=1024**3;
  const row=(id,name,cpu)=>({id,name,cpu,ram_used:1024,ram_total:4096,disk_used:20480,disk_total:81920,net_rx_monthly:30*GB,net_tx_monthly:10*GB,traffic_calc_type:'total',last_updated:now-60000,ip_v4:'1',ip_v6:'0'});
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const config='Host tokyo-vps\n  HostName 203.0.113.10\n  User deploy-user\n  Port 2222\n  IdentityFile ~/.ssh/id_fake_key\nHost lab-box\n  HostName 198.51.100.7\n  User ops-person\n';
  const ssh={enabled:[],disabled:[],interval:60};
  window.__sent=[];window.__cf=[{kind:'zone',id:'z1',name:'kept.example',account:'Acct',status:'active'},{kind:'zone',id:'z2',name:'new.example',account:'Acct',status:'active'}];
  const answer=(fn,ms=20)=>setTimeout(fn,ms);
  window.webkit={messageHandlers:{assetboard:{postMessage(msg){
   window.__sent.push(JSON.parse(JSON.stringify(msg)));
   const list=window.__ASSETBOARD_NATIVE__.probeSources;
   if(msg.action==='save')answer(()=>window.assetboardSaved?.(msg.sequence,true),5);
   if(msg.action==='evidenceList')answer(()=>window.assetboardEvidenceList?.([]),5);
   // Probe panels: src1 answers; a host starting with private. is not public.
   const read=s=>{window.assetboardProbe({source:s.id,loading:true});answer(()=>window.assetboardProbe(new URL(s.url).host.startsWith('private.')?{source:s.id,error:'401 from https://private.example.net with session abc',status:401,reason:'private'}
    :{source:s.id,kind:'cfsm',data:{servers:s.id==='src1'?[row('a','tokyo-vps',23),row('b','backup-box',3),row('c','spare-x',41)]:[]},at:Date.now()}),30);};
   if(msg.action==='probeRefresh')for(const s of list)if(!msg.id||msg.id===s.id)read(s);
   if(msg.action==='probeSave'){const was=list.find(x=>x.id===msg.id),src={id:msg.id||'auto'+list.length,kind:msg.kind,name:msg.name||new URL(msg.url).host,url:msg.url,hasLogin:was?.hasLogin||false,username:was?.username||''};
    if(was)Object.assign(was,src);else list.push(src);answer(()=>{window.assetboardProbe({sources:list.map(x=>({...x})),saved:src.id});read(src);},10);}
   if(msg.action==='probeRemove'){const at=list.findIndex(x=>x.id===msg.id);if(at>=0)list.splice(at,1);answer(()=>window.assetboardProbe({sources:list.map(x=>({...x})),removed:msg.id}));}
   if(msg.action==='probeHistory')answer(()=>window.assetboardProbe({source:msg.id,history:Object.fromEntries(msg.servers.map(id=>[id,Array.from({length:30},(_,i)=>({timestamp:now-(29-i)*600000,cpu:20+i,ram_used:1024,ram_total:4096}))]))}));
   // SSH 直读: the settings live here, as on the Mac; a run of lab-box fails with ssh's own line, which names the address and the user.
   const sshList=()=>answer(()=>window.assetboardSshProbe({list:{config,enabled:[...ssh.enabled],disabled:[...ssh.disabled],interval:ssh.interval}}));
   if(msg.action==='sshProbeList')sshList();
   if(msg.action==='sshProbeSet'){ssh.enabled=ssh.enabled.filter(a=>a!==msg.alias);ssh.disabled=ssh.disabled.filter(a=>a!==msg.alias);(msg.on?ssh.enabled:ssh.disabled).push(msg.alias);sshList();}
   if(msg.action==='sshProbeAuto'){for(const a of msg.aliases)if(!ssh.disabled.includes(a)&&!ssh.enabled.includes(a))ssh.enabled.push(a);sshList();}
   if(msg.action==='sshProbeInterval'){ssh.interval=msg.seconds;sshList();}
   if(msg.action==='sshProbeRun')for(const alias of msg.aliases)answer(()=>window.assetboardSshProbe({result:{alias,reason:'down',error:'ssh: connect to host 198.51.100.7 port 2222: Operation timed out (ops-person)'}}),30);
   if(msg.action==='iconFetch')answer(()=>window.assetboardIconResult(msg.host==='bad.example'?{requestId:msg.requestId,ok:false,error:'没有在官网找到图标'}:{requestId:msg.requestId,ok:true,host:msg.host,dataUrl:png}),30);
   if(msg.action==='cloudflareSync')answer(()=>window.assetboardCloudflareResult(window.__cfFail?{ok:false,error:'Cloudflare refused cfTOKENabcdefghijklmnopqrstuvwxyz0123'}:{ok:true,connected:true,resources:window.__cf,queriedKinds:['zone'],warnings:[]}),30);
  }}}};
  const server=(id,name,extra={})=>({id,type:'server',name,provider:'Example',source:'manual',art:'generic',cost:'未知',...extra});
  window.__ASSETBOARD_NATIVE__={data:saved||{blocks:[{id:'server',width:50,height:null,density:'full',folded:false}],assets:[
   server('s1','tokyo-vps',{ips:['203.0.113.10']}),server('s2','backup-box'),server('s3','paris-vps'),server('s4','spare'),
   {id:'w1',type:'bankcard',name:'Wise 卡',provider:'Wise',source:'manual',art:'generic',last4:'1234'},{id:'w2',type:'bankcard',name:'Wise 备用',provider:'Wise',source:'manual',art:'generic',last4:'5678'}],
   deletedExternalIds:['cloudflare:zone:z9','cloudflare-zone-z9','github:4242','asset-abc']},
   probeSources:[{id:'src1',kind:'cfsm',name:'我的探针',url:'https://status.example.com',hasLogin:true,username:'admin-fake-user'}],
   sshProbe:{enabled:[],interval:60},cloudflareConnected:true,githubConnected:false,gmailConfigured:false};
 };
 await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});
 await p.addInitScript(stub,null);
 const replies=[];
 const call=async(method,params={})=>{const r=await p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);replies.push(JSON.stringify(r));return r;};
 const sent=action=>p.evaluate(action=>window.__sent.filter(m=>m.action===action),action);
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof assetboardAgent==='function'&&probe.state.get('src1')?.servers?.length===3&&sshProbe.listed);

  // 探针数据源: listed without the account; adding asks for the address only and never takes a password.
  let r=await call('probeSources');
  check(r.ok&&r.result.sources.length===1&&r.result.sources[0].status==='ok'&&r.result.sources[0].hasLogin===true&&r.result.sources[0].servers===3,'list_probe_sources: '+JSON.stringify(r));
  check(/只能在 Assetboard 里填写/.test((await call('probeSourceAdd',{url:'status.example.org',password:'pw-fake-1'})).error),'add_probe_source refuses a password');
  check(/只能在 Assetboard 里填写/.test((await call('probeSourceAdd',{url:'status.example.org',username:'admin-fake-user'})).error),'add_probe_source refuses a user name');
  check(/url/.test((await call('probeSourceAdd',{url:'ftp://status.example.org'})).error),'add_probe_source refuses another scheme');
  r=await call('probeSourceAdd',{url:'private.example.net/admin#/login',name:'私有面板'});
  check(r.ok&&r.result.status==='checking'&&r.result.url==='https://private.example.net'&&/^[0-9a-f-]{36}$/.test(r.result.id),'add_probe_source normalizes like the form and answers at once: '+JSON.stringify(r));
  const added=r.result.id;
  const save=(await sent('probeSave')).pop();
  check(save.id===added&&save.url==='https://private.example.net'&&save.name==='私有面板'&&save.kind==='cfsm'&&!('username' in save)&&!('password' in save),'The app is asked to save the address and name only: '+JSON.stringify(save));
  await until(p,id=>assetboardAgent({requestId:'x',method:'probeSources',params:{}}).result.sources.find(s=>s.id===id)?.status==='needsLogin',added);
  r=await call('probeSources');const priv=r.result.sources.find(s=>s.id===added);
  check(priv.status==='needsLogin'&&/Assetboard/.test(priv.message)&&!/session|401 from/.test(JSON.stringify(priv)),'A private panel answers needsLogin with fixed words: '+JSON.stringify(priv));
  check((await call('probeSourceAdd',{url:'https://private.example.net'})).result.alreadyAdded===true,'Adding the same address again returns the source');
  r=await call('probeSourceUpdate',{id:added,name:'改名的面板'});
  check(r.ok&&r.result.status==='checking'&&(await sent('probeSave')).pop().name==='改名的面板'&&!('password' in (await sent('probeSave')).pop()),'update_probe_source renames, account kept: '+JSON.stringify(r));
  await until(p,id=>probe.sources.find(s=>s.id===id)?.name==='改名的面板',added);
  check(/没有要修改/.test((await call('probeSourceUpdate',{id:added,name:'改名的面板'})).error)&&/找不到/.test((await call('probeSourceUpdate',{id:'nope',name:'x'})).error),'update_probe_source refuses nothing to do and unknown ids');
  r=await call('probeRefresh',{});
  check(r.ok&&r.result.status==='refreshing'&&r.result.sources.length===2&&(await sent('probeRefresh')).pop().manual===true,'refresh_probe_sources answers refreshing');

  // Servers and links.
  r=await call('probeServers');
  const byName=Object.fromEntries(r.result.servers.map(s=>[s.name,s]));
  check(byName['tokyo-vps']?.linkedAssetId==='s1'&&byName['backup-box']?.linkedAssetId==='s2'&&!byName['spare-x']?.linkedAssetId&&byName['tokyo-vps'].how==='name','list_probe_servers names the cards: '+JSON.stringify(r.result));
  r=await call('probeServers',{unmatchedOnly:true});
  check(r.result.servers.length===1&&r.result.servers[0].serverId==='c','unmatchedOnly: '+JSON.stringify(r.result));
  r=await call('probeLink',{assetId:'s3',source:'src1',serverId:'c'});
  check(r.ok&&r.result.linked&&r.result.serverName==='spare-x'&&r.result.how==='manual'&&await p.evaluate(()=>state.assets.find(a=>a.id==='s3').probeLink?.id==='c'),'set_probe_link links by hand: '+JSON.stringify(r));
  check(/已手动关联/.test((await call('probeLink',{assetId:'s4',source:'src1',serverId:'c'})).error),'A server linked by hand to another card is refused');
  check(/没有这台/.test((await call('probeLink',{assetId:'s4',source:'src1',serverId:'zz'})).error),'An unknown probe server is refused');
  check(/只有服务器/.test((await call('probeLink',{assetId:'w1',mode:'none'})).error),'Only server cards take a probe link');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='s3').probeLink)&&(await call('serverMetrics',{assetId:'s3'})).result.linked===false,'One undo removes the hand link');
  // One step: while s1 is out of matching no panel covers it, so a panel answer landing in between would let SSH 直读 turn on tokyo-vps.
  const [none,noneKept,auto,autoKept]=await p.evaluate(()=>{const one=mode=>assetboardAgent({requestId:'t',method:'probeLink',params:{assetId:'s1',mode}});
   const n=one('none'),kept=state.assets.find(a=>a.id==='s1').probeLink?.none===true,a=one('auto');return [n,kept,a,!('probeLink' in state.assets.find(x=>x.id==='s1'))];});
  replies.push(JSON.stringify(none),JSON.stringify(auto));
  check(none.result.linked===false&&none.result.probeLink==='none'&&noneKept,'mode none keeps the card out of matching');
  r=auto;
  check(r.result.linked===true&&autoKept,'mode auto matches it again');
  r=await call('update',{id:'s4',fields:{probeLink:{source:'src1',serverId:'c'},stopped:true}});
  check(r.ok&&r.result.asset.probeLink.id==='c'&&r.result.asset.stopped===true&&await p.evaluate(()=>probeOf(state.assets.find(a=>a.id==='s4'))?.server.id==='c'),'update_asset takes probeLink with stopped: '+JSON.stringify(r.error||r.result.asset.probeLink));
  check(/probeLink/.test((await call('update',{id:'s4',fields:{probeLink:'sometimes'}})).error),'A bad probeLink is refused');
  r=await call('updateMany',{updates:[{id:'s4',fields:{probeLink:'auto'}},{id:'w1',fields:{probeLink:'none'}}]});
  check(r.result.updated===1&&r.result.failed===1&&await p.evaluate(()=>!state.assets.find(a=>a.id==='s4').probeLink),'update_assets: probeLink per item, a bank card refused: '+JSON.stringify(r.result));
  // A poll may be reading the source again just now (sourceStatus loading); the readings are read once it has settled.
  for(let i=0;i<200&&(r=await call('serverMetrics',{assetId:'s1'})).result?.sourceStatus==='loading';i++)await p.waitForTimeout(50);
  check(r.ok&&r.result.linked&&r.result.online===true&&r.result.cpu===23&&r.result.memory.percent===25&&r.result.disk.percent===25&&r.result.traffic.bytes>0&&r.result.sourceStatus==='ok','get_server_metrics: '+JSON.stringify(r.result));
  await until(p,()=>!!probeHistoryOf(probeOf(state.assets.find(a=>a.id==='s1'))));
  r=await call('serverMetrics',{assetId:'s1'});
  check(r.result.history?.cpu?.max===49&&r.result.history.span==='24h','get_server_metrics summarizes the history: '+JSON.stringify(r.result.history));
  check((await call('serverMetrics',{assetId:'s3'})).result.linked===false&&/只有服务器/.test((await call('serverMetrics',{assetId:'w1'})).error),'An unlinked card says so; a bank card has no readings');

  // Removing a source waits for the person: nothing is removed until allowed here.
  r=await call('probeSourceRemove',{id:added,reason:'不用了'});
  check(r.ok&&r.result.status==='pending'&&/^act-/.test(r.result.actionId),'remove_probe_source is pending: '+JSON.stringify(r));
  const removeAction=r.result.actionId;
  check(await p.evaluate(()=>$('#modal').open&&$('#modal').dataset.view==='agent-confirm'&&$('#modal-title').textContent==='删除探针数据源？'&&/改名的面板/.test($('#modal-content').textContent)&&/不用了/.test($('#modal-content').textContent)),'The app lists the request with its reason');
  check(!(await sent('probeRemove')).length,'Nothing is removed before the person allows it');
  check((await call('probeSourceRemove',{id:added})).result.alreadyPending?.[0]?.actionId===removeAction,'Asking again is folded into the waiting request');
  check((await call('action',{id:removeAction})).result.status==='pending','get_action_status: pending');
  await p.click('#agent-confirm-yes');
  check((await sent('probeRemove')).length===1&&(await sent('probeRemove'))[0].id===added,'Allowed: the app removes the source');
  r=await call('action',{id:removeAction});
  check(r.result.status==='done'&&r.result.items[0].status==='applied','get_action_status: done, applied: '+JSON.stringify(r.result));
  await until(p,()=>probe.sources.length===1);
  r=await call('probeSourceRemove',{id:'src1'});
  await p.click('#agent-confirm-no');
  check((await call('action',{id:r.result.actionId})).result.status==='cancelled'&&!(await sent('probeRemove')).some(m=>m.id==='src1'),'全部拒绝: cancelled, nothing removed');

  // SSH 直读: aliases only; turning one on waits for the person, turning one off is at once and remembered.
  r=await call('sshHosts');
  check(r.ok&&r.result.listed&&r.result.hosts.map(h=>h.alias).join()==='tokyo-vps,lab-box'&&r.result.interval===60&&r.result.hosts.every(h=>!h.enabled),'list_ssh_hosts: '+JSON.stringify(r.result));
  check(/别名/.test((await call('sshSet',{alias:'ghost',enabled:true})).error)&&/true 或 false/.test((await call('sshSet',{alias:'lab-box',enabled:'yes'})).error),'Unknown aliases and non-boolean switches are refused');
  r=await call('sshSet',{alias:'lab-box',enabled:true,reason:'看看负载'});
  check(r.ok&&r.result.status==='pending','set_ssh_host on is pending: '+JSON.stringify(r));
  const sshAction=r.result.actionId;
  check(await p.evaluate(()=>$('#modal').dataset.view==='agent-confirm'&&/钥匙/.test($('#modal-content').textContent)&&/lab-box/.test($('#modal-content').textContent)),'The confirmation says it lends the keys');
  check(!(await sent('sshProbeSet')).some(m=>m.on),'Nothing is turned on before the person allows it');
  check(await p.evaluate(()=>!!$('#action-banner'))===false,'No banner over an open confirmation');
  await p.click('#agent-confirm-yes');
  check((await sent('sshProbeSet')).some(m=>m.alias==='lab-box'&&m.on===true)&&(await call('action',{id:sshAction})).result.status==='done','Allowed: SSH 直读 turned on');
  await until(p,()=>sshSession('lab-box').reason==='down');
  r=await call('sshHosts');const lab=r.result.hosts.find(h=>h.alias==='lab-box');
  check(lab.enabled&&lab.status==='error'&&lab.problem==='down'&&lab.message==='连不上','A failed read is a code and fixed words: '+JSON.stringify(lab));
  r=await call('probeServers',{source:'ssh'});
  check(r.result.servers.length===1&&r.result.servers[0].serverId==='lab-box'&&!r.result.servers[0].linkedAssetId,'list_probe_servers includes SSH 直读 hosts: '+JSON.stringify(r.result));
  r=await call('sshRefresh',{alias:'lab-box'});
  check(r.ok&&r.result.status==='refreshing'&&r.result.aliases[0]==='lab-box','refresh_ssh one host');
  check((await call('sshInterval',{seconds:45})).ok===false&&(await call('sshInterval',{seconds:120})).result.interval===120&&(await sent('sshProbeInterval')).pop().seconds===120,'set_ssh_interval takes only the listed values');
  r=await call('sshSet',{alias:'lab-box',enabled:false});
  check(r.ok&&r.result.status==='off'&&r.result.manuallyOff===true&&(await sent('sshProbeSet')).pop().on===false,'set_ssh_host off is at once');
  await until(p,()=>!sshEnabled('lab-box'));
  r=await call('sshHosts');
  check(r.result.hosts.find(h=>h.alias==='lab-box').manuallyOff===true&&r.result.interval===120,'Switched off by hand is remembered: '+JSON.stringify(r.result.hosts));
  check(/没有开启/.test((await call('sshRefresh',{alias:'lab-box'})).error),'refresh_ssh of a host that is off is refused');

  // Site icons: a platform's site (board data, undoable), and a fetch that answers fetching and applies in one undo step.
  r=await call('iconPlatforms');
  const wise=r.result.platforms.find(x=>x.platform==='wise.com');
  check(wise&&wise.assets===2&&wise.withIcon===0&&!wise.customSite&&r.result.lastFetch===null,'list_icon_platforms: '+JSON.stringify(r.result));
  check(/不接受 IP/.test((await call('iconSite',{platform:'wise.com',site:'192.168.1.1'})).error)&&/没有这个平台/.test((await call('iconSite',{platform:'nope.example',site:'x.example'})).error),'Bad sites and unknown platforms are refused');
  r=await call('iconSite',{platform:'wise.com',site:'https://cdn.wise-icons.example/logo'});
  check(r.ok&&r.result.site==='cdn.wise-icons.example'&&r.result.customSite&&await p.evaluate(()=>state.iconSites['wise.com']==='cdn.wise-icons.example'),'set_icon_site: '+JSON.stringify(r));
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.iconSites),'One undo takes the site back');
  await p.evaluate(()=>redo());
  r=await call('iconFetch',{platform:'wise.com'});
  check(r.ok&&r.result.status==='fetching'&&/^icons-/.test(r.result.jobId)&&r.result.platforms[0].site==='cdn.wise-icons.example','fetch_icons answers fetching: '+JSON.stringify(r));
  check((await sent('iconFetch')).pop().host==='cdn.wise-icons.example','The chosen site is asked');
  await until(p,()=>assetboardAgent({requestId:'x',method:'iconPlatforms',params:{}}).result.lastFetch.status==='done');
  r=await call('iconPlatforms');
  check(r.result.lastFetch.applied===2&&r.result.platforms.find(x=>x.platform==='wise.com').withIcon===2&&await p.evaluate(()=>state.assets.filter(a=>a.provider==='Wise').every(a=>a.siteIconHost==='cdn.wise-icons.example')),'The icons are applied: '+JSON.stringify(r.result.lastFetch));
  check(!replies.some(x=>x.includes('base64')),'No reply carries image data');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.assets.filter(a=>a.provider==='Wise').every(a=>!a.siteIcon)),'One undo removes the fetched icons');
  r=await call('iconFetch',{assetIds:['w1','nope']});
  check(r.result.notRecognized?.[0]==='nope'&&r.result.platforms[0].assets===1,'fetch_icons by asset ids: '+JSON.stringify(r.result));
  await until(p,()=>assetboardAgent({requestId:'x',method:'iconPlatforms',params:{}}).result.lastFetch.status!=='fetching');

  // Cloudflare: triggered only, never with a token; the result is looked up, errors cleaned of anything key-like.
  r=await call('cloudflareStatus');
  check(r.result.connected===true&&r.result.syncing===false&&r.result.lastSyncAt===null&&r.result.lastResult===null,'get_cloudflare_sync_status: '+JSON.stringify(r.result));
  check(/令牌只能在 Assetboard/.test((await call('cloudflareSync',{token:'cfTOKENabcdefghijklmnopqrstuvwxyz0123'})).error),'sync_cloudflare refuses a token');
  // Both calls in one step: the stub answers the sync after 30 ms, so the second must land while the first still runs.
  const [first,second]=await p.evaluate(()=>[1,2].map(()=>assetboardAgent({requestId:'t',method:'cloudflareSync',params:{}})));
  replies.push(JSON.stringify(first),JSON.stringify(second));r=first;
  check(r.ok&&r.result.status==='syncing'&&(await sent('cloudflareSync')).pop().token==='','sync_cloudflare answers syncing and sends no token');
  check(second.result.already===true,'A second call while it runs says so');
  await until(p,()=>assetboardAgent({requestId:'x',method:'cloudflareStatus',params:{}}).result.lastResult?.ok===true);
  r=await call('cloudflareStatus');
  check(r.result.lastResult.added===2&&r.result.assets.total===2&&r.result.lastSyncAt&&r.result.syncing===false,'The sync is looked up afterwards: '+JSON.stringify(r.result));
  await p.evaluate(()=>{window.__cfFail=true;});await call('cloudflareSync');
  await until(p,()=>assetboardAgent({requestId:'x',method:'cloudflareStatus',params:{}}).result.lastResult?.ok===false);
  r=await call('cloudflareStatus');
  check(/Cloudflare refused/.test(r.result.lastResult.error)&&!r.result.lastResult.error.includes('cfTOKEN'),'A failed sync says why without the key: '+JSON.stringify(r.result.lastResult));

  // The sync blocklist: listed by key; letting one back waits for the person, then undoes with ⌘Z.
  r=await call('syncBlocklist');
  check(r.result.total===2&&r.result.items[0].key==='cloudflare:zone:z9'&&r.result.items[0].kind==='zone'&&r.result.items[1].source==='github','list_sync_blocklist: '+JSON.stringify(r.result));
  check(/跳过列表/.test((await call('syncUnblock',{key:'cloudflare:zone:nope'})).error),'An unknown key is refused');
  r=await call('syncUnblock',{key:'cloudflare:zone:z9'});
  check(r.result.status==='pending'&&await p.evaluate(()=>state.deletedExternalIds.includes('cloudflare:zone:z9')),'unblock_sync_item is pending');
  await p.click('#agent-confirm-yes');
  check(await p.evaluate(()=>!state.deletedExternalIds.includes('cloudflare:zone:z9')&&!state.deletedExternalIds.includes('cloudflare-zone-z9')&&state.deletedExternalIds.includes('github:4242')),'Allowed: the key and its record id leave the list');
  check((await call('action',{id:r.result.actionId})).result.status==='done','get_action_status: done');
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.deletedExternalIds.includes('cloudflare:zone:z9')),'One undo puts it back on the list');
  // A request still waiting comes back after a restart: the saved board keeps it, the list opens again.
  r=await call('syncUnblock',{key:'github:4242'});
  const kept=await p.evaluate(()=>window.__sent.filter(m=>m.action==='save').pop().data);
  check(kept.agentActions.some(a=>a.id===r.result.actionId&&a.status==='pending'),'The waiting request is saved with the board');
  const again=await browser.newContext(),q=await again.newPage();
  try{
   await q.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});await q.addInitScript(stub,kept);await q.goto('http://127.0.0.1:4317/');
   await until(q,()=>typeof assetboardAgent==='function'&&$('#modal').open&&$('#modal').dataset.view==='agent-confirm');
   check(await q.evaluate(()=>/github:4242/.test($('#modal-content').textContent)&&intake.filter(i=>i.confirmKind).length===1),'After a restart the request is listed again');
  }finally{await again.close();}
  await p.evaluate(()=>$('#modal').close());await until(p,()=>!agentConfirmOpen);
  check((await call('actions',{status:'pending'})).result.total===0&&(await call('action',{id:r.result.actionId})).result.items[0].status==='declined','Closing the list declines what it held');
  check((await call('actions',{})).result.actions.some(a=>a.kind==='sshEnable')&&(await call('actions',{})).result.actions.some(a=>a.kind==='probeRemove'),'list_pending_actions shows the settings requests too');

  // Nothing secret came back, and the settings the app keeps went out without credentials.
  for(const secret of SECRETS)check(!replies.some(x=>x.includes(secret)),`A reply carries ${secret}`);
  check(!(await sent('probeSave')).some(m=>'username' in m||'password' in m),'probeSave never carried an account');
  check(!errors.length,'page errors: '+errors.join(' | '));
 } finally { await context.close(); }

 // The demo refuses every call; with ?free the methods are not there (tests/free-edition.playwright.js).
 const demo=await browser.newContext(),d=await demo.newPage();
 try{
  await d.addInitScript(()=>{window.webkit={messageHandlers:{assetboard:{postMessage(){}}}};window.__ASSETBOARD_NATIVE__={data:null,demo:true,probeSources:[],cloudflareConnected:false,githubConnected:false,gmailConfigured:false};});
  await d.goto('http://127.0.0.1:4317/');await until(d,()=>typeof assetboardAgent==='function');
  const refused=await d.evaluate(()=>['probeSources','sshSet','iconFetch','cloudflareSync','syncUnblock'].map(method=>assetboardAgent({requestId:'d',method,params:{}})));
  check(refused.every(r=>!r.ok&&/演示模式/.test(r.error)),'The demo refuses: '+JSON.stringify(refused));
 }finally{await demo.close();}
 return 'PASS: probe sources listed without accounts, added by address only (needsLogin, fixed words), renamed, refreshed, removed after confirming; probe servers, hand links (undo, none, auto, refused pairs), probeLink in update_asset(s), server metrics with history; SSH hosts by alias only, on after confirming, off at once and remembered, interval, refresh, errors as codes; icon sites (undo), icon fetch answered later in one undo; Cloudflare sync triggered without a token and looked up, key-like text cleaned; sync blocklist unblocked after confirming (undo); no secret in any reply; demo refuses';
}
