import Foundation

/// assetboard-cli: the command line and MCP server for Assetboard. Every call goes to the running app over AgentSocket,
/// so the page stays the one place that writes the board; when the app is not running it is opened in the background.
@main struct AssetboardCLI {
    static let version = "2026.10.6"
    static var usage: String { AppLanguage.isEnglish ? englishUsage : chineseUsage }
    static let chineseUsage = """
    用法：assetboard-cli <命令>
      types                                列出类别
      list [--type T] [--query Q] [--hidden] [--limit N] [--offset N]
      get <id>
      add <JSON | ->                       一个资产对象、对象数组，或 {"items":[…]}
      update <id> <JSON | ->               要修改的字段，例如 {"date":"2027-03-01"}
      delete <id> [--reason 文字]           在 Assetboard 里确认后才删除
      totals [--currency CNY] [--type T] [--project P] [--group-by project|type]
                                           周期费用合计（每项保留自己的币种）
      update-many <JSON | ->               批量修改：[{"id":…,"fields":{…}}, …]，一次撤销
      delete-many <id>… [--reason 文字]     批量请求删除，在 Assetboard 的一个列表里确认
      actions [--status pending]           待确认请求及结果；action <actionId> 查一个
      pay <id> [--amount 6] [--currency USD] [--paid-on 2026-10-01] [--covers 日期] [--missed]
                                           记一笔付款或“没扣”
      renew <id> --until 2027-03-01 [--amount 12] [--currency USD]
      charges                              已到扣款日、还没确认的自动扣款
      forecast [--from 日期] [--to 日期] [--currency CNY] [--project P]
      history [<id>]                       价格变化历史（带 id 时含付款记录）
      projects                             项目及每月费用
      mcp                                  以 MCP 服务器运行（stdio）
    结果以 JSON 输出；出错时退出码为 1。
    """
    static let englishUsage = """
    Usage: assetboard-cli <command>
      types                                List categories
      list [--type T] [--query Q] [--hidden] [--limit N] [--offset N]
      get <id>
      add <JSON | ->                       One asset object, an array of objects, or {"items":[…]}
      update <id> <JSON | ->               Fields to change, e.g. {"date":"2027-03-01"}
      delete <id> [--reason TEXT]          Deleted only after you confirm in Assetboard
      totals [--currency CNY] [--type T] [--project P] [--group-by project|type]
                                           Recurring cost totals (each asset keeps its own currency)
      update-many <JSON | ->               Batch update: [{"id":…,"fields":{…}}, …], one undo step
      delete-many <id>… [--reason TEXT]    Request deleting several; confirm them in one list in Assetboard
      actions [--status pending]           Confirmation requests and their results; action <actionId> for one
      pay <id> [--amount 6] [--currency USD] [--paid-on 2026-10-01] [--covers DATE] [--missed]
                                           Record a payment, or a charge that did not happen
      renew <id> --until 2027-03-01 [--amount 12] [--currency USD]
      charges                              Automatic charges whose day has come and that are not confirmed yet
      forecast [--from DATE] [--to DATE] [--currency CNY] [--project P]
      history [<id>]                       Price history (with an id, also its payments)
      projects                             Projects and their monthly cost
      mcp                                  Run as an MCP server (stdio)
    Results are printed as JSON; the exit code is 1 on an error.
    """

    static func main() {
        var args = Array(CommandLine.arguments.dropFirst())
        guard let command = args.first else { print(usage); exit(0) }
        args.removeFirst()
        if command == "mcp" { MCPServer.run(); exit(0) }
        if ["-h", "--help", "help"].contains(command) { print(usage); exit(0) }
        if ["-v", "--version"].contains(command) { print(version); exit(0) }
        if command == "--self-test" { selfTest(); exit(0) }
        do {
            let (method, params) = try request(command, args)
            let result = try invoke(method, params)
            print(pretty(result))
            // An add where nothing was written is a failure for scripts, even though the reply lists why.
            if method == "add", let reply = result as? [String: Any], (reply["added"] as? [Any])?.isEmpty == true,
               (reply["errors"] as? [Any])?.isEmpty == false { exit(1) }
        } catch {
            FileHandle.standardError.write(Data("assetboard-cli: \(message(error))\n".utf8))
            exit(1)
        }
    }

    struct UsageError: Error { let text: String }

