import Foundation
import Security

#if !ASSETBOARD_FREE
/// Probe data sources (Pro): monitoring panels whose servers are shown on the matching server cards. Read-only by construction:
/// the fetcher only ever sends a GET without a body, and never calls a panel's login or admin endpoints.
///
/// A source is `{id, kind, name, url}`, kept in UserDefaults (a viewer setting, never in the board data, an export or a handover);
/// its credential, when it has one, is a Keychain item of its own. Each kind says which read-only path to GET and how to send the
/// credential; the page turns the answer into servers (pro/web/probe-data.js), so adding Nezha or Komari is one entry on each side.
enum ProbeKind: String, CaseIterable {
    /// CF-Server-Monitor (github.com/huilang-me/CF-Server-Monitor). A public site answers anonymously. A private one is read with the
    /// panel's own account: one `POST /admin/api {"action":"login"}` gives a JWT (7 days), kept in memory only and sent as
    /// `Authorization: Bearer` on the reads and the WebSocket upgrade. No other admin action is ever sent.
    case cfsm

    /// Every path the probe code can ever reach: the login (the only POST, action "login" only), three GETs and one WebSocket
    /// subscription. `/api/server` (one server) is allowed but not used: `/api/servers` already carries every field the cards show.
    static let allowedPaths: Set<String> = ["/admin/api", "/api/servers", "/api/server", "/api/history/all", "/api/ws"]
    /// History window, from the panel's fixed list of hours.
    static let historyHours = "24"

    enum Read { case servers, history(String), live, login }

    func path(_ read: Read) -> String {
        switch read {
        case .servers: return "/api/servers"
        case .history: return "/api/history/all"
        case .live: return "/api/ws"
        case .login: return "/admin/api"
        }
    }

    /// The one method each read uses: POST for the login, GET for everything else.
    func method(_ read: Read) -> String {
        if case .login = read { return "POST" }
        return "GET"
    }

    /// The address of one read, or nil for anything outside the allow-list. Credentials never go in it.
    func url(_ read: Read, base: URL) -> URL? {
        let path = path(read)
        guard Self.allowedPaths.contains(path), var parts = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        parts.path += path
        switch read {
        case .servers, .login: parts.queryItems = nil
        case .history(let id):
            guard Self.validServerId(id) else { return nil }
            parts.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "hours", value: Self.historyHours)]
        case .live:
            parts.scheme = parts.scheme == "http" ? "ws" : "wss"
            parts.queryItems = [URLQueryItem(name: "subscribe", value: "all")]
        }
        return parts.url
    }

    func authorize(_ request: inout URLRequest, token: String?) {
        guard let token, !token.isEmpty else { return }
        switch self {
        case .cfsm: request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    /// The panel's ids for servers: what its WebSocket accepts in a subscription (1–64 of letters, digits and . _ : -).
    static func validServerId(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9._:-]{1,64}$", options: .regularExpression) != nil }

    /// A refusal for the person, and its reason for the page: credentials (wrong or missing account), turnstile (the panel asks for
    /// a human check Assetboard cannot pass), private (an account is needed), net (anything else).
    static func refusal(status: Int, body: Data?, login: Bool) -> (message: String, reason: String) {
        let said = ((body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any])?["error"] as? String) ?? ""
        switch status {
        case 401 where login: return (L("用户名或密码不对"), "credentials")
        case 400 where login: return (L("用户名或密码没填"), "credentials")
        case 403 where login || said.lowercased().contains("turnstile") || said == "verificationFailed":
            return (L("面板开了人机验证：为 Assetboard 关掉，或把面板设为公开"), "turnstile")
        case 401: return (L("面板不公开：请填写面板账号"), "private")
        case 403: return (L("面板拒绝读取"), "net")
        case 404: return (L("没找到探针接口，请检查面板地址"), "net")
        case 0: return (L("连不上面板"), "net")
        default: return (L("面板返回 HTTP {status}", ["status": status]), "net")
        }
    }
}

struct ProbeSourceConfig {
    let id: String
    let kind: ProbeKind
    let name: String
    let url: URL

    var dictionary: [String: String] { ["id": id, "kind": kind.rawValue, "name": name, "url": url.absoluteString] }

