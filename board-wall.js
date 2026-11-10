// Tile wall: 全部资产 as a wall of category panels, the default layout (列表, 网格 and 时间轴 stay in the layout switch). Each panel is a
// category: its header, then a tile per record (the same rows as the list, so ⌥↑↓, dragging, the quick actions and a click to the
// inspector all work as there). The panels are packed into columns, each into the shortest column, so they read left to right.
// Three columns are the wall: a window too narrow for three at WALL_MIN_COL gets two, then one, and only a window where three would
// each be wider than WALL_MAX_COL gets a fourth. The column count is the same in every density.
// A tile is a fixed structure (MARK: Tile): every kind of fact has its place, so one kind reads down a panel in one column, and a
// tile is as tall as every other in its density. A text too long for its place is cut on its one line (a domain, an address or a
// long identifier in the middle, keeping its end; other text at the end); the whole text is in its title and in the peek.
// Dragging a panel by its header (or ⌥ + arrows on its title) moves the category: the same order as the sidebar's.
// Three densities say how much a tile holds; ⌘− and ⌘= (a pinch on the trackpad) step through them, the view keeping its place:
//  glance    one line: name, day count and the amber or red dot: as much of the board on one screen as fits
//  standard  two lines: + the fields (IP, account, platform, or a live reading) in columns, the price at the right end
//  detail    the name line, then every known fact of the record (the cost among them), one line each, by weight (wallFacts)
// Hovering a line (or reaching it with the keyboard while the inspector is closed) shows the same facts in a card beside it.
// How the panels look (tilt, edge, the lift of a dragged panel) is the skin's (theme.js, material.css); this file only lays out.
// Loaded after board-views.js and before app.js; the app.js helpers used here are called only at render and event time.
const WALL_DENSITIES=['glance','standard','detail'];
const WALL_DENSITY_NAMES={glance:tr('全局'),standard:tr('标准'),detail:tr('详细')};
const WALL_MIN_COL=280,WALL_MAX_COL=560,WALL_COLS=3,WALL_GAP=12;
let wallDensity='standard';

// A dated line says only its day count (12 天, 过期 3 天), and a line in a stage after its date the stage and the days it has left
// (赎回期 29 天); the full label stays in the item's name, the line's title and the inspector. A line that is a question or a state
// (续上了吗？, 冻结), or a prepaid credit's expiry (not a renewal), keeps it.
function wallWhen(a,e){
 const life=lifecycleOf(a);if(life&&!life.gone&&e.text===life.label)return {text:tr('{stage} {n} 天',{stage:life.stage.label,n:life.daysLeft+1}),cls:e.cls};
 const s=assetDateStatus(a);if(s.level==='none'||a.stopped||a.creditExpiry)return e;
 return e.text===(a.creditExpiry?tr('额度{status}',{status:s.label}):s.label)?{text:agendaWhen(s),cls:e.cls}:e;
}

