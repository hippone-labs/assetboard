// AI 额度与用量 in the page (2026-11-09, hans): the readings ai-usage.js makes (in the Mac app's JavaScriptCore, desktop/AIUsage.swift)
// drawn on the AI subscription records: a line on the row (the tightest windows as thin meters, when the tightest one resets, the
// period's value or how long it has been idle), the detail's 额度 facts, a band of what needs a look on top of the AI 订阅 view, and
// one dialog for every tool (what was found, local reading and the usage endpoint per tool). Readings stay in memory: never in
// state, a backup, an export or a handover. Loaded after app.js; app.js and money-view.js call in through typeof checks.

let aiUsageNow={snapshot:null,sources:null};
// Readings exist in the Mac app (and made up in the demo) while 设置 › 功能 › AI 额度与用量 is on.
function aiUsageOn(){return featureOn('aiUsage')&&(demoMode||!!nativeStore);}
function aiUsageSnap(){if(!aiUsageOn())return null;if(demoMode)return aiUsageNow.snapshot||(aiUsageNow.snapshot=aiUsageDemo(Date.now()));return aiUsageNow.snapshot;}
function aiUsageSend(message){if(!nativeStore||demoMode)return;try{window.webkit.messageHandlers.assetboard.postMessage(message);}catch{}}
function aiUsageSwitch(on){if(!on)aiUsageNow.snapshot=null;aiUsageSend({action:on?'aiUsageStart':'aiUsageStop'});}
window.assetboardAiUsage=result=>{
 if(result?.snapshot&&typeof result.snapshot==='object')aiUsageNow.snapshot=result.snapshot;
 if(Array.isArray(result?.settings?.sources))aiUsageNow.sources=result.settings.sources;
 render();if(activeAsset&&!$('#detail').hidden&&state.assets.find(a=>a.id===activeAsset)?.type==='ai')showDetail(activeAsset);
 if($('#modal').open&&$('#modal').dataset.view==='ai-usage')aiUsageDialog();
};
MODAL_SIZES['ai-usage']='l';

