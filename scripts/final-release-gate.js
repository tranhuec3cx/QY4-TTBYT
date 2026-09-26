const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const jsonMode = process.argv.includes("--json");
const steps = [];
const blockers = [];
const warnings = [];

function runNode(label, scriptPath, args = []) {
  const full = path.join(root, scriptPath);
  if (!fs.existsSync(full)) {
    blockers.push(`Thiếu ${scriptPath}`);
    steps.push({ label, ok:false, skipped:false, code:2, error:"missing script" });
    return false;
  }
  const child = spawnSync(process.execPath, [full, ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  let parsed = null;
  try { parsed = JSON.parse(String(child.stdout || "").trim() || "{}"); } catch {}
  const ok = child.status === 0 && parsed?.ok !== false;
  steps.push({
    label,
    ok,
    skipped:false,
    code:child.status,
    result:parsed,
    stderr:String(child.stderr || "").trim()
  });
  if (!ok) {
    const details = parsed?.blockers?.length ? parsed.blockers.join(" | ") : String(child.stderr || child.stdout || "").trim();
    blockers.push(`${label}: ${details || "không đạt"}`);
  }
  return ok;
}

function latestPrestartDb() {
  const base=path.join(root,"backups");
  if(!fs.existsSync(base)) return "";
  const dirs=fs.readdirSync(base,{withFileTypes:true})
    .filter(x=>x.isDirectory() && /^prestart_/i.test(x.name))
    .map(x=>x.name)
    .sort()
    .reverse();
  for(const name of dirs){
    const db=path.join(base,name,"qy4_ttbyt.sqlite");
    if(fs.existsSync(db)) return db;
  }
  return "";
}

const liveDb=path.join(root,"db","qy4_ttbyt.sqlite");
if(!fs.existsSync(liveDb)){
  blockers.push("Không tìm thấy db/qy4_ttbyt.sqlite.");
}else{
  runNode("Preflight dữ liệu hiện tại","scripts/preflight-realdata.js",["--db",liveDb,"--uploads",path.join(root,"uploads")]);
  runNode("Phục hồi thử backup mới nhất","scripts/verify-backup-restore.js");

  const prestart=latestPrestartDb();
  if(prestart){
    runNode("Audit bảo toàn dữ liệu sau migration","scripts/audit-migration.js",["--before",prestart,"--after",liveDb]);
  }else{
    steps.push({
      label:"Audit bảo toàn dữ liệu sau migration",
      ok:true,
      skipped:true,
      reason:"Không có backups/prestart_*; phù hợp với cài mới hoặc chưa chạy launcher production trên database cũ."
    });
    warnings.push("Không có prestart DB nên bỏ qua migration audit. Nếu đây là nâng cấp database cũ, cần chạy qua start-qy4-production.cmd để có bản prestart trước migration.");
  }
}

const ok = blockers.length===0;
const out={
  ok,
  blockers,
  warnings,
  steps,
  remaining_manual_checks:[
    "Đăng nhập và mở Cài đặt → Hệ thống → Sẵn sàng triển khai; xử lý hết mục Cần xử lý.",
    "Test QR bằng điện thoại cùng LAN với địa chỉ QY4_PUBLIC_ORIGIN/IP LAN thật.",
    "Nếu chuẩn bị in tem hàng loạt: QY4_PUBLIC_ORIGIN phải được khóa và qr_origin ở mức Đạt.",
    "Chạy 01 luồng Sự cố → Tiếp nhận → Sửa chữa → Hoàn thành trên bản sao dữ liệu thật.",
    "Kiểm tra backup mirror nằm trên storage khác nếu dùng làm dự phòng hỏng ổ."
  ]
};

if(jsonMode){
  process.stdout.write(JSON.stringify(out,null,2)+"\n");
}else{
  console.log("============================================");
  console.log(" QY4-TTBYT 5.0.0 - FINAL RELEASE GATE");
  console.log("============================================");
  for(const step of steps){
    const tag=step.skipped ? "[BO QUA]" : (step.ok ? "[DAT]" : "[CHAN]");
    console.log(tag, step.label);
    if(step.skipped && step.reason) console.log("        "+step.reason);
  }
  for(const x of warnings) console.log("[LUU Y]",x);
  for(const x of blockers) console.log("[CHAN]",x);
  console.log("--------------------------------------------");
  if(ok){
    console.log("KET QUA: FINAL RELEASE GATE KY THUAT DAT");
    console.log("Con phai test thu cong: San sang trien khai + LAN/dien thoai + luong nghiep vu.");
  }else{
    console.log(`KET QUA: FINAL RELEASE GATE CHUA DAT (${blockers.length} muc can xu ly)`);
  }
}
process.exitCode=ok?0:2;
