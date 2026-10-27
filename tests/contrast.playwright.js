// Run with the browser tool's filename option. Checks every visible text node in light and dark schemes; never saves.
async (page) => {
 const p=await page.context().newPage();
 const failures=[],counts=[];
 const audit=async (label,scope)=>{
  const result=await p.evaluate(({label,scope})=>{
   const parse=value=>{const m=(value.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
   const over=(top,bottom)=>({r:top.r*top.a+bottom.r*(1-top.a),g:top.g*top.a+bottom.g*(1-top.a),b:top.b*top.a+bottom.b*(1-top.a),a:1});
   const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
   const root=document.querySelector('#modal[open]')||(scope&&document.querySelector(scope))||document.body,seen=new Set(),found=[];let checked=0;
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const element=walker.currentNode.parentElement;
    if(!walker.currentNode.textContent.trim()||!element||seen.has(element))continue;seen.add(element);
    if(element.closest('svg,[hidden],option,[inert],button:disabled')||(root===document.body&&element.closest('dialog')))continue;
    const style=getComputedStyle(element);if(style.visibility!=='visible'||!element.getClientRects().length)continue;
    let opacity=1;for(let node=element;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
    if(opacity<.5)continue;
    const resolve=v=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=v;x.fillRect(0,0,1,1);const d=x.getImageData(0,0,1,1).data;return {r:d[0],g:d[1],b:d[2],a:1};};
    const layers=[];for(let node=element;node;node=node.parentElement){const bot=node.classList?.contains('asset-card')?getComputedStyle(node).getPropertyValue(matchMedia('(prefers-color-scheme:dark)').matches?'--card-top':'--card-bottom').trim():'';const c=bot?resolve(bot):parse(getComputedStyle(node).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
    let background={r:255,g:255,b:255,a:1};for(const layer of layers.reverse())background=over(layer,background);
    const color=parse(style.color);color.a*=opacity;
    const size=parseFloat(style.fontSize),bold=Number(style.fontWeight)>=700,need=size>=24||(size>=18.66&&bold)?3:4.5,value=ratio(over(color,background),background);
    checked++;
    if(value<need)found.push(`${label}: "${walker.currentNode.textContent.trim().slice(0,24)}" <${element.tagName.toLowerCase()}.${[...element.classList].join('.')}> ${value.toFixed(2)} < ${need}`);
   }
   return {checked,found};
  },{label,scope});
  failures.push(...result.found);counts.push(`${label} ${result.checked}`);
 };
 try {
  for(const scheme of ['light','dark']){
   await p.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
   await p.goto('http://127.0.0.1:4317/');
   if(await p.evaluate(()=>document.documentElement.dataset.scheme)!==scheme)throw new Error('Scheme not applied: '+scheme);
   await p.evaluate(()=>{save=()=>{};state={blocks:[],assets:[]};render();});
   await audit(scheme+' welcome');
   await p.evaluate(()=>{
    const day=o=>isoDay(localDay()+o),repo=(n,i)=>({id:'r'+i,type:'repository',name:'me/'+n,provider:'GitHub',account:'me',purpose:'代码仓库',event:'私有仓库',source:'github',externalId:String(i),updatedAt:day(-i)+'T00:00:00Z',art:'generic'});
    state={blocks:[{id:'domain',width:60,collapsed:false,height:null},{id:'subscription',width:40,collapsed:true,height:null},{id:'repository',width:100,collapsed:false,height:null,folded:true}],assets:[
     {id:'a',type:'domain',name:'soon.dev',provider:'Registrar',account:'个人',purpose:'主站',reason:'读者书签都指向这里',date:day(6),cost:'¥ 89 / 年',art:'note',source:'manual',url:'https://registrar.example.org'},
     {id:'b',type:'domain',name:'late.dev',provider:'Registrar',account:'个人',purpose:'实验',date:day(-2),art:'generic',source:'manual'},
     {id:'h',type:'domain',name:'quiet.dev',provider:'Registrar',account:'个人',purpose:'旧站',hiddenAt:'2026-01-01',art:'generic',source:'manual'},
     {id:'c',type:'subscription',name:'Figma',provider:'Figma',account:'团队',purpose:'设计',date:day(20),dateKind:'renew',cycle:'monthly',art:'figma',source:'manual'},
     ...['one','two','three','four','five','six','seven','eight'].map(repo)]};
    evidenceRows=[{id:'g1',kind:'gmail',source:'Figma <billing@figma.com>',title:'Your plan renews',body:'Your Figma plan will renew on October 6, 2099. You will be charged $15.00/month.',payload:'{}'},{id:'g2',kind:'gmail',source:'News <hi@letters.io>',title:'Weekly',body:'hello',payload:'{}'}];evidenceVersion++;
    render();
   });
   await audit(scheme+' board');
   await p.locator('.group[data-group="domain"] .group-head').hover();await audit(scheme+' hover handles');
   await p.locator('[data-asset="b"]').hover();await audit(scheme+' hovered row');
   await p.locator('[data-asset="a"] .item-open').click();await audit(scheme+' detail');await audit(scheme+' selected row','#board [data-asset="a"]');
   await p.locator('#detail [data-action="asset-menu"]').click();await audit(scheme+' menu','#menu');
   await p.locator('#menu .menu-item >> nth=1').hover();await audit(scheme+' menu hover','#menu');
   await p.locator('#menu [data-action="hide-asset"]').click();await audit(scheme+' toast');
   await p.locator('#sidebar .nav-item[data-id="hidden"]').click();await audit(scheme+' hidden rows');
   await p.locator('#sidebar .nav-item[data-id="upcoming"]').click();await audit(scheme+' upcoming');
   await p.locator('#sidebar .nav-item[data-id="all"]').click();
   await p.locator('#layout-toggle [data-id="grid"]').click();await audit(scheme+' grid');
   await p.locator('#layout-toggle [data-id="list"]').click();
   await p.locator('#search').fill('nothing-matches');await audit(scheme+' empty search');await p.locator('#search').fill('');
   await p.evaluate(()=>inboxDialog(false));await audit(scheme+' inbox');
   await p.locator('[data-action="candidate-review"]').first().click();await audit(scheme+' review');
   await p.locator('[data-action="candidate-apply"]').click();await audit(scheme+' asset form');
   await p.evaluate(()=>{$('#modal').close();confirmDialog('删除这条记录？','将删除「soon.dev」在 Assetboard 中的记录。','删除记录',true);});await audit(scheme+' confirm');
   await p.evaluate(()=>{$('#modal').close();themeDialog();});await audit(scheme+' theme');
   await p.evaluate(()=>{$('#modal').close();syncFollowUp('GitHub',{read:1,collisions:[{assetId:'a',name:'soon.dev',fields:{}}]},['Pages 权限不足']);});await audit(scheme+' sync follow-up');
   await p.evaluate(()=>{$('#modal').close();state.blocks.unshift({id:'bankcard',width:50,collapsed:false,height:null},{id:'appleid',width:50,collapsed:false,height:null});state.assets.push({id:'card',type:'bankcard',name:'汇丰 One',provider:'汇丰香港',account:'',region:'HK',last4:'4821',network:'Visa',date:isoDay(localDay()+20),dateKind:'expire',art:'generic',source:'manual',links:['apple']},{id:'apple',type:'appleid',name:'美区主号',provider:'Apple',account:'me@example.org',region:'US',art:'generic',source:'manual',links:['card']});render();});await audit(scheme+' priority rows');
   await p.locator('[data-asset="apple"] .item-open').click();await audit(scheme+' linked detail');
   await p.locator('#detail [data-action="link-picker"]').click();await audit(scheme+' link picker');
   await p.evaluate(()=>{$('#modal').close();closeDetail();assetForm('bankcard');});await audit(scheme+' bank card form');
   // Panorama (v13b): lanes, chips, stopped chip, tray heads and the unmounted strip. The dimmed non-focus state is intentionally excluded.
   await p.evaluate(()=>{$('#modal').close();closeDetail();state=window.assetboardDemoBoard();state.assets.find(a=>a.id==='demo-d2').stopped=true;state.assets.find(a=>a.id==='demo-s2').stopped=true;render();boardScroller().scrollTo(0,0);});await p.waitForTimeout(450);
   await audit(scheme+' stopped domain row','#board [data-asset="demo-d2"]');await audit(scheme+' stopped server row','#board [data-asset="demo-s2"]');
   // Enough loose things for the +N, whichever demo this is (the free one has few repositories).
   await p.evaluate(()=>{for(let i=0;i<10;i++)state.assets.push({id:'loose-r'+i,type:'repository',name:'loose-'+i,provider:'GitHub',source:'manual',art:'generic',cost:'未知',updatedAt:new Date().toISOString()});panoramaOpen(true);});
   await audit(scheme+' panorama');
   await p.locator('[data-loose-more]').click();await audit(scheme+' panorama unmounted open');
   await p.evaluate(()=>{panoramaFocus('demo-s2');});await p.waitForTimeout(300);await audit(scheme+' panorama focused (stopped server)');
  await p.evaluate(()=>{panoramaFocus('demo-s1');});await p.waitForTimeout(300);await audit(scheme+' panorama focused');
  await p.evaluate(()=>panoramaOpen(false));
  // The collapsed sidebar (variant B): its tip, the 更多 menu, and the menu with an entry focused.
  await p.evaluate(()=>{toggleSidebar(false);setView('all');});
  await p.locator('#sidebar .nav-item[data-block="domain"]').hover();await p.waitForSelector('#rail-tip:not([hidden])');await audit(scheme+' rail tip','#rail-tip');
  await p.locator('#sidebar .nav-more').click();await audit(scheme+' rail more menu','#menu');
  await p.keyboard.press('ArrowDown');await audit(scheme+' rail more menu focus','#menu');
  await p.keyboard.press('Escape');await p.evaluate(()=>toggleSidebar(true));
  }
  // One line: the test runner keeps only the first line of a failure.
  if(failures.length)throw new Error(`${failures.length} low-contrast texts: `+failures.slice(0,12).join(" | "));
  return 'PASS: text contrast in light and dark — '+counts.join(', ');
 } finally { await p.close(); }
}
