// 正在做 (coding-sessions.js): which processes are AI coding tools, which of them are sessions, the repository and branch of each
// from made-up folders, and busy or idle from made-up session file times. Nothing here looks at a real process or a real disk.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CODING_ACTIVE_MS,CODING_SESSION_LIMIT,codingToolOf,codingBranch,codingRepoName,codingShortPath,codingClaudeDir,parseCodingAnswer,codingState,codingSummary}=require('../coding-sessions.js');

const NOW=Date.parse('2026-11-18T12:00:00Z'),ago=minutes=>Math.round(NOW/1000-minutes*60),HOME='/Users/demo';
const CLAUDE=`${HOME}/.local/share/claude/versions/2.1.40`;
const proc=(pid,ppid,path,cwd,minutes,name)=>({pid,ppid,name:name??path.split('/').pop(),path,cwd,start:ago(minutes)});
const git=(root,branch,gitdir)=>({root,gitdir:gitdir||root+'/.git',head:`ref: refs/heads/${branch}`});
const facts=(o={})=>({ok:true,at:new Date(NOW).toISOString(),home:HOME,processes:[{pid:1,ppid:0},{pid:300,ppid:1}],repos:{},files:{},...o});

test('a tool is known by its executable alone',()=>{
 assert.equal(codingToolOf({path:CLAUDE,name:'2.1.40'}),'claude','the native install is named by its version');
 assert.equal(codingToolOf({path:'/opt/homebrew/bin/claude'}),'claude');
 assert.equal(codingToolOf({path:`${HOME}/.cursor/extensions/vendor.claude-code-2.1.40/resources/native-binary/claude`}),'claude','run by an editor extension');
 assert.equal(codingToolOf({path:'/opt/homebrew/bin/codex'}),'codex');
 assert.equal(codingToolOf({path:'/opt/homebrew/lib/node_modules/@openai/codex/vendor/codex-aarch64-apple-darwin'}),'codex');
 assert.equal(codingToolOf({path:`${HOME}/.local/share/cursor-agent/versions/2026.11.01/node`}),'cursor-agent');
 assert.equal(codingToolOf({path:'/Applications/Cursor.app/Contents/MacOS/Cursor'}),'cursor');
 assert.equal(codingToolOf({path:'/Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin)'}),'','a helper is not the application');
 assert.equal(codingToolOf({path:'/Applications/Claude.app/Contents/MacOS/Claude',name:'Claude'}),'','a desktop app that shares the name is not a coding session');
 assert.equal(codingToolOf({path:'/Applications/Codex.app/Contents/Resources/codex',name:'codex'}),'','nothing else inside an application bundle');
 assert.equal(codingToolOf({path:'/usr/local/bin/opencode'}),'opencode');
 assert.equal(codingToolOf({path:'/usr/local/bin/node',name:'node'}),'','a runtime says nothing about what it runs');
 assert.equal(codingToolOf({path:'/bin/zsh',name:'zsh'}),'');
 assert.equal(codingToolOf({path:'/usr/local/bin/claude-monitor'}),'','the whole name must match');
 assert.equal(codingToolOf({name:'codex'}),'codex','the process name when the path could not be read');
 assert.equal(codingToolOf({pid:5}),'');assert.equal(codingToolOf(null),'');
});

test('HEAD gives the branch, or seven characters of a detached commit',()=>{
 assert.deepEqual(codingBranch('ref: refs/heads/feat/column-widths\n'),{branch:'feat/column-widths',detached:false});
 assert.deepEqual(codingBranch('0123456789ABCDEF0123456789abcdef01234567'),{branch:'0123456',detached:true});
 assert.deepEqual(codingBranch('ref: refs/remotes/origin/main'),{branch:'',detached:false});
 assert.deepEqual(codingBranch(''),{branch:'',detached:false});assert.deepEqual(codingBranch(undefined),{branch:'',detached:false});
});

