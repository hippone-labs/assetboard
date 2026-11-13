// 待合并的 PR in the page (github-pulls.js holds the rules): a GitHub repository's line on the board says how many pull requests are
// open and how many can be merged; the inspector lists them (each opens its GitHub page); one quiet line on top of the 代码仓库
// panel sums them up. Colour only for a state: red when a check failed, amber when one has not moved for PULL_STALE_DAYS, else
// neutral; 可以合并 is set in the ink's weight, not a colour.
// The Mac app reads (bridge githubPulls → assetboardPulls) when the board opens, every PULL_REFRESH_MS while it is in front, after a
// GitHub sync and on 刷新; nothing is sent from the browser or the demo (demo-data.js answers there). The last reading is kept
// on this device only (localStorage PULLS_KEY), never in the board, a backup or an export, and not given to AI tools.
// Loaded after app.js; app.js calls in through typeof checks.

const PULLS_KEY='assetboard-pulls-v1';
let pullsNow=(()=>{if(demoMode)return null;try{return cleanPullsCache(JSON.parse(localStorage.getItem(PULLS_KEY)||'null'));}catch{return null;}})();
// The last read that failed as a whole ({reason, at, resetAt}); a good read clears it, while the reading before it stays shown.
let pullsProblem=null,pullsBusy=0,pullsAsked=pullsNow?Date.parse(pullsNow.at)||0:0,pullsSeq=0,pullsDemoData=null;
function pullsOn(){return featureOn('pulls')&&(demoMode||!!nativeStore);}
function pullsData(){
 if(!pullsOn())return null;
 if(demoMode)return pullsDemoData||(pullsDemoData=typeof window.assetboardDemoPulls==='function'?parsePullsAnswer(window.assetboardDemoPulls()):null);
 return pullsNow;
}
function pullsEntry(a){const full=githubRepoName(a),data=full&&pullsData();return data?data.repos[full.toLowerCase()]||null:null;}
function pullsArchived(a){return a.event==='已归档'||a.syncStatus==='已归档';}
function pullsRepoNames(){return [...new Set(state.assets.filter(a=>!isHidden(a)&&!pullsArchived(a)).map(githubRepoName).filter(Boolean))].slice(0,PULL_REPO_LIMIT);}

// MARK: Words
function pullsAgo(iso){return iso?runAge(iso):'';}
function pullsReadText(data){return data?.at?tr('读于 {when}',{when:pullsAgo(data.at)}):'';}
function pullsProblemText(p){
 if(!p)return '';
 if(p.reason==='nosource')return tr('本机 gh 没登录，也没有保存令牌');
 if(p.reason==='auth')return tr('GitHub 不认这个登录：重新 gh auth login，或换一个令牌');
 if(p.reason==='rate')return p.resetAt?tr('GitHub 限流，{time} 后再读',{time:new Date(p.resetAt).toLocaleTimeString(trLocale(),{hour:'2-digit',minute:'2-digit'})}):tr('GitHub 限流，稍后再读');
 return tr('连不上 GitHub');
}
function pullsProblemButton(p){
 return p&&(p.reason==='nosource'||p.reason==='auth')?`<button class="text-button" data-action="pulls-connect">${tr('连接 GitHub…')}</button>`:'';
}
function pullsRefreshButton(label=false,read=''){
 const busy=!!pullsBusy;
 return `<button class="${label?'text-button':'icon-button pr-refresh'}" data-action="pulls-refresh"${busy?' disabled':''} aria-label="${tr('刷新 PR')}" title="${busy?tr('正在读…'):esc([read,tr('刷新 PR')].filter(Boolean).join(' · '))}">${label?(busy?tr('正在读…'):tr('刷新')):ui('refresh')}</button>`;
}

// MARK: The line on the board
// For eventInfo (app.js): the repository's open pull requests as its line, or null when it has none (it keeps its quiet line then).
// A failed run of the repository's own Actions keeps the red, so a list of pull requests never hides it.
function pullsLine(a){
 const line=repoPullsLine(pullsEntry(a));if(!line||!line.total)return null;
 const ci=typeof ciRunOf==='function'?ciRunOf(a):null,bad=line.tone==='bad'||!!ci&&CI_BAD.includes(ci.state);
 // The count leads; what can be merged follows as a check and its number, spelled out in the label and the title.
 const count=tr('{n} PR',{n:formatCount(line.total)}),text=line.ready?tr('{n} PR · {ready} 可合并',{n:formatCount(line.total),ready:formatCount(line.ready)}):count;
 const html=line.ready?`${esc(count)}<span class="pr-mark" aria-hidden="true">${ui('check')}${formatCount(line.ready)}</span>`:esc(count);
 return {text,html,cls:bad?'warn overdue':line.tone==='stale'?'warn':line.ready?'pr-ready':'',dot:bad||line.tone==='stale',pulls:line};
}

