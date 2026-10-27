// Run with the browser tool's filename option. A notice (something the person tried did not happen, like a PNG opened in the demo)
// is louder than a toast: on amber with a mark, announced at once, ten seconds instead of three, held while the pointer is on it,
// and closed with its own button. A plain toast afterwards is plain again.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:800},locale:'zh-CN'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
   window.__ASSETBOARD_NATIVE__={demo:true,data:null,cloudflareConnected:false,githubConnected:false,gmailConfigured:false};});
  await p.goto('http://127.0.0.1:4317/');await p.waitForTimeout(600);
  const state=()=>p.evaluate(()=>{const t=$('#toast'),cs=getComputedStyle(t);return {show:t.classList.contains('show'),notice:t.classList.contains('notice'),role:t.getAttribute('role'),
   text:t.textContent,close:!!t.querySelector('.toast-close[aria-label]'),mark:!!t.querySelector('svg'),bg:cs.backgroundColor,size:parseFloat(cs.fontSize)};});
  // The demo gets a PNG from the Dock: the app hands the page the file's name and why it was not read.
  await p.evaluate(()=>assetboardIntake([{source:'open',name:'screen.png',error:'演示模式不识别截图和 PDF'}]));
  await p.waitForTimeout(400); // the toast's colours and size ease in (styles.css: transition .2s)
  let n=await state();
  check(n.show&&n.notice&&n.role==='alert'&&n.text.includes('screen.png：演示模式不识别截图和 PDF')&&n.close&&n.mark&&n.size>=13,'A loud notice: '+JSON.stringify(n));
  const noticeBg=n.bg;
  await p.waitForTimeout(4000);
  check((await state()).show,'Still there after four seconds (a toast is gone after three)');
  // Held while hovered, then gone a little after the pointer leaves.
  await p.hover('#toast span');await p.waitForTimeout(7000);
  check((await state()).show,'Held while the pointer is on it');
  await p.mouse.move(640,300);await p.waitForTimeout(4600);
  check(!(await state()).show,'Gone after the pointer leaves');
  // Its own close button.
  await p.evaluate(()=>assetboardIntake([{source:'open',name:'scan.pdf',error:'演示模式不识别截图和 PDF'}]));
  await p.click('#toast .toast-close');
  check(!(await state()).show,'Closed with its button');
  // A plain toast afterwards is plain again.
  await p.evaluate(()=>toast('已复制'));
  await p.waitForTimeout(400);
  n=await state();
  check(n.show&&!n.notice&&n.role==='status'&&!n.close&&n.bg!==noticeBg,'A plain toast is plain: '+JSON.stringify(n));
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS';
}