test('the repository is the folder holding .git; a linked worktree gives its main repository',()=>{
 assert.equal(codingRepoName({root:`${HOME}/projects/atlas-ui`,gitdir:`${HOME}/projects/atlas-ui/.git`},`${HOME}/projects/atlas-ui/src`),'atlas-ui');
 assert.equal(codingRepoName({root:`${HOME}/wt/fix-retry`,gitdir:`${HOME}/projects/notes-api/.git/worktrees/fix-retry`},`${HOME}/wt/fix-retry`),'notes-api');
 assert.equal(codingShortPath(`${HOME}/projects/x`,HOME),'~/projects/x');assert.equal(codingShortPath(HOME,HOME+'/'),'~');
 assert.equal(codingShortPath('/Users/demo-two/x',HOME),'/Users/demo-two/x');assert.equal(codingShortPath('/srv/x',''),'/srv/x');
 assert.equal(codingClaudeDir(`${HOME}/projects/notes_api.v2`),'-Users-demo-projects-notes-api-v2');
});

test('sessions from made-up processes and folders: tool, repository, branch, time, busy or idle',()=>{
 const A=`${HOME}/projects/atlas-ui`,B=`${HOME}/wt/fix-retry`,C=`${HOME}/projects/pixel-kit`;
 const reading=parseCodingAnswer(facts({
  processes:[{pid:1,ppid:0},{pid:300,ppid:1},{pid:310,ppid:300},{pid:320,ppid:300},
   proc(401,310,CLAUDE,A+'/src',38),proc(402,320,CLAUDE,B,135),proc(403,300,'/opt/homebrew/bin/codex',C,12),
   proc(404,1,'/Applications/Cursor.app/Contents/MacOS/Cursor','/',260),proc(405,300,'/usr/local/bin/node',A,5,'node'),
   proc(406,404,'/Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper',A,200)],
  repos:{[A+'/src']:git(A,'feat/column-widths'),[B]:git(B,'fix/token-refresh',`${HOME}/projects/notes-api/.git/worktrees/fix-retry`),[C]:{root:C,gitdir:C+'/.git',head:'0123456789abcdef0123456789abcdef01234567'}},
  files:{claude:[{dir:codingClaudeDir(A),mtime:ago(1),birth:ago(38)},{dir:codingClaudeDir(B),mtime:ago(47),birth:ago(134)},{dir:'-Users-demo-projects-other',mtime:ago(0),birth:ago(3)}],
   codex:[{dir:'18',mtime:ago(2),birth:ago(12)}]}}),NOW);
 assert.deepEqual(reading.host,{id:'local',kind:'local',name:''});
 assert.deepEqual(reading.sessions.map(s=>[s.tool,s.pid,s.repo,s.branch,s.detached,s.path]),[
  ['claude',401,'atlas-ui','feat/column-widths',false,'~/projects/atlas-ui/src'],
  ['claude',402,'notes-api','fix/token-refresh',false,'~/wt/fix-retry'],
  ['codex',403,'pixel-kit','0123456',true,'~/projects/pixel-kit'],
  ['cursor',404,'','',false,'']]);
 assert.deepEqual(Object.keys(reading.sessions[0]).sort(),['activeAt','branch','detached','path','pid','repo','startedAt','tool','tracked'],'a session carries nothing else');
 const sum=codingSummary(reading,NOW);
 assert.deepEqual([sum.total,sum.active,sum.idle,sum.hosts],[4,2,1,1]);
 assert.deepEqual(sum.tools.map(t=>[t.id,t.name,t.count,t.sessions.map(s=>`${s.repo}:${s.state}:${s.minutes}`).join()]),[
  ['claude','Claude Code',2,'atlas-ui:active:38,notes-api:idle:135'],['codex','Codex',1,'pixel-kit:active:12'],['cursor','Cursor',1,':running:260']]);
 assert.equal(sum.tools[0].sessions[1].activeAt,new Date(ago(47)*1000).toISOString());
});