    /// The panel's address: http(s), a host, no user or password in it, no query or fragment; trailing slashes are dropped.
    static func panelURL(_ text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= 300, var parts = URLComponents(string: trimmed),
              let scheme = parts.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil else { return nil }
        parts.scheme = scheme
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        return parts.url
    }

    init?(_ value: [String: Any]) {
        guard let id = value["id"] as? String, id.range(of: "^[A-Za-z0-9-]{1,64}$", options: .regularExpression) != nil,
              let kind = (value["kind"] as? String).flatMap(ProbeKind.init(rawValue:)),
              let url = (value["url"] as? String).flatMap(Self.panelURL) else { return nil }
        let name = (value["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        self.id = id
        self.kind = kind
        self.name = String((name.isEmpty ? url.host ?? kind.rawValue : name).prefix(60))
        self.url = url
    }
}

final class ProbeSources {
    static let key = "probeSources"
    static let limit = 8
    private let service = "studio.assetboard.local.probe"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var all: [ProbeSourceConfig] {
        (defaults.array(forKey: Self.key) as? [[String: Any]] ?? []).compactMap(ProbeSourceConfig.init)
    }

    /// What the page may know: whether an account is kept and its user name, never the password.
    func summary() -> [[String: Any]] {
        all.map { source in
            var item: [String: Any] = source.dictionary
            let login = self.login(source.id)
            item["hasLogin"] = login != nil
            item["username"] = login?.username ?? ""
            return item
        }
    }

    func save(_ source: ProbeSourceConfig) {
        var list = all.filter { $0.id != source.id }
        list.append(source)
        defaults.set(list.prefix(Self.limit).map { $0.dictionary }, forKey: Self.key)
    }

    func remove(_ id: String) {
        defaults.set(all.filter { $0.id != id }.map { $0.dictionary }, forKey: Self.key)
        _ = setLogin(nil, for: id)
    }

    /// The panel account, one Keychain item per source ({"username","password"} as JSON). Anything else kept there (a token from an
    /// earlier version) reads as no account and is replaced on the next save.
    func login(_ id: String) -> ProbeLogin? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return ProbeLogin(data: data)
    }

    /// nil removes the kept account.
    func setLogin(_ login: ProbeLogin?, for id: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id]
        guard let login, let data = login.data else {
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

struct ProbeLogin: Equatable {
    let username: String
    let password: String

    init?(username: String, password: String) {
        guard !username.isEmpty, !password.isEmpty, username.count <= 200, password.count <= 1000 else { return nil }
        self.username = username
        self.password = password
    }

    init?(data: Data) {
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let username = json["username"] as? String, let password = json["password"] as? String else { return nil }
        self.init(username: username, password: password)
    }

    var data: Data? { try? JSONSerialization.data(withJSONObject: ["username": username, "password": password], options: [.sortedKeys]) }
}

struct ProbeFetcher {
    let session: URLSession
    static let maxBytes = 8 * 1024 * 1024
    init(session: URLSession = NetworkLog.session(L("探针"))) { self.session = session }

    /// The one way a read is made: a GET of an allowed path, no body, no cookies, no cache, the JWT (if any) as a header.
    func request(_ source: ProbeSourceConfig, _ read: ProbeKind.Read, token: String?) -> URLRequest? {
        guard source.kind.method(read) == "GET", let url = source.kind.url(read, base: source.url) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.httpBody = nil
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        source.kind.authorize(&request, token: token)
        return request
    }

    /// The login: the only non-GET request, a POST to /admin/api whose body is exactly {action: "login", username, password}. Cookies
    /// are not stored (the panel's Set-Cookie is dropped); the JWT it answers is the caller's to keep in memory.
    func loginRequest(_ source: ProbeSourceConfig, _ login: ProbeLogin) -> URLRequest? {
        guard source.kind.method(.login) == "POST", let url = source.kind.url(.login, base: source.url),
              let body = try? JSONSerialization.data(withJSONObject: ["action": "login", "username": login.username, "password": login.password], options: [.sortedKeys]) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        return request
    }

    /// One read: the server list (a JSON object) or a server's history (a JSON array). A refusal carries the HTTP status as its code
    /// and a reason (see ProbeKind.refusal). Never on the main thread.
    func fetch(_ source: ProbeSourceConfig, _ read: ProbeKind.Read = .servers, token: String?, completion: @escaping (Result<Any, NSError>) -> Void) {
        guard let request = request(source, read, token: token) else { completion(.failure(Self.failure(L("面板地址无效")))); return }
        if case .live = read { completion(.failure(Self.failure(L("实时推送不走这里")))); return }
        session.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else {
                let refusal = ProbeKind.refusal(status: error != nil && status == 0 ? 0 : status, body: data, login: false)
                completion(.failure(Self.failure(refusal.message, status: status, reason: refusal.reason))); return
            }
            guard let data, data.count <= Self.maxBytes, let json = try? JSONSerialization.jsonObject(with: data) else {
                completion(.failure(Self.failure(L("面板的回答不是探针数据")))); return
            }
            switch read {
            case .servers: guard json is [String: Any] else { completion(.failure(Self.failure(L("面板的回答不是探针数据")))); return }
            case .history: guard json is [Any] else { completion(.failure(Self.failure(L("面板的回答不是历史数据")))); return }
            case .live, .login: break
            }
            completion(.success(json))
        }.resume()
    }

    /// Logs in; the JWT and when it expires (from its payload, else 7 days).
    func login(_ source: ProbeSourceConfig, _ login: ProbeLogin, completion: @escaping (Result<(token: String, expires: Date), NSError>) -> Void) {
        guard let request = loginRequest(source, login) else { completion(.failure(Self.failure(L("面板地址无效")))); return }
        session.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200, let data, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  json["success"] as? Bool == true, let token = json["token"] as? String, !token.isEmpty, token.count <= 4096 else {
                let refusal = ProbeKind.refusal(status: status == 200 ? 502 : status, body: data, login: true)
                completion(.failure(Self.failure(refusal.message, status: status, reason: refusal.reason))); return
            }
            completion(.success((token, Self.jwtExpiry(token) ?? Date().addingTimeInterval(7 * 86400))))
        }.resume()
    }

    static func jwtExpiry(_ token: String) -> Date? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var text = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while text.count % 4 != 0 { text += "=" }
        guard let data = Data(base64Encoded: text), let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let exp = json["exp"] as? NSNumber else { return nil }
        return Date(timeIntervalSince1970: exp.doubleValue)
    }

