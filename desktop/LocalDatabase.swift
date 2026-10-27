import Foundation
import SQLite3

final class LocalDatabase {
    let file: URL
    private var connection: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(file: URL) throws {
        self.file = file
        guard sqlite3_open_v2(file.path, &connection, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
            let message = connection.map { String(cString: sqlite3_errmsg($0)) } ?? L("无法打开 SQLite 文件")
            sqlite3_close(connection)
            throw NSError(domain: "Assetboard.Database", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        try execute("PRAGMA journal_mode=WAL")
        try execute("CREATE TABLE IF NOT EXISTS board_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)")
        try execute("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, type TEXT NOT NULL, source TEXT, name TEXT NOT NULL, payload TEXT NOT NULL)")
        try execute("CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, imported_at TEXT NOT NULL, asset_id TEXT, payload TEXT NOT NULL)")
        try execute("CREATE INDEX IF NOT EXISTS evidence_source ON evidence(source, imported_at)")
        try execute("CREATE TABLE IF NOT EXISTS network_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)")
    }

    deinit { sqlite3_close(connection) }

    private func failure(_ context: String) -> NSError {
        NSError(domain: "Assetboard.Database", code: 2, userInfo: [NSLocalizedDescriptionKey: L("{name}：{error}", ["name": context, "error": String(cString: sqlite3_errmsg(connection))])])
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(connection, sql, nil, nil, nil) == SQLITE_OK else { throw failure(L("数据库操作失败")) }
    }

    private func statement(_ sql: String) throws -> OpaquePointer {
        var prepared: OpaquePointer?
        guard sqlite3_prepare_v2(connection, sql, -1, &prepared, nil) == SQLITE_OK, let prepared else { throw failure(L("数据库语句无效")) }
        return prepared
    }

    private func bind(_ value: String, to statement: OpaquePointer, at index: Int32) throws {
        guard sqlite3_bind_text(statement, index, value, -1, transient) == SQLITE_OK else { throw failure(L("数据库参数无效")) }
    }

    func loadBoard() throws -> [String: Any]? {
        let query = try statement("SELECT payload FROM board_state WHERE id=1")
        defer { sqlite3_finalize(query) }
        let status = sqlite3_step(query)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW, let raw = sqlite3_column_text(query, 0) else { throw failure(L("无法读取资产板")) }
        let data = Data(String(cString: raw).utf8)
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw failure(L("资产板数据格式错误")) }
        return value
    }

    func saveBoard(_ board: [String: Any]) throws {
        let bytes = try JSONSerialization.data(withJSONObject: board, options: [.sortedKeys])
        guard let payload = String(data: bytes, encoding: .utf8), let assets = board["assets"] as? [[String: Any]] else { throw failure(L("资产板数据格式错误")) }
        try execute("BEGIN IMMEDIATE")
        do {
            let saveState = try statement("INSERT INTO board_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload")
            defer { sqlite3_finalize(saveState) }
            try bind(payload, to: saveState, at: 1)
            guard sqlite3_step(saveState) == SQLITE_DONE else { throw failure(L("保存资产板失败")) }
            try execute("DELETE FROM assets")
            let insert = try statement("INSERT INTO assets(id,type,source,name,payload) VALUES(?,?,?,?,?)")
            defer { sqlite3_finalize(insert) }
            for asset in assets {
                guard let id = asset["id"] as? String, let type = asset["type"] as? String,
                      let name = asset["name"] as? String,
                      let data = try? JSONSerialization.data(withJSONObject: asset, options: [.sortedKeys]),
                      let json = String(data: data, encoding: .utf8) else { throw failure(L("资产记录格式错误")) }
                sqlite3_reset(insert)
                sqlite3_clear_bindings(insert)
                try bind(id, to: insert, at: 1)
                try bind(type, to: insert, at: 2)
                try bind(asset["source"] as? String ?? "", to: insert, at: 3)
                try bind(name, to: insert, at: 4)
                try bind(json, to: insert, at: 5)
                guard sqlite3_step(insert) == SQLITE_DONE else { throw failure(L("保存资产记录失败")) }
            }
            try execute("COMMIT")
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    func assetCount() throws -> Int {
        let query = try statement("SELECT COUNT(*) FROM assets")
        defer { sqlite3_finalize(query) }
        guard sqlite3_step(query) == SQLITE_ROW else { throw failure(L("无法统计资产")) }
        return Int(sqlite3_column_int(query, 0))
    }

    func saveEvidence(id: String, kind: String, source: String, title: String, body: String, assetId: String? = nil, payload: [String: Any] = [:]) throws {
        // Re-importing the same file keeps earlier annotations such as an AI reading.
        let merged = (try evidencePayload(id: id) ?? [:]).merging(payload) { _, new in new }
        let bytes = try JSONSerialization.data(withJSONObject: merged, options: [.sortedKeys])
        let query = try statement("INSERT INTO evidence(id,kind,source,title,body,imported_at,asset_id,payload) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,imported_at=excluded.imported_at,asset_id=excluded.asset_id,payload=excluded.payload")
        defer { sqlite3_finalize(query) }
        for (index, value) in [id,kind,source,title,body,ISO8601DateFormatter().string(from: Date()),assetId ?? "",String(data: bytes, encoding: .utf8) ?? "{}"].enumerated() {
            try bind(value, to: query, at: Int32(index + 1))
        }
        guard sqlite3_step(query) == SQLITE_DONE else { throw failure(L("保存导入证据失败")) }
    }

    private func evidencePayload(id: String) throws -> [String: Any]? {
        let query = try statement("SELECT payload FROM evidence WHERE id=?")
        defer { sqlite3_finalize(query) }
        try bind(id, to: query, at: 1)
        guard sqlite3_step(query) == SQLITE_ROW, let raw = sqlite3_column_text(query, 0) else { return nil }
        return (try? JSONSerialization.jsonObject(with: Data(String(cString: raw).utf8))) as? [String: Any] ?? [:]
    }

    func evidence(id: String, bodyLimit: Int = 8000) throws -> [String: String]? {
        let query = try statement("SELECT id,kind,source,title,substr(body,1,?),imported_at,payload FROM evidence WHERE id=?")
        defer { sqlite3_finalize(query) }
        guard sqlite3_bind_int(query, 1, Int32(max(1, bodyLimit))) == SQLITE_OK else { throw failure(L("查询数量无效")) }
        try bind(id, to: query, at: 2)
        guard sqlite3_step(query) == SQLITE_ROW else { return nil }
        var row: [String: String] = [:]
        for (index, name) in ["id", "kind", "source", "title", "body", "importedAt", "payload"].enumerated() {
            row[name] = sqlite3_column_text(query, Int32(index)).map { String(cString: $0) } ?? ""
        }
        return row
    }

    func mergeEvidencePayload(id: String, values: [String: Any]) throws {
        guard let current = try evidencePayload(id: id) else { throw failure(L("找不到这条导入资料")) }
        let bytes = try JSONSerialization.data(withJSONObject: current.merging(values) { _, new in new }, options: [.sortedKeys])
        let query = try statement("UPDATE evidence SET payload=? WHERE id=?")
        defer { sqlite3_finalize(query) }
        try bind(String(data: bytes, encoding: .utf8) ?? "{}", to: query, at: 1)
        try bind(id, to: query, at: 2)
        guard sqlite3_step(query) == SQLITE_DONE else { throw failure(L("保存识别结果失败")) }
    }

    /// Most recent evidence first. Bodies are clipped so the list stays small enough to hand to the web view.
    func listEvidence(limit: Int = 500, bodyLimit: Int = 6000) throws -> [[String: String]] {
        let query = try statement("SELECT id,kind,source,title,substr(body,1,?),imported_at,payload FROM evidence ORDER BY imported_at DESC, rowid DESC LIMIT ?")
        defer { sqlite3_finalize(query) }
        guard sqlite3_bind_int(query, 1, Int32(max(1, bodyLimit))) == SQLITE_OK,
              sqlite3_bind_int(query, 2, Int32(max(1, min(limit, 2000)))) == SQLITE_OK else { throw failure(L("查询数量无效")) }
        var rows: [[String: String]] = []
        while true {
            let status = sqlite3_step(query)
            if status == SQLITE_DONE { return rows }
            guard status == SQLITE_ROW else { throw failure(L("无法读取导入资料")) }
            let columns = ["id", "kind", "source", "title", "body", "importedAt", "payload"]
            var row: [String: String] = [:]
            for (index, name) in columns.enumerated() {
                row[name] = sqlite3_column_text(query, Int32(index)).map { String(cString: $0) } ?? ""
            }
            rows.append(row)
        }
    }

    /// 网络记录: one JSON row per request, oldest dropped beyond `keep`.
    func appendNetworkLog(_ entry: [String: Any], keep: Int) throws {
        let bytes = try JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys])
        let insert = try statement("INSERT INTO network_log(payload) VALUES(?)")
        defer { sqlite3_finalize(insert) }
        try bind(String(data: bytes, encoding: .utf8) ?? "{}", to: insert, at: 1)
        guard sqlite3_step(insert) == SQLITE_DONE else { throw failure(L("保存网络记录失败")) }
        let prune = try statement("DELETE FROM network_log WHERE seq <= (SELECT MAX(seq) FROM network_log) - ?")
        defer { sqlite3_finalize(prune) }
        guard sqlite3_bind_int(prune, 1, Int32(max(1, keep))) == SQLITE_OK, sqlite3_step(prune) == SQLITE_DONE else { throw failure(L("整理网络记录失败")) }
    }

    /// Most recent first.
    func listNetworkLog(limit: Int = 2000) throws -> [[String: Any]] {
        let query = try statement("SELECT payload FROM network_log ORDER BY seq DESC LIMIT ?")
        defer { sqlite3_finalize(query) }
        guard sqlite3_bind_int(query, 1, Int32(max(1, min(limit, 5000)))) == SQLITE_OK else { throw failure(L("查询数量无效")) }
        var rows: [[String: Any]] = []
        while true {
            let status = sqlite3_step(query)
            if status == SQLITE_DONE { return rows }
            guard status == SQLITE_ROW else { throw failure(L("无法读取网络记录")) }
            if let raw = sqlite3_column_text(query, 0),
               let row = (try? JSONSerialization.jsonObject(with: Data(String(cString: raw).utf8))) as? [String: Any] { rows.append(row) }
        }
    }

    func clearNetworkLog() throws { try execute("DELETE FROM network_log") }
}
