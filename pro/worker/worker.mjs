// Assetboard Pro's purchase pages and licence issuer: a Cloudflare Worker (private, pro/ is never exported). No framework, no dependency:
// Stripe over fetch, Ed25519 through WebCrypto, state in one KV namespace. The app never talks to this worker or to Stripe; the person's
// browser does. Pro is one purchase: US$10 (PRO_PRICE below), lifetime updates.
//   GET  /buy                                        sends the browser to the Stripe Payment Link (PAYMENT_LINK); the app's button
//                                                    opens the same link directly (pro/web/license-pro.js, PRO_BUY_URL)
//   POST /stripe/webhook                             checkout.session.completed, paid, US$10 for the Pro product → sign a licence, keep it,
//                                                    mail it; any other amount, currency or product issues nothing; charge.refunded (full) → end it
//   GET  /thanks?session_id=cs_…                     after paying: the licence text, a copy button and the assetboard://activate link
//   GET|POST /recover                                an email address → its licences are mailed again; one fixed answer either way
//   GET  /cancelled                                  the checkout was left: nothing was charged
// Secrets (wrangler secret put): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, LICENSE_PRIVATE_KEY (pro/worker/keygen.mjs), MAIL_API_KEY (Resend).
// Vars (wrangler.toml): PAYMENT_LINK (the Stripe Payment Link), PRO_PRODUCT (its Stripe product id), MAIL_FROM, MAIL_REPLY_TO, SITE (this
// worker's https origin), DOWNLOAD (the download page). Binding: LICENSES (KV).
// Stripe: the payment and customer carry metadata license_id, license, license_status (tag), so the dashboard is the buyer list.
// KV: license:<id> {id, iss, upd, text, email (sha256 of the lower-cased address), sessions, customer?, revoked?}; session:<cs_id> → id;
// other:<cs_id> → day (a paid session that was not Pro at US$10); email:<hash> → [ids]; intent:<pi_id> → id and refund:<pi_id> → day
// (refunds); rate:<ip> → count, an hour. Addresses are kept only as hashes; Stripe has them.
import {sign,newId,day,LIFETIME,importPrivateKey,ID_PATTERN,display} from './license.mjs';

// What a licence is sold for: Stripe amounts are in the smallest unit (cents), currencies lower-case.
export const PRO_PRICE={amount:1000,currency:'usd'};

export default {fetch:(request,env)=>handle(request,env,{fetch:(...args)=>fetch(...args),now:()=>new Date(),wait:ms=>new Promise(r=>setTimeout(r,ms))})};

export async function handle(request,env,io){
 const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/',lg=lang(url,request);
 try{
  // Each branch is awaited here so the catch below sees its errors.
  if(path==='/buy'&&request.method==='GET')return buy(env);
  if(path==='/stripe/webhook'&&request.method==='POST')return await webhook(request,env,io);
  if(path==='/thanks'&&request.method==='GET')return await thanks(url,env,io,lg);
  if(path==='/recover')return request.method==='POST'?await recover(request,url,env,io,lg):recoverForm(url,env,lg);
  if(path==='/cancelled')return view(url,env,lg,{tone:'off',label:T[lg].cancelledLabel,title:T[lg].cancelled,lead:T[lg].cancelledNote,actions:`<a class="btn btn-accent" href="/buy">${T[lg].buy}</a><a class="btn btn-dark" href="${esc(siteUrl(env,lg))}">${T[lg].home}</a>`});
  if(path==='/')return Response.redirect(env.DOWNLOAD||'https://assetboard.app/',302);
  return view(url,env,lg,{status:404,tone:'off',label:T[lg].notFoundLabel,title:T[lg].notFound,actions:`<a class="btn btn-dark" href="${esc(siteUrl(env,lg))}">${T[lg].home}</a>`});
 }catch(error){
  console.error('assetboard worker: '+(error?.message||error)); // the message only: no body, no address, no licence
  return view(url,env,lg,{status:500,tone:'bad',label:T[lg].errorLabel,title:T[lg].error,lead:T[lg].errorNote,actions:`<a class="btn btn-dark" href="/recover?lang=${lg}">${T[lg].recover}</a>`});
 }
}

