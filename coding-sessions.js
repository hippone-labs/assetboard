// 正在做: the AI coding sessions running on this Mac (Claude Code, Codex, Cursor and its agent, …). The Mac app passes on plain
// facts (desktop/CodingSessions.swift): of the processes that could be such a tool, the executable's name and path, the working
// directory and the start time; every process's parent; the first line of .git/HEAD above a working directory; and when the tools'
// session files were last written. This file decides which processes are sessions, names the repository and the branch, and says
// whether a session is busy. Pure: no DOM, no board, no tr(), so node tests run it with made-up processes and directories
// (tests/coding-sessions.test.js); sessions-view.js words and draws it.
//
// What is never read, here or in the Mac app: a process's arguments or environment (a prompt can be typed on the command line),
// and the inside of any session file (only its folder's name and its times). What a session is doing is its repository and
// branch, nothing more.
//
// The facts of one machine, as its collector answers ({ok:true, …}):
//  at         when it was read (ISO)
//  home       the home directory, to shorten paths to ~
//  processes  [{pid, ppid}] for every process, plus {name, path, cwd, start (seconds)} on those that could be a tool
//  repos      {[cwd]: {root, gitdir, head}}: the folder holding .git, where its HEAD lives, and HEAD's first line
//  files      {[tool]: [{dir, mtime, birth}]}: recently written session files (folder name, seconds)
// A reading is {host:{id, kind, name}, at, sessions:[…]}. Other machines come in as more readings of the same shape (another Mac
// over Tailscale, a server over SSH: kind mac | server); only this Mac (kind local) is read.
//
// A session is {tool, pid, repo, branch, detached, path, startedAt, activeAt, tracked}:
//  repo      the repository's folder name (a linked worktree gives its main repository), else the working directory's own name
//  branch    the checked-out branch, or seven characters of the commit when HEAD is detached
//  path      the working directory, ~ for the home directory
//  activeAt  when its session file was last written (ISO), '' when it has none yet or the tool's files are not followed
//  tracked   whether the tool's session files are followed at all; without them a session is neither busy nor idle, only running

