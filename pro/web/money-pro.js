// Pro: the money bookkeeping and analysis on top of the free board — what was actually paid (the 已续费 amount, 记一笔, a charge
// of a different amount, the payment list), price rises, promotions and owners in the form, project totals and the shutdown list,
// 定期清理, the payment ledger and the cost panel's paid / forecast / split part. It fills the slots in pro-slots.js; the data it
// writes stays readable by the free edition. Loaded after money-view.js and before app.js; with ?free it registers nothing.

// ---- 已续费: what was paid, and the price when it moved.
function renewPaidFields(a,{base}){
 const money=moneyOn(a,dayNumber(base)),currency=money?.currency||defaultCurrency();
 return `<div class="field"><span class="field-label">${tr('实付')}</span><div class="cost-row"><input name="amount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="${tr('不填只改日期')}" aria-label="${tr('实付金额')}">${chipGroup('currency',currencyChoices(currency),currency,tr('币种'))}</div></div>
  <label>${tr('付款日')}<input name="paidOn" autocomplete="off" inputmode="numeric" value="${todayIso()}"></label>
  <label class="check-label renew-cost" hidden><input type="checkbox" name="updateCost" checked><span></span></label>`;
}
function renewPaidRead(form){
 const amount=readAmount(form.elements.amount),paidOn=parseLooseDate(form.elements.paidOn.value);
 if(Number.isNaN(amount)){refuse(form.elements.amount,tr('请填写数字金额，例如 89 或 10.98'));return null;}
 if(!paidOn){refuse(form.elements.paidOn,tr('日期无法识别'));return null;}
 return {amount:amount||0,currency:form.elements.currency.value,paidOn,updateCost:!form.querySelector('.renew-cost').hidden&&form.elements.updateCost.checked};
}
// The amount follows the chosen term (two years of a yearly price is twice the price) until someone types their own.
function renewSuggest(form){
 const a=state.assets.find(x=>x.id===form.dataset.id);if(!a)return;
 const until=parseLooseDate(form.elements.until.value),months=until?monthsBetween(form.dataset.base,until):null,money=moneyOn(a,dayNumber(form.dataset.base));
 const amount=form.elements.amount;
 if(!amount.dataset.touched){const fit=money?.months&&money.value>0&&months&&months%money.months===0;amount.value=fit?String(roundMoney(money.value*months/money.months)):'';}
 const value=readAmount(amount),currency=form.elements.currency.value,cost=value>0&&months?costFromPayment(a,{amount:value,currency,months}):'';
 const own=costAmount(a),same=own&&own.value===value&&own.currency===currency&&own.months===months;
 const label=form.querySelector('.renew-cost');label.hidden=!cost||!!same;
 if(!label.hidden)label.querySelector('span').textContent=tr('同时把费用改成 {cost}',{cost})+(a.cost&&a.cost!=='未知'?tr('（原来 {cost}）',{cost:a.cost}):'');
}

