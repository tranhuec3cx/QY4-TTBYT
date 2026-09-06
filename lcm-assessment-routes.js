const path = require("path");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");

module.exports = function registerLcmAssessmentRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n || 0)));
  const currentYear = () => new Date().getFullYear();

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

  function reliableAvailabilityRows() {
    const devices = db.prepare("SELECT id, status FROM devices").all();
    const deviceMap = new Map(devices.map(d => [Number(d.id), d]));
    const repairs = db.prepare(`
      SELECT
        r.id, r.device_id, r.received_at, r.repair_date, r.completed_at, r.updated_at,
        r.processing_status, r.status_after,
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
      WHERE date(COALESCE(NULLIF(r.received_at,''), r.repair_date)) >= date('now','-12 months')
    `).all();

    const grouped = new Map();
    repairs.forEach(r => {
      const id = Number(r.device_id);
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(r);
    });

    const now = Date.now();
    const yearHours = 365 * 24;
    return devices.map(device => {
      const rows = grouped.get(Number(device.id)) || [];
      const deviceIsActive = String(device.status || "").trim() === "Đang hoạt động";
      let downtimeHours = 0;
      let excludedUnreliableCompletion = 0;

      for (const r of rows) {
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
            const looksLikeAdministrativeClose = deviceIsActive && durationMs > 24 * 60 * 60 * 1000 && sameMoment(completed, updatedAt);
            if (looksLikeAdministrativeClose) {
              excludedUnreliableCompletion += 1;
              continue;
            }
            downtimeHours += durationMs / 3600000;
            continue;
          }
          excludedUnreliableCompletion += 1;
          continue;
        }

        if (isOpenRepair && !deviceIsActive) {
          downtimeHours += Math.max(0, now - start) / 3600000;
        }
      }

      const availability = Math.max(0, Math.min(100, 100 - (downtimeHours / yearHours) * 100));
      return {
        device_id: Number(device.id),
        availability_percent: Number(availability.toFixed(1)),
        downtime_hours_12m: Number(downtimeHours.toFixed(1)),
        repair_count_12m: rows.length,
        excluded_unreliable_completion: excludedUnreliableCompletion
      };
    });
  }

  app.get("/api/lcm/assessment-availability", (_req, res) => {
    res.json(reliableAvailabilityRows());
  });

  function rowsBase() {
    return db.prepare(`
      SELECT
        dv.id, dv.device_code, dv.insurance_code, dv.name, dv.department_code,
        d.name AS department_name, dv.group_code, g.name AS group_name,
        dv.manufacturer, dv.model, dv.serial, dv.year_in_use, dv.year_manufactured,
        dv.status, dv.quality_level, dv.cost, dv.location,
        COALESCE(p.clinical_criticality,3) AS clinical_criticality,
        COALESCE(p.planned_life_years,10) AS planned_life_years,
        p.replacement_priority AS configured_priority,
        p.replacement_year AS configured_replacement_year,
        qr.total_score AS quality_total_score, qr.grade AS quality_grade,
        (SELECT COUNT(*) FROM repairs r
          WHERE r.device_id=dv.id
            AND date(COALESCE(NULLIF(r.received_at,''),r.repair_date)) >= date('now','-12 months')
        ) AS repair_count_12m,
        COALESCE((SELECT SUM(COALESCE(r.cost,0)) FROM repairs r WHERE r.device_id=dv.id),0) AS repair_cost_total
      FROM devices dv
      LEFT JOIN departments d ON d.code=dv.department_code
      LEFT JOIN device_groups g ON g.code=dv.group_code
      LEFT JOIN device_lcm_profiles p ON p.device_id=dv.id
      LEFT JOIN quality_ratings qr ON qr.device_id=dv.id
      ORDER BY dv.department_code,dv.name
    `).all();
  }

  function analyze(row, availabilityMap) {
    const year = currentYear();
    const age = row.year_in_use ? Math.max(0, year - Number(row.year_in_use)) : 0;
    const life = Math.max(1, Number(row.planned_life_years || 10));
    const lifeEnd = row.year_in_use ? Number(row.year_in_use) + life : null;
    const repairCount = Number(row.repair_count_12m || 0);
    const repairCost = Number(row.repair_cost_total || 0);
    const assetCost = Math.max(0, Number(row.cost || 0));
    const costRatio = assetCost > 0 ? repairCost / assetCost * 100 : 0;
    const reliable = availabilityMap.get(Number(row.id)) || { availability_percent: 100, downtime_hours_12m: 0 };
    const availability = Number(reliable.availability_percent || 0);
    const criticality = clamp(row.clinical_criticality || 3, 1, 5);

    const qualityPenalty = row.quality_total_score !== null && row.quality_total_score !== undefined
      ? clamp((100 - Number(row.quality_total_score)) * 0.1, 0, 10)
      : clamp((Number(row.quality_level || 3) - 1) * 2.5, 0, 10);

    const components = {
      age: Math.round(clamp((age / life) * 25, 0, 25)),
      status: row.status === "Ngừng hoạt động" || row.status === "Chờ thanh lý" ? 20 : row.status === "Chờ sửa chữa" ? 12 : 0,
      repairs: Math.round(clamp(repairCount * 3, 0, 15)),
      repair_cost: assetCost > 0 ? Math.round(clamp(costRatio / 2, 0, 15)) : 0,
      criticality: Math.round(((criticality - 1) / 4) * 10),
      quality: Math.round(qualityPenalty),
      availability: availability < 90 ? 5 : availability < 95 ? 4 : availability < 98 ? 2 : 0
    };
    const score = Math.round(clamp(Object.values(components).reduce((a,b)=>a+b,0), 0, 100));
    const priority = score >= 80 ? "Khẩn" : score >= 65 ? "Cao" : score >= 50 ? "Trung bình" : "Theo dõi";

    let suggestedYear = null;
    let basis = "Gợi ý từ dữ liệu vòng đời";
    if (row.configured_replacement_year) {
      suggestedYear = Math.max(year, Number(row.configured_replacement_year));
      basis = "Năm thay mới đã cấu hình";
    } else {
      if (row.status === "Ngừng hoạt động" || row.status === "Chờ thanh lý" || score >= 80) suggestedYear = year;
      else if (score >= 65) suggestedYear = year + 1;
      else if (score >= 50) suggestedYear = year + 3;
      else if (score >= 35) suggestedYear = year + 5;
      if (lifeEnd && lifeEnd <= year + 5) suggestedYear = suggestedYear ? Math.min(suggestedYear, Math.max(year, lifeEnd)) : Math.max(year, lifeEnd);
    }

    let horizon = "LATER";
    if (suggestedYear !== null) {
      const delta = suggestedYear - year;
      horizon = delta <= 1 ? "1Y" : delta <= 3 ? "3Y" : delta <= 5 ? "5Y" : "LATER";
    }

    const reasons = [];
    if (age >= life) reasons.push(`Đã đạt/vượt thời gian sử dụng dự kiến ${life} năm`);
    else if (age / life >= 0.8) reasons.push(`Đã sử dụng khoảng ${Math.round(age/life*100)}% thời gian dự kiến`);
    if (row.status === "Ngừng hoạt động") reasons.push("Thiết bị đang ngừng hoạt động");
    else if (row.status === "Chờ thanh lý") reasons.push("Thiết bị đang chờ thanh lý");
    else if (row.status === "Chờ sửa chữa") reasons.push("Thiết bị đang chờ sửa chữa");
    if (repairCount >= 3) reasons.push(`${repairCount} lần sửa chữa trong 12 tháng`);
    if (assetCost > 0 && costRatio >= 20) reasons.push(`Tiền sửa chữa bằng ${costRatio.toFixed(1)}% nguyên giá`);
    if (availability < 95) reasons.push(`Khả năng hoạt động 12 tháng ${availability.toFixed(1)}%`);
    if (row.quality_total_score !== null && row.quality_total_score !== undefined && Number(row.quality_total_score) < 70) reasons.push(`Điểm chất lượng ${Number(row.quality_total_score).toFixed(0)}/100`);
    if (criticality >= 4) reasons.push(`Mức độ quan trọng lâm sàng ${criticality}/5`);
    if (!reasons.length) reasons.push("Tiếp tục theo dõi theo tuổi thiết bị và tình hình sử dụng hiện có");

    return {
      ...row,
      age_years: age,
      life_end_year: lifeEnd,
      availability_percent: Number(availability.toFixed(1)),
      downtime_hours_12m: Number(reliable.downtime_hours_12m || 0),
      repair_cost_ratio_percent: Number(costRatio.toFixed(1)),
      replacement_score: score,
      replacement_priority: priority,
      replacement_components: components,
      suggested_replacement_year: suggestedYear,
      planning_basis: basis,
      horizon,
      reasons
    };
  }

  function getPlan() {
    const availabilityMap = new Map(reliableAvailabilityRows().map(x => [Number(x.device_id), x]));
    return rowsBase().map(row => analyze(row, availabilityMap)).sort((a,b) =>
      Number(b.replacement_score) - Number(a.replacement_score) ||
      Number(a.suggested_replacement_year || 9999) - Number(b.suggested_replacement_year || 9999) ||
      String(a.department_code || "").localeCompare(String(b.department_code || ""))
    );
  }

  function horizonMatches(rowHorizon, filter) {
    if (filter === "ALL") return true;
    if (filter === "1Y") return rowHorizon === "1Y";
    if (filter === "3Y") return rowHorizon === "1Y" || rowHorizon === "3Y";
    if (filter === "5Y") return ["1Y", "3Y", "5Y"].includes(rowHorizon);
    return rowHorizon === "LATER";
  }

  function filterPlan(rows, query = {}) {
    const dep = String(query.department_code || "ALL");
    const horizon = String(query.horizon || "ALL");
    const priority = String(query.priority || "ALL");
    return rows.filter(x =>
      (dep === "ALL" || x.department_code === dep) &&
      horizonMatches(x.horizon, horizon) &&
      (priority === "ALL" || x.replacement_priority === priority)
    );
  }

  function summarize(rows) {
    const one = rows.filter(x => x.horizon === "1Y");
    const three = rows.filter(x => ["1Y", "3Y"].includes(x.horizon));
    const five = rows.filter(x => ["1Y", "3Y", "5Y"].includes(x.horizon));
    const later = rows.filter(x => x.horizon === "LATER");
    const sumCost = xs => xs.reduce((s,x)=>s+Number(x.cost||0),0);
    return {
      current_year: currentYear(),
      within_1y: one.length,
      within_3y: three.length,
      within_5y: five.length,
      later: later.length,
      reference_cost_1y: sumCost(one),
      reference_cost_3y: sumCost(three),
      reference_cost_5y: sumCost(five),
      note: "Nguyên giá chỉ dùng để tham khảo, không phải dự toán mua sắm thay mới."
    };
  }

  app.get("/api/lcm/replacement-plan-v2", (req, res) => {
    const rows = filterPlan(getPlan(), req.query || {});
    res.json({ summary: summarize(rows), rows });
  });

  app.get("/api/lcm/replacement-plan-v2.xlsx", async (req, res) => {
    const rows = filterPlan(getPlan(), req.query || {});
    const wb = new ExcelJS.Workbook();
    wb.creator = "BVQY4 - Khoa Trang bị";
    const ws = wb.addWorksheet("Ke hoach thay moi");
    ws.columns = [
      {header:"STT",key:"stt",width:7},
      {header:"Mã thiết bị",key:"code",width:18},
      {header:"Tên thiết bị",key:"name",width:34},
      {header:"Khoa",key:"department",width:15},
      {header:"Model",key:"model",width:20},
      {header:"Serial",key:"serial",width:20},
      {header:"Năm sử dụng",key:"year_in_use",width:13},
      {header:"Đã sử dụng",key:"age",width:12},
      {header:"Thời gian dự kiến",key:"life",width:17},
      {header:"Năm dự kiến thay mới",key:"suggested_year",width:20},
      {header:"Thời hạn",key:"horizon",width:13},
      {header:"Mức ưu tiên",key:"priority",width:14},
      {header:"Điểm ưu tiên",key:"score",width:14},
      {header:"Sửa chữa 12 tháng",key:"repair_count",width:17},
      {header:"Mức hoạt động 12 tháng",key:"availability",width:20},
      {header:"Tiền sửa/Nguyên giá",key:"cost_ratio",width:19},
      {header:"Nguyên giá",key:"cost",width:18},
      {header:"Lý do gợi ý",key:"reasons",width:60},
      {header:"Cơ sở năm thay",key:"basis",width:24}
    ];
    const horizonLabel = h => h === "1Y" ? "≤1 năm" : h === "3Y" ? "≤3 năm" : h === "5Y" ? "≤5 năm" : ">5 năm/Theo dõi";
    rows.forEach((x,i) => ws.addRow({
      stt:i+1, code:x.device_code||x.insurance_code||`TB-${x.id}`, name:x.name,
      department:x.department_code, model:x.model||"", serial:x.serial||"",
      year_in_use:x.year_in_use||"", age:x.age_years, life:x.planned_life_years,
      suggested_year:x.suggested_replacement_year||"", horizon:horizonLabel(x.horizon),
      priority:x.replacement_priority, score:x.replacement_score,
      repair_count:x.repair_count_12m, availability:x.availability_percent/100,
      cost_ratio:x.repair_cost_ratio_percent/100, cost:Number(x.cost||0),
      reasons:x.reasons.join("; "), basis:x.planning_basis
    }));
    ws.getRow(1).font = {bold:true};
    ws.getRow(1).alignment = {vertical:"middle",horizontal:"center",wrapText:true};
    ws.views = [{state:"frozen",ySplit:1}];
    ws.autoFilter = {from:"A1",to:"S1"};
    ws.getColumn("availability").numFmt = "0.0%";
    ws.getColumn("cost_ratio").numFmt = "0.0%";
    ws.getColumn("cost").numFmt = '#,##0';
    ws.eachRow((row,rowNumber) => { if(rowNumber>1) row.alignment={vertical:"top",wrapText:true}; });

    const sum = wb.addWorksheet("Tong hop");
    const s = summarize(rows);
    sum.addRows([
      ["KẾ HOẠCH XEM XÉT THAY MỚI THIẾT BỊ Y TẾ 1 - 3 - 5 NĂM"],
      ["Năm lập kế hoạch",s.current_year],
      ["Trong 1 năm",s.within_1y,s.reference_cost_1y],
      ["Trong 3 năm",s.within_3y,s.reference_cost_3y],
      ["Trong 5 năm",s.within_5y,s.reference_cost_5y],
      ["Sau 5 năm / theo dõi",s.later],
      ["Ghi chú",s.note]
    ]);
    sum.getColumn(1).width=38; sum.getColumn(2).width=18; sum.getColumn(3).width=22;
    sum.getRow(1).font={bold:true,size:14}; sum.mergeCells("A1:C1");
    sum.getColumn(3).numFmt='#,##0';

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="Ke_hoach_xem_xet_thay_moi_TBYT_${currentYear()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  console.log("LCM assessment routes loaded: reliable availability and replacement plan v2");
};