// MARK: Words
function aiWindowName(w){
 const base=String(w.id||'').split('-')[0],name={'5h':tr('5 小时'),week:tr('本周'),month:tr('本月'),premium:tr('高级请求'),chat:tr('对话'),completions:tr('补全'),period:tr('本期'),model:tr('模型'),window:tr('窗口')}[base]||w.id;
 return w.label?`${name} · ${w.label}`:name;
}
function aiResetText(at,now=Date.now()){
 if(!at)return '';const left=at-now;if(left<=0)return tr('已重置');
 const min=Math.ceil(left/60000);return min<60?tr('{n} 分钟后重置',{n:min}):min<48*60?tr('{n} 小时后重置',{n:Math.round(min/60)}):tr('{n} 天后重置',{n:Math.round(min/1440)});
}
function aiAgoText(t,now=Date.now()){if(!t)return '';const min=Math.floor((now-t)/60000);return min<1?tr('刚刚'):min<60?tr('{n} 分钟前',{n:min}):min<1440?tr('{n} 小时前',{n:Math.floor(min/60)}):tr('{n} 天前',{n:Math.floor(min/1440)});}
function aiTokens(n){return n>=1e9?`${(n/1e9).toFixed(1)}B`:n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${Math.round(n/1e3)}K`:String(n);}
function aiUsd(n){return formatMoney(Math.round((n||0)*100)/100,'USD');}
function aiWhenText(t){return t?new Date(t).toLocaleString(trLocale(),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';}
const AI_SOURCE_NOTES={
 claude:()=>tr('在 Mac 上，Claude Code 的登录存在钥匙串的「Claude Code-credentials」里，读它时 macOS 会先问你'),
 codex:()=>tr('用 ~/.codex/auth.json 里 Codex 自己的登录；本机日志里已有 5 小时和每周额度，接口只是更新得更及时'),
 cursor:()=>tr('用 Cursor 本机保存的会话令牌，作为 Cookie 发给 cursor.com'),
 copilot:()=>tr('用本机 gh 的登录'),
 grok:()=>tr('用 ~/.grok/auth.json 里 Grok CLI 自己的登录'),
 opencode:()=>tr('用 opencode 里 Go 的 key'),
 antigravity:()=>tr('从 Antigravity 进程的命令行读它本机服务的 CSRF 令牌，只连 127.0.0.1，由它去问 Google')
};

// MARK: Per record
// The record's price a month in USD, or null when it has none that counts (free, no cycle, no rate).
function aiMonthlyUsd(a){const t=costTotals([{...a,hiddenAt:null,stopped:false}],{currency:'USD',rates:fx.rates});return t.monthly>0?t.monthly:null;}
// The reading a record shows, or null: only the record that owns its vendor (aiUsageOwners) shows one.
function aiQuotaFor(a){
 const snap=aiUsageSnap();if(!snap||a?.type!=='ai')return null;
 const vendor=aiVendorOf(a);if(!vendor||aiUsageOwners(state.assets).get(vendor)!==a.id)return null;
 return aiQuotaOf(a,snap,{now:Date.now(),monthlyUsd:aiMonthlyUsd(a)});
}
function aiMeter(w){return `<i class="live-meter" style="--v:${Math.min(Math.max(w.used,0),100)}%" aria-hidden="true"></i>`;}
function aiQuotaRowHtml(a){
 const q=aiQuotaFor(a);if(!q)return '';
 const parts=[];
 // The amber goes on the window that is nearly used up (or on pace to be), not on the whole line.
 for(const w of q.windows.slice(0,2)){const hot=w.used>=AI_TIGHT||w===q.top&&q.pace>100;parts.push(`<span class="aq-part${hot?' aq-hot':''}">${aiMeter(w)}${esc(aiWindowName(w))} ${Math.round(w.used)}%</span>`);}
 if(q.top?.resetsAt)parts.push(esc(aiResetText(q.top.resetsAt)));
 if(q.limitHit&&!q.windows.length)parts.push(`<span class="aq-part aq-hot">${esc(tr('额度用完，{when}',{when:aiResetText(q.limitHit.resetsAt)}))}</span>`);
 if(q.price>0&&q.idleDays!=null&&q.idleDays>=AI_IDLE_DAYS)parts.push(`<span class="aq-part aq-hot">${esc(tr('本机 {n} 天没用',{n:q.idleDays}))}</span>`);
 else if(q.value>=.1)parts.push(esc(tr('本期值 {x}×',{x:q.value})));
 else if(q.period.n)parts.push(esc(tr('本期 {money}',{money:aiUsd(q.period.cost)})));
 if(!parts.length)return '';
 const said=[...q.windows.slice(0,2).map(w=>`${aiWindowName(w)} ${Math.round(w.used)}%`),q.top?.resetsAt&&aiResetText(q.top.resetsAt)].filter(Boolean).join(tr('，'));
 return `<span class="r-probe live-line ai-quota" title="${esc(tr('AI 额度 · 实时读数'))}"><span class="live-text" aria-label="${esc(said)}">${parts.join('<span class="aq-sep" aria-hidden="true"> · </span>')}</span></span>`;
}
// The reading as a field of a wall tile (board-wall.js): per window a meter, its share and its name (the share first, so the
// shares line up down a panel and a short column cuts the name, not the number), then what needs a look; the tile shows as many
// of them as fit its column, and the title says them all.
function aiQuotaFieldHtml(a){
 const q=aiQuotaFor(a);if(!q)return '';
 const parts=[],said=[];
 for(const w of q.windows.slice(0,2)){const hot=w.used>=AI_TIGHT||w===q.top&&q.pace>100,words=`${aiWindowName(w)} ${Math.round(w.used)}%`;said.push(words);parts.push(`<span class="aq-part${hot?' aq-hot':''}">${aiMeter(w)}<span class="aq-pct">${Math.round(w.used)}%</span><span class="aq-name">${esc(aiWindowName(w))}</span></span>`);}
 if(q.limitHit&&!q.windows.length){const words=tr('额度用完，{when}',{when:aiResetText(q.limitHit.resetsAt)});said.push(words);parts.push(`<span class="aq-part aq-hot"><span class="aq-name">${esc(words)}</span></span>`);}
 if(q.price>0&&q.idleDays!=null&&q.idleDays>=AI_IDLE_DAYS){const words=tr('本机 {n} 天没用',{n:q.idleDays});said.push(words);parts.push(`<span class="aq-part aq-hot"><span class="aq-name">${esc(words)}</span></span>`);}
 if(q.top?.resetsAt)said.push(aiResetText(q.top.resetsAt));
 if(!parts.length)return '';
 const words=tr('AI 额度 · 实时读数')+tr('：')+said.join(tr('，'));
 return `<span class="r-probe live-line ai-quota" role="group" aria-label="${esc(words)}" title="${esc(words)}">${parts.join('')}</span>`;
}
function aiQuotaFactsHtml(a,row){
 const q=aiQuotaFor(a);if(!q)return '';
 const out=[],src=q.windowsFrom==='api'?tr('用量接口'):tr('本机日志');
 if(q.windows.length)out.push(`<div class="fact fact-block"><span>${tr('额度')}</span><span class="aq-wins">${q.windows.map(w=>`<span class="aq-win live-line${w.used>=AI_TIGHT?' amber':''}">${aiMeter(w)}<span class="live-text">${esc(aiWindowName(w))} ${Math.round(w.used)}%${w.limit?` · ${esc(tr('{left} / {limit} 次',{left:w.left??'',limit:w.limit}))}`:''}${w.resetsAt?` · <span title="${esc(aiWhenText(w.resetsAt))}">${esc(aiResetText(w.resetsAt))}</span>`:''}</span></span>`).join('')}</span></div>`);
 if(q.limitHit)out.push(row(tr('额度'),`<span class="fact-warn">${esc(tr('用完了，{when}',{when:aiResetText(q.limitHit.resetsAt)}))}</span>`));
 if(q.pace>100&&q.top)out.push(row(tr('速度'),`<span class="fact-warn">${esc(tr('照现在的速度，{name}会在重置前用完',{name:aiWindowName(q.top)}))}</span>`));
 if(q.period.n){
  const from=new Date(q.period.start).toLocaleDateString(trLocale(),{month:'2-digit',day:'2-digit'});
  out.push(row(tr('本期用量'),`${esc(aiUsd(q.period.cost))} <span class="quiet-fact" title="${esc(tr('按各家 API 标价折算，核对于 {date}；订阅本身不按这个收费',{date:AI_USAGE_CHECKED}))}">${esc(tr('折合 API 价'))}</span> · ${esc(aiTokens(q.period.tokens))} tokens · ${esc(tr('{n} 次',{n:q.period.n}))} · ${esc(tr('{date} 起',{date:from}))}`));
 }
 if(q.value!=null)out.push(row(tr('值不值'),esc(q.value>=1?tr('本期用量按 API 价是订阅价的 {x} 倍',{x:q.value}):tr('本期用量按 API 价只有订阅价的 {x} 倍',{x:q.value}))));
 if(q.last)out.push(row(tr('最近使用'),`${esc(aiAgoText(q.last))} · ${esc(q.sources.map(s=>AI_USAGE_SOURCES[s]?.name||s).join(tr('、')))}`));
 else out.push(row(tr('最近使用'),`<span class="quiet-fact">${esc(tr('本机没有用量记录'))}</span>`));
 if(q.block&&q.windowsFrom!=='api')out.push(row(tr('5 小时块'),`${esc(aiUsd(q.block.cost))} · ${esc(aiTokens(q.block.tokens))} tokens · <span title="${esc(tr('按本机日志估算：从第一条消息的整点起算 5 小时，和服务器的窗口不一定一致'))}">${esc(tr('{when} 结束（本机估算）',{when:aiWhenText(q.block.end)}))}</span>`));
 const extra=[q.extra&&tr('按量 {used} / {limit}',{used:aiUsd(q.extra.used),limit:q.extra.limit!=null?aiUsd(q.extra.limit):tr('不限')}),q.credits&&q.credits.balance>0&&tr('余额 {n} 点',{n:q.credits.balance}),q.overage&&tr('超出 {n} 次',{n:q.overage})].filter(Boolean);
 if(extra.length)out.push(row(tr('超额'),esc(extra.join(' · '))));
 const models=Object.entries(q.models).sort((x,y)=>y[1].cost-x[1].cost||y[1].tokens-x[1].tokens).slice(0,3);
 if(models.length)out.push(row(tr('主要模型'),esc(models.map(([m,s])=>`${m} ${s.cost?aiUsd(s.cost):aiTokens(s.tokens)}`).join(' · '))));
 if(q.plan)out.push(row(tr('套餐'),esc(q.plan)));
 if(q.ended)out.push(row(tr('套餐'),`<span class="fact-warn">${esc(tr('订阅已结束'))}</span>`));
 out.push(row(tr('读数'),`<span class="quiet-fact" title="${esc(tr('实时读数，只在内存里，不进资产数据、备份和导出'))}">${esc(src)}${q.windowsAt?` · ${esc(aiAgoText(q.windowsAt))}`:''}</span> <button class="text-button" data-action="ai-usage-open">${tr('全部用量…')}</button>`));
 return out.join('');
}
// For the MCP tools: the same reading as plain data on get_asset / list_assets.
function aiQuotaAgent(a){
 const q=aiQuotaFor(a);if(!q)return a.usageSource?{usageSource:a.usageSource}:{};
 const iso=t=>t?new Date(t).toISOString():null;
 return {usage:{vendor:q.vendor,sources:q.sources,plan:q.plan,windows:q.windows.map(w=>({id:w.id,...(w.label?{label:w.label}:{}),usedPercent:w.used,resetsAt:iso(w.resetsAt),...(w.minutes?{minutes:w.minutes}:{})})),windowsFrom:q.windowsFrom,readAt:iso(q.windowsAt),
  period:{from:iso(q.period.start),to:iso(q.period.end),apiValueUsd:q.period.cost,tokens:q.period.tokens,requests:q.period.n},priceUsd:q.price,value:q.value,lastUsed:iso(q.last),idleDays:q.idleDays,...(q.pace>100?{onPaceToRunOut:true}:{}),...(q.limitHit?{limitResetsAt:iso(q.limitHit.resetsAt)}:{}),...(q.extra?{extra:q.extra}:{})}};
}

// MARK: The band on top of 「AI 订阅」: what needs a look first (aiQuotaSignals' order), then the good news.
function aiSignalText(s,a){
 const name=displayName(a);
 if(s.kind==='full'||s.kind==='tight')return s.pace>100&&s.window.used<AI_TIGHT?tr('{name}：{window} 已用 {pct}%，照现在的速度会在重置前用完',{name,window:aiWindowName(s.window),pct:Math.round(s.window.used)}):tr('{name}：{window} 已用 {pct}%，{reset}',{name,window:aiWindowName(s.window),pct:Math.round(s.window.used),reset:aiResetText(s.window.resetsAt)||tr('重置时间未知')});
 if(s.kind==='idle'){const st=assetDateStatus(a);return st.level!=='none'&&st.days>=0?st.days===0?tr('{name}：本机 {n} 天没用，今天续费',{name,n:s.days}):tr('{name}：本机 {n} 天没用，{days} 天后续费',{name,n:s.days,days:st.days}):tr('{name}：本机 {n} 天没用',{name,n:s.days});}
 if(s.kind==='low')return tr('{name}：本期用量按 API 价只有订阅价的 {x} 倍',{name,x:s.value});
 return tr('{name}：本期用量按 API 价是订阅价的 {x} 倍',{name,x:s.value});
}
function aiQuotaBandHtml(list){
 const snap=aiUsageSnap();if(!snap)return '';
 const signals=aiQuotaSignals(state.assets.filter(a=>!isHidden(a)),snap,{now:Date.now(),monthlyUsd:aiMonthlyUsd});
 // One line per subscription, its most urgent; get_asset and list_ai_usage keep them all.
 const lines=signals.filter((s,i)=>signals.findIndex(x=>x.id===s.id)===i).slice(0,6).map(s=>{const a=state.assets.find(x=>x.id===s.id);return a?`<li class="aq-line${s.level?' '+s.level:''}">${s.level?'<i class="dot" aria-hidden="true"></i>':''}<span>${esc(aiSignalText(s,a))}</span><button class="text-button" data-action="detail" data-id="${esc(a.id)}">${tr('查看')}</button></li>`:'';}).join('');
 const found=Object.values(snap.sources||{}).filter(s=>s.found).length;
 return `<section class="aq-band" aria-label="${tr('AI 额度')}"><header class="aq-head"><span class="aq-title">${tr('AI 额度')}</span><span class="aq-meta">${found?tr('读到 {n} 个工具 · {when}',{n:found,when:aiAgoText(snap.at)}):tr('本机还没发现 AI 工具的用量')}</span><button class="text-button" data-action="ai-usage-open">${tr('全部用量…')}</button></header>${lines?`<ul class="aq-lines">${lines}</ul>`:''}</section>`;
}

// MARK: The dialog: every vendor read, the record it shows on, and every tool with its two switches.
function aiUsageDialog(){
 const snap=aiUsageSnap()||{vendors:{},sources:{}},owners=aiUsageOwners(state.assets),settings=demoMode?Object.keys(AI_USAGE_SOURCES).map(id=>({id,local:id!=='antigravity',api:id==='claude',hasLocal:id!=='antigravity'})):aiUsageNow.sources||nativeStore?.aiUsage?.sources||[];
 const vendors=Object.values(snap.vendors||{}).sort((x,y)=>(y.last||0)-(x.last||0)).map(v=>{
  const id=owners.get(v.vendor),a=id&&state.assets.find(x=>x.id===id),name=AI_USAGE_VENDORS[v.vendor]?.name||v.vendor,top=[...(v.windows||[])].sort((x,y)=>y.used-x.used)[0];
  const month=Object.entries(v.days||{}).filter(([day])=>day>=aiDayKey(Date.now()-30*86400000)).reduce((s,[,d])=>s+d.cost,0);
  const plan=v.plan&&findAiPlan(`${name} ${v.plan.replace(/^./,c=>c.toUpperCase())}`);
  const target=a?`<button class="text-button" data-action="detail" data-id="${esc(a.id)}">${esc(displayName(a))}</button>`:plan?`<button class="button" data-action="ai-usage-add" data-id="${esc(plan.name)}">${tr('添加 {name}',{name:esc(plan.name)})}</button>`:`<span class="quiet-fact">${tr('没有对应的 AI 订阅')}</span>`;
  return `<li class="aq-vendor"><span class="aq-v-name">${esc(name)}</span><span class="aq-v-read live-line${top&&top.used>=AI_TIGHT?' amber':''}">${top?`${aiMeter(top)}<span class="live-text">${esc(aiWindowName(top))} ${Math.round(top.used)}%</span>`:''}<span class="live-text">${esc(tr('30 天 {money}',{money:aiUsd(month)}))}${v.last?` · ${esc(aiAgoText(v.last))}`:''}</span></span><span class="aq-v-target">${target}</span></li>`;
 }).join('');
 const rows=Object.entries(AI_USAGE_SOURCES).map(([id,s])=>{
  const st=snap.sources?.[id]||{},set=settings.find(x=>x.id===id)||{local:s.local.length>0,api:false,hasLocal:s.local.length>0};
  const chip=st.error?`<span class="chip bad" title="${esc(st.error)}">${tr('出错')}</span>`:st.found||st.apiAt?`<span class="chip ok">${tr('读到')}</span>`:`<span class="chip">${tr('没找到')}</span>`;
  const host=(()=>{try{return new URL(s.api).host;}catch{return s.api;}})();
  return `<tr><th scope="row"><span class="aq-s-name">${esc(s.name)}</span>${st.error?`<span class="aq-s-error">${esc(st.error)}</span>`:st.last?`<span class="aq-s-when">${esc(tr('最近 {when}',{when:aiAgoText(st.last)}))}</span>`:''}</th><td>${chip}</td><td>${set.hasLocal?`<input type="checkbox" class="prefs-switch" role="switch" data-action="ai-usage-local" data-id="${id}" aria-label="${esc(tr('读 {name} 的本机文件',{name:s.name}))}" title="${esc(s.local.join('\n'))}"${set.local?' checked':''}>`:'<span class="quiet-fact">—</span>'}</td><td><input type="checkbox" class="prefs-switch" role="switch" data-action="ai-usage-api" data-id="${id}" aria-label="${esc(tr('用 {name} 的登录读额度接口',{name:s.name}))}" title="${esc(host)}"${set.api?' checked':''}></td></tr>`;
 }).join('');
 modal(tr('AI 额度与用量'),`<div class="ai-usage">${vendors?`<ul class="aq-vendors">${vendors}</ul>`:`<p class="form-note">${tr('还没有读到用量。装了 Claude Code、Codex 这类工具并用过以后，这里会自动出现')}</p>`}<table class="aq-sources"><thead><tr><th scope="col">${tr('工具')}</th><th scope="col">${tr('状态')}</th><th scope="col" title="${tr('只读本机文件里的数字，不读对话内容，不联网')}">${tr('本机文件')}</th><th scope="col" title="${tr('用这个工具自己的登录请求它的用量接口；默认关')}">${tr('额度接口')}</th></tr></thead><tbody>${rows}</tbody></table><p class="form-note" role="note">${ui('lock')}${tr('读数只在内存里，不进资产数据、备份和导出；额度接口用的登录只在请求时读取，不保存，每次请求都在网络记录里')}</p><div class="form-actions">${nativeStore&&!demoMode?`<button class="button" data-action="ai-usage-read">${ui('refresh')}${tr('立即读取')}</button>`:''}<span class="form-note">${tr('读于 {when}',{when:snap.at?aiAgoText(snap.at):'—'})}</span></div></div>`,'ai-usage');
}
async function aiUsageApiToggle(input){
 const id=input.dataset.id,s=AI_USAGE_SOURCES[id];if(!s)return;
 if(!input.checked){aiUsageSend({action:'aiUsageSet',id,api:false});return;}
 input.checked=false;
 let host=s.api;try{host=new URL(s.api).host;}catch{}
 const ok=await confirmDialog(tr('用 {name} 的登录读额度？',{name:s.name}),tr('Assetboard 会用 {name} 自己的登录，每 10 分钟最多请求一次 {host} 的用量接口。这个接口不是公开 API，随时可能改变，服务条款也没有说允许别的应用这样读；有顾虑就别打开。登录凭据只在请求时读取，不保存、不写日志、不交给 AI 工具。',{name:s.name,host})+'\n'+(AI_SOURCE_NOTES[id]?.()||''),tr('打开'));
 if(!ok){aiUsageDialog();return;}
 if(demoMode){toast(tr('演示模式不读取'));aiUsageDialog();return;}
 aiUsageSend({action:'aiUsageSet',id,api:true,confirm:true});
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
 if(action==='ai-usage-open')aiUsageDialog();
 else if(action==='ai-usage-read'){aiUsageSend({action:'aiUsageRead'});toast(tr('正在读取'));}
 else if(action==='ai-usage-local'){if(demoMode){el.checked=!el.checked;toast(tr('演示模式不读取'));return;}aiUsageSend({action:'aiUsageSet',id,local:el.checked});}
 else if(action==='ai-usage-api')aiUsageApiToggle(el);
 else if(action==='ai-usage-add'){const plan=findAiPlan(id);if(!plan)return;checkpoint();const asset={id:'asset-'+crypto.randomUUID(),type:'ai',...aiPlanFields(plan),account:'',date:'',source:'manual',event:'日期待补充',art:'generic',createdAt:new Date().toISOString()};state.assets.push(asset);if(state.cardOrder?.ai?.length)state.cardOrder.ai.unshift(asset.id);ensureBlock(state,'ai');save();render();aiUsageDialog();toast(tr('已添加「{name}」',{name:plan.name}),true);}
});

// MARK: The MCP tools (list_ai_usage, set_ai_usage_source): readings and the local switches; an endpoint is only turned on in the app.
agentMethods.aiUsage=({vendor=''}={})=>{
 if(!featureOn('aiUsage'))throw new Error(tr('AI 额度与用量在 设置 › 功能 里关着'));
 const snap=aiUsageSnap();if(!snap)throw new Error(tr('还没有读数：AI 额度与用量只在 Mac App 里读取'));
 if(vendor&&!AI_USAGE_VENDORS[vendor])throw new Error(tr('{key} 只能是 {values}',{key:'vendor',values:Object.keys(AI_USAGE_VENDORS).join(tr('、'))}));
 const owners=aiUsageOwners(state.assets),iso=t=>t?new Date(t).toISOString():null;
 const vendors=Object.values(snap.vendors||{}).filter(v=>!vendor||v.vendor===vendor).map(v=>{const id=owners.get(v.vendor),a=id&&state.assets.find(x=>x.id===id),seen=a&&agentSees(a);
  return {vendor:v.vendor,name:AI_USAGE_VENDORS[v.vendor]?.name||v.vendor,sources:v.sources,plan:v.plan||null,...(seen?{assetId:a.id,assetName:a.name}:{}),windows:(v.windows||[]).map(w=>({id:w.id,...(w.label?{label:w.label}:{}),usedPercent:w.used,resetsAt:iso(w.resetsAt)})),windowsFrom:v.windowsFrom||null,
   lastUsed:iso(v.last),days:Object.entries(v.days||{}).sort().slice(-31).map(([day,d])=>({day,apiValueUsd:d.cost,tokens:d.tokens,requests:d.n})),models:v.models||{},...(v.block?{localBlock:{start:iso(v.block.start),end:iso(v.block.end),apiValueUsd:v.block.cost,tokens:v.block.tokens}}:{}),...(v.extra?{extra:v.extra}:{}),...(v.credits?{credits:v.credits}:{})};});
 const signals=aiQuotaSignals(state.assets.filter(a=>!isHidden(a)&&agentSees(a)),snap,{now:Date.now(),monthlyUsd:aiMonthlyUsd}).map(s=>({kind:s.kind,level:s.level||null,assetId:s.id,vendor:s.vendor,...(s.window?{window:s.window.id,usedPercent:s.window.used,resetsAt:iso(s.window.resetsAt)}:{}),...(s.days!=null?{idleDays:s.days}:{}),...(s.value!=null?{value:s.value}:{})}));
 const settings=aiUsageNow.sources||nativeStore?.aiUsage?.sources||[];
 return {readAt:iso(snap.at),pricesChecked:AI_USAGE_CHECKED,signals,vendors,sources:Object.entries(AI_USAGE_SOURCES).map(([id,s])=>{const st=snap.sources?.[id]||{},set=settings.find(x=>x.id===id)||{};return {id,name:s.name,vendor:s.vendor,found:!!st.found,local:set.local??s.local.length>0,endpoint:!!set.api,...(st.last?{lastUsed:iso(st.last)}:{}),...(st.error?{error:st.error}:{})};})};
};
agentMethods.aiUsageSet=({source,local,endpoint}={})=>{
 if(!AI_USAGE_SOURCES[source])throw new Error(tr('{key} 只能是 {values}',{key:'source',values:Object.keys(AI_USAGE_SOURCES).join(tr('、'))}));
 if(endpoint!==undefined)throw new Error(tr('额度接口要用这个工具自己的登录，只能由你在 Assetboard 的「AI 额度与用量」里打开或关闭'));
 if(typeof local!=='boolean')throw new Error(tr('local 需要是 true 或 false'));
 if(!AI_USAGE_SOURCES[source].local.length)throw new Error(tr('{name} 没有本机文件可读',{name:AI_USAGE_SOURCES[source].name}));
 if(!nativeStore||demoMode)throw new Error(tr('只能在 Mac App 里设置'));
 aiUsageSend({action:'aiUsageSet',id:source,local});
 const settings=aiUsageNow.sources||[];const one=settings.find(x=>x.id===source);if(one)one.local=local;
 toast(local?tr('外部工具打开了读取 {name} 的本机文件',{name:AI_USAGE_SOURCES[source].name}):tr('外部工具关闭了读取 {name} 的本机文件',{name:AI_USAGE_SOURCES[source].name}));
 return {source,local};
};

// MARK: The demo: made-up readings for the demo board's AI records, never read from anywhere.
function aiUsageDemo(now){
 const h=3600000,d=86400000,day=n=>aiDayKey(now-n*d),days=(list)=>Object.fromEntries(list.map(([n,cost,tokens,count])=>[day(n),{cost,tokens,n:count}]));
 return {at:now-2*60000,checked:AI_USAGE_CHECKED,sources:{claude:{found:true,last:now-25*60000,apiAt:now-4*60000},codex:{found:true,last:now-3*h},cursor:{found:true},copilot:{found:true,last:now-19*d},grok:{found:true,last:now-2*d},opencode:{found:true,last:now-5*h},antigravity:{found:false}},vendors:{
  anthropic:{vendor:'anthropic',sources:['claude','opencode'],windows:[{id:'5h',used:41,resetsAt:now+2*h+14*60000,minutes:300},{id:'week',used:88,resetsAt:now+3*d+5*h,minutes:10080},{id:'week-opus',label:'Opus',used:52,resetsAt:now+3*d+5*h,minutes:10080}],windowsFrom:'api',windowsAt:now-4*60000,plan:'max',
   days:days([[0,38.4,4.1e7,212],[1,61.2,6.3e7,340],[2,22.9,2.2e7,118],[4,47.5,5e7,260],[6,30.1,3.3e7,170],[9,55,5.9e7,301],[12,12.2,1.2e7,66]]),last:now-25*60000,
   models:{'claude-opus-4-8':{tokens:2.1e8,cost:212.4,n:980},'claude-sonnet-4-6':{tokens:6.4e7,cost:41.3,n:466},'claude-haiku-4-5':{tokens:9e6,cost:3.1,n:21}},bySource:{claude:{tokens:2.7e8,cost:248.6,n:1380},opencode:{tokens:1.3e7,cost:8.2,n:87}},extra:{used:12.34,limit:50,currency:'USD'}},
  openai:{vendor:'openai',sources:['codex'],windows:[{id:'5h',used:64,resetsAt:now+h+50*60000,minutes:300},{id:'week',used:47,resetsAt:now+5*d,minutes:10080}],windowsFrom:'local',windowsAt:now-3*h,plan:'plus',
   days:days([[0,3.1,2.9e6,24],[1,6.8,6.1e6,51],[3,2.2,1.8e6,17],[8,4.4,4e6,33]]),last:now-3*h,models:{'gpt-5.2-codex':{tokens:1.4e7,cost:16.5,n:125}},bySource:{codex:{tokens:1.4e7,cost:16.5,n:125}},credits:{has:false,unlimited:false,balance:0}},
  copilot:{vendor:'copilot',sources:['copilot'],windows:[{id:'premium',used:29,resetsAt:now+21*d,minutes:null,limit:300,left:213}],windowsFrom:'api',windowsAt:now-9*60000,plan:'individual',days:days([[19,0.6,4e5,7]]),last:now-19*d,models:{'gpt-6.1-sol':{tokens:4e5,cost:.6,n:7}},bySource:{copilot:{tokens:4e5,cost:.6,n:7}}},
  grok:{vendor:'grok',sources:['grok'],windows:[{id:'week',used:37.5,resetsAt:now+3*d,minutes:10080}],windowsFrom:'api',windowsAt:now-6*60000,plan:'supergrok',days:days([[2,1.9,3.1e6,40],[5,2.6,4.4e6,52]]),last:now-2*d,models:{'grok-code-fast-1':{tokens:7.5e6,cost:4.5,n:92}},bySource:{grok:{tokens:7.5e6,cost:4.5,n:92}}},
  opencode:{vendor:'opencode',sources:['opencode'],windows:[],days:days([[0,0.4,9e5,12]]),last:now-5*h,models:{'qwen3-coder':{tokens:9e5,cost:.4,n:12}},bySource:{opencode:{tokens:9e5,cost:.4,n:12}}}
 }};
}

if(nativeStore&&!demoMode&&featureOn('aiUsage'))aiUsageSend({action:'aiUsageStart'});
