// Run with the browser tool's filename option. Fakes the Mac host and answers each RDAP lookup itself. The weekly registry check
// (research #3, U5) stays off until turned on in the domain category's settings; then every domain not checked this week is asked once:
// the same date is recorded, a lifecycle phase shows on the row, a different date waits in the detail (改成这个 takes it), a failure
// waits a week too; no stored date is changed by itself. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=15000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const host=()=>{
  const ago=n=>new Date(Date.now()-n*86400000).toISOString();
  const rdap=(date,status=['active'])=>({events:[{eventAction:'expiration',eventDate:`${date}T00:00:00Z`}],status,entities:[]});
  const answers={'same.example':{ok:true,json:rdap('2027-03-01')},'moved.example':{ok:true,json:rdap('2027-06-01')},'lapsed.example':{ok:true,json:rdap('2027-01-10',['redemption period'])},'nordap.example':{ok:false,error:'注册局不支持 RDAP'}};
  window.__asked=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m?.action!=='rdap')return;window.__asked.push(m.domain);setTimeout(()=>window.assetboardRdap({requestId:m.requestId,...answers[m.domain]}),5);}}}};
  window.__ASSETBOARD_NATIVE__={demo:false,cloudflareConnected:false,githubConnected:false,data:{blocks:[{id:'domain'}],assets:[
   {id:'same',type:'domain',name:'same.example',date:'2027-03-01',dateKind:'expire',source:'manual',art:'generic'},
   {id:'moved',type:'domain',name:'moved.example',date:'2027-03-01',dateKind:'expire',source:'manual',art:'generic'},
   {id:'lapsed',type:'domain',name:'lapsed.example',date:'2026-10-01',dateKind:'expire',source:'manual',art:'generic'},
   {id:'nordap',type:'domain',name:'nordap.example',date:'2027-02-01',dateKind:'expire',source:'manual',art:'generic'},
   {id:'recent',type:'domain',name:'recent.example',date:'2027-02-01',dateKind:'expire',source:'manual',registryCheckedAt:ago(2),art:'generic'},
   {id:'stopped',type:'domain',name:'stopped.example',date:'2027-02-01',dateKind:'expire',source:'manual',stopped:true,art:'generic'}]}};
 };
 const p=await page.context().newPage();
 try{
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof rdapAutoRun==='function');
  await p.evaluate(()=>{save=()=>{};rdapGapMs=5;});
  await p.waitForTimeout(200);
  check(await p.evaluate(()=>window.__asked.length===0),'Off by default: nothing is asked');
  // Turned on in 设置.
  await p.evaluate(()=>prefsDialog('features'));
  await p.click('#modal [data-action="rdap-auto"]');
  check(await p.evaluate(()=>state.rdapAuto===true),'The switch is saved on the board');
  await p.evaluate(()=>$('#modal').close());
  await until(p,()=>window.__asked.length>=4&&!rdapBusy);
  const r=await p.evaluate(()=>{const by=id=>state.assets.find(a=>a.id===id);return {asked:[...window.__asked].sort(),same:by('same'),moved:by('moved'),lapsed:by('lapsed'),nordap:by('nordap'),row:eventInfo(by('lapsed')).text};});
  check(JSON.stringify(r.asked)===JSON.stringify(['lapsed.example','moved.example','nordap.example','same.example']),'Each domain due is asked once; recent and stopped ones are not: '+r.asked);
  check(r.same.registryCheckedAt&&!r.same.registryExpires&&r.same.date==='2027-03-01','The same date is just recorded');
  check(r.moved.registryExpires==='2027-06-01'&&r.moved.date==='2027-03-01','A different date waits, the stored one stays: '+JSON.stringify(r.moved));
  check(r.lapsed.registryPhase==='redemption'&&r.row.includes('赎回'),'A phase shows on the row: '+r.row);
  check(r.nordap.registryTriedAt&&!r.nordap.registryCheckedAt,'A failed lookup waits a week too');
  // The detail offers the registry's date; 改成这个 takes it.
  const row=await p.evaluate(()=>{showDetail('moved');return [...document.querySelectorAll('#detail-content .fact')].map(f=>f.textContent).find(t=>t.startsWith('注册局'))||'';});
  check(/2027-06-01 到期.*改成这个/.test(row),'The detail shows the registry date: '+row);
  await p.click('#detail-content [data-action="rdap-apply"]');
  check(await p.evaluate(()=>{const a=state.assets.find(x=>x.id==='moved');return a.date==='2027-06-01'&&!a.registryExpires;}),'改成这个 takes it');
  const after=await p.evaluate(()=>[...document.querySelectorAll('#detail-content .fact')].map(f=>f.textContent).find(t=>t.startsWith('注册局'))||'');
  check(/^注册局核对一致 · \d{4}-\d{2}-\d{2}$/.test(after),'and the row keeps only when it agreed: '+after);
  // Run again: everything was checked this week.
  await p.evaluate(()=>{window.__asked=[];rdapAutoRun();});await p.waitForTimeout(200);
  check(await p.evaluate(()=>window.__asked.length===0),'Nothing is asked twice in a week');
 }finally{await p.close();}
 return 'PASS';
}
