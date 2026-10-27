// Node (the tests) has no i18n.js loaded before this file: take its tr(), which answers in Chinese.
if(typeof module!=='undefined'&&typeof tr==='undefined'){const i18n=require('./i18n.js');globalThis.tr=i18n.tr;globalThis.trLocale=i18n.trLocale;}
// v0.1.0 sample records are recognized by their exact contents. Edited records stay intact.
const legacyDemoFingerprints={a1:'a25c4927',a2:'4ae9484c',a3:'6a950cfa',a4:'f4736ff',a5:'4967c541',a6:'11aae485',a7:'3df0a90b',a8:'de0706d5',a9:'79622532'};
const legacyDefaultBlocks=[['domain',60],['server',40],['subscription',40],['database',60]];

function assetFingerprint(asset){
 const canonical=JSON.stringify(Object.keys(asset).sort().map(key=>[key,asset[key]]));
 let hash=2166136261;
 for(let i=0;i<canonical.length;i++){hash^=canonical.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16);
}

function removeUntouchedDemo(board){
 const assets=board.assets.filter(asset=>legacyDemoFingerprints[asset.id]!==assetFingerprint(asset));
 const isDefaultPrefix=legacyDefaultBlocks.every(([id,width],index)=>{
  const block=board.blocks[index];
  return block&&Object.keys(block).length===4&&block.id===id&&block.width===width&&block.collapsed===false&&block.height===null;
 });
 const removeBlocks=isDefaultPrefix&&!assets.some(asset=>legacyDefaultBlocks.some(([id])=>asset.type===id));
 const blocks=removeBlocks?board.blocks.slice(legacyDefaultBlocks.length):board.blocks;
 return {board:{...board,assets,blocks},removed:board.assets.length-assets.length,removedBlocks:removeBlocks?legacyDefaultBlocks.length:0};
}

// Display order (2026-10-09): what shows first is the person's own order (cardOrder), then the most recently updated.
// The board never guesses importance; urgency only colours dates, the agenda and block summaries.
// Recency: updatedAt (platform or last local edit), else createdAt (added or first imported); records with neither keep their stored order after dated ones.
function recencyTime(asset){return Date.parse(asset?.updatedAt)||Date.parse(asset?.createdAt)||0;}
function recentFirst(assets){return assets.map((asset,index)=>({asset,index,time:recencyTime(asset)})).sort((left,right)=>(right.time-left.time)||(left.index-right.index)).map(item=>item.asset);}
function arrangeAssets(assets,ids){
 const rank=new Map((Array.isArray(ids)?ids:[]).map((id,index)=>[id,index]));
 const ranked=assets.filter(asset=>rank.has(asset.id)).sort((left,right)=>rank.get(left.id)-rank.get(right.id));
 return [...ranked,...recentFirst(assets.filter(asset=>!rank.has(asset.id)))];
}
// Manual orders only keep the part a person actually changed, so everything after it stays in recency order.
function touchedPrefix(before,after){let last=-1;for(let i=0;i<after.length;i++)if(before[i]!==after[i])last=i;return after.slice(0,last+1);}
function bringToFront(ids,id){return [id,...(Array.isArray(ids)?ids:[]).filter(other=>other!==id)];}

// Category quick actions (DESIGN-PRINCIPLES §5): read-only, local actions only — open a link, copy a value, open an existing local folder.
// A domain's DNS host (research Q1: registrar, DNS and hosting are often three places) and its ICP filing number ride along (research D7, D12): it is no action, but the form and the agent take it the same way.
const ACTION_FIELDS={server:[['host',tr('SSH 主机'),tr('例如 203.0.113.10')],['ips','IP','203.0.113.10, 2001:db8::10'],['sshUser',tr('SSH 用户'),tr('例如 deploy')],['sshPort',tr('SSH 端口'),'22']],repository:[['localPath',tr('本机目录'),tr('例如 ~/code/my-project')]],domain:[['dnsHost',tr('DNS 托管'),tr('例如 Cloudflare、DNSPod')],['icp',tr('备案号'),tr('例如 京ICP备00000000号')]]};
const QUICK_LIMIT=2;
// IP addresses of a server (v13 A). `ips` holds up to IP_LIMIT literals (public v4/v6, or inner addresses); `host` stays the SSH target.
// Parsing is literal only: nothing here resolves a name or touches the network.
const IP_LIMIT=4;
function parseIPv4(text){
 const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);if(!m)return null;
 const parts=m.slice(1);if(parts.some(part=>part.length>1&&part[0]==='0'))return null;
 const octets=parts.map(Number);return octets.every(n=>n<=255)?octets:null;
}
function parseIPv6(text){
 if(!/^[0-9a-fA-F:]+$/.test(text)||text.length<2||text.length>39)return null;
 const halves=text.split('::');if(halves.length>2)return null;
 const side=part=>part===''?[]:part.split(':');
 const head=side(halves[0]),tail=halves.length===2?side(halves[1]):[];
 if([...head,...tail].some(group=>!/^[0-9a-fA-F]{1,4}$/.test(group)))return null;
 const missing=8-head.length-tail.length;
 if(halves.length===1?missing!==0:missing<1)return null;
 return [...head,...Array(halves.length===2?missing:0).fill('0'),...tail].map(group=>parseInt(group,16));
}
function compressIPv6(groups){
 let best=-1,bestLength=0;
 for(let i=0;i<8;){if(groups[i]!==0){i++;continue;}let j=i;while(j<8&&groups[j]===0)j++;if(j-i>bestLength){best=i;bestLength=j-i;}i=j;}
 const hex=groups.map(group=>group.toString(16));
 if(bestLength<2)return hex.join(':');
 return `${hex.slice(0,best).join(':')}::${hex.slice(best+bestLength).join(':')}`;
}
// → {ip, version, inner} for a usable address, or null. Loopback, unspecified, link-local, multicast and reserved ranges are refused.
function normalizeIp(text){
 const raw=String(text??'').trim().replace(/^\[|\]$/g,'');if(!raw)return null;
 const v4=parseIPv4(raw);
 if(v4){
  const [a,b]=v4;
  if(a===0||a===127||a>=224||(a===169&&b===254))return null;
  const inner=a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127);
  return {ip:v4.join('.'),version:4,inner};
 }
 const v6=parseIPv6(raw);
 if(v6){
  if(v6.every((group,i)=>group===0||(i===7&&group===1)))return null;
  if((v6[0]&0xffc0)===0xfe80||(v6[0]&0xff00)===0xff00)return null;
  return {ip:compressIPv6(v6),version:6,inner:(v6[0]&0xfe00)===0xfc00};
 }
 return null;
}
// Free text → {ips, invalid, tooMany}; commas, semicolons and whitespace separate; duplicates collapse.
function parseIps(text){
 const ips=[],invalid=[];let tooMany=false;
 for(const part of String(text??'').split(/[\s,;]+/).filter(Boolean)){
  const found=normalizeIp(part);
  if(!found){invalid.push(part);continue;}
  if(ips.some(item=>item.ip===found.ip))continue;
  if(ips.length>=IP_LIMIT){tooMany=true;continue;}
  ips.push(found);
 }
 return {ips,invalid,tooMany};
}
// Stored addresses, or the host when it is an address literal and none are stored (no migration needed).
function assetIps(asset){
 const stored=Array.isArray(asset?.ips)?asset.ips:[],list=[];
 for(const item of stored){const found=normalizeIp(item);if(found&&!list.some(x=>x.ip===found.ip)&&list.length<IP_LIMIT)list.push(found);}
 if(!list.length&&asset?.host){const found=normalizeIp(asset.host);if(found)list.push(found);}
 return list;
}
// What a card shows: first public v4, else first public v6, else the first inner address; `more` marks a second public family.
function primaryIp(asset){
 const list=assetIps(asset);if(!list.length)return null;
 const publicV4=list.find(x=>x.version===4&&!x.inner),publicV6=list.find(x=>x.version===6&&!x.inner);
 const main=publicV4||publicV6||list[0];
 return {ip:main.ip,inner:main.inner,version:main.version,more:publicV4&&publicV6?'v6':'',count:list.length};
}
// Presentation mode hides the middle of an address (203.0.•••.•••, 2001:db8:••••).
function maskIp(ip){
 const found=normalizeIp(ip);if(!found)return '';
 if(found.version===4){const [a,b]=found.ip.split('.');return `${a}.${b}.•••.•••`;}
 const groups=parseIPv6(found.ip);return `${groups.slice(0,2).map(group=>group.toString(16)).join(':')}:••••`;
}
function validIpList(text){const parsed=parseIps(text);return !parsed.invalid.length&&!parsed.tooMany;}

function validActionField(key,value){
 const v=String(value??'').trim();if(!v)return true;
 if(key==='host')return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$|^\[?[0-9A-Fa-f:]{2,39}\]?$/.test(v);
 if(key==='ips')return validIpList(v);
 if(key==='sshUser')return /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(v);
 if(key==='sshPort')return /^\d{1,5}$/.test(v)&&+v>=1&&+v<=65535;
 if(key==='localPath')return v.length<=1000&&/^(\/|~\/)/.test(v)&&!v.includes('\0')&&!v.split('/').includes('..');
 if(key==='dnsHost')return v.length<=60&&!/[<>]/.test(v)&&!looksLikeSecret(v);
 if(key==='icp')return v.length<=60&&/ICP/i.test(v)&&!/[<>]/.test(v);
 return false;
}
function sshCommand(asset){const host=String(asset.host||'').trim();if(!host||!validActionField('host',host))return '';const user=validActionField('sshUser',asset.sshUser)?String(asset.sshUser||'').trim():'',port=validActionField('sshPort',asset.sshPort)?String(asset.sshPort||'').trim():'';return `ssh ${port&&port!=='22'?`-p ${port} `:''}${user?user+'@':''}${host.replace(/^\[|\]$/g,'')}`;}
function cloneUrl(link){try{const url=new URL(link);const parts=url.pathname.split('/').filter(Boolean);if(url.protocol!=='https:'||!['github.com','gitlab.com','codeberg.org'].includes(url.hostname)||parts.length!==2)return '';return `https://${url.hostname}/${parts[0]}/${parts[1].replace(/\.git$/,'')}.git`;}catch{return '';}}
// link is the asset's safe, real management URL (or ''); native tells whether local folders can be opened.
function quickActions(asset,{link='',native=false}={}){
 if(!asset||asset.hiddenAt)return [];
 const open=label=>link?{id:'open',kind:'open',label,value:link}:null,copy=(id,label,value,done)=>value?{id,kind:'copy',label,value,done}:null;
 const local=native&&asset.localPath&&validActionField('localPath',asset.localPath)?{id:'editor',kind:'local',label:tr('用本机编辑器打开'),value:String(asset.localPath).trim()}:null;
 const list=asset.type==='domain'?[open(tr('打开管理页')),copy('copy-name',tr('复制域名'),String(asset.name||'').trim(),tr('域名'))]
  :asset.type==='server'?[copy('copy-ssh',tr('复制 SSH 命令'),sshCommand(asset),tr('SSH 命令')),open(tr('打开控制台')),(()=>{const ip=primaryIp(asset);return ip?copy('copy-ip',tr('复制 IP'),ip.ip,tr(' IP')):copy('copy-host',tr('复制主机'),validActionField('host',asset.host)?String(asset.host||'').trim():'',tr('主机地址'));})()]
  :asset.type==='repository'?[open(tr('在浏览器打开')),copy('copy-clone',tr('复制克隆地址'),cloneUrl(link),tr('克隆地址')),local]
  :[open(tr('打开管理页'))];
 return list.filter(Boolean);
}

function orderAssets(assets,ids){
 if(!Array.isArray(ids)||!ids.length)return assets;
 const rank=new Map(ids.map((id,index)=>[id,index]));
 return [...assets].sort((left,right)=>(rank.get(left.id)??Infinity)-(rank.get(right.id)??Infinity));
}

function moveAsset(ids,movingId,targetId,after=false){
 if(movingId===targetId||!ids.includes(movingId)||!ids.includes(targetId))return ids;
 const next=ids.filter(id=>id!==movingId);
 next.splice(next.indexOf(targetId)+(after?1:0),0,movingId);
 return next;
}

// Dates are local calendar days (YYYY-MM-DD). Day numbers avoid DST drift.
const DAY_MS=86400000;
const SOON_DAYS=30;
// label is shown (the form, review); future and past are the words of the stored `event` text and the Chinese status, which
// dateStatusWords spells out per kind for the interface language.
const dateKinds={
 expire:{label:tr('到期'),future:'到期',past:'已过期'},
 renew:{label:tr('自动续费扣款'),future:'扣款',past:'扣款日已过'},
 trial:{label:tr('试用结束'),future:'试用结束',past:'试用已结束'},
 cancel:{label:tr('取消截止'),future:'取消截止',past:'已过取消截止'},
 keep:{label:tr('保号期限'),future:'保号到期',past:'保号已过期'}
};
// [n days past, today, tomorrow, in n days, on a date] for each kind, as people read them.
const dateStatusWords={
 expire:[n=>tr('已过期 {n} 天',{n}),()=>tr('今天到期'),()=>tr('明天到期'),n=>tr('{n} 天后到期',{n}),on=>tr('{on} 到期',{on})],
 renew:[n=>tr('扣款日已过 {n} 天',{n}),()=>tr('今天扣款'),()=>tr('明天扣款'),n=>tr('{n} 天后扣款',{n}),on=>tr('{on} 扣款',{on})],
 trial:[n=>tr('试用已结束 {n} 天',{n}),()=>tr('今天试用结束'),()=>tr('明天试用结束'),n=>tr('{n} 天后试用结束',{n}),on=>tr('{on} 试用结束',{on})],
 cancel:[n=>tr('已过取消截止 {n} 天',{n}),()=>tr('今天取消截止'),()=>tr('明天取消截止'),n=>tr('{n} 天后取消截止',{n}),on=>tr('{on} 取消截止',{on})],
 keep:[n=>tr('保号已过期 {n} 天',{n}),()=>tr('今天保号到期'),()=>tr('明天保号到期'),n=>tr('{n} 天后保号到期',{n}),on=>tr('{on} 保号到期',{on})]
};
// The text for a date `days` away (negative = past) of a kind.
function dateWhen(kind,days,date){const [past,today,tomorrow,soon,on]=dateStatusWords[kind]||dateStatusWords.expire;return days<0?past(-days):days===0?today():days===1?tomorrow():days<=60?soon(days):on(date);}
// suffix is part of the stored cost text ("$10.98 / 年") and is read back, so it stays as it is; label is shown.
const billingCycles={monthly:{label:tr('每月'),months:1,suffix:'月'},quarterly:{label:tr('每 3 个月'),months:3,suffix:'3 个月'},halfyearly:{label:tr('每 6 个月'),months:6,suffix:'6 个月'},yearly:{label:tr('每年'),months:12,suffix:'年'}};

function dayNumber(value){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
 if(!match)return null;
 const year=+match[1],month=+match[2],day=+match[3],time=Date.UTC(year,month-1,day),check=new Date(time);
 return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day?time/DAY_MS:null;
}

function localDay(now=new Date()){return Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/DAY_MS;}
function isoDay(number){return new Date(number*DAY_MS).toISOString().slice(0,10);}

function addMonths(value,months){
 const [year,month,day]=value.split('-').map(Number),total=year*12+month-1+months,targetYear=Math.floor(total/12),targetMonth=total-targetYear*12;
 const last=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate();
 return isoDay(Date.UTC(targetYear,targetMonth,Math.min(day,last))/DAY_MS);
}

// A recurring date rolls forward from its original anchor, so a month-end date stays month-end.
function nextOccurrence(value,cycle,today){
 const start=dayNumber(value),months=billingCycles[cycle]?.months;
 if(start===null)return null;
 if(!months||start>=today)return value;
 for(let step=1;step<=1200;step++){
  const next=addMonths(value,months*step);
  if(dayNumber(next)>=today)return next;
 }
 return null;
}

function assetDateStatus(asset,now=new Date()){
 const kind=dateKinds[asset?.dateKind]?asset.dateKind:'expire',today=localDay(now),date=nextOccurrence(asset?.date,asset?.cycle,today);
 if(!date)return {level:'none',label:'',kind,date:'',days:null,rolled:false};
 const days=dayNumber(date)-today,label=dateWhen(kind,days,date);
 return {level:days<0?'overdue':days<=SOON_DAYS?'soon':'upcoming',label,kind,date,days,rolled:date!==asset.date};
}

function upcomingEvents(assets,now=new Date(),horizon=60){
 return assets.filter(asset=>!asset.hiddenAt&&!asset.stopped)
  .map(asset=>({asset,status:assetDateStatus(asset,now)}))
  .filter(({status})=>status.level!=='none'&&status.days<=horizon)
  .sort((left,right)=>left.status.days-right.status.days||left.asset.name.localeCompare(right.asset.name));
}

// Local notifications in the Mac app. Lead days: trials, cancel deadlines and monthly dates 3 and 1 day ahead, everything else 30, 7 and 1.
// One notification per day at 09:00 (several dates on one day are merged), nearest first; Swift schedules them and keeps at most 64.
// Something that simply runs out (a one-off expiry or a keep-alive deadline) is also named on the day and after it, because the days
// just after expiry are when it can still be saved: before each stage of a known lifecycle ends (lifecycleOf), else on days 3 and 14.
// A repeating expiry or keep-alive gets one question the day after instead (pendingRenewals): an auto-renewal can fail silently, and a
// keep-alive only counts if the person actually did it, so neither date rolls on unasked.
const REMINDER_HOUR=9,REMINDER_LIMIT=60,REMINDER_SPAN=400,AFTER_DUE_DAYS=[3,14];
function reminderLeads(asset){return ['trial','cancel'].includes(asset?.dateKind)||asset?.cycle==='monthly'?[3,1]:[30,7,1];}
function runsOut(asset){return ['expire','keep'].includes(asset?.dateKind||'expire')&&!billingCycles[asset?.cycle];}
function needsConfirm(asset){return ['expire','keep'].includes(asset?.dateKind||'expire')&&!!billingCycles[asset?.cycle];}
const confirmWords={expire:{ask:tr('续上了吗'),due:tr('应自动续费'),yes:tr('已续上'),no:tr('没续上'),remind:tr('昨天该自动续费，确认续上了吗')},
 keep:{ask:tr('保号做了吗'),due:tr('保号期限'),yes:tr('做了'),no:tr('没做'),remind:tr('昨天是保号期限，这次保号做了吗')}};

