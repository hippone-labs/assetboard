const test=require('node:test');
const assert=require('node:assert/strict');
const {removeUntouchedDemo,orderAssets,moveAsset}=require('../asset-data.js');

const sample={id:'a1',type:'domain',name:'example-notes.studio',provider:'Cloudflare',account:'个人账号',purpose:'写作工具',event:'12 天后到期',date:'2026-10-06',cost:'¥ 89 / 年',warn:true,art:'note',url:'https://example.com',notes:'主站域名，记录每一个从想法到作品的瞬间。'};

test('keeps records that do not match a legacy demo fingerprint',()=>{
 // The legacy fingerprints are hashes of the original sample records, which are no longer kept in the repo.
 const edited={...sample,purpose:'我的项目'};
 const manual={id:'asset-1',type:'domain',name:'my.dev',source:'manual'};
 const blocks=[{id:'domain',width:55},{id:'repository',width:45}];
 const result=removeUntouchedDemo({blocks,assets:[sample,edited,manual]});
 assert.equal(result.removed,0);
 assert.deepEqual(result.board.assets,[sample,edited,manual]);
 assert.deepEqual(result.board.blocks,blocks);
});

test('leaves an already migrated board unchanged',()=>{
 const board={blocks:[],assets:[{id:'asset-1',type:'repository',name:'owner/repo',source:'github'}]};
 const result=removeUntouchedDemo(board);
 assert.equal(result.removed,0);
 assert.deepEqual(result.board,board);
});

test('removes the untouched sample layout and preserves a later custom block',()=>{
 const original=[['domain',60],['server',40],['subscription',40],['database',60]].map(([id,width])=>({id,width,collapsed:false,height:null}));
 const custom={id:'license',width:50,collapsed:false,height:null};
 const result=removeUntouchedDemo({blocks:[...original,custom],assets:[]});
 assert.equal(result.removedBlocks,4);
 assert.deepEqual(result.board.blocks,[custom]);
});

test('preserves a user card order and places newly synced cards afterward',()=>{
 const assets=[{id:'new'},{id:'first'},{id:'second'}];
 const ids=moveAsset(['first','second'],'second','first');
 assert.deepEqual(ids,['second','first']);
 assert.deepEqual(orderAssets(assets,ids).map(asset=>asset.id),['second','first','new']);
 assert.deepEqual(moveAsset(ids,'second','second'),ids);
});

const {assetDateStatus,upcomingEvents,nextOccurrence,dayNumber,addMonths,mergeCloudflare,mergeGitHub,applyCollision,evidenceFacts,buildCandidates,inferCycle,parseSender,registrableDomain}=require('../asset-data.js');
const now=new Date(2026,8,29,15,0);

test('describes upcoming, due and overdue dates in local calendar days',()=>{
 assert.equal(assetDateStatus({date:'2026-10-06'},now).label,'7 天后到期');
 assert.equal(assetDateStatus({date:'2026-10-06'},now).level,'soon');
 assert.equal(assetDateStatus({date:'2026-09-29',dateKind:'renew'},now).label,'今天扣款');
 assert.equal(assetDateStatus({date:'2026-09-30',dateKind:'trial'},now).label,'明天试用结束');
 assert.equal(assetDateStatus({date:'2026-09-26'},now).label,'已过期 3 天');
 assert.equal(assetDateStatus({date:'2026-09-26'},now).level,'overdue');
 assert.equal(assetDateStatus({date:'2027-03-01'},now).label,'2027-03-01 到期');
 assert.equal(assetDateStatus({date:'2027-03-01'},now).level,'upcoming');
 assert.equal(assetDateStatus({date:''},now).level,'none');
 assert.equal(assetDateStatus({date:'2026-02-30'},now).level,'none');
});

test('rolls recurring dates forward from their anchor',()=>{
 const monthly=assetDateStatus({date:'2026-01-31',dateKind:'renew',cycle:'monthly'},now);
 assert.equal(monthly.date,'2026-09-30');
 assert.equal(monthly.rolled,true);
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');
 assert.equal(nextOccurrence('2024-02-29','yearly',dayNumber('2026-09-29')),'2027-02-28');
 assert.equal(nextOccurrence('2025-10-15','yearly',dayNumber('2026-09-29')),'2026-10-15');
 assert.equal(nextOccurrence('2026-09-29','monthly',dayNumber('2026-09-29')),'2026-09-29');
});

test('lists visible dated assets soonest first, leaving out hidden and stopped ones',()=>{
 const assets=[{id:'late',name:'b',date:'2026-11-10'},{id:'hidden',name:'h',date:'2026-10-01',hiddenAt:'x'},{id:'stopped',name:'s',date:'2026-10-01',stopped:true},{id:'soon',name:'a',date:'2026-10-02'},{id:'none',name:'n'},{id:'past',name:'p',date:'2026-09-20'},{id:'far',name:'f',date:'2027-06-01'}];
 assert.deepEqual(upcomingEvents(assets,now).map(item=>item.asset.id),['past','soon','late']);
});

test('merges Cloudflare resources without touching local notes and reports name collisions',()=>{
 const board={blocks:[],assets:[
  {id:'cloudflare-zone-z1',type:'domain',name:'old.dev',source:'cloudflare',resourceKind:'zone',externalId:'z1',notes:'mine',url:'https://dash.example.org'},
  {id:'asset-1',type:'domain',name:'clash.dev',source:'manual'},
  {id:'moved',type:'domain',name:'moved.dev',source:'cloudflare',resourceKind:'zone',externalId:'z3'},
  {id:'cloudflare-r2-gone',type:'storage',name:'gone',source:'cloudflare',resourceKind:'r2',externalId:'gone'},
  {id:'cloudflare-zone-gone',type:'domain',name:'gone.dev',source:'cloudflare',resourceKind:'zone',externalId:'gone'}
 ],deletedExternalIds:['cloudflare:zone:z9']};
 const result=mergeCloudflare(board,{queriedKinds:['zone'],resources:[
  {id:'z1',name:'new.dev',account:'acct',status:'active'},{id:'z2',name:'clash.dev',status:'active'},
  {id:'z3',name:'moved.dev',status:'active'},{id:'z9',name:'deleted.dev'},{id:'p1',kind:'pages',name:'site',status:'ok'}]},'2026-09-29T00:00:00Z');
 const byId=id=>result.board.assets.find(asset=>asset.id===id);
 assert.equal(board.assets[0].name,'old.dev','input board must not be mutated');
 assert.equal(byId('cloudflare-zone-z1').name,'new.dev');
 assert.equal(byId('cloudflare-zone-z1').notes,'mine');
 assert.equal(byId('cloudflare-zone-z1').url,'https://dash.example.org');
 assert.equal(byId('moved').syncMissing,false,'a record matched by platform id is not missing');
 assert.equal(byId('cloudflare-zone-gone').syncMissing,true);
 assert.equal(byId('cloudflare-r2-gone').syncMissing,undefined,'kinds that were not queried stay untouched');
 assert.equal(byId('cloudflare-zone-z9'),undefined,'deleted records are not re-added');
 assert.equal(byId('cloudflare-pages-p1').type,'deployment');
 assert.equal(result.added,1);
 assert.deepEqual(result.collisions.map(item=>item.assetId),['asset-1']);
 assert.equal(byId('asset-1').source,'manual','collisions wait for confirmation');
 assert.deepEqual(result.board.blocks.map(block=>block.id),['domain','deployment']);
 assert.ok(applyCollision(result.board,result.collisions[0]));
 assert.equal(byId('asset-1').source,'cloudflare');
 assert.equal(byId('asset-1').syncMissing,false);
});

test('merges GitHub repositories and marks missing ones',()=>{
 const board={blocks:[],assets:[{id:'github-repo-1',type:'repository',name:'me/a',source:'github',externalId:'1',notes:'keep'},{id:'github-repo-2',type:'repository',name:'me/b',source:'github',externalId:'2'},{id:'asset-x',type:'repository',name:'me/c',source:'manual'}]};
 const result=mergeGitHub(board,{repositories:[{id:'1',name:'me/a',owner:'me',url:'https://github.com/me/a',private:true},{id:'3',name:'me/c',owner:'me',archived:true}]});
 const byId=id=>result.board.assets.find(asset=>asset.id===id);
 assert.equal(byId('github-repo-1').notes,'keep');
 assert.equal(byId('github-repo-1').event,'私有仓库');
 assert.equal(byId('github-repo-2').syncMissing,true);
 assert.equal(result.collisions[0].fields.event,'已归档');
 assert.deepEqual(result.board.blocks.map(block=>block.id),['repository']);
});

test('reads sender, merchant and registrable domain',()=>{
 assert.deepEqual(parseSender('"Figma" <Billing@Figma.com>'),{name:'Figma',address:'billing@figma.com',host:'figma.com'});
 assert.equal(parseSender('noreply@github.com').name,'');
 assert.equal(registrableDomain('mail.notify.cloudflare.com'),'cloudflare.com');
 assert.equal(registrableDomain('billing.example.com.cn'),'example.com.cn');
 assert.equal(evidenceFacts({id:'g',kind:'gmail',source:'Namecheap Support <support@namecheap.com>',title:'Hi',body:''}).merchant,'Namecheap');
 assert.equal(evidenceFacts({id:'g',kind:'gmail',source:'no-reply@vercel.com',title:'Hi',body:''}).merchant,'Vercel');
});

test('extracts a stated renewal, amount and cycle from an English notice',()=>{
 const [candidate]=buildCandidates([{id:'gmail-1',kind:'gmail',source:'Figma <billing@figma.com>',title:'Your Professional plan renews soon',body:'Your Figma Professional plan will renew on October 6, 2026.\nYou will be charged $15.00/month.\nTax: $1.20',payload:JSON.stringify({date:'Mon, 21 Sep 2026 10:00:00 +0000'})}],{now});
 assert.equal(candidate.merchant,'Figma');
 assert.equal(candidate.type,'subscription');
 assert.equal(candidate.cost,'$15.00 / 月');
 assert.deepEqual(candidate.date,{value:'2026-10-06',kind:'renew',source:'stated',basis:'通知中写明'});
 assert.equal(candidate.pending,true);
});

test('recognizes a Chinese domain expiry notice',()=>{
 const [candidate]=buildCandidates([{id:'gmail-2',kind:'gmail',source:'阿里云通知 <noreply@notice.aliyun.com>',title:'域名到期提醒',body:'尊敬的用户，您的域名 example-notes.cn 将于 2026年10月20日 到期，请及时续费。\n续费价格：¥ 89 / 年\n详情见 https://www.aliyun.com/renew',payload:{date:'2026-09-20'}}],{assets:[{id:'mine',type:'domain',name:'example-notes.cn'}],now});
 assert.equal(candidate.merchant,'阿里云');
 assert.equal(candidate.type,'domain');
 assert.equal(candidate.name,'example-notes.cn');
 assert.equal(candidate.cost,'¥89 / 年');
 assert.equal(candidate.cycle,'yearly');
 assert.equal(candidate.date.value,'2026-10-20');
 assert.equal(candidate.date.kind,'expire');
 assert.equal(candidate.match,'mine');
});

