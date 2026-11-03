// Pro: the agent interface (assetboard-cli / MCP) for site icons and the Cloudflare sync. The methods join app.js's agentMethods
// through proSlots.agentMethods and answer at once; what takes time (fetching icons, a sync) answers fetching / syncing and is
// looked up afterwards with the list and status methods. 实时状态 (probe sources, SSH 直读) has no method here: its readings, its
// sources and its hosts are the app's own, not for AI tools. Credentials never pass here: no method takes a user name, password,
// token or session, and none returns one. Letting a sync add back what was deleted waits for the person (agentRequestConfirm in
// app.js). What is board data (a platform's icon site, icons, the sync blocklist) undoes with ⌘Z.
// Loaded after probe-ssh-pro.js and before app.js; with ?free it registers nothing.

const AGENT_SECRET_KEYS=['username','user','password','pass','token','apiToken','jwt','session','cookie','login','credential','credentials','secret','key'];
function agentNoSecrets(params){
 const asked=Object.keys(params||{}).filter(k=>AGENT_SECRET_KEYS.includes(k)||/password|token|secret|session|cookie|jwt/i.test(k));
 if(asked.length)throw new Error(tr('账号、密码和令牌只能在 Assetboard 里填写，不经过外部工具'));
}
const agentIso=ms=>ms?new Date(ms).toISOString():null;

// ---- 网站图标 ---------------------------------------------------------------------------------------------------------------------
// One fetch at a time from outside: per platform one request (three at once, like 获取网站图标), applied together in one undo step.
const AGENT_ICON_JOB_BASE=3e9;let agentIconJobSequence=AGENT_ICON_JOB_BASE,agentIconJob=null;
function agentIconJobSummary(job=agentIconJob){
 if(!job)return null;
 return {jobId:job.id,status:job.status,startedAt:job.startedAt,...(job.finishedAt?{finishedAt:job.finishedAt,applied:job.applied}:{}),
  platforms:[...job.platforms.values()].map(p=>({platform:p.host,site:p.site,assets:p.ids.length,state:p.state,...(p.error?{error:p.error}:{})}))};
}
function agentIconPump(){
 const job=agentIconJob;if(!job||job.status!=='fetching')return;
 while(job.pending.size<ICON_BATCH_LIMIT&&job.queue.length){
  const p=job.queue.shift(),requestId=++agentIconJobSequence;
  job.pending.set(requestId,{host:p.host,timer:setTimeout(()=>agentIconTake({requestId,ok:false,error:'超时'}),ICON_BATCH_TIMEOUT)});
  iconFetchPost(requestId,p.site);
 }
 if(!job.pending.size&&!job.queue.length)agentIconFinish();
}
// A reply for this job (true), or someone else's (false).
function agentIconTake(result){
 const job=agentIconJob,entry=job?.pending.get(result?.requestId);if(!entry)return false;
 clearTimeout(entry.timer);job.pending.delete(result.requestId);
 const p=job.platforms.get(entry.host),src=result.ok&&siteIconSrc({siteIcon:result.dataUrl});
 if(src){p.state='done';p.src=src;iconFailures.delete(p.host);}else{p.state='failed';p.error=iconFailReason(result.error);iconFailures.set(p.host,p.error);}
 agentIconPump();return true;
}
function agentIconFinish(){
 const job=agentIconJob,touched=[];
 for(const p of job.platforms.values()){if(!p.src)continue;for(const id of p.ids){const a=state.assets.find(x=>x.id===id);if(a&&!customIconSrc(a)&&(job.overwrite||!a.siteIcon)&&a.siteIcon!==p.src)touched.push([a,p]);}}
 if(touched.length){checkpoint();for(const [a,p] of touched){a.siteIcon=p.src;a.siteIconHost=p.site;}save();render();if(activeAsset&&touched.some(([a])=>a.id===activeAsset))showDetail(activeAsset,{focus:false});toast(tr('外部工具为 {n} 项配上了图标',{n:formatCount(touched.length)}),true);}
 job.applied=touched.length;job.finishedAt=new Date().toISOString();
 job.status=[...job.platforms.values()].some(p=>p.state==='done')||!job.platforms.size?'done':'failed';
}

