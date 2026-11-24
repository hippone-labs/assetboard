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
 const api={PEER_READ_MS:READ_MS,peerHost,parsePeerFacts,mergePeer,peerDeviceOf};
 if(node)module.exports=api;else Object.assign(window,api);
})();
