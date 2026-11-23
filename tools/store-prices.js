#!/usr/bin/env node
// App Store prices of the plans in AI_PLANS, by storefront, read from Apple's own product pages once a day and written as one
// file for the site (downloads/plan-prices.json), which is all the app reads. The way of reading the page (its
// serialized-server-data, the 信息 shelf's in-app purchases as name and price text) follows the MIT project
// hypooo/app-store-price; nothing is asked of that project's server.
//
//   node tools/store-prices.js <out.json>            read every app and storefront below, write the file
//   node tools/store-prices.js --check <file.json>   validate a file (the shape the app accepts), exit 1 when it is not one
//
// A storefront whose page cannot be read, or whose currency has no rate, is left out of the file; the run fails only when a whole
// app comes back empty or fewer than MIN_STORES storefronts answer, so one bad day never publishes a hollow file.
const fs=require('fs');

// The apps: App Store id, and how an in-app purchase's name maps to a plan of AI_PLANS and a cycle.
const APPS={
 chatgpt:{id:'6448311069',plan:name=>/^ChatGPT (Go|Plus|Pro (100|200|500))$/.test(name)?{plan:name,cycle:'monthly'}:null},
 claude:{id:'6473753684',plan:name=>{const m=/^Claude (Pro|Max|Ultra) - (Monthly|Annual)$/.exec(name);return m?{plan:'Claude '+m[1],cycle:m[2]==='Annual'?'yearly':'monthly'}:null;}}
};
// Storefronts: currency, whether the page writes decimals with a comma (₺5.299,99), and the title of the in-app purchase list.
const STORES={
 us:{currency:'USD',title:'In-App Purchases'},tr:{currency:'TRY',comma:true,title:'In-App Purchases'},ng:{currency:'NGN',title:'In-App Purchases'},
 pk:{currency:'PKR',title:'In-App Purchases'},eg:{currency:'EGP',title:'In-App Purchases'},in:{currency:'INR',title:'In-App Purchases'},
 ph:{currency:'PHP',title:'In-App Purchases'},br:{currency:'BRL',comma:true,title:'Compras dentro do app'},jp:{currency:'JPY',title:'アプリ内購入'},
 tw:{currency:'TWD',title:'App內購買'},kr:{currency:'KRW',title:'앱 내 구입'},au:{currency:'AUD',title:'In-App Purchases'}
};
const MIN_STORES=4,UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// "₺5.299,99" → 5299.99, "Rs 4,900.00" → 4900, "¥3,000" → 3000; null when the text is not one plain amount.
function parsePrice(text,comma=false){
 const digits=String(text||'').replace(/[^0-9.,]/g,'');if(!digits||!/\d/.test(digits))return null;
 const plain=comma?digits.replace(/\./g,'').replace(',','.'):digits.replace(/,/g,'');
 if(!/^\d+(\.\d{1,2})?$/.test(plain))return null;const n=Number(plain);return n>0&&n<1e9?n:null;
}
// The in-app purchases of one product page: [[name, price text], …]; [] when the page has no such list.
function pageItems(html,title){
 const m=/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/.exec(String(html||''));if(!m)return null;
 let root;try{root=JSON.parse(m[1]);}catch{return null;}
 const data=(Array.isArray(root)?root:root?.data)?.[0]?.data,shelves=data?.shelfMapping?.information?.items;if(!Array.isArray(shelves))return null;
 const shelf=shelves.find(x=>x?.title===title);
 return (shelf?.items||[]).filter(x=>x?.$kind==='textPair'&&typeof x.leadingText==='string'&&typeof x.trailingText==='string').map(x=>[x.leadingText.trim(),x.trailingText.trim()]);
}
// One storefront's plans: {"Claude Pro": {monthly, yearly?}, …}. A name listed twice keeps its lowest price (every storefront
// lists a second "ChatGPT Plus" at the Pro 200 price).
function storePlans(items,app,store){
 const out={};
 for(const [name,text] of items||[]){const to=app.plan(name),price=parsePrice(text,store.comma);if(!to||price==null)continue;
  const plan=out[to.plan]||(out[to.plan]={});if(plan[to.cycle]==null||price<plan[to.cycle])plan[to.cycle]=price;}
 // A yearly price without the monthly one is not a plan the form can offer.
 for(const [name,p] of Object.entries(out))if(p.monthly==null)delete out[name];
 return out;
}
// The file the app accepts: version 1, a day, rates per US dollar for every currency used, and per app and storefront the plans.
function validFile(file){
 const problems=[],day=/^\d{4}-\d\d-\d\d$/,code=/^[A-Z]{3}$/;
 if(file?.version!==1)problems.push('version');if(!day.test(file?.checked||''))problems.push('checked');
 const rates=file?.rates||{};for(const [c,r] of Object.entries(rates))if(!code.test(c)||!(r?.perUSD>0)||!day.test(r?.date||'')||!/^https:\/\//.test(r?.source||''))problems.push('rate '+c);
 const apps=file?.apps||{};if(!Object.keys(apps).length)problems.push('apps');
 for(const [id,app] of Object.entries(apps)){
  if(!APPS[id]||app?.appId!==APPS[id].id)problems.push('app '+id);const stores=app?.stores||{};if(!stores.us)problems.push(id+': no US store');
  for(const [cc,store] of Object.entries(stores)){
   if(!STORES[cc]||store?.currency!==STORES[cc].currency||store.source!==`https://apps.apple.com/${cc}/app/id${APPS[id]?.id}`)problems.push(`${id}/${cc}`);
   if(store?.currency!=='USD'&&!rates[store?.currency])problems.push(`${id}/${cc}: no rate`);
   const plans=store?.plans||{};if(!Object.keys(plans).length)problems.push(`${id}/${cc}: empty`);
   for(const [name,p] of Object.entries(plans))if(name.length>60||!(p?.monthly>0)||p.yearly!=null&&!(p.yearly>p.monthly))problems.push(`${id}/${cc}/${name}`);
  }
 }
 return problems;
}

async function text(url,accept='text/html'){const res=await fetch(url,{headers:{'User-Agent':UA,'Accept':accept,'Accept-Language':'en'},signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error(`${url}: HTTP ${res.status}`);return res.text();}
// Rates per US dollar: the ECB's through Frankfurter (what the app itself uses), and for a currency it does not carry, the open
// ExchangeRate-API endpoint. Each rate names where it came from.
async function rates(codes,today){
 const out={},want=[...new Set(codes)].filter(c=>c!=='USD');if(!want.length)return out;
 try{const f=`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${want.join(',')}`,j=JSON.parse(await text(f,'application/json'));
  for(const c of want)if(j?.rates?.[c]>0)out[c]={perUSD:j.rates[c],date:/^\d{4}-\d\d-\d\d$/.test(j.date||'')?j.date:today,source:'https://api.frankfurter.dev/v1/latest?base=USD'};}catch(e){console.error(String(e.message||e));}
 const rest=want.filter(c=>!out[c]);
 if(rest.length)try{const j=JSON.parse(await text('https://open.er-api.com/v6/latest/USD','application/json'));
  for(const c of rest)if(j?.result==='success'&&j.rates?.[c]>0)out[c]={perUSD:j.rates[c],date:today,source:'https://open.er-api.com/v6/latest/USD'};}catch(e){console.error(String(e.message||e));}
 return out;
}
async function build(today=new Date().toISOString().slice(0,10)){
 const apps={};
 for(const [id,app] of Object.entries(APPS)){
  const stores={};
  for(const [cc,store] of Object.entries(STORES)){
   const source=`https://apps.apple.com/${cc}/app/id${app.id}`;
   try{const plans=storePlans(pageItems(await text(source),store.title),app,store);if(Object.keys(plans).length)stores[cc]={currency:store.currency,source,plans};else console.error(`${id}/${cc}: no plans on the page`);}
   catch(e){console.error(`${id}/${cc}: ${e.message||e}`);}
   await new Promise(r=>setTimeout(r,400));
  }
  apps[id]={appId:app.id,stores};
 }
 const fx=await rates(Object.values(apps).flatMap(a=>Object.values(a.stores).map(s=>s.currency)),today);
 for(const app of Object.values(apps))for(const [cc,s] of Object.entries(app.stores))if(s.currency!=='USD'&&!fx[s.currency]){console.error(`${cc}: no rate for ${s.currency}, left out`);delete app.stores[cc];}
 const used=new Set(Object.values(apps).flatMap(a=>Object.values(a.stores).map(s=>s.currency)));
 return {version:1,checked:today,rates:Object.fromEntries(Object.entries(fx).filter(([c])=>used.has(c))),apps};
}

if(require.main===module)(async()=>{
 const args=process.argv.slice(2);
 if(args[0]==='--check'){const problems=validFile(JSON.parse(fs.readFileSync(args[1],'utf8')));if(problems.length){console.error('not a plan price file: '+problems.join(', '));process.exit(1);}console.log('ok');return;}
 if(!args[0]){console.error('usage: node tools/store-prices.js <out.json> | --check <file.json>');process.exit(2);}
 const file=await build(),problems=validFile(file);
 for(const [id,app] of Object.entries(file.apps))if(Object.keys(app.stores).length<MIN_STORES)problems.push(`${id}: only ${Object.keys(app.stores).length} storefronts answered`);
 if(problems.length){console.error('nothing written: '+problems.join(', '));process.exit(1);}
 fs.writeFileSync(args[0],JSON.stringify(file,null,1)+'\n');
 console.log(Object.entries(file.apps).map(([id,a])=>`${id}: ${Object.keys(a.stores).join(' ')}`).join('\n'));
})().catch(e=>{console.error(e);process.exit(1);});

module.exports={APPS,STORES,parsePrice,pageItems,storePlans,validFile};
