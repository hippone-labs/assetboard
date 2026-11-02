// Assetboard Pro's licence on the board (Mac app only): the sidebar line, the panel (试用 / 购买 / 激活) and the small Pro marks shown
// while Pro is off. The app decides the state in pro/desktop/License.swift and passes it at document start as nativeStore.pro:
//   {on, kind:'trial'|'licensed'|'lapsed'|'expired', daysLeft, id, updatesUntil, buildDate}
// The page verifies nothing and sends nothing: buying opens the browser (openExternal, the app never talks to Stripe), activating hands
// the pasted text to the app (licenseActivate), which answers window.assetboardLicenseResult({ok, state, error, removed}). A licence that
// arrives while the board is open turns Pro on in place (proEnable); removing one takes effect at the next launch. Without
// nativeStore.pro (the browser, a build without Pro) nothing here registers; ?free registers nothing either. See docs/2026-10-24-pro-purchase.md.
const proOffer={price:'HK$39',
 // Buying opens the Stripe Payment Link in the browser (its "after payment" setting sends the buyer to the worker's /thanks page).
 // One purchase, lifetime updates: licences carry upd 9999-12-31 and there is no renewal. The worker (pro/worker) answers
 // on pay.assetboard.app (/thanks after paying, /recover); the site itself (assetboard.app, ~/projects/assetboard-site) is static.
 // Prices are this version's words, the checkout page decides.
 buy:'https://buy.stripe.com/28E4gB8T7gdIbniadUdMI01',
 pay:'https://pay.assetboard.app',releases:'https://assetboard.app/downloads/'};
