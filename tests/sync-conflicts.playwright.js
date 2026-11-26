// Run with the browser tool's filename option. 同步资产板 with a faked Mac host: the other Mac's answer carries the base this Mac kept,
// so a record changed on both is merged field by field (both changes kept), a field changed on both is a conflict listed in 其他设备
// with the value kept, and 换成另一边 takes the other one (one undo step); the next base goes back to the app, and the conflicts are
// kept by it. A clock running two hours fast over there is corrected from its last answer. Never writes data.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,50));}};
 const context=await page.context().browser().newContext({viewport:{width:1500,height:950},reducedMotion:'reduce',locale:'zh-CN'});
 const PEER='a1b2c3d4e5f60718',day=d=>`2026-11-${String(d).padStart(2,'0')}T10:00:00.000Z`;
 try {
  const host=()=>{
   window.__sent=[];window.webkit={messageHandlers:{assetboard:{postMessage(m){window.__sent.push(JSON.parse(JSON.stringify(m)));}}}};
   window.__ASSETBOARD_NATIVE__={demo:false,syncConflicts:[],data:{blocks:[{id:'domain'}],assets:[
    {id:'a',type:'domain',name:'a.example.com',provider:'Namecheap',notes:'mine',purpose:'old',updatedAt:'2026-11-10T10:00:00.000Z',art:'generic'}]}};
  };
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(`(${host.toString()})();`);
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof syncConflictsHtml==='function');
  await p.evaluate(id=>{save=()=>{};setFeature('peers',true);window.assetboardPeers({enabled:true,listening:true,found:[],peers:[{id,name:'mac-mini',host:'192.0.2.40',pairedAt:new Date().toISOString(),sync:true,syncFirst:'merge',syncSince:0,syncDone:true}]});},PEER);
  const sent=op=>p.evaluate(op=>window.__sent.filter(m=>m.action==='peers'&&m.op===op),op);

  // Its last answer says its clock is two hours fast.
  await p.evaluate(id=>window.assetboardPeerFacts({ok:true,id,name:'mac-mini',at:new Date(Date.now()+2*3600e3).toISOString()}),PEER);
  check(await p.evaluate(id=>Math.abs(peerSkew[id]-2*3600e3)<60e3,PEER),'the offset is taken from its answer');

  // Its board: it changed the provider (only it) and the notes (both), at 11:00 on its clock = 09:00 here, before the edit here.
  const theirs={blocks:[{id:'domain'}],assets:[{id:'a',type:'domain',name:'a.example.com',provider:'Porkbun',notes:'theirs',purpose:'old',updatedAt:'2026-11-10T11:00:00.000Z',art:'generic'}],deletedExternalIds:[]};
  const base={a:{id:'a',type:'domain',name:'a.example.com',provider:'Namecheap',notes:'before',purpose:'old',updatedAt:day(1),art:'generic'}};
  await p.evaluate(({id,board,base})=>{window.__sent.length=0;window.assetboardPeerBoard({ok:true,id,board,base});},{id:PEER,board:theirs,base});
  const a=await p.evaluate(()=>state.assets.find(x=>x.id==='a'));
  check(a.provider==='Porkbun'&&a.notes==='mine','its provider comes over, the notes edited here later stay (clock corrected): '+JSON.stringify(a));
  const kept=await sent('syncBase');
  check(kept.length===1&&kept[0].id===PEER&&kept[0].base.a.provider==='Porkbun','the next base goes to the app');
  const conflicts=await sent('conflicts');
  check(conflicts.at(-1)?.list?.length===1&&conflicts.at(-1).list[0].field==='notes'&&conflicts.at(-1).list[0].kept==='mine','the conflict is kept by the app: '+JSON.stringify(conflicts.at(-1)));
  check(await p.evaluate(()=>/1 处两边都改了/.test(document.querySelector('#toast').textContent)),'and said in a toast');

  // The same board again: nothing new, the base is not written again.
  await p.evaluate(({id,board})=>{window.__sent.length=0;window.assetboardPeerBoard({ok:true,id,board,base:JSON.parse(JSON.stringify(peerBaseSent[id]?JSON.parse(peerBaseSent[id]):{}))});},{id:PEER,board:theirs});
  check((await sent('syncBase')).length===0&&(await sent('conflicts')).length===0,'an unchanged base and no new conflict write nothing');

  // 其他设备 lists it; 换成另一边 takes the other value, one undo step.
  await p.evaluate(()=>peersDialog());
  const text=await p.evaluate(()=>document.querySelector('#modal-content').textContent);
  check(/同步冲突/.test(text)&&/a\.example\.com · 备注/.test(text)&&/用了这台的「mine」，另一边是「theirs」/.test(text),'the dialog lists the conflict: '+text.slice(0,300));
  await p.click('[data-action="sync-conflict-swap"]');
  check(await p.evaluate(()=>state.assets.find(x=>x.id==='a').notes==='theirs'&&syncConflicts.length===0),'the other value is taken and the conflict cleared');
  check(await p.evaluate(()=>Date.parse(state.assets.find(x=>x.id==='a').updatedAt)>Date.now()-60e3),'as a fresh edit, so it reaches the other Mac');
  await p.click('#toast .toast-undo');
  check(await p.evaluate(()=>state.assets.find(x=>x.id==='a').notes==='mine'),'one undo step, from the toast');
  check(!errors.length,errors.join(' | '));
  return 'PASS: clock offset from the answer, field-by-field merge with the base, the next base and the conflict handed to the app, nothing rewritten for an unchanged board, the conflict listed and taken over with undo';
 } finally { await context.close(); }
}
