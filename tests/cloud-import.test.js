const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

const at='2026-11-08T00:00:00.000Z',later='2026-12-01T00:00:00.000Z';
const empty=()=>({blocks:[],assets:[],deletedExternalIds:[]});
const hetzner=(resources,extra={})=>({source:'hetzner',account:'main',complete:true,queriedKinds:['server'],resources,...extra});
const server=(id,name,extra={})=>({kind:'server',id:String(id),name,status:'running',ips:['203.0.113.10'],region:'DE',price:{currency:'EUR',value:4.5101},detail:'CX22 · Falkenstein',...extra});
const ocean=(resources,extra={})=>({source:'digitalocean',account:'My Team',complete:true,queriedKinds:['droplet','app','database'],resources,...extra});

test('cleanCloudResources keeps only known kinds, plain ids, real names, addresses, regions, prices and links on the platform\'s host',()=>{
 const {resources,skipped}=D.cleanCloudResources('digitalocean',[
  {kind:'droplet',id:'3164444',name:' app-1 ',status:'ACTIVE',ips:['198.51.100.7','10.0.0.x','2001:db8::7'],region:'nl',price:{currency:'USD',value:6},url:'https://cloud.digitalocean.com/droplets/3164444',detail:'s-1vcpu-1gb · ams3'},
  {kind:'droplet',id:'3164444',name:'again'},{kind:'server',id:'1',name:'not this platform\'s kind'},{kind:'app',id:'a b',name:'bad id'},{kind:'app',id:'x',name:''},
  {kind:'app',id:'4f6c71e2',name:'notes\u0007web',status:'ACTIVE',region:'XX',price:{currency:'XYZ',value:5},url:'https://evil.example/apps/1'},
  {kind:'database',id:'9cc10173',name:'db',price:{currency:'USD',value:-1},url:'http://cloud.digitalocean.com/databases/9'},null,'text']);
 assert.equal(skipped,6);
 assert.deepEqual(resources[0],{kind:'droplet',id:'3164444',name:'app-1',status:'active',ips:['198.51.100.7','2001:db8::7'],region:'NL',price:{currency:'USD',value:'6'},detail:'s-1vcpu-1gb · ams3',url:'https://cloud.digitalocean.com/droplets/3164444'});
 assert.deepEqual(resources[1],{kind:'app',id:'4f6c71e2',name:'notesweb',status:'active'},'control characters, unknown regions and currencies, another host: dropped');
 assert.deepEqual(resources[2],{kind:'database',id:'9cc10173',name:'db',status:''},'a negative price and a plain http link are dropped');
 const domains=D.cleanCloudResources('vercel',[{kind:'domain',id:'example.com',name:'Example.COM.',expires:'2027-01-15T08:00:00Z',autoRenew:'true'},{kind:'domain',id:'nope',name:'not a domain'}]);
 assert.deepEqual(domains.resources,[{kind:'domain',id:'example.com',name:'example.com',status:'',expires:'2027-01-15',autoRenew:true}]);assert.equal(domains.skipped,1);
 assert.deepEqual(D.cleanCloudResources('godaddy',[server(1,'x')]),{resources:[],skipped:0});
 assert.deepEqual(D.cleanCloudResources('__proto__',[server(1,'x')]),{resources:[],skipped:0});
 const many=D.cleanCloudResources('hetzner',Array.from({length:D.CLOUD_LIMIT+2},(_,i)=>server(i,`web-${i}`)));
 assert.equal(many.resources.length,D.CLOUD_LIMIT);assert.equal(many.skipped,2);
});

