// The purchase worker (pro/worker/worker.mjs) and the licence module (pro/worker/license.mjs), with Stripe, Resend and KV faked: no
// network. Signatures are checked with the test key pair (pro/tests/fixtures/license-test-key.json), the same one pro/desktop/License.swift's
// self-test holds, so both ends read the same texts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handle,issue,stripeSignatureValid,proAmount,PRO_PRICE} from '../worker/worker.mjs';
import {sign,verify,newId,display,isDay,LIFETIME,importPrivateKey,importPublicKey,ID_ALPHABET,unb64url} from '../worker/license.mjs';

const keys=JSON.parse(readFileSync(new URL('./fixtures/license-test-key.json',import.meta.url),'utf8'));
const publicKey=await importPublicKey(keys.publicKeyRaw);

function fakeEnv(){
 const kv=new Map();
 return {kv,LICENSES:{get:async k=>kv.has(k)?kv.get(k):null,put:async(k,v)=>{kv.set(k,String(v));},delete:async k=>{kv.delete(k);}},
  STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:'whsec_test',LICENSE_PRIVATE_KEY:keys.privateKeyPkcs8,MAIL_API_KEY:'re_x',MAIL_FROM:'Assetboard <pro@example.com>',MAIL_REPLY_TO:'reply@example.com',
  SITE:'https://pay.example.com',DOWNLOAD:'https://example.com/releases',PAYMENT_LINK:'https://buy.stripe.com/test_pro10',PRO_PRODUCT:'prod_pro'};
}
// Line items per session id; a session not listed bought the Pro product.
function fakeIo({sessions={},items={},now='2026-10-24T10:00:00Z'}={}){
 const calls=[];
 const fetch=async(url,init={})=>{
  calls.push({url,method:init.method||'GET',body:init.body,headers:init.headers});
  const json=(status,obj)=>({ok:status<300,status,json:async()=>obj});
  if(url==='https://api.stripe.com/v1/checkout/sessions'&&init.method==='POST')return json(200,{id:'cs_test_new',url:'https://checkout.stripe.com/c/pay/cs_test_new'});
  const get=url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/);
  if(get)return sessions[get[1]]?json(200,sessions[get[1]]):json(404,{error:{type:'invalid_request_error'}});
  const lines=url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)\/line_items\?limit=10$/);
  if(lines)return json(200,{data:items[lines[1]]||[{price:{product:'prod_pro'},quantity:1}]});
  if(url==='https://api.resend.com/emails')return json(200,{id:'email_1'});
  if(/^https:\/\/api\.stripe\.com\/v1\/(payment_intents\/pi_|customers\/cus_)[A-Za-z0-9_]+$/.test(url)&&init.method==='POST')return json(200,{});
  return json(500,{});
 };
 return {calls,fetch,now:()=>new Date(now),wait:async()=>{},mails:()=>calls.filter(c=>c.url.includes('resend')).map(c=>JSON.parse(c.body))};
}
const signedEvent=(event,secret='whsec_test',at=Math.floor(Date.parse('2026-10-24T10:00:00Z')/1000))=>{const body=JSON.stringify(event);const v1=createHmac('sha256',secret).update(`${at}.${body}`).digest('hex');return {body,header:`t=${at},v1=${v1}`};};
const post=(env,io,event,header)=>handle(new Request('https://pay.example.com/stripe/webhook',{method:'POST',body:event.body,headers:{'Stripe-Signature':header??event.header}}),env,io);
const paidSession=(over={})=>({id:'cs_test_1',created:Math.floor(Date.parse('2026-10-24T10:00:00Z')/1000),payment_status:'paid',amount_total:1000,currency:'usd',payment_intent:'pi_1',customer:'cus_1',customer_details:{email:'Buyer@Example.com'},metadata:{plan:'pro',lang:'zh'},...over});