// MARK: The summary
// One line on top of the 代码仓库 panel (and its own view): 3 个仓库共 5 个 PR 待合并 · 2 个可以合并 · 最老 4 天, what could not be
// read, and 刷新. Nothing before the first reading, or where there are no GitHub repositories.
function pullsSumHtml(list){
 if(!pullsOn())return '';
 const names=list.filter(a=>!pullsArchived(a)).map(githubRepoName).filter(Boolean);if(!names.length)return '';
 const data=pullsData(),problem=demoMode?null:pullsProblem;
 if(!data&&!problem)return pullsBusy?`<p class="pr-sum" role="status"><span class="pr-sum-text">${tr('正在读 PR…')}</span></p>`:'';
 const s=pullsSummary(data,names),sep='<span class="sub-sep" aria-hidden="true">·</span>',parts=[];
 if(data){
  if(s.total){
   parts.push(`<span>${tr('{repos}共 {n} 个 PR 待合并',{repos:tr('{n} 个仓库',{n:formatCount(s.repos)}),n:formatCount(s.total)})}</span>`);
   if(s.ready)parts.push(`<b class="pr-ok">${ui('check')}${tr('{n} 个可以合并',{n:formatCount(s.ready)})}</b>`);
   if(s.failing)parts.push(`<span class="pr-bad">${tr('{n} 个 CI 失败',{n:formatCount(s.failing)})}</span>`);
   if(s.oldest>=1)parts.push(`<span>${tr('最老 {n} 天',{n:formatCount(s.oldest)})}</span>`);
  }else if(s.read)parts.push(`<span>${tr('没有待合并的 PR')}</span>`);
  if(s.denied)parts.push(`<span class="pr-faint" title="${tr('当前登录看不到这些仓库：gh 换账号，或给令牌加上它们')}">${tr('{n} 个仓库没权限',{n:formatCount(s.denied)})}</span>`);
 }
 const trouble=problem?`<span class="pr-problem">${ui('warn')}${esc(pullsProblemText(problem))}</span>${pullsProblemButton(problem)}`:'';
 // Each part carries the dot after it, so a wrapped line ends with a dot instead of starting with one.
 const all=[...parts,...(trouble?[trouble]:[])].map((html,i,list)=>`<span class="pr-part">${html}${i<list.length-1?sep:''}</span>`).join('');
 return `<p class="pr-sum" role="status" aria-label="${tr('待合并的 PR')}"><span class="pr-sum-text">${all}</span>${demoMode?'':pullsRefreshButton(false,pullsReadText(data))}</p>`;
}

// MARK: The inspector
// Every open pull request of the repository: number and title, then 草稿, its checks, whether it can be merged and how long it has
// been still. A click opens its page on GitHub in the default browser; nothing is merged, closed or commented from here.
function pullMetaHtml(p,st){
 const sep='<span class="sub-sep" aria-hidden="true">·</span>';
 const ci={success:tr('CI 通过'),failure:tr('CI 失败'),pending:tr('CI 进行中'),none:tr('没有 CI')}[p.ci];
 return [st.ready?`<b class="pr-ok">${ui('check')}${tr('可以合并')}</b>`:'',p.draft?`<span class="pr-draft">${tr('草稿')}</span>`:'',
  `<span class="${p.ci==='failure'?'pr-bad':''}">${ci}</span>`,st.conflict?`<span class="pr-stale">${tr('有冲突')}</span>`:'',
  `<span class="${st.stale?'pr-stale':''}">${st.idle<1?tr('{when}更新',{when:runAge(p.updatedAt)}):tr('{n} 天没动',{n:formatCount(st.idle)})}</span>`].filter(Boolean).join(sep);
}
function pullsSection(a){
 const full=githubRepoName(a);if(!full||!pullsOn()||isHidden(a))return '';
 const data=pullsData(),entry=pullsEntry(a),problem=demoMode?null:pullsProblem,now=Date.now();
 const count=entry?.pulls?.length?`<span class="pr-count">${formatCount(entry.total)}</span>`:'';
 const head=`<div class="pay-head pr-head"><h3>${tr('打开的 PR')}</h3>${count}<span class="pr-when">${esc(pullsReadText(data))}</span>${demoMode?'':pullsRefreshButton(true)}</div>`;
 let body='';
 if(entry?.error)body=`<p class="pr-note">${entry.error==='denied'?tr('当前登录看不到这个仓库：gh 换账号，或给令牌加上它'):tr('这次没读到这个仓库')}</p>`;
 else if(entry?.pulls){
  const rank=s=>s.ready?0:s.failing?1:2;
  const items=entry.pulls.map(p=>({p,st:pullState(p,now)})).sort((x,y)=>rank(x.st)-rank(y.st)).map(({p,st})=>`<li><button class="pr-item${st.ready?' ready':''}" data-action="open-pr" data-id="${esc(a.id)}" data-n="${p.number}" title="${esc(tr('在浏览器打开 #{n}',{n:p.number}))}"><span class="pr-line"><span class="pr-num">#${p.number}</span><span class="pr-title">${esc(p.title||tr('（无标题）'))}</span></span><span class="pr-meta">${pullMetaHtml(p,st)}</span></button></li>`).join('');
  body=items?`<ul class="pr-list">${items}</ul>${entry.more?`<p class="pr-note">${tr('只列出最近更新的 {n} 个',{n:formatCount(entry.pulls.length)})}</p>`:''}`:`<p class="pr-note">${tr('没有打开的 PR')}</p>`;
 }else if(!problem)body=`<p class="pr-note">${pullsBusy?tr('正在读…'):tr('还没读过')}</p>`;
 const trouble=problem?`<p class="pr-note pr-problem">${ui('warn')}<span>${esc(pullsProblemText(problem))}</span>${pullsProblemButton(problem)}</p>`:'';
 return `<section class="pay-section pr-section" aria-label="${tr('打开的 PR')}">${head}${body}${trouble}</section>`;
}