// ---- Payments: 记一笔, or a charge whose amount was not the usual one.
function paymentDialog(id,{due=''}={}){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 const money=moneyOn(a,dayNumber(due||todayIso())),currency=money?.currency||defaultCurrency();
 modal(due?tr('「{name}」{date} 的扣款',{name:a.name,date:due}):tr('记一笔「{name}」的付款',{name:a.name}),`<form id="payment-form" class="form" data-id="${esc(id)}" data-due="${esc(due)}">
  <div class="field"><span class="field-label">${tr('金额')}</span><div class="cost-row"><input name="amount" inputmode="decimal" autocomplete="off" maxlength="12" required aria-label="${tr('金额')}" value="${money&&money.value>0?esc(String(money.value)):''}">${chipGroup('currency',currencyChoices(currency),currency,tr('币种'))}</div></div>
  <label>${tr('付款日')}<input name="paidOn" autocomplete="off" inputmode="numeric" value="${esc(due||todayIso())}"></label>
  <label>${tr('备注')}<input name="note" maxlength="200" autocomplete="off" placeholder="${tr('例如：含税、用了优惠码')}"></label>
  ${money?.months&&costAmount(a)?`<label class="check-label"><input type="checkbox" name="updateCost"><span>${tr('以后按这个金额计费')}</span></label>`:''}
  <div class="form-actions"><button class="button primary" type="submit">${tr('记下')}</button><span class="form-note">${tr('⌘Z 可撤销')}</span></div>
 </form>`,'payment');
 const input=$('#payment-form [name="amount"]');input.focus();input.select();
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='payment-form')return;e.preventDefault();
 const form=e.target,a=state.assets.find(x=>x.id===form.dataset.id);if(!a)return;
 const amount=readAmount(form.elements.amount),paidOn=parseLooseDate(form.elements.paidOn.value),due=form.dataset.due,currency=form.elements.currency.value;
 if(!(amount>0)){refuse(form.elements.amount,tr('请填写大于 0 的金额'));return;}
 if(!paidOn){refuse(form.elements.paidOn,tr('日期无法识别'));return;}
 checkpoint();
 const months=billingCycles[a.cycle]?.months||costAmount(a)?.months||null;
 recordPayment(a,{paidOn,amount,currency,months,covers:due,via:due?'confirm':'manual',note:form.elements.note.value.trim()});
 if(form.elements.updateCost?.checked){const cost=costFromPayment(a,{amount,currency,months});if(cost)a.cost=cost;}
 a.updatedAt=new Date().toISOString();costSource='payment';$('#modal').close();
 afterMoneyChange(a.id,tr('已记下 {amount}',{amount:formatMoney(amount,currency)}));
});
// The detail's payment section: what is waiting, the latest payments and this year's total.
function proPaymentsSection(a,{renewals,charges}){
 const list=paymentList(a).slice().reverse(),year=new Date().getFullYear(),paid=paidTotals([a],{from:`${year}-01-01`,to:`${year}-12-31`});
 if(!list.length&&!charges.length&&!renewals.length&&!costAmount(a)&&!canRenew(a))return '';
 const shown=list.slice(0,5);
 const items=shown.map(p=>`<li class="${p.status==='missed'?'missed':''}"><span class="pay-date">${esc(p.paidOn)}</span><span class="pay-amount">${p.status==='missed'?tr('未扣款'):esc(formatMoney(p.amount,p.currency))}</span><span class="pay-via">${esc([PAYMENT_VIA[p.via]||'',p.covers&&p.covers!==p.paidOn?tr('对应 {date}',{date:p.covers}):'',p.note].filter(Boolean).join(' · '))}</span><button class="icon-button pay-remove" data-action="payment-remove" data-id="${esc(a.id)}" data-payment="${esc(p.id)}" aria-label="${tr('删除这条记录')}" title="${tr('删除这条记录')}">×</button></li>`).join('');
 return `<section class="pay-section" aria-label="${tr('付款')}"><div class="pay-head"><h3>${tr('付款')}</h3>${paid.count?`<span class="pay-year">${tr('{year} 年已付 {amount}',{year,amount:esc(moneyLine(paid.byCurrency))})}</span>`:''}<button class="text-button" data-action="payment-add" data-id="${esc(a.id)}">${tr('记一笔')}</button></div>${renewals.map(c=>renewalRow(c)).join('')}${charges.map(c=>chargeRow(c)).join('')}${items?`<ul class="pay-list">${items}</ul>${list.length>shown.length?`<p class="pay-more">${tr('另有 {n} 条，导出账本可看全部',{n:formatCount(list.length-shown.length)})}</p>`:''}`:charges.length||renewals.length?'':`<p class="pay-empty">${tr('还没有付款记录。续费（R）或确认扣款时会记在这里。')}</p>`}</section>`;
}
function removePaymentRecord(id,paymentId){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 checkpoint();if(!removePayment(a,paymentId)){history.pop();return;}
 afterMoneyChange(id,tr('已删除这条付款记录'));
}

