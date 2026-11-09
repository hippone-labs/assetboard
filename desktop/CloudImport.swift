import Foundation
import Security

/// 从云平台导入: the servers, deployments, databases and domains of a Hetzner Cloud project, a DigitalOcean account or a Vercel account
/// or team, read-only. Only the documented list endpoints are called, always with GET; the token the person pasted is kept in the
/// Keychain (one item per platform) once a read with it worked, and never goes back to the page. Every request is in 网络记录 under the
/// platform's name with its path only. The page merges the answer (mergeCloudImport in asset-data.js).
enum CloudKind: String, CaseIterable {
    case hetzner, digitalocean, vercel
    var name: String { ["hetzner": "Hetzner", "digitalocean": "DigitalOcean", "vercel": "Vercel"][rawValue]! }
    /// The credential fields, as the page names them (CLOUD_IMPORTS in asset-data.js); the token is the one that must be there.
    var fields: [String] {
        switch self {
        case .hetzner: return ["token", "project"]
        case .digitalocean: return ["token"]
        case .vercel: return ["token", "team"]
        }
    }
}

struct CloudFailure: Error { let message: String }

final class CloudImport {
    static let shared = CloudImport()
    static let service = "studio.assetboard.local.cloud"
    /// Hetzner: 50 a page; DigitalOcean: 200; Vercel: 100. Past this many pages a list is refused rather than half-read.
    static let maxPages = 40
    static let limit = 2000
    private let stub: URLSession?
    /// The self-test passes one stubbed session for every platform; the app uses NetworkLog's session named after each.
    init(session: URLSession? = nil) { stub = session }
    private func session(_ kind: CloudKind) -> URLSession { stub ?? NetworkLog.session(kind.name) }

    // MARK: Keychain