// MARK: Reading
function pullsRedraw(){
 if(typeof gesture!=='undefined'&&gesture?.active){setTimeout(pullsRedraw,400);return;}
 render();const a=activeAsset&&!$('#detail').hidden&&state.assets.find(x=>x.id===activeAsset);
 if(a&&githubRepoName(a)){const focused=document.activeElement?.closest?.('#detail [data-action="pulls-refresh"]');showDetail(a.id,{still:true,focus:false});if(focused)$('#detail [data-action="pulls-refresh"]')?.focus();}
}
function pullsRefresh(manual=false){
 if(!pullsOn()||demoMode||!nativeStore)return false;
 const now=Date.now();if(pullsBusy&&now-pullsBusy<90000)return false;
 if(!manual&&pullsProblem?.reason==='rate'&&pullsProblem.resetAt&&now<Date.parse(pullsProblem.resetAt))return false;
 const repos=pullsRepoNames();if(!repos.length)return false;
 pullsBusy=now;pullsAsked=now;
 try{window.webkit.messageHandlers.assetboard.postMessage({action:'githubPulls',requestId:++pullsSeq,repos});}catch{pullsBusy=0;return false;}
 if(manual)pullsRedraw();
 return true;
}
function pullsDue(){if(document.visibilityState!=='hidden'&&Date.now()-pullsAsked>=PULL_REFRESH_MS)pullsRefresh();}
window.assetboardPulls=result=>{
 pullsBusy=0;
 const read=parsePullsAnswer(result);
 if(read){pullsNow=read;pullsProblem=null;try{localStorage.setItem(PULLS_KEY,JSON.stringify(read));}catch{}}
 else{const reason=['nosource','auth','rate','net'].includes(result?.reason)?result.reason:'net',reset=Date.parse(result?.resetAt);pullsProblem={reason,at:new Date().toISOString(),resetAt:isNaN(reset)?'':new Date(reset).toISOString()};}
 pullsRedraw();
};
function pullsAction(action,button){
 if(action==='pulls-connect'){if(typeof githubDialog==='function')githubDialog();return;}
 if(action==='pulls-refresh'){if(demoMode){toast(tr('演示数据，不联网'));return;}if(!pullsRefresh(true)&&!pullsBusy)toast(tr('没有可读的 GitHub 仓库'));return;}
 if(action==='open-pr'){
  const a=state.assets.find(x=>x.id===button.dataset.id),p=pullsEntry(a)?.pulls?.find(x=>String(x.number)===button.dataset.n);if(!p)return;
  if(demoMode){window.assetboardDemoBlocked?.();return;}
  if(nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url:p.url});else window.open(p.url,'_blank','noopener,noreferrer');
 }
}
// A GitHub sync brings repositories in: their pull requests are read right after.
{const done=window.assetboardGitHubResult;window.assetboardGitHubResult=r=>{done(r);if(r?.ok&&!r.disconnected)setTimeout(()=>pullsRefresh(),300);};}
if(nativeStore&&!demoMode){setTimeout(pullsDue,1500);setInterval(pullsDue,60000);window.addEventListener('focus',pullsDue);document.addEventListener('visibilitychange',pullsDue);}
// app.js drew the board before this file was there: draw it again once there is something to show.
if(pullsData()){skipLayoutAnimation=true;pullsRedraw();}
