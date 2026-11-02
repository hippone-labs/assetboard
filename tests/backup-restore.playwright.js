// 从备份恢复: the preview always opens with local and backup times per row, the newer local copy is kept by default, a record deleted after
// the backup stays deleted, board settings come back, 整体替换 lists what it deletes and its toast counts are right. The backup carries
// exportedAt and tombstones, and stopping, hiding, restoring, linking and moving to another category stamp updatedAt. Never saves to disk.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(p,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await p.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const old='2026-01-01T00:00:00.000Z',later='2026-10-29T00:00:00.000Z';
 const local={blocks:[{id:'domain',folded:false},{id:'subscription',folded:false},{id:'bankcard',folded:false}],deletedExternalIds:[],assets:[
  {id:'mine',type:'domain',name:'new-name.example.com',source:'manual',art:'generic',date:'2028-01-01',dateKind:'expire',updatedAt:later},
  {id:'theirs',type:'domain',name:'stale.example.com',source:'manual',art:'generic',updatedAt:old},
  {id:'gone',type:'domain',name:'gone.example.com',source:'manual',art:'generic',updatedAt:old},
  {id:'acct',type:'subscription',name:'Example Cloud',source:'manual',art:'generic',updatedAt:old},
  {id:'card',type:'bankcard',name:'Example Card',source:'manual',art:'generic',updatedAt:old}]};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(board=>{
  window.__saves=[];
  window.webkit={messageHandlers:{assetboard:{postMessage(m){if(m.action==='save'){window.__saves.push(m);setTimeout(()=>window.assetboardSaved?.(m.sequence,true),5);}if(m.action==='evidenceList')setTimeout(()=>window.assetboardEvidenceList?.([]),5);}}}};
  window.__ASSETBOARD_NATIVE__={data:board,cloudflareConnected:false,githubConnected:false};
 },local);
 try{
  await p.goto('http://127.0.0.1:4317/');
  await until(p,()=>typeof routeImportText==='function'&&typeof planBoardBackup==='function'&&state.assets.length===5);
  // Writes stamp the record.
  const stamped=await p.evaluate(()=>{
   const at=id=>state.assets.find(a=>a.id===id).updatedAt,reset=id=>{state.assets.find(a=>a.id===id).updatedAt='2026-01-01T00:00:00.000Z';},out={};
   reset('acct');toggleStopped('acct');out.stop=at('acct')>'2026-02';
   reset('theirs');document.body.insertAdjacentHTML('beforeend','<button id="t-hide" data-action="hide-asset" data-id="theirs"></button><button id="t-show" data-action="restore-asset" data-id="theirs"></button>');
   $('#t-hide').click();out.hide=at('theirs')>'2026-02';reset('theirs');$('#t-show').click();out.restore=at('theirs')>'2026-02';$('#t-hide').remove();$('#t-show').remove();
   reset('acct');reset('card');checkpoint();linkRelation(state.assets,'acct','card');out.link=at('acct')>'2026-02'&&at('card')>'2026-02';
   reset('acct');reset('card');unlinkAssets(state.assets,'acct','card');out.unlink=at('acct')>'2026-02'&&at('card')>'2026-02';
   const g={asset:state.assets.find(a=>a.id==='card'),el:document.createElement('div'),slot:document.createElement('div')};reset('card');finishCross(g,'subscription');out.move=at('card')>'2026-02'&&g.asset.type==='subscription';
   return out;
  });
  for(const [what,ok] of Object.entries(stamped))check(ok,`${what} stamps updatedAt`);
  // Put the board back as the test expects it, with a tombstone from deleting a manual record.
  await p.evaluate(board=>{state=structuredClone(board);history=[];future=[];render();deleteAssets(['gone']);},local);
  check(await p.evaluate(()=>state.deletedRecords?.length===1&&state.deletedRecords[0].id==='gone'),'Deleting a manual record leaves a tombstone');
  // The browser backup carries exportedAt and the tombstone.
  const exported=await p.evaluate(()=>{let text='';const keep=window.saveFile;window.saveFile=(name,body)=>{text=body;};try{exportRun('backup');}finally{window.saveFile=keep;}return JSON.parse(text);});
  check(Number.isFinite(Date.parse(exported.exportedAt))&&exported.deletedRecords?.[0]?.id==='gone','The backup carries exportedAt and tombstones');

  // An older backup: merge.
  const backup=JSON.stringify({exportedAt:'2026-03-01T08:30:00.000Z',autoIcons:false,blocks:local.blocks,deletedExternalIds:[],assets:[
   {id:'mine',type:'domain',name:'old-name.example.com',source:'manual',art:'generic',date:'2027-01-01',dateKind:'expire',updatedAt:old},
   {id:'theirs',type:'domain',name:'fresh.example.com',source:'manual',art:'generic',updatedAt:'2026-02-01T00:00:00.000Z'},
   {id:'gone',type:'domain',name:'gone.example.com',source:'manual',art:'generic',updatedAt:old},
   {id:'acct',type:'subscription',name:'Example Cloud',source:'manual',art:'generic',updatedAt:old},
   {id:'card',type:'bankcard',name:'Example Card',source:'manual',art:'generic',updatedAt:old},
   {id:'extra',type:'domain',name:'extra.example.com',source:'manual',art:'generic'}]});
  await p.evaluate(()=>exportDialog());
  await p.setInputFiles('#backup-file',{name:'Assetboard-backup-2026-03-01.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await until(p,()=>$('#modal').dataset.view==='import-preview');
  const preview=await p.locator('#import-preview').textContent();
  check(preview.includes('备份于 2026-03-01'),'The preview says when the backup was made: '+preview.slice(0,200));
  check(await p.locator('#import-preview input[name="import-take"][value="mine"]:not(:checked)').count()===1,'The newer local record is kept by default');
  check(await p.locator('#import-preview input[name="import-take"][value="theirs"]:checked').count()===1,'The newer backup record is taken by default');
  check(preview.includes('本地 2026-10-29')&&preview.includes('备份 2026-01-01'),'Each row shows the local and the backup time');
  check(await p.locator('#import-preview input[name="import-restore"][value="gone"]:not(:checked)').count()===1&&preview.includes('删除于'),'A record deleted after the backup stays deleted unless ticked');
  check(preview.includes('看板设置')&&preview.includes('自动获取网站图标'),'The board settings in the backup are listed');
  check(preview.includes('相同 2 项'),'Unchanged records are counted');
  await p.click('#import-preview [data-action="import-apply"]');
  const merged=await p.evaluate(()=>({mine:state.assets.find(a=>a.id==='mine')?.name,theirs:state.assets.find(a=>a.id==='theirs')?.name,gone:state.assets.some(a=>a.id==='gone'),extra:state.assets.some(a=>a.id==='extra'),autoIcons:state.autoIcons,toast:$('#toast').textContent}));
  check(merged.mine==='new-name.example.com'&&merged.theirs==='fresh.example.com'&&!merged.gone&&merged.extra,'Merge keeps the newer copies: '+JSON.stringify(merged));
  check(merged.autoIcons===false,'Auto icons stay off after the restore');
  check(merged.toast.includes('新增 1')&&merged.toast.includes('更新 1')&&merged.toast.includes('保留本地 1')&&merged.toast.includes('看板设置 1 项'),'The merge toast counts: '+merged.toast);

  // 整体替换 lists the local records it deletes; the toast counts against the old board.
  await p.evaluate(()=>{state.assets.push({id:'after',type:'domain',name:'after-backup.example.com',source:'manual',art:'generic',updatedAt:new Date().toISOString()});render();});
  const small=JSON.stringify({exportedAt:'2026-03-01T08:30:00.000Z',blocks:[{id:'domain'}],assets:[{id:'mine',type:'domain',name:'old-name.example.com',source:'manual',art:'generic',updatedAt:old},{id:'z',type:'domain',name:'z.example.com',source:'manual',art:'generic'}]});
  await p.evaluate(text=>routeImportText(text,{filename:'small.json'}),small);
  await until(p,()=>$('#modal').dataset.view==='import-preview');
  await p.click('#import-preview [data-action="import-mode"][data-id="replace"]');
  check(await p.locator('#import-preview [data-action="import-mode"][data-id="replace"][aria-checked="true"]').count()===1,'整体替换 is chosen');
  const replaceText=await p.locator('#import-preview').textContent();
  const removedCount=await p.evaluate(()=>state.assets.length-1);
  check(replaceText.includes('将删除')&&replaceText.includes('after-backup.example.com')&&replaceText.includes('fresh.example.com'),'The replace preview lists the local records it deletes');
  check(await p.locator('#import-preview .import-group.bad .import-row').count()===removedCount,'Every dropped local record is listed');
  check(await p.locator('#import-preview [data-action="import-apply"].danger').count()===1,'Replace is a clear, distinct action');
  await p.click('#import-preview [data-action="import-apply"]');
  const replaced=await p.evaluate(()=>({ids:state.assets.map(a=>a.id).sort(),toast:$('#toast').textContent}));
  check(replaced.ids.join()==='mine,z','Replace leaves the backup\'s records');
  check(replaced.toast.includes('已整体替换')&&replaced.toast.includes('新增 1')&&replaced.toast.includes('更新 1')&&replaced.toast.includes(`删除 ${removedCount}`)&&!/-\d/.test(replaced.toast),'The replace toast counts: '+replaced.toast);
  await p.evaluate(()=>undo());
  check(await p.evaluate(()=>state.assets.some(a=>a.id==='after')),'⌘Z brings the replaced board back');
  check(!errors.length,'Page errors: '+errors.join(' | '));
 }finally{await context.close();}
 return 'PASS: writes stamp updatedAt, tombstones and exportedAt in the backup, the restore preview with times and per-row choice, deleted-after-backup kept deleted, settings restored, replace lists deletions and counts right';
}
