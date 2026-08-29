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
      status_before_disposal TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_device ON device_receipts(device_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_device ON device_transfers(device_id);
    CREATE INDEX IF NOT EXISTS idx_disposals_device ON device_disposals(device_id);
  `);

  try { db.prepare("ALTER TABLE device_disposals ADD COLUMN status_before_disposal TEXT").run(); } catch (_) {}

  const nowSql = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const plusDaysISO = n => new Date(Date.now() + Number(n || 0) * 86400000).toISOString().slice(0, 10);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n || 0)));

  const daysFromToday = value => {
    if (!value) return null;
    const t = new Date(`${todayISO()}T00:00:00`).getTime();
    const v = new Date(`${String(value).slice(0,10)}T00:00:00`).getTime();
    if (!Number.isFinite(v)) return null;
    return Math.round((v - t) / 86400000);
  };

  function receiptCompletion(row) {
    const checks = [
      Boolean(row.delivery_date),
      Boolean(row.installation_date),
      Boolean(row.acceptance_date),
      Boolean(row.training_date) || row.training_status === "Đã đào tạo",
      Boolean(row.handover_date),
      ["Đầy đủ", "Không áp dụng"].includes(row.co_cq_status)
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  function lifecycleStage(row) {
    if (row.disposal_status && row.disposal_status !== "Hủy") {
      return row.disposal_status === "Đã thanh lý" ? "Đã thanh lý" : "Thanh lý";
    }
    if (row.receipt_status && !["Đã bàn giao", "Hoàn thành"].includes(row.receipt_status)) return "Tiếp nhận";
    if (row.status === "Chờ sửa chữa") return "Sửa chữa";
    if (row.status === "Chờ thanh lý") return "Thanh lý";
    if (row.status === "Ngừng hoạt động") return "Ngừng khai thác";
    return "Khai thác";
  }

  function computeMetrics(row) {
    const currentYear = new Date().getFullYear();
    const age = row.year_in_use ? Math.max(0, currentYear - Number(row.year_in_use)) : 0;
    const plannedLife = Math.max(1, Number(row.planned_life_years || 10));
    const criticality = clamp(row.clinical_criticality || 3, 1, 5);
    const repairCount = Number(row.repair_count_12m || 0);
    const repairCost = Number(row.repair_cost_total || 0);
    const assetCost = Math.max(0, Number(row.cost || 0));
    const repairCostRatio = assetCost > 0 ? (repairCost / assetCost) * 100 : 0;
    const downtimeHours = Number(row.downtime_hours_12m || 0);
    const availability = Math.max(0, 100 - (downtimeHours / (365 * 24)) * 100);

    const maintDays = daysFromToday(row.next_maintenance);
    const inspDays = daysFromToday(row.next_inspection);
    const warrantyDays = daysFromToday(row.warranty_end);

    const components = {
      age: Math.round(clamp((age / plannedLife) * 20, 0, 20)),
      repairs: Math.round(clamp(repairCount * 3, 0, 15)),
      status: row.status === "Ngừng hoạt động" ? 20
        : row.status === "Chờ thanh lý" ? 20
        : row.status === "Chờ sửa chữa" ? 18 : 0,
      maintenance: maintDays !== null && maintDays < 0 ? 10 : maintDays !== null && maintDays <= 30 ? 4 : 0,
      inspection: inspDays !== null && inspDays < 0 ? 10 : inspDays !== null && inspDays <= 30 ? 4 : 0,
      criticality: Math.round(((criticality - 1) / 4) * 10),
      quality: row.quality_total_score === null || row.quality_total_score === undefined
        ? 0 : Math.round(clamp((100 - Number(row.quality_total_score)) * 0.1, 0, 10)),
      repair_cost: assetCost > 0 ? Math.round(clamp(repairCostRatio / 10, 0, 5)) : 0
    };

    const risk = Math.round(clamp(Object.values(components).reduce((a,b)=>a+b,0), 0, 100));
    const riskLevel = risk >= 70 ? "Cao" : risk >= 40 ? "Trung bình" : "Thấp";

    let recommendation = "Tiếp tục khai thác";
    if (row.disposal_status === "Đã thanh lý") recommendation = "Đã kết thúc vòng đời";
    else if (row.status === "Chờ thanh lý") recommendation = "Hoàn thiện hồ sơ thẩm định/thanh lý";
    else if (row.status === "Ngừng hoạt động" || risk >= 80) recommendation = "Ưu tiên đánh giá thay thế/thanh lý";
    else if (risk >= 60) recommendation = "Lập kế hoạch sửa chữa lớn hoặc thay thế";
    else if (risk >= 40) recommendation = "Tăng cường theo dõi và bảo dưỡng";

    return {
      ...row,
      age_years: age,
      lifecycle_stage: lifecycleStage(row),
      availability_percent: Number(availability.toFixed(1)),
      risk_score: risk,
      risk_level: riskLevel,
      risk_components: components,
      recommendation,
      repair_cost_total: repairCost,
      repair_cost_ratio_percent: Number(repairCostRatio.toFixed(1)),
      downtime_hours_12m: Number(downtimeHours.toFixed(1)),
      days_to_maintenance: maintDays,
      days_to_inspection: inspDays,
      days_to_warranty: warrantyDays
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
        qr.total_score AS quality_total_score, qr.grade AS quality_grade,
        (SELECT COUNT(*) FROM repairs r
          WHERE r.device_id=dv.id
            AND date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) >= date('now','-12 months')) AS repair_count_12m,
        (SELECT COUNT(*) FROM repairs r WHERE r.device_id=dv.id) AS repair_count_total,
        COALESCE((SELECT SUM(COALESCE(r.cost,0)) FROM repairs r WHERE r.device_id=dv.id),0) AS repair_cost_total,
        COALESCE((SELECT SUM(
          CASE
            WHEN COALESCE(NULLIF(r.received_at,''), r.repair_date) IS NULL THEN 0
            WHEN date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) < date('now','-12 months') THEN 0
            WHEN COALESCE(NULLIF(r.completed_at,''),'') <> ''
              THEN MAX(0, (julianday(r.completed_at)-julianday(COALESCE(NULLIF(r.received_at,''), r.repair_date)))*24)
            WHEN COALESCE(r.processing_status,'') IN ('Đang xử lý','Chờ linh kiện')
              THEN MAX(0, (julianday('now')-julianday(COALESCE(NULLIF(r.received_at,''), r.repair_date)))*24)
            ELSE 0
          END
        ) FROM repairs r WHERE r.device_id=dv.id),0) AS downtime_hours_12m,
        (SELECT m.next_date FROM maintenances m
          WHERE m.device_id=dv.id AND COALESCE(m.next_date,'') <> ''
          ORDER BY date(COALESCE(NULLIF(m.maintenance_date,''),m.next_date)) DESC, m.id DESC LIMIT 1) AS next_maintenance,
        (SELECT i.next_date FROM inspections i
          WHERE i.device_id=dv.id AND COALESCE(i.next_date,'') <> ''
          ORDER BY date(COALESCE(NULLIF(i.inspection_date,''),i.next_date)) DESC, i.id DESC LIMIT 1) AS next_inspection,
        COALESCE((SELECT SUM(COALESCE(u.value,0)) FROM usage_reports u
          WHERE u.device_id=dv.id AND u.year=CAST(strftime('%Y','now') AS INTEGER)),0) AS usage_current_year,
        (SELECT r.status FROM device_receipts r WHERE r.device_id=dv.id ORDER BY r.id DESC LIMIT 1) AS receipt_status,
        (SELECT x.status FROM device_disposals x WHERE x.device_id=dv.id ORDER BY x.id DESC LIMIT 1) AS disposal_status
      FROM devices dv
      LEFT JOIN departments d ON d.code=dv.department_code
      LEFT JOIN device_groups g ON g.code=dv.group_code
      LEFT JOIN device_lcm_profiles p ON p.device_id=dv.id
      LEFT JOIN quality_ratings qr ON qr.device_id=dv.id
      ${whereSql}
      ORDER BY dv.department_code, dv.name
    `).all(...params);
    return rows.map(computeMetrics);
  }

  function buildAlerts(devices) {
    const today = todayISO();
    const d30 = plusDaysISO(30);
    const sortDate = key => (a,b) => String(a[key] || "9999-12-31").localeCompare(String(b[key] || "9999-12-31"));
    return {
      high_risk: [...devices].filter(x=>x.risk_level==="Cao").sort((a,b)=>b.risk_score-a.risk_score).slice(0,20),
      maintenance_overdue: devices.filter(x=>x.next_maintenance && x.next_maintenance < today).sort(sortDate("next_maintenance")),
      maintenance_due_30: devices.filter(x=>x.next_maintenance && x.next_maintenance >= today && x.next_maintenance <= d30).sort(sortDate("next_maintenance")),
      inspection_overdue: devices.filter(x=>x.next_inspection && x.next_inspection < today).sort(sortDate("next_inspection")),
      inspection_due_30: devices.filter(x=>x.next_inspection && x.next_inspection >= today && x.next_inspection <= d30).sort(sortDate("next_inspection")),
      warranty_expired: devices.filter(x=>x.warranty_end && x.warranty_end < today).sort(sortDate("warranty_end")),
      warranty_due_30: devices.filter(x=>x.warranty_end && x.warranty_end >= today && x.warranty_end <= d30).sort(sortDate("warranty_end")),
      receipt_pending: db.prepare(`
        SELECT r.*, dv.name AS device_name, dv.device_code, dv.department_code
        FROM device_receipts r JOIN devices dv ON dv.id=r.device_id
        WHERE r.status NOT IN ('Đã bàn giao','Hoàn thành')
        ORDER BY COALESCE(r.delivery_date,r.created_at) ASC
      `).all().map(x=>({...x, completion_percent:receiptCompletion(x)})),
      disposal_pending: db.prepare(`
        SELECT x.*, dv.name AS device_name, dv.device_code, dv.department_code
        FROM device_disposals x JOIN devices dv ON dv.id=x.device_id
        WHERE x.status NOT IN ('Đã thanh lý','Hủy')
        ORDER BY COALESCE(x.proposal_date,x.created_at) ASC
      `).all()
    };
  }

  app.get("/api/lcm/summary", (_req, res) => {
    const devices = getDeviceMetrics();
    const alerts = buildAlerts(devices);
    const counts = {
      total: devices.length,
      active: devices.filter(x => x.status === "Đang hoạt động").length,
      waiting_repair: devices.filter(x => x.status === "Chờ sửa chữa").length,
      waiting_disposal: devices.filter(x => x.status === "Chờ thanh lý").length,
      stopped: devices.filter(x => x.status === "Ngừng hoạt động").length,
      high_risk: devices.filter(x => x.risk_level === "Cao").length,
      medium_risk: devices.filter(x => x.risk_level === "Trung bình").length,
      maintenance_overdue: alerts.maintenance_overdue.length,
      maintenance_due_30: alerts.maintenance_due_30.length,
      inspection_overdue: alerts.inspection_overdue.length,
      inspection_due_30: alerts.inspection_due_30.length,
      warranty_expired: alerts.warranty_expired.length,
      warranty_due_30: alerts.warranty_due_30.length,
      receipt_pending: alerts.receipt_pending.length,
      disposal_pending: alerts.disposal_pending.length,
      transfers_ytd: db.prepare("SELECT COUNT(*) c FROM device_transfers WHERE substr(transfer_date,1,4)=strftime('%Y','now')").get().c
    };
    const riskTop = [...devices].sort((a,b)=>b.risk_score-a.risk_score).slice(0,10);
    res.json({ ...counts, risk_top: riskTop });
  });

  app.get("/api/lcm/alerts", (_req, res) => {
    const devices = getDeviceMetrics();
    res.json(buildAlerts(devices));
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
    `).all().map(r=>({...r, completion_percent:receiptCompletion(r)}));
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
    const newLoc = String(p.to_location || "").trim();
    const oldLoc = String(dv.location || "").trim();
    if (String(p.to_department) === String(dv.department_code) && (!newLoc || newLoc === oldLoc)) {
      return res.status(400).json({ error:"Khoa và vị trí không thay đổi. Không cần lập phiếu điều chuyển." });
    }
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO device_transfers (device_id,transfer_date,from_department,to_department,from_location,to_location,reason,approved_by,receiver,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(deviceId,p.transfer_date||todayISO(),dv.department_code,p.to_department,dv.location||"",newLoc,p.reason||"",p.approved_by||"",p.receiver||"",p.note||"",nowSql());
      db.prepare("UPDATE devices SET department_code=?, location=? WHERE id=?").run(p.to_department,newLoc||oldLoc,deviceId);
      return info.lastInsertRowid;
    });
    res.json({ id:tx() });
  });

  app.delete("/api/lcm/transfers/:id", (_req, res) => {
    return res.status(400).json({ error:"Không xóa lịch sử điều chuyển. Hãy lập phiếu điều chuyển ngược nếu cần hiệu chỉnh." });
  });

  function deviceStatusBeforeDisposal(deviceId) {
    const row = db.prepare("SELECT status FROM devices WHERE id=?").get(deviceId);
    return row?.status || "Đang hoạt động";
  }

  function applyDisposalStatus(deviceId, disposalStatus, beforeStatus) {
    if (disposalStatus === "Đã thanh lý") {
      db.prepare("UPDATE devices SET status='Ngừng hoạt động' WHERE id=?").run(deviceId);
    } else if (disposalStatus === "Hủy") {
      const restore = beforeStatus && beforeStatus !== "Chờ thanh lý" ? beforeStatus : "Đang hoạt động";
      db.prepare("UPDATE devices SET status=? WHERE id=? AND status='Chờ thanh lý'").run(restore, deviceId);
    } else {
      db.prepare("UPDATE devices SET status='Chờ thanh lý' WHERE id=? AND status<>'Ngừng hoạt động'").run(deviceId);
    }
  }

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
    const deviceId = Number(p.device_id);
    const before = deviceStatusBeforeDisposal(deviceId);
    const status = p.status || "Đề nghị thanh lý";
    const info = db.prepare(`
      INSERT INTO device_disposals (device_id,proposal_date,reason,condition_summary,appraisal_date,decision_no,decision_date,disposal_method,value_recovered,status,status_before_disposal,note,created_at,updated_at)
      VALUES (@device_id,@proposal_date,@reason,@condition_summary,@appraisal_date,@decision_no,@decision_date,@disposal_method,@value_recovered,@status,@status_before_disposal,@note,@created_at,@updated_at)
    `).run({
      device_id:deviceId, proposal_date:p.proposal_date||"", reason:p.reason||"", condition_summary:p.condition_summary||"",
      appraisal_date:p.appraisal_date||"", decision_no:p.decision_no||"", decision_date:p.decision_date||"",
      disposal_method:p.disposal_method||"", value_recovered:Number(p.value_recovered||0), status,
      status_before_disposal:before, note:p.note||"", created_at:nowSql(), updated_at:nowSql()
    });
    applyDisposalStatus(deviceId, status, before);
    res.json({ id:info.lastInsertRowid });
  });

  app.put("/api/lcm/disposals/:id", (req, res) => {
    const p = req.body || {};
    const old = db.prepare("SELECT * FROM device_disposals WHERE id=?").get(Number(req.params.id));
    if (!old) return res.status(404).json({error:"Không tìm thấy hồ sơ thanh lý."});
    const deviceId = Number(p.device_id || old.device_id);
    const status = p.status || "Đề nghị thanh lý";
    const before = old.status_before_disposal || deviceStatusBeforeDisposal(deviceId);
    db.prepare(`UPDATE device_disposals SET
      device_id=@device_id, proposal_date=@proposal_date, reason=@reason, condition_summary=@condition_summary,
      appraisal_date=@appraisal_date, decision_no=@decision_no, decision_date=@decision_date,
      disposal_method=@disposal_method, value_recovered=@value_recovered, status=@status,
      status_before_disposal=COALESCE(NULLIF(status_before_disposal,''),@status_before_disposal),
      note=@note, updated_at=@updated_at
      WHERE id=@id`).run({
      id:Number(req.params.id), device_id:deviceId, proposal_date:p.proposal_date||"", reason:p.reason||"",
      condition_summary:p.condition_summary||"", appraisal_date:p.appraisal_date||"", decision_no:p.decision_no||"",
      decision_date:p.decision_date||"", disposal_method:p.disposal_method||"", value_recovered:Number(p.value_recovered||0),
      status, status_before_disposal:before, note:p.note||"", updated_at:nowSql()
    });
    applyDisposalStatus(deviceId, status, before);
    res.json({ ok:true });
  });

  app.delete("/api/lcm/disposals/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM device_disposals WHERE id=?").get(Number(req.params.id));
    if (row && row.status === "Đã thanh lý") return res.status(400).json({ error:"Hồ sơ đã thanh lý không được xóa." });
    if (row) {
      db.prepare("DELETE FROM device_disposals WHERE id=?").run(Number(req.params.id));
      const remaining = db.prepare("SELECT COUNT(*) c FROM device_disposals WHERE device_id=? AND status NOT IN ('Đã thanh lý','Hủy')").get(row.device_id).c;
      if (!remaining) applyDisposalStatus(row.device_id, "Hủy", row.status_before_disposal);
    }
    res.json({ ok:true });
  });

  app.get("/api/lcm/timeline/:deviceId", (req, res) => {
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
      push("Bàn giao",x.handover_date,"Bàn giao đưa vào sử dụng",x.receiver,x.status);
    });
    db.prepare("SELECT * FROM device_transfers WHERE device_id=?").all(id).forEach(x => push("Điều chuyển",x.transfer_date,`Điều chuyển ${x.from_department||''} → ${x.to_department||''}`,x.reason,x.receiver));
    db.prepare("SELECT * FROM incidents WHERE device_id=?").all(id).forEach(x => push("Sự cố",x.incident_datetime,"Ghi nhận sự cố",x.description,x.status));
    db.prepare("SELECT * FROM repairs WHERE device_id=?").all(id).forEach(x => push("Sửa chữa",x.repair_date||x.received_at,"Sửa chữa",x.work||x.issue,x.processing_status||x.status_after));
    db.prepare("SELECT * FROM maintenances WHERE device_id=?").all(id).forEach(x => push("Bảo dưỡng",x.maintenance_date,"Bảo dưỡng",x.content,x.result));
    db.prepare("SELECT * FROM inspections WHERE device_id=?").all(id).forEach(x => push("Kiểm định",x.inspection_date,x.type||"Kiểm định/hiệu chuẩn",x.organization,x.result));
    db.prepare("SELECT * FROM device_disposals WHERE device_id=?").all(id).forEach(x => push("Thanh lý",x.proposal_date||x.created_at,"Hồ sơ thanh lý",x.reason,x.status));

    events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    res.json(events);
  });

  console.log("LCM module loaded: lifecycle, alerts, receipts, transfers, disposals, risk & metrics");
};
