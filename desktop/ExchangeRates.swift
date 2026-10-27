import Foundation

/// Daily reference rates for the 费用 totals: the European Central Bank's, through Frankfurter (no key, no account). Fetched at most
/// once a day, kept in the data folder, recorded in 网络记录. Only totals are converted; a record's own currency never changes.
final class ExchangeRates {
    static let codes = ["CNY", "EUR", "GBP", "HKD", "JPY", "SGD", "AUD", "CAD"]
    static let endpoint = URL(string: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=" + codes.joined(separator: ","))!
    let file: URL
    private let session: URLSession

    init(directory: URL, session: URLSession = NetworkLog.session(L("汇率"))) {
        file = directory.appendingPathComponent("fx-rates.json")
        self.session = session
    }

    func cached() -> [String: Any]? {
        (try? Data(contentsOf: file)).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
    }

    /// Rates per 1 USD with the date they are for; nil unless every expected code has a plausible positive rate.
    static func parse(_ data: Data) -> [String: Any]? {
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], json["base"] as? String == "USD",
              let date = json["date"] as? String, date.count == 10, let raw = json["rates"] as? [String: Any] else { return nil }
        var rates: [String: Double] = ["USD": 1]
        for code in codes {
            guard let value = (raw[code] as? NSNumber)?.doubleValue, value.isFinite, value > 0, value < 100_000 else { return nil }
            rates[code] = value
        }
        return ["date": date, "rates": rates, "source": "欧洲央行参考汇率"]
    }

    static func day(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Today's rates: the kept copy when it was fetched today (unless `force`), otherwise a fresh fetch. When that fails the kept copy
    /// comes back with ok false and the reason, so totals still show, marked as not current.
    func load(force: Bool, now: Date = Date(), completion: @escaping ([String: Any]) -> Void) {
        let today = Self.day(now)
        if !force, let kept = cached(), kept["fetchedOn"] as? String == today {
            completion(kept.merging(["ok": true]) { $1 })
            return
        }
        var request = URLRequest(url: Self.endpoint)
        request.timeoutInterval = 15
        session.dataTask(with: request) { data, response, _ in
            if let data, (response as? HTTPURLResponse)?.statusCode == 200, var fresh = Self.parse(data) {
                fresh["fetchedOn"] = today
                if let bytes = try? JSONSerialization.data(withJSONObject: fresh) { try? bytes.write(to: self.file, options: .atomic) }
                completion(fresh.merging(["ok": true]) { $1 })
            } else {
                completion((self.cached() ?? [:]).merging(["ok": false, "error": L("没有取到今天的汇率")]) { $1 })
            }
        }.resume()
    }
}
