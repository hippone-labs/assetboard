// AI 额度与用量: what the AI tools signed in on this Mac have used and how much of their plan's limits is left. One file, three
// hosts: the Mac app runs the readers inside JavaScriptCore (desktop/AIUsage.swift feeds them file chunks, SQLite rows and, when
// the person turned it on, a tool's own usage endpoint answer), the page draws the snapshot it gets back, and node tests run both
// on made-up sample files (tests/fixtures/ai-usage). Nothing here touches the DOM, the board or tr(): the page words it.
//
// What each reader keeps from a line is numbers, a model name and a time. Prompts, replies, paths and tokens never leave the
// reader: a record is {t, v, s, m, i, o, cw, cr, c, k} (time ms, vendor, source, model, uncached input, output, cache write, cache
// read, cost in USD or null, dedupe key). Formats follow the tools' own files as the open-source readers document them:
// ccusage and tokscale (Claude Code JSONL), openai/codex (rollout token_count with rate_limits), tokscale (Copilot CLI events,
// opencode SQLite, Grok sessions), CodexBar / openusage (the usage endpoints). Ideas and field names only; see RESULT.md.

const AI_USAGE_CHECKED='2026-11-09';
// Records older than this are dropped: Claude Code keeps 30 days of logs by default, and a billing period is at most a month.
const AI_USAGE_DAYS=35;
const AI_USAGE_HOUR=3600000,AI_USAGE_DAY=86400000;
// The vendors a subscription record can belong to, and the provider names (AI_PLANS / PROVIDER_PRESETS.ai) and name words that
// say so. A record can also name its vendor by hand (asset.usageSource).
const AI_USAGE_VENDORS={
 anthropic:{name:'Claude',providers:['Anthropic','Claude'],words:/\bclaude\b/i},
 openai:{name:'ChatGPT',providers:['OpenAI','ChatGPT','Codex'],words:/\b(chatgpt|codex|openai)\b/i},
 cursor:{name:'Cursor',providers:['Cursor'],words:/\bcursor\b/i},
 copilot:{name:'GitHub Copilot',providers:['GitHub Copilot','Copilot'],words:/\bcopilot\b/i},
 grok:{name:'Grok',providers:['Grok','xAI','SuperGrok'],words:/\b(super)?grok\b|\bxai\b/i},
 google:{name:'Google AI',providers:['Gemini','Google','Antigravity'],words:/\b(google ai|gemini|antigravity)\b/i},
 opencode:{name:'opencode',providers:['OpenCode','opencode'],words:/\bopencode\b/i}
};
// The sources: one per tool. `local` is what is read from disk without any credential (on unless switched off); `api` is the
// tool's own usage endpoint, called with the tool's own login and only once the person turned it on for that tool. Paths are
// shown in 设置 as they are looked for (the Mac app expands ~ and the env overrides).
const AI_USAGE_SOURCES={
 claude:{name:'Claude Code',vendor:'anthropic',local:['~/.claude/projects','~/.config/claude/projects','$CLAUDE_CONFIG_DIR/projects'],gives:['tokens','cost','block','limitHit','plan'],api:'https://api.anthropic.com/api/oauth/usage',apiGives:['5h','week','models','extra']},
 codex:{name:'Codex',vendor:'openai',local:['~/.codex/sessions','~/.codex/archived_sessions','$CODEX_HOME/sessions'],gives:['tokens','cost','5h','week','plan','credits'],api:'https://chatgpt.com/backend-api/wham/usage',apiGives:['5h','week','credits']},
 cursor:{name:'Cursor',vendor:'cursor',local:['~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'],gives:['plan'],api:'https://cursor.com/api/usage-summary',apiGives:['month','onDemand']},
 copilot:{name:'GitHub Copilot',vendor:'copilot',local:['~/.copilot/session-state'],gives:['tokens','cost','premium'],api:'https://api.github.com/copilot_internal/user',apiGives:['premium','plan','month']},
 grok:{name:'Grok CLI',vendor:'grok',local:['~/.grok/sessions','~/.grok/grok.db','$GROK_HOME/sessions'],gives:['tokens','cost'],api:'https://cli-chat-proxy.grok.com/v1/billing?format=credits',apiGives:['week','month','onDemand','plan']},
 opencode:{name:'opencode',vendor:'opencode',local:['~/.local/share/opencode/opencode.db','~/.local/share/opencode/storage/message'],gives:['tokens','cost'],api:'https://opencode.ai/zen/go/v1/usage',apiGives:['5h','week','month']},
 antigravity:{name:'Antigravity',vendor:'google',local:[],gives:[],api:'http://127.0.0.1 (Antigravity language server)',apiGives:['5h','week','models','plan']}
};
// opencode talks to many providers; its usage goes to the vendor whose plan it spends (a Claude or ChatGPT login inside opencode
// uses that subscription). Anything else stays with opencode itself (Zen / Go, or an API key).
const AI_OPENCODE_VENDORS={anthropic:'anthropic','claude-agent':'anthropic',openai:'openai','github-copilot':'copilot',xai:'grok',google:'google'};