test('groups monthly receipts and infers the next charge from their spacing',()=>{
 const receipt=(id,date)=>({id,kind:'gmail',source:'Notion Team <team@makenotion.com>',title:'Your receipt',body:'Total $10.00\nThanks for your payment.',payload:{date}});
 const candidates=buildCandidates([receipt('r1','2026-07-03'),receipt('r2','2026-08-03'),receipt('r3','2026-09-03'),{id:'other',kind:'gmail',source:'Acme <receipts+acct_1@stripe.com>',title:'Your receipt from Acme #1',body:'Amount paid ¥20'},{id:'other2',kind:'gmail',source:'Beta Co <receipts+acct_2@stripe.com>',title:'Your receipt from Beta Co #2',body:'Amount paid ¥30'}],{now,decisions:{other2:{status:'dismissed'}}});
 const notion=candidates.find(item=>item.key==='makenotion.com');
 assert.equal(notion.count,3);
 assert.equal(notion.merchant,'Notion');
 assert.equal(notion.cycle,'monthly');
 assert.equal(notion.cost,'$10.00 / 月');
 assert.equal(notion.date.value,'2026-10-03');
 assert.equal(notion.date.source,'inferred');
 assert.match(notion.date.basis,/3 封收据/);
 assert.equal(candidates.filter(item=>item.key.startsWith('stripe.com:')).length,2,'payment processor receipts stay separate per merchant');
 assert.equal(candidates.at(-1).key,'stripe.com:beta co');
 assert.equal(candidates.at(-1).pending,false);
 assert.equal(inferCycle([1,366,731]),'yearly');
 assert.equal(inferCycle([1,3]),null);
});

test('keeps pasted text without a date as a weak candidate',()=>{
 const [candidate]=buildCandidates([{id:'paste',kind:'paste',title:'粘贴的文字',body:'感谢订阅，我们会不定期发送更新。',importedAt:'2026-09-29T08:00:00Z'}],{now});
 assert.equal(candidate.weak,true);
 assert.equal(candidate.date,null);
});

const {parseAiItems,applyAiItem}=require('../asset-data.js');
const types=['domain','server','subscription','database','license','repository','deployment','storage'];

test('keeps only well-formed fields from a model reply',()=>{
 const reply='Here you go:\n```json\n{"items":[{"name":"  example.dev ","merchant":"Namecheap","type":"domain","amount":"1,299.00","currency":"rmb","cycle":"yearly","date":"2026-10-20","dateKind":"expire","paidDate":"null","account":null,"quote":"expires on Oct 20"},{"name":"x","type":"spaceship","amount":"free","currency":"dollars","cycle":"weekly","date":"2026-02-30","dateKind":"soon"},{"merchant":""},"junk"]}\n```';
 const items=parseAiItems(reply,types);
 assert.equal(items.length,2);
 assert.deepEqual(items[0],{name:'example.dev',merchant:'Namecheap',type:'domain',amount:'1299.00',currency:'CNY',cycle:'yearly',date:'2026-10-20',dateKind:'expire',paidDate:null,account:'',quote:'expires on Oct 20'});
 assert.deepEqual(items[1],{name:'x',merchant:'',type:null,amount:'',currency:'',cycle:null,date:null,dateKind:null,paidDate:null,account:'',quote:''});
 assert.deepEqual(parseAiItems('{"items":[]}',types),[]);
 assert.equal(parseAiItems('I cannot help with that.',types),null);
 assert.deepEqual(parseAiItems('[{"name":"Figma"}]',types).map(item=>item.name),['Figma']);
});

test('prefers an AI reading over rules and keeps rule inference it cannot see',()=>{
 const receipt=(id,date,ai)=>({id,kind:'gmail',source:'Apple <no_reply@email.apple.com>',title:'Your receipt from Apple.',body:'Total ¥68.00',payload:{date,...(ai?{ai:{provider:'anthropic',model:'m',at:'t',text:ai}}:{})}});
 const single=buildCandidates([receipt('a1','2026-07-10'),receipt('a2','2026-08-10'),receipt('a3','2026-09-10','{"items":[{"name":"iCloud+ 200GB","merchant":"Apple","type":"storage","amount":"21","currency":"CNY","cycle":"monthly","paidDate":"2026-09-10"}]}')],{now,types})[0];
 assert.equal(single.name,'iCloud+ 200GB');
 assert.equal(single.type,'storage');
 assert.equal(single.cost,'¥21 / 月');
 assert.deepEqual([single.date.value,single.date.source],['2026-10-10','ai']);
 assert.equal(single.ai.rowId,'a3');
 assert.equal(single.base.cost,'¥68.00 / 月','the rule reading stays available');
 const multi=buildCandidates([receipt('b1','2026-09-01','{"items":[{"name":"Notes Pro","merchant":"Acme","amount":"12","currency":"USD","cycle":"yearly","date":"2027-09-01","dateKind":"renew"},{"name":"Photo Lab","merchant":"Beta"}]}')],{now,types})[0];
 assert.equal(multi.name,'Notes Pro');
 const second=applyAiItem(multi.base,multi.ai.items[1],{now,fallback:false});
 assert.equal(second.name,'Photo Lab');
 assert.equal(second.date,null,'a second item does not borrow the first item\'s date');
 assert.equal(second.cost,'');
 const empty=buildCandidates([{id:'n',kind:'gmail',source:'News <hi@letters.io>',title:'Weekly',body:'Total $5',payload:{ai:{text:'{"items":[]}'}}}],{now,types})[0];
 assert.equal(empty.weak,true);
 const unreadable=buildCandidates([{id:'u',kind:'gmail',source:'Figma <billing@figma.com>',title:'Receipt',body:'Total $15.00',payload:{ai:{text:'sorry'}}}],{now,types})[0];
 assert.equal(unreadable.ai.unreadable,true);
 assert.equal(unreadable.cost,'$15.00','an unreadable reply keeps the rule reading');
});

test('rolls a past AI date forward only when it repeats',()=>{
 const base=buildCandidates([{id:'p',kind:'paste',title:'t',body:'',importedAt:'2026-09-29T00:00:00Z'}],{now})[0];
 assert.equal(applyAiItem(base,{name:'Figma',date:'2026-01-15',dateKind:'renew',cycle:'monthly'},{now}).date.value,'2026-10-15');
 assert.equal(applyAiItem(base,{name:'old.dev',date:'2026-01-15',dateKind:'expire'},{now}).date.value,'2026-01-15');
});

test('suggests an existing asset by its own name, not by a shared merchant',()=>{
 const {matchAsset}=require('../asset-data.js');
 const assets=[{id:'music',name:'Apple Music',provider:'Apple'},{id:'figma',name:'Figma Professional',provider:'Figma'},{id:'site',name:'example.dev',provider:'Registrar'}];
 assert.equal(matchAsset(assets,{name:'iCloud+ 200GB',merchant:'Apple',domains:[]}),null);
 assert.equal(matchAsset(assets,{name:'Apple Music',merchant:'Apple',domains:[]}),'music');
 assert.equal(matchAsset(assets,{name:'Figma',merchant:'Figma',domains:[]}),'figma');
 assert.equal(matchAsset(assets,{name:'example.dev',merchant:'Namecheap',domains:['example.dev']}),'site');
});

const {regionFlag,regionName,regionFromPhone,maskPhone,maskEmail,cardExpiry,expiryText,looksLikeCardNumber,linkAssets,unlinkAssets,linkedAssets,removeLinksTo,assetDateStatus:dateStatus,guessAssetType}=require('../asset-data.js');

test('shows regions as flags and names, and infers them from calling codes',()=>{
 assert.equal(regionFlag('US'),'🇺🇸');
 assert.equal(regionFlag('us'),'');
 assert.equal(regionName('HK'),'中国香港');
 assert.equal(regionFromPhone('+44 7700 900123'),'GB');
 assert.equal(regionFromPhone('00852 6123 4567'),'HK');
 assert.equal(regionFromPhone('+353 85 123 4567'),'IE');
 assert.equal(regionFromPhone('13800138000'),'');
});

test('masks phone numbers and emails but keeps enough to recognise them',()=>{
 assert.equal(maskPhone('+44 7700 900123'),'+44 ••• 0123');
 assert.equal(maskPhone('+1 (415) 555-2671'),'+1 ••• 2671');
 assert.equal(maskPhone('138 0013 8000'),'••• 8000');
 assert.equal(maskPhone(''),'');
 assert.equal(maskEmail('han.dev@example.org'),'ha•••@example.org');
 assert.equal(maskEmail('a@example.org'),'a•••@example.org');
 assert.equal(maskEmail('not an email'),'not an email');
});

test('stores card expiry as the last day of the month and dates it',()=>{
 assert.equal(cardExpiry('08/28'),'2028-08-31');
 assert.equal(cardExpiry('2/2028'),'2028-02-29');
 assert.equal(cardExpiry('13/28'),null);
 assert.equal(expiryText('2028-08-31'),'08/28');
 assert.equal(dateStatus({date:'2026-10-31',dateKind:'expire'},new Date(2026,9,1)).label,'30 天后到期');
 assert.equal(dateStatus({date:'2026-10-05',dateKind:'keep',cycle:'halfyearly'},new Date(2026,9,1)).label,'4 天后保号到期');
 assert.equal(dateStatus({date:'2026-04-05',dateKind:'keep',cycle:'halfyearly'},new Date(2026,9,1)).date,'2026-10-05');
});

test('recognises full card numbers so they are never stored',()=>{
 assert.equal(looksLikeCardNumber('卡号 4111 1111 1111 1111'),true);
 assert.equal(looksLikeCardNumber('5555-5555-5555-4444'),true);
 assert.equal(looksLikeCardNumber('378282246310005'),true);
 assert.equal(looksLikeCardNumber('4111 1111 1111 1112'),false);
 assert.equal(looksLikeCardNumber('尾号 1111'),false);
 assert.equal(looksLikeCardNumber('+86 138 0013 8000'),false);
});

test('links records both ways and cleans up after a delete',()=>{
 const assets=[{id:'apple',type:'appleid'},{id:'card',type:'bankcard'},{id:'phone',type:'phone',links:['apple']}];
 assert.equal(linkAssets(assets,'apple','card'),true);
 assert.equal(linkAssets(assets,'card','apple'),false);
 assert.equal(linkAssets(assets,'apple','apple'),false);
 assert.deepEqual(linkedAssets(assets,assets[0]).map(asset=>asset.id),['card','phone']);
 assert.equal(unlinkAssets(assets,'card','apple'),true);
 assert.deepEqual(assets[0].links,[]);
 removeLinksTo(assets,'apple');
 assert.deepEqual(assets[2].links,[]);
});

test('files AI services under AI subscriptions',()=>{
 assert.equal(guessAssetType('Your ChatGPT Plus subscription renews',[]),'ai');
 assert.equal(guessAssetType('Receipt from Anthropic, PBC',[]),'ai');
 assert.equal(guessAssetType('Your Figma plan renews',[]),'subscription');
});

const {iconHost}=require('../asset-data.js');

test('suggests the website to fetch an icon from',()=>{
 assert.equal(iconHost({type:'bankcard',provider:'Wise',url:'https://www.wise.com/account'}),'wise.com');
 assert.equal(iconHost({type:'appleid',provider:'Apple'}),'apple.com');
 assert.equal(iconHost({type:'google',provider:'Google',url:'https://example.com'}),'google.com');
 assert.equal(iconHost({type:'ai',provider:'ChatGPT',name:'ChatGPT Plus'}),'chatgpt.com');
 assert.equal(iconHost({type:'bankcard',provider:'汇丰香港'}),'hsbc.com.hk');
 assert.equal(iconHost({type:'phone',provider:'某运营商'}),'');
});

const {iconVendor,iconVendors,vendorForHost,iconPlan}=require('../asset-data.js');

