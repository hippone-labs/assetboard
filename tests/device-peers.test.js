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
