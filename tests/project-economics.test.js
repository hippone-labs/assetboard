const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');

const rates={USD:1,CNY:7,EUR:0.5};
const now=new Date(2026,10,7);
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} ≠ ${expected}`);
const of=(eco,name)=>eco.projects.find(p=>p.name===name);

test('a shared record is split equally among its projects by default',()=>{
 const assets=[
  {id:'vps',type:'server',name:'shared-vps',cost:'$12 / 月',project:['web','blog','api']},
  {id:'site',type:'deployment',name:'web-site',cost:'$6 / 月',project:'web'}
 ];
 const eco=D.projectEconomics(assets,{},{currency:'USD',rates,now});
 close(of(eco,'web').monthlyCost,6+4,'web');close(of(eco,'blog').monthlyCost,4,'blog');close(of(eco,'api').monthlyCost,4,'api');
 const row=of(eco,'web').assets.find(x=>x.id==='vps');
 assert.equal(row.split,'equal');assert.equal(row.shared,true);close(row.share,1/3,'share');close(row.monthly,12,'full');close(row.cost,4,'part');
 assert.deepEqual(of(eco,'web').assets.map(x=>x.id),['site','vps'],'largest part first');
 assert.equal(of(eco,'web').net,null,'no revenue, no net');assert.equal(of(eco,'web').complete,true);
});

test('custom shares split by percent and must name every project and add up to 100',()=>{
 const a={id:'db',type:'database',name:'db',cost:'$20 / 月',project:['web','blog']};
 assert.deepEqual(D.setProjectShares(a,{web:75,blog:25}),{ok:true,shares:{web:75,blog:25}});
 assert.deepEqual(a.projectShares,{web:75,blog:25});
 const eco=D.projectEconomics([a],{},{currency:'USD',rates,now});
 close(of(eco,'web').monthlyCost,15,'web');close(of(eco,'blog').monthlyCost,5,'blog');
 assert.equal(of(eco,'web').assets[0].split,'custom');
 assert.deepEqual(D.checkProjectShares(['web','blog'],{web:'60',blog:'40'}),{ok:true,shares:{web:60,blog:40}},'numbers as text');
 assert.deepEqual(D.checkProjectShares(['web','blog'],{web:33.33,blog:66.67}).ok,true,'two decimals');
 assert.deepEqual(D.checkProjectShares(['web','blog','api'],{web:0,blog:50,api:50}).ok,true,'0 is a share');
 // Decimals: at most two; numbers given as text are read the same way.
 for(const shares of [{web:12.5,blog:87.5},{web:12.55,blog:87.45},{web:'12.55',blog:'87.45'},{web:'12.50',blog:'87.5'},{web:0,blog:100},{web:'0',blog:'100'}])
  assert.equal(D.checkProjectShares(['web','blog'],shares).ok,true,JSON.stringify(shares));
 assert.deepEqual(D.checkProjectShares(['web','blog'],{web:'12.55',blog:'87.45'}).shares,{web:12.55,blog:87.45});
 for(const shares of [{web:12.555,blog:87.445},{web:'12.555',blog:'87.445'},{web:33.333,blog:66.667}]){
  const r=D.checkProjectShares(['web','blog'],shares);assert.equal(r.ok,false,JSON.stringify(shares));assert.equal(r.error,'份额最多两位小数');
 }
 assert.equal(D.checkProjectShares(['web','blog','api'],{web:33.33,blog:33.33,api:33.33}).ok,true,'99.99 is within 0.01 of 100');
 assert.equal(D.checkProjectShares(['web','blog','api'],{web:33.33,blog:33.33,api:33.32}).ok,false,'99.98 is not');
 D.setProjectShares(a,null);assert.equal('projectShares' in a,false,'null clears');
});

test('equal percents to two decimals add up to 100, the last taking the rest',()=>{
 assert.deepEqual(D.evenShares(2),[50,50]);assert.deepEqual(D.evenShares(3),[33.33,33.33,33.34]);assert.deepEqual(D.evenShares(1),[100]);assert.deepEqual(D.evenShares(0),[]);
 for(let n=2;n<=8;n++){const list=D.evenShares(n),names=list.map((_,i)=>'p'+i);assert.equal(D.checkProjectShares(names,Object.fromEntries(names.map((k,i)=>[k,list[i]]))).ok,true,'n='+n);}
});

test('invalid shares are refused, and shares that no longer fit fall back to equal and are listed',()=>{
 const names=['web','blog'],bad=shares=>D.checkProjectShares(names,shares);
 for(const shares of [{web:60,blog:30},{web:100},{web:50,blog:50,api:0},{web:50,other:50},{web:-10,blog:110},{web:150,blog:-50},{web:'x',blog:100},{web:'',blog:100},{web:null,blog:100},{web:true,blog:99},{web:NaN,blog:100},[50,50],'50/50',7])
  assert.equal(bad(shares).ok,false,JSON.stringify(shares));
 assert.match(bad({web:60,blog:30}).error,/90/,'the error names the sum');
 assert.equal(D.checkProjectShares(['web'],{web:100}).ok,false,'one project has nothing to split');
 const a={id:'db',type:'database',name:'db',cost:'$20 / 月',project:['web','blog']};
 assert.equal(D.setProjectShares(a,{web:60,blog:30}).ok,false);assert.equal('projectShares' in a,false,'a refused share is not stored');
 // Stored by hand or by an older copy: the project list changed under the shares.
 const stale={...a,project:['web','blog','api'],projectShares:{web:60,blog:40}};
 const eco=D.projectEconomics([stale],{},{currency:'USD',rates,now});
 assert.deepEqual(of(eco,'web').invalidShares,['db']);assert.equal(of(eco,'web').assets[0].split,'equal');
 for(const name of ['web','blog','api'])close(of(eco,name).monthlyCost,20/3,name);
 // Changing a record's projects drops shares that no longer fit; keeping them keeps the shares.
 const b={...a,projectShares:{web:60,blog:40}};D.setProjects(b,['blog','web']);assert.deepEqual(b.projectShares,{web:60,blog:40});
 D.setProjects(b,['web','blog','api']);assert.equal('projectShares' in b,false);
 const c={...a,projectShares:{web:60,blog:40}};D.pruneProjectShares(c);assert.deepEqual(c.projectShares,{web:60,blog:40});
});

test('mixed currencies convert into one currency, revenue too, and net is revenue less cost',()=>{
 const assets=[
  {id:'vps',type:'server',name:'vps',cost:'$10 / 月',project:'app'},
  {id:'cn',type:'domain',name:'app.example.com',cost:'¥84 / 年',project:'app'},
  {id:'eu',type:'subscription',name:'mail',cost:'€1 / 月',project:'app'}
 ];
 const projects={app:{revenue:{amount:35,currency:'EUR'}}};
 const usd=of(D.projectEconomics(assets,projects,{currency:'USD',rates,now}),'app');
 close(usd.monthlyCost,10+1+2,'10 USD + 84 CNY a year (1 USD a month) + 1 EUR (2 USD)');
 assert.deepEqual(usd.revenue,{amount:35,currency:'EUR'});close(usd.revenueMonthly,70,'35 EUR');close(usd.net,57,'profit');
 const cny=of(D.projectEconomics(assets,projects,{currency:'CNY',rates,now}),'app');
 close(cny.monthlyCost,13*7,'the same in CNY');close(cny.net,57*7,'the same net in CNY');
 const loss=of(D.projectEconomics(assets,{app:{revenue:{amount:5,currency:'USD'}}},{currency:'USD',rates,now}),'app');
 close(loss.net,-8,'a loss is negative');
 const noRate=of(D.projectEconomics(assets,{app:{revenue:{amount:5,currency:'XYZ'}}},{currency:'USD',rates,now}),'app');
 assert.equal(noRate.revenueMonthly,null);assert.equal(noRate.net,null);assert.equal(noRate.complete,false,'a revenue without a rate is not complete');
});

test('yearly, quarterly and cycle-field costs count per month',()=>{
 const assets=[
  {id:'y',type:'domain',name:'y.example.com',cost:'$120 / 年',project:'p'},
  {id:'q',type:'subscription',name:'q',cost:'$30 / 3 个月',project:'p'},
  {id:'c',type:'license',name:'c',cost:'$24',cycle:'yearly',project:'p'}
 ];
 const p=of(D.projectEconomics(assets,{},{currency:'USD',rates,now}),'p');
 close(p.monthlyCost,10+10+2,'monthly');
 assert.deepEqual(p.assets.map(x=>[x.id,x.monthly]),[['q',10],['y',10],['c',2]]);
 // Same per-record reading as the cost totals.
 close(D.costTotals(assets,{currency:'USD',rates,now}).monthly,p.monthlyCost,'costTotals agrees');
});

test('free, unknown and one-off costs are listed apart, never counted as 0',()=>{
 const assets=[
  {id:'paid',type:'server',name:'paid',cost:'$5 / 月',project:'p'},
  {id:'free',type:'deployment',name:'free',cost:'免费',project:'p'},
  {id:'none',type:'repository',name:'none',project:'p'},
  {id:'unknown',type:'database',name:'unknown',cost:'未知',project:'p'},
  {id:'text',type:'subscription',name:'text',cost:'约 100 元左右',project:'p'},
  {id:'nocycle',type:'subscription',name:'nocycle',cost:'$9',project:'p'},
  {id:'norate',type:'subscription',name:'norate',cost:'HK$9 / 月',project:'p'},
  {id:'once',type:'license',name:'once',cost:'$40',billingType:'one_off',project:['p','q']},
  {id:'off',type:'server',name:'off',cost:'$50 / 月',stopped:true,project:'p'},
  {id:'gone',type:'server',name:'gone',cost:'$50 / 月',hiddenAt:'2026-01-01T00:00:00Z',project:'p'}
 ];
 const p=of(D.projectEconomics(assets,{p:{revenue:{amount:20,currency:'USD'}}},{currency:'USD',rates,now}),'p');
 close(p.monthlyCost,5,'only the paid one');assert.equal(p.complete,false);close(p.net,15,'net of what is known');
 assert.deepEqual(p.notCounted,{free:['free'],oneOff:['once'],none:['none','unknown'],noCycle:['nocycle'],unreadable:['text'],noRate:['norate'],stopped:['off']});
 close(p.oneOffTotal,20,'a one-off is split like the rest');
 assert.equal(p.assets.find(x=>x.id==='free').monthly,null,'free is null, not 0');
 assert.equal(p.assets.some(x=>x.id==='gone'),false,'hidden records are not in the project');
 assert.equal(p.count,9);
 const clean=of(D.projectEconomics([assets[0],assets[1]],{},{currency:'USD',rates,now}),'p');
 assert.equal(clean.complete,true,'free alone keeps it complete');
});

test('revenue is validated, stored sparsely and cleared with null',()=>{
 for(const value of [{amount:-1,currency:'USD'},{amount:'',currency:'USD'},{amount:null,currency:'USD'},{amount:true,currency:'USD'},{amount:'abc',currency:'USD'},{amount:5,currency:'US'},{amount:5},{amount:Infinity,currency:'USD'},{amount:1e13,currency:'USD'},'5 USD',[5,'USD']])
  assert.equal(D.cleanRevenue(value),null,JSON.stringify(value));
 assert.deepEqual(D.cleanRevenue({amount:'12.345',currency:' usd '}),{amount:12.35,currency:'USD'});
 assert.deepEqual(D.cleanRevenue({amount:0,currency:'CNY'}),{amount:0,currency:'CNY'},'0 is a revenue');
 let r=D.setProjectRevenue(undefined,' notes  app ',{amount:30,currency:'USD'});
 assert.deepEqual(r,{ok:true,projects:{'notes app':{revenue:{amount:30,currency:'USD'}}}});
 assert.equal(D.setProjectRevenue(r.projects,'notes app',{amount:-3,currency:'USD'}).ok,false);
 assert.equal(D.setProjectRevenue(r.projects,'a,b',{amount:3,currency:'USD'}).ok,false,'a name with a separator');
 assert.equal(D.setProjectRevenue(r.projects,'',{amount:3,currency:'USD'}).ok,false);
 r=D.setProjectRevenue(r.projects,'notes app',null);assert.deepEqual(r.projects,{});
 assert.deepEqual(D.cleanProjectMeta({ok:{revenue:{amount:1,currency:'USD'}},'a、b':{revenue:{amount:1,currency:'USD'}},empty:{},bad:{revenue:{amount:'x'}},nul:null}),{ok:{revenue:{amount:1,currency:'USD'}}});
 assert.deepEqual(D.cleanProjectMeta([{revenue:{amount:1,currency:'USD'}}]),{});
 assert.equal(Object.keys(D.cleanProjectMeta(Object.fromEntries(Array.from({length:300},(_,i)=>['p'+i,{revenue:{amount:1,currency:'USD'}}])))).length,D.PROJECT_META_LIMIT);
});

test('renaming a project keeps its revenue and shares; a merge adds the same currency, converts two into one USD sum',()=>{
 const assets=[{id:'db',type:'database',name:'db',cost:'$20 / 月',project:['old','blog'],projectShares:{old:70,blog:30}}];
 const projects={old:{revenue:{amount:40,currency:'USD'}}};
 assert.equal(D.renameProject(assets,'old','new',now,projects),1);
 assert.deepEqual(projects,{new:{revenue:{amount:40,currency:'USD'}}});
 assert.deepEqual(assets[0].project,['new','blog']);assert.deepEqual(assets[0].projectShares,{new:70,blog:30});
 close(of(D.projectEconomics(assets,projects,{currency:'USD',rates,now}),'new').net,40-14,'after the rename');
 // Merging into a project that has a revenue in the same currency adds them; the record's two shares become one project.
 const merged={blog:{revenue:{amount:10,currency:'USD'}},new:{revenue:{amount:40,currency:'USD'}}};
 D.renameProject(assets,'new','blog',now,merged);
 assert.deepEqual(merged,{blog:{revenue:{amount:50,currency:'USD'}}});
 assert.equal(assets[0].project,'blog');assert.equal('projectShares' in assets[0],false,'one project, nothing to split');
 // Three projects, two merged: their shares add up.
 const three=[{id:'s',type:'server',name:'s',cost:'$30 / 月',project:['a','b','c'],projectShares:{a:20,b:30,c:50}}];
 D.renameProject(three,'a','b',now);assert.deepEqual(three[0].project,['b','c']);assert.deepEqual(three[0].projectShares,{b:50,c:50});
 // Different currencies: both are converted with the rates and stored as one sum in USD (5 EUR = 10 USD, 70 CNY = 10 USD).
 const apart={x:{revenue:{amount:5,currency:'EUR'}},y:{revenue:{amount:70,currency:'CNY'}}};
 D.renameProject([{id:'r',type:'repository',name:'r',project:'x'}],'x','y',now,apart,rates);
 assert.deepEqual(apart,{y:{revenue:{amount:20,currency:'USD'}}});
 // Without rates the app's built-in ones are used.
 const builtIn={x:{revenue:{amount:6.678,currency:'CNY'}},y:{revenue:{amount:1,currency:'USD'}}};
 D.renameProject([{id:'r',type:'repository',name:'r',project:'x'}],'x','y',now,builtIn);
 assert.deepEqual(builtIn,{y:{revenue:{amount:2,currency:'USD'}}});
 // A currency without a rate is not added: the old entry stays under its name rather than being lost.
 const noRate={x:{revenue:{amount:5,currency:'XAU'}},y:{revenue:{amount:9,currency:'USD'}}};
 D.renameProject([{id:'r',type:'repository',name:'r',project:'x'}],'x','y',now,noRate,rates);
 assert.deepEqual(noRate,{x:{revenue:{amount:5,currency:'XAU'}},y:{revenue:{amount:9,currency:'USD'}}});
 // Without the map (or with no entry) only the records change.
 const plain=[{id:'r',type:'repository',name:'r',project:'x'}];assert.equal(D.renameProject(plain,'x','z',now),1);assert.equal(plain[0].project,'z');
 const none={};D.renameProject([{id:'r',type:'repository',name:'r',project:'x'}],'x','z',now,none);assert.deepEqual(none,{});
});

test('project revenue survives a backup round trip and merges like the other board settings',()=>{
 const board={blocks:[{id:'server'}],assets:[{id:'vps',type:'server',name:'vps',cost:'$12 / 月',project:['web','blog'],projectShares:{web:50,blog:50}}],
  projects:{web:{revenue:{amount:30,currency:'USD'}},'bad,name':{revenue:{amount:1,currency:'USD'}},blog:{revenue:{amount:'x'}}}};
 const parsed=D.parseBoardBackup(JSON.stringify({...board,exportedAt:'2026-11-07T10:00:00Z'}));
 assert.equal(parsed.ok,true);assert.deepEqual(parsed.board.projects,{web:{revenue:{amount:30,currency:'USD'}}},'cleaned on the way in');
 assert.deepEqual(parsed.board.assets[0].projectShares,{web:50,blog:50},'shares travel with the record');
 // Merge into a new Mac: the backup's revenue comes in.
 const empty={blocks:[],assets:[]},plan=D.planBoardBackup(empty,parsed);
 assert.deepEqual(plan.settings.projects,{web:{revenue:{amount:30,currency:'USD'}}});
 const restored=D.applyBoardBackup(empty,plan);
 assert.deepEqual(restored.projects,{web:{revenue:{amount:30,currency:'USD'}}});
 assert.deepEqual(D.projectEconomics(restored.assets,restored.projects,{currency:'USD',rates,now}).projects.map(p=>[p.name,p.net]),[['blog',null],['web',24]]);
 // A local revenue wins over the backup's; projects only the backup has are added.
 const local={blocks:[],assets:[],projects:{web:{revenue:{amount:99,currency:'USD'}}}};
 const both=D.parseBoardBackup({...board,projects:{web:{revenue:{amount:30,currency:'USD'}},api:{revenue:{amount:7,currency:'EUR'}}}});
 assert.deepEqual(D.applyBoardBackup(local,D.planBoardBackup(local,both)).projects,{api:{revenue:{amount:7,currency:'EUR'}},web:{revenue:{amount:99,currency:'USD'}}});
 // Replace takes the backup's as it is.
 assert.deepEqual(D.applyBoardBackup(local,D.planBoardBackup(local,both,{mode:'replace'})).projects,{web:{revenue:{amount:30,currency:'USD'}},api:{revenue:{amount:7,currency:'EUR'}}});
 // A backup without revenue changes nothing locally on merge.
 assert.equal('projects' in D.planBoardBackup(local,D.parseBoardBackup({blocks:[],assets:[]})).settings,false);
 assert.deepEqual(D.backupSettings({projects:'nope'}),{});
});

test('one project can be asked for by name; projects with no visible record are left out',()=>{
 const assets=[{id:'a',type:'server',name:'a',cost:'$5 / 月',project:'p'},{id:'b',type:'server',name:'b',cost:'$5 / 月',project:'q',hiddenAt:'2026-01-01T00:00:00Z'}];
 const eco=D.projectEconomics(assets,{q:{revenue:{amount:1,currency:'USD'}}},{currency:'USD',rates,now});
 assert.deepEqual(eco.projects.map(p=>p.name),['p']);assert.equal(eco.currency,'USD');
 assert.deepEqual(D.projectEconomics(assets,null,{currency:'USD',rates,now,name:' p '}).projects.map(p=>p.name),['p']);
 assert.deepEqual(D.projectEconomics(assets,null,{currency:'USD',rates,now,name:'zz'}).projects,[]);
 assert.deepEqual(D.projectEconomics(null,null).projects,[]);
 assert.equal(D.PROJECT_CURRENCY,'USD');assert.equal(D.projectEconomics(assets,null).currency,'USD','USD is the base currency');
});