    /// A server's history, cut to what the cards draw: time, CPU and memory, the last 240 rows.
    static func historyRows(_ json: Any) -> [[String: Any]] {
        let rows = (json as? [[String: Any]] ?? []).suffix(240)
        return rows.compactMap { row -> [String: Any]? in
            guard let t = row["timestamp"] as? NSNumber else { return nil }
            var kept: [String: Any] = ["timestamp": t]
            for key in ["cpu", "ram_used", "ram_total"] { if let n = row[key] as? NSNumber { kept[key] = n } }
            return kept
        }
    }

    static func failure(_ message: String, status: Int = 0, reason: String = "net") -> NSError {
        NSError(domain: "Assetboard.Probe", code: status, userInfo: [NSLocalizedDescriptionKey: message, "reason": reason])
    }
}

/// A private panel's session: its JWT in memory (never on disk, never in a URL), one login at a time, a new login shortly before
/// the JWT expires or after a read is refused. Logins are rate-limited: after each one the next may come no sooner than `backoff`
/// (30 s, doubling on failures and on refusals right after a login, up to 30 minutes; a good session sets it back to 30 s).
/// A wrong account or a human check (Turnstile) stops automatic logins until the account is edited or the person asks again.
final class ProbeAuth {
    static let firstBackoff: TimeInterval = 30
    static let maxBackoff: TimeInterval = 30 * 60
    static let renewBefore: TimeInterval = 10 * 60
    private let lock = NSLock()
    private var token: String?
    private var expires = Date.distantPast
    private var inFlight = false
    private var waiters: [(Result<String?, NSError>) -> Void] = []
    private var stopped: NSError?
    private var nextLogin = Date.distantPast
    private(set) var backoff = ProbeAuth.firstBackoff
    private(set) var logins = 0
    let now: () -> Date

    init(now: @escaping () -> Date = Date.init) { self.now = now }

