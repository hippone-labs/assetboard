// 待合并的 PR: the open pull requests of the GitHub repositories on the board. The Mac app reads them (desktop/GitHubPulls.swift:
// GitHub's GraphQL API, the local gh's logins first, then the token the GitHub dialog saved in the Keychain) and passes GitHub's
// answer on as it came; this file checks and shortens it, and says what each pull request needs. Pure: no DOM, no board, no tr(),
// so node tests run it (tests/github-pulls.test.js); pulls-view.js words and draws it.
//
// A pull request is {number, title, url, draft, ci, merge, createdAt, updatedAt, author}:
//  ci     success | failure | pending | none (no checks on its last commit)
//  merge  clean | conflict | unknown (GitHub has not worked it out yet)
// 可以合并 (ready): not a draft, no conflict, and its checks green (or none at all: nothing is red).
// 久未动 (stale): not a draft and not updated for PULL_STALE_DAYS. A draft is its author's to finish, so it never colours the board.

const PULL_STALE_DAYS=3,PULL_PER_REPO=30,PULL_REPO_LIMIT=100,PULL_REFRESH_MS=15*60000,PULL_DAY=86400000;
const PULL_CI={SUCCESS:'success',FAILURE:'failure',ERROR:'failure',PENDING:'pending',EXPECTED:'pending'};
const PULL_MERGE={MERGEABLE:'clean',CONFLICTING:'conflict',UNKNOWN:'unknown'};
const PULL_OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,PULL_NAME=/^[A-Za-z0-9._-]{1,100}$/;