const CODING_REFRESH_MS=30000,CODING_ACTIVE_MS=3*60000,CODING_SESSION_LIMIT=60,CODING_BIRTH_SLACK=120;
// names: the executable's file name (or the process name). paths: its whole path. app: an application's main executable; nothing
// else inside an application bundle counts (helpers, and desktop apps that only share a tool's name).
// files: how session files are tied to a session: 'dir' by the folder named after the working directory, 'birth' by a file
// created when the process started.
const CODING_TOOLS=[
 {id:'claude',name:'Claude Code',names:['claude'],paths:[/\/claude\/versions\/[^/]+$/],files:'dir'},
 {id:'codex',name:'Codex',names:['codex'],paths:[/\/codex-[a-z0-9_]+-apple-darwin$/],files:'birth'},
 {id:'cursor-agent',name:'Cursor Agent',names:['cursor-agent'],paths:[/\/cursor-agent\//]},
 {id:'cursor',name:'Cursor',app:/\/Cursor\.app\/Contents\/MacOS\/Cursor$/},
 {id:'opencode',name:'opencode',names:['opencode']},
 {id:'gemini',name:'Gemini CLI',names:['gemini']},
 {id:'copilot',name:'Copilot CLI',names:['copilot']},
 {id:'grok',name:'Grok CLI',names:['grok']}
];
const codingTool=id=>CODING_TOOLS.find(t=>t.id===id)||null;
const codingText=(v,max=1024)=>typeof v==='string'&&v.length<=max?v:'';
const codingBase=path=>{const parts=String(path||'').split('/').filter(Boolean);return parts.length?parts[parts.length-1]:'';};

// Which tool a process is, by its executable alone: '' for everything else.
function codingToolOf(p){
 const path=codingText(p?.path),name=codingText(p?.name,255);if(!path&&!name)return '';
 if(path.includes('.app/Contents/'))return CODING_TOOLS.find(t=>t.app?.test(path))?.id||'';
 const base=codingBase(path).toLowerCase(),short=name.toLowerCase();
 return CODING_TOOLS.find(t=>t.names?.includes(base)||t.paths?.some(re=>re.test(path))||!path&&t.names?.includes(short))?.id||'';
}

// The branch HEAD's first line names: {branch, detached}.
function codingBranch(head){
 const line=codingText(head,400).split('\n')[0].trim(),ref=/^ref:\s*refs\/heads\/(.+)$/.exec(line);
 if(ref)return {branch:ref[1].slice(0,120),detached:false};
 return /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(line)?{branch:line.slice(0,7).toLowerCase(),detached:true}:{branch:'',detached:false};
}
// The repository's name: a linked worktree's HEAD lives in <main>/.git/worktrees/<name>, and <main> is the repository.
function codingRepoName(repo,cwd){
 const main=/^(.*)\/\.git\/worktrees\/[^/]+\/?$/.exec(codingText(repo?.gitdir));
 return codingBase(main?main[1]:codingText(repo?.root)||cwd).slice(0,120);
}
function codingShortPath(path,home){
 const h=codingText(home).replace(/\/+$/,'');
 return h&&(path===h||path.startsWith(h+'/'))?'~'+path.slice(h.length):path;
}
// Claude Code names a project's folder after its working directory, every character that is not a letter or a digit as '-'.
const codingClaudeDir=cwd=>String(cwd||'').replace(/[^A-Za-z0-9]/g,'-');
const codingIso=seconds=>Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():'';

// One machine's facts → its reading, or null when the answer is not one.
function parseCodingAnswer(raw,now=Date.now()){
 if(!raw||typeof raw!=='object'||raw.ok!==true||!Array.isArray(raw.processes))return null;
 const parents=new Map(),tools=new Map(),nowS=now/1000;
 for(const p of raw.processes.slice(0,20000)){
  if(!p||!Number.isInteger(p.pid)||p.pid<1)continue;
  parents.set(p.pid,Number.isInteger(p.ppid)&&p.ppid>0?p.ppid:0);
  const tool=codingToolOf(p);if(tool)tools.set(p.pid,{tool,p});
 }
 // A tool started by the same tool (a helper, a sub-agent) is part of the session above it.
 const nested=(pid,tool)=>{for(let at=parents.get(pid),i=0;at&&i<64;at=parents.get(at),i++)if(tools.get(at)?.tool===tool)return true;return false;};
 const repos=raw.repos&&typeof raw.repos==='object'?raw.repos:{},files=raw.files&&typeof raw.files==='object'?raw.files:{};
 const fileList=tool=>(Array.isArray(files[tool])?files[tool]:[]).slice(0,2000).filter(f=>f&&Number.isFinite(f.mtime)&&f.mtime>0&&f.mtime<=nowS+60);
 const sessions=[];
 for(const [pid,{tool,p}] of tools){
  if(nested(pid,tool))continue;
  const cwd=codingText(p.cwd),start=Number.isFinite(p.start)&&p.start>0&&p.start<=nowS+60?p.start:0,spec=codingTool(tool);
  const repo=Object.hasOwn(repos,cwd)&&repos[cwd]&&typeof repos[cwd]==='object'?repos[cwd]:null,head=codingBranch(repo?.head);
  const short=codingShortPath(cwd,raw.home),named=repo?codingRepoName(repo,cwd):short==='~'?'~':codingBase(cwd)||(cwd==='/'?'/':'');
  sessions.push({tool,pid,repo:spec.app?'':named.slice(0,120),branch:spec.app?'':head.branch,detached:!spec.app&&head.detached,
   path:spec.app?'':short,startedAt:codingIso(start),activeAt:'',tracked:!!spec.files,cwd,root:codingText(repo?.root),start});
 }
 // Session files. 'dir': the newest file in the folder named after the working directory (or the repository's root), written
 // since the process started. 'birth': each file goes to the session started closest to the file's creation; a tool's only
 // session takes its newest file when none was created with it (a resumed session writes on in its old file).
 for(const spec of CODING_TOOLS.filter(t=>t.files)){
  const mine=sessions.filter(s=>s.tool===spec.id),list=fileList(spec.id);if(!mine.length||!list.length)continue;
  const newest=(s,fits)=>Math.max(0,...list.filter(f=>f.mtime>=s.start-2&&fits(f)).map(f=>f.mtime));
  if(spec.files==='dir')for(const s of mine){const names=[s.cwd,s.root].filter(Boolean).map(codingClaudeDir);s.activeAt=codingIso(newest(s,f=>names.includes(f.dir)));}
  else{
   const pairs=[];
   for(const s of mine)if(s.start)list.forEach((f,i)=>{if(Number.isFinite(f.birth)&&Math.abs(f.birth-s.start)<=CODING_BIRTH_SLACK)pairs.push({s,i,gap:Math.abs(f.birth-s.start)});});
   const taken=new Set(),done=new Set();
   for(const {s,i} of pairs.sort((x,y)=>x.gap-y.gap)){if(taken.has(i)||done.has(s))continue;taken.add(i);done.add(s);s.activeAt=codingIso(Math.max(list[i].mtime,s.start));}
   if(mine.length===1&&!done.size)mine[0].activeAt=codingIso(newest(mine[0],()=>true));
  }
 }
 const order=id=>CODING_TOOLS.findIndex(t=>t.id===id);
 sessions.sort((x,y)=>order(x.tool)-order(y.tool)||y.start-x.start||x.pid-y.pid);
 const at=Date.parse(raw.at);
 return {host:{id:'local',kind:'local',name:''},at:new Date(isNaN(at)?now:Math.min(at,now)).toISOString(),
  sessions:sessions.slice(0,CODING_SESSION_LIMIT).map(({cwd,root,start,...s})=>s)};
}

// active: its session file was written within CODING_ACTIVE_MS (or it has none yet and only just started). idle: longer ago.
// running: the tool's files are not followed, so nothing is said either way.
function codingState(s,now=Date.now()){
 if(!s.tracked)return 'running';
 const last=Date.parse(s.activeAt)||Date.parse(s.startedAt)||0;
 return last&&now-last<=CODING_ACTIVE_MS?'active':'idle';
}
const codingMinutes=(s,now=Date.now())=>{const t=Date.parse(s.startedAt);return isNaN(t)?null:Math.max(0,Math.floor((now-t)/60000));};

// Over every machine read: {total, active, idle, hosts, tools:[{id, name, count, active, idle, sessions:[{…session, host, state, minutes}]}]}.
// Within a tool the busy sessions lead, then the ones started last.
function codingSummary(readings,now=Date.now()){
 const all=(Array.isArray(readings)?readings:[readings]).filter(r=>r&&Array.isArray(r.sessions)).flatMap(r=>r.sessions.map(s=>({...s,host:r.host?.id||'local',state:codingState(s,now),minutes:codingMinutes(s,now)})));
 const rank={active:0,running:1,idle:2},count=(list,state)=>list.filter(s=>s.state===state).length;
 const tools=CODING_TOOLS.map(t=>{
  const list=all.filter(s=>s.tool===t.id).sort((x,y)=>rank[x.state]-rank[y.state]||(x.minutes??Infinity)-(y.minutes??Infinity));
  return {id:t.id,name:t.name,count:list.length,active:count(list,'active'),idle:count(list,'idle'),sessions:list};
 }).filter(t=>t.count);
 return {total:all.length,active:count(all,'active'),idle:count(all,'idle'),hosts:new Set(all.map(s=>s.host)).size,tools};
}

if(typeof module!=='undefined')module.exports={CODING_REFRESH_MS,CODING_ACTIVE_MS,CODING_SESSION_LIMIT,CODING_TOOLS,codingToolOf,codingBranch,codingRepoName,codingShortPath,codingClaudeDir,parseCodingAnswer,codingState,codingMinutes,codingSummary};
