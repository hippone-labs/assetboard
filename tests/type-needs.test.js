const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

// The per-type needs of 2026-10-23 (third research round): risks through accounts, stopped numbers, the
// clouds' auto-renew switch and locks, the price after a trial, and the 阿里云 / 腾讯云 timelines.
const at=day=>new Date(`${day}T10:00:00`);
const link=(assets,a,b)=>D.linkAssets(assets,a,b);

test('what signs in with an account hears about its card and its only number; the account names what logs in with it',()=>{
 const assets=[
  {id:'apple',type:'appleid',name:'美区 Apple ID',provider:'Apple'},
  {id:'card',type:'bankcard',name:'虚拟卡',last4:'4242',cardStatus:'closed'},
  {id:'num',type:'phone',name:'美国号',date:'2026-10-25',dateKind:'keep'},
  {id:'tv',type:'subscription',name:'Apple TV+'},
  {id:'chat',type:'ai',name:'ChatGPT Plus'}
 ];
 link(assets,'apple','card');link(assets,'apple','num');link(assets,'apple','tv');link(assets,'apple','chat');
 const tv=assets.find(a=>a.id==='tv'),risks=D.linkRisks(assets,tv,at('2026-10-20'));
 assert.deepEqual(risks.map(r=>[r.source.id,r.kind,r.via.id,r.level]),[['card','pay','apple','overdue'],['num','verify','apple','soon']]);
 assert.deepEqual(D.linkImpact(assets,assets[0]).map(a=>a.id).sort(),['chat','tv']);
 assert.equal(D.IMPACT_WORDS.appleid.verb,'登录');
 // With a second number the account is not lost with the first one, so the number is no longer passed on.
 assets.push({id:'num2',type:'phone',name:'香港号'});link(assets,'apple','num2');
 assert.deepEqual(D.linkRisks(assets,tv,at('2026-10-20')).map(r=>r.source.id),['card']);
 // A hidden account passes nothing on.
 assets[0].hiddenAt='2026-10-01T00:00:00Z';
 assert.deepEqual(D.linkRisks(assets,tv,at('2026-10-20')),[]);
});

test('a stopped number that still verifies accounts is trouble; a stopped number with nothing on it is not',()=>{
 const assets=[{id:'g',type:'google',name:'Google 主号'},{id:'p',type:'phone',name:'giffgaff',stopped:true}];
 assert.deepEqual(D.sourceTrouble(assets[1]),{level:'overdue',label:'已停用'});
 assert.equal(D.sourceTrouble({type:'phone',name:'x'}),null);
 assert.deepEqual(D.linkRisks(assets,assets[0]),[]);
 link(assets,'g','p');
 assert.deepEqual(D.linkRisks(assets,assets[0]).map(r=>[r.source.id,r.level,r.label]),[['p','overdue','已停用']]);
});

test('Cloudflare\'s registrar auto-renew switch is kept only when the row carries it',()=>{
 const cf=D.mergeCloudflare({blocks:[],assets:[]},{queriedKinds:['zone','registrar'],resources:[
  {kind:'registrar',id:'acc:example.com',name:'example.com',expiresAt:'2027-03-01',autoRenew:false},{kind:'zone',id:'z1',name:'example.org',status:'active'}]});
 assert.deepEqual(cf.board.assets.map(a=>[a.name,a.autoRenew]),[['example.com','off'],['example.org',undefined]]);
});

test('a trial reminder says what is charged after it, also on a day with several items; free ones do not',()=>{
 const trial={id:'t',type:'subscription',name:'Raycast Pro',date:'2026-11-04',dateKind:'trial',cost:'$8 / 月'};
 const plan=D.reminderPlan([trial],new Date(2026,10,1,8));
 assert.equal(plan[0].body,'3 天后试用结束，之后 $8 / 月');
 const busy=D.reminderPlan([trial,{id:'d',type:'domain',name:'example.com',date:'2026-11-02',dateKind:'expire'}],new Date(2026,10,1,8));
 assert.match(busy[0].body,/Raycast Pro 3 天后试用结束，之后 \$8 \/ 月/);
 assert.equal(D.reminderPlan([{...trial,cost:'免费'}],new Date(2026,10,1,8))[0].body,'3 天后试用结束 · 免费');
 assert.equal(D.reminderPlan([{...trial,dateKind:'renew',cycle:'monthly'}],new Date(2026,10,1,8))[0].body,'3 天后扣款 · $8 / 月');
});

