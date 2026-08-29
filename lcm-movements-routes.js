const path = require("path");
const Database = require("better-sqlite3");

module.exports = function registerLcmMovementRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Khoa Trang bị là điểm quản lý trung gian cho nghiệp vụ thu hồi/cấp phát.
  db.prepare("INSERT OR IGNORE INTO departments (code,name) VALUES ('C10','C10 - Khoa Trang bị')").run();

  const movementColumns = [
    ["movement_type", "TEXT DEFAULT 'Điều chuyển'"],
    ["document_no", "TEXT"],
    ["handover_condition", "TEXT"],
    ["giver", "TEXT"],
    ["status_before", "TEXT"],
    ["status_after", "TEXT"]
  ];
  const existing = new Set(db.prepare("PRAGMA table_info(device_transfers)").all().map(x => x.name));
  for (const [name, type] of movementColumns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE device_transfers ADD COLUMN ${name} ${type}`);
  }
  db.prepare("UPDATE device_transfers SET movement_type='Điều chuyển' WHERE movement_type IS NULL OR TRIM(movement_type)='' ").run();

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowSql = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  function departmentExists(code) {
    return Boolean(db.prepare("SELECT 1 FROM departments WHERE code=?").get(code));
  }

  function getMovementRows(whereSql = "", params = []) {
    return db.prepare(`
      SELECT t.*, dv.name AS device_name, dv.device_code, dv.department_code AS current_department,
             dv.location AS current_location, dv.status AS current_status,
             df.name AS from_department_name, dt.name AS to_department_name
      FROM device_transfers t
      JOIN devices dv ON dv.id=t.device_id
      LEFT JOIN departments df ON df.code=t.from_department
      LEFT JOIN departments dt ON dt.code=t.to_department
      ${whereSql}
      ORDER BY t.transfer_date DESC, t.id DESC
    `).all(...params);
  }

  app.get("/api/lcm/movements", (req, res) => {
    const type = String(req.query.type || "ALL");
    const deviceId = Number(req.query.device_id || 0);
    const clauses = [];
    const params = [];
    if (type !== "ALL") { clauses.push("COALESCE(t.movement_type,'Điều chuyển')=?"); params.push(type); }
    if (deviceId) { clauses.push("t.device_id=?"); params.push(deviceId); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    res.json(getMovementRows(where, params));
  });

  app.get("/api/lcm/movements/summary", (_req, res) => {
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(movement_type,''),'Điều chuyển') AS movement_type, COUNT(*) AS total
      FROM device_transfers
      WHERE substr(transfer_date,1,4)=strftime('%Y','now')
      GROUP BY COALESCE(NULLIF(movement_type,''),'Điều chuyển')
    `).all();
    const counts = { "Cấp phát":0, "Thu hồi":0, "Điều chuyển":0 };
    rows.forEach(x => { counts[x.movement_type] = Number(x.total || 0); });
    res.json({ counts, total:Object.values(counts).reduce((a,b)=>a+b,0) });
  });

  app.post("/api/lcm/movements", (req, res) => {
    const p = req.body || {};
    const type = String(p.movement_type || "Điều chuyển").trim();
    if (!["Cấp phát","Thu hồi","Điều chuyển"].includes(type)) {
      return res.status(400).json({ error:"Loại nghiệp vụ không hợp lệ." });
    }

    const deviceId = Number(p.device_id || 0);
    const dv = db.prepare("SELECT department_code,location,status FROM devices WHERE id=?").get(deviceId);
    if (!dv) return res.status(404).json({ error:"Không tìm thấy thiết bị." });

    let toDepartment = String(p.to_department || "").trim();
    let toLocation = String(p.to_location || "").trim();
    const oldDepartment = String(dv.department_code || "");
    const oldLocation = String(dv.location || "").trim();

    if (type === "Thu hồi") {
      if (oldDepartment === "C10") return res.status(400).json({ error:"Thiết bị hiện đã thuộc Khoa Trang bị (C10), không cần lập phiếu thu hồi." });
      toDepartment = "C10";
      if (!toLocation) toLocation = "Khoa Trang bị / Kho";
    } else {
      if (!toDepartment) return res.status(400).json({ error:"Chưa chọn khoa nhận." });
      if (!departmentExists(toDepartment)) return res.status(400).json({ error:"Khoa nhận không tồn tại trong danh mục." });
      if (type === "Cấp phát" && oldDepartment !== "C10") {
        return res.status(400).json({ error:"Cấp phát chỉ thực hiện khi thiết bị đang do Khoa Trang bị (C10) quản lý. Nếu chuyển trực tiếp giữa hai khoa, hãy chọn Điều chuyển." });
      }
      if (type === "Cấp phát" && toDepartment === "C10") {
        return res.status(400).json({ error:"Khoa nhận cấp phát phải là khoa sử dụng, không phải C10." });
      }
    }

    if (toDepartment === oldDepartment && (!toLocation || toLocation === oldLocation)) {
      return res.status(400).json({ error:"Khoa và vị trí không thay đổi. Không cần lập phiếu biến động." });
    }

    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO device_transfers (
          device_id,transfer_date,from_department,to_department,from_location,to_location,
          reason,approved_by,receiver,note,created_at,movement_type,document_no,
          handover_condition,giver,status_before,status_after
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        deviceId,
        p.transfer_date || todayISO(),
        oldDepartment,
        toDepartment,
        oldLocation,
        toLocation,
        String(p.reason || "").trim(),
        String(p.approved_by || "").trim(),
        String(p.receiver || "").trim(),
        String(p.note || "").trim(),
        nowSql(),
        type,
        String(p.document_no || "").trim(),
        String(p.handover_condition || "").trim(),
        String(p.giver || "").trim(),
        String(dv.status || "").trim(),
        String(dv.status || "").trim()
      );

      db.prepare("UPDATE devices SET department_code=?, location=? WHERE id=?")
        .run(toDepartment, toLocation || oldLocation, deviceId);
      return info.lastInsertRowid;
    });

    res.json({ id:tx(), movement_type:type, from_department:oldDepartment, to_department:toDepartment });
  });

  app.delete("/api/lcm/movements/:id", (_req, res) => {
    return res.status(400).json({ error:"Không xóa lịch sử cấp phát/thu hồi/điều chuyển. Nếu ghi sai, hãy lập phiếu biến động ngược để bảo toàn lịch sử vòng đời." });
  });

  // Timeline mở rộng để hồ sơ máy hiển thị đúng tên nghiệp vụ.
  app.get("/api/lcm/movement-timeline/:deviceId", (req, res) => {
    const id = Number(req.params.deviceId);
    const events = [];
    const push = (type, date, title, detail, status) => {
      if (date) events.push({ type, date, title, detail:detail||"", status:status||"" });
    };

    db.prepare("SELECT * FROM device_receipts WHERE device_id=?").all(id).forEach(x => {
      push("Tiếp nhận",x.delivery_date||x.created_at,"Giao nhận thiết bị",`${x.supplier||''} ${x.contract_no||''}`.trim(),x.status);
      push("Lắp đặt",x.installation_date,"Lắp đặt - chạy thử","",x.status);
      push("Nghiệm thu",x.acceptance_date,"Nghiệm thu kỹ thuật",x.co_cq_status,x.status);
      push("Đào tạo",x.training_date,"Đào tạo - chuyển giao",x.receiver,x.training_status);
      push("Bàn giao",x.handover_date,"Bàn giao đưa vào quản lý","",x.status);
    });

    db.prepare("SELECT * FROM device_transfers WHERE device_id=?").all(id).forEach(x => {
      const type = x.movement_type || "Điều chuyển";
      const route = `${x.from_department||''} → ${x.to_department||''}`;
      const detail = [route, x.reason, x.handover_condition].filter(Boolean).join(" · ");
      push(type,x.transfer_date,`${type} thiết bị`,detail,x.receiver||x.approved_by||"");
    });

    db.prepare("SELECT * FROM incidents WHERE device_id=?").all(id).forEach(x => push("Sự cố",x.incident_datetime,"Ghi nhận sự cố",x.description,x.status));
    db.prepare("SELECT * FROM repairs WHERE device_id=?").all(id).forEach(x => push("Sửa chữa",x.repair_date||x.received_at,"Sửa chữa",x.work||x.issue,x.processing_status||x.status_after));
    db.prepare("SELECT * FROM maintenances WHERE device_id=?").all(id).forEach(x => push("Bảo dưỡng",x.maintenance_date,"Bảo dưỡng",x.content,x.result));
    db.prepare("SELECT * FROM inspections WHERE device_id=?").all(id).forEach(x => push("Kiểm định",x.inspection_date,x.type||"Kiểm định/hiệu chuẩn",x.organization,x.result));
    db.prepare("SELECT * FROM device_disposals WHERE device_id=?").all(id).forEach(x => push("Thanh lý",x.proposal_date||x.created_at,"Hồ sơ thanh lý",x.reason,x.status));

    events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    res.json(events);
  });

  console.log("LCM movements loaded: issue, recall, transfer");
};
