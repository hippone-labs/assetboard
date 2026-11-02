// The import gate: password manager exports, secret files, secret rows, quoted multi-line cells and vendor presets.
// Every sample is made up (example.* names, test card numbers, fake keys).
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../asset-data.js');
const {parseDelimitedText,rowsToImportItems,importGate,importFileKind,passwordExportOf,screenText,secretKinds,screenBackup,parseBoardBackup,parseAgentImport,parseCfsmBackup,importHeaderField,VENDOR_CSV_PRESETS}=D;

// Built at run time, so a scan of the tree for key and token prefixes stays clean.
const FAKE_TOKEN='gh'+'p_'+'FAKE'.repeat(7);
const FAKE_KEY=['-----','BEGIN OPENSSH PRIVATE KEY-----\nFAKEFAKEFAKEFAKE\n-----END OPENSSH PRIVATE KEY-----'].join('');
const vaults={
 Bitwarden:'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,Example,"Backup codes:\nFAKE1, FAKE2, FAKE3, FAKE4, FAKE5",,0,https://example.com,me@example.com,FakePw1,JBSWY3DPEHPK3PXP\n,,note,Server notes,root password is FakeRootPw,,0,,,,\n',
 Apple:'Title,URL,Username,Password,Notes,OTPAuth\nExample (me@example.com),https://example.com/,me@example.com,FakePw1,"Some notes\nMore notes on new line",otpauth://totp/test?secret=examplesecret\n',
 Chrome:'name,url,username,password,note\r\nexample.com,https://example.com/,me@example.com,FakePw1,"First line\r\nSecond line with quotes"""\r\n',
 Firefox:'"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n"https://example.com","me@example.com","FakePw1",,"https://example.com","{00000000-0000-0000-0000-000000000000}","1700000000000","1700000000000","1700000000000"\n',
 '1Password':'Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nExample,https://example.com,me@example.com,FakePw1,,false,false,,\n',
 KeePassXC:'"Group","Title","Username","Password","URL","Notes","TOTP","Icon","Last Modified","Created"\n"Root","Example","me@example.com","FakePw1","https://example.com","","","0","2026-01-01T00:00:00Z","2026-01-01T00:00:00Z"\n'
};

test('password manager exports are refused whole, by header row or file shape',()=>{
 for(const [vendor,text] of Object.entries(vaults)){
  assert.equal(passwordExportOf(text),vendor,vendor);
  for(const filename of ['passwords.csv',''])assert.deepEqual(importGate({text,filename}),{kind:'refused',reason:'passwords',vendor,filename},`${vendor} ${filename}`);
 }
 assert.equal(passwordExportOf('Name,URL,Email,Password\nExample,https://example.com,me@example.com,FakePw1'),'other','any table of web logins with passwords');
 assert.equal(passwordExportOf(JSON.stringify({encrypted:false,folders:[],items:[{type:1,name:'Example',login:{username:'me',password:'FakePw1'}}]})),'Bitwarden');
 assert.equal(passwordExportOf(JSON.stringify({encrypted:true,passwordProtected:true,data:'AAAA'})),'Bitwarden');
 assert.equal(passwordExportOf('<?xml version="1.0" encoding="utf-8"?>\n<KeePassFile><Meta/></KeePassFile>'),'KeePassXC');
 // Tables of assets are not password exports.
 for(const text of [D.demoImportSampleCsv(),'Name,Expires\nexample.com,2027-03-01','Name,IP,User,Region\nbox-1,192.0.2.10,deploy,US',JSON.stringify({assetboard:1,items:[{name:'example.dev'}]})])assert.equal(passwordExportOf(text),'',text.slice(0,30));
});