    /// After the account is edited or the person asks again (刷新): forget the session and any stop.
    func reset() {
        lock.lock(); defer { lock.unlock() }
        token = nil; expires = .distantPast; stopped = nil; nextLogin = .distantPast; backoff = Self.firstBackoff
    }

    /// The JWT to send, logging in when needed; nil for a panel without an account.
    func token(_ source: ProbeSourceConfig, login: ProbeLogin?, fetcher: ProbeFetcher, completion: @escaping (Result<String?, NSError>) -> Void) {
        guard let login else { completion(.success(nil)); return }
        lock.lock()
        if let token, expires.timeIntervalSince(now()) > Self.renewBefore { lock.unlock(); completion(.success(token)); return }
        if let stopped { lock.unlock(); completion(.failure(stopped)); return }
        if inFlight { waiters.append(completion); lock.unlock(); return }
        if now() < nextLogin {
            let wait = Int(nextLogin.timeIntervalSince(now()).rounded(.up))
            lock.unlock()
            completion(.failure(ProbeFetcher.failure(L("稍后再登录面板（{n} 秒后）", ["n": wait]), status: 429, reason: "net"))); return
        }
        inFlight = true
        logins += 1
        nextLogin = now().addingTimeInterval(backoff)
        lock.unlock()
        fetcher.login(source, login) { result in
            self.lock.lock()
            let outcome: Result<String?, NSError>
            switch result {
            case .success(let session):
                self.token = session.token; self.expires = session.expires
                outcome = .success(session.token)
            case .failure(let error):
                self.token = nil
                if ["credentials", "turnstile"].contains(error.userInfo["reason"] as? String) { self.stopped = error }
                else { self.backoff = min(Self.maxBackoff, self.backoff * 2) }
                outcome = .failure(error)
            }
            self.inFlight = false
            let waiting = self.waiters + [completion]
            self.waiters = []
            self.lock.unlock()
            for waiter in waiting { waiter(outcome) }
        }
    }

    /// A read was refused with this JWT: drop it, so the next read logs in again (within the rate limit).
    func refused(_ rejected: String) {
        lock.lock(); defer { lock.unlock() }
        if token == rejected { token = nil; expires = .distantPast }
    }

    /// A read was refused right after a fresh login: the next login waits twice as long.
    func penalize() {
        lock.lock(); defer { lock.unlock() }
        backoff = min(Self.maxBackoff, backoff * 2)
        nextLogin = max(nextLogin, now().addingTimeInterval(backoff))
    }

    /// A read went through: the session is good, so the rate limit goes back to its start.
    func succeeded() {
        lock.lock(); defer { lock.unlock() }
        backoff = Self.firstBackoff
    }
}

/// Reads with the session: a refused read (401) logs in again once and retries once.
final class ProbeClient {
    private var sessions: [String: ProbeAuth] = [:]
    private let lock = NSLock()
    let fetcher: ProbeFetcher
    let now: () -> Date

    init(fetcher: ProbeFetcher = ProbeFetcher(), now: @escaping () -> Date = Date.init) { self.fetcher = fetcher; self.now = now }

    func auth(_ id: String) -> ProbeAuth {
        lock.lock(); defer { lock.unlock() }
        if let auth = sessions[id] { return auth }
        let auth = ProbeAuth(now: now)
        sessions[id] = auth
        return auth
    }

    func forget(_ id: String) { lock.lock(); sessions[id] = nil; lock.unlock() }

    func read(_ source: ProbeSourceConfig, _ read: ProbeKind.Read, login: ProbeLogin?, retried: Bool = false, completion: @escaping (Result<Any, NSError>) -> Void) {
        let auth = self.auth(source.id)
        auth.token(source, login: login, fetcher: fetcher) { tokenResult in
            switch tokenResult {
            case .failure(let error): completion(.failure(error))
            case .success(let token):
                self.fetcher.fetch(source, read, token: token) { result in
                    if case .failure(let error) = result, error.code == 401, let token {
                        auth.refused(token)
                        if !retried { self.read(source, read, login: login, retried: true, completion: completion); return }
                        auth.penalize()
                    } else if case .success = result, token != nil {
                        auth.succeeded()
                    }
                    completion(result)
                }
            }
        }
    }

