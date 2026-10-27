// Panorama view (v13b P2): the read-only whole-board overview. Everything is derived from `state` by panorama.js; this file only draws it.
// Status here is the registered status (expiry, manual stop), never a live probe, and the view says so (DESIGN-PRINCIPLES: no probing, not real-time).
// v22: one card per hub (server, deployment, storage, or a bank card in the pay lens), sized by what it holds, so one server never fills the screen.
uiGlyphs.treemap='<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M11 4.5v15M11 11.5h9.5M15.5 11.5v8"/>';
uiGlyphs.expand='<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
icons.project='<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>';
uiGlyphs.eyeOff='<path d="M3.5 12s3-5.5 8.5-5.5c1.2 0 2.3.3 3.2.7M20.5 12s-1.1 2-3.2 3.6M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16"/>';
let panoNative=false,panoShow=false,panoAlt=false,panoIdleTimer=0,panoFocus=null,panoOrigin=null,panoOpen=false,panoReturn=null,panoFrame=0,panoObserver=null,panoKey='',panoLooseOpen=false,panoCompact=false;
const panoExpanded=new Set();
const PANO_FOCUS_CAP=6;
// The lens and the types switched off in each lens are remembered per viewer (their own key, so the board's view prefs never overwrite them).
const PANO_PREFS='assetboard.panorama';
const panoPrefs=(()=>{try{const p=JSON.parse(localStorage.getItem(PANO_PREFS)||'{}');return {lens:typeof p.lens==='string'?p.lens:'',hide:p.hide&&typeof p.hide==='object'?p.hide:{}};}catch{return {lens:'',hide:{}};}})();
let panoLens=panoPrefs.lens;
const panoHide=panoPrefs.hide;
function panoSaveLens(){try{localStorage.setItem(PANO_PREFS,JSON.stringify({lens:panoLens,hide:panoHide}));}catch{}}
// 按项目 is Pro: without it the lens is left out, so a remembered one falls back.
const panoSkip=()=>({skip:projectsOn()?[]:['project']});
const panoLensDef=()=>PANORAMA_LENSES.find(l=>l.key===panoLens)||PANORAMA_LENSES[0];
const panoHidden=()=>Array.isArray(panoHide[panoLens])?panoHide[panoLens]:[];
const panoModel=()=>buildPanorama(state.assets,{lens:panoLens,cardOrder:state.cardOrder||{},hide:panoHidden()});
// Presentation (v13b P6): addresses lose their middle (hover or ⌥ shows them), the bar fades after 3 s, the body scales up to 1.5× on big screens.
const pIp=ip=>privacy||(panoShow&&!panoAlt)?maskIp(ip):ip;
// Width of the panorama itself: the middle column beside the sidebar (the whole window when the sidebar folds into a strip).
const panoW=()=>$('#panorama')?.clientWidth||innerWidth;
const panoZoom=()=>panoShow&&panoW()>=1500?Math.min(1.5,panoW()/1200):1;
const PANO_TYPE_LABEL={domain:tr('域名'),repository:tr('仓库'),database:tr('数据库'),storage:tr('对象存储'),service:tr('订阅与账号'),infra:tr('服务器与服务'),server:tr('服务器'),deployment:tr('部署服务'),bankcard:tr('付款卡'),appleid:'Apple ID',google:tr('Google 账号'),project:tr('项目')};
const panoKindName=a=>cats[a.type]?.one||PANO_TYPE_LABEL[a.type]||'';
// What each lens calls things: the loose card, an empty board, an empty card, the "+", and what a write did.
const PANO_WORDS={
 host:{loose:tr('未挂载'),empty:tr('还没有服务器、部署服务或对象存储'),hint:tr('把域名、仓库或数据库拖到这里，或点 ＋ 挑选'),add:tr('挂上'),title:n=>tr('挂到「{name}」',{name:n}),none:tr('挂上去'),added:tr('挂上'),removed:tr('取下'),
  move:n=>tr('已移到 {name}',{name:n}),also:n=>tr('也挂到 {name}',{name:n}),detach:tr('已解除关联'),where:list=>tr('在 {list}',{list}),many:n=>tr('共 {n} 处',{n})},
 pay:{loose:tr('没记付款卡'),empty:tr('还没有付款卡'),hint:tr('把它付款的东西拖到这里，或点 ＋ 挑选'),add:tr('记上付款'),title:n=>tr('由「{name}」付款的',{name:n}),none:tr('记在这张卡上'),added:tr('记上'),removed:tr('去掉'),
  move:n=>tr('改由 {name} 付款',{name:n}),also:n=>tr('也由 {name} 付款',{name:n}),detach:tr('已去掉付款卡'),where:list=>tr('也由 {list} 付款',{list}),many:n=>tr('{n} 张卡',{n})},
 login:{loose:tr('没记登录账号'),empty:tr('还没有 Apple ID 或 Google 账号'),hint:tr('把用它登录的东西拖到这里，或点 ＋ 挑选'),add:tr('记上登录'),title:n=>tr('用「{name}」登录的',{name:n}),none:tr('记上用它登录'),added:tr('记上'),removed:tr('去掉'),
  move:n=>tr('改用 {name} 登录',{name:n}),also:n=>tr('也用 {name} 登录',{name:n}),detach:tr('已去掉登录账号'),where:list=>tr('也用 {list} 登录',{list}),many:n=>tr('{n} 个账号',{n})},
 project:{loose:tr('不归项目'),empty:tr('还没有项目'),hint:tr('把属于这个项目的东西拖到这里，或点 ＋ 挑选'),add:tr('加入项目'),title:n=>tr('「{name}」项目里的',{name:n}),none:tr('加进这个项目'),added:tr('加入'),removed:tr('移出'),
  move:n=>tr('已归入 {name}',{name:n}),also:n=>tr('已归入 {name}',{name:n}),detach:tr('已移出项目'),where:list=>tr('现在在 {list}',{list}),many:n=>tr('{n} 个项目',{n})}
};
const panoWords=()=>PANO_WORDS[panoLens]||PANO_WORDS.host;
const PANO_LOOSE_LABEL=Object.fromEntries(Object.entries(PANO_WORDS).map(([k,w])=>[k,w.loose]));
const panoDot=(tone,stopped)=>`<i class="pd${tone?' '+tone:''}${stopped?' off':''}" aria-hidden="true"></i>`;
function panoSyncTime(){const times=state.assets.filter(a=>a.source!=='csv').map(a=>Date.parse(a.syncedAt)).filter(Boolean);if(!times.length)return '';return new Date(Math.max(...times)).toLocaleTimeString(trLocale(),{hour:'2-digit',minute:'2-digit',hour12:false});}
// A probe's state stands in for the implied 运行中; 已停用 set by hand still wins, and a stopped server is never marked down.
function panoStopped(lane){return !!lane.stopped;}
function panoDown(a){const live=probeState(a);return live&&!live.online&&!a.stopped?' probe-down':'';}
function panoStatus(a){
 if(a.stopped)return {text:tr('已停用'),tone:''};
 // A server whose probe reports it offline says so (离线 · N 分钟前, red), in place of the implied 运行中; online needs no words:
 // the probe's quiet dot and gauges on the card say it.
 const live=probeState(a);if(live&&!live.online)return {text:live.text,tone:live.tone};
 if(!a.date)return {text:'',tone:''};
 const s=assetDateStatus(a);return {text:s.label,tone:s.level==='overdue'?'red':s.level==='soon'?'amber':''};
}
// One short fact on a row: days left on a domain or anything dated, the port of a database, how many hubs share a repository.
function panoFact(chip){
 const a=chip.asset;
 if(a.date&&!a.stopped){const d=assetDateStatus(a).days;if(Number.isFinite(d)&&(chip.type==='domain'||chip.tone))return d<0?tr('过期 {n} 天',{n:-d}):tr('{n} 天',{n:d});}
 if(a.port)return ':'+a.port;
 if(chip.alsoOn)return panoWords().many(chip.alsoOn+1);
 return '';
}
function panoChip(chip,laneId,extra=''){
 const a=chip.asset,status=panoStatus(a),fact=panoFact(chip);
 const label=[displayName(a),cats[a.type].one,chip.standby?tr('备用'):'',chip.proxied?tr('经代理'):'',status.text,a.port?tr('端口 {port}',{port:a.port}):'',chip.alsoOn?(panoLens==='pay'?tr('另有 {n} 张卡付款',{n:chip.alsoOn}):panoLens==='login'?tr('另有 {n} 个账号可登录',{n:chip.alsoOn}):state.assets.find(x=>x.id===laneId)?.type==='server'?tr('另挂在 {n} 台服务器',{n:chip.alsoOn}):tr('另挂在 {n} 处',{n:chip.alsoOn})):''].filter(Boolean).join(tr('，'));
 return `<button class="pano-chip t-${esc(a.type)}${chip.stopped?' stopped':''}${chip.tone?' '+chip.tone:''}${extra}" data-nav data-chip="${esc(a.id)}" data-lane="${esc(laneId||'')}" ${panoShared&&panoShared.has(a.id)?'data-shared="1"':''} aria-label="${esc(label)}" title="${esc(label)}"><span class="pc-ic" aria-hidden="true">${icon(a.type)}</span><span class="pc-nm">${esc(displayName(a))}</span>${chip.standby?`<small class="pc-flag" aria-hidden="true">${tr('备')}</small>`:''}${chip.proxied?'<svg class="pc-px" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2"/><circle cx="6" cy="6" r="1.3"/></svg>':''}${chip.alsoOn?`<span class="pc-alt" aria-hidden="true">${icon('server')}</span>`:''}${fact?`<small class="pc-k" aria-hidden="true">${esc(fact)}</small>`:''}${panoDot(chip.tone,chip.stopped)}</button>`;
}
let panoShared=null;
function panoSub(a,ip){
 const provider=a.type==='bankcard'?[a.network,a.last4&&`•••• ${a.last4}`].filter(Boolean).join(' '):a.type==='appleid'||a.type==='google'?(a.account?maskEmail(a.account):''):a.provider&&a.provider!=='SSH'?a.provider:'';
 const ipLine=ip?`<span class="pl-ip">${ip.inner?`<em class="ip-inner" title="${tr('内网地址')}">${tr('内')}</em>`:''}<span class="ip-text" data-full="${esc(ip.ip)}">${esc(pIp(ip.ip))}</span>${ip.more?`<em class="ip-more" aria-label="${tr('另有 IPv6')}">+${ip.more}</em>`:''}</span>`:'';
 return ip||provider?`<span class="pl-sub">${ipLine}${provider?`<span class="pl-prov">${esc(provider)}</span>`:''}</span>`:'';
}
function panoLaneHead(lane){
 const a=lane.hub,ip=lane.ip,status=panoStatus(a);
 const label=[a.name,panoKindName(a),ip&&pIp(ip.ip),tr('{n} 项',{n:lane.total}),status.text].filter(Boolean).join(tr('，'));
 return `<button class="pano-lane-head" data-nav data-lane-head="${esc(lane.id)}" aria-label="${esc(label)}" title="${esc(label)}">${cardTile(a,'sm')}<span class="pl-tx"><b class="pl-nm">${esc(displayName(a))}</b>${panoSub(a,ip)}</span>${a.virtual?'':panoDot(status.tone,panoStopped(lane))}</button>`;
}
function panoCounts(lane,groups){
 return `<span class="pl-cnts">${groups.filter(g=>g.total).map(g=>`<span class="pl-cnt" title="${PANO_TYPE_LABEL[g.key]} ${g.total}" aria-label="${PANO_TYPE_LABEL[g.key]} ${g.total}">${icon(g.types[0])}${g.total>99?'99+':g.total}</span>`).join('')}${lane.hidden?`<span class="pl-cnt hid" title="${tr('已隐藏 {n} 项',{n:lane.hidden})}" aria-label="${tr('已隐藏 {n} 项',{n:lane.hidden})}">${ui('eyeOff')}${lane.hidden}</span>`:''}</span>`;
}
// An empty card says what it is for: the place to drop something.
// The "+" on a card picks several things at once (and unticks what should come off), one undo step for the lot.
// Tab reaches it; arrows skip it (they walk head → rows), and + on a card's head or rows opens it.
const panoAddBtn=(id,name)=>`<button class="pl-add" data-add="${esc(id)}" aria-label="${panoWords().add}… ${esc(name)}" title="${panoWords().add}…">${ui('plus')}</button>`;
// The account a server belongs to rides on its card as one quiet line, so cards flow without full-width headings breaking the rows.
function panoAcct(lane,bands){
 const b=lane.account&&bands.get(lane.account),a=b?.asset;if(!a)return '';
 const when=a.date?assetDateStatus(a):null,s=panoStatus(a),charge=when?(when.kind==='renew'?tr('扣款 {when}',{when:agendaWhen(when)}):when.label):'';
 return `<button class="pl-band" data-open="${esc(a.id)}" aria-label="${tr('账号 {name}',{name:esc(displayName(a))})}${charge?tr('，')+esc(charge):''}" title="${esc(displayName(a))}${charge?' · '+esc(charge):''}">${icon('subscription')}<span>${esc(displayName(a))}</span>${s.tone?panoDot(s.tone):''}</button>`;
}
function panoLane(lane,bands=new Map()){
 const view=laneView(lane,{compact:panoCompact,lens:panoLens,open:panoExpanded}),status=panoStatus(lane.hub);
 const probeLine=lane.hub.type==='server'&&proSlots.serverProbe?proSlots.serverProbe.panoHtml(lane.hub):'';
 const stl=status.text||lane.total||lane.hidden?`<div class="pl-st"><span class="pl-state ${status.tone}">${esc(status.text)}</span>${panoCounts(lane,lane.groups)}</div>${probeLine}`:probeLine;
 let body;
 if(view.compact)body=view.dots.length?`<div class="pl-dots" aria-hidden="true">${view.dots.map(d=>`<i class="pdot${d.tone?' '+d.tone:''}${d.stopped?' off':''}"></i>`).join('')}${view.more?`<small>+${view.more}</small>`:''}</div>`:'';
 else body=`<div class="pl-kids">${view.groups.map(g=>`<div class="pl-grp" data-group="${g.key}">${g.shown.map(c=>panoChip(c,lane.id)).join('')}${g.more?`<button class="pano-more" data-nav data-lane="${esc(lane.id)}" data-more="${esc(lane.id+':'+g.key)}" aria-label="${tr('另外 {n} 项，展开',{n:g.more})}" title="${tr('展开')}">+${g.more}</button>`:g.open&&g.total>g.cap?`<button class="pano-more" data-nav data-lane="${esc(lane.id)}" data-more="${esc(lane.id+':'+g.key)}" aria-label="${tr('收起')}" title="${tr('收起')}">−</button>`:''}</div>`).join('')}${lane.total||lane.off?'':`<p class="pl-empty">${panoWords().hint}</p>`}</div>`;
 return `<article class="pano-lane pano-card${view.compact?' compact':''}${panoStopped(lane)?' stopped':''}${lane.tone?' '+lane.tone:''}${panoDown(lane.hub)}" data-lane="${esc(lane.id)}" data-account="${esc(lane.account||'')}" data-hub="${esc(lane.hub.type)}">${panoAcct(lane,bands)}${panoLaneHead(lane)}${panoAddBtn(lane.id,displayName(lane.hub))}${stl}${body}</article>`;
}
// Things on no hub of this lens: a dashed card at the end of the grid, so they sit next to where they can be dropped.
function panoLoose(model){
 if(!model.unmounted.total)return '';
 const cap=capUnmounted(model,panoLooseOpen),name=PANO_LOOSE_LABEL[model.lens]||tr('未挂载');
 return `<aside class="pano-loose${panoLooseOpen?' open':''}" aria-label="${name}${tr('，')}${tr('{n} 项',{n:model.unmounted.total})}"><div class="pano-loose-head">${icon({pay:'bankcard',login:'google',project:'project'}[model.lens]||'server')}<span>${name}</span><b>${model.unmounted.total>99?'99+':model.unmounted.total}</b></div><div class="pano-loose-chips">${cap.shown.map(c=>panoChip(c,'')).join('')}${cap.more?`<button class="pano-more" data-nav data-loose-more aria-label="${tr('另外 {n} 项，展开',{n:cap.more})}" title="${tr('展开')}">+${cap.more}</button>`:panoLooseOpen&&model.unmounted.total>PANORAMA_UNMOUNTED_CAP?`<button class="pano-more" data-nav data-loose-more aria-label="${tr('收起')}" title="${tr('收起')}">−</button>`:''}</div></aside>`;
}
// The totals double as type toggles: click one to take that kind off the board (cards for a hub type, rows for a kid type), click again to bring it back.
function panoTotals(list){return list.map(t=>{const name=PANO_TYPE_LABEL[t.key]||cats[t.key]?.name||t.key;return `<button class="pano-total" data-toggle="${esc(t.key)}" aria-pressed="${!t.off}" title="${t.off?tr('显示{name}（{n}）',{name,n:t.n}):tr('隐藏{name}（{n}）',{name,n:t.n})}" aria-label="${name} ${t.n}">${icon(t.types[0])}${t.n}</button>`;}).join('');}
function panoToggle(key){
 const list=panoHidden(),on=!list.includes(key),lens=panoLensDef();
 if(on&&lens.fits[key]){const live=Object.keys(lens.fits).filter(t=>t!==key&&!list.includes(t)&&state.assets.some(a=>!a.hiddenAt&&a.type===t));if(!live.length){toast(tr('至少留一种卡片'));return;}}
 panoHide[panoLens]=on?[...list,key]:list.filter(k=>k!==key);if(!panoHide[panoLens].length)delete panoHide[panoLens];
 panoSaveLens();panoramaRender();
 const name=PANO_TYPE_LABEL[key]||cats[key]?.name||key;panoSay(on?tr('已隐藏{name}',{name}):tr('已显示{name}',{name}));
}
function panoLensSwitch(){
 const open=panoramaLenses(state.assets,panoSkip());if(open.length<2)return '';
 return `<div class="pano-lens" role="group" aria-label="${tr('视角')}">${PANORAMA_LENSES.filter(l=>open.includes(l.key)).map(l=>`<button class="seg" data-lens="${l.key}" aria-pressed="${l.key===panoLens}">${tr(l.name)}</button>`).join('')}</div>`;
}