test('a tool started by the same tool is part of the session above it; another tool under it is its own session',()=>{
 const A=`${HOME}/projects/api`;
 const reading=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,CLAUDE,A,30),{pid:11,ppid:10},proc(12,11,CLAUDE,A,5),proc(13,12,CLAUDE,A,4),
  proc(14,11,'/opt/homebrew/bin/codex',A,3),proc(15,14,'/opt/homebrew/bin/codex',A,3),{pid:20,ppid:21},{pid:21,ppid:20},proc(22,20,CLAUDE,A,1)]}),NOW);
 assert.deepEqual(reading.sessions.map(s=>s.pid).sort((x,y)=>x-y),[10,14,22],'and a loop of parents ends');
});

test('busy and idle come only from file times and the start time',()=>{
 const A=`${HOME}/projects/api`,one=(minutes,files,tool=CLAUDE)=>{const r=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,tool,A,minutes)],files}),NOW);return {...r.sessions[0],state:codingState(r.sessions[0],NOW)};};
 assert.equal(one(1,{}).state,'active','just started, no file yet');
 assert.equal(one(20,{}).state,'idle','running a while, nothing written');
 assert.equal(one(20,{claude:[{dir:codingClaudeDir(A),mtime:ago(2),birth:ago(20)}]}).state,'active');
 assert.equal(one(20,{claude:[{dir:codingClaudeDir(A),mtime:ago(4),birth:ago(20)}]}).state,'idle');
 const before=one(20,{claude:[{dir:codingClaudeDir(A),mtime:ago(25),birth:ago(90)}]});
 assert.equal(before.activeAt,'','a file last written before the process started is not this session’s');assert.equal(before.state,'idle');
 assert.equal(one(20,{claude:[{dir:codingClaudeDir(A+'-other'),mtime:ago(1),birth:ago(20)}]}).state,'idle','another folder’s file');
 assert.equal(one(600,{}, '/usr/local/bin/opencode').state,'running','a tool whose files are not followed is neither');
 assert.equal(CODING_ACTIVE_MS,180000);
 // Codex: a file created with the process is its own; two sessions each get theirs; a lone session takes the newest.
 const codex='/opt/homebrew/bin/codex',two=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,codex,A,50),proc(11,1,codex,A,20)],
  files:{codex:[{dir:'18',mtime:ago(40),birth:ago(50)},{dir:'18',mtime:ago(1),birth:ago(20)},{dir:'17',mtime:ago(0),birth:ago(900)}]}}),NOW);
 assert.deepEqual(two.sessions.map(s=>[s.pid,codingState(s,NOW)]),[[11,'active'],[10,'idle']]);
 assert.equal(one(50,{codex:[{dir:'17',mtime:ago(1),birth:ago(900)}]},codex).state,'active','a resumed session writes on in its old file');
 const unsure=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,codex,A,50),proc(11,1,codex,A,20)],files:{codex:[{dir:'17',mtime:ago(1),birth:ago(900)}]}}),NOW);
 assert.deepEqual(unsure.sessions.map(s=>s.activeAt),['',''],'two sessions and a file that is neither’s: nobody is given it');
});

test('folders without a repository, the home folder and the root',()=>{
 const r=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,CLAUDE,`${HOME}/scratch/notes`,5),proc(11,1,CLAUDE,HOME,4),proc(12,1,CLAUDE,'/',3),proc(13,1,CLAUDE,'',2)]}),NOW);
 assert.deepEqual(r.sessions.map(s=>[s.repo,s.branch,s.path]).reverse(),[['notes','','~/scratch/notes'],['~','','~'],['/','','/'],['','','']]);
 assert.ok(!JSON.stringify(r).includes('demo'),'the home folder’s name, a person’s name, is never kept');
});

