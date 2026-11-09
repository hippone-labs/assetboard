// What a project earns, what it costs with shared records split, and the difference — the head of a project view, the revenue
// dialog and the share editor (in the form, and from a shared part of the bar). The figures come from projectEconomics
// (asset-data.js) in PROJECT_CURRENCY (USD); revenue is stored in state.projects in its own currency, shares on the record
// (asset.projectShares, percents with at most two decimals). Loaded after money-ledger.js.

// ---- The head of a project view: the net as the one figure, revenue and cost beside it, and two bars on one scale under them —
// what comes in, and what goes out record by record (a shared record at its share, hatched; a cost that cannot be read, a dashed cell
// after the track). A repository or account without a cost (formCopy plain) is not a gap.
const PJ_UNKNOWN=['none','noCycle','unreadable','noRate'];
function pjGap(x){return PJ_UNKNOWN.includes(x.kind)&&!(x.kind==='none'&&typeof formCopy==='function'&&formCopy(x.type)?.plain);}
function pjEconomics(name){return projectEconomics(state.assets,state.projects,{currency:PROJECT_CURRENCY,rates:fx.rates,name}).projects[0]||null;}
// A share as a percent to two decimals (0.3333 → 33.33).
function pjPct(share){return Math.round(share*10000)/100;}
function pjNet(net,cur){return net===null?'—':`${net<0?'−':net>0?'+':''}${formatMoney(Math.abs(net),cur)}`;}
function pjUnknownWhy(kind){return {none:tr('没写费用'),noCycle:tr('没写周期'),unreadable:tr('费用读不懂'),noRate:tr('没有汇率')}[kind]||'';}
function projectBarHtml(name,list){
 const cur=PROJECT_CURRENCY,e=pjEconomics(name),plan=shutdownPlan(state.assets,name,{currency:cur,rates:fx.rates});if(!e)return '';
 const rev=e.revenue,revValue=e.revenueMonthly,cost=e.monthlyCost,loss=e.net!==null&&e.net<0;
 const unknown=e.assets.filter(pjGap),byId=new Map(list.map(a=>[a.id,a]));
 // A revenue in another currency keeps its own amount in sight: ¥200 ≈ $29.95.
 const revText=rev?revValue===null||rev.currency===cur?formatMoney(rev.amount,rev.currency):tr('{amount} ≈ {converted}',{amount:formatMoney(rev.amount,rev.currency),converted:formatMoney(revValue,cur)}):'';
 const revTitle=rev&&rev.currency!==cur?tr('{amount} / 月，按 {cur} 换算',{amount:formatMoney(rev.amount,rev.currency),cur}):tr('每月收入，点一下修改');
 const fig=(cls,label,value,title='')=>`<div class="pj-fig ${cls}"${title?` title="${esc(title)}"`:''}><span class="pj-label">${label}</span><b>${value}</b></div>`;
 const main=rev?fig(`pj-main${loss?' loss':''}`,tr('每月净额'),esc(pjNet(e.net,cur)),e.net===null?tr('没有 {cur} 的汇率，算不出净额',{cur:rev.currency}):''):fig('pj-main',tr('每月成本'),esc(formatMoney(cost,cur)),e.assets.some(x=>x.shared)?tr('共用的按份额分摊'):'');
 const revFig=`<button type="button" class="pj-fig pj-rev" data-action="project-revenue" data-id="${esc(name)}" title="${esc(revTitle)}"><span class="pj-label">${tr('收入')}</span><b>${rev?esc(revText):`<span class="pj-add">${ui('plus')}${tr('填写')}</span>`}</b></button>`;
 const costFig=rev?fig('',tr('成本'),esc(formatMoney(cost,cur)),e.assets.some(x=>x.shared)?tr('共用的按份额分摊'):''):'';
 const oneOff=e.oneOffTotal?fig('pj-minor',tr('一次性'),esc(formatMoney(e.oneOffTotal,cur))):'';
 const mark=unknown.length?`<span class="pj-mark" title="${esc(unknown.map(x=>tr('{name}：{why}',{name:displayName(byId.get(x.id)||x),why:pjUnknownWhy(x.kind)})).join('\n'))}">${ui('warn')}${tr('{n} 项未计入',{n:unknown.length})}</span>`:'';
 // One scale for both bars: the larger of revenue and cost fills the track.
 const scale=Math.max(revValue||0,cost)||1,pct=v=>Math.max(0,Math.min(100,v/scale*100));
 const parts=e.assets.filter(x=>x.cost>0).map(x=>{const a=byId.get(x.id)||x,label=x.shared?tr('{name} · 分摊 {share}% · {amount}',{name:displayName(a),share:pjPct(x.share),amount:formatMoney(x.cost,cur)}):tr('{name} · {amount}',{name:displayName(a),amount:formatMoney(x.cost,cur)});return `<button type="button" class="pj-seg${x.shared?' shared':''}" style="width:${pct(x.cost).toFixed(2)}%" data-action="project-part" data-id="${esc(x.id)}" data-project="${esc(name)}" title="${esc(label)}" aria-label="${esc(label)}"></button>`;}).join('');
 const cells=unknown.map(x=>`<i class="pj-unk" title="${esc(tr('{name}：{why}',{name:displayName(byId.get(x.id)||x),why:pjUnknownWhy(x.kind)}))}"></i>`).join('');
 const over=revValue!==null&&rev&&cost>revValue?`<span class="pj-over" style="left:${pct(revValue).toFixed(2)}%;width:${(pct(cost)-pct(revValue)).toFixed(2)}%" aria-hidden="true"></span>`:'';
 const meter=parts||cells||rev?`<div class="pj-meter">${rev?`<div class="pj-track pj-in" role="img" aria-label="${esc(tr('收入 {amount} / 月',{amount:revText}))}"><i style="width:${pct(revValue||0).toFixed(2)}%"></i></div>`:''}<div class="pj-track pj-out" aria-label="${esc(tr('成本 {amount} / 月',{amount:formatMoney(cost,cur)}))}" role="group">${parts}${over}</div><span class="pj-gaps">${cells}</span></div>`:'';
 return `<div class="project-bar pj-bar"><div class="pj-figs">${main}${revFig}${costFig}${oneOff}${mark}<button class="button pj-shutdown" data-action="shutdown" data-id="${esc(name)}"${plan.steps.length?'':' disabled'}>${tr('关停清单')}</button></div>${meter}</div>`;
}