// MARK: Facts
// Every known fact of a record, by weight: 1 who and where (IP, account, registrar or platform, region), 2 time and money (the next
// date with its cycle, auto-renewal, cost, the card that pays), 3 the rest (links, purpose, keep reason, SSH, folder, DNS, filing,
// state, importance, source, note). An empty field is left out. Names, accounts and IPs follow privacy mode.
function wallFacts(a){
 const provider=a.provider==='平台待补充'?'':a.provider||'',ips=assetIps(a).map(x=>veilIp(x.ip)).join('  ');
 const who={bankcard:[tr('卡号'),[a.network&&tr(a.network),a.last4&&`•••• ${a.last4}`].filter(Boolean).join(' ')],phone:[tr('号码'),maskPhone(a.phone)],appleid:[tr('账号'),maskEmail(a.account)],google:[tr('账号'),maskEmail(a.account)]}[a.type]||[tr('账号'),veilAccount(a.account)];
 const by={domain:tr('注册商'),bankcard:tr('发卡行'),phone:tr('运营商')}[a.type]||tr('平台');
 const links=linkedAssets(state.assets,a),cards=a.type==='bankcard'?[]:links.filter(x=>x.type==='bankcard'),rest=links.filter(x=>!cards.includes(x));
 const names=list=>list.slice(0,3).map(displayName).join(tr('、'))+(list.length>3?tr(' 等 {n} 项',{n:list.length}):'');
 const when=!a.date?'':a.type==='bankcard'?`${expiryText(a.date)} · ${assetDateStatus(a).label}`:dateText(a);
 const ssh=a.type==='server'&&(a.host||a.sshAlias)?[a.host&&`${a.sshUser?a.sshUser+'@':''}${veilHost(a.host)}${a.sshPort?':'+a.sshPort:''}`,a.sshAlias&&`ssh ${a.sshAlias}`].filter(Boolean).join(' · '):'';
 return [
  [1,'IP',ips],[1,...who],[1,by,provider],[1,tr('地区'),a.region?[regionFlag(a.region),regionName(a.region)].filter(Boolean).join(' '):''],
  [2,a.type==='bankcard'?tr('有效期'):dateKinds[a.dateKind]?.label||tr('下一日期'),when],[2,tr('自动续费'),AUTO_RENEW_WORDS[a.autoRenew]||''],
  [2,tr('费用'),[costText(a),costHint(a)].filter(Boolean).join(' · ')],[2,tr('付款方式'),cards.map(c=>c.last4?`•••• ${c.last4}`:displayName(c)).join(tr('、'))],
  [3,tr('关联'),names(rest)],[3,tr('用途'),a.purpose&&a.purpose!==cats[a.type]?.name?a.purpose:''],[3,tr('保留原因'),a.reason],[3,'SSH',ssh],
  [3,tr('本机目录'),a.type==='repository'?a.localPath:''],[3,tr('DNS 托管'),a.type==='domain'?a.dnsHost:''],[3,tr('备案'),a.type==='domain'?a.icp:''],
  ...wallAiFacts(a),
  [3,tr('状态'),CARD_STATUSES[a.cardStatus]||PHONE_STATUSES[a.phoneStatus]||''],[3,tr('重要程度'),IMPORTANCE[a.importance]||''],[3,tr('来源'),shownSource(a)],[3,tr('备注'),a.notes]
 ].filter(([,,v])=>v);
}
// An AI subscription's reading (ai-usage-view.js), with time and money: each window's use and reset, the period's use at API prices,
// whether it is worth its price, and when it was last used here.
function wallAiFacts(a){
 const q=typeof aiQuotaFor==='function'?aiQuotaFor(a):null;if(!q)return [];
 return [
  [2,tr('额度'),q.windows.map(w=>`${aiWindowName(w)} ${Math.round(w.used)}%${w.resetsAt?` · ${aiResetText(w.resetsAt)}`:''}`).join('\n')||(q.limitHit?tr('用完了，{when}',{when:aiResetText(q.limitHit.resetsAt)}):'')],
  [2,tr('本期用量'),q.period.n?`${aiUsd(q.period.cost)} · ${aiTokens(q.period.tokens)} tokens`:''],
  [2,tr('值不值'),q.value!=null?(q.value>=1?tr('本期用量按 API 价是订阅价的 {x} 倍',{x:q.value}):tr('本期用量按 API 价只有订阅价的 {x} 倍',{x:q.value})):''],
  [2,tr('最近使用'),q.last?aiAgoText(q.last):'']
 ];
}
// In a tile a fact is one line, cut when it is too long (the title has it whole); a reading's windows keep a line each, and the
// cost carries the price's mark (a promotion, a rise). The peek has the room to wrap.
function wallFactsHtml(a,cls){
 let tier=0;const tile=cls==='r-facts';
 const html=wallFacts(a).map(([t,k,v])=>{const gap=tier&&t!==tier?' gap':'';tier=t;
  const value=!tile?`<span class="fact-v t${t}${gap}">${esc(v)}</span>`:/\n/.test(v)&&k===tr('额度')?`<span class="fact-v fact-lines t${t}${gap}" title="${esc(v)}">${esc(v)}</span>`:wallTextHtml(String(v).replace(/\s*\n\s*/g,' '),`fact-v t${t}${gap}`);
  return `<span class="fact-k t${t}${gap}"${tile?` title="${esc(k)}"`:''}>${esc(k)}</span>${tile&&k===tr('费用')?`<span class="fact-v fact-cost t${t}${gap}">${priceMark(a)}${wallTextHtml(v)}</span>`:value}`;}).join('');
 return html?`<span class="${cls}">${html}</span>`:'';
}

