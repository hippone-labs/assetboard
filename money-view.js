// The money side of the free board: 已续费, charges and renewals waiting for an answer, money facts in the detail and the form,
// project views, exports (calendar, handover), the registry check and the menu bar summary. The Pro edition adds the bookkeeping and
// analysis through pro-slots.js. Loaded before app.js; nothing here runs at load time except event listeners, so every helper and
// the state from app.js are there when these functions are called.

const PAYMENT_VIA={renew:tr('续费'),confirm:tr('确认扣款'),manual:tr('手动记录'),agent:tr('外部工具'),evidence:tr('账单')};
function todayIso(){return isoDay(localDay());}
function moneyLine(list){return list.map(([currency,value])=>formatMoney(value,currency)).join(' + ');}
function currencyChoices(current){const codes=[...MAIN_CURRENCIES];if(current&&!codes.includes(current))codes.push(current);return codes.map(code=>[code,currencyDisplay[code]||code]);}
function readAmount(input){const t=String(input?.value||'').trim().replace(/,/g,'');return t===''?null:/^\d+(\.\d{1,2})?$/.test(t)?Number(t):NaN;}
function refuse(input,message){input.setCustomValidity(message);input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});}
function afterMoneyChange(id,message){save();render();if(id&&activeAsset===id)showDetail(id,{focus:false});if(message)toast(message,true);syncStatusItem();}

// Cards, numbers and accounts have no payments of their own (an AI subscription does). A card is not renewed either: a new card is a
// new expiry date in its form, so 已续费 is not offered on it; a number's keep-alive is 已保号.
function ownPayments(a){return !(assetProfiles[a.type]&&a.type!=='ai');}
function renewable(a){return canRenew(a)&&a.type!=='bankcard';}
function renewWord(a){return a.dateKind==='keep'?tr('已保号'):tr('已续费');}
// ---- 已续费 (R): the new date (Pro adds what was paid).
function renewDialog(id){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 if(!renewable(a)){toast(a.hiddenAt?tr('先恢复显示，再续费'):a.type==='bankcard'?tr('换了新卡就在资料里改有效期'):tr('这项没有到期、扣款或保号日期，先在资料里填上'));return;}
 const {base,options}=renewOptions(a),first=options[0];
 modal(a.dateKind==='keep'?tr('保号「{name}」',{name:a.name}):tr('续费「{name}」',{name:a.name}),`<form id="renew-form" class="form" data-id="${esc(id)}" data-base="${esc(base)}">
  <p class="form-note">${tr('现在记的是 {date}（{status}）。续费从这一天往后算。',{date:esc(base),status:esc(assetDateStatus(a).label)})}</p>
  <div class="field"><span class="field-label">${tr('续到')}</span><div class="date-row">${chipGroup('renewStep',options.map(o=>[o.until,o.label]),first.until,tr('续费时长'))}<input name="until" class="date-input" autocomplete="off" inputmode="numeric" aria-label="${tr('新的日期')}" value="${esc(first.until)}"></div></div>
  ${slotHtml('renewFields',a,{base})}
  <div class="form-actions"><button class="button primary" type="submit">${renewWord(a)}</button><span class="form-note">${tr('⌘Z 可撤销')}</span></div>
 </form>`,'renew');
 const form=$('#renew-form');form.dispatchEvent(new Event('change',{bubbles:true}));
 (form.elements.amount||form.elements.until).focus();
}
document.addEventListener('input',e=>{const form=e.target.closest?.('#renew-form');if(form&&e.target.name==='until')setChoice(form,'renewStep','');});
document.addEventListener('change',e=>{const form=e.target.closest?.('#renew-form');if(!form)return;if(e.target.name==='renewStep'&&e.target.value)form.elements.until.value=e.target.value;if(e.target.name==='until'){const d=parseLooseDate(e.target.value);if(d)e.target.value=d;}});
document.addEventListener('submit',e=>{
 if(e.target.id!=='renew-form')return;e.preventDefault();
 const form=e.target,a=state.assets.find(x=>x.id===form.dataset.id);if(!a)return;
 const until=parseLooseDate(form.elements.until.value),paid={};
 if(!until){refuse(form.elements.until,tr('日期无法识别，例如 2027-03-01'));return;}
 for(const read of proSlots.renewRead){const fields=read(form,a);if(!fields)return;Object.assign(paid,fields);}
 checkpoint();
 const result=renewAsset(a,{until,...paid});
 if(!result.ok){history.pop();refuse(form.elements.until,result.error);return;}
 costSource='renew';$('#modal').close();
 const change=result.payment?priceChange(a):null;
 afterMoneyChange(a.id,tr('已续到 {date}',{date:until})+(result.payment?tr('，记下 {amount}',{amount:formatMoney(result.payment.amount,result.payment.currency)}):'')+(change?.up&&change.basis==='payments'?tr('，比上次贵 {pct}%',{pct:Math.round(change.pct*100)}):''));
});

