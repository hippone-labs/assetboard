import Foundation
import JavaScriptCore
import Security
import SQLite3

#if !ASSETBOARD_FREE
/// AI 额度与用量: what the AI tools signed in on this Mac have used, and how much of their plans' limits is left, shown on the
/// person's AI subscription records. The readers are the page's own ai-usage.js, run here in a JavaScriptCore context of their
/// own: this file only finds the tools' files, reads what was appended since the last pass, runs fixed read-only SQLite queries and,
/// for a tool the person turned it on for, makes one fixed GET (or a local POST to Antigravity's own language server) with that
/// tool's own login. The readers keep numbers, model names and times; prompts, replies, paths and tokens never reach the page.
///
/// Local reading is on unless switched off per tool (设置 › 连接 › AI 额度); the endpoints are off until turned on per tool, and
/// only the page can turn one on, after the person read what it does (an agent cannot). Credentials are read from the tool's own
/// store at the moment of the request, kept in memory for that request only, never written anywhere and never logged.
enum AIUsageSource: String, CaseIterable {
    case claude, codex, cursor, copilot, grok, opencode, antigravity

    /// The fixed request for a tool's usage endpoint. Antigravity is a POST to the local language server, found per read.
    var endpoint: URL? {
        switch self {
        case .claude: return URL(string: "https://api.anthropic.com/api/oauth/usage")
        case .codex: return URL(string: "https://chatgpt.com/backend-api/wham/usage")
        case .cursor: return URL(string: "https://cursor.com/api/usage-summary")
        case .copilot: return URL(string: "https://api.github.com/copilot_internal/user")
        case .grok: return URL(string: "https://cli-chat-proxy.grok.com/v1/billing?format=credits")
        case .opencode: return URL(string: "https://opencode.ai/zen/go/v1/usage")
        case .antigravity: return nil
        }
    }
    static let apiHosts: Set<String> = ["api.anthropic.com", "chatgpt.com", "cursor.com", "api.github.com", "cli-chat-proxy.grok.com", "opencode.ai", "127.0.0.1"]
    /// Antigravity has nothing on disk to read without its login; the others do.
    var hasLocal: Bool { self != .antigravity }
}

/// Per tool: local reading (default on) and the endpoint (default off). A viewer setting in UserDefaults, never in the board.
final class AIUsageSettings {
    static let key = "aiUsageSources"
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    private var stored: [String: [String: Bool]] { defaults.dictionary(forKey: Self.key) as? [String: [String: Bool]] ?? [:] }
    func local(_ source: AIUsageSource) -> Bool { source.hasLocal && (stored[source.rawValue]?["local"] ?? true) }
    func api(_ source: AIUsageSource) -> Bool { stored[source.rawValue]?["api"] ?? false }
    func set(_ source: AIUsageSource, local: Bool? = nil, api: Bool? = nil) {
        var all = stored, one = all[source.rawValue] ?? [:]
        if let local { one["local"] = local }
        if let api { one["api"] = api }
        all[source.rawValue] = one
        defaults.set(all, forKey: Self.key)
    }
    var summary: [[String: Any]] { AIUsageSource.allCases.map { ["id": $0.rawValue, "local": local($0), "api": api($0), "hasLocal": $0.hasLocal] } }
}

/// ai-usage.js in a JavaScriptCore context, with one store for the app's lifetime. Used from one serial queue only.
final class AIUsageEngine {
    private let context: JSContext
    private let store: JSValue
    private(set) var scriptError: String?

    init?(script: String) {
        guard let context = JSContext() else { return nil }
        self.context = context
        var failure: String?
        context.exceptionHandler = { _, exception in failure = exception?.toString() ?? "exception" }
        context.evaluateScript(script)
        guard failure == nil, let make = context.objectForKeyedSubscript("aiUsageStore"), !make.isUndefined,
              let store = make.call(withArguments: []), store.isObject else { return nil }
        self.store = store
        context.exceptionHandler = { [weak self] _, exception in self?.scriptError = exception?.toString() }
    }

    static func bundled() -> AIUsageEngine? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("Board/ai-usage.js"),
              let script = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AIUsageEngine(script: script)
    }

    private var now: Double { Date().timeIntervalSince1970 * 1000 }
    @discardableResult
    func feed(_ source: AIUsageSource, _ kind: String, _ payload: Any, key: String = "") -> Int {
        Int(store.invokeMethod("feed", withArguments: [source.rawValue, kind, payload, key, now])?.toInt32() ?? 0)
    }
    func fail(_ source: AIUsageSource, _ reason: String) { store.invokeMethod("fail", withArguments: [source.rawValue, reason, now]) }
    func clear(_ source: AIUsageSource) { store.invokeMethod("clear", withArguments: [source.rawValue]) }
    func snapshotJSON() -> String { store.invokeMethod("snapshotJSON", withArguments: [now])?.toString() ?? "{}" }
    var size: Int { Int(store.invokeMethod("size", withArguments: [])?.toInt32() ?? 0) }
}