// MARK: Tile
// Where a text that does not fit is cut in the middle, as [head, tail] (the tail always stays): an address keeps its @host, a domain
// its registered name, a long identifier without spaces (an IPv6 address, a key's name) its last characters. Anything else (a
// name in words) is cut at its end and gives null.
const WALL_SECOND_LEVEL=['co','com','net','org','gov','edu','ac'];
function wallCut(text){
 const t=String(text||'');if(t.length<12||/\s/.test(t))return null;
 const at=t.lastIndexOf('@');if(at>0&&at<t.length-3)return [t.slice(0,at),t.slice(at)];
 const labels=t.split('.');
 if(labels.length>1&&/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)&&/^[a-z]{2,}$/i.test(labels.at(-1))){
  const want=labels.length>3&&labels.at(-1).length===2&&WALL_SECOND_LEVEL.includes(labels.at(-2).toLowerCase())?3:2,keep=labels.length>want?want:1;
  return [labels.slice(0,-keep).join('.'),'.'+labels.slice(-keep).join('.')];
 }
 return t.length>=20&&/^[\w.:\/+-]+$/.test(t)?[t.slice(0,-6),t.slice(-6)]:null;
}
// A text on one line of a tile. The whole text is the element's content and its title; when it is cut in the middle the head and
// the tail are drawn from data-head and data-tail (material.css, .w-mid), the head giving way first.
function wallTextHtml(text,cls='',title=text){
 const t=String(text??''),cut=wallCut(t);
 return `<span class="${[cls,'w-text',cut&&'w-mid'].filter(Boolean).join(' ')}"${cut?` data-head="${esc(cut[0])}" data-tail="${esc(cut[1])}"`:''} title="${esc(title)}">${cut?`<span class="w-full">${esc(t)}</span>`:esc(t)}</span>`;
}
// The fields of a 标准 tile's second line, each in its own column, so one kind of fact is at one place down a panel. A field the
// record has nothing for is left empty; the others keep their columns.
//  1  what the record is reached or known by: a server's address (or its region), a card's or a number's digits, a sign-in
//     account, an AI plan's service; for everything else the platform
//  2  the platform (a server's, a card's bank, a number's carrier); for everything else the account
//  3  what hangs on a card, a number or an account (支付 5 项), at the right end with the price
function wallFields(a){
 const provider=a.provider==='平台待补充'?'':a.provider||'',flag=regionFlag(a.region),flagHtml=flag?`<span class="flag" title="${esc(regionName(a.region))}">${flag}</span>`:'';
 const text=(value,cls,title)=>value?wallTextHtml(value,cls,title):'';
 const impact=linkImpact(state.assets,a),hangs=impact.length&&IMPACT_WORDS[a.type]?`<span class="w-text r-impact" title="${esc(impact.map(displayName).join(tr('、')))}">${tr('{verb} {n} 项',{verb:IMPACT_WORDS[a.type].verb,n:formatCount(impact.length)})}</span>`:'';
 if(a.type==='server'){
  const ip=primaryIp(a);
  const where=ip?`${flagHtml}${ip.inner?`<em class="ip-inner" title="${tr('内网地址')}">${tr('内')}</em>`:''}${text(veilIp(ip.ip),'ip-text',assetIps(a).map(x=>veilIp(x.ip)).join('  '))}${ip.more?`<em class="ip-more" aria-label="${tr('另有 IPv6')}">+${ip.more}</em>`:''}`:flag?`${flagHtml}${text(regionName(a.region))}`:'';
  return [where,text(provider),hangs];
 }
 if(assetProfiles[a.type]){
  const identity={bankcard:[a.network&&tr(a.network),a.last4&&`•••• ${a.last4}`].filter(Boolean).join(' '),phone:maskPhone(a.phone),appleid:maskEmail(a.account)||regionName(a.region),google:maskEmail(a.account)||regionName(a.region),ai:provider}[a.type]||'';
  return [identity?`${flagHtml}${text(identity)}`:'',text({bankcard:provider,phone:provider}[a.type]),hangs];
 }
 // A synced record's account is its tag (two GitHub or Cloudflare accounts in one panel stay apart).
 return [text(provider),text(veilAccount(a.account),[...PLATFORM_SOURCES,'ssh'].includes(a.source)?'account-tag':''),hangs];
}
// A tile's lines. The first is the same in every density: the name, cut when long, and the day count or state, which is never
// cut for the name's sake. 标准 adds the fields with the price at the right end; a live reading (a probe's, an AI plan's limits)
// takes the second field's place. 详细 lists the facts under the first line, the cost among them.
function wallTileHtml(a,{e,when,costSpan,live}){
 const name=`<span class="r-name">${wallTextHtml(displayName(a),'r-text')}${lockMark(a)}${stopRing(a)}${relMark(a)}</span>`;
 const first=`<span class="r-line">${name}<span class="r-when"${e.text?` title="${esc(e.text)}"`:''}>${statusHtml(when,!!a.date)}</span></span>`;
 if(wallDensity==='glance')return `<span class="r-main">${first}</span>`;
 if(wallDensity==='detail')return `<span class="r-main">${first}${live?`<span class="r-line r-read">${live}</span>`:''}${wallFactsHtml(a,'r-facts')}</span>`;
 const [one,two,three]=wallFields(a),reading=live||(a.type==='ai'&&typeof aiQuotaFieldHtml==='function'?aiQuotaFieldHtml(a):'');
 const field=(n,html,cls='')=>html?`<span class="f f-${n}${cls}">${html}</span>`:'';
 return `<span class="r-main">${first}<span class="r-line r-sub r-fields">${field(1,one)}${reading?field(2,reading,' f-read'):field(2,two)}<span class="f-end">${field(3,three)}${costSpan}</span></span></span>`;
}

