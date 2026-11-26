// Run with the browser tool's filename option. 组合视图: 新建视图 in the sidebar, the 机器 preset (服务器 + 设备), the view showing only those
// blocks with their count and overview, one undo step; editing from the view's ⋯ (rename, fewer categories); deleting after a
// confirmation leaves every record where it was. Uses an isolated page and never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const p=await page.context().newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.setViewportSize({width:1400,height:900});
  await p.goto('http://127.0.0.1:4317/');
  await p.waitForFunction(()=>typeof mixDialog==='function');
  await p.evaluate(()=>{save=()=>{};history.length=0;state={blocks:[{id:'domain'},{id:'server'},{id:'device'}],assets:[
   {id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',cost:'$6/月',art:'generic'},
   {id:'d1',type:'device',name:'MacBook Pro',provider:'Apple',deviceKind:'mac',art:'generic'},
   {id:'d2',type:'device',name:'iPhone',provider:'Apple',deviceKind:'iphone',art:'generic'},
   {id:'n1',type:'domain',name:'example.com',provider:'Cloudflare',art:'generic'}]};setView('all');render();});
  const groups=()=>p.evaluate(()=>[...document.querySelectorAll('#board .group')].map(g=>g.dataset.group).join());

  check(await p.locator('#sidebar [data-action="mix-new"]').count()===1,'the sidebar offers 新建视图');
  await p.click('#sidebar [data-action="mix-new"]');
  await p.click('#mix-form [data-action="mix-preset"][data-id="machines"]');
  check(await p.evaluate(()=>{const f=document.querySelector('#mix-form');return f.elements.name.value==='机器'&&[...f.querySelectorAll('[name="types"]:checked')].map(x=>x.value).join()==='server,device';}),'the preset fills the name and ticks 服务器 and 设备');
  await p.click('#mix-form [type="submit"]');
  const mix=await p.evaluate(()=>({views:state.views,view:currentView(),title:document.querySelector('#view-title').textContent}));
  check(mix.views?.length===1&&mix.view==='mix:'+mix.views[0].id&&mix.title==='机器','the view is made and opened: '+JSON.stringify(mix));
  check(await groups()==='server,device','only the server and device blocks, in the board’s order: '+await groups());
  check(await p.evaluate(id=>/机器\s*3/.test(document.querySelector(`#sidebar [data-id="mix:${id}"]`).textContent),mix.views[0].id),'the sidebar item counts its records');
  check(await p.evaluate(()=>/\$6/.test(document.querySelector('#view-meta').textContent)),'the head shows the cost of what is in it');

  // Edit from the view's ⋯: rename and keep only servers.
  await p.click('#view-menu');
  check(await p.evaluate(()=>document.querySelector('#modal[open]')?.dataset.view==='mix'&&!document.querySelector('#mix-form [data-action="mix-preset"]')),'⋯ opens the view’s own dialog, without the presets');
  await p.fill('#mix-form [name="name"]','云端');
  await p.uncheck('#mix-form [name="types"][value="device"]');
  await p.click('#mix-form [type="submit"]');
  check(await p.evaluate(()=>document.querySelector('#view-title').textContent)==='云端'&&await groups()==='server','renamed, and only servers now');
  await p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
  check(await p.evaluate(()=>state.views[0].name==='机器'&&state.views[0].types.join()==='server,device'),'one undo step brings the earlier view back');

  // Deleting asks first, then leaves every record in place.
  await p.click('#view-menu');
  await p.click('#mix-form [data-action="mix-delete"]');
  check(await p.locator('#modal[open] #confirm-yes').isVisible(),'deleting asks in the page');
  await p.click('#confirm-yes');
  check(await p.evaluate(()=>!state.views&&state.assets.length===4&&currentView()==='all'),'the view is gone, the records stay, the board is 全部资产');
  check(!errors.length,errors.join(' | '));
  return 'PASS: 新建视图 with the 机器 preset, only its blocks with count and cost, editing from ⋯ with undo, deleting after a confirmation';
 } finally { await p.close(); }
}
