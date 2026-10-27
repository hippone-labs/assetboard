// Pro: the agent interface (assetboard-cli / MCP) for the probe sources, SSH 直读, site icons and the Cloudflare sync. The methods join
// app.js's agentMethods through proSlots.agentMethods and answer at once; what takes time (reading a panel, an ssh run, fetching
// icons, a sync) answers checking / refreshing / fetching / syncing and is looked up afterwards with the list and status methods.
// Credentials never pass here: no method takes a user name, password, token or session, none returns one, and errors are fixed words
// rather than what a panel or ssh said (an ssh error line can name the host, the address or the user). Asking to remove a probe
// source, to turn on SSH 直读 for a host (the app then connects with the person's own keys) or to let a sync add back what was deleted
// waits for the person (agentRequestConfirm in app.js). Settings kept on the Mac (probe sources, SSH 直读 switches and interval) are
// outside undo; what is board data (hand links to probes, a platform's icon site, icons, the sync blocklist) undoes with ⌘Z.
// Loaded after probe-ssh-pro.js and before app.js; with ?free it registers nothing.

const AGENT_SECRET_KEYS=['username','user','password','pass','token','apiToken','jwt','session','cookie','login','credential','credentials','secret','key'];
function agentNoSecrets(params){
 const asked=Object.keys(params||{}).filter(k=>AGENT_SECRET_KEYS.includes(k)||/password|token|secret|session|cookie|jwt/i.test(k));
 if(asked.length)throw new Error(tr('账号、密码和令牌只能在 Assetboard 里填写，不经过外部工具'));
}
// Links are matched again first: an undo restores the board without telling the probe code.
function agentNeedsProbe(){if(!probeOn()||demoMode)throw new Error(tr('探针数据源只在 Mac App 里可用'));probeRelink();}
function agentNeedsSsh(){if(!sshOn()||demoMode)throw new Error(tr('SSH 直读只在 Mac App 里可用'));probeRelink();}
const agentIso=ms=>ms?new Date(ms).toISOString():null;
const agentPct=p=>p&&p.total>0?Math.round(p.used/p.total*100):null;