// ---- Facts and marks: price rises, and who owns a record.
function priceMovedMark(a){
 const c=priceChange(a);if(!c)return '';
 return `<span class="price-mark ${c.up?'up':'down'}" title="${tr('{dir}：上次 {before}，现在 {after}',{dir:c.up?tr('涨价'):tr('降价'),before:esc(formatMoney(c.before,c.currency)),after:esc(formatMoney(c.after,c.currency))})}">${c.up?'↑':'↓'}${Math.round(Math.abs(c.pct)*100)}%</span>`;
}
function proFacts(a,row){
 const out=[],c=priceChange(a);
 if(c)out.push(row(c.up?tr('涨价'):tr('降价'),`<span class="price-delta ${c.up?'up':'down'}">${esc(formatMoney(c.before,c.currency))} → ${esc(formatMoney(c.after,c.currency))}${tr('（{change}）',{change:`${c.up?'+':'−'}${Math.round(Math.abs(c.pct)*100)}%`})}</span>`));
 return out.join('');
}

// ---- Projects: the sidebar group, the detail row and the form field (the views, totals and shutdown list are below).
// Each project keeps a colour of its own (from its name), so it can be told apart when the sidebar is only icons.
function projectHue(name){let h=0;for(const ch of String(name))h=(h*31+ch.codePointAt(0))%360;return h;}
function proProjectNav(){
 const names=projectNames(state.assets);if(!names.length)return '';
 const cur=currentView();
 return `<div class="nav-group nav-projects" role="group" aria-labelledby="nav-projects-title"><h2 class="nav-title" id="nav-projects-title">${tr('项目',null,'nav')}</h2>${names.map(({name,count})=>{const id='project:'+name,on=!query&&cur===id&&!(typeof panoOpen!=='undefined'&&panoOpen);return `<button class="nav-item${on?' active':''}" data-action="view" data-id="${esc(id)}"${on?' aria-current="page"':''} aria-label="${tr('项目 {name}，{n} 项',{name:esc(name),n:count})}"><span class="nav-icon project-dot" data-initial="${esc([...name][0].toUpperCase())}" style="--project-hue:${projectHue(name)}" aria-hidden="true"></span><span class="nav-label">${esc(name)}</span>${navCount(count)}</button>`;}).join('')}</div>`;
}
function projectFact(a,row){return a.project?row(tr('项目'),`<button class="text-button inline-button" data-action="view" data-id="${esc('project:'+cleanProject(a.project))}">${esc(a.project)}</button>`):'';}
function projectFormField(v){
 return `<label>${tr('项目')}<input name="project" maxlength="40" autocomplete="off" list="project-list" value="${esc(v.project||'')}" placeholder="${tr('例如 notes-app')}"></label>
 <datalist id="project-list">${projectNames(state.assets).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist>`;
}
function projectFormRead(form,data){return {project:cleanProject(data.get('project'))};}

