const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

test('组合视图 are cleaned on every read: a known id, a name, known categories once, at most MIX_LIMIT',()=>{
 const known=['server','device','domain'];
 assert.deepEqual(D.cleanMixes([{id:'a',name:' 机器 ',types:['server','device','toaster','server']},{id:'a',name:'again',types:['server']},{id:'B!',name:'x',types:['server']},{id:'c',name:'',types:['server']},{id:'d',name:'none',types:['toaster']},null],known),
  [{id:'a',name:'机器',types:['server','device']}]);
 assert.equal(D.cleanMixes(Array.from({length:30},(_,i)=>({id:'v'+i,name:'v'+i,types:['domain']})),known).length,D.MIX_LIMIT);
 assert.deepEqual(D.cleanMixes('nope',known),[]);
 for(const p of D.MIX_PRESETS)assert.ok(p.types.length>=2,'a preset puts several categories together');
});

test('a backup carries the board’s 组合视图; merging it adds the ones the board lacks and keeps its own',()=>{
 const current={blocks:[{id:'server'}],assets:[],views:[{id:'mine',name:'我的',types:['server']}]};
 const backup=D.parseBoardBackup(JSON.stringify({blocks:[{id:'server'}],assets:[],views:[{id:'mine',name:'old name',types:['server']},{id:'m2',name:'机器',types:['server','device']}]}));
 assert.ok(backup.ok&&backup.board.views.length===2,'the backup keeps its views');
 const merged=D.applyBoardBackup(current,D.planBoardBackup(current,backup,{mode:'merge'}));
 assert.deepEqual(merged.views.map(v=>[v.id,v.name]),[['mine','我的'],['m2','机器']]);
});
