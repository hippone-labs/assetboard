import Foundation

/// The local channel behind `assetboard-cli` and its MCP server: a Unix socket in the data folder, readable by its owner
/// only, carrying one JSON request and one JSON reply per connection, each a single line. Connections from other users
/// are closed unanswered. Shared by the app (server) and the CLI (client).
enum AgentSocket {
    static let maxBytes = 4 * 1024 * 1024
    static var defaultPath: String {
        if let path = ProcessInfo.processInfo.environment["ASSETBOARD_SOCKET"], !path.isEmpty { return path }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Assetboard/agent.sock").path
    }

    enum Failure: Error { case notRunning, badPath, io(String) }

    static func address(_ path: String) -> sockaddr_un? {
        var address = sockaddr_un()
        let bytes = Array(path.utf8)
        guard !bytes.isEmpty, bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { return nil }
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        withUnsafeMutableBytes(of: &address.sun_path) { raw in
            for (index, byte) in bytes.enumerated() { raw[index] = byte }
        }
        return address
    }

    /// Reads up to the first newline (or the end); nil when nothing arrived or the line runs past `maxBytes`.
    static func readLine(_ fd: Int32) -> Data? {
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while data.count <= maxBytes {
            let count = Darwin.read(fd, &buffer, buffer.count)
            if count <= 0 { return data.isEmpty ? nil : data }
            if let newline = buffer[0..<count].firstIndex(of: 10) {
                data.append(contentsOf: buffer[0..<newline])
                return data
            }
            data.append(contentsOf: buffer[0..<count])
        }
        return nil
    }

    static func writeLine(_ fd: Int32, _ data: Data) -> Bool {
        var payload = data
        payload.append(10)
        return payload.withUnsafeBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return false }
            var offset = 0
            while offset < raw.count {
                let count = Darwin.write(fd, base + offset, raw.count - offset)
                if count <= 0 { return false }
                offset += count
            }
            return true
        }
    }

    static func setTimeout(_ fd: Int32, seconds: Int) {
        var time = timeval(tv_sec: seconds, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &time, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &time, socklen_t(MemoryLayout<timeval>.size))
        var on: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
    }

    /// Sends one request and waits for its reply. Throws `.notRunning` when nothing listens at the path.
    static func call(_ request: [String: Any], path: String = defaultPath, timeout: Int = 30) throws -> [String: Any] {
        guard var target = AgentSocket.address(path) else { throw Failure.badPath }
        let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw Failure.io("socket") }
        defer { Darwin.close(fd) }
        setTimeout(fd, seconds: timeout)
        let connected = withUnsafePointer(to: &target) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard connected == 0 else { throw Failure.notRunning }
        guard writeLine(fd, try JSONSerialization.data(withJSONObject: request)) else { throw Failure.io(L("发送失败")) }
        guard let line = readLine(fd) else { throw Failure.io(L("Assetboard 没有回复")) }
        guard let reply = try JSONSerialization.jsonObject(with: line) as? [String: Any] else { throw Failure.io(L("回复格式不对")) }
        return reply
    }
}

final class AgentSocketServer {
    let path: String
    private var listener: Int32 = -1
    /// Called on the main queue with each request; `reply` takes the JSON reply and may be called from the main queue once.
    var onRequest: (([String: Any], @escaping (Data) -> Void) -> Void)?

    init(path: String) { self.path = path }

    func start() throws {
        guard var target = AgentSocket.address(path) else { throw AgentSocket.Failure.badPath }
        // A socket left by a crashed run is removed; a live one would mean a second copy of the app, which macOS prevents.
        unlink(path)
        let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw AgentSocket.Failure.io("socket") }
        let previous = umask(0o077)
        let bound = withUnsafePointer(to: &target) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        umask(previous)
        guard bound == 0, chmod(path, 0o600) == 0, Darwin.listen(fd, 8) == 0 else {
            Darwin.close(fd)
            throw AgentSocket.Failure.io(String(cString: strerror(errno)))
        }
        listener = fd
        let thread = Thread { [weak self] in self?.acceptLoop(fd) }
        thread.name = "Assetboard agent socket"
        thread.start()
    }

    func stop() {
        guard listener >= 0 else { return }
        Darwin.close(listener)
        listener = -1
        unlink(path)
    }

    private func acceptLoop(_ fd: Int32) {
        while true {
            let client = Darwin.accept(fd, nil, nil)
            if client < 0 {
                if errno == EINTR { continue }
                return
            }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in self?.serve(client) }
        }
    }

    private func serve(_ client: Int32) {
        var uid: uid_t = 0, gid: gid_t = 0
        guard getpeereid(client, &uid, &gid) == 0, uid == getuid() else { Darwin.close(client); return }
        AgentSocket.setTimeout(client, seconds: 30)
        let respond: (Data) -> Void = { data in
            DispatchQueue.global(qos: .userInitiated).async {
                _ = AgentSocket.writeLine(client, data)
                Darwin.close(client)
            }
        }
        guard let line = AgentSocket.readLine(client),
              let request = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any] else {
            respond(AgentSocketServer.failure(L("请求需要是一行 JSON 对象")))
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let handler = self?.onRequest else { respond(AgentSocketServer.failure(L("Assetboard 正在退出"))); return }
            handler(request, respond)
        }
    }

    static func failure(_ message: String) -> Data {
        (try? JSONSerialization.data(withJSONObject: ["ok": false, "error": message])) ?? Data("{\"ok\":false}".utf8)
    }
}
