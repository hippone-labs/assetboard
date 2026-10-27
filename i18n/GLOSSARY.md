# English interface: terms and rules

The Chinese text in the code is the key; `tr('中文', {slots})` (i18n.js) returns the English from the `I18N.en` dictionaries in this
folder and `pro/web/en.js`. Keep these words the same everywhere.

## Style
- Plain, short, for experienced developers. No marketing tone, no exclamation marks, no emoji.
- Sentence case for buttons, labels, headings and menu items in the page ("Add asset", "Restore from backup").
- Keep the Chinese sentence's meaning and length; do not explain more than the Chinese does.
- Numbers with units: a pair for plurals, `['{n} day','{n} days']`. Relative dates: "in 3 days", "3 days ago", "today", "tomorrow".
- Keep product and platform names as they are: Assetboard, Cloudflare, GitHub, MCP, SSH, RDAP, Stripe, ICP.
- Keys and shortcuts stay as written: ⌘K, ⌥↑, P, L, S.

## Terms
| 中文 | English |
|---|---|
| 资产 | asset |
| 资产板 | board |
| 即将到来 | Upcoming |
| 全部资产 | All assets |
| 全景 | Panorama |
| 类别 | category |
| 项目 | project |
| 已隐藏 / 隐藏 | Hidden / Hide |
| 停用 / 已停用 | stop / Stopped |
| 关停清单 | shutdown checklist |
| 定期清理 | periodic review |
| 到期 / 到期日 | expires / expiry date |
| 续费 / 自动续费 | renew, renewal / auto-renew |
| 试用 | trial |
| 每月 / 每年 / 每 3 个月 | monthly / yearly / every 3 months |
| 扣款 | charge |
| 费用 | cost |
| 保留原因 | reason to keep |
| 用途 | purpose |
| 账号 | account |
| 服务商 | provider |
| 关联 | link, linked |
| 来源 | source |
| 同步 / 同步于 | sync / Synced |
| 本次未返回 | Missing from the last sync |
| 导入 / 导出 | Import / Export |
| 资产备份 | Backup |
| 从备份恢复… | Restore from backup… |
| 只读 | read-only |
| 待确认 | To review |
| 证据 | source document |
| 识别 | recognize |
| 设置 | Settings |
| 通用 / 功能 / 连接 | General / Features / Connections |
| 隐私模式 | Privacy mode |
| 计价币种 | Currency |
| 探针 / 探针数据源 | probes / probe source |
| SSH 直读 | SSH readings |
| 外部工具接入（MCP） | External tools (MCP) |
| 网站图标 | site icon |
| 注册局 / 注册商 | registry / registrar |
| 赎回期 | redemption period |
| 备案 | ICP filing |
| 演示 | demo |
| 测试版 | beta |
| 撤销 | Undo |
| 已连接 / 未连接 | Connected / Not connected |
| 交接清单 | handover sheet |
| 付款账本 | payment ledger |
| 日历 | calendar |
| 网络记录 | Network log |
| 许可证 | licence → use US spelling: license |

## Categories (`cats` in app.js)
银行卡 Bank cards · 手机号 Phone numbers · 服务器 Servers · Apple ID · Google 账号 Google accounts · AI 订阅 AI plans · 域名 Domains ·
订阅与工具 Subscriptions & tools · 数据库 Databases · 软件授权 Software licenses · 代码仓库 Repositories · 部署服务 Deployments ·
对象存储 Object storage

## What not to translate
- Text the code matches against: words in pasted text, mail and OCR (`buildCandidates`, CSV header presets, `dateKinds` words used
  for parsing), provider names in lifecycle rules, and Chinese regexes. Recognizing English bills is the AI's job (own-key AI).
- Values stored in the board or compared in code (for example cost `'未知'`, `event` text, `purpose` of synced records, theme names
  kept in `state`). Translate them where they are shown, not where they are stored.
- Code comments and test names.
