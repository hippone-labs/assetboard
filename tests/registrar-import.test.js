const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

const at='2026-11-07T00:00:00.000Z',later='2026-12-01T00:00:00.000Z';
const empty=()=>({blocks:[],assets:[],deletedExternalIds:[]});
const namecheap=(domains,extra={})=>({source:'namecheap',account:'apiexample',complete:true,domains,...extra});
const nc=(id,name,expires='02/15/2027',autoRenew='false',status='active')=>({id:String(id),name,expires,autoRenew,status});

test('registrarDate reads each API\'s date format and refuses anything that is not a real day',()=>{
 assert.equal(D.registrarDate('02/15/2027'),'2027-02-15','Namecheap');
 assert.equal(D.registrarDate('2/5/2027'),'2027-02-05');
 assert.equal(D.registrarDate('2027-01-15 10:00:00'),'2027-01-15','Porkbun');
 assert.equal(D.registrarDate('2027-01-15'),'2027-01-15');
 assert.equal(D.registrarDate('2027-01-15T10:00:00Z'),'2027-01-15');
 assert.equal(D.registrarDate('2027-01-15T10:00:00.123+08:00'),'2027-01-15');
 for(const bad of ['02/30/2027','13/01/2027','2027-02-29','2027-13-01','1900-01-01','15.01.2027','2027/01/15','tomorrow','',null,undefined,{},20270115])
  assert.equal(D.registrarDate(bad),'',`refused: ${String(bad)}`);
 assert.equal(D.registrarDate('02/29/2028'),'2028-02-29','a leap day');
});

test('registrarFlag reads yes and no in every spelling the APIs use',()=>{
 for(const yes of [true,'true','TRUE',1,'1','yes'])assert.equal(D.registrarFlag(yes),true,String(yes));
 for(const no of [false,'false','False',0,'0','no'])assert.equal(D.registrarFlag(no),false,String(no));
 for(const unknown of [null,undefined,'','maybe',2,{}])assert.equal(D.registrarFlag(unknown),null,String(unknown));
});

test('cleanRegistrarDomains keeps only real domain names with plain ids, once each',()=>{
 const {domains,skipped}=D.cleanRegistrarDomains([
  nc(1,'Example.COM.'),nc(2,'https://example.net/'),nc(3,'not a domain'),nc(1,'example.org'),{name:'example.io',expires:'2027-01-15 10:00:00',autoRenew:1,status:'ACTIVE'},
  {id:'a b',name:'example.dev'},null,'example.app',{id:'7',name:'192.0.2.1'},{id:'8',name:'example.co',status:'EXPIRED!'}]);
 assert.deepEqual(domains.map(d=>[d.id,d.name]),[['1','example.com'],['example.io','example.io'],['8','example.co']]);
 assert.equal(skipped,7);
 assert.deepEqual(domains[1],{id:'example.io',name:'example.io',expires:'2027-01-15',autoRenew:true,status:'active'},'Porkbun has no id: the domain is the id');
 assert.equal(domains[2].status,'expired','lowercase plain words only');
 assert.deepEqual(D.cleanRegistrarDomains('nope'),{domains:[],skipped:0});
 const many=D.cleanRegistrarDomains(Array.from({length:D.REGISTRAR_LIMIT+3},(_,i)=>nc(i,`site${i}.example`)));
 assert.equal(many.domains.length,D.REGISTRAR_LIMIT);assert.equal(many.skipped,3);
});

test('mergeRegistrar adds domain records with expiry, auto-renew and the registrar',()=>{
 const merge=D.mergeRegistrar(empty(),namecheap([nc(127,'example.com','02/15/2027','false'),nc(381,'example.net','04/28/2027','true'),nc(9,'example.org','','')]),at);
 assert.equal(merge.added,3);assert.equal(merge.read,3);assert.deepEqual(merge.collisions,[]);
 const [com,net,org]=merge.board.assets;
 assert.equal(com.id,'namecheap-domain-127');assert.equal(com.type,'domain');assert.equal(com.source,'namecheap');assert.equal(com.provider,'Namecheap');
 assert.equal(com.account,'apiexample');assert.equal(com.externalId,'127');assert.equal(com.date,'2027-02-15');assert.equal(com.dateKind,'expire');
 assert.equal(com.autoRenew,'off');assert.equal(com.cycle,'','auto-renew off: it simply expires');assert.equal(com.event,'2027-02-15 到期');assert.equal(com.createdAt,at);
 assert.equal(net.autoRenew,'on');assert.equal(net.cycle,'yearly','auto-renew on: the date repeats');
 assert.equal(org.date,'');assert.equal(org.event,'active');assert.equal('autoRenew' in org,false,'not said, not stored');
 assert.equal(D.assetSyncKey(com),'namecheap:127');
 assert.ok(merge.board.blocks.some(b=>b.id==='domain'));
 assert.ok(D.PLATFORM_SOURCES.includes('namecheap')&&D.PLATFORM_SOURCES.includes('porkbun'),'registrar records keep their source and category');
 const pork=D.mergeRegistrar(empty(),{source:'porkbun',account:'porkbun-user',domains:[{id:'example.com',name:'example.com',expires:'2027-01-15 10:00:00',autoRenew:'1',status:'active'}]},at);
 assert.equal(pork.board.assets[0].id,'porkbun-domain-example.com');assert.equal(pork.board.assets[0].provider,'Porkbun');assert.equal(pork.board.assets[0].cycle,'yearly');
});