// API list prices in USD per million tokens [input, output, cache write, cache read], to say what a period's tokens would have
// cost at API prices. First match wins. From the vendors' price lists as CodexBar's table carries them (2026-11-07) and grok-cli's
// models.ts; an unknown model is not priced (its tokens still count).
const AI_PRICES=[
 [/claude-(fable|mythos)/,10,50,12.5,1],[/claude-opus-4(-[01])?(-\d{8})?$|claude-3-opus/,15,75,18.75,1.5],[/claude-opus/,5,25,6.25,.5],
 [/claude-sonnet|claude-3-[57]-sonnet/,3,15,3.75,.3],[/claude-haiku-4|claude-4-haiku/,1,5,1.25,.1],[/claude-3-5-haiku|claude-haiku/,.8,4,1,.08],
 [/gpt-5(\.\d)?-pro/,15,120,0,15],[/gpt-5(\.1)?(-codex)?-mini|gpt-5-mini/,.25,2,0,.025],[/gpt-5(\.\d)?-nano/,.05,.4,0,.005],
 [/gpt-6(\.\d)?-luna|gpt-5\.6-luna/,.1,.5,.125,.01],[/gpt-6(\.\d)?-sol/,2,10,2.5,.2],[/gpt-6-astra/,10,50,12.5,1],[/gpt-5\.6-sol/,4,20,5,.4],[/gpt-5\.6-terra/,2,12,2.5,.2],
 [/gpt-5\.5/,5,30,0,.5],[/gpt-5\.4-mini/,.75,4.5,0,.075],[/gpt-5\.4/,2.5,15,0,.25],[/gpt-5\.[23]/,1.75,14,0,.175],[/gpt-5/,1.25,10,0,.125],
 [/grok-code-fast/,.2,1.5,0,.02],[/grok-4(\.\d)?-fast/,.2,.5,0,.05],[/grok/,1.25,2.5,0,.3125],
 [/gemini-[23](\.\d)?-pro|gemini-pro/,1.25,10,0,.125],[/gemini-[23](\.\d)?-flash|gemini-flash/,.3,2.5,0,.03]
];
function aiPriceOf(model){const m=String(model||'').toLowerCase().replace(/^(anthropic|openai|xai|google)[./]/,'');return AI_PRICES.find(([re])=>re.test(m))||null;}
// The API-price cost of one record's tokens, or null when the model has no known price.
function aiCostOf(r){const p=aiPriceOf(r.m);if(!p)return null;return ((r.i||0)*p[1]+(r.o||0)*p[2]+(r.cw||0)*(p[3]||p[1])+(r.cr||0)*(p[4]||p[1]))/1e6;}

const aiNum=v=>{const n=typeof v==='string'&&v.trim()?Number(v):v;return typeof n==='number'&&Number.isFinite(n)?n:null;};
const aiPos=v=>Math.max(aiNum(v)||0,0);
const aiTime=v=>{if(v==null||v==='')return null;const n=aiNum(v);if(n!=null)return n<1e11?n*1000:n;const t=Date.parse(v);return Number.isFinite(t)?t:null;};
const aiPct=v=>{const n=aiNum(v);return n==null?null:Math.min(Math.max(n,0),100);};
const aiModel=v=>typeof v==='string'&&v&&v!=='<synthetic>'?v.slice(0,80):'';
const aiText=(v,n=40)=>typeof v==='string'&&v.trim()?v.trim().slice(0,n):'';
// A window of a plan's limit: id (5h, week, month, premium, or a model lane), used percent, when it resets, its length.
function aiWindow(id,used,resetsAt,minutes,label=''){const u=aiPct(used);if(u==null)return null;const w={id,used:Math.round(u*10)/10,resetsAt:aiTime(resetsAt),minutes:aiNum(minutes)};if(label)w.label=aiText(label,40);return w;}
function aiWindowId(minutes){const m=aiNum(minutes);return m===300?'5h':m===10080?'week':m>=40000&&m<=45000?'month':m?`${Math.round(m)}m`:'window';}

