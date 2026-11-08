// Turns the site screenshots (PNG, from tools/site-screenshots.sh) into the WebP files the site serves, with the browser Playwright
// brings: a canvas encodes them, so the runner needs no image tools. Each image must be the size the site's pages declare.
//   NODE_PATH=<playwright>/node_modules node tools/site-screenshots-webp.js <png-dir> <out-dir>
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const WIDTH=1686,HEIGHT=1050,QUALITY=0.8;
// The site's feature rows show only the part of the window they describe, at twice its size in window points (the 2x snapshot's
// own pixels), so the reader sees the feature rather than the whole board. [x, y, width, height] in points of the 1686x1050
// window; both languages share the layout. The hero and the view tabs keep the whole window at 1686x1050. When a crop changes,
// change the width and height the site's pages declare for it (twice these).
const CROPS={
 upcoming:[256,88,1040,640],   // 待确认扣款 and the bands down to 30 天内
  cost:[516,140,654,772],       // the 费用 window
 project:[256,44,1040,680],    // the project's total, 关停清单 and its records
 add:[508,316,670,420],        // the 添加资产 window
 live:[256,92,1040,500],       // the 实时 figure and the server group with its readings
 sleep:[1300,96,376,440],      // the inspector: 休眠, 保活 and 平台状态
};
const cropOf=file=>CROPS[file.replace(/^app-/,'').replace(/-(dark|light)-(zh|en)\.png$/,'')];

(async()=>{
 const [from,to]=process.argv.slice(2);
 if(!from||!to){console.error('usage: node tools/site-screenshots-webp.js <png-dir> <out-dir>');process.exit(2);}
 const files=fs.readdirSync(from).filter(f=>/^app-[a-z-]+-(zh|en)\.png$/.test(f)).sort();
 if(files.length!==24)throw new Error(`expected 24 screenshots in ${from}, found ${files.length}`);
 fs.mkdirSync(to,{recursive:true});
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{}),page=await browser.newPage();
 try{
  for(const file of files){
   const png='data:image/png;base64,'+fs.readFileSync(path.join(from,file)).toString('base64');
   // A 2x snapshot is scaled down to the size the pages declare.
   const out=await page.evaluate(async([src,w,h,q,crop])=>{
    const img=new Image();img.src=src;await img.decode();
    if(Math.abs(img.naturalWidth/img.naturalHeight-w/h)>0.01)return {error:`${img.naturalWidth}x${img.naturalHeight} is not ${w}x${h}`};
    const k=img.naturalWidth/w,[x,y,cw,ch]=crop||[0,0,w,h],ow=crop?cw*2:w,oh=crop?ch*2:h;
    const c=document.createElement('canvas');c.width=ow;c.height=oh;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,x*k,y*k,cw*k,ch*k,0,0,ow,oh);
    return {url:c.toDataURL('image/webp',q),from:`${img.naturalWidth}x${img.naturalHeight}`,size:`${ow}x${oh}`};
   },[png,WIDTH,HEIGHT,QUALITY,cropOf(file)||null]);
   if(out.error)throw new Error(`${file}: ${out.error}`);
   if(!out.url.startsWith('data:image/webp'))throw new Error('this browser cannot write WebP');
   const name=file.replace(/\.png$/,'.webp'),bytes=Buffer.from(out.url.split(',')[1],'base64');
   fs.writeFileSync(path.join(to,name),bytes);
   console.log(`${name}: ${out.from} → ${out.size}, ${Math.round(bytes.length/1024)} KB`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exit(1);});
