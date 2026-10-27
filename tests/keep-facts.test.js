const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

// Round 4 (2026-10-24), individual developers first: how an account is got back into, where data is backed up, how much a record
// matters, and the accounts whose login mail sits on a domain of the list.
test('places are kept, codes and keys are refused',()=>{
 for(const ok of ['iPhone 上的 1Password','打印件 · 书桌抽屉','Bitwarden · 个人','iCloud 钥匙串','YubiKey 5C 两把','2026-01-01 生成'])assert.equal(D.looksLikeSecret(ok),false,ok);
 for(const bad of ['123456','验证码 482913','abcd1-ef2gh','JBSWY3DPEHPK3PXP','gh'+'p_abcdefgh12345678','s'+'k-proj-abc123def456ghi789jkl','-----BEGIN OPENSSH '+'PRIVATE KEY-----'])assert.equal(D.looksLikeSecret(bad),true,bad);
});

test('the recovery line and what it is missing',()=>{
 const g={type:'google',mfa:'totp',mfaWhere:'iPhone 上的 Authenticator',vault:'Bitwarden'};
 assert.equal(D.recoveryText(g),'两步验证：验证器 App · iPhone 上的 Authenticator；密码：Bitwarden');
 assert.match(D.recoveryGap(g),/恢复码没记放在哪/);
 assert.equal(D.recoveryGap({...g,recoveryCodes:'打印件'}),'');
 assert.match(D.recoveryGap({type:'appleid',mfa:'sms'}),/只用短信验证/);
 assert.equal(D.recoveryText({type:'server',mfa:'totp'}),'','servers have no recovery line');
});

test('the backup line: where, and whether a restore was ever tried',()=>{
 assert.equal(D.backupText({type:'database',backup:'snapshot'}),'只有同平台快照 · 没试过恢复');
 assert.equal(D.backupText({type:'server',backup:'elsewhere',backupNote:'每天导出到另一家存储',restoreTestedOn:'2026-05-01'}),'另一家或本地 · 每天导出到另一家存储 · 2026-05-01 试过恢复');
 assert.equal(D.backupText({type:'server',backup:'none'}),'没有备份');
 assert.equal(D.backupText({type:'domain',backup:'elsewhere'}),'');
 assert.equal(D.backupText({type:'server'}),'');
});

test('accounts whose login mail is on a domain; the registrar account on its own mail; the reminder says so',()=>{
 const dom={id:'d',type:'domain',name:'example.com',account:'admin@example.com',date:'2026-11-04',dateKind:'expire'};
 const assets=[dom,{id:'g',type:'subscription',name:'GitHub',account:'me@example.com'},{id:'a',type:'appleid',name:'Apple',account:'me@Mail.Example.com'},
  {id:'o',type:'ai',name:'Other',account:'me@example.org'},{id:'h',type:'ai',name:'Hidden',account:'x@example.com',hiddenAt:'2026-01-01T00:00:00Z'},{id:'n',type:'ai',name:'Lookalike',account:'me@notexample.com'}];
 assert.equal(D.mailHost('Me <me@Mail.Example.com>'),'mail.example.com');
 assert.deepEqual(D.mailDependents(assets,dom).map(a=>a.id),['g','a']);
 assert.equal(D.selfRecovery(dom),true);
 assert.equal(D.selfRecovery({...dom,account:'me@example.org'}),false);
 assert.equal(D.mailStake(assets,dom),'3 个账号的登录邮箱在这个域名上');
 const plan=D.reminderPlan(assets,new Date(2026,10,1,8));
 assert.match(plan[0].body,/明天到期 · 3 个账号的登录邮箱在这个域名上/);
});

test('可丢 records send no reminders; the handover lists key ones first with their recovery and backup lines',()=>{
 const soon={type:'subscription',date:'2026-11-04',dateKind:'renew'};
 assert.equal(D.reminderPlan([{id:'x',name:'Toy',...soon,importance:'disposable'}],new Date(2026,10,1,8)).length,0);
 assert.equal(D.reminderPlan([{id:'x',name:'Toy',...soon,importance:'critical'}],new Date(2026,10,1,8)).length,1);
 const html=D.handoverHtml({assets:[{id:'1',type:'server',name:'toy-box'},{id:'2',type:'server',name:'main-db-box',importance:'critical',backup:'elsewhere',restoreTestedOn:'2026-05-01'},{id:'3',type:'server',name:'scratch',importance:'disposable'}]},{types:{server:'服务器'}});
 assert.ok(html.indexOf('main-db-box')<html.indexOf('toy-box')&&html.indexOf('toy-box')<html.indexOf('scratch'),'critical first, disposable last');
 assert.match(html,/<dt>重要程度<\/dt><dd>关键<\/dd>/);
 assert.match(html,/<dt>备份<\/dt><dd>另一家或本地 · 2026-05-01 试过恢复<\/dd>/);
});

test('a domain\'s DNS host: typed, checked, and filled in by an active Cloudflare zone; legacy contacts join the recovery line',()=>{
 assert.equal(D.validActionField('dnsHost','Cloudflare'),true);
 assert.equal(D.validActionField('dnsHost','<b>x</b>'),false);
 assert.deepEqual(D.ACTION_FIELDS.domain.map(([key])=>key),['dnsHost','icp']);
 const cf=D.mergeCloudflare({blocks:[],assets:[]},{queriedKinds:['zone'],resources:[{kind:'zone',id:'z1',name:'example.com',status:'active'},{kind:'zone',id:'z2',name:'example.org',status:'pending'}]});
 assert.deepEqual(cf.board.assets.map(a=>[a.name,a.dnsHost]),[['example.com','Cloudflare'],['example.org',undefined]]);
 assert.equal(D.recoveryText({type:'appleid',mfa:'key',legacy:'set'}),'两步验证：硬件密钥；遗产联系人：已设置');
 assert.equal(D.recoveryText({type:'google',legacy:'none'}),'闲置账号管理器：没设置');
 assert.equal(D.recoveryText({type:'ai',legacy:'set'}),'','only Apple and Google have one');
});
