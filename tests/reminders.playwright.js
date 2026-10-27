// Run with the browser tool's filename option. Uses an isolated page and never saves.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const nativeDialogs=[];p.on('dialog',dialog=>{nativeDialogs.push(dialog.type());dialog.dismiss();});
 try {
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{
   save=()=>{};history.length=0;
   const day=offset=>isoDay(localDay()+offset);
   state={blocks:[{id:'domain',width:50,collapsed:false,height:null},{id:'subscription',width:50,collapsed:false,height:null}],assets:[
    {id:'soon',type:'domain',name:'soon.dev',provider:'Registrar',account:'',purpose:'',reason:'客户站点仍在使用',date:day(7),dateKind:'expire',cost:'¥ 89 / 年',art:'generic',source:'manual'},
    {id:'late',type:'domain',name:'late.dev',provider:'Registrar',account:'',purpose:'',date:day(-2),dateKind:'expire',art:'generic',source:'manual'},
    {id:'monthly',type:'subscription',name:'Editor Pro',provider:'Editor',account:'',purpose:'',date:day(-40),dateKind:'renew',cycle:'monthly',art:'generic',source:'manual'},
    {id:'quiet',type:'subscription',name:'Hidden tool',provider:'Tool',account:'',purpose:'',date:day(3),hiddenAt:'2026-01-01',art:'generic',source:'manual'}
   ]};render();
  });
  // The overview: a group summary per category and coloured dates on the rows.
  check((await p.locator('.group[data-group="domain"] .g-sum').getAttribute('aria-label'))==='1 项已过期，1 项 30 天内到期'&&(await p.locator('.group[data-group="domain"] .g-sum .dot').count())===2,'Group summary counts computed dates as two dots');
  check((await p.locator('[data-asset="soon"] .r-date').getAttribute('class')).includes('warn'),'Soon row is marked');
  // The sidebar counts what needs attention; 即将到来 lists every dated record in bands, overdue first.
  const nav=p.locator('#sidebar .nav-item[data-id="upcoming"]');
  check(/1 项已过期/.test(await nav.getAttribute('aria-label'))&&(await nav.locator('.nav-count.overdue').innerText())==='3','Sidebar counts overdue and soon dates, red while any is overdue');
  await nav.click();
  const agenda=await p.locator('#board').innerText();
  check(/已过期[\s\S]*late\.dev[\s\S]*已过期 2 天/.test(agenda),'Overdue band leads: '+agenda);
  check(/7 天内[\s\S]*soon\.dev[\s\S]*客户站点仍在使用[\s\S]*7 天后到期/.test(agenda),'Soon asset shows its keep reason and relative date');
  check(!agenda.includes('Hidden tool'),'Hidden assets stay out of 即将到来');
  check(/Editor Pro[\s\S]*天后扣款/.test(agenda),'Monthly renewal rolls forward to its next charge');
  check(await p.locator('#layout-toggle').isHidden(),'即将到来 is always a list');

  // Delete asks in-page (works in WKWebView) and can be undone from the toast.
  await p.locator('[data-asset="late"] .item-open').click();
  const menu=async action=>{await p.locator('#detail [data-action="asset-menu"]').click();await p.locator(`#menu [data-action="${action}"]`).click();};
  await menu('delete-asset');
  check(await p.locator('#modal[open] #confirm-yes').isVisible(),'Delete must open the in-page confirmation');
  await p.locator('#confirm-no').click();
  check(await p.evaluate(()=>state.assets.some(a=>a.id==='late')),'Cancel keeps the record');
  await menu('delete-asset');
  await p.locator('#confirm-yes').click();
  check(await p.evaluate(()=>!state.assets.some(a=>a.id==='late')),'Confirm deletes the record');
  check(await p.locator('#detail').isHidden(),'Detail closes after deleting its asset');
  await p.locator('#toast .toast-undo').click();
  check(await p.evaluate(()=>state.assets.some(a=>a.id==='late')),'Toast undo restores the deleted record');

  // Cmd/Ctrl+Z undoes outside text fields.
  await p.locator('[data-asset="soon"] .item-open').click();
  await menu('hide-asset');
  check(await p.evaluate(()=>!!state.assets.find(a=>a.id==='soon').hiddenAt),'Hide from detail');
  await p.locator('body').press('ControlOrMeta+z');
  check(await p.evaluate(()=>!state.assets.find(a=>a.id==='soon').hiddenAt),'Keyboard undo restores the hidden asset');

  // Paste → review → prefilled form → asset with date, cycle and cost.
  await p.locator('#inbox-button').click();
  await p.locator('#paste-text').fill('Your Figma Professional plan will renew on October 6, 2099.\nYou will be charged $15.00/month.');
  await p.locator('#paste-form button[type="submit"]').click();
  const review=await p.locator('#modal-content').innerText();
  check(/\$15\.00 \/ 月/.test(review)&&/2099-10-06/.test(review),'Review shows amount and date: '+review);
  await p.locator('[data-action="candidate-apply"]').click();
  check(await p.locator('#asset-form [name="date"]').inputValue()==='2099-10-06','Form is prefilled with the date');
  check(await p.locator('#asset-form [name="dateKind"]').inputValue()==='renew','Form is prefilled with the date kind');
  check(await p.locator('#asset-form [name="cycle"]').inputValue()==='monthly','Form is prefilled with the cycle');
  await p.locator('#asset-form [name="name"]').fill('Figma');
  await p.locator('#asset-form [name="reason"]').fill('设计稿都在这里');
  await p.locator('#asset-form [type="submit"]').click();
  const created=await p.evaluate(()=>state.assets.find(a=>a.name==='Figma'));
  check(created&&created.type==='subscription'&&created.cost==='$15.00 / 月'&&created.cycle==='monthly'&&created.reason==='设计稿都在这里','Paste creates a complete asset');
  check(await p.evaluate(()=>!state.evidenceDecisions||!Object.keys(state.evidenceDecisions).length),'Pasted text leaves no evidence decision behind');

  // Changing the category moves a manual asset to the matching category.
  await p.evaluate(id=>assetForm('subscription',id),created.id);
  await p.locator('#asset-form [data-unfold]').click();await p.locator('#asset-form [data-choice="type"][data-value="license"]').click();
  await p.locator('#asset-form [type="submit"]').click();
  check(await p.evaluate(()=>state.assets.find(a=>a.name==='Figma').type==='license'&&state.blocks.some(b=>b.id==='license')),'Category change adds the target category');

  // Categories can move down as well as up, from the category view's ⋯.
  await p.locator('#sidebar .nav-item[data-block="domain"]').click();
  await p.locator('#view-menu').click();
  await p.locator('[data-action="move-down"]').click();
  check(await p.evaluate(()=>state.blocks[1].id==='domain')&&(await p.locator('#sidebar .nav-item[data-block]').evaluateAll(n=>n.map(x=>x.dataset.block).join()))==='subscription,domain,license','Move down swaps with the next category, in the sidebar too');

  // Name collisions are confirmed in one list instead of one native prompt per record.
  await p.evaluate(()=>{state.assets.push({id:'manual-repo',type:'repository',name:'me/tool',provider:'Git',account:'',source:'manual',art:'generic'});syncFollowUp('GitHub',{read:1,collisions:[{assetId:'manual-repo',name:'me/tool',fields:{source:'github',externalId:'9',provider:'GitHub',type:'repository'}}]},[]);});
  await p.locator('input[name="collision"]').check();
  await p.locator('[data-action="apply-collisions"]').click();
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='manual-repo').source==='github'),'Checked collision is overwritten');

  // Evidence rows group into one candidate; ignoring resolves every row and undo brings it back.
  await p.evaluate(()=>{evidenceRows=[1,2,3].map(n=>({id:`gmail-${n}`,kind:'gmail',source:'Notion <team@makenotion.com>',title:'Your receipt',body:'Total $10.00',payload:JSON.stringify({date:isoDay(localDay()-n*30-1)})}));evidenceVersion++;render();});
  check((await p.locator('#inbox-button').getAttribute('aria-label'))==='待确认 1'&&(await p.locator('#inbox-button').innerText())==='1','Toolbar counts pending groups');
  await p.locator('#inbox-button').click();
  check(await p.locator('.candidate').count()===1,'Receipts from one sender form one group');
  await p.locator('[data-action="candidate-dismiss"]').first().click();
  check(await p.evaluate(()=>['gmail-1','gmail-2','gmail-3'].every(id=>state.evidenceDecisions[id]?.status==='dismissed')),'Ignoring resolves all rows in the group');
  await p.locator('#close-modal').click();
  await p.locator('#toast .toast-undo').click();
  check((await p.locator('#inbox-button').getAttribute('aria-label'))==='待确认 1','Undo restores the pending group');

  // Unsaved-changes prompt keeps what was typed and still protects it afterwards.
  await p.evaluate(()=>assetForm('domain','soon'));
  await p.locator('#asset-form [name="name"]').fill('edited.dev');
  await p.locator('#close-modal').click();
  await p.locator('#dirty-keep').click();
  check(await p.locator('#asset-form [name="name"]').inputValue()==='edited.dev','Continue editing keeps typed values');
  await p.locator('#close-modal').click();
  await p.locator('#dirty-save').click();
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='soon').name==='edited.dev'),'Save from the prompt stores typed values');

  check(nativeDialogs.length===0,'No native alert/confirm dialogs: '+nativeDialogs.join(','));
  // render() starts its layout animation on the next frame; let it finish before changing the viewport.
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))).then(()=>Promise.all(document.getAnimations().map(animation=>animation.finished))));
  await p.setViewportSize({width:390,height:844});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  return 'PASS: 即将到来 bands and sidebar count, computed summaries, in-page delete confirm, toast and keyboard undo, paste review, category change, move down, collision list, grouped evidence, unsaved-changes prompt, mobile bounds';
 } finally { await p.close(); }
}
