// 本机设备 (device-local.js): what a read of this Mac must look like, how it becomes one device record and stays one, what the
// person writes on it that a read never touches, deletion that sticks, and the disk state.
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../asset-data.js'),L=require('../device-local.js');
const HW='0123456789abcdef';
const raw=(over={})=>({ok:true,hardwareId:HW,name:'studio-book',model:'Mac15,8',chip:'Apple M3 Pro',memoryBytes:18*2**30,osVersion:'15.2',serial:'c02demo1234',
 disk:{total:1e12,free:4e11},battery:{percent:86.4,charging:false,cycles:212},at:'2026-11-24T10:00:00Z',...over});

test('a read is checked: bad answers are no read, odd values are dropped',()=>{
 for(const bad of [null,{},{ok:false,hardwareId:HW},raw({hardwareId:'IOPlatformUUID-raw'}),raw({hardwareId:HW.toUpperCase()})])assert.equal(L.parseDeviceInfo(bad),null);
 const i=L.parseDeviceInfo(raw());
 assert.equal(i.serial,'C02DEMO1234');assert.equal(i.battery.percent,86);assert.equal(i.battery.cycles,212);assert.equal(i.osVersion,'15.2');
 const odd=L.parseDeviceInfo(raw({serial:'not a serial!',osVersion:'Version 15.2 (Build 24C101)',disk:{total:-1},battery:{percent:140},memoryBytes:'lots',at:'yesterday'}));
 assert.equal(odd.serial,'');assert.equal(odd.osVersion,'');assert.equal(odd.disk,null);assert.equal(odd.battery,null);assert.equal(odd.memoryBytes,null);
 assert.ok(!isNaN(Date.parse(odd.at)),'a missing time is now');
 assert.deepEqual(L.parseDeviceInfo(raw({disk:{total:100,free:500}})).disk,{total:100,free:100},'free is never more than the total');
});

test('the first read adds this Mac; later reads update the facts and keep what the person wrote',()=>{
 const info=L.parseDeviceInfo(raw());
 const first=L.mergeLocalDevice({assets:[]},info);
 assert.ok(first.changed);assert.equal(first.added.id,'device-local-'+HW);
 assert.deepEqual([first.added.type,first.added.name,first.added.provider,first.added.source,first.added.externalId],['device','studio-book','Apple','local',HW]);
 assert.equal(D.assetSyncKey(first.added),L.deviceSyncKey(HW),'deleting it remembers the same key a read checks');
 const mine={...first.added,name:'Work laptop',notes:'desk at home',project:'studio'};
 const later=L.mergeLocalDevice({assets:[mine]},L.parseDeviceInfo(raw({osVersion:'15.3',name:'renamed-in-macOS',battery:null})),{now:Date.parse('2026-11-24T10:05:00Z')});
 assert.ok(later.changed);assert.equal(later.assets.length,1);
 const a=later.assets[0];
 assert.deepEqual([a.name,a.notes,a.project,a.osVersion],['Work laptop','desk at home','studio','15.3'],'name, notes and project stay the person’s');
 assert.equal('battery' in a,false,'a fact the system no longer gives goes away');
});

test('no change, no save: the same facts within a day change nothing; after a day the time is kept',()=>{
 const info=L.parseDeviceInfo(raw()),a=L.mergeLocalDevice({assets:[]},info).added;
 const again=L.mergeLocalDevice({assets:[a]},L.parseDeviceInfo(raw({at:'2026-11-24T10:10:00Z'})),{now:Date.parse('2026-11-24T10:10:00Z')});
 assert.equal(again.changed,false);
 const nextDay=L.mergeLocalDevice({assets:[a]},L.parseDeviceInfo(raw({at:'2026-11-25T11:00:00Z'})),{now:Date.parse('2026-11-25T11:00:00Z')});
 assert.ok(nextDay.changed);assert.equal(nextDay.assets[0].seenAt,'2026-11-25T11:00:00Z');
});

test('a deleted record stays deleted; another Mac is another record',()=>{
 const info=L.parseDeviceInfo(raw());
 assert.deepEqual(L.mergeLocalDevice({assets:[],deletedExternalIds:[L.deviceSyncKey(HW)]},info),{assets:[],changed:false,skipped:true});
 const one=L.mergeLocalDevice({assets:[]},info).assets;
 const two=L.mergeLocalDevice({assets:one},L.parseDeviceInfo(raw({hardwareId:'fedcba9876543210',name:'mini'}))).assets;
 assert.equal(two.length,2);
 const manual={id:'m1',type:'device',name:'Old ThinkPad',provider:'Lenovo',source:'manual'};
 assert.equal(L.mergeLocalDevice({assets:[manual]},info).assets.length,2,'a device added by hand is never taken for this Mac');
 assert.equal(L.isLocalDevice(manual),false);
});

test('disk state, form, and masking the serial number',()=>{
 const a={type:'device',source:'local',disk:{total:1000,free:95},battery:{percent:50}};
 assert.equal(L.deviceDiskUsed(a),91);assert.equal(L.deviceTone(a),'amber');
 assert.equal(L.deviceTone({type:'device',disk:{total:1000,free:500}}),'');assert.equal(L.deviceDiskUsed({type:'device'}),null);
 assert.equal(L.deviceForm(a),'laptop');assert.equal(L.deviceForm({type:'device',source:'local'}),'desktop');assert.equal(L.deviceForm({type:'device',source:'manual'}),'laptop');
 const rec={type:'device',name:'studio-book',serial:'C02DEMO1234'};
 for(const set of ['agent','screen','handover'])assert.notEqual(D.maskAsset(rec,set).serial,'C02DEMO1234',set);
 assert.equal(D.maskAsset(rec,'present').serial,'C02DEMO1234');
});
