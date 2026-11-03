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
  if(path==='/recover')return request.method==='POST'?await recover(request,env,io,lg):page(recoverForm(lg),200,lg);
  if(path==='/cancelled')return page(`<h1>${T[lg].cancelled}</h1><p>${T[lg].cancelledNote}</p>`,200,lg);
  if(path==='/')return Response.redirect(env.DOWNLOAD||'https://assetboard.app/',302);
  return page(`<h1>${T[lg].notFound}</h1>`,404,lg);
 }catch(error){
  console.error('assetboard worker: '+(error?.message||error)); // the message only: no body, no address, no licence
  return page(`<h1>${T[lg].error}</h1><p>${T[lg].errorNote}</p>`,500,lg);
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
 if(!/^cs_[A-Za-z0-9_]{5,200}$/.test(sid))return noOrder(env,lg);
 // An id Stripe does not know is a missing page; any other Stripe failure stays the error page.
 const session=await stripe(env,io,'GET','/v1/checkout/sessions/'+sid).catch(error=>{if(/^stripe 404 /.test(error.message))return null;throw error;});
 if(!session)return noOrder(env,lg);
 lg=(session.metadata?.lang||session.locale||lg).startsWith('zh')?'zh':'en';
 if(session.payment_intent&&await env.LICENSES.get('refund:'+session.payment_intent))return page(`<h1>${T[lg].refunded}</h1><p>${T[lg].refundedNote}</p>`,200,lg);
 if(session.payment_status!=='paid')return page(`<h1>${T[lg].unpaid}</h1><p>${T[lg].unpaidNote}</p>`,200,lg);
 if(!proAmount(session)||await env.LICENSES.get('other:'+sid))return page(`<h1>${T[lg].other}</h1><p>${T[lg].otherNote}</p>`,200,lg);
 let id=null;
 for(let i=0;i<6&&!(id=await env.LICENSES.get('session:'+sid));i++)await io.wait(1500); // the webhook may land a moment after the browser
 if(!id)return page(`<h1>${T[lg].later}</h1><p>${T[lg].laterNote}</p>`,200,lg);
 const record=await getLicense(env,id),t=T[lg];
 if(record?.revoked)return page(`<h1>${t.refunded}</h1><p>${t.refundedNote}</p>`,200,lg);
 return page(`<h1>${t.paid}</h1>
<p>${t.licenceIs} <b>${esc(display(record.id))}</b>${t.lifetime}</p>
<textarea id="k" readonly rows="4" spellcheck="false">${esc(record.text)}</textarea>
<p class="row"><a class="button" href="assetboard://activate?key=${encodeURIComponent(record.text)}">${t.activate}</a><button type="button" id="c">${t.copy}</button></p>
<p>${t.mailed}</p>
<p>${t.noApp} <a href="${esc(env.DOWNLOAD||'https://assetboard.app/')}">${t.download}</a></p>
<p class="small">${t.refund}</p>
<script>document.getElementById('c').onclick=()=>{const k=document.getElementById('k');k.select();navigator.clipboard?.writeText(k.value);document.getElementById('c').textContent=${JSON.stringify(t.copied)};};</script>`,200,lg);
}

// Opened without an order Stripe knows (by hand, from a bookmark, a link without its session): where the licence is instead.
function noOrder(env,lg){const t=T[lg];return page(`<h1>${t.noOrder}</h1><p>${t.noOrderNote}</p><p class="row"><a class="button" href="/recover?lang=${lg}">${t.recover}</a></p><p>${t.noApp} <a href="${esc(env.DOWNLOAD||'https://assetboard.app/')}">${t.download}</a></p>`,404,lg);}

