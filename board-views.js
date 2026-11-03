// Board views beside the list and the grid (2026-11-03): the overview strip on top of 全部资产, the big day count on a grid card,
// the 12-month timeline (layout 'timeline') and the month calendar of 即将到来 (upcomingMode 'calendar'). All of it is drawn from
// state on every render and writes nothing; the chosen view is a per-viewer preference like list/grid (writeViewPrefs in app.js).
// Loaded before app.js; the app.js helpers used here (esc, tr, cats, liveAssets, displayName, …) are called only at render time.

// MARK: Overview strip
// Four answers for the whole board: what is still to pay this month, what falls due within SOON_DAYS, what needs handling (overdue
// dates and servers whose probe says offline) and the yearly total. The two money tiles open the cost panel, the others 即将到来.
function overviewHtml(scope){
 if(!scope.length)return '';
 const cur=totalCurrency(),today=localDay(),end=dayNumber(addMonths(isoDay(today).slice(0,8)+'01',1))-1;
 const totals=costTotals(scope,{currency:cur,rates:fx.rates}),month=costForecast(scope,{from:isoDay(today),to:isoDay(end),currency:cur,rates:fx.rates});
 const levels=dueLevels(scope),next=upcomingEvents(scope,new Date(),SOON_DAYS).find(e=>e.status.days>=0);
 const lives=scope.filter(a=>!a.stopped).map(probeState).filter(Boolean),down=lives.filter(l=>!l.online).length,tight=lives.filter(l=>l.online&&l.tone==='amber').length,attention=levels.overdue+down;
 if(!totals.items.length&&!month.items.length&&!next&&!attention)return '';
 const tile=(cls,action,id,label,value,note)=>`<button type="button" class="ov-tile${cls?' '+cls:''}" data-action="${action}"${id?` data-id="${id}"`:''}><span class="ov-label">${label}</span><strong class="ov-value">${value}</strong><span class="ov-note">${note}</span></button>`;
 const parts=[levels.overdue&&tr('{n} 过期',{n:formatCount(levels.overdue)}),down&&tr('{n} 离线',{n:formatCount(down)})].filter(Boolean).join(' · ');
 return `<div class="overview${lives.length?' five':''}" role="group" aria-label="${tr('概览')}">${[
  tile('','cost-panel','',tr('本月还要付'),esc(formatMoney(month.total,cur)),month.items.length?tr('{n} 笔',{n:formatCount(month.items.length)}):tr('没有扣款')),
  tile(levels.soon?'soon':'','view','upcoming',tr('{n} 天内到期',{n:SOON_DAYS}),formatCount(levels.soon),next?esc(tr('最近：{name} · {when}',{name:displayName(next.asset),when:agendaWhen(next.status)})):tr('没有')),
  tile(attention?'overdue':'','view','upcoming',tr('需要处理'),formatCount(attention),parts||tr('没有')),
  tile('','cost-panel','',tr('每年合计'),esc(formatMoney(totals.yearly,cur)),tr('约 {money} / 月',{money:esc(formatMoney(totals.monthly,cur))})),
  // 实时: only once 实时状态 reads something. How many of the read servers answer, and what is wrong with the others.
  lives.length?tile(down?'overdue':tight?'soon':'','view','server',tr('实时'),`${formatCount(lives.length-down)} / ${formatCount(lives.length)}`,[down&&tr('{n} 离线',{n:formatCount(down)}),tight&&tr('{n} 内存紧张',{n:formatCount(tight)})].filter(Boolean).join(' · ')||tr('都有读数')):''
 ].join('')}</div>`;
}
// A group's recurring cost a month, beside its title; nothing when no record in it has a readable cycle.
function groupCostHtml(list){
 const cur=totalCurrency(),t=costTotals(list,{currency:cur,rates:fx.rates});
 return t.items.length?`<span class="g-cost" title="${tr('周期费用合计，按 {cur} 换算；点开看明细、换币种',{cur})}">${tr('约 {money} / 月',{money:esc(formatMoney(t.monthly,cur))})}</span>`:'';
}

