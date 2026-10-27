import Foundation

/// A drop folder for data handed over by scripts or agents. Files are handed to the page, which queues them; a file
/// stays in the folder until the page reports it imported or discarded, so a cancelled preview or a quit loses nothing.
final class AgentInbox {
    static let maxFileBytes = 1024 * 1024
    static let maxFiles = 20
    static let keepHandledDays = 30.0

    let directory: URL
    let handled: URL
    private var source: DispatchSourceFileSystemObject?
    /// Names already handed to the page in this run; they are not sent again until the app restarts.
    private var delivered = Set<String>()
    var onChange: (() -> Void)?

    init(root: URL) {
        directory = root.appendingPathComponent("Inbox", isDirectory: true)
        handled = directory.appendingPathComponent("handled", isDirectory: true)
    }

    func start() {
        let manager = FileManager.default
        do {
            try manager.createDirectory(at: handled, withIntermediateDirectories: true)
            try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        } catch { NSLog("Assetboard inbox unavailable: %@", error.localizedDescription); return }
        pruneHandled()
        let descriptor = open(directory.path, O_EVTONLY)
        guard descriptor >= 0 else { return }
        let watcher = DispatchSource.makeFileSystemObjectSource(fileDescriptor: descriptor, eventMask: .write, queue: .main)
        // Let a writer finish; files touched in the last second are left for the next pass.
        watcher.setEventHandler { [weak self] in DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self?.onChange?() } }
        watcher.setCancelHandler { close(descriptor) }
        watcher.resume()
        source = watcher
    }

    /// The waiting `.json` files (oldest first) not yet handed over. Oversized or unreadable files are moved to `handled/`
    /// straight away and come back with an `error`, so one bad file cannot block the folder.
    func takePending() -> [[String: String]] {
        let manager = FileManager.default
        let urls = ((try? manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey, .fileSizeKey])) ?? [])
            .filter { $0.pathExtension.lowercased() == "json" && !$0.lastPathComponent.hasPrefix(".") && !delivered.contains($0.lastPathComponent) }
        let dated = urls.compactMap { url -> (URL, Date)? in
            guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .isRegularFileKey]), values.isRegularFile == true else { return nil }
            let modified = values.contentModificationDate ?? .distantPast
            return Date().timeIntervalSince(modified) >= 1 ? (url, modified) : nil
        }.sorted { $0.1 < $1.1 }.prefix(Self.maxFiles)
        var files: [[String: String]] = []
        for (url, _) in dated {
            let name = url.lastPathComponent
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            guard size <= Self.maxFileBytes, let text = (try? Data(contentsOf: url)).flatMap({ String(data: $0, encoding: .utf8) }) else {
                guard moveToHandled(name) else { continue }
                files.append(["name": name, "error": size > Self.maxFileBytes ? L("文件超过 1 MB") : L("不是 UTF-8 文本")])
                continue
            }
            delivered.insert(name)
            files.append(["name": name, "text": text])
        }
        return files
    }

    /// Called when the page has imported or discarded a file.
    func finish(_ name: String) {
        guard delivered.contains(name), !name.contains("/"), name != "..", name != "." else { return }
        delivered.remove(name)
        _ = moveToHandled(name)
    }

    @discardableResult private func moveToHandled(_ name: String) -> Bool {
        let stamp = String(Int(Date().timeIntervalSince1970))
        return (try? FileManager.default.moveItem(at: directory.appendingPathComponent(name), to: handled.appendingPathComponent("\(stamp)-\(name)"))) != nil
    }

    /// `handled/` keeps the last 30 days, by the time stamp each file was given when it was moved there.
    func pruneHandled(now: Date = Date()) {
        let manager = FileManager.default
        let cutoff = now.timeIntervalSince1970 - Self.keepHandledDays * 86_400
        for url in (try? manager.contentsOfDirectory(at: handled, includingPropertiesForKeys: nil)) ?? [] {
            if let stamp = url.lastPathComponent.split(separator: "-", maxSplits: 1).first.flatMap({ TimeInterval(String($0)) }), stamp < cutoff {
                try? manager.removeItem(at: url)
            }
        }
    }
}
