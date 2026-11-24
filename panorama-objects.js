// Object panorama: the panorama's second way of drawing, pure derivations (OBJECT-PANORAMA.md). Each visible asset becomes one
// recognisable thing; what it is drawn as comes from its category and the fields it already has, so nothing is stored for it.
// Nothing here touches the DOM, the network or storage; panorama-objects-view.js words and draws what this returns.
//   server       rack (a 1U chassis, in the cloud) or tower (a machine at home or in the office)
//   domain       plate, hung under its registrar: a cloud for Cloudflare, a named rail for any other, a dashed rail for none
//   subscription ticket    ai  pass (on a lanyard)    license  deed    bankcard  card    phone  sim
//   appleid      passport  google  key    database  drum    storage  bucket    deployment  container    repository  folder
//   device       mac (this Mac's record carries the 正在做 screen; other devices sit beside it)
// State is the registered one (expiry, a manual stop) plus, where the caller has one, the record's 实时状态 reading: this file is
// handed readings, it never asks for them.
(function(){
 const D=typeof module!=='undefined'&&module.exports?require('./asset-data.js'):window;
 const SHAPES={domain:'plate',repository:'folder',server:'rack',deployment:'container',storage:'bucket',database:'drum',subscription:'ticket',ai:'pass',license:'deed',bankcard:'card',phone:'sim',appleid:'passport',google:'key',device:'mac'};
 // The zones of the scene in drawing order, and the categories each holds (in that order inside it).
 const ZONES=[{key:'desk',types:['device']},{key:'server',types:['server']},{key:'data',types:['database','storage','deployment']},{key:'domain',types:['domain']},{key:'wallet',types:['bankcard','phone']},{key:'id',types:['appleid','google']},{key:'pass',types:['subscription','ai','license']},{key:'repository',types:['repository']}];
 // What a thing can sit on, as the 运行在哪 lens has it: a database on a server or a deployment service, a bucket on a deployment service.
 const HOSTS={database:['server','deployment'],storage:['deployment']};
 // The scene needs room: under this width or height the panorama draws cards. It is tried at each scale in turn, largest first, so
 // a big window gets bigger objects and type instead of empty floor.
 const MIN_W=900,MIN_H=520,TIERS=[1.4,1.25,1.12,1,.86];
 const LOCAL_HOST=/^(localhost|.+\.(local|lan|internal|home\.arpa))$/i,LOCAL_WORDS=/自建|本机|本地|家里|家用|self-?hosted|\bhome\b|homelab|\blocal\b|on-?prem/i;
 // A server is local when it says so (its provider), when every address it has is an inner one, or when its host is a local name.
 function serverPlace(a){
  if(LOCAL_WORDS.test(String(a?.provider||'')))return 'local';
  const ips=D.assetIps(a);if(ips.length)return ips.every(x=>x.inner)?'local':'cloud';
  return LOCAL_HOST.test(String(a?.host||'').trim())?'local':'cloud';
 }
 const objectShape=a=>a?.type==='server'?(serverPlace(a)==='local'?'tower':'rack'):SHAPES[a?.type]||'';
 // Where a domain hangs: its registrar (provider), else its DNS host. key '' = none recorded.
 function domainHome(a){const name=String(a?.provider||a?.dnsHost||'').trim();return {key:name.toLowerCase().replace(/\s+/g,''),name,cloud:/cloudflare/i.test(name)};}
 // tone: red (overdue, or read as down), amber (due within SOON_DAYS, or read as tight), green (read as up), '' otherwise.
 // Green only ever comes from a reading: a record nobody read is not said to be up. A stopped record has no tone and no reading.
 function objectState(a,{now=new Date(),live=null}={}){
  const s=D.assetDateStatus(a,now),stopped=!!a.stopped,dateTone=stopped?'':s.level==='overdue'?'red':s.level==='soon'?'amber':'';
  const read=stopped?null:live||null,liveTone=!read?'':!read.online?'red':read.tone==='red'||read.tone==='amber'?read.tone:'green';
  const tone=[dateTone,liveTone].includes('red')?'red':[dateTone,liveTone].includes('amber')?'amber':liveTone;
  return {tone,dateTone,stopped,level:s.level,days:s.days,label:s.label,live:read};
 }
 // → {zones:[{key,types,items,groups?}], tally:{ok,amber,red,off}, total, live}
 //   item: {id,asset,type,shape,hosts:[asset],home?,...objectState}; the domain zone also has groups [{key,name,cloud,items}].
 //   live(asset) → {text,tone,online} | null: the record's reading, when there is one. live (the count) = items that have one.
 function buildObjects(assets,{now=new Date(),cardOrder={},live=null}={}){
  const visible=assets.filter(a=>!a.hiddenAt&&SHAPES[a.type]);
  const item=a=>({id:a.id,asset:a,type:a.type,shape:objectShape(a),hosts:HOSTS[a.type]?D.linkedAssets(assets,a).filter(h=>!h.hiddenAt&&HOSTS[a.type].includes(h.type)):[],...(a.type==='domain'?{home:domainHome(a)}:{}),...objectState(a,{now,live:live?live(a):null})});
  const zones=ZONES.map(z=>{
   const items=z.types.flatMap(type=>D.arrangeAssets(visible.filter(a=>a.type===type),cardOrder[type])).map(item);
   if(z.key==='server')items.sort((a,b)=>(a.shape==='tower')-(b.shape==='tower'));
   if(z.key==='desk')items.sort((a,b)=>(b.asset.source==='local')-(a.asset.source==='local'));
   if(z.key!=='domain')return {key:z.key,types:z.types,items};
   const groups=new Map();for(const it of items){if(!groups.has(it.home.key))groups.set(it.home.key,{...it.home,items:[]});groups.get(it.home.key).items.push(it);}
   const rank=g=>g.cloud?0:g.key?1:2,list=[...groups.values()].sort((a,b)=>rank(a)-rank(b)||b.items.length-a.items.length||a.name.localeCompare(b.name));
   return {key:z.key,types:z.types,items:list.flatMap(g=>g.items),groups:list};
  }).filter(z=>z.items.length);
  const all=zones.flatMap(z=>z.items),n=test=>all.filter(test).length;
  return {zones,total:all.length,live:n(o=>o.live),tally:{red:n(o=>o.tone==='red'),amber:n(o=>o.tone==='amber'),off:n(o=>o.stopped),ok:n(o=>!o.stopped&&o.tone!=='red'&&o.tone!=='amber')}};
 }
 // Every object's id in drawing order (the order ← → walk).
 const objectOrder=model=>model.zones.flatMap(z=>z.items.map(o=>o.id));
 const objectsRoom=(width,height)=>width>=MIN_W&&height>=MIN_H;

 // 正在做: the sessions a machine's reading holds, summed as coding-sessions.js's codingSummary sums them. That module is the
 // source of both the readings and the rules; the view hands its codingSummary in as `summary` when the page has it, and this
 // stand-in with the same meaning serves a page without it.
 const TOOLS=[['claude','Claude Code'],['codex','Codex'],['cursor-agent','Cursor Agent'],['cursor','Cursor'],['opencode','opencode'],['gemini','Gemini CLI'],['copilot','Copilot CLI'],['grok','Grok CLI']],ACTIVE_MS=3*60000;
 function sessionSummary(readings,now=Date.now()){
  const state=s=>{if(!s.tracked)return 'running';const last=Date.parse(s.activeAt)||Date.parse(s.startedAt)||0;return last&&now-last<=ACTIVE_MS?'active':'idle';};
  const minutes=s=>{const t=Date.parse(s.startedAt);return isNaN(t)?null:Math.max(0,Math.floor((now-t)/60000));};
  const all=(Array.isArray(readings)?readings:[readings]).filter(r=>r&&Array.isArray(r.sessions)).flatMap(r=>r.sessions.map(s=>({...s,host:r.host?.id||'local',state:state(s),minutes:minutes(s)})));
  const rank={active:0,running:1,idle:2},count=(list,st)=>list.filter(s=>s.state===st).length,known=TOOLS.map(t=>t[0]);
  const ids=[...known,...new Set(all.map(s=>s.tool).filter(id=>!known.includes(id)))];
  const tools=ids.map(id=>{const list=all.filter(s=>s.tool===id).sort((x,y)=>rank[x.state]-rank[y.state]||(x.minutes??Infinity)-(y.minutes??Infinity));return {id,name:TOOLS.find(t=>t[0]===id)?.[1]||String(id),count:list.length,active:count(list,'active'),idle:count(list,'idle'),sessions:list};}).filter(t=>t.count);
  return {total:all.length,active:count(all,'active'),idle:count(all,'idle'),hosts:new Set(all.map(s=>s.host)).size,tools};
 }
 // What the Mac's screen shows: this machine's readings only (host.kind local). total 0 = the empty state.
 //   → {total, active, lines:[{id,name,count,repo,minutes}], more, host}   a line per tool, its leading session's repository and minutes
 function workScreen(readings,{now=Date.now(),summary=null,cap=3}={}){
  const list=(Array.isArray(readings)?readings:[readings]).filter(r=>r&&Array.isArray(r.sessions)&&(r.host?.kind||'local')==='local');
  const s=(typeof summary==='function'?summary:sessionSummary)(list,now),host=String(list[0]?.host?.name||'');
  if(!s||!s.total||!Array.isArray(s.tools))return {total:0,active:0,lines:[],more:0,host};
  return {total:s.total,active:s.active||0,lines:s.tools.slice(0,cap).map(t=>({id:t.id,name:t.name,count:t.count,repo:String(t.sessions?.[0]?.repo||''),minutes:t.sessions?.[0]?.minutes??null})),more:Math.max(0,s.tools.length-cap),host};
 }
 // The Mac on the desk: a laptop unless a hint (the reading's host name, a model identifier the host passes) names a desktop Mac.
 const macForm=(...hints)=>hints.some(h=>/mac\s?mini|mac\s?studio|imac|mac\s?pro/i.test(String(h||'')))?'mini':'laptop';

 const api={OBJECT_SHAPES:SHAPES,OBJECT_ZONES:ZONES,OBJECT_MIN_W:MIN_W,OBJECT_MIN_H:MIN_H,OBJECT_TIERS:TIERS,serverPlace,objectShape,domainHome,objectState,buildObjects,objectOrder,objectsRoom,sessionSummary,workScreen,macForm};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(window,api);
})();
