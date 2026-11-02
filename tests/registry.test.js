const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

const at=day=>new Date(`${day}T10:00:00`);

test('rdapFacts reads holds, EPP spellings and nameservers; a frozen domain is never reported as matching',()=>{
 const json=(status,extra={})=>({status,events:[{eventAction:'expiration',eventDate:'2027-03-01T00:00:00Z'}],...extra});
 assert.equal(D.rdapFacts(json(['client hold'])).hold,'client');
 assert.equal(D.rdapFacts(json(['serverHold'])).hold,'server','EPP spelling');
 assert.equal(D.rdapFacts(json(['clientHold','serverHold'])).hold,'server','the registry side wins');
 assert.equal(D.rdapFacts(json(['client transfer prohibited','clientUpdateProhibited'])).hold,'','prohibitions are not a hold');
 assert.equal(D.rdapFacts(json(['pendingDelete'])).phase,'pendingDelete','EPP spelling of a phase');
 assert.equal(D.rdapFacts(json(['redemptionPeriod'])).phase,'redemption');
 assert.equal(D.rdapFacts(json(['autoRenewPeriod'])).phase,'autoRenew');
 assert.deepEqual(D.rdapFacts(json([],{nameservers:[{ldhName:'NS2.Example.NET.'},{ldhName:'ns1.example.net'},{ldhName:'ns1.example.net'},{ldhName:'bad name'},{}]})).ns,['ns1.example.net','ns2.example.net']);
 assert.equal(D.rdapFacts(json([],{nameservers:Array.from({length:20},(_,i)=>({ldhName:`ns${String(i).padStart(2,'0')}.example.net`}))})).ns.length,13);
 assert.deepEqual(D.rdapCompare({date:'2027-03-01'},D.rdapFacts(json(['client hold']))),{state:'hold',hold:'client',dates:'same',registry:'2027-03-01'},'same date, still not 一致');
 assert.equal(D.rdapCompare({date:'2026-12-01'},D.rdapFacts(json(['server hold']))).dates,'differs');
 assert.equal(D.rdapCompare({date:'2027-03-01'},{hold:'client',expires:''}).state,'hold','a hold without a date is still reported');
 assert.equal(D.rdapCompare({date:'2026-03-01'},D.rdapFacts(json(['redemption period','server hold']))).hold,'server','a phase keeps the hold');
 assert.equal(D.rdapCompare({date:'2027-03-01'},D.rdapFacts(json(['active']))).state,'same');
});

test('rdapRemember stores the hold, registrar and nameservers and notes when they change',()=>{
 const now=at('2026-11-02'),a={id:'d',type:'domain',name:'shop.example'};
 assert.equal(D.rdapRemember(a,{registrar:'Example Registrar',ns:['ns1.example.net','ns2.example.net'],hold:''},now),null,'the first check has nothing to compare');
 assert.equal(a.registryRegistrar,'Example Registrar');assert.deepEqual(a.registryNS,['ns1.example.net','ns2.example.net']);
 assert.equal(D.rdapRemember(a,{registrar:'example registrar',ns:['ns2.example.net','ns1.example.net'],hold:''},now),null,'case and order do not count');
 assert.equal(D.rdapRemember(a,{registrar:'Example Registrar',ns:[],hold:''},now),null,'a reply without nameservers is no change');
 assert.deepEqual(a.registryNS,['ns1.example.net','ns2.example.net']);
 const change=D.rdapRemember(a,{registrar:'Example Registrar',ns:['park1.example.org','park2.example.org'],hold:''},now);
 assert.deepEqual(change,{at:now.toISOString(),ns:['ns1.example.net','ns2.example.net']});
 assert.deepEqual(D.registryChangeOf(a),change);
 D.rdapRemember(a,{registrar:'Other Registrar',ns:['park3.example.org'],hold:'client'},now);
 assert.deepEqual(a.registryChange.ns,['ns1.example.net','ns2.example.net'],'keeps the first values seen');
 assert.equal(a.registryChange.registrar,'Example Registrar');
 assert.equal(D.registryHoldOf(a),'client');
 D.rdapRemember(a,{registrar:'Other Registrar',ns:['park3.example.org'],hold:''},now);
 assert.equal(D.registryHoldOf(a),'','a later check without a hold clears it');
 assert.equal(D.registryHoldOf({type:'server',registryHold:'client'}),'');
 assert.equal(D.registryHoldOf({type:'domain',registryHold:'bogus'}),'');
 assert.equal(D.registryChangeOf({type:'domain',registryChange:{ns:[]}}),null,'a change needs its time');
});

test('dueLevel counts frozen domains and unanswered renewals; registryAlerts lists them',()=>{
 const renewal={id:'r',type:'domain',name:'auto.example',date:'2025-10-05',dateKind:'expire',cycle:'yearly',createdAt:'2025-01-01T00:00:00Z'};
 assert.equal(D.assetDateStatus(renewal,at('2026-10-07')).level,'upcoming','the date alone rolls on');
 assert.equal(D.dueLevel(renewal,{now:at('2026-10-07')}),'soon','waiting for an answer counts as due');
 assert.equal(D.dueLevel(renewal,{now:at('2026-12-01')}),'overdue','past the grace it counts as expired');
 const namecheap={...renewal,provider:'Namecheap'};
 assert.equal(D.renewalGrace(namecheap),29,'a published rule gives the grace');
 assert.equal(D.dueLevel(namecheap,{now:at('2026-11-03')}),'soon');assert.equal(D.dueLevel(namecheap,{now:at('2026-11-04')}),'overdue');
 assert.equal(D.dueLevel({...renewal,stopped:true},{now:at('2026-12-01')}),'none');
 assert.equal(D.dueLevel(renewal,{now:at('2026-12-01'),since:'2026-11-01'}),'upcoming','not asked about a date before payments were kept');
 const frozen={id:'f',type:'domain',name:'held.example',date:'2027-08-01',dateKind:'expire',registryHold:'server'};
 assert.equal(D.dueLevel(frozen,{now:at('2026-10-07')}),'overdue');
 const changed={id:'c',type:'domain',name:'moved.example',registryChange:{at:'2026-10-01T00:00:00Z',ns:['ns1.example.net']}};
 const alerts=D.registryAlerts([frozen,changed,{...frozen,id:'h',hiddenAt:'2026-10-01'},{...changed,id:'s',stopped:true}]);
 assert.deepEqual(alerts.frozen.map(a=>a.id),['f']);assert.deepEqual(alerts.changed.map(a=>a.id),['c']);
});

test('rdapMissing names the TLDs without RDAP in the IANA bootstrap',()=>{
 for(const tld of ['io','co','me','sh','ac','cn','de','eu','jp'])assert.ok(D.rdapMissing(`shop.example.${tld}`),tld);
 assert.ok(!D.rdapMissing('shop.example.com'));assert.ok(!D.rdapMissing('shop.example.co.uk'));assert.ok(D.rdapMissing('SHOP.EXAMPLE.IO.'));
});
