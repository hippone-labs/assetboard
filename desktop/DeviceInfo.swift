import Foundation
import Darwin
import IOKit
import IOKit.ps
import CryptoKit

/// 本机设备 (device-local.js): the plain facts about this Mac, for the page to keep as one `device` record. Every call here asks
/// for no permission: sysctl (model identifier, chip, memory), ProcessInfo (macOS version), the start-up volume's capacity, the
/// power sources (battery), and the platform expert in the I/O Registry (serial number, hardware UUID).
///
/// The hardware UUID never leaves this side: the page gets a hash of it, enough to recognise this Mac on the next read. Nothing is
/// sent anywhere; the answer goes to the page and the page decides what to keep.
enum DeviceInfo {
    static func sysctlText(_ name: String) -> String {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return "" }
        var bytes = [CChar](repeating: 0, count: size)
        guard sysctlbyname(name, &bytes, &size, nil, 0) == 0 else { return "" }
        return String(cString: bytes).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func sysctlNumber(_ name: String) -> UInt64 {
        var value: UInt64 = 0
        var size = MemoryLayout<UInt64>.size
        return sysctlbyname(name, &value, &size, nil, 0) == 0 ? value : 0
    }

    static func platformText(_ key: String) -> String {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"))
        guard service != 0 else { return "" }
        defer { IOObjectRelease(service) }
        return (IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? String) ?? ""
    }

    static func batteryCycles() -> Int? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }
        return IORegistryEntryCreateCFProperty(service, "CycleCount" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? Int
    }

    /// The internal battery, or nil on a Mac without one.
    static func battery() -> [String: Any]? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return nil }
        for source in list {
            guard let d = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  d[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
                  let current = d[kIOPSCurrentCapacityKey] as? Int, let max = d[kIOPSMaxCapacityKey] as? Int, max > 0 else { continue }
            return reply(battery: current, of: max, charging: d[kIOPSIsChargingKey] as? Bool ?? false, cycles: batteryCycles())
        }
        return nil
    }

    static func reply(battery current: Int, of max: Int, charging: Bool, cycles: Int?) -> [String: Any] {
        var out: [String: Any] = ["percent": Swift.max(0, Swift.min(100, Int((Double(current) / Double(max) * 100).rounded()))), "charging": charging]
        if let cycles, cycles >= 0 { out["cycles"] = cycles }
        return out
    }

    /// A short, stable stand-in for the hardware UUID: the same Mac gives the same value, and the UUID cannot be read back from it.
    static func hardwareId(_ uuid: String) -> String {
        guard !uuid.isEmpty else { return "" }
        return SHA256.hash(data: Data(("assetboard-device:" + uuid.uppercased()).utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    static func osVersion(_ v: OperatingSystemVersion) -> String {
        v.patchVersion > 0 ? "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)" : "\(v.majorVersion).\(v.minorVersion)"
    }

    static func read() -> [String: Any] {
        let id = hardwareId(platformText(kIOPlatformUUIDKey))
        guard !id.isEmpty else { return ["ok": false, "error": "no hardware id"] }
        var out: [String: Any] = [
            "ok": true,
            "hardwareId": id,
            "name": Host.current().localizedName ?? "",
            "model": sysctlText("hw.model"),
            "chip": sysctlText("machdep.cpu.brand_string"),
            "memoryBytes": sysctlNumber("hw.memsize"),
            "osVersion": osVersion(ProcessInfo.processInfo.operatingSystemVersion),
            "at": ISO8601DateFormatter().string(from: Date())
        ]
        let serial = platformText(kIOPlatformSerialNumberKey)
        if !serial.isEmpty { out["serial"] = serial }
        if let values = try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey]),
           let total = values.volumeTotalCapacity, total > 0 {
            out["disk"] = ["total": total, "free": Swift.max(0, values.volumeAvailableCapacityForImportantUsage.map { Int($0) } ?? 0)]
        }
        if let battery = battery() { out["battery"] = battery }
        return out
    }
}

func testDeviceInfo() {
    precondition(DeviceInfo.hardwareId("") == "")
    let a = DeviceInfo.hardwareId("12345678-ABCD-0000-0000-000000000000")
    precondition(a.count == 16 && a == DeviceInfo.hardwareId("12345678-abcd-0000-0000-000000000000") && !a.contains("12345678"))
    precondition(a != DeviceInfo.hardwareId("12345678-ABCD-0000-0000-000000000001"))
    precondition(DeviceInfo.osVersion(OperatingSystemVersion(majorVersion: 15, minorVersion: 2, patchVersion: 0)) == "15.2")
    precondition(DeviceInfo.osVersion(OperatingSystemVersion(majorVersion: 26, minorVersion: 1, patchVersion: 3)) == "26.1.3")
    let half = DeviceInfo.reply(battery: 2500, of: 5000, charging: true, cycles: 212)
    precondition(half["percent"] as? Int == 50 && half["charging"] as? Bool == true && half["cycles"] as? Int == 212)
    precondition(DeviceInfo.reply(battery: 6000, of: 5000, charging: false, cycles: nil)["percent"] as? Int == 100)
    precondition(DeviceInfo.reply(battery: 1, of: 5000, charging: false, cycles: -1)["cycles"] == nil)
    // This Mac, read for real: every field the page needs, and the UUID itself nowhere in the answer.
    let here = DeviceInfo.read()
    precondition(here["ok"] as? Bool == true, "device read: \(here)")
    precondition((here["hardwareId"] as? String)?.count == 16)
    precondition(!(here["model"] as? String ?? "").isEmpty && (here["memoryBytes"] as? UInt64 ?? 0) > 0)
    precondition(((here["disk"] as? [String: Int])?["total"] ?? 0) > 0)
    let uuid = DeviceInfo.platformText(kIOPlatformUUIDKey)
    let json = String(data: try! JSONSerialization.data(withJSONObject: here), encoding: .utf8)!
    precondition(uuid.isEmpty || !json.contains(uuid), "the hardware UUID stays on this side")
    print("PASS: device info: hashed hardware id, macOS version text, battery percent and cycles, this Mac read with model, memory and disk, UUID never in the answer")
}
