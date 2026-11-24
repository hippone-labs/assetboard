// 本机设备: asks the Mac app for this Mac's facts (bridge deviceInfo → assetboardDeviceInfo) when the page opens, when it comes
// back to the front, and at most every DEVICE_REFRESH_MS; folds the answer into the board as one `device` record (device-local.js);
// and words a device's facts for the tile wall and the inspector. Not in a demo (its board has a made-up Mac) or the browser.
// Loaded after app.js; app.js and board-wall.js call in through typeof checks.
let deviceBusy=0,deviceAsked=0,deviceSeq=0;
function deviceOn(){return featureOn('localDevice')&&!!nativeStore&&!demoMode;}
function deviceRefresh(){
 if(!deviceOn())return false;
 const now=Date.now();if(deviceBusy&&now-deviceBusy<20000)return false;
 deviceBusy=now;deviceAsked=now;
 try{window.webkit.messageHandlers.assetboard.postMessage({action:'deviceInfo',requestId:++deviceSeq});}catch{deviceBusy=0;return false;}
 return true;
}
function deviceDue(){if(document.visibilityState!=='hidden'&&Date.now()-deviceAsked>=DEVICE_REFRESH_MS)deviceRefresh();}
// A read that changed a fact (or the first read) is saved and drawn. It is not an undo step: nobody did it.
window.assetboardDeviceInfo=result=>{
 deviceBusy=0;if(!deviceOn())return;
 const info=parseDeviceInfo(result);if(!info)return;
 const merged=mergeLocalDevice(state,info);if(!merged.changed)return;
 state.assets=merged.assets;ensureBlock(state,'device');
 save();render();
};
// 设置 › 功能: on reads at once. Off stops reading; the record stays on the board like any other, to keep or delete.
function deviceSwitch(on){if(on){deviceAsked=0;deviceRefresh();}}
if(nativeStore&&!demoMode){setTimeout(deviceDue,1500);setInterval(deviceDue,60000);window.addEventListener('focus',deviceDue);document.addEventListener('visibilitychange',deviceDue);}

const deviceBytes=n=>n>=1e12?`${+(n/1e12).toFixed(n>=1e13?0:1)} TB`:`${Math.round(n/1e9)} GB`;
// Memory is sold in binary gigabytes: 36 GB, not 38.7.
const deviceMemory=n=>n?`${Math.round(n/2**30)} GB`:'';
function deviceDiskText(a){
 const used=deviceDiskUsed(a);if(used==null)return '';
 return tr('已用 {used}% · 剩 {free}，共 {total}',{used,free:deviceBytes(a.disk.free),total:deviceBytes(a.disk.total)});
}
function deviceBatteryText(a){
 const b=a.battery;if(!b)return '';
 return [`${b.percent}%`,b.charging?tr('充电中'):'',b.cycles!=null?tr('循环 {n} 次',{n:b.cycles}):''].filter(Boolean).join(' · ');
}
const deviceSystem=a=>a.osVersion?`macOS ${a.osVersion}`:'';
// One line under the name: chip and memory, else the model.
function deviceLine(a){return [a.chip,deviceMemory(a.memoryBytes)].filter(Boolean).join(' · ')||a.model||'';}
// The serial number follows privacy mode like a name, and is masked for AI tools (maskAsset).
const deviceSerial=a=>a.serial?veil(a.serial):'';
// The tile wall's facts (board-wall.js wallFacts), by the same weights: 1 what it is, 2 its state.
function wallDeviceFacts(a){
 if(a.type!=='device')return [];
 return [[1,tr('型号'),a.model||''],[1,tr('芯片'),a.chip||''],[1,tr('内存'),deviceMemory(a.memoryBytes)],[1,tr('系统'),deviceSystem(a)],
  [2,tr('磁盘'),deviceDiskText(a)],[2,tr('电池'),deviceBatteryText(a)],[3,tr('序列号'),deviceSerial(a)]];
}
// The inspector's rows, after the general ones (app.js detailFacts).
function deviceDetailFacts(a){
 if(a.type!=='device')return '';
 const seen=isLocalDevice(a)&&a.seenAt?tr('{when} 读取',{when:new Date(a.seenAt).toLocaleString(trLocale())}):'';
 const disk=deviceDiskText(a),tone=deviceTone(a);
 return [[tr('型号'),esc(a.model||'')],[tr('芯片'),esc(a.chip||'')],[tr('内存'),esc(deviceMemory(a.memoryBytes))],[tr('系统'),esc(deviceSystem(a))],
  [tr('磁盘'),disk?`<span class="${tone?'device-'+tone:''}">${esc(disk)}</span>`:''],[tr('电池'),esc(deviceBatteryText(a))],[tr('序列号'),esc(deviceSerial(a))],[tr('本机'),esc(seen)]]
  .filter(([,html])=>html).map(([k,html])=>`<div class="fact"><span>${k}</span><span>${html}</span></div>`).join('');
}