    static func request(_ command: String, _ args: [String]) throws -> (String, [String: Any]) {
        var rest = args
        func option(_ name: String) -> String? {
            guard let index = rest.firstIndex(of: name), index + 1 < rest.count else { return nil }
            let value = rest[index + 1]
            rest.removeSubrange(index...(index + 1))
            return value
        }
        func flag(_ name: String) -> Bool {
            guard let index = rest.firstIndex(of: name) else { return false }
            rest.remove(at: index)
            return true
        }
        func json(_ text: String?) throws -> Any {
            guard let text else { throw UsageError(text: L("缺少 JSON 参数") + "\n\n" + usage) }
            let source = text == "-" ? String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self) : text
            guard let value = try? JSONSerialization.jsonObject(with: Data(source.utf8)) else { throw UsageError(text: L("不是有效的 JSON")) }
            return value
        }
        switch command {
        case "types": return ("types", [:])
        case "list":
            var params: [String: Any] = [:]
            if let type = option("--type") { params["type"] = type }
            if let query = option("--query") { params["query"] = query }
            if let limit = option("--limit").flatMap(Int.init) { params["limit"] = limit }
            if let offset = option("--offset").flatMap(Int.init) { params["offset"] = offset }
            if flag("--hidden") { params["includeHidden"] = true }
            return ("list", params)
        case "get":
            guard let id = rest.first else { throw UsageError(text: L("缺少 id")) }
            return ("get", ["id": id])
        case "add":
            let value = try json(rest.first)
            var items: Any = [value]
            if let list = value as? [Any] { items = list } else if let wrapped = (value as? [String: Any])?["items"] { items = wrapped }
            return ("add", ["items": items])
        case "update":
            guard rest.count >= 2 else { throw UsageError(text: L("用法：update <id> <JSON | ->")) }
            guard let fields = try json(rest[1]) as? [String: Any] else { throw UsageError(text: L("字段需要是 JSON 对象")) }
            return ("update", ["id": rest[0], "fields": fields])
        case "totals":
            var params: [String: Any] = [:]
            if let currency = option("--currency") { params["currency"] = currency }
            if let type = option("--type") { params["type"] = type }
            if let project = option("--project") { params["project"] = project }
            if let groupBy = option("--group-by") { params["groupBy"] = groupBy }
            return ("totals", params)
        case "delete":
            let reason = option("--reason")
            guard let id = rest.first else { throw UsageError(text: L("缺少 id")) }
            return ("delete", ["id": id, "reason": reason ?? ""])
        case "delete-many":
            let reason = option("--reason")
            guard !rest.isEmpty else { throw UsageError(text: L("缺少 id")) }
            return ("deleteMany", ["ids": rest, "reason": reason ?? ""])
        case "update-many":
            let value = try json(rest.first)
            guard let updates = (value as? [Any]) ?? ((value as? [String: Any])?["updates"] as? [Any]) else { throw UsageError(text: L("需要 [{\"id\":…,\"fields\":{…}}] 数组")) }
            return ("updateMany", ["updates": updates])
        case "actions":
            var params: [String: Any] = [:]
            if let status = option("--status") { params["status"] = status }
            return ("actions", params)
        case "action":
            guard let id = rest.first else { throw UsageError(text: L("缺少 actionId")) }
            return ("action", ["id": id])
        case "pay":
            var params: [String: Any] = [:]
            if let amount = option("--amount") { guard let value = Double(amount) else { throw UsageError(text: L("--amount 需要是数字")) }; params["amount"] = value }
            if let currency = option("--currency") { params["currency"] = currency }
            if let paidOn = option("--paid-on") { params["paidOn"] = paidOn }
            if let covers = option("--covers") { params["covers"] = covers }
            if let note = option("--note") { params["note"] = note }
            if flag("--missed") { params["missed"] = true }
            guard let id = rest.first else { throw UsageError(text: L("缺少 id")) }
            params["id"] = id
            return ("recordPayment", params)
        case "renew":
            var params: [String: Any] = [:]
            guard let until = option("--until") else { throw UsageError(text: L("缺少 --until 新日期")) }
            params["until"] = until
            if let amount = option("--amount") { guard let value = Double(amount) else { throw UsageError(text: L("--amount 需要是数字")) }; params["amount"] = value }
            if let currency = option("--currency") { params["currency"] = currency }
            if let paidOn = option("--paid-on") { params["paidOn"] = paidOn }
            if flag("--keep-cost") { params["updateCost"] = false }
            guard let id = rest.first else { throw UsageError(text: L("缺少 id")) }
            params["id"] = id
            return ("renew", params)
        case "charges": return ("charges", [:])
        case "projects": return ("projects", [:])
        case "forecast":
            var params: [String: Any] = [:]
            for (flagName, key) in [("--from", "from"), ("--to", "to"), ("--currency", "currency"), ("--project", "project"), ("--type", "type")] { if let value = option(flagName) { params[key] = value } }
            return ("forecast", params)
        case "history":
            return ("costHistory", rest.first.map { ["id": $0] } ?? [:])
        default: throw UsageError(text: L("未知命令 {command}", ["command": command]) + "\n\n" + usage)
        }
    }

    struct AppError: Error { let text: String }

    /// Calls the app and returns its `result`; starts the app once when it is not running, then waits for it to load.
    static func invoke(_ method: String, _ params: [String: Any]) throws -> Any {
        let request: [String: Any] = ["method": method, "params": params]
        var launched = false
        let deadline = Date().addingTimeInterval(25)
        while true {
            do {
                let reply = try AgentSocket.call(request)
                if reply["ok"] as? Bool == true { return reply["result"] ?? NSNull() }
                let text = reply["error"] as? String ?? L("Assetboard 返回了错误")
                // Only a call that reached a page still loading is retried; anything else is the answer. The app says so in its language.
                if text.contains("正在启动") || text.contains("is starting"), Date() < deadline { Thread.sleep(forTimeInterval: 0.5); continue }
                throw AppError(text: text)
            } catch AgentSocket.Failure.notRunning {
                if !launched { launched = true; openApp() }
                guard Date() < deadline else { throw AppError(text: L("无法连接 Assetboard。请先打开 App（演示模式不接受外部调用）")) }
                Thread.sleep(forTimeInterval: 0.5)
            }
        }
    }

    /// The app this binary ships in (…/Assetboard.app/Contents/MacOS/assetboard-cli, also through a symlink), else by bundle id.
    static func openApp() {
        let binary = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        let bundle = binary.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = bundle.pathExtension == "app" ? ["-g", bundle.path] : ["-g", "-b", "studio.assetboard.local"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run(); process.waitUntilExit() } catch {}
    }

    static func message(_ error: Error) -> String {
        if let error = error as? UsageError { return error.text }
        if let error = error as? AppError { return error.text }
        if let failure = error as? AgentSocket.Failure {
            switch failure {
            case .notRunning: return L("Assetboard 没有运行")
            case .badPath: return L("socket 路径无效")
            case .io(let text): return text
            }
        }
        return "\(error)"
    }

    /// Run by build.sh: argument parsing and MCP replies, without the app.
    static func selfTest() {
        func parsed(_ args: [String]) -> (String, [String: Any])? { try? request(args[0], Array(args.dropFirst())) }
        let list = parsed(["list", "--type", "domain", "--hidden", "--limit", "5"])
        precondition(list?.0 == "list" && list?.1["type"] as? String == "domain" && list?.1["includeHidden"] as? Bool == true && list?.1["limit"] as? Int == 5, "list options")
        precondition((parsed(["add", "{\"name\":\"a.dev\"}"])?.1["items"] as? [Any])?.count == 1, "add takes one object")
        precondition((parsed(["add", "[{\"name\":\"a\"},{\"name\":\"b\"}]"])?.1["items"] as? [Any])?.count == 2, "add takes an array")
        precondition((parsed(["add", "{\"assetboard\":1,\"items\":[{\"name\":\"a\"}]}"])?.1["items"] as? [Any])?.count == 1, "add takes the Inbox format")
        precondition(parsed(["add", "not json"]) == nil && parsed(["update", "id"]) == nil && parsed(["get"]) == nil && parsed(["drop"]) == nil, "Bad arguments are refused")
        let totals = parsed(["totals", "--currency", "USD"])
        precondition(totals?.0 == "totals" && totals?.1["currency"] as? String == "USD", "totals with a currency")
        let delete = parsed(["delete", "x1", "--reason", "转出"])
        precondition(delete?.1["id"] as? String == "x1" && delete?.1["reason"] as? String == "转出", "delete with a reason")
        let initialize = MCPServer.handle(["jsonrpc": "2.0", "id": 1, "method": "initialize", "params": ["protocolVersion": "2025-03-26"]])
        let info = initialize?["result"] as? [String: Any]
        precondition(info?["protocolVersion"] as? String == "2025-03-26" && (info?["capabilities"] as? [String: Any])?["tools"] != nil, "initialize echoes a known version")
        let future = MCPServer.handle(["jsonrpc": "2.0", "id": 2, "method": "initialize", "params": ["protocolVersion": "2099-01-01"]])
        precondition((future?["result"] as? [String: Any])?["protocolVersion"] as? String == MCPServer.protocolVersions[0], "An unknown version gets the newest")
        precondition(MCPServer.handle(["jsonrpc": "2.0", "method": "notifications/initialized"]) == nil, "Notifications get no reply")
        let tools = ((MCPServer.handle(["jsonrpc": "2.0", "id": "t", "method": "tools/list"])?["result"] as? [String: Any])?["tools"] as? [[String: Any]]) ?? []
        precondition(tools.count == 36 && Set(tools.compactMap { $0["name"] as? String }) == Set(MCPServer.methods.keys), "Thirty-six tools, each mapped to a call")
        precondition(Set(MCPServer.methods.values).count == MCPServer.methods.count && MCPServer.methods.values.allSatisfy { $0.count <= 40 }, "Each tool has its own call, short enough for the app")
        // No tool asks for a credential, the settings kept on the Mac say they are not undoable, and removing a source is destructive.
        let secret = try! NSRegularExpression(pattern: "password|passwd|token|secret|session|cookie|jwt|username|credential", options: [.caseInsensitive])
        for tool in tools {
            let names = ((tool["inputSchema"] as? [String: Any])?["properties"] as? [String: Any] ?? [:]).keys
            precondition(!names.contains { secret.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) != nil }, "\(tool["name"] ?? "?") asks for a credential")
            precondition((tool["inputSchema"] as? [String: Any])?["additionalProperties"] as? Bool == false, "\(tool["name"] ?? "?") takes only its own arguments")
        }
        let byName = Dictionary(uniqueKeysWithValues: tools.compactMap { tool in (tool["name"] as? String).map { ($0, tool) } })
        for name in ["add_probe_source", "update_probe_source", "remove_probe_source", "set_ssh_host", "set_ssh_interval"] {
            precondition((byName[name]?["description"] as? String)?.contains("不可撤销") == true, "\(name) says it is not undoable")
        }
        precondition((byName["remove_probe_source"]?["annotations"] as? [String: Any])?["destructiveHint"] as? Bool == true, "Removing a probe source is destructive")
        precondition((byName["list_ssh_hosts"]?["annotations"] as? [String: Any])?["readOnlyHint"] as? Bool == true && (byName["fetch_icons"]?["annotations"] as? [String: Any])?["readOnlyHint"] as? Bool == false, "Read and write hints")
        precondition((((byName["update_asset"]?["inputSchema"] as? [String: Any])?["properties"] as? [String: Any])?["fields"] as? [String: Any]).flatMap { ($0["properties"] as? [String: Any])?.keys }.map { Set($0).isSuperset(of: ["hidden", "stopped", "probeLink"]) } == true, "update_asset takes hidden, stopped and probeLink")
        precondition(parsed(["pay", "x1", "--amount", "6", "--missed"])?.1["missed"] as? Bool == true && parsed(["pay", "x1", "--amount", "six"]) == nil, "pay options")
        precondition(parsed(["renew", "x1", "--until", "2027-03-01"])?.1["until"] as? String == "2027-03-01" && parsed(["renew", "x1"]) == nil, "renew needs --until")
        precondition((parsed(["delete-many", "a", "b", "--reason", "x"])?.1["ids"] as? [String]) == ["a", "b"], "delete-many takes ids")
        precondition((parsed(["update-many", "[{\"id\":\"a\",\"fields\":{}}]"])?.1["updates"] as? [Any])?.count == 1, "update-many takes an array")
        precondition(tools.allSatisfy { JSONSerialization.isValidJSONObject($0) && ($0["inputSchema"] as? [String: Any])?["type"] as? String == "object" }, "Tool schemas are JSON objects")
        precondition((MCPServer.handle(["jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": ["name": "drop_all"]])?["error"] as? [String: Any])?["code"] as? Int == -32602, "An unknown tool is an error")
        precondition((MCPServer.handle(["jsonrpc": "2.0", "id": 4, "method": "resources/list"])?["error"] as? [String: Any])?["code"] as? Int == -32601, "An unknown method is an error")
        print("PASS: CLI arguments, add formats, bad arguments, pay/renew/delete-many/update-many, MCP initialize and version, notifications, thirty-six tools with schemas (none asks for a credential; settings say they are not undoable), unknown tool and method")
    }

    static func pretty(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value) || value is NSNull || value is String || value is NSNumber else { return "\(value)" }
        let options: JSONSerialization.WritingOptions = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes, .fragmentsAllowed]
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: options) else { return "\(value)" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// MCP over stdio (JSON-RPC 2.0, one message per line): tools that map onto the same calls as the command line.
enum MCPServer {
    static let protocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"]
    /// The descriptions name parts of the app's interface; in English the Chinese words are left out or given in English.
    static func zh(_ text: String) -> String { AppLanguage.isEnglish ? "" : text }
    static var ssh: String { L("SSH 直读") }
    static let typeIds = ["bankcard", "phone", "server", "appleid", "google", "ai", "domain", "subscription", "database", "license", "repository", "deployment", "storage"]

    static var assetFields: [String: Any] {
        func text(_ description: String) -> [String: Any] { ["type": "string", "description": description] }
        let dateKind: [String: Any] = ["type": "string", "enum": ["expire", "renew", "trial", "cancel", "keep"], "description": "What happens on date: expire, renew (auto-charge), trial (ends), cancel (deadline), keep (number retention)"]
        let cycle: [String: Any] = ["type": "string", "enum": ["", "monthly", "quarterly", "halfyearly", "yearly"], "description": "Billing cycle"]
        let type: [String: Any] = ["type": "string", "enum": typeIds, "description": "Category; see list_asset_types. Inferred from the name when omitted on add"]
        let ips: [String: Any] = ["type": "array", "items": ["type": "string"], "description": "Server: up to 4 IP addresses"]
        let linkTo: [String: Any] = ["type": "array", "items": ["type": "string"], "description": "Ids of assets to link: the card that pays\(zh(" (付款卡)")), the Apple ID / Google account it logs in with\(zh(" (登录账号)")), the phone that receives codes\(zh(" (验证手机号)")), the server it runs on, the repository a deployment builds from, the domain bound to it… The meaning follows from the two categories; illegal pairs are refused"]
        let unlinkFrom: [String: Any] = ["type": "array", "items": ["type": "string"], "description": "Ids of linked assets to unlink"]
        return [
            "name": text("Display name, e.g. example.com or Notion Plus (max 100)"),
            "type": type,
            "provider": text("Vendor, registrar, bank or carrier; prefer a name from list_asset_types providers"),
            "account": text("Login or account the asset belongs to"),
            "date": text("Next due date, YYYY-MM-DD"),
            "dateKind": dateKind,
            "cycle": cycle,
            "cost": text("Price as text, e.g. \"$10.98 / 年\"; prefer amount + currency"),
            "amount": ["type": "number", "description": "Price per cycle as a number, e.g. 10.98; with currency and cycle it becomes the cost. 0 means free (billingType becomes free)"],
            "currency": text("ISO code of amount: CNY, USD, EUR, GBP, HKD, JPY, SGD, AUD or CAD"),
            "url": text("Management link, http(s) only"),
            "purpose": text("What it is used for"),
            "reason": text("Why it is kept"),
            "notes": text("Free notes (max 2000). Never put passwords, codes or full card numbers here"),
            "region": text("Country or region code (bankcard, phone, appleid, google), e.g. US, HK"),
            "last4": text("Bank card: last 4 digits only"),
            "network": text("Bank card network: Visa, Mastercard, 银联, American Express, JCB, Discover, 其他"),
            "cardStatus": ["type": "string", "enum": ["", "frozen", "declined", "closed"], "description": "Bank card state besides its expiry: frozen (stopped or reported lost), declined (charges refused), closed (the issuer shut down, e.g. a virtual card service); empty = normal. Anything but empty marks what the card pays for as at risk"],
            "phoneStatus": ["type": "string", "enum": ["", "suspended", "ported"], "description": "Phone number state besides its keep date: suspended (cut off by the carrier), ported (moved to another carrier); empty = normal. Anything but empty marks what the number verifies as at risk"],
            "phone": text("Phone number (phone category)"),
            "host": text("Server: SSH host"),
            "ips": ips,
            "linkTo": linkTo,
            "unlinkFrom": unlinkFrom,
            "sshUser": text("Server: SSH user"),
            "sshPort": text("Server: SSH port"),
            "localPath": text("Repository: local directory, starting with / or ~/"),
            "importance": ["type": "string", "enum": ["", "critical", "normal", "disposable"], "description": "How much losing it would matter: critical (listed first in the handover), normal, disposable (stays on the board but sends no notifications)"],
            "mfa": ["type": "string", "enum": ["", "totp", "passkey", "key", "sms", "email", "none"], "description": "Accounts (appleid, google, subscription, ai, domain): two-step verification kind"],
            "mfaWhere": text("Accounts: where the authenticator is, e.g. an app on which device. A place only, never a code"),
            "recoveryCodes": text("Accounts: where the recovery codes are kept. A place only; something that looks like a code is refused"),
            "vault": text("Accounts: which password manager or vault holds the password. Never the password"),
            "backup": ["type": "string", "enum": ["", "elsewhere", "platform", "snapshot", "none"], "description": "Servers, databases, storage, repositories: where backups are (elsewhere = another provider or local; snapshot = only snapshots on the same platform)"],
            "backupNote": text("Servers, databases, storage, repositories: how it is backed up (max 100)"),
            "restoreTestedOn": text("Servers, databases, storage, repositories: the last day a restore was tried, YYYY-MM-DD"),
            "legacy": ["type": "string", "enum": ["", "set", "none"], "description": "Apple ID: \(L("遗产联系人")); Google: \(L("闲置账号管理器")). set or none (whether someone can get at the account if its owner cannot)"],
            "dnsHost": text("Domain: where its DNS is hosted, e.g. Cloudflare (filled in for active Cloudflare zones)"),
            "icp": text("Domain: ICP filing number\(zh(" (备案号)")), must contain ICP; a filed domain reminds to cancel the filing when it is given up"),
            "billingType": ["type": "string", "enum": ["", "recurring", "one_off", "free", "unknown"], "description": "How it is billed. recurring needs a cycle; one_off is paid once (left out of recurring totals, summed apart); free costs nothing; empty = infer (amount 0 or 免费 → free, amount + cycle → recurring, otherwise unknown). An empty cycle alone never means one-off"],
            "promotion": ["type": ["object", "null"], "description": "A discounted price for a while: {start?, end, amount, regularAmount?, currency?} (dates YYYY-MM-DD; amount may be 0; regularAmount defaults to today's price). Totals use the promo price until end, the regular price after; when it ends the regular price becomes the cost and the change goes into the price history. null removes it", "properties": ["start": text("YYYY-MM-DD, default today"), "end": text("YYYY-MM-DD, last day of the promo price"), "amount": ["type": "number"], "regularAmount": ["type": "number"], "currency": text("ISO code")]],
            "project": text("Project label (max 40), e.g. notes-app; assets with the same label form a project with its own totals and shutdown list"),
            "projectId": text("Alias of project"),
            "iconHost": text("Site to take the icon from, e.g. wise.com: Assetboard fetches it itself over https (see iconStatus on the asset); empty removes the site icon"),
            "icon": text("An icon you already have, as data:image/png, jpeg or webp;base64,… up to 256 KB; shown instead of the site icon; empty removes it"),
            "hidden": ["type": "boolean", "description": "Updates only: true hides the asset (\(zh("隐藏: "))left out of lists, totals and reminders), false shows it again"],
            "stopped": ["type": "boolean", "description": "Updates only: true marks it \(L("已停用")) (servers, domains, repositories, databases, licenses, subscriptions, AI plans, deployments, storage, phone numbers), false in use again"],
            "probeLink": ["type": ["object", "string", "null"], "description": "Updates only, servers: {source, serverId} links the card to a probe server (see list_probe_servers), \"none\" keeps it out of matching, \"auto\" or null matches it automatically again",
                          "properties": ["source": text("Probe source id, or ssh"), "serverId": text("Server id within that source")]]
        ]
    }

    static func tool(_ name: String, _ title: String, _ description: String, _ properties: [String: Any], _ required: [String], readOnly: Bool, destructive: Bool = false) -> [String: Any] {
        let schema: [String: Any] = ["type": "object", "properties": properties, "required": required, "additionalProperties": false]
        var annotations: [String: Any] = ["readOnlyHint": readOnly]
        if !readOnly { annotations["destructiveHint"] = destructive }
        return ["name": name, "title": title, "description": description, "inputSchema": schema, "annotations": annotations]
    }

    static var tools: [[String: Any]] {
        let id: [String: Any] = ["type": "string"]
        let type: [String: Any] = ["type": "string", "enum": typeIds]
        let limit: [String: Any] = ["type": "integer", "minimum": 1, "maximum": 500, "description": "Default 100"]
        let offset: [String: Any] = ["type": "integer", "minimum": 0]
        let asset: [String: Any] = ["type": "object", "properties": assetFields, "required": ["name"]]
        let items: [String: Any] = ["type": "array", "minItems": 1, "maxItems": 100, "items": asset]
        let fields: [String: Any] = ["type": "object", "properties": assetFields]
        let reason: [String: Any] = ["type": "string", "description": "Shown to the user in the confirmation"]
        let text: [String: Any] = ["type": "string"]
        let date: [String: Any] = ["type": "string", "description": "YYYY-MM-DD"]
        let billingType: [String: Any] = ["type": "string", "enum": ["recurring", "one_off", "free", "unknown"]]
        let currency: [String: Any] = ["type": "string", "description": "ISO code: CNY, USD, EUR, GBP, HKD, JPY, SGD, AUD or CAD"]
        let listProperties: [String: Any] = ["type": type, "query": ["type": "string"], "includeHidden": ["type": "boolean"], "limit": limit, "offset": offset, "project": text, "billingType": billingType]
        let update: [String: Any] = ["type": "object", "properties": ["id": id, "fields": fields], "required": ["id", "fields"]]
        let ids: [String: Any] = ["type": "array", "minItems": 1, "maxItems": 100, "items": ["type": "string"]]
        return [
            tool("list_asset_types", "List categories", "List Assetboard's asset categories (id, Chinese name, hint) with common vendors for each (providers). Use one of those names as provider when it fits, so the record matches the app's presets and gets the vendor's site icon; any other name is accepted too.", [:], [], readOnly: true),
            tool("list_assets", "List or search assets", "List assets, optionally filtered by category and a search text (name, provider, account, purpose, notes, region, IP). Hidden assets are left out unless includeHidden is true. Returns {total, offset, assets}.", listProperties, [], readOnly: true),
            tool("get_cost_totals", "Recurring cost totals", "Monthly and yearly recurring cost in one currency (assets keep their own; converted with the day's ECB rates; a running promotion counts at its promo price), by category and largest first. oneOffTotal sums one-off costs apart. notCounted lists free, oneOff, noCycle (amount without a cycle), unreadable and noRate ids. Filter by type or project; groupBy splits the totals. Hidden and stopped assets are left out.", ["currency": ["type": "string", "enum": ["CNY", "USD", "EUR", "GBP", "HKD", "JPY"]], "type": type, "project": text, "groupBy": ["type": "string", "enum": ["project", "type"]]], [], readOnly: true),
            tool("get_cost_forecast", "Spending forecast", "Expected spending between from and to (default: the next 12 months, at most 5 years): every charge date of every asset priced on that day — promotions and their end, trials turning into charges, manual renewals at today's price, one-off costs on their date; recurring costs without a date are spread per month (basis \"spread\"). Returns total, byMonth, items and what could not be counted.", ["from": date, "to": date, "months": ["type": "integer", "minimum": 1, "maximum": 60], "currency": currency, "type": type, "project": text], [], readOnly: true),
            tool("get_cost_history", "Price history", "Every change of an asset's cost (from, to, amountFrom, amountTo, currencies, at, source: edit, agent, renew, payment, promotion-end, import), newest first; with id, also that asset's payments.", ["id": id, "from": date, "limit": ["type": "integer", "minimum": 1, "maximum": 1000]], [], readOnly: true),
            tool("list_projects", "List projects", "Projects (the project labels in use) with how many assets each has and their monthly and yearly recurring cost.", [:], [], readOnly: true),
            tool("list_unconfirmed_charges", "Unconfirmed automatic charges", "Automatic charges (dateKind renew with a cycle) whose day has come in the last 45 days and that nobody has confirmed. Answer them with record_payment (covers = the due date).", [:], [], readOnly: true),
            tool("record_payment", "Record a payment", "Write down what was actually paid for an asset (or, with missed: true, that an expected charge did not happen). amount and currency default to the price on that day; covers is the due date it pays for. Undoable in the app. Returns the payment and the asset.", ["id": id, "paidOn": date, "amount": ["type": "number"], "currency": currency, "covers": date, "months": ["type": "integer"], "note": text, "missed": ["type": "boolean"]], ["id"], readOnly: false),
            tool("renew_asset", "Mark an asset renewed", "Move an asset's date to until (renewal counted from the current due date), record what was paid, and by default update the price when the payment covers exactly one cycle. Returns the asset, the payment and the date it renewed from.", ["id": id, "until": date, "amount": ["type": "number"], "currency": currency, "paidOn": date, "updateCost": ["type": "boolean"]], ["id", "until"], readOnly: false),
            tool("update_assets", "Update several assets", "Batch of update_asset: [{id, fields}] up to 100. Every item is checked first; valid ones are written together as one undo step, the others report why. Returns {updated, failed, results[{index, id, ok, asset | error}]}.", ["updates": ["type": "array", "minItems": 1, "maxItems": 100, "items": update]], ["updates"], readOnly: false),
            tool("request_delete_assets", "Request deleting several assets", "Ask to delete up to 100 assets at once. Nothing is deleted right away: the user sees one list and ticks what to delete. Returns status pending and an actionId; check it with get_action_status.", ["ids": ids, "reason": reason], ["ids"], readOnly: false, destructive: true),
            tool("list_pending_actions", "List confirmation requests", "Requests that wait for the user (deletes), newest first, with their status: pending, done (at least one record deleted), cancelled (all kept) or failed; each item says deleted, kept, failed or pending.", ["status": ["type": "string", "enum": ["pending", "done", "cancelled", "failed"]], "limit": ["type": "integer", "minimum": 1, "maximum": 200]], [], readOnly: true),
            tool("get_action_status", "Get one confirmation request", "One request by actionId (from delete_asset or request_delete_assets): status, requestedAt, resolvedAt and the answer for each asset.", ["id": id], ["id"], readOnly: true),
            tool("get_asset", "Get one asset", "Return every stored field of one asset by id, with relations (each linked asset and what the link means from this side, e.g. 付款卡, 登录账号, 所在服务器) and risks (an expiring card or phone it depends on). Icons come as hasCustomIcon / hasSiteIcon / siteIconHost / iconStatus, not image data.", ["id": id], ["id"], readOnly: true),
            tool("add_assets", "Add assets", "Add up to 100 assets. They are written at once and the user can undo the batch with ⌘Z. An asset whose category already holds the same name is skipped and its id returned, so use update_asset for it. Returns {added, skipped, errors, warnings}.", ["items": items], ["items"], readOnly: false),
            tool("update_asset", "Update an asset", "Change some fields of one asset; fields not given stay as they are, and an empty string clears one. Records synced from Cloudflare or GitHub keep their name and category. Returns the updated asset.", ["id": id, "fields": fields], ["id", "fields"], readOnly: false),
            tool("delete_asset", "Request deleting an asset", "Ask to delete one asset. Nothing is deleted right away: the user confirms in Assetboard, so this returns status \"pending\" and an actionId. Check it with get_action_status.", ["id": id, "reason": reason], ["id"], readOnly: false, destructive: true)
        ] + proTools
    }

    /// Probe sources, SSH 直读, site icons and the Cloudflare sync. No tool takes or returns a user name, password, token or session:
    /// accounts and tokens are entered in the app only. Slow work (reading a panel, ssh, icons, a sync) answers at once with a status
    /// to look up later.
    static var proTools: [[String: Any]] {
        let id: [String: Any] = ["type": "string"]
        let text: [String: Any] = ["type": "string"]
        let reason: [String: Any] = ["type": "string", "description": "Shown to the user in the confirmation"]
        let url: [String: Any] = ["type": "string", "description": "The panel's address, e.g. status.example.com (https:// is added; any path is dropped)"]
        let name: [String: Any] = ["type": "string", "maxLength": 60, "description": "Display name; defaults to the host"]
        let alias: [String: Any] = ["type": "string", "description": "A Host alias from ~/.ssh/config, as list_ssh_hosts names it"]
        let assetId: [String: Any] = ["type": "string", "description": "A server asset's id"]
        let ids: [String: Any] = ["type": "array", "minItems": 1, "maxItems": 100, "items": ["type": "string"]]
        return [
            tool("list_probe_sources", "List probe sources", "Monitoring panels Assetboard reads\(zh(" (探针数据源)")): id, name, kind, url, hasLogin, status (ok, loading, unread, needsLogin: the panel is not public and its account must be entered in the app, badLogin, humanCheck, error) with a message, how many servers were read and linked, updatedAt. Never returns user names, passwords or sessions.", [:], [], readOnly: true),
            tool("add_probe_source", "Add a probe source", "Add a monitoring panel by its address (normalized as in the app: https:// added, path dropped). Returns its id and status checking at once; read the outcome with list_probe_sources. A panel that is not public answers needsLogin: its account can only be entered in Assetboard (\(L("文件")) → \(L("探针数据源…"))), never here. Kept on this Mac, not on the board: not undoable\(zh(" (不可撤销)")).", ["url": url, "name": name], ["url"], readOnly: false),
            tool("update_probe_source", "Update a probe source", "Change a probe source's address or name; a kept panel account stays. Returns status checking; see list_probe_sources. Not undoable\(zh(" (不可撤销)")).", ["id": id, "url": url, "name": name], ["id"], readOnly: false),
            tool("remove_probe_source", "Request removing a probe source", "Ask to remove a probe source (and its account in the Keychain). Nothing happens until the user confirms in Assetboard: returns status pending and an actionId for get_action_status. Hand links stay. Not undoable once confirmed\(zh(" (不可撤销)")).", ["id": id, "reason": reason], ["id"], readOnly: false, destructive: true),
            tool("refresh_probe_sources", "Refresh probe sources", "Read one probe source (id) or all of them again now. Returns status refreshing at once; see list_probe_sources and list_probe_servers.", ["id": id], [], readOnly: false),
            tool("list_probe_servers", "List probe servers", "Servers the probe sources (and \(ssh), source ssh) report: source, serverId, name, online, lastSeen and the server card each shows on (linkedAssetId, how: manual, ip, host or name). unmatchedOnly lists those on no card. No addresses.", ["source": text, "unmatchedOnly": ["type": "boolean"]], [], readOnly: true),
            tool("get_server_metrics", "Get a server's live readings", "A server card's probe readings: online, lastSeen, cpu (%), memory and disk {used, total, percent} in bytes, traffic this month, network rate (\(ssh)), uptime and load, and the history's average and peak. linked false when no probe server is on it.", ["assetId": assetId], ["assetId"], readOnly: true),
            tool("set_probe_link", "Link a server card to a probe", "Link a server card to a probe server (source + serverId from list_probe_servers), keep it out of matching (mode none), or match it automatically again (mode auto). Board data: undoable in the app with ⌘Z. Returns the card's readings.", ["assetId": assetId, "source": text, "serverId": text, "mode": ["type": "string", "enum": ["link", "none", "auto"]]], ["assetId"], readOnly: false),
            tool("list_ssh_hosts", "List \(ssh) hosts", "Hosts of ~/.ssh/config for \(ssh) (read-only readings over the system's ssh): alias, enabled, manuallyOff, inConfig, status (off, waiting, reading, ok, error), problem and message, lastReadAt, the linked server card, and the interval. Never returns HostName, addresses, user names, ports, IdentityFile or the config itself.", [:], [], readOnly: true),
            tool("set_ssh_host", "Turn \(ssh) on or off for a host", "enabled true asks to turn it on: Assetboard would connect with the user's own ssh keys, so the user confirms in the app first (returns pending and an actionId for get_action_status). enabled false turns it off at once and remembers it as switched off by hand, so automatic matching will not turn it back on. A setting on this Mac: not undoable\(zh(" (不可撤销)")).", ["alias": alias, "enabled": ["type": "boolean"], "reason": reason], ["alias", "enabled"], readOnly: false),
            tool("set_ssh_interval", "Set the \(ssh) interval", "How often hosts are read while the window is visible: 30, 60, 120 or 300 seconds. A setting on this Mac: not undoable\(zh(" (不可撤销)")).", ["seconds": ["type": "integer", "enum": [30, 60, 120, 300]]], ["seconds"], readOnly: false),
            tool("refresh_ssh", "Refresh \(ssh)", "Read one enabled host (alias) or all enabled hosts now. Returns status refreshing at once; see list_ssh_hosts and get_server_metrics.", ["alias": alias], [], readOnly: false),
            tool("list_icon_platforms", "List icon platforms", "Platforms whose site icons the assets use (as in \(L("获取网站图标…"))): platform, the site icons come from (customSite when the user chose one), how many assets and asset ids, how many have an icon, fetching, lastError; autoIcons; lastFetch: the status of the last fetch_icons (fetching, done or failed, with each platform's state and how many assets were updated).", [:], [], readOnly: true),
            tool("set_icon_site", "Choose a platform's icon site", "Take a platform's icons from another site (a domain or https link; no IPs, local names or credentials), or null to go back to the platform's own. Board data: undoable with ⌘Z. Does not fetch; call fetch_icons.", ["platform": text, "site": ["type": ["string", "null"]]], ["platform"], readOnly: false),
            tool("fetch_icons", "Fetch site icons", "Fetch site icons for one platform, for some assets (assetIds) or for every asset without one; overwrite replaces icons already there (custom icons are never replaced). Returns status fetching and a jobId at once; the icons are applied together in one undo step when every request has answered, see lastFetch in list_icon_platforms.", ["platform": text, "assetIds": ids, "overwrite": ["type": "boolean"]], [], readOnly: false),
            tool("get_cloudflare_sync_status", "Cloudflare sync status", "Whether Cloudflare is connected, a sync is running, when it last synced, the synced assets by kind and the last result (added, or the error). Never returns the token.", [:], [], readOnly: true),
            tool("sync_cloudflare", "Sync Cloudflare", "Read the connected Cloudflare account again (zones, Pages, Workers, R2 and Registrar dates) with the token kept in the Keychain; this tool never takes or returns a token. Returns status syncing at once; see get_cloudflare_sync_status. New assets undo with ⌘Z.", [:], [], readOnly: false),
            tool("list_sync_blocklist", "List the sync blocklist", "Synced items the user deleted, which syncs skip from now on: key, source (cloudflare, github, ssh, csv), kind, externalId.", [:], [], readOnly: true),
            tool("unblock_sync_item", "Request letting a sync add an item back", "Ask to take one key off the sync blocklist, so the next sync adds it back. The user confirms in Assetboard first: returns pending and an actionId for get_action_status.", ["key": text, "reason": reason], ["key"], readOnly: false)
        ]
    }

    static let methods = ["get_cost_totals": "totals", "list_asset_types": "types", "list_assets": "list", "get_asset": "get", "add_assets": "add", "update_asset": "update", "delete_asset": "delete",
                          "get_cost_forecast": "forecast", "get_cost_history": "costHistory", "list_projects": "projects", "list_unconfirmed_charges": "charges", "record_payment": "recordPayment", "renew_asset": "renew",
                          "update_assets": "updateMany", "request_delete_assets": "deleteMany", "list_pending_actions": "actions", "get_action_status": "action",
                          "list_probe_sources": "probeSources", "add_probe_source": "probeSourceAdd", "update_probe_source": "probeSourceUpdate", "remove_probe_source": "probeSourceRemove",
                          "refresh_probe_sources": "probeRefresh", "list_probe_servers": "probeServers", "get_server_metrics": "serverMetrics", "set_probe_link": "probeLink",
                          "list_ssh_hosts": "sshHosts", "set_ssh_host": "sshSet", "set_ssh_interval": "sshInterval", "refresh_ssh": "sshRefresh",
                          "list_icon_platforms": "iconPlatforms", "set_icon_site": "iconSite", "fetch_icons": "iconFetch",
                          "get_cloudflare_sync_status": "cloudflareStatus", "sync_cloudflare": "cloudflareSync", "list_sync_blocklist": "syncBlocklist", "unblock_sync_item": "syncUnblock"]

    static func run() {
        while let line = readLine(strippingNewline: true) {
            if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            guard let message = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else {
                send(["jsonrpc": "2.0", "id": NSNull(), "error": ["code": -32700, "message": "Parse error"]])
                continue
            }
            if let reply = handle(message) { send(reply) }
        }
    }

    /// The reply to one message, or nil for a notification (no id) or a response from the client.
    static func handle(_ message: [String: Any]) -> [String: Any]? {
        guard let id = message["id"], !(id is NSNull), let method = message["method"] as? String else { return nil }
        let params = message["params"] as? [String: Any] ?? [:]
        var reply: [String: Any] = ["jsonrpc": "2.0", "id": id]
        switch method {
        case "initialize":
            let asked = params["protocolVersion"] as? String ?? ""
            reply["result"] = [
                "protocolVersion": protocolVersions.contains(asked) ? asked : protocolVersions[0],
                "capabilities": ["tools": ["listChanged": false]],
                "serverInfo": ["name": "assetboard", "title": "Assetboard", "version": AssetboardCLI.version],
                "instructions": "Assetboard keeps a person's domains, servers, subscriptions, bank cards (last 4 digits only), phone numbers and accounts on their Mac. Adds and edits apply at once and can be undone in the app; deletes wait for the person's confirmation. Probe sources, \(ssh), site icons and the Cloudflare sync can be read and steered too: removing a source, turning \(ssh) on and letting a sync add back a deleted item wait for confirmation as well, and slow work answers with a status to look up later. Accounts, passwords and tokens are entered in the app only and never pass through these tools. Never store passwords, verification codes or full card numbers."
            ]
        case "ping":
            reply["result"] = [String: Any]()
        case "tools/list":
            reply["result"] = ["tools": tools]
        case "tools/call":
            let name = params["name"] as? String ?? ""
            guard let target = methods[name] else {
                reply["error"] = ["code": -32602, "message": "Unknown tool: \(name)"]
                return reply
            }
            let arguments = params["arguments"] as? [String: Any] ?? [:]
            do {
                let result = try AssetboardCLI.invoke(target, arguments)
                reply["result"] = ["content": [["type": "text", "text": AssetboardCLI.pretty(result)]], "isError": false]
            } catch {
                reply["result"] = ["content": [["type": "text", "text": AssetboardCLI.message(error)]], "isError": true]
            }
        default:
            reply["error"] = ["code": -32601, "message": "Method not found: \(method)"]
        }
        return reply
    }

    static func send(_ message: [String: Any]) {
        guard var data = try? JSONSerialization.data(withJSONObject: message, options: [.withoutEscapingSlashes]) else { return }
        data.append(10)
        FileHandle.standardOutput.write(data)
    }
}
