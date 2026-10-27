// Themes (task 08). A theme is a handful of semantic values: an accent, optionally its own accent for dark, and how much of it
// tints the surfaces (0 neutral … 1 tinted). Everything else is derived in OKLCH: near-neutral canvas, cards, ink and muted text,
// and the accent's lightness, which is searched so that buttons and accent text meet WCAG AA (4.5:1, with a little margin) in
// light and dark whatever the input. The accent keeps its hue and as much chroma as fits. Status colours (overdue red, due amber,
// material.css) are fixed; an accent within STATUS_GAP of their hue is muted, so a red or amber flag never reads as decoration.
// The choice is a per-viewer preference (localStorage; the Mac app also keeps it in its defaults), never part of the board.
const THEME_DEFAULT='pine',THEME_KEY='assetboard-theme-v1',STATUS_GAP=25,STATUS_MUTED_CHROMA=.05,AA=4.6;
// [id, name, accent, tint, temperament]. Spread round the wheel and from vivid to quiet; none sits on the status hues (~30°, ~65°).
const themePresets=[
 ['pine',tr('青松'),'#127a6a',.55,tr('冷 · 适中')],
 ['blue',tr('晴蓝'),'#0a6fe8',.45,tr('冷 · 饱和')],
 ['indigo',tr('靛紫'),'#6a4fd8',.6,tr('冷 · 饱和')],
 ['plum',tr('梅子'),'#b3307a',.6,tr('暖 · 饱和')],
 ['mustard',tr('芥黄'),'#928a07',.5,tr('暖 · 饱和')],
 ['moss',tr('苔绿'),'#5f7f3c',.35,tr('暖 · 克制')],
 ['oat',tr('燕麦'),'#8c7b66',.45,tr('中性暖 · 克制')],
 ['graphite',tr('石墨'),'#5d6572',.15,tr('中性 · 克制')]
];
// Colours chosen before task 08 map to their nearest new theme.
const LEGACY_THEMES={'#3a8f7d':'pine','#5476a5':'blue','#8066a9':'indigo','#b16c86':'plum','#a17b4e':'oat','#737b85':'graphite','#6c8b76':'moss'};
const THEME_FIELDS=['name','accent','accentDark','tint'];
// The one switch if themes ever become Pro: return proLoaded() here, and everyone else gets the default.
function themeChoicesOpen(){return true;}
let appliedTheme='',appliedScheme='',themePreview=false,themePref=null,systemAccentHex='';
const schemeQuery=window.matchMedia?.('(prefers-color-scheme: dark)');
function currentScheme(){return schemeQuery?.matches?'dark':'light';}

const HEX=/^#[0-9a-f]{6}$/i;
function themeOklch(input){
 const rgb=Array.isArray(input)?input:[1,3,5].map(i=>parseInt(input.slice(i,i+2),16));
 const [r,g,b]=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 const a=1.9779984951*l-2.428592205*m+.4505937099*s,bb=.0259040371*l+.7827717662*m-.808675766*s;
 return {l:.2104542553*l+.793617785*m-.0040720468*s,c:Math.hypot(a,bb),h:(Math.atan2(bb,a)*180/Math.PI+360)%360};
}
function oklchRgb(lightness,chroma,hue){
 const h=hue*Math.PI/180;let linear;
 for(let attempt=0;attempt<24;attempt++){
  const aa=Math.cos(h)*chroma,bbb=Math.sin(h)*chroma;
  const ll=(lightness+.3963377774*aa+.2158037573*bbb)**3,mm=(lightness-.1055613458*aa-.0638541728*bbb)**3,ss=(lightness-.0894841775*aa-1.291485548*bbb)**3;
  linear=[4.0767416621*ll-3.3077115913*mm+.2309699292*ss,-1.2684380046*ll+2.6097574011*mm-.3413193965*ss,-.0041960863*ll-.7034186147*mm+1.707614701*ss];
  if(linear.every(v=>v>=0&&v<=1))break;
  chroma*=.8;
 }
 return linear.map(v=>{v=Math.max(0,Math.min(1,v));return Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));});
}
function themeContrast(x,y){const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const a=lum(x),b=lum(y);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
const hueGap=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};
// The status hues, from the light and dark overdue and due colours in material.css.
const STATUS_HUES=['#c8261a','#b42318','#ff6b5b','#b36b00','#8a5300','#f0b35c'].map(hex=>themeOklch(hex).h);
function nearStatus(hue){return STATUS_HUES.some(h=>hueGap(h,hue)<STATUS_GAP);}