    private func query(_ kind: CloudKind) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: kind.rawValue]
    }

    func credentials(_ kind: CloudKind) -> [String: String]? {
        var search = query(kind)
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
              let values = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
              Self.problem(kind, values) == nil else { return nil }
        return values
    }

    func save(_ kind: CloudKind, _ values: [String: String]) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: values) else { return false }
        if SecItemUpdate(query(kind) as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess { return true }
        var item = query(kind)
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func remove(_ kind: CloudKind) -> Bool {
        let status = SecItemDelete(query(kind) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Which platforms have a token kept, for `__ASSETBOARD_NATIVE__.cloudImports`.
    func connections() -> [String: Bool] {
        Dictionary(uniqueKeysWithValues: CloudKind.allCases.map { ($0.rawValue, credentials($0) != nil) })
    }

    // MARK: Checks

    /// The same checks as cloudCredentialProblem in asset-data.js; nil when the values look right. Optional fields may be empty.
    static func problem(_ kind: CloudKind, _ values: [String: String]) -> String? {
        guard Set(values.keys) == Set(kind.fields), let token = values["token"], !token.isEmpty else { return L("请填写 API 令牌") }
        func matches(_ text: String, _ pattern: String) -> Bool { text.range(of: pattern, options: .regularExpression) != nil }
        switch kind {
        case .hetzner:
            guard matches(token, "^[A-Za-z0-9]{64}$") else { return L("Hetzner 的 API 令牌是 64 个字母和数字") }
            let project = values["project"] ?? ""
            guard project.count <= 60, !project.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return L("项目名最多 60 字") }
        case .digitalocean:
            guard matches(token, "^do[opr]_v1_[a-f0-9]{64}$") else { return L("DigitalOcean 的令牌以 dop_v1_ 开头") }
        case .vercel:
            guard matches(token, "^[A-Za-z0-9_-]{20,128}$") else { return L("Vercel 的令牌是一串字母和数字") }
            let team = values["team"] ?? ""
            guard team.isEmpty || matches(team, "^(team_[A-Za-z0-9]{1,60}|[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?)$") else { return L("团队要填 team_ 开头的 ID 或团队 slug") }
        }
        return nil
    }

    // MARK: Requests

    /// One GET with the token as a Bearer header: the status and the JSON object, or a failure in words.
    private func get(_ kind: CloudKind, _ url: URL, _ token: String) throws -> (Int, [String: Any]) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        // Every sync asks again: a stored answer would hide servers made since.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
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
        guard finished.wait(timeout: .now() + 25) == .success else { throw CloudFailure(message: L("{name} 请求超时", ["name": kind.name])) }
        if failed { throw CloudFailure(message: L("网络请求失败，请检查连接后重试。")) }
        let json = bytes.flatMap { $0.count <= 8_000_000 ? (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] : nil }
        if status == 401 { throw CloudFailure(message: L("{name} 不认这个令牌：它可能已过期、被删除，或者复制得不完整。", ["name": kind.name])) }
        if status == 429 { throw CloudFailure(message: L("{name} 说请求太频繁，稍后再试。", ["name": kind.name])) }
        guard let json else { throw invalid(kind, status) }
        return (status, json)
    }

    private func invalid(_ kind: CloudKind, _ status: Int) -> CloudFailure {
        CloudFailure(message: L("{name} 的响应无效（HTTP {status}），同步未写入资产板。", ["name": kind.name, "status": status]))
    }

    /// The platform's own message, when it sends one: Hetzner and Vercel {error: {message}}, DigitalOcean {message}.
    static func message(_ json: [String: Any]) -> String? {
        let text = ((json["error"] as? [String: Any])?["message"] as? String) ?? (json["message"] as? String)
        return text.map { String($0.prefix(200)) }
    }

    private func refused(_ kind: CloudKind, _ status: Int, _ json: [String: Any]) -> CloudFailure {
        if let text = Self.message(json) { return CloudFailure(message: L("{name} 拒绝了请求：{error}", ["name": kind.name, "error": text])) }
        return invalid(kind, status)
    }

    static func text(_ value: Any?, _ limit: Int = 100) -> String {
        if let number = value as? NSNumber { return number.stringValue }
        return String((value as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
    }

    static func url(_ base: String, _ query: [(String, String)]) -> URL {
        var components = URLComponents(string: base)!
        components.queryItems = query.isEmpty ? nil : query.map { URLQueryItem(name: $0.0, value: $0.1) }
        return components.url!
    }

    /// GET /v1/pricing for the project owner's currency, then GET /v1/servers, 50 a page (the most it gives) until
    /// meta.pagination.next_page is null. A Hetzner token belongs to one project and the API does not name it, so the account is the
    /// project name the person typed (or empty). The price is the server type's monthly gross price for the server's location.
    /// API reference and OpenAPI spec: https://docs.hetzner.cloud/ (https://docs.hetzner.cloud/cloud.spec.json), paths /pricing and
    /// /servers; `server.location` replaced `server.datacenter` (https://docs.hetzner.cloud/changelog).
    func hetzner(_ values: [String: String]) throws -> [String: Any] {
        let token = values["token"] ?? ""
        var resources: [[String: Any]] = []
        let (priced, pricing) = try get(.hetzner, URL(string: "https://api.hetzner.cloud/v1/pricing")!, token)
        guard priced == 200 else { throw refused(.hetzner, priced, pricing) }
        let currency = Self.text((pricing["pricing"] as? [String: Any])?["currency"], 3)
        var page = 1
        for _ in 0..<Self.maxPages {
            let (status, json) = try get(.hetzner, Self.url("https://api.hetzner.cloud/v1/servers", [("page", String(page)), ("per_page", "50")]), token)
            guard status == 200 else { throw refused(.hetzner, status, json) }
            guard let servers = json["servers"] as? [[String: Any]] else { throw invalid(.hetzner, status) }
            for server in servers {
                guard let id = server["id"] as? NSNumber, let name = server["name"] as? String, !name.isEmpty else { throw CloudFailure(message: L("服务器数据不完整，同步未写入资产板。")) }
                let net = server["public_net"] as? [String: Any]
                let ipv4 = (net?["ipv4"] as? [String: Any])?["ip"] as? String
                let location = (server["location"] as? [String: Any]) ?? ((server["datacenter"] as? [String: Any])?["location"] as? [String: Any])
                let type = server["server_type"] as? [String: Any]
                let here = location?["name"] as? String
                let price = (type?["prices"] as? [[String: Any]] ?? []).first { $0["location"] as? String == here }
                var item: [String: Any] = ["kind": "server", "id": id.stringValue, "name": String(name.prefix(100)), "status": Self.text(server["status"], 30),
                                           "ips": [ipv4].compactMap { $0 }, "region": Self.text(location?["country"], 2),
                                           "detail": [Self.text(type?["name"], 30).uppercased(), Self.text(location?["city"], 30)].filter { !$0.isEmpty }.joined(separator: " · ")]
                if let gross = ((price?["price_monthly"] as? [String: Any])?["gross"] as? String).flatMap({ Double($0) }) { item["price"] = ["currency": currency, "value": gross] }
                resources.append(item)
            }
            let next = ((json["meta"] as? [String: Any])?["pagination"] as? [String: Any])?["next_page"] as? NSNumber
            guard let next, next.intValue > page else {
                return ["account": values["project"] ?? "", "queriedKinds": ["server"], "resources": resources, "warnings": [String]()]
            }
            page = next.intValue
        }
        throw CloudFailure(message: L("{name} 的资源超过 {n} 个，同步未写入资产板。", ["name": "Hetzner", "n": Self.maxPages * 50]))
    }

    /// DigitalOcean region slugs (nyc3, ams3, …) by the country the datacenter is in.
    static let doCountries = ["nyc": "US", "sfo": "US", "atl": "US", "ric": "US", "ams": "NL", "sgp": "SG", "lon": "GB", "fra": "DE", "tor": "CA", "blr": "IN", "syd": "AU", "mkc": "US", "mem": "US"]
    static func doCountry(_ slug: String) -> String { doCountries[String(slug.prefix(3))] ?? "" }

    /// GET /v2/droplets and /v2/apps (200 a page, links.pages.next), /v2/databases (one list, not paged) and /v2/account for the
    /// account's name. A custom scoped token may leave a kind out (403): that kind is skipped and named in the warnings, the others are
    /// read. Only names, states, addresses, regions and sizes are taken: a database's connection and users (passwords) never are.
    /// https://docs.digitalocean.com/reference/api/digitalocean/ (OpenAPI: github.com/digitalocean/openapi), scopes:
    /// https://docs.digitalocean.com/reference/api/scopes/
    func digitalocean(_ values: [String: String]) throws -> [String: Any] {
        let token = values["token"] ?? ""
        var resources: [[String: Any]] = [], queried: [String] = [], warnings: [String] = []
        /// Every page of one list; nil when the token may not read it.
        func list(_ path: String, _ key: String, paged: Bool = true) throws -> [[String: Any]]? {
            var out: [[String: Any]] = []
            var next: URL? = Self.url("https://api.digitalocean.com" + path, paged ? [("page", "1"), ("per_page", "200")] : [])
            for _ in 0..<Self.maxPages {
                guard let url = next else { return out }
                let (status, json) = try get(.digitalocean, url, token)
                if status == 403 { return nil }
                guard status == 200 else { throw refused(.digitalocean, status, json) }
                // An empty list may leave its key out.
                guard let items = json[key] == nil ? [] : json[key] as? [[String: Any]] else { throw invalid(.digitalocean, status) }
                out += items
                guard out.count <= Self.limit else { break }
                // Only the API's own next page, on the same host and path.
                let link = (((json["links"] as? [String: Any])?["pages"] as? [String: Any])?["next"] as? String).flatMap(URL.init(string:))
                next = paged ? link.flatMap { $0.scheme == "https" && $0.host == "api.digitalocean.com" && $0.path == path ? $0 : nil } : nil
                if next == nil { return out }
            }
            throw CloudFailure(message: L("{name} 的资源超过 {n} 个，同步未写入资产板。", ["name": "DigitalOcean", "n": Self.limit]))
        }
        if let droplets = try list("/v2/droplets", "droplets") {
            queried.append("droplet")
            for droplet in droplets {
                guard let id = droplet["id"] as? NSNumber, let name = droplet["name"] as? String, !name.isEmpty else { throw CloudFailure(message: L("服务器数据不完整，同步未写入资产板。")) }
                let networks = droplet["networks"] as? [String: Any]
                let ips = ((networks?["v4"] as? [[String: Any]] ?? []) + (networks?["v6"] as? [[String: Any]] ?? []))
                    .filter { $0["type"] as? String == "public" }.compactMap { $0["ip_address"] as? String }
                let region = Self.text((droplet["region"] as? [String: Any])?["slug"], 10)
                var item: [String: Any] = ["kind": "droplet", "id": id.stringValue, "name": String(name.prefix(100)), "status": Self.text(droplet["status"], 30),
                                           "ips": Array(ips.prefix(4)), "region": Self.doCountry(region), "url": "https://cloud.digitalocean.com/droplets/\(id.stringValue)",
                                           "detail": [Self.text(droplet["size_slug"], 40), region].filter { !$0.isEmpty }.joined(separator: " · ")]
                if let monthly = ((droplet["size"] as? [String: Any])?["price_monthly"] as? NSNumber)?.doubleValue { item["price"] = ["currency": "USD", "value": monthly] }
                resources.append(item)
            }
        } else { warnings.append(L("令牌没有 droplet:read 权限，Droplet 没有读取")) }
        if let apps = try list("/v2/apps", "apps") {
            queried.append("app")
            for app in apps {
                guard let id = app["id"] as? String, let name = ((app["spec"] as? [String: Any])?["name"] as? String), !name.isEmpty else { throw CloudFailure(message: L("部署数据不完整，同步未写入资产板。")) }
                let region = Self.text((app["region"] as? [String: Any])?["slug"], 10)
                let phase = Self.text((app["active_deployment"] as? [String: Any])?["phase"], 30)
                resources.append(["kind": "app", "id": id, "name": String(name.prefix(100)), "status": phase.isEmpty ? "unknown" : phase, "region": Self.doCountry(region),
                                  "url": "https://cloud.digitalocean.com/apps/\(id)", "detail": region])
            }
        } else { warnings.append(L("令牌没有 app:read 权限，App 没有读取")) }
        if let databases = try list("/v2/databases", "databases", paged: false) {
            queried.append("database")
            for database in databases {
                guard let id = database["id"] as? String, let name = database["name"] as? String, !name.isEmpty else { throw CloudFailure(message: L("数据库数据不完整，同步未写入资产板。")) }
                let region = Self.text(database["region"], 10)
                resources.append(["kind": "database", "id": id, "name": String(name.prefix(100)), "status": Self.text(database["status"], 30), "region": Self.doCountry(region),
                                  "url": "https://cloud.digitalocean.com/databases/\(id)",
                                  "detail": [[Self.text(database["engine"], 20), Self.text(database["version"], 10)].filter { !$0.isEmpty }.joined(separator: " "), Self.text(database["size"], 40)].filter { !$0.isEmpty }.joined(separator: " · ")])
            }
        } else { warnings.append(L("令牌没有 database:read 权限，数据库没有读取")) }
        if queried.isEmpty { throw CloudFailure(message: L("这个令牌不能读取 Droplet、App 或数据库：建令牌时勾上它们的 read 权限。")) }
        // The account's name is only a label: without account:read it stays empty.
        var account = ""
        let (status, json) = try get(.digitalocean, URL(string: "https://api.digitalocean.com/v2/account")!, token)
        if status == 200, let info = json["account"] as? [String: Any] {
            account = Self.text((info["team"] as? [String: Any])?["name"]).isEmpty ? Self.text(info["email"]) : Self.text((info["team"] as? [String: Any])?["name"])
        }
        return ["account": account, "queriedKinds": queried, "resources": resources, "warnings": warnings]
    }

    /// The account's slug (GET /v2/user, or /v2/teams/{id} for a team id; a team slug is the slug), then /v10/projects and /v5/domains,
    /// 100 a page, with teamId or slug when a team is named. The next page: a numeric pagination.next goes in `until`, a continuation
    /// token in `from`. Only domains bought through Vercel (boughtAt set) become domain records; the others are counted in the
    /// warnings. Only names, ids, states and the framework are taken: a project's env values never are.
    /// https://vercel.com/docs/rest-api (OpenAPI: https://openapi.vercel.sh/), projects/retrieve-a-list-of-projects,
    /// domains/list-all-the-domains, user/get-the-user, teams/get-a-team
    func vercel(_ values: [String: String]) throws -> [String: Any] {
        let token = values["token"] ?? "", team = values["team"] ?? ""
        let scope: [(String, String)] = team.isEmpty ? [] : [(team.hasPrefix("team_") ? "teamId" : "slug", team)]
        func read(_ path: String, _ query: [(String, String)]) throws -> [String: Any] {
            let (status, json) = try get(.vercel, Self.url("https://api.vercel.com" + path, query), token)
            guard status == 200 else { throw refused(.vercel, status, json) }
            return json
        }
        let slug: String
        if team.isEmpty {
            let user = try read("/v2/user", [])
            slug = Self.text((user["user"] as? [String: Any])?["username"])
        } else if team.hasPrefix("team_") {
            let found = try read("/v2/teams/\(team)", [])
            slug = Self.text(found["slug"])
        } else { slug = team }
        let safeSlug = slug.range(of: "^[A-Za-z0-9][A-Za-z0-9-]{0,99}$", options: .regularExpression) != nil ? slug : ""
        var resources: [[String: Any]] = [], warnings: [String] = []
        var from: (String, String)? = nil
        for page in 0...Self.maxPages {
            guard page < Self.maxPages else { throw CloudFailure(message: L("{name} 的资源超过 {n} 个，同步未写入资产板。", ["name": "Vercel", "n": Self.maxPages * 100])) }
            let json = try read("/v10/projects", [("limit", "100")] + scope + (from.map { [$0] } ?? []))
            guard let projects = json["projects"] as? [[String: Any]] else { throw invalid(.vercel, 200) }
            for project in projects {
                guard let id = project["id"] as? String, let name = project["name"] as? String, !name.isEmpty else { throw CloudFailure(message: L("部署数据不完整，同步未写入资产板。")) }
                let production = (project["targets"] as? [String: Any])?["production"] as? [String: Any]
                let state = (project["paused"] as? Bool) == true ? "paused" : Self.text(production?["readyState"], 30).lowercased()
                var item: [String: Any] = ["kind": "project", "id": id, "name": String(name.prefix(100)), "status": state.isEmpty ? "none" : state, "detail": Self.text(project["framework"], 30)]
                if !safeSlug.isEmpty, name.range(of: "^[A-Za-z0-9._-]{1,100}$", options: .regularExpression) != nil { item["url"] = "https://vercel.com/\(safeSlug)/\(name)" }
                resources.append(item)
            }
            guard let next = Self.next(json), next.1 != from?.1 else { break }
            from = next
        }
        var until: (String, String)? = nil, elsewhere = 0
        for page in 0...Self.maxPages {
            guard page < Self.maxPages else { throw CloudFailure(message: L("{name} 的资源超过 {n} 个，同步未写入资产板。", ["name": "Vercel", "n": Self.maxPages * 100])) }
            let json = try read("/v5/domains", [("limit", "100")] + scope + (until.map { [$0] } ?? []))
            guard let domains = json["domains"] as? [[String: Any]] else { throw invalid(.vercel, 200) }
            for domain in domains {
                guard let name = domain["name"] as? String, !name.isEmpty else { throw CloudFailure(message: L("域名数据不完整，同步未写入资产板。")) }
                guard domain["boughtAt"] is NSNumber else { elsewhere += 1; continue }
                var item: [String: Any] = ["kind": "domain", "id": name, "name": name, "status": (domain["verified"] as? Bool) == false ? "unverified" : "active"]
                if let expires = domain["expiresAt"] as? NSNumber {
                    item["expires"] = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: expires.doubleValue / 1000))
                }
                if let renew = domain["renew"] as? Bool { item["autoRenew"] = renew ? "true" : "false" }
                resources.append(item)
            }
            guard let next = Self.next(json), next.1 != until?.1 else { break }
            until = next
        }
        if elsewhere > 0 { warnings.append(L("{n} 个域名不在 Vercel 注册，没有读入；它们的到期日在注册商那里", ["n": elsewhere])) }
        return ["account": safeSlug, "queriedKinds": ["project", "domain"], "resources": resources, "warnings": warnings]
    }

    /// Vercel's pagination.next as the parameter that asks for the next page: a timestamp in milliseconds goes in `until`, a Base32
    /// continuation token in `from`.
    static func next(_ json: [String: Any]) -> (String, String)? {
        let next = (json["pagination"] as? [String: Any])?["next"]
        if let number = next as? NSNumber { return ("until", number.stringValue) }
        guard let text = next as? String else { return nil }
        if text.range(of: "^[0-9]{1,20}$", options: .regularExpression) != nil { return ("until", text) }
        if text.range(of: "^[A-Za-z0-9=]{1,200}$", options: .regularExpression) != nil { return ("from", text) }
        return nil
    }

    /// The answer for the page: {ok, source, account, queriedKinds, resources, warnings, complete} or {ok: false, source, error}.
    func list(_ kind: CloudKind, _ values: [String: String]) -> [String: Any] {
        do {
            var listed: [String: Any]
            switch kind {
            case .hetzner: listed = try hetzner(values)
            case .digitalocean: listed = try digitalocean(values)
            case .vercel: listed = try vercel(values)
            }
            guard (listed["resources"] as? [[String: Any]] ?? []).count <= Self.limit else {
                return ["ok": false, "source": kind.rawValue, "error": L("{name} 的资源超过 {n} 个，同步未写入资产板。", ["name": kind.name, "n": Self.limit])]
            }
            listed["ok"] = true
            listed["source"] = kind.rawValue
            listed["complete"] = true
            return listed
        } catch let failure as CloudFailure {
            return ["ok": false, "source": kind.rawValue, "error": failure.message]
        } catch {
            return ["ok": false, "source": kind.rawValue, "error": error.localizedDescription]
        }
    }
}

