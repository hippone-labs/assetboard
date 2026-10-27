// Run with the browser tool's filename option. Fakes the Mac host with Cloudflare connected. An automatic sync that stopped (research
// U4) shows as a grey 「Cloudflare N 天没同步」 in the header, with the failure in its tip; a click opens Cloudflare; a fresh sync clears it;
// a disconnected Cloudflare is not checked. The 同步于 row says how long ago. Contrast of the flag in light and dark. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=connected=>{
  const ago=n=>new Date(Date.now()-n*86400000).toISOString();
  window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:connected,githubConnected:false,data:{blocks:[{id:'domain'},{id:'repository'}],assets:[
   {id:'cloudflare-zone-z1',type:'domain',name:'old.example',provider:'Cloudflare',account:'Work',source:'cloudflare',syncedAt:ago(6),externalId:'z1',resourceKind:'Zone',syncStatus:'active',art:'generic'},
   {id:'cloudflare-zone-z2',type:'domain',name:'older.example',provider:'Cloudflare',account:'Work',source:'cloudflare',syncedAt:ago(9),externalId:'z2',resourceKind:'Zone',syncStatus:'active',art:'generic'},
   {id:'gh1',type:'repository',name:'me/app',provider:'GitHub',account:'me',source:'github',syncedAt:ago(40),externalId:'r1',syncStatus:'公开仓库',art:'generic'}]}};
 };
 const ratio=p=>p.evaluate(()=>{
  const el=document.querySelector('#view-meta .meta-flag.stale');if(!el)return null;
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
  let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
  const [x,y]=[lum(over(parse(getComputedStyle(el).color),bg)),lum(bg)].sort((m,n)=>n-m);return (x+.05)/(y+.05);
 });
 let p;
 try{
  for(const scheme of ['light','dark']){
   p=await page.context().newPage();await p.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
   await p.addInitScript(`(${host.toString()})(true);`);
   await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof staleHtml==='function'&&!!document.querySelector('#view-meta'));
   await p.evaluate(()=>{save=()=>{};});
   // The automatic sync on opening fails: the reason goes into the flag's tip.
   await p.evaluate(()=>{cloudflareAuto=true;window.assetboardCloudflareResult({ok:false,error:'令牌无效或已撤销'});});
   const flag=await p.evaluate(()=>{const el=document.querySelector('#view-meta .meta-flag.stale');return el&&{text:el.textContent,tip:el.title,color:getComputedStyle(el).color};});
   check(flag&&flag.text==='Cloudflare 6 天没同步','The header names the stopped sync: '+JSON.stringify(flag));
   check(flag.tip.includes('Cloudflare · Work：6 天没同步（2 项）')&&flag.tip.includes('令牌无效或已撤销'),'The tip has the account, the count and why: '+flag.tip);
   check(!flag.tip.includes('GitHub'),'GitHub syncs by hand, so it is not flagged');
   const r=await ratio(p);check(r>=4.5,`The flag reads in ${scheme}: ${r?.toFixed(2)}`);
   if(scheme==='light'){
    const detail=await p.evaluate(()=>{showDetail('cloudflare-zone-z2');return [...document.querySelectorAll('#detail-content .fact')].map(f=>f.textContent).find(t=>t.startsWith('同步于'))||'';});
    check(/· 9 天前$/.test(detail),'同步于 says how long ago: '+detail);
    await p.click('#view-meta .meta-flag.stale');await until(p,()=>$('#modal').open&&!!document.querySelector('#cloudflare-status'));
    await p.evaluate(()=>$('#modal').close());
    // A sync that works clears it.
    await p.evaluate(()=>{cloudflareAuto=true;window.assetboardCloudflareResult({ok:true,queriedKinds:['zone'],resources:[{id:'z1',name:'old.example',account:'Work',status:'active',kind:'zone'},{id:'z2',name:'older.example',account:'Work',status:'active',kind:'zone'}],warnings:[]});});
    check(await p.evaluate(()=>!document.querySelector('#view-meta .meta-flag.stale')),'A fresh sync clears the flag');
   }
   await p.close();p=null;
  }
  // Disconnected: nothing is expected to sync, so nothing is flagged.
  p=await page.context().newPage();await p.addInitScript(`(${host.toString()})(false);`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof staleHtml==='function'&&!!document.querySelector('#view-meta'));
  check(await p.evaluate(()=>!document.querySelector('#view-meta .meta-flag.stale')),'A disconnected Cloudflare is not flagged');
 }finally{if(p)await p.close();}
 return 'PASS';
}
