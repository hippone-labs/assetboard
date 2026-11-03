import Foundation
import Security

#if !ASSETBOARD_FREE
/// 实时状态 › 平台状态 (Pro): the state of a person's projects as their own platform's API reports it (Supabase paused, a Vercel
/// deployment failed, a Render service suspended, an Upstash database suspended). Read-only by construction: every request is a GET
/// of a fixed path on the platform's own API host, built here from an allow-list; the page never names a host, a path or a method.
///
/// A source is `{id, kind, name, interval, wide}`, kept in UserDefaults (a viewer setting, never in the board data, an export or a
/// handover); its token is a Keychain item of its own and never goes to the page, which only learns whether one is kept. `wide` says
/// the person confirmed a token with more than read access (Vercel and Render have no read-only token; a legacy Supabase token has
/// the whole account). Answers are cut down here to `{id, name, kind, state, …}` strings: emails, hostnames, env values, database
/// passwords and REST tokens that some of these lists carry never leave this file.
enum PlatformKind: String, CaseIterable {
    case supabase, vercel, render, upstash

    var host: String {
        switch self {
        case .supabase: return "api.supabase.com"
        case .vercel: return "api.vercel.com"
        case .render: return "api.render.com"
        case .upstash: return "api.upstash.com"
        }
    }

    /// Whether the platform offers a token that can only read. Without one the page must have asked the person (`wide`).
    var readOnlyToken: Bool { self == .supabase || self == .upstash }
    /// Upstash signs in with the account email and an API key (HTTP Basic); the others with a bearer token.
    var needsUser: Bool { self == .upstash }

    /// Whether a token gives more than read access, as far as can be told from the token itself: Supabase's scoped tokens start
    /// with sbp_fc, other sbp_ tokens are taken as legacy full-account ones. Vercel and Render tokens always can write.
    func wide(_ secret: String) -> Bool {
        switch self {
        case .supabase: return !secret.hasPrefix("sbp_fc")
        case .vercel, .render: return true
        case .upstash: return false
        }
    }
}

/// Every request this file can make. Ids and cursors are checked before they go into a path or a query.
enum PlatformRead: Equatable {
    case supabaseProjects
    case vercelProjects(from: String?)
    case renderServices(cursor: String?)
    case renderDeploys(service: String)
    case renderPostgres(cursor: String?)
    case renderKeyValue(cursor: String?)
    case upstashDatabases

    static func validId(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9_-]{1,64}$", options: .regularExpression) != nil }
    static func validCursor(_ cursor: String) -> Bool { cursor.range(of: "^[A-Za-z0-9_=.-]{1,200}$", options: .regularExpression) != nil }

    var kind: PlatformKind {
        switch self {
        case .supabaseProjects: return .supabase
        case .vercelProjects: return .vercel
        case .renderServices, .renderDeploys, .renderPostgres, .renderKeyValue: return .render
        case .upstashDatabases: return .upstash
        }
    }

    var url: URL? {
        var parts = URLComponents()
        parts.scheme = "https"
        parts.host = kind.host
        var query: [URLQueryItem] = []
        let page = { (cursor: String?) -> Bool in
            query.append(URLQueryItem(name: "limit", value: "100"))
            guard let cursor else { return true }
            guard Self.validCursor(cursor) else { return false }
            query.append(URLQueryItem(name: "cursor", value: cursor))
            return true
        }
        switch self {
        case .supabaseProjects: parts.path = "/v1/projects"
        case .vercelProjects(let from):
            parts.path = "/v10/projects"
            query.append(URLQueryItem(name: "limit", value: "100"))
            if let from { guard Self.validCursor(from) else { return nil }; query.append(URLQueryItem(name: "from", value: from)) }
        case .renderServices(let cursor): parts.path = "/v1/services"; guard page(cursor) else { return nil }
        case .renderDeploys(let service):
            guard Self.validId(service) else { return nil }
            parts.path = "/v1/services/\(service)/deploys"
            query.append(URLQueryItem(name: "limit", value: "1"))
        case .renderPostgres(let cursor): parts.path = "/v1/postgres"; guard page(cursor) else { return nil }
        case .renderKeyValue(let cursor): parts.path = "/v1/key-value"; guard page(cursor) else { return nil }
        case .upstashDatabases: parts.path = "/v2/redis/databases"
        }
        parts.queryItems = query.isEmpty ? nil : query
        return parts.url
    }
}