// ---- Cloudflare 同步 --------------------------------------------------------------------------------------------------------------
let agentCloudflareLast=null;
// What a failed sync said, without anything that looks like a key.
const agentCleanError=text=>String(text||tr('同步失败')).replace(/[A-Za-z0-9_\-]{24,}/g,'…').slice(0,160);
const AGENT_SYNC_KEY=/^(cloudflare|github|ssh|csv):/;
function agentSyncItem(key){
 const [source,...rest]=key.split(':');
 return source==='cloudflare'?{key,source,kind:rest[0],externalId:rest.slice(1).join(':')}:{key,source,externalId:rest.join(':')};
}
// The record id a deleted synced record also left behind (asset-data.js blocks a sync by either).
function agentSyncRowId(item){return item.source==='cloudflare'?`cloudflare-${item.kind}-${item.externalId}`:item.source==='github'?`github-repo-${item.externalId}`:item.source==='ssh'?`ssh-host-${item.externalId}`:'';}

proRegister(()=>{
 Object.assign(proSlots.agentConfirms,{
  syncUnblock:{title:n=>n===1?tr('允许同步加回这一项？'):tr('允许同步加回 {n} 项？',{n:formatCount(n)}),label:t=>tr('同步时加回 {name}',{name:t.name}),
   note:tr('这些是你删除过的同步项，现在同步会跳过它们。允许后，下次同步会把它们加回来（可用 ⌘Z 撤销这次允许）。'),
   apply:t=>{const list=state.deletedExternalIds||[];if(!list.includes(t.id))return tr('已不在跳过列表里');const row=agentSyncRowId(agentSyncItem(t.id));
    checkpoint();state.deletedExternalIds=list.filter(k=>k!==t.id&&k!==row);save();render();return '';}}
 });
 Object.assign(proSlots.agentMethods,{
  // 网站图标
  iconPlatforms:()=>{
   const rows=iconRows(state.assets.filter(agentSees),{sites:iconSites()}),busy=new Set([...agentIconJob?.pending.values()||[]].map(p=>p.host));
   return {autoIcons:state.autoIcons!==false,platforms:rows.map(r=>({platform:r.host,site:r.site,customSite:!!r.custom,assets:r.ids.length,assetIds:r.ids,withIcon:r.have.length,
    ...(busy.has(r.host)?{fetching:true}:{}),...(iconFailures.get(r.host)?{lastError:iconFailures.get(r.host)}:{})})),lastFetch:agentIconJobSummary()};
  },
  iconSite:({platform,site=null})=>{
   const host=String(platform||'').trim().toLowerCase(),rows=iconRows(state.assets,{sites:iconSites()});
   if(!rows.some(r=>r.host===host)&&!Object.hasOwn(iconSites(),host))throw new Error(tr('没有这个平台；用 list_icon_platforms 查看'));
   const sites={...iconSites()};
   if(site===null||site===''){if(!Object.hasOwn(sites,host))return {platform:host,site:host,customSite:false,status:'unchanged'};delete sites[host];}
   else{const own=typeof site==='string'?iconSiteHost(site):'';if(!own)throw new Error(tr('site 只接受 https 网址或域名，不接受 IP、本机名称或带账号的链接'));if(own===host)delete sites[host];else sites[host]=own;}
   checkpoint();if(Object.keys(sites).length)state.iconSites=sites;else delete state.iconSites;iconFailures.delete(host);save();render();
   toast(tr('外部工具把 {host} 的图标官网设为 {site}',{host,site:iconSiteFor(sites,host)}),true);
   return {platform:host,site:iconSiteFor(sites,host),customSite:iconSiteFor(sites,host)!==host,message:tr('图标还没换；用 fetch_icons 获取')};
  },
  iconFetch:({platform='',assetIds=null,overwrite=false}={})=>{
   if(!nativeStore)throw new Error(tr('网站图标只能在 Mac App 里获取'));
   if(agentIconJob?.status==='fetching')return {...agentIconJobSummary(),message:tr('上一次获取还在进行')};
   if(iconBatch||iconRowRequests.size)throw new Error(tr('「获取网站图标」窗口正在获取，稍后再试'));
   if(assetIds!=null&&(!Array.isArray(assetIds)||!assetIds.length||assetIds.length>AGENT_LIMIT||assetIds.some(id=>typeof id!=='string')))throw new Error(tr('assetIds 需要是资产 id 数组（最多 {n} 个）',{n:AGENT_LIMIT}));
   const rows=iconRows(state.assets.filter(agentSees),{sites:iconSites()}),want=assetIds&&new Set(assetIds),host=String(platform||'').trim().toLowerCase();
   if(host&&!rows.some(r=>r.host===host))throw new Error(tr('没有这个平台；用 list_icon_platforms 查看'));
   const notRecognized=want?assetIds.filter(id=>!rows.some(r=>r.ids.includes(id))):[];
   const cache=overwrite?new Map():knownSiteIcons(),platforms=new Map();
   for(const r of rows){
    if(host&&r.host!==host)continue;
    const ids=r.ids.filter(id=>(!want||want.has(id))&&(overwrite||!state.assets.find(a=>a.id===id)?.siteIcon));if(!ids.length)continue;
    platforms.set(r.host,{host:r.host,site:r.site,ids,state:cache.has(r.host)?'done':'fetching',...(cache.has(r.host)?{src:cache.get(r.host)}:{})});
   }
   agentIconJob={id:'icons-'+crypto.randomUUID(),status:'fetching',startedAt:new Date().toISOString(),overwrite:!!overwrite,platforms,pending:new Map(),queue:[...platforms.values()].filter(p=>p.state==='fetching')};
   agentIconPump();
   return {...agentIconJobSummary(),...(notRecognized.length?{notRecognized}:{}),...(platforms.size?{}:{message:tr('没有需要获取图标的资产')})};
  },
  // Cloudflare 同步
  cloudflareStatus:()=>{
   const synced=state.assets.filter(a=>a.source==='cloudflare'),last=lastCloudflareSync(),byKind={};
   for(const a of synced){const k=a.resourceKind||'zone';byKind[k]=(byKind[k]||0)+1;}
   return {connected:!!nativeStore?.cloudflareConnected,syncing:!!cloudflareAuto,lastSyncAt:agentIso(last),autoEveryHours:CLOUDFLARE_REFRESH_MS/3600000,assets:{total:synced.length,byKind},lastResult:agentCloudflareLast};
  },
  cloudflareSync:(params={})=>{
   agentNoSecrets(params);
   if(!nativeStore)throw new Error(tr('Cloudflare 同步只在 Mac App 里可用'));
   if(!nativeStore.cloudflareConnected)throw new Error(tr('还没有连接 Cloudflare：令牌只能在 Assetboard 的「文件 → 同步 Cloudflare…」里填写'));
   if(cloudflareAuto)return {status:'syncing',already:true};
   cloudflareAuto=true;cloudflareAutoTried=Date.now();agentCloudflareLast={...agentCloudflareLast,startedAt:new Date().toISOString(),pending:true};
   window.webkit.messageHandlers.assetboard.postMessage({action:'cloudflareSync',token:''});
   return {status:'syncing',message:tr('已开始同步；用 get_cloudflare_sync_status 查看结果')};
  },
  syncBlocklist:()=>{const items=(state.deletedExternalIds||[]).filter(k=>typeof k==='string'&&AGENT_SYNC_KEY.test(k)).map(agentSyncItem);return {total:items.length,items};},
  syncUnblock:({key,reason=''})=>{
   if(typeof key!=='string'||!AGENT_SYNC_KEY.test(key)||!(state.deletedExternalIds||[]).includes(key))throw new Error(tr('跳过列表里没有这一项；用 list_sync_blocklist 查看'));
   return agentRequestConfirm('syncUnblock',[{id:key,name:key}],reason);
  }
 });
 // Replies this file waits for: an icon of its fetch, and how a sync it started (or any) ended.
 window.addEventListener('DOMContentLoaded',()=>{
  const icon=window.assetboardIconResult;window.assetboardIconResult=r=>{if(!agentIconTake(r))icon(r);};
  const cloudflare=window.assetboardCloudflareResult;window.assetboardCloudflareResult=r=>{
   const before=state.assets.length;cloudflare(r);
   agentCloudflareLast={at:new Date().toISOString(),ok:!!r?.ok&&!r?.disconnected,...(r?.ok&&!r?.disconnected?{added:Math.max(0,state.assets.length-before)}:{}),...(r?.ok?{}:{error:agentCleanError(r?.error)}),...(r?.disconnected?{disconnected:true}:{})};
  };
 });
});
