import Cocoa
import CryptoKit
import Security

/// 检查更新: asks the site for its version file (https://assetboard.app/downloads/latest.json, written by desktop/package.sh; a plain
/// GET, nothing about this Mac is sent, recorded in 网络记录), offers the version when it is newer, and installs it only after the
/// download matches the file's checksum and proves to be signed by the same team, notarized, the same app, made for this Mac's macOS
/// and able to start. The app it replaces is kept as Application Support/Assetboard/previous.app and comes back when the new one
/// does not start. Automatic checks run at most once a day and fail silently; a check from the menu says what happened. Installers
/// live on the site only (2026-10-24).
final class Updater {
    static let site = "assetboard.app"
    static let latestURL = URL(string: "https://\(site)/downloads/latest.json")!
    static let automaticKey = "updateAutomatic"
    static let lastCheckKey = "updateLastCheck"
    static let interval: TimeInterval = 86_400
    /// The flag the installer starts a downloaded app with before it replaces this one (selfCheckLaunch).
    static let launchCheckFlag = "--self-check-launch"

    struct Release: Equatable {
        let version: String
        let notes: String
        let asset: String
        let download: URL
        /// SHA-256 of the archive, hex, when the version file gives one.
        let sha256: String?
        /// The release's LSMinimumSystemVersion, when the version file gives one.
        let minimumSystem: String?
    }