// ?lang= first, then the browser's own first language, so a page opened by hand reads in the visitor's language.
const lang=(url,request)=>{const q=url.searchParams.get('lang');return q==='zh'||q==='en'?q:/^zh\b/i.test(request.headers.get('Accept-Language')||'')?'zh':'en';};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// MARK: Stripe
function form(params,prefix=''){
 const out=[];const add=(key,value)=>{if(value===undefined||value===null)return;if(typeof value==='object')for(const [k,v] of Object.entries(value))add(`${key}[${k}]`,v);else out.push(encodeURIComponent(key)+'='+encodeURIComponent(value));};
 for(const [k,v] of Object.entries(params))add(k,v);return out.join('&');
}
async function stripe(env,io,method,path,params){
 const body=params?form(params):undefined;
 const res=await io.fetch('https://api.stripe.com'+path,{method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body});
 const json=await res.json();
 if(!res.ok)throw new Error(`stripe ${res.status} ${json?.error?.type||''}`);
 return json;
}
// Stripe-Signature: t=<unix>,v1=<hmac-sha256 hex of "<t>.<body>">; five minutes of tolerance, compared without short-circuiting.
export async function stripeSignatureValid(body,header,secret,now=new Date()){
 if(!header||!secret)return false;
 const parts=Object.fromEntries(header.split(',').map(p=>p.trim().split('=')).filter(p=>p.length===2).map(([k,v])=>[k,k==='v1'?v:v]));
 const t=parts.t,sigs=header.split(',').map(p=>p.trim()).filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
 if(!/^\d+$/.test(t||'')||!sigs.length||Math.abs(now.getTime()/1000-Number(t))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${body}`)));
 return sigs.some(s=>s.length===expected.length&&[...s].reduce((d,c,i)=>d|(c.charCodeAt(0)^expected.charCodeAt(i)),0)===0);
}
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha256=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));

// MARK: Records
const getLicense=async(env,id)=>{const raw=await env.LICENSES.get('license:'+id);return raw?JSON.parse(raw):null;};
const putLicense=(env,record)=>env.LICENSES.put('license:'+record.id,JSON.stringify(record));

// MARK: /buy (the site's button); a link not set yet is a configuration error, never a redirect to somewhere else.
function buy(env){
 if(!/^https:\/\/buy\.stripe\.com\/\w+$/.test(env.PAYMENT_LINK||'')||/PLACEHOLDER/.test(env.PAYMENT_LINK))throw new Error('payment link not configured');
 return Response.redirect(env.PAYMENT_LINK,302);
}
// Whether a paid session bought Pro at its price: the amount and currency of the session, and every line item being the Pro product.
export function proAmount(session){return session?.amount_total===PRO_PRICE.amount&&String(session?.currency||'').toLowerCase()===PRO_PRICE.currency;}
async function proPurchase(session,env,io){
 if(!proAmount(session)||!/^prod_[A-Za-z0-9]+$/.test(env.PRO_PRODUCT||''))return false;
 const items=await stripe(env,io,'GET','/v1/checkout/sessions/'+session.id+'/line_items?limit=10');
 const list=Array.isArray(items?.data)?items.data:[];
 return list.length>0&&list.every(item=>(typeof item.price?.product==='string'?item.price.product:item.price?.product?.id)===env.PRO_PRODUCT);
}

// MARK: /stripe/webhook
async function webhook(request,env,io){
 const body=await request.text();
 if(!await stripeSignatureValid(body,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET,io.now()))return new Response('bad signature',{status:400});
 const event=JSON.parse(body),object=event.data?.object||{};
 if((event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')&&object.payment_status==='paid')await issue(object,env,io);
 else if(event.type==='charge.refunded'&&object.payment_intent&&object.refunded===true)await refund(object,env,io);
 return new Response('{"received":true}',{headers:{'content-type':'application/json'}});
}
// One licence per Checkout Session, whatever Stripe delivers twice: every purchase of Pro at US$10 is a new licence with lifetime updates,
// whatever client_reference_id or metadata the session carries. Sessions from a Payment Link carry no metadata; the mail follows the
// session's locale.
export async function issue(session,env,io){
 if(await env.LICENSES.get('session:'+session.id))return null;
 if(session.payment_intent&&await env.LICENSES.get('refund:'+session.payment_intent))return null;
 // Another product, amount or currency (a test link, an old price) gets no licence; the session is noted so /thanks says so.
 if(!await proPurchase(session,env,io)){console.error('assetboard worker: session is not Pro at US$10');await env.LICENSES.put('other:'+session.id,day(io.now()));return null;}
 const email=String(session.customer_details?.email||session.customer_email||'').trim().toLowerCase(),hash=email?await sha256(email):'';
 const meta=session.metadata||{};
 let id;do{id=newId();}while(await env.LICENSES.get('license:'+id));
 const record={id,iss:day(io.now()),upd:LIFETIME,email:hash,sessions:[session.id],...(session.customer?{customer:session.customer}:{})};
 record.text=await sign({id:record.id,iss:record.iss,upd:record.upd},await importPrivateKey(env.LICENSE_PRIVATE_KEY));
 await putLicense(env,record);
 await env.LICENSES.put('session:'+session.id,record.id);
 if(session.payment_intent)await env.LICENSES.put('intent:'+session.payment_intent,record.id);
 if(hash){const ids=JSON.parse(await env.LICENSES.get('email:'+hash)||'[]');if(!ids.includes(record.id))ids.push(record.id);await env.LICENSES.put('email:'+hash,JSON.stringify(ids));}
 await tag(env,io,session,record);
 if(email)await mail(env,io,email,record,(meta.lang||session.locale||'').startsWith('zh')?'zh':'en');
 return record;
}
// A full refund ends the licence that payment bought: no thanks page, no recovery mail, no text left in Stripe. A partial refund changes
// nothing (the webhook only passes full ones). The refund is kept first, so a payment refunded before its checkout event never issues.
async function refund(charge,env,io){
 await env.LICENSES.put('refund:'+charge.payment_intent,day(io.now()));
 const id=await env.LICENSES.get('intent:'+charge.payment_intent),record=id&&await getLicense(env,id);
 if(!record)return;
 if(!record.revoked){record.revoked=day(io.now());record.text='';await putLicense(env,record);}
 await tag(env,io,{payment_intent:charge.payment_intent,customer:record.customer},record);
}
// The buyer list is Stripe's: the licence id and text go into the payment's (and the customer's, when the Payment Link creates one)
// metadata, so the dashboard finds a buyer by email or licence id and a lost licence can be copied from there. A failure here is
// logged and never stops the licence (KV and the thanks page already have it).
async function tag(env,io,session,record){
 const metadata={license_id:display(record.id),license:record.text,license_status:record.revoked?'refunded':'active'};
 for(const path of [session.payment_intent&&'/v1/payment_intents/'+session.payment_intent,session.customer&&'/v1/customers/'+session.customer].filter(Boolean))
  await stripe(env,io,'POST',path,{metadata}).catch(error=>console.error('assetboard worker: tag '+error.message));
}

// MARK: /thanks
async function thanks(url,env,io,lg){
 const sid=url.searchParams.get('session_id')||'';
 if(!/^cs_[A-Za-z0-9_]{5,200}$/.test(sid))return noOrder(url,env,lg);
 // An id Stripe does not know is a missing page; any other Stripe failure stays the error page.
 const session=await stripe(env,io,'GET','/v1/checkout/sessions/'+sid).catch(error=>{if(/^stripe 404 /.test(error.message))return null;throw error;});
 if(!session)return noOrder(url,env,lg);
 // The checkout's language, unless the visitor picked one with the switch.
 if(!url.searchParams.has('lang'))lg=(session.metadata?.lang||session.locale||lg).startsWith('zh')?'zh':'en';
 const t=T[lg],v=(o)=>view(url,env,lg,o),recoverLink=`<a class="btn btn-dark" href="/recover?lang=${lg}">${t.recover}</a>`;
 if(session.payment_intent&&await env.LICENSES.get('refund:'+session.payment_intent))return v({tone:'off',label:t.refundedLabel,title:t.refunded,lead:t.refundedNote,actions:recoverLink});
 if(session.payment_status!=='paid')return v({tone:'wait',label:t.unpaidLabel,title:t.unpaid,lead:t.unpaidNote,actions:`<a class="btn btn-accent" href="${esc(url.pathname+url.search)}">${t.reload}</a>`});
 if(!proAmount(session)||await env.LICENSES.get('other:'+sid))return v({tone:'bad',label:t.otherLabel,title:t.other,lead:t.otherNote});
 let id=null;
 for(let i=0;i<6&&!(id=await env.LICENSES.get('session:'+sid));i++)await io.wait(1500); // the webhook may land a moment after the browser
 if(!id)return v({tone:'wait',label:t.laterLabel,title:t.later,lead:t.laterNote,actions:`<a class="btn btn-accent" href="${esc(url.pathname+url.search)}">${t.reload}</a>${recoverLink}`});
 const record=await getLicense(env,id);
 if(record?.revoked)return v({tone:'off',label:t.refundedLabel,title:t.refunded,lead:t.refundedNote,actions:recoverLink});
 return v({tone:'ok',label:t.paidLabel,title:t.paid,lead:t.paidNote,body:`<div class="key">
<div class="key-head"><span>${t.licenceIs} <b>${esc(display(record.id))}</b></span><button type="button" class="copy" id="c">${t.copy}</button></div>
<code id="k" class="licence" tabindex="0" aria-label="${t.licenceIs} ${esc(display(record.id))}">${esc(record.text)}</code>
</div>
<div class="actions"><a class="btn btn-accent" href="assetboard://activate?key=${encodeURIComponent(record.text)}">${t.activate}</a></div>
<ol class="steps"><li>${t.step1}</li><li>${t.step2}</li></ol>
<ul class="facts"><li>${t.lifetime}</li><li>${t.mailed}</li><li>${t.refund}</li></ul>
<script>document.getElementById('c').onclick=()=>{const k=document.getElementById('k'),c=document.getElementById('c');getSelection().selectAllChildren(k);(navigator.clipboard?navigator.clipboard.writeText(k.textContent):Promise.reject()).catch(()=>document.execCommand('copy')).finally(()=>{c.textContent=${JSON.stringify(t.copied)};setTimeout(()=>c.textContent=${JSON.stringify(t.copy)},2000);});};</script>`,aside:true});
}
// Opened without an order Stripe knows (by hand, from a bookmark, a link without its session): where the licence is instead.
function noOrder(url,env,lg){const t=T[lg];return view(url,env,lg,{status:404,tone:'off',label:t.noOrderLabel,title:t.noOrder,lead:t.noOrderNote,actions:`<a class="btn btn-accent" href="/recover?lang=${lg}">${t.recover}</a><a class="btn btn-dark" href="/buy">${t.buy}</a>`,aside:true});}

// MARK: /recover
function recoverForm(url,env,lg){const t=T[lg];return view(url,env,lg,{label:'Assetboard Pro',title:t.recover,lead:t.recoverNote,body:`<form method="post" action="/recover?lang=${lg}"><label for="e">${t.email}</label><div class="field"><input id="e" type="email" name="email" required autocomplete="email" placeholder="you@example.com"><button type="submit" class="btn btn-accent">${t.send}</button></div></form>`});}
async function recover(request,url,env,io,lg){
 const data=await request.formData().catch(()=>null),email=String(data?.get('email')||'').trim().toLowerCase(),t=T[lg];
 const answer=view(url,env,lg,{tone:'ok',label:t.recoverSentLabel,title:t.recoverSent,lead:t.recoverSentNote,actions:`<a class="btn btn-dark" href="/recover?lang=${lg}">${t.again}</a>`});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return answer;
 const ip=request.headers.get('CF-Connecting-IP')||'0',key='rate:'+await sha256(ip),count=Number(await env.LICENSES.get(key))||0;
 if(count>=5)return answer;
 await env.LICENSES.put(key,String(count+1),{expirationTtl:3600});
 const ids=JSON.parse(await env.LICENSES.get('email:'+await sha256(email))||'[]');
 for(const id of ids){const record=await getLicense(env,id);if(record&&!record.revoked)await mail(env,io,email,record,lg);}
 return answer;
}

// MARK: Mail (Resend). Without MAIL_API_KEY nothing is sent and the thanks page is the only delivery. Replies (refunds) go to MAIL_REPLY_TO.
async function mail(env,io,to,record,lg){
 if(!env.MAIL_API_KEY||!env.MAIL_FROM)return false;
 const t=T[lg];
 const res=await io.fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({from:env.MAIL_FROM,to:[to],...(env.MAIL_REPLY_TO?{reply_to:env.MAIL_REPLY_TO}:{}),subject:t.mailSubject,text:t.mail(record,env)})});
 if(!res.ok)throw new Error('mail '+res.status);
 return true;
}

// MARK: Pages. The site's look (assetboard.app: dark, mono labels, one blue accent) drawn here with nothing external: no fonts, no
// images but the inlined app icon, no scripts beyond the copy button, no statistics. Links to the site are plain navigation.
const ICON='data:image/webp;base64,UklGRrgLAABXRUJQVlA4WAoAAAAgAAAA/wAA/wAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggygkAADBBAJ0BKgABAAE+MRiLQ6IhoRHZrKwgAwSzt2/6VLH5AISSEcVepWT2wdxHfkB+QHKjEMv8J90fsgc591CPMB+tf7O9iX0AP7F1LHkzemH7Iv7dekzmO/rK6C+gtyFEU60zg/+df4/fSOR/tfxj95zhyoy/+V9gHyB/NXnf+cv/D/ifgI/k/9g/W3tAeg1+zA1WaSkQ39TWHDOO6uJ6yNW6MohsrhvJx24jXUkWVq1zaOYx0bs212PQnC85bIYu+2u+LyzgmTH1+3dpEKZVSo0TqFeUhoS5F6XZTpcPQUW6fV37pJ+6xKhtGWfwqiYxPl5vwMoybJNfdTtx6nGPdBHeXVtrjkr6o1/jw4UOOYNFu1V8SMzxSOVyuUFy8bUsZ9HjeTKccXmwJUuaS5LAMA2X4NSU5oF6cjJZ6ZqkY6kTXZShJeHazegdWW7hRLO0aebhe44pLNZnIBXdzcgWJlCNIrX740gLpRxaKg1G6xr+Ky9tZwgSbYswkjUm0xh6t7oKZT0MvotENr1DnzjSc1np26sswi6Q/EX9duqZ15OFZu1B781SAGtLmI+CQtcWwekcN3d3yb6L5FS0nL3n4glKSZQCcVbd8c5Nvbr+Ym+FCDFAGmLoGI1l8K3bD4C3lKi3fVP6XMio1FednuoHMHJFm25XSDCSrYAJFBi/YfdW988d1P7TxTMp6pNPHdXE072AAP771cf/i31XdF7kd6Il/BSn19yXBb9y+BJI/WSY9UfoBezOpIkYkwjT80SnoFpLymyeiREdCR/LtpKRDT0GZuNJHJXa0AfVIK0c4uPydGf8lDWx6/4Br2XilcDyimKptBkwCbWr2Z3WeUrKeExt5raHpZVs5AP6MLGAWOz8PQAo0mihER7d84LCvZmF6CH2F+HCiXkZcXGT9Z2SQXEFcZ1mxrDiJyoIp+tRqHLC3cqL8Y/z07BdZTtor1UM7tjCZV7yFw8dAatxxAavplvo8X5Rkej8yhUi4vz4jyL1z0CIlFUkhGI5EufvLCqo+xFilAnfefYuQ3Y+N68VfKDllS/vFr8X2LBtENwdFbP2ZZ9zZ3rIZVWHYHnQmDztp9eQitrpTII1rayPMTEInyv4eKJwY3GePFdXOyut8CD5sbdFSBvuhjXqcP+JHybMoNwv6Wv+XmWVgbRJ2NxTuUbLmuY411o2AHE76ZleOxtPslwGqXYadWMw52WIr1N1/6kg06CllkD1FoD2ibBwrIXq8h93dZPLxBjcfZtFQy6W6Dzjl77j6VxvucwNks0LCCqq/llgpM/OkiWOMBKofj9MXZLt93lD3URmaeCf81Ff2bSfMls459nTeHY1k1LRZnEfR1ob2sSuCzInqANOCoofkQAI5YH5+bcKcjP8MTv9h4K17wi6seZXYgoSwkqiJyZypiMvwO6CAcJZ7+/gIO5t+ZyhlDp1FMBPI4ukAiosBkOBdW5gYSyeHgpbwcOioY5qncQ6PfhtuA8TAb8QsIbWALc1dQqeDwVS7OW4KHmSWUMy9fii+rE9y/Fi+2Qq6BK2+vphj1NfVKwGnekn4oA5FFuNslu2Q7gCe5mOxXqgLG21Jsgsc2lF8rZ1giL1ruXPY9HtV2g3H7HB0auJSEe+HJu47Jj23nLzJZFNVgUqUD4hqlU7Dc1atNawL0VhYkbCgDU3tCJDdDWqw0XJoUC+NC7XyFwQGDGrbabWrE20uoFkbO2vf/TiLK1pt2HEWJIPjyXm0fxbjHmgTURUPZ9gqp5ie23/W7AeWJ8o/zEEQIVbVzIof+cUsgpXW9IuLsCc5g/4ksQcYGWAn32R6Cy0earGK0RzbjjdQ0yOdqYHa8lvSUPsn6ywAzApeHkPeqDTbX8wAw9TKc3YKKOZMQ79JZQsJzxZ0ge8IOb73o5Irbi7Rysfqo5AIPjniKRH/MlRGf+SRBXmDMbP6G62QrhzOm6DdCSVR7OMRz9vvkfEOhVUA1mGXnDcTgD9p/lLu/kbYhHx0ODFPEdtemWd5eoHq1EUAev6FUOsO1w3dBitOaErUX8MSys6kz7FUXpMFITkYS/LSb2FfHHoMkD0XeAmR6corTOyjiZDwaIaL/v2nNUWE4sVlh+aX890XXhMpiPJILxlXP8IrxqBeMUc3smHY9s3+WYgf591bzj57aiEEnUtlif3nkaq/wAIO/Edpcjl+lg1I9qC5A5f734aHm0ebmsmEkqjRPuircG14IBAdMAg96ed724dkL2fvIJZhm7YhayvSZVK6NVDiEfhgV6SFbBw3bjE0rCHVL2bgbveWJnC3COI0//D4ZSQA3i0BenubO70T8tGqvey2HjQn4Neo3HtnrPOfhDP4U4Z+kYZpLV68POB2B76y0Q3fXFbCRO4HemAlWV6GjGBP5QyGTgnq/L2EQdtOlhf6CCx79PnlRRSzE6dx97+JpC85/zBi9yXt3ejT178Xivp94gP/QwDuIMqFQwRH7MxnZ2+m/ZuF6bvQSGoS0s+drNmlOcN/jd9SQWUj8ypOLOt0d3dz3Vg2R3rgFXiaatQ9wU9ncz0NPlQZG2EDKVjNipivwEXMq3YESqXBz0b60BeePyf4J/eGPfzfo8iy01dR1ZQQOw7u1uLHBjaktH0L4zdP5l7dF7g26bIfzbnAt3hBgwxZfm5zyxpY/uPa481GWD4yzaBLlC/VfnUwqVdaJIIvYkZAWvPQL4hnOr5Pul+fGQYLlNqdnrUNVM7CoGjnPsT+af1QziwAREmplPdZwGrAGWO07MYEWuM5las6vFo5qn1yPUB9N/FME+/EcJDEOW6m8pN5thpzoSIxRDgXV+BtKRxYVJRoHQD8R+Rirj18ltz0IILSUqwLED0E+QARx5gY7EkZaLa+LBJ2FwXzzBfBM/TX8e1ogJzjVcZCTyjBCsNpCHlnFpffLVg9Oo7QMnCt69t4vC+M2p1vcdyFMabD4XRoKDvzrahrAlW6xQ0wDKvC8/+Ti4H5CqXkosbPubrMLZEY6qzfoEiQwbWSOHLDR4wS+TrrqdOpGksKVQynzXcBAVi0L1LrVdB3yMptR+g0xc5TiEccskLs69j7B2rvp34Hj+YZFOLPYWkBttaKY6tZ1B5Zhj94P1RKz9sy/+G6/T5Jt1VRkMXeclau/j+s6BB3obmDg4ifyNYEMNZxJnLK348IDwqQozZzGWZX5GnjDCknTV0UU4Uq/DrKjCmAiCLlYMy+ZQOQsjGF2NZN9e+Uaj5ulR4irdcPv6RfvRJcox6ALu7xiD2oWqmGKQPQFMu7D9kLbCAA0BjJG7HDyBDwAQuk0gd3MoOSAQjfMhsq0baXDx13OMNxtqaQRKCNz1Z+1iRzYt52+qiYAA=';
// The site's pages for a language: '' is the home page.
const siteUrl=(env,lg,path='')=>{let origin='https://assetboard.app';try{origin=new URL(env.DOWNLOAD).origin;}catch{}return origin+(lg==='en'?'/en/':'/')+path;};
// One card: tone ok|wait|bad|off colours the status label; actions are buttons under the lead; aside adds the download line.
function view(url,env,lg,{status=200,tone='',label='',title,lead='',body='',actions='',aside=false}){
 const t=T[lg],other=lg==='zh'?'en':'zh',sw=new URL(url);sw.searchParams.set('lang',other);
 return page(`<header><a class="brand" href="${esc(siteUrl(env,lg))}"><img src="${ICON}" width="24" height="24" alt="">Assetboard <small>Pro</small></a><a class="lang" href="${esc(sw.pathname+sw.search)}" hreflang="${other==='zh'?'zh-CN':'en'}" lang="${other==='zh'?'zh-CN':'en'}">${other==='zh'?'中文':'English'}</a></header>
<main><section class="card${tone?' '+tone:''}">${label?`<p class="label">${esc(label)}</p>`:''}<h1>${title}</h1>${lead?`<p class="lead">${lead}</p>`:''}${body}${actions?`<div class="actions">${actions}</div>`:''}</section>
${aside?`<p class="aside">${t.noApp} <a href="${esc(siteUrl(env,lg))}">${t.download}</a></p>`:''}</main>
<footer><span>© 2026 Assetboard</span><a href="${esc(siteUrl(env,lg,'privacy/'))}">${t.privacy}</a><a href="${esc(siteUrl(env,lg,'terms/'))}">${t.terms}</a><a href="${esc(siteUrl(env,lg,'contact/'))}">${t.contact}</a></footer>`,status,lg,title);
}
function page(body,status=200,lg='en',title=''){
 return new Response(`<!doctype html><html lang="${lg==='zh'?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0b0c0e"><title>${title?title.replace(/<[^>]+>/g,'')+' · ':''}Assetboard Pro</title><link rel="icon" href="${ICON}">
<style>
:root{--bg:#0b0c0e;--bg-1:#111215;--bg-2:#17181c;--bg-3:#1e1f24;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--text:#ececef;--text-2:#a1a1aa;--text-3:#85858e;--accent:#7aa9f2;--ok:#6cc28f;--warn:#e5a54b;--bad:#f07171;
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Segoe UI","Microsoft YaHei","Noto Sans CJK SC",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"SF Mono",SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(122,169,242,.10),transparent 70%),var(--bg);color:var(--text);font:16px/1.6 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--text);text-decoration-color:var(--line-2);text-underline-offset:3px}a:hover{text-decoration-color:var(--text-2)}:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
header,main,footer{width:100%;max-width:600px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-weight:600;letter-spacing:-.01em}.brand img{border-radius:6px}.brand small{font-family:var(--mono);font-size:.72rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.lang{font-family:var(--mono);font-size:.76rem;color:var(--text-2);text-decoration:none;border:1px solid var(--line-2);border-radius:999px;padding:3px 11px}.lang:hover{color:var(--text);border-color:var(--text-3)}
main{flex:1;padding-top:40px;padding-bottom:56px}
.card{padding:32px;border-radius:16px;background:linear-gradient(180deg,rgba(122,169,242,.06),transparent 45%),var(--bg-1);border:1px solid var(--line)}
.card.ok{border-color:rgba(122,169,242,.45)}
.label{display:inline-flex;align-items:center;gap:8px;margin:0 0 18px;font-family:var(--mono);font-size:.72rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-2)}
.label::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent)}
.ok .label{color:var(--ok)}.ok .label::before{background:var(--ok)}.wait .label{color:var(--warn)}.wait .label::before{background:var(--warn)}.bad .label{color:var(--bad)}.bad .label::before{background:var(--bad)}.off .label::before{background:var(--text-3)}
h1{margin:0;font-size:1.65rem;line-height:1.25;font-weight:650;letter-spacing:-.02em}
.lead{margin:12px 0 0;color:var(--text-2)}
.key{margin-top:26px;border:1px solid var(--line-2);border-radius:12px;background:var(--bg);overflow:hidden}
.key-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 14px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:.74rem;color:var(--text-3)}.key-head b{color:var(--text);font-weight:600;letter-spacing:.06em}
.copy{height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line-2);background:var(--bg-3);color:var(--text);font:600 .74rem var(--mono);cursor:pointer}.copy:hover{border-color:var(--text-3)}
.licence{display:block;padding:12px 14px;color:var(--text);font:12.5px/1.6 var(--mono);word-break:break-all;user-select:all;-webkit-user-select:all}.licence:focus-visible{outline-offset:-2px;border-radius:0 0 12px 12px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border-radius:999px;border:1px solid transparent;font:600 .82rem var(--mono);text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .15s,border-color .15s,transform .15s}.btn:hover{transform:translateY(-1px)}
.btn-accent{background:var(--accent);color:#0b0c0e}.btn-accent:hover{background:#93baf5}.btn-dark{background:var(--bg-3);color:var(--text);border-color:var(--line)}.btn-dark:hover{border-color:var(--line-2)}
.steps{margin:22px 0 0;padding:0;list-style:none;counter-reset:s;color:var(--text-2);font-size:.92rem}.steps li{position:relative;padding:0 0 8px 30px;counter-increment:s}.steps li::before{content:counter(s);position:absolute;left:0;top:2px;width:20px;height:20px;border-radius:50%;border:1px solid var(--line-2);font:500 .7rem/18px var(--mono);text-align:center;color:var(--text-2)}
.facts{margin:18px 0 0;padding:0;list-style:none;font-size:.88rem;color:var(--text-2)}.facts li{position:relative;padding:9px 0 9px 24px;border-top:1px solid var(--line)}.facts li::before{content:"+";position:absolute;left:2px;color:var(--accent);font-family:var(--mono)}
form{margin-top:24px}label{display:block;margin-bottom:8px;font-family:var(--mono);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
.field{display:flex;gap:10px}input{flex:1;min-width:0;height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line-2);background:var(--bg);color:var(--text);font:inherit;font-size:.95rem}input:focus{outline:none;border-color:var(--accent)}input::placeholder{color:var(--text-3)}
.aside{margin:20px 0 0;text-align:center;font-size:.88rem;color:var(--text-3)}.aside a{color:var(--text-2)}
footer{display:flex;flex-wrap:wrap;gap:6px 18px;width:calc(100% - 40px);max-width:560px;padding:20px 0 32px;border-top:1px solid var(--line);font-family:var(--mono);font-size:.72rem;color:var(--text-3)}footer span{margin-right:auto}footer a{color:var(--text-3);text-decoration:none}footer a:hover{color:var(--text)}
@media(max-width:480px){main{padding-top:16px}.card{padding:24px 20px}h1{font-size:1.4rem}.field{flex-direction:column}.field input{flex:none}.actions .btn{flex:1 1 auto}footer span{width:100%}}
@media(prefers-reduced-motion:reduce){.btn{transition:none}.btn:hover{transform:none}}
</style></head>
<body>${body}</body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'self'"}});
}

