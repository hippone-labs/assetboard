// Run with the browser tool's filename option. 网络记录: the sidebar entry, rows as the app records them, filters, live entries, clearing; and the page's own CSP blocking any request.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1200,height:860}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.addInitScript(()=>{
   window.__sent=[];
   window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(m);
    if(m.action==='save')setTimeout(()=>assetboardSaved(m.sequence,true),5);
    if(m.action==='evidenceList')setTimeout(()=>assetboardEvidenceList([]),5);
    if(m.action==='networkLog')setTimeout(()=>assetboardNetworkLog(window.__rows),5);
    if(m.action==='networkLogClear'){window.__rows=[];}
   }}}};
   const now=new Date().toISOString(),yesterday=new Date(Date.now()-86400000).toISOString();
   window.__rows=[
    {id:'1',at:now,direction:'in',service:'MCP',method:'add',host:'本机 assetboard-cli',path:'agent.sock',ok:true,received:120,ms:4},
    {id:'2',at:now,direction:'out',service:'AI 识别',method:'POST',host:'api.anthropic.com',path:'/v1/messages',status:200,ok:true,sent:2048,received:900,ms:1800,address:'160.79.104.10',tls:'TLS 1.3'},
    {id:'3',at:now,direction:'out',service:'Cloudflare',method:'GET',host:'api.cloudflare.com',path:'/client/v4/zones',status:403,ok:false,received:80,ms:120},
    {id:'4',at:yesterday,direction:'out',service:'GitHub',method:'GET',host:'api.github.com',path:'/user/repos',status:200,ok:true,received:40960,ms:300}
   ];
   window.__ASSETBOARD_NATIVE__={data:{blocks:[],assets:[]},cloudflareConnected:false,githubConnected:false,gmailConfigured:false,ai:null,aiKeySaved:false};
  });
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof networkDialog==='function');

  // The page itself cannot make requests: the CSP refuses them.
  const blocked=await p.evaluate(()=>new Promise(resolve=>{addEventListener('securitypolicyviolation',e=>resolve(e.violatedDirective||e.effectiveDirective),{once:true});fetch('https://example.com/').catch(()=>{});setTimeout(()=>resolve('allowed'),2000);}));
  check(/^connect-src/.test(blocked),'The page CSP blocks fetch: '+blocked);

  // Sidebar entry at the foot, then the list.
  const entry=p.locator('#sidebar [data-action="network-log"]');
  check(await entry.count()===1&&(await entry.innerText()).includes('网络记录'),'The sidebar has 网络记录');
  await entry.click();
  await until(p,()=>document.querySelectorAll('#modal .net-row').length===4);
  const text=await p.locator('#modal-content').innerText();
  check(text.includes('今天 3 次')&&text.includes('发出 2')&&text.includes('收到 1')&&text.includes('失败 1'),'The summary counts today, both directions and failures: '+text.slice(0,300));
  check(text.includes('POST api.anthropic.com/v1/messages')&&text.includes('TLS 1.3')&&text.includes('160.79.104.10')&&text.includes('2.0 KB'),'A row shows method, host, path, TLS, address and size');
  check(text.includes('今天')&&text.includes('昨天'),'Rows are grouped by day');
  check(await p.locator('#modal .net-row.failed').count()===1,'The 403 is marked as failed');
  check(await p.locator('#modal .net-dir.in').count()===1,'The agent call is incoming');

  // Filters.
  await p.click('#modal [data-action="network-filter"][data-kind="direction"][data-id="in"]');
  check(await p.locator('#modal .net-row').count()===1,'收到 shows only incoming calls');
  await p.click('#modal [data-action="network-filter"][data-kind="direction"][data-id=""]');
  await p.click('#modal [data-action="network-filter"][data-kind="service"][data-id="GitHub"]');
  check(await p.locator('#modal .net-row').count()===1&&(await p.locator('#modal .net-row').innerText()).includes('api.github.com'),'A service chip filters by service');
  await p.click('#modal [data-action="network-filter"][data-kind="service"][data-id=""]');

  // A new request appears while the list is open.
  await p.evaluate(()=>assetboardNetworkEntry({id:'5',at:new Date().toISOString(),direction:'out',service:'网站图标',method:'GET',host:'example.org',path:'/favicon.ico',status:200,ok:true,received:300,ms:50}));
  check(await p.locator('#modal .net-row').count()===5&&(await p.locator('#modal .net-row').first().innerText()).includes('example.org'),'A live entry lands on top');

  // Clearing asks first, then empties the list.
  await p.click('#modal [data-action="network-clear"]');
  check(await p.evaluate(()=>$('#modal-title').textContent==='清空网络记录？'),'Clearing asks first');
  await p.click('#confirm-yes');
  await until(p,()=>$('#modal').dataset.view==='network'&&/还没有任何网络请求/.test($('#modal-content').textContent));
  check(await p.evaluate(()=>__sent.some(m=>m.action==='networkLogClear')),'The app is asked to clear its log');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 } finally { await context.close(); }
 return 'PASS: page CSP blocks fetch, sidebar entry, rows with method/host/path/TLS/address/size, day groups, failures, direction and service filters, live entry, clear with confirmation';
}
