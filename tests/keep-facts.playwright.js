// Run with the browser tool's filename option. Round 4 (2026-10-24): an account's form folds 找回 (two-step kind, where the
// authenticator, recovery codes and password are) and refuses a code typed there; a server's form folds 备份; 重要程度 sits in 更多;
// the detail shows them with the missing-recovery-codes hint and the snapshot tip; a domain names the accounts whose login mail is on
// it and warns when the registrar account uses it too; stopping a server without a backup elsewhere says to export first; the
// external tool takes and checks the same fields.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4317/');
 await page.evaluate(()=>{save=()=>{};
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  state={blocks:[{id:'google'},{id:'server'},{id:'domain'},{id:'subscription'}],deletedExternalIds:[],assets:[
   {id:'g',type:'google',name:'Google 主号',provider:'Google',account:'me@example.com'},
   {id:'vps',type:'server',name:'tokyo-vps',provider:'Vultr'},
   {id:'dom',type:'domain',name:'example.com',provider:'Cloudflare',account:'admin@example.com',date:day(10),dateKind:'expire'},
   {id:'sub',type:'subscription',name:'Fastmail',provider:'Fastmail',account:'me@example.com'}]};render();});
 // The account form: 找回 is folded, a code is refused, a place is kept.
 await page.evaluate(()=>assetForm('google','g'));
 check(await page.evaluate(()=>!document.querySelector('#asset-form .keep-fields').open),'找回 starts folded when empty');
 await page.click('#asset-form .keep-fields summary');
 await page.click('#asset-form [data-choice="mfa"][data-value="totp"]');
 await page.fill('#asset-form [name="mfaWhere"]','iPhone 上的 Authenticator');
 await page.fill('#asset-form [name="recoveryCodes"]','abcd1-ef2gh');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>!state.assets.find(a=>a.id==='g').mfa&&/验证码、恢复码或密钥/.test(document.querySelector('#asset-form [name="recoveryCodes"]').validationMessage)),'A recovery code itself is refused');
 await page.fill('#asset-form [name="recoveryCodes"]','');
 await page.click('#asset-form [data-choice="importance"][data-value="critical"]');
 await page.click('#asset-form [type="submit"]');
 const g=await page.evaluate(()=>{const a=state.assets.find(x=>x.id==='g');showDetail('g');return {a:{mfa:a.mfa,mfaWhere:a.mfaWhere,importance:a.importance,recoveryCodes:a.recoveryCodes},facts:Object.fromEntries([...document.querySelectorAll('#detail-content .fact')].map(f=>[f.firstElementChild.textContent,f.lastElementChild.textContent]))};});
 check(g.a.mfa==='totp'&&g.a.mfaWhere==='iPhone 上的 Authenticator'&&g.a.importance==='critical'&&g.a.recoveryCodes===undefined,'Saved: '+JSON.stringify(g.a));
 check(/两步验证：验证器 App · iPhone 上的 Authenticator/.test(g.facts['找回'])&&/恢复码没记放在哪/.test(g.facts['找回']),'The detail shows the line and the gap: '+JSON.stringify(g.facts));
 check(g.facts['重要程度']==='关键','and the importance');
 // A server: 备份 with a snapshot only, and the stop note.
 await page.evaluate(()=>assetForm('server','vps'));
 await page.click('#asset-form .keep-fields summary');
 await page.click('#asset-form [data-choice="backup"][data-value="snapshot"]');
 await page.click('#asset-form [type="submit"]');
 const vps=await page.evaluate(()=>{showDetail('vps');const f=[...document.querySelectorAll('#detail-content .fact')].find(x=>x.firstElementChild.textContent==='备份');const out={backup:f?.lastElementChild.textContent,tip:f?.lastElementChild.title};toggleStopped('vps');out.toast=document.querySelector('#toast').textContent;undo();return out;});
 check(vps.backup==='只有同平台快照 · 没试过恢复'&&/不等于异地备份/.test(vps.tip),'The server backup line: '+JSON.stringify(vps));
 check(/释放前先导出一份数据/.test(vps.toast),'Stopping says to export first: '+vps.toast);
 // A domain: the accounts on its mail, and the registrar account on its own mail while it expires.
 const dom=await page.evaluate(()=>{showDetail('dom');const f=[...document.querySelectorAll('#detail-content .fact')].find(x=>x.firstElementChild.textContent==='邮箱');return {mail:f?.lastElementChild.textContent,risks:[...document.querySelectorAll('#detail .link-risk')].map(p=>p.textContent)};});
 check(/2 个账号的登录邮箱在这个域名上：Google 主号、Fastmail/.test(dom.mail||''),'The domain names the accounts on its mail: '+dom.mail);
 check(dom.risks.some(t=>/过期后这个域名的邮箱收不到信：2 个账号的找回邮件会收不到，注册商账号也用这个邮箱登录/.test(t)),'and warns while it expires: '+dom.risks.join('|'));
 // The external tool: same fields, same checks.
 const call=(method,params)=>page.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
 check((await call('update',{id:'g',fields:{recoveryCodes:'1Password · 个人'}})).ok,'The tool sets a place');
 check(/验证码、恢复码或密钥/.test((await call('update',{id:'g',fields:{vault:'JBSWY3DPEHPK3PXP'}})).error||''),'and refuses a secret');
 check(/只用于/.test((await call('update',{id:'vps',fields:{mfa:'totp'}})).error||''),'and a field on the wrong type');
 check((await call('update',{id:'vps',fields:{backup:'elsewhere',restoreTestedOn:'2026-05-01'}})).ok,'and takes a backup');
 // A domain's DNS host and filing number are checked in the form; Google takes its 闲置账号管理器 answer.
 await page.evaluate(()=>{$('#modal').close();assetForm('domain','dom');});
 await page.fill('#asset-form [name="icp"]','12345');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>!state.assets.find(a=>a.id==='dom').icp&&/ICP/.test(document.querySelector('#asset-form [name="icp"]').validationMessage)),'A filing number without ICP is refused in the form');
 await page.fill('#asset-form [name="icp"]','');await page.fill('#asset-form [name="dnsHost"]','Cloudflare');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>{showDetail('dom');return [...document.querySelectorAll('#detail-content .fact')].some(f=>f.firstElementChild.textContent==='DNS 托管'&&f.lastElementChild.textContent==='Cloudflare');}),'The DNS host shows in the detail');
 await page.evaluate(()=>assetForm('google','g'));
 await page.click('#asset-form [data-choice="legacy"][data-value="none"]');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>state.assets.find(a=>a.id==='g').legacy==='none'),'Google keeps its 闲置账号管理器 answer');
 // A handover made over a year ago is said in 即将到来.
 const old=await page.evaluate(()=>{localStorage.setItem('assetboard-handover-at',new Date(Date.now()-400*86400000).toISOString());const out=handoverNoteHtml();localStorage.removeItem('assetboard-handover-at');return {out,none:handoverNoteHtml()};});
 check(/交接清单是 400 天前生成的/.test(old.out)&&old.none==='','The handover note: '+JSON.stringify(old));
 check(!errors.length,'Page errors: '+errors.join(' | '));
 return 'PASS';
}