test('mergeRegistrar syncs again: platform values update, the person\'s name stays, missing ones are marked, never removed',()=>{
 let board=D.mergeRegistrar(empty(),namecheap([nc(1,'example.com'),nc(2,'example.net')]),at).board;
 const com=board.assets.find(a=>a.id==='namecheap-domain-1');com.name='Main site';com.notes='mine';com.url='https://ap.www.namecheap.com/domains/domaincontrolpanel/example.com/domain';
 const merge=D.mergeRegistrar(board,namecheap([nc(1,'example.com','02/15/2028','true')]),later);
 const again=merge.board.assets.find(a=>a.id==='namecheap-domain-1'),gone=merge.board.assets.find(a=>a.id==='namecheap-domain-2');
 assert.equal(merge.added,0);
 assert.equal(again.name,'Main site','a renamed record keeps its name');assert.equal(again.syncName,'example.com');
 assert.equal(again.notes,'mine');assert.match(again.url,/domaincontrolpanel/,'notes and link are the person\'s');
 assert.equal(again.date,'2028-02-15');assert.equal(again.cycle,'yearly');assert.equal(again.autoRenew,'on');assert.equal(again.syncedAt,later);assert.equal(again.syncMissing,false);
 assert.equal(gone.syncMissing,true,'not returned: marked');
 assert.equal(merge.board.assets.length,2,'nothing removed');
 const partial=D.mergeRegistrar(board,namecheap([nc(1,'example.com')],{complete:false}),later);
 assert.equal(partial.board.assets.find(a=>a.id==='namecheap-domain-2').syncMissing,undefined,'a partial list marks nothing missing');
 const other=D.mergeRegistrar(board,namecheap([],{account:'otheruser'}),later);
 assert.ok(other.board.assets.every(a=>!a.syncMissing),'another account\'s list leaves these alone');
 const porkbun=D.mergeRegistrar(board,{source:'porkbun',account:'apiexample',domains:[]},later);
 assert.ok(porkbun.board.assets.every(a=>!a.syncMissing),'another registrar leaves these alone');
 assert.equal(D.mergeRegistrar(board,namecheap([nc(1,'example.com')]),later).board.assets.find(a=>a.id==='namecheap-domain-1').cycle,'','auto-renew off again');
});

test('mergeRegistrar keeps deleted domains deleted and asks about same-name records',()=>{
 const board={blocks:[{id:'domain',folded:false}],deletedExternalIds:['namecheap:2','namecheap-domain-3'],assets:[
  {id:'own',type:'domain',name:'example.com',provider:'Namecheap',source:'manual',date:'2027-01-01',url:'https://registrar.example/panel'},
  {id:'cf',type:'domain',name:'example.org',source:'cloudflare',externalId:'zone-1',resourceKind:'zone'},
  {id:'sub',type:'subscription',name:'example.dev',source:'manual'}]};
 const merge=D.mergeRegistrar(board,namecheap([nc(1,'example.com','03/01/2027','true'),nc(2,'example.net'),nc(3,'example.io'),nc(4,'example.org'),nc(5,'example.dev')]),at);
 assert.deepEqual(merge.collisions.map(c=>[c.assetId,c.name,c.source]),[['own','example.com','Namecheap'],['cf','example.org','Namecheap']]);
 assert.deepEqual(merge.board.assets.map(a=>a.id).sort(),['cf','namecheap-domain-5','own','sub'],'deleted ones (by key or id) are not added; another category is no collision');
 assert.equal(merge.board.assets.find(a=>a.id==='own').date,'2027-01-01','nothing is overwritten before the person ticks it');
 const ticked=structuredClone(merge.board);
 assert.equal(D.applyCollision(ticked,merge.collisions[0]),true);
 const own=ticked.assets.find(a=>a.id==='own');
 assert.equal(own.source,'namecheap');assert.equal(own.externalId,'1');assert.equal(own.date,'2027-03-01');assert.equal(own.url,'https://registrar.example/panel','the link stays');
 const next=D.mergeRegistrar(ticked,namecheap([nc(1,'example.com','03/01/2028','true')]),later);
 assert.equal(next.collisions.length,0);assert.equal(next.added,0);assert.equal(next.board.assets.find(a=>a.id==='own').date,'2028-03-01','a ticked record syncs from then on');
});

