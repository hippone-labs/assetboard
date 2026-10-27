import Cocoa
import WebKit
import Security
import CryptoKit
import UniformTypeIdentifiers

final class CloudflareConnector {
    private let service = "studio.assetboard.local.cloudflare"
    private let account = "zone-read-token"
    private let session: URLSession

    init(session: URLSession = NetworkLog.session("Cloudflare")) { self.session = session }

    func token() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let data = Data(token.utf8)
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess { return true }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func disconnect() -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    func listZones(token: String, completion: @escaping ([[String: String]]?, String?) -> Void) {
        var all: [[String: String]] = []
        func page(_ number: Int) {
            var components = URLComponents(string: "https://api.cloudflare.com/client/v4/zones")!
            components.queryItems = [URLQueryItem(name: "page", value: String(number)), URLQueryItem(name: "per_page", value: "50")]
            var request = URLRequest(url: components.url!)
            request.httpMethod = "GET"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 20
            request.cachePolicy = .reloadIgnoringLocalCacheData
            session.dataTask(with: request) { data, response, error in
                if error != nil { completion(nil, L("网络请求失败，请检查连接后重试。")); return }
                guard let http = response as? HTTPURLResponse else { completion(nil, L("未收到有效的平台响应。")); return }
                if http.statusCode == 401 || http.statusCode == 403 { completion(nil, L("权限验证失败。请确认令牌具有 Zone Read 权限和正确的 Zone 范围。")); return }
                guard (200...299).contains(http.statusCode), let data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      json["success"] as? Bool == true,
                      let zones = json["result"] as? [[String: Any]],
                      let info = json["result_info"] as? [String: Any],
                      let totalPages = info["total_pages"] as? Int,
                      totalPages >= 0 && totalPages <= 100 && (totalPages >= number || (number == 1 && totalPages == 0 && zones.isEmpty)) else {
                    completion(nil, L("Zone 列表响应不完整，同步未写入资产板。")); return
                }
                for zone in zones {
                    guard let id = zone["id"] as? String, !id.isEmpty,
                          let name = zone["name"] as? String, !name.isEmpty else {
                        completion(nil, L("Zone 数据缺少标识或名称，同步未写入资产板。")); return
                    }
                    let account = (zone["account"] as? [String: Any])?["name"] as? String ?? ""
                    all.append(["id": id, "name": name, "account": account, "status": zone["status"] as? String ?? ""])
                }
                if number < totalPages { page(number + 1) }
                else { completion(all, nil) }
            }.resume()
        }
        page(1)
    }
}

final class GitHubConnector {
    private let service = "studio.assetboard.local.github"
    private let account = "metadata-read-token"
    private let session: URLSession

    init(session: URLSession = NetworkLog.session("GitHub")) { self.session = session }

    func token() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let data = Data(token.utf8)
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess { return true }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func disconnect() -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    func listRepositories(token: String, completion: @escaping ([[String: Any]]?, String?) -> Void) {
        var all: [[String: Any]] = []
        func page(_ number: Int) {
            var components = URLComponents(string: "https://api.github.com/user/repos")!
            components.queryItems = [URLQueryItem(name: "per_page", value: "100"), URLQueryItem(name: "page", value: String(number)), URLQueryItem(name: "sort", value: "updated"), URLQueryItem(name: "direction", value: "desc")]
            var request = URLRequest(url: components.url!)
            request.httpMethod = "GET"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.setValue("2026-03-10", forHTTPHeaderField: "X-GitHub-Api-Version")
            request.timeoutInterval = 20
            session.dataTask(with: request) { data, response, error in
                if error != nil { completion(nil, L("网络请求失败，请检查连接后重试。")); return }
                guard let http = response as? HTTPURLResponse else { completion(nil, L("未收到有效的平台响应。")); return }
                if http.statusCode == 401 { completion(nil, L("GitHub 令牌无效或已过期。")); return }
                if http.statusCode == 403 { completion(nil, L("GitHub 拒绝访问：检查仓库范围、组织审批或 API 限流。")); return }
                guard http.statusCode == 200, let data,
                      let repositories = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    completion(nil, L("GitHub 仓库列表响应不完整，同步未写入资产板。")); return
                }
                for repository in repositories {
                    guard let id = repository["id"] as? Int, id > 0,
                          let name = repository["full_name"] as? String, !name.isEmpty,
                          let owner = (repository["owner"] as? [String: Any])?["login"] as? String,
                          let rawURL = repository["html_url"] as? String,
                          let url = URL(string: rawURL), url.scheme == "https", url.host == "github.com",
                          url.path == "/" + name, url.user == nil, url.password == nil,
                          url.query == nil, url.fragment == nil else {
                        completion(nil, L("GitHub 仓库数据缺少标识、归属或有效链接，同步未写入资产板。")); return
                    }
                    all.append(["id": String(id), "name": name, "owner": owner, "url": rawURL,
                                "description": repository["description"] as? String ?? "",
                                "updatedAt": repository["updated_at"] as? String ?? "",
                                "pushedAt": repository["pushed_at"] as? String ?? "",
                                "private": repository["private"] as? Bool ?? false,
                                "archived": repository["archived"] as? Bool ?? false])
                }
                if repositories.count == 100 {
                    guard number < 100 else { completion(nil, L("仓库列表超过当前分页上限，同步未写入资产板。")); return }
                    page(number + 1)
                } else { completion(all, nil) }
            }.resume()
        }
        page(1)
    }
}

// A local-only host. No HTTP server, remote renderer, or account is required.
final class BoardStore {
    let directory: URL
    let file: URL
    let database: LocalDatabase
    init(root: URL? = nil) throws {
        directory = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Assetboard", isDirectory: true)
        file = directory.appendingPathComponent("board.json")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        database = try LocalDatabase(file: directory.appendingPathComponent("assetboard.sqlite"))
    }
    func validate(_ value: Any) throws -> [String: Any] {
        let categories: Set<String> = ["bankcard", "phone", "server", "appleid", "google", "ai", "domain", "subscription", "database", "license", "repository", "deployment", "storage"]
        guard let board = value as? [String: Any],
              let blocks = board["blocks"] as? [[String: Any]],
              let assets = board["assets"] as? [[String: Any]],
              blocks.allSatisfy({ categories.contains($0["id"] as? String ?? "") }),
              assets.allSatisfy({ ($0["id"] as? String) != nil && ($0["name"] as? String) != nil && categories.contains($0["type"] as? String ?? "") }) else {
            throw NSError(domain: "Assetboard", code: 1, userInfo: [NSLocalizedDescriptionKey: L("资产文件格式无法识别，原文件未被修改。")])
        }
        return board
    }
    func load() throws -> [String: Any]? {
        if let saved = try database.loadBoard() { return try validate(saved) }
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let legacy = try validate(JSONSerialization.jsonObject(with: Data(contentsOf: file)))
        try database.saveBoard(legacy)
        return legacy
    }
    func save(_ value: Any) throws {
        let board = try validate(value)
        let bytes = try JSONSerialization.data(withJSONObject: board, options: [.prettyPrinted, .sortedKeys])
        try database.saveBoard(board)
        do {
            if FileManager.default.fileExists(atPath: file.path) {
                let previous = try Data(contentsOf: file)
                let backup = directory.appendingPathComponent("board.previous.json")
                try previous.write(to: backup, options: .atomic)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: backup.path)
            }
            try bytes.write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch {
            // SQLite is the source of truth; a failed JSON mirror must not report a lost save.
            NSLog("Assetboard JSON mirror could not be updated: %@", error.localizedDescription)
        }
    }
}

/// `--demo`: the fictional board from demo-data.js, for screenshots. Uses a throwaway temporary store instead of
/// Application Support, never reads the Keychain and refuses network/Keychain imports, sync, AI, OCR and export. In-page CSV/JSON demo samples still run in JS without saving.
let demoMode = CommandLine.arguments.contains("--demo")

