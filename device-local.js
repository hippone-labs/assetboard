// 本机设备: this Mac as one `device` record. The Mac app passes on plain facts (desktop/DeviceInfo.swift): a hash of the hardware
// UUID, the computer's name, the model identifier, the chip, memory, the macOS version, the start-up volume's size and free space,
// the battery, and the serial number when the system gives one. This file checks them and folds them into the board. Pure: no DOM,
// no tr(), so node tests run it (tests/device-local.test.js); device-view.js asks for a read and draws the facts.
//
// The record is {id:'device-local-<hardwareId>', type:'device', source:'local', externalId:<hardwareId>, …}. A read refreshes only
// the facts below; its name, notes, provider and everything else the person writes stay theirs. Deleting it puts local:<hardwareId>
// in deletedExternalIds (assetSyncKey), and later reads leave it deleted until it is restored there (导入 › 已删除的同步项).
//
// A read is {hardwareId, name, model, chip, memoryBytes, osVersion, serial, disk:{total, free}, battery:{percent, charging, cycles},
// at}; disk and battery are null when there is none, serial '' when the system gives none.
(function(){
 const D=typeof module!=='undefined'&&module.exports?require('./asset-data.js'):window;
 const REFRESH_MS=10*60000,DISK_FULL=90,SEEN_EVERY_MS=24*3600000;
 const FACTS=['model','chip','memoryBytes','osVersion','serial','disk','battery'];
 const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
 const count=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null;

 // The Mac app's answer → a read, or null when it is not one (a failed read, a malformed answer).
 function parseDeviceInfo(r){
  if(!r||r.ok!==true||typeof r.hardwareId!=='string'||!/^[0-9a-f]{16}$/.test(r.hardwareId))return null;
  const total=count(r.disk?.total,1e16),free=count(r.disk?.free,1e16),percent=count(r.battery?.percent,100),cycles=count(r.battery?.cycles,1e5);
  return {
   hardwareId:r.hardwareId,name:text(r.name,100),model:text(r.model,60),chip:text(r.chip,80),memoryBytes:count(r.memoryBytes,1e15)||null,
   osVersion:/^\d{1,3}(\.\d{1,3}){0,2}$/.test(r.osVersion||'')?r.osVersion:'',serial:/^[A-Z0-9]{8,14}$/i.test(r.serial||'')?r.serial.toUpperCase():'',
   disk:total?{total,free:Math.min(free??0,total)}:null,
   battery:percent==null?null:{percent:Math.round(percent),charging:r.battery.charging===true,...(cycles==null?{}:{cycles})},
   at:typeof r.at==='string'&&!isNaN(Date.parse(r.at))?r.at:new Date().toISOString()
  };
 }
 // source 'local' is this Mac; 'peer' a paired Mac read over the network (device-peers.js), which keeps peerId, its pairing.
 const deviceAssetId=(hardwareId,source='local')=>`device-${source}-${hardwareId}`;
 const deviceSyncKey=(hardwareId,source='local')=>D.syncKey(source,hardwareId);
 // The facts a read writes; an empty one is left out, so a fact the system stopped giving goes away.
 function deviceFacts(info){
  const out={};
  for(const key of FACTS){const v=info[key];if(v!==null&&v!==undefined&&v!=='')out[key]=v;}
  return out;
 }
 const isLocalDevice=a=>a?.type==='device'&&a.source==='local';
 const isPeerDevice=a=>a?.type==='device'&&a.source==='peer';
 const localDeviceOf=(assets,hardwareId,source='local')=>assets.find(a=>a?.type==='device'&&a.source===source&&a.externalId===hardwareId)||null;
 // Folds a read into the board → {assets, changed, added?, skipped?}. Only a changed fact, or a day since the last one, is a change:
 // reading every ten minutes does not save the board every ten minutes.
 function mergeLocalDevice(board,info,{now=Date.now(),source='local',name='',peerId=''}={}){
  const assets=board.assets||[];
  if(!info||D.isBlacklisted(board,deviceSyncKey(info.hardwareId,source)))return {assets,changed:false,skipped:!!info};
  const facts={...deviceFacts(info),...(peerId?{peerId}:{})},old=localDeviceOf(assets,info.hardwareId,source);
  if(!old){
   const added={id:deviceAssetId(info.hardwareId,source),type:'device',name:name||info.name||'Mac',provider:'Apple',source,externalId:info.hardwareId,...facts,seenAt:info.at};
   return {assets:[...assets,added],changed:true,added};
  }
  const next={...old};for(const key of FACTS)delete next[key];Object.assign(next,facts);
  if(peerId)next.peerId=peerId;
  const same=[...FACTS,'peerId'].every(key=>JSON.stringify(next[key])===JSON.stringify(old[key])),fresh=now-(Date.parse(old.seenAt)||0)<SEEN_EVERY_MS;
  if(same&&fresh)return {assets,changed:false};
  next.seenAt=info.at;
  return {assets:assets.map(a=>a===old?next:a),changed:true};
 }
 // How full the start-up volume is, in whole percent, or null when it is not known.
 function deviceDiskUsed(a){const d=a?.disk;return d&&d.total>0?Math.round((d.total-Math.min(d.free??0,d.total))/d.total*100):null;}
 // amber when the disk is nearly full; '' otherwise. A device has no dates of its own, so this is its only state.
 const deviceTone=a=>(deviceDiskUsed(a)??0)>=DISK_FULL?'amber':'';
 // This Mac read without a battery is a desktop (a Mac mini, Studio, iMac or Mac Pro); anything else is drawn as a laptop.
 const deviceForm=a=>(isLocalDevice(a)||isPeerDevice(a))&&!a.battery?'desktop':'laptop';

 const api={DEVICE_REFRESH_MS:REFRESH_MS,DEVICE_DISK_FULL:DISK_FULL,DEVICE_FACTS:FACTS,parseDeviceInfo,deviceAssetId,deviceSyncKey,deviceFacts,isLocalDevice,isPeerDevice,localDeviceOf,mergeLocalDevice,deviceDiskUsed,deviceTone,deviceForm};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(window,api);
})();
