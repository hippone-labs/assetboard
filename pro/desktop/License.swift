import Foundation
import CryptoKit

/// Assetboard Pro's licence. One App for everyone: the first launch starts 14 days of Pro, then the free features stay until a licence is
/// pasted in the panel or arrives through assetboard://activate?key=… (docs/2026-10-24-pro-purchase.md). A licence is one line of text,
/// `ASB1.<payload>.<signature>`: the payload is base64url JSON {v:1, id, plan:"pro", iss, upd} (issue day, updates-until day), the
/// signature Ed25519 over the ASCII of `ASB1.<payload>`, made by the purchase worker (pro/worker) with a key this app never holds. The app
/// only checks it with the public key below: nothing is sent anywhere, no activation, no device count, no report. Updates end on `upd`:
/// a version built on or before that day keeps Pro for good; a later version runs the free features. The worker signs every licence
/// with 9999-12-31 (lifetime updates), so every build accepts it.
enum ProLicense {
    /// The production worker's public key, raw 32 bytes. Its private key is held in LICENSE_PRIVATE_KEY.
    static let publicKey = Data(base64Encoded: "u+6hRjhsyw/svI+x9OmWYJapcFDUXK5q/y43nE7XeM0=")!
    static let trialDays = 14

    struct Payload: Equatable {
        let id: String
        let issued: String
        let updatesUntil: String
        /// K3Q7-NVHM: the id as the panel and the purchase page show it.
        var display: String {
            var out = ""
            for (index, character) in id.enumerated() { if index > 0 && index % 4 == 0 { out += "-" }; out.append(character) }
            return out
        }
    }

    /// What can be wrong, each with the one sentence the panel shows. Nothing more is said and nothing is logged.
    enum Failure: Error, Equatable {
        case notOurs, incomplete, tampered, unsaved
        var message: String {
            switch self {
            case .notOurs: return L("不是 Assetboard 的许可证")
            case .incomplete: return L("这段文本不完整")
            case .tampered: return L("许可证被改过")
            case .unsaved: return L("许可证没能保存到本机")
            }
        }
    }

    /// Days are "YYYY-MM-DD" in the Mac's own time zone and compare as text.
    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    static func day(_ date: Date) -> String { dayFormatter.string(from: date) }
    static func isDay(_ text: String) -> Bool {
        let parts = text.split(separator: "-")
        guard text.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil, parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return DateComponents(calendar: calendar, year: year, month: month, day: day).isValidDate
    }
    static func base64url(_ text: Substring) -> Data? {
        var standard = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while standard.count % 4 != 0 { standard += "=" }
        return Data(base64Encoded: standard)
    }

    /// The payload when the text is a licence of ours, intact and not from the future; otherwise which of the three it failed.
    static func verify(_ raw: String, key: Data = publicKey, now: Date = Date()) -> Result<Payload, Failure> {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("ASB1.") else { return .failure(.notOurs) }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        let safe = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        guard parts.count == 3, !parts[1].isEmpty, !parts[2].isEmpty,
              parts[1].unicodeScalars.allSatisfy(safe.contains), parts[2].unicodeScalars.allSatisfy(safe.contains),
              let payloadData = base64url(parts[1]), let signature = base64url(parts[2]), signature.count == 64 else { return .failure(.incomplete) }
        guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key),
              publicKey.isValidSignature(signature, for: Data("ASB1.\(parts[1])".utf8)) else { return .failure(.tampered) }
        guard let object = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              object["v"] as? Int == 1, object["plan"] as? String == "pro",
              let id = object["id"] as? String, id.range(of: "^[A-Z0-9]{8}$", options: .regularExpression) != nil,
              let issued = object["iss"] as? String, let updatesUntil = object["upd"] as? String,
              isDay(issued), isDay(updatesUntil), updatesUntil >= issued,
              issued <= day(now.addingTimeInterval(2 * 86_400)) else { return .failure(.tampered) }
        return .success(Payload(id: id, issued: issued, updatesUntil: updatesUntil))
    }

    /// The key in assetboard://activate?key=…, or nil for any other link. Other query items are ignored.
    static func activationKey(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "assetboard", url.host?.lowercased() == "activate",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let key = items.first(where: { $0.name == "key" })?.value, !key.isEmpty, key.count <= 2000 else { return nil }
        return key
    }
}

