// Run with the browser tool's filename option. The per-type needs of 2026-10-23: an Apple ID or Google row says how many records sign
// in with it, and what signs in with it hears about the account's card; a number marked stopped while accounts still use it stays
// red; subscriptions, AI plans, deployments and storage can be marked stopped; a synced repository
// says when it was last pushed; a promotion ending within 30 days names the later price.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 const soon=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
 const seen=await page.evaluate(soon=>{save=()=>{};
  state={blocks:[{id:'appleid'},{id:'phone'},{id:'subscription'},{id:'server'},{id:'repository'},{id:'domain'}],deletedExternalIds:[],assets:[
   {id:'apple',type:'appleid',name:'美区 Apple ID',provider:'Apple',account:'me@example.com',links:['tv','card']},
   {id:'card',type:'bankcard',name:'虚拟卡',last4:'4242',cardStatus:'closed',links:['apple']},
   {id:'tv',type:'subscription',name:'Apple TV+',links:['apple']},
   {id:'num',type:'phone',name:'旧号',phone:'+44 7700 900123',stopped:true,links:['g']},
   {id:'g',type:'google',name:'Google 主号',provider:'Google',links:['num']},
   {id:'ecs',type:'server',name:'api',provider:'阿里云',source:'manual'},
   {id:'repo',type:'repository',name:'me/app',provider:'GitHub',source:'github',syncStatus:'公开仓库',event:'公开仓库',updatedAt:new Date().toISOString(),pushedAt:new Date(Date.now()-40*86400000).toISOString()},
   {id:'hand',type:'repository',name:'me/notes',provider:'GitHub',source:'manual',updatedAt:new Date().toISOString()},
   {id:'dom',type:'domain',name:'shop.example',provider:'阿里云',cost:'¥200 / 年',date:soon,dateKind:'expire',promotion:{end:soon,amount:50,regularAmount:200,currency:'CNY'}}]};render();
  const row=id=>document.querySelector(`#board [data-asset="${id}"]`);
  const facts=id=>{showDetail(id);return Object.fromEntries([...document.querySelectorAll('#detail-content .fact')].map(f=>[f.firstElementChild.textContent,f.lastElementChild.textContent]));};
  const risks=id=>{showDetail(id);return [...document.querySelectorAll('#detail .link-risk')].map(p=>p.textContent);};
  const out={appleSub:row('apple').querySelector('.r-sub').textContent,numWhen:row('num').querySelector('.r-date')?.textContent||row('num').textContent,numRed:!!row('num').querySelector('.overdue'),
   tvRisks:risks('tv'),appleRisks:risks('apple'),numRisks:risks('num'),ecsFacts:facts('ecs'),ecsWhen:row('ecs').textContent,repo:row('repo').textContent,hand:row('hand').textContent,
   promo:row('dom').querySelector('.price-mark')?.textContent||'',promoTip:row('dom').querySelector('.price-mark')?.title||'',
   tvMenu:assetMenuItems(state.assets.find(a=>a.id==='tv')).map(i=>i.action),appleMenu:assetMenuItems(state.assets.find(a=>a.id==='apple')).map(i=>i.action)};
  return out;
 },soon);
 check(/登录 1 项/.test(seen.appleSub),'An Apple ID row says what signs in with it: '+seen.appleSub);
 check(seen.tvRisks.some(t=>/付款卡 •••• 4242（登录账号 美区 Apple ID） 发卡方停业，经这个账号扣的费可能失败/.test(t)),'What signs in with the account hears about its card: '+seen.tvRisks.join('|'));
 check(seen.appleRisks.some(t=>/用它登录的 1 项可能跟着登不进去|付款卡/.test(t)),'The account itself names the card risk: '+seen.appleRisks.join('|'));
 check(seen.numRed&&/已停用，仍有账号靠它验证/.test(seen.numWhen),'A stopped number still in use is red: '+seen.numWhen);
 check(seen.numRisks.some(t=>/已停用，靠它验证的 1 项可能收不到验证码；停用的号码会被运营商回收给别人/.test(t)),'and says why: '+seen.numRisks.join('|'));
 check(seen.tvMenu.includes('toggle-stopped')&&!seen.appleMenu.includes('toggle-stopped'),'Subscriptions can be stopped, accounts cannot');
 check(/推送于 1 个月前/.test(seen.repo),'A synced repository says when it was pushed: '+seen.repo);
 check(!/前/.test(seen.hand),'A hand-made one does not pass its edit time off as activity: '+seen.hand);
 check(seen.promo==='续费 ¥200.00'||/^续费 ¥200/.test(seen.promo),'A promotion ending soon names the later price: '+seen.promo);
 check(/\+300%/.test(seen.promoTip),'and the rise in its tip: '+seen.promoTip);
}
