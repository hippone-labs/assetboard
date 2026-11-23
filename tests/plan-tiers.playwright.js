// Run with the browser tool's filename option. Plans of the other categories (SERVICE_PLANS): the form of a category whose
// vendors have plans offers them under the vendor, one click fills name, price and cycle (a plan sold by the year only is a
// year), a category without plans has no plan row, and an agent adds one by its name into its own category. save() is stubbed.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof addAsset==='function'&&typeof render==='function');
  await p.evaluate(()=>{localStorage.clear();state={blocks:['subscription','deployment','storage','domain'].map(id=>({id,folded:false})),assets:[],deletedExternalIds:[]};window.__saves=0;save=()=>{window.__saves++;};render();});
  const val=n=>p.locator(`#asset-form [name="${n}"]`).inputValue();
  const form=async type=>{await p.evaluate(t=>{if(document.querySelector('#modal').open)document.querySelector('#modal').close();setView(t);addAsset();},type);await p.waitForSelector(`#asset-form[data-type="${type}"]`);};
  // 订阅: vendors with plans lead the chips; Raycast offers Pro by the month or the year.
  await form('subscription');
  const vendors=await p.locator('#asset-form .provider-picks [data-provider]').evaluateAll(b=>b.map(x=>x.dataset.provider));
  check(vendors.length===8&&['Apple','Google','1Password','Bitwarden','Raycast','Sentry','Resend','Plausible'].every(n=>vendors.includes(n)),'Vendors with plans are the chips: '+vendors);
  check(!(await p.locator('#plan-picks [data-plan]').count()),'No plan chips before a vendor is chosen');
  await p.click('#asset-form [data-provider="Raycast"]');
  check((await p.locator('#plan-picks [data-plan]').evaluateAll(b=>b.map(x=>x.textContent))).join('|')==='Pro$10','Raycast plans: '+await p.locator('#plan-picks').textContent());
  await p.click('#plan-picks [data-plan="Raycast Pro"]');
  check(await val('name')==='Raycast Pro'&&await val('amount')==='10'&&await val('currency')==='USD'&&await val('cycle')==='monthly','Raycast Pro filled: '+await val('amount'));
  await p.click('#plan-picks [data-plan-cycle="yearly"]');check(await val('amount')==='96'&&await val('cycle')==='yearly','A year of Raycast Pro: '+await val('amount'));
  check(!(await p.locator('#plan-picks [data-plan-channel]').count()),'No store row for a plan without store prices');
  // A plan sold by the year only: the chip says so and the record is yearly.
  await p.click('#asset-form [data-provider="Apple"]');
  check(/Developer Program\$99 \/ 年/.test(await p.locator('#plan-picks [data-plan="Apple Developer Program"]').textContent()),'The yearly-only chip: '+await p.locator('#plan-picks').textContent());
  await p.click('#plan-picks [data-plan="Apple Developer Program"]');
  check(await val('name')==='Apple Developer Program'&&await val('amount')==='99'&&await val('cycle')==='yearly'&&!(await p.locator('#plan-picks [data-plan-cycle]').count()),'Apple Developer Program is a year: '+await val('cycle'));
  // The currency moves the number with it here too.
  await p.evaluate(()=>{const b=document.querySelector('#asset-form .choice[data-choice][data-value="EUR"]');b.closest('.chip-group').classList.remove('folded');b.click();});
  check(await val('currency')==='EUR'&&Number(await val('amount'))>0&&await val('amount')!=='99','Euros change the number: '+await val('amount'));
  // 部署: Cloudflare has two plans there, and none in 存储; 域名 has no plan row at all.
  await form('deployment');await p.click('#asset-form [data-provider="Cloudflare"]');
  check((await p.locator('#plan-picks [data-plan]').evaluateAll(b=>b.map(x=>x.dataset.plan))).join()==='Cloudflare Workers Paid,Cloudflare Pro','Cloudflare in 部署');
  await p.click('#plan-picks [data-plan="Cloudflare Pro"]');await p.fill('#asset-form [name="date"]','2099-01-05').catch(()=>{});
  await form('storage');await p.click('#asset-form [data-provider="Cloudflare"]');check(!(await p.locator('#plan-picks [data-plan]').count()),'Cloudflare has no plan in 存储');
  await p.click('#asset-form [data-provider="iCloud"]');check(await p.locator('#plan-picks [data-plan]').count()===3,'iCloud+ tiers in 存储');
  await form('domain');check(!(await p.locator('#plan-picks').count()),'域名 has no plan row');
  await p.evaluate(()=>document.querySelector('#modal').close());
  // An agent adds a plan by name into the plan's own category, and the category list names its plans.
  const added=await p.evaluate(async()=>{const call=(method,params={})=>assetboardAgent({requestId:'t',method,params});const r=await call('add',{items:[{plan:'vercel pro'},{plan:'Apple Developer Program'},{plan:'Nothing Pro'}]});
   return {r,assets:state.assets.map(a=>[a.type,a.name,a.cost,a.cycle]),types:(await call('types')).result?.filter(t=>t.plans).map(t=>t.id+':'+t.plans.length)};});
  check(added.assets.some(a=>a.join('|')==='deployment|Vercel Pro|$20 / 月|monthly')&&added.assets.some(a=>a.join('|')==='subscription|Apple Developer Program|$99 / 年|yearly'),'Agent adds by plan name: '+JSON.stringify(added.assets)+JSON.stringify(added.r).slice(0,300));
  check(JSON.stringify(added.r).includes('Nothing Pro')||JSON.stringify(added.r).includes('未知套餐'),'An unknown plan is refused: '+JSON.stringify(added.r).slice(0,300));
  check(['ai','subscription','deployment','database','storage'].every(id=>(added.types||[]).some(t=>t.startsWith(id+':'))),'Categories list their plans: '+JSON.stringify(added.types));
  check(!errors.length,'No page errors: '+errors.join('; '));
 } finally {await context.close();}
 return 'PASS: plans of 订阅, 部署 and 存储 in the form (vendor chips, plan chips, monthly and yearly, a yearly-only plan, currency), none where a category has none, an agent adds by plan name into the plan\'s category';
}
