// Pro: SSH 直读 on the board. For servers without a monitoring panel: the Mac app reads each host the person turned on with the
// system's ssh and one fixed read-only command (desktop/SSHProbe.swift); this file asks for it while the window is visible, keeps
// each host's session in memory (probe-ssh-data.js) and hands the hosts to probe-pro.js as a lane, so they are matched to server
// cards (after the panels: a panel's reading wins) and drawn with the same gauges, plus this session's sparklines.
// Settings (文件 → SSH 直读…, or from 探针数据源): which aliases are on, how often, and the full command, verbatim.
// Loaded after probe-pro.js and before app.js; with ?free it registers nothing. The demo makes its readings up and runs no ssh.

const SSH_TICK_MS=5000;
// The full note behind the one quiet line at the top of the settings.
const SSH_NOTE=tr('只读：用系统的 /usr/bin/ssh 和你自己的 ~/.ssh/config、ssh-agent 与密钥连接。不问密码（BatchMode），不接受也不更新主机指纹；需要密码或要确认指纹的主机会跳过，先在终端里连一次即可。只运行一条固定命令（见「完整命令」）：不安装、不写入、不 sudo。对得上服务器卡片的主机自动开启，手动关掉的会记住；没开启的主机不连接。读数只在内存里，窗口可见时才读取。');
const sshProbe={hosts:[],enabled:[],disabled:[],autoAsked:new Set(),interval:probeSshData.SSH_DEFAULT_INTERVAL,sessions:new Map(),listed:false,configError:'',status:'',demoTick:0};
function sshOn(){return !proOff&&(!!nativeStore||demoMode)&&featureOn('probe');}
const sshIntervalMs=()=>sshProbe.interval*1000;
const sshIs=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const sshEnabled=alias=>sshProbe.enabled.some(x=>sshIs(x,alias));
function sshSession(alias){let h=sshProbe.sessions.get(alias);if(!h){h=probeSshData.sshSession(alias);sshProbe.sessions.set(alias,h);}return h;}
function sshPost(msg){window.webkit.messageHandlers.assetboard.postMessage(msg);}

const sshLane={id:'ssh',name:tr('SSH 直读'),glyph:'ssh',
 servers(){const now=Date.now();return sshProbe.enabled.map(alias=>probeSshData.sshServer(sshSession(alias),sshProbe.hosts.find(h=>sshIs(h.name,alias)),now,sshIntervalMs())).filter(Boolean);},
 refresh(){sshPoll(true);},
 dialogHtml(){
  const on=sshProbe.enabled.length,linked=[...probe.links.values()].filter(x=>x.source==='ssh').length;
  return `<h3 class="probe-h">${tr('SSH 直读')}</h3><ul class="probe-sources"><li class="probe-source ssh-lane" data-source="ssh"><div><b>${probeGlyph('ssh')}${tr('SSH 直读')}</b><small>${tr('系统 ssh · ~/.ssh/config · 只读命令')}</small><small class="probe-line">${on?`${tr('已开启 {n} 台',{n:on})} · ${tr('已关联 {n} 台',{n:linked})} · ${tr('每 {n} 秒',{n:sshProbe.interval})}`:tr('逐台开启，没开启的不连接')}</small></div><span class="probe-source-actions"><button class="icon-button pc-act" data-action="ssh-refresh"${on?'':' disabled'} aria-label="${tr('刷新')}" title="${tr('刷新')}">${probeGlyph('refresh')}</button><button class="button" data-action="ssh-probe-open">${tr('设置…')}</button></span></li></ul>`;
 }
};

// Asking: the hosts that are due (probe-ssh-data.js sshDue: the interval, longer after failures), only while the window is visible.
function sshPoll(force=false){
 if(!sshOn()||!force&&document.visibilityState!=='visible')return;
 const now=Date.now(),due=sshProbe.enabled.filter(alias=>{const h=sshSession(alias);return force?!(h.pending&&now-h.tried<120000):probeSshData.sshDue(h,now,sshIntervalMs());});
 if(!due.length)return;
 for(const alias of due)sshProbe.sessions.set(alias,{...sshSession(alias),pending:true,tried:now});
 if(demoMode){const tick=++sshProbe.demoTick+40;setTimeout(()=>{for(const alias of due)sshTake({result:{alias,...probeSshData.sshDemoOutput(alias,tick),at:Date.now()}});},400);}
 else sshPost({action:'sshProbeRun',aliases:due});
 sshDialogBody();
}
function sshTake(r){
 if(r.list){
  const l=r.list;
  sshProbe.hosts=parseSshConfig(l.config||'').map(h=>({name:h.name,host:h.host}));
  sshProbe.enabled=Array.isArray(l.enabled)?l.enabled.map(String):[];
  sshProbe.disabled=Array.isArray(l.disabled)?l.disabled.map(String):[];
  if(probeSshData.SSH_INTERVALS.includes(+l.interval))sshProbe.interval=+l.interval;
  sshProbe.configError=l.error?String(l.error):'';sshProbe.listed=true;sshProbe.status='';
  for(const alias of [...sshProbe.sessions.keys()])if(!sshEnabled(alias))sshProbe.sessions.delete(alias);
  sshAuto();sshPoll();
 }
 if(r.error)sshProbe.status=String(r.error);
 if(r.result&&typeof r.result.alias==='string'){
  const alias=sshProbe.enabled.find(x=>sshIs(x,r.result.alias));
  if(alias)sshProbe.sessions.set(alias,probeSshData.sshRecord(sshSession(alias),r.result,Date.now()));
 }
 probeRepaint();sshDialogBody();
}
window.assetboardSshProbe=r=>{if(r&&typeof r==='object')sshTake(r);};