    /// On unless the person turned it off.
    static var automatic: Bool {
        get { UserDefaults.standard.object(forKey: automaticKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: automaticKey) }
    }
    static var currentVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
    /// The macOS this Mac runs, as major.minor.patch.
    static var systemVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }
    /// Application Support/Assetboard, next to the board's own files: the system does not clean it up like a temporary folder.
    static var supportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Assetboard", isDirectory: true)
    }
    static var previousApp: URL { supportDirectory.appendingPathComponent("previous.app", isDirectory: true) }
    /// Written by the helper when the new app did not start and the previous one was put back.
    static var rolledBackMarker: URL { supportDirectory.appendingPathComponent("update-rolled-back") }

    // MARK: Rules (covered by --test-update)

    /// The archive desktop/package.sh makes.
    static func assetName(version: String) -> String {
        "Assetboard-macOS-arm64-\(version).zip"
    }

    /// A semantic version without its leading "v" and build metadata: the numbers and the pre-release identifiers.
    static func parts(_ raw: String) -> (numbers: [Int], pre: [String])? {
        var text = raw.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("v") || text.hasPrefix("V") { text.removeFirst() }
        let core = text.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let halves = core.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let numbers = halves[0].split(separator: ".", omittingEmptySubsequences: false).map { Int($0) }
        guard !numbers.isEmpty, numbers.count <= 4, numbers.allSatisfy({ ($0 ?? -1) >= 0 }) else { return nil }
        let pre = halves.count > 1 ? halves[1].split(separator: ".", omittingEmptySubsequences: false).map(String.init) : []
        guard !pre.contains(where: \.isEmpty) else { return nil }
        return (numbers.compactMap { $0 }, pre)
    }

    /// nil when either side is not a version.
    static func compare(_ a: String, _ b: String) -> ComparisonResult? {
        guard let x = parts(a), let y = parts(b) else { return nil }
        for index in 0..<max(x.numbers.count, y.numbers.count) {
            let left = index < x.numbers.count ? x.numbers[index] : 0, right = index < y.numbers.count ? y.numbers[index] : 0
            if left != right { return left < right ? .orderedAscending : .orderedDescending }
        }
        // A release outranks its pre-releases; pre-release identifiers compare numerically when both are numbers.
        if x.pre.isEmpty || y.pre.isEmpty {
            return x.pre.isEmpty == y.pre.isEmpty ? .orderedSame : (x.pre.isEmpty ? .orderedDescending : .orderedAscending)
        }
        for (left, right) in zip(x.pre, y.pre) where left != right {
            switch (Int(left), Int(right)) {
            case let (l?, r?): return l < r ? .orderedAscending : .orderedDescending
            case (.some, nil): return .orderedAscending
            case (nil, .some): return .orderedDescending
            default: return left < right ? .orderedAscending : .orderedDescending
            }
        }
        return x.pre.count == y.pre.count ? .orderedSame : (x.pre.count < y.pre.count ? .orderedAscending : .orderedDescending)
    }
    static func isNewer(_ candidate: String, than current: String) -> Bool { compare(candidate, current) == .orderedDescending }

    /// A macOS version is plain numbers: 15, 15.0, 15.4.1.
    static func isSystemVersion(_ text: String) -> Bool { text.range(of: "^[0-9]+(\\.[0-9]+){0,2}$", options: .regularExpression) != nil }
    /// False for a system older than the minimum, and when either is not a macOS version.
    static func runs(minimum: String, on system: String) -> Bool {
        guard isSystemVersion(minimum), isSystemVersion(system) else { return false }
        return compare(minimum, system).map { $0 != .orderedDescending } ?? false
    }
    /// What keeps a newer release from this Mac: nil when it may be offered. A version file without minimumSystemVersion is
    /// offered; the downloaded app's own LSMinimumSystemVersion is checked again in verify.
    static func systemProblem(_ release: Release, system: String) -> String? {
        guard let minimum = release.minimumSystem, !runs(minimum: minimum, on: system) else { return nil }
        return L("Assetboard {version} 需要 macOS {minimum} 或更高，这台 Mac 是 macOS {system}。", ["version": release.version, "minimum": minimum, "system": system])
    }

    static func isDue(last: Date?, now: Date) -> Bool {
        guard let last else { return true }
        return now.timeIntervalSince(last) >= interval || now < last
    }

    /// The site's version file, {"version", "minimumSystemVersion", "notes", "assets": [{"name", "url", "sha256"}]}, with the app's
    /// archive; nil for an unknown version, a minimum system that is not a macOS version, a checksum that is not SHA-256 hex, or an
    /// archive that is missing or not under https://assetboard.app/downloads/.
    static func parse(_ data: Data) -> Release? {
        guard data.count <= 2_000_000, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let tag = json["version"] as? String, parts(tag) != nil else { return nil }
        let version = tag.hasPrefix("v") || tag.hasPrefix("V") ? String(tag.dropFirst()) : tag
        let name = assetName(version: version)
        guard let assets = json["assets"] as? [[String: Any]], let asset = assets.first(where: { $0["name"] as? String == name }),
              let raw = asset["url"] as? String, let url = URL(string: raw), trustedDownload(url) else { return nil }
        let digest = (asset["sha256"] as? String)?.lowercased()
        if let digest, digest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) == nil { return nil }
        let minimum = json["minimumSystemVersion"]
        if let minimum, !((minimum as? String).map { isSystemVersion($0) } ?? false) { return nil }
        return Release(version: version, notes: String((json["notes"] as? String ?? "").prefix(20_000)), asset: name, download: url, sha256: digest,
                       minimumSystem: minimum as? String)
    }
    static func trustedDownload(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == site && url.user == nil && url.password == nil && url.query == nil && url.path.hasPrefix("/downloads/")
    }
    /// SHA-256 as lower-case hex, the form desktop/package.sh writes into the version file.
    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    /// The first lines of the release notes, without Markdown heading marks.
    static func excerpt(_ notes: String, lines: Int = 6) -> String {
        notes.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .map { $0.hasPrefix("#") ? String($0.drop(while: { $0 == "#" })).trimmingCharacters(in: .whitespaces) : $0 }
            .filter { !$0.isEmpty }
            .prefix(lines).map { String($0.prefix(200)) }
            .joined(separator: "\n")
    }

    /// TeamIdentifier from `codesign -dv` output; nil when it is missing or "not set" (ad-hoc signing).
    static func teamIdentifier(codesignOutput: String) -> String? {
        for line in codesignOutput.split(whereSeparator: \.isNewline) where line.hasPrefix("TeamIdentifier=") {
            let value = line.dropFirst("TeamIdentifier=".count).trimmingCharacters(in: .whitespaces)
            return value.isEmpty || value == "not set" ? nil : value
        }
        return nil
    }

    /// This running app's own team, read from its signature.
    static func ownTeamIdentifier() -> String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let details = info as? [String: Any] else { return nil }
        return details[kSecCodeInfoTeamIdentifier as String] as? String
    }

    // MARK: Checking

    let session: URLSession
    weak var window: NSWindow?
    private var checking = false
    private var installing = false
    private var timer: Timer?

    init(session: URLSession = Updater.makeSession()) { self.session = session }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 600
        return URLSession(configuration: configuration, delegate: UpdateRedirects(service: L("检查更新")), delegateQueue: nil)
    }

    /// Once shortly after launch, then hourly while the app runs; each looks at the time of the last check first.
    func startAutomaticChecks() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.checkIfDue() }
        timer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in self?.checkIfDue() }
    }
    func checkIfDue() {
        guard Updater.automatic, Updater.isDue(last: UserDefaults.standard.object(forKey: Updater.lastCheckKey) as? Date, now: Date()) else { return }
        check(manual: false)
    }

    func fetchLatest(completion: @escaping (Release?) -> Void) {
        var request = URLRequest(url: Updater.latestURL)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // A fixed name instead of the default, which would carry the macOS and CFNetwork versions.
        request.setValue("Assetboard", forHTTPHeaderField: "User-Agent")
        session.dataTask(with: request) { data, response, error in
            guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data else { completion(nil); return }
            completion(Updater.parse(data))
        }.resume()
    }

    func check(manual: Bool) {
        guard !checking, !installing else { return }
        checking = true
        UserDefaults.standard.set(Date(), forKey: Updater.lastCheckKey)
        fetchLatest { release in
            DispatchQueue.main.async {
                self.checking = false
                guard let release else { if manual { self.say(L("无法检查更新，请稍后再试。")) }; return }
                if Updater.isNewer(release.version, than: Updater.currentVersion) {
                    // A release this Mac is too old for is skipped; asked from the menu, the person is told why.
                    if let problem = Updater.systemProblem(release, system: Updater.systemVersion) { if manual { self.say(problem) } }
                    else { self.offer(release) }
                } else if manual { self.say(L("已是最新版本（{version}）。", ["version": Updater.currentVersion])) }
            }
        }
    }

    private func present(_ alert: NSAlert, _ done: @escaping (NSApplication.ModalResponse) -> Void) {
        if let window, window.isVisible, window.attachedSheet == nil { alert.beginSheetModal(for: window, completionHandler: done) }
        else { done(alert.runModal()) }
    }
    private func say(_ text: String) {
        let alert = NSAlert()
        alert.messageText = text
        alert.addButton(withTitle: L("好"))
        present(alert) { _ in }
    }
    private func offer(_ release: Release) {
        let alert = NSAlert()
        alert.messageText = "Assetboard \(release.version)"
        alert.informativeText = Updater.excerpt(release.notes)
        alert.addButton(withTitle: L("下载并安装"))
        alert.addButton(withTitle: L("稍后"))
        present(alert) { response in if response == .alertFirstButtonReturn { self.install(release) } }
    }

    // MARK: Installing

    /// Downloads to a temporary folder, unpacks with ditto and checks the app; only then quits and lets the helper swap it in.
    func install(_ release: Release) {
        guard !installing else { return }
        let current = Bundle.main.bundleURL
        let parent = current.deletingLastPathComponent()
        guard current.pathExtension == "app", !current.path.contains("/AppTranslocation/"),
              FileManager.default.isWritableFile(atPath: parent.path) else {
            say(L("没有权限替换 {path}。请到 assetboard.app 下载新版本。", ["path": current.path])); return
        }
        installing = true
        let work = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-update-" + UUID().uuidString, isDirectory: true)
        let fail = { (reason: String) in
            DispatchQueue.main.async {
                try? FileManager.default.removeItem(at: work)
                self.installing = false
                self.say(L("更新已停止：{reason}。当前版本没有改动。", ["reason": reason]))
            }
        }
        var request = URLRequest(url: release.download)
        request.httpMethod = "GET"
        request.setValue("Assetboard", forHTTPHeaderField: "User-Agent")
        session.downloadTask(with: request) { file, response, error in
            guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let file else { fail(L("下载失败")); return }
            let archive = work.appendingPathComponent(release.asset)
            // The downloaded file is removed when this handler returns, so it is moved first.
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: file, to: archive)
            } catch { fail(L("无法保存下载的文件")); return }
            DispatchQueue.global(qos: .userInitiated).async {
                if let expected = release.sha256 {
                    guard let bytes = try? Data(contentsOf: archive), Updater.digest(bytes) == expected else { fail(L("下载的文件和版本文件的校验值不符")); return }
                }
                let unpacked = work.appendingPathComponent("unpacked", isDirectory: true)
                guard Updater.run("/usr/bin/ditto", ["-x", "-k", archive.path, unpacked.path]).status == 0 else { fail(L("无法解压")); return }
                let apps = ((try? FileManager.default.contentsOfDirectory(at: unpacked, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "app" }
                guard apps.count == 1 else { fail(L("安装包里没有找到 App")); return }
                if let problem = Updater.verify(apps[0], current: Updater.currentVersion) { fail(problem); return }
                DispatchQueue.main.async { self.relaunch(into: apps[0], work: work, fail: fail) }
            }
        }.resume()
    }

    /// Every check has to pass: the signature is intact, the team is this app's own, Gatekeeper accepts it (notarized),
    /// the bundle id is the same, the version is newer, its LSMinimumSystemVersion allows this Mac and it starts. Returns the first failure.
    static func verify(_ app: URL, current: String) -> String? {
        guard run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path]).status == 0 else { return L("签名校验没有通过") }
        guard let own = ownTeamIdentifier() else { return L("当前 App 没有开发者签名，无法比对") }
        let details = run("/usr/bin/codesign", ["-dv", app.path])
        guard details.status == 0, teamIdentifier(codesignOutput: details.output) == own else { return L("新版本的开发者与当前 App 不一致") }
        guard run("/usr/sbin/spctl", ["-a", "-vv", app.path]).status == 0 else { return L("新版本没有通过 macOS 公证检查") }
        guard let bundle = Bundle(url: app), let identifier = bundle.bundleIdentifier, identifier == Bundle.main.bundleIdentifier else { return L("新版本的 Bundle ID 与当前不一致") }
        guard let version = bundle.infoDictionary?["CFBundleShortVersionString"] as? String, isNewer(version, than: current) else { return L("安装包的版本不比当前新") }
        if let problem = minimumSystemProblem(bundle.infoDictionary ?? [:], system: systemVersion) { return problem }
        return launchCheck(app, version: version)
    }

    /// The downloaded app's own LSMinimumSystemVersion against this Mac; a bundle that does not name one is refused.
    static func minimumSystemProblem(_ info: [String: Any], system: String) -> String? {
        guard let minimum = info["LSMinimumSystemVersion"] as? String, isSystemVersion(minimum) else { return L("新版本没有写明需要的 macOS 版本") }
        return runs(minimum: minimum, on: system) ? nil : L("新版本需要 macOS {minimum} 或更高，这台 Mac 是 macOS {system}", ["minimum": minimum, "system": system])
    }

    /// Starts the new app once with launchCheckFlag (and its assetboard-cli with --version) before anything is replaced: a binary
    /// the system cannot load (a library or symbol this macOS lacks) stops here instead of after the swap.
    static func launchCheck(_ app: URL, version: String) -> String? {
        guard let executable = Bundle(url: app)?.executableURL else { return L("安装包里没有找到 App") }
        let started = run(executable.path, [launchCheckFlag], timeout: 30)
        guard started.status == 0, started.output.split(whereSeparator: \.isNewline).contains(where: { $0 == "Assetboard \(version)" }) else {
            return L("新版本在这台 Mac 上无法启动")
        }
        let cli = app.appendingPathComponent("Contents/MacOS/assetboard-cli")
        if FileManager.default.fileExists(atPath: cli.path) {
            let answered = run(cli.path, ["--version"], timeout: 30)
            guard answered.status == 0, answered.output.trimmingCharacters(in: .whitespacesAndNewlines) == version else { return L("新版本的命令行工具无法启动") }
        }
        return nil
    }

    /// The helper waits for this process to end, moves the old app to previous.app in Application Support (replacing an older one),
    /// moves the new one into its place and opens it. When the move fails, or the new app is not running a few seconds after it
    /// was opened, it puts the old app back, leaves the marker for reportRollback and opens the old app.
    /// ASSETBOARD_OPEN and ASSETBOARD_START_WAIT (tenths of a second) are for --test-update only.
    static let helperScript = """
        #!/bin/sh
        pid="$1"; old="$2"; new="$3"; backup="$4"; marker="$5"
        opener="${ASSETBOARD_OPEN:-/usr/bin/open}"; patience="${ASSETBOARD_START_WAIT:-100}"
        i=0
        while kill -0 "$pid" 2>/dev/null; do
          i=$((i + 1)); [ "$i" -gt 600 ] && exit 1
          sleep 0.1
        done
        rm -rf "$backup"
        mv "$old" "$backup" || exit 1
        restore() { rm -rf "$old"; mv "$backup" "$old" && : > "$marker"; "$opener" "$old"; exit 1; }
        mv "$new" "$old" || restore
        "$opener" "$old" || restore
        i=0
        until /usr/bin/pgrep -f "$old/Contents/MacOS/Assetboard( |$)" >/dev/null; do
          i=$((i + 1)); [ "$i" -gt "$patience" ] && restore
          sleep 0.1
        done
        sleep 3
        /usr/bin/pgrep -f "$old/Contents/MacOS/Assetboard( |$)" >/dev/null || restore
        exit 0
        """

    /// Says once, after a launch, that the last update was rolled back.
    func reportRollback() {
        guard FileManager.default.fileExists(atPath: Updater.rolledBackMarker.path) else { return }
        try? FileManager.default.removeItem(at: Updater.rolledBackMarker)
        // After the window is on screen, so the note is a sheet on it.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.say(L("新版本没能启动，已换回 {version}。", ["version": Updater.currentVersion])) }
    }

    private func relaunch(into app: URL, work: URL, fail: @escaping (String) -> Void) {
        let script = work.appendingPathComponent("install.sh")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [script.path, String(getpid()), Bundle.main.bundleURL.path, app.path, Updater.previousApp.path, Updater.rolledBackMarker.path]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try FileManager.default.createDirectory(at: Updater.supportDirectory, withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: Updater.rolledBackMarker)
            try Updater.helperScript.write(to: script, atomically: true, encoding: .utf8)
            try process.run()
        } catch { fail(L("无法启动安装")); return }
        NSApplication.shared.terminate(nil)
    }

    /// Runs a tool and collects its output; with a timeout, a tool still running then is terminated.
    @discardableResult static func run(_ tool: String, _ arguments: [String], timeout: TimeInterval? = nil, environment: [String: String]? = nil) -> (status: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        if let environment { process.environment = ProcessInfo.processInfo.environment.merging(environment) { $1 } }
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do { try process.run() } catch { return (-1, "") }
        if let timeout { DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { if process.isRunning { process.terminate() } } }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return (process.terminationStatus, String(decoding: data, as: UTF8.self))
    }
}

