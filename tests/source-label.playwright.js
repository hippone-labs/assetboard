// Run with the browser tool's filename option. The detail says when a record came in: 导入于 for a file import (a table, a backup),
// 同步于 for what is read again from a live source (Cloudflare, GitHub, ~/.ssh/config). Decided from the record's source; no new field.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.goto('http://127.0.0.1:4317/');
 const at='2026-10-20T08:00:00.000Z';
 const labels=await page.evaluate(at=>{save=()=>{};
  state={blocks:[{id:'server',width:50},{id:'repository',width:50}],deletedExternalIds:[],assets:[
   {id:'i',type:'server',name:'imported-box',provider:'Vultr',source:'csv',importedFrom:'CF-Server-Monitor',syncedAt:at,art:'generic'},
   {id:'g',type:'repository',name:'me/app',provider:'GitHub',source:'github',syncStatus:'私有仓库',syncedAt:at,art:'generic'},
   {id:'s',type:'server',name:'ssh-box',provider:'SSH',source:'ssh',host:'box.example.net',syncedAt:at,art:'generic'}]};render();
  const facts=id=>{showDetail(id);return [...document.querySelectorAll('#detail-content .fact span:first-child')].map(n=>n.textContent);};
  return {i:facts('i'),g:facts('g'),s:facts('s')};},at);
 check(labels.i.includes('导入于')&&!labels.i.includes('同步于'),'An imported record says 导入于: '+labels.i);
 check(labels.g.includes('同步于')&&!labels.g.includes('导入于'),'A GitHub record says 同步于: '+labels.g);
 check(labels.s.includes('同步于'),'An ~/.ssh/config record says 同步于: '+labels.s);
 return 'PASS';
}