struct PlatformSourceConfig: Equatable {
    static let intervalRange = 60...3600
    static let defaultInterval = 300
    let id: String
    let kind: PlatformKind
    let name: String
    let interval: Int
    let wide: Bool

    init?(_ value: [String: Any]) {
        guard let id = value["id"] as? String, PlatformRead.validId(id), id.count <= 40,
              let kind = PlatformKind(rawValue: value["kind"] as? String ?? "") else { return nil }
        let name = (value["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let interval = (value["interval"] as? NSNumber)?.intValue ?? Self.defaultInterval
        self.id = id
        self.kind = kind
        self.name = String(name.prefix(60))
        self.interval = Self.intervalRange.contains(interval) ? interval : Self.defaultInterval
        self.wide = value["wide"] as? Bool ?? false
    }

    var dictionary: [String: Any] { ["id": id, "kind": kind.rawValue, "name": name, "interval": interval, "wide": wide] }
}

struct PlatformCredential: Equatable {
    let secret: String
    let user: String

    init?(secret: String, user: String = "") {
        let secret = secret.trimmingCharacters(in: .whitespacesAndNewlines), user = user.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !secret.isEmpty, secret.count <= 500, user.count <= 200, !secret.contains(where: { $0.isWhitespace || $0.isNewline }) else { return nil }
        self.secret = secret
        self.user = user
    }

    init?(data: Data) {
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let secret = json["secret"] as? String else { return nil }
        self.init(secret: secret, user: json["user"] as? String ?? "")
    }

    var data: Data? { try? JSONSerialization.data(withJSONObject: ["secret": secret, "user": user], options: [.sortedKeys]) }

    func authorize(_ request: inout URLRequest, kind: PlatformKind) {
        if kind.needsUser {
            let pair = Data("\(user):\(secret)".utf8).base64EncodedString()
            request.setValue("Basic \(pair)", forHTTPHeaderField: "Authorization")
        } else {
            request.setValue("Bearer \(secret)", forHTTPHeaderField: "Authorization")
        }
    }
}

final class PlatformSources {
    static let key = "platformSources"
    static let limit = 12
    private let service = "studio.assetboard.local.platform"
    private let defaults: UserDefaults
    private let keychain: Bool

    /// `keychain: false` keeps credentials in memory only (the self-test).
    init(defaults: UserDefaults = .standard, keychain: Bool = true) { self.defaults = defaults; self.keychain = keychain }
    private var memory: [String: PlatformCredential] = [:]

    var all: [PlatformSourceConfig] { (defaults.array(forKey: Self.key) as? [[String: Any]] ?? []).compactMap(PlatformSourceConfig.init) }

    /// What the page may know: the source and whether a token is kept, never the token or the email it signs in with.
    func summary() -> [[String: Any]] {
        all.map { source in
            var item = source.dictionary
            item["hasToken"] = credential(source.id) != nil
            return item
        }
    }

    @discardableResult
    func save(_ source: PlatformSourceConfig) -> Bool {
        var list = all.filter { $0.id != source.id }
        guard list.count < Self.limit else { return false }
        list.append(source)
        defaults.set(list.map { $0.dictionary }, forKey: Self.key)
        return true
    }

    func remove(_ id: String) {
        defaults.set(all.filter { $0.id != id }.map { $0.dictionary }, forKey: Self.key)
        _ = setCredential(nil, for: id)
    }

    func credential(_ id: String) -> PlatformCredential? {
        guard keychain else { return memory[id] }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return PlatformCredential(data: data)
    }

    /// nil removes the kept token.
    func setCredential(_ credential: PlatformCredential?, for id: String) -> Bool {
        guard keychain else { memory[id] = credential; return true }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id]
        guard let credential, let data = credential.data else {
            let status = SecItemDelete(query as CFDictionary)
            return status == errSecSuccess || status == errSecItemNotFound
        }
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess { return true }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }
}

/// Reads one source: its platform's fixed requests one after another (a few pages at most), each answer cut down to the fields the
/// page shows. Blocking; never on the main thread.
struct PlatformFetcher {
    static let maxBytes = 8 * 1024 * 1024
    static let maxPages = 5
    /// Render has no deploy state in its service list: one more request per service, for this many services at most.
    static let maxRenderServices = 30
    let session: URLSession
    init(session: URLSession = NetworkLog.session(L("平台状态"))) { self.session = session }

