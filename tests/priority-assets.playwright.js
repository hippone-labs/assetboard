// Run with the browser tool's filename option. Uses an isolated page and never saves.
async (page) => {
 const p=await page.context().newPage();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];p.on('pageerror',error=>errors.push(error.message));
 const find=name=>p.evaluate(name=>state.assets.find(a=>a.name===name),name);
 const regionLabel={US:'美国',HK:'中国香港'};
 const choose=async(name,value)=>{const unfold=p.locator(`#asset-form .chip-group.folded:has([data-choice="${name}"]) [data-unfold]`);if(await unfold.count())await unfold.click();await p.locator(`#asset-form [data-choice="${name}"][data-value="${value}"]`).click();};
 const add=async(type,fill)=>{await p.evaluate(type=>assetForm(type),type);await p.evaluate(()=>{const more=document.querySelector('#asset-form .more-fields');if(more)more.open=true;});for(const [name,value] of Object.entries(fill)){if(name==='region'){await p.locator('#asset-form [name="regionText"]').fill(regionLabel[value]);continue;}await p.locator(`#asset-form [name="${name}"]`).fill(value);}await p.locator('#asset-form [type="submit"]').click();await p.waitForTimeout(200);};
 try {
  await p.setViewportSize({width:1280,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{save=()=>{};state={blocks:[],assets:[]};render();});

  // A full card number anywhere in the form blocks the save.
  await add('bankcard',{name:'汇丰 One',notes:'卡号 4111 1111 1111 1111'});
  check(await p.locator('#modal[open] #asset-form').count()===1,'A full card number must keep the form open');
  check(await p.evaluate(()=>!document.querySelector('#asset-form [name="notes"]').validity.valid),'The field with the card number must be flagged');
  check(!(await find('汇丰 One')),'Nothing is saved while a full card number is present');
  await p.locator('#asset-form [name="notes"]').fill('');
  await p.locator('#asset-form [name="provider"]').fill('汇丰香港');
  await p.locator('#asset-form [name="regionText"]').fill('中国香港');
  await p.locator('#asset-form [name="last4"]').fill('4821');
  await choose('network','Visa');
  await p.locator('#asset-form [name="expiry"]').fill('08/28');
  await p.locator('#asset-form [type="submit"]').click();await p.waitForTimeout(200);
  const card=await find('汇丰 One');
  check(card?.type==='bankcard'&&card.last4==='4821'&&card.network==='Visa'&&card.region==='HK'&&card.date==='2028-08-31'&&card.dateKind==='expire','Bank card fields must be stored: '+JSON.stringify(card));
  check(await p.locator('#sidebar .nav-item[data-block="bankcard"]').count()===1&&await p.locator('#board .group[data-group="bankcard"]').count()===1,'Adding a bank card must add its category');
  check((await p.locator(`[data-asset="${card.id}"] .r-sub`).textContent()).includes('Visa •••• 4821'),'Row shows network and tail');
  check((await p.locator(`[data-asset="${card.id}"] .r-date`).textContent()).includes('有效期 08/28'),'A distant expiry shows as MM/YY');

  // Phones: stored in full, region inferred from the calling code, masked on the board.
  await p.evaluate(()=>assetForm('phone'));
  await p.locator('#asset-form [name="name"]').fill('英国 giffgaff');
  await p.locator('#asset-form [name="phone"]').fill('+44 7700 900123');
  check(await p.locator('#asset-form [name="region"]').inputValue()==='GB','Calling code must fill the region');
  check(await p.locator('#asset-form [name="dateKind"]').inputValue()==='keep'&&await p.locator('#asset-form [name="cycle"]').inputValue()==='halfyearly','Phones default to a half-yearly keep-alive date');
  await p.locator('#asset-form [type="submit"]').click();await p.waitForTimeout(200);
  const phone=await find('英国 giffgaff');
  check(phone?.phone==='+44 7700 900123'&&phone.region==='GB','The full number must be stored');
  await add('appleid',{name:'美区主号',account:'han.dev@example.org',region:'US'});
  const apple=await find('美区主号');
  check(apple?.provider==='Apple','Apple ID provider is fixed');
  const boardText=await p.locator('#board').innerText();
  check(boardText.includes('+44 ••• 0123')&&!boardText.includes('900123'),'The board must show the number masked');
  check(boardText.includes('ha•••@example.org')&&!boardText.includes('han.dev@'),'The board must show the email masked');

  // Details reveal the full value on request.
  await p.locator(`[data-asset="${phone.id}"] .item-open`).click();
  check(!(await p.locator('#detail').innerText()).includes('900123'),'Details start masked');
  await p.locator('#detail [data-action="asset-menu"]').click();
  check(await p.locator('#menu [data-action="hide-asset"]').count()===1&&await p.locator('#menu [data-action="icon-dialog"]').count()===0,'The browser version has no icon download');
  await p.keyboard.press('Escape');
  await p.locator('#detail [data-action="reveal"]').click();
  check((await p.locator('#detail .secret').textContent())==='+44 7700 900123','显示 reveals the full number');

  // Linking from the detail panel, both ways, listed with the card tail, undo.
  await p.locator(`#detail [data-action="link-picker"]`).click();
  await p.locator('#link-search').fill('美区');
  check(await p.locator('.link-option:not([hidden])').count()===1,'Picker search must filter');
  await p.locator('.link-option:not([hidden])').click();await p.waitForTimeout(200);
  check(await p.evaluate(({a,b})=>state.assets.find(x=>x.id===a).links?.includes(b)&&state.assets.find(x=>x.id===b).links?.includes(a),{a:phone.id,b:apple.id}),'Links must be stored on both sides');
  check(await p.locator('#detail .link-row').count()===1,'Detail must list the link');
  await p.keyboard.press('Escape');
  await p.evaluate(({a,b})=>{linkAssets(state.assets,a,b);render();},{a:apple.id,b:card.id});
  await p.locator(`[data-asset="${apple.id}"] .item-open`).click();
  check(await p.locator('#detail .link-row').count()===2&&(await p.locator('#detail .detail-links').innerText()).includes('•••• 4821'),'The inspector lists both links, the card with its tail');
  check(await p.locator('.link-lines path').count()===0,'No lines are drawn across the list');
  await p.locator(`#detail [data-action="unlink"][data-target="${card.id}"]`).click();
  check(await p.evaluate(({a,b})=>!state.assets.find(x=>x.id===a).links.includes(b)&&!state.assets.find(x=>x.id===b).links.includes(a),{a:apple.id,b:card.id}),'Unlink removes both sides');
  await p.locator('#toast .toast-undo').click();
  check(await p.evaluate(({a,b})=>state.assets.find(x=>x.id===a).links.includes(b),{a:apple.id,b:card.id}),'Undo restores the link');
  await p.keyboard.press('Escape');

  // Deleting a record removes it from every link.
  await p.locator(`[data-asset="${phone.id}"] .item-open`).click();
  await p.locator('#detail [data-action="asset-menu"]').click();await p.locator('#menu [data-action="delete-asset"]').click();await p.locator('#confirm-yes').click();await p.waitForTimeout(200);
  check(await p.evaluate(id=>state.assets.every(a=>!a.links?.includes(id)),phone.id),'Delete must clean up links');

  // Search reaches regions and card tails; switching category keeps what was typed.
  await p.locator('#search').fill('4821');
  check(await p.locator('#board [data-asset]').count()===1,'Search finds a card by its tail');
  await p.locator('#search').fill('');
  await p.evaluate(()=>assetForm('bankcard'));
  await p.locator('#asset-form [name="name"]').fill('切换测试');
  await choose('type','phone');
  check(await p.locator('#asset-form [name="phone"]').count()===1&&await p.locator('#asset-form [name="last4"]').count()===0,'Category switch swaps the fields');
  check(await p.locator('#asset-form [name="name"]').inputValue()==='切换测试','Category switch keeps typed values');
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();});

  await p.setViewportSize({width:390,height:844});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  check(!errors.length,'Page errors: '+errors.join(' | '));
  return 'PASS: card number guard, bank card fields and expiry, phone region inference and masking, email masking, reveal, two-way links listed in the inspector, unlink and undo, delete cleanup, search by tail, category switch, mobile bounds';
 } finally { await p.close(); }
}
