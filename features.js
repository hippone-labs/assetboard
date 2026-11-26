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
 // AI 额度与用量 (ai-usage.js, ai-usage-view.js): on unless switched off; it reads the tools' files on this Mac and, unless switched
 // off per tool in its dialog (never here), their usage endpoints with each tool's own login.
 aiUsage:{name:tr('AI 额度与用量'),note:tr('读本机 AI 工具（Claude Code、Codex、Cursor、Copilot、Grok CLI、opencode、Antigravity）的用量文件，并用各工具自己的登录读它的额度接口，在 AI 订阅上显示额度、重置时间和本期用量；只读数字，不读对话内容'),on:true,mac:true},
 repoDetails:{name:tr('仓库分支和 Actions'),note:tr('同步 GitHub 时，每个仓库多读两次：分支列表和最近一次 Actions 运行。细粒度令牌要加 Contents 和 Actions 的只读权限（Contents 也能读代码）'),on:false,mac:true},
 // 待合并的 PR (pulls-view.js): free and on until switched; it reads with the GitHub login the person already has (gh or the saved token).
 pulls:{name:tr('待合并的 PR'),note:tr('用本机 gh 或已保存的令牌读 GitHub 仓库打开的 PR：App 打开时、每 15 分钟和同步 GitHub 后各读一次。只读，结果只存在这台 Mac'),on:true,mac:true},
 // 正在做 (coding-sessions.js, sessions-view.js): free and on until switched. It reads which AI coding tools run on this Mac, never
 // what is said in them. The current board does not draw them; later views (the object panorama) read codingData(). Not 外部工具接入
 // below (what tools do to the board) and not AI 额度与用量 above (plan limits and usage).
 codingSessions:{name:tr('正在做'),note:tr('本机正在运行的 AI 编码会话（Claude Code、Codex、Cursor 等）：有几个、各在哪个仓库和分支、运行了多久。只读进程名、工作目录、启动时间和会话文件的修改时间；不读对话内容和命令行参数，不联网，读数只在内存里，不交给 AI 工具。设置里可关'),on:true,mac:true},
 // 本机设备 (device-local.js, device-view.js): on until switched. It reads this Mac's own facts through calls that ask for no
 // permission, and keeps them on this Mac's device record; nothing goes over the network.
 localDevice:{name:tr('本机设备'),note:tr('把这台 Mac 记成一条设备：型号、芯片、内存、系统版本、磁盘、电池和序列号。App 打开或回到前台时读，最多 10 分钟一次；只读本机，不联网，不弹权限'),on:true,mac:true},
 // 其他设备 (device-peers.js, device-peers-view.js, desktop/DevicePairing.swift): off until switched, since on it listens on the
 // network and macOS asks about the local network.
 // Tailscale 在线状态 (tailnet.js, tailnet-view.js): off until switched. It asks the local Tailscale which machines are online.
 tailnet:{name:tr('Tailscale 在线状态'),note:tr('在本机运行 tailscale status --json，给 tailnet 里能对上的服务器和设备显示在线或离线、最后在线时间；不探测、不联网，读数只在内存里'),on:false,mac:true},
 peers:{name:tr('其他设备'),note:tr('和配对过的其他 Mac 互相读取本机信息和“正在做”。打开后这台 Mac 在局域网上可被发现，第一次会弹“本地网络”授权'),on:false,mac:true},
 agent:{name:tr('外部工具接入（MCP）'),note:tr('让 Claude、ChatGPT、Cursor 等工具或脚本通过 assetboard-cli 查询和修改资产；关掉后它们的调用一律被拒绝'),on:true,mac:true},
 // Under 外部工具接入, shown while it is on. Off until switched, in a demo too: they decide what leaves the Mac.
 agentAddresses:{name:tr('把地址和联系方式交给 AI 工具'),note:tr('关着时，AI 工具读到的 IP、SSH 主机和用户、手机号和邮箱都是遮住的；搜索仍按真实值匹配'),on:false,mac:true,under:'agent'},
 agentCards:{name:tr('把银行卡和手机号交给 AI 工具'),note:tr('关着时，AI 工具读不到也改不了银行卡和手机号这两类记录'),on:false,mac:true,under:'agent'}
};
const featureDemo=typeof window!=='undefined'&&!!(window.__ASSETBOARD_NATIVE__?.demo||!window.__ASSETBOARD_NATIVE__&&new URLSearchParams(location.search).has('demo'));
let featurePrefs=(()=>{if(featureDemo)return {};try{const v=JSON.parse(localStorage.getItem(FEATURES_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}})();
function featureOn(name){const v=featurePrefs[name],f=FEATURES[name];return typeof v==='boolean'?v:(featureDemo&&!f?.under)||!!f?.on;}
function setFeature(name,on){if(!FEATURES[name])return;featurePrefs={...featurePrefs,[name]:!!on};if(featureDemo)return;try{localStorage.setItem(FEATURES_KEY,JSON.stringify(featurePrefs));}catch{}}
