// 其他设备 (device-peers.js): a paired Mac's answer checked, made into its own device record and a 正在做 reading of that machine.
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../device-peers.js'),L=require('../device-local.js'),O=require('../panorama-objects.js');
const PEER='a1b2c3d4e5f60718';
const now=Date.now()/1000;
const answer=(over={})=>({ok:true,id:PEER,name:'mac-mini',at:'2026-11-24T10:00:00Z',
 device:{ok:true,hardwareId:'00000000000000b2',name:'Mac mini',model:'Mac14,3',chip:'Apple M2',memoryBytes:16*2**30,osVersion:'15.2',disk:{total:5e11,free:2e11},at:'2026-11-24T10:00:00Z'},
 sessions:{ok:true,at:new Date().toISOString(),home:'/Users/demo',processes:[{pid:1,ppid:0},{pid:9,ppid:1,name:'claude',path:'/opt/homebrew/bin/claude',cwd:'/Users/demo/projects/api',start:Math.round(now-600)}],
  repos:{'/Users/demo/projects/api':{root:'/Users/demo/projects/api',gitdir:'/Users/demo/projects/api/.git',head:'ref: refs/heads/main'}},files:{}},...over});

test('an answer is checked: a bad pairing id or a failed read is nothing',()=>{
 for(const bad of [null,{ok:false,id:PEER},answer({id:'not-a-pairing'}),answer({ok:false})])assert.equal(P.parsePeerFacts(bad),null);
 const f=P.parsePeerFacts(answer());
 assert.equal(f.name,'mac-mini');assert.equal(f.device.model,'Mac14,3');
 assert.equal(f.sessions.host.id,'peer-'+PEER);assert.equal(f.sessions.host.kind,'mac');assert.equal(f.sessions.sessions.length,1);
 assert.equal(P.parsePeerFacts(answer({device:{ok:false},sessions:null})).device,null,'what that Mac could not read is left out');
});

test('the answer becomes that Mac’s own device record, named after it, refreshed like this Mac’s',()=>{
 const f=P.parsePeerFacts(answer());
 const first=P.mergePeer({assets:[]},f);
 assert.ok(first.changed);
 assert.deepEqual([first.added.id,first.added.source,first.added.peerId,first.added.name],['device-peer-00000000000000b2','peer',PEER,'mac-mini']);
 assert.equal(P.peerDeviceOf(first.assets,PEER).id,first.added.id);
 assert.equal(L.deviceForm(first.added),'desktop','a paired Mac without a battery stands on the desk as a desktop');
 const renamed=[{...first.added,name:'Studio mini'}];
 const again=P.mergePeer({assets:renamed},P.parsePeerFacts(answer({device:{...answer().device,osVersion:'15.3'}})));
 assert.equal(again.assets[0].name,'Studio mini');assert.equal(again.assets[0].osVersion,'15.3');
 assert.deepEqual(P.mergePeer({assets:[],deletedExternalIds:['peer:00000000000000b2']},f).assets,[],'a deleted record stays deleted');
 const local=L.mergeLocalDevice({assets:first.assets},L.parseDeviceInfo({...answer().device}));
 assert.equal(local.assets.length,2,'the same hardware read here is this Mac’s record, not the paired one');
});

test('the object panorama shows that Mac’s sessions on its own screen, and this Mac’s on this one',()=>{
 const f=P.parsePeerFacts(answer());
 const mine={host:{id:'local',kind:'local',name:''},at:new Date().toISOString(),sessions:[]};
 assert.equal(O.workScreen([mine,f.sessions]).total,0,'this Mac’s screen is only this Mac’s');
 const there=O.workScreen([mine,f.sessions],{hostId:P.peerHost(PEER)});
 assert.equal(there.total,1);assert.equal(there.lines[0].name,'Claude Code');assert.equal(there.lines[0].repo,'api');
});

