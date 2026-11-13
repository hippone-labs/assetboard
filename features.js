// Optional features (设置 › 功能). Per-viewer switches kept in localStorage, never in the board: undo, backups and imports do not
// move them. A demo starts with every feature on so each can be shown (not the options under one), and its switches live only
// in memory.
// Loaded after demo-data.js and before every script that asks featureOn().
const FEATURES_KEY='assetboard-features-v1';
// Each feature: its name in 设置, a one-line note (the row's tooltip), whether it is on until switched, and where it exists (mac: the
// Mac app; full: only where the Pro modules are; pro: only while Pro is on, hidden otherwise).
const FEATURES={
 panorama:{name:tr('全景'),note:tr('按 P 打开：每台服务器、每张卡、每个账号上挂着什么'),on:true},
 probe:{name:tr('实时状态'),note:tr('打开后才读：用 SSH 和你添加的监控面板读服务器的内存、网络和负载，每条资产显示一行。这是实时读数，不是登记状态'),on:false,mac:true,full:true,pro:true},
 // AI 额度与用量 (ai-usage.js, ai-usage-view.js): on unless switched off; it reads files on this Mac only. The usage endpoints, which
 // use a tool's own login, are switched on per tool in its dialog, never here.
 aiUsage:{name:tr('AI 额度与用量'),note:tr('读本机 AI 工具（Claude Code、Codex、Cursor、Copilot、Grok CLI、opencode）的用量文件，在 AI 订阅上显示额度、重置时间和本期用量；只读数字，不读对话内容，不联网'),on:true,mac:true},
 repoDetails:{name:tr('仓库分支和 Actions'),note:tr('同步 GitHub 时，每个仓库多读两次：分支列表和最近一次 Actions 运行。细粒度令牌要加 Contents 和 Actions 的只读权限（Contents 也能读代码）'),on:false,mac:true},
 // 待合并的 PR (pulls-view.js): free and on until switched; it reads with the GitHub login the person already has (gh or the saved token).
 pulls:{name:tr('待合并的 PR'),note:tr('用本机 gh 或已保存的令牌读 GitHub 仓库打开的 PR：App 打开时、每 15 分钟和同步 GitHub 后各读一次。只读，结果只存在这台 Mac'),on:true,mac:true},
 agent:{name:tr('外部工具接入（MCP）'),note:tr('让 Claude、ChatGPT、Cursor 等工具或脚本通过 assetboard-cli 查询和修改资产；关掉后它们的调用一律被拒绝'),on:true,mac:true},
 // Under 外部工具接入, shown while it is on. Off until switched, in a demo too: they decide what leaves the Mac.
 agentAddresses:{name:tr('把地址和联系方式交给 AI 工具'),note:tr('关着时，AI 工具读到的 IP、SSH 主机和用户、手机号和邮箱都是遮住的；搜索仍按真实值匹配'),on:false,mac:true,under:'agent'},
 agentCards:{name:tr('把银行卡和手机号交给 AI 工具'),note:tr('关着时，AI 工具读不到也改不了银行卡和手机号这两类记录'),on:false,mac:true,under:'agent'}
};
const featureDemo=typeof window!=='undefined'&&!!(window.__ASSETBOARD_NATIVE__?.demo||!window.__ASSETBOARD_NATIVE__&&new URLSearchParams(location.search).has('demo'));
let featurePrefs=(()=>{if(featureDemo)return {};try{const v=JSON.parse(localStorage.getItem(FEATURES_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}})();
function featureOn(name){const v=featurePrefs[name],f=FEATURES[name];return typeof v==='boolean'?v:(featureDemo&&!f?.under)||!!f?.on;}
function setFeature(name,on){if(!FEATURES[name])return;featurePrefs={...featurePrefs,[name]:!!on};if(featureDemo)return;try{localStorage.setItem(FEATURES_KEY,JSON.stringify(featurePrefs));}catch{}}
