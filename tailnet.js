// Tailscale 在线状态 and 从 Tailscale 添加: the other nodes of this Mac's tailnet, as the local Tailscale lists them (TailnetNodes in
// desktop/DevicePairing.swift: name, MagicDNS name, Tailscale addresses, system, online, last seen), matched to the board's servers
// and devices, and turned into new records for the ones not on the board. Pure: no DOM, no tr(); tailnet-view.js asks and draws.
// A reading is kept in memory only, never in a record: whether a machine is online is not something the person wrote down.
(function(){
 const node=typeof module!=='undefined'&&module.exports;
 const D=node?require('./asset-data.js'):window;
 const TYPES=new Set(['server','device']);
 // Systems a person carries or sits at become devices; the rest (Linux, FreeBSD, …) are servers.
 const DEVICE_OS=new Set(['macos','ios','ipados','android','windows']);
 const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 // The app's answer, checked: {state: ok|none|stopped|failed, nodes:[{id,name,dns,ips,os,online,lastSeen}]}.
 function parseTailnet(r){
  if(!r||typeof r!=='object')return null;
  const state=['ok','none','stopped','failed'].includes(r.state)?r.state:'failed';
  const nodes=(Array.isArray(r.nodes)?r.nodes:[]).slice(0,200).map(n=>{
   if(!n||typeof n!=='object')return null;
   const dns=clean(n.dns,260).toLowerCase(),ips=(Array.isArray(n.ips)?n.ips:[]).map(ip=>clean(ip,45).toLowerCase()).filter(ip=>D.normalizeIp(ip)).slice(0,4);
   if(!/^([a-z0-9-]+(\.[a-z0-9-]+)+)?$/.test(dns)||!dns&&!ips.length)return null;
   const seen=clean(n.lastSeen,40);
   return {id:/^[A-Za-z0-9]{1,40}$/.test(n.id||'')?n.id:'',name:clean(n.name,100)||dns.split('.')[0]||ips[0],dns,ips,os:/^[a-z]{1,20}$/.test(n.os||'')?n.os:'',
    online:n.online===true,lastSeen:seen&&!isNaN(Date.parse(seen))?seen:''};
  }).filter(Boolean);
  return {state,nodes};
 }
 const lower=v=>String(v||'').trim().toLowerCase();
 // The node one server or device is, or null: a record added from Tailscale by its node id; else an address the record holds; else
 // its host as the MagicDNS name (whole, or its first label); else its name as the node's name. This Mac's own record is never matched.
 function tailnetMatch(asset,nodes){
  if(!asset||!TYPES.has(asset.type)||asset.source==='local'||!Array.isArray(nodes)||!nodes.length)return null;
  if(asset.source==='tailscale'&&asset.externalId){const n=nodes.find(x=>x.id&&x.id===asset.externalId||x.dns&&x.dns===asset.externalId);if(n)return n;}
  const ips=new Set(D.assetIps(asset).map(x=>x.ip.toLowerCase()));
  if(ips.size){const n=nodes.find(x=>x.ips.some(ip=>ips.has(ip)));if(n)return n;}
  const host=lower(asset.host).replace(/\.$/,'');
  if(host){const n=nodes.find(x=>x.dns&&(x.dns===host||x.dns.split('.')[0]===host)||x.ips.includes(host));if(n)return n;}
  const name=lower(asset.name);
  return name?nodes.find(x=>lower(x.name)===name||x.dns&&x.dns.split('.')[0]===name)||null:null;
 }
 // The nodes no server or device on the board is (hidden ones count as on the board).
 function tailnetUnmatched(assets,nodes){
  const taken=new Set();
  for(const a of assets||[]){const n=tailnetMatch(a,nodes);if(n)taken.add(n);}
  return (nodes||[]).filter(n=>!taken.has(n));
 }
 const kindOf=n=>DEVICE_OS.has(n.os)?'device':'server';
 // A new record for one node: a device or a server (the person may pick the other), reached by its MagicDNS name, its Tailscale
 // IPv4 kept as its address. Source 'tailscale' with the node id, so its status follows it even after a rename.
 function tailnetRecord(n,type=kindOf(n)){
  if(!n)return null;
  const kind=type==='device'?'device':'server',v4=n.ips.filter(ip=>D.normalizeIp(ip)?.version===4);
  const base={type:kind,name:n.name,account:'',purpose:'',reason:'',date:'',dateKind:'expire',cycle:'',cost:'未知',notes:'',url:'',host:n.dns||v4[0]||n.ips[0]||'',
   ...(n.ips.length?{ips:n.ips.slice(0,4)}:{}),source:'tailscale',externalId:n.id||n.dns,art:'generic'};
  // iOS reports both iPhone and iPad as ios; the machine's name tells them apart more often than not.
  const deviceKind={macos:'mac',ipados:'ipad',ios:/ipad/i.test(n.name)?'ipad':'iphone',android:'phone',windows:'computer'}[n.os]||'other';
  return kind==='device'?{...base,provider:['macos','ios','ipados'].includes(n.os)?'Apple':'',deviceKind}:{...base,provider:''};
 }
 const api={TAILNET_TYPES:TYPES,parseTailnet,tailnetMatch,tailnetUnmatched,tailnetKind:kindOf,tailnetRecord};
 if(node)module.exports=api;else Object.assign(window,api);
})();