test('阿里云 and 腾讯云 timelines: .cn and .hk run shorter than a gTLD, CVM waits two days, databases go fast',()=>{
 const dom=(name,provider)=>({type:'domain',name,provider,date:'2026-10-01',dateKind:'expire'});
 assert.equal(D.lifecycleRule(dom('example.cn','阿里云')).id,'aliyun-domain-cn');
 assert.equal(D.lifecycleRule(dom('example.中国','万网')).id,'aliyun-domain-cn');
 assert.equal(D.lifecycleRule(dom('example.hk','阿里云')).id,'aliyun-domain-hk');
 assert.equal(D.lifecycleRule(dom('example.com','阿里云')).id,'aliyun-domain');
 assert.equal(D.lifecycleRule(dom('example.io','阿里云')),null,'other country codes keep their own rules');
 assert.equal(D.lifecycleOf(dom('example.cn','DNSPod'),at('2026-11-12')).stage.label,'赎回期');
 assert.equal(D.lifecycleOf(dom('example.cn','腾讯云'),at('2026-11-16')).label,'已开放注册，任何人都能注册');
 assert.equal(D.lifecycleOf(dom('example.cn','阿里云'),at('2026-10-02')).label,'续费期 · 还剩 30 天');
 const cvm={type:'server',name:'web',provider:'腾讯云',date:'2026-10-01',dateKind:'expire'};
 assert.equal(D.lifecycleOf(cvm,at('2026-10-02')).stage.label,'即将停服');
 assert.equal(D.lifecycleOf(cvm,at('2026-10-10')).label,'在回收站 · 还剩 9 天');
 const db=provider=>({type:'database',name:'main',provider,date:'2026-10-01',dateKind:'expire'});
 assert.equal(D.lifecycleOf(db('阿里云'),at('2026-10-09')).stage.label,'已释放');
 assert.equal(D.lifecycleOf(db('腾讯云'),at('2026-10-05')).stage.label,'过期仍在运行');
 assert.equal(D.lifecycleOf(db('腾讯云'),at('2026-10-20')).gone,true);
});

test('an account does not hear about the cards of what signs in with it',()=>{
 const assets=[{id:'g',type:'google',name:'Google 主号'},{id:'ai',type:'ai',name:'Gemini'},{id:'c',type:'bankcard',name:'卡',cardStatus:'declined'}];
 D.linkAssets(assets,'g','ai');D.linkAssets(assets,'ai','c');
 assert.deepEqual(D.linkRisks(assets,assets[0]),[]);
 assert.deepEqual(D.linkRisks(assets,assets[1]).map(r=>r.source.id),['c']);
});

// The second batch of the same day: numbers cut off or ported, a card paying a number's fee, 阿里云's early auto-renew charge,
// prepaid API credit that runs out after a year, and filed domains.
test('a number cut off by its carrier or ported out is trouble for what it verifies; giffgaff gets its note',()=>{
 const assets=[{id:'g',type:'google',name:'Google 主号'},{id:'p',type:'phone',name:'英国号',provider:'giffgaff',phoneStatus:'suspended'}];
 link(assets,'g','p');
 assert.deepEqual(D.linkRisks(assets,assets[0]).map(r=>[r.source.id,r.level,r.label]),[['p','overdue','被运营商停用']]);
 assert.equal(D.phoneTrouble({type:'phone',phoneStatus:'ported'}).label,'已转出');
 assert.equal(D.phoneTrouble({type:'phone',phoneStatus:'odd'}),null);
 assert.match(D.carrierNote(assets[1]),/giffgaff 会停掉长期在境外使用的号码/);
 assert.equal(D.carrierNote({type:'phone',provider:'CMLink'}),'');
});