// MARK: /recover
function recoverForm(lg){const t=T[lg];return `<h1>${t.recover}</h1><p>${t.recoverNote}</p><form method="post" action="/recover?lang=${lg}"><input type="email" name="email" required autocomplete="email" placeholder="you@example.com"><button type="submit">${t.send}</button></form>`;}
async function recover(request,env,io,lg){
 const data=await request.formData().catch(()=>null),email=String(data?.get('email')||'').trim().toLowerCase(),t=T[lg];
 const answer=page(`<h1>${t.recoverSent}</h1><p>${t.recoverSentNote}</p>`,200,lg);
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

// MARK: Pages. Nothing external: no fonts, no scripts beyond the copy button, no statistics.
function page(body,status=200,lg='en'){
 return new Response(`<!doctype html><html lang="${lg==='zh'?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Assetboard Pro</title>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f7;color:#1d1d1f}@media(prefers-color-scheme:dark){body{background:#1c1c1e;color:#f2f2f7}textarea,input{background:#2c2c2e;color:#f2f2f7;border-color:#444}}
main{max-width:560px;margin:0 auto;padding:48px 16px}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 14px}textarea,input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}input{font:inherit}
.row{display:flex;gap:10px;flex-wrap:wrap}a.button,button{display:inline-block;padding:9px 16px;border:0;border-radius:8px;background:#2f5fb3;color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}button[type=button]{background:#888}.small{font-size:13px;opacity:.75}form{display:grid;gap:10px}</style></head>
<body><main>${body}</main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'"}});
}

export const T={
 zh:{paid:'付款成功，这是你的许可证',licenceIs:'许可证编号',lifetime:'，终身更新：以后发布的每个版本都能用。',activate:'在 Assetboard 里激活',copy:'复制',copied:'已复制',
  mailed:'同一段文本也发到了你结账用的邮箱。',noApp:'还没装？',download:'下载 Assetboard',refund:'14 天内不满意，回邮件即退款。',refunded:'这笔付款已退款',refundedNote:'该订单不再提供许可证。其他未退款订单的许可证可用购买邮箱找回。',
  other:'这笔付款不是 Assetboard Pro',otherNote:'这个订单不提供许可证。如果你买的是 Assetboard Pro（US$10），回复收据邮件，我们会核对。',
  unpaid:'还没有收到付款',unpaidNote:'如果你刚付完，稍等片刻刷新；否则可以回到 App 重新购买。',later:'许可证稍后会发到邮箱',laterNote:'付款已到，许可证正在签发，几分钟内发到你结账用的邮箱；没收到就用找回页。',
  cancelled:'没有扣款',cancelledNote:'结账取消了，回到 App 随时可以再来。',
  recover:'找回许可证',recoverNote:'填购买时用的邮箱，许可证会再发一遍。',send:'发送',recoverSent:'如果这个邮箱买过，许可证已经发过去了',recoverSentNote:'几分钟内到达；也看看垃圾邮件。',
  noOrder:'这里没有订单',noOrderNote:'付款完成后会自动回到这一页并显示许可证；同一段许可证也发到了结账用的邮箱。找不到邮件就用找回页再发一次。',
  notFound:'没有这一页',error:'出了点问题',errorNote:'稍后再试；付款不会丢，许可证可以用找回页再发。',
  mailSubject:'你的 Assetboard Pro 许可证',mail:(r,env)=>`这是你的 Assetboard Pro 许可证（编号 ${display(r.id)}，终身更新）：\n\n${r.text}\n\n在 App 的「设置 › Assetboard Pro」里粘贴并激活，或点这个链接：\nassetboard://activate?key=${encodeURIComponent(r.text)}\n\n终身更新：以后发布的每个版本都能用。\n找回：${env.SITE}/recover?lang=zh\n14 天内不满意，回这封邮件即退款。`},
 en:{paid:'Paid. Here is your licence',licenceIs:'Licence',lifetime:', with lifetime updates: every version released from now on works with it.',activate:'Activate in Assetboard',copy:'Copy',copied:'Copied',
  mailed:'The same text was sent to the email address you used at checkout.',noApp:'No app yet?',download:'Download Assetboard',refund:'Not happy within 14 days? Reply to the email for a refund.',refunded:'This payment was refunded',refundedNote:'This order no longer provides a licence. Recover licences from other unrefunded orders using your purchase email.',
  other:'This payment is not for Assetboard Pro',otherNote:'This order does not come with a licence. If you bought Assetboard Pro (US$10), reply to the receipt and we will look into it.',
  unpaid:'No payment yet',unpaidNote:'If you just paid, wait a moment and reload; otherwise go back to the app and try again.',later:'Your licence is on its way',laterNote:'The payment is in and the licence is being issued; it reaches your checkout email within minutes. If not, use the recovery page.',
  cancelled:'Nothing was charged',cancelledNote:'The checkout was cancelled. You can come back from the app any time.',
  recover:'Recover a licence',recoverNote:'Enter the email you bought with; the licence is sent again.',send:'Send',recoverSent:'If that address bought a licence, it has been sent',recoverSentNote:'It arrives within minutes; check the spam folder too.',
  noOrder:'No order here',noOrderNote:'After paying you come back to this page with your licence, and the same licence is sent to your checkout email. Can\'t find the email? The recovery page sends it again.',
  notFound:'No such page',error:'Something went wrong',errorNote:'Try again later. Payments are not lost; the recovery page can resend a licence.',
  mailSubject:'Your Assetboard Pro licence',mail:(r,env)=>`Here is your Assetboard Pro licence (${display(r.id)}, lifetime updates):\n\n${r.text}\n\nPaste it into Settings › Assetboard Pro in the app, or open this link:\nassetboard://activate?key=${encodeURIComponent(r.text)}\n\nLifetime updates: every version released from now on works with it.\nRecover: ${env.SITE}/recover\nNot happy within 14 days? Reply to this email for a refund.`}
};
