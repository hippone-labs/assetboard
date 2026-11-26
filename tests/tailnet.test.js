const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../tailnet.js');

const answer={state:'ok',nodes:[
 {id:'n1',name:'hans的Mac mini',dns:'hansmac-mini.tail0.ts.net',ips:['100.79.13.91','fd7a:115c::1'],os:'macos',online:true,lastSeen:''},
 {id:'n2',name:'aether-home',dns:'aether-home.tail0.ts.net',ips:['100.64.0.3'],os:'linux',online:false,lastSeen:'2026-11-26T08:00:00Z'},
 {id:'n3',name:'iPhone',dns:'iphone.tail0.ts.net',ips:['100.64.0.4'],os:'ios',online:true},
 {id:'bad id!',name:'x',dns:'bad name;rm',ips:[]},
 {id:'n5',name:'',dns:'',ips:['not-an-ip','100.64.0.5'],os:'Linux 6',online:'yes',lastSeen:'never'}
]};

test('the app’s answer is checked: a node needs a MagicDNS name or an address, bad fields are dropped',()=>{
 const r=T.parseTailnet(answer);
 assert.equal(r.state,'ok');
 assert.deepEqual(r.nodes.map(n=>n.name),['hans的Mac mini','aether-home','iPhone','100.64.0.5']);
 const n5=r.nodes[3];
 assert.deepEqual([n5.ips,n5.os,n5.online,n5.lastSeen,n5.id],[['100.64.0.5'],'',false,'','n5']);
 assert.equal(T.parseTailnet({state:'weird'}).state,'failed');
 assert.equal(T.parseTailnet(null),null);
});

test('a server or device is matched by node id, address, MagicDNS name, then name; this Mac’s own record never',()=>{
 const {nodes}=T.parseTailnet(answer);
 const m=a=>T.tailnetMatch(a,nodes)?.id||null;
 assert.equal(m({type:'server',name:'nas',ips:['100.64.0.3']}),'n2','by address');
 assert.equal(m({type:'server',name:'x',host:'aether-home.tail0.ts.net.'}),'n2','by MagicDNS name, trailing dot ignored');
 assert.equal(m({type:'server',name:'x',host:'aether-home'}),'n2','by the name’s first label');
 assert.equal(m({type:'device',name:'iPhone'}),'n3','a device by its name');
 assert.equal(m({type:'device',name:'Mac',source:'tailscale',externalId:'n1'}),'n1','a record added from Tailscale by its node id');
 assert.equal(m({type:'device',name:'hans的Mac mini',source:'local'}),null,'this Mac’s own record is not a tailnet node');
 assert.equal(m({type:'domain',name:'iPhone'}),null,'only servers and devices');
 assert.equal(m({type:'server',name:'elsewhere',ips:['203.0.113.10']}),null);
});

test('the nodes not on the board, and the record each becomes',()=>{
 const {nodes}=T.parseTailnet(answer);
 const left=T.tailnetUnmatched([{type:'server',name:'aether-home'}],nodes);
 assert.deepEqual(left.map(n=>n.id),['n1','n3','n5']);
 const mac=T.tailnetRecord(nodes[0]),server=T.tailnetRecord(nodes[1]),asServer=T.tailnetRecord(nodes[2],'server');
 assert.deepEqual([mac.type,mac.provider,mac.host,mac.ips,mac.source,mac.externalId],['device','Apple','hansmac-mini.tail0.ts.net',['100.79.13.91','fd7a:115c::1'],'tailscale','n1']);
 assert.deepEqual([server.type,server.provider,server.host,server.cost],['server','','aether-home.tail0.ts.net','未知']);
 assert.equal(asServer.type,'server','the person may record a phone as a server, or the other way round');
 assert.equal(T.tailnetMatch(mac,nodes)?.id,'n1','a record made from a node matches it again');
});
