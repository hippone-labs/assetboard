// 待合并的 PR (github-pulls.js): which records are GitHub repositories, what is kept of GitHub's answer, and what each pull request
// needs (可以合并, 久未动, CI 失败), per repository and over the board.
const test=require('node:test');
const assert=require('node:assert/strict');
const {githubRepoName,parsePull,parsePulls,parsePullsAnswer,pullState,repoPullsLine,pullsSummary,cleanPullsCache,PULL_STALE_DAYS,PULL_PER_REPO}=require('../github-pulls.js');

const NOW=Date.parse('2026-11-12T12:00:00Z'),ago=days=>new Date(NOW-days*86400000).toISOString();
const node=(n,o={})=>({number:n,title:`PR ${n}`,url:`https://github.com/me/api/pull/${n}`,isDraft:false,createdAt:ago(o.created??1),updatedAt:ago(o.updated??0.2),mergeable:'MERGEABLE',author:{login:'me'},
 commits:{nodes:[{commit:{statusCheckRollup:o.ci===null?null:{state:o.ci||'SUCCESS'}}}]},...o.raw});

test('a GitHub repository is named by its github.com address, else by a synced or GitHub-hosted owner/name',()=>{
 assert.equal(githubRepoName({type:'repository',url:'https://github.com/Me/My.Repo.git',name:'x'}),'Me/My.Repo');
 assert.equal(githubRepoName({type:'repository',url:'https://github.com/me/api/pulls?q=1',name:'x'}),'');
 assert.equal(githubRepoName({type:'repository',url:'https://github.com/me/api/',name:'x'}),'me/api');
 assert.equal(githubRepoName({type:'repository',source:'github',name:'me/api'}),'me/api');
 assert.equal(githubRepoName({type:'repository',source:'manual',provider:'GitHub',name:'me/api'}),'me/api');
 assert.equal(githubRepoName({type:'repository',source:'manual',provider:'GitLab',name:'me/api'}),'','another host is not read');
 assert.equal(githubRepoName({type:'repository',url:'https://gitlab.com/me/api',source:'manual',name:'api'}),'');
 assert.equal(githubRepoName({type:'domain',source:'github',name:'me/api'}),'','only repositories');
 assert.equal(githubRepoName({type:'repository',source:'github',name:'-bad/api'}),'','an owner GitHub would refuse');
 assert.equal(githubRepoName({type:'repository',source:'github',name:'me/..'}),'');
});

test('a pull request keeps its fields; a link that is not the repository’s own pull request page drops it',()=>{
 const p=parsePull('me/api',node(7,{created:5,updated:2}));
 assert.deepEqual(p,{number:7,title:'PR 7',url:'https://github.com/me/api/pull/7',draft:false,ci:'success',merge:'clean',createdAt:ago(5),updatedAt:ago(2),author:'me'});
 assert.equal(parsePull('me/api',node(7,{raw:{url:'https://evil.example/me/api/pull/7'}})),null);
 assert.equal(parsePull('me/api',node(7,{raw:{url:'https://github.com/me/other/pull/7'}})),null);
 assert.equal(parsePull('me/api',node(7,{raw:{url:'https://github.com/me/api/pull/8'}})),null,'the number must match the link');
 assert.equal(parsePull('me/api',node(0)),null);
 assert.equal(parsePull('ME/Api',node(7)).number,7,'owner and name match without case');
 assert.equal(parsePull('me/api',node(7,{raw:{title:'  a\n  b  '}})).title,'a b');
 assert.equal(parsePull('me/api',node(7,{ci:'ERROR'})).ci,'failure');
 assert.equal(parsePull('me/api',node(7,{ci:'EXPECTED'})).ci,'pending');
 assert.equal(parsePull('me/api',node(7,{ci:null})).ci,'none');
 assert.equal(parsePull('me/api',node(7,{raw:{commits:null}})).ci,'none');
 assert.equal(parsePull('me/api',node(7,{raw:{mergeable:'CONFLICTING'}})).merge,'conflict');
 assert.equal(parsePull('me/api',node(7,{raw:{mergeable:'WHATEVER'}})).merge,'unknown');
 assert.equal(parsePull('me/api',node(7,{raw:{isDraft:true}})).draft,true);
});

test('a repository’s part: newest update first, duplicates and bad nodes out, the total and whether more are open',()=>{
 const r=parsePulls('me/api',{total:40,nodes:[node(1,{updated:3}),node(2,{updated:1}),node(2),{number:'x'},null]});
 assert.deepEqual(r.pulls.map(p=>p.number),[2,1]);
 assert.equal(r.total,40);assert.equal(r.more,true);
 assert.deepEqual(parsePulls('me/api',{total:0,nodes:[]}),{pulls:[],total:0,more:false});
 assert.equal(parsePulls('me/api',{nodes:Array.from({length:50},(_,i)=>node(i+1))}).pulls.length,PULL_PER_REPO);
 assert.deepEqual(parsePulls('me/api',{error:'denied'}),{error:'denied'});
 assert.deepEqual(parsePulls('me/api',{error:'other'}),{error:'unread'});
 assert.deepEqual(parsePulls('me/api',null),{error:'unread'});
});