// 同步资产板.
const at=d=>`2026-11-${String(d).padStart(2,'0')}T10:00:00.000Z`;
const rec=(id,name,day,extra={})=>({id,type:'domain',name,updatedAt:at(day),links:[],...extra});
const boardOf=(assets,extra={})=>({blocks:[{id:'domain'},{id:'device'}],assets,deletedExternalIds:[],...extra});
const me={id:'device-local-aaaaaaaaaaaaaaaa',type:'device',name:'studio-book',source:'local',externalId:'aaaaaaaaaaaaaaaa',updatedAt:at(1)};
const them={id:'device-local-bbbbbbbbbbbbbbbb',type:'device',name:'mac-mini',source:'local',externalId:'bbbbbbbbbbbbbbbb',updatedAt:at(1)};

test('sync: the newer edit of each record wins, new records come over, nothing changes twice',()=>{
 const mine=boardOf([me,rec('a','a.example.com',10),rec('b','b.example.com',5)]);
 const theirs=boardOf([them,rec('a','a-old.example.com',3),rec('b','b-new.example.com',8),rec('c','c.example.com',9)]);
 const r=P.syncBoards(mine,theirs);
 assert.ok(r.changed);
 const names=Object.fromEntries(r.board.assets.map(a=>[a.id,a.name]));
 assert.deepEqual([names.a,names.b,names.c],['a.example.com','b-new.example.com','c.example.com']);
 assert.equal(P.syncBoards(r.board,theirs).changed,false,'the same board again changes nothing');
});

test('sync: a deletion over there removes the record here, unless it was edited here since',()=>{
 const mine=boardOf([me,rec('a','a.example.com',5),rec('b','b.example.com',20)]);
 const theirs=boardOf([them],{deletedRecords:[{id:'a',at:at(10)},{id:'b',at:at(10)}]});
 const r=P.syncBoards(mine,theirs);
 assert.deepEqual(r.board.assets.map(a=>a.id).sort(),[me.id,'b'].sort(),'a goes; b, edited after the deletion, stays');
 assert.ok(r.board.deletedRecords.some(t=>t.id==='a'),'the deletion is remembered here too');
 assert.equal(r.counts.removed,1);
});

test('sync: each Mac keeps its own device records; another Mac’s never become this Mac',()=>{
 const r=P.syncBoards(boardOf([me]),boardOf([them,rec('a','a.example.com',3)]));
 const devices=r.board.assets.filter(a=>a.type==='device');
 assert.deepEqual(devices.map(a=>a.id),[me.id],'the other Mac’s own record does not come over');
 const replaced=P.syncBoards(boardOf([me,rec('x','x.example.com',2)]),boardOf([them,rec('a','a.example.com',3)]),{first:'there'});
 assert.deepEqual(replaced.board.assets.map(a=>a.id).sort(),[me.id,'a'].sort(),'taking that board wholesale still keeps this Mac’s record');
});

test('sync: the first time, “this Mac” keeps old records over there from coming back; “that Mac” takes its board',()=>{
 const mine=boardOf([me,rec('a','a.example.com',20)]);
 const old=boardOf([them,rec('gone','deleted-long-ago.example.com',2),rec('a','a-old.example.com',3),rec('new','made-there.example.com',22)]);
 const here=P.syncBoards(mine,old,{first:'here',since:Date.parse(at(15))});
 assert.deepEqual(here.board.assets.map(a=>a.id).sort(),[me.id,'a','new'].sort(),'only what changed there after the first sync comes over');
 assert.equal(here.board.assets.find(a=>a.id==='a').name,'a.example.com');
 const there=P.syncBoards(boardOf([me,rec('stale','stale.example.com',1)]),boardOf([them,rec('a','a.example.com',20)]),{first:'there'});
 assert.deepEqual(there.board.assets.map(a=>a.id).sort(),[me.id,'a'].sort(),'“that Mac”: this board becomes its board');
 assert.equal(P.syncBoards(mine,{nope:true}).changed,false,'a board that is not one changes nothing');
});
