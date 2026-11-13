import Foundation

/// 待合并的 PR: the open pull requests of the GitHub repositories on the board, read through GitHub's GraphQL API with one fixed
/// query (read fields only, no mutation can be sent). The page (github-pulls.js) names the repositories and parses what comes back;
/// this side only checks the names, picks a login and passes the answer on.
///
/// Logins, in order: every account the local `gh` is signed in to (`gh auth token --user`, the token is never stored), then the
/// token saved in the Keychain by the GitHub dialog. A repository the first login cannot see is asked again with the next one;
/// what no login can see is `denied`. A failure of the whole read is one `reason`: `nosource` (no gh login and no saved token),
/// `auth` (every login refused), `rate` (GitHub's limit, with `resetAt` when it says), `net` (no answer).
final class GitHubPulls {
    static let repoLimit = 100
    static let batch = 20
    static let perRepo = 30

    struct Failure: Error {
        let reason: String
        var resetAt: String? = nil
    }

    private let session: URLSession
    init(session: URLSession = NetworkLog.session("GitHub")) { self.session = session }

    /// owner/name as GitHub allows them: an owner of letters, digits and inner hyphens (≤ 39), a name of letters, digits, '.', '_'
    /// and '-' (≤ 100), not '.' or '..'.
    static func validName(_ full: String) -> Bool {
        let parts = full.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return false }
        let owner = parts[0], name = parts[1]
        let ownerOK = (1...39).contains(owner.count) && owner.first != "-" && owner.last != "-"
            && owner.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
        let nameOK = (1...100).contains(name.count) && name != "." && name != ".."
            && name.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "_" || $0 == "-") }
        return ownerOK && nameOK
    }

    static let fields = "number title url isDraft createdAt updatedAt mergeable author { login } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }"

    /// The query for one batch: repository(owner:, name:) per name as r0, r1, …, the values passed as variables.
    static func query(count: Int) -> String {
        let variables = (0..<count).map { "$o\($0): String!, $n\($0): String!" }.joined(separator: ", ")
        let parts = (0..<count).map { "r\($0): repository(owner: $o\($0), name: $n\($0)) { pullRequests(states: OPEN, first: \(perRepo), orderBy: {field: UPDATED_AT, direction: DESC}) { totalCount nodes { \(fields) } } }" }
        return "query(\(variables)) { \(parts.joined(separator: " ")) }"
    }

    /// One batch with one token: per name its pull requests ({total, nodes}), or nothing for a name this login cannot see.
    func readBatch(token: String, names: [String], completion: @escaping (Result<[String: [String: Any]], Failure>) -> Void) {
        var variables: [String: String] = [:]
        for (index, full) in names.enumerated() {
            let parts = full.split(separator: "/")
            variables["o\(index)"] = String(parts[0]); variables["n\(index)"] = String(parts[1])
        }
        var request = URLRequest(url: URL(string: "https://api.github.com/graphql")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 25
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["query": Self.query(count: names.count), "variables": variables])
        session.dataTask(with: request) { data, response, error in
            if error != nil { completion(.failure(Failure(reason: "net"))); return }
            guard let http = response as? HTTPURLResponse else { completion(.failure(Failure(reason: "net"))); return }
            let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            let errors = body?["errors"] as? [[String: Any]] ?? []
            let reset = http.value(forHTTPHeaderField: "x-ratelimit-reset").flatMap(Double.init).map { ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: $0)) }
            // A 200 can carry the limit as an error; a 403 or 429 says it in its headers or message.
            let limited = errors.contains { $0["type"] as? String == "RATE_LIMITED" }
                || ((http.statusCode == 403 || http.statusCode == 429) && (http.value(forHTTPHeaderField: "x-ratelimit-remaining") == "0"
                    || http.value(forHTTPHeaderField: "retry-after") != nil || (body?["message"] as? String ?? "").lowercased().contains("rate limit")))
            if limited {
                completion(.failure(Failure(reason: "rate", resetAt: reset))); return
            }
            if http.statusCode == 401 || http.statusCode == 403 { completion(.failure(Failure(reason: "auth"))); return }
            guard http.statusCode == 200, let found = body?["data"] as? [String: Any] else { completion(.failure(Failure(reason: http.statusCode >= 500 ? "net" : "bad"))); return }
            var out: [String: [String: Any]] = [:]
            for (index, full) in names.enumerated() {
                guard let pulls = (found["r\(index)"] as? [String: Any])?["pullRequests"] as? [String: Any] else { continue }
                out[full] = ["total": pulls["totalCount"] as? Int ?? 0, "nodes": pulls["nodes"] as? [Any] ?? []]
            }
            completion(.success(out))
        }.resume()
    }

    /// Every name with the logins in turn. Blocks the calling (background) queue until done.
    func read(names: [String], tokens: [(via: String, token: String)]) -> [String: Any] {
        guard !tokens.isEmpty else { return ["ok": false, "reason": "nosource"] }
        var left = names, repos: [String: Any] = [:], refused = 0, used: Set<String> = [], cut = false
        for login in tokens where !left.isEmpty {
            var seen: [String: [String: Any]] = [:]
            var stop: Failure? = nil
            for start in stride(from: 0, to: left.count, by: Self.batch) {
                let part = Array(left[start..<min(start + Self.batch, left.count)])
                let done = DispatchSemaphore(value: 0)
                var answer: Result<[String: [String: Any]], Failure> = .failure(Failure(reason: "net"))
                readBatch(token: login.token, names: part) { answer = $0; done.signal() }
                if done.wait(timeout: .now() + 40) == .timedOut { stop = Failure(reason: "net"); break }
                switch answer {
                case .success(let found): seen.merge(found) { $1 }
                case .failure(let failure): stop = failure
                }
                if stop != nil { break }
            }
            if let stop {
                if stop.reason == "auth" { refused += 1; continue }
                // The limit and the network are the same for the next login: say so, keep what was read.
                if repos.isEmpty && seen.isEmpty {
                    var reply: [String: Any] = ["ok": false, "reason": stop.reason]
                    if let reset = stop.resetAt { reply["resetAt"] = reset }
                    return reply
                }
            }
            if !seen.isEmpty { used.insert(login.via) }
            for (name, value) in seen { repos[name] = value }
            left = left.filter { seen[$0] == nil }
            if stop != nil { cut = true; break }
        }
        if repos.isEmpty && refused == tokens.count { return ["ok": false, "reason": "auth"] }
        // Cut short by the limit or the network: the rest was not read, which is not the same as not allowed.
        for name in left { repos[name] = ["error": cut ? "unread" : "denied"] }
        return ["ok": true, "repos": repos, "via": used.sorted(), "at": ISO8601DateFormatter().string(from: Date())]
    }

    /// The logins to try: the local gh's accounts, then the Keychain token.
    static func logins(keychain: String?) -> [(via: String, token: String)] {
        var out: [(via: String, token: String)] = []
        if let path = LocalCLI.ghPath() {
            let accounts = (try? LocalCLI.ghAccounts(path: path)) ?? []
            for user in accounts.isEmpty ? [""] : accounts {
                if let token = try? LocalCLI.ghToken(path: path, user: user.isEmpty ? nil : user), !out.contains(where: { $0.token == token }) {
                    out.append((via: "gh", token: token))
                }
            }
        }
        if let saved = keychain, !saved.isEmpty, !out.contains(where: { $0.token == saved }) { out.append((via: "token", token: saved)) }
        return out
    }
}
