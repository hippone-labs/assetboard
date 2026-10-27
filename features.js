// Optional features (设置 › 功能). Per-viewer switches kept in localStorage, never in the board: undo, backups and imports do not
// move them. A demo starts with everything on so every feature can be shown, and its switches live only in memory.
// Loaded after demo-data.js and before every script that asks featureOn().
const FEATURES_KEY='assetboard-features-v1';
// Each feature: its name in 设置, a one-line note (the row's tooltip), whether it is on until switched, and where it exists.
const FEATURES={
 panorama:{name:tr('全景'),note:tr('按 P 打开：每台服务器、每张卡、每个账号上挂着什么'),on:true},
 probe:{name:tr('探针与 SSH 直读'),note:tr('从你的监控面板或 SSH 读取服务器的在线状态、CPU、内存和磁盘。这是实时读数，不是登记状态'),on:false,mac:true,pro:true},
 agent:{name:tr('外部工具接入（MCP）'),note:tr('让 Claude、ChatGPT、Cursor 等工具或脚本通过 assetboard-cli 查询和修改资产；关掉后它们的调用一律被拒绝'),on:true,mac:true,pro:true}
};
const featureDemo=typeof window!=='undefined'&&!!(window.__ASSETBOARD_NATIVE__?.demo||!window.__ASSETBOARD_NATIVE__&&new URLSearchParams(location.search).has('demo'));
let featurePrefs=(()=>{if(featureDemo)return {};try{const v=JSON.parse(localStorage.getItem(FEATURES_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}})();
function featureOn(name){const v=featurePrefs[name];return typeof v==='boolean'?v:featureDemo||!!FEATURES[name]?.on;}
function setFeature(name,on){if(!FEATURES[name])return;featurePrefs={...featurePrefs,[name]:!!on};if(featureDemo)return;try{localStorage.setItem(FEATURES_KEY,JSON.stringify(featurePrefs));}catch{}}
