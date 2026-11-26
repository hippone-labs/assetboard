// 其他设备 (DEVICE-PAIRING.md): what a paired Mac answers, checked and folded into the board. The Mac app pairs and reads
// (desktop/DevicePairing.swift) and hands each answer to the page as {ok, id, name, at, device, sessions}: id is the pairing (a
// hash of that Mac's key), device is what its 本机设备 reads (DeviceInfo.swift), sessions what its 正在做 reads (CodingSessions.swift).
// This file turns that into a device record (source 'peer', device-local.js) and a 正在做 reading with that Mac as its host.
// Pure: no DOM, no tr(); device-peers-view.js asks and draws.
(function(){
 const node=typeof module!=='undefined'&&module.exports;
 const L=node?require('./device-local.js'):window,C=node?require('./coding-sessions.js'):window;
 const READ_MS=60000;
 const peerHost=id=>'peer-'+id;
 // → {id, name, at, device, sessions} or null. device is null when that Mac sent none it could read; sessions null likewise.
 function parsePeerFacts(r){
  if(!r||r.ok!==true||typeof r.id!=='string'||!/^[0-9a-f]{16}$/.test(r.id))return null;
  const name=typeof r.name==='string'?r.name.trim().slice(0,100):'',at=typeof r.at==='string'&&!isNaN(Date.parse(r.at))?r.at:new Date().toISOString();
  const read=r.sessions?C.parseCodingAnswer(r.sessions):null;
  return {id:r.id,name,at,device:L.parseDeviceInfo(r.device),sessions:read?{...read,host:{id:peerHost(r.id),kind:'mac',name}}:null};
 }
 // That Mac's device record, made or refreshed like this Mac's own (only its facts change; a deleted one stays deleted).
 function mergePeer(board,facts,{now=Date.now()}={}){
  if(!facts?.device)return {assets:board.assets||[],changed:false};
  return L.mergeLocalDevice(board,facts.device,{now,source:'peer',name:facts.name,peerId:facts.id});
 }
 const peerDeviceOf=(assets,id)=>(assets||[]).find(a=>L.isPeerDevice(a)&&a.peerId===id)||null;
 // 同步资产板: folds a paired Mac's board into this one → {board, changed, counts:{added, updated, removed}}. Each record's newer edit
 // wins (planBoardBackup), and a record that Mac deleted after this copy was last edited goes here too. The device records each Mac
 // makes itself (this Mac, a paired Mac) never cross: each Mac reads its own. first: 'there' makes this board that Mac's (once),
 // 'here' keeps this board and takes only what that Mac changed after `since` (ms), so its older records are not brought back.
 const D=node?require('./asset-data.js'):window;
 const ownDevice=a=>a?.type==='device'&&(a.source==='local'||a.source==='peer');
 function syncBoards(current,remote,{first='',since=0}={}){
  const parsed=D.parseBoardBackup(remote);if(!parsed.ok)return {board:current,changed:false,error:parsed.error};
  // 组合视图 are each Mac's own way of looking: a backup carries them, a sync does not (one deleted here would come back from there).
  const {views:_views,...board}=parsed.board,theirs={...board,assets:board.assets.filter(a=>!ownDevice(a))};
  const mine=current.assets.filter(ownDevice),base={...current,assets:current.assets.filter(a=>!ownDevice(a))};
  const plan=D.planBoardBackup(base,{ok:true,board:theirs,exportedAt:''},{mode:first==='there'?'replace':'merge'});
  if(since&&first!=='there'){plan.added=plan.added.filter(e=>D.editedTime(e.item)>=since);plan.updated=plan.updated.filter(r=>r.backupAt>=since);plan.settings={};}
  let next=D.applyBoardBackup(base,plan,{});
  const stones=new Map(D.cleanTombstones(theirs.deletedRecords).map(t=>[t.id,Date.parse(t.at)])),gone=[];
  if(first!=='there')next.assets=next.assets.filter(a=>{const at=stones.get(a.id);if(at&&at>D.editedTime(a)){gone.push(a);return false;}return true;});
  for(const a of gone){D.removeLinksTo(next.assets,a.id);D.addTombstone(next,a.id,new Date(stones.get(a.id)).toISOString());}
  const keys=new Set([...(next.deletedExternalIds||[]),...(Array.isArray(theirs.deletedExternalIds)?theirs.deletedExternalIds:[])]);
  const newKeys=[...keys].filter(k=>!(current.deletedExternalIds||[]).includes(k));
  next.deletedExternalIds=[...keys];
  const order=new Map(current.assets.map((a,i)=>[a.id,i]));
  next.assets=[...next.assets,...mine].sort((x,y)=>(order.get(x.id)??1e9)-(order.get(y.id)??1e9));
  for(const a of mine)D.ensureBlock(next,a.type);
  const counts={added:plan.mode==='replace'?plan.added.length:(plan.added||[]).length,updated:(plan.updated||[]).length,removed:gone.length+(plan.removed||[]).length};
  const changed=counts.added+counts.updated+counts.removed>0||Object.keys(plan.settings||{}).length>0||newKeys.length>0||plan.mode==='replace';
  return {board:changed?next:current,changed,counts};
 }
 const api={PEER_READ_MS:READ_MS,peerHost,parsePeerFacts,mergePeer,peerDeviceOf,syncBoards};
 if(node)module.exports=api;else Object.assign(window,api);
})();
