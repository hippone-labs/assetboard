// Run with the browser tool's filename option. The second per-type batch of 2026-10-24: a number cut off by its carrier is red and
// set from the form; a card can be marked as paying a number's fee from the link row, and the account that only has that number
// hears about the card; prepaid API credit names its expiry; a filed domain shows its number and the notes for giving it up.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const seen=await page.evaluate(()=>{save=()=>{};
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  state={blocks:[{id:'phone'},{id:'bankcard'},{id:'google'},{id:'server'},{id:'ai'},{id:'domain'}],deletedExternalIds:[],assets:[
   {id:'num',type:'phone',name:'英国号',provider:'giffgaff',phone:'+44 7700 900123',phoneStatus:'suspended',links:['g']},
   {id:'num2',type:'phone',name:'美国号',provider:'Ultra',phone:'+1 202 555 0100',links:['card','g2']},
   {id:'card',type:'bankcard',name:'虚拟卡',last4:'4242',cardStatus:'declined',links:['num2']},
   {id:'g',type:'google',name:'Google 主号',provider:'Google',links:['num']},
   {id:'g2',type:'google',name:'Google 备用',provider:'Google',links:['num2']},
   {id:'ecs',type:'server',name:'api',provider:'阿里云',source:'manual',date:day(5),dateKind:'expire'},
   {id:'api',type:'ai',name:'OpenAI API',provider:'OpenAI',cost:'$50'},
   {id:'dom',type:'domain',name:'example.cn',provider:'阿里云',icp:'京ICP备00000000号',links:['ecs']}]};
  state.assets.find(a=>a.id==='ecs').links=['dom'];
  recordPayment(state.assets.find(a=>a.id==='api'),{paidOn:day(-300),amount:50,currency:'USD'});render();
  const row=id=>document.querySelector(`#board [data-asset="${id}"]`);
  const facts=id=>{showDetail(id);return Object.fromEntries([...document.querySelectorAll('#detail-content .fact')].map(f=>[f.firstElementChild.textContent,f.lastElementChild.textContent]));};
  const risks=id=>{showDetail(id);return [...document.querySelectorAll('#detail .link-risk')].map(p=>p.textContent);};
  const out={numRow:row('num').textContent,numRed:!!row('num').querySelector('.overdue'),numFacts:facts('num'),numRisks:risks('num'),gRisks:risks('g'),
   ecsRow:row('ecs').textContent,ecsFacts:facts('ecs'),apiRow:row('api').textContent,apiFacts:facts('api'),domFacts:facts('dom')};
  // The 付月费 tag on the card's link row.
  showDetail('card');const tag=document.querySelector('#detail [data-action="link-pays"]');out.tagBefore=tag?.getAttribute('aria-pressed');tag?.click();
  out.paysMeta=state.assets.find(a=>a.id==='num2').linkMeta;out.cardRisks=risks('card');out.cardGroups=[...document.querySelectorAll('#detail .link-group-title')].map(t=>t.firstChild.textContent);
  out.g2Risks=risks('g2');
  undo();out.undone=state.assets.find(a=>a.id==='num2').linkMeta===undefined;
  return out;
 });
 check(seen.numRed&&/被运营商停用/.test(seen.numRow),'A cut-off number is red: '+seen.numRow);
 check(seen.numFacts['状态']==='被运营商停用','and says so in the detail: '+JSON.stringify(seen.numFacts));
 check(seen.numRisks.some(t=>/giffgaff 会停掉长期在境外使用的号码/.test(t)),'giffgaff note on an only number: '+seen.numRisks.join('|'));
 check(seen.gRisks.some(t=>/验证手机号 英国号 被运营商停用/.test(t)),'The account hears about it: '+seen.gRisks.join('|'));
 check(seen.tagBefore==='false'&&seen.paysMeta?.card?.pays===true,'The 付月费 tag marks the card as paying the number: '+JSON.stringify(seen.paysMeta));
 check(seen.cardGroups.includes('支付'),'The number moves to the card\'s 支付 group: '+seen.cardGroups.join());
 check(seen.cardRisks.some(t=>/它付月费的号码 美国号 是 1 个账号唯一的验证号码：Google 备用/.test(t)),'The card names the second hop: '+seen.cardRisks.join('|'));
 check(seen.g2Risks.some(t=>/付款卡 •••• 4242（付号码 美国号 的月费） 扣款被拒，月费扣不成号码会被取消/.test(t)),'The account hears about the card through its number: '+seen.g2Risks.join('|'));
 check(seen.undone,'The tag is undoable');
 check(/额度/.test(seen.apiRow)&&seen.apiFacts['额度过期'],'Prepaid credit names its expiry: '+seen.apiRow+' '+JSON.stringify(seen.apiFacts));
 check(seen.domFacts['备案']==='京ICP备00000000号','A filed domain shows its number: '+JSON.stringify(seen.domFacts));
 // Stopping the server names its filed domain; hiding the domain says to cancel the filing.
 const notes=await page.evaluate(()=>{const out={};toggleStopped('ecs');out.stop=document.querySelector('#toast').textContent;undo();
  const b=document.createElement('button');b.dataset.action='hide-asset';b.dataset.id='dom';document.body.append(b);b.click();b.remove();out.hide=document.querySelector('#toast').textContent;undo();return out;});
 check(/上面有 1 个已备案域名，取消接入前先在新服务商接入/.test(notes.stop),'Stopping the server: '+notes.stop);
 check(/它有备案，记得到接入商那里注销/.test(notes.hide),'Hiding the domain: '+notes.hide);
 // Form: the status chips for a number, saved with the record.
 await page.evaluate(()=>assetForm('phone','num2'));
 await page.click('#asset-form [data-choice="phoneStatus"][data-value="ported"]');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>state.assets.find(a=>a.id==='num2').phoneStatus)==='ported','The form saves the number\'s status');
 check(!errors.length,'Page errors: '+errors.join(' | '));
 return 'PASS';
}
