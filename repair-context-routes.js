const path = require("path");
const Database = require("better-sqlite3");

module.exports = function registerRepairContextRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  try { db.pragma("journal_mode = WAL"); } catch (_) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS repair_context (
      repair_id INTEGER PRIMARY KEY,
      priority TEXT DEFAULT '',
      reporter TEXT DEFAULT '',
      note TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
  `);

  const nowSql = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  app.get("/api/repair-contexts", (_req, res) => {
    try {
      // Dọn các dòng phụ mồ côi nếu một phiếu sửa chữa đã bị xóa.
      db.prepare("DELETE FROM repair_context WHERE repair_id NOT IN (SELECT id FROM repairs)").run();
      const rows = db.prepare(`
        SELECT
          r.id AS repair_id,
          COALESCE(NULLIF(rc.priority, ''), NULLIF(i.severity, ''), 'Bình thường') AS priority,
          COALESCE(NULLIF(rc.reporter, ''), NULLIF(i.reporter, ''), '') AS reporter,
          COALESCE(NULLIF(rc.note, ''), NULLIF(i.note, ''), '') AS note,
          i.id AS source_incident_id,
          i.reporter AS source_reporter
        FROM repairs r
        LEFT JOIN repair_context rc ON rc.repair_id = r.id
        LEFT JOIN incidents i ON i.id = r.incident_id
        ORDER BY r.id DESC
      `).all();
      res.json(rows);
    } catch (e) {
      console.error("GET /api/repair-contexts error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/repairs/:id/context", (req, res) => {
    try {
      const repairId = Number(req.params.id || 0);
      if (!repairId) return res.status(400).json({ error: "repair_id không hợp lệ." });
      const exists = db.prepare("SELECT id FROM repairs WHERE id=?").get(repairId);
      if (!exists) return res.status(404).json({ error: "Không tìm thấy phiếu sửa chữa." });
      const p = req.body || {};
      db.prepare(`
        INSERT INTO repair_context (repair_id, priority, reporter, note, updated_at)
        VALUES (@repair_id, @priority, @reporter, @note, @updated_at)
        ON CONFLICT(repair_id) DO UPDATE SET
          priority=excluded.priority,
          reporter=excluded.reporter,
          note=excluded.note,
          updated_at=excluded.updated_at
      `).run({
        repair_id: repairId,
        priority: String(p.priority || "").trim(),
        reporter: String(p.reporter || "").trim(),
        note: String(p.note || "").trim(),
        updated_at: nowSql()
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("PUT /api/repairs/:id/context error:", e);
      res.status(500).json({ error: e.message });
    }
  });
};
