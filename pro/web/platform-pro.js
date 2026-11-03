// Pro: 平台状态 on the board, part of 实时状态. Databases and deployments whose platform the person connected (Supabase, Vercel,
// Render, Upstash) show one line of what that platform says about them (运行中, 已暂停, 部署失败, a free database's expiry) in the
// list and the detail, and count in 全部资产's 实时 tile. Read-only: the Mac app reads each source in the background with fixed GETs
// (desktop/PlatformStatus.swift); its token stays in the Keychain, and what comes back is already cut down to names and states.
// Readings stay in memory, never in the board, an export, a handover or an AI tool; only a hand-made link (asset.platformLink) is
// board data. A token that can do more than read is said so before it is kept, and the person can still keep it (it is marked 权限大).
// Reading: on launch, by hand (刷新), and while the window is visible each source once its own reading interval has passed.
// Loaded after platform-data.js and before app.js; with ?free it registers nothing. The demo shows made-up platforms (platformDemo)
// and asks the app for nothing.
const platform={sources:[],state:new Map(),links:new Map(),unmatched:[],started:false,timer:0,signature:'',pending:null};
const PLATFORM_TICK_MS=15*1000;
const PLATFORM_MESSAGES=['platformList','platformSave','platformRemove','platformRead'];
function platformOn(){return !proOff&&(!!nativeStore||demoMode)&&featureOn('probe');}
function platformSend(message){
 if(demoMode){platformDemoAnswer(message);return;}
 if(!PLATFORM_MESSAGES.includes(message?.action))throw new Error('platform: not an allowed message');
 window.webkit.messageHandlers.assetboard.postMessage(message);
}
function platformSourceName(id){const s=platform.sources.find(x=>x.id===id);return s?(s.name||platformData.PLATFORM_KINDS[s.kind]?.name||s.kind):tr('平台');}
function platformRelink(){
 const lists=platform.sources.map(s=>({id:s.id,kind:s.kind,items:platform.state.get(s.id)?.items||[]}));
 const m=platformData.matchPlatformItems(state.assets,lists);platform.links=m.links;platform.unmatched=m.unmatched;
 const sig=[...m.links].map(([id,x])=>id+'='+x.key).sort().join('|');const changed=sig!==platform.signature;platform.signature=sig;return changed;
}
function platformOf(a){return platformOn()&&['database','deployment'].includes(a?.type)?platform.links.get(a.id)||null:null;}

// Asking: one source, or every one that is due (its interval passed and nothing is on its way), only while the window is visible.
// The demo answers here, from platform-data.js: reads come back at once, changes stay in memory, connecting is refused.
function platformDemoAnswer(m){
 const demo=platformData.platformDemo();
 if(m.action==='platformRead')setTimeout(()=>platformTake({source:m.id,items:demo.items[m.id]||[],at:Date.now()}),0);
 else if(m.action==='platformSave'&&m.id&&!m.secret){const s=platform.sources.find(x=>x.id===m.id);if(s)s.interval=m.interval;platformRepaint();}
 else{if($('#platform-status'))$('#platform-status').textContent=tr('演示模式下不可用');else toast(tr('演示模式下不可用'));}
}
function platformRead(id){const st=platform.state.get(id)||{};if(st.loading&&Date.now()-st.asked<60000)return;platform.state.set(id,{...st,loading:true,asked:Date.now()});platformSend({action:'platformRead',id});}
function platformTick(now=Date.now()){
 if(!platformOn()||document.visibilityState!=='visible')return [];
 const due=platform.sources.filter(s=>s.hasToken).filter(s=>{const st=platform.state.get(s.id)||{};return !(st.loading&&now-st.asked<60000)&&now-(st.at||st.failedAt||0)>=s.interval*1000*(st.error?2:1)-PLATFORM_TICK_MS/2;}).map(s=>s.id);
 for(const id of due)platformRead(id);
 return due;
}
function platformTake(r){
 if(Array.isArray(r.sources)){platform.sources=r.sources;for(const id of [...platform.state.keys()])if(!r.sources.some(s=>s.id===id))platform.state.delete(id);}
 if(r.source){
  const was=platform.state.get(r.source)||{};
  if(r.loading)platform.state.set(r.source,{...was,loading:true,asked:was.asked||Date.now()});
  else if(Array.isArray(r.items))platform.state.set(r.source,{items:r.items,at:Number(r.at)||Date.now(),loading:false,error:'',reason:''});
  else if(r.error)platform.state.set(r.source,{...was,loading:false,error:String(r.error),reason:String(r.reason||''),failedAt:Date.now()});
 }
 if(r.needsConfirm&&platform.pending){const p=platform.pending;platform.pending=null;platformConfirmWide(p);return;}
 if(r.error&&!r.source&&$('#platform-status'))$('#platform-status').textContent=String(r.error);
 if(r.saved){platform.pending=null;const form=$('#platform-form');if(form){form.reset();platformFormKind();}if($('#platform-status'))$('#platform-status').textContent=tr('已保存，读取中…');}
 platformRepaint();
}
window.assetboardPlatform=r=>{if(r&&typeof r==='object')platformTake(r);};