/// What the page is told as nativeStore.pro, and what the app reads to decide Pro's schedulers.
struct ProState: Equatable {
    enum Kind: String { case trial, licensed, lapsed, expired }
    let kind: Kind
    let daysLeft: Int
    let licence: ProLicense.Payload?
    let buildDate: String
    var on: Bool { kind == .trial || kind == .licensed }
    var json: [String: Any] {
        var out: [String: Any] = ["on": on, "kind": kind.rawValue, "buildDate": buildDate]
        if kind == .trial { out["daysLeft"] = daysLeft }
        if let licence { out["id"] = licence.id; out["issued"] = licence.issued; out["updatesUntil"] = licence.updatesUntil }
        return out
    }
    /// `--demo` always runs as a fresh trial, so screenshots show Pro and the demo never reads or writes a licence.
    static func demo(buildDate: String) -> ProState { ProState(kind: .trial, daysLeft: ProLicense.trialDays, licence: nil, buildDate: buildDate) }
}

/// The licence and the trial clock in the data directory (`license/pro.license`, `license/trial.json`, both 0600; not the Keychain,
/// so a backup of the folder carries them). Reading never fails loudly: a bad file is the free features, not an error.
final class ProLicenseStore {
    let directory: URL
    let buildDate: String
    private let verificationKey: Data
    var file: URL { directory.appendingPathComponent("pro.license") }
    var trialFile: URL { directory.appendingPathComponent("trial.json") }

    init(root: URL, buildDate: String? = nil, verificationKey: Data = ProLicense.publicKey) {
        directory = root.appendingPathComponent("license", isDirectory: true)
        self.buildDate = buildDate ?? Self.bundleBuildDate
        self.verificationKey = verificationKey
    }

    /// The day this build was made (desktop/build.sh writes AssetboardBuildDate into Info.plist); a build without it counts as today.
    static var bundleBuildDate: String {
        if let text = Bundle.main.infoDictionary?["AssetboardBuildDate"] as? String, ProLicense.isDay(text) { return text }
        return ProLicense.day(Date())
    }

    func licence(now: Date = Date()) -> Result<ProLicense.Payload, ProLicense.Failure>? {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        return ProLicense.verify(text, key: verificationKey, now: now)
    }

    func state(now: Date = Date()) -> ProState {
        if case .success(let payload)? = licence(now: now) {
            return ProState(kind: payload.updatesUntil >= buildDate ? .licensed : .lapsed, daysLeft: 0, licence: payload, buildDate: buildDate)
        }
        let left = ProLicense.trialDays - daysUsed(now: now)
        return ProState(kind: left > 0 ? .trial : .expired, daysLeft: max(0, left), licence: nil, buildDate: buildDate)
    }

    /// Days since the trial began, the first day counting as 0. The start is written at the first launch; a file that is missing, unreadable
    /// or dated in the future starts again today (a reinstall does too: accepted, nothing is phoned home to prevent it).
    func daysUsed(now: Date) -> Int {
        let today = ProLicense.day(now)
        var started = today
        if let data = try? Data(contentsOf: trialFile), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let text = object["started"] as? String, ProLicense.isDay(text), text <= today {
            started = text
        } else {
            write(["started": today], to: trialFile)
        }
        guard let from = ProLicense.dayFormatter.date(from: started), let to = ProLicense.dayFormatter.date(from: today) else { return 0 }
        return Calendar.current.dateComponents([.day], from: from, to: to).day ?? 0
    }