test('the app’s answer is kept by lower-case name; a failed answer gives nothing',()=>{
 const read=parsePullsAnswer({ok:true,at:'2026-11-12T11:00:00Z',via:['gh','evil'],repos:{'Me/Api':{total:1,nodes:[node(3,{raw:{url:'https://github.com/Me/Api/pull/3'}})]},'me/web':{error:'denied'},'bad name/x':{total:0,nodes:[]}}});
 assert.deepEqual(Object.keys(read.repos),['me/api','me/web']);
 assert.equal(read.repos['me/api'].full,'Me/Api');assert.equal(read.repos['me/api'].pulls[0].number,3);
 assert.deepEqual(read.via,['gh']);assert.equal(read.at,'2026-11-12T11:00:00.000Z');
 assert.equal(parsePullsAnswer({ok:false,reason:'rate'}),null);
 assert.equal(parsePullsAnswer(null),null);
});

test('可以合并: not a draft, no conflict, checks green or none; 久未动 and CI 失败 leave drafts alone',()=>{
 const st=o=>pullState(parsePull('me/api',node(1,o)),NOW);
 assert.equal(st({}).ready,true);
 assert.equal(st({ci:null}).ready,true,'no checks at all: nothing is red');
 assert.equal(st({ci:'PENDING'}).ready,false);
 assert.equal(st({ci:'FAILURE'}).ready,false);assert.equal(st({ci:'FAILURE'}).failing,true);
 assert.equal(st({raw:{mergeable:'CONFLICTING'}}).ready,false);assert.equal(st({raw:{mergeable:'CONFLICTING'}}).conflict,true);
 assert.equal(st({raw:{mergeable:'UNKNOWN'}}).ready,false,'GitHub has not worked out the merge yet');
 assert.equal(st({raw:{isDraft:true}}).ready,false);
 assert.equal(st({updated:PULL_STALE_DAYS}).stale,true);assert.equal(st({updated:PULL_STALE_DAYS-0.1}).stale,false);
 assert.equal(st({updated:9,raw:{isDraft:true}}).stale,false,'a draft is never stale');
 assert.equal(st({ci:'FAILURE',raw:{isDraft:true}}).failing,false,'a draft’s red check does not colour the board');
 assert.equal(st({updated:4.5}).idle,4);assert.equal(st({created:9.2}).age,9);
});

test('a repository’s line takes the worst tone; the board’s summary counts repositories, pull requests, ready, failing and the oldest',()=>{
 const entry=nodes=>({full:'me/api',...parsePulls('me/api',{total:nodes.length,nodes})});
 assert.deepEqual(repoPullsLine(entry([node(1),node(2,{ci:'FAILURE',updated:5}),node(3,{updated:4,created:6})]),NOW),{total:3,ready:2,failing:1,stale:2,oldest:6,tone:'bad'});
 assert.equal(repoPullsLine(entry([node(1,{updated:4})]),NOW).tone,'stale');
 assert.equal(repoPullsLine(entry([node(1)]),NOW).tone,'');
 assert.equal(repoPullsLine({error:'denied'}),null);assert.equal(repoPullsLine(null),null);
 const data={repos:{'me/api':entry([node(1,{created:4}),node(2,{ci:'FAILURE'})]),'me/web':{full:'me/web',...parsePulls('me/web',{total:1,nodes:[{...node(5),url:'https://github.com/me/web/pull/5'}]})},'me/docs':entry([]),'me/secret':{full:'me/secret',error:'denied'}}};
 assert.deepEqual(pullsSummary(data,['me/api','Me/API','me/web','me/docs','me/secret','me/new'],NOW),{repos:2,total:3,ready:2,failing:1,stale:0,oldest:4,denied:1,unread:1,read:3});
 assert.deepEqual(pullsSummary(null,['me/api'],NOW),{repos:0,total:0,ready:0,failing:0,stale:0,oldest:0,denied:0,unread:0,read:0});
});

test('the kept reading reads back the same, and anything else in it is dropped',()=>{
 const read=parsePullsAnswer({ok:true,at:ago(0.01),via:['token'],repos:{'me/api':{total:2,nodes:[node(1,{ci:null}),node(2,{ci:'FAILURE',raw:{isDraft:true,mergeable:'CONFLICTING'}})]},'me/web':{error:'denied'}}});
 const back=cleanPullsCache(JSON.parse(JSON.stringify(read)));
 assert.deepEqual(back,read);
 assert.equal(cleanPullsCache({repos:{'me/api':{full:'other/x',pulls:[]}}}).repos['me/api'],undefined,'a key that is not its own name');
 assert.equal(cleanPullsCache({repos:{'me/api':{full:'me/api',pulls:[{number:1,url:'https://evil.example/x'}]}}}).repos['me/api'].pulls.length,0);
 assert.equal(cleanPullsCache('nonsense'),null);assert.equal(cleanPullsCache(null),null);
});