// What happens after an expiry, for providers whose rules are published. Days count from the expiry date; `to` is the last day of a
// stage, rounded to the safe side where the provider's wording leaves a day open. Unmatched records just show days since expiry.
const LIFECYCLE_RULES=[
 {id:'cloudflare-domain',type:'domain',provider:/cloudflare/i,gtld:true,brief:tr('过期即进入 30 天赎回期（可能加价）'),end:tr('已删除，任何人都能注册'),
  stages:[{to:30,label:tr('赎回期'),can:tr('还能恢复，可能要加价，期间不能转移')},{to:35,label:tr('待删除'),can:tr('已经不能恢复')}]},
 {id:'namecheap-domain',type:'domain',provider:/namecheap/i,gtld:true,brief:tr('过期后约 30 天内可原价续，之后赎回要加价'),end:tr('已删除，任何人都能注册'),
  stages:[{to:29,label:tr('宽限期'),can:tr('还能按原价续费')},{to:59,label:tr('赎回期'),can:tr('还能赎回，要另付赎回费')},{to:64,label:tr('待删除'),can:tr('已经不能恢复')}]},
 // 阿里云 and 腾讯云 registrars stop resolving the day after expiry, inside the full-price window (research D8); .cn and .hk run shorter
 // than a gTLD (D9). Official pages checked 2026-10-23.
 {id:'aliyun-domain-cn',type:'domain',provider:/阿里云|万网|aliyun|alibaba/i,tld:/^(cn|中国|公司|xn--fiqs8s|xn--55qx5d)$/,brief:tr('过期次日停止解析，30 天内可原价续'),end:tr('已删除，任何人都能注册'),
  stages:[{to:30,label:tr('续费期'),can:tr('已停止解析，还能按原价续费')},{to:44,label:tr('赎回期'),can:tr('还能赎回，要另付赎回费')},{to:49,label:tr('待删除'),can:tr('已经不能恢复')}]},
 {id:'aliyun-domain-hk',type:'domain',provider:/阿里云|万网|aliyun|alibaba/i,tld:/^hk$/,brief:tr('过期次日停止解析，28 天内可原价续，没有赎回期'),end:tr('已删除，任何人都能注册'),
  stages:[{to:28,label:tr('续费期'),can:tr('已停止解析，还能按原价续费')}]},
 {id:'aliyun-domain',type:'domain',provider:/阿里云|万网|aliyun|alibaba/i,gtld:true,brief:tr('过期次日停止解析，30 天内可原价续'),end:tr('已删除，任何人都能注册'),
  stages:[{to:30,label:tr('续费期'),can:tr('已停止解析，还能按原价续费')},{to:60,label:tr('赎回期'),can:tr('还能赎回，要另付赎回费')},{to:65,label:tr('待删除'),can:tr('已经不能恢复')}]},
 {id:'tencent-domain-cn',type:'domain',provider:/腾讯云|dnspod|tencent/i,tld:/^(cn|中国|公司|xn--fiqs8s|xn--55qx5d)$/,brief:tr('过期后停止解析，约 30 天内可原价续'),end:tr('已开放注册，任何人都能注册'),
  stages:[{to:30,label:tr('宽限期'),can:tr('已停止解析，还能按原价续费')},{to:45,label:tr('赎回期'),can:tr('还能赎回，要另付赎回费，恢复解析要 24–48 小时')}]},
 {id:'tencent-domain',type:'domain',provider:/腾讯云|dnspod|tencent/i,gtld:true,brief:tr('过期后停止解析，约 30 天内可原价续'),end:tr('已删除，任何人都能注册'),
  stages:[{to:30,label:tr('宽限期'),can:tr('已停止解析，还能按原价续费')},{to:60,label:tr('赎回期'),can:tr('还能赎回，要另付赎回费，恢复解析要 24–48 小时')},{to:65,label:tr('待删除'),can:tr('已经不能恢复')}]},
 {id:'aliyun-server',type:'server',provider:/阿里云|aliyun|alibaba/i,brief:tr('过期即停机，约 15 天后释放，数据不可恢复'),end:tr('实例和数据已释放，不可恢复；没随实例释放的云盘、EIP、快照可能还在扣费'),
  stages:[{to:14,label:tr('已停机'),can:tr('续费后恢复，数据还在')}]},
 // 腾讯云 CVM: about 48 hours after expiry it is isolated into the recycle bin, kept 15 days from there (official, 2026-09-22).
 {id:'tencent-server',type:'server',provider:/腾讯云|tencent|qcloud/i,brief:tr('过期约 48 小时后停服进回收站，再过 15 天释放，数据不可恢复'),end:tr('实例和数据已释放，不可恢复；弹性 IP 等可能还在扣费'),
  stages:[{to:2,label:tr('即将停服'),can:tr('还在运行，续费即可')},{to:17,label:tr('在回收站'),can:tr('续费后恢复，数据还在')}]},
 // Databases go faster than servers: 阿里云 RDS locks at once and releases after 7 days, keeping only backups; 腾讯云 MySQL keeps running
 // a week, which reads as renewed when it is not (research B7, B8).
 {id:'aliyun-rds',type:'database',provider:/阿里云|aliyun|alibaba/i,brief:tr('过期即锁定，7 天后释放，只剩备份'),end:tr('备份也已删除，不可恢复'),
  stages:[{to:7,label:tr('已锁定'),can:tr('续费后解锁，数据还在')},{to:15,label:tr('已释放'),can:tr('只能从备份重建到新实例，连接地址会变')}]},
 {id:'tencent-mysql',type:'database',provider:/腾讯云|tencent|qcloud/i,brief:tr('过期后还能用 7 天，之后进回收站，再过 7 天清除'),end:tr('实例和数据已清除，不可恢复'),
  stages:[{to:7,label:tr('过期仍在运行'),can:tr('还在运行不等于已续费，续费即可')},{to:14,label:tr('在回收站'),can:tr('续费后恢复，数据还在')}]},
 {id:'render-free-db',type:'database',provider:/render/i,free:true,brief:tr('免费库到期后 14 天删除'),end:tr('库和数据已删除'),
  stages:[{to:14,label:tr('已到期'),can:tr('升级付费可以保住数据')}]},
 {id:'giffgaff-keep',type:'phone',provider:/giffgaff/i,brief:tr('过期即停用，30 天内还能申请 PAC 转网保号'),end:tr('号码已回收'),
  stages:[{to:30,label:tr('号码已停用'),can:tr('不能恢复，但还能申请 PAC 转网保号')}]}
];
function lifecycleRule(asset){
 if(!asset||!['expire','keep'].includes(asset.dateKind||'expire'))return null;
 const tld=String(asset.name||'').trim().toLowerCase().split('.').pop();
 return LIFECYCLE_RULES.find(rule=>rule.type===asset.type&&rule.provider.test(String(asset.provider||''))&&(!rule.gtld||/^[a-z]{3,}$/.test(tld))&&(!rule.tld||rule.tld.test(tld))&&(!rule.free||billingTypeOf(asset)==='free'))||null;
}
// Where a record stands on its rule: the stage it is in after expiry (with days left), or `gone` past the last stage; null before
// expiry, for a repeating date, or without a rule.
function lifecycleOf(asset,now=new Date()){
 const rule=lifecycleRule(asset),due=dayNumber(asset?.date);
 if(!rule||due===null||!runsOut(asset))return null;
 const since=localDay(now)-due;if(since<1)return null;
 const index=rule.stages.findIndex(stage=>since<=stage.to);
 if(index<0)return {rule,since,gone:true,label:rule.end};
 const stage=rule.stages[index];
 return {rule,since,gone:false,stage,last:index===rule.stages.length-1,daysLeft:stage.to-since,label:tr('{stage} · 还剩 {n} 天',{stage:stage.label,n:stage.to-since+1})};
}
function dueDays(asset,today,span){
 const start=dayNumber(asset?.date),months=billingCycles[asset?.cycle]?.months;
 if(start===null)return [];
 if(!months)return start>=today&&start-today<=span?[start]:[];
 const days=[];
 for(let step=0;step<=1200;step++){const day=step?dayNumber(addMonths(asset.date,months*step)):start;if(day-today>span)break;if(day>=today)days.push(day);}
 return days;
}
// The reminders from `now` on, per day: [[day, items]], nearest first. reminderPlan merges each day into one notification.
function reminderDays(assets,now=new Date()){
 const today=localDay(now),passed=now.getHours()>=REMINDER_HOUR,byDay=new Map();
 for(const asset of assets||[]){
  // 可丢 records stay on the board but send nothing (research Z19).
  if(asset.hiddenAt||asset.stopped||!asset.name||asset.importance==='disposable')continue;
  const kind=dateKinds[asset.dateKind]?asset.dateKind:'expire',price=asset.cost&&asset.cost!=='未知'?asset.cost:'';
  // A trial or a cancel-by date is about what gets charged after it, so that price joins the words even in a merged day (research T4).
  const after=['trial','cancel'].includes(asset.dateKind)&&price&&!isFreeCost(price)?tr('，之后 {price}',{price}):'',cost=after?'':price;
  const name=String(asset.name).slice(0,100),stake=phoneStake(assets,asset)||mailStake(assets,asset),add=(day,lead,when)=>{
   if(day<today||day===today&&passed)return;
   if(!byDay.has(day))byDay.set(day,[]);
   byDay.get(day).push({id:asset.id,name,lead,when:lead>=0?when+after:when,cost,stake});
  };
  const brief=lifecycleRule(asset)?.brief;
  const withBrief=(text,brief)=>brief?tr('{when}，{brief}',{when:text,brief}):text;
  for(const due of dueDays(asset,today,REMINDER_SPAN))for(const lead of reminderLeads(asset))add(due-lead,lead,withBrief(dateWhen(kind,lead,isoDay(due)),lead<=7&&brief));
  const start=dayNumber(asset.date);
  if(start===null)continue;
  const rule=lifecycleRule(asset);
  if(runsOut(asset)){
   add(start,0,withBrief(dateWhen(kind,0),rule?.brief));
   if(rule){
    const first=rule.stages[0];
    add(start+1,-1,kind==='keep'?tr('保号已过期，{stage}：{can}，还剩 {n} 天',{stage:first.label,can:first.can,n:first.to}):tr('已过期，{stage}：{can}，还剩 {n} 天',{stage:first.label,can:first.can,n:first.to}));
    for(const stage of rule.stages)if(stage.to>3)add(start+stage.to-2,-(stage.to-2),tr('{stage}只剩 3 天：{can}',{stage:stage.label,can:stage.can}));
   }else for(const after of AFTER_DUE_DAYS)add(start+after,-after,tr('{when}，看看还能不能补救',{when:dateWhen(kind,-after)}));
  }else if(needsConfirm(asset)){
   const due=dueDays(asset,today-1,REMINDER_SPAN)[0];
   if(due!==undefined)add(due+1,-1,confirmWords[asset.dateKind==='keep'?'keep':'expire'].remind);
  }
 }
 return [...byDay.entries()].sort((a,b)=>a[0]-b[0]);
}
function reminderPlan(assets,now=new Date()){
 return reminderDays(assets,now).slice(0,REMINDER_LIMIT).map(([day,items])=>{
  items.sort((a,b)=>a.lead-b.lead||a.name.localeCompare(b.name));
  const one=items.length===1?items[0]:null,list=items.slice(0,3).map(item=>`${item.name} ${item.when}`).join(tr('；'));
  return {id:`reminder-${isoDay(day)}`,when:`${isoDay(day)}T${String(REMINDER_HOUR).padStart(2,'0')}:00`,
   title:one?one.name:tr('{n} 项需要留意',{n:items.length}),body:one?[one.when,one.stake,one.cost].filter(Boolean).join(' · '):items.length>3?tr('{list} 等 {n} 项',{list,n:items.length}):list,assetId:one?one.id:null};
 });
}
// What came due while nobody was looking (research U3): the reminders that went off between `since` (the last time the board was in
// front of someone) and `now`. Notifications only reach this Mac, and not when it is shut or its person is away; one record per entry,
// latest first.
function missedReminders(assets,since,now=new Date()){
 const today=localDay(now),passed=now.getHours()>=REMINDER_HOUR,seen=new Map();
 for(const [day,items] of reminderDays(assets,since)){
  if(day>today||day===today&&!passed)break;
  for(const item of items)seen.set(item.id,{id:item.id,name:item.name,day:isoDay(day)});
 }
 return [...seen.values()].sort((a,b)=>b.day.localeCompare(a.day)||a.name.localeCompare(b.name));
}

// Platform sync merge. Pure: returns a new board plus name collisions that need a person's decision.
function syncKey(source,externalId,kind){
 if(!externalId&&externalId!==0)return null;
 const id=String(externalId);
 if(source==='cloudflare')return `cloudflare:${kind||'zone'}:${id}`;
 if(source==='github')return `github:${id}`;
 if(source==='ssh')return `ssh:${id}`;
 if(source==='csv')return `csv:${id}`;
 return `${source}:${id}`;
}

// Sources whose records belong to a platform: the form keeps their source, and they cannot be dragged into another category.
const PLATFORM_SOURCES=['cloudflare','github'];
function assetSyncKey(asset){
 if(!asset)return null;
 return syncKey(asset.source,asset.externalId,asset.resourceKind)||([...PLATFORM_SOURCES,'ssh'].includes(asset.source)?asset.id:null);
}

function isBlacklisted(board,key){return !!key&&Array.isArray(board.deletedExternalIds)&&board.deletedExternalIds.includes(key);}

function findByExternal(board,source,externalId,kind){
 const id=String(externalId);
 return board.assets.find(asset=>asset.source===source&&asset.externalId!=null&&String(asset.externalId)===id&&(source!=='cloudflare'||(asset.resourceKind||'zone')===(kind||'zone')));
}

function findNameCollision(board,source,name,type,externalId){
 return board.assets.find(asset=>asset.type===type&&asset.name===name&&asset.source!=='demo'&&!(asset.source===source&&asset.externalId!=null&&String(asset.externalId)===String(externalId)));
}

function ensureBlock(board,type){if(!board.blocks.some(block=>block.id===type))board.blocks.push({id:type,folded:false});}
// Blocks saved before 2026-09-29 used collapsed:true for what is now the compact card style.

// Rows written by a one-off file import carry syncedAt too; only live sources (Cloudflare, GitHub, ~/.ssh/config) are "synced".
function syncedLabel(a){return a?.source==='csv'?'导入于':'同步于';}
// A source that syncs by itself and has stopped answering looks as if it still syncs: an expired or revoked token just leaves the
// records as they were (research U4). For the given automatic sources, the newest sync per source and account, when it is older than
// STALE_SYNC_DAYS; the oldest first. Manual sources (GitHub, ~/.ssh/config) are as fresh as the person last made them, so not here.
const STALE_SYNC_DAYS=3,SYNC_SOURCE_NAMES={cloudflare:'Cloudflare',github:'GitHub',ssh:'~/.ssh/config'};
function staleSyncs(assets,{now=new Date(),auto=[]}={}){
 const groups=new Map(),today=localDay(now);
 for(const a of assets||[]){
  const at=Date.parse(a.syncedAt);if(a.hiddenAt||a.syncMissing||!auto.includes(a.source)||!at)continue;
  const key=`${a.source}\n${a.account||''}`,group=groups.get(key)||{source:a.source,name:SYNC_SOURCE_NAMES[a.source]||a.source,account:a.account||'',last:0,count:0};
  group.last=Math.max(group.last,at);group.count++;groups.set(key,group);
 }
 return [...groups.values()].map(g=>({...g,days:today-localDay(new Date(g.last))})).filter(g=>g.days>STALE_SYNC_DAYS).sort((x,y)=>y.days-x.days);
}
function applySyncedFields(asset,fields){Object.assign(asset,fields);asset.syncMissing=false;}

// The platform's name is kept as syncName: a record whose name differs from it was renamed by the person, and a sync keeps that name.
// A domain arrives as a Zone row (id = zone id) and, with Registrar access, as a Registrar row (id = account:domain); both describe
// one domain, so they meet on the platform name. A domain bought after connecting may show up first as a Registrar row (the zone
// comes later) or under a new zone id (zone removed and added again): its Zone row then takes over that record, not a duplicate.
function mergeCloudflare(board,result,syncedAt=new Date().toISOString()){
 const next=structuredClone(board),resources=result.resources||[],queried=new Set(result.queriedKinds||[]),seen=new Set(),collisions=[];
 let added=0;
 if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
 const kindOf=item=>item.kind==='registrar'?'zone':item.kind||'zone',rowId=item=>`cloudflare-${kindOf(item)}-${item.id}`;
 const isDomain=item=>kindOf(item)==='zone',blocked=item=>isBlacklisted(next,syncKey('cloudflare',item.id,kindOf(item)))||isBlacklisted(next,rowId(item));
 // A domain deleted here stays deleted whichever of its two rows names it.
 const deletedDomains=new Set(resources.filter(item=>isDomain(item)&&blocked(item)).map(item=>item.name));
 const zoneIds=new Set(resources.filter(item=>(item.kind||'zone')==='zone').map(item=>String(item.id)));
 const platformName=asset=>asset.syncName??asset.name;
 const sameDomain=item=>next.assets.find(asset=>asset.source==='cloudflare'&&asset.type==='domain'&&platformName(asset)===item.name
  &&(item.kind==='registrar'||!zoneIds.has(String(asset.externalId))));
 for(const item of resources){
  const kind=item.kind||'zone',resourceKind=kindOf(item),type=resourceKind==='zone'?'domain':kind==='r2'?'storage':'deployment',id=rowId(item);
  seen.add(id);
  if(blocked(item)||isDomain(item)&&deletedDomains.has(item.name))continue;
  const expiry=item.expiresAt?String(item.expiresAt).slice(0,10):'';
  const renewOn=item.autoRenew===true||item.autoRenew==='1'||item.autoRenew===1,renewOff=item.autoRenew===false||item.autoRenew==='0'||item.autoRenew===0;
  const fields={name:item.name,syncName:item.name,account:item.account,syncStatus:item.status,syncedAt,resourceKind,externalId:item.id,source:'cloudflare',provider:'Cloudflare',...(renewOn||renewOff?{autoRenew:renewOn?'on':'off'}:{}),...(resourceKind==='zone'&&item.status==='active'?{dnsHost:'Cloudflare'}:{})};
  // The registrar's own auto-renew switch decides whether the date repeats: off means it will simply expire.
  if(expiry){fields.date=expiry;fields.dateKind='expire';if(renewOn)fields.cycle='yearly';else if(renewOff)fields.cycle='';}
  const byPlatform=next.assets.find(asset=>asset.id===id)||findByExternal(next,'cloudflare',item.id,resourceKind);
  const existing=byPlatform||(isDomain(item)?sameDomain(item):null);
  if(existing){
   // A Zone row taking over a record found by name moves it onto the zone id; a Registrar row never changes the id.
   const externalId=!byPlatform&&kind==='zone'?item.id:existing.externalId||fields.externalId,own=platformName(existing)!==existing.name?existing.name:null;
   applySyncedFields(existing,{...fields,externalId,resourceKind:existing.resourceKind||fields.resourceKind});
   if(own!=null)existing.name=own;
   if(expiry){existing.date=expiry;existing.dateKind='expire';if(renewOn)existing.cycle='yearly';else if(renewOff)existing.cycle='';existing.event=`${expiry} ${dateKinds.expire.future}`;}
   else existing.event=item.status||existing.event||'状态未知';
   if(item.account)existing.account=item.account;
   seen.add(existing.id);
  }else{
   const collision=findNameCollision(next,'cloudflare',item.name,type,item.id);
   if(collision){
    // The Zone and Registrar rows of one domain ask once; the expiry joins the question.
    const asked=collisions.find(entry=>entry.assetId===collision.id&&entry.name===item.name);
    if(asked){if(expiry)Object.assign(asked.fields,{date:expiry,dateKind:'expire',...('cycle' in fields?{cycle:fields.cycle}:{})});continue;}
    collisions.push({assetId:collision.id,name:item.name,source:'Cloudflare',fields:{...fields,type,url:item.url||collision.url,date:expiry||collision.date,dateKind:expiry?'expire':collision.dateKind}});continue;
   }
   const purpose=resourceKind==='zone'?'DNS Zone':kind==='r2'?'R2 Bucket':kind==='pages'?'Pages 项目':'Worker 脚本';
   next.assets.push({id,createdAt:syncedAt,type,name:item.name,syncName:item.name,provider:'Cloudflare',account:item.account,purpose,event:expiry?`${expiry} ${dateKinds.expire.future}`:(item.status||'状态未知'),date:expiry,dateKind:expiry?'expire':'expire',cycle:renewOn?'yearly':'',cost:'未知',notes:expiry?'Cloudflare Registrar 同步（含到期日）。':'Cloudflare 资源列表同步；到期日和账单未知。',url:item.url,art:'generic',source:'cloudflare',resourceKind,externalId:item.id,syncStatus:item.status,syncedAt,...('autoRenew' in fields?{autoRenew:fields.autoRenew}:{}),...('dnsHost' in fields?{dnsHost:fields.dnsHost}:{})});
   added++;
  }
  ensureBlock(next,type);
 }
 for(const asset of next.assets)if(asset.source==='cloudflare'&&queried.has(asset.resourceKind||'zone')&&!seen.has(asset.id))asset.syncMissing=true;
 return {board:next,added,read:resources.length,collisions};
}

// The registrar's own auto-renew switch, as last synced (research D2).
const AUTO_RENEW_WORDS={on:tr('开'),off:tr('关')};
function mergeGitHub(board,result,syncedAt=new Date().toISOString()){
 const next=structuredClone(board),repositories=result.repositories||[],seen=new Set(),collisions=[];
 let added=0;
 if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
 for(const repo of repositories){
  const id='github-repo-'+repo.id,status=repo.archived?'已归档':repo.private?'私有仓库':'公开仓库';
  seen.add(id);
  if(isBlacklisted(next,syncKey('github',repo.id))||isBlacklisted(next,id))continue;
  const fields={name:repo.name,account:repo.owner,updatedAt:repo.updatedAt||'',...(repo.pushedAt?{pushedAt:repo.pushedAt}:{}),syncStatus:status,syncedAt,externalId:repo.id,source:'github',provider:'GitHub',event:status};
  const existing=next.assets.find(asset=>asset.id===id)||findByExternal(next,'github',repo.id);
  if(existing){
   applySyncedFields(existing,fields);
   if(repo.url)existing.url=repo.url;
   seen.add(existing.id);
  }else{
   const collision=findNameCollision(next,'github',repo.name,'repository',repo.id);
   if(collision){collisions.push({assetId:collision.id,name:repo.name,source:'GitHub',fields:{...fields,type:'repository',url:repo.url||collision.url,purpose:repo.description?.slice(0,100)||collision.purpose||'代码仓库'}});continue;}
   next.assets.push({id,createdAt:syncedAt,type:'repository',name:repo.name,provider:'GitHub',account:repo.owner,purpose:repo.description?.slice(0,100)||'代码仓库',event:status,date:'',cost:'未知',notes:'GitHub 仓库元数据同步。',url:repo.url,art:'generic',source:'github',externalId:repo.id,updatedAt:repo.updatedAt||'',syncStatus:status,syncedAt});
   added++;
  }
 }
 for(const asset of next.assets)if(asset.source==='github'&&!seen.has(asset.id))asset.syncMissing=true;
 ensureBlock(next,'repository');
 return {board:next,added,read:repositories.length,collisions};
}

function applyCollision(board,collision){
 const asset=board.assets.find(item=>item.id===collision.assetId);
 if(!asset)return false;
 applySyncedFields(asset,collision.fields);
 ensureBlock(board,asset.type);
 return true;
}

// Imported evidence (mail, OCR, pasted text) → reviewable candidates. Rules only; nothing leaves the device.
const monthNumbers={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sept:9,sep:9,oct:10,nov:11,dec:12};
const monthWords='january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const currencySymbols={'US$':'USD','HK$':'HKD','S$':'SGD','A$':'AUD','C$':'CAD','JP¥':'JPY','$':'USD','¥':'CNY','￥':'CNY','€':'EUR','£':'GBP'};
const currencyDisplay={USD:'$',CNY:'¥',EUR:'€',GBP:'£',HKD:'HK$',SGD:'S$',AUD:'A$',CAD:'C$',JPY:'JP¥'};
const amountNumber='(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
const amountPatterns=[
 [new RegExp('(US\\$|HK\\$|S\\$|A\\$|C\\$|JP¥|\\$|¥|￥|€|£)\\s?'+amountNumber,'g'),match=>[currencySymbols[match[1]],match[2]]],
 [new RegExp('\\b(USD|CNY|RMB|EUR|GBP|HKD|SGD|AUD|CAD|JPY)\\s?'+amountNumber,'gi'),match=>[match[1].toUpperCase(),match[2]]],
 [new RegExp(amountNumber+'\\s?(USD|CNY|RMB|EUR|GBP|HKD|SGD|AUD|CAD|JPY)\\b','gi'),match=>[match[2].toUpperCase(),match[1]]],
 [new RegExp(amountNumber+'\\s?元','g'),match=>['CNY',match[1]]]
];
const datePatterns=[
 [/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g,match=>[+match[1],+match[2],+match[3]]],
 [/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g,match=>[+match[1],+match[2],+match[3]]],
 [new RegExp(`\\b(${monthWords})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,'gi'),match=>[+match[3],monthNumbers[match[1].toLowerCase()],+match[2]]],
 [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthWords})\\.?,?\\s+(20\\d{2})\\b`,'gi'),match=>[+match[3],monthNumbers[match[2].toLowerCase()],+match[1]]],
 [/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g,match=>+match[1]>12?[+match[3],+match[2],+match[1]]:[+match[3],+match[1],+match[2]]]
];
const dateKeywords={
 trial:/free trial|trial (?:ends|period|expires)|试用/gi,
 cancel:/cancel (?:by|before)|取消.{0,4}(?:截止|之前|前)/gi,
 renew:/auto-?renew\w*|renews?|renewal|next (?:billing|payment|charge|invoice)|will be (?:charged|billed)|billing date|续费|续订|自动扣款|扣款|下次|下一次/gi,
 expire:/expir\w*|valid (?:until|through)|到期|过期|有效期/gi,
 paid:/\bpaid\b|payment date|invoice date|date paid|order date|支付时间|付款时间|订单日期|交易时间/gi
};
const paymentProcessors=['stripe.com','paddle.com','paypal.com','fastspring.com','lemonsqueezy.com','gumroad.com','chargebee.com','recurly.com','alipay.com','apple.com','google.com'];
const domainSuffixes='com|net|org|io|dev|app|ai|co|me|xyz|cn|site|tech|studio|so|sh|cc|info|biz|top|link|page|cloud|design|blog|online|store|shop|space|fun|life|us|uk|de|jp|tw|hk|gg|tv|fm';
const ignoredDomains=new Set(['gmail.com','google.com','apple.com','icloud.com','outlook.com','hotmail.com','github.com','stripe.com','paypal.com','example.com']);

function scanAll(pattern,text){pattern.lastIndex=0;const matches=[];let match;while((match=pattern.exec(text))){matches.push(match);if(!match[0])pattern.lastIndex++;}return matches;}

function lineAt(text,index){
 const start=text.lastIndexOf('\n',index-1)+1,end=text.indexOf('\n',index);
 return text.slice(start,end<0?text.length:end);
}

function cycleNear(text){
 if(/^\s*(?:\/|per|a|每|按)\s*(?:mo\b|month|月)/i.test(text))return 'monthly';
 if(/^\s*(?:\/|per|a|每|按)\s*(?:yr\b|year|年)/i.test(text))return 'yearly';
 return null;
}

function textCycle(text){
 const monthly=/\bmonthly\b|per month|\/\s?mo\b|每月|月付|包月|按月|月度/i.test(text),yearly=/\bannual(?:ly)?\b|\byearly\b|per year|\/\s?(?:yr|year)\b|每年|年付|包年|按年|年度/i.test(text);
 return monthly===yearly?null:monthly?'monthly':'yearly';
}

function findAmounts(text){
 const found=[];
 for(const [pattern,read] of amountPatterns)for(const match of scanAll(pattern,text)){
  const [code,raw]=read(match),value=Number(raw.replace(/,/g,''));
  if(!(value>0))continue;
  if(found.some(item=>match.index<item.end&&item.index<match.index+match[0].length))continue;
  const line=lineAt(text,match.index);
  let score=0;
  if(/total|amount due|amount charged|grand total|合计|总计|实付|应付|支付金额|付款金额/i.test(line))score+=3;
  if(/charged|renew|billed|price|amount|金额|费用|续费|扣款/i.test(line))score+=2;
  if(/tax|vat|gst|discount|coupon|credit|refund|税|优惠|折扣|退款|余额/i.test(line))score-=3;
  found.push({currency:code==='RMB'?'CNY':code,value:raw,index:match.index,end:match.index+match[0].length,score,cycle:cycleNear(text.slice(match.index+match[0].length,match.index+match[0].length+16))});
 }
 return found.sort((left,right)=>right.score-left.score||left.index-right.index);
}

function nearestKind(text,start,end){
 const before=text.slice(Math.max(0,start-100),start),after=text.slice(end,end+14);
 let best=null,distance=Infinity;
 for(const [kind,pattern] of Object.entries(dateKeywords)){
  for(const match of scanAll(pattern,before)){const gap=before.length-(match.index+match[0].length);if(gap<distance){best=kind;distance=gap;}}
  for(const match of scanAll(pattern,after)){if(match.index<distance){best=kind;distance=match.index;}}
 }
 return best||'unknown';
}

function findDates(text){
 const found=[];
 for(const [pattern,read] of datePatterns)for(const match of scanAll(pattern,text)){
  const [year,month,day]=read(match),value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(dayNumber(value)===null||found.some(item=>match.index<item.end&&item.index<match.index+match[0].length))continue;
  found.push({value,index:match.index,end:match.index+match[0].length,kind:nearestKind(text,match.index,match.index+match[0].length)});
 }
 return found.sort((left,right)=>left.index-right.index);
}

function findDomains(text,exclude){
 const counts=new Map(),pattern=new RegExp(`((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${domainSuffixes}))(?![\\w-]|\\.[a-z])`,'gi');
 for(const match of scanAll(pattern,text)){
  const before=text[match.index-1]||' ';
  if(/[@/\w.-]/.test(before))continue;
  const domain=match[1].toLowerCase().replace(/^www\./,'');
  if(ignoredDomains.has(domain)||exclude.has(registrableDomain(domain)))continue;
  counts.set(domain,(counts.get(domain)||0)+1);
 }
 return [...counts].sort((left,right)=>right[1]-left[1]).map(([domain])=>domain);
}