// ---- 探针数据源 ----------------------------------------------------------------------------------------------------------------
// A source's state in words that hold no panel answer: ok, loading, unread, needsLogin (not public: the account is filled in the app),
// badLogin, humanCheck (Turnstile) or error.
function agentProbeSourceState(s){
 const st=probe.state.get(s.id)||{};
 if(st.loading)return {status:'loading'};
 if(st.error){
  const kind=probeData.probeErrorKind(st.status,st.reason);
  if(probeData.probeNeedsAccount(st.status,st.reason))return {status:'needsLogin',message:tr('面板不公开：账号只能在 Assetboard 的「探针数据源」里填写')};
  if(kind==='credentials')return {status:'badLogin',message:tr('面板账号不对：请在 Assetboard 的「探针数据源」里改')};
  if(kind==='turnstile')return {status:'humanCheck',message:probeData.PROBE_ERROR_WORDS.turnstile};
  return {status:'error',message:st.status?tr('读取失败（HTTP {status}）',{status:st.status}):tr('读取失败')};
 }
 return {status:st.at?'ok':'unread'};
}
function agentProbeSource(s){
 const st=probe.state.get(s.id)||{},linked=[...probe.links.values()].filter(x=>x.source===s.id).length;
 return {id:s.id,name:s.name,kind:s.kind,kindName:probeData.PROBE_KINDS[s.kind]?.name||s.kind,url:s.url,hasLogin:!!s.hasLogin,...agentProbeSourceState(s),
  servers:st.servers?.length||0,linked,updatedAt:agentIso(st.at),live:probe.live.get(s.id)?.state==='open'};
}
function agentProbeFind(id){const s=probe.sources.find(x=>x.id===id);if(!s)throw new Error(tr('找不到探针数据源 {id}',{id:String(id).slice(0,64)}));return s;}
function agentProbeName(raw){
 if(raw===undefined||raw===null)return '';
 if(typeof raw!=='string'||raw.trim().length>60)throw new Error(tr('name 需要是文字，最多 60 字'));
 return raw.trim();
}
// Every server the sources read (panels first, then SSH 直读), with the card it shows on.
function agentProbeServers(){
 const byKey=new Map([...probe.links].map(([assetId,x])=>[x.key,{assetId,how:x.how}]));
 const list=[];
 for(const s of probe.sources)for(const server of probe.state.get(s.id)?.servers||[])list.push({source:s.id,server});
 for(const lane of probe.lanes)for(const server of lane.servers())list.push({source:lane.id,server});
 return list.map(({source,server})=>{const link=byKey.get(source+'\u0000'+server.id),a=link&&state.assets.find(x=>x.id===link.assetId);
  return {source,sourceName:probeSourceName(source),serverId:String(server.id),name:server.name,online:!!server.online,lastSeen:agentIso(server.lastSeen),
   ...(a?{linkedAssetId:a.id,linkedAssetName:a.name,how:link.how}:{})};});
}
// A link as asked from outside: {source, serverId} (a server one of the sources has read), "none" (keep the card out of matching),
// "auto" or null (back to automatic matching). Only server cards take one, and a server linked by hand to another card is refused.
function agentProbeLinkValue(raw,a){
 if(a.type!=='server')throw new Error(tr('只有服务器可以关联探针'));
 if(raw===null||raw==='auto'||raw==='')return null;
 if(raw==='none')return {none:true};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.source!=='string'||raw.serverId==null)throw new Error(tr('probeLink 需要是 {source, serverId}、"none" 或 "auto"'));
 const serverId=String(raw.serverId);
 if(!agentProbeServers().some(x=>x.source===raw.source&&x.serverId===serverId))throw new Error(tr('探针里没有这台服务器；用 list_probe_servers 查看'));
 const other=state.assets.find(x=>x.id!==a.id&&x.probeLink?.source===raw.source&&String(x.probeLink?.id)===serverId);
 if(other)throw new Error(tr('这台探针服务器已手动关联到「{name}」',{name:other.name}));
 return {source:raw.source,id:serverId};
}
// After a link changes: match again, and read the history of a newly linked panel server.
function agentProbeLinked(a){probeRelink();const x=probeOf(a);if(x&&!probeHistoryOf(x)&&probe.sources.some(s=>s.id===x.source))setTimeout(()=>probeAskHistory(x.source),0);}
function agentServerMetrics(a){
 const x=probeOf(a);
 if(!x)return {assetId:a.id,name:a.name,linked:false,probeLink:a.probeLink?.none?'none':'auto',message:a.probeLink?.none?tr('这台服务器设为不关联探针'):tr('没有对上任何探针服务器')};
 const s=x.server,h=probeHistoryOf(x),stats=list=>{if(!list||list.length<2)return null;const vs=list.map(p=>p.v);return {avg:Math.round(vs.reduce((m,v)=>m+v,0)/vs.length),max:Math.round(Math.max(...vs)),points:vs.length};};
 const lane=probe.lanes.find(l=>l.id===x.source),panel=probe.sources.find(p=>p.id===x.source);
 return {assetId:a.id,name:a.name,linked:true,source:x.source,sourceName:probeSourceName(x.source),serverId:String(s.id),serverName:s.name,how:x.how,
  online:!!s.online,lastSeen:agentIso(s.lastSeen),cpu:s.cpu==null?null:Math.round(s.cpu),
  memory:s.mem?{used:s.mem.used,total:s.mem.total,percent:agentPct(s.mem)}:null,disk:s.disk?{used:s.disk.used,total:s.disk.total,percent:agentPct(s.disk)}:null,
  traffic:s.traffic==null?null:{bytes:s.traffic,limit:s.trafficLimit||null,percent:s.trafficLimit?Math.min(100,Math.round(s.traffic/s.trafficLimit*100)):null},
  ...(s.rate?{rate:{rxPerSec:s.rate.rx,txPerSec:s.rate.tx}}:{}),...(s.uptime!=null?{uptimeSeconds:s.uptime}:{}),...(s.load?{load:s.load}:{}),...(s.cores?{cores:s.cores}:{}),
  history:h?{span:lane?'session':`${probeData.PROBE_HISTORY_HOURS}h`,cpu:stats(h.cpu),memory:stats(h.mem)}:null,
  ...(panel?{sourceStatus:agentProbeSourceState(panel).status}:{}),...(lane?.id==='ssh'?agentSshProblem(sshSession(s.id)):{})};
}