// ---- The form (inside 更多): the promotion.
function proFormFields(v){
 const promo=validPromotion(v.promotion);
 return `<div class="field"><span class="field-label" title="${tr('优惠期内按优惠价统计，结束后自动换成恢复价并记入价格历史')}">${tr('优惠价')}</span><div class="promo-row"><input name="promoAmount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="8" aria-label="${tr('优惠价')}" value="${promo&&!promo.settledAt?esc(String(promo.amount)):''}"><span>${tr('至')}</span><input name="promoEnd" autocomplete="off" inputmode="numeric" placeholder="2026-12-31" aria-label="${tr('优惠结束日期')}" value="${promo&&!promo.settledAt?esc(promo.end):''}"><span>${tr('之后')}</span><input name="promoRegular" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="${tr('原价')}" aria-label="${tr('恢复价')}" value="${promo&&!promo.settledAt?esc(String(promo.regularAmount)):''}"></div></div>`;
}
// Reads those fields back; null (after pointing at the field) when something cannot be saved.
function proFormRead(form,data,current){
 const amount=readAmount(form.elements.promoAmount),regular=readAmount(form.elements.promoRegular),endText=String(data.get('promoEnd')||'').trim(),end=endText?parseLooseDate(endText):'';
 const out={};
 const any=amount!==null||endText||regular!==null;
 if(!any){out.promotion=validPromotion(current?.promotion)?.settledAt?current.promotion:null;return out;}
 if(Number.isNaN(amount)||amount===null){refuse(form.elements.promoAmount,tr('请填写优惠价，例如 8（免费填 0）'));return null;}
 if(!end){refuse(form.elements.promoEnd,tr('请填写优惠结束日期，例如 2026-12-31'));return null;}
 const own=costParts(form.elements.amount?.value?`${form.elements.currency?.value||''} ${form.elements.amount.value}`:'');
 const regularValue=regular??(Number(String(form.elements.amount?.value||'').replace(/,/g,''))||null);
 if(Number.isNaN(regular)||!(regularValue>0)){refuse(form.elements.promoRegular,tr('请填写优惠结束后的价格'));return null;}
 const old=validPromotion(current?.promotion);
 const promo=validPromotion({start:old&&!old.settledAt?old.start:todayIso(),end,amount,regularAmount:regularValue,currency:form.elements.currency?.value||own?.currency||defaultCurrency()});
 if(!promo){refuse(form.elements.promoEnd,tr('优惠信息不完整'));return null;}
 if(old&&!old.settledAt&&old.end===promo.end&&old.amount===promo.amount&&old.regularAmount===promo.regularAmount&&old.currency===promo.currency)promo.start=old.start;
 out.promotion=promo;
 return out;
}

