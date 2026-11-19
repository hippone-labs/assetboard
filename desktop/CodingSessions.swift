import Foundation
import Darwin

/// 正在做: the plain facts about the AI coding tools running on this Mac, for the page to turn into sessions (coding-sessions.js
/// holds every rule: which process is a tool, which is a session, what is busy). This side only collects, with calls that ask for
/// no permission: the process table through libproc (pid, parent, name, executable path, working directory, start time), the
/// first line of `.git/HEAD` above a working directory, and the times of the tools' session files.
///
/// Never read: a process's arguments or environment (a prompt can be typed on the command line), and the contents of a session
/// file. Never touched: folders macOS guards with a prompt (Desktop, Documents, Downloads, iCloud and other cloud folders, other
/// volumes); a session working there keeps its folder's name and has no branch.
enum CodingSessions {
    /// A process is passed on with its details only when its name or executable path carries one of these; all others give just
    /// pid and parent. Wider than the page's rules on purpose: the page decides.
    static let hints = ["claude", "codex", "cursor", "opencode", "gemini", "copilot", "grok"]
    static let detailLimit = 400
    static let directoryLimit = 60
    static let fileLimit = 400
    static let visitLimit = 6000
    static let recent: TimeInterval = 24 * 3600

    struct Process {
        let pid: Int32
        let ppid: Int32
        let name: String
        let start: Double
    }

    static func mayBeTool(name: String, path: String) -> Bool {
        if path.contains(".app/Contents/Frameworks/") { return false }
        let text = (name + "\n" + path).lowercased()
        return hints.contains { text.contains($0) }
    }

    /// Folders that macOS asks about before an app may read them.
    static func guarded(_ path: String, home: String) -> Bool {
        if path.hasPrefix("/Volumes/") || path.hasPrefix("/Network/") { return true }
        let inHome = ["Desktop", "Documents", "Downloads", "Library", "Pictures", "Movies", "Music", ".Trash"]
        return inHome.contains { path == "\(home)/\($0)" || path.hasPrefix("\(home)/\($0)/") }
    }

    /// The folder above `directory` that holds `.git`, where its HEAD lives, and HEAD's first line. `read` gives a file's text
    /// and `exists` says what is at a path (nil: nothing, true: a folder, false: a file), so the test runs without a disk.
    static func repository(above directory: String, read: (String) -> String?, exists: (String) -> Bool?) -> [String: String]? {
        var at = directory
        for _ in 0..<40 {
            let dotGit = at == "/" ? "/.git" : at + "/.git"
            if let folder = exists(dotGit) {
                var gitdir = dotGit
                if !folder {
                    guard let line = read(dotGit)?.split(whereSeparator: \.isNewline).first, line.hasPrefix("gitdir:") else { return nil }
                    let target = line.dropFirst("gitdir:".count).trimmingCharacters(in: .whitespaces)
                    gitdir = target.hasPrefix("/") ? target : (at as NSString).appendingPathComponent(target)
                    gitdir = (gitdir as NSString).standardizingPath
                }
                guard let head = read(gitdir + "/HEAD")?.split(whereSeparator: \.isNewline).first else { return nil }
                return ["root": at, "gitdir": gitdir, "head": String(head.prefix(300))]
            }
            if at == "/" { return nil }
            at = (at as NSString).deletingLastPathComponent
            if at.isEmpty { return nil }
        }
        return nil
    }

    /// The session files under `root` written in the last day: each one's folder name and its times, newest first. Names of the
    /// files themselves are not kept, and none is opened.
    static func recentFiles(under root: URL, depth: Int, now: Date = Date(), manager: FileManager = .default) -> [[String: Any]] {
        let keys: [URLResourceKey] = [.isRegularFileKey, .contentModificationDateKey, .creationDateKey]
        guard let walk = manager.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { return [] }
        var found: [(String, Double, Double)] = []
        var visited = 0
        for case let url as URL in walk {
            visited += 1
            if visited > visitLimit { break }
            if walk.level >= depth { walk.skipDescendants() }
            guard url.pathExtension == "jsonl", let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                  let modified = values.contentModificationDate, now.timeIntervalSince(modified) <= recent else { continue }
            found.append((url.deletingLastPathComponent().lastPathComponent, modified.timeIntervalSince1970, (values.creationDate ?? modified).timeIntervalSince1970))
        }
        return found.sorted { $0.1 > $1.1 }.prefix(fileLimit).map { ["dir": $0.0, "mtime": $0.1.rounded(), "birth": $0.2.rounded()] }
    }

