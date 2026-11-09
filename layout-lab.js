// Layout lab: three prototypes for 全部资产 in place of the list, for trying side by side. Only with ?lab=<name> in the address
// (browser build, ?demo for screenshots); without it nothing here draws. A bar on top switches between the list and the three:
//  wall      tile wall: each category a compact panel, the panels flowing in columns, one dense line per record
//  track     the list with a 12-month strip in each row: the next date and the charges after it, where the list had empty space
//  accounts  by account: one card per platform and account (Cloudflare · someone@example.com), its records inside
// Loaded after board-views.js and before app.js; the app.js helpers used here are called only at render time.
const LAB_LAYOUTS=['wall','track','accounts'];
const labLayout=(()=>{try{return new URLSearchParams(location.search).get('lab');}catch{return null;}})();

// The bar: a link per layout, keeping the rest of the address (?demo, ?lang).
function labBarHtml(){
 const link=(id,label)=>{const q=new URLSearchParams(location.search);q.set('lab',id);return `<a class="lab-pick${(labLayout||'list')===id||!LAB_LAYOUTS.includes(labLayout)&&id==='list'?' on':''}" href="?${esc(q.toString())}">${label}</a>`;};
 return `<nav class="lab-bar" aria-label="${tr('原型')}"><span class="lab-tag">${tr('原型')}</span>${link('list',tr('列表'))}${link('wall',tr('磁贴墙'))}${link('track',tr('时间条'))}${link('accounts',tr('按账号'))}</nav>`;
}

// What a record says in one short line: the day count when it has a date (amber, red), otherwise its line from the list.
function labWhen(a){
 const s=assetDateStatus(a);
 if(s.level!=='none'&&!a.stopped)return {text:agendaWhen(s),title:s.label,tone:s.level==='overdue'?'overdue':s.level==='soon'?'soon':''};
 const e=eventInfo(a);return {text:e.text,title:e.text,tone:e.cls==='warn'?'soon':e.cls==='danger'||e.cls==='overdue'?'overdue':'',quiet:true};
}
function labSelected(a){return activeAsset===a.id&&!$('#detail').hidden?' selected':'';}
// One record as a single line: icon, name, day count, cost. The source line goes to the tooltip.
function labLine(a,{type=false}={}){
 const w=labWhen(a),cost=costText(a),sub=subLine(a).text;
 return `<button type="button" class="lab-line${labSelected(a)}${a.stopped?' stopped':''}" data-asset="${esc(a.id)}" data-action="detail" data-id="${esc(a.id)}" title="${esc([displayName(a),type&&cats[a.type]?.one,sub,w.title,cost].filter(Boolean).join('\n'))}">${tile(a,'sm')}<span class="lab-name">${esc(displayName(a))}</span><span class="lab-when${w.tone?' '+w.tone:''}${w.quiet?' quiet':''}">${esc(w.text)}</span><span class="lab-cost">${esc(cost)}</span></button>`;
}
function labMonthly(list){const cur=totalCurrency(),t=costTotals(list,{currency:cur,rates:fx.rates});return t.items.length?tr('约 {money} / 月',{money:esc(formatMoney(t.monthly,cur))}):'';}

// MARK: Tile wall
function labWall(groups){
 return `<div class="lab-wall">${groups.map(({id,list})=>`<section class="lab-panel" data-group="${esc(id)}" aria-label="${esc(cats[id].name)}"><header class="lab-head"><span class="g-icon">${icon(id)}</span><span class="lab-title">${esc(cats[id].name)}</span><span class="g-count">${formatCount(list.length)}</span>${groupSummary(list)}<span class="lab-sum">${labMonthly(list)}</span></header>${list.map(a=>labLine(a)).join('')}</section>`).join('')}</div>`;
}

