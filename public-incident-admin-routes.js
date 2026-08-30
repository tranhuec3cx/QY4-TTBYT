const path = require("path");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const { publicIncidentUrl, publicBaseUrl } = require("./public-incident-security");

module.exports = function registerPublicIncidentAdminRoutes(app) {
  const db = new Database(path.join(__dirname, "db", "qy4_ttbyt.sqlite"));
  db.pragma("journal_mode = WAL");

  function getDevice(deviceId) {
    return db.prepare(`
      SELECT dv.id, dv.name, dv.serial, dv.location, dv.department_code,
             COALESCE(d.name, dv.department_code, '') AS department_name
      FROM devices dv
      LEFT JOIN departments d ON d.code = dv.department_code
      WHERE dv.id = ?
    `).get(deviceId);
  }

  app.get("/api/public-incident/config", (_req, res) => {
    res.json({
      public_base_url: publicBaseUrl(),
      public_port: Number(process.env.PUBLIC_INCIDENT_PORT || 5050),
      mode: "incident-only"
    });
  });

  app.get("/api/public-incident/devices", (_req, res) => {
    try {
      const rows = db.prepare(`
        SELECT dv.id, dv.name, dv.serial, dv.location, dv.department_code,
               COALESCE(d.name, dv.department_code, '') AS department_name
        FROM devices dv
        LEFT JOIN departments d ON d.code = dv.department_code
        ORDER BY COALESCE(d.name, dv.department_code, ''), dv.name, dv.id
      `).all();
      res.json(rows);
    } catch (error) {
      console.error("GET /api/public-incident/devices error:", error);
      res.status(500).json({ error: "Không tải được danh sách thiết bị." });
    }
  });

  app.get("/api/public-incident/link/:deviceId", (req, res) => {
    try {
      const deviceId = Number(req.params.deviceId);
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        return res.status(400).json({ error: "Mã thiết bị không hợp lệ." });
      }
      const device = getDevice(deviceId);
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

  app.get("/api/public-incident/qr/:deviceId.png", async (req, res) => {
    try {
      const deviceId = Number(req.params.deviceId);
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        return res.status(400).json({ error: "Mã thiết bị không hợp lệ." });
      }
      const device = getDevice(deviceId);
      if (!device) return res.status(404).json({ error: "Không tìm thấy thiết bị." });

      const png = await QRCode.toBuffer(publicIncidentUrl(deviceId), {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (error) {
      console.error("GET /api/public-incident/qr/:deviceId.png error:", error);
      res.status(500).json({ error: "Không tạo được mã QR." });
    }
  });
};