    // MARK: The process table (libproc)

    static func pids() -> [Int32] {
        let count = proc_listallpids(nil, 0)
        guard count > 0 else { return [] }
        var list = [Int32](repeating: 0, count: Int(count) + 64)
        let got = proc_listallpids(&list, Int32(list.count * MemoryLayout<Int32>.stride))
        return got > 0 ? Array(list.prefix(Int(got))).filter { $0 > 0 } : []
    }

    static func process(_ pid: Int32) -> Process? {
        var info = proc_bsdinfo()
        let size = Int32(MemoryLayout<proc_bsdinfo>.stride)
        guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size else { return nil }
        let name = withUnsafeBytes(of: &info.pbi_name) { raw in String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self) }
        let short = withUnsafeBytes(of: &info.pbi_comm) { raw in String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self) }
        return Process(pid: pid, ppid: Int32(bitPattern: info.pbi_ppid), name: name.isEmpty ? short : name,
                       start: Double(info.pbi_start_tvsec))
    }

    static func executablePath(_ pid: Int32) -> String {
        var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        return length > 0 ? String(cString: buffer) : ""
    }

    static func workingDirectory(_ pid: Int32) -> String {
        var info = proc_vnodepathinfo()
        let size = Int32(MemoryLayout<proc_vnodepathinfo>.stride)
        guard proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0, &info, size) == size else { return "" }
        return withUnsafeBytes(of: &info.pvi_cdir.vip_path) { raw in String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self) }
    }

    /// One reading of this Mac, in the shape coding-sessions.js parses.
    static func read(home: String = NSHomeDirectory(), manager: FileManager = .default) -> [String: Any] {
        let own = getpid()
        var processes: [[String: Any]] = []
        var directories: [String] = []
        var details = 0
        var seen = Set<String>()
        for pid in pids() where pid != own {
            guard let p = process(pid) else { continue }
            var entry: [String: Any] = ["pid": Int(p.pid), "ppid": Int(p.ppid)]
            let path = executablePath(pid)
            if details < detailLimit, mayBeTool(name: p.name, path: path) {
                details += 1
                let cwd = workingDirectory(pid)
                entry["name"] = p.name; entry["path"] = path; entry["cwd"] = cwd; entry["start"] = p.start
                seen.insert((p.name + "\n" + path).lowercased())
                if !cwd.isEmpty, !directories.contains(cwd), directories.count < directoryLimit { directories.append(cwd) }
            }
            processes.append(entry)
        }
        var repos: [String: Any] = [:]
        for cwd in directories where cwd != "/" && cwd != home && !guarded(cwd, home: home) {
            let found = repository(above: cwd, read: { path in
                guard !guarded(path, home: home), let handle = FileHandle(forReadingAtPath: path) else { return nil }
                defer { try? handle.close() }
                return String(data: handle.readData(ofLength: 512), encoding: .utf8)
            }, exists: { path in
                var folder: ObjCBool = false
                return manager.fileExists(atPath: path, isDirectory: &folder) ? folder.boolValue : nil
            })
            if let found { repos[cwd] = found }
        }
        // Session files are looked at only for a tool that may be running.
        var files: [String: Any] = [:]
        if seen.contains(where: { $0.contains("claude") }) {
            files["claude"] = recentFiles(under: URL(fileURLWithPath: home + "/.claude/projects"), depth: 2, manager: manager)
        }
        if seen.contains(where: { $0.contains("codex") }) {
            files["codex"] = recentFiles(under: URL(fileURLWithPath: home + "/.codex/sessions"), depth: 4, manager: manager)
        }
        return ["ok": true, "at": ISO8601DateFormatter().string(from: Date()), "home": home, "processes": processes, "repos": repos, "files": files]
    }
}