test('licence module: ids, days, lifetime, signing and verifying',async()=>{
 const id=newId();
 assert.match(id,/^[A-Z2-9]{8}$/);assert.ok([...id].every(c=>ID_ALPHABET.includes(c)));assert.ok(!/[01IO]/.test(ID_ALPHABET));
 assert.equal(newId(bytes=>bytes.fill(0)),'AAAAAAAA');
 assert.equal(display('K3Q7NVHM'),'K3Q7-NVHM');
 assert.ok(isDay('2026-02-28')&&!isDay('2026-02-30')&&!isDay('2026-2-8')&&!isDay(''));
 assert.equal(LIFETIME,'9999-12-31');assert.ok(isDay(LIFETIME),'the app reads it as a day like any other');
 const key=await importPrivateKey(keys.privateKeyPkcs8);
 const text=await sign({id:'K3Q7NVHM',iss:'2026-10-01',upd:'2027-10-01'},key);
 assert.match(text,/^ASB1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
 assert.ok(text.length<200,'fits a text field: '+text.length);
 assert.equal(JSON.parse(new TextDecoder().decode(unb64url(text.split('.')[1]))).plan,'pro');
 assert.deepEqual(await verify(text,publicKey),{id:'K3Q7NVHM',plan:'pro',iss:'2026-10-01',upd:'2027-10-01'});
 // The last character carries two unused bits, so the change goes in the middle of the signature.
 const sig=text.lastIndexOf('.')+10;
 assert.equal(await verify(text.slice(0,sig)+(text[sig]==='A'?'B':'A')+text.slice(sig+1),publicKey),null,'a changed signature');
 assert.equal(await verify(text.replace('ASB1.e','ASB1.f'),publicKey),null,'a changed payload');
 assert.equal(await verify('ASB1.eyJ2IjoxfQ.c2ln',publicKey),null);assert.equal(await verify('',publicKey),null);
 await assert.rejects(sign({id:'bad',iss:'2026-10-01',upd:'2027-10-01'},key));
 await assert.rejects(sign({id:'K3Q7NVHM',iss:'2027-10-01',upd:'2026-10-01'},key),'updates before issue');
 // The fixture License.swift's test holds must still be what this key signs.
 assert.equal(text,'ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwMjYtMTAtMDEiLCJ1cGQiOiIyMDI3LTEwLTAxIn0.mnc5ocIp7nZzHWA98jKO4U__jBbRQToHh25-RCdiFh3GMbic-v73TYKSDlItDNCT1A8fawoWkSVgPPcHfacbBA');
});

test('/buy sends the browser to the US$10 Payment Link, and refuses while the link is a placeholder',async()=>{
 const env=fakeEnv(),io=fakeIo();
 const res=await handle(new Request('https://pay.example.com/buy?lang=zh'),env,io);
 assert.equal(res.status,302);assert.equal(res.headers.get('location'),'https://buy.stripe.com/test_pro10');
 assert.equal(io.calls.length,0,'no Stripe call: the Payment Link holds the price');
 assert.deepEqual(PRO_PRICE,{amount:1000,currency:'usd'});
 for(const link of ['https://buy.stripe.com/PAYMENT_LINK_PLACEHOLDER','https://example.com/pay','','https://buy.stripe.com/a/b']){
  env.PAYMENT_LINK=link;const bad=await handle(new Request('https://pay.example.com/buy'),env,io);
  assert.equal(bad.status,500,link);assert.ok(!(await bad.text()).includes('configured'),'the error page keeps the reason to the log');
 }
});

test('only a paid US$10 session for the Pro product issues a licence; another amount, currency or product issues nothing',async()=>{
 assert.ok(proAmount({amount_total:1000,currency:'usd'})&&proAmount({amount_total:1000,currency:'USD'}));
 assert.ok(!proAmount({amount_total:3900,currency:'hkd'})&&!proAmount({amount_total:1900,currency:'usd'})&&!proAmount({amount_total:1000,currency:'eur'})&&!proAmount({currency:'usd'}));
 const cases=[['cs_test_hkd',{amount_total:3900,currency:'hkd'}],['cs_test_19',{amount_total:1900}],['cs_test_eur',{currency:'eur'}],['cs_test_zero',{amount_total:0}],['cs_test_other',{}],['cs_test_mixed',{}],['cs_test_none',{}]];
 const items={cs_test_other:[{price:{product:'prod_else'},quantity:1}],cs_test_mixed:[{price:{product:'prod_pro'}},{price:{product:{id:'prod_else'}}}],cs_test_none:[]};
 const env=fakeEnv(),io=fakeIo({items,sessions:Object.fromEntries(cases.map(([id,over],i)=>[id,paidSession({id,payment_intent:'pi_x'+i,...over})]))});
 for(const [id,over] of cases){
  const i=cases.findIndex(c=>c[0]===id);
  assert.equal((await post(env,io,signedEvent({type:'checkout.session.completed',data:{object:paidSession({id,payment_intent:'pi_x'+i,...over})}}))).status,200,id);
  assert.equal(env.kv.get('session:'+id),undefined,id+' must not issue');assert.equal(env.kv.get('other:'+id),'2026-10-24',id+' is noted');
 }
 assert.equal([...env.kv.keys()].filter(k=>k.startsWith('license:')).length,0);assert.equal(io.mails().length,0);
 const page=await (await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_other'),env,io)).text();
 assert.match(page,/不是 Assetboard Pro/);assert.ok(!page.includes('ASB1.'));
 assert.match(await (await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_hkd'),env,io)).text(),/不是 Assetboard Pro/,'the amount alone already says so');
 // The product id itself must be set: a placeholder issues nothing.
 const unset=fakeEnv();unset.PRO_PRODUCT='prod_PRODUCT_PLACEHOLDER';
 assert.equal(await issue(paidSession(),unset,fakeIo()),null);
 // The Pro product, nested or not, at US$10 issues.
 const nested=fakeEnv(),io2=fakeIo({items:{cs_test_1:[{price:{product:{id:'prod_pro'}},quantity:1}]}});
 assert.ok((await issue(paidSession(),nested,io2))?.id);
});

test('the webhook signature: right, wrong, stale, absent',async()=>{
 const event=signedEvent({type:'ping'});
 assert.ok(await stripeSignatureValid(event.body,event.header,'whsec_test',new Date('2026-10-24T10:02:00Z')));
 assert.ok(!await stripeSignatureValid(event.body,event.header,'whsec_other',new Date('2026-10-24T10:02:00Z')));
 assert.ok(!await stripeSignatureValid(event.body+' ',event.header,'whsec_test',new Date('2026-10-24T10:02:00Z')),'a changed body');
 assert.ok(!await stripeSignatureValid(event.body,event.header,'whsec_test',new Date('2026-10-24T10:06:00Z')),'older than five minutes');
 assert.ok(!await stripeSignatureValid(event.body,null,'whsec_test'));assert.ok(!await stripeSignatureValid(event.body,'t=1,v1=zz','whsec_test'));
 assert.ok(await stripeSignatureValid(event.body,event.header.replace('v1=','v1=deadbeef,v1='),'whsec_test',new Date('2026-10-24T10:02:00Z')),'several v1 values: any may match');
 const env=fakeEnv(),io=fakeIo();
 assert.equal((await post(env,io,event,'t=1,v1=00')).status,400);
});

test('a paid checkout issues one licence, keeps it under every key and mails it; a repeat changes nothing',async()=>{
 const env=fakeEnv(),io=fakeIo({sessions:{cs_test_1:paidSession()}});
 const event=signedEvent({type:'checkout.session.completed',data:{object:paidSession()}});
 const res=await post(env,io,event);
 assert.equal(res.status,200);
 const id=env.kv.get('session:cs_test_1');
 assert.match(id,/^[A-Z2-9]{8}$/);
 const record=JSON.parse(env.kv.get('license:'+id));
 assert.equal(record.iss,'2026-10-24');assert.equal(record.upd,'9999-12-31');assert.deepEqual(record.sessions,['cs_test_1']);assert.equal(record.customer,'cus_1');assert.equal(record.revoked,undefined);
 assert.deepEqual(await verify(record.text,publicKey),{id,plan:'pro',iss:'2026-10-24',upd:'9999-12-31'},'signed with our key, lifetime updates');
 assert.equal(env.kv.get('intent:pi_1'),id);
 assert.equal(record.email.length,64,'the address is kept hashed');assert.ok(!JSON.stringify([...env.kv]).toLowerCase().includes('buyer@'),'the address itself is nowhere');
 assert.deepEqual(JSON.parse(env.kv.get('email:'+record.email)),[id]);
 const mails=io.mails();
 assert.equal(mails.length,1);assert.deepEqual(mails[0].to,['buyer@example.com']);assert.equal(mails[0].subject,'你的 Assetboard Pro 许可证');assert.equal(mails[0].reply_to,'reply@example.com','replies go to the project address');
 const tags=io.calls.filter(c=>/\/v1\/(payment_intents|customers)\//.test(c.url)).map(c=>[c.url.split('/v1/')[1],Object.fromEntries(new URLSearchParams(c.body))]);
 const tagged={'metadata[license_id]':display(id),'metadata[license]':record.text,'metadata[license_status]':'active'};
 assert.deepEqual(tags,[['payment_intents/pi_1',tagged],['customers/cus_1',tagged]],'Stripe is the buyer list');
 assert.ok(record.text.length<=500,'Stripe metadata values hold 500 characters');
 assert.ok(mails[0].text.includes(record.text)&&mails[0].text.includes('assetboard://activate?key='+encodeURIComponent(record.text))&&mails[0].text.includes('终身更新')&&!mails[0].text.includes('9999'),mails[0].text);
 await post(env,io,event);
 assert.equal(io.mails().length,1,'delivered twice, issued once');assert.equal([...env.kv.keys()].filter(k=>k.startsWith('license:')).length,1);
 // Unpaid or other events do nothing.
 await post(env,io,signedEvent({type:'checkout.session.completed',data:{object:paidSession({id:'cs_test_2',payment_status:'unpaid'})}}));
 assert.equal(env.kv.get('session:cs_test_2'),undefined);
 // A refund marks the licence; recovery then skips it.
 await post(env,io,signedEvent({type:'charge.refunded',data:{object:{payment_intent:'pi_1',refunded:true}}}));
 assert.equal(JSON.parse(env.kv.get('license:'+id)).revoked,'2026-10-24');
 // Without a mail key the thanks page is the only delivery.
 const quiet=fakeEnv();delete quiet.MAIL_API_KEY;const io2=fakeIo();
 await post(quiet,io2,signedEvent({type:'checkout.session.completed',data:{object:paidSession({metadata:{plan:'pro',lang:'en'}})}}));
 assert.equal(io2.mails().length,0);assert.ok(quiet.kv.get('session:cs_test_1'));
});

test('a full refund ends the licence, blocks retrieval and is safe to deliver twice; a partial one changes nothing',async()=>{
 const env=fakeEnv(),io=fakeIo({sessions:{cs_test_1:paidSession()}});
 const record=await issue(paidSession(),env,io);
 const current=()=>JSON.parse(env.kv.get('license:'+record.id));
 const refunded=(intent,full=true)=>signedEvent({type:'charge.refunded',data:{object:{payment_intent:intent,refunded:full}}});
 const thanks=sid=>handle(new Request('https://pay.example.com/thanks?session_id='+sid),env,io);
 const recover=()=>handle(new Request('https://pay.example.com/recover',{method:'POST',body:new URLSearchParams({email:'buyer@example.com'})}),env,io);
 assert.equal((await post(env,io,refunded('pi_1',false))).status,200);
 assert.equal(current().revoked,undefined);assert.equal(current().text,record.text);assert.equal(env.kv.has('refund:pi_1'),false);
 await recover();assert.ok(io.mails().at(-1).text.includes(record.text),'a partial refund keeps recovery');
 assert.equal((await post(env,io,refunded('pi_1'))).status,200);
 assert.equal(current().revoked,'2026-10-24');assert.equal(current().text,'');
 for(const path of ['/v1/payment_intents/pi_1','/v1/customers/cus_1']){
  const update=new URLSearchParams(io.calls.filter(c=>c.url.endsWith(path)).at(-1).body);
  assert.equal(update.get('metadata[license_status]'),'refunded',path);assert.equal(update.get('metadata[license]'),'',path);
 }
 assert.equal((await post(env,io,refunded('pi_1'))).status,200);assert.equal(current().revoked,'2026-10-24','a repeat changes nothing');
 const page=await (await thanks('cs_test_1')).text();
 assert.match(page,/已退款/);assert.ok(!page.includes('ASB1.')&&!page.includes('assetboard://activate'));
 const before=io.mails().length;await recover();assert.equal(io.mails().length,before,'a refunded licence is not mailed again');
});

test('every purchase is a new lifetime licence whatever the session carries; a payment refunded first never issues',async()=>{
 const env=fakeEnv(),io=fakeIo();
 const first=await issue(paidSession(),env,io);
 // A session naming an existing licence (client_reference_id, metadata.renew) still buys a separate one.
 const link=await issue(paidSession({id:'cs_link',payment_intent:'pi_link',metadata:{},client_reference_id:first.id,locale:'en'}),env,io);
 const old=await issue(paidSession({id:'cs_renew',payment_intent:'pi_renew',metadata:{plan:'renew',renew:first.id}}),env,io);
 assert.notEqual(link.id,first.id);assert.notEqual(old.id,first.id);
 assert.ok([first,link,old].every(r=>r.upd==='9999-12-31'));
 assert.equal(JSON.parse(env.kv.get('license:'+first.id)).text,first.text,'the first licence is untouched');
 assert.equal(io.mails().at(-2).subject,'Your Assetboard Pro licence','the mail follows a Payment Link session\'s locale');
 assert.deepEqual(JSON.parse(env.kv.get('email:'+first.email)),[first.id,link.id,old.id]);
 await post(env,io,signedEvent({type:'charge.refunded',data:{object:{payment_intent:'pi_early',refunded:true}}}));
 assert.equal(await issue(paidSession({id:'cs_early',payment_intent:'pi_early'}),env,io),null);
 assert.equal(env.kv.get('session:cs_early'),undefined);
});

test('/thanks shows the licence of a paid session, waits briefly for the webhook, and says so when unpaid',async()=>{
 const env=fakeEnv();
 const io=fakeIo({sessions:{cs_test_1:paidSession(),cs_test_9:paidSession({id:'cs_test_9',payment_status:'unpaid'}),cs_test_5:paidSession({id:'cs_test_5',metadata:{plan:'pro',lang:'en'}})}});
 const record=await issue(paidSession(),env,io);
 const res=await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_1'),env,io);
 assert.equal(res.status,200);
 const html=await res.text();
 assert.ok(html.includes('付款成功')&&html.includes(record.text)&&html.includes(display(record.id))&&html.includes('终身更新')&&!html.includes('9999'),html);
 assert.ok(html.includes('href="assetboard://activate?key='+encodeURIComponent(record.text)+'"'),'the activation link');
 assert.ok(html.includes('<html lang="zh-CN"')&&html.includes('noindex')&&!/(src|href)="https?:\/\/(?!example\.com\/)|<link rel="stylesheet|url\(/.test(html),'the page loads nothing external: '+html);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const unpaid=await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_9'),env,io);
 assert.match(await unpaid.text(),/还没收到这笔付款/);
 let waits=0;const slow={...io,wait:async()=>{waits++;}};
 const late=await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_5'),env,slow);
 assert.equal(waits,6);assert.match(await late.text(),/on its way/);
 for(const q of ['','?session_id=nope','?session_id=%7BCHECKOUT_SESSION_ID%7D','?session_id=cs_missing']){
  const res=await handle(new Request('https://pay.example.com/thanks'+q),env,io),html=await res.text();
  assert.equal(res.status,404);assert.ok(html.includes('No order here')&&html.includes('href="/recover?lang=en"')&&html.includes('Download it free'),'no order says where the licence is: '+q);
 }
 const zh=await handle(new Request('https://pay.example.com/thanks',{headers:{'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'}}),env,io);
 assert.ok((await zh.text()).includes('这里没有订单'),'the browser language picks Chinese without ?lang');
 assert.equal((await handle(new Request('https://pay.example.com/thanks?session_id=cs_missing'),env,io)).status,404,'an id Stripe does not know is a missing page');
 const down={...io,fetch:async()=>({ok:false,status:503,json:async()=>({})})};
 assert.equal((await handle(new Request('https://pay.example.com/thanks?session_id=cs_test_1'),env,down)).status,500,'Stripe being down stays the error page');
});

test('/recover answers the same sentence either way, mails what the address bought, and stops at five an hour',async()=>{
 const env=fakeEnv(),io=fakeIo();
 const record=await issue(paidSession(),env,io);
 const ask=(email,ip='203.0.113.9')=>handle(new Request('https://pay.example.com/recover?lang=zh',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','CF-Connecting-IP':ip},body:'email='+encodeURIComponent(email)}),env,io);
 const form=await handle(new Request('https://pay.example.com/recover'),env,io);
 assert.match(await form.text(),/<form method="post"/);
 let res=await ask('buyer@example.com');
 assert.match(await res.text(),/如果这个邮箱买过/);assert.equal(io.mails().length,2);assert.ok(io.mails()[1].text.includes(record.text));
 res=await ask('nobody@example.com');
 assert.match(await res.text(),/如果这个邮箱买过/);assert.equal(io.mails().length,2,'nothing is sent and nothing is revealed');
 res=await ask('not an address');assert.equal(res.status,200);assert.equal(io.mails().length,2);
 for(let i=0;i<4;i++)await ask('buyer@example.com');
 assert.equal(io.mails().length,5,'five sends from one address: '+io.mails().length);
 await ask('buyer@example.com');
 assert.equal(io.mails().length,5,'the sixth in an hour is dropped quietly');
 await ask('buyer@example.com','198.51.100.7');
 assert.equal(io.mails().length,6,'another address has its own count');
 const options=[...env.kv.keys()].filter(k=>k.startsWith('rate:'));assert.equal(options.length,2);
 // Revoked licences are not re-sent.
 const r=JSON.parse(env.kv.get('license:'+record.id));r.revoked='2026-10-25';await env.LICENSES.put('license:'+record.id,JSON.stringify(r));
 await ask('buyer@example.com','192.0.2.1');
 assert.equal(io.mails().length,6);
});

test('the other pages and errors say nothing about anything',async()=>{
 const env=fakeEnv(),io=fakeIo();
 assert.equal((await handle(new Request('https://pay.example.com/'),env,io)).headers.get('location'),'https://example.com/releases');
 assert.match(await (await handle(new Request('https://pay.example.com/cancelled?lang=zh'),env,io)).text(),/没有扣款/);
 assert.equal((await handle(new Request('https://pay.example.com/nothing'),env,io)).status,404);
 assert.equal((await handle(new Request('https://pay.example.com/stripe/webhook'),env,io)).status,404,'GET on the webhook');
 delete env.PAYMENT_LINK;
 const broken=await handle(new Request('https://pay.example.com/buy'),env,io);
 assert.equal(broken.status,500);assert.ok(!(await broken.text()).includes('configured'),'the error page keeps the reason to the log');
});
