// Run with the browser tool's filename option. Uses its own contexts; saves only to their localStorage.
// The detail is a card of its own (material.css, the detail as a card; app.js, detailMotion): under the content card's toolbar,
// which keeps the whole width, clear of the card's edges by the panels' gap (12 px quiet, 20 px 冰箱贴), with their radius and a
// shadow; quiet in the sidebar's glass, 冰箱贴 in the door's paper, a little clear and ringed with the door's colour. 编辑 beside
// 打开 is a wash of the accent and reads at AA. It comes in at once and a copy goes out as it closes, the detail itself hidden at
// once; the door's figure pulls it out and pushes it back within 0.3 s (one at the door's left goes to dust and appears beside the
// card), stands beside it in view while it is open, and is home again after; quick toggles skip to the end without the figure, in
// order; less motion only fades the card. With less transparency (the system's Reduce transparency) the card is solid, without
// the glass. The figures' stills are transparent.
async (page) => {
 const browser=page.context().browser();
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const contexts=[];let p;
 const open=async({skin='quiet',scene='',scheme='light',motion='no-preference',transparency='no-preference',native=false}={})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:motion,colorScheme:scheme});contexts.push(context);
  await context.addInitScript(([skin,scene,native])=>{localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1',skin);if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);
   if(native){window.webkit={messageHandlers:{assetboard:{postMessage:()=>{}}}};window.__ASSETBOARD_NATIVE__={data:null,demo:true,themePref:null,systemAccent:'#0a6fe8',lang:'zh'};}},[skin,scene,native]);
  p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  // Playwright has no option for prefers-reduced-transparency, and Chromium on macOS takes it from the system's Reduce
  // transparency (on in GitHub's hosted macOS images), so the page is given it here; this call replaces the media features
  // Playwright set, so the scheme and the motion are given again.
  await (await context.newCDPSession(p)).send('Emulation.setEmulatedMedia',{media:'',features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:motion},{name:'prefers-reduced-transparency',value:transparency}]});
  await p.goto('http://127.0.0.1:4317/'+(native?'':'?demo'));await p.waitForTimeout(500);
  // a record with a real management page, so the detail has 打开 and 编辑 side by side
  await p.evaluate(()=>{const a=state.assets.find(a=>a.name==='studio.example.com');a.url='https://www.namecheap.com/';if(!$('#detail').hidden)closeDetail();});
  await settle();
  return errors;
 };
 const openDetail=async()=>{await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());};
 const geometry=()=>p.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width};};
  const d=getComputedStyle($('#detail'));
  return {main:box('#main'),bar:box('#main .appbar'),detail:box('#detail'),board:{...box('#board'),r:box('#board').l+$('#board').clientLeft+$('#board').clientWidth-parseFloat(getComputedStyle($('#board')).paddingRight)},radius:parseFloat(d.borderTopLeftRadius),shadow:d.boxShadow,blur:d.backdropFilter||d.webkitBackdropFilter||'',fill:d.backgroundColor,image:d.backgroundImage};});
 const resolve=value=>p.evaluate(v=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=v;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3);},value);
 const pixel=async(x,y)=>{const shot=(await p.screenshot({clip:{x,y,width:1,height:1}})).toString('base64');
  return p.evaluate(async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(im,0,0);return [...x.getImageData(0,0,1,1).data].slice(0,3);},shot);};
 const contrast=(a,b)=>p.evaluate(([a,b])=>themeContrast(a,b),[a,b]);
 // the card's act (0.3 s), then the board's room (app.js, boardRoom: 0.34 s after the act); a slow machine takes longer, so after
 // that it waits, up to 5 s, until the room is made and nothing runs
 const settle=async()=>{await p.waitForTimeout(720);
  await p.waitForFunction(()=>roomTarget===null&&!roomMove&&!document.getAnimations().length,null,{timeout:5000,polling:50}).catch(()=>{});};
 try {
  // the card's place, in both skins and both schemes, the browser and the Mac app
  const cases=[{skin:'quiet',scheme:'light',gap:12,radius:12},{skin:'quiet',scheme:'dark',gap:12,radius:12},{skin:'quiet',scheme:'light',gap:12,radius:12,native:true},
   ...['kitchen','city','handdrawn','server'].map(scene=>({skin:'magnet',scene,gap:20,radius:14}))];
  for(const c of cases){
   const label=c.scene||`quiet ${c.scheme}${c.native?' (Mac app)':''}`;
   const errors=await open(c);
   await openDetail();await settle();
   const g=await geometry();
   const near=(a,b)=>Math.abs(a-b)<=1;
   check(near(g.bar.l,g.main.l)&&near(g.bar.r,g.main.r),`${label}: the toolbar keeps the content card's whole width ${JSON.stringify(g.bar)} ${JSON.stringify(g.main)}`);
   check(near(g.detail.t,g.bar.b+c.gap),`${label}: the card starts ${c.gap}px under the toolbar (${g.detail.t} vs ${g.bar.b})`);
   check(near(g.main.r-g.detail.r,c.gap)&&near(g.main.b-g.detail.b,c.gap),`${label}: the card is ${c.gap}px clear of the right and bottom edges ${JSON.stringify(g.detail)}`);
   if(c.skin==='magnet')check(g.board.r>g.detail.l+40,`${label}: the board keeps its width and the card covers it (${g.board.r} / ${g.detail.l})`);
   else check(g.board.r<=g.detail.l-c.gap+1,`${label}: the board's panels stop ${c.gap}px or more before the card (${g.board.r} / ${g.detail.l})`);
   check(near(g.radius,c.radius)&&/rgba?\(/.test(g.shadow)&&/blur\(/.test(g.blur),`${label}: the card has the panels' radius, a shadow and the glass (${g.radius}, ${g.shadow}, ${g.blur})`);
   const tone=await p.evaluate(()=>{const s=getComputedStyle(document.documentElement);return {card:s.getPropertyValue('--tone-card').trim().replace(/\s/g,''),primary:s.getPropertyValue('--tone-primary').trim().replace(/\s/g,'')};});
   if(c.skin==='magnet'){
    const m=g.fill.match(/rgba\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/);
    check(m&&[m[1],m[2],m[3]].join(',')===tone.card&&Number(m[4])<1&&Number(m[4])>=.8,`${label}: the card is the door's paper, a little clear (${g.fill})`);
    check(g.shadow.includes(`rgba(${tone.primary.split(',').join(', ')}`),`${label}: the card is ringed with the door's colour (${g.shadow})`);
   } else check(c.scheme==='dark'?/rgba/.test(g.fill):/gradient/.test(g.image),`${label}: the card is the window's glass (${g.fill} ${g.image})`);
   // 编辑 beside 打开: the accent's wash, its words at AA on what is drawn under them
   const edit=await p.evaluate(()=>{const b=document.querySelector('#detail [data-action=edit-asset]'),open=document.querySelector('#detail [data-action=external]'),r=b.getBoundingClientRect(),s=getComputedStyle(b);
    return {soft:b.classList.contains('soft'),open:!!open&&open.classList.contains('primary'),bg:s.backgroundColor,color:s.color,x:Math.round(r.left+5),y:Math.round(r.top+4)};});
   check(edit.soft&&edit.open,`${label}: 打开 is the main button and 编辑 the soft one ${JSON.stringify(edit)}`);
   check(edit.bg.startsWith(`rgba(${tone.primary.split(',').join(', ')}`),`${label}: 编辑 is a wash of the accent (${edit.bg})`);
   const under=await pixel(edit.x,edit.y),ink=await resolve(edit.color),ratio=await contrast(ink,under);
   check(ratio>=4.5,`${label}: 编辑 reads at AA (${ratio.toFixed(2)}: ${ink} on ${under})`);
   if(c.skin==='magnet'){
    // the figure stands beside the card in view, on the door, not under the card or a panel
    const fig=await p.evaluate(()=>{const f=document.querySelector('.scene-figure').getBoundingClientRect(),d=$('#detail').getBoundingClientRect(),b=$('#board').getBoundingClientRect(),m=$('#main').getBoundingClientRect();
     const s=getComputedStyle(document.querySelector('.scene-figure'));return {l:f.left,r:f.right,t:f.top,b:f.bottom,card:d.left,board:b.left+$('#board').clientLeft+$('#board').clientWidth-parseFloat(getComputedStyle($('#board')).paddingRight),bottom:m.bottom,shown:s.display!=='none'&&Number(s.opacity)>.5,still:s.backgroundImage!=='none'};});
    check(fig.shown&&fig.still&&fig.r<=fig.card-2&&fig.b<=fig.bottom,`${label}: the figure stands in view beside the card, over the wall ${JSON.stringify(fig)}`);
   }
   // the content card under a closed detail: the toolbar and the board take the whole width again
   await p.evaluate(()=>closeDetail());await settle();
   const shut=await p.evaluate(()=>({detail:$('#detail').hidden,copies:document.querySelectorAll('.detail-leave').length,board:$('#board').getBoundingClientRect().right,main:$('#main').getBoundingClientRect().right,fig:[...document.body.classList].filter(c=>c.startsWith('fig-'))}));
   check(shut.detail&&!shut.copies&&!shut.fig.length&&shut.board>=shut.main-1,`${label}: closed, the board has the width back and nothing is left over ${JSON.stringify(shut)}`);
   check(!errors.length,`${label}: page errors: ${errors.join(' | ')}`);
  }

  // less transparency: the card keeps its place, radius and shadow, and is the solid card colour, without the glass
  for(const c of [{skin:'quiet',radius:12},{skin:'magnet',scene:'kitchen',radius:14}]){
   const label=`less transparency (${c.scene||c.skin})`;
   const errors=await open({...c,transparency:'reduce'});
   await openDetail();await settle();
   const g=await geometry(),card=await p.evaluate(()=>({reduce:matchMedia('(prefers-reduced-transparency: reduce)').matches,tone:getComputedStyle(document.documentElement).getPropertyValue('--tone-card').trim().replace(/\s/g,'')}));
   check(card.reduce&&Math.abs(g.radius-c.radius)<=1&&/rgba?\(/.test(g.shadow),`${label}: the card keeps its radius and shadow (${g.radius}, ${g.shadow})`);
   check(g.blur==='none'&&g.image==='none'&&g.fill.replace(/\s/g,'')===`rgb(${card.tone})`,`${label}: the card is solid, without the glass (${g.blur}, ${g.fill}, ${g.image}, card ${card.tone})`);
   check(!errors.length,`${label}: page errors: ${errors.join(' | ')}`);
  }

  // motion: the card at once, the copy on close, the figure's act inside 0.3 s, then home
  for(const scene of ['kitchen','city']){
   await open({skin:'magnet',scene});
   // read in the same turn as the click, so a slow round trip does not read the act after it
   const first=await p.evaluate(()=>{document.querySelector('#board [data-asset] .item-open').click();return {anim:$('#detail').getAnimations().map(a=>({d:a.effect.getTiming().duration,k:a.effect.getKeyframes().map(k=>k.translate||'')})),fig:[...document.body.classList].filter(c=>c.startsWith('fig-')),
    ghost:getComputedStyle(document.querySelector('.scene-ghost')).display,figAnim:document.querySelector('.scene-figure').getAnimations({subtree:true}).map(a=>a.animationName),
    longest:Math.max(...document.getAnimations().map(a=>a.effect.getComputedTiming().endTime))};});
   check(first.anim.length===1&&first.anim[0].d<=300&&/px/.test(first.anim[0].k[0]),`${scene}: the card slides in at once from the right ${JSON.stringify(first.anim)}`);
   check(first.fig.join()==='fig-pull'&&first.figAnim.length===2,`${scene}: the figure pulls the card out ${JSON.stringify(first)}`);
   check(scene==='city'?first.ghost==='block'&&first.figAnim.includes('fig-warp-pull'):first.ghost==='none'&&first.figAnim.includes('fig-pull'),`${scene}: ${scene==='city'?'the figure at the left goes to dust and appears beside the card':'the figure at the right pulls where it stands'} ${JSON.stringify(first)}`);
   check(first.longest<=300,`${scene}: the whole act ends within 0.3 s (${first.longest})`);
   await settle();
   check(await p.evaluate(()=>!document.body.className.includes('fig-')&&!document.getAnimations().length),`${scene}: after the act nothing is left running`);
   const closed=await p.evaluate(()=>{closeDetail();const copy=document.querySelector('.detail-leave');
    return {hidden:$('#detail').hidden,copy:!!copy,inert:copy?.inert,ids:copy?copy.querySelectorAll('[id]').length+(copy.id?1:0):-1,leaving:copy?.getAnimations().length,fig:[...document.body.classList].filter(c=>c.startsWith('fig-')),
     inspecting:document.body.classList.contains('inspecting')};});
   check(closed.hidden&&!closed.inspecting&&closed.copy&&closed.inert&&closed.ids===0&&closed.leaving===1,`${scene}: closing hides the detail at once and an inert copy without ids slides out ${JSON.stringify(closed)}`);
   check(closed.fig.join()==='fig-push',`${scene}: the figure pushes the card back ${JSON.stringify(closed)}`);
   await settle();
   const home=await p.evaluate(()=>{const f=document.querySelector('.scene-figure').getBoundingClientRect(),m=$('#main').getBoundingClientRect();return {copies:document.querySelectorAll('.detail-leave').length,fig:document.body.className.includes('fig-'),left:f.left-m.left,right:m.right-f.right};});
   check(!home.copies&&!home.fig&&(scene==='city'?home.left<60:home.right<60),`${scene}: the copy is gone and the figure is home ${JSON.stringify(home)}`);

   // quick toggles: no figure, no copies piling up, the state of the last one, in order
   const quick=await p.evaluate(async()=>{const states=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<7;i++){if(i%2===0)document.querySelector('#board [data-asset] .item-open').click();else closeDetail();await wait(40);
     states.push({open:!$('#detail').hidden,fig:[...document.body.classList].filter(c=>c.startsWith('fig-')).join(),copies:document.querySelectorAll('.detail-leave').length});}
    return states;});
   check(quick.every((s,i)=>s.open===(i%2===0)),`${scene}: quick toggles end each in its own state, in order ${JSON.stringify(quick)}`);
   check(quick.slice(1).every(s=>!s.fig&&s.copies===0),`${scene}: quick toggles skip the figure and the copy ${JSON.stringify(quick)}`);
   await settle();
   const after=await p.evaluate(()=>{const f=document.querySelector('.scene-figure').getBoundingClientRect(),d=$('#detail').getBoundingClientRect();return {open:!$('#detail').hidden,fig:document.body.className.includes('fig-'),anim:document.getAnimations().length,beside:f.right<=d.left-2,translate:getComputedStyle($('#detail')).translate};});
   check(after.open&&!after.fig&&!after.anim&&after.beside&&after.translate==='none',`${scene}: after quick toggles the card is open in its place with the figure beside it ${JSON.stringify(after)}`);
  }

  // less motion: the card only fades, the figure holds its still
  await open({skin:'magnet',scene:'server',motion:'reduce'});
  const calm=await p.evaluate(()=>{document.querySelector('#board [data-asset] .item-open').click();const a=$('#detail').getAnimations();
   return {n:a.length,translate:a.flatMap(x=>x.effect.getKeyframes()).some(k=>k.translate),opacity:a.flatMap(x=>x.effect.getKeyframes()).some(k=>'opacity' in k),fig:document.body.className.includes('fig-')};});
  check(calm.n===1&&!calm.translate&&calm.opacity&&!calm.fig,`less motion: the card fades in and the figure holds still ${JSON.stringify(calm)}`);
  const calmClose=await p.evaluate(async()=>{await new Promise(r=>setTimeout(r,400));closeDetail();const copy=document.querySelector('.detail-leave');return {fig:document.body.className.includes('fig-'),translate:!!copy?.getAnimations().flatMap(x=>x.effect.getKeyframes()).some(k=>k.translate)};});
  check(!calmClose.fig&&!calmClose.translate,`less motion: the card fades out ${JSON.stringify(calmClose)}`);

  // the figures' stills and act strips are transparent around the figure
  const clear=await p.evaluate(async()=>{const out={};for(const n of ['chef','engineer','hedgehog','cat'])for(const f of [n,n+'@2x',n+'-act',n+'-act@2x']){const im=new Image();im.src=`art/fridge/${f}.png`;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);out[f]=x.getImageData(0,0,1,1).data[3];}return out;});
  check(Object.values(clear).every(a=>a===0),`the figures' stills and strips are transparent ${JSON.stringify(clear)}`);
  return 'PASS: the detail is a floating card that comes and goes with the figure';
 } finally { for(const c of contexts)await c.close(); }
}
