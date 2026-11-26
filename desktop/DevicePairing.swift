import Foundation
import Network
import CryptoKit

/// 其他设备 (DEVICE-PAIRING.md): two Macs with Assetboard pair once and then read each other's facts (本机设备 and 正在做), each
/// keeping the other as a device record. Nothing else crosses: no assets, no settings, no tokens, and nothing can be done to the
/// other Mac. No server sits between them: one listens on a TCP port and is found by Bonjour on the same network, or by the
/// address the person types (a Tailscale address or MagicDNS name).
///
/// Pairing: each side sends its long-term public key and a one-time key; both screens show a six-digit code computed from all
/// four keys and the one-time shared secret, and both people confirm it matches. Someone in the middle would give each side
/// different keys, so the codes would differ. After pairing every request and answer is sealed with ChaChaPoly under a key both
/// derive from their long-term keys, and carries a time and a random nonce: a request older than 60 s, seen before, or from a
/// key that is not paired is dropped without an answer.
///
/// Frames: a four-byte big-endian length, then that many bytes of JSON. One exchange per connection.
enum PeerWire {
    /// A board with its site icons can run to a few MB.
    static let limit = 24 << 20
    static func send(_ c: NWConnection, _ object: [String: Any], done: ((Bool) -> Void)? = nil) {
        guard let body = try? JSONSerialization.data(withJSONObject: object), body.count <= limit else { done?(false); return }
        var length = UInt32(body.count).bigEndian
        c.send(content: Data(bytes: &length, count: 4) + body, completion: .contentProcessed { error in done?(error == nil) })
    }
    /// Reads one frame. The body comes in pieces, and `progress` is called as each arrives, so a reader can tell a slow link that is
    /// still sending (a board over a Tailscale relay) from one that has gone quiet.
    static func receive(_ c: NWConnection, progress: (() -> Void)? = nil, done: @escaping ([String: Any]?) -> Void) {
        c.receive(minimumIncompleteLength: 4, maximumLength: 4) { head, _, _, error in
            guard error == nil, let head, head.count == 4 else { done(nil); return }
            let n = head.reduce(0) { $0 << 8 | Int($1) }
            guard n > 0, n <= limit else { done(nil); return }
            progress?()
            var body = Data(capacity: n)
            func more() {
                c.receive(minimumIncompleteLength: 1, maximumLength: min(n - body.count, 1 << 18)) { piece, _, complete, error in
                    guard error == nil, let piece, !piece.isEmpty else { done(nil); return }
                    body.append(piece); progress?()
                    if body.count < n { if complete { done(nil) } else { more() }; return }
                    guard let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else { done(nil); return }
                    done(object)
                }
            }
            more()
        }
    }
}

enum PeerCrypto {
    static func id(_ publicKey: Data) -> String { SHA256.hash(data: publicKey).prefix(8).map { String(format: "%02x", $0) }.joined() }
    /// The six digits both people compare, from both long-term keys, both one-time keys and their shared secret.
    static func code(client: Data, server: Data, clientOnce: Data, serverOnce: Data, shared: Data) -> String {
        var h = SHA256()
        for part in [Data("assetboard-pair-v1".utf8), client, server, clientOnce, serverOnce, shared] { h.update(data: part) }
        let n = Data(h.finalize()).prefix(4).reduce(UInt32(0)) { $0 << 8 | UInt32($1) } % 1_000_000
        return String(format: "%06u", n)
    }
    /// The key for confirming a pairing, from the one-time keys only.
    static func onceKey(_ mine: Curve25519.KeyAgreement.PrivateKey, _ theirs: Data) -> (key: SymmetricKey, shared: Data)? {
        guard let other = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: theirs),
              let secret = try? mine.sharedSecretFromKeyAgreement(with: other) else { return nil }
        let raw = secret.withUnsafeBytes { Data($0) }
        return (secret.hkdfDerivedSymmetricKey(using: SHA256.self, salt: Data(), sharedInfo: Data("assetboard-pair-confirm".utf8), outputByteCount: 32), raw)
    }
    /// The key two paired Macs seal with, the same on both sides.
    static func peerKey(_ mine: Curve25519.KeyAgreement.PrivateKey, _ theirs: Data) -> SymmetricKey? {
        guard let other = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: theirs),
              let secret = try? mine.sharedSecretFromKeyAgreement(with: other) else { return nil }
        let pubs = [mine.publicKey.rawRepresentation, theirs].sorted { $0.lexicographicallyPrecedes($1) }
        return secret.hkdfDerivedSymmetricKey(using: SHA256.self, salt: pubs[0] + pubs[1], sharedInfo: Data("assetboard-peer-v1".utf8), outputByteCount: 32)
    }
    static func mac(_ key: SymmetricKey, _ label: String) -> String { Data(HMAC<SHA256>.authenticationCode(for: Data(label.utf8), using: key)).base64EncodedString() }
    static func seal(_ object: [String: Any], _ key: SymmetricKey) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: object), let box = try? ChaChaPoly.seal(data, using: key) else { return nil }
        return box.combined.base64EncodedString()
    }
    static func open(_ text: Any?, _ key: SymmetricKey) -> [String: Any]? {
        guard let text = text as? String, let data = Data(base64Encoded: text), let box = try? ChaChaPoly.SealedBox(combined: data),
              let plain = try? ChaChaPoly.open(box, using: key) else { return nil }
        return (try? JSONSerialization.jsonObject(with: plain)) as? [String: Any]
    }
}

