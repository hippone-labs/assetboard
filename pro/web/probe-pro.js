// Pro: probe data sources (探针数据源) on the board. Server cards linked to a monitoring panel show its live state (在线/离线, CPU,
// 内存, 磁盘, 本月流量, 最后上报, the last 24 hours of CPU and 内存) in the list, the detail and 全景, in place of the implied 运行中.
// Read-only: the Mac app reads each panel in the background (desktop/ProbeSource.swift) with GETs of an allow-list of paths and one
// WebSocket subscription; readings and history stay in memory, never in the board, an export or a handover. Only the hand-made
// link (asset.probeLink) is board data.
// Refreshing: on launch, by hand (刷新), and while the window is visible either live (the panel's WebSocket pushes changes; on a
// drop it is tried again after 1 s, 2 s, 4 s … up to 60 s with jitter) or, when live is not open, by polling every PROBE_POLL_MS.
// History is read on launch, on 刷新 and on a new hand link, not on every tick. Each source has its own loading and error state;
// a refusal (wrong account, a human check the app cannot pass, a private panel without an account) keeps what was read before.
// A private panel is read with its own account, kept in the Keychain; the app logs in and keeps the session in memory.
// Loaded after probe-data.js and before app.js; with ?free it registers nothing.

const PROBE_POLL_MS=60*1000;
// While live is open a full read still happens this often, to pick up servers added or removed on the panel.
const PROBE_RESYNC_MS=5*60*1000;
// Lanes: other kinds of source that bring their own servers (SSH 直读, probe-ssh-pro.js): {id, name, glyph, servers(), refresh(),
// dialogHtml()}. They are matched after the panels, on the cards no panel took, so a panel's reading wins over theirs.
const probe={sources:[],lanes:[],state:new Map(),raw:new Map(),history:new Map(),live:new Map(),historyWanted:new Set(),links:new Map(),unmatched:[],timer:0,signature:'',paint:0};
// A probe server as one form value: source and id, each encoded, so any id survives an HTML attribute.
const probeKey=(source,id)=>encodeURIComponent(source)+'/'+encodeURIComponent(id);
// Off until 设置 › 功能 turns it on (featureOn('probe')); then nothing is read and no card shows a live state.
function probeOn(){return !proOff&&(!!nativeStore||demoMode)&&featureOn('probe');}
function probeSourceName(id){return probe.sources.find(s=>s.id===id)?.name||probe.lanes.find(l=>l.id===id)?.name||tr('探针');}
function probeRelink(){
 const r=probeData.matchProbeServers(state.assets,probe.sources.map(s=>({id:s.id,servers:probe.state.get(s.id)?.servers||[]})));
 for(const lane of probe.lanes){
  const more=probeData.matchProbeServers(state.assets.filter(a=>!r.links.has(a.id)),[{id:lane.id,servers:lane.servers()}]);
  for(const [id,x] of more.links)r.links.set(id,x);r.unmatched=r.unmatched.concat(more.unmatched);
 }
 probe.links=r.links;probe.unmatched=r.unmatched;
 const signature=[...r.links].map(([id,x])=>id+'='+x.key).sort().join('|');
 const changed=signature!==probe.signature;probe.signature=signature;return changed;
}
function probeOf(a){return a?.type==='server'&&probeOn()?probe.links.get(a.id)||null:null;}
function probeHistoryOf(x){
 if(!x)return null;
 // A lane brings its own samples ({t, cpu, mem} in %); drawn the same way as a panel's history.
 if(Array.isArray(x.server.history)){const h=x.server.history,pts=k=>h.filter(p=>p[k]!=null).map(p=>({t:p.t,v:Math.min(100,Math.max(0,p[k]))}));return {cpu:pts('cpu'),mem:pts('mem')};}
 return probe.history.get(probeKey(x.source,x.server.id))||null;
}

// The only messages the probe code sends to the app. Which panel paths they read is fixed on the Mac side (an allow-list of
// GET /api/servers, /api/server, /api/history/all and the /api/ws subscription); nothing here names a path or a method.
const PROBE_MESSAGES=['probeSave','probeRemove','probeRefresh','probeHistory','probeLiveStart','probeLiveStop'];
function probeSend(message){
 if(!PROBE_MESSAGES.includes(message?.action))throw new Error('probe: not an allowed message');
 window.webkit.messageHandlers.assetboard.postMessage(message);
}

