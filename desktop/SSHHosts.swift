import Foundation

#if !ASSETBOARD_FREE

/// The SSH hosts Assetboard writes for the person: one block per server record that asked for it (sshManaged on the record),
/// in its own file ~/.ssh/assetboard.conf, which one `Include assetboard.conf` line at the top of ~/.ssh/config brings in. The
/// person's own config is never edited beyond that one line; blocks are found again by their `# assetboard:<id>` marker, so a
/// record's block is replaced when it changes and removed when the record goes. `ssh <alias>` then works in Terminal too.
enum SSHHosts {
    static let fileName = "assetboard.conf"
    static let includeLine = "Include assetboard.conf"
    static let marker = "# assetboard:"
    static let limit = 64

    struct Entry: Equatable {
        let id: String
        let alias: String
        let host: String
        let user: String
        let port: String
        var json: [String: Any] { ["id": id, "alias": alias, "host": host, "user": user, "port": port] }
    }

    // What ssh_config takes without surprises: no spaces, quotes or newlines, nothing that starts with "-"; a port in range.
    static func validId(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$", options: .regularExpression) != nil }
    static func validHost(_ s: String) -> Bool { s.range(of: "^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$", options: .regularExpression) != nil }
    static func validUser(_ s: String) -> Bool { s.isEmpty || s.range(of: "^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$", options: .regularExpression) != nil }
    static func validPort(_ s: String) -> Bool { s.range(of: "^[0-9]{1,5}$", options: .regularExpression) != nil && (1...65535).contains(Int(s) ?? 0) }
    static func valid(_ e: Entry) -> Bool { validId(e.id) && SSHProbe.validAlias(e.alias) && validHost(e.host) && validUser(e.user) && validPort(e.port) }

    static func render(_ entries: [Entry]) -> String {
        var out = "# Written by Assetboard for the servers that asked for it; edit those records in the app instead of this file.\n"
        for e in entries {
            out += "\n\(marker)\(e.id)\nHost \(e.alias)\n  HostName \(e.host)\n"
            if !e.user.isEmpty { out += "  User \(e.user)\n" }
            if e.port != "22" { out += "  Port \(e.port)\n" }
        }
        return out
    }

    /// Reads the blocks back; anything not in the shape written here is dropped (the file is Assetboard's to rewrite).
    static func parse(_ text: String) -> [Entry] {
        var entries: [Entry] = []
        var id: String? = nil, alias = "", host = "", user = "", port = "22"
        func flush() {
            if let id, !alias.isEmpty, !host.isEmpty {
                let e = Entry(id: id, alias: alias, host: host, user: user, port: port)
                if valid(e), !entries.contains(where: { $0.id == id }) { entries.append(e) }
            }
            id = nil; alias = ""; host = ""; user = ""; port = "22"
        }
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix(marker) { flush(); id = String(line.dropFirst(marker.count)).trimmingCharacters(in: .whitespaces); continue }
            guard id != nil else { continue }
            let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else { continue }
            let value = parts[1].trimmingCharacters(in: .whitespaces)
            switch parts[0].lowercased() {
            case "host": alias = value
            case "hostname": host = value
            case "user": user = value
            case "port": port = value
            default: break
            }
        }
        flush()
        return entries
    }

    static func hasInclude(_ config: String) -> Bool {
        config.components(separatedBy: .newlines).contains { line in
            let t = line.trimmingCharacters(in: .whitespaces).lowercased()
            return t == includeLine.lowercased() || t == "include ~/.ssh/\(fileName)" || t.hasPrefix("include ") && t.split(separator: " ").dropFirst().contains(where: { $0 == fileName || $0 == "~/.ssh/\(fileName)" })
        }
    }

    /// The file and the include line, under one ~/.ssh directory (a temporary one in the self-test).
    struct Store {
        let directory: URL
        init(directory: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".ssh", isDirectory: true)) { self.directory = directory }
        var file: URL { directory.appendingPathComponent(SSHHosts.fileName) }
        var config: URL { directory.appendingPathComponent("config") }

        func list() -> [Entry] {
            guard let data = try? Data(contentsOf: file), data.count <= 256 * 1024, let text = String(data: data, encoding: .utf8) else { return [] }
            return SSHHosts.parse(text)
        }

        func set(_ entry: Entry) throws {
            guard SSHHosts.valid(entry) else { throw LocalCLI.error(L("主机条目无效")) }
            var entries = list().filter { $0.id != entry.id }
            if entries.contains(where: { $0.alias.lowercased() == entry.alias.lowercased() }) { throw LocalCLI.error(L("别名 {alias} 已被另一条记录使用", ["alias": entry.alias])) }
            guard entries.count < SSHHosts.limit else { throw LocalCLI.error(L("最多写 {n} 台", ["n": SSHHosts.limit])) }
            entries.append(entry)
            try write(entries)
            try ensureInclude()
        }

        func remove(id: String) throws {
            let entries = list()
            guard entries.contains(where: { $0.id == id }) else { return }
            try write(entries.filter { $0.id != id })
        }

        private func write(_ entries: [Entry]) throws {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try Data(SSHHosts.render(entries).utf8).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        }

