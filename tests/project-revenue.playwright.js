// Project revenue (state.projects) and the per-project figures: cleaned at load, read by agents (list_projects, USD by default)
// with shared records split, written by agents (update_project: checked first, one ⌘Z step, refused without Pro), kept by ⌘Z and a
// rename, carried by the backup and listed in its restore preview. Pro draws the project page; here its project slot is faked so
// projects count as shown. Saves go to a fake host and never to disk.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const board={blocks:[{id:'server',folded:false},{id:'deployment',folded:false},{id:'domain',folded:false}],deletedExternalIds:[],assets:[
  {id:'vps',type:'server',name:'shared-vps',source:'manual',art:'generic',cost:'$12 / 月',project:['web','blog']},
  {id:'site',type:'deployment',name:'web-site',source:'manual',art:'generic',cost:'$6 / 月',project:'web'},
  {id:'dom',type:'domain',name:'web.example.com',source:'manual',art:'generic',cost:'$24 / 年',project:'web'},
  {id:'free',type:'deployment',name:'blog-site',source:'manual',art:'generic',cost:'免费',project:'blog'}],
  projects:{web:{revenue:{amount:30,currency:'USD'}},'bad,name':{revenue:{amount:1,currency:'USD'}},blog:{revenue:{amount:'x'}}}};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(data=>{
  window.__saves=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m.action==='save'){window.__saves.push(JSON.parse(JSON.stringify(m.data)));setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
  window.__ASSETBOARD_NATIVE__={data,cloudflareConnected:false,githubConnected:false};
 },board);
 try{
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof assetboardAgent==='function'&&typeof routeImportText==='function'&&state.assets.length===4);
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}','Load keeps only valid revenue');

  const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',via:'mcp',method,params}),[method,params]);
  // The free edition refuses the write like any other, and nothing changes.
  const refused=await call('updateProject',{name:'web',revenue:{amount:40,currency:'USD'}});
  check(refused.ok===false&&/Pro/.test(refused.error)&&await p.evaluate(()=>state.projects.web.revenue.amount)===30,'The free edition refuses update_project: '+JSON.stringify(refused));
  // Agents: nothing while projects are not shown (free edition), then the figures once Pro's project slot is there.
  await p.evaluate(()=>{proEnable();proSlots.projectNav=null;});
  let reply=await call('projects',{currency:'USD'});
  check(reply.ok&&reply.result.projects.length===0,'No projects without the project slot: '+JSON.stringify(reply));
  await p.evaluate(()=>{proSlots.projectNav=()=>'';render();});
  reply=await call('projects',{currency:'USD'});
  const web=reply.result?.projects?.find(x=>x.name==='web'),blog=reply.result?.projects?.find(x=>x.name==='blog');
  check(reply.ok&&reply.result.currency==='USD'&&web&&blog,'Both projects are listed: '+JSON.stringify(reply));
  check(web.monthly===20&&web.monthlyCost===14&&web.revenueMonthly===30&&web.net===16&&web.complete===true,'web: full 12+6+2, split 6+6+2, net 16: '+JSON.stringify(web));
  check(JSON.stringify(web.revenue)==='{"amount":30,"currency":"USD"}','revenue as stored');
  const vps=web.assets.find(x=>x.id==='vps');
  check(vps&&vps.share===50&&vps.split==='equal'&&vps.monthly===12&&vps.cost===6,'The shared server is half in web: '+JSON.stringify(vps));
  check(blog.revenue===null&&blog.net===null&&blog.monthlyCost===6&&blog.assets.find(x=>x.id==='free')?.notCounted==='free','blog: no revenue, the free record is listed, not 0: '+JSON.stringify(blog));
  check((await call('projects',{currency:'XYZ'})).ok===false,'An unknown currency is refused');
  // Custom shares are read from the record and listed per asset.
  await p.evaluate(()=>{setProjectShares(state.assets.find(a=>a.id==='vps'),{web:75,blog:25});});
  reply=await call('projects',{currency:'USD'});
  const webCustom=reply.result.projects.find(x=>x.name==='web');
  check(webCustom.monthlyCost===17&&webCustom.assets.find(x=>x.id==='vps').split==='custom'&&webCustom.assets.find(x=>x.id==='vps').share===75,'Custom shares: '+JSON.stringify(webCustom));
  const asset=(await call('get',{id:'vps'})).result;
  check(JSON.stringify(asset?.projectShares)==='{"web":75,"blog":25}','get_asset shows the shares');
  // update_asset does not take shares (update_project does): the field is ignored, nothing changes.
  const upd=await call('update',{id:'vps',fields:{projectShares:{web:10,blog:90}}});
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(a=>a.id==='vps').projectShares))==='{"web":75,"blog":25}','An agent does not change shares: '+JSON.stringify(upd));
  // An agent moving the record into a third project drops the shares that no longer fit.
  check((await call('update',{id:'vps',fields:{project:['web','blog','api']}})).ok,'project update');
  check(await p.evaluate(()=>!('projectShares' in state.assets.find(a=>a.id==='vps'))),'Shares that no longer fit are dropped');
  check((await call('projects')).result?.currency==='USD','list_projects counts in USD by default');

  // update_project: revenue in its own currency and the shares (numbers as text, two decimals) in one call, one undo step.
  const before=await p.evaluate(()=>({saves:window.__saves.length,history:history.length}));
  reply=await call('updateProject',{name:'web',revenue:{amount:200,currency:'cny'},shares:[{id:'vps',shares:{web:'12.55',blog:50,api:37.45}}]});
  const usd=await p.evaluate(()=>Math.round(convertMoney(200,'CNY','USD',fx.rates)*100)/100);
  const r=reply.result||{};
  check(reply.ok&&r.currency==='USD'&&r.name==='web'&&JSON.stringify(r.revenue)==='{"amount":200,"currency":"CNY"}'&&r.revenueMonthly===usd,'update_project answers with the project in USD: '+JSON.stringify(reply));
  check(r.monthlyCost===9.51&&r.net===Math.round((usd-9.506)*100)/100&&r.assets.find(x=>x.id==='vps')?.share===12.55&&r.assets.find(x=>x.id==='vps')?.split==='custom','the figures follow the write: '+JSON.stringify(r));
  const written=await p.evaluate(()=>({projects:JSON.stringify(state.projects),shares:JSON.stringify(state.assets.find(a=>a.id==='vps').projectShares),saves:window.__saves.length,history:history.length,toast:$('#toast').textContent,saved:JSON.stringify(window.__saves.at(-1).projects)}));
  check(written.projects==='{"web":{"revenue":{"amount":200,"currency":"CNY"}}}'&&written.shares==='{"web":12.55,"blog":50,"api":37.45}','the revenue and shares are stored: '+JSON.stringify(written));
  check(written.saves>before.saves&&written.saved===written.projects&&written.history===before.history+1&&written.toast.includes('外部工具更新了项目「web」'),'saved once with one checkpoint and a toast: '+JSON.stringify(written));
  // Clearing: revenue null and shares null (equal split) in the same call.
  reply=await call('updateProject',{name:'web',revenue:null,shares:[{id:'vps',shares:null}]});
  check(reply.ok&&reply.result.revenue===null&&reply.result.net===null&&await p.evaluate(()=>!('projects' in state)&&!('projectShares' in state.assets.find(a=>a.id==='vps'))),'null clears the revenue and the split: '+JSON.stringify(reply));
  // Each write is one ⌘Z step.
  check(await p.evaluate(()=>{undo();return JSON.stringify(state.projects)+'|'+JSON.stringify(state.assets.find(a=>a.id==='vps').projectShares);})==='{"web":{"revenue":{"amount":200,"currency":"CNY"}}}|{"web":12.55,"blog":50,"api":37.45}','undo takes back the clearing');
  check(await p.evaluate(()=>{undo();return JSON.stringify(state.projects)+'|'+('projectShares' in state.assets.find(a=>a.id==='vps'));})==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}|false','a second undo takes back the first write whole');

  // Validation: anything wrong refuses the whole call, nothing is written or saved.
  const quiet=await p.evaluate(()=>({saves:window.__saves.length,history:history.length,projects:JSON.stringify(state.projects)}));
  for(const [params,want] of [
   [{name:'nope',revenue:{amount:1,currency:'USD'}},/找不到项目/],
   [{name:'web'},/没有要修改的内容/],
   [{name:'web',revenue:{amount:-5,currency:'USD'}},/revenue/],
   [{name:'web',revenue:{amount:5,currency:'XYZ'}},/currency/],
   [{name:'web',revenue:'5 USD'},/revenue/],
   [{name:'web',revenue:{amount:40,currency:'USD'},shares:[{id:'vps',shares:{web:12.555,blog:50,api:37.445}}]},/两位小数/],
   [{name:'web',shares:[{id:'vps',shares:{web:50,blog:40,api:0}}]},/100%/],
   [{name:'web',shares:[{id:'vps',shares:{web:50,blog:50}}]},/每个项目/],
   [{name:'web',shares:[{id:'vps',shares:{web:-1,blog:51,api:50}}]},/0 到 100/],
   [{name:'web',shares:[{id:'free',shares:null}]},/不在项目/],
   [{name:'web',shares:[{id:'missing',shares:null}]},/找不到资产/],
   [{name:'web',shares:[{id:'vps',shares:null},{id:'vps',shares:null}]},/两次/],
   [{name:'web',shares:[{id:'vps'}]},/缺少 shares/],
   [{name:'web',shares:[]},/shares/],
   [{name:'web',revenue:{amount:1,currency:'USD'},currency:'XYZ'},/currency/]
  ]){
   const bad=await call('updateProject',params);
   check(bad.ok===false&&want.test(bad.error),'refused with a reason: '+JSON.stringify(params)+' → '+JSON.stringify(bad));
  }
  check(JSON.stringify(await p.evaluate(()=>({saves:window.__saves.length,history:history.length,projects:JSON.stringify(state.projects)})))===JSON.stringify(quiet),'a refused call changes and saves nothing');

  // ⌘Z: a revenue change and a rename (which carries the revenue) both undo.
  const undone=await p.evaluate(()=>{
   const out={};checkpoint();state.projects=setProjectRevenue(state.projects,'web',{amount:50,currency:'USD'}).projects;save();
   out.set=state.projects.web.revenue.amount;undo();out.undo=state.projects.web.revenue.amount;
   checkpoint();renameProject(state.assets,'web','site',new Date(),state.projects);save();
   out.renamed=JSON.stringify(state.projects);out.saved=JSON.stringify(window.__saves.at(-1).projects);
   undo();out.back=JSON.stringify(state.projects)+'|'+state.assets.find(a=>a.id==='site').project;
   return out;
  });
  check(undone.set===50&&undone.undo===30,'Undo restores the revenue: '+JSON.stringify(undone));
  check(undone.renamed==='{"site":{"revenue":{"amount":30,"currency":"USD"}}}'&&undone.saved===undone.renamed,'A rename moves the revenue, and the save carries it: '+JSON.stringify(undone));
  check(undone.back==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}|web','Undo brings the old name back with its revenue: '+undone.back);

  // Backup: the export carries the revenue; restoring onto a board without it lists and brings it back.
  const text=await p.evaluate(()=>{let body='';const keep=window.saveFile;window.saveFile=(name,b)=>{body=b;};try{exportRun('backup');}finally{window.saveFile=keep;}return body;});
  check(JSON.stringify(JSON.parse(text).projects)==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}','The backup carries the revenue');
  await p.evaluate(()=>{checkpoint();delete state.projects;save();render();});
  await p.evaluate(t=>routeImportText(t,{filename:'Assetboard-backup.json'}),text);
  await until(p,()=>$('#modal').dataset.view==='import-preview');
  const preview=await p.locator('#import-preview').textContent();
  check(preview.includes('项目收入 1 个'),'The restore preview lists the project revenue: '+preview.slice(0,300));
  await p.click('#import-preview [data-action="import-apply"]');
  check(await p.evaluate(()=>JSON.stringify(state.projects))==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}','The restore brings the revenue back');
  check(await p.evaluate(()=>JSON.stringify(window.__saves.at(-1).projects))==='{"web":{"revenue":{"amount":30,"currency":"USD"}}}','and saves it');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 }finally{await context.close();}
 return 'PASS: revenue cleaned at load, agent figures in USD with equal and custom shares, update_project writes revenue and shares in one undo step, refuses bad input whole and without Pro, update_asset leaves shares alone and prunes them, undo and rename keep revenue, backup carries and restores it';
}
