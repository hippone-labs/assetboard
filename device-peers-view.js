// 其他设备 (DEVICE-PAIRING.md): the dialog (设置 › 连接 › 其他设备), pairing by comparing a code, and reading each paired Mac:
// when the page opens, when it comes back to the front, and at most every PEER_READ_MS while it is in front. An answer becomes
// that Mac's device record (device-peers.js) and its 正在做 reading (shown on its screen in the object panorama). Only in the
// Mac app with the feature on; the demo and the browser have no other Macs. Loaded after device-view.js.
let peersNow={peers:[],found:[],listening:false},peerPairing=null,peerLast={},peerAsked=0;
function peersOn(){return featureOn('peers')&&!!nativeStore&&!demoMode;}
function peersSend(message){try{window.webkit.messageHandlers.assetboard.postMessage({action:'peers',...message});}catch{}}
function peersReadAll(){if(!peersOn())return;peerAsked=Date.now();for(const p of peersNow.peers)peersSend({op:'read',id:p.id});}
function peersDue(){if(document.visibilityState!=='hidden'&&peersOn()&&Date.now()-peerAsked>=PEER_READ_MS)peersReadAll();}
// 设置 › 功能: on listens and reads at once; off stops listening and asking. Paired Macs stay paired either way.
function peersSwitch(on){peersSend({op:'enable',on:!!on&&peersOn()});if(on){peerAsked=0;setTimeout(peersDue,800);}}
const peersOpenView=()=>$('#modal')?.open&&$('#modal').dataset.view==='peers';
const PEER_ERRORS={unreachable:tr('连不上：对方没开 Assetboard，或不在同一网络'),refused:tr('对方没有回答：可能已经解除配对'),timeout:tr('超时'),address:tr('地址不对'),busy:tr('对方正在和别的设备配对'),declined:tr('对方没有确认'),unknown:tr('找不到这台设备')};
window.assetboardPeers=event=>{
 if(!event||typeof event!=='object')return;
 if(Array.isArray(event.peers))peersNow.peers=event.peers.filter(p=>p&&typeof p.id==='string');
 if(Array.isArray(event.found))peersNow.found=event.found.filter(n=>typeof n==='string').slice(0,50);
 if('listening' in event)peersNow.listening=!!event.listening;
 const p=event.pairing;
 if(p&&typeof p==='object'){
  if(p.state==='code'||p.state==='waiting'){peerPairing=p;peersDialog();return;}
  peerPairing=null;
  if(p.state==='paired'){toast(tr('已和 {name} 配对',{name:String(p.name||'')}));peerAsked=0;peersDue();}
  else if(p.state==='failed')toast(tr('配对没有完成：{why}',{why:PEER_ERRORS[p.error]||String(p.error||'')}));
  else if(p.state==='busy')toast(tr('已经有一个配对在进行'));
  if(peersOpenView())peersDialog();
  return;
 }
 if(peersOpenView())peersDialog();
};
window.assetboardPeerFacts=answer=>{
 const id=answer?.id;if(typeof id!=='string'||!peersOn())return;
 if(answer.ok!==true){peerLast[id]={...peerLast[id],error:String(answer.error||'unreachable')};if(peersOpenView())peersDialog();return;}
 const facts=parsePeerFacts(answer);if(!facts)return;
 peerLast[id]={at:facts.at,error:''};
 if(facts.sessions&&typeof codingReadings!=='undefined'&&featureOn('codingSessions'))codingReadings={...codingReadings,[facts.sessions.host.id]:facts.sessions};
 const merged=mergePeer(state,facts);
 if(merged.changed){state.assets=merged.assets;ensureBlock(state,'device');save();render();}
 else if(typeof panoOpen!=='undefined'&&panoOpen&&typeof panoramaRender==='function')panoramaRender();
 if(peersOpenView())peersDialog();
};
function peerStatus(p){
 const last=peerLast[p.id];
 if(last?.error)return `<span class="quiet-fact">${esc(PEER_ERRORS[last.error]||last.error)}${last.at?` · ${tr('上次读到 {when}',{when:esc(new Date(last.at).toLocaleString(trLocale()))})}`:''}</span>`;
 if(last?.at)return `<span class="quiet-fact">${tr('{when} 读到',{when:esc(new Date(last.at).toLocaleTimeString(trLocale()))})}</span>`;
 return `<span class="quiet-fact">${tr('还没读过')}</span>`;
}
function peersDialog(){
 const p=peerPairing;
 if(p){
  const waiting=p.state==='waiting';
  modal(tr('和 {name} 配对',{name:esc(p.name||'Mac')}),`<p>${waiting?tr('等 {name} 上的人确认……',{name:esc(p.name||'Mac')}):tr('核对两台 Mac 上的数字。一样就点「一致」；不一样就点「不一致」，这次配对作废。')}</p>
   <p class="peer-code" aria-label="${tr('配对码 {code}',{code:esc(p.code)})}">${esc(String(p.code||'').replace(/^(\d{3})(\d{3})$/,'$1 $2'))}</p>
   <div class="modal-actions">${waiting?`<button class="button" data-action="peers-confirm" data-id="no">${tr('取消')}</button>`:`<button class="button" data-action="peers-confirm" data-id="no">${tr('不一致')}</button><button class="button primary" data-action="peers-confirm" data-id="yes">${tr('一致')}</button>`}</div>`,'peers');
  return;
 }
 if(demoMode||!nativeStore){modal(tr('其他设备'),`<p>${tr('和你的其他 Mac 配对，互相读本机信息和「正在做」。只在 Mac App 里可用，演示模式不连接。')}</p>`,'peers');return;}
 if(!featureOn('peers')){
  modal(tr('其他设备'),`<p>${tr('和你的其他 Mac 配对后，互相读对方的本机信息（型号、芯片、内存、系统、磁盘、电池）和「正在做」，各自记成一条设备。资产板不同步，也不能操作对方。')}</p>
   <p class="form-note">${tr('打开后，这台 Mac 会在局域网上可被发现；第一次会弹「本地网络」授权。两台 Mac 直接连接，不经过任何服务器。')}</p>
   <div class="modal-actions"><button class="button primary" data-action="peers-enable">${tr('打开')}</button></div>`,'peers');
  return;
 }
 const paired=peersNow.peers.length?`<ul class="peer-list">${peersNow.peers.map(x=>`<li><span><b>${esc(x.name)}</b>${x.host?` <span class="quiet-fact">${esc(x.host)}</span>`:''}<br>${peerStatus(x)}</span><button class="text-button" data-action="peers-unpair" data-id="${esc(x.id)}">${tr('解除配对')}</button></li>`).join('')}</ul>`:`<p class="quiet-fact">${tr('还没有配对的设备')}</p>`;
 const pairedNames=new Set(peersNow.peers.map(x=>x.name)),found=peersNow.found.filter(n=>!pairedNames.has(n));
 const nearby=found.length?`<ul class="peer-list">${found.map(n=>`<li><span>${esc(n)}</span><button class="button" data-action="peers-pair" data-id="${esc(n)}">${tr('配对')}</button></li>`).join('')}</ul>`:`<p class="quiet-fact">${peersNow.listening?tr('这个网络里没找到开着 Assetboard 的 Mac'):tr('正在启动……')}</p>`;
 modal(tr('其他设备'),`<h3>${tr('已配对')}</h3>${paired}
  <h3>${tr('同一网络里的 Mac')}</h3>${nearby}
  <h3>${tr('按地址添加')}</h3><p class="form-note">${tr('不在同一网络时，填对方的 Tailscale 地址或 MagicDNS 名，例如 mac-mini.tailnet-name.ts.net 或 100.64.0.7。对方要开着 Assetboard，并打开「其他设备」。')}</p>
  <div class="peer-add"><input id="peer-host" type="text" maxlength="260" autocomplete="off" spellcheck="false" placeholder="${tr('地址或名称')}" aria-label="${tr('对方的地址')}"><button class="button" data-action="peers-pair-host">${tr('配对')}</button></div>
  <div class="modal-actions"><button class="button" data-action="peers-read">${tr('现在读取')}</button></div>`,'peers');
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
 if(action==='peers-open'){peersSend({op:'list'});peersDialog();}
 else if(action==='peers-enable'){setFeature('peers',true);peersSwitch(true);peersDialog();}
 else if(action==='peers-pair')peersSend({op:'pair',service:id});
 else if(action==='peers-pair-host'){const host=$('#peer-host')?.value.trim();if(!host){$('#peer-host')?.focus();return;}peersSend({op:'pair',host});}
 else if(action==='peers-confirm')peersSend({op:'confirm',ok:id==='yes'});
 else if(action==='peers-read'){peerAsked=0;peersDue();toast(tr('正在读取'));}
 else if(action==='peers-unpair'){
  const x=peersNow.peers.find(p=>p.id===id);if(!x)return;
  if(!await confirmDialog(tr('和 {name} 解除配对？',{name:x.name}),tr('两台 Mac 不再互相读取。它的设备记录会留在资产板上，可以自己删掉；以后要再读，重新配对。'),tr('解除配对'),true)){peersDialog();return;}
  peersSend({op:'unpair',id});delete peerLast[id];peersDialog();
 }
});
if(nativeStore&&!demoMode){setTimeout(()=>{peersSend({op:'enable',on:peersOn()});setTimeout(peersDue,1500);},1000);setInterval(peersDue,15000);window.addEventListener('focus',peersDue);document.addEventListener('visibilitychange',peersDue);}
