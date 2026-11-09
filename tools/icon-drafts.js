// Renders the draft app icons in desktop/icon-drafts/ to 1024 px PNGs, and one comparison sheet: the drafts beside the present
// icon (desktop/icon.svg), masked and shadowed the way the Dock shows them, on a light and a dark Dock at 128, 64 and 32 px.
// Prints each draft's white share: pure white pixels over the whole 1024 px square and inside the Dock mask.
// Drafts only: desktop/icon-1024.png and the build are untouched.
//   NODE_PATH=<playwright>/node_modules node tools/icon-drafts.js <out-dir>
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
// [file, label]; the present icon comes first on the sheet.
const ICONS=[['desktop/icon.svg','现有'],['desktop/icon-drafts/ink-dot.svg','A · 白点'],['desktop/icon-drafts/white-tile.svg','B · 白格'],['desktop/icon-drafts/ink-field.svg','C · 墨蓝底']];
const svgUrl=file=>'data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,file)).toString('base64');

// The Dock shape: a continuous-corner rounded square inset to 824 / 1024 of the tile, as macOS draws a full-bleed icon.
const tile=(file,size)=>`<div class="tile" style="--s:${size}px"><img src="${svgUrl(file)}"></div>`;
const dock=scheme=>`<section class="dock ${scheme}"><h2>${scheme==='light'?'浅色 Dock':'深色 Dock'}</h2><div class="row">${ICONS.map(([file,label])=>
 `<figure>${tile(file,128)}<div class="small">${tile(file,64)}${tile(file,32)}</div><figcaption>${label}</figcaption></figure>`).join('')}</div></section>`;
const sheet=`<!doctype html><meta charset="utf-8"><style>
 body{margin:0;width:1200px;font:500 15px -apple-system,"PingFang SC","Noto Sans CJK SC",system-ui,sans-serif}
 .dock{padding:28px 40px 36px}
 .dock.light{background:#ecebe8;color:#1d1d1f}.dock.dark{background:#1e1e20;color:#f2f2f2}
 h2{margin:0 0 20px;font-size:14px;font-weight:600;opacity:.7}
 .row{display:flex;justify-content:space-between}
 figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:14px;width:250px}
 .small{display:flex;align-items:center;gap:18px}
 .tile{width:var(--s);height:var(--s);display:grid;place-items:center}
 .tile img{width:80.5%;height:80.5%;border-radius:22.5%;display:block;box-shadow:0 calc(var(--s)*.02) calc(var(--s)*.05) rgba(0,0,0,.28)}
 figcaption{font-size:14px}
</style>${dock('light')}${dock('dark')}`;

// Share of pure white pixels (each channel ≥ 250), over the square and inside the rounded-square mask (radius 22.5%).
const whiteShare=url=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{
 const n=1024,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');g.drawImage(img,0,0,n,n);
 const d=g.getImageData(0,0,n,n).data,mask=new Path2D();mask.roundRect(0,0,n,n,n*.225);
 let white=0,inside=0,whiteInside=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4,w=d[i]>=250&&d[i+1]>=250&&d[i+2]>=250,m=g.isPointInPath(mask,x+.5,y+.5);
  white+=w;inside+=m;whiteInside+=w&&m;}
 resolve({square:white/(n*n),mask:whiteInside/inside});};img.onerror=reject;img.src=url;});

(async()=>{
 const out=process.argv[2];
 if(!out){console.error('usage: node tools/icon-drafts.js <out-dir>');process.exit(2);}
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{}),page=await browser.newPage();
 try{
  await page.setViewportSize({width:1024,height:1024});
  for(const [file] of ICONS.slice(1)){
   const name=path.basename(file,'.svg');
   await page.setContent(`<style>body{margin:0}</style><img src="${svgUrl(file)}" width="1024" height="1024" style="display:block">`);
   await page.screenshot({path:path.join(out,`icon2-${name}.png`),omitBackground:true});
   const share=await page.evaluate(whiteShare,svgUrl(file));
   console.log(`${name}: white ${(share.square*100).toFixed(1)}% of the square, ${(share.mask*100).toFixed(1)}% inside the Dock mask`);
  }
  await page.setViewportSize({width:1200,height:600});
  await page.setContent(sheet);
  await page.screenshot({path:path.join(out,'icon2-compare.png'),fullPage:true});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