// Done for the person: a host in ~/.ssh/config whose server card is found is turned on, once the panels have answered (a card a
// panel shows needs no SSH). A host switched off by hand stays off; each host is offered once per session.
function sshAuto(){
 if(!sshOn()||!sshProbe.listed)return;
 if(!probe.sources.every(s=>{const st=probe.state.get(s.id);return st&&(st.at||st.error);}))return;
 const covered=new Set([...probe.links].filter(([,x])=>x.source!=='ssh').map(([id])=>id));
 const aliases=probeSshData.sshAutoAliases(sshProbe.hosts,state.assets,{enabled:sshProbe.enabled,disabled:sshProbe.disabled,covered}).filter(a=>!sshProbe.autoAsked.has(a.toLowerCase()));
 if(!aliases.length)return;
 for(const a of aliases)sshProbe.autoAsked.add(a.toLowerCase());
 if(demoMode){sshProbe.enabled=[...sshProbe.enabled,...aliases];sshTake({});sshPoll();return;}
 sshPost({action:'sshProbeAuto',aliases});
}
function sshToggle(alias,on){
 if(!alias)return;
 // Switched off by hand: remembered (on the Mac, sshProbeOff), so matching never turns it back on.
 if(demoMode){sshProbe.enabled=on?[...sshProbe.enabled.filter(x=>!sshIs(x,alias)),alias]:sshProbe.enabled.filter(x=>!sshIs(x,alias));
  sshProbe.disabled=on?sshProbe.disabled.filter(x=>!sshIs(x,alias)):[...sshProbe.disabled.filter(x=>!sshIs(x,alias)),alias];if(!on)sshProbe.sessions.delete(alias);sshTake({});sshPoll();return;}
 sshPost({action:'sshProbeSet',alias,on});
}

