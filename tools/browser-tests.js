// Runs the browser tests (each *.playwright.js file is one `async (page) => {...}` expression) headless, against a static server
// that this script starts itself on 127.0.0.1:4318, so the browser version you serve on 4317 (README) can keep running.
// The tests are written against http://127.0.0.1:4317/; that address is pointed at this server when a file is loaded.
//
//   node tools/browser-tests.js                       the full edition: this checkout, tests/ and pro/tests/
//   node tools/browser-tests.js --root <dir>          another copy of the board (its tests/)
//   node tools/browser-tests.js tests/keyboard.playwright.js ...   only these files (paths relative to the root)
//   --port <n>                                         serve on another port
//
// Needs Playwright with Chromium: once, `npm install --no-save playwright && npx playwright install chromium` in this checkout
// (node_modules/ is ignored). PLAYWRIGHT_CHROMIUM=<path> uses another Chromium binary.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');

const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);return at>=0?args.splice(at,2)[1]:null;};
const root=path.resolve(option('--root')||path.join(__dirname,'..'));
const port=Number(option('--port')||4318),base=`http://127.0.0.1:${port}`;
const listed=args.length?args:['tests','pro/tests'].flatMap(dir=>fs.existsSync(path.join(root,dir))?fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.playwright.js')).sort().map(f=>`${dir}/${f}`):[]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};

const server=http.createServer((req,res)=>{
 const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`127.0.0.1:${port} is in use; pass --port <n>`:error.message);process.exit(2);});

server.listen(port,'127.0.0.1',async()=>{
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{});
 let failed=0;
 for(const file of listed){
  const context=await browser.newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(base+'/');
   const result=await eval(fs.readFileSync(path.join(root,file),'utf8').replaceAll('http://127.0.0.1:4317',base))(page);
   if(errors.length)throw new Error('page errors: '+errors.slice(0,3).join(' | '));
   console.log('ok  ',file,typeof result==='string'?'':'');
  }catch(error){
   // The first line, short, for the summary; then the whole message (a test's diagnostics can run long), indented.
   const text=String(error.message),lines=text.split('\n');failed++;
   console.log('FAIL',file,'\n    ',lines[0].slice(0,300));
   if(text.length>300||lines.length>1)console.log(text.split('\n').map(l=>'       | '+l).join('\n'));
  }
  await context.close();
 }
 await browser.close();server.close();
 console.log(`${listed.length-failed} of ${listed.length} passed (${root})`);
 process.exit(failed?1:0);
});