// Checks a custom theme (an object or its JSON text). Anything off is refused with a reason; nothing half-valid is kept.
function checkTheme(raw){
 let v=raw;
 if(typeof raw==='string'){if(raw.length>2000)return {ok:false,error:tr('主题太长（最多 2000 字）')};try{v=JSON.parse(raw);}catch{return {ok:false,error:tr('不是有效的 JSON')};}}
 if(!v||typeof v!=='object'||Array.isArray(v))return {ok:false,error:tr('主题需要是一个 JSON 对象')};
 const unknown=Object.keys(v).filter(k=>!THEME_FIELDS.includes(k));
 if(unknown.length)return {ok:false,error:tr('不认识的字段：{fields}；可用：{known}',{fields:unknown.slice(0,4).map(k=>String(k).slice(0,20)).join(tr('、')),known:THEME_FIELDS.join(tr('、'))})};
 if(typeof v.accent!=='string'||!HEX.test(v.accent))return {ok:false,error:tr('accent 需要是 #rrggbb 形式的颜色')};
 if('accentDark' in v&&(typeof v.accentDark!=='string'||!HEX.test(v.accentDark)))return {ok:false,error:tr('accentDark 需要是 #rrggbb 形式的颜色')};
 if('tint' in v&&!(typeof v.tint==='number'&&v.tint>=0&&v.tint<=1))return {ok:false,error:tr('tint 需要是 0 到 1 之间的数字')};
 if('name' in v&&!(typeof v.name==='string'&&v.name.trim()&&v.name.length<=20))return {ok:false,error:tr('name 需要是 1 到 20 个字')};
 return {ok:true,theme:{name:v.name?.trim()||'自定义',accent:v.accent.toLowerCase(),...(v.accentDark?{accentDark:v.accentDark.toLowerCase()}:{}),tint:v.tint??.5}};
}
function presetTheme(id){const p=themePresets.find(x=>x[0]===id);return p&&{name:p[1],accent:p[2],tint:p[3]};}

// theme: a preset id, a custom theme object, or (as before task 08) a bare #rrggbb. Anything invalid gives the default.
function themePalette(theme,scheme='light'){
 const t=typeof theme==='string'?presetTheme(theme)||(HEX.test(theme)?{accent:theme.toLowerCase(),tint:.5}:presetTheme(THEME_DEFAULT)):checkTheme(theme||{}).theme||presetTheme(THEME_DEFAULT);
 const src=themeOklch(scheme==='dark'&&t.accentDark||t.accent),h=src.h;
 let c=Math.min(src.c,.17);if(nearStatus(h))c=Math.min(c,STATUS_MUTED_CHROMA);
 const s=Math.min(src.c,.10)*t.tint*2,rgb=(l,ch)=>oklchRgb(l,ch,h);
 const base=scheme==='dark'
  ?{canvas:rgb(.175,s*.06),category:rgb(.205,s*.07),card:rgb(.245,s*.07),ink:rgb(.94,s*.03),muted:rgb(.74,s*.05)}
  :{canvas:rgb(.962,s*.035),category:rgb(.976,s*.025),card:rgb(.997,s*.015),ink:rgb(.22,s*.10),muted:rgb(.46,s*.10)};
 // The accent's lightness: light mode takes the lightest that still holds white button text and accent text on every
 // surface; dark mode the darkest that holds dark button text (the canvas) and accent text on cards.
 // Accent text also sits on accent-tinted rows (selected, current: up to 20% in material.css), so those count too.
 const tinted=(p,alpha)=>[base.canvas,base.category,base.card].flatMap(bg=>[bg,bg.map((v,i)=>v*(1-alpha)+p[i]*alpha)]);
 let primary;
 if(scheme==='dark'){for(let l=.72;l<=.96&&!primary;l+=.01){const p=rgb(l,c);if(themeContrast(base.canvas,p)>=AA&&tinted(p,.2).every(bg=>themeContrast(p,bg)>=AA))primary=p;}primary=primary||rgb(.9,0);}
 else{for(let l=.72;l>=.2&&!primary;l-=.01){const p=rgb(l,c);if([[255,255,255],...tinted(p,.2)].every(bg=>themeContrast(bg,p)>=AA))primary=p;}primary=primary||rgb(.3,0);}
 return {seed:t.accent,scheme,...base,primary,name:t.name||''};
}

