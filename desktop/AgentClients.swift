import Foundation

/// The MCP clients on this Mac and whether each has Assetboard set up, from the client's own config files (设置 › MCP). The files
/// are only read, never written, and nothing of their content leaves this type: other servers in them can carry tokens, so the page
/// gets the client id, the file it looked at (as ~/…), whether the file is there and whether it names Assetboard.
enum AgentClients {
    struct Place {
        let id: String
        /// Relative to the home folder; the first that exists is the one shown.
        let paths: [String]
    }

    static let places: [Place] = [
        Place(id: "claude-code", paths: [".claude.json", ".claude/settings.json"]),
        Place(id: "claude-desktop", paths: ["Library/Application Support/Claude/claude_desktop_config.json"]),
        Place(id: "codex", paths: [".codex/config.toml"]),
        Place(id: "cursor", paths: [".cursor/mcp.json"]),
        Place(id: "windsurf", paths: [".codeium/windsurf/mcp_config.json"]),
        Place(id: "vscode", paths: ["Library/Application Support/Code/User/mcp.json", "Library/Application Support/Code/User/settings.json"]),
        Place(id: "zed", paths: [".config/zed/settings.json"]),
        Place(id: "gemini", paths: [".gemini/settings.json"]),
        Place(id: "grok", paths: [".grok/user-settings.json", ".grok/settings.json"]),
        Place(id: "cline", paths: ["Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"]),
    ]
    /// ~/.claude.json keeps every project's history and can grow to megabytes; a larger file is not read.
    static let maxBytes = 8 * 1024 * 1024

    /// Whether a config file sets up Assetboard: the command (assetboard-cli, wherever the app is) or a server named assetboard
    /// (a JSON key "assetboard", or TOML's [mcp_servers.assetboard]).
    static func mentionsAssetboard(_ text: String) -> Bool {
        if text.contains("assetboard-cli") { return true }
        return text.range(of: #"(\"assetboard\"\s*:|\[mcp_servers\.assetboard\])"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func scan(home: URL = FileManager.default.homeDirectoryForCurrentUser) -> [[String: Any]] {
        let manager = FileManager.default
        return places.map { place in
            let existing = place.paths.filter { manager.isReadableFile(atPath: home.appendingPathComponent($0).path) }
            let naming = existing.first { path in
                let url = home.appendingPathComponent(path)
                guard let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= maxBytes,
                      let data = try? Data(contentsOf: url) else { return false }
                return mentionsAssetboard(String(decoding: data, as: UTF8.self))
            }
            let shown = naming ?? existing.first ?? place.paths[0]
            return ["id": place.id, "path": "~/" + shown, "found": !existing.isEmpty, "configured": naming != nil]
        }
    }
}

/// What assetboard-cli can tell about the program that started it, for 操作记录: the names of its parent programs (the file name only,
/// or the package name for a script run by node, never a folder that could hold a user name) and which of a few environment variables
/// that MCP clients set are present (names only, never values). The page turns this into a client (agentClientOf in asset-data.js).
enum ClientSignals {
    static let environmentNames = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CODEX_SANDBOX", "CODEX_MANAGED_BY_NPM", "CURSOR_TRACE_ID", "GEMINI_CLI"]
    static let runners: Set<String> = ["node", "bun", "deno", "python", "python3", "npx", "uv", "uvx", "sh", "bash", "zsh", "env"]

    static var current: [String: Any] {
        let environment = ProcessInfo.processInfo.environment
        return ["processes": ancestors(), "env": environmentNames.filter { environment[$0] != nil }]
    }

    /// The nearest parents first, at most six programs.
    static func ancestors() -> [String] {
        var names: [String] = []
        var pid = getppid()
        var steps = 0
        while pid > 1, steps < 6, names.count < 6 {
            steps += 1
            guard let (command, parent) = process(pid) else { break }
            let args = arguments(pid)
            var name = args.first.map(programName) ?? command
            if name.isEmpty { name = command }
            // A script runner names the script instead: node …/node_modules/@scope/package/cli.js → package.
            if runners.contains(name.lowercased()), args.count > 1 { let script = programName(args[1]); if !script.isEmpty { name = script } }
            if !name.isEmpty, names.last != name { names.append(String(name.prefix(60))) }
            pid = parent
        }
        return names
    }

    /// A program's name from its path: the package after the last node_modules for a script inside one, else the file name without
    /// its extension. Nothing else of the path is kept.
    static func programName(_ path: String) -> String {
        let parts = path.split(separator: "/").map(String.init)
        if let index = parts.lastIndex(of: "node_modules"), index + 1 < parts.count {
            let next = parts[index + 1]
            if next.hasPrefix("@"), index + 2 < parts.count { return parts[index + 2] }
            return next
        }
        let file = parts.last ?? path
        if let dot = file.lastIndex(of: "."), dot != file.startIndex, ["js", "mjs", "cjs", "py", "sh"].contains(String(file[file.index(after: dot)...])) { return String(file[..<dot]) }
        return file
    }

    static func process(_ pid: pid_t) -> (String, pid_t)? {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return nil }
        var name = info.kp_proc.p_comm
        let capacity = MemoryLayout.size(ofValue: name)
        let command = withUnsafePointer(to: &name) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: capacity) { String(cString: $0) }
        }
        return (command, info.kp_eproc.e_ppid)
    }

    /// argv of a process of this user (KERN_PROCARGS2: argc, the executable path, padding, then the arguments).
    static func arguments(_ pid: pid_t) -> [String] {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return [] }
        var buffer = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0 else { return [] }
        let argc = buffer.withUnsafeBytes { $0.load(as: Int32.self) }
        var index = MemoryLayout<Int32>.size
        while index < size, buffer[index] != 0 { index += 1 }
        while index < size, buffer[index] == 0 { index += 1 }
        var args: [String] = []
        while index < size, args.count < min(Int(argc), 2) {
            let start = index
            while index < size, buffer[index] != 0 { index += 1 }
            args.append(String(decoding: buffer[start..<index], as: UTF8.self))
            index += 1
        }
        return args
    }

    /// The client part of a call as the app accepts it: short plain strings, a few of them. Anything else is dropped.
    static func sanitized(_ value: Any?) -> [String: Any] {
        guard let raw = value as? [String: Any] else { return [:] }
        func text(_ value: Any?, _ limit: Int) -> String? {
            guard let string = value as? String else { return nil }
            let clean = String(String.UnicodeScalarView(string.unicodeScalars.filter { $0.value >= 32 && $0.value != 127 })).trimmingCharacters(in: .whitespaces)
            return clean.isEmpty ? nil : String(clean.prefix(limit))
        }
        var out: [String: Any] = [:]
        for key in ["name", "title", "version"] { if let value = text(raw[key], 60) { out[key] = value } }
        if let list = raw["processes"] as? [Any] { out["processes"] = list.prefix(6).compactMap { text($0, 60) } }
        if let list = raw["env"] as? [Any] { out["env"] = list.prefix(10).compactMap { text($0, 40) } }
        return out
    }
}