test('maps providers, sync sources and management links to vendor homepages',()=>{
 const host=asset=>iconVendor(asset)?.host||'';
 const cases=[['Cloudflare','cloudflare.com'],['Namecheap','namecheap.com'],['GoDaddy','godaddy.com'],['Porkbun','porkbun.com'],['Gandi','gandi.net'],['Dynadot','dynadot.com'],['Google Domains','squarespace.com'],['Squarespace','squarespace.com'],['阿里云','aliyun.com'],['万网','aliyun.com'],['Alibaba Cloud','aliyun.com'],['腾讯云','cloud.tencent.com'],['DNSPod','dnspod.cn'],['西部数码','west.cn'],['新网','xinnet.com'],
  ['华为云','huaweicloud.com'],['百度智能云','cloud.baidu.com'],['AWS Lightsail','aws.amazon.com'],['Google Cloud','cloud.google.com'],['Azure','azure.microsoft.com'],['DigitalOcean','digitalocean.com'],['Vultr','vultr.com'],['Linode','linode.com'],['Akamai','linode.com'],['Hetzner','hetzner.com'],['OVHcloud','ovhcloud.com'],['Scaleway','scaleway.com'],['Fly.io','fly.io'],['Render','render.com'],['Railway','railway.com'],['Vercel','vercel.com'],['Netlify','netlify.com'],['搬瓦工','bandwagonhost.com'],['RackNerd','racknerd.com'],
  ['GitHub','github.com'],['GitLab','gitlab.com'],['Gitee','gitee.com'],['Bitbucket','bitbucket.org'],['Cloudflare Pages','cloudflare.com'],['Cloudflare R2','cloudflare.com'],['Supabase','supabase.com'],['Backblaze B2','backblaze.com'],['Apple','apple.com'],['iCloud+','apple.com'],['Google One','google.com'],['Microsoft 365','microsoft.com'],['Adobe','adobe.com'],['JetBrains','jetbrains.com']];
 for(const [provider,expected] of cases)assert.equal(host({type:'server',name:'my-box',provider}),expected,provider);
 assert.equal(host({type:'deployment',name:'my-site',source:'cloudflare'}),'cloudflare.com');
 assert.equal(host({type:'repository',name:'me/notion-clone',source:'github'}),'github.com');
 assert.equal(host({type:'domain',name:'example.org',url:'https://dash.cloudflare.com/abc/example.org'}),'cloudflare.com');
 assert.equal(host({type:'server',name:'box',provider:'渲染农场'}),'');
 for(const v of iconVendors){assert.match(v.host,/^[a-z0-9.-]+\.[a-z]{2,}$/,v.host);assert.ok(v.label);}
 assert.equal(new Set(iconVendors.map(v=>v.host)).size,iconVendors.length,'One entry per vendor host');
 assert.equal(vendorForHost('www.vultr.com')?.host,'vultr.com');
 assert.equal(vendorForHost('my-vultr.com'),null,'A look-alike host is not the vendor');
});

test('never derives an icon host from the person own domain, repository or server names',()=>{
 for(const type of ['domain','server','database','repository','deployment','storage']){
  assert.equal(iconHost({type,name:'notion-figma-github.dev',url:'https://notion-figma-github.dev'}),'',type);
  assert.equal(iconVendor({type,name:'cloudflare-notes.com'}),null,type);
 }
 assert.equal(iconHost({type:'subscription',name:'Figma Professional'}),'figma.com','Service-named types may use their name');
 assert.equal(iconHost({type:'domain',name:'example.org',provider:'Porkbun',url:'https://example.org'}),'porkbun.com');
});

test('plans one request per vendor and skips custom, existing and hidden icons',()=>{
 const png='data:image/png;base64,AAAA';
 const assets=[{id:'a',type:'domain',name:'one.dev',provider:'Cloudflare'},{id:'b',type:'deployment',name:'site',source:'cloudflare'},{id:'c',type:'server',name:'box',provider:'Vultr'},
  {id:'d',type:'server',name:'box2',provider:'Vultr',siteIcon:png,siteIconHost:'vultr.com'},{id:'e',type:'server',name:'box3',provider:'Hetzner',iconData:png},
  {id:'f',type:'server',name:'box4',provider:'Hetzner',hiddenAt:'2026-10-01'},{id:'g',type:'domain',name:'mine.org',provider:'某注册商'}];
 const plan=iconPlan(assets);
 assert.deepEqual(plan.hosts.map(h=>[h.host,h.ids]),[['cloudflare.com',['a','b']],['vultr.com',['c']]]);
 assert.deepEqual(plan.skipped,{custom:1,existing:1,unknown:1,hidden:1});
 assert.deepEqual(iconPlan(assets,{overwrite:true}).hosts.find(h=>h.host==='vultr.com').ids,['c','d']);
 const listed=JSON.stringify(plan.hosts);for(const name of ['one.dev','mine.org','box','site'])assert.ok(!listed.includes(`"${name}"`),'The plan never carries asset names');
});

const {iconSiteHost,iconSiteFor,iconPlatformOf,iconRows}=require('../asset-data.js');

test('checks a named icon site like IconFetcher.host(from:) does',()=>{
 assert.equal(iconSiteHost(' Wise.com '),'wise.com');
 assert.equal(iconSiteHost('https://www.hsbc.com.hk/zh-hk/'),'www.hsbc.com.hk');
 assert.equal(iconSiteHost('http://brand.example.com:8443/x?y'),'brand.example.com');
 for(const refused of ['','   ','192.168.1.1','localhost','printer.local','https://user:pw@wise.com','[::1]','wise','file:///etc','-bad-.com','ftp://files.example.com','a..com','x'.repeat(301)+'.com'])assert.equal(iconSiteHost(refused),'',refused);
});

test('fetches a platform from its named site and maps that site back to the platform',()=>{
 const sites={'hetzner.com':'hetzner.example.com','vultr.com':'not a host'};
 assert.equal(iconSiteFor(sites,'hetzner.com'),'hetzner.example.com');
 assert.equal(iconSiteFor(sites,'vultr.com'),'vultr.com','An unusable stored site falls back to the platform');
 assert.equal(iconSiteFor({},'github.com'),'github.com');
 assert.equal(iconSiteFor(sites,'toString'),'toString','Only own keys count');
 assert.equal(iconPlatformOf(sites,'hetzner.example.com'),'hetzner.com');
 assert.equal(iconPlatformOf(sites,'www.vultr.com'),'vultr.com');
 assert.equal(iconPlatformOf(sites,'tool.example'),'tool.example');
 assert.equal(iconPlatformOf(sites,''),'');
});

test('lists every platform with the icon its assets show, never their names',()=>{
 const a='data:image/png;base64,AAAA',b='data:image/png;base64,BBBB';
 const assets=[{id:'v1',type:'server',name:'box-one',provider:'Vultr',siteIcon:a,siteIconHost:'vultr.com'},{id:'v2',type:'server',name:'box-two',provider:'Vultr'},{id:'v3',type:'server',name:'box-three',provider:'Vultr',siteIcon:b},{id:'v4',type:'server',name:'box-four',provider:'Vultr',siteIcon:a},
  {id:'h1',type:'server',name:'h-box',provider:'Hetzner'},{id:'c1',type:'server',name:'own-art-box',provider:'Hetzner',iconData:a},{id:'x1',type:'server',name:'gone',provider:'Hetzner',hiddenAt:'2026-10-01'},{id:'u1',type:'domain',name:'mine.org',provider:'某注册商'}];
 const rows=iconRows(assets,{sites:{'hetzner.com':'hetzner.example.com'}});
 assert.deepEqual(rows.map(r=>[r.host,r.site,r.custom,r.ids,r.have,r.icon]),[['vultr.com','vultr.com',false,['v1','v2','v3','v4'],['v1','v3','v4'],a],['hetzner.com','hetzner.example.com',true,['h1'],[],'']]);
 const listed=JSON.stringify(rows);for(const name of ['box-one','h-box','own-art-box','gone','mine.org'])assert.ok(!listed.includes(`"${name}"`),name);
 assert.deepEqual(iconRows([]),[]);
});

const {ensureBlock:addBlockFor}=require('../asset-data.js');

test('adds a category block once',()=>{
 const board={blocks:[]};
 addBlockFor(board,'bankcard');
 assert.deepEqual(board.blocks,[{id:'bankcard',folded:false}]);
});

test('counts read 99+ beyond the display limit',()=>{
 const {formatCount,DISPLAY_LIMITS}=require('../asset-data.js');
 assert.equal(formatCount(7),'7');assert.equal(formatCount(99),'99');assert.equal(formatCount(100),'99+');assert.equal(formatCount('x'),'0');
 assert.deepEqual(DISPLAY_LIMITS,{count:99});
});