function confirmCharges(list){
 const done=list.filter(({asset,due})=>confirmCharge(asset,due));
 return done.length;
}

// Automatic charges that came due: one answer each — paid as usual, paid a different amount, or not taken.
function chargeRow(c,{named=false}={}){
 const a=c.asset,amount=c.money&&c.money.value>0?formatMoney(c.money.value,c.money.currency):tr('金额未知');
 return `<div class="charge-row" data-asset="${esc(a.id)}">${named?tile(a,'sm'):''}<span class="charge-main">${named?`<span class="charge-name">${esc(displayName(a))}</span>`:''}<span class="charge-sub">${tr('{date} 扣款',{date:esc(c.due)})} · ${esc(amount)} · ${c.days?tr('{n} 天前',{n:c.days}):tr('今天')}</span></span><span class="charge-actions"><button class="button primary" data-action="charge-paid" data-id="${esc(a.id)}" data-due="${esc(c.due)}"${c.money?.value>0?'':' disabled'}>${tr('已扣款')}</button>${proAction('charge-edit')?`<button class="button" data-action="charge-edit" data-id="${esc(a.id)}" data-due="${esc(c.due)}">${tr('金额不同')}</button>`:''}<button class="button quiet" data-action="charge-missed" data-id="${esc(a.id)}" data-due="${esc(c.due)}" title="${tr('这次没有扣款（取消了或扣款失败）')}">${tr('没扣')}</button></span></div>`;
}
// Auto-renewals and repeating keep-alives that came due: either can fail silently, so the date waits for a yes before it rolls on, and
// a no makes it an expiry.
function renewalRow(c,{named=false}={}){
 const a=c.asset;
 return `<div class="charge-row renewal-row" data-asset="${esc(a.id)}">${named?tile(a,'sm'):''}<span class="charge-main">${named?`<span class="charge-name">${esc(displayName(a))}</span>`:''}<span class="charge-sub">${esc(c.due)} ${confirmWords[c.kind].due} · ${c.days===1?tr('昨天'):tr('{n} 天前',{n:c.days})} · ${confirmWords[c.kind].ask}</span></span><span class="charge-actions"><button class="button primary" data-action="renewal-yes" data-id="${esc(a.id)}" data-due="${esc(c.due)}">${confirmWords[c.kind].yes}</button><button class="button quiet" data-action="renewal-no" data-id="${esc(a.id)}" data-due="${esc(c.due)}">${confirmWords[c.kind].no}</button></span></div>`;
}
function renewalsBandHtml(){
 const list=pendingRenewals(state.assets,{since:state.paymentsSince});if(!list.length)return '';
 return `<section class="group charges-band" data-group="renewals" aria-label="${tr('待确认续费')}"><header class="group-head"><h2 class="group-title static" title="${tr('自动续费会静默失败（卡停了、通知发到旧邮箱），保号只有做了才算；在后台看一眼再点')}"><span class="g-name">${tr('待确认续费')}</span><span class="g-count">${formatCount(list.length)}</span></h2></header><div class="group-body list">${list.map(c=>renewalRow(c,{named:true})).join('')}</div></section>`;
}
function renewalAnswer(action,id,due){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 checkpoint();
 const result=confirmRenewal(a,due,{renewed:action==='renewal-yes'});
 if(!result){history.pop();return;}
 const keep=a.dateKind==='keep';
 a.event=`${a.date} ${dateKinds[keep?'keep':'expire'].future}`;
 afterMoneyChange(id,result.renewed?(keep?tr('下次保号 {date}，从 {due} 起算；更早做的话改一下日期',{date:result.date,due}):tr('已续到 {date}',{date:result.date})+(result.payment?tr(' · 记下 {amount}',{amount:formatMoney(result.payment.amount,result.payment.currency)}):'')):(keep?tr('记下了：{due} 已过期，不再按周期保号算',{due}):tr('记下了：{due} 已过期，不再按自动续费算',{due})));
}
// Charges waiting for an answer are Pro: without proSlots.chargesBand only renewals are asked about.
function pendingChargesAsked(assets){return proSlots.chargesBand?pendingCharges(assets,{since:state.paymentsSince}):[];}
function chargesBandHtml(){
 const renewals=renewalsBandHtml(),list=pendingChargesAsked(state.assets);
 return list.length?renewals+proSlots.chargesBand(list):renewals;
}
function chargeAnswer(action,id,due){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 checkpoint();
 const payment=confirmCharge(a,due,{missed:action==='charge-missed'});
 if(!payment){history.pop();toast(proAction('charge-edit')?tr('金额未知，点“金额不同”填上'):tr('金额未知：先在资料里填上费用'));return;}
 afterMoneyChange(id,action==='charge-missed'?tr('记下了：{due} 没有扣款',{due}):tr('已确认 {amount}',{amount:formatMoney(payment.amount,payment.currency)}));
}