test('mergeCloudImport adds servers with addresses, region, monthly price and the platform as provider',()=>{
 const merge=D.mergeCloudImport(empty(),hetzner([server(42,'web-1'),server(43,'web-2',{status:'off',price:undefined,ips:[]})]),at);
 assert.equal(merge.added,2);assert.equal(merge.read,2);assert.deepEqual(merge.collisions,[]);
 const [web,off]=merge.board.assets;
 assert.equal(web.id,'hetzner-server-42');assert.equal(web.type,'server');assert.equal(web.source,'hetzner');assert.equal(web.provider,'Hetzner');assert.equal(web.account,'main');
 assert.deepEqual(web.ips,['203.0.113.10']);assert.equal(web.region,'DE');assert.equal(web.cost,'€4.51 / 月');assert.equal(web.cycle,'monthly');assert.equal(web.dateKind,'renew');
 assert.equal(web.purpose,'Cloud Server · CX22 · Falkenstein');assert.equal(web.event,'running');assert.equal(web.url,'https://console.hetzner.com/projects');assert.equal(web.createdAt,at);
 assert.match(web.notes,/月价/);
 assert.equal(off.cost,'未知');assert.equal(off.cycle,'');assert.equal('ips' in off,false);assert.equal(off.syncStatus,'off');
 assert.equal(D.assetSyncKey(web),'hetzner:server:42');
 assert.deepEqual(D.costAmount(web),{currency:'EUR',value:4.51,months:1},'the price counts in the totals');
 assert.ok(merge.board.blocks.some(b=>b.id==='server'));
 for(const source of ['hetzner','digitalocean','vercel'])assert.ok(D.PLATFORM_SOURCES.includes(source),'cloud records keep their source and category');
});

test('mergeCloudImport puts each DigitalOcean and Vercel kind in its category; a Vercel domain repeats only with auto-renew on',()=>{
 const merge=D.mergeCloudImport(empty(),ocean([{kind:'droplet',id:'1',name:'app-1',status:'active',region:'NL'},{kind:'app',id:'4f6c',name:'notes-web',status:'active',url:'https://cloud.digitalocean.com/apps/4f6c'},{kind:'database',id:'9cc1',name:'db-main',status:'online',detail:'pg 16'}]),at);
 assert.deepEqual(merge.board.assets.map(a=>[a.id,a.type,a.purpose]),[['digitalocean-droplet-1','server','Droplet'],['digitalocean-app-4f6c','deployment','App Platform'],['digitalocean-database-9cc1','database','Managed Database · pg 16']]);
 assert.equal(merge.board.assets[1].url,'https://cloud.digitalocean.com/apps/4f6c');
 assert.deepEqual(['server','deployment','database'].filter(type=>merge.board.blocks.some(b=>b.id===type)),['server','deployment','database']);
 const vercel=D.mergeCloudImport(empty(),{source:'vercel',account:'acme',queriedKinds:['project','domain'],resources:[
  {kind:'project',id:'prj_1',name:'notes-web',status:'ready',url:'https://vercel.com/acme/notes-web',detail:'nextjs'},
  {kind:'domain',id:'example.com',name:'example.com',expires:'2027-01-15T08:00:00Z',autoRenew:'true'},{kind:'domain',id:'example.net',name:'example.net',expires:'2027-03-01',autoRenew:false}]},at).board.assets;
 assert.equal(vercel[0].type,'deployment');assert.equal(vercel[0].purpose,'Vercel 项目 · nextjs');assert.equal(vercel[0].url,'https://vercel.com/acme/notes-web');
 assert.equal(vercel[1].type,'domain');assert.equal(vercel[1].date,'2027-01-15');assert.equal(vercel[1].dateKind,'expire');assert.equal(vercel[1].cycle,'yearly');assert.equal(vercel[1].autoRenew,'on');
 assert.equal(vercel[2].cycle,'');assert.equal(vercel[2].autoRenew,'off');assert.equal(vercel[1].purpose,'');
});