/// Where each tool keeps its files, and what has been read of them. `home` and `env` are parameters so the self-test can point
/// it at a folder of made-up files.
final class AIUsageScanner {
    static let maxChunk = 8 * 1024 * 1024
    static let maxFileBytes: UInt64 = 512 * 1024 * 1024
    static let window: TimeInterval = 35 * 86400
    static let rowLimit = 20000
    let home: URL
    let env: [String: String]
    private var marks: [String: (size: UInt64, offset: UInt64, modified: Date)] = [:]
    init(home: URL = FileManager.default.homeDirectoryForCurrentUser, env: [String: String] = ProcessInfo.processInfo.environment) { self.home = home; self.env = env }

    private func path(_ value: String) -> URL { URL(fileURLWithPath: (value as NSString).expandingTildeInPath) }
    func envDir(_ name: String) -> URL? { env[name].flatMap { $0.isEmpty ? nil : path($0) } }

    func claudeRoots() -> [URL] {
        if let list = env["CLAUDE_CONFIG_DIR"], !list.isEmpty {
            return list.split(separator: ",").map { path(String($0).trimmingCharacters(in: .whitespaces)) }.map { $0.lastPathComponent == "projects" ? $0 : $0.appendingPathComponent("projects") }
        }
        let config = envDir("XDG_CONFIG_HOME") ?? home.appendingPathComponent(".config")
        return [config.appendingPathComponent("claude/projects"), home.appendingPathComponent(".claude/projects")]
    }
    var codexHome: URL { envDir("CODEX_HOME") ?? home.appendingPathComponent(".codex") }
    var copilotHome: URL { envDir("COPILOT_HOME") ?? home.appendingPathComponent(".copilot") }
    var grokHome: URL { envDir("GROK_HOME") ?? home.appendingPathComponent(".grok") }
    var opencodeData: URL { (envDir("XDG_DATA_HOME") ?? home.appendingPathComponent(".local/share")).appendingPathComponent("opencode") }
    var cursorState: URL { home.appendingPathComponent("Library/Application Support/Cursor/User/globalStorage/state.vscdb") }

