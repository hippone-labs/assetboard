// Run with the browser tool's filename option. What external tools are given (app.js agentAsset / agentSees, against a stubbed Mac
// app): IPs, SSH hosts and users, phone numbers and mail addresses masked and bank cards and phone numbers left out until the two
// switches under 设置 › 功能 › 外部工具接入 say otherwise; search on the real values; masked values never written back; the MCP
// panel says so. Also the export dialog: 只写类别和天数 for the calendar, the iCloud line, the handover mask's label. All names,
// addresses and numbers are made up.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,90));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const soon=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 await p.addInitScript(soon=>{
  window.__sent=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(msg){window.__sent.push(JSON.parse(JSON.stringify(msg)));if(msg.action==='save')setTimeout(()=>window.assetboardSaved?.(msg.sequence,true),5);if(msg.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
  window.__ASSETBOARD_NATIVE__={pro:{on:true,kind:'licensed',id:'K3Q7NVHM'},data:{blocks:[{id:'server'},{id:'subscription'},{id:'bankcard'},{id:'phone'}],assets:[
   {id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',source:'manual',art:'generic',account:'ops@example.org',ips:['203.0.113.10','2001:db8::10'],host:'vps-a.example.com',sshUser:'deploy',sshPort:'2222',notes:'invoices to finance@example.net'},
   {id:'x1',type:'subscription',name:'Editor Pro',provider:'Editor',source:'manual',art:'generic',account:'me@example.com',cost:'$10 / 月',cycle:'monthly',dateKind:'renew',date:'2099-01-05',links:['c1']},
   {id:'c1',type:'bankcard',name:'Visa 主卡',provider:'Example Bank',source:'manual',art:'generic',last4:'4242',network:'Visa',date:soon,dateKind:'expire',links:['x1']},
   {id:'p1',type:'phone',name:'主号',provider:'Carrier',source:'manual',art:'generic',phone:'+1 555 0100 1234'}],deletedExternalIds:[]},
   probeSources:[],cloudflareConnected:false,githubConnected:false,gmailConfigured:false,cliPath:'/Applications/Assetboard.app/Contents/MacOS/assetboard-cli'};
 },soon);
 const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof assetboardAgent==='function');

  // By default: addresses and contact details masked, bank cards and phone numbers withheld.
  let r=await call('list');
  check(r.ok&&r.result.total===2&&r.result.withheld===2&&r.result.assets.every(a=>!['bankcard','phone'].includes(a.type)),'list leaves bank cards and phone numbers out and counts them: '+JSON.stringify(r.result.withheld));
  const s1=r.result.assets.find(a=>a.id==='s1');
  check(JSON.stringify(s1.ips)===JSON.stringify(['203.0.•••.•••','2001:db8:••••'])&&s1.host==='v••••••.com'&&s1.sshUser==='d•••••'&&s1.account==='op•••@example.org'&&s1.notes==='invoices to fi•••@example.net','A server comes masked: '+JSON.stringify(s1));
  check(s1.name==='tokyo-vps'&&s1.sshPort==='2222'&&['ips','host','sshUser','account','notes'].every(k=>s1.masked.includes(k)),'Names stay; masked lists the fields: '+JSON.stringify(s1.masked));
  const reply=JSON.stringify(r);
  for(const leak of ['203.0.113.10','2001:db8::10','vps-a.example.com','deploy','ops@','finance@','Visa 主卡','4242','555 0100','主号'])check(!reply.includes(leak),'list carries '+leak);
  r=await call('get',{id:'x1'});
  const rel=r.result.relations[0];
  check(rel.withheld===true&&!('id' in rel)&&!('name' in rel)&&rel.type==='bankcard'&&rel.label,'A relation to a bank card says only its kind: '+JSON.stringify(rel));
  check(r.result.risks?.length===1&&!/4242|Visa/.test(r.result.risks[0])&&/付款卡/.test(r.result.risks[0]),'The risk names no card: '+JSON.stringify(r.result.risks));
  check(/设置/.test((await call('get',{id:'c1'})).error)&&/设置/.test((await call('update',{id:'p1',fields:{notes:'x'}})).error),'get and update of a withheld record are refused, pointing at 设置');
  check(/找不到/.test((await call('delete',{id:'c1'})).error)&&/找不到/.test((await call('update',{id:'x1',fields:{linkTo:['p1']}})).error),'Nor can it be deleted or linked to');
  // A host from ~/.ssh/config keeps its user in account too: masked there as well, and written back unchanged.
  await p.evaluate(()=>state.assets.push({id:'ssh-host-lab',type:'server',name:'lab',provider:'SSH',source:'ssh',art:'generic',account:'deploy',sshUser:'deploy',host:'lab.example.com',sshPort:'22'}));
  r=await call('get',{id:'ssh-host-lab'});
  check(r.result.account==='d•••••'&&r.result.masked.includes('account')&&!JSON.stringify(r.result).includes('deploy'),'An SSH user standing in account is masked: '+JSON.stringify(r.result.account));
  check((await call('update',{id:'ssh-host-lab',fields:{account:r.result.account,purpose:'lab'}})).ok&&await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='ssh-host-lab');const ok=a.account==='deploy'&&a.purpose==='lab';state.assets=state.assets.filter(x=>x!==a);return ok;}),'Its masked account written back changes nothing');
  check((await call('totals',{currency:'USD'})).result.withheld===2&&!(await call('charges')).result.charges.some(c=>c.id==='c1'),'Totals say what was left out');

  // Search matches the real values; a masked value sent back as read changes nothing, any other one is refused.
  r=await call('list',{query:'203.0.113.10'});
  check(r.result.total===1&&r.result.assets[0].ips[0]==='203.0.•••.•••','Search by the real address finds the record, still masked');
  check((await call('list',{query:'finance@example.net'})).result.total===1&&(await call('list',{query:'vps-a'})).result.total===1,'Search by the real mail and host');
  const {id,masked,typeName,billingType,billingTypeSet,hidden,hasCustomIcon,hasSiteIcon,relations,...fields}=s1;
  r=await call('update',{id:'s1',fields:{...fields,purpose:'web'}});
  check(r.ok&&await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='s1');return a.ips[0]==='203.0.113.10'&&a.host==='vps-a.example.com'&&a.sshUser==='deploy'&&a.account==='ops@example.org'&&a.notes==='invoices to finance@example.net'&&a.purpose==='web';}),'A read record written back keeps the real values: '+JSON.stringify(r.error||''));
  check(/遮蔽符号/.test((await call('update',{id:'s1',fields:{notes:'root on 203.0.•••.•••'}})).error),'A changed value holding the mark is refused');
  // Adding a phone number still works; the agent is told its id, but cannot read it back.
  r=await call('add',{items:[{name:'副号',type:'phone',phone:'+1 555 0100 9999'}]});
  check(r.ok&&r.result.added.length===1&&/设置/.test((await call('get',{id:r.result.added[0].id})).error),'An added phone number is not read back');

  // 设置 › 功能: two switches under 外部工具接入, off, kept with the feature switches.
  await p.evaluate(()=>prefsDialog('features'));
  check(await p.locator('#modal .prefs-sub input[data-id="agentAddresses"]').count()===1&&await p.locator('#modal .prefs-sub input[data-id="agentCards"]').count()===1,'Both switches sit under 外部工具接入');
  check(await p.evaluate(()=>!$('#modal input[data-id="agentAddresses"]').checked&&!$('#modal input[data-id="agentCards"]').checked),'Both start off');
  await p.click('#modal input[data-id="agentAddresses"]');
  r=await call('get',{id:'s1'});
  check(r.result.ips[0]==='203.0.113.10'&&r.result.host==='vps-a.example.com'&&r.result.sshUser==='deploy'&&!('masked' in r.result),'Switched on: real values: '+JSON.stringify(r.result.ips));
  check(/withheld|设置/.test((await call('get',{id:'c1'})).error),'Cards stay withheld');
  await p.click('#modal input[data-id="agentCards"]');
  r=await call('get',{id:'c1'});
  check(r.ok&&r.result.last4==='4242'&&!('withheld' in (await call('list')).result),'Second switch: cards and numbers are given');
  check(await p.evaluate(()=>{const v=JSON.parse(localStorage.getItem('assetboard-features-v1'));return v.agentAddresses===true&&v.agentCards===true&&!('agentAddresses' in state);}),'Kept with the feature switches, not in the board');
  await p.click('#modal input[data-id="agent"]');
  check(await p.locator('#modal input[data-id="agentAddresses"]').count()===0,'With 外部工具接入 off, its options are not shown');
  await p.click('#modal input[data-id="agent"]');
  await p.click('#modal input[data-id="agentAddresses"]');await p.click('#modal input[data-id="agentCards"]');
  check((await call('get',{id:'s1'})).result.host==='v••••••.com'&&/设置/.test((await call('get',{id:'c1'})).error),'Off again: masked and withheld');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);

  // The MCP panel: the channel is local, the tool sends what it reads on, and what is masked; a link to the switches.
  await p.evaluate(()=>agentSetupDialog());
  check(await p.evaluate(()=>{const t=$('#modal-content').textContent;return t.includes('模型服务商')&&t.includes('遮住')&&!!$('#modal-content [data-action="prefs"][data-id="features"]');}),'The MCP panel says what is masked');
  await p.click('#modal-content [data-action="prefs"][data-id="features"]');
  check(await p.evaluate(()=>$('#modal').dataset.view==='prefs'&&!$('#prefs-pane-features').hidden),'Its link opens 设置 › 功能');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);

  // Export: the calendar's 只写类别和天数 and the iCloud line; the handover mask names what it hides.
  await p.evaluate(()=>exportDialog());
  check(await p.evaluate(()=>/iCloud 日历不做端到端加密/.test($('#modal-content').textContent)&&!!$('#ics-minimal')&&!$('#ics-minimal').checked),'The calendar card has the option and the line');
  check(await p.evaluate(()=>/遮住名称、账号、地址、备注和链接/.test($('#modal-content').textContent)),'The handover mask names what it hides');
  await p.check('#ics-minimal');await p.click('[data-action="export-ics"]');
  const file=await p.evaluate(()=>__sent.filter(m=>m.action==='saveFile').pop());
  const ics=file.text.replace(/\r\n /g,'');
  check(file.mime==='text/calendar'&&/SUMMARY:银行卡 到期/.test(ics)&&/SUMMARY:订阅与工具 扣款/.test(ics),'Category and kind only: '+ics.slice(0,400));
  for(const leak of ['Visa','Editor','Example Bank','me@example','$10','s1','x1','c1@'])check(!ics.includes(leak),'The minimal calendar carries '+leak);
  await p.evaluate(()=>{exportDialog();});await p.click('[data-action="export-ics"]');
  check((await p.evaluate(()=>__sent.filter(m=>m.action==='saveFile').pop().text)).includes('Editor Pro'),'Unticked: the full calendar');
  check(!errors.length,'page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: agent reads masked (IPs, host, SSH user, phone, mail) and bank cards and phone numbers withheld by default (list, get, relations, risks, totals, charges, delete, links); search on real values; masked values written back unchanged, others refused; two switches under 外部工具接入, kept per viewer, hidden while it is off; MCP panel copy and link; calendar 只写类别和天数 and the iCloud line; handover mask label';
}
