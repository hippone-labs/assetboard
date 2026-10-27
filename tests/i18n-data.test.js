// asset-data.js in English: its tables take their words when it loads (as in the page, where the language is set first),
// so this file switches to English before requiring it. The Chinese output is covered by the other tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const i18n=require('../i18n.js');
globalThis.tr=i18n.tr;globalThis.trLocale=i18n.trLocale;
for(const f of fs.readdirSync(path.join(root,'i18n')).filter(f=>/^en-.*\.js$/.test(f)))new Function('I18N',fs.readFileSync(path.join(root,'i18n',f),'utf8'))(i18n.I18N);
i18n.useLang('en');
const D=require('../asset-data.js');
const at=day=>new Date(`${day}T12:00:00`);

test('date status, cycle and date kind labels in English',()=>{
 assert.equal(D.assetDateStatus({date:'2026-10-28',dateKind:'expire'},at('2026-10-25')).label,'Expires in 3 days');
 assert.equal(D.assetDateStatus({date:'2026-10-26',dateKind:'renew'},at('2026-10-25')).label,'Charge tomorrow');
 assert.equal(D.assetDateStatus({date:'2026-10-24',dateKind:'trial'},at('2026-10-25')).label,'Trial ended 1 day ago');
 assert.equal(D.assetDateStatus({date:'2027-06-01'},at('2026-10-25')).label,'2027-06-01 · Expires');
 assert.equal(D.billingCycles.quarterly.label,'Every 3 months');
 assert.equal(D.dateKinds.keep.label,'Keep-alive deadline');
 // Stored words stay Chinese: the event text and the cost suffix are read back.
 assert.equal(D.dateKinds.expire.future,'到期');assert.equal(D.billingCycles.yearly.suffix,'年');
 assert.deepEqual(D.renewOptions({date:'2026-12-01',cycle:'yearly',dateKind:'expire'},at('2026-10-25')).options.map(o=>o.label),['1 year','2 years','3 years','5 years']);
});

test('lifecycle phase and registry labels in English',()=>{
 const life=D.lifecycleOf({type:'domain',name:'example.com',provider:'Cloudflare',date:'2026-10-15',dateKind:'expire'},at('2026-10-25'));
 assert.equal(life.label,'Redemption period · 21 days left');
 assert.equal(D.rdapPhaseLabels.pendingDelete,'Pending delete');
 assert.equal(D.linkKind({type:'bankcard'},{type:'subscription'}).label,'Pays');
});

test('reminder titles and bodies follow the interface language',()=>{
 const plan=D.reminderPlan([
  {id:'a',name:'example.com',type:'domain',date:'2026-11-24',dateKind:'expire'},
  {id:'b',name:'example.net',type:'domain',date:'2026-11-24',dateKind:'expire'}
 ],at('2026-10-20'));
 const day=plan.find(p=>p.id==='reminder-2026-10-25');
 assert.equal(day.title,'2 items need attention');
 assert.equal(day.body,'example.com Expires in 30 days; example.net Expires in 30 days');
 const one=D.reminderPlan([{id:'c',name:'Notes Pro',type:'subscription',date:'2026-10-27',dateKind:'trial',cost:'$8.00 / 月'}],at('2026-10-20'))[0];
 assert.equal(one.title,'Notes Pro');assert.equal(one.body,'Trial ends in 3 days, then $8.00 / 月');
});

test('import errors and the shutdown checklist in English',()=>{
 assert.equal(D.parseDelimitedText('').error,'No table content to read');
 assert.equal(D.parseBoardBackup('[').error,'Not valid JSON');
 const plan=D.shutdownPlan([{id:'d',type:'domain',name:'example.org',project:'p',icp:'ICP 1',cycle:'yearly',date:'2027-01-01'}],'p',{now:at('2026-10-25')});
 assert.equal(plan.steps[0].action,'Cancel the ICP filing first, then: Turn off auto-renew, or transfer it to someone');
 // The ledger header in English is still recognized as Assetboard's own read-only copy.
 assert.equal(D.classifyImportPayload({text:D.ledgerCsv([]),filename:'ledger.csv'}).copy,'付款账本');
 assert.equal(D.classifyImportPayload({text:D.handoverHtml({assets:[]}),filename:'handover.html'}).copy,'交接清单');
});