    func request(_ read: PlatformRead, _ credential: PlatformCredential) -> URLRequest? {
        guard let url = read.url, url.host == read.kind.host, url.scheme == "https" else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.httpBody = nil
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        credential.authorize(&request, kind: read.kind)
        return request
    }

    func get(_ read: PlatformRead, _ credential: PlatformCredential) throws -> Any {
        guard let request = request(read, credential) else { throw Self.failure(L("请求无效")) }
        let finished = DispatchSemaphore(value: 0)
        var bytes: Data?
        var status = 0
        session.dataTask(with: request) { data, response, _ in
            bytes = data
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            finished.signal()
        }.resume()
        guard finished.wait(timeout: .now() + 25) == .success else { throw Self.failure(L("请求超时"), reason: "net") }
        switch status {
        case 200: break
        case 401, 403: throw Self.failure(L("令牌无效或权限不够"), status: status, reason: "auth")
        case 429: throw Self.failure(L("请求太频繁，稍后再读"), status: status, reason: "rate")
        case 0: throw Self.failure(L("连不上 {host}", ["host": read.kind.host]), reason: "net")
        default: throw Self.failure(L("平台回答 HTTP {status}", ["status": status]), status: status, reason: "other")
        }
        guard let bytes, bytes.count <= Self.maxBytes, let json = try? JSONSerialization.jsonObject(with: bytes) else {
            throw Self.failure(L("平台的回答读不懂"), reason: "other")
        }
        return json
    }

    func items(_ kind: PlatformKind, _ credential: PlatformCredential) throws -> [[String: String]] {
        switch kind {
        case .supabase:
            return Self.supabaseProjects(try get(.supabaseProjects, credential))
        case .vercel:
            var out: [[String: String]] = [], from: String? = nil
            for _ in 0..<Self.maxPages {
                let json = try get(.vercelProjects(from: from), credential)
                out += Self.vercelProjects(json)
                guard let next = Self.vercelNext(json), next != from else { break }
                from = next
            }
            return out
        case .render:
            var services: [[String: String]] = []
            for read in [PlatformRead.renderServices(cursor: nil), .renderPostgres(cursor: nil), .renderKeyValue(cursor: nil)] {
                var cursor: String? = nil
                for _ in 0..<Self.maxPages {
                    let page: PlatformRead
                    switch read {
                    case .renderServices: page = .renderServices(cursor: cursor)
                    case .renderPostgres: page = .renderPostgres(cursor: cursor)
                    default: page = .renderKeyValue(cursor: cursor)
                    }
                    let json = try get(page, credential)
                    services += Self.renderList(json)
                    guard let list = json as? [[String: Any]], list.count == 100, let last = list.last?["cursor"] as? String else { break }
                    cursor = last
                }
            }
            var out: [[String: String]] = []
            var asked = 0
            for var item in services {
                if item["kind"] == "service", item["state"] != "suspended", asked < Self.maxRenderServices, let id = item["id"] {
                    asked += 1
                    if let deploy = Self.renderDeploy(try get(.renderDeploys(service: id), credential)) { item["deploy"] = deploy }
                }
                out.append(item)
            }
            return out
        case .upstash:
            return Self.upstashDatabases(try get(.upstashDatabases, credential))
        }
    }

