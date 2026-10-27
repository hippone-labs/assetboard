import Foundation

#if !ASSETBOARD_FREE
/// SSH 直读 (Pro): a probe data source for servers without a monitoring panel. The app runs the system's /usr/bin/ssh with the
/// person's own ~/.ssh/config, ssh-agent and keys, and one fixed read-only command; the page parses what it prints
/// (pro/web/probe-ssh-data.js) and shows it on the matching server card like any probe. Nothing is installed, written or run
/// with sudo, and readings stay in memory.
///
/// Only aliases the person turned on (逐台开启, kept in UserDefaults like the panel sources) and still listed as a Host in
/// ~/.ssh/config are ever connected. BatchMode=yes: a host that wants a password or an unknown host key fails at once and is
/// skipped with a hint to connect once in Terminal; StrictHostKeyChecking is left as the person set it, never loosened, and
/// known_hosts is never updated from here (UpdateHostKeys=no).
enum SSHProbe {
    static let executable = "/usr/bin/ssh"
    /// Fixed options before the alias. pro/web/probe-ssh-data.js shows the same list in the settings, and its test checks they match.
    static let options: [String] = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
                                    "-o", "UpdateHostKeys=no", "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no", "-o", "ForwardX11=no",
                                    "-o", "PermitLocalCommand=no", "-o", "RemoteCommand=none", "-o", "RequestTTY=no", "-n", "-T"]
    /// The one command run on the server, shown verbatim in the settings (pro/web/probe-ssh-data.js SSH_PROBE_COMMAND, checked equal by
    /// pro/tests/probe-ssh.test.js). `env … sh -c '…'` so it reads the same under bash, zsh or fish; reads only, no redirection.
    static let remoteCommand = "env LC_ALL=C sh -c 'echo @@uname; uname -sm; echo @@stat1; head -n 1 /proc/stat; sleep 1; echo @@stat2; head -n 1 /proc/stat; echo @@nproc; getconf _NPROCESSORS_ONLN; echo @@meminfo; cat /proc/meminfo; echo @@df; df -P -k /; echo @@netdev; cat /proc/net/dev; echo @@uptime; cat /proc/uptime; echo @@loadavg; cat /proc/loadavg; echo @@end'"
    static let intervals = [30, 60, 120, 300]
    static let defaultInterval = 60
    static let concurrency = 3
    static let timeout: TimeInterval = 25
    static let maxOutput = 256 * 1024
    static let limit = 32

    /// An alias as typed after `Host`: never starting with "-" (it could not be read as an option), no spaces, globs or quotes.
    static func validAlias(_ alias: String) -> Bool {
        alias.range(of: "^[A-Za-z0-9_][A-Za-z0-9._@%+-]{0,99}$", options: .regularExpression) != nil
    }

    /// The Host names in a config text, lowercased as ssh matches them; patterns (*, ?, !) are not hosts.
    static func aliases(inConfig text: String) -> Set<String> {
        var names = Set<String>()
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.hasPrefix("#") else { continue }
            let parts = line.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "=" }).map(String.init)
            guard parts.count >= 2, parts[0].lowercased() == "host" else { continue }
            for name in parts.dropFirst() where validAlias(name) { names.insert(name.lowercased()) }
        }
        return names
    }

    static func arguments(alias: String) -> [String] { options + ["--", alias, remoteCommand] }

    /// Why ssh itself failed (exit 255), as a word the page turns into a hint: hostkey, auth, down or other.
    static func reason(stderr: String) -> String {
        let text = stderr.lowercased()
        let hostkey = ["host key verification failed", "host key is known", "remote host identification has changed", "no matching host key"]
        let auth = ["permission denied", "too many authentication failures", "no more authentication methods", "authentication failed"]
        let down = ["could not resolve hostname", "timed out", "connection refused", "no route to host", "network is unreachable",
                    "connection closed", "connection reset", "broken pipe", "timeout"]
        if hostkey.contains(where: { text.contains($0) }) { return "hostkey" }
        if auth.contains(where: { text.contains($0) }) { return "auth" }
        if down.contains(where: { text.contains($0) }) { return "down" }
        return "other"
    }
}

