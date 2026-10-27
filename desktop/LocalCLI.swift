import Foundation

/// Read-only local CLI helpers. Only runs fixed allow-listed commands; never reads other apps' credential stores.
enum LocalCLI {
    static let ghCandidates = [
        "/opt/homebrew/bin/gh",
        "/usr/local/bin/gh",
        "\(NSHomeDirectory())/.local/bin/gh"
    ]

    static func findExecutable(_ candidates: [String]) -> String? {
        candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    static func run(executable: String, arguments: [String], timeout: TimeInterval = 20) throws -> (status: Int32, stdout: String, stderr: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        process.standardInput = FileHandle.nullDevice
        try process.run()
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if process.isRunning {
            process.terminate()
            throw error(L("命令超时：{command}", ["command": executable]))
        }
        process.waitUntilExit()
        let stdout = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return (process.terminationStatus, stdout, stderr)
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "Assetboard.LocalCLI", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    // MARK: - GitHub CLI

    static func ghPath() -> String? { findExecutable(ghCandidates) }

    /// Parse `gh auth status` text for logged-in usernames on github.com.
    static func ghAccounts(path: String, timeout: TimeInterval = 20) throws -> [String] {
        let started = Date()
        let result = try run(executable: path, arguments: ["auth", "status"], timeout: timeout)
        // gh checks the login with GitHub itself; the request is gh's, so it is recorded as the command that caused it.
        NetworkLog.shared.record(direction: "out", service: L("gh 命令"), method: "gh auth status", host: "api.github.com", path: L("（由 gh 发出）"),
                                 ok: result.status == 0, milliseconds: Int(Date().timeIntervalSince(started) * 1000),
                                 note: L("本机 gh 向 GitHub 核对登录状态"))
        // gh writes status to stderr historically; accept both.
        let text = result.stdout + "\n" + result.stderr
        var users: [String] = []
        // Lines like: "✓ Logged in to github.com account monalisa (keyring)"
        let pattern = try NSRegularExpression(pattern: #"Logged in to github\.com account ([A-Za-z0-9-]+)"#)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        pattern.enumerateMatches(in: text, options: [], range: range) { match, _, _ in
            guard let match, let r = Range(match.range(at: 1), in: text) else { return }
            let name = String(text[r])
            if !users.contains(name) { users.append(name) }
        }
        if users.isEmpty && result.status != 0 {
            throw error(L("本机 gh 尚未登录。可运行：brew install gh && gh auth login"))
        }
        return users
    }

    static func ghToken(path: String, user: String?) throws -> String {
        var args = ["auth", "token", "--hostname", "github.com"]
        if let user, !user.isEmpty { args += ["--user", user] }
        let result = try run(executable: path, arguments: args)
        let token = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        guard result.status == 0, !token.isEmpty, !token.contains(where: { $0.isWhitespace }) else {
            throw error(user.map { L("无法读取账号 {user} 的 gh 令牌。试试：gh auth login", ["user": $0]) } ?? L("无法读取本机 gh 令牌。试试：gh auth login"))
        }
        return token
    }

    // MARK: - SSH config (inventory only)

    static func sshConfigPath() -> URL {
        URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".ssh/config")
    }

    static func readSshConfigText() throws -> String {
        let url = sshConfigPath()
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw error(L("未找到 ~/.ssh/config"))
        }
        // Intentionally only the config text — never IdentityFile / private keys.
        let data = try Data(contentsOf: url, options: [.mappedIfSafe])
        guard data.count <= 512 * 1024 else { throw error(L("~/.ssh/config 过大，已跳过")) }
        guard let text = String(data: data, encoding: .utf8) else { throw error(L("无法以 UTF-8 读取 ~/.ssh/config")) }
        return text
    }

    static func detect() -> [String: Any] {
        var info: [String: Any] = ["gh": false, "ghAccounts": [] as [String], "sshConfig": false]
        if let path = ghPath() {
            info["gh"] = true
            info["ghPath"] = path
            // Only names for the import window: a slow or offline gh gives up sooner than a sync would.
            if let users = try? ghAccounts(path: path, timeout: 8) {
                info["ghAccounts"] = users
            }
        }
        info["sshConfig"] = FileManager.default.fileExists(atPath: sshConfigPath().path)
        return info
    }
}