// MARK: Grid card
// A dated card leads with its day count; the bar is how much of the current cycle has gone. A record whose line is a question or
// a state (续上了吗？, 冻结, 本次未返回) keeps that line and gets no number, so the number never contradicts it.
function cardHero(a,e){
 const s=assetDateStatus(a);
 if(s.level==='none'||e.text!==s.label||a.stopped)return '';
 const months=billingCycles[a.cycle]?.months,tone=s.level==='overdue'?' overdue':s.level==='soon'?' soon':'';
 const n=Math.abs(s.days),number=s.days===0?`<b>${tr('今天',null,'hero')}</b>`:`<b>${n}</b><small>${s.days<0?tr('天前',{n}):tr('天后',{n})}</small>`;
 const gone=s.level==='overdue'?1:months?Math.max(0,Math.min(1,1-s.days/(months*30.44))):null;
 return `<span class="g-hero${tone}">${number}</span>${gone===null?'':`<span class="g-bar${tone}" aria-hidden="true"><i style="width:${Math.round(gone*100)}%"></i></span>`}`;
}
// On a card with a day count the line under it gives the date itself (2026-11-15 到期) instead of repeating the count.
function cardWhen(a,e){const s=assetDateStatus(a);if(!cardHero(a,e))return e;const words=dateStatusWords[s.kind]||dateStatusWords.expire;return {text:words[4](s.date),cls:''};}

// MARK: Timeline
// Twelve months from the first of this month: each dated record one row in its category, a dot on every date it has in that span
// (a monthly charge is a row of small dots), the first one labelled; an overdue date sits at the left edge in red. Undated records
// are counted under the chart, not drawn.
function timelineHtml(groups){
 const today=localDay(),lo=dayNumber(isoDay(today).slice(0,8)+'01'),hi=dayNumber(addMonths(isoDay(lo),12))-1,span=hi-lo+1;
 const at=day=>Math.max(0,Math.min(100,(day-lo)/span*100)).toFixed(2)+'%';
 const months=[...Array(12)].map((_,i)=>{const d=new Date(dayNumber(addMonths(isoDay(lo),i))*DAY_MS);return d.getUTCMonth()===0||i===0?d.toLocaleDateString(trLocale(),{year:'numeric',month:'short',timeZone:'UTC'}):d.toLocaleDateString(trLocale(),{month:'short',timeZone:'UTC'});});
 const cur=totalCurrency();let undated=0,rows=0;
 const body=groups.map(({id,title,list})=>{
  const lines=list.map(a=>{
   if(a.stopped)return '';
   const s=assetDateStatus(a);if(s.level==='none'){undated++;return '';}
   const dates=s.days<0?[s.date]:occurrencesBetween({...a,date:s.date},Math.max(lo,dayNumber(s.date)),hi);if(!dates.length)return '';
   rows++;const tone=s.level==='overdue'?' overdue':s.level==='soon'?' soon':'',cost=costText(a);
   const marks=dates.map((d,i)=>`<i class="tl-mark${i?' later':tone}" style="left:${at(dayNumber(d))}"></i>`).join('');
   const label=`<span class="tl-label${tone}" style="left:${at(dayNumber(dates[0]))}">${esc(s.days<0?s.label:shortDate(dates[0]))}${cost?` · ${esc(cost)}`:''}</span>`;
   return `<div class="tl-row" data-asset="${esc(a.id)}"><button class="item-open tl-name" data-action="detail" data-id="${esc(a.id)}" aria-label="${esc([displayName(a),s.label,cost].filter(Boolean).join(tr('，')))}">${tile(a,'sm')}<span class="r-text">${esc(displayName(a))}</span></button><div class="tl-track">${marks}${label}</div></div>`;
  }).join('');
  return lines?`<section class="tl-group" data-group="${esc(id)}" aria-label="${esc(title)}"><h2 class="tl-cat">${esc(title)}</h2>${lines}</section>`:'';
 }).join('');
 if(!rows)return {html:viewEmpty(ui('clock'),tr('还没有到期或扣款日期')),count:0};
 const head=`<div class="tl-head" aria-hidden="true"><span></span><div class="tl-months">${months.map(m=>`<span>${esc(m)}</span>`).join('')}</div></div>`;
 return {html:`<div class="timeline" style="--tl-at:${((today-lo)/span).toFixed(4)}">${head}${body}<div class="tl-today" aria-hidden="true"><span>${tr('今天',null,'hero')}</span></div></div>${undated?`<p class="tl-note">${tr('另有 {n} 项没有日期，没画在上面',{n:formatCount(undated)})}</p>`:''}`,count:rows};
}
function shortDate(value){return new Date(dayNumber(value)*DAY_MS).toLocaleDateString(trLocale(),{month:'short',day:'numeric',timeZone:'UTC'});}

