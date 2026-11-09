// Run with the browser tool's filename option. A project's revenue, split cost and net, in USD whatever the board's currency:
// the head of a project view shows the split monthly cost and a 填写 button without revenue; the revenue dialog starts in USD, says
// what another currency comes to in USD and saves an amount in a currency (⌘Z undoes it; the head keeps the own amount beside the
// USD one), and a loss shows the net in red with the over-cost marked on the bar; a shared record is drawn at its share, and
// clicking it edits the split (typing one percent fills the other); the form's share editor follows the project field, takes 0 and
// two decimals (step 0.01; 均分 for three is 33.33 / 33.33 / 33.34) and refuses three decimals and shares that do not add up to 100;
// the header's figure and the cost panel's 按项目 agree with the split, in USD; renaming a project moves its revenue (a merge across
// currencies adds both up in USD); a cost that cannot be read is a gap, a repository without a cost is not.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg)=>{for(let i=0;i<150;i++){if(await p.evaluate(fn,arg))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+String(fn).slice(0,90));};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');
  await until(p,()=>typeof projectEconomics==='function'&&!!document.querySelector('#sidebar .nav-projects'));
  const bar=()=>p.evaluate(()=>{const b=document.querySelector('.pj-bar');return b?{main:b.querySelector('.pj-main b')?.textContent,loss:!!b.querySelector('.pj-main.loss'),rev:b.querySelector('.pj-rev b')?.textContent,segs:b.querySelectorAll('.pj-seg').length,shared:b.querySelectorAll('.pj-seg.shared').length,gaps:b.querySelectorAll('.pj-gaps .pj-unk').length,over:!!b.querySelector('.pj-over'),mark:b.querySelector('.pj-mark')?.textContent||'',meta:document.querySelector('#view-meta .meta-cost')?.textContent}:null;});

  // No revenue: the cost is the one figure, the revenue is a button; a repository without a cost is not a gap. The board counts in
  // CNY here, and the project still counts in USD (the head, the header's figure).
  await p.evaluate(()=>{delete state.projects;displayCurrency='CNY';setView('project:notes-lab');});
  let b=await bar();
  check(b&&b.main==='$19.00'&&b.rev.includes('填写')&&b.segs===3&&!b.gaps&&!b.mark&&b.meta==='$19.00 / 月','the head without revenue is wrong: '+JSON.stringify(b));

  // The revenue dialog starts in USD; another currency shows what it comes to in USD, and the head keeps both amounts.
  await p.click('.pj-rev');
  await until(p,()=>$('#modal').open&&!!$('#project-revenue-form'));
  check(await p.evaluate(()=>$('#project-revenue-form [name="currency"]').value)==='USD','a new revenue does not start in USD');
  await p.fill('#project-revenue-form [name="amount"]','200');
  await p.click('#project-revenue-form .choice[data-value="CNY"]');
  const usd=await p.evaluate(()=>formatMoney(convertMoney(200,'CNY','USD',fx.rates),'USD'));
  check(await p.locator('#project-revenue-form .pj-usd').textContent()===`≈ ${usd} / 月`,'the dialog does not say what CNY comes to in USD: '+await p.locator('#project-revenue-form .pj-usd').textContent());
  await p.click('#project-revenue-form [type="submit"]');
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"notes-lab":{"revenue":{"amount":200,"currency":"CNY"}}}','the revenue is not stored in its own currency');
  b=await bar();
  check(b.rev===`¥200.00 ≈ ${usd}`&&b.main.includes('$'),'the head does not show the own amount beside the USD one: '+JSON.stringify(b));
  await p.click('.pj-rev');
  await until(p,()=>$('#modal').open&&!!$('#project-revenue-form'));
  check(await p.evaluate(()=>$('#project-revenue-form [name="currency"]').value)==='CNY'&&(await p.locator('#project-revenue-form .pj-usd').textContent()).includes(usd),'an existing revenue does not open in its own currency');
  await p.click('#project-revenue-form .choice[data-value="USD"]');
  check(await p.locator('#project-revenue-form .pj-usd').textContent()==='','USD needs no conversion line');
  await p.evaluate(()=>{$('#modal').close();undo();displayCurrency='';render();});
  check(await p.evaluate(()=>!('projects' in state)),'undo does not take the CNY revenue back');

  // The revenue dialog: an amount and a currency; the net follows, ⌘Z takes it back.
  await p.click('.pj-rev');
  await until(p,()=>$('#modal').open&&!!$('#project-revenue-form'));
  await p.fill('#project-revenue-form [name="amount"]','12');
  await p.click('#project-revenue-form .choice[data-value="USD"]');
  await p.click('#project-revenue-form [type="submit"]');
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"notes-lab":{"revenue":{"amount":12,"currency":"USD"}}}','the revenue is not stored: '+await p.evaluate(()=>JSON.stringify(state.projects)));
  b=await bar();
  check(b.main==='−$7.00'&&b.loss&&b.over&&b.rev==='$12.00','a loss is not shown: '+JSON.stringify(b));
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!('projects' in state)),'undo does not take the revenue back');
  await p.evaluate(()=>{state.projects={'notes-lab':{revenue:{amount:30,currency:'USD'}}};render();});
  b=await bar();
  check(b.main==='+$11.00'&&!b.loss&&!b.over,'a profit is not shown plainly: '+JSON.stringify(b));
  // Clearing from the dialog.
  await p.click('.pj-rev');await until(p,()=>!!$('#project-revenue-form [data-action="project-revenue-clear"]'));
  await p.click('#project-revenue-form [data-action="project-revenue-clear"]');
  check(await p.evaluate(()=>!('projects' in state)&&!$('#modal').open),'清除 does not clear the revenue');
  await p.evaluate(()=>{state.projects={'notes-lab':{revenue:{amount:30,currency:'USD'}}};render();});

  // A shared record: drawn at its share (equal first), the header and the cost panel use the split.
  await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='demo-u3');setProjects(a,['notes-lab','studio']);render();});
  b=await bar();
  check(b.main==='+$17.00'&&b.shared===1&&b.meta.includes('$13.00'),'a shared record is not split equally: '+JSON.stringify(b));
  // Clicking it edits the split: typing 70 fills 30, the bar follows, saving stores it and ⌘Z undoes it.
  await p.click('.pj-seg.shared');
  await until(p,()=>!!$('#project-share-form .share-field'));
  await p.fill('#project-share-form input[data-project="notes-lab"]','70');
  check(await p.inputValue('#project-share-form input[data-project="studio"]')==='30','the last share does not take the rest');
  check(await p.evaluate(()=>$('#project-share-form input[name="shareMode"]').value)==='custom','typing a share does not switch to 按比例');
  await p.click('#project-share-form [type="submit"]');
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(x=>x.id==='demo-u3').projectShares))==='{"notes-lab":70,"studio":30}','the split is not stored');
  b=await bar();
  check(b.main==='+$14.60','the net does not follow the split: '+JSON.stringify(b));
  await p.evaluate(()=>{setView('project:studio');});
  check((await bar()).meta.includes('$12.85'),'the other project does not get the rest: '+JSON.stringify(await bar()));
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>!state.assets.find(x=>x.id==='demo-u3').projectShares),'undo does not take the split back');

  // The form: the editor shows for several projects, follows the field, refuses a bad total, saves a good one, 均分 clears it.
  await p.evaluate(()=>assetForm('subscription','demo-u3'));
  await until(p,()=>!!$('#asset-form .share-slot .share-field'));
  await p.fill('#asset-form [name="project"]','notes-lab，studio，lab-3');
  check(await p.evaluate(()=>$('#asset-form .share-field').dataset.names)==='["notes-lab","studio","lab-3"]','the editor does not follow the project field');
  await p.fill('#asset-form input[data-project="notes-lab"]','80');
  await p.fill('#asset-form input[data-project="studio"]','30');
  check(await p.inputValue('#asset-form input[data-project="lab-3"]')==='0','the last share is not what is left');
  await p.fill('#asset-form input[data-project="lab-3"]','5');
  await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>$('#modal').open&&!state.assets.find(x=>x.id==='demo-u3').projectShares&&[...$('#asset-form').querySelectorAll('input[name="share"]')].some(i=>i.validationMessage.includes('100'))),'a total of 115% is not refused');
  await p.fill('#asset-form input[data-project="lab-3"]','0');await p.fill('#asset-form input[data-project="notes-lab"]','50');
  check(await p.inputValue('#asset-form input[data-project="lab-3"]')==='20','the rest is not recomputed');
  await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(x=>x.id==='demo-u3').projectShares))==='{"notes-lab":50,"studio":30,"lab-3":20}','the form does not save the split');
  // Two decimals and 0 are taken (step 0.01, the rest to two decimals); three decimals are refused.
  const formShares=()=>p.evaluate(()=>JSON.stringify(state.assets.find(x=>x.id==='demo-u3').projectShares));
  await p.evaluate(()=>assetForm('subscription','demo-u3'));
  await until(p,()=>!!$('#asset-form .share-field'));
  check(await p.evaluate(()=>[...$('#asset-form').querySelectorAll('input[name="share"]')].every(i=>i.type==='number'&&i.step==='0.01'&&i.min==='0'&&i.max==='100')),'the share inputs are not 0–100 in steps of 0.01');
  await p.fill('#asset-form input[data-project="notes-lab"]','12.55');
  check(await p.inputValue('#asset-form input[data-project="lab-3"]')==='57.45','the rest is not to two decimals');
  await p.click('#asset-form [type="submit"]');
  check(await formShares()==='{"notes-lab":12.55,"studio":30,"lab-3":57.45}','two decimals are not saved: '+await formShares());
  await p.evaluate(()=>assetForm('subscription','demo-u3'));
  await until(p,()=>!!$('#asset-form .share-field'));
  check(await p.inputValue('#asset-form input[data-project="notes-lab"]')==='12.55','the form does not show two decimals');
  await p.fill('#asset-form input[data-project="notes-lab"]','12.555');
  await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>$('#modal').open&&!$('#asset-form input[data-project="notes-lab"]').checkValidity())&&await formShares()==='{"notes-lab":12.55,"studio":30,"lab-3":57.45}','three decimals are not refused: '+await formShares());
  check(await p.evaluate(()=>shareRead($('#asset-form .share-field')).error)==='份额最多两位小数','the editor does not explain three decimals');
  await p.fill('#asset-form input[data-project="notes-lab"]','0');
  check(await p.inputValue('#asset-form input[data-project="lab-3"]')==='70','0 does not leave the rest');
  await p.click('#asset-form [type="submit"]');
  check(await formShares()==='{"notes-lab":0,"studio":30,"lab-3":70}','0 is not a share: '+await formShares());
  check(await p.evaluate(()=>{showDetail('demo-u3');return [...document.querySelectorAll('#detail .pj-pct')].map(x=>x.textContent).join(',');})==='0%,30%,70%','the detail does not list the percents');
  await p.evaluate(()=>assetForm('subscription','demo-u3'));
  await until(p,()=>!!$('#asset-form .share-field'));
  check(await p.inputValue('#asset-form input[data-project="studio"]')==='30','the form does not show the stored split');
  await p.click('#asset-form .choice[data-choice="shareMode"][data-value=""]');
  check(await p.inputValue('#asset-form input[data-project="studio"]')==='33.33'&&await p.inputValue('#asset-form input[data-project="lab-3"]')==='33.34','均分 does not reset the percents to 33.33 / 33.33 / 33.34');
  await p.click('#asset-form [type="submit"]');
  check(await p.evaluate(()=>!('projectShares' in state.assets.find(x=>x.id==='demo-u3'))),'均分 does not drop the stored split');
  // One project: no editor.
  await p.evaluate(()=>assetForm('subscription','demo-u3'));
  await until(p,()=>!!$('#asset-form .share-slot'));
  await p.fill('#asset-form [name="project"]','notes-lab');
  check(await p.evaluate(()=>!$('#asset-form .share-field')),'one project still shows the editor');
  await p.evaluate(()=>$('#modal').close());

  // The cost panel's 按项目 adds up to the whole, in USD even when the panel counts in another currency.
  await p.evaluate(()=>{setView('project:notes-lab');});
  await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='demo-u3');setProjects(a,['notes-lab','studio']);a.projectShares={'notes-lab':70,'studio':30};setView('all');costDialog();});
  const rows=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#modal .cost-split .cost-type')].map(r=>[r.querySelector('span').textContent,r.querySelector('b').textContent])));
  check(rows['notes-lab']==='$15.40'&&rows.studio==='$12.85','按项目 does not use the split: '+JSON.stringify(rows));
  await p.evaluate(()=>{displayCurrency='CNY';costDialog();});
  const cnyRows=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#modal .cost-split .cost-type')].map(r=>[r.querySelector('span').textContent,r.querySelector('b').textContent])));
  check(cnyRows['notes-lab']==='$15.40'&&cnyRows.studio==='$12.85'&&(await p.locator('#modal .cost-totals strong').first().textContent()).startsWith('¥'),'按项目 does not stay in USD: '+JSON.stringify(cnyRows));
  await p.evaluate(()=>{displayCurrency='';$('#modal').close();});

  // A cost that cannot be read is a gap (a dashed cell and the amber mark).
  await p.evaluate(()=>{state.assets.find(x=>x.id==='demo-d2').cost='12 一年左右';setView('project:notes-lab');});
  b=await bar();
  check(b.gaps===1&&b.mark.includes('1'),'an unreadable cost is not marked: '+JSON.stringify(b));

  // Renaming the project moves its revenue.
  await p.evaluate(()=>projectRenameCommit({from:'notes-lab',to:'notes'}));
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"notes":{"revenue":{"amount":30,"currency":"USD"}}}','the rename leaves the revenue behind: '+await p.evaluate(()=>JSON.stringify(state.projects)));
  check(await p.evaluate(()=>view)==='project:notes'&&(await bar()).rev==='$30.00','the renamed view does not show the revenue');
  // Merging into a project whose revenue is in another currency adds both up in USD, with the app's rates.
  const merged=await p.evaluate(()=>{state.projects.studio={revenue:{amount:100,currency:'CNY'}};const want=Math.round((30+convertMoney(100,'CNY','USD',fx.rates))*100)/100;projectRenameCommit({from:'notes',to:'studio'});return {want,projects:JSON.stringify(state.projects)};});
  check(merged.projects===JSON.stringify({studio:{revenue:{amount:merged.want,currency:'USD'}}}),'a merge across currencies is not one USD sum: '+JSON.stringify(merged));
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"notes":{"revenue":{"amount":30,"currency":"USD"}},"studio":{"revenue":{"amount":100,"currency":"CNY"}}}','undo does not take the merge back');

  // English.
  const en=await context.newPage();en.on('pageerror',e=>errors.push(e.message));
  await en.goto('http://127.0.0.1:4317/?demo&lang=en');
  await until(en,()=>typeof projectEconomics==='function'&&!!document.querySelector('#sidebar .nav-projects'));
  await en.evaluate(()=>{state.projects={'notes-lab':{revenue:{amount:12,currency:'USD'}}};setView('project:notes-lab');});
  const text=await en.evaluate(()=>document.querySelector('.pj-bar').innerText);
  check(!/[一-鿿]/.test(text)&&text.includes('Net a month'),'the head has Chinese in English: '+text);
  await en.close();
  check(!errors.length,'page errors: '+errors.join('; '));
 }finally{await context.close();}
}
