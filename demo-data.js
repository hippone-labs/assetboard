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
  '登录与用户':'Sign-in and users',
  '$6/月':'$6/mo',
  '$8/月':'$8/mo',
  '$12/月':'$12/mo',
  '$20/月':'$20/mo',
  '$10/月':'$10/mo',
  '$30/月':'$30/mo',
  '$100/月':'$100/mo',
  '$14.98 / 年':'$14.98 / yr',
  '$12 / 年':'$12 / yr',
  '$96 / 年':'$96 / yr',
  '免费':'Free'
 }:null,t=text=>en&&Object.hasOwn(en,text)?en[text]:text;
 const pad=n=>String(n).padStart(2,'0'),day=offset=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
 const base={account:'',source:'manual',art:'generic',cost:'未知',url:'',notes:t('演示数据')};
 const repos=['atlas-ui','notes-api','pixel-kit','studio-site','ledger-cli','orbit-bot','paper-docs','glass-theme','tiny-queue','sample-ml','mock-store','field-guide','plain-auth','zen-timer'];
 const ago=days=>new Date(Date.now()-days*86400000).toISOString();
 // 实时状态 is Pro: without the Pro modules no server carries a probe link.
 const free=typeof proLoaded==='function'&&!proLoaded();
 // 仓库分支和 Actions as a sync with that feature on leaves them: one new branch, one failed run, one running; the run links are
 // never opened from the demo.
 const runAt=hours=>new Date(Date.now()-hours*3600000).toISOString().replace(/\.\d+Z$/,'Z');
 const repoDetails=(name,i)=>i>5?{}:{defaultBranch:'main',branches:['main','dev',...(i===0?['feat-grid']:[]),...(i===1?['fix-auth','release-2.1']:[])].sort(),branchesFrom:ago(40),
  branchSeen:Object.fromEntries(['main','dev','feat-grid','fix-auth','release-2.1'].map(b=>[b,b==='feat-grid'?ago(2):ago(40)])),repoDenied:[],
  ciRun:{state:['success','failure','running'][i]||'success',name:'CI',branch:i===1?'fix-auth':'main',event:'push',at:runAt([5,3,0.1][i]??30),url:`https://github.com/acme-labs/${name}/actions/runs/${1000+i}`}};
 const repoRecord=(name,i)=>({...base,id:'demo-r'+i,type:'repository',name:'acme-labs/'+name,provider:'GitHub',account:'acme-labs',purpose:t('代码仓库'),source:'github',externalId:'demo-'+i,syncStatus:i%3?'私有仓库':'公开仓库',event:i%3?'私有仓库':'公开仓库',updatedAt:new Date(Date.now()-i*86400000*3).toISOString(),pushedAt:new Date(Date.now()-i*86400000*5).toISOString(),...repoDetails(name,i)});
 const assets=[
  {...base,id:'demo-d1',updatedAt:ago(3),type:'domain',name:'studio.example.com',provider:'Namecheap',purpose:t('工作室主站'),date:day(12),dateKind:'expire',cycle:'yearly'},
  {...base,id:'demo-d2',updatedAt:ago(1),type:'domain',name:'notes.example.org',provider:'Namecheap',purpose:t('笔记站点'),date:day(160),dateKind:'expire',cycle:'yearly',cost:t('$12 / 年')},
  {...base,id:'demo-d3',createdAt:ago(200),updatedAt:ago(20),type:'domain',name:'shop.example.net',provider:'Cloudflare',purpose:t('电商试验'),date:day(-2),dateKind:'expire'},
  {...base,id:'demo-d4',updatedAt:ago(40),type:'domain',name:'old-landing.example.com',provider:'Namecheap',purpose:t('旧落地页'),hiddenAt:'2026-01-01T00:00:00Z'},
  {...base,id:'demo-s1',updatedAt:ago(2),type:'server',name:'tokyo-vps',provider:'Vultr',purpose:t('API 服务'),host:'203.0.113.10',ips:['203.0.113.10','2001:db8::10'],sshUser:'deploy',date:day(26),dateKind:'renew',cycle:'monthly',cost:t('$6/月')},
  // The full edition reads this one over SSH 直读 (made-up output, never ssh), linked by hand: a hand link wins over the demo panel.
  {...base,id:'demo-s2',createdAt:ago(200),updatedAt:ago(9),type:'server',name:'frankfurt-vps',provider:'Hetzner',purpose:t('备份节点'),host:'198.51.100.24',ips:['198.51.100.24'],sshPort:'2222',date:day(90),dateKind:'renew',cycle:'yearly',...(free?{}:{probeLink:{source:'ssh',id:'frankfurt-vps'}})},
  // The full edition's demo probe calls it nas-home, so it is linked by hand (probe-data.js probeDemoAnswer).
  {...base,id:'demo-s3',updatedAt:ago(30),type:'server',name:'home-nas',provider:t('自建'),purpose:t('照片备份'),ips:['192.0.2.20'],...(free?{}:{probeLink:{source:'demo-probe',id:'cf3'}})},
  {...base,id:'demo-u1',createdAt:ago(200),updatedAt:ago(6),type:'subscription',name:'Notes Pro',provider:'Acme',purpose:t('写作'),date:day(-25),dateKind:'renew',cycle:'monthly',cost:t('$8/月')},
  {...base,id:'demo-u2',updatedAt:ago(15),type:'subscription',name:'Design Studio',provider:'Acme',purpose:t('界面设计'),date:day(48),dateKind:'renew',cycle:'yearly',cost:t('$96 / 年')},
  {...base,id:'demo-u3',updatedAt:ago(7),type:'subscription',name:'Acme Cloud',provider:'Acme',purpose:t('云账号'),date:day(70),dateKind:'renew',cycle:'monthly',cost:t('$12/月')},
  {...base,id:'demo-a1',createdAt:ago(200),updatedAt:ago(4),type:'ai',name:'AI Pro',provider:'Acme AI',account:'someone@example.net',date:day(-21),dateKind:'renew',cycle:'monthly',cost:t('$20/月')},
  // AI 额度 (ai-usage-view.js aiUsageDemo): plans the demo's made-up readings land on, by vendor. Copilot has not been used for weeks.
  {...base,id:'demo-a2',createdAt:ago(120),updatedAt:ago(8),type:'ai',name:'Claude Max',provider:'Anthropic',date:day(11),dateKind:'renew',cycle:'monthly',cost:t('$100/月')},
  {...base,id:'demo-a3',createdAt:ago(90),updatedAt:ago(10),type:'ai',name:'ChatGPT Plus',provider:'OpenAI',date:day(4),dateKind:'renew',cycle:'monthly',cost:t('$20/月')},
  {...base,id:'demo-a4',createdAt:ago(150),updatedAt:ago(19),type:'ai',name:'GitHub Copilot Pro',provider:'GitHub Copilot',date:day(6),dateKind:'renew',cycle:'monthly',cost:t('$10/月')},
  {...base,id:'demo-a5',createdAt:ago(60),updatedAt:ago(14),type:'ai',name:'Grok Premium',provider:'Grok',date:day(18),dateKind:'renew',cycle:'monthly',cost:t('$30/月')},
  {...base,id:'demo-c1',updatedAt:ago(5),type:'bankcard',name:t('Visa 信用卡'),provider:t('示例银行'),network:'Visa',last4:'4242',region:'CN',date:day(150),dateKind:'expire'},
  {...base,id:'demo-c2',updatedAt:ago(11),type:'bankcard',name:t('多币种借记卡'),provider:t('示例钱包'),network:'Mastercard',last4:'8812',date:day(24),dateKind:'expire'},
  {...base,id:'demo-g1',updatedAt:ago(13),type:'google',name:t('美区 Google 账号'),provider:'Google',account:'someone@example.com',region:'US'},
  {...base,id:'demo-db1',updatedAt:ago(12),type:'database',name:'postgres-main',provider:'ManagedDB',purpose:t('主库'),port:'5432',date:day(70),dateKind:'renew',cycle:'yearly'},
  // 平台状态 (实时状态): a free Supabase project that paused, with its sleep rule and a keep-alive in its detail. platform-data.js
  // platformDemo answers for it. A database is no card in 全景, so the demo's panorama stays as it is.
  {...base,id:'demo-db2',updatedAt:ago(20),type:'database',name:'notes-auth',provider:'Supabase',purpose:t('登录与用户'),cost:t('免费'),keepAlive:{url:'https://notes-api.example.com/health',every:1440}},
  ...repos.map(repoRecord)
 ];
 // Server relations: two VPS, one account, domains and repositories mounted on them, two orphans (v13).
 const wire=(child,server,meta)=>{const c=assets.find(a=>a.id===child),s=assets.find(a=>a.id===server);c.links=[...(c.links||[]),server];s.links=[...(s.links||[]),child];if(meta)c.linkMeta={...(c.linkMeta||{}),[server]:meta};};
 wire('demo-d1','demo-s1');wire('demo-d1','demo-s2',{role:'b'});wire('demo-d2','demo-s1',{proxied:true});wire('demo-d3','demo-s2');wire('demo-d4','demo-s1');
 wire('demo-r0','demo-s1');wire('demo-r1','demo-s1');wire('demo-r1','demo-s2');wire('demo-db1','demo-s1');
 wire('demo-u3','demo-s1');wire('demo-u3','demo-s2');
 // Cards (v22): one pays the cloud account, the AI plan and a domain; the other, close to expiry, pays two tools.
 for(const id of ['demo-u3','demo-a1','demo-d3'])wire(id,'demo-c1');for(const id of ['demo-u1','demo-u2'])wire(id,'demo-c2');for(const id of ['demo-a1','demo-u1'])wire(id,'demo-g1');
 // Money (v21): projects, payments with a price rise, a promotion, a free tier; Notes Pro and AI Pro have a charge waiting.
 // Each project gathers a domain, a repository and what it runs or pays for, so its view adds up to what the whole project costs.
 const set=(id,fields)=>Object.assign(assets.find(a=>a.id===id),fields);
 const paid=(paidOn,amount,currency,months,covers=paidOn,via='confirm')=>({id:'demo-pay-'+paidOn+amount,paidOn,amount,currency,months,covers,via,status:'paid'});
 for(const id of ['demo-d1','demo-r3','demo-u2'])set(id,{project:'studio'});
 for(const id of ['demo-d2','demo-r1','demo-db1','demo-s1','demo-u3'])set(id,{project:'notes-lab'});
 set('demo-s1',{payments:[paid(day(-64),5,'USD',1,day(-64)),paid(day(-34),6,'USD',1,day(-34)),paid(day(-4),6,'USD',1,day(-4))]});
 set('demo-d1',{cost:t('$14.98 / 年'),payments:[paid(day(-353),10.98,'USD',12,day(-353),'renew')]});
 set('demo-a1',{promotion:{start:day(-50),end:day(40),amount:10,regularAmount:20,currency:'USD'}});
 set('demo-db1',{cost:t('免费')});
 // Site icons (task 13): GitHub and one Namecheap domain have theirs, Hetzner's comes from a site the person named, Vultr failed,
 // Cloudflare and Google have none yet.
 const icon=(id,host)=>set(id,{siteIcon:window.assetboardDemoIcon(host),siteIconHost:host});
 for(const a of assets)if(a.type==='repository')icon(a.id,'github.com');
 icon('demo-d1','namecheap.com');icon('demo-s2','hetzner.example.com');icon('demo-db2','supabase.com');
 const block=id=>({id,folded:false});
 return {blocks:['domain','server','repository','subscription','ai','database','license'].map(block),assets,deletedExternalIds:[],cardOrder:{domain:['demo-d1']},featuredRepositoryIds:[],evidenceDecisions:{},iconSites:{'hetzner.com':'hetzner.example.com'}};
};
// The platforms' answers on the demo board (设置 › 连接, the import window): made-up resources in the shape the Mac app passes on, so
// connecting and picking can be tried. Nothing is sent anywhere. Each read after the first finds one more resource, as a platform does
// when something was bought or created since.
window.assetboardDemoConnect=function(message,board){
 const reads=window.assetboardDemoConnect.reads||(window.assetboardDemoConnect.reads={}),source=message.source||{cloudflareSync:'cloudflare',cloudflareDisconnect:'cloudflare',githubSync:'github',githubSyncLocal:'github',githubDisconnect:'github'}[message.action];
 if(/Disconnect$/.test(message.action))return {ok:true,disconnected:true,source};
 const n=reads[source]=(reads[source]||0)+1,more=(list,extra)=>n>1?[...list,...extra.slice(0,n-1)]:list;
 const pad=v=>String(v).padStart(2,'0'),day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
 const ago=days=>new Date(Date.now()-days*86400000).toISOString();
 if(source==='cloudflare')return {ok:true,queriedKinds:['zone','pages','workers','r2'],resources:more([
  {kind:'zone',id:'z1',name:'launch.example.dev',account:'Acme Labs',status:'active'},
  {kind:'zone',id:'z2',name:'mail.example.org',account:'Acme Labs',status:'active'},
  {kind:'registrar',id:'Acme Labs:launch.example.dev',name:'launch.example.dev',account:'Acme Labs',expiresAt:day(210),autoRenew:true},
  {kind:'pages',id:'p1',name:'notes-web',account:'Acme Labs',status:'active'},
  {kind:'workers',id:'w1',name:'link-shortener',account:'Acme Labs'},
  {kind:'r2',id:'r1',name:'photo-archive',account:'Acme Labs'}],[{kind:'zone',id:'z3',name:'beta.example.app',account:'Acme Labs',status:'pending'}])};
 if(source==='github'){
  const have=(board?.assets||[]).filter(a=>a.source==='github').map(a=>({id:a.externalId,name:a.name,owner:a.account||'acme-labs',private:a.event==='私有仓库',archived:false,url:a.url||'',updatedAt:a.updatedAt||ago(3),pushedAt:a.pushedAt||ago(5),defaultBranch:a.defaultBranch||'main'}));
  const fresh=['weather-cli','invoice-kit','docs-site','status-page','dotfiles'].map((name,i)=>({id:'demo-new-'+i,name:'acme-labs/'+name,owner:'acme-labs',private:i%2===1,archived:false,description:'',url:'',updatedAt:ago(i+1),pushedAt:ago(i+2),defaultBranch:'main'}));
  return {ok:true,connected:true,accounts:['acme-labs'],repositories:[...have,...more(fresh.slice(0,4),fresh.slice(4))]};
 }
 if(source==='namecheap'||source==='porkbun')return {ok:true,source,account:'acme',complete:true,domains:more([
  {id:'pb1',name:'example.app',expires:day(320),autoRenew:true,status:'active'},
  {id:'pb2',name:'side.example.io',expires:day(45),autoRenew:false,status:'active'},
  {id:'pb3',name:'api.example.dev',expires:day(190),autoRenew:true,status:'active'}],[{id:'pb4',name:'newidea.example.com',expires:day(365),autoRenew:true,status:'active'}])};
 const cloud={
  hetzner:[{kind:'server',id:'101',name:'hel1-worker',ips:['203.0.113.41'],region:'FI',price:{currency:'EUR',value:4.51},status:'running',detail:'CX22'},
   {kind:'server',id:'102',name:'fsn1-db',ips:['203.0.113.42'],region:'DE',price:{currency:'EUR',value:7.59},status:'running',detail:'CX32'},
   {kind:'server',id:'103',name:'nbg1-backup',ips:['203.0.113.43'],region:'DE',price:{currency:'EUR',value:3.79},status:'off',detail:'CX11'},
   {kind:'server',id:'104',name:'ash-edge',ips:['203.0.113.44'],region:'US',price:{currency:'EUR',value:4.51},status:'running',detail:'CPX11'}],
  digitalocean:[{kind:'droplet',id:'201',name:'sgp-api',ips:['198.51.100.61'],region:'SG',price:{currency:'USD',value:6},status:'active'},
   {kind:'app',id:'202',name:'landing-app',status:'active'},{kind:'database',id:'203',name:'pg-cluster',status:'online'},
   {kind:'droplet',id:'204',name:'sfo-runner',ips:['198.51.100.64'],region:'US',price:{currency:'USD',value:12},status:'active'}],
  vercel:[{kind:'project',id:'prj_1',name:'studio-web',status:'ready'},{kind:'project',id:'prj_2',name:'notes-preview',status:'ready'},
   {kind:'domain',id:'example.studio',name:'example.studio',expires:day(260),autoRenew:true},{kind:'project',id:'prj_3',name:'docs-v2',status:'ready'}]
 }[source];
 return cloud?{ok:true,source,account:'acme',complete:true,resources:more(cloud.slice(0,3),cloud.slice(3))}:{ok:false,source,error:'demo'};
};
// 设置 › MCP on the demo board: tools that are set up and have called, and a made-up 操作记录 on the demo records. Nothing calls.
window.assetboardDemoAgentConfigs=function(){
 return [['claude-code','~/.claude.json',true],['codex','~/.codex/config.toml',true],['cursor','~/.cursor/mcp.json',true],['claude-desktop','~/Library/Application Support/Claude/claude_desktop_config.json',false],['vscode','~/Library/Application Support/Code/User/mcp.json',false]]
  .map(([id,path,configured])=>({id,path,found:true,configured}));
};
window.assetboardDemoAgentLog=function(){
 const at=minutes=>new Date(Date.now()-minutes*60000).toISOString(),pad=n=>String(n).padStart(2,'0'),day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
 const claude={id:'claude-code',name:'Claude Code',by:'clientInfo',version:'2.1.4',reported:'claude-code'},codex={id:'codex',name:'Codex',by:'clientInfo',version:'0.58.0',reported:'codex-mcp-client'},grok={id:'grok',name:'Grok',by:'process'},unknown={id:'unknown',name:'未知客户端',by:'none'};
 const row=(minutes,client,method,tool,kind,rest={})=>({id:'demo-log-'+minutes,at:at(minutes),client,via:'mcp',method,tool,kind,ok:true,...rest});
 const en=typeof appLang!=='undefined'&&appLang==='en',t=(zh,english)=>en?english:zh;
 return [
  row(4,claude,'update','update_asset','write',{changes:[{op:'update',id:'demo-s1',name:'tokyo-vps',type:'server',fields:[{field:'date',from:day(26),to:day(56)},{field:'cost',from:t('$6/月','$6/mo'),to:t('$7/月','$7/mo')},{field:'notes',from:'',to:t('续了一个月，涨到 $7','Renewed for a month, now $7')}]}]}),
  row(6,claude,'get','get_asset','read',{params:{id:'demo-s1'},changes:[{op:'read',id:'demo-s1',name:'tokyo-vps',type:'server'}]}),
  row(7,claude,'list','list_assets','read',{params:{type:'server'},count:3}),
  row(38,codex,'add','add_assets','write',{params:{items:'2'},changes:[{op:'add',id:'demo-new-1',name:'status.example.dev',type:'domain',fields:[{field:'name',from:'',to:'status.example.dev'},{field:'provider',from:'',to:'Porkbun'},{field:'date',from:'',to:day(300)}]},{op:'add',id:'demo-new-2',name:'Uptime Basic',type:'subscription',fields:[{field:'name',from:'',to:'Uptime Basic'},{field:'cost',from:'',to:t('$5/月','$5/mo')}]}]}),
  row(41,codex,'update','update_asset','write',{ok:false,error:t('找不到资产 demo-x9','No asset demo-x9')}),
  row(43,codex,'deleteMany','request_delete_assets','write',{params:{ids:'1'},changes:[{op:'ask-delete',id:'demo-d4',name:'old-landing.example.com',type:'domain'}]}),
  row(95,grok,'totals','get_cost_totals','read',{params:{currency:'USD'}}),
  row(130,unknown,'list','list_assets','read',{params:{query:'vps'},count:2}),
  row(1500,claude,'updateMany','update_assets','write',{params:{updates:'2'},changes:[{op:'update',id:'demo-r1',name:'acme-labs/notes-api',type:'repository',fields:[{field:'project',from:'',to:'notes-lab'}]},{op:'update',id:'demo-db1',name:'postgres-main',type:'database',fields:[{field:'project',from:'',to:'notes-lab'}]}]}),
  row(1520,claude,'list','list_assets','read',{params:{type:'repository'},count:14})
 ];
};
window.assetboardDemoAgentClients=function(){
 const at=minutes=>new Date(Date.now()-minutes*60000).toISOString();
 return [{id:'claude-code',name:'Claude Code',first:at(9000),last:at(4),calls:46,by:'clientInfo',version:'2.1.4'},{id:'codex',name:'Codex',first:at(4000),last:at(38),calls:12,by:'clientInfo',version:'0.58.0'},{id:'grok',name:'Grok',first:at(95),last:at(95),calls:1,by:'process'},{id:'unknown',name:'未知客户端',first:at(130),last:at(130),calls:1,by:'none'}];
};