    // Cutting answers down: only these keys ever reach the page, all as short strings.
    static func clean(_ value: Any?, _ limit: Int = 100) -> String? {
        guard let text = value as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(limit))
    }
    static func item(_ fields: [String: String?]) -> [String: String]? {
        let kept = fields.compactMapValues { $0 }
        return kept["id"] != nil && kept["state"] != nil ? kept : nil
    }

    static func supabaseProjects(_ json: Any) -> [[String: String]] {
        (json as? [[String: Any]] ?? []).compactMap { p in
            item(["id": clean(p["ref"] ?? p["id"], 64), "name": clean(p["name"]), "kind": "project", "state": clean(p["status"], 40), "region": clean(p["region"], 40)])
        }
    }

    static func vercelProjects(_ json: Any) -> [[String: String]] {
        let list = (json as? [String: Any])?["projects"] as? [[String: Any]] ?? []
        return list.compactMap { p in
            let production = (p["targets"] as? [String: Any])?["production"] as? [String: Any]
            let latest = (p["latestDeployments"] as? [[String: Any]] ?? []).first { ($0["target"] as? String) == "production" }
            let ready = clean(production?["readyState"], 40) ?? clean(latest?["readyState"], 40)
            let state = (p["paused"] as? Bool) == true ? "PAUSED" : ready ?? "NONE"
            return item(["id": clean(p["id"], 64), "name": clean(p["name"]), "kind": "project", "state": state])
        }
    }

    static func vercelNext(_ json: Any) -> String? {
        let next = ((json as? [String: Any])?["pagination"] as? [String: Any])?["next"]
        if let text = next as? String, validCursor(text) { return text }
        if let number = next as? NSNumber { return number.stringValue }
        return nil
    }
    private static func validCursor(_ text: String) -> Bool { PlatformRead.validCursor(text) }

    /// /services, /postgres and /key-value answer [{cursor, service|postgres|keyValue: {...}}].
    static func renderList(_ json: Any) -> [[String: String]] {
        (json as? [[String: Any]] ?? []).compactMap { row in
            if let s = row["service"] as? [String: Any] {
                let suspended = (s["suspended"] as? String) == "suspended"
                let why = (s["suspenders"] as? [String] ?? []).first.flatMap { clean($0, 40) }
                return item(["id": clean(s["id"], 64), "name": clean(s["name"]), "kind": "service", "state": suspended ? "suspended" : "running",
                             "detail": suspended ? why : clean(s["type"], 40)])
            }
            if let d = row["postgres"] as? [String: Any] {
                return item(["id": clean(d["id"], 64), "name": clean(d["name"]), "kind": "postgres", "state": clean(d["status"], 40),
                             "plan": clean(d["plan"], 40), "expires": clean(d["expiresAt"], 40)])
            }
            if let k = row["keyValue"] as? [String: Any] {
                return item(["id": clean(k["id"], 64), "name": clean(k["name"]), "kind": "keyValue", "state": clean(k["status"], 40), "plan": clean(k["plan"], 40)])
            }
            return nil
        }
    }

    static func renderDeploy(_ json: Any) -> String? {
        let deploy = (json as? [[String: Any]])?.first?["deploy"] as? [String: Any]
        return clean(deploy?["status"], 40)
    }

    static func upstashDatabases(_ json: Any) -> [[String: String]] {
        (json as? [[String: Any]] ?? []).compactMap { d in
            item(["id": clean(d["database_id"], 64), "name": clean(d["database_name"]), "kind": "redis", "state": clean(d["state"], 40), "plan": clean(d["type"], 40)])
        }
    }

    static func failure(_ message: String, status: Int = 0, reason: String = "other") -> NSError {
        NSError(domain: "Assetboard.Platform", code: status, userInfo: [NSLocalizedDescriptionKey: message, "reason": reason])
    }
}

/// The bridge, kept here so Assetboard.swift only routes to it. platformList · platformSave {id?, kind, name, interval, wide, secret?,
/// user?} · platformRemove {id} · platformRead {id}. The demo never reads a platform: its page asks for nothing.
let platformSources = PlatformSources()
let platformFetcher = PlatformFetcher()
private let platformBusy = NSLock()
private var platformReading = Set<String>()