    /// Every regular file under `dir` whose name passes `test`, changed within the window.
    func files(_ dir: URL, _ test: (String) -> Bool) -> [(url: URL, size: UInt64, modified: Date)] {
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants]) else { return [] }
        let since = Date().addingTimeInterval(-Self.window)
        var out: [(URL, UInt64, Date)] = []
        for case let url as URL in walker {
            guard test(url.lastPathComponent), let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                  let modified = values.contentModificationDate, modified >= since else { continue }
            out.append((url, UInt64(values.fileSize ?? 0), modified))
        }
        return out
    }

    /// What was appended to a JSONL file since the last pass, whole lines only; a file that shrank is read again from the start.
    func appended(_ file: (url: URL, size: UInt64, modified: Date)) -> String? {
        let key = file.url.path
        var mark = marks[key] ?? (size: 0, offset: 0, modified: Date.distantPast)
        if file.size < mark.offset { mark = (size: 0, offset: 0, modified: Date.distantPast) }
        guard file.size > mark.offset, file.size <= Self.maxFileBytes, let handle = try? FileHandle(forReadingFrom: file.url) else { return nil }
        defer { try? handle.close() }
        var text = ""
        var offset = mark.offset
        while offset < file.size {
            guard (try? handle.seek(toOffset: offset)) != nil, let data = try? handle.read(upToCount: Self.maxChunk), !data.isEmpty else { break }
            guard let last = data.lastIndex(of: 10) else { break }
            let whole = data[data.startIndex...last]
            text += String(decoding: whole, as: UTF8.self)
            offset += UInt64(whole.count)
            if data.count < Self.maxChunk { break }
        }
        marks[key] = (file.size, offset, file.modified)
        return text.isEmpty ? nil : text
    }

    /// A whole document, only when it changed since the last pass.
    func changed(_ file: (url: URL, size: UInt64, modified: Date)) -> String? {
        let key = file.url.path
        if let mark = marks[key], mark.modified == file.modified, mark.size == file.size { return nil }
        marks[key] = (file.size, file.size, file.modified)
        guard file.size <= 16 * 1024 * 1024 else { return nil }
        return try? String(contentsOf: file.url, encoding: .utf8)
    }

    /// A database, only when it or its write-ahead log changed since the last pass.
    func databaseChanged(_ url: URL) -> Bool {
        let key = url.path
        let stamp = [url, URL(fileURLWithPath: url.path + "-wal")].compactMap { try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate }.max()
        guard let stamp else { return false }
        if let mark = marks[key], mark.modified == stamp { return false }
        marks[key] = (size: 0, offset: 0, modified: stamp)
        return true
    }

    func forget(prefix: String) { marks = marks.filter { !$0.key.hasPrefix(prefix) } }
    func forgetAll() { marks = [:] }

    /// Rows of a fixed query, read-only; a database another app holds open in WAL mode is tried again as immutable.
    static func rows(_ url: URL, _ sql: String, limit: Int = rowLimit) -> [[String: Any]]? {
        var db: OpaquePointer?
        var opened = sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK
        if !opened {
            sqlite3_close(db); db = nil
            let uri = "file:" + (url.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? url.path) + "?immutable=1"
            opened = sqlite3_open_v2(uri, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK
        }
        guard opened, let db else { sqlite3_close(db); return nil }
        defer { sqlite3_close(db) }
        sqlite3_busy_timeout(db, 250)
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else { return nil }
        defer { sqlite3_finalize(statement) }
        var out: [[String: Any]] = []
        while out.count < limit, sqlite3_step(statement) == SQLITE_ROW {
            var row: [String: Any] = [:]
            for i in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, i))
                switch sqlite3_column_type(statement, i) {
                case SQLITE_INTEGER: row[name] = NSNumber(value: sqlite3_column_int64(statement, i))
                case SQLITE_FLOAT: row[name] = NSNumber(value: sqlite3_column_double(statement, i))
                case SQLITE_TEXT: row[name] = sqlite3_column_text(statement, i).map { String(cString: $0) } ?? ""
                case SQLITE_BLOB:
                    let count = Int(sqlite3_column_bytes(statement, i))
                    if let bytes = sqlite3_column_blob(statement, i), count > 0 {
                        let data = Data(bytes: bytes, count: count)
                        // VS Code-style stores keep some values as UTF-16LE blobs.
                        row[name] = data.contains(0) ? String(data: data, encoding: .utf16LittleEndian) ?? "" : String(decoding: data, as: UTF8.self)
                    }
                default: break
                }
            }
            out.append(row)
        }
        return out
    }

    /// One pass over a tool's local files into the engine. Returns whether anything of the tool was found.
    @discardableResult
    func scan(_ source: AIUsageSource, into engine: AIUsageEngine) -> Bool {
        var found = false
        func jsonl(_ list: [(url: URL, size: UInt64, modified: Date)]) {
            for file in list { found = true; if let text = appended(file) { engine.feed(source, "jsonl", text, key: file.url.path) } }
        }
        switch source {
        case .claude:
            for root in claudeRoots() { jsonl(files(root) { $0.hasSuffix(".jsonl") }) }
        case .codex:
            for dir in ["sessions", "archived_sessions"] { jsonl(files(codexHome.appendingPathComponent(dir)) { $0.hasPrefix("rollout-") && $0.hasSuffix(".jsonl") }) }
        case .copilot:
            jsonl(files(copilotHome.appendingPathComponent("session-state")) { $0 == "events.jsonl" })
        case .grok:
            for file in files(grokHome.appendingPathComponent("sessions"), { $0 == "usage.json" }) {
                found = true
                if let text = changed(file) { engine.feed(source, "json", text, key: file.url.path) }
            }
            let db = grokHome.appendingPathComponent("grok.db")
            if FileManager.default.fileExists(atPath: db.path) {
                found = true
                if databaseChanged(db), let rows = Self.rows(db, "SELECT session_id, message_seq, source, model, input_tokens, output_tokens, total_tokens, cost_micros, created_at FROM usage_events ORDER BY rowid DESC LIMIT \(Self.rowLimit)") {
                    engine.feed(source, "rows", rows, key: "grok.db")
                }
            }
        case .opencode:
            let names = (try? FileManager.default.contentsOfDirectory(atPath: opencodeData.path)) ?? []
            for name in names where name == "opencode.db" || name.range(of: "^opencode-[A-Za-z0-9._-]+\\.db$", options: .regularExpression) != nil {
                let db = opencodeData.appendingPathComponent(name)
                found = true
                guard databaseChanged(db) else { continue }
                // v2 keeps assistant messages in session_message, v1 in message; either may be missing.
                for sql in ["SELECT id, data FROM session_message WHERE type = 'assistant' ORDER BY time_created DESC LIMIT \(Self.rowLimit)",
                            "SELECT id, data FROM message ORDER BY time_created DESC LIMIT \(Self.rowLimit)"] {
                    if let rows = Self.rows(db, sql) { engine.feed(source, "rows", rows, key: name) }
                }
            }
            for file in files(opencodeData.appendingPathComponent("storage/message"), { $0.hasSuffix(".json") }) {
                found = true
                if let text = changed(file) { engine.feed(source, "json", text, key: file.url.deletingPathExtension().lastPathComponent) }
            }
        case .cursor:
            if FileManager.default.fileExists(atPath: cursorState.path) {
                found = true
                // The membership keys only: the access token in the same table is never asked for here.
                if databaseChanged(cursorState), let rows = Self.rows(cursorState, "SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/stripeMembershipType', 'cursorAuth/stripeSubscriptionStatus')") {
                    engine.feed(source, "rows", rows, key: "state.vscdb")
                }
            }
        case .antigravity:
            break
        }
        return found
    }
}

