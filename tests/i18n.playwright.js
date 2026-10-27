// Run with the browser tool's filename option. The English interface leaves no Chinese on screen: the demo board (native demo, so the
// Mac-only dialogs open too) in English, every view, the detail and menu of each record, the add form of each category, and each
// dialog. Collects the rendered text and the title / aria-label / placeholder people read; filed numbers (ICP) are data, not copy,
// and a language's own name (marked lang="zh-CN", as in 设置 › 语言) is meant to stay in its script.
async (page) => {
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'en-US'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{
   window.webkit={messageHandlers:{assetboard:{postMessage(m){
    if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);
    if(m.action==='localCliDetect')setTimeout(()=>window.assetboardLocalCliDetect?.({gh:false,ghAccounts:[],sshConfig:false}),5);
   }}}};
   window.__ASSETBOARD_NATIVE__={demo:true,lang:'en',data:null,cloudflareConnected:false,githubConnected:false,statusItem:true,autoUpdate:true,notifications:'allowed'};
  });
  await p.goto('http://127.0.0.1:4317/');
  for(let i=0;i<100&&!await p.evaluate(()=>typeof render==='function'&&!!document.querySelector('#board .group, #board .row'));i++)await p.waitForTimeout(50);
  const found=new Map();
  const scan=async label=>{
   const list=await p.evaluate(()=>{
    const cjk=/[㐀-鿿＀-￯　-〿]/,data=/ICP|公网安备|京|沪|粤/,out=new Set();
    const shown=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let n;(n=walk.nextNode());){const v=n.nodeValue.trim();if(v&&cjk.test(v)&&!data.test(v)&&shown(n.parentElement)&&!n.parentElement.closest('script,style,[lang^=zh]'))out.add(v.slice(0,120));}
    for(const el of document.querySelectorAll('[title],[aria-label],[placeholder]'))if(shown(el)||el.matches('dialog[open] *'))for(const a of ['title','aria-label','placeholder']){const v=el.getAttribute(a);if(v&&cjk.test(v)&&!data.test(v))out.add(`[${a}] ${v.slice(0,120)}`);}
    if(cjk.test(document.title))out.add('[title] '+document.title);
    return [...out];
   });
   for(const v of list)if(!found.has(v))found.set(v,label);
  };
  const step=async(label,fn,arg)=>{try{await p.evaluate(fn,arg);}catch(e){errors.push(`${label}: ${e.message.split('\n')[0]}`);}await p.waitForTimeout(80);await scan(label);await p.evaluate(()=>{if($('#modal').open)$('#modal').close();closeMenu?.();});};

  await scan('all');
  const types=await p.evaluate(()=>Object.keys(cats));
  for(const v of ['upcoming','all','hidden',...types])await step('view '+v,v=>setView(v),v);
  await step('grid',()=>{setView('all');setLayout('grid');});
  await p.evaluate(()=>setLayout('list'));
  const ids=await p.evaluate(()=>state.assets.map(a=>a.id));
  for(const id of ids){
   await step('detail '+id,id=>showDetail(id),id);
   await step('menu '+id,id=>openMenu(assetMenuItems(state.assets.find(a=>a.id===id),true)),id);
   await step('edit '+id,id=>assetForm(state.assets.find(a=>a.id===id).type,id),id);
  }
  for(const type of types)await step('add '+type,type=>assetForm(type),type);
  for(const [label,fn] of Object.entries({
   capture:()=>captureDialog(''),importHub:()=>importHub(),exportDialog:()=>exportDialog(),prefsDialog:()=>prefsDialog('general'),prefsFeatures:()=>prefsDialog('features'),prefsConnections:()=>prefsDialog('connections'),prefsAbout:()=>prefsDialog('about'),themeDialog:()=>themeDialog(),
   inbox:()=>inboxDialog(),cloudflare:()=>cloudflareDialog(),github:()=>githubDialog(),ai:()=>aiDialog(),iconBatch:()=>iconBatchDialog(),network:()=>networkDialog(),
   agent:()=>agentSetupDialog(),probe:()=>probeDialog(),ssh:()=>sshProbeDialog(),shutdown:()=>shutdownDialog?.(),
   settings:()=>settings('domain'),keys:()=>toggleKeysHelp(true)}))await step(label,fn);
  await p.evaluate(()=>{if(!$('#keys-help').hidden)toggleKeysHelp(false);});
  await step('panorama',()=>togglePanorama(true));
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{sidebarRail=true;render();});await step('rail',()=>openRailMore($('#sidebar .nav-more')));

  const lines=[...found].map(([v,label])=>`${label}: ${v}`);
  if(lines.length||errors.length)throw new Error(`${lines.length} Chinese strings in English:\n${lines.slice(0,300).join('\n')}${errors.length?'\nErrors: '+errors.join(' | '):''}`);
 } finally { await context.close(); }
 return 'PASS';
}
