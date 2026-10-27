import AppKit
import WebKit
import UniformTypeIdentifiers

/// The native half of renewals and exports: saving the files the page builds (calendar, ledger, handover list), asking a
/// domain's registry for its expiry and lifecycle status over RDAP (only when the person clicks, recorded in 网络记录), the menu bar summary,
/// and a Dock bounce when an agent asks for something that needs the person.
var statusMenu: StatusMenu?

extension AppDelegate {
    static let statusItemHiddenKey = "statusItemHidden"
    static let maxSavedFile = 20 * 1024 * 1024

    /// Handles the page's money-related messages; false for anything else.
    func handleMoneyMessage(_ action: String, _ body: [String: Any]) -> Bool {
        switch action {
        case "saveFile":
            saveExport(name: body["name"] as? String ?? "Assetboard.txt", text: body["text"] as? String ?? "")
        case "rdap":
            lookUpRegistry(requestId: body["requestId"] as? Int ?? 0, domain: body["domain"] as? String ?? "")
        case "statusSummary":
            if let summary = body["summary"] as? [String: Any] { updateStatusMenu(summary) }
        case "attention":
            if !NSApplication.shared.isActive { NSApplication.shared.requestUserAttention(.informationalRequest) }
        default:
            return false
        }
        return true
    }

    /// A save panel for an export; the name comes from the page, the folder and final name from the person.
    func saveExport(name: String, text: String) {
        let reply = { (ok: Bool, error: String?) in
            let error = error.flatMap { try? JSONSerialization.data(withJSONObject: [$0]) }.flatMap { String(data: $0, encoding: .utf8) }.map { "\($0)[0]" } ?? "null"
            self.webView.evaluateJavaScript("window.assetboardFileSaved?.(\(ok), \(error))")
        }
        guard !text.isEmpty, text.utf8.count <= AppDelegate.maxSavedFile else { reply(false, L("文件太大或为空")); return }
        let safeName = String(name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-").prefix(120))
        let panel = NSSavePanel()
        panel.nameFieldStringValue = safeName
        panel.canCreateDirectories = true
        if let type = UTType(filenameExtension: (safeName as NSString).pathExtension) { panel.allowedContentTypes = [type] }
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let destination = panel.url else { reply(false, nil); return }
            do {
                try Data(text.utf8).write(to: destination, options: .atomic)
                reply(true, nil)
            } catch {
                reply(false, error.localizedDescription)
            }
        }
    }