extension AppDelegate {
    /// `cloudImportSync {source, credentials|null}` (null: the kept token) and `cloudImportDisconnect {source}`; the answer goes to
    /// `window.assetboardCloudImportResult`.
    func handleCloudImport(_ action: String, _ body: [String: Any]) {
        guard let kind = CloudKind(rawValue: body["source"] as? String ?? "") else { return }
        let clouds = CloudImport.shared
        if action == "cloudImportDisconnect" {
            cloudImportResult(clouds.remove(kind) ? ["ok": true, "source": kind.rawValue, "disconnected": true]
                                                  : ["ok": false, "source": kind.rawValue, "error": L("无法从 macOS 钥匙串删除令牌，请重试。")])
            return
        }
        let supplied: [String: String]? = (body["credentials"] as? [String: Any]).map { raw in
            Dictionary(uniqueKeysWithValues: kind.fields.map { key in (key, (raw[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) })
        }
        if let supplied, let problem = CloudImport.problem(kind, supplied) {
            cloudImportResult(["ok": false, "source": kind.rawValue, "error": problem])
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let values = supplied ?? clouds.credentials(kind) else {
                self.cloudImportResult(["ok": false, "source": kind.rawValue, "error": L("请填写 {name} 的 API 令牌。", ["name": kind.name])])
                return
            }
            var result = clouds.list(kind, values)
            if result["ok"] as? Bool == true, let supplied, !clouds.save(kind, supplied) {
                result = ["ok": false, "source": kind.rawValue, "error": L("无法把令牌存进 macOS 钥匙串，同步未写入资产板。")]
            }
            if result["ok"] as? Bool == true { result["connected"] = true }
            self.cloudImportResult(result)
        }
    }

    func cloudImportResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardCloudImportResult?.(\(json))")
        }
    }

