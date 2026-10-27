// Run with the browser tool's filename option. Fakes the Mac host: with five records the oldest of which is 40 days old and no export
// yet, 即将到来 says the list lives on this Mac only; its button asks the host for 导出资产备份; once the host reports an export the
// note goes, and it comes back when that export is a month old. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const host=()=>{
  const ago=n=>new Date(Date.now()-n*86400000).toISOString(),day=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.toISOString().slice(0,10);};
  window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
  try{localStorage.removeItem('assetboard-exported-at');}catch{}
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'subscription'}],assets:[1,2,3,4,5].map(n=>({id:'s'+n,type:'subscription',name:'Tool '+n,provider:'Example',date:day(5+n),dateKind:'renew',cycle:'monthly',source:'manual',createdAt:ago(n===1?40:3)}))}};
 };
 const p=await page.context().newPage();
 try {
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>setView('upcoming'));
  check(/还没导出过备份/.test(await p.evaluate(()=>document.querySelector('#board .export-note')?.textContent||'')),'The note shows with no export and a 40-day-old record');
  await p.click('#board .export-note [data-action="export-board"]');
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='exportBoard')),'Its button asks the host to export');
  await p.evaluate(()=>window.assetboardExported());
  check(await p.evaluate(()=>!document.querySelector('#board .export-note')),'An export makes it go');
  check(await p.evaluate(()=>/上次导出备份是 31 天前/.test(exportNoteHtml(Date.now()+31*86400000))),'and it comes back after a month');
  await p.evaluate(()=>localStorage.removeItem('assetboard-exported-at'));
 } finally { await p.close(); }
 return 'PASS';
}
