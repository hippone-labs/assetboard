// Run with the browser tool's filename option. A free Supabase database shows its sleep rule in the inspector; its form folds 保活
// (address and interval), refuses an address with a user name, and the saved setting is shown with a button that copies the GitHub
// Actions workflow. The project field takes several names: the record then sits in both project views, and the shutdown list of one
// keeps it for the other.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 await page.evaluate(()=>{proEnable();save=()=>{};
  state={blocks:[{id:'database'},{id:'deployment'}],deletedExternalIds:[],assets:[
   {id:'db',type:'database',name:'notes-db',provider:'Supabase',cost:'免费',project:'web'},
   {id:'site',type:'deployment',name:'notes-site',provider:'Vercel',project:'web'},
   {id:'api',type:'deployment',name:'blog-api',provider:'Render',project:'blog'}]};render();});
 await page.evaluate(()=>showDetail('db'));
 check(await page.evaluate(()=>/7 天没有请求会暂停/.test(document.querySelector('#detail .wake-fact')?.textContent||'')&&/没设保活/.test(document.querySelector('#detail .wake-fact').textContent)),'the sleep rule and a missing keep-alive are named');
 await page.evaluate(()=>showDetail('site'));
 check(await page.evaluate(()=>!document.querySelector('#detail .wake-fact')),'Vercel has no sleep row');
 // The form: 保活 starts folded, a user name in the address is refused, a plain address is kept with the interval.
 await page.evaluate(()=>assetForm('database','db'));
 check(await page.evaluate(()=>{const d=document.querySelector('#asset-form .wake-fields');return d&&!d.open&&document.querySelector('#asset-form [data-choice="keepAliveEvery"][data-value="1440"]').getAttribute('aria-checked')==='true';}),'保活 is folded and suggests a day for Supabase');
 await page.click('#asset-form .wake-fields summary');
 await page.fill('#asset-form [name="keepAliveUrl"]','https://me:pw@api.example.com/health');
 await page.fill('#asset-form [name="project"]','web, blog');
 await page.click('#asset-form [type="submit"]');
 check(await page.evaluate(()=>!state.assets.find(a=>a.id==='db').keepAlive&&document.querySelector('#asset-form [name="keepAliveUrl"]').validationMessage),'an address with a user name is refused');
 await page.fill('#asset-form [name="keepAliveUrl"]','https://api.example.com/health');
 await page.click('#asset-form [data-choice="keepAliveEvery"][data-value="360"]');
 await page.click('#asset-form [type="submit"]');
 const saved=await page.evaluate(()=>{const a=state.assets.find(a=>a.id==='db');return JSON.stringify([a.keepAlive,a.project]);});
 check(saved===JSON.stringify([{url:'https://api.example.com/health',every:360},['web','blog']]),'saved '+saved);
 await page.evaluate(()=>showDetail('db'));
 check(await page.evaluate(()=>/每 6 小时请求一次 api\.example\.com\/health/.test(document.querySelector('#detail .wake-fact').textContent)&&document.querySelectorAll('#detail [data-action="view"][data-id^="project:"]').length===2),'the keep-alive line and both projects are shown');
 await page.evaluate(()=>{window.copied='';copyText=text=>{window.copied=text;};});
 await page.click('#detail [data-action="copy-keepalive"]');
 check(await page.evaluate(()=>/cron: '17 \*\/6 \* \* \*'/.test(window.copied)&&/curl .*'https:\/\/api\.example\.com\/health'/.test(window.copied)),'the workflow is copied');
 // Both project views hold it; shutting down web keeps it for blog.
 await page.evaluate(()=>setView('project:blog'));
 check(await page.evaluate(()=>!!document.querySelector('#board [data-asset="db"]')&&!!document.querySelector('#board [data-asset="api"]')),'the shared record is in blog');
 await page.evaluate(()=>setView('project:web'));
 check(await page.evaluate(()=>/1 项与别的项目共用/.test(document.querySelector('.project-bar')?.textContent||'')),'the project bar names the shared record');
 await page.click('.project-bar [data-action="shutdown"]');
 check(await page.evaluate(()=>![...document.querySelectorAll('#shutdown-form [name="done"]')].some(n=>n.value==='db')&&/notes-db → blog/.test(document.querySelector('#shutdown-form').textContent)),'shutdown keeps the shared record for blog');
}