    /// The JWT for the WebSocket upgrade (nil for a public panel).
    func liveToken(_ source: ProbeSourceConfig, login: ProbeLogin?, completion: @escaping (Result<String?, NSError>) -> Void) {
        auth(source.id).token(source, login: login, fetcher: fetcher, completion: completion)
    }
}

/// Live readings over the panel's WebSocket (`/api/ws?subscribe=all`). The page's WebView cannot put a header on a WebSocket and
/// the JWT must never go in a URL, so the socket is opened here with `Authorization: Bearer` on the upgrade. The only message ever
/// sent is the one subscription the panel needs ({"type":"subscribe","scope":"all","ids":[…]}); what comes back is checked and
/// handed to the page. When to connect, retry (backoff with jitter) or fall back to polling is the page's call (probe-pro.js).
final class ProbeLive: NSObject, URLSessionWebSocketDelegate {
    private var tasks: [String: URLSessionWebSocketTask] = [:]
    private lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)
    /// Called on the main queue: {source, live: "open"} · {source, live: "closed", status} · {source, updates: […]}.
    var emit: ([String: Any]) -> Void = { _ in }

    static func liveRequest(_ source: ProbeSourceConfig, token: String?) -> URLRequest? {
        guard let url = source.kind.url(.live, base: source.url) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.httpShouldHandleCookies = false
        source.kind.authorize(&request, token: token)
        return request
    }

    /// The subscription, with the valid ids only (at most 500); nil when there is nothing to subscribe to.
    static func subscribeMessage(ids: [String]) -> String? {
        let kept = Array(ids.filter(ProbeKind.validServerId).prefix(500))
        guard !kept.isEmpty, let data = try? JSONSerialization.data(withJSONObject: ["type": "subscribe", "scope": "all", "ids": kept], options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// What the page gets from one message: open on hello/subscribed, the updates of a batchUpdate (servers with valid ids, at most
    /// 500, each with at most 30 samples of {ts, data}); anything else is dropped.
    static func message(_ text: String) -> [String: Any]? {
        guard text.utf8.count <= 4 * 1024 * 1024, let data = text.data(using: .utf8),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let type = json["type"] as? String else { return nil }
        if type == "hello" || type == "subscribed" { return ["live": "open"] }
        guard type == "batchUpdate", let updates = json["updates"] as? [[String: Any]] else { return nil }
        let kept: [[String: Any]] = updates.prefix(500).compactMap { update -> [String: Any]? in
            guard let id = update["serverId"] as? String, ProbeKind.validServerId(id), let samples = update["samples"] as? [[String: Any]] else { return nil }
            let clean: [[String: Any]] = samples.suffix(30).compactMap { sample -> [String: Any]? in
                guard let values = sample["data"] as? [String: Any] else { return nil }
                return ["ts": sample["ts"] as? NSNumber ?? 0, "data": values]
            }
            return clean.isEmpty ? nil : ["serverId": id, "samples": clean]
        }
        return kept.isEmpty ? nil : ["updates": kept]
    }

    func start(_ source: ProbeSourceConfig, token: String?, ids: [String]) {
        stop(source.id)
        guard let request = Self.liveRequest(source, token: token), let subscribe = Self.subscribeMessage(ids: ids) else {
            emit(["source": source.id, "live": "closed", "status": 400]); return
        }
        let task = session.webSocketTask(with: request)
        task.taskDescription = source.id
        tasks[source.id] = task
        task.resume()
        task.send(.string(subscribe)) { _ in }
        receive(task, source.id)
    }

    func stop(_ id: String) {
        guard let task = tasks.removeValue(forKey: id) else { return }
        task.cancel(with: .goingAway, reason: nil)
    }

    func stopAll() { for id in Array(tasks.keys) { stop(id) } }

    private func receive(_ task: URLSessionWebSocketTask, _ id: String) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self, self.tasks[id] === task else { return }
                switch result {
                case .success(let message):
                    if case .string(let text) = message, var payload = Self.message(text) {
                        payload["source"] = id
                        self.emit(payload)
                    }
                    self.receive(task, id)
                case .failure:
                    self.tasks.removeValue(forKey: id)
                    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
                    NetworkLog.shared.record(direction: "out", service: L("探针"), method: "WS", host: task.originalRequest?.url?.host ?? "", path: "/api/ws",
                                             status: status == 0 ? nil : status, ok: false, note: L("实时推送断开"))
                    self.emit(["source": id, "live": "closed", "status": status])
                }
            }
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        guard let id = webSocketTask.taskDescription, tasks[id] === webSocketTask else { return }
        NetworkLog.shared.record(direction: "out", service: L("探针"), method: "WS", host: webSocketTask.originalRequest?.url?.host ?? "", path: "/api/ws",
                                 status: 101, ok: true, note: L("实时推送（只订阅）"))
        emit(["source": id, "live": "open"])
    }
}