    /// Keeps a licence that checks out and answers with the state it gives this build (licensed, or lapsed when the build is newer than
    /// the updates); a refused text changes nothing.
    func activate(_ text: String, now: Date = Date()) -> Result<ProState, ProLicense.Failure> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if case .failure(let failure) = ProLicense.verify(trimmed, key: verificationKey, now: now) { return .failure(failure) }
        write(Data(trimmed.utf8), to: file)
        guard case .success? = licence(now: now) else { return .failure(.unsaved) }
        return .success(state(now: now))
    }

    func remove() { try? FileManager.default.removeItem(at: file) }

    private func write(_ object: [String: Any], to url: URL) {
        if let data = try? JSONSerialization.data(withJSONObject: object) { write(data, to: url) }
    }
    private func write(_ data: Data, to url: URL) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch { NSLog("Assetboard licence file could not be written: %@", error.localizedDescription) }
    }
}

// MARK: - Self-test (`--test-license`, run by desktop/build.sh)

func testLicense() {
    func check(_ ok: Bool, _ message: @autoclosure () -> String) { if !ok { fputs("Licence test failed: \(message())\n", stderr); exit(1) } }
    // Signed with the test pair (pro/tests/fixtures/license-test-key.json); `node pro/worker/fixtures.mjs` prints them again.
    let key = Data(base64Encoded: "VvZRbb0zp8qzeuJCvVl/2uR6OstgCy8k/DP36Gh70EE=")!
    let valid = "ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwMjYtMTAtMDEiLCJ1cGQiOiIyMDI3LTEwLTAxIn0.mnc5ocIp7nZzHWA98jKO4U__jBbRQToHh25-RCdiFh3GMbic-v73TYKSDlItDNCT1A8fawoWkSVgPPcHfacbBA"
    let old = "ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwMjUtMDEtMDEiLCJ1cGQiOiIyMDI2LTAxLTAxIn0.4fR0mXTrvIY-3ODTgO5sx37boWUBGNe6iA4T4p-jM7pePNj8pNohifVCgOEOXWuliO0NxMuV4fXSY67kh6SrDQ"
    let team = "ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InRlYW0iLCJpc3MiOiIyMDI2LTEwLTAxIiwidXBkIjoiMjAyNy0xMC0wMSJ9.7E-e5WQMD42jO_knBYvlGshoVKlaVWkoHwtXrNKxKu14k_n9bhrMah7jnN2o4pzmwXcFZOAdw8I9MlZqcSboDQ"
    let future = "ASB1.eyJ2IjoxLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwOTktMDEtMDEiLCJ1cGQiOiIyMTAwLTAxLTAxIn0.c-4_Bb2KZiCbConVGGT-OO031GLe0KKSGcoSGQNzgRTjDw_ePCDGlzFQsC3yh3PXDmV5pVibgpOVbP9TlgWEAg"
    let version2 = "ASB1.eyJ2IjoyLCJpZCI6IkszUTdOVkhNIiwicGxhbiI6InBybyIsImlzcyI6IjIwMjYtMTAtMDEiLCJ1cGQiOiIyMDI3LTEwLTAxIn0.Yva5YZMb-8ESermmGGq3JJABA2-OwTB13fn8chomeU4e9CldlK7iWsfKrNuJLpQqO9RZiRtB0KfqYnjLWAEfCA"
    // Noon, so adding whole days never crosses a day boundary through a DST change.
    let now = ProLicense.dayFormatter.date(from: "2026-10-24")!.addingTimeInterval(43_200)
    let days = { (n: Int) in now.addingTimeInterval(Double(n) * 86_400) }
    let payload = ProLicense.Payload(id: "K3Q7NVHM", issued: "2026-10-01", updatesUntil: "2027-10-01")

    // The format and the signature
    check(ProLicense.verify(valid, key: key, now: now) == .success(payload), "a signed licence is accepted")
    check(ProLicense.verify(valid, now: now) == .failure(.tampered), "the production key refuses test licences")
    check(ProLicense.verify("  \n" + valid + "\n", key: key, now: now) == .success(payload), "pasted whitespace around it is forgiven")
    check(payload.display == "K3Q7-NVHM", "the id is shown in two halves")
    check(ProLicense.verify(valid, key: Data(repeating: 1, count: 32), now: now) == .failure(.tampered), "another key refuses it")
    check(ProLicense.verify(valid, key: Data(repeating: 1, count: 31), now: now) == .failure(.tampered), "a malformed key refuses it")
    var changed = valid; changed.replaceSubrange(changed.index(changed.startIndex, offsetBy: 12)...changed.index(changed.startIndex, offsetBy: 12), with: "A")
    check(ProLicense.verify(changed, key: key, now: now) == .failure(.tampered), "one changed character in the payload: tampered")
    // The last character carries two unused bits, so the change goes in the middle of the signature.
    let signatureAt = valid.index(valid.lastIndex(of: ".")!, offsetBy: 10)
    var swapped = valid; swapped.replaceSubrange(signatureAt...signatureAt, with: valid[signatureAt] == "A" ? "B" : "A")
    check(ProLicense.verify(swapped, key: key, now: now) == .failure(.tampered), "one changed character in the signature: tampered")
    for (text, failure) in [("", ProLicense.Failure.notOurs), ("hello", .notOurs), ("ASB2." + valid.dropFirst(5), .notOurs), ("ASB1.", .incomplete),
                            ("ASB1.eyJ2IjoxfQ", .incomplete), ("ASB1.eyJ2IjoxfQ.", .incomplete), ("ASB1.eyJ2IjoxfQ.c2ln", .incomplete),
                            (String(valid.dropLast(10)), .incomplete), ("ASB1.eyJ2IjoxfQ.c2ln.extra", .incomplete), ("ASB1.eyJ2:IjoxfQ.c2ln", .incomplete),
                            (valid.replacingOccurrences(of: ".", with: " "), .notOurs)] {
        check(ProLicense.verify(text, key: key, now: now) == .failure(failure), "\(text.prefix(24))… must fail with \(failure)")
    }
    check(ProLicense.verify(team, key: key, now: now) == .failure(.tampered), "a signed payload of another plan is refused")
    check(ProLicense.verify(future, key: key, now: now) == .failure(.tampered), "an issue day in the future is refused")
    check(ProLicense.verify(version2, key: key, now: now) == .failure(.tampered), "a payload version we do not know is refused")
    check(ProLicense.verify(old, key: key, now: now) == .success(ProLicense.Payload(id: "K3Q7NVHM", issued: "2025-01-01", updatesUntil: "2026-01-01")),
          "a licence whose updates ended still verifies; the build date decides what it gives")
    check(ProLicense.isDay("2026-02-28") && !ProLicense.isDay("2026-02-30") && !ProLicense.isDay("2026-2-8") && !ProLicense.isDay("2026-13-01"), "days are checked")

    // The trial clock and its file
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("assetboard-licence-" + UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = ProLicenseStore(root: root, buildDate: "2026-11-01", verificationKey: key)
    var state = store.state(now: now)
    check(state == ProState(kind: .trial, daysLeft: 14, licence: nil, buildDate: "2026-11-01") && state.on, "the first launch starts 14 days: \(state)")
    let attributes = try? FileManager.default.attributesOfItem(atPath: store.trialFile.path)
    check((attributes?[.posixPermissions] as? Int) == 0o600, "the trial file is private")
    check((try? JSONSerialization.jsonObject(with: Data(contentsOf: store.trialFile)) as? [String: String])?["started"] == "2026-10-24", "the start day is written")
    check(store.state(now: days(13)).daysLeft == 1 && store.state(now: days(13)).kind == .trial, "the 14th day is the last: \(store.state(now: days(13)))")
    state = store.state(now: days(14))
    check(state.kind == .expired && !state.on && state.daysLeft == 0, "the 15th day is over: \(state)")
    check(state.json["on"] as? Bool == false && state.json["kind"] as? String == "expired" && state.json["daysLeft"] == nil, "expired JSON: \(state.json)")
    try? Data("{\"started\":\"2099-01-01\"}".utf8).write(to: store.trialFile)
    check(store.state(now: now).daysLeft == 14, "a start in the future starts again today")
    check((try? JSONSerialization.jsonObject(with: Data(contentsOf: store.trialFile)) as? [String: String])?["started"] == "2026-10-24", "and is written down")
    try? Data("not json".utf8).write(to: store.trialFile)
    check(store.state(now: days(3)).daysLeft == 14, "a broken file starts again")
    check(store.state(now: days(3)).json["daysLeft"] as? Int == 14 && store.state(now: days(3)).json["buildDate"] as? String == "2026-11-01", "trial JSON")

    // Activation, the build date, removal
    switch store.activate(" " + valid + "\n", now: now) {
    case .success(let activated):
        check(activated.kind == .licensed && activated.on && activated.licence == payload, "a good licence turns Pro on: \(activated)")
        check(activated.json["id"] as? String == "K3Q7NVHM" && activated.json["updatesUntil"] as? String == "2027-10-01" && activated.json["on"] as? Bool == true, "licensed JSON: \(activated.json)")
    case .failure(let failure): check(false, "a good licence was refused: \(failure)")
    }
    check((try? FileManager.default.attributesOfItem(atPath: store.file.path))?[.posixPermissions] as? Int == 0o600, "the licence file is private")
    check((try? String(contentsOf: store.file, encoding: .utf8)) == valid, "the licence is kept trimmed")
    check(store.state(now: days(400)).kind == .licensed, "a licence has no end of its own")
    check(ProLicenseStore(root: root, buildDate: "2027-10-01", verificationKey: key).state(now: now).kind == .licensed, "a build on the last day of updates is still Pro")
    let later = ProLicenseStore(root: root, buildDate: "2027-10-02", verificationKey: key).state(now: now)
    check(later.kind == .lapsed && !later.on && later.json["updatesUntil"] as? String == "2027-10-01" && later.json["buildDate"] as? String == "2027-10-02", "a build after the updates ended: lapsed, off, both dates told: \(later)")
    if case .failure(let failure) = store.activate("ASB1.eyJ2IjoxfQ.c2ln", now: now) { check(failure == .incomplete, "a short text is incomplete") } else { check(false, "a short text was accepted") }
    check(store.state(now: now).kind == .licensed, "a refused text leaves the good licence alone")
    if case .success(let lapsed) = store.activate(old, now: now) { check(lapsed.kind == .lapsed && !lapsed.on, "an old licence is kept but gives nothing to this build") } else { check(false, "an old licence was refused") }
    store.remove()
    check(store.state(now: now).kind == .trial && store.licence(now: now) == nil, "removing goes back to the trial clock")
    store.remove()

    // Activation links
    func activationKey(_ text: String) -> String? { URL(string: text).flatMap(ProLicense.activationKey(from:)) }
    check(activationKey("assetboard://activate?key=ASB1.a.b") == "ASB1.a.b", "the key is read")
    check(activationKey("assetboard://activate?key=ASB1.a.b&utm=1") == "ASB1.a.b" && activationKey("ASSETBOARD://Activate?key=ASB1.a.b") == "ASB1.a.b", "other items and case are ignored")
    check(activationKey("assetboard://activate?key=ASB1.a%2Eb%0A") == "ASB1.a.b\n", "percent-encoding is undone (the store trims)")
    for bad in ["assetboard://activate", "assetboard://activate?key=", "assetboard://other?key=ASB1.a.b", "https://activate?key=ASB1.a.b", "assetboard:activate?key=x", "assetboard://activate?other=ASB1.a.b"] {
        check(activationKey(bad) == nil, "\(bad) must not activate")
    }
    check(activationKey("assetboard://activate?key=" + String(repeating: "a", count: 2001)) == nil, "an oversized key is ignored")

    // The demo
    let demo = ProState.demo(buildDate: "2026-11-01")
    check(demo.on && demo.json["kind"] as? String == "trial" && demo.json["daysLeft"] as? Int == 14, "the demo is a fresh trial")
    print("PASS: licence format and signature, the refusals and their sentences, the trial clock and its file, activation, updates-until against the build date, removal, activation links, the demo")
}