// ---- The inspector: billing, promotion, lifecycle and registry facts (Pro adds the project), and what is waiting for an answer.
// Within 30 days of a promotion's end the mark says the price that follows, not just 惠: renewals at several times the first price are
// found out on the day (research S5).
function priceMark(a){
 const promo=validPromotion(a.promotion),left=promo?dayNumber(promo.end)-localDay():-1;
 const regular=promo&&formatMoney(promo.regularAmount,promo.currency),rise=promo&&promo.amount>0&&promo.regularAmount>promo.amount?tr('（+{pct}%）',{pct:Math.round((promo.regularAmount/promo.amount-1)*100)}):'';
 const promoMark=promo&&!promo.settledAt&&left>=0?left<=30?`<span class="price-mark promo" title="${tr('优惠价 {end} 结束，之后 {price}',{end:esc(promo.end),price:esc(regular+rise)})}">${tr('续费 {price}',{price:esc(regular)})}</span>`:`<span class="price-mark promo" title="${tr('优惠价至 {end}，之后 {price}',{end:esc(promo.end),price:esc(regular)})}">${tr('惠')}</span>`:'';
 return promoMark+slotHtml('priceMarks',a);
}
function extraFacts(a){
 const row=(k,html)=>`<div class="fact"><span>${k}</span><span>${html}</span></div>`,out=[];
 const type=billingTypeOf(a);
 if(BILLING_TYPES.includes(a.billingType)||type==='free')out.push(row(tr('计费'),esc(billingLabels[type])));
 const promo=validPromotion(a.promotion);
 if(promo)out.push(row(tr('优惠'),esc(promo.settledAt?tr('已于 {end} 结束，恢复 {price}',{end:promo.end,price:formatMoney(promo.regularAmount,promo.currency)}):tr('{price} 至 {end}，之后 {regular}',{price:formatMoney(promo.amount,promo.currency),end:promo.end,regular:formatMoney(promo.regularAmount,promo.currency)}))));
 const life=lifecycleRule(a);
 // 过期后 reads as a short chain under its label: each stage and its days, what can still be done in its tip, the current one marked.
 if(life){const now=lifecycleOf(a),arrow='<span class="life-arrow" aria-hidden="true">→</span>',from=i=>i?life.stages[i-1].to+1:1;
  const steps=life.stages.map((st,i)=>`<span class="life-step${now?.stage===st?' now':''}" title="${esc(now?.stage===st?st.can+' · '+tr('还剩 {n} 天',{n:now.daysLeft+1}):st.can)}">${esc(st.label.replace(/期$/,''))} ${tr('{from}–{to} 天',{from:from(i),to:st.to})}</span>`).join(arrow);
  const said=life.stages.map((st,i)=>tr('{stage}第 {from} 到 {to} 天，{can}',{stage:st.label,from:from(i),to:st.to,can:st.can})).join(tr('；'))+tr('；之后{end}',{end:life.end});
  out.push(`<div class="fact fact-block"><span>${tr('过期后')}</span><span class="life-steps" role="img" aria-label="${esc(said)}">${steps}${arrow}<span class="life-step" title="${esc(life.end)}">${tr('释放')}</span></span></div>`);}
 const phase=registryPhaseOf(a);if(phase)out.push(row(tr('注册局'),`<strong>${esc(rdapPhaseLabels[phase])}</strong>${a.registryCheckedAt?' · '+tr('{date} 查询',{date:esc(String(a.registryCheckedAt).slice(0,10))}):''}`));
 // A date the registry gave that differs from the stored one waits here until taken; once the stored date matches, it is gone.
 else if(a.registryExpires&&['differs','missing'].includes(rdapCompare(a,{expires:a.registryExpires}).state))out.push(row(tr('注册局'),`${tr('{date} 到期',{date:esc(a.registryExpires)})}${a.registryCheckedAt?' · '+tr('{date} 查询',{date:esc(String(a.registryCheckedAt).slice(0,10))}):''} <button class="text-button" data-action="rdap-apply" data-id="${esc(a.id)}">${tr('改成这个')}</button>`));
 // A check that agreed leaves only its date (research D4); after 30 days it is said as an age, quietly, so a new check looks due.
 else if(a.type==='domain'&&Date.parse(a.registryCheckedAt||'')){const days=Math.floor((Date.now()-Date.parse(a.registryCheckedAt))/86400000);out.push(row(tr('注册局'),days>30?`<span class="quiet-fact">${tr('{n} 天前核对',{n:days})}</span>`:`${tr('核对一致')} · ${esc(String(a.registryCheckedAt).slice(0,10))}`));}
 return out.join('')+slotHtml('facts',a,row);
}
function paymentsSection(a){
 if(a.hiddenAt)return '';
 // Cards, numbers and accounts have no payments of their own, but a keep-alive deadline that came due still asks here.
 const own=ownPayments(a),renewals=pendingRenewals([a],{since:state.paymentsSince}),charges=own?pendingChargesAsked([a]):[];
 if(own&&proSlots.paymentsSection)return proSlots.paymentsSection(a,{renewals,charges});
 if(!renewals.length&&!charges.length)return '';
 return `<section class="pay-section" aria-label="${tr('待确认')}"><div class="pay-head"><h3>${tr('待确认')}</h3></div>${renewals.map(c=>renewalRow(c)).join('')}${charges.map(c=>chargeRow(c)).join('')}</section>`;
}