/// This Mac's long-term key and the Macs it is paired with, in `devices/` under the data folder (files 0600).
final class PeerStore {
    struct Peer: Codable, Equatable {
        var id: String
        var name: String
        var publicKey: String
        var host: String
        var service: String
        var pairedAt: String
        /// 同步资产板: this Mac lets that one read its board. Both sides must allow it for the boards to merge.
        var sync: Bool?
        /// How this Mac's page folds that board in the first time ('here', 'there', 'merge'), since when (ms), and whether it has.
        var syncFirst: String?
        var syncSince: Double?
        var syncDone: Bool?
    }
    let directory: URL
    let identity: Curve25519.KeyAgreement.PrivateKey
    private(set) var peers: [Peer]

    init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        let keyFile = directory.appendingPathComponent("identity.json")
        if let data = try? Data(contentsOf: keyFile), let saved = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
           let raw = saved["privateKey"].flatMap({ Data(base64Encoded: $0) }), let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: raw) {
            identity = key
        } else {
            identity = Curve25519.KeyAgreement.PrivateKey()
            try PeerStore.write(["privateKey": identity.rawRepresentation.base64EncodedString()], to: keyFile)
        }
        let peersFile = directory.appendingPathComponent("peers.json")
        peers = (try? JSONDecoder().decode([Peer].self, from: Data(contentsOf: peersFile))) ?? []
    }
    var publicKey: Data { identity.publicKey.rawRepresentation }
    var id: String { PeerCrypto.id(publicKey) }
    static func write(_ object: Any, to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    private func save() {
        guard let data = try? JSONEncoder().encode(peers), let object = try? JSONSerialization.jsonObject(with: data) else { return }
        try? PeerStore.write(object, to: directory.appendingPathComponent("peers.json"))
    }
    func peer(publicKey: Data) -> Peer? { peers.first { $0.publicKey == publicKey.base64EncodedString() } }
    func add(_ peer: Peer) { peers.removeAll { $0.id == peer.id }; peers.append(peer); save() }
    func remove(id: String) { peers.removeAll { $0.id == id }; save() }
    func setSync(id: String, on: Bool, first: String? = nil, since: Double? = nil, done: Bool? = nil) {
        guard let at = peers.firstIndex(where: { $0.id == id }) else { return }
        peers[at].sync = on
        if !on { peers[at].syncFirst = nil; peers[at].syncSince = nil; peers[at].syncDone = nil }
        if let first, ["here", "there", "merge"].contains(first) { peers[at].syncFirst = first }
        if let since, since > 0 { peers[at].syncSince = since }
        if let done { peers[at].syncDone = done }
        save()
    }
    /// 其他设备 on or off, kept here because the page's own storage does not outlive the app.
    var enabled: Bool {
        get { ((try? JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("settings.json")))) as? [String: Any])?["enabled"] as? Bool == true }
        set { try? PeerStore.write(["enabled": newValue], to: directory.appendingPathComponent("settings.json")) }
    }
    func remember(id: String, host: String) {
        guard let at = peers.firstIndex(where: { $0.id == id }), !host.isEmpty, peers[at].host != host else { return }
        peers[at].host = host; save()
    }
}

final class DevicePairing {
    static let type = "_assetboard._tcp"
    static let defaultPort: UInt16 = 47321
    static let window: TimeInterval = 120
    static let freshness: TimeInterval = 60
    /// Another Mac is reached directly, on this network or over Tailscale, never through the system proxy: a proxy such as
    /// Clash takes the connection, cannot reach a LAN or Tailscale address from where it forwards, and the pairing hears nothing.
    /// How long an incoming connection may take to ask; how long a reader waits with nothing arriving; the most any one exchange
    /// may take. A board over a Tailscale relay can take well over 20 seconds while it keeps arriving (seen 2026-11-25, relay hkg).
    static var askWindow: TimeInterval = 15
    static var quiet: TimeInterval = 20
    static var longest: TimeInterval = 180
    static var direct: NWParameters {
        let parameters = NWParameters.tcp
        parameters.preferNoProxies = true
        return parameters
    }

    let store: PeerStore
    let name: String
    let port: UInt16
    let advertise: Bool
    let queue = DispatchQueue(label: "studio.assetboard.pairing")
    /// What this Mac answers a paired Mac with ({device, sessions}); read off the main thread.
    var answer: () -> [String: Any] = { [:] }
    /// This Mac's saved board, for a paired Mac this one syncs with; nil when there is none.
    var board: () -> [String: Any]? = { nil }
    /// Events for the page: {pairing:{…}}, {found:[…]}, {paired:{…}}; called on the main queue.
    var events: ([String: Any]) -> Void = { _ in }
    /// 网络记录: one entry per exchange (direction, peer name, address, ok, note); never the content.
    var log: (String, String, String, Bool, String) -> Void = { _, _, _, _, _ in }

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var found: [String: NWEndpoint] = [:]
    private var seen: [String: Date] = [:]
    /// Incoming connections being answered: past askWindow they are left to finish, up to `longest`.
    private var serving = Set<ObjectIdentifier>()

    /// The one pairing in progress, from either side.
    private final class Pending {
        let role: String
        let connection: NWConnection
        let once = Curve25519.KeyAgreement.PrivateKey()
        var name = "", publicKey = Data(), theirOnce = Data(), code = "", host = "", service = ""
        var key: SymmetricKey?
        var localOK: Bool?
        /// The answer of the Mac asked: start from the other board ('there') or merge both ('merge').
        var adopt = "there"
        var remoteConfirmed = false
        let deadline = Date().addingTimeInterval(DevicePairing.window)
        init(role: String, connection: NWConnection) { self.role = role; self.connection = connection }
    }
    private var pending: Pending?

    init(store: PeerStore, name: String, port: UInt16 = DevicePairing.defaultPort, advertise: Bool = true) {
        self.store = store; self.name = name; self.port = port; self.advertise = advertise
    }