// MARK: The wall
// The panels in category order; categories kept in the sidebar with nothing in them are one quiet line under the wall, each a button
// that adds a record there. A panel with one record leaves out the monthly sum (its line has the price).
function wallBoardHtml(live){
 const panels=categoryIds().map(id=>({id,list:arranged(id,live.filter(a=>a.type===id))})).filter(p=>p.list.length);
 const empty=categoryIds().filter(id=>state.blocks.some(b=>b.id===id)&&!live.some(a=>a.type===id));
 const html=panels.map(({id,list})=>groupHtml({id,title:cats[id].name,glyph:`<span class="g-icon">${icon(id)}</span>`,list,fold:true,folded:!!state.blocks.find(b=>b.id===id)?.folded,reorder:true,summary:groupSummary(list)+(list.length>1?groupCostHtml(list):''),actions:categoryActions(id),wall:true})).join('');
 const rest=empty.length?`<p class="wall-empty"><span>${tr('空的类别')}</span>${empty.map(id=>`<button class="wall-add" data-action="add-asset" data-id="${esc(id)}" title="${tr('添加{name}',{name:esc(cats[id].name)})}">${ui('plus')}${esc(cats[id].name)}</button>`).join('')}</p>`:'';
 return `<div class="wall" data-density="${wallDensity}">${html}</div>${wallPendingHtml()}${rest}`;
}
// What a connected platform read and the board does not hold yet (待引入): one quiet line under the wall, a button per platform.
function wallPendingHtml(){
 const sources=typeof heldSources==='function'?heldSources(state):[];if(!sources.length)return '';
 return `<p class="wall-empty wall-pending"><span>${tr('待引入')}</span>${sources.map(s=>`<button class="wall-add" data-action="connect-pending" data-id="${esc(s.source)}" title="${tr('还没在大板里，点开挑选')}">${ui('download')}${esc(s.name)} ${formatCount(s.count)}</button>`).join('')}</p>`;
}
// A panel's tilt under a skin that tilts: a steady -1…1 from its category, so a panel keeps its angle from one drawing to the next.
function wallTilt(id){let h=7;for(const c of String(id))h=(h*31+c.charCodeAt(0))|0;return ((Math.abs(h)%17)/8-1).toFixed(2);}