// ---- The form: billing type (inside 更多); Pro adds the project, promotion, owner and person in charge.
function moneyFormFields(v){
 return `<div class="field"><span class="field-label" title="${tr('自动：金额为 0 算免费，有周期算周期付费')}">${tr('计费方式')}</span>${chipGroup('billingType',[['',tr('自动')],['recurring',billingLabels.recurring],['one_off',billingLabels.one_off],['free',billingLabels.free]],BILLING_TYPES.includes(v.billingType)&&v.billingType!=='unknown'?v.billingType:'',tr('计费方式'))}</div>${slotHtml('formFields',v)}`;
}
// Reads those fields back; null (after pointing at the field) when something cannot be saved. Fields without a form field here are
// left out, so what the Pro edition wrote (a project, a promotion, an owner) stays as it was.
function moneyFromForm(form,data,current){
 const out={billingType:String(data.get('billingType')||'')};
 if(!BILLING_TYPES.includes(out.billingType))out.billingType='';
 for(const read of proSlots.formRead){const fields=read(form,data,current);if(!fields)return null;Object.assign(out,fields);}
 return out;
}

// ---- Projects are Pro: its script draws the sidebar group, the detail row, the form field and the head of a project view.
// Without it a project view is no view at all, so a remembered one falls back to 全部资产.
function projectViewName(v){return projectsOn()&&typeof v==='string'&&v.startsWith('project:')?v.slice(8):'';}
function projectNavHtml(){return proSlots.projectNav?.()||'';}
function toolsNavHtml(){
 if(!state.assets.length)return '';
 return `${slotHtml('toolsNav')}<button class="nav-item" data-action="export" data-id="export">${ui('download')}<span class="nav-label">${tr('导出')}</span></button>`;
}
function projectBoardHtml(name){
 const list=projectAssets(state.assets,name);
 if(!list.length)return {html:viewEmpty(ui('stack'),tr('这个项目里没有显示中的资产')),count:0};
 const head=slotHtml('projectBar',name,list);
 const groups=categoryIds().map(id=>{const own=list.filter(a=>a.type===id);return own.length?groupHtml({id,title:cats[id].name,glyph:`<span class="g-icon">${icon(id)}</span>`,list:own,summary:groupSummary(own)}):'';}).join('');
 return {html:head+groups,count:list.length};
}
// ---- Exports: files the person keeps or hands on (Pro adds the payment ledger). In the Mac app a save panel writes them; in the browser they download.
// Only the backup comes back in (导入 or 从备份恢复 here); the others are read-only copies, marked 只读, and the import names them when dropped.
function saveFile(name,text,mime){
 if(nativeStore){if(demoMode){toast(tr('演示模式下不可用'));return;}window.webkit.messageHandlers.assetboard.postMessage({action:'saveFile',name,text,mime});return;}
 const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:mime}));link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
