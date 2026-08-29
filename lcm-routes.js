const path = require("path");
const Database = require("better-sqlite3");

module.exports = function registerLcmRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS device_lcm_profiles (
      device_id INTEGER PRIMARY KEY,
      clinical_criticality INTEGER DEFAULT 3,
      planned_life_years INTEGER DEFAULT 10,
      replacement_priority TEXT DEFAULT 'Bình thường',
      replacement_year INTEGER,
      note TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      contract_no TEXT,
      supplier TEXT,
      delivery_date TEXT,
      installation_date TEXT,
      acceptance_date TEXT,
      training_date TEXT,
      handover_date TEXT,
      receiver TEXT,
      co_cq_status TEXT DEFAULT 'Chưa cập nhật',
      training_status TEXT DEFAULT 'Chưa thực hiện',
      status TEXT DEFAULT 'Chuẩn bị tiếp nhận',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      transfer_date TEXT NOT NULL,
      from_department TEXT,
      to_department TEXT NOT NULL,
      from_location TEXT,
      to_location TEXT,
      reason TEXT,
      approved_by TEXT,
      receiver TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_disposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      proposal_date TEXT,
      reason TEXT,
      condition_summary TEXT,
      appraisal_date TEXT,
      decision_no TEXT,
      decision_date TEXT,
      disposal_method TEXT,
      value_recovered REAL DEFAULT 0,
      status TEXT DEFAULT 'Đề nghị thanh lý',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_device ON device_receipts(device_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_device ON device_transfers(device_id);
    CREATE INDEX IF NOT EXISTS idx_disposals_device ON device_disposals(device_id);
  `);

  const nowSql = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n || 0)));
  const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Number.isFinite(ms) ? Math.max(0, ms / 86400000) : 0;
  };

  function computeMetrics(row) {
    const currentYear = new Date().getFullYear();
    const age = row.year_in_use ? Math.max(0, currentYear - Number(row.year_in_use)) : 0;
    const plannedLife = Math.max(1, Number(row.planned_life_years || 10));
    const criticality = clamp(row.clinical_criticality || 3, 1, 5);
    const repairCount = Number(row.repair_count_12m || 0);
    const repairCost = Number(row.repair_cost_total || 0);
    const downtimeHours = Number(row.downtime_hours_12m || 0);
    const availability = Math.max(0, 100 - (downtimeHours / (365 * 24)) * 100);
    const today = new Date().toISOString().slice(0, 10);

    let risk = 0;
    risk += clamp((age / plannedLife) * 25, 0, 30);
    risk += clamp(repairCount * 5, 0, 20);
    risk += row.status === "Ngừng hoạt động" ? 25 : row.status === "Chờ sửa chữa" ? 18 : 0;
    risk += row.next_maintenance && row.next_maintenance < today ? 10 : 0;
    risk += row.next_inspection && row.next_inspection < today ? 10 : 0;
    risk += (criticality - 1) * 2.5;
    risk = Math.round(clamp(risk, 0, 100));

    let riskLevel = "Thấp";
    if (risk >= 70) riskLevel = "Cao";
    else if (risk >= 40) riskLevel = "Trung bình";

    let recommendation = "Tiếp tục khai thác";
    if (row.status === "Ngừng hoạt động" || risk >= 80) recommendation = "Ưu tiên đánh giá thay thế/thanh lý";
    else if (risk >= 60) recommendation = "Lập kế hoạch sửa chữa lớn hoặc thay thế";
    else if (risk >= 40) recommendation = "Tăng cường theo dõi và bảo dưỡng";

    return {
      ...row,
      age_years: age,
      availability_percent: Number(availability.toFixed(1)),
      risk_score: risk,
      risk_level: riskLevel,
      recommendation,
      repair_cost_total: repairCost,
      downtime_hours_12m: Number(downtimeHours.toFixed(1))
    };
  }

  function getDeviceMetrics(whereSql = "", params = []) {
    const rows = db.prepare(`
      SELECT
        dv.id, dv.device_code, dv.insurance_code, dv.name, dv.department_code,
        d.name AS department_name, dv.group_code, g.name AS group_name,
        dv.manufacturer, dv.model, dv.serial, dv.year_in_use, dv.year_manufactured,
        dv.status, dv.quality_level, dv.cost, dv.location, dv.warranty_end,
        COALESCE(p.clinical_criticality, 3) AS clinical_criticality,
        COALESCE(p.planned_life_years, 10) AS planned_life_years,
        p.replacement_priority, p.replacement_year,
        (SELECT COUNT(*) FROM repairs r
          WHERE r.device_id=dv.id
            AND date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) >= date('now','-12 months')) AS repair_count_12m,
        (SELECT COUNT(*) FROM repairs r WHERE r.device_id=dv.id) AS repair_count_total,
        COALESCE((SELECT SUM(COALESCE(r.cost,0)) FROM repairs r WHERE r.device_id=dv.id),0) AS repair_cost_total,
        COALESCE((SELECT SUM(
          CASE
            WHEN COALESCE(NULLIF(r.completed_at,''),'')<>'' AND COALESCE(NULLIF(r.received_at,''), r.repair_date)<>''
            THEN MAX(0, (julianday(r.completed_at)-julianday(COALESCE(NULLIF(r.received_at,''), r.repair_date)))*24)
            ELSE 0
          END
        ) FROM repairs r
          WHERE r.device_id=dv.id
            AND date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) >= date('now','-12 months')),0) AS downtime_hours_12m,
        (SELECT MAX(m.next_date) FROM maintenances m WHERE m.device_id=dv.id) AS next_maintenance,
        (SELECT MAX(i.next_date) FROM inspections i WHERE i.device_id=dv.id) AS next_inspection,
        COALESCE((SELECT SUM(COALESCE(u.value,0)) FROM usage_reports u
          WHERE u.device_id=dv.id AND u.year=CAST(strftime('%Y','now') AS INTEGER)),0) AS usage_current_year
      FROM devices dv
      LEFT JOIN departments d ON d.code=dv.department_code
      LEFT JOIN device_groups g ON g.code=dv.group_code
      LEFT JOIN device_lcm_profiles p ON p.device_id=dv.id
      ${whereSql}
      ORDER BY dv.department_code, dv.name
    `).all(...params);
    return rows.map(computeMetrics);
  }

  app.get("/api/lcm/summary", (_req, res) => {
    const devices = getDeviceMetrics();
    const today = new Date().toISOString().slice(0,10);
    const d30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const counts = {
      total: devices.length,
      active: devices.filter(x => x.status === "Đang hoạt động").length,
      waiting_repair: devices.filter(x => x.status === "Chờ sửa chữa").length,
      stopped: devices.filter(x => x.status === "Ngừng hoạt động").length,
      high_risk: devices.filter(x => x.risk_level === "Cao").length,
      medium_risk: devices.filter(x => x.risk_level === "Trung bình").length,
      maintenance_overdue: devices.filter(x => x.next_maintenance && x.next_maintenance < today).length,
      maintenance_due_30: devices.filter(x => x.next_maintenance && x.next_maintenance >= today && x.next_maintenance <= d30).length,
      inspection_overdue: devices.filter(x => x.next_inspection && x.next_inspection < today).length,
      inspection_due_30: devices.filter(x => x.next_inspection && x.next_inspection >= today && x.next_inspection <= d30).length,
      receipt_pending: db.prepare("SELECT COUNT(*) c FROM device_receipts WHERE status NOT IN ('Đã bàn giao','Hoàn thành')").get().c,
      disposal_pending: db.prepare("SELECT COUNT(*) c FROM device_disposals WHERE status NOT IN ('Đã thanh lý','Hủy')").get().c,
      transfers_ytd: db.prepare("SELECT COUNT(*) c FROM device_transfers WHERE substr(transfer_date,1,4)=strftime('%Y','now')").get().c
    };
    const riskTop = [...devices].sort((a,b)=>b.risk_score-a.risk_score).slice(0,10);
    res.json({ ...counts, risk_top: riskTop });
  });

  app.get("/api/lcm/devices", (req, res) => {
    const dep = String(req.query.department_code || "ALL");
    const minRisk = Number(req.query.min_risk || 0);
    let rows = dep !== "ALL" ? getDeviceMetrics("WHERE dv.department_code=?", [dep]) : getDeviceMetrics();
    if (minRisk > 0) rows = rows.filter(x => x.risk_score >= minRisk);
    res.json(rows);
  });

  app.get("/api/lcm/profiles/:deviceId", (req, res) => {
    const row = db.prepare("SELECT * FROM device_lcm_profiles WHERE device_id=?").get(Number(req.params.deviceId));
    res.json(row || { device_id:Number(req.params.deviceId), clinical_criticality:3, planned_life_years:10, replacement_priority:"Bình thường", replacement_year:null, note:"" });
  });

  app.put("/api/lcm/profiles/:deviceId", (req, res) => {
    const p = req.body || {};
    db.prepare(`
      INSERT INTO device_lcm_profiles (device_id,clinical_criticality,planned_life_years,replacement_priority,replacement_year,note,updated_at)
      VALUES (@device_id,@clinical_criticality,@planned_life_years,@replacement_priority,@replacement_year,@note,@updated_at)
      ON CONFLICT(device_id) DO UPDATE SET
        clinical_criticality=excluded.clinical_criticality,
        planned_life_years=excluded.planned_life_years,
        replacement_priority=excluded.replacement_priority,
        replacement_year=excluded.replacement_year,
        note=excluded.note,
        updated_at=excluded.updated_at
    `).run({
      device_id:Number(req.params.deviceId),
      clinical_criticality:clamp(p.clinical_criticality || 3,1,5),
      planned_life_years:Math.max(1, Number(p.planned_life_years || 10)),
      replacement_priority:p.replacement_priority || "Bình thường",
      replacement_year:p.replacement_year || null,
      note:p.note || "",
      updated_at:nowSql()
    });
    res.json({ ok:true });
  });

  app.get("/api/lcm/receipts", (_req, res) => {
    const rows = db.prepare(`
      SELECT r.*, dv.name AS device_name, dv.device_code, dv.department_code, d.name AS department_name
      FROM device_receipts r
      JOIN devices dv ON dv.id=r.device_id
      LEFT JOIN departments d ON d.code=dv.department_code
      ORDER BY COALESCE(r.delivery_date,r.created_at) DESC, r.id DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/lcm/receipts", (req, res) => {
    const p = req.body || {};
    if (!p.device_id) return res.status(400).json({ error:"Thiếu thiết bị." });
    const info = db.prepare(`
      INSERT INTO device_receipts (device_id,contract_no,supplier,delivery_date,installation_date,acceptance_date,training_date,handover_date,receiver,co_cq_status,training_status,status,note,created_at,updated_at)
      VALUES (@device_id,@contract_no,@supplier,@delivery_date,@installation_date,@acceptance_date,@training_date,@handover_date,@receiver,@co_cq_status,@training_status,@status,@note,@created_at,@updated_at)
    `).run({
      device_id:Number(p.device_id), contract_no:p.contract_no||"", supplier:p.supplier||"", delivery_date:p.delivery_date||"",
      installation_date:p.installation_date||"", acceptance_date:p.acceptance_date||"", training_date:p.training_date||"",
      handover_date:p.handover_date||"", receiver:p.receiver||"", co_cq_status:p.co_cq_status||"Chưa cập nhật",
      training_status:p.training_status||"Chưa thực hiện", status:p.status||"Chuẩn bị tiếp nhận", note:p.note||"",
      created_at:nowSql(), updated_at:nowSql()
    });
    res.json({ id:info.lastInsertRowid });
  });

  app.put("/api/lcm/receipts/:id", (req, res) => {
    const p = req.body || {};
    db.prepare(`UPDATE device_receipts SET
      device_id=@device_id, contract_no=@contract_no, supplier=@supplier, delivery_date=@delivery_date,
      installation_date=@installation_date, acceptance_date=@acceptance_date, training_date=@training_date,
      handover_date=@handover_date, receiver=@receiver, co_cq_status=@co_cq_status, training_status=@training_status,
      status=@status, note=@note, updated_at=@updated_at WHERE id=@id`).run({
      id:Number(req.params.id), device_id:Number(p.device_id), contract_no:p.contract_no||"", supplier:p.supplier||"",
      delivery_date:p.delivery_date||"", installation_date:p.installation_date||"", acceptance_date:p.acceptance_date||"",
      training_date:p.training_date||"", handover_date:p.handover_date||"", receiver:p.receiver||"",
      co_cq_status:p.co_cq_status||"Chưa cập nhật", training_status:p.training_status||"Chưa thực hiện",
      status:p.status||"Chuẩn bị tiếp nhận", note:p.note||"", updated_at:nowSql()
    });
    res.json({ ok:true });
  });

  app.delete("/api/lcm/receipts/:id", (req, res) => {
    db.prepare("DELETE FROM device_receipts WHERE id=?").run(Number(req.params.id));
    res.json({ ok:true });
  });

  app.get("/api/lcm/transfers", (_req, res) => {
    const rows = db.prepare(`
      SELECT t.*, dv.name AS device_name, dv.device_code,
             df.name AS from_department_name, dt.name AS to_department_name
      FROM device_transfers t
      JOIN devices dv ON dv.id=t.device_id
      LEFT JOIN departments df ON df.code=t.from_department
      LEFT JOIN departments dt ON dt.code=t.to_department
      ORDER BY t.transfer_date DESC, t.id DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/lcm/transfers", (req, res) => {
    const p = req.body || {};
    const deviceId = Number(p.device_id);
    const dv = db.prepare("SELECT department_code,location FROM devices WHERE id=?").get(deviceId);
    if (!dv) return res.status(404).json({ error:"Không tìm thấy thiết bị." });
    if (!p.to_department) return res.status(400).json({ error:"Thiếu khoa nhận." });
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO device_transfers (device_id,transfer_date,from_department,to_department,from_location,to_location,reason,approved_by,receiver,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(deviceId,p.transfer_date||new Date().toISOString().slice(0,10),dv.department_code,p.to_department,dv.location||"",p.to_location||"",p.reason||"",p.approved_by||"",p.receiver||"",p.note||"",nowSql());
      db.prepare("UPDATE devices SET department_code=?, location=? WHERE id=?").run(p.to_department,p.to_location||dv.location||"",deviceId);
      return info.lastInsertRowid;
    });
    res.json({ id:tx() });
  });

  app.delete("/api/lcm/transfers/:id", (req, res) => {
    return res.status(400).json({ error:"Không xóa lịch sử điều chuyển. Hãy lập phiếu điều chuyển ngược nếu cần hiệu chỉnh." });
  });

  app.get("/api/lcm/disposals", (_req, res) => {
    const rows = db.prepare(`
      SELECT x.*, dv.name AS device_name, dv.device_code, dv.department_code, d.name AS department_name
      FROM device_disposals x
      JOIN devices dv ON dv.id=x.device_id
      LEFT JOIN departments d ON d.code=dv.department_code
      ORDER BY COALESCE(x.proposal_date,x.created_at) DESC, x.id DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/lcm/disposals", (req, res) => {
    const p = req.body || {};
    if (!p.device_id) return res.status(400).json({ error:"Thiếu thiết bị." });
    const info = db.prepare(`
      INSERT INTO device_disposals (device_id,proposal_date,reason,condition_summary,appraisal_date,decision_no,decision_date,disposal_method,value_recovered,status,note,created_at,updated_at)
      VALUES (@device_id,@proposal_date,@reason,@condition_summary,@appraisal_date,@decision_no,@decision_date,@disposal_method,@value_recovered,@status,@note,@created_at,@updated_at)
    `).run({
      device_id:Number(p.device_id), proposal_date:p.proposal_date||"", reason:p.reason||"", condition_summary:p.condition_summary||"",
      appraisal_date:p.appraisal_date||"", decision_no:p.decision_no||"", decision_date:p.decision_date||"",
      disposal_method:p.disposal_method||"", value_recovered:Number(p.value_recovered||0), status:p.status||"Đề nghị thanh lý",
      note:p.note||"", created_at:nowSql(), updated_at:nowSql()
    });
    if ((p.status||"") === "Đã thanh lý") db.prepare("UPDATE devices SET status='Ngừng hoạt động' WHERE id=?").run(Number(p.device_id));
    res.json({ id:info.lastInsertRowid });
  });

  app.put("/api/lcm/disposals/:id", (req, res) => {
    const p = req.body || {};
    db.prepare(`UPDATE device_disposals SET
      device_id=@device_id, proposal_date=@proposal_date, reason=@reason, condition_summary=@condition_summary,
      appraisal_date=@appraisal_date, decision_no=@decision_no, decision_date=@decision_date,
      disposal_method=@disposal_method, value_recovered=@value_recovered, status=@status, note=@note, updated_at=@updated_at
      WHERE id=@id`).run({
      id:Number(req.params.id), device_id:Number(p.device_id), proposal_date:p.proposal_date||"", reason:p.reason||"",
      condition_summary:p.condition_summary||"", appraisal_date:p.appraisal_date||"", decision_no:p.decision_no||"",
      decision_date:p.decision_date||"", disposal_method:p.disposal_method||"", value_recovered:Number(p.value_recovered||0),
      status:p.status||"Đề nghị thanh lý", note:p.note||"", updated_at:nowSql()
    });
    if ((p.status||"") === "Đã thanh lý") db.prepare("UPDATE devices SET status='Ngừng hoạt động' WHERE id=?").run(Number(p.device_id));
    res.json({ ok:true });
  });

  app.delete("/api/lcm/disposals/:id", (req, res) => {
    const row = db.prepare("SELECT status FROM device_disposals WHERE id=?").get(Number(req.params.id));
    if (row && row.status === "Đã thanh lý") return res.status(400).json({ error:"Hồ sơ đã thanh lý không được xóa." });
    db.prepare("DELETE FROM device_disposals WHERE id=?").run(Number(req.params.id));
    res.json({ ok:true });
  });

  app.get("/api/lcm/timeline/:deviceId", (req, res) => {
    const id = Number(req.params.deviceId);
    const events = [];
    const push = (type, date, title, detail, status) => {
      if (date) events.push({ type, date, title, detail:detail||"", status:status||"" });
    };

    db.prepare("SELECT * FROM device_receipts WHERE device_id=?").all(id).forEach(x => push("Tiếp nhận",x.delivery_date||x.created_at,"Tiếp nhận / nghiệm thu",`${x.supplier||''} ${x.contract_no||''}`.trim(),x.status));
    db.prepare("SELECT * FROM device_transfers WHERE device_id=?").all(id).forEach(x => push("Điều chuyển",x.transfer_date,`Điều chuyển ${x.from_department||''} → ${x.to_department||''}`,x.reason,x.receiver));
    db.prepare("SELECT * FROM incidents WHERE device_id=?").all(id).forEach(x => push("Sự cố",x.incident_datetime,"Ghi nhận sự cố",x.description,x.status));
    db.prepare("SELECT * FROM repairs WHERE device_id=?").all(id).forEach(x => push("Sửa chữa",x.repair_date||x.received_at,"Sửa chữa",x.work||x.issue,x.processing_status||x.status_after));
    db.prepare("SELECT * FROM maintenances WHERE device_id=?").all(id).forEach(x => push("Bảo dưỡng",x.maintenance_date,"Bảo dưỡng",x.content,x.result));
    db.prepare("SELECT * FROM inspections WHERE device_id=?").all(id).forEach(x => push("Kiểm định",x.inspection_date,x.type||"Kiểm định/hiệu chuẩn",x.organization,x.result));
    db.prepare("SELECT * FROM device_disposals WHERE device_id=?").all(id).forEach(x => push("Thanh lý",x.proposal_date||x.created_at,"Hồ sơ thanh lý",x.reason,x.status));

    events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    res.json(events);
  });

  console.log("LCM module loaded: receipts, transfers, disposals, risk & lifecycle metrics");
};
