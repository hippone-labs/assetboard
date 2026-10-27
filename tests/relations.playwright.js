// v13 B: server relations. Marker instead of name capsules, a calm list (no Peek since v15), grouped detail, legal pairs in the picker, standby/proxied marks, hidden and deleted ends.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const context=await page.context().browser().newContext({viewport:{width:1320,height:822}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');await until(p,()=>typeof render==='function');await p.waitForTimeout(300);
  const mark=id=>p.evaluate(id=>{const m=document.querySelector(`#board [data-asset="${id}"] .rel-mark`);return m&&{label:m.getAttribute('aria-label'),title:m.title,role:m.getAttribute('role'),text:m.textContent.trim(),icon:!!m.querySelector('svg'),dot:!!m.querySelector('.rel-dot'),cls:m.className};},id);
  // Marker: server icon (+ count above one, + colour dot), names only in the label. No name capsules.
  let m=await mark('demo-d1');
  check(m&&m.role==='img'&&m.label==='部署在 tokyo-vps、frankfurt-vps（备用）'&&m.title===m.label&&m.icon&&m.text==='2'&&/amber/.test(m.cls)&&m.dot,'Domain on two servers: icon, 2, amber dot from the primary server, named label: '+JSON.stringify(m));
  m=await mark('demo-d3');check(m&&m.label==='部署在 frankfurt-vps'&&m.text===''&&!m.dot&&m.icon,'One healthy server: icon only, no dot: '+JSON.stringify(m));
  m=await mark('demo-s1');check(m&&m.label==='挂载 5 项'&&m.text==='5'&&!m.icon&&/amber/.test(m.cls),'Server: mount count (visible only) with its own expiry dot: '+JSON.stringify(m));
  m=await mark('demo-s2');check(m&&m.text==='3'&&!m.dot,'Second server: 3 mounts, healthy');
  m=await mark('demo-u3');check(m&&m.label==='名下 2 台服务器'&&m.text==='2','Account: its server count: '+JSON.stringify(m));
  check(await p.evaluate(()=>!document.querySelector('#board [data-asset="demo-d1"] .link-chip')&&!/tokyo-vps/.test(document.querySelector('#board [data-asset="demo-d1"]').innerText)),'No server-name capsule on the card');
  check(await p.evaluate(()=>!document.querySelector('#board [data-asset="demo-r2"] .rel-mark')&&!document.querySelector('#board [data-asset="demo-s3"] .rel-mark')),'Orphans and empty servers stay quiet');
  // v15: the list draws no lines and dims nothing on hover; relations live in the marker, the inspector and the panorama.
  const before=await p.evaluate(()=>[...document.querySelectorAll('#board [data-asset]')].slice(0,30).map(n=>{const r=n.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join();}).join('|'));
  await p.hover('#board [data-asset="demo-s1"] .item-open');await p.waitForTimeout(300);
  const calm=await p.evaluate(()=>({peek:document.querySelector('#board').classList.contains('peeking')||!!document.querySelector('#board .link-peer'),lines:document.querySelectorAll('.link-lines path').length,dim:['demo-d3','demo-r2','demo-s2','demo-u1'].map(id=>getComputedStyle(document.querySelector(`#board [data-asset="${id}"]`)).opacity)}));
  check(!calm.peek&&calm.lines===0&&calm.dim.every(v=>v==='1'),'Hover neither dims nor draws lines: '+JSON.stringify(calm));
  const mid=await p.evaluate(()=>[...document.querySelectorAll('#board [data-asset]')].slice(0,30).map(n=>{const r=n.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join();}).join('|'));
  check(mid===before,'Hover moves and resizes nothing');
  await p.mouse.move(5,5);
  // Detail of a domain: servers grouped, standby and proxied toggles, names and addresses.
  await p.evaluate(()=>showDetail('demo-d1'));
  const dd=await p.evaluate(()=>({rows:[...document.querySelectorAll('#detail .link-row')].map(r=>r.querySelector('b').textContent+'|'+r.querySelector('small').textContent),tags:[...document.querySelectorAll('#detail .link-tag')].map(t=>t.textContent+':'+t.getAttribute('aria-pressed')),groups:document.querySelectorAll('#detail .link-group').length,titles:document.querySelectorAll('#detail .link-group-title').length}));
  check(dd.rows.length===2&&dd.rows[0].includes('203.0.113.10')&&dd.groups===1&&dd.titles===1&&await p.evaluate(()=>document.querySelector('#detail .link-group-title').textContent.startsWith('所在服务器')),'The group is named by what the link means: '+JSON.stringify(dd));
  check(dd.tags.join()==='备用:false,代理:false,备用:true,代理:false','Standby marks the second server, each server has a proxy switch: '+dd.tags.join());
  await p.click('#detail .link-row >> nth=0 >> .link-tag >> nth=1');await p.waitForTimeout(200);
  check(await p.evaluate(()=>JSON.stringify(state.assets.find(a=>a.id==='demo-d1').linkMeta)===JSON.stringify({'demo-s2':{role:'b'},'demo-s1':{proxied:true}})),'Proxy switch stores sparse metadata on the domain');
  check(await p.evaluate(()=>document.querySelectorAll('#detail .link-tag[aria-pressed="true"]').length===2),'Both marks read as pressed');
  await p.evaluate(()=>showDetail('demo-r1'));
  check(await p.evaluate(()=>![...document.querySelectorAll('#detail .link-tag')].some(t=>t.textContent==='代理')),'Only domains get a proxy switch');
  // Detail of a server: groups with titles and counts, domains list the marks read-only.
  await p.evaluate(()=>showDetail('demo-s1'));
  const sd=await p.evaluate(()=>[...document.querySelectorAll('#detail .link-group')].map(g=>g.getAttribute('aria-label')));
  check(sd.join()==='所属账号，1 项,域名，3 项,代码仓库，2 项,数据库，1 项','Server detail groups: '+sd.join());
  check(await p.evaluate(()=>[...document.querySelectorAll('#detail .link-row')].find(r=>/example-studio/.test(r.textContent)).querySelector('.link-tag.on')?.textContent==='代理'),'Server detail shows the child\'s proxy mark read-only');
  check(await p.evaluate(()=>[...document.querySelectorAll('#detail .link-row.is-hidden')].length===1),'Hidden child stays listed, toned down');
  // More than four in a group: the rest sits behind +N.
  await p.evaluate(()=>{for(let i=0;i<5;i++){state.assets.push({id:'x'+i,type:'domain',name:'extra'+i+'.test',provider:'Namecheap',updatedAt:new Date().toISOString(),links:['demo-s1'],source:'manual'});state.assets.find(a=>a.id==='demo-s1').links.push('x'+i);}showDetail('demo-s1');});
  check(await p.evaluate(()=>{const g=[...document.querySelectorAll('#detail .link-group')].find(g=>/域名/.test(g.getAttribute('aria-label')));return g.querySelectorAll(':scope > .link-row').length===4&&g.querySelector('.link-rest summary').textContent==='+4'&&g.querySelectorAll('.link-rest .link-row').length===4;}),'Eight domains: four rows and +4');
  await p.evaluate(()=>{state.assets=state.assets.filter(a=>!a.id.startsWith('x'));state.assets.find(a=>a.id==='demo-s1').links=state.assets.find(a=>a.id==='demo-s1').links.filter(i=>!i.startsWith('x'));render();});
  // Picker: legal pairs only, relation order.
  await p.evaluate(()=>linkPicker('demo-s1'));
  const opt=await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option')].map(o=>o.querySelector('small').textContent.split(' · ')[0]));
  check(opt.length>0&&opt.every(t=>['域名','代码仓库','数据库','软件授权','订阅与工具','银行卡'].includes(t)),'Server picker offers mountable types, accounts and cards only: '+[...new Set(opt)].join());
  check(opt[0]==='域名'||opt[0]==='代码仓库','Mountable things come first');
  await p.evaluate(()=>{$('#modal').close();linkPicker('demo-d2');});
  const opt2=await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option')].map(o=>o.querySelector('small').textContent.split(' · ')[0]));
  check(opt2[0]==='服务器'&&opt2.filter(t=>t==='服务器').length===2&&!opt2.includes('域名'),'Domain picker: servers first (two not yet linked), no other domains: '+opt2.join());
  const ipSmall=await p.evaluate(()=>[...document.querySelectorAll('#modal .link-option')].filter(o=>/服务器/.test(o.querySelector('small').textContent)).map(o=>o.querySelector('small').textContent));
  check(ipSmall.some(t=>/198\.51\.100\.24/.test(t)),'Servers show their address in the picker: '+ipSmall.join());
  await p.evaluate(()=>$('#modal').close());
  // One account per server: linking a second account replaces the first and can be undone.
  await p.evaluate(()=>{showDetail('demo-s1');});
  await p.evaluate(()=>linkPicker('demo-s1'));
  await p.click('#modal .link-option:has-text("Design Studio")');await p.waitForTimeout(250);
  check(await p.evaluate(()=>{const s=state.assets.find(a=>a.id==='demo-s1');return s.links.includes('demo-u2')&&!s.links.includes('demo-u3')&&!state.assets.find(a=>a.id==='demo-u3').links.includes('demo-s1');})&&/已换成新账号/.test(await p.textContent('#toast')),'Second account replaces the first');
  await p.evaluate(()=>undo());await p.waitForTimeout(200);
  check(await p.evaluate(()=>{const s=state.assets.find(a=>a.id==='demo-s1');return s.links.includes('demo-u3')&&!s.links.includes('demo-u2');}),'Undo brings the first account back');
  // Hiding a mounted child lowers the count, restoring raises it; hidden servers neither count nor colour.
  await p.evaluate(()=>{state.assets.find(a=>a.id==='demo-d2').hiddenAt='2026-01-01T00:00:00Z';render();});
  check((await mark('demo-s1')).text==='4','Hidden mounts leave the marker count');
  await p.evaluate(()=>{state.assets.find(a=>a.id==='demo-d2').hiddenAt='';delete state.assets.find(a=>a.id==='demo-d2').hiddenAt;state.assets.find(a=>a.id==='demo-s1').hiddenAt='2026-01-01T00:00:00Z';render();});
  const h=await mark('demo-d2');check(!h,'Only server hidden: the domain card shows no marker: '+JSON.stringify(h));
  await p.evaluate(()=>{delete state.assets.find(a=>a.id==='demo-s1').hiddenAt;render();});
  // Deleting a server: the confirmation says how many links go; links and marks go with it; one undo restores both.
  await p.evaluate(()=>showDetail('demo-s1'));await p.click('#detail [data-action="asset-menu"]');await p.click('#menu [data-action="delete-asset"]');await p.waitForSelector('#modal[open]');
  check(/同时解除 7 项关联，域名和仓库本身不受影响/.test(await p.textContent('#modal')),'Delete states the links that go: '+(await p.textContent('#modal')).slice(0,200));
  await p.click('#modal [data-action="confirm-yes"], #modal .button.danger');await p.waitForTimeout(300);
  check(await p.evaluate(()=>!state.assets.some(a=>a.id==='demo-s1')&&state.assets.filter(a=>(a.links||[]).includes('demo-s1')).length===0&&!JSON.stringify(state.assets.find(a=>a.id==='demo-d1').linkMeta||{}).includes('demo-s1')),'Links and marks to the deleted server are gone');
  check((await mark('demo-d1')).text==='',"The domain now shows a single (second) server");
  check(await p.evaluate(()=>!!state.assets.find(a=>a.id==='demo-d1')&&!!state.assets.find(a=>a.id==='demo-r0')),'Domains and repositories themselves stay');
  await p.evaluate(()=>undo());await p.waitForTimeout(250);
  check(await p.evaluate(()=>state.assets.find(a=>a.id==='demo-d1').links.includes('demo-s1')&&state.assets.find(a=>a.id==='demo-d1').linkMeta['demo-s1'].proxied===true),'One undo restores the server with its links and marks');
  // Reduced motion: no opacity transition.
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(150);
  check(await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#board .row')).transitionDuration)===0),'Reduced motion: no row transition');
  // Priority-type links are listed in the inspector by name.
  await p.evaluate(()=>{state.assets.push({id:'bk',type:'bankcard',name:'Visa',provider:'Bank',last4:'1234',updatedAt:new Date().toISOString(),links:['demo-a1'],source:'manual'});state.assets.find(a=>a.id==='demo-a1').links=['bk'];state.blocks.some(b=>b.id==='bankcard')||state.blocks.push({id:'bankcard',width:30,height:null,density:'full',folded:false});render();});
  await p.evaluate(()=>showDetail('demo-a1',{focus:false}));
  check(await p.evaluate(()=>[...document.querySelectorAll('#detail .link-row b')].some(b=>/Visa/.test(b.textContent))),'Priority-type links are listed in the inspector');
  check(!errors.length,'No page errors: '+errors.join());
  return 'PASS: relation marker (icon, count, colour dot, named label), no name capsules, calm hover without movement or lines, grouped detail with +N, standby and proxy marks, legal-pair picker, one account per server with undo, hidden/deleted ends, reduced motion';
 }finally{await context.close();}
}