// Asking. The demo answers from probe-data.js and reads no panel; its live state is made up.
function probeRefresh(id=null,{manual=false}={}){
 if(!probeOn())return;
 const lane=id&&probe.lanes.find(l=>l.id===id);if(lane){lane.refresh();return;}
 const ids=id?[id]:probe.sources.map(s=>s.id);
 if(manual)for(const s of ids){probe.historyWanted.add(s);const live=probe.live.get(s);if(live?.state==='refused'||live?.state==='unsupported')probe.live.delete(s);}
 if(demoMode){
  for(const s of probe.sources.filter(x=>ids.includes(x.id))){
   probeTake({source:s.id,kind:s.kind,data:probeData.probeDemoAnswer(),at:Date.now()});
   probeTake({source:s.id,history:Object.fromEntries((probe.state.get(s.id)?.servers||[]).map(x=>[x.id,probeData.probeDemoHistory(x.id)]))});
   probe.live.set(s.id,{state:'open',attempt:0});
  }
  probeRepaint();return;
 }
 probeSend({action:'probeRefresh',...(id?{id}:{}),...(manual?{manual:true}:{})});
}
function probeAskHistory(source){
 probe.historyWanted.delete(source);
 if(demoMode)return;
 const servers=[...probe.links.values()].filter(x=>x.source===source).map(x=>x.server.id);
 if(servers.length)probeSend({action:'probeHistory',id:source,servers});
}
// Live, per source: off → connecting → open; on a drop, waiting (backoff) then connecting again; refused (401/403) or unsupported
// (426/503) stop trying until the next 刷新; paused while the window is hidden. Polling covers every source whose socket is not open.
function probeLiveStart(source){
 if(demoMode||document.visibilityState!=='visible')return;
 const live=probe.live.get(source)||{state:'off',attempt:0};
 if(['open','connecting','refused','unsupported'].includes(live.state))return;
 const servers=(probe.state.get(source)?.servers||[]).map(x=>x.id);if(!servers.length)return;
 clearTimeout(live.timer);probe.live.set(source,{...live,state:'connecting',timer:0});
 probeSend({action:'probeLiveStart',id:source,servers});
}
function probeLiveClosed(source,status){
 const live=probe.live.get(source)||{state:'off',attempt:0};clearTimeout(live.timer);
 if(probeData.PROBE_LIVE_GIVE_UP.includes(status)){probe.live.set(source,{state:status===401||status===403?'refused':'unsupported',attempt:live.attempt,status});return;}
 if(live.state==='paused'||document.visibilityState!=='visible'){probe.live.set(source,{...live,state:'paused',timer:0});return;}
 const delay=probeData.probeBackoff(live.attempt);
 probe.live.set(source,{state:'waiting',attempt:live.attempt+1,delay,timer:setTimeout(()=>{const now=probe.live.get(source);if(now?.state==='waiting')probe.live.set(source,{...now,state:'off'}),probeLiveStart(source);},delay)});
}
function probePause(){
 for(const [source,live] of probe.live){clearTimeout(live.timer);if(live.state==='open'||live.state==='connecting'||live.state==='waiting'){probe.live.set(source,{...live,state:'paused',timer:0});if(!demoMode)probeSend({action:'probeLiveStop',id:source});}}
}
function probeResume(){
 for(const s of probe.sources){const live=probe.live.get(s.id);if(!live||live.state==='paused'||live.state==='off')probe.live.set(s.id,{state:'off',attempt:live?.attempt||0}),probeLiveStart(s.id);}
}
// The poll tick: a full read of every source that is not live, and of live ones now and then.
function probePollTick(now=Date.now()){
 if(document.visibilityState!=='visible')return [];
 const due=probe.sources.filter(s=>{const live=probe.live.get(s.id),at=probe.state.get(s.id)?.at||0;return live?.state!=='open'||now-at>PROBE_RESYNC_MS;}).map(s=>s.id);
 if(demoMode)return due;
 for(const id of due)probeRefresh(id);
 return due;
}
function probeTake(r){
 if(Array.isArray(r.sources)){probe.sources=r.sources;for(const map of [probe.state,probe.raw,probe.live])for(const id of [...map.keys()])if(!r.sources.some(s=>s.id===id))map.delete(id);}
 const source=r.source,was=source?probe.state.get(source)||{servers:[]}:null;let fresh=false;
 if(source&&r.live){if(r.live==='open'){const live=probe.live.get(source);if(live?.state==='paused'){probeSend({action:'probeLiveStop',id:source});return;}probe.live.set(source,{state:'open',attempt:0});}else probeLiveClosed(source,Number(r.status)||0);probeRepaintSoon();return;}
 if(source&&Array.isArray(r.updates)){
  const raw=probe.raw.get(source);if(!raw)return;
  const merged=probeData.probeMergeUpdates(raw.rows,r.updates);if(!merged.changed)return;
  probe.raw.set(source,{...raw,rows:merged.rows});
  try{probe.state.set(source,{...was,servers:probeData.probeServers(raw.kind,{servers:merged.rows},Date.now()),live:Date.now()});}catch{}
  probeRepaintSoon();return;
 }
 if(source&&r.history&&typeof r.history==='object'){
  for(const [id,rows] of Object.entries(r.history))probe.history.set(probeKey(source,id),probeData.probeHistoryPoints(rows));
  probe.state.set(source,{...probe.state.get(source)||was,historyError:r.historyError?String(r.historyError):'',historyStatus:Number(r.status)||0,historyReason:String(r.reason||'')});
  probeRepaintSoon();return;
 }
 if(source){
  if(r.loading)probe.state.set(source,{...was,loading:true});
  else if(r.error)probe.state.set(source,{...was,loading:false,error:String(r.error),status:Number(r.status)||0,reason:String(r.reason||'')});
  else if(r.data){
   try{
    probe.state.set(source,{servers:probeData.probeServers(r.kind,r.data,Date.now()),at:r.at||Date.now(),loading:false,error:'',status:0,reason:''});
    probe.raw.set(source,{kind:r.kind,rows:Array.isArray(r.data.servers)?r.data.servers:[]});
    fresh=true;
   }catch(e){probe.state.set(source,{...was,loading:false,error:e.message,status:0});}
  }
 }
 if(r.error&&!source&&$('#probe-status'))$('#probe-status').textContent=r.error;
 if(r.saved){probe.historyWanted.add(r.saved);probe.live.delete(r.saved);if(probe.pending){probe.pending.id=r.saved;if($('#probe-id'))$('#probe-id').value=r.saved;}}
 if(source&&probe.pending?.id===source&&!r.loading&&(r.data||r.error))probeFormAnswer(source);
 probeRepaint();
 // A fresh list: the history it was waiting for (read once the links are known), then the live socket.
 if(fresh){if(probe.historyWanted.has(source))probeAskHistory(source);probeLiveStart(source);}
}
window.assetboardProbe=r=>{if(r&&typeof r==='object')probeTake(r);};