/// Which aliases are on and how often the page asks: a viewer setting in UserDefaults, never in the board data or an export.
/// A host whose server card the page found is turned on for the person (`autoEnable`); one they switched off by hand is kept in
/// `disabled` and never turned on again that way.
final class SSHProbeSettings {
    static let hostsKey = "sshProbeHosts"
    static let disabledKey = "sshProbeOff"
    static let intervalKey = "sshProbeInterval"
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var enabled: [String] { (defaults.stringArray(forKey: Self.hostsKey) ?? []).filter(SSHProbe.validAlias) }
    var interval: Int {
        let value = defaults.integer(forKey: Self.intervalKey)
        return SSHProbe.intervals.contains(value) ? value : SSHProbe.defaultInterval
    }
    var disabled: [String] { (defaults.stringArray(forKey: Self.disabledKey) ?? []).filter(SSHProbe.validAlias) }
    var summary: [String: Any] { ["enabled": enabled, "disabled": disabled, "interval": interval] }

    @discardableResult
    func set(_ alias: String, on: Bool) -> Bool {
        guard SSHProbe.validAlias(alias) else { return false }
        var list = enabled.filter { $0.lowercased() != alias.lowercased() }
        var off = disabled.filter { $0.lowercased() != alias.lowercased() }
        if on {
            guard list.count < SSHProbe.limit else { return false }
            list.append(alias)
        } else {
            off.append(alias)
        }
        defaults.set(list, forKey: Self.hostsKey)
        defaults.set(Array(off.suffix(256)), forKey: Self.disabledKey)
        return true
    }

    /// Turns on the aliases the page matched to a server card, except those switched off by hand or not in ~/.ssh/config.
    @discardableResult
    func autoEnable(_ aliases: [String], known: Set<String>) -> [String] {
        let off = Set(disabled.map { $0.lowercased() })
        var list = enabled, added: [String] = []
        for alias in aliases {
            let key = alias.lowercased()
            guard SSHProbe.validAlias(alias), known.contains(key), !off.contains(key), list.count < SSHProbe.limit,
                  !list.contains(where: { $0.lowercased() == key }) else { continue }
            list.append(alias)
            added.append(alias)
        }
        if !added.isEmpty { defaults.set(list, forKey: Self.hostsKey) }
        return added
    }

    @discardableResult
    func setInterval(_ seconds: Int) -> Bool {
        guard SSHProbe.intervals.contains(seconds) else { return false }
        defaults.set(seconds, forKey: Self.intervalKey)
        return true
    }
}

/// Runs the command, at most `SSHProbe.concurrency` hosts at a time and never the same alias twice at once. Off the main thread.
final class SSHProbeRunner {
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = SSHProbe.concurrency
        queue.qualityOfService = .utility
        return queue
    }()
    private let lock = NSLock()
    private var running = Set<String>()

    /// `completion` gets {alias, output, at} or {alias, reason, error}; an alias already running is dropped, not queued.
    func run(_ alias: String, completion: @escaping ([String: Any]) -> Void) {
        let key = alias.lowercased()
        lock.lock()
        let busy = running.contains(key)
        if !busy { running.insert(key) }
        lock.unlock()
        guard !busy else { return }
        queue.addOperation {
            let result = Self.execute(alias)
            self.lock.lock()
            self.running.remove(key)
            self.lock.unlock()
            completion(result)
        }
    }

    static func execute(_ alias: String) -> [String: Any] {
        func failure(_ reason: String, _ message: String) -> [String: Any] { ["alias": alias, "reason": reason, "error": message] }
        guard SSHProbe.validAlias(alias) else { return failure("other", L("别名无效")) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: SSHProbe.executable)
        process.arguments = SSHProbe.arguments(alias: alias)
        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        process.standardInput = FileHandle.nullDevice
        let started = Date()
        do { try process.run() } catch { return failure("other", L("无法运行 /usr/bin/ssh")) }
        let timer = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + SSHProbe.timeout, execute: timer)
        let errorBox = DataBox()
        let errorDone = DispatchSemaphore(value: 0)
        DispatchQueue.global().async {
            errorBox.data = err.fileHandleForReading.readDataToEndOfFile()
            errorDone.signal()
        }
        var output = Data(), tooLong = false
        while true {
            let chunk = out.fileHandleForReading.availableData
            if chunk.isEmpty { break }
            if output.count + chunk.count > SSHProbe.maxOutput { tooLong = true; process.terminate(); break }
            output.append(chunk)
        }
        process.waitUntilExit()
        timer.cancel()
        _ = errorDone.wait(timeout: .now() + 2)
        let stderr = String(decoding: errorBox.data.prefix(16 * 1024), as: UTF8.self)
        let status = process.terminationStatus
        let killed = process.terminationReason == .uncaughtSignal
        let text = String(decoding: output, as: UTF8.self)
        let ok = !tooLong && !killed && status != 255 && text.contains("@@uname")
        NetworkLog.shared.record(direction: "out", service: L("SSH 直读"), method: "ssh", host: alias, path: L("（只读命令）"), ok: ok,
                                 received: Int64(output.count), milliseconds: Int(Date().timeIntervalSince(started) * 1000),
                                 note: L("系统 ssh 用本机密钥连接，只运行固定的只读命令"))
        if ok { return ["alias": alias, "output": text, "at": Date().timeIntervalSince1970 * 1000] }
        if tooLong { return failure("other", L("输出过长，已停止")) }
        if killed { return failure("down", L("超时")) }
        if status == 255 {
            let line = stderr.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.last ?? ""
            return failure(SSHProbe.reason(stderr: stderr), String(line.prefix(160)))
        }
        return failure("other", L("命令没有输出（退出码 {status}）", ["status": status]))
    }

    private final class DataBox { var data = Data() }
}

