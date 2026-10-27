// The English dictionary against the code: every tr('…') key with Chinese in it has English, the English carries the same {slots}
// and no Chinese, no tr() is handed a template with ${…} (its key would never match), and index.html's static text is covered.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const {tr,I18N,useLang}=require('../i18n.js');

const dictFiles=[...fs.readdirSync(path.join(root,'i18n')).filter(f=>/^en-.*\.js$/.test(f)).map(f=>path.join('i18n',f)),
 ...(fs.existsSync(path.join(root,'pro/web/en.js'))?['pro/web/en.js']:[])];
const seen=new Map();
for(const file of dictFiles){
 const part={};new Function('I18N',fs.readFileSync(path.join(root,file),'utf8'))({en:part});
 for(const [k,v] of Object.entries(part)){
  if(seen.has(k)&&JSON.stringify(seen.get(k).v)!==JSON.stringify(v))assert.fail(`${JSON.stringify(k)} has two translations: ${file} and ${seen.get(k).file}`);
  seen.set(k,{v,file});I18N.en[k]=v;
 }
}
const sources=['app.js','asset-data.js','money-view.js','panorama-view.js','panorama.js','demo-data.js','features.js','theme.js','pro-slots.js',
 ...fs.readdirSync(path.join(root,'pro/web')).filter(f=>f.endsWith('.js')&&f!=='en.js').map(f=>'pro/web/'+f)].filter(f=>fs.existsSync(path.join(root,f)));
const cjk=/[㐀-鿿＀-￯　-〿]/;
// The first argument of every tr( call that is a plain literal.
function calls(src){
 const out=[];const re=/\btr\(\s*(['"`])/g;let m;
 while((m=re.exec(src))){
  const q=m[1];let i=re.lastIndex,s='';
  for(;i<src.length&&src[i]!==q;i++){if(src[i]==='\\'){s+=src[i]+src[i+1];i++;}else s+=src[i];}
  out.push({quote:q,raw:s,line:src.slice(0,m.index).split('\n').length});
 }
 return out;
}
const unescape=(raw,q)=>q==='`'?raw.replace(/\\`/g,'`').replace(/\\\\/g,'\\'):JSON.parse('"'+raw.replace(/\\'/g,"'").replace(/"/g,'\\"')+'"');

test('every tr() key with Chinese has English; no template with ${} is used as a key',()=>{
 const missing=[],templated=[];
 for(const file of sources){
  for(const c of calls(fs.readFileSync(path.join(root,file),'utf8'))){
   if(c.quote==='`'&&c.raw.includes('${')){templated.push(`${file}:${c.line} ${c.raw.slice(0,60)}`);continue;}
   const key=unescape(c.raw,c.quote);
   if(cjk.test(key)&&!Object.hasOwn(I18N.en,key))missing.push(`${file}:${c.line} ${key}`);
  }
 }
 assert.deepEqual(templated,[],'tr() needs a fixed key with {slots}, not ${}');
 assert.deepEqual(missing,[],'keys without English');
});

test('English has the same {slots} as the Chinese and no Chinese of its own',()=>{
 const slots=s=>[...String(s).matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join();
 const bad=[];
 for(const [k,v] of Object.entries(I18N.en)){
  for(const one of Array.isArray(v)?v:[v]){
   if(typeof one!=='string'){bad.push(`${k}: not text`);continue;}
   if(cjk.test(one))bad.push(`${k} → ${one}: Chinese left in the English`);
   // A plural pair may drop {n} in the singular ("a day"), never add a slot.
   const want=slots(k),got=slots(one);
   if(got!==want&&!(Array.isArray(v)&&want.split(',').filter(x=>x!=='n').join()===got.split(',').filter(x=>x!=='n').join()))bad.push(`${k} → ${one}: slots ${want} vs ${got}`);
  }
 }
 assert.deepEqual(bad,[]);
});

test('index.html: every Chinese text and readable attribute has English',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
 const found=new Set();
 for(const m of html.matchAll(/(?:title|aria-label|placeholder)="([^"]*)"/g))if(cjk.test(m[1]))found.add(m[1]);
 for(const m of html.matchAll(/>([^<>]+)</g)){const v=m[1].trim();if(cjk.test(v))found.add(v);}
 found.add(html.match(/<title>([^<]*)<\/title>/)[1]);
 assert.deepEqual([...found].filter(v=>!Object.hasOwn(I18N.en,v)),[]);
});

test('tr: Chinese stays as it is; English fills slots and picks the plural',()=>{
 I18N.en['__t {n} 天']=['{n} day','{n} days'];
 assert.equal(tr('__t {n} 天',{n:3}),'__t 3 天');
 useLang('en');
 try{
  assert.equal(tr('__t {n} 天',{n:1}),'1 day');assert.equal(tr('__t {n} 天',{n:2}),'2 days');
  assert.equal(tr('没有英文的句子'),'没有英文的句子');
  assert.equal(tr('全部资产'),'All assets');
 }finally{useLang('zh');delete I18N.en['__t {n} 天'];}
});