// ---- SSH 直读 ---------------------------------------------------------------------------------------------------------------------
// Why a host could not be read, as a code and fixed words: never ssh's own line, which can name the host, its address or the user.
const AGENT_SSH_WORDS={hostkey:tr('需要确认主机指纹：先在终端里连一次'),auth:tr('需要密码或密钥没加载：先在终端里连一次'),down:tr('连不上'),unsupported:tr('不支持：不是 Linux'),missing:tr('~/.ssh/config 里已没有这个别名'),other:tr('读取失败')};
function agentSshProblem(h){return h?.reason?{problem:h.reason,message:AGENT_SSH_WORDS[h.reason]||AGENT_SSH_WORDS.other}:{};}
function agentSshAliases(){const known=sshProbe.hosts.map(h=>h.name);return [...known,...sshProbe.enabled.filter(a=>!known.some(k=>sshIs(k,a)))];}
function agentSshAlias(alias){
 if(typeof alias!=='string'||!alias.trim())throw new Error(tr('alias 需要是 ~/.ssh/config 里的别名'));
 const found=agentSshAliases().find(a=>sshIs(a,alias.trim()));if(!found)throw new Error(tr('~/.ssh/config 里没有这个别名；用 list_ssh_hosts 查看'));
 return found;
}
function agentSshHost(alias){
 const on=sshEnabled(alias),h=on?sshSession(alias):null,link=[...probe.links].find(([,x])=>x.source==='ssh'&&sshIs(x.server.id,alias)),card=link&&state.assets.find(a=>a.id===link[0]);
 return {alias,enabled:on,manuallyOff:sshProbe.disabled.some(x=>sshIs(x,alias)),inConfig:sshProbe.hosts.some(x=>sshIs(x.name,alias)),
  status:!on?'off':h.reason?'error':h.lastOk?'ok':h.pending?'reading':'waiting',...agentSshProblem(h),lastReadAt:agentIso(h?.lastOk),
  ...(card?{linkedAssetId:card.id,linkedAssetName:card.name}:{})};
}

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
 Object.assign(proSlots.agentFields,{
  probeLink:(raw,a)=>{try{return {value:agentProbeLinkValue(raw,a),after:agentProbeLinked};}catch(error){return {error:error.message};}}
 });
 Object.assign(proSlots.agentConfirms,{
  probeRemove:{title:n=>n===1?tr('删除探针数据源？'):tr('删除 {n} 个探针数据源？',{n:formatCount(n)}),label:t=>tr('删除探针数据源「{name}」',{name:t.name}),
   note:tr('只删除 Assetboard 里的设置和钥匙串里的面板账号，不动面板；手动关联会保留。'),
   apply:t=>{if(!probe.sources.some(s=>s.id===t.id))return tr('数据源已不存在');probeSend({action:'probeRemove',id:t.id});return '';}},
  sshEnable:{title:n=>n===1?tr('开启 SSH 直读？'):tr('开启 {n} 台主机的 SSH 直读？',{n:formatCount(n)}),label:t=>tr('开启 SSH 直读：{alias}',{alias:t.name}),
   note:tr('开启后，Assetboard 用你的 ~/.ssh/config 和密钥连接这台主机，运行一条固定的只读命令。这相当于让外部工具借用你的钥匙连服务器：只在你信任这个请求时允许。'),
   apply:t=>{if(!sshOn())return tr('SSH 直读不可用');if(!sshProbe.hosts.some(h=>sshIs(h.name,t.id)))return tr('~/.ssh/config 里已没有这个别名');sshToggle(t.id,true);return '';}},
  syncUnblock:{title:n=>n===1?tr('允许同步加回这一项？'):tr('允许同步加回 {n} 项？',{n:formatCount(n)}),label:t=>tr('同步时加回 {name}',{name:t.name}),
   note:tr('这些是你删除过的同步项，现在同步会跳过它们。允许后，下次同步会把它们加回来（可用 ⌘Z 撤销这次允许）。'),
   apply:t=>{const list=state.deletedExternalIds||[];if(!list.includes(t.id))return tr('已不在跳过列表里');const row=agentSyncRowId(agentSyncItem(t.id));
    checkpoint();state.deletedExternalIds=list.filter(k=>k!==t.id&&k!==row);save();render();return '';}}
 });
 Object.assign(proSlots.agentMethods,{
  // 探针数据源
  probeSources:()=>{agentNeedsProbe();return {sources:probe.sources.map(agentProbeSource),sshHosts:sshOn()?sshProbe.enabled.length:0};},
  probeSourceAdd:(params)=>{
   agentNoSecrets(params);agentNeedsProbe();
   const url=probeData.probeNormalizeUrl(params.url);if(!url)throw new Error(tr('url 需要是面板地址，例如 status.example.com（http 或 https，不含账号密码）'));
   const name=agentProbeName(params.name),same=probe.sources.find(s=>s.url===url);
   if(same)return {...agentProbeSource(same),alreadyAdded:true};
   if(probe.sources.length>=8)throw new Error(tr('最多 8 个探针数据源'));
   const id=crypto.randomUUID();
   probeSend({action:'probeSave',id,kind:probeData.PROBE_KIND_DEFAULT,name,url});
   return {id,url,...(name?{name}:{}),status:'checking',message:tr('正在读取面板；用 list_probe_sources 查看结果。面板不公开时状态为 needsLogin，账号只能在 Assetboard 里填写')};
  },
  probeSourceUpdate:(params)=>{
   agentNoSecrets(params);agentNeedsProbe();
   const s=agentProbeFind(params.id);
   const url=params.url===undefined?s.url:probeData.probeNormalizeUrl(params.url);if(!url)throw new Error(tr('url 需要是面板地址，例如 status.example.com'));
   if(probe.sources.some(x=>x.id!==s.id&&x.url===url))throw new Error(tr('已有这个地址的数据源'));
   const name=params.name===undefined?s.name:agentProbeName(params.name);
   if(url===s.url&&name===s.name)throw new Error(tr('没有要修改的内容'));
   probeSend({action:'probeSave',id:s.id,kind:s.kind,name,url});
   return {id:s.id,url,name:name||new URL(url).host,status:'checking'};
  },
  probeSourceRemove:({id,reason=''})=>{agentNeedsProbe();const s=agentProbeFind(id);return agentRequestConfirm('probeRemove',[{id:s.id,name:s.name}],reason);},
  probeRefresh:({id=''}={})=>{
   agentNeedsProbe();if(id)agentProbeFind(id);
   probeRefresh(id||null,{manual:true});
   return {status:'refreshing',sources:id?[id]:probe.sources.map(s=>s.id)};
  },
  probeServers:({source='',unmatchedOnly=false}={})=>{
   agentNeedsProbe();
   if(source&&!probe.sources.some(s=>s.id===source)&&!probe.lanes.some(l=>l.id===source))throw new Error(tr('找不到探针数据源 {id}',{id:String(source).slice(0,64)}));
   const list=agentProbeServers().filter(x=>(!source||x.source===source)&&(!unmatchedOnly||!x.linkedAssetId));
   return {total:list.length,servers:list};
  },
  serverMetrics:({assetId})=>{agentNeedsProbe();const a=agentFind(assetId);if(a.type!=='server')throw new Error(tr('只有服务器有探针读数'));return agentServerMetrics(a);},
  probeLink:(params)=>{
   agentNeedsProbe();const a=agentFind(params.assetId);
   const raw=params.mode==='none'||params.mode==='auto'?params.mode:{source:params.source,serverId:params.serverId};
   if(raw.source===undefined&&raw.serverId===undefined&&typeof raw==='object')throw new Error(tr('需要 source + serverId，或 mode 为 none / auto'));
   const value=agentProbeLinkValue(raw,a);
   checkpoint();if(value)a.probeLink=value;else delete a.probeLink;a.updatedAt=new Date().toISOString();
   save();agentProbeLinked(a);render();if(activeAsset===a.id)showDetail(a.id,{focus:false});if(typeof panoOpen!=='undefined'&&panoOpen)panoramaRender();
   toast(value?.none?tr('外部工具取消了「{name}」的探针关联',{name:a.name}):value?tr('外部工具为「{name}」关联了探针',{name:a.name}):tr('外部工具让「{name}」恢复自动匹配探针',{name:a.name}),true);
   return agentServerMetrics(a);
  },
  // SSH 直读
  sshHosts:()=>{
   agentNeedsSsh();
   if(!sshProbe.listed){sshPost({action:'sshProbeList'});return {listed:false,hosts:[],interval:sshProbe.interval,message:tr('正在读取 ~/.ssh/config，稍后再查')};}
   return {listed:true,interval:sshProbe.interval,intervals:probeSshData.SSH_INTERVALS,hosts:agentSshAliases().map(agentSshHost),...(sshProbe.configError?{error:tr('无法读取 ~/.ssh/config')}:{})};
  },
  sshSet:({alias,enabled,reason=''})=>{
   agentNeedsSsh();if(typeof enabled!=='boolean')throw new Error(tr('enabled 需要是 true 或 false'));
   const found=agentSshAlias(alias);
   if(enabled){
    if(sshEnabled(found))return {...agentSshHost(found),status:'unchanged'};
    if(!sshProbe.hosts.some(h=>sshIs(h.name,found)))throw new Error(tr('~/.ssh/config 里已没有这个别名'));
    return agentRequestConfirm('sshEnable',[{id:found,name:found}],reason);
   }
   sshToggle(found,false);
   return {alias:found,enabled:false,manuallyOff:true,status:'off',message:tr('已关闭，并记为手动关闭：自动匹配不会再开启它')};
  },
  sshInterval:({seconds})=>{
   agentNeedsSsh();const s=Number(seconds);
   if(!probeSshData.SSH_INTERVALS.includes(s))throw new Error(tr('seconds 只能是 {list}',{list:probeSshData.SSH_INTERVALS.join(tr('、'))}));
   sshPost({action:'sshProbeInterval',seconds:s});
   return {interval:s,status:'set'};
  },
  sshRefresh:({alias=''}={})=>{
   agentNeedsSsh();
   if(!alias){if(!sshProbe.enabled.length)throw new Error(tr('还没有开启 SSH 直读的主机'));sshPoll(true);return {status:'refreshing',aliases:[...sshProbe.enabled]};}
   const found=agentSshAlias(alias);if(!sshEnabled(found))throw new Error(tr('这台主机没有开启 SSH 直读'));
   const h=sshSession(found);if(!(h.pending&&Date.now()-h.tried<120000)){sshProbe.sessions.set(found,{...h,pending:true,tried:Date.now()});sshPost({action:'sshProbeRun',aliases:[found]});}
   return {status:'refreshing',aliases:[found]};
  },
  // 网站图标
  iconPlatforms:()=>{
   const rows=iconRows(state.assets,{sites:iconSites()}),busy=new Set([...agentIconJob?.pending.values()||[]].map(p=>p.host));
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
   const rows=iconRows(state.assets,{sites:iconSites()}),want=assetIds&&new Set(assetIds),host=String(platform||'').trim().toLowerCase();
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