/// The tools' own logins, read at the moment of a request (never kept, never logged), and the request each endpoint takes.
enum AIUsageCredentials {
    struct Failure: Error { let text: String }
    static func json(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url), data.count < 1_000_000 else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    /// The payload of a JWT, for its claims (never checked or trusted beyond picking a user id for Cursor's cookie).
    static func jwtClaims(_ token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var text = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while text.count % 4 != 0 { text += "=" }
        guard let data = Data(base64Encoded: text) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    static func keychain(service: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    static func clean(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, text.count < 8192,
              !text.contains(where: { $0.isWhitespace || $0.isNewline }) else { return nil }
        return text
    }

    /// The request for a tool's endpoint with its own login, or why there is none.
    static func request(_ source: AIUsageSource, scanner: AIUsageScanner) throws -> URLRequest {
        guard let url = source.endpoint, let host = url.host, AIUsageSource.apiHosts.contains(host), url.scheme == "https" else { throw Failure(text: L("请求无效")) }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        switch source {
        case .claude:
            // Claude Code keeps its login in ~/.claude/.credentials.json, or on a Mac in the Keychain item "Claude Code-credentials"
            // (macOS asks the person before letting another app read it).
            let file = (scanner.envDir("CLAUDE_CONFIG_DIR") ?? scanner.home.appendingPathComponent(".claude")).appendingPathComponent(".credentials.json")
            let stored = json(file) ?? keychain(service: "Claude Code-credentials").flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
            let oauth = stored?["claudeAiOauth"] as? [String: Any]
            guard let token = clean(oauth?["accessToken"]) else { throw Failure(text: L("没找到 Claude Code 的登录")) }
            if let expires = (oauth?["expiresAt"] as? NSNumber)?.doubleValue, expires / 1000 < Date().timeIntervalSince1970 {
                throw Failure(text: L("Claude Code 的登录已过期，打开 claude 一次再读"))
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
        case .codex:
            let auth = json(scanner.codexHome.appendingPathComponent("auth.json"))
            let tokens = auth?["tokens"] as? [String: Any]
            guard let token = clean(tokens?["access_token"] ?? tokens?["accessToken"]) else {
                throw Failure(text: auth?["OPENAI_API_KEY"] != nil ? L("Codex 用的是 API key，没有订阅额度") : L("没找到 Codex 的登录"))
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let account = clean(tokens?["account_id"] ?? tokens?["accountId"]) { request.setValue(account, forHTTPHeaderField: "ChatGPT-Account-Id") }
        case .cursor:
            let rows = AIUsageScanner.rows(scanner.cursorState, "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1") ?? []
            guard let token = clean(rows.first?["value"]) else { throw Failure(text: L("没找到 Cursor 的登录")) }
            guard !token.hasPrefix("cursor-safe-storage") else { throw Failure(text: L("Cursor 的登录是加密保存的，读不了")) }
            guard let sub = (jwtClaims(token)?["sub"] as? String)?.split(separator: "|").last.map(String.init),
                  sub.range(of: "^[A-Za-z0-9._-]{1,128}$", options: .regularExpression) != nil else { throw Failure(text: L("Cursor 的登录读不懂")) }
            request.setValue("WorkosCursorSessionToken=\(sub)%3A%3A\(token)", forHTTPHeaderField: "Cookie")
        case .copilot:
            guard let gh = LocalCLI.ghPath() else { throw Failure(text: L("没找到 gh，Copilot 额度要用本机 gh 的登录")) }
            let token = try LocalCLI.ghToken(path: gh, user: nil)
            request.setValue("token \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("2025-04-01", forHTTPHeaderField: "X-Github-Api-Version")
        case .grok:
            let auth = json(scanner.grokHome.appendingPathComponent("auth.json")) ?? [:]
            let entry = auth.keys.sorted { a, b in a.hasPrefix("https://auth.x.ai::") && !b.hasPrefix("https://auth.x.ai::") }
                .filter { $0.hasPrefix("https://auth.x.ai::") || $0.contains("/sign-in") }.compactMap { auth[$0] as? [String: Any] }.first
            guard let token = clean(entry?["key"]) else { throw Failure(text: L("没找到 Grok CLI 的登录")) }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("xai-grok-cli", forHTTPHeaderField: "X-XAI-Token-Auth")
        case .opencode:
            let auth = json(scanner.opencodeData.appendingPathComponent("auth.json"))
            let go = auth?["opencode-go"] as? [String: Any]
            let fromDb = AIUsageScanner.rows(scanner.opencodeData.appendingPathComponent("opencode.db"), "SELECT value FROM credential WHERE active = 1 AND integration_id = 'opencode-go' LIMIT 1")?
                .first.flatMap { row -> [String: Any]? in
                    guard let text = row["value"] as? String, let value = try? JSONSerialization.jsonObject(with: Data(text.utf8)) else { return nil }
                    return value as? [String: Any]
                }
            let envKey: Any? = scanner.env["OPENCODE_API_KEY"]
            guard let key = clean(go?["key"] ?? fromDb?["key"] ?? envKey) else { throw Failure(text: L("没找到 opencode Go 的 key")) }
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        case .antigravity:
            throw Failure(text: L("请求无效"))
        }
        return request
    }
}

/// Antigravity's language server listens on 127.0.0.1 while the app runs; its port and CSRF token are in its own command line.
enum AntigravityLocal {
    struct Server: Equatable { let pid: String; let csrf: String; let extensionPort: Int? }
    static func servers(_ psOutput: String) -> [Server] {
        psOutput.split(separator: "\n").compactMap { line in
            let text = String(line)
            let lower = text.lowercased()
            guard lower.range(of: "language[_-]server", options: .regularExpression) != nil,
                  lower.contains("antigravity") else { return nil }
            let parts = text.trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 1)
            guard let pid = parts.first.map(String.init), Int(pid) != nil else { return nil }
            func flag(_ name: String) -> String? {
                guard let range = text.range(of: "--\(name)[= ]+([^ ]+)", options: .regularExpression) else { return nil }
                return String(text[range]).replacingOccurrences(of: "--\(name)", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "= "))
            }
            guard let csrf = flag("csrf_token"), csrf.range(of: "^[A-Za-z0-9-]{8,128}$", options: .regularExpression) != nil else { return nil }
            return Server(pid: pid, csrf: csrf, extensionPort: flag("extension_server_port").flatMap(Int.init))
        }
    }
    static func ports(_ lsofOutput: String) -> [Int] {
        lsofOutput.split(separator: "\n").compactMap { line in
            guard let range = line.range(of: ":([0-9]{2,5}) \\(LISTEN\\)", options: .regularExpression) else { return nil }
            return Int(line[range].dropFirst().split(separator: " ").first ?? "")
        }
    }
    static func request(port: Int, https: Bool, csrf: String, method: String) -> URLRequest? {
        guard (1...65535).contains(port), ["RetrieveUserQuotaSummary", "GetUserStatus"].contains(method),
              let url = URL(string: "\(https ? "https" : "http")://127.0.0.1:\(port)/exa.language_server_pb.LanguageServerService/\(method)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "Connect-Protocol-Version")
        request.setValue(csrf, forHTTPHeaderField: "X-Codeium-Csrf-Token")
        request.httpBody = Data((method == "GetUserStatus" ? "{\"metadata\":{\"ideName\":\"antigravity\",\"extensionName\":\"antigravity\",\"locale\":\"en\"}}" : "{}").utf8)
        return request
    }
}

/// The language server's certificate is its own: trusted for 127.0.0.1 only, and only for this session.
final class LocalhostTrustDelegate: LoggedSessionDelegate {
    @objc func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust, challenge.protectionSpace.host == "127.0.0.1", let trust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}

/// The reader: a pass over the local files every `localEvery` seconds while the page wants readings, the endpoints that are on at
/// most every `apiEvery` seconds (longer after a refusal or a 429), and the snapshot back to the page after each pass.
final class AIUsageMonitor {
    static let localEvery: TimeInterval = 120
    static let apiEvery: TimeInterval = 600
    static let backoff: TimeInterval = 1800
    let settings: AIUsageSettings
    let scanner: AIUsageScanner
    let session: URLSession
    let localSession: URLSession
    private let queue = DispatchQueue(label: "studio.assetboard.ai-usage", qos: .utility)
    private var engine: AIUsageEngine?
    private var timer: DispatchSourceTimer?
    private var apiNext: [AIUsageSource: Date] = [:]
    var onSnapshot: ((String) -> Void)?

    init(settings: AIUsageSettings = AIUsageSettings(), scanner: AIUsageScanner = AIUsageScanner(),
         session: URLSession = NetworkLog.session(L("AI 额度")), engine: AIUsageEngine? = nil) {
        self.settings = settings
        self.scanner = scanner
        self.session = session
        self.localSession = URLSession(configuration: .ephemeral, delegate: LocalhostTrustDelegate(service: L("AI 额度")), delegateQueue: nil)
        self.engine = engine
    }

    func start() {
        queue.async {
            if self.engine == nil { self.engine = AIUsageEngine.bundled() }
            guard self.timer == nil else { self.pass(force: false); return }
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            timer.schedule(deadline: .now(), repeating: Self.localEvery, leeway: .seconds(10))
            timer.setEventHandler { [weak self] in self?.pass(force: false) }
            self.timer = timer
            timer.resume()
        }
    }
    func stop() { queue.async { self.timer?.cancel(); self.timer = nil } }
    func refresh() { queue.async { self.pass(force: true) } }
    func changed(_ source: AIUsageSource) {
        queue.async {
            if !self.settings.local(source) { self.engine?.clear(source); self.scanner.forgetAll() }
            if !self.settings.api(source) { self.apiNext[source] = nil }
            self.pass(force: true)
        }
    }

    /// Synchronous on the monitor's queue (or the self-test's thread).
    func pass(force: Bool) {
        guard let engine else { return }
        for source in AIUsageSource.allCases {
            if settings.local(source) { scanner.scan(source, into: engine) }
            if settings.api(source), force || (apiNext[source] ?? .distantPast) <= Date() { readAPI(source, engine) }
        }
        onSnapshot?(engine.snapshotJSON())
    }

    private func send(_ request: URLRequest, _ session: URLSession) -> (Int, Data?) {
        let finished = DispatchSemaphore(value: 0)
        var status = 0, body: Data?
        session.dataTask(with: request) { data, response, _ in
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            body = data
            finished.signal()
        }.resume()
        guard finished.wait(timeout: .now() + 25) == .success else { return (0, nil) }
        return (status, body.flatMap { $0.count <= 2 * 1024 * 1024 ? $0 : nil })
    }

    func readAPI(_ source: AIUsageSource, _ engine: AIUsageEngine) {
        apiNext[source] = Date().addingTimeInterval(Self.apiEvery)
        if source == .antigravity { readAntigravity(engine); return }
        let request: URLRequest
        do { request = try AIUsageCredentials.request(source, scanner: scanner) } catch {
            engine.fail(source, (error as? AIUsageCredentials.Failure)?.text ?? error.localizedDescription); return
        }
        let (status, body) = send(request, session)
        switch status {
        case 200: engine.feed(source, "api", String(decoding: body ?? Data(), as: UTF8.self))
        case 401, 403: engine.fail(source, L("登录已失效或没有权限（HTTP {status}）", ["status": status])); apiNext[source] = Date().addingTimeInterval(Self.backoff)
        case 429: engine.fail(source, L("请求太频繁，稍后再读")); apiNext[source] = Date().addingTimeInterval(Self.backoff)
        case 0: engine.fail(source, L("连不上 {host}", ["host": request.url?.host ?? ""]))
        default: engine.fail(source, L("回答 HTTP {status}", ["status": status]))
        }
    }

    private func readAntigravity(_ engine: AIUsageEngine) {
        guard let ps = try? LocalCLI.run(executable: "/bin/ps", arguments: ["-ax", "-o", "pid=,command="], timeout: 5),
              let server = AntigravityLocal.servers(ps.stdout).first else { engine.fail(.antigravity, L("Antigravity 没在运行")); return }
        let listening = (try? LocalCLI.run(executable: "/usr/sbin/lsof", arguments: ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", server.pid], timeout: 5)).map { AntigravityLocal.ports($0.stdout) } ?? []
        var tries = listening.map { ($0, true) }
        if let port = server.extensionPort { tries.append((port, false)) }
        for (port, https) in tries {
            guard let request = AntigravityLocal.request(port: port, https: https, csrf: server.csrf, method: "RetrieveUserQuotaSummary") else { continue }
            let (status, body) = send(request, localSession)
            guard status == 200, let body else { continue }
            engine.feed(.antigravity, "api", String(decoding: body, as: UTF8.self))
            if let plan = AntigravityLocal.request(port: port, https: https, csrf: server.csrf, method: "GetUserStatus") {
                let (planStatus, planBody) = send(plan, localSession)
                if planStatus == 200, let planBody { engine.feed(.antigravity, "api", String(decoding: planBody, as: UTF8.self)) }
            }
            return
        }
        engine.fail(.antigravity, L("Antigravity 的本机服务没有回答"))
    }
}

/// The bridge, routed here from Assetboard.swift: aiUsageStart (the page wants readings), aiUsageStop (the feature was switched
/// off), aiUsageRead (read now), aiUsageSet {id, local?, api?, confirm?} (api true only with confirm, sent after the page showed
/// what it does). Answers come back as window.assetboardAiUsage({snapshot, sources}).
let aiUsageMonitor = AIUsageMonitor()

extension AppDelegate {
    func aiUsageResult(snapshot: String?) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: ["sources": aiUsageMonitor.settings.summary]),
                  let settings = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardAiUsage?.({snapshot:\(snapshot ?? "null"),settings:\(settings)})")
        }
    }

    func handleAIUsage(_ action: String, _ body: [String: Any]) {
        if aiUsageMonitor.onSnapshot == nil { aiUsageMonitor.onSnapshot = { [weak self] json in self?.aiUsageResult(snapshot: json) } }
        switch action {
        case "aiUsageStart": aiUsageMonitor.start()
        case "aiUsageStop": aiUsageMonitor.stop()
        case "aiUsageRead": aiUsageMonitor.refresh()
        case "aiUsageSet":
            guard let source = AIUsageSource(rawValue: body["id"] as? String ?? "") else { return }
            let api = body["api"] as? Bool
            // An endpoint is turned on only with the page's confirmation (the person saw what it reads and with which login).
            if api == true && body["confirm"] as? Bool != true { aiUsageResult(snapshot: nil); return }
            aiUsageMonitor.settings.set(source, local: body["local"] as? Bool, api: api)
            aiUsageMonitor.changed(source)
            aiUsageResult(snapshot: nil)
        default: break
        }
    }
}

func testAIUsage() {
    guard let engine = AIUsageEngine.bundled() else { preconditionFailure("ai-usage.js loads in JavaScriptCore") }
    let fm = FileManager.default
    let home = fm.temporaryDirectory.appendingPathComponent("assetboard-ai-usage-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: home) }
    func write(_ rel: String, _ text: String) { let url = home.appendingPathComponent(rel); try! fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true); try! text.write(to: url, atomically: true, encoding: .utf8) }
    let now = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-600))
    let claudeLine = "{\"type\":\"assistant\",\"sessionId\":\"s1\",\"version\":\"2.1.40\",\"timestamp\":\"\(now)\",\"requestId\":\"req_1\",\"message\":{\"id\":\"msg_1\",\"model\":\"claude-sonnet-4-5\",\"content\":[{\"type\":\"text\",\"text\":\"PROMPT-TEXT\"}],\"usage\":{\"input_tokens\":10,\"output_tokens\":1000,\"cache_read_input_tokens\":5000}}}\n"
    write(".claude/projects/demo/s1.jsonl", claudeLine)
    write(".codex/sessions/2026/11/08/rollout-x.jsonl", "{\"timestamp\":\"\(now)\",\"type\":\"turn_context\",\"payload\":{\"model\":\"gpt-5\"}}\n{\"timestamp\":\"\(now)\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":100,\"cached_input_tokens\":0,\"output_tokens\":10,\"total_tokens\":110},\"last_token_usage\":{\"input_tokens\":100,\"cached_input_tokens\":0,\"output_tokens\":10,\"total_tokens\":110}},\"rate_limits\":{\"primary\":{\"used_percent\":91,\"window_minutes\":300,\"resets_in_seconds\":3600},\"plan_type\":\"plus\"}}}\n")
    write(".grok/sessions/%2Fwork/s1/usage.json", "{\"sessionId\":\"s1\",\"turns\":[{\"turnNumber\":1,\"endedAt\":\"\(now)\",\"inputTokens\":100,\"outputTokens\":10,\"cachedReadTokens\":0,\"costUsdTicks\":100000000}]}")
    // Cursor's store holds its token beside the plan; only the plan may be read.
    let state = home.appendingPathComponent("Library/Application Support/Cursor/User/globalStorage/state.vscdb")
    try! fm.createDirectory(at: state.deletingLastPathComponent(), withIntermediateDirectories: true)
    var db: OpaquePointer?
    precondition(sqlite3_open(state.path, &db) == SQLITE_OK)
    sqlite3_exec(db, "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB); INSERT INTO ItemTable VALUES ('cursorAuth/stripeMembershipType','pro'),('cursorAuth/accessToken','SECRET-TOKEN-VALUE');", nil, nil, nil)
    sqlite3_close(db)

    let suite = "assetboard.test.ai-usage.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let settings = AIUsageSettings(defaults: defaults)
    precondition(AIUsageSource.allCases.allSatisfy { settings.api($0) == false } && settings.local(.claude) && !settings.local(.antigravity), "local on, endpoints off by default")
    let scanner = AIUsageScanner(home: home, env: [:])
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockPlatformProtocol.self]
    var asked: [URLRequest] = []
    MockPlatformProtocol.reply = { request in asked.append(request); return (200, Data("{\"five_hour\":{\"utilization\":40,\"resets_at\":\"2099-01-01T00:00:00Z\"}}".utf8)) }
    let monitor = AIUsageMonitor(settings: settings, scanner: scanner, session: URLSession(configuration: configuration), engine: engine)
    var json = ""
    monitor.onSnapshot = { json = $0 }
    monitor.pass(force: true)
    precondition(asked.isEmpty, "no endpoint is called until it is turned on")
    precondition(json.contains("\"anthropic\"") && json.contains("\"openai\"") && json.contains("\"grok\"") && json.contains("\"plus\"") && json.contains("\"pro\""), "local readings: \(json.prefix(300))")
    for leak in ["PROMPT-TEXT", "SECRET-TOKEN-VALUE", home.path, "%2Fwork"] { precondition(!json.contains(leak), "the snapshot leaks \(leak)") }
    let size = engine.size
    // Appended lines are read once; the rest of the file is not read again.
    let handle = try! FileHandle(forWritingTo: home.appendingPathComponent(".claude/projects/demo/s1.jsonl"))
    handle.seekToEndOfFile(); handle.write(Data(claudeLine.replacingOccurrences(of: "msg_1", with: "msg_2").replacingOccurrences(of: "req_1", with: "req_2").utf8)); try? handle.close()
    monitor.pass(force: true)
    precondition(engine.size == size + 1, "one new reply: \(engine.size) after \(size)")

