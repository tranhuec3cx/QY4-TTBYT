const path = require("path");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");

module.exports = function registerLcmReplacementRoutes(app) {
  const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const clamp = (n,min,max)=>Math.max(min,Math.min(max,Number(n||0)));
  const currentYear = () => new Date().getFullYear();

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
        COALESCE((SELECT SUM(COALESCE(r.cost,0)) FROM repairs r WHERE r.device_id=dv.id),0) AS repair_cost_total,
        COALESCE((SELECT SUM(
          CASE
            WHEN COALESCE(NULLIF(r.received_at,''),r.repair_date) IS NULL THEN 0
            WHEN date(COALESCE(NULLIF(r.received_at,''),r.repair_date)) < date('now','-12 months') THEN 0
            WHEN COALESCE(NULLIF(r.completed_at,''),'') <> ''
              THEN MAX(0,(julianday(r.completed_at)-julianday(COALESCE(NULLIF(r.received_at,''),r.repair_date)))*24)
            WHEN COALESCE(r.processing_status,'') IN ('Đang xử lý','Chờ linh kiện')
              THEN MAX(0,(julianday('now')-julianday(COALESCE(NULLIF(r.received_at,''),r.repair_date)))*24)
            ELSE 0
          END
        ) FROM repairs r WHERE r.device_id=dv.id),0) AS downtime_hours_12m
      FROM devices dv
      LEFT JOIN departments d ON d.code=dv.department_code
      LEFT JOIN device_groups g ON g.code=dv.group_code
      LEFT JOIN device_lcm_profiles p ON p.device_id=dv.id
      LEFT JOIN quality_ratings qr ON qr.device_id=dv.id
      ORDER BY dv.department_code,dv.name
    `).all();
  }

  function analyze(row) {
    const year = currentYear();
    const age = row.year_in_use ? Math.max(0,year-Number(row.year_in_use)) : 0;
    const life = Math.max(1,Number(row.planned_life_years||10));
    const lifeEnd = row.year_in_use ? Number(row.year_in_use)+life : null;
    const repairCount = Number(row.repair_count_12m||0);
    const repairCost = Number(row.repair_cost_total||0);
    const assetCost = Math.max(0,Number(row.cost||0));
    const costRatio = assetCost>0 ? repairCost/assetCost*100 : 0;
    const downtime = Number(row.downtime_hours_12m||0);
    const availability = Math.max(0,100-(downtime/(365*24))*100);
    const criticality = clamp(row.clinical_criticality||3,1,5);

    const qualityPenalty = row.quality_total_score !== null && row.quality_total_score !== undefined
      ? clamp((100-Number(row.quality_total_score))*0.1,0,10)
      : clamp((Number(row.quality_level||3)-1)*2.5,0,10);

    const components = {
      age: Math.round(clamp((age/life)*25,0,25)),
      status: row.status==="Ngừng hoạt động" || row.status==="Chờ thanh lý" ? 20 : row.status==="Chờ sửa chữa" ? 12 : 0,
      repairs: Math.round(clamp(repairCount*3,0,15)),
      repair_cost: assetCost>0 ? Math.round(clamp(costRatio/2,0,15)) : 0,
      criticality: Math.round(((criticality-1)/4)*10),
      quality: Math.round(qualityPenalty),
      availability: availability<90 ? 5 : availability<95 ? 4 : availability<98 ? 2 : 0
    };
    const score = Math.round(clamp(Object.values(components).reduce((a,b)=>a+b,0),0,100));
    const priority = score>=80 ? "Khẩn" : score>=65 ? "Cao" : score>=50 ? "Trung bình" : "Theo dõi";

    let suggestedYear = null;
    let basis = "Gợi ý LCM";
    if (row.configured_replacement_year) {
      suggestedYear = Math.max(year,Number(row.configured_replacement_year));
      basis = "Năm thay thế đã cấu hình";
    } else {
      if (row.status==="Ngừng hoạt động" || row.status==="Chờ thanh lý" || score>=80) suggestedYear = year;
      else if (score>=65) suggestedYear = year+1;
      else if (score>=50) suggestedYear = year+3;
      else if (score>=35) suggestedYear = year+5;
      if (lifeEnd && lifeEnd<=year+5) suggestedYear = suggestedYear ? Math.min(suggestedYear,Math.max(year,lifeEnd)) : Math.max(year,lifeEnd);
    }

    let horizon = "LATER";
    if (suggestedYear !== null) {
      const delta = suggestedYear-year;
      horizon = delta<=1 ? "1Y" : delta<=3 ? "3Y" : delta<=5 ? "5Y" : "LATER";
    }

    const reasons = [];
    if (age>=life) reasons.push(`Đã đạt/vượt tuổi đời kế hoạch ${life} năm`);
    else if (age/life>=0.8) reasons.push(`Tuổi thiết bị đạt ${Math.round(age/life*100)}% tuổi đời kế hoạch`);
    if (row.status==="Ngừng hoạt động") reasons.push("Thiết bị đang ngừng hoạt động");
    else if (row.status==="Chờ thanh lý") reasons.push("Thiết bị đang chờ thanh lý");
    else if (row.status==="Chờ sửa chữa") reasons.push("Thiết bị đang chờ sửa chữa");
    if (repairCount>=3) reasons.push(`${repairCount} lần sửa chữa trong 12 tháng`);
    if (assetCost>0 && costRatio>=20) reasons.push(`Chi phí sửa chữa bằng ${costRatio.toFixed(1)}% nguyên giá`);
    if (availability<95) reasons.push(`Availability 12 tháng ${availability.toFixed(1)}%`);
    if (row.quality_total_score!==null && row.quality_total_score!==undefined && Number(row.quality_total_score)<70) reasons.push(`Điểm chất lượng ${Number(row.quality_total_score).toFixed(0)}/100`);
    if (criticality>=4) reasons.push(`Mức độ quan trọng lâm sàng ${criticality}/5`);
    if (!reasons.length) reasons.push("Theo dõi theo tuổi đời và dữ liệu khai thác hiện có");

    return {
      ...row,
      age_years: age,
      life_end_year: lifeEnd,
      availability_percent: Number(availability.toFixed(1)),
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
    return rowsBase().map(analyze).sort((a,b)=>
      Number(b.replacement_score)-Number(a.replacement_score) ||
      Number(a.suggested_replacement_year||9999)-Number(b.suggested_replacement_year||9999) ||
      String(a.department_code||"").localeCompare(String(b.department_code||""))
    );
  }

  function summarize(rows) {
    const one = rows.filter(x=>x.horizon==="1Y");
    const three = rows.filter(x=>x.horizon==="3Y");
    const five = rows.filter(x=>x.horizon==="5Y");
    const later = rows.filter(x=>x.horizon==="LATER");
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
      note: "Nguyên giá chỉ dùng làm giá trị tham chiếu, không phải dự toán mua sắm thay thế."
    };
  }

  app.get("/api/lcm/replacement-plan", (_req,res)=>{
    const rows = getPlan();
    res.json({ summary:summarize(rows), rows });
  });

  app.get("/api/lcm/replacement-plan.xlsx", async (_req,res)=>{
    const rows = getPlan();
    const wb = new ExcelJS.Workbook();
    wb.creator = "BVQY4 - Khoa Trang bị";
    const ws = wb.addWorksheet("Ke hoach thay the");
    ws.columns = [
      {header:"STT",key:"stt",width:7},
      {header:"Mã thiết bị",key:"code",width:18},
      {header:"Tên thiết bị",key:"name",width:34},
      {header:"Khoa",key:"department",width:15},
      {header:"Model",key:"model",width:20},
      {header:"Serial",key:"serial",width:20},
      {header:"Năm sử dụng",key:"year_in_use",width:13},
      {header:"Tuổi máy",key:"age",width:11},
      {header:"Tuổi đời KH",key:"life",width:13},
      {header:"Năm dự kiến thay",key:"suggested_year",width:17},
      {header:"Thời hạn",key:"horizon",width:13},
      {header:"Mức ưu tiên",key:"priority",width:14},
      {header:"Điểm kế hoạch",key:"score",width:14},
      {header:"Sửa chữa 12T",key:"repair_count",width:13},
      {header:"Availability",key:"availability",width:13},
      {header:"CP sửa/Nguyên giá",key:"cost_ratio",width:18},
      {header:"Nguyên giá",key:"cost",width:18},
      {header:"Căn cứ gợi ý",key:"reasons",width:60},
      {header:"Cơ sở năm thay",key:"basis",width:22}
    ];
    const horizonLabel = h=>h==="1Y"?"≤1 năm":h==="3Y"?"≤3 năm":h==="5Y"?"≤5 năm":">5 năm/Theo dõi";
    rows.forEach((x,i)=>ws.addRow({
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
    ws.eachRow((row,rowNumber)=>{ if(rowNumber>1) row.alignment={vertical:"top",wrapText:true}; });

    const sum = wb.addWorksheet("Tong hop");
    const s = summarize(rows);
    sum.addRows([
      ["KẾ HOẠCH THAY THẾ THIẾT BỊ Y TẾ 1 - 3 - 5 NĂM"],
      ["Năm lập kế hoạch",s.current_year],
      ["Trong 1 năm",s.within_1y,s.reference_cost_1y],
      ["Trong 3 năm",s.within_3y,s.reference_cost_3y],
      ["Trong 5 năm",s.within_5y,s.reference_cost_5y],
      ["Sau 5 năm / theo dõi",s.later],
      ["Ghi chú",s.note]
    ]);
    sum.getColumn(1).width=34; sum.getColumn(2).width=18; sum.getColumn(3).width=22;
    sum.getRow(1).font={bold:true,size:14}; sum.mergeCells("A1:C1");
    sum.getColumn(3).numFmt='#,##0';

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="Ke_hoach_thay_the_TBYT_${currentYear()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });

  console.log("LCM replacement planning module loaded: 1-3-5 year plan");
};