// 设置: the hosts in ~/.ssh/config, each with its own switch and state; the interval; the full command.
function sshProbeDialog(){
 if(proOff)return;
 if(!featureOn('probe')){notice(tr('探针与 SSH 直读已在设置里关闭'),{action:'prefs',id:'features',label:tr('打开设置')});return;}
 if(!sshOn()){toast(tr('SSH 直读仅 Mac App 可用'));return;}
 const d=probeSshData,cmd=`/usr/bin/ssh ${d.SSH_PROBE_OPTIONS.join(' ')} -- ${tr('<别名>')} "${tr('命令')}"`;
 modal(tr('SSH 直读'),`<div class="form ssh-dialog">
  <div id="ssh-body"></div>
  <details class="ssh-cmd"><summary>${tr('完整命令')}</summary>
   <pre class="ssh-command" aria-label="${tr('ssh 的启动方式')}"><code>${esc(cmd)}</code></pre>
   <pre class="ssh-command" aria-label="${tr('在服务器上运行的命令')}"><code>${esc(d.SSH_PROBE_COMMAND)}</code></pre>
   <ol class="ssh-steps">${d.SSH_PROBE_STEPS.map(([c,w])=>`<li><code>${esc(c)}</code><span>${esc(w)}</span></li>`).join('')}</ol>
  </details>
 </div>`,'ssh');
 sshDialogBody();
 if(!demoMode)sshPost({action:'sshProbeList'});
}
window.sshProbeDialog=sshProbeDialog;
// A host's state in its settings row, drawn: small rings (CPU, 内存, 磁盘) as on the card, a chain when a card shows it (a broken one
// when none does), a small red mark and two or three words when something is wrong. The words are in the tips.
PROBE_GLYPHS.more=PROBE_GLYPHS.more||'<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>';
PROBE_GLYPHS.link=PROBE_GLYPHS.link||'<path d="M6.5 9.5 9.5 6.5M7 4.5 8.5 3a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5 7.5 13A2.5 2.5 0 0 1 4 9.5L5.5 8"/>';
const sshTip=(text,html,cls='')=>`<span class="ssh-mark${cls?' '+cls:''}" role="img" aria-label="${esc(text)}" title="${esc(text)}">${html}</span>`;
function sshMiniRing(g){
 return `<span class="pg pg-${g.key} ssh-ring" role="img" aria-label="${esc(g.label)}" title="${esc(g.label)}">${probeGlyph(g.key)}<span class="ssh-ring-o">${probeRing(g.pct,24)}<b class="pg-num">${esc(g.value)}</b></span></span>`;
}
function sshHostLine(alias){
 if(!sshEnabled(alias))return '';
 const h=sshSession(alias),problem=h.reason?probeSshData.sshProblem(h):'';
 const trouble=problem?`<span class="ssh-trouble" role="img" aria-label="${esc(problem)}" title="${esc(problem)}">${ui('warn')}${esc(probeSshData.sshProblemShort(h))}</span>`:'';
 if(!h.lastOk)return h.pending&&!problem?sshTip(tr('读取中'),probeGlyph('refresh'),'ssh-busy'):trouble||sshTip(tr('等待读取'),probeGlyph('seen'));
 const x=[...probe.links.entries()].find(([,l])=>l.source==='ssh'&&sshIs(l.server.id,alias)),card=x&&state.assets.find(a=>a.id===x[0]);
 const server=probeSshData.sshServer(h,sshProbe.hosts.find(t=>sshIs(t.name,alias)),Date.now(),sshIntervalMs());
 const rings=server?probeData.probeGauges(server).filter(g=>g.key!=='net').map(sshMiniRing).join(''):'';
 const link=card?sshTip(tr('已关联 {name}',{name:displayName(card)}),probeGlyph('link'),'ssh-linked'):sshTip(tr('没对上服务器卡片'),probeGlyph('unlink'),'ssh-loose');
 return `${rings}${link}${trouble}`;
}
function sshDialogBody(){
 const box=$('#ssh-body');if(!box||$('#modal')?.dataset.view!=='ssh')return;
 const known=sshProbe.hosts,stale=sshProbe.enabled.filter(a=>!known.some(h=>sshIs(h.name,a)));
 // The same row as a panel source in 探针数据源: name and small lines on the left, the switch on the right.
 const row=(alias,target)=>`<li class="probe-source ssh-host${sshEnabled(alias)?' on':''}" data-alias="${esc(alias)}"><div><b>${probeGlyph('ssh')}${esc(alias)}</b>${target?`<small>${esc(target)}</small>`:''}<span class="ssh-state">${sshHostLine(alias)}</span></div><span class="probe-source-actions"><label class="ssh-switch" title="${sshEnabled(alias)?tr('关闭 SSH 直读：{alias}',{alias:esc(alias)}):tr('开启 SSH 直读：{alias}',{alias:esc(alias)})}"><input type="checkbox" class="ssh-toggle" data-alias="${esc(alias)}" aria-label="${tr('SSH 直读 {alias}',{alias:esc(alias)})}"${sshEnabled(alias)?' checked':''}><i aria-hidden="true"></i></label></span></li>`;
 const list=[...known.map(h=>row(h.name,h.host&&h.host!==h.name?h.host:'')),...stale.map(a=>row(a,tr('~/.ssh/config 里已没有')))].join('');
 const every=s=>s<60?tr('{n} 秒',{n:s}):tr('{n} 分钟',{n:s/60});
 // Nothing to fill in: one quiet line, 刷新, and a small ⋯ menu that holds the interval.
 box.innerHTML=`<div class="ssh-bar"><p class="form-note platform-note ssh-note" title="${esc(SSH_NOTE)}" aria-label="${esc(SSH_NOTE)}">${ui('lock')}${tr('只读，不问密码，不装东西。')}</p>
  <span class="form-note" role="status">${esc(sshProbe.status)}</span>
  <button class="icon-button pc-act" data-action="ssh-refresh"${sshProbe.enabled.length?'':' disabled'} aria-label="${tr('刷新')}" title="${tr('刷新')}">${probeGlyph('refresh')}</button>
  <details class="ssh-more"><summary class="icon-button pc-act" aria-label="${tr('更多：读取间隔（现为每 {every}）',{every:every(sshProbe.interval)})}" title="${tr('读取间隔：每 {every}',{every:every(sshProbe.interval)})}">${probeGlyph('more')}</summary>
   <div class="ssh-menu" role="group" aria-label="${tr('读取间隔')}">${probeSshData.SSH_INTERVALS.map(v=>`<label><input type="radio" name="ssh-interval" class="ssh-interval" value="${v}"${v===sshProbe.interval?' checked':''}>${tr('每 {every}',{every:every(v)})}</label>`).join('')}</div></details></div>
  ${list?`<ul class="probe-sources ssh-hosts">${list}</ul>`:`<p class="form-note">${sshProbe.listed||demoMode?esc(sshProbe.configError||tr('~/.ssh/config 里没有 Host')):tr('正在读取 ~/.ssh/config…')}</p>`}`;
}