function parseSender(value){
 const text=String(value||'').trim(),match=/^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(text);
 const address=(match?match[2]:text.includes('@')?text:'').trim().toLowerCase();
 return {name:(match?match[1]:text.includes('@')?'':text).trim(),address,host:address.split('@')[1]||''};
}

function registrableDomain(host){
 const labels=String(host||'').toLowerCase().split('.').filter(Boolean);
 if(labels.length<=2)return labels.join('.');
 return (labels.at(-1).length===2&&['co','com','net','org','gov','edu','ac'].includes(labels.at(-2))?labels.slice(-3):labels.slice(-2)).join('.');
}

function cleanMerchant(name){
 let value=String(name||'').replace(/\s+/g,' ').trim(),previous;
 do{previous=value;value=value.replace(/[\s.。!！]+$/,'').replace(/[\s,|·:-]*\b(?:billing|receipts?|invoices?|team|support|notifications?|no-?reply|payments?|accounts?|sales|customer (?:care|service)|via .+)$/i,'').replace(/[\s,|·:-]*(?:账单|通知|客服|团队)$/,'').trim();}while(value!==previous);
 return /^(?:no-?reply|billing|support|notifications?|info|hello)$/i.test(value)?'':value;
}

function capitalize(value){return value?value[0].toUpperCase()+value.slice(1):'';}