/// 正在做: which processes get their details, which folders are left alone, HEAD found through a folder and through a linked
/// worktree's `.git` file, session files listed by time without their names, and a real reading of this machine's process table
/// that holds this test's own parent and no arguments.
func testCodingSessions() {
    precondition(CodingSessions.mayBeTool(name: "2.1.40", path: "/Users/demo/.local/share/claude/versions/2.1.40"))
    precondition(CodingSessions.mayBeTool(name: "codex", path: "/opt/homebrew/bin/codex"))
    precondition(!CodingSessions.mayBeTool(name: "zsh", path: "/bin/zsh"))
    precondition(!CodingSessions.mayBeTool(name: "Cursor Helper", path: "/Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper"))
    let home = "/Users/demo"
    precondition(CodingSessions.guarded("/Users/demo/Documents/site", home: home) && CodingSessions.guarded("/Volumes/disk/x", home: home)
        && CodingSessions.guarded("/Users/demo/Library/Mobile Documents/x", home: home))
    precondition(!CodingSessions.guarded("/Users/demo/projects/site", home: home) && !CodingSessions.guarded("/Users/demo/Documents-old", home: home))

    let texts = ["/Users/demo/projects/api/.git/HEAD": "ref: refs/heads/main\n",
                 "/Users/demo/projects/api-fix/.git": "gitdir: /Users/demo/projects/api/.git/worktrees/api-fix\n",
                 "/Users/demo/projects/api/.git/worktrees/api-fix/HEAD": "ref: refs/heads/fix/retry\n",
                 "/Users/demo/projects/rel/.git": "gitdir: ../api/.git/worktrees/rel\n",
                 "/Users/demo/projects/api/.git/worktrees/rel/HEAD": "0123456789abcdef0123456789abcdef01234567\n"]
    let folders: Set<String> = ["/Users/demo/projects/api/.git"]
    let read: (String) -> String? = { texts[$0] }
    let exists: (String) -> Bool? = { folders.contains($0) ? true : texts[$0] != nil ? false : nil }
    let plain = CodingSessions.repository(above: "/Users/demo/projects/api/src/lib", read: read, exists: exists)
    precondition(plain?["root"] == "/Users/demo/projects/api" && plain?["head"] == "ref: refs/heads/main" && plain?["gitdir"] == "/Users/demo/projects/api/.git")
    let linked = CodingSessions.repository(above: "/Users/demo/projects/api-fix", read: read, exists: exists)
    precondition(linked?["root"] == "/Users/demo/projects/api-fix" && linked?["head"] == "ref: refs/heads/fix/retry"
        && linked?["gitdir"] == "/Users/demo/projects/api/.git/worktrees/api-fix")
    let relative = CodingSessions.repository(above: "/Users/demo/projects/rel", read: read, exists: exists)
    precondition(relative?["gitdir"] == "/Users/demo/projects/api/.git/worktrees/rel" && relative?["head"]?.count == 40)
    precondition(CodingSessions.repository(above: "/Users/demo/elsewhere", read: read, exists: exists) == nil)

    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let project = root.appendingPathComponent("-Users-demo-projects-api")
    try! FileManager.default.createDirectory(at: project.appendingPathComponent("deep/deeper"), withIntermediateDirectories: true)
    try! Data("private words".utf8).write(to: project.appendingPathComponent("one.jsonl"))
    try! Data("x".utf8).write(to: project.appendingPathComponent("old.jsonl"))
    try! Data("x".utf8).write(to: project.appendingPathComponent("notes.txt"))
    try! Data("x".utf8).write(to: project.appendingPathComponent("deep/deeper/far.jsonl"))
    try! FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -3 * 86400)], ofItemAtPath: project.appendingPathComponent("old.jsonl").path)
    let listed = CodingSessions.recentFiles(under: root, depth: 2)
    precondition(listed.count == 1 && listed[0]["dir"] as? String == "-Users-demo-projects-api" && (listed[0]["mtime"] as? Double ?? 0) > 0, "one recent file, by its folder: \(listed)")
    let listedText = String(data: try! JSONSerialization.data(withJSONObject: listed), encoding: .utf8)!
    precondition(!listedText.contains("one.jsonl") && !listedText.contains("private"), "no file name and no content")

    let reading = CodingSessions.read()
    let processes = reading["processes"] as? [[String: Any]] ?? []
    precondition(reading["ok"] as? Bool == true && processes.count > 3, "the process table is readable without a prompt")
    precondition(processes.contains { $0["pid"] as? Int == Int(getppid()) }, "this test's parent is in it")
    precondition(!processes.contains { $0["pid"] as? Int == Int(getpid()) }, "the app itself is left out")
    precondition(processes.allSatisfy { Set($0.keys).isSubset(of: ["pid", "ppid", "name", "path", "cwd", "start"]) }, "nothing but the listed facts")
    precondition(JSONSerialization.isValidJSONObject(reading))
    print("PASS: coding sessions: tool hints, guarded folders, HEAD through a folder and a worktree file, session files by time only, process table")
}
