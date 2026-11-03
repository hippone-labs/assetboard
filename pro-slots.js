// Places where the Pro edition adds to the board. The free edition leaves every slot empty, and every caller works without them.
// Pro scripts load after money-view.js and before app.js; they push renderers into the lists, set the single overrides and add
// click handlers. Nothing here runs at load time.
//
// Lists (each entry is a function; html ones are joined in order):
//   facts(a, row)             extra detail facts, html          priceMarks(a)       marks after a row's cost, html
//   formFields(v)             fields inside 更多, html            formRead(form, data, current) → fields to save, or null to refuse
//   renewFields(a, ctx)       extra fields in the 已续费 dialog   renewRead(form, a) → {amount, currency, paidOn, updateCost} or null
//   projectBar(name, list)    the head of a project view, html  toolsNav()           sidebar tool buttons, html
//   exportCards()             cards in the export dialog, html  costExtras(scope, cur) the cost panel's extra part, html
//   importCli(ctx)            buttons in the import window's 本机 row, html    importSources(ctx)  import window sources, html
//                             ctx = {native, cli, source(action, glyph, label, title)}; source() draws a source button
//   captureLinks()            links under 添加资产 beside the import link, html
//   topnavActions()           buttons at the right end of the top bar (window-wide tools), html
// Single overrides (a function or null):
//   paymentsSection(a, pending)  the detail's payment section; pending = {renewals, charges} rows already asked for
//   chargesBand(list)            the 待确认扣款 band in 即将到来, html; while it is null no charge is asked about anywhere
//   captureImportLabel()         the text of 添加资产's import link, naming the sources there are
//   captureAiLink()              添加资产's 配置 AI link, html, shown while no AI is set up
//   projectNav()                 the sidebar's 项目 group, html. While it is null no project shows anywhere (sidebar, detail, form,
//                                project views, 全景 按项目), and the project a record already has is kept as it is
//   serverProbe                  {status(a) → {text, tone, online} | null, rowHtml(a), panoHtml(a)}: a server card's live state from a
//                                probe data source (探针), shown in place of the hand-set 运行中/已停用; null: no probe anywhere
// Pro features still to come, each null until its script fills it (the licence section lists them as coming):
//   remindersApp                 {write(items)}: dated records written into the Reminders app as well as the local notifications
//   snapshot                     {save()}: an encrypted copy of the board written to a folder the person picks (several Macs)
//   handoverPack                 {html()}: the 如果我出事 pack, the handover list with what to stop and when
// Click handlers: actions[name] = (el, id) => {}, for data-action names the core does not handle.
// The agent interface (assetboard-cli / MCP), Pro additions:
//   agentMethods[name] = params => result     more methods beside app.js's agentMethods (synchronous; throw to refuse)
//   agentConfirms[kind] = {title(n), label(target), note, apply(target) → '' or why not}
//                                             requests (agentRequestConfirm) the person confirms in the app before apply runs
//   agentFields[key] = (raw, asset) => {value} | {error}   an update field the core does not know (value null removes it)
const proSlots={facts:[],priceMarks:[],formFields:[],formRead:[],renewFields:[],renewRead:[],projectBar:[],toolsNav:[],exportCards:[],costExtras:[],
 importCli:[],importSources:[],captureLinks:[],topnavActions:[],
 paymentsSection:null,chargesBand:null,captureImportLabel:null,captureAiLink:null,projectNav:null,serverProbe:null,platformProbe:null,remindersApp:null,snapshot:null,handoverPack:null,actions:{},agentMethods:{},agentConfirms:{},agentFields:{}};
// Two switches. ?free in the address shows the free edition from a full checkout: no Pro script registers anything, like a build made
// with ASSETBOARD_EDITION=free. Otherwise Pro is on with a licence the Mac app has checked (nativeStore.pro.on, from
// pro/desktop/License.swift) and on the demo board, which shows every Pro feature; without a licence (and in the browser) the free
// features stay and what Pro wrote stays readable.
const proFree=typeof location!=='undefined'&&new URLSearchParams(location.search).has('free');
const proDemo=typeof window!=='undefined'&&!!(window.__ASSETBOARD_NATIVE__?.demo||!window.__ASSETBOARD_NATIVE__&&typeof location!=='undefined'&&new URLSearchParams(location.search).has('demo'));
let proOff=proFree||!(proDemo||(typeof window!=='undefined'&&window.__ASSETBOARD_NATIVE__?.pro?.on===true));
// Each Pro feature hands its registration to proRegister; it runs at load when Pro is on, or later, in place, when a licence is
// activated while the board is open (proEnable, from pro/web/license-pro.js). Removing a licence takes effect at the next launch.
const proRegistrars=[];
function proRegister(fn){proRegistrars.push(fn);if(!proOff)fn();}
function proEnable(){if(proFree||!proOff)return;proOff=false;for(const fn of proRegistrars)fn();}
function proOn(){return !proOff;}
// The parts of the full build that are free (AI recognition, the read-only MCP tools, connecting Cloudflare and GitHub, the licence
// panel itself) register here: at load, licence or not; with ?free nothing.
function proBuild(fn){if(!proFree)fn();}
// Whether this is the full build (the pro/web scripts are loaded and not ?free); the free edition has no licence panel and no Pro hints.
function proBuilt(){return !proFree&&typeof proLicenceSection==='function';}
function slotHtml(name,...args){return proSlots[name].map(fn=>fn(...args)||'').join('');}
function projectsOn(){return !!proSlots.projectNav;}
// A server's state from its probe, or null (not a server, no probe link, or the free edition).
// 实时状态 for one record: a server's probe or SSH reading, or a database's or deployment's platform state (null when there is none).
function probeState(a){if(!a)return null;if(a.type==='server')return proSlots.serverProbe?proSlots.serverProbe.status(a):null;return proSlots.platformProbe?proSlots.platformProbe.status(a):null;}
function liveRowHtml(a){return a?.type==='server'?proSlots.serverProbe?.rowHtml(a)||'':proSlots.platformProbe?.rowHtml(a)||'';}
// Whether a Pro script filled anything: the free edition (?free, ASSETBOARD_FREE) leaves every slot empty.
function proLoaded(){if(proFree)return false;return Object.entries(proSlots).some(([key,value])=>Array.isArray(value)?value.length:['actions','agentMethods','agentConfirms','agentFields'].includes(key)?Object.keys(value).length:!!value);}
// The one calm line a locked Pro feature shows where it would be, with a button to the licence section; the small Pro mark beside a
// locked switch. Neither shows in the free edition, nor while Pro is on.
function proHint(text){return proBuilt()&&proOff?`<p class="form-note pro-note">${esc(text)} <button type="button" class="text-button inline-button" data-action="pro-dialog">${tr('了解 Pro')}</button></p>`:'';}
function proTag(){return proBuilt()&&proOff?`<button type="button" class="pro-tag" data-action="pro-dialog" title="${tr('Assetboard Pro 的功能')}">Pro</button>`:'';}
function proAction(name){return Object.hasOwn(proSlots.actions,name)?proSlots.actions[name]:null;}
