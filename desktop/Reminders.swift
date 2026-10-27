import Cocoa
import UserNotifications

/// One local notification from the page's plan (`reminderPlan` in asset-data.js). The page decides what to say and when,
/// so the date rules live in one place; this side validates the plan and hands it to Notification Center.
struct ReminderItem: Equatable {
    static let limit = 64
    let id: String
    let fireAt: DateComponents
    let title: String
    let body: String
    let assetId: String?

    /// nil for a malformed plan, so a bad message never clears the reminders that are already scheduled.
    static func parse(_ value: Any?) -> [ReminderItem]? {
        guard let rows = value as? [[String: Any]], rows.count <= limit else { return nil }
        var items: [ReminderItem] = []
        for row in rows {
            guard let id = row["id"] as? String, id.hasPrefix("reminder-"), id.count <= 64,
                  let when = row["when"] as? String, let fireAt = components(when),
                  let title = row["title"] as? String, !title.isEmpty, title.count <= 200,
                  let body = row["body"] as? String, body.count <= 600 else { return nil }
            let assetId = row["assetId"] as? String
            if let assetId, assetId.isEmpty || assetId.count > 200 { return nil }
            items.append(ReminderItem(id: id, fireAt: fireAt, title: title, body: body, assetId: assetId))
        }
        return Set(items.map(\.id)).count == items.count ? items : nil
    }

    /// "YYYY-MM-DDTHH:MM" in local time; impossible dates such as 02-30 are refused.
    static func components(_ text: String) -> DateComponents? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.isLenient = false
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        guard text.count == 16, let date = formatter.date(from: text) else { return nil }
        return formatter.calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    }

    var request: UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "assetboard-reminders"
        if let assetId { content.userInfo = ["assetId": assetId] }
        return UNNotificationRequest(identifier: id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: fireAt, repeats: false))
    }
}

/// Schedules the plan. Permission is asked for only once there is something to remind about; each plan replaces the whole
/// pending set (this app schedules nothing else), and a click on a notification is passed on so the page can open the record.
final class ReminderScheduler: NSObject, UNUserNotificationCenterDelegate {
    var onOpen: ((String?) -> Void)?
    /// "allowed", "denied" or "unknown" (not asked yet), so the page can say when reminders cannot arrive.
    var onStatus: ((String) -> Void)?
    private var applied: [ReminderItem]?
    private var center: UNUserNotificationCenter { UNUserNotificationCenter.current() }

    /// Called before the app finishes launching, so a click that launches the app is still delivered.
    func start() { center.delegate = self }

    func apply(_ items: [ReminderItem]) {
        guard items != applied else { return }
        applied = items
        guard !items.isEmpty else { center.removeAllPendingNotificationRequests(); return }
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            self.refreshStatus()
            guard granted else { return }
            DispatchQueue.main.async {
                guard self.applied == items else { return } // a newer plan arrived while the system was asking
                self.center.removeAllPendingNotificationRequests()
                for item in items { self.center.add(item.request) }
            }
        }
    }

    static func statusName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional: return "allowed"
        case .denied: return "denied"
        default: return "unknown"
        }
    }

    /// Also called whenever the app becomes active, so switching notifications back on in System Settings clears the note.
    func refreshStatus() {
        center.getNotificationSettings { settings in
            let status = ReminderScheduler.statusName(settings.authorizationStatus)
            DispatchQueue.main.async { self.onStatus?(status) }
        }
    }

    /// The Notifications pane of System Settings (System Preferences on macOS 12); the person picks Assetboard there.
    static var settingsURL: URL {
        if #available(macOS 13, *) { return URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")! }
        return URL(string: "x-apple.systempreferences:com.apple.preference.notifications")!
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let assetId = response.notification.request.content.userInfo["assetId"] as? String
        DispatchQueue.main.async {
            self.onOpen?(assetId)
            completionHandler()
        }
    }
}