// Drawing: a new or lost link redraws the board once; otherwise the lines are patched in place.
function platformRepaint(){
 if(platformRelink()){render();if(activeAsset)showDetail(activeAsset,{focus:false});}
 else{
  for(const el of document.querySelectorAll('[data-platform-row]')){const a=state.assets.find(x=>x.id===el.dataset.platformRow);const html=a?platformRowHtml(a):'';if(html)el.outerHTML=html;}
  for(const el of document.querySelectorAll('[data-platform-detail]')){const a=state.assets.find(x=>x.id===el.dataset.platformDetail);if(a)el.outerHTML=platformFactsHtml(a);}
 }
 if($('#modal')?.open&&$('#modal').dataset.view==='platform')platformDialogBody();
}
function platformAgo(at){return at?probeData.probeAgo(at):tr('还没读到');}
function platformRowHtml(a){
 const x=platformOf(a);if(!x)return '';
 const line=platformData.platformLine(x.kind,x.item),at=platform.state.get(x.source)?.at,words=tr('{line}，{ago}',{line:line.label,ago:platformAgo(at)});
 return `<span class="r-probe live-line ${line.tone==='red'?'off':'on'}${line.tone?' '+line.tone:''}" data-platform-row="${esc(a.id)}" role="group" aria-label="${esc(words)}" title="${esc(words)}"><i class="probe-dot" aria-hidden="true"></i><span class="live-text">${esc(line.text)}</span><span class="probe-seen">${esc(platformAgo(at))}</span></span>`;
}
function platformStatus(a){
 const x=platformOf(a);if(!x)return null;const line=platformData.platformLine(x.kind,x.item);
 return {text:line.text,tone:line.tone,online:line.tone!=='red'};
}
function platformFactsHtml(a){
 if(!['database','deployment'].includes(a.type)||!platform.sources.length)return '<div class="platform-facts" hidden></div>';
 const row=(k,html)=>`<div class="fact"><span>${k}</span><span>${html}</span></div>`,x=platformOf(a);
 if(!x){
  const choices=platform.unmatched.filter(u=>platformData.fitsOf(u.kind,u.item).includes(a.type)).map(u=>`<option value="${esc(encodeURIComponent(u.source)+'/'+encodeURIComponent(u.item.id))}">${esc(u.item.name||u.item.id)} · ${esc(platformSourceName(u.source))}</option>`).join('');
  if(!choices&&!a.platformLink?.none)return `<div class="platform-facts" data-platform-detail="${esc(a.id)}" hidden></div>`;
  return `<div class="platform-facts" data-platform-detail="${esc(a.id)}">${row(tr('平台状态'),`${a.platformLink?.none?tr('不关联'):tr('未关联')}${choices?` <select class="platform-pick" data-id="${esc(a.id)}" aria-label="${tr('关联平台上的项目')}"><option value="">${tr('关联…')}</option>${choices}</select>`:''}${a.platformLink?.none?` <button class="text-button inline-button" data-action="platform-auto" data-id="${esc(a.id)}">${tr('恢复自动匹配')}</button>`:''}`)}</div>`;
 }
 const line=platformData.platformLine(x.kind,x.item),st=platform.state.get(x.source)||{};
 const how={manual:tr('手动关联'),url:tr('按链接匹配'),name:tr('按名称匹配')}[x.how]||'';
 const from=[platformSourceName(x.source),x.item.name,how].filter(Boolean).join(' · ');
 return `<div class="platform-facts" data-platform-detail="${esc(a.id)}">${row(tr('平台状态'),`<span class="live-line${line.tone?' '+line.tone:''}"><span class="live-text">${esc(line.text)}</span></span> <span class="quiet-fact" title="${esc(from)}">${esc(platformAgo(st.at))}</span>${st.error?` <span class="probe-err" role="img" aria-label="${esc(st.error)}" title="${esc(st.error)}">${ui('warn')}</span>`:''} <button class="icon-button pc-act" data-action="platform-refresh" data-id="${esc(x.source)}" aria-label="${tr('刷新平台状态')}" title="${tr('刷新平台状态')}">${probeGlyph('refresh')}</button><button class="icon-button pc-act" data-action="platform-unlink" data-id="${esc(a.id)}" aria-label="${tr('取消关联')}" title="${tr('取消关联（{from}）',{from:esc(from)})}">${probeGlyph('unlink')}</button>`)}</div>`;
}
// Links the person makes: one undo step each.
function platformLink(id,value){
 const a=state.assets.find(x=>x.id===id&&['database','deployment'].includes(x.type));if(!a)return;
 checkpoint();
 if(value==='none')a.platformLink={none:true};else if(value){const [source,item]=value.split('/').map(decodeURIComponent);a.platformLink={source,id:item};}else delete a.platformLink;
 touchAsset(a);save();platformRelink();render();if(activeAsset===id)showDetail(id,{focus:false});
 toast(value==='none'?tr('已取消关联'):value?tr('已关联平台上的项目'):tr('已恢复自动匹配'),true);
}