    // An endpoint on: the tool's own login, the fixed host, a GET without cookies; the token never reaches the snapshot.
    write(".claude/.credentials.json", "{\"claudeAiOauth\":{\"accessToken\":\"fake-claude-oauth-token\",\"expiresAt\":4102444800000,\"subscriptionType\":\"max\"}}")
    settings.set(.claude, api: true)
    monitor.pass(force: true)
    precondition(asked.count == 1 && asked[0].url?.absoluteString == "https://api.anthropic.com/api/oauth/usage" && asked[0].httpMethod == "GET" && asked[0].httpShouldHandleCookies == false)
    precondition(asked[0].value(forHTTPHeaderField: "Authorization") == "Bearer fake-claude-oauth-token" && asked[0].value(forHTTPHeaderField: "anthropic-beta") == "oauth-2025-04-20")
    precondition(json.contains("\"windowsFrom\":\"api\"") && !json.contains("fake-claude-oauth-token"), "endpoint reading without the token")
    monitor.pass(force: false)
    precondition(asked.count == 1, "the endpoint waits \(AIUsageMonitor.apiEvery) s between reads")
    MockPlatformProtocol.reply = { request in asked.append(request); return (429, Data()) }
    monitor.pass(force: true)
    precondition(json.contains("\"error\""), "a refusal is said per source")