// Packing: every panel (and a dragged panel's slot) gets the column width, then goes to the top of the shortest column. Positions are
// absolute, so a panel that changes height (folding, fonts, a density) moves the ones under it at once; a ResizeObserver repacks.
function wallColumns(width){
 const fit=Math.max(1,Math.floor((width+WALL_GAP)/(WALL_MIN_COL+WALL_GAP)));
 return fit<=WALL_COLS?fit:Math.max(WALL_COLS,Math.ceil((width+WALL_GAP)/(WALL_MAX_COL+WALL_GAP)));
}
let wallObserver=null,wallWidth=0;
function packWall(){
 const wall=document.querySelector('#board .wall');if(!wall)return;
 if(!wallObserver)wallObserver=new ResizeObserver(entries=>{if(entries.some(en=>en.target!==wallObserver.wall||Math.abs(en.contentRect.width-wallWidth)>.5))packWall();});
 if(wallObserver.wall!==wall){wallObserver.disconnect();wallObserver.wall=wall;wallObserver.observe(wall);for(const n of wall.children)wallObserver.observe(n);}
 const items=[...wall.children].filter(n=>!n.classList.contains('is-dragging')),width=wall.clientWidth;if(!width)return;
 const cols=wallColumns(width),colW=Math.floor((width-WALL_GAP*(cols-1))/cols*100)/100;
 wallWidth=width;wall.dataset.cols=cols;
 for(const n of items)n.style.width=colW+'px';
 const heights=items.map(n=>n.offsetHeight),tops=Array(cols).fill(0);
 items.forEach((n,i)=>{let c=0;for(let k=1;k<cols;k++)if(tops[k]<tops[c]-.5)c=k;n.style.left=c*(colW+WALL_GAP)+'px';n.style.top=tops[c]+'px';tops[c]+=heights[i]+WALL_GAP;});
 wall.style.height=Math.max(0,...tops.map(t=>t-WALL_GAP))+'px';
}
function wallShown(){return !!document.querySelector('#board .wall');}

// MARK: Moving panels
// The order is the categories' (state.blocks): the wall only shows the ones with records, so a move is among those, and the empty
// ones keep their places in between.
function commitPanelOrder(next){
 const order=categoryIds();let i=0;
 const merged=order.map(id=>next.includes(id)?next[i++]:id);if(merged.every((id,k)=>id===order[k]))return false;
 checkpoint();for(const type of order)ensureBlock(state,type);state.blocks=[...merged.map(id=>state.blocks.find(b=>b.id===id)),...state.blocks.filter(b=>!merged.includes(b.id))];save();return true;
}
function movePanel(id,step){
 const order=[...document.querySelectorAll('#board .wall > .group')].map(n=>n.dataset.group),at=order.indexOf(id),to=at+step;
 if(at<0)return false;
 if(to<0||to>=order.length){toast(step<0?tr('已经是第一个类别'):tr('已经是最后一个类别'));return false;}
 [order[at],order[to]]=[order[to],order[at]];
 if(!commitPanelOrder(order))return false;
 render();wallLanded(id);toast(step<0?tr('已向前移动'):tr('已向后移动'),true);return true;
}
// A dragged panel goes to the place of the one under the pointer. After the panels reflow the pointer has to travel a little before
// it picks again, so a reflow that slides another panel under it does not start a back-and-forth.
function placePanel(g,x,y){
 if(inside(g.slotRect,x,y))return;
 if(g.still&&Math.hypot(g.x-g.still.x,g.y-g.still.y)<24)return;
 let best=null,distance=Infinity;
 for(const it of g.items){const dx=Math.max(it.r.left-x,0,x-it.r.right),dy=Math.max(it.r.top-y,0,y-it.r.bottom),d=dx*dx+dy*dy;if(d<distance){distance=d;best=it;}}
 if(!best)return;
 const order=[...g.container.children].filter(n=>n===g.slot||n!==g.el&&n.dataset.group);
 moveSlot(g,order.indexOf(best.el)<order.indexOf(g.slot)?'before':'after',best.el);g.still={x:g.x,y:g.y};
}
// The landing: a skin that likes it (--wall-snap in material.css) gives the panel a small settle, as a magnet meeting the door.
function wallLanded(id){
 if(reduceMotion())return;
 const el=document.querySelector(`#board .wall > .group[data-group="${CSS.escape(id)}"]`);if(!el)return;
 const snap=parseFloat(getComputedStyle(el).getPropertyValue('--wall-snap'))||0;if(!snap)return;
 el.animate([{scale:String(1+snap)},{scale:String(1-snap/2),offset:.55},{scale:'1'}],{duration:260,easing:'ease-out'});
}
// ←/→ in the wall: the nearest line in the next column over, at about the same height.
function wallSideways(from,key){
 const sign=key==='ArrowRight'?1:-1,r=from.getBoundingClientRect(),cy=r.top+r.height/2;let next=null,score=Infinity;
 for(const n of navTargets()){if(!n.closest('.wall'))continue;const b=n.getBoundingClientRect(),dx=(b.left-r.left)*sign;if(dx<=r.width/2)continue;const value=dx*4+Math.abs(b.top+b.height/2-cy);if(value<score){score=value;next=n;}}
 return next;
}