// ---- Projects: the totals bar and the shutdown list.
function proProjectBar(name,list){
 const cur=totalCurrency(),t=costTotals(list,{currency:cur,rates:fx.rates}),plan=shutdownPlan(state.assets,name,{currency:cur,rates:fx.rates});
 return `<div class="project-bar"><div class="project-facts"><span>${tr('{amount} / 月',{amount:`<b>${esc(formatMoney(t.monthly,cur))}</b>`})}</span>${t.oneOffTotal?`<span>${tr('一次性 {amount}',{amount:esc(formatMoney(t.oneOffTotal,cur))})}</span>`:''}</div><button class="button" data-action="shutdown" data-id="${esc(name)}"${plan.steps.length?'':' disabled'}>${tr('关停清单')}</button></div>`;
}
function shutdownDialog(name){
 const cur=totalCurrency(),plan=shutdownPlan(state.assets,name,{currency:cur,rates:fx.rates});
 if(!plan.steps.length){toast(tr('这个项目没有要处理的资产'));return;}
 const when=s=>s.deadline?s.days<0?tr('已过 {n} 天（{date}）',{n:-s.days,date:s.deadline}):s.days===0?tr('今天（{date}）',{date:s.deadline}):tr('{n} 天内，{date} 前',{n:s.days,date:s.deadline}):tr('不急');
 modal(tr('关停「{name}」',{name:plan.name}),`<form id="shutdown-form" class="form" data-project="${esc(plan.name)}">
  <p class="form-note">${tr('按截止日期排好：赶在日期前处理，就不会再扣下一期。处理完勾上，Assetboard 会把它标为停用或隐藏（⌘Z 可撤销）；线上的东西要你自己去关。')}</p>
  <ol class="shutdown-list">${plan.steps.map(s=>`<li class="shutdown-step${s.done?' done':''}"><label><input type="checkbox" name="done" value="${esc(s.asset.id)}"${s.done?' checked disabled':''}><span class="shutdown-main"><strong>${esc(displayName(s.asset))}</strong><span class="shutdown-action">${esc(s.action)}</span><span class="shutdown-meta">${esc([cats[s.asset.type]?.one,when(s),s.monthly?tr('省 {amount} / 月',{amount:formatMoney(s.monthly,cur)}):''].filter(Boolean).join(' · '))}</span>${s.shared.length?`<span class="shutdown-warn">${ui('warn')}${tr('还关联着项目外的 {names}',{names:esc(s.shared.slice(0,3).join(tr('、')))+(s.shared.length>3?tr(' 等 {n} 项',{n:s.shared.length}):'')})}</span>`:''}</span></label>${safeManagementUrl(s.asset.url)?`<button type="button" class="button" data-action="external" data-id="${esc(s.asset.id)}">${tr('打开')}</button>`:''}</li>`).join('')}</ol>
  ${plan.kept.length?`<p class="form-note">${tr('保留：{names}（卡、手机号和账号不随项目关停）',{names:esc(plan.kept.map(a=>a.name).join(tr('、')))})}</p>`:''}
  <div class="form-actions"><button class="button primary" type="submit">${tr('完成勾选的')}</button><button type="button" class="button" data-action="shutdown-copy" data-id="${esc(plan.name)}">${tr('复制清单')}</button><span class="form-note">${tr('全部关掉每月省 {amount}',{amount:esc(formatMoney(plan.monthlySaving,cur))})}</span></div>
 </form>`,'shutdown');
}
function shutdownText(name){
 const cur=totalCurrency(),plan=shutdownPlan(state.assets,name,{currency:cur,rates:fx.rates});
 return [tr('关停「{name}」',{name:plan.name}),...plan.steps.map((s,i)=>`${i+1}. ${s.done?'[x]':'[ ]'} ${tr('{name}：{action}',{name:s.asset.name,action:s.action})}${s.deadline?tr('（{date} 前）',{date:s.deadline}):''}${s.shared.length?tr(' ⚠ 还关联 {names}',{names:s.shared.join(tr('、'))}):''}`),...(plan.kept.length?[tr('保留：{names}',{names:plan.kept.map(a=>a.name).join(tr('、'))})]:[])].join('\n');
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='shutdown-form')return;e.preventDefault();
 const ids=[...e.target.querySelectorAll('input[name="done"]:checked:not(:disabled)')].map(input=>input.value);
 if(!ids.length){$('#modal').close();return;}
 checkpoint();const now=new Date().toISOString();let stopped=0,hidden=0;
 for(const id of ids){const a=state.assets.find(x=>x.id===id);if(!a)continue;if(STOPPABLE.includes(a.type)){a.stopped=true;stopped++;}else{a.hiddenAt=now;hidden++;}a.updatedAt=now;}
 $('#modal').close();afterMoneyChange(null,[stopped&&tr('{n} 项标为停用',{n:stopped}),hidden&&tr('{n} 项已隐藏',{n:hidden})].filter(Boolean).join(tr('，')));
});