// 平台状态: the sources, how each is doing, its own reading interval, and adding one. Opened from 设置 › 连接.
function platformIntervalField(s){
 const v=s.interval,min=!(v%60);
 return `<span class="live-interval platform-interval" data-id="${esc(s.id)}"><input type="number" class="live-every" min="1" max="${platformData.PLATFORM_INTERVAL_MAX}" step="1" inputmode="numeric" value="${min?v/60:v}" aria-label="${tr('读取间隔：{name}',{name:esc(platformSourceName(s.id))})}"><select class="live-unit" aria-label="${tr('单位')}"><option value="1"${min?'':' selected'}>${tr('秒')}</option><option value="60"${min?' selected':''}>${tr('分钟')}</option></select></span>`;
}
function platformDialog(){
 if(!platformOn()){notice(tr('实时状态已在设置里关闭'),{action:'prefs',id:'features',label:tr('打开设置')});return;}
 const kinds=Object.entries(platformData.PLATFORM_KINDS);
 modal(tr('平台状态'),`<div id="platform-body"></div>
  <details class="probe-add platform-add"${platform.sources.length?'':' open'}><summary>${tr('连接一个平台')}</summary>
  <form id="platform-form" class="form" autocomplete="off">
   <div class="field"><span class="field-label">${tr('平台')}</span>${chipGroup('platformKind',kinds.map(([k,d])=>[k,d.name]),'supabase',tr('平台'))}</div>
   <p class="form-note" id="platform-help"></p>
   <label id="platform-user-row" hidden>${tr('登录邮箱')}<input id="platform-user" type="email" autocomplete="off" maxlength="200" placeholder="me@example.com"></label>
   <label>${tr('令牌')}<input id="platform-secret" type="password" autocomplete="off" maxlength="500" spellcheck="false"></label>
   <label>${tr('名称')}<input id="platform-name" maxlength="60" placeholder="${tr('可不填')}"></label>
   <div class="form-actions"><button class="button primary" type="submit">${tr('连接')}</button><button type="button" class="button" data-action="platform-token-page">${tr('去新建令牌')}</button><span class="form-note" id="platform-status" role="status"></span></div>
   <p class="form-note">${ui('lock')}${tr('令牌只存在钥匙串里，页面和外部工具都拿不到；只读状态，不改平台上的任何东西。')}</p>
  </form></details>`,'platform');
 platformFormKind();platformDialogBody();
}
function platformFormKind(){
 const kind=$('#platform-form [name="platformKind"]')?.value||'supabase',def=platformData.PLATFORM_KINDS[kind];if(!def)return;
 const help=$('#platform-help');if(help)help.textContent=def.help+(def.readOnly?'':tr('（{name} 没有只读令牌）',{name:def.name}));
 const user=$('#platform-user-row');if(user)user.hidden=!def.user;
}
function platformDialogBody(){
 const box=$('#platform-body');if(!box)return;
 const line=s=>{const st=platform.state.get(s.id)||{},n=st.items?.length||0;
  return st.loading?tr('读取中…'):st.error?esc(st.error):st.at?tr('{n} 个项目 · {ago}',{n,ago:platformAgo(st.at)}):s.hasToken?tr('还没读到'):tr('没有令牌');};
 box.innerHTML=platform.sources.length?`<ul class="probe-sources platform-sources">${platform.sources.map(s=>`<li class="probe-source" data-source="${esc(s.id)}"><div><b>${esc(platformSourceName(s.id))}</b><small>${esc(platformData.PLATFORM_KINDS[s.kind]?.name||s.kind)}${s.wide?` <span class="chip warn" title="${esc(platformData.PLATFORM_KINDS[s.kind]?.wide||'')}">${tr('权限大')}</span>`:''}</small><span class="ssh-state">${line(s)}</span></div><span class="probe-source-actions">${platformIntervalField(s)}<button class="icon-button pc-act" data-action="platform-refresh" data-id="${esc(s.id)}" aria-label="${tr('刷新')}" title="${tr('刷新')}">${probeGlyph('refresh')}</button><button class="button" data-action="platform-remove" data-id="${esc(s.id)}" aria-label="${tr('断开 {name}',{name:esc(platformSourceName(s.id))})}">${tr('断开')}</button></span></li>`).join('')}</ul>`:`<p class="form-note">${tr('还没有连接平台。连接后，数据库和部署会显示平台上的状态。')}</p>`;
}
// A token with more than read access: said in one sentence, kept only when the person still wants it.
async function platformConfirmWide(p){
 const def=platformData.PLATFORM_KINDS[p.kind];
 const ok=await confirmDialog(tr('这个令牌权限大'),`${def.wide}\n${tr('Assetboard 只用它读状态，令牌存在钥匙串里。你可以随时换成权限更小的令牌。')}`,tr('仍然连接'));
 platformDialog();$('.platform-add').open=true;
 if(!ok){$('#platform-status').textContent=tr('没有连接');return;}
 $('#platform-status').textContent=tr('读取中…');
 platform.pending=null;platformSend({...p,wide:true});
}
function platformSave(){
 const kind=$('#platform-form [name="platformKind"]').value,def=platformData.PLATFORM_KINDS[kind],status=$('#platform-status');
 const secret=$('#platform-secret').value.trim(),user=$('#platform-user').value.trim(),name=$('#platform-name').value.trim();
 if(!def){status.textContent=tr('先选一个平台');return;}
 if(!secret){status.textContent=tr('要填令牌');$('#platform-secret').focus();return;}
 if(def.user&&!user){status.textContent=tr('要填登录邮箱');$('#platform-user').focus();return;}
 if(secretKinds(name).length){status.textContent=tr('名称里像是密钥');return;}
 const message={action:'platformSave',kind,name,secret,...(def.user?{user}:{}),interval:def.interval};
 $('#platform-secret').value='';
 if(platformData.platformWide(kind,secret)){platformConfirmWide(message);return;}
 status.textContent=tr('读取中…');platform.pending=message;platformSend(message);
}
function setPlatformInterval(id,s,field){
 const src=platform.sources.find(x=>x.id===id);if(!src)return;
 if(!platformData.platformIntervalOk(s)){field?.setCustomValidity(tr('填 1 到 60 分钟之间的整数'));field?.reportValidity();return;}
 field?.setCustomValidity('');src.interval=s;
 platformSend({action:'platformSave',id,kind:src.kind,name:src.name,interval:s,wide:src.wide});
}
document.addEventListener('change',e=>{
 const pick=e.target.closest?.('.platform-pick');if(pick){if(pick.value)platformLink(pick.dataset.id,pick.value);return;}
 const box=e.target.closest?.('.platform-interval');
 if(box){const n=box.querySelector('.live-every'),unit=+box.querySelector('.live-unit').value;setPlatformInterval(box.dataset.id,Math.round(Number(n.value)*unit),n);}
});
document.addEventListener('submit',e=>{if(e.target.id!=='platform-form')return;e.preventDefault();platformSave();});
document.addEventListener('click',e=>{if(e.target.closest?.('#platform-form [data-choice="platformKind"]'))setTimeout(platformFormKind,0);});

