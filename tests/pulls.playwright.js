// Run with the browser tool's filename option. 待合并的 PR: the demo's pull requests on the 代码仓库 panel (each repository's line and
// its tone, the summary under the title, the inspector's list), in the list view, the category view, under 冰箱贴, light and dark
// (contrast) and at 390px; switching the feature off; then a faked Mac host (not demo): the page asks at launch with the GitHub
// repositories' names, the answer comes back through assetboardPulls, a click opens the pull request's page through openExternal,
// 刷新 asks again, and each failure (no login, refused, rate limit, no network) is said in one line while the last reading stays.
// Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const audit=(p,selector)=>p.evaluate(selector=>{
  const parse=v=>{const m=(v.match(/[\d.]+/g)||[0,0,0,0]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]??1};};
  const over=(t,b)=>({r:t.r*t.a+b.r*(1-t.a),g:t.g*t.a+b.g*(1-t.a),b:t.b*t.a+b.b*(1-t.a),a:1});
  const lum=({r,g,b})=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll(selector)].filter(el=>!el.closest('[aria-hidden="true"]')&&el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>{
   const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c.a>0){layers.push(c);if(c.a>=1)break;}}
   let bg={r:255,g:255,b:255,a:1};for(const l of layers.reverse())bg=over(l,bg);
   const [x,y]=[lum(over(parse(getComputedStyle(el).color),bg)),lum(bg)].sort((m,n)=>n-m);return {text:el.textContent.trim().slice(0,40),ratio:(x+.05)/(y+.05)};
  });
 },selector);
 const contexts=[];
 const open=async({scheme='light',width=1400,url='?demo',init=null}={})=>{
  const context=await page.context().browser().newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce',locale:'zh-CN'});contexts.push(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(init)await p.addInitScript(init);
  await p.goto('http://127.0.0.1:4317/'+url);
  await until(p,()=>typeof pullsSumHtml==='function'&&typeof render==='function');
  return {p,errors};
 };
 const rows=p=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-group="repository"] [data-asset]')].map(r=>{const d=r.querySelector('.r-date');return [r.dataset.asset,{text:d?.textContent.replace(/\s+/g,' ').trim(),cls:d?.className||'',mark:d?.querySelector('.pr-mark')?.textContent||'',label:r.querySelector('.item-open')?.getAttribute('aria-label')||''}];})));
 try {
  for(const scheme of ['light','dark']){
   const {p,errors}=await open({scheme});
   const r=await rows(p);
   // atlas-ui: 2 open, 1 ready → neutral, the check and its number; notes-api: a failing check → red; pixel-kit: still for 4 days → amber;
   // studio-site: a conflict, not ready → neutral without a check; ledger-cli: none open → its quiet push line.
   check(r['demo-r0'].text==='2 PR1'&&r['demo-r0'].mark==='1'&&/pr-ready/.test(r['demo-r0'].cls)&&!/warn/.test(r['demo-r0'].cls),'atlas-ui: count and ready mark, neutral: '+JSON.stringify(r['demo-r0']));
   check(/可合并/.test(r['demo-r0'].label),'the ready count is spelled out in the label: '+r['demo-r0'].label);
   check(/^2 PR/.test(r['demo-r1'].text)&&/overdue/.test(r['demo-r1'].cls),'notes-api: a failing check is red: '+JSON.stringify(r['demo-r1']));
   check(/^1 PR/.test(r['demo-r2'].text)&&/warn/.test(r['demo-r2'].cls)&&!/overdue/.test(r['demo-r2'].cls),'pixel-kit: still for days is amber: '+JSON.stringify(r['demo-r2']));
   check(r['demo-r3'].text==='1 PR'&&!r['demo-r3'].mark&&!/warn|ready/.test(r['demo-r3'].cls),'studio-site: neutral, nothing to merge: '+JSON.stringify(r['demo-r3']));
   check(/推送于/.test(r['demo-r4'].text)&&!/warn/.test(r['demo-r4'].cls),'ledger-cli: no pull requests, the quiet line stays: '+JSON.stringify(r['demo-r4']));
   const sum=await p.evaluate(()=>document.querySelector('[data-group="repository"] .pr-sum')?.textContent.replace(/\s+/g,' ').trim());
   check(sum&&/4 个仓库共 6 个 PR 待合并/.test(sum)&&/3 个可以合并/.test(sum)&&/1 个 CI 失败/.test(sum)&&/最老 6 天/.test(sum)&&/1 个仓库没权限/.test(sum),'the summary under the panel title: '+sum);
   check(await p.evaluate(()=>!document.querySelector('.pr-sum [data-action="pulls-refresh"]')),'the demo offers no refresh');
   // The inspector: ready first, then the failing one; draft, checks, merge and how long each has been still.
   const detail=await p.evaluate(id=>{showDetail(id);return [...document.querySelectorAll('#detail .pr-item')].map(b=>({n:b.dataset.n,text:b.textContent.replace(/\s+/g,' ').trim(),ready:b.classList.contains('ready'),bad:!!b.querySelector('.pr-bad'),stale:!!b.querySelector('.pr-stale')}));},'demo-r1');
   check(detail.length===2&&detail[0].n==='115'&&detail[0].ready&&/#115 ?Bump sqlite driver/.test(detail[0].text)&&/可以合并/.test(detail[0].text)&&/CI 通过/.test(detail[0].text),'notes-api: the ready one first: '+JSON.stringify(detail));
   check(detail[1].n==='118'&&detail[1].bad&&/CI 失败/.test(detail[1].text)&&!/可以合并/.test(detail[1].text),'notes-api: the failing one in red: '+JSON.stringify(detail[1]));
   const atlas=await p.evaluate(()=>{showDetail('demo-r0');return [...document.querySelectorAll('#detail .pr-item')].map(b=>({n:b.dataset.n,text:b.textContent.replace(/\s+/g,' ').trim(),stale:!!b.querySelector('.pr-stale')}));});
   const draft=atlas.find(x=>x.n==='39');
   check(draft&&/草稿/.test(draft.text)&&/CI 进行中/.test(draft.text)&&/5 天没动/.test(draft.text)&&!draft.stale,'a draft says so and is not amber however still: '+JSON.stringify(draft));
   const pixel=await p.evaluate(()=>{showDetail('demo-r2');return document.querySelector('#detail .pr-item')?.innerHTML;});
   check(/pr-stale">4 天没动/.test(pixel||''),'pixel-kit: 4 天没动 in amber: '+pixel);
   const conflict=await p.evaluate(()=>{showDetail('demo-r3');return document.querySelector('#detail .pr-item')?.textContent;});
   check(/有冲突/.test(conflict||'')&&!/可以合并/.test(conflict),'a conflict is named: '+conflict);
   const denied=await p.evaluate(()=>{showDetail('demo-r12');return document.querySelector('#detail .pr-section')?.textContent;});
   check(/当前登录看不到这个仓库/.test(denied||''),'a repository the login cannot see says so: '+denied);
   const none=await p.evaluate(()=>{showDetail('demo-r4');return document.querySelector('#detail .pr-section')?.textContent;});
   check(/没有打开的 PR/.test(none||''),'none open: '+none);
   // The demo never opens a link.
   await p.evaluate(()=>{showDetail('demo-r1');window.__opened=[];const o=window.open;window.open=(...a)=>{window.__opened.push(a[0]);};document.querySelector('#detail .pr-item').click();window.open=o;});
   check(await p.evaluate(()=>!window.__opened.length),'the demo opens nothing');
   const low=(await audit(p,'[data-group="repository"] .pr-sum *, [data-group="repository"] .r-date, [data-group="repository"] .r-date *, #detail .pr-section *')).filter(x=>x.ratio<4.5);
   check(!low.length,`${scheme}: low contrast `+JSON.stringify(low.slice(0,4)));
   check(!errors.length,errors.join(' | '));
  }
  // The list view and the category view carry the same line; 390px fits; the feature off shows nothing.
  {const {p,errors}=await open({width:390});
   await p.evaluate(()=>setView('repository'));
   check(await p.evaluate(()=>/6 个 PR 待合并/.test(document.querySelector('#board .pr-sum')?.textContent||'')&&document.documentElement.scrollWidth<=391),'the category view at 390px');
   await p.evaluate(()=>{setView('all');setLayout('list');});
   check(await p.evaluate(()=>!!document.querySelector('[data-group="repository"] .pr-sum')),'the list view');
   await p.evaluate(()=>{setFeature('pulls',false);render();showDetail('demo-r0');});
   const off=await p.evaluate(()=>({sum:!!document.querySelector('.pr-sum'),detail:!!document.querySelector('#detail .pr-section'),row:document.querySelector('[data-asset="demo-r0"] .r-date')?.textContent}));
   check(!off.sum&&!off.detail&&!/PR/.test(off.row||''),'off: nothing of it: '+JSON.stringify(off));
   check(!errors.length,errors.join(' | '));}
  // 冰箱贴: the same line on the magnet panel, readable on the door.
  {const {p,errors}=await open({init:"localStorage.setItem('assetboard-skin-v1','magnet')"});
   check(await p.evaluate(()=>document.documentElement.dataset.skin==='magnet'&&!!document.querySelector('#board .wall [data-group="repository"] .pr-sum')),'冰箱贴 shows the summary');
   const low=(await audit(p,'[data-group="repository"] .pr-sum *, [data-group="repository"] .r-date, [data-group="repository"] .r-date *')).filter(x=>x.ratio<4.5);
   check(!low.length,'冰箱贴: low contrast '+JSON.stringify(low.slice(0,4)));
   check(!errors.length,errors.join(' | '));}

  // A faked Mac host.
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   const repo=(id,name,extra={})=>({id,type:'repository',name,provider:'GitHub',account:'me',source:'github',externalId:id,syncStatus:'公开仓库',event:'公开仓库',art:'generic',cost:'未知',...extra});
   window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:true,data:{blocks:[{id:'repository',folded:false}],assets:[
    repo('r1','me/api'),repo('r2','me/web'),repo('r3','me/old',{event:'已归档',syncStatus:'已归档'}),repo('r4','me/gone',{hiddenAt:'2026-01-01T00:00:00Z'}),
    {id:'r5',type:'repository',name:'notes',url:'https://github.com/Me/Notes',source:'manual',art:'generic',cost:'未知'},
    {id:'r6',type:'repository',name:'lab',url:'https://gitlab.com/me/lab',source:'manual',art:'generic',cost:'未知'}]}};
  };
  const {p,errors}=await open({url:'',init:`(${host.toString()})();`});
  await p.evaluate(()=>{save=()=>{};});
  const ask=await until(p,()=>window.__sent.find(m=>m.action==='githubPulls'));
  check(JSON.stringify(ask.repos.slice().sort())===JSON.stringify(['Me/Notes','me/api','me/web'])&&ask.requestId>0,'asks at launch for the GitHub repositories only (not archived, hidden or on GitLab): '+JSON.stringify(ask));
  check(await p.evaluate(()=>/正在读 PR/.test(document.querySelector('.pr-sum')?.textContent||'')||!document.querySelector('.pr-sum')),'nothing loud while the first read runs');
  const now=Date.now(),iso=h=>new Date(now-h*3600000).toISOString();
  const node=(full,n,o={})=>({number:n,title:'Change '+n,url:`https://github.com/${full}/pull/${n}`,isDraft:false,createdAt:iso(o.created||30),updatedAt:iso(o.updated||2),mergeable:o.merge||'MERGEABLE',author:{login:'me'},commits:{nodes:[{commit:{statusCheckRollup:{state:o.ci||'SUCCESS'}}}]}});
  await p.evaluate(answer=>window.assetboardPulls(answer),{requestId:ask.requestId,ok:true,at:new Date(now).toISOString(),via:['gh'],repos:{'me/api':{total:2,nodes:[node('me/api',3),node('me/api',4,{ci:'FAILURE'})]},'me/web':{total:0,nodes:[]},'Me/Notes':{error:'denied'}}});
  const read=await rows(p);
  check(/^2 PR/.test(read.r1.text)&&/overdue/.test(read.r1.cls),'the answer is drawn: '+JSON.stringify(read.r1));
  check(await p.evaluate(()=>{const s=document.querySelector('.pr-sum')?.textContent||'';return /1 个仓库共 2 个 PR 待合并/.test(s)&&/1 个仓库没权限/.test(s)&&!!document.querySelector('.pr-sum [data-action="pulls-refresh"]');}),'summary and refresh');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('assetboard-pulls-v1')||'{}').repos?.['me/api']?.pulls?.length===2),'the reading is kept on this device');
  check(await p.evaluate(()=>!JSON.stringify(state).includes('pull/3')),'never in the board');
  // A click opens the pull request's own page in the default browser.
  await p.evaluate(()=>{showDetail('r1');window.__sent.length=0;document.querySelector('#detail .pr-item[data-n="3"]').click();});
  check(await p.evaluate(()=>window.__sent.some(m=>m.action==='openExternal'&&m.url==='https://github.com/me/api/pull/3')),'opens through openExternal');
  // 刷新 asks again; each failure is one line and the last reading stays.
  await p.evaluate(()=>{window.__sent.length=0;document.querySelector('.pr-sum [data-action="pulls-refresh"]').click();});
  const again=await until(p,()=>window.__sent.find(m=>m.action==='githubPulls'));
  for(const [reason,words,button] of [['nosource','本机 gh 没登录，也没有保存令牌',true],['auth','GitHub 不认这个登录',true],['rate','GitHub 限流',false],['net','连不上 GitHub',false]]){
   await p.evaluate(([id,reason])=>window.assetboardPulls({requestId:id,ok:false,reason,...(reason==='rate'?{resetAt:new Date(Date.now()+600000).toISOString()}:{})}),[again.requestId,reason]);
   const line=await p.evaluate(()=>({text:document.querySelector('.pr-sum')?.textContent||'',connect:!!document.querySelector('.pr-sum [data-action="pulls-connect"]'),row:document.querySelector('[data-asset="r1"] .r-date')?.textContent||'',detail:document.querySelector('#detail .pr-problem')?.textContent||''}));
   check(line.text.includes(words)&&line.connect===button&&/^2 PR/.test(line.row)&&line.detail.includes(words),`${reason}: said once, the last reading kept: `+JSON.stringify(line));
  }
  // A rate limit holds the timed reads back until it resets; the person's 刷新 still asks.
  await p.evaluate(id=>{window.assetboardPulls({requestId:id,ok:false,reason:'rate',resetAt:new Date(Date.now()+600000).toISOString()});window.__sent.length=0;pullsAsked=0;pullsDue();},again.requestId);
  check(await p.evaluate(()=>!window.__sent.some(m=>m.action==='githubPulls')),'no timed read while rate limited');
  check(await p.evaluate(()=>{pullsBusy=0;return pullsRefresh(true);}),'刷新 still asks');
  // 连接 GitHub… opens the GitHub dialog (gh first, or a token for the Keychain).
  await p.evaluate(()=>window.assetboardPulls({ok:false,reason:'nosource'}));
  await p.evaluate(()=>document.querySelector('.pr-sum [data-action="pulls-connect"]').click());
  check(await p.evaluate(()=>$('#modal').open&&!!document.querySelector('#github-local-sync')&&!!document.querySelector('#github-token')),'the GitHub dialog');
  await p.evaluate(()=>$('#modal').close());
  // A GitHub sync reads the pull requests right after.
  await p.evaluate(()=>{window.__sent.length=0;pullsBusy=0;window.assetboardGitHubResult({ok:true,connected:true,repositories:[]});});
  await until(p,()=>window.__sent.some(m=>m.action==='githubPulls'));
  check(!errors.length,errors.join(' | '));
  return 'ok';
 } finally { for(const c of contexts)await c.close(); }
}
