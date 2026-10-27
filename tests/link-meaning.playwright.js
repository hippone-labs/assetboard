// Run with the browser tool's filename option. What links mean: named groups in the detail and picker, payment and verification at risk, impact in 即将到来, delete and hide notes, and links through the agent interface.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof linkSection==='function');
  await p.evaluate(()=>{
   const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
   localStorage.clear();
   state={blocks:[],assets:[
    {id:'card',type:'bankcard',name:'Wise 借记卡',provider:'Wise',last4:'4821',date:day(10),dateKind:'expire',source:'manual',art:'generic'},
    {id:'phone',type:'phone',name:'giffgaff',provider:'giffgaff',phone:'+44 7700 900123',date:day(-2),dateKind:'keep',source:'manual',art:'generic'},
    {id:'apple',type:'appleid',name:'美区主号',provider:'Apple',account:'me@example.com',source:'manual',art:'generic'},
    {id:'sub',type:'subscription',name:'Vultr',provider:'Vultr',source:'manual',art:'generic'},
    {id:'vps',type:'server',name:'tokyo-vps',provider:'Vultr',source:'manual',art:'generic'},
    {id:'ai',type:'ai',name:'ChatGPT Plus',provider:'OpenAI',source:'manual',art:'generic'},
    {id:'repo',type:'repository',name:'me/app',provider:'GitHub',source:'manual',art:'generic'},
    {id:'dep',type:'deployment',name:'app.vercel.app',provider:'Vercel',source:'manual',art:'generic'}
   ],deletedExternalIds:[]};
   for(const [x,y] of [['card','sub'],['sub','vps'],['card','ai'],['phone','apple'],['apple','ai']])linkRelation(state.assets,x,y);
   save=()=>{};render();
  });

  // Groups are named by meaning, from each side.
  const titles=async id=>{await p.evaluate(id=>showDetail(id),id);return p.evaluate(()=>[...document.querySelectorAll('#detail .link-group-title')].map(t=>t.firstChild.textContent));};
  check((await titles('ai')).join()==='付款卡,登录账号','A subscription lists its card and login account: '+(await titles('ai')).join());
  check((await titles('card')).join()==='支付','The card says what it pays for');
  check((await titles('vps')).join()==='所属账号','A server keeps its account group');

  // Risks: the expiring card reaches what it pays for, and a server through its account; the lapsed number reaches its account, and
  // being that account's only number, what signs in with the account too (red, overdue first).
  await p.evaluate(()=>showDetail('ai'));
  const aiRisk=await p.locator('#detail .link-risk').allInnerTexts();
  check(aiRisk.length===2&&/验证手机号 giffgaff（登录账号 美区主号）.*账号登不进去它也用不了/.test(aiRisk[0])&&/付款卡 •••• 4821 .*自动续费可能失败/.test(aiRisk[1]),'The subscription warns about its card and its login account\'s only number: '+aiRisk.join('|'));
  await p.evaluate(()=>showDetail('vps'));
  check(/付款卡 •••• 4821（经 Vultr）/.test(await p.locator('#detail .link-risk').innerText()),'The server hears about its account\'s card');
  await p.evaluate(()=>showDetail('apple'));
  check(/验证手机号 giffgaff .*可能收不到验证码/.test(await p.locator('#detail .link-risk').innerText()),'The account warns about its lapsed number');
  await p.evaluate(()=>showDetail('card'));
  check(/它支付的 3 项自动续费可能失败/.test(await p.locator('#detail .link-risk').innerText()),'The card counts what its expiry affects (server through its account included)');
  await p.evaluate(()=>showDetail('ai'));await p.locator('#detail .link-risk .text-button',{hasText:'付款卡'}).click();
  check(await p.evaluate(()=>activeAsset==='card'),'The risk links to its source');

  // Picker: sections by meaning; a server now offers the card that pays for it; search hides empty sections.
  await p.evaluate(()=>linkPicker('dep'));
  const sections=await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option-group')].map(g=>g.getAttribute('aria-label')));
  check(sections[0]==='付款卡'&&sections.includes('登录账号')&&sections.includes('代码来自')&&sections[sections.length-1]==='相关','Deployment picker: '+sections.join());
  await p.fill('#link-search','me/app');
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option-group:not([hidden])')].map(g=>g.getAttribute('aria-label')).join()==='代码来自'),'Search leaves only sections with matches');
  await p.click('#modal .link-option:not([hidden])');
  await p.evaluate(()=>showDetail('dep'));
  check((await titles('dep')).includes('代码来自'),'Linking from the picker gives the named group');
  await p.evaluate(()=>{$('#modal').close();linkPicker('vps');});
  check(await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option-group')].some(g=>g.getAttribute('aria-label')==='付款卡'&&/Wise/.test(g.textContent))),'A server can take its card directly');
  await p.evaluate(()=>$('#modal').close());

  // 即将到来: the card and the number say what they affect.
  await p.evaluate(()=>setView('upcoming'));
  check(await p.evaluate(()=>/支付 3 项/.test(document.querySelector('#board [data-asset="card"]').textContent)&&/验证 1 项/.test(document.querySelector('#board [data-asset="phone"]').textContent)),'Upcoming rows name their impact');
  await p.evaluate(()=>setView('all'));

  // Delete and hide speak about links.
  await p.evaluate(()=>{confirmDeleteAsset('card');});
  check(/同时解除 2 项关联（支付），它支付的 3 项将不再记录付款卡/.test(await p.textContent('#modal')),'Deleting a card names what loses its card: '+(await p.textContent('#modal')).slice(0,160));
  await p.click('#confirm-no');
  await p.evaluate(()=>{const b=document.createElement('button');b.dataset.action='hide-asset';b.dataset.id='card';document.body.append(b);b.click();b.remove();});
  check(/已隐藏，它仍是 3 项的付款卡/.test(await p.textContent('#toast')),'Hiding a card says it still pays for things');
  await p.evaluate(()=>undo());

  // Agent: relations with their words and risks; links added and removed under the same rules.
  const call=(method,params)=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
  const sub=(await call('get',{id:'ai'})).result;
  check(sub.relations.map(r=>r.label).sort().join()==='付款卡,登录账号'&&!('links' in sub)&&sub.risks.some(r=>r.startsWith('付款卡 •••• 4821'))&&sub.risks.some(r=>r.startsWith('验证手机号 giffgaff（登录账号 美区主号）')),'get returns relations with their words and the risks: '+JSON.stringify([sub.relations,sub.risks]));
  const linked=await call('update',{id:'dep',fields:{linkTo:['card']}});
  check(linked.ok&&linked.result.asset.relations.some(r=>r.id==='card'&&r.label==='付款卡'),'update links with linkTo');
  check(/不能关联/.test((await call('update',{id:'vps',fields:{linkTo:['ai']}})).error),'An illegal pair is refused');
  check(/找不到/.test((await call('update',{id:'vps',fields:{linkTo:['nope']}})).error),'An unknown id is refused');
  check(/没有关联/.test((await call('update',{id:'vps',fields:{unlinkFrom:['ai']}})).error),'Unlinking what is not linked is refused');
  check((await call('update',{id:'dep',fields:{unlinkFrom:['card']}})).result.asset.relations.every(r=>r.id!=='card'),'unlinkFrom removes the link');
  const made=await call('add',{items:[{name:'Claude Pro',type:'ai',linkTo:['card','apple','vps']}]});
  const claude=(await call('get',{id:made.result.added[0].id})).result;
  check(claude.relations.map(r=>r.label).sort().join()==='付款卡,登录账号'&&made.result.warnings.some(w=>w.link==='vps'),'add links as it creates; an illegal one is a warning: '+JSON.stringify(made.result.warnings));
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: named groups from each side, card/number risks incl. through an account, impact counts, risk link, picker sections and search, card on a server, upcoming impact, delete and hide notes, agent relations/risks/linkTo/unlinkFrom with rules';
}