func testReminders() {
    func check(_ ok: Bool, _ message: @autoclosure () -> String) { if !ok { fputs("Reminders test failed: \(message())\n", stderr); exit(1) } }
    let row: [String: Any] = ["id": "reminder-2026-10-30", "when": "2026-10-30T09:00", "title": "example.dev", "body": "明天到期 · ¥ 89 / 年", "assetId": "d"]
    let merged: [String: Any] = ["id": "reminder-2026-10-31", "when": "2026-10-31T09:00", "title": "2 项需要留意", "body": "a.example 明天到期；b.example 明天扣款", "assetId": NSNull()]
    guard let items = ReminderItem.parse([row, merged]) else { check(false, "A valid plan must parse"); return }
    check(items.count == 2 && items[1].assetId == nil, "Merged days carry no record id")
    let request = items[0].request
    let trigger = request.trigger as? UNCalendarNotificationTrigger
    let fire = trigger?.dateComponents
    check(request.identifier == "reminder-2026-10-30" && request.content.title == "example.dev" && request.content.body == "明天到期 · ¥ 89 / 年", "Request text")
    check(request.content.userInfo["assetId"] as? String == "d" && items[1].request.content.userInfo.isEmpty, "A click must know which record to open")
    check(fire?.year == 2026 && fire?.month == 10 && fire?.day == 30 && fire?.hour == 9 && fire?.minute == 0 && trigger?.repeats == false, "Fires once at 09:00 local: \(String(describing: fire))")
    check(ReminderItem.parse([[String: Any]]()) == [], "An empty plan clears the reminders")
    var bad: [[[String: Any]]] = []
    for (key, value) in [("when", "2026-02-30T09:00"), ("when", "2026-10-30 09:00"), ("when", "2026-10-30T9:00"), ("id", "other-1"), ("title", ""), ("assetId", ""), ("body", String(repeating: "x", count: 601))] as [(String, Any)] {
        var copy = row; copy[key] = value; bad.append([copy])
    }
    var missing = row; missing.removeValue(forKey: "title"); bad.append([missing])
    bad.append([row, row])
    bad.append(Array(repeating: row, count: ReminderItem.limit + 1).enumerated().map { index, item in var copy = item; copy["id"] = "reminder-\(index)"; return copy })
    for plan in bad { check(ReminderItem.parse(plan) == nil, "Must refuse \(plan.first ?? [:]) (\(plan.count) rows)") }
    check(ReminderItem.parse("nope") == nil && ReminderItem.parse([["id": 1]]) == nil, "Must refuse non-plans")
    check(ReminderScheduler.statusName(.authorized) == "allowed" && ReminderScheduler.statusName(.provisional) == "allowed" && ReminderScheduler.statusName(.denied) == "denied" && ReminderScheduler.statusName(.notDetermined) == "unknown", "Permission names")
    check(ReminderScheduler.settingsURL.scheme == "x-apple.systempreferences" && NSWorkspace.shared.urlForApplication(toOpen: ReminderScheduler.settingsURL) != nil, "System Settings must handle the notifications link")
    print("PASS: reminder plan validation (dates, ids, lengths, duplicates, limit), notification text, record id and one-shot 09:00 trigger, permission names, settings link handler")
}

/// Manual check, not run by build.sh: asks for permission and shows one notification in about 3 seconds.
func testNotify() {
    _ = NSApplication.shared
    var finished = false
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
        guard granted else { print("Notifications are off for Assetboard: \(error?.localizedDescription ?? "turn them on in System Settings › Notifications")"); exit(1) }
        let content = UNMutableNotificationContent()
        content.title = "Assetboard"
        content.body = "提醒已开启：到期和扣款前会在这里通知你"
        content.sound = .default
        let request = UNNotificationRequest(identifier: "assetboard-test", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false))
        UNUserNotificationCenter.current().add(request) { error in
            if let error { print("Could not schedule: \(error.localizedDescription)"); exit(1) }
            print("PASS: a test notification appears in about 3 seconds")
            finished = true
        }
    }
    while !finished { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
}
