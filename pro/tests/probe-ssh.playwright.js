// SSH 直读 (Pro). With a stubbed Mac app: only the aliases turned on are asked for, their readings land on the matching server card
// with the SSH mark, rings and a sparkline; a panel's reading wins a card both could show; a host that needs a password or a host
// key is skipped with the hint to connect once in Terminal; switching a host on asks the app; nothing of it reaches the saved board.
// The demo: made-up readings, no ssh, and the screenshot switches (`--open-asset=demo-s2`, `--open-ssh-settings`). ?free: nothing.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const browser=page.context().browser();
 const open=async(init,arg,url='http://127.0.0.1:4317/')=>{const context=await browser.newContext(),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{try{localStorage.setItem('assetboard-features-v1','{"probe":true}');}catch{}});if(init)await p.addInitScript(init,arg);await p.goto(url);
  for(let i=0;i<100&&!await p.evaluate(()=>typeof state!=='undefined'&&document.readyState==='complete');i++)await wait(40);return {context,p,errors};};
 const until=async(p,fn,arg)=>{for(let i=0;i<120;i++){if(await p.evaluate(fn,arg))return;await wait(40);}throw new Error('Timed out: '+String(fn).slice(0,90));};

 // The Mac app, stubbed: ~/.ssh/config has four hosts, two are on; one answers, one wants its host key confirmed.
 const {context,p,errors}=await open(()=>{
  const now=Date.now(),GB=1024**3;
  const out=(t,rx)=>['@@uname','Linux x86_64','@@stat1','cpu  1000 0 0 9000 0 0 0 0 0 0','@@stat2',`cpu  ${1000+t} 0 0 ${9000+100-t} 0 0 0 0 0 0`,'@@nproc','2',
   '@@meminfo','MemTotal: 4000000 kB','MemAvailable: 1000000 kB','@@df','Filesystem 1024-blocks Used Available Capacity Mounted on','/dev/vda1 1000 400 600 40% /',
   '@@netdev','Inter-| Receive | Transmit',' face |bytes packets|bytes packets',`  eth0: ${rx} 1 0 0 0 0 0 0 ${rx} 1 0 0 0 0 0 0`,'@@uptime','5000.0 1.0','@@loadavg','0.5 0.4 0.3 1/100 7','@@end'].join('\n');
  window.__sent=[];window.__saved=[];window.__runs=[];let n=0;
  const reply=r=>setTimeout(()=>window.assetboardSshProbe(r),20);
  const enabled=['box','edge','tokyo'],disabled=['spare'];window.__auto=[];
  // ~/.ssh/config: three hosts on, one switched off by hand (spare), one whose card is found (auto1), one with no card (nocard).
  const config='Host box\n  HostName 198.51.100.7\nHost edge\n  HostName edge.example.net\nHost tokyo\n  HostName 203.0.113.10\nHost spare\n  HostName 198.51.100.9\nHost auto1\n  HostName 198.51.100.50\nHost nocard\n  HostName 198.51.100.60\n';
  const list=()=>reply({list:{enabled:enabled.slice(),disabled:disabled.slice(),interval:window.__interval||60,config}});
  const drop=(arr,a)=>{const i=arr.indexOf(a);if(i>=0)arr.splice(i,1);};
  window.webkit={messageHandlers:{assetboard:{postMessage(msg){
   window.__sent.push(msg.action);
   if(msg.action==='save'){window.__saved.push(JSON.stringify(msg));setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);}
   if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
   if(msg.action==='sshProbeList')list();
   if(msg.action==='sshProbeAuto'){window.__auto.push(...msg.aliases);for(const a of msg.aliases)if(!disabled.includes(a)&&!enabled.includes(a))enabled.push(a);list();}
   if(msg.action==='sshProbeSet'){window.__set=msg;drop(enabled,msg.alias);drop(disabled,msg.alias);(msg.on?enabled:disabled).push(msg.alias);list();}
   if(msg.action==='sshProbeInterval'){window.__interval=msg.seconds;list();}
   if(msg.action==='sshProbeRun')for(const alias of msg.aliases){window.__runs.push(alias);n++;
    reply({result:alias==='edge'?{alias,reason:'hostkey',error:'Host key verification failed.'}:{alias,output:out(30+n,1e6+n*6e6),at:Date.now()}});}
   if(msg.action==='probeRefresh')for(const s of window.__ASSETBOARD_NATIVE__.probeSources)setTimeout(()=>window.assetboardProbe({source:s.id,kind:'cfsm',data:{servers:[{id:'a',name:'tokyo-vps',cpu:5,ram_used:100,ram_total:1000,disk_used:1,disk_total:10,last_updated:now}]},at:Date.now()}),10);
  }}}};
  const server=(id,name,extra={})=>({id,type:'server',name,provider:'Example',source:'manual',art:'generic',cost:'未知',...extra});
  window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'server',width:50,height:null,density:'full',folded:false}],assets:[
   server('s1','tokyo-vps',{ips:['203.0.113.10']}),server('s2','build',{ips:['198.51.100.7']}),server('s3','edge-node',{host:'edge.example.net'}),server('s4','spare',{source:'ssh',externalId:'spare',host:'198.51.100.9'}),server('s5','auto-box',{ips:['198.51.100.50']})],deletedExternalIds:[]},
   probeSources:[{id:'cf',kind:'cfsm',name:'面板',url:'https://status.example.com',hasToken:false}],sshProbe:{enabled:['box','edge','tokyo'],interval:60},
   cloudflareConnected:false,githubConnected:false,gmailConfigured:false};
 });
 try{
  await until(p,()=>!!document.querySelector('[data-probe-row="s2"]')&&!!document.querySelector('[data-probe-row="s5"]'));
  const runs=await p.evaluate(()=>window.__runs.slice());
  check(['box','edge','tokyo','auto1'].every(a=>runs.includes(a))&&!runs.includes('spare')&&!runs.includes('nocard'),'only the hosts on are read: '+JSON.stringify(runs));
  // Done for the person: the host whose card was found is turned on, once; not the one switched off by hand, not one with no card,
  // not one already on.
  check(JSON.stringify(await p.evaluate(()=>window.__auto))==='["auto1"]','turned on by matching: '+JSON.stringify(await p.evaluate(()=>window.__auto)));
  const row=await p.evaluate(()=>({src:document.querySelector('[data-probe-row="s2"] .pg-src')?.getAttribute('aria-label'),
   cf:document.querySelector('[data-probe-row="s1"]')?.getAttribute('aria-label')||'',cfMark:!!document.querySelector('[data-probe-row="s1"] .pg-src'),gauges:document.querySelectorAll('[data-probe-row="s2"] .pg').length,
   edge:!!document.querySelector('[data-probe-row="s3"]')}));
  check(row.src==='来源：SSH 直读'&&row.gauges>=3,'the SSH host is on its card, marked as SSH: '+JSON.stringify(row));
  check(/^面板：/.test(row.cf)&&!row.cfMark,'the panel wins the card both could show: '+JSON.stringify(row));
  check(!row.edge,'a host that wants its key confirmed is skipped');
  // A second reading: a rate and a sparkline.
  await p.evaluate(()=>sshPoll(true));
  await until(p,()=>window.__runs.length>=6&&probe.links.get('s2')?.server.history?.length>=2);
  const detail=await p.evaluate(()=>{showDetail('s2');const el=document.querySelector('#detail-content .probe-card');return {said:el.textContent+' | '+[...el.querySelectorAll('[aria-label]')].map(n=>n.getAttribute('aria-label')).join(' | '),rings:el.querySelectorAll('.pc-rings .pg-ring').length,spark:el.querySelectorAll('.ps-card .ps-cpu').length,
   ring:getComputedStyle(el.querySelector('.pg-cpu .pg-fill')).stroke,line:getComputedStyle(el.querySelector('.ps-card .ps-cpu')).stroke};});
  check(detail.rings===3&&detail.spark===1&&detail.ring===detail.line&&/SSH 直读/.test(detail.said)&&/网速/.test(detail.said)&&/最近 \d+ 次读取：CPU 平均/.test(detail.said),'the detail card: '+JSON.stringify(detail));
  // The edge card is not linked; its detail says why and what to do.
  const edge=await p.evaluate(()=>{showDetail('s3');return document.querySelector('#detail-content').textContent;});
  check(/先在终端里连一次 ssh edge/.test(edge),'the skipped host says what to do: '+edge.slice(0,300));
  // A card in ~/.ssh/config that is not on offers to turn it on; doing so asks the app, nothing else.
  await p.evaluate(()=>{showDetail('s4');document.querySelector('[data-action="ssh-enable"]').click();});
  await until(p,()=>window.__set?.alias==='spare');
  check(await p.evaluate(()=>window.__set.on===true),'turning a host on asks the app');
  // Settings: every host with its switch and state, the interval, the command verbatim.
  await p.evaluate(()=>sshProbeDialog());
  await until(p,()=>document.querySelectorAll('#ssh-body .ssh-toggle').length===6);
  // Read until the rows settle: a poll may be reading a host again (读取中 stands in for its words until it answers), at most 8 s.
  const snap=()=>p.evaluate(()=>({text:document.querySelector('#modal-content').textContent,tips:[...document.querySelectorAll('#ssh-body [title]')].map(e=>e.getAttribute('title')).join(' | '),rowText:document.querySelector('#ssh-body .ssh-hosts').innerText,rings:document.querySelectorAll('.ssh-host[data-alias="box"] .ssh-ring .pg-ring').length,linked:!!document.querySelector('.ssh-host[data-alias="box"] .ssh-linked'),loose:!!document.querySelector('.ssh-host[data-alias="tokyo"] .ssh-loose'),cmdOpen:document.querySelector('.ssh-cmd')?.open,note:document.querySelector('.ssh-note')?.textContent.trim(),noteTip:document.querySelector('.ssh-note')?.getAttribute('title')||'',refresh:document.querySelector('#ssh-body [data-action="ssh-refresh"]')?.className,checked:[...document.querySelectorAll('.ssh-toggle:checked')].map(i=>i.dataset.alias),
   pre:[...document.querySelectorAll('.ssh-command')].map(e=>e.textContent),command:probeSshData.SSH_PROBE_COMMAND}));
  let dialog=await snap();for(const end=Date.now()+8000;Date.now()<end&&!(dialog.checked.join()==='box,edge,tokyo,spare,auto1'&&/先在终端里连一次 ssh edge/.test(dialog.tips)&&/已关联 build/.test(dialog.tips)&&/没对上/.test(dialog.tips));){await new Promise(r=>setTimeout(r,40));dialog=await snap();}
  check(await p.evaluate(()=>[...document.querySelectorAll('#ssh-body .ssh-host')].every(li=>li.classList.contains('probe-source')&&li.querySelector('.probe-source-actions .ssh-toggle[aria-label]'))),'host rows are laid out like panel sources, with a named switch');
  check(dialog.pre.includes(dialog.command)&&/BatchMode=yes/.test(dialog.pre[0]),'the full command is shown verbatim: '+JSON.stringify(dialog.pre));
  check(dialog.checked.join()==='box,edge,tokyo,spare,auto1'&&/先在终端里连一次 ssh edge/.test(dialog.tips)&&/已关联 build/.test(dialog.tips)&&/没对上/.test(dialog.tips),'the hosts, with words in the tips: '+dialog.tips.slice(0,400));
  check(dialog.rings===3&&dialog.linked&&dialog.loose,'rows draw rings and a chain: '+JSON.stringify({rings:dialog.rings,linked:dialog.linked,loose:dialog.loose}));
  check(!/CPU|内存|已关联|没对上|先在终端/.test(dialog.rowText)&&/需确认指纹/.test(dialog.rowText),'rows show numbers and short words, not sentences: '+dialog.rowText.slice(0,300));
  check(dialog.cmdOpen===false&&dialog.note==='只读，不问密码，不装东西。'&&/BatchMode/.test(dialog.noteTip)&&/icon-button/.test(dialog.refresh),'one line on top, the command folded, 刷新 an icon: '+JSON.stringify({cmdOpen:dialog.cmdOpen,note:dialog.note,refresh:dialog.refresh}));
  await p.evaluate(()=>{const t=document.querySelector('.ssh-toggle[data-alias="tokyo"]');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(p,()=>window.__set?.alias==='tokyo');
  check(await p.evaluate(()=>window.__set.on===false),'switching off asks the app');
  // Switched off by hand, it stays off: matching again (a new session) does not turn it back on.
  await p.evaluate(()=>{const t=document.querySelector('.ssh-toggle[data-alias="auto1"]');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(p,()=>window.__set?.alias==='auto1'&&sshProbe.disabled.includes('auto1'));
  await p.evaluate(()=>{sshProbe.autoAsked.clear();sshAuto();});await wait(150);
  check(JSON.stringify(await p.evaluate(()=>window.__auto))==='["auto1"]'&&await p.evaluate(()=>!sshEnabled('auto1')),'a host switched off by hand is not turned on again');
  // The interval sits in the ⋯ menu, closed; no fields to fill in.
  const bar=await p.evaluate(()=>({open:document.querySelector('.ssh-more').open,fields:document.querySelectorAll('#modal-content input:not([type=checkbox]):not([type=radio]),#modal-content select,#modal-content textarea').length,
   tip:document.querySelector('.ssh-more>summary').getAttribute('title')}));
  check(bar.open===false&&bar.fields===0&&/每 1 分钟/.test(bar.tip),'the interval is in a closed menu, nothing to fill in: '+JSON.stringify(bar));
  await p.evaluate(()=>{document.querySelector('.ssh-more').open=true;const r=document.querySelector('.ssh-interval[value="30"]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(p,()=>window.__interval===30&&sshProbe.interval===30);
  await p.evaluate(()=>document.querySelector('#modal').close());
  const saved=await p.evaluate(()=>window.__saved.join('\n'));
  for(const leak of ['MemTotal','/proc','history','198.51.100.7"','sshProbe'])check(!saved.includes(leak),'saved board holds '+leak);
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}

 // The demo: frankfurt-vps is read over SSH (made up, linked by hand), with rings and a sparkline, and no ssh is asked for.
 const demo=async demoOpen=>open(o=>{window.webkit={messageHandlers:{assetboard:{postMessage(msg){window.__sent=(window.__sent||[]).concat(msg.action);if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);}}}};
  window.__ASSETBOARD_NATIVE__={data:null,demo:true,demoOpen:o,cloudflareConnected:false,githubConnected:false,gmailConfigured:false,probeSources:[]};},demoOpen);
 const one=await demo({asset:'demo-s2'});
 try{
  await until(one.p,()=>!!document.querySelector('#detail-content .probe-card')&&!document.querySelector('#detail').hidden);
  const d=await one.p.evaluate(()=>{const c=document.querySelector('#detail-content .probe-card');return {name:document.querySelector('#detail-content h2').textContent,
   src:c.querySelector('.pg-src')?.getAttribute('aria-label'),rings:c.querySelectorAll('.pc-rings .pg-ring').length,spark:c.querySelectorAll('.ps-card .ps-cpu').length,
   row:!!document.querySelector('[data-probe-row="demo-s2"] .pg-src'),asked:(window.__sent||[]).filter(a=>/^ssh|^probe/.test(a))};});
  check(d.name==='frankfurt-vps'&&d.src==='来源：SSH 直读'&&d.rings===3&&d.spark===1&&d.row,'--open-asset=demo-s2 shows the SSH card: '+JSON.stringify(d));
  check(!d.asked.length,'the demo runs no ssh: '+JSON.stringify(d.asked));
  check(!one.errors.length,'demo page errors: '+one.errors.join(' | '));
 }finally{await one.context.close();}
 const two=await demo({ssh:true});
 try{
  await until(two.p,()=>document.querySelector('#modal')?.open&&document.querySelector('#modal').dataset.view==='ssh');
  const s=await two.p.evaluate(()=>({text:document.querySelector('#modal-content').textContent+' | '+[...document.querySelectorAll('#ssh-body [title]')].map(e=>e.getAttribute('title')).join(' | '),pre:[...document.querySelectorAll('.ssh-command')].map(e=>e.textContent),c:probeSshData.SSH_PROBE_COMMAND,
   fits:document.querySelector('#modal-content').scrollWidth<=document.querySelector('#modal-content').clientWidth+1}));
  check(s.pre.includes(s.c)&&/先在终端里连一次 ssh edge-01/.test(s.text)&&/不支持/.test(s.text)&&/需确认指纹/.test(s.text)&&/开启 SSH 直读：scratch-vm/.test(s.text)&&s.fits,'--open-ssh-settings opens the settings: '+s.text.slice(0,400));
  const tint=await two.p.evaluate(()=>{const fill=document.querySelector('.ssh-host .pg-cpu .pg-fill');const want=getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').match(/\d+/g)?.join(',');return {got:fill&&getComputedStyle(fill).stroke.match(/\d+/g)?.slice(0,3).join(','),want};});
  check(tint.got&&tint.got===tint.want,'the settings rows draw CPU in the theme accent: '+JSON.stringify(tint));
 }finally{await two.context.close();}
 const three=await demo({probeSources:true});
 try{
  await until(three.p,()=>document.querySelector('#modal')?.open&&document.querySelector('#modal').dataset.view==='probe');
  check(/SSH 直读/.test(await three.p.evaluate(()=>document.querySelector('#probe-body').textContent)),'探针数据源 lists SSH 直读');
 }finally{await three.context.close();}
 // ?free: no SSH anywhere.
 const free=await open(null,null,'http://127.0.0.1:4317/?demo&free');
 try{
  await wait(300);
  const f=await free.p.evaluate(()=>({lanes:typeof probe!=='undefined'?probe.lanes.length:0,marks:document.querySelectorAll('.pg-src,[data-action^="ssh-"]').length,text:document.body.textContent.includes('SSH 直读')}));
  check(!f.lanes&&!f.marks&&!f.text,'the free edition has no SSH 直读: '+JSON.stringify(f));
 }finally{await free.context.close();}
 return 'ok';
}