        /// One line at the top of ~/.ssh/config; the rest of the file is kept byte for byte. A missing config is created.
        func ensureInclude() throws {
            var text = ""
            if let data = try? Data(contentsOf: config) {
                guard let s = String(data: data, encoding: .utf8) else { throw LocalCLI.error(L("无法以 UTF-8 读取 ~/.ssh/config")) }
                text = s
            }
            if SSHHosts.hasInclude(text) { return }
            let existed = FileManager.default.fileExists(atPath: config.path)
            let out = SSHHosts.includeLine + "\n" + (text.isEmpty || text.hasPrefix("\n") ? text : "\n" + text)
            try Data(out.utf8).write(to: config, options: .atomic)
            if !existed { try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: config.path) }
        }
    }
}

let sshHosts = SSHHosts.Store()

func testSSHHosts() {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-ssh-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = SSHHosts.Store(directory: dir)
    let tokyo = SSHHosts.Entry(id: "s1", alias: "tokyo-vps", host: "203.0.113.10", user: "deploy", port: "2222")
    precondition(store.list().isEmpty, "nothing before the first write")
    try! store.set(tokyo)
    let written = try! String(contentsOf: store.file, encoding: .utf8)
    precondition(written.contains("# assetboard:s1\nHost tokyo-vps\n  HostName 203.0.113.10\n  User deploy\n  Port 2222\n"), "the block as ssh reads it:\n\(written)")
    precondition(store.list() == [tokyo], "read back")
    let config = try! String(contentsOf: store.config, encoding: .utf8)
    precondition(config == "Include assetboard.conf\n", "a missing config gets the one line: \(config)")
    let perms = (try! FileManager.default.attributesOfItem(atPath: store.file.path))[.posixPermissions] as! Int
    precondition(perms == 0o600, "0600, as ssh wants: \(String(perms, radix: 8))")

    // The person's config keeps every byte; the line is added once, and recognised in its other spellings.
    try! "Host *\n  ServerAliveInterval 30\n".write(to: store.config, atomically: true, encoding: .utf8)
    try! store.ensureInclude()
    precondition(try! String(contentsOf: store.config, encoding: .utf8) == "Include assetboard.conf\n\nHost *\n  ServerAliveInterval 30\n")
    try! store.ensureInclude()
    precondition(try! String(contentsOf: store.config, encoding: .utf8).components(separatedBy: "Include").count == 2, "added once")
    precondition(SSHHosts.hasInclude("  include ~/.ssh/assetboard.conf\n") && SSHHosts.hasInclude("Include other.conf assetboard.conf") && !SSHHosts.hasInclude("Include assetboard.conf.bak"))

    // A record's block is replaced, another appended, one removed; the include line stays.
    try! store.set(SSHHosts.Entry(id: "s1", alias: "tokyo", host: "203.0.113.11", user: "", port: "22"))
    try! store.set(SSHHosts.Entry(id: "s2", alias: "lab", host: "lab.example.net", user: "pi", port: "22"))
    precondition(store.list().map(\.alias) == ["tokyo", "lab"] && store.list()[0].user == "" && store.list()[0].port == "22", "\(store.list())")
    precondition(!(try! String(contentsOf: store.file, encoding: .utf8)).contains("Port 22"), "the default port is not written")
    try! store.remove(id: "s1")
    precondition(store.list().map(\.id) == ["s2"]); try! store.remove(id: "ghost")
    precondition(try! String(contentsOf: store.config, encoding: .utf8).hasPrefix("Include assetboard.conf\n"))

    // Nothing that could change what ssh does: options, spaces, newlines, a second record with the same alias.
    for bad in [SSHHosts.Entry(id: "s3", alias: "-oProxyCommand=x", host: "h", user: "", port: "22"),
                SSHHosts.Entry(id: "s3", alias: "ok", host: "h\n  ProxyCommand x", user: "", port: "22"),
                SSHHosts.Entry(id: "s3", alias: "ok", host: "-h", user: "", port: "22"),
                SSHHosts.Entry(id: "s3", alias: "ok", host: "h", user: "a b", port: "22"),
                SSHHosts.Entry(id: "s3", alias: "ok", host: "h", user: "", port: "70000"),
                SSHHosts.Entry(id: "s3", alias: "ok", host: "h", user: "", port: "0"),
                SSHHosts.Entry(id: "s 3", alias: "ok", host: "h", user: "", port: "22"),
                SSHHosts.Entry(id: "s3", alias: "LAB", host: "h", user: "", port: "22")] {
        precondition((try? store.set(bad)) == nil, "refused: \(bad)")
    }
    precondition(store.list().map(\.id) == ["s2"], "a refused write changes nothing")
    // A hand-edited file: only well-formed blocks with the marker come back.
    try! "Host sneaky\n  HostName x\n# assetboard:s5\nHost fine\n  HostName fine.example.net\n  ProxyCommand nc x\n".write(to: store.file, atomically: true, encoding: .utf8)
    precondition(store.list() == [SSHHosts.Entry(id: "s5", alias: "fine", host: "fine.example.net", user: "", port: "22")], "\(store.list())")
    print("PASS: SSH hosts: blocks written and read back, the include line once, 0600, refused values, removal")
}
#endif
