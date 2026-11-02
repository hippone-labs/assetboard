// One mask (maskAsset) for privacy mode, presentation mode, the handover list, the calendar file and agent reads; the .ics repeat
// past the 28th. All names, addresses and numbers are made up (example.* and documentation ranges).
const test=require('node:test'),assert=require('node:assert/strict');
const {MASK_MARK,MASK_SETS,maskValue,maskAsset,maskMail,maskEmail,hasMask,handoverHtml,calendarIcs,icsRepeat,addMonths}=require('../asset-data.js');

const server={id:'s1',type:'server',name:'tokyo-vps',provider:'Vultr',account:'ops@example.org',ips:['203.0.113.10','2001:db8::10'],host:'vps-a.example.com',sshUser:'deploy',sshPort:'2222',
 notes:'billing goes to finance@example.net; root on 203.0.113.10',url:'https://my.example.net/servers/123?tab=1',date:'2027-01-31',cycle:'monthly',dateKind:'renew',cost:'$6 / 月'};
const phone={id:'p1',type:'phone',name:'主号',phone:'+1 555 0100 1234',provider:'Carrier'};

test('maskValue masks one field by its kind and always leaves the mask mark',()=>{
 assert.equal(maskValue('ips','203.0.113.10'),'203.0.•••.•••');
 assert.equal(maskValue('ips','2001:db8::10'),'2001:db8:••••');
 assert.deepEqual(maskValue('ips',['203.0.113.10','198.51.100.7']),['203.0.•••.•••','198.51.•••.•••']);
 assert.equal(maskValue('host','vps-a.example.com'),'v••••••.com');
 assert.equal(maskValue('host','203.0.113.10'),'203.0.•••.•••','an address as host is masked as an address');
 assert.equal(maskValue('sshUser','deploy'),'d•••••');
 assert.equal(maskValue('phone','+1 555 0100 1234'),'+1 ••• 1234');
 assert.equal(maskValue('account','someone@example.com'),'so•••@example.com');
 assert.equal(maskValue('account','someone@example.com',{domain:true}),'so•••@e••••••.com');
 assert.equal(maskValue('account','Acct Name'),'A••••••');
 assert.equal(maskValue('url','https://my.example.net/servers/123'),'https://m••••••.net/…');
 assert.equal(maskValue('notes','anything at all'),'••••••');
 assert.equal(maskValue('name',''),'','empty stays empty');
 for(const [key,value] of [['ips','203.0.113.10'],['host','h.example.com'],['sshUser','root'],['phone','5550100'],['account','a@example.com'],['url','https://example.org'],['notes','x'],['name','n']])
  assert.ok(hasMask(maskValue(key,value)),`${key} holds the mark`);
});

test('maskMail masks every address in a text, the domain only when asked',()=>{
 assert.equal(maskMail('write to finance@example.net or a.b+c@mail.example.org'),'write to fi•••@example.net or a.•••@mail.example.org');
 assert.equal(maskMail('finance@example.net',{domain:true}),'fi•••@e••••••.net');
 assert.equal(maskMail('no address here'),'no address here');
 assert.equal(maskEmail('x@example.com'),'x•••@example.com');
});

test('maskAsset returns a masked copy and leaves the record alone',()=>{
 const before=JSON.stringify(server),agent=maskAsset(server,'agent');
 assert.equal(JSON.stringify(server),before,'the record is unchanged');
 assert.deepEqual(agent.ips,['203.0.•••.•••','2001:db8:••••']);
 assert.equal(agent.host,'v••••••.com');assert.equal(agent.sshUser,'d•••••');
 assert.equal(agent.account,'op•••@example.org');
 assert.equal(agent.notes,'billing goes to fi•••@example.net; root on 203.0.113.10','agents: mail in notes masked, the rest of the notes kept');
 assert.equal(agent.name,'tokyo-vps');assert.equal(agent.sshPort,'2222');assert.equal(agent.id,'s1');assert.equal(agent.url,server.url);
 assert.equal(maskAsset(phone,'agent').phone,'+1 ••• 1234');
 const screen=maskAsset(server,'screen');
 assert.equal(screen.name,'t••••••');assert.equal(screen.host,'v••••••.com');assert.equal(screen.sshUser,'deploy','privacy mode leaves the SSH user, as before');
 const present=maskAsset(server,'present');
 assert.deepEqual(present.ips,['203.0.•••.•••','2001:db8:••••']);assert.equal(present.name,'tokyo-vps');
 const handover=maskAsset(server,'handover');
 assert.equal(handover.account,'op•••@e••••••.org');assert.equal(handover.sshUser,'d•••••');assert.equal(handover.notes,'••••••');assert.equal(handover.url,'https://m••••••.net/…');
 assert.ok(!JSON.stringify(handover).match(/example\.(org|net|com)|203\.0\.113\.10|deploy|2001:db8::10/),'nothing of the record is readable: '+JSON.stringify(handover));
 const calendar=maskAsset(server,'calendar');
 for(const key of MASK_SETS.calendar.drop)if(key in server)assert.equal(calendar[key],'',key);
 assert.equal(calendar.date,server.date);
 assert.equal(maskAsset(server,'nope'),server,'an unknown set masks nothing');
});

test('hasMask finds the mark in text, lists and objects',()=>{
 assert.ok(hasMask('203.0.•••.•••')&&hasMask(['a',`b${MASK_MARK}`])&&hasMask({x:{y:'••'}}));
 assert.ok(!hasMask('plain')&&!hasMask(['a'])&&!hasMask(null)&&!hasMask(3));
});