    @objc func openCloudImports() { if demoMode { demoBlocked(); return }; webView.evaluateJavaScript("cloudDialog()") }
}

/// GET only, the documented hosts, paths and parameters, every page, the token as a Bearer header and never in the address, a kind the
/// token may not read skipped, the errors in words, a reply that is not what the API sends refused whole, and the token checks;
/// HTTP is stubbed, nothing reaches a platform or the Keychain.
func testCloudImports() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockIconProtocol.self]
    let clouds = CloudImport(session: URLSession(configuration: configuration))
    let hetznerToken = String(repeating: "h", count: 64), doToken = "dop_v1_" + String(repeating: "a", count: 64), vercelToken = String(repeating: "V", count: 24)
    var asked: [URLRequest] = []
    func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    func query(_ request: URLRequest) -> [String: String] {
        Dictionary(uniqueKeysWithValues: (URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    }
    func bearer(_ request: URLRequest, _ token: String) {
        precondition(request.httpMethod == "GET" && request.url?.scheme == "https", "Only GET over https")
        precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + token, "The token as a Bearer header")
        precondition(!(request.url?.absoluteString ?? "").contains(token), "The token never in the address")
    }

    // Hetzner: two pages of /v1/servers, the monthly gross price of the server's location, its IPv4 and country.
    func server(_ id: Int) -> [String: Any] {
        ["id": id, "name": "web-\(id)", "status": id == 2 ? "off" : "running",
         "public_net": ["ipv4": ["ip": "203.0.113.\(id % 250)"], "ipv6": ["ip": "2001:db8::/64"]],
         "server_type": ["name": "cx22", "prices": [["location": "nbg1", "price_monthly": ["net": "3.0000000000", "gross": "3.5700000000"]],
                                                     ["location": "fsn1", "price_monthly": ["net": "3.7900000000", "gross": "4.5101000000"]]]],
         "location": ["name": "fsn1", "country": "DE", "city": "Falkenstein"]]
    }
    MockIconProtocol.reply = { request in
        asked.append(request)
        bearer(request, hetznerToken)
        if request.url?.host == "api.hetzner.cloud" && request.url?.path == "/v1/pricing" { return (200, json(["pricing": ["currency": "EUR", "vat_rate": "19.00"]])) }
        precondition(request.url?.host == "api.hetzner.cloud" && request.url?.path == "/v1/servers" && query(request)["per_page"] == "50", "Only the documented list")
        let page = Int(query(request)["page"] ?? "") ?? 0
        return (200, json(["servers": page == 1 ? (1...50).map(server) : [server(51)],
                           "meta": ["pagination": ["page": page, "per_page": 50, "next_page": page == 1 ? 2 as Any : NSNull() as Any, "last_page": 2, "total_entries": 51]]]))
    }
    let hetzner = clouds.list(.hetzner, ["token": hetznerToken, "project": "main"])
    let servers = hetzner["resources"] as? [[String: Any]] ?? []
    precondition(hetzner["ok"] as? Bool == true && servers.count == 51 && asked.count == 3 && hetzner["account"] as? String == "main", "Hetzner pages: \(hetzner["error"] ?? "")")
    precondition(servers[1]["id"] as? String == "2" && servers[1]["status"] as? String == "off" && servers[1]["ips"] as? [String] == ["203.0.113.2"]
                 && servers[1]["region"] as? String == "DE" && servers[1]["detail"] as? String == "CX22 · Falkenstein", "Hetzner server fields: \(servers[1])")
    precondition((servers[0]["price"] as? [String: Any])?["value"] as? Double == 4.5101 && (servers[0]["price"] as? [String: Any])?["currency"] as? String == "EUR", "The location's gross price")
    MockIconProtocol.reply = { _ in (401, json(["error": ["code": "unauthorized", "message": "unable to authenticate"]])) }
    precondition((clouds.list(.hetzner, ["token": hetznerToken, "project": ""])["error"] as? String ?? "").contains("令牌"), "A wrong token in words")
    MockIconProtocol.reply = { _ in (200, Data("<html>not the API</html>".utf8)) }
    precondition(clouds.list(.hetzner, ["token": hetznerToken, "project": ""])["ok"] as? Bool == false, "Not the API's JSON")
    MockIconProtocol.reply = { request in request.url!.path == "/v1/pricing" ? (200, json(["pricing": ["currency": "EUR"]])) : (200, json(["servers": [["name": "no-id"]], "meta": ["pagination": ["next_page": NSNull()]]])) }
    precondition(clouds.list(.hetzner, ["token": hetznerToken, "project": ""])["ok"] as? Bool == false, "A server without its id")

    // DigitalOcean: droplets over two pages (links.pages.next), apps, databases refused by a scoped token (403), the account's team.
    asked = []
    MockIconProtocol.reply = { request in
        asked.append(request)
        bearer(request, doToken)
        precondition(request.url?.host == "api.digitalocean.com", "Only the DigitalOcean API")
        switch request.url!.path {
        case "/v2/droplets":
            let page = query(request)["page"] ?? ""
            precondition(query(request)["per_page"] == "200")
            let droplet: [String: Any] = ["id": page == "1" ? 3164444 : 3164445, "name": page == "1" ? "app-1" : "app-2", "status": "active", "size_slug": "s-1vcpu-1gb",
                                          "size": ["price_monthly": 6], "region": ["slug": "ams3", "name": "Amsterdam 3"],
                                          "networks": ["v4": [["ip_address": "10.128.0.2", "type": "private"], ["ip_address": "198.51.100.7", "type": "public"]], "v6": [["ip_address": "2001:db8::7", "type": "public"]]]]
            return (200, json(["droplets": [droplet], "links": page == "1" ? ["pages": ["next": "https://api.digitalocean.com/v2/droplets?page=2&per_page=200"]] : [:], "meta": ["total": 2]]))
        case "/v2/apps":
            return (200, json(["apps": [["id": "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf", "spec": ["name": "notes-web"], "region": ["slug": "fra"], "active_deployment": ["phase": "ACTIVE"]]], "links": [:], "meta": ["total": 1]]))
        case "/v2/databases":
            precondition(request.url?.query == nil, "The database list is not paged")
            return (403, json(["id": "forbidden", "message": "You are not authorized to perform this operation"]))
        case "/v2/account": return (200, json(["account": ["email": "person@example.com", "uuid": "b6fr89dbf6d9156cace5f3c78dc9851d957381ef", "team": ["uuid": "5df3e3004a17e242b7c20ca6c9fc25b701a47ece", "name": "My Team"]]]))
        default: preconditionFailure("unexpected request \(request.url!.path)")
        }
    }
    let ocean = clouds.list(.digitalocean, ["token": doToken])
    let oceanItems = ocean["resources"] as? [[String: Any]] ?? []
    precondition(ocean["ok"] as? Bool == true && oceanItems.count == 3 && ocean["account"] as? String == "My Team", "DigitalOcean: \(ocean["error"] ?? "")")
    precondition(ocean["queriedKinds"] as? [String] == ["droplet", "app"] && (ocean["warnings"] as? [String] ?? []).count == 1, "A kind the token may not read is skipped and named")
    precondition(oceanItems[0]["ips"] as? [String] == ["198.51.100.7", "2001:db8::7"] && oceanItems[0]["region"] as? String == "NL"
                 && (oceanItems[0]["price"] as? [String: Any])?["currency"] as? String == "USD" && oceanItems[0]["url"] as? String == "https://cloud.digitalocean.com/droplets/3164444", "Droplet fields: \(oceanItems[0])")
    precondition(oceanItems[2]["kind"] as? String == "app" && oceanItems[2]["status"] as? String == "ACTIVE" && oceanItems[2]["region"] as? String == "DE", "App fields: \(oceanItems[2])")
    MockIconProtocol.reply = { _ in (403, json(["id": "forbidden", "message": "You are not authorized to perform this operation"])) }
    precondition((clouds.list(.digitalocean, ["token": doToken])["error"] as? String ?? "").contains("read"), "A token that may read nothing")
    asked = []
    MockIconProtocol.reply = { request in
        asked.append(request)
        return request.url!.path == "/v2/droplets" ? (200, json(["droplets": [], "links": ["pages": ["next": "https://evil.example/v2/droplets?page=2"]]])) : (200, json([request.url!.path == "/v2/apps" ? "apps" : "databases": []] as [String: Any]))
    }
    let foreign = clouds.list(.digitalocean, ["token": doToken])
    precondition(foreign["ok"] as? Bool == true && !(asked.contains { $0.url?.host == "evil.example" }), "A next page on another host is never followed")

    // Vercel: the team's slug, projects and domains over pages, the team on every request; a domain not bought at Vercel is counted.
    asked = []
    MockIconProtocol.reply = { request in
        asked.append(request)
        bearer(request, vercelToken)
        precondition(request.url?.host == "api.vercel.com", "Only the Vercel API")
        switch request.url!.path {
        case "/v2/teams/team_abc123": return (200, json(["id": "team_abc123", "slug": "acme", "name": "Acme"]))
        case "/v10/projects":
            precondition(query(request)["teamId"] == "team_abc123" && query(request)["limit"] == "100")
            let first = query(request)["until"] == nil
            precondition(first || query(request)["until"] == "1730000000000", "The next page by its timestamp")
            return (200, json(["projects": [["id": first ? "prj_1" : "prj_2", "name": first ? "notes-web" : "docs", "framework": "nextjs", "targets": ["production": ["readyState": "READY"]]]],
                               "pagination": ["count": 1, "next": first ? 1730000000000 as Any : NSNull() as Any, "prev": NSNull()]]))
        case "/v5/domains":
            precondition(query(request)["teamId"] == "team_abc123")
            return (200, json(["domains": [["name": "example.com", "boughtAt": 1700000000000, "expiresAt": 1800000000000, "renew": true, "verified": true],
                                           ["name": "pointed.example", "boughtAt": NSNull(), "expiresAt": NSNull(), "verified": true]], "pagination": ["count": 2, "next": NSNull()]]))
        default: preconditionFailure("unexpected request \(request.url!.path)")
        }
    }
    let vercel = clouds.list(.vercel, ["token": vercelToken, "team": "team_abc123"])
    let vercelItems = vercel["resources"] as? [[String: Any]] ?? []
    precondition(vercel["ok"] as? Bool == true && vercel["account"] as? String == "acme" && vercelItems.count == 3 && asked.count == 4, "Vercel: \(vercel["error"] ?? "")")
    precondition(vercelItems[0]["url"] as? String == "https://vercel.com/acme/notes-web" && vercelItems[0]["status"] as? String == "ready", "Vercel project: \(vercelItems[0])")
    precondition(vercelItems[2]["kind"] as? String == "domain" && (vercelItems[2]["expires"] as? String ?? "").hasPrefix("2027-01-15") && vercelItems[2]["autoRenew"] as? String == "true", "Vercel domain: \(vercelItems[2])")
    precondition((vercel["warnings"] as? [String] ?? []).count == 1, "The pointed domain is counted, not read")
    MockIconProtocol.reply = { _ in (403, json(["error": ["code": "forbidden", "message": "Not authorized", "invalidToken": true]])) }
    precondition((clouds.list(.vercel, ["token": vercelToken, "team": ""])["error"] as? String ?? "").contains("Not authorized"), "Vercel's refusal in its words")

    // The token checks, the same as the page's.
    precondition(CloudImport.problem(.hetzner, ["token": hetznerToken, "project": ""]) == nil && CloudImport.problem(.digitalocean, ["token": doToken]) == nil
                 && CloudImport.problem(.vercel, ["token": vercelToken, "team": "acme"]) == nil)
    precondition(CloudImport.problem(.hetzner, ["token": "short", "project": ""]) != nil && CloudImport.problem(.digitalocean, ["token": hetznerToken]) != nil
                 && CloudImport.problem(.vercel, ["token": vercelToken, "team": "Not A Slug"]) != nil && CloudImport.problem(.vercel, ["token": "", "team": ""]) != nil)
    precondition(CloudImport.problem(.digitalocean, ["token": doToken, "extra": "x"]) != nil, "Only the known fields")
    precondition(CloudImport.next(["pagination": ["next": 1730000000000]])! == ("until", "1730000000000") && CloudImport.next(["pagination": ["next": "MFRGGZDF"]])! == ("from", "MFRGGZDF")
                 && CloudImport.next(["pagination": ["next": "a&b=c"]]) == nil && CloudImport.next(["pagination": ["next": NSNull()]]) == nil)
    precondition(CloudImport.doCountry("nyc3") == "US" && CloudImport.doCountry("sgp1") == "SG" && CloudImport.doCountry("mars1") == "")
    guard JSONSerialization.isValidJSONObject(hetzner), JSONSerialization.isValidJSONObject(ocean), JSONSerialization.isValidJSONObject(vercel) else { fatalError("The answers are not JSON") }
    print("PASS: Hetzner servers, DigitalOcean droplets/apps/databases and Vercel projects/domains, GET only, documented paths, every page, Bearer token never in the address, unreadable kinds skipped, errors in words, malformed replies refused, token checks")
}
