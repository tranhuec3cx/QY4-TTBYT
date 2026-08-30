const path = require("path");
const Database = require("better-sqlite3");

module.exports = function registerWorkOrderRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const addColumn = (sql) => { try { db.prepare(sql).run(); } catch (_) {} };
  addColumn("ALTER TABLE repairs ADD COLUMN work_order_code TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN priority TEXT DEFAULT 'Bình thường'");
  addColumn("ALTER TABLE repairs ADD COLUMN reporter TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN assigned_to TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN assigned_at TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN started_at TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN due_at TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN waiting_reason TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN handover_at TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN handover_by TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN accepted_by TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN work_order_note TEXT");
  addColumn("ALTER TABLE repairs ADD COLUMN source_type TEXT");

  try { db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_repairs_work_order_code ON repairs(work_order_code) WHERE work_order_code IS NOT NULL AND work_order_code<>''").run(); } catch (_) {}

  function nowSql() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function normalizeDate(value) {
    const s = String(value || "").trim().replace("T", " ");
    return s || nowSql();
  }

  function woCode(id, value) {
    const date = normalizeDate(value).slice(0, 10).replace(/-/g, "") || "00000000";
    return `WO-${date}-${String(id).padStart(4, "0")}`;
  }

  function normalizePriority(value) {
    const raw = String(value || "").trim();
    if (["Khẩn cấp", "Cao", "Trung bình", "Thấp", "Bình thường"].includes(raw)) return raw;
    return "Bình thường";
  }

  function history(repairId, actor, action, oldStatus, newStatus, note) {
    try {
      db.prepare(`
        INSERT INTO activity_history
          (module,record_id,action_time,actor,action_type,old_status,new_status,note,cost,entry_type)
        VALUES ('repair',?,?,?,?,?,?,?,?,?)
      `).run(
        Number(repairId), nowSql(), actor || "Hệ thống", action || "Cập nhật Work Order",
        oldStatus || "", newStatus || "", note || "", 0, "Work Order"
      );
    } catch (_) {}
  }

  function ensureDefaults(row) {
    if (!row) return row;
    const updates = {};
    if (!row.work_order_code) updates.work_order_code = woCode(row.id, row.received_at || row.repair_date);
    if (!row.priority) updates.priority = normalizePriority(row.incident_severity);
    if (!row.source_type) updates.source_type = row.incident_id ? "Sự cố" : "Tạo trực tiếp";
    if (!row.reporter && row.incident_reporter) updates.reporter = row.incident_reporter;
    const keys = Object.keys(updates);
    if (keys.length) {
      const set = keys.map(k => `${k}=@${k}`).join(", ");
      db.prepare(`UPDATE repairs SET ${set} WHERE id=@id`).run({ id: row.id, ...updates });
      Object.assign(row, updates);
    }
    row.priority = normalizePriority(row.priority);
    return row;
  }

  function selectWorkOrders(where = "", params = []) {
    const rows = db.prepare(`
      SELECT
        r.*,
        r.incident_id AS source_incident_id,
        dv.device_code, dv.insurance_code, dv.name AS device_name,
        dv.department_code, dv.group_code, dv.model, dv.serial, dv.location,
        d.name AS department_name, g.name AS group_name,
        i.incident_code, i.severity AS incident_severity, i.reporter AS incident_reporter,
        i.incident_datetime AS incident_datetime
      FROM repairs r
      JOIN devices dv ON dv.id=r.device_id
      LEFT JOIN departments d ON d.code=dv.department_code
      LEFT JOIN device_groups g ON g.code=dv.group_code
      LEFT JOIN incidents i ON i.id=r.incident_id
      ${where}
      ORDER BY COALESCE(NULLIF(r.received_at,''),r.repair_date) DESC, r.id DESC
    `).all(...params);
    return rows.map(ensureDefaults);
  }

  app.get("/api/work-orders", (_req, res) => {
    res.json(selectWorkOrders());
  });

  app.get("/api/work-orders/:id", (req, res) => {
    const row = selectWorkOrders("WHERE r.id=?", [Number(req.params.id)])[0];
    if (!row) return res.status(404).json({ error: "Không tìm thấy phiếu công việc kỹ thuật." });
    res.json(row);
  });

  app.put("/api/work-orders/:id/meta", (req, res) => {
    const id = Number(req.params.id);
    const old = db.prepare("SELECT * FROM repairs WHERE id=?").get(id);
    if (!old) return res.status(404).json({ error: "Không tìm thấy phiếu công việc kỹ thuật." });
    const p = req.body || {};
    const assignedTo = String(p.assigned_to ?? old.assigned_to ?? "").trim();
    const assignedAt = assignedTo
      ? String(p.assigned_at || old.assigned_at || nowSql())
      : "";
    db.prepare(`
      UPDATE repairs SET
        work_order_code=@work_order_code,
        priority=@priority,
        reporter=@reporter,
        assigned_to=@assigned_to,
        assigned_at=@assigned_at,
        started_at=@started_at,
        due_at=@due_at,
        waiting_reason=@waiting_reason,
        handover_at=@handover_at,
        handover_by=@handover_by,
        accepted_by=@accepted_by,
        work_order_note=@work_order_note,
        source_type=@source_type
      WHERE id=@id
    `).run({
      id,
      work_order_code: old.work_order_code || woCode(id, old.received_at || old.repair_date),
      priority: normalizePriority(p.priority || old.priority),
      reporter: String(p.reporter ?? old.reporter ?? "").trim(),
      assigned_to: assignedTo,
      assigned_at: assignedAt,
      started_at: String(p.started_at ?? old.started_at ?? "").trim(),
      due_at: String(p.due_at ?? old.due_at ?? "").trim(),
      waiting_reason: String(p.waiting_reason ?? old.waiting_reason ?? "").trim(),
      handover_at: String(p.handover_at ?? old.handover_at ?? "").trim(),
      handover_by: String(p.handover_by ?? old.handover_by ?? "").trim(),
      accepted_by: String(p.accepted_by ?? old.accepted_by ?? "").trim(),
      work_order_note: String(p.work_order_note ?? old.work_order_note ?? "").trim(),
      source_type: old.source_type || (old.incident_id ? "Sự cố" : "Tạo trực tiếp")
    });
    history(id, p.actor || assignedTo || "Khoa Trang bị", "Cập nhật Work Order", old.processing_status, old.processing_status,
      `Ưu tiên: ${normalizePriority(p.priority || old.priority)}; Phụ trách: ${assignedTo || "Chưa phân công"}${p.due_at ? `; Hạn: ${p.due_at}` : ""}`);
    res.json(ensureDefaults(selectWorkOrders("WHERE r.id=?", [id])[0]));
  });

  app.post("/api/work-orders/:id/action", (req, res) => {
    const id = Number(req.params.id);
    const old = db.prepare("SELECT * FROM repairs WHERE id=?").get(id);
    if (!old) return res.status(404).json({ error: "Không tìm thấy phiếu công việc kỹ thuật." });
    const p = req.body || {};
    const action = String(p.action || "").trim();
    const actor = String(p.actor || p.assigned_to || old.assigned_to || "Khoa Trang bị").trim();
    let newStatus = old.processing_status || "Đang xử lý";
    let note = "";

    const tx = db.transaction(() => {
      if (action === "assign") {
        const assigned = String(p.assigned_to || "").trim();
        if (!assigned) throw new Error("Thiếu người phụ trách.");
        db.prepare("UPDATE repairs SET assigned_to=?, assigned_at=?, priority=?, due_at=? WHERE id=?")
          .run(assigned, nowSql(), normalizePriority(p.priority || old.priority), String(p.due_at || old.due_at || ""), id);
        note = `Phân công: ${assigned}`;
      } else if (action === "start") {
        newStatus = "Đang xử lý";
        db.prepare("UPDATE repairs SET processing_status='Đang xử lý', started_at=COALESCE(NULLIF(started_at,''),?), assigned_to=COALESCE(NULLIF(assigned_to,''),?) WHERE id=?")
          .run(nowSql(), actor, id);
        db.prepare("UPDATE devices SET status='Chờ sửa chữa' WHERE id=?").run(old.device_id);
        note = "Bắt đầu xử lý kỹ thuật";
      } else if (action === "wait") {
        newStatus = "Chờ linh kiện";
        const reason = String(p.waiting_reason || "Chờ linh kiện/vật tư").trim();
        db.prepare("UPDATE repairs SET processing_status='Chờ linh kiện', waiting_reason=? WHERE id=?").run(reason, id);
        db.prepare("UPDATE devices SET status='Chờ sửa chữa' WHERE id=?").run(old.device_id);
        note = reason;
      } else if (action === "complete") {
        newStatus = "Đã hoàn thành";
        const result = String(p.result || old.result || "Đã hoàn thành xử lý kỹ thuật").trim();
        db.prepare("UPDATE repairs SET processing_status='Đã hoàn thành', completed_at=?, result=?, status_after='Đang hoạt động', waiting_reason='' WHERE id=?")
          .run(nowSql(), result, id);
        db.prepare("UPDATE devices SET status='Đang hoạt động' WHERE id=?").run(old.device_id);
        note = result;
      } else if (action === "fail") {
        newStatus = "Không sửa được";
        const result = String(p.result || "Không sửa được").trim();
        db.prepare("UPDATE repairs SET processing_status='Không sửa được', completed_at=?, result=?, status_after='Ngừng hoạt động' WHERE id=?")
          .run(nowSql(), result, id);
        db.prepare("UPDATE devices SET status='Ngừng hoạt động' WHERE id=?").run(old.device_id);
        note = result;
      } else if (action === "handover") {
        if ((old.processing_status || "") !== "Đã hoàn thành") throw new Error("Chỉ bàn giao khi phiếu đã hoàn thành.");
        const handoverBy = String(p.handover_by || actor).trim();
        const acceptedBy = String(p.accepted_by || "").trim();
        if (!acceptedBy) throw new Error("Thiếu người nhận bàn giao.");
        db.prepare("UPDATE repairs SET handover_at=?, handover_by=?, accepted_by=? WHERE id=?")
          .run(nowSql(), handoverBy, acceptedBy, id);
        note = `Bàn giao bởi ${handoverBy}; nhận: ${acceptedBy}`;
      } else {
        throw new Error("Thao tác Work Order không hợp lệ.");
      }
    });

    try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
    history(id, actor, action, old.processing_status, newStatus, note);
    res.json(selectWorkOrders("WHERE r.id=?", [id])[0]);
  });

  console.log("Work Order module loaded: assignment, priority, deadlines, handling and handover");
};