/// The bridge, kept here so Assetboard.swift only routes to it. sshProbeList · sshProbeSet {alias, on} · sshProbeInterval {seconds} ·
/// sshProbeRun {aliases}. The demo never runs ssh: its page makes up the readings.
let sshProbeSettings = SSHProbeSettings()
let sshProbeRunner = SSHProbeRunner()

extension AppDelegate {
    func sshProbeResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardSshProbe?.(\(json))")
        }
    }

    /// The config text (the page reads it with the same parser as the import) and the settings; reading it never connects anywhere.
    func sshProbeList() {
        DispatchQueue.global(qos: .userInitiated).async {
            var list: [String: Any] = sshProbeSettings.summary
            do { list["config"] = try LocalCLI.readSshConfigText() } catch { list["error"] = error.localizedDescription }
            self.sshProbeResult(["list": list])
        }
    }

    func handleSshProbe(_ action: String, _ body: [String: Any]) {
        if demoMode { return }
        switch action {
        case "sshProbeList":
            sshProbeList()
        case "sshProbeSet":
            guard let alias = body["alias"] as? String, SSHProbe.validAlias(alias) else { sshProbeResult(["error": L("别名无效")]); return }
            let on = body["on"] as? Bool == true
            if on {
                let known = (try? LocalCLI.readSshConfigText()).map(SSHProbe.aliases(inConfig:)) ?? []
                guard known.contains(alias.lowercased()) else { sshProbeResult(["error": L("~/.ssh/config 里没有 {alias}", ["alias": alias])]); return }
            }
            guard sshProbeSettings.set(alias, on: on) else { sshProbeResult(["error": L("最多开启 {n} 台", ["n": SSHProbe.limit])]); return }
            sshProbeList()
        case "sshProbeAuto":
            let asked = (body["aliases"] as? [String] ?? []).filter(SSHProbe.validAlias)
            let known = (try? LocalCLI.readSshConfigText()).map(SSHProbe.aliases(inConfig:)) ?? []
            sshProbeSettings.autoEnable(Array(asked.prefix(SSHProbe.limit)), known: known)
            sshProbeList()
        case "sshProbeInterval":
            if let seconds = body["seconds"] as? Int { sshProbeSettings.setInterval(seconds) }
            sshProbeList()
        case "sshProbeRun":
            let asked = (body["aliases"] as? [String] ?? []).filter(SSHProbe.validAlias)
            let enabled = Set(sshProbeSettings.enabled.map { $0.lowercased() })
            let known = (try? LocalCLI.readSshConfigText()).map(SSHProbe.aliases(inConfig:)) ?? []
            // Only what the person turned on and ~/.ssh/config still lists.
            for alias in asked.prefix(SSHProbe.limit) where enabled.contains(alias.lowercased()) {
                guard known.contains(alias.lowercased()) else {
                    sshProbeResult(["result": ["alias": alias, "reason": "missing", "error": L("~/.ssh/config 里已没有这个别名")]]); continue
                }
                sshProbeRunner.run(alias) { self.sshProbeResult(["result": $0]) }
            }
        default:
            break
        }
    }

    @objc func openSshProbe() { webView.evaluateJavaScript("window.sshProbeDialog?.()") }
}

