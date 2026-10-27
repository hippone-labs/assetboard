import AppKit

/// Downloads a website's own icon for an asset card, only when a person asks for it.
/// It contacts that public https host directly, without cookies; no third-party icon service is involved.
final class IconFetcher {
    static let maxPage = 512 * 1024
    static let maxIcon = 1024 * 1024
    static let side = 128
    let session: URLSession

    init(session: URLSession? = nil) {
        if let session { self.session = session; return }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 20
        configuration.httpAdditionalHeaders = ["User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Assetboard/0.1"]
        self.session = URLSession(configuration: configuration, delegate: HTTPSOnlyRedirects(service: L("网站图标")), delegateQueue: nil)
    }

    static func error(_ message: String) -> NSError { NSError(domain: "Assetboard.Icon", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }

    /// Accepts a bare host or a pasted link and returns a lowercase public host name. IP addresses, local names and credentials are refused.
    static func host(from input: String) -> String? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), ["https", "http"].contains(url.scheme ?? ""), url.user == nil, url.password == nil,
              let host = url.host, !host.isEmpty, host.count <= 253 else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2,
              labels.allSatisfy({ label in !label.isEmpty && label.count <= 63 && !label.hasPrefix("-") && !label.hasSuffix("-") && label.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") } }),
              labels.last!.contains(where: { $0.isLetter }),
              !["localhost", "local", "internal", "lan", "home", "arpa"].contains(String(labels.last!)) else { return nil }
        return host
    }

    /// Icon links declared in the page, best first: apple-touch-icon, then the largest size, PNG before other formats, SVG last.
    /// The site's conventional icon paths follow as fallbacks.
    static func candidates(html: String, base: URL) -> [URL] {
        let page = String(html.prefix(maxPage))
        let tags = try! NSRegularExpression(pattern: "<link\\b[^>]*>", options: [.caseInsensitive])
        func attribute(_ name: String, in tag: String) -> String? {
            let pattern = try! NSRegularExpression(pattern: "\\b\(name)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", options: [.caseInsensitive])
            guard let match = pattern.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)) else { return nil }
            for index in 1...3 { if let range = Range(match.range(at: index), in: tag) { return String(tag[range]) } }
            return nil
        }
        var found: [(url: URL, score: Int)] = []
        for match in tags.matches(in: page, range: NSRange(page.startIndex..., in: page)) {
            guard let range = Range(match.range, in: page) else { continue }
            let tag = String(page[range])
            guard let rel = attribute("rel", in: tag)?.lowercased(), rel.contains("icon"), !rel.contains("mask-icon"),
                  let href = attribute("href", in: tag)?.replacingOccurrences(of: "&amp;", with: "&"),
                  let url = URL(string: href, relativeTo: base)?.absoluteURL, url.scheme == "https" else { continue }
            let path = url.path.lowercased()
            let size = (attribute("sizes", in: tag) ?? "").lowercased().split(separator: " ").compactMap { Int($0.split(separator: "x").first ?? "") }.max() ?? (rel.contains("apple-touch-icon") ? 180 : 16)
            let svg = (attribute("type", in: tag) ?? "").lowercased().contains("svg") || path.hasSuffix(".svg")
            found.append((url, (rel.contains("apple-touch-icon") ? 1000 : 0) + min(size, 512) + (path.hasSuffix(".png") ? 5 : 0) - (svg ? 2000 : 0)))
        }
        let fallbacks = ["/apple-touch-icon.png", "/favicon.ico"].compactMap { URL(string: $0, relativeTo: base)?.absoluteURL }
        var seen = Set<String>()
        return (found.sorted { $0.score > $1.score }.map(\.url) + fallbacks).filter { seen.insert($0.absoluteString).inserted }
    }

    /// Draws the icon centred on a transparent 128 px square and returns a PNG data URL, or nil for anything that is not a usable image.
    static func normalized(_ data: Data) -> String? {
        guard !data.isEmpty, data.count <= maxIcon, let image = NSImage(data: data) else { return nil }
        var proposed = NSRect(x: 0, y: 0, width: side, height: side)
        guard let source = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil), source.width >= 16, source.height >= 16,
              let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let scale = min(Double(side) / Double(source.width), Double(side) / Double(source.height))
        let width = Double(source.width) * scale, height = Double(source.height) * scale
        context.interpolationQuality = .high
        context.draw(source, in: CGRect(x: (Double(side) - width) / 2, y: (Double(side) - height) / 2, width: width, height: height))
        guard let drawn = context.makeImage(), let png = NSBitmapImageRep(cgImage: drawn).representation(using: .png, properties: [:]) else { return nil }
        let url = "data:image/png;base64," + png.base64EncodedString()
        return url.count < 400_000 ? url : nil
    }

    func fetch(input: String, completion: @escaping (Result<(host: String, dataURL: String), NSError>) -> Void) {
        guard let host = Self.host(from: input), let page = URL(string: "https://\(host)/") else {
            completion(.failure(Self.error(L("请输入网站域名，例如 wise.com。")))); return
        }
        get(page, limit: Self.maxPage, truncate: true) { data, final, reached in
            let html = data.flatMap { String(data: $0, encoding: .utf8) ?? String(data: $0, encoding: .isoLatin1) } ?? ""
            let queue = Self.candidates(html: html, base: final ?? page).prefix(6)
            func attempt(_ remaining: ArraySlice<URL>, reachedAny: Bool) {
                guard let next = remaining.first else {
                    completion(.failure(Self.error(reachedAny ? L("没有在 {host} 找到可用的图标。有的网站会拒绝自动下载，可以在「编辑资料」里上传图标。", ["host": host]) : L("无法连接 {host}，请检查域名或网络。", ["host": host])))); return
                }
                self.get(next, limit: Self.maxIcon, truncate: false) { data, _, reached in
                    if let data, let dataURL = Self.normalized(data) { completion(.success((host, dataURL))) }
                    else { attempt(remaining.dropFirst(), reachedAny: reachedAny || reached) }
                }
            }
            attempt(queue, reachedAny: reached)
        }
    }

    /// GET only. `reached` reports whether the host answered at all, so a wrong domain reads differently from a site without an icon.
    private func get(_ url: URL, limit: Int, truncate: Bool, completion: @escaping (Data?, URL?, Bool) -> Void) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        session.dataTask(with: request) { data, response, _ in
            guard let http = response as? HTTPURLResponse else { completion(nil, nil, false); return }
            guard (200...299).contains(http.statusCode), http.url?.scheme ?? "https" == "https", let data, truncate || data.count <= limit else { completion(nil, http.url, true); return }
            completion(truncate ? data.prefix(limit) : data, http.url, true)
        }.resume()
    }
}

/// Redirects are followed only while they stay on https; each request is recorded in 网络记录.
private final class HTTPSOnlyRedirects: LoggedSessionDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" ? request : nil)
    }
}