    private func emit(_ event: [String: Any]) { DispatchQueue.main.async { self.events(event) } }
    var peerList: [[String: Any]] { store.peers.map { p in
        var out: [String: Any] = ["id": p.id, "name": p.name, "host": p.host, "pairedAt": p.pairedAt, "sync": p.sync == true, "syncDone": p.syncDone == true]
        if let first = p.syncFirst { out["syncFirst"] = first }
        if let since = p.syncSince { out["syncSince"] = since }
        return out
    } }

    // MARK: Listening and finding

    func start(ready: ((Bool) -> Void)? = nil) {
        queue.async {
            guard self.listener == nil, let port = NWEndpoint.Port(rawValue: self.port) else { ready?(self.listener != nil); return }
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            guard let listener = try? NWListener(using: parameters, on: port) else { ready?(false); return }
            if self.advertise { listener.service = NWListener.Service(name: self.name, type: DevicePairing.type) }
            listener.newConnectionHandler = { c in self.accept(c) }
            var told = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: if !told { told = true; ready?(true) }
                case .failed: if !told { told = true; ready?(false) }
                default: break
                }
            }
            listener.start(queue: self.queue)
            self.listener = listener
            if self.advertise { self.browse() }
        }
    }
    func stop() {
        queue.async {
            self.listener?.cancel(); self.listener = nil
            self.browser?.cancel(); self.browser = nil; self.found = [:]
            self.pending?.connection.cancel(); self.pending = nil
        }
    }
    private func browse() {
        let browser = NWBrowser(for: .bonjour(type: DevicePairing.type, domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self else { return }
            var next: [String: NWEndpoint] = [:]
            for r in results { if case let .service(name, _, _, _) = r.endpoint, name != self.name { next[name] = r.endpoint } }
            self.found = next
            self.emit(["found": next.keys.sorted()])
        }
        browser.start(queue: queue)
        self.browser = browser
    }
    /// A typed address: host, host:port, [v6]:port.
    static func endpoint(_ text: String, port: UInt16) -> NWEndpoint? {
        var host = text.trimmingCharacters(in: .whitespaces), p = port
        if host.hasPrefix("["), let close = host.firstIndex(of: "]") {
            let rest = host[host.index(after: close)...]
            if rest.hasPrefix(":"), let n = UInt16(rest.dropFirst()) { p = n }
            host = String(host[host.index(after: host.startIndex)..<close])
        } else if host.filter({ $0 == ":" }).count == 1, let colon = host.lastIndex(of: ":"), let n = UInt16(host[host.index(after: colon)...]) {
            p = n; host = String(host[..<colon])
        }
        guard !host.isEmpty, host.count <= 253, !host.contains("/"), !host.contains(" "), let port = NWEndpoint.Port(rawValue: p) else { return nil }
        return .hostPort(host: NWEndpoint.Host(host), port: port)
    }
    private func target(service: String, host: String) -> NWEndpoint? {
        if !service.isEmpty, let e = found[service] { return e }
        return DevicePairing.endpoint(host, port: port)
    }
    /// The other end of a connection as an address to reach it again: host, with the port when it is not the usual one.
    private static func address(_ c: NWConnection) -> String {
        guard case let .hostPort(host, port)? = c.currentPath?.remoteEndpoint else { return "" }
        let text = "\(host)", bare = text.split(separator: "%").first.map(String.init) ?? text
        guard port.rawValue != DevicePairing.defaultPort else { return bare }
        return bare.contains(":") ? "[\(bare)]:\(port.rawValue)" : "\(bare):\(port.rawValue)"
    }

    // MARK: Pairing

    /// Starts pairing with a found Mac (by its Bonjour name) or a typed address.
    func pair(service: String = "", host: String = "") {
        queue.async {
            guard self.pending == nil else { self.emit(["pairing": ["state": "busy"]]); return }
            guard let endpoint = self.target(service: service, host: host) else { self.emit(["pairing": ["state": "failed", "error": "address"]]); return }
            let c = NWConnection(to: endpoint, using: DevicePairing.direct)
            let p = Pending(role: "client", connection: c)
            p.host = host; p.service = service
            self.pending = p
            c.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    PeerWire.send(c, ["t": "hello", "name": self.name, "pub": self.store.publicKey.base64EncodedString(), "once": p.once.publicKey.rawRepresentation.base64EncodedString()])
                    PeerWire.receive(c) { reply in self.queue.async { self.clientHello(p, reply) } }
                case .failed, .waiting:
                    self.queue.async { self.fail(p, "unreachable") }
                default: break
                }
            }
            c.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + DevicePairing.window) { self.fail(p, "timeout") }
        }
    }
    private func clientHello(_ p: Pending, _ reply: [String: Any]?) {
        guard pending === p else { return }
        if reply?["t"] as? String == "busy" { fail(p, "busy"); return }
        guard reply?["t"] as? String == "hello", let pub = (reply?["pub"] as? String).flatMap({ Data(base64Encoded: $0) }), pub.count == 32,
              let once = (reply?["once"] as? String).flatMap({ Data(base64Encoded: $0) }), once.count == 32,
              let agreed = PeerCrypto.onceKey(p.once, once) else { fail(p, "refused"); return }
        p.name = String((reply?["name"] as? String ?? "Mac").prefix(100)); p.publicKey = pub; p.theirOnce = once; p.key = agreed.key
        p.code = PeerCrypto.code(client: store.publicKey, server: pub, clientOnce: p.once.publicKey.rawRepresentation, serverOnce: once, shared: agreed.shared)
        if p.host.isEmpty { p.host = DevicePairing.address(p.connection) }
        // The person who started the pairing has already said yes; the code is shown here to compare with the other screen,
        // where the one confirmation happens.
        p.localOK = true
        guard let key = p.key else { fail(p, "refused"); return }
        PeerWire.send(p.connection, ["t": "confirm", "mac": PeerCrypto.mac(key, "client")])
        emit(["pairing": ["state": "waiting", "role": "client", "code": p.code, "name": p.name]])
        PeerWire.receive(p.connection) { reply in
            self.queue.async {
                guard self.pending === p else { return }
                if reply?["t"] as? String == "confirm", reply?["mac"] as? String == PeerCrypto.mac(key, "server") { p.remoteConfirmed = true; self.settle(p) } else { self.fail(p, "declined") }
            }
        }
    }
    private func serverHello(_ c: NWConnection, _ hello: [String: Any]) {
        guard pending == nil else { PeerWire.send(c, ["t": "busy"]) { _ in c.cancel() }; return }
        guard let pub = (hello["pub"] as? String).flatMap({ Data(base64Encoded: $0) }), pub.count == 32, pub != store.publicKey,
              let once = (hello["once"] as? String).flatMap({ Data(base64Encoded: $0) }), once.count == 32 else { c.cancel(); return }
        let p = Pending(role: "server", connection: c)
        guard let agreed = PeerCrypto.onceKey(p.once, once) else { c.cancel(); return }
        p.name = String((hello["name"] as? String ?? "Mac").prefix(100)); p.publicKey = pub; p.theirOnce = once; p.key = agreed.key
        p.code = PeerCrypto.code(client: pub, server: store.publicKey, clientOnce: once, serverOnce: p.once.publicKey.rawRepresentation, shared: agreed.shared)
        // The client's source port is not where it listens: keep only its host.
        p.host = DevicePairing.address(c).replacingOccurrences(of: #":\d+$"#, with: "", options: .regularExpression).trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        pending = p
        PeerWire.send(c, ["t": "hello", "name": name, "pub": store.publicKey.base64EncodedString(), "once": p.once.publicKey.rawRepresentation.base64EncodedString()])
        emit(["pairing": ["state": "code", "role": "server", "code": p.code, "name": p.name]])
        PeerWire.receive(c) { [weak self] confirm in
            guard let self else { return }
            self.queue.async {
                guard self.pending === p, let key = p.key, confirm?["t"] as? String == "confirm", confirm?["mac"] as? String == PeerCrypto.mac(key, "client") else { self.fail(p, "refused"); return }
                p.remoteConfirmed = true
                self.settle(p)
            }
        }
        queue.asyncAfter(deadline: .now() + DevicePairing.window) { self.fail(p, "timeout") }
    }
    /// The answer of the person asked on this Mac (the one being paired with): allow or not. On the Mac that started it, false cancels.
    func confirm(_ ok: Bool, adopt: String = "there") {
        queue.async {
            guard let p = self.pending else { return }
            p.adopt = adopt == "merge" ? "merge" : "there"
            guard ok else {
                PeerWire.send(p.connection, ["t": "no"]) { _ in p.connection.cancel() }
                self.pending = nil; self.emit(["pairing": ["state": "cancelled"]]); return
            }
            guard p.role == "server" else { return }
            p.localOK = true
            if !p.remoteConfirmed { self.emit(["pairing": ["state": "waiting", "role": "server", "code": p.code, "name": p.name]]) }
            self.settle(p)
        }
    }
    private func settle(_ p: Pending) {
        guard pending === p, p.localOK == true, p.remoteConfirmed else { return }
        let peer = PeerStore.Peer(id: PeerCrypto.id(p.publicKey), name: p.name, publicKey: p.publicKey.base64EncodedString(), host: p.host,
                                  service: p.role == "client" ? p.service : p.name, pairedAt: ISO8601DateFormatter().string(from: Date()), sync: true,
                                  syncFirst: p.role == "client" ? "here" : p.adopt, syncSince: Date().timeIntervalSince1970 * 1000, syncDone: false)
        store.add(peer)
        if p.role == "server", let key = p.key { PeerWire.send(p.connection, ["t": "confirm", "mac": PeerCrypto.mac(key, "server")]) { _ in p.connection.cancel() } } else { p.connection.cancel() }
        pending = nil
        log(p.role == "client" ? "out" : "in", p.name, p.host, true, "pair")
        emit(["pairing": ["state": "paired", "role": p.role, "name": p.name, "id": peer.id], "peers": peerList])
    }
    private func fail(_ p: Pending, _ why: String) {
        guard pending === p else { return }
        p.connection.cancel(); pending = nil
        log(p.role == "client" ? "out" : "in", p.name.isEmpty ? p.host : p.name, p.host, false, "pair: \(why)")
        emit(["pairing": ["state": "failed", "error": why]])
    }
    /// Sends the page what it lists: paired Macs, Macs found on this network, whether this Mac listens.
    func list() { queue.async { self.emit(["peers": self.peerList, "found": self.found.keys.sorted(), "listening": self.listener != nil, "enabled": self.store.enabled]) } }
    func setSync(_ id: String, _ on: Bool, first: String? = nil, since: Double? = nil, done: Bool? = nil) { queue.async { self.store.setSync(id: id, on: on, first: first, since: since, done: done); self.emit(["peers": self.peerList]) } }
    func unpair(_ id: String) { queue.async { self.store.remove(id: id); self.emit(["peers": self.peerList]) } }

    // MARK: Reading

    private func accept(_ c: NWConnection) {
        c.start(queue: queue)
        PeerWire.receive(c) { [weak self] message in
            guard let self, let message else { c.cancel(); return }
            self.queue.async {
                switch message["t"] as? String {
                case "hello": self.serverHello(c, message)
                case "req": self.serve(c, message)
                default: c.cancel()
                }
            }
        }
        queue.asyncAfter(deadline: .now() + DevicePairing.askWindow) { if self.pending?.connection !== c, !self.serving.contains(ObjectIdentifier(c)) { c.cancel() } }
    }
    private func serve(_ c: NWConnection, _ message: [String: Any]) {
        let host = DevicePairing.address(c)
        guard let from = (message["from"] as? String).flatMap({ Data(base64Encoded: $0) }), let peer = store.peer(publicKey: from),
              let key = PeerCrypto.peerKey(store.identity, from), let ask = PeerCrypto.open(message["box"], key),
              let kind = ask["ask"] as? String, kind == "facts" || kind == "board", let nonce = ask["n"] as? String, nonce.count >= 16, nonce.count <= 64,
              let at = (ask["at"] as? String).flatMap({ ISO8601DateFormatter().date(from: $0) }), abs(at.timeIntervalSinceNow) <= DevicePairing.freshness else {
            log("in", "?", host, false, "refused"); c.cancel(); return
        }
        seen = seen.filter { $0.value.timeIntervalSinceNow > -2 * DevicePairing.freshness }
        guard seen[nonce] == nil else { log("in", peer.name, host, false, "replayed"); c.cancel(); return }
        seen[nonce] = Date()
        let tag = ObjectIdentifier(c)
        serving.insert(tag)
        queue.asyncAfter(deadline: .now() + DevicePairing.longest) { if self.serving.remove(tag) != nil { c.cancel() } }
        // The board only to a Mac this one syncs with.
        guard kind == "facts" || peer.sync == true else { log("in", peer.name, host, false, "board: not synced"); PeerWire.send(c, ["t": "res", "box": PeerCrypto.seal(["n": nonce, "error": "not-synced"], key) ?? ""]) { _ in c.cancel() }; return }
        DispatchQueue.global(qos: .utility).async {
            var facts: [String: Any] = kind == "board" ? (self.board().map { ["board": $0] } ?? ["error": "no-board"]) : self.answer()
            facts["n"] = nonce
            self.queue.async {
                guard let box = PeerCrypto.seal(facts, key) else { self.serving.remove(tag); c.cancel(); return }
                PeerWire.send(c, ["t": "res", "box": box]) { ok in self.queue.async { self.serving.remove(tag) }; c.cancel(); self.log("in", peer.name, host, ok, kind) }
            }
        }
    }
    /// Reads one paired Mac → done({ok, id, name, device?, sessions?, error?}) on the main queue.
    func read(_ id: String, kind: String = "facts", done: @escaping ([String: Any]) -> Void) {
        queue.async {
            let finish: ([String: Any]) -> Void = { r in DispatchQueue.main.async { done(r) } }
            guard let peer = self.store.peers.first(where: { $0.id == id }), let pub = Data(base64Encoded: peer.publicKey),
                  let key = PeerCrypto.peerKey(self.store.identity, pub) else { finish(["ok": false, "id": id, "error": "unknown"]); return }
            guard let endpoint = self.target(service: peer.service, host: peer.host) else { finish(["ok": false, "id": id, "name": peer.name, "error": "address"]); return }
            var nonceBytes = [UInt8](repeating: 0, count: 18)
            _ = SecRandomCopyBytes(kSecRandomDefault, nonceBytes.count, &nonceBytes)
            let nonce = Data(nonceBytes).base64EncodedString()
            guard let box = PeerCrypto.seal(["ask": kind, "at": ISO8601DateFormatter().string(from: Date()), "n": nonce], key) else { finish(["ok": false, "id": id, "error": "seal"]); return }
            let c = NWConnection(to: endpoint, using: DevicePairing.direct)
            var over = false, heard = Date()
            let started = heard
            let end: ([String: Any]) -> Void = { r in
                self.queue.async {
                    guard !over else { return }
                    over = true; c.cancel()
                    let address = DevicePairing.address(c)
                    self.log("out", peer.name, address.isEmpty ? peer.host : address, r["ok"] as? Bool == true, (r["error"] as? String).map { "\(kind): \($0)" } ?? kind)
                    if r["ok"] as? Bool == true, !address.isEmpty { self.store.remember(id: id, host: address) }
                    finish(r)
                }
            }
            c.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    PeerWire.send(c, ["t": "req", "from": self.store.publicKey.base64EncodedString(), "box": box])
                    PeerWire.receive(c, progress: { heard = Date() }) { reply in
                        guard reply?["t"] as? String == "res", var facts = PeerCrypto.open(reply?["box"], key), facts["n"] as? String == nonce else {
                            end(["ok": false, "id": id, "name": peer.name, "error": "refused"]); return
                        }
                        facts.removeValue(forKey: "n")
                        if let error = facts["error"] as? String { end(["ok": false, "id": id, "name": peer.name, "error": error]); return }
                        end(["ok": true, "id": id, "name": peer.name, "at": ISO8601DateFormatter().string(from: Date())].merging(facts) { a, _ in a })
                    }
                case .failed, .waiting: end(["ok": false, "id": id, "name": peer.name, "error": "unreachable"])
                default: break
                }
            }
            c.start(queue: self.queue)
            // Timed out only when nothing has arrived for `quiet` seconds, or the whole exchange passes `longest`.
            func watch() {
                self.queue.asyncAfter(deadline: .now() + 1) {
                    guard !over else { return }
                    if Date().timeIntervalSince(heard) >= DevicePairing.quiet || Date().timeIntervalSince(started) >= DevicePairing.longest {
                        end(["ok": false, "id": id, "name": peer.name, "error": "timeout"])
                    } else { watch() }
                }
            }
            watch()
        }
    }
}