    /// RDAP for one domain, asked of the registry that holds it as IANA's bootstrap file names it (no redirector in between);
    /// https only, no cookies.
    func lookUpRegistry(requestId: Int, domain: String) {
        func reply(_ payload: [String: Any]) {
            var message = payload
            message["requestId"] = requestId
            DispatchQueue.main.async {
                guard let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8) else { return }
                self.webView.evaluateJavaScript("window.assetboardRdap?.(\(json))")
            }
        }
        guard let host = IconFetcher.host(from: domain), host.split(separator: ".").count >= 2 else { reply(["ok": false, "error": L("不是有效的域名")]); return }
        func ask(_ url: URL) {
            var request = URLRequest(url: url)
            request.setValue("application/rdap+json, application/json", forHTTPHeaderField: "Accept")
            RegistryLookup.session.dataTask(with: request) { data, response, error in
                if let error { reply(["ok": false, "error": error.localizedDescription]); return }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard status == 200, let data, data.count <= 1_000_000,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    reply(["ok": false, "error": status == 404 ? L("注册局查不到这个域名") : L("注册局返回 {status}", ["status": status])])
                    return
                }
                // Only what the page reads goes back: the events, the lifecycle status and the registrar's name.
                let events = (json["events"] as? [[String: Any]] ?? []).map { event -> [String: Any] in ["eventAction": event["eventAction"] ?? "", "eventDate": event["eventDate"] ?? ""] }
                let states = Array((json["status"] as? [Any] ?? []).compactMap { $0 as? String }.prefix(20))
                let entities = (json["entities"] as? [[String: Any]] ?? []).filter { ($0["roles"] as? [String] ?? []).contains("registrar") }.map { entity -> [String: Any] in ["roles": entity["roles"] ?? [Any](), "vcardArray": entity["vcardArray"] ?? [Any]()] }
                reply(["ok": true, "json": ["events": events, "status": states, "entities": entities]])
            }.resume()
        }
        RegistryLookup.server(for: host) { result in
            switch result {
            case .failure(let error):
                reply(["ok": false, "error": L("取不到 IANA 的注册局列表：{error}", ["error": error.localizedDescription])])
            case .success(.none):
                reply(["ok": false, "error": L("这个后缀的注册局没有提供 RDAP")])
            case .success(.some(let base)):
                let root = base.absoluteString.hasSuffix("/") ? base.absoluteString : base.absoluteString + "/"
                guard let url = URL(string: root + "domain/" + host) else { reply(["ok": false, "error": L("不是有效的域名")]); return }
                ask(url)
            }
        }
    }

    // MARK: Menu bar

    func updateStatusMenu(_ summary: [String: Any]) {
        if UserDefaults.standard.bool(forKey: AppDelegate.statusItemHiddenKey) { statusMenu = nil; return }
        if statusMenu == nil {
            statusMenu = StatusMenu(open: { [weak self] id in self?.openReminder(id) },
                                    show: { [weak self] in self?.window?.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true) },
                                    add: { [weak self] in self?.window?.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true); self?.addBlock() })
        }
        statusMenu?.update(summary)
    }

    /// 设置 › 在菜单栏显示 (the page's prefsDialog sends it through the `preference` bridge action).
    func setStatusItemShown(_ shown: Bool) {
        UserDefaults.standard.set(!shown, forKey: AppDelegate.statusItemHiddenKey)
        if shown { webView.evaluateJavaScript("statusSent='';syncStatusItem()") } else { statusMenu = nil }
    }
}

enum RegistryLookup {
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 20
        return URLSession(configuration: configuration, delegate: RegistryRedirects(service: L("注册局 RDAP")), delegateQueue: nil)
    }()

    /// IANA's bootstrap file (RFC 9224) says which RDAP server holds which top-level domain. Fetched when first needed, kept for a day.
    private static let bootstrapURL = URL(string: "https://data.iana.org/rdap/dns.json")!
    private static let queue = DispatchQueue(label: "assetboard.rdap-bootstrap")
    private static var services: [String: URL] = [:]
    private static var fetchedAt: Date?

    /// The RDAP base URL for a host (longest matching suffix), nil when its registry publishes none. Completes on a background queue.
    static func server(for host: String, completion: @escaping (Result<URL?, Error>) -> Void) {
        RegistryLookup.queue.async {
            if let fetched = RegistryLookup.fetchedAt, Date().timeIntervalSince(fetched) < 86_400, !RegistryLookup.services.isEmpty {
                completion(.success(RegistryLookup.match(host)))
                return
            }
            var request = URLRequest(url: RegistryLookup.bootstrapURL)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            RegistryLookup.session.dataTask(with: request) { data, response, error in
                RegistryLookup.queue.async {
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    if status == 200, let data, data.count <= 2_000_000, let parsed = RegistryLookup.parse(data), !parsed.isEmpty {
                        RegistryLookup.services = parsed
                        RegistryLookup.fetchedAt = Date()
                    } else if RegistryLookup.services.isEmpty {
                        completion(.failure(error ?? URLError(.badServerResponse)))
                        return
                    }
                    completion(.success(RegistryLookup.match(host)))
                }
            }.resume()
        }
    }

    private static func parse(_ data: Data) -> [String: URL]? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let entries = json["services"] as? [[Any]] else { return nil }
        var out: [String: URL] = [:]
        for entry in entries where entry.count >= 2 {
            guard let suffixes = entry[0] as? [String], let urls = entry[1] as? [String],
                  let base = urls.compactMap({ URL(string: $0) }).first(where: { $0.scheme == "https" }) else { continue }
            for suffix in suffixes { out[suffix.lowercased()] = base }
        }
        return out
    }

    private static func match(_ host: String) -> URL? {
        let labels = host.lowercased().split(separator: ".").map(String.init)
        for start in 0..<labels.count {
            if let base = RegistryLookup.services[labels[start...].joined(separator: ".")] { return base }
        }
        return nil
    }
}

