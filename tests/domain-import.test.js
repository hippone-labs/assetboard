const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

test('domainFromText reads bare names and web addresses and refuses everything else',()=>{
 assert.equal(D.domainFromText('example.com'),'example.com');
 assert.equal(D.domainFromText('  Example.COM. '),'example.com','case and a trailing dot');
 assert.equal(D.domainFromText('www.example.com'),'example.com');
 assert.equal(D.domainFromText('blog.example.org'),'blog.example.org','a typed subdomain stays as typed');
 assert.equal(D.domainFromText('https://www.example.com/pricing?plan=pro#top'),'example.com');
 assert.equal(D.domainFromText('http://shop.example.co.uk:8080/a'),'example.co.uk','a web address is cut to its registrable domain');
 assert.equal(D.domainFromText('example.com:8443/path'),'example.com','a port without a scheme');
 assert.equal(D.domainFromText('<https://example.net>'),'example.net','angle brackets from a mail');
 assert.equal(D.domainFromText('例子.中国'),'xn--fsqu00a.xn--fiqs8s','non-ASCII names in punycode');
 for(const bad of ['','  ','example','localhost','a.b','-bad.example','bad-.example','exa mple.example','user@example.com','mailto:user@example.com','https://user:secret@example.com',
  'ftp://example.com','javascript:alert(1)','192.0.2.10','https://203.0.113.5/','2001:db8::1','github.com/owner/repo','https://gitlab.com/owner/repo','x'.repeat(2001),null,undefined,42])
  assert.equal(D.domainFromText(bad),'',`refused: ${String(bad).slice(0,40)}`);
 assert.equal(D.domainFromText(`${'a'.repeat(64)}.com`),'','a label longer than 63');
});

test('a pasted web address on its own line becomes a domain record name',()=>{
 assert.deepEqual(D.parseQuickLine('https://www.example.com/pricing'),{name:'example.com',type:'domain'});
 assert.deepEqual(D.parseQuickLine('www.example.com'),{name:'example.com',type:'domain'});
 assert.equal(D.inferTypeFromName('https://example.com/'),'domain');
 assert.equal(D.inferTypeFromName('https://github.com/owner/repo'),'repository','repositories stay repositories');
 assert.equal(D.parseQuickLine('example.com namecheap 2027-03-01 $11/年').provider,'namecheap','the typed line keeps working');
});

test('domainListText takes two or more domains in any common layout and nothing else',()=>{
 assert.deepEqual(D.domainListText('example.com\nhttps://example.net/x\n- example.org\n\nexample.com\n'),{domains:['example.com','example.net','example.org'],truncated:false,total:3});
 assert.deepEqual(D.domainListText('example.com, example.net；example.org、example.io').domains,['example.com','example.net','example.org','example.io']);
 assert.deepEqual(D.domainListText('1. example.com\n2) example.net\n• example.org').domains,['example.com','example.net','example.org'],'numbered and bulleted lists');
 assert.equal(D.domainListText('example.com'),null,'one domain is a single record, not a list');
 assert.equal(D.domainListText('example.com\nhello world'),null,'any piece that is not a domain');
 assert.equal(D.domainListText('example.com namecheap 2027-03-01'),null,'a typed line');
 assert.equal(D.domainListText('name,date\nexample.com,2027-01-01'),null,'a table with a header');
 assert.equal(D.domainListText(''),null);
 const many=Array.from({length:130},(_,i)=>`site${i}.example`).join('\n'),list=D.domainListText(many);
 assert.equal(list.domains.length,D.IMPORT_ROW_LIMIT);assert.equal(list.truncated,true);assert.equal(list.total,130);
});

