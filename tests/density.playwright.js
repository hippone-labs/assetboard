// Run with the browser tool's filename option. What the list and the detail leave out and add (2026-10-23): no 来源 for records typed
// in by hand, no detail row that repeats the subtitle, no 已续费 or 记一笔付款 where it means nothing (a number's keep-alive is 已保号),
// 支付 / 验证 N 项 on card and number rows in their own category, the monthly share of a yearly cost in the cost's tip, 已停用 in the
// detail, and the fields the form takes but the detail used to skip (SSH, 本机目录, a card's or number's cost).
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 const seen=await page.evaluate(()=>{save=()=>{};
  state={blocks:[{id:'bankcard'},{id:'phone'},{id:'server'},{id:'repository'},{id:'ai'},{id:'domain'}],deletedExternalIds:[],assets:[
   {id:'card',type:'bankcard',name:'Visa 卡',provider:'示例银行',last4:'4242',network:'Visa',cost:'¥10 / 年',date:'2030-03-31',dateKind:'expire',source:'manual',links:['gpt']},
   {id:'num',type:'phone',name:'英国号',phone:'+44 7700 900123',date:'2030-01-01',dateKind:'keep',cycle:'halfyearly',cost:'£10 / 年',source:'manual',links:['gpt']},
   {id:'box',type:'server',name:'box',provider:'Vultr',account:'team',host:'box.example.net',sshUser:'deploy',sshPort:'2222',source:'manual'},
   {id:'repo',type:'repository',name:'me/app',provider:'GitHub',account:'me',localPath:'~/code/app',source:'csv',importedFrom:'表格'},
   {id:'gpt',type:'ai',name:'ChatGPT Plus',provider:'ChatGPT',cost:'$20/月',date:'2030-01-01',dateKind:'renew',cycle:'monthly',links:['card','num']},
   {id:'dom',type:'domain',name:'old.example',provider:'Namecheap',cost:'$12 / 年',date:'2030-05-01',dateKind:'expire',cycle:'yearly',stopped:true,source:'manual'}]};render();
  const look=id=>{showDetail(id);const facts=[...document.querySelectorAll('#detail-content .fact span:first-child')].map(n=>n.textContent);
   const values=Object.fromEntries([...document.querySelectorAll('#detail-content .fact')].map(f=>[f.firstElementChild.textContent,f.lastElementChild.textContent]));
   return {facts,values,renew:$('#detail-content [data-action="renew"]')?.textContent||'',eyebrow:$('#detail-content .eyebrow').textContent,menu:assetMenuItems(state.assets.find(a=>a.id===id)).map(i=>i.action)};};
  const out={card:look('card'),num:look('num'),box:look('box'),repo:look('repo'),gpt:look('gpt'),dom:look('dom')};
  setView?.('bankcard');out.cardRow=document.querySelector('#board [data-asset="card"] .r-sub')?.textContent||'';
  out.domHint=costHint(state.assets.find(a=>a.id==='dom'));
  return out;
 });
 check(!seen.card.facts.includes('来源')&&!seen.box.facts.includes('来源'),'A record typed in by hand has no 来源 row');
 check(seen.repo.values['来源']==='表格 导入','An imported one still names its source: '+JSON.stringify(seen.repo.values));
 check(!seen.card.facts.includes('卡号')&&!seen.card.facts.includes('卡组织'),'The card detail does not repeat the subtitle: '+seen.card.facts);
 check(!seen.box.facts.includes('账号')&&!seen.repo.facts.includes('账号'),'Nor does a generic record repeat its account');
 check(!seen.gpt.facts.includes('服务'),'Nor an AI subscription its service');
 check(seen.card.renew===''&&!seen.card.menu.includes('renew')&&!seen.card.menu.includes('payment-add'),'A card is not renewed or paid: '+JSON.stringify(seen.card));
 check(seen.num.renew==='已保号'&&!seen.num.menu.includes('payment-add'),'A number has 已保号, no payment: '+JSON.stringify(seen.num));
 check(seen.card.values['费用']==='¥10 / 年'&&seen.num.values['费用']==='£10 / 年','Card and number show their cost');
 check(seen.box.values['SSH']==='deploy@box.example.net:2222','The server shows its SSH target: '+JSON.stringify(seen.box.values));
 check(seen.repo.values['本机目录']==='~/code/app','The repository shows its local directory');
 check(seen.dom.eyebrow.includes('已停用'),'A stopped record says so in the detail: '+seen.dom.eyebrow);
 check(/支付 1 项/.test(seen.cardRow),'A card row in its own category says what it pays for: '+seen.cardRow);
 check(/每月约 \$1\.00/.test(seen.domHint),'A yearly cost tips its monthly share: '+seen.domHint);
 return 'PASS';
}
