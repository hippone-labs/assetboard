// Run with the browser tool's filename option. What came due while the board was not in front of anyone (research U3): opened five days
// after the last look, a notice names what went off meanwhile with its state now, and 查看 opens 即将到来. Opened again right away,
// nothing. A first run says nothing. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const board=()=>{const day=o=>{const d=new Date();d.setDate(d.getDate()+o);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};return {blocks:[{id:'domain'},{id:'subscription'}],assets:[
  {id:'d1',type:'domain',name:'lapsed.example',date:day(-2),dateKind:'expire',source:'manual',art:'generic'},
  {id:'d2',type:'domain',name:'far.example',date:day(200),dateKind:'expire',source:'manual',art:'generic'}]};};
 const open=async seen=>{
  const p=await page.context().newPage();
  await p.addInitScript(([seen,data])=>{try{if(seen===null)localStorage.removeItem('assetboard-seen-v1');else localStorage.setItem('assetboard-seen-v1',String(seen));localStorage.setItem('assetboard-prototype-v1',JSON.stringify(data));}catch{}},[seen,board()]);
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof checkMissed==='function');await p.evaluate(()=>{save=()=>{};});return p;
 };
 const toast=p=>p.evaluate(()=>{const t=$('#toast');return t.classList.contains('show')&&t.classList.contains('notice')?t.textContent:'';});
 let p=await open(Date.now()-5*86400000);
 try{
  const text=await toast(p);
  check(/离开的 5 天里有 1 项到了提醒的时候：lapsed\.example 已过期 2 天/.test(text)&&!/far\.example/.test(text),'The notice names what went off: '+text);
  await p.click('#toast [data-action="missed-view"]');
  check(await p.evaluate(()=>$('#view-title').textContent==='即将到来'),'查看 opens 即将到来');
  await p.close();
  p=await open(Date.now()-60000);check(!(await toast(p)),'Opened again a minute later: nothing');await p.close();
  p=await open(null);check(!(await toast(p)),'A first run says nothing');
  check(await p.evaluate(()=>Number(localStorage.getItem('assetboard-seen-v1'))>Date.now()-60000),'The look is remembered');
 }finally{await p.evaluate(()=>{try{localStorage.removeItem('assetboard-seen-v1');localStorage.removeItem('assetboard-prototype-v1');}catch{}}).catch(()=>{});await p.close();}
 return 'PASS';
}
