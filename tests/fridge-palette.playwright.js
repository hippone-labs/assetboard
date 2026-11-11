// Run with the browser tool's filename option. Uses its own contexts; saves only to their localStorage.
// 冰箱贴's doors colour the whole window (theme.js, FRIDGE_PALETTES): for each door the canvas behind the sidebar and the top bar,
// the search field (the door's paper or a wash of its ink), the selected sidebar entry, the main button and the hairlines are the door's and not the quiet theme's; the
// door's palette meets WCAG AA on its own (text and accent on every surface, the accent also on rows tinted with it); every visible
// text of the sidebar, the top bar, the overview, the panels and the inspector meets AA on the screen as drawn; in the Mac app the
// page asks the window for the door's scheme (themeColor) and the sidebar's glass is of the door's paper. Back on the quiet skin the
// chosen theme returns and the window follows the system again.
async (page) => {
 const browser=page.context().browser();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const failures=[],counts=[];let p;
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

 const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number).join(',');
 const SCENES={kitchen:'light',city:'dark',handdrawn:'light',server:'dark'};
 const open=async(scene,native)=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(([scene,native])=>{localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1',scene?'magnet':'quiet');if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);
   if(native){window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage:m=>window.__sent.push(m)}}};window.__ASSETBOARD_NATIVE__={data:null,demo:true,themePref:null,systemAccent:'#0a6fe8',lang:'zh'};}},[scene,native]);
  p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/'+(native?'':'?demo'));await p.waitForTimeout(400);
  return {context,errors};
 };
 const contexts=[];
 try {
  for(const [scene,scheme] of Object.entries(SCENES)){
   const {context,errors}=await open(scene,false);contexts.push(context);
   const look=await p.evaluate(()=>{const css=getComputedStyle(document.documentElement),v=n=>css.getPropertyValue(n).trim().replace(/\s/g,'');
    const active=document.querySelector('#sidebar .nav-item.active'),search=document.querySelector('.topnav .search')||document.querySelector('#search');
    const probe=document.createElement('i');probe.style.cssText='position:absolute;background:var(--cta);border-top:1px solid var(--hairline)';document.body.append(probe);const pc=getComputedStyle(probe),cta=pc.backgroundColor,hair=pc.borderTopColor;probe.remove();
    return {scheme:document.documentElement.dataset.scheme,canvas:v('--tone-canvas'),card:v('--tone-card'),ink:v('--tone-ink'),primary:v('--tone-primary'),body:getComputedStyle(document.body).backgroundColor,
     active:active&&getComputedStyle(active).backgroundColor,search:search&&getComputedStyle(search).backgroundColor,cta,hair,wall:!!document.querySelector('#board .wall.free')};});
   const door=await p.evaluate(s=>Object.fromEntries(Object.entries(fridgePalette(s)).map(([k,v])=>[k,v.join(',')])),scene);
   const quiet=await p.evaluate(s=>Object.fromEntries(Object.entries(themePalette(themeFor(themePref),s)).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.join(',')])),scheme);
   check(look.wall&&look.scheme===scheme,`${scene}: the wall is on its door in the ${scheme} scheme ${JSON.stringify(look)}`);
   for(const role of ['canvas','card','ink','primary']){check(look[role]===door[role],`${scene}: --tone-${role} is the door's ${door[role]}, not ${look[role]}`);check(door[role]!==quiet[role],`${scene}: the door's ${role} differs from the quiet theme's`);}
   check(rgb(look.body)===door.canvas,`${scene}: the canvas behind the sidebar and the top bar is the door's (${look.body})`);
   check(look.active&&rgb(look.active)===door.primary&&/rgba/.test(look.active),`${scene}: the selected sidebar entry is tinted with the door's accent (${look.active})`);
   check(look.search&&[door.card,door.ink].includes(rgb(look.search)),`${scene}: the search field is of the door's paper or a wash of its ink (${look.search})`);
   check(rgb(look.cta)===door.primary,`${scene}: the main button takes the door's accent, not black (${look.cta})`);
   check(rgb(look.hair)===door.ink,`${scene}: the hairlines are of the door's ink (${look.hair})`);
   // the palette on its own: ink and muted on every surface, the accent as text (also on its 20% tint) and as a button fill
   const score=await p.evaluate(([s,scheme])=>{const d=fridgePalette(s),on=scheme==='dark'?d.canvas:[255,255,255],surfaces=[d.canvas,d.category,d.card],tint=(bg,a)=>bg.map((v,i)=>v*(1-a)+d.primary[i]*a);
    return Math.min(...surfaces.flatMap(bg=>[themeContrast(d.ink,bg),themeContrast(d.muted,bg),themeContrast(d.primary,bg),themeContrast(d.primary,tint(bg,.2))]),themeContrast(on,d.primary));},[scene,scheme]);
   check(score>=4.5,`${scene}: the door's palette falls under AA (${score.toFixed(2)})`);
   await audit(scene+' window');
   await p.locator('#board .wall [data-asset] .item-open').first().click();await p.waitForTimeout(150);
   await audit(scene+' inspector','#detail');
   check(!errors.length,`${scene}: page errors: ${errors.join(' | ')}`);
  }
  // The Mac app: the door's scheme goes to the window with its canvas, and the sidebar's glass is of the door's paper; the quiet
  // skin sends no scheme, so the window follows the system again.
  for(const [scene,scheme] of Object.entries(SCENES)){
   const {context}=await open(scene,true);contexts.push(context);
   const sent=await p.evaluate(()=>window.__sent.filter(m=>m.action==='themeColor').pop());
   const door=await p.evaluate(s=>fridgePalette(s).canvas.join(','),scene),card=await p.evaluate(s=>fridgePalette(s).card.join(','),scene);
   check(sent&&sent.scheme===scheme&&sent.rgb.join(',')===door,`${scene}: the Mac app is told the door's scheme and canvas ${JSON.stringify(sent)}`);
   const glass=await p.evaluate(()=>getComputedStyle(document.querySelector('#sidebar')).backgroundColor);
   check(rgb(glass)===card&&/rgba/.test(glass),`${scene}: the sidebar's glass is of the door's paper (${glass})`);
   await p.evaluate(()=>setSkin('quiet'));
   const back=await p.evaluate(()=>window.__sent.filter(m=>m.action==='themeColor').pop());
   check(back&&!('scheme' in back)&&back.rgb.join(',')!==door,`${scene}: the quiet skin lets the window follow the system ${JSON.stringify(back)}`);
  }
  if(failures.length)throw new Error(`${failures.length} low-contrast texts: `+failures.slice(0,12).join(' | '));
  return 'PASS: fridge doors colour the window — '+counts.join(', ');
 } finally { for(const c of contexts)await c.close(); }
}
