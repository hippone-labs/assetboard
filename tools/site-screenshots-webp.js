// Turns the site screenshots (PNG, from tools/site-screenshots.sh) into the WebP files the site serves, with the browser Playwright
// brings: a canvas encodes them, so the runner needs no image tools. Each image must be the size the site's pages declare.
//   NODE_PATH=<playwright>/node_modules node tools/site-screenshots-webp.js <png-dir> <out-dir>
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const WIDTH=1686,HEIGHT=1050,QUALITY=0.8;

(async()=>{
 const [from,to]=process.argv.slice(2);
 if(!from||!to){console.error('usage: node tools/site-screenshots-webp.js <png-dir> <out-dir>');process.exit(2);}
 const files=fs.readdirSync(from).filter(f=>/^app-[a-z-]+-(zh|en)\.png$/.test(f)).sort();
 if(files.length!==22)throw new Error(`expected 22 screenshots in ${from}, found ${files.length}`);
 fs.mkdirSync(to,{recursive:true});
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{}),page=await browser.newPage();
 try{
  for(const file of files){
   const png='data:image/png;base64,'+fs.readFileSync(path.join(from,file)).toString('base64');
   // A 2x snapshot is scaled down to the size the pages declare.
   const out=await page.evaluate(async([src,w,h,q])=>{
    const img=new Image();img.src=src;await img.decode();
    if(Math.abs(img.naturalWidth/img.naturalHeight-w/h)>0.01)return {error:`${img.naturalWidth}x${img.naturalHeight} is not ${w}x${h}`};
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,0,0,w,h);
    return {url:c.toDataURL('image/webp',q),from:`${img.naturalWidth}x${img.naturalHeight}`};
   },[png,WIDTH,HEIGHT,QUALITY]);
   if(out.error)throw new Error(`${file}: ${out.error}`);
   if(!out.url.startsWith('data:image/webp'))throw new Error('this browser cannot write WebP');
   const name=file.replace(/\.png$/,'.webp'),bytes=Buffer.from(out.url.split(',')[1],'base64');
   fs.writeFileSync(path.join(to,name),bytes);
   console.log(`${name}: ${out.from} → ${WIDTH}x${HEIGHT}, ${Math.round(bytes.length/1024)} KB`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exit(1);});
