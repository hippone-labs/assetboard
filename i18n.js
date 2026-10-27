// Interface language: 简体中文 or English. The Chinese text in the code is the key; I18N.en (filled by i18n/en-*.js and
// pro/web/en.js) gives its English. tr('删除 {n} 项',{n}) fills {name} slots; an English value that is a pair [one, other] picks by n.
// Where one Chinese word needs two English ones, the third argument names the use: tr('项目',null,'nav') reads '项目@nav' first.
// A key with no English stays Chinese, so nothing is ever blank. Only text shown to people goes through tr(): words the code matches
// against (pasted text, mail, OCR, stored values such as cost '未知') stay as they are.
// The language: ?lang= (demo screenshots), else what the Mac app passes (its own setting, else the system's), else this browser's
// choice in 设置, else Chinese. Loaded first, before every script that shows text.
const LANG_KEY='assetboard-lang-v1';
const LANGS={zh:{name:'简体中文',html:'zh-CN',locale:'zh-CN'},en:{name:'English',html:'en',locale:'en-US'}};
const I18N={en:{}};
let appLang=(()=>{
 if(typeof window==='undefined')return 'zh';
 const ok=v=>Object.hasOwn(LANGS,v)?v:'';
 try{const url=ok(new URLSearchParams(location.search).get('lang'));if(url)return url;}catch{}
 const native=window.__ASSETBOARD_NATIVE__;if(native)return ok(native.lang)||'zh';
 try{return ok(localStorage.getItem(LANG_KEY))||'zh';}catch{return 'zh';}
})();
function tr(text,vars,use){
 const dict=I18N[appLang]||{},key=use&&Object.hasOwn(dict,`${text}@${use}`)?`${text}@${use}`:text;
 let out=appLang!=='zh'&&Object.hasOwn(dict,key)?dict[key]:text;
 if(Array.isArray(out))out=out[vars&&Number(vars.n)===1?0:1];
 return vars?String(out).replace(/\{(\w+)\}/g,(m,k)=>Object.hasOwn(vars,k)?String(vars[k]):m):out;
}
// The language's locale for dates and numbers shown to people.
function trLocale(){return LANGS[appLang].locale;}
// Static text in index.html: leaf text and the attributes people read, translated once before the board is drawn.
function trDom(root){
 if(appLang==='zh'||!root)return;
 const attrs=['title','aria-label','placeholder'];
 for(const el of root.querySelectorAll('*')){
  for(const a of attrs)if(el.hasAttribute(a)){const v=el.getAttribute(a);if(Object.hasOwn(I18N[appLang],v))el.setAttribute(a,tr(v));}
  for(const node of el.childNodes)if(node.nodeType===3){const v=node.nodeValue.trim();if(v&&Object.hasOwn(I18N[appLang],v))node.nodeValue=node.nodeValue.replace(v,tr(v));}
 }
}
if(typeof window!=='undefined'){
 document.documentElement.lang=LANGS[appLang].html;
 window.addEventListener('DOMContentLoaded',()=>{trDom(document.body);document.title=tr(document.title);});
}
if(typeof module!=='undefined')module.exports={tr,trLocale,I18N,LANGS,useLang(lang){appLang=lang;}};