test('the handover mask covers notes, management links, mail domains and the SSH user',()=>{
 const board={assets:[server,{id:'d1',type:'domain',name:'notes.example',account:'me@example.org',url:'https://dash.example.net/d/1',notes:'transfer code in the vault',links:['c1']},{id:'c1',type:'bankcard',name:'Visa 主卡',last4:'4242',network:'Visa',links:['d1']}]};
 const plain=handoverHtml(board,{now:new Date('2026-11-01T00:00:00Z'),types:{server:'服务器',domain:'域名',bankcard:'银行卡'}});
 assert.ok(plain.includes('deploy@vps-a.example.com')&&plain.includes('href="https://dash.example.net/d/1"')&&plain.includes('transfer code'));
 const html=handoverHtml(board,{now:new Date('2026-11-01T00:00:00Z'),mask:true,types:{server:'服务器',domain:'域名',bankcard:'银行卡'}});
 for(const leak of ['example.org','example.net','example.com','deploy','203.0.113.10','2001:db8::10','transfer code','finance','tokyo-vps','notes.example','Visa 主卡','href='])assert.ok(!html.includes(leak),`the masked handover shows ${leak}`);
 assert.ok(html.includes('名称、账号、地址、备注和链接已遮挡')&&html.includes('•••• 4242'),'it says what is masked and keeps the last 4 digits');
});

// Expands FREQ=MONTHLY;INTERVAL=n with an optional BYMONTHDAY list (or -1) and BYSETPOS=-1, as RFC 5545 reads it.
function expand(dtstart,rule,count){
 const parts=Object.fromEntries(rule.replace(/^RRULE:/,'').split(';').map(x=>x.split('=')));
 const [y,m,d]=dtstart.split('-').map(Number),step=Number(parts.INTERVAL),days=parts.BYMONTHDAY?parts.BYMONTHDAY.split(',').map(Number):[d],out=[];
 for(let i=0;out.length<count&&i<count*step*2;i+=step){
  const total=y*12+m-1+i,year=Math.floor(total/12),month=total%12,last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  let set=days.map(x=>x<0?last+1+x:x).filter(x=>x>=1&&x<=last).sort((a,b)=>a-b);
  if(parts.BYSETPOS==='-1')set=set.slice(-1);
  for(const day of set)out.push(`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
 }
 return out;
}

test('a monthly repeat past the 28th lands in every month, on the day the app uses',()=>{
 assert.equal(icsRepeat('2026-11-05',1),'RRULE:FREQ=MONTHLY;INTERVAL=1');
 assert.equal(icsRepeat('2027-01-31',1),'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1');
 assert.equal(icsRepeat('2027-01-30',1),'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30;BYSETPOS=-1');
 assert.equal(icsRepeat('2028-02-29',12),'RRULE:FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=28,29;BYSETPOS=-1');
 for(const [start,months] of [['2027-01-31',1],['2027-01-30',1],['2027-01-29',1],['2026-10-31',3],['2028-02-29',12],['2027-08-31',6],['2027-03-15',1]]){
  const want=Array.from({length:24},(_,i)=>addMonths(start,i*months)),got=expand(start,icsRepeat(start,months),24);
  assert.deepEqual(got,want,`${start} every ${months}`);
 }
 const ics=calendarIcs([{id:'m',name:'月付',date:'2027-01-31',dateKind:'renew',cycle:'monthly'}],{now:new Date('2026-11-01T00:00:00Z')});
 assert.ok(ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1'));
});

test('the calendar with 只写类别和天数 writes the category and the days only',()=>{
 const assets=[server,{id:'cloudflare-zone-abc123',type:'domain',name:'secret-project.example',provider:'Cloudflare',account:'me@example.org',project:'secret',date:'2027-03-01',dateKind:'expire',url:'https://dash.example.net/zone',notes:'n'}];
 const full=calendarIcs(assets,{now:new Date('2026-11-01T00:00:00Z')});
 assert.ok(full.includes('secret-project.example')&&full.includes('me@example.org'),'the full calendar has the details');
 const ics=calendarIcs(assets,{now:new Date('2026-11-01T00:00:00Z'),minimal:true,types:{server:'服务器',domain:'域名'}});
 const unfolded=ics.replace(/\r\n /g,'');
 for(const leak of ['tokyo','Vultr','example','secret','abc123','cloudflare','$6','DESCRIPTION:平台','URL:'])assert.ok(!unfolded.includes(leak),`minimal calendar shows ${leak}`);
 assert.ok(unfolded.includes('SUMMARY:域名 到期')&&unfolded.includes('SUMMARY:服务器 扣款'),unfolded);
 assert.ok(/DESCRIPTION:域名 30 天后到期/.test(unfolded)&&/DESCRIPTION:服务器 3 天后扣款/.test(unfolded),'alarms say the category and the days');
 assert.equal((unfolded.match(/BEGIN:VEVENT/g)||[]).length,2);
 const uids=unfolded.match(/UID:[^\r]+/g);
 assert.ok(uids.every(u=>/^UID:[0-9a-f]{16}@assetboard\.local$/.test(u))&&new Set(uids).size===2,'UIDs are hashes: '+uids);
 assert.equal(calendarIcs(assets,{now:new Date('2026-11-01T00:00:00Z'),minimal:true,types:{server:'服务器',domain:'域名'}}),ics,'the same file each time');
});
