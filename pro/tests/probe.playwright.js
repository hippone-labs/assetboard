// Run with the browser tool's filename option. task-11, probe data sources (Pro): with a stubbed Mac app answering like a
// CF-Server-Monitor panel, linked server cards show 在线/离线, CPU, 内存, 磁盘, 本月流量 and 最后上报 in the list, the detail and 全景;
// an offline one is red; it replaces the implied 运行中 while a hand-set 已停用 still stands (readings beside it, never red);
// servers no card matched can be linked by hand, and unlinked;
// one broken source does not stop another; readings, the panel address and tokens never reach the saved board. Then the demo's
// screenshot switches (`--demo --open-asset=…`, `--demo --panorama`). Isolated pages; no panel is called.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const browser=page.context().browser();
 const open=async(init,arg)=>{const context=await browser.newContext(),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});await p.addInitScript(init,arg);await p.goto('http://127.0.0.1:4317/');
  for(let i=0;i<100&&!await p.evaluate(()=>typeof probeDialog==='function'&&typeof state!=='undefined');i++)await wait(40);return {context,p,errors};};
 // say(el), inlined where used (the page's CSP forbids eval): an element's text plus every accessible name and tip inside it,
 // since the gauges are drawn and their words live there.
 const until=async(p,fn,arg)=>{for(let i=0;i<120;i++){if(await p.evaluate(fn,arg))return;await wait(40);}throw new Error('Timed out: '+String(fn).slice(0,90));};

 const {context,p,errors}=await open(()=>{
  const now=Date.now(),GB=1024**3;
  const row=(id,name,cpu,ago,extra={})=>({id,name,cpu,ram_used:1024,ram_total:4096,disk_used:20480,disk_total:81920,net_rx_monthly:30*GB,net_tx_monthly:10*GB,traffic_calc_type:'total',last_updated:now-ago*60000,ip_v4:'1',ip_v6:'0',...extra});
  window.__sent=[];window.__saved=[];window.__msgs=[];
  window.__answers={src1:{servers:[row('a','tokyo-vps',23,1),row('b','backup-box',3,95),row('c','lab-pi',41,2)],stats:{total:3}}};
  window.webkit={messageHandlers:{assetboard:{postMessage(msg){
   window.__sent.push(msg.action);if(String(msg.action).startsWith('probe'))window.__msgs.push(JSON.parse(JSON.stringify(msg)));
   if(msg.action==='save'){window.__saved.push(JSON.stringify(msg));setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);}
   if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(msg.action==='probeRefresh'){
    for(const s of window.__ASSETBOARD_NATIVE__.probeSources){if(msg.id&&msg.id!==s.id)continue;
     window.assetboardProbe({source:s.id,loading:true});
     setTimeout(()=>window.assetboardProbe(s.id==='src2'?{source:s.id,error:'用户名或密码不对',status:401,reason:'credentials'}:{source:s.id,kind:'cfsm',data:window.__answers[s.id],at:Date.now()}),30);}
   }
   // 24 hours of history for what was asked, as /api/history/all rows; the live socket opens a moment after it is asked for.
   if(msg.action==='probeHistory')setTimeout(()=>window.assetboardProbe({source:msg.id,history:Object.fromEntries(msg.servers.map(id=>[id,Array.from({length:120},(_,i)=>({timestamp:now-(119-i)*720000,cpu:20+15*Math.sin(i/9),ram_used:1024+400*Math.sin(i/20),ram_total:4096}))]))}),20);
   // Saving, as the app does it: keep the source (the name falls back to the host), then read it. A host starting with "private."
   // answers 401 until an account is given; pw-test is its password.
   if(msg.action==='probeSave'){
    const list=window.__ASSETBOARD_NATIVE__.probeSources,id=msg.id||'new'+list.length,host=new URL(msg.url).host,was=list.find(x=>x.id===id);
    const account=msg.clearLogin?null:msg.username?{username:msg.username,password:msg.password}:was?.hasLogin?{username:was.username,password:window.__pw?.[id]}:null;
    if(account)(window.__pw||={})[id]=account.password;
    const src={id,kind:msg.kind,name:msg.name||host,url:msg.url,hasLogin:!!account,username:account?.username||''};
    if(was)Object.assign(was,src);else list.push(src);window.__answers[id]={servers:[],stats:{total:0}};
    setTimeout(()=>{window.assetboardProbe({sources:list.map(x=>({...x})),saved:id});window.assetboardProbe({source:id,loading:true});
     setTimeout(()=>window.assetboardProbe(host.startsWith('private.')&&!account?{source:id,error:'面板不公开：请填写面板账号',status:401,reason:'private'}
      :host.startsWith('private.')&&account.password!=='pw-test'?{source:id,error:'用户名或密码不对',status:401,reason:'credentials'}
      :{source:id,kind:'cfsm',data:window.__answers[id],at:Date.now()}),30);},10);
   }
   if(msg.action==='probeLiveStart'&&!window.__holdLive)setTimeout(()=>window.assetboardProbe({source:msg.id,live:'open'}),20);
  }}}};
  const server=(id,name,extra={})=>({id,type:'server',name,provider:'Example',source:'manual',art:'generic',cost:'未知',...extra});
  window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'server',width:50,height:null,density:'full',folded:false}],assets:[
   server('s1','tokyo-vps',{ips:['203.0.113.10']}),server('s2','backup-box'),server('s3','paris-vps'),server('s4','spare')],deletedExternalIds:[]},
   probeSources:[{id:'src1',kind:'cfsm',name:'我的探针',url:'https://status.example.com',hasLogin:false,username:''},{id:'src2',kind:'cfsm',name:'私有面板',url:'https://private.example.net',hasLogin:true,username:'admin'}],
   cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
 });
 try{
  await until(p,()=>!!document.querySelector('[data-probe-row="s1"]'));
  const rows=await p.evaluate(()=>{const say=(el=>el?[el.textContent,...[el,...el.querySelectorAll('[aria-label],[title]')].flatMap(n=>[n.getAttribute('aria-label'),n.getAttribute('title')])].filter(Boolean).join(' | '):'');return {
   s1:say(document.querySelector('[data-probe-row="s1"]')),s1cls:document.querySelector('[data-probe-row="s1"]')?.className||'',
   s1text:document.querySelector('[data-probe-row="s1"]')?.innerText||'',
   s1gauges:[...document.querySelectorAll('[data-probe-row="s1"] .pg')].map(g=>({img:g.getAttribute('role')==='img',name:g.getAttribute('aria-label'),tip:g.getAttribute('title'),bar:!!g.querySelector('.pg-bar')})),
   s2:say(document.querySelector('[data-probe-row="s2"]')),s2row:document.querySelector('[data-asset="s2"]').className,
   s2ring:!!document.querySelector('[data-asset="s2"] .stop-ring'),s3:!!document.querySelector('[data-probe-row="s3"]'),
   refreshes:window.__sent.filter(a=>a==='probeRefresh').length};});
  check(/在线/.test(rows.s1)&&/CPU 23%/.test(rows.s1)&&/内存 25%/.test(rows.s1)&&/磁盘 25%/.test(rows.s1)&&/本月流量 40 GB/.test(rows.s1)&&/on/.test(rows.s1cls),'a linked row shows the probe: '+JSON.stringify(rows));
  // Drawn, not written: four gauges (CPU, 内存, 磁盘 with a bar; traffic without a limit has none), each an image with words.
  check(rows.s1gauges.length===4&&rows.s1gauges.every(g=>g.img&&g.name&&g.name===g.tip)&&rows.s1gauges.filter(g=>g.bar).length===3,'row gauges: '+JSON.stringify(rows.s1gauges));
  check(!/在线|CPU|内存|磁盘|流量/.test(rows.s1text),'the row shows numbers, not words: '+rows.s1text);
  check(/离线/.test(rows.s2)&&/1 小时前/.test(rows.s2)&&/probe-down/.test(rows.s2row),'an offline row is marked down, with when it last reported: '+JSON.stringify(rows));
  check(!rows.s2ring&&!/\bstopped\b/.test(rows.s2row),'a linked server is not drawn as stopped');
  check(!rows.s3,'a card nothing matched has no probe line');
  check(rows.refreshes===1,'one refresh on launch: '+rows.refreshes);
  const red=await p.evaluate(()=>({dot:getComputedStyle(document.querySelector('[data-probe-row="s2"] .probe-dot')).backgroundColor,seen:getComputedStyle(document.querySelector('[data-probe-row="s2"] .probe-seen')).color,
   quiet:getComputedStyle(document.querySelector('[data-probe-row="s1"] .probe-dot')).backgroundColor}));
  const isRed=c=>/rgb\((1[5-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)/.test(c);
  check(isRed(red.dot)&&isRed(red.seen)&&!isRed(red.quiet),'offline is a red dot and red time; online is quiet: '+JSON.stringify(red));

  // The detail: every reading, and where it comes from.
  const detail=await p.evaluate(()=>{showDetail('s1');return (el=>el?[el.textContent,...[el,...el.querySelectorAll('[aria-label],[title]')].flatMap(n=>[n.getAttribute('aria-label'),n.getAttribute('title')])].filter(Boolean).join(' | '):'')(document.querySelector('#detail-content .probe-facts'));});
  // The detail is a card: three rings filled to their share, a traffic bar, icon buttons with names.
  const card=await p.evaluate(()=>{const c=document.querySelector('#detail-content .probe-card');const ring=k=>{const f=c.querySelector(`.pg-${k} .pg-fill`),t=c.querySelector(`.pg-${k} .pg-track`);if(!f)return null;const r=+t.getAttribute('r'),[len]=f.getAttribute('stroke-dasharray').split(' ').map(Number);return Math.round(len/(2*Math.PI*r)*100);};
   return {card:!!c,rings:c.querySelectorAll('.pc-rings .pg-ring').length,cpu:ring('cpu'),mem:ring('mem'),net:!!c.querySelector('.pg-net .pg-bar'),
    buttons:[...c.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')),width:c.scrollWidth<=c.clientWidth+1};});
  check(card.card&&card.rings===3&&card.cpu===23&&card.mem===25&&card.net&&card.width,'the detail card draws its readings: '+JSON.stringify(card));
  check(card.buttons.includes('刷新探针')&&card.buttons.includes('取消关联'),'icon buttons are named: '+JSON.stringify(card.buttons));
  for(const word of ['在线','CPU','23%','内存','1 GB / 4 GB','磁盘','20 GB / 80 GB','本月流量','40 GB','最后上报','我的探针','按名称匹配','刷新','取消关联'])check(detail.includes(word),`the detail lacks ${word}: ${detail}`);

  // ---- task-15 / 15b: history sparklines, live updates, backoff, fallback to polling, refusals, account form ----
  await until(p,()=>!!document.querySelector('#detail-content .ps-card path.ps-cpu'));
  const spark=await p.evaluate(()=>{const c=document.querySelector('#detail-content .ps-card');return {name:c.getAttribute('aria-label'),tip:c.getAttribute('title'),cpu:c.querySelector('.ps-cpu').getAttribute('d'),mem:c.querySelector('.ps-mem')?.getAttribute('d')||'',text:c.innerText.trim()};});
  check(/过去 24 小时/.test(spark.name)&&/CPU 平均 \d+%，最高 \d+%/.test(spark.name)&&/内存 平均/.test(spark.name)&&spark.name===spark.tip,'the sparkline says what it draws: '+JSON.stringify(spark));
  check(spark.cpu.split('L').length===120&&spark.mem.length>0&&spark.text==='24h','two lines over 120 points, one tiny label: '+JSON.stringify({points:spark.cpu.split('L').length,text:spark.text}));
  const asked=await p.evaluate(()=>({history:window.__msgs.filter(m=>m.action==='probeHistory'),live:window.__msgs.filter(m=>m.action==='probeLiveStart')}));
  check(asked.history.length===1&&asked.history[0].id==='src1'&&JSON.stringify(asked.history[0].servers.sort())==='["a","b"]','history is asked once, for the linked servers: '+JSON.stringify(asked.history));
  check(asked.live.length===1&&asked.live[0].id==='src1'&&asked.live[0].servers.length===3,'one live socket for the source that answered: '+JSON.stringify(asked.live));
  await until(p,()=>probe.live.get('src1')?.state==='open'&&!!document.querySelector('#detail-content .probe-live'));
  // Live: an update lands on the row without a refresh.
  await p.evaluate(()=>window.assetboardProbe({source:'src1',updates:[{serverId:'a',samples:[{ts:Date.now(),data:{cpu:77}}]}]}));
  await until(p,()=>/CPU 77%/.test(document.querySelector('[data-probe-row="s1"]')?.getAttribute('aria-label')||''));
  // A tick while src1 is live reads only src2 (which never went live), and asks for no history.
  const tick=await p.evaluate(()=>{const n=window.__msgs.length;const due=probePollTick();return {due,sent:window.__msgs.slice(n)};});
  check(JSON.stringify(tick.due)==='["src2"]'&&tick.sent.every(m=>m.action==='probeRefresh'&&m.id==='src2'),'live open: no polling for it, no history: '+JSON.stringify(tick));
  // A drop: tried again after 0.5–1 s (attempt 0), and again on the next drop after 1–2 s.
  await p.evaluate(()=>{window.__holdLive=true;window.assetboardProbe({source:'src1',live:'closed',status:1006});});
  const wait1=await p.evaluate(()=>({state:probe.live.get('src1').state,delay:probe.live.get('src1').delay}));
  check(wait1.state==='waiting'&&wait1.delay>=500&&wait1.delay<=1000,'first retry within a second: '+JSON.stringify(wait1));
  check(await p.evaluate(()=>probePollTick().includes('src1')),'while live is down, the poll reads the source');
  await until(p,()=>window.__msgs.filter(m=>m.action==='probeLiveStart').length===2);
  await p.evaluate(()=>window.assetboardProbe({source:'src1',live:'closed',status:0}));
  const wait2=await p.evaluate(()=>probe.live.get('src1'));
  check(wait2.state==='waiting'&&wait2.delay>=1000&&wait2.delay<=2000&&wait2.attempt===2,'the wait doubles: '+JSON.stringify(wait2));
  // Refused (401/403) or not offered (426/503): no more tries until 刷新; polling carries on.
  await p.evaluate(()=>window.assetboardProbe({source:'src1',live:'closed',status:403}));
  await new Promise(r=>setTimeout(r,2200));
  const refused=await p.evaluate(()=>({state:probe.live.get('src1').state,starts:window.__msgs.filter(m=>m.action==='probeLiveStart').length,due:probePollTick()}));
  check(refused.state==='refused'&&refused.starts===2&&refused.due.includes('src1'),'a refused socket stops, polling takes over: '+JSON.stringify(refused));
  // 刷新 by hand: asks the app to lift any stop (manual), reads history again, and live may try again.
  await until(p,()=>!document.querySelector('#detail-content [data-action="probe-refresh"]').disabled);
  await p.evaluate(()=>{window.__holdLive=false;document.querySelector('#detail-content [data-action="probe-refresh"]').click();});
  const manual=await p.evaluate(()=>window.__msgs.filter(m=>m.action==='probeRefresh'&&m.manual).at(-1)||{});
  check(manual.manual===true&&manual.id==='src1','a refresh by hand says so: '+JSON.stringify(manual));
  await until(p,()=>window.__msgs.filter(m=>m.action==='probeHistory').length===2&&probe.live.get('src1')?.state==='open');
  // Hidden: the socket closes; back: it opens again.
  await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  check(await p.evaluate(()=>window.__msgs.at(-1).action==='probeLiveStop'&&probe.live.get('src1').state==='paused'),'hidden: live stops');
  await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await until(p,()=>probe.live.get('src1')?.state==='open');
  // A refusal keeps what was read before: the readings stay on the card.
  await p.evaluate(()=>window.assetboardProbe({source:'src1',error:'面板开了人机验证：为 Assetboard 关掉，或把面板设为公开',status:403,reason:'turnstile'}));
  await new Promise(r=>setTimeout(r,100));
  const kept=await p.evaluate(()=>({row:!!document.querySelector('[data-probe-row="s1"] .pg-cpu'),mark:document.querySelector('#detail-content .probe-note')?.getAttribute('aria-label')||''}));
  check(kept.row&&/人机验证/.test(kept.mark)&&/上次读到的数据/.test(kept.mark),'a Turnstile refusal keeps the readings and says so in a tip: '+JSON.stringify(kept));
  await p.evaluate(()=>window.assetboardProbe({source:'src1',kind:'cfsm',data:window.__answers.src1,at:Date.now()}));
  // The add form asks for the address only: no type, no name, no account until a panel says it needs one.
  await p.evaluate(()=>probeDialog({add:true}));
  const form=await p.evaluate(()=>({fields:[...document.querySelectorAll('.probe-add input,.probe-add select')].filter(e=>e.type!=='hidden'&&e.getClientRects().length).map(e=>e.id),
   kind:!!document.querySelector('#probe-kind'),token:!!document.querySelector('#probe-token'),note:document.querySelector('#probe-credential-note').textContent}));
  check(JSON.stringify(form.fields)==='["probe-url"]'&&!form.kind&&!form.token&&/钥匙串/.test(form.note)&&!/READ_TOKEN|JWT/.test(form.note),'only the address is asked: '+JSON.stringify(form));
  // One short note, a refresh icon with a name, and a server no card took on one line with its picker beside it.
  const look=await p.evaluate(()=>{const li=document.querySelector('.probe-loose li'),sel=li?.querySelector('select');
   return {notes:[...document.querySelectorAll('#modal .form-note')].filter(n=>n.textContent.trim()&&n.id!=='probe-status'&&n.getClientRects().length).map(n=>n.textContent.trim()),
    refresh:[...document.querySelectorAll('.probe-source [data-action="probe-refresh"]')].map(b=>({label:b.getAttribute('aria-label'),tip:b.getAttribute('title'),text:b.textContent.trim(),icon:!!b.querySelector('svg')})),
    loose:li?{height:Math.round(li.getBoundingClientRect().height),one:Math.abs(li.querySelector('b').getBoundingClientRect().top-li.querySelector('small').getBoundingClientRect().top)<6,
     selRight:Math.round(sel.getBoundingClientRect().right),liRight:Math.round(li.getBoundingClientRect().right)}:null};});
  check(look.notes.length===1&&look.notes[0]==='只读取，账号只存钥匙串。','one short note: '+JSON.stringify(look.notes));
  check(look.refresh.length===2&&look.refresh.every(r=>r.label==='刷新'&&r.tip==='刷新'&&r.icon&&!r.text),'刷新 is a named icon: '+JSON.stringify(look.refresh));
  check(look.loose&&look.loose.one&&look.loose.height<=40&&look.loose.liRight-look.loose.selRight<=1,'the unmatched row is one line, picker at the end: '+JSON.stringify(look.loose));
  const pick=await p.evaluate(()=>{const li=document.querySelector('.probe-loose li'),sel=li.querySelector('select').getBoundingClientRect(),name=li.querySelector('b').getBoundingClientRect();
   return {selH:Math.round(sel.height),centre:Math.round(Math.abs((sel.top+sel.height/2)-(name.top+name.height/2)))};});
  check(pick.selH<=30&&pick.centre<=2,'a compact picker, centred on the row: '+JSON.stringify(pick));
  // The sparkline's CPU line is the theme accent; 内存 stays grey, and the legend matches.
  const colors=await p.evaluate(()=>{const c=document.querySelector('#detail-content .ps-card');const primary=getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').trim().split(/[ ,]+/).join(', ');
   return {primary:`rgb(${primary})`,cpu:getComputedStyle(c.querySelector('.ps-cpu')).stroke,key:getComputedStyle(c.querySelector('.ps-k-cpu')).backgroundColor,mem:getComputedStyle(c.querySelector('.ps-mem')).stroke,memKey:getComputedStyle(c.querySelector('.ps-k-mem')).backgroundColor};});
  check(colors.cpu===colors.primary&&colors.key===colors.primary&&colors.mem!==colors.primary&&colors.mem===colors.memKey,'CPU in the accent, 内存 grey, legend alike: '+JSON.stringify(colors));
  // A bad address is refused in place; nothing is sent.
  let before=await p.evaluate(()=>window.__msgs.length);
  await p.fill('#probe-url','ftp://panel.example.org');await p.click('[data-action="probe-save"]');
  check(await p.evaluate(b=>window.__msgs.length===b&&/面板地址不对/.test(document.querySelector('#probe-status').textContent),before),'a bad address is refused in place');
  // A public panel: typed without https and with the admin page's path; saved as its origin with no account, and read.
  await p.fill('#probe-url','panel.example.org/admin#/admin');await p.click('[data-action="probe-save"]');
  const pub=await p.evaluate(()=>window.__msgs.at(-1));
  check(pub.action==='probeSave'&&pub.url==='https://panel.example.org'&&pub.kind==='cfsm'&&pub.name===''&&!('id' in pub)&&!('username' in pub)&&!('password' in pub),'a public panel is saved by its origin, nothing else: '+JSON.stringify(pub));
  await until(p,()=>/已连上 · 0 台/.test(document.querySelector('#probe-status').textContent));
  const pubAfter=await p.evaluate(()=>({url:document.querySelector('#probe-url').value,account:document.querySelector('#probe-account').hidden,name:probe.sources.find(s=>s.url==='https://panel.example.org')?.name}));
  check(pubAfter.url===''&&pubAfter.account&&pubAfter.name==='panel.example.org','connected: the form empties, no account was asked, the name is the host: '+JSON.stringify(pubAfter));
  // A private panel: the first read answers 401, so the account fields open with one hint line; half an account is refused.
  await p.fill('#probe-url','private.example.org');await p.click('[data-action="probe-save"]');
  const first=await p.evaluate(()=>window.__msgs.at(-1));
  check(!('username' in first)&&first.url==='https://private.example.org','the first try is public: '+JSON.stringify(first));
  await until(p,()=>!document.querySelector('#probe-account').hidden);
  const ask=await p.evaluate(()=>({hint:document.querySelector('#probe-account-hint').textContent.trim(),hintShown:!!document.querySelector('#probe-account-hint').getClientRects().length,
   focus:document.activeElement?.id,url:document.querySelector('#probe-url').value,id:document.querySelector('#probe-id').value,
   fields:[...document.querySelectorAll('.probe-add input')].filter(e=>e.type!=='hidden'&&e.getClientRects().length).map(e=>e.id)}));
  check(ask.hintShown&&ask.hint==='面板不公开：填面板后台的账号。'&&ask.focus==='probe-username'&&ask.url==='https://private.example.org'&&ask.id&&JSON.stringify(ask.fields)==='["probe-url","probe-username","probe-password"]','401 opens the account inline: '+JSON.stringify(ask));
  // Laid out like the rest of the form: each label tight to its own field, a clear gap above the next.
  const fit=await p.evaluate(()=>{const labels=[...document.querySelectorAll('.probe-add label')].filter(l=>l.querySelector('input:not([type=hidden]):not([type=checkbox])')&&l.getClientRects().length);
   return {labels:labels.length,above:labels.slice(1).map((l,i)=>Math.round(l.getBoundingClientRect().top-labels[i].querySelector('input').getBoundingClientRect().bottom)),
    own:labels.map(l=>{const f=l.querySelector('input').getBoundingClientRect(),t=document.createRange();t.selectNodeContents(l.firstElementChild&&l.firstElementChild.tagName==='SPAN'?l.firstElementChild:l.childNodes[0]);return Math.round(f.top-t.getBoundingClientRect().bottom);})};});
  check(fit.labels===3&&fit.above.every(g=>g>=14)&&fit.own.every(g=>g>=0&&g<=8),'spacing: '+JSON.stringify(fit));
  before=await p.evaluate(()=>window.__msgs.length);
  await p.fill('#probe-username','admin');await p.click('[data-action="probe-save"]');
  check(await p.evaluate(b=>window.__msgs.length===b&&/都要填/.test(document.querySelector('#probe-status').textContent),before),'half an account is refused in place');
  // A wrong password says so and keeps the fields; the right one logs in, and the password field is cleared each time.
  await p.fill('#probe-password','nope');await p.click('[data-action="probe-save"]');
  await until(p,()=>/用户名或密码不对/.test(document.querySelector('#probe-status').textContent));
  check(await p.evaluate(()=>!document.querySelector('#probe-account').hidden&&document.querySelector('#probe-password').value===''),'a wrong account keeps the fields open');
  await p.fill('#probe-password','pw-test');await p.click('[data-action="probe-save"]');
  const sentSave=await p.evaluate(()=>window.__msgs.at(-1));
  check(sentSave.action==='probeSave'&&sentSave.id===ask.id&&sentSave.username==='admin'&&sentSave.password==='pw-test'&&!('token' in sentSave),'the account goes with the same source: '+JSON.stringify({...sentSave,password:'…'}));
  await until(p,()=>/已连上/.test(document.querySelector('#probe-status').textContent));
  check(await p.evaluate(()=>document.querySelector('#probe-account').hidden&&document.querySelector('#probe-url').value===''&&document.querySelector('#probe-password').value===''),'logged in: the form empties');
  // Editing keeps the kept password when it is left empty.
  await p.evaluate(()=>document.querySelector('[data-action="probe-edit"][data-id="src2"]').click());
  const edit=await p.evaluate(()=>({user:document.querySelector('#probe-username').value,pass:document.querySelector('#probe-password').value,pub:!document.querySelector('#probe-public-row').hidden,
   name:document.querySelector('#probe-name-row').hidden?null:document.querySelector('#probe-name').value,account:!document.querySelector('#probe-account').hidden,hint:!!document.querySelector('#probe-account-hint').getClientRects().length}));
  check(edit.user==='admin'&&edit.pass===''&&edit.pub&&edit.name==='私有面板'&&edit.account&&!edit.hint,'editing shows the name and the user name, never the password: '+JSON.stringify(edit));
  await p.click('[data-action="probe-save"]');
  const kept2=await p.evaluate(()=>window.__msgs.at(-1));
  check(kept2.action==='probeSave'&&kept2.id==='src2'&&kept2.name==='私有面板'&&!('password' in kept2)&&!('username' in kept2)&&!kept2.clearLogin,'an empty password keeps the kept account: '+JSON.stringify(kept2));
  await p.evaluate(()=>document.querySelector('#modal').close());
  // Every message the probe sent was one of the allowed ones, and none names a path, a method or a token.
  const msgs=await p.evaluate(()=>window.__msgs);
  check(msgs.every(m=>['probeSave','probeRemove','probeRefresh','probeHistory','probeLiveStart','probeLiveStop'].includes(m.action)),'only probe actions: '+[...new Set(msgs.map(m=>m.action))]);
  check(!msgs.some(m=>/\/api\/|\/admin|GET|POST|token/i.test(JSON.stringify(Object.keys(m)))||/\/api\/|\/admin/.test(JSON.stringify(m))),'no paths, methods or tokens in messages');

  // The dialog: each source with its own state, the broken one does not stop the other, the unmatched server can be linked.
  await p.evaluate(()=>probeDialog());
  await until(p,()=>/读取中|台/.test(document.querySelector('#probe-body')?.textContent||''));
  await until(p,()=>!/读取中/.test(document.querySelector('#probe-body').textContent));
  // Read until both lines settle: a poll may be reading a source again (读取中…) at that moment, at most 8 s.
  const settled=t=>/3 台 · 已关联 2 台/.test(t)&&/用户名或密码不对/.test(t.split('私有面板')[1]||'');
  let dialog=await p.evaluate(()=>document.querySelector('#probe-body').textContent);
  for(const end=Date.now()+8000;Date.now()<end&&!settled(dialog);){await wait(40);dialog=await p.evaluate(()=>document.querySelector('#probe-body').textContent);}
  check(/我的探针/.test(dialog)&&/3 台 · 已关联 2 台/.test(dialog),'the working source: '+dialog);
  check(/私有面板/.test(dialog)&&/用户名或密码不对/.test(dialog)&&!/上次读数/.test(dialog.split('私有面板')[1]||''),'the broken source says why: '+dialog);
  // Waited for rather than read once: a poll may be reading src2 again at that moment (读取中 stands in for the refusal until it answers).
  check(await until(p,()=>!!document.querySelector('.probe-source[data-source="src2"] .probe-refused svg')&&!!document.querySelector('.probe-source[data-source="src2"] .probe-has-token[aria-label="面板账号 admin"]')).then(()=>true,()=>false),'a key icon for the account refusal, a person icon for the kept account');
  check(/没对上的探针服务器 · 1/.test(dialog)&&/lab-pi/.test(dialog),'what no card took is offered: '+dialog);
  await p.selectOption('.probe-assign','s4');
  await until(p,()=>!!document.querySelector('[data-probe-row="s4"]'));
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(a=>a.id==='s4').probeLink))==='{"source":"src1","id":"c"}','a hand link is kept on the card');
  check(await p.evaluate(()=>!/没对上/.test(document.querySelector('#probe-body').textContent)),'nothing left unmatched');
  await p.evaluate(()=>document.querySelector('#modal').close());
  // Unlinking keeps the card out of automatic matching.
  await p.evaluate(()=>{showDetail('s1');document.querySelector('[data-action="probe-unlink"][data-id="s1"]').click();});
  await until(p,()=>!document.querySelector('[data-probe-row="s1"]'));
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='s1').probeLink?.none===true),'an unlinked card says so');
  const again=await p.evaluate(()=>{showDetail('s1');return document.querySelector('#detail-content .probe-facts').textContent;});
  check(/不关联/.test(again)&&/恢复自动匹配/.test(again),'the detail offers automatic matching back: '+again);

  // 已停用 set by hand still stands: the ring stays, the readings show beside it, and it is not drawn as down.
  await p.evaluate(()=>toggleStopped('s2'));
  const stopped=await p.evaluate(()=>({row:document.querySelector('[data-asset="s2"]').className,ring:!!document.querySelector('[data-asset="s2"] .stop-ring'),probe:(el=>el?[el.textContent,...[el,...el.querySelectorAll('[aria-label],[title]')].flatMap(n=>[n.getAttribute('aria-label'),n.getAttribute('title')])].filter(Boolean).join(' | '):'')(document.querySelector('[data-probe-row="s2"]'))}));
  check(/\bstopped\b/.test(stopped.row)&&stopped.ring&&!/probe-down/.test(stopped.row)&&/离线/.test(stopped.probe),'a stopped server keeps 已停用: '+JSON.stringify(stopped));
  await p.evaluate(()=>toggleStopped('s2'));
  // 全景: the readings on the card, the offline one red.
  await p.evaluate(()=>panoramaOpen(true));
  await until(p,()=>!!document.querySelector('#panorama .pano-probe'));
  const pano=await p.evaluate(()=>({probes:document.querySelectorAll('#panorama .pano-probe').length,down:document.querySelectorAll('#panorama .probe-down').length,
   text:[...document.querySelectorAll('#panorama .pl-state')].map(e=>e.textContent).join('|'),said:[...document.querySelectorAll('#panorama .pano-probe')].map((el=>el?[el.textContent,...[el,...el.querySelectorAll('[aria-label],[title]')].flatMap(n=>[n.getAttribute('aria-label'),n.getAttribute('title')])].filter(Boolean).join(' | '):'')).join(' || '),
   words:[...document.querySelectorAll('#panorama .pano-probe')].map(e=>e.innerText).join(' '),gauges:document.querySelectorAll('#panorama .pano-probe .pg[role="img"][aria-label]').length,
   overflow:[...document.querySelectorAll('#panorama .pano-probe')].some(e=>e.scrollWidth>e.clientWidth+1)}));
  check(pano.probes>=2&&pano.down>=1&&/离线/.test(pano.text)&&/在线/.test(pano.said)&&/CPU/.test(pano.said),'全景 shows the probe: '+JSON.stringify(pano));
  check(pano.gauges>=6&&!/在线|CPU|内存|磁盘/.test(pano.words)&&!pano.overflow,'全景 draws gauges, not words, and they fit: '+JSON.stringify(pano));
  await p.evaluate(()=>panoramaOpen(false));

  // 390 px: the card and the row gauges fit, nothing scrolls sideways. The rows take their narrow layout from #board[data-size],
  // which a ResizeObserver sets on a later frame (before it is painted); on a loaded machine 150 ms can pass without one, so wait
  // until that is set, no transition is running and the width holds over two frames, rather than measure a layout still on its way.
  // (The list of wide elements skips the sidebar strip, which scrolls on its own.)
  await p.setViewportSize({width:390,height:844});
  await until(p,()=>$('#board').dataset.size==='s'&&!document.getAnimations().some(a=>a instanceof CSSTransition)&&new Promise(done=>{const w=document.documentElement.scrollWidth;requestAnimationFrame(()=>requestAnimationFrame(()=>done(document.documentElement.scrollWidth===w)));}));
  const narrow=await p.evaluate(()=>{showDetail('s2');const c=document.querySelector('#detail-content .probe-card');
   return {page:document.documentElement.scrollWidth,card:c&&c.scrollWidth<=c.clientWidth+1,rings:[...c.querySelectorAll('.pg-big')].every(g=>g.getBoundingClientRect().right<=c.getBoundingClientRect().right+1),
    rows:[...document.querySelectorAll('.r-probe')].every(r=>r.getBoundingClientRect().right<=innerWidth+1)};});
  const wide=narrow.page>390?await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>391&&e.getClientRects().length&&!e.closest('#sidebar')).slice(0,8).map(e=>e.tagName+'.'+[...e.classList].join('.')+'#'+e.id+':'+Math.round(e.getBoundingClientRect().right))):[];
  check(narrow.page<=390&&narrow.card&&narrow.rings&&narrow.rows,'fits at 390 px: '+JSON.stringify(narrow)+' '+wide.join(' | '));
  await p.setViewportSize({width:1280,height:800});
  // Nothing of the probe but the hand links reaches the saved board.
  const saved=await p.evaluate(()=>window.__saved.join('\n'));
  check(saved.length>0,'something was saved');
  for(const leak of ['status.example.com','private.example.net','ram_used','CPU','last_updated','hasLogin','pw-test','timestamp'])check(!saved.includes(leak),'saved board holds '+leak);
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // The demo: made-up readings with no panel, and the screenshot switches.
 const demo=async demoOpen=>open(o=>{window.webkit={messageHandlers:{assetboard:{postMessage(msg){window.__sent=(window.__sent||[]).concat(msg.action);if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);}}}};
  window.__ASSETBOARD_NATIVE__={data:null,demo:true,demoOpen:o,cloudflareConnected:false,githubConnected:false,gmailConfigured:false,probeSources:[]};},demoOpen);
 const one=await demo({asset:'demo-s3'});
 try{
  await until(one.p,()=>!!document.querySelector('#detail-content .probe-facts')&&!document.querySelector('#detail').hidden);
  const d=await one.p.evaluate(()=>({facts:(el=>el?[el.textContent,...[el,...el.querySelectorAll('[aria-label],[title]')].flatMap(n=>[n.getAttribute('aria-label'),n.getAttribute('title')])].filter(Boolean).join(' | '):'')(document.querySelector('#detail-content .probe-facts')),offRing:!!document.querySelector('#detail-content .probe-card.off .pc-rings'),name:document.querySelector('#detail-content h2').textContent,
   rows:document.querySelectorAll('[data-probe-row]').length,asked:(window.__sent||[]).filter(a=>a.startsWith('probe')).length}));
  check(d.name==='home-nas'&&/离线/.test(d.facts)&&/手动关联/.test(d.facts)&&d.offRing,'--open-asset opens the linked demo server: '+JSON.stringify(d));
  check(d.rows>=3&&d.asked===0,'the demo shows probes without asking the app: '+JSON.stringify(d));
  check(!one.errors.length,'demo page errors: '+one.errors.join(' | '));
 }finally{await one.context.close();}
 const two=await demo({panorama:true});
 try{
  await until(two.p,()=>!!document.querySelector('#panorama .pano-probe'));
  check(await two.p.evaluate(()=>panoOpen===true),'--panorama opens 全景');
  // Readings arriving while 全景 is open patch its gauges in place, and a redraw waits while a card is being linked (L): live
  // updates every few seconds must not drop what the person holds.
  const kept=await two.p.evaluate(()=>{probeRepaint();const chip=document.querySelector('#panorama .pano-chip'),gauge=document.querySelector('#panorama .pano-probe[data-probe-pano]');probeRepaint();probeRepaint();
   return {chip:chip.isConnected,gauge:!gauge.isConnected&&!!document.querySelector(`#panorama .pano-probe[data-probe-pano="${gauge.dataset.probePano}"]`)};});
  check(kept.chip&&kept.gauge,'Readings patch 全景 in place: '+JSON.stringify(kept));
  await two.p.focus('#panorama .pano-lane .pano-chip');await two.p.keyboard.press('l');
  const held=await two.p.evaluate(()=>{const n=document.querySelectorAll('#panorama .drop-ok').length;probe.panoStates='';probeRepaint();return {n,after:document.querySelectorAll('#panorama .drop-ok').length,late:probe.panoLate};});
  check(held.n>0&&held.after===held.n&&held.late===true,'A redraw waits while linking: '+JSON.stringify(held));
  await two.p.keyboard.press('Escape');
  await until(two.p,()=>!panoLink&&probe.panoLate===false);
 }finally{await two.context.close();}
 // Outside the demo the switches do nothing: the page looks the same with and without them.
 const look=async demoOpen=>{const r=await open(o=>{window.webkit={messageHandlers:{assetboard:{postMessage(msg){if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);}}}};
  window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'server',width:50,height:null,density:'full',folded:false}],assets:[{id:'x1',type:'server',name:'x',source:'manual',art:'generic'},{id:'x2',type:'server',name:'y',source:'manual',art:'generic'}]},demoOpen:o,probeSources:[],cloudflareConnected:false,githubConnected:false,gmailConfigured:false};},demoOpen);
  try{await wait(300);return await r.p.evaluate(()=>({detail:document.querySelector('#detail').hidden?null:activeAsset,pano:panoOpen}));}finally{await r.context.close();}};
 const without=await look(undefined),withSwitches=await look({asset:'x2',panorama:true});
 check(JSON.stringify(without)===JSON.stringify(withSwitches)&&!withSwitches.pano,'the switches are ignored outside the demo: '+JSON.stringify({without,withSwitches}));
 return 'ok';
}
