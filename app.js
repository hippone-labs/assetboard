const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 domain:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5Z"/>',
 server:'<rect x="4" y="4" width="16" height="6.5" rx="2"/><rect x="4" y="13.5" width="16" height="6.5" rx="2"/><path d="M7.5 7.25h.01M7.5 16.75h.01M11 7.25h5.5M11 16.75h5.5"/>',
 subscription:'<path d="M19.5 9.5A8 8 0 0 0 5.2 7.8M4.5 14.5a8 8 0 0 0 14.3 1.7"/><path d="M5 4v4h4M19 20v-4h-4"/>',
 database:'<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
 license:'<circle cx="8.5" cy="12" r="4"/><path d="M12.5 12H20v3M16.5 12v2.5"/>',
 repository:'<path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v12.5H7a2.5 2.5 0 0 0 0 5h12v-5"/><path d="M4.5 20V6a2.5 2.5 0 0 1 2-2.45M9 8h6"/>',
 deployment:'<path d="M7.5 18.5h-.5a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9h-1"/><path d="M12 20.5V12.5M9 15.5l3-3 3 3"/>',
 storage:'<rect x="3.5" y="4.5" width="17" height="5" rx="1.5"/><path d="M5 9.5v8.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9.5M10 13h4"/>',
 bankcard:'<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M6.5 14.5h4"/>',
 phone:'<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M10.5 17.5h3"/>',
 appleid:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="10" r="2.8"/><path d="M6.6 18.4c1.2-1.9 3.1-2.9 5.4-2.9s4.2 1 5.4 2.9"/>',
 google:'<path d="M19.5 12.2c0-.6-.05-1.2-.15-1.7H12v3.3h4.2a3.7 3.7 0 0 1-1.6 2.4"/><path d="M19.2 9A8 8 0 1 0 17.6 17.7"/>',
 ai:'<path d="M11 4c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5C8.4 9.9 10.4 7.9 11 4Z"/><path d="M18 15.5v4M16 17.5h4"/>'
};
const cats = {bankcard:{name:tr('银行卡'),one:tr('银行卡',null,'one'),hint:tr('用来付订阅的卡，实体卡、虚拟卡都算；只记尾号、卡组织与有效期')},phone:{name:tr('手机号'),one:tr('手机号',null,'one'),hint:tr('各国号码、运营商与保号日期')},server:{name:tr('服务器'),one:tr('服务器',null,'one')},appleid:{name:'Apple ID',one:'Apple ID',hint:tr('各区 Apple ID 与付款卡、验证号码')},google:{name:tr('Google 账号'),one:tr('Google 账号',null,'one'),hint:tr('各区 Google 账号与验证号码')},ai:{name:tr('AI 订阅'),one:tr('AI 订阅',null,'one')},domain:{name:tr('域名'),one:tr('域名',null,'one')},subscription:{name:tr('订阅与工具'),one:tr('订阅与工具',null,'one')},database:{name:tr('数据库'),one:tr('数据库',null,'one')},license:{name:tr('软件授权'),one:tr('软件授权',null,'one')},repository:{name:tr('代码仓库'),one:tr('代码仓库',null,'one')},deployment:{name:tr('部署服务'),one:tr('部署服务',null,'one')},storage:{name:tr('对象存储'),one:tr('对象存储',null,'one')}};
// Priority asset types: form labels, extra fields and date defaults. Other categories use the generic form.
const assetProfiles={
 bankcard:{name:tr('例如 汇丰 One 借记卡、Wise 虚拟卡'),provider:[tr('发卡行'),tr('例如 汇丰香港、Wise')],account:[tr('账户备注'),tr('用于区分同一银行的多张卡')],extra:['region','last4','network','cardStatus'],note:tr('只记录后 4 位。不要填写完整卡号、CVV、密码或验证码。'),links:tr('关联用这张卡付款的 Apple ID、Google 账号或 AI 订阅。')},
 phone:{name:tr('例如 英国 giffgaff'),provider:[tr('运营商'),tr('例如 giffgaff、CMLink')],account:[tr('实名或用途'),tr('例如 接收 Apple ID 验证码')],extra:['region','phone','phoneStatus'],date:tr('下次保号日期'),dateKind:'keep',cycle:'halfyearly',links:tr('关联用这个号码接收验证码的账号。')},
 appleid:{name:tr('例如 美区主号'),fixedProvider:'Apple',account:[tr('登录邮箱'),tr('Apple ID 邮箱')],extra:['region'],note:tr('不要在这里保存密码或验证码。'),links:tr('关联付款的银行卡和接收验证码的手机号。')},
 google:{name:tr('例如 美区 Google 账号'),fixedProvider:'Google',account:[tr('登录邮箱'),tr('Gmail 地址')],extra:['region'],note:tr('不要在这里保存密码或验证码。'),links:tr('关联接收验证码的手机号和付款的银行卡。')},
 ai:{name:tr('例如 ChatGPT Plus'),provider:[tr('服务'),tr('例如 ChatGPT、Claude、Midjourney')],account:[tr('登录账号'),tr('用哪个账号订阅')],date:tr('下次扣款日期'),dateKind:'renew',cycle:'monthly',links:tr('关联订阅用的账号和付款的银行卡。')}
};
const cardNetworks=['Visa','Mastercard','银联','American Express','JCB','Discover','其他'];
const linkOrder={bankcard:['appleid','google','ai','subscription'],phone:['appleid','google','bankcard'],appleid:['bankcard','phone','google','ai'],google:['phone','bankcard','appleid','ai'],ai:['appleid','google','bankcard']};
const seed={blocks:[],assets:[]};
const key='assetboard-prototype-v1';
const nativeStore=window.__ASSETBOARD_NATIVE__;
// Movement and size animations stay at or under 0.2s (DESIGN-PRINCIPLES.md); CSS transitions use the same value.
const MOTION_MS=200;
// Demo mode (`--demo` in the Mac app, `?demo` in the browser) shows the fictional board from demo-data.js and never saves.
const demoMode=!!(nativeStore?.demo||(!nativeStore&&new URLSearchParams(location.search).has('demo')))&&typeof window.assetboardDemoBoard==='function';
window.assetboardDemoBlocked=()=>{if($('#modal')?.open)$('#modal').close();toast(tr('演示模式下不可用'));};
window.assetboardConnectionState=connections=>{
 if(!nativeStore)return;
 Object.assign(nativeStore,connections);
 const cloudflareStatus=$('#cloudflare-status');
 if(cloudflareStatus)cloudflareStatus.textContent=nativeStore.cloudflareConnected?tr('已连接'):nativeStore.keychainUnavailable?tr('钥匙串没有响应，可重新输入令牌'):tr('未连接');
 const githubStatus=$('#github-status');
 if(githubStatus)githubStatus.textContent=nativeStore.githubConnected?tr('已连接'):nativeStore.keychainUnavailable?tr('钥匙串没有响应，可用 gh 同步'):tr('未连接');
 // notifications: 'allowed' | 'denied' | 'unknown', reported when the system answers and whenever the app becomes active.
 if('notifications' in connections&&currentView()==='upcoming'&&!query)render();
 autoSyncCloudflare();
};
let state=structuredClone(seed),query='',view='all',layoutMode='list',history=[],future=[],activeAsset=null,lastFocus=null,toastTimer,assetFormSnapshot=null;
let migratedLegacyData=false;
try{const saved=demoMode?window.assetboardDemoBoard():nativeStore?nativeStore.data:JSON.parse(localStorage.getItem(key));if(saved&&Array.isArray(saved.blocks)&&Array.isArray(saved.assets)&&saved.blocks.every(b=>cats[b.id])){const migration=removeUntouchedDemo(saved);state=migration.board;migratedLegacyData=!!(migration.removed||migration.removedBlocks);}}catch{} if(!Array.isArray(state.deletedExternalIds))state.deletedExternalIds=[];
// A block is its category id and whether its group is folded; nothing else is kept.
state.blocks=state.blocks.map(b=>({id:b.id,folded:!!b.folded}));delete state.featuredRepositoryIds;
// Payments start counting the day this version first opens the board, so older charges are not asked about.
if(!demoMode&&!state.paymentsSince)state.paymentsSince=isoDay(localDay());
let saveSequence=0;
window.assetboardSaved=(sequence,success)=>{if(sequence!==saveSequence)return;if(!success)toast(tr('保存失败，请保留此窗口'));};
// Price history watches every save: a cost that differs from the last saved one is written down with where the change came from.
let savedCosts=new Map(),costSource='';
function rememberCosts(){savedCosts=new Map(state.assets.map(a=>[a.id,a.cost]));}
function noteCostChanges(){const now=new Date();for(const a of state.assets){const before=savedCosts.get(a.id);if(before!==undefined&&before!==a.cost)noteCostChange(a,before,costSource||'edit',now);}costSource='';rememberCosts();}
function save(){if(demoMode)return;noteCostChanges();for(const a of state.assets)syncMoney(a);try{if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'save',sequence:++saveSequence,data:state});else localStorage.setItem(key,JSON.stringify(state));}catch{toast(tr('保存失败，请保留此窗口'));}syncReminders();syncStatusItem();scheduleAutoIcons();}
// Mac app notifications: the plan from reminderPlan goes to Swift after a save, at launch and hourly, and only when it changed.
let remindersSent='';
function syncReminders(){if(!nativeStore||demoMode)return;try{const items=reminderPlan(state.assets),json=JSON.stringify(items);if(json===remindersSent)return;window.webkit.messageHandlers.assetboard.postMessage({action:'reminders',items});remindersSent=json;}catch{}}
// A click on a notification: one record opens in 即将到来 with the inspector; a merged day opens 即将到来.
window.assetboardReminderOpen=id=>{if($('#modal')?.open)$('#modal').close();if(typeof panoOpen!=='undefined'&&panoOpen)togglePanorama(false);setView('upcoming');if(id&&state.assets.some(a=>a.id===id))showDetail(id,{focus:true});};
function checkpoint(){history.push(JSON.stringify(state));if(history.length>25)history.shift();future=[];}
function toast(message,undoable=false,redoable=false){clearTimeout(toastTimer);$('#toast').classList.remove('notice');$('#toast').setAttribute('role','status');const offer=(undoable&&history.length)||(redoable&&future.length);$('#toast').innerHTML=`<span>${esc(message)}</span>${undoable&&history.length?'<button class="toast-undo" data-action="undo">'+tr('撤销')+'</button>':redoable&&future.length?'<button class="toast-undo" data-action="redo">'+tr('重做')+'</button>':''}`;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),offer?6000:3000);}
// A notice is a toast that matters: something the person tried did not happen. It is louder, stays longer, waits while hovered
// or focused, and has its own close button.
const NOTICE_MS=10000;
function hideToast(){clearTimeout(toastTimer);$('#toast').classList.remove('show');}
function notice(message,act=null){clearTimeout(toastTimer);const t=$('#toast');t.classList.add('notice','show');t.setAttribute('role','alert');t.innerHTML=`${ui('warn')}<span>${esc(message)}</span>${act?`<button class="toast-undo" data-action="${esc(act.action)}"${act.id?` data-id="${esc(act.id)}"`:''}>${esc(act.label)}</button>`:''}<button class="toast-close" data-action="toast-close" aria-label="${tr('关闭提示')}" title="${tr('关闭')}">×</button>`;toastTimer=setTimeout(hideToast,NOTICE_MS);}
for(const [type,ms] of [['mouseenter',0],['focusin',0],['mouseleave',4000],['focusout',4000]])$('#toast').addEventListener(type,()=>{const t=$('#toast');if(!t.classList.contains('notice')||!t.classList.contains('show'))return;clearTimeout(toastTimer);if(ms&&!t.matches(':hover,:focus-within'))toastTimer=setTimeout(hideToast,ms);});
function restoreSnapshot(json){const actions=state.agentActions;state=JSON.parse(json);if(actions)state.agentActions=actions;rememberCosts();save();if(activeAsset&&!state.assets.some(a=>a.id===activeAsset))closeDetail();else if(activeAsset&&!$('#detail').hidden)showDetail(activeAsset,{focus:false});render();}
function undo(){if(!history.length){toast(tr('没有可撤销的'));return;}future.push(JSON.stringify(state));if(future.length>25)future.shift();restoreSnapshot(history.pop());toast(tr('已撤销'),false,true);}
function redo(){if(!future.length){toast(tr('没有可重做的'));return;}history.push(JSON.stringify(state));if(history.length>25)history.shift();restoreSnapshot(future.pop());toast(tr('已重做'),true);}
// A close event from the dialog this one replaced arrives after it opens; only a close that leaves the dialog shut cancels.
function confirmDialog(title,message,confirmLabel,danger=false){return new Promise(resolve=>{modal(title,`<p class="form-note confirm-message">${esc(message).replaceAll('\n','<br>')}</p><div class="confirm-actions"><button class="button ${danger?'danger':'primary'}" id="confirm-yes">${esc(confirmLabel)}</button><button class="button" id="confirm-no">${tr('取消')}</button></div>`,'confirm');const dialog=$('#modal');let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('close',cancel);resolve(value);},cancel=()=>{if(!dialog.open)finish(false);};dialog.addEventListener('close',cancel);$('#confirm-yes').onclick=()=>{finish(true);dialog.close();};$('#confirm-no').onclick=()=>dialog.close();$('#confirm-no').focus();});}

function isHidden(a){return !!(a&&a.hiddenAt);}
function rememberDeleted(a){const key=assetSyncKey(a);if(!key)return;if(!Array.isArray(state.deletedExternalIds))state.deletedExternalIds=[];if(!state.deletedExternalIds.includes(key))state.deletedExternalIds.push(key);if(a.id&&!state.deletedExternalIds.includes(a.id))state.deletedExternalIds.push(a.id);}
function icon(type){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[type]||icons.storage}</svg>`;}
// Small UI glyphs for buttons and chips; every icon-only button must carry title and aria-label.
const uiGlyphs={pulse:'<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',file:'<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/>',plus:'<path d="M12 5v14M5 12h14"/>',mail:'<path d="M4 6h16v12H4zM4 6l8 7 8-7"/>',image:'<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17"/>',terminal:'<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m7.5 10 3 2.5-3 2.5M13 15h3.5"/>',refresh:'<path d="M19.5 9.5A8 8 0 0 0 5.2 7.8M4.5 14.5a8 8 0 0 0 14.3 1.7"/><path d="M5 4v4h4M19 20v-4h-4"/>',cloud:'<path d="M3.5 15.5h12a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.8A3.5 3.5 0 0 0 3.5 15.5Z"/>',github:'<path d="M9 19c-4 1.5-4-2-7-2m14 5v-3.9a3.4 3.4 0 0 0-1-2.6c3.2-.3 6.5-1.5 6.5-7A5.2 5.2 0 0 0 19 4.6 4.8 4.8 0 0 0 18.9 1S17.7.7 15 2.5a10.4 10.4 0 0 0-6 0C6.3.7 5.1 1 5.1 1A4.8 4.8 0 0 0 5 4.6 5.2 5.2 0 0 0 3.5 8.5c0 5.4 3.3 6.7 6.5 7a3.4 3.4 0 0 0-1 2.6V22"/>',back:'<path d="M10 6 4 12l6 6M4 12h16"/>',info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',warn:'<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17h.01"/>',check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',tray:'<path d="M4 13.5 6.5 5.5h11L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z"/><path d="M4 13.5h4.5a1 1 0 0 1 1 1 2.5 2.5 0 0 0 5 0 1 1 0 0 1 1-1H20"/>',palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.7 0-.9.7-1.6 1.7-1.6h2.2a3.3 3.3 0 0 0 3.3-3.3C20 6.9 16.5 3.5 12 3.5Z"/><circle cx="7.8" cy="11" r=".7"/><circle cx="10.5" cy="7.5" r=".7"/><circle cx="15" cy="8" r=".7"/>',clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',sidebar:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M9.5 5v14"/>',eye:'<path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.5"/>',eyeoff:'<path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="M4.5 4.5l15 15"/>',spark:'<path d="M11 4c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5C8.4 9.9 10.4 7.9 11 4Z"/>'};
uiGlyphs.grid='<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>';
// v15 shell glyphs: view switch, sidebar views, disclosure, more, external link.
Object.assign(uiGlyphs,{list:'<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',tiles:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',stack:'<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>',chevron:'<path d="m9.5 6 6 6-6 6"/>',more:'<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.6"/>',external:'<path d="M13.5 4.5h6v6M19.5 4.5 11 13M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5"/>'});
function ui(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiGlyphs[name]||''}</svg>`;}
// One rounded tile per asset (DESIGN-PRINCIPLES §9): a real icon (custom iconData, then a fetched siteIcon) wins; the category line icon only fills in when there is none.
function customIconSrc(a){return typeof a?.iconData==='string'&&a.iconData.length<400000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.iconData)?a.iconData:'';}
function hasRealIcon(a){return !!(customIconSrc(a)||siteIconSrc(a));}
// The panorama draws a tile only for a real platform icon; its blocks already say the category.
function cardTile(a,size=''){return hasRealIcon(a)?tile(a,size):'';}
function tile(a,size=''){const custom=customIconSrc(a),src=custom||siteIconSrc(a),tone=src?markTone(src):'';return `<span class="tile${size?' '+size:''} ${custom?'custom-art':src?'custom-art site-art':'type-art'}${tone?' '+tone:''}" aria-hidden="true">${src?`<img src="${src}" alt="" draggable="false">`:icon(a.type)}</span>`;}
function searchText(a){return [a.name,a.provider,a.purpose,a.reason,a.account,cats[a.type]?.name,regionName(a.region),a.region,a.network,a.last4,a.phone,String(a.phone||'').replace(/\D/g,''),...assetIps(a).map(x=>x.ip)].filter(Boolean).join(' ').toLowerCase();}
function siteIconSrc(a){return typeof a?.siteIcon==='string'&&a.siteIcon.length<400000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.siteIcon)?a.siteIcon:'';}
function assetMark(a){const src=customIconSrc(a)||siteIconSrc(a),tone=src?markTone(src):'';return src?`<img class="site-mark${tone?' '+tone:''}" src="${src}" alt="" draggable="false">`:icon(a.type);}
function matches(a){return !query||searchText(a).includes(query.toLowerCase());}
function safeManagementUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function displayName(a){return veil(a.source==='github'&&a.name.includes('/')?a.name.slice(a.name.indexOf('/')+1):a.name);}
// Repositories: public is the default and says nothing, private is a lock beside the name; without a date the foot shows how recently it changed. Undated, unknown rows stay blank.
function isPrivateRepo(a){return a.type==='repository'&&(a.event==='私有仓库'||a.syncStatus==='私有仓库');}
function ageText(iso){const t=Date.parse(iso);if(!t)return '';const days=Math.floor((Date.now()-t)/86400000);return days<=0?tr('今天'):days<31?tr('{n} 天前',{n:days}):days<365?tr('{n} 个月前',{n:Math.floor(days/30)}):tr('{n} 年前',{n:Math.floor(days/365)});}
// The last push says how alive a repository is (research R1); GitHub's updated_at also moves on stars and settings, and a hand-made
// record's updatedAt is only its last edit, so that one says nothing until a sync brings pushed_at.
function quietEvent(a){const e=a.event||'';if(a.type==='repository'&&(e==='公开仓库'||e==='私有仓库'||!e))return a.pushedAt?tr('推送于 {when}',{when:ageText(a.pushedAt)}):a.source==='github'?ageText(a.updatedAt):'';return e==='日期待补充'?'':tr(e);}
function eventInfo(a){if(a.syncMissing)return {text:tr('本次未返回'),cls:'warn'};if(a.stopped&&a.type==='phone'&&linkImpact(state.assets,a).length)return {text:tr('已停用，仍有账号靠它验证'),cls:'warn overdue'};if(a.stopped){const s=assetDateStatus(a);return {text:s.level==='none'?'':s.label,cls:''};}const trouble=cardTrouble(a)||phoneTrouble(a);if(trouble)return {text:trouble.label,cls:'warn overdue'};const renewal=pendingRenewals([a],{since:state.paymentsSince})[0];if(renewal)return {text:tr('{ask}？{date} {due}',{ask:confirmWords[renewal.kind].ask,date:renewal.due,due:confirmWords[renewal.kind].due}),cls:'warn'};const life=lifecycleOf(a);if(life)return {text:life.label,cls:'warn overdue'};const phase=registryPhaseOf(a);if(phase)return {text:tr('注册局：{phase}',{phase:rdapPhaseLabels[phase]}),cls:'warn overdue'};const status=assetDateStatus(a);if(status.level==='none')return {text:assetProfiles[a.type]?'':quietEvent(a),cls:''};if(a.type==='bankcard'&&status.level==='upcoming')return {text:tr('有效期 {date}',{date:expiryText(a.date)}),cls:''};return {text:a.creditExpiry?tr('额度{status}',{status:status.label}):status.label,cls:status.level==='overdue'?'warn overdue':status.level==='soon'?'warn':''};}
function lockMark(a){return isPrivateRepo(a)?`<span class="lock-mark" role="img" aria-label="${tr('私有仓库')}" title="${tr('私有仓库')}">${ui('lock')}</span>`:'';}
// The board itself lives on this Mac only (research Q6): 文件 › 导出资产备份 is the way to keep a copy elsewhere. The Mac app reports
// each export (assetboardExported, a per-viewer note in localStorage, never in state), and 即将到来 says so once the last copy is a
// month old, or when there never was one and the oldest record is a month old.
const EXPORT_KEY='assetboard-exported-at',EXPORT_DAYS=30;
function exportedAt(){try{return Date.parse(localStorage.getItem(EXPORT_KEY)||'')||0;}catch{return 0;}}
window.assetboardExported=()=>{try{localStorage.setItem(EXPORT_KEY,new Date().toISOString());}catch{}if(currentView()==='upcoming')render();};
// The handover page (导出 › 交接清单) is a snapshot: a year after the last one, 即将到来 says it may be out of date (research Q12).
const HANDOVER_KEY='assetboard-handover-at';
function handoverNoteHtml(now=Date.now()){
 if(demoMode)return '';let at=0;try{at=Date.parse(localStorage.getItem(HANDOVER_KEY)||'')||0;}catch{}
 const days=at?Math.floor((now-at)/86400000):0;
 return days>=365?`<p class="notify-off export-note" role="note">${ui('file')}<span>${tr('交接清单是 {n} 天前生成的，资产变过的话重新生成一份',{n:days})}</span><button class="button" data-action="export">${tr('导出…')}</button></p>`:'';
}
function exportNoteHtml(now=Date.now()){
 if(!nativeStore||demoMode||state.assets.length<5)return '';
 const at=exportedAt(),since=at||Math.min(...state.assets.map(a=>Date.parse(a.createdAt||'')||now)),days=Math.floor((now-since)/86400000);
 if(days<EXPORT_DAYS)return '';
 return `<p class="notify-off export-note" role="note">${ui('download')}<span>${at?tr('上次导出备份是 {n} 天前',{n:days}):tr('资产清单只存在这台 Mac 上，还没导出过备份')}</span><button class="button" data-action="export-board">${tr('导出备份…')}</button></p>`;
}
// Manual "stopped" (v13b P5): a registered fact, never a probe. Default is in use; only the stopped ones carry a mark (hollow ring), the name goes muted.
// Subscriptions, AI plans, deployments and storage stop when cancelled; a number stops when given up or cut off by the carrier, and while
// accounts still take codes on it that stays red (`sourceTrouble`).
// Giving up a filed domain or the server it is filed through (research D12): the filing stays in the person's name until it is
// cancelled, and a domain someone else registers later can be used against it; a server's filed domains need a new host first.
function icpNote(a){
 if(a.type==='domain'&&a.icp)return tr('。它有备案，记得到接入商那里注销');
 // A stopped server or database is usually released next; a snapshot goes with it (research Z6).
 if(['server','database'].includes(a.type)&&a.backup!=='elsewhere'){const filed=a.type==='server'?serverChain(state.assets,a).mounts.filter(x=>x.type==='domain'&&x.icp&&!x.hiddenAt):[];return tr('。释放前先导出一份数据，快照会跟着实例一起删')+(filed.length?tr('；上面有 {n} 个已备案域名，取消接入前先在新服务商接入',{n:formatCount(filed.length)}):'');}
 const filed=a.type==='server'?serverChain(state.assets,a).mounts.filter(x=>x.type==='domain'&&x.icp&&!x.hiddenAt):[];
 return filed.length?tr('。上面有 {n} 个已备案域名，取消接入前先在新服务商接入',{n:formatCount(filed.length)}):'';
}
const STOPPABLE=['server','domain','repository','database','license','subscription','ai','deployment','storage','phone'];
const stopRing=a=>a.stopped?`<i class="stop-ring" role="img" aria-label="${tr('已停用')}" title="${tr('已停用')}"></i>`:'';
function toggleStopped(id){
 const a=state.assets.find(x=>x.id===id);if(!a||!STOPPABLE.includes(a.type))return false;
 checkpoint();if(a.stopped)delete a.stopped;else a.stopped=true;save();render();if(activeAsset===id&&!$('#detail').hidden)showDetail(id);
 toast(a.stopped?tr('已标为停用')+icpNote(a):tr('已恢复启用'),true);return true;
}
// Category quick actions (DESIGN-PRINCIPLES §5): at most QUICK_LIMIT icon buttons on a row, the full list in the inspector.
const quickIcons={open:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9M9.5 2.5h4v4M13.5 2.5 7.5 8.5"/></svg>',copy:'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>',local:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>','copy-ssh':'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3"/></svg>'};
function assetQuick(a){const link=safeManagementUrl(a?.url);return quickActions(a,{link:link&&new URL(link).hostname!=='example.com'?link:'',native:!!nativeStore});}
function quickButtons(a){return assetQuick(a).slice(0,QUICK_LIMIT).map(q=>`<button class="quick-action" data-action="quick" data-id="${esc(a.id)}" data-quick="${q.id}" aria-label="${esc(q.label)} · ${esc(veil(a.name))}" title="${esc(q.label)}">${quickIcons[q.id]||quickIcons[q.kind]}</button>`).join('');}
function quickRow(a){const list=assetQuick(a).filter(q=>q.kind!=='open');return list.length?`<div class="detail-actions quick-row">${list.map(q=>`<button class="button" data-action="quick" data-id="${esc(a.id)}" data-quick="${q.id}">${quickIcons[q.id]||quickIcons[q.kind]}${esc(q.label)}</button>`).join('')}</div>`:'';}
function copyText(text,done){
 if(nativeStore){window.webkit.messageHandlers.assetboard.postMessage({action:'copyText',text});toast(done);return;}
 const fallback=()=>{const back=document.activeElement,t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch{}t.remove();back?.focus?.();toast(ok?done:tr('无法访问剪贴板，请在详情里手动复制'));};
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast(done),fallback);else fallback();
}
// kind picks the first action of that kind when no id is given (O opens, ⌘C copies); returns false when the asset has none.
function runQuick(id,quickId,kind){
 const a=state.assets.find(x=>x.id===id);if(!a)return false;
 const list=assetQuick(a),q=quickId?list.find(x=>x.id===quickId):list.find(x=>x.kind===kind)||(kind==='open'?list.find(x=>x.kind==='local'):null);
 if(!q)return false;
 if(q.kind==='open'){if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url:q.value});else window.open(q.value,'_blank','noopener,noreferrer');}
 else if(q.kind==='copy')copyText(q.value,q.id==='copy-name'?tr('已复制域名'):tr('已复制{what}',{what:q.done}));
 else if(q.kind==='local'&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openLocalDirectory',path:q.value});
 return true;
}
window.assetboardLocalResult=ok=>toast(ok?tr('已打开'):tr('找不到这个目录，请检查路径'));
// While searching, a match that only lives in the purpose says so, otherwise the row would look unrelated to the query.
function searchHit(a){if(!query||!a.purpose)return '';const q=query.toLowerCase(),seen=[a.name,a.provider,a.account].filter(Boolean).join(' ').toLowerCase();return a.purpose.toLowerCase().includes(q)&&!seen.includes(q)?`<span class="card-hit">${tr('用途：{text}',{text:esc(a.purpose)})}</span>`:'';}
// Server relations never print names on a row (v13): a mounted record gets a small server icon, a server its mount count, an account its server count.
// The dot is the colour of the servers' expiry (never reorders anything); the names live in title and aria-label.
function relMark(a){
 if(a.hiddenAt||!['server','subscription',...MOUNT_TYPES].includes(a.type))return '';
 const chain=serverChain(state.assets,a),seen=list=>list.filter(x=>!isHidden(x));
 let n=0,label='',tone='',withIcon=true,withCount=false;
 if(a.type==='server'){n=seen(chain.mounts).length;label=tr('挂载 {n} 项',{n});withIcon=false;withCount=true;const level=a.stopped?'none':assetDateStatus(a).level;tone=level==='overdue'?'red':level==='soon'?'amber':'';}
 else if(a.type==='subscription'){n=seen(chain.owned).length;label=tr('名下 {n} 台服务器',{n});withCount=true;}
 else{const servers=seen(chain.servers);n=servers.length;label=tr('部署在 {names}',{names:servers.map(x=>x.name+(linkMetaOf(a,x.id).standby?tr('（备用）'):'')).join(tr('、'))});withCount=n>1;tone=serverTone(state.assets,a);}
 if(!n)return '';
 return `<span class="rel-mark${tone?' '+tone:''}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${tone?'<i class="rel-dot" aria-hidden="true"></i>':''}${withIcon?icon('server'):''}${withCount?`<b>${n>99?'99+':n}</b>`:''}</span>`;
}
function identityText(a){return {bankcard:[a.network&&tr(a.network),a.last4&&`•••• ${a.last4}`],phone:[maskPhone(a.phone)],appleid:[maskEmail(a.account)],google:[maskEmail(a.account)],ai:[a.provider]}[a.type]?.filter(Boolean).join(' ')||a.provider||'';}
// v15 shell (2026-10-15, user-confirmed): a sidebar of views, every asset grouped by category as a list or a grid, a docked inspector.
// The overview never truncates; groups fold instead. View and layout are per-viewer conveniences kept in localStorage, not in the board.
const VIEW_KEY='assetboard-view-v1';
function readViewPrefs(){try{return JSON.parse(localStorage.getItem(VIEW_KEY)||'{}')||{};}catch{return {};}}
function writeViewPrefs(){try{localStorage.setItem(VIEW_KEY,JSON.stringify({view,layout:layoutMode,...(displayCurrency?{currency:displayCurrency}:{}),...(privacy?{privacy:true}:{}),...(sidebarRail&&!railForced?{rail:true}:{}),...(navMoreOpen?{more:true}:{})}));}catch{}}
// Privacy mode (the eye in the bar, remembered per viewer): names, accounts and IPs are masked wherever records are listed or shown, for
// screen sharing and screenshots. Records are never changed; search, copy and editing still use the real values.
let privacy=readViewPrefs().privacy===true;
// The sidebar collapses to a column of icons (the button at the left of the top bar, ⌘\, ⌃⌘S as an alias, 显示 menu) and the
// card takes the width; remembered per viewer. A sidebar hidden by an earlier version comes back collapsed. Collapsed (variant B,
// 2026-10-23), an icon carries no number: only a dot at its top right when something in it is due (red overdue, amber within
// SOON_DAYS), and `name · count` as its tip. A demo can open collapsed for screenshots (`?demo&rail`, `=more`, `=tip`; the Mac
// app passes `demoRail` for `--demo --sidebar-collapsed|--sidebar-more|--sidebar-tip`); that is never remembered.
const demoRail=demoMode?String(nativeStore?nativeStore.demoRail||'':new URLSearchParams(location.search).get('rail')??''):'';
let sidebarRail=(prefs=>prefs.rail===true||prefs.sidebar===false)(readViewPrefs()),railForced=!sidebarRail&&!!demoMode&&(nativeStore?!!nativeStore.demoRail:new URLSearchParams(location.search).has('rail'));
if(railForced)sidebarRail=true;
let navMoreOpen=readViewPrefs().more===true;
// The column only exists on a wide window; a narrow one shows the strip, which keeps the expanded sidebar's entries.
const railMedia=matchMedia('(max-width:760px)');
function railOn(){return sidebarRail&&!railMedia.matches;}
railMedia.addEventListener('change',()=>{closeMenu(false);renderSidebar();});
// One tip for the rail, drawn by the page (a title would only give the name, late and unstyled): on hover, and on keyboard focus.
let railTipTimer=0,railTipShown=0;
function railTipEl(){let tip=$('#rail-tip');if(!tip){tip=document.createElement('div');tip.id='rail-tip';tip.className='rail-tip';tip.setAttribute('aria-hidden','true');tip.hidden=true;document.body.append(tip);}return tip;}
function railTipText(item){return item.dataset.tip||item.querySelector('.nav-label')?.textContent||'';}
function showRailTip(item,now=false){
 clearTimeout(railTipTimer);if(!railOn()||!item?.isConnected||gesture?.active||!$('#menu').hidden)return hideRailTip();
 const text=railTipText(item);if(!text)return hideRailTip();
 const place=()=>{if(!item.isConnected||!railOn())return;const tip=railTipEl(),[name,...rest]=text.split(' · ');tip.innerHTML=`${esc(name)}${rest.length?`<span class="rail-tip-sep">·</span>${esc(rest.join(' · '))}`:''}`;tip.hidden=false;
  const r=item.getBoundingClientRect();tip.style.left=Math.round(r.right+8)+'px';tip.style.top=Math.round(r.top+r.height/2-tip.offsetHeight/2)+'px';tip.dataset.for=item.dataset.id||'';railTipShown=Date.now();};
 if(now||Date.now()-railTipShown<600)place();else railTipTimer=setTimeout(place,350);
}
function hideRailTip(){clearTimeout(railTipTimer);const tip=$('#rail-tip');if(tip&&!tip.hidden){tip.hidden=true;railTipShown=Date.now();}}
function railTips(){hideRailTip();for(const item of document.querySelectorAll('#sidebar .nav-item'))if(item.title&&item.title===railTipText(item))item.removeAttribute('title');}
document.addEventListener('pointerover',e=>{const item=e.target.closest?.('#sidebar .nav-item');if(item&&railOn())showRailTip(item);});
document.addEventListener('pointerout',e=>{const item=e.target.closest?.('#sidebar .nav-item');if(item&&!item.contains(e.relatedTarget))hideRailTip();});
document.addEventListener('focusin',e=>{const item=e.target.closest?.('#sidebar .nav-item');if(item&&railOn()&&item.matches(':focus-visible'))showRailTip(item,true);else hideRailTip();});
document.addEventListener('pointerdown',()=>hideRailTip(),true);
addEventListener('scroll',()=>hideRailTip(),{passive:true,capture:true});
function syncSidebar(){document.body.classList.toggle('sidebar-rail',sidebarRail);const words=sidebarRail?tr('展开侧边栏（⌘\\）'):tr('收起侧边栏（⌘\\）');setIconButton($('#sidebar-toggle'),'sidebar',words);$('#sidebar-toggle').setAttribute('aria-pressed',String(!sidebarRail));railTips();postWindowChrome();}
let sidebarMoving=0,chromeFrame=0,chromeSent='';
function toggleSidebar(expand=sidebarRail){if(expand!==sidebarRail)return;sidebarRail=!expand;railForced=false;writeViewPrefs();document.body.classList.add('sidebar-moving');clearTimeout(sidebarMoving);sidebarMoving=setTimeout(()=>document.body.classList.remove('sidebar-moving'),MOTION_MS+80);renderSidebar();syncSidebar();}
function veil(text){return privacy&&text?maskName(text):text;}
function veilAccount(text){return privacy&&text?(String(text).includes('@')?maskEmail(text):maskName(text)):text;}
function veilIp(ip){return privacy&&ip?maskIp(ip):ip;}
function setPrivacy(on){privacy=on;writeViewPrefs();render();if(activeAsset&&!$('#detail').hidden)showDetail(activeAsset,{focus:false});if(typeof panoOpen!=='undefined'&&panoOpen)panoramaRender();toast(on?tr('已隐藏名称、账号和 IP'):tr('已显示全部信息'));}
// 费用: totals in one currency the viewer picks (remembered per viewer); records keep their own. Rates come from the Mac app once a
// day (ECB via Frankfurter, recorded in 网络记录), and only when something needs converting; until then, or offline, the built-in or
// last known rates are used and said so.
let displayCurrency=(()=>{const c=readViewPrefs().currency;return MAIN_CURRENCIES.includes(c)?c:'';})(),fx={...FALLBACK_RATES,ok:false,fallback:true},fxAsked=false;
// Every row asks during a render; the answer is kept until the current task ends, so the board is scanned once.
let totalCurrencyMemo='';
function totalCurrency(){if(displayCurrency)return displayCurrency;if(totalCurrencyMemo)return totalCurrencyMemo;const counts=new Map();for(const a of state.assets){const m=costAmount(a);if(m)counts.set(m.currency,(counts.get(m.currency)||0)+1);}const best=[...counts].sort((l,r)=>r[1]-l[1])[0]?.[0];totalCurrencyMemo=MAIN_CURRENCIES.includes(best)?best:'CNY';queueMicrotask(()=>totalCurrencyMemo='');return totalCurrencyMemo;}
function askRates(force=false){
 if(!nativeStore||demoMode)return;
 if(!force){if(fxAsked)return;const cur=totalCurrency();if(!state.assets.some(a=>{const m=costAmount(a);return m&&m.currency!==cur;}))return;}
 fxAsked=true;window.webkit.messageHandlers.assetboard.postMessage({action:'fxRates',force});
}
window.assetboardFxRates=r=>{
 if(r&&r.rates&&typeof r.rates==='object')fx={date:String(r.date||''),source:String(r.source||''),rates:r.rates,fetchedOn:r.fetchedOn,fallback:false};
 fx.ok=!!r?.ok;fx.error=r?.ok?'':String(r?.error||'');
 render();if($('#modal').open&&$('#modal').dataset.view==='cost')costDialog();
};
function costScope(v){return query?liveAssets().filter(matches):cats[v]?liveAssets().filter(a=>a.type===v):v==='all'?liveAssets():projectViewName(v)?projectAssets(state.assets,projectViewName(v)):null;}
function ratesNote(){return fx.fallback?`${fx.source} ${fx.date}${nativeStore&&!demoMode?tr('（还没取到今天的汇率）'):''}`:`${fx.source} ${fx.date}${fx.ok?'':tr('（今天没有取到，用的是上次的）')}`;}
function costDialog(){
 const v=currentView(),scope=costScope(v)||liveAssets(),cur=totalCurrency(),t=costTotals(scope,{currency:cur,rates:fx.rates});
 const label=query?tr('搜索“{query}”',{query}):cats[v]?cats[v].name:tr('全部资产');
 const chips=MAIN_CURRENCIES.map(c=>`<button type="button" class="choice" role="radio" aria-checked="${c===cur}" data-action="cost-currency" data-id="${c}">${esc(currencyDisplay[c]||c)} ${c}</button>`).join('');
 const max=t.byType[0]?.[1]||1;
 const left=[t.free.length&&tr('{n} 项免费',{n:formatCount(t.free.length)}),t.oneOff.length&&tr('{n} 项一次性（共 {total}，另计）',{n:formatCount(t.oneOff.length),total:formatMoney(t.oneOffTotal,cur)}),t.noCycle.length&&tr('{n} 项没填周期',{n:formatCount(t.noCycle.length)}),t.unreadable.length&&tr('{n} 项金额无法识别',{n:formatCount(t.unreadable.length)}),t.noRate.length&&tr('{n} 项的币种没有汇率',{n:formatCount(t.noRate.length)})].filter(Boolean);
 const own=a=>{const m=costAmount(a);return m?formatCost({currency:m.currency,value:m.value%1?m.value.toFixed(2):String(m.value)},Object.keys(billingCycles).find(k=>billingCycles[k].months===m.months)):a.cost;};
 modal(tr('费用'),`<div class="form cost-panel">
  <div class="chip-group cost-currencies" role="radiogroup" aria-label="${tr('计价币种')}">${chips}</div>
  <div class="cost-totals"><div><span>${tr('每月')}</span><strong>${esc(formatMoney(t.monthly,cur))}</strong></div><div><span>${tr('每年')}</span><strong>${esc(formatMoney(t.yearly,cur))}</strong></div></div>
  <p class="form-note">${esc(label)} · ${tr('计入 {n} 项周期费用，已隐藏和已停用的不算。',{n:formatCount(t.items.length)})}${left.length?esc(tr('{list}，不计入。',{list:left.join(tr('，'))})):''}</p>
  ${t.byType.length>1?`<div class="cost-types">${t.byType.map(([type,m])=>`<div class="cost-type"><span>${esc(cats[type]?.name||type)}</span><i style="width:${Math.max(2,Math.round(m/max*100))}%"></i><b>${esc(formatMoney(m,cur))}</b></div>`).join('')}</div>`:''}
  ${t.items.length?`<ul class="cost-items">${t.items.slice(0,8).map(({asset,money,monthly})=>`<li><button type="button" class="text-button" data-action="cost-open" data-id="${esc(asset.id)}">${esc(displayName(asset))}</button><span class="cost-own">${esc(own(asset))}</span><b>${tr('{money} / 月',{money:esc(formatMoney(monthly,cur))})}</b></li>`).join('')}</ul>${t.items.length>8?`<p class="form-note">${tr('另外 {n} 项合计 {money} / 月',{n:formatCount(t.items.length-8),money:esc(formatMoney(t.items.slice(8).reduce((n,i)=>n+i.monthly,0),cur))})}</p>`:''}`:`<p class="form-note">${tr('还没有可计入的周期费用。在资产里填上金额和扣款周期就会算进来。')}</p>`}
  ${costExtrasHtml(scope,cur)}
  <p class="form-note cost-rates">${ui('info')}<span>${tr('只换算合计，每项资产保留自己的币种。汇率：{rates}',{rates:esc(ratesNote())})}${nativeStore&&!demoMode?` · <button type="button" class="text-button inline-button" data-action="cost-refresh">${tr('刷新')}</button>`:''}</span></p>
 </div>`,'cost');
}
function costMeta(v){
 const scope=costScope(v);if(!scope)return '';
 const cur=totalCurrency(),t=costTotals(scope,{currency:cur,rates:fx.rates});if(!t.items.length)return '';
 askRates();
 return `<button type="button" class="meta-cost" data-action="cost-panel" title="${tr('周期费用合计，按 {cur} 换算；点开看明细、换币种',{cur})}">${tr('{money} / 月',{money:esc(formatMoney(t.monthly,cur))})}</button>`;
}
// A record's own cost in the chosen currency, as a hint on its row; the record is never changed.
// The cost's tip: the amount in the total's currency when it differs, and for a longer cycle what it comes to a month.
function costHint(a){
 const m=costAmount(a),cur=totalCurrency();if(!m)return '';
 const inCur=value=>m.currency===cur?value:convertMoney(value,m.currency,cur,fx.rates),out=[];
 if(m.currency!==cur){const v=inCur(m.value);if(v!==null)out.push(tr('约 {money}',{money:formatMoney(v,cur)+(m.months?` / ${Object.values(billingCycles).find(c=>c.months===m.months).suffix}`:'')}));}
 if(m.months>1){const v=inCur(m.value/m.months);if(v!==null)out.push(tr('每月约 {money}',{money:formatMoney(v,cur)}));}
 return out.join(tr('，'));
}
{const prefs=readViewPrefs();if(prefs.layout==='grid')layoutMode='grid';if(typeof prefs.view==='string')view=prefs.view;}
// Sidebar categories follow state.blocks; a category that holds assets is always listed, even without a block entry.
function categoryIds(){const ids=state.blocks.map(b=>b.id).filter(id=>cats[id]);for(const a of state.assets)if(cats[a.type]&&!ids.includes(a.type))ids.push(a.type);return ids;}
function currentView(){if(view==='all'||view==='upcoming')return view;if(projectViewName(view))return projectAssets(state.assets,projectViewName(view)).length?view:'all';if(view==='hidden')return state.assets.some(isHidden)?'hidden':'all';return cats[view]&&categoryIds().includes(view)?view:'all';}
function setView(next){if(!['all','upcoming','hidden'].includes(next)&&!cats[next]&&!projectViewName(next))return;view=next;writeViewPrefs();if(query){query='';$('#search').value='';}render();boardScroller().scrollTo(0,0);}
function setLayout(next){if(!['list','grid'].includes(next)||next===layoutMode)return;layoutMode=next;writeViewPrefs();render();}
function liveAssets(){return state.assets.filter(a=>!isHidden(a));}
function dueLevels(list){let overdue=0,soon=0;for(const a of list){if(a.stopped)continue;const level=assetDateStatus(a).level;if(level==='overdue')overdue++;else if(level==='soon')soon++;}return {overdue,soon};}
function dueWords({overdue,soon}){return [overdue&&tr('{n} 项已过期',{n:overdue}),soon&&tr('{n} 项 30 天内到期',{n:soon})].filter(Boolean).join(tr('，'));}
function navCount(n,level=''){return `<span class="nav-count${level?' '+level:''}"${n>DISPLAY_LIMITS.count?` title="${n}"`:''}>${formatCount(n)}</span>`;}
function navItem(id,label,glyph,count,attrs=''){const on=!query&&currentView()===id&&!(typeof panoOpen!=='undefined'&&panoOpen);return `<button class="nav-item${on?' active':''}" data-action="view" data-id="${id}"${on?' aria-current="page"':''} ${attrs}>${glyph}<span class="nav-label">${esc(label)}</span>${count}</button>`;}
// The sidebar shows the categories that matter and folds the rest under 更多. Expanded it folds only the empty ones (the current
// category is always shown, nothing is folded for a single leftover) and 更多 opens the rest in place, so arrows and Tab still reach
// every category. Folded to icons the column is fixed: the views, RAIL_CATEGORIES (in the person's order) and 更多, a menu with every
// other category, projects, 已隐藏 and the tools; 更多 is the selected item while the current view is one of those.
const RAIL_CATEGORIES=['domain','server'];
function sidebarCategories(ids,stats){
 if(railOn()){const shown=ids.filter(id=>RAIL_CATEGORIES.includes(id));return {shown,folded:ids.filter(id=>!shown.includes(id))};}
 const cur=currentView(),weight=id=>(stats[id].overdue?2e6:0)+(stats[id].soon?1e6:0)+stats[id].count;
 const ranked=ids.filter(id=>stats[id].count&&id!==cur).sort((a,b)=>weight(b)-weight(a));
 const keep=new Set([...ids.filter(id=>id===cur),...ranked]);
 const folded=ids.filter(id=>!keep.has(id));
 return folded.length<2?{shown:ids,folded:[]}:{shown:ids.filter(id=>keep.has(id)),folded};
}
function railDot(level){return railOn()&&level?`<i class="rail-dot ${level}" aria-hidden="true"></i>`:'';}
function worstLevel(l){return l.overdue?'overdue':l.soon?'soon':'';}
function renderSidebar(){
 const live=liveAssets(),hidden=state.assets.length-live.length,due=dueLevels(live),dueCount=due.overdue+due.soon,rail=railOn();
 const ids=categoryIds(),stats=Object.fromEntries(ids.map(id=>{const own=live.filter(a=>a.type===id);return [id,{count:own.length,...dueLevels(own)}];})),{shown,folded}=sidebarCategories(ids,stats);
 const catItem=(id,inMenu)=>{const {count,...l}=stats[id],words=dueWords(l),level=worstLevel(l);return navItem(id,cats[id].name,`<span class="nav-icon">${icon(id)}</span>`,`${level&&!(rail&&!inMenu)?`<i class="nav-dot ${level}" aria-hidden="true"></i>`:''}${rail&&!inMenu?railDot(level):''}${count?navCount(count):''}`,`data-block="${id}"${count?'':' data-empty'}${level?` data-due="${level}"`:''}${rail?` data-tip="${esc(cats[id].name)} · ${count}"`:''} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="${esc(cats[id].name)}${tr('，')}${tr('{n} 项',{n:count})}${words?tr('，')+words:''}"`);};
 const views=`<div class="nav-group">${navItem('upcoming',tr('即将到来'),ui('clock'),railDot(worstLevel(due))+(dueCount?navCount(dueCount,due.overdue?'overdue':'soon'):''),`${rail?`data-tip="${tr('即将到来')} · ${dueCount}" `:''}aria-label="${tr('即将到来')}${dueCount?(rail?tr('，')+tr('{n} 项',{n:dueCount}):'')+tr('，')+dueWords(due):rail?tr('，')+tr('{n} 项',{n:0}):''}"`)}${navItem('all',tr('全部资产'),ui('stack'),navCount(live.length),rail?`data-tip="${tr('全部资产')} · ${live.length}" aria-label="${tr('全部资产')}${tr('，')}${tr('{n} 项',{n:live.length})}"`:'')}${panoNavItem()}</div>`;
 const hiddenItem=hidden?navItem('hidden',tr('已隐藏'),ui('eyeoff'),navCount(hidden),rail?`data-tip="${tr('已隐藏')} · ${hidden}" aria-label="${tr('已隐藏')}${tr('，')}${tr('{n} 项',{n:hidden})}"`:''):'';
 const tools=(state.assets.length||nativeStore&&!demoMode?`${toolsNavHtml()}${nativeStore&&!demoMode?`<button class="nav-item" data-action="icon-batch" data-id="icons">${ui('image')}<span class="nav-label">${tr('获取网站图标')}</span></button><button class="nav-item" data-action="network-log" data-id="network">${ui('pulse')}<span class="nav-label">${tr('网络记录')}</span></button>`:''}`:'')+`<button class="nav-item" data-action="prefs" data-id="prefs">${ui('gear')}<span class="nav-label">${tr('设置')}</span></button>`;
 if(rail){
  // Everything that is not in the column goes to the 更多 menu (railMoreHtml); its dot is the worst of the folded categories.
  const sum=folded.reduce((t,id)=>({overdue:t.overdue+stats[id].overdue,soon:t.soon+stats[id].soon}),{overdue:0,soon:0}),worst=worstLevel(sum),words=dueWords(sum);
  railMoreParts={cats:folded.map(id=>catItem(id,true)).join(''),projects:projectNavHtml(),hidden:hiddenItem,tools};
  const extra=!!(railMoreParts.projects||hidden||tools),cur=currentView(),inside=!query&&!(typeof panoOpen!=='undefined'&&panoOpen)&&(folded.includes(cur)||cur==='hidden'||!!projectViewName(cur));
  const curName=inside?(cats[cur]?.name||(cur==='hidden'?tr('已隐藏'):tr('项目 {name}',{name:projectViewName(cur)}))):'';
  const more=folded.length||extra?`<button class="nav-item nav-more${inside?' active':''}" data-action="nav-more" data-id="more" aria-haspopup="menu" aria-expanded="false"${inside?' aria-current="page"':''}${worst?` data-due="${worst}"`:''} data-tip="${tr('更多')}${folded.length?` · ${folded.length}`:''}" aria-label="${tr('更多')}${folded.length?tr('，')+tr('{n} 个类别',{n:folded.length}):''}${words?tr('，')+words:''}${curName?tr('，')+tr('当前：{name}',{name:esc(curName)}):''}">${ui('more')}<span class="nav-label">${tr('更多')}</span>${railDot(worst)}</button>`:'';
  const catItems=shown.map(id=>catItem(id)).join('')+more;
  $('#sidebar').innerHTML=`${views}${catItems?`<div class="nav-group nav-cats" role="group" aria-labelledby="nav-cats-title"><h2 class="nav-title" id="nav-cats-title">${tr('类别')}</h2>${catItems}</div>`:''}`;
  return;
 }
 railMoreParts=null;
 const worst=folded.some(id=>stats[id].overdue)?'overdue':folded.some(id=>stats[id].soon)?'soon':'',word=navMoreOpen?tr('收起'):tr('更多');
 const more=folded.length?`<button class="nav-item nav-more" data-action="nav-more" aria-expanded="${navMoreOpen}"${navMoreOpen?' aria-controls="nav-more-list"':''}${worst&&!navMoreOpen?` data-due="${worst}"`:''} aria-label="${word} ${tr('{n} 个类别',{n:folded.length})}">${ui(navMoreOpen?'chevron':'more')}<span class="nav-label">${word}</span>${navMoreOpen?'':navCount(folded.length,worst)}</button>${navMoreOpen?`<div class="nav-more-list" id="nav-more-list">${folded.map(id=>catItem(id)).join('')}</div>`:''}`:'';
 const catItems=shown.map(id=>catItem(id)).join('')+more;
 $('#sidebar').innerHTML=`${views}${catItems?`<div class="nav-group nav-cats" role="group" aria-labelledby="nav-cats-title"><h2 class="nav-title" id="nav-cats-title">${tr('类别')}</h2>${catItems}</div>`:''}${projectNavHtml()}${hidden?`<div class="nav-group">${hiddenItem}</div>`:''}${tools?`<div class="nav-group nav-foot">${tools}</div>`:''}`;
}
// 更多 on the rail: a menu beside it with the same entries the expanded sidebar would show (names, counts, dots), in #menu, so the
// menu keys apply: ↑↓ Home End move, Enter picks, Esc or Tab close and Esc returns to 更多. A pick keeps focus on the column.
let railMoreParts=null;
function railMoreHtml(){const p=railMoreParts;if(!p)return '';return [p.cats,p.projects.replace(/<h2[^>]*>.*?<\/h2>/,''),p.hidden,p.tools].filter(Boolean).map(x=>`<div class="rail-menu-group">${x}</div>`).join('<div class="menu-sep" role="separator"></div>');}
function openRailMore(anchor){
 const html=railMoreHtml();if(!html)return;hideRailTip();
 const menu=$('#menu');menuReturn=anchor;menu.innerHTML=html;menu.classList.add('rail-menu');menu.setAttribute('aria-label',tr('更多'));
 for(const item of menu.querySelectorAll('.nav-item')){item.classList.add('menu-item');item.setAttribute('role','menuitem');item.tabIndex=-1;item.removeAttribute('aria-keyshortcuts');}
 for(const group of menu.querySelectorAll('.nav-group,.rail-menu-group'))group.setAttribute('role','none');
 menu.hidden=false;anchor.setAttribute('aria-expanded','true');menu.anchor=anchor;
 const r=anchor.getBoundingClientRect(),h=menu.offsetHeight;
 menu.style.left=Math.round(r.right+8)+'px';menu.style.top=Math.round(Math.max(8,Math.min(r.top-4,innerHeight-h-8)))+'px';
 (menu.querySelector('.menu-item.active')||menu.querySelector('.menu-item'))?.focus();
}
// The panorama lives in the middle column; its entry sits with the views (P opens it anywhere).
function panoNavItem(){if(!state.assets.length||!featureOn('panorama'))return '';const on=typeof panoOpen!=='undefined'&&panoOpen;return `<button class="nav-item${on?' active':''}" data-action="panorama" data-id="panorama" aria-keyshortcuts="P"${on?' aria-current="page"':''}>${ui('grid')}<span class="nav-label">${tr('全景')}</span><kbd class="nav-key">P</kbd></button>`;}
// An automatic sync that stopped (U4): grey, not amber or red (those mean dates), and a click opens that source to sync again.
// Only sources that sync by themselves are checked: Cloudflare while it is connected.
let cloudflareAutoError='';
function staleHtml(scope){
 const auto=demoMode||!nativeStore?.cloudflareConnected?[]:['cloudflare'],stale=staleSyncs(scope,{auto});if(!stale.length)return '';
 const worst=stale[0],error=cloudflareAutoError,why=error?tr('：{error}',{error}):'';
 const tip=stale.map(g=>`${g.name}${g.account?` · ${g.account}`:''}`+tr('：{days} 天没同步（{n} 项）',{days:g.days,n:g.count})).join('\n')+(why?'\n'+tr('上次自动同步失败')+why:'');
 return `<button class="meta-flag stale" data-action="stale-sync" data-id="${esc(worst.source)}" title="${esc(tip)}">${esc(worst.name)}<span class="mf-word"> ${tr('{n} 天没同步',{n:worst.days})}</span></button>`;
}
function renderHeader(v,shown){
 const title=query?tr('搜索'):v==='all'?tr('全部资产'):v==='upcoming'?tr('即将到来'):v==='hidden'?tr('已隐藏'):projectViewName(v)||cats[v].name;
 $('#view-title').textContent=title;
 const scope=query?[]:cats[v]?liveAssets().filter(a=>a.type===v):v==='all'?liveAssets():projectViewName(v)?projectAssets(state.assets,projectViewName(v)):[],l=dueLevels(scope);
 $('#view-meta').innerHTML=state.assets.length?`<span${shown>DISPLAY_LIMITS.count?` title="${tr('{n} 项',{n:shown})}"`:''}>${tr('{n} 项',{n:formatCount(shown)})}</span>${costMeta(v)}${l.overdue?`<span class="meta-flag overdue" title="${l.overdue} ${tr('已过期')}">${l.overdue}<span class="mf-word"> ${tr('已过期')}</span></span>`:''}${l.soon?`<span class="meta-flag soon" title="${l.soon} ${tr('即将到期')}">${l.soon}<span class="mf-word"> ${tr('即将到期')}</span></span>`:''}${staleHtml(scope)}`:'';
 $('#view-menu').hidden=!(cats[v]&&!query);$('#view-menu').dataset.id=cats[v]?v:'';
 if(cats[v])$('#view-menu').setAttribute('aria-label',tr('{name}类别设置',{name:cats[v].name}));
 const toggle=$('#layout-toggle');toggle.hidden=!state.assets.length||(v==='upcoming'&&!query);
 $('#privacy-wrap').hidden=!state.assets.length;setIconButton($('#privacy-toggle'),privacy?'eyeoff':'eye',privacy?tr('显示名称、账号和 IP'):tr('隐藏名称、账号和 IP'));$('#privacy-toggle').setAttribute('aria-pressed',String(privacy));
 toggle.querySelectorAll('[data-action="layout"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===layoutMode)));
 document.title=`${title} · Assetboard`;
}
// One row or grid card per asset. The tile is the platform icon when there is one, the category line icon otherwise, so every row has the same anchor.
// A bare day count for compact lists (the panorama's next-dates list); the kind lives in the label beside it.
function agendaWhen(status){return status.days<0?tr('过期 {n} 天',{n:-status.days}):status.days===0?tr('今天'):status.days===1?tr('明天'):tr('{n} 天',{n:status.days});}
function costText(a){return a.cost&&a.cost!=='未知'?a.cost==='免费'?tr('免费'):a.cost:'';}
// `after` (a card's or number's 支付 / 验证 N 项) goes right after the identity, ahead of the issuer or carrier, which is cut first;
// a card then gives its tail without the network (the detail has it), so the count fits beside an open inspector.
function subLine(a,after=''){
 if(a.type==='server'){const ip=primaryIp(a),flag=regionFlag(a.region),flagHtml=flag?`<span class="flag" title="${esc(regionName(a.region))}">${flag}</span>`:'';
  // Without an address a server says where it is, when that is known (an import may bring the region and nothing else).
  if(!ip&&flag){const text=[regionName(a.region),a.provider].filter(Boolean).join(' · ');return {html:`${flagHtml}${esc(text)}`,text};}
  if(ip)return {html:`${flagHtml}${ip.inner?`<em class="ip-inner" title="${tr('内网地址')}">${tr('内')}</em>`:''}<span class="ip-text">${esc(veilIp(ip.ip))}</span>${ip.more?`<em class="ip-more" aria-label="${tr('另有 IPv6')}">+${ip.more}</em>`:''}${a.provider?`<span class="sub-sep" aria-hidden="true">·</span><span class="ip-prov">${esc(a.provider)}</span>`:''}`,text:[assetIps(a).map(x=>veilIp(x.ip)).join('  '),a.provider].filter(Boolean).join(' · '),cls:'ip-sub'};}
 if(assetProfiles[a.type]){const flag=regionFlag(a.region),identity={bankcard:[!(after&&a.last4)&&a.network,a.last4&&`•••• ${a.last4}`].filter(Boolean).join(' '),phone:maskPhone(a.phone),appleid:maskEmail(a.account)||regionName(a.region),google:maskEmail(a.account)||regionName(a.region),ai:a.provider}[a.type]||'',owner={bankcard:a.provider,phone:a.provider}[a.type]||'',text=[identity,owner].filter(Boolean).join(' · ');return {html:`${flag?`<span class="flag">${flag}</span>`:''}${esc(identity)}${after}${owner?`${identity||after?'<span class="sub-sep" aria-hidden="true">·</span>':''}${esc(owner)}`:''}`,text};}
 // Synced records name their account as a small tag, so two GitHub or Cloudflare accounts in one group stay apart.
 const provider=a.provider==='平台待补充'?'':a.provider,text=[provider,veilAccount(a.account)].filter(Boolean).join(' · ');
 if([...PLATFORM_SOURCES,'ssh'].includes(a.source)&&a.account)return {html:`${provider?`${esc(provider)}<span class="sub-sep" aria-hidden="true">·</span>`:''}<span class="account-tag">${esc(veilAccount(a.account))}</span>`,text};
 return {html:esc(text),text};
}
function statusHtml(e){return `<span class="r-date${e.cls?' '+e.cls:''}">${e.cls?'<i class="dot" aria-hidden="true"></i>':''}${esc(e.text)}</span>`;}
function itemLabel(a,e,cost){const live=probeState(a);return [displayName(a),isPrivateRepo(a)&&tr('私有仓库'),a.stopped&&tr('已停用'),live&&tr('探针{text}',{text:live.text}),isHidden(a)&&tr('已隐藏'),e.text,cost].filter(Boolean).join(tr('，'));}
function itemActions(a){return isHidden(a)?`<button class="button r-restore" data-action="restore-asset" data-id="${esc(a.id)}">${tr('恢复')}</button><button class="button danger-quiet" data-action="delete-asset" data-id="${esc(a.id)}" title="${tr('只删除 Assetboard 里的记录')}">${tr('删除')}</button>`:quickButtons(a);}
function itemHtml(a,{withType=false,grid=false}={}){
 const e=eventInfo(a),cost=costText(a),hint=[veil(a.name),a.purpose&&a.purpose!==cats[a.type]?.name?a.purpose:'',a.reason&&tr('保留原因：{reason}',{reason:a.reason})].filter(Boolean).join('\n');
 // In 即将到来 the category leads, then the keep reason when there is one (it is what helps decide), otherwise the source. A card or
 // number gives just its tail (•••• 8812) and what hangs on it, so 支付 N 项 fits the column.
 // Cards and numbers say what hangs on them (支付 / 验证 N 项) wherever they are listed.
 const impact=linkImpact(state.assets,a),impactHtml=impact.length?`<span class="sub-sep" aria-hidden="true">·</span><span class="r-impact" title="${esc(impact.map(displayName).join(tr('、')))}">${tr('{verb} {n} 项',{verb:IMPACT_WORDS[a.type].verb,n:formatCount(impact.length)})}</span>`:'',sub=subLine(a,withType?'':impactHtml);
 const short=a.type==='bankcard'&&a.last4?`•••• ${a.last4}`:identityText(a);
 const subHtml=withType&&impact.length?`${esc(cats[a.type].name)}${short?`<span class="sub-sep" aria-hidden="true">·</span>${esc(short)}`:''}${impactHtml}`:withType?`${esc(cats[a.type].one)}${a.reason?`<span class="sub-sep" aria-hidden="true">·</span><span class="r-reason">${esc(a.reason)}</span>`:sub.text?`<span class="sub-sep" aria-hidden="true">·</span>${sub.html}`:''}`:sub.html;
 // A server linked to a probe shows its state on a line under the address: in place of the implied 运行中, and red when offline.
 // 已停用, set by hand, still stands (the readings show beside it), and a stopped server is never drawn as down.
 const live=probeState(a),probeLine=live?proSlots.serverProbe.rowHtml(a):'';
 const name=`<span class="r-name"><span class="r-text">${esc(displayName(a))}</span>${lockMark(a)}${stopRing(a)}${relMark(a)}</span>`,subSpan=`<span class="r-sub${sub.cls&&!withType?' '+sub.cls:''}"${sub.text?` title="${esc(sub.text)}"`:''}>${subHtml}</span>`;
 const selected=activeAsset===a.id&&!$('#detail').hidden;
 return `<div class="${grid?'gcard':'row'}${a.stopped?' stopped':''}${live&&!live.online&&!a.stopped?' probe-down':''}${isHidden(a)?' is-hidden':''}${selected?' selected':''}" data-asset="${esc(a.id)}"><button class="item-open" data-action="detail" data-id="${esc(a.id)}" aria-label="${esc(itemLabel(a,e,cost))}" title="${esc(hint)}">${tile(a,grid?'':'sm')}<span class="r-main">${name}${subSpan}${probeLine}${searchHit(a)}</span><span class="r-when">${statusHtml(e)}<span class="r-cost"${costHint(a)?` title="${esc(costHint(a))}"`:''}>${priceMark(a)}${esc(cost)}</span></span></button><span class="r-actions">${itemActions(a)}</span></div>`;
}
function groupSummary(list){const l=dueLevels(list);return l.overdue||l.soon?`<span class="g-sum" role="img" aria-label="${dueWords(l)}" title="${dueWords(l)}">${l.overdue?`<span class="g-flag overdue"><i class="dot" aria-hidden="true"></i>${formatCount(l.overdue)}</span>`:''}${l.soon?`<span class="g-flag soon"><i class="dot" aria-hidden="true"></i>${formatCount(l.soon)}</span>`:''}</span>`:'';}
// A group is a category (or a date band, or the hidden pile). Only categories in the overview fold and reorder.
function groupHtml({id,title,glyph='',list,fold=false,folded=false,reorder=false,head=true,summary='',actions='',withType=false}){
 const grid=layoutMode==='grid'&&!withType,count=`<span class="g-count">${formatCount(list.length)}</span>`;
 const heading=!head?'':`<header class="group-head">${fold?`<button class="group-title" data-action="collapse" data-id="${id}" aria-expanded="${!folded}" aria-controls="group-${id}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="${folded?tr('展开（按住 ⌥ 点按：全部）'):tr('收起（按住 ⌥ 点按：全部）')}"><span class="g-chevron">${ui('chevron')}</span>${glyph}<span class="g-name">${esc(title)}</span>${count}</button>`:`<h2 class="group-title static">${glyph}<span class="g-name">${esc(title)}</span>${count}</h2>`}${summary}${actions?`<span class="g-actions">${actions}</span>`:''}</header>`;
 return `<section class="group${folded?' folded':''}${head?'':' solo'}" data-group="${id}" aria-label="${esc(title)}">${heading}${folded?'':`<div class="group-body ${grid?'grid':'list'}" id="group-${id}"${reorder?` data-reorder="${id}"`:''}>${list.map(a=>itemHtml(a,{withType,grid})).join('')}</div>`}</section>`;
}
function categoryActions(id){return `<button class="icon-button" data-action="add-asset" data-id="${id}" aria-label="${tr('添加{name}',{name:esc(cats[id].name)})}" title="${tr('添加{name}',{name:esc(cats[id].name)})}">${ui('plus')}</button><button class="icon-button" data-action="view" data-id="${id}" aria-label="${tr('只看{name}',{name:esc(cats[id].name)})}" title="${tr('只看{name}',{name:esc(cats[id].name)})}">${ui('chevron')}</button>`;}
function arranged(id,list){return arrangeAssets(list,state.cardOrder?.[id]);}
const UPCOMING_BANDS=[['overdue',tr('已过期'),s=>s.days<0],['week',tr('7 天内'),s=>s.days<=7],['month',tr('30 天内'),s=>s.days<=30],['later',tr('更晚'),()=>true]];
function viewEmpty(glyph,text,button=''){return `<div class="view-empty">${glyph}<p>${text}</p>${button}</div>`;}
// Returns the board HTML and how many assets it lists; an empty string means "nothing to show" (the search empty state takes over).
function boardHtml(v){
 const typeGlyph=id=>`<span class="g-icon">${icon(id)}</span>`;
 if(query){
  const hits=state.assets.filter(matches),live=hits.filter(a=>!isHidden(a)),hidden=hits.filter(isHidden);
  const html=categoryIds().map(id=>{const list=arranged(id,live.filter(a=>a.type===id));return list.length?groupHtml({id,title:cats[id].name,glyph:typeGlyph(id),list}):'';}).join('')+(hidden.length?groupHtml({id:'hidden',title:tr('已隐藏'),glyph:`<span class="g-icon">${ui('eyeoff')}</span>`,list:hidden}):'');
  return {html,count:hits.length};
 }
 if(v==='upcoming'){
  const events=upcomingEvents(state.assets,new Date(),Infinity),charges=chargesBandHtml();
  if(!events.length&&!charges)return {html:viewEmpty(ui('clock'),tr('还没有到期或扣款日期'),`<button class="button" data-action="inbox">${tr('粘贴续费通知')}</button>`),count:0};
  const left=[...events],off=exportNoteHtml()+handoverNoteHtml()+(nativeStore?.notifications==='denied'&&!demoMode?`<p class="notify-off" role="note">${ui('warn')}<span>${tr('系统通知已关闭，到期前不会提醒')}</span><button class="button" data-action="notification-settings">${tr('打开通知设置')}</button></p>`:'');
  const html=off+charges+UPCOMING_BANDS.map(([id,title,fits])=>{const band=[];while(left.length&&fits(left[0].status))band.push(left.shift().asset);return band.length?groupHtml({id,title,list:band,withType:true}):'';}).join('');
  return {html,count:events.length};
 }
 if(projectViewName(v))return projectBoardHtml(projectViewName(v));
 if(v==='hidden'){
  const hidden=state.assets.filter(isHidden);
  return {html:categoryIds().map(id=>{const list=arranged(id,hidden.filter(a=>a.type===id));return list.length?groupHtml({id,title:cats[id].name,glyph:typeGlyph(id),list}):'';}).join(''),count:hidden.length};
 }
 const live=liveAssets();
 if(cats[v]){
  const list=arranged(v,live.filter(a=>a.type===v));
  return {html:list.length?groupHtml({id:v,title:cats[v].name,list,reorder:true,head:false}):viewEmpty(`<span class="g-icon">${icon(v)}</span>`,tr('还没有{name}',{name:esc(cats[v].name)}),`<button class="button" data-action="add-asset" data-id="${v}">${ui('plus')}${tr('添加')}</button>`),count:list.length};
 }
 const html=categoryIds().map(id=>{const list=arranged(id,live.filter(a=>a.type===id));if(!list.length)return '';const folded=!!state.blocks.find(b=>b.id===id)?.folded;return groupHtml({id,title:cats[id].name,glyph:typeGlyph(id),list,fold:true,folded,reorder:true,summary:groupSummary(list),actions:categoryActions(id)});}).join('');
 return {html:html||viewEmpty(ui('stack'),tr('没有显示中的资产')),count:live.length};
}
let layoutFrame=0,renderedKey='',skipLayoutAnimation=false;
function render(){
 const animateLayout=!skipLayoutAnimation;skipLayoutAnimation=false;
 if(typeof applyBoardTheme==='function'&&!themePreview)applyBoardTheme();
 cancelAnimationFrame(layoutFrame);closeMenu(false);
 const v=currentView(),key=`${query}|${v}|${layoutMode}`,same=key===renderedKey;renderedKey=key;
 // Rows slide to their new place inside the same group; groups slide as a whole (a fold above them, a moved category).
 const previousGroups=same?new Map([...document.querySelectorAll('#board .group')].map(el=>[el.dataset.group,el.getBoundingClientRect()])):new Map();
 const previousItems=same?new Map([...document.querySelectorAll('#board [data-asset]')].map(el=>{const group=el.closest('.group');return [el.dataset.asset,{rect:el.getBoundingClientRect(),group:group?.dataset.group,origin:previousGroups.get(group?.dataset.group)}];})):new Map();
 renderSidebar();
 const welcome=!query&&!state.assets.length,board=welcome?{html:'',count:0}:boardHtml(v);
 renderHeader(v,board.count);
 $('#board').hidden=welcome||!board.html;$('#welcome').hidden=!welcome;
 document.querySelectorAll('#welcome .native-only').forEach(el=>el.hidden=!nativeStore);
 $('#board').dataset.view=query?'search':cats[v]?'category':v;
 $('#board').innerHTML=board.html;
 $('#empty').hidden=welcome||!!board.html;
 $('#empty-title').textContent=tr('没有结果');$('#empty-note').hidden=true;$('#clear-search').textContent=tr('清除');
 syncToolbar();
 layoutFrame=requestAnimationFrame(()=>{
  layoutFrame=0;
  if(!animateLayout||reduceMotion())return;
  for(const el of document.querySelectorAll('#board .group')){const from=previousGroups.get(el.dataset.group);if(from)slideFrom(el,from,MOTION_MS);}
  for(const el of document.querySelectorAll('#board [data-asset]')){const was=previousItems.get(el.dataset.asset),group=el.closest('.group'),to=el.getBoundingClientRect(),origin=group?.getBoundingClientRect();if(!was||was.group!==group?.dataset.group||!was.origin||Math.abs(was.rect.width-to.width)>2||Math.abs(was.rect.height-to.height)>2)continue;const dx=(was.rect.left-was.origin.left)-(to.left-origin.left),dy=(was.rect.top-was.origin.top)-(to.top-origin.top);if(Math.abs(dx)>=1||Math.abs(dy)>=1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:MOTION_MS,easing:settleEase});}
 });
}
// Folding animates the changed groups' height in layout, so the groups below follow; the clicked header stays where it was.
function foldRender(ids,anchorId,before=new Map([...document.querySelectorAll('#board .group')].map(el=>[el.dataset.group,el.getBoundingClientRect()]))){
 const header=()=>document.querySelector(`#board .group[data-group="${CSS.escape(anchorId)}"]`),anchor=header()?.getBoundingClientRect().top;
 skipLayoutAnimation=true;render();
 if(reduceMotion())return;
 for(const id of ids){
  const el=document.querySelector(`#board .group[data-group="${CSS.escape(id)}"]`),from=before.get(id);if(!el||!from)continue;
  const to=el.getBoundingClientRect().height;if(Math.abs(to-from.height)<1)continue;
  el.animate([{height:from.height+'px',overflow:'hidden'},{height:to+'px',overflow:'hidden'}],{duration:MOTION_MS,easing:settleEase});
  el.querySelector('.group-body')?.animate([{opacity:0},{opacity:1}],{duration:160,delay:40,easing:'ease-out',fill:'backwards'});
 }
 if(anchor===undefined)return;
 const until=performance.now()+MOTION_MS+60,hold=()=>{const top=header()?.getBoundingClientRect().top;if(top===undefined)return;if(Math.abs(top-anchor)>.5)scrollBy(0,top-anchor);if(performance.now()<until)requestAnimationFrame(hold);};
 requestAnimationFrame(hold);
}
function setIconButton(el,glyph,label,badge=''){if(!el)return;el.innerHTML=ui(glyph)+(badge?`<i class="count-badge">${badge}</i>`:'');el.setAttribute('aria-label',label);el.title=label;}
function syncToolbar(){syncActionBanner();const pending=pendingCount()+intake.length;setIconButton($('#inbox-button'),'tray',pending?tr('待确认 {n}',{n:formatCount(pending)}):tr('待确认'),pending?formatCount(pending):'');postWindowChrome();}
// Delete requests from agents are easy to miss in 待确认: while any wait unseen, a banner sits over the board and opens the list.
function syncActionBanner(){
 const waiting=typeof intake==='undefined'?0:intake.filter(i=>i.deleteId).length,asks=typeof intake==='undefined'?0:intake.filter(i=>i.confirmKind).length;let bar=$('#action-banner');
 if(!waiting&&!asks||agentDeleteOpen||agentConfirmOpen){bar?.remove();return;}
 if(!bar){bar=document.createElement('div');bar.id='action-banner';bar.className='action-banner';bar.setAttribute('role','alert');$('#topbar').after(bar);}
 bar.innerHTML=`${ui('warn')}<span>${waiting?tr('外部工具请求删除 <b>{n}</b> 项，等你确认',{n:formatCount(waiting)}):tr('外部工具请求修改 <b>{n}</b> 项设置，等你确认',{n:formatCount(asks)})}</span><button class="button primary" data-action="agent-delete-open">${tr('查看')}</button>`;
}
function agentDeleteNudge(){syncActionBanner();if(nativeStore&&!demoMode)try{window.webkit.messageHandlers.assetboard.postMessage({action:'attention'});}catch{}}
// The selected row follows the inspector without a re-render.
function markSelected(){document.querySelectorAll('#board .selected').forEach(n=>n.classList.remove('selected'));const open=!$('#detail').hidden;document.body.classList.toggle('inspecting',open);if(open&&activeAsset)document.querySelector(`#board [data-asset="${CSS.escape(activeAsset)}"]`)?.classList.add('selected');}
// One small menu for the inspector's ⋯ and a row's context menu. Items are ordinary data-action buttons, so they run through the one click handler.
let menuReturn=null;
function assetMenuItems(a,full=false){
 const id=a.id,items=[],link=safeManagementUrl(a.url),realLink=link&&new URL(link).hostname!=='example.com';
 if(full){if(realLink)items.push({action:'external',label:tr('打开管理页'),key:'O'});items.push({action:'edit-asset',label:tr('编辑…'),key:'E'});for(const q of assetQuick(a).filter(q=>q.kind!=='open'))items.push({action:'quick',label:q.label,quick:q.id});items.push('-');}
 if(!a.hiddenAt){items.push({action:'pin-front',label:tr('放到前面'),key:'F'});if(manualOrder(a.type))items.push({action:'auto-order',label:tr('恢复自动排序')});items.push({action:'link-picker',label:tr('关联…'),key:'L'});}
 if(renewable(a))items.push({action:'renew',label:`${renewWord(a)}…`,key:'R'});
 if(!a.hiddenAt&&ownPayments(a)&&proAction('payment-add')&&(costAmount(a)||canRenew(a)||paymentList(a).length))items.push({action:'payment-add',label:tr('记一笔付款…')});
 if(nativeStore&&a.type==='domain'&&rdapDomain(a))items.push({action:'rdap',label:tr('核对注册局日期')});
 if(nativeStore)items.push({action:'icon-dialog',label:tr('网站图标…')});
 if(STOPPABLE.includes(a.type)&&!a.hiddenAt)items.push({action:'toggle-stopped',label:a.stopped?tr('恢复启用'):tr('标为停用'),key:'S'});
 items.push({action:a.hiddenAt?'restore-asset':'hide-asset',label:a.hiddenAt?tr('恢复显示'):tr('隐藏'),key:'H'},'-',{action:'delete-asset',label:tr('删除…'),danger:true});
 return items.map(x=>x==='-'?x:{...x,id});
}
function openMenu(items,{x,y,anchor}={}){
 const menu=$('#menu');menuReturn=document.activeElement;
 menu.innerHTML=items.map(x=>x==='-'?'<div class="menu-sep" role="separator"></div>':`<button class="menu-item${x.danger?' danger':''}" role="menuitem" tabindex="-1" data-action="${x.action}" data-id="${esc(x.id)}"${x.quick?` data-quick="${esc(x.quick)}"`:''}><span>${esc(x.label)}</span>${x.key?`<kbd>${x.key}</kbd>`:''}</button>`).join('');
 menu.hidden=false;anchor?.setAttribute('aria-expanded','true');menu.anchor=anchor||null;
 const r=anchor?.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight;let left=r?r.right-w:x,top=r?r.bottom+4:y;
 if(left+w>innerWidth-8)left=innerWidth-w-8;if(top+h>innerHeight-8)top=r?r.top-h-4:innerHeight-h-8;
 menu.style.left=Math.max(8,left)+'px';menu.style.top=Math.max(8,top)+'px';
 menu.querySelector('.menu-item')?.focus();
}
function closeMenu(restore=true){const menu=$('#menu');if(!menu||menu.hidden)return;menu.hidden=true;menu.innerHTML='';menu.classList.remove('rail-menu');menu.setAttribute('aria-label',tr('操作'));menu.anchor?.setAttribute('aria-expanded','false');menu.anchor=null;if(restore&&menuReturn?.isConnected)menuReturn.focus();menuReturn=null;}
document.addEventListener('pointerdown',e=>{if(!$('#menu').hidden&&!e.target.closest('#menu,[data-action="asset-menu"],#sidebar .nav-more'))closeMenu(false);},true);
document.addEventListener('keydown',e=>{
 const menu=$('#menu');if(menu.hidden)return;
 const items=[...menu.querySelectorAll('.menu-item')],at=items.indexOf(document.activeElement);
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeMenu();return;}
 if(e.key==='Tab'){closeMenu(false);return;}
 if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();return;}
 if(e.key.length===1&&!e.metaKey&&!e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();const hit=items.find(n=>n.querySelector('kbd')?.textContent.toLowerCase()===e.key.toLowerCase());if(hit)hit.click();}
},true);
document.addEventListener('contextmenu',e=>{
 const item=e.target.closest?.('#board [data-asset]'),a=item&&state.assets.find(x=>x.id===item.dataset.asset);if(!a||gesture)return;
 e.preventDefault();openMenu(assetMenuItems(a,true),{x:e.clientX,y:e.clientY});
});
addEventListener('scroll',()=>closeMenu(false),{passive:true});
// 手动录入 is the default and says nothing, so the detail names a source only for what came from elsewhere.
function shownSource(a){return !a.source||a.source==='manual'?'':sourceLabel(a);}
function sourceLabel(a){if(a.syncMissing)return tr('{source} 本次未返回',{source:a.source==='github'?'GitHub':'Cloudflare'});if(a.source==='github')return tr('GitHub 仓库 · {status}',{status:a.syncStatus?tr(a.syncStatus):tr('状态未知')});if(a.source==='cloudflare')return `Cloudflare ${a.resourceKind||'Zone'} · ${a.syncStatus?tr(a.syncStatus):tr('状态未知')}`;return {manual:tr('手动录入'),agent:tr('外部工具添加'),demo:tr('演示资产'),ssh:'~/.ssh/config',csv:a.importedFrom?tr('{file} 导入',{file:a.importedFrom}):tr('表格导入')}[a.source]||tr('导入');}
function dateText(a){const status=assetDateStatus(a);if(status.level==='none')return a.date||tr('待补充');return [status.label.startsWith(status.date)?status.label:`${status.date} · ${status.label}`,billingCycles[a.cycle]?billingCycles[a.cycle].label:''].filter(Boolean).join(' · ');}
// Manual display order from the inspector menu: bring one record to the front of its category, or go back to recency order.
function manualOrder(type){return !!state.cardOrder?.[type]?.length;}
function pinFront(id){const a=state.assets.find(x=>x.id===id);if(!a||a.hiddenAt)return;checkpoint();state.cardOrder||={};state.cardOrder[a.type]=bringToFront(state.cardOrder[a.type],id);save();render();if(activeAsset===id)showDetail(id);toast(tr('已放到最前'),true);}
function autoOrder(id){const a=state.assets.find(x=>x.id===id);if(!a||!manualOrder(a.type))return;checkpoint();if(state.cardOrder)delete state.cardOrder[a.type];save();render();if(activeAsset===id)showDetail(id);toast(tr('已恢复自动排序'),true);}
// The inspector: one primary action (打开 when there is a management link, otherwise 编辑), category quick actions, the rest behind ⋯.
// Opening by keyboard, or as an overlay on a narrow window, moves focus into it; a click on a wide window leaves focus on the row so ↑/↓ keep browsing.
// When a record was last synced or imported, with how long ago once that is more than a day.
function syncedText(at){const days=localDay()-localDay(new Date(at));return `${new Date(at).toLocaleString(trLocale())}${days>1?` · ${tr('{n} 天前',{n:days})}`:''}`;}
function showDetail(id,{focus}={}){
 const a=state.assets.find(a=>a.id===id);if(!a)return;
 const wasOpen=!$('#detail').hidden,active=document.activeElement,inside=!!active?.closest?.('#detail');if(active&&!active.closest?.('#detail,#menu'))lastFocus=active;
 activeAsset=id;
 const link=safeManagementUrl(a.url),realLink=link&&new URL(link).hostname!=='example.com',lastSync=a.syncedAt&&!isNaN(Date.parse(a.syncedAt))?syncedText(a.syncedAt):'';
 const sub=assetProfiles[a.type]?[regionFlag(a.region),identityText(a)].filter(Boolean).join(' '):[a.provider,veilAccount(a.account)].filter(Boolean).join(' · ');
 const primary=a.hiddenAt?`<button class="button primary" data-action="restore-asset" data-id="${esc(id)}">${tr('恢复显示')}</button>`:realLink?`<button class="button primary" data-action="external" data-id="${esc(id)}" title="${tr('打开管理页')}">${ui('external')}${tr('打开')}</button>`:'';
 const renew=renewable(a)?`<button class="button" data-action="renew" data-id="${esc(id)}" title="${tr('{action}（R）',{action:renewWord(a)})}">${renewWord(a)}</button>`:'';
 const actions=`<div class="detail-actions main-actions">${primary}<button class="button${primary?'':' primary'}" data-action="edit-asset" data-id="${esc(id)}">${tr('编辑')}</button>${renew}<button class="button icon-only detail-more" data-action="asset-menu" data-id="${esc(id)}" aria-haspopup="menu" aria-expanded="false" aria-label="${tr('更多操作')}" title="${tr('更多操作')}">${ui('more')}</button></div>`;
 const source={cloudflare:nativeStore&&!proOff?tr('同步自 Cloudflare。账号和状态下次同步按平台值更新，你改过的名称会保留；Cloudflare 上新增的域名在「文件 → 同步 Cloudflare…」重新同步后出现。'):tr('同步自 Cloudflare。账号和状态下次同步按平台值更新，你改过的名称会保留。'),github:tr('同步自 GitHub，名称和账号下次同步会按平台值更新。'),ssh:tr('来自 ~/.ssh/config，名称和主机下次导入会按配置更新。'),csv:tr('从{file}导入；再导入同一份文件时，同名默认跳过。',{file:a.importedFrom||tr('表格')}),manual:'',demo:tr('演示数据，不代表实际账户。')}[a.source]??'';
 const notes=a.notes||source?`<details><summary>${a.notes?tr('备注'):tr('来源')}${a.notes&&source?' · '+tr('来源'):''}</summary>${a.notes?`<p>${esc(a.notes)}</p>`:''}${source?`<p>${source}</p>`:''}</details>`:'';
 const iconButton=nativeStore&&!demoMode&&!a.hiddenAt&&!hasRealIcon(a)?(iconFetching.has(id)?`<button class="text-button detail-icon-fetch" disabled>${tr('获取中…')}</button>`:`<button class="text-button detail-icon-fetch" data-action="icon-fetch" data-id="${esc(id)}" title="${esc(iconHost(a)?tr('从 {site} 获取网站图标',{site:iconSiteFor(iconSites(),iconHost(a))}):tr('填写网站域名获取图标'))}">${tr('获取图标')}</button>`):'';
 $('#detail-content').innerHTML=`<div class="detail-head">${tile(a,'lg')}<span class="eyebrow">${esc(cats[a.type].one)}${a.stopped?' · '+tr('已停用'):''}${a.hiddenAt?' · '+tr('已隐藏'):''}</span>${iconButton}</div><h2>${esc(veil(a.name))}</h2>${sub?`<p class="detail-sub">${esc(sub)}</p>`:''}${a.purpose?`<span class="detail-badge">${esc(a.purpose)}</span>`:''}${actions}${a.hiddenAt?'':quickRow(a)}<div class="facts">${detailFacts(a,lastSync)}${extraFacts(a)}${keepFacts(a)}</div>${paymentsSection(a)}${linkSection(a)}${notes}`;
 $('#detail').hidden=false;markSelected();
 if(focus??(wasOpen?inside:!inspectorDocked()))$('#close-detail').focus();
}
// Masked values reveal on request; the full value never appears in the list.
function secret(full,masked){return full&&masked&&masked!==full?`<span class="secret" data-full="${esc(full)}" data-masked="${esc(masked)}">${esc(masked)}</span><button class="text-button reveal" data-action="reveal" aria-pressed="false">${tr('显示')}</button>`:esc(full||'');}
const DATE_FACTS=['下一日期','下次扣款','保号','有效期'].map(k=>tr(k));
function detailFacts(a,lastSync){
 // A date row stays on one line; when the inspector is too narrow its end is cut and the whole text is the tip.
 const row=([k,html])=>DATE_FACTS.includes(k)?`<div class="fact fact-date"><span>${k}</span><span title="${esc(html.replace(/<[^>]*>/g,''))}">${html}</span></div>`:`<div class="fact"><span>${k}</span><span>${html}</span></div>`,text=value=>esc(value||'');
 if(!assetProfiles[a.type]){const list=assetIps(a),net=list.length?`<div class="fact"><span>${tr('网络')}</span><span class="ip-pills">${list.map(x=>`<button class="ip-pill" data-action="copy-ip" data-ip="${esc(x.ip)}" title="${tr('复制 IP')}" aria-label="${tr('复制 IP {ip}',{ip:esc(veilIp(x.ip))})}">${x.inner?`<em>${tr('内')}</em>`:''}${esc(veilIp(x.ip))}</button>`).join('')}</span></div>`:'';return [[tr('保留原因'),a.reason],[tr('费用'),costText(a)],[tr('下一日期'),a.date?dateText(a):''],[tr('自动续费'),AUTO_RENEW_WORDS[a.autoRenew]&&a.source!=='manual'?AUTO_RENEW_WORDS[a.autoRenew]:''],['SSH',a.type==='server'&&a.host?`${a.sshUser?a.sshUser+'@':''}${veil(a.host)}${a.sshPort?':'+a.sshPort:''}`:''],[tr('本机目录'),a.type==='repository'?a.localPath:''],[tr('DNS 托管'),a.type==='domain'?a.dnsHost:''],[tr('备案'),a.type==='domain'&&a.icp?a.icp+(a.stopped||a.hiddenAt||['overdue'].includes(assetDateStatus(a).level)?' · '+tr('不用了先注销备案'):''):''],[tr('来源'),shownSource(a)],...(lastSync?[[syncedLabel(a),lastSync]]:[])].filter(([,v])=>v).map(([k,v])=>row([k,esc(v)])).join('')+net;}
 const region=a.region?`${regionFlag(a.region)} ${regionName(a.region)}`:'',when=a.date?dateText(a):'',count=['appleid','google'].includes(a.type)?verifyNumbers(state.assets,a).length:0,numbers=count===1?tr('1 个（唯一）'):count?tr('{n} 个',{n:count}):'';
 const rows={
  bankcard:[[tr('地区'),text(region)],[tr('状态'),text(CARD_STATUSES[a.cardStatus])],[tr('费用'),text(costText(a))],[tr('有效期'),a.date?esc(`${expiryText(a.date)} · ${assetDateStatus(a).label}`):text('')],[tr('发卡行'),text(a.provider)],[tr('账户备注'),text(veilAccount(a.account))]],
  phone:[[tr('地区'),text(region)],[tr('号码'),secret(a.phone,maskPhone(a.phone))],[tr('状态'),text(PHONE_STATUSES[a.phoneStatus])],[tr('运营商'),text(a.provider)],[tr('保号'),text(when)],[tr('费用'),text(costText(a))],[tr('实名或用途'),text(veilAccount(a.account))]],
  appleid:[[tr('地区'),text(region)],[tr('登录邮箱'),secret(a.account,maskEmail(a.account))],[tr('验证号码'),text(numbers)],[tr('下一日期'),text(when)],[tr('费用'),text(costText(a))]],
  google:[[tr('地区'),text(region)],[tr('登录邮箱'),secret(a.account,maskEmail(a.account))],[tr('验证号码'),text(numbers)],[tr('下一日期'),text(when)],[tr('费用'),text(costText(a))]],
  ai:[[tr('费用'),text(costText(a))],[a.creditExpiry?tr('额度过期'):tr('下次扣款'),a.creditExpiry&&when?`<span title="${tr('预付额度购买 1 年后过期，不能延期；按最近一笔购买算')}">${text(when)}</span>`:text(when)],[tr('登录账号'),secret(a.account,maskEmail(a.account))]]
 }[a.type];
 return [...rows,...(a.reason?[[tr('保留原因'),esc(a.reason)]]:[]),[tr('来源'),esc(shownSource(a))]].filter(([,v])=>v).map(row).join('');
}
// 重要程度, 找回 and 备份 for the types they apply to, and for a domain the accounts whose login address is on it (research round 4).
function keepFacts(a){
 const row=(k,html,title='')=>`<div class="fact"><span>${k}</span><span${title?` title="${esc(title)}"`:''}>${html}</span></div>`,out=[];
 if(IMPORTANCE[a.importance])out.push(row(tr('重要程度'),esc(IMPORTANCE[a.importance])+(a.importance==='disposable'?` · <span class="quiet-fact">${tr('不发通知')}</span>`:'')));
 const rec=recoveryText(a),gap=recoveryGap(a);
 if(rec)out.push(row(tr('找回'),esc(rec)+(gap?`<br><span class="quiet-fact">${esc(gap)}</span>`:'')));
 const backup=backupText(a);
 if(backup)out.push(row(tr('备份'),esc(backup),a.backup==='snapshot'?tr('快照和实例在同一平台：实例释放、快照过期或账号出事时会一起没，不等于异地备份'):''));
 const deps=mailDependents(state.assets,a);
 if(deps.length)out.push(row(tr('邮箱'),tr('{n} 个账号的登录邮箱在这个域名上：{names}',{n:formatCount(deps.length),names:esc(deps.slice(0,3).map(displayName).join(tr('、')))+(deps.length>3?tr(' 等'):'')}),tr('域名过期后它的邮箱收不到信，这些账号的找回邮件也就收不到')));
 return out.join('');
}
// Links grouped by what they mean from this record's side (付款卡, 登录账号, 所在服务器…); a server keeps its mounts by category.
// Payment or verification at risk (an expiring card, a number near its keep date) heads the section.
function linkGroupTitle(a,x){const k=linkKind(a,x);return k.kind==='mount'&&a.type==='server'?cats[x.type].name:k.label;}
// The picker offers a server's mounts before its account (linking a domain is the common case); the detail lists the account first.
function linkGroups(a,list,{picker=false}={}){
 const groups=new Map(),rank=x=>{const k=linkKind(a,x),order=(picker&&a.type==='server'&&k.kind==='own'?LINK_KIND_ORDER.indexOf('mount')+.5:LINK_KIND_ORDER.indexOf(k.kind))*10;return k.kind==='mount'&&a.type==='server'?order+Math.max(0,['domain','repository','database','license'].indexOf(x.type)):order;};
 for(const x of [...list].sort((l,r)=>rank(l)-rank(r))){const title=linkGroupTitle(a,x);if(!groups.has(title))groups.set(title,[]);groups.get(title).push(x);}
 return groups;
}
function riskText(r){const who=r.source.type==='bankcard'?tr('付款卡 {name}',{name:r.source.last4?'•••• '+r.source.last4:displayName(r.source)}):tr('验证手机号 {name}',{name:displayName(r.source)});return `${who}${r.via?r.via.type==='phone'?tr('（付号码 {name} 的月费）',{name:displayName(r.via)}):r.via.type==='subscription'?tr('（经 {name}）',{name:displayName(r.via)}):tr('（登录账号 {name}）',{name:displayName(r.via)}):''} ${r.label}`;}
function linkRiskHtml(a){
 const risks=linkRisks(state.assets,a),impact=linkImpact(state.assets,a),own=sourceTrouble(a)||assetDateStatus(a);
 // The only number of an account at risk is red whatever its date says: without it the account cannot be signed into (G3).
 const sole=verifyNumbers(state.assets,a).length===1;
 const lines=risks.map(r=>`<p class="link-risk ${(r.kind==='verify'&&(sole||r.via))||r.via?.type==='phone'?'overdue':r.level}"><button class="text-button" data-action="detail" data-id="${esc(r.source.id)}">${esc(riskText(r))}</button>${r.via?.type==='phone'?tr('，月费扣不成号码会被取消，那是这个账号唯一的验证号码'):r.via&&r.via.type!=='subscription'?(r.kind==='pay'?tr('，经这个账号扣的费可能失败'):tr('，这是这个账号唯一的验证号码，账号登不进去它也用不了')):r.kind==='pay'?(a.type==='phone'?tr('，月费可能扣不成，扣不成号码会被取消'):tr('，自动续费可能失败')):sole?tr('，可能收不到验证码。这是唯一的验证号码，收不到就登不进去'):tr('，可能收不到验证码')}</p>`);
 if(a.type==='bankcard'&&!a.hiddenAt&&impact.length){
  const look=cardOutlook(state.assets,a);
  if(look.missed.length)lines.unshift(`<p class="link-risk overdue">${tr('最近 60 天有 {n} 笔没扣成：{names}。卡可能被停用或被拒，挂在上面的账号会跟着出问题',{n:formatCount(look.missed.length),names:esc([...new Set(look.missed.map(m=>displayName(m.asset)))].slice(0,3).join(tr('、')))})}</p>`);
  // A number the card pays for that is some account's only one: when the card fails the number goes, and those accounts with it (C10).
  for(const phone of impact.filter(x=>x.type==='phone')){const only=phoneReach(state.assets,phone).only;if(only.length)lines.push(`<p class="link-risk${['soon','overdue'].includes(own.level)?' '+own.level:''}">${tr('它付月费的号码 {phone} 是 {n} 个账号唯一的验证号码：{names}。卡出问题，号码和这些账号会跟着出问题',{phone:esc(displayName(phone)),n:formatCount(only.length),names:esc(only.slice(0,3).map(displayName).join(tr('、')))+(only.length>3?tr(' 等'):'')})}</p>`);}
  if(look.upcoming.length)lines.push(`<p class="link-risk quiet">${tr('未来 30 天要扣 {n} 笔',{n:formatCount(look.upcoming.length)})}${look.totals.length?tr('，约 {money}',{money:esc(moneyLine(look.totals))}):''}${tr('：')}${esc(look.upcoming.slice(0,4).map(u=>`${u.due.slice(5)} ${displayName(u.asset)}`).join(tr('、')))}${look.upcoming.length>4?tr(' 等'):''}</p>`);
 }
 // An empty list only means nothing is linked yet: say so, and name what probably belongs here, so "no impact" is not read into it.
 if(!impact.length&&['bankcard','phone'].includes(a.type)&&!a.hiddenAt){
  const card=a.type==='bankcard',guess=card?state.assets.filter(x=>!x.hiddenAt&&!x.stopped&&!['bankcard','phone'].includes(x.type)&&billingTypeOf(x)==='recurring'&&linkAllowed(x,a)&&!linkedAssets(state.assets,x).some(y=>y.type==='bankcard')):[];
  lines.push(`<p class="link-risk quiet">${card?tr('还没记它支付哪些项，停卡前这里列不出影响'):tr('还没记哪些账号靠它收验证码，停号前这里列不出影响')}${guess.length?tr('。按周期付费、还没记付款卡的有 {n} 项：{names}',{n:formatCount(guess.length),names:esc(guess.slice(0,3).map(displayName).join(tr('、')))+(guess.length>3?tr(' 等'):'')}):''}</p>`);
 }
 // A number that is some account's only one: losing it locks those accounts and what signs in through them (M2).
 if(a.type==='phone'&&impact.length){
  const reach=phoneReach(state.assets,a),names=list=>esc(list.slice(0,3).map(displayName).join(tr('、')))+(list.length>3?tr(' 等'):'');
  if(reach.only.length)lines.push(`<p class="link-risk${['soon','overdue'].includes(own.level)?' '+own.level:''}">${tr('它是 {n} 个账号唯一的验证号码：{names}。',{n:formatCount(reach.only.length),names:names(reach.only)})}${reach.via.length?tr('号码丢了，这些账号和经它们登录的 {n} 项（{names}）都可能登不进去',{n:formatCount(reach.via.length),names:names(reach.via)}):tr('号码丢了，这些账号都可能登不进去')}${reach.backed.length?tr('；另外 {n} 个账号还有别的验证号码',{n:formatCount(reach.backed.length)}):''}${carrierNote(a)?`${tr('。')}${esc(carrierNote(a))}`:''}</p>`);
 }
 // A domain whose mail some accounts sign in with (Y8, Y9): its expiry takes their password resets; its own registrar account on
 // its own mail cannot be got back into once it lapses.
 if(a.type==='domain'&&!a.hiddenAt){
  const deps=mailDependents(state.assets,a),self=selfRecovery(a),late=['soon','overdue'].includes(own.level);
  if(late&&(deps.length||self))lines.unshift(`<p class="link-risk ${own.level}">${tr('{status}，过期后这个域名的邮箱收不到信：',{status:esc(own.label)})}${deps.length?tr('{n} 个账号的找回邮件会收不到',{n:formatCount(deps.length)}):''}${deps.length&&self?tr('，'):''}${self?tr('注册商账号也用这个邮箱登录，过期后就找回不了'):''}</p>`);
  else if(self)lines.push(`<p class="link-risk quiet">${tr('注册商账号的登录邮箱就在这个域名上：域名一过期，找回邮件也收不到。换成别的域名的邮箱更稳')}</p>`);
 }
 if(impact.length&&['soon','overdue'].includes(own.level))lines.unshift(`<p class="link-risk ${own.level}">${(()=>{const vars={status:esc(own.label),n:formatCount(impact.length),names:esc(impact.slice(0,3).map(displayName).join(tr('、')))+(impact.length>3?tr(' 等'):'')};return a.type==='bankcard'?tr('{status}，它支付的 {n} 项自动续费可能失败：{names}',vars):a.type==='phone'?(a.stopped?tr('{status}，靠它验证的 {n} 项可能收不到验证码；停用的号码会被运营商回收给别人，先把这些账号换成别的号码：{names}',vars):tr('{status}，靠它验证的 {n} 项可能收不到验证码：{names}',vars)):tr('{status}，用它登录的 {n} 项可能跟着登不进去：{names}',vars);})()}</p>`);
 return lines.join('');
}
function linkSection(a){
 const links=linkedAssets(state.assets,a),groups=linkGroups(a,links);
 const servers=links.filter(x=>x.type==='server'&&relationKind(a,x)==='mount').length;
 const row=x=>{
  const kind=relationKind(a,x),meta=kind==='mount'&&x.type==='server'?linkMetaOf(a,x.id):a.type==='server'&&kind==='mount'?linkMetaOf(x,a.id):null;
  const tags=kind==='mount'&&x.type==='server'?`${servers>1?`<button class="link-tag" data-action="link-standby" data-id="${esc(a.id)}" data-target="${esc(x.id)}" aria-pressed="${meta.standby}" title="${meta.standby?tr('备用服务器，点按改回主用'):tr('点按标为备用服务器')}">${tr('备用')}</button>`:''}${a.type==='domain'?`<button class="link-tag" data-action="link-proxy" data-id="${esc(a.id)}" data-target="${esc(x.id)}" aria-pressed="${meta.proxied}" title="${tr('经 Cloudflare 代理')}">${tr('代理')}</button>`:''}`
   :[a.type,x.type].sort().join()==='bankcard,phone'?(()=>{const on=cardPaysPhone(a,x);return `<button class="link-tag" data-action="link-pays" data-id="${esc(a.id)}" data-target="${esc(x.id)}" aria-pressed="${on}" title="${on?tr('这张卡付这个号码的月费，点按取消'):tr('点按标为这张卡付这个号码的月费：卡出问题，号码和只靠它验证的账号会跟着标出风险')}">${tr('付月费')}</button>`;})()
   :meta&&(meta.standby||meta.proxied)?`${meta.standby?`<span class="link-tag on" title="${tr('备用服务器')}">${tr('备用')}</span>`:''}${meta.proxied?`<span class="link-tag on" title="${tr('经 Cloudflare 代理')}">${tr('代理')}</span>`:''}`:'';
  const sub=[cats[x.type].one,x.type==='server'?primaryIp(x)?.ip:'',identityText(x),x.hiddenAt?tr('已隐藏'):''].filter(Boolean).join(' · ');
  return `<div class="link-row${x.hiddenAt?' is-hidden':''}"><button class="link-open" data-action="detail" data-id="${esc(x.id)}">${assetMark(x)}<span><b>${esc([regionFlag(x.region),displayName(x)].filter(Boolean).join(' '))}</b><small>${esc(sub)}</small></span></button>${tags}<button class="icon-button" data-action="unlink" data-id="${esc(a.id)}" data-target="${esc(x.id)}" aria-label="${tr('取消关联 {name}',{name:esc(x.name)})}">×</button></div>`;
 };
 const body=[...groups].map(([title,list])=>`<div class="link-group" role="group" aria-label="${esc(title)}${tr('，')}${tr('{n} 项',{n:list.length})}"><span class="link-group-title">${esc(title)}<i>${list.length}</i></span>${list.slice(0,4).map(row).join('')}${list.length>4?`<details class="link-rest"><summary aria-label="${tr('另外 {n} 项',{n:list.length-4})}">+${list.length-4}</summary>${list.slice(4).map(row).join('')}</details>`:''}</div>`).join('');
 return `<section class="detail-links" aria-label="${tr('关联')}"><div class="detail-links-head"><strong>${tr('关联')}</strong><button class="text-button" data-action="link-picker" data-id="${esc(a.id)}" title="${esc(assetProfiles[a.type]?.links||tr('关联相关资产，例如付款的银行卡、登录的账号、所在的服务器'))}">${tr('＋ 关联')}</button></div>${linkRiskHtml(a)}${body}</section>`;
}
function linkPicker(id){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 const linked=new Set(linkedAssets(state.assets,a).map(x=>x.id)),order=linkOrder[a.type]||[],rank=type=>{const index=order.indexOf(type);return index<0?order.length:index;};
 // Grouped by what the link would mean (付款卡, 登录账号…), the meaningful kinds first and plain 相关 last.
 const options=state.assets.filter(x=>x.id!==id&&!linked.has(x.id)&&linkAllowed(a,x)).sort((left,right)=>rank(left.type)-rank(right.type)||left.name.localeCompare(right.name));
 const groups=linkGroups(a,options,{picker:true});
 const option=x=>`<button class="link-option" data-action="link" data-id="${esc(id)}" data-target="${esc(x.id)}" data-search="${esc(searchText(x))}">${assetMark(x)}<span>${esc([regionFlag(x.region),displayName(x)].filter(Boolean).join(' '))}<small>${esc([cats[x.type].one,x.type==='server'?primaryIp(x)?.ip:'',identityText(x)].filter(Boolean).join(' · '))}</small></span></button>`;
 modal(tr('关联到「{name}」',{name:a.name}),`<input id="link-search" class="link-search" placeholder="${tr('搜索名称、尾号、号码或地区')}" aria-label="${tr('搜索要关联的资产')}"><div class="link-options">${[...groups].map(([title,list])=>`<div class="link-option-group" role="group" aria-label="${esc(title)}"><span class="link-group-title">${esc(title)}</span>${list.map(option).join('')}</div>`).join('')||`<p class="form-note">${tr('没有可以关联的其他资产。')}</p>`}</div>`);
 $('#link-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.link-option').forEach(option=>option.hidden=!!q&&!option.dataset.search.includes(q));document.querySelectorAll('.link-option-group').forEach(group=>group.hidden=!group.querySelector('.link-option:not([hidden])'));};$('#link-search').focus();
}
// The Mac app downloads the icon from the site itself when asked; the page previews it and saves it only after confirmation.
let iconRequest=0,iconPreview=null;
function iconDialog(id){
 const a=state.assets.find(x=>x.id===id);if(!a||!nativeStore)return;
 const current=siteIconSrc(a);iconPreview=null;
 modal(tr('「{name}」的网站图标',{name:a.name}),`<form id="icon-form" class="form" data-id="${esc(id)}"><label>${tr('网站域名')}<input name="host" required maxlength="253" autocomplete="off" value="${esc(a.siteIconHost||iconSiteFor(iconSites(),iconHost(a)))}" placeholder="${tr('例如 wise.com')}"></label><div class="icon-preview" id="icon-preview" aria-live="polite">${current?`<img src="${current}" alt="${tr('当前图标')}">`:''}<span id="icon-status" class="form-note">${current?tr('当前图标来自 {host}。',{host:esc(a.siteIconHost||tr('网站'))}):tr('图标直接从这个网站下载，不经过其他服务，只保存在此 Mac。')}</span></div><div class="confirm-actions"><button class="button" type="submit">${tr('获取')}</button><button class="button primary" type="button" data-action="icon-apply" data-id="${esc(id)}" disabled>${tr('使用这个图标')}</button>${a.siteIcon?`<button class="button danger-quiet" type="button" data-action="icon-remove" data-id="${esc(id)}">${tr('移除')}</button>`:''}</div><button class="text-button icon-batch-link" type="button" data-action="icon-batch">${tr('为全部资产获取网站图标…')}</button></form>`);
 $('#icon-form [name="host"]').focus();
}
window.assetboardIconResult=result=>{
 if(agentIconRequests.has(result?.requestId)){agentIconReply(result);return;}
 if(autoIconRequests.has(result?.requestId)){autoIconReply(result);return;}
 if(iconBatch?.pending.has(result?.requestId)){iconBatchReply(result);return;}
 if(iconRowRequests.has(result?.requestId)){iconRowReply(result);return;}
 if(result?.requestId!==iconRequest||!$('#icon-form'))return;
 $('#icon-form [type="submit"]').disabled=false;
 const valid=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 if(!valid){$('#icon-status').textContent=result.error||tr('没有获取到可用的图标。');return;}
 iconPreview={host:String(result.host||''),dataUrl:result.dataUrl};
 $('#icon-preview').innerHTML=`<img src="${result.dataUrl}" alt="${tr('获取到的图标')}"><span id="icon-status" class="form-note">${tr('来自 {host}。确认后替换卡片上的图标。',{host:esc(iconPreview.host)})}</span>`;
 $('[data-action="icon-apply"]').disabled=false;$('[data-action="icon-apply"]').focus();
};
document.addEventListener('submit',e=>{if(e.target.id!=='icon-form')return;e.preventDefault();const host=e.target.elements.host.value.trim();if(!host||!nativeStore)return;iconPreview=null;$('[data-action="icon-apply"]').disabled=true;e.target.querySelector('[type="submit"]').disabled=true;$('#icon-status').textContent=tr('正在从 {host} 获取…',{host});window.webkit.messageHandlers.assetboard.postMessage({action:'iconFetch',requestId:++iconRequest,host});});
// 「获取网站图标」(DESIGN-PRINCIPLES §9 rule 16): native only, started by the person. Demo mode opens it too but never reaches the network.
// One row per platform with the icon its assets show now (the category globe when none), so a missing or wrong icon is plain to see.
// A row can be fetched again on its own, or from a site the person names for that platform (state.iconSites, kept for later fetches,
// automatic ones included; cleared back to the platform's own homepage from the same row). 开始 runs every row that needs it:
// three requests at a time, one per platform, shared by its assets; results are applied together after the run, behind one checkpoint,
// so a single undo removes them all. A row's own fetch applies to that row's assets at once, also undoable. Failures stay in the row.
const ICON_BATCH_LIMIT=3,ICON_BATCH_TIMEOUT=30000;let iconBatch=null,iconBatchOverwrite=false;
// This launch only: a platform's last failure (shown in its row until a fetch works), each row's request in flight, the row being edited.
const iconFailures=new Map(),iconRowRequests=new Map();let iconRowEditing=null;
if(demoMode)for(const [host,reason] of Object.entries(window.assetboardDemoIconFailures||{}))iconFailures.set(host,reason);
Object.assign(uiGlyphs,{link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',reset:'<path d="M4.8 14.5A7.5 7.5 0 1 0 6.6 6.6L4 9.2"/><path d="M4 4.5v4.7h4.7"/>'});
function iconSites(){return state.iconSites&&typeof state.iconSites==='object'&&!Array.isArray(state.iconSites)?state.iconSites:{};}
function iconFailReason(error){error=String(error||'');return error==='超时'?tr('超时，没有回应'):/无法连接|Cannot connect/.test(error)?tr('连不上（站点拒绝自动访问或网络不通）'):/没有在|No usable icon was found on/.test(error)?tr('官网没有可下载的图标'):error||tr('没有获取到可用的图标');}
// Every icon request from the page goes through here. Demo mode answers with a built-in demo mark (demo-data.js) and sends nothing.
function iconFetchPost(requestId,host){if(demoMode){setTimeout(()=>window.assetboardIconResult({requestId,ok:true,host,dataUrl:window.assetboardDemoIcon?.(host)||''}),300);return;}window.webkit.messageHandlers.assetboard.postMessage({action:'iconFetch',requestId,host});}
// Icons already on this Mac, by platform; skipped when the person asks to replace icons, since that means fetching fresh ones.
function iconCache(){const cache=new Map();if(iconBatchOverwrite)return cache;for(const [host,src] of knownSiteIcons())cache.set(host,src);return cache;}
function iconRowHtml(r){
 const src=siteIconSrc({siteIcon:r.icon}),tone=src?markTone(src):'',busy=[...iconRowRequests.values()].some(q=>q.host===r.host),failed=!busy&&iconFailures.get(r.host),edit=iconRowEditing?.host===r.host&&!busy?iconRowEditing:null,h=esc(r.host);
 const tile=`<span class="tile ${src?'custom-art site-art':'type-art'}${tone?' '+tone:''}" ${src?`role="img" aria-label="${tr('{host} 当前的图标',{host:h})}"`:'aria-hidden="true"'}>${src?`<img src="${src}" alt="" draggable="false">`:icon('domain')}</span>`;
 const partial=r.have.length&&r.have.length<r.ids.length,count=`<span class="chip${partial?' partial':''}" title="${tr('{n} 项',{n:r.ids.length})}${r.have.length?tr('，{n} 项已有图标',{n:r.have.length}):''}">${partial?`${formatCount(r.have.length)}/${formatCount(r.ids.length)}`:tr('{n} 项',{n:formatCount(r.ids.length)})}</span>`;
 if(edit)return `<li data-platform="${h}" class="editing">${tile}<form class="icon-site-form" data-platform="${h}" novalidate><div class="icon-site-field"><input name="site" value="${esc(edit.value||'')}" placeholder="${tr('{host} 的官网网址',{host:h})}" aria-label="${tr('{host} 的官网网址',{host:h})}" autocomplete="off" spellcheck="false" autocapitalize="off" inputmode="url"${edit.error?` aria-invalid="true" aria-describedby="icon-site-error"`:''}>${edit.error?`<small class="icon-row-error" id="icon-site-error" role="alert">${esc(edit.error)}</small>`:''}</div><button class="icon-button" type="submit" title="${tr('从这个官网获取')}" aria-label="${tr('从这个官网获取 {host} 的图标',{host:h})}">${ui('check')}</button>${r.custom?`<button class="icon-button" type="button" data-action="icon-site-clear" data-id="${h}" title="${tr('恢复默认官网 {host}',{host:h})}" aria-label="${tr('恢复默认官网 {host}',{host:h})}">${ui('reset')}</button>`:''}<button class="icon-button" type="button" data-action="icon-site-cancel" data-id="${h}" title="${tr('取消')}" aria-label="${tr('取消指定官网')}">×</button></form></li>`;
 const sub=busy?`<small class="icon-row-note">${tr('正在从 {host} 获取…',{host:esc([...iconRowRequests.values()].find(q=>q.host===r.host).site)})}</small>`:failed?`<small class="icon-row-error">${ui('warn')}${esc(failed)}</small>`:r.custom?`<small class="icon-row-note" title="${tr('这个平台的图标从 {site} 获取',{site:esc(r.site)})}">${ui('link')}${esc(r.site)}</small>`:'';
 return `<li data-platform="${h}"${busy?' aria-busy="true" class="busy"':failed?' class="failed"':''}>${tile}<span class="icon-row-main"><strong>${h}</strong>${sub}</span>${count}<div class="icon-row-actions"><button class="icon-button${busy?' spin':''}" data-action="icon-row-fetch" data-id="${h}" title="${src?tr('重新获取 {host} 的图标',{host:esc(r.site)}):tr('获取 {host} 的图标',{host:esc(r.site)})}" aria-label="${src?tr('重新获取 {host} 的图标',{host:h}):tr('获取 {host} 的图标',{host:h})}"${busy||iconBatch?' disabled':''}>${ui('refresh')}</button><button class="icon-button" data-action="icon-site-edit" data-id="${h}" title="${tr('指定官网')}${r.custom?tr('（现在是 {site}）',{site:esc(r.site)}):''}" aria-label="${tr('为 {host} 指定官网',{host:h})}"${busy?' disabled':''}>${ui('link')}</button></div></li>`;
}
// The lead follows the UI language, like every other label: 「N 项待获取」, or "N to fetch" in English.
function iconLeadText(n){return tr('<strong>{n}</strong> 项待获取',{n:formatCount(n)});}
function iconBatchDialog(keep=false){
 if(!nativeStore&&!demoMode){toast(tr('网站图标只能在 Mac App 里获取'));return;}
 if(iconBatch)return;
 if(!keep)iconRowEditing=null;
 const plan=iconPlan(state.assets,{overwrite:iconBatchOverwrite}),cache=iconCache(),rows=iconRows(state.assets,{sites:iconSites()}),fetchHosts=plan.hosts.filter(h=>!cache.has(h.host)),assetsCount=plan.hosts.reduce((n,h)=>n+h.ids.length,0),existing=iconPlan(state.assets,{overwrite:true}).hosts.reduce((n,h)=>n+h.ids.length,0)-iconPlan(state.assets).hosts.reduce((n,h)=>n+h.ids.length,0);
 const skips=[plan.skipped.unknown&&tr('{n} 项没有识别出平台',{n:formatCount(plan.skipped.unknown)}),plan.skipped.existing&&tr('{n} 项已有网站图标',{n:formatCount(plan.skipped.existing)}),plan.skipped.custom&&tr('{n} 项用的是自定义图标',{n:formatCount(plan.skipped.custom)}),plan.skipped.hidden&&tr('{n} 项已隐藏',{n:formatCount(plan.skipped.hidden)})].filter(Boolean),skipCount=(plan.skipped.unknown||0)+(plan.skipped.existing||0)+(plan.skipped.custom||0)+(plan.skipped.hidden||0);
 const busy=iconRowRequests.size>0;
 modal(tr('获取网站图标'),`<div id="icon-batch" class="form">${plan.hosts.length?`<p class="icon-batch-lead">${iconLeadText(assetsCount)}</p>`:rows.length?`<p class="icon-batch-lead">${tr('都已有图标')}</p>`:`<p class="form-note">${tr('没有需要获取图标的资产')}</p>`}${rows.length?`<ul class="icon-batch-hosts" aria-label="${tr('平台官网')}">${rows.map(iconRowHtml).join('')}</ul>`:''}
 ${existing?`<label class="check-row"><input type="checkbox" id="icon-batch-overwrite" ${iconBatchOverwrite?'checked':''}><span>${tr('替换已有图标（{n} 项）',{n:formatCount(existing)})}</span></label>`:''}
 ${rows.length?`<p class="form-note icon-batch-net">${ui('lock')}${tr('只访问列出的平台官网或你为它指定的官网，不带 Cookie，不发送资产信息')}</p>`:''}
 ${skips.length?`<details class="icon-skip"><summary>${tr('不处理 {n} 项',{n:formatCount(skipCount)})}</summary><ul>${skips.map(s=>`<li>${s}</li>`).join('')}</ul></details>`:''}
 <div class="confirm-actions"><button class="button primary" data-action="icon-batch-start" ${plan.hosts.length&&!busy?'':'disabled'}>${fetchHosts.length?tr('开始'):tr('应用')}</button><button class="button" data-action="icon-batch-cancel">${plan.hosts.length?tr('取消'):tr('完成')}</button></div></div>`);
 $('#icon-batch-overwrite')?.addEventListener('change',e=>{iconBatchOverwrite=e.target.checked;iconBatchRefresh();$('#icon-batch-overwrite')?.focus();});
 if(!keep)(plan.hosts.length&&!busy?$('[data-action="icon-batch-start"]'):$('[data-action="icon-batch-cancel"]'))?.focus();
}
// Redraws the open dialog after a row changes, keeping a half-typed site and putting focus back in the row (or on `focus` in row `host`).
function iconBatchRefresh(host='',focus=''){
 if(iconBatch||!$('#modal').open||!$('#icon-batch .icon-batch-hosts'))return;
 const draft=$('#icon-batch .icon-site-form input');if(draft&&iconRowEditing)iconRowEditing.value=draft.value;
 const row=host||document.activeElement?.closest?.('#icon-batch li[data-platform]')?.dataset.platform;
 iconBatchDialog(true);
 const li=row&&$(`#icon-batch li[data-platform="${CSS.escape(row)}"]`);
 const target=li&&(li.querySelector(focus||'input')||li.querySelector('[data-action="icon-row-fetch"]:not(:disabled)')||li.querySelector('[data-action="icon-site-edit"]'));
 if(target){target.focus();if(target.tagName==='INPUT')target.setSelectionRange(target.value.length,target.value.length);}
}
function iconRowFetch(host,site=''){
 if(iconBatch||[...iconRowRequests.values()].some(q=>q.host===host))return;
 site=site||iconSiteFor(iconSites(),host);
 const requestId=++iconRequest;iconRowRequests.set(requestId,{host,site,edited:!!iconRowEditing&&iconRowEditing.host===host,timer:setTimeout(()=>iconRowReply({requestId,ok:false,error:'超时'}),ICON_BATCH_TIMEOUT)});
 if(iconRowEditing?.host===host)iconRowEditing=null;
 iconFailures.delete(host);iconBatchRefresh(host);
 iconFetchPost(requestId,site);
}
function iconRowReply(result){
 const q=iconRowRequests.get(result?.requestId);if(!q)return;
 iconRowRequests.delete(result.requestId);clearTimeout(q.timer);
 const src=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 if(!src){const reason=iconFailReason(result.error);if(q.edited){iconRowEditing={host:q.host,value:q.site,error:reason};}else iconFailures.set(q.host,reason);iconBatchRefresh(q.host);return;}
 const row=iconRows(state.assets,{sites:iconSites()}).find(r=>r.host===q.host),targets=(row?.ids||[]).map(id=>state.assets.find(a=>a.id===id)).filter(Boolean);
 checkpoint();
 for(const a of targets){a.siteIcon=src;a.siteIconHost=q.site;}
 const sites={...iconSites()};if(q.site===q.host)delete sites[q.host];else sites[q.host]=q.site;
 if(Object.keys(sites).length)state.iconSites=sites;else delete state.iconSites;
 iconFailures.delete(q.host);autoIconFailed.delete(q.site);
 save();render();if(activeAsset&&targets.some(a=>a.id===activeAsset))showDetail(activeAsset,{focus:false});
 iconBatchRefresh(q.host);
 toast(tr('{host}：{n} 项已换上图标',{host:q.host,n:formatCount(targets.length)}),true);
}
function iconSiteSubmit(form){
 const host=form.dataset.platform,value=form.elements.site.value,site=iconSiteHost(value);
 if(!site){iconRowEditing={host,value,error:value.trim()?tr('只接受 https 网址或域名，不接受 IP、本机名称或带账号的链接'):tr('填写官网网址或域名')};iconBatchRefresh(host,'input');return;}
 iconRowEditing={host,value,error:''};iconRowFetch(host,site);
}
function iconSiteClear(host){
 if(!Object.prototype.hasOwnProperty.call(iconSites(),host))return;
 checkpoint();const sites={...iconSites()};delete sites[host];if(Object.keys(sites).length)state.iconSites=sites;else delete state.iconSites;
 iconRowEditing=null;save();iconBatchRefresh(host,'[data-action="icon-site-edit"]');toast(tr('{host} 恢复默认官网',{host}),true);
}
document.addEventListener('submit',e=>{const form=e.target.closest?.('.icon-site-form');if(!form)return;e.preventDefault();iconSiteSubmit(form);});
// Esc in the site field closes the field, not the dialog.
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.isComposing||!e.target.closest?.('.icon-site-form'))return;e.preventDefault();e.stopImmediatePropagation();const host=e.target.closest('.icon-site-form').dataset.platform;iconRowEditing=null;iconBatchRefresh(host,'[data-action="icon-site-edit"]');},true);
function iconBatchStart(){
 if((!nativeStore&&!demoMode)||iconBatch||iconRowRequests.size)return;
 iconRowEditing=null;
 const plan=iconPlan(state.assets,{overwrite:iconBatchOverwrite}),cache=iconCache(),sites=iconSites();
 iconBatch={plan,sites,queue:plan.hosts.filter(h=>!cache.has(h.host)),pending:new Map(),done:[],failed:[],icons:new Map([...cache].filter(([host])=>plan.hosts.some(h=>h.host===host)))};
 iconBatch.total=iconBatch.queue.length;
 const dialog=$('#modal');dialog.addEventListener('close',iconBatchAbort,{once:true});
 $('#icon-batch').innerHTML=`<p class="form-note" id="icon-batch-status" aria-live="polite"></p><progress id="icon-batch-progress" max="${Math.max(1,iconBatch.total)}" value="0"></progress><div class="confirm-actions"><button class="button" data-action="icon-batch-cancel">${tr('停止')}</button></div>`;
 iconBatchPump();
}
function iconBatchPump(){
 const run=iconBatch;if(!run)return;
 while(run.pending.size<ICON_BATCH_LIMIT&&run.queue.length){
  const h=run.queue.shift(),requestId=++iconRequest;
  run.pending.set(requestId,{host:h,timer:setTimeout(()=>iconBatchReply({requestId,ok:false,error:'超时'}),ICON_BATCH_TIMEOUT)});
  iconFetchPost(requestId,iconSiteFor(run.sites,h.host));
 }
 const finished=run.done.length+run.failed.length;
 if($('#icon-batch-status'))$('#icon-batch-status').textContent=run.total?`${formatCount(finished)} / ${formatCount(run.total)}`:tr('应用中…');
 if($('#icon-batch-progress'))$('#icon-batch-progress').value=finished;
 if(!run.pending.size&&!run.queue.length)iconBatchFinish();
}
function iconBatchReply(result){
 const run=iconBatch,entry=run?.pending.get(result?.requestId);if(!entry)return;
 clearTimeout(entry.timer);run.pending.delete(result.requestId);
 const src=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 if(src){run.icons.set(entry.host.host,src);run.done.push(entry.host);iconFailures.delete(entry.host.host);}
 else{const reason=iconFailReason(result.error);run.failed.push({...entry.host,reason});iconFailures.set(entry.host.host,reason);}
 iconBatchPump();
}
function iconBatchAbort(){const run=iconBatch;if(!run||run.finished)return;for(const {timer} of run.pending.values())clearTimeout(timer);iconBatch=null;toast(tr('已停止，资产未改动'));}
function iconBatchFinish(){
 const run=iconBatch;run.finished=true;iconBatch=null;
 let changed=0;const touched=[];
 for(const h of run.plan.hosts){const src=run.icons.get(h.host);if(!src)continue;for(const id of h.ids){const a=state.assets.find(x=>x.id===id);if(a&&!(a.siteIcon&&!iconBatchOverwrite)&&a.siteIcon!==src){touched.push([a,src,iconSiteFor(run.sites,h.host)]);}}}
 if(touched.length){checkpoint();for(const [a,src,host] of touched){a.siteIcon=src;a.siteIconHost=host;changed++;}save();}
 const failedAssets=run.failed.reduce((n,h)=>n+h.ids.length,0);
 if($('#icon-batch'))$('#icon-batch').innerHTML=`<div id="icon-batch-done"><p class="icon-batch-lead">${tr('<strong>{n}</strong> 项已更新',{n:formatCount(changed)})}${run.total?`<span class="chip">${tr('{done}/{n} 个平台',{done:formatCount(run.done.length),n:formatCount(run.total)})}</span>`:''}</p>${run.failed.length?`<p class="form-note">${tr('{n} 个平台没有拿到图标，{kept} 项保留类别图标',{n:formatCount(run.failed.length),kept:formatCount(failedAssets)})}</p><ul class="icon-batch-hosts failed">${run.failed.map(h=>`<li><strong>${esc(h.host)}</strong><span>${esc(h.reason)}</span></li>`).join('')}</ul>`:''}<div class="confirm-actions">${run.failed.length?`<button class="button" data-action="icon-batch">${tr('逐个处理')}</button>`:''}<button class="button primary" data-action="icon-batch-cancel">${tr('完成')}</button></div></div>`;
 $('#icon-batch-done [data-action="icon-batch-cancel"]')?.focus();
 render();if(activeAsset)showDetail(activeAsset);
 if(changed)toast(tr('{n} 项已配上图标',{n:formatCount(changed)}),true);
}
// Icons without asking: a new record from any path (the form, recognition, an agent, a sync) whose platform is a known vendor gets that
// vendor's site icon, reusing one already on this Mac without a request. Automatic requests only go to iconVendors hosts, a failed host is
// not asked again until the next launch, and every request is in 网络记录. state.autoIcons=false (the switch in 获取网站图标) turns it off.
// 获取图标 in the inspector fetches one record's icon on request, from a vendor or the record's own management link (iconHost).
const AUTO_ICON_BASE=2e9;let autoIconSequence=AUTO_ICON_BASE,autoIconTimer=0;
const autoIconSeen=new Set(state.assets.map(a=>a.id)),autoIconRequests=new Map(),autoIconFailed=new Set(),iconFetching=new Set();
function scheduleAutoIcons(){if(!autoIconTimer)autoIconTimer=setTimeout(()=>{autoIconTimer=0;autoIcons();},0);}
// By platform; once the person names a site for a platform, only icons from that site count for it.
function knownSiteIcons(){const known=new Map(),sites=iconSites();for(const a of state.assets){const src=siteIconSrc(a),host=src&&iconPlatformOf(sites,a.siteIconHost);if(host&&!known.has(host)&&(!Object.prototype.hasOwnProperty.call(sites,host)||iconSiteFor(sites,host)===String(a.siteIconHost).toLowerCase()))known.set(host,src);}return known;}
function requestIcon(host,ids,manual=false){
 const waiting=[...autoIconRequests.values()].find(r=>r.host===host);if(waiting){waiting.ids.push(...ids);waiting.manual||=manual;return;}
 const requestId=++autoIconSequence;autoIconRequests.set(requestId,{host,ids:[...ids],manual,timer:setTimeout(()=>autoIconReply({requestId,ok:false,error:'超时'}),ICON_BATCH_TIMEOUT)});
 iconFetchPost(requestId,host);
}
function autoIcons(){
 const fresh=state.assets.filter(a=>!autoIconSeen.has(a.id));for(const a of fresh)autoIconSeen.add(a.id);
 if(state.autoIcons===false||!nativeStore||demoMode||!fresh.length)return;
 const known=knownSiteIcons();let changed=false;
 for(const a of fresh){
  if(isHidden(a)||hasRealIcon(a)||agentIconStatus.get(a.id)==='fetching')continue;
  const v=iconVendor(a);if(!v)continue;
  const src=known.get(v.host),site=iconSiteFor(iconSites(),v.host);if(src){a.siteIcon=src;a.siteIconHost=site;changed=true;}
  else if(!autoIconFailed.has(site))requestIcon(site,[a.id]);
 }
 if(changed){save();render();if(activeAsset&&fresh.some(a=>a.id===activeAsset))showDetail(activeAsset,{focus:false});}
}
function fetchIconFor(id){
 const a=state.assets.find(x=>x.id===id);if(!a||!nativeStore||demoMode)return;
 const platform=iconHost(a);if(!platform){iconDialog(id);return;}
 const host=iconSiteFor(iconSites(),platform),src=knownSiteIcons().get(platform);
 if(src){checkpoint();a.siteIcon=src;a.siteIconHost=host;save();render();showDetail(id,{focus:false});toast(tr('已配上图标'),true);return;}
 iconFetching.add(id);requestIcon(host,[id],true);showDetail(id,{focus:false});
}
function autoIconReply(result){
 const request=autoIconRequests.get(result?.requestId);if(!request)return;
 autoIconRequests.delete(result.requestId);clearTimeout(request.timer);for(const id of request.ids)iconFetching.delete(id);
 const src=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 const platform=iconPlatformOf(iconSites(),request.host);if(!src){autoIconFailed.add(request.host);iconFailures.set(platform,iconFailReason(result.error));}else iconFailures.delete(platform);
 const targets=src?request.ids.map(id=>state.assets.find(x=>x.id===id)).filter(a=>a&&!hasRealIcon(a)):[];
 if(targets.length){if(request.manual)checkpoint();for(const a of targets){a.siteIcon=src;a.siteIconHost=request.host;}save();render();}
 if(activeAsset&&request.ids.includes(activeAsset))showDetail(activeAsset,{focus:false});
 if(request.manual)toast(src?tr('已配上图标'):tr('没有从 {host} 拿到图标，可在 ⋯ → 网站图标 换个网址',{host:request.host}),!!src);
}
// Real icons are drawn on the neutral tile; a dark mark on transparency gets a light backing in dark mode, a light mark a dark one in light mode.
const markTones=new Map();
function markTone(src){
 if(markTones.has(src))return markTones.get(src);
 markTones.set(src,'');const img=new Image();
 img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,32,32);const d=g.getImageData(0,0,32,32).data;let opaque=0,lum=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>128){opaque++;lum+=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;}
  const mean=opaque?lum/opaque:0,clear=opaque<1024*.9;markTones.set(src,clear&&opaque&&mean<.3?'mark-dark':clear&&opaque&&mean>.85?'mark-light':'');}catch{markTones.set(src,'');}
  refreshMarkTones();};
 img.src=src;return '';
}
function refreshMarkTones(){document.querySelectorAll('.tile.custom-art img,.site-mark').forEach(img=>{const tone=markTones.get(img.getAttribute('src'));if(tone===undefined)return;const host=img.classList.contains('site-mark')?img:img.parentElement;host.classList.toggle('mark-dark',tone==='mark-dark');host.classList.toggle('mark-light',tone==='mark-light');});}
function closeDetail(){$('#detail').hidden=true;activeAsset=null;markSelected();if(lastFocus?.isConnected)lastFocus.focus();}
// Dialog widths by content: short confirmations narrow, lists wide, forms in between.
const MODAL_SIZES={prefs:'l',confirm:'s',inbox:'l','import-preview':'l',agent:'l',network:'l',cost:'l'};
function modal(title,html,view=''){const dialog=$('#modal'),content=$('#modal-content'),scroll=dialog.open&&dialog.dataset.view===view?content.scrollTop:0;$('#modal-title').textContent=title;content.innerHTML=html;dialog.dataset.view=view;dialog.dataset.size=MODAL_SIZES[view]||'';if(!html.includes('id="asset-form"')&&!html.includes("id='asset-form'")&&!html.includes('id="dirty-save"'))assetFormSnapshot=null;if(nativeStore)content.querySelectorAll('.form-note').forEach(el=>{if(el.textContent.includes(tr('浏览器')))el.textContent=el.textContent.replaceAll(tr('当前浏览器'),tr('此 Mac')).replaceAll(tr('此浏览器'),tr('此 Mac'));});if(!dialog.open)dialog.showModal();content.scrollTop=scroll;
 // Opening puts focus on the close button, which draws a ring before anything was pressed; start in the body instead.
 if(document.activeElement===$('#close-modal')||!dialog.contains(document.activeElement))content.focus({preventScroll:true});
 modalScrollState();}
// The head gets a rule once the body scrolls under it, the pinned actions once more lies below them.
function modalScrollState(){const dialog=$('#modal'),content=$('#modal-content');dialog.toggleAttribute('data-scrolled',content.scrollTop>0);dialog.toggleAttribute('data-more',content.scrollTop+content.clientHeight<content.scrollHeight-1);}
$('#modal-content').addEventListener('scroll',modalScrollState,{passive:true});
$('#modal-content').addEventListener('toggle',modalScrollState,true);
addEventListener('resize',()=>{if($('#modal').open)modalScrollState();});
// The + adds an asset: straight into the category on screen, otherwise through the category chooser.
function addAsset(){const v=currentView();captureDialog(cats[v]&&!query?v:'');}
let importPlan=null,importKind=null;
// Where agents and scripts connect: the MCP server inside the app, set up per tool (one tab each), plus the command line.
// The chosen tab is remembered per viewer.
const AGENT_TOOLS=[['claude-code','Claude Code'],['claude-desktop','Claude Desktop'],['codex','ChatGPT / Codex'],['cursor','Cursor'],['other',tr('其他工具 / 命令行')]];
let agentTool=(()=>{try{const v=localStorage.getItem('assetboard-agent-tool');return AGENT_TOOLS.some(([id])=>id===v)?v:'claude-code';}catch{return 'claude-code';}})();
function agentToolHtml(tool,cli){
 const q=JSON.stringify(cli),json=JSON.stringify({mcpServers:{assetboard:{command:cli,args:['mcp']}}},null,2);
 let blocks=0;const block=(text,label)=>{const id=`agent-code-${tool}-${++blocks}`;return `<div class="agent-code"><pre id="${id}">${esc(text)}</pre><button type="button" class="button" data-action="agent-copy" data-id="${id}" aria-label="${tr('复制{what}',{what:label})}">${tr('复制')}</button></div>`;};
 const note=text=>`<p class="form-note">${text}</p>`;
 if(tool==='claude-code')return note(tr('在终端运行一次，之后在 Claude Code 里直接说“把 example.com 加到 Assetboard，3 月 1 日到期”。'))+block(`claude mcp add assetboard -- ${q} mcp`,tr('Claude Code 命令'));
 if(tool==='claude-desktop')return note(tr('Claude Desktop：设置 → 开发者 → 编辑配置，把下面这段合并进 claude_desktop_config.json，然后重启 Claude。'))+block(json,tr('Claude Desktop 配置'));
 if(tool==='codex')return note(tr('ChatGPT 桌面版的 Codex、Codex CLI 和 IDE 插件共用一份配置。在终端运行：'))+block(`codex mcp add assetboard -- ${q} mcp`,tr('Codex 命令'))+note(tr('或者把这段加进 ~/.codex/config.toml：'))+block(`[mcp_servers.assetboard]\ncommand = ${q}\nargs = ["mcp"]`,tr('Codex 配置'))+note(tr('ChatGPT 的普通对话和网页版不能连接本机工具。'));
 if(tool==='cursor')return note(tr('把下面这段合并进 ~/.cursor/mcp.json（所有项目可用），保存后在 Cursor 设置的 MCP 页确认已连接。'))+block(json,tr('Cursor 配置'));
 return note(tr('Windsurf、Cline 等支持 MCP 的工具：添加一个 stdio 服务器，命令填下面的路径，参数填 mcp；大多数工具认这段 mcpServers 配置。'))+block(json,tr('通用 MCP 配置'))+note(tr('命令行：第一行把命令放进 PATH，只需一次（没有权限时在前面加 sudo）。结果以 JSON 输出，App 没开时会自动在后台打开。'))+block(`ln -sf ${q} /usr/local/bin/assetboard-cli\nassetboard-cli list --type domain\nassetboard-cli add '{"name":"example.com","type":"domain","date":"2027-03-01"}'\nassetboard-cli update <id> '{"notes":"${tr('已续费')}"}'\nassetboard-cli delete <id> --reason ${tr('已转出')}`,tr('命令示例'));
}
function agentSetupDialog(){
 if(!featureOn('agent')){notice(tr('外部工具接入已在设置里关闭'),{action:'prefs',id:'features',label:tr('打开设置')});return;}
 if(!nativeStore||demoMode){modal(tr('MCP 接入'),`<div class="form agent-setup"><p class="form-note">${demoMode?tr('外部 AI 工具（Claude、ChatGPT、Cursor 等）和脚本通过 Mac App 里的 assetboard-cli 读写资产，演示模式不接受外部调用。浏览器版不提供这个接口；把 Inbox 格式的 JSON 拖进窗口可以导入。'):tr('外部 AI 工具（Claude、ChatGPT、Cursor 等）和脚本通过 Mac App 里的 assetboard-cli 读写资产。浏览器版不提供这个接口；把 Inbox 格式的 JSON 拖进窗口可以导入。')}</p></div>`,'agent');return;}
 const cli=nativeStore.cliPath||'/Applications/Assetboard.app/Contents/MacOS/assetboard-cli';
 const tabs=AGENT_TOOLS.map(([id,label])=>`<button type="button" class="choice" role="radio" aria-checked="${id===agentTool}" data-action="agent-tab" data-id="${id}">${esc(label)}</button>`).join('');
 modal(tr('MCP 接入'),`<div class="form agent-setup">
  <p class="form-note">${tr('让 Claude、ChatGPT（Codex）、Cursor 等 AI 工具或你的脚本查询、添加、修改资产：新增和修改立即生效，可用 ⌘Z 撤销；删除会先到「待确认」，你确认才删。只在本机，通过 App 的本地通道，不经网络；每次调用都记在「网络记录」里。')}</p>
  <div class="chip-group agent-tabs" role="radiogroup" aria-label="${tr('选择工具')}">${tabs}</div>
  <section class="agent-tool">${agentToolHtml(agentTool,cli)}</section>
  <p class="form-note platform-note">${ui('info')}${tr('也可以把 JSON 文件放进 ~/Library/Application Support/Assetboard/Inbox/，格式见 README；这种方式每次都要你在导入预览里确认。')}</p>
 </div>`,'agent');
}
// 网络记录: every request the Mac app sends and every call that reaches it, as the app recorded them (NetworkLog.swift).
// The page itself cannot reach the network (see the Content-Security-Policy in index.html), so this list is complete.
let networkRows=null,networkFilter={direction:'',service:''},networkShown=200;
function networkDialog(){
 if(!nativeStore||demoMode){modal(tr('网络记录'),`<div class="form net-log"><p class="form-note">${demoMode?tr('演示模式不联网，也不记录。'):tr('浏览器版只读写这个浏览器里的数据，页面被禁止发出任何网络请求；网络记录在 Mac App 里。')}</p></div>`,'network');return;}
 networkShown=200;
 if(networkRows===null){modal(tr('网络记录'),`<div class="form net-log"><p class="form-note">${tr('正在读取…')}</p></div>`,'network');window.webkit.messageHandlers.assetboard.postMessage({action:'networkLog'});return;}
 renderNetworkDialog();
}
window.assetboardNetworkLog=rows=>{networkRows=Array.isArray(rows)?rows:[];if($('#modal').open&&$('#modal').dataset.view==='network')renderNetworkDialog();};
window.assetboardNetworkEntry=entry=>{if(!entry||typeof entry!=='object'||networkRows===null)return;networkRows.unshift(entry);if(networkRows.length>5000)networkRows.length=5000;if($('#modal').open&&$('#modal').dataset.view==='network')renderNetworkDialog();};
function networkBytes(n){n=Number(n)||0;return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(n<10240?1:0)} KB`:`${(n/1048576).toFixed(1)} MB`;}
function networkTime(at){const d=new Date(at);return Number.isNaN(d.getTime())?'':`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;}
function networkDay(at){const d=new Date(at);if(Number.isNaN(d.getTime()))return '';const today=localDay(new Date()),day=localDay(d);return day===today?tr('今天'):day===today-1?tr('昨天'):`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function networkRow(r){
 const out=r.direction!=='in',status=r.status?String(r.status):r.ok?tr('完成'):tr('失败');
 const detail=[r.address?tr('对方地址 {address}',{address:r.address}):'',r.tls||'',out&&r.sent?tr('发出 {size}',{size:networkBytes(r.sent)}):'',r.received?(out?tr('收到 {size}',{size:networkBytes(r.received)}):tr('回复 {size}',{size:networkBytes(r.received)})):'',Number.isFinite(r.ms)?`${r.ms} ms`:''].filter(Boolean);
 return `<li class="net-row${r.ok?'':' failed'}"><span class="net-time">${networkTime(r.at)}</span><span class="net-dir ${out?'out':'in'}" title="${out?tr('发出：这台 Mac → 外部服务器'):tr('收到：外部 → Assetboard')}">${out?'↑':'↓'}</span><div class="net-main"><div class="net-line"><strong>${esc(r.service||'')}</strong><code>${esc(r.method||'')} ${esc(r.host||'')}${String(r.path||'').startsWith('/')?'':' '}${esc(r.path||'')}</code></div>${detail.length||r.note?`<div class="net-meta">${esc([...detail,r.note||''].filter(Boolean).join(' · '))}</div>`:''}</div><span class="net-status">${esc(status)}</span></li>`;
}
function renderNetworkDialog(){
 const rows=networkRows||[],services=[...new Set(rows.map(r=>r.service).filter(Boolean))];
 const hits=rows.filter(r=>(!networkFilter.direction||(networkFilter.direction==='in')===(r.direction==='in'))&&(!networkFilter.service||r.service===networkFilter.service));
 const today=rows.filter(r=>networkDay(r.at)===tr('今天')),failed=hits.filter(r=>!r.ok).length;
 const chip=(kind,value,label,count)=>`<button type="button" class="choice" role="radio" aria-checked="${networkFilter[kind]===value}" data-action="network-filter" data-kind="${kind}" data-id="${esc(value)}">${esc(label)}${count===undefined?'':` <span class="net-count">${formatCount(count)}</span>`}</button>`;
 let day='',list='';
 for(const r of hits.slice(0,networkShown)){const d=networkDay(r.at);if(d!==day){day=d;list+=`<li class="net-day">${esc(d)}</li>`;}list+=networkRow(r);}
 const content=$('#modal-content'),scroll=$('#modal').dataset.view==='network'?content.scrollTop:0;
 modal(tr('网络记录'),`<div class="form net-log">
  <p class="form-note">${tr('Assetboard 没有自己的服务器。这里是 App 发出的每个请求（只在你同步、识别、获取图标时发生）和外部对 App 的调用：只记方法、地址、状态、大小和耗时，不记内容、令牌和查询参数。页面本身被禁止联网；打开管理链接由你的浏览器完成，不在这里。')}</p>
  <div class="net-summary">${rows.length?`${tr('今天 {n} 次',{n:formatCount(today.length)})}${today.length?` · ${tr('发出 {n}',{n:formatCount(today.filter(r=>r.direction!=='in').length)})} · ${tr('收到 {n}',{n:formatCount(today.filter(r=>r.direction==='in').length)})}`:''}${failed?` · <span class="net-failed">${tr('失败 {n}',{n:formatCount(failed)})}</span>`:''}`:tr('还没有任何网络请求')}</div>
  ${rows.length?`<div class="chip-group net-filters" role="radiogroup" aria-label="${tr('方向')}">${chip('direction','',tr('全部'))}${chip('direction','out',tr('发出'),rows.filter(r=>r.direction!=='in').length)}${chip('direction','in',tr('收到'),rows.filter(r=>r.direction==='in').length)}</div>
  ${services.length>1?`<div class="chip-group net-filters" role="radiogroup" aria-label="${tr('服务')}">${chip('service','',tr('全部服务'))}${services.map(s=>chip('service',s,s,rows.filter(r=>r.service===s).length)).join('')}</div>`:''}
  <ul class="net-list">${list||`<li class="net-day">${tr('没有符合条件的记录')}</li>`}</ul>
  ${hits.length>networkShown?`<button type="button" class="text-button" data-action="network-more">${tr('再显示 {n} 条（共 {total}）',{n:formatCount(Math.min(200,hits.length-networkShown)),total:formatCount(hits.length)})}</button>`:''}
  <div class="confirm-actions"><button type="button" class="button" data-action="network-clear">${tr('清空记录')}</button><button type="button" class="button primary" data-action="network-close">${tr('完成')}</button></div>`:''}
 </div>`,'network');
 content.scrollTop=scroll;
}
const importSource=(action,glyph,label,title)=>`<button class="button source" data-action="${action}" title="${esc(title||label)}">${ui(glyph)}${label}</button>`;
// The local gh / ~/.ssh/config row of the import window. Detecting gh takes seconds (it asks GitHub), so the window opens at once
// and only this row changes when the answer comes: 检测中 until the first answer, then the buttons; the rest stays usable.
function importCliInner(){
 const cli=window.__localCli||{},known='gh' in cli;
 // GitHub (gh or a token) is Pro: it comes from proSlots.importCli.
 const sshButton=cli.sshConfig?`<button class="button primary" data-action="ssh-import" title="${tr('从 ~/.ssh/config 读取服务器')}">${ui('terminal')}~/.ssh/config</button>`:'';
 const waiting=localCliPending&&!known?`<span class="form-note import-cli-wait" role="status">${tr('正在检测本机 gh 和 SSH 配置…')}</span>`:'';
 return `${known?slotHtml('importCli',{native:true,cli,source:importSource})+sshButton:''}${waiting}<button class="icon-button" data-action="local-cli-refresh" title="${tr('重新检测')}" aria-label="${tr('重新检测本机 gh 和 SSH 配置')}"${localCliPending?' disabled aria-busy="true"':''}>${ui('refresh')}</button>`;
}
function refreshImportCli(){const row=$('#modal')?.open&&$('#modal').dataset.view==='import'?$('#modal .import-cli'):null;if(row)row.innerHTML=importCliInner();}
function importHub(){
 const deleted=(state.deletedExternalIds||[]).length;
 const native=!!nativeStore;
 const cli=window.__localCli||{};
 const cliTitle=tr('本机已登录：只调用 gh 等命令读公开元数据，不读它们自存的凭据；SSH 只读 Host、HostName、User、Port');
 const source=importSource;
 // MCP and Cloudflare are Pro: they come from proSlots.importSources.
 const ctx={native,cli,source};
 if(native&&!demoMode)requestLocalCliDetect();
 const cliRow=native?`<div class="import-cli" title="${esc(cliTitle)}">${importCliInner()}</div>`:'';
 const chip=name=>`<span class="fmt">${name}</span>`;
 modal(tr('导入'),`<div class="form import-hub">
  <div class="import-drop" id="import-drop" tabindex="0" role="button" aria-label="${tr('拖入或点击选择文件，也可 ⌘V 粘贴')}" title="${tr('无冲突直接写入，⌘Z 整批撤销；表格最多 {n} 行，同名跳过，疑似密钥列丢弃。也认得 CF-Server-Monitor 导出的服务器备份',{n:IMPORT_ROW_LIMIT})}"><span class="drop-mark" aria-hidden="true">${ui('download')}</span><strong>${tr('拖入或粘贴')}</strong><span class="fmts">${chip('CSV')}${chip('JSON')}${chip('EML')}${native?chip(tr('图片'))+chip('PDF'):''}</span><input id="import-file" type="file" accept=".csv,.tsv,.json,.eml,text/csv,application/json,message/rfc822${native?',image/png,image/jpeg,image/webp,application/pdf':''}" hidden multiple></div>
  ${cliRow}
  <div class="import-actions">
   ${source('import-pick-file','file',tr('文件'),tr('选择文件'))}
   ${source('manual-import','plus',tr('手动'))}
   ${source('inbox','mail',tr('通知'),tr('粘贴续费通知'))}
   ${slotHtml('importSources',ctx)}
   ${native?source('ocr-import','image',tr('截图'),tr('选择截图或 PDF')):''}
   ${demoMode?`<button class="button primary" data-action="import-demo-sample">${tr('试用示例')}</button>`:''}
  </div>
  ${deleted?`<details class="import-deleted"><summary>${tr('已删除的同步项')} · ${formatCount(deleted)}</summary><p class="form-note">${tr('再次导入会跳过，预览里勾选可恢复。')}</p><ul class="import-deleted-list">${(state.deletedExternalIds||[]).slice(0,40).map(key=>`<li><code>${esc(key)}</code></li>`).join('')}${(state.deletedExternalIds||[]).length>40?`<li>…${tr('共 {n} 项',{n:state.deletedExternalIds.length})}</li>`:''}</ul></details>`:''}
 </div>`,'import');
 $('#import-drop')?.addEventListener('click',()=>$('#import-file')?.click());
 $('#import-drop')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#import-file')?.click();}});
 $('#import-file')?.addEventListener('change',e=>{const files=[...e.target.files||[]];e.target.value='';if(files.length)handleImportFiles(files);});
}
function importPreviewHtml(plan,meta={}){
 const group=(tone,title,rows,render,hint='')=>rows.length?`<section class="import-group ${tone}"><h3><i class="dot" aria-hidden="true"></i>${title}<b class="count">${rows.length}</b>${hint?`<span class="hint">${hint}</span>`:''}</h3><div class="import-rows">${rows.map(render).join('')}</div></section>`:'';
 const name=row=>esc(row.item?.name||row.name||tr('未命名'));
 const type=row=>`<span class="chip">${esc(cats[row.item?.type||row.type]?.name||row.item?.type||'')}</span>`;
 // What will be written, the way the board shows it: the next date and the cost, so a source's mapping can be checked here.
 const facts=row=>{const it=row.item||{},when=it.date?`${it.date} ${dateKinds[it.dateKind]?.future||dateKinds.expire.future}`:'',cost=it.cost&&it.cost!=='未知'?it.cost:'';
  return when||cost?`<span class="import-facts">${esc([when,cost].filter(Boolean).join(' · '))}</span>`:'';};
 const line=row=>`<div class="import-row"><strong>${name(row)}</strong>${facts(row)}${type(row)}</div>`;
 // One chip for where it came from: the source when it was recognised (the file name in its tip), else the file name.
 const from=meta.preset?`<span class="chip"${meta.note?` title="${esc(meta.note)}"`:''}>${ui('file')}${esc(meta.preset.label)}</span>`:meta.note&&`<span class="chip">${ui('file')}${esc(meta.note)}</span>`;
 const notes=[
  from,
  ...(meta.leftOut||[]).map(x=>`<span class="chip" title="${esc(x.why)}">${ui('lock')}${tr('未导入：{what}',{what:esc(x.label)})}</span>`),
  meta.truncated&&`<span class="chip warn" title="${tr('表格一次最多读 {n} 行',{n:IMPORT_ROW_LIMIT})}">${ui('warn')}${tr('前 {n} / {total} 行',{n:IMPORT_ROW_LIMIT,total:meta.totalRows})}</span>`,
  meta.droppedSecrets?.length&&`<span class="chip warn" title="${tr('疑似密钥的列不会导入')}">${ui('lock')}${tr('已丢弃密钥列：{cols}',{cols:esc(meta.droppedSecrets.join(tr('、')))})}</span>`
 ].filter(Boolean).join('');
 return `<div class="form import-preview" id="import-preview">
  ${notes?`<div class="chips import-notes">${notes}</div>`:''}
  ${group('add',tr('新增'),plan.added||[],line)}
  ${group('update',tr('更新'),plan.updated||[],line)}
  ${group('hold',tr('同名'),[...(plan.collisions||[]),...(plan.skippedSame||[])],(row,i)=>`<label class="check-label import-row"><input type="checkbox" name="import-same" value="${esc(row.assetId)}"><strong>${name(row)}</strong>${facts(row)}${type(row)}</label>`,tr('默认跳过，勾选则覆盖'))}
  ${group('hold',tr('已删除'),plan.skippedDeleted||[],row=>`<label class="check-label import-row"><input type="checkbox" name="import-restore" value="${esc(row.key)}"><strong>${name(row)}</strong>${facts(row)}${type(row)}</label>`,tr('默认跳过，勾选则恢复'))}
  ${group('quiet',tr('已隐藏'),plan.hidden||[],line,tr('更新后仍隐藏'))}
  ${group('bad',tr('没读懂'),meta.unreadable||[],row=>`<div class="import-row"><strong>${esc(row.reason||tr('无法识别'))}</strong>${row.line?`<span class="chip">${tr('第 {n} 行',{n:row.line})}</span>`:''}</div>`)}
  <div class="confirm-actions"><button class="button primary" data-action="import-apply">${tr('导入')}</button><button class="button" data-action="import-hub" title="${tr('返回导入')}" aria-label="${tr('返回导入')}">${ui('back')}</button></div>
 </div>`;
}
function commitImportPlan(plan,meta={},opts={}){
 const restoreKeys=opts.restoreKeys||[];
 const applySame=opts.applySame||[];
 const applyCollisions=opts.applyCollisions||[];
 const beforeCount=state.assets.length;
 checkpoint();
 if(importKind==='json')state=applyBoardBackup(state,plan,{restoreKeys});
 else state=applyImport(state,plan,{restoreKeys,applySame,applyCollisions});
 if(!Array.isArray(state.deletedExternalIds))state.deletedExternalIds=[];
 save();render();
 const added=state.assets.length-beforeCount;
 const updated=(plan.updated||[]).length+(plan.hidden||[]).length+applySame.length+applyCollisions.length;
 const skipped=(plan.skippedSame||[]).length;const parts=[added?tr('新增 {n}',{n:added}):'',updated?tr('更新 {n}',{n:updated}):'',restoreKeys.length?tr('恢复 {n}',{n:restoreKeys.length}):'',skipped?tr('跳过 {n}',{n:skipped}):''].filter(Boolean);
 $('#modal').close();
 toast(parts.length?parts.join(' · '):tr('没有写入新内容'),true);
 importPlan=null;importKind=null;
 if(importIntakeId){finishIntake(importIntakeId);importIntakeId=null;}
}
function runImportPlan(plan,meta={}){
 importPlan=plan;
 // A file handed over from outside the window always stops at the preview, and stays queued until it is imported.
 const from=importFrom;if(from)from.used=true;importIntakeId=from?.id||null;
 const skipped=plan.skippedSame?.length||0;const needsPreview=!!(from?.preview||plan.conflicts||(meta.unreadable||[]).length||meta.truncated||plan.mode==='replace');
 if(from&&!(plan.added||[]).length&&!(plan.updated||[]).length&&!(plan.hidden||[]).length&&!skipped&&!(plan.skippedDeleted||[]).length&&!(meta.unreadable||[]).length){from.used=false;importIntakeId=null;toast(tr('没有可导入的内容'));return;}

 if(!needsPreview){
  const empty=!(plan.added||[]).length&&!(plan.updated||[]).length&&!(plan.hidden||[]).length;
  if(empty){if(from){from.used=false;importIntakeId=null;}toast(skipped?tr('同名全部跳过（{n}）',{n:skipped}):meta.unreadable?.length?tr('没有可导入的行'):tr('没有可导入的内容'));return;}
  commitImportPlan(plan,meta);
  return;
 }
 modal(tr('导入预览'),importPreviewHtml(plan,meta),'import-preview');
}
function importCsvText(text,{filename=''}={}){
 const parsed=parseDelimitedText(text);
 if(!parsed.ok){toast(parsed.error||tr('无法解析表格'));return;}
 const {items,unreadable,preset,droppedSecrets,truncated,totalRows}=rowsToImportItems(parsed,{types:Object.keys(cats)});
 const plan=planImport(state,items,{sameName:'skip'});
 if(unreadable.length)plan.conflicts=true;
 runImportPlan(plan,{unreadable,preset,droppedSecrets,truncated,totalRows,note:filename});
}
// CF-Server-Monitor's 导出服务器 file: its servers land as server assets, like a table would; nothing is sent to the panel.
function importCfsmText(text,{filename=''}={}){
 const parsed=parseCfsmBackup(text);
 if(!parsed.ok){toast(parsed.error);return;}
 const {items,unreadable,preset,droppedSecrets,leftOut,truncated,totalRows}=parsed;
 const plan=planImport(state,items,{sameName:'skip'});
 if(unreadable.length)plan.conflicts=true;
 runImportPlan(plan,{unreadable,preset,droppedSecrets,leftOut,truncated,totalRows,note:filename});
}
// Agent files ({"assetboard":1,"items":[…]}), however they arrive, always stop at the preview; nothing is written until it is confirmed.
function importAgentTexts(files){
 const rows=[],names=[],problems=[];let truncated=false,total=0;
 for(const file of files){
  const parsed=parseAgentImport(file.text);
  if(!parsed.ok){problems.push(`${file.name}${tr('：{error}',{error:parsed.error})}`);continue;}
  names.push(file.name);total+=parsed.totalRows;truncated=truncated||parsed.truncated;
  rows.push(...parsed.rows);
 }
 if(problems.length)toast(problems.join(tr('；')));
 if(!rows.length)return;
 const limited=rows.slice(0,IMPORT_ROW_LIMIT).map((row,index)=>({...row,_line:index+1}));
 const {items,unreadable}=rowsToImportItems({ok:true,headers:AGENT_FIELDS,rows:limited},{types:Object.keys(cats)});
 const plan=planImport(state,items,{sameName:'skip'});
 plan.conflicts=true;
 importKind='csv';
 runImportPlan(plan,{unreadable,truncated:truncated||rows.length>IMPORT_ROW_LIMIT,totalRows:total,note:names.join(tr('、'))});
}
// One queue for everything handed over: files dropped in the window, files from the Dock or "Open With", text from the
// Services menu and files an agent leaves in the Inbox folder. The next item opens only when nothing else is on screen,
// so an open form or preview is never replaced; otherwise it waits in 待确认. An item that opens an import preview stays
// queued until it is imported or discarded (an Inbox file stays in its folder until then); mail and text leave the queue
// once opened, since they become a review of their own.
const intakeSources={window:tr('拖入'),open:tr('Dock / 打开方式'),service:tr('服务菜单'),inbox:tr('Inbox 文件夹'),agent:tr('外部工具')};
let intake=[],intakeSequence=0,importFrom=null,importIntakeId=null;
function modalBusy(source){
 const dialog=$('#modal');if(!dialog.open)return false;
 const view=dialog.dataset.view||'';
 if(isAssetFormDirty()||$('#dirty-save'))return true;
 // A drop in the window is the person acting here: it may replace anything but a confirmation in progress.
 if(source==='window')return ['import-preview','review'].includes(view);
 if(view==='capture')return !!$('#capture-text')?.value.trim();
 return view!=='import';
}
window.assetboardIntake=entries=>{
 if(!Array.isArray(entries))return;
 // The demo takes files opened from the Dock or 打开方式 into the same preview; what is imported stays on the demo board, since
 // nothing is saved in demo mode. Everything else that arrives from outside is ignored there.
 if(demoMode)entries=entries.filter(entry=>entry?.source==='open');
 const problems=[],fresh=[];
 for(const entry of entries){
  if(!entry||typeof entry!=='object')continue;
  const source=intakeSources[entry.source]?entry.source:'open',name=String(entry.name||'');
  if(entry.error){problems.push(`${name.slice(0,100)}${tr('：{error}',{error:entry.error})}`);continue;}
  if(typeof entry.text!=='string'||!entry.text.trim())continue;
  if(source==='inbox'&&intake.some(item=>item.source==='inbox'&&item.name===name))continue;
  // The Inbox folder takes only the agent format, as documented; anything else is reported and moved aside at once.
  if(source==='inbox'&&classifyImportPayload({text:entry.text,filename:name}).kind!=='agent'){
   problems.push(`${name.slice(0,100)}${tr('：{error}',{error:parseAgentImport(entry.text).error||tr('无法读取')})}`);
   if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'intakeDone',name});
   continue;
  }
  fresh.push({source,name,text:entry.text.slice(0,source==='service'?20000:5e6)});
 }
 if(problems.length)notice(problems.join(tr('；')));
 queueIntake(fresh);
};
function queueIntake(entries){
 if(!entries.length)return;
 const ids=entries.map(entry=>{const id='intake-'+(++intakeSequence);intake.push({mime:'',...entry,id});return id;});
 drainIntake();
 if(agentDeleteOpen)agentDeleteDialog();
 if(agentConfirmOpen)agentConfirmDialog();
 syncToolbar();
 const waiting=intake.filter(item=>ids.includes(item.id)&&!intakeShown(item.id)).length;
 if(waiting)toast(waiting===entries.length?tr('收到 {n} 项，在待确认里',{n:waiting}):tr('还有 {n} 项在待确认里',{n:waiting}));
 if($('#modal').open&&$('#modal').dataset.view==='inbox')inboxDialog(false);
}
function intakeShown(id){if(agentDeleteOpen&&intake.find(item=>item.id===id)?.deleteId)return true;if(agentConfirmOpen&&intake.find(item=>item.id===id)?.confirmKind)return true;return importIntakeId===id&&$('#modal').open&&$('#modal').dataset.view==='import-preview';}
// Opens queued items one after another until one needs the person (a preview, a review, a filled-in panel).
function drainIntake(){
 while(intake.length&&!modalBusy(intake[0].source)){
  const id=intake[0].id;openIntake(id);
  if(intake[0]?.id===id&&!intakeShown(id))finishIntake(id);
 }
}
function openIntake(id){
 const item=intake.find(entry=>entry.id===id);if(!item)return;
 if(item.deleteId){agentDeleteDialog();return;}
 if(item.confirmKind){agentConfirmDialog();return;}
 if(item.source==='service'){
  finishIntake(id);captureDialog();
  const box=$('#capture-text');box.value=item.text;box.focus();box.setSelectionRange(0,0);return;
 }
 const kind=classifyImportPayload({text:item.text,filename:item.name,mime:item.mime}).kind;
 if(['csv','json','agent','cfsm'].includes(kind)){
  const from={id,preview:item.source!=='window',used:false};importFrom=from;
  try{routeImportText(item.text,{filename:item.name,mime:item.mime});}finally{importFrom=null;if(!from.used)finishIntake(id);}
  return;
 }
 finishIntake(id);
 routeImportText(item.text,{filename:item.name,mime:item.mime});
}
// Done with an item: imported, discarded, or opened as a review. An Inbox file then leaves its folder.
function finishIntake(id){
 const item=intake.find(entry=>entry.id===id);if(!item)return;
 intake=intake.filter(entry=>entry!==item);
 if(item.source==='inbox'&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'intakeDone',name:item.name});
 syncToolbar();
 if($('#modal').open&&$('#modal').dataset.view==='inbox')inboxDialog(false);
}
// Removes records in one undo step: links to them and manual order go too, and syncs will not add them back.
function deleteAssets(ids){
 const gone=ids.filter(id=>state.assets.some(a=>a.id===id));if(!gone.length)return 0;
 checkpoint();
 for(const id of gone){
  rememberDeleted(state.assets.find(a=>a.id===id));state.assets=state.assets.filter(x=>x.id!==id);removeLinksTo(state.assets,id);
  if(state.cardOrder){for(const key of Object.keys(state.cardOrder))state.cardOrder[key]=(state.cardOrder[key]||[]).filter(x=>x!==id);}
  if(activeAsset===id)closeDetail();
 }
 save();render();return gone.length;
}
function confirmDeleteAsset(id){const a=state.assets.find(a=>a.id===id);if(!a)return Promise.resolve(false);return confirmDialog(tr('删除「{name}」？',{name:a.name}),`${tr('只删除 Assetboard 里的记录，不取消订阅，也不动线上资源。之后同步不会加回。')}${linksNote(a)?'\n'+linksNote(a):''}${icpNote(a)?'\n'+icpNote(a).replace(/^[。.]\s*/,''):''}`,tr('删除'),true).then(ok=>{if(!ok||!deleteAssets([id]))return false;toast(tr('已删除'),true);return true;});}
// What deleting a record does to its links, in the words of each link (付款卡、登录账号…).
function linksNote(a){
 const links=linkedAssets(state.assets,a);if(!links.length)return '';
 if(a.type==='server')return tr('同时解除 {n} 项关联，域名和仓库本身不受影响。',{n:formatCount(links.length)});
 const impact=linkImpact(state.assets,a);
 const vars={n:formatCount(impact.length),role:IMPACT_WORDS[a.type]?.role};
 return tr('同时解除 {n} 项关联（{groups}）',{n:formatCount(links.length),groups:[...new Set(links.map(x=>linkGroupTitle(a,x)))].join(tr('、'))})+(impact.length?{pay:()=>tr('，它支付的 {n} 项将不再记录{role}',vars),verify:()=>tr('，靠它验证的 {n} 项将不再记录{role}',vars),login:()=>tr('，用它登录的 {n} 项将不再记录{role}',vars)}[IMPACT_WORDS[a.type].kind]():'')+tr('，关联的资产本身不受影响。');
}
// Agent delete requests are confirmed together: every request waiting in 待确认 is listed with a checkbox, and requests that
// arrive while the list is open join it. Deleting is one undo step; keeping (or Esc) answers every listed request.
let agentDeleteOpen=false,agentConfirmOpen=false;
function agentDeleteDialog(){
 for(const item of intake.filter(i=>i.deleteId&&!state.assets.some(a=>a.id===i.deleteId))){answerAgentAction(item.actionId,item.deleteId,'deleted','确认前已删除');finishIntake(item.id);save();}
 const items=intake.filter(i=>i.deleteId);
 if(!items.length){if(agentDeleteOpen){agentDeleteDone();$('#modal').close();}return;}
 const dialog=$('#modal'),content=$('#modal-content');
 const kept=agentDeleteOpen?new Set([...document.querySelectorAll('#agent-delete input[name="agent-delete"]:not(:checked)')].map(input=>input.value)):new Set();
 const scroll=agentDeleteOpen?content.scrollTop:0;
 const rows=items.map(item=>({item,a:state.assets.find(a=>a.id===item.deleteId)}));
 const links=rows.reduce((n,{a})=>n+(a.type==='server'?serverChainCount(state.assets,a):0),0);
 modal(rows.length===1?tr('删除「{name}」？',{name:rows[0].a.name}):tr('删除 {n} 项资产？',{n:formatCount(rows.length)}),`<form id="agent-delete" class="form">
  <p class="form-note">${rows.length===1?tr('外部工具请求删除这项资产。只删除 Assetboard 里的记录，不取消订阅，也不动线上资源；之后同步不会加回，可用 ⌘Z 撤销。'):tr('外部工具请求删除以下资产。只删除 Assetboard 里的记录，不取消订阅，也不动线上资源；之后同步不会加回，可用 ⌘Z 撤销。')}${links?tr('服务器的 {n} 项关联会一并解除。',{n:formatCount(links)}):''}</p>
  <div class="agent-delete-list">${rows.map(({item,a})=>`<label class="agent-delete-row"><input type="checkbox" name="agent-delete" value="${esc(item.id)}"${kept.has(item.id)?'':' checked'}><span class="agent-delete-main"><strong>${esc(a.name)}</strong><span class="candidate-meta">${esc([cats[a.type]?.one||a.type,a.provider,linkedAssets(state.assets,a).length?tr('解除 {n} 项关联',{n:formatCount(linkedAssets(state.assets,a).length)}):'',item.note].filter(Boolean).join(' · '))}</span></span></label>`).join('')}</div>
  <div class="confirm-actions"><button type="submit" class="button danger" id="agent-delete-yes"></button><button type="button" class="button" id="agent-delete-no">${tr('全部保留')}</button></div>
 </form>`,'agent-delete');
 content.scrollTop=scroll;agentDeleteCount();
 if(!agentDeleteOpen){agentDeleteOpen=true;dialog.addEventListener('close',agentDeleteClosed);$('#agent-delete-no').focus();}
 syncActionBanner();
}
function agentDeleteCount(){const n=document.querySelectorAll('#agent-delete input[name="agent-delete"]:checked').length,all=document.querySelectorAll('#agent-delete input[name="agent-delete"]').length,yes=$('#agent-delete-yes');if(!yes)return;yes.textContent=all===1?tr('删除'):n===all?tr('删除全部 {n} 项',{n:formatCount(n)}):tr('删除 {n} 项',{n:formatCount(n)});yes.disabled=!n;}
// Every listed request is answered (the agent sees the result through get); the next queued item may open.
function agentDeleteDone(){$('#modal').removeEventListener('close',agentDeleteClosed);agentDeleteOpen=false;const listed=intake.filter(i=>i.deleteId);for(const item of listed){answerAgentAction(item.actionId,item.deleteId,'kept');finishIntake(item.id);}if(listed.length)save();}
function agentDeleteClosed(){if($('#modal').open)return;agentDeleteDone();drainIntake();}
document.addEventListener('change',e=>{if(e.target.name==='agent-delete')agentDeleteCount();});
document.addEventListener('click',e=>{if(e.target.id!=='agent-delete-no')return;agentDeleteDone();$('#modal').close();drainIntake();});
document.addEventListener('submit',e=>{
 if(e.target.id!=='agent-delete')return;e.preventDefault();
 const chosen=new Set([...e.target.querySelectorAll('input[name="agent-delete"]:checked')].map(input=>input.value));
 const picked=intake.filter(i=>i.deleteId&&chosen.has(i.id)),ids=picked.map(i=>i.deleteId),listed=intake.filter(i=>i.deleteId).length;
 for(const item of picked)answerAgentAction(item.actionId,item.deleteId,state.assets.some(a=>a.id===item.deleteId)?'deleted':'failed',state.assets.some(a=>a.id===item.deleteId)?'':'记录已不存在');
 agentDeleteDone();$('#modal').close();
 const count=deleteAssets(ids);
 if(count)toast(count===listed?tr('已删除 {n} 项',{n:formatCount(count)}):tr('已删除 {n} 项，保留 {kept} 项',{n:formatCount(count),kept:formatCount(listed-count)}),true);
 drainIntake();
});
function intakeLabel(item){return (item.source==='service'?item.text.trim().split('\n')[0]:item.name).slice(0,100);}
function intakeRow(item){return `<article class="candidate"><div class="candidate-main"><strong>${esc(intakeLabel(item))}</strong><span class="candidate-meta">${esc(intakeSources[item.source])}${item.source==='inbox'?' · '+tr('导入或丢弃后移出文件夹'):''}</span></div><div class="candidate-actions"><button class="button" data-action="intake-open" data-id="${esc(item.id)}">${tr('打开')}</button><button class="text-button" data-action="intake-discard" data-id="${esc(item.id)}">${tr('丢弃')}</button></div></article>`;}
// The local agent interface (assetboard-cli and its MCP server): the app hands each call to assetboardAgent and sends the
// reply back. Reads return whole records; adds and edits apply at once and undo with ⌘Z; a delete only asks, through
// 待确认, and happens once confirmed here.
const AGENT_LIMIT=100;
const AGENT_TEXT_FIELDS={name:100,provider:80,account:100,purpose:100,reason:120,cost:80,notes:2000,project:40};
// Records as agents see them: no image data (it can run to tens of KB per record), only whether there is an icon and where it came from.
// Links come with their meaning from this record's side, and payment or verification at risk is spelled out.
function agentAsset(a){
 const {iconData,siteIcon,links,linkMeta,...rest}=a,status=agentIconStatus.get(a.id),risks=linkRisks(state.assets,a);
 const relations=linkedAssets(state.assets,a).map(x=>{const k=linkKind(a,x),meta=k.kind==='mount'?(x.type==='server'?linkMetaOf(a,x.id):linkMetaOf(x,a.id)):null;return {id:x.id,name:x.name,type:x.type,relation:k.kind,label:k.label,...(meta?.standby?{standby:true}:{}),...(meta?.proxied?{proxied:true}:{})};});
 const money=moneyOn(a,localDay()),change=priceChange(a),charges=pendingChargesAsked([a]);
 return {...rest,typeName:cats[a.type]?.name||a.type,billingType:billingTypeOf(a),billingTypeSet:BILLING_TYPES.includes(a.billingType),...(money?{currentPrice:{amount:money.value,currency:money.currency,months:money.months,basis:money.basis}}:{}),...(change?{priceChange:change}:{}),...(charges.length?{unconfirmedCharges:charges.map(c=>c.due)}:{}),hidden:isHidden(a),hasCustomIcon:!!customIconSrc(a),hasSiteIcon:!!siteIconSrc(a),relations,...(risks.length?{risks:risks.map(riskText)}:{}),...(status?{iconStatus:status}:{})};
}
// linkTo / unlinkFrom: ids of records to link or unlink, under the same rules as the picker (legal pairs, one account per server).
function agentLinkIds(input,key){
 if(!(key in input))return [];
 const v=input[key];
 if(!Array.isArray(v)||v.length>50||v.some(id=>typeof id!=='string'))throw new Error(`${key} 需要是资产 id 数组（最多 50 个）`);
 return [...new Set(v)];
}
function agentLinkProblem(a,id,linking){
 const x=state.assets.find(item=>item.id===id);
 if(!x)return `找不到要${linking?'关联':'解除'}的资产 ${id.slice(0,100)}`;
 const linked=linkedAssets(state.assets,a).some(item=>item.id===id);
 if(linking&&!linked&&!linkAllowed(a,x))return `${cats[a.type].name}「${a.name}」不能关联${cats[x.type].name}「${x.name}」`;
 if(!linking&&!linked)return `「${a.name}」和「${x.name}」没有关联`;
 return '';
}
// Icons from agents. iconHost: a domain the app fetches the site icon from (like 获取网站图标, recorded in 网络记录), applied
// when it arrives; icon: an image the agent already has, held to the same rules as an uploaded custom icon. Empty clears either.
const AGENT_ICON_BASE=1e9;let agentIconSequence=AGENT_ICON_BASE;const agentIconRequests=new Map(),agentIconStatus=new Map();
function agentIconFetch(id,host){
 if(!nativeStore||demoMode){agentIconStatus.set(id,'failed: 网站图标只能在 Mac App 里获取');return 'failed';}
 const platform=iconPlatformOf(iconSites(),host);if(Object.prototype.hasOwnProperty.call(iconSites(),platform))host=iconSiteFor(iconSites(),platform);
 const requestId=++agentIconSequence;agentIconRequests.set(requestId,{id,host});agentIconStatus.set(id,'fetching');
 window.webkit.messageHandlers.assetboard.postMessage({action:'iconFetch',requestId,host});
 setTimeout(()=>{if(agentIconRequests.delete(requestId))agentIconStatus.set(id,'failed: 超时');},30000);
 return 'fetching';
}
function agentIconReply(result){
 const request=agentIconRequests.get(result.requestId);agentIconRequests.delete(result.requestId);
 const a=state.assets.find(x=>x.id===request.id);if(!a)return;
 const src=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 if(!src){agentIconStatus.set(a.id,`failed: ${String(result.error||'没有获取到可用的图标').slice(0,120)}`);return;}
 agentIconStatus.delete(a.id);
 a.siteIcon=src;a.siteIconHost=String(result.host||request.host);save();render();if(activeAsset===a.id)showDetail(a.id);
}
// The icon fields of one add or update: what to write now, a host to fetch afterwards, or the first problem.
function agentIconFields(input){
 const out={};
 if('icon' in input){
  const v=input.icon==null?'':input.icon;
  if(typeof v!=='string')return {error:'icon 需要是 data:image/png、jpeg 或 webp 的 base64 文字'};
  if(v&&!customIconSrc({iconData:v}))return {error:'icon 需要是 data:image/png、jpeg 或 webp 的 base64，且不超过 256 KB'};
  if(v&&Math.floor(v.split(',')[1].length*3/4)>256*1024)return {error:'icon 不能超过 256 KB'};
  out.icon=v;
 }
 if('iconHost' in input){
  const v=input.iconHost==null?'':input.iconHost;
  if(typeof v!=='string'||v.length>300)return {error:'iconHost 需要是域名或网址，例如 wise.com'};
  out.iconHost=v.trim();
 }
 return out;
}
function agentApplyIcon(a,icon){
 if('icon' in icon){if(icon.icon)a.iconData=icon.icon;else delete a.iconData;}
 if('iconHost' in icon&&!icon.iconHost){delete a.siteIcon;delete a.siteIconHost;agentIconStatus.delete(a.id);}
}
function agentEvent(fields){return fields.date?`${fields.date} ${dateKinds[fields.dateKind||'expire'].future}`:'日期待补充';}
// Checks fields sent from outside for one asset of the given type: the fields to write, or the first problem found.
function agentFields(input,type,base=null){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'字段需要是对象'};
 const fields={},ignored=[],after=[],actions=ACTION_FIELDS[type]||[];
 for(const [key,raw] of Object.entries(input)){
  if(['type','id','icon','iconHost','linkTo','unlinkFrom','amount','currency','promotion'].includes(key))continue;
  // Updates only: hidden and stopped (true or false, like 隐藏 and 已停用), and fields a Pro script adds (probeLink).
  if(key==='hidden'||key==='stopped'||Object.hasOwn(proSlots.agentFields,key)){
   if(!base){ignored.push(key);continue;}
   if(key==='hidden'){if(typeof raw!=='boolean')return {error:'hidden 需要是 true 或 false'};fields.hiddenAt=raw?base.hiddenAt||new Date().toISOString():null;continue;}
   if(key==='stopped'){if(typeof raw!=='boolean')return {error:'stopped 需要是 true 或 false'};if(raw&&!STOPPABLE.includes(type))return {error:`只有${STOPPABLE.map(t=>cats[t].name).join('、')}可以标为停用`};fields.stopped=raw||null;continue;}
   const pro=proSlots.agentFields[key](raw,{...base,type});if(pro.error)return {error:pro.error};fields[key]=pro.value;if(pro.after)after.push(pro.after);continue;
  }
  if(key==='projectId'&&!('project' in input)){const text=cleanProject(raw);fields.project=text;continue;}
  if(key==='billingType'){const text=raw==null?'':String(raw).trim();if(text&&!BILLING_TYPES.includes(text))return {error:`billingType 只能是 ${BILLING_TYPES.join('、')} 或留空`};fields.billingType=text;continue;}
  const value=raw===null||raw===undefined?'':typeof raw==='number'?String(raw):key==='ips'&&Array.isArray(raw)?raw.join(', '):raw;
  if(typeof value!=='string')return {error:`${key} 需要是文字`};
  const text=value.trim();
  // 找回 and 备份 (research round 4): only for the types they apply to, places only.
  if(['mfa','mfaWhere','recoveryCodes','vault','legacy','backup','backupNote','restoreTestedOn','importance'].includes(key)){
   const types=key==='importance'?null:key==='legacy'?Object.keys(LEGACY_WORDS):['mfa','mfaWhere','recoveryCodes','vault'].includes(key)?RECOVERY_TYPES:BACKUP_TYPES;
   if(types&&!types.includes(type))return {error:`${key} 只用于${types.map(t=>cats[t].name).join('、')}`};
   const words={mfa:MFA_KINDS,legacy:LEGACY_STATES,backup:BACKUP_KINDS,importance:IMPORTANCE}[key];
   if(words){if(text&&!words[text])return {error:`${key} 只能是 ${Object.keys(words).join('、')} 或留空`};fields[key]=text;continue;}
   if(key==='restoreTestedOn'){const day=text?parseLooseDate(text):'';if(text&&!day)return {error:'restoreTestedOn 无法识别，请用 2026-05-01'};fields[key]=day;continue;}
   if(text.length>(key==='backupNote'?100:60))return {error:`${key} 最多 ${key==='backupNote'?100:60} 字`};
   if(looksLikeSecret(text)||looksLikeCardNumber(text))return {error:`${key} 像是验证码、恢复码或密钥；这里只记它放在哪`};
   fields[key]=text;continue;
  }
  if(key in AGENT_TEXT_FIELDS){
   if(text.length>AGENT_TEXT_FIELDS[key])return {error:`${key} 最多 ${AGENT_TEXT_FIELDS[key]} 字`};
   if(key==='project'){fields.project=cleanProject(text);continue;}
   if(looksLikeCardNumber(text))return {error:`${key} 像是完整卡号；Assetboard 只保存卡号后 4 位（last4）`};
   fields[key]=text;
  }else if(key==='date'){const date=text?parseLooseDate(text):'';if(text&&!date)return {error:'date 无法识别，请用 2027-03-01'};fields.date=date;}
  else if(key==='dateKind'){if(!dateKinds[text])return {error:`dateKind 只能是 ${Object.keys(dateKinds).join('、')}`};fields.dateKind=text;}
  else if(key==='cycle'){if(text&&!billingCycles[text])return {error:`cycle 只能是 ${Object.keys(billingCycles).join('、')} 或留空`};fields.cycle=text;}
  else if(key==='url'){const url=text?safeManagementUrl(text):'';if(text&&!url)return {error:'url 需要是不含账号密码的 http 或 https 链接'};fields.url=url;}
  else if(key==='region'){const code=text.toUpperCase();if(code&&!regionName(code))return {error:'region 需要是国家或地区代码，例如 US、HK、GB'};fields.region=code;}
  else if(key==='last4'){if(text&&!/^\d{4}$/.test(text))return {error:'last4 只能是 4 位数字'};fields.last4=text;}
  else if(key==='network'){if(text&&!cardNetworks.includes(text))return {error:`network 只能是 ${cardNetworks.join('、')}`};fields.network=text;}
  else if(key==='cardStatus'){if(text&&!CARD_STATUSES[text])return {error:`cardStatus 只能是 ${Object.keys(CARD_STATUSES).join('、')} 或留空（正常）`};fields.cardStatus=text;}
  else if(key==='phoneStatus'){if(text&&!PHONE_STATUSES[text])return {error:`phoneStatus 只能是 ${Object.keys(PHONE_STATUSES).join('、')} 或留空（正常）`};fields.phoneStatus=text;}
  else if(key==='phone'){if(text.length>30)return {error:'phone 最多 30 字'};fields.phone=text;}
  else if(actions.some(([name])=>name===key)){if(!validActionField(key,text))return {error:`${key} 格式不对`};fields[key]=key==='ips'?parseIps(text).ips.map(x=>x.ip):text;}
  else ignored.push(key);
 }
 // amount + currency write the cost text together with the cycle; currency alone corrects the currency of the amount already there.
 if('amount' in input||'currency' in input){
  const own=base?costAmount(base):null,raw=input.amount===undefined?own?.value:input.amount,value=typeof raw==='string'?Number(raw.trim().replace(/,/g,'')):raw;
  const code=input.currency===undefined?own?.currency||defaultCurrency():String(input.currency||'').trim().toUpperCase();
  if(raw===null||raw===''){fields.cost='未知';}
  else if(value===0){fields.cost='免费';if(!('billingType' in fields))fields.billingType='free';}
  else{
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)return {error:'amount 需要是不小于 0 的数字（0 表示免费）'};
   if(!/^[A-Z]{3}$/.test(code)||!(code in FALLBACK_RATES.rates))return {error:`currency 需要是 ${Object.keys(FALLBACK_RATES.rates).join('、')} 之一`};
   const cycle='cycle' in fields?fields.cycle:base?.cycle||'';
   fields.cost=formatCost({currency:code,value:String(Math.round(value*100)/100)},cycle);
   if(fields.billingType===undefined&&base?.billingType==='free')fields.billingType='';
  }
 }
 // promotion: {start?, end, amount, regularAmount, currency?}; null or {} removes it. The currency defaults to the record's own.
 if('promotion' in input){
  const raw=input.promotion;
  if(raw===null||raw===''||(raw&&typeof raw==='object'&&!Object.keys(raw).length))fields.promotion=null;
  else{
   if(typeof raw!=='object'||Array.isArray(raw))return {error:'promotion 需要是对象 {start, end, amount, regularAmount, currency}'};
   const date=key=>{const t=raw[key]==null?'':String(raw[key]).trim();return t?parseLooseDate(t):'';};
   const fresh=fields.cost?costParts(fields.cost):null,own=fresh?{value:Number(fresh.value),currency:fresh.currency}:base?costAmount(base):null,start=date('start'),end=date('end');
   if(raw.start&&!start)return {error:'promotion.start 无法识别，请用 2026-11-01'};
   if(!end)return {error:'promotion.end 必填，例如 2026-12-31'};
   const promo=validPromotion({start,end,amount:raw.amount,regularAmount:raw.regularAmount??own?.value,currency:raw.currency||own?.currency||defaultCurrency()});
   if(!promo)return {error:'promotion 需要 end、不小于 0 的 amount、大于 0 的 regularAmount，start 不晚于 end，币种为三位代码'};
   fields.promotion=promo;
  }
 }
 return {fields,ignored,after};
}
function agentFind(id){const a=state.assets.find(x=>x.id===id);if(!a)throw new Error(`找不到资产 ${String(id).slice(0,100)}`);return a;}
const agentMethods={
 types:()=>Object.entries(cats).map(([id,c])=>({id,name:c.name,hint:c.hint,...(assetProfiles[id]?.fixedProvider?{provider:assetProfiles[id].fixedProvider}:{providers:providerPresets(id)})})),
 list:({type='',query:text='',includeHidden=false,limit=100,offset=0,project='',billingType=''})=>{
  if(billingType&&!BILLING_TYPES.includes(billingType))throw new Error(`billingType 只能是 ${BILLING_TYPES.join('、')}`);
  const needle=String(text||'').trim().toLowerCase();
  const hits=agentScope({type,project,includeHidden}).filter(a=>(!billingType||billingTypeOf(a)===billingType)&&(!needle||`${searchText(a)} ${String(a.notes||'').toLowerCase()}`.includes(needle)));
  const start=Math.max(Number(offset)||0,0),count=Math.min(Math.max(Number(limit)||100,1),500);
  return {total:hits.length,offset:start,assets:hits.slice(start,start+count).map(agentAsset)};
 },
 get:({id})=>agentAsset(agentFind(id)),
 // Recurring cost in one currency (records keep their own), by category and largest first, with what could not be counted.
 totals:({currency='',type='',project='',groupBy=''})=>{
  const cur=agentCurrency(currency);
  if(groupBy&&!['project','type'].includes(groupBy))throw new Error('groupBy 只能是 project、type');
  const scope=agentScope({type,project}),t=costTotals(scope,{currency:cur,rates:fx.rates}),round=n=>Math.round(n*100)/100;
  const groups=groupBy?[...new Set(scope.map(a=>groupBy==='project'?cleanProject(a.project):a[groupBy]||''))].map(key=>{const g=costTotals(scope.filter(a=>(groupBy==='project'?cleanProject(a.project):a[groupBy]||'')===key),{currency:cur,rates:fx.rates});return {[groupBy]:key||null,monthly:round(g.monthly),yearly:round(g.yearly),oneOff:round(g.oneOffTotal),count:g.items.length};}).sort((x,y)=>y.monthly-x.monthly):null;
  return {currency:cur,monthly:round(t.monthly),yearly:round(t.yearly),rates:{date:fx.date,source:fx.source,current:!fx.fallback&&fx.ok},
   byType:t.byType.map(([id,m])=>({type:id,typeName:cats[id]?.name||id,monthly:round(m)})),
   items:t.items.map(({asset,monthly})=>({id:asset.id,name:asset.name,cost:asset.cost,monthly:round(monthly)})),
   oneOffTotal:round(t.oneOffTotal),...(groups?{groups}:{}),
   notCounted:{free:t.free.map(a=>a.id),oneOff:t.oneOff.map(a=>a.id),noCycle:t.noCycle.map(a=>a.id),unreadable:t.unreadable.map(a=>a.id),noRate:t.noRate.map(a=>a.id)}};
 },
 add:({items})=>{
  const list=Array.isArray(items)?items:items&&typeof items==='object'?[items]:null;
  if(!list?.length)throw new Error('items 需要是资产数组');
  if(list.length>AGENT_LIMIT)throw new Error(`一次最多 ${AGENT_LIMIT} 项`);
  const now=new Date().toISOString(),planned=[],skipped=[],errors=[],warnings=[],iconHosts=new Map(),linkPlans=[];
  list.forEach((item,index)=>{
   const name=typeof item?.name==='string'?item.name.trim():'';
   if(!name){errors.push({index,error:'缺少 name'});return;}
   const type=item.type?String(item.type):inferTypeFromName(name)||'subscription';
   if(!cats[type]){errors.push({index,error:`未知类别 ${type}，可用：${Object.keys(cats).join('、')}`});return;}
   const checked=agentFields(item,type),icon=agentIconFields(item);
   if(checked.error||icon.error){errors.push({index,error:checked.error||icon.error});return;}
   let linkTo;try{linkTo=agentLinkIds(item,'linkTo');}catch(error){errors.push({index,error:error.message});return;}
   const same=[...state.assets,...planned].find(a=>a.type===type&&String(a.name).trim().toLowerCase()===name.toLowerCase());
   if(same){skipped.push({index,id:same.id,name:same.name,reason:'同类别已有同名资产，要修改请用 update'});return;}
   const profile=assetProfiles[type]||{};
   const fields={provider:'',account:'',purpose:'',reason:'',date:'',dateKind:profile.dateKind||'expire',cycle:'',cost:'未知',notes:'',url:'',...checked.fields};
   if(profile.fixedProvider)fields.provider=profile.fixedProvider;
   else if(!fields.provider&&!assetProfiles[type])fields.provider='平台待补充';
   if(!fields.cost)fields.cost='未知';
   const record={id:'asset-'+crypto.randomUUID(),type,...fields,source:'agent',event:agentEvent(fields),art:'generic',createdAt:now};clearEmptyFields(record);
   agentApplyIcon(record,icon);if(icon.iconHost)iconHosts.set(record.id,icon.iconHost);
   if(linkTo.length)linkPlans.push({index,record,linkTo});
   planned.push(record);
   if(checked.ignored.length)warnings.push({index,ignored:checked.ignored});
  });
  if(planned.length){
   checkpoint();
   for(const a of planned){state.assets.push(a);if(state.cardOrder?.[a.type]?.length)state.cardOrder[a.type].unshift(a.id);ensureBlock(state,a.type);}
   for(const {index,record,linkTo} of linkPlans)for(const id of linkTo){const problem=agentLinkProblem(record,id,true);if(problem)warnings.push({index,link:id,error:problem});else linkRelation(state.assets,record.id,id);}
   save();render();
   toast(planned.length===1?tr('外部工具添加了「{name}」',{name:planned[0].name}):tr('外部工具添加了 {n} 项',{n:planned.length}),true);
  }
  const icons=new Map([...iconHosts].map(([id,host])=>[id,agentIconFetch(id,host)]));
  return {added:planned.map(a=>({id:a.id,name:a.name,type:a.type,...(icons.has(a.id)?{iconStatus:icons.get(a.id)}:{})})),skipped,errors,warnings};
 },
 update:({id,fields:input})=>{
  const plan=agentPrepareUpdate(id,input);
  checkpoint();const result=plan.apply();costSource='agent';save();render();if(activeAsset===result.asset.id)showDetail(result.asset.id);
  toast(tr('外部工具更新了「{name}」',{name:result.asset.name}),true);
  return result;
 },
 // Batch edit: every item is checked first; the valid ones are written together as one undo step, the rest say why not.
 updateMany:({updates})=>{
  if(!Array.isArray(updates)||!updates.length)throw new Error('updates 需要是 [{id, fields}] 数组');
  if(updates.length>AGENT_LIMIT)throw new Error(`一次最多 ${AGENT_LIMIT} 项`);
  const plans=[],results=[];
  updates.forEach((item,index)=>{try{plans.push({index,plan:agentPrepareUpdate(item?.id,item?.fields)});}catch(error){results[index]={index,id:item?.id??null,ok:false,error:String(error?.message||error)};}});
  if(plans.length){
   checkpoint();
   for(const {index,plan} of plans){try{const r=plan.apply();results[index]={index,id:r.asset.id,ok:true,asset:r.asset,...(r.ignored.length?{ignored:r.ignored}:{})};}catch(error){results[index]={index,ok:false,error:String(error?.message||error)};}}
   costSource='agent';save();render();if(activeAsset&&plans.length)showDetail(activeAsset,{focus:false});
   toast(tr('外部工具更新了 {n} 项',{n:formatCount(plans.length)}),true);
  }
  return {updated:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
 },
 // Never deletes by itself: the request waits for the person, who confirms every listed record in one list. The returned
 // actionId can be looked up with action / actions. Asking again for a record that already waits is folded into that request.
 delete:({id,reason=''})=>agentRequestDelete([id],reason),
 deleteMany:({ids,reason=''})=>{if(!Array.isArray(ids)||!ids.length)throw new Error('ids 需要是资产 id 数组');if(ids.length>AGENT_LIMIT)throw new Error(`一次最多 ${AGENT_LIMIT} 项`);return agentRequestDelete(ids,reason);},
 actions:({status='',limit=50})=>{
  const want=String(status||'');if(want&&!['pending','done','cancelled','failed'].includes(want))throw new Error('status 只能是 pending、done、cancelled、failed 或留空');
  const list=agentActionList().filter(a=>!want||a.status===want).slice(-Math.min(Math.max(Number(limit)||50,1),200)).reverse();
  return {total:list.length,pending:agentActionList().filter(a=>a.status==='pending').length,actions:list};
 },
 action:({id})=>{const a=agentActionList().find(x=>x.id===id);if(!a)throw new Error(`找不到请求 ${String(id).slice(0,60)}`);return a;},
 // Charges: what was paid, and automatic charges that came due and wait for an answer.
 recordPayment:({id,paidOn='',amount,currency='',covers='',months=null,note='',missed=false})=>{
  const a=agentFind(id),day=paidOn?parseLooseDate(String(paidOn)):isoDay(localDay());
  if(!day)throw new Error('paidOn 无法识别，请用 2026-10-01');
  const coverDay=covers?parseLooseDate(String(covers)):'';if(covers&&!coverDay)throw new Error('covers 无法识别');
  const own=moneyOn(a,dayNumber(coverDay||day)),value=amount===undefined||amount===null?own?.value:Number(amount),code=String(currency||own?.currency||'').toUpperCase();
  if(!missed&&!(value>0))throw new Error('amount 需要是大于 0 的数字');
  if(!missed&&!(code in FALLBACK_RATES.rates))throw new Error(`currency 需要是 ${Object.keys(FALLBACK_RATES.rates).join('、')} 之一`);
  checkpoint();
  const payment=recordPayment(a,{paidOn:day,amount:value,currency:code,months:months||billingCycles[a.cycle]?.months||own?.months||null,covers:coverDay,via:'agent',status:missed?'missed':'paid',note});
  if(!payment){history.pop();throw new Error('付款记录无效');}
  a.updatedAt=new Date().toISOString();save();render();if(activeAsset===a.id)showDetail(a.id,{focus:false});
  toast(missed?tr('外部工具记下了「{name}」的未扣款',{name:a.name}):tr('外部工具记下了「{name}」的付款',{name:a.name}),true);
  return {payment,asset:agentAsset(a)};
 },
 // 待确认扣款 is Pro: the free edition answers with an empty list.
 charges:()=>({charges:pendingChargesAsked(state.assets).map(c=>({id:c.asset.id,name:c.asset.name,due:c.due,daysAgo:c.days,...(c.money?{amount:c.money.value,currency:c.money.currency}:{})}))}),
 renew:({id,until,amount,currency='',paidOn='',updateCost=true})=>{
  const a=agentFind(id),date=until?parseLooseDate(String(until)):'';if(!date)throw new Error('until 需要是新的到期或扣款日期，例如 2027-03-01');
  if(!canRenew(a))throw new Error('这项资产没有可续费的日期（需要到期、扣款或保号日期）');
  const own=costAmount(a),day=paidOn?parseLooseDate(String(paidOn)):'';
  checkpoint();
  const result=renewAsset(a,{until:date,paidOn:day||undefined,amount:amount??0,currency:String(currency||own?.currency||'').toUpperCase(),updateCost:!!updateCost});
  if(!result.ok){history.pop();throw new Error(result.error);}
  costSource='renew';save();render();if(activeAsset===a.id)showDetail(a.id,{focus:false});
  toast(tr('外部工具续费了「{name}」',{name:a.name}),true);
  return {asset:agentAsset(a),payment:result.payment,from:result.base,months:result.months};
 },
 forecast:({from='',to='',months=12,currency='',type='',project=''})=>{
  const cur=agentCurrency(currency),lo=from?parseLooseDate(String(from)):isoDay(localDay()),hi=to?parseLooseDate(String(to)):isoDay(dayNumber(addMonths(lo||isoDay(localDay()),Math.min(Math.max(Number(months)||12,1),60)))-1);
  if(!lo||!hi||dayNumber(hi)<dayNumber(lo))throw new Error('from / to 需要是日期，且 to 不早于 from');
  if(dayNumber(hi)-dayNumber(lo)>366*5)throw new Error('最多预测 5 年');
  return costForecast(agentScope({type,project}),{from:lo,to:hi,currency:cur,rates:fx.rates});
 },
 costHistory:({id='',from='',limit=200})=>{
  const lo=from?Date.parse(String(from)):-Infinity,rows=[];
  for(const a of id?[agentFind(id)]:state.assets)for(const h of Array.isArray(a.costHistory)?a.costHistory:[])if(Date.parse(h.at)>=lo)rows.push({id:a.id,name:a.name,...h});
  rows.sort((x,y)=>Date.parse(y.at)-Date.parse(x.at));
  return {total:rows.length,history:rows.slice(0,Math.min(Math.max(Number(limit)||200,1),1000)),...(id?{payments:paymentList(agentFind(id))}:{})};
 },
 projects:()=>{
  const cur=totalCurrency(),round=n=>Math.round(n*100)/100;
  return {currency:cur,projects:projectsOn()?projectNames(state.assets).map(({name,count})=>{const t=costTotals(projectAssets(state.assets,name),{currency:cur,rates:fx.rates});return {name,count,monthly:round(t.monthly),yearly:round(t.yearly)};}):[]};
 }
};
function agentCurrency(currency){const cur=currency?String(currency).toUpperCase():totalCurrency();if(!(cur in FALLBACK_RATES.rates))throw new Error(`currency 需要是 ${Object.keys(FALLBACK_RATES.rates).join('、')} 之一`);return cur;}
// Live records narrowed by category or project (both optional).
function agentScope({type='',project='',includeHidden=false}={}){
 if(type&&!cats[type])throw new Error(`未知类别 ${type}`);
 const want=cleanProject(project);
 return state.assets.filter(a=>(includeHidden||!isHidden(a))&&(!type||a.type===type)&&(!want||cleanProject(a.project)===want));
}
// Checks one update completely before anything changes; apply() then writes it (the caller takes the undo checkpoint and saves).
function agentPrepareUpdate(id,input){
 const a=agentFind(id),synced=PLATFORM_SOURCES.includes(a.source);
 const type=input?.type?String(input.type):a.type;
 if(!cats[type])throw new Error(`未知类别 ${type}`);
 if(synced&&(type!==a.type||('name' in (input||{})&&String(input.name).trim()!==a.name)))throw new Error('这条记录由 Cloudflare 或 GitHub 同步，名称和类别以同步为准，不能改');
 const checked=agentFields(input,type,a),icon=agentIconFields(input||{}),linkTo=agentLinkIds(input||{},'linkTo'),unlinkFrom=agentLinkIds(input||{},'unlinkFrom');
 if(checked.error||icon.error)throw new Error(checked.error||icon.error);
 const linkProblem=[...linkTo.map(id=>agentLinkProblem({...a,type},id,true)),...unlinkFrom.map(id=>agentLinkProblem(a,id,false))].find(Boolean);
 if(linkProblem)throw new Error(linkProblem);
 if('name' in checked.fields&&!checked.fields.name)throw new Error('name 不能为空');
 if(!Object.keys(checked.fields).length&&!Object.keys(icon).length&&!linkTo.length&&!unlinkFrom.length&&type===a.type)throw new Error(checked.ignored.length?`没有可修改的字段（已忽略：${checked.ignored.join('、')}）`:'没有要修改的字段');
 return {apply(){
  Object.assign(a,checked.fields);clearEmptyFields(a);agentApplyIcon(a,icon);for(const fn of checked.after)fn(a);
  if(!synced){a.type=type;ensureBlock(state,type);}
  for(const id of unlinkFrom)unlinkAssets(state.assets,a.id,id);
  const replaced=linkTo.flatMap(id=>linkRelation(state.assets,a.id,id).replaced);
  if('date' in checked.fields||'dateKind' in checked.fields)a.event=agentEvent(a);
  a.updatedAt=new Date().toISOString();delete a.warn;
  if(icon.iconHost)agentIconFetch(a.id,icon.iconHost);
  return {asset:agentAsset(a),ignored:checked.ignored,...(replaced.length?{replacedAccounts:replaced}:{})};
 }};
}
// Optional fields set to nothing are removed rather than stored empty.
function clearEmptyFields(a){for(const key of ['promotion','billingType','ownerType','project','responsiblePerson','hiddenAt','stopped','probeLink','importance','mfa','mfaWhere','recoveryCodes','vault','legacy','backup','backupNote','restoreTestedOn','dnsHost'])if(a[key]===null||a[key]==='')delete a[key];return a;}
// Agent requests that wait for the person (deletes). They live on the board, outside undo, so an agent can look them up later:
// pending → done (every record answered, at least one deleted), cancelled (all kept) or failed (none could be deleted).
const AGENT_ACTION_LIMIT=200;
function agentActionList(){if(!Array.isArray(state.agentActions))state.agentActions=[];return state.agentActions;}
function agentRequestDelete(ids,reason){
 const assets=[],missing=[];
 for(const id of [...new Set(ids.map(String))]){const a=state.assets.find(x=>x.id===id);if(a)assets.push(a);else missing.push(id);}
 if(!assets.length)throw new Error(`找不到资产 ${missing.slice(0,5).join('、').slice(0,200)}`);
 const waiting=new Map(intake.filter(item=>item.deleteId).map(item=>[item.deleteId,item.actionId]));
 const fresh=assets.filter(a=>!waiting.has(a.id)),list=agentActionList();
 let action=null;
 if(fresh.length){
  action={id:'act-'+crypto.randomUUID(),kind:'delete',status:'pending',requestedAt:new Date().toISOString(),reason:String(reason||'').trim().slice(0,200),items:fresh.map(a=>({id:a.id,name:a.name,type:a.type,status:'pending'}))};
  list.push(action);
  while(list.length>AGENT_ACTION_LIMIT){const old=list.findIndex(x=>x.status!=='pending');if(old<0)break;list.splice(old,1);}
  save();
  queueIntake(fresh.map(a=>({source:'agent',name:tr('删除「{name}」',{name:a.name}),deleteId:a.id,actionId:action.id,note:action.reason})));
  agentDeleteNudge();
 }
 const already=assets.filter(a=>waiting.has(a.id)).map(a=>({id:a.id,actionId:waiting.get(a.id)}));
 return {status:'pending',...(action?{actionId:action.id}:{}),requested:fresh.map(a=>a.id),...(already.length?{alreadyPending:already}:{}),...(missing.length?{notFound:missing}:{}),message:'已请求删除，等待在 Assetboard 里确认；用 get_action_status 查询结果'};
}
// One record of a request answered: deleted, kept or failed. The request settles once every record has an answer.
function answerAgentAction(actionId,assetId,status,error=''){
 const action=agentActionList().find(x=>x.id===actionId);if(!action||action.status!=='pending')return;
 const item=action.items.find(x=>x.id===assetId&&x.status==='pending');if(!item)return;
 item.status=status;if(error)item.error=error;
 if(action.items.some(x=>x.status==='pending'))return;
 action.status=action.items.some(x=>x.status==='deleted'||x.status==='applied')?'done':action.items.every(x=>x.status==='kept'||x.status==='declined')?'cancelled':action.items.every(x=>x.status==='failed')?'failed':'cancelled';
 action.resolvedAt=new Date().toISOString();
}
// Settings an agent asks to change that only the person may allow (Pro registers each kind in proSlots.agentConfirms: removing a
// probe source, turning on SSH 直读 for a host, letting a sync add back what was deleted). Like a delete, nothing happens at once:
// the request waits in 待确认 and in state.agentActions; the person ticks what to allow, and only then does the kind's apply() run.
// Items end applied, declined or failed; asking again for one that already waits is folded into that request.
function agentRequestConfirm(kind,targets,reason=''){
 const def=proSlots.agentConfirms[kind];if(!def)throw new Error(`不支持的请求 ${kind}`);
 const waiting=new Map(intake.filter(i=>i.confirmKind===kind).map(i=>[i.confirmId,i.actionId]));
 const fresh=targets.filter(t=>!waiting.has(t.id)),list=agentActionList();
 let action=null;
 if(fresh.length){
  action={id:'act-'+crypto.randomUUID(),kind,status:'pending',requestedAt:new Date().toISOString(),reason:String(reason||'').trim().slice(0,200),items:fresh.map(t=>({id:t.id,name:t.name,status:'pending'}))};
  list.push(action);
  while(list.length>AGENT_ACTION_LIMIT){const old=list.findIndex(x=>x.status!=='pending');if(old<0)break;list.splice(old,1);}
  save();
  queueIntake(fresh.map(t=>agentConfirmEntry(action,t)));
  agentDeleteNudge();
 }
 const already=targets.filter(t=>waiting.has(t.id)).map(t=>({id:t.id,actionId:waiting.get(t.id)}));
 return {status:'pending',...(action?{actionId:action.id}:{}),requested:fresh.map(t=>t.id),...(already.length?{alreadyPending:already}:{}),message:'已请求，等待在 Assetboard 里确认；用 get_action_status 查询结果'};
}
function agentConfirmEntry(action,t){return {source:'agent',name:proSlots.agentConfirms[action.kind].label(t),confirmKind:action.kind,confirmId:t.id,confirmName:t.name,actionId:action.id,note:action.reason};}
// The list: every waiting request with a checkbox (ticked), each kind's warning once; requests that arrive meanwhile join it.
function agentConfirmDialog(){
 const items=intake.filter(i=>i.confirmKind);
 if(!items.length){if(agentConfirmOpen){agentConfirmDone();$('#modal').close();}return;}
 const content=$('#modal-content'),dialog=$('#modal');
 const kept=agentConfirmOpen?new Set([...document.querySelectorAll('#agent-confirm input[name="agent-confirm"]:not(:checked)')].map(input=>input.value)):new Set();
 const scroll=agentConfirmOpen?content.scrollTop:0,kinds=[...new Set(items.map(i=>i.confirmKind))];
 const title=kinds.length===1?proSlots.agentConfirms[kinds[0]].title(items.length):tr('外部工具的 {n} 项请求',{n:formatCount(items.length)});
 modal(title,`<form id="agent-confirm" class="form">
  <p class="form-note">${tr('外部工具请求修改以下设置，勾选的才会生效。')}</p>${kinds.map(k=>proSlots.agentConfirms[k].note?`<p class="form-note form-warning">${esc(proSlots.agentConfirms[k].note)}</p>`:'').join('')}
  <div class="agent-delete-list">${items.map(item=>`<label class="agent-delete-row"><input type="checkbox" name="agent-confirm" value="${esc(item.id)}"${kept.has(item.id)?'':' checked'}><span class="agent-delete-main"><strong>${esc(item.name)}</strong>${item.note?`<span class="candidate-meta">${esc(item.note)}</span>`:''}</span></label>`).join('')}</div>
  <div class="confirm-actions"><button type="submit" class="button primary" id="agent-confirm-yes">${tr('允许')}</button><button type="button" class="button" id="agent-confirm-no">${tr('全部拒绝')}</button></div>
 </form>`,'agent-confirm');
 content.scrollTop=scroll;agentConfirmCount();
 if(!agentConfirmOpen){agentConfirmOpen=true;dialog.addEventListener('close',agentConfirmClosed);$('#agent-confirm-no').focus();}
 syncActionBanner();
}
function agentConfirmCount(){const n=document.querySelectorAll('#agent-confirm input[name="agent-confirm"]:checked').length,all=document.querySelectorAll('#agent-confirm input[name="agent-confirm"]').length,yes=$('#agent-confirm-yes');if(!yes)return;yes.textContent=all===1||n===all?tr('允许'):tr('允许 {n} 项',{n:formatCount(n)});yes.disabled=!n;}
// Whatever is still listed when the list closes is declined.
function agentConfirmDone(){$('#modal').removeEventListener('close',agentConfirmClosed);agentConfirmOpen=false;const listed=intake.filter(i=>i.confirmKind);for(const item of listed){answerAgentAction(item.actionId,item.confirmId,'declined');finishIntake(item.id);}if(listed.length)save();}
function agentConfirmClosed(){if($('#modal').open)return;agentConfirmDone();drainIntake();}
document.addEventListener('change',e=>{if(e.target.name==='agent-confirm')agentConfirmCount();});
document.addEventListener('click',e=>{if(e.target.id!=='agent-confirm-no')return;agentConfirmDone();$('#modal').close();drainIntake();});
document.addEventListener('submit',e=>{
 if(e.target.id!=='agent-confirm')return;e.preventDefault();
 const chosen=new Set([...e.target.querySelectorAll('input[name="agent-confirm"]:checked')].map(input=>input.value));
 let applied=0,failed=0;
 for(const item of intake.filter(i=>i.confirmKind&&chosen.has(i.id))){
  let problem='';try{problem=proSlots.agentConfirms[item.confirmKind].apply({id:item.confirmId,name:item.confirmName})||'';}catch(error){problem=String(error?.message||error);}
  answerAgentAction(item.actionId,item.confirmId,problem?'failed':'applied',problem.slice(0,200));if(problem)failed++;else applied++;
 }
 agentConfirmDone();$('#modal').close();
 if(applied||failed)toast(failed?tr('已允许 {n} 项，{failed} 项没有成功',{n:formatCount(applied),failed:formatCount(failed)}):tr('已允许 {n} 项',{n:formatCount(applied)}));
 drainIntake();
});
window.assetboardAgent=call=>{
 const send=body=>{if(nativeStore&&call?.requestId)window.webkit.messageHandlers.assetboard.postMessage({action:'agentReply',requestId:String(call.requestId),reply:JSON.stringify(body)});return body;};
 if(demoMode)return send({ok:false,error:'演示模式不接受外部调用'});
 if(!featureOn('agent'))return send({ok:false,error:'外部工具接入已在 Assetboard 的设置里关闭'});
 const handler=Object.hasOwn(agentMethods,call?.method)?agentMethods[call.method]:Object.hasOwn(proSlots.agentMethods,call?.method)?proSlots.agentMethods[call.method]:null;
 if(!handler)return send({ok:false,error:`未知方法 ${String(call?.method).slice(0,40)}，可用：${[...Object.keys(agentMethods),...Object.keys(proSlots.agentMethods)].join('、')}`});
 try{return send({ok:true,result:handler(call.params&&typeof call.params==='object'&&!Array.isArray(call.params)?call.params:{})});}
 catch(error){return send({ok:false,error:String(error?.message||error)});}
};
function importJsonText(text,{filename='',mode}={}){
 const backup=parseBoardBackup(text);
 if(!backup.ok){toast(backup.error||tr('无法读取备份'));return;}
 const chosen=mode||'merge';
 const plan=planBoardBackup(state,backup,{mode:chosen});
 if(!plan.ok){toast(plan.error||tr('无法合并备份'));return;}
 if(chosen==='merge'&&!plan.conflicts&&!(plan.added||[]).length&&!(plan.updated||[]).length&&!(plan.hidden||[]).length){
  // Offer replace when merge would change nothing meaningful but user dropped a backup — still show preview with mode choice.
 }
 importKind='json';
 const modeNote=chosen==='replace'?tr('整体替换'):tr('合并');
 const extra=chosen==='merge'?`<label class="check-label"><input type="checkbox" id="import-replace">${tr('替换整个资产板（可撤销）')}</label>`:'';
 runImportPlan(plan,{note:`${filename?filename+' · ':''}${modeNote}`,unreadable:[]});
 // If preview opened, inject replace checkbox
 if($('#import-preview')&&chosen==='merge'){
  const actions=$('#import-preview .confirm-actions');
  if(actions&&!$('#import-replace'))actions.insertAdjacentHTML('beforebegin',extra);
 }
}
function importEmlText(raw,{filename=''}={}){
 const parsed=parseEml(raw);
 if(!parsed.ok){toast(parsed.error||tr('无法解析邮件'));return;}
 pasteRow={id:'eml-'+Date.now(),kind:'paste',source:parsed.from||'',title:(parsed.subject||filename||tr('邮件')).slice(0,80),body:`From: ${parsed.from}\nSubject: ${parsed.subject}\nDate: ${parsed.date}\n\n${parsed.body}`,importedAt:new Date().toISOString()};
 pasteRecorded=new Set();candidateReview(buildPasteCandidate());aiAutoPaste();
 
}
// One detection at a time, and an answer is reused for LOCAL_CLI_FRESH_MS: opening the import window again does not re-run gh.
// The answer only redraws the gh / SSH row. (It used to redraw the whole window, which asked again: an endless loop of gh runs.)
const LOCAL_CLI_FRESH_MS=5*60*1000;
let localCliPending=false,localCliAt=0;
function requestLocalCliDetect(force=false){
 if(!nativeStore||demoMode){window.__localCli={gh:false,ghAccounts:[],sshConfig:false};return false;}
 if(localCliPending||!force&&'gh' in (window.__localCli||{})&&Date.now()-localCliAt<LOCAL_CLI_FRESH_MS)return false;
 localCliPending=true;refreshImportCli();
 window.webkit.messageHandlers.assetboard.postMessage({action:'localCliDetect'});
 return true;
}
window.assetboardLocalCliDetect=info=>{localCliPending=false;localCliAt=Date.now();window.__localCli=info&&typeof info==='object'?info:{gh:false,ghAccounts:[],sshConfig:false};refreshImportCli();};
window.assetboardSshResult=result=>{
 if(!result.ok){
  const steps=(result.nextSteps||[]).map(s=>esc(s)).join(tr('；'));
  toast(result.error+(steps?' · '+steps:''));
  return;
 }
 const hosts=parseSshConfig(result.text||'');
 if(!hosts.length){toast(tr('~/.ssh/config 里没有 Host'));return;}
 // Convert to planImport-compatible items via mergeSshConfig under checkpoint path similar to platform sync
 checkpoint();
 const merge=mergeSshConfig(state,hosts);
 state=merge.board;save();render();
 $('#modal')?.close();
 toast(tr('SSH：读 {read}，新增 {added}',{read:merge.read,added:merge.added}),true);
 syncFollowUp('SSH',merge,[]);
};

function routeImportText(text,{filename='',mime=''}={}){
 const classified=classifyImportPayload({text,filename,mime});
 if(classified.kind==='csv'){importKind='csv';importCsvText(classified.text||text,{filename});return;}
 if(classified.kind==='agent'){importAgentTexts([{name:filename||'JSON',text:classified.text||text}]);return;}
 if(classified.kind==='json'){importKind='json';importJsonText(classified.text||text,{filename});return;}
 if(classified.kind==='cfsm'){importKind='csv';importCfsmText(classified.text||text,{filename});return;}
 if(classified.kind==='eml'){importEmlText(classified.text||text,{filename});return;}
 if(classified.kind==='paste'){
  pasteRow={id:'paste-'+Date.now(),kind:'paste',source:'',title:String(text).split('\n')[0].slice(0,60),body:String(text),importedAt:new Date().toISOString()};
  pasteRecorded=new Set();candidateReview(buildPasteCandidate());aiAutoPaste();return;
 }
 if(classified.kind==='empty'){toast(tr('没有可导入的内容'));return;}
 if(classified.kind==='copy'){notice(({'网页':tr('网页导不进来'),'日历':tr('这是导出的日历，只用来阅读，导不回来'),'付款账本':tr('这是导出的付款账本，只用来阅读，导不回来'),'交接清单':tr('这是导出的交接清单，只用来阅读，导不回来')}[classified.copy]||tr('这是导出的{what}，只用来阅读，导不回来',{what:classified.copy}))+tr('；要恢复资产，导入「导出 › 资产备份」的 .json'));return;}
 toast(tr('无法识别这份内容'));
}
// Files dropped or pasted in the window. Screenshots and PDFs go to this Mac's OCR and land in 待确认; tables, backups and
// mails join the intake queue, so several at once open one after another instead of the last one replacing the rest.
async function handleImportFiles(files){
 const list=[...files],images=[],texts=[];
 for(const file of list.slice(0,20)){
  const kind=classifyImportPayload({filename:file.name,mime:file.type}).kind;
  (kind==='image'||kind==='pdf'?images:texts).push(file);
 }
 const skipped=[list.length>20&&tr('另外 {n} 个文件未读取，一次最多 20 个',{n:list.length-20}),images.length>10&&nativeStore&&!demoMode&&tr('另外 {n} 张截图或 PDF 未识别，一次最多 10 个',{n:images.length-10})].filter(Boolean);
 if(images.length){
  if(!nativeStore){notice(tr('截图和 PDF 只在 Mac App 里可用'));}
  else if(demoMode){notice(tr('演示模式不识别截图和 PDF；正式模式下会在本机识别'));}
  else{
   for(const file of images.slice(0,10)){
    const buffer=await file.arrayBuffer();
    const bytes=new Uint8Array(buffer);
    let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    window.webkit.messageHandlers.assetboard.postMessage({action:'ocrImportData',name:file.name,base64:btoa(binary)});
   }
  }
 }
 const entries=[];
 for(const file of texts)entries.push({source:'window',name:file.name,mime:file.type,text:await file.text()});
 queueIntake(entries);
 if(skipped.length)toast(skipped.join(tr('；')));
}
function typingTarget(el){return !!el&&(el.closest?.('input,textarea,select,[contenteditable="true"]')||['INPUT','TEXTAREA','SELECT'].includes(el.tagName));}
function installImportDropPaste(){
 let dragDepth=0;
 const board=document.documentElement;
 board.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();dragDepth++;document.body.classList.add('import-drag');});
 board.addEventListener('dragover',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});
 board.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)document.body.classList.remove('import-drag');});
 board.addEventListener('drop',e=>{
  dragDepth=0;document.body.classList.remove('import-drag');
  const files=[...e.dataTransfer?.files||[]];
  if(e.target.closest?.('input[type="file"]'))return;
  if(typingTarget(e.target)&&!files.length)return;
  if(files.length){e.preventDefault();handleImportFiles(files);return;}
  const text=e.dataTransfer?.getData('text/plain');
  if(text&&text.trim()){e.preventDefault();routeImportText(text);}
 });
 document.addEventListener('paste',e=>{
  if(typingTarget(e.target)||$('#modal')?.open)return;
  const items=[...e.clipboardData?.items||[]];
  const fileItems=items.filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
  if(fileItems.length){e.preventDefault();handleImportFiles(fileItems);return;}
  const text=e.clipboardData?.getData('text/plain');
  if(text&&text.trim()){e.preventDefault();routeImportText(text);}
 });
}

function snapshotAssetForm(form){if(!form)return null;const data=new FormData(form);const values={};for(const [k,v] of data.entries()){if(k==='icon')continue;values[k]=String(v);}return {id:form.dataset.id||'',type:form.dataset.type||'',values,hadFile:false};}
function isAssetFormDirty(){const form=$('#asset-form');if(!form||!assetFormSnapshot)return false;if(form.elements.icon?.files?.length)return true;const data=new FormData(form);for(const key of Object.keys(assetFormSnapshot.values)){if(String(data.get(key)??'')!==assetFormSnapshot.values[key])return true;}for(const [k] of data.entries()){if(k==='icon'||k==='removeIcon')continue;if(!(k in assetFormSnapshot.values)&&String(data.get(k)??''))return true;}if(form.elements.removeIcon?.checked)return true;return false;}
function requestCloseModal(){if(isAssetFormDirty()){const resumeTitle=$('#modal-title').textContent,resumeView=$('#modal').dataset.view,live=[...$('#modal-content').childNodes],baseline=assetFormSnapshot;modal(tr('未保存的修改'),`<p class="form-note">${tr('表单有未保存的内容。可以保存、放弃修改，或继续编辑。')}</p><div class="dirty-actions"><button class="button primary" id="dirty-save">${tr('保存')}</button><button class="button" id="dirty-discard">${tr('放弃')}</button><button class="button" id="dirty-keep">${tr('继续编辑')}</button></div>`);const resume=()=>{$('#modal-title').textContent=resumeTitle;$('#modal').dataset.view=resumeView;$('#modal-content').replaceChildren(...live);assetFormSnapshot=baseline;};$('#dirty-save').onclick=()=>{resume();$('#asset-form').requestSubmit();};$('#dirty-discard').onclick=()=>{assetFormSnapshot=null;$('#modal').close();};$('#dirty-keep').onclick=resume;return;}assetFormSnapshot=null;$('#modal').close();}
// Small fixed choices are buttons, not dropdowns: one click, all options in view. The value lives in a hidden input so forms read it as before.
// A long set (the categories) can start folded to the chosen one plus 更改; picking one folds it again.
function chipGroup(name,options,value,label,clearable=false,folded=false){
 return `<div class="chip-group${folded?' folded':''}" role="radiogroup" aria-label="${esc(label)}" ${clearable?'data-clearable="true"':''} ${folded?'data-foldable="true"':''}><input type="hidden" name="${name}" value="${esc(value??'')}">${options.map(([val,text])=>`<button type="button" class="choice" role="radio" data-choice="${name}" data-value="${esc(val)}" aria-checked="${String(val)===String(value??'')}">${esc(text)}</button>`).join('')}${folded?`<button type="button" class="choice unfold" data-unfold>${tr('更改')}</button>`:''}</div>`;
}
function setChoice(form,name,value){
 const input=form.elements[name];if(!input)return;
 input.value=value;
 for(const button of input.parentElement.querySelectorAll('.choice[data-choice]'))button.setAttribute('aria-checked',String(button.dataset.value===value));
 input.dispatchEvent(new Event('change',{bubbles:true}));
}
function markProviderPick(form){const value=form.elements.provider?.value.trim();for(const b of form.querySelectorAll('[data-provider]'))b.setAttribute('aria-pressed',String(b.dataset.provider===value));}
document.addEventListener('input',e=>{if(e.target.name==='provider'&&e.target.form)markProviderPick(e.target.form);});
document.addEventListener('click',e=>{
 const pick=e.target.closest('[data-provider]');
 if(pick){const form=pick.closest('form'),input=form?.elements.provider;if(!input)return;input.value=pick.dataset.provider;input.dispatchEvent(new Event('input',{bubbles:true}));markProviderPick(form);return;}
 const unfold=e.target.closest('[data-unfold]');
 if(unfold){const group=unfold.closest('.chip-group');group.classList.remove('folded');group.querySelector('.choice[aria-checked="true"]')?.focus();modalScrollState();return;}
 const button=e.target.closest('.choice[data-choice]');
 if(button){
  const group=button.closest('.chip-group'),input=group.querySelector('input[type="hidden"]'),on=button.getAttribute('aria-checked')==='true';
  if(group.classList.contains('folded')){group.classList.remove('folded');modalScrollState();return;}
  if(input.name==='type')input.form.dataset.typeTouched='1';
  setChoice(input.form,input.name,on&&group.dataset.clearable==='true'?'':button.dataset.value);
  if(group.dataset.foldable){group.classList.add('folded');modalScrollState();}
  return;
 }
 const quick=e.target.closest('[data-add-months]');
 if(quick){
  const input=quick.closest('form')?.elements.date;if(!input)return;
  input.value=shiftDate(parseLooseDate(input.value),Number(quick.dataset.addMonths));input.setCustomValidity('');
  input.dispatchEvent(new Event('input',{bubbles:true}));
 }
});
function defaultCurrency(){for(const a of recentFirst(state.assets)){const parts=costParts(a.cost);if(parts)return parts.currency;}return 'CNY';}
function costField(v){
 const parts=costParts(v.cost),text=v.cost&&v.cost!=='未知'?String(v.cost):'',legacy=parts?'':text,suffix=parts?(/\s\/\s.+$/.exec(text)||[''])[0]:'',currency=parts?.currency||defaultCurrency();
 const codes=[...MAIN_CURRENCIES];if(!codes.includes(currency))codes.push(currency);
 return `<div class="field"><span class="field-label">${tr('费用')}</span><div class="cost-row"><input name="amount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="89" aria-label="${tr('金额')}" value="${esc(parts?.value||'')}">${chipGroup('currency',codes.map(code=>[code,currencyDisplay[code]||code]),currency,tr('币种'))}</div><input type="hidden" name="cost" value="${esc(legacy)}"><input type="hidden" name="costSuffix" value="${esc(suffix)}">${legacy?`<span class="form-note">${tr('原有费用“{cost}”会保留，填金额则替换',{cost:esc(legacy)})}</span>`:''}</div>`;
}
function costFromForm(data,cycle){
 const raw=String(data.get('amount')??'').trim().replace(/,/g,'');
 if(!raw)return String(data.get('cost')??'').trim()||'未知';
 return formatCostParts(String(data.get('currency')||'CNY'),raw,cycle)+(cycle?'':String(data.get('costSuffix')||''));
}
function regionCodeFromText(text){
 const value=String(text||'').trim().toLowerCase();if(!value)return '';
 return regionList.find(([code,name])=>name.toLowerCase()===value||regionName(code).toLowerCase()===value||code.toLowerCase()===value)?.[0]||'';
}
function setFormRegion(form,code){form.elements.region.value=code;if(form.elements.regionText)form.elements.regionText.value=regionName(code);}
// The add panel: hand over whatever you have (pasted text, a file, one typed line); the form below is only the review step.
// Opened from a category, it keeps that category for 手动填写 and for a line that names no type of its own.
let captureType='';
function captureDialog(type=''){
 captureType=cats[type]?type:'';
 modal(captureType?tr('添加{name}资产',{name:cats[captureType].name}):tr('添加资产'),`<div class="form capture" id="capture"><textarea id="capture-text" rows="4" maxlength="20000" aria-label="${tr('粘贴或输入资产信息')}" placeholder="${tr('粘贴续费邮件、通知、域名或 IP，或直接打一行：example.com namecheap 2027-03-01 $11/年')}"></textarea><div class="capture-drop">${ui('download')}<span>${nativeStore?tr('拖入邮件、截图、PDF 或 CSV，也可以直接 ⌘V'):tr('拖入邮件或 CSV，也可以直接 ⌘V')}</span></div><div class="confirm-actions"><button class="button primary" data-action="capture-go">${tr('识别')}</button><button class="button" data-action="capture-manual">${tr('手动填写')}</button></div><div class="capture-links"><button type="button" class="text-button capture-more" data-action="import-hub">${proSlots.captureImportLabel?.()||(nativeStore?tr('从文件、~/.ssh/config 或截图导入…'):tr('从文件导入…'))}</button>${slotHtml('captureLinks')}</div><p class="form-note capture-note">${captureNote()}</p></div>`,'capture');
 $('#capture-text').focus();
}
function captureNote(){
 if(!nativeStore||demoMode)return `${ui('lock')}${nativeStore?tr('在此 Mac按规则识别，不上传'):tr('在此浏览器按规则识别，不上传')}`;
 // AI is Pro: the free edition has no 配置 AI (proSlots.captureAiLink).
 return aiReady()?`${ui('lock')}${tr('点「识别」时，本地认不全的文字会发送到 {host} 由 AI 识别，按你的账号计费',{host:esc(nativeStore.ai.host)})}`:`${ui('lock')}${tr('按规则识别，不上传')}${proSlots.captureAiLink?tr('；')+proSlots.captureAiLink():''}`;
}
// With a model configured, the typed or pasted text goes to it (only on this explicit click); rules remain the fallback.
async function captureAi(text){
 pasteRow={id:'paste-'+Date.now(),kind:'paste',source:'',title:text.split('\n')[0].slice(0,60),body:text,importedAt:new Date().toISOString()};
 pasteRecorded=new Set();aiErrors.delete('paste');
 const go=$('#capture [data-action="capture-go"]');if(go){go.disabled=true;go.textContent=tr('识别中…');}
 const result=await aiRequest({text});
 if(!$('#capture'))return;
 if(result.ok){pasteRow.payload={ai:result.ai};pasteRecorded=new Set();}else aiErrors.set('paste',result.error||tr('AI 识别失败'));
 candidateReview(buildPasteCandidate());
}
function captureGo(manual=false){
 const text=($('#capture-text')?.value||'').trim();
 const fallback=captureType||'subscription';
 if(!text){if(manual)assetForm(fallback);else $('#capture-text')?.focus();return;}
 const plain=classifyImportPayload({text}).kind==='paste';
 const useAi=!manual&&plain&&nativeStore&&!demoMode&&aiReady();
 const line=!/\n/.test(text)&&text.length<=120&&plain?parseQuickLine(text):null;
 // A line naming a domain, IP or repository is read here by the rules, free and at once; anything less clear goes to the model.
 if(line?.name&&(!useAi||line.type)){const {type,...fill}=line;assetForm(type||fallback,null,fill);return;}
 if(useAi){captureAi(text);return;}
 if(manual){assetForm(fallback,null,{name:text.split('\n')[0].slice(0,100)});return;}
 routeImportText(text);
}
document.addEventListener('keydown',e=>{if(e.target.id!=='capture-text'||e.key!=='Enter'||e.shiftKey||e.isComposing)return;e.preventDefault();captureGo();});
document.addEventListener('paste',e=>{
 if(e.target.id!=='capture-text')return;
 const files=[...e.clipboardData?.items||[]].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
 if(files.length){e.preventDefault();handleImportFiles(files);return;}
 const text=e.clipboardData?.getData('text/plain')||'';
 if((text.includes('\n')||text.length>120)&&!(nativeStore&&aiReady()))setTimeout(()=>captureGo(),0);
});
function assetForm(type,id,fill={},candidateKey='',candidateItem=null){const a=id?state.assets.find(a=>a.id===id):null,v={...(a||{}),...fill},link=safeManagementUrl(v.url),synced=PLATFORM_SOURCES.includes(a?.source),kind=dateKinds[v.dateKind]?v.dateKind:'expire';modal(a?tr('编辑资产资料'):tr('添加{name}资产',{name:cats[type].name}),`<form id="asset-form" class="form" data-type="${type}" data-id="${id||''}" data-candidate="${esc(candidateKey)}" data-item="${candidateItem??''}"><label>${tr('资产名称')}<input name="name" required maxlength="100" value="${esc(v.name||'')}" placeholder="${assetProfiles[type]?.name||tr('例如 my-project.dev')}"></label>${synced?'':`<div class="field"><span class="field-label">${tr('类别')}</span>${chipGroup('type',Object.entries(cats).map(([key,c])=>[key,c.name]),type,tr('类别'),false,true)}</div>`}<div id="profile-fields" class="profile-fields">${profileFields(type,v)}</div>${costField(v)}<details class="more-fields" ${a||candidateKey||v.purpose||v.reason||v.url||v.notes||v.project||v.promotion?'open':''}><summary>${projectsOn()?tr('更多：计费、项目、用途、链接、图标、备注'):tr('更多：计费、用途、链接、图标、备注')}</summary>${moneyFormFields(v)}<div class="field"><span class="field-label" title="${tr('可丢的照样列在清单里，只是不发通知；交接清单里关键的排在前面')}">${tr('重要程度')}</span>${chipGroup('importance',[['',tr('未设')],...Object.entries(IMPORTANCE)],IMPORTANCE[v.importance]?v.importance:'',tr('重要程度'))}</div><label>${tr('用途')}<input name="purpose" maxlength="100" value="${esc(v.purpose||'')}" placeholder="${tr('它用来做什么？')}"></label><label>${tr('保留原因')}<input name="reason" maxlength="120" value="${esc(v.reason||'')}" placeholder="${tr('为什么还留着')}"></label><label>${tr('管理链接')}<input name="url" type="url" maxlength="2000" value="${esc(link&&new URL(link).hostname!=='example.com'?link:'')}" placeholder="https://..." pattern="https?://.*"></label><label title="${tr('PNG、JPEG 或 WebP，最大 256 KB')}">${tr('自定义图标')}<input name="icon" type="file" accept="image/png,image/jpeg,image/webp"></label>${a?.iconData?`<label class="check-label"><input name="removeIcon" type="checkbox">${tr('移除当前自定义图标')}</label>`:''}<label>${tr('备注')}<textarea name="notes" rows="3" maxlength="2000">${esc(v.notes||'')}</textarea></label></details><div class="form-actions"><button class="button primary" type="submit">${a?tr('保存修改'):tr('添加资产')}</button><span class="form-note">${nativeStore?tr('仅存于此 Mac'):tr('仅存于此浏览器')}</span></div></form>`);const form=$('#asset-form');assetFormSnapshot=snapshotAssetForm(form);
 if(!a)form.addEventListener('input',e=>{if(e.target.name!=='name'||form.dataset.typeTouched||!form.elements.type)return;const guess=inferTypeFromName(e.target.value);if(guess&&guess!==form.elements.type.value)setChoice(form,'type',guess);});
 form.addEventListener('change',e=>{if(e.target.name==='date'){const day=parseLooseDate(e.target.value);if(day)e.target.value=day;}});
 form.addEventListener('input',e=>{if(e.target.name!=='regionText')return;form.elements.region.value=regionCodeFromText(e.target.value);e.target.setCustomValidity('');});
 form.elements.type?.addEventListener('change',e=>{const values=Object.fromEntries(new FormData(form));if('expiry' in values)values.date=cardExpiry(values.expiry)||'';form.dataset.type=e.target.value;$('#profile-fields').innerHTML=profileFields(e.target.value,values);form.elements.name.placeholder=assetProfiles[e.target.value]?.name||tr('例如 my-project.dev');});
 form.addEventListener('input',e=>{if(e.target.name!=='phone')return;const region=form.elements.region,code=regionFromPhone(e.target.value);if(region&&code&&!region.value)setFormRegion(form,code);});
}
// Fields that depend on the category; rebuilt in place when the category select changes.
// How to get back in and where the data is kept (research round 4): folded under the type's own fields, only for the types they
// apply to; places only, a code or key typed here is refused on saving (`keepFromForm`).
function keepFields(type,v){
 const text=(key,label,hint,max)=>`<label>${label}<input name="${key}" maxlength="${max}" autocomplete="off" spellcheck="false" value="${esc(v[key]||'')}" placeholder="${hint}"></label>`;
 const recovery=RECOVERY_TYPES.includes(type)?`<div class="field"><span class="field-label">${tr('两步验证')}</span>${chipGroup('mfa',[['',tr('未记')],...Object.entries(MFA_KINDS)],MFA_KINDS[v.mfa]?v.mfa:'',tr('两步验证'))}</div>${RECOVERY_FIELDS.map(([key,label,hint])=>text(key,label,hint,60)).join('')}${LEGACY_WORDS[type]?`<div class="field"><span class="field-label" title="${type==='appleid'?tr('Apple 账户设置里的「遗产联系人」：你不在时，对方凭访问密钥和证明能拿到数据'):tr('Google 的「闲置账号管理器」：账号一段时间不用后，通知你指定的人')}">${LEGACY_WORDS[type]}</span>${chipGroup('legacy',[['',tr('未记')],...Object.entries(LEGACY_STATES)],LEGACY_STATES[v.legacy]?v.legacy:'',LEGACY_WORDS[type])}</div>`:''}`:'';
 const backup=BACKUP_TYPES.includes(type)?`<div class="field"><span class="field-label" title="${tr('快照和实例在同一平台，实例释放或账号出事时会一起没')}">${tr('备份在哪')}</span>${chipGroup('backup',[['',tr('未记')],...Object.entries(BACKUP_KINDS)],BACKUP_KINDS[v.backup]?v.backup:'',tr('备份在哪'))}</div><div class="field-row">${text('backupNote',tr('备份说明'),tr('例如 每天导出到另一家存储'),100)}${text('restoreTestedOn',tr('上次试恢复'),'2026-05-01',10)}</div>`:'';
 if(!recovery&&!backup)return '';
 const open=['mfa','mfaWhere','recoveryCodes','vault','legacy','backup','backupNote','restoreTestedOn'].some(key=>v[key]);
 return `<details class="keep-fields"${open?' open':''}><summary>${recovery?tr('找回：两步验证、恢复码、密码在哪'):tr('备份：在哪、上次试恢复')}</summary>${recovery}${backup}<span class="form-note">${tr('只记放在哪，不要填密码、验证码或恢复码本身。')}</span></details>`;
}
function keepFromForm(form,data,type){
 const out={importance:IMPORTANCE[data.get('importance')]?String(data.get('importance')):''};
 for(const key of ['mfa','mfaWhere','recoveryCodes','vault','legacy','backup','backupNote','restoreTestedOn'])out[key]='';
 const bad=(name,message)=>{const input=form.elements[name];input.setCustomValidity(message);input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return null;};
 const secret=tr('这里像是验证码、恢复码或密钥。只记它放在哪，例如「1Password · 个人」。');
 if(RECOVERY_TYPES.includes(type)&&form.elements.mfa){
  out.mfa=MFA_KINDS[data.get('mfa')]?String(data.get('mfa')):'';
  if(LEGACY_WORDS[type])out.legacy=LEGACY_STATES[data.get('legacy')]?String(data.get('legacy')):'';
  for(const [key] of RECOVERY_FIELDS){const text=String(data.get(key)||'').trim().slice(0,60);if(looksLikeSecret(text))return bad(key,secret);out[key]=text;}
 }
 if(BACKUP_TYPES.includes(type)&&form.elements.backup){
  out.backup=BACKUP_KINDS[data.get('backup')]?String(data.get('backup')):'';
  const note=String(data.get('backupNote')||'').trim().slice(0,100);if(looksLikeSecret(note))return bad('backupNote',secret);out.backupNote=note;
  const raw=String(data.get('restoreTestedOn')||'').trim(),day=raw?parseLooseDate(raw):'';if(raw&&!day)return bad('restoreTestedOn',tr('日期无法识别，例如 2026-05-01'));out.restoreTestedOn=day;
 }
 return out;
}
function profileFields(type,v){
 const p=assetProfiles[type]||{},extra=p.extra||[],kind=dateKinds[v.dateKind]?v.dateKind:p.dateKind||'expire',cycle=v.cycle??p.cycle??'';
 const presets=providerPresets(type),current=v.provider==='平台待补充'?'':v.provider||'';
 // Common vendors as chips (the first few) and as suggestions while typing (all of them); any other name can still be typed.
 const provider=p.fixedProvider?'':`<label>${p.provider?.[0]||tr('平台')}<input name="provider" maxlength="80" autocomplete="off"${presets.length?' list="provider-list"':''} value="${esc(current)}" placeholder="${p.provider?.[1]||tr('例如 Cloudflare')}"></label>${presets.length?`<datalist id="provider-list">${presets.map(n=>`<option value="${esc(n)}">${tr(n)===n?'':esc(tr(n))}`).join('')}</datalist><div class="chip-group provider-picks" role="group" aria-label="${tr('常用平台')}">${presets.slice(0,8).map(n=>`<button type="button" class="choice" data-provider="${esc(n)}" aria-pressed="${n===current}">${esc(tr(n))}</button>`).join('')}</div>`:''}`;
 const account=`<label>${p.account?.[0]||tr('账号')}<input name="account" maxlength="100" autocomplete="off" value="${esc(v.account||'')}" placeholder="${p.account?.[1]||tr('用于区分同平台的账号')}"></label>`;
 const region=extra.includes('region')?`<label>${tr('国家 / 地区')}<input name="regionText" list="region-list" autocomplete="off" placeholder="${tr('输入国家或地区')}" value="${esc(v.region?regionName(v.region):'')}"><input type="hidden" name="region" value="${esc(v.region||'')}"><datalist id="region-list">${regionList.map(([code])=>`<option value="${esc(regionName(code))}">${regionFlag(code)} ${code}</option>`).join('')}</datalist></label>`:'';
 const phone=extra.includes('phone')?`<label>${tr('完整号码')}<input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="off" value="${esc(v.phone||'')}" placeholder="+44 7700 900123"></label><span class="form-note">${tr('卡片只显示区号和后 4 位')}</span>${extra.includes('phoneStatus')?`<div class="field"><span class="field-label" title="${tr('不是「正常」时，靠它验证的每个账号都会标出风险')}">${tr('状态')}</span>${chipGroup('phoneStatus',[['',tr('正常')],...Object.entries(PHONE_STATUSES)],PHONE_STATUSES[v.phoneStatus]?v.phoneStatus:'',tr('号码状态'))}</div>`:''}`:'';
 const card=extra.includes('last4')?`<div class="field-row"><label>${tr('卡号后 4 位')}<input name="last4" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="off" value="${esc(v.last4||'')}" placeholder="1234"></label><label>${tr('有效期')}<input name="expiry" maxlength="7" autocomplete="off" placeholder="MM/YY" pattern="\\s*(0?[1-9]|1[0-2])\\s*/\\s*(\\d{2}|\\d{4})\\s*" value="${esc(expiryText(v.date))}"></label></div><div class="field"><span class="field-label">${tr('卡组织')}</span>${chipGroup('network',cardNetworks.map(network=>[network,tr(network)]),v.network||'',tr('卡组织'),true)}</div><div class="field"><span class="field-label" title="${tr('不是「正常」时，它支付的每一项都会标出付款风险')}">${tr('状态')}</span>${chipGroup('cardStatus',[['',tr('正常')],...Object.entries(CARD_STATUSES)],CARD_STATUSES[v.cardStatus]?v.cardStatus:'',tr('卡状态'))}</div>`:'';
 const dates=type==='bankcard'?'':`<div class="field"><span class="field-label">${p.date||tr('下一日期')}</span><div class="date-row"><input name="date" autocomplete="off" inputmode="numeric" placeholder="${tr('2027-03-01 或 3/1')}" aria-label="${esc(p.date||tr('下一日期'))}" value="${esc(v.date||'')}">${[[1,tr('+1 个月')],[3,tr('+3 个月')],[12,tr('+1 年')]].map(([months,label])=>`<button type="button" class="choice quick" data-add-months="${months}">${label}</button>`).join('')}</div></div><div class="field"><span class="field-label">${tr('日期类型')}</span>${chipGroup('dateKind',Object.entries(dateKinds).map(([key,k])=>[key,k.label]),kind,tr('日期类型'))}</div><div class="field"><span class="field-label" title="${tr('日期过去后自动顺延到下一次')}">${tr('重复')}</span>${chipGroup('cycle',[['',tr('不重复')],...Object.entries(billingCycles).map(([key,c])=>[key,c.label])],cycle,tr('重复'))}</div>`;
 const actions=(ACTION_FIELDS[type]||[]).filter(([key])=>key!=='localPath'||nativeStore).map(([key,label,hint])=>`<label>${label}<input name="${key}" maxlength="${key==='localPath'?1000:253}" autocomplete="off" spellcheck="false" ${key==='sshPort'?'inputmode="numeric"':''} value="${esc(Array.isArray(v[key])?v[key].join(', '):v[key]||'')}" placeholder="${hint}"></label>`).join('');
 return provider+account+region+phone+card+dates+(actions?`<div class="field-row action-fields">${actions}</div>`:'')+keepFields(type,v)+(p.note?`<span class="form-note form-warning">${p.note}</span>`:'');
}
// A connected Cloudflare is read again by itself (zones and Registrar domains added since) when the app opens or comes back to the
// front and the last sync is CLOUDFLARE_REFRESH_MS old; 重新同步 in this dialog (文件 → 同步 Cloudflare…) reads it at once.
const CLOUDFLARE_REFRESH_MS=12*3600*1000;
let cloudflareAuto=false,cloudflareAutoTried=0;
function lastCloudflareSync(){return Math.max(0,...state.assets.filter(a=>a.source==='cloudflare').map(a=>Date.parse(a.syncedAt)||0));}
function autoSyncCloudflare(now=Date.now()){
 if(!nativeStore?.cloudflareConnected||demoMode||proOff||cloudflareAuto||$('#modal')?.open)return false;
 if(now-lastCloudflareSync()<CLOUDFLARE_REFRESH_MS||now-cloudflareAutoTried<CLOUDFLARE_REFRESH_MS)return false;
 cloudflareAutoTried=now;cloudflareAuto=true;
 window.webkit.messageHandlers.assetboard.postMessage({action:'cloudflareSync',token:''});
 return true;
}
function cloudflareDialog(){
 if(!nativeStore){toast(tr('Cloudflare 仅 Mac App 可用'));return;}
 const connected=nativeStore.cloudflareConnected,last=lastCloudflareSync();
 const tokenUrl=cloudflareTokenTemplateUrl({name:'Assetboard'});
 const status=connected?tr('已连接'):nativeStore.cloudflareChecking?tr('检查钥匙串…'):nativeStore.keychainUnavailable?tr('钥匙串没有响应，可重新输入令牌'):tr('未连接');
 modal('Cloudflare',`<div class="form"><div class="platform-bar"><span id="cloudflare-status" class="chip ${connected?'ok':''}">${status}</span><button class="button" data-action="setup-cloudflare" data-url="${esc(tokenUrl)}" title="${tr('打开预填只读权限的建令牌页：Zone、Account Settings、Pages、Workers Scripts、R2 Read；含 Registrar 读权限时还会读域名到期日')}">${tr('建令牌 ↗')}</button></div><label>${connected?tr('更换令牌'):tr('令牌')}<input id="cloudflare-token" type="password" autocomplete="off" spellcheck="false" placeholder="${connected?tr('留空使用已保存的令牌'):tr('粘贴只读令牌')}"></label><div class="confirm-actions"><button id="cloudflare-sync" class="button primary">${connected?tr('重新同步'):tr('验证并同步')}</button>${connected?`<button id="cloudflare-disconnect" class="button" title="${tr('删除本机保存的令牌；Cloudflare 后台的令牌需自行撤销，已同步资产保留')}">${tr('断开')}</button>`:''}</div>${connected?`<p class="form-note cloudflare-last">${last?tr('上次同步 {when}。',{when:esc(new Date(last).toLocaleString(trLocale()))}):''}${tr('之后新增的域名和资源，点「重新同步」即可读入；App 打开时也会每 12 小时自动同步一次。')}</p>`:''}<p class="form-note platform-note">${ui('lock')}${tr('只读；令牌存入 macOS 钥匙串')}</p></div>`);
 if(cloudflareAuto){$('#cloudflare-sync').disabled=true;$('#cloudflare-status').textContent=tr('正在自动同步…');}
 $('#cloudflare-sync').onclick=()=>{const token=$('#cloudflare-token').value;$('#cloudflare-token').value='';$('#cloudflare-sync').disabled=true;$('#cloudflare-status').textContent=tr('验证中…');window.webkit.messageHandlers.assetboard.postMessage({action:'cloudflareSync',token});};
 if(connected)$('#cloudflare-disconnect').onclick=()=>window.webkit.messageHandlers.assetboard.postMessage({action:'cloudflareDisconnect'});
}
window.assetboardCloudflareResult=result=>{
 // An automatic sync answers quietly, unless the Cloudflare dialog was opened while it ran: then it is that dialog's answer.
 const auto=cloudflareAuto&&!$('#cloudflare-sync');cloudflareAuto=false;
 if(auto){
  if(!result.ok||result.disconnected){if(!result.ok){cloudflareAutoError=String(result.error||tr('没有回应')).slice(0,120);render();}return;}
  cloudflareAutoError='';
  const merge=mergeCloudflare(state,result);if(merge.added)checkpoint();state=merge.board;save();render();
  if(merge.collisions.length)notice(tr('Cloudflare 自动同步：新增 {added}，{n} 项与本地记录同名，可在「文件 → 同步 Cloudflare…」重新同步后确认',{added:merge.added,n:merge.collisions.length}));
  else if(merge.added)toast(tr('Cloudflare 自动同步：新增 {added}',{added:merge.added}),true);
  return;
 }
 if(!result.ok){const status=$('#cloudflare-status');if(status)status.textContent=result.error||tr('同步失败');status.classList.add('bad');const button=$('#cloudflare-sync');if(button)button.disabled=false;return;}
 if(result.disconnected){nativeStore.cloudflareConnected=false;cloudflareDialog();toast(tr('已删除令牌'));return;}
 checkpoint();const merge=mergeCloudflare(state,result);state=merge.board;cloudflareAutoError='';
 nativeStore.cloudflareConnected=true;save();render();$('#modal').close();toast(tr('Cloudflare：读 {read}，新增 {added}',{read:merge.read,added:merge.added}),true);
 syncFollowUp('Cloudflare',merge,result.warnings||[]);
};
function githubDialog(){
 if(!nativeStore){toast(tr('GitHub 仅 Mac App 可用'));return;}
 const connected=nativeStore.githubConnected;
 const cli=window.__localCli||{};
 const accounts=cli.ghAccounts||[];
 const tags=accounts.map(n=>`<span class="account-tag">${esc(n)}</span>`).join('');
 const status=connected?tr('已连接'):cli.gh===false?tr('未检测到 gh'):tr('未连接');
 modal('GitHub',`<div class="form"><div class="platform-bar"><span id="github-status" class="chip ${connected?'ok':''}">${status}</span><button class="button" data-action="setup-github-token" title="${tr('打开 GitHub 细粒度令牌页：Metadata → Read')}">${tr('建令牌 ↗')}</button></div><button id="github-local-sync" class="button primary" data-action="github-local-sync" title="${tr('只调用 gh 命令，不读它的凭据文件；多个账号的仓库显示在同一区块')}">${ui('github')}${tr('用本机 gh')}${tags}</button><label>${connected?tr('更换令牌'):tr('或填写令牌')}<input id="github-token" type="password" autocomplete="off" spellcheck="false" placeholder="${connected?tr('留空使用已保存的令牌'):tr('粘贴只读令牌')}"></label><div class="confirm-actions"><button id="github-sync" class="button">${connected?tr('用已保存的令牌同步'):tr('验证并同步')}</button>${connected?`<button id="github-disconnect" class="button" title="${tr('删除 Assetboard 保存的令牌，已同步资产保留')}">${tr('断开')}</button>`:''}</div><p class="form-note platform-note">${ui('lock')}${tr('只读；令牌存入 macOS 钥匙串')}</p></div>`);
 if(!cli.gh&&cli.gh!==false)requestLocalCliDetect();
 $('#github-sync').onclick=()=>{const token=$('#github-token').value;$('#github-token').value='';$('#github-sync').disabled=true;$('#github-status').textContent=tr('验证中…');window.webkit.messageHandlers.assetboard.postMessage({action:'githubSync',token});};
 if(connected)$('#github-disconnect').onclick=()=>window.webkit.messageHandlers.assetboard.postMessage({action:'githubDisconnect'});
}
window.assetboardGitHubResult=result=>{
 if(!result.ok){
  const status=$('#github-status');
  const steps=(result.nextSteps||[]).join(' · ');
  if(status){status.textContent=(result.error||tr('同步失败'))+(steps?' · '+steps:'');status.classList.add('bad');}
  for(const id of ['#github-sync','#github-local-sync']){const button=$(id);if(button)button.disabled=false;}
  if(result.tokenUrl){
   const form=$('#modal-content .form');
   if(form&&!$('#github-fallback-link'))form.insertAdjacentHTML('beforeend',`<button class="button" id="github-fallback-link" data-action="setup-github-token">${tr('建令牌 ↗')}</button>`);
  }
  return;
 }
 if(result.disconnected){nativeStore.githubConnected=false;githubDialog();toast(tr('已删除令牌'));return;}
 checkpoint();const merge=mergeGitHub(state,result);state=merge.board;
 nativeStore.githubConnected=!!result.connected||nativeStore.githubConnected;save();render();$('#modal').close();
 const who=(result.accounts||[]).length?` ${result.accounts.join(tr('、'))}`:'';
 toast(`GitHub${who}`+tr('：读 {read}，新增 {added}',{read:merge.read,added:merge.added}),true);
 syncFollowUp('GitHub',merge,result.warnings||[]);
};
let pendingCollisions=[];
function syncFollowUp(source,merge,warnings){
 pendingCollisions=merge.collisions;if(!pendingCollisions.length&&!warnings.length)return;
 const warningHtml=warnings.length?`<p class="form-note">${tr('已读 {n} 项；以下未读取，已有记录不受影响：',{n:merge.read})}</p>${warnings.map(message=>`<p class="form-note">${esc(message)}</p>`).join('')}`:'';
 const collisionHtml=pendingCollisions.length?`<p class="form-note">${tr('与本地记录同名，无法确认是同一项。勾选的会被同步结果覆盖，不影响线上资源。')}</p><div class="collision-list">${pendingCollisions.map((item,index)=>`<label class="check-label"><input type="checkbox" name="collision" value="${index}">${esc(item.name)}</label>`).join('')}</div><div class="confirm-actions"><button class="button primary" data-action="apply-collisions">${tr('覆盖所选')}</button><button class="button" data-action="close-modal">${tr('保留本地记录')}</button></div>`:'';
 modal(pendingCollisions.length?`${source} · ${tr('同名记录')}`:`${source} · ${tr('部分未读取')}`,warningHtml+collisionHtml);
}
window.assetboardOCRResult=result=>{
 if(!result.ok){toast(result.error||tr('本地识别失败'));return;}
 requestEvidence(()=>{
  const candidate=candidates().find(item=>item.ids.includes(result.id)),dialog=$('#modal');
  if(candidate&&aiReady()&&nativeStore.ai.autoImages!==false&&!candidate.ai)aiRecognizeCandidate(candidate.key);
  // Several screenshots at once, or one arriving while something else is open: it waits in 待确认 instead of replacing it.
  if(modalBusy('open')){if(dialog.dataset.view==='inbox')inboxDialog(false);else toast(tr('{title} 已识别，在待确认里',{title:result.title||tr('截图')}));return;}
  if(!candidate){inboxDialog(false);return;}
  candidateReview(candidate);
 });
};
// Imported evidence stays in SQLite; decisions about it live in the board so undo keeps both in step.
let evidenceRows=[],evidenceVersion=0,candidateCache={key:null,list:[]},afterEvidence=null,pasteCandidate=null,pasteRow=null,pasteRecorded=new Set();
const evidenceKinds={gmail:'Gmail',ocr:tr('截图/PDF'),paste:tr('粘贴的文字')};
function candidateOptions(){return {assets:state.assets,decisions:state.evidenceDecisions||{},types:Object.keys(cats)};}
function candidates(){const decisions=state.evidenceDecisions||{},key=`${evidenceVersion}|${JSON.stringify(decisions)}|${state.assets.map(a=>a.id+'\u0001'+a.name).join('\u0002')}`;if(candidateCache.key!==key)candidateCache={key,list:buildCandidates(evidenceRows,candidateOptions())};return candidateCache.list;}
function pendingCount(){return candidates().filter(item=>item.pending&&!item.weak).length;}
function findCandidate(key){return key==='paste'?pasteCandidate:candidates().find(item=>item.key===key);}
function buildPasteCandidate(){pasteCandidate={...buildCandidates([pasteRow],{...candidateOptions(),decisions:{}})[0],key:'paste'};return pasteCandidate;}
function requestEvidence(then){afterEvidence=then||null;if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'evidenceList'});else{afterEvidence=null;then?.();}}
window.assetboardEvidenceList=(rows,error)=>{
 if(Array.isArray(rows)){evidenceRows=rows;evidenceVersion++;}else if(error)toast(error);
 syncToolbar();renderSidebar();const next=afterEvidence;afterEvidence=null;
 if(next)next();else if($('#modal').open&&$('#modal').dataset.view==='inbox')inboxDialog(false);
};
// A person's own model endpoint. Swift keeps the key and sends the request; the page only receives reply text.
const aiRequests=new Map(),aiBusy=new Set(),aiErrors=new Map();let aiSequence=0,aiBatchState=null;
const aiProviders={anthropic:{label:'Anthropic Claude',baseURL:'https://api.anthropic.com',model:'claude-opus-5-5'},openai:{label:tr('OpenAI 兼容接口（OpenAI、通义千问、Kimi、本机 Ollama 等）'),baseURL:'',model:''}};
function aiLocal(host){return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host||'').toLowerCase());}
function aiReady(){const ai=nativeStore?.ai;return !!(ai?.model&&(nativeStore.aiKeySaved||aiLocal(ai.host)));}
function aiRequest(params){return new Promise(resolve=>{const requestId=++aiSequence;aiRequests.set(requestId,resolve);window.webkit.messageHandlers.assetboard.postMessage({action:'aiRecognize',requestId,...params});});}
function aiDialog(){
 if(!nativeStore){toast(tr('AI 识别仅 Mac App 可用'));return;}
 const ai=nativeStore.ai||{},provider=ai.provider||'anthropic',preset=aiProviders[provider];
 modal(tr('AI 识别'),`<form class="form" id="ai-form"><p class="form-note platform-note" title="${tr('保存前会发一条很短的测试请求；接口地址填本机服务（如 http://127.0.0.1:11434/v1）时可不填 key，资料不离开此 Mac')}">${ui('lock')}${tr('只在你点「用 AI 识别」或添加面板的「识别」时，把那份资料从此 Mac 直接发到下面的接口。API key 存入 macOS 钥匙串，网页读不到')}</p><label>${tr('服务类型')}<select name="provider">${Object.entries(aiProviders).map(([key,p])=>`<option value="${key}" ${key===provider?'selected':''}>${p.label}</option>`).join('')}</select></label><label>${tr('接口地址')}<input name="baseURL" required maxlength="300" value="${esc(ai.baseURL||preset.baseURL)}" placeholder="https://api.openai.com/v1"></label><label>${tr('模型')}<input name="model" required maxlength="120" value="${esc(ai.model||preset.model)}" placeholder="${tr('支持图片的模型名')}"></label><label>${nativeStore.aiKeySaved?tr('更换 API key'):'API key'}<input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${nativeStore.aiKeySaved?tr('留空使用已保存的'):tr('粘贴 API key')}"></label><label class="check-label"><input type="checkbox" name="autoImages" ${ai.autoImages===false?'':'checked'}>${tr('导入截图、PDF、邮件或文字后自动用 AI 识别')}</label><p id="ai-status" class="form-note">${ai.model?`${esc(ai.model)} · ${esc(ai.host)}${nativeStore.aiKeySaved||aiLocal(ai.host)?'':' · '+tr('钥匙串里没有 API key')}`:tr('未配置')}</p><div class="form-actions"><button class="button primary" type="submit">${tr('验证并保存')}</button>${ai.model?`<button class="button" type="button" data-action="ai-disconnect" title="${tr('删除 AI 设置和钥匙串里的 API key')}">${tr('删除设置')}</button>`:''}</div></form>`,'ai');
 const form=$('#ai-form');let previous=provider;
 form.elements.provider.onchange=()=>{const from=aiProviders[previous],to=aiProviders[form.elements.provider.value];for(const name of ['baseURL','model'])if(!form.elements[name].value||form.elements[name].value===from[name])form.elements[name].value=to[name];previous=form.elements.provider.value;};
}
document.addEventListener('submit',e=>{if(e.target.id!=='ai-form')return;e.preventDefault();const form=e.target;form.querySelector('[type="submit"]').disabled=true;$('#ai-status').textContent=tr('测试中…');window.webkit.messageHandlers.assetboard.postMessage({action:'aiSave',provider:form.elements.provider.value,baseURL:form.elements.baseURL.value,model:form.elements.model.value,apiKey:form.elements.apiKey.value,autoImages:form.elements.autoImages.checked});form.elements.apiKey.value='';});
window.assetboardAIResult=result=>{
 if(result.kind==='settings'){
  if(!result.ok){const status=$('#ai-status');if(status)status.textContent=result.error||tr('验证失败');const button=$('#ai-form [type="submit"]');if(button)button.disabled=false;return;}
  const closeSettings=()=>{if($('#modal').open&&$('#modal').dataset.view==='ai')$('#modal').close();};
  if(result.disconnected){nativeStore.ai=null;nativeStore.aiKeySaved=false;closeSettings();toast(tr('已删除 AI 设置和 API key'));return;}
  nativeStore.ai=result.ai;nativeStore.aiKeySaved=!!result.aiKeySaved;closeSettings();toast(tr('AI 已就绪 · {model}',{model:result.ai.model}));return;
 }
 if(result.ok&&result.evidenceId){const row=evidenceRows.find(item=>item.id===result.evidenceId);if(row){row.payload=JSON.stringify({...evidencePayload(row),ai:result.ai});evidenceVersion++;}}
 const resolve=aiRequests.get(result.requestId);aiRequests.delete(result.requestId);resolve?.(result);
};
// Imported mail and text go to the configured AI as screenshots do (the AI setting 自动识别); the rules stay the fallback and the
// first reading. Recognizing English bills is the AI's job: the rules know Chinese wording.
function aiAutoPaste(){if(aiReady()&&nativeStore.ai.autoImages!==false)aiRecognizeCandidate('paste');}
async function aiRecognizeCandidate(key){
 const c=findCandidate(key);if(!c||aiBusy.has(key)||!aiReady())return;
 aiBusy.add(key);aiErrors.delete(key);refreshReview(key);
 const result=await aiRequest(key==='paste'?{text:pasteRow.body}:{evidenceId:c.latest.id});
 aiBusy.delete(key);
 if(!result.ok)aiErrors.set(key,result.error||tr('AI 识别失败'));else if(key==='paste'){pasteRow.payload={ai:result.ai};pasteRecorded=new Set();buildPasteCandidate();}
 syncToolbar();refreshReview(key,0);
}
function aiProgressText(){return `${aiBatchState.done}/${aiBatchState.total}${aiBatchState.stop?' · '+tr('停止中'):''}`;}
async function aiBatch(){
 if(!aiReady()||aiBatchState)return;
 const targets=candidates().filter(c=>c.pending&&!c.ai).slice(0,100);
 if(!targets.length){toast(tr('都已识别过'));return;}
 const ok=await confirmDialog(tr('AI 识别 {n} 组？',{n:targets.length}),tr('{n} 组资料的邮件内容或截图会发送到 {host}，按你的账号计费。可随时停止。',{n:targets.length,host:nativeStore.ai.host}),tr('识别 {n} 组',{n:targets.length}));
 if(!ok){inboxDialog(false);return;}
 aiBatchState={done:0,total:targets.length,stop:false};inboxDialog(false);
 let failure='';
 for(const c of targets){if(aiBatchState.stop)break;const result=await aiRequest({evidenceId:c.latest.id});if(!result.ok){failure=result.error||tr('AI 识别失败');break;}aiBatchState.done++;const progress=$('#ai-progress');if(progress)progress.textContent=aiProgressText();}
 const done=aiBatchState.done;aiBatchState=null;syncToolbar();
 if($('#modal').open&&$('#modal').dataset.view==='inbox')inboxDialog(false);
 toast(failure?tr('识别 {n} 组后停止：{error}',{n:done,error:failure}):tr('已识别 {n} 组，请逐组核对',{n:done}));
}
function recordedItems(c){return c.key==='paste'?[...pasteRecorded]:(state.evidenceDecisions||{})[c.ai?.rowId]?.recorded||[];}
function candidateView(c,index){const items=c.ai?.items||[];return index>0&&items[index]?applyAiItem(c.base,items[index],{assets:state.assets,fallback:false}):c;}
function aiSection(c,index){
 if(!nativeStore)return '';
 if(!aiReady())return `<p class="form-note ai-note"><button type="button" class="text-button inline-button" data-action="ai-settings" title="${tr('识别不准时，用你自己的 API key 配置 AI 识别')}">${tr('配置 AI 识别')}</button></p>`;
 const items=c.ai?.items||[],recorded=recordedItems(c),busy=aiBusy.has(c.key),error=aiErrors.get(c.key);
 const sending=c.key==='paste'?tr('粘贴文字'):c.latest.kind==='ocr'?tr('截图'):tr('邮件内容');
 const status=c.ai?c.ai.unreadable?tr('AI 回复无法解析，显示本机识别结果'):items.length?(items.length>1?tr('AI 找到 {n} 项，选一项记录',{n:items.length}):''):tr('AI 没有找到资产信息'):'';
 const list=items.length>1?`<div class="ai-items">${items.map((item,i)=>{const view=candidateView(c,i);return `<label class="check-label ai-item"><input type="radio" name="ai-item" value="${i}" data-action="ai-item" data-id="${esc(c.key)}" ${i===index?'checked':''}><span>${esc(view.name||view.merchant)}${view.cost?` · ${esc(view.cost)}`:''}${view.date?` · ${esc(view.date.value)}`:''}${recorded.includes(i)?' · '+tr('已记录'):''}</span></label>`;}).join('')}</div>`:'';
 return `<div class="ai-panel">${status?`<p class="form-note">${esc(status)}</p>`:''}${list}<button type="button" class="button" data-action="ai-recognize" data-id="${esc(c.key)}" ${busy?'disabled':''}>${busy?tr('识别中…'):c.ai?tr('重新识别'):tr('用 AI 识别')}</button><p class="form-note ai-send" title="${c.latest.kind==='ocr'&&c.key!=='paste'?tr('原文件不在时，发送识别出的文字'):c.key==='paste'?tr('粘贴的文字'):tr('发件人、标题和正文')}">${ui('lock')}${tr('发送{what}到 {host}',{what:sending,host:esc(nativeStore.ai.host)})}</p>${error?`<p class="form-note ai-error">${esc(error)}</p>`:''}</div>`;
}
function candidateChips(c){const match=c.match&&state.assets.find(a=>a.id===c.match);return [c.ai&&!c.ai.unreadable&&'<span class="chip ai">AI</span>',`<span class="chip">${esc(cats[c.type].one)}</span>`,c.cost&&`<span class="chip">${esc(c.cost)}</span>`,c.date&&`<span class="chip ${c.date.source}">${esc(c.date.value)} ${esc(dateKinds[c.date.kind].label)}${c.date.source==='inferred'?' · '+tr('推算'):''}</span>`,match&&`<span class="chip match" title="${tr('可能对应已有资产')}">≈ ${esc(displayName(match))}</span>`,c.ai?.items.length>1&&`<span class="chip">${tr('{n} 项',{n:c.ai.items.length})}</span>`].filter(Boolean).join('');}
function decisionLabel(c){const decision=(state.evidenceDecisions||{})[c.ids[0]],asset=decision?.assetId&&state.assets.find(a=>a.id===decision.assetId);return decision?.status==='dismissed'?tr('已忽略'):asset?(decision?.status==='linked'?tr('已补充到 {name}',{name:displayName(asset)}):tr('已新建 {name}',{name:displayName(asset)})):(decision?.status==='linked'?tr('已补充到资产'):tr('已新建资产'));}
function candidateRow(c){return `<article class="candidate ${c.pending?'':'resolved'}"><div class="candidate-main"><strong>${esc([c.merchant||c.latest.title||tr('未识别来源'),c.name&&c.name!==c.merchant?c.name:''].filter(Boolean).join(' · '))}</strong><span class="candidate-meta">${esc(evidenceKinds[c.latest.kind]||tr('导入资料'))}${c.count>1?` · ${tr('{n} 封',{n:c.count})}`:''}${c.latest.day!=null?` · ${tr('最近 {date}',{date:isoDay(c.latest.day)})}`:''}</span><div class="chips">${candidateChips(c)}</div></div><div class="candidate-actions">${c.pending?`<button class="button" data-action="candidate-review" data-id="${esc(c.key)}">${tr('核对')}</button><button class="text-button" data-action="candidate-dismiss" data-id="${esc(c.key)}">${tr('忽略')}</button>`:`<span class="candidate-status">${esc(decisionLabel(c))}</span><button class="text-button" data-action="candidate-review" data-id="${esc(c.key)}">${tr('查看')}</button><button class="text-button" data-action="candidate-reopen" data-id="${esc(c.key)}">${tr('恢复待确认')}</button>`}</div></article>`;}
function inboxDialog(refresh=true){
 const list=candidates(),pending=list.filter(c=>c.pending),strong=pending.filter(c=>!c.weak),weak=pending.filter(c=>c.weak),resolved=list.filter(c=>!c.pending);
 const paste=`<form class="form inbox-paste" id="paste-form"><textarea id="paste-text" rows="2" aria-label="${tr('粘贴续费通知、账单或收据的文字')}" placeholder="${tr('粘贴通知或账单文字')}" title="${nativeStore?tr('在此 Mac按规则识别，不上传；确认前不写入资产'):tr('在此浏览器按规则识别，不上传；确认前不写入资产')}"></textarea><div class="paste-bar"><span class="chip" title="${nativeStore?tr('在此 Mac按规则识别，不上传；确认前不写入资产'):tr('在此浏览器按规则识别，不上传；确认前不写入资产')}">${ui('lock')}${tr('本地识别')}</span><button class="button primary" type="submit">${tr('识别')}</button></div></form>`;
 const aiControls=!nativeStore?'':aiBatchState?`<span id="ai-progress" class="candidate-meta">${aiProgressText()}</span><button class="text-button" data-action="ai-stop">${tr('停止')}</button>`:aiReady()?`${pending.some(c=>!c.ai)?`<button class="text-button" data-action="ai-batch" title="${tr('用 AI 识别全部待确认资料')}">${tr('全部 AI 识别')}</button>`:''}<button class="icon-button" data-action="ai-settings" title="${tr('AI 设置')}" aria-label="${tr('AI 设置')}">${ui('gear')}</button>`:`<button class="text-button" data-action="ai-settings" title="${tr('配置 AI 识别')}">${tr('配置 AI')}</button>`;
 const imported=nativeStore||evidenceRows.length?`<div class="inbox-head"><strong>${tr('<b class="count">{n}</b>组待核对',{n:strong.length})}</strong><span>${aiControls}${nativeStore?`<button class="icon-button" data-action="import-hub" title="${tr('导入')}" aria-label="${tr('打开导入')}">${ui('download')}</button>`:''}</span></div>${strong.length?strong.slice(0,100).map(candidateRow).join(''):`<p class="form-note">${evidenceRows.length?tr('没有待确认'):tr('还没有资料')}</p>`}${weak.length?`<details class="inbox-more"><summary title="${tr('没识别出金额或日期')}">${tr('未识别 {n} 组',{n:weak.length})}</summary>${weak.slice(0,100).map(candidateRow).join('')}<button class="text-button" data-action="dismiss-weak">${tr('全部忽略')}</button></details>`:''}${resolved.length?`<details class="inbox-more"><summary>${tr('已处理 {n} 组',{n:resolved.length})}</summary>${resolved.slice(0,100).map(candidateRow).join('')}</details>`:''}`:'';
 const queued=intake.length?`<div class="inbox-head"><strong>${tr('<b class="count">{n}</b>项待打开',{n:intake.length})}</strong></div>${intake.map(intakeRow).join('')}`:'';
 modal(tr('待确认'),`<div class="inbox">${queued}${paste}${imported}</div>`,'inbox');
 if(refresh&&nativeStore)requestEvidence();
}
function refreshReview(key,index){const dialog=$('#modal');if(!dialog.open||dialog.dataset.view!=='review'||dialog.dataset.key!==key)return;const c=findCandidate(key);if(c)candidateReview(c,index??(Number(dialog.dataset.index)||0));}
function candidateReview(c,index=0){
 const items=c.ai?.items||[];if(!items[index])index=0;
 const view=candidateView(c,index),row=c.key==='paste'?pasteRow:evidenceRows.find(item=>item.id===(c.ai?.rowId||c.latest.id)),match=view.match&&state.assets.find(a=>a.id===view.match);
 const others=state.assets.filter(a=>a.id!==view.match).sort((left,right)=>left.name.localeCompare(right.name));
 const option=a=>`<option value="${esc(a.id)}">${tr('补充到：{name}',{name:esc(displayName(a))})} · ${esc(cats[a.type].name)}</option>`;
 const row2=([k,v])=>`<div class="fact"><span>${k}</span><span>${esc(v)}</span></div>`;
 const facts=[[tr('名称'),view.name||tr('待填写')],[tr('类别'),cats[view.type].name],...(view.account?[[tr('账号'),view.account]]:[]),[tr('金额'),view.cost||tr('未识别')],[tr('日期'),view.date?`${view.date.value} ${dateKinds[view.date.kind].label}`:tr('未识别')]];
 const basis=[[tr('来源'),`${evidenceKinds[c.latest.kind]||tr('导入资料')}${view.merchant?` · ${view.merchant}`:''}${c.count>1?` · ${tr('{n} 封',{n:c.count})}`:''}`],...(view.date?[[tr('日期依据'),view.date.basis]]:[]),...(view.quote?[[tr('原文依据'),view.quote]]:[]),...(!c.ai&&view.domains.length?[[tr('域名'),view.domains.slice(0,3).join(tr('、'))]]:[])];
 modal(tr('核对识别结果'),`<div class="form candidate-review"><button class="text-button inbox-back" data-action="inbox" title="${tr('返回待确认')}">${ui('back')}${tr('待确认')}</button><div class="facts">${facts.map(row2).join('')}</div><details class="review-basis"><summary>${tr('依据')}</summary><div class="basis-list">${basis.map(row2).join('')}</div></details>${aiSection(c,index)}<label>${tr('记录到')}<select id="candidate-target" aria-label="${tr('记录到')}">${match?option(match):''}<option value="">${tr('新建一项资产')}</option>${others.map(option).join('')}</select></label>${row?`<details><summary>${tr('原文')} · ${esc(row.title)}</summary><pre class="imported-text">${esc(String(row.body).slice(0,4000))}</pre></details>`:''}<div class="confirm-actions"><button class="button primary" data-action="candidate-apply" data-id="${esc(c.key)}" data-index="${index}">${tr('继续')}</button><button class="button" data-action="candidate-dismiss" data-id="${esc(c.key)}">${c.key==='paste'?tr('放弃'):tr('忽略')}</button></div></div>`,'review');
 $('#modal').dataset.key=c.key;$('#modal').dataset.index=String(index);
}
function candidateFill(c,existing,index=0){
 const view=candidateView(c,index),fill={};if(!existing){fill.name=view.name;fill.provider=view.merchant;if(view.account)fill.account=view.account;}
 if(view.cost)fill.cost=view.cost;if(view.date){fill.date=view.date.value;fill.dateKind=view.date.kind;}if(view.cycle)fill.cycle=view.cycle;
 const dateNote=view.date?.source==='inferred'?tr('；日期{basis}',{basis:view.date.basis}):view.date?.source==='ai'&&view.date.basis!==tr('AI 从原文识别')?tr('；')+view.date.basis:'';
 const aiNote=c.ai&&!c.ai.unreadable&&c.ai.items.length?tr('；AI 识别（{model}）',{model:c.ai.model})+(view.quote?tr('：“{quote}”',{quote:view.quote}):''):'';
 const note=`${tr('依据：{kind}《{title}》',{kind:evidenceKinds[c.latest.kind]||tr('导入资料'),title:c.latest.title})}${c.latest.day!=null&&c.latest.kind==='gmail'?` ${isoDay(c.latest.day)}`:''}${dateNote}${aiNote}`;
 fill.notes=existing?.notes?`${existing.notes}\n${note}`:note;return fill;
}
function resolveCandidate(key,status,assetId,index=null){
 const c=findCandidate(key);if(!c)return 0;
 if(key==='paste'){if(index!==null)pasteRecorded.add(index);return 0;}
 state.evidenceDecisions ||= {};const at=new Date().toISOString();
 for(const id of c.pendingIds)state.evidenceDecisions[id]={status,...(assetId?{assetId}:{}),at};
 const decision=index!==null&&c.ai?.items.length>1&&state.evidenceDecisions[c.ai.rowId];if(decision)decision.recorded=[...new Set([...(decision.recorded||[]),index])];
 return c.pendingIds.length;
}
document.addEventListener('submit',e=>{if(e.target.id!=='paste-form')return;e.preventDefault();const text=$('#paste-text').value.trim();if(!text){$('#paste-text').focus();return;}pasteRow={id:'paste-'+Date.now(),kind:'paste',source:'',title:text.split('\n')[0].slice(0,60),body:text,importedAt:new Date().toISOString()};pasteRecorded=new Set();candidateReview(buildPasteCandidate());aiAutoPaste();});
function settings(id){if(!cats[id])return;const count=state.assets.filter(a=>a.type===id).length;
 modal(`${cats[id].name} · ${tr('类别')}`,`<div class="settings-actions"><button class="button" data-action="move-up" data-id="${id}">${tr('向上移动')}</button><button class="button" data-action="move-down" data-id="${id}">${tr('向下移动')}</button>${count?'':`<button class="button" data-action="remove-block" data-id="${id}">${tr('从侧边栏移除')}</button>`}</div><p class="form-note">${tr('也可以在侧边栏拖动类别，或选中后按 ⌥ + ↑ ↓。')}</p>`);}
// 设置 (⌘, in the Mac app, the sidebar's 设置): the one place for viewer settings, optional features and connections. Each switch acts at
// once; the panel is drawn again after a change, with focus kept on the control. Features are per viewer (features.js); 自动获取网站图标
// and 每周核对注册局 are board settings (state), since they decide what the app does with the records.
// The sections, each a page of the panel, chosen in the list at its left; the one shown is kept while the panel is drawn again.
let prefsSection='general';
function prefsDialog(section){
 if(typeof section==='string')prefsSection=section;
 const mac=!!nativeStore&&!demoMode,row=(label,control,title='')=>`<div class="prefs-row"${title?` title="${esc(title)}"`:''}><span class="prefs-label">${label}</span>${control}</div>`;
 const toggle=(action,on,label,extra='')=>`<input type="checkbox" class="prefs-switch" role="switch" data-action="${action}"${extra} aria-label="${esc(label)}"${on?' checked':''}>`;
 const cur=totalCurrency(),chips=MAIN_CURRENCIES.map(c=>`<button type="button" class="choice" role="radio" aria-checked="${c===cur}" data-action="prefs-currency" data-id="${c}">${esc(currencyDisplay[c]||c)} ${c}</button>`).join('');
 const notify={allowed:['ok',tr('已允许')],denied:['bad',tr('已关闭')]}[nativeStore?.notifications]||['',tr('未询问')];
 const langs=Object.entries(LANGS).map(([id,l])=>`<button type="button" class="choice" role="radio" aria-checked="${id===appLang}" data-action="prefs-lang" data-id="${id}" lang="${l.html}">${esc(l.name)}</button>`).join('');
 const general=[row(tr('语言'),`<div class="chip-group" role="radiogroup" aria-label="${tr('语言')}">${langs}</div>`),
  row(tr('计价币种'),`<div class="chip-group" role="radiogroup" aria-label="${tr('计价币种')}">${chips}</div>`,tr('费用合计换算成这种币种；每项资产保留自己的币种')),
  row(tr('隐私模式'),toggle('prefs-privacy',privacy,tr('隐私模式')),tr('遮住名称、账号和 IP，适合共享屏幕；只改显示')),
  mac?row(tr('在菜单栏显示'),toggle('prefs-native',nativeStore.statusItem!==false,tr('在菜单栏显示'),' data-id="statusItem"'),tr('菜单栏的小日历：7 天内到期和待确认扣款的数量')):'',
  mac?row(tr('系统通知'),`<span class="chip ${notify[0]}">${notify[1]}</span><button class="button" data-action="notification-settings">${tr('通知设置…')}</button>`,tr('到期前的提醒用 macOS 通知发出')):''].join('');
 const usable=f=>(!f.mac||nativeStore||demoMode)&&(!f.pro||proLoaded());
 const features=[...Object.entries(FEATURES).filter(([,f])=>usable(f)).map(([key,f])=>row(f.name,toggle('prefs-feature',featureOn(key),f.name,` data-id="${key}"`),f.note)),
  mac?row(tr('自动获取网站图标'),toggle('auto-icons',state.autoIcons!==false,tr('自动获取网站图标')),tr('新添加的资产认出是已知平台时，从它的官网取图标；每次请求都记在网络记录里')):'',
  mac?row(tr('每周核对域名到期日'),toggle('rdap-auto',!!state.rdapAuto,tr('每周向注册局核对域名到期日')),tr('每周把每个域名发给它的注册局（公开 RDAP）查一次；日期不同只提示，不改')):''].join('');
 const link=(name,on,action,title)=>row(name,`${on===null?'':`<span class="chip ${on?'ok':''}">${on?tr('已连接'):tr('未连接')}</span>`}<button class="button" data-action="${action}">${tr('设置…')}</button>`,title);
 const pro=mac&&proLoaded();
 const connections=mac?[pro?link('Cloudflare',!!nativeStore.cloudflareConnected,'cloudflare-import',tr('只读 API 令牌，每 12 小时同步')):'',
  pro?link('GitHub',!!nativeStore.githubConnected,'github-import',tr('本机 gh 或只读令牌')):'',
  pro?link(tr('AI 识别'),!!nativeStore.ai?.model,'ai-settings',tr('你自己的模型和 API key，只在你点识别时发送')):'',
  pro&&featureOn('agent')?link(tr('MCP 接入'),null,'agent-setup',tr('给外部工具的配置')):'',
  pro&&typeof probeOn==='function'&&probeOn()?link(tr('探针数据源'),null,'probe-sources',tr('监控面板的地址和账号')):'',
  pro&&typeof sshOn==='function'&&sshOn()?link(tr('SSH 直读'),null,'ssh-probe-open',tr('逐台开启、读取间隔')):''].join(''):'';
 const about=nativeStore?[row(tr('版本'),`<span class="prefs-version">${esc(nativeStore.version||'')}${mac?`<button class="button" data-action="check-updates">${tr('检查更新…')}</button>`:''}</span>`),
  mac?row(tr('自动检查更新'),toggle('prefs-native',nativeStore.autoUpdate!==false,tr('自动检查更新'),' data-id="autoUpdate"'),tr('每天最多读一次官网的版本文件')):''].join(''):'';
 const sections=[['general',tr('通用'),'gear',general],['features',tr('功能'),'spark',features],['connections',tr('连接'),'cloud',connections],['about',tr('关于'),'info',about]].filter(s=>s[3]);
 if(!sections.some(s=>s[0]===prefsSection))prefsSection='general';
 const nav=sections.map(([id,name,icon])=>`<button type="button" class="prefs-tab" role="tab" id="prefs-tab-${id}" aria-controls="prefs-pane-${id}" aria-selected="${id===prefsSection}" tabindex="${id===prefsSection?0:-1}" data-action="prefs-section" data-id="${id}">${ui(icon)}<span>${name}</span></button>`).join('');
 const panes=sections.map(([id,name,,html])=>`<section class="prefs-group" role="tabpanel" id="prefs-pane-${id}" aria-labelledby="prefs-tab-${id}"${id===prefsSection?'':' hidden'}><h3>${name}</h3>${html}</section>`).join('');
 const was=document.activeElement?.closest?.('#modal')?document.activeElement:null,again=was&&[was.dataset.action,was.dataset.id];
 modal(tr('设置'),`<div class="prefs"><nav class="prefs-nav" role="tablist" aria-orientation="vertical" aria-label="${tr('设置')}">${nav}</nav><div class="prefs-panes">${panes}</div></div>`,'prefs');
 if(again)[...document.querySelectorAll('#modal [data-action]')].find(n=>n.dataset.action===again[0]&&n.dataset.id===again[1])?.focus();
}
// The section list moves with ↑/↓ (← → when it is a row), Home and End, as a tab list does.
document.addEventListener('keydown',e=>{const tab=e.target.closest?.('.prefs-tab');if(!tab||e.metaKey||e.altKey||e.ctrlKey)return;const tabs=[...document.querySelectorAll('#modal .prefs-tab')],at=tabs.indexOf(tab);
 const to={ArrowDown:at+1,ArrowRight:at+1,ArrowUp:at-1,ArrowLeft:at-1,Home:0,End:tabs.length-1}[e.key];if(to===undefined)return;e.preventDefault();e.stopPropagation();const next=tabs[(to+tabs.length)%tabs.length];prefsDialog(next.dataset.id);$(`#prefs-tab-${next.dataset.id}`)?.focus();},true);
// The interface language: the Mac app keeps it and switches in place; the browser keeps it here and reloads; the demo only
// reloads with ?lang= so nothing is stored.
function setLang(lang){
 if(!Object.hasOwn(LANGS,lang)||lang===appLang)return;
 const q=new URLSearchParams(location.search);
 if(demoMode){q.set('lang',lang);location.search=q.toString();return;}
 // The Mac app switches in place: it rebuilds its menus and loads this page again with the saved board (nativeStore.reopen).
 if(nativeStore){window.webkit.messageHandlers.assetboard.postMessage({action:'preference',key:'lang',value:lang});return;}
 try{localStorage.setItem(LANG_KEY,lang);sessionStorage.setItem('assetboard-reopen','prefs');}catch{}
 if(q.has('lang')){q.delete('lang');location.search=q.toString();}else location.reload();
}
function prefsChanged(){if($('#modal').open&&$('#modal').dataset.view==='prefs')prefsDialog();}
function setFeatureNow(key,on){
 setFeature(key,on);
 if(key==='panorama'&&!on&&typeof panoOpen!=='undefined'&&panoOpen)panoramaOpen(false);
 if(key==='probe'&&on){if(typeof probeStart==='function')probeStart();if(typeof sshStart==='function')sshStart();}
 drawTopnavActions();render();prefsChanged();toast(on?tr('{name}：已打开',{name:FEATURES[key].name}):tr('{name}：已关闭',{name:FEATURES[key].name}));
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;
 const fromRail=!!button.closest('#menu.rail-menu');if(button.closest('#menu'))closeMenu();
 if(fromRail&&action==='view'){setView(id);$('#sidebar .nav-item.active')?.focus();return;}
 if(action==='detail'){if($('#modal').open)$('#modal').close();showDetail(id,{focus:e.detail===0||!inspectorDocked()});}
 else if(action==='view')setView(id);
 else if(action==='layout')setLayout(id);
 else if(action==='asset-menu'){if(!$('#menu').hidden&&$('#menu').anchor===button){closeMenu();return;}const a=state.assets.find(x=>x.id===id);if(a)openMenu(assetMenuItems(a),{anchor:button});}
 else if(action==='category-menu'){if(cats[button.dataset.id])settings(button.dataset.id);}
 else if(action==='toast-close')hideToast();
 else if(action==='missed-view'){hideToast();setView('upcoming');}
 else if(action==='nav-more'){if(railOn()){if(!$('#menu').hidden&&$('#menu').anchor===button){closeMenu();return;}openRailMore(button);return;}navMoreOpen=!navMoreOpen;writeViewPrefs();renderSidebar();$('#sidebar .nav-more')?.focus();}
 else if(action==='undo')undo();
 else if(action==='redo')redo();
 else if(action==='quick'){if(!runQuick(id,button.dataset.quick))toast(tr('这个操作已不可用'));}
 else if(action==='copy-ip'){copyText(button.dataset.ip,tr('已复制 IP'));}
 else if(action==='keys-help')toggleKeysHelp();
 else if(action==='reveal'){const value=button.previousElementSibling,shown=button.getAttribute('aria-pressed')==='true';value.textContent=shown?value.dataset.masked:value.dataset.full;button.setAttribute('aria-pressed',String(!shown));button.textContent=shown?tr('显示'):tr('隐藏');}
 else if(action==='link-picker')linkPicker(id);
 else if(action==='icon-dialog')iconDialog(id);
 else if(action==='icon-fetch')fetchIconFor(id);
 else if(action==='privacy')setPrivacy(!privacy);
 else if(action==='sidebar')toggleSidebar();
 else if(action==='icon-batch')iconBatchDialog();
 else if(action==='icon-row-fetch')iconRowFetch(id);
 else if(action==='icon-site-edit'){iconRowEditing={host:id,value:Object.prototype.hasOwnProperty.call(iconSites(),id)?iconSiteFor(iconSites(),id):'',error:''};iconBatchRefresh(id,'input');}
 else if(action==='icon-site-cancel'){iconRowEditing=null;iconBatchRefresh(id,'[data-action="icon-site-edit"]');}
 else if(action==='icon-site-clear')iconSiteClear(id);
 else if(action==='icon-batch-start')iconBatchStart();
 // Stop at once: the dialog's close event comes a task later, and a reply arriving in between must not finish the run.
 else if(action==='icon-batch-cancel'){iconBatchAbort();$('#modal').close();}
 else if(action==='icon-apply'){const a=state.assets.find(x=>x.id===id);if(!a||!iconPreview)return;checkpoint();a.siteIcon=iconPreview.dataUrl;a.siteIconHost=iconPreview.host;save();$('#modal').close();render();if(activeAsset===id)showDetail(id);toast(tr('已使用图标'),true);}
 else if(action==='icon-remove'){const a=state.assets.find(x=>x.id===id);if(!a?.siteIcon)return;checkpoint();delete a.siteIcon;delete a.siteIconHost;save();$('#modal').close();render();if(activeAsset===id)showDetail(id);toast(tr('已移除图标'),true);}
 else if(action==='link'){$('#modal').close();checkpoint();const result=linkRelation(state.assets,id,button.dataset.target);if(!result.ok){history.pop();return;}save();render();showDetail(id);toast(result.replaced.length?tr('已换成新账号'):tr('已关联'),true);}
 else if(action==='link-pays'){const ids=[id,button.dataset.target],x=ids.map(i=>state.assets.find(y=>y.id===i)),p=x.find(y=>y?.type==='phone'),c=x.find(y=>y?.type==='bankcard');if(!p||!c)return;checkpoint();if(!setCardPays(state.assets,p.id,c.id,!cardPaysPhone(c,p))){history.pop();return;}save();render();showDetail(id);}
 else if(action==='link-standby'||action==='link-proxy'){const meta=linkMetaOf(state.assets.find(x=>x.id===id),button.dataset.target);checkpoint();if(!setLinkMeta(state.assets,id,button.dataset.target,action==='link-standby'?{standby:!meta.standby}:{proxied:!meta.proxied})){history.pop();return;}save();render();showDetail(id);}
 else if(action==='unlink'){checkpoint();if(!unlinkAssets(state.assets,id,button.dataset.target)){history.pop();return;}save();render();showDetail(id);toast(tr('已取消关联'),true);}
 else if(action==='inbox')inboxDialog();
 else if(action==='agenda-all')setView('upcoming');
 else if(action==='export-board'){if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'exportBoard'});else exportRun('backup');}
 else if(action==='notification-settings'&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openNotificationSettings'});
 else if(action==='close-modal')$('#modal').close();
 else if(action==='apply-collisions'){const chosen=[...document.querySelectorAll('input[name="collision"]:checked')].map(input=>pendingCollisions[Number(input.value)]).filter(Boolean);$('#modal').close();if(!chosen.length)return;checkpoint();const applied=chosen.filter(item=>applyCollision(state,item)).length;pendingCollisions=[];save();render();toast(tr('已覆盖 {n} 条',{n:applied}),true);}
 else if(action==='candidate-review'){const c=findCandidate(id);if(c)candidateReview(c);}
 else if(action==='candidate-apply'){const c=findCandidate(id);if(!c)return;const index=Number(button.dataset.index)||0,target=$('#candidate-target').value,existing=target&&state.assets.find(a=>a.id===target);assetForm(existing?existing.type:candidateView(c,index).type,existing?existing.id:null,candidateFill(c,existing,index),c.key,index);}
 else if(action==='ai-settings')aiDialog();
 else if(action==='ai-disconnect')window.webkit.messageHandlers.assetboard.postMessage({action:'aiDisconnect'});
 else if(action==='ai-recognize')aiRecognizeCandidate(id);
 else if(action==='ai-batch')aiBatch();
 else if(action==='ai-stop'){if(aiBatchState){aiBatchState.stop=true;const progress=$('#ai-progress');if(progress)progress.textContent=aiProgressText();}}
 else if(action==='ai-item'){const c=findCandidate(id);if(c)candidateReview(c,Number(button.value)||0);}
 else if(action==='candidate-dismiss'){if(id==='paste'){inboxDialog(false);return;}checkpoint();const count=resolveCandidate(id,'dismissed');if(!count){history.pop();return;}save();render();inboxDialog(false);toast(tr('已忽略'),true);}
 else if(action==='candidate-reopen'){const c=findCandidate(id);if(!c)return;checkpoint();for(const key of c.ids)delete state.evidenceDecisions?.[key];save();render();inboxDialog(false);toast(tr('已恢复待确认'),true);}
 else if(action==='dismiss-weak'){const weak=candidates().filter(c=>c.pending&&c.weak);if(!weak.length)return;checkpoint();for(const c of weak)resolveCandidate(c.key,'dismissed');save();render();inboxDialog(false);toast(tr('已忽略 {n} 组',{n:weak.length}),true);}
 else if(action==='intake-open')openIntake(id);
 else if(action==='intake-discard')finishIntake(id);
 else if(action==='pin-front')pinFront(id);
 else if(action==='auto-order')autoOrder(id);
 else if(action==='import-hub')importHub();
 else if(action==='agent-setup')agentSetupDialog();
 else if(action==='agent-tab'){if(!AGENT_TOOLS.some(([tool])=>tool===id))return;agentTool=id;try{localStorage.setItem('assetboard-agent-tool',id);}catch{}agentSetupDialog();}
 else if(action==='network-log')networkDialog();
 else if(action==='cost-panel'){askRates();costDialog();}
 else if(action==='agent-delete-open'){if(isAssetFormDirty()){toast(tr('先保存或关闭正在编辑的资料'));return;}if(intake.some(i=>i.deleteId))agentDeleteDialog();else agentConfirmDialog();}
 else if(action==='cost-currency'){if(!MAIN_CURRENCIES.includes(id))return;displayCurrency=id;writeViewPrefs();askRates();render();costDialog();}
 else if(action==='cost-refresh')askRates(true);
 else if(action==='cost-open'){$('#modal').close();showDetail(id);}
 else if(action==='network-filter'){networkFilter[button.dataset.kind]=id;networkShown=200;renderNetworkDialog();}
 else if(action==='network-more'){networkShown+=200;renderNetworkDialog();}
 else if(action==='network-close')$('#modal').close();
 else if(action==='stale-sync')cloudflareDialog();
 else if(action==='rdap-auto'){state.rdapAuto=button.checked||undefined;if(!state.rdapAuto)delete state.rdapAuto;save();toast(state.rdapAuto?tr('已打开：每周向注册局核对'):tr('已关闭每周核对'));rdapAutoRun();}
 else if(action==='auto-icons'){if(button.checked)delete state.autoIcons;else state.autoIcons=false;save();toast(button.checked?tr('新资产会自动配上官网图标'):tr('已关闭自动获取图标'));if(button.checked)scheduleAutoIcons();}
 else if(action==='prefs')prefsDialog(id==='features'?'features':undefined);
 else if(action==='prefs-lang')setLang(id);
 else if(action==='prefs-currency'){if(!MAIN_CURRENCIES.includes(id))return;displayCurrency=id;writeViewPrefs();askRates();render();prefsChanged();}
 else if(action==='prefs-privacy'){setPrivacy(button.checked);prefsChanged();}
 else if(action==='prefs-section'){prefsDialog(id);$(`#prefs-tab-${id}`)?.focus();}
 else if(action==='check-updates'){if(nativeStore&&!demoMode)window.webkit.messageHandlers.assetboard.postMessage({action:'checkUpdates'});}
 else if(action==='prefs-native'){if(!nativeStore||demoMode||!['statusItem','autoUpdate'].includes(id))return;nativeStore[id]=button.checked;window.webkit.messageHandlers.assetboard.postMessage({action:'preference',key:id,on:button.checked});}
 else if(action==='prefs-feature'){if(FEATURES[id])setFeatureNow(id,button.checked);}
 else if(action==='rdap-apply'){const a=state.assets.find(x=>x.id===id);if(a?.registryExpires)rdapApply(a,a.registryExpires);}
 else if(action==='network-clear')confirmDialog(tr('清空网络记录？'),tr('只清除这份记录，不影响资产和连接。之后的请求会重新记下。'),tr('清空'),true).then(ok=>{if(ok){networkRows=null;window.webkit.messageHandlers.assetboard.postMessage({action:'networkLogClear'});}networkDialog();});
 else if(action==='agent-copy'){const box=document.getElementById(id);if(box)copyText(box.textContent,tr('已复制'));}
 else if(action==='import-pick-file')$('#import-file')?.click();
 else if(action==='import-demo-sample'){if(!demoMode)return;importKind='csv';importCsvText(demoImportSampleCsv(),{filename:'demo-sample.csv'});}
 else if(action==='import-apply'){
  if(!importPlan)return;
  if(importKind==='json'&&$('#import-replace')?.checked){
   const backup={ok:true,board:importPlan.board};importPlan=planBoardBackup(state,backup,{mode:'replace'});
  }
  const restoreKeys=[...document.querySelectorAll('input[name="import-restore"]:checked')].map(input=>input.value);
  const applySame=[...document.querySelectorAll('input[name="import-same"]:checked')].map(input=>input.value);
  const fromIntake=importIntakeId;
  commitImportPlan(importPlan,{},{restoreKeys,applySame,applyCollisions:applySame});
  if(fromIntake)drainIntake();
 }
 else if(action==='manual-import')captureDialog();
 else if(action==='capture-go')captureGo();
 else if(action==='capture-manual')captureGo(true);
 else if(action==='github-import')githubDialog();
 else if(action==='cloudflare-import')cloudflareDialog();
 else if(action==='ocr-import'){if(demoMode){window.assetboardDemoBlocked();return;}if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'ocrImport'});}
 else if(action==='setup-github-token'){const url=githubTokenTemplateUrl();if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url});}
 else if(action==='setup-cloudflare'){const url=button.dataset.url||cloudflareTokenTemplateUrl();if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url});}
 else if(action==='local-cli-refresh')requestLocalCliDetect(true);
 else if(action==='ssh-import'){
  if(demoMode){window.assetboardDemoBlocked();return;}
  if(!nativeStore){toast(tr('SSH 导入仅 Mac App 可用'));return;}
  window.webkit.messageHandlers.assetboard.postMessage({action:'sshConfigImport'});
 }
 else if(action==='github-local-sync'){
  if(demoMode){window.assetboardDemoBlocked();return;}
  if(!nativeStore)return;
  const btn=button;btn.disabled=true;
  const status=$('#github-status');if(status)status.textContent=tr('正在用本机 gh 读取各账号仓库…');
  window.webkit.messageHandlers.assetboard.postMessage({action:'githubSyncLocal'});
 }
 else if(action==='external'){const a=state.assets.find(a=>a.id===id),url=safeManagementUrl(a?.url);if(!url||new URL(url).hostname==='example.com'){toast(tr('先在资料里填管理链接'));return;}if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url});else window.open(url,'_blank','noopener,noreferrer');}
 else if(action==='collapse'){if(query||currentView()!=='all'||!cats[id])return;checkpoint();ensureBlock(state,id);const b=state.blocks.find(x=>x.id===id),fold=!b.folded,targets=e.altKey?categoryIds():[id];for(const type of targets){ensureBlock(state,type);state.blocks.find(x=>x.id===type).folded=fold;}save();foldRender(targets,id);document.querySelector(`#board [data-action="collapse"][data-id="${id}"]`)?.focus();if(e.altKey)toast(fold?tr('已收起全部类别'):tr('已展开全部类别'),true);}
 else if(action==='all')setView(id);
 else if(action==='back')setView('all');
 else if(action==='add-asset')captureDialog(id);
 else if(action==='edit-asset')assetForm(state.assets.find(a=>a.id===id).type,id);
 else if(action==='settings')settings(id);
 else if(action==='toggle-hidden')setView('hidden');
 else if(action==='toggle-stopped')toggleStopped(id);
 else if(action==='hide-asset'){const a=state.assets.find(a=>a.id===id);if(!a||a.hiddenAt)return;checkpoint();a.hiddenAt=new Date().toISOString();save();if(activeAsset===id)closeDetail();render();const impact=linkImpact(state.assets,a),links=linkedAssets(state.assets,a).filter(x=>!x.hiddenAt).length;toast((impact.length?tr('已隐藏，它仍是 {n} 项的{role}',{n:formatCount(impact.length),role:IMPACT_WORDS[a.type].role}):links?tr('已隐藏，{n} 项关联保留',{n:formatCount(links)}):tr('已隐藏'))+icpNote(a),true);}
 else if(action==='restore-asset'){const a=state.assets.find(a=>a.id===id),fromBoard=!!button.closest('#board');if(!a)return;checkpoint();delete a.hiddenAt;save();if(activeAsset===id)showDetail(id);render();if(fromBoard)(document.querySelector(`#board [data-asset="${CSS.escape(id)}"] .item-open`)||document.querySelector('#board [data-action="restore-asset"]')||$('#sidebar .nav-item.active'))?.focus();toast(tr('已恢复显示'),true);}
 else if(action==='delete-asset')confirmDeleteAsset(id);
 else if(action==='remove-block'){if(state.assets.some(a=>a.type===id))return;checkpoint();state.blocks=state.blocks.filter(b=>b.id!==id);save();$('#modal').close();render();toast(tr('已从侧边栏移除'),true);}
 else if(action==='move-up'||action==='move-down'){moveBlock(id,action==='move-up'?-1:1);$('#modal').close();}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='asset-form')return;e.preventDefault();const form=e.target,data=new FormData(form),name=String(data.get('name')).trim(),url=String(data.get('url')).trim(),file=form.elements.icon.files[0];if(!name)return;const leaked=['name','provider','account','purpose','reason','cost','notes'].find(key=>looksLikeCardNumber(data.get(key)));if(leaked){const input=form.elements[leaked];input.setCustomValidity(tr('这里像是完整卡号。Assetboard 只保存卡号后 4 位，请删掉后再保存。'));input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return;}if(url&&!safeManagementUrl(url)){form.elements.url.setCustomValidity(tr('请输入不含账号密码的 http 或 https 链接'));form.elements.url.reportValidity();return;}form.elements.url.setCustomValidity('');const entryChecks=[['amount',text=>{const t=text.trim().replace(/,/g,'');return !t||/^\d+(\.\d{1,2})?$/.test(t);},tr('请填写数字金额，例如 89 或 10.98')],['date',text=>!text.trim()||!!parseLooseDate(text),tr('日期无法识别，例如 2027-03-01 或 3/1')],['regionText',text=>!text.trim()||!!form.elements.region.value,tr('请从列表里选择国家或地区')]];for(const [field,ok,message] of entryChecks){const input=form.elements[field];if(!input||input.type==='hidden')continue;input.setCustomValidity(ok(input.value)?'':message);if(!input.checkValidity()){input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return;}}const actionHints={host:tr('请填写主机名或 IP，例如 203.0.113.10'),ips:tr('最多 4 个有效 IP，用逗号或空格分隔'),sshUser:tr('SSH 用户只能包含字母、数字和 _ . -'),sshPort:tr('端口是 1 到 65535 之间的数字'),localPath:tr('请填写以 / 或 ~/ 开头的本机目录'),dnsHost:tr('只写服务商名字，最多 60 字'),icp:tr('备案号要带 ICP，例如 京ICP备00000000号')};for(const key of Object.keys(actionHints)){const input=form.elements[key];if(!input)continue;input.setCustomValidity(validActionField(key,input.value)?'':actionHints[key]);if(!input.checkValidity()){input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return;}}if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>256*1024)){toast(tr('图标需为 PNG、JPEG 或 WebP，且不超过 256 KB'));return;}const submit=form.querySelector('[type="submit"]');submit.disabled=true;try{const iconData=file?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}):null;const id=form.dataset.id,chosen=String(data.get('type')||''),type=cats[chosen]?chosen:form.dataset.type,candidateKey=form.dataset.candidate,candidateItem=form.dataset.item===''||form.dataset.item===undefined?null:Number(form.dataset.item),profile=assetProfiles[type]||{},date=data.has('expiry')?cardExpiry(data.get('expiry'))||'':parseLooseDate(data.get('date')??''),dateKind=data.has('expiry')?'expire':dateKinds[data.get('dateKind')]?String(data.get('dateKind')):'expire',cycle=billingCycles[data.get('cycle')]?String(data.get('cycle')):'',extras=Object.fromEntries((profile.extra||[]).map(key=>[key,String(data.get(key)??'').trim()])),fields={name,provider:profile.fixedProvider||String(data.get('provider')??'').trim()||(assetProfiles[type]?'':'平台待补充'),account:String(data.get('account')).trim(),purpose:String(data.get('purpose')).trim(),reason:String(data.get('reason')||'').trim(),date,dateKind,cycle,cost:costFromForm(data,cycle),notes:String(data.get('notes')).trim(),url:url?safeManagementUrl(url):''},event=date?`${date} ${dateKinds[dateKind].future}`:'日期待补充';if(extras.region&&!regionName(extras.region))extras.region='';if(extras.last4&&!/^\d{4}$/.test(extras.last4))extras.last4='';if(extras.network&&!cardNetworks.includes(extras.network))extras.network='';if(extras.cardStatus&&!CARD_STATUSES[extras.cardStatus])extras.cardStatus='';if(extras.phoneStatus&&!PHONE_STATUSES[extras.phoneStatus])extras.phoneStatus='';if(extras.phone)extras.phone=extras.phone.slice(0,30);Object.assign(fields,extras);const money=moneyFromForm(form,data,id?state.assets.find(x=>x.id===id):null);if(!money)return;Object.assign(fields,money);for(const [key] of ACTION_FIELDS[type]||[])if(data.has(key))fields[key]=key==='ips'?parseIps(data.get(key)).ips.map(x=>x.ip):String(data.get(key)).trim();const keep=keepFromForm(form,data,type);if(!keep)return;Object.assign(fields,keep);checkpoint();let assetId=id;if(id){const a=state.assets.find(a=>a.id===id);const synced=PLATFORM_SOURCES.includes(a.source);if(a.source==='cloudflare'&&a.syncName==null)a.syncName=a.name;Object.assign(a,fields);clearEmptyFields(a);for(const key of ['region','last4','network','cardStatus','phone','phoneStatus'])if(!(key in extras))delete a[key];if(file)a.iconData=iconData;else if(data.has('removeIcon'))delete a.iconData;if(!synced){a.source='manual';a.type=type;a.event=event;a.updatedAt=new Date().toISOString();}delete a.warn;ensureBlock(state,a.type);}else{assetId='asset-'+crypto.randomUUID();state.assets.push(clearEmptyFields({id:assetId,type,...fields,iconData,source:'manual',event,art:'generic',createdAt:new Date().toISOString()}));if(state.cardOrder?.[type]?.length)state.cardOrder[type].unshift(assetId);ensureBlock(state,type);}const resolved=candidateKey?resolveCandidate(candidateKey,id?'linked':'created',assetId,candidateItem):0;assetFormSnapshot=null;save();render();if(id&&activeAsset===id)showDetail(id);const source=candidateKey&&findCandidate(candidateKey),items=source?.ai?.items||[],recorded=items.length>1?recordedItems(source):[],next=items.length>1?items.findIndex((_,index)=>!recorded.includes(index)):-1;if(next>=0){candidateReview(source,next);toast(tr('已记录，这份资料里还有 {n} 项',{n:items.length-recorded.length}),true);}else if(candidateKey&&nativeStore&&pendingCount()){inboxDialog(false);toast(resolved?tr('已记录，继续核对下一组'):tr('已记录'),true);}else{$('#modal').close();toast(id?tr('资料已更新'):tr('资产已添加'),true);}}catch{toast(tr('读取图标失败，请重试'));}finally{submit.disabled=false;}});
setIconButton($('#add-block'),'plus',tr('添加资产'));document.querySelectorAll('#layout-toggle [data-action="layout"]').forEach(b=>b.innerHTML=ui(b.dataset.id==='grid'?'tiles':'list'));$('#view-menu').innerHTML=ui('more');setIconButton($('#import-button'),'download',tr('导入'));$('#add-block').onclick=addAsset;$('#close-modal').onclick=()=>requestCloseModal();$('#close-detail').onclick=closeDetail;$('#modal').addEventListener('cancel',e=>{if(isAssetFormDirty()){e.preventDefault();requestCloseModal();}else assetFormSnapshot=null;});
$('#search').oninput=e=>{query=e.target.value;render();};$('#clear-search').onclick=()=>{if(query){$('#search').value='';query='';render();}else addAsset();};
// Keyboard map (DESIGN-PRINCIPLES §4 rule 4). Letter keys never act while typing, with a dialog open, or with ⌘/⌃/⌥ held.
let helpReturn=null;
function typing(e){return e.isComposing||!!e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}
function focusSearchBox(){const input=$('#search');input.focus();input.select();}
function navTargets(){return [...document.querySelectorAll('#board .group-title:not(.static),#board .item-open')].filter(n=>n.getClientRects().length);}
function focusCard(n){n.focus({preventScroll:true});n.scrollIntoView({block:'nearest',inline:'nearest'});}
function focusAsset(id){const n=id&&document.querySelector(`#board [data-asset="${CSS.escape(id)}"] .item-open`);if(n&&n.getClientRects().length){focusCard(n);return true;}return false;}
function inspectorDocked(){return matchMedia('(min-width: 1180px)').matches;}
// Lists walk in reading order with ↑/↓. The grid moves spatially: ←/→ within a group, ↑/↓ to the nearest item above or below, preferring the same column.
function moveFocus(from,key){
 const list=navTargets(),sign=key==='ArrowRight'||key==='ArrowDown'?1:-1,horizontal=key==='ArrowLeft'||key==='ArrowRight',grid=!!from.closest('.group-body.grid')||from.classList.contains('group-title')&&!!from.closest('.group')?.querySelector('.group-body.grid');
 let next=null;
 if(!grid){if(horizontal)return;next=list[list.indexOf(from)+sign];}
 else if(horizontal&&!from.classList.contains('group-title')){const body=from.closest('.group-body'),peers=list.filter(n=>n.closest('.group-body')===body);next=peers[peers.indexOf(from)+sign];}
 else if(!horizontal){
  const r=from.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let score=Infinity;
  for(const n of list){if(n===from)continue;const b=n.getBoundingClientRect(),main=(b.top+b.height/2-cy)*sign;if(main<=4)continue;const lined=b.right>r.left+2&&b.left<r.right-2,value=(lined?0:100000)+main+Math.abs(b.left+b.width/2-cx)*(lined?.25:2);if(value<score){score=value;next=n;}}
 }
 if(!next)return;
 focusCard(next);
 // With the inspector open beside the list, the selection carries it along (like Mail's reading pane).
 const id=next.closest('[data-asset]')?.dataset.asset;if(id&&!$('#detail').hidden&&inspectorDocked())showDetail(id,{focus:false});
}
function navMove(from,key){const items=[...document.querySelectorAll('#sidebar .nav-item')],at=items.indexOf(from);if(key==='ArrowDown'||key==='ArrowUp'){items[at+(key==='ArrowDown'?1:-1)]?.focus();return;}if(key==='ArrowRight'){const first=navTargets()[0];if(first)focusCard(first);}}
function keyAsset(e){const item=e.target.closest?.('#board [data-asset]');if(item)return item.dataset.asset;return e.target.closest?.('#detail')&&activeAsset?activeAsset:null;}
function fire(action,id){const b=document.createElement('button');b.hidden=true;b.dataset.action=action;b.dataset.id=id;document.body.append(b);b.click();b.remove();}
function keysHelpHtml(){
 const row=(keys,label)=>`<li><span>${label}</span><span class="keys">${keys.map(k=>`<kbd>${k}</kbd>`).join('')}</span></li>`;
 const groups=[[tr('浏览'),[[['⌘K','/'],tr('搜索')],[['↑','↓'],tr('移动')],[['↩'],tr('详情')],[['←'],tr('侧边栏')],[['⌃⌘S'],tr('收起侧边栏')],[['P'],tr('全景')],[['esc'],tr('返回')]]],[tr('整理'),[[['I'],tr('导入')],[['N'],tr('新建')],[['E'],tr('编辑')],[['R'],tr('已续费')],[['H'],tr('隐藏')],[['F'],tr('置前')],[['⌥','↑ ↓'],tr('调整顺序')],[['L'],tr('关联')],[['S'],tr('停用')]]],[tr('快捷'),[[['O'],tr('打开')],[['⌘C'],tr('复制')]]],[tr('编辑'),[[['⌘Z'],tr('撤销')],[['⇧⌘Z'],tr('重做')],[['⌘↩'],tr('保存')],[['tab'],tr('换字段')]]]];
 return `<div class="keys-card" role="document" tabindex="-1"><div class="keys-head"><h2 id="keys-help-title" title="${tr('在输入框里打字时，字母键不生效')}">${tr('快捷键')}</h2><button class="close" data-action="keys-help" aria-label="${tr('关闭快捷键说明')}">×</button></div><div class="keys-grid">${groups.map(([title,rows])=>`<section><h3>${title}</h3><ul>${rows.map(([k,l])=>row(k,l)).join('')}</ul></section>`).join('')}</div></div>`;
}
function toggleKeysHelp(show){
 const layer=$('#keys-help'),open=show??layer.hidden;if(open===!layer.hidden)return;
 if(open){helpReturn=document.activeElement;layer.innerHTML=keysHelpHtml();layer.hidden=false;layer.querySelector('.keys-card').focus();}
 else{layer.hidden=true;if(helpReturn?.isConnected)helpReturn.focus();helpReturn=null;}
}
$('#keys-help').addEventListener('click',e=>{if(e.target===e.currentTarget)toggleKeysHelp(false);});
document.addEventListener('keydown',e=>{
 const mod=e.metaKey||e.ctrlKey,key=e.key.length===1?e.key.toLowerCase():e.key,modalOpen=$('#modal').open,helpOpen=!$('#keys-help').hidden;
 if((e.metaKey&&e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='s')||(e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&e.code==='Backslash')){e.preventDefault();toggleSidebar();return;}
 if(mod&&!e.altKey&&!e.shiftKey&&key==='k'){e.preventDefault();if(helpOpen)toggleKeysHelp(false);focusSearchBox();return;}
 if(mod&&!e.altKey&&key==='z'&&!modalOpen&&!typing(e)){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
 if(mod&&!e.altKey&&!e.shiftKey&&key==='Enter'&&modalOpen){const form=e.target.closest?.('form');if(form){e.preventDefault();form.requestSubmit();}return;}
 if(key==='Escape'){
  if(helpOpen){e.preventDefault();toggleKeysHelp(false);return;}
  if(modalOpen||gesture?.active)return;
  if(e.target.id==='search'){if(e.target.value){e.target.value='';e.target.dispatchEvent(new Event('input',{bubbles:true}));}else e.target.blur();return;}
  if(!$('#detail').hidden)closeDetail();
  return;
 }
 if(e.target.id==='search'&&key==='ArrowDown'&&!mod&&!e.altKey){const first=navTargets().find(n=>n.classList.contains('item-open'));if(first){e.preventDefault();focusCard(first);}return;}
 if(modalOpen||typing(e))return;
 if(mod&&!e.altKey&&!e.shiftKey&&key==='c'&&!String(getSelection?.()||'')){const id=keyAsset(e);if(id){e.preventDefault();if(!runQuick(id,null,'copy'))toast(tr('没有可复制的内容'));}return;}
 if(mod||e.altKey)return;
 if(e.key==='?'){e.preventDefault();toggleKeysHelp();return;}
 if(helpOpen)return;
 if(key==='/'){e.preventDefault();focusSearchBox();return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
  const nav=e.target.closest?.('#sidebar .nav-item');if(nav){e.preventDefault();navMove(nav,key);return;}
  const from=e.target.closest?.('#board .group-title,#board .item-open');if(!from)return;
  e.preventDefault();
  if(key==='ArrowLeft'&&!from.closest('.group-body.grid')){($('#sidebar .nav-item.active')||$('#sidebar .nav-item'))?.focus();return;}
  moveFocus(from,key);return;
 }
 if(e.shiftKey&&key!=='n')return;
 if(key==='i'){e.preventDefault();importHub();return;}
 if(key==='n'){e.preventDefault();const group=e.target.closest?.('#board .group')?.dataset.group,type=cats[group]?group:(e.target.closest?.('#detail')&&state.assets.find(a=>a.id===activeAsset)?.type)||(cats[currentView()]?currentView():null);captureDialog(type);return;}
 const id=keyAsset(e),a=id&&state.assets.find(x=>x.id===id);if(!a)return;
 if(key==='e'){e.preventDefault();assetForm(a.type,id);}
 else if(key==='r'){e.preventDefault();renewDialog(id);}
 else if(key==='s'){e.preventDefault();if(a.hiddenAt)return;if(toggleStopped(id)&&!e.target.closest('#detail'))focusAsset(id);else if(!STOPPABLE.includes(a.type))toast(tr('这类不用标停用'));}
 else if(key==='l'){e.preventDefault();if(a.hiddenAt){toast(tr('先恢复显示，再关联'));return;}linkPicker(id);}
 else if(key==='o'){e.preventDefault();if(!runQuick(id,null,'open'))toast(tr('没有可打开的链接或目录'));}
 else if(key==='f'){e.preventDefault();if(a.hiddenAt){toast(tr('先恢复显示，再放到前面'));return;}pinFront(id);if(!e.target.closest('#detail'))focusAsset(id);}
 else if(key==='h'){
  e.preventDefault();const inDetail=!!e.target.closest('#detail'),peers=navTargets().filter(n=>n.classList.contains('item-open')),own=peers.findIndex(n=>n.closest('[data-asset]')?.dataset.asset===id),near=[peers[own+1],peers[own-1]].map(n=>n?.closest('[data-asset]')?.dataset.asset).filter(Boolean),restoring=!!a.hiddenAt;
  fire(restoring?'restore-asset':'hide-asset',id);
  if(inDetail&&restoring)return;
  if(!focusAsset(id))near.some(focusAsset);
 }
});
// Direct manipulation, no layout mode: a row moves within its group, onto a sidebar category to change its category, and sidebar categories reorder.
// Mouse starts after 5px, touch after a long press; Esc cancels; ⌥ + arrows is the keyboard path.
let gesture=null,suppressClick=false,floatTip=null;
const settleEase='cubic-bezier(.22,1,.36,1)';
function reduceMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
function docRect(el){const r=el.getBoundingClientRect(),s=boardScroller();return {left:r.left+s.scrollLeft,top:r.top+s.scrollTop,right:r.right+s.scrollLeft,bottom:r.bottom+s.scrollTop,width:r.width,height:r.height};}
function inside(r,x,y){return !!r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
function slideFrom(el,from,duration=MOTION_MS){if(!from)return;const to=el.getBoundingClientRect(),dx=from.left-to.left,dy=from.top-to.top;if(Math.abs(dx)>=1||Math.abs(dy)>=1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration,easing:settleEase});}
function showTip(text,x=0,y=0,tone='',clear=null){if(!floatTip){floatTip=document.createElement('div');floatTip.setAttribute('aria-hidden','true');document.body.append(floatTip);}floatTip.hidden=!text;if(!text)return;floatTip.className=`float-tip ${tone}`;floatTip.textContent=text;const w=floatTip.offsetWidth,h=floatTip.offsetHeight;let left=x+14,top=y+20;if(clear){left=x-w/2;top=clear.bottom+8;if(top+h>innerHeight-8)top=clear.top-h-8;}floatTip.style.left=Math.max(8,Math.min(innerWidth-w-8,left))+'px';floatTip.style.top=Math.max(8,Math.min(innerHeight-h-8,top))+'px';}
// Only the touched prefix becomes manual order (touchedPrefix); untouched rows keep following recency.
function saveCardOrder(category,next){const existing=state.cardOrder?.[category]||[];checkpoint();state.cardOrder ||= {};state.cardOrder[category]=[...next,...existing.filter(id=>!next.includes(id))];save();}
function commitAssetOrder(source,target,after=false){
 if(!source||!target||source===target||source.parentElement!==target.parentElement)return false;
 const category=source.parentElement.dataset.reorder;if(!cats[category])return false;
 const current=[...source.parentElement.children].filter(n=>n.dataset.asset).map(n=>n.dataset.asset),next=moveAsset(current,source.dataset.asset,target.dataset.asset,after);
 if(next.every((id,i)=>id===current[i]))return false;
 saveCardOrder(category,touchedPrefix(current,next));render();return true;
}
function moveBlock(id,step){const order=categoryIds(),index=order.indexOf(id),target=index+step;if(index<0||target<0||target>=order.length){toast(step<0?tr('已经是第一个类别'):tr('已经是最后一个类别'));return false;}checkpoint();for(const type of order)ensureBlock(state,type);[order[target],order[index]]=[order[index],order[target]];state.blocks=order.map(type=>state.blocks.find(b=>b.id===type));save();render();toast(step<0?tr('已向上移动'):tr('已向下移动'),true);return true;}
function dragSource(target){
 if(query)return null;
 const item=target.closest('#board [data-reorder] > [data-asset]');
 if(item)return {kind:'card',el:item,container:item.parentElement,block:item.closest('.group')};
 const nav=target.closest('#sidebar .nav-item[data-block]');
 return nav?{kind:'block',el:nav,container:nav.parentElement}:null;
}
function releaseGesture(){const g=gesture;if(!g)return;clearTimeout(g.timer);cancelAnimationFrame(g.frame);removeEventListener('pointermove',dragMove);removeEventListener('pointerup',dragEnd);removeEventListener('pointercancel',dragEnd);gesture=null;}
function slotOrder(g){const key=g.kind==='block'?'block':'asset';return [...g.container.children].filter(n=>n===g.slot||n!==g.el&&n.dataset[key]).map(n=>(n===g.slot?g.el:n).dataset[key]);}
function measureItems(g){const key=g.kind==='block'?'block':'asset';g.items=[...g.container.children].filter(n=>n!==g.el&&n!==g.slot&&n.dataset[key]).map(n=>({el:n,r:docRect(n)}));g.slotRect=docRect(g.slot);g.box=docRect(g.container);}
function beginDrag(g){
 const el=g.el;if(!el.isConnected){releaseGesture();return;}
 clearTimeout(g.timer);g.active=true;cancelAnimationFrame(layoutFrame);closeMenu(false);
 document.querySelectorAll('#board .group,#board [data-asset],#sidebar .nav-item').forEach(n=>n.getAnimations().forEach(a=>a.cancel()));
 const r=el.getBoundingClientRect();g.rect=r;g.dx=g.x0-r.left;g.dy=g.y0-r.top;
 g.slot=document.createElement('div');g.slot.className=`drop-slot ${g.kind}-slot`;g.slot.style.width=r.width+'px';g.slot.style.height=r.height+'px';el.before(g.slot);
 el.classList.add('is-dragging');document.body.classList.add('drag-active');
 Object.assign(el.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:'0',transformOrigin:`${g.dx}px ${g.dy}px`});
 const placed=el.getBoundingClientRect();if(Math.abs(placed.left-r.left)>.5||Math.abs(placed.top-r.top)>.5){el.style.left=2*r.left-placed.left+'px';el.style.top=2*r.top-placed.top+'px';}
 // A row can also land on another category in the sidebar; those targets are fixed, so they are measured live.
 if(g.kind==='card'){g.asset=state.assets.find(a=>a.id===el.dataset.asset);g.homeRect=docRect(g.container);g.others=[...document.querySelectorAll('#sidebar .nav-item[data-block]')].filter(n=>n.dataset.block!==g.asset?.type);}
 g.initial=slotOrder(g);measureItems(g);
 const s=boardScroller(),bar=document.querySelector('#topbar');g.top=s!==document.scrollingElement?s.getBoundingClientRect().top:bar&&getComputedStyle(bar).display!=='none'?Math.max(0,bar.getBoundingClientRect().bottom):0;
 try{document.body.setPointerCapture(g.id);}catch{}
 getSelection()?.removeAllRanges();
 if(reduceMotion())el.classList.add('lifted');else requestAnimationFrame(()=>el.classList.add('lifted'));
 followPointer(g);g.frame=requestAnimationFrame(()=>autoScroll(g));
}
function followPointer(g){g.el.style.translate=`${g.x-g.dx-g.rect.left}px ${g.y-g.dy-g.rect.top}px`;}
function setCrossTarget(g,target){
 if(g.cross===target)return;
 g.cross?.classList.remove('drop-into','drop-refused');g.cross=target;g.crossAllowed=!!target&&!PLATFORM_SOURCES.includes(g.asset?.source);
 target?.classList.add(g.crossAllowed?'drop-into':'drop-refused');g.el.classList.toggle('refused',!!target&&!g.crossAllowed);
}
function moveSlot(g,mode,ref){
 const items=g.items.map(it=>it.el),near=(n,dir)=>{let s=n[dir];while(s&&!items.includes(s))s=s[dir];return s;};
 if(mode==='home'?g.slot.nextElementSibling===g.el:mode==='before'?near(g.slot,'nextElementSibling')===ref:near(g.slot,'previousElementSibling')===ref)return;
 const motion=!reduceMotion(),all=[...g.container.children].filter(n=>n!==g.el&&n!==g.slot),from=motion?new Map(all.map(n=>[n,n.getBoundingClientRect()])):null;
 if(motion)all.forEach(n=>n.getAnimations().forEach(a=>a.cancel()));
 if(mode==='home')g.el.before(g.slot);else if(mode==='before')ref.before(g.slot);else ref.after(g.slot);
 g.lockUntil=performance.now()+60;
 measureItems(g);
 if(motion)for(const n of all)slideFrom(n,from.get(n));
}
function placeSlot(g){
 if(performance.now()<(g.lockUntil||0))return;
 const s=boardScroller(),x=g.x+s.scrollLeft,y=g.y+s.scrollTop;
 if(g.kind==='card'){const over=g.others.find(n=>inside(n.getBoundingClientRect(),g.x,g.y))||null;setCrossTarget(g,over);if(over||!inside(g.homeRect,x,y)){moveSlot(g,'home');return;}}
 else if(x<g.box.left-48||x>g.box.right+48||y<g.box.top-48||y>g.box.bottom+48){moveSlot(g,'home');return;}
 if(inside(g.slotRect,x,y))return;
 let best=null,distance=Infinity;
 for(const it of g.items){const dx=Math.max(it.r.left-x,0,x-it.r.right),dy=Math.max(it.r.top-y,0,y-it.r.bottom),d=dx*dx+dy*dy;if(d<distance){distance=d;best=it;}}
 if(!best)return;
 const vertical=best.r.width>g.box.width*.7,before=vertical?y<best.r.top+best.r.height/2:x<best.r.left+best.r.width/2;
 moveSlot(g,before?'before':'after',best.el);
}
function dragTip(g){showTip(g.cross?g.crossAllowed?tr('移到「{name}」',{name:cats[g.cross.dataset.block].name}):tr('同步来的资产不能改类别'):'',g.x,g.y,g.crossAllowed?'':'refused',g.el.getBoundingClientRect());}
function autoScroll(g){
 if(gesture!==g||!g.active)return;
 const s=boardScroller(),bottom=s===document.scrollingElement?innerHeight:s.getBoundingClientRect().bottom,zone=60,v=g.y<g.top+zone?-(g.top+zone-g.y)/zone:g.y>bottom-zone?(g.y-bottom+zone)/zone:0;
 if(v&&g.kind==='card'){const before=s.scrollTop;s.scrollBy(0,Math.sign(v)*Math.min(1,v*v)*20);if(s.scrollTop!==before)placeSlot(g);}
 g.frame=requestAnimationFrame(()=>autoScroll(g));
}
function dragMove(e){
 const g=gesture;if(!g||e.pointerId!==g.id)return;g.x=e.clientX;g.y=e.clientY;
 if(!g.active){const moved=Math.hypot(g.x-g.x0,g.y-g.y0);if(g.touch){if(moved>8)releaseGesture();}else if(moved>5)beginDrag(g);return;}
 if(!g.el.isConnected){abortDrag(g);return;}
 followPointer(g);placeSlot(g);dragTip(g);
}
function dragEnd(e){const g=gesture;if(!g||e.pointerId!==g.id)return;if(!g.active){releaseGesture();return;}suppressClick=true;setTimeout(()=>suppressClick=false,0);const cancelled=e.type==='pointercancel';if(!cancelled&&g.el.isConnected){g.x=e.clientX;g.y=e.clientY;g.lockUntil=0;placeSlot(g);}dropDrag(g,cancelled);}
function cleanupDrag(g){
 showTip('');document.body.classList.remove('drag-active');g.cross?.classList.remove('drop-into','drop-refused');
 g.el.classList.remove('is-dragging','lifted','settling','refused');for(const p of ['position','left','top','width','height','margin','translate','transformOrigin'])g.el.style[p]='';
 if(g.slot.isConnected)g.slot.replaceWith(g.el);
 if(gesture===g)gesture=null;
}
function abortDrag(g){releaseGesture();cleanupDrag(g);g.slot.remove();render();}
function dropDrag(g,cancelled=false){
 cancelAnimationFrame(g.frame);removeEventListener('pointermove',dragMove);removeEventListener('pointerup',dragEnd);removeEventListener('pointercancel',dragEnd);
 g.active=false;showTip('');
 const cross=!cancelled&&g.cross&&g.crossAllowed?g.cross.dataset.block:null;
 if(cross){finishCross(g,cross);return;}
 if(cancelled||g.cross)moveSlot(g,'home');
 g.cross?.classList.remove('drop-into','drop-refused');
 const next=slotOrder(g),changed=next.some((id,i)=>id!==g.initial[i]);
 const done=()=>{
  if(gesture!==g)return;cleanupDrag(g);
  if(changed&&g.kind==='block'){checkpoint();for(const type of next)ensureBlock(state,type);state.blocks=[...next.map(type=>state.blocks.find(b=>b.id===type)),...state.blocks.filter(b=>!next.includes(b.id))];save();}
  else if(changed&&g.kind==='card')saveCardOrder(g.container.dataset.reorder,touchedPrefix(g.initial,next));
  render();if(changed)toast(g.kind==='block'?tr('类别顺序已调整'):tr('顺序已调整'),true);
 };
 if(reduceMotion()){done();return;}
 const to=g.slot.getBoundingClientRect();g.el.classList.add('settling');g.el.classList.remove('lifted','refused');g.el.style.translate=`${to.left-g.rect.left}px ${to.top-g.rect.top}px`;setTimeout(done,MOTION_MS);
}
function finishCross(g,type){
 const a=g.asset;
 cleanupDrag(g);
 if(!a||!cats[type]){render();return;}
 checkpoint();a.type=type;ensureBlock(state,type);
 if(state.cardOrder){for(const key of Object.keys(state.cardOrder))state.cardOrder[key]=(state.cardOrder[key]||[]).filter(id=>id!==a.id);if(state.cardOrder[type]?.length)state.cardOrder[type].push(a.id);}
 save();render();
 const target=document.querySelector(`#sidebar .nav-item[data-block="${CSS.escape(type)}"]`);
 if(target&&!reduceMotion()){target.classList.add('drop-flash');setTimeout(()=>target.classList.remove('drop-flash'),600);}
 toast(tr('已移到「{name}」',{name:cats[type].name}),true);
}
document.addEventListener('pointerdown',e=>{
 if(gesture||!e.isPrimary||e.button!==0||e.target.closest('input,select,textarea,.r-actions'))return;
 const source=dragSource(e.target);if(!source)return;
 const g=gesture={...source,id:e.pointerId,touch:e.pointerType!=='mouse',x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,active:false};
 if(g.touch)g.timer=setTimeout(()=>{if(gesture===g)beginDrag(g);},300);
 addEventListener('pointermove',dragMove);addEventListener('pointerup',dragEnd);addEventListener('pointercancel',dragEnd);
});
addEventListener('click',e=>{if(!suppressClick)return;suppressClick=false;e.preventDefault();e.stopPropagation();},true);
addEventListener('keydown',e=>{if(e.key!=='Escape'||!gesture?.active)return;e.preventDefault();e.stopImmediatePropagation();suppressClick=true;addEventListener('pointerup',()=>setTimeout(()=>suppressClick=false,0),{once:true,capture:true});dropDrag(gesture,true);},true);
for(const el of [$('#board'),$('#sidebar')]){el.addEventListener('touchmove',e=>{if(gesture?.active)e.preventDefault();},{passive:false});el.addEventListener('dragstart',e=>e.preventDefault());}
document.addEventListener('contextmenu',e=>{if(gesture?.touch)e.preventDefault();});
// ⌥ + arrows: a row moves one place within its group (grids also take ←/→); a sidebar category moves up or down.
document.addEventListener('keydown',e=>{
 if(!e.altKey||e.metaKey||e.ctrlKey||query||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
 const step=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1,opener=e.target.closest?.('#board [data-reorder] .item-open');
 if(opener){
  e.preventDefault();if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!opener.closest('.group-body.grid'))return;
  const source=opener.closest('[data-asset]'),id=source.dataset.asset,siblings=[...source.parentElement.children].filter(n=>n.dataset.asset);
  if(commitAssetOrder(source,siblings[siblings.indexOf(source)+step],step>0)){focusAsset(id);toast(step<0?tr('已向前移动'):tr('已向后移动'),true);}return;
 }
 const nav=e.target.closest?.('#sidebar .nav-item[data-block]')||(e.key==='ArrowUp'||e.key==='ArrowDown')&&e.target.closest?.('#board .group-title[data-action="collapse"]');
 if(nav&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();const id=nav.dataset.block||nav.dataset.id,fromBoard=!!nav.closest('#board');if(moveBlock(id,step))document.querySelector(fromBoard?`#board .group-title[data-id="${CSS.escape(id)}"]`:`#sidebar .nav-item[data-block="${CSS.escape(id)}"]`)?.focus();}
});
window.addEventListener('resize',()=>{if(gesture?.active)dropDrag(gesture,true);});
// Row columns follow the width of the main area (the sidebar and a docked inspector take their share), set as a class so the DOM is not rebuilt.
rememberCosts();
// Promotions that ended while the app was closed settle now (the regular price becomes the cost, with history); checked hourly.
function settleDue(){if(demoMode)return;const changed=settlePromotions(state.assets);if(changed.length){rememberCosts();save();render();}}
settleDue();setInterval(settleDue,3600000);
new ResizeObserver(([entry])=>{const w=entry.contentRect.width,size=w<600?'s':w<860?'m':'l';if($('#board').dataset.size!==size)$('#board').dataset.size=size;}).observe($('#main'));
render();
// What came due while the board was not in front of anyone (U3): checked on opening, on coming back to the front and every few minutes
// (a Mac that slept with the window open comes back without a visibility change). The last look is this viewer's, in localStorage.
const SEEN_KEY='assetboard-seen-v1',MISSED_GAP_MS=3600000;
function checkMissed(){
 if(demoMode||document.visibilityState==='hidden')return;
 let since=0;try{since=Number(localStorage.getItem(SEEN_KEY))||0;localStorage.setItem(SEEN_KEY,String(Date.now()));}catch{return;}
 if(!since||Date.now()-since<MISSED_GAP_MS)return;
 const missed=missedReminders(liveAssets(),new Date(since)).map(m=>state.assets.find(a=>a.id===m.id)).filter(Boolean);if(!missed.length)return;
 const days=Math.round((Date.now()-since)/86400000),names=missed.slice(0,3).map(a=>`${displayName(a)} ${eventInfo(a).text}`.trim()).join(tr('、'))+(missed.length>3?tr(' 等'):'');
 notice(days>=1?tr('离开的 {days} 天里有 {n} 项到了提醒的时候：{names}',{days,n:missed.length,names}):tr('离开这段时间有 {n} 项到了提醒的时候：{names}',{n:missed.length,names}),{action:'missed-view',label:tr('查看')});
}
function markSeen(){if(demoMode)return;try{localStorage.setItem(SEEN_KEY,String(Date.now()));}catch{}}
document.addEventListener('visibilitychange',()=>document.visibilityState==='hidden'?markSeen():checkMissed());
setInterval(checkMissed,300000);
checkMissed();
// A wide window opens with the first item selected, so the inspector column is there from the start (once per launch, focus stays put).
function selectFirstOnce(){if(!inspectorDocked()||!$('#detail').hidden||query)return;const first=document.querySelector('#board [data-asset]');if(first)showDetail(first.dataset.asset,{focus:false});}
selectFirstOnce();
installImportDropPaste();
// Delete requests still waiting from an earlier run come back to the confirmation list.
if(!demoMode){const back=[];for(const action of agentActionList().filter(a=>a.status==='pending'&&(a.kind||'delete')!=='delete'))for(const item of action.items.filter(x=>x.status==='pending')){if(proSlots.agentConfirms[action.kind])back.push(agentConfirmEntry(action,item));else answerAgentAction(action.id,item.id,'failed','这个版本不支持');}
 for(const action of agentActionList().filter(a=>a.status==='pending'&&(a.kind||'delete')==='delete'))for(const item of action.items.filter(x=>x.status==='pending')){if(state.assets.some(a=>a.id===item.id))back.push({source:'agent',name:tr('删除「{name}」',{name:item.name}),deleteId:item.id,actionId:action.id,note:action.reason});else answerAgentAction(action.id,item.id,'deleted','确认前已删除');}if(back.length)queueIntake(back);}
if(nativeStore){document.documentElement.classList.add('native-app');if(!demoMode){requestEvidence();syncReminders();setInterval(syncReminders,3600000);rdapAutoRun();setInterval(rdapAutoRun,6*3600000);}document.querySelectorAll('.form-note').forEach(el=>{el.textContent=el.textContent.replaceAll(tr('当前浏览器'),tr('此 Mac')).replaceAll(tr('此浏览器'),tr('此 Mac'));});if(!nativeStore.data||migratedLegacyData)save();}
else if(migratedLegacyData)save();
if(demoMode){document.documentElement.classList.add('demo-mode');const badge=document.createElement('span');badge.className='demo-badge';badge.setAttribute('role','note');badge.setAttribute('aria-label',tr('演示模式：全部为虚构数据，不会保存'));badge.title=tr('演示模式：全部为虚构数据，不会保存');badge.textContent=tr('演示');document.querySelector('#topbar .view-head').append(badge);}

document.body.classList.add('first-paint');setTimeout(()=>document.body.classList.remove('first-paint'),600);

// Pro's top-bar tools sit in one wrapper that is drawn again when 设置 switches a feature they belong to.
function drawTopnavActions(){$('#topnav-slot')?.remove();$('#topnav-actions').insertAdjacentHTML('beforeend',`<span id="topnav-slot" class="topnav-slot">${slotHtml('topnavActions')}</span>`);}
drawTopnavActions();

// ---- The window's chrome. The board scrolls inside the card (the page only scrolls in the phone layout). In the Mac app the top
// bar is the title bar: the app draws the traffic lights in it and moves the window from its empty parts, so the page tells it
// where the bar's controls are; full screen hides the lights and gives their room back.
function boardScroller(){const board=$('#board');return board&&getComputedStyle(board).overflowY!=='visible'?board:document.scrollingElement;}
function postWindowChrome(){
 if(!nativeStore||chromeFrame)return;
 chromeFrame=requestAnimationFrame(()=>{
  chromeFrame=0;const bar=$('#topnav');if(!bar)return;
  const holes=[...bar.querySelectorAll('button,label,input,a')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(Math.round);});
  const message=JSON.stringify({height:Math.round(bar.getBoundingClientRect().height),holes});if(message===chromeSent)return;chromeSent=message;
  window.webkit.messageHandlers.assetboard.postMessage({action:'windowChrome',...JSON.parse(message)});
 });
}
window.assetboardWindowState=state=>{const full=!!state?.fullScreen;document.documentElement.classList.toggle('full-screen',full);if(typeof panoramaNative==='function')panoramaNative(full);postWindowChrome();};
new MutationObserver(railTips).observe($('#sidebar'),{childList:true});
new ResizeObserver(postWindowChrome).observe($('#topnav'));
syncSidebar();
// Demo screenshots of the rail: open 更多, or show the tip on 域名, once the board has drawn.
if(railForced&&(demoRail==='more'||demoRail==='tip'))setTimeout(()=>{const target=$(demoRail==='more'?'#sidebar .nav-more':'#sidebar .nav-item[data-block="domain"]');if(!target)return;if(demoRail==='more')openRailMore(target);else showRailTip(target,true);},400);
// Screenshots of the Mac app's demo, which can be captured but not clicked: `--demo --open-asset=<id>` opens that record's detail,
// `--demo --panorama` opens 全景, `--demo --probe-sources` the probe settings (Pro), once every script has run. The app passes them
// only in the demo; elsewhere nothing reads them.
// After a language switch the page comes back with 设置 open, where the switch was made.
window.addEventListener('DOMContentLoaded',()=>{let again=nativeStore?.reopen==='prefs';try{again||=sessionStorage.getItem('assetboard-reopen')==='prefs';sessionStorage.removeItem('assetboard-reopen');}catch{}if(again)prefsDialog();});
if(demoMode&&nativeStore?.demoOpen)window.addEventListener('DOMContentLoaded',()=>{
 const open=nativeStore.demoOpen;
 if(typeof open.asset==='string'&&state.assets.some(a=>a.id===open.asset)){if(view!=='all')setView('all');showDetail(open.asset);}
 if(open.panorama===true&&typeof panoramaOpen==='function')panoramaOpen(true);
 if(open.probeSources===true&&typeof window.probeDialog==='function')window.probeDialog({add:true});
 if(open.theme===true)themeDialog();
});