/// Offers, once, to move the app into Applications when it was opened from somewhere else: the Downloads folder, the disk image, or
/// the read-only copy macOS runs a quarantined app from (App Translocation). Updates replace the app where it is, so a copy left in
/// Downloads or on the disk image never updates. Only Developer ID builds ask: builds from desktop/build.sh and every --test/--demo
/// run stay quiet.
enum AppLocation {
    static let declinedKey = "AssetboardMoveToApplicationsDeclined"
    static let destination = URL(fileURLWithPath: "/Applications/Assetboard.app", isDirectory: true)

    /// Whether an app at this path should offer the move: not inside /Applications or ~/Applications already.
    static func shouldOffer(bundlePath: String, home: String) -> Bool {
        let path = (bundlePath as NSString).standardizingPath
        guard path.hasSuffix(".app") else { return false }
        return !["/Applications/", (home as NSString).standardizingPath + "/Applications/"].contains { path.hasPrefix($0) }
    }
    /// The original can go to the Trash only when the app runs from it: not from a mounted disk image, not from a translocated copy.
    static func canRemoveOriginal(bundlePath: String) -> Bool { !bundlePath.hasPrefix("/Volumes/") && !bundlePath.contains("/AppTranslocation/") }

    static func offerIfNeeded(window: NSWindow?) {
        let bundle = Bundle.main.bundleURL
        guard !demoMode, !CommandLine.arguments.dropFirst().contains(where: { $0.hasPrefix("--") }),
              !UserDefaults.standard.bool(forKey: declinedKey), Updater.ownTeamIdentifier() != nil,
              shouldOffer(bundlePath: bundle.path, home: NSHomeDirectory()) else { return }
        let alert = NSAlert()
        alert.messageText = L("把 Assetboard 移到「应用程序」文件夹？")
        alert.informativeText = L("从「应用程序」打开，Assetboard 才能自动更新。")
        alert.addButton(withTitle: L("移到「应用程序」"))
        alert.addButton(withTitle: L("不移动"))
        let answer: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .alertFirstButtonReturn else { UserDefaults.standard.set(true, forKey: declinedKey); return }
            if let failure = move(from: bundle) {
                let note = NSAlert()
                note.messageText = L("没能移到「应用程序」")
                note.informativeText = failure
                note.runModal()
            }
        }
        if let window { alert.beginSheetModal(for: window, completionHandler: answer) } else { answer(alert.runModal()) }
    }

    /// Copies the app into /Applications (an older copy there goes to the Trash first), removes the original when it can, and starts
    /// the copy once this process has ended. Returns the reason when it could not.
    static func move(from bundle: URL) -> String? {
        let files = FileManager.default
        if files.fileExists(atPath: destination.path) {
            do { try files.trashItem(at: destination, resultingItemURL: nil) } catch { return L("「应用程序」里已有一个 Assetboard，无法替换它。") }
        }
        guard Updater.run("/usr/bin/ditto", [bundle.path, destination.path]).status == 0 else {
            try? files.removeItem(at: destination)
            return L("没有写入「应用程序」文件夹的权限。")
        }
        if canRemoveOriginal(bundlePath: bundle.path) { try? files.trashItem(at: bundle, resultingItemURL: nil) }
        let relaunch = Process()
        relaunch.executableURL = URL(fileURLWithPath: "/bin/sh")
        relaunch.arguments = ["-c", "while kill -0 \"$0\" 2>/dev/null; do sleep 0.2; done; /usr/bin/open \"$1\"", String(getpid()), destination.path]
        do { try relaunch.run() } catch { return L("已复制到「应用程序」，请从那里打开 Assetboard。") }
        NSApplication.shared.terminate(nil)
        return nil
    }
}

