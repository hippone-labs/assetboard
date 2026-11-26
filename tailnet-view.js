// Tailscale 在线状态 and 从 Tailscale 添加 (tailnet.js): asks the Mac app for the local Tailscale's node list (bridge tailnetStatus →
// assetboardTailnet), shows each matched server and device as online or offline (through probeState and liveRowHtml in
// pro-slots.js, after any probe reading), and lists the nodes not on the board in 导入 › Tailscale. The status is off until
// switched in 设置 › 功能; it then reads when the page opens, comes back to the front, and at most every TAILNET_MS while in front.
// Opening 导入 › Tailscale reads once whether or not the status is on. Not in a demo or the browser. Loaded after app.js.
const TAILNET_MS=60000;
let tailnetNow={state:'',nodes:[],at:0},tailnetBusy=0,tailnetAsked=0,tailnetSeq=0;
function tailnetHost(){return !!nativeStore&&!demoMode;}
function tailnetOn(){return featureOn('tailnet')&&tailnetHost();}
function tailnetRefresh(){
 if(!tailnetHost())return false;
 const now=Date.now();if(tailnetBusy&&now-tailnetBusy<15000)return false;
 tailnetBusy=now;tailnetAsked=now;
 try{window.webkit.messageHandlers.assetboard.postMessage({action:'tailnetStatus',requestId:++tailnetSeq});}catch{tailnetBusy=0;return false;}
 return true;
}
function tailnetDue(){if(document.visibilityState!=='hidden'&&tailnetOn()&&Date.now()-tailnetAsked>=TAILNET_MS)tailnetRefresh();}
function tailnetSwitch(on){if(on){tailnetAsked=0;tailnetRefresh();}}
window.assetboardTailnet=answer=>{
 tailnetBusy=0;
 const read=parseTailnet(answer);if(!read)return;
 tailnetNow={...read,at:Date.now()};
 if(tailnetOn()){render();if(activeAsset&&TAILNET_TYPES.has(state.assets.find(a=>a.id===activeAsset)?.type))showDetail(activeAsset,{focus:false});if(typeof panoOpen!=='undefined'&&panoOpen&&typeof panoramaRender==='function')panoramaRender();}
 if($('#modal')?.open&&$('#modal').dataset.view==='tailnet')tailnetDialog();
};
if(tailnetHost()){setTimeout(tailnetDue,1800);setInterval(tailnetDue,30000);window.addEventListener('focus',tailnetDue);document.addEventListener('visibilitychange',tailnetDue);}

// One record's status, in probeState's shape ({online, text, tone}), or null when the status is off or the record is no node.
function tailnetStatusOf(a){
 if(!tailnetOn()||tailnetNow.state!=='ok')return null;
 const n=tailnetMatch(a,tailnetNow.nodes);if(!n)return null;
 return {online:n.online,text:n.online?tr('在线'):n.lastSeen?tr('离线 · {ago}',{ago:runAge(n.lastSeen)}):tr('离线'),tone:n.online?'':'red',via:'tailscale',node:n};
}
function tailnetRowHtml(a){
 const s=tailnetStatusOf(a);if(!s)return '';
 const words=tr('Tailscale：{status}',{status:s.text});
 return `<span class="r-probe live-line ${s.online?'on':'off'}${s.tone?' '+s.tone:''}" role="group" aria-label="${esc(words)}" title="${esc(words)}"><i class="probe-dot" role="img" aria-label="${esc(s.text)}"></i><span class="live-text">${esc(s.text)} · Tailscale</span></span>`;
}

// 导入 › Tailscale: the nodes not on the board yet, each recorded as a device or a server with one click (one undo step each).
function tailnetDialog(){
 if(!tailnetHost()){modal(tr('从 Tailscale 添加'),`<p>${tr('只在 Mac App 里可用，演示模式不读取。')}</p>`,'tailnet');return;}
 const t=tailnetNow,left=t.state==='ok'?tailnetUnmatched(state.assets,t.nodes):[];
 const os=n=>({macos:'macOS',ios:'iOS',ipados:'iPadOS',android:'Android',windows:'Windows',linux:'Linux'}[n.os]||n.os||'');
 const row=n=>{const key=esc(n.id||n.dns||n.ips[0]),kind=tailnetKind(n);
  return `<li><span><b>${esc(n.name)}</b> <span class="quiet-fact">${esc([os(n),n.dns||n.ips[0],n.online?'':tr('离线')].filter(Boolean).join(' · '))}</span></span>
   <span class="tailnet-add"><select data-tailnet-kind="${key}" aria-label="${tr('记成')}"><option value="device"${kind==='device'?' selected':''}>${tr('设备')}</option><option value="server"${kind==='server'?' selected':''}>${tr('服务器')}</option></select>
   <button class="button" data-action="tailnet-add" data-id="${key}">${tr('添加')}</button></span></li>`;};
 const body=!t.at?`<p class="quiet-fact">${tr('正在读取本机 Tailscale……')}</p>`
  :t.state==='none'?`<p class="quiet-fact">${tr('这台 Mac 没有装 Tailscale')}</p>`
  :t.state==='stopped'?`<p class="quiet-fact">${tr('Tailscale 没有连接，连上后再打开这里')}</p>`
  :t.state!=='ok'?`<p class="quiet-fact">${tr('没读懂 Tailscale 的回答')}</p>`
  :left.length?`<ul class="peer-list tailnet-list">${left.map(row).join('')}</ul>${left.length>1?`<div class="modal-actions"><button class="button" data-action="tailnet-add-all">${tr('全部添加（{n} 台）',{n:left.length})}</button></div>`:''}`
  :`<p class="quiet-fact">${tr('tailnet 里的设备都已经在资产板上')}</p>`;
 modal(tr('从 Tailscale 添加'),`${body}
  <p class="form-note">${tr('在本机运行一次 tailscale status --json，列出 tailnet 里还没记到资产板上的设备：手机、电脑记成设备，Linux 等记成服务器，可以改。只问本机的 Tailscale，不联网，不读密钥。')}</p>
  ${featureOn('tailnet')?'':`<p class="form-note">${tr('打开「设置 › 功能 › Tailscale 在线状态」后，服务器和设备上会显示在不在线。')}</p>`}`,'tailnet');
}
function tailnetAdd(keys){
 const picked=keys.map(k=>tailnetNow.nodes.find(n=>(n.id||n.dns||n.ips[0])===k)).filter(Boolean).filter(n=>!state.assets.some(a=>tailnetMatch(a,[n])));
 if(!picked.length)return;
 checkpoint();
 for(const n of picked){
  const type=document.querySelector(`[data-tailnet-kind="${CSS.escape(n.id||n.dns||n.ips[0])}"]`)?.value||tailnetKind(n);
  const rec=tailnetRecord(n,type);state.assets.push({id:'asset-'+crypto.randomUUID(),...rec});ensureBlock(state,rec.type);
 }
 save();render();tailnetDialog();
 toast(picked.length>1?tr('已添加 {n} 台',{n:picked.length}):tr('已添加 {name}',{name:picked[0].name}),true);
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
 if(action==='tailnet-import'){if(demoMode){window.assetboardDemoBlocked?.();return;}tailnetAsked=0;tailnetBusy=0;tailnetRefresh();tailnetDialog();}
 else if(action==='tailnet-add')tailnetAdd([id]);
 else if(action==='tailnet-add-all')tailnetAdd([...document.querySelectorAll('[data-action="tailnet-add"]')].map(b=>b.dataset.id));
});
