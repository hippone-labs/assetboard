// Run with the browser tool's filename option. 仓库分支和 Actions: what a GitHub sync with the feature on leaves on a repository, as the
// inspector and the row show it and as agents read it (one repository summary, not the stored fields); visibility written by
// hand and by agents; nothing shown with the feature off.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto('http://127.0.0.1:4317/');
  await p.evaluate(()=>{proEnable();render();});
  await until(p,()=>typeof assetboardAgent==='function');
  await p.evaluate(()=>{localStorage.clear();setFeature('repoDetails',true);state={blocks:[{id:'repository'}],assets:[],deletedExternalIds:[]};save=()=>{};
   const hours=h=>new Date(Date.now()-h*3600000).toISOString().replace(/\.\d+Z$/,'Z'),at=new Date(Date.now()-30*86400000).toISOString();
   const repo=(id,details)=>({id,name:'me/'+id,owner:'me',url:'https://github.com/me/'+id,defaultBranch:'main',pushedAt:hours(30),details});
   state=mergeGitHub(state,{repositories:[repo('api',{branches:['main'],run:null})]},at).board;
   state=mergeGitHub(state,{repositories:[repo('api',{branches:['main','feat-x'],denied:[],run:{status:'completed',conclusion:'failure',name:'CI',branch:'feat-x',event:'push',at:hours(3),url:'https://github.com/me/api/actions/runs/9'}}),
    repo('web',{branches:['main'],denied:['actions']})]}).board;render();});
  const row=await p.evaluate(()=>[...document.querySelectorAll('[data-asset]')].map(r=>({id:r.dataset.asset,text:r.textContent.replace(/\s+/g,' '),bad:!!r.querySelector('.r-date.overdue,.overdue')})));
  const api=row.find(r=>r.id==='github-repo-api'),web=row.find(r=>r.id==='github-repo-web');
  check(api&&/Actions 失败/.test(api.text)&&!/小时前/.test(api.text)&&api.bad,'a failed run leads the row, in red: '+JSON.stringify(api));
  check(web&&/推送于/.test(web.text)&&!web.bad,'a repository without a run reads its push: '+JSON.stringify(web));
  const facts=await p.evaluate(()=>{showDetail('github-repo-api');return [...document.querySelectorAll('#detail .fact')].map(f=>f.textContent.replace(/\s+/g,' ').trim());});
  check(facts.includes('默认分支main')&&facts.some(f=>/^分支2 · 新：feat-x$/.test(f))&&facts.some(f=>/^Actions失败 · CI · feat-x · 3 小时前 查看运行$/.test(f)),'the inspector names branch, new branches and the run: '+JSON.stringify(facts));
  const denied=await p.evaluate(()=>{showDetail('github-repo-web');return [...document.querySelectorAll('#detail .fact')].map(f=>f.textContent.trim()).find(t=>t.startsWith('Actions'));});
  check(/没有 Actions 读权限/.test(denied||''),'a missing permission is named: '+denied);

  const call=(method,params={})=>p.evaluate(([method,params])=>assetboardAgent({requestId:'t',method,params}),[method,params]);
  const got=await call('get',{id:'github-repo-api'});
  const r=got.result.repository;
  check(got.ok&&r&&r.visibility==='public'&&r.defaultBranch==='main'&&r.branches.count===2&&r.branches.new.join()==='feat-x'&&r.actions.state==='failure'&&r.actions.url==='https://github.com/me/api/actions/runs/9','agents read one repository summary: '+JSON.stringify(r));
  check(!['branches','branchSeen','branchesFrom','ciRun','repoDenied'].some(k=>k in got.result),'the stored detail fields stay inside');
  check((await call('get',{id:'github-repo-web'})).result.repository.unread.join()==='actions','agents learn what could not be read');
  const refused=await call('update',{id:'github-repo-api',fields:{visibility:'private'}});
  check(!refused.ok&&/GitHub/.test(refused.error),'a synced repository keeps GitHub’s visibility: '+JSON.stringify(refused));
  const added=await call('add',{items:[{name:'notes',type:'repository',visibility:'private'}]});
  check(added.ok&&added.result.added?.length===1,'agents can add a repository with visibility: '+JSON.stringify(added));
  const mine=await p.evaluate(id=>state.assets.find(a=>a.id===id),added.result.added[0].id);
  check(mine.event==='私有仓库','visibility is stored as the form stores it: '+mine.event);
  check(!(await call('update',{id:mine.id,fields:{visibility:'secret'}})).ok&&(await call('add',{items:[{name:'x.dev',type:'domain',visibility:'public'}]})).result.errors?.length===1,'visibility takes its own words, on repositories only');
  check((await call('update',{id:mine.id,fields:{visibility:'archived'}})).ok&&(await p.evaluate(id=>state.assets.find(a=>a.id===id).event,mine.id))==='已归档','agents change it');

  // Off: nothing of it shows, to the person or to agents.
  await p.evaluate(()=>{setFeature('repoDetails',false);render();});
  const off=await p.evaluate(()=>{showDetail('github-repo-api');return {row:document.querySelector('[data-asset="github-repo-api"]').textContent,facts:[...document.querySelectorAll('#detail .fact')].map(f=>f.textContent).join('|')};});
  check(!/Actions/.test(off.row)&&!/Actions|分支 /.test(off.facts.replace('默认分支','')),'off shows nothing read: '+JSON.stringify(off));
  const offRead=(await call('get',{id:'github-repo-api'})).result.repository;
  check(!offRead.branches&&!('actions' in offRead),'off gives agents nothing read: '+JSON.stringify(offRead));
  check(!errors.length,'no page errors: '+errors.join(' | '));
  return 'ok';
 } finally { await context.close(); }
}