export const T={
 zh:{paidLabel:'已付款',paid:'付款成功',paidNote:'这是你的 Assetboard Pro 许可证。',licenceIs:'许可证',activate:'在 Assetboard 里激活',copy:'复制',copied:'已复制',
  step1:'点上面的按钮，Assetboard 会打开并填好许可证。',step2:'也可以复制许可证，粘贴到 App 的「设置 › Assetboard Pro」。',
  lifetime:'终身更新：以后发布的每个版本都能用',mailed:'同一份许可证已发到你结账用的邮箱',refund:'14 天内不满意，回复那封邮件即可退款',
  noApp:'还没装 Assetboard？',download:'免费下载',
  refundedLabel:'已退款',refunded:'这笔付款已退款',refundedNote:'这个订单的许可证已停用。其他订单的许可证可以用购买邮箱找回。',
  otherLabel:'没有许可证',other:'这笔付款不是 Assetboard Pro',otherNote:'这个订单不带许可证。如果你买的就是 Assetboard Pro（US$10），回复收据邮件，我们来核对。',
  unpaidLabel:'等待付款',unpaid:'还没收到这笔付款',unpaidNote:'刚付完的话，稍等几秒再刷新。付款没完成就不会扣款。',
  laterLabel:'签发中',later:'许可证马上就到',laterNote:'付款已收到，许可证正在签发。几分钟内会发到你结账用的邮箱，刷新这一页也能看到。',reload:'刷新',
  cancelledLabel:'未扣款',cancelled:'结账已取消',cancelledNote:'没有扣款。想买的时候随时回来。',buy:'购买 Pro · US$10',home:'返回官网',
  recover:'找回许可证',recoverNote:'填写购买时用的邮箱，这个邮箱买过的许可证会再发一遍。',email:'购买邮箱',send:'发送',again:'换个邮箱',
  recoverSentLabel:'已发送',recoverSent:'请查看邮箱',recoverSentNote:'如果这个邮箱买过 Assetboard Pro，许可证几分钟内就到。没看到就翻翻垃圾邮件。',
  noOrderLabel:'没有订单',noOrder:'这里没有订单',noOrderNote:'付款完成后会自动回到这一页显示许可证，同一份也会发到结账邮箱。邮件找不到，就用找回页再发一次。',
  notFoundLabel:'404',notFound:'页面不存在',errorLabel:'出错了',error:'出了点问题',errorNote:'稍后再试。付款不会丢失，许可证随时可以用找回页再发。',
  privacy:'隐私政策',terms:'服务条款',contact:'联系',
  mailSubject:'你的 Assetboard Pro 许可证',mail:(r,env)=>`这是你的 Assetboard Pro 许可证（编号 ${display(r.id)}，终身更新）：\n\n${r.text}\n\n在 App 的「设置 › Assetboard Pro」里粘贴并激活，或点这个链接：\nassetboard://activate?key=${encodeURIComponent(r.text)}\n\n终身更新：以后发布的每个版本都能用。\n找回：${env.SITE}/recover?lang=zh\n14 天内不满意，回这封邮件即退款。`},
 en:{paidLabel:'Paid',paid:'Thanks for buying Pro',paidNote:'Here is your Assetboard Pro licence.',licenceIs:'Licence',activate:'Activate in Assetboard',copy:'Copy',copied:'Copied',
  step1:'Click the button above; Assetboard opens with the licence filled in.',step2:'Or copy the licence and paste it into Settings › Assetboard Pro in the app.',
  lifetime:'Lifetime updates: every future version works with it',mailed:'The same licence was sent to your checkout email',refund:'Not happy within 14 days? Reply to that email for a refund',
  noApp:'Don\'t have Assetboard yet?',download:'Download it free',
  refundedLabel:'Refunded',refunded:'This payment was refunded',refundedNote:'The licence from this order no longer works. Licences from other orders can be recovered with your purchase email.',
  otherLabel:'No licence',other:'This payment is not for Assetboard Pro',otherNote:'This order does not include a licence. If you did buy Assetboard Pro (US$10), reply to the receipt and we will look into it.',
  unpaidLabel:'Awaiting payment',unpaid:'No payment yet',unpaidNote:'If you just paid, wait a few seconds and reload. Nothing is charged until the payment completes.',
  laterLabel:'Issuing',later:'Your licence is on its way',laterNote:'The payment is in and the licence is being issued. It reaches your checkout email within minutes; reloading this page shows it too.',reload:'Reload',
  cancelledLabel:'Not charged',cancelled:'Checkout cancelled',cancelledNote:'Nothing was charged. Come back whenever you like.',buy:'Buy Pro · US$10',home:'Back to the site',
  recover:'Recover a licence',recoverNote:'Enter the email you bought with and we send its licences again.',email:'Purchase email',send:'Send',again:'Try another email',
  recoverSentLabel:'Sent',recoverSent:'Check your inbox',recoverSentNote:'If that address bought Assetboard Pro, the licence arrives within minutes. Check the spam folder too.',
  noOrderLabel:'No order',noOrder:'No order here',noOrderNote:'After paying you come back to this page with your licence, and the same licence goes to your checkout email. Can\'t find the email? Recover it.',
  notFoundLabel:'404',notFound:'Page not found',errorLabel:'Error',error:'Something went wrong',errorNote:'Try again later. Payments are not lost, and the recovery page can always resend a licence.',
  privacy:'Privacy',terms:'Terms',contact:'Contact',
  mailSubject:'Your Assetboard Pro licence',mail:(r,env)=>`Here is your Assetboard Pro licence (${display(r.id)}, lifetime updates):\n\n${r.text}\n\nPaste it into Settings › Assetboard Pro in the app, or open this link:\nassetboard://activate?key=${encodeURIComponent(r.text)}\n\nLifetime updates: every version released from now on works with it.\nRecover: ${env.SITE}/recover\nNot happy within 14 days? Reply to this email for a refund.`}
};