extension AppDelegate {
    func platformResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardPlatform?.(\(json))")
        }
    }

    func handlePlatform(_ action: String, _ body: [String: Any]) {
        switch action {
        case "platformList":
            platformResult(["sources": platformSources.summary()])
        case "platformSave":
            guard let kind = PlatformKind(rawValue: body["kind"] as? String ?? "") else { platformResult(["error": L("不认识的平台")]); return }
            let given = body["id"] as? String ?? ""
            let existing = platformSources.all.first { $0.id == given }
            let id = existing?.id ?? "p" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12).lowercased()
            let secret = body["secret"] as? String ?? ""
            var credential = platformSources.credential(id)
            if !secret.isEmpty {
                guard let fresh = PlatformCredential(secret: secret, user: body["user"] as? String ?? "") else { platformResult(["error": L("令牌格式不对")]); return }
                if kind.needsUser && fresh.user.isEmpty { platformResult(["error": L("要填登录邮箱")]); return }
                credential = fresh
            }
            guard let credential else { platformResult(["error": L("要填令牌")]); return }
            // A token that can do more than read is only kept once the person confirmed it in the page.
            let wide = !kind.readOnlyToken || kind.wide(credential.secret)
            if wide && body["wide"] as? Bool != true { platformResult(["error": L("这个令牌权限大，要先确认"), "needsConfirm": true]); return }
            guard let source = PlatformSourceConfig(["id": id, "kind": kind.rawValue, "name": body["name"] as? String ?? "", "interval": body["interval"] as? NSNumber ?? NSNumber(value: existing?.interval ?? PlatformSourceConfig.defaultInterval), "wide": wide]) else {
                platformResult(["error": L("设置无效")]); return
            }
            guard platformSources.setCredential(credential, for: id) else { platformResult(["error": L("无法把令牌存进 macOS 钥匙串")]); return }
            guard platformSources.save(source) else { platformResult(["error": L("最多 {n} 个平台", ["n": PlatformSources.limit])]); return }
            platformResult(["sources": platformSources.summary(), "saved": id])
            readPlatform(source)
        case "platformRemove":
            if let id = body["id"] as? String { platformSources.remove(id) }
            platformResult(["sources": platformSources.summary(), "removed": body["id"] as? String ?? ""])
        case "platformRead":
            guard let id = body["id"] as? String, let source = platformSources.all.first(where: { $0.id == id }) else { return }
            readPlatform(source)
        default: break
        }
    }

    /// One read at a time per source; the answer, or why not, goes back with the source's id.
    func readPlatform(_ source: PlatformSourceConfig) {
        guard let credential = platformSources.credential(source.id) else { platformResult(["source": source.id, "error": L("没有令牌"), "reason": "auth"]); return }
        platformBusy.lock()
        guard !platformReading.contains(source.id) else { platformBusy.unlock(); return }
        platformReading.insert(source.id)
        platformBusy.unlock()
        platformResult(["source": source.id, "loading": true])
        DispatchQueue.global(qos: .utility).async {
            defer { platformBusy.lock(); platformReading.remove(source.id); platformBusy.unlock() }
            do {
                let items = try platformFetcher.items(source.kind, credential)
                self.platformResult(["source": source.id, "items": items, "at": Date().timeIntervalSince1970 * 1000])
            } catch {
                let error = error as NSError
                self.platformResult(["source": source.id, "error": error.localizedDescription, "status": error.code, "reason": error.userInfo["reason"] as? String ?? "other"])
            }
        }
    }
}