// ---- Revenue: one amount a month per project (several sources are added up into it), in any currency, USD for a new one; an
// empty amount clears it. Another currency shows what it comes to in USD under the amount.
function revenueDialog(name){
 const rev=cleanProjectMeta(state.projects)[name]?.revenue,currency=rev?.currency||PROJECT_CURRENCY;
 modal(tr('「{name}」每月收入',{name}),`<form id="project-revenue-form" class="form" data-project="${esc(name)}">
  <div class="field"><span class="field-label">${tr('每月收入')}</span><div class="cost-row"><input name="amount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="0" aria-label="${tr('每月收入')}" value="${rev?esc(String(rev.amount)):''}">${chipGroup('currency',currencyChoices(currency),currency,tr('币种'))}</div><span class="form-note pj-usd" aria-live="polite"></span></div>
  <div class="form-actions"><button class="button primary" type="submit">${tr('保存')}</button>${rev?`<button type="button" class="button" data-action="project-revenue-clear" data-id="${esc(name)}">${tr('清除')}</button>`:''}<span class="form-note">${tr('⌘Z 可撤销')}</span></div>
 </form>`,'project-revenue');
 const input=$('#project-revenue-form [name="amount"]');input.focus();input.select();revenueUsd(input.form);
}
function revenueUsd(form){
 const note=form.querySelector('.pj-usd'),amount=readAmount(form.elements.amount),code=form.elements.currency.value;
 const usd=amount!==null&&!Number.isNaN(amount)&&code!==PROJECT_CURRENCY?convertMoney(amount,code,PROJECT_CURRENCY,fx.rates):null;
 note.textContent=usd===null?'':tr('≈ {amount} / 月',{amount:formatMoney(usd,PROJECT_CURRENCY)});
}
document.addEventListener('input',e=>{if(e.target.form?.id==='project-revenue-form')revenueUsd(e.target.form);});
document.addEventListener('change',e=>{if(e.target.form?.id==='project-revenue-form')revenueUsd(e.target.form);});
function revenueSave(name,value){
 const r=setProjectRevenue(state.projects,name,value);if(!r.ok){toast(r.error);return false;}
 checkpoint();if(Object.keys(r.projects).length)state.projects=r.projects;else delete state.projects;
 save();render();toast(value?tr('收入已记下'):tr('收入已清除'),true);return true;
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='project-revenue-form')return;e.preventDefault();
 const form=e.target,amount=readAmount(form.elements.amount);
 if(Number.isNaN(amount)){refuse(form.elements.amount,tr('请填写数字金额，例如 89 或 10.98'));return;}
 if(revenueSave(form.dataset.project,amount===null?null:{amount,currency:form.elements.currency.value}))$('#modal').close();
});