test('mergeCloudImport syncs again: the platform\'s values update, the person\'s name and cost stay, missing ones are marked, never removed',()=>{
 let board=D.mergeCloudImport(empty(),hetzner([server(1,'web-1'),server(2,'web-2'),server(3,'web-3',{price:undefined})]),at).board;
 const web=board.assets.find(a=>a.id==='hetzner-server-1');web.name='Main web';web.cost='€9 / 月';web.notes='mine';web.url='https://console.hetzner.com/projects/1/servers/1/overview';
 const merge=D.mergeCloudImport(board,hetzner([server(1,'web-1',{status:'off',ips:['198.51.100.9'],region:'FI',price:{currency:'EUR',value:5}}),server(3,'web-3')]),later);
 const again=merge.board.assets.find(a=>a.id==='hetzner-server-1'),gone=merge.board.assets.find(a=>a.id==='hetzner-server-2'),third=merge.board.assets.find(a=>a.id==='hetzner-server-3');
 assert.equal(merge.added,0);
 assert.equal(again.name,'Main web');assert.equal(again.syncName,'web-1');assert.equal(again.cost,'€9 / 月','the person\'s cost is kept');
 assert.equal(again.notes,'mine');assert.match(again.url,/overview/);
 assert.deepEqual(again.ips,['198.51.100.9']);assert.equal(again.region,'FI');assert.equal(again.syncStatus,'off');assert.equal(again.event,'off');assert.equal(again.syncedAt,later);assert.equal(again.syncMissing,false);
 assert.equal(third.cost,'€4.51 / 月','an unknown cost is filled when the platform names one');
 assert.equal(gone.syncMissing,true,'not returned: marked');assert.equal(merge.board.assets.length,3,'nothing removed');
 assert.equal(D.mergeCloudImport(board,hetzner([],{complete:false}),later).board.assets.some(a=>a.syncMissing),false,'a partial answer marks nothing');
 assert.equal(D.mergeCloudImport(board,hetzner([],{account:'other'}),later).board.assets.some(a=>a.syncMissing),false,'another project\'s answer leaves these alone');
 // A kind the token could not read is not marked missing.
 let oceanBoard=D.mergeCloudImport(empty(),ocean([{kind:'droplet',id:'1',name:'app-1'},{kind:'database',id:'9',name:'db'}]),at).board;
 oceanBoard=D.mergeCloudImport(oceanBoard,ocean([{kind:'droplet',id:'1',name:'app-1'}],{queriedKinds:['droplet','app']}),later).board;
 assert.equal(oceanBoard.assets.find(a=>a.id==='digitalocean-database-9').syncMissing,undefined);
 assert.equal(D.mergeCloudImport(oceanBoard,ocean([]),later).board.assets.every(a=>a.syncMissing),true);
});

test('mergeCloudImport keeps deleted records deleted and asks about same-name records',()=>{
 const board={blocks:[{id:'server',folded:false}],deletedExternalIds:['hetzner:server:2','hetzner-server-3'],assets:[
  {id:'own',type:'server',name:'web-1',provider:'Hetzner',source:'manual',cost:'',url:'https://console.hetzner.com/projects/1/servers/1/overview'},
  {id:'ssh',type:'server',name:'web-4',source:'ssh',host:'web-4.example',cost:'€20 / 月'},
  {id:'sub',type:'subscription',name:'web-5',source:'manual'}]};
 const merge=D.mergeCloudImport(board,hetzner([server(1,'web-1'),server(2,'web-2'),server(3,'web-3'),server(4,'web-4'),server(5,'web-5')]),at);
 assert.deepEqual(merge.collisions.map(c=>[c.assetId,c.name,c.source]),[['own','web-1','Hetzner'],['ssh','web-4','Hetzner']]);
 assert.deepEqual(merge.board.assets.map(a=>a.id).sort(),['hetzner-server-5','own','ssh','sub'],'deleted ones (by key or id) are not added; another category is no collision');
 assert.equal(merge.collisions[0].fields.cost,'€4.51 / 月','an empty cost takes the price');assert.equal('cost' in merge.collisions[1].fields,false,'a cost the person set stays');
 const ticked=structuredClone(merge.board);
 assert.equal(D.applyCollision(ticked,merge.collisions[0]),true);
 const own=ticked.assets.find(a=>a.id==='own');
 assert.equal(own.source,'hetzner');assert.equal(own.externalId,'1');assert.equal(own.resourceKind,'server');assert.match(own.url,/overview/,'the link stays');
 const next=D.mergeCloudImport(ticked,hetzner([server(1,'web-1',{status:'off'})]),later);
 assert.equal(next.collisions.length,0);assert.equal(next.added,0);assert.equal(next.board.assets.find(a=>a.id==='own').syncStatus,'off','a ticked record syncs from then on');
 // The same id under another kind is another record.
 const kinds=D.mergeCloudImport(empty(),ocean([{kind:'droplet',id:'7',name:'seven'},{kind:'app',id:'7',name:'seven-app'}]),at);
 assert.equal(kinds.added,2);assert.equal(D.findByExternal(kinds.board,'digitalocean','7','app').name,'seven-app');
});