test('display order: manual order first, then most recently updated, never by urgency',()=>{
 const {arrangeAssets,recentFirst,touchedPrefix,bringToFront,recencyTime}=require('../asset-data.js');
 const assets=[
  {id:'old',name:'old'},
  {id:'created',name:'created',createdAt:'2026-10-01T00:00:00Z'},
  {id:'edited',name:'edited',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'},
  {id:'older',name:'older'},
  {id:'urgent',name:'urgent',date:'2026-10-10',createdAt:'2026-02-01T00:00:00Z'}
 ];
 assert.equal(recencyTime(assets[0]),0);
 assert.deepEqual(recentFirst(assets).map(a=>a.id),['edited','created','urgent','old','older']);
 assert.deepEqual(arrangeAssets(assets,[]).map(a=>a.id),['edited','created','urgent','old','older']);
 assert.deepEqual(arrangeAssets(assets,['older','gone']).map(a=>a.id),['older','edited','created','urgent','old']);
 assert.deepEqual(arrangeAssets(assets,undefined).map(a=>a.id),['edited','created','urgent','old','older'],'old saves without cardOrder still work');
 assert.deepEqual(touchedPrefix(['a','b','c','d'],['b','a','c','d']),['b','a']);
 assert.deepEqual(touchedPrefix(['a','b'],['a','b']),[]);
 assert.deepEqual(bringToFront(['a','b','c'],'c'),['c','a','b']);
 assert.deepEqual(bringToFront(undefined,'c'),['c']);
});

test('category quick actions are open/copy only, local folders only in the app',()=>{
 const {quickActions,validActionField,sshCommand,cloneUrl,QUICK_LIMIT}=require('../asset-data.js');
 assert.equal(QUICK_LIMIT,2);
 assert.deepEqual(quickActions({type:'server',host:'203.0.113.10',sshUser:'deploy',sshPort:'2222'},{link:'https://console.example.org'}).map(q=>q.id),['copy-ssh','open','copy-ip']);
 assert.equal(sshCommand({host:'203.0.113.10',sshUser:'deploy',sshPort:'22'}),'ssh deploy@203.0.113.10');
 assert.equal(sshCommand({host:'bad host'}),'');
 assert.equal(cloneUrl('https://github.com/demo-org/site'),'https://github.com/demo-org/site.git');
 assert.equal(cloneUrl('https://github.com/demo-org/site/tree/main'),'');
 assert.equal(cloneUrl('http://github.com/demo-org/site'),'');
 const repo={type:'repository',localPath:'~/code/site'};
 assert.ok(!quickActions(repo,{link:''}).some(q=>q.kind==='local'),'browser never offers local folders');
 assert.equal(quickActions(repo,{native:true})[0].value,'~/code/site');
 assert.deepEqual(quickActions({type:'domain',name:'example.test'},{}).map(q=>q.id),['copy-name']);
 assert.deepEqual(quickActions({type:'domain',name:'example.test',hiddenAt:'2026-01-01'},{link:'https://x.test'}),[]);
 assert.deepEqual(quickActions({type:'bankcard',name:'card',last4:'1234'},{}),[]);
 for(const [key,value] of [['localPath','relative'],['localPath','/a/../b'],['sshPort','70000'],['sshUser','root;rm'],['host','a b']])assert.equal(validActionField(key,value),false,key+'='+value);
 for(const [key,value] of [['localPath','/home/dev/code'],['localPath',''],['sshPort','22'],['host','example.org'],['host','2001:db8::1']])assert.equal(validActionField(key,value),true,key+'='+value);
});

const {
  IMPORT_ROW_LIMIT,parseDelimitedText,rowsToImportItems,classifyImportPayload,planImport,applyImport,
  parseBoardBackup,planBoardBackup,applyBoardBackup,demoImportSampleCsv,csvSyncKey,isBlacklisted,
  parseSshConfig,mergeSshConfig,parseEml,cloudflareTokenTemplateUrl
}=require('../asset-data.js');

test('parses CSV with header aliases and drops secret columns',()=>{
 const parsed=parseDelimitedText('Domain Name,Registrar,Expires,Password\nexample.com,Namecheap,2027-03-01,s3cret\n');
 assert.equal(parsed.ok,true);
 assert.deepEqual(parsed.droppedSecrets,['Password']);
 assert.equal(parsed.preset?.id,'namecheap');
 const {items,unreadable}=rowsToImportItems(parsed);
 assert.equal(unreadable.length,0);
 assert.equal(items.length,1);
 assert.equal(items[0].name,'example.com');
 assert.equal(items[0].type,'domain');
 assert.equal(items[0].provider,'Namecheap');
 assert.equal(items[0].date,'2027-03-01');
 assert.ok(!JSON.stringify(items).includes('s3cret'));
});

test('classifies pasted table, json backup, image and plain text',()=>{
 assert.equal(classifyImportPayload({text:demoImportSampleCsv()}).kind,'csv');
 assert.equal(classifyImportPayload({text:JSON.stringify({blocks:[],assets:[]}),filename:'backup.json'}).kind,'json');
 // The agent format is recognised by content, whether it comes as a .json file or as pasted text.
 const agent=JSON.stringify({assetboard:1,items:[{name:'a.dev'}]});
 assert.equal(classifyImportPayload({text:agent,filename:'from-agent.json'}).kind,'agent');
 assert.equal(classifyImportPayload({text:agent}).kind,'agent');
 assert.equal(classifyImportPayload({text:'{"assetboard":1}',filename:'x.json'}).kind,'json');
 assert.equal(classifyImportPayload({text:'not json',filename:'x.json'}).kind,'json');
 assert.equal(classifyImportPayload({filename:'receipt.png',mime:'image/png'}).kind,'image');
 assert.equal(classifyImportPayload({text:'Your plan renews on October 6, 2026 for $15.00/month'}).kind,'paste');
});

test('planImport skips same-name by default, respects blacklist, and applyImport restores',()=>{
 const board={blocks:[{id:'domain',width:50}],assets:[{id:'a1',type:'domain',name:'example.com',source:'manual'}],deletedExternalIds:[csvSyncKey('domain','gone.com')]};
 const items=rowsToImportItems(parseDelimitedText('名称,类别\nexample.com,域名\nfresh.dev,域名\ngone.com,域名\n')).items;
 const plan=planImport(board,items,{sameName:'skip'});
 assert.equal(plan.added.length,1);
 assert.equal(plan.added[0].item.name,'fresh.dev');
 assert.equal(plan.skippedSame.length,1);
 assert.equal(plan.skippedDeleted.length,1);
 assert.equal(plan.conflicts,true);
 const next=applyImport(board,plan,{restoreKeys:[plan.skippedDeleted[0].key]});
 assert.equal(next.assets.some(a=>a.name==='fresh.dev'),true);
 assert.equal(next.assets.some(a=>a.name==='gone.com'&&a.source==='csv'),true);
 assert.equal(isBlacklisted(next,plan.skippedDeleted[0].key),false);
 assert.equal(next.assets.filter(a=>a.name==='example.com').length,1);
});

test('enforces the 100-row import limit',()=>{
 const lines=['名称,类别',...Array.from({length:IMPORT_ROW_LIMIT+5},(_,i)=>`site-${i}.com,域名`)];
 const parsed=parseDelimitedText(lines.join('\n'));
 assert.equal(parsed.ok,true);
 assert.equal(parsed.truncated,true);
 assert.equal(parsed.rows.length,IMPORT_ROW_LIMIT);
 assert.equal(parsed.totalRows,IMPORT_ROW_LIMIT+5);
});

test('merges a JSON backup by id and can replace',()=>{
 const current={blocks:[{id:'domain',width:50}],assets:[{id:'keep',type:'domain',name:'old.com',source:'manual',notes:'local'}],deletedExternalIds:[]};
 const backup=parseBoardBackup(JSON.stringify({blocks:[{id:'domain',width:50},{id:'server',width:50}],assets:[{id:'keep',type:'domain',name:'new.com',source:'manual',notes:'from backup'},{id:'extra',type:'server',name:'box',source:'manual'}]}));
 const mergePlan=planBoardBackup(current,backup,{mode:'merge'});
 assert.equal(mergePlan.added.length,1);
 assert.equal(mergePlan.updated.length,1);
 assert.equal(mergePlan.conflicts,false);
 const merged=applyBoardBackup(current,mergePlan);
 assert.equal(merged.assets.find(a=>a.id==='keep').name,'new.com');
 assert.equal(merged.assets.find(a=>a.id==='keep').notes,'from backup');
 assert.ok(merged.assets.some(a=>a.id==='extra'));
 const replacePlan=planBoardBackup(current,backup,{mode:'replace'});
 assert.equal(replacePlan.conflicts,true);
 const replaced=applyBoardBackup(current,replacePlan);
 assert.equal(replaced.assets.length,2);
 assert.ok(replaced.blocks.some(b=>b.id==='server'));
});


test('parses ssh config hosts and skips globs',()=>{
 const hosts=parseSshConfig(`Host github.com\n  HostName github.com\nHost box-tokyo\n  HostName 203.0.113.10\n  User deploy\n  Port 2222\nHost *.internal\n  User skip\n`);
 assert.equal(hosts.length,2);
 assert.equal(hosts.find(h=>h.name==='box-tokyo').host,'203.0.113.10');
 assert.equal(hosts.find(h=>h.name==='box-tokyo').sshPort,'2222');
 const board={blocks:[],assets:[],deletedExternalIds:[]};
 const merge=mergeSshConfig(board,hosts);
 assert.equal(merge.added,2);
 assert.ok(merge.board.assets.every(a=>a.source==='ssh'&&a.type==='server'));
});

test('parses a simple eml into subject and body',()=>{
 const raw=['From: billing@example-vps.test','To: me@example.com','Subject: Your invoice for October','MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','','Amount due: $6.00','Next billing date: 2026-11-04'].join('\r\n');
 const parsed=parseEml(raw);
 assert.equal(parsed.ok,true);
 assert.equal(parsed.subject,'Your invoice for October');
 assert.match(parsed.body,/Amount due/);
 assert.equal(classifyImportPayload({filename:'note.eml',text:raw}).kind,'eml');
});

test('cloudflare token template URL prefills read permissions',()=>{
 const url=cloudflareTokenTemplateUrl({name:'Assetboard'});
 assert.match(url,/dash\.cloudflare\.com\/profile\/api-tokens/);
 assert.match(url,/permissionGroupKeys=/);
 const decoded=decodeURIComponent(url.split('permissionGroupKeys=')[1].split('&')[0]);
 const keys=JSON.parse(decoded).map(p=>p.key);
 for(const need of ['zone','account_settings','page','workers_scripts','workers_r2'])assert.ok(keys.includes(need),need);
});

test('mergeCloudflare applies registrar expiry onto matching domain',()=>{
 const board={blocks:[],assets:[],deletedExternalIds:[]};
 const first=mergeCloudflare(board,{resources:[{kind:'zone',id:'abc',name:'studio.com',account:'Personal',status:'active',url:'https://dash.cloudflare.com/'}],queriedKinds:['zone']});
 const second=mergeCloudflare(first.board,{resources:[{kind:'registrar',id:'acct:studio.com',name:'studio.com',account:'Personal',status:'active',expiresAt:'2027-05-18T00:00:00Z',autoRenew:'1',url:'https://dash.cloudflare.com/'}],queriedKinds:['registrar']});
 const asset=second.board.assets.find(a=>a.name==='studio.com');
 assert.equal(asset.date,'2027-05-18');
 assert.equal(asset.cycle,'yearly');
 assert.equal(asset.account,'Personal');
});

test('server addresses: literals only, normalised, capped, masked',()=>{
 const {normalizeIp,parseIps,assetIps,primaryIp,maskIp,validIpList,validActionField,quickActions,IP_LIMIT}=require('../asset-data.js');
 assert.equal(IP_LIMIT,4);
 assert.deepEqual(normalizeIp('203.0.113.10'),{ip:'203.0.113.10',version:4,inner:false});
 assert.equal(normalizeIp('2001:DB8:0:0:0:0:0:10').ip,'2001:db8::10');
 assert.equal(normalizeIp('[2001:db8::1]').ip,'2001:db8::1');
 assert.equal(normalizeIp('2001:db8:0:0:1:0:0:1').ip,'2001:db8::1:0:0:1','the longest zero run is the one compressed');
 for(const text of ['10.0.0.5','172.16.0.1','192.168.1.20','100.64.0.9','fd00::1'])assert.equal(normalizeIp(text).inner,true,text);
 for(const text of ['198.51.100.88','203.0.113.10','2001:db8::1'])assert.equal(normalizeIp(text).inner,false,text);
 for(const text of ['','127.0.0.1','0.0.0.0','::1','::','fe80::1','224.0.0.1','169.254.1.1','256.1.1.1','203.0.113.04','203.0.113','example.org','2001:db8::1::2','::ffff:203.0.113.4','203.0.113.4/24'])assert.equal(normalizeIp(text),null,'refused: '+text);
 const parsed=parseIps('203.0.113.10, 2001:db8::10;203.0.113.10 10.0.0.1 192.168.1.2 198.51.100.88 bad');
 assert.deepEqual(parsed.ips.map(x=>x.ip),['203.0.113.10','2001:db8::10','10.0.0.1','192.168.1.2'],'duplicates collapse, four at most');
 assert.deepEqual(parsed.invalid,['bad']);assert.equal(parsed.tooMany,true);
 assert.equal(validIpList('203.0.113.10 2001:db8::10'),true);assert.equal(validIpList('203.0.113.10 nope'),false);assert.equal(validIpList(''),true);
 assert.equal(validActionField('ips','203.0.113.4, 198.51.100.8'),true);assert.equal(validActionField('ips','203.0.113.4, x'),false);
 // host doubles as the address only when it is a literal and nothing is stored; no migration.
 assert.deepEqual(assetIps({host:'203.0.113.10'}).map(x=>x.ip),['203.0.113.10']);
 assert.deepEqual(assetIps({host:'example.org'}),[]);
 assert.deepEqual(assetIps({host:'203.0.113.10',ips:['198.51.100.24']}).map(x=>x.ip),['198.51.100.24'],'stored addresses win');
 assert.deepEqual(assetIps({ips:['x','198.51.100.24','198.51.100.24']}).map(x=>x.ip),['198.51.100.24']);
 // Card pick: public v4, else public v6, else inner; both public families mark +v6.
 assert.deepEqual(primaryIp({ips:['10.0.0.2','2001:db8::10','203.0.113.10']}),{ip:'203.0.113.10',inner:false,version:4,more:'v6',count:3});
 assert.equal(primaryIp({ips:['2001:db8::10']}).ip,'2001:db8::10');
 assert.deepEqual([primaryIp({ips:['192.168.1.20']}).inner,primaryIp({ips:['192.168.1.20']}).more],[true,'']);
 assert.equal(primaryIp({name:'x'}),null);
 assert.equal(maskIp('203.0.113.10'),'203.0.•••.•••');assert.equal(maskIp('2001:db8::10'),'2001:db8:••••');assert.equal(maskIp('nope'),'');
 // Quick action copies the address when one is known, the host name otherwise.
 assert.deepEqual(quickActions({type:'server',ips:['203.0.113.10'],host:'vps.example.org'},{}).map(q=>q.id),['copy-ssh','copy-ip']);
 assert.equal(quickActions({type:'server',ips:['203.0.113.10']},{})[0].value,'203.0.113.10');
 assert.deepEqual(quickActions({type:'server',host:'vps.example.org'},{}).map(q=>q.id),['copy-ssh','copy-host']);
});
test('SSH config import keeps an address literal in ips and does not overwrite stored ones',()=>{
 const {parseSshConfig,mergeSshConfig}=require('../asset-data.js');
 const hosts=parseSshConfig('Host tokyo\n  HostName 203.0.113.10\n  User deploy\nHost named\n  HostName vps.example.org\n');
 assert.deepEqual(hosts.map(h=>h.ips||null),[['203.0.113.10'],null]);
 const first=mergeSshConfig({blocks:[],assets:[]},hosts).board;
 assert.deepEqual(first.assets.find(a=>a.name==='tokyo').ips,['203.0.113.10']);
 first.assets.find(a=>a.name==='tokyo').ips=['198.51.100.24'];
 const again=mergeSshConfig(first,hosts).board;
 assert.deepEqual(again.assets.find(a=>a.name==='tokyo').ips,['198.51.100.24'],'a later import keeps the stored address');
});

test('server relations: legal pairs, one account per server, per-link marks, tone and peek sets',()=>{
 const D=require('../asset-data.js');
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const mk=()=>[
  {id:'s1',type:'server',name:'s1',date:day(-3),dateKind:'renew'},{id:'s2',type:'server',name:'s2',date:day(5),dateKind:'renew'},{id:'s3',type:'server',name:'s3',date:day(200),dateKind:'renew'},
  {id:'d1',type:'domain',name:'d1'},{id:'d2',type:'domain',name:'d2'},{id:'r1',type:'repository',name:'r1'},{id:'db',type:'database',name:'db'},{id:'li',type:'license',name:'li'},
  {id:'u1',type:'subscription',name:'u1'},{id:'u2',type:'subscription',name:'u2'},{id:'b1',type:'bankcard',name:'card'},{id:'ai',type:'ai',name:'ai'}
 ];
 const by=(list,id)=>list.find(a=>a.id===id);
 let a=mk();
 // Legal and illegal pairs.
 for(const [x,y,kind] of [['s1','d1','mount'],['s1','r1','mount'],['s1','db','mount'],['s1','li','mount'],['s1','u1','own'],['d1','s1','mount']])assert.equal(D.relationKind(by(a,x),by(a,y)),kind,x+y);
 assert.equal(D.relationKind(by(a,'d1'),by(a,'u1')),null);assert.equal(D.relationKind(by(a,'s1'),by(a,'ai')),null);
 assert.equal(D.linkAllowed(by(a,'s1'),by(a,'s2')),false);assert.equal(D.linkAllowed(by(a,'d1'),by(a,'d2')),false);assert.equal(D.linkAllowed(by(a,'r1'),by(a,'r1')),false);
 assert.equal(D.linkAllowed(by(a,'s1'),by(a,'b1')),true,'the card that pays for a server may link to it directly');
 assert.equal(D.linkAllowed(by(a,'s1'),by(a,'ai')),false,'other pairs with a server stay refused');
 assert.equal(D.linkAllowed(by(a,'d1'),by(a,'r1')),true,'domain and repository without a server stay linkable');
 assert.equal(D.linkAllowed(by(a,'b1'),by(a,'ai')),true,'priority types keep their symmetric links');
 // Linking: refused pairs change nothing; a second account replaces the first.
 assert.deepEqual(D.linkRelation(a,'s1','s2'),{ok:false,replaced:[]});assert.ok(!by(a,'s1').links);
 assert.equal(D.linkRelation(a,'d1','s1').ok,true);assert.equal(D.linkRelation(a,'d1','s2').ok,true);assert.equal(D.linkRelation(a,'r1','s1').ok,true);assert.equal(D.linkRelation(a,'d2','s2').ok,true);
 assert.equal(D.linkRelation(a,'u1','s1').ok,true);
 assert.deepEqual(D.linkRelation(a,'s1','u2'),{ok:true,replaced:['u1']});
 assert.deepEqual(D.serverChain(a,by(a,'s1')).accounts.map(x=>x.id),['u2'],'one account per server');
 assert.ok(!(by(a,'u1').links||[]).includes('s1'),'the old account lost the link');
 assert.equal(D.linkRelation(a,'s2','u2').ok,true,'one account may own several servers');
 assert.deepEqual(D.serverChain(a,by(a,'u2')).owned.map(x=>x.id).sort(),['s1','s2']);
 // Chain shape per type.
 const c=D.serverChain(a,by(a,'s1'));assert.deepEqual([c.mounts.map(x=>x.id).sort(),c.servers.length],[['d1','r1'],0]);
 assert.deepEqual(D.serverChain(a,by(a,'d1')).servers.map(x=>x.id).sort(),['s1','s2']);
 assert.equal(D.serverChainCount(a,by(a,'d1')),2);assert.equal(D.serverChainCount(a,by(a,'db')),0);
 // Marks: standby and proxied live on the child, keyed by server; only domains take proxied; cleaned up with the link.
 assert.equal(D.setLinkMeta(a,'d1','s2',{standby:true}),true);assert.deepEqual(by(a,'d1').linkMeta,{s2:{role:'b'}});
 assert.deepEqual(D.linkMetaOf(by(a,'d1'),'s2'),{standby:true,proxied:false});assert.deepEqual(D.linkMetaOf(by(a,'d1'),'s1'),{standby:false,proxied:false});
 D.setLinkMeta(a,'d1','s1',{proxied:true});assert.deepEqual(by(a,'d1').linkMeta.s1,{proxied:true});
 D.setLinkMeta(a,'r1','s1',{proxied:true});assert.ok(!by(a,'r1').linkMeta,'repositories are never proxied');
 assert.equal(D.setLinkMeta(a,'d1','s3',{standby:true}),false,'no mark without a link');assert.equal(D.setLinkMeta(a,'s1','d1',{standby:true}),false,'marks sit on the child only');
 D.setLinkMeta(a,'d1','s2',{standby:false});assert.ok(!by(a,'d1').linkMeta.s2,'a cleared mark leaves nothing behind');
 D.setLinkMeta(a,'d1','s2',{standby:true});D.unlinkAssets(a,'d1','s2');assert.ok(!by(a,'d1').linkMeta?.s2,'unlinking drops the mark');
 D.linkRelation(a,'d1','s2');D.setLinkMeta(a,'d1','s2',{standby:true});D.removeLinksTo(a,'s2');assert.ok(!by(a,'d1').linkMeta?.s2&&!by(a,'d1').links.includes('s2'),'deleting the server drops links and marks');
 // Tone: worst primary server; standby ignored while a primary remains; hidden servers ignored.
 a=mk();D.linkRelation(a,'d1','s1');D.linkRelation(a,'d1','s2');D.linkRelation(a,'d2','s3');D.linkRelation(a,'r1','s2');
 assert.equal(D.serverTone(a,by(a,'d1')),'red','expired primary colours the marker red');
 D.setLinkMeta(a,'d1','s1',{standby:true});assert.equal(D.serverTone(a,by(a,'d1')),'amber','an expired standby does not colour it');
 D.setLinkMeta(a,'d1','s2',{standby:true});assert.equal(D.serverTone(a,by(a,'d1')),'red','all standby: the standbys decide');
 assert.equal(D.serverTone(a,by(a,'d2')),'','a healthy server leaves it neutral');assert.equal(D.serverTone(a,by(a,'r1')),'amber');
 by(a,'s2').hiddenAt='2026-01-01';assert.equal(D.serverTone(a,by(a,'r1')),'','hidden servers do not colour');
 assert.equal(D.serverTone(a,by(a,'db')),'','no server, no tone');
 // Peek: chain plus one step through the server.
 a=mk();D.linkRelation(a,'d1','s1');D.linkRelation(a,'r1','s1');D.linkRelation(a,'s1','u1');D.linkRelation(a,'d2','s2');D.linkRelation(a,'s2','u1');
 assert.deepEqual([...D.peekSet(a,by(a,'s1'))].sort(),['d1','r1','u1']);
 assert.deepEqual([...D.peekSet(a,by(a,'d1'))].sort(),['s1','u1'],'a child reaches its servers and their account');
 assert.deepEqual([...D.peekSet(a,by(a,'u1'))].sort(),['d1','d2','r1','s1','s2'],'an account reaches its servers and what is on them');
 assert.equal(D.peekSet(a,by(a,'db')).size,0);assert.equal(D.peekSet(a,by(a,'b1')).size,0);
});

test('agent import: whitelisted fields go through CSV normalisation, bad input is refused',()=>{
 const {parseAgentImport}=require('../asset-data.js');
 for(const bad of ['nope','[]','{"items":[]}','{"assetboard":1}'])assert.equal(parseAgentImport(bad).ok,false,bad);
 const parsed=parseAgentImport(JSON.stringify({assetboard:1,items:[
  {name:'example.com',type:'domain',provider:'Namecheap',date:'2027-03-01',cost:12,url:'javascript:alert(1)',password:'s3cret'},
  {type:'domain'}
 ]}));
 assert.equal(parsed.ok,true);
 const {items,unreadable}=rowsToImportItems(parsed);
 assert.equal(items.length,1);assert.equal(unreadable.length,1);
 assert.equal(items[0].type,'domain');assert.equal(items[0].date,'2027-03-01');assert.equal(items[0].cost,'12');
 assert.equal(items[0].url,'');assert.equal('password' in items[0],false);
 const many=parseAgentImport({assetboard:1,items:Array.from({length:IMPORT_ROW_LIMIT+5},(_,i)=>({name:'a'+i}))});
 assert.equal(many.rows.length,IMPORT_ROW_LIMIT);assert.equal(many.truncated,true);
});

test('form entry: loose dates, cost parts and type guessed from the name',()=>{
 const {parseLooseDate,shiftDate,costParts,formatCostParts,inferTypeFromName}=require('../asset-data.js');
 const now=new Date(2026,9,20);
 assert.equal(parseLooseDate('2027-03-01',now),'2027-03-01');
 assert.equal(parseLooseDate('3/1',now),'2027-03-01','a past month/day means next year');
 assert.equal(parseLooseDate('12月25日',now),'2026-12-25');
 assert.equal(parseLooseDate('10/20',now),'2026-10-20','today still counts');
 for(const bad of ['','abc','13/1','2/30','99'])assert.equal(parseLooseDate(bad,now),'',bad);
 assert.equal(shiftDate('2027-01-31',1),'2027-02-28');
 assert.equal(shiftDate('',12,now),'2027-10-20','without a date it counts from today');
 assert.deepEqual(costParts('$10.98 / 年'),{currency:'USD',value:'10.98'});
 assert.deepEqual(costParts('¥ 1,299 / 年'),{currency:'CNY',value:'1299'});
 assert.equal(costParts('约 100 元左右'),null,'free text is not rewritten');assert.deepEqual(costParts('$11/month'),{currency:'USD',value:'11'});assert.equal(costParts('未知'),null);assert.equal(costParts(''),null);
 assert.equal(formatCostParts('USD','10.98','yearly'),'$10.98 / 年');
 assert.equal(formatCostParts('CNY','89',''),'¥89');
 assert.deepEqual(['example.com','203.0.113.10','github.com/me/repo','Vultr 服务器','Figma',''].map(inferTypeFromName),['domain','server','repository','server','','']);
});

test('quick line: one typed line becomes form fields, unknown parts are left out',()=>{
 const {parseQuickLine}=require('../asset-data.js');
 const now=new Date(2026,9,20);
 assert.deepEqual(parseQuickLine('example.com namecheap 2027-03-01 $11/年',now),{cost:'$11 / 年',cycle:'yearly',dateKind:'renew',date:'2027-03-01',name:'example.com',type:'domain',provider:'namecheap'});
 const loose=parseQuickLine('Figma 3/1 $15 /月',now);
 assert.equal(loose.name,'Figma');assert.equal(loose.date,'2027-03-01');assert.equal(loose.cost,'$15 / 月');assert.equal(loose.cycle,'monthly');assert.equal('type' in loose,false);
 assert.deepEqual(parseQuickLine('203.0.113.10 vultr',now),{name:'203.0.113.10',type:'server',provider:'vultr'});
 assert.equal(parseQuickLine('   ',now),null);
 assert.equal(parseQuickLine('$11/年',now),null,'an amount alone has no name');
});

test('plans reminder notifications with lead days per date kind and cycle',()=>{
 const {reminderPlan,reminderLeads}=require('../asset-data.js');
 const morning=new Date(2026,9,1,8,0),later=new Date(2026,9,1,10,0);
 const domain={id:'d',name:'example.dev',date:'2026-10-31',dateKind:'expire',cost:'¥ 89 / 年'};
 assert.deepEqual(reminderPlan([domain],morning).map(r=>[r.when,r.title,r.body,r.assetId]),[
  ['2026-10-01T09:00','example.dev','30 天后到期 · ¥ 89 / 年','d'],
  ['2026-10-24T09:00','example.dev','7 天后到期 · ¥ 89 / 年','d'],
  ['2026-10-30T09:00','example.dev','明天到期 · ¥ 89 / 年','d'],
  ['2026-10-31T09:00','example.dev','今天到期 · ¥ 89 / 年','d'],
  ['2026-11-03T09:00','example.dev','已过期 3 天，看看还能不能补救 · ¥ 89 / 年','d'],
  ['2026-11-14T09:00','example.dev','已过期 14 天，看看还能不能补救 · ¥ 89 / 年','d']]);
 assert.deepEqual(reminderPlan([domain],later).map(r=>r.when).slice(0,2),['2026-10-24T09:00','2026-10-30T09:00'],'09:00 has passed, so today is not scheduled');
 assert.deepEqual(reminderPlan([{id:'t',name:'Trial',date:'2026-10-10',dateKind:'trial',cost:'未知'}],morning).map(r=>[r.when,r.body]),[['2026-10-07T09:00','3 天后试用结束'],['2026-10-09T09:00','明天试用结束']]);
 assert.deepEqual(reminderLeads({dateKind:'renew',cycle:'monthly'}),[3,1]);
 assert.deepEqual(reminderLeads({dateKind:'keep',cycle:'yearly'}),[30,7,1]);
 // A monthly charge anchored at a month end keeps rolling forward from that anchor.
 const monthly=reminderPlan([{id:'m',name:'Editor Pro',date:'2026-01-31',dateKind:'renew',cycle:'monthly'}],morning);
 assert.deepEqual(monthly.slice(0,4).map(r=>[r.when,r.body]),[['2026-10-28T09:00','3 天后扣款'],['2026-10-30T09:00','明天扣款'],['2026-11-27T09:00','3 天后扣款'],['2026-11-29T09:00','明天扣款']]);
 assert.ok(monthly.some(r=>r.when==='2027-01-28T09:00'),'later occurrences are planned too');
});

test('keeps reminding after something runs out, and asks once after an auto-renewal',()=>{
 const {reminderPlan}=require('../asset-data.js');
 const morning=new Date(2026,9,1,8,0);
 // Ran out five days ago: the 3-day note is gone, the 14-day one is still ahead.
 assert.deepEqual(reminderPlan([{id:'x',name:'gone.dev',date:'2026-09-26',dateKind:'expire'}],morning).map(r=>[r.when,r.body]),[['2026-10-10T09:00','已过期 14 天，看看还能不能补救']]);
 assert.deepEqual(reminderPlan([{id:'k',name:'+44 7700',date:'2026-09-29',dateKind:'keep'}],morning).map(r=>r.body),['保号已过期 3 天，看看还能不能补救','保号已过期 14 天，看看还能不能补救']);
 assert.deepEqual(reminderPlan([{id:'s',name:'gone.dev',date:'2026-09-26',dateKind:'expire',stopped:true}],morning),[],'a stopped record is not chased');
 assert.deepEqual(reminderPlan([{id:'s',name:'old.dev',date:'2026-10-20',dateKind:'expire',stopped:true}],morning),[],'nor warned before its date');
 // An auto-renewing expiry: the usual leads, then one question the day after, and nothing on the day itself.
 const auto=reminderPlan([{id:'a',name:'auto.dev',date:'2025-10-20',dateKind:'expire',cycle:'yearly'}],morning).map(r=>[r.when,r.body]);
 assert.deepEqual(auto.slice(0,3),[['2026-10-13T09:00','7 天后到期'],['2026-10-19T09:00','明天到期'],['2026-10-21T09:00','昨天该自动续费，确认续上了吗']]);
 assert.ok(!auto.some(r=>r[0]==='2026-10-20T09:00'));
 // Charges and trials are unchanged: nothing after the day.
 assert.ok(!reminderPlan([{id:'t',name:'Trial',date:'2026-10-03',dateKind:'trial'}],morning).some(r=>/已|今天/.test(r.body)));
});

test('merges reminders that fall on the same day and leaves out hidden or undated records',()=>{
 const {reminderPlan,REMINDER_LIMIT,isoDay}=require('../asset-data.js');
 const morning=new Date(2026,9,1,8,0);
 const assets=[{id:'b',name:'b.example',date:'2026-10-03'},{id:'a',name:'a.example',date:'2026-10-03',dateKind:'renew'},{id:'w',name:'week.example',date:'2026-10-09'},
  {id:'h',name:'hidden.example',date:'2026-10-03',hiddenAt:'2026-01-01'},{id:'n',name:'undated.example'},{id:'p',name:'past.example',date:'2026-09-01'},{id:'x',name:'bad.example',date:'2026-02-30'}];
 const day=reminderPlan(assets,morning).find(r=>r.when==='2026-10-02T09:00');
 assert.deepEqual([day.id,day.title,day.body,day.assetId],['reminder-2026-10-02','3 项需要留意','a.example 明天扣款；b.example 明天到期；week.example 7 天后到期',null]);
 const crowd=reminderPlan(['a','b','c','d'].map(n=>({id:n,name:`${n}.example`,date:'2026-10-03'})),morning).find(r=>r.when==='2026-10-02T09:00');
 assert.equal(crowd.body,'a.example 明天到期；b.example 明天到期；c.example 明天到期 等 4 项');
 assert.ok(!reminderPlan(assets,morning).some(r=>/hidden|undated|past|bad/.test(r.body+r.title)));
 const many=reminderPlan(Array.from({length:100},(_,i)=>({id:`s${i}`,name:`s${i}`,date:isoDay(dayNumber('2026-11-01')+i)})),morning);
 assert.equal(many.length,REMINDER_LIMIT);
 assert.deepEqual(many.map(r=>r.when),[...many.map(r=>r.when)].sort(),'nearest first');
 assert.equal(new Set(many.map(r=>r.id)).size,many.length);
});

test('what links mean: kinds and words on each side, risks from cards and numbers, impact',()=>{
 const D=require('../asset-data.js');
 const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const a=[
  {id:'card',type:'bankcard',name:'Wise',last4:'4821',date:day(10),dateKind:'expire'},{id:'old',type:'bankcard',name:'Old',last4:'1111',date:day(-5),dateKind:'expire'},
  {id:'phone',type:'phone',name:'giffgaff',date:day(-1),dateKind:'keep'},{id:'apple',type:'appleid',name:'Apple 主号'},{id:'g',type:'google',name:'Google'},
  {id:'sub',type:'subscription',name:'Vultr'},{id:'vps',type:'server',name:'vps'},{id:'ai',type:'ai',name:'ChatGPT'},{id:'repo',type:'repository',name:'me/app'},
  {id:'dep',type:'deployment',name:'app.vercel'},{id:'dom',type:'domain',name:'app.dev'},{id:'db',type:'database',name:'pg'},{id:'lic',type:'license',name:'lic'},{id:'hid',type:'ai',name:'hidden',hiddenAt:'2026-01-01'}
 ];
 const by=id=>a.find(x=>x.id===id),kind=(x,y)=>D.linkKind(by(x),by(y));
 // Each side has its own word; the pair decides, whichever way round.
 for(const [x,y,k,l1,l2] of [['card','sub','pay','支付','付款卡'],['apple','ai','login','用于登录','登录账号'],['phone','apple','verify','接收验证码','验证手机号'],['repo','dep','deploy','部署到','代码来自'],['dom','dep','point','指向','绑定域名'],['dep','db','use','使用','被使用'],['vps','sub','own','所属账号','名下服务器'],['vps','lic','mount','托管','所在服务器'],['card','vps','pay','支付','付款卡']]){
  assert.deepEqual(kind(x,y),{kind:k,label:l1},x+'→'+y);assert.deepEqual(kind(y,x),{kind:k,label:l2},y+'→'+x);
 }
 assert.deepEqual(kind('card','apple'),{kind:'pay',label:'支付'},'a card pays an Apple ID before anything else');
 assert.deepEqual(kind('phone','card'),{kind:'verify',label:'接收验证码'});
 assert.deepEqual(kind('apple','g'),{kind:'related',label:'相关'},'unlisted pairs are plain 相关');
 // Risks: the card of a subscription, the card of the account a server belongs to, the number that verifies an account.
 for(const [x,y] of [['card','sub'],['sub','vps'],['old','ai'],['card','ai'],['phone','apple'],['card','hid'],['card','vps']])D.linkRelation(a,x,y);
 const vps=D.linkRisks(a,by('vps'));
 assert.equal(vps.length,1,'one card, reached twice, is named once');assert.equal(vps[0].source.id,'card');
 const sub=D.linkRisks(a,by('sub'));assert.equal(sub[0].kind,'pay');assert.equal(sub[0].level,'soon');assert.equal(sub[0].via,null);
 const ai=D.linkRisks(a,by('ai'));assert.deepEqual(ai.map(r=>[r.source.id,r.level]),[['old','overdue'],['card','soon']],'the worst first');
 assert.deepEqual(D.linkRisks(a,by('apple')).map(r=>[r.source.id,r.kind]),[['phone','verify']]);
 D.unlinkAssets(a,'card','vps');
 assert.deepEqual(D.linkRisks(a,by('vps')).map(r=>[r.source.id,r.via?.id]),[['card','sub']],'a server hears about its account\'s card');
 by('card').hiddenAt='2026-01-01';assert.equal(D.linkRisks(a,by('sub')).length,0,'a hidden card is no risk');delete by('card').hiddenAt;
 // A card with trouble (stopped, refused, issuer gone) is a risk whatever its expiry says, and stops being one when set back to normal.
 by('card').cardStatus='closed';assert.deepEqual(D.linkRisks(a,by('sub')).map(r=>[r.level,r.label]),[['overdue','发卡方停业']]);
 assert.deepEqual(D.linkRisks(a,by('vps')).map(r=>[r.source.id,r.level]),[['card','overdue']],'through the account too');
 by('card').cardStatus='';assert.equal(D.linkRisks(a,by('sub'))[0].level,'soon');assert.equal(D.cardTrouble(by('card')),null);
 assert.equal(D.cardTrouble({type:'phone',cardStatus:'closed'}),null,'only cards have a card status');
 assert.equal(D.cardTrouble({type:'bankcard',cardStatus:'whatever'}),null,'unknown values are ignored');
 // Impact: what a card pays for (servers through accounts) and what a number verifies; hidden records left out.
 assert.deepEqual(D.linkImpact(a,by('card')).map(x=>x.id).sort(),['ai','sub','vps']);
 assert.deepEqual(D.linkImpact(a,by('phone')).map(x=>x.id),['apple']);
 assert.deepEqual(D.linkImpact(a,by('sub')),[],'only cards and numbers have an impact');
});

test('money: amount, currency and cycle from the cost text, conversion, totals, formatting',()=>{
 const D=require('../asset-data.js');
 const read=cost=>D.costAmount({cost});
 assert.deepEqual(read('$10.98 / 年'),{currency:'USD',value:10.98,months:12});
 assert.deepEqual(read('HK$ 88 / 3 个月'),{currency:'HKD',value:88,months:3},'quarterly text written by formatCost reads back');
 assert.deepEqual(read('JP¥1200 / 月'),{currency:'JPY',value:1200,months:1},'yen written as JP¥ reads back');
 assert.deepEqual(read('100 元/月'),{currency:'CNY',value:100,months:1});
 assert.deepEqual(read('€40'),{currency:'EUR',value:40,months:null},'no cycle: one-off or unclear');
 assert.deepEqual(D.costAmount({cost:'€40',cycle:'yearly'}),{currency:'EUR',value:40,months:12},'the record cycle fills in');
 for(const text of ['约 100 元左右','未知','','$5 / 月 / 人'])assert.equal(read(text),null,text);
 for(const [currency,value,cycle] of [['HKD','88','quarterly'],['JPY','1200','monthly'],['CNY','89','halfyearly'],['GBP','5.5','yearly']]){
  const text=D.formatCost({currency,value},cycle);assert.deepEqual(read(text),{currency,value:Number(value),months:D.billingCycles[cycle].months},text);
 }
 // Every save keeps amount and currency in step with the text.
 const a={cost:'$12/月'};assert.equal(D.syncMoney(a),true);assert.equal(a.amount,12);assert.equal(a.currency,'USD');
 assert.equal(D.syncMoney(a),false,'nothing changes when already in step');
 a.cost='约 100 元左右';D.syncMoney(a);assert.ok(!('amount' in a)&&!('currency' in a),'free text carries neither');
 // Conversion through USD; unknown currencies give null.
 const rates={USD:1,CNY:7,EUR:0.5};
 assert.equal(D.convertMoney(10,'USD','CNY',rates),70);assert.equal(D.convertMoney(1,'EUR','CNY',rates),14);assert.equal(D.convertMoney(5,'CNY','CNY',rates),5);
 assert.equal(D.convertMoney(1,'XYZ','CNY',rates),null);
 // Totals: monthly equivalents in one currency; hidden, stopped, one-off, unreadable and rateless records are listed, not guessed.
 const assets=[
  {id:'a',type:'subscription',cost:'$10 / 月'},{id:'b',type:'domain',cost:'¥ 84 / 年'},{id:'c',type:'subscription',cost:'€6 / 3 个月'},
  {id:'h',type:'ai',cost:'$20 / 月',hiddenAt:'x'},{id:'s',type:'server',cost:'$5 / 月',stopped:true},
  {id:'o',type:'license',cost:'$99'},{id:'u',type:'ai',cost:'约 100 元左右'},{id:'n',type:'ai',cost:'SGD 10 / 月'},{id:'z',type:'ai',cost:'未知'}
 ];
 const t=D.costTotals(assets,{currency:'CNY',rates});
 assert.equal(t.monthly,70+7+28);assert.equal(t.yearly,(70+7+28)*12);
 assert.deepEqual(t.items.map(i=>i.asset.id),['a','c','b'],'largest first');
 assert.deepEqual([t.noCycle.map(x=>x.id),t.unreadable.map(x=>x.id),t.noRate.map(x=>x.id),t.oneOff.map(x=>x.id)],[['o'],['u'],['n'],[]],'an amount without a cycle is unknown, not one-off');
 assert.deepEqual(t.byType,[['subscription',98],['domain',7]]);
 // Formatting: grouping, two decimals under 1000, none for yen.
 assert.equal(D.formatMoney(1234.5,'CNY'),'¥1,235');assert.equal(D.formatMoney(9.5,'USD'),'$9.50');assert.equal(D.formatMoney(1200.4,'JPY'),'JP¥1,200');assert.equal(D.formatMoney(12.345,'EUR'),'€12.35');
});

test('vendor presets: every category offers vendors that resolve to their own site icon, and new patterns stay narrow',()=>{
 const D=require('../asset-data.js');
 for(const [type,list] of Object.entries(D.PROVIDER_PRESETS)){
  assert.ok(list.length>=4,type);assert.equal(new Set(list).size,list.length,type);
  for(const name of list)assert.ok(D.iconVendor({type,name:'x',provider:name}),`${type}: ${name}`);
 }
 const host=provider=>D.iconVendor({type:'subscription',name:'x',provider})?.host;
 assert.equal(host('OpenAI'),'chatgpt.com');assert.equal(host('Google Cloud'),'cloud.google.com');assert.equal(host('GitHub Copilot'),'github.com');
 assert.equal(host('中国联通'),'10010.com');assert.equal(host('中银香港'),'bochk.com');assert.equal(host('中国银行'),'boc.cn');
 // Ordinary words do not turn into vendors.
 for(const word of ['Linear algebra','Chasel','Pokemon','Neonatal']) assert.equal(host(word),undefined,word);
 assert.deepEqual(D.providerPresets('appleid'),[]);
});

test('maskName keeps the first character and a domain suffix',()=>{
 const {maskName}=require('../asset-data.js');
 assert.equal(maskName('example.com'),'e••••••.com');assert.equal(maskName('tokyo-vps'),'t••••••');assert.equal(maskName('美区主号'),'美•••');
 assert.equal(maskName('a'),'•');assert.equal(maskName('x.io'),'•.io');assert.equal(maskName(''),'');assert.equal(maskName('v1.2'),'v•••');
});

test('Cloudflare auto-renew off means the domain simply expires',()=>{
 const {mergeCloudflare}=require('../asset-data.js');
 const board={blocks:[],assets:[{id:'cloudflare-zone-z1',type:'domain',name:'a.dev',source:'cloudflare',resourceKind:'zone',externalId:'z1',date:'2026-05-01',dateKind:'expire',cycle:'yearly'}]};
 const off=mergeCloudflare(board,{queriedKinds:['zone','registrar'],resources:[{id:'z1',name:'a.dev',status:'active'},{kind:'registrar',id:'a.dev',name:'a.dev',expiresAt:'2027-05-01T00:00:00Z',autoRenew:'0'}]});
 assert.equal(off.board.assets.find(x=>x.name==='a.dev').cycle,'');
 const fresh=mergeCloudflare({blocks:[],assets:[]},{queriedKinds:['registrar'],resources:[{kind:'registrar',id:'b.dev',name:'b.dev',expiresAt:'2027-05-01T00:00:00Z',autoRenew:'0'}]});
 assert.equal(fresh.board.assets[0].cycle,'','the string "0" is off, not a truthy value');
 const on=mergeCloudflare({blocks:[],assets:[]},{queriedKinds:['registrar'],resources:[{kind:'registrar',id:'c.dev',name:'c.dev',expiresAt:'2027-05-01T00:00:00Z',autoRenew:'1'}]});
 assert.equal(on.board.assets[0].cycle,'yearly');
});

test('reads a CF-Server-Monitor server backup without its notes or probe settings',()=>{
 const {isCfsmBackup,parseCfsmBackup,classifyImportPayload,planImport,applyImport,costAmount}=require('../asset-data.js');
 const row=(fields)=>({id:'9b2c4d3e-1a2b-4c5d-9e8f-7a6b5c4d3e2f',name:'',server_group:'Default',region:'',tags:'',note:'',price:'',billing_cycle:'month',auto_renewal:'0',currency:'¥',expire_date:'',traffic_limit:'',custom_ct:'ct.example.net:80',report_interval:60,is_hidden:'0',sort_order:0,history_partition_id:1,timestamp:0,...fields});
 const backup=[
  row({name:'HK-01',server_group:'HK',region:'hk',tags:'web,edge',price:'12.00',currency:'$',expire_date:'2027-03-01',auto_renewal:'1',traffic_limit:'1TB',note:'root pw hunter2'}),
  row({name:'JP-02',price:'588.00',billing_cycle:'year',expire_date:'2026-12-31'}),
  row({name:'Free-03',price:'-1'}),
  row({name:'Long-04',price:'100.00',currency:'€',billing_cycle:'two_years'}),
  row({name:'   '})
 ];
 const text=JSON.stringify(backup,null,2);
 assert.equal(isCfsmBackup(backup),true);
 assert.equal(isCfsmBackup([{name:'x'}]),false);
 assert.equal(isCfsmBackup([]),false);
 assert.equal(classifyImportPayload({text,filename:'servers-backup-2026-10-22.json'}).kind,'cfsm');
 assert.equal(classifyImportPayload({text}).kind,'cfsm');
 assert.equal(classifyImportPayload({text:JSON.stringify({blocks:[],assets:[]}),filename:'backup.json'}).kind,'json');
 assert.equal(parseCfsmBackup('{"assets":[]}').ok,false);
 const parsed=parseCfsmBackup(text);
 assert.equal(parsed.ok,true);
 assert.equal(parsed.preset.label,'CF-Server-Monitor');
 assert.deepEqual(parsed.droppedSecrets,[]);
 assert.deepEqual(parsed.leftOut.map(x=>x.label),['备注'],'备注 is left out, not called a key column');
 assert.deepEqual(parsed.unreadable.map(r=>r.line),[5]);
 const byName=Object.fromEntries(parsed.items.map(item=>[item.name,item]));
 assert.ok(parsed.items.every(item=>item.type==='server'));
 assert.equal(byName['HK-01'].date,'2027-03-01');
 assert.equal(byName['HK-01'].dateKind,'renew');
 assert.equal(byName['HK-01'].cycle,'monthly');
 assert.equal(byName['HK-01'].cost,'$12.00 / 月');
 assert.equal(byName['HK-01'].notes,'分组 HK · 标签 web,edge · 流量 1TB');
 assert.equal(byName['HK-01'].region,'HK');
 assert.equal(byName['HK-01'].importedFrom,'CF-Server-Monitor');
 assert.equal(byName['JP-02'].region,undefined,'no region in the backup, none on the server');
 assert.equal(byName['JP-02'].cost,'¥588.00 / 年');
 assert.equal(byName['JP-02'].dateKind,'expire');
 assert.equal(byName['Free-03'].cost,'免费');
 assert.equal(byName['Long-04'].cost,'€100.00 / 2 年');
 assert.equal(byName['Long-04'].cycle,'');
 assert.deepEqual(costAmount({cost:byName['HK-01'].cost}),{currency:'USD',value:12,months:1});
 const json=JSON.stringify(parsed);
 assert.ok(!json.includes('hunter2')&&!json.includes('ct.example.net')&&!json.includes('9b2c4d3e'),'notes, probe nodes and panel ids stay out');
 const plan=planImport({blocks:[],assets:[],deletedExternalIds:[]},parsed.items);
 assert.equal(plan.added.length,4);
 const board=applyImport({blocks:[],assets:[],deletedExternalIds:[]},plan);
 const hk=board.assets.find(a=>a.name==='HK-01');
 assert.equal(hk.cost,'$12.00 / 月');assert.equal(hk.region,'HK');assert.equal(hk.importedFrom,'CF-Server-Monitor');
 assert.equal(planImport(board,parsed.items).skippedSame.length,4,'importing the same backup again skips every server');
 const many=Array.from({length:120},(_,i)=>row({name:'s'+i}));
 const big=parseCfsmBackup(JSON.stringify(many));
 assert.equal(big.items.length,100);assert.equal(big.truncated,true);assert.equal(big.totalRows,120);
});

test('imported rows read 导入于, synced rows keep 同步于',()=>{
 const {syncedLabel}=require('../asset-data.js');
 const board={blocks:[],assets:[]};
 const items=rowsToImportItems(parseDelimitedText('名称,类别\nfresh.dev,域名\n')).items;
 const imported=applyImport(board,planImport(board,items)).assets[0];
 assert.ok(imported.syncedAt);
 assert.equal(syncedLabel(imported),'导入于');
 const repo=mergeGitHub(board,{repositories:[{id:'1',name:'me/a',owner:'me',url:'https://github.com/me/a'}]}).board.assets[0];
 assert.equal(syncedLabel(repo),'同步于');
 const host=mergeSshConfig(board,[{name:'box',host:'box.example.net',externalId:'box'}]).board.assets[0];
 assert.equal(syncedLabel(host),'同步于');
});

// task-09: a Cloudflare domain bought after connecting shows up on the next sync, once, without undoing the person's choices.
test('mergeCloudflare re-sync: new zones and Registrar domains across pages, merged once',()=>{
 const zone=(i,extra={})=>({kind:'zone',id:`z${i}`,name:`site${i}.example`,account:'Acct',status:'active',...extra});
 const reg=(name,extra={})=>({kind:'registrar',id:`acct:${name}`,name,account:'Acct',status:'active',expiresAt:'2027-03-01T00:00:00Z',autoRenew:'1',...extra});
 // First sync: three pages of zones (50 a page), concatenated by the app before merging.
 const pages=[0,1,2].map(p=>Array.from({length:p<2?50:20},(_,i)=>zone(p*50+i)));
 const first=mergeCloudflare({blocks:[],assets:[],deletedExternalIds:[]},{queriedKinds:['zone','registrar'],resources:[...pages.flat(),reg('site0.example')]},'2026-10-01T00:00:00Z');
 assert.equal(first.added,120);assert.equal(first.collisions.length,0);
 // Bought later: a new zone on the last page plus its registration.
 const later=[...pages.flat(),zone(120),reg('site0.example'),reg('site120.example')];
 const second=mergeCloudflare(first.board,{queriedKinds:['zone','registrar'],resources:later},'2026-10-20T00:00:00Z');
 assert.equal(second.added,1,'only the new domain is added');
 assert.equal(second.collisions.length,0);
 const fresh=second.board.assets.filter(a=>a.name==='site120.example');
 assert.equal(fresh.length,1,'zone and registration of one domain make one record');
 assert.equal(fresh[0].externalId,'z120');assert.equal(fresh[0].date,'2027-03-01');assert.equal(fresh[0].cycle,'yearly');
 // Syncing the same answer again changes nothing in number.
 const third=mergeCloudflare(second.board,{queriedKinds:['zone','registrar'],resources:later},'2026-10-21T00:00:00Z');
 assert.equal(third.added,0);assert.equal(third.board.assets.length,121);
 assert.ok(third.board.assets.every(a=>!a.syncMissing));
});

test('mergeCloudflare: a domain first seen as a registration is taken over by its zone, not asked about',()=>{
 const reg={kind:'registrar',id:'acct:fresh.example',name:'fresh.example',account:'Acct',status:'registration_pending'};
 const first=mergeCloudflare({blocks:[],assets:[],deletedExternalIds:[]},{queriedKinds:['zone','registrar'],resources:[reg]});
 assert.equal(first.added,1);
 const second=mergeCloudflare(first.board,{queriedKinds:['zone','registrar'],resources:[{kind:'zone',id:'zf',name:'fresh.example',status:'active'},{...reg,status:'active',expiresAt:'2027-10-01T00:00:00Z'}]});
 assert.equal(second.added,0);
 assert.deepEqual(second.collisions,[],'its own record is not a name collision');
 const rows=second.board.assets.filter(a=>a.name==='fresh.example');
 assert.equal(rows.length,1);
 assert.equal(rows[0].externalId,'zf','the zone id becomes the key');
 assert.equal(rows[0].date,'2027-10-01');
 const third=mergeCloudflare(second.board,{queriedKinds:['zone','registrar'],resources:[{kind:'zone',id:'zf',name:'fresh.example',status:'active'},{...reg,status:'active'}]});
 assert.equal(third.board.assets.filter(a=>a.name==='fresh.example').length,1);
 // A zone removed and added again in Cloudflare (new zone id) keeps the same record too.
 const readded=mergeCloudflare(third.board,{queriedKinds:['zone'],resources:[{kind:'zone',id:'zf2',name:'fresh.example',status:'active'}]});
 assert.equal(readded.added,0);assert.deepEqual(readded.collisions,[]);
 assert.equal(readded.board.assets.filter(a=>a.name==='fresh.example').length,1);
});

test('mergeCloudflare keeps deletions, hidden records and names the person changed',()=>{
 const board={blocks:[],deletedExternalIds:['cloudflare:zone:zgone','cloudflare-zone-zgone','cloudflare:zone:acct:lapsed.example','cloudflare-zone-acct:lapsed.example'],assets:[
  {id:'cloudflare-zone-zh',type:'domain',name:'quiet.example',syncName:'quiet.example',source:'cloudflare',resourceKind:'zone',externalId:'zh',hiddenAt:'2026-10-01T00:00:00Z'},
  {id:'cloudflare-zone-zr',type:'domain',name:'主站',syncName:'main.example',source:'cloudflare',resourceKind:'zone',externalId:'zr'},
  {id:'cloudflare-zone-zp',type:'domain',name:'old.example',syncName:'old.example',source:'cloudflare',resourceKind:'zone',externalId:'zp'}]};
 const result=mergeCloudflare(board,{queriedKinds:['zone','registrar'],resources:[
  {kind:'zone',id:'zgone',name:'gone.example'},{kind:'registrar',id:'acct:gone.example',name:'gone.example',expiresAt:'2027-01-01T00:00:00Z'},
  {kind:'zone',id:'zlapsed',name:'lapsed.example'},{kind:'registrar',id:'acct:lapsed.example',name:'lapsed.example'},
  {kind:'zone',id:'zh',name:'quiet.example'},{kind:'registrar',id:'acct:quiet.example',name:'quiet.example',expiresAt:'2027-02-01T00:00:00Z'},
  {kind:'zone',id:'zr',name:'main.example'},{kind:'registrar',id:'acct:main.example',name:'main.example',expiresAt:'2027-04-01T00:00:00Z'},
  {kind:'zone',id:'zp',name:'renamed-on-cloudflare.example'}]});
 const names=result.board.assets.map(a=>a.name);
 assert.ok(!names.includes('gone.example'),'a deleted zone does not come back through its registration');
 assert.ok(!names.includes('lapsed.example'),'a deleted registration does not come back through its zone');
 assert.equal(result.added,0);assert.deepEqual(result.collisions,[]);
 const quiet=result.board.assets.filter(a=>a.syncName==='quiet.example');
 assert.equal(quiet.length,1);assert.equal(quiet[0].hiddenAt,'2026-10-01T00:00:00Z','hidden stays hidden');assert.equal(quiet[0].date,'2027-02-01');
 const main=result.board.assets.find(a=>a.id==='cloudflare-zone-zr');
 assert.equal(main.name,'主站','a name the person gave is kept');
 assert.equal(main.date,'2027-04-01','and its registration still finds it');
 assert.equal(result.board.assets.filter(a=>a.syncName==='main.example').length,1);
 const moved=result.board.assets.find(a=>a.id==='cloudflare-zone-zp');
 assert.equal(moved.name,'renamed-on-cloudflare.example','a name nobody changed follows Cloudflare');
 assert.equal(moved.syncName,'renamed-on-cloudflare.example');
});

test('mergeCloudflare asks once when a domain and its registration meet a local record of the same name',()=>{
 const board={blocks:[],assets:[{id:'asset-1',type:'domain',name:'mine.example',source:'manual'}]};
 const result=mergeCloudflare(board,{queriedKinds:['zone','registrar'],resources:[{kind:'zone',id:'zm',name:'mine.example',status:'active'},{kind:'registrar',id:'acct:mine.example',name:'mine.example',expiresAt:'2027-06-01T00:00:00Z',autoRenew:'0'}]});
 assert.equal(result.collisions.length,1);
 assert.equal(result.collisions[0].fields.date,'2027-06-01');
 assert.equal(result.collisions[0].fields.externalId,'zm');
 assert.ok(applyCollision(result.board,result.collisions[0]));
 const again=mergeCloudflare(result.board,{queriedKinds:['zone','registrar'],resources:[{kind:'zone',id:'zm',name:'mine.example',status:'active'},{kind:'registrar',id:'acct:mine.example',name:'mine.example',expiresAt:'2027-06-01T00:00:00Z'}]});
 assert.deepEqual(again.collisions,[]);assert.equal(again.board.assets.length,1);
});

test('names Assetboard\'s read-only exports when they are imported, and keeps the backup importable',()=>{
 const {calendarIcs,ledgerCsv,handoverHtml}=require('../asset-data.js');
 const assets=[{id:'d',type:'domain',name:'example.com',date:'2099-03-01',dateKind:'expire',cycle:'yearly',cost:'$10 / 年'}];
 assert.equal(classifyImportPayload({text:calendarIcs(assets),filename:'Assetboard.ics'}).copy,'日历');
 assert.equal(classifyImportPayload({text:calendarIcs(assets)}).kind,'copy');
 const ledger=ledgerCsv([{date:'2026-01-01',name:'example.com',type:'域名',provider:'R',project:'',amount:10,currency:'USD',months:12,covers:'2027-01-01',note:''}]);
 assert.deepEqual([classifyImportPayload({text:ledger,filename:'账本.csv'}).kind,classifyImportPayload({text:ledger,filename:'账本.csv'}).copy],['copy','付款账本']);
 assert.equal(classifyImportPayload({text:handoverHtml({assets}),filename:'交接清单.html'}).copy,'交接清单');
 assert.equal(classifyImportPayload({text:'<!doctype html><p>hi</p>',filename:'x.html'}).copy,'网页');
 // An ordinary table still imports, and a backup round-trips with only a block's id and fold kept.
 assert.equal(classifyImportPayload({text:'名称,类别\nexample.com,域名',filename:'mine.csv'}).kind,'csv');
 const backup=parseBoardBackup(JSON.stringify({blocks:[{id:'domain',width:50,density:'full',folded:true}],assets,featuredRepositoryIds:['x']}));
 assert.deepEqual(backup.board.blocks,[{id:'domain',folded:true}]);
 assert.ok(!('featuredRepositoryIds' in backup.board));
});