func testSSHProbe() {
    // Aliases: plain names only; nothing that ssh could read as an option.
    for good in ["tokyo-vps", "box_1", "web.example.net", "a"] { precondition(SSHProbe.validAlias(good), "alias: \(good)") }
    for bad in ["-oProxyCommand=x", "", "two words", "a*", "a;b", "a'b", "$(x)", "a/b"] { precondition(!SSHProbe.validAlias(bad), "refused: \(bad)") }
    let config = "Host *\n  User x\nHost Tokyo-VPS tokyo\n  HostName 203.0.113.10\n# Host hidden\nHost = lab-pi\nHost !nope web?\nMatch host x\n"
    precondition(SSHProbe.aliases(inConfig: config) == Set(["tokyo-vps", "tokyo", "lab-pi"]), "aliases: \(SSHProbe.aliases(inConfig: config))")

    // The command line: batch mode, a short connect timeout, host keys never accepted or updated from here, the alias after "--".
    let args = SSHProbe.arguments(alias: "tokyo-vps")
    precondition(args.contains("BatchMode=yes") && args.contains("ConnectTimeout=8") && args.contains("UpdateHostKeys=no"))
    precondition(!args.contains { $0.lowercased().contains("stricthostkeychecking") || $0.lowercased().contains("accept-new") || $0.lowercased().contains("userknownhostsfile") })
    precondition(Array(args.suffix(3)) == ["--", "tokyo-vps", SSHProbe.remoteCommand], "the alias comes after --, the command last")
    let command = SSHProbe.remoteCommand.lowercased()
    for word in ["sudo", ">", "rm ", "tee", "curl", "wget", "apt", "yum", "dnf", "install", "chmod", "mv ", "cp ", "dd ", "`", "$("] {
        precondition(!command.contains(word), "the command has \(word)")
    }

    // Why ssh failed.
    precondition(SSHProbe.reason(stderr: "No ED25519 host key is known for x and you have requested strict checking.\nHost key verification failed.") == "hostkey")
    precondition(SSHProbe.reason(stderr: "deploy@x: Permission denied (publickey,password).") == "auth")
    precondition(SSHProbe.reason(stderr: "ssh: connect to host x port 22: Operation timed out") == "down")
    precondition(SSHProbe.reason(stderr: "ssh: Could not resolve hostname x: nodename nor servname provided") == "down")
    precondition(SSHProbe.reason(stderr: "something else") == "other")

    // Settings: in their own defaults, on and off per alias, intervals from the list.
    let suite = "assetboard.test.ssh.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let settings = SSHProbeSettings(defaults: defaults)
    precondition(settings.enabled.isEmpty && settings.interval == SSHProbe.defaultInterval, "nothing is on by default")
    precondition(settings.set("tokyo-vps", on: true) && settings.set("lab-pi", on: true) && !settings.set("-x", on: true))
    precondition(settings.set("TOKYO-VPS", on: false) && settings.enabled == ["lab-pi"])
    // Turned on for the person when a card matched, but never one they switched off, nor one not in ~/.ssh/config.
    precondition(settings.disabled == ["TOKYO-VPS"], "a host switched off by hand is remembered")
    precondition(settings.autoEnable(["tokyo-vps", "web", "ghost", "lab-pi"], known: ["tokyo-vps", "web", "lab-pi"]) == ["web"])
    precondition(settings.enabled == ["lab-pi", "web"])
    precondition(settings.set("tokyo-vps", on: true) && settings.disabled.isEmpty && settings.enabled.contains("tokyo-vps"), "switching on by hand forgets the off")
    precondition(settings.setInterval(30) && settings.interval == 30 && !settings.setInterval(5) && settings.interval == 30)
    print("PASS: SSH probe: aliases, batch-mode command line with the fixed read-only command, failure reasons, per-alias settings")
}
#endif