test('mergeCloudImport refuses unknown sources and malformed answers without changing the board',()=>{
 const board=empty();
 for(const result of [null,{},{source:'linode',resources:[server(1,'x')]},{source:'__proto__',resources:[]},{source:'constructor',resources:[]}]){
  const merge=D.mergeCloudImport(board,result,at);
  assert.equal(merge.board,board);assert.equal(merge.added,0);
 }
 const merge=D.mergeCloudImport(board,{source:'hetzner',resources:'oops'},at);
 assert.equal(merge.read,0);assert.equal(merge.board.assets.length,0);assert.equal(board.assets.length,0,'the board passed in is not changed');
 const odd=D.mergeCloudImport(board,hetzner([server(1,'x',{status:'x'.repeat(80)+'!',queriedKinds:'oops'})],{queriedKinds:['server','bogus']}),at).board.assets[0];
 assert.ok(odd.syncStatus.length<=30);
});

test('cloudCredentialProblem checks what each platform needs before anything is sent',()=>{
 const h='a1'.repeat(32),d='dop_v1_'+'0f'.repeat(32),v='AbCdEf0123456789xyZ_-123';
 assert.equal(D.cloudCredentialProblem('hetzner',{token:h}),'');assert.equal(D.cloudCredentialProblem('hetzner',{token:` ${h} `,project:'main'}),'');
 assert.match(D.cloudCredentialProblem('hetzner',{token:''}),/API 令牌/);
 assert.match(D.cloudCredentialProblem('hetzner',{token:h.slice(1)}),/64/);
 assert.match(D.cloudCredentialProblem('hetzner',{token:h,project:'x'.repeat(61)}),/60/);
 assert.equal(D.cloudCredentialProblem('digitalocean',{token:d}),'');
 for(const bad of [h,'dop_v1_short','dop_v1_'+'0F'.repeat(32)])assert.match(D.cloudCredentialProblem('digitalocean',{token:bad}),/dop_v1_/,bad);
 assert.equal(D.cloudCredentialProblem('vercel',{token:v}),'');assert.equal(D.cloudCredentialProblem('vercel',{token:v,team:'team_abc123'}),'');assert.equal(D.cloudCredentialProblem('vercel',{token:v,team:'acme-inc'}),'');
 assert.match(D.cloudCredentialProblem('vercel',{token:'short'}),/Vercel/);
 for(const team of ['Acme Inc','-acme','team_','../x'])assert.match(D.cloudCredentialProblem('vercel',{token:v,team}),/team_/,team);
 assert.match(D.cloudCredentialProblem('linode',{}),/不认识/);assert.match(D.cloudCredentialProblem('__proto__',{}),/不认识/);
 assert.match(D.cloudCredentialProblem('hetzner',null),/API 令牌/);
});

test('CLOUD_IMPORTS points the token and console links at the platforms\' own https hosts',()=>{
 for(const [id,c] of Object.entries(D.CLOUD_IMPORTS)){
  for(const url of [c.keyUrl,c.manage]){const u=new URL(url);assert.equal(u.protocol,'https:');assert.ok(u.hostname===c.host||u.hostname.endsWith('.'+c.host),url);}
  assert.ok(c.fields[0].key==='token'&&c.fields[0].secret&&c.fields.every(f=>/^[a-zA-Z]+$/.test(f.key)),id);
  assert.ok(Object.values(c.kinds).every(k=>['server','deployment','database','domain'].includes(k.type)),id);
 }
 assert.equal(D.CLOUD_IMPORTS.vercel.wide,true,'Vercel has no read-only token');
 assert.equal(D.syncKey('vercel','prj_1','project'),'vercel:project:prj_1');
 assert.equal(D.regionName('FI'),'芬兰','Hetzner Helsinki has its country');
});