// The preference: {id} for a preset or 'system', {id:'custom',custom:{…}} for a custom theme. Unreadable values are dropped.
function readThemePref(){
 let raw=null;try{raw=localStorage.getItem(THEME_KEY);}catch{}
 if(raw==null)raw=window.__ASSETBOARD_NATIVE__?.themePref??null;
 try{const v=JSON.parse(raw);if(v&&(presetTheme(v.id)||v.id==='system'))return {id:v.id};if(v?.id==='custom'&&checkTheme(v.custom).ok)return {id:'custom',custom:checkTheme(v.custom).theme};}catch{}
 return null;
}
function writeThemePref(pref){
 themePref=pref;const json=JSON.stringify(pref);
 try{localStorage.setItem(THEME_KEY,json);}catch{}
 if(window.__ASSETBOARD_NATIVE__)window.webkit.messageHandlers.assetboard.postMessage({action:'themePref',value:json});
}
// The system accent: the Mac app passes NSColor.controlAccentColor (and its changes); a browser that knows the CSS AccentColor
// keyword gives that; otherwise 晴蓝.
function browserAccent(){
 if(!document.body||!window.CSS?.supports?.('color','AccentColor'))return '';
 const el=document.createElement('i');el.style.color='AccentColor';document.body.append(el);const m=getComputedStyle(el).color.match(/\d+(\.\d+)?/g);el.remove();
 return m&&m.length>=3?'#'+m.slice(0,3).map(n=>Math.round(+n).toString(16).padStart(2,'0')).join(''):'';
}
function systemAccent(){const native=window.__ASSETBOARD_NATIVE__?.systemAccent;return HEX.test(systemAccentHex)?systemAccentHex:HEX.test(native||'')?native:browserAccent()||presetTheme('blue').accent;}
window.assetboardSystemAccent=hex=>{if(typeof hex!=='string'||!HEX.test(hex))return;systemAccentHex=hex.toLowerCase();if(themePref?.id==='system'&&!themePreview)applyBoardTheme();};
function themeFor(pref){
 if(!themeChoicesOpen())return presetTheme(THEME_DEFAULT);
 if(pref?.id==='system')return {name:tr('跟随系统'),accent:systemAccent(),tint:.45};
 if(pref?.id==='custom')return pref.custom;
 if(presetTheme(pref?.id))return presetTheme(pref.id);
 const legacy=legacyPref();
 return legacy?themeFor(legacy):presetTheme(THEME_DEFAULT);
}
// A colour kept in the board by an earlier version (state.theme) still counts until a theme is chosen here.
function legacyPref(){
 const legacy=typeof state!=='undefined'&&typeof state.theme==='string'?state.theme.toLowerCase():'';
 return LEGACY_THEMES[legacy]?{id:LEGACY_THEMES[legacy]}:HEX.test(legacy)?{id:'custom',custom:{name:'自定义',accent:legacy,tint:.5}}:null;
}
function applyBoardTheme(theme=themeFor(themePref)){
 const scheme=currentScheme(),p=themePalette(theme,scheme),key=JSON.stringify(theme)+scheme;if(appliedTheme===key&&appliedScheme===scheme)return;appliedTheme=key;appliedScheme=scheme;
 document.documentElement.dataset.scheme=scheme;
 for(const role of ['canvas','category','card','ink','muted','primary'])document.documentElement.style.setProperty('--tone-'+role,p[role].join(','));
 if(window.__ASSETBOARD_NATIVE__)window.webkit.messageHandlers.assetboard.postMessage({action:'themeColor',rgb:p.canvas});
}