private final class RegistryRedirects: LoggedSessionDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" ? request : nil)
    }
}

/// The calendar icon in the menu bar: how many things need attention this week, the next dates, and quick ways in.
final class StatusMenu: NSObject {
    private let item: NSStatusItem
    private let open: (String?) -> Void
    private let show: () -> Void
    private let add: () -> Void

    init(open: @escaping (String?) -> Void, show: @escaping () -> Void, add: @escaping () -> Void) {
        self.open = open
        self.show = show
        self.add = add
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()
        let image = NSImage(systemSymbolName: "calendar.badge.clock", accessibilityDescription: "Assetboard")
        image?.isTemplate = true
        item.button?.image = image
        item.button?.imagePosition = .imageLeading
        item.button?.toolTip = "Assetboard"
    }

    deinit { NSStatusBar.system.removeStatusItem(item) }

    func update(_ summary: [String: Any]) {
        let badge = summary["badge"] as? Int ?? 0
        item.button?.title = badge > 0 ? " \(badge)" : ""
        item.button?.setAccessibilityLabel(badge > 0 ? L("Assetboard，{n} 项需要留意", ["n": badge]) : "Assetboard")
        let menu = NSMenu()
        func label(_ title: String) { let entry = NSMenuItem(title: title, action: nil, keyEquivalent: ""); entry.isEnabled = false; menu.addItem(entry) }
        if let monthly = summary["monthly"] as? String, !monthly.isEmpty { label(L("周期费用 {amount}", ["amount": monthly])); menu.addItem(.separator()) }
        #if !ASSETBOARD_FREE
        // 待确认扣款 is Pro, as on the page (proSlots.chargesBand).
        if let charges = summary["charges"] as? Int, charges > 0 {
            let entry = NSMenuItem(title: L("{n} 笔扣款待确认…", ["n": charges]), action: #selector(openUpcoming), keyEquivalent: "")
            entry.target = self
            menu.addItem(entry)
            menu.addItem(.separator())
        }
        #endif
        let items = summary["items"] as? [[String: Any]] ?? []
        if items.isEmpty { label(L("30 天内没有到期或扣款")) } else {
            label(L("30 天内"))
            for row in items {
                guard let id = row["id"] as? String, let title = row["title"] as? String else { continue }
                let entry = NSMenuItem(title: title, action: #selector(openItem(_:)), keyEquivalent: "")
                entry.target = self
                entry.representedObject = id
                let level = row["level"] as? String ?? ""
                if level == "overdue" || level == "soon" {
                    entry.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: level == "overdue" ? L("已过期") : L("快到期"))
                    entry.image?.isTemplate = false
                    entry.image = entry.image?.withSymbolConfiguration(.init(pointSize: 7, weight: .regular).applying(.init(paletteColors: [level == "overdue" ? .systemRed : .systemOrange])))
                }
                menu.addItem(entry)
            }
        }
        menu.addItem(.separator())
        let addItem = NSMenuItem(title: L("添加资产…"), action: #selector(addAsset), keyEquivalent: "")
        addItem.target = self
        menu.addItem(addItem)
        let showItem = NSMenuItem(title: L("打开 Assetboard"), action: #selector(showWindow), keyEquivalent: "")
        showItem.target = self
        menu.addItem(showItem)
        item.menu = menu
    }

    @objc private func openItem(_ sender: NSMenuItem) { open(sender.representedObject as? String) }
    @objc private func openUpcoming() { open(nil) }
    @objc private func addAsset() { add() }
    @objc private func showWindow() { show() }
}