/// --self-check-launch: the installer starts a downloaded app with it before the swap. Getting this far means dyld found every library
/// and symbol on this macOS; the board files must be in the bundle. Prints "Assetboard <version>" and reads or writes no data.
func selfCheckLaunch() -> Never {
    guard Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Board") != nil else { fputs("Board files are missing\n", stderr); exit(1) }
    print("Assetboard \(Updater.currentVersion)")
    exit(0)
}

/// Recorded in 网络记录 like every other request; a redirect (should the site ever hand downloads elsewhere) must stay on https.
private final class UpdateRedirects: LoggedSessionDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" ? request : nil)
    }
}

func testUpdate() {
    func check(_ ok: Bool, _ message: @autoclosure () -> String) { if !ok { fputs("Update test failed: \(message())\n", stderr); exit(1) } }
    // Versions
    for (newer, older) in [("0.4.7", "0.4.6"), ("v0.10.0", "0.9.9"), ("1.0.0", "1.0.0-beta.2"), ("1.0.0-beta.11", "1.0.0-beta.2"),
                           ("1.0.0-beta", "1.0.0-alpha.9"), ("1.0.0-alpha.1", "1.0.0-alpha"), ("0.5", "0.4.9"), ("1.0.0+build.9", "0.9.9")] {
        check(Updater.isNewer(newer, than: older) && !Updater.isNewer(older, than: newer), "\(newer) must be newer than \(older)")
    }
    // Where the app runs from
    for (path, offer) in [("/Applications/Assetboard.app", false), ("/Applications/Tools/Assetboard.app", false), ("/Users/someone/Applications/Assetboard.app", false),
                          ("/Users/someone/Downloads/Assetboard.app", true), ("/Volumes/Assetboard/Assetboard.app", true),
                          ("/private/var/folders/xy/T/AppTranslocation/0A1B/d/Assetboard.app", true), ("/Users/someone/Downloads/Assetboard", false)] {
        check(AppLocation.shouldOffer(bundlePath: path, home: "/Users/someone") == offer, "Move to Applications offered for \(path): \(!offer)")
    }
    check(AppLocation.canRemoveOriginal(bundlePath: "/Users/someone/Downloads/Assetboard.app") && !AppLocation.canRemoveOriginal(bundlePath: "/Volumes/Assetboard/Assetboard.app")
          && !AppLocation.canRemoveOriginal(bundlePath: "/private/var/folders/xy/T/AppTranslocation/0A1B/d/Assetboard.app"), "Only a copy the app runs from goes to the Trash")
    check(Updater.compare("0.4", "0.4.0") == .orderedSame && Updater.compare("v0.4.6", "0.4.6+12") == .orderedSame, "Equal versions compare the same")
    check(!Updater.isNewer("0.4.6", than: "0.4.6"), "The same version is not newer")
    for broken in ["", "garbage", "0..1", "1.0.0-", "-1.0", "1.2.3.4.5", "1.0.0-beta..1"] {
        check(Updater.compare(broken, "0.4.6") == nil && !Updater.isNewer(broken, than: "0.0.1"), "Not a version: \(broken)")
    }
    // Asset names, the same rule as desktop/package.sh
    check(Updater.assetName(version: "0.4.7") == "Assetboard-macOS-arm64-0.4.7.zip", "Archive name")
    // The version file on the site
    let base = "https://\(Updater.site)/downloads/"
    let sum = String(repeating: "ab", count: 32)
    var release: [String: Any] = ["version": "v0.4.7", "notes": "## What's new\n\n- Faster panorama\n- Fixes",
                                  "assets": [["name": "Assetboard-Other-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-Other-macOS-arm64-0.4.7.zip"],
                                             ["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip", "sha256": sum.uppercased()]]]
    func parse() -> Updater.Release? { Updater.parse(try! JSONSerialization.data(withJSONObject: release)) }
    let full = parse()
    check(full?.version == "0.4.7" && full?.asset == "Assetboard-macOS-arm64-0.4.7.zip" && full?.download.lastPathComponent == full?.asset && full?.sha256 == sum,
          "The app's archive and checksum are picked: \(String(describing: full))")
    check(Updater.excerpt(full?.notes ?? "") == "What's new\n- Faster panorama\n- Fixes", "Notes excerpt: \(Updater.excerpt(full?.notes ?? ""))")
    release["assets"] = [["name": "Assetboard-Other-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-Other-macOS-arm64-0.4.7.zip"]]
    check(parse() == nil, "A version file without the app's archive offers nothing")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "https://downloads.example.com/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse() == nil, "An archive on another host is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "https://\(Updater.site)/other/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse() == nil, "An archive outside /downloads/ is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "http://\(Updater.site)/downloads/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse() == nil, "A plain http archive is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip?x=1"]]
    check(parse() == nil, "A query string is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip", "sha256": "nope"]]
    check(parse() == nil, "A checksum that is not SHA-256 hex is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip"]]
    release["version"] = "nightly"
    check(parse() == nil, "A version that is not a version is not offered")
    // The version file's minimum macOS: kept when it is one, the release refused when it is anything else
    release["version"] = "v0.4.7"
    check(parse() != nil && parse()?.minimumSystem == nil, "A version file without a minimum system has none")
    release["minimumSystemVersion"] = "15.0"
    check(parse()?.minimumSystem == "15.0", "The minimum system is read: \(String(describing: parse()))")
    for broken in ["15.0-beta", "v15", "fifteen", "", 15, NSNull()] as [Any] {
        release["minimumSystemVersion"] = broken
        check(parse() == nil, "A minimum system that is not a macOS version is refused: \(broken)")
    }
    release["minimumSystemVersion"] = "28.0"
    let tooNew = parse()
    check(tooNew != nil && Updater.systemProblem(tooNew!, system: "27.1.0")?.contains("28.0") == true && Updater.systemProblem(tooNew!, system: "28.0.0") == nil
          && Updater.systemProblem(tooNew!, system: "28.1") == nil, "A release for a newer macOS is skipped on an older Mac only")
    release.removeValue(forKey: "minimumSystemVersion")
    check(parse().map { Updater.systemProblem($0, system: "15.0.0") == nil } == true, "A version file without a minimum system is offered")
    check(Updater.parse(Data("<html>".utf8)) == nil, "Not JSON")
    check(Updater.digest(Data("abc".utf8)) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 of a download, lower-case hex")
    // Signatures and timing
    check(Updater.teamIdentifier(codesignOutput: "Executable=/Applications/Assetboard.app/Contents/MacOS/Assetboard\nIdentifier=studio.assetboard.local\nTeamIdentifier=ABCDE12345\n") == "ABCDE12345", "TeamIdentifier is read")
    check(Updater.teamIdentifier(codesignOutput: "Identifier=studio.assetboard.local\nTeamIdentifier=not set\n") == nil && Updater.teamIdentifier(codesignOutput: "") == nil, "Ad-hoc signing has no team")
    let now = Date()
    check(Updater.isDue(last: nil, now: now) && Updater.isDue(last: now.addingTimeInterval(-86_400), now: now) && !Updater.isDue(last: now.addingTimeInterval(-3600), now: now), "At most once a day")
    // The request: one GET to the site's version file, with nothing about this Mac.
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    let mocked = URLSession(configuration: configuration)
    release["version"] = "v0.4.7"
    release["assets"] = [["name": Updater.assetName(version: "0.4.7"), "url": base + Updater.assetName(version: "0.4.7")]]
    var seen: [URLRequest] = []
    var status = 200
    MockCloudflareProtocol.reply = { request in seen.append(request); return (status, release) }
    func fetch() -> Updater.Release?? {
        var result: Updater.Release??
        Updater(session: mocked).fetchLatest { result = .some($0) }
        let deadline = Date().addingTimeInterval(5)
        while result == nil && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        return result
    }
    do {
        seen = []
        let fetched = fetch()
        check(fetched??.version == "0.4.7" && fetched??.asset == Updater.assetName(version: "0.4.7"),
              "The latest release is read: \(String(describing: fetched))")
        let request = seen.first
        check(seen.count == 1 && request?.httpMethod == "GET" && request?.url == Updater.latestURL && request?.httpBody == nil && request?.httpBodyStream == nil
              && request?.value(forHTTPHeaderField: "Authorization") == nil && request?.value(forHTTPHeaderField: "Cookie") == nil
              && request?.value(forHTTPHeaderField: "User-Agent") == "Assetboard", "One plain GET: \(String(describing: request?.allHTTPHeaderFields))")
    }
    status = 404
    let missing = fetch()
    check(missing != nil && missing! == nil, "A failed request gives no release")
    let session = Updater.makeSession().configuration
    check(!session.httpShouldSetCookies && session.httpCookieAcceptPolicy == .never && session.urlCache == nil, "No cookies or cache")
    // The minimum macOS against the Mac: the downloaded app's own LSMinimumSystemVersion is checked again before installing
    check(Updater.runs(minimum: "15.0", on: "15.0.0") && Updater.runs(minimum: "15.0", on: "15.4.1") && Updater.runs(minimum: "15", on: "27.0.0")
          && Updater.runs(minimum: "14.6", on: "15.0") && Updater.runs(minimum: "15.4", on: "15.10.0"), "A Mac at or above the minimum runs the release")
    check(!Updater.runs(minimum: "15.0", on: "14.7.2") && !Updater.runs(minimum: "27.0", on: "26.5.0") && !Updater.runs(minimum: "15.4", on: "15.3.9")
          && !Updater.runs(minimum: "15.10", on: "15.9.0"), "An older Mac does not")
    for broken in ["", "v15", "15.0-beta", "15.0.0.1", "fifteen", "15..0", "15.0+1"] {
        check(!Updater.isSystemVersion(broken) && !Updater.runs(minimum: broken, on: "27.0.0") && !Updater.runs(minimum: "15.0", on: broken), "Not a macOS version: \(broken)")
    }
    check(Updater.isSystemVersion(Updater.systemVersion), "This Mac's version reads as one: \(Updater.systemVersion)")
    check(Updater.minimumSystemProblem(Bundle.main.infoDictionary ?? [:], system: Updater.systemVersion) == nil, "This build allows the Mac it runs on")
    check(Updater.minimumSystemProblem(["LSMinimumSystemVersion": "28.0"], system: "27.1.0") != nil && Updater.minimumSystemProblem([:], system: "27.1.0") != nil
          && Updater.minimumSystemProblem(["LSMinimumSystemVersion": "later"], system: "27.1.0") != nil
          && Updater.minimumSystemProblem(["LSMinimumSystemVersion": "15.0"], system: "15.0.0") == nil, "A bundle for a newer macOS, or one that names none, is refused")
    // The launch check: this build starts with the flag and its CLI answers with the same version; anything else is refused
    check(Updater.launchCheck(Bundle.main.bundleURL, version: Updater.currentVersion) == nil, "This build passes its own launch check")
    check(Updater.launchCheck(Bundle.main.bundleURL, version: "0.0.1") != nil, "The launch check expects the bundle's own version")
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-update-test-" + UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: scratch) }
    func fakeApp(_ folder: String, _ name: String, _ body: String) -> URL {
        let app = scratch.appendingPathComponent(folder, isDirectory: true).appendingPathComponent(name + ".app", isDirectory: true)
        let macos = app.appendingPathComponent("Contents/MacOS", isDirectory: true), executable = macos.appendingPathComponent("Assetboard")
        let info: [String: Any] = ["CFBundleExecutable": "Assetboard", "CFBundleIdentifier": "studio.assetboard.update-test", "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "0.4.7"]
        try! FileManager.default.createDirectory(at: macos, withIntermediateDirectories: true)
        try! PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: app.appendingPathComponent("Contents/Info.plist"))
        try! ("#!/bin/sh\n" + body + "\n").write(to: executable, atomically: true, encoding: .utf8)
        try! FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)
        return app
    }
    check(Updater.launchCheck(fakeApp("launch", "Starts", "echo 'Assetboard 0.4.7'"), version: "0.4.7") == nil, "An app that starts and names its version passes")
    check(Updater.launchCheck(fakeApp("launch", "Crashes", "exit 134"), version: "0.4.7") != nil, "An app that does not start is refused")
    check(Updater.launchCheck(fakeApp("launch", "Silent", "exit 0"), version: "0.4.7") != nil, "An app that does not name its version is refused")
    // The helper: swaps the apps, keeps the old one in the backup place, and puts it back when the new one does not stay running
    let helper = scratch.appendingPathComponent("install.sh"), opener = scratch.appendingPathComponent("open.sh")
    try! Updater.helperScript.write(to: helper, atomically: true, encoding: .utf8)
    try! "#!/bin/sh\n\"$1/Contents/MacOS/Assetboard\" >/dev/null 2>&1 &\n".write(to: opener, atomically: true, encoding: .utf8)
    try! FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: opener.path)
    func replace(_ round: String, new body: String) -> (status: Int32, installed: String, kept: String?, marker: Bool) {
        let old = fakeApp(round, "Assetboard", "exit 0 # old"), new = fakeApp(round + "/unpacked", "Assetboard", body)
        let backup = scratch.appendingPathComponent(round + "/support/previous.app"), marker = scratch.appendingPathComponent(round + "/support/update-rolled-back")
        try! FileManager.default.createDirectory(at: backup.deletingLastPathComponent(), withIntermediateDirectories: true)
        let gone = Process()
        gone.executableURL = URL(fileURLWithPath: "/usr/bin/true")
        try! gone.run(); gone.waitUntilExit()
        let status = Updater.run("/bin/sh", [helper.path, String(gone.processIdentifier), old.path, new.path, backup.path, marker.path], timeout: 60,
                                 environment: ["ASSETBOARD_OPEN": opener.path, "ASSETBOARD_START_WAIT": "20"]).status
        Updater.run("/usr/bin/pkill", ["-f", old.path + "/Contents/MacOS/Assetboard"])
        let read = { (app: URL) in try? String(contentsOf: app.appendingPathComponent("Contents/MacOS/Assetboard"), encoding: .utf8) }
        return (status, read(old) ?? "", read(backup), FileManager.default.fileExists(atPath: marker.path))
    }
    let kept = replace("starts", new: "sleep 10 # new")
    check(kept.status == 0 && kept.installed.contains("# new") && kept.kept?.contains("# old") == true && !kept.marker, "A new app that keeps running replaces the old one, which is kept: \(kept)")
    let back = replace("crashes", new: "exit 134 # new")
    check(back.status != 0 && back.installed.contains("# old") && back.kept == nil && back.marker, "A new app that does not start is replaced by the old one again: \(back)")
    print("PASS: version comparison and pre-releases, archive names for both editions, the site's version file and its refusals, checksums, notes excerpt, TeamIdentifier, once a day, one plain GET for each edition, minimum macOS from the version file and the bundle, launch check of this build and of fakes, helper swap with backup and rollback, when to offer the move to Applications")
}