/// The Macs in this Mac's tailnet, from the local Tailscale's own `status --json` (asked of the Tailscale app on this Mac, no
/// network request of ours), so the person picks one instead of copying its address. Only macOS peers, never this Mac; each
/// with its name, its Tailscale IPv4 to connect to, its MagicDNS name to show, and whether it is online. The pairing connects
/// to the 100.x address, not the name: a proxy such as Clash answers DNS itself with made-up addresses (fake-ip), so a MagicDNS
/// name reaches nothing on a Mac running one (seen 2026-11-20 with the Mac mini). Read when the person opens 其他设备; nothing is kept.
enum TailnetMacs {
    static let candidates = ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"]

    /// state: ok, none (no Tailscale on this Mac), stopped (installed but not connected), failed.
    static func read() -> [String: Any] {
        guard let path = LocalCLI.findExecutable(candidates) else { return ["state": "none", "macs": []] }
        guard let result = try? LocalCLI.run(executable: path, arguments: ["status", "--json"], timeout: 8), result.status == 0 else {
            return ["state": "stopped", "macs": []]
        }
        return parse(result.stdout).map { ["state": "ok", "macs": $0] } ?? ["state": "failed", "macs": []]
    }

    static func parse(_ text: String) -> [[String: Any]]? {
        guard let data = text.data(using: .utf8), let status = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        guard status["BackendState"] as? String == "Running" else { return [] }
        let selfIPs = Set(((status["Self"] as? [String: Any])?["TailscaleIPs"] as? [String]) ?? [])
        var macs: [[String: Any]] = []
        for case let peer as [String: Any] in (status["Peer"] as? [String: Any] ?? [:]).values {
            guard (peer["OS"] as? String)?.lowercased() == "macos" else { continue }
            let ips = (peer["TailscaleIPs"] as? [String]) ?? []
            if !selfIPs.isDisjoint(with: ips) { continue }
            let dnsName = (peer["DNSName"] as? String ?? "").trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
            let dns = dnsName.count <= 260 && dnsName.range(of: #"^[a-z0-9-]+(\.[a-z0-9-]+)+$"#, options: .regularExpression) != nil ? dnsName : ""
            let ip = ips.first { $0.range(of: #"^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$"#, options: .regularExpression) != nil } ?? ""
            let host = ip.isEmpty ? dns : ip
            guard !host.isEmpty else { continue }
            let name = String((peer["HostName"] as? String ?? host).trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
            macs.append(["name": name.isEmpty ? host : name, "host": host, "dns": dns, "online": peer["Online"] as? Bool == true])
        }
        macs.sort { a, b in
            let ao = a["online"] as? Bool == true, bo = b["online"] as? Bool == true
            return ao != bo ? ao : (a["name"] as? String ?? "").localizedStandardCompare(b["name"] as? String ?? "") == .orderedAscending
        }
        return Array(macs.prefix(50))
    }
}

/// 正在做 for another Mac: the tools' processes and the chain of parents above each, not every process on the machine.
func pruneSessions(_ reading: [String: Any]) -> [String: Any] {
    guard var processes = reading["processes"] as? [[String: Any]] else { return reading }
    let parent = Dictionary(processes.compactMap { p -> (Int, Int)? in guard let pid = p["pid"] as? Int else { return nil }; return (pid, p["ppid"] as? Int ?? 0) }, uniquingKeysWith: { a, _ in a })
    var keep = Set(processes.filter { $0["name"] != nil }.compactMap { $0["pid"] as? Int })
    for pid in Array(keep) { var at = parent[pid] ?? 0, i = 0; while at > 0, i < 64 { keep.insert(at); at = parent[at] ?? 0; i += 1 } }
    processes = processes.filter { keep.contains($0["pid"] as? Int ?? -1) }
    var out = reading; out["processes"] = processes
    return out
}

func testDevicePairing() {
    func waitFor(_ what: String, _ seconds: TimeInterval = 10, _ ok: () -> Bool) {
        let end = Date().addingTimeInterval(seconds)
        while !ok() { precondition(Date() < end, "pairing test timed out: \(what)"); RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    }
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    // The pure parts first.
    precondition(PeerCrypto.code(client: Data([1]), server: Data([2]), clientOnce: Data([3]), serverOnce: Data([4]), shared: Data([5])).count == 6)
    precondition(PeerCrypto.code(client: Data([1]), server: Data([2]), clientOnce: Data([3]), serverOnce: Data([4]), shared: Data([5]))
        != PeerCrypto.code(client: Data([1]), server: Data([9]), clientOnce: Data([3]), serverOnce: Data([4]), shared: Data([5])), "another key gives another code")
    if case let .hostPort(h, p)? = DevicePairing.endpoint("mini.example.ts.net:5000", port: 1) { precondition("\(h)" == "mini.example.ts.net" && p.rawValue == 5000) } else { preconditionFailure("host:port") }
    if case let .hostPort(h, p)? = DevicePairing.endpoint("[fd7a:115c::1]:6000", port: 1) { precondition("\(h)".hasPrefix("fd7a:115c::1") && p.rawValue == 6000) } else { preconditionFailure("[v6]:port") }
    if case let .hostPort(_, p)? = DevicePairing.endpoint("100.64.0.7", port: 47321) { precondition(p.rawValue == 47321) } else { preconditionFailure("plain host") }
    precondition(DevicePairing.direct.preferNoProxies, "peers are reached directly, not through the system proxy")
    precondition(DevicePairing.endpoint("a b", port: 1) == nil && DevicePairing.endpoint("", port: 1) == nil && DevicePairing.endpoint("x/y", port: 1) == nil)
    let pruned = pruneSessions(["ok": true, "processes": [["pid": 1, "ppid": 0], ["pid": 50, "ppid": 1], ["pid": 51, "ppid": 50, "name": "claude"], ["pid": 77, "ppid": 1]]])
    precondition((pruned["processes"] as? [[String: Any]])?.compactMap { $0["pid"] as? Int }.sorted() == [1, 50, 51], "only the tools and their parents")

    // Two Macs on this machine: pairing, both screens show one code, both confirm, then a read.
    let a = DevicePairing(store: try! PeerStore(directory: root.appendingPathComponent("a")), name: "mac-a", port: 47391, advertise: false)
    let b = DevicePairing(store: try! PeerStore(directory: root.appendingPathComponent("b")), name: "mac-b", port: 47392, advertise: false)
    b.answer = { ["device": ["ok": true, "hardwareId": "00000000000000b2", "model": "Mac14,3"]] }
    var aEvents: [[String: Any]] = [], bEvents: [[String: Any]] = []
    a.events = { aEvents.append($0) }; b.events = { bEvents.append($0) }
    var up = 0
    a.start { if $0 { up += 1 } }; b.start { if $0 { up += 1 } }
    waitFor("listeners") { up == 2 }
    let code: ([[String: Any]]) -> String? = { list in list.compactMap { ($0["pairing"] as? [String: Any]).flatMap { ["code", "waiting"].contains($0["state"] as? String ?? "") ? $0["code"] as? String : nil } }.last }
    a.pair(host: "127.0.0.1:47392")
    waitFor("codes") { code(aEvents) != nil && code(bEvents) != nil }
    precondition(code(aEvents) == code(bEvents), "both screens show the same code")
    waitFor("the starting side waits") { aEvents.contains { ($0["pairing"] as? [String: Any])?["state"] as? String == "waiting" } }
    precondition(a.store.peers.isEmpty && b.store.peers.isEmpty, "nothing is kept until the Mac asked allows it")
    b.confirm(true)
    let paired: ([[String: Any]]) -> Bool = { $0.contains { ($0["pairing"] as? [String: Any])?["state"] as? String == "paired" } }
    waitFor("paired") { paired(aEvents) && paired(bEvents) }
    precondition(a.store.peers.first?.name == "mac-b" && b.store.peers.first?.name == "mac-a" && a.store.peers.first?.id == b.store.id)
    precondition(a.store.peers.first?.sync == true && b.store.peers.first?.sync == true, "a pairing syncs from the start")
    precondition(a.store.peers.first?.syncFirst == "here" && b.store.peers.first?.syncFirst == "there" && b.store.peers.first?.syncDone == false, "the Mac that started keeps its board; the Mac asked takes it once")
    precondition(!a.store.enabled); a.store.enabled = true; precondition(try! PeerStore(directory: root.appendingPathComponent("a")).enabled, "on or off is kept across a restart")
    let reopened = try! PeerStore(directory: root.appendingPathComponent("a"))
    precondition(reopened.id == a.store.id && reopened.peers == a.store.peers, "the key and the pairing survive a restart")
    let mode = (try? FileManager.default.attributesOfItem(atPath: root.appendingPathComponent("a/identity.json").path)[.posixPermissions] as? Int) ?? 0
    precondition(mode == 0o600, "the private key file is 0600")
    var answer: [String: Any]?
    a.read(b.store.id) { answer = $0 }
    waitFor("read") { answer != nil }
    precondition(answer?["ok"] as? Bool == true && (answer?["device"] as? [String: Any])?["model"] as? String == "Mac14,3", "a reads b: \(answer ?? [:])")

    // The board: only to a Mac b syncs with (a pairing starts syncing; stopping it on b stops answering).
    b.board = { ["assets": [["id": "x1", "type": "domain", "name": "one.example.com"]], "blocks": [["id": "domain"]]] }
    b.setSync(a.store.id, false)
    waitFor("sync off") { b.store.peers.first?.sync == false }
    answer = nil
    a.read(b.store.id, kind: "board") { answer = $0 }
    waitFor("board refused") { answer != nil }
    precondition(answer?["ok"] as? Bool == false && answer?["error"] as? String == "not-synced", "no board before b syncs with a: \(answer ?? [:])")
    b.setSync(a.store.id, true)
    waitFor("sync on") { b.store.peers.first?.sync == true }
    answer = nil
    a.read(b.store.id, kind: "board") { answer = $0 }
    waitFor("board read") { answer != nil }
    precondition(((answer?["board"] as? [String: Any])?["assets"] as? [[String: Any]])?.first?["name"] as? String == "one.example.com", "a reads b's board once b syncs: \(answer ?? [:])")
    precondition(answer?["device"] == nil, "a board answer carries only the board")
    // A slow board (a Tailscale relay): one that takes longer than the ask window to come, and runs to megabytes, still arrives
    // whole; only a Mac that goes quiet for `quiet` seconds times out.
    let windows = (DevicePairing.askWindow, DevicePairing.quiet)
    DevicePairing.askWindow = 1; DevicePairing.quiet = 2.5
    let filler = String(repeating: "icon", count: 1 << 20)
    b.board = { Thread.sleep(forTimeInterval: 1.6); return ["assets": [["id": "x1", "type": "domain", "name": "slow.example.com", "notes": filler]], "blocks": [["id": "domain"]]] }
    answer = nil
    a.read(b.store.id, kind: "board") { answer = $0 }
    waitFor("slow board", 15) { answer != nil }
    precondition(((answer?["board"] as? [String: Any])?["assets"] as? [[String: Any]])?.first?["notes"] as? String == filler, "a board slower than the ask window arrives whole: \(answer?["error"] ?? "")")
    b.board = { Thread.sleep(forTimeInterval: 5); return ["assets": [], "blocks": []] }
    answer = nil
    let asked = Date()
    a.read(b.store.id, kind: "board") { answer = $0 }
    waitFor("quiet board", 10) { answer != nil }
    precondition(answer?["error"] as? String == "timeout" && Date().timeIntervalSince(asked) < 4.5, "a Mac that says nothing for `quiet` seconds times out: \(answer ?? [:])")
    (DevicePairing.askWindow, DevicePairing.quiet) = windows
    b.board = { ["assets": [["id": "x1", "type": "domain", "name": "one.example.com"]], "blocks": [["id": "domain"]]] }

    // Raw requests to b: from a key b never paired with, tampered, stale, and replayed — none is answered.
    func raw(_ frame: [String: Any]) -> [String: Any]? {
        var reply: [String: Any]?, done = false
        let c = NWConnection(to: DevicePairing.endpoint("127.0.0.1:47392", port: 0)!, using: DevicePairing.direct)
        c.stateUpdateHandler = { if case .ready = $0 { PeerWire.send(c, frame); PeerWire.receive(c) { reply = $0; done = true; c.cancel() } } }
        c.start(queue: .global())
        waitFor("raw reply") { done }
        return reply
    }
    let stranger = try! PeerStore(directory: root.appendingPathComponent("c"))
    let ask: (PeerStore, Date, String) -> [String: Any] = { s, at, n in
        ["t": "req", "from": s.publicKey.base64EncodedString(), "box": PeerCrypto.seal(["ask": "facts", "at": ISO8601DateFormatter().string(from: at), "n": n], PeerCrypto.peerKey(s.identity, b.store.publicKey)!)!]
    }
    precondition(raw(ask(stranger, Date(), "nonce-stranger-0001")) == nil, "an unpaired key gets no answer")
    precondition(raw(ask(a.store, Date().addingTimeInterval(-300), "nonce-stale-00000001")) == nil, "a stale request gets no answer")
    var tampered = ask(a.store, Date(), "nonce-tampered-0001"); tampered["box"] = String((tampered["box"] as! String).reversed())
    precondition(raw(tampered) == nil, "a tampered request gets no answer")
    let once = ask(a.store, Date(), "nonce-replayed-0001")
    precondition(raw(once)?["t"] as? String == "res", "a fresh request is answered")
    precondition(raw(once) == nil, "the same request again gets no answer")

    // A declined pairing keeps nothing; unpairing forgets the key.
    let c = DevicePairing(store: stranger, name: "mac-c", port: 47393, advertise: false)
    var cEvents: [[String: Any]] = []; c.events = { cEvents.append($0) }
    bEvents = []
    c.pair(host: "127.0.0.1:47392")
    waitFor("second codes") { code(cEvents) != nil && code(bEvents) != nil }
    b.confirm(false)
    waitFor("declined") { cEvents.contains { ($0["pairing"] as? [String: Any])?["state"] as? String == "failed" } }
    precondition(stranger.peers.isEmpty && b.store.peers.count == 1, "a declined pairing keeps nothing")
    b.unpair(a.store.id)
    waitFor("unpaired") { b.store.peers.isEmpty }
    answer = nil
    a.read(b.store.id) { answer = $0 }
    waitFor("read after unpairing") { answer != nil }
    precondition(answer?["ok"] as? Bool == false, "after unpairing nothing is answered")
    a.stop(); b.stop(); c.stop()

    // Tailscale's status: the other Macs only (not this one, not Linux), online first, by MagicDNS name or else the 100.x address.
    let tailnet = """
    {"BackendState":"Running","Self":{"HostName":"This Mac","OS":"macOS","DNSName":"this-mac.tail0.ts.net.","TailscaleIPs":["100.64.0.1","fd7a::1"]},
     "Peer":{"k1":{"HostName":"Studio","OS":"macOS","DNSName":"studio.tail0.ts.net.","TailscaleIPs":["100.64.0.9"],"Online":false},
             "k2":{"HostName":"mac-mini","OS":"macOS","DNSName":"mac-mini.tail0.ts.net.","TailscaleIPs":["100.64.0.7"],"Online":true},
             "k3":{"HostName":"nas","OS":"linux","DNSName":"nas.tail0.ts.net.","TailscaleIPs":["100.64.0.3"],"Online":true},
             "k4":{"HostName":"no-dns","OS":"macOS","DNSName":"","TailscaleIPs":["fd7a::4","100.64.0.4"],"Online":true},
             "k5":{"HostName":"odd","OS":"macOS","DNSName":"bad name;rm","TailscaleIPs":["fd7a::5"],"Online":true}}}
    """
    let macs = TailnetMacs.parse(tailnet) ?? []
    precondition(macs.map { $0["host"] as? String ?? "" } == ["100.64.0.7", "100.64.0.4", "100.64.0.9"], "tailnet Macs are reached by their 100.x address: \(macs)")
    precondition(macs.map { $0["dns"] as? String ?? "" } == ["mac-mini.tail0.ts.net", "", "studio.tail0.ts.net"], "and shown by their MagicDNS name")
    precondition(macs.first?["name"] as? String == "mac-mini" && macs.first?["online"] as? Bool == true && macs.last?["online"] as? Bool == false)
    precondition(TailnetMacs.parse("{\"BackendState\":\"Stopped\",\"Peer\":{}}")?.isEmpty == true && TailnetMacs.parse("not json") == nil, "stopped or unreadable")
    print("PASS: device pairing: board only to a Mac that syncs, one code on both screens, one confirmation on the Mac asked, syncing from the start, key 0600 and kept across restarts, sealed read; unpaired, tampered, stale and replayed requests unanswered; declined pairing and unpairing; the tailnet's other Macs from Tailscale's status, reached by their 100.x address")
}
