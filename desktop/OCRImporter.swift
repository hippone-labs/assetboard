import AppKit
import PDFKit
import Vision

enum OCRImporter {
    static func recognize(at url: URL) throws -> String {
        let size = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard size > 0 && size <= 25 * 1024 * 1024 else { throw error(L("请选择不超过 25 MB 的截图或 PDF。")) }
        let suffix = url.pathExtension.lowercased()
        if suffix == "pdf" {
            guard let document = PDFDocument(url: url), document.pageCount > 0 else { throw error(L("无法读取 PDF。")) }
            guard document.pageCount <= 20 else { throw error(L("PDF 超过 20 页，请先选取需要识别的页面。")) }
            return try (0..<document.pageCount).map { index in
                guard let page = document.page(at: index) else { throw error(L("无法读取 PDF 页面。")) }
                let embedded = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !embedded.isEmpty { return "第 \(index + 1) 页\n" + embedded }
                let thumbnail = page.thumbnail(of: NSSize(width: 1800, height: 2400), for: .mediaBox)
                guard let image = thumbnail.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw error(L("无法渲染 PDF 页面。")) }
                return "第 \(index + 1) 页\n" + (try recognize(image: image))
            }.joined(separator: "\n\n")
        }
        guard ["png", "jpg", "jpeg", "webp"].contains(suffix),
              let image = NSImage(contentsOf: url),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw error(L("请选择 PNG、JPEG、WebP 图片或 PDF。")) }
        return try recognize(image: cgImage)
    }

    private static func recognize(image: CGImage) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        guard !lines.isEmpty else { throw error(L("未识别到文字，请换一张更清晰的图片。")) }
        return lines.joined(separator: "\n")
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "Assetboard.OCR", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