function proState(){return (typeof window!=='undefined'&&window.__ASSETBOARD_NATIVE__?.pro)||null;}
function proLicenseId(id){return String(id||'').replace(/(.{4})(?=.)/g,'$1-');}
// The one line that says where things stand, used by the panel and the sidebar tip.
function proStateText(s){
 if(!s)return '';
 if(s.kind==='trial')return tr('试用还剩 {n} 天',{n:formatCount(s.daysLeft)});
 if(s.kind==='licensed')return tr('许可证 {id} · 永久更新',{id:proLicenseId(s.id)});
 if(s.kind==='lapsed')return tr('这一版发布于 {build}，你的更新期到 {until}',{build:s.buildDate,until:s.updatesUntil});
 return tr('试用已结束');
}
function proOpen(url){if(typeof nativeStore!=='undefined'&&nativeStore)window.webkit.messageHandlers.assetboard.postMessage({action:'openExternal',url});else window.open(url,'_blank','noopener,noreferrer');}
function proDialog(){
 const s=proState();if(!s)return;
 const kind=s.kind,hasLicence=kind==='licensed'||kind==='lapsed';
 modal('Assetboard Pro',`<div class="form pro-panel">
  <p class="pro-state ${esc(kind)}" id="pro-state">${esc(proStateText(s))}</p>
  <p class="form-note">${tr('Pro 加的是自动和记账：定时同步与多账户、阿里云 / 腾讯云到期、探针与 SSH 直读、付款账本、涨价与预计、按项目合计与关停清单、定期清理、Gmail 自动扫描（测试版）、MCP 写入。')}</p>
  <p class="form-note">${tr('免费版一直能用：看板、全景、关联、提醒、导入、导出、核对注册局。数据永远在你机器上，试用结束什么都不会少。')}</p>
  ${kind==='licensed'?'':`<p class="pro-price">${tr('{price} 一次买断，永久更新。',{price:esc(proOffer.price)})}<span class="quiet-fact">${tr('以结账页为准。')}</span></p>`}
  <div class="confirm-actions">
   ${kind==='licensed'?'':`<button class="button primary" data-action="pro-buy" title="${tr('在浏览器里打开 Stripe 结账页；付完的页面给出许可证，永久更新；App 不访问任何服务器')}">${tr('购买 Pro ↗')}</button>`}
   ${kind==='lapsed'?`<button class="button" data-action="pro-older" title="${tr('打开发布页；{date} 之前发布的版本对这份许可证永久可用',{date:esc(s.updatesUntil)})}">${tr('下载 {date} 之前的版本 ↗',{date:esc(s.updatesUntil)})}</button>`:''}
   ${hasLicence?`<button class="button" data-action="pro-remove" title="${tr('删除本机保存的许可证文件，下次启动后回到免费功能；数据不变')}">${tr('移除许可证')}</button>`:`<button class="button" data-action="pro-recover" title="${tr('在浏览器里打开找回页，填购买时的邮箱，许可证会再发一遍')}">${tr('找回许可证 ↗')}</button>`}
  </div>
  ${kind==='licensed'?'':`<label>${tr('已有许可证')}<input id="pro-key" class="pro-key" autocomplete="off" spellcheck="false" placeholder="${tr('粘贴 ASB1. 开头的那段文本')}"></label><div class="confirm-actions"><button id="pro-activate" class="button" data-action="pro-activate">${tr('激活')}</button><span id="pro-status" class="form-note" role="status"></span></div>`}
  <p class="form-note platform-note">${ui('lock')}${tr('许可证在本机离线验证：不激活设备、不联网、不上报。购买在浏览器里完成。')}</p>
 </div>`,'pro');
}
function proActivate(){
 const input=$('#pro-key'),text=(input?.value||'').trim();
 if(!text){input?.focus();return;}
 if(demoMode){window.assetboardDemoBlocked?.();return;}
 if(!nativeStore){$('#pro-status').textContent=tr('只有 Mac App 能激活');return;}
 $('#pro-activate').disabled=true;$('#pro-status').textContent=tr('验证中…');
 window.webkit.messageHandlers.assetboard.postMessage({action:'licenseActivate',text});
}
window.assetboardLicenseResult=result=>{
 const s=proState();
 if(result?.state&&typeof result.state==='object'&&window.__ASSETBOARD_NATIVE__)window.__ASSETBOARD_NATIVE__.pro=result.state;
 const now=proState();
 if(result?.ok){
  if(now?.on&&proOff)proEnable();
  if($('#modal')?.open)$('#modal').close();
  render();
  if(result.removed)toast(tr('已移除许可证，下次启动后回到免费功能'));
  else if(now?.on)toast(now.kind==='licensed'&&s?.kind!=='licensed'?tr('Pro 已激活'):tr('许可证已更新'));
  else proDialog();
  return;
 }
 const status=$('#pro-status'),button=$('#pro-activate');
 if(status)status.textContent=result?.error||tr('没能激活');
 if(button)button.disabled=false;
 if(status)status.classList.add('bad');
};
// Registered whenever the app reports a state (on or off); nothing in the browser or with ?free.
if(proState()&&!(typeof location!=='undefined'&&new URLSearchParams(location.search).has('free'))){
 const off=()=>!proState()?.on;
 proSlots.toolsNav.push(()=>{const s=proState();if(!s)return '';const count=s.kind==='trial'?`<span class="nav-count${s.daysLeft<=3?' soon':''}">${tr('{n} 天',{n:formatCount(s.daysLeft)})}</span>`:'';
  return `<button class="nav-item pro-nav" data-action="pro-dialog" data-id="pro" title="${esc(proStateText(s))}">${ui('spark')}<span class="nav-label">Assetboard Pro</span>${count}</button>`;});
 // While Pro is off: the sources the Pro scripts would add, each marked Pro, and one line in the cost panel. They open the panel.
 const mark='<i class="pro-tag">Pro</i>';
 proSlots.importSources.push(({native,source})=>off()&&native?source('pro-dialog','cloud',tr('同步')+mark,tr('Cloudflare、GitHub、阿里云 / 腾讯云的定时同步在 Pro 里'))+source('pro-dialog','pulse',tr('探针')+mark,tr('探针与 SSH 直读在 Pro 里'))+source('pro-dialog','terminal',tr('MCP 接入')+mark,tr('MCP 写入和 Inbox 在 Pro 里')):'');
 proSlots.costExtras.push(()=>off()?`<p class="form-note pro-note"><button type="button" class="text-button inline-button" data-action="pro-dialog">${tr('账本、预计和项目合计在 Pro 里')}</button></p>`:'');
 Object.assign(proSlots.actions,{
  'pro-dialog':()=>proDialog(),
  'pro-buy':()=>proOpen(`${proOffer.buy}?locale=${appLang}`),
  'pro-recover':()=>proOpen(`${proOffer.pay}/recover?lang=${appLang}`),
  'pro-older':()=>proOpen(proOffer.releases),
  'pro-activate':()=>proActivate(),
  'pro-remove':()=>confirmDialog(tr('移除许可证'),tr('移除后下次启动回到免费功能，数据不变。'),tr('移除'),true).then(ok=>{if(!ok)return;if(demoMode){window.assetboardDemoBlocked?.();return;}window.webkit.messageHandlers.assetboard.postMessage({action:'licenseRemove'});})
 });
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pro-key'){e.preventDefault();proActivate();}});
}