// ---- Shares: a record in several projects splits its cost equally, or by percent. One bar shows the split; typing a percent
// switches to 按比例, and the last project takes what is left, so two projects need one number.
function shareValues(names,shares){
 const check=shares&&checkProjectShares(names,shares);
 return check?.ok&&check.shares?{mode:'custom',values:names.map(n=>check.shares[n])}:{mode:'',values:evenShares(names.length)};
}
function shareEditor(names,shares){
 if(names.length<2)return '';
 const {mode,values}=shareValues(names,shares);
 return `<div class="field share-field${mode?'':' equal'}" data-names="${esc(JSON.stringify(names))}"><span class="field-label" title="${tr('这条记录的费用怎么分到各个项目')}">${tr('分摊')}</span>${chipGroup('shareMode',[['',tr('均分')],['custom',tr('按比例')]],mode,tr('分摊方式'))}
  <div class="share-bar" aria-hidden="true">${values.map(v=>`<i style="flex-basis:${v}%"></i>`).join('')}</div>
  <div class="share-list">${names.map((n,i)=>`<label class="share-item"><span class="share-name">${esc(n)}</span><input name="share" type="number" min="0" max="100" step="0.01" data-project="${esc(n)}" inputmode="decimal" autocomplete="off" aria-label="${esc(tr('{name} 的份额（%）',{name:n}))}" value="${esc(String(values[i]))}"><span class="share-unit">%</span></label>`).join('')}</div></div>`;
}
function shareInputs(field){return [...field.querySelectorAll('input[name="share"]')];}
function shareDraw(field){
 const values=shareInputs(field).map(input=>Math.max(0,Number(input.value)||0)),sum=values.reduce((n,v)=>n+v,0)||1;
 field.querySelectorAll('.share-bar i').forEach((bar,i)=>bar.style.flexBasis=`${values[i]/sum*100}%`);
 field.classList.toggle('off',Math.abs(values.reduce((n,v)=>n+v,0)-100)>0.01);
}
// {ok, shares} from the editor: null for 均分, else what checkProjectShares makes of the percents (refusing at the first field).
function shareRead(field){
 if(!field)return {ok:true,shares:null};
 const inputs=shareInputs(field),names=JSON.parse(field.dataset.names);
 if(field.querySelector('input[name="shareMode"]').value!=='custom')return {ok:true,shares:null};
 const check=checkProjectShares(names,Object.fromEntries(inputs.map(input=>[input.dataset.project,input.value.trim()])));
 if(!check.ok)refuse(inputs.find(input=>{const v=Number(input.value);return !(v>=0&&v<=100)||Math.abs(v*100-Math.round(v*100))>1e-6;})||inputs[0],check.error);
 return check;
}
document.addEventListener('input',e=>{
 const field=e.target.closest?.('.share-field');if(!field||e.target.name!=='share')return;
 const inputs=shareInputs(field),mode=field.querySelector('input[name="shareMode"]');
 if(mode.value!=='custom'){setChoice(e.target.form,'shareMode','custom');}
 const last=inputs[inputs.length-1];
 if(e.target!==last){const rest=100-inputs.slice(0,-1).reduce((n,input)=>n+(Number(input.value)||0),0);last.value=String(Math.max(0,Math.round(rest*100)/100));}
 shareDraw(field);
});
document.addEventListener('change',e=>{
 const field=e.target.closest?.('.share-field');if(!field||e.target.name!=='shareMode')return;
 const custom=e.target.value==='custom',inputs=shareInputs(field);
 field.classList.toggle('equal',!custom);
 if(!custom){const even=evenShares(inputs.length);inputs.forEach((input,i)=>input.value=String(even[i]));}
 shareDraw(field);
});