// MARK: Density
// The line at the top of the view (or under the pointer for a pinch) stays where it was on screen.
function wallAnchor(point){
 const s=boardScroller(),top=Math.max(s===document.scrollingElement?0:s.getBoundingClientRect().top,$('#topbar')?.getBoundingClientRect().bottom||0);
 const lines=[...document.querySelectorAll('#board .wall [data-asset],#board .wall > .group')];
 const hit=point&&lines.find(n=>n.dataset.asset&&inside(n.getBoundingClientRect(),point.x,point.y))||lines.find(n=>n.dataset.asset&&n.getBoundingClientRect().top>=top-1)||null;
 return hit&&{id:hit.dataset.asset,y:hit.getBoundingClientRect().top};
}
function setDensity(next,point){
 if(!WALL_DENSITIES.includes(next)||next===wallDensity)return false;
 const anchor=wallShown()?wallAnchor(point):null;
 wallDensity=next;writeViewPrefs();skipLayoutAnimation=true;render();
 const el=anchor&&document.querySelector(`#board .wall [data-asset="${CSS.escape(anchor.id)}"]`);
 if(el)boardScroller().scrollBy(0,el.getBoundingClientRect().top-anchor.y);
 hidePeek();if(typeof prefsChanged==='function')prefsChanged();
 return true;
}
function stepDensity(step,point){const at=WALL_DENSITIES.indexOf(wallDensity),next=WALL_DENSITIES[Math.max(0,Math.min(WALL_DENSITIES.length-1,at+step))];if(!setDensity(next,point))return false;toast(tr('密度：{name}',{name:WALL_DENSITY_NAMES[next]}),true);return true;}
function densityButtons(){return WALL_DENSITIES.map(id=>`<button class="seg-button" data-action="density" data-id="${id}" role="radio" aria-checked="${id===wallDensity}" aria-label="${WALL_DENSITY_NAMES[id]}" title="${tr('{name}（{keys}）',{name:WALL_DENSITY_NAMES[id],keys:{glance:'⌘−',standard:'⌘0',detail:'⌘='}[id]})}">${ui('density-'+id)}</button>`).join('');}
// ⌘− fewer details, ⌘= (⌘+) more, ⌘0 back to standard; only while the wall is on screen, so the browser's zoom keeps them elsewhere.
document.addEventListener('keydown',e=>{
 if(!(e.metaKey||e.ctrlKey)||e.altKey||!wallShown()||$('#modal').open||e.target.closest?.('input,textarea,select'))return;
 const step=e.key==='-'||e.key==='_'?-1:e.key==='='||e.key==='+'?1:e.key==='0'?0:null;if(step===null)return;
 e.preventDefault();if(step)stepDensity(step);else if(setDensity('standard'))toast(tr('密度：{name}',{name:WALL_DENSITY_NAMES.standard}),true);
});
// A pinch: Chromium and Firefox send it as a wheel with ctrlKey, WebKit as gesture events. One step per clear pinch.
let pinchSum=0,pinchTimer=0,gestureBase=1;
document.addEventListener('wheel',e=>{
 if(!e.ctrlKey||!e.target.closest?.('#board')||!wallShown())return;
 e.preventDefault();clearTimeout(pinchTimer);pinchTimer=setTimeout(()=>pinchSum=0,240);
 pinchSum+=e.deltaY;if(Math.abs(pinchSum)<36)return;
 stepDensity(pinchSum<0?1:-1,{x:e.clientX,y:e.clientY});pinchSum=0;
},{passive:false});
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,e=>{
 if(!e.target.closest?.('#board')||!wallShown())return;e.preventDefault();
 if(type==='gesturestart'){gestureBase=1;return;}
 const ratio=e.scale/gestureBase;if(ratio>1.18||ratio<.85){stepDensity(ratio>1?1:-1,{x:e.clientX,y:e.clientY});gestureBase=e.scale;}
},{passive:false});