// MARK: Local readers. Each takes one parsed line or document and returns {records?, windows?, plan?, credits?, limitHit?, at?}.
const AI_LOCAL={
 // Claude Code: ~/.claude/projects/<project>/<session>.jsonl, one line per content block of a reply (the same message id and
 // request id repeat with growing counts, so the store keeps the largest). A usage-limit error carries the reset time.
 claude(o){
  const t=aiTime(o?.timestamp),m=o?.message;if(!t||!m)return null;
  if(o.isApiErrorMessage){const text=(Array.isArray(m.content)?m.content:[]).map(c=>c?.text||'').join(' ');const hit=/usage limit reached\|(\d{9,13})/i.exec(text);if(hit)return {limitHit:{at:t,resetsAt:aiTime(hit[1])}};}
  const u=m.usage;if(!u||typeof u!=='object')return null;
  const split=u.cache_creation&&typeof u.cache_creation==='object'?aiPos(u.cache_creation.ephemeral_5m_input_tokens)+aiPos(u.cache_creation.ephemeral_1h_input_tokens):null;
  const r={t,v:'anthropic',s:'claude',m:aiModel(m.model)+(u.speed==='fast'?'-fast':''),i:aiPos(u.input_tokens),o:aiPos(u.output_tokens),cw:split??aiPos(u.cache_creation_input_tokens),cr:aiPos(u.cache_read_input_tokens),c:aiNum(o.costUSD)};
  if(!r.i&&!r.o&&!r.cw&&!r.cr)return null;
  r.k=m.id?`${m.id}:${o.requestId||o.sessionId||''}`:`${o.sessionId||''}:${t}`;
  return {records:[r]};
 },
 // Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. turn_context names the model; every token_count event carries the
 // turn's tokens (input includes the cached part) and the plan's rate_limits as the server last reported them
 // (openai/codex codex-rs/protocol/src/protocol.rs TokenCountEvent, persisted by codex-rs/rollout/src/policy.rs).
 codex(o,st){
  const t=aiTime(o?.timestamp),p=o?.payload;if(!p)return null;
  if(o.type==='turn_context'){if(aiModel(p.model))st.model=aiModel(p.model);return null;}
  if(o.type==='session_meta'){st.session=aiText(p.id,60);return null;}
  if(o.type!=='event_msg'||p.type!=='token_count')return null;
  const out={},info=p.info,total=info?.total_token_usage,last=info?.last_token_usage;
  if(total&&typeof total==='object'){
   const prev=st.total,grown=!prev||aiPos(total.total_tokens)>aiPos(prev.total_tokens);
   const use=grown&&last?last:prev?Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens','total_tokens'].map(k=>[k,aiPos(total[k])-aiPos(prev[k])])):total;
   st.total=total;
   const input=aiPos(use.input_tokens),cached=Math.min(aiPos(use.cached_input_tokens??use.cache_read_input_tokens),input);
   const r={t,v:'openai',s:'codex',m:st.model||'gpt-5',i:input-cached,o:aiPos(use.output_tokens),cw:0,cr:cached,c:null,k:`${st.session||''}:${o.timestamp}:${aiPos(total.total_tokens)}`};
   if(t&&(r.i||r.o||r.cr))out.records=[r];
  }
  const rl=p.rate_limits;
  if(rl&&typeof rl==='object'){
   const win=w=>w&&aiWindow(aiWindowId(w.window_minutes),w.used_percent,w.resets_at??(aiNum(w.resets_in_seconds)!=null&&t?t+aiNum(w.resets_in_seconds)*1000:null),w.window_minutes);
   out.windows=[win(rl.primary),win(rl.secondary)].filter(Boolean);out.at=t;
   if(aiText(rl.plan_type))out.plan=aiText(rl.plan_type);
   if(rl.credits&&typeof rl.credits==='object')out.credits={has:!!rl.credits.has_credits,unlimited:!!rl.credits.unlimited,balance:aiNum(rl.credits.balance)};
  }
  return out.records||out.windows?out:null;
 },
 // GitHub Copilot CLI: ~/.copilot/session-state/<id>/events.jsonl, session.usage_record events. usage.cost is the premium
 // request multiplier, not money; copilotUsage.totalNanoAiu / 1e11 is USD (tokscale copilot_session_state.rs).
 copilot(o){
  if(o?.type!=='session.usage_record')return null;const u=o.data?.usage,t=aiTime(o.timestamp);if(!u||!t)return null;
  const nano=aiNum(u.copilotUsage?.totalNanoAiu);
  const r={t,v:'copilot',s:'copilot',m:aiModel(u.model),i:Math.max(aiPos(u.inputTokens)-aiPos(u.cacheReadTokens),0),o:aiPos(u.outputTokens),cw:aiPos(u.cacheWriteTokens),cr:aiPos(u.cacheReadTokens),c:nano!=null?nano/1e11:null,pr:aiPos(u.cost),k:aiText(o.id,80)||`${t}:${u.model}`};
  return {records:[r]};
 },
 // Grok CLI (xAI's grok): ~/.grok/sessions/<cwd>/<session>/usage.json, one entry per turn; input includes cached reads; cost in
 // ticks of 1e-10 USD (grok-build xai-grok-shell session/usage_file.rs, tokscale sessions/grok.rs).
 grokUsage(doc){
  const turns=Array.isArray(doc?.turns)?doc.turns:[],sid=aiText(doc?.sessionId,80);
  const records=turns.map(u=>{const t=aiTime(u?.endedAt);if(!t)return null;const ticks=aiNum(u.costUsdTicks),cr=aiPos(u.cachedReadTokens);
   return {t,v:'grok',s:'grok',m:aiModel(u.primaryModelId||doc.session?.primaryModelId),i:Math.max(aiPos(u.inputTokens)-cr,0),o:aiPos(u.outputTokens),cw:aiPos(u.cacheCreationTokens),cr,c:ticks>0&&!u.costIsPartial?ticks/1e10:null,k:`${sid}:${u.turnNumber}`};}).filter(Boolean);
  return records.length?{records}:null;
 },
 // The community grok-cli (grok-dev): ~/.grok/grok.db, table usage_events; cost_micros is its own estimate in micro-dollars.
 grokRow(row){
  const t=aiTime(row?.created_at);if(!t)return null;const c=aiNum(row.cost_micros);
  return {records:[{t,v:'grok',s:'grok',m:aiModel(row.model),i:aiPos(row.input_tokens),o:aiPos(row.output_tokens),cw:0,cr:0,c:c!=null?c/1e6:null,k:`db:${row.session_id}:${row.message_seq}:${row.source}`}]};
 },
 // opencode: the data JSON of an assistant message, from opencode.db (session_message v2 or message v1) or the older
 // storage/message/<session>/<id>.json files. cost is opencode's own (provider-reported, else catalogue price).
 opencode(m,id){
  if(!m||typeof m!=='object'||m.role&&m.role!=='assistant')return null;const tk=m.tokens,t=aiTime(m.time?.created);if(!tk||!t)return null;
  const provider=aiText(m.providerID||m.model?.providerID,40),c=aiNum(m.cost);
  const r={t,v:AI_OPENCODE_VENDORS[provider]||'opencode',s:'opencode',m:aiModel(m.modelID||m.model?.id),i:aiPos(tk.input),o:aiPos(tk.output)+aiPos(tk.reasoning),cw:aiPos(tk.cache?.write),cr:aiPos(tk.cache?.read),c:c>0?c:null,k:aiText(m.id||id,80)||`${t}`};
  return r.i||r.o||r.cw||r.cr?{records:[r]}:null;
 },
 // Cursor: state.vscdb ItemTable rows; only the membership keys are asked for, never the token.
 cursorRow(row){const k=row?.key,v=aiText(row?.value,40);if(k==='cursorAuth/stripeMembershipType'&&v)return {plan:v};if(k==='cursorAuth/stripeSubscriptionStatus'&&v)return {status:v};return null;}
};

