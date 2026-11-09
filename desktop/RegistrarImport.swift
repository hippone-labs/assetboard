import Foundation
import Security

/// 从注册商导入: the domains of a Namecheap or Porkbun account, read-only. Only the documented list endpoints are called, always with
/// GET; the credentials the person pasted are kept in the Keychain (one item per registrar) once a read with them worked, and never go
/// back to the page. Every request is in 网络记录 under the registrar's name with its path only, so Namecheap's credentials (which its
/// API takes in the query string) never reach the log. The page merges the answer (mergeRegistrar in asset-data.js).
enum RegistrarKind: String, CaseIterable {
    case namecheap, porkbun
    var name: String { self == .namecheap ? "Namecheap" : "Porkbun" }
    /// The credential fields, as the page names them (REGISTRARS in asset-data.js).
    var fields: [String] { self == .namecheap ? ["apiUser", "apiKey", "clientIp"] : ["apiKey", "secretKey"] }
}

struct RegistrarFailure: Error { let message: String }

final class RegistrarImport {
    static let shared = RegistrarImport()
    static let service = "studio.assetboard.local.registrar"
    /// Namecheap: 100 domains a page; Porkbun: 1000 a call. Past this the list is refused rather than half-read.
    static let namecheapPages = 50
    static let porkbunPages = 5
    private let stub: URLSession?
    /// The self-test passes one stubbed session for every registrar; the app uses NetworkLog's session named after each.
    init(session: URLSession? = nil) { stub = session }
    private func session(_ kind: RegistrarKind) -> URLSession { stub ?? NetworkLog.session(kind.name) }

    // MARK: Keychain