function dayFromDateString(value){
 if(!value)return null;
 const exact=dayNumber(String(value).slice(0,10));
 if(exact!==null&&/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return exact;
 const time=Date.parse(value);
 return Number.isFinite(time)?localDay(new Date(time)):null;
}

function guessAssetType(text,domains){
 if(domains.length&&/domain|域名|registrar|whois|注册商/i.test(text))return 'domain';
 if(/\b(?:vps|server|droplet|instance|linode|vultr|hetzner|ec2|lightsail)\b|服务器|云主机|轻量应用/i.test(text))return 'server';
 if(/\b(?:database|postgres(?:ql)?|mysql|redis|mongodb|supabase|planetscale)\b|数据库/i.test(text))return 'database';
 if(/\b(?:licen[cs]e|lifetime)\b|授权|许可证|激活码/i.test(text))return 'license';
 if(/\b(?:openai|chatgpt|anthropic|claude|midjourney|perplexity|cursor|copilot|gemini|runway|elevenlabs|suno|deepseek)\b/i.test(text))return 'ai';
 return 'subscription';
}

function evidencePayload(row){
 let payload=row.payload||{};
 if(typeof payload==='string'){try{payload=JSON.parse(payload)||{};}catch{payload={};}}
 return payload&&typeof payload==='object'?payload:{};
}

function evidenceFacts(row,types=[]){
 const payload=evidencePayload(row);
 const sender=parseSender(row.kind==='gmail'?row.source:''),senderDomain=registrableDomain(sender.host),processor=paymentProcessors.includes(senderDomain);
 const title=String(row.title||''),body=String(row.body||''),text=`${title}\n${body}`;
 let merchant=cleanMerchant(sender.name);
 if(processor||!merchant){const subject=/(?:receipt|invoice|payment|subscription|order)\s+(?:from|for|to|with)\s+([^#[\]()（）,:：|\n-]{2,40})/i.exec(title);if(subject)merchant=cleanMerchant(subject[1]);}
 if(!merchant&&senderDomain&&!processor)merchant=capitalize(senderDomain.split('.')[0]);
 const amounts=findAmounts(text),amount=amounts[0]||null,dates=findDates(text),domains=findDomains(text,new Set(senderDomain?[senderDomain]:[]));
 const head=`${title}\n${body.slice(0,2000)}`;
 return {
  id:row.id,kind:row.kind||'',title,merchant,senderDomain,
  merchantKey:senderDomain?(processor?`${senderDomain}:${merchant.toLowerCase()}`:senderDomain):null,
  day:dayFromDateString(payload.date)??dayFromDateString(row.importedAt),
  amount,cycle:amount?.cycle||textCycle(head),dates,domains,type:guessAssetType(head,domains),
  ai:payload.ai&&typeof payload.ai.text==='string'?{provider:String(payload.ai.provider||''),model:String(payload.ai.model||''),at:String(payload.ai.at||''),items:parseAiItems(payload.ai.text,types)}:null
 };
}

function inferCycle(days){
 const unique=[...new Set(days.filter(day=>day!=null))].sort((left,right)=>left-right),charges=[];
 for(const day of unique)if(!charges.length||day-charges.at(-1)>5)charges.push(day);
 if(charges.length<2)return null;
 const gaps=charges.slice(1).map((day,index)=>day-charges[index]).sort((left,right)=>left-right),median=gaps[Math.floor(gaps.length/2)];
 return median>=26&&median<=35?'monthly':median>=350&&median<=380?'yearly':null;
}

function formatCost(amount,cycle){
 if(!amount)return '';
 return `${currencyDisplay[amount.currency]??(amount.currency?amount.currency+' ':'')}${amount.value}${billingCycles[cycle]?` / ${billingCycles[cycle].suffix}`:''}`;
}

// The asset's own name counts most; a merchant alone (e.g. "Apple") must not pull in a sibling product.
function matchAsset(assets,facts){
 const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,'');
 const merchant=normalize(facts.merchant),name=normalize(facts.name),byMerchant=!name||name===merchant;
 const similar=(left,right)=>left.length>=3&&right.length>=3&&(left.includes(right)||right.includes(left));
 let best=null,bestScore=0;
 for(const asset of assets){
  const assetName=normalize(asset.name),provider=normalize(asset.provider);
  let score=0;
  if(facts.domains.includes(String(asset.name).toLowerCase()))score+=5;
  if(similar(assetName,name))score+=4;
  else if(byMerchant&&similar(assetName,merchant))score+=3;
  if(similar(provider,merchant))score+=2;
  try{if(facts.senderDomain&&registrableDomain(new URL(asset.url).hostname)===facts.senderDomain)score+=2;}catch{}
  if(score>bestScore){best=asset;bestScore=score;}
 }
 return bestScore>=3?best.id:null;
}

function buildCandidates(rows,{assets=[],decisions={},now=new Date(),types=[]}={}){
 const today=localDay(now),groups=new Map();
 for(const row of rows){
  const facts=evidenceFacts(row,types),key=facts.merchantKey||'row:'+row.id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(facts);
 }
 const candidates=[...groups].map(([key,items])=>{
  items.sort((left,right)=>(right.day??0)-(left.day??0));
  const latest=items[0],amount=items.find(item=>item.amount)?.amount||null;
  const inferredCycle=inferCycle(items.map(item=>item.day)),cycle=items.find(item=>item.cycle)?.cycle||inferredCycle;
  const stated=items.flatMap(item=>item.dates).filter(date=>dateKinds[date.kind]);
  const future=stated.filter(date=>dayNumber(date.value)>=today).sort((left,right)=>dayNumber(left.value)-dayNumber(right.value))[0];
  const past=stated.sort((left,right)=>dayNumber(right.value)-dayNumber(left.value))[0];
  const paidDay=items.flatMap(item=>item.dates).filter(date=>date.kind==='paid').map(date=>dayNumber(date.value)).sort((left,right)=>right-left)[0];
  const chargeDay=latest.kind==='gmail'?latest.day:paidDay??null;
  let date=null;
  if(future)date={value:future.value,kind:future.kind,source:'stated',basis:tr('通知中写明')};
  else if(past&&cycle)date={value:nextOccurrence(past.value,cycle,today),kind:past.kind,source:'inferred',basis:tr('按{cycle}周期从 {date} 推算',{cycle:billingCycles[cycle].label,date:past.value})};
  else if(cycle&&chargeDay!=null)date={value:nextOccurrence(isoDay(chargeDay),cycle,today),kind:'renew',source:'inferred',basis:inferredCycle&&!items.some(item=>item.cycle)?tr('根据 {n} 封收据的间隔推算',{n:items.length}):tr('按{cycle}周期从最近一次付款（{date}）推算',{cycle:billingCycles[cycle].label,date:isoDay(chargeDay)})};
  const domains=[...new Set(items.flatMap(item=>item.domains))],type=items.find(item=>item.type!=='subscription')?.type||'subscription';
  const merchant=items.find(item=>item.merchant)?.merchant||'';
  const facts={merchant,name:type==='domain'&&domains[0]?domains[0]:merchant,domains,senderDomain:latest.senderDomain};
  const pendingIds=items.filter(item=>!decisions[item.id]).map(item=>item.id);
  const base={
   key,ids:items.map(item=>item.id),pendingIds,count:items.length,latest:{id:latest.id,title:latest.title,day:latest.day,kind:latest.kind},
   merchant,name:type==='domain'&&domains[0]?domains[0]:merchant,type,amount,cycle,cost:formatCost(amount,cycle),date,domains,senderDomain:latest.senderDomain,account:'',quote:'',
   match:matchAsset(assets,facts),weak:!amount&&!date&&!(type==='domain'&&domains.length),pending:pendingIds.length>0,ai:null
  };
  const analyzed=items.find(item=>item.ai);
  if(!analyzed)return base;
  const ai={rowId:analyzed.id,provider:analyzed.ai.provider,model:analyzed.ai.model,at:analyzed.ai.at,items:analyzed.ai.items||[],unreadable:!analyzed.ai.items};
  const candidate=ai.unreadable?base:ai.items.length?applyAiItem(base,ai.items[0],{assets,now,fallback:ai.items.length===1}):{...base,weak:true};
  return {...candidate,ai,base};
 });
 const days=candidate=>candidate.date?dayNumber(candidate.date.value)-today:Infinity;
 return candidates.sort((left,right)=>right.pending-left.pending||left.weak-right.weak||days(left)-days(right)||(right.latest.day??0)-(left.latest.day??0));
}

// Replies from a person's own model are untrusted text: parse, then keep only known fields with bounded length.
function parseAiItems(text,types=[]){
 const raw=String(text||'').replace(/```(?:json)?/gi,''),start=raw.indexOf('{'),end=raw.lastIndexOf('}');
 const read=part=>{try{return JSON.parse(part);}catch{return null;}},open=raw.indexOf('['),close=raw.lastIndexOf(']');
 let value=start>=0&&end>start?read(raw.slice(start,end+1)):null;
 if(!Array.isArray(value?.items)){const list=open>=0&&close>open?read(raw.slice(open,close+1)):null;value=Array.isArray(list)?{items:list}:null;}
 if(!value)return null;
 const clean=(input,max)=>{const field=typeof input==='string'||typeof input==='number'?String(input).replace(/\s+/g,' ').trim():'';return /^(?:null|none|n\/a|unknown|未知|无)$/i.test(field)?'':field.slice(0,max);};
 return value.items.slice(0,10).filter(item=>item&&typeof item==='object').map(item=>{
  const amount=clean(item.amount,24).replace(/,/g,'').replace(/^[^\d]+/,''),code=clean(item.currency,8).toUpperCase(),date=clean(item.date,10),paidDate=clean(item.paidDate,10);
  return {
   name:clean(item.name,100),merchant:clean(item.merchant,80),type:types.includes(item.type)?item.type:null,
   amount:/^\d+(?:\.\d{1,2})?$/.test(amount)&&Number(amount)>0?amount:'',currency:code==='RMB'?'CNY':/^[A-Z]{3}$/.test(code)?code:'',
   cycle:billingCycles[item.cycle]?item.cycle:null,date:dayNumber(date)!==null?date:null,dateKind:dateKinds[item.dateKind]?item.dateKind:null,
   paidDate:dayNumber(paidDate)!==null?paidDate:null,account:clean(item.account,100),quote:clean(item.quote,120)
  };
 }).filter(item=>item.name||item.merchant);
}

// Overlay one AI item on the rule-based candidate. With several items, fields are not borrowed from the rules.
function applyAiItem(base,item,{assets=[],now=new Date(),fallback=true}={}){
 const today=localDay(now),cycle=item.cycle||(fallback?base.cycle:null);
 const amount=item.amount?{currency:item.currency||(fallback?base.amount?.currency||'':''),value:item.amount}:fallback?base.amount:null;
 let date=fallback?base.date:null;
 if(item.date){const value=cycle&&dayNumber(item.date)<today?nextOccurrence(item.date,cycle,today):item.date;date={value,kind:item.dateKind||'expire',source:'ai',basis:value===item.date?tr('AI 从原文识别'):tr('AI 识别为 {date}，按{cycle}顺延',{date:item.date,cycle:billingCycles[cycle].label})};}
 else if(item.paidDate&&cycle)date={value:nextOccurrence(item.paidDate,cycle,today),kind:'renew',source:'ai',basis:tr('AI 识别付款日 {date}，按{cycle}推算',{date:item.paidDate,cycle:billingCycles[cycle].label})};
 const merchant=item.merchant||base.merchant,name=item.name||(fallback?base.name:merchant),type=item.type||base.type;
 const domains=type==='domain'&&name?[name.toLowerCase(),...base.domains]:base.domains;
 return {...base,merchant,name,type,amount,cycle,cost:formatCost(amount,cycle),date,account:item.account,quote:item.quote,
  match:matchAsset(assets,{merchant,name,domains,senderDomain:base.senderDomain})||(fallback&&!item.name?base.match:null),weak:false};
}

// Cross-border accounts: region code, Chinese name and calling code.
const regionList=[['CN','中国大陆','86'],['HK','中国香港','852'],['MO','中国澳门','853'],['TW','中国台湾','886'],['US','美国','1'],['GB','英国','44'],['JP','日本','81'],['KR','韩国','82'],['SG','新加坡','65'],['MY','马来西亚','60'],['TH','泰国','66'],['VN','越南','84'],['PH','菲律宾','63'],['ID','印度尼西亚','62'],['IN','印度','91'],['AU','澳大利亚','61'],['NZ','新西兰','64'],['CA','加拿大','1'],['MX','墨西哥','52'],['BR','巴西','55'],['AR','阿根廷','54'],['DE','德国','49'],['FR','法国','33'],['NL','荷兰','31'],['IE','爱尔兰','353'],['ES','西班牙','34'],['IT','意大利','39'],['CH','瑞士','41'],['SE','瑞典','46'],['PL','波兰','48'],['UA','乌克兰','380'],['RU','俄罗斯','7'],['KZ','哈萨克斯坦','7'],['TR','土耳其','90'],['AE','阿联酋','971'],['SA','沙特阿拉伯','966'],['IL','以色列','972'],['PK','巴基斯坦','92'],['NG','尼日利亚','234'],['ZA','南非','27'],['EG','埃及','20']];
// regionList keeps the Chinese names the form matches; regionName is the name people read.
function regionName(code){const name=regionList.find(([id])=>id===code)?.[1];return name?tr(name):'';}
function regionFlag(code){return /^[A-Z]{2}$/.test(code||'')?String.fromCodePoint(...[...code].map(letter=>0x1F1A5+letter.charCodeAt(0))):'';}

// Phone numbers are stored in full and shown masked. A leading + or 00 marks an international number; the longest known calling code wins.
function phoneParts(value){
 const text=String(value||'').trim(),digits=text.replace(/\D/g,'');
 if(!digits)return null;
 const intl=/^(?:\+|00)/.test(text),body=text.startsWith('00')?digits.slice(2):digits;
 const code=intl?[...new Set(regionList.map(region=>region[2]))].sort((left,right)=>right.length-left.length).find(prefix=>body.startsWith(prefix))||'':'';
 return {code,local:code?body.slice(code.length):body,intl};
}
function regionFromPhone(value){const code=phoneParts(value)?.code;return code?regionList.find(region=>region[2]===code)[0]:'';}
function maskPhone(value){const parts=phoneParts(value);if(!parts)return '';if(parts.local.length<4)return String(value).trim();return `${parts.code?`+${parts.code} `:parts.intl?'+':''}••• ${parts.local.slice(-4)}`;}
// Privacy mode: a name keeps its first character (and a domain its suffix) so rows stay tellable apart without showing what they are.
function maskName(value){
 const text=String(value||'').trim();if(!text)return '';
 const chars=[...text],dot=text.lastIndexOf('.'),suffix=dot>0&&/^\.[a-z]{2,12}$/i.test(text.slice(dot))?text.slice(dot):'';
 const body=[...(suffix?text.slice(0,dot):text)];
 return body.length<=1?`•${suffix}`:`${body[0]}${'•'.repeat(Math.min(6,body.length-1))}${suffix}`;
}
function maskEmail(value){const text=String(value||'').trim(),at=text.lastIndexOf('@');if(at<1)return text;const user=text.slice(0,at);return `${user.slice(0,user.length>2?2:1)}•••${text.slice(at)}`;}

// Card expiry is written MM/YY or MM/YYYY and stored as the last day of that month.
function cardExpiry(value){const match=/^\s*(0?[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})\s*$/.exec(String(value||''));if(!match)return null;const year=match[2].length===2?2000+Number(match[2]):Number(match[2]);return isoDay(Date.UTC(year,Number(match[1]),0)/DAY_MS);}
function expiryText(date){const match=/^(\d{4})-(\d{2})-\d{2}$/.exec(date||'');return match?`${match[2]}/${match[1].slice(2)}`:'';}

// Full card numbers are never stored: a 13–19 digit run starting 2–6 that passes the Luhn check is treated as one.
function looksLikeCardNumber(text){
 for(const match of String(text||'').matchAll(/(?:\d[ -]?){12,18}\d/g)){
  const digits=match[0].replace(/\D/g,'');
  if(digits.length<13||digits.length>19||!/^[2-6]/.test(digits))continue;
  let sum=0;
  for(let i=0;i<digits.length;i++){let digit=Number(digits[digits.length-1-i]);if(i%2){digit*=2;if(digit>9)digit-=9;}sum+=digit;}
  if(sum%10===0)return true;
 }
 return false;
}

// Links between records (an account, the card that pays for it, the number that verifies it) are symmetric.
function linkAssets(assets,leftId,rightId){
 const left=assets.find(asset=>asset.id===leftId),right=assets.find(asset=>asset.id===rightId);
 if(!left||!right||left===right)return false;
 let changed=false;
 for(const [from,to] of [[left,right],[right,left]]){const links=Array.isArray(from.links)?from.links:[];if(!links.includes(to.id)){from.links=[...links,to.id];changed=true;}}
 return changed;
}
function dropLinkMeta(asset,id){if(asset?.linkMeta&&id in asset.linkMeta){delete asset.linkMeta[id];if(!Object.keys(asset.linkMeta).length)delete asset.linkMeta;}}
function unlinkAssets(assets,leftId,rightId){
 let changed=false;
 for(const [from,to] of [[leftId,rightId],[rightId,leftId]]){const asset=assets.find(item=>item.id===from);if(Array.isArray(asset?.links)&&asset.links.includes(to)){asset.links=asset.links.filter(id=>id!==to);changed=true;}dropLinkMeta(asset,to);}
 return changed;
}
function linkedAssets(assets,asset){const ids=new Set(Array.isArray(asset?.links)?asset.links:[]);return assets.filter(item=>item.id!==asset?.id&&(ids.has(item.id)||Array.isArray(item.links)&&item.links.includes(asset?.id)));}
function removeLinksTo(assets,id){for(const asset of assets){if(Array.isArray(asset.links)&&asset.links.includes(id))asset.links=asset.links.filter(item=>item!==id);dropLinkMeta(asset,id);}}

// Server-centred relations (v13 B). The server is the hub: things are mounted on it (domain, repository, database, licence) and it belongs to
// an account (a subscription). Direction is never stored; it follows from the pair of types, so `links` stays one symmetric array.
const MOUNT_TYPES=['domain','repository','database','license'];
// 'mount' = child on a server, 'own' = server under an account, null = not a server relation.
function relationKind(left,right){
 if(!left||!right)return null;
 const pair=left.type==='server'?right:right.type==='server'?left:null;
 if(!pair)return null;
 return MOUNT_TYPES.includes(pair.type)?'mount':pair.type==='subscription'?'own':null;
}
// Pairs that may be linked. Anything touching a server must be a legal server relation or the card that pays for it; same-type pairs of
// server, domain and repository make no sense.
function linkAllowed(left,right){
 if(!left||!right||left.id===right.id)return false;
 if(left.type==='server'||right.type==='server')return !!relationKind(left,right)||left.type==='bankcard'||right.type==='bankcard';
 return !(left.type===right.type&&['domain','repository'].includes(left.type));
}
// The server chain around an asset: servers it sits on, things mounted on it, accounts above or below it.
function serverChain(assets,asset){
 const linked=linkedAssets(assets,asset),servers=[],mounts=[],accounts=[],owned=[];
 for(const item of linked){
  const kind=relationKind(asset,item);if(!kind)continue;
  if(asset.type==='server')(kind==='mount'?mounts:accounts).push(item);
  else if(item.type==='server')(asset.type==='subscription'?owned:servers).push(item);
 }
 return {servers,mounts,accounts,owned};
}
function serverChainCount(assets,asset){const chain=serverChain(assets,asset);return chain.servers.length+chain.mounts.length+chain.accounts.length+chain.owned.length;}
// Link with the rules applied: illegal pairs are refused, a server keeps at most one account (the newer one replaces the older).
function linkRelation(assets,leftId,rightId){
 const left=assets.find(a=>a.id===leftId),right=assets.find(a=>a.id===rightId);
 if(!linkAllowed(left,right))return {ok:false,replaced:[]};
 const replaced=[];
 if(relationKind(left,right)==='own'){
  const server=left.type==='server'?left:right,account=server===left?right:left;
  for(const other of linkedAssets(assets,server))if(other.type==='subscription'&&other.id!==account.id&&relationKind(server,other)==='own'){unlinkAssets(assets,server.id,other.id);replaced.push(other.id);}
 }
 const changed=linkAssets(assets,leftId,rightId);
 return {ok:changed,replaced};
}
// Per-link marks live on the child, keyed by server id: role 'b' = standby, proxied = origin reached through a proxy.
function linkMetaOf(child,serverId){const meta=child?.linkMeta?.[serverId];return {standby:meta?.role==='b',proxied:!!meta?.proxied};}
function setLinkMeta(assets,childId,serverId,{standby,proxied}={}){
 const child=assets.find(a=>a.id===childId),server=assets.find(a=>a.id===serverId);
 if(!child||!server||server.type!=='server'||!MOUNT_TYPES.includes(child.type)||!Array.isArray(child.links)||!child.links.includes(serverId))return false;
 const meta={...(child.linkMeta?.[serverId]||{})};
 if(standby!==undefined){if(standby)meta.role='b';else delete meta.role;}
 if(proxied!==undefined&&child.type==='domain'){if(proxied)meta.proxied=true;else delete meta.proxied;}
 child.linkMeta={...(child.linkMeta||{})};
 if(Object.keys(meta).length)child.linkMeta[serverId]=meta;else delete child.linkMeta[serverId];
 if(!Object.keys(child.linkMeta).length)delete child.linkMeta;
 return true;
}
// Colour a mounted card's marker takes from its servers: the worst visible primary server, standbys only when nothing else is left. Colour only, never order.
function serverTone(assets,child,now=new Date()){
 const servers=serverChain(assets,child).servers.filter(server=>!server.hiddenAt);
 if(!servers.length)return '';
 const primary=servers.filter(server=>!linkMetaOf(child,server.id).standby),pool=primary.length?primary:servers;
 const levels=pool.map(server=>assetDateStatus(server,now).level);
 return levels.includes('overdue')?'red':levels.includes('soon')?'amber':'';
}
// Cards that stay at full strength while one card is hovered or focused: its chain, one step further for a child (its servers' accounts) and an account (its servers' mounts).
function peekSet(assets,asset){
 const ids=new Set(),chain=serverChain(assets,asset);
 if(!(chain.servers.length+chain.mounts.length+chain.accounts.length+chain.owned.length))return ids;
 for(const item of [...chain.servers,...chain.mounts,...chain.accounts,...chain.owned])ids.add(item.id);
 for(const server of [...chain.servers,...chain.owned]){const inner=serverChain(assets,server);for(const item of asset.type==='subscription'?inner.mounts:inner.accounts)ids.add(item.id);}
 ids.delete(asset.id);return ids;
}

// What a link means (v19). Like the server relations it follows from the pair of types, so nothing new is stored and older links
// gain their meaning too. Each kind has a word for each side: the card 支付 the subscription, the subscription has a 付款卡.
// [kind, hub types, other types, word on the hub, word on the other side]; pairs not listed are plain 相关.
const LINK_KINDS=[
 ['pay',['bankcard'],['subscription','ai','domain','server','database','storage','deployment','license','appleid','google'],tr('支付'),tr('付款卡')],
 ['login',['appleid','google'],['subscription','ai','domain','database','storage','deployment','license','repository'],tr('用于登录'),tr('登录账号')],
 ['verify',['phone'],['appleid','google','bankcard','subscription','ai'],tr('接收验证码'),tr('验证手机号')],
 ['deploy',['repository'],['deployment'],tr('部署到'),tr('代码来自')],
 ['point',['domain'],['deployment','storage'],tr('指向'),tr('绑定域名')],
 ['use',['deployment'],['database','storage'],tr('使用'),tr('被使用')]
];
const LINK_KIND_ORDER=['own','mount','pay','login','verify','deploy','point','use','related'];
// The link from `asset` to `other` as seen from `asset`: {kind, label}.
function linkKind(asset,other){
 const server=relationKind(asset,other);
 if(cardPaysPhone(asset,other))return {kind:'pay',label:asset.type==='bankcard'?tr('支付'):tr('付款卡')};
 if(server==='mount')return {kind:'mount',label:asset.type==='server'?tr('托管'):tr('所在服务器')};
 if(server==='own')return {kind:'own',label:asset.type==='server'?tr('所属账号'):tr('名下服务器')};
 for(const [kind,hubs,others,hubLabel,otherLabel] of LINK_KINDS){
  if(hubs.includes(asset?.type)&&others.includes(other?.type))return {kind,label:hubLabel};
  if(hubs.includes(other?.type)&&others.includes(asset?.type))return {kind,label:otherLabel};
 }
 return {kind:'related',label:tr('相关')};
}
// A card can fail before its expiry date: stopped or reported lost, refused by merchants, or a virtual card whose issuer has shut down
// (research #1, C3). Any of these counts as overdue for what the card pays for.
const CARD_STATUSES={frozen:tr('已停用或挂失'),declined:tr('扣款被拒'),closed:tr('发卡方停业')};
function cardTrouble(card){const label=card?.type==='bankcard'&&CARD_STATUSES[card.cardStatus];return label?{level:'overdue',label}:null;}
// A number can go before its keep date as well: cut off by the carrier (giffgaff disconnects numbers used abroad for long, research
// M6) or ported out to another carrier. Either counts as overdue for what it verifies, like a card's status.
const PHONE_STATUSES={suspended:tr('被运营商停用'),ported:tr('已转出')};
function phoneTrouble(phone){const label=phone?.type==='phone'&&PHONE_STATUSES[phone.phoneStatus];return label?{level:'overdue',label}:null;}
// Carriers known to cut numbers off by their own rules; the note goes on a number that is some account's only one.
const CARRIER_NOTES=[{match:/giffgaff/i,text:tr('giffgaff 会停掉长期在境外使用的号码，建议给这些账号加第二个号码')}];
function carrierNote(phone){return phone?.type==='phone'?CARRIER_NOTES.find(n=>n.match.test(`${phone.provider||''} ${phone.name||''}`))?.text||'':'';}
// A card can pay a number's monthly fee as well as get codes on it (research C10). The pair stays one link; the phone keeps
// linkMeta[cardId].pays, and while it is set the link means 支付 / 付款卡, so the card's trouble reaches the number and, when it is
// an account's only number, that account.
function cardPaysPhone(asset,other){const [card,phone]=asset?.type==='bankcard'?[asset,other]:[other,asset];return card?.type==='bankcard'&&phone?.type==='phone'&&!!phone.linkMeta?.[card.id]?.pays;}
function setCardPays(assets,phoneId,cardId,on){
 const phone=assets.find(a=>a.id===phoneId),card=assets.find(a=>a.id===cardId);
 if(phone?.type!=='phone'||card?.type!=='bankcard'||!Array.isArray(phone.links)||!phone.links.includes(cardId))return false;
 const meta={...(phone.linkMeta?.[cardId]||{})};if(on)meta.pays=true;else delete meta.pays;
 phone.linkMeta={...(phone.linkMeta||{})};
 if(Object.keys(meta).length)phone.linkMeta[cardId]=meta;else delete phone.linkMeta[cardId];
 if(!Object.keys(phone.linkMeta).length)delete phone.linkMeta;
 return true;
}
// A number marked stopped while accounts still take their codes on it: carriers recycle numbers to new owners, so it is as bad as a
// lapsed one until those accounts move to another number (research M4). A source's trouble beyond its date: the card's or this.
function sourceTrouble(source){return cardTrouble(source)||phoneTrouble(source)||(source?.type==='phone'&&source.stopped?{level:'overdue',label:tr('已停用')}:null);}
// Where payment or verification is at risk: a card with trouble (`cardTrouble`) or that has expired or soon will, a number whose keep
// date is near or past. A server also hears about the card of the account it belongs to. Hidden sources are left out; the worst comes first.
function linkRisks(assets,asset,now=new Date()){
 const risks=[],seen=new Set();
 const add=(source,kind,via=null)=>{
  if(!source||source.hiddenAt||seen.has(source.id))return;
  const status=sourceTrouble(source)||assetDateStatus(source,now);if(!['soon','overdue'].includes(status.level))return;
  seen.add(source.id);risks.push({source,kind,via,level:status.level,label:status.label});
 };
 for(const other of linkedAssets(assets,asset)){
  const {kind}=linkKind(asset,other);
  if(kind==='pay'&&other.type==='bankcard')add(other,'pay');
  if(kind==='verify'&&other.type==='phone'){
   add(other,'verify');
   // The card that pays the only number of an account: when the fee fails the number goes, and the account with it (C10).
   if(IMPACT_WORDS[asset.type]?.kind==='login'&&verifyNumbers(assets,asset).length===1)for(const card of linkedAssets(assets,other))if(cardPaysPhone(card,other))add(card,'pay',other);
  }
  if(kind==='own'&&asset.type==='server')for(const card of linkedAssets(assets,other))if(card.type==='bankcard')add(card,'pay',other);
  // What signs in with an Apple ID or Google account hears about that account's card, and about its number when it is the only one
  // (research gap 8, I4): a locked account takes everything that logs in with it.
  if(kind==='login'&&IMPACT_WORDS[other.type]?.kind==='login'&&!other.hiddenAt){
   const numbers=verifyNumbers(assets,other);
   for(const x of linkedAssets(assets,other)){if(x.type==='bankcard'&&linkKind(other,x).kind==='pay')add(x,'pay',other);if(x.type==='phone'&&numbers.length===1&&numbers[0].id===x.id)add(x,'verify',other);}
  }
 }
 return risks.sort((left,right)=>(left.level==='overdue'?0:1)-(right.level==='overdue'?0:1));
}
// What a card pays for (servers through the accounts it pays included), what a number verifies or what signs in with an Apple ID or
// Google account: visible records only. IMPACT_WORDS names that hold for the row (支付 N 项) and the risk lines.
const IMPACT_WORDS={bankcard:{kind:'pay',verb:tr('支付'),role:tr('付款卡')},phone:{kind:'verify',verb:tr('验证'),role:tr('验证手机号')},appleid:{kind:'login',verb:tr('登录'),role:tr('登录账号')},google:{kind:'login',verb:tr('登录'),role:tr('登录账号')}};
function linkImpact(assets,source){
 if(!source||!IMPACT_WORDS[source.type])return [];
 const want=IMPACT_WORDS[source.type].kind,out=new Map();
 for(const other of linkedAssets(assets,source)){
  if(other.hiddenAt||linkKind(source,other).kind!==want)continue;
  out.set(other.id,other);
  if(want==='pay'&&other.type==='subscription')for(const server of linkedAssets(assets,other))if(server.type==='server'&&!server.hiddenAt&&relationKind(other,server)==='own')out.set(server.id,server);
 }
 return [...out.values()];
}
// The numbers that verify a record (visible ones only, so a hidden backup does not count). For a number: the records it is the only
// number for, those that have another one, and what signs in through the former. A lost number locks those accounts and everything
// that logs in with them (research M2, G3).
function verifyNumbers(assets,asset){return linkedAssets(assets,asset).filter(x=>!x.hiddenAt&&x.type==='phone'&&linkKind(asset,x).kind==='verify');}
// What a lost number takes with it, for its reminders: "Google 主号、美区主号只靠它收验证码，连同经它们登录的 3 项" (M2).
function phoneStake(assets,asset){
 if(asset?.type!=='phone')return '';
 const reach=phoneReach(assets,asset);if(!reach.only.length)return '';
 const list=reach.only.slice(0,2).map(x=>String(x.name).slice(0,40)).join(tr('、')),names=reach.only.length>2?tr('{names} 等 {n} 个账号',{names:list,n:reach.only.length}):list;
 return reach.via.length?tr('{names}只靠它收验证码，连同经它们登录的 {n} 项',{names,n:reach.via.length}):tr('{names}只靠它收验证码',{names});
}
function phoneReach(assets,phone){
 const only=[],backed=[],via=new Map();
 for(const account of linkImpact(assets,phone))(verifyNumbers(assets,account).length>1?backed:only).push(account);
 for(const account of only)for(const x of linkedAssets(assets,account))if(!x.hiddenAt&&linkKind(account,x).kind==='login'&&!only.includes(x))via.set(x.id,x);
 return {only,backed,via:[...via.values()]};
}

// What a person needs on the day something goes wrong, beyond dates and money (research round 4, individual developers first):
// how an account is got back into, where a server's data is backed up, and how much losing a record would matter. Only kinds and
// places are kept, never the secrets: a field that looks like a code, a recovery code or a key is refused (`looksLikeSecret`).
const MFA_KINDS={totp:tr('验证器 App'),passkey:tr('通行密钥'),key:tr('硬件密钥'),sms:tr('短信'),email:tr('邮件'),none:tr('没开')};
const RECOVERY_TYPES=['appleid','google','subscription','ai','domain'];
// Apple's 遗产联系人 and Google's 闲置账号管理器 (research Y6, Z15): whether someone can get at the account if its owner cannot.
const LEGACY_WORDS={appleid:tr('遗产联系人'),google:tr('闲置账号管理器')},LEGACY_STATES={set:tr('已设置'),none:tr('没设置')};
const RECOVERY_FIELDS=[['mfaWhere',tr('验证器在哪'),tr('例如 iPhone 上的 1Password')],['recoveryCodes',tr('恢复码放在哪'),tr('例如 打印件 · 书桌抽屉')],['vault',tr('密码存在哪'),tr('例如 Bitwarden · 个人')]];
const BACKUP_KINDS={elsewhere:tr('另一家或本地'),platform:tr('同平台另一服务'),snapshot:tr('只有同平台快照'),none:tr('没有备份')};
const BACKUP_TYPES=['server','database','storage','repository'];
const IMPORTANCE={critical:tr('关键'),normal:tr('一般'),disposable:tr('可丢')};
// The handover lists the key records of a kind first and the disposable ones last; the rest keep their order (sort is stable).
const IMPORTANCE_RANK=asset=>({critical:0,disposable:2}[asset?.importance]??1);
function looksLikeSecret(text){
 const v=String(text||'');
 return /(^|[^\d])\d{6,8}([^\d]|$)/.test(v)||/\b[a-z0-9]{4,5}-[a-z0-9]{4,5}\b/i.test(v)&&/\d/.test(v)||/\b[A-Z2-7]{16,}\b/.test(v)||/[A-Za-z0-9+\/_=-]{20,}/.test(v)&&/\d/.test(v)&&/[A-Za-z]/.test(v)||/-----BEGIN|\b(ghp|gho|github_pat|sk|AKIA)[_-]?[A-Za-z0-9]{8,}/.test(v);
}
// One line for the detail and the handover: 验证器 App · iPhone 上的 1Password；恢复码：打印件；密码：Bitwarden.
function recoveryText(asset){
 if(!RECOVERY_TYPES.includes(asset?.type))return '';
 const mfa=MFA_KINDS[asset.mfa]?tr('两步验证：{kind}',{kind:MFA_KINDS[asset.mfa]})+(asset.mfaWhere?` · ${asset.mfaWhere}`:''):asset.mfaWhere?tr('验证器：{where}',{where:asset.mfaWhere}):'';
 const legacy=LEGACY_WORDS[asset.type]&&LEGACY_STATES[asset.legacy]?tr('{what}：{state}',{what:LEGACY_WORDS[asset.type],state:LEGACY_STATES[asset.legacy]}):'';
 return [mfa,asset.recoveryCodes?tr('恢复码：{where}',{where:asset.recoveryCodes}):'',asset.vault?tr('密码：{where}',{where:asset.vault}):'',legacy].filter(Boolean).join(tr('；'));
}
// What is missing for getting back in (research Y1, Y3, Y14): an app or a key with nowhere written for the recovery codes, or codes by
// text message only. A hint for the detail, never a reminder.
function recoveryGap(asset){
 if(!RECOVERY_TYPES.includes(asset?.type))return '';
 if(['totp','passkey','key'].includes(asset.mfa)&&!asset.recoveryCodes)return tr('恢复码没记放在哪：验证器所在的设备丢了，多数平台只认恢复码');
 if(asset.mfa==='sms')return tr('只用短信验证：换号或被人补办 SIM 卡后就进不去，能换成验证器 App 就换');
 return '';
}
// Backups (research Z1–Z6): where they are and when a restore was last tried. A snapshot on the same platform goes with the instance.
function backupText(asset){
 if(!BACKUP_TYPES.includes(asset?.type)||!BACKUP_KINDS[asset.backup]&&!asset.backupNote&&!asset.restoreTestedOn)return '';
 const tried=dayNumber(asset.restoreTestedOn)!==null?tr('{date} 试过恢复',{date:asset.restoreTestedOn}):asset.backup&&asset.backup!=='none'?tr('没试过恢复'):'';
 return [BACKUP_KINDS[asset.backup],asset.backupNote,tried].filter(Boolean).join(' · ');
}
// The host part of an e-mail address in an account field, lower case; '' when there is none.
function mailHost(text){const m=/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/.exec(String(text||''));return m?m[1].toLowerCase():'';}
function onDomain(host,domain){const name=String(domain?.name||'').trim().toLowerCase().replace(/\.$/,'');return !!host&&!!name&&(host===name||host.endsWith('.'+name));}
// Accounts whose login address is on a domain in the list (research Y8, Y9): when the domain lapses its mail stops, and so do the
// password resets of everything signed up with it. Read from the account field only, nothing is fetched. The domain's own record
// counts separately: its registrar account on its own mail can no longer be got back into once it lapses (`selfRecovery`).
function mailDependents(assets,domain){
 if(domain?.type!=='domain')return [];
 return (assets||[]).filter(x=>x.id!==domain.id&&!x.hiddenAt&&onDomain(mailHost(x.account),domain));
}
function selfRecovery(domain){return domain?.type==='domain'&&onDomain(mailHost(domain.account),domain);}
// For a domain's reminders: "3 个账号的登录邮箱在这个域名上".
function mailStake(assets,asset){
 const n=mailDependents(assets,asset).length+(selfRecovery(asset)?1:0);
 return n?tr('{n} 个账号的登录邮箱在这个域名上',{n}):'';
}

// Icon sources (DESIGN-PRINCIPLES §9 rule 16). Every host here is a vendor's public homepage, checked by hand on 2026-10-09;
// `tried` notes hosts that did not give a usable icon. A person's own names (domains, repositories, servers) never become a host.
const iconVendors=[
 // Registrars and DNS
 {host:'cloudflare.com',label:'Cloudflare',match:/cloudflare|\bR2\b/i},
 {host:'namecheap.com',label:'Namecheap',match:/namecheap/i},
 {host:'godaddy.com',label:'GoDaddy',match:/godaddy/i},
 {host:'porkbun.com',label:'Porkbun',match:/porkbun/i},
 {host:'gandi.net',label:'Gandi',match:/gandi/i},
 {host:'dynadot.com',label:'Dynadot',match:/dynadot/i},
 {host:'squarespace.com',label:'Squarespace',match:/squarespace|google\s*domains/i},
 {host:'dnspod.cn',label:'DNSPod',match:/dnspod/i},
 {host:'west.cn',label:tr('西部数码'),match:/西部数码|west\.cn/i},
 {host:'xinnet.com',label:tr('新网'),match:/新网|xinnet/i},
 {host:'namesilo.com',label:'NameSilo',match:/namesilo/i},
 {host:'spaceship.com',label:'Spaceship',match:/spaceship/i},
 // Clouds and hosting
 {host:'aliyun.com',label:tr('阿里云'),match:/阿里云|万网|aliyun|alibaba\s*cloud|alibabacloud/i,tried:['alibabacloud.com: 只有 32px favicon，且部分网络下握手失败']},
 {host:'cloud.tencent.com',label:tr('腾讯云'),match:/腾讯云|tencent\s*cloud|tencentcloud|qcloud/i,tried:['tencentcloud.com: 每个路径都返回脚本渲染的页面，没有图标']},
 {host:'huaweicloud.com',label:tr('华为云'),match:/华为云|huawei\s*cloud|huaweicloud/i},
 {host:'cloud.baidu.com',label:tr('百度智能云'),match:/百度智能云|百度云|baidu\s*cloud/i},
 {host:'aws.amazon.com',label:'AWS',match:/\baws\b|amazon\s*web\s*services|lightsail|\bec2\b|亚马逊云/i},
 {host:'cloud.google.com',label:'Google Cloud',match:/google\s*cloud|\bgcp\b|firebase/i},
 {host:'azure.microsoft.com',label:'Azure',match:/azure/i},
 {host:'digitalocean.com',label:'DigitalOcean',match:/digital\s*ocean|droplet/i},
 {host:'vultr.com',label:'Vultr',match:/vultr/i},
 {host:'linode.com',label:'Linode',match:/linode|akamai/i,tried:['akamai.com: 首页对自动请求返回 403']},
 {host:'hetzner.com',label:'Hetzner',match:/hetzner/i},
 {host:'ovhcloud.com',label:'OVHcloud',match:/\bovh/i},
 {host:'scaleway.com',label:'Scaleway',match:/scaleway/i},
 {host:'fly.io',label:'Fly.io',match:/fly\.io/i},
 {host:'render.com',label:'Render',match:/^render\b|render\.com/i},
 {host:'railway.com',label:'Railway',match:/railway/i},
 {host:'vercel.com',label:'Vercel',match:/vercel/i},
 {host:'netlify.com',label:'Netlify',match:/netlify/i},
 {host:'racknerd.com',label:'RackNerd',match:/racknerd/i},
 {host:'oracle.com',label:'Oracle Cloud',match:/oracle/i},
 {host:'contabo.com',label:'Contabo',match:/contabo/i},
 {host:'heroku.com',label:'Heroku',match:/heroku/i},
 {host:'deno.com',label:'Deno Deploy',match:/\bdeno\b/i},
 {host:'zeabur.com',label:'Zeabur',match:/zeabur/i},
 {host:'bandwagonhost.com',label:tr('搬瓦工'),match:/搬瓦工|bandwagon|\bbwh\b/i,tried:['bandwagonhost.com: 页面没有声明图标，/favicon.ico 返回 404']},
 // Code, deployment and storage
 {host:'github.com',label:'GitHub',match:/github|copilot/i},
 {host:'gitlab.com',label:'GitLab',match:/gitlab/i},
 {host:'gitee.com',label:'Gitee',match:/gitee|码云/i},
 {host:'bitbucket.org',label:'Bitbucket',match:/bitbucket/i},
 {host:'supabase.com',label:'Supabase',match:/supabase/i},
 {host:'backblaze.com',label:'Backblaze',match:/backblaze/i},
 {host:'wasabi.com',label:'Wasabi',match:/wasabi/i},
 {host:'qiniu.com',label:tr('七牛云'),match:/七牛|qiniu/i},
 {host:'upyun.com',label:tr('又拍云'),match:/又拍云|upyun/i},
 {host:'neon.tech',label:'Neon',match:/\bneon\b/i},
 {host:'planetscale.com',label:'PlanetScale',match:/planetscale/i},
 {host:'mongodb.com',label:'MongoDB Atlas',match:/mongodb|mongo\s*atlas/i},
 {host:'redis.io',label:'Redis Cloud',match:/\bredis\b/i},
 {host:'upstash.com',label:'Upstash',match:/upstash/i},
 {host:'turso.tech',label:'Turso',match:/turso/i},
 // Subscriptions and AI
 {host:'apple.com',label:'Apple',match:/\bapple\b|icloud|app\s*store/i},
 {host:'google.com',label:'Google',match:/\bgoogle\b(?!\s*(cloud|domains))|google\s*one/i},
 {host:'microsoft.com',label:'Microsoft',match:/microsoft|office\s*365|microsoft\s*365|onedrive/i},
 {host:'adobe.com',label:'Adobe',match:/adobe|photoshop|creative\s*cloud/i},
 {host:'jetbrains.com',label:'JetBrains',match:/jetbrains|intellij|webstorm|pycharm/i},
 {host:'figma.com',label:'Figma',match:/figma/i},
 {host:'notion.so',label:'Notion',match:/notion/i},
 {host:'chatgpt.com',label:'ChatGPT',match:/chatgpt|openai/i},
 {host:'claude.ai',label:'Claude',match:/claude|anthropic/i},
 {host:'gemini.google.com',label:'Gemini',match:/gemini/i},
 {host:'midjourney.com',label:'Midjourney',match:/midjourney/i},
 {host:'perplexity.ai',label:'Perplexity',match:/perplexity/i},
 {host:'cursor.com',label:'Cursor',match:/cursor/i},
 {host:'deepseek.com',label:'DeepSeek',match:/deepseek/i},
 {host:'x.ai',label:'Grok',match:/\bgrok\b|\bxai\b|x\.ai/i},
 {host:'kimi.com',label:'Kimi',match:/kimi|moonshot|月之暗面/i},
 {host:'doubao.com',label:tr('豆包'),match:/豆包|doubao/i},
 {host:'poe.com',label:'Poe',match:/\bpoe\b/i},
 {host:'openrouter.ai',label:'OpenRouter',match:/openrouter/i},
 {host:'elevenlabs.io',label:'ElevenLabs',match:/elevenlabs|eleven\s*labs/i},
 {host:'youtube.com',label:'YouTube',match:/youtube/i},
 {host:'netflix.com',label:'Netflix',match:/netflix/i},
 {host:'spotify.com',label:'Spotify',match:/spotify/i},
 {host:'1password.com',label:'1Password',match:/1password/i},
 {host:'bitwarden.com',label:'Bitwarden',match:/bitwarden/i},
 {host:'dropbox.com',label:'Dropbox',match:/dropbox/i},
 {host:'setapp.com',label:'Setapp',match:/setapp/i},
 {host:'raycast.com',label:'Raycast',match:/raycast/i},
 {host:'linear.app',label:'Linear',match:/linear\.app|^linear$/i},
 {host:'slack.com',label:'Slack',match:/\bslack\b/i},
 {host:'zoom.us',label:'Zoom',match:/\bzoom\b/i},
 {host:'canva.com',label:'Canva',match:/\bcanva\b/i},
 {host:'sketch.com',label:'Sketch',match:/\bsketch\b/i},
 {host:'parallels.com',label:'Parallels',match:/parallels/i},
 {host:'typora.io',label:'Typora',match:/typora/i},
 {host:'nssurge.com',label:'Surge',match:/\bsurge\b|nssurge/i},
 {host:'cleanshot.com',label:'CleanShot',match:/cleanshot/i},
 // Banks and carriers
 {host:'wise.com',label:'Wise',match:/\bwise\b/i},
 {host:'revolut.com',label:'Revolut',match:/revolut/i},
 {host:'hsbc.com.hk',label:tr('汇丰'),match:/汇丰|hsbc/i},
 {host:'bochk.com',label:tr('中银香港'),match:/中银香港|bochk/i},
 {host:'cmbchina.com',label:tr('招商银行'),match:/招商银行|招行/i},
 {host:'boc.cn',label:tr('中国银行'),match:/中国银行|bank\s*of\s*china/i},
 {host:'icbc.com.cn',label:tr('工商银行'),match:/工商银行|工行|\bicbc\b/i},
 {host:'ccb.com',label:tr('建设银行'),match:/建设银行|建行|\bccb\b/i},
 {host:'abchina.com',label:tr('农业银行'),match:/农业银行|农行|abchina/i},
 {host:'bankcomm.com',label:tr('交通银行'),match:/交通银行|交行|bankcomm/i},
 {host:'bank.za.group',label:tr('众安银行'),match:/众安银行|za\s*bank/i},
 {host:'sc.com',label:tr('渣打'),match:/渣打|standard\s*chartered/i},
 {host:'chase.com',label:'Chase',match:/\bchase\b/i},
 {host:'bankofamerica.com',label:'Bank of America',match:/bank\s*of\s*america|\bbofa\b/i},
 {host:'citi.com',label:'Citi',match:/\bciti(bank)?\b|花旗/i},
 {host:'schwab.com',label:'Charles Schwab',match:/schwab|嘉信/i},
 {host:'monzo.com',label:'Monzo',match:/monzo/i},
 {host:'n26.com',label:'N26',match:/\bn26\b/i},
 {host:'giffgaff.com',label:'giffgaff',match:/giffgaff/i},
 {host:'cmlink.com',label:'CMLink',match:/cmlink/i},
 {host:'10086.cn',label:tr('中国移动'),match:/中国移动|china\s*mobile|10086/i},
 {host:'10010.com',label:tr('中国联通'),match:/中国联通|china\s*unicom|10010/i},
 {host:'189.cn',label:tr('中国电信'),match:/中国电信|china\s*telecom|189\.cn/i},
 {host:'hkcsl.com',label:'csl',match:/\bcsl\b|hkcsl/i},
 {host:'three.com.hk',label:'3HK',match:/\b3hk\b|three\.com\.hk|和记/i},
 {host:'t-mobile.com',label:'T-Mobile',match:/t-?mobile/i},
 {host:'usmobile.com',label:'US Mobile',match:/us\s*mobile/i},
 {host:'ultramobile.com',label:'Ultra Mobile',match:/ultra\s*mobile/i}
];
// Vendors offered for each category in the form and to agents (list_asset_types), most common first. Every name resolves to an
// iconVendors entry through its pattern, so a picked vendor also gets its site icon.
const PROVIDER_PRESETS={
 bankcard:['招商银行','中国银行','工商银行','建设银行','农业银行','交通银行','汇丰','中银香港','众安银行','渣打','Wise','Revolut','Chase','Bank of America','Citi','Charles Schwab','Monzo','N26'],
 phone:['中国移动','中国联通','中国电信','CMLink','csl','3HK','giffgaff','T-Mobile','US Mobile','Ultra Mobile'],
 server:['阿里云','腾讯云','华为云','AWS','Google Cloud','Azure','Oracle Cloud','DigitalOcean','Vultr','Linode','Hetzner','OVHcloud','Contabo','Scaleway','RackNerd','搬瓦工'],
 ai:['OpenAI','Anthropic','Gemini','DeepSeek','Kimi','豆包','Grok','Perplexity','Midjourney','Cursor','GitHub Copilot','Poe','OpenRouter','ElevenLabs'],
 domain:['Cloudflare','Namecheap','Porkbun','GoDaddy','Spaceship','NameSilo','Dynadot','Gandi','Squarespace','阿里云','腾讯云','DNSPod','西部数码','新网'],
 subscription:['Apple','Google','Microsoft','YouTube','Netflix','Spotify','Notion','Figma','Adobe','1Password','Bitwarden','Dropbox','Setapp','Raycast','Linear','Slack','Zoom','Canva'],
 database:['Supabase','Neon','PlanetScale','MongoDB Atlas','Redis Cloud','Upstash','Turso','AWS','Google Cloud','Azure','阿里云','腾讯云'],
 license:['JetBrains','Adobe','Microsoft','Setapp','Sketch','Parallels','Surge','CleanShot','Typora'],
 repository:['GitHub','GitLab','Gitee','Bitbucket'],
 deployment:['Vercel','Netlify','Cloudflare','Render','Railway','Fly.io','GitHub','Heroku','Deno Deploy','Zeabur'],
 storage:['Cloudflare','AWS','Backblaze','Wasabi','阿里云','腾讯云','Google Cloud','Azure','七牛云','又拍云']
};
function providerPresets(type){return PROVIDER_PRESETS[type]||[];}
// Types whose record name is the person's own thing (their domain, repository, machine, bucket…): only provider, account and source say who runs it.
const ownNamedTypes=new Set(['domain','server','database','repository','deployment','storage']);
// Known vendor for a host, including its subdomains (dash.cloudflare.com → Cloudflare).
function vendorForHost(host){const h=String(host||'').toLowerCase().replace(/^www\./,'');if(!h)return null;return iconVendors.find(v=>h===v.host||h.endsWith('.'+v.host))||null;}
// The vendor behind an asset, or null. Order: sync source, management link on a vendor host, provider/account text, then the name for service-named types.
function iconVendor(asset){
 if(!asset)return null;
 if(asset.source==='cloudflare')return vendorForHost('cloudflare.com');
 if(asset.source==='github')return vendorForHost('github.com');
 let linkHost='';try{linkHost=new URL(asset.url||'').hostname;}catch{}
 const byLink=vendorForHost(linkHost);if(byLink)return byLink;
 const text=[asset.provider,asset.account].filter(Boolean).join(' ');
 const byText=text&&iconVendors.find(v=>v.match.test(text));if(byText)return byText;
 if(asset.type==='appleid')return vendorForHost('apple.com');
 if(asset.type==='google')return vendorForHost('google.com');
 if(!ownNamedTypes.has(asset.type)&&asset.name)return iconVendors.find(v=>v.match.test(asset.name))||null;
 return null;
}
// Suggested website for the per-asset icon dialog (the person can change it). Beyond known vendors, a service-type asset may suggest its own management link;
// own-named types never suggest their link, which may be the person's own site.
function iconHost(asset){
 const vendor=iconVendor(asset);if(vendor)return vendor.host;
 if(ownNamedTypes.has(asset?.type))return '';
 try{const host=new URL(asset?.url||'').hostname.replace(/^www\./,'');if(host&&host!=='example.com')return host;}catch{}
 return '';
}
// Plan for 「为全部资产获取网站图标」: one request per host, shared by every asset it serves: a known vendor's host, or for a service-type record
// its own management link's host (iconHost). The dialog lists every host before anything is fetched.
// Assets with a custom icon are left alone (it wins anyway); assets that already have a site icon are skipped unless overwrite is set; hidden assets are skipped.
function iconPlan(assets,{overwrite=false}={}){
 const groups=new Map(),skipped={custom:0,existing:0,unknown:0,hidden:0};
 for(const asset of assets||[]){
  if(asset.hiddenAt){skipped.hidden++;continue;}
  if(typeof asset.iconData==='string'&&asset.iconData.startsWith('data:image/')){skipped.custom++;continue;}
  if(asset.siteIcon&&!overwrite){skipped.existing++;continue;}
  const vendor=iconVendor(asset),host=vendor?.host||iconHost(asset);if(!host){skipped.unknown++;continue;}
  if(!groups.has(host))groups.set(host,{host,label:vendor?.label||host,ids:[]});
  groups.get(host).ids.push(asset.id);
 }
 return {hosts:[...groups.values()].sort((a,b)=>b.ids.length-a.ids.length||a.host.localeCompare(b.host)),skipped};
}
// A platform's own site for its icon, chosen by the person in 获取网站图标 (state.iconSites: platform host → site host). The input may be a
// pasted link or a bare host; the rules match IconFetcher.host(from:) in Swift (no IPs, local names or credentials). '' when refused.
function iconSiteHost(input){
 let text=String(input||'').trim().toLowerCase();if(!text||text.length>300)return '';
 if(!text.includes('://'))text='https://'+text;
 let url;try{url=new URL(text);}catch{return '';}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
 const host=url.hostname,labels=host.split('.'),last=labels[labels.length-1];
 if(!host||host.length>253||labels.length<2||!labels.every(l=>l&&l.length<=63&&/^[a-z0-9-]+$/.test(l)&&!l.startsWith('-')&&!l.endsWith('-'))||!/[a-z]/.test(last)||['localhost','local','internal','lan','home','arpa'].includes(last))return '';
 return host;
}
// Where a platform's icon is fetched from: the person's site for it when one is set, otherwise the platform host itself.
function iconSiteFor(sites,host){const own=sites&&Object.prototype.hasOwnProperty.call(sites,host)?iconSiteHost(sites[host]):'';return own||host;}
// The platform an icon was fetched for, from the host it came from (siteIconHost): a chosen site maps back to its platform.
function iconPlatformOf(sites,host){const h=String(host||'').toLowerCase();if(!h)return '';for(const [platform,site] of Object.entries(sites||{}))if(iconSiteHost(site)===h)return platform;return vendorForHost(h)?.host||h;}
// Rows of 获取网站图标: every platform with its assets (hidden and custom-icon assets left out, as in iconPlan), whether the person chose
// a site for it, which assets already have a site icon, and the icon most of them show. Never carries asset names.
function iconRows(assets,{sites={}}={}){
 const byId=new Map((assets||[]).map(a=>[a.id,a]));
 return iconPlan(assets,{overwrite:true}).hosts.map(h=>{
  const have=h.ids.filter(id=>typeof byId.get(id).siteIcon==='string'&&byId.get(id).siteIcon),tally=new Map();
  for(const id of have){const src=byId.get(id).siteIcon;tally.set(src,(tally.get(src)||0)+1);}
  const icon=[...tally].sort((a,b)=>b[1]-a[1])[0]?.[0]||'',site=iconSiteFor(sites,h.host);
  return {...h,site,custom:site!==h.host,have,icon};
 });
}

// Display limits. Counts read 99+ beyond this (the real number stays in title and labels); data is never truncated.
// The v15 overview lists every record and groups fold instead, so no row or column cap is left.
const DISPLAY_LIMITS={count:99};
function formatCount(value){const n=Math.max(0,Math.floor(Number(value)||0));return n>DISPLAY_LIMITS.count?DISPLAY_LIMITS.count+'+':String(n);}

// Batch import (2026-10-09): CSV/table paste, JSON backup restore. Pure; the UI decides when to preview.
const IMPORT_ROW_LIMIT=100;
const IMPORT_SECRET_HEADERS=/^(?:password|passwd|pwd|pass|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|auth|authorization|cvv|cvc|pin|ssn|信用卡|密码|令牌|密钥)$/i;
const IMPORT_HEADER_ALIASES={
 name:['name','domain','domain name','hostname','host name','asset','title','名称','域名','主机','资产','项目'],
 type:['type','category','kind','类别','类型','分类'],
 provider:['provider','registrar','vendor','platform','平台','注册商','厂商','服务商'],
 account:['account','owner','login','账号','账户','登录','归属'],
 date:['date','expiry','expires','expires at','expiration','expiration date','next date','renewal','due','到期','到期日','过期','下次','续费','扣款'],
 dateKind:['date kind','date type','日期类型'],
 cycle:['cycle','billing cycle','period','周期','计费周期'],
 cost:['cost','price','amount','fee','费用','价格','金额'],
 url:['url','link','management url','dashboard','网址','链接','管理链接'],
 notes:['notes','note','remark','comment','备注','说明'],
 purpose:['purpose','description','用途','描述']
};
const IMPORT_TYPE_ALIASES={
 domain:['domain','domains','域名'],
 server:['server','vps','droplet','instance','服务器','云主机'],
 subscription:['subscription','subscriptions','tool','tools','订阅','工具'],
 database:['database','db','数据库'],
 license:['license','licence','授权','许可证'],
 repository:['repository','repo','repositories','仓库','代码仓库'],
 deployment:['deployment','pages','worker','workers','部署','部署服务'],
 storage:['storage','bucket','r2','对象存储','存储'],
 ai:['ai','ai subscription','ai 订阅'],
 bankcard:['bankcard','card','银行卡'],
 phone:['phone','mobile','手机','手机号'],
 appleid:['appleid','apple id','apple'],
 google:['google','gmail','google 账号']
};
const VENDOR_CSV_PRESETS=[
 {id:'namecheap',label:'Namecheap',match:h=>h.includes('domain name')&&(h.includes('expires')||h.includes('expired date')),map:{name:'domain name',date:'expires',provider:()=>'Namecheap',type:()=>'domain'}},
 {id:'godaddy',label:'GoDaddy',match:h=>h.includes('domain name')&&(h.includes('expiration date')||h.includes('expires')),map:{name:'domain name',date:h=>h.find(x=>x.includes('expiration')||x==='expires')||'expiration date',provider:()=>'GoDaddy',type:()=>'domain'}},
 {id:'porkbun',label:'Porkbun',match:h=>h.includes('domain')&&h.includes('expire date'),map:{name:'domain',date:'expire date',provider:()=>'Porkbun',type:()=>'domain'}},
 {id:'aliyun',label:'阿里云',match:h=>(h.includes('域名')||h.includes('实例名称'))&&(h.includes('到期')||h.includes('到期日期')),map:{name:h=>h.find(x=>x.includes('域名')||x.includes('实例')||x==='名称')||'域名',date:h=>h.find(x=>x.includes('到期'))||'到期日期',provider:()=>'阿里云'}},
 {id:'tencent',label:'腾讯云',match:h=>h.includes('域名')&&h.includes('到期时间'),map:{name:'域名',date:'到期时间',provider:()=>'腾讯云',type:()=>'domain'}},
 {id:'vultr',label:'Vultr',match:h=>h.includes('label')&&(h.includes('main ip')||h.includes('ip address')),map:{name:'label',provider:()=>'Vultr',type:()=>'server',notes:h=>h.find(x=>x.includes('ip'))||'main ip'}},
 {id:'digitalocean',label:'DigitalOcean',match:h=>h.includes('name')&&h.includes('ip address')&&h.includes('region'),map:{name:'name',provider:()=>'DigitalOcean',type:()=>'server',account:'region'}},
 {id:'hetzner',label:'Hetzner',match:h=>h.includes('name')&&(h.includes('server')||h.includes('ipv4')),map:{name:'name',provider:()=>'Hetzner',type:()=>'server'}}
];

function normalizeImportHeader(value){return String(value||'').trim().toLowerCase().replace(/[\s_-]+/g,' ').replace(/[^\w\u4e00-\u9fa5 ]+/g,'');}
function importHeaderField(header){
 const key=normalizeImportHeader(header);
 if(IMPORT_SECRET_HEADERS.test(key.replace(/\s/g,'')))return 'secret';
 for(const [field,aliases] of Object.entries(IMPORT_HEADER_ALIASES))if(aliases.includes(key))return field;
 return null;
}
function importTypeFromText(value){
 const key=normalizeImportHeader(value);
 for(const [type,aliases] of Object.entries(IMPORT_TYPE_ALIASES))if(aliases.includes(key))return type;
 return null;
}
function splitDelimitedLine(line,delimiter){
 const cells=[];let current='',inQuotes=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(inQuotes&&line[i+1]==='"'){current+='"';i++;}else inQuotes=!inQuotes;continue;}
  if(ch===delimiter&&!inQuotes){cells.push(current);current='';continue;}
  current+=ch;
 }
 cells.push(current);
 return cells.map(cell=>cell.trim());
}
function detectDelimiter(sample){
 const lines=sample.split(/\r?\n/).filter(line=>line.trim()).slice(0,5);
 if(!lines.length)return ',';
 const scores={'\t':0,',':0,';':0};
 for(const line of lines)for(const d of Object.keys(scores))scores[d]+=Math.max(0,splitDelimitedLine(line,d).length-1);
 return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
}
function parseDelimitedText(text,{limit=IMPORT_ROW_LIMIT}={}){
 const raw=String(text||'').replace(/^\uFEFF/,'').trim();
 if(!raw)return {ok:false,error:tr('没有可解析的表格内容'),headers:[],rows:[],droppedSecrets:[],truncated:null};
 const delimiter=detectDelimiter(raw);
 const lines=raw.split(/\r?\n/).filter(line=>line.trim());
 if(lines.length<2)return {ok:false,error:tr('表格至少需要表头和一行数据'),headers:[],rows:[],droppedSecrets:[],delimiter};
 const headers=splitDelimitedLine(lines[0],delimiter);
 const droppedSecrets=[];
 const fields=headers.map(header=>{
  const field=importHeaderField(header);
  if(field==='secret'){droppedSecrets.push(header);return null;}
  return field;
 });
 if(!fields.includes('name')){
  // Vendor presets may still map a name column by raw header.
  const normalized=headers.map(normalizeImportHeader);
  const preset=VENDOR_CSV_PRESETS.find(item=>item.match(normalized));
  if(!preset)return {ok:false,error:tr('未识别到名称列。请包含「名称」或「域名」表头。'),headers,rows:[],droppedSecrets,delimiter};
 }
 const dataLines=lines.slice(1);
 const truncated=dataLines.length>limit;
 const rows=dataLines.slice(0,limit).map((line,index)=>{
  const cells=splitDelimitedLine(line,delimiter);
  const row={_line:index+2};
  headers.forEach((header,i)=>{if(fields[i]&&fields[i]!=='secret')row[fields[i]]=cells[i]??'';row['raw:'+normalizeImportHeader(header)]=cells[i]??'';});
  return row;
 });
 const normalized=headers.map(normalizeImportHeader);
 const preset=VENDOR_CSV_PRESETS.find(item=>item.match(normalized))||null;
 return {ok:true,headers,rows,droppedSecrets,delimiter,truncated,preset,totalRows:dataLines.length};
}
function resolvePresetValue(spec,headers,row){
 if(typeof spec==='function'){
  const key=spec(headers.map(normalizeImportHeader));
  return typeof key==='string'?row['raw:'+normalizeImportHeader(key)]??row[key]??'':key;
 }
 if(typeof spec==='string')return row['raw:'+normalizeImportHeader(spec)]??row[importHeaderField(spec)]??'';
 return '';
}
function parseImportDate(value){
 const text=String(value||'').trim();
 if(!text)return '';
 for(const [pattern,read] of datePatterns){
  pattern.lastIndex=0;
  const match=pattern.exec(text);
  if(match){
   const [y,m,d]=read(match);
   if(y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31)return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
 }
 return '';
}
function csvSyncKey(type,name){return syncKey('csv',`${type}:${String(name||'').trim().toLowerCase()}`);}
function rowsToImportItems(parsed,{types=Object.keys(IMPORT_TYPE_ALIASES)}={}){
 if(!parsed?.ok)return {items:[],unreadable:[{reason:parsed?.error||tr('无法解析')}]};
 const items=[],unreadable=[];
 const headers=parsed.headers.map(normalizeImportHeader);
 for(const row of parsed.rows){
  let name=String(row.name||'').trim();
  let type=importTypeFromText(row.type)||'';
  let provider=String(row.provider||'').trim();
  let account=String(row.account||'').trim();
  let date=parseImportDate(row.date);
  let dateKind=dateKinds[row.dateKind]?row.dateKind:'expire';
  let cycle=billingCycles[row.cycle]?row.cycle:'';
  let cost=String(row.cost||'').trim();
  let url=String(row.url||'').trim();
  let notes=String(row.notes||'').trim();
  let purpose=String(row.purpose||'').trim();
  if(parsed.preset){
   const map=parsed.preset.map;
   if(map.name)name=String(resolvePresetValue(map.name,parsed.headers,row)||name).trim();
   if(map.type)type=importTypeFromText(resolvePresetValue(map.type,parsed.headers,row))||(typeof map.type==='function'?map.type():type);
   if(map.provider)provider=String(resolvePresetValue(map.provider,parsed.headers,row)||provider).trim();
   if(map.account)account=String(resolvePresetValue(map.account,parsed.headers,row)||account).trim();
   if(map.date)date=parseImportDate(resolvePresetValue(map.date,parsed.headers,row))||date;
   if(map.notes){const extra=String(resolvePresetValue(map.notes,parsed.headers,row)||'').trim();if(extra)notes=notes?`${notes} · ${extra}`:extra;}
   if(map.cost)cost=String(resolvePresetValue(map.cost,parsed.headers,row)||cost).trim();
   if(map.url)url=String(resolvePresetValue(map.url,parsed.headers,row)||url).trim();
  }
  if(!type)type=guessAssetType(`${name} ${provider} ${notes} ${purpose}`,/\./.test(name)?[name.toLowerCase()]:[]);
  if(!types.includes(type))type='subscription';
  if(!name){unreadable.push({line:row._line,reason:tr('缺少名称'),raw:row});continue;}
  if(url){try{const parsedUrl=new URL(url);if(!/^https?:$/.test(parsedUrl.protocol)||parsedUrl.username||parsedUrl.password)url='';}catch{url='';}}
  const externalId=`${type}:${name.toLowerCase()}`;
  items.push({name:name.slice(0,100),type,provider:provider.slice(0,80),account:account.slice(0,100),date,dateKind,cycle,cost:cost.slice(0,80),url:url.slice(0,2000),notes:notes.slice(0,2000),purpose:purpose.slice(0,100),source:'csv',externalId,vendorPreset:parsed.preset?.id||null,importedFrom:parsed.preset?.label||''});
 }
 return {items,unreadable,truncated:parsed.preset,droppedSecrets:parsed.droppedSecrets||[],truncated:parsed.truncated,totalRows:parsed.totalRows};
}

// CF-Server-Monitor's server backup (后台 → 数据库 → 导出服务器, servers-backup-<date>.json): a JSON array of its servers rows.
// Read from the file only; Assetboard never calls the panel. Price, cycle and expiry become the server's cost and date, its region
// the server's region; its 备注 is left out (people keep passwords there), and the probe settings (ping nodes, intervals,
// corrections) are not ours to keep.
const CFSM_CYCLES={month:['monthly'],quarter:['quarterly'],half_year:['halfyearly'],year:['yearly'],two_years:['','2 年'],three_years:['','3 年'],four_years:['','4 年'],five_years:['','5 年']};
const CFSM_CURRENCIES={'¥':'CNY','$':'USD','€':'EUR','£':'GBP','₽':'RUB','₣':'CHF','₹':'INR','₫':'VND','฿':'THB'};
function isCfsmBackup(value){
 return Array.isArray(value)&&value.length>0&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&'name' in row&&'billing_cycle' in row&&'expire_date' in row);
}
function parseCfsmBackup(text){
 let value=null;try{value=JSON.parse(text);}catch{}
 if(!isCfsmBackup(value))return {ok:false,error:tr('不是 CF-Server-Monitor 的服务器备份')};
 const items=[],unreadable=[],clean=value=>String(value??'').trim();
 value.slice(0,IMPORT_ROW_LIMIT).forEach((row,index)=>{
  const name=clean(row.name);
  if(!name){unreadable.push({line:index+1,reason:tr('缺少名称')});return;}
  // Its price is "12.00"; 0 and -1 mean free, blank means not set.
  const [cycle,longCycle]=CFSM_CYCLES[row.billing_cycle]||[''],price=clean(row.price);
  let cost='';
  if(price&&Number(price)<=0)cost='免费';
  else if(Number(price)>0)cost=`${formatCost({currency:CFSM_CURRENCIES[clean(row.currency)]||'',value:price},cycle)}${longCycle?` / ${longCycle}`:''}`;
  const group=clean(row.server_group),tags=clean(row.tags),region=clean(row.region).toUpperCase(),traffic=clean(row.traffic_limit);
  const notes=[group&&group!=='Default'&&`分组 ${group}`,tags&&`标签 ${tags}`,!regionName(region)&&/^[A-Z]{2}$/.test(region)&&`地区 ${region}`,traffic&&`流量 ${traffic}`].filter(Boolean).join(' · ');
  items.push({name:name.slice(0,100),type:'server',provider:'',account:'',...(regionName(region)?{region}:{}),date:parseImportDate(row.expire_date),dateKind:String(row.auto_renewal)==='1'?'renew':'expire',cycle,cost:cost.slice(0,80),url:'',notes:notes.slice(0,2000),purpose:'',source:'csv',externalId:`server:${name.toLowerCase()}`,vendorPreset:'cfsm',importedFrom:'CF-Server-Monitor'});
 });
 // Its 备注 is not a secret column, so the preview says it was left out rather than dropped as a key.
 return {ok:true,items,unreadable,preset:{id:'cfsm',label:'CF-Server-Monitor'},droppedSecrets:[],leftOut:value.some(row=>clean(row.note))?[{label:tr('备注'),why:tr('CF-Server-Monitor 的备注常记着密码，没有导入')}]:[],truncated:value.length>IMPORT_ROW_LIMIT,totalRows:value.length};
}

// Cloudflare user-token template URL (permission keys verified against Cloudflare template docs 2026).
// Registrar is requested separately when possible; missing Registrar permission only skips expiry enrichment.
const CLOUDFLARE_TOKEN_PERMISSIONS=[{key:'zone',type:'read'},{key:'account_settings',type:'read'},{key:'page',type:'read'},{key:'workers_scripts',type:'read'},{key:'workers_r2',type:'read'}];
function cloudflareTokenTemplateUrl({name='Assetboard',includeRegistrar=true}={}){
 const perms=[...CLOUDFLARE_TOKEN_PERMISSIONS];
 // Undocumented-ish key used by the dashboard for Registrar Domains Read; if Cloudflare ignores it, the form still prefills the rest.
 if(includeRegistrar)perms.push({key:'registrar',type:'read'});
 const encoded=encodeURIComponent(JSON.stringify(perms));
 return `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encoded}&accountId=*&zoneId=all&name=${encodeURIComponent(name)}`;
}
function githubTokenTemplateUrl(){
 return 'https://github.com/settings/tokens?type=beta';
}

// ~/.ssh/config → server candidates. Only Host / HostName / User / Port; never reads key files.
function parseSshConfig(text){
 const lines=String(text||'').split(/\r?\n/),hosts=[],glob=/[*?]/;
 let current=null;
 const flush=()=>{if(current&&current.name&&!glob.test(current.name)&&current.name.toLowerCase()!=='host')hosts.push(current);current=null;};
 for(const raw of lines){
  const line=raw.replace(/(^|\s)#.*$/,'').trim();if(!line)continue;
  const match=/^(Host|HostName|User|Port|Include)\s+(.+)$/i.exec(line);if(!match)continue;
  const key=match[1].toLowerCase(),value=match[2].trim();
  if(key==='include')continue; // skip includes for safety/simplicity
  if(key==='host'){flush();const name=value.split(/\s+/)[0];if(name&&!glob.test(name))current={name,host:'',sshUser:'',sshPort:'22'};continue;}
  if(!current)continue;
  if(key==='hostname')current.host=value;
  else if(key==='user')current.sshUser=value;
  else if(key==='port')current.sshPort=/^\d{1,5}$/.test(value)?value:'22';
 }
 flush();
 return hosts.filter(h=>h.host||h.name).map(h=>{
  const host=h.host||h.name,externalId=h.name.toLowerCase();
  return {name:h.name,type:'server',provider:'SSH',account:h.sshUser||'',host,...(normalizeIp(host)?{ips:[normalizeIp(host).ip]}:{}),sshUser:h.sshUser||'',sshPort:h.sshPort||'22',purpose:'本机 SSH 配置',event:'来自 ~/.ssh/config',date:'',cost:'未知',notes:`从 ~/.ssh/config 的 Host「${h.name}」读取；不读取私钥。`,url:'',source:'ssh',externalId,art:'generic'};
 });
}
function mergeSshConfig(board,hosts,syncedAt=new Date().toISOString()){
 const next=structuredClone(board),seen=new Set(),collisions=[];let added=0;
 if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
 for(const item of hosts||[]){
  const id='ssh-host-'+item.externalId;seen.add(id);
  if(isBlacklisted(next,syncKey('ssh',item.externalId))||isBlacklisted(next,id))continue;
  const fields={name:item.name,account:item.account,host:item.host,...(item.ips&&!(next.assets.find(a=>a.id===id)?.ips?.length)?{ips:item.ips}:{}),sshUser:item.sshUser,sshPort:item.sshPort,syncedAt,externalId:item.externalId,source:'ssh',provider:'SSH',event:item.event||'来自 ~/.ssh/config'};
  const existing=next.assets.find(a=>a.id===id)||findByExternal(next,'ssh',item.externalId);
  if(existing){applySyncedFields(existing,fields);seen.add(existing.id);}
  else{
   const collision=findNameCollision(next,'ssh',item.name,'server',item.externalId);
   if(collision){collisions.push({assetId:collision.id,name:item.name,source:'SSH',fields:{...fields,type:'server'}});continue;}
   next.assets.push({id,createdAt:syncedAt,type:'server',...fields,purpose:item.purpose,date:'',cost:'未知',notes:item.notes,url:'',art:'generic'});
   added++;
  }
  ensureBlock(next,'server');
 }
 for(const asset of next.assets)if(asset.source==='ssh'&&!seen.has(asset.id))asset.syncMissing=true;
 return {board:next,added,read:(hosts||[]).length,collisions};
}

// Minimal .eml parser (headers + best-effort body). Quoted-printable/base64 text bodies only; HTML stripped lightly.
function decodeQuotedPrintable(input){
 return String(input||'').replace(/=\r?\n/g,'').replace(/=([0-9A-Fa-f]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function decodeBase64Text(input){
 try{
  if(typeof atob==='function')return decodeURIComponent(escape(atob(String(input||'').replace(/\s+/g,''))));
  return Buffer.from(String(input||'').replace(/\s+/g,''),'base64').toString('utf8');
 }catch{return '';}
}
function stripHtml(html){return String(html||'').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();}
function parseEml(raw){
 const text=String(raw||'').replace(/^\uFEFF/,'');
 if(!/^(?:From:|To:|Subject:|Date:|MIME-Version:)/im.test(text.slice(0,2000))&&!text.includes('\n\n'))return {ok:false,error:tr('不是有效的邮件文件')};
 const headerEnd=text.search(/\r?\n\r?\n/);
 const head=headerEnd>=0?text.slice(0,headerEnd):text.slice(0,8000);
 const bodyRaw=headerEnd>=0?text.slice(headerEnd).replace(/^\r?\n\r?\n/,''):'';
 const header=(name)=>{const re=new RegExp('^'+name+':\\s*(.*(?:\\r?\\n[ \\t].*)*)','im');const m=re.exec(head);return m?m[1].replace(/\r?\n[ \\t]+/g,' ').trim():'';};
 const subject=header('Subject'),from=header('From'),date=header('Date');
 let body=bodyRaw;
 const cte=header('Content-Transfer-Encoding').toLowerCase();
 const ctype=header('Content-Type').toLowerCase();
 // Multipart: take the first text/plain or text/html part heuristically
 if(/multipart\//i.test(ctype)){
  const boundary=(/boundary="?([^";\s]+)"?/i.exec(header('Content-Type'))||[])[1];
  if(boundary){
   const parts=bodyRaw.split('--'+boundary).slice(1,-1);
   let plain='',html='';
   for(const part of parts){
    const pe=part.search(/\r?\n\r?\n/);if(pe<0)continue;
    const ph=part.slice(0,pe),pb=part.slice(pe).replace(/^\r?\n\r?\n/,'');
    const pt=/Content-Type:\s*([^\s;]+)/i.exec(ph)?.[1]?.toLowerCase()||'';
    const enc=(/Content-Transfer-Encoding:\s*(\S+)/i.exec(ph)?.[1]||'').toLowerCase();
    let decoded=pb;
    if(enc==='base64')decoded=decodeBase64Text(pb);
    else if(enc==='quoted-printable')decoded=decodeQuotedPrintable(pb);
    if(pt==='text/plain'&&!plain)plain=decoded;
    if(pt==='text/html'&&!html)html=decoded;
   }
   body=plain||stripHtml(html)||bodyRaw.slice(0,6000);
  }
 }else{
  if(cte==='base64')body=decodeBase64Text(bodyRaw);
  else if(cte==='quoted-printable')body=decodeQuotedPrintable(bodyRaw);
  if(/text\/html/i.test(ctype))body=stripHtml(body);
 }
 body=String(body||'').replace(/\r\n/g,'\n').trim().slice(0,6000);
 if(!subject&&!body)return {ok:false,error:tr('邮件没有可读的标题或正文')};
 return {ok:true,from,subject:subject||'(无标题)',date,body,source:from,title:subject||from||'邮件'};
}

// Agent import: {"assetboard":1,"items":[{name,type,provider,account,date,dateKind,cycle,cost,url,notes,purpose}]}.
// Items go through the same normalisation as CSV rows, so types, dates and URLs are validated in one place.
const AGENT_FIELDS=['name','type','provider','account','date','dateKind','cycle','cost','url','notes','purpose'];
function isAgentImport(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&value.assetboard===1&&Array.isArray(value.items);}
function parseAgentImport(text){
 let value;
 try{value=typeof text==='string'?JSON.parse(text):text;}catch{return {ok:false,error:tr('不是有效的 JSON')};}
 if(!value||typeof value!=='object'||Array.isArray(value)||value.assetboard!==1)return {ok:false,error:tr('缺少 "assetboard": 1')};
 if(!Array.isArray(value.items))return {ok:false,error:tr('缺少 items 数组')};
 const rows=value.items.slice(0,IMPORT_ROW_LIMIT).map((item,index)=>{
  const row={_line:index+1};
  for(const key of AGENT_FIELDS)row[key]=item&&typeof item[key]==='string'?item[key]:item&&typeof item[key]==='number'?String(item[key]):'';
  return row;
 });
 return {ok:true,headers:AGENT_FIELDS,rows,truncated:value.items.length>IMPORT_ROW_LIMIT,totalRows:value.items.length};
}
// Form entry helpers. A date may be typed in full or as month/day ("3/1", "3月1日"), meaning the next one coming up.
function parseLooseDate(text,now=new Date()){
 const full=parseImportDate(text);
 if(full)return full;
 const match=/^\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})\s*[日号]?\s*$/.exec(String(text||''));
 if(!match)return '';
 const month=+match[1],day=+match[2],today=localDay(now);
 for(const year of [now.getFullYear(),now.getFullYear()+1]){
  const time=Date.UTC(year,month-1,day);
  if(new Date(time).getUTCMonth()!==month-1)return '';
  if(time/DAY_MS>=today)return isoDay(time/DAY_MS);
 }
 return '';
}
function shiftDate(base,months,now=new Date()){return addMonths(dayNumber(base)!==null?base:isoDay(localDay(now)),months);}
// The cost field is stored as text ("$10.98 / 年"); the form edits it as an amount plus a currency.
function costParts(text){
 const value=String(text||'').trim();
 if(!value||value.length>40)return null;
 const hit=findAmounts(value)[0];
 // Anything besides the amount and a "/ period" tail ("约 100 元左右") stays free text, so it is not rewritten.
 if(!hit||`${value.slice(0,hit.index)}${value.slice(hit.end)}`.replace(/\s*\/\s*[^/]+$/,'').trim())return null;
 return {currency:hit.currency,value:hit.value.replace(/,/g,'')};
}
function formatCostParts(currency,value,cycle){return formatCost({currency,value},cycle);}
// Money (v20). The cost stays the text people read ("$10.98 / 年"); every save also stores what it says as amount (a number) and
// currency (an ISO code), whoever wrote it: the form, an import, AI or an agent. Text that is not a plain amount ("约 100 元左右")
// carries neither and is left out of totals. Rates are per 1 USD; converting never touches the record.
const MAIN_CURRENCIES=['CNY','USD','EUR','GBP','HKD','JPY'];
const FALLBACK_RATES={date:'2026-10-20',source:tr('内置参考汇率'),rates:{USD:1,CNY:6.678,EUR:0.89166,GBP:0.74925,HKD:7.8487,JPY:158.13,SGD:1.2785,AUD:1.4317,CAD:1.4051}};
// {currency, value, months} from a record's cost; months is null when no cycle is known (one-off or unclear), the whole thing null
// when the cost is empty, 未知 or free text.
function costAmount(asset){
 const text=String(asset?.cost||'').trim();if(!text||text==='未知')return null;
 const parts=costParts(text),value=Number(parts?.value);if(!parts||!(value>0))return null;
 const tail=(/\/\s*(.+)$/.exec(text)?.[1]||'').trim();
 const cycle=Object.keys(billingCycles).find(key=>billingCycles[key].suffix===tail)||(tail?textCycle('/'+tail)||textCycle(tail):null)||(billingCycles[asset.cycle]?asset.cycle:'');
 return {currency:parts.currency,value,months:cycle?billingCycles[cycle].months:null};
}
// Keeps amount and currency in step with the cost text; returns whether anything changed.
function syncMoney(asset){
 const money=costAmount(asset),before=`${asset.amount}|${asset.currency}`;
 if(money){asset.amount=money.value;asset.currency=money.currency;}else{delete asset.amount;delete asset.currency;}
 return before!==`${asset.amount}|${asset.currency}`;
}
function convertMoney(value,from,to,rates){
 const r=rates||FALLBACK_RATES.rates;
 if(from===to)return value;
 return r[from]>0&&r[to]>0?value/r[from]*r[to]:null;
}
// One formatter per digit count; building it on every call dominated a render with many converted rows.
const moneyFormats={};
function formatMoney(value,currency){
 const digits=currency==='JPY'||Math.abs(value)>=1000?0:2;
 const text=(moneyFormats[digits]||=new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits})).format(Number(value));
 return `${currencyDisplay[currency]??currency+' '}${text}`;
}
// Recurring cost of a set of records in one currency. Hidden and stopped records are not paid for, so they stay out; records with
// no readable amount, no cycle, or a currency without a rate are listed instead of guessed.
// Billing (v21): recurring, one_off, free or unknown. Stored as billingType when someone said so; otherwise read from the cost: a zero
// amount or 免费 is free, an amount with a cycle is recurring, anything else stays unknown (an amount without a cycle is not
// assumed to be one-off — that has to be said).
const BILLING_TYPES=['recurring','one_off','free','unknown'];
const billingLabels={recurring:tr('周期付费'),one_off:tr('一次性'),free:tr('免费'),unknown:tr('未知')};
function isFreeCost(text){
 const value=String(text||'').trim();if(!value)return false;
 if(/^(免费|free)\b/i.test(value)||/^免费/.test(value))return true;
 const bare=value.replace(/\s*\/\s*[^/]+$/,'').replace(/^(?:[A-Z]{3}\s*|HK\$|S\$|A\$|C\$|JP¥|[$¥€£￥])/i,'').replace(/\s*(?:[A-Z]{3}|元|美元|人民币)$/i,'').trim();
 return /^0+(?:\.0+)?$/.test(bare);
}
function billingTypeOf(asset){
 if(BILLING_TYPES.includes(asset?.billingType))return asset.billingType;
 if(isFreeCost(asset?.cost))return 'free';
 return costAmount(asset)?.months?'recurring':'unknown';
}
// Promotion: {start, end, amount, regularAmount, currency}. Between start and end the promo amount is what is paid per cycle;
// after end the regular amount is. settlePromotions writes the regular price into the cost once the promotion is over.
function validPromotion(promo){
 if(!promo||typeof promo!=='object')return null;
 const end=dayNumber(promo.end)!==null?promo.end:'',start=dayNumber(promo.start)!==null?promo.start:'',amount=Number(promo.amount),regular=Number(promo.regularAmount),currency=String(promo.currency||'').toUpperCase();
 if(!end||!(amount>=0)||!(regular>0)||!/^[A-Z]{3}$/.test(currency)||(start&&dayNumber(start)>dayNumber(end)))return null;
 return {...(start?{start}:{}),end,amount:roundMoney(amount),regularAmount:roundMoney(regular),currency,...(promo.settledAt?{settledAt:promo.settledAt}:{})};
}
// What one cycle costs on a given day: {currency, value, months, basis} — basis is 'promotion', 'regular' (promotion over but not
// settled yet), 'free' or 'cost'. null when nothing readable.
function moneyOn(asset,day){
 const own=costAmount(asset),promo=validPromotion(asset?.promotion),months=own?.months||billingCycles[asset?.cycle]?.months||null;
 if(promo&&!promo.settledAt){
  const lo=dayNumber(promo.start)??-Infinity,hi=dayNumber(promo.end);
  if(day>=lo&&day<=hi)return {currency:promo.currency,value:promo.amount,months,basis:'promotion'};
  if(day>hi)return {currency:promo.currency,value:promo.regularAmount,months,basis:'regular'};
 }
 if(billingTypeOf(asset)==='free')return {currency:own?.currency||'',value:0,months,basis:'free'};
 return own?{...own,basis:'cost'}:null;
}
function settlePromotions(assets,now=new Date()){
 const today=localDay(now),changed=[];
 for(const asset of assets||[]){
  const promo=validPromotion(asset.promotion);if(!promo||promo.settledAt||today<=dayNumber(promo.end))continue;
  const cycle=billingCycles[asset.cycle]?asset.cycle:Object.keys(billingCycles).find(key=>billingCycles[key].months===costAmount(asset)?.months)||'';
  const before=asset.cost;asset.cost=formatCost({currency:promo.currency,value:String(promo.regularAmount)},cycle);
  asset.promotion={...promo,settledAt:now.toISOString()};
  noteCostChange(asset,before,'promotion-end',now);changed.push(asset);
 }
 return changed;
}
// Price history: every change of the cost text, with the amounts it read as. Kept on the asset, newest last.
const COST_HISTORY_LIMIT=100;
function noteCostChange(asset,before,source='edit',now=new Date()){
 if(!asset||String(before??'')===String(asset.cost??''))return null;
 const read=text=>{const parts=costParts(text);return parts?{amount:Number(parts.value),currency:parts.currency}:isFreeCost(text)?{amount:0,currency:''}:{amount:null,currency:''};};
 const from=read(before),to=read(asset.cost);
 const entry={at:now.toISOString(),from:String(before??''),to:String(asset.cost??''),amountFrom:from.amount,amountTo:to.amount,currencyFrom:from.currency,currencyTo:to.currency,source:String(source).slice(0,40)};
 asset.costHistory=[...(Array.isArray(asset.costHistory)?asset.costHistory:[]),entry].slice(-COST_HISTORY_LIMIT);
 return entry;
}
// Recurring cost of a set of records in one currency, as of `now` (a running promotion counts at its price). Hidden and stopped
// records are not paid for, so they stay out. Free records, one-off costs (summed apart), amounts without a cycle, unreadable
// text and currencies without a rate are listed instead of guessed.
function costTotals(assets,{currency='CNY',rates,now=new Date()}={}){
 const items=[],unreadable=[],oneOff=[],noCycle=[],noRate=[],free=[],byType=new Map(),today=localDay(now);let monthly=0,oneOffTotal=0;
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped)continue;
  const type=billingTypeOf(asset);
  if(type==='free'){free.push(asset);continue;}
  if(!asset.cost||asset.cost==='未知'){if(type==='one_off')oneOff.push(asset);continue;}
  const money=moneyOn(asset,today);
  if(!money||!(money.value>=0)||(money.basis==='cost'&&!(money.value>0))){unreadable.push(asset);continue;}
  if(type==='one_off'){oneOff.push(asset);const v=convertMoney(money.value,money.currency,currency,rates);if(v===null)noRate.push(asset);else oneOffTotal+=v;continue;}
  if(!money.months){noCycle.push(asset);continue;}
  const converted=convertMoney(money.value/money.months,money.currency,currency,rates);
  if(converted===null){noRate.push(asset);continue;}
  monthly+=converted;items.push({asset,monthly:converted,money});
  byType.set(asset.type,(byType.get(asset.type)||0)+converted);
 }
 items.sort((left,right)=>right.monthly-left.monthly);
 return {currency,monthly,yearly:monthly*12,items,unreadable,oneOff,oneOffTotal,noCycle,noRate,free,byType:[...byType].sort((left,right)=>right[1]-left[1])};
}
// Expected spending between two days: every charge date of each record, priced on that day (promotions and their end, trials
// that turn into charges, manual renewals at today's price). A recurring cost without a date is spread per month and marked.
function costForecast(assets,{from,to,currency='CNY',rates,now=new Date()}={}){
 const lo=dayNumber(from)??localDay(now),hi=dayNumber(to)??dayNumber(addMonths(isoDay(lo),12))-1;
 const items=[],byMonth=new Map(),unreadable=[],noRate=[],noCycle=[];let total=0;
 const add=(asset,date,money,basis)=>{
  const converted=convertMoney(money.value,money.currency,currency,rates);
  if(converted===null){if(!noRate.includes(asset))noRate.push(asset);return;}
  total+=converted;const month=date.slice(0,7);byMonth.set(month,(byMonth.get(month)||0)+converted);
  items.push({id:asset.id,name:asset.name,type:asset.type,date,amount:roundMoney(money.value),currency:money.currency,converted:roundMoney(converted),basis});
 };
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped)continue;
  const type=billingTypeOf(asset);if(type==='free')continue;
  const months=billingCycles[asset.cycle]?.months||costAmount(asset)?.months||null,dated=dayNumber(asset.date)!==null;
  if(type==='one_off'){if(dated&&dayNumber(asset.date)>=lo&&dayNumber(asset.date)<=hi){const m=moneyOn(asset,dayNumber(asset.date));if(m)add(asset,asset.date,m,'one_off');else unreadable.push(asset);}continue;}
  if(!asset.cost||asset.cost==='未知')continue;
  if(!moneyOn(asset,lo)){unreadable.push(asset);continue;}
  if(!months){noCycle.push(asset);continue;}
  if(dated){
   const anchor={...asset,cycle:Object.keys(billingCycles).find(key=>billingCycles[key].months===months)};
   for(const date of occurrencesBetween(anchor,lo,hi)){const m=moneyOn(asset,dayNumber(date));if(m&&m.value>0)add(asset,date,m,asset.dateKind==='trial'?'trial-ends':m.basis==='promotion'?'promotion':m.basis==='regular'?'promotion-ended':'charge');}
  }else{
   // No date: one share per calendar month in range.
   for(let month=isoDay(lo).slice(0,7);month<=isoDay(hi).slice(0,7);month=addMonths(month+'-01',1).slice(0,7)){const day=Math.max(lo,dayNumber(month+'-01'));const m=moneyOn(asset,day);if(m&&m.value>0)add(asset,isoDay(day),{...m,value:m.value/months},'spread');}
  }
 }
 items.sort((left,right)=>dayNumber(left.date)-dayNumber(right.date)||String(left.name).localeCompare(String(right.name)));
 // Every calendar month in range, in order; a month without a charge is 0 so charts and agents never skip it.
 const allMonths=[];
 for(let month=isoDay(lo).slice(0,7);month<=isoDay(hi).slice(0,7);month=addMonths(month+'-01',1).slice(0,7))allMonths.push({month,total:roundMoney(byMonth.get(month)||0)});
 return {currency,from:isoDay(lo),to:isoDay(hi),total:roundMoney(total),byMonth:allMonths,items,notCounted:{unreadable:unreadable.map(a=>a.id),noCycle:noCycle.map(a=>a.id),noRate:noRate.map(a=>a.id)}};
}
// Best guess of the category from what was typed as the name; '' when it is not clear.
function inferTypeFromName(name){
 const text=String(name||'').trim();
 if(!text)return '';
 if(/^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(text))return 'repository';
 const ips=parseIps(text);
 if(ips.ips.length&&!ips.invalid.length)return 'server';
 if(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(text))return 'domain';
 const guess=guessAssetType(text,[]);
 return guess==='subscription'?'':guess;
}
// One typed line ("example.com namecheap 2027-03-01 $11/年") into form fields; whatever is not recognised is left out.
function parseQuickLine(text,now=new Date()){
 let rest=String(text||'').replace(/\s+/g,' ').trim().slice(0,200);
 if(!rest)return null;
 const fill={};
 const amount=findAmounts(rest)[0];
 if(amount){
  const cycle=amount.cycle||textCycle(rest)||'';
  fill.cost=formatCost({currency:amount.currency,value:amount.value.replace(/,/g,'')},cycle);
  if(cycle){fill.cycle=cycle;fill.dateKind='renew';}
  rest=`${rest.slice(0,amount.index)} ${rest.slice(amount.end)}`.replace(/(?:^|\s)(?:\/|per\s|每)\s?(?:mo\b|month|yr\b|year|月|年)\S*/gi,' ');
 }
 const dates=findDates(rest);
 if(dates[0]){
  fill.date=dates[0].value;if(dateKinds[dates[0].kind])fill.dateKind=dates[0].kind;
  rest=`${rest.slice(0,dates[0].index)} ${rest.slice(dates[0].end)}`;
 }else{
  const token=rest.split(' ').find(item=>/^\d{1,2}[\/.\-月]\d{1,2}[日号]?$/.test(item)&&parseLooseDate(item,now));
  if(token){fill.date=parseLooseDate(token,now);rest=rest.replace(token,' ');}
 }
 const tokens=rest.split(/[\s,;，；]+/).filter(Boolean);
 if(!tokens.length)return null;
 const found=tokens.findIndex(item=>inferTypeFromName(item)),index=found>=0?found:0;
 fill.name=tokens.splice(index,1)[0].slice(0,100);
 const type=inferTypeFromName(fill.name)||inferTypeFromName(rest);
 if(type)fill.type=type;
 if(tokens.length)fill.provider=tokens.join(' ').slice(0,80);
 return fill;
}
function classifyImportPayload({text='',filename='',mime=''}={}){
 const name=String(filename||'').toLowerCase(),type=String(mime||'').toLowerCase(),body=String(text||'');
 if(/\.(png|jpe?g|webp)$/i.test(name)||/^image\//.test(type))return {kind:'image',filename};
 if(/\.pdf$/i.test(name)||type==='application/pdf')return {kind:'pdf',filename};
 if(/\.eml$/i.test(name)||type==='message/rfc822')return {kind:'eml',filename,text:body};
 // Assetboard's own read-only exports (calendar, payment ledger, handover page) carry too little to rebuild records from;
 // they are named so the import can point at the backup instead of making half-empty or duplicate records.
 const copy=exportCopyKind(name,type,body);if(copy)return {kind:'copy',copy,filename};
 if(/\.csv$/i.test(name)||type==='text/csv'||type==='text/tab-separated-values')return {kind:'csv',filename,text:body};
 if(/\.tsv$/i.test(name))return {kind:'csv',filename,text:body};
 // The agent format is told apart from a board backup by content, so it is read the same however it arrives.
 if(/\.json$/i.test(name)||type==='application/json'){let value=null;try{value=JSON.parse(body);}catch{}return {kind:isAgentImport(value)?'agent':isCfsmBackup(value)?'cfsm':'json',filename,text:body};}
 const trimmed=body.trim();
 if(!trimmed)return {kind:'empty'};
 if(/^[\[{]/.test(trimmed)){
  try{const value=JSON.parse(trimmed);if(isAgentImport(value))return {kind:'agent',filename,text:trimmed};if(isCfsmBackup(value))return {kind:'cfsm',filename,text:trimmed};if(value&&typeof value==='object'&&(Array.isArray(value.assets)||Array.isArray(value.blocks)))return {kind:'json',filename,text:trimmed};}catch{}
 }
 if((trimmed.includes('\n')&&(/,|\t|;/.test(trimmed.split(/\n/,1)[0])))||(trimmed.includes('\t')&&trimmed.includes('\n'))){
  const parsed=parseDelimitedText(trimmed);
  if(parsed.ok)return {kind:'csv',filename,text:trimmed,parsed};
 }
 return {kind:'paste',text:trimmed};
}
function exportCopyKind(name,type,body){
 const head=body.replace(/^\ufeff/,'').trimStart().slice(0,400);
 if(/\.ics$/i.test(name)||type==='text/calendar'||/^BEGIN:VCALENDAR/i.test(head))return '日历';
 if(/^(?:付款日期,名称,类别,|Paid on,Name,)/.test(head))return '付款账本';
 if(/\.html?$/i.test(name)||type==='text/html'||/^<!doctype html/i.test(head))return /资产交接清单|Asset handover sheet/.test(body.slice(0,2000))?'交接清单':'网页';
 return '';
}
function findCsvMatch(board,item){
 const key=csvSyncKey(item.type,item.name);
 const byKey=board.assets.find(asset=>assetSyncKey(asset)===key||(asset.source==='csv'&&asset.externalId===item.externalId));
 if(byKey)return byKey;
 return board.assets.find(asset=>asset.type===item.type&&asset.name===item.name&&asset.source!=='demo');
}
function planImport(board,items,{sameName='skip'}={}){
 const added=[],updated=[],collisions=[],skippedDeleted=[],hidden=[],skippedSame=[];
 if(!Array.isArray(board.deletedExternalIds))board={...board,deletedExternalIds:[]};
 for(const item of items||[]){
  const key=csvSyncKey(item.type,item.name);
  if(isBlacklisted(board,key)||isBlacklisted(board,`csv:${item.externalId}`)){skippedDeleted.push({item,key});continue;}
  const existing=findCsvMatch(board,item);
  if(existing){
   if(sameName==='skip'){skippedSame.push({item,assetId:existing.id,name:existing.name,hidden:!!existing.hiddenAt});continue;}
   const target={item,assetId:existing.id,name:existing.name,hidden:!!existing.hiddenAt};
   if(existing.hiddenAt)hidden.push(target);else updated.push(target);
   continue;
  }
  const collision=findNameCollision(board,'csv',item.name,item.type,item.externalId);
  if(collision){
   if(sameName==='skip'){skippedSame.push({item,assetId:collision.id,name:collision.name,hidden:!!collision.hiddenAt});continue;}
   collisions.push({item,assetId:collision.id,name:collision.name,hidden:!!collision.hiddenAt});
   continue;
  }
  added.push({item});
 }
 const conflicts=collisions.length+skippedDeleted.length+hidden.length>0;
 return {added,updated,collisions,skippedDeleted,hidden,skippedSame,conflicts,sameName};
}
function importItemFields(item,syncedAt){
 return {
  name:item.name,type:item.type,provider:item.provider||'',account:item.account||'',purpose:item.purpose||'',
  date:item.date||'',dateKind:item.dateKind||'expire',cycle:item.cycle||'',cost:item.cost||'未知',
  notes:item.notes||'',url:item.url||'',source:'csv',externalId:item.externalId,syncedAt,
  ...(item.region?{region:item.region}:{}),...(item.importedFrom?{importedFrom:item.importedFrom}:{}),
  event:item.date?`${item.date} ${dateKinds[item.dateKind||'expire'].future}`:'日期待补充',art:'generic'
 };
}
function applyImport(board,plan,{restoreKeys=[],applySame=[],applyCollisions=[],now=new Date().toISOString()}={}){
 const next=structuredClone(board);
 if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
 const restore=new Set(restoreKeys);
 if(restore.size)next.deletedExternalIds=next.deletedExternalIds.filter(key=>!restore.has(key));
 const writeNew=entry=>{
  const fields=importItemFields(entry.item,now);
  const id='csv-'+cryptoRandomId();
  next.assets.push({id,createdAt:now,...fields});
  ensureBlock(next,fields.type);
  if(next.cardOrder?.[fields.type]?.length)next.cardOrder[fields.type].unshift(id);
 };
 const writeUpdate=(assetId,item)=>{
  const asset=next.assets.find(a=>a.id===assetId);if(!asset)return;
  const fields=importItemFields(item,now);
  Object.assign(asset,{name:fields.name,provider:fields.provider,account:fields.account,purpose:fields.purpose||asset.purpose,date:fields.date||asset.date,dateKind:fields.dateKind,cycle:fields.cycle||asset.cycle,cost:fields.cost==='未知'?asset.cost:fields.cost,notes:fields.notes||asset.notes,url:fields.url||asset.url,source:'csv',externalId:fields.externalId,syncedAt:now,updatedAt:now,event:fields.event});
  if(fields.region)asset.region=fields.region;
  if(fields.importedFrom)asset.importedFrom=fields.importedFrom;
  // Keep hiddenAt untouched.
  ensureBlock(next,asset.type);
 };
 for(const entry of plan.added||[])writeNew(entry);
 for(const entry of plan.updated||[])writeUpdate(entry.assetId,entry.item);
 for(const entry of plan.hidden||[])writeUpdate(entry.assetId,entry.item);
 for(const key of applySame){const entry=(plan.skippedSame||[]).find(row=>row.assetId===key||row.item.externalId===key);if(entry)writeUpdate(entry.assetId,entry.item);}
 for(const key of applyCollisions){const entry=(plan.collisions||[]).find(row=>row.assetId===key);if(entry)writeUpdate(entry.assetId,entry.item);}
 for(const entry of plan.skippedDeleted||[]){
  if(!restore.has(entry.key))continue;
  writeNew(entry);
 }
 return next;
}
function cryptoRandomId(){
 if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
}
function parseBoardBackup(text){
 let value;
 try{value=typeof text==='string'?JSON.parse(text):text;}catch{return {ok:false,error:tr('不是有效的 JSON')};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:tr('备份需要是对象')};
 if(!Array.isArray(value.assets)||!Array.isArray(value.blocks))return {ok:false,error:tr('备份缺少 assets 或 blocks')};
 if(value.blocks.some(block=>!block||typeof block.id!=='string'))return {ok:false,error:tr('区块格式无效')};
 if(value.assets.some(asset=>!asset||typeof asset.id!=='string'||typeof asset.name!=='string'||typeof asset.type!=='string'))return {ok:false,error:tr('资产格式无效')};
 return {ok:true,board:{blocks:value.blocks.map(block=>({id:block.id,folded:!!block.folded})),assets:value.assets,deletedExternalIds:Array.isArray(value.deletedExternalIds)?value.deletedExternalIds:[],evidenceDecisions:value.evidenceDecisions&&typeof value.evidenceDecisions==='object'?value.evidenceDecisions:{},cardOrder:value.cardOrder&&typeof value.cardOrder==='object'?value.cardOrder:{},theme:value.theme}};
}
function planBoardBackup(current,backup,{mode='merge'}={}){
 if(!backup?.ok)return {ok:false,error:backup?.error||tr('无效备份'),conflicts:true};
 if(mode==='replace')return {ok:true,mode:'replace',added:backup.board.assets.map(asset=>({item:asset})),updated:[],collisions:[],skippedDeleted:[],hidden:[],skippedSame:[],conflicts:true,board:backup.board};
 const added=[],updated=[],skippedDeleted=[];
 const currentIds=new Set(current.assets.map(a=>a.id));
 const deleted=new Set(current.deletedExternalIds||[]);
 for(const asset of backup.board.assets){
  if(deleted.has(asset.id)||(assetSyncKey(asset)&&deleted.has(assetSyncKey(asset)))){skippedDeleted.push({item:asset,key:assetSyncKey(asset)||asset.id});continue;}
  if(currentIds.has(asset.id))updated.push({item:asset,assetId:asset.id,name:asset.name,hidden:!!current.assets.find(a=>a.id===asset.id)?.hiddenAt});
  else added.push({item:asset});
 }
 const hidden=updated.filter(row=>row.hidden);
 const plainUpdated=updated.filter(row=>!row.hidden);
 return {ok:true,mode:'merge',added,updated:plainUpdated,collisions:[],skippedDeleted,hidden,skippedSame:[],conflicts:skippedDeleted.length+hidden.length>0,board:backup.board};
}
function applyBoardBackup(current,plan,{restoreKeys=[]}={}){
 if(plan.mode==='replace'){
  const next=structuredClone(plan.board);
  if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
  return next;
 }
 const next=structuredClone(current);
 if(!Array.isArray(next.deletedExternalIds))next.deletedExternalIds=[];
 const restore=new Set(restoreKeys);
 if(restore.size)next.deletedExternalIds=next.deletedExternalIds.filter(key=>!restore.has(key));
 const byId=new Map(next.assets.map(asset=>[asset.id,asset]));
 for(const entry of [...plan.updated,...plan.hidden]){
  const local=byId.get(entry.assetId);if(!local)continue;
  const incoming=entry.item;
  Object.assign(local,{...incoming,hiddenAt:local.hiddenAt,iconData:local.iconData||incoming.iconData,siteIcon:local.siteIcon||incoming.siteIcon,siteIconHost:local.siteIconHost||incoming.siteIconHost,notes:incoming.notes||local.notes});
  ensureBlock(next,local.type);
 }
 for(const entry of plan.added){
  if(byId.has(entry.item.id))continue;
  next.assets.push(structuredClone(entry.item));
  ensureBlock(next,entry.item.type);
 }
 for(const entry of plan.skippedDeleted){
  if(!restore.has(entry.key))continue;
  if(byId.has(entry.item.id))continue;
  next.assets.push(structuredClone(entry.item));
  ensureBlock(next,entry.item.type);
 }
 if(plan.board.evidenceDecisions)next.evidenceDecisions={...(next.evidenceDecisions||{}),...plan.board.evidenceDecisions};
 if(plan.board.cardOrder)next.cardOrder={...(next.cardOrder||{}),...plan.board.cardOrder};
 for(const key of plan.board.deletedExternalIds||[])if(!restore.has(key)&&!next.deletedExternalIds.includes(key))next.deletedExternalIds.push(key);
 return next;
}
function demoImportSampleCsv(){
 return ['名称,类别,平台,到期日,费用,备注','sample-studio.com,域名,Namecheap,2026-10-21,$10.98 / 年,演示用域名','demo-box-tokyo,服务器,Example VPS,2026-11-04,$6.00 / 月,演示用服务器','Example Notes Pro,订阅与工具,Example Notes,2026-11-06,$8.00 / 月,演示用订阅'].join('\n');
}

// Renewals and payments (v21). A payment is what was actually paid for one due date and lives on the asset:
// {id, paidOn, amount, currency, months, covers, via, status}. status 'missed' records that an expected charge did not happen and
// never counts as spending. Charges on recurring dates still roll by themselves; confirming them only adds the record.
const PAYMENT_LIMIT=240,CONFIRM_DAYS=45,RENEWABLE_KINDS=['expire','renew','keep'];
let paymentSequence=0;
function paymentId(){return `pay-${Date.now().toString(36)}-${(++paymentSequence).toString(36)}${Math.random().toString(36).slice(2,6)}`;}
function paymentList(asset){return Array.isArray(asset?.payments)?asset.payments.filter(p=>p&&dayNumber(p.paidOn)!==null):[];}
function paidPayments(asset){return paymentList(asset).filter(p=>p.status!=='missed'&&Number(p.amount)>0&&/^[A-Z]{3}$/.test(p.currency||''));}
function lastPayment(asset){return paidPayments(asset).sort((left,right)=>dayNumber(right.paidOn)-dayNumber(left.paidOn))[0]||null;}
function roundMoney(value){return Math.round(Number(value)*100)/100;}
function recordPayment(asset,{paidOn,amount=0,currency='',months=null,covers='',via='manual',status='paid',note=''}){
 if(!asset||dayNumber(paidOn)===null)return null;
 const value=roundMoney(amount);
 if(status!=='missed'&&!(value>0&&/^[A-Z]{3}$/.test(currency)))return null;
 const payment={id:paymentId(),paidOn,amount:status==='missed'?0:value,currency:status==='missed'?'':currency,months:Number(months)>0?Number(months):null,covers:dayNumber(covers)!==null?covers:'',via,status:status==='missed'?'missed':'paid',...(note?{note:String(note).slice(0,200)}:{})};
 const list=paymentList(asset).filter(p=>!(payment.covers&&p.covers===payment.covers));
 list.push(payment);
 list.sort((left,right)=>dayNumber(left.paidOn)-dayNumber(right.paidOn)||String(left.covers).localeCompare(String(right.covers)));
 asset.payments=list.slice(-PAYMENT_LIMIT);settleCreditExpiry(asset);
 return payment;
}
function removePayment(asset,id){const before=paymentList(asset).length;asset.payments=paymentList(asset).filter(p=>p.id!==id);if(!asset.payments.length)delete asset.payments;settleCreditExpiry(asset);return before!==(asset.payments?.length||0);}
// Prepaid API credit runs out a year after it was bought and cannot be extended (research A1, A4: OpenAI and Anthropic say so in their
// terms, OpenRouter may expire it after 365 days). A prepaid (not recurring) AI record of one of these keeps its date at the newest
// purchase + 365 days, as an expiry, while that date is one this rule set (creditExpiry); a date someone typed is left alone. For
// OpenAI and Anthropic the name must say it is the API, so a ChatGPT or Claude plan with no cycle yet does not get one.
const CREDIT_RULES=[{match:/openrouter/i,days:365},{match:/openai|anthropic/i,need:/api|credit|额度|platform|console/i,days:365}];
function creditRule(asset){
 if(asset?.type!=='ai'||billingTypeOf(asset)==='recurring')return null;
 const text=`${asset.provider||''} ${asset.name||''} ${asset.purpose||''}`;
 return CREDIT_RULES.find(r=>r.match.test(text)&&(!r.need||r.need.test(text)))||null;
}
function settleCreditExpiry(asset){
 const rule=creditRule(asset);if(!rule||(asset.date&&!asset.creditExpiry))return false;
 const last=lastPayment(asset);
 if(!last){if(!asset.creditExpiry)return false;delete asset.date;delete asset.creditExpiry;return true;}
 Object.assign(asset,{date:isoDay(dayNumber(last.paidOn)+rule.days),dateKind:'expire',cycle:'',creditExpiry:true});return true;
}
// Due dates of a recurring record between two day numbers (inclusive), counted from its anchor.
function occurrencesBetween(asset,from,to){
 const start=dayNumber(asset?.date),months=billingCycles[asset?.cycle]?.months;
 if(start===null||from>to)return [];
 if(!months)return start>=from&&start<=to?[asset.date]:[];
 const out=[];
 for(let step=0;step<=1200;step++){const value=step?addMonths(asset.date,months*step):asset.date,day=dayNumber(value);if(day>to)break;if(day>=from)out.push(value);}
 return out;
}
function createdDay(asset){const time=Date.parse(asset?.createdAt||'');return Number.isNaN(time)?null:localDay(new Date(time));}
// Automatic charges whose day has come and that nobody has confirmed yet: the last CONFIRM_DAYS days, never before `since`
// (when payments arrived) or before the record existed, so an old board does not wake up to a pile of questions.
function pendingCharges(assets,{now=new Date(),since=''}={}){
 const today=localDay(now),floor=Math.max(today-CONFIRM_DAYS+1,dayNumber(since)??-Infinity),out=[];
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped||asset.dateKind!=='renew'||!billingCycles[asset.cycle])continue;
  const answered=new Set(paymentList(asset).map(p=>p.covers).filter(Boolean)),from=Math.max(floor,createdDay(asset)??-Infinity);
  for(const due of occurrencesBetween(asset,from,today))if(!answered.has(due))out.push({asset,due,days:today-dayNumber(due),money:moneyOn(asset,dayNumber(due))});
 }
 return out.sort((left,right)=>dayNumber(left.due)-dayNumber(right.due)||String(left.asset.name).localeCompare(String(right.asset.name)));
}
// Repeating expiries and keep-alive deadlines whose day has passed and nobody has confirmed: renewals fail silently (a stopped card,
// notices going to an old address) and a keep-alive only counts when it was done, so the date does not just roll on as if it worked.
// Asked from the day after, same window as pendingCharges.
function pendingRenewals(assets,{now=new Date(),since=''}={}){
 const today=localDay(now),floor=Math.max(today-CONFIRM_DAYS+1,dayNumber(since)??-Infinity),out=[];
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped||!needsConfirm(asset))continue;
  const answered=new Set(paymentList(asset).map(p=>p.covers).filter(Boolean)),from=Math.max(floor,createdDay(asset)??-Infinity);
  const due=occurrencesBetween(asset,from,today-1).filter(day=>!answered.has(day)).pop();
  if(due)out.push({asset,due,days:today-dayNumber(due),kind:asset.dateKind==='keep'?'keep':'expire',money:moneyOn(asset,dayNumber(due))});
 }
 return out.sort((left,right)=>dayNumber(left.due)-dayNumber(right.due)||String(left.asset.name).localeCompare(String(right.asset.name)));
}
// The answer to pendingRenewals. Renewed (or kept alive): the date moves to the next term from the due date, and the price is written
// down when it is known. Not renewed: it stops repeating and keeps the date it ran out on, so it shows as expired and the after-expiry
// reminders start.
function confirmRenewal(asset,due,{renewed=true,now=new Date()}={}){
 const months=billingCycles[asset?.cycle]?.months;
 if(!months||dayNumber(due)===null)return null;
 if(renewed){
  const payment=moneyOn(asset,dayNumber(due))?.value>0?confirmCharge(asset,due,{now}):null;
  asset.date=addMonths(due,months);asset.updatedAt=now.toISOString();delete asset.registryPhase;
  return {renewed:true,date:asset.date,payment};
 }
 asset.date=due;asset.cycle='';asset.updatedAt=now.toISOString();
 return {renewed:false,date:due,payment:null};
}
// A card's next month and recent trouble: the automatic charges due on what it pays for within `days`, and the charges marked as not
// taken in the last 60 days (a stopped or refused card shows up here before the expiry date does).
function cardOutlook(assets,card,{now=new Date(),days=30}={}){
 const today=localDay(now),upcoming=[],missed=[];
 for(const asset of linkImpact(assets,card)){
  if(asset.stopped)continue;
  if(asset.dateKind==='renew'||needsConfirm(asset)&&asset.dateKind!=='keep')for(const due of occurrencesBetween(asset,today,today+days))upcoming.push({asset,due,money:moneyOn(asset,dayNumber(due))});
  for(const payment of paymentList(asset))if(payment.status==='missed'&&today-dayNumber(payment.paidOn)<=60)missed.push({asset,payment});
 }
 const totals=new Map();
 for(const {money} of upcoming)if(money?.value>0)totals.set(money.currency,roundMoney((totals.get(money.currency)||0)+money.value));
 upcoming.sort((left,right)=>dayNumber(left.due)-dayNumber(right.due));
 return {upcoming,missed,totals:[...totals.entries()]};
}
function monthsBetween(from,to){
 const a=dayNumber(from),b=dayNumber(to);if(a===null||b===null||b<=a)return null;
 const [y1,m1]=from.split('-').map(Number),[y2,m2]=to.split('-').map(Number);let months=(y2-y1)*12+m2-m1;
 if(addMonths(from,months)!==to&&dayNumber(addMonths(from,months))>b)months--;
 return months>0?months:null;
}
// The date a renewal starts from: the next due date for a recurring record, the stored date otherwise (even when it has passed).
function renewBase(asset,now=new Date()){
 if(dayNumber(asset?.date)===null)return '';
 return billingCycles[asset.cycle]?nextOccurrence(asset.date,asset.cycle,localDay(now))||asset.date:asset.date;
}
function canRenew(asset){return !!asset&&!asset.hiddenAt&&dayNumber(asset.date)!==null&&RENEWABLE_KINDS.includes(asset.dateKind||'expire');}
// Choices offered by 已续费: the record's own cycle first, then the usual longer terms. An expired one-off renews from its old date
// (registrars count from the expiry, not from the day you pay); the person can still type any date.
function renewOptions(asset,now=new Date()){
 const base=renewBase(asset,now);if(!base)return {base:'',options:[]};
 const steps={monthly:[1,3,12],quarterly:[3,6,12],halfyearly:[6,12,24],yearly:[12,24,36,60]}[asset.cycle]||[12,24,36,1];
 const label=months=>months%12===0?tr('{n} 年',{n:months/12}):tr('{n} 个月',{n:months});
 return {base,options:steps.map(months=>({months,label:label(months),until:addMonths(base,months)}))};
}
// Cost text for what was paid, when it covers exactly one cycle of the record (or a year for one without a cycle).
function costFromPayment(asset,{amount,currency,months}){
 const value=roundMoney(amount);if(!(value>0)||!/^[A-Z]{3}$/.test(currency||''))return '';
 const cycle=billingCycles[asset?.cycle]?asset.cycle:Object.keys(billingCycles).find(key=>billingCycles[key].months===months)||'';
 if(!cycle||billingCycles[cycle].months!==months)return '';
 return formatCost({currency,value:String(value)},cycle);
}
// 已续费: move the date to `until`, write the payment and, when asked, the new price. Returns the payment (null when nothing was paid).
function renewAsset(asset,{until,paidOn,amount=0,currency='',updateCost=false,via='renew',now=new Date()}){
 const base=renewBase(asset,now);
 if(dayNumber(until)===null||(base&&dayNumber(until)<=dayNumber(base)))return {ok:false,error:tr('新的日期要晚于现在的日期')};
 const months=base?monthsBetween(base,until):null,payment=Number(amount)>0?recordPayment(asset,{paidOn:paidOn||isoDay(localDay(now)),amount,currency,months,covers:base,via}):null;
 if(Number(amount)>0&&!payment)return {ok:false,error:tr('金额或币种不对')};
 asset.date=until;asset.dateKind=RENEWABLE_KINDS.includes(asset.dateKind)?asset.dateKind:'expire';
 asset.event=`${until} ${dateKinds[asset.dateKind].future}`;
 let costChanged=false;
 if(updateCost&&payment){const cost=costFromPayment(asset,payment),own=costAmount(asset);if(cost&&!(own&&own.value===payment.amount&&own.currency===payment.currency&&own.months===payment.months)){asset.cost=cost;costChanged=true;}}
 asset.updatedAt=now.toISOString();delete asset.warn;
 return {ok:true,payment,base,months,costChanged};
}
// One automatic charge confirmed as paid (amount defaults to the record's cost) or as not taken.
function confirmCharge(asset,due,{amount,currency,paidOn,missed=false,now=new Date()}={}){
 if(missed)return recordPayment(asset,{paidOn:paidOn||isoDay(localDay(now)),covers:due,via:'confirm',status:'missed'});
 const own=moneyOn(asset,dayNumber(due)??localDay(now)),value=amount??own?.value,code=currency||own?.currency;
 const payment=recordPayment(asset,{paidOn:paidOn||due,amount:value,currency:code,months:billingCycles[asset.cycle]?.months||own?.months||null,covers:due,via:'confirm'});
 if(payment)asset.updatedAt=now.toISOString();
 return payment;
}
// The price moved: today's cost against the last payment, or (when the cost was already updated) the last payment against the one
// before. Compared per month and only in one currency; null when nothing comparable moved by at least 1%.
function priceChange(asset){
 const paid=paidPayments(asset).filter(p=>p.months).sort((left,right)=>dayNumber(left.paidOn)-dayNumber(right.paidOn)),own=costAmount(asset);
 const compare=(before,after,months,currency)=>{const pct=(after-before)/before;return Math.abs(pct)>=.01?{before:roundMoney(before),after:roundMoney(after),months,currency,pct,up:pct>0}:null;};
 const last=paid.at(-1),prev=paid.at(-2);
 if(last&&own?.months&&own.currency===last.currency){const change=compare(last.amount/last.months*own.months,own.value,own.months,own.currency);if(change)return {...change,since:last.paidOn,basis:'cost'};}
 if(last&&prev&&prev.currency===last.currency){const change=compare(prev.amount/prev.months*last.months,last.amount,last.months,last.currency);if(change)return {...change,since:prev.paidOn,basis:'payments'};}
 return null;
}
// Totals of what was paid, by currency, within [from, to] (ISO days, inclusive).
function paidTotals(assets,{from='',to=''}={}){
 const lo=dayNumber(from)??-Infinity,hi=dayNumber(to)??Infinity,totals=new Map();let count=0;
 for(const asset of assets||[])for(const p of paidPayments(asset)){const day=dayNumber(p.paidOn);if(day<lo||day>hi)continue;count++;totals.set(p.currency,roundMoney((totals.get(p.currency)||0)+p.amount));}
 return {count,byCurrency:[...totals].sort((left,right)=>right[1]-left[1])};
}
// The ledger: every payment in a period, oldest first, ready for a spreadsheet.
function ledgerRows(assets,{from='',to='',typeName=type=>type}={}){
 const lo=dayNumber(from)??-Infinity,hi=dayNumber(to)??Infinity,rows=[];
 for(const asset of assets||[])for(const p of paidPayments(asset)){const day=dayNumber(p.paidOn);if(day<lo||day>hi)continue;rows.push({date:p.paidOn,name:asset.name,type:typeName(asset.type),provider:asset.provider==='平台待补充'?'':asset.provider||'',project:asset.project||'',amount:p.amount,currency:p.currency,months:p.months||'',covers:p.covers||'',note:p.note||'',id:asset.id});}
 return rows.sort((left,right)=>dayNumber(left.date)-dayNumber(right.date)||String(left.name).localeCompare(String(right.name)));
}
// Spreadsheet-safe CSV: quoted when needed, and a leading = + - @ is defused so a name never runs as a formula.
function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function ledgerCsv(rows,{converted=null}={}){
 const head=[tr('付款日期'),tr('名称'),tr('类别'),tr('平台'),tr('项目'),tr('金额'),tr('币种'),tr('覆盖月数'),tr('对应到期日'),tr('备注'),...(converted?[tr('折合 {currency}',{currency:converted.currency})]:[])];
 const line=r=>[r.date,r.name,r.type,r.provider,r.project,r.amount.toFixed(r.currency==='JPY'?0:2),r.currency,r.months,r.covers,r.note,...(converted?[(()=>{const v=convertMoney(r.amount,r.currency,converted.currency,converted.rates);return v===null?'':v.toFixed(2);})()]:[])].map(csvCell).join(',');
 return '\ufeff'+[head.map(csvCell).join(','),...rows.map(line)].join('\r\n')+'\r\n';
}

// Projects (v21): a free-text label that ties a side project's domain, repo, hosting and subscriptions together.
const PROJECT_LIMIT=40;
function cleanProject(value){return String(value??'').replace(/\s+/g,' ').trim().slice(0,PROJECT_LIMIT);}
function projectNames(assets){
 const counts=new Map();
 for(const asset of assets||[]){const name=cleanProject(asset.project);if(name&&!asset.hiddenAt)counts.set(name,(counts.get(name)||0)+1);}
 return [...counts].sort((left,right)=>right[1]-left[1]||left[0].localeCompare(right[0])).map(([name,count])=>({name,count}));
}
function projectAssets(assets,name){const want=cleanProject(name);return (assets||[]).filter(asset=>!asset.hiddenAt&&want&&cleanProject(asset.project)===want);}
const KEEP_ON_SHUTDOWN=['bankcard','phone','appleid','google'];
// 关停清单: what to do for each record of a project, the last day it still saves money, and what else still depends on it.
function shutdownPlan(assets,name,{now=new Date(),currency='CNY',rates}={}){
 const today=localDay(now),own=projectAssets(assets,name),ids=new Set(own.map(asset=>asset.id)),steps=[],kept=[];
 for(const asset of own){
  if(KEEP_ON_SHUTDOWN.includes(asset.type)){kept.push(asset);continue;}
  const status=assetDateStatus(asset,now),auto=asset.dateKind==='renew'||!!billingCycles[asset.cycle];
  const domainStep=auto?tr('关掉自动续费，或转出给别人'):tr('不再续费，或转出给别人');
  const action={domain:asset.icp?tr('先注销备案，然后{step}',{step:domainStep}):domainStep,server:tr('备份数据，然后删除实例'),repository:tr('归档仓库，或设为私有'),database:tr('导出数据，然后删除实例'),subscription:tr('取消订阅'),ai:tr('取消订阅'),license:tr('停用授权，不再续期')}[asset.type]||tr('停用或取消');
  const deadline=status.level==='none'?'':status.date,money=moneyOn(asset,today);
  const monthly=money?.months?convertMoney(money.value/money.months,money.currency,currency,rates):null;
  const shared=linkedAssets(assets,asset).filter(other=>!other.hiddenAt&&!ids.has(other.id)&&!KEEP_ON_SHUTDOWN.includes(other.type)).map(other=>other.name);
  steps.push({asset,action,deadline,days:deadline?dayNumber(deadline)-today:null,auto,monthly,shared,done:!!(asset.stopped||asset.hiddenAt)});
 }
 steps.sort((left,right)=>(left.deadline?0:1)-(right.deadline?0:1)||(left.days??0)-(right.days??0)||String(left.asset.name).localeCompare(String(right.asset.name)));
 return {name:cleanProject(name),steps,kept,monthlySaving:steps.reduce((sum,step)=>sum+(step.asset.stopped?0:step.monthly||0),0)};
}

// 定期清理: records that cost money or keep a date, most expensive and longest untouched first. The clock starts at the last
// review, or when the record was added (updatedAt for old records without createdAt); nothing joins before REVIEW_QUIET_DAYS
// have passed on that clock. A record with no time at all joins at once.
const REVIEW_QUIET_DAYS=80,REVIEW_SKIP=['bankcard','phone','appleid','google'];
function lastTouchedDay(asset){return Math.max(...[asset.reviewedAt,asset.updatedAt,asset.createdAt].map(value=>Date.parse(value||'')).filter(time=>!Number.isNaN(time)).map(time=>localDay(new Date(time))),-Infinity);}
function reviewQueue(assets,{now=new Date(),currency='CNY',rates}={}){
 const today=localDay(now),out=[];
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped||REVIEW_SKIP.includes(asset.type))continue;
  const money=moneyOn(asset,today),monthly=money?.months&&money.value>0?convertMoney(money.value/money.months,money.currency,currency,rates):null;
  if(!(monthly>0)&&dayNumber(asset.date)===null)continue;
  const touched=lastTouchedDay(asset),idle=Number.isFinite(touched)?today-touched:365;
  const since=[asset.reviewedAt,asset.createdAt,asset.updatedAt].map(value=>Date.parse(value||'')).find(time=>!Number.isNaN(time));
  if(since!==undefined&&today-localDay(new Date(since))<REVIEW_QUIET_DAYS)continue;
  out.push({asset,monthly:monthly||0,idle,score:(monthly||0)*(1+idle/30)+(monthly>0?0:idle/365)});
 }
 return out.sort((left,right)=>right.score-left.score||String(left.asset.name).localeCompare(String(right.asset.name)));
}

// Calendar export (RFC 5545): one all-day event per dated record, repeating with its cycle, with alarms at 09:00 on the same
// lead days as the app's own reminders. Text is escaped and lines are folded at 75 octets.
function icsText(value){return String(value??'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
function icsFold(line){
 const bytes=text=>new TextEncoder().encode(text).length;if(bytes(line)<=75)return line;
 const parts=[];let current='';
 for(const ch of line){if(bytes(current+ch)>(parts.length?74:75)){parts.push(current);current=ch;}else current+=ch;}
 parts.push(current);return parts.join('\r\n ');
}
function icsDate(value){return value.replace(/-/g,'');}
function calendarIcs(assets,{now=new Date(),name='Assetboard'}={}){
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Assetboard//Renewals//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${icsText(name)}`];
 for(const asset of assets||[]){
  if(asset.hiddenAt||asset.stopped||!asset.name||dayNumber(asset.date)===null)continue;
  const kind=dateKinds[asset.dateKind]?asset.dateKind:'expire',months=billingCycles[asset.cycle]?.months,cost=asset.cost&&asset.cost!=='未知'?asset.cost:'';
  const details=[asset.provider&&asset.provider!=='平台待补充'?tr('平台：{value}',{value:asset.provider}):'',cost&&tr('费用：{value}',{value:cost}),asset.account&&tr('账号：{value}',{value:asset.account}),asset.project&&tr('项目：{value}',{value:asset.project})].filter(Boolean).join('\n');
  lines.push('BEGIN:VEVENT',`UID:${icsText(asset.id)}@assetboard.local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${icsDate(asset.date)}`,`DTEND;VALUE=DATE:${icsDate(isoDay(dayNumber(asset.date)+1))}`,`SUMMARY:${icsText(dateStatusWords[kind][4](asset.name))}`);
  if(months)lines.push(`RRULE:FREQ=MONTHLY;INTERVAL=${months}`);
  if(details)lines.push(`DESCRIPTION:${icsText(details)}`);
  if(/^https?:\/\//.test(asset.url||'')&&!/\/\/example\.com/.test(asset.url))lines.push(`URL:${asset.url}`);
  lines.push('TRANSP:TRANSPARENT');
  for(const lead of reminderLeads(asset))lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${icsText(`${asset.name} ${dateWhen(kind,lead)}`)}`,`TRIGGER:-P${lead>1?lead-1+'D':''}T15H`,'END:VALARM');
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.map(icsFold).join('\r\n')+'\r\n';
}

// 交接清单: one self-contained page someone else can follow without the app — what exists, where it lives, what it costs, when it
// is due and how it is paid. Optional masking hides names, accounts and addresses the same way privacy mode does.
function escHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function handoverHtml(board,{now=new Date(),mask=false,types={},order=[],owner=''}={}){
 const assets=(board?.assets||[]).filter(asset=>!asset.hiddenAt),veilName=text=>mask&&text?maskName(text):text||'',veilAccount=text=>mask&&text?(String(text).includes('@')?maskEmail(text):maskName(text)):text||'';
 const ids=[...new Set([...order,...assets.map(asset=>asset.type)])].filter(type=>assets.some(asset=>asset.type===type));
 const day=isoDay(localDay(now)),money=new Map();
 for(const asset of assets){const m=costAmount(asset);if(m?.months&&!asset.stopped)money.set(m.currency,(money.get(m.currency)||0)+m.value/m.months);}
 const totals=[...money].map(([currency,value])=>tr('{money} / 月',{money:formatMoney(value,currency)})).join(' + ');
 const card=asset=>{
  const status=assetDateStatus(asset,now),link=/^https?:\/\//.test(asset.url||'')&&!/\/\/example\.com/.test(asset.url)?asset.url:'';
  const linked=linkedAssets(board.assets||[],asset).filter(other=>!other.hiddenAt).map(other=>tr('{label}：{value}',{label:escHtml(linkKind(asset,other).label),value:escHtml(veilName(other.type==='bankcard'&&other.last4?`${other.name} •••• ${other.last4}`:other.name))}));
  const ips=assetIps(asset).map(x=>mask?maskIp(x.ip):x.ip);
  const kindLabel=(dateKinds[asset.dateKind]||dateKinds.expire).label,when=billingCycles[asset.cycle]?tr('{a}，{b}',{a:kindLabel,b:billingCycles[asset.cycle].label}):kindLabel;
  const rows=[[tr('平台'),asset.provider==='平台待补充'?'':asset.provider],[tr('账号'),veilAccount(asset.account)],[tr('项目'),asset.project],[tr('下一日期'),status.level==='none'?'':tr('{date}（{what}）',{date:status.date,what:when})],[tr('费用'),asset.cost&&asset.cost!=='未知'?asset.cost:''],[tr('地址'),ips.join('  ')],['SSH',asset.host?`${asset.sshUser?asset.sshUser+'@':''}${mask?maskName(asset.host):asset.host}${asset.sshPort?':'+asset.sshPort:''}`:''],[tr('卡'),[asset.last4?`${asset.network||''} •••• ${asset.last4}`.trim():'',CARD_STATUSES[asset.cardStatus]||''].filter(Boolean).join(tr('，'))],[tr('重要程度'),IMPORTANCE[asset.importance]||''],[tr('用途'),asset.purpose&&asset.purpose!==types[asset.type]?asset.purpose:''],[tr('找回'),recoveryText(asset)],[tr('备份'),backupText(asset)],[tr('保留原因'),asset.reason],[tr('状态'),asset.stopped?tr('已停用'):'']].filter(([,v])=>v);
  return `<article><h3>${escHtml(veilName(asset.name))}</h3><dl>${rows.map(([k,v])=>`<dt>${k}</dt><dd>${escHtml(v)}</dd>`).join('')}${link?`<dt>${tr('管理')}</dt><dd><a href="${escHtml(link)}">${escHtml(link)}</a></dd>`:''}${linked.length?`<dt>${tr('关联')}</dt><dd>${linked.join('<br>')}</dd>`:''}</dl>${asset.notes?`<p class="notes">${escHtml(asset.notes)}</p>`:''}</article>`;
 };
 const due=upcomingEvents(assets,now,90);
 return `<!doctype html><html lang="${trLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${tr('资产交接清单 {day}',{day})}</title><style>
:root{color-scheme:light dark;--ink:#1f2a24;--muted:#66736b;--line:#dfe7e2;--paper:#fbfdfb;--accent:#2f7d68}
@media(prefers-color-scheme:dark){:root{--ink:#e6eee9;--muted:#9aa8a0;--line:#2c3631;--paper:#141a17;--accent:#6cc3a6}}
body{margin:0 auto;max-width:860px;padding:40px 20px 80px;background:var(--paper);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif}
h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}h3{font-size:15px;margin:0 0 6px}
.lead{color:var(--muted);margin:0 0 20px}.summary{display:flex;gap:28px;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--line);border-radius:12px}
.summary b{display:block;font-size:18px}.summary span{color:var(--muted);font-size:13px}
article{padding:14px 16px;border:1px solid var(--line);border-radius:12px;margin:10px 0;break-inside:avoid}
dl{display:grid;grid-template-columns:88px 1fr;gap:2px 12px;margin:0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.notes{white-space:pre-wrap;margin:8px 0 0;color:var(--muted)}a{color:var(--accent)}ol{padding-left:20px}li{margin:4px 0}
.due{color:var(--muted)}@media print{body{padding:0}article{border-color:#ccc}}
</style></head><body><h1>${tr('资产交接清单')}</h1><p class="lead">${owner?escHtml(owner)+' · ':''}${tr('由 Assetboard 生成于 {day}',{day})}${mask?' · '+tr('名称和账号已遮挡'):''}${tr('。这里只有记录，没有密码；登录方式请按各项的账号去找。')}</p>
<div class="summary"><div><b>${assets.length}</b><span>${tr('项资产')}</span></div>${totals?`<div><b>${escHtml(totals)}</b><span>${tr('周期费用')}</span></div>`:''}<div><b>${due.length}</b><span>${tr('项 90 天内到期或扣款')}</span></div></div>
${due.length?`<h2>${tr('最先要处理的')}</h2><ol>${due.map(({asset,status})=>`<li>${escHtml(veilName(asset.name))} <span class="due">· ${escHtml(status.label)}${asset.cost&&asset.cost!=='未知'?' · '+escHtml(asset.cost):''}</span></li>`).join('')}</ol>`:''}
${ids.map(type=>`<h2>${escHtml(types[type]||type)}</h2>${assets.filter(asset=>asset.type===type).sort((left,right)=>IMPORTANCE_RANK(left)-IMPORTANCE_RANK(right)).map(card).join('')}`).join('\n')}
</body></html>`;
}

// RDAP (the registries' JSON successor to WHOIS): the expiry date and registrar of a domain, read from what the registry returned, and
// the lifecycle phase when the domain is past expiry (RFC 8056 status names).
const RDAP_PHASES={'auto renew period':'autoRenew','redemption period':'redemption','pending restore':'pendingRestore','pending delete':'pendingDelete'};
const rdapPhaseLabels={autoRenew:tr('自动续费宽限期'),redemption:tr('赎回期'),pendingRestore:tr('正在赎回'),pendingDelete:tr('待删除')};
function rdapFacts(json){
 if(!json||typeof json!=='object')return {expires:'',registrar:'',phase:''};
 const event=(json.events||[]).find(item=>String(item?.eventAction||'').toLowerCase()==='expiration'),time=Date.parse(event?.eventDate||'');
 const registrarEntity=(json.entities||[]).find(item=>(item?.roles||[]).includes('registrar')),card=registrarEntity?.vcardArray?.[1]||[];
 const fn=card.find(entry=>entry?.[0]==='fn')?.[3];
 const statuses=(Array.isArray(json.status)?json.status:[]).map(item=>String(item||'').toLowerCase().trim());
 const phase=['pendingDelete','pendingRestore','redemption','autoRenew'].find(key=>statuses.some(item=>RDAP_PHASES[item]===key))||'';
 return {expires:Number.isNaN(time)?'':new Date(time).toISOString().slice(0,10),registrar:typeof fn==='string'?fn.slice(0,80):'',phase};
}
// The registry date against the stored one, for a domain; a recurring record compares by its next due date. Past expiry the registry
// date says nothing about a renewal: gTLD registries add a year the day after expiry and take it back if the registrar does not renew
// within the 45-day auto-renew grace, so a domain in a lifecycle phase is reported as such instead of as a newer date.
// A lifecycle phase read from the registry, while it is recent enough to mean something (the auto-renew grace is 45 days).
function registryPhaseOf(asset,now=new Date()){
 const phase=asset?.registryPhase,time=Date.parse(asset?.registryCheckedAt||'');
 return rdapPhaseLabels[phase]&&!Number.isNaN(time)&&localDay(now)-localDay(new Date(time))<=CONFIRM_DAYS?phase:'';
}
function rdapCompare(asset,facts,now=new Date()){
 if(facts?.phase)return {state:'phase',phase:facts.phase,registry:facts.expires||''};
 if(!facts?.expires)return {state:'unknown'};
 const stored=dayNumber(asset?.date)===null?'':billingCycles[asset.cycle]?nextOccurrence(asset.date,asset.cycle,localDay(now)):asset.date;
 if(!stored)return {state:'missing',registry:facts.expires};
 return stored===facts.expires?{state:'same',registry:facts.expires}:{state:'differs',registry:facts.expires,stored};
}

if(typeof module!=='undefined')module.exports={LEGACY_WORDS,LEGACY_STATES,MFA_KINDS,RECOVERY_TYPES,RECOVERY_FIELDS,BACKUP_KINDS,BACKUP_TYPES,IMPORTANCE,looksLikeSecret,recoveryText,recoveryGap,backupText,mailHost,mailDependents,selfRecovery,mailStake,PHONE_STATUSES,phoneTrouble,carrierNote,cardPaysPhone,setCardPays,CREDIT_RULES,creditRule,settleCreditExpiry,PLATFORM_SOURCES,missedReminders,reminderDays,STALE_SYNC_DAYS,staleSyncs,AUTO_RENEW_WORDS,CARD_STATUSES,cardTrouble,sourceTrouble,IMPACT_WORDS,verifyNumbers,phoneReach,phoneStake,syncedLabel,BILLING_TYPES,billingLabels,isFreeCost,billingTypeOf,validPromotion,moneyOn,settlePromotions,noteCostChange,costForecast,PAYMENT_LIMIT,CONFIRM_DAYS,paymentList,paidPayments,lastPayment,recordPayment,removePayment,occurrencesBetween,pendingCharges,pendingRenewals,confirmRenewal,cardOutlook,runsOut,needsConfirm,confirmWords,LIFECYCLE_RULES,lifecycleRule,lifecycleOf,AFTER_DUE_DAYS,monthsBetween,renewBase,canRenew,renewOptions,costFromPayment,renewAsset,confirmCharge,priceChange,paidTotals,ledgerRows,csvCell,ledgerCsv,cleanProject,projectNames,projectAssets,shutdownPlan,REVIEW_QUIET_DAYS,reviewQueue,icsFold,calendarIcs,escHtml,handoverHtml,rdapFacts,rdapCompare,rdapPhaseLabels,registryPhaseOf,maskName,PROVIDER_PRESETS,providerPresets,MAIN_CURRENCIES,FALLBACK_RATES,costAmount,syncMoney,convertMoney,formatMoney,costTotals,MOUNT_TYPES,relationKind,linkAllowed,LINK_KINDS,LINK_KIND_ORDER,linkKind,linkRisks,linkImpact,serverChain,serverChainCount,linkRelation,linkMetaOf,setLinkMeta,serverTone,peekSet,dropLinkMeta,IP_LIMIT,normalizeIp,parseIps,assetIps,primaryIp,maskIp,validIpList,ACTION_FIELDS,QUICK_LIMIT,validActionField,sshCommand,cloneUrl,quickActions,recencyTime,recentFirst,arrangeAssets,touchedPrefix,bringToFront,DISPLAY_LIMITS,formatCount,ensureBlock,iconHost,iconVendor,iconVendors,vendorForHost,iconPlan,iconSiteHost,iconSiteFor,iconPlatformOf,iconRows,guessAssetType,regionList,regionName,regionFlag,phoneParts,regionFromPhone,maskPhone,maskEmail,cardExpiry,expiryText,looksLikeCardNumber,linkAssets,unlinkAssets,linkedAssets,removeLinksTo,assetFingerprint,removeUntouchedDemo,orderAssets,moveAsset,dateKinds,billingCycles,dayNumber,localDay,isoDay,addMonths,nextOccurrence,assetDateStatus,upcomingEvents,REMINDER_LIMIT,reminderLeads,reminderPlan,syncKey,assetSyncKey,isBlacklisted,findByExternal,findNameCollision,mergeCloudflare,mergeGitHub,applyCollision,parseSender,registrableDomain,cleanMerchant,findAmounts,findDates,findDomains,evidenceFacts,inferCycle,formatCost,matchAsset,buildCandidates,evidencePayload,parseAiItems,applyAiItem,IMPORT_ROW_LIMIT,parseLooseDate,shiftDate,costParts,formatCostParts,inferTypeFromName,parseQuickLine,AGENT_FIELDS,isAgentImport,parseAgentImport,parseDelimitedText,importHeaderField,rowsToImportItems,isCfsmBackup,parseCfsmBackup,classifyImportPayload,planImport,applyImport,parseBoardBackup,planBoardBackup,applyBoardBackup,demoImportSampleCsv,csvSyncKey,VENDOR_CSV_PRESETS,cloudflareTokenTemplateUrl,githubTokenTemplateUrl,CLOUDFLARE_TOKEN_PERMISSIONS,parseSshConfig,mergeSshConfig,parseEml};
