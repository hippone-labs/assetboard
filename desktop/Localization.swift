import Foundation

/// The interface language, 简体中文 or English, for the native side (menus, alerts, errors the page shows) and passed to the page as
/// `__ASSETBOARD_NATIVE__.lang`. The person's choice in 设置 wins; otherwise the system's first language (Chinese for any zh-*,
/// English for everything else). `--lang zh|en` overrides both (demo screenshots); the self-tests (`--test-…`, the CLI's `--self-test`) run in Chinese unless given `--lang`.
enum AppLanguage {
    static let key = "AssetboardLanguage"
    static let all = ["zh", "en"]
    private static let defaults = UserDefaults(suiteName: "studio.assetboard.local") ?? .standard

    static var stored: String? {
        get { defaults.string(forKey: key).flatMap { all.contains($0) ? $0 : nil } }
        set {
            if let value = newValue, all.contains(value) { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
            // System panels (open, save, alerts' standard buttons) follow AppleLanguages at the next launch.
            if let value = newValue, all.contains(value) { defaults.set([value == "zh" ? "zh-Hans" : "en"], forKey: "AppleLanguages") }
            else { defaults.removeObject(forKey: "AppleLanguages") }
        }
    }

    /// Set again by the switch in 设置 (AppDelegate.switchLanguage); everything asks L() afresh after it.
    static var current: String = {
        let args = CommandLine.arguments
        if let at = args.firstIndex(of: "--lang"), at + 1 < args.count, all.contains(args[at + 1]) { return args[at + 1] }
        if args.contains(where: { $0.hasPrefix("--test-") || $0 == "--self-test" }) { return "zh" }
        if let stored { return stored }
        return Locale.preferredLanguages.first.map { $0.lowercased().hasPrefix("zh") ? "zh" : "en" } ?? "zh"
    }()

    static var isEnglish: Bool { current == "en" }
}

/// The Chinese source text is the key, as with tr() in the page: `L("删除 {n} 项", ["n": 3])`. English comes from `englishStrings`
/// (LocalizationEN.swift); a pair there is [one, other], picked by the "n" slot. Missing English stays Chinese.
func L(_ text: String, _ vars: [String: Any] = [:]) -> String {
    var out = text
    if AppLanguage.isEnglish, let english = englishStrings[text] {
        let n = (vars["n"] as? Int) ?? Int("\(vars["n"] ?? "")")
        out = english.count > 1 && n != 1 ? english[1] : english[0]
    }
    for (name, value) in vars { out = out.replacingOccurrences(of: "{\(name)}", with: "\(value)") }
    return out
}
