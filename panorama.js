// Panorama: pure derivations for the whole-board view. Nothing here touches the DOM, the network or storage;
// the view is built from the same `state.assets`, so it has no data of its own. "Status" is the registered status (expiry, manual stop), never a live probe.
// v22 lenses: the same board seen around different hubs. Every lens reads links that already exist, so switching never asks for new data.
//   host = where things run: servers, deployment services and object storage hold the domains, repositories and databases on them.
//   pay  = who pays: each bank card holds what it pays for.
//   login = what you sign in with: each Apple ID or Google account holds what it logs into.
//   project = by project: one card per project label. A project is a label on its things, not an asset, so its hubs are virtual
//             ({id:'project:<name>', type:'project', virtual:true}) and hanging a thing on one sets its label (one project per thing).
(function(){
 const D=typeof module!=='undefined'&&module.exports?require('./asset-data.js'):window;
 // Top-level consts of asset-data.js are shared script bindings in the browser, not window properties.
 const KINDS=D.LINK_KINDS||(typeof LINK_KINDS!=='undefined'?LINK_KINDS:[]),MOUNTS=D.MOUNT_TYPES||(typeof MOUNT_TYPES!=='undefined'?MOUNT_TYPES:['domain','repository','database','license']);
 const PAYS=(KINDS.find(k=>k[0]==='pay')||[])[2]||[],LOGINS=(KINDS.find(k=>k[0]==='login')||[])[2]||[];
 const PROJECT_TYPES=['domain','repository','server','deployment','storage','database','subscription','ai','license','bankcard','phone','appleid','google'];
 // fits[hubType] = the kid types that hang on that hub in this lens. groups = how kids are grouped on a card, in display order.
 const LENSES=[
  {key:'host',name:'运行在哪',hubName:'服务器',
   fits:{server:MOUNTS,deployment:['domain','repository','database','storage'],storage:['domain']},
   groups:[{key:'domain',types:['domain'],cap:4},{key:'repository',types:['repository'],cap:3},{key:'database',types:['database','license'],cap:2},{key:'storage',types:['storage'],cap:2}],
   loose:['domain','repository','database','license']},
  {key:'pay',name:'谁在付钱',hubName:'付款卡',
   fits:{bankcard:PAYS},
   groups:[{key:'service',types:['subscription','ai','license','appleid','google'],cap:4},{key:'infra',types:['server','deployment','storage','database'],cap:4},{key:'domain',types:['domain'],cap:3}],
   loose:PAYS,
   // Only things that cost money every cycle are missing a card; free or unpriced ones are not.
   wantsHub:a=>D.billingTypeOf(a)==='recurring'},
  // Nothing is "loose" here: plenty of things sign in with an email that is not on the board, and that is fine.
  {key:'login',name:'用什么登录',hubName:'登录账号',
   fits:{appleid:LOGINS,google:LOGINS},
   groups:[{key:'service',types:['subscription','ai','license'],cap:4},{key:'infra',types:['deployment','storage','database'],cap:3},{key:'domain',types:['domain'],cap:3},{key:'repository',types:['repository'],cap:3}],
   loose:[]},
  {key:'project',name:'按项目',hubName:'项目',virtual:true,
   fits:{project:PROJECT_TYPES},
   groups:[{key:'domain',types:['domain'],cap:3},{key:'repository',types:['repository'],cap:3},{key:'infra',types:['server','deployment','storage','database'],cap:3},{key:'service',types:['subscription','ai','license','bankcard','phone','appleid','google'],cap:3}],
   loose:[]}
 ];
 const lensOf=key=>LENSES.find(l=>l.key===key)||LENSES[0];
 const hubTypes=lens=>Object.keys(lens.fits);
 const fits=(lens,hub,kid)=>!!hub&&!!kid&&hub.id!==kid.id&&(lens.fits[hub.type]||[]).includes(kid.type);
 // Kept for the drag code and older callers: the server lens's groups.
 const GROUPS=LENSES[0].groups;
 const UNMOUNTED_CAP=7,CARD_CAP=6;
 const toneOf=level=>level==='overdue'?'red':level==='soon'?'amber':'';
 const orderFor=(cardOrder,types)=>types.flatMap(type=>Array.isArray(cardOrder?.[type])?cardOrder[type]:[]);
 const projectOf=a=>D.cleanProject(a?.project);
 const projectHub=name=>({id:'project:'+name,type:'project',name,virtual:true});
 // Every hub of a lens, hidden ones included (real assets), or one virtual hub per project in use.
 const hubList=(lens,assets)=>lens.virtual?D.projectNames(assets).map(p=>projectHub(p.name)):assets.filter(a=>hubTypes(lens).includes(a.type));
 const findHub=(lens,assets,id)=>lens.virtual?(typeof id==='string'&&id.startsWith('project:')&&D.projectNames(assets).some(p=>'project:'+p.name===id)?projectHub(id.slice(8)):null):assets.find(a=>a.id===id)||null;
 const hubsOf=(lens,assets,asset)=>lens.virtual?(projectOf(asset)&&fits(lens,projectHub(projectOf(asset)),asset)?[projectHub(projectOf(asset))]:[]):D.linkedAssets(assets,asset).filter(h=>fits(lens,h,asset));
 const kidsOf=(lens,assets,hub)=>lens.virtual?assets.filter(a=>projectOf(a)===hub.name&&fits(lens,hub,a)):D.linkedAssets(assets,hub).filter(k=>fits(lens,hub,k));
 const allowed=(lens,kid,hub)=>lens.virtual||D.linkAllowed(kid,hub);
 // The lens's own write: a link, or for projects the label.
 function attach(lens,assets,kidId,hub){if(!lens.virtual)return D.linkRelation(assets,kidId,hub.id).ok;const a=assets.find(x=>x.id===kidId);if(!a||projectOf(a)===hub.name)return false;a.project=hub.name;return true;}
 function detach(lens,assets,kidId,hub){if(!lens.virtual)return D.unlinkAssets(assets,kidId,hub.id);const a=assets.find(x=>x.id===kidId);if(!a||projectOf(a)!==hub.name)return false;delete a.project;return true;}

 function chipOf(lens,assets,asset,hubId,now){
  const status=D.assetDateStatus(asset,now),meta=hubId?D.linkMetaOf(asset,hubId):{standby:false,proxied:false};
  const hubs=hubsOf(lens,assets,asset).filter(s=>!s.hiddenAt);
  const group=lens.groups.find(g=>g.types.includes(asset.type))?.key||'';
  return {id:asset.id,asset,type:asset.type,group,tone:toneOf(status.level),days:status.days,stopped:!!asset.stopped,standby:meta.standby,proxied:meta.proxied,alsoOn:hubId?hubs.filter(s=>s.id!==hubId).length:0};
 }
 // Lenses with at least one visible hub; the switch only offers those.
 // skip leaves lenses out whatever they hold (the free edition has no 按项目).
 function panoramaLenses(assets,{skip=[]}={}){return LENSES.filter(lens=>!skip.includes(lens.key)&&hubList(lens,assets).some(h=>!h.hiddenAt)).map(l=>l.key);}
 // The lens to open on: the remembered one while it still has hubs, else the one where the most things are linked (ties go to host).
 function pickLens(assets,saved,{skip=[]}={}){
  const open=panoramaLenses(assets,{skip});
  if(open.includes(saved))return saved;
  if(!open.length)return 'host';
  const linked=key=>{const lens=lensOf(key);return hubList(lens,assets).filter(a=>!a.hiddenAt).reduce((n,h)=>n+kidsOf(lens,assets,h).filter(k=>!k.hiddenAt).length,0);};
  return open.map(key=>({key,n:linked(key)})).sort((a,b)=>b.n-a.n||LENSES.findIndex(l=>l.key===a.key)-LENSES.findIndex(l=>l.key===b.key))[0].key;
 }

 // → {lens, accounts, lanes, unmounted, totals, shared, hiddenLanes}
 //   accounts: bands [{id,asset,label,tone,lanes}]. host: a server's account, then servers without one (id null), then one band per other hub type ('type:deployment').
 //             pay: a single band (id null) that draws no head.
 //   lane: {id,hub,server(=hub),ip,tone,stopped,account,groups:[{key,types,total,chips}],total,off,hidden}
 //   totals: [{key,types,n,off}] hubs first, then each kid group with anything in it. off = hidden by the viewer's type toggles.
 //   hide: keys the viewer switched off, hub types (no cards for them) or group keys (those kids leave the cards and the loose card).
 //         The last hub type that has cards is never hidden, so a toggle cannot empty the board.
 function buildPanorama(assets,{lens:key='host',cardOrder={},now=new Date(),hide=[]}={}){
  const lens=lensOf(key),visible=assets.filter(a=>!a.hiddenAt),off=hiddenKeys(lens,visible,hide),types=hubTypes(lens).filter(t=>!off.has(t));
  const hubs=lens.virtual?hubList(lens,visible).filter(h=>types.includes(h.type)):types.flatMap(type=>D.arrangeAssets(visible.filter(a=>a.type===type),cardOrder[type]));
  const lanes=hubs.map(hub=>{
   const kids=kidsOf(lens,assets,hub),shown=kids.filter(a=>!a.hiddenAt);
   const groups=lens.groups.filter(g=>!off.has(g.key)).map(g=>{
    const list=D.arrangeAssets(shown.filter(a=>g.types.includes(a.type)),orderFor(cardOrder,g.types));
    return {key:g.key,types:g.types,total:list.length,chips:list.map(a=>chipOf(lens,assets,a,hub.id,now))};
   });
   const account=hub.type==='server'&&lens.key==='host'?D.serverChain(assets,hub).accounts.find(a=>!a.hiddenAt)||null:null;
   const band=hub.type==='server'||lens.key!=='host'?(account?.id||null):'type:'+hub.type;
   const total=groups.reduce((n,g)=>n+g.total,0);
   // off = kids the type toggles keep out of sight, so an emptied-looking card does not read as empty.
   return {id:hub.id,hub,server:hub,ip:D.primaryIp(hub),tone:toneOf(D.assetDateStatus(hub,now).level),stopped:!!hub.stopped,account:band,groups,total,off:shown.filter(a=>off.has(groupOf(lens,a.type))).length,hidden:kids.length-shown.length};
  });
  const byBand=new Map();
  for(const lane of lanes){if(!byBand.has(lane.account))byBand.set(lane.account,[]);byBand.get(lane.account).push(lane);}
  const bands=[...byBand].filter(([id])=>id&&!String(id).startsWith('type:')).map(([id,list])=>{const asset=assets.find(a=>a.id===id);return {id,asset,label:asset.name,tone:toneOf(D.assetDateStatus(asset,now).level),lanes:list};})
   .sort((a,b)=>b.lanes.length-a.lanes.length||String(a.asset.name).localeCompare(String(b.asset.name)));
  if(byBand.has(null))bands.push({id:null,asset:null,label:'',tone:'',lanes:byBand.get(null)});
  for(const type of types)if(byBand.has('type:'+type))bands.push({id:'type:'+type,asset:null,label:'',type,tone:'',lanes:byBand.get('type:'+type)});
  // Things that sit on no hub of this lens. Quiet by design: no count of warnings, no prompt.
  const placed=a=>hubsOf(lens,assets,a).length>0;
  const loose=lens.loose.filter(type=>!off.has(groupOf(lens,type))).flatMap(type=>D.arrangeAssets(visible.filter(a=>a.type===type&&!placed(a)&&(!lens.wantsHub||lens.wantsHub(a))),cardOrder[type]));
  const unmounted={total:loose.length,items:loose.map(a=>chipOf(lens,assets,a,'',now))};
  // By project, a kind counts only what has a project; elsewhere it counts the whole board.
  const count=list=>visible.filter(a=>list.includes(a.type)&&(!lens.virtual||projectOf(a))).length;
  const all=hubTypes(lens),allHubs=hubList(lens,visible);
  const totals=[...all.map(type=>({key:type,types:[type],n:allHubs.filter(h=>h.type===type).length,off:off.has(type)})).filter(t=>t.n),...lens.groups.filter(g=>!g.types.every(t=>all.includes(t))).map(g=>({key:g.key,types:g.types,n:count(g.types),off:off.has(g.key)})).filter(t=>t.n||lens.key==='host')];
  // A thing on several visible hubs appears once per card; `shared` maps its id to those hub ids (hover rings the copies together).
  const shared=new Map();
  for(const lane of lanes)for(const g of lane.groups)for(const chip of g.chips){if(!shared.has(chip.id))shared.set(chip.id,[]);shared.get(chip.id).push(lane.id);}
  for(const [id,list] of [...shared])if(list.length<2)shared.delete(id);
  return {lens:lens.key,accounts:bands,lanes,unmounted,totals,shared,hiddenLanes:lens.virtual?0:assets.filter(a=>types.includes(a.type)&&a.hiddenAt).length};
 }
 const groupOf=(lens,type)=>lens.groups.find(g=>g.types.includes(type))?.key||'';
 // The viewer's hidden keys that apply to this lens, keeping at least one hub type that has cards.
 function hiddenKeys(lens,visible,hide){
  const keys=new Set((Array.isArray(hide)?hide:[]).filter(k=>hubTypes(lens).includes(k)||lens.groups.some(g=>g.key===k)));
  const hubs=hubList(lens,visible),live=hubTypes(lens).filter(t=>hubs.some(h=>h.type===t));
  if(live.length&&live.every(t=>keys.has(t)))keys.delete(live[0]);
  return keys;
 }

 // The "+" on a card: everything that may hang on this hub in this lens, ticked when it already does.
 // → [{key,types,items:[{asset,on,elsewhere:[hub]}]}] in the lens's group order; inside a group: on this hub, then on no hub, then on others.
 function hubCandidates(assets,hubId,lens='host'){
  const L=lensOf(lens),hub=findHub(L,assets,hubId);if(!hub||!L.fits[hub.type])return [];
  const items=assets.filter(a=>!a.hiddenAt&&fits(L,hub,a)&&allowed(L,a,hub)).map(a=>{const hubs=hubsOf(L,assets,a).filter(h=>!h.hiddenAt);return {asset:a,on:hubs.some(h=>h.id===hubId),elsewhere:hubs.filter(h=>h.id!==hubId)};});
  const rank=x=>x.on?0:x.elsewhere.length?2:1;
  return L.groups.map(g=>({key:g.key,types:g.types,items:items.filter(x=>g.types.includes(x.asset.type)).sort((a,b)=>rank(a)-rank(b)||g.types.indexOf(a.asset.type)-g.types.indexOf(b.asset.type)||String(a.asset.name).localeCompare(String(b.asset.name)))})).filter(g=>g.items.length);
 }
 // Make the hub hold exactly `ids` (among what may hang on it): new ones are linked (their other hubs stay), unticked ones unlinked.
 // → {added:[id], removed:[id]}; the caller wraps it in one undo step.
 function setHubKids(assets,hubId,ids,lens='host'){
  const L=lensOf(lens),hub=findHub(L,assets,hubId),want=new Set(ids),added=[],removed=[];
  for(const g of hubCandidates(assets,hubId,lens))for(const {asset,on} of g.items){
   if(on&&!want.has(asset.id)){if(detach(L,assets,asset.id,hub))removed.push(asset.id);}
   else if(!on&&want.has(asset.id)){if(attach(L,assets,asset.id,hub))added.push(asset.id);}
  }
  return {added,removed};
 }

 // First `cap` chips and how many are left.
 function capChips(chips,cap){const n=Math.max(0,cap|0);return {shown:chips.slice(0,n),more:Math.max(0,chips.length-n)};}
 function capUnmounted(model,expanded=false){return expanded?{shown:model.unmounted.items,more:0}:capChips(model.unmounted.items,UNMOUNTED_CAP);}
 // What a card shows. full: each group capped at its own cap (a card with one group gets CARD_CAP); compact: the counts and one dot per kid.
 function laneView(lane,{compact=false,lens='host',open=new Set()}={}){
  if(compact){const all=lane.groups.flatMap(g=>g.chips),c=capChips(all,24);return {compact:true,dots:c.shown.map(x=>({id:x.id,tone:x.tone,stopped:x.stopped})),more:c.more,hidden:lane.hidden};}
  const used=lane.groups.filter(g=>g.total),L=lensOf(lens);
  return {compact:false,hidden:lane.hidden,groups:used.map(g=>{const cap=used.length===1?CARD_CAP:L.groups.find(x=>x.key===g.key)?.cap||3;const isOpen=open.has(lane.id+':'+g.key);return {key:g.key,total:g.total,open:isOpen,cap,...(isOpen?{shown:g.chips,more:0}:capChips(g.chips,cap))};})};
 }

 // Flat reading order for keyboard movement: card by card (bands in order), a card's head first, then its chips down the groups.
 function panoramaOrder(model){
  const out=[];
  for(const acc of model.accounts)for(const lane of acc.lanes){out.push({kind:'lane',id:lane.id,lane:lane.id});for(const g of lane.groups)for(const chip of g.chips)out.push({kind:'chip',id:chip.id,lane:lane.id,group:g.key});}
  for(const chip of model.unmounted.items)out.push({kind:'chip',id:chip.id,lane:null,group:'unmounted'});
  return out;
 }

 // Whether `asset` may hang on hub `to` in a lens (the drag targets).
 function canHang(assets,assetId,toId,lens='host'){const L=lensOf(lens),a=assets.find(x=>x.id===assetId),h=findHub(L,assets,toId);return fits(L,h,a)&&allowed(L,a,h);}
 // A hub by id in a lens: the asset, or the virtual project hub.
 function panoramaHub(assets,id,lens='host'){return findHub(lensOf(lens),assets,id);}
 // The one write the panorama allows: re-hang a thing. `from` = the hub it was dragged out of ('' when it came from the unmounted strip), `to` = the target hub or null for the strip.
 //   default  = move here (the link to `from` goes, a link to `to` appears); keep = also here (the old link stays); to null = unlink from `from`.
 //   By project a thing has one project, so keep is ignored and a drop always moves.
 // → {ok, changed, kind:'move'|'also'|'detach'|'same'|'illegal'|'none', server}  (server = the hub involved)
 function moveMount(assets,assetId,{from='',to=null,keep=false,lens='host'}={}){
  const L=lensOf(lens),asset=assets.find(a=>a.id===assetId),target=to?findHub(L,assets,to):null,origin=from?findHub(L,assets,from):null;
  if(L.virtual)keep=false;
  if(!asset||!L.loose.includes(asset.type)&&!Object.values(L.fits).some(list=>list.includes(asset.type)))return {ok:false,changed:false,kind:'illegal'};
  if(!to){if(!origin)return {ok:false,changed:false,kind:'none'};const changed=detach(L,assets,assetId,origin);return {ok:changed,changed,kind:'detach',server:origin};}
  if(!target||!fits(L,target,asset)||!allowed(L,asset,target))return {ok:false,changed:false,kind:'illegal'};
  if(from===to)return {ok:false,changed:false,kind:'same',server:target};
  const had=hubsOf(L,assets,asset).some(x=>x.id===to);
  let changed=false;
  if(origin&&!keep&&!L.virtual)changed=detach(L,assets,assetId,origin)||changed;
  if(!had)changed=attach(L,assets,assetId,target)||changed;
  return {ok:changed,changed,kind:keep||!origin?'also':'move',server:target};
 }

 const api={PANORAMA_LENSES:LENSES,panoramaLenses,pickLens,canHang,panoramaHub,moveMount,hubCandidates,setHubKids,PANORAMA_GROUPS:GROUPS,PANORAMA_UNMOUNTED_CAP:UNMOUNTED_CAP,PANORAMA_CARD_CAP:CARD_CAP,buildPanorama,capChips,capUnmounted,laneView,panoramaOrder};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(window,api);
})();
