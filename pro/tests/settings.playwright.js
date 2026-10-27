// Run with the browser tool's filename option. 设置 (prefsDialog in app.js, features.js): the sidebar opens one panel with 通用, 功能
// and 连接; probes start switched off and the others on; each switch acts at once and is kept per viewer (never in the board);
// 全景 and 外部工具接入 can be switched off and say so where they are asked for; the Mac-kept switches go through `preference`.
// Also 导出: the backup comes back in through 从备份恢复, and the read-only copies are named when imported. Never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{
   window.__sent=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:false,ghAccounts:[],sshConfig:false}),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={data:{blocks:[{id:'domain',folded:false},{id:'server',folded:false}],assets:[
    {id:'d1',type:'domain',name:'example.com',provider:'Registrar',source:'manual',art:'generic',date:'2099-03-01',dateKind:'expire'},
    {id:'s1',type:'server',name:'box-one',provider:'Example Cloud',source:'manual',art:'generic',ips:'192.0.2.10'}]},
    cloudflareConnected:true,githubConnected:false,statusItem:true,autoUpdate:true,version:'2026.10.3',notifications:'denied',probeSources:[],sshProbe:{enabled:[],interval:60}};
  });
  await p.goto('http://127.0.0.1:4317/');await p.waitForTimeout(500);
  const sent=action=>p.evaluate(a=>window.__sent.filter(m=>m.action===a),action);

  // One way in from the sidebar; three groups.
  await p.click('#sidebar [data-action="prefs"]');
  const groups=await p.$$eval('#modal .prefs-group h3',hs=>hs.map(h=>h.textContent));
  check(groups.join()==='通用,功能,连接,关于','Four sections: '+groups.join());
  check(await p.$$eval('#modal .prefs-tab',ts=>ts.map(t=>t.dataset.id+':'+t.getAttribute('aria-selected')).join())==='general:true,features:false,connections:false,about:false','The list at the left, 通用 first');
  check(await p.$$eval('#modal .prefs-group',gs=>gs.filter(g=>!g.hidden).length)===1,'One section shown at a time');
  const switches=await p.$$eval('#modal input.prefs-switch',ns=>Object.fromEntries(ns.map(n=>[n.dataset.id||n.dataset.action,n.checked])));
  check(switches.probe===false&&switches.panorama===true&&switches.agent===true,'Probes start off, the rest on: '+JSON.stringify(switches));
  check(switches.statusItem===true&&switches.autoUpdate===true&&switches['auto-icons']===true&&switches['rdap-auto']===false,'Mac and board switches show their state: '+JSON.stringify(switches));
  check(await p.locator('#modal .prefs-row .chip.bad').count()===1,'Notifications show as switched off');
  check(await p.locator('#modal [data-action="cloudflare-import"]').count()===1&&await p.locator('#modal [data-action="probe-sources"]').count()===0,'Connections list Cloudflare, not probes while they are off');
  check(await p.locator('#modal [aria-label=""]').count()===0&&await p.$$eval('#modal input.prefs-switch',ns=>ns.every(n=>n.getAttribute('aria-label'))),'Every switch is named');
  // The moved switches are gone from their old places.
  check(await p.evaluate(()=>{iconBatchDialog();return !document.querySelector('#icon-auto');}),'获取网站图标 no longer holds the auto switch');
  check(await p.evaluate(()=>{settings('domain');return !document.querySelector('#modal [data-action="rdap-auto"]');}),'The domain category no longer holds the weekly check');
  await p.evaluate(()=>prefsDialog());

  // 版本: the app's version and the same check as the app menu, under 关于.
  await p.click('#modal [data-action="prefs-section"][data-id="about"]');
  check(await p.locator('#modal .prefs-version').evaluate(n=>n.textContent.includes('2026.10.3')),'The version is shown');
  await p.click('#modal [data-action="check-updates"]');
  check((await sent('checkUpdates')).length===1,'检查更新… asks the app');
  await p.focus('#prefs-tab-about');await p.keyboard.press('Home');
  check(await p.evaluate(()=>document.activeElement.id==='prefs-tab-general'&&!$('#prefs-pane-general').hidden),'Home goes back to 通用 by keyboard');
  // Mac-kept switches go through the bridge.
  await p.click('#modal input[data-id="statusItem"]');
  check(JSON.stringify((await sent('preference')).at(-1))===JSON.stringify({action:'preference',key:'statusItem',on:false}),'Menu bar switch sent: '+JSON.stringify(await sent('preference')));
  await p.focus('#prefs-tab-general');await p.keyboard.press('ArrowDown');
  check(await p.evaluate(()=>document.activeElement.id==='prefs-tab-features'&&!$('#prefs-pane-features').hidden),'↓ moves to 功能');
  await p.click('#modal input[data-action="auto-icons"]');
  check(await p.evaluate(()=>state.autoIcons===false),'Auto icons off is a board setting');

  // 全景 off: gone from the sidebar, P says where it went, kept per viewer.
  await p.click('#modal input[data-id="panorama"]');
  check(await p.locator('#modal input[data-id="panorama"]').evaluate(n=>n===document.activeElement&&!n.checked),'Focus stays on the switch after the panel is drawn again');
  check(await p.locator('#sidebar [data-view="panorama"], #sidebar [data-action="panorama"]').count()===0,'No 全景 in the sidebar');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await p.evaluate(()=>togglePanorama(true));
  check(await p.evaluate(()=>!panoOpen&&$('#toast').textContent.includes('全景已在设置里关闭')&&!!$('#toast [data-action="prefs"]')),'Opening 全景 points at 设置');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-features-v1')).panorama===false&&!('panorama' in state)),'Kept per viewer, not in the board');

  // 外部工具接入 off: calls are refused, the top bar loses its MCP button.
  await p.evaluate(()=>{prefsDialog();});await p.click('#modal input[data-id="agent"]');
  const refused=await p.evaluate(()=>window.assetboardAgent({method:'list',params:{}}));
  check(!refused.ok&&/设置/.test(refused.error),'Agent calls refused: '+JSON.stringify(refused));
  check(await p.locator('.topnav-mcp').count()===0&&await p.locator('#modal [data-action="agent-setup"]').count()===0,'No MCP button or connection row while off');

  // Probes on: the probe rows appear at once.
  await p.click('#modal input[data-id="probe"]');
  check(await p.locator('#modal [data-action="probe-sources"]').count()===1&&await p.locator('#modal [data-action="ssh-probe-open"]').count()===1,'Probe rows appear once probes are on');
  check(await p.evaluate(()=>probeOn()&&sshOn()&&probe.started&&sshProbe.started),'Turning probes on starts them');
  await p.click('#modal input[data-id="probe"]');
  check(await p.evaluate(()=>!probeOn()&&probeOf(state.assets.find(a=>a.id==='s1'))===null),'Off again: no card takes a reading');

  // 导出: the backup first, with its way back; the copies marked 只读.
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await p.evaluate(()=>exportDialog());
  check(await p.locator('#modal [data-action="export-board"]').count()===1&&await p.locator('#modal [data-action="restore-backup"]').count()===1,'Backup card exports and restores');
  check(await p.locator('#modal .export-card h3 .fmt').count()===3,'Calendar, ledger and handover are marked read-only');
  await p.click('#modal [data-action="export-board"]');
  check((await sent('exportBoard')).length===1,'The Mac app writes the backup');
  const backup=JSON.stringify({blocks:[{id:'domain',width:50,folded:false}],assets:[{id:'r1',type:'domain',name:'restored.example',provider:'R',source:'manual',art:'generic'}]});
  await p.setInputFiles('#backup-file',{name:'Assetboard-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  for(let i=0;i<50&&!await p.evaluate(()=>state.assets.some(a=>a.id==='r1')||$('#modal').dataset.view==='import-preview');i++)await p.waitForTimeout(40);
  if(await p.evaluate(()=>$('#modal').dataset.view==='import-preview'))await p.click('#modal [data-action="import-apply"]');
  check(await p.evaluate(()=>state.assets.some(a=>a.id==='r1')),'从备份恢复 brings the record back');
  // A read-only copy is named instead of becoming records.
  const count=await p.evaluate(()=>state.assets.length);
  await p.evaluate(()=>routeImportText(calendarIcs(state.assets),{filename:'Assetboard.ics'}));
  check(await p.evaluate(n=>state.assets.length===n&&$('#toast').textContent.includes('导不回来')&&$('#toast').textContent.includes('资产备份'),count),'The calendar is named, not imported');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS';
}