// MARK: Peek
// The facts of one line in a card beside its panel, after a short rest of the pointer, or at once when the keyboard reaches it with
// the inspector closed. It never takes clicks and goes on the first scroll, key or press.
let peekTimer=0,peekFor='';
function peekEl(){let el=$('#wall-peek');if(!el){el=document.createElement('div');el.id='wall-peek';el.className='wall-peek';el.setAttribute('aria-hidden','true');el.hidden=true;document.body.append(el);}return el;}
function showPeek(row){
 const a=state.assets.find(x=>x.id===row?.dataset.asset);if(!a||!row.isConnected||gesture?.active||!$('#menu').hidden)return hidePeek();
 const e=eventInfo(a),el=peekEl();
 el.innerHTML=`<p class="peek-name">${tile(a,'sm')}<b>${esc(displayName(a))}</b></p><p class="peek-sub">${esc([cats[a.type]?.one,a.stopped&&tr('已停用'),e.text].filter(Boolean).join(' · '))}</p>${wallFactsHtml(a,'peek-facts')}`;
 el.hidden=false;peekFor=a.id;
 const panel=row.closest('.group').getBoundingClientRect(),r=row.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
 const left=panel.right+10+w<=innerWidth-8?panel.right+10:panel.left-10-w>=8?panel.left-10-w:Math.min(innerWidth-w-8,r.left+24);
 const top=left===r.left+24||left===innerWidth-w-8?r.bottom+6:r.top-6;
 el.style.left=Math.round(Math.max(8,left))+'px';el.style.top=Math.round(Math.max(8,Math.min(innerHeight-h-8,top)))+'px';
}
function hidePeek(){clearTimeout(peekTimer);peekFor='';const el=$('#wall-peek');if(el)el.hidden=true;}
document.addEventListener('pointerover',e=>{
 if(e.pointerType==='touch')return;
 const row=e.target.closest?.('#board .wall .row');if(!row){if(peekFor&&!e.target.closest?.('#wall-peek'))hidePeek();return;}
 if(row.dataset.asset===peekFor)return;
 clearTimeout(peekTimer);const shown=peekFor&&$('#wall-peek')?.hidden===false;peekFor=row.dataset.asset;
 peekTimer=setTimeout(()=>showPeek(row),shown?60:450);
});
document.addEventListener('focusin',e=>{const open=e.target.closest?.('#board .wall .item-open');if(open&&open.matches(':focus-visible')&&$('#detail').hidden)showPeek(open.closest('.row'));else if(peekFor)hidePeek();});
for(const type of ['pointerdown','keydown','wheel'])document.addEventListener(type,e=>{if(peekFor&&!(type==='keydown'&&e.target.closest?.('#board .wall .item-open')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)))hidePeek();},true);
document.addEventListener('scroll',()=>{if(peekFor)hidePeek();},true);
