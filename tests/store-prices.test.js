// tools/store-prices.js: reading Apple's product page into plans, and the file the app accepts. Made-up pages; no network.
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../tools/store-prices.js');
const page=(title,pairs)=>`<html><script type="application/json" id="serialized-server-data">${JSON.stringify({data:[{data:{shelfMapping:{information:{items:[{title:'Seller',items:[]},{title,items:pairs.map(([a,b])=>({$kind:'textPair',leadingText:a,trailingText:b}))}]}}}}]})}</script></html>`;

test('store prices: an amount as each storefront writes it',()=>{
 assert.equal(S.parsePrice('$124.99'),124.99);assert.equal(S.parsePrice('₺5.299,99',true),5299.99);assert.equal(S.parsePrice('Rs 4,900.00'),4900);
 assert.equal(S.parsePrice('¥3,000'),3000);assert.equal(S.parsePrice('R$ 109,90',true),109.9);assert.equal(S.parsePrice('₦144,900.00'),144900);
 for(const bad of ['','Free','$1.2.3',null])assert.equal(S.parsePrice(bad),null,String(bad));
 // Three digits after a decimal comma is not a price in a comma storefront.
 assert.equal(S.parsePrice('1,999',true),null);
 assert.equal(S.parsePrice('$0.00'),null);
});

test('store prices: the in-app purchases of a page become plans, monthly and yearly',()=>{
 const us=S.pageItems(page('In-App Purchases',[['Claude Pro - Monthly','$20.00'],['Claude Max - Monthly','$124.99'],['Usage Credits (20)','$20.00'],['Claude Pro - Annual','$214.99']]),'In-App Purchases');
 assert.equal(us.length,4);
 assert.deepEqual(S.storePlans(us,S.APPS.claude,S.STORES.us),{'Claude Pro':{monthly:20,yearly:214.99},'Claude Max':{monthly:124.99}});
 // The second "ChatGPT Plus" every storefront lists at the Pro 200 price is not the plan; credits and unknown names are left out.
 const tr=S.pageItems(page('In-App Purchases',[['ChatGPT Plus','₺999,99'],['ChatGPT Pro 200','₺9.999,99'],['ChatGPT Plus','₺9.999,99'],['100 Credits','₺199,99']]),'In-App Purchases');
 assert.deepEqual(S.storePlans(tr,S.APPS.chatgpt,S.STORES.tr),{'ChatGPT Plus':{monthly:999.99},'ChatGPT Pro 200':{monthly:9999.99}});
 // A yearly price alone is no plan; a page without the list, or that is not a product page, gives nothing.
 assert.deepEqual(S.storePlans([['Claude Pro - Annual','$214.99']],S.APPS.claude,S.STORES.us),{});
 assert.deepEqual(S.pageItems(page('Something else',[['Claude Pro - Monthly','$20.00']]),'In-App Purchases'),[]);
 assert.equal(S.pageItems('<html></html>','In-App Purchases'),null);assert.equal(S.pageItems('<script id="serialized-server-data">{broken</script>','In-App Purchases'),null);
});

test('store prices: the file the app accepts',()=>{
 const good=()=>({version:1,checked:'2026-11-23',rates:{TRY:{perUSD:50.5,date:'2026-11-23',source:'https://api.frankfurter.dev/v1/latest?base=USD'}},apps:{claude:{appId:'6473753684',stores:{
  us:{currency:'USD',source:'https://apps.apple.com/us/app/id6473753684',plans:{'Claude Pro':{monthly:20,yearly:214.99}}},
  tr:{currency:'TRY',source:'https://apps.apple.com/tr/app/id6473753684',plans:{'Claude Pro':{monthly:999.99}}}}}}});
 assert.deepEqual(S.validFile(good()),[]);
 const bad=(change,what)=>{const f=good();change(f);assert.ok(S.validFile(f).length,what);};
 bad(f=>{f.version=2;},'another version');bad(f=>{delete f.rates.TRY;},'a currency without a rate');bad(f=>{f.apps.claude.stores.tr.source='https://apps.example/tr';},'not Apple\'s page');
 bad(f=>{delete f.apps.claude.stores.us;},'no US store');bad(f=>{f.apps.claude.stores.us.plans['Claude Pro'].yearly=10;},'a year cheaper than a month');
 bad(f=>{f.apps.claude.stores.us.plans={};},'an empty storefront');bad(f=>{f.apps.other=f.apps.claude;},'an app the table does not have');
 assert.ok(S.validFile(null).length&&S.validFile({}).length);
});