// MARK: Calendar
// One month of 即将到来, weeks from Monday: every date a record has that month, with the amount when it costs something (the
// forecast prices each charge on its day). The side lists the month in date order with its total. calendarMonth is an offset from
// this month, kept for the session only.
let calendarMonth=0;
function calendarHtml(assets){
 const today=localDay(),first=dayNumber(addMonths(isoDay(today).slice(0,8)+'01',calendarMonth)),last=dayNumber(addMonths(isoDay(first),1))-1;
 const cur=totalCurrency(),forecast=costForecast(assets,{from:isoDay(first),to:isoDay(last),currency:cur,rates:fx.rates});
 const price=new Map(forecast.items.map(i=>[i.id+'|'+i.date,i.converted])),days=new Map();
 for(const a of assets){
  if(a.hiddenAt||a.stopped)continue;const s=assetDateStatus(a);if(s.level==='none')continue;
  const dates=s.days<0?(dayNumber(s.date)>=first&&dayNumber(s.date)<=last?[s.date]:[]):occurrencesBetween({...a,date:s.date},first,last);
  for(const d of dates){const n=dayNumber(d),tone=n<today?' overdue':n-today<=SOON_DAYS&&calendarMonth>=0?' soon':'';(days.get(n)||days.set(n,[]).get(n)).push({a,tone,amount:price.get(a.id+'|'+d)});}
 }
 const title=new Date(first*DAY_MS).toLocaleDateString(trLocale(),{year:'numeric',month:'long',timeZone:'UTC'});
 const lead=(new Date(first*DAY_MS).getUTCDay()+6)%7,cells=Math.ceil((lead+last-first+1)/7)*7;
 const week=[...Array(7)].map((_,i)=>new Date((4+i)*DAY_MS).toLocaleDateString(trLocale(),{weekday:'short',timeZone:'UTC'}));
 let grid=week.map(w=>`<div class="cal-dow">${esc(w)}</div>`).join('');
 for(let i=0;i<cells;i++){
  const n=first-lead+i,inMonth=n>=first&&n<=last,date=new Date(n*DAY_MS).getUTCDate(),list=inMonth?days.get(n)||[]:[];
  grid+=`<div class="cal-day${inMonth?'':' out'}${n===today?' today':''}"><span class="cal-n">${date}</span>${list.map(({a,tone,amount})=>`<button type="button" class="cal-ev${tone}" data-action="detail" data-id="${esc(a.id)}" title="${esc(displayName(a))}">${esc(displayName(a))}${amount?` <span class="cal-amt">${esc(formatMoney(amount,cur))}</span>`:''}</button>`).join('')}</div>`;
 }
 const all=[...days].sort((x,y)=>x[0]-y[0]).flatMap(([n,list])=>list.map(e=>({...e,n})));
 const rest=forecast.items.filter(i=>dayNumber(i.date)>=today).reduce((sum,i)=>sum+i.converted,0);
 const side=`<aside class="cal-side"><h3>${tr('本月合计')}</h3><strong class="cal-total">${esc(formatMoney(forecast.total,cur))}</strong>${calendarMonth===0?`<span class="cal-rest">${tr('还要付 {money}',{money:esc(formatMoney(rest,cur))})}</span>`:''}${all.length?`<ol class="cal-list">${all.map(({a,tone,amount,n})=>`<li><button type="button" class="text-button${tone}" data-action="detail" data-id="${esc(a.id)}"><span class="cal-when">${esc(shortDate(isoDay(n)))}</span><span class="cal-name">${esc(displayName(a))}</span></button><span class="cal-amt">${amount?esc(formatMoney(amount,cur)):''}</span></li>`).join('')}</ol>`:`<p class="form-note">${tr('这个月没有到期或扣款')}</p>`}</aside>`;
 const nav=`<div class="cal-head"><h2 class="cal-title">${esc(title)}</h2><button type="button" class="icon-button" data-action="calendar-month" data-id="-1" aria-label="${tr('上个月')}" title="${tr('上个月')}">${ui('back')}</button><button type="button" class="button" data-action="calendar-month" data-id="0"${calendarMonth===0?' disabled':''}>${tr('本月')}</button><button type="button" class="icon-button cal-next" data-action="calendar-month" data-id="1" aria-label="${tr('下个月')}" title="${tr('下个月')}">${ui('back')}</button></div>`;
 return {html:`<div class="calendar">${nav}<div class="cal-body"><div class="cal-grid">${grid}</div>${side}</div></div>`,count:all.length};
}
function shiftCalendar(step){calendarMonth=step===0?0:Math.max(-12,Math.min(24,calendarMonth+step));render();}