// The form: the project field with the share editor under it, redrawn when the list of projects changes.
function projectFormField(v){
 return `<label>${tr('项目')}<input name="project" maxlength="${PROJECT_LIMIT*PROJECTS_PER_ASSET}" autocomplete="off" list="project-list" value="${esc(projectsOf(v).join(tr('，')))}" placeholder="${tr('例如 notes-app')}" title="${tr('几个项目共用就用逗号隔开')}"></label>
 <datalist id="project-list">${projectNames(state.assets).map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist><div class="share-slot">${shareEditor(projectsOf(v),v.projectShares)}</div>`;
}
document.addEventListener('input',e=>{
 if(e.target.name!=='project'||e.target.form?.id!=='asset-form')return;
 const slot=e.target.form.querySelector('.share-slot');if(!slot)return;
 const names=parseProjects(e.target.value),field=slot.querySelector('.share-field');
 if(field&&field.dataset.names===JSON.stringify(names))return;
 const a=state.assets.find(x=>x.id===e.target.form.dataset.id);slot.innerHTML=shareEditor(names,a?.projectShares);
});
function projectFormRead(form,data){
 const names=parseProjects(data.get('project')),field=form.querySelector('.share-slot .share-field');
 const out={project:names.length>1?names:names[0]||'',projectShares:null};
 if(names.length>1&&field&&field.dataset.names===JSON.stringify(names)){const check=shareRead(field);if(!check.ok)return null;out.projectShares=check.shares;}
 return out;
}

// From the bar: a shared part opens its split, any other part the record.
function shareDialog(id,project){
 const a=state.assets.find(x=>x.id===id);if(!a)return;
 const names=projectsOf(a);if(names.length<2){showDetail(id);return;}
 modal(tr('「{name}」的分摊',{name:displayName(a)}),`<form id="project-share-form" class="form" data-id="${esc(id)}">${shareEditor(names,a.projectShares)}
  <div class="form-actions"><button class="button primary" type="submit">${tr('保存')}</button><span class="form-note">${tr('⌘Z 可撤销')}</span></div></form>`,'project-share');
 const own=$(`#project-share-form input[name="share"][data-project="${CSS.escape(project||'')}"]`);if(own){own.focus();own.select();}
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='project-share-form')return;e.preventDefault();
 const a=state.assets.find(x=>x.id===e.target.dataset.id);if(!a)return;
 const check=shareRead(e.target.querySelector('.share-field'));if(!check.ok)return;
 checkpoint();const r=setProjectShares(a,check.shares);if(!r.ok){history.pop();toast(r.error);return;}
 touchAsset(a);save();render();$('#modal').close();toast(check.shares?tr('已按比例分摊'):tr('已改成均分'),true);
});

// The detail's project row: a custom split shows each project's percent.
function projectFact(a,row){
 const names=projectsOf(a);if(!names.length)return '';
 const split=projectSharesOf(a);
 return row(tr('项目'),names.map(name=>`<button class="text-button inline-button" data-action="view" data-id="${esc('project:'+name)}">${esc(name)}</button>${split.split==='custom'?`<span class="pj-pct">${pjPct(split.shares[name])}%</span>`:''}`).join(tr('、')));
}

// Its slots and handlers, at load.
{
 proSlots.facts.unshift(projectFact);
 proSlots.formFields.unshift(projectFormField);proSlots.formRead.unshift(projectFormRead);
 proSlots.projectBar.push(projectBarHtml);
 Object.assign(proSlots.actions,{
  'project-revenue':(el,id)=>revenueDialog(id),
  'project-revenue-clear':(el,id)=>{if(revenueSave(id,null))$('#modal').close();},
  'project-part':(el,id)=>{const a=state.assets.find(x=>x.id===id);if(a&&projectsOf(a).length>1)shareDialog(id,el.dataset.project);else showDetail(id);}
 });
}