test('mergeRegistrar refuses unknown sources and malformed answers without changing the board',()=>{
 const board=empty();
 for(const result of [null,{},{source:'godaddy',domains:[nc(1,'example.com')]},{source:'__proto__',domains:[]},{source:'toString',domains:[]}]){
  const merge=D.mergeRegistrar(board,result,at);
  assert.equal(merge.board,board);assert.equal(merge.added,0);
 }
 const merge=D.mergeRegistrar(board,{source:'namecheap',domains:'oops'},at);
 assert.equal(merge.read,0);assert.equal(merge.board.assets.length,0);assert.equal(board.assets.length,0,'the board passed in is not changed');
 const odd=D.mergeRegistrar(board,namecheap([nc(1,'example.com','02/30/2027','maybe','x'.repeat(80))]),at).board.assets[0];
 assert.equal(odd.date,'');assert.equal('autoRenew' in odd,false);assert.ok(odd.syncStatus.length<=30);
});

test('registrarCredentialProblem checks what each registrar needs before anything is sent',()=>{
 const good={apiUser:'apiexample',apiKey:'0123456789abcdef0123456789abcdef',clientIp:'203.0.113.10'};
 assert.equal(D.registrarCredentialProblem('namecheap',good),'');
 assert.equal(D.registrarCredentialProblem('namecheap',{...good,clientIp:' 198.51.100.7 '}),'','spaces around are trimmed');
 assert.match(D.registrarCredentialProblem('namecheap',{...good,apiKey:''}),/每一栏/);
 assert.match(D.registrarCredentialProblem('namecheap',{...good,apiUser:'has space'}),/API 用户名/);
 assert.match(D.registrarCredentialProblem('namecheap',{...good,apiUser:'x'.repeat(21)}),/API 用户名/);
 assert.match(D.registrarCredentialProblem('namecheap',{...good,apiKey:'too-short'}),/API Key/);
 for(const ip of ['203.0.113','203.0.113.256','203.0.113.01','2001:db8::1','example.com'])assert.match(D.registrarCredentialProblem('namecheap',{...good,clientIp:ip}),/IPv4/,ip);
 for(const ip of ['192.168.1.109','10.0.0.2','172.16.5.4','127.0.0.1','169.254.1.1','100.64.0.1','0.0.0.0','224.0.0.1'])assert.match(D.registrarCredentialProblem('namecheap',{...good,clientIp:ip}),/公网/,ip);
 const pork={apiKey:'pk1_'+'a'.repeat(32),secretKey:'sk1_'+'b'.repeat(32)};
 assert.equal(D.registrarCredentialProblem('porkbun',pork),'');
 assert.match(D.registrarCredentialProblem('porkbun',{apiKey:pork.secretKey,secretKey:pork.apiKey}),/pk1_/,'swapped keys');
 assert.match(D.registrarCredentialProblem('porkbun',{...pork,secretKey:'sk1_short'}),/sk1_/);
 assert.match(D.registrarCredentialProblem('porkbun',{...pork,apiKey:'pk1_aaaa aaaa'}),/pk1_/);
 assert.match(D.registrarCredentialProblem('godaddy',{}),/不认识/);
 assert.match(D.registrarCredentialProblem('__proto__',{}),/不认识/);
 assert.match(D.registrarCredentialProblem('namecheap',null),/每一栏/);
});

test('REGISTRARS points the key and domain links at the registrars\' own https hosts',()=>{
 for(const [id,r] of Object.entries(D.REGISTRARS)){
  for(const url of [r.keyUrl,r.manage]){const host=new URL(url).hostname;assert.equal(new URL(url).protocol,'https:');assert.ok(host===`${id}.com`||host.endsWith(`.${id}.com`),url);}
  assert.ok(r.fields.length>=2&&r.fields.every(f=>/^[a-zA-Z]+$/.test(f.key)));
 }
 assert.equal(D.syncedLabel({source:'namecheap'}),'同步于');
});
