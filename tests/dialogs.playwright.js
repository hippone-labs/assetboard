// Run with the browser tool's filename option. Dialog layout: capped height, a fixed head, a body that scrolls on its own, pinned actions.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1100,height:600}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof assetForm==='function');
  await p.evaluate(()=>{localStorage.clear();state={blocks:[],assets:[{id:'s',type:'server',name:'box',provider:'Vultr',source:'manual',art:'generic',notes:'x'}],deletedExternalIds:[]};save=()=>{};render();assetForm('server','s');});
  const box=sel=>p.locator(sel).boundingBox();
  const dialog=await box('#modal');
  check(dialog.y>=16&&dialog.y+dialog.height<=600-16,'The dialog fits the window: '+JSON.stringify(dialog));
  const scroller=await p.evaluate(()=>{const c=$('#modal-content');return {overflow:c.scrollHeight>c.clientHeight,style:getComputedStyle(c).overflowY};});
  check(scroller.overflow&&scroller.style==='auto','A long form scrolls inside the body');
  const submit=await box('#asset-form [type="submit"]');
  check(submit.y+submit.height<=dialog.y+dialog.height,'The save button is in view without scrolling');
  check(await p.evaluate(()=>$('#modal').hasAttribute('data-more')),'A rule marks that more lies below the actions');
  check(await p.evaluate(()=>document.activeElement!==$('#close-modal')),'Opening does not put focus on the close button');
  await p.evaluate(()=>{const c=$('#modal-content');c.scrollTop=c.scrollHeight;c.dispatchEvent(new Event('scroll'));});
  const title=await box('#modal-title');
  check(title.y>=dialog.y&&await p.evaluate(()=>$('#modal').hasAttribute('data-scrolled')),'The title stays at the top while the body scrolls');
  check((await box('#asset-form [type="submit"]')).y+submit.height<=dialog.y+dialog.height,'The save button stays in view at the end');

  // Actions followed by more content (添加资产) stay in the flow and do not cover what comes after them.
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();captureDialog();});
  const actions=await box('#capture .confirm-actions'),more=await box('#capture .capture-links');
  check(more.y>=actions.y+actions.height,`The import link sits below the buttons: ${JSON.stringify({actions,more})}`);

  // Widths follow the content: a confirmation is narrow, the 待确认 list wide.
  await p.evaluate(()=>{assetFormSnapshot=null;$('#modal').close();confirmDialog('删除？','可以撤销。','删除',true);});
  const narrow=(await box('#modal')).width;
  await p.evaluate(()=>{$('#modal').close();inboxDialog(false);});
  const wide=(await box('#modal')).width;
  check(narrow<480&&wide>600,`Confirm ${narrow}px, list ${wide}px`);

  // Re-rendering the same list keeps its scroll position.
  await p.evaluate(()=>{$('#modal').close();intake=Array.from({length:30},(_,i)=>({id:'i'+i,source:'window',name:`f${i}.csv`,text:'a',mime:''}));inboxDialog(false);$('#modal-content').scrollTop=300;inboxDialog(false);});
  check(await p.evaluate(()=>$('#modal-content').scrollTop)===300,'A refreshed list keeps its place');
  await p.evaluate(()=>{intake=[];$('#modal').close();});
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: dialog fits the window, body scrolls, head and actions stay, focus starts in the body, widths by content, list keeps its scroll';
}
