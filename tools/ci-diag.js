// TEMPORARY diagnostics for the hosted macOS browser tests (removed before merge).
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),port=4331,base=`http://127.0.0.1:${port}`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/\/$/,'/index.html'));
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
server.listen(port,'127.0.0.1',async()=>{
 const browser=await chromium.launch();
 console.log('browser',browser.version());
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>{localStorage.setItem('assetboard-lang-v1','zh');});
 const p=await ctx.newPage();
 await p.goto(base+'/?demo');await p.waitForTimeout(800);
 console.log('env',JSON.stringify(await p.evaluate(()=>{
  const mq=q=>matchMedia(q).matches;
  const s=document.createElement('div');s.style.cssText='position:absolute;top:0;width:100px;height:100px;overflow:scroll';document.body.append(s);const sb=s.offsetWidth-s.clientWidth;s.remove();
  let gl='';try{const c=document.createElement('canvas').getContext('webgl');const e=c.getExtension('WEBGL_debug_renderer_info');gl=e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):c.getParameter(c.RENDERER);}catch(e){gl='err '+e.message;}
  return {ua:navigator.userAgent,inner:[innerWidth,innerHeight],client:[document.documentElement.clientWidth],dpr:devicePixelRatio,scrollbar:sb,
   reducedTransparency:mq('(prefers-reduced-transparency: reduce)'),reducedMotion:mq('(prefers-reduced-motion: reduce)'),contrast:mq('(prefers-contrast: more)'),forced:mq('(forced-colors: active)'),dark:mq('(prefers-color-scheme: dark)'),
   supports:CSS.supports('backdrop-filter','blur(1px)'),supportsWebkit:CSS.supports('-webkit-backdrop-filter','blur(1px)'),gl,fonts:getComputedStyle(document.body).fontFamily};})));
 // the card's glass
 await p.evaluate(()=>{if(!$('#detail').hidden)closeDetail();});await p.waitForTimeout(800);
 await p.evaluate(()=>document.querySelector('#board [data-asset] .item-open').click());await p.waitForTimeout(800);
 console.log('detail',JSON.stringify(await p.evaluate(()=>{const d=getComputedStyle($('#detail'));return {bf:d.backdropFilter,wbf:d.webkitBackdropFilter,var:getComputedStyle(document.documentElement).getPropertyValue('--detail-blur'),bg:d.backgroundColor,img:d.backgroundImage.slice(0,60)};})));
 const cdp=await ctx.newCDPSession(p);
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'no-preference'}]});
 console.log('detail (no-preference emulated)',JSON.stringify(await p.evaluate(()=>{const d=getComputedStyle($('#detail'));return {rt:matchMedia('(prefers-reduced-transparency: reduce)').matches,bf:d.backdropFilter};})));
 await p.evaluate(()=>closeDetail());await p.waitForTimeout(900);
 // the room's slide: when roomDone runs, how far the animations are
 for(let run=0;run<3;run++){
  const r=await p.evaluate(async()=>{
   const t0=performance.now(),log=[];const orig=window.roomDone;
   const wall=document.querySelector('#board .wall'),panels=[...wall.children].filter(n=>n.dataset.group);
   let frames=[];
   const watch=new Promise(done=>{const f=()=>{const a=panels.flatMap(n=>n.getAnimations());if(a.length)log.push([Math.round(performance.now()-t0),a.map(x=>Math.round(x.currentTime??-1))[0],a[0].playState,Math.round(a[0].startTime??-1)]);frames.push(Math.round(performance.now()-t0));if(performance.now()-t0<1100)requestAnimationFrame(f);else done();};f();});
   document.querySelector('#board [data-asset] .item-open').click();
   await watch;
   const gaps=frames.slice(1).map((t,i)=>t-frames[i]);
   return {log,frames:frames.length,maxGap:Math.max(...gaps),meanGap:Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length)};
  });
  console.log('room open',JSON.stringify(r));
  await p.evaluate(()=>closeDetail());await p.waitForTimeout(900);
 }
 // the narrow strip
 const c2=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});await c2.addInitScript(()=>{localStorage.setItem('assetboard-lang-v1','zh');});
 const q=await c2.newPage();await q.goto(base+'/?demo');await q.waitForTimeout(800);
 await q.setViewportSize({width:390,height:800});await q.waitForTimeout(300);
 console.log('narrow',JSON.stringify(await q.evaluate(()=>{const over=[...document.querySelectorAll('body *')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().right>390.5).slice(0,15).map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return `${n.tagName}#${n.id}.${String(n.className).slice(0,40)} l=${r.left|0} r=${r.right|0} w=${r.width|0} pos=${s.position} ws=${s.whiteSpace}`;});
  return {inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,toggle:getComputedStyle($('#sidebar-toggle')).display,over};})));
 await browser.close();server.close();
});
