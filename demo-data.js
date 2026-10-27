// Fictional demo board for `--demo` (Mac app) and `?demo` (browser). No real assets, accounts or tokens; never saved.
// Built-in demo icons: a letter on a coloured square, drawn here and never a vendor's mark. Demo mode's 获取网站图标 answers with these
// instead of the network. Some demo platforms already have one, one has a site of its own (example.com) and one failed this launch.
window.assetboardDemoIcon=function(host){
 const name=String(host||'?').replace(/^www\./,''),cache=window.assetboardDemoIcon.cache||(window.assetboardDemoIcon.cache=new Map());if(cache.has(name))return cache.get(name);
 let n=0;for(const ch of name)n=(n*31+ch.charCodeAt(0))>>>0;
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
 g.fillStyle=['#3b6fd8','#2f8f6b','#b0533c','#7a4fc4','#a8741a','#2a7f9e'][n%6];g.beginPath();if(g.roundRect)g.roundRect(0,0,64,64,14);else g.rect(0,0,64,64);g.fill();
 g.fillStyle='#fff';g.font='600 34px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(name[0].toUpperCase(),32,35);
 const url=c.toDataURL('image/png');cache.set(name,url);return url;
};
window.assetboardDemoIconFailures={'vultr.com':tr('官网没有可下载的图标')};
window.assetboardDemoBoard=function(){
 // The English demo: the same records with English text (?lang=en, or the Mac app in English). Stored words the code compares,
 // such as cost 未知 and a repository's 私有仓库, stay as they are; amounts and cycles read the same in either cost text.
 const en=typeof appLang!=='undefined'&&appLang==='en'?{
  '演示数据':'Demo data',
  '代码仓库':'Code repository',
  '工作室主站':'Studio website',
  '笔记站点':'Notes site',
  '电商试验':'Shop experiment',
  '旧落地页':'Old landing page',
  'API 服务':'API service',
  '备份节点':'Backup node',
  '自建':'Self-hosted',
  '照片备份':'Photo backup',
  '写作':'Writing',
  '界面设计':'UI design',
  '云账号':'Cloud account',
  'Visa 信用卡':'Visa credit card',
  '示例银行':'Example Bank',
  '多币种借记卡':'Multi-currency debit card',
  '示例钱包':'Example Wallet',
  '美区 Google 账号':'US Google account',
  '主库':'Primary database',
  '$6/月':'$6/mo',
  '$8/月':'$8/mo',
  '$12/月':'$12/mo',
  '$20/月':'$20/mo',
  '$14.98 / 年':'$14.98 / yr',
  '免费':'Free'
 }:null,t=text=>en&&Object.hasOwn(en,text)?en[text]:text;
 const pad=n=>String(n).padStart(2,'0'),day=offset=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
 const base={account:'',source:'manual',art:'generic',cost:'未知',url:'',notes:t('演示数据')};
 const repos=['atlas-ui','notes-api','pixel-kit','studio-site','ledger-cli','orbit-bot','paper-docs','glass-theme','tiny-queue','sample-ml','mock-store','field-guide','plain-auth','zen-timer'];
 const ago=days=>new Date(Date.now()-days*86400000).toISOString();
 // The free edition has no GitHub sync, so its demo does not pretend to: five repositories written down by hand, no account tag,
 // and the board's first screen stays on domains, servers and costs.
 const free=typeof proLoaded==='function'&&!proLoaded();
 const repoRecord=(name,i)=>free?{...base,id:'demo-r'+i,type:'repository',name,provider:'GitHub',purpose:t('代码仓库'),updatedAt:new Date(Date.now()-i*86400000*3).toISOString(),pushedAt:new Date(Date.now()-i*86400000*3).toISOString()}
  :{...base,id:'demo-r'+i,type:'repository',name:'acme-labs/'+name,provider:'GitHub',account:'acme-labs',purpose:t('代码仓库'),source:'github',externalId:'demo-'+i,syncStatus:i%3?'私有仓库':'公开仓库',event:i%3?'私有仓库':'公开仓库',updatedAt:new Date(Date.now()-i*86400000*3).toISOString(),pushedAt:new Date(Date.now()-i*86400000*5).toISOString()};
 const assets=[
  {...base,id:'demo-d1',updatedAt:ago(3),type:'domain',name:'example-studio.com',provider:'Namecheap',purpose:t('工作室主站'),date:day(12),dateKind:'expire',cycle:'yearly'},
  {...base,id:'demo-d2',updatedAt:ago(1),type:'domain',name:'notes-lab.dev',provider:'Namecheap',purpose:t('笔记站点'),date:day(160),dateKind:'expire',cycle:'yearly'},
  {...base,id:'demo-d3',createdAt:ago(200),updatedAt:ago(20),type:'domain',name:'sample-shop.cn',provider:'Cloudflare',purpose:t('电商试验'),date:day(-2),dateKind:'expire'},
  {...base,id:'demo-d4',updatedAt:ago(40),type:'domain',name:'old-landing.io',provider:'Namecheap',purpose:t('旧落地页'),hiddenAt:'2026-01-01T00:00:00Z'},
  {...base,id:'demo-s1',updatedAt:ago(2),type:'server',name:'tokyo-vps',provider:'Vultr',purpose:t('API 服务'),host:'203.0.113.10',ips:['203.0.113.10','2001:db8::10'],sshUser:'deploy',date:day(26),dateKind:'renew',cycle:'monthly',cost:t('$6/月')},
  // The full edition reads this one over SSH 直读 (made-up output, never ssh), linked by hand: a hand link wins over the demo panel.
  {...base,id:'demo-s2',createdAt:ago(200),updatedAt:ago(9),type:'server',name:'frankfurt-vps',provider:'Hetzner',purpose:t('备份节点'),host:'198.51.100.24',ips:['198.51.100.24'],sshPort:'2222',date:day(90),dateKind:'renew',cycle:'yearly',...(free?{}:{probeLink:{source:'ssh',id:'frankfurt-vps'}})},
  // The full edition's demo probe calls it nas-home, so it is linked by hand (probe-data.js probeDemoAnswer).
  {...base,id:'demo-s3',updatedAt:ago(30),type:'server',name:'home-nas',provider:t('自建'),purpose:t('照片备份'),ips:['192.168.1.20'],...(free?{}:{probeLink:{source:'demo-probe',id:'cf3'}})},
  {...base,id:'demo-u1',createdAt:ago(200),updatedAt:ago(6),type:'subscription',name:'Notes Pro',provider:'Acme',purpose:t('写作'),date:day(-25),dateKind:'renew',cycle:'monthly',cost:t('$8/月')},
  {...base,id:'demo-u2',updatedAt:ago(15),type:'subscription',name:'Design Studio',provider:'Acme',purpose:t('界面设计'),date:day(48),dateKind:'renew',cycle:'yearly'},
  {...base,id:'demo-u3',updatedAt:ago(7),type:'subscription',name:'Acme Cloud',provider:'Acme',purpose:t('云账号'),date:day(70),dateKind:'renew',cycle:'monthly',cost:t('$12/月')},
  {...base,id:'demo-a1',createdAt:ago(200),updatedAt:ago(4),type:'ai',name:'AI Pro',provider:'Acme AI',account:'someone@example.net',date:day(-21),dateKind:'renew',cycle:'monthly',cost:t('$20/月')},
  {...base,id:'demo-c1',updatedAt:ago(5),type:'bankcard',name:t('Visa 信用卡'),provider:t('示例银行'),network:'Visa',last4:'4242',region:'CN',date:day(150),dateKind:'expire'},
  {...base,id:'demo-c2',updatedAt:ago(11),type:'bankcard',name:t('多币种借记卡'),provider:t('示例钱包'),network:'Mastercard',last4:'8812',date:day(24),dateKind:'expire'},
  {...base,id:'demo-g1',updatedAt:ago(13),type:'google',name:t('美区 Google 账号'),provider:'Google',account:'someone@example.com',region:'US'},
  {...base,id:'demo-db1',updatedAt:ago(12),type:'database',name:'postgres-main',provider:'ManagedDB',purpose:t('主库'),port:'5432',date:day(70),dateKind:'renew',cycle:'yearly'},
  ...(free?repos.slice(0,5):repos).map(repoRecord)
 ];
 // Server relations: two VPS, one account, domains and repositories mounted on them, two orphans (v13).
 const wire=(child,server,meta)=>{const c=assets.find(a=>a.id===child),s=assets.find(a=>a.id===server);c.links=[...(c.links||[]),server];s.links=[...(s.links||[]),child];if(meta)c.linkMeta={...(c.linkMeta||{}),[server]:meta};};
 wire('demo-d1','demo-s1');wire('demo-d1','demo-s2',{role:'b'});wire('demo-d2','demo-s1',{proxied:true});wire('demo-d3','demo-s2');wire('demo-d4','demo-s1');
 wire('demo-r0','demo-s1');wire('demo-r1','demo-s1');wire('demo-r1','demo-s2');wire('demo-db1','demo-s1');
 wire('demo-u3','demo-s1');wire('demo-u3','demo-s2');
 // Cards (v22): one pays the cloud account, the AI plan and a domain; the other, close to expiry, pays two tools.
 for(const id of ['demo-u3','demo-a1','demo-d3'])wire(id,'demo-c1');for(const id of ['demo-u1','demo-u2'])wire(id,'demo-c2');for(const id of ['demo-a1','demo-u1'])wire(id,'demo-g1');
 // Money (v21): projects, payments with a price rise, a promotion, a free tier; Notes Pro and AI Pro have a charge waiting.
 const set=(id,fields)=>Object.assign(assets.find(a=>a.id===id),fields);
 const paid=(paidOn,amount,currency,months,covers=paidOn,via='confirm')=>({id:'demo-pay-'+paidOn+amount,paidOn,amount,currency,months,covers,via,status:'paid'});
 for(const id of ['demo-d1','demo-r3','demo-u2'])set(id,{project:'studio'});
 for(const id of ['demo-d2','demo-r1','demo-db1','demo-s1'])set(id,{project:'notes-lab'});
 set('demo-s1',{payments:[paid(day(-64),5,'USD',1,day(-64)),paid(day(-34),6,'USD',1,day(-34)),paid(day(-4),6,'USD',1,day(-4))]});
 set('demo-d1',{cost:t('$14.98 / 年'),payments:[paid(day(-353),10.98,'USD',12,day(-353),'renew')]});
 set('demo-a1',{promotion:{start:day(-50),end:day(40),amount:10,regularAmount:20,currency:'USD'}});
 set('demo-db1',{cost:t('免费')});
 // Site icons (task 13): GitHub and one Namecheap domain have theirs, Hetzner's comes from a site the person named, Vultr failed,
 // Cloudflare and Google have none yet.
 const icon=(id,host)=>set(id,{siteIcon:window.assetboardDemoIcon(host),siteIconHost:host});
 for(const a of assets)if(a.type==='repository')icon(a.id,'github.com');
 icon('demo-d1','namecheap.com');icon('demo-s2','hetzner.example.com');
 const block=id=>({id,folded:false});
 return {blocks:['domain','server','repository','subscription','ai','database','license'].map(block),assets,deletedExternalIds:[],cardOrder:{domain:['demo-d1']},featuredRepositoryIds:[],evidenceDecisions:{},iconSites:{'hetzner.com':'hetzner.example.com'}};
};