test('what is not an answer, and what an answer cannot bring in',()=>{
 for(const bad of [null,undefined,'x',{},{ok:false,processes:[]},{ok:true},{ok:true,processes:'x'}])assert.equal(parseCodingAnswer(bad,NOW),null);
 assert.deepEqual(parseCodingAnswer({ok:true,processes:[]},NOW).sessions,[]);
 const A=`${HOME}/projects/api`;
 const r=parseCodingAnswer(facts({at:'never',processes:[null,{pid:'7'},{pid:-1,path:CLAUDE},{pid:9,ppid:1,path:CLAUDE,cwd:A,start:ago(-600),args:'claude -p "the prompt"',env:{API_TOKEN:'t0ken'},title:'the prompt'},
  {pid:8,ppid:1,path:'x'.repeat(2000)+'/claude',cwd:A,start:ago(1)}],repos:{[A]:{root:A,gitdir:A+'/.git',head:'ref: refs/heads/main\nsecond line'}},files:{claude:'x',codex:[null,{mtime:'1'}]}}),NOW);
 assert.equal(r.sessions.length,1);assert.equal(r.sessions[0].startedAt,'','a start time in the future is dropped');assert.equal(r.sessions[0].branch,'main');
 assert.ok(!/prompt|t0ken|second line/.test(JSON.stringify(r)),'arguments, environment and anything unlisted never pass through');
 assert.equal(r.at,new Date(NOW).toISOString());
 const many=parseCodingAnswer(facts({processes:Array.from({length:200},(_,i)=>proc(100+i,1,CLAUDE,A,i+1))}),NOW);
 assert.equal(many.sessions.length,CODING_SESSION_LIMIT);
});

test('readings of several machines add up',()=>{
 const A=`${HOME}/projects/api`,local=parseCodingAnswer(facts({processes:[{pid:1,ppid:0},proc(10,1,CLAUDE,A,5)]}),NOW);
 const other={host:{id:'mac-mini',kind:'mac',name:'mini'},at:local.at,sessions:[{...local.sessions[0],pid:77}]};
 const sum=codingSummary([local,other,null],NOW);
 assert.deepEqual([sum.total,sum.hosts,sum.tools[0].count,sum.tools[0].sessions.map(s=>s.host).sort().join()],[2,2,2,'local,mac-mini']);
 assert.equal(codingSummary([],NOW).total,0);
});

test('the rules and the Mac side read no conversation, no arguments and no board data',()=>{
 const root=path.join(__dirname,'..'),code=f=>fs.readFileSync(path.join(root,f),'utf8').split('\n').filter(l=>!/^\s*\/\/\/?/.test(l)).join('\n');
 const swift=code('desktop/CodingSessions.swift').split('func testCodingSessions')[0];
 assert.ok(!/KERN_PROCARGS|sysctl|ProcessInfo|arguments|environ|NSAppleScript|\/bin\/ps|Process\(\)|URLSession|contentsOfFile|contentsOf:|Application Support/.test(swift),'no arguments, no environment, no AppleEvents, no subprocess, no network, no whole-file read');
 assert.equal((swift.match(/readData\(ofLength: 512\)/g)||[]).length,1,'the one read is the start of a HEAD or .git file');
 assert.ok(/enumerator\(/.test(swift)&&!/jsonl"\s*\)\s*\.|String\(contentsOf/.test(swift));
 const view=code('sessions-view.js'),rules=code('coding-sessions.js');
 assert.ok(!/localStorage|sessionStorage|save\(|state\.assets|fetch\(/.test(view+rules),'a reading stays in memory, outside the board');
 const app=code('app.js'),reads=/const AGENT_READS=new Set\(\[([^\]]*)\]\)/.exec(app)[1];
 assert.ok(!/coding|session/i.test(reads)&&!/coding.?sessions/i.test(code('desktop/AssetboardCLI.swift')),'not offered to MCP or assetboard-cli');
});
