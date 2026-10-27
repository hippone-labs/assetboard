// The window's shell: a top bar across the window, the sidebar under it on the background, and one raised card holding the toolbar,
// the board (which scrolls, not the page), the docked detail and the panorama. Checks the geometry at three widths, the toolbar giving
// way inside the card, the detail's date on one line, and the Mac app's part: room for the traffic lights (given back in full screen)
// and the bar's controls reported so the rest of the bar can move the window, and the backdrop (see-through over the native glass,
// solid in the browser). On CI (full edition) it also saves review screenshots into the logs artifact (shots/).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const browser=page.context().browser();
 const pro=await page.evaluate(()=>proLoaded());
 const dir=process.env.RUNNER_TEMP&&pro?require('path').join(process.env.RUNNER_TEMP,'logs','shots'):'';
 if(dir)require('fs').mkdirSync(dir,{recursive:true});
 const shot=async(p,name)=>{if(dir)await p.screenshot({path:require('path').join(dir,name)});};
 const rect=(p,sel)=>p.evaluate(sel=>{const r=document.querySelector(sel)?.getBoundingClientRect();return r&&{left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)};},sel);
 const open=async(width,height,{native=false,query='?demo',scheme='light'}={})=>{
  const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',colorScheme:scheme}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(native)await p.addInitScript(()=>{window.__chrome=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m.action==='windowChrome')window.__chrome.push(m);if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
   window.__ASSETBOARD_NATIVE__={demo:true,data:null,cloudflareConnected:false,githubConnected:false,gmailConfigured:false};});
  await p.goto('http://127.0.0.1:4317/'+(native?'':query));await p.waitForTimeout(700);
  // The same server every time: tokyo-vps, selected so the detail is open.
  await p.evaluate(()=>showDetail('demo-s1'));await p.waitForTimeout(250);
  return {context,p,errors};
 };
 const done=async({context,errors})=>{await context.close();check(!errors.length,'page errors: '+errors.join(' | '));};

 // 1440 × 900: the card 10 px in on three sides, under the 40 px top bar; the detail docked inside it, under its toolbar.
 let s=await open(1440,900);
 const top=await rect(s.p,'#topnav'),main=await rect(s.p,'#main'),bar=await rect(s.p,'#topbar'),detail=await rect(s.p,'#detail'),side=await rect(s.p,'#sidebar');
 check(top.top===0&&top.height===40&&top.width===1440,'The top bar spans the window: '+JSON.stringify(top));
 check(main.left===228&&main.top===40&&main.right===1430&&main.bottom===890,'The card: '+JSON.stringify(main));
 check(side.top===40&&await s.p.evaluate(()=>/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle($('#sidebar')).backgroundColor)),'The sidebar sits under the top bar with no fill: '+JSON.stringify(side));
 check(detail.right===1430&&detail.bottom===890&&detail.width===380&&Math.abs(detail.top-bar.bottom)<=1,'The detail docks in the card under its toolbar: '+JSON.stringify({detail,bar}));
 check(await s.p.evaluate(()=>{const g=document.querySelector('#board .group').getBoundingClientRect();return g.right<=document.querySelector('#detail').getBoundingClientRect().left+1;}),'The board makes room for the detail');
 check(await s.p.evaluate(()=>boardScroller()===$('#board')&&document.scrollingElement.scrollHeight<=innerHeight+1),'The board scrolls, the page does not');
 check(await s.p.evaluate(()=>!!$('#topnav #search')&&!!$('#topnav #inbox-button')&&!!$('#topnav #theme')&&!!$('#topbar #add-block')&&!!$('#topbar #panorama-button')),'Window tools in the top bar, view tools in the card');
 // The detail's next date stays on one line.
 const when=await s.p.evaluate(()=>{const n=document.querySelector('#detail-content .fact-date span:last-child');return n&&{h:Math.round(n.getBoundingClientRect().height),text:n.textContent};});
 check(when&&when.h<=20,'The next date wraps: '+JSON.stringify(when));
 await shot(s.p,'shell-expanded.png');
 await s.p.keyboard.press('Meta+Backslash');await s.p.waitForTimeout(250);
 check((await rect(s.p,'#main')).left===56,'⌘\\ folds the sidebar and the card follows');
 await shot(s.p,'shell-collapsed.png');
 await s.p.evaluate(()=>{closeDetail();panoramaOpen(true);});await s.p.waitForTimeout(300);
 const pano=await rect(s.p,'#panorama');
 check(pano.left===56&&pano.top===40&&pano.right===1430&&pano.bottom===890,'The panorama takes the card\'s place: '+JSON.stringify(pano));
 await shot(s.p,'shell-panorama.png');
 await done(s);

 // 1024 × 700, sidebar expanded: a 6 px margin, a 320 px detail, and the due flags keep their numbers.
 s=await open(1024,700);
 const nm=await rect(s.p,'#main'),nd=await rect(s.p,'#detail');
 check(nm.right===1018&&nm.bottom===694&&nd.width===320,'Narrow margins: '+JSON.stringify({nm,nd}));
 const head=await s.p.evaluate(()=>{const bar=$('#topbar'),last=[...bar.querySelectorAll('button')].filter(b=>b.getClientRects().length).at(-1).getBoundingClientRect();
  return {flags:[...document.querySelectorAll('#view-meta .meta-flag')].filter(n=>n.getClientRects().length).map(n=>n.textContent),title:Math.round($('#view-title').getBoundingClientRect().width),spill:Math.round(last.right-bar.getBoundingClientRect().right)};});
 check(head.flags.length===2&&head.title>40&&head.spill<=0,'The narrow toolbar keeps the due flags: '+JSON.stringify(head));
 const nw=await s.p.evaluate(()=>{const n=document.querySelector('#detail-content .fact-date span:last-child');return n&&Math.round(n.getBoundingClientRect().height);});
 check(nw<=20,'The next date wraps in a narrow detail: '+nw);
 await shot(s.p,'shell-narrow.png');
 await done(s);

 // The Mac app: room for the traffic lights at the left of the top bar, given back in full screen; the bar's controls reported.
 s=await open(1440,900,{native:true});
 const pad=()=>s.p.evaluate(()=>parseFloat(getComputedStyle($('#topnav')).paddingLeft));
 check(await pad()===80,'Room for the traffic lights: '+await pad());
 const chrome=await s.p.evaluate(()=>window.__chrome.at(-1));
 check(chrome&&chrome.height===40&&chrome.holes.length>=4&&chrome.holes.every(h=>h.length===4&&h[1]>=0&&h[1]+h[3]<=40),'The bar reports its height and controls: '+JSON.stringify(chrome));
 await shot(s.p,'shell-native.png');
 await s.p.evaluate(()=>assetboardWindowState({fullScreen:true}));
 check(await pad()===12,'Full screen gives the room back: '+await pad());
 await done(s);

 // The backdrop. In the Mac app the page only veils the native glass, so whatever lies behind the page (here a red stand-in for
 // the desktop under the glass) shows through the top bar and around the card, in light and dark; the card stays solid. In the
 // browser the page is its own solid backdrop. One pixel each, read back from a screenshot.
 const pixel=async(p,x,y)=>{const png=(await p.screenshot({clip:{x,y,width:3,height:3}})).toString('base64');
  return p.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
   const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(1,1,1,1).data;return [d[0],d[1],d[2]];},png);};
 const behind=(p,paint)=>p.evaluate(paint=>{document.documentElement.style.background=paint;},paint);
 for(const scheme of ['light','dark']){
  for(const native of [true,false]){
   s=await open(1440,900,{native,scheme});
   await s.p.evaluate(()=>closeDetail());
   await behind(s.p,'rgb(255,0,0)');await s.p.waitForTimeout(100);
   const m=await rect(s.p,'#main'),bar=await pixel(s.p,300,20),card=await pixel(s.p,m.left+4,m.bottom-20),red=([r,g])=>r-g;
   if(native)check(red(bar)>60&&red(card)<30,`${scheme}: the glass shows through the top bar, the card stays solid: `+JSON.stringify({bar,card}));
   else check(red(bar)<30&&red(card)<30,`${scheme}: the browser page is solid: `+JSON.stringify({bar,card}));
   if(dir){
    // A stand-in wallpaper (the real app also blurs it) to judge the look.
    await behind(s.p,native?'linear-gradient(135deg,#2f6db0,#b8558f 48%,#e3a043)':'');
    await s.p.evaluate(()=>showDetail('demo-s1'));await s.p.waitForTimeout(250);
    await shot(s.p,`backdrop-${native?'native':'browser'}-${scheme}.png`);
   }
   await done(s);
  }
 }

 // Review screenshots of every theme (task 08), light and dark, over the stand-in wallpaper as in the Mac app; and the dialog.
 if(dir){
  for(const scheme of ['light','dark']){
   s=await open(1280,800,{native:true,scheme});
   await behind(s.p,'linear-gradient(135deg,#2f6db0,#b8558f 48%,#e3a043)');
   for(const id of await s.p.evaluate(()=>themePresets.map(t=>t[0]))){
    await s.p.evaluate(id=>{themePref={id};applyBoardTheme();},id);await s.p.waitForTimeout(80);
    await shot(s.p,`theme-${id}-${scheme}.png`);
   }
   await s.p.evaluate(()=>{closeDetail();themeDialog();});await s.p.waitForTimeout(250);
   await shot(s.p,`theme-dialog-${scheme}.png`);
   await done(s);
  }
 }
 return 'ok';
}
