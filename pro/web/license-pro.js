// Assetboard Pro's licence on the board: the Assetboard Pro section of 设置 (status, buying, 输入许可证, removing), the edition in
// 关于 and the calm Pro hints where a locked feature would be. The Mac app checks the licence offline (pro/desktop/License.swift) and
// passes the result at document start as nativeStore.pro:
//   {on, kind:'free'|'licensed'|'demo', id}
// The page verifies nothing and sends nothing: buying opens the browser (openExternal; the app never talks to Stripe), activating hands
// the pasted text to the app (licenseActivate), which answers window.assetboardLicenseResult({ok, state, error, removed}). A licence that
// arrives while the board is open turns Pro on in place (proEnable); removing one takes effect at the next launch. The browser has no
// licence: it runs the free features (?demo shows Pro). With ?free nothing here registers.
// One purchase, US$10, lifetime updates, every Mac of the buyer's own. The checkout page decides the price; PRO_PRICE is what the
// panel says.
const PRO_PRICE='US$10';
// The Stripe Payment Link for Pro. Placeholder until the owner creates the US$10 link: replace it with https://buy.stripe.com/…
// (the same link goes into pro/worker/wrangler.toml as PAYMENT_LINK). Its "after payment" page must be the worker's
// /thanks?session_id={CHECKOUT_SESSION_ID}.
const PRO_BUY_URL='https://buy.stripe.com/8x23cx2uJ1iO4YUeuadMI02';
// The purchase worker (pro/worker): /recover mails a lost licence again.
const PRO_PAY_URL='https://pay.assetboard.app';
// What Pro adds, and what is still to come (the slots in pro-slots.js), for the section's list.
const PRO_INCLUDES=[tr('付款账本、未来 12 个月预测和价格变动'),tr('每周自动核对注册局'),tr('Cloudflare 每 12 小时自动同步'),tr('项目合计、关停清单和定期清理'),tr('探针与 SSH 直读'),tr('MCP 添加、修改和删除，命令行，Inbox 文件夹')];
const PRO_COMING=[tr('写进「提醒事项」'),tr('加密快照写到你选的文件夹'),tr('「如果我出事」接手包')];
function proState(){return (typeof window!=='undefined'&&window.__ASSETBOARD_NATIVE__?.pro)||null;}
function proLicenseId(id){return String(id||'').replace(/(.{4})(?=.)/g,'$1-');}
function proLicensed(){return proState()?.kind==='licensed';}
function proStateText(){
 if(demoMode)return tr('演示模式：显示全部 Pro 功能');
 if(proLicensed())return tr('已激活 · 许可证 {id}',{id:proLicenseId(proState().id)});
 return tr('免费版');
}
function proEditionText(){return demoMode?tr('演示（显示 Pro 功能）'):proLicensed()?'Assetboard Pro':tr('免费版');}
function proOpen(url){if(typeof nativeStore!=='undefined'&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url});else window.open(url,'_blank','noopener,noreferrer');}
// 设置 › Assetboard Pro, drawn with the panel's own row(label, control, title).
function proLicenceSection(row){
 const licensed=proLicensed(),list=items=>`<ul class="pro-list">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`;
 return [row(tr('状态'),`<span class="pro-state${licensed?' ok':''}" id="pro-state">${esc(proStateText())}</span>`),
  licensed?'':`<p class="pro-price">${tr('{price} 一次买断，终身更新；你自己的 Mac 不限台数。',{price:esc(PRO_PRICE)})}</p>`,
  licensed?'':row(tr('购买'),`<button class="button primary" data-action="pro-buy">${tr('购买 Pro（{price}）↗',{price:esc(PRO_PRICE)})}</button>`,tr('在浏览器里打开 Stripe 结账页；付完的页面和邮件给出许可证。App 不访问任何服务器')),
  licensed?'':row(tr('输入许可证'),`<span class="pro-key-row"><input id="pro-key" class="pro-key" autocomplete="off" spellcheck="false" aria-label="${tr('输入许可证')}" placeholder="${tr('以 ASB1. 开头的文本')}"><button id="pro-activate" class="button" data-action="pro-activate">${tr('激活')}</button></span>`),
  licensed?'':`<p id="pro-status" class="form-note pro-status" role="status"></p>`,
  licensed?'':row(tr('找回许可证'),`<button class="button" data-action="pro-recover">${tr('找回 ↗')}</button>`,tr('在浏览器里打开找回页，填购买时的邮箱，许可证会再发一遍')),
  licensed?row(tr('移除许可证'),`<button class="button" data-action="pro-remove">${tr('移除…')}</button>`,tr('删除本机保存的许可证，下次启动回到免费版；数据不变')):'',
  `<details class="pro-includes"><summary>${tr('Pro 包含')}</summary>${list(PRO_INCLUDES)}<p class="form-note">${tr('即将推出')}</p>${list(PRO_COMING)}</details>`,
  `<p class="form-note platform-note">${ui('lock')}${tr('许可证在本机离线验证，不联网。')}</p>`].join('');
}
function proActivate(){
 const input=$('#pro-key'),text=(input?.value||'').trim(),status=$('#pro-status');
 if(!text){input?.focus();return;}
 if(demoMode){window.assetboardDemoBlocked?.();return;}
 if(!nativeStore){if(status)status.textContent=tr('只有 Mac App 能激活');return;}
 $('#pro-activate').disabled=true;if(status){status.classList.remove('bad');status.textContent=tr('验证中…');}
 window.webkit.messageHandlers.assetboard.postMessage({action:'licenseActivate',text});
}
window.assetboardLicenseResult=result=>{
 const before=proLicensed();
 if(result?.state&&typeof result.state==='object'&&window.__ASSETBOARD_NATIVE__)window.__ASSETBOARD_NATIVE__.pro=result.state;
 const prefsOpen=$('#modal')?.open&&$('#modal').dataset.view==='prefs';
 if(result?.ok){
  if(proState()?.on)proEnable();
  render();
  if(prefsOpen)prefsDialog('pro');
  if(result.removed)toast(tr('已移除许可证，下次启动后回到免费版'));
  else if(proLicensed())toast(before?tr('许可证已更新'):tr('Pro 已激活'));
  return;
 }
 const status=$('#pro-status'),button=$('#pro-activate');
 if(status){status.textContent=result?.error||tr('没能激活');status.classList.add('bad');}
 if(button)button.disabled=false;
};
proBuild(()=>{
 // The cost panel's one line while Pro is off: where the ledger and the forecast are.
 proSlots.costExtras.push(()=>proHint(tr('付款账本、未来 12 个月预测和项目合计在 Pro 里。')));
 Object.assign(proSlots.actions,{
  'pro-dialog':()=>prefsDialog('pro'),
  'pro-buy':()=>proOpen(PRO_BUY_URL),
  'pro-recover':()=>proOpen(`${PRO_PAY_URL}/recover?lang=${appLang}`),
  'pro-activate':()=>proActivate(),
  'pro-remove':()=>confirmDialog(tr('移除许可证'),tr('移除后下次启动回到免费版，数据不变。'),tr('移除'),true).then(ok=>{if(!ok)return;if(demoMode){window.assetboardDemoBlocked?.();return;}window.webkit.messageHandlers.assetboard.postMessage({action:'licenseRemove'});})
 });
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pro-key'){e.preventDefault();proActivate();}});
});
