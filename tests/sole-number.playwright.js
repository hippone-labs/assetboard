// Run with the browser tool's filename option. A number that is some account's only one (research M2, G3): its detail names those
// accounts and what signs in through them; the account's detail counts its numbers and, when the only one is at risk, says it in red.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 const seen=await page.evaluate(()=>{save=()=>{};
  const soon=isoDay(localDay(new Date())+5);
  state={blocks:[{id:'phone'},{id:'google'},{id:'appleid'},{id:'ai'}],deletedExternalIds:[],assets:[
   {id:'uk',type:'phone',name:'英国号',phone:'+44 7700 900123',region:'GB',date:soon,dateKind:'keep',links:['g','b']},
   {id:'hk',type:'phone',name:'香港号',phone:'+852 5550 0000',region:'HK',links:['b']},
   {id:'g',type:'google',name:'Google 主号',account:'me@example.com',links:['uk','gpt']},
   {id:'b',type:'appleid',name:'港区主号',account:'hk@example.com',links:['uk','hk']},
   {id:'gpt',type:'ai',name:'ChatGPT Plus',links:['g']}]};render();
  const facts=id=>{showDetail(id);return {facts:$('#detail-content').textContent,risks:[...document.querySelectorAll('#detail-content .link-risk')].map(p=>[p.className,p.textContent])};};
  return {uk:facts('uk'),hk:facts('hk'),g:facts('g'),b:facts('b')};
 });
 check(seen.uk.risks.some(([,t])=>t.includes('它是 1 个账号唯一的验证号码：Google 主号。号码丢了，这些账号和经它们登录的 1 项（ChatGPT Plus）都可能登不进去；另外 1 个账号还有别的验证号码')),'The number names who it locks out: '+JSON.stringify(seen.uk.risks));
 check(!seen.hk.risks.some(([,t])=>t.includes('唯一')),'A backup number locks nobody out: '+JSON.stringify(seen.hk.risks));
 check(seen.g.facts.includes('验证号码1 个（唯一）')&&seen.b.facts.includes('验证号码2 个'),'Accounts count their numbers');
 const gRisk=seen.g.risks.find(([,t])=>t.includes('验证手机号'));
 check(gRisk&&gRisk[0].includes('overdue')&&gRisk[1].includes('这是唯一的验证号码'),'The only number at risk is red: '+JSON.stringify(seen.g.risks));
 const bRisk=seen.b.risks.find(([,t])=>t.includes('验证手机号'));
 check(bRisk&&!bRisk[0].includes('overdue')&&!bRisk[1].includes('唯一'),'With a backup it stays a warning: '+JSON.stringify(seen.b.risks));
 return 'PASS';
}