test('a pasted list of domains is classified before tables and imports as domain records',()=>{
 assert.equal(D.classifyImportPayload({text:'example.com\nexample.net'}).kind,'domains');
 assert.equal(D.classifyImportPayload({text:'a.example,b.example\nc.example'}).kind,'domains','commas would also split as a table');
 assert.equal(D.classifyImportPayload({text:'name,date\nexample.com,2027-01-01'}).kind,'csv');
 assert.equal(D.classifyImportPayload({text:'example.com'}).kind,'paste','one domain stays a paste');
 assert.equal(D.importGate({text:'example.com\nexample.net'}).kind,'domains');
 const items=D.domainListItems(['example.com','example.net']);
 assert.deepEqual(items.map(i=>[i.type,i.name,i.externalId,i.source]),[['domain','example.com','domain:example.com','csv'],['domain','example.net','domain:example.net','csv']]);
 const board={blocks:[],assets:[{id:'own',type:'domain',name:'example.com',source:'manual'}],deletedExternalIds:[D.csvSyncKey('domain','example.org')]};
 const plan=D.planImport(board,D.domainListItems(['example.com','example.net','example.org']),{sameName:'skip'});
 assert.deepEqual(plan.added.map(r=>r.item.name),['example.net']);
 assert.deepEqual(plan.skippedSame.map(r=>r.name),['example.com'],'a domain already on the board is skipped');
 assert.deepEqual(plan.skippedDeleted.map(r=>r.item.name),['example.org'],'a deleted one stays deleted');
 const next=D.applyImport(board,plan,{now:'2026-11-07T00:00:00.000Z'}),added=next.assets.find(a=>a.name==='example.net');
 assert.equal(added.type,'domain');assert.equal(added.date,'');assert.equal(added.importedFrom,'粘贴的域名');assert.equal(added.event,'日期待补充');
});

test('registrarProvider turns the RDAP registrar into the form\'s registrar name',()=>{
 assert.equal(D.registrarProvider('NameCheap, Inc.'),'Namecheap');
 assert.equal(D.registrarProvider('Porkbun LLC'),'Porkbun');
 assert.equal(D.registrarProvider('GoDaddy.com, LLC'),'GoDaddy');
 assert.equal(D.registrarProvider('Cloudflare, Inc.'),'Cloudflare');
 assert.equal(D.registrarProvider('Alibaba Cloud Computing (Beijing) Co., Ltd.'),'阿里云');
 assert.equal(D.registrarProvider('Example Registrar, Inc.'),'Example Registrar','an unknown one loses only its company suffix');
 assert.equal(D.registrarProvider('Key-Systems GmbH'),'Key-Systems');
 assert.equal(D.registrarProvider('Inc.'),'Inc.','never empty when something was given');
 assert.equal(D.registrarProvider(''),'');assert.equal(D.registrarProvider(null),'');assert.equal(D.registrarProvider(' , '),'','punctuation only');
 assert.ok(D.registrarProvider('x'.repeat(300)).length<=80);
});

test('rdapFormFields fills only empty fields and never a date past expiry',()=>{
 const facts={expires:'2027-03-01',registrar:'NameCheap, Inc.',phase:'',hold:'',ns:[]};
 assert.deepEqual(D.rdapFormFields({date:'',provider:''},facts),{fill:{date:'2027-03-01',dateKind:'expire',provider:'Namecheap'},registry:'2027-03-01',registrar:'Namecheap',differs:false});
 assert.deepEqual(D.rdapFormFields({date:'2027-01-01',provider:'Porkbun'},facts).fill,{},'what was typed stays');
 assert.equal(D.rdapFormFields({date:'2027-01-01',provider:''},facts).differs,true);
 assert.equal(D.rdapFormFields({date:'2027-03-01',provider:''},facts).differs,false);
 assert.deepEqual(D.rdapFormFields({date:'',provider:''},{...facts,phase:'autoRenew'}).fill,{provider:'Namecheap'},'the auto-renew grace year is no renewal');
 assert.deepEqual(D.rdapFormFields({},D.rdapFacts(null)),{fill:{},registry:'',registrar:'',differs:false},'an empty answer fills nothing');
 assert.deepEqual(D.rdapFormFields(null,undefined).fill,{});
 const real=D.rdapFacts({events:[{eventAction:'expiration',eventDate:'2028-05-20T04:00:00Z'}],entities:[{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Porkbun LLC']]]}]});
 assert.deepEqual(D.rdapFormFields({date:' ',provider:' '},real).fill,{date:'2028-05-20',dateKind:'expire',provider:'Porkbun'},'blank fields count as empty');
});