    // Every endpoint is https on its tool's own host; Cursor's cookie carries only the token's user id and the token.
    for source in AIUsageSource.allCases where source != .antigravity { precondition(source.endpoint?.scheme == "https" && AIUsageSource.apiHosts.contains(source.endpoint?.host ?? ""), "\(source)") }
    let ps = "  4242 /Applications/Antigravity.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm --csrf_token 0123abcd-ef01-2345-6789-abcdef012345 --extension_server_port 61234 --app_data_dir antigravity\n  77 /usr/bin/other --csrf_token zzzzzzzzzz\n"
    precondition(AntigravityLocal.servers(ps) == [AntigravityLocal.Server(pid: "4242", csrf: "0123abcd-ef01-2345-6789-abcdef012345", extensionPort: 61234)])
    precondition(AntigravityLocal.ports("language_ 4242 user 12u IPv4 0x1 0t0 TCP 127.0.0.1:61230 (LISTEN)\nlanguage_ 4242 user 13u IPv4 0x2 0t0 TCP 127.0.0.1:61231 (LISTEN)\n") == [61230, 61231])
    precondition(AntigravityLocal.request(port: 61230, https: true, csrf: "x", method: "RetrieveUserQuotaSummary")?.url?.host == "127.0.0.1" && AntigravityLocal.request(port: 1, https: true, csrf: "x", method: "Delete") == nil)
    print("PASS: AI usage: readers in JavaScriptCore on made-up Claude Code, Codex, Grok and Cursor files, appended lines read once, nothing but numbers in the snapshot (no prompt, token or path), endpoints off by default and then a fixed GET with the tool's own login, the wait between reads, a 429, Antigravity's local server found from ps and lsof output")
}
#endif
