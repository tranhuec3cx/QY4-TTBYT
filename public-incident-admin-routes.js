const path = require("path");
const Database = require("better-sqlite3");
const { publicIncidentUrl, publicBaseUrl } = require("./public-incident-security");

module.exports = function registerPublicIncidentAdminRoutes(app) {
  const db = new Database(path.join(__dirname, "db", "qy4_ttbyt.sqlite"));
  db.pragma("journal_mode = WAL");

  app.get("/api/public-incident/config", (_req, res) => {
    res.json({
      public_base_url: publicBaseUrl(),
      public_port: Number(process.env.PUBLIC_INCIDENT_PORT || 5050),
      mode: "incident-only"
    });
  });

  app.get("/api/public-incident/link/:deviceId", (req, res) => {
    try {
      const deviceId = Number(req.params.deviceId);
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        return res.status(400).json({ error: "Mã thiết bị không hợp lệ." });
      }
      const device = db.prepare(`
        SELECT dv.id, dv.name, dv.serial, dv.location, dv.department_code,
               COALESCE(d.name, dv.department_code, '') AS department_name
        FROM devices dv
        LEFT JOIN departments d ON d.code = dv.department_code
        WHERE dv.id = ?
      `).get(deviceId);
      if (!device) return res.status(404).json({ error: "Không tìm thấy thiết bị." });

      res.json({
        device,
        url: publicIncidentUrl(deviceId),
        public_base_url: publicBaseUrl()
      });
    } catch (error) {
      console.error("GET /api/public-incident/link/:deviceId error:", error);
      res.status(500).json({ error: "Không tạo được liên kết báo sự cố công khai." });
    }
  });
};