window.assetboardFileSaved=(ok,error)=>toast(ok?tr('已保存'):error?tr('没有保存：{error}',{error:String(error).slice(0,120)}):tr('已取消'));
function exportDialog(){
 const dated=state.assets.filter(a=>!a.hiddenAt&&!a.stopped&&dayNumber(a.date)!==null).length;
 const readOnly=`<span class="fmt" title="${tr('只用来阅读，导不回来；恢复用资产备份')}">${tr('只读')}</span>`;
 modal(tr('导出'),`<div class="export-list">
  <section class="export-card"><div><h3>${ui('stack')}${tr('资产备份')}</h3><p class="form-note">${tr('全部资料、关联和付款记录，换机器或出了问题时从这里恢复。导入时可以合并，也可以整体替换，⌘Z 可撤销。')}</p></div><div class="export-buttons"><button class="button primary" data-action="export-board">${tr('导出 .json')}</button><button class="button" data-action="restore-backup">${tr('从备份恢复…')}</button><input type="file" id="backup-file" accept=".json,application/json" hidden></div></section>
  <section class="export-card"><div><h3>${ui('clock')}${tr('日历')}${readOnly}</h3><p class="form-note">${tr('{n} 个到期和扣款日，按周期重复，提前提醒和 App 一样。导入“日历”或任何日历软件；日期变了要重新导出。',{n:formatCount(dated)})}</p></div><button class="button" data-action="export-ics">${tr('导出 .ics')}</button></section>
  ${slotHtml('exportCards')}
  <section class="export-card"><div><h3>${ui('mail')}${tr('交接清单')}${readOnly}</h3><p class="form-note">${tr('一页能离开 App 独立阅读的清单：有什么、在哪个账号、多少钱、什么时候到期、谁付款。给家人、合伙人或接手的人。不含密码。')}</p><label class="check-label"><input type="checkbox" id="handover-mask"${privacy?' checked':''}>${tr('遮住名称、账号和 IP')}</label></div><button class="button" data-action="export-handover">${tr('导出 .html')}</button></section>
 </div>`,'export');
 $('#backup-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;$('#modal').close();routeImportText(await file.text(),{filename:file.name,mime:file.type});});
}
function exportRun(kind){
 const day=todayIso();
 if(kind==='backup'){saveFile(`Assetboard-backup-${day}.json`,JSON.stringify(state,null,1),'application/json');if(!nativeStore)window.assetboardExported();return;}
 if(kind==='ics'){saveFile(`Assetboard-${day}.ics`,calendarIcs(state.assets,{name:tr('Assetboard 到期与扣款')}),'text/calendar');return;}
 if(kind==='handover'){const mask=!!$('#handover-mask')?.checked;try{localStorage.setItem(HANDOVER_KEY,new Date().toISOString());}catch{}saveFile(tr('Assetboard-交接清单-{day}.html',{day}),handoverHtml(state,{mask,types:Object.fromEntries(Object.entries(cats).map(([id,c])=>[id,c.name])),order:categoryIds()}),'text/html');}
}

// ---- Cost panel extras: Pro adds paid this year, the next 12 months, and splits by project and owner.
function costExtrasHtml(scope,cur){return slotHtml('costExtras',scope,cur);}

// ---- 核对注册局日期: RDAP through the Mac app (recorded in 网络记录); the answer can correct the stored expiry.
const rdapRequests=new Map();let rdapSequence=0;
function rdapDomain(a){const name=String(a?.name||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(name)?registrableDomain(name)||name:'';}
function rdapCheck(id){
 const a=state.assets.find(x=>x.id===id),domain=rdapDomain(a);
 if(!domain){toast(tr('名称不是域名，无法核对'));return;}
 if(!nativeStore||demoMode){toast(tr('只能在 Mac App 里向注册局核对'));return;}
 const requestId=++rdapSequence;rdapRequests.set(requestId,{id});
 window.webkit.messageHandlers.assetboard.postMessage({action:'rdap',requestId,domain});
 toast(tr('正在向 {domain} 的注册局查询…',{domain}));
 setTimeout(()=>{if(rdapRequests.delete(requestId))toast(tr('注册局没有回应，稍后再试'));},20000);
}
window.assetboardRdap=async result=>{
 const ask=rdapRequests.get(result?.requestId);if(!ask)return;rdapRequests.delete(result.requestId);
 const id=ask.id,a=state.assets.find(x=>x.id===id);if(!a){if(ask.auto)rdapAutoNext();return;}
 if(ask.auto){rdapAutoAnswer(a,result);rdapAutoNext();return;}
 if(!result.ok){toast(tr('没有查到：{error}',{error:String(result.error||tr('注册局不支持')).slice(0,100)}));return;}
 const facts=rdapFacts(result.json),cmp=rdapCompare(a,facts);
 if(cmp.state==='phase'){
  a.registryCheckedAt=new Date().toISOString();a.registryPhase=cmp.phase;save();if(activeAsset===id)showDetail(id,{focus:false});
  const what={autoRenew:cmp.registry?tr('注册局已经按惯例先延了一年（到 {date}），这不代表续费成功：注册商没收到钱的话，会在 45 天宽限期内删除。去注册商后台确认是否续上。',{date:cmp.registry}):tr('注册局已经按惯例先延了一年，这不代表续费成功：注册商没收到钱的话，会在 45 天宽限期内删除。去注册商后台确认是否续上。'),
   redemption:tr('域名已过期，正处在赎回期：还能赎回，但通常要另付一笔赎回费，期满后进入待删除，然后任何人都能注册。'),
   pendingRestore:tr('注册商已经提交赎回，注册局正在处理。'),
   pendingDelete:tr('域名即将被注册局删除，已经不能赎回；删除后任何人都能注册。')}[cmp.phase];
  await confirmDialog(tr('{name}：{phase}',{name:a.name,phase:rdapPhaseLabels[cmp.phase]}),what,tr('知道了'));
  return;
 }
 if(cmp.state==='unknown'){toast(tr('注册局没有给出到期日'));return;}
 if(cmp.state==='same'){a.registryCheckedAt=new Date().toISOString();delete a.registryPhase;delete a.registryExpires;save();toast(tr('注册局到期日 {date}，和记录一致',{date:cmp.registry})+(facts.registrar?` · ${facts.registrar}`:''));if(activeAsset===id)showDetail(id,{focus:false});return;}
 const said=tr('注册局记录「{name}」{date} 到期',{name:a.name,date:cmp.registry})+(facts.registrar?tr('（{registrar}）',{registrar:facts.registrar}):'');
 const ok=await confirmDialog(cmp.state==='missing'?tr('填上到期日 {date}？',{date:cmp.registry}):tr('改成注册局的 {date}？',{date:cmp.registry}),cmp.state==='missing'?said+tr('，这里还没有日期。'):said+tr('，这里记的是 {date}。\n注册局的日期晚，多半是已经自动续费了；早，说明自动续费可能没开。',{date:cmp.stored}),tr('改日期'));
 if(!ok)return;
 rdapApply(a,cmp.registry);
};
function rdapApply(a,date){
 checkpoint();a.date=date;a.dateKind=a.dateKind==='renew'?'renew':'expire';a.event=`${a.date} ${dateKinds[a.dateKind].future}`;a.registryCheckedAt=a.updatedAt=new Date().toISOString();delete a.registryPhase;delete a.registryExpires;
 afterMoneyChange(a.id,tr('到期日改为 {date}',{date}));
}
// ---- 每周核对注册局 (research #3, U5): off until turned on in the domain category's settings (state.rdapAuto), because it reaches
// public registries. Then every domain is checked once every RDAP_REFRESH_DAYS, one at a time, rdapGapMs apart, on opening and every
// 6 hours. The answer never overwrites a date: the same date or a lifecycle phase is just recorded (the phase shows on the row), and a
// different date waits in the detail as 注册局记的是… for the person to take (registryExpires). A failed lookup waits a week too
// (registryTriedAt), so a TLD without RDAP is not asked again every 6 hours.
const RDAP_REFRESH_DAYS=7;
let rdapQueue=[],rdapBusy=false,rdapGapMs=4000;
function rdapAutoOn(){return !!state.rdapAuto&&!!nativeStore&&!demoMode;}
function rdapAutoDue(now=new Date()){
 const last=a=>Math.max(Date.parse(a.registryCheckedAt)||0,Date.parse(a.registryTriedAt)||0);
 return state.assets.filter(a=>a.type==='domain'&&!a.hiddenAt&&!a.stopped&&rdapDomain(a)&&now-last(a)>=RDAP_REFRESH_DAYS*86400000).sort((x,y)=>last(x)-last(y)).map(a=>a.id);
}
function rdapAutoRun(){if(!rdapAutoOn()||rdapBusy)return;rdapQueue=rdapAutoDue();rdapAutoNext();}
function rdapAutoNext(){
 rdapBusy=false;if(!rdapAutoOn())return;
 const id=rdapQueue.shift();if(!id)return;const a=state.assets.find(x=>x.id===id),domain=rdapDomain(a);if(!domain){rdapAutoNext();return;}
 rdapBusy=true;
 setTimeout(()=>{
  const requestId=++rdapSequence;rdapRequests.set(requestId,{id,auto:true});
  window.webkit.messageHandlers.assetboard.postMessage({action:'rdap',requestId,domain});
  setTimeout(()=>{if(rdapRequests.delete(requestId)){a.registryTriedAt=new Date().toISOString();save();rdapAutoNext();}},20000);
 },rdapGapMs);
}
function rdapAutoAnswer(a,result){
 const now=new Date().toISOString(),facts=result.ok?rdapFacts(result.json):null,cmp=facts?rdapCompare(a,facts):{state:'unknown'};
 if(cmp.state==='unknown'){a.registryTriedAt=now;save();return;}
 a.registryCheckedAt=now;delete a.registryTriedAt;
 if(cmp.state==='phase')a.registryPhase=cmp.phase;else delete a.registryPhase;
 if(cmp.state==='differs'||cmp.state==='missing')a.registryExpires=cmp.registry;else delete a.registryExpires;
 save();render();if(activeAsset===a.id&&!$('#detail').hidden)showDetail(a.id,{focus:false});
}

// ---- Menu bar: the next few dates and charges waiting, sent to the Mac app whenever they change.
// The Chinese title adds the kind to the short date ("12 天到期"); other languages take the status label, which already says both.
let statusSent='';
function syncStatusItem(){
 if(!nativeStore||demoMode)return;
 try{
  const events=upcomingEvents(state.assets,new Date(),30),charges=pendingChargesAsked(state.assets),cur=totalCurrency(),t=costTotals(liveAssets(),{currency:cur,rates:fx.rates});
  const urgent=events.filter(e=>e.status.days<=7).length;
  const summary={badge:urgent+charges.length,monthly:t.items.length?tr('{amount} / 月',{amount:formatMoney(t.monthly,cur)}):'',charges:charges.length,items:events.slice(0,8).map(({asset,status})=>({id:asset.id,title:`${veil(asset.name)}  ·  ${appLang==='zh'?agendaWhen(status)+(status.days>=0?(dateKinds[status.kind]||dateKinds.expire).future:''):status.label}`.slice(0,80),level:status.level}))};
  const json=JSON.stringify(summary);if(json===statusSent)return;statusSent=json;
  window.webkit.messageHandlers.assetboard.postMessage({action:'statusSummary',summary});
 }catch{}
}

// Clicks for everything above, delegated once; actions this file does not know go to the Pro edition's handlers.
document.addEventListener('click',e=>{
 const el=e.target.closest?.('[data-action]');if(!el)return;
 const action=el.dataset.action,id=el.dataset.id;
 const handlers={
  'renew':()=>renewDialog(id),
  'charge-paid':()=>chargeAnswer(action,id,el.dataset.due),'charge-missed':()=>chargeAnswer(action,id,el.dataset.due),
  'charges-all':()=>{const list=pendingCharges(state.assets,{since:state.paymentsSince}).filter(c=>c.money?.value>0);if(!list.length)return;checkpoint();const n=confirmCharges(list);afterMoneyChange(null,tr('已确认 {n} 笔扣款',{n:formatCount(n)}));},
  'export':()=>exportDialog(),
  'export-ics':()=>exportRun('ics'),'restore-backup':()=>$('#backup-file')?.click(),'export-handover':()=>exportRun('handover'),
  'rdap':()=>rdapCheck(id),
  'renewal-yes':()=>renewalAnswer(action,id,el.dataset.due),'renewal-no':()=>renewalAnswer(action,id,el.dataset.due)
 };
 const pro=Object.hasOwn(handlers,action)?null:proAction(action);
 if(!pro&&!Object.hasOwn(handlers,action))return;
 e.preventDefault();e.stopPropagation();closeMenu?.(false);if(pro)pro(el,id);else handlers[action]();
},true);