/// The free edition (`ASSETBOARD_EDITION=free desktop/build.sh`): no MCP, Cloudflare, GitHub or AI.
#if ASSETBOARD_FREE
let freeEdition = true
#else
let freeEdition = false
#endif

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var store: BoardStore!
    var ai: AIRecognizer!
    var agentInbox: AgentInbox?
    var agentServer: AgentSocketServer?
    var exchangeRates: ExchangeRates?
    /// Calls from assetboard-cli waiting for the page's answer, by request id.
    var agentReplies: [String: (Data) -> Void] = [:]
    /// Method and start of each waiting call, for 网络记录.
    var agentCalls: [String: (method: String, started: Date)] = [:]
    let cloudflare = CloudflareConnector()
    let github = GitHubConnector()
    #if !ASSETBOARD_FREE
    let probes = ProbeSources()
    /// Sources being read now: a refresh asked again while one runs is dropped, not queued.
    var probeLoading: Set<String> = []
    /// Reads with each private panel's session (JWT in memory, one login at a time, rate-limited).
    let probeClient = ProbeClient()
    /// Live readings over each source's WebSocket, opened and closed when the page asks (probe-pro.js decides when).
    lazy var probeLive: ProbeLive = {
        let live = ProbeLive()
        live.emit = { [weak self] message in self?.probeResult(message) }
        return live
    }()
    #endif
    let icons = IconFetcher()
    let updater = Updater()
    var localRoot: URL!
    /// The page's top bar is the title bar (see WindowChrome.swift); its height comes from the page.
    var topBarHeight: CGFloat = 40
    let titleDrag = TitleBarDragView()
    var titleDragHeight: NSLayoutConstraint!
    var connectionStateJSON: String?
    var boardLoaded = false
    var openedIconFetch = false
    let reminders = ReminderScheduler()
    /// A notification clicked before the page finished loading (it launched the app) waits here.
    var pendingReminderOpen: String?
    var notificationStatus: String?
    /// 反馈与建议: a mail to the project address (the site's contact page says the same); GitHub issues work too.
    static let feedbackURL = URL(string: "mailto:assetboard@163.com?subject=Assetboard%20%E5%8F%8D%E9%A6%88")!

    func publishConnectionState() {
        guard boardLoaded, let connectionStateJSON else { return }
        webView.evaluateJavaScript("window.assetboardConnectionState?.(\(connectionStateJSON))")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        boardLoaded = true
        publishConnectionState()
        deliverAgentFiles()
        deliverIntake()
        if let pending = pendingReminderOpen { pendingReminderOpen = nil; webView.evaluateJavaScript("window.assetboardReminderOpen?.(\(pending))") }
        publishNotificationStatus()
        // tools/site-screenshots.sh: `--demo --snapshot=<path>` draws the window into a PNG once the board has settled, then quits.
        if demoMode, let path = CommandLine.arguments.first(where: { $0.hasPrefix("--snapshot=") })?.dropFirst("--snapshot=".count) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.demoSnapshot(to: String(path)) }
        }
        // `--demo --open-icon-fetch` opens 获取网站图标 once the board is up, for screenshots. Ignored outside demo mode.
        if demoMode, CommandLine.arguments.contains("--open-icon-fetch"), !openedIconFetch { openedIconFetch = true; openIconBatch() }
    }

    func publishNotificationStatus() {
        guard boardLoaded, let notificationStatus else { return }
        webView.evaluateJavaScript("window.assetboardConnectionState?.({notifications:'\(notificationStatus)'})")
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        guard !demoMode else { return }
        reminders.onOpen = { [weak self] assetId in self?.openReminder(assetId) }
        reminders.onStatus = { [weak self] status in
            guard let self, status != self.notificationStatus else { return }
            self.notificationStatus = status
            self.publishNotificationStatus()
        }
        reminders.start()
    }

    /// A click on a reminder brings the window forward and opens the record (or 即将到来 for a merged day).
    func openReminder(_ assetId: String?) {
        window?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        let argument = assetId.flatMap { try? JSONSerialization.data(withJSONObject: [$0]) }.flatMap { String(data: $0, encoding: .utf8) }.map { "\($0)[0]" } ?? "null"
        if boardLoaded { webView.evaluateJavaScript("window.assetboardReminderOpen?.(\(argument))") } else { pendingReminderOpen = argument }
    }

    // MARK: Dock drops, "Open With", the Services menu and the Inbox folder
    // Everything handed over from outside the window goes to the page's queue (`assetboardIntake`), which opens it when
    // nothing else is on screen and otherwise keeps it in 待确认. Screenshots and PDFs are recognised here, on this Mac.
    var pendingIntake: [[String: String]] = []
    static let openTextTypes = ["csv", "tsv", "json", "eml"]
    static let openImageTypes = ["png", "jpg", "jpeg", "webp", "pdf"]

    // In demo mode tables, backups and mails still open into the preview (the page keeps what is imported on the demo board and
    // saves nothing); screenshots and PDFs are not recognised there, since recognising keeps a copy as evidence.
    func application(_ sender: NSApplication, open urls: [URL]) {
        let files = urls.filter(\.isFileURL)
        var images: [URL] = []
        for url in files.prefix(20) {
            let ext = url.pathExtension.lowercased(), name = url.lastPathComponent
            if Self.openImageTypes.contains(ext) {
                if demoMode { pendingIntake.append(["source": "open", "name": name, "error": L("演示模式不识别截图和 PDF")]) } else { images.append(url) }
                continue
            }
            guard Self.openTextTypes.contains(ext) else { pendingIntake.append(["source": "open", "name": name, "error": L("不支持这种文件")]); continue }
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            guard size > 0, size <= 2 * 1024 * 1024, let data = try? Data(contentsOf: url) else {
                pendingIntake.append(["source": "open", "name": name, "error": size > 2 * 1024 * 1024 ? L("文件超过 2 MB") : L("无法读取")])
                continue
            }
            // Mail exports are not always UTF-8; Latin-1 keeps every byte so the page's MIME decoding still works.
            let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
            pendingIntake.append(["source": "open", "name": name, "text": text])
        }
        if files.count > 20 { pendingIntake.append(["source": "open", "name": L("另外 {n} 个文件", ["n": files.count - 20]), "error": L("一次最多 20 个，未读取")]) }
        if images.count > 10 { pendingIntake.append(["source": "open", "name": L("另外 {n} 张截图或 PDF", ["n": images.count - 10]), "error": L("一次最多识别 10 个，未读取")]) }
        if !images.isEmpty { recognizeFiles(Array(images.prefix(10))) }
        deliverIntake(activate: true)
    }

    /// Services menu: "添加到 Assetboard" for selected text anywhere. It only fills the add panel; nothing is recognised or sent.
    @objc func addText(_ pboard: NSPasteboard, userData: String, error: AutoreleasingUnsafeMutablePointer<NSString>) {
        guard !demoMode, let text = pboard.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
        pendingIntake.append(["source": "service", "name": L("选中的文字"), "text": String(text.prefix(20_000))])
        DispatchQueue.main.async { self.deliverIntake(activate: true) }
    }

    /// Waits for the page to load, so a cold launch from the Dock or Services still arrives; nothing is dropped on the way.
    func deliverIntake(activate: Bool = false) {
        guard boardLoaded, !pendingIntake.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: pendingIntake), let json = String(data: data, encoding: .utf8) else { return }
        pendingIntake = []
        if activate {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        webView.evaluateJavaScript("window.assetboardIntake?.(\(json))")
    }

    /// A call from assetboard-cli (or its MCP server) goes to the page, which owns the board; its reply goes back over the
    /// socket. Calls that arrive before the board is loaded, or that get no answer in 20 s, fail with a reason.
    func handleAgentRequest(_ request: [String: Any], reply: @escaping (Data) -> Void) {
        guard let method = request["method"] as? String, !method.isEmpty, method.count <= 40 else {
            recordAgentCall("?", ok: false, started: Date(), note: L("缺少 method")); reply(AgentSocketServer.failure(L("缺少 method"))); return
        }
        guard boardLoaded else {
            recordAgentCall(method, ok: false, started: Date(), note: L("App 正在启动")); reply(AgentSocketServer.failure(L("Assetboard 正在启动，请稍后再试"))); return
        }
        let id = UUID().uuidString
        let call: [String: Any] = ["requestId": id, "method": method, "params": request["params"] as? [String: Any] ?? [:]]
        guard let data = try? JSONSerialization.data(withJSONObject: call), let json = String(data: data, encoding: .utf8) else {
            recordAgentCall(method, ok: false, started: Date(), note: L("请求无法编码")); reply(AgentSocketServer.failure(L("请求无法编码"))); return
        }
        agentCalls[id] = (method, Date())
        agentReplies[id] = reply
        webView.evaluateJavaScript("typeof window.assetboardAgent==='function'?(window.assetboardAgent(\(json)),'ok'):'missing'") { [weak self] result, error in
            if error != nil || (result as? String) != "ok" { self?.finishAgentRequest(id, AgentSocketServer.failure(L("页面没有响应"))) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in self?.finishAgentRequest(id, AgentSocketServer.failure(L("Assetboard 没有及时回复"))) }
    }
    func finishAgentRequest(_ id: String, _ reply: Data) {
        guard let send = agentReplies.removeValue(forKey: id) else { return }
        if let call = agentCalls.removeValue(forKey: id) {
            let answer = (try? JSONSerialization.jsonObject(with: reply)) as? [String: Any]
            recordAgentCall(call.method, ok: answer?["ok"] as? Bool == true, started: call.started, received: Int64(reply.count), note: answer?["error"] as? String)
        }
        send(reply)
    }
    func recordAgentCall(_ method: String, ok: Bool, started: Date, received: Int64 = 0, note: String? = nil) {
        NetworkLog.shared.record(direction: "in", service: "MCP", method: method, host: L("本机 assetboard-cli"), path: "agent.sock", ok: ok,
                                 received: received, milliseconds: Int(Date().timeIntervalSince(started) * 1000), note: note)
    }
    func publishNetworkLog() {
        let rows = (try? store.database.listNetworkLog(limit: NetworkLog.keep)) ?? []
        guard let data = try? JSONSerialization.data(withJSONObject: rows), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.assetboardNetworkLog?.(\(json))")
    }

    /// Inbox files join the same queue; each stays in the folder until the page sends `intakeDone`. Not in demo mode.
    func deliverAgentFiles() {
        guard boardLoaded, !demoMode, let files = agentInbox?.takePending(), !files.isEmpty else { return }
        pendingIntake += files.map { $0.merging(["source": "inbox"]) { $1 } }
        deliverIntake()
    }
    func applicationDidBecomeActive(_ notification: Notification) {
        deliverAgentFiles()
        if !demoMode { reminders.refreshStatus() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            // `--demo --dark` / `--demo --light` pin the appearance for screenshots; otherwise the app follows the system.
            if demoMode, CommandLine.arguments.contains("--dark") { NSApp.appearance = NSAppearance(named: .darkAqua) }
            if demoMode, CommandLine.arguments.contains("--light") { NSApp.appearance = NSAppearance(named: .aqua) }
            let temporary = FileManager.default.temporaryDirectory
            if demoMode { // earlier demo runs that were killed never reached applicationWillTerminate
                for old in (try? FileManager.default.contentsOfDirectory(at: temporary, includingPropertiesForKeys: nil)) ?? [] where old.lastPathComponent.hasPrefix("assetboard-demo-") { try? FileManager.default.removeItem(at: old) }
            }
            let demoRoot = temporary.appendingPathComponent("assetboard-demo-" + UUID().uuidString, isDirectory: true)
            store = try demoMode ? BoardStore(root: demoRoot) : BoardStore()
            ai = AIRecognizer(directory: store.directory)
            if !demoMode { NSApp.servicesProvider = self; NSUpdateDynamicServices() }
            if !demoMode {
                let inbox = AgentInbox(root: store.directory)
                inbox.onChange = { [weak self] in self?.deliverAgentFiles() }
                inbox.start()
                agentInbox = inbox
                NetworkLog.shared.database = store.database
                exchangeRates = ExchangeRates(directory: store.directory)
                NetworkLog.shared.onEntry = { [weak self] entry in
                    guard let self, self.boardLoaded, let data = try? JSONSerialization.data(withJSONObject: entry),
                          let json = String(data: data, encoding: .utf8) else { return }
                    self.webView.evaluateJavaScript("window.assetboardNetworkEntry?.(\(json))")
                }
                #if !ASSETBOARD_FREE
                let server = AgentSocketServer(path: store.directory.appendingPathComponent("agent.sock").path)
                server.onRequest = { [weak self] request, reply in
                    guard let self else { reply(AgentSocketServer.failure(L("Assetboard 正在退出"))); return }
                    self.handleAgentRequest(request, reply: reply)
                }
                do { try server.start(); agentServer = server } catch { NSLog("Assetboard agent socket unavailable: %@", "\(error)") }
                #endif
            }
            let saved: [String: Any]? = demoMode ? nil : try store.load()
            guard let root = Bundle.main.resourceURL?.appendingPathComponent("Board", isDirectory: true) else { return }
            localRoot = root
            let controller = WKUserContentController()
            let initial = nativeInitial(saved: saved)
            let json = String(data: try JSONSerialization.data(withJSONObject: initial), encoding: .utf8)!
            controller.addUserScript(WKUserScript(source: "window.__ASSETBOARD_NATIVE__ = \(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
            controller.add(self, name: "assetboard")
            let configuration = WKWebViewConfiguration()
            configuration.userContentController = controller
            configuration.websiteDataStore = .nonPersistent()
            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.navigationDelegate = self
            webView.setValue(false, forKey: "drawsBackground")
            window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
            window.title = demoMode ? L("Assetboard（演示数据）") : "Assetboard"
            // No fixed appearance: the window, native glass and the page's prefers-color-scheme follow the system.
            // No toolbar: the title bar is transparent and the page draws the whole window under it. Its top bar takes the
            // traffic lights (placed by TrafficLights), search and the window-wide buttons; the sidebar and the card sit below.
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.titlebarSeparatorStyle = .none
            window.isOpaque = false
            window.backgroundColor = NSColor(calibratedRed: 0.80, green: 0.85, blue: 0.82, alpha: 0.92)
            window.minSize = NSSize(width: 900, height: 600)
            // The window's background: native glass behind a transparent page, from the very top. .sidebar is the material that
            // lets the desktop through most clearly in both appearances (.underWindowBackground read as flat grey in dark mode);
            // the page lays a thin veil of its canvas over it (material.css, v24 · Backdrop) and keeps the content card solid.
            // Active even when the window is not, so the window does not turn flat when it loses focus.
            let glass = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: 1320, height: 900))
            glass.material = .sidebar
            glass.blendingMode = .behindWindow
            glass.state = .active
            webView.translatesAutoresizingMaskIntoConstraints = false
            glass.addSubview(webView)
            titleDrag.translatesAutoresizingMaskIntoConstraints = false
            glass.addSubview(titleDrag, positioned: .above, relativeTo: webView)
            window.contentView = glass
            titleDragHeight = titleDrag.heightAnchor.constraint(equalToConstant: topBarHeight)
            NSLayoutConstraint.activate([
                webView.topAnchor.constraint(equalTo: glass.topAnchor),
                webView.leadingAnchor.constraint(equalTo: glass.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: glass.trailingAnchor),
                webView.bottomAnchor.constraint(equalTo: glass.bottomAnchor),
                titleDrag.topAnchor.constraint(equalTo: glass.topAnchor),
                titleDrag.leadingAnchor.constraint(equalTo: glass.leadingAnchor),
                titleDrag.trailingAnchor.constraint(equalTo: glass.trailingAnchor),
                titleDragHeight
            ])
            window.delegate = self
            // Full screen hides the traffic lights (the page gives their room back) and presents an open panorama.
            for (name, flag) in [(NSWindow.didEnterFullScreenNotification, "true"), (NSWindow.didExitFullScreenNotification, "false")] {
                NotificationCenter.default.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
                    self?.webView.evaluateJavaScript("window.assetboardWindowState?.({fullScreen:\(flag)})", completionHandler: nil)
                    self?.placeTrafficLights()
                }
            }
            // 跟随系统: a new accent colour in System Settings reaches the page at once.
            NotificationCenter.default.addObserver(forName: NSColor.systemColorsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
                self?.webView.evaluateJavaScript("window.assetboardSystemAccent?.('\(ThemePreference.systemAccentHex)')", completionHandler: nil)
            }
            window.isReleasedWhenClosed = false
            window.setFrameAutosaveName("AssetboardMainWindow")
            if !window.setFrameUsingName("AssetboardMainWindow") { window.center() }
            // Screenshots: `--demo --window-size=1440x897` gives the window that content size, centred, and never remembers it.
            if demoMode, let size = CommandLine.arguments.first(where: { $0.hasPrefix("--window-size=") })?.dropFirst("--window-size=".count)
                .split(separator: "x").compactMap({ Double($0) }), size.count == 2, size.allSatisfy({ $0 >= 600 && $0 <= 4000 }) {
                window.setFrameAutosaveName("")
                window.minSize = NSSize(width: 600, height: 400)
                window.setContentSize(NSSize(width: size[0], height: size[1]))
                window.center()
            }
            createMenu()
            if !demoMode { updater.window = window; updater.startAutomaticChecks() }
            webView.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
            window.makeKeyAndOrderFront(nil)
            placeTrafficLights()
            NSApplication.shared.activate(ignoringOtherApps: true)
            if demoMode || freeEdition {
                // The free edition has no connectors or AI, so it never reads their tokens from the Keychain.
                connectionStateJSON = "{\"cloudflareChecking\":false,\"githubChecking\":false,\"cloudflareConnected\":false,\"githubConnected\":false,\"aiKeySaved\":false}"
            } else { DispatchQueue.global(qos: .utility).async {
                let connections: [String: Any] = ["cloudflareConnected": self.cloudflare.token() != nil, "githubConnected": self.github.token() != nil,
                                                  "aiKeySaved": self.ai.key() != nil, "cloudflareChecking": false, "githubChecking": false]
                guard let bytes = try? JSONSerialization.data(withJSONObject: connections),
                      let json = String(data: bytes, encoding: .utf8) else { return }
                DispatchQueue.main.async { self.connectionStateJSON = json; self.publishConnectionState() }
            } }
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                if self.connectionStateJSON == nil {
                    self.connectionStateJSON = "{\"cloudflareChecking\":false,\"githubChecking\":false,\"keychainUnavailable\":true}"
                    self.publishConnectionState()
                }
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = L("无法打开本地资产板")
            alert.informativeText = error.localizedDescription + "\n" + L("数据位于 ~/Library/Application Support/Assetboard/。请保留原文件。")
            alert.addButton(withTitle: L("退出"))
            alert.runModal()
            NSApplication.shared.terminate(nil)
        }
    }

    func placeTrafficLights() { if let window { TrafficLights.place(in: window, barHeight: topBarHeight) } }
    func windowDidResize(_ notification: Notification) { placeTrafficLights() }
    func windowDidBecomeKey(_ notification: Notification) { placeTrafficLights() }
    func windowDidResignKey(_ notification: Notification) { placeTrafficLights() }
    func windowDidChangeBackingProperties(_ notification: Notification) { placeTrafficLights() }
    @objc func addBlock() { webView.evaluateJavaScript("document.querySelector('#add-block').click()") }
    @objc func focusSearch() { window.makeFirstResponder(webView); webView.evaluateJavaScript("focusSearchBox()") }
    @objc func showKeyboardHelp() { webView.evaluateJavaScript("toggleKeysHelp(true)") }
    @objc func toggleBoardSidebar() { webView.evaluateJavaScript("toggleSidebar()") }
    @objc func openPanorama() { webView.evaluateJavaScript("togglePanorama()") }
    @objc func openTheme() { webView.evaluateJavaScript("themeDialog()") }
    func demoBlocked() { webView.evaluateJavaScript("window.assetboardDemoBlocked?.()") }
    @objc func openCloudflare() { if demoMode { demoBlocked(); return }; webView.evaluateJavaScript("cloudflareDialog()") }
    @objc func openGitHub() { if demoMode { demoBlocked(); return }; webView.evaluateJavaScript("githubDialog()") }
    @objc func openImport() { webView.evaluateJavaScript("importHub()") }
    @objc func openInbox() { webView.evaluateJavaScript("inboxDialog()") }
    // Demo mode opens it too: the page answers its fetches with built-in demo marks and sends nothing here.
    @objc func openIconBatch() { webView.evaluateJavaScript("iconBatchDialog()") }
    @objc func openAgentSetup() { webView.evaluateJavaScript("agentSetupDialog()") }
    @objc func openNetworkLog() { webView.evaluateJavaScript("networkDialog()") }
    @objc func openAISettings() { if demoMode { demoBlocked(); return }; webView.evaluateJavaScript("aiDialog()") }
    func aiResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardAIResult(\(json))")
        }
    }
    func saveAISettings(_ body: [String: Any]) {
        let supplied = (body["apiKey"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard supplied.count <= 512, !supplied.contains(where: { $0.isWhitespace }) else { aiResult(["kind": "settings", "ok": false, "error": L("API key 格式无效。")]); return }
        let settings: AISettings
        do {
            settings = try AIRecognizer.validate(provider: body["provider"] as? String ?? "", baseURL: body["baseURL"] as? String ?? "",
                                                 model: body["model"] as? String ?? "", autoImages: body["autoImages"] as? Bool ?? true)
        } catch { aiResult(["kind": "settings", "ok": false, "error": error.localizedDescription]); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let key = supplied.isEmpty ? self.ai.key() : supplied
            guard key != nil || AIRecognizer.isLocal(URL(string: settings.baseURL)!) else {
                self.aiResult(["kind": "settings", "ok": false, "error": L("请填写 API key。")]); return
            }
            // A tiny request proves the endpoint, model and key work before anything is stored.
            self.ai.recognize(settings: settings, key: key, text: "连接测试：没有需要分析的材料，请只回复 {\"items\":[]}", image: nil) { result in
                if case .failure(let error) = result { self.aiResult(["kind": "settings", "ok": false, "error": error.localizedDescription]); return }
                do { try self.ai.saveSettings(settings) } catch { self.aiResult(["kind": "settings", "ok": false, "error": L("无法保存 AI 设置：{error}", ["error": error.localizedDescription])]); return }
                if !supplied.isEmpty && !self.ai.saveKey(supplied) {
                    self.aiResult(["kind": "settings", "ok": false, "error": L("无法将 API key 保存到 macOS 钥匙串。")]); return
                }
                self.aiResult(["kind": "settings", "ok": true, "ai": settings.summary, "aiKeySaved": self.ai.key() != nil])
            }
        }
    }
    func recognizeWithAI(_ body: [String: Any]) {
        let requestId = body["requestId"] as? Int ?? 0
        let evidenceId = body["evidenceId"] as? String
        let pasted = String((body["text"] as? String ?? "").prefix(8000))
        DispatchQueue.global(qos: .userInitiated).async {
            func fail(_ message: String) { self.aiResult(["kind": "recognize", "requestId": requestId, "ok": false, "error": message]) }
            guard let settings = self.ai.loadSettings() else { fail(L("尚未配置 AI 识别。")); return }
            let key = self.ai.key()
            guard key != nil || AIRecognizer.isLocal(URL(string: settings.baseURL)!) else { fail(L("没有找到已保存的 API key，请在 AI 识别设置中重新填写。")); return }
            let today = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
            var text = "今天：\(today)\n"
            var image: Data?
            if let evidenceId {
                guard let row = try? self.store.database.evidence(id: evidenceId) else { fail(L("找不到这条导入资料。")); return }
                let payload = (try? JSONSerialization.jsonObject(with: Data((row["payload"] ?? "{}").utf8))) as? [String: Any] ?? [:]
                if row["kind"] == "gmail" {
                    text += "来源：Gmail 邮件\n发件人：\(row["source"] ?? "")\n主题：\(row["title"] ?? "")\n邮件日期：\(payload["date"] as? String ?? "")\n正文：\n\(row["body"] ?? "")"
                } else {
                    // Send the original screenshot only when it is still the same file that was imported.
                    if let path = payload["file"] as? String, let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
                       "ocr-" + SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == evidenceId {
                        image = AIRecognizer.preparedImage(at: URL(fileURLWithPath: path))
                    }
                    text += "来源：截图或 PDF（\(row["title"] ?? "")）\n" + (image != nil ? "请以附图为准；以下本机识别文字可能有误：\n" : "本机识别出的文字：\n") + String((row["body"] ?? "").prefix(image != nil ? 3000 : 8000))
                }
            } else {
                guard !pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fail(L("没有可识别的文字。")); return }
                text += "来源：用户粘贴的文字\n\(pasted)"
            }
            self.ai.recognize(settings: settings, key: key, text: text, image: image) { result in
                switch result {
                case .failure(let error): fail(error.localizedDescription)
                case .success(let reply):
                    let reading: [String: Any] = ["provider": settings.provider, "model": settings.model, "at": ISO8601DateFormatter().string(from: Date()), "text": String(reply.prefix(20000)), "image": image != nil]
                    if let evidenceId {
                        do { try self.store.database.mergeEvidencePayload(id: evidenceId, values: ["ai": reading]) } catch { fail(error.localizedDescription); return }
                    }
                    self.aiResult(["kind": "recognize", "requestId": requestId, "ok": true, "evidenceId": evidenceId ?? NSNull(), "ai": reading])
                }
            }
        }
    }
    @objc func importDocumentOCR() {
        if demoMode { demoBlocked(); return }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType.png, .jpeg, .pdf] + [UTType(filenameExtension: "webp")].compactMap { $0 }
        panel.allowsMultipleSelection = true
        panel.message = L("选择截图或 PDF，文字只在此 Mac 识别")
        panel.beginSheetModal(for: window) { response in
            guard response == .OK else { return }
            let urls = panel.urls.prefix(10)
            guard !urls.isEmpty else { return }
            self.recognizeFiles(Array(urls))
        }
    }
    /// Recognises screenshots and PDFs on this Mac, one after another; each result is saved as evidence and lands in 待确认.
    func recognizeFiles(_ urls: [URL]) {
        DispatchQueue.global(qos: .userInitiated).async {
            for url in urls {
                do {
                    let text = try OCRImporter.recognize(at: url)
                    let digest = SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
                    DispatchQueue.main.async {
                        do {
                            try self.store.database.saveEvidence(id: "ocr-" + digest, kind: "ocr", source: url.lastPathComponent, title: url.lastPathComponent, body: text, payload: ["file": url.path])
                            self.ocrResult(["ok": true, "id": "ocr-" + digest, "title": url.lastPathComponent])
                        } catch { self.ocrResult(["ok": false, "error": error.localizedDescription]) }
                    }
                } catch {
                    DispatchQueue.main.async { self.ocrResult(["ok": false, "error": L("{name}：{error}", ["name": url.lastPathComponent, "error": error.localizedDescription])]) }
                }
            }
        }
    }
    func importDroppedOCR(_ body: [String: Any]) {
        if demoMode { demoBlocked(); return }
        guard let name = body["name"] as? String, !name.isEmpty, name.count <= 200,
              let base64 = body["base64"] as? String, !base64.isEmpty, base64.count <= 36_000_000,
              let data = Data(base64Encoded: base64), !data.isEmpty, data.count <= 25 * 1024 * 1024 else {
            ocrResult(["ok": false, "error": L("无法读取拖入的文件。")])
            return
        }
        let ext = (name as NSString).pathExtension.lowercased()
        guard ["png", "jpg", "jpeg", "webp", "pdf"].contains(ext) else {
            ocrResult(["ok": false, "error": L("请拖入 PNG、JPEG、WebP 图片或 PDF。")])
            return
        }
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-ocr-" + UUID().uuidString + "." + ext)
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try data.write(to: temp, options: .atomic)
                defer { try? FileManager.default.removeItem(at: temp) }
                let text = try OCRImporter.recognize(at: temp)
                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                DispatchQueue.main.async {
                    do {
                        try self.store.database.saveEvidence(id: "ocr-" + digest, kind: "ocr", source: name, title: name, body: text, payload: ["file": name])
                        self.ocrResult(["ok": true, "id": "ocr-" + digest, "title": name])
                    } catch { self.ocrResult(["ok": false, "error": error.localizedDescription]) }
                }
            } catch {
                DispatchQueue.main.async { self.ocrResult(["ok": false, "error": error.localizedDescription]) }
            }
        }
    }
    @objc func showImportedEvidence() { openInbox() }
    func sendEvidenceList() {
        do {
            let rows = try store.database.listEvidence()
            guard let data = try? JSONSerialization.data(withJSONObject: rows), let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.assetboardEvidenceList(\(json))")
        } catch {
            guard let data = try? JSONSerialization.data(withJSONObject: [error.localizedDescription]), let json = String(data: data, encoding: .utf8) else { return }
            webView.evaluateJavaScript("window.assetboardEvidenceList(null, \(json)[0])")
        }
    }
    func ocrResult(_ result: [String: Any]) {
        // Before the page has loaded (a cold launch from the Dock) the evidence is already saved and shows in 待确认.
        guard boardLoaded, let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.assetboardOCRResult(\(json))")
    }

    #if !ASSETBOARD_FREE
    func probeResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardProbe?.(\(json))")
        }
    }

    /// probeList · probeSave {id?, kind, name, url, token?, clearToken?} · probeRemove {id} · probeRefresh {id?}. Every panel request is a
    /// GET in the background; each source answers on its own, so a slow or broken panel never holds up the others or the window.
    func handleProbe(_ action: String, _ body: [String: Any]) {
        switch action {
        case "probeList":
            probeResult(["sources": probes.summary()])
        case "probeSave":
            let id = (body["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? UUID().uuidString.lowercased()
            guard let source = ProbeSourceConfig(["id": id, "kind": body["kind"] as Any, "name": body["name"] as Any, "url": body["url"] as Any]) else {
                probeResult(["error": L("面板地址需以 https:// 或 http:// 开头，不含账号密码和参数")]); return
            }
            guard probes.all.contains(where: { $0.id == id }) || probes.all.count < ProbeSources.limit else {
                probeResult(["error": L("最多 {n} 个探针数据源", ["n": ProbeSources.limit])]); return
            }
            // The panel account: both filled saves it, both empty keeps what is kept, clearLogin removes it (a public panel).
            let username = (body["username"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let password = body["password"] as? String ?? ""
            if body["clearLogin"] as? Bool == true {
                guard probes.setLogin(nil, for: id) else { probeResult(["error": L("无法更改 macOS 钥匙串里的面板账号")]); return }
            } else if !username.isEmpty || !password.isEmpty {
                guard let login = ProbeLogin(username: username, password: password) else { probeResult(["error": L("用户名和密码都要填")]); return }
                guard probes.setLogin(login, for: id) else { probeResult(["error": L("无法把面板账号存进 macOS 钥匙串")]); return }
            }
            probeClient.forget(id)
            probes.save(source)
            probeResult(["sources": probes.summary(), "saved": id])
            refreshProbe(source)
        case "probeRemove":
            if let id = body["id"] as? String { probeLive.stop(id); probeClient.forget(id); probes.remove(id) }
            probeResult(["sources": probes.summary(), "removed": body["id"] as? String ?? ""])
        case "probeHistory":
            // A source's history for the servers on cards, one GET each, one after another; at most 30.
            guard let id = body["id"] as? String, let source = probes.all.first(where: { $0.id == id }) else { return }
            let servers = Array((body["servers"] as? [String] ?? []).filter(ProbeKind.validServerId).prefix(30))
            fetchProbeHistory(source, servers, login: probes.login(source.id), into: [:])
        case "probeLiveStart":
            guard let id = body["id"] as? String, let source = probes.all.first(where: { $0.id == id }) else { return }
            let ids = body["servers"] as? [String] ?? []
            probeClient.liveToken(source, login: probes.login(source.id)) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let token): self.probeLive.start(source, token: token, ids: ids)
                    case .failure(let error): self.probeResult(["source": id, "live": "closed", "status": error.code])
                    }
                }
            }
        case "probeLiveStop":
            if let id = body["id"] as? String { probeLive.stop(id) } else { probeLive.stopAll() }
        case "probeRefresh":
            // 刷新 by hand (manual) also lifts a stop after a wrong account or a human check, and the login rate limit.
            let only = body["id"] as? String
            for source in probes.all where only == nil || source.id == only {
                if body["manual"] as? Bool == true { probeClient.auth(source.id).reset() }
                refreshProbe(source)
            }
        default:
            break
        }
    }

    func refreshProbe(_ source: ProbeSourceConfig) {
        guard !probeLoading.contains(source.id) else { return }
        probeLoading.insert(source.id)
        probeResult(["source": source.id, "loading": true])
        probeClient.read(source, .servers, login: probes.login(source.id)) { result in
            DispatchQueue.main.async {
                self.probeLoading.remove(source.id)
                switch result {
                case .success(let json): self.probeResult(["source": source.id, "kind": source.kind.rawValue, "data": json, "at": Date().timeIntervalSince1970 * 1000])
                case .failure(let error): self.probeResult(["source": source.id, "error": error.localizedDescription, "status": error.code, "reason": error.userInfo["reason"] as? String ?? "net"])
                }
            }
        }
    }

    func fetchProbeHistory(_ source: ProbeSourceConfig, _ servers: [String], login: ProbeLogin?, into found: [String: Any]) {
        guard let next = servers.first else {
            probeResult(["source": source.id, "history": found, "at": Date().timeIntervalSince1970 * 1000]); return
        }
        probeClient.read(source, .history(next), login: login) { result in
            DispatchQueue.main.async {
                var found = found
                switch result {
                case .success(let json): found[next] = ProbeFetcher.historyRows(json)
                case .failure(let error) where error.code == 401 || error.code == 403 || error.code == 429 || (error.userInfo["reason"] as? String) != "net":
                    self.probeResult(["source": source.id, "history": found, "historyError": error.localizedDescription, "status": error.code,
                                      "reason": error.userInfo["reason"] as? String ?? "net"]); return
                case .failure: break
                }
                self.fetchProbeHistory(source, Array(servers.dropFirst()), login: login, into: found)
            }
        }
    }
    @objc func openProbes() { webView.evaluateJavaScript("window.probeDialog?.()") }
    #endif

    func cloudflareResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardCloudflareResult(\(json))")
        }
    }
    func githubResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardGitHubResult(\(json))")
        }
    }

    func syncGitHubWithLocalCLI(users: [String]? = nil) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let path = LocalCLI.ghPath() else {
                self.githubResult([
                    "ok": false,
                    "error": L("未找到本机 GitHub CLI。"),
                    "nextSteps": [
                        L("安装：brew install gh && gh auth login"),
                        L("或使用预填的细粒度令牌页面创建只读令牌后粘贴。")
                    ],
                    "tokenUrl": "https://github.com/settings/tokens?type=beta"
                ])
                return
            }
            do {
                let accounts = try LocalCLI.ghAccounts(path: path)
                let selected: [String]
                if let users, !users.isEmpty {
                    selected = users.filter { accounts.contains($0) }
                    if selected.isEmpty {
                        self.githubResult(["ok": false, "error": L("所选账号未在本机 gh 登录。已登录：{accounts}", ["accounts": accounts.joined(separator: ", ")])])
                        return
                    }
                } else {
                    selected = accounts.isEmpty ? [""] : accounts
                }
                var all: [[String: Any]] = []
                var warnings: [String] = []
                let group = DispatchGroup()
                let lock = NSLock()
                for user in selected {
                    group.enter()
                    do {
                        let token = try LocalCLI.ghToken(path: path, user: user.isEmpty ? nil : user)
                        self.github.listRepositories(token: token) { repositories, error in
                            defer { group.leave() }
                            if let error {
                                lock.lock(); warnings.append(L("{name}：{error}", ["name": user.isEmpty ? L("当前账号") : user, "error": error])); lock.unlock()
                                return
                            }
                            lock.lock(); all.append(contentsOf: repositories ?? []); lock.unlock()
                        }
                    } catch {
                        warnings.append(error.localizedDescription)
                        group.leave()
                    }
                }
                group.wait()
                // Dedupe by repo id
                var seen = Set<String>()
                var unique: [[String: Any]] = []
                for repo in all {
                    let id = String(describing: repo["id"] ?? "")
                    if id.isEmpty || seen.contains(id) { continue }
                    seen.insert(id)
                    unique.append(repo)
                }
                if unique.isEmpty {
                    self.githubResult([
                        "ok": false,
                        "error": warnings.joined(separator: L("；")).isEmpty ? L("本机 gh 没有可读的仓库。") : warnings.joined(separator: L("；")),
                        "nextSteps": [L("运行 gh auth login 登录需要的账号"), L("或粘贴 GitHub 细粒度只读令牌")],
                        "tokenUrl": "https://github.com/settings/tokens?type=beta"
                    ])
                    return
                }
                self.githubResult(["ok": true, "repositories": unique, "connected": false, "accounts": selected.filter { !$0.isEmpty }, "warnings": warnings])
            } catch {
                self.githubResult([
                    "ok": false,
                    "error": error.localizedDescription,
                    "nextSteps": ["brew install gh && gh auth login", L("或使用令牌同步")],
                    "tokenUrl": "https://github.com/settings/tokens?type=beta"
                ])
            }
        }
    }

    func importSshConfig() {
        if demoMode { demoBlocked(); return }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let text = try LocalCLI.readSshConfigText()
                self.sshResult(["ok": true, "text": text])
            } catch {
                self.sshResult(["ok": false, "error": error.localizedDescription, "nextSteps": [L("在 ~/.ssh/config 中添加 Host 条目"), L("或手动录入服务器资产")]])
            }
        }
    }

    func sshResult(_ result: [String: Any]) {
        DispatchQueue.main.async {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else { return }
            self.webView.evaluateJavaScript("window.assetboardSshResult?.(\(json))")
        }
    }

    /// `gh auth status` asks GitHub and can take seconds, so detection runs off the main thread, one at a time; the answer goes to
    /// the page when it comes. On the main thread it froze the whole window for as long as gh took.
    private var localCliDetecting = false
    func publishLocalCliDetect() {
        guard !localCliDetecting else { return }
        localCliDetecting = true
        DispatchQueue.global(qos: .userInitiated).async {
            let info = LocalCLI.detect()
            DispatchQueue.main.async {
                self.localCliDetecting = false
                guard let data = try? JSONSerialization.data(withJSONObject: info),
                      let json = String(data: data, encoding: .utf8) else { return }
                self.webView.evaluateJavaScript("window.assetboardLocalCliDetect?.(\(json))")
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, url.isFileURL,
              url.standardizedFileURL.path.hasPrefix(localRoot.standardizedFileURL.path + "/"),
              let body = message.body as? [String: Any] else { return }
        if body["action"] as? String == "themePref" {
            if !demoMode { ThemePreference.store(body["value"]) }
            return
        }
        // 设置 › 版本: the same check as the app menu's 检查更新…, with its answer in an alert.
        if body["action"] as? String == "checkUpdates" { checkForUpdates(); return }
        // 设置 (prefsDialog): the menu bar summary and automatic update checks. The page never sends it in demo mode.
        if body["action"] as? String == "preference" {
            if !demoMode, let on = body["on"] as? Bool {
                switch body["key"] as? String {
                case "statusItem": setStatusItemShown(on)
                case "autoUpdate": Updater.automatic = on; if on { updater.checkIfDue() }
                default: break
                }
            }
            // 设置 › 语言: kept, and the switch happens in place (menus rebuilt, the page loaded again with the saved board).
            if !demoMode, body["key"] as? String == "lang", let lang = body["value"] as? String, AppLanguage.all.contains(lang), lang != AppLanguage.current {
                switchLanguage(to: lang)
            }
            return
        }
        if body["action"] as? String == "themeColor" {
            if let rgb = body["rgb"] as? [Double], rgb.count == 3, rgb.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 255 }) {
                window.backgroundColor = NSColor(calibratedRed: rgb[0]/255, green: rgb[1]/255, blue: rgb[2]/255, alpha: 0.92)
            }
            return
        }
        // Demo mode answers saves as done without writing and refuses everything that would touch data, the Keychain or the network.
        if demoMode, let action = body["action"] as? String, !["windowChrome", "openExternal", "copyText"].contains(action) {
            if action == "save", let sequence = body["sequence"] as? Int { webView.evaluateJavaScript("window.assetboardSaved?.(\(sequence), true)") }
            else if action == "evidenceList" { webView.evaluateJavaScript("window.assetboardEvidenceList?.([], null)") }
            else if action != "reminders" { demoBlocked() }
            return
        }
        // The page's top bar: its height (the traffic lights are centred in it) and where its controls are (not draggable).
        if body["action"] as? String == "windowChrome" {
            if let height = (body["height"] as? NSNumber)?.doubleValue, height >= 28, height <= 80 {
                topBarHeight = CGFloat(height)
                titleDragHeight?.constant = topBarHeight
                placeTrafficLights()
            }
            titleDrag.holes = (body["holes"] as? [[NSNumber]] ?? []).compactMap { box in
                box.count == 4 ? NSRect(x: box[0].doubleValue, y: box[1].doubleValue, width: box[2].doubleValue, height: box[3].doubleValue) : nil
            }
            return
        }
        if let action = body["action"] as? String, handleMoneyMessage(action, body) { return }
        if body["action"] as? String == "networkLog" { publishNetworkLog(); return }
        if body["action"] as? String == "fxRates" {
            exchangeRates?.load(force: body["force"] as? Bool == true) { rates in
                DispatchQueue.main.async {
                    guard let data = try? JSONSerialization.data(withJSONObject: rates), let json = String(data: data, encoding: .utf8) else { return }
                    self.webView.evaluateJavaScript("window.assetboardFxRates?.(\(json))")
                }
            }
            return
        }
        if body["action"] as? String == "networkLogClear" { try? store.database.clearNetworkLog(); publishNetworkLog(); return }
        if body["action"] as? String == "agentReply" {
            if let id = body["requestId"] as? String, let reply = body["reply"] as? String, reply.utf8.count <= AgentSocket.maxBytes {
                finishAgentRequest(id, Data(reply.utf8))
            }
            return
        }
        if body["action"] as? String == "intakeDone" {
            if let name = body["name"] as? String { agentInbox?.finish(name) }
            return
        }
        if body["action"] as? String == "reminders" {
            if let items = ReminderItem.parse(body["items"]) { reminders.apply(items) }
            return
        }
        if body["action"] as? String == "openNotificationSettings" { NSWorkspace.shared.open(ReminderScheduler.settingsURL); return }
        if body["action"] as? String == "exportBoard" { exportBoard(); return }
        if body["action"] as? String == "copyText" {
            if let text = body["text"] as? String, !text.isEmpty, text.count <= 4096 {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(text, forType: .string)
            }
            return
        }
        if body["action"] as? String == "openLocalDirectory" {
            let opened = (body["path"] as? String).flatMap(LocalDirectory.validated).map(LocalDirectory.open) ?? false
            webView.evaluateJavaScript("window.assetboardLocalResult?.(\(opened))")
            return
        }
        if body["action"] as? String == "openExternal" {
            if let raw = body["url"] as? String, let url = URL(string: raw),
               ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
               url.host != nil, url.user == nil, url.password == nil,
               url.host?.lowercased() != "example.com" {
                NSWorkspace.shared.open(url)
            }
            return
        }
        #if !ASSETBOARD_FREE
        if let action = body["action"] as? String, action.hasPrefix("probe") { handleProbe(action, body); return }
        if let action = body["action"] as? String, action.hasPrefix("sshProbe") { handleSshProbe(action, body); return }
        // Cloudflare, GitHub and AI are Pro: the free edition has no bridge for them, so their messages are ignored.
        if body["action"] as? String == "cloudflareDisconnect" {
            if cloudflare.disconnect() { cloudflareResult(["ok": true, "disconnected": true]) }
            else { cloudflareResult(["ok": false, "error": L("无法从 macOS 钥匙串删除令牌，请重试。")]) }
            return
        }
        if body["action"] as? String == "cloudflareSync" {
            let supplied = (body["token"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard supplied.isEmpty || (supplied.count <= 256 && !supplied.contains(where: { $0.isWhitespace })) else {
                cloudflareResult(["ok": false, "error": L("令牌格式无效。")]) ; return
            }
            guard let token = supplied.isEmpty ? cloudflare.token() : supplied else {
                cloudflareResult(["ok": false, "error": L("请填写只读 API 令牌。")]) ; return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    var inventory = try CloudflareInventory().discover(token: token)
                    if !supplied.isEmpty && !self.cloudflare.saveToken(supplied) {
                        self.cloudflareResult(["ok": false, "error": L("无法将令牌保存到 macOS 钥匙串，同步未写入资产板。")])
                        return
                    }
                    inventory["ok"] = true
                    inventory["connected"] = true
                    self.cloudflareResult(inventory)
                } catch { self.cloudflareResult(["ok": false, "error": error.localizedDescription]) }
            }
            return
        }
        if body["action"] as? String == "githubDisconnect" {
            if github.disconnect() { githubResult(["ok": true, "disconnected": true]) }
            else { githubResult(["ok": false, "error": L("无法从 macOS 钥匙串删除令牌，请重试。")]) }
            return
        }
        if body["action"] as? String == "githubSyncLocal" {
            let users = body["users"] as? [String]
            syncGitHubWithLocalCLI(users: users)
            return
        }
        #endif
        if body["action"] as? String == "localCliDetect" {
            publishLocalCliDetect()
            return
        }
        if body["action"] as? String == "sshConfigImport" {
            importSshConfig()
            return
        }
        #if !ASSETBOARD_FREE
        if body["action"] as? String == "aiSave" {
            saveAISettings(body)
            return
        }
        if body["action"] as? String == "aiDisconnect" {
            ai.removeSettings()
            if ai.deleteKey() { aiResult(["kind": "settings", "ok": true, "disconnected": true]) }
            else { aiResult(["kind": "settings", "ok": false, "error": L("无法从 macOS 钥匙串删除 API key，请重试。")]) }
            return
        }
        #endif
        if body["action"] as? String == "iconFetch" {
            let requestId = body["requestId"] as? Int ?? 0
            icons.fetch(input: String((body["host"] as? String ?? "").prefix(300))) { result in
                var reply: [String: Any] = ["requestId": requestId]
                switch result {
                case .success(let icon): reply.merge(["ok": true, "host": icon.host, "dataUrl": icon.dataURL]) { $1 }
                case .failure(let error): reply.merge(["ok": false, "error": error.localizedDescription]) { $1 }
                }
                DispatchQueue.main.async {
                    guard let data = try? JSONSerialization.data(withJSONObject: reply), let json = String(data: data, encoding: .utf8) else { return }
                    self.webView.evaluateJavaScript("window.assetboardIconResult(\(json))")
                }
            }
            return
        }
        #if !ASSETBOARD_FREE
        if body["action"] as? String == "aiRecognize" {
            recognizeWithAI(body)
            return
        }
        #endif
        if body["action"] as? String == "evidenceList" {
            sendEvidenceList()
            return
        }
        if body["action"] as? String == "ocrImport" {
            importDocumentOCR()
            return
        }
        if body["action"] as? String == "ocrImportData" {
            importDroppedOCR(body)
            return
        }
        #if !ASSETBOARD_FREE
        if body["action"] as? String == "githubSync" {
            let supplied = (body["token"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard supplied.isEmpty || (supplied.count <= 256 && !supplied.contains(where: { $0.isWhitespace })) else {
                githubResult(["ok": false, "error": L("令牌格式无效。")]) ; return
            }
            guard let token = supplied.isEmpty ? github.token() : supplied else {
                githubResult(["ok": false, "error": L("请填写 GitHub 细粒度只读令牌。")]) ; return
            }
            github.listRepositories(token: token) { repositories, error in
                if let error { self.githubResult(["ok": false, "error": error]); return }
                if !supplied.isEmpty && !self.github.saveToken(supplied) {
                    self.githubResult(["ok": false, "error": L("无法将令牌保存到 macOS 钥匙串，同步未写入资产板。")]) ; return
                }
                self.githubResult(["ok": true, "repositories": repositories ?? [], "connected": true])
            }
            return
        }
        #endif
        guard body["action"] as? String == "save", let sequence = body["sequence"] as? Int, let data = body["data"] else { return }
        do {
            try store.save(data)
            webView.evaluateJavaScript("window.assetboardSaved(\(sequence), true)")
        } catch {
            webView.evaluateJavaScript("window.assetboardSaved(\(sequence), false)")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, url.isFileURL,
              url.standardizedFileURL.path.hasPrefix(localRoot.standardizedFileURL.path + "/") else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    /// What the page finds as `window.__ASSETBOARD_NATIVE__` when it loads: the board, the settings the app keeps, the language and
    /// Pro's state. Built at launch, and again when the language changes and the page is loaded afresh.
    func nativeInitial(saved: [String: Any]?) -> [String: Any] {
        #if ASSETBOARD_FREE
        var initial: [String: Any] = ["data": saved as Any? ?? NSNull(), "cloudflareConnected": false, "githubConnected": false,
                                      "cloudflareChecking": false, "githubChecking": false, "ai": NSNull(), "demo": demoMode]
        #else
        var initial: [String: Any] = ["data": saved as Any? ?? NSNull(), "cloudflareConnected": false, "githubConnected": false,
                                      "cloudflareChecking": true, "githubChecking": true,
                                      "ai": demoMode ? NSNull() : ai.loadSettings()?.summary ?? NSNull(), "demo": demoMode,
                                      "cliPath": Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/assetboard-cli").path]
        #endif
        // The theme is a viewer preference (theme.js); the demo starts from the default and keeps nothing.
        initial["themePref"] = demoMode ? NSNull() : ThemePreference.stored as Any? ?? NSNull()
        initial["systemAccent"] = ThemePreference.systemAccentHex
        // Two switches in 设置 that the app keeps (UserDefaults); the page shows them and answers through `preference`.
        initial["statusItem"] = !UserDefaults.standard.bool(forKey: AppDelegate.statusItemHiddenKey)
        initial["autoUpdate"] = Updater.automatic
        initial["lang"] = AppLanguage.current
        initial["version"] = Updater.currentVersion
        // `--demo --sidebar-collapsed` opens the demo with the sidebar folded to icons; `--sidebar-more` also opens its 更多 menu
        // and `--sidebar-tip` shows the tip on 域名. For screenshots only: demo mode, never remembered.
        if demoMode, let rail = [("--sidebar-collapsed", "rail"), ("--sidebar-more", "more"), ("--sidebar-tip", "tip")]
            .last(where: { CommandLine.arguments.contains($0.0) })?.1 { initial["demoRail"] = rail }
        #if !ASSETBOARD_FREE
        // Probe sources without their credentials; the demo shows made-up probe readings from the page and reads no panel.
        initial["probeSources"] = demoMode ? [] : probes.summary()
        // SSH 直读: which aliases are on and how often; the demo makes up its own hosts.
        initial["sshProbe"] = demoMode ? NSNull() as Any : sshProbeSettings.summary as Any
        #endif
        // Screenshots (the window can only be captured, not clicked): `--demo --open-asset=<id>` opens that record's detail,
        // `--demo --panorama` opens 全景, `--demo --probe-sources` the probe settings (探针数据源). Only the demo reads them.
        if demoMode {
            var open: [String: Any] = [:]
            if let asset = CommandLine.arguments.first(where: { $0.hasPrefix("--open-asset=") })?.dropFirst("--open-asset=".count),
               String(asset).range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil { open["asset"] = String(asset) }
            if CommandLine.arguments.contains("--panorama") { open["panorama"] = true }
            if CommandLine.arguments.contains("--probe-sources") { open["probeSources"] = true }
            // `--open-ssh-settings` opens the SSH 直读 settings with the full command; `--open-sources` is the same as `--probe-sources`.
            if CommandLine.arguments.contains("--open-sources") { open["probeSources"] = true }
            if CommandLine.arguments.contains("--open-ssh-settings") { open["ssh"] = true }
            if CommandLine.arguments.contains("--open-theme") { open["theme"] = true }
            if !open.isEmpty { initial["demoOpen"] = open }
        }
        return initial
    }

    func createMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: L("关于 Assetboard"), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        let updateItem = NSMenuItem(title: L("检查更新…"), action: #selector(checkForUpdates), keyEquivalent: "")
        updateItem.target = self
        appMenu.addItem(updateItem)
        appMenu.addItem(.separator())
        let settingsItem = NSMenuItem(title: L("设置…"), action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        appMenu.addItem(settingsItem)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: L("退出 Assetboard"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)
        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: L("文件"))
        let importItem = NSMenuItem(title: L("导入…"), action: #selector(openImport), keyEquivalent: "i")
        importItem.keyEquivalentModifierMask = [.command]
        importItem.target = self
        fileMenu.addItem(importItem)
        let exportItem = NSMenuItem(title: L("导出资产备份…"), action: #selector(exportBoard), keyEquivalent: "s")
        exportItem.keyEquivalentModifierMask = [.command, .shift]
        exportItem.target = self
        fileMenu.addItem(exportItem)
        let iconsItem = NSMenuItem(title: L("获取网站图标…"), action: #selector(openIconBatch), keyEquivalent: "")
        iconsItem.target = self
        fileMenu.addItem(iconsItem)
        let evidenceItem = NSMenuItem(title: L("待确认…"), action: #selector(showImportedEvidence), keyEquivalent: "")
        evidenceItem.target = self
        fileMenu.addItem(evidenceItem)
        #if !ASSETBOARD_FREE
        // Re-reading Cloudflare (new zones and Registrar domains) is a menu item too, not only a button inside 导入.
        let cloudflareItem = NSMenuItem(title: L("同步 Cloudflare…"), action: #selector(openCloudflare), keyEquivalent: "")
        cloudflareItem.target = self
        fileMenu.addItem(cloudflareItem)
        let probeItem = NSMenuItem(title: L("探针数据源…"), action: #selector(openProbes), keyEquivalent: "")
        probeItem.target = self
        fileMenu.addItem(probeItem)
        let sshProbeItem = NSMenuItem(title: L("SSH 直读…"), action: #selector(openSshProbe), keyEquivalent: "")
        sshProbeItem.target = self
        fileMenu.addItem(sshProbeItem)
        let aiItem = NSMenuItem(title: L("AI 识别设置…"), action: #selector(openAISettings), keyEquivalent: "")
        aiItem.target = self
        fileMenu.addItem(aiItem)
        let agentItem = NSMenuItem(title: L("MCP 接入…"), action: #selector(openAgentSetup), keyEquivalent: "")
        agentItem.target = self
        fileMenu.addItem(agentItem)
        #endif
        let networkItem = NSMenuItem(title: L("网络记录…"), action: #selector(openNetworkLog), keyEquivalent: "")
        networkItem.target = self
        fileMenu.addItem(networkItem)
        let folderItem = NSMenuItem(title: L("打开本地数据文件夹"), action: #selector(openDataFolder), keyEquivalent: "")
        folderItem.target = self
        fileMenu.addItem(folderItem)
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: L("关闭窗口"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = fileMenu
        menu.addItem(fileItem)
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: L("编辑"))
        let searchItem = NSMenuItem(title: L("搜索资产"), action: #selector(focusSearch), keyEquivalent: "k")
        searchItem.target = self
        editMenu.addItem(searchItem)
        for (title, action, key) in [(L("撤销"), "undo:", "z"), (L("重做"), "redo:", "Z"), (L("剪切"), "cut:", "x"), (L("复制"), "copy:", "c"), (L("粘贴"), "paste:", "v"), (L("全选"), "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editMenu.addItem(.separator())
        let keysItem = NSMenuItem(title: L("键盘快捷键"), action: #selector(showKeyboardHelp), keyEquivalent: "")
        keysItem.target = self
        editMenu.addItem(keysItem)
        editItem.submenu = editMenu
        menu.addItem(editItem)
        // No key equivalent on purpose: a plain P belongs to the page (it opens the panorama there), and a menu key would swallow it.
        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: L("显示"))
        let panoramaItem = NSMenuItem(title: L("全景"), action: #selector(openPanorama), keyEquivalent: "")
        panoramaItem.target = self
        viewMenu.addItem(panoramaItem)
        // ⌘\ folds the sidebar to a column of icons and back; the page also takes ⌃⌘S, the system's sidebar key, for the same.
        let sidebarItem = NSMenuItem(title: L("收起 / 展开侧边栏"), action: #selector(toggleBoardSidebar), keyEquivalent: "\\")
        sidebarItem.keyEquivalentModifierMask = [.command]
        sidebarItem.target = self
        viewMenu.addItem(sidebarItem)
        viewItem.submenu = viewMenu
        menu.addItem(viewItem)
        let helpItem = NSMenuItem()
        let helpMenu = NSMenu(title: L("帮助"))
        let feedbackItem = NSMenuItem(title: L("反馈与建议…"), action: #selector(openFeedback), keyEquivalent: "")
        feedbackItem.target = self
        helpMenu.addItem(feedbackItem)
        helpItem.submenu = helpMenu
        menu.addItem(helpItem)
        NSApplication.shared.mainMenu = menu
        NSApplication.shared.helpMenu = helpMenu
    }

    @objc func checkForUpdates() { if demoMode { demoBlocked(); return }; updater.check(manual: true) }
    /// 设置 (⌘,): one panel in the page for viewer settings, optional features and connections.
    @objc func openSettings() { webView.evaluateJavaScript("prefsDialog()") }
    /// The window as a PNG without screen-recording permission: the page (which draws the whole window under the transparent title
    /// bar) from WebKit's own snapshot, the three window buttons in their system colours, the window's tint behind both, and the
    /// window's rounded corners. Demo screenshots only; quits when written (status 1 if it could not be).
    func demoSnapshot(to path: String) {
        webView.takeSnapshot(with: WKSnapshotConfiguration()) { image, _ in
            guard let image, let window = self.window else { exit(1) }
            let size = window.frame.size, scale = window.backingScaleFactor
            guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale),
                                             bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                             bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
            rep.size = size
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
            NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 10, yRadius: 10).addClip()
            (window.backgroundColor ?? .windowBackgroundColor).withAlphaComponent(1).setFill()
            NSRect(origin: .zero, size: size).fill()
            image.draw(in: self.webView.convert(self.webView.bounds, to: nil))
            // The buttons' own drawing does not survive caching (it comes out square), so they are drawn as the system draws them.
            for (kind, fill, edge) in [(NSWindow.ButtonType.closeButton, 0xFF5F57, 0xE0443E), (.miniaturizeButton, 0xFEBC2E, 0xDEA123),
                                       (.zoomButton, 0x28C840, 0x1AAB29)] {
                guard let button = window.standardWindowButton(kind) else { continue }
                let frame = button.convert(button.bounds, to: nil), d: CGFloat = 12
                let dot = NSBezierPath(ovalIn: NSRect(x: frame.midX - d / 2, y: frame.midY - d / 2, width: d, height: d).insetBy(dx: 0.25, dy: 0.25))
                let rgb = { (v: Int) in NSColor(srgbRed: CGFloat(v >> 16 & 255) / 255, green: CGFloat(v >> 8 & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1) }
                rgb(fill).setFill(); dot.fill()
                rgb(edge).setStroke(); dot.lineWidth = 0.5; dot.stroke()
            }
            NSGraphicsContext.restoreGraphicsState()
            guard let png = rep.representation(using: .png, properties: [:]), (try? png.write(to: URL(fileURLWithPath: path))) != nil else { exit(1) }
            exit(0)
        }
    }
    /// The language switch without quitting: the menus are built again, and the page loads afresh with the board as last saved (every
    /// save is written before the page's next message is handled) and opens 设置 again, so the person stays where they were.
    func switchLanguage(to lang: String) {
        AppLanguage.stored = lang
        AppLanguage.current = lang
        createMenu()
        var initial = nativeInitial(saved: try? store.load())
        initial["reopen"] = "prefs"
        guard let data = try? JSONSerialization.data(withJSONObject: initial), let json = String(data: data, encoding: .utf8) else { return }
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: "window.__ASSETBOARD_NATIVE__ = \(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        boardLoaded = false
        webView.reload()
    }

    /// Opens a new GitHub issue in the browser; nothing is sent from the app.
    @objc func openFeedback() { NSWorkspace.shared.open(AppDelegate.feedbackURL) }

    @objc func openDataFolder() { if demoMode { demoBlocked(); return }; NSWorkspace.shared.open(store.directory) }
    @objc func exportBoard() {
        if demoMode { demoBlocked(); return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Assetboard-backup.json"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let destination = panel.url else { return }
            do {
                guard let board = try self.store.load() else { return }
                let data = try JSONSerialization.data(withJSONObject: board, options: [.prettyPrinted, .sortedKeys])
                try data.write(to: destination, options: .atomic)
                // The page keeps the day of the last export to say when a copy is a month old (research Q6).
                self.webView.evaluateJavaScript("window.assetboardExported?.()")
            } catch {
                let alert = NSAlert(error: error)
                alert.beginSheetModal(for: self.window)
            }
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        agentServer?.stop()
        if demoMode, let directory = store?.directory, directory.path.hasPrefix(FileManager.default.temporaryDirectory.path) { try? FileManager.default.removeItem(at: directory) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return false }
}

final class MockCloudflareProtocol: URLProtocol {
    static var reply: ((URLRequest) -> (Int, Any))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, body) = Self.reply(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: body))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class MockIconProtocol: URLProtocol {
    static var reply: ((URLRequest) -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, body) = Self.reply(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

// Host validation, icon link ranking, fallbacks and PNG normalisation, with HTTP stubbed.
// "Open in local editor": only an existing local folder, never a file, URL or path with "..".
enum LocalDirectory {
    static let editors = ["com.todesktop.230313mzl4w4u92", "com.microsoft.VSCode", "dev.zed.Zed"]
    static func validated(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 1000, !trimmed.contains("\0"),
              trimmed.hasPrefix("/") || trimmed.hasPrefix("~/"),
              !trimmed.split(separator: "/").contains("..") else { return nil }
        let url = URL(fileURLWithPath: (trimmed as NSString).expandingTildeInPath).standardizedFileURL.resolvingSymlinksInPath()
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue,
              !url.pathExtension.lowercased().hasSuffix("app") else { return nil }
        return url
    }
    static func open(_ url: URL) -> Bool {
        if let editor = editors.lazy.compactMap({ NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0) }).first {
            NSWorkspace.shared.open([url], withApplicationAt: editor, configuration: NSWorkspace.OpenConfiguration())
            return true
        }
        return NSWorkspace.shared.open(url)
    }
}

func testLocalDirectory() {
    let temp = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-local-" + UUID().uuidString)
    try! FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temp) }
    let file = temp.appendingPathComponent("note.txt")
    try! Data("x".utf8).write(to: file)
    precondition(LocalDirectory.validated(temp.path)?.path == temp.resolvingSymlinksInPath().path, "Existing folder must be accepted")
    precondition(LocalDirectory.validated("~/")?.path == FileManager.default.homeDirectoryForCurrentUser.resolvingSymlinksInPath().path, "Home shorthand must expand")
    for refused in [file.path, temp.path + "/missing", "relative/path", "https://example.com", temp.path + "/../" + temp.lastPathComponent, "", "/Applications/Safari.app"] {
        precondition(LocalDirectory.validated(refused) == nil, "Path must be refused: \(refused)")
    }
    print("PASS: local folder validation")
}

// Only refusals here, so the run never writes the real defaults; the page checks the stored theme again when it reads it.
func testThemePreference() {
    let refusals: [Any?] = [nil, 42, "[1]", "not json", "\"text\"", "{" + String(repeating: " ", count: 4100) + "}"]
    for refused in refusals {
        precondition(!ThemePreference.store(refused), "Theme preference must be refused: \(String(describing: refused).prefix(40))")
    }
    let accent = ThemePreference.systemAccentHex
    precondition(accent.count == 7 && accent.hasPrefix("#"), "System accent must be #rrggbb: " + accent)
    print("PASS: theme preference refusals, system accent colour")
}

func testExchangeRates() {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent("assetboard-fx-" + UUID().uuidString)
    try! manager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: root) }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    var requests = 0, status = 200
    var body: [String: Any] = ["amount": 1, "base": "USD", "date": "2026-10-20", "rates": ["CNY": 6.678, "EUR": 0.89166, "GBP": 0.74925, "HKD": 7.8487, "JPY": 158.13, "SGD": 1.2785, "AUD": 1.4317, "CAD": 1.4051]]
    MockCloudflareProtocol.reply = { request in
        requests += 1
        precondition(request.url?.host == "api.frankfurter.dev" && request.url?.query?.contains("base=USD") == true, "Rates come from Frankfurter in USD")
        return (status, body)
    }
    let rates = ExchangeRates(directory: root, session: URLSession(configuration: configuration))
    func load(force: Bool = false, now: Date = Date()) -> [String: Any] {
        var result: [String: Any]?
        rates.load(force: force, now: now) { result = $0 }
        let deadline = Date().addingTimeInterval(5)
        while result == nil && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        return result ?? [:]
    }
    let first = load()
    precondition(first["ok"] as? Bool == true && first["date"] as? String == "2026-10-20" && (first["rates"] as? [String: Double])?["CNY"] == 6.678 && (first["rates"] as? [String: Double])?["USD"] == 1, "Fresh rates: \(first)")
    _ = load()
    precondition(requests == 1, "A second load the same day uses the kept copy")
    _ = load(force: true)
    precondition(requests == 2, "Refreshing fetches again")
    _ = load(now: Date().addingTimeInterval(86400))
    precondition(requests == 3, "The next day fetches again")
    status = 500
    let failed = load(force: true)
    precondition(failed["ok"] as? Bool == false && failed["date"] as? String == "2026-10-20" && failed["error"] != nil, "A failed fetch returns the kept rates, marked")
    status = 200
    body["rates"] = ["CNY": 6.678]
    precondition(load(force: true)["ok"] as? Bool == false, "Rates missing a currency are refused")
    body["rates"] = ["CNY": -1, "EUR": 0.9, "GBP": 0.7, "HKD": 7.8, "JPY": 158, "SGD": 1.3, "AUD": 1.4, "CAD": 1.4]
    precondition(load(force: true)["ok"] as? Bool == false, "Implausible rates are refused")
    print("PASS: Frankfurter in USD, kept copy the same day, refresh and next day fetch, failure falls back to kept rates, incomplete or implausible rates refused")
}

func testNetworkLog() {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent("assetboard-net-" + UUID().uuidString)
    defer { try? manager.removeItem(at: root) }
    do {
        let store = try BoardStore(root: root)
        let log = NetworkLog()
        var live: [[String: Any]] = []
        log.onEntry = { live.append($0) }
        log.record(direction: "out", service: "Before", method: "GET", host: "x", path: "/", ok: true)
        let before = try store.database.listNetworkLog()
        precondition(before.isEmpty, "Nothing is kept before the data folder is open")
        log.database = store.database
        let url = URL(string: "https://api.cloudflare.com:8443/client/v4/zones?page=2&token=secret")!
        let parts = NetworkLog.parts(url)
        precondition(parts.host == "api.cloudflare.com:8443" && parts.path == "/client/v4/zones", "Only host and path are shown: \(parts)")
        log.record(direction: "out", service: "Cloudflare", method: "GET", host: parts.host, path: parts.path, status: 200, ok: true, sent: 0, received: 512, milliseconds: 80, address: "104.16.0.1", tls: NetworkLog.tlsName(0x0304))
        log.record(direction: "in", service: "MCP", method: "add", host: "本机 assetboard-cli", path: "agent.sock", ok: false, note: "缺少 name")
        let rows = try store.database.listNetworkLog()
        precondition(rows.count == 2 && rows[0]["service"] as? String == "MCP" && rows[1]["tls"] as? String == "TLS 1.3", "Newest first, with the details: \(rows)")
        precondition(!String(describing: rows).contains("secret"), "No query string reaches the log")
        for index in 0..<30 { try store.database.appendNetworkLog(["n": index], keep: 10) }
        let pruned = try store.database.listNetworkLog()
        precondition(pruned.count == 10, "Old rows are dropped beyond the limit")
        try store.database.clearNetworkLog()
        let cleared = try store.database.listNetworkLog()
        precondition(cleared.isEmpty, "Clearing empties the log")
        let deadline = Date().addingTimeInterval(2)
        while live.count < 2 && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        precondition(live.count == 2, "Each kept entry is shown live")
        // A request made with a completion handler, as every connector does, is recorded by the session delegate.
        NetworkLog.shared.database = store.database
        defer { NetworkLog.shared.database = nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockCloudflareProtocol.self]
        MockCloudflareProtocol.reply = { _ in (201, ["ok": true]) }
        var finished = false
        NetworkLog.makeSession("Test", configuration: configuration).dataTask(with: URL(string: "https://api.example.com/v1/items?key=secret")!) { _, _, _ in finished = true }.resume()
        let requestDeadline = Date().addingTimeInterval(5)
        var logged: [[String: Any]] = []
        while Date() < requestDeadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            logged = try store.database.listNetworkLog()
            if finished && !logged.isEmpty { break }
        }
        precondition(finished && logged.first?["service"] as? String == "Test" && logged.first?["host"] as? String == "api.example.com"
                     && logged.first?["path"] as? String == "/v1/items" && logged.first?["status"] as? Int == 201, "The session delegate records the request: \(logged)")
        precondition(!String(describing: logged).contains("secret"), "The query string stays out of the log")
        print("PASS: nothing before the data folder, host and path only, details kept, newest first, limit, clear, live entries, session requests recorded")
    } catch { fputs("Network log test failed: \(error)\n", stderr); exit(1) }
}

func testAgentSocket() {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent("abs-" + UUID().uuidString.prefix(8))
    try! manager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: root) }
    let path = root.appendingPathComponent("agent.sock").path
    let server = AgentSocketServer(path: path)
    var seenOnMain = true
    server.onRequest = { request, reply in
        seenOnMain = seenOnMain && Thread.isMainThread
        let result: [String: Any] = ["method": request["method"] ?? NSNull(), "params": request["params"] ?? NSNull()]
        reply(try! JSONSerialization.data(withJSONObject: ["ok": true, "result": result]))
    }
    do { try server.start() } catch { fputs("Agent socket test failed: \(error)\n", stderr); exit(1) }
    let mode = (try? manager.attributesOfItem(atPath: path)[.posixPermissions] as? NSNumber)?.intValue
    precondition(mode == 0o600, "Only the owner may use the socket")
    var replies: [[String: Any]] = []
    var failure: Error?
    var done = false
    Thread {
        do {
            replies.append(try AgentSocket.call(["method": "list", "params": ["type": "domain"]], path: path))
            replies.append(try AgentSocket.call(["method": "add", "params": ["items": [["name": String(repeating: "名", count: 50_000)]]]], path: path))
        } catch { failure = error }
        DispatchQueue.main.async { done = true }
    }.start()
    let deadline = Date().addingTimeInterval(10)
    while !done && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    precondition(done && failure == nil, "The client gets its replies: \(String(describing: failure))")
    precondition(seenOnMain, "Requests reach the app on the main queue")
    let first = replies[0]["result"] as? [String: Any]
    precondition(first?["method"] as? String == "list" && (first?["params"] as? [String: Any])?["type"] as? String == "domain", "Method and params arrive unchanged")
    let second = (((replies[1]["result"] as? [String: Any])?["params"] as? [String: Any])?["items"] as? [[String: Any]])?.first?["name"] as? String
    precondition(second?.count == 50_000, "A large request arrives whole")
    server.stop()
    precondition(!manager.fileExists(atPath: path), "Stopping removes the socket")
    do { _ = try AgentSocket.call(["method": "list"], path: path); fatalError("A stopped socket answered") }
    catch AgentSocket.Failure.notRunning {}
    catch { fatalError("Unexpected error: \(error)") }
    print("PASS: owner-only socket, request and reply on the main queue, large request, stop removes the socket, not running detected")
}

func testAgentInbox() {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent("assetboard-inbox-" + UUID().uuidString)
    defer { try? manager.removeItem(at: root) }
    let inbox = AgentInbox(root: root)
    inbox.start()
    func put(_ name: String, _ data: Data) {
        let url = inbox.directory.appendingPathComponent(name)
        try! data.write(to: url)
        try! manager.setAttributes([.modificationDate: Date().addingTimeInterval(-5)], ofItemAtPath: url.path)
    }
    func exists(_ url: URL) -> Bool { manager.fileExists(atPath: url.path) }
    put("a.json", Data("{\"assetboard\":1,\"items\":[]}".utf8))
    put("big.json", Data(count: AgentInbox.maxFileBytes + 1))
    put("note.txt", Data("x".utf8))
    let first = inbox.takePending()
    precondition(first.count == 2, "Only .json files are read")
    precondition(first.contains { $0["name"] == "a.json" && $0["text"] != nil }, "A readable file is handed over")
    precondition(first.contains { $0["name"] == "big.json" && $0["error"] != nil }, "An oversized file comes back as an error")
    precondition(!exists(inbox.directory.appendingPathComponent("big.json")), "An oversized file is moved aside")
    precondition(inbox.takePending().isEmpty, "A delivered file is not sent twice")
    precondition(exists(inbox.directory.appendingPathComponent("a.json")), "A file stays until the page is done with it")
    inbox.finish("../a.json")
    precondition(exists(inbox.directory.appendingPathComponent("a.json")), "Only delivered names are finished")
    inbox.finish("a.json")
    precondition(!exists(inbox.directory.appendingPathComponent("a.json")), "A finished file leaves the folder")
    put("b.json", Data("{}".utf8))
    _ = inbox.takePending()
    precondition(AgentInbox(root: root).takePending().map { $0["name"] } == ["b.json"], "An unfinished file comes back after a restart")
    try! Data().write(to: inbox.handled.appendingPathComponent("1-old.json"))
    inbox.pruneHandled()
    let kept = (try? manager.contentsOfDirectory(atPath: inbox.handled.path)) ?? []
    precondition(!kept.contains("1-old.json") && kept.count == 2, "handled/ keeps 30 days: \(kept)")
    print("PASS: Inbox folder hands files over once, keeps them until finished, prunes handled/")
}

func testIcons() {
    precondition(IconFetcher.host(from: " Wise.com ") == "wise.com")
    precondition(IconFetcher.host(from: "https://www.hsbc.com.hk/zh-hk/") == "www.hsbc.com.hk")
    for refused in ["192.168.1.1", "localhost", "printer.local", "https://user:pw@wise.com", "[::1]", "wise", "file:///etc", "-bad-.com"] {
        precondition(IconFetcher.host(from: refused) == nil, "Host must be refused: \(refused)")
    }
    let html = "<head><link rel=\"icon\" href=\"/favicon-32.png\" sizes=\"32x32\"><link rel='apple-touch-icon' href='touch.png'><link rel=\"mask-icon\" href=\"/mask.svg\"><link rel=\"icon\" href=\"http://wise.com/plain.png\"></head>"
    let ranked = IconFetcher.candidates(html: html, base: URL(string: "https://wise.com/en/")!).map(\.absoluteString)
    precondition(ranked == ["https://wise.com/en/touch.png", "https://wise.com/favicon-32.png", "https://wise.com/apple-touch-icon.png", "https://wise.com/favicon.ico"], ranked.description)
    let image = NSImage(size: NSSize(width: 64, height: 32))
    image.lockFocus(); NSColor.systemTeal.setFill(); NSRect(x: 0, y: 0, width: 64, height: 32).fill(); image.unlockFocus()
    let png = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
    precondition(IconFetcher.normalized(Data("<html>".utf8)) == nil, "Non-images must be refused")
    let defaults = IconFetcher().session.configuration
    precondition(!defaults.httpShouldSetCookies && defaults.httpCookieAcceptPolicy == .never, "Icon requests must not send or keep cookies")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockIconProtocol.self]
    let fetcher = IconFetcher(session: URLSession(configuration: configuration))
    var requested: [String] = []
    func run(_ input: String, _ reply: @escaping (URLRequest) -> (Int, Data)) -> Result<(host: String, dataURL: String), NSError> {
        requested = []
        MockIconProtocol.reply = { request in requested.append("\(request.httpMethod ?? "") \(request.url!.absoluteString)"); return reply(request) }
        let done = DispatchSemaphore(value: 0)
        var result: Result<(host: String, dataURL: String), NSError>!
        fetcher.fetch(input: input) { result = $0; done.signal() }
        precondition(done.wait(timeout: .now() + 5) == .success)
        return result
    }
    let found = run("wise.com") { request in
        switch request.url!.path {
        case "/": return (200, Data("<link rel=\"icon\" href=\"/missing.png\">".utf8))
        case "/apple-touch-icon.png": return (200, png)
        default: return (404, Data())
        }
    }
    guard case .success(let icon) = found, icon.host == "wise.com", icon.dataURL.hasPrefix("data:image/png;base64,"),
          let decoded = Data(base64Encoded: String(icon.dataURL.dropFirst("data:image/png;base64,".count))),
          let bitmap = NSBitmapImageRep(data: decoded), bitmap.pixelsWide == 128, bitmap.pixelsHigh == 128 else { fatalError("Fallback icon must be normalised: \(found)") }
    precondition(requested == ["GET https://wise.com/", "GET https://wise.com/missing.png", "GET https://wise.com/apple-touch-icon.png"], requested.description)
    guard case .failure(let missing) = run("empty.example", { _ in (404, Data()) }), missing.localizedDescription.contains("没有在 empty.example 找到") else { fatalError("A site without icons must say so") }
    guard case .failure(let refused) = run("127.0.0.1", { _ in (200, png) }), requested.isEmpty, refused.localizedDescription.contains("域名") else { fatalError("Refused hosts must not be contacted") }
    print("PASS: icon host validation, link ranking and fallbacks, GET-only fetch, no cookies, PNG normalisation, missing icon and refused host")
}

func testCloudflare() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    let connector = CloudflareConnector(session: URLSession(configuration: configuration))
    func run(_ reply: @escaping (URLRequest) -> (Int, Any)) -> ([[String: String]]?, String?) {
        MockCloudflareProtocol.reply = reply
        let done = DispatchSemaphore(value: 0)
        var result: ([[String: String]]?, String?) = (nil, nil)
        connector.listZones(token: "test-token") { zones, error in result = (zones, error); done.signal() }
        precondition(done.wait(timeout: .now() + 5) == .success)
        return result
    }
    let success = run { request in
        precondition(request.httpMethod == "GET")
        precondition(request.url?.host == "api.cloudflare.com")
        precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")
        let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "page" }!.value!
        return (200, ["success": true, "result_info": ["total_pages": 2], "result": [["id": page, "name": "zone-\(page).dev", "account": ["name": "account"], "status": "active"]]])
    }
    precondition(success.1 == nil && success.0?.map { $0["id"]! } == ["1", "2"])
    let denied = run { _ in (403, ["success": false]) }
    precondition(denied.0 == nil && denied.1?.contains("权限验证失败") == true)
    let partial = run { request in
        let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "page" }!.value!
        return page == "1" ? (200, ["success": true, "result_info": ["total_pages": 2], "result": [["id": "first", "name": "first.dev"]]]) : (200, ["success": true, "result_info": ["total_pages": 2], "result": [["name": "missing-id.dev"]]])
    }
    precondition(partial.0 == nil && partial.1 != nil)
    let empty = run { _ in (200, ["success": true, "result_info": ["total_pages": 0], "result": []]) }
    precondition(empty.0?.isEmpty == true && empty.1 == nil)
    print("PASS: Cloudflare GET-only auth header, pagination, denial, partial response, empty result")
}

func testGitHub() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    let connector = GitHubConnector(session: URLSession(configuration: configuration))
    func run(_ reply: @escaping (URLRequest) -> (Int, Any)) -> ([[String: Any]]?, String?) {
        MockCloudflareProtocol.reply = reply
        let done = DispatchSemaphore(value: 0)
        var result: ([[String: Any]]?, String?) = (nil, nil)
        connector.listRepositories(token: "test-token") { repositories, error in result = (repositories, error); done.signal() }
        precondition(done.wait(timeout: .now() + 5) == .success)
        return result
    }
    func repository(_ id: Int) -> [String: Any] {
        ["id": id, "full_name": "owner/repo-\(id)", "owner": ["login": "owner"],
         "html_url": "https://github.com/owner/repo-\(id)", "private": true, "archived": false]
    }
    let success = run { request in
        precondition(request.httpMethod == "GET" && request.url?.host == "api.github.com" && request.url?.path == "/user/repos")
        precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")
        precondition(request.value(forHTTPHeaderField: "Accept") == "application/vnd.github+json")
        let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "page" }!.value!
        return (200, page == "1" ? (1...100).map(repository) : [repository(101)])
    }
    precondition(success.1 == nil && success.0?.count == 101 && success.0?.last?["id"] as? String == "101")
    let denied = run { _ in (403, ["message": "Resource not accessible by personal access token"]) }
    precondition(denied.0 == nil && denied.1?.contains("GitHub 拒绝访问") == true)
    let malformed = run { _ in (200, [["id": 1, "full_name": "owner/repo", "owner": ["login": "owner"], "html_url": "https://evil.example/repo"]]) }
    precondition(malformed.0 == nil && malformed.1 != nil)
    let partial = run { request in
        let page = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "page" }!.value!
        return page == "1" ? (200, (1...100).map(repository)) : (200, [["id": 101, "full_name": "owner/broken"]])
    }
    precondition(partial.0 == nil && partial.1 != nil)
    let empty = run { _ in (200, [[String: Any]]()) }
    precondition(empty.0?.isEmpty == true && empty.1 == nil)
    print("PASS: GitHub GET-only auth header, pagination, denial, invalid URL, partial response, empty result")
}

func testCloudflareInventory() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockCloudflareProtocol.self]
    let inventory = CloudflareInventory(session: URLSession(configuration: configuration))
    let accountId = String(repeating: "a", count: 32)
    MockCloudflareProtocol.reply = { request in
        precondition(request.httpMethod == "GET")
        precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")
        switch request.url!.path {
        case "/client/v4/zones":
            return (200, ["success": true, "result": [["id": "zone-1", "name": "example.org", "status": "active"]], "result_info": ["total_pages": 1]])
        case "/client/v4/accounts":
            return (200, ["success": true, "result": [["id": accountId, "name": "My account"]], "result_info": ["total_pages": 1]])
        case "/client/v4/accounts/\(accountId)/pages/projects":
            return (200, ["success": true, "result": [["name": "my-pages"]], "result_info": ["total_pages": 1]])
        case "/client/v4/accounts/\(accountId)/workers/scripts":
            return (200, ["success": true, "result": [["id": "my-worker"]]])
        case "/client/v4/accounts/\(accountId)/r2/buckets":
            return (200, ["success": true, "result": ["buckets": [["name": "my-bucket"]]], "result_info": [:]])
        case "/client/v4/accounts/\(accountId)/registrar/registrations":
            return (200, ["success": true, "result": [["domain_name": "example.org", "expires_at": "2027-01-01T00:00:00Z", "status": "active", "auto_renew": true]], "result_info": [:]])
        default: fatalError("Unexpected Cloudflare endpoint \(request.url!.path)")
        }
    }
    do {
        let result = try inventory.discover(token: "test-token")
        precondition((result["resources"] as? [[String: String]])?.count == 5)
        precondition(Set(result["queriedKinds"] as? [String] ?? []) == Set(["zone", "pages", "worker", "r2", "registrar"]))
        MockCloudflareProtocol.reply = { request in
            request.url!.path == "/client/v4/zones"
                ? (200, ["success": true, "result": [], "result_info": ["total_pages": 1]])
                : (403, ["success": false])
        }
        let partial = try inventory.discover(token: "test-token")
        precondition((partial["queriedKinds"] as? [String]) == ["zone"])
        precondition(!(partial["warnings"] as? [String] ?? []).isEmpty)
        // Syncing again reads what was added since: every page of zones (50 a page) and every Registrar cursor page.
        var zoneCount = 120
        MockCloudflareProtocol.reply = { request in
            let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) -> String? in items.first(where: { $0.name == name })?.value }
            switch request.url!.path {
            case "/client/v4/zones":
                let page = Int(value("page") ?? "1") ?? 1
                let zones: [[String: String]] = (((page - 1) * 50)..<min(page * 50, zoneCount)).map { ["id": "zone-\($0)", "name": "site\($0).example", "status": "active"] }
                return (200, ["success": true, "result": zones, "result_info": ["total_pages": (zoneCount + 49) / 50]] as [String: Any])
            case "/client/v4/accounts":
                return (200, ["success": true, "result": [["id": accountId, "name": "My account"]], "result_info": ["total_pages": 1]] as [String: Any])
            case "/client/v4/accounts/\(accountId)/registrar/registrations":
                let second = value("cursor") == "next"
                let domain = second ? "site\(zoneCount - 1).example" : "site0.example"
                return (200, ["success": true, "result": [["domain_name": domain, "expires_at": "2027-01-01T00:00:00Z", "status": "active", "auto_renew": true]], "result_info": ["cursor": second ? "" : "next"]] as [String: Any])
            default:
                return (403, ["success": false] as [String: Any])
            }
        }
        func names(_ result: [String: Any], _ kind: String) -> Set<String> {
            Set((result["resources"] as? [[String: String]] ?? []).filter { $0["kind"] == kind }.compactMap { $0["name"] })
        }
        let before = try inventory.discover(token: "test-token")
        precondition(names(before, "zone").count == 120 && names(before, "registrar") == Set(["site0.example", "site119.example"]), "All zone pages and Registrar cursor pages are read")
        zoneCount = 121
        let after = try inventory.discover(token: "test-token")
        precondition(names(after, "zone").count == 121 && names(after, "zone").contains("site120.example") && names(after, "registrar").contains("site120.example"), "A zone and a domain added since the last sync are read")
        print("PASS: Cloudflare Zone, Pages, Workers, R2 discovery and partial permission handling")
        print("PASS: Cloudflare re-sync reads zones and Registrar domains added since, across pages")
    } catch { fputs("Cloudflare inventory test failed: \(error)\n", stderr); exit(1) }
}

func mockRequestBody(_ request: URLRequest) -> [String: Any] {
    var data = request.httpBody ?? Data()
    if data.isEmpty, let stream = request.httpBodyStream {
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 65536)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
    }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
}

func testAI() {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    do {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        precondition((try? AIRecognizer.validate(provider: "openai", baseURL: "http://api.example.org/v1", model: "m", autoImages: true)) == nil, "Remote http must be rejected")
        precondition((try? AIRecognizer.validate(provider: "openai", baseURL: "https://user:secret@api.example.org/v1", model: "m", autoImages: true)) == nil, "Credentials in URL must be rejected")
        precondition((try? AIRecognizer.validate(provider: "other", baseURL: "https://api.example.org", model: "m", autoImages: true)) == nil)
        precondition((try? AIRecognizer.validate(provider: "anthropic", baseURL: "https://api.anthropic.com", model: " ", autoImages: true)) == nil)
        let local = try AIRecognizer.validate(provider: "openai", baseURL: " http://127.0.0.1:11434/v1 ", model: "qwen2.5vl:7b", autoImages: false)
        precondition(local.baseURL == "http://127.0.0.1:11434/v1" && AIRecognizer.isLocal(URL(string: local.baseURL)!))
        func endpoint(_ provider: String, _ base: String) -> String { AIRecognizer.endpoint(for: AISettings(provider: provider, baseURL: base, model: "m", autoImages: true))!.absoluteString }
        precondition(endpoint("anthropic", "https://api.anthropic.com") == "https://api.anthropic.com/v1/messages")
        precondition(endpoint("anthropic", "https://api.anthropic.com/v1/") == "https://api.anthropic.com/v1/messages")
        precondition(endpoint("openai", "https://api.openai.com/v1") == "https://api.openai.com/v1/chat/completions")
        precondition(endpoint("openai", "https://gateway.example.org/v1/chat/completions") == "https://gateway.example.org/v1/chat/completions")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockCloudflareProtocol.self]
        let recognizer = AIRecognizer(directory: root, session: URLSession(configuration: configuration))
        func run(_ settings: AISettings, key: String?, image: Data?, _ reply: @escaping (URLRequest) -> (Int, Any)) -> Result<String, Error> {
            MockCloudflareProtocol.reply = reply
            let done = DispatchSemaphore(value: 0)
            var outcome: Result<String, Error>!
            recognizer.recognize(settings: settings, key: key, text: "材料", image: image) { outcome = $0; done.signal() }
            precondition(done.wait(timeout: .now() + 5) == .success)
            return outcome
        }
        let anthropic = AISettings(provider: "anthropic", baseURL: "https://api.anthropic.com", model: "claude-opus-5-5", autoImages: true)
        let claude = run(anthropic, key: "sk-test", image: Data([1, 2, 3])) { request in
            let body = mockRequestBody(request), content = ((body["messages"] as? [[String: Any]])?.first?["content"]) as? [[String: Any]] ?? []
            precondition(request.httpMethod == "POST" && request.url?.absoluteString == "https://api.anthropic.com/v1/messages")
            precondition(request.value(forHTTPHeaderField: "x-api-key") == "sk-test" && request.value(forHTTPHeaderField: "anthropic-version") == "2023-06-01")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            precondition(body["model"] as? String == "claude-opus-5-5" && body["system"] as? String == AIRecognizer.prompt && body["max_tokens"] as? Int == 2000)
            precondition(content.first?["type"] as? String == "image" && ((content.first?["source"] as? [String: Any])?["data"] as? String) == "AQID")
            precondition(content.last?["text"] as? String == "材料")
            return (200, ["content": [["type": "text", "text": "{\"items\":[]}"]]])
        }
        guard case .success(let claudeReply) = claude, claudeReply == "{\"items\":[]}" else { fatalError("Anthropic reply not read") }
        let compatible = AISettings(provider: "openai", baseURL: "https://api.example.org/v1", model: "vision-model", autoImages: true)
        let openai = run(compatible, key: "key-1", image: Data([1, 2, 3])) { request in
            let body = mockRequestBody(request), messages = body["messages"] as? [[String: Any]] ?? []
            let user = messages.last?["content"] as? [[String: Any]] ?? []
            precondition(request.url?.absoluteString == "https://api.example.org/v1/chat/completions" && request.value(forHTTPHeaderField: "Authorization") == "Bearer key-1")
            precondition(messages.first?["role"] as? String == "system" && messages.first?["content"] as? String == AIRecognizer.prompt)
            precondition(((user.last?["image_url"] as? [String: Any])?["url"] as? String) == "data:image/jpeg;base64,AQID")
            return (200, ["choices": [["message": ["content": "ok"]]]])
        }
        guard case .success("ok") = openai else { fatalError("Compatible reply not read") }
        let textOnly = run(local, key: nil, image: nil) { request in
            let messages = mockRequestBody(request)["messages"] as? [[String: Any]] ?? []
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil && messages.last?["content"] as? String == "材料")
            return (200, ["choices": [["message": ["content": [["type": "text", "text": "part"]]]]]])
        }
        guard case .success("part") = textOnly else { fatalError("Text-only request failed") }
        let denied = run(anthropic, key: "bad", image: nil) { _ in (401, ["type": "error", "error": ["type": "authentication_error", "message": "invalid x-api-key"]]) }
        guard case .failure(let error) = denied, error.localizedDescription.contains("API key 无效"), error.localizedDescription.contains("invalid x-api-key") else { fatalError("401 not explained") }
        let missing = run(compatible, key: "k", image: nil) { _ in (404, ["error": ["message": "model not found"]]) }
        guard case .failure(let notFound) = missing, notFound.localizedDescription.contains("模型不存在") else { fatalError("404 not explained") }
        let odd = run(compatible, key: "k", image: nil) { _ in (200, ["unexpected": true]) }
        guard case .failure = odd else { fatalError("Unexpected reply accepted") }

        try recognizer.saveSettings(anthropic)
        precondition(recognizer.loadSettings() == anthropic)
        let permissions = try FileManager.default.attributesOfItem(atPath: recognizer.settingsFile.path)[.posixPermissions] as? Int
        precondition(permissions == 0o600)
        try Data("{\"provider\":\"anthropic\",\"baseURL\":\"http://evil.example\",\"model\":\"m\",\"autoImages\":true}".utf8).write(to: recognizer.settingsFile)
        precondition(recognizer.loadSettings() == nil, "Tampered settings must not load")

        let wide = NSImage(size: NSSize(width: 3200, height: 800))
        wide.lockFocus(); NSColor.systemBlue.setFill(); NSRect(x: 0, y: 0, width: 3200, height: 800).fill(); wide.unlockFocus()
        let imageURL = root.appendingPathComponent("wide.png")
        try NSBitmapImageRep(data: wide.tiffRepresentation!)!.representation(using: .png, properties: [:])!.write(to: imageURL)
        guard let prepared = AIRecognizer.preparedImage(at: imageURL), let rep = NSBitmapImageRep(data: prepared) else { fatalError("Image not prepared") }
        precondition(rep.pixelsWide == 1600 && rep.pixelsHigh == 400)

        let store = try BoardStore(root: root.appendingPathComponent("store"))
        try store.database.saveEvidence(id: "ocr-x", kind: "ocr", source: "x.png", title: "x.png", body: "text", payload: ["file": "/tmp/x.png"])
        try store.database.mergeEvidencePayload(id: "ocr-x", values: ["ai": ["text": "{}"]])
        try store.database.saveEvidence(id: "ocr-x", kind: "ocr", source: "x.png", title: "x.png", body: "text", payload: ["file": "/tmp/y.png"])
        let row = try store.database.evidence(id: "ocr-x")
        let payload = (try? JSONSerialization.jsonObject(with: Data((row?["payload"] ?? "").utf8))) as? [String: Any]
        precondition(payload?["ai"] != nil && payload?["file"] as? String == "/tmp/y.png", "Re-import must keep the AI reading")
        print("PASS: AI settings validation, endpoints, Anthropic and compatible requests with images, error messages, settings file, image downscale, evidence annotation")
    } catch { fputs("AI test failed: \(error)\n", stderr); exit(1) }
}

final class WebViewTestHandler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var actions: [String] = []
    var loaded = false
    var reminders: Any?
    var iconHosts: [String] = []
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        actions.append(action)
        if action == "reminders" { reminders = body["items"] }
        if action == "iconFetch", let host = body["host"] as? String { iconHosts.append(host) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
}

// Runs the bundled board in WebKit/JavaScriptCore: the in-page confirmation, undo and evidence bridge.
func testWebView() {
    _ = NSApplication.shared
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    // Optimised builds drop precondition messages, so failures print their reason before exiting.
    func check(_ ok: Bool, _ message: @autoclosure () -> String) { if !ok { fputs("WebView test failed: \(message())\n", stderr); exit(1) } }
    func wait(_ label: String = "condition", _ condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(10)
        while !condition() && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        check(condition(), "timed out waiting for \(label)")
    }
    do {
        guard let board = Bundle.main.resourceURL?.appendingPathComponent("Board", isDirectory: true) else { fatalError("Missing Board resources") }
        let store = try BoardStore(root: root)
        try store.database.saveEvidence(id: "gmail-a", kind: "gmail", source: "Figma <billing@figma.com>", title: "Your plan renews", body: "Your Figma plan will renew on October 6, 2099.\nYou will be charged $15.00/month.", payload: ["date": "Mon, 21 Sep 2026 10:00:00 +0000"])
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let soon = formatter.string(from: Date().addingTimeInterval(3 * 86400))
        let data: [String: Any] = ["blocks": [["id": "domain", "width": 50, "collapsed": false, "height": NSNull()]],
                                   "assets": [["id": "a", "type": "domain", "name": "soon.dev", "provider": "Registrar", "account": "", "date": soon, "art": "generic", "source": "manual"]]]
        let initial = String(data: try JSONSerialization.data(withJSONObject: ["data": data, "cloudflareConnected": false, "githubConnected": false]), encoding: .utf8)!
        let handler = WebViewTestHandler()
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: "window.__errors=[];addEventListener('error',e=>__errors.push(e.message));window.__ASSETBOARD_NATIVE__ = \(initial);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(handler, name: "assetboard")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800), configuration: configuration)
        webView.navigationDelegate = handler
        webView.loadFileURL(board.appendingPathComponent("index.html"), allowingReadAccessTo: board)
        wait { handler.loaded && handler.actions.contains("evidenceList") }
        func run(_ script: String) -> String {
            var result: String?
            webView.evaluateJavaScript(script) { value, error in result = error.map { "ERROR: \($0)" } ?? (value as? String ?? "") }
            wait { result != nil }
            return result!
        }
        // The page cannot reach the network: its Content-Security-Policy blocks a request from the page itself.
        _ = run("window.__csp='';addEventListener('securitypolicyviolation',e=>{window.__csp=e.violatedDirective||e.effectiveDirective});fetch('https://example.com/').catch(()=>{});''")
        wait("CSP violation") { run("window.__csp").hasPrefix("connect-src") }
        // The page plans four reminders for soon.dev (due in 3 days, no renewal): the 1-day lead, the day itself, and 3 and
        // 14 days after expiry; the plan passes the Swift validation.
        wait("reminder plan") { handler.reminders != nil }
        let planned = ReminderItem.parse(handler.reminders)
        check(planned?.map(\.body) == ["明天到期", "今天到期", "已过期 3 天，看看还能不能补救", "已过期 14 天，看看还能不能补救"] && planned?.allSatisfy { $0.title == "soon.dev" && $0.assetId == "a" } == true, "Reminder plan from WebKit: \(String(describing: handler.reminders))")
        let rows = String(data: try JSONSerialization.data(withJSONObject: try store.database.listEvidence()), encoding: .utf8)!
        _ = run("window.assetboardEvidenceList(\(rows));''")
        let evidence = run("JSON.stringify({pending:pendingCount(),date:candidates()[0]?.date?.value,cost:candidates()[0]?.cost,agenda:(setView('upcoming'),document.querySelector('#board').innerText)})")
        precondition(evidence.contains("\"pending\":1") && evidence.contains("2099-10-06") && evidence.contains("$15.00 / 月") && evidence.contains("3 天"), evidence)
        let opened = run("document.querySelector('[data-asset=\"a\"] .item-open').click();document.querySelector('#detail [data-action=\"asset-menu\"]').click();document.querySelector('#menu [data-action=\"delete-asset\"]').click();String(!!document.querySelector('#modal[open] #confirm-yes'))")
        precondition(opened == "true", "Delete must ask with the in-page dialog in WebKit")
        let saves = handler.actions.filter { $0 == "save" }.count
        let deleted = run("document.querySelector('#confirm-yes').click();''")
        wait { handler.actions.filter { $0 == "save" }.count > saves }
        precondition(deleted == "" && run("String(state.assets.length)") == "0", "Confirmed delete must remove the record")
        wait("empty reminder plan") { ReminderItem.parse(handler.reminders)?.isEmpty == true }
        precondition(run("document.querySelector('#toast .toast-undo').click();String(state.assets.length)") == "1", "Toast undo must restore the record")
        wait("restored reminder plan") { ReminderItem.parse(handler.reminders)?.map(\.body) == planned?.map(\.body) }
        let fromNotification = run("assetboardReminderOpen('a');JSON.stringify([currentView(),activeAsset,!document.querySelector('#detail').hidden])")
        check(fromNotification == "[\"upcoming\",\"a\",true]", "A reminder click must open the record in 即将到来: " + fromNotification)
        let off = run("assetboardConnectionState({notifications:'denied'});const n=document.querySelector('#board .notify-off');n?.querySelector('[data-action=\"notification-settings\"]').click();n?n.textContent:''")
        wait("settings bridge") { handler.actions.contains("openNotificationSettings") }
        check(off.contains("系统通知已关闭"), "Denied notifications must be named above 即将到来: " + off)
        check(run("assetboardConnectionState({notifications:'allowed'});String(!document.querySelector('.notify-off'))") == "true", "The note goes once notifications are allowed")
        let reading = run("window.assetboardAIResult({kind:'recognize',requestId:0,ok:true,evidenceId:'gmail-a',ai:{provider:'anthropic',model:'m',at:'t',text:'```json\\n{\"items\":[{\"name\":\"Figma Professional\",\"merchant\":\"Figma\",\"type\":\"subscription\",\"amount\":\"15\",\"currency\":\"USD\",\"cycle\":\"monthly\",\"date\":\"2099-10-06\",\"dateKind\":\"renew\"}]}\\n```'}});const c=candidates()[0];JSON.stringify([c.name,c.cost,c.date.source])")
        precondition(reading == "[\"Figma Professional\",\"$15 / 月\",\"ai\"]", "AI reading must parse in WebKit: " + reading)
        webView.appearance = NSAppearance(named: .aqua)
        wait { run("document.documentElement.dataset.scheme") == "light" }
        let lightCanvas = run("getComputedStyle(document.body).backgroundColor+getComputedStyle(document.body,'::before').backgroundImage")
        webView.appearance = NSAppearance(named: .darkAqua)
        wait { run("document.documentElement.dataset.scheme") == "dark" }
        let darkCanvas = run("getComputedStyle(document.body).backgroundColor+getComputedStyle(document.body,'::before').backgroundImage")
        precondition(lightCanvas != darkCanvas && handler.actions.filter { $0 == "themeColor" }.count >= 2, "Page must follow the system appearance: \(lightCanvas) / \(darkCanvas)")
        // Direct manipulation with synthetic pointer events: row reorder, drop on a sidebar category, list/grid switch.
        let setup = run("""
            state.blocks.push({id:'server',width:50,collapsed:false,height:null});
            state.assets.push({id:'b',type:'domain',name:'b.dev',provider:'R',account:'',art:'generic',source:'manual'},{id:'s',type:'server',name:'box',provider:'H',account:'',art:'generic',source:'manual'});
            setView('all');
            window.__fire=(el,type,x,y)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));
            window.__center=el=>{const r=el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];};
            String(CSS.supports('translate','1px 2px')&&CSS.supports('scale','1.02'))
            """)
        check(setup == "true", "WebKit must support individual transform properties used by the drag lift")
        let reorder = run("""
            (()=>{const a=document.querySelector('[data-asset="a"]'),[ax,ay]=__center(a),[bx,by]=__center(document.querySelector('[data-asset="b"]'));
            __fire(a,'pointerdown',ax,ay);__fire(document,'pointermove',ax+10,ay);const lifted=a.classList.contains('is-dragging')&&getComputedStyle(a).position==='fixed';
            __fire(document,'pointermove',bx+40,by);const slot=!!document.querySelector('.group[data-group="domain"] .drop-slot');__fire(document,'pointerup',bx+40,by);return JSON.stringify({lifted,slot});})()
            """)
        check(reorder == "{\"lifted\":true,\"slot\":true}", "Row drag must lift and preview in WebKit: " + reorder)
        wait("card order") { run("String(state.cardOrder?.domain?.join(','))") == "b,a" && run("String(!document.querySelector('.drop-slot,.is-dragging'))") == "true" }
        let crossed = run("""
            (()=>{const b=document.querySelector('[data-asset="b"]'),server=document.querySelector('#sidebar .nav-item[data-block="server"]'),[x,y]=__center(b),[sx,sy]=__center(server);
            __fire(b,'pointerdown',x,y);__fire(document,'pointermove',x+10,y);__fire(document,'pointermove',sx,sy);const into=server.classList.contains('drop-into');__fire(document,'pointerup',sx,sy);return String(into);})()
            """)
        wait("cross-block category") { run("state.assets.find(a=>a.id==='b').type") == "server" }
        check(crossed == "true", "A sidebar category must highlight as a drop target in WebKit")
        let grid = run("document.querySelector('#layout-toggle [data-id=\"grid\"]').click();String(layoutMode==='grid'&&document.querySelectorAll('#board .gcard').length===3)")
        check(grid == "true", "The list/grid switch must work in WebKit")
        // Panorama: opens on P, shows a server lane and the registered-status label, closes on Esc.
        let panorama = run("""
            (()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}));const opened=!document.querySelector('#panorama').hidden,lane=!!document.querySelector('#panorama .pano-lane'),tag=document.querySelector('.pano-tag')?.textContent||'';
            document.querySelector('#panorama [data-lane-head]')?.click();const hero=!!document.querySelector('#panorama .pano-hero');
                const esc=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));esc();const back=!!document.querySelector('#panorama .pano-lane')&&!document.querySelector('#panorama .pano-hero');
                esc();return JSON.stringify({opened,lane,tag,hero,back,closed:document.querySelector('#panorama').hidden});})()
            """)
        check(panorama.contains("\"opened\":true") && panorama.contains("\"lane\":true") && panorama.contains("\"hero\":true") && panorama.contains("\"back\":true") && panorama.contains("登记状态") && panorama.contains("\"closed\":true"), "Panorama must open on P, focus a server on click, and peel with Esc in WebKit: " + panorama)
        // 获取网站图标: a row shows the icon its assets have, fetches on its own, and takes a site of the person's choosing, checked in place
        // by the same rules as IconFetcher.host(from:). 设置 draws its switches (here 自动获取网站图标, off) as a track in WebKit too.
        let inputs = [" Wise.com ", "https://www.hsbc.com.hk/zh-hk/", "192.168.1.1", "localhost", "printer.local", "https://user:pw@wise.com", "[::1]", "wise", "file:///etc", "-bad-.com", "ftp://files.example.com"]
        let jsHosts = run("JSON.stringify(\(String(data: try JSONSerialization.data(withJSONObject: inputs), encoding: .utf8)!).map(iconSiteHost))")
        let swiftHosts = String(data: try JSONSerialization.data(withJSONObject: inputs.map { IconFetcher.host(from: $0) ?? "" }), encoding: .utf8)!
        check(jsHosts == swiftHosts, "The page and IconFetcher must accept the same sites: \(jsHosts) vs \(swiftHosts)")
        let iconRowState = run("""
            (()=>{state.autoIcons=false;const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');g.fillStyle='#36c';g.fillRect(0,0,16,16);window.__png=c.toDataURL('image/png');
            state.assets.push({id:'iv',type:'server',name:'v-box',provider:'Vultr',account:'',art:'generic',source:'manual',siteIcon:__png,siteIconHost:'vultr.com'},{id:'ih',type:'server',name:'h-box',provider:'Hetzner',account:'',art:'generic',source:'manual'});
            save();render();iconBatchDialog();const row=h=>document.querySelector(`#icon-batch li[data-platform="${h}"]`);
            const rows={vultr:!!row('vultr.com')?.querySelector('.tile img'),hetzner:!!row('hetzner.com')?.querySelector('.tile svg')&&!row('hetzner.com').querySelector('img')};
            prefsDialog('features');const sw=document.querySelector('#modal input.prefs-switch[data-action="auto-icons"]'),r=sw.getBoundingClientRect();
            const cs=getComputedStyle(sw),out={...rows,track:r.width>=30&&r.width<=36&&r.height>=18&&r.height<=22&&(cs.appearance||cs.webkitAppearance)==='none'||[r.width,r.height,cs.appearance].join(' '),off:!sw.checked};
            $('#modal').close();iconBatchDialog();return JSON.stringify(out);})()
            """)
        check(iconRowState == "{\"vultr\":true,\"hetzner\":true,\"track\":true,\"off\":true}", "Icon rows and the 设置 switch in WebKit: " + iconRowState)
        // Each step is its own function: every evaluateJavaScript shares the page's global scope, so a top-level const would clash.
        let rowClick = run("(()=>{document.querySelector('#icon-batch li[data-platform=\"hetzner.com\"] [data-action=\"icon-row-fetch\"]').click();return ''})()")
        check(rowClick == "", "Row fetch click: " + rowClick)
        wait("row fetch") { handler.iconHosts == ["hetzner.com"] }
        let fetched = run("(()=>{assetboardIconResult({requestId:[...iconRowRequests.keys()][0],ok:true,host:'hetzner.com',dataUrl:__png});return JSON.stringify([state.assets.find(a=>a.id==='ih').siteIconHost,!!document.querySelector('#icon-batch li[data-platform=\"hetzner.com\"] .tile img')])})()")
        check(fetched == "[\"hetzner.com\",true]", "A row's fetch lands on its assets and its row: " + fetched)
        let invalid = run("(()=>{document.querySelector('#icon-batch li[data-platform=\"hetzner.com\"] [data-action=\"icon-site-edit\"]').click();const f=document.querySelector('#icon-batch .icon-site-form');f.elements.site.value='192.168.1.1';f.querySelector('[type=submit]').click();return JSON.stringify([!!document.querySelector('#icon-batch .icon-site-form input[aria-invalid=\"true\"]'),document.activeElement?.name||'',document.querySelector('#modal').open])})()")
        check(invalid == "[true,\"site\",true]", "An unusable site is refused in its row: " + invalid)
        let siteSubmit = run("(()=>{const f=document.querySelector('#icon-batch .icon-site-form');f.elements.site.value='https://www.hetzner.example.com/start';f.querySelector('[type=submit]').click();return JSON.stringify([...iconRowRequests.values()].map(q=>q.site))})()")
        check(siteSubmit == "[\"www.hetzner.example.com\"]", "The named site must be asked: " + siteSubmit)
        wait("custom site fetch") { handler.iconHosts == ["hetzner.com", "www.hetzner.example.com"] }
        let custom = run("(()=>{assetboardIconResult({requestId:[...iconRowRequests.keys()][0],ok:true,host:'www.hetzner.example.com',dataUrl:__png});const r=JSON.stringify([state.iconSites?.['hetzner.com'],state.assets.find(a=>a.id==='ih').siteIconHost,document.querySelector('#icon-batch li[data-platform=\"hetzner.com\"] .icon-row-note')?.textContent]);document.querySelector('#modal').close();return r})()")
        check(custom == "[\"www.hetzner.example.com\",\"www.hetzner.example.com\",\"www.hetzner.example.com\"]", "A named site is kept for its platform: " + custom)
        check(run("JSON.stringify(window.__errors)") == "[]", "Page reported script errors: " + run("JSON.stringify(window.__errors)"))
        print("PASS: WebKit board load, reminder plan through the bridge (after delete and undo), reminder click, notifications-off note and settings bridge, evidence bridge candidates, upcoming view, in-page delete confirmation from the inspector menu, toast undo, AI reply parsing, light/dark appearance, row drag, drop on a sidebar category, list/grid switch, panorama open and close, site icon rows (row fetch, named site checked like IconFetcher, switch layout)")
    } catch { fputs("WebView test failed: \(error)\n", stderr); exit(1) }
}

@main struct AssetboardMain {
static func main() {
if CommandLine.arguments.contains("--test-store") {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    do {
        let store = try BoardStore(root: root)
        let initial = try store.load()
        precondition(initial == nil)
        let data: [String: Any] = ["blocks": [["id": "domain"]], "assets": [["id": "test", "name": "test.dev", "type": "domain"]]]
        try store.save(data)
        let reopened = try BoardStore(root: root)
        let loaded = try reopened.load()
        precondition((loaded?["assets"] as? [[String: Any]])?.count == 1)
        let storedCount = try reopened.database.assetCount()
        precondition(storedCount == 1)
        try reopened.database.saveEvidence(id: "ocr-sample", kind: "ocr", source: "sample.png", title: "Sample", body: "Renewal notice", payload: ["date": "2026-09-20"])
        let evidence = try reopened.database.listEvidence()
        precondition(evidence.count == 1 && evidence[0]["body"] == "Renewal notice" && evidence[0]["payload"]?.contains("2026-09-20") == true)
        try reopened.database.saveEvidence(id: "ocr-long", kind: "ocr", source: "long.png", title: "Long", body: String(repeating: "x", count: 9000))
        let clipped = try reopened.database.listEvidence(bodyLimit: 6000).first { $0["id"] == "ocr-long" }
        precondition(clipped?["body"]?.count == 6000)
        try reopened.save(data)
        precondition(FileManager.default.fileExists(atPath: root.appendingPathComponent("board.previous.json").path))
        do { try reopened.save(["invalid": true]); fatalError("Invalid data accepted") } catch {}
        do { try reopened.save(["blocks": [["id": "unknown"]], "assets": []]); fatalError("Unknown category accepted") } catch {}
        let priority: [String: Any] = ["blocks": ["bankcard", "phone", "appleid", "google", "ai"].map { ["id": $0] },
                                       "assets": [["id": "card", "name": "Card", "type": "bankcard", "last4": "4821", "links": ["apple"]], ["id": "apple", "name": "Apple ID", "type": "appleid", "links": ["card"]]]]
        try reopened.save(priority)
        let priorityCount = try reopened.database.assetCount()
        precondition(priorityCount == 2, "Priority categories must save")
        try reopened.save(data)
        let afterInvalid = try reopened.load()
        precondition((afterInvalid?["assets"] as? [[String: Any]])?.count == 1)
        let oldRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: oldRoot) }
        try FileManager.default.createDirectory(at: oldRoot, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: data).write(to: oldRoot.appendingPathComponent("board.json"))
        let migrated = try BoardStore(root: oldRoot)
        let migratedBoard = try migrated.load()
        let migratedCount = try migrated.database.assetCount()
        precondition((migratedBoard?["assets"] as? [[String: Any]])?.count == 1)
        precondition(migratedCount == 1)
        print("PASS: SQLite save, JSON migration and backup, reopen, reject invalid data and unknown categories, priority categories, evidence list payload and clipping")
    } catch { fputs("Store test failed: \(error)\n", stderr); exit(1) }
} else if CommandLine.arguments.contains("--test-cloudflare") {
    testCloudflare()
} else if CommandLine.arguments.contains("--test-ssh-probe") {
    #if !ASSETBOARD_FREE
    testSSHProbe()
    #else
    print("PASS: SSH probe is not in the free edition")
    #endif
} else if CommandLine.arguments.contains("--test-probe") {
    #if !ASSETBOARD_FREE
    testProbeSources()
    #else
    print("PASS: probe sources are not in the free edition")
    #endif
} else if CommandLine.arguments.contains("--test-github") {
    testGitHub()
} else if CommandLine.arguments.contains("--test-cloudflare-inventory") {
    testCloudflareInventory()
} else if CommandLine.arguments.contains("--test-ai") {
    testAI()
} else if CommandLine.arguments.contains("--test-local") {
    testLocalDirectory()
    testThemePreference()
} else if CommandLine.arguments.contains("--test-inbox") {
    testAgentInbox()
} else if CommandLine.arguments.contains("--test-fx") {
    testExchangeRates()
} else if CommandLine.arguments.contains("--test-network-log") {
    testNetworkLog()
} else if CommandLine.arguments.contains("--test-agent-socket") {
    testAgentSocket()
} else if CommandLine.arguments.contains("--test-icons") {
    testIcons()
} else if CommandLine.arguments.contains("--test-webview") {
    testWebView()
} else if CommandLine.arguments.contains("--test-reminders") {
    testReminders()
} else if CommandLine.arguments.contains("--test-update") {
    testUpdate()
} else if CommandLine.arguments.contains("--test-notify") {
    testNotify()
} else if CommandLine.arguments.contains("--test-ocr") {
    let sample = NSImage(size: NSSize(width: 900, height: 180))
    sample.lockFocus()
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: 900, height: 180).fill()
    ("ASSETBOARD 123" as NSString).draw(at: NSPoint(x: 35, y: 65), withAttributes: [.font: NSFont.systemFont(ofSize: 70), .foregroundColor: NSColor.black])
    sample.unlockFocus()
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
    defer { try? FileManager.default.removeItem(at: url) }
    guard let tiff = sample.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("OCR sample generation failed") }
    do {
        try png.write(to: url)
        let recognized = try OCRImporter.recognize(at: url)
        precondition(recognized.contains("ASSETBOARD"))
        print("PASS: local Vision image recognition")
    } catch { fputs("OCR test failed: \(error)\n", stderr); exit(1) }
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
}
}
