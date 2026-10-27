import Foundation

/// 网络记录: every request the app sends and every call that reaches it from outside, kept so the person can see exactly
/// what talks to what. Only the method, host, path, status, size, timing, remote address and TLS version are recorded;
/// never headers, bodies, query strings or tokens.
final class NetworkLog {
    static let shared = NetworkLog()
    static let keep = 5000
    /// Set once the data folder is open; nothing is kept before that (and nothing in demo mode).
    var database: LocalDatabase?
    /// Called on the main queue with each new entry, so an open 网络记录 updates live.
    var onEntry: (([String: Any]) -> Void)?

    private static var sessions: [String: URLSession] = [:]
    private static let lock = NSLock()
    /// The shared URLSession for `service` (Cloudflare, GitHub, AI…), whose requests are recorded under that name.
    static func session(_ service: String) -> URLSession {
        lock.lock(); defer { lock.unlock() }
        if let session = sessions[service] { return session }
        let session = makeSession(service, configuration: .default)
        sessions[service] = session
        return session
    }
    static func makeSession(_ service: String, configuration: URLSessionConfiguration) -> URLSession {
        URLSession(configuration: configuration, delegate: LoggedSessionDelegate(service: service), delegateQueue: nil)
    }

    /// `direction` is "out" (this Mac → a server) or "in" (something → the app).
    func record(direction: String, service: String, method: String, host: String, path: String, status: Int? = nil,
                ok: Bool, sent: Int64 = 0, received: Int64 = 0, milliseconds: Int? = nil, address: String? = nil,
                tls: String? = nil, note: String? = nil) {
        var entry: [String: Any] = ["id": UUID().uuidString, "at": ISO8601DateFormatter().string(from: Date()), "direction": direction,
                                    "service": service, "method": String(method.prefix(40)), "host": String(host.prefix(200)),
                                    "path": String(path.prefix(300)), "ok": ok, "sent": sent, "received": received]
        if let status { entry["status"] = status }
        if let milliseconds { entry["ms"] = milliseconds }
        if let address, !address.isEmpty { entry["address"] = String(address.prefix(80)) }
        if let tls { entry["tls"] = tls }
        if let note, !note.isEmpty { entry["note"] = String(note.prefix(200)) }
        guard let database else { return }
        try? database.appendNetworkLog(entry, keep: Self.keep)
        DispatchQueue.main.async { self.onEntry?(entry) }
    }

    /// A URL as it is shown: the path only, so a query string (search words, page numbers, keys) never reaches the log.
    static func parts(_ url: URL?) -> (host: String, path: String) {
        guard let url else { return ("", "") }
        let port = url.port.map { ":\($0)" } ?? ""
        return ((url.host ?? "") + port, url.path.isEmpty ? "/" : url.path)
    }

    static func tlsName(_ version: UInt16?) -> String? {
        switch version {
        case 0x0304: return "TLS 1.3"
        case 0x0303: return "TLS 1.2"
        case 0x0302: return "TLS 1.1"
        case 0x0301: return "TLS 1.0"
        default: return nil
        }
    }
}

/// Records each finished transaction of the session's tasks (a redirect is its own row). Metrics arrive for tasks made with
/// completion handlers too, which is how every connector in the app makes its requests.
class LoggedSessionDelegate: NSObject, URLSessionTaskDelegate {
    let service: String
    init(service: String) { self.service = service }

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        let network = metrics.transactionMetrics.filter { $0.resourceFetchType != .localCache }
        if network.isEmpty {
            // Failed before any transaction started (no connection, bad host).
            let (host, path) = NetworkLog.parts(task.originalRequest?.url)
            NetworkLog.shared.record(direction: "out", service: service, method: task.originalRequest?.httpMethod ?? "GET", host: host, path: path,
                                     ok: false, milliseconds: Int(metrics.taskInterval.duration * 1000), note: task.error?.localizedDescription ?? L("没有建立连接"))
            return
        }
        for (index, transaction) in network.enumerated() {
            let (host, path) = NetworkLog.parts(transaction.request.url)
            // Custom URL protocols may omit the response from metrics; the task still has the final response.
            let last = index == network.count - 1
            let response = transaction.response ?? (last ? task.response : nil)
            let status = (response as? HTTPURLResponse)?.statusCode
            let start = transaction.fetchStartDate ?? metrics.taskInterval.start
            let end = transaction.responseEndDate ?? metrics.taskInterval.end
            let failed = status == nil || (status.map { $0 >= 400 } ?? true)
            NetworkLog.shared.record(direction: "out", service: service, method: transaction.request.httpMethod ?? "GET", host: host, path: path,
                                     status: status, ok: !failed, sent: transaction.countOfRequestBodyBytesSent,
                                     received: transaction.countOfResponseBodyBytesReceived,
                                     milliseconds: Int(max(0, end.timeIntervalSince(start)) * 1000), address: transaction.remoteAddress,
                                     tls: NetworkLog.tlsName(transaction.negotiatedTLSProtocolVersion?.rawValue),
                                     note: status == nil && last ? (task.error?.localizedDescription ?? L("没有收到响应")) : nil)
        }
    }
}
