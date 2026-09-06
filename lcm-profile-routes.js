const path = require("path");
const Database = require("better-sqlite3");

module.exports = function registerLcmProfileRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  function parseTime(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    const normalized = text.includes("T") ? text : text.replace(" ", "T");
    const ms = new Date(normalized).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  app.get("/api/lcm/profile-availability/:deviceId", (req, res) => {
    const deviceId = Number(req.params.deviceId || 0);
    if (!deviceId) return res.status(400).json({ error: "Thiếu thiết bị." });

    const device = db.prepare("SELECT id, status FROM devices WHERE id=?").get(deviceId);
    if (!device) return res.status(404).json({ error: "Không tìm thấy thiết bị." });

    const repairs = db.prepare(`
      SELECT id, received_at, repair_date, completed_at, processing_status
      FROM repairs
      WHERE device_id=?
        AND date(COALESCE(NULLIF(received_at,''), repair_date)) >= date('now','-12 months')
    `).all(deviceId);

    const now = Date.now();
    const deviceIsActive = String(device.status || "").trim() === "Đang hoạt động";
    let downtimeHours = 0;

    for (const r of repairs) {
      const start = parseTime(r.received_at || r.repair_date);
      if (start === null) continue;

      const completed = parseTime(r.completed_at);
      if (completed !== null) {
        downtimeHours += Math.max(0, completed - start) / 3600000;
        continue;
      }

      const processing = String(r.processing_status || "").trim();
      const isOpenRepair = processing === "Đang xử lý" || processing === "Chờ linh kiện";

      // Không tiếp tục cộng downtime từ một phiếu sửa chữa cũ nếu hồ sơ thiết bị
      // đã xác nhận máy đang hoạt động. Điều này tránh một phiếu chưa đóng trạng thái
      // làm sai lệch tỷ lệ hoạt động của cả 12 tháng.
      if (isOpenRepair && !deviceIsActive) {
        downtimeHours += Math.max(0, now - start) / 3600000;
      }
    }

    const yearHours = 365 * 24;
    const availability = Math.max(0, Math.min(100, 100 - (downtimeHours / yearHours) * 100));

    res.json({
      device_id: deviceId,
      availability_percent: Number(availability.toFixed(1)),
      downtime_hours_12m: Number(downtimeHours.toFixed(1)),
      repair_count_12m: repairs.length,
      calculation_note: "Ước tính từ thời gian ngừng ghi nhận trên phiếu sửa chữa trong 12 tháng."
    });
  });
};
