// Run with the browser tool's filename option. Uses its own browser and contexts; demo mode, never saves.
// 滚动条 (material.css, the "滚动条" layer; scrollbars.js): the page draws every bar itself. Checked in a browser of its own that
// draws the system's bars (Playwright starts Chromium with --hide-scrollbars; this one is started without it, so on Linux it draws
// the old grey 15px bars a Mac draws with a mouse or 「显示滚动条：始终」), under 安静 light and dark and two 冰箱贴 doors:
// - the detail, the board, the sidebar and a dialog keep a 10px gutter, scrolling or not, and the detail's text keeps its place;
// - the bar is a capsule of the ink inset in its gutter (no track, nothing at the gutter's edges), not the system's grey bar;
// - hidden at rest when the system's bars overlay, faint at rest when it draws them always (html.sb-classic, read from a probe);
//   shown while a scroller scrolls (wheel or script) and while the pointer is near its edge, then faded again;
// - the capsule can be dragged; less motion shows and hides it without a fade; less transparency gives it a solid colour, more
//   contrast keeps it shown at rest.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const own=await page.context().browser().browserType().launch({...(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{}),ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  // pixels of a part of the screen, read in a blank page (the board's CSP is left alone): per column, how far each pixel is from the
  // gutter's own ground (the median of its outer column) at most
  const decoder=await (await own.newContext()).newPage();
  const columns=async(p,clip)=>{
   const png=(await p.screenshot({clip})).toString('base64');
   return decoder.evaluate(async src=>{const i=new Image();i.src='data:image/png;base64,'+src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);
    const d=x.getImageData(0,0,i.width,i.height).data,at=(cx,cy)=>{const k=(cy*i.width+cx)*4;return [d[k],d[k+1],d[k+2]];};
    const ground=[0,1,2].map(ch=>{const v=[];for(let y=0;y<i.height;y++)v.push(at(0,y)[ch]);v.sort((a,b)=>a-b);return v[v.length>>1];});
    const cols=[];for(let cx=0;cx<i.width;cx++){let most=0;for(let y=0;y<i.height;y++){const px=at(cx,y);most=Math.max(most,Math.max(...px.map((v,ch)=>Math.abs(v-ground[ch]))));}cols.push(most);}
    return cols;},png);
  };
  const open=async({skin='quiet',scene='',scheme='light',motion='no-preference',media=[]}={})=>{
   const context=await own.newContext({viewport:{width:1280,height:720},colorScheme:scheme,reducedMotion:motion,locale:'zh-CN'});
   await context.addInitScript(([skin,scene])=>{localStorage.setItem('assetboard-lang-v1','zh');localStorage.setItem('assetboard-skin-v1',skin);if(scene)localStorage.setItem('assetboard-fridge-scene-v1',scene);},[skin,scene]);
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   if(media.length)await (await context.newCDPSession(p)).send('Emulation.setEmulatedMedia',{features:media});
   await p.goto('http://127.0.0.1:4317/?demo');await p.waitForFunction(()=>document.querySelector('#board [data-asset]'));
   await p.evaluate(()=>{showDetail(state.assets.find(a=>a.type==='server').id);});
   await p.waitForFunction(()=>!$('#detail').hidden&&!document.querySelector('.detail-leave')&&!$('#detail').getAnimations().length);
   await p.mouse.move(300,400);await p.waitForTimeout(1300);
   return {p,context,errors};
  };
  const gutter=(p,sel)=>p.evaluate(sel=>{const n=document.querySelector(sel),s=getComputedStyle(n);return n.offsetWidth-n.clientWidth-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth);},sel);
  // the vertical gutter of a scroller as a clip, inside the track's margins
  const strip=(p,sel)=>p.evaluate(sel=>{const n=document.querySelector(sel),r=n.getBoundingClientRect(),s=getComputedStyle(n),w=n.offsetWidth-n.clientWidth-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth);
   return {x:r.right-parseFloat(s.borderRightWidth)-w,y:r.top+24,width:w,height:r.height-48};},sel);
  const on=(p,sel)=>p.evaluate(sel=>document.querySelector(sel).classList.contains('sb-on'),sel);
  const capsule=(cols,label)=>{
   check(cols.length===10,`${label}: the gutter is 10px wide ${cols.length}`);
   // (the outermost columns may take a pixel of the neighbour where the box is at a fraction of a pixel)
   check(Math.max(cols[1],cols[8])<=10,`${label}: nothing is drawn at the gutter's sides (no track, no grey bar) ${cols}`);
   check(Math.min(...cols.slice(3,7))>=18,`${label}: the capsule is drawn in the gutter's middle ${cols}`);
  };
  const clear=(cols,label)=>check(Math.max(...cols.slice(1,-1))<=10,`${label}: no capsule at rest ${cols}`);

  for(const [skin,scene,scheme] of [['quiet','','light'],['quiet','','dark'],['magnet','kitchen','light'],['magnet','city','dark']]){
   const label=`${skin}${scene?'/'+scene:''} ${scheme}`,{p,context,errors}=await open({skin,scene,scheme});
   // the system draws its own bars in this browser (Linux: always; a Mac: as set): the page knows from its probe
   const system=await p.evaluate(()=>{const n=document.createElement('div');n.className='sb-probe';n.style.cssText='position:absolute;width:60px;height:60px;overflow:scroll';document.body.append(n);const w=n.offsetWidth-n.clientWidth;n.remove();return {w,classic:document.documentElement.classList.contains('sb-classic')};});
   check(system.classic===(system.w>0),`${label}: html.sb-classic follows the system's bars ${JSON.stringify(system)}`);
   // the gutters, scrolling or not; the detail's text keeps 22px from the card's right edge, the board's 20px
   for(const sel of ['#detail','#board','#sidebar'])check(await gutter(p,sel)===10,`${label}: ${sel} has a 10px gutter, not the system's ${await gutter(p,sel)}`);
   const edges=await p.evaluate(()=>{const d=$('#detail').getBoundingClientRect(),c=$('#detail-content').getBoundingClientRect(),b=$('#board').getBoundingClientRect(),w=document.querySelector('#board .wall,#board .group')?.getBoundingClientRect();return {detail:Math.round(d.right-c.right),board:w?Math.round(b.right-w.right):20};});
   check(edges.detail===22,`${label}: the detail's content ends 22px from the card's edge (12 + the gutter) ${JSON.stringify(edges)}`);
   check(edges.board>=20,`${label}: the board's content keeps clear of its gutter ${JSON.stringify(edges)}`);
   // the detail scrolls: at rest no capsule (or a faint one when the system draws its bars always); a scroll shows the capsule
   check(await p.evaluate(()=>$('#detail').scrollHeight>$('#detail').clientHeight),`${label}: the detail scrolls at 1280×720`);
   await p.evaluate(()=>document.documentElement.classList.remove('sb-classic'));await p.waitForTimeout(50);
   clear(await columns(p,await strip(p,'#detail')),`${label} detail, overlay system`);
   await p.evaluate(()=>document.documentElement.classList.add('sb-classic'));await p.waitForTimeout(50);
   const faint=await columns(p,await strip(p,'#detail'));
   check(Math.max(...faint)>=6&&Math.max(faint[1],faint[8])<=10,`${label}: a faint capsule at rest when the system draws its bars always ${faint}`);
   await p.mouse.move(400,400);await p.mouse.wheel(0,0);
   const box=await p.evaluate(()=>{const r=$('#detail').getBoundingClientRect();return {x:r.left+120,y:r.top+200};});
   await p.mouse.move(box.x,box.y);await p.mouse.wheel(0,120);
   await p.waitForFunction(()=>$('#detail').scrollTop>0&&$('#detail').classList.contains('sb-on'));
   // held shown while the picture is taken (a slow machine may take longer than the 0.9 s a scroll shows it for)
   const pin=sel=>p.evaluate(sel=>sbPoint(sel?new Set([document.querySelector(sel)]):new Set()),sel);
   await pin('#detail');await p.waitForTimeout(150);
   const shown=await columns(p,await strip(p,'#detail'));capsule(shown,`${label} detail, scrolling`);await pin(null);
   check(Math.max(...shown.slice(3,7))>Math.max(...faint.slice(3,7))+6,`${label}: scrolling shows the capsule stronger than at rest ${shown} ${faint}`);
   await p.waitForFunction(()=>!$('#detail').classList.contains('sb-on'),null,{timeout:3000});
   // the board too
   await p.evaluate(()=>{$('#board').scrollTop+=80;});await p.waitForFunction(()=>$('#board').classList.contains('sb-on'));await pin('#board');await p.waitForTimeout(150);
   // (under 冰箱贴 the board's gutter is over the door's picture, which has no plain ground to measure against)
   if(skin==='quiet')capsule(await columns(p,await strip(p,'#board')),`${label} board, scrolling`);
   await pin(null);
   // near the detail's edge the capsule is shown, away from it hidden again
   const edge=await p.evaluate(()=>{const r=$('#detail').getBoundingClientRect();return {x:r.right-6,y:r.top+r.height/2,far:r.left+60};});
   await p.mouse.move(edge.far,edge.y);await p.waitForTimeout(1200);check(!await on(p,'#detail'),`${label}: the detail's capsule is not shown with the pointer far from its edge`);
   await p.mouse.move(edge.x-14,edge.y);await p.mouse.move(edge.x,edge.y);await p.waitForFunction(()=>$('#detail').classList.contains('sb-on'));
   await p.mouse.move(edge.far,edge.y);await p.waitForFunction(()=>!$('#detail').classList.contains('sb-on'),null,{timeout:3000});
   // a board with nothing to scroll keeps its bar, with no capsule in it
   await p.evaluate(()=>setView('google'));await p.waitForTimeout(300);
   check(await p.evaluate(()=>$('#board').scrollHeight<=$('#board').clientHeight),`${label}: the google view does not scroll`);
   check(await gutter(p,'#board')===10,`${label}: a board with nothing to scroll keeps the 10px gutter ${await gutter(p,'#board')}`);
   if(skin==='quiet')clear(await columns(p,await strip(p,'#board')),`${label} board with nothing to scroll`);
   // a dialog's scroller keeps its gutter, and the dialog's text its padding
   await p.evaluate(()=>{closeDetail();prefsDialog();});await p.waitForSelector('#modal[open]');
   check(await gutter(p,'#modal-content')===10,`${label}: the dialog has a 10px gutter ${await gutter(p,'#modal-content')}`);
   check(errors.length===0,`${label}: page errors ${errors.join(' | ')}`);
   await context.close();
  }

  // the capsule can be dragged: the detail scrolls with it
  {const {p,context}=await open();
   const s=await strip(p,'#detail'),before=await p.evaluate(()=>$('#detail').scrollTop);
   const x=s.x+s.width/2,y=s.y+12;await p.mouse.move(x-12,y);await p.mouse.move(x,y);await p.waitForFunction(()=>$('#detail').classList.contains('sb-on'));
   await p.mouse.down();await p.mouse.move(x,y+60,{steps:6});await p.mouse.up();
   const after=await p.evaluate(()=>$('#detail').scrollTop);
   check(after>before+40,`dragging the capsule scrolls the detail ${before} → ${after}`);
   // the fade runs on --sb-a
   // read in the scroll event itself (after the page's own listener, which captures it): a slow machine may draw the next frame
   // after the 80 ms fade is over
   const fading=()=>p.evaluate(()=>new Promise(done=>{const b=$('#board');b.addEventListener('scroll',()=>done({on:b.classList.contains('sb-on'),fade:b.getAnimations().some(a=>a.effect?.getKeyframes?.().some(k=>'--sb-a' in k))}),{once:true});b.scrollTop+=60;}));
   const fade=await fading();check(fade.on&&fade.fade,`the capsule fades in (an animation of --sb-a) ${JSON.stringify(fade)}`);
   await context.close();}
  // less motion: shown and hidden at once
  {const {p,context}=await open({motion:'reduce'});
   const fade=await p.evaluate(()=>new Promise(done=>{const b=$('#board');b.addEventListener('scroll',()=>done({on:b.classList.contains('sb-on'),fade:b.getAnimations().some(a=>a.effect?.getKeyframes?.().some(k=>'--sb-a' in k))}),{once:true});b.scrollTop+=60;}));
   check(fade.on&&!fade.fade,`less motion: the capsule is shown without a fade ${JSON.stringify(fade)}`);
   await context.close();}
  // less transparency: a solid capsule; more contrast: shown at rest
  {const solid=async media=>{const {p,context}=await open({media});const r=await p.evaluate(()=>{const n=document.createElement('i');n.style.background='var(--sb-thumb)';document.body.append(n);const c=getComputedStyle(n).backgroundColor;n.remove();return {c,rest:getComputedStyle(document.documentElement).getPropertyValue('--sb-rest').trim(),reduce:matchMedia('(prefers-reduced-transparency: reduce)').matches};});await context.close();return r;};
   const plain=await solid([]),reduce=await solid([{name:'prefers-reduced-transparency',value:'reduce'}]),more=await solid([{name:'prefers-contrast',value:'more'}]);
   // the alpha of rgb()/rgba()/color(srgb … / a): 1 when it has none
   const alpha=c=>{const m=c.match(/\/\s*([\d.]+)\)$/)||c.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);return m?Number(m[1]):1;};
   check(alpha(reduce.c)===1,`less transparency: the capsule is solid ${reduce.c}`);
   // GitHub's hosted Macs ask for less transparency themselves
   check(plain.reduce?alpha(plain.c)===1:alpha(plain.c)<1,`the capsule is the ink, a little clear unless the machine asks for less transparency ${JSON.stringify(plain)}`);
   check(Number(more.rest)===1,`more contrast: the capsule is shown at rest ${more.rest}`);}
 }finally{await own.close();}
}
