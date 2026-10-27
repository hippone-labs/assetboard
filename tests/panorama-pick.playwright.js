// v22b: the "+" on a card ticks several things on or off a hub in one go (one undo step); the totals in the bar switch kinds off and on, remembered per lens.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof panoramaOpen==='function');await p.evaluate(()=>{try{localStorage.removeItem('assetboard.panorama');}catch{}panoLens='';for(const k of Object.keys(panoHide))delete panoHide[k];});await p.waitForTimeout(200);
  await p.keyboard.press('p');await p.waitForTimeout(250);
  const nas='.pano-card[data-lane="demo-s3"]';
  // The empty card shows its "+" without hovering and says it can be used.
  const empty=await p.evaluate(sel=>{const c=document.querySelector(sel);return {hint:c.querySelector('.pl-empty')?.textContent,opacity:getComputedStyle(c.querySelector('.pl-add')).opacity};},nas);
  check(/点 ＋ 挑选/.test(empty.hint)&&empty.opacity==='1','An empty card shows the + and mentions it: '+JSON.stringify(empty));
  await p.click(nas+' .pl-add');await p.waitForTimeout(150);
  const pick=await p.evaluate(()=>({open:$('#modal').open,title:$('#modal-title').textContent,groups:[...document.querySelectorAll('#pano-pick .link-group-title')].map(n=>n.textContent),rows:document.querySelectorAll('#pano-pick .pano-pick-row').length,checked:document.querySelectorAll('#pano-pick :checked').length,focus:document.activeElement?.id}));
  check(pick.open&&pick.title==='挂到「home-nas」'&&pick.groups.join()==='域名,仓库,数据库'&&pick.rows>4&&pick.checked===0&&pick.focus==='pano-pick-search','The picker lists what may hang on the server, grouped, nothing ticked, search focused: '+JSON.stringify(pick));
  // Search narrows the list; ticking shows the running change.
  await p.fill('#pano-pick-search','sample-shop');await p.waitForTimeout(80);
  check(await p.evaluate(()=>[...document.querySelectorAll('#pano-pick .pano-pick-row:not([hidden])')].map(r=>r.querySelector('input').value).join())==='demo-d3','Search narrows to the one domain');
  await p.check('#pano-pick input[value="demo-d3"]');await p.fill('#pano-pick-search','');await p.dispatchEvent('#pano-pick-search','input');
  await p.check('#pano-pick input[value="demo-db1"]');
  const db=await p.evaluate(()=>document.querySelector('#pano-pick input[value="demo-db1"]').closest('label').querySelector('small').textContent);
  check(/在 /.test(db),'A thing already on another server says where: '+db);
  check(await p.evaluate(()=>document.querySelector('.pano-pick-sum').textContent)==='+2','The footer counts the change');
  await p.click('#pano-pick button[type="submit"]');await p.waitForTimeout(250);
  const after=await p.evaluate(sel=>({modal:$('#modal').open,chips:[...document.querySelectorAll(sel+' .pano-chip')].map(c=>c.dataset.chip).sort().join(),toast:document.querySelector('#toast')?.textContent||'',focus:document.activeElement?.dataset.add,dbElsewhere:state.assets.find(a=>a.id==='demo-db1').links.filter(id=>state.assets.find(x=>x.id===id)?.type==='server').length}),nas);
  check(!after.modal&&after.chips==='demo-d3,demo-db1'&&/home-nas：挂上 2 项/.test(after.toast)&&after.focus==='demo-s3'&&after.dbElsewhere===2,'Both land on home-nas, the database keeps its other server, focus returns to +: '+JSON.stringify(after));
  await p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await p.waitForTimeout(200);
  check(await p.evaluate(sel=>!document.querySelector(sel+' .pano-chip'),nas),'One undo takes both back');
  // Unticking takes a thing off this card only.
  await p.hover('.pano-card[data-lane="demo-s1"]');await p.click('.pano-card[data-lane="demo-s1"] .pl-add');await p.waitForTimeout(150);
  const on=await p.evaluate(()=>[...document.querySelectorAll('#pano-pick :checked')].map(n=>n.value));
  check(on.length>1,'What is already on tokyo-vps starts ticked: '+on);
  await p.uncheck(`#pano-pick input[value="${on[0]}"]`);check(await p.evaluate(()=>document.querySelector('.pano-pick-sum').textContent)==='−1','Unticking counts as −1');
  await p.click('#pano-pick button[type="submit"]');await p.waitForTimeout(250);
  check(await p.evaluate(id=>!state.assets.find(a=>a.id==='demo-s1').links.includes(id),on[0]),'It came off tokyo-vps');
  // Escape closes the picker without writing and leaves the panorama open.
  await p.click(nas+' .pl-add');await p.waitForTimeout(100);await p.check('#pano-pick input[value="demo-d3"]');await p.keyboard.press('Escape');await p.waitForTimeout(150);
  check(await p.evaluate(()=>!$('#modal').open&&panoOpen&&!state.assets.find(a=>a.id==='demo-s3').links?.includes('demo-d3')),'Esc cancels the picker only');
  // Pay lens: the + on a bank card offers what it could pay for.
  await p.click('.pano-lens [data-lens="pay"]');await p.waitForTimeout(200);
  await p.hover('.pano-card[data-lane="demo-c2"]');await p.click('.pano-card[data-lane="demo-c2"] .pl-add');await p.waitForTimeout(150);
  check(await p.evaluate(()=>$('#modal-title').textContent==='由「多币种借记卡」付款的'&&!!document.querySelector('#pano-pick input[value="demo-s1"]')),'A bank card offers servers and subscriptions to pay for');
  await p.check('#pano-pick input[value="demo-s1"]');await p.click('#pano-pick button[type="submit"]');await p.waitForTimeout(250);
  check(await p.evaluate(()=>/记上 1 项/.test(document.querySelector('#toast').textContent)&&linkKind(state.assets.find(a=>a.id==='demo-s1'),state.assets.find(a=>a.id==='demo-c2')).kind==='pay'),'The card now pays for the server');
  // Type toggles: the totals in the bar switch a kind off and on; off is remembered per lens.
  await p.click('.pano-lens [data-lens="host"]');await p.waitForTimeout(200);
  await p.click('.pano-total[data-toggle="repository"]');await p.waitForTimeout(150);
  const off=await p.evaluate(()=>({pressed:document.querySelector('.pano-total[data-toggle="repository"]').getAttribute('aria-pressed'),repos:document.querySelectorAll('#panorama .pano-chip.t-repository').length,domains:document.querySelectorAll('#panorama .pano-chip.t-domain').length,saved:JSON.parse(localStorage.getItem('assetboard.panorama')).hide,focus:document.activeElement?.dataset.toggle}));
  check(off.pressed==='false'&&off.repos===0&&off.domains>0&&off.saved.host?.join()==='repository'&&off.focus==='repository','Repositories leave the board, the choice is saved for this lens: '+JSON.stringify(off));
  await p.click('.pano-lens [data-lens="pay"]');await p.waitForTimeout(150);
  check(await p.evaluate(()=>!document.querySelector('.pano-total[aria-pressed="false"]')),'The other lens keeps its own toggles');
  await p.click('.pano-lens [data-lens="host"]');await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelectorAll('#panorama .pano-chip.t-repository').length===0),'Back in host, repositories are still off');
  // The only hub type cannot be switched off.
  await p.click('.pano-total[data-toggle="server"]');await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelectorAll('.pano-card').length===3&&/至少留一种卡片/.test(document.querySelector('#toast').textContent)),'The last kind of card stays');
  await p.click('.pano-total[data-toggle="repository"]');await p.waitForTimeout(150);
  check(await p.evaluate(()=>document.querySelectorAll('#panorama .pano-chip.t-repository').length>0&&!JSON.parse(localStorage.getItem('assetboard.panorama')).hide.host),'Clicking again brings them back');
  check(!errors.length,'No page errors: '+errors.join(' | '));
 }finally{await context.close();}
}
