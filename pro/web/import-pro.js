// Pro: the connectors in the import window and under 添加资产 — GitHub through the local gh (or a token), MCP 接入 for agents and scripts,
// Cloudflare, 阿里云 · 腾讯云 (测试版) and AI recognition (配置 AI). The dialogs and bridge calls they open stay in the core; the free edition just never offers them.
// Loaded after money-view.js and before app.js; with ?free, or while Pro is off in the Mac app, it registers nothing (proRegister).

function importGitHubButton({cli}){
 const accounts=cli.ghAccounts||[],tags=accounts.map(n=>`<span class="account-tag">${esc(n)}</span>`).join('');
 return cli.gh?`<button class="button primary" data-action="github-local-sync" title="${accounts.length?tr('用本机 gh 同步仓库：{accounts}',{accounts:esc(accounts.join(tr('、')))}):tr('用本机 gh 同步仓库')}">${ui('github')}gh${tags}</button>`:`<button class="button" data-action="github-import" title="${tr('gh 不可用，改用 GitHub 令牌')}">${ui('github')}${tr('令牌')}</button>`;
}
function importConnectorSources({native,source}){
 return (featureOn('agent')?source('agent-setup','terminal',tr('MCP 接入'),tr('让外部 AI 工具或脚本查询、添加、修改资产')):'')+(native?source('cloudflare-import','cloud','Cloudflare'):'');
}

proRegister(()=>{
 proSlots.importCli.push(importGitHubButton);
 proSlots.importSources.push(importConnectorSources);
 proSlots.captureImportLabel=()=>tr('从文件、GitHub、Cloudflare 导入…');
 proSlots.captureAiLink=()=>tr('{link} 可识别得更准',{link:`<button type="button" class="text-button inline-button" data-action="ai-settings">${tr('配置 AI')}</button>`});
 proSlots.captureLinks.push(()=>!featureOn('agent')?'':`<button type="button" class="text-button capture-more" data-action="agent-setup">${ui('terminal')}${tr('MCP 接入：让外部 AI 工具读写…')}</button>`);
 // The main way in for agents and scripts, in the Mac app (it needs the app's socket): it keeps its name beside the icon.
 proSlots.topnavActions.push(()=>nativeStore&&featureOn('agent')?`<button class="button topnav-mcp" data-action="agent-setup" title="${tr('让外部 AI 工具（Claude、ChatGPT、Cursor 等）或脚本通过 MCP 查询、添加、修改资产')}">${ui('terminal')}MCP</button>`:'');
});