// Live messages come every few seconds: drawing waits a moment so a burst paints once.
function probeRepaintSoon(){if(probe.paint)return;probe.paint=setTimeout(()=>{probe.paint=0;probeRepaint();},400);}
// Drawing: the list rows and the detail are patched in place; a new or lost link redraws the board once.
function probeRepaint(){
 const changed=probeRelink();
 // A new link redraws the board, and with it 全景: not while a card is in hand there (probePanoRepaint catches up).
 if(changed&&probePanoBusy())probe.renderLate=true;
 else if(changed)render();
 else document.querySelectorAll('[data-probe-row]').forEach(el=>{const a=state.assets.find(x=>x.id===el.dataset.probeRow);if(a)el.outerHTML=probeRowHtml(a);});
 const box=$('#detail-content .probe-facts');
 if(box&&activeAsset){const a=state.assets.find(x=>x.id===activeAsset);if(a)box.outerHTML=probeFactsHtml(a);}
 probePanoRepaint(changed);
 if($('#modal')?.open&&$('#modal').dataset.view==='probe')probeDialogBody();
}
// 全景 is redrawn only when a link or an online state changed; otherwise its gauges are patched in place. Never while the person is
// pressing, dragging or linking there (a redraw would drop the card in hand): then it waits until they are done.
function probePanoBusy(){return typeof panoOpen!=='undefined'&&panoOpen&&!!(panoPress||panoDrag||panoLink);}
function probePanoRepaint(changed=false){
 if(typeof panoOpen==='undefined'||!panoOpen){if(probe.renderLate){probe.renderLate=false;render();}return;}
 const states=[...probe.links].map(([id,x])=>id+'='+!!x.server.online).sort().join('|'),redraw=changed||probe.panoLate||states!==probe.panoStates;
 if(probePanoBusy()){if(redraw)probe.panoLate=true;clearTimeout(probe.panoWait);probe.panoWait=setTimeout(()=>probePanoRepaint(),500);return;}
 probe.panoLate=false;probe.panoStates=states;
 if(probe.renderLate){probe.renderLate=false;render();return;}
 if(redraw){panoramaRender();return;}
 document.querySelectorAll('#panorama .pano-probe[data-probe-pano]').forEach(el=>{const a=state.assets.find(x=>x.id===el.dataset.probePano);if(a)el.outerHTML=probePanoHtml(a);});
}
// Drawn, not written: rings for CPU, 内存 and 磁盘, a bar for the month's traffic (filled when the panel has a limit), a dot for the
// state (red when offline, quiet when online) and the last report in small type. Each gauge says in words what it shows, as its
// accessible name and its hover tip.
const PROBE_GLYPHS={
 cpu:'<rect x="4.5" y="4.5" width="7" height="7" rx="1.2"/><path d="M6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14"/>',
 mem:'<rect x="2" y="4.5" width="12" height="6.5" rx="1"/><path d="M5 11v2M8 11v2M11 11v2M5 7v1.5M8 7v1.5M11 7v1.5"/>',
 disk:'<ellipse cx="8" cy="4.5" rx="5" ry="2"/><path d="M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
 net:'<path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5"/>',
 seen:'<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
 refresh:'<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>',
 ssh:'<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3.5"/>',
 unlink:'<path d="M6.5 9.5 5 11a2.1 2.1 0 0 1-3-3l1.5-1.5M9.5 6.5 11 5a2.1 2.1 0 0 1 3 3l-1.5 1.5M2.5 2.5l11 11"/>',
 live:'<circle cx="8" cy="8" r="1.6"/><path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.3 3.3a6.6 6.6 0 0 0 0 9.4M12.7 3.3a6.6 6.6 0 0 1 0 9.4"/>',
 key:'<circle cx="5.5" cy="10.5" r="2.8"/><path d="M7.5 8.5 13.5 2.5M11 5l1.8 1.8M12.5 3.5l1.5 1.5"/>',
 lock:'<rect x="3.5" y="7.5" width="9" height="6.5" rx="1.5"/><path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2"/>',
 user:'<circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 14a5.2 5.2 0 0 1 10.4 0"/>',
 shield:'<path d="M8 1.8 13 3.6v4c0 3.1-2.1 5.4-5 6.6-2.9-1.2-5-3.5-5-6.6v-4z"/><path d="m5.8 8 1.6 1.6L10.4 6.6"/>'
};
const probeGlyph=name=>`<svg class="pg-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PROBE_GLYPHS[name]}</svg>`;
function probeRing(pct,size){
 const c=size/2,r=c-2.5,len=2*Math.PI*r,fill=Math.max(0,Math.min(100,pct||0))/100*len;
 return `<svg class="pg-ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle class="pg-track" cx="${c}" cy="${c}" r="${r}"/>${fill>0?`<circle class="pg-fill" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${fill.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`:''}</svg>`;
}
const probeBar=pct=>`<span class="pg-bar" aria-hidden="true">${pct!=null?`<i style="width:${Math.max(2,Math.min(100,pct))}%"></i>`:''}</span>`;
// One gauge. 'ring' (detail): a ring with the number inside and the icon under it; 'mini' (rows, 全景): icon, small bar, number.
function probeGauge(g,style){
 const name=`role="img" aria-label="${esc(g.label)}" title="${esc(g.label)}"`;
 if(style==='ring'&&g.key!=='net')return `<span class="pg pg-${g.key} pg-big" ${name}>${probeRing(g.pct,44)}<b class="pg-num">${esc(g.value)}<small>${g.unit}</small></b>${probeGlyph(g.key)}</span>`;
 if(style==='ring')return `<span class="pg pg-net pg-wide" ${name}>${probeGlyph('net')}${probeBar(g.pct)}<b class="pg-num">${esc(g.value)}</b>${g.pct!=null?`<small class="pg-share">${g.pct}%</small>`:''}</span>`;
 return `<span class="pg pg-${g.key}" ${name}>${probeGlyph(g.key)}${g.key==='net'?(g.pct!=null?probeBar(g.pct):''):probeBar(g.pct)}<b class="pg-num">${esc(g.value)}${g.unit?`<small>${g.unit}</small>`:''}</b></span>`;
}
// Where a reading comes from, when it is not a panel: a small quiet mark for a lane (SSH 直读), named in its tip. Panels stay unmarked.
function probeFrom(x){
 const lane=probe.lanes.find(l=>l.id===x.source);if(!lane)return '';
 const label=tr('来源：{name}',{name:lane.name});
 return `<span class="pg-src" role="img" aria-label="${esc(label)}" title="${esc(label)}">${probeGlyph(lane.glyph)}</span>`;
}
// History: CPU and 内存 over the last 24 hours as two thin lines (内存 lighter), drawn to scale 0–100 %; the words (average and
// peak) are the accessible name and tip. 'card' fills the detail card's width; 'mini' is a short CPU line for 全景.
function probeSpark(x,style){
 const h=probeHistoryOf(x);if(!h||(h.cpu.length<2&&h.mem.length<2))return '';
 // A lane's history is this session's readings (SSH 直读), not the panel's 24 hours.
 const n=x.server.history?.length,span=n?tr('最近 {n} 次读取',{n}):tr('过去 {n} 小时',{n:probeData.PROBE_HISTORY_HOURS});
 const words=tr('{span}：{words}',{span,words:probeData.probeHistoryWords(h)});
 if(style==='mini'){const d=probeData.probeSparkPath(h.cpu,48,14);return d?`<span class="ps ps-mini" role="img" aria-label="${esc(words)}" title="${esc(words)}"><svg viewBox="0 0 48 14" width="48" height="14" aria-hidden="true"><path class="ps-cpu" d="${d}"/></svg></span>`:'';}
 return `<span class="ps ps-card" role="img" aria-label="${esc(words)}" title="${esc(words)}"><svg viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true"><path class="ps-base" d="M0 39.5H240"/>${h.mem.length>1?`<path class="ps-mem" d="${probeData.probeSparkPath(h.mem,240,40)}"/>`:''}${h.cpu.length>1?`<path class="ps-cpu" d="${probeData.probeSparkPath(h.cpu,240,40)}"/>`:''}</svg><span class="ps-key" aria-hidden="true"><i class="ps-k-cpu"></i>${probeGlyph('cpu')}<i class="ps-k-mem"></i>${probeGlyph('mem')}<span>${n?tr('{n} 次',{n}):`${probeData.PROBE_HISTORY_HOURS}h`}</span></span></span>`;
}
// A refused read or a live socket, as an icon with its words in the tip: a key (wrong account), a shield (human check), a person
// (private panel, no account), waves (live).
function probeMarks(source){
 const st=probe.state.get(source)||{},live=probe.live.get(source),kind=st.error?probeData.probeErrorKind(st.status,st.reason):st.historyError?probeData.probeErrorKind(st.historyStatus,st.historyReason):'';
 const words=probeData.PROBE_ERROR_WORDS[kind]?tr('{reason}，显示的是上次读到的数据',{reason:probeData.PROBE_ERROR_WORDS[kind]}):st.error||st.historyError||'';
 const icon=probeData.PROBE_ERROR_ICONS[kind]||'';
 return `${words?`<span class="probe-note" role="img" aria-label="${esc(words)}" title="${esc(words)}">${icon?probeGlyph(icon):ui('warn')}</span>`:''}${live?.state==='open'?`<span class="probe-live" role="img" aria-label="${tr('实时推送已连接')}" title="${tr('实时推送已连接')}">${probeGlyph('live')}</span>`:''}`;
}
const probeDot=(v,label)=>`<i class="probe-dot" role="img" aria-label="${esc(label)}" title="${esc(label)}"></i>`;
function probeWords(x,v){return [tr('{name}：{status}',{name:probeSourceName(x.source),status:v.status}),...probeData.probeGauges(x.server).map(g=>g.label),v.seen].join(tr('，'));}
function probeRowHtml(a){
 const x=probeOf(a);if(!x)return '';
 const s=x.server,v=probeData.probeSummary(s);
 return `<span class="r-probe ${v.online?'on':'off'}" data-probe-row="${esc(a.id)}" role="group" aria-label="${esc(probeWords(x,v))}" title="${esc(probeWords(x,v))}">${probeDot(v,v.status)}${probeFrom(x)}${probeData.probeGauges(s).map(g=>probeGauge(g,'mini')).join('')}<span class="probe-seen" title="${esc(v.seen)}">${esc(v.ago)}</span></span>`;
}
function probeFactsHtml(a){
 if(a.type!=='server'||!probe.sources.length&&!probe.lanes.some(l=>l.servers().length))return '<div class="probe-facts" hidden></div>';
 const x=probeOf(a);
 if(!x){
  const row=(k,html)=>`<div class="fact"><span>${k}</span><span>${html}</span></div>`;
  const choices=probe.unmatched.map(u=>`<option value="${esc(probeKey(u.source,u.server.id))}">${esc(u.server.name)} · ${esc(probeSourceName(u.source))}</option>`).join('');
  return `<div class="probe-facts" data-probe-detail="${esc(a.id)}">${row(tr('探针'),`${a.probeLink?.none?tr('不关联'):tr('未关联')}${choices?` <select class="probe-pick" data-id="${esc(a.id)}" aria-label="${tr('关联探针服务器')}"><option value="">${tr('关联…')}</option>${choices}</select>`:''}${a.probeLink?.none?` <button class="text-button inline-button" data-action="probe-auto" data-id="${esc(a.id)}">${tr('恢复自动匹配')}</button>`:''}`)}</div>`;
 }
 const s=x.server,v=probeData.probeSummary(s),st=probe.state.get(x.source)||{},gauges=probeData.probeGauges(s);
 const how={manual:tr('手动关联'),ip:tr('按 IP 匹配'),host:tr('按主机名匹配'),name:tr('按名称匹配')}[x.how]||'';
 const from=[probeSourceName(x.source),s.name,how].filter(Boolean).join(' · ');
 const rings=gauges.filter(g=>g.key!=='net'),net=gauges.find(g=>g.key==='net');
 return `<div class="probe-facts" data-probe-detail="${esc(a.id)}"><section class="probe-card ${v.online?'on':'off'}" aria-label="${tr('探针：{status}',{status:esc(v.status)})}">
  <header class="pc-head">${probeDot(v,tr('探针：{status}',{status:v.status}))}${probeFrom(x)}<span class="pc-from" title="${esc(from)}">${esc(probeSourceName(x.source))}</span>
   <span class="pc-seen" role="img" aria-label="${esc(v.seen)}" title="${esc(v.seen)}">${probeGlyph('seen')}${esc(v.ago)}</span>
   ${probeMarks(x.source)}${s.error&&!st.error?`<span class="probe-err" role="img" aria-label="${esc(s.error)}" title="${esc(s.error)}">${ui('warn')}</span>`:''}
   <button class="icon-button pc-act" data-action="probe-refresh" data-id="${esc(x.source)}"${st.loading?' disabled aria-busy="true"':''} aria-label="${tr('刷新探针')}" title="${tr('刷新探针')}">${probeGlyph('refresh')}</button>
   <button class="icon-button pc-act" data-action="probe-unlink" data-id="${esc(a.id)}" aria-label="${tr('取消关联')}" title="${tr('取消关联（{from}）',{from:esc(from)})}">${probeGlyph('unlink')}</button></header>
  ${rings.length?`<div class="pc-rings">${rings.map(g=>probeGauge(g,'ring')).join('')}</div>`:''}
  ${net?probeGauge(net,'ring'):''}${probeSpark(x,'card')}</section></div>`;
}
function probeStatus(a){
 const x=probeOf(a);if(!x)return null;const v=probeData.probeSummary(x.server);
 return {text:v.online?tr('在线'):tr('离线 · {ago}',{ago:v.ago}),tone:v.online?'':'red',online:v.online};
}
function probePanoHtml(a){
 const x=probeOf(a);if(!x)return '';const v=probeData.probeSummary(x.server);
 return `<span class="pano-probe ${v.online?'on':'off'}" data-probe-pano="${esc(a.id)}" role="group" aria-label="${esc(probeWords(x,v))}" title="${esc(probeWords(x,v))}">${probeDot(v,v.status)}${probeFrom(x)}${probeData.probeGauges(x.server).map(g=>probeGauge(g,'mini')).join('')}${probeSpark(x,'mini')}<span class="probe-seen">${esc(v.ago)}</span></span>`;
}

// Links the person makes: one undo step each.
function probeLink(id,value){
 const a=state.assets.find(x=>x.id===id&&x.type==='server');if(!a)return;
 checkpoint();
 if(value==='none')a.probeLink={none:true};else if(value){const [source,sid]=value.split('/').map(decodeURIComponent);a.probeLink={source,id:sid};}else delete a.probeLink;
 save();probeRelink();render();if(activeAsset===id)showDetail(id,{focus:false});
 // A new hand link reads that source's history (and the others it now covers).
 if(value&&value!=='none'){const x=probeOf(a);if(x&&!probeHistoryOf(x))probeAskHistory(x.source);}if(typeof panoOpen!=='undefined'&&panoOpen)panoramaRender();
 if($('#modal')?.open&&$('#modal').dataset.view==='probe')probeDialogBody();
 toast(value==='none'?tr('已取消关联'):value?tr('已关联探针'):tr('已恢复自动匹配'),true);
}

// 探针数据源: sources, their state, the servers no card took, and adding one. Opened from the menu (文件 → 探针数据源…) and 导入.
function probeDialog({add=false}={}){
 if(proOff)return;
 if(!nativeStore&&!demoMode){toast(tr('探针数据源仅 Mac App 可用'));return;}
 if(!featureOn('probe')){notice(tr('探针与 SSH 直读已在设置里关闭'),{action:'prefs',id:'features',label:tr('打开设置')});return;}
 modal(tr('探针数据源'),`<div class="form probe-dialog"><div id="probe-body"></div>
  <details class="probe-add"${probe.sources.length&&!add?'':' open'}><summary id="probe-form-title">${tr('添加数据源')}</summary><input type="hidden" id="probe-id">
   <label>${tr('面板地址')}<input id="probe-url" maxlength="300" placeholder="status.example.com" spellcheck="false" autocomplete="off" required></label>
   <label id="probe-name-row" hidden>${tr('名称')}<input id="probe-name" maxlength="60"></label>
   <div class="probe-account" id="probe-account" role="group" aria-label="${tr('面板账号')}" hidden>
    <p class="form-note probe-account-hint" id="probe-account-hint">${probeGlyph('lock')}${tr('面板不公开：填面板后台的账号。')}</p>
    <label><span class="probe-token-label">${probeGlyph('user')}${tr('用户名')}</span><input id="probe-username" autocomplete="off" spellcheck="false" maxlength="200"></label>
    <label><span class="probe-token-label">${probeGlyph('key')}${tr('密码')}</span><input id="probe-password" type="password" autocomplete="off" spellcheck="false" maxlength="1000"></label>
   </div>
   <label class="check-label" id="probe-public-row" hidden><input type="checkbox" id="probe-public">${tr('公开面板，不用账号（删掉保存的账号）')}</label>
   <div class="confirm-actions"><button class="button primary" data-action="probe-save"${demoMode?` disabled title="${tr('演示模式不添加数据源')}"`:''}>${tr('保存并读取')}</button><span id="probe-status" class="form-note" role="status"></span></div>
  </details>
  <p class="form-note platform-note" id="probe-credential-note" title="${esc(probeData.PROBE_KINDS.cfsm.credential)}">${ui('lock')}${tr('只读取，账号只存钥匙串。')}</p></div>`,'probe');
 probeDialogBody();
}
window.probeDialog=probeDialog;
// The account fields: hidden until a panel says it is not public (or when editing a source that keeps one).
function probeShowAccount(show,{hint=true}={}){
 const box=$('#probe-account');if(!box)return;box.hidden=!show;$('#probe-account-hint').hidden=!hint;
 if(show&&hint)setTimeout(()=>$('#probe-username')?.focus(),0);
}
// What the first read of a just-saved source says to the form: connected (the form empties), or an account is needed (the
// fields open), or why not (wrong account, a human check, the network).
function probeFormAnswer(source){
 const st=probe.state.get(source)||{},status=$('#probe-status');if(!status)return;
 if(!st.error){
  probe.pending=null;status.textContent=tr('已连上 · {n} 台',{n:st.servers?.length||0});
  for(const f of ['#probe-id','#probe-name','#probe-url','#probe-username','#probe-password'])$(f).value='';
  $('#probe-name-row').hidden=true;$('#probe-public-row').hidden=true;probeShowAccount(false);$('#probe-form-title').textContent=tr('添加数据源');return;
 }
 if(probeData.probeNeedsAccount(st.status,st.reason)&&$('#probe-account').hidden){probeShowAccount(true);status.textContent='';return;}
 const kind=probeData.probeErrorKind(st.status,st.reason);
 status.textContent=probeData.PROBE_ERROR_WORDS[kind]||st.error;
}
function probeDialogBody(){
 const box=$('#probe-body');if(!box)return;
 const servers=state.assets.filter(a=>a.type==='server'&&!a.hiddenAt);
 const sources=probe.sources.map(s=>{
  const st=probe.state.get(s.id)||{},n=st.servers?.length||0,linked=[...probe.links.values()].filter(x=>x.source===s.id).length;
  // A refusal says what to do and keeps the last readings; it is a note, not an alarm.
  const kind=st.error?probeData.probeErrorKind(st.status,st.reason):'',refused=!!probeData.PROBE_ERROR_WORDS[kind];
  const when=st.at?`${tr('{n} 台',{n})} · ${tr('已关联 {n} 台',{n:linked})} · ${tr('{time} 更新',{time:new Date(st.at).toLocaleTimeString(trLocale(),{hour:'2-digit',minute:'2-digit',hour12:false})})}`:'';
  const line=st.loading?tr('读取中…'):refused?`<span class="probe-refused">${probeGlyph(probeData.PROBE_ERROR_ICONS[kind])}${esc(probeData.PROBE_ERROR_WORDS[kind])}${when?tr(' · 保留上次读数'):''}</span>`:st.error?`<span class="probe-err">${esc(st.error)}</span>`:when||tr('还没读取');
  return `<li class="probe-source" data-source="${esc(s.id)}"><div><b>${esc(s.name)}${probeMarks(s.id)}</b><small>${esc(probeData.PROBE_KINDS[s.kind]?.name||s.kind)} · ${esc(s.url)}${s.hasLogin?` · <span class="probe-has-token" role="img" aria-label="${tr('面板账号 {user}',{user:esc(s.username||'')})}" title="${tr('面板账号 {user}',{user:esc(s.username||'')})}">${probeGlyph('user')}</span>`:''}</small><small class="probe-line">${line}</small></div><span class="probe-source-actions"><button class="icon-button pc-act" data-action="probe-refresh" data-id="${esc(s.id)}"${st.loading?' disabled aria-busy="true"':''} aria-label="${tr('刷新')}" title="${tr('刷新')}">${probeGlyph('refresh')}</button>${demoMode?'':`<button class="button" data-action="probe-edit" data-id="${esc(s.id)}">${tr('编辑')}</button>`}${demoMode?'':`<button class="button danger-quiet" data-action="probe-remove" data-id="${esc(s.id)}">${tr('删除')}</button>`}</span></li>`;
 }).join('');
 const loose=probe.unmatched.map(u=>`<li><span><b title="${esc(u.server.name)}">${esc(u.server.name)}</b><small class="${u.server.online?'on':'off'}" title="${esc(probeSourceName(u.source))} · ${u.server.online?tr('在线'):tr('离线')}"><i class="probe-dot" role="img" aria-label="${u.server.online?tr('在线'):tr('离线')}"></i>${esc(probeSourceName(u.source))}</small></span><select class="probe-assign" data-key="${esc(probeKey(u.source,u.server.id))}" aria-label="${tr('关联到服务器')}"><option value="">${tr('关联到…')}</option>${servers.filter(a=>!probe.links.has(a.id)).map(a=>`<option value="${esc(a.id)}">${esc(displayName(a))}</option>`).join('')}</select></li>`).join('');
 box.innerHTML=`${sources?`<ul class="probe-sources">${sources}</ul>`:`<p class="form-note">${tr('还没有探针数据源。添加面板地址后，探针里的服务器会按 IP、主机名或名称自动对上服务器卡片。')}</p>`}
  ${probe.lanes.map(l=>l.dialogHtml()).join('')}
  ${loose?`<h3 class="probe-h">${tr('没对上的探针服务器 · {n}',{n:probe.unmatched.length})}</h3><ul class="probe-loose">${loose}</ul>`:''}`;
}

document.addEventListener('change',e=>{
 const pick=e.target.closest?.('.probe-pick');if(pick&&pick.value){probeLink(pick.dataset.id,pick.value);return;}
 const assign=e.target.closest?.('.probe-assign');if(assign&&assign.value)probeLink(assign.value,assign.dataset.key);
});

proRegister(()=>{
 proSlots.serverProbe={status:probeStatus,rowHtml:probeRowHtml,panoHtml:probePanoHtml};
 proSlots.facts.push(a=>a.type==='server'?probeFactsHtml(a):'');
 proSlots.importSources.push(({native,source})=>(native||demoMode)&&probeOn()?source('probe-sources','pulse',tr('探针'),tr('探针数据源：在服务器卡片上显示在线状态、CPU、内存、磁盘和流量（只读）')):'');
 Object.assign(proSlots.actions,{
  'probe-sources':()=>probeDialog(),
  // Editing fills the form with what may be shown; the password is never shown (left empty, it is kept).
  // Editing shows the name (made from the host when the source was added) and, when one is kept, the account.
  'probe-edit':(el,id)=>{const s=probe.sources.find(x=>x.id===id);if(!s)return;probe.pending=null;$('.probe-add').open=true;
   $('#probe-form-title').textContent=tr('编辑 {name}',{name:s.name});$('#probe-id').value=s.id;$('#probe-name').value=s.name;$('#probe-name-row').hidden=false;$('#probe-url').value=s.url;
   probeShowAccount(s.hasLogin,{hint:false});
   $('#probe-username').value=s.username||'';$('#probe-password').value='';$('#probe-password').placeholder=s.hasLogin?tr('不改就留空'):'';
   $('#probe-public').checked=false;$('#probe-public-row').hidden=!s.hasLogin;$('#probe-url').focus();},
  'probe-refresh':el=>probeRefresh(el.dataset.id||null,{manual:true}),
  'probe-unlink':(el,id)=>probeLink(id,'none'),
  'probe-auto':(el,id)=>probeLink(id,''),
  'probe-remove':(el,id)=>confirmDialog(tr('删除这个探针数据源？'),tr('只删除 Assetboard 里的设置和钥匙串里的令牌，不动面板。手动关联会保留，重新添加后恢复。'),tr('删除'),true).then(ok=>{if(ok)probeSend({action:'probeRemove',id});probeDialog();}),
  // Only the address is asked. It is tried as a public panel first; when the panel answers 401/403, the account fields open and
  // the next save logs in with them. The name comes from the host (the Mac app fills it in) and can be changed when editing.
  'probe-save':()=>{
   const status=$('#probe-status'),url=probeData.probeNormalizeUrl($('#probe-url').value);
   if(!url){status.textContent=tr('面板地址不对，例如 status.example.com');$('#probe-url').focus();return;}
   $('#probe-url').value=url;
   const id=$('#probe-id').value||probe.sources.find(s=>s.url===url)?.id||'';
   const asked=!$('#probe-account').hidden,clearLogin=!!$('#probe-public')?.checked;
   // Both filled: saved to the Keychain. Both empty when editing: what is kept stays. 公开面板: the kept account goes.
   const username=asked?$('#probe-username').value.trim():'',password=asked?$('#probe-password').value:'';
   const keep=!!id&&!password&&!clearLogin&&(!username||probe.sources.find(x=>x.id===id)?.username===username);
   if(asked&&!clearLogin&&!keep&&(!username||!password)){status.textContent=tr('用户名和密码都要填');return;}
   $('#probe-password').value='';status.textContent=asked&&username?tr('登录中…'):tr('读取中…');
   probe.pending={url,id};
   const name=$('#probe-name-row').hidden?'':$('#probe-name').value.trim();
   probeSend({action:'probeSave',...(id?{id}:{}),kind:probeData.PROBE_KIND_DEFAULT,name,url,...(keep||clearLogin||!asked?{}:{username,password}),...(clearLogin?{clearLogin:true}:{})});
  }
 });
 window.addEventListener('DOMContentLoaded',()=>probeStart());
});
// Start once the board is drawn, or when 设置 turns probes on: the sources the app passed in (none in the demo, which has its own),
// then read them. Once only; switched off later, the ticks find probeOn() false and read nothing.
function probeStart(){
  if(probe.started||!probeOn())return;probe.started=true;
  probe.sources=demoMode?[probeData.PROBE_DEMO_SOURCE]:Array.isArray(nativeStore?.probeSources)?nativeStore.probeSources:[];
  for(const s of probe.sources)probe.historyWanted.add(s.id);
  probeRelink();if(probe.sources.length)probeRefresh();
  probe.timer=setInterval(()=>{if(probe.sources.length)probePollTick();},PROBE_POLL_MS);
  // Hidden: live sockets close (polling stops too). Back: anything older than a poll is read again and live reopens.
  document.addEventListener('visibilitychange',()=>{
   if(!probe.sources.length)return;
   if(document.visibilityState!=='visible'){probePause();return;}
   const stale=probe.sources.filter(s=>Date.now()-(probe.state.get(s.id)?.at||0)>PROBE_POLL_MS).map(s=>s.id);
   for(const id of stale)probeRefresh(id);
   probeResume();
  });
}
