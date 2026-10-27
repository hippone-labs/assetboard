import Foundation

struct CloudflareInventory {
    let session: URLSession
    init(session: URLSession = NetworkLog.session("Cloudflare")) { self.session = session }

    private func envelope(_ path: String, query: [URLQueryItem], token: String) throws -> [String: Any] {
        var components = URLComponents(string: "https://api.cloudflare.com/client/v4" + path)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        // Every sync asks Cloudflare again: a stored answer would hide zones and domains added since.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let finished = DispatchSemaphore(value: 0)
        var bytes: Data?
        var status = 0
        session.dataTask(with: request) { data, response, _ in
            bytes = data
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            finished.signal()
        }.resume()
        guard finished.wait(timeout: .now() + 25) == .success else { throw failure(L("Cloudflare 请求超时")) }
        guard status == 200, let bytes,
              let result = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              result["success"] as? Bool == true else {
            throw failure(status == 401 || status == 403 ? L("权限不足") : L("接口响应无效（HTTP {status}）", ["status": status]))
        }
        return result
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "Assetboard.Cloudflare", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func pages(_ path: String, perPage: Int, token: String) throws -> [[String: Any]] {
        var all: [[String: Any]] = []
        for page in 1...100 {
            let response = try envelope(path, query: [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "per_page", value: String(perPage))], token: token)
            guard let values = response["result"] as? [[String: Any]],
                  let info = response["result_info"] as? [String: Any],
                  let total = info["total_pages"] as? Int, total >= 0, total <= 100 else { throw failure(L("分页响应不完整")) }
            all.append(contentsOf: values)
            if page >= total { return all }
        }
        throw failure(L("分页超过上限"))
    }

    func discover(token: String) throws -> [String: Any] {
        var resources: [[String: String]] = []
        var queried: [String] = []
        var warnings: [String] = []
        do {
            let zones = try pages("/zones", perPage: 50, token: token)
            for zone in zones {
                guard let id = zone["id"] as? String, !id.isEmpty,
                      let name = zone["name"] as? String, !name.isEmpty else { throw failure(L("Zone 数据不完整")) }
                resources.append(["kind": "zone", "id": id, "name": name,
                                  "account": (zone["account"] as? [String: Any])?["name"] as? String ?? "",
                                  "status": zone["status"] as? String ?? "", "url": "https://dash.cloudflare.com/"])
            }
            queried.append("zone")
        } catch { warnings.append(L("{name}：{error}", ["name": "Zone", "error": error.localizedDescription])) }

        var accounts: [[String: Any]] = []
        do { accounts = try pages("/accounts", perPage: 50, token: token) }
        catch { warnings.append(L("账户：{error}", ["error": error.localizedDescription])) }
        if !accounts.isEmpty {
            for kind in ["pages", "worker", "r2"] {
                var collected: [[String: String]] = []
                var complete = true
                for account in accounts {
                    guard let id = account["id"] as? String,
                          id.range(of: "^[0-9a-fA-F]{32}$", options: .regularExpression) != nil else {
                        complete = false
                        warnings.append(L("账户标识无效，跳过部分 Cloudflare 资源"))
                        continue
                    }
                    let name = account["name"] as? String ?? ""
                    do { collected.append(contentsOf: try accountResources(kind: kind, id: id, name: name, token: token)) }
                    catch { complete = false; warnings.append(L("{name}：{error}", ["name": "\(name) · \(kind)", "error": error.localizedDescription])) }
                }
                resources.append(contentsOf: collected)
                if complete { queried.append(kind) }
            }
        }
        // Domain expiry via Registrar registrations (legacy /registrar/domains retired 2026-09-27).
        if !accounts.isEmpty {
            var registrarRows: [[String: String]] = []
            var registrarComplete = true
            for account in accounts {
                guard let id = account["id"] as? String,
                      id.range(of: "^[0-9a-fA-F]{32}$", options: .regularExpression) != nil else {
                    registrarComplete = false
                    continue
                }
                let name = account["name"] as? String ?? ""
                do {
                    registrarRows.append(contentsOf: try registrarRegistrations(accountId: id, accountName: name, token: token))
                } catch {
                    registrarComplete = false
                    warnings.append(L("{name}：{error}", ["name": "\(name) · Registrar", "error": error.localizedDescription]))
                }
            }
            resources.append(contentsOf: registrarRows)
            if registrarComplete && !registrarRows.isEmpty { queried.append("registrar") }
        }

        guard !queried.isEmpty || !resources.isEmpty || !accounts.isEmpty else {
            throw failure(warnings.joined(separator: L("；")).isEmpty ? L("令牌没有可读取的资源") : warnings.joined(separator: L("；")))
        }
        return ["resources": resources, "queriedKinds": queried, "warnings": warnings]
    }