// ---- 定期清理: one record at a time, the most expensive and longest untouched first. K keep, S stop, H hide, → later.
let reviewRun=null;
function reviewDialog(){
 const queue=reviewQueue(state.assets,{currency:totalCurrency(),rates:fx.rates});
 if(!queue.length){toast(tr('没有需要过一遍的：最近都看过了'));return;}
 reviewRun={ids:queue.map(x=>x.asset.id),index:0,kept:0,stopped:0,hidden:0};reviewStep();
}
function reviewStep(){
 const run=reviewRun;if(!run)return;
 while(run.index<run.ids.length&&!state.assets.some(a=>a.id===run.ids[run.index]&&!a.hiddenAt&&!a.stopped))run.index++;
 if(run.index>=run.ids.length){const done=[run.kept&&tr('保留 {n}',{n:run.kept}),run.stopped&&tr('停用 {n}',{n:run.stopped}),run.hidden&&tr('隐藏 {n}',{n:run.hidden})].filter(Boolean).join(tr('，'));reviewRun=null;$('#modal').close();toast(done?tr('清理完了：{done}',{done}):tr('清理完了'),!!done);return;}
 const a=state.assets.find(x=>x.id===run.ids[run.index]),cur=totalCurrency(),entry=reviewQueue([a],{currency:cur,rates:fx.rates})[0]||{monthly:0,idle:0},status=assetDateStatus(a),last=lastPayment(a);
 const facts=[[cats[a.type]?.name,a.provider==='平台待补充'?'':a.provider].filter(Boolean).join(' · '),entry.monthly?tr('约 {monthly} / 月（一年 {yearly}）',{monthly:formatMoney(entry.monthly,cur),yearly:formatMoney(entry.monthly*12,cur)}):'',status.level!=='none'?status.label:'',tr('{n} 天没动过',{n:entry.idle}),last?tr('上次付款 {date} · {amount}',{date:last.paidOn,amount:formatMoney(last.amount,last.currency)}):'',a.purpose&&a.purpose!==cats[a.type]?.name?tr('用途：{purpose}',{purpose:a.purpose}):'',a.reason?tr('保留原因：{reason}',{reason:a.reason}):'',a.project?tr('项目：{project}',{project:a.project}):''].filter(Boolean);
 modal(tr('定期清理'),`<div class="review-card" data-id="${esc(a.id)}"><div class="review-progress"><span>${run.index+1} / ${run.ids.length}</span><b aria-hidden="true"><i style="width:${Math.round(run.index/run.ids.length*100)}%"></i></b></div>
  <div class="review-head">${tile(a,'lg')}<div><h3>${esc(displayName(a))}</h3><p class="form-note">${tr('还在用吗？')}</p></div></div>
  <ul class="review-facts">${facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
  <div class="review-actions"><button class="button primary" data-action="review-keep"><kbd>K</kbd>${tr('还在用')}</button>${STOPPABLE.includes(a.type)?`<button class="button" data-action="review-stop"><kbd>S</kbd>${tr('停用')}</button>`:''}<button class="button" data-action="review-hide"><kbd>H</kbd>${tr('不要了，隐藏')}</button><button class="button quiet" data-action="review-skip"><kbd>→</kbd>${tr('下次再说')}</button></div>
  <p class="form-note">${tr('“不要了”只改 Assetboard 里的记录，记得去平台取消。')}${safeManagementUrl(a.url)?` <button type="button" class="text-button inline-button" data-action="external" data-id="${esc(a.id)}">${tr('打开管理页')}</button>`:''}</p></div>`,'review');
 $('#modal-content .review-actions .primary')?.focus();
}
function reviewAnswer(kind){
 const run=reviewRun;if(!run)return;
 const a=state.assets.find(x=>x.id===run.ids[run.index]);
 if(a&&kind!=='skip'){checkpoint();const now=new Date().toISOString();a.reviewedAt=now;if(kind==='stop'){a.stopped=true;run.stopped++;}else if(kind==='hide'){a.hiddenAt=now;run.hidden++;}else run.kept++;save();render();}
 run.index++;reviewStep();
}
document.addEventListener('keydown',e=>{
 if(!reviewRun||!$('#modal').open||$('#modal').dataset.view!=='review'||e.metaKey||e.ctrlKey||e.altKey||e.isComposing)return;
 const kind={k:'keep',s:'stop',h:'hide',ArrowRight:'skip',j:'skip'}[e.key.length===1?e.key.toLowerCase():e.key];
 if(!kind||kind==='stop'&&!$('#modal-content [data-action="review-stop"]'))return;
 e.preventDefault();e.stopPropagation();reviewAnswer(kind);
},true);
document.addEventListener('close',e=>{if(e.target.id==='modal'&&reviewRun){const run=reviewRun;reviewRun=null;if(run.kept||run.stopped||run.hidden)toast(tr('已保存清理结果，下次从剩下的继续'),true);}},true);


