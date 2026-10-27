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
// Click handlers: actions[name] = (el, id) => {}, for data-action names the core does not handle.
// The agent interface (assetboard-cli / MCP), Pro additions:
//   agentMethods[name] = params => result     more methods beside app.js's agentMethods (synchronous; throw to refuse)
//   agentConfirms[kind] = {title(n), label(target), note, apply(target) → '' or why not}
//                                             requests (agentRequestConfirm) the person confirms in the app before apply runs
//   agentFields[key] = (raw, asset) => {value} | {error}   an update field the core does not know (value null removes it)
const proSlots={facts:[],priceMarks:[],formFields:[],formRead:[],renewFields:[],renewRead:[],projectBar:[],toolsNav:[],exportCards:[],costExtras:[],
 importCli:[],importSources:[],captureLinks:[],topnavActions:[],
 paymentsSection:null,chargesBand:null,captureImportLabel:null,captureAiLink:null,projectNav:null,serverProbe:null,actions:{},agentMethods:{},agentConfirms:{},agentFields:{}};
// ?free in the address shows the free edition from a full checkout: Pro scripts see this and register nothing.
const proOff=typeof location!=='undefined'&&new URLSearchParams(location.search).has('free');
// Each Pro script hands its registration to proRegister, which runs it at load unless proOff.
function proRegister(fn){if(!proOff)fn();}
function slotHtml(name,...args){return proSlots[name].map(fn=>fn(...args)||'').join('');}
function projectsOn(){return !!proSlots.projectNav;}
// A server's state from its probe, or null (not a server, no probe link, or the free edition).
function probeState(a){return a?.type==='server'&&proSlots.serverProbe?proSlots.serverProbe.status(a):null;}
// Whether a Pro script filled anything: the free edition (?free, ASSETBOARD_FREE) leaves every slot empty.
function proLoaded(){if(proOff)return false;return Object.entries(proSlots).some(([key,value])=>Array.isArray(value)?value.length:['actions','agentMethods','agentConfirms','agentFields'].includes(key)?Object.keys(value).length:!!value);}
function proAction(name){return Object.hasOwn(proSlots.actions,name)?proSlots.actions[name]:null;}