test('secret files, spreadsheets and binary formats are not read as text',()=>{
 for(const name of ['.env','.env.local','prod.env','id_ed25519','id_rsa','server.pem','tls.key','vault.kdbx','export.1pux','cert.p12','credentials'])assert.equal(importFileKind(name),'secret',name);
 for(const name of ['bills.xlsx','bills.numbers','archive.zip','README','id_ed25519.pub','report.docx'])assert.equal(importFileKind(name),'other',name);
 for(const name of ['list.csv','list.tsv','backup.json','receipt.eml','notes.txt','calendar.ics'])assert.equal(importFileKind(name),'text',name);
 assert.equal(importFileKind('shot.png'),'image');assert.equal(importFileKind('bill.pdf'),'pdf');assert.equal(importFileKind('','image/png'),'image');
 assert.equal(importFileKind(''),'text','pasted text has no file name');
 assert.equal(importFileKind('','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),'other');
 assert.deepEqual(importGate({text:'API_KEY=FAKE',filename:'.env'}),{kind:'refused',reason:'secret',filename:'.env'});
 assert.equal(importGate({text:'garbage',filename:'bills.xlsx'}).reason,'other');
});

test('pasted text with a key, a token, a TOTP secret or .env lines is refused; card numbers are masked; only pasted text and mail go to the AI',()=>{
 assert.deepEqual(importGate({text:FAKE_KEY}),{kind:'refused',reason:'secrets',found:['key'],filename:''});
 assert.deepEqual(importGate({text:'my 2FA otpauth://totp/Example:me?secret=JBSWY3DPEHPK3PXP'}).found,['totp']);
 assert.deepEqual(importGate({text:'token '+FAKE_TOKEN}).found,['token']);
 assert.deepEqual(importGate({text:'# local\nDATABASE_URL=postgres://db.example.com/app\nAPI_KEY=FAKE\nDEBUG=1'}).found,['env']);
 const receipt='Your plan renews on October 6, 2026 for $15.00/month';
 assert.deepEqual(importGate({text:receipt}),{kind:'paste',text:receipt,maskedCards:0,ai:true});
 assert.equal(importGate({text:receipt,filename:'notes.txt'}).ai,false,'a text file is reviewed, not sent to the AI on its own');
 const card=importGate({text:'Charged card 4111 1111 1111 1111 for $15.00'});
 assert.equal(card.kind,'paste');assert.equal(card.maskedCards,1);assert.equal(card.text,'Charged card •••• 1111 for $15.00');
 assert.equal(importGate({text:'From: billing@example.com\nSubject: Receipt\n\nThanks',filename:'r.eml'}).ai,true);
 assert.equal(importGate({text:'名称,类别\nexample.com,域名\n'}).ai,false);
 assert.equal(importGate({filename:'shot.png',mime:'image/png'}).ai,true);
 assert.equal(screenText('order 2026-11-02, phone +86 138 0000 0000, IP 192.0.2.10').ok,true,'dates, phones and IPs are not secrets');
 assert.equal(screenText('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKEFAKE me@example').ok,true,'a public key is not a secret');
});

test('quoted cells keep their newlines, delimiters and quotes, and rows keep their first line number',()=>{
 const parsed=parseDelimitedText('名称,类别,备注\r\n"notes.example.com",域名,"line one\r\nline two, with commas, and more, and more"\r\n"say ""hi"".dev",域名,plain\r\n\r\nlast.dev,域名,\n');
 assert.equal(parsed.ok,true);
 assert.deepEqual(parsed.rows.map(row=>row._line),[2,4,6]);
 const {items,unreadable}=rowsToImportItems(parsed);
 assert.equal(unreadable.length,0);
 assert.deepEqual(items.map(item=>item.name),['notes.example.com','say "hi".dev','last.dev']);
 assert.equal(items[0].notes,'line one\nline two, with commas, and more, and more');
 // A quote in the middle of a cell is an ordinary character.
 assert.deepEqual(D.splitDelimitedLine('box-1,15" screen,ok',','),['box-1','15" screen','ok']);
 // Wallos-style two-paragraph notes stay in one record.
 const wallos=parseDelimitedText('Name,Notes,Price\nExample Notes,"First paragraph.\n\nSecond, longer paragraph",5\n');
 assert.equal(wallos.rows.length,1);assert.equal(rowsToImportItems(wallos).items.length,1);
});

test('a row with a full card number, a private key, a token or a TOTP secret anywhere is left out and reported',()=>{
 const csv=`Name,Notes,Extra\nMy Card,card 4111 1111 1111 1111 exp 12/29,\nok.example.com,fine,\nbox-1,,"${FAKE_KEY}"\nmail,,otpauth://totp/x?secret=JBSWY3DPEHPK3PXP\nci,${FAKE_TOKEN},\n`;
 const parsed=parseDelimitedText(csv);
 const {items,refused}=rowsToImportItems(parsed);
 assert.deepEqual(items.map(item=>item.name),['ok.example.com']);
 assert.deepEqual(refused.map(row=>[row.line,row.found]),[[2,['card']],[4,['key']],[7,['totp']],[8,['token']]]);
 assert.ok(!JSON.stringify(items).includes('4111'));
 // Agent files (the Inbox folder, a pasted or dropped JSON) go through the same rows.
 const agent=rowsToImportItems(parseAgentImport({assetboard:1,items:[{name:'pay.example.com',notes:'card 4111111111111111'},{name:'fine.example.com'}]}));
 assert.deepEqual(agent.items.map(item=>item.name),['fine.example.com']);assert.deepEqual(agent.refused,[{line:1,found:['card']}]);
 // CF-Server-Monitor backups too.
 const cfsm=parseCfsmBackup(JSON.stringify([{name:'box-1',billing_cycle:'month',expire_date:'',tags:'otpauth://totp/x?secret=A'},{name:'box-2',billing_cycle:'month',expire_date:''}]));
 assert.deepEqual(cfsm.items.map(item=>item.name),['box-2']);assert.equal(cfsm.refused.length,1);
});

test('secret columns: passwords, TOTP and keys under any name are dropped and kept nowhere',()=>{
 for(const header of ['Password','login_password','login_totp','OTPAuth','TOTP','API Key','Secret Key','Recovery codes','MASTER-PASSWORD','密码','恢复码'])assert.equal(importHeaderField(header),'secret',header);
 for(const header of ['Name','Notes','Provider','Expires','Domain'])assert.notEqual(importHeaderField(header),'secret',header);
 const parsed=parseDelimitedText('Name,API Key,Notes\nexample.com,FakeKeyValue,hello\n');
 assert.deepEqual(parsed.droppedSecrets,['API Key']);
 assert.ok(!JSON.stringify(parsed.rows).includes('FakeKeyValue'),'not even under its raw header');
});

test('vendor presets write the provider they name; the file\'s own provider column wins',()=>{
 const samples={namecheap:'Domain Name,Expires\nexample.com,2027-03-01',godaddy:'Domain Name,Expiration Date\nexample.com,2027-03-01',porkbun:'Domain,Expire Date\nexample.com,2027-03-01',
  aliyun:'域名,到期日期\nexample.cn,2027-03-01',tencent:'域名,到期时间\nexample.cn,2027-03-01',vultr:'Label,Main IP\nbox-1,192.0.2.10',digitalocean:'Name,IP Address,Region\nbox-1,192.0.2.10,nyc1',hetzner:'Name,IPv4\nbox-1,192.0.2.10'};
 assert.deepEqual(Object.keys(samples).sort(),VENDOR_CSV_PRESETS.map(p=>p.id).sort());
 for(const preset of VENDOR_CSV_PRESETS){
  const parsed=parseDelimitedText(samples[preset.id]);
  assert.equal(parsed.preset?.id,preset.id,preset.id);
  const {items,preset:used}=rowsToImportItems(parsed);
  assert.equal(items.length,1,preset.id);assert.equal(items[0].provider,preset.label,preset.id);assert.equal(used?.id,preset.id);
 }
 const own=rowsToImportItems(parseDelimitedText('Domain Name,Registrar,Expires\nexample.com,Example Registrar,2027-03-01'));
 assert.equal(own.items[0].provider,'Example Registrar');assert.equal(own.items[0].type,'domain');
 // With the provider set, the after-expiry rule and the vendor icon line up.
 const namecheap=rowsToImportItems(parseDelimitedText(samples.namecheap)).items[0];
 assert.equal(D.iconVendor({...namecheap,id:'x'})?.host,'namecheap.com');assert.equal(D.lifecycleRule({...namecheap,id:'x'})?.id,'namecheap-domain');
});

test('a board backup restores no record that holds a card number, a key, a token or a TOTP secret',()=>{
 const backup=parseBoardBackup(JSON.stringify({blocks:[{id:'domain'}],assets:[
  {id:'asset-12345678-1234-4123-8123-123456789012',type:'domain',name:'example.com',createdAt:'2026-01-01T00:00:00Z'},
  {id:'b',type:'bankcard',name:'Card',notes:'4111 1111 1111 1111'}
 ]}));
 const {backup:screened,refused}=screenBackup(backup);
 assert.deepEqual(screened.board.assets.map(a=>a.name),['example.com']);
 assert.deepEqual(refused,[{name:'Card',found:['card']}]);
 assert.equal(screenBackup({ok:false,error:'x'}).refused.length,0);
 assert.deepEqual(secretKinds('nothing here 2027-03-01'),[]);
});
