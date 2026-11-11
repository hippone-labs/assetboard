// Draws the frames 冰箱贴's figures act with when the detail opens and closes (material.css, .scene-figure), from the first frame of
// each figure's GIF in art/fridge/, in its own pixels and colours, and writes the stills the figures hold under less motion.
//
//   node tools/fridge-frames.js        writes art/fridge/<figure>-act.png, <figure>-act@2x.png, <figure>.png and <figure>@2x.png
//
// A strip of ACT_FRAMES frames, each FIGURE_PAD pixels wider than the figure, the figure standing at its left:
//   0 idle   1 reach (leans to the card, an arm out)   2, 3 pull (leans back, the arm out longer)   4, 5 push (leans in, the arm bent)
//   6–9 warp: the figure goes to pixel dust in four steps (the dust rises), the last only a few specks; played backwards it appears.
// The @2x strip is drawn from the @2x GIF at two pixels a step, so a figure with its own @2x drawing (the hedgehog) keeps it.
// Needs Playwright with Chromium (as tools/browser-tests.js), which decodes the GIFs.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const {chromium}=require('playwright');
const dir=path.join(__dirname,'..','art','fridge');
const ACT_FRAMES=10,FIGURE_PAD=8;
// Where each figure's arm comes out (its row, in 1x pixels), and the colours of its sleeve, hand and outline, all taken from the figure.
const FIGURES={
 chef:{arm:31,sleeve:'#faf9f9',hand:'#facaa0',line:'#29170d'},
 engineer:{arm:35,sleeve:'#5a5d68',hand:'#f6c38e',line:'#020407'},
 hedgehog:{arm:36,sleeve:'#f4d8aa',hand:'#fae0b4',line:'#754f2b'},
 cat:{arm:24,sleeve:'#f1850e',hand:'#fde9c8',line:'#1b0a01'}
};
const DUST=['#ffffff','#fff3c4'];

const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const hash=(x,y,s=0)=>{let n=(x*374761393+y*668265263+s*2246822519)>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;return ((n^(n>>>16))>>>0)/4294967296;};

function frames({w,h,d},spec,u){
 const W=w+FIGURE_PAD*u,blank=()=>new Uint8ClampedArray(W*h*4);
 const get=(src,x,y)=>x<0||y<0||x>=w||y>=h?null:src.subarray((y*w+x)*4,(y*w+x)*4+4);
 const put=(out,x,y,c,a=255)=>{if(x<0||y<0||x>=W||y>=h)return;const i=(y*W+x)*4;out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=a;};
 const block=(out,x,y,c)=>{for(let j=0;j<u;j++)for(let i=0;i<u;i++)put(out,x*u+i,y*u+j,c);};
 // the figure with its upper body leaning dx pixels (the top 55% by dx, the next 20% by half of it)
 const lean=dx=>{const out=blank(),top=Math.round(h/u*.55),mid=Math.round(h/u*.75);
  for(let y=0;y<h;y++){const row=Math.floor(y/u),s=(row<top?dx:row<mid?Math.trunc(dx/2):0)*u;for(let x=0;x<w;x++){const c=get(d,x,y);if(c&&c[3]>=128)put(out,x+s,y,c);}}
  return out;};
 const edge=(out,row)=>{let e=0;for(let y=(row-1)*u;y<(row+3)*u;y++)for(let x=0;x<W;x++)if(y>=0&&y<h&&out[(y*W+x)*4+3])e=Math.max(e,x);return Math.floor(e/u);};
 // an arm of two rows from the body's right edge, `long` pixels out, the hand at its end, outlined like the figure
 const arm=(out,long,lift=0)=>{const row=spec.arm-lift,from=edge(out,spec.arm)-1,to=from+long,[s,hd,l]=[spec.sleeve,spec.hand,spec.line].map(hex);
  for(let x=from;x<=to+1;x++){block(out,x,row-1,l);block(out,x,row+2,l);}
  for(let x=from;x<=to;x++){const c=x>=to-1?hd:s;block(out,x,row,c);block(out,x,row+1,c);}
  block(out,to+1,row,l);block(out,to+1,row+1,l);return out;};
 // pixel dust: a share of the figure's pixels gone, some of them as specks risen `rise` pixels
 const warp=(keep,rise)=>{const out=blank(),cols=Math.ceil(w/u),rows=Math.ceil(h/u);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const px=get(d,c*u,r*u);if(!px||px[3]<128)continue;const v=hash(c,r);
   if(v<keep){for(let j=0;j<u;j++)for(let i=0;i<u;i++){const q=get(d,c*u+i,r*u+j);if(q&&q[3]>=128)put(out,c*u+i,r*u+j,q);}}
   else if(hash(c,r,7)<.1){const y=r-rise-Math.floor(hash(c,r,3)*3);if(y>=0)block(out,c+Math.round((hash(c,r,5)-.5)*2),y,hex(DUST[hash(c,r,9)<.5?0:1]));}}
  return out;};
 return [lean(0),arm(lean(1),4),arm(lean(-1),5),arm(lean(-2),6),arm(lean(2),3,1),arm(lean(1),3),warp(.72,1),warp(.42,3),warp(.14,6),warp(0,9)].map(f=>({W,f}));
}
function strip(list,h){const W=list[0].W,out=Buffer.alloc(W*list.length*h*4);list.forEach(({f},n)=>{for(let y=0;y<h;y++)Buffer.from(f.buffer,y*W*4,W*4).copy(out,(y*W*list.length+n*W)*4);});return {w:W*list.length,h,d:out};}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const len=Buffer.alloc(4),sum=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type,'ascii'),data]);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(body));return Buffer.concat([len,body,sum]);};
function png({w,h,d}){const head=Buffer.alloc(13);head.writeUInt32BE(w,0);head.writeUInt32BE(h,4);head[8]=8;head[9]=6;const raw=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++)Buffer.from(d.buffer,d.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}

(async()=>{
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{}),page=await browser.newPage();
 // ImageDecoder needs a secure context: a blank page on localhost
 await page.route('http://localhost/',r=>r.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('http://localhost/');
 for(const [name,spec] of Object.entries(FIGURES))for(const [suffix,u] of [['',1],['@2x',2]]){
  const gif=fs.readFileSync(path.join(dir,`${name}${suffix}.gif`)).toString('base64');
  const first=await page.evaluate(async data=>{const dec=new ImageDecoder({data:Uint8Array.from(atob(data),c=>c.charCodeAt(0)),type:'image/gif'});await dec.tracks.ready;const {image}=await dec.decode({frameIndex:0});
   const w=image.displayWidth,h=image.displayHeight,c=new OffscreenCanvas(w,h),x=c.getContext('2d');x.drawImage(image,0,0);return {w,h,d:Array.from(x.getImageData(0,0,w,h).data)};},gif);
  const src={w:first.w,h:first.h,d:Uint8ClampedArray.from(first.d)};
  fs.writeFileSync(path.join(dir,`${name}${suffix}.png`),png({...src,d:Buffer.from(src.d.buffer)}));
  const list=frames(src,spec,u);if(list.length!==ACT_FRAMES)throw new Error('frame count');
  fs.writeFileSync(path.join(dir,`${name}-act${suffix}.png`),png(strip(list,src.h)));
  console.log(`${name}${suffix}: ${src.w}x${src.h}, strip ${list[0].W*ACT_FRAMES}x${src.h}`);
 }
 await browser.close();
})();