document.addEventListener('change',e=>{
 const t=e.target.closest?.('.ssh-toggle');if(t){sshToggle(t.dataset.alias,t.checked);return;}
 if(e.target.classList?.contains('ssh-interval')){
  const s=+e.target.value;if(!probeSshData.SSH_INTERVALS.includes(s))return;
  if(demoMode){sshProbe.interval=s;sshDialogBody();}else sshPost({action:'sshProbeInterval',seconds:s});
 }
});

// A server card that is in ~/.ssh/config, linked to no probe and not turned on: its detail offers to turn it on (逐台开启).
function sshAliasFor(a){
 if(a.type!=='server')return null;
 const names=[a.source==='ssh'?a.externalId:'',a.name,a.host].filter(Boolean),ips=assetIps(a).map(x=>x.ip);
 return sshProbe.hosts.find(h=>names.some(n=>sshIs(n,h.name)))?.name||sshProbe.hosts.find(h=>h.host&&(names.some(n=>sshIs(n,h.host))||ips.includes(normalizeIp(h.host)?.ip)))?.name||null;
}
function sshFactHtml(a){
 if(!sshOn()||a.type!=='server'||probeOf(a))return '';
 const alias=sshAliasFor(a);if(!alias)return '';
 const h=sshEnabled(alias)?sshSession(alias):null,problem=h?.reason?probeSshData.sshProblem(h):'';
 return `<div class="fact ssh-fact"><span>${tr('SSH 直读')}</span><span>${h?(problem?`<span class="probe-err">${esc(problem)}</span>`:h.pending?tr('读取中…'):tr('已开启')):`<button class="text-button inline-button" data-action="ssh-enable" data-alias="${esc(alias)}">${probeGlyph('ssh')}${tr('开启（{alias}）',{alias:esc(alias)})}</button>`}</span></div>`;
}

proRegister(()=>{
 proSlots.facts.push(a=>sshFactHtml(a));
 proSlots.importSources.push(({native})=>(native||demoMode)&&sshOn()?`<button class="button source" data-action="ssh-probe-open" title="${tr('SSH 直读：用 ~/.ssh/config 里的主机直接读取 CPU、内存、磁盘和网速（只读，逐台开启）')}">${probeGlyph('ssh')}${tr('SSH 直读')}</button>`:'');
 Object.assign(proSlots.actions,{
  'ssh-probe-open':()=>sshProbeDialog(),
  'ssh-refresh':()=>sshPoll(true),
  'ssh-enable':el=>{sshToggle(el.dataset.alias,true);toast(tr('已开启 SSH 直读：{alias}',{alias:el.dataset.alias}));}
 });
 window.addEventListener('DOMContentLoaded',()=>sshStart());
});
// Once the board is drawn, or when 设置 turns probes on (probe-pro.js's probeStart runs first).
function sshStart(){
  if(sshProbe.started||!sshOn())return;sshProbe.started=true;
  probe.lanes.push(sshLane);
  // A panel's answer may settle which cards it covers: look again for hosts to turn on.
  const take=window.assetboardProbe;window.assetboardProbe=r=>{take(r);sshAuto();};
  if(demoMode){
   // Made-up hosts with a session's worth of readings already, so the sparklines have something to draw.
   const d=probeSshData,now=Date.now(),ms=sshIntervalMs();
   sshProbe.hosts=parseSshConfig(d.SSH_DEMO_CONFIG).map(h=>({name:h.name,host:h.host}));sshProbe.enabled=[...d.SSH_DEMO_ENABLED];sshProbe.listed=true;
   for(const alias of sshProbe.enabled){
    let h=d.sshSession(alias);const runs=d.sshDemoOutput(alias,0).output&&!/Darwin/.test(d.sshDemoOutput(alias,0).output)?24:1;
    for(let i=0;i<runs;i++){const at=now-(runs-1-i)*ms;h=d.sshRecord(h,{...d.sshDemoOutput(alias,i+16),at},at);h.tried=at;}
    sshProbe.sessions.set(alias,h);
   }
  }else{
   const s=nativeStore?.sshProbe;
   if(s&&Array.isArray(s.enabled))sshProbe.enabled=s.enabled.map(String);
   if(probeSshData.SSH_INTERVALS.includes(+s?.interval))sshProbe.interval=+s.interval;
   sshPost({action:'sshProbeList'});
  }
  probeRepaint();
  setInterval(()=>{sshAuto();sshPoll();},SSH_TICK_MS);
  document.addEventListener('visibilitychange',()=>sshPoll());
  const open=demoMode?nativeStore?.demoOpen:null;
  if(open?.ssh===true)sshProbeDialog();
}