proRegister(()=>{
 proSlots.platformProbe={status:platformStatus,rowHtml:platformRowHtml};
 proSlots.facts.push(a=>['database','deployment'].includes(a.type)?platformFactsHtml(a):'');
 Object.assign(proSlots.actions,{
  'platform-sources':()=>platformDialog(),
  'platform-refresh':(el,id)=>{if(id)platformRead(id);platformRepaint();},
  'platform-unlink':(el,id)=>platformLink(id,'none'),
  'platform-auto':(el,id)=>platformLink(id,''),
  'platform-token-page':()=>{const def=platformData.PLATFORM_KINDS[$('#platform-form [name="platformKind"]')?.value];if(def&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url:def.tokenUrl});},
  'platform-remove':(el,id)=>confirmDialog(tr('断开这个平台？'),tr('只删除 Assetboard 里的设置和钥匙串里的令牌，不动平台。手动关联会保留，重新连接后恢复。'),tr('断开'),true).then(ok=>{platformDialog();if(ok)platformSend({action:'platformRemove',id});})
 });
 window.addEventListener('DOMContentLoaded',()=>platformStart());
});
// Start once the board is drawn, or when 设置 turns 实时状态 on: the sources the app passed in, then read them. Once only; switched
// off later, the ticks find platformOn() false and read nothing.
function platformStart(){
 if(platform.started||!platformOn())return;platform.started=true;
 platform.sources=demoMode?platformData.platformDemo().sources.map(s=>({...s})):Array.isArray(nativeStore?.platformSources)?nativeStore.platformSources:[];
 // Every redraw matches again first: an undo, an import or an edit changes the board without telling this file.
 const draw=render;render=(...args)=>{platformRelink();return draw(...args);};
 platformRelink();platformTick(Date.now()+3600*1000);
 platform.timer=setInterval(()=>platformTick(),PLATFORM_TICK_MS);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')platformTick();});
}