test('a card that pays a number\'s fee: the link means 支付, and its trouble reaches the accounts that only have that number',()=>{
 const assets=[{id:'c',type:'bankcard',name:'卡',last4:'4242',cardStatus:'declined'},{id:'p',type:'phone',name:'Ultra 号'},{id:'g',type:'google',name:'Google 主号'},{id:'ai',type:'ai',name:'Gemini'}];
 link(assets,'c','p');link(assets,'p','g');link(assets,'g','ai');
 assert.equal(D.linkKind(assets[0],assets[1]).kind,'verify');
 assert.equal(D.setCardPays(assets,'p','c',true),true);
 assert.deepEqual(D.linkKind(assets[0],assets[1]),{kind:'pay',label:'支付'});
 assert.deepEqual(D.linkKind(assets[1],assets[0]),{kind:'pay',label:'付款卡'});
 assert.deepEqual(D.linkImpact(assets,assets[0]).map(a=>a.id),['p']);
 assert.deepEqual(D.linkRisks(assets,assets[1]).map(r=>[r.source.id,r.kind]),[['c','pay']]);
 assert.deepEqual(D.linkRisks(assets,assets[2]).map(r=>[r.source.id,r.kind,r.via?.id]),[['c','pay','p']]);
 // With a second number the account does not hang on the first one's fee.
 assets.push({id:'p2',type:'phone',name:'香港号'});link(assets,'g','p2');
 assert.deepEqual(D.linkRisks(assets,assets[2]),[]);
 // Only a card and a number can carry it; unlinking drops it.
 assert.equal(D.setCardPays(assets,'g','c',true),false);
 D.unlinkAssets(assets,'c','p');assert.equal(assets[1].linkMeta,undefined);
});

test('prepaid API credit from OpenAI, Anthropic or OpenRouter expires a year after the newest purchase; plans and typed dates stay',()=>{
 const api={id:'a',type:'ai',name:'OpenAI API',provider:'OpenAI',cost:'$50'};
 D.recordPayment(api,{paidOn:'2026-03-01',amount:50,currency:'USD'});
 assert.deepEqual([api.date,api.dateKind,api.creditExpiry],['2027-03-01','expire',true]);
 D.recordPayment(api,{paidOn:'2026-08-15',amount:20,currency:'USD'});
 assert.equal(api.date,'2027-08-15');
 D.removePayment(api,api.payments[1].id);assert.equal(api.date,'2027-03-01');
 D.removePayment(api,api.payments[0].id);assert.equal(api.date,undefined);assert.equal(api.creditExpiry,undefined);
 const router={id:'r',type:'ai',name:'OpenRouter',provider:'OpenRouter'};D.recordPayment(router,{paidOn:'2026-01-10',amount:10,currency:'USD'});assert.equal(router.date,'2027-01-10');
 const plan={id:'p',type:'ai',name:'ChatGPT Plus',provider:'OpenAI'};D.recordPayment(plan,{paidOn:'2026-01-10',amount:20,currency:'USD'});assert.equal(plan.date,undefined);
 const monthly={id:'m',type:'ai',name:'Anthropic API',provider:'Anthropic',cost:'$20 / 月',cycle:'monthly'};assert.equal(D.creditRule(monthly),null);
 const typed={id:'t',type:'ai',name:'Anthropic API',provider:'Anthropic',date:'2026-12-01',dateKind:'expire'};D.recordPayment(typed,{paidOn:'2026-02-01',amount:5,currency:'USD'});assert.equal(typed.date,'2026-12-01');
});

test('a filed domain says to cancel the filing in the shutdown checklist; the ICP field takes only a filing number',()=>{
 assert.equal(D.validActionField('icp','京ICP备00000000号-1'),true);
 assert.equal(D.validActionField('icp','12345'),false);
 assert.equal(D.validActionField('icp','<b>ICP</b>'),false);
 const assets=[{id:'d',type:'domain',name:'example.cn',project:'旧站',icp:'京ICP备00000000号'},{id:'e',type:'domain',name:'example.org',project:'旧站'}];
 const steps=D.shutdownPlan(assets,'旧站').steps;
 assert.match(steps.find(s=>s.asset.id==='d').action,/^先注销备案，然后不再续费/);
 assert.doesNotMatch(steps.find(s=>s.asset.id==='e').action,/备案/);
});
