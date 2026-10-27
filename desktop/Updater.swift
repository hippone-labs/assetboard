import Cocoa
import CryptoKit
import Security

/// 检查更新: asks the site for its version file (https://assetboard.app/downloads/latest.json, written by desktop/package.sh; a plain
/// GET, nothing about this Mac is sent, recorded in 网络记录), offers the version when it is newer, and installs it only after the
/// download matches the file's checksum and proves to be signed by the same team, notarized and the same app. Automatic checks run
/// at most once a day and fail silently; a check from the menu says what happened. Installers live on the site only (2026-10-24).
final class Updater {
    static let site = "assetboard.app"
    static let latestURL = URL(string: "https://\(site)/downloads/latest.json")!
    static let free = freeEdition
    static let automaticKey = "updateAutomatic"
    static let lastCheckKey = "updateLastCheck"
    static let interval: TimeInterval = 86_400

    struct Release: Equatable {
        let version: String
        let notes: String
        let asset: String
        let download: URL
        /// SHA-256 of the archive, hex, when the version file gives one.
        let sha256: String?
    }

    /// On unless the person turned it off.
    static var automatic: Bool {
        get { UserDefaults.standard.object(forKey: automaticKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: automaticKey) }
    }
    static var currentVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }

    // MARK: Rules (covered by --test-update)

    /// The archive desktop/package.sh makes for each edition; a release carries both.
    static func assetName(version: String, free: Bool) -> String {
        "Assetboard-\(free ? "Free-" : "")macOS-arm64-\(version).zip"
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

    static func isDue(last: Date?, now: Date) -> Bool {
        guard let last else { return true }
        return now.timeIntervalSince(last) >= interval || now < last
    }

    /// The site's version file, {"version", "notes", "assets": [{"name", "url", "sha256"}]}, with this edition's archive; nil for an
    /// unknown version, a checksum that is not SHA-256 hex, or an archive that is missing or not under https://assetboard.app/downloads/.
    static func parse(_ data: Data, free: Bool) -> Release? {
        guard data.count <= 2_000_000, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let tag = json["version"] as? String, parts(tag) != nil else { return nil }
        let version = tag.hasPrefix("v") || tag.hasPrefix("V") ? String(tag.dropFirst()) : tag
        let name = assetName(version: version, free: free)
        guard let assets = json["assets"] as? [[String: Any]], let asset = assets.first(where: { $0["name"] as? String == name }),
              let raw = asset["url"] as? String, let url = URL(string: raw), trustedDownload(url) else { return nil }
        let digest = (asset["sha256"] as? String)?.lowercased()
        if let digest, digest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) == nil { return nil }
        return Release(version: version, notes: String((json["notes"] as? String ?? "").prefix(20_000)), asset: name, download: url, sha256: digest)
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
    /// Which edition's archive to look for: this build's own, or either one in --test-update.
    let free: Bool
    weak var window: NSWindow?
    private var checking = false
    private var installing = false
    private var timer: Timer?

    init(session: URLSession = Updater.makeSession(), free: Bool = Updater.free) { self.session = session; self.free = free }

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
        let free = self.free
        session.dataTask(with: request) { data, response, error in
            guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data else { completion(nil); return }
            completion(Updater.parse(data, free: free))
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
                if Updater.isNewer(release.version, than: Updater.currentVersion) { self.offer(release) }
                else if manual { self.say(L("已是最新版本（{version}）。", ["version": Updater.currentVersion])) }
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
    /// the bundle id is the same and the version is newer. Returns the first failure.
    static func verify(_ app: URL, current: String) -> String? {
        guard run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path]).status == 0 else { return L("签名校验没有通过") }
        guard let own = ownTeamIdentifier() else { return L("当前 App 没有开发者签名，无法比对") }
        let details = run("/usr/bin/codesign", ["-dv", app.path])
        guard details.status == 0, teamIdentifier(codesignOutput: details.output) == own else { return L("新版本的开发者与当前 App 不一致") }
        guard run("/usr/sbin/spctl", ["-a", "-vv", app.path]).status == 0 else { return L("新版本没有通过 macOS 公证检查") }
        guard let bundle = Bundle(url: app), let identifier = bundle.bundleIdentifier, identifier == Bundle.main.bundleIdentifier else { return L("新版本的 Bundle ID 与当前不一致") }
        guard let version = bundle.infoDictionary?["CFBundleShortVersionString"] as? String, isNewer(version, than: current) else { return L("安装包的版本不比当前新") }
        return nil
    }

    /// The helper waits for this process to end, moves the old app into the update's temporary folder, moves the new one into
    /// its place and opens it; if the move fails it puts the old app back and opens that.
    static let helperScript = """
        #!/bin/sh
        pid="$1"; old="$2"; new="$3"; backup="$4"
        i=0
        while kill -0 "$pid" 2>/dev/null; do
          i=$((i + 1)); [ "$i" -gt 600 ] && exit 1
          sleep 0.1
        done
        mv "$old" "$backup" || exit 1
        if mv "$new" "$old"; then /usr/bin/open "$old"; else mv "$backup" "$old"; /usr/bin/open "$old"; exit 1; fi
        """

    private func relaunch(into app: URL, work: URL, fail: @escaping (String) -> Void) {
        let script = work.appendingPathComponent("install.sh")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [script.path, String(getpid()), Bundle.main.bundleURL.path, app.path, work.appendingPathComponent("previous.app").path]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try Updater.helperScript.write(to: script, atomically: true, encoding: .utf8)
            try process.run()
        } catch { fail(L("无法启动安装")); return }
        NSApplication.shared.terminate(nil)
    }

    @discardableResult static func run(_ tool: String, _ arguments: [String]) -> (status: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do { try process.run() } catch { return (-1, "") }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return (process.terminationStatus, String(decoding: data, as: UTF8.self))
    }
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
    check(Updater.compare("0.4", "0.4.0") == .orderedSame && Updater.compare("v0.4.6", "0.4.6+12") == .orderedSame, "Equal versions compare the same")
    check(!Updater.isNewer("0.4.6", than: "0.4.6"), "The same version is not newer")
    for broken in ["", "garbage", "0..1", "1.0.0-", "-1.0", "1.2.3.4.5", "1.0.0-beta..1"] {
        check(Updater.compare(broken, "0.4.6") == nil && !Updater.isNewer(broken, than: "0.0.1"), "Not a version: \(broken)")
    }
    // Asset names, the same rule as desktop/package.sh
    check(Updater.assetName(version: "0.4.7", free: false) == "Assetboard-macOS-arm64-0.4.7.zip", "Full edition archive name")
    check(Updater.assetName(version: "0.4.7", free: true) == "Assetboard-Free-macOS-arm64-0.4.7.zip", "Free edition archive name")
    // The version file on the site
    let base = "https://\(Updater.site)/downloads/"
    let sum = String(repeating: "ab", count: 32)
    var release: [String: Any] = ["version": "v0.4.7", "notes": "## What's new\n\n- Faster panorama\n- Fixes",
                                  "assets": [["name": "Assetboard-Free-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-Free-macOS-arm64-0.4.7.zip"],
                                             ["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip", "sha256": sum.uppercased()]]]
    func parse(_ free: Bool) -> Updater.Release? { Updater.parse(try! JSONSerialization.data(withJSONObject: release), free: free) }
    let full = parse(false), free = parse(true)
    check(full?.version == "0.4.7" && full?.asset == "Assetboard-macOS-arm64-0.4.7.zip" && full?.download.lastPathComponent == full?.asset && full?.sha256 == sum,
          "Full edition picks its archive and checksum: \(String(describing: full))")
    check(free?.asset == "Assetboard-Free-macOS-arm64-0.4.7.zip" && free?.download.lastPathComponent == free?.asset && free?.sha256 == nil, "Free edition picks its archive: \(String(describing: free))")
    check(Updater.excerpt(full?.notes ?? "") == "What's new\n- Faster panorama\n- Fixes", "Notes excerpt: \(Updater.excerpt(full?.notes ?? ""))")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse(true) == nil && parse(false) != nil, "A version file without the free archive offers nothing to the free edition")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "https://downloads.example.com/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse(false) == nil, "An archive on another host is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "https://\(Updater.site)/other/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse(false) == nil, "An archive outside /downloads/ is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": "http://\(Updater.site)/downloads/Assetboard-macOS-arm64-0.4.7.zip"]]
    check(parse(false) == nil, "A plain http archive is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip?x=1"]]
    check(parse(false) == nil, "A query string is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip", "sha256": "nope"]]
    check(parse(false) == nil, "A checksum that is not SHA-256 hex is refused")
    release["assets"] = [["name": "Assetboard-macOS-arm64-0.4.7.zip", "url": base + "Assetboard-macOS-arm64-0.4.7.zip"]]
    release["version"] = "nightly"
    check(parse(false) == nil, "A version that is not a version is not offered")
    check(Updater.parse(Data("<html>".utf8), free: false) == nil, "Not JSON")
    check(Updater.digest(Data("abc".utf8)) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 of a download, lower-case hex")
    // Signatures and timing
    check(Updater.teamIdentifier(codesignOutput: "Executable=/Applications/Assetboard.app/Contents/MacOS/Assetboard\nIdentifier=studio.assetboard.local\nTeamIdentifier=ABCDE12345\n") == "ABCDE12345", "TeamIdentifier is read")
    check(Updater.teamIdentifier(codesignOutput: "Identifier=studio.assetboard.local\nTeamIdentifier=not set\n") == nil && Updater.teamIdentifier(codesignOutput: "") == nil, "Ad-hoc signing has no team")
    let now = Date()
    check(Updater.isDue(last: nil, now: now) && Updater.isDue(last: now.addingTimeInterval(-86_400), now: now) && !Updater.isDue(last: now.addingTimeInterval(-3600), now: now), "At most once a day")
    // The request: one GET to the site's version file, with nothing about this Mac. Both editions are fetched whichever this build is.
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    let mocked = URLSession(configuration: configuration)
    check(Updater(session: mocked).free == Updater.free, "An updater looks for this build's own archive by default")
    release["version"] = "v0.4.7"
    release["assets"] = [false, true].map { free -> [String: String] in ["name": Updater.assetName(version: "0.4.7", free: free), "url": base + Updater.assetName(version: "0.4.7", free: free)] }
    var seen: [URLRequest] = []
    var status = 200
    MockCloudflareProtocol.reply = { request in seen.append(request); return (status, release) }
    func fetch(free: Bool) -> Updater.Release?? {
        var result: Updater.Release??
        Updater(session: mocked, free: free).fetchLatest { result = .some($0) }
        let deadline = Date().addingTimeInterval(5)
        while result == nil && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        return result
    }
    for free in [false, true] {
        seen = []
        let fetched = fetch(free: free)
        check(fetched??.version == "0.4.7" && fetched??.asset == Updater.assetName(version: "0.4.7", free: free),
              "The latest release is read for the \(free ? "free" : "full") edition: \(String(describing: fetched))")
        let request = seen.first
        check(seen.count == 1 && request?.httpMethod == "GET" && request?.url == Updater.latestURL && request?.httpBody == nil && request?.httpBodyStream == nil
              && request?.value(forHTTPHeaderField: "Authorization") == nil && request?.value(forHTTPHeaderField: "Cookie") == nil
              && request?.value(forHTTPHeaderField: "User-Agent") == "Assetboard", "One plain GET: \(String(describing: request?.allHTTPHeaderFields))")
    }
    status = 404
    let missing = fetch(free: Updater.free)
    check(missing != nil && missing! == nil, "A failed request gives no release")
    let session = Updater.makeSession().configuration
    check(!session.httpShouldSetCookies && session.httpCookieAcceptPolicy == .never && session.urlCache == nil, "No cookies or cache")
    print("PASS: version comparison and pre-releases, archive names for both editions, the site's version file and its refusals, checksums, notes excerpt, TeamIdentifier, once a day, one plain GET for each edition")
}