final class MockProbeProtocol: URLProtocol {
    static var reply: ((URLRequest) -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, body) = Self.reply(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Set-Cookie": "cfsm_auth=should-not-stay; Path=/"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

func testProbeSources() {
    // Addresses: http(s) only, no user/password, query or fragment.
    precondition(ProbeSourceConfig.panelURL("https://status.example.com/")?.absoluteString == "https://status.example.com")
    precondition(ProbeSourceConfig.panelURL("HTTPS://status.example.com/panel//")?.absoluteString == "https://status.example.com/panel")
    for bad in ["ftp://status.example.com", "https://user:pw@status.example.com", "https://status.example.com/?a=1", "status.example.com", "javascript:alert(1)", "https://"] {
        precondition(ProbeSourceConfig.panelURL(bad) == nil, "refused: \(bad)")
    }
    precondition(ProbeSourceConfig(["id": "../x", "kind": "cfsm", "url": "https://status.example.com"]) == nil, "ids are plain")
    precondition(ProbeSourceConfig(["id": "a1", "kind": "unknown", "url": "https://status.example.com"]) == nil, "kinds are known")

    // Sources live in their own defaults; the page gets the user name at most, never a password. Accounts round-trip as JSON; an
    // old token reads as no account.
    let suite = "assetboard.test.probe.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let sources = ProbeSources(defaults: defaults)
    let source = ProbeSourceConfig(["id": "src-1", "kind": "cfsm", "name": "我的探针", "url": "https://status.example.com/"])!
    sources.save(source)
    precondition(sources.all.count == 1 && sources.all[0].url.absoluteString == "https://status.example.com")
    precondition(sources.summary().allSatisfy { Set($0.keys) == Set(["id", "kind", "name", "url", "hasLogin", "username"]) }, "the page never gets a password")
    let account = ProbeLogin(username: "admin", password: "pw-test")!
    precondition(ProbeLogin(data: account.data!) == account && ProbeLogin(data: Data("old-jwt-token".utf8)) == nil && ProbeLogin(username: "", password: "x") == nil)

    // The allow-list: five paths, one POST (the login), every other read a GET; no credential in any address.
    precondition(ProbeKind.allowedPaths == ["/admin/api", "/api/servers", "/api/server", "/api/history/all", "/api/ws"])
    let reads: [ProbeKind.Read] = [.servers, .history("a1"), .live, .login]
    for read in reads {
        let url = ProbeKind.cfsm.url(read, base: source.url)!
        precondition(ProbeKind.allowedPaths.contains(url.path), "allowed: \(url)")
        precondition(ProbeKind.cfsm.method(read) == (url.path == "/admin/api" ? "POST" : "GET"))
    }
    precondition(ProbeKind.cfsm.url(.history("a1"), base: source.url)?.absoluteString == "https://status.example.com/api/history/all?id=a1&hours=24")
    precondition(ProbeKind.cfsm.url(.history("bad id/../admin"), base: source.url) == nil, "server ids are checked")
    precondition(ProbeKind.cfsm.url(.live, base: source.url)?.absoluteString == "wss://status.example.com/api/ws?subscribe=all")
    let plain = ProbeSourceConfig(["id": "src-2", "kind": "cfsm", "url": "http://192.0.2.5:8080"])!
    precondition(ProbeKind.cfsm.url(.live, base: plain.url)?.absoluteString == "ws://192.0.2.5:8080/api/ws?subscribe=all")
    let live = ProbeLive.liveRequest(source, token: "jwt-live")!
    precondition(live.value(forHTTPHeaderField: "Authorization") == "Bearer jwt-live" && !(live.url?.absoluteString.contains("jwt-live") ?? true), "the JWT rides in the header, never the URL")
    precondition(ProbeFetcher().request(source, .login, token: nil) == nil, "the GET builder refuses the login")
    let loginRequest = ProbeFetcher().loginRequest(source, account)!
    precondition(loginRequest.httpMethod == "POST" && loginRequest.url?.absoluteString == "https://status.example.com/admin/api" && !loginRequest.httpShouldHandleCookies)
    precondition(String(data: loginRequest.httpBody!, encoding: .utf8) == #"{"action":"login","password":"pw-test","username":"admin"}"#, "the login body is exactly the login")

    // The socket: the one message sent is the subscription; what comes back is checked.
    precondition(ProbeLive.subscribeMessage(ids: ["a1", "bad id!", "b-2"]) == #"{"ids":["a1","b-2"],"scope":"all","type":"subscribe"}"#)
    precondition(ProbeLive.subscribeMessage(ids: ["no way"]) == nil, "nothing to subscribe to, no socket")
    precondition(ProbeLive.message(#"{"type":"hello","ts":1,"subscribed":"all"}"#)?["live"] as? String == "open")
    let update = ProbeLive.message(#"{"type":"batchUpdate","ts":2,"updates":[{"serverId":"a1","samples":[{"ts":5,"data":{"cpu":12.5}}]},{"serverId":"x y","samples":[{"ts":5,"data":{}}]}]}"#)
    precondition((update?["updates"] as? [[String: Any]])?.count == 1, "updates for unknown-looking ids are dropped")
    precondition(ProbeLive.message("not json") == nil && ProbeLive.message(#"{"type":"pong"}"#) == nil && ProbeLive.message(#"{"type":"batchUpdate","updates":[]}"#) == nil)

    // A panel answering through a mock: the requests it sees, a clock the test moves.
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockProbeProtocol.self]
    let fetcher = ProbeFetcher(session: URLSession(configuration: configuration))
    var clock = Date(timeIntervalSince1970: 1_800_000_000)
    var seen: [(method: String, path: String, auth: String?, body: [String: Any])] = []
    func jwt(_ n: Int) -> String {
        let payload = Data(#"{"exp":\#(Int(clock.timeIntervalSince1970) + 604800),"n":\#(n)}"#.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
        return "eyJhbGciOiJIUzI1NiJ9.\(payload).sig"
    }
    var panel: (String, String, String?) -> (Int, String) = { _, _, _ in (500, "{}") }
    MockProbeProtocol.reply = { request in
        let body = mockRequestBody(request)
        seen.append((request.httpMethod ?? "", request.url?.path ?? "", request.value(forHTTPHeaderField: "Authorization"), body))
        let (status, text) = panel(request.httpMethod ?? "", request.url?.path ?? "", request.value(forHTTPHeaderField: "Authorization"))
        return (status, Data(text.utf8))
    }
    let client = ProbeClient(fetcher: fetcher, now: { clock })
    func read(_ read: ProbeKind.Read = .servers, anonymous: Bool = false) -> Result<Any, NSError> {
        let done = DispatchSemaphore(value: 0)
        var outcome: Result<Any, NSError>!
        client.read(source, read, login: anonymous ? nil : account) { outcome = $0; done.signal() }
        precondition(done.wait(timeout: .now() + 10) == .success)
        return outcome
    }
    let list = #"{"servers":[{"id":"a","name":"tokyo-vps","cpu":12.5,"last_updated":1}],"stats":{"total":1}}"#
    var issued = 0, valid: String? = nil
    panel = { method, path, auth in
        if method == "POST" && path == "/admin/api" { issued += 1; valid = jwt(issued); return (200, #"{"success":true,"token":"\#(valid!)","message":"loginSuccessful"}"#) }
        guard auth == "Bearer \(valid ?? "-")" else { return (401, #"{"error":"Unauthorized","code":401}"#) }
        return path == "/api/history/all" ? (200, #"[{"timestamp":1000,"cpu":12.5,"ram_used":1024,"ram_total":4096,"gpu_info":"[]"}]"#) : (200, list)
    }
    // Public: no account, no login, no header.
    if case .failure = read(.servers, anonymous: true) { } else { preconditionFailure("a private panel refuses an anonymous read") }
    precondition(seen.last?.auth == nil && !seen.contains { $0.method == "POST" })
    // Private: one login, then reads with the JWT; the session is reused.
    if case .failure(let error) = read() { preconditionFailure("logged-in read: \(error)") }
    if case .failure(let error) = read(.history("a")) { preconditionFailure("logged-in history: \(error)") }
    precondition(issued == 1, "one login for two reads")
    precondition(seen.filter { $0.method == "POST" }.allSatisfy { $0.path == "/admin/api" && Set($0.body.keys) == ["action", "username", "password"] && $0.body["action"] as? String == "login" })
    precondition(HTTPCookieStorage.shared.cookies(for: URL(string: "https://status.example.com")!)?.isEmpty ?? true, "the panel's cookie is not kept")
    // The JWT is refused (rotated secret): one new login, one retry, and the read goes through.
    valid = "something-else"
    clock = clock.addingTimeInterval(60)
    if case .failure(let error) = read() { preconditionFailure("401 → login → retry: \(error)") }
    precondition(issued == 2)
    // Near its expiry the JWT is renewed before reading.
    clock = clock.addingTimeInterval(604800 - 300)
    _ = read()
    precondition(issued == 3, "renewed before expiry")
    // A refusal right after a login doubles the wait; logins never come closer than the backoff.
    panel = { method, _, _ in method == "POST" ? (200, #"{"success":true,"token":"\#(jwt(99))"}"#) : (401, "{}") }
    clock = clock.addingTimeInterval(3600)
    let before = seen.filter { $0.method == "POST" }.count
    if case .success = read() { preconditionFailure("still refused") }
    precondition(seen.filter { $0.method == "POST" }.count == before + 1 && client.auth(source.id).backoff == 60, "one login, then the wait doubles")
    if case .failure(let error) = read() { precondition(error.code == 429, "rate-limited: \(error)") } else { preconditionFailure("rate limit") }
    precondition(seen.filter { $0.method == "POST" }.count == before + 1, "no login inside the backoff")
    // A wrong account stops automatic logins until it is edited or asked again.
    client.auth(source.id).reset()
    panel = { method, _, _ in method == "POST" ? (401, #"{"error":"invalidCredentials","code":401}"#) : (401, "{}") }
    if case .failure(let error) = read() { precondition(error.localizedDescription.contains("用户名或密码") && error.userInfo["reason"] as? String == "credentials") } else { preconditionFailure("wrong account") }
    clock = clock.addingTimeInterval(7200)
    let stoppedAt = seen.filter { $0.method == "POST" }.count
    _ = read(); _ = read()
    precondition(seen.filter { $0.method == "POST" }.count == stoppedAt, "a wrong account is not tried again by itself")
    // Turnstile on login (or globally): said plainly, and not retried.
    client.auth(source.id).reset()
    panel = { method, _, _ in method == "POST" ? (403, #"{"error":"verificationFailed","code":403}"#) : (403, #"{"error":"Turnstile verification failed","code":403}"#) }
    if case .failure(let error) = read() { precondition(error.userInfo["reason"] as? String == "turnstile" && error.localizedDescription.contains("人机验证")) } else { preconditionFailure("turnstile") }
    if case .failure(let error) = read(.servers, anonymous: true) { precondition(error.userInfo["reason"] as? String == "turnstile", "a public panel behind Turnstile says so") } else { preconditionFailure("turnstile read") }
    // Every request the probe made: the login POST or a GET of an allowed path, nothing else.
    precondition(seen.allSatisfy { ($0.method == "POST" && $0.path == "/admin/api" && $0.body["action"] as? String == "login") || ($0.method == "GET" && ProbeKind.allowedPaths.contains($0.path) && $0.path != "/admin/api") })
    print("PASS: probe sources: addresses, accounts in the Keychain only, allow-list (login POST + four reads), session login/reuse/renewal, 401 → login → retry, rate limit, wrong account and Turnstile stop, history rows, live subscription and messages")
}
#endif
