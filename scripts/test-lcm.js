const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.QY4_BASE_URL || "http://127.0.0.1:5000";
let pass = 0;
let fail = 0;
let warn = 0;

function out(kind, message, detail = "") {
  const tag = kind === "PASS" ? "[PASS]" : kind === "FAIL" ? "[FAIL]" : "[WARN]";
  console.log(`${tag} ${message}${detail ? ` - ${detail}` : ""}`);
  if (kind === "PASS") pass += 1;
  else if (kind === "FAIL") fail += 1;
  else warn += 1;
}

function getRaw(route, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, BASE);
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 180)}`));
        }
        resolve(body);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
}

async function getJson(route) {
  const raw = await getRaw(route);
  try { return JSON.parse(raw); }
  catch { throw new Error(`Phản hồi không phải JSON hợp lệ: ${raw.slice(0, 160)}`); }
}

function syntaxCheck(relativePath) {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) {
    out("WARN", `Không thấy file ${relativePath}`);
    return;
  }
  const result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  if (result.status === 0) out("PASS", `Cú pháp ${relativePath}`);
  else out("FAIL", `Cú pháp ${relativePath}`, (result.stderr || result.stdout || "Lỗi không rõ").trim().split("\n")[0]);
}

function expectedPriority(score) {
  score = Number(score || 0);
  if (score >= 80) return "Khẩn";
  if (score >= 65) return "Cao";
  if (score >= 50) return "Trung bình";
  return "Theo dõi";
}

function expectedHorizon(year) {
  if (!year) return "LATER";
  const current = new Date().getFullYear();
  const delta = Number(year) - current;
  if (delta <= 1) return "1Y";
  if (delta <= 3) return "3Y";
  if (delta <= 5) return "5Y";
  return "LATER";
}

async function main() {
  console.log("============================================================");
  console.log(" QY4-TTBYT - KIEM TRA NHANH PHAN HE LCM");
  console.log(` Server: ${BASE}`);
  console.log(" Chi doc du lieu, KHONG sua/xoa du lieu.");
  console.log("============================================================\n");

  [
    "bootstrap.js",
    "lcm-routes.js",
    "lcm-profile-routes.js",
    "lcm-movements-routes.js",
    "lcm-replacement-routes.js",
    "lcm-assessment-routes.js",
    "public/lcm.js",
    "public/lcm-replacement.js",
    "public/lcm-finance.js",
    "public/lcm-simple.js",
    "public/lcm-movement-ui.js",
    "public/lcm-assessment-ui.js"
  ].forEach(syntaxCheck);

  console.log("\n--- Kiem tra server/API ---");

  try {
    const html = await getRaw("/lcm.html");
    const ok = html.includes("HỒ SƠ VÒNG ĐỜI") && html.includes("BIẾN ĐỘNG") && html.includes("ĐÁNH GIÁ – KẾ HOẠCH");
    ok ? out("PASS", "Trang /lcm.html có đủ 3 tab chính") : out("FAIL", "Trang /lcm.html thiếu tab LCM");
  } catch (e) {
    out("FAIL", "Không truy cập được server 5000", e.message);
    console.log("\nHay chay START-QY4-TTBYT.cmd roi chay lai TEST-LCM.cmd.");
    process.exitCode = 1;
    return;
  }

  try {
    const js = await getRaw("/lcm-replacement.js");
    const ok = js.includes("/api/lcm/replacement-plan-v2") && js.includes("lcm-assessment-ui.js");
    ok ? out("PASS", "Frontend đang dùng kế hoạch thay mới v2") : out("FAIL", "Frontend chưa dùng đúng endpoint/UI đánh giá mới");
  } catch (e) { out("FAIL", "Không đọc được lcm-replacement.js", e.message); }

  let devices = [];
  let availability = [];
  let plan = { summary: {}, rows: [] };

  try {
    devices = await getJson("/api/lcm/devices");
    Array.isArray(devices) ? out("PASS", "API danh sách thiết bị", `${devices.length} thiết bị`) : out("FAIL", "API danh sách thiết bị không trả về mảng");
  } catch (e) { out("FAIL", "API /api/lcm/devices", e.message); }

  try {
    const summary = await getJson("/api/lcm/summary");
    const total = Number(summary.total || 0);
    if (Array.isArray(devices) && devices.length && total !== devices.length) out("FAIL", "Tổng thiết bị không khớp", `summary=${total}, devices=${devices.length}`);
    else out("PASS", "Tổng thiết bị khớp dữ liệu", `${total}`);
    ["high_risk","medium_risk","maintenance_overdue","inspection_overdue"].forEach(k => {
      if (Number(summary[k] || 0) < 0) out("FAIL", `Chỉ số ${k} âm`);
    });
  } catch (e) { out("FAIL", "API /api/lcm/summary", e.message); }

  try {
    availability = await getJson("/api/lcm/assessment-availability");
    if (!Array.isArray(availability)) throw new Error("Không trả về mảng");
    const bad = availability.filter(x => !Number.isFinite(Number(x.availability_percent)) || Number(x.availability_percent) < 0 || Number(x.availability_percent) > 100 || Number(x.downtime_hours_12m || 0) < 0);
    bad.length ? out("FAIL", "Khả năng hoạt động có giá trị bất hợp lý", `${bad.length} thiết bị`) : out("PASS", "Khả năng hoạt động nằm trong 0-100%", `${availability.length} thiết bị`);
    if (devices.length && availability.length !== devices.length) out("WARN", "Số thiết bị của API khả năng hoạt động khác danh mục", `${availability.length}/${devices.length}`);
  } catch (e) { out("FAIL", "API /api/lcm/assessment-availability", e.message); }

  try {
    plan = await getJson("/api/lcm/replacement-plan-v2");
    if (!Array.isArray(plan.rows)) throw new Error("rows không phải mảng");
    out("PASS", "API kế hoạch xem xét thay mới v2", `${plan.rows.length} thiết bị`);

    const rows = plan.rows;
    const count1 = rows.filter(x => x.horizon === "1Y").length;
    const count3 = rows.filter(x => ["1Y","3Y"].includes(x.horizon)).length;
    const count5 = rows.filter(x => ["1Y","3Y","5Y"].includes(x.horizon)).length;
    const later = rows.filter(x => x.horizon === "LATER").length;
    const s = plan.summary || {};
    const summaryOk = Number(s.within_1y) === count1 && Number(s.within_3y) === count3 && Number(s.within_5y) === count5 && Number(s.later) === later;
    summaryOk ? out("PASS", "Mốc 1-3-5 năm tính cộng dồn đúng", `1Y=${count1}, 3Y=${count3}, 5Y=${count5}, later=${later}`)
              : out("FAIL", "Tổng hợp 1-3-5 năm không khớp danh sách", `API=${s.within_1y}/${s.within_3y}/${s.within_5y}/${s.later}; tính lại=${count1}/${count3}/${count5}/${later}`);

    const wrongPriority = rows.filter(x => x.replacement_priority !== expectedPriority(x.replacement_score));
    wrongPriority.length ? out("FAIL", "Mức ưu tiên không khớp điểm", `${wrongPriority.length} thiết bị`) : out("PASS", "Điểm ưu tiên và mức ưu tiên khớp nhau");

    const wrongHorizon = rows.filter(x => x.horizon !== expectedHorizon(x.suggested_replacement_year));
    wrongHorizon.length ? out("FAIL", "Năm dự kiến và nhóm 1-3-5 năm không khớp", `${wrongHorizon.length} thiết bị`) : out("PASS", "Năm dự kiến và nhóm 1-3-5 năm khớp nhau");

    const aMap = new Map((availability || []).map(x => [Number(x.device_id), Number(x.availability_percent)]));
    const mismatch = rows.filter(x => aMap.has(Number(x.id)) && Math.abs(Number(x.availability_percent) - aMap.get(Number(x.id))) > 0.05);
    mismatch.length ? out("FAIL", "Kế hoạch thay mới dùng khác số liệu khả năng hoạt động", `${mismatch.length} thiết bị`) : out("PASS", "Kế hoạch thay mới dùng cùng số liệu khả năng hoạt động");
  } catch (e) { out("FAIL", "API /api/lcm/replacement-plan-v2", e.message); }

  try {
    const movements = await getJson("/api/lcm/movements");
    Array.isArray(movements) ? out("PASS", "API lịch sử biến động", `${movements.length} phiếu`) : out("FAIL", "API lịch sử biến động không trả về mảng");
    const movementSummary = await getJson("/api/lcm/movements/summary");
    movementSummary && movementSummary.counts ? out("PASS", "API tổng hợp biến động") : out("FAIL", "API tổng hợp biến động thiếu dữ liệu");
  } catch (e) { out("FAIL", "API biến động", e.message); }

  console.log("\n============================================================");
  console.log(` KET QUA: PASS ${pass} | WARN ${warn} | FAIL ${fail}`);
  console.log("============================================================");
  if (fail === 0) console.log("LCM: KHONG PHAT HIEN LOI KY THUAT TRONG BO KIEM TRA NHANH.");
  else console.log("LCM: CO LOI CAN KIEM TRA. Gui anh chup man hinh nay cho ChatGPT.");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => {
  console.error("[FAIL] Test bi dung dot ngot:", e);
  process.exitCode = 1;
});
