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

  function sameMoment(a, b, toleranceMs = 5 * 60 * 1000) {
    return a !== null && b !== null && Math.abs(a - b) <= toleranceMs;
  }

  app.get("/api/lcm/profile-availability/:deviceId", (req, res) => {
    const deviceId = Number(req.params.deviceId || 0);
    if (!deviceId) return res.status(400).json({ error: "Thiếu thiết bị." });

    const device = db.prepare("SELECT id, status FROM devices WHERE id=?").get(deviceId);
    if (!device) return res.status(404).json({ error: "Không tìm thấy thiết bị." });

    const repairs = db.prepare(`
      SELECT
        r.id,
        r.received_at,
        r.repair_date,
        r.completed_at,
        r.updated_at,
        r.processing_status,
        r.status_after,
        (
          SELECT ah.action_time
          FROM activity_history ah
          WHERE ah.module='repair'
            AND ah.record_id=r.id
            AND (
              ah.action_type='Hoàn thành'
              OR ah.new_status IN ('Đã hoàn thành','Hoàn thành','Đã sửa xong','Bàn giao sử dụng')
            )
          ORDER BY datetime(ah.action_time) DESC, ah.id DESC
          LIMIT 1
        ) AS completed_action_time
      FROM repairs r
      WHERE r.device_id=?
        AND date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) >= date('now','-12 months')
    `).all(deviceId);

    const now = Date.now();
    const deviceIsActive = String(device.status || "").trim() === "Đang hoạt động";
    let downtimeHours = 0;
    let excludedUnreliableCompletion = 0;

    for (const r of repairs) {
      const start = parseTime(r.received_at || r.repair_date);
      if (start === null) continue;

      const processing = String(r.processing_status || "").trim();
      const isCompleted = ["Đã hoàn thành", "Hoàn thành", "Đã sửa xong", "Bàn giao sử dụng"].includes(processing);
      const isOpenRepair = processing === "Đang xử lý" || processing === "Chờ linh kiện";

      if (isCompleted) {
        const completedFromHistory = parseTime(r.completed_action_time);
        const completedFromSystem = parseTime(r.completed_at);
        const updatedAt = parseTime(r.updated_at);
        const completed = completedFromHistory !== null ? completedFromHistory : completedFromSystem;

        if (completed !== null) {
          const durationMs = Math.max(0, completed - start);
          const looksLikeAdministrativeClose =
            deviceIsActive &&
            durationMs > 24 * 60 * 60 * 1000 &&
            sameMoment(completed, updatedAt);

          // completed_at hiện được hệ thống tự gán theo lúc cập nhật phiếu.
          // Nếu mốc kết thúc trùng updated_at và cách xa thời gian tiếp nhận > 24 giờ,
          // không dùng khoảng thời gian hành chính này để suy ra máy đã ngừng liên tục.
          if (looksLikeAdministrativeClose) {
            excludedUnreliableCompletion += 1;
            continue;
          }

          downtimeHours += durationMs / 3600000;
          continue;
        }

        // Phiếu đã hoàn thành nhưng thiếu mốc kết thúc đủ tin cậy: không tự suy diễn downtime.
        excludedUnreliableCompletion += 1;
        continue;
      }

      // Phiếu cũ còn mở nhưng hồ sơ thiết bị hiện đã xác nhận đang hoạt động
      // không được tiếp tục cộng downtime đến thời điểm hiện tại.
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
      excluded_unreliable_completion: excludedUnreliableCompletion,
      calculation_note: excludedUnreliableCompletion
        ? "Không dùng thời điểm đóng/cập nhật hành chính làm thời gian ngừng máy khi mốc hoàn thành không đủ tin cậy."
        : "Ước tính từ các khoảng ngừng máy có mốc thời gian đủ tin cậy trong 12 tháng."
    });
  });
};
