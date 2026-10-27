// Run with the browser tool's filename option. A card's 状态 (research #1, C3): set in the form, it shows on the card's row and in its
// detail, and every record the card pays for hears about it, whatever the expiry date says. Back to 正常 clears all of that.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 await page.evaluate(()=>{save=()=>{};
  state={blocks:[{id:'bankcard',width:50},{id:'ai',width:50}],deletedExternalIds:[],assets:[
   {id:'card',type:'bankcard',name:'虚拟卡',provider:'Example Card',last4:'4821',network:'Visa',date:'2030-12-31',dateKind:'expire',links:['gpt']},
   {id:'gpt',type:'ai',name:'ChatGPT Plus',provider:'ChatGPT',date:'2030-01-01',dateKind:'renew',cycle:'monthly',links:['card']}]};render();});
 // The form offers the states, 正常 first and chosen.
 await page.evaluate(()=>assetForm('bankcard','card'));
 const chips=await page.$$eval('[data-choice="cardStatus"]',list=>list.map(b=>[b.textContent,b.getAttribute('aria-checked')]));
 check(JSON.stringify(chips)===JSON.stringify([['正常','true'],['已停用或挂失','false'],['扣款被拒','false'],['发卡方停业','false']]),'Status chips: '+JSON.stringify(chips));
 await page.click('[data-choice="cardStatus"][data-value="closed"]');
 await page.click('#asset-form button[type="submit"]');
 const after=await page.evaluate(()=>{
  const card=state.assets.find(a=>a.id==='card');
  const row=document.querySelector('[data-id="card"] .r-date, [data-id="card"]')?.textContent||'';
  showDetail('card');const cardDetail=$('#detail-content').textContent;
  showDetail('gpt');const gptRisk=[...document.querySelectorAll('#detail-content .link-risk')].map(p=>p.textContent);
  return {status:card.cardStatus,row,cardDetail,gptRisk,agent:agentAsset(state.assets.find(a=>a.id==='gpt')).risks||[]};
 });
 check(after.status==='closed','Saved status: '+after.status);
 check(after.row.includes('发卡方停业'),'The card row names the status: '+after.row);
 check(after.cardDetail.includes('状态发卡方停业'),'The card detail lists 状态');
 check(after.cardDetail.includes('发卡方停业，它支付的 1 项自动续费可能失败'),'The card detail heads its links with the impact: '+after.cardDetail);
 check(after.gptRisk.some(t=>t.includes('付款卡 •••• 4821 发卡方停业')),'The subscription hears about its card: '+after.gptRisk);
 check(after.agent.some(t=>t.includes('发卡方停业')),'Agents see the risk too: '+after.agent);
 // Back to 正常.
 await page.evaluate(()=>assetForm('bankcard','card'));
 await page.click('[data-choice="cardStatus"][data-value=""]');
 await page.click('#asset-form button[type="submit"]');
 const back=await page.evaluate(()=>{showDetail('gpt');return {status:state.assets.find(a=>a.id==='card').cardStatus,risk:$('#detail-content .link-risk')?.textContent||''};});
 check(back.status===''&&!back.risk.includes('发卡方停业'),'正常 clears the risk: '+JSON.stringify(back));
 return 'PASS';
}
