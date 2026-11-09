const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

const at='2026-11-09T00:00:00.000Z',later='2026-11-10T00:00:00.000Z';
const empty=()=>({blocks:[{id:'domain',folded:false}],assets:[{id:'m1',type:'domain',name:'mine.example.com',source:'manual'}],deletedExternalIds:[]});
const hetzner=(ids)=>({source:'hetzner',account:'acme',complete:true,resources:ids.map(id=>({kind:'server',id:String(id),name:'srv-'+id,ips:['203.0.113.'+id],status:'running'}))});
const read=(board,result,when=at)=>D.holdNewAssets(board,D.mergeCloudImport(board,result,when).board,'hetzner',when);

test('a platform read holds the records it would add instead of adding them',()=>{
 const {board,held}=read(empty(),hetzner([1,2,3]));
 assert.equal(board.assets.length,1,'nothing new lands on the board');
 assert.deepEqual(held.map(a=>a.id),['hetzner-server-1','hetzner-server-2','hetzner-server-3']);
 assert.ok(!board.blocks.some(b=>b.id==='server'),'no empty category appears for held records');
 assert.equal(D.heldCount(board),3);
 assert.deepEqual(D.heldSources(board).map(s=>[s.source,s.count,s.fresh]),[['hetzner',3,0]],'the first read is the baseline: nothing is new');
});

test('picking moves records onto the board; the rest keep waiting, and an id already there is not added twice',()=>{
 let {board}=read(empty(),hetzner([1,2,3]));
 const picked=D.importHeld(board,'hetzner',['hetzner-server-2'],later);
 assert.deepEqual(picked.added.map(a=>a.id),['hetzner-server-2']);
 assert.equal(picked.board.assets.find(a=>a.id==='hetzner-server-2').createdAt,later,'imported now, so it sorts as recent');
 assert.ok(!('firstSeen' in picked.board.assets.find(a=>a.id==='hetzner-server-2')),'bookkeeping stays out of the record');
 assert.ok(picked.board.blocks.some(b=>b.id==='server'));
 assert.deepEqual(D.heldItems(picked.board,'hetzner').map(a=>a.id),['hetzner-server-1','hetzner-server-3']);
 const all=D.importHeld(picked.board,'hetzner',null,later);
 assert.equal(all.added.length,2);assert.equal(D.heldCount(all.board),0);assert.ok(!('connectPending' in all.board),'nothing waits: no field');
 board=structuredClone(picked.board);board.assets.push({...D.heldItems(board,'hetzner')[0]});
 assert.equal(D.importHeld(board,'hetzner',null,later).added.length,1,'an id already on the board is skipped');
});

test('a later read keeps what is on the board up to date, replaces the waiting list and marks what is new on the platform',()=>{
 let {board}=read(empty(),hetzner([1,2]));
 board=D.importHeld(board,'hetzner',['hetzner-server-1'],at).board;
 const again=read(board,{...hetzner([1,2,4]),resources:hetzner([1,2,4]).resources.map(r=>r.id==='1'?{...r,status:'off'}:r)},later);
 assert.equal(again.board.assets.find(a=>a.id==='hetzner-server-1').syncStatus,'off','a record on the board follows the platform');
 assert.deepEqual(again.held.map(a=>a.id),['hetzner-server-2','hetzner-server-4']);
 assert.equal(D.heldIsNew(again.board,'hetzner',again.held[0]),false,'seen at the first read');
 assert.equal(D.heldIsNew(again.board,'hetzner',again.held[1]),true,'appeared after it');
 assert.equal(D.heldSources(again.board)[0].fresh,1);
 const gone=read(again.board,hetzner([1]),later);
 assert.equal(D.heldCount(gone.board),0,'something removed on the platform stops waiting');
});

test('turning items down puts them on the sync blocklist, so later reads skip them',()=>{
 const {board}=read(empty(),hetzner([1,2]));
 const next=D.ignoreHeld(board,'hetzner',['hetzner-server-1']);
 assert.deepEqual(D.heldItems(next,'hetzner').map(a=>a.id),['hetzner-server-2']);
 assert.ok(next.deletedExternalIds.includes('hetzner:server:1'));
 assert.deepEqual(read(next,hetzner([1,2])).held.map(a=>a.id),['hetzner-server-2']);
 assert.equal(D.heldCount(D.dropHeld(next,'hetzner')),0,'disconnecting forgets what waited');
});

