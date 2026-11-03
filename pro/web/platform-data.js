// Pro: 平台状态 (part of 实时状态), the pure part: the platforms, which tokens can do more than read, what each state means, the one
// line a record shows, and which platform item is which record. No DOM, no bridge: pro/web/platform-pro.js draws, the tests read
// this file directly. The Mac app (desktop/PlatformStatus.swift) reads the platform and hands over items already cut down to
// {id, name, kind, state, region?, detail?, deploy?, plan?, expires?}, all strings.
// Node (the tests) has no i18n.js loaded before this file: take its tr(), which answers in Chinese.
if(typeof module!=='undefined'&&typeof tr==='undefined')globalThis.tr=require('../../i18n.js').tr;
(function(root){
 // readOnly: the platform offers a token that can only read (Supabase scoped tokens, Upstash Read Only keys). wide: what a token
 // without that limit can do, said before it is kept. interval: the default reading interval in seconds (the person can change it).
 const PLATFORM_KINDS={
  supabase:{name:'Supabase',readOnly:true,tokenUrl:'https://supabase.com/dashboard/account/tokens',interval:300,
   help:tr('新建细粒度令牌：只勾选要看的项目，Projects 选 Read'),wide:tr('这不是细粒度令牌（不以 sbp_fc 开头），它有整个 Supabase 账号的权限，能修改和删除项目。')},
  vercel:{name:'Vercel',readOnly:false,tokenUrl:'https://vercel.com/account/tokens',interval:300,
   help:tr('范围选一个团队或项目，并设好到期日'),wide:tr('Vercel 的令牌不能只读：它能部署、修改设置和删除它看得到的项目。')},
  render:{name:'Render',readOnly:false,tokenUrl:'https://dashboard.render.com/u/settings?add-api-key',interval:300,
   help:tr('在账号设置里新建 API key'),wide:tr('Render 的 API key 不能只读：它能管理你所在的全部工作区里的服务和数据库。')},
  upstash:{name:'Upstash',readOnly:true,user:true,tokenUrl:'https://console.upstash.com',interval:600,
   help:tr('在 Account › Developer API 新建 key，权限选 Read Only'),wide:''}
 };
 const PLATFORM_INTERVAL_MIN=60,PLATFORM_INTERVAL_MAX=3600;
 const platformIntervalOk=s=>Number.isInteger(s)&&s>=PLATFORM_INTERVAL_MIN&&s<=PLATFORM_INTERVAL_MAX;
 // The same rule as PlatformKind.wide on the Mac side: Supabase's scoped tokens start with sbp_fc; Vercel and Render tokens can always write.
 function platformWide(kind,secret){
  const def=PLATFORM_KINDS[kind];if(!def)return true;
  if(!def.readOnly)return true;
  return kind==='supabase'?!String(secret||'').trim().startsWith('sbp_fc'):false;
 }

 // Which kinds of record an item can be.
 const ITEM_FITS={'supabase:project':['database','deployment'],'vercel:project':['deployment'],'render:service':['deployment'],'render:postgres':['database'],'render:keyValue':['database'],'upstash:redis':['database']};
 const fitsOf=(kind,item)=>ITEM_FITS[`${kind}:${item?.kind}`]||[];

 // What a state means: [tone, words]. tone red = it is not serving (paused, failed, suspended), amber = on its way or unclear.
 const W=(tone,words)=>[tone,words];
 const SUPABASE={ACTIVE_HEALTHY:W('',tr('运行中')),INACTIVE:W('red',tr('已暂停')),ACTIVE_UNHEALTHY:W('red',tr('运行异常')),COMING_UP:W('amber',tr('启动中')),RESTORING:W('amber',tr('恢复中')),
  UPGRADING:W('amber',tr('升级中')),RESTARTING:W('amber',tr('重启中')),RESIZING:W('amber',tr('调整中')),PAUSING:W('amber',tr('暂停中')),GOING_DOWN:W('amber',tr('关闭中')),
  INIT_FAILED:W('red',tr('创建失败')),RESTORE_FAILED:W('red',tr('恢复失败')),PAUSE_FAILED:W('red',tr('暂停失败')),REMOVED:W('red',tr('已删除')),UNKNOWN:W('amber',tr('状态不明'))};
 const VERCEL={READY:W('',tr('已上线')),ERROR:W('red',tr('部署失败')),BUILDING:W('amber',tr('部署中')),INITIALIZING:W('amber',tr('部署中')),QUEUED:W('amber',tr('排队部署')),
  CANCELED:W('amber',tr('部署已取消')),BLOCKED:W('red',tr('部署被拦下')),DELETED:W('amber',tr('部署已删除')),PAUSED:W('red',tr('已暂停')),NONE:W('',tr('还没有生产部署'))};
 const RENDER_DEPLOY={live:W('',tr('运行中')),build_failed:W('red',tr('部署失败')),update_failed:W('red',tr('部署失败')),pre_deploy_failed:W('red',tr('部署失败')),
  created:W('amber',tr('部署中')),queued:W('amber',tr('部署中')),build_in_progress:W('amber',tr('部署中')),update_in_progress:W('amber',tr('部署中')),pre_deploy_in_progress:W('amber',tr('部署中')),
  deactivated:W('amber',tr('已停用')),canceled:W('amber',tr('部署已取消'))};
 const RENDER_DB={available:W('',tr('可用')),suspended:W('red',tr('已暂停')),unavailable:W('red',tr('不可用')),recovery_failed:W('red',tr('恢复失败')),creating:W('amber',tr('创建中')),
  config_restart:W('amber',tr('重启中')),maintenance_scheduled:W('',tr('可用 · 已排维护')),maintenance_in_progress:W('amber',tr('维护中')),recovery_in_progress:W('amber',tr('恢复中')),
  updating_instance:W('amber',tr('调整中')),unknown:W('amber',tr('状态不明'))};
 const UPSTASH={active:W('',tr('运行中')),suspended:W('red',tr('已停用')),passive:W('amber',tr('休眠'))};
 const SUSPENDERS={billing:tr('因账单暂停'),user:tr('你暂停了它'),admin:tr('被平台暂停'),stuck_crashlooping:tr('反复崩溃，被暂停')};
 function platformState(kind,item){
  const s=String(item?.state||'');
  if(kind==='supabase')return SUPABASE[s]||W('amber',s);
  if(kind==='vercel')return VERCEL[s]||W('amber',s);
  if(kind==='upstash')return UPSTASH[s]||W('amber',s);
  if(kind==='render'){
   if(item.kind==='service'){if(s==='suspended')return W('red',SUSPENDERS[item.detail]||tr('已暂停'));return item.deploy?RENDER_DEPLOY[item.deploy]||W('amber',item.deploy):W('',tr('运行中'));}
   return RENDER_DB[s]||W('amber',s);
  }
  return W('amber',s);
 }
 // The line: the state, and a free Render database's expiry (amber within 7 days, red once past).
 function platformLine(kind,item,now=Date.now()){
  let [tone,words]=platformState(kind,item);
  const parts=[words];
  const end=Date.parse(item?.expires||'');
  if(Number.isFinite(end)){
   const days=Math.ceil((end-now)/86400000),day=new Date(end).toISOString().slice(0,10);
   parts.push(days<0?tr('{date} 已到期',{date:day}):tr('{date} 到期',{date:day}));
   if(days<0)tone='red';else if(days<=7&&tone!=='red')tone='amber';
  }
  const name=PLATFORM_KINDS[kind]?.name||kind;
  return {tone,text:parts.join(' · '),label:tr('{platform}：{state}',{platform:name,state:parts.join('，')})};
 }

 // Matching. A link the person made (asset.platformLink = {source, id}) always wins, and {none:true} keeps a record out. Otherwise
 // an item and a record of a kind it fits pair up when the record's link holds the item's id (a Supabase ref, a Render srv-/dpg- id,
 // a Vercel prj_ id), then when the names are the same (case and spaces ignored). Only a pair that is the only one on both sides is taken.
 const nameKey=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
 function matchPlatformItems(assets,sources){
  const items=[];for(const src of sources||[])for(const item of src.items||[])items.push({source:src.id,kind:src.kind,item,key:src.id+'\u0000'+item.id});
  const byKey=new Map(items.map(x=>[x.key,x])),links=new Map(),claimed=new Set();
  const records=(assets||[]).filter(a=>!a.hiddenAt&&['database','deployment'].includes(a.type));
  for(const a of records){
   const l=a.platformLink;if(!l||l.none||!l.source||l.id==null)continue;
   const x=byKey.get(l.source+'\u0000'+l.id);if(x&&!claimed.has(x.key)){links.set(a.id,{...x,how:'manual'});claimed.add(x.key);}
  }
  const open=records.filter(a=>!a.platformLink&&!links.has(a.id));
  const steps=[
   ['url',(a,x)=>{const url=String(a.url||'').toLowerCase(),id=String(x.item.id||'').toLowerCase();return id.length>=6&&url.includes(id);}],
   ['name',(a,x)=>{const n=nameKey(x.item.name);return !!n&&nameKey(a.name)===n;}]
  ];
  for(const [how,fits] of steps){
   const free=items.filter(x=>!claimed.has(x.key)),cand=open.filter(a=>!links.has(a.id));
   const pairs=[];for(const x of free)for(const a of cand)if(fitsOf(x.kind,x.item).includes(a.type)&&fits(a,x))pairs.push([x,a]);
   for(const [x,a] of pairs){
    if(pairs.filter(p=>p[0]===x).length!==1||pairs.filter(p=>p[1]===a).length!==1)continue;
    links.set(a.id,{...x,how});claimed.add(x.key);
   }
  }
  return {links,unmatched:items.filter(x=>!claimed.has(x.key))};
 }

 const api={PLATFORM_KINDS,PLATFORM_INTERVAL_MIN,PLATFORM_INTERVAL_MAX,platformIntervalOk,platformWide,ITEM_FITS,fitsOf,platformState,platformLine,matchPlatformItems};
 if(typeof module!=='undefined'&&typeof window==='undefined')module.exports=api;else root.platformData=api;
})(typeof window!=='undefined'?window:globalThis);
