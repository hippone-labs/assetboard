// Places where modules add to the board: the core's money-ledger.js and project-money.js fill some at load, the Pro modules (pro/web,
// not in this repository) the rest while Pro is on; every caller works with a slot left empty. Both load after money-view.js and
// before app.js; they push renderers into the lists, set the single overrides and add click handlers. Nothing here runs at load time.
//
// Lists (each entry is a function; html ones are joined in order):
//   facts(a, row)             extra detail facts, html          priceMarks(a)       marks after a row's cost, html
//   serverFields(v)           fields under a server's SSH host, user and port in the form, html (read back through formRead)
//   formFields(v)             fields inside 更多, html            formRead(form, data, current) → fields to save, or null to refuse
//   renewFields(a, ctx)       extra fields in the 已续费 dialog   renewRead(form, a) → {amount, currency, paidOn, updateCost} or null
//   projectBar(name, list)    the head of a project view, html  toolsNav()           sidebar tool buttons, html
//   exportCards()             cards in the export dialog, html  costExtras(scope, cur) the cost panel's extra part, html
//   importSources(ctx)        import window sources after the core's, html
//                             ctx = {native, cli, source(action, glyph, label, title)}; source() draws a source button
// Single overrides (a function or null):
//   serverProbe                  {status(a) → {text, tone, online} | null, rowHtml(a), panoHtml(a)}: a server card's live state from a
//                                probe data source (探针), shown in place of the hand-set 运行中/已停用; null: no probe anywhere
// Features still to come, each null until a script fills it (the licence section lists the Pro ones as coming):
//   remindersApp                 {write(items)}: dated records written into the Reminders app as well as the local notifications (free)
//   snapshot                     {save()}: an encrypted copy of the board written to a folder the person picks (several Macs)
//   handoverPack                 {html()}: the 如果我出事 pack, the handover list with what to stop and when
// Click handlers: actions[name] = (el, id) => {}, for data-action names the core does not handle.
// The agent interface (assetboard-cli / MCP), Pro additions (writes: they are refused without Pro):
//   agentMethods[name] = params => result     more methods beside app.js's agentMethods (synchronous; throw to refuse)
//   agentConfirms[kind] = {title(n), label(target), note, apply(target) → '' or why not}
//                                             requests (agentRequestConfirm) the person confirms in the app before apply runs
//   agentFields[key] = (raw, asset) => {value} | {error}   an update field the core does not know (value null removes it)
const proSlots={facts:[],priceMarks:[],formFields:[],formRead:[],renewFields:[],renewRead:[],projectBar:[],toolsNav:[],exportCards:[],costExtras:[],serverFields:[],importSources:[],
 serverProbe:null,platformProbe:null,remindersApp:null,snapshot:null,handoverPack:null,actions:{},agentMethods:{},agentConfirms:{},agentFields:{}};
// Two switches. ?free in the address shows the board without the Pro modules from a full checkout: no Pro script registers anything,
// like a build made with ASSETBOARD_EDITION=free. Otherwise Pro is on with a licence the Mac app has checked (nativeStore.pro.on, from
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
// The parts of the Pro modules that need no licence (the licence panel itself, the calm Pro hints) register here: at load, licence
// or not; with ?free nothing.
function proBuild(fn){if(!proFree)fn();}
// Whether the Pro modules are there (the pro/web scripts are loaded and not ?free); without them there is no licence panel and no Pro hint.
function proBuilt(){return !proFree&&typeof proLicenceSection==='function';}
function slotHtml(name,...args){return proSlots[name].map(fn=>fn(...args)||'').join('');}
// 实时状态 for one record: a server's probe or SSH reading, or a database's or deployment's platform state (null when there is none).
function probeState(a){if(!a)return null;if(a.type==='server')return proSlots.serverProbe?proSlots.serverProbe.status(a):null;return proSlots.platformProbe?proSlots.platformProbe.status(a):null;}
function liveRowHtml(a){return a?.type==='server'?proSlots.serverProbe?.rowHtml(a)||'':proSlots.platformProbe?.rowHtml(a)||'';}
// Whether the Pro modules are loaded, licence or not (?free and a build made with ASSETBOARD_EDITION=free have none).
function proLoaded(){return proBuilt();}
// The one calm line a locked Pro feature shows where it would be, with a button to the licence section; the small Pro mark beside a
// locked switch. Neither shows without the Pro modules, nor while Pro is on.
function proHint(text){return proBuilt()&&proOff?`<p class="form-note pro-note">${esc(text)} <button type="button" class="text-button inline-button" data-action="pro-dialog">${tr('了解 Pro')}</button></p>`:'';}
function proTag(){return proBuilt()&&proOff?`<button type="button" class="pro-tag" data-action="pro-dialog" title="${tr('Assetboard Pro 的功能')}">Pro</button>`:'';}
function proAction(name){return Object.hasOwn(proSlots.actions,name)?proSlots.actions[name]:null;}
