// 组合视图 (asset-data.js cleanMixes, app.js mixOf): the sidebar group 视图 and the dialog that makes, changes and removes one. A view
// is a name and the categories it shows together (机器 = 服务器 + 设备); opening it is 全部资产 limited to those. Changing views is one
// undo step and saves the board, so backups and the Mac's data keep them. Loaded after app.js.
const MIX_GLYPH=()=>`<span class="nav-icon">${ui('tiles')}</span>`;
function mixNavHtml(){
 const mixes=boardMixes();
 if(!mixes.length&&(categoryIds().length<2||railOn()))return '';
 const cur=currentView(),live=liveAssets();
 const items=mixes.map(m=>{const n=live.filter(a=>m.types.includes(a.type)).length;return navItem('mix:'+m.id,m.name,MIX_GLYPH(),n?navCount(n):'',`title="${esc(m.types.map(t=>cats[t].name).join(' + '))}"`);}).join('');
 const add=railOn()?'':`<button class="nav-item nav-add" data-action="mix-new" data-id="mix-new" title="${tr('把几个类别放在一起看，例如 服务器 + 设备')}">${ui('plus')}<span class="nav-label">${tr('新建视图')}</span></button>`;
 return `<div class="nav-group nav-mixes" role="group" aria-labelledby="nav-mixes-title"><h2 class="nav-title" id="nav-mixes-title">${tr('视图')}</h2>${items}${add}</div>`;
}
// The dialog: a name, the categories (every category, the board's order first), and for a new view the common ones in one click.
function mixDialog(id=''){
 const mix=id?boardMixes().find(m=>m.id===id):null,picked=new Set(mix?.types||[]);
 const order=[...categoryIds(),...Object.keys(cats)].filter((t,i,all)=>all.indexOf(t)===i);
 const presets=mix?'':`<div class="field"><span class="field-label">${tr('常用')}</span><div class="mix-presets">${MIX_PRESETS.map(p=>`<button type="button" class="button" data-action="mix-preset" data-id="${p.key}">${esc(p.name)} <span class="quiet-fact">${esc(p.types.map(t=>cats[t].name).join(' + '))}</span></button>`).join('')}</div></div>`;
 modal(mix?tr('编辑视图'):tr('新建视图'),`<form id="mix-form" class="form" data-id="${esc(mix?.id||'')}">
  ${presets}
  <label>${tr('名称')}<input name="name" maxlength="40" autocomplete="off" required value="${esc(mix?.name||'')}" placeholder="${tr('例如 机器')}"></label>
  <fieldset class="mix-types"><legend class="field-label">${tr('包含的类别')}</legend>${order.map(t=>`<label class="mix-type"><input type="checkbox" name="types" value="${t}"${picked.has(t)?' checked':''}><span class="nav-icon">${icon(t)}</span>${esc(cats[t].name)}</label>`).join('')}</fieldset>
  <p class="form-note">${tr('只是换一种看法：记录还在原来的类别里，到期、费用和搜索照常。')}</p>
  <div class="modal-actions"><button class="button primary" type="submit">${mix?tr('保存'):tr('创建')}</button>${mix?`<button class="button danger-quiet" type="button" data-action="mix-delete" data-id="${esc(mix.id)}">${tr('删除视图')}</button>`:''}</div>
 </form>`,'mix');
}
function mixSave(form){
 const name=form.elements.name.value.trim().slice(0,40),types=[...form.querySelectorAll('[name="types"]:checked')].map(x=>x.value).filter(t=>cats[t]);
 if(!name){form.elements.name.focus();return;}
 if(!types.length){toast(tr('至少勾一个类别'));return;}
 const id=form.dataset.id||'v-'+crypto.randomUUID().slice(0,8),list=boardMixes();
 if(!form.dataset.id&&list.length>=MIX_LIMIT){toast(tr('最多 {n} 个视图',{n:MIX_LIMIT}));return;}
 checkpoint();
 state.views=form.dataset.id?list.map(m=>m.id===id?{id,name,types}:m):[...list,{id,name,types}];
 save();$('#modal').close();setView('mix:'+id);toast(form.dataset.id?tr('视图已更新'):tr('已创建视图 {name}',{name}),true);
}
async function mixDelete(id){
 const mix=boardMixes().find(m=>m.id===id);if(!mix)return;
 if(!await confirmDialog(tr('删除视图 {name}？',{name:mix.name}),tr('只删掉这个视图，里面的资产都还在原来的类别里。'),tr('删除视图'),true)){mixDialog(id);return;}
 checkpoint();state.views=boardMixes().filter(m=>m.id!==id);if(!state.views.length)delete state.views;
 save();if(currentView()!=='all'&&!mixOf(currentView()))setView('all');else render();toast(tr('已删除视图 {name}',{name:mix.name}),true);
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const {action,id}=el.dataset;
 if(action==='mix-new')mixDialog();
 else if(action==='mix-delete')mixDelete(id);
 else if(action==='mix-preset'){
  const p=MIX_PRESETS.find(x=>x.key===id),form=$('#mix-form');if(!p||!form)return;
  form.elements.name.value=p.name;for(const box of form.querySelectorAll('[name="types"]'))box.checked=p.types.includes(box.value);
 }
});
document.addEventListener('submit',e=>{if(e.target.id!=='mix-form')return;e.preventDefault();mixSave(e.target);});