    private func query(_ kind: RegistrarKind) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: kind.rawValue]
    }

    func credentials(_ kind: RegistrarKind) -> [String: String]? {
        var search = query(kind)
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
              let values = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
              Self.problem(kind, values) == nil else { return nil }
        return values
    }

    func save(_ kind: RegistrarKind, _ values: [String: String]) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: values) else { return false }
        if SecItemUpdate(query(kind) as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess { return true }
        var item = query(kind)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func remove(_ kind: RegistrarKind) -> Bool {
        let status = SecItemDelete(query(kind) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Which registrars have credentials kept, for `__ASSETBOARD_NATIVE__.registrars`.
    func connections() -> [String: Bool] {
        Dictionary(uniqueKeysWithValues: RegistrarKind.allCases.map { ($0.rawValue, credentials($0) != nil) })
    }

    // MARK: Checks

    /// The same checks as registrarCredentialProblem in asset-data.js; nil when the values look right.
    static func problem(_ kind: RegistrarKind, _ values: [String: String]) -> String? {
        let known = Set(kind.fields)
        guard Set(values.keys) == known, values.values.allSatisfy({ value in !value.isEmpty && !value.contains(where: { character in character.isWhitespace }) }) else { return L("请把每一栏都填上") }
        func matches(_ key: String, _ pattern: String) -> Bool { (values[key] ?? "").range(of: pattern, options: .regularExpression) != nil }
        switch kind {
        case .namecheap:
            guard matches("apiUser", "^[A-Za-z0-9_.-]{1,20}$") else { return L("API 用户名是 Namecheap 的登录名，最多 20 个字母、数字或 _ . -") }
            guard matches("apiKey", "^[A-Za-z0-9]{16,50}$") else { return L("API Key 是 Namecheap API Access 页面上的一串字母和数字") }
            guard isPublicIPv4(values["clientIp"] ?? "") else { return L("要填这台 Mac 上网时的公网 IPv4（Namecheap 白名单里的那个），不是局域网地址") }
        case .porkbun:
            guard matches("apiKey", "^pk1_[A-Za-z0-9]{8,128}$") else { return L("API Key 以 pk1_ 开头") }
            guard matches("secretKey", "^sk1_[A-Za-z0-9]{8,128}$") else { return L("Secret Key 以 sk1_ 开头") }
        }
        return nil
    }

    /// A dotted IPv4 address outside the private, loopback, link-local, shared (CGNAT) and multicast ranges.
    static func isPublicIPv4(_ text: String) -> Bool {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        var octets: [Int] = []
        for part in parts {
            guard (1...3).contains(part.count), part.allSatisfy({ $0.isASCII && $0.isNumber }), part == "0" || !part.hasPrefix("0"),
                  let value = Int(part), value <= 255 else { return false }
            octets.append(value)
        }
        let a = octets[0], b = octets[1]
        if a == 0 || a == 10 || a == 127 || a >= 224 { return false }
        if (a == 169 && b == 254) || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168) || (a == 100 && (64...127).contains(b)) { return false }
        return true
    }

    // MARK: Requests

    private func get(_ kind: RegistrarKind, _ original: URLRequest) throws -> (Int, Data) {
        var request = original
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        // Every sync asks again: a stored answer would hide domains registered since.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        let finished = DispatchSemaphore(value: 0)
        var bytes: Data?
        var status = 0
        var failed = false
        session(kind).dataTask(with: request) { data, response, error in
            bytes = data
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            failed = error != nil
            finished.signal()
        }.resume()
        guard finished.wait(timeout: .now() + 25) == .success else { throw RegistrarFailure(message: L("{name} 请求超时", ["name": kind.name])) }
        if failed { throw RegistrarFailure(message: L("网络请求失败，请检查连接后重试。")) }
        guard let bytes, bytes.count <= 8_000_000 else { throw invalid(kind, status) }
        return (status, bytes)
    }

    private func invalid(_ kind: RegistrarKind, _ status: Int) -> RegistrarFailure {
        RegistrarFailure(message: L("{name} 的响应无效（HTTP {status}），同步未写入资产板。", ["name": kind.name, "status": status]))
    }

    /// namecheap.domains.getList, 100 a page.
    /// Method and its response: https://www.namecheap.com/support/api/methods/domains/get-list/
    /// Global parameters (ApiUser, ApiKey, UserName, ClientIp) and the IP whitelist: https://www.namecheap.com/support/api/global-parameters/
    /// and https://www.namecheap.com/support/api/intro/
    func namecheapDomains(_ values: [String: String]) throws -> (account: String, domains: [[String: String]]) {
        let user = values["apiUser"] ?? ""
        var all: [[String: String]] = []
        for page in 1...Self.namecheapPages {
            var components = URLComponents(string: "https://api.namecheap.com/xml.response")!
            components.queryItems = [("ApiUser", user), ("ApiKey", values["apiKey"] ?? ""), ("UserName", user), ("ClientIp", values["clientIp"] ?? ""),
                                     ("Command", "namecheap.domains.getList"), ("ListType", "ALL"), ("Page", String(page)), ("PageSize", "100")]
                .map { URLQueryItem(name: $0.0, value: $0.1) }
            let (status, data) = try get(.namecheap, URLRequest(url: components.url!))
            let reply = NamecheapReply.parse(data)
            if let error = reply.error { throw RegistrarFailure(message: Self.namecheapMessage(error.number, error.text)) }
            guard status == 200, reply.ok, reply.valid, let total = reply.totalItems, total >= 0 else { throw invalid(.namecheap, status) }
            all.append(contentsOf: reply.domains)
            if reply.domains.isEmpty || all.count >= total { return (user, all) }
        }
        throw RegistrarFailure(message: L("{name} 的域名超过 {n} 个，同步未写入资产板。", ["name": "Namecheap", "n": Self.namecheapPages * 100]))
    }

    /// Namecheap's error numbers (https://www.namecheap.com/support/api/global-parameters/) in words the person can act on.
    static func namecheapMessage(_ number: String, _ text: String) -> String {
        switch number {
        case "1011150", "1017150", "1017105", "1010105", "1011105":
            return L("Namecheap 不接受这台 Mac 的 IP：在 Namecheap 的 API Access 里把这台 Mac 上网用的公网 IPv4 加进白名单，并在这里填同一个地址。")
        case "1010101", "1010102", "1011102", "1017101", "1050900", "1016103", "1019103", "1017103":
            return L("Namecheap 不认这组 API 用户名和 API Key，或者 API 访问没有打开。")
        default:
            return L("Namecheap：{error}", ["error": text.isEmpty ? number : String(text.prefix(200))])
        }
    }

    /// GET /ping (which account the keys belong to) and GET /domain/listAll, 1000 a call with `start`; the keys go in the X-API-Key and
    /// X-Secret-API-Key headers. Both are read-scope endpoints: https://porkbun.com/api/json/v3/documentation (OpenAPI spec:
    /// https://porkbun.com/api/json/v3/spec, paths /ping and /domain/listAll).
    func porkbunDomains(_ values: [String: String]) throws -> (account: String, domains: [[String: String]]) {
        func call(_ path: String, _ query: [URLQueryItem]) throws -> [String: Any] {
            var components = URLComponents(string: "https://api.porkbun.com/api/json/v3" + path)!
            components.queryItems = query.isEmpty ? nil : query
            var request = URLRequest(url: components.url!)
            request.setValue(values["apiKey"], forHTTPHeaderField: "X-API-Key")
            request.setValue(values["secretKey"], forHTTPHeaderField: "X-Secret-API-Key")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (status, data) = try get(.porkbun, request)
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if status == 200, let json, json["status"] as? String == "SUCCESS" { return json }
            if status == 429 { throw RegistrarFailure(message: L("Porkbun 说请求太频繁，稍后再试。")) }
            if let message = json?["message"] as? String, json?["status"] as? String == "ERROR" {
                throw RegistrarFailure(message: L("Porkbun 拒绝了请求：{error}", ["error": String(message.prefix(200))]))
            }
            throw invalid(.porkbun, status)
        }
        let ping = try call("/ping", [])
        let account = String((ping["account"] as? String ?? "").prefix(100))
        var all: [[String: String]] = []
        for chunk in 0..<Self.porkbunPages {
            let json = try call("/domain/listAll", [URLQueryItem(name: "start", value: String(chunk * 1000))])
            guard let domains = json["domains"] as? [[String: Any]] else { throw invalid(.porkbun, 200) }
            for item in domains {
                guard let name = item["domain"] as? String, !name.isEmpty else { throw RegistrarFailure(message: L("域名数据不完整，同步未写入资产板。")) }
                all.append(["id": name, "name": name, "expires": Self.text(item["expireDate"]), "autoRenew": Self.text(item["autoRenew"]),
                            "status": Self.text(item["status"]).lowercased()])
            }
            if domains.count < 1000 { return (account, all) }
        }
        throw RegistrarFailure(message: L("{name} 的域名超过 {n} 个，同步未写入资产板。", ["name": "Porkbun", "n": Self.porkbunPages * 1000]))
    }

    static func text(_ value: Any?) -> String {
        if let number = value as? NSNumber { return number.stringValue }
        return String((value as? String ?? "").prefix(100))
    }

    /// The answer for the page: {ok, source, account, domains, complete} or {ok: false, source, error}.
    func list(_ kind: RegistrarKind, _ values: [String: String]) -> [String: Any] {
        do {
            let listed = try (kind == .namecheap ? namecheapDomains(values) : porkbunDomains(values))
            return ["ok": true, "source": kind.rawValue, "account": listed.account, "domains": listed.domains, "complete": true]
        } catch let failure as RegistrarFailure {
            return ["ok": false, "source": kind.rawValue, "error": failure.message]
        } catch {
            return ["ok": false, "source": kind.rawValue, "error": error.localizedDescription]
        }
    }
}

/// What namecheap.domains.getList answers: <ApiResponse Status="OK|ERROR"> with <Errors><Error Number="…">text</Error></Errors>,
/// one <Domain ID Name Expires AutoRenew IsExpired …/> per domain and <Paging><TotalItems>.
final class NamecheapReply: NSObject, XMLParserDelegate {
    private(set) var ok = false
    private(set) var valid = true
    private(set) var error: (number: String, text: String)?
    private(set) var domains: [[String: String]] = []
    private(set) var totalItems: Int?
    private var text = ""
    private var errorNumber = ""

    static func parse(_ data: Data) -> NamecheapReply {
        let reply = NamecheapReply()
        let parser = XMLParser(data: data)
        parser.shouldResolveExternalEntities = false
        parser.delegate = reply
        if !parser.parse() { reply.valid = false }
        return reply
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        text = ""
        switch elementName {
        case "ApiResponse": ok = attributeDict["Status"]?.uppercased() == "OK"
        case "Error": errorNumber = attributeDict["Number"] ?? ""
        case "Domain":
            guard let id = attributeDict["ID"], !id.isEmpty, let name = attributeDict["Name"], !name.isEmpty else { valid = false; return }
            domains.append(["id": id, "name": name, "expires": attributeDict["Expires"] ?? "", "autoRenew": attributeDict["AutoRenew"] ?? "",
                            "status": attributeDict["IsExpired"]?.lowercased() == "true" ? "expired" : "active"])
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if elementName == "Error", error == nil { error = (errorNumber, String(value.prefix(200))) }
        if elementName == "TotalItems" { totalItems = Int(value) }
        text = ""
    }
}

extension AppDelegate {
    /// `registrarSync {source, credentials|null}` (null: the kept credentials) and `registrarDisconnect {source}`; the answer goes to
    /// `window.assetboardRegistrarResult`.
    func handleRegistrar(_ action: String, _ body: [String: Any]) {
        guard let kind = RegistrarKind(rawValue: body["source"] as? String ?? "") else { return }
        let registrars = RegistrarImport.shared
        if action == "registrarDisconnect" {
            registrarResult(registrars.remove(kind) ? ["ok": true, "source": kind.rawValue, "disconnected": true]
                                                    : ["ok": false, "source": kind.rawValue, "error": L("无法从 macOS 钥匙串删除凭据，请重试。")])
            return
        }
        let supplied: [String: String]? = (body["credentials"] as? [String: Any]).map { raw in
            Dictionary(uniqueKeysWithValues: kind.fields.map { key in (key, (raw[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) })
        }
        if let supplied, let problem = RegistrarImport.problem(kind, supplied) {
            registrarResult(["ok": false, "source": kind.rawValue, "error": problem])
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let values = supplied ?? registrars.credentials(kind) else {
                self.registrarResult(["ok": false, "source": kind.rawValue, "error": L("请填写 {name} 的 API 凭据。", ["name": kind.name])])
                return
            }
            var result = registrars.list(kind, values)
            if result["ok"] as? Bool == true, let supplied, !registrars.save(kind, supplied) {
                result = ["ok": false, "source": kind.rawValue, "error": L("无法将凭据保存到 macOS 钥匙串，同步未写入资产板。")]
            }
            if result["ok"] as? Bool == true { result["connected"] = true }
            self.registrarResult(result)
        }
    }

    func registrarResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardRegistrarResult?.(\(json))")
        }
    }

    @objc func openRegistrars() { if demoMode { demoBlocked(); return }; webView.evaluateJavaScript("registrarDialog()") }
}

/// GET only, the documented paths and parameters, pagination, credentials where each API wants them, the errors in words, a reply that
/// is not what the API sends refused whole, and the credential checks; HTTP is stubbed, nothing reaches a registrar or the Keychain.
func testRegistrars() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockIconProtocol.self]
    let registrars = RegistrarImport(session: URLSession(configuration: configuration))
    let namecheap = ["apiUser": "apiexample", "apiKey": "0123456789abcdef0123456789abcdef", "clientIp": "203.0.113.10"]
    let porkbun = ["apiKey": "pk1_" + String(repeating: "a", count: 32), "secretKey": "sk1_" + String(repeating: "b", count: 32)]
    var asked: [URLRequest] = []
    func xml(_ body: String) -> Data { Data("<?xml version=\"1.0\" encoding=\"UTF-8\"?><ApiResponse xmlns=\"http://api.namecheap.com/xml.response\" \(body)</ApiResponse>".utf8) }
    func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    func query(_ request: URLRequest) -> [String: String] {
        Dictionary(uniqueKeysWithValues: (URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    }
    func domain(_ id: Int) -> String {
        "<Domain ID=\"\(id)\" Name=\"site\(id).example\" User=\"apiexample\" Created=\"02/15/2016\" Expires=\"02/15/2027\" IsExpired=\"\(id == 2 ? "true" : "false")\" IsLocked=\"false\" AutoRenew=\"\(id % 2 == 0 ? "true" : "false")\" WhoisGuard=\"ENABLED\" IsPremium=\"false\" IsOurDNS=\"true\"/>"
    }

    // Namecheap: two pages of the documented getList, the credentials and the whitelisted IP as the global parameters.
    MockIconProtocol.reply = { request in
        asked.append(request)
        let q = query(request)
        precondition(request.httpMethod == "GET" && request.url?.host == "api.namecheap.com" && request.url?.path == "/xml.response", "Only the documented endpoint, with GET")
        precondition(q["Command"] == "namecheap.domains.getList" && q["ApiUser"] == "apiexample" && q["UserName"] == "apiexample" && q["ClientIp"] == "203.0.113.10" && q["ApiKey"] == namecheap["apiKey"] && q["PageSize"] == "100")
        let page = Int(q["Page"] ?? "") ?? 0
        let ids = page == 1 ? Array(1...100) : [101]
        return (200, xml("Status=\"OK\"><Errors/><RequestedCommand>namecheap.domains.getList</RequestedCommand><CommandResponse Type=\"namecheap.domains.getList\"><DomainGetListResult>\(ids.map(domain).joined())</DomainGetListResult><Paging><TotalItems>101</TotalItems><CurrentPage>\(page)</CurrentPage><PageSize>100</PageSize></Paging></CommandResponse>"))
    }
    let listed = registrars.list(.namecheap, namecheap)
    let domains = listed["domains"] as? [[String: String]] ?? []
    precondition(listed["ok"] as? Bool == true && listed["account"] as? String == "apiexample" && domains.count == 101 && asked.count == 2, "Namecheap pages: \(listed)")
    precondition(domains[1] == ["id": "2", "name": "site2.example", "expires": "02/15/2027", "autoRenew": "true", "status": "expired"], "Namecheap domain fields: \(domains[1])")
    precondition(domains[0]["autoRenew"] == "false" && domains[0]["status"] == "active")

    // Its errors in words: the IP whitelist, wrong credentials, anything else with its text; a reply that is not its XML is refused.
    for (number, phrase) in [("1011150", "白名单"), ("1017101", "API 用户名"), ("2011166", "Unknown")] {
        MockIconProtocol.reply = { _ in (200, xml("Status=\"ERROR\"><Errors><Error Number=\"\(number)\">Unknown error \(number)</Error></Errors>")) }
        let failed = registrars.list(.namecheap, namecheap)
        precondition(failed["ok"] as? Bool == false && (failed["error"] as? String ?? "").contains(phrase), "Namecheap error \(number): \(failed)")
    }
    MockIconProtocol.reply = { _ in (200, Data("<html>not the API</html>".utf8)) }
    precondition(registrars.list(.namecheap, namecheap)["ok"] as? Bool == false, "Not the API's XML")
    MockIconProtocol.reply = { _ in (200, xml("Status=\"OK\"><Errors/><CommandResponse><DomainGetListResult><Domain Name=\"no-id.example\"/></DomainGetListResult><Paging><TotalItems>1</TotalItems></Paging></CommandResponse>")) }
    precondition(registrars.list(.namecheap, namecheap)["ok"] as? Bool == false, "A domain without its id")
    MockIconProtocol.reply = { _ in (500, Data()) }
    precondition(registrars.list(.namecheap, namecheap)["ok"] as? Bool == false, "A server error")

    // Porkbun: /ping for the account, then /domain/listAll from start 0, the keys in the documented headers, never in the address.
    asked = []
    MockIconProtocol.reply = { request in
        asked.append(request)
        precondition(request.httpMethod == "GET" && request.url?.host == "api.porkbun.com", "Only GET to the Porkbun API")
        precondition(request.value(forHTTPHeaderField: "X-API-Key") == porkbun["apiKey"] && request.value(forHTTPHeaderField: "X-Secret-API-Key") == porkbun["secretKey"])
        precondition(!(request.url?.absoluteString ?? "").contains("pk1_") && !(request.url?.absoluteString ?? "").contains("sk1_"), "Keys never in the address")
        switch request.url!.path {
        case "/api/json/v3/ping": return (200, json(["status": "SUCCESS", "yourIp": "203.0.113.10", "credentialsValid": true, "account": "porkbun-user"]))
        case "/api/json/v3/domain/listAll":
            precondition(query(request)["start"] == "0")
            return (200, json(["status": "SUCCESS", "count": 2, "domains": [
                ["domain": "example.com", "status": "ACTIVE", "tld": "com", "createDate": "2021-01-15 10:00:00", "expireDate": "2027-01-15 10:00:00", "securityLock": 1, "whoisPrivacy": 1, "autoRenew": 1, "notLocal": 0],
                ["domain": "example.net", "status": "ACTIVE", "tld": "net", "expireDate": "2028-03-01 00:00:00", "autoRenew": "0"]]]))
        default: preconditionFailure("unexpected request \(request.url!.path)")
        }
    }
    let pork = registrars.list(.porkbun, porkbun)
    let porkDomains = pork["domains"] as? [[String: String]] ?? []
    precondition(pork["ok"] as? Bool == true && pork["account"] as? String == "porkbun-user" && asked.count == 2, "Porkbun: \(pork)")
    precondition(porkDomains == [["id": "example.com", "name": "example.com", "expires": "2027-01-15 10:00:00", "autoRenew": "1", "status": "active"],
                                 ["id": "example.net", "name": "example.net", "expires": "2028-03-01 00:00:00", "autoRenew": "0", "status": "active"]], "Porkbun domain fields: \(porkDomains)")
    MockIconProtocol.reply = { _ in (400, json(["status": "ERROR", "message": "Invalid API key.", "code": "INVALID_API_KEYS_001"])) }
    let denied = registrars.list(.porkbun, porkbun)
    precondition(denied["ok"] as? Bool == false && (denied["error"] as? String ?? "").contains("Invalid API key."), "Porkbun refusal: \(denied)")
    MockIconProtocol.reply = { _ in (429, json(["status": "ERROR", "message": "Rate limit"])) }
    precondition((registrars.list(.porkbun, porkbun)["error"] as? String ?? "").contains("频繁"), "Porkbun rate limit")
    MockIconProtocol.reply = { request in request.url!.path.hasSuffix("/ping") ? (200, json(["status": "SUCCESS", "account": "porkbun-user"])) : (200, json(["status": "SUCCESS", "domains": [["status": "ACTIVE"]]])) }
    precondition(registrars.list(.porkbun, porkbun)["ok"] as? Bool == false, "A domain without its name")

    // The credential checks, the same as the page's.
    precondition(RegistrarImport.problem(.namecheap, namecheap) == nil && RegistrarImport.problem(.porkbun, porkbun) == nil)
    precondition(RegistrarImport.problem(.namecheap, namecheap.merging(["clientIp": "192.168.1.109"]) { $1 }) != nil, "A local address is not the whitelisted one")
    precondition(RegistrarImport.problem(.namecheap, namecheap.merging(["apiKey": "short"]) { $1 }) != nil)
    precondition(RegistrarImport.problem(.namecheap, namecheap.merging(["apiUser": "a b"]) { $1 }) != nil)
    precondition(RegistrarImport.problem(.porkbun, ["apiKey": porkbun["secretKey"]!, "secretKey": porkbun["apiKey"]!]) != nil, "Swapped keys")
    precondition(RegistrarImport.problem(.porkbun, porkbun.merging(["extra": "x"]) { $1 }) != nil, "Only the known fields")
    precondition(RegistrarImport.isPublicIPv4("198.51.100.7") && !RegistrarImport.isPublicIPv4("10.0.0.1") && !RegistrarImport.isPublicIPv4("172.16.0.1")
                 && !RegistrarImport.isPublicIPv4("100.64.0.1") && !RegistrarImport.isPublicIPv4("01.2.3.4") && !RegistrarImport.isPublicIPv4("1.2.3")
                 && !RegistrarImport.isPublicIPv4("256.1.1.1") && !RegistrarImport.isPublicIPv4("2001:db8::1"))
    guard JSONSerialization.isValidJSONObject(listed), JSONSerialization.isValidJSONObject(pork) else { fatalError("The answers are not JSON") }
    print("PASS: Namecheap getList and Porkbun ping/listAll, GET only, documented paths, pagination, credentials where each API takes them, errors in words, malformed replies refused, credential checks")
}