    private func registrarRegistrations(accountId: String, accountName: String, token: String) throws -> [[String: String]] {
        var cursor: String?
        var rows: [[String: String]] = []
        for _ in 0..<100 {
            var query = [URLQueryItem(name: "per_page", value: "50")]
            if let cursor, !cursor.isEmpty { query.append(URLQueryItem(name: "cursor", value: cursor)) }
            let response = try envelope("/accounts/\(accountId)/registrar/registrations", query: query, token: token)
            guard let values = response["result"] as? [[String: Any]] else { throw failure(L("Registrar 列表无效")) }
            for item in values {
                let domain = (item["domain_name"] as? String) ?? (item["name"] as? String) ?? ""
                guard !domain.isEmpty else { continue }
                let expires = item["expires_at"] as? String ?? ""
                let auto = item["auto_renew"] as? Bool
                let status = item["status"] as? String ?? "Registrar"
                var row: [String: String] = [
                    "kind": "registrar",
                    "id": accountId + ":" + domain,
                    "name": domain,
                    "account": accountName,
                    "status": status,
                    "url": "https://dash.cloudflare.com/\(accountId)/registrar"
                ]
                if !expires.isEmpty { row["expiresAt"] = expires }
                if let auto { row["autoRenew"] = auto ? "1" : "0" }
                rows.append(row)
            }
            let next = (response["result_info"] as? [String: Any])?["cursor"] as? String
            if next == nil || next?.isEmpty == true { return rows }
            guard next != cursor else { throw failure(L("Registrar 分页游标重复")) }
            cursor = next
        }
        throw failure(L("Registrar 分页超过上限"))
    }

    private func accountResources(kind: String, id: String, name: String, token: String) throws -> [[String: String]] {
        let root = "/accounts/\(id)"
        if kind == "pages" {
            return try pages(root + "/pages/projects", perPage: 100, token: token).map { project in
                guard let projectName = project["name"] as? String, !projectName.isEmpty else { throw failure(L("Pages 项目缺少名称")) }
                return ["kind": "pages", "id": id + ":" + projectName, "name": projectName, "account": name,
                        "status": "Pages 项目", "url": "https://dash.cloudflare.com/\(id)/workers-and-pages"]
            }
        }
        if kind == "worker" {
            let response = try envelope(root + "/workers/scripts", query: [], token: token)
            guard let scripts = response["result"] as? [[String: Any]] else { throw failure(L("Workers 列表无效")) }
            return try scripts.map { script in
                guard let scriptName = script["id"] as? String, !scriptName.isEmpty else { throw failure(L("Worker 缺少标识")) }
                return ["kind": "worker", "id": id + ":" + scriptName, "name": scriptName, "account": name,
                        "status": "Worker", "url": "https://dash.cloudflare.com/\(id)/workers-and-pages"]
            }
        }
        var cursor: String?
        var buckets: [[String: String]] = []
        for _ in 0..<100 {
            let query = [URLQueryItem(name: "per_page", value: "1000")] + (cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? [])
            let response = try envelope(root + "/r2/buckets", query: query, token: token)
            guard let result = response["result"] as? [String: Any],
                  let values = result["buckets"] as? [[String: Any]] else { throw failure(L("R2 Bucket 列表无效")) }
            for bucket in values {
                guard let bucketName = bucket["name"] as? String, !bucketName.isEmpty else { throw failure(L("R2 Bucket 缺少名称")) }
                buckets.append(["kind": "r2", "id": id + ":" + bucketName, "name": bucketName, "account": name,
                                "status": bucket["location"] as? String ?? "R2 Bucket", "url": "https://dash.cloudflare.com/\(id)/r2/overview"])
            }
            let next = (response["result_info"] as? [String: Any])?["cursor"] as? String
            if next == nil || next?.isEmpty == true { return buckets }
            guard next != cursor else { throw failure(L("R2 分页游标重复")) }
            cursor = next
        }
        throw failure(L("R2 分页超过上限"))
    }
}
