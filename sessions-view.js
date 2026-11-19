// 正在做: collect the AI coding sessions running on this Mac and keep the reading in memory. coding-sessions.js holds the
// rules; this file talks to the Mac app (bridge codingSessions → assetboardCodingSessions), refreshes on a timer, and
// exposes the result through codingData() / codingSummary() for later views (the object panorama). Nothing is drawn on
// the current board.
// A reading stays in this page's memory: not in the board, a backup, an export or localStorage, and not given to AI tools
// (MCP, assetboard-cli). This is not 外部工具接入 (features.agent) and not AI 额度与用量 (ai-usage.js); each has its own switch.
// Loaded after app.js; app.js calls in through typeof checks.

// One reading per machine, by host id; only 'local' is filled.
let codingReadings={},codingBusy=0,codingAsked=0,codingSeq=0,codingDemoData=null;
function codingOn(){return featureOn('codingSessions')&&(demoMode||!!nativeStore);}
function codingData(){
 if(!codingOn())return [];
 if(demoMode){codingDemoData=codingDemoData||(typeof window.assetboardDemoCodingSessions==='function'?parseCodingAnswer(window.assetboardDemoCodingSessions()):null);return codingDemoData?[codingDemoData]:[];}
 return Object.values(codingReadings);
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
};
// 设置 › 功能: off forgets what was read; on reads at once.
function codingSwitch(on){codingReadings={};codingDemoData=null;if(on){codingAsked=0;codingRefresh();}}
if(nativeStore&&!demoMode){setTimeout(codingDue,1200);setInterval(codingDue,10000);window.addEventListener('focus',codingDue);document.addEventListener('visibilitychange',codingDue);}