// ---- The payment ledger export.
function ledgerExportCard(){
 const year=new Date().getFullYear(),years=[...new Set(state.assets.flatMap(a=>paidPayments(a).map(p=>Number(p.paidOn.slice(0,4)))))].sort((x,y)=>y-x);
 if(!years.includes(year))years.unshift(year);
 return `<section class="export-card"><div><h3>${ui('file')}${tr('付款账本')}<span class="fmt" title="${tr('只用来阅读，导不回来；恢复用资产备份')}">${tr('只读')}</span></h3><p class="form-note">${tr('每一笔续费和确认过的扣款，记账、报销、报税用。附按 {currency} 折算的一列。',{currency:esc(totalCurrency())})}</p><div class="chip-group" role="radiogroup" aria-label="${tr('年份')}"><input type="hidden" id="ledger-year" value="${year}">${[...years.map(y=>[String(y),tr('{year} 年',{year:y})]),['all',tr('全部')]].map(([v,l])=>`<button type="button" class="choice" role="radio" data-action="ledger-year" data-id="${v}" aria-checked="${v===String(year)}">${l}</button>`).join('')}</div></div><button class="button" data-action="export-ledger">${tr('导出 .csv')}</button></section>`;
}
function ledgerExport(){
 const year=$('#ledger-year')?.value||'all',range=year==='all'?{}:{from:`${year}-01-01`,to:`${year}-12-31`};
 const rows=ledgerRows(state.assets,{...range,typeName:t=>cats[t]?.name||t});
 if(!rows.length){toast(year==='all'?tr('还没有付款记录'):tr('{year} 年还没有付款记录',{year}));return;}
 saveFile(tr('Assetboard-账本-{year}.csv',{year:year==='all'?tr('全部'):year}),ledgerCsv(rows,{converted:{currency:totalCurrency(),rates:fx.rates}}),'text/csv');
}

// ---- Cost panel extras: paid this year, the next 12 months, and splits by project and owner.
function proCostExtras(scope,cur){
 const year=new Date().getFullYear(),paid=paidTotals(scope,{from:`${year}-01-01`,to:`${year}-12-31`});
 const paidSum=paid.byCurrency.reduce((n,[c,v])=>{const x=convertMoney(v,c,cur,fx.rates);return x===null?n:n+x;},0);
 const first=todayIso().slice(0,8)+'01',f=costForecast(scope,{from:todayIso(),to:isoDay(dayNumber(addMonths(first,12))-1),currency:cur,rates:fx.rates}),max=Math.max(...f.byMonth.map(m=>m.total),1);
 const split=(key,label,name)=>{const groups=new Map();for(const a of scope){const k=key==='project'?cleanProject(a.project):a[key]||'';if(k)groups.set(k,(groups.get(k)||[]).concat(a));}if(!groups.size)return '';const rows=[...groups].map(([k,list])=>[k,costTotals(list,{currency:cur,rates:fx.rates}).monthly]).sort((x,y)=>y[1]-x[1]);return `<div class="cost-split"><h4>${label}</h4>${rows.map(([k,m])=>`<div class="cost-type"><span>${esc(name(k))}</span><i style="width:${Math.max(2,Math.round(m/(rows[0][1]||1)*100))}%"></i><b>${esc(formatMoney(m,cur))}</b></div>`).join('')}</div>`;};
 return `<div class="cost-totals cost-more"><div><span>${tr('{year} 年已付',{year})}</span><strong>${paid.count?esc(formatMoney(paidSum,cur)):'—'}</strong></div><div><span>${tr('预计到 {y} 年 {m} 月底',{y:f.to.slice(0,4),m:Number(f.to.slice(5,7))})}</span><strong>${esc(formatMoney(f.total,cur))}</strong></div></div>
 ${f.items.length?`<div class="forecast" role="img" aria-label="${tr('未来 12 个月每月预计支出')}">${f.byMonth.map(m=>`<span class="forecast-bar" title="${tr('{month}：{amount}',{month:esc(m.month),amount:esc(formatMoney(m.total,cur))})}"><i style="height:${Math.max(4,Math.round(m.total/max*100))}%"></i><em>${new Date(2000,Number(m.month.slice(5))-1,1).toLocaleDateString(trLocale(),{month:'short'})}</em></span>`).join('')}</div><p class="form-note">${tr('按每项的扣款日和当天价格算：优惠结束、试用转付费、到期续费都算进去；没填日期的周期费用按月平摊。')}</p>`:''}
 ${split('project',tr('按项目'),k=>k)}`;
}