// Focused state (v13b P3): one hub is the protagonist. Left rail = every hub of the lens, centre = the hero card with its addresses, a column per group.
function panoRail(model,id){
 return `<nav class="pano-rail" aria-label="${esc(tr(panoLensDef().hubName))}">${model.lanes.map(l=>{const st=panoStatus(l.hub),ip=l.ip;return `<button class="pf-srv${l.id===id?' on':''}" data-nav data-pick="${esc(l.id)}" ${l.id===id?'aria-current="true"':''} aria-label="${esc([l.hub.name,ip&&pIp(ip.ip),tr('{n} 项',{n:l.total}),st.text].filter(Boolean).join(tr('，')))}" title="${esc(l.hub.name)}">${panoDot(st.tone,panoStopped(l))}<span class="pf-tx"><b>${esc(displayName(l.hub))}</b>${ip?`<small class="ip-text" data-full="${esc(ip.ip)}">${esc(pIp(ip.ip))}</small>`:''}</span><em>${l.total}</em></button>`;}).join('')}</nav>`;
}
function panoHero(lane,model){
 const a=lane.hub,status=panoStatus(a),provider=a.provider&&a.provider!=='SSH'?a.provider:'',ips=assetIps(a);
 const account=lane.account?model.accounts.find(x=>x.id===lane.account)?.asset:null;
 const label=[a.name,ips.map(x=>pIp(x.ip)).join(tr('、')),tr('{n} 项',{n:lane.total}),status.text].filter(Boolean).join(tr('，'));
 return `${account?`<button class="pf-acct" data-nav data-open="${esc(account.id)}" aria-label="${tr('账号 {name}',{name:esc(displayName(account))})}" title="${esc(displayName(account))}">${icon('subscription')}<span>${esc(displayName(account))}</span></button>`:''}
 <article class="pano-hero${panoStopped(lane)?' stopped':''}${panoDown(a)}" data-hero="${esc(lane.id)}"><button class="ph-head" data-nav data-hero-head aria-label="${esc(label)}" title="${esc(label)}">${cardTile(a,'sm')}<span class="pl-tx"><b class="ph-nm">${esc(displayName(a))}</b>${provider?`<span class="pl-prov">${esc(provider)}</span>`:''}</span></button>${panoAddBtn(lane.id,displayName(a))}
 ${ips.length?`<div class="ip-pills ph-ips">${ips.map(x=>`<button class="ip-pill" data-action="copy-ip" data-ip="${esc(x.ip)}" title="${tr('复制 IP')}" aria-label="${tr('复制 IP {ip}',{ip:esc(pIp(x.ip))})}">${x.inner?`<em>${tr('内')}</em>`:''}<span class="ip-text" data-full="${esc(x.ip)}">${esc(pIp(x.ip))}</span></button>`).join('')}</div>`:''}
 <div class="ph-st"><span class="pl-state ${status.tone}">${panoDot(status.tone,panoStopped(lane))}${esc(status.text)}</span>${panoCounts(lane,lane.groups)}</div>${a.type==='server'&&proSlots.serverProbe?proSlots.serverProbe.panoHtml(a):''}</article>`;
}
function panoFocusColumns(lane){
 const cols=lane.groups.filter(g=>g.total).map(g=>{
  const key=lane.id+':f:'+g.key,open=panoExpanded.has(key),list=open?g.chips:g.chips.slice(0,PANO_FOCUS_CAP),more=g.total-PANO_FOCUS_CAP;
  return `<section class="pf-col" data-group="${g.key}" aria-label="${PANO_TYPE_LABEL[g.key]} ${g.total}"><h3>${icon(g.types[0])}<span>${g.total>99?'99+':g.total}</span></h3>${list.map(c=>panoChip(c,lane.id)).join('')}${more>0?`<button class="pano-more" data-nav data-more="${esc(key)}" aria-label="${open?tr('收起'):tr('另外 {n} 项，展开',{n:more})}" title="${open?tr('收起'):tr('展开')}">${open?'−':'+'+more}</button>`:''}</section>`;}).join('');
 return cols?`<div class="pf-cols" style="--cols:${Math.min(3,lane.groups.filter(g=>g.total).length)}">${cols}</div>`:'';
}
function panoFocusHtml(model,lane){
 return `<div class="pano-body pano-focused" data-level="f" data-layout="${panoW()<=760?'stack':'row'}">${panoRail(model,lane.id)}<div class="pf-stage">${panoHero(lane,model)}${panoFocusColumns(lane)}</div>${panoLoose(model)}</div>`;
}
function panoFlip(el,from){
 if(!el||!from||matchMedia('(prefers-reduced-motion:reduce)').matches||!el.animate)return;
 const to=el.getBoundingClientRect();if(!to.width||!to.height||!from.width)return;
 el.animate([{transformOrigin:'0 0',transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`,opacity:.35},{transformOrigin:'0 0',transform:'none',opacity:1}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function panoramaFocus(id,from,stay=false){
 if(!panoOpen)return;
 const lane=panoModel().lanes.find(l=>l.id===id);if(!lane)return;
 panoOrigin=from||panoOrigin;panoFocus=id;panoramaRender();
 const root=$('#panorama');if(!stay)root.querySelector('.ph-head')?.focus({preventScroll:true});
 panoFlip(root.querySelector('.pano-hero'),from);
}
function panoramaUnfocus(){
 if(!panoOpen||!panoFocus)return;
 const id=panoFocus;panoFocus=null;panoramaRender();
 const root=$('#panorama'),head=root.querySelector(`[data-lane-head="${CSS.escape(id)}"]`);head?.focus({preventScroll:true});
 if(head&&!matchMedia('(prefers-reduced-motion:reduce)').matches)root.querySelector('.pano-body')?.animate([{opacity:.4},{opacity:1}],{duration:150,easing:'ease-out'});
}
function panoSetLens(key){
 if(key===panoLens||!PANORAMA_LENSES.some(l=>l.key===key))return;
 panoLens=key;panoSaveLens();panoFocus=null;panoLooseOpen=false;panoExpanded.clear();panoramaRender();
 $('#panorama')?.querySelector(`[data-lens="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
const PANO_NEXT_MIN=1000;
function panoNext(){
 const events=upcomingEvents(state.assets).slice(0,8);
 return `<aside class="pano-next" aria-label="${tr('接下来')}"><h3>${tr('接下来')}</h3>${events.length?events.map(({asset,status})=>`<button class="pn-row${status.level==='overdue'?' red':status.level==='soon'?' amber':''}" data-nav data-open="${esc(asset.id)}" title="${esc(displayName(asset)+tr('，')+status.label)}"><span class="pc-ic" aria-hidden="true">${icon(asset.type)}</span><span class="pn-nm">${esc(displayName(asset))}</span><small>${esc(agendaWhen(status))}</small></button>`).join(''):`<p class="pn-none">${tr('60 天内没有')}</p>`}</aside>`;
}
function panoCardsHtml(model){
 const side=panoW()/panoZoom()>=PANO_NEXT_MIN,bands=new Map(model.accounts.map(b=>[b.id,b]));
 const grid=model.accounts.flatMap(b=>b.lanes).map(l=>panoLane(l,bands)).join('')+panoLoose(model);
 return `<div class="pano-wrap"><div class="pano-grid">${grid}</div>${side?panoNext():''}</div>`;
}
function panoramaHtml(model){
 const sync=panoSyncTime(),tag=tr('登记状态 · 非实时')+(sync?' · '+tr('同步 {time}',{time:sync}):'');
 const body=model.lanes.length?panoCardsHtml(model):`<div class="pano-empty"><p>${(PANO_WORDS[model.lens]||PANO_WORDS.host).empty}</p><button class="button icon-only" data-action="pano-add" aria-label="${tr('添加服务器')}" title="${tr('添加服务器')}">${ui('plus')}</button></div>${panoLoose(model)}`;
 const focusLane=panoFocus&&model.lanes.find(l=>l.id===panoFocus);if(panoFocus&&!focusLane)panoFocus=null;
 // Focused: the title becomes the way back, a breadcrumb to the whole map (Esc does the same).
 const title=focusLane?`<h2 class="pano-title"><button class="pano-back" data-action="pano-back" aria-label="${tr('返回全景')}" title="${tr('返回全景（Esc）')}">${ui('back')}${tr('全景')}</button><span class="pano-crumb" aria-hidden="true">/</span><span class="pano-here">${esc(displayName(focusLane.hub))}</span></h2>`:`<h2 class="pano-title">${ui('treemap')}${tr('全景')}</h2>`;
 return `<header class="pano-bar">${title}<div class="pano-totals">${panoTotals(model.totals)}</div><span class="pano-spacer"></span>${focusLane?'':panoLensSwitch()}<div class="pano-legend" aria-hidden="true"><span>${panoDot('red')}${tr('已过期')}</span><span>${panoDot('amber')}${tr('即将到期')}</span><span>${panoDot('')}${tr('登记中')}</span><span>${panoDot('',true)}${tr('已停用')}</span></div><span class="pano-tag" title="${tr('只显示你登记和同步的数据，不探测网络')}">${tag}</span><button class="button icon-only pano-show" data-action="pano-show" aria-pressed="${panoShow}" aria-label="${tr('展示模式')}" title="${tr('展示模式：遮住地址中间两段，顶栏自动淡出')}">${ui('expand')}</button><button class="button icon-only pano-close" data-action="pano-close" aria-label="${tr('关闭全景')}" title="${tr('关闭全景（Esc）')}">×</button></header>${focusLane?panoFocusHtml(model,focusLane):`<div class="pano-body cards${panoCompact?' compact':''}" data-layout="cards">${body}</div>`}`;
}
function panoramaRender(){
 const root=$('#panorama');if(!panoOpen||!root)return;
 if(panoDrag)panoDragEnd(true);if(panoLink)panoLinkEnd();
 if(!panoramaLenses(state.assets,panoSkip()).includes(panoLens))panoLens=pickLens(state.assets,panoLens,panoSkip());
 const model=panoModel();panoShared=model.shared;
 const keep=document.activeElement?.closest?.('#panorama')?document.activeElement:null,saved=keep&&{lens:keep.dataset.lens,pick:keep.dataset.pick,hero:'heroHead' in keep.dataset,open:keep.dataset.open,chip:keep.dataset.chip,lane:keep.dataset.laneHead,more:keep.dataset.more,loose:'looseMore' in keep.dataset,add:keep.dataset.add,toggle:keep.dataset.toggle,close:keep.classList.contains('pano-close')};
 const draw=()=>{root.innerHTML=panoramaHtml(model);const z=panoZoom(),body=root.querySelector('.pano-body');if(body&&z!==1)body.style.zoom=z;};
 // Cards first; when they overflow the window, step down to compact cards (head and a dot per thing) so a big board still fits on one screen.
 panoCompact=false;draw();
 const grid=root.querySelector('.pano-grid');if(grid&&model.lanes.length>3&&grid.scrollHeight>grid.clientHeight+2){panoCompact=true;draw();}
 root.classList.toggle('show',panoShow);
 if(saved){const sel=saved.add?`[data-add="${CSS.escape(saved.add)}"]`:saved.toggle?`[data-toggle="${CSS.escape(saved.toggle)}"]`:saved.lens?`[data-lens="${CSS.escape(saved.lens)}"]`:saved.pick?`[data-pick="${CSS.escape(saved.pick)}"]`:saved.hero?'[data-hero-head]':saved.open?`[data-open="${CSS.escape(saved.open)}"]`:saved.chip?`[data-chip="${CSS.escape(saved.chip)}"]`:saved.lane?`[data-lane-head="${CSS.escape(saved.lane)}"]`:saved.more?`[data-more="${CSS.escape(saved.more)}"]`:saved.loose?'[data-loose-more]':saved.close?'.pano-close':'';(sel&&root.querySelector(sel)||root.querySelector('[data-nav]')||root.querySelector('.pano-close'))?.focus({preventScroll:true});}
}
function panoramaOpen(show=!panoOpen,serverId=null){
 const root=$('#panorama');if(!root||show===panoOpen)return;
 if(show){
  if(!featureOn('panorama')){notice(tr('全景已在设置里关闭'),{action:'prefs',id:'features',label:tr('打开设置')});return;}
  if($('#modal').open||!$('#keys-help').hidden)return;
  if(!$('#detail').hidden)closeDetail();
  // Opening on a server (P on a board card) shows it where it runs; otherwise the remembered lens, or the one with the most links.
  const server=serverId&&state.assets.find(a=>a.id===serverId&&a.type==='server'&&!a.hiddenAt);
  panoLens=server?'host':pickLens(state.assets,panoLens,panoSkip());
  panoReturn=document.activeElement;panoOpen=true;panoShow=panoNative;panoFocus=server?serverId:null;panoLooseOpen=false;panoExpanded.clear();
  root.hidden=false;document.body.classList.add('pano-open');$('main').inert=true;
  renderSidebar();panoramaRender();(root.querySelector(panoFocus?'.ph-head':'[data-nav]')||root.querySelector('.pano-close')).focus({preventScroll:true});
  panoObserver||=new ResizeObserver(()=>{if(!panoOpen||panoFrame)return;panoFrame=requestAnimationFrame(()=>{panoFrame=0;const key=innerWidth+'x'+innerHeight;if(key===panoKey)return;panoKey=key;panoramaRender();});});
  panoKey=innerWidth+'x'+innerHeight;panoObserver.observe(root);
 }else{
  panoOpen=false;panoFocus=null;panoShow=panoNative;panoAlt=false;clearTimeout(panoIdleTimer);root.classList.remove('show','idle');panoObserver?.disconnect();cancelAnimationFrame(panoFrame);panoFrame=0;
  root.hidden=true;root.innerHTML='';document.body.classList.remove('pano-open');$('main').inert=false;renderSidebar();
  if(panoReturn?.isConnected)panoReturn.focus({preventScroll:true});panoReturn=null;
 }
}
const togglePanorama=show=>panoramaOpen(show);
function panoWake(){const root=$('#panorama');if(!root)return;root.classList.remove('idle');clearTimeout(panoIdleTimer);if(panoShow&&panoOpen)panoIdleTimer=setTimeout(()=>root.classList.add('idle'),3000);}
// Native full screen drives the same mode: entering it turns presentation on, leaving turns it off.
function panoramaNative(on){panoNative=!!on;panoramaPresent(!!on);}
function panoramaPresent(on=!panoShow){
 if(on===panoShow)return;panoShow=on;panoAlt=false;
 if(panoOpen)panoramaRender();
 const root=$('#panorama');root?.classList.toggle('show',panoShow);
 if(panoShow)panoWake();else{clearTimeout(panoIdleTimer);root?.classList.remove('idle');}
}
// Keep the overview in step with the board while it is open.
{const boardRender=render;render=function(){boardRender.apply(this,arguments);if(panoOpen)panoramaRender();};}
// Keyboard: P toggles, Esc closes (but lets an open detail or dialog take it first), arrows move between lanes and chips, board letter keys sit still.
function panoNavItems(){return [...document.querySelectorAll('#panorama [data-nav]')].filter(n=>n.getClientRects().length);}
function panoMoveFocus(from,key){
 const items=panoNavItems(),rail=items.filter(n=>n.closest('.pano-rail')),top=items.filter(n=>n.closest('.pf-stage')&&!n.closest('.pf-col')),loose=items.filter(n=>n.closest('.pano-loose'));
 const cols=[...document.querySelectorAll('#panorama .pf-col')].map(c=>items.filter(n=>n.closest('.pf-col')===c)).filter(c=>c.length),col=cols.findIndex(c=>c.includes(from));
 const step=(list,d)=>list[list.indexOf(from)+d],vertical=key==='ArrowDown'||key==='ArrowUp',d=key==='ArrowDown'||key==='ArrowRight'?1:-1;
 if(vertical){
  if(rail.includes(from))step(rail,d)?.focus();
  else if(top.includes(from)){if(d>0&&top.at(-1)===from)(cols[0]?.[0]||loose[0])?.focus();else step(top,d)?.focus();}
  else if(col>=0){const n=step(cols[col],d);if(n)n.focus();else if(d<0)top.at(-1)?.focus();else loose[0]?.focus();}
  else if(loose.includes(from)&&d<0)(cols[0]?.at(-1)||top.at(-1))?.focus();
  return;
 }
 if(rail.includes(from)){if(d>0)top.find(n=>n.dataset.heroHead!==undefined)?.focus();return;}
 if(top.includes(from)){if(d<0)(rail.find(n=>n.classList.contains('on'))||rail[0])?.focus();return;}
 if(col>=0){const row=cols[col].indexOf(from),next=cols[col+d];if(next)next[Math.min(row,next.length-1)].focus();else if(d<0)(rail.find(n=>n.classList.contains('on'))||rail[0])?.focus();return;}
 if(loose.includes(from))step(loose,d)?.focus();
}
function panoMove(from,key){
 if(panoFocus)return panoMoveFocus(from,key);
 const items=panoNavItems(),at=items.indexOf(from);if(at<0)return;
 const laneOf=n=>n.dataset.laneHead||n.dataset.lane||(n.closest('.pano-loose')?'~':''),heads=items.filter(n=>n.dataset.laneHead);
 if(key==='ArrowDown'||key==='ArrowUp'){const next=items[at+(key==='ArrowDown'?1:-1)];if(next&&laneOf(next)===laneOf(from)&&!(from.dataset.laneHead&&key==='ArrowUp'))next.focus();return;}
 if(from.closest('.pano-loose')){const next=items[at+(key==='ArrowRight'?1:-1)];if(next?.closest('.pano-loose'))next.focus();return;}
 const here=heads.findIndex(n=>n.dataset.laneHead===laneOf(from)),target=heads[here+(key==='ArrowRight'?1:-1)];
 if(!target)return;
 // Keep the row: land on the same position inside the neighbouring lane when it has one.
 const own=items.filter(n=>laneOf(n)===laneOf(from)),row=own.indexOf(from),others=items.filter(n=>laneOf(n)===target.dataset.laneHead);
 (others[Math.min(row,others.length-1)]||target).focus();
}
document.addEventListener('keydown',e=>{
 if(panoOpen&&panoShow){panoWake();if(e.key==='Alt'&&!panoAlt){panoAlt=true;panoramaRender();}}
 const key=e.key.length===1?e.key.toLowerCase():e.key,mod=e.metaKey||e.ctrlKey;
 const dialogs=$('#modal').open||!$('#keys-help').hidden;
 if(key==='p'&&!mod&&!e.altKey&&!e.shiftKey&&!dialogs&&!typing(e)&&!e.target.closest?.('#detail')){e.preventDefault();e.stopImmediatePropagation();if(panoOpen){panoramaOpen(false);return;}const card=document.activeElement?.closest?.('#board [data-asset]'),a=card&&state.assets.find(x=>x.id===card.dataset.asset),server=a&&(a.type==='server'?a:serverChain(state.assets,a).servers.find(x=>!x.hiddenAt));panoramaOpen(true,server?.id||null);return;}
 if(!panoOpen)return;
 // The sidebar stays usable beside the panorama: its own keys work there; Esc still closes the panorama.
 if(e.target.closest?.('#sidebar')&&key!=='Escape')return;
 if(panoDrag||panoLink){if(panoKeys(e,key))return;}
 if(mod&&key==='k'){panoramaOpen(false);return;}
 if(key==='Escape'){if(dialogs||!$('#detail').hidden)return;e.preventDefault();e.stopImmediatePropagation();if(panoFocus)panoramaUnfocus();else if(panoShow)panoramaPresent(false);else panoramaOpen(false);return;}
 if(dialogs||typing(e)||e.target.closest?.('#detail'))return;
 if(key==='s'&&!mod&&!e.altKey&&!e.shiftKey){const n=e.target.closest?.('#panorama [data-chip],#panorama [data-lane-head],#panorama [data-hero-head]');e.preventDefault();e.stopImmediatePropagation();const id=n?.dataset.chip||n?.dataset.laneHead||(n&&'heroHead' in n.dataset?panoFocus:'');if(id&&!toggleStopped(id))toast(tr('这类不用标停用'));return;}
 if((e.key==='+'||e.key==='=')&&!mod&&!e.altKey){const n=e.target.closest?.('#panorama .pano-card,#panorama .pano-hero');e.preventDefault();e.stopImmediatePropagation();const id=n?.dataset.lane||n?.dataset.hero;if(id)panoPicker(id);return;}
 if(key==='l'&&!mod&&!e.altKey&&!e.shiftKey){const chip=e.target.closest?.('#panorama .pano-chip[data-chip]');e.preventDefault();e.stopImmediatePropagation();if(chip)panoLinkStart(chip);return;}
 if(!mod&&!e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
  const from=e.target.closest?.('#panorama [data-nav]');e.preventDefault();e.stopImmediatePropagation();
  if(from)panoMove(from,key);else panoNavItems()[0]?.focus();return;
 }
 // The overview is read-only: board shortcuts (E, H, F, X, N, I, O, /) do nothing here. ? and ⌘Z stay.
 if(!mod&&!e.altKey&&e.key!=='?'&&e.key!=='Tab'&&e.key!=='Enter'&&e.key!==' '&&(e.key.length===1))e.preventDefault(),e.stopImmediatePropagation();
},true);
document.addEventListener('click',e=>{
 const open=e.target.closest?.('[data-action="panorama"]');if(open){if(panoOpen)panoramaUnfocus();else panoramaOpen(true);return;}
 if(!panoOpen||!e.target.closest?.('#panorama'))return;
 if(e.target.closest('[data-action="pano-show"]')){panoramaPresent();return;}
 if(e.target.closest('[data-action="pano-back"]')){panoramaUnfocus();return;}
 const close=e.target.closest('[data-action="pano-close"]');if(close){panoramaOpen(false);return;}
 if(e.target.closest('[data-action="pano-add"]')){panoramaOpen(false);assetForm('server');return;}
 const more=e.target.closest('[data-more]');if(more){const k=more.dataset.more;panoExpanded.has(k)?panoExpanded.delete(k):panoExpanded.add(k);panoramaRender();return;}
 const lens=e.target.closest('.pano-lens [data-lens]');if(lens){panoSetLens(lens.dataset.lens);return;}
 const toggle=e.target.closest('[data-toggle]');if(toggle){panoToggle(toggle.dataset.toggle);return;}
 const add=e.target.closest('[data-add]');if(add){panoPicker(add.dataset.add);return;}
 if(e.target.closest('[data-loose-more]')){panoLooseOpen=!panoLooseOpen;panoramaRender();return;}
 const pick=e.target.closest('[data-pick]');if(pick){if(pick.dataset.pick!==panoFocus)panoramaFocus(pick.dataset.pick,pick.getBoundingClientRect(),true);return;}
 const opener=e.target.closest('[data-open]');if(opener){showDetail(opener.dataset.open);return;}
 // A project is not an asset: its hero opens the project's own view on the board.
 if(e.target.closest('[data-hero-head]')){if(String(panoFocus).startsWith('project:')&&panoLens==='project'){const name=panoFocus.slice(8);panoramaOpen(false);setView('project:'+name);}else showDetail(panoFocus);return;}
 const lane=e.target.closest('[data-lane-head]');if(lane){panoramaFocus(lane.dataset.laneHead,lane.getBoundingClientRect());return;}
 const chip=e.target.closest('[data-chip]');if(chip)showDetail(chip.dataset.chip);
});
// Shared things: hovering or focusing one copy rings the others.
function panoRing(id){document.querySelectorAll('#panorama .peer').forEach(n=>n.classList.remove('peer'));if(!id)return;if(panoFocus)for(const other of panoShared?.get(id)||[])if(other!==panoFocus)document.querySelector(`#panorama .pf-srv[data-pick="${CSS.escape(other)}"]`)?.classList.add('peer');document.querySelectorAll(`#panorama .pano-chip[data-chip="${CSS.escape(id)}"][data-shared]`).forEach(n=>n.classList.add('peer'));}
document.addEventListener('pointerover',e=>{if(panoOpen&&e.pointerType==='mouse')panoRing(e.target.closest?.('#panorama .pano-chip[data-shared]')?.dataset.chip);});
document.addEventListener('pointerout',e=>{if(panoOpen&&e.target.closest?.('#panorama .pano-chip'))panoRing(null);});
document.addEventListener('focusin',e=>{if(panoOpen)panoRing(e.target.closest?.('#panorama .pano-chip[data-shared]')?.dataset.chip);});
document.addEventListener('focusout',()=>{if(panoOpen)panoRing(null);});
setIconButton($('#panorama-button'),'treemap',tr('全景（P）'));

// ---- P4: drag a chip onto another server (the one write the panorama allows) -------------------------------------------------------------
// Default drop = move here, ⌥ = also here, onto the unmounted strip = unlink from the server it came out of. Esc or a drop on empty space cancels. One drag = one undo step.
let panoPress=null,panoDrag=null,panoLink=null,panoSuppress=false,panoSuppressTimer=0;
const PANO_SNAP=40,PANO_MOVE_PX=4,PANO_TOUCH_HOLD=400;
const panoSay=text=>{const n=$('#pano-live');if(n)n.textContent=text;};
const panoReduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function panoTargets(id,from){
 const asset=state.assets.find(x=>x.id===id),out=[];if(!asset)return out;
 const add=(el,sid)=>{const hub=panoramaHub(state.assets,sid,panoLens);if(el&&hub&&sid!==from&&canHang(state.assets,id,sid,panoLens))out.push({el,id:sid,name:displayName(hub)});};
 if(panoFocus){document.querySelectorAll('#panorama .pf-srv[data-pick]:not(.on)').forEach(el=>add(el,el.dataset.pick));add($('#panorama .pano-hero'),panoFocus);}
 else document.querySelectorAll('#panorama .pano-lane[data-lane]').forEach(el=>add(el,el.dataset.lane));
 if(from){let loose=$('#panorama .pano-loose');if(!loose){loose=document.createElement('aside');loose.className='pano-loose pano-loose-temp';loose.setAttribute('aria-hidden','true');const name=PANO_LOOSE_LABEL[panoLens]||tr('未挂载');loose.innerHTML=`<div class="pano-loose-head">${icon({pay:'bankcard',login:'google',project:'project'}[panoLens]||'server')}<span>${name}</span></div>`;($('#panorama .pano-grid')||$('#panorama .pano-body'))?.append(loose);}out.push({el:loose,id:null,name:PANO_LOOSE_LABEL[panoLens]||tr('未挂载')});}
 return out;
}
function panoMark(targets,on){for(const t of targets){t.el.classList.toggle('drop-ok',!!on);if(!on)t.el.classList.remove('drop-on');}}
function panoSlot(t,asset){
 document.querySelectorAll('#panorama .pano-slot').forEach(n=>n.remove());
 if(!t||!t.id||!t.el.classList.contains('pano-card'))return;
 const slot=document.createElement('div');slot.className='pano-slot';slot.setAttribute('aria-hidden','true');
 const kids=t.el.querySelector('.pl-kids');if(!kids){t.el.append(slot);return;}
 // The slot appears in the group the thing would join, so the drop shows where it lands.
 const key=panoLensDef().groups.find(g=>g.types.includes(asset.type))?.key||'';
 let group=kids.querySelector(`.pl-grp[data-group="${key}"]`);if(!group){group=document.createElement('div');group.className='pl-grp';group.dataset.group=key;kids.prepend(group);}
 group.append(slot);
}
function panoPick(x,y){
 let best=null,bd=1e9;
 for(const t of panoDrag.targets){const r=t.el.getBoundingClientRect(),d=Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));if(d<=PANO_SNAP&&d<bd){best=t;bd=d;}}
 return best;
}
function panoSetOver(t){
 if(panoDrag.over===t)return;
 panoDrag.over?.el.classList.remove('drop-on');panoDrag.over=t;
 if(t){t.el.classList.add('drop-on');panoSay(t.id?tr('移到 {name}，⌥ 也挂到',{name:t.name}):tr('解除关联'));}
 panoSlot(t,panoDrag.asset);
}
function panoDragStart(press,e){
 const asset=state.assets.find(x=>x.id===press.id);if(!asset)return;
 clearTimeout(press.timer);
 const r=press.el.getBoundingClientRect(),ghost=press.el.cloneNode(true);
 ghost.classList.add('pano-ghost');['data-nav','data-chip','data-lane','data-shared','title','aria-label'].forEach(a=>ghost.removeAttribute(a));ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;
 ghost.style.cssText=`width:${r.width}px;height:${r.height}px`;$('#panorama').append(ghost);
 press.el.classList.add('drag-hole');$('#panorama').classList.add('dragging');
 const targets=panoTargets(press.id,press.from);panoMark(targets,true);
 panoDrag={id:press.id,asset,from:press.from,el:press.el,ghost,off:{x:press.x-r.left,y:press.y-r.top},home:r,targets,over:null};
 panoDragMove(e);panoSay(tr('拖动中，Esc 取消'));
}
function panoDragMove(e){
 const d=panoDrag;d.ghost.style.transform=`translate(${e.clientX-d.off.x}px,${e.clientY-d.off.y}px) scale(1.04)`;
 panoSetOver(panoPick(e.clientX,e.clientY));
}
// Finish a drag. `drop` commits onto the snapped target; otherwise (Esc, empty space, a re-render) the chip glides home.
function panoDragEnd(abort,e){
 const d=panoDrag;if(!d)return;panoDrag=null;
 const target=!abort&&e?d.over:null;
 d.targets.forEach(t=>t.el.classList.remove('drop-ok','drop-on'));document.querySelectorAll('#panorama .pano-slot,#panorama .pano-loose-temp').forEach(n=>n.remove());
 $('#panorama')?.classList.remove('dragging');d.el.classList.remove('drag-hole');
 // The click this release makes is not a click on the chip. It can come late on a busy machine, so it is swallowed whenever it
 // arrives; a new press or key ends the wait (a second is the fallback), so no later click is lost.
 panoSuppress=true;clearTimeout(panoSuppressTimer);panoSuppressTimer=setTimeout(()=>{panoSuppress=false;},1000);
 if(target){d.ghost.remove();panoRelink(d.id,{from:d.from,to:target.id,keep:!!e.altKey});return;}
 const home=d.el.isConnected?d.el.getBoundingClientRect():null;
 if(home&&!abort&&!panoReduced()&&d.ghost.animate){const a=d.ghost.animate([{transform:d.ghost.style.transform},{transform:`translate(${home.left}px,${home.top}px) scale(1)`}],{duration:150,easing:'ease-out'});a.onfinish=a.oncancel=()=>d.ghost.remove();}else d.ghost.remove();
 panoSay(tr('已取消'));
}
function panoRelink(id,{from,to,keep}){
 checkpoint();const r=moveMount(state.assets,id,{from,to,keep,lens:panoLens});
 if(!r.ok){history.pop();panoSay(tr('没有变化'));return r;}
 save();render();
 const w=panoWords(),text=r.kind==='detach'?w.detach:r.kind==='also'?w.also(r.server.name):w.move(r.server.name);
 toast(text,true);panoSay(text);
 const keepFocus=document.querySelector(`#panorama [data-chip="${CSS.escape(id)}"]`)||document.querySelector(`#panorama [data-lane-head="${CSS.escape(to||'')}"],#panorama [data-pick="${CSS.escape(to||'')}"]`)||document.querySelector('#panorama [data-nav]');
 keepFocus?.focus({preventScroll:true});return r;
}
document.addEventListener('pointerdown',e=>{
 if(!panoDrag)panoSuppress=false;
 if(!panoOpen||e.button>0||panoDrag)return;
 const el=e.target.closest?.('#panorama .pano-chip[data-chip]');if(!el)return;
 const press={id:el.dataset.chip,from:el.dataset.lane||'',el,x:e.clientX,y:e.clientY,type:e.pointerType,timer:0};
 if(e.pointerType==='touch')press.timer=setTimeout(()=>{if(panoPress===press)panoDragStart(press,{clientX:press.x,clientY:press.y});},PANO_TOUCH_HOLD);
 panoPress=press;
},true);
document.addEventListener('pointermove',e=>{
 if(panoDrag){e.preventDefault();panoDragMove(e);return;}
 if(!panoPress)return;
 const moved=Math.hypot(e.clientX-panoPress.x,e.clientY-panoPress.y);
 if(panoPress.type==='touch'){if(moved>8){clearTimeout(panoPress.timer);panoPress=null;}return;}
 if(moved>=PANO_MOVE_PX){const press=panoPress;panoPress=null;panoDragStart(press,e);}
},true);
document.addEventListener('pointerup',e=>{clearTimeout(panoPress?.timer);panoPress=null;if(panoDrag)panoDragEnd(false,e);},true);
document.addEventListener('pointercancel',()=>{clearTimeout(panoPress?.timer);panoPress=null;if(panoDrag)panoDragEnd(true);},true);
document.addEventListener('touchmove',e=>{if(panoDrag&&e.cancelable)e.preventDefault();},{passive:false,capture:true});
document.addEventListener('click',e=>{if(!panoSuppress)return;panoSuppress=false;if(e.target.closest?.('#panorama')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('keydown',()=>{panoSuppress=false;},true);
document.addEventListener('dragstart',e=>{if(panoOpen&&e.target.closest?.('#panorama'))e.preventDefault();},true);
// Keyboard twin of the drag: L on a chip outlines the legal servers, ←→ choose, Enter moves here, ⌥Enter also hangs it here, Esc cancels.
function panoLinkStart(chip){
 const id=chip.dataset.chip,from=chip.dataset.lane||'',targets=panoTargets(id,from);
 if(!targets.length){panoSay(tr('没有可挂的服务器'));return;}
 panoLink={id,from,asset:state.assets.find(x=>x.id===id),targets,i:0,chip};panoMark(targets,true);panoLinkShow();
}
function panoLinkShow(){const l=panoLink;l.targets.forEach((t,i)=>t.el.classList.toggle('drop-on',i===l.i));const t=l.targets[l.i];panoSay(t.id?tr('移到 {name}，⌥ 回车为也挂到',{name:t.name}):tr('解除关联'));t.el.scrollIntoView?.({block:'nearest',inline:'nearest'});panoSlot(t,l.asset);}
function panoLinkEnd(){const l=panoLink;if(!l)return;panoLink=null;l.targets.forEach(t=>t.el.classList.remove('drop-ok','drop-on'));document.querySelectorAll('#panorama .pano-slot,#panorama .pano-loose-temp').forEach(n=>n.remove());}
// Returns true when the key was consumed by an active drag or link mode.
function panoKeys(e,key){
 if(panoDrag){if(key==='Escape'){e.preventDefault();e.stopImmediatePropagation();panoDragEnd(true);return true;}return false;}
 const l=panoLink;e.preventDefault();e.stopImmediatePropagation();
 if(key==='Escape'){panoLinkEnd();panoSay(tr('已取消'));l.chip.isConnected&&l.chip.focus();return true;}
 if(key==='ArrowRight'||key==='ArrowDown'){l.i=(l.i+1)%l.targets.length;panoLinkShow();return true;}
 if(key==='ArrowLeft'||key==='ArrowUp'){l.i=(l.i-1+l.targets.length)%l.targets.length;panoLinkShow();return true;}
 if(key==='Enter'){const t=l.targets[l.i];panoLinkEnd();panoRelink(l.id,{from:l.from,to:t.id,keep:e.altKey});return true;}
 return true;
}

// Presentation listeners: pointer wakes the bar, ⌥ release re-masks, hovering an address shows it.
document.addEventListener('keyup',e=>{if(panoOpen&&panoShow&&e.key==='Alt'&&panoAlt){panoAlt=false;panoramaRender();}},true);
document.addEventListener('pointermove',()=>{if(panoOpen&&panoShow)panoWake();},true);
let panoRevealed=null;
const panoCover=()=>{if(panoRevealed?.isConnected&&!panoAlt)panoRevealed.textContent=maskIp(panoRevealed.dataset.full);panoRevealed=null;};
document.addEventListener('pointerover',e=>{if(!panoOpen||!panoShow||e.pointerType!=='mouse')return;const n=e.target.closest?.('#panorama .ip-text[data-full]');if(n===panoRevealed)return;panoCover();if(n){n.textContent=n.dataset.full;panoRevealed=n;}},true);
document.addEventListener('pointerleave',()=>panoCover(),true);

// Picking a view in the sidebar leaves the panorama for that view (capture: the board re-renders the sidebar on the same click).
document.addEventListener('click',e=>{if(panoOpen&&e.target.closest?.('#sidebar [data-action="view"]'))panoramaOpen(false);},true);

// ---- The "+" picker: tick what hangs on (or is paid by) this hub ---------------------------------------------------------------------------
// Ticked = on this hub now. Ticking adds a link and keeps the thing's other hubs; unticking takes it off this hub only. Done = one undo step.
// By project, ticking something from another project moves it here (a thing has one project).
function panoPicker(hubId){
 const hub=panoramaHub(state.assets,hubId,panoLens);if(!hub)return;
 const groups=hubCandidates(state.assets,hubId,panoLens),w=panoWords();
 const where=x=>x.elsewhere.length?w.where(x.elsewhere.map(h=>displayName(h)).join(tr('、'))):x.on?'':w.loose;
 const row=x=>`<label class="pano-pick-row" data-search="${esc(searchText(x.asset))}"><input type="checkbox" name="kid" value="${esc(x.asset.id)}"${x.on?' checked':''}>${assetMark(x.asset)}<span>${esc(displayName(x.asset))}<small>${esc([panoKindName(x.asset),where(x)].filter(Boolean).join(' · '))}</small></span></label>`;
 const list=groups.map(g=>`<div class="link-option-group" role="group" aria-label="${esc(PANO_TYPE_LABEL[g.key]||'')}"><span class="link-group-title">${esc(PANO_TYPE_LABEL[g.key]||'')}</span>${g.items.map(row).join('')}</div>`).join('');
 modal(w.title(hub.name),`<form id="pano-pick" class="form" data-hub="${esc(hubId)}">${list?`<input id="pano-pick-search" class="link-search" placeholder="${tr('搜索名称')}" aria-label="${tr('搜索')}"><div class="link-options">${list}</div><div class="confirm-actions"><span class="pano-pick-sum form-note" aria-live="polite"></span><button class="button primary" type="submit">${tr('完成')}</button></div>`:`<p class="form-note">${tr('还没有可以{action}的资产。',{action:w.none})}</p>`}</form>`);
 const form=$('#pano-pick'),start=new Set(groups.flatMap(g=>g.items.filter(x=>x.on).map(x=>x.asset.id)));
 const sum=()=>{const now=[...form.querySelectorAll('[name="kid"]:checked')].map(n=>n.value),add=now.filter(id=>!start.has(id)).length,off=[...start].filter(id=>!now.includes(id)).length;const n=form.querySelector('.pano-pick-sum');if(n)n.textContent=[add?`+${add}`:'',off?`−${off}`:''].filter(Boolean).join('  ');};
 form.addEventListener('change',sum);
 const search=$('#pano-pick-search');if(search){search.oninput=e=>{const q=e.target.value.trim().toLowerCase();form.querySelectorAll('.pano-pick-row').forEach(r=>r.hidden=!!q&&!r.dataset.search.includes(q));form.querySelectorAll('.link-option-group').forEach(g=>g.hidden=!g.querySelector('.pano-pick-row:not([hidden])'));};search.focus();}
 form.addEventListener('submit',e=>{
  e.preventDefault();const ids=[...form.querySelectorAll('[name="kid"]:checked')].map(n=>n.value);$('#modal').close();
  checkpoint();const r=setHubKids(state.assets,hubId,ids,panoLens);
  if(!r.added.length&&!r.removed.length){history.pop();return;}
  save();render();
  const text=[r.added.length?tr('{verb} {n} 项',{verb:w.added,n:r.added.length}):'',r.removed.length?tr('{verb} {n} 项',{verb:w.removed,n:r.removed.length}):''].filter(Boolean).join(tr('，'));
  toast(tr('{name}：{text}',{name:displayName(hub),text}),true);panoSay(text);
  document.querySelector(`#panorama [data-add="${CSS.escape(hubId)}"]`)?.focus({preventScroll:true});
 });
}