// MARK: Rows with a time strip
// The strip is the timeline's twelve months from the first of this month: a dot on the next date, small dots on the charges after
// it, an overdue date red at the left edge, a faint line for today. An undated record leaves its strip empty.
function labTrack(groups){
 const today=localDay(),lo=dayNumber(isoDay(today).slice(0,8)+'01'),hi=dayNumber(addMonths(isoDay(lo),12))-1,span=hi-lo+1;
 const at=day=>Math.max(0,Math.min(100,(day-lo)/span*100)).toFixed(2)+'%';
 const months=[...Array(12)].map((_,i)=>new Date(dayNumber(addMonths(isoDay(lo),i))*DAY_MS).toLocaleDateString(trLocale(),{month:'short',timeZone:'UTC'}));
 const strip=a=>{
  const s=assetDateStatus(a);
  if(s.level==='none'||a.stopped)return '<span class="lab-strip blank" aria-hidden="true"></span>';
  const dates=s.days<0?[s.date]:occurrencesBetween({...a,date:s.date},Math.max(lo,dayNumber(s.date)),hi),tone=s.level==='overdue'?' overdue':s.level==='soon'?' soon':'';
  return `<span class="lab-strip" aria-hidden="true">${dates.map((d,i)=>`<i class="tl-mark${i?' later':tone}" style="left:${at(dayNumber(d))}"></i>`).join('')}</span>`;
 };
 const row=a=>{const w=labWhen(a),cost=costText(a),sub=subLine(a);return `<button type="button" class="lab-row${labSelected(a)}${a.stopped?' stopped':''}" data-asset="${esc(a.id)}" data-action="detail" data-id="${esc(a.id)}" title="${esc([displayName(a),sub.text].filter(Boolean).join('\n'))}">${tile(a,'sm')}<span class="lab-ident"><span class="lab-name">${esc(displayName(a))}</span><span class="lab-src">${esc(sub.text)}</span></span>${strip(a)}<span class="lab-when${w.tone?' '+w.tone:''}${w.quiet?' quiet':''}">${esc(w.quiet?w.text:w.title)}</span><span class="lab-cost">${esc(cost)}</span></button>`;};
 return `<div class="lab-track" style="--tl-at:${((today-lo)/span).toFixed(4)}"><div class="lab-months" aria-hidden="true"><span class="lab-mgrid">${months.map(m=>`<span>${esc(m)}</span>`).join('')}</span></div>${groups.map(({id,list})=>`<section class="lab-tgroup" data-group="${esc(id)}" aria-label="${esc(cats[id].name)}"><header class="lab-head"><span class="g-icon">${icon(id)}</span><span class="lab-title">${esc(cats[id].name)}</span><span class="g-count">${formatCount(list.length)}</span>${groupSummary(list)}<span class="lab-sum">${labMonthly(list)}</span></header>${list.map(row).join('')}</section>`).join('')}</div>`;
}

// MARK: By account
// One card per provider (Cloudflare, GitHub, Vultr), its accounts written out in full under the name (they wrap, never cut), the
// records grouped by account inside. Cards with a date coming up go first, then the bigger ones; records without a provider share
// the last card. The cards flow in columns like the tile wall.
function labAccounts(list){
 const cards=new Map();
 for(const a of list){
  const provider=a.provider&&a.provider!=='平台待补充'?a.provider:'',key=provider.toLowerCase();
  (cards.get(key)||cards.set(key,{provider,list:[]}).get(key)).list.push(a);
 }
 const account=a=>a.account&&!assetProfiles[a.type]?veilAccount(a.account):'';
 const next=c=>Math.min(...c.list.map(a=>{const s=assetDateStatus(a);return s.level==='none'||a.stopped?Infinity:s.days;}));
 const sorted=[...cards.values()].sort((x,y)=>(!x.provider)-(!y.provider)||next(x)-next(y)||y.list.length-x.list.length||x.provider.localeCompare(y.provider));
 return `<div class="lab-accounts">${sorted.map(c=>{
  const accounts=[...new Set(c.list.map(account))],many=accounts.filter(Boolean).length>1;
  const body=many?accounts.map(acc=>`${acc?`<p class="lab-account sub">${esc(acc)}</p>`:''}${c.list.filter(a=>account(a)===acc).map(a=>labLine(a,{type:true})).join('')}`).join(''):c.list.map(a=>labLine(a,{type:true})).join('');
  const shown=!many&&accounts[0]?`<span class="lab-account">${esc(accounts[0])}</span>`:'';
  return `<section class="lab-card" aria-label="${esc(c.provider||tr('未注明平台'))}"><header class="lab-chead">${c.provider?tile(c.list[0],'sm'):`<span class="g-icon">${ui('stack')}</span>`}<span class="lab-who"><span class="lab-title">${esc(c.provider||tr('未注明平台'))}</span><span class="g-count">${formatCount(c.list.length)}</span>${groupSummary(c.list)}<span class="lab-sum">${labMonthly(c.list)}</span></span>${shown}</header>${body}</section>`;
 }).join('')}</div>`;
}

// The board for 全部资产 under ?lab, or null to leave it to the list. The overview strip stays on top.
function labBoardHtml(v){
 if(!labLayout||query||v!=='all'||shownLayout(v)!=='list')return null;
 const live=liveAssets();
 if(!LAB_LAYOUTS.includes(labLayout)||!live.length)return null;
 const groups=categoryIds().map(id=>({id,list:arranged(id,live.filter(a=>a.type===id))})).filter(g=>g.list.length);
 const body=labLayout==='wall'?labWall(groups):labLayout==='track'?labTrack(groups):labAccounts(groups.flatMap(g=>g.list));
 return {html:labBarHtml()+overviewHtml(live)+body,count:live.length};
}
