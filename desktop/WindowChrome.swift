import AppKit

/// The window has no toolbar: the page's top bar (`#topnav`, 40 points) is the title bar. This transparent view lies over it, moves
/// the window from the bar's empty parts, zooms (or minimises, as System Settings say) on a double click, and lets every click on
/// the bar's controls through to the page. The page reports where those controls are (`holes`, in points from the top left) and
/// the bar's height whenever they change.
final class TitleBarDragView: NSView {
    var holes: [NSRect] = []
    override var isFlipped: Bool { true }
    // Moving is done explicitly in mouseDown, so a click on a hole never drags.
    override var mouseDownCanMoveWindow: Bool { false }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard let superview else { return nil }
        let local = convert(point, from: superview)
        guard bounds.contains(local), !holes.contains(where: { $0.contains(local) }) else { return nil }
        return self
    }

    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        if event.clickCount == 2 {
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.performMiniaturize(nil)
            case "None": break
            default: window.performZoom(nil)
            }
            return
        }
        window.performDrag(with: event)
    }

    override func isAccessibilityElement() -> Bool { false }
}

/// Puts the close, minimise and zoom buttons into the page's top bar: centred in its height, the first one `left` points in, with
/// the system's spacing. AppKit lays the title bar out again on resizes, key changes and full screen, so the window delegate calls
/// this after each of them. In full screen the buttons are the system's business.
enum TrafficLights {
    static let left: CGFloat = 16

    static func place(in window: NSWindow, barHeight: CGFloat) {
        guard !window.styleMask.contains(.fullScreen),
              let close = window.standardWindowButton(.closeButton),
              let minimize = window.standardWindowButton(.miniaturizeButton),
              let zoom = window.standardWindowButton(.zoomButton),
              let titlebar = close.superview, let container = titlebar.superview else { return }
        var frame = container.frame
        frame.size.height = barHeight
        frame.origin.y = window.frame.height - barHeight
        if container.frame != frame { container.frame = frame }
        if titlebar.frame != container.bounds { titlebar.frame = container.bounds }
        let measured = minimize.frame.minX - close.frame.minX
        let spacing = measured > 0 ? measured : 20
        for (index, button) in [close, minimize, zoom].enumerated() {
            let origin = NSPoint(x: left + CGFloat(index) * spacing, y: ((barHeight - button.frame.height) / 2).rounded())
            if button.frame.origin != origin { button.setFrameOrigin(origin) }
        }
    }
}

/// The page's theme choice (theme.js) is a viewer preference, not board data, and the web view keeps no storage between launches,
/// so the app keeps it in its defaults: a short JSON object, checked again by the page when it reads it. The system accent colour
/// is handed to the page for 跟随系统.
enum ThemePreference {
    static let key = "themePreference"

    static var stored: String? { UserDefaults.standard.string(forKey: key) }

    /// Keeps a JSON object of at most 4 KB; anything else is ignored.
    @discardableResult
    static func store(_ value: Any?) -> Bool {
        guard let text = value as? String, text.utf8.count <= 4096, let data = text.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) is [String: Any] else { return false }
        UserDefaults.standard.set(text, forKey: key)
        return true
    }

    static var systemAccentHex: String {
        guard let color = NSColor.controlAccentColor.usingColorSpace(.sRGB) else { return "" }
        let part = { (v: CGFloat) in Int((max(0, min(1, v)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", part(color.redComponent), part(color.greenComponent), part(color.blueComponent))
    }
}
