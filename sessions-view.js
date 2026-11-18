// 正在做 in the page (coding-sessions.js holds the rules): under the overview of 全部资产, how many AI coding sessions run on this
// Mac, then each tool's sessions: repository, branch, how long it has run. Neutral throughout; only the state is marked: a busy
// session has a solid dot, an idle one is grey, and a tool whose files are not followed is only said to be running.
// The Mac app reads (bridge codingSessions → assetboardCodingSessions) when the board opens and every CODING_REFRESH_MS while the
// window is in front; nothing is asked from the browser or the demo (demo-data.js answers there). A reading stays in this page's
// memory: not in the board, a backup, an export or localStorage, and not given to AI tools (MCP, assetboard-cli).
// This is not 外部工具接入 (features.agent: what tools did to the board through MCP) and not AI 额度与用量 (ai-usage.js: plan
// limits and usage numbers); each has its own switch.
// Loaded after app.js; app.js calls in through typeof checks.

// One reading per machine, by host id; only 'local' is filled.
let codingReadings={},codingBusy=0,codingAsked=0,codingSeq=0,codingDemoData=null,codingDrawn='';
function codingOn(){return featureOn('codingSessions')&&(demoMode||!!nativeStore);}
function codingData(){
 if(!codingOn())return [];
 if(demoMode){codingDemoData=codingDemoData||(typeof window.assetboardDemoCodingSessions==='function'?parseCodingAnswer(window.assetboardDemoCodingSessions()):null);return codingDemoData?[codingDemoData]:[];}
 return Object.values(codingReadings);
}

// MARK: Words
function codingElapsed(minutes){
 if(minutes==null)return '';
 if(minutes<60)return tr('{n} 分钟',{n:minutes});
 if(minutes<1440)return minutes%60?tr('{h} 小时 {m} 分钟',{h:Math.floor(minutes/60),m:minutes%60}):tr('{n} 小时',{n:minutes/60});
 return tr('{n} 天',{n:Math.floor(minutes/1440)});
}
const codingCount=n=>tr('{n} 个会话',{n:formatCount(n)});
// What a session is in: its repository (masked with the board's names), ~ or a folder; nothing for an application.
function codingWhere(s){return s.repo==='~'||s.repo==='/'?s.repo:veil(s.repo);}
// Claude Code · 2 个会话 · atlas-ui · 38 分钟: the tool, its sessions, and the leading one's repository and time.
function codingToolLine(t){
 const lead=t.sessions[0];
 return [t.name,codingCount(t.count),lead&&codingWhere(lead),lead&&codingElapsed(lead.minutes)].filter(Boolean).join(' · ');
}
function codingStateWord(s){return s.state==='idle'?tr('空闲'):s.state==='active'?tr('活动'):tr('运行中');}

// MARK: The block
function codingSessionHtml(s){
 const where=codingWhere(s),time=codingElapsed(s.minutes),sep='<span class="sub-sep" aria-hidden="true">·</span>';
 const hint=[!privacy&&s.path&&s.path!==s.repo?s.path:'',s.state==='idle'&&s.activeAt?tr('最近一次写入 {when}',{when:runAge(s.activeAt)}):''].filter(Boolean).join('\n');
 const branch=s.branch?`<span class="doing-branch"${s.detached?` title="${tr('没有检出分支，这是提交号')}"`:''}>${esc(veil(s.branch))}</span>`:'';
 return `<li class="doing-session ${s.state}"${hint?` title="${esc(hint)}"`:''}><i class="doing-dot" aria-hidden="true"></i><span class="doing-where">${where?`<b class="doing-repo">${esc(where)}</b>`:''}${branch}</span><span class="doing-time">${[time&&`<span>${esc(time)}</span>`,s.state!=='active'&&`<span class="doing-state">${codingStateWord(s)}</span>`].filter(Boolean).join(sep)}</span>${s.state==='active'?`<span class="sr-only">${tr('，')}${codingStateWord(s)}</span>`:''}</li>`;
}
function codingHtml(){
 const sum=codingSummary(codingData());if(!sum.total)return '';
 const note=[sum.idle&&sum.idle<sum.total?tr('{n} 个空闲',{n:formatCount(sum.idle)}):sum.idle?tr('都空闲'):'',tr('本机')].filter(Boolean).join(' · ');
 const tools=sum.tools.map(t=>`<li class="doing-tool" aria-label="${esc(codingToolLine(t))}"><span class="doing-name"><b>${esc(t.name)}</b><span class="doing-n">${codingCount(t.count)}</span></span><ul class="doing-sessions">${t.sessions.map(codingSessionHtml).join('')}</ul></li>`).join('');
 return `<section class="doing" role="group" aria-label="${tr('正在做')}"><div class="doing-main"><span class="ov-label">${tr('正在做')}</span><strong class="ov-value">${formatCount(sum.total)}</strong><span class="ov-note">${tr('个会话',{n:sum.total})}${note?' · '+esc(note):''}</span></div><ul class="doing-tools">${tools}</ul></section>`;
}

// MARK: Reading
// A new reading redraws only the block; the whole board is drawn again only when the block comes or goes.
function codingRedraw(){
 const el=document.querySelector('#board .doing'),html=typeof currentView==='function'&&currentView()==='all'&&!query?codingHtml():'';
 if(el&&html){if(html!==codingDrawn){el.outerHTML=html;codingDrawn=html;}return;}
 if(!el&&!html)return;
 if(typeof gesture!=='undefined'&&gesture?.active||!$('#menu').hidden){setTimeout(codingRedraw,1500);return;}
 skipLayoutAnimation=true;render();
}
function codingRefresh(){
 if(!codingOn()||demoMode||!nativeStore)return false;
 const now=Date.now();if(codingBusy&&now-codingBusy<20000)return false;
 codingBusy=now;codingAsked=now;
 try{window.webkit.messageHandlers.assetboard.postMessage({action:'codingSessions',requestId:++codingSeq});}catch{codingBusy=0;return false;}
 return true;
}
function codingDue(){if(document.visibilityState!=='hidden'&&Date.now()-codingAsked>=CODING_REFRESH_MS)codingRefresh();}
window.assetboardCodingSessions=result=>{
 codingBusy=0;if(!codingOn())return;
 const read=parseCodingAnswer(result);
 // A read that failed leaves nothing behind: sessions that may have ended are not shown on.
 if(read)codingReadings={...codingReadings,[read.host.id]:read};else codingReadings={};
 codingRedraw();
};
// 设置 › 功能: off forgets what was read; on reads at once.
function codingSwitch(on){codingReadings={};if(on){codingAsked=0;codingRefresh();}}
if(nativeStore&&!demoMode){setTimeout(codingDue,1200);setInterval(codingDue,10000);window.addEventListener('focus',codingDue);document.addEventListener('visibilitychange',codingDue);}
// The durations move on between readings.
setInterval(()=>{if(document.visibilityState!=='hidden'&&document.querySelector('#board .doing'))codingRedraw();},60000);
// app.js drew the board before this file was there: draw it again once there is something to show.
if(codingData().length){skipLayoutAnimation=true;codingRedraw();}