test('GitHub repositories wait too, and the ones on the board are listed as imported',()=>{
 const board={blocks:[],assets:[],deletedExternalIds:[]};
 const result={repositories:[{id:1,name:'me/a',owner:'me'},{id:2,name:'me/b',owner:'me'}]};
 let next=D.holdNewAssets(board,D.mergeGitHub(board,result,at).board,'github',at).board;
 next=D.importHeld(next,'github',['github-repo-1'],at).board;
 assert.deepEqual(D.connectedOnBoard(next,'github').map(a=>a.id),['github-repo-1']);
 assert.deepEqual(D.heldItems(next,'github').map(a=>a.id),['github-repo-2']);
});

test('activity changes: field by field, bookkeeping left out, images named, secrets never kept',()=>{
 const before=[{id:'a',type:'server',name:'tokyo',cost:'$6/月',date:'2026-12-01',updatedAt:'x'},{id:'b',type:'domain',name:'gone.example.com'}];
 const after=[{id:'a',type:'server',name:'tokyo',cost:'$7/月',date:'2026-12-01',updatedAt:'y',notes:'key ghp_abcdefghijklmnopqrstuvwxyz0123',iconData:'data:image/png;base64,AAAA'},{id:'c',type:'domain',name:'new.example.com',provider:'Porkbun'}];
 const changes=D.assetChanges(before,after);
 const update=changes.find(c=>c.id==='a');
 assert.equal(update.op,'update');
 assert.deepEqual(update.fields.map(f=>f.field).sort(),['cost','iconData','notes']);
 assert.deepEqual(update.fields.find(f=>f.field==='cost'),{field:'cost',from:'$6/月',to:'$7/月'});
 assert.equal(update.fields.find(f=>f.field==='notes').to,'（已隐去）','a token is never written down');
 assert.equal(update.fields.find(f=>f.field==='iconData').to,'图片');
 assert.deepEqual(changes.find(c=>c.id==='c').fields.map(f=>f.field).sort(),['name','provider']);
 assert.equal(changes.find(c=>c.id==='b').op,'remove');
 assert.equal(D.activityValue('x'.repeat(200)).length,80,'long values are cut');
 assert.match(D.activityValue('key AbCdEfGh1234567890IjKlMnOp0987654321zz end'),/（已隐去）/,'a long random-looking string is hidden');
 assert.equal(D.activityValue('https://example.com/a/b'),'https://example.com/a/b');
 assert.equal(D.activityValue(['203.0.113.1','203.0.113.2']),'203.0.113.1, 203.0.113.2');
});

test('the calling tool: clientInfo first, then parent programs, then environment names, else unknown',()=>{
 const of=D.agentClientOf;
 assert.deepEqual([of({name:'claude-code',version:'2.1.4'}).id,of({name:'claude-code'}).by],['claude-code','clientInfo']);
 assert.equal(of({name:'claude-ai'}).id,'claude-desktop');
 assert.equal(of({name:'codex-mcp-client'}).id,'codex');
 assert.equal(of({name:'cursor-vscode'}).id,'cursor');
 assert.equal(of({name:'Visual Studio Code'}).id,'vscode');
 assert.equal(of({name:'gemini-cli-mcp-client'}).id,'gemini');
 assert.equal(of({name:'grok-cli'}).id,'grok');
 assert.deepEqual([of({processes:['zsh','claude']}).id,of({processes:['claude']}).by],['claude-code','process']);
 assert.equal(of({processes:['Claude']}).id,'claude-desktop','the desktop app and the CLI differ by name');
 assert.equal(of({processes:['codex']}).id,'codex');
 assert.equal(of({processes:['grok-cli']}).id,'grok');
 assert.deepEqual([of({env:['CLAUDECODE']}).id,of({env:['CLAUDECODE']}).by],['claude-code','env']);
 assert.equal(of({name:'my-agent',version:'1'}).name,'my-agent','a tool that names itself keeps its name');
 assert.match(of({name:'my-agent'}).id,/^other:/);
 assert.deepEqual([of({}).id,of({}).name],['unknown','未知客户端']);
 assert.equal(of({},'cli').id,'cli','the command line without other signs');
 assert.equal(of({name:'x\u0007'.repeat(40)}).name.length<=60,true);
});
