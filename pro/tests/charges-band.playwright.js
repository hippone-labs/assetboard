// Run with the browser tool's filename option. 待确认扣款 is Pro (pro/web/money-pro.js fills proSlots.chargesBand): a monthly charge
// that came due shows as a band in 即将到来, in the detail's payment section, and in the menu bar summary. Uses an isolated page and never saves.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const p=await page.context().newPage();
 try {
  await p.goto('http://127.0.0.1:4317/');
  const seen=await p.evaluate(()=>{
   save=()=>{};
   state={...state,assets:[{id:'u1',type:'subscription',name:'Notes Pro',provider:'Notes',account:'',purpose:'',date:isoDay(localDay()-5),dateKind:'renew',cycle:'monthly',cost:'$8 / 月',art:'generic',source:'manual',createdAt:'2025-01-01T00:00:00Z'}],paymentsSince:isoDay(localDay()-40)};
   setView('upcoming');render();
   return {asked:pendingChargesAsked(state.assets).length,band:!!document.querySelector('#board [data-group="charges"]'),
    rows:document.querySelectorAll('#board [data-group="charges"] [data-action="charge-paid"]').length,detail:paymentsSection(state.assets[0]).includes('charge-paid')};
  });
  check(seen.asked===1&&seen.band&&seen.rows===1,'即将到来 shows 待确认扣款: '+JSON.stringify(seen));
  check(seen.detail,'the detail asks about the charge');
  const agent=await p.evaluate(()=>({list:assetboardAgent({requestId:'t',method:'charges',params:{}}).result?.charges,asset:agentAsset(state.assets[0])}));
  check(agent.list?.length===1&&agent.asset.unconfirmedCharges?.length===1,'the agent interface reports the charge: '+JSON.stringify(agent));
  return 'ok';
 } finally { await p.close(); }
}