final class MockPlatformProtocol: URLProtocol {
    static var reply: ((URLRequest) -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, body) = Self.reply(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

func testPlatformStatus() {
    // Requests: fixed hosts and paths, https only, ids and cursors checked.
    precondition(PlatformRead.supabaseProjects.url?.absoluteString == "https://api.supabase.com/v1/projects")
    precondition(PlatformRead.vercelProjects(from: nil).url?.absoluteString == "https://api.vercel.com/v10/projects?limit=100")
    precondition(PlatformRead.vercelProjects(from: "1730000000000").url?.absoluteString == "https://api.vercel.com/v10/projects?limit=100&from=1730000000000")
    precondition(PlatformRead.renderServices(cursor: nil).url?.absoluteString == "https://api.render.com/v1/services?limit=100")
    precondition(PlatformRead.renderDeploys(service: "srv-abc123").url?.absoluteString == "https://api.render.com/v1/services/srv-abc123/deploys?limit=1")
    precondition(PlatformRead.renderDeploys(service: "../owners").url == nil && PlatformRead.renderServices(cursor: "a&b=c").url == nil, "ids and cursors are checked")
    precondition(PlatformRead.upstashDatabases.url?.absoluteString == "https://api.upstash.com/v2/redis/databases")

    // Which tokens can do more than read.
    precondition(!PlatformKind.supabase.wide("sbp_fc0123") && PlatformKind.supabase.wide("sbp_0123") && PlatformKind.vercel.wide("x") && PlatformKind.render.wide("x") && !PlatformKind.upstash.wide("x"))

    // Sources: plain ids, known kinds, an interval in range; the page gets hasToken, never the token or the email.
    precondition(PlatformSourceConfig(["id": "../x", "kind": "vercel"]) == nil && PlatformSourceConfig(["id": "p1", "kind": "heroku"]) == nil)
    precondition(PlatformSourceConfig(["id": "p1", "kind": "vercel", "interval": 5])?.interval == PlatformSourceConfig.defaultInterval)
    precondition(PlatformSourceConfig(["id": "p1", "kind": "vercel", "interval": 120])?.interval == 120)
    let suite = "assetboard.test.platform.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let sources = PlatformSources(defaults: defaults, keychain: false)
    let upstash = PlatformSourceConfig(["id": "p2", "kind": "upstash", "name": "缓存"])!
    precondition(sources.save(upstash) && sources.setCredential(PlatformCredential(secret: "key-123", user: "me@example.com"), for: "p2"))
    precondition(sources.summary().allSatisfy { Set($0.keys) == Set(["id", "kind", "name", "interval", "wide", "hasToken"]) } && sources.summary()[0]["hasToken"] as? Bool == true, "the page never gets a token")
    precondition(PlatformCredential(secret: "has space") == nil && PlatformCredential(secret: "") == nil)

    // Answers cut down: no emails, hostnames, env values or REST tokens; states kept as the platform says them.
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockPlatformProtocol.self]
    let fetcher = PlatformFetcher(session: URLSession(configuration: configuration))
    var seen: [URLRequest] = []
    func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    MockPlatformProtocol.reply = { request in
        seen.append(request)
        precondition(request.httpMethod == "GET" && request.httpBody == nil, "reads only")
        switch request.url?.path ?? "" {
        case "/v1/projects":
            return (200, json([["ref": "abcdefghijklmnopqrst", "name": "notes-db", "status": "INACTIVE", "region": "us-east-1", "database": ["host": "db.abcdefghijklmnopqrst.supabase.co"]]]))
        case "/v10/projects":
            let page2 = request.url?.query?.contains("from=") == true
            let first: [[String: Any]] = [["id": "prj_1", "name": "notes-site", "env": [["key": "DB_URL", "value": "postgres://user:pw@host/db"]],
                "targets": ["production": ["readyState": "ERROR"]], "latestDeployments": [["readyState": "READY", "target": "production", "creator": ["email": "me@example.com"]]]]]
            let second: [[String: Any]] = [["id": "prj_2", "name": "blog", "paused": true]]
            let next: Any = page2 ? NSNull() : NSNumber(value: 1730000000000)
            return (200, json(["projects": page2 ? second : first, "pagination": ["next": next]]))
        case "/v1/services":
            return (200, json([["cursor": "c1", "service": ["id": "srv-1", "name": "api", "type": "web_service", "suspended": "not_suspended", "serviceDetails": ["sshAddress": "srv-1@ssh.example.com"]]],
                               ["cursor": "c2", "service": ["id": "srv-2", "name": "old-api", "type": "web_service", "suspended": "suspended", "suspenders": ["billing"]]]]))
        case "/v1/services/srv-1/deploys":
            return (200, json([["cursor": "d", "deploy": ["id": "dep-1", "status": "build_failed"]]]))
        case "/v1/postgres":
            return (200, json([["cursor": "p", "postgres": ["id": "dpg-1", "name": "main-db", "status": "available", "plan": "free", "expiresAt": "2026-12-01T00:00:00Z", "owner": ["email": "me@example.com"], "databaseUser": "app"]]]))
        case "/v1/key-value":
            return (200, json([] as [Any]))
        case "/v2/redis/databases":
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Basic " + Data("me@example.com:key-123".utf8).base64EncodedString(), "Upstash signs in with email and key")
            return (200, json([["database_id": "db-1", "database_name": "cache", "state": "active", "type": "free", "password": "secret-pw", "rest_token": "rt", "read_only_rest_token": "ro", "endpoint": "x.upstash.io", "user_email": "me@example.com"]]))
        default:
            return (404, Data())
        }
    }
    let bearer = PlatformCredential(secret: "tok-abc")!
    let supabase = try! fetcher.items(.supabase, bearer)
    precondition(supabase == [["id": "abcdefghijklmnopqrst", "name": "notes-db", "kind": "project", "state": "INACTIVE", "region": "us-east-1"]], "Supabase: \(supabase)")
    precondition(seen.last?.value(forHTTPHeaderField: "Authorization") == "Bearer tok-abc" && seen.last?.httpShouldHandleCookies == false)
    let vercel = try! fetcher.items(.vercel, bearer)
    precondition(vercel.map { $0["state"] ?? "" } == ["ERROR", "PAUSED"] && vercel.count == 2, "Vercel: production state, two pages: \(vercel)")
    let render = try! fetcher.items(.render, bearer)
    precondition(render.first { $0["id"] == "srv-1" }?["deploy"] == "build_failed" && render.first { $0["id"] == "srv-2" }?["state"] == "suspended" && render.first { $0["id"] == "srv-2" }?["detail"] == "billing", "Render: \(render)")
    precondition(!seen.contains { $0.url?.path == "/v1/services/srv-2/deploys" }, "a suspended service is not asked for its deploys")
    precondition(render.first { $0["id"] == "dpg-1" }?["expires"] == "2026-12-01T00:00:00Z")
    let redis = try! fetcher.items(.upstash, PlatformCredential(secret: "key-123", user: "me@example.com")!)
    precondition(redis == [["id": "db-1", "name": "cache", "kind": "redis", "state": "active", "plan": "free"]], "Upstash: \(redis)")
    let everything = String(data: json([supabase, vercel, render, redis]), encoding: .utf8)!
    for leak in ["supabase.co", "postgres://", "me@example.com", "ssh.example.com", "secret-pw", "\"rt\"", "\"ro\"", "upstash.io", "\"app\""] {
        precondition(!everything.contains(leak), "an answer leaks \(leak)")
    }
    precondition(seen.allSatisfy { ["api.supabase.com", "api.vercel.com", "api.render.com", "api.upstash.com"].contains($0.url?.host ?? "") && $0.url?.scheme == "https" }, "only the platforms' own API hosts")

    // A refused token says so with its status.
    MockPlatformProtocol.reply = { _ in (401, Data()) }
    do { _ = try fetcher.items(.supabase, bearer); preconditionFailure("401 is an error") } catch {
        let error = error as NSError
        precondition(error.code == 401 && error.userInfo["reason"] as? String == "auth")
    }
    print("PASS: platform status: fixed GETs on the platforms' API hosts (ids and cursors checked), wide tokens, sources without tokens for the page, answers cut down (no emails, hosts, env, passwords or REST tokens), pages, Render deploys, Basic for Upstash, 401")
}
#endif
