// Object panorama view: the panorama's 实物 drawing (OBJECT-PANORAMA.md). panorama-objects.js decides what each asset is drawn as
// and its state; this file words and draws it inside the panorama that panorama-view.js opens, and answers whether it fits.
// Read-only: an object opens its inspector, nothing is dragged. It probes nothing and polls nothing: a reading shown here is the
// record's 实时状态 reading (probeState), redrawn whenever the board is.
// Loaded after panorama-view.js (and after sessions-view.js where the page has it).
const PO_ZONE={desk:tr('本机'),domain:tr('域名'),server:tr('服务器'),data:tr('数据'),pass:tr('订阅'),wallet:tr('付款与号码'),id:tr('登录账号'),repository:tr('仓库')};
const PO_STUB={monthly:tr('月票'),quarterly:tr('季票'),halfyearly:tr('半年票'),yearly:tr('年票')};
// The window on the wall: a frame, a patch of sky and a sun or a moon (material.css shows one by the board's light or dark).
const PO_WINDOW='<svg class="po-window" viewBox="0 0 620 146" aria-hidden="true"><rect class="sky" x="8" y="8" width="604" height="130"/><circle class="sun" cx="488" cy="52" r="16"/><path class="moon" d="M494 35a18 18 0 1 0 12 31a15 15 0 0 1-12-31z"/><rect class="frame" x="4" y="4" width="612" height="138"/><line class="frame" x1="400" y1="4" x2="400" y2="142"/></svg>';
const PO_CLOUD='<svg class="po-cloud" viewBox="0 0 300 92" preserveAspectRatio="none" aria-hidden="true"><path d="M64 88c-22 0-36-14-36-30 0-16 12-28 30-30 6-16 26-26 50-26 18 0 34 6 44 16 12-10 32-16 54-13 24 3 40 17 42 35 22 2 36 12 36 26 0 13-16 22-40 22H64z"/></svg>';
const poLine=(cls,text,tone='')=>text?`<span class="${cls}${tone?' '+tone:''}">${esc(text)}</span>`:'';
const poLed=o=>`<i class="po-led${o.tone?' '+o.tone:''}${o.stopped?' off':''}" aria-hidden="true"></i>`;
// The words of an object's state: a manual stop, else its reading and (without a reading, or when the date needs attention) its date.
function poWords(o){
 if(o.stopped)return tr('已停用');
 return [o.live?.text,o.label&&(!o.live||o.dateTone)?o.label:''].filter(Boolean).join(' · ');
}
// Paper wears its date: a corner curls and yellows when it is due soon, a stamp lands on it once it is overdue.
const poWear=o=>`${o.dateTone==='amber'?'<i class="po-curl" aria-hidden="true"></i>':''}${o.dateTone==='red'?`<span class="po-stamp" aria-hidden="true">${tr('过期')}</span>`:''}`;
// Every object is one button: its label carries the name, the category, what tells it apart and its state.
function poBtn(o,inner,extra=[]){
 const a=o.asset,label=[displayName(a),cats[a.type].one,...extra,poWords(o)].filter(Boolean).join(tr('，'));
 return `<button class="po po-${o.shape}${o.tone?' '+o.tone:''}${o.dateTone&&o.dateTone!==o.tone?' date-'+o.dateTone:''}${o.stopped?' stopped':''}" data-nav data-chip="${esc(a.id)}" data-obj="${o.shape}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
}
const poName=(o,led=false)=>`<span class="po-nm">${led?poLed(o):''}<b>${esc(displayName(o.asset))}</b></span>`;
function poServer(o){
 const a=o.asset,ip=primaryIp(a),addr=ip?pIp(ip.ip):'',rest=[a.provider&&a.provider!=='SSH'?a.provider:'',a.purpose].filter(Boolean).join(' · ');
 const cap=ip||rest?`<span class="po-cap">${ip?`<span class="ip-text" data-full="${esc(ip.ip)}">${esc(addr)}</span>`:''}${ip&&rest?' · ':''}${esc(rest)}</span>`:'';
 const probe=proSlots.serverProbe&&!a.stopped?proSlots.serverProbe.panoHtml(a):'',stat=poLine('po-stat',poWords(o),o.tone);
 if(o.shape==='tower')return poBtn(o,`<span class="po-bays" aria-hidden="true"><i></i><i></i></span>${poName(o,true)}${ip?`<span class="po-cap"><span class="ip-text" data-full="${esc(ip.ip)}">${esc(addr)}</span></span>`:''}${poLine('po-cap',rest)}${probe}<span class="po-foot"><em class="po-tag">${tr('本地')}</em>${stat}</span>`,[tr('本地机器'),addr]);
 return poBtn(o,`<span class="po-grill" aria-hidden="true"></span><span class="po-main">${poName(o,true)}${cap}${probe}</span>${stat}`,[addr]);
}
function poPlate(o){
 const a=o.asset;
 return poBtn(o,`<i class="po-cord" aria-hidden="true"></i><span class="po-face">${poName(o)}${poLine('po-when',poWords(o))}${poLine('po-cap',a.purpose)}</span>`,[o.home.name||tr('未记注册商')]);
}
// A registrar and the plates under it: Cloudflare's is a cloud, any other a rail with its name, none a dashed rail.
function poHome(g){
 const name=g.name||tr('未记注册商');
 return `<div class="po-home ${g.cloud?'on-cloud':g.key?'on-rail':'on-none'}" data-home="${esc(g.key)}" role="group" aria-label="${esc(name+tr('，')+tr('{n} 个域名',{n:g.items.length}))}"><span class="po-roof">${g.cloud?PO_CLOUD:''}<b>${esc(name)}</b></span><div class="po-signs">${g.items.map(poPlate).join('')}</div></div>`;
}
// Tickets (subscriptions), passes (AI plans) and deeds (licences): name, what it is for or who sells it, the price, the date.
function poPaper(o){
 const a=o.asset,price=costText(a),sub=a.type==='subscription'?a.purpose||a.provider:a.provider||a.purpose;
 const top={ticket:'<i class="po-hole" aria-hidden="true"></i>',pass:'<i class="po-clip" aria-hidden="true"></i><i class="po-slot" aria-hidden="true"></i>'}[o.shape]||'';
 const foot={ticket:`<i class="po-perf" aria-hidden="true"></i>${poLine('po-stub',PO_STUB[a.cycle])}`,deed:'<i class="po-seal" aria-hidden="true"></i>'}[o.shape]||'';
 return poBtn(o,`${top}${poWear(o)}${poName(o)}${poLine('po-cap',sub)}${poLine('po-price',price)}${poLine('po-when',poWords(o),o.dateTone)}${foot}`,[sub,price]);
}
function poCard(o){
 const a=o.asset,net=a.network?tr(a.network):'';
 return poBtn(o,`<i class="po-chip" aria-hidden="true"></i>${poLine('po-net',net)}<span class="po-pan">•••• ${esc(a.last4||'••••')}</span>${o.dateTone||o.stopped?poLine('po-when',poWords(o),o.dateTone):''}<span class="po-row">${poName(o)}${poLine('po-exp',expiryText(a.date))}</span>`,[net,a.last4?tr('尾号 {last}',{last:a.last4}):'',a.provider]);
}
function poSim(o){
 const a=o.asset,num=maskPhone(a.phone),halted=PHONE_STATUSES[a.phoneStatus]||'';
 return poBtn(o,`<i class="po-pads" aria-hidden="true"></i>${poName(o)}${poLine('po-num',num)}${poLine('po-cap',[regionFlag(a.region),halted||a.provider].filter(Boolean).join(' '))}${poLine('po-when',poWords(o),o.dateTone)}`,[num,a.provider,halted]);
}
// Sign-in accounts: an Apple ID is a passport (it has a region), a Google account a key with a name tag.
function poAccount(o){
 const a=o.asset,mail=a.account?veilAccount(maskEmail(a.account)):'',region=regionName(a.region),when=poLine('po-when',poWords(o),o.dateTone);
 if(o.shape==='passport')return poBtn(o,`<i class="po-crest" aria-hidden="true"></i><span class="po-kind">Apple ID</span>${poName(o)}${poLine('po-cap',mail)}${poLine('po-cap',region)}${when}`,[mail,region]);
 return poBtn(o,`<span class="po-keycut" aria-hidden="true"><i class="po-shaft"></i><i class="po-bow"></i></span><span class="po-keytag">${poName(o)}${poLine('po-cap',mail)}${poLine('po-cap',region)}${when}</span>`,[mail,region]);
}
// Drums (databases), buckets (object storage) and containers (deployment services): where it sits and, when it is read, its reading.
function poVessel(o){
 const a=o.asset,host=o.hosts[0],at=host?tr('驻在 {name}',{name:displayName(host)}):'',sub=[a.provider,a.port&&':'+a.port].filter(Boolean).join(' · ');
 const top={drum:'<i class="po-drumtop" aria-hidden="true"></i>',bucket:'<i class="po-bail" aria-hidden="true"></i>',container:'<i class="po-doors" aria-hidden="true"></i>'}[o.shape];
 return poBtn(o,`${top}<span class="po-body">${poName(o,true)}${poLine('po-cap',sub)}${poLine('po-cap',at)}${poLine('po-when',poWords(o),o.tone)}</span>`,[sub,at]);
}
function poFolder(o){
 const a=o.asset,locked=isPrivateRepo(a);
 return poBtn(o,`<i class="po-tab" aria-hidden="true"></i><span class="po-nm">${locked?ui('lock'):''}<b>${esc(displayName(a))}</b></span>${poLine('po-when',poWords(o),o.dateTone)||poLine('po-cap',a.pushedAt?ageText(a.pushedAt):'')}`,[locked?tr('私有仓库'):'']);
}
const PO_DRAW={mac:poDevice,rack:poServer,tower:poServer,plate:poPlate,ticket:poPaper,pass:poPaper,deed:poPaper,card:poCard,sim:poSim,passport:poAccount,key:poAccount,drum:poVessel,bucket:poVessel,container:poVessel,folder:poFolder};

// 正在做: the readings the Mac's screen shows, in coding-sessions.js's shape ({host, at, sessions}). A page with that module gives
// its codingData(); without it only the demo board has a made-up reading, and a real board has none (the empty state).
function objWorkReadings(){
 if(typeof codingData==='function')return codingData();
 return demoMode&&typeof window.assetboardDemoWork==='function'?[window.assetboardDemoWork()]:[];
}
// This Mac, the carrier of the 正在做 screen. Without a device record it is no asset: nothing opens, nothing is stored. With this
// Mac's record (本机设备) it is that record: a button that opens it, with its name and its chip and memory under the stand.
let poLocal=null;
function poMac(o=null){
 const w=workScreen(objWorkReadings(),{summary:typeof codingSummary==='function'?codingSummary:null}),form=o?(deviceForm(o.asset)==='desktop'?'mini':'laptop'):macForm(w.host);
 const {head,lines}=poWork(w);
 const screen=`<span class="po-screen"><span class="po-cap">${tr('本机')}</span><b class="po-work">${esc(head)}</b>${lines.map(t=>`<span class="po-work-l">${esc(t)}</span>`).join('')}</span>`;
 const body=`<span class="po-lid">${screen}</span>${poMacBody(form)}`;
 if(!o)return `<div class="po-mac is-${form}${w.total?'':' no-work'}" data-mac="${form}" data-sessions="${w.total}" role="group" aria-label="${esc([tr('本机'),head,...lines].join(tr('，')))}">${body}</div>`;
 return poMacButton(o,form,body+poDeviceCaption(o),`${w.total?'':' no-work'}" data-mac="${form}" data-sessions="${w.total}`,[head,...lines]);
}
// A screen's words for 正在做: the heading and a line per tool, or the quiet empty state.
function poWork(w){
 const row=l=>[l.name,tr('{n} 个会话',{n:l.count}),veil(l.repo),l.minutes!=null?tr('{n} 分钟',{n:l.minutes}):''].filter(Boolean).join(' · ');
 return {head:w.total?tr('正在做 · {n} 个会话',{n:w.total}):tr('正在做'),lines:w.total?[...w.lines.map(row),w.more?tr('另有 {n} 个工具',{n:w.more}):''].filter(Boolean):[tr('现在没有会话')]};
}
const poMacBody=form=>form==='mini'?'<span class="po-stand" aria-hidden="true"></span><span class="po-box" aria-hidden="true"><i></i></span>':'<span class="po-base" aria-hidden="true"><i class="po-deck"></i><i class="po-pad"></i></span>';
const poDeviceCaption=o=>`<span class="po-dev-cap">${poName(o)}${poLine('po-cap',deviceLine(o.asset))}${poLine('po-when',[deviceTone(o.asset)?deviceDiskText(o.asset):'',o.stopped?tr('已停用'):''].filter(Boolean).join(' · '),deviceTone(o.asset))}</span>`;
// A device drawn as a Mac is one button like every object (poBtn's label and data), shaped by .po-mac.
function poMacButton(o,form,inner,more,extra){
 const a=o.asset,tone=deviceTone(a),label=[displayName(a),cats[a.type].one,deviceLine(a),...extra,tone?deviceDiskText(a):''].filter(Boolean).join(tr('，'));
 return `<button class="po po-mac is-${form}${tone?' '+tone:''}${o.stopped?' stopped':''}${more}" data-nav data-chip="${esc(a.id)}" data-obj="mac" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
}
// A device: this Mac's record carries the 正在做 screen; a paired Mac (其他设备) its own 正在做 once read; any other device's
// screen shows its name.
function poDevice(o){
 if(o===poLocal)return poMac(o);
 const a=o.asset,form=deviceForm(a)==='desktop'?'mini':'laptop';
 const w=isPeerDevice(a)&&a.peerId&&typeof peerHost==='function'?workScreen(objWorkReadings(),{summary:typeof codingSummary==='function'?codingSummary:null,hostId:peerHost(a.peerId)}):null;
 if(w?.total){
  const {head,lines}=poWork(w);
  const screen=`<span class="po-screen"><span class="po-cap">${esc(veil(displayName(a)))}</span><b class="po-work">${esc(head)}</b>${lines.map(t=>`<span class="po-work-l">${esc(t)}</span>`).join('')}</span>`;
  return poMacButton(o,form,`<span class="po-lid">${screen}</span>${poMacBody(form)}${poDeviceCaption(o)}`,` other-device" data-sessions="${w.total}`,[head,...lines]);
 }
 const screen=`<span class="po-screen"><span class="po-cap">${esc(cats.device.one)}</span><b class="po-work">${esc(veil(displayName(a)))}</b>${poLine('po-work-l',deviceLine(a))}</span>`;
 return poMacButton(o,form,`<span class="po-lid">${screen}</span>${poMacBody(form)}${poDeviceCaption(o)}`,' other-device',[]);
}
const poZone=(key,inner)=>`<section class="pz pz-${key}" data-zone="${key}" aria-label="${PO_ZONE[key]}"><h3 class="pz-label">${PO_ZONE[key]}</h3><div class="pz-items">${inner}</div></section>`;
function poZoneHtml(z){
 const draw=o=>PO_DRAW[o.shape](o);
 if(z.key==='domain')return poZone(z.key,z.groups.map(poHome).join(''));
 // The desk: this Mac (its record when there is one, else the plain carrier of the screen), then any other device.
 if(z.key==='desk'){poLocal=z.items.find(o=>isLocalDevice(o.asset))||null;return poZone(z.key,(poLocal?'':poMac())+z.items.map(draw).join(''));}
 if(z.key==='server'){const racks=z.items.filter(o=>o.shape==='rack'),towers=z.items.filter(o=>o.shape==='tower');return poZone(z.key,`${racks.length?`<div class="po-stack">${racks.map(draw).join('')}</div>`:''}${towers.map(draw).join('')}`);}
 return poZone(z.key,z.items.map(draw).join(''));
}
// The bar's count in place of the cards' type toggles: how many things are fine, need a look, or are overdue or down.
function poTally(t){
 const part=(n,word,tone)=>`<span>${`<i class="po-led${tone?' '+tone:''}" aria-hidden="true"></i>`}<b>${n}</b> ${word}</span>`;
 return `<span class="po-tally" role="group" aria-label="${tr('{ok} 正常，{amber} 注意，{red} 异常',t)}">${part(t.ok,tr('正常'),'')}${part(t.amber,tr('注意'),'amber')}${part(t.red,tr('异常'),'red')}</span>`;
}
// → null when there is nothing to draw, else {live, tally, body(tier)}: the scene at one of OBJECT_TIERS.
function objectsScene(){
 const model=buildObjects(state.assets,{cardOrder:state.cardOrder||{},live:probeState});if(!model.total)return null;
 poLocal=null;const zones=(model.zones.some(z=>z.key==='desk')?'':poZone('desk',poMac()))+model.zones.map(poZoneHtml).join('');
 return {live:model.live,tally:poTally(model.tally),body:tier=>`<div class="pano-body objects" data-layout="objects" data-tier="${tier}">${PO_WINDOW}<div class="po-scene" style="zoom:${+(tier*panoZoom()).toFixed(3)}">${zones}</div></div>`};
}
// Draws the scene into the panorama when it fits: the full size first, then the smaller tier. false = it does not (a narrow or
// short window, or more things than a screen holds), and the caller draws cards; nothing is ever left out of a scene.
function objectsPaint(root,model){
 const zoom=panoZoom(),bar=root.querySelector('.pano-bar')?.offsetHeight||56;
 if(!objectsRoom(panoW()/zoom,(root.clientHeight-bar)/zoom))return false;
 const scene=objectsScene();if(!scene)return false;
 for(const tier of OBJECT_TIERS){
  root.innerHTML=panoramaHtml(model,{live:scene.live,tally:scene.tally,body:scene.body(tier)});
  const body=root.querySelector('.pano-body'),box=body.getBoundingClientRect();
  if([...body.querySelectorAll('.pz')].every(z=>{const r=z.getBoundingClientRect();return r.right<=box.right-8&&r.bottom<=box.bottom-8;}))return true;
 }
 return false;
}
// ← → walk the drawing order; ↑ ↓ go to the nearest object above or below.
function objectsMove(from,key){
 const items=panoNavItems(),at=items.indexOf(from);if(at<0)return;
 if(key==='ArrowLeft'||key==='ArrowRight'){items[at+(key==='ArrowRight'?1:-1)]?.focus();return;}
 const r=from.getBoundingClientRect(),x=r.left+r.width/2,down=key==='ArrowDown';let best=null,least=Infinity;
 for(const n of items){
  if(n===from)continue;
  const q=n.getBoundingClientRect(),dy=down?q.top-r.bottom:r.top-q.bottom;if(dy<-2)continue;
  const score=Math.max(dy,0)+2*Math.max(q.left-x,0,x-q.right);if(score<least){least=score;best=n;}
 }
 best?.focus();
}
// A new reading of 正在做 (coding-sessions.js refreshes on its own timer) redraws the screen and nothing else.
function objectsWorkChanged(){const mac=panoOpen&&document.querySelector('#panorama [data-mac]:not(.other-device)');if(mac)mac.outerHTML=poMac(poLocal&&mac.dataset.chip===poLocal.id?poLocal:null);}
if(typeof window.assetboardCodingSessions==='function'){const take=window.assetboardCodingSessions;window.assetboardCodingSessions=function(){take.apply(this,arguments);objectsWorkChanged();};}
