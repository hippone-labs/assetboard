// CF-Server-Monitor's 导出服务器 file, in the free edition: dropped in the window it writes server assets at once (⌘Z undoes it);
// opened from outside (Dock / 打开方式) it stops at the preview, which names the source, says the 备注 column was left out and
// shows each server's date and cost. On the board a server shows its region, and the detail says where it came from.
// The page makes no request for it.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg,{timeout=5000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const p=await page.context().newPage(),requests=[];
 try {
  await p.goto('http://127.0.0.1:4317/?free');
  p.on('request',request=>requests.push(request.url()));
  const backup=JSON.stringify([
   {id:'9b2c4d3e-1a2b-4c5d-9e8f-7a6b5c4d3e2f',name:'HK-01',server_group:'HK',region:'HK',tags:'',note:'root pw hunter2',price:'12.00',billing_cycle:'month',auto_renewal:'1',currency:'$',expire_date:'2027-03-01',traffic_limit:'1TB',custom_ct:'ct.example.net:80',history_partition_id:1},
   {id:'0f1e2d3c-4b5a-4968-8776-655443322110',name:'JP-02',server_group:'Default',region:'JP',tags:'',note:'',price:'',billing_cycle:'year',auto_renewal:'0',currency:'¥',expire_date:'2026-12-31',traffic_limit:'',custom_ct:'',history_partition_id:2}
  ]);
  const hint=await p.evaluate(()=>{save=()=>{};state={...state,assets:[],deletedExternalIds:[]};render();importHub();return document.querySelector('#import-drop').title;});
  check(hint.includes('CF-Server-Monitor'),'the import window does not mention CF-Server-Monitor backups: '+hint);
  await p.evaluate(text=>handleImportFiles([new File([text],'servers-backup-2026-10-22.json',{type:'application/json'})]),backup);
  const added=await until(p,()=>state.assets.length===2&&state.assets.map(a=>({name:a.name,type:a.type,cost:a.cost,date:a.date,dateKind:a.dateKind,notes:a.notes})));
  const hk=added.find(a=>a.name==='HK-01'),jp=added.find(a=>a.name==='JP-02');
  check(hk&&hk.type==='server'&&hk.cost==='$12.00 / 月'&&hk.date==='2027-03-01'&&hk.dateKind==='renew','HK-01 came in wrong: '+JSON.stringify(hk));
  check(jp&&jp.type==='server'&&jp.cost==='未知'&&jp.dateKind==='expire','JP-02 came in wrong: '+JSON.stringify(jp));
  check(!JSON.stringify(await p.evaluate(()=>state)).match(/hunter2|ct\.example\.net|9b2c4d3e/),'the 备注, probe nodes or panel ids were kept');
  await p.evaluate(()=>{undo();});
  check(await until(p,()=>state.assets.length===0),'⌘Z did not take the import back');
  // From outside the window: the preview first.
  await p.evaluate(text=>queueIntake([{source:'open',name:'servers-backup-2026-10-22.json',text}]),backup);
  const preview=await until(p,()=>document.querySelector('#import-preview')?.textContent);
  check(preview.includes('CF-Server-Monitor')&&preview.includes('HK-01')&&preview.includes('JP-02'),'the preview misses the source or a server: '+preview);
  // One chip for the source (the file name in its tip), 备注 named as left out (not as a key column), and each row's date and cost.
  const chips=await p.evaluate(()=>[...document.querySelectorAll('#import-preview .import-notes .chip')].map(c=>({text:c.textContent,title:c.title})));
  check(chips.length===2&&chips[0].text==='CF-Server-Monitor'&&chips[0].title==='servers-backup-2026-10-22.json'&&chips[1].text==='未导入：备注'&&/密码/.test(chips[1].title),'the preview chips: '+JSON.stringify(chips));
  check(!preview.includes('密钥'),'the preview calls 备注 a key column');
  const rows=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#import-preview .import-row')].map(r=>[r.querySelector('strong').textContent,r.querySelector('.import-facts')?.textContent||''])));
  check(rows['HK-01']==='2027-03-01 扣款 · $12.00 / 月'&&rows['JP-02']==='2026-12-31 到期','the preview rows do not show date and cost: '+JSON.stringify(rows));
  check(!await p.evaluate(()=>state.assets.length),'the preview wrote before it was confirmed');
  await p.click('[data-action="import-apply"]');
  check(await until(p,()=>state.assets.length===2),'confirming the preview wrote nothing');
  // On the board a server without an address shows its region; the detail names where it came from.
  await p.evaluate(()=>showDetail(state.assets.find(a=>a.name==='HK-01').id));
  const board=await until(p,()=>{const detail=document.querySelector('#detail-content').textContent;return detail.includes('HK-01')&&{sub:[...document.querySelectorAll('#board .r-sub')].map(n=>n.textContent),detail};});
  check(board.sub.some(t=>t.includes('中国香港'))&&board.sub.some(t=>t.includes('日本')),'the board rows do not show the region: '+JSON.stringify(board.sub));
  check(/来源\s*CF-Server-Monitor 导入/.test(board.detail)&&!/演示/.test(board.detail),'the detail does not name the source: '+board.detail);
  check(!requests.some(url=>!url.startsWith('http://127.0.0.1')),'the import made a request: '+requests.filter(url=>!url.startsWith('http://127.0.0.1')).join(', '));
 } finally { await p.close(); }
 return 'ok';
}