// ---- 待确认扣款 in 即将到来: automatic charges that came due, one answer each (the rows and answers are in money-view.js).
function proChargesBand(list){
 const ready=list.filter(c=>c.money?.value>0).length;
 return `<section class="group charges-band" data-group="charges" aria-label="${tr('待确认扣款')}"><header class="group-head"><h2 class="group-title static" title="${tr('扣了没有，点一下；没扣成的会在付款卡上标出来')}"><span class="g-name">${tr('待确认扣款')}</span><span class="g-count">${formatCount(list.length)}</span></h2>${ready>1?`<span class="g-actions"><button class="button" data-action="charges-all">${tr('全部按原价确认')}</button></span>`:''}</header><div class="group-body list">${list.map(c=>chargeRow(c,{named:true})).join('')}</div></section>`;
}

proRegister(()=>{
 proSlots.renewFields.push(renewPaidFields);proSlots.renewRead.push(renewPaidRead);
 proSlots.priceMarks.push(priceMovedMark);proSlots.facts.push(projectFact,proFacts);
 proSlots.formFields.push(projectFormField,proFormFields);proSlots.formRead.push(projectFormRead,proFormRead);
 proSlots.projectNav=proProjectNav;
 proSlots.paymentsSection=proPaymentsSection;
 proSlots.chargesBand=proChargesBand;
 proSlots.projectBar.push(proProjectBar);
 proSlots.toolsNav.push(()=>{const review=reviewQueue(state.assets,{currency:totalCurrency(),rates:fx.rates}).length;return `<button class="nav-item" data-action="review" data-id="review">${ui('check')}<span class="nav-label">${tr('定期清理')}</span>${review?navCount(review):''}</button>`;});
 proSlots.exportCards.push(ledgerExportCard);
 proSlots.costExtras.push(proCostExtras);
 Object.assign(proSlots.actions,{
  'payment-add':(el,id)=>paymentDialog(id),
  'payment-remove':(el,id)=>removePaymentRecord(id,el.dataset.payment),
  'charge-edit':(el,id)=>paymentDialog(id,{due:el.dataset.due}),
  'shutdown':(el,id)=>shutdownDialog(id),
  'shutdown-copy':(el,id)=>copyText(shutdownText(id),()=>toast(tr('清单已复制'))),
  'review':()=>reviewDialog(),
  'review-keep':()=>reviewAnswer('keep'),'review-stop':()=>reviewAnswer('stop'),'review-hide':()=>reviewAnswer('hide'),'review-skip':()=>reviewAnswer('skip'),
  'export-ledger':()=>ledgerExport(),
  'ledger-year':(el,id)=>{$('#ledger-year').value=id;el.parentElement.querySelectorAll('[data-action="ledger-year"]').forEach(b=>b.setAttribute('aria-checked',String(b===el)));}
 });
 document.addEventListener('input',e=>{const form=e.target.closest?.('#renew-form');if(!form||!form.elements.amount)return;if(e.target.name==='amount')e.target.dataset.touched='1';renewSuggest(form);});
 document.addEventListener('change',e=>{const form=e.target.closest?.('#renew-form');if(form&&form.elements.amount)renewSuggest(form);});
});