// owner/name of a record that is a GitHub repository: from its github.com address, else a synced or GitHub-hosted record's name.
function githubRepoName(a){
 if(!a||a.type!=='repository')return '';
 const ok=(o,n)=>PULL_OWNER.test(o)&&PULL_NAME.test(n)&&n!=='.'&&n!=='..'?`${o}/${n}`:'';
 const m=/^https:\/\/(?:www\.)?github\.com\/([^/?#\s]+)\/([^/?#\s]+?)(?:\.git)?\/?(?:[?#].*)?$/i.exec(String(a.url||'').trim());
 if(m)return ok(m[1],m[2]);
 const n=/^([^/\s]+)\/([^/\s]+)$/.exec(String(a.name||'').trim());
 return n&&(a.source==='github'||/^github$/i.test(String(a.provider||'').trim()))?ok(n[1],n[2]):'';
}
const pullKey=full=>String(full||'').toLowerCase();
function pullTime(v){const t=Date.parse(v);return typeof v==='string'&&!isNaN(t)?new Date(t).toISOString():'';}

// One node of GitHub's answer (GraphQL pullRequests.nodes) for the repository full, or null when it is not one: its link must be
// that repository's own pull request page on github.com.
function parsePull(full,node){
 if(!node||typeof node!=='object')return null;
 const number=node.number;if(!Number.isInteger(number)||number<1||number>1e9)return null;
 const url=String(node.url||'');if(url.toLowerCase()!==`https://github.com/${pullKey(full)}/pull/${number}`)return null;
 const title=String(node.title??'').replace(/\s+/g,' ').trim().slice(0,300);
 const rollup=node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
 const ci=rollup?PULL_CI[rollup.state]||'pending':'none';
 return {number,title,url,draft:node.isDraft===true,ci,merge:PULL_MERGE[node.mergeable]||'unknown',createdAt:pullTime(node.createdAt),updatedAt:pullTime(node.updatedAt)||pullTime(node.createdAt),author:typeof node.author?.login==='string'?node.author.login.slice(0,39):''};
}
// A repository's part of the answer: {pulls (most recently updated first), total, more} or {error: denied | unread}.
function parsePulls(full,raw){
 if(!raw||typeof raw!=='object')return {error:'unread'};
 if(raw.error)return {error:raw.error==='denied'?'denied':'unread'};
 const pulls=(Array.isArray(raw.nodes)?raw.nodes:[]).slice(0,PULL_PER_REPO).map(n=>parsePull(full,n)).filter(Boolean);
 const seen=new Set(),unique=pulls.filter(p=>!seen.has(p.number)&&seen.add(p.number)).sort((x,y)=>(Date.parse(y.updatedAt)||0)-(Date.parse(x.updatedAt)||0));
 const total=Number.isInteger(raw.total)&&raw.total>=unique.length?raw.total:unique.length;
 return {pulls:unique,total,more:total>unique.length};
}
// The app's answer ({ok, at, via, repos}) as the page keeps it: repos keyed by lower-case owner/name.
function parsePullsAnswer(answer){
 if(!answer||answer.ok!==true||!answer.repos||typeof answer.repos!=='object')return null;
 const repos={};
 for(const [full,raw] of Object.entries(answer.repos).slice(0,PULL_REPO_LIMIT)){const [o,n]=full.split('/');if(o&&n&&PULL_OWNER.test(o)&&PULL_NAME.test(n))repos[pullKey(full)]={full,...parsePulls(full,raw)};}
 return {at:pullTime(answer.at)||new Date().toISOString(),via:(Array.isArray(answer.via)?answer.via:[]).filter(v=>v==='gh'||v==='token'),repos};
}

function pullDays(iso,now){const t=Date.parse(iso);return isNaN(t)?0:Math.max(0,Math.floor((now-t)/PULL_DAY));}
// What one pull request needs.
function pullState(p,now=Date.now()){
 const idle=pullDays(p.updatedAt,now),age=pullDays(p.createdAt||p.updatedAt,now);
 return {ready:!p.draft&&p.merge==='clean'&&(p.ci==='success'||p.ci==='none'),failing:!p.draft&&p.ci==='failure',stale:!p.draft&&idle>=PULL_STALE_DAYS,conflict:p.merge==='conflict',idle,age};
}
// A repository's line: how many are open, ready, failing, stale, the oldest's age, and its tone (bad > stale > '').
function repoPullsLine(entry,now=Date.now()){
 if(!entry||entry.error||!Array.isArray(entry.pulls))return null;
 const states=entry.pulls.map(p=>pullState(p,now));
 const count=k=>states.filter(s=>s[k]).length,failing=count('failing'),stale=count('stale');
 return {total:entry.total??entry.pulls.length,ready:count('ready'),failing,stale,oldest:Math.max(0,...states.map(s=>s.age)),tone:failing?'bad':stale?'stale':''};
}
// The board's summary over the repositories listed (owner/name): repositories with open pull requests, all of them, ready, failing,
// stale, the oldest's age, and how many repositories could not be read.
function pullsSummary(data,names,now=Date.now()){
 const out={repos:0,total:0,ready:0,failing:0,stale:0,oldest:0,denied:0,unread:0,read:0};if(!data?.repos)return out;
 for(const full of new Set(names.map(pullKey))){
  const entry=data.repos[full];if(!entry){out.unread++;continue;}
  if(entry.error){out[entry.error==='denied'?'denied':'unread']++;continue;}
  out.read++;const line=repoPullsLine(entry,now);if(!line||!line.total)continue;
  out.repos++;out.total+=line.total;out.ready+=line.ready;out.failing+=line.failing;out.stale+=line.stale;out.oldest=Math.max(out.oldest,line.oldest);
 }
 return out;
}
// The kept reading (localStorage): checked again on load, so a hand-edited or old value cannot draw anything unexpected.
function cleanPullsCache(v){
 if(!v||typeof v!=='object'||!v.repos||typeof v.repos!=='object')return null;
 const repos={};
 for(const [key,e] of Object.entries(v.repos).slice(0,PULL_REPO_LIMIT)){
  if(!e||typeof e.full!=='string'||pullKey(e.full)!==key)continue;
  repos[key]=e.error?{full:e.full,error:e.error==='denied'?'denied':'unread'}:{full:e.full,...parsePulls(e.full,{total:e.total,nodes:(Array.isArray(e.pulls)?e.pulls:[]).map(p=>({number:p.number,title:p.title,url:p.url,isDraft:p.draft,createdAt:p.createdAt,updatedAt:p.updatedAt,mergeable:Object.keys(PULL_MERGE).find(k=>PULL_MERGE[k]===p.merge),author:{login:p.author},commits:{nodes:[{commit:{statusCheckRollup:p.ci==='none'?null:{state:Object.keys(PULL_CI).find(k=>PULL_CI[k]===p.ci)}}}]}}))})};
 }
 return {at:pullTime(v.at),via:(Array.isArray(v.via)?v.via:[]).filter(x=>x==='gh'||x==='token'),repos};
}

if(typeof module!=='undefined')module.exports={PULL_STALE_DAYS,PULL_PER_REPO,PULL_REPO_LIMIT,PULL_REFRESH_MS,PULL_CI,PULL_MERGE,githubRepoName,parsePull,parsePulls,parsePullsAnswer,pullState,repoPullsLine,pullsSummary,cleanPullsCache};