function themeDialog(){
 themePreview=true;
 let pending=themePref||legacyPref()||{id:THEME_DEFAULT};
 const chip=theme=>['light','dark'].map(s=>`rgb(${themePalette(theme,s).primary.join(',')})`);
 const swatch=(id,name,mood,theme)=>{const [l,d]=chip(theme);return `<button class="theme-swatch" data-theme-id="${id}" aria-pressed="false" style="--swatch:${l};--swatch-dark:${d}"><i></i><span><b>${name}</b><small>${mood}</small></span></button>`;};
 const open=themeChoicesOpen(),current=themeFor(themePref);
 modal(tr('主题'),`<div class="theme-options">${(open?themePresets:themePresets.slice(0,1)).map(([id,name,,,mood])=>swatch(id,name,mood,presetTheme(id))).join('')}${open?swatch('system',tr('跟随系统'),tr('系统强调色'),{accent:systemAccent(),tint:.45}):''}</div>
  ${open?`<div class="theme-custom"><label>${tr('自定义强调色')}<input id="theme-color" type="color" value="${current.accent}"></label></div>
  <details class="theme-json"><summary>${tr('粘贴主题 JSON')}</summary><textarea id="theme-json" rows="3" maxlength="2000" spellcheck="false" aria-label="${tr('主题 JSON')}" placeholder='{"name":"${tr('我的主题')}","accent":"#0a6fe8","accentDark":"#5ea4ff","tint":0.5}'></textarea><div class="theme-json-row"><button class="button" id="theme-json-apply" type="button">${tr('预览')}</button><span class="form-note" id="theme-json-status" role="status"></span></div></details>`:''}
  <p class="form-note">${tr('强调色用于按钮、选中和链接；底色跟随系统的浅色或深色。明度会自动调到文字对比度达标（WCAG AA），到期红、橙色保持不变。主题只存在这台设备上。')}</p><button class="button primary" id="save-theme">${tr('使用这个主题')}</button>`);
 const mark=()=>document.querySelectorAll('[data-theme-id]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.themeId===pending.id)));
 const preview=next=>{pending=next;applyBoardTheme(themeFor(next));mark();};
 mark();
 document.querySelectorAll('[data-theme-id]').forEach(el=>el.onclick=()=>preview({id:el.dataset.themeId}));
 const picker=document.querySelector('#theme-color');
 if(picker)picker.oninput=()=>preview({id:'custom',custom:{name:'自定义',accent:picker.value.toLowerCase(),tint:.5}});
 const apply=document.querySelector('#theme-json-apply');
 if(apply)apply.onclick=()=>{const status=document.querySelector('#theme-json-status'),checked=checkTheme(document.querySelector('#theme-json').value.trim());
  status.classList.toggle('bad',!checked.ok);
  if(!checked.ok){status.textContent=checked.error;return;}
  status.textContent=tr('已预览「{name}」',{name:checked.theme.name==='自定义'?tr('自定义'):checked.theme.name});picker.value=checked.theme.accent;preview({id:'custom',custom:checked.theme});};
 document.querySelector('#save-theme').onclick=()=>{writeThemePref(pending);themePreview=false;document.querySelector('#modal').close();applyBoardTheme();};
}
// Read once everything above exists (checkTheme needs HEX, declared below the state).
themePref=readThemePref();
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.id='theme';button.className='button icon-only';button.onclick=themeDialog;(document.querySelector('#inbox-button')||document.querySelector('#add-block')).after(button);if(typeof setIconButton==='function'){setIconButton(button,'palette',tr('主题'));}else{button.textContent=tr('主题');button.title=tr('主题');}
 document.querySelector('#modal').addEventListener('close',()=>{if(themePreview){themePreview=false;applyBoardTheme();}});
 applyBoardTheme();
 schemeQuery?.addEventListener?.('change',()=>applyBoardTheme());
});