// MARK: Usage endpoints (only when the person turned them on). Each takes the parsed answer and returns windows, plan, extras.
const AI_API={
 // Anthropic OAuth usage: five_hour / seven_day {utilization 0–100, resets_at}, per-model lanes, limits[], extra_usage in cents.
 claude(j){
  const w=[aiWindow('5h',j?.five_hour?.utilization,j?.five_hour?.resets_at,300),aiWindow('week',j?.seven_day?.utilization,j?.seven_day?.resets_at,10080),
   aiWindow('week-opus',j?.seven_day_opus?.utilization,j?.seven_day_opus?.resets_at,10080,'Opus'),aiWindow('week-sonnet',j?.seven_day_sonnet?.utilization,j?.seven_day_sonnet?.resets_at,10080,'Sonnet')].filter(Boolean);
  for(const l of Array.isArray(j?.limits)?j.limits:[]){if(l?.kind!=='weekly_scoped')continue;const name=aiText(l.scope?.model?.display_name||l.scope?.model?.id,30);if(!name||w.some(x=>x.label===name))continue;const x=aiWindow('week-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),l.percent,l.resets_at,10080,name);if(x)w.push(x);}
  const e=j?.extra_usage,out={windows:w};
  if(e&&e.is_enabled)out.extra={used:aiPos(e.used_credits)/100,limit:aiNum(e.monthly_limit)!=null?aiPos(e.monthly_limit)/100:null,currency:aiText(e.currency,3)||'USD'};
  return out;
 },
 // ChatGPT wham/usage: rate_limit.primary_window / secondary_window, placed by limit_window_seconds (a lone weekly window can
 // come in the primary slot), credits.
 codex(j){
  const rl=j?.rate_limit||{},w=[rl.primary_window,rl.secondary_window].filter(x=>x&&typeof x==='object').map(x=>{const m=aiNum(x.limit_window_seconds)!=null?aiNum(x.limit_window_seconds)/60:null;return aiWindow(aiWindowId(m),x.used_percent,x.reset_at??x.resets_at,m);}).filter(Boolean);
  const out={windows:w};if(aiText(j?.plan_type))out.plan=aiText(j.plan_type);
  if(j?.credits&&typeof j.credits==='object')out.credits={has:!!j.credits.has_credits,unlimited:!!j.credits.unlimited,balance:aiNum(j.credits.balance)};
  return out;
 },
 // Cursor usage-summary: the billing cycle, the plan's included usage (cents or percent) and on-demand spend in cents.
 cursor(j){
  const plan=j?.individualUsage?.plan||{},od=j?.individualUsage?.onDemand,end=j?.billingCycleEnd;
  const used=aiNum(plan.totalPercentUsed)??(aiNum(plan.limit)>0?aiPos(plan.used)/aiNum(plan.limit)*100:null);
  const out={windows:[aiWindow('month',used,end,null)].filter(Boolean)};if(aiText(j?.membershipType))out.plan=aiText(j.membershipType);
  if(od&&od.enabled)out.extra={used:aiPos(od.used)/100,limit:aiNum(od.limit)!=null?aiPos(od.limit)/100:null,currency:'USD'};
  return out;
 },
 // GitHub copilot_internal/user: premium_interactions entitlement / remaining, the monthly reset date, the plan; the free plan
 // answers with monthly_quotas and limited_user_quotas instead.
 copilot(j){
  const out={windows:[]},reset=j?.quota_reset_date||j?.limited_user_reset_date;if(aiText(j?.copilot_plan))out.plan=aiText(j.copilot_plan);
  if(j?.access_type_sku==='subscription_ended')out.ended=true;
  for(const [key,id] of [['premium_interactions','premium'],['chat','chat']]){
   const q=j?.quota_snapshots?.[key];if(!q||q.unlimited||!(aiNum(q.entitlement)>0))continue;
   const left=aiNum(q.percent_remaining)??aiPos(q.remaining)/aiNum(q.entitlement)*100,x=aiWindow(id,100-left,reset,null);
   if(x){x.limit=aiNum(q.entitlement);x.left=aiNum(q.remaining);out.windows.push(x);}
   if(key==='premium_interactions'&&aiPos(q.overage_count))out.overage=aiPos(q.overage_count);
  }
  if(!out.windows.length&&j?.monthly_quotas&&j?.limited_user_quotas)for(const id of ['chat','completions']){const all=aiNum(j.monthly_quotas[id]),left=aiNum(j.limited_user_quotas[id]);if(all>0&&left!=null){const x=aiWindow(id,(1-left/all)*100,reset,null);x.limit=all;x.left=left;out.windows.push(x);}}
  return out;
 },
 // Grok cli-chat-proxy billing?format=credits: creditUsagePercent of the current (weekly or monthly) period, on-demand cap in cents.
 grok(j){
  const c=j?.config||j||{},p=c.currentPeriod||{},id=/WEEK/.test(p.type||'')?'week':/MONTH/.test(p.type||'')?'month':'period';
  const out={windows:[aiWindow(id,c.creditUsagePercent??(aiNum(c.onDemandCap?.val)>0?aiPos(c.onDemandUsed?.val)/aiNum(c.onDemandCap.val)*100:null),p.end||c.billingPeriodEnd,id==='week'?10080:null)].filter(Boolean)};
  const tier=aiText(c.subscriptionTier||j?.subscription_tier);if(tier)out.plan=tier;
  if(aiNum(c.onDemandCap?.val)>0)out.extra={used:aiPos(c.onDemandUsed?.val)/100,limit:aiPos(c.onDemandCap.val)/100,currency:'USD'};
  return out;
 },
 // opencode Go zen/go/v1/usage: rolling (5 hours), weekly and monthly percent with resetsAt.
 opencode(j){
  const u=j?.usage||{};return {windows:[['rolling','5h',300],['weekly','week',10080],['monthly','month',null]].map(([k,id,m])=>u[k]&&aiWindow(id,u[k].percent,u[k].resetsAt,m)).filter(Boolean),plan:'Go'};
 },
 // Antigravity's local language server: RetrieveUserQuotaSummary groups[].buckets[] (remainingFraction flat or nested), or
 // GetUserStatus with the tier name and per-model quotaInfo. A missing fraction is unknown, never 0 or 100.
 antigravity(j){
  const out={windows:[]},groups=j?.response?.groups||j?.groups||[];
  const frac=b=>aiNum(b?.remainingFraction)??aiNum(b?.remaining?.remainingFraction)??(b?.remaining?.case==='remainingFraction'?aiNum(b.remaining.value):null);
  for(const g of Array.isArray(groups)?groups:[])for(const b of Array.isArray(g?.buckets)?g.buckets:[]){
   if(b?.disabled)continue;const f=frac(b);if(f==null)continue;const key=`${b.bucketId||''} ${b.window||''} ${b.displayName||''}`.toLowerCase();
   const kind=/5h|five hour|session/.test(key)?'5h':/week/.test(key)?'week':'window',lane=/3p|claude|gpt/.test(`${b.bucketId||''} ${g.displayName||''}`.toLowerCase())?'other':'gemini';
   const x=aiWindow(`${kind}-${lane}`,(1-Math.min(Math.max(f,0),1))*100,b.resetTime,kind==='5h'?300:kind==='week'?10080:null,aiText(g.displayName,30));if(x)out.windows.push(x);
  }
  const us=j?.userStatus;if(us){const tier=aiText(us.userTier?.name||us.planStatus?.planInfo?.planName);if(tier)out.plan=tier;
   if(!out.windows.length)for(const mc of us.cascadeModelConfigData?.clientModelConfigs||[]){const f=aiNum(mc?.quotaInfo?.remainingFraction);if(f==null)continue;const x=aiWindow('model-'+out.windows.length,(1-f)*100,mc.quotaInfo.resetTime,null,aiText(mc.label,30));if(x)out.windows.push(x);}}
  return out;
 }
};

// MARK: The store: everything read so far, deduped, for the last AI_USAGE_DAYS. The Mac app keeps one for its lifetime and feeds it
// what changed; a snapshot is what the page and the MCP tools get.
function aiUsageStore(){
 const records=new Map(),files=new Map(),meta={},seen={};
 const metaOf=s=>meta[s]||(meta[s]={});
 const keep=(s,res,now)=>{
  if(!res)return;const m=metaOf(s),cut=now-AI_USAGE_DAYS*AI_USAGE_DAY;
  for(const r of res.records||[]){if(r.t<cut)continue;const key=r.s+'|'+r.k,old=records.get(key);
   // The same reply written again with growing counts: keep the largest of each part.
   if(old){for(const f of ['i','o','cw','cr','pr'])if((r[f]||0)>(old[f]||0))old[f]=r[f];if(r.c!=null&&(old.c==null||r.c>old.c))old.c=r.c;}else records.set(key,{...r});
   if(!m.last||r.t>m.last)m.last=r.t;}
  if(res.windows&&(res.at||now)>=(m.windowsAt||0)){m.windows=res.windows;m.windowsAt=res.at||now;m.windowsFrom='local';if(res.credits)m.credits=res.credits;}
  if(res.plan)m.plan=res.plan;if(res.status)m.status=res.status;
  if(res.limitHit&&(!m.limitHit||res.limitHit.at>m.limitHit.at))m.limitHit=res.limitHit;
 };
 const parse=(text,fn)=>{let o;try{o=typeof text==='string'?JSON.parse(text):text;}catch{return null;}return fn(o);};
 return {
  // One chunk of a file: `kind` is jsonl (whole lines, the app keeps the offset and sends what was appended), json (a whole
  // document), rows (SQLite rows as objects) or api (a usage endpoint's answer). fileKey ties a file's reader state together.
  feed(source,kind,payload,fileKey='',now=Date.now()){
   if(!AI_USAGE_SOURCES[source])return 0;seen[source]=true;let n=0;
   if(kind==='jsonl'){
    const st=files.get(source+'|'+fileKey)||{};files.set(source+'|'+fileKey,st);const reader=source==='claude'?AI_LOCAL.claude:source==='codex'?o=>AI_LOCAL.codex(o,st):source==='copilot'?AI_LOCAL.copilot:null;if(!reader)return 0;
    for(const line of String(payload||'').split('\n')){
     // A cheap test first: most lines of a Claude log are content without usage; a Codex log's are mostly not token_count.
     if(!line||source==='claude'&&!line.includes('"usage"')&&!line.includes('usage limit')||source==='copilot'&&!line.includes('usage_record'))continue;
     if(source==='codex'&&!line.includes('token_count')&&!line.includes('turn_context')&&!line.includes('session_meta'))continue;
     const res=parse(line,reader);if(res){keep(source,res,now);n++;}
    }
   }else if(kind==='json'){const res=parse(payload,o=>source==='grok'?AI_LOCAL.grokUsage(o):source==='opencode'?AI_LOCAL.opencode(o,fileKey):null);if(res){keep(source,res,now);n++;}}
   else if(kind==='rows'){for(const row of Array.isArray(payload)?payload:[]){const res=source==='grok'?AI_LOCAL.grokRow(row):source==='opencode'?parse(row?.data,o=>AI_LOCAL.opencode(o,row.id)):source==='cursor'?AI_LOCAL.cursorRow(row):null;if(res){keep(source,res,now);n++;}}}
   else if(kind==='api'){const res=parse(payload,o=>AI_API[source]?.(o));if(res){const m=metaOf(source);if(res.windows?.length||!m.windows){m.windows=res.windows;m.windowsAt=now;m.windowsFrom='api';}for(const k of ['plan','credits','extra','overage','ended'])if(res[k]!=null)m[k]=res[k];m.apiAt=now;n=1;}}
   return n;
  },
  // A source was found but could not be read (permission, a locked database, an endpoint that refused): said in 设置.
  fail(source,reason,now=Date.now()){if(AI_USAGE_SOURCES[source]){const m=metaOf(source);m.error=aiText(String(reason),120);m.errorAt=now;}},
  clear(source){for(const key of [...records.keys()])if(key.startsWith(source+'|'))records.delete(key);for(const key of [...files.keys()])if(key.startsWith(source+'|'))files.delete(key);delete meta[source];delete seen[source];},
  snapshot(now=Date.now()){return aiUsageSnapshot([...records.values()],meta,seen,now);},
  // The same as JSON text, which is what the Mac app passes on to the page untouched.
  snapshotJSON(now=Date.now()){return JSON.stringify(aiUsageSnapshot([...records.values()],meta,seen,now));},
  size(){return records.size;}
 };
}

// Day key in local time (the Mac's), YYYY-MM-DD.
function aiDayKey(t){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// Claude's five-hour block as ccusage reckons it from local logs: it starts at the first message's hour and lasts five hours;
// a gap of five hours starts a new one. Only an estimate (the server's own window comes from the usage endpoint).
function aiBlock(list,now){
 const ts=list.map(r=>r.t).sort((a,b)=>a-b);let start=null,last=null;
 for(const t of ts){if(start==null||t-start>5*AI_USAGE_HOUR||t-last>5*AI_USAGE_HOUR){start=Math.floor(t/AI_USAGE_HOUR)*AI_USAGE_HOUR;}last=t;}
 if(start==null||now-last>=5*AI_USAGE_HOUR||now>=start+5*AI_USAGE_HOUR)return null;
 const inBlock=list.filter(r=>r.t>=start);return {start,end:start+5*AI_USAGE_HOUR,...aiSum(inBlock)};
}
function aiSum(list){let tokens=0,cost=0,priced=0,n=0,premium=0;for(const r of list){tokens+=(r.i||0)+(r.o||0)+(r.cw||0)+(r.cr||0);const c=r.c??aiCostOf(r);if(c!=null){cost+=c;priced++;}n++;premium+=r.pr||0;}return {tokens,cost:Math.round(cost*100)/100,n,priced,...(premium?{premium:Math.round(premium*10)/10}:{})};}

// What the page draws: per vendor, the sources that wrote to it, the plan's windows (the freshest: a local Codex event or an
// endpoint answer), per-day cost and tokens, the models, when it was last used and the local five-hour block.
function aiUsageSnapshot(records,meta,seen,now=Date.now()){
 const vendors={},sources={};
 for(const [id,src] of Object.entries(AI_USAGE_SOURCES)){const m=meta[id]||{};sources[id]={found:!!seen[id],...(m.last?{last:m.last}:{}),...(m.error?{error:m.error}:{}),...(m.apiAt?{apiAt:m.apiAt}:{})};
  if(!seen[id]&&!m.windows&&!m.plan)continue;
  const v=vendors[src.vendor]||(vendors[src.vendor]={vendor:src.vendor,sources:[],windows:[],days:{},models:{},bySource:{}});v.sources.push(id);
  if(m.windows&&(!v.windowsAt||m.windowsAt>v.windowsAt)){v.windows=m.windows;v.windowsAt=m.windowsAt;v.windowsFrom=m.windowsFrom;v.windowsSource=id;}
  for(const k of ['plan','credits','extra','overage','limitHit','ended','status'])if(m[k]!=null&&v[k]==null)v[k]=m[k];
 }
 const byVendor=new Map();for(const r of records){if(!byVendor.has(r.v))byVendor.set(r.v,[]);byVendor.get(r.v).push(r);}
 for(const [vid,list] of byVendor){
  const v=vendors[vid]||(vendors[vid]={vendor:vid,sources:[],windows:[],days:{},models:{},bySource:{}});
  for(const r of list){const d=v.days[aiDayKey(r.t)]||(v.days[aiDayKey(r.t)]={tokens:0,cost:0,n:0});const c=r.c??aiCostOf(r);d.tokens+=(r.i||0)+(r.o||0)+(r.cw||0)+(r.cr||0);d.cost+=c||0;d.n++;
   if(!v.last||r.t>v.last)v.last=r.t;if(!v.sources.includes(r.s))v.sources.push(r.s);}
  for(const d of Object.values(v.days))d.cost=Math.round(d.cost*100)/100;
  const month=list.filter(r=>r.t>=now-30*AI_USAGE_DAY);
  for(const [name,group] of Object.entries(Object.groupBy?Object.groupBy(month,r=>r.m||'?'):month.reduce((g,r)=>((g[r.m||'?']||=[]).push(r),g),{})))v.models[name]=aiSum(group);
  for(const s of new Set(list.map(r=>r.s)))v.bySource[s]=aiSum(month.filter(r=>r.s===s));
  if(vid==='anthropic'){const b=aiBlock(list.filter(r=>r.s==='claude'),now);if(b)v.block=b;}
 }
 // A window whose reset has passed is spent: the next one starts empty, so it reads 0 until a new reading says otherwise.
 for(const v of Object.values(vendors))v.windows=(v.windows||[]).map(w=>w.resetsAt&&w.resetsAt<=now?{...w,used:0,rolled:true}:w);
 return {at:now,checked:AI_USAGE_CHECKED,vendors,sources};
}

// MARK: For the page and the MCP tools. A subscription record's vendor: the one it names by hand (usageSource, or 'none' to show
// nothing), else from its provider and name.
function aiVendorOf(asset){
 if(!asset||asset.type!=='ai')return '';const own=asset.usageSource;if(own==='none')return '';if(own&&AI_USAGE_VENDORS[own])return own;
 const p=String(asset.provider||'').trim().toLowerCase();
 for(const [id,v] of Object.entries(AI_USAGE_VENDORS))if(v.providers.some(x=>x.toLowerCase()===p))return id;
 for(const [id,v] of Object.entries(AI_USAGE_VENDORS))if(v.words.test(`${asset.name||''} ${asset.provider||''}`))return id;
 return '';
}
// Which record shows a vendor's reading when several could: the one linked by hand, else the first in use (not hidden, not
// stopped) in the given order. Returns Map vendor → asset id.
function aiUsageOwners(assets){
 const owners=new Map(),hand=new Set();
 for(const a of assets||[]){if(a.type!=='ai'||a.hiddenAt)continue;const v=aiVendorOf(a);if(!v)continue;
  if(a.usageSource&&a.usageSource!=='none'){if(!hand.has(v)){owners.set(v,a.id);hand.add(v);}continue;}
  if(!owners.has(v)&&!a.stopped)owners.set(v,a.id);}
 return owners;
}
// The current billing period of a subscription: from the record's next charge date and cycle when it has them, else the last 30 days.
function aiPeriod(asset,now=Date.now()){
 const months={monthly:1,quarterly:3,halfyearly:6,yearly:12}[asset?.cycle];const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(asset?.date||'');
 if(months&&m){let end=new Date(+m[1],+m[2]-1,+m[3]).getTime(),step=0;while(end<=now&&step<240){const d=new Date(end);d.setMonth(d.getMonth()+months);end=d.getTime();step++;}
  const s=new Date(end);s.setMonth(s.getMonth()-months);return {start:s.getTime(),end,months,fromDate:true};}
 return {start:now-30*AI_USAGE_DAY,end:now,months:1,fromDate:false};
}
const AI_TIGHT=80,AI_FULL=95,AI_IDLE_DAYS=14;
// Everything one subscription record shows: its windows from the tightest, the period's usage at API prices against what the plan
// costs a month, when it was last used here, the local block. monthlyUsd is the record's price a month in USD (null: unknown).
function aiQuotaOf(asset,snap,{now=Date.now(),monthlyUsd=null}={}){
 const vendor=aiVendorOf(asset),v=vendor&&snap?.vendors?.[vendor];if(!v)return null;
 const period=aiPeriod(asset,now),from=aiDayKey(Math.max(period.start,now-AI_USAGE_DAYS*AI_USAGE_DAY));
 let cost=0,tokens=0,n=0;for(const [day,d] of Object.entries(v.days||{}))if(day>=from){cost+=d.cost;tokens+=d.tokens;n+=d.n;}
 const windows=[...(v.windows||[])].sort((x,y)=>y.used-x.used),top=windows[0]||null;
 const elapsed=Math.min(Math.max((now-period.start)/(period.end-period.start),0),1),price=monthlyUsd!=null?monthlyUsd*period.months:null;
 const idleDays=v.last?Math.floor((now-v.last)/AI_USAGE_DAY):null;
 // Where the tightest window is headed at the pace since it started: over 100 before it resets means it runs out early.
 const pace=top&&top.minutes&&top.resetsAt&&top.used>0?(()=>{const span=top.minutes*60000,gone=span-(top.resetsAt-now);return gone>span*.1?Math.round(top.used/gone*span):null;})():null;
 return {vendor,sources:v.sources,plan:v.plan||null,windows,top,pace,windowsFrom:v.windowsFrom||null,windowsAt:v.windowsAt||null,
  period:{start:period.start,end:period.end,fromDate:period.fromDate,cost:Math.round(cost*100)/100,tokens,n,elapsed:Math.round(elapsed*100)/100},
  price,value:price>0&&n?Math.round(cost/price*10)/10:null,last:v.last||null,idleDays,block:v.block||null,limitHit:v.limitHit&&v.limitHit.resetsAt>now?v.limitHit:null,
  credits:v.credits||null,extra:v.extra||null,overage:v.overage||null,ended:!!v.ended,models:v.models||{},bySource:v.bySource||{}};
}
// What a developer looks at first, most urgent first (RESULT.md explains the order):
//  1 full    a window at AI_FULL% or more: blocked or about to be, until it resets
//  2 tight   a window at AI_TIGHT% or more, or on pace to run out before it resets
//  3 idle    a paid plan not used here for AI_IDLE_DAYS days (sooner to act on when it renews soon)
//  4 low     well into the period and its usage at API prices is under half the price: a cheaper plan or the API may do
//  5 value   the period's usage at API prices is worth more than the plan (the good news; only listed, never coloured)
// level: amber for 1 and 2 and 3, none for the rest; red is kept for what cannot recover on its own (DESIGN-PRINCIPLES §四.1).
function aiQuotaSignals(assets,snap,{now=Date.now(),monthlyUsd=()=>null}={}){
 const out=[],owners=aiUsageOwners(assets);
 for(const [vendor,id] of owners){
  const a=assets.find(x=>x.id===id),q=a&&aiQuotaOf(a,snap,{now,monthlyUsd:monthlyUsd(a)});if(!q)continue;
  const top=q.top;
  if(top&&top.used>=AI_FULL)out.push({kind:'full',rank:1,level:'amber',id,vendor,window:top});
  else if(top&&(top.used>=AI_TIGHT||q.pace>100))out.push({kind:'tight',rank:2,level:'amber',id,vendor,window:top,pace:q.pace});
  if(q.price>0&&q.idleDays!=null&&q.idleDays>=AI_IDLE_DAYS&&!a.stopped)out.push({kind:'idle',rank:3,level:'amber',id,vendor,days:q.idleDays});
  else if(q.price>0&&q.value!=null&&q.period.elapsed>=.5&&q.value<.5)out.push({kind:'low',rank:4,level:'',id,vendor,value:q.value});
  else if(q.price>0&&q.value!=null&&q.value>=1)out.push({kind:'value',rank:5,level:'',id,vendor,value:q.value});
 }
 return out.sort((x,y)=>x.rank-y.rank||(y.window?.used||0)-(x.window?.used||0));
}

if(typeof module!=='undefined')module.exports={AI_USAGE_CHECKED,AI_USAGE_DAYS,AI_USAGE_VENDORS,AI_USAGE_SOURCES,AI_OPENCODE_VENDORS,AI_PRICES,aiPriceOf,aiCostOf,aiWindow,aiWindowId,AI_LOCAL,AI_API,aiUsageStore,aiDayKey,aiBlock,aiSum,aiUsageSnapshot,aiVendorOf,aiUsageOwners,aiPeriod,AI_TIGHT,AI_FULL,AI_IDLE_DAYS,aiQuotaOf,aiQuotaSignals};
