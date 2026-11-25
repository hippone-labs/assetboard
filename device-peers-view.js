// 其他设备 (DEVICE-PAIRING.md): the dialog (设置 › 连接 › 其他设备), pairing by comparing a code, and reading each paired Mac:
// when the page opens, when it comes back to the front, and at most every PEER_READ_MS while it is in front. An answer becomes
// that Mac's device record (device-peers.js) and its 正在做 reading (shown on its screen in the object panorama). Only in the
// Mac app with the feature on; the demo and the browser have no other Macs. Loaded after device-view.js.
let peersNow={peers:[],found:[],listening:false},peerPairing=null,peerLast={},peerAsked=0;
function peersOn(){return featureOn('peers')&&!!nativeStore&&!demoMode;}
function peersSend(message){try{window.webkit.messageHandlers.assetboard.postMessage({action:'peers',...message});}catch{}}
// 同步资产板, per paired Mac: {on, first:'here'|'there'|'merge', since (ms), done}. 'here' takes from that Mac only what changed there
// after the sync began; 'there' makes this board that Mac's once, then merges; 'merge' merges from the start. Kept by the Mac app
// (devices/peers.json), since the page's own storage does not outlive the app; a pairing starts it there.
function peerSyncOf(id){const p=peersNow.peers.find(x=>x.id===id);return p?.sync?{on:true,first:p.syncFirst||'merge',since:Number(p.syncSince)||0,done:p.syncDone===true}:null;}
function setPeerSync(id,value){
 const p=peersNow.peers.find(x=>x.id===id);if(p)Object.assign(p,value?{sync:true,syncFirst:value.first,syncSince:value.since,syncDone:!!value.done}:{sync:false,syncFirst:undefined,syncSince:undefined,syncDone:false});
 peersSend({op:'sync',id,on:!!value,...(value?{first:value.first,since:value.since,done:!!value.done}:{})});
}
const peerSyncOn=id=>peerSyncOf(id)?.on===true;
function peersReadAll(){if(!peersOn())return;peerAsked=Date.now();for(const p of peersNow.peers){peersSend({op:'read',id:p.id});if(peerSyncOn(p.id))peersSend({op:'readBoard',id:p.id});}}
function peersDue(){if(document.visibilityState!=='hidden'&&peersOn()&&Date.now()-peerAsked>=PEER_READ_MS)peersReadAll();}
// 设置 › 功能: on listens and reads at once; off stops listening and asking. Paired Macs stay paired either way.
function peersSwitch(on){peersSend({op:'enable',on:!!on&&peersOn()});if(on){peerAsked=0;setTimeout(peersDue,800);}}
const peersOpenView=()=>$('#modal')?.open&&$('#modal').dataset.view==='peers';
const PEER_ERRORS={'not-synced':tr('对方还没打开同步'),'no-board':tr('对方还没有资产板'),unreachable:tr('连不上：对方没开 Assetboard，或不在同一网络'),refused:tr('对方没有回答：可能已经解除配对'),timeout:tr('超时'),address:tr('地址不对'),busy:tr('对方正在和别的设备配对'),declined:tr('对方没有确认'),unknown:tr('找不到这台设备')};
window.assetboardPeers=event=>{
 if(!event||typeof event!=='object')return;
 if(Array.isArray(event.peers))peersNow.peers=event.peers.filter(p=>p&&typeof p.id==='string');
 if(Array.isArray(event.found))peersNow.found=event.found.filter(n=>typeof n==='string').slice(0,50);
 if('listening' in event)peersNow.listening=!!event.listening;
 // The app keeps on or off; the page follows it (its own storage starts empty each launch).
 if(typeof event.enabled==='boolean'&&event.enabled!==featureOn('peers')){setFeature('peers',event.enabled);if(event.enabled){peerAsked=0;setTimeout(peersDue,500);}}
 const p=event.pairing;
 if(p&&typeof p==='object'){
  if(p.state==='code'||p.state==='waiting'){peerPairing=p;peersDialog();return;}
  peerPairing=null;
  // A pairing syncs from the start: the Mac that started it keeps its board and takes only what changes over there from now on;
  // the Mac that allowed it takes that board once (or merges both, if that was the answer), then the two merge.
  if(p.state==='paired'&&typeof p.id==='string'){
   toast(tr('已和 {name} 配对，资产板开始同步',{name:String(p.name||'')}));peerAsked=0;peersDue();
  }
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
window.assetboardPeerBoard=answer=>{
 const id=answer?.id;if(typeof id!=='string'||!peersOn()||!peerSyncOn(id))return;
 const pref=peerSyncOf(id);
 if(answer.ok!==true){peerLast[id]={...peerLast[id],syncError:String(answer.error||'unreachable')};if(peersOpenView())peersDialog();return;}
 const r=syncBoards(state,answer.board,{first:pref.done?(pref.first==='here'?'here':''):pref.first,since:pref.first==='here'?pref.since:0});
 if(r.error){peerLast[id]={...peerLast[id],syncError:r.error};return;}
 peerLast[id]={...peerLast[id],syncError:'',syncAt:new Date().toISOString()};
 if(!pref.done)setPeerSync(id,{...pref,done:true});
 if(r.changed){
  for(const key of Object.keys(state))delete state[key];Object.assign(state,r.board);
  save();render();
  const c=r.counts,name=peersNow.peers.find(p=>p.id===id)?.name||'Mac',parts=[c.added?tr('新增 {n}',{n:c.added}):'',c.updated?tr('更新 {n}',{n:c.updated}):'',c.removed?tr('删除 {n}',{n:c.removed}):''].filter(Boolean);
  if(parts.length)toast(tr('从 {name} 同步：{what}',{name,what:parts.join(tr('，'))}));
 }
 if(peersOpenView())peersDialog();
};
function peerSyncDialog(id){
 const x=peersNow.peers.find(p=>p.id===id);if(!x)return;
 const there=esc(x.name);
 modal(tr('和 {name} 同步资产板',{name:there}),`<p>${tr('两台 Mac 的资产板会合并：每条记录以较新的修改为准，一边删掉的另一边也删掉。设备记录不同步，每台只记自己。两台都要打开同步才会开始。')}</p>
  <p>${tr('第一次同步以哪台为准？')}</p>
  <div class="peer-sync-choices">
   <button class="button primary" data-action="peers-sync-start" data-id="${esc(id)}" data-first="here">${tr('以这台为准')}<small>${tr('只接收 {name} 之后的修改；它上面的旧记录不会拿过来',{name:there})}</small></button>
   <button class="button" data-action="peers-sync-start" data-id="${esc(id)}" data-first="there">${tr('以 {name} 为准',{name:there})}<small>${tr('这台的资产板先换成它的，之后再合并')}</small></button>
   <button class="button" data-action="peers-sync-start" data-id="${esc(id)}" data-first="merge">${tr('合并两边')}<small>${tr('两边的记录都留下，同一条以较新的为准')}</small></button>
  </div>`,'peers-sync');
}
function peerSyncLine(p){
 if(!peerSyncOn(p.id))return `<button class="text-button" data-action="peers-sync" data-id="${esc(p.id)}">${tr('同步资产板…')}</button>`;
 // A read that fails after one that worked keeps the time of that one: the other Mac may well have synced since (it reads this one
 // on its own), so 超时 alone would look like nothing ever synced.
 const last=peerLast[p.id],why=last?.syncError?esc(PEER_ERRORS[last.syncError]||last.syncError):'',when=last?.syncAt?esc(new Date(last.syncAt).toLocaleTimeString(trLocale())):'',state=why&&when?tr('{when} 同步过；最近一次：{why}',{when,why}):why||(when?tr('{when} 同步过',{when}):tr('等待第一次同步'));
 return `<span class="quiet-fact">${tr('资产板同步中')} · ${state}</span> <button class="text-button" data-action="peers-sync-stop" data-id="${esc(p.id)}">${tr('停止同步')}</button>`;
}
function peerStatus(p){
 const last=peerLast[p.id];
 if(last?.error)return `<span class="quiet-fact">${esc(PEER_ERRORS[last.error]||last.error)}${last.at?` · ${tr('上次读到 {when}',{when:esc(new Date(last.at).toLocaleString(trLocale()))})}`:''}</span>`;
 if(last?.at)return `<span class="quiet-fact">${tr('{when} 读到',{when:esc(new Date(last.at).toLocaleTimeString(trLocale()))})}</span>`;
 return `<span class="quiet-fact">${tr('还没读过')}</span>`;
}
function peersDialog(){
 const p=peerPairing;
 if(p){
  const name=esc(p.name||'Mac'),code=`<p class="peer-code" aria-label="${tr('配对码 {code}',{code:esc(p.code)})}">${esc(String(p.code||'').replace(/^(\d{3})(\d{3})$/,'$1 $2'))}</p>`;
  // The Mac that started it waits; the Mac asked allows it, once, and says whose board to start from.
  if(p.role==='client'||p.state==='waiting'){
   modal(tr('和 {name} 配对',{name}),`<p>${p.role==='client'?tr('在 {name} 上点「允许」。两台屏幕上的数字应该一样。',{name}):tr('正在完成配对……')}</p>${code}<div class="modal-actions"><button class="button" data-action="peers-confirm" data-id="no">${tr('取消')}</button></div>`,'peers');
   return;
  }
  modal(tr('{name} 想和这台配对',{name}),`<p>${tr('看一眼 {name} 的屏幕，数字一样再允许。配对后两台互相读本机信息和「正在做」，资产板自动同步。',{name})}</p>${code}
   <div class="peer-sync-choices">
    <button class="button primary" data-action="peers-confirm" data-id="yes" data-mode="there">${tr('允许，以 {name} 为准',{name})}<small>${tr('这台的资产板换成它的，之后两台自动同步')}</small></button>
    <button class="button" data-action="peers-confirm" data-id="yes" data-mode="merge">${tr('允许，合并两边')}<small>${tr('两边的记录都留下，同一条以较新的为准')}</small></button>
    <button class="button" data-action="peers-confirm" data-id="no">${tr('拒绝')}</button>
   </div>`,'peers');
  return;
 }
 if(demoMode||!nativeStore){modal(tr('其他设备'),`<p>${tr('和你的其他 Mac 配对，互相读本机信息和「正在做」。只在 Mac App 里可用，演示模式不连接。')}</p>`,'peers');return;}
 const paired=peersNow.peers.length?`<ul class="peer-list">${peersNow.peers.map(x=>`<li><span><b>${esc(x.name)}</b>${x.host?` <span class="quiet-fact">${esc(x.host)}</span>`:''}<br>${peerStatus(x)}<br>${peerSyncLine(x)}</span><button class="text-button" data-action="peers-unpair" data-id="${esc(x.id)}">${tr('解除配对')}</button></li>`).join('')}</ul>`:`<p class="quiet-fact">${tr('还没有配对的设备')}</p>`;
 const pairedNames=new Set(peersNow.peers.map(x=>x.name)),found=peersNow.found.filter(n=>!pairedNames.has(n));
 const nearby=found.length?`<ul class="peer-list">${found.map(n=>`<li><span>${esc(n)}</span><button class="button" data-action="peers-pair" data-id="${esc(n)}">${tr('配对')}</button></li>`).join('')}</ul>`:`<p class="quiet-fact">${peersNow.listening?tr('这个网络里没找到开着 Assetboard 的 Mac'):tr('正在启动……')}</p>`;
 modal(tr('其他设备'),`<h3>${tr('已配对')}</h3>${paired}
  <h3>${tr('同一网络里的 Mac')}</h3>${nearby}
  <h3>${tr('按地址添加')}</h3><p class="form-note">${tr('不在同一网络时，填对方的 Tailscale 地址或 MagicDNS 名，例如 mac-mini.tailnet-name.ts.net 或 100.64.0.7。对方要开着 Assetboard，并打开「其他设备」。')}</p>
  <div class="peer-add"><input id="peer-host" type="text" maxlength="260" autocomplete="off" spellcheck="false" placeholder="${tr('地址或名称')}" aria-label="${tr('对方的地址')}"><button class="button" data-action="peers-pair-host">${tr('配对')}</button></div>
  <p class="form-note">${tr('两台 Mac 直接连接，不经过任何服务器：互相读本机信息和「正在做」，资产板自动同步。打开过这里之后，这台 Mac 在局域网上可被发现（「设置 › 功能 › 其他设备」可关）；第一次会弹「本地网络」授权。')}</p>
  <div class="modal-actions"><button class="button" data-action="peers-read">${tr('现在读取')}</button></div>`,'peers');
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
 // Opening 其他设备 is the intent to pair: it turns the feature on (listening, found on this network) without another switch.
 if(action==='peers-open'){if(!featureOn('peers')&&nativeStore&&!demoMode){setFeature('peers',true);peersSwitch(true);}peersSend({op:'list'});peersDialog();}
 else if(action==='peers-enable'){setFeature('peers',true);peersSwitch(true);peersDialog();}
 else if(action==='peers-pair')peersSend({op:'pair',service:id});
 else if(action==='peers-pair-host'){const host=$('#peer-host')?.value.trim();if(!host){$('#peer-host')?.focus();return;}peersSend({op:'pair',host});}
 else if(action==='peers-confirm'){const mode=el.dataset.mode==='merge'?'merge':'there';peersSend({op:'confirm',ok:id==='yes',mode});}
 else if(action==='peers-read'){peerAsked=0;peersDue();toast(tr('正在读取'));}
 else if(action==='peers-sync')peerSyncDialog(id);
 else if(action==='peers-sync-start'){const first=['here','there','merge'].includes(el.dataset.first)?el.dataset.first:'merge';setPeerSync(id,{on:true,first,since:Date.now(),done:false});peersSend({op:'sync',id,on:true});peersSend({op:'readBoard',id});peersDialog();toast(tr('已打开同步'));}
 else if(action==='peers-sync-stop'){setPeerSync(id,null);peersSend({op:'sync',id,on:false});peersDialog();}
 else if(action==='peers-unpair'){
  const x=peersNow.peers.find(p=>p.id===id);if(!x)return;
  if(!await confirmDialog(tr('和 {name} 解除配对？',{name:x.name}),tr('两台 Mac 不再互相读取。它的设备记录会留在资产板上，可以自己删掉；以后要再读，重新配对。'),tr('解除配对'),true)){peersDialog();return;}
  peersSend({op:'unpair',id});setPeerSync(id,null);delete peerLast[id];peersDialog();
 }
});
if(nativeStore&&!demoMode){setTimeout(()=>peersSend({op:'list'}),800);setInterval(peersDue,15000);window.addEventListener('focus',peersDue);document.addEventListener('visibilitychange',peersDue);}
