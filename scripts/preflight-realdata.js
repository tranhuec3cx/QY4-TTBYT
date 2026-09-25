const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const root = process.cwd();
const dbPath = path.resolve(root, argValue("--db", path.join("db", "qy4_ttbyt.sqlite")));
const uploadsRoot = path.resolve(root, argValue("--uploads", "uploads"));
const jsonMode = process.argv.includes("--json");

const blockers = [];
const warnings = [];
const notes = [];
const stats = {};

function emit(level, message) {
  if (level === "BLOCK") blockers.push(message);
  else if (level === "WARN") warnings.push(message);
  else notes.push(message);
}
function resultAndExit(code) {
  const out = {
    ok: blockers.length === 0,
    blockers,
    warnings,
    notes,
    stats,
    db_path: dbPath,
    uploads_path: uploadsRoot
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    console.log("============================================");
    console.log(" QY4-TTBYT 5.0.0 - PREFLIGHT DU LIEU THAT");
    console.log("============================================");
    console.log("Database:", dbPath);
    console.log("Uploads :", uploadsRoot);
    for (const x of notes) console.log("[DAT] ", x);
    for (const x of warnings) console.log("[LUU Y]", x);
    for (const x of blockers) console.log("[CHAN]", x);
    console.log("--------------------------------------------");
    console.log(blockers.length ? `KET QUA: CHUA AN TOAN (${blockers.length} muc can xu ly)` : `KET QUA: DAT PREFLIGHT (${warnings.length} luu y)`);
  }
  process.exitCode = code;
}

if (!fs.existsSync(dbPath)) {
  emit("BLOCK", "Không tìm thấy database cần kiểm tra.");
  resultAndExit(2);
  return;
}

let db;
try {
  db = new Database(dbPath, { readonly: true, fileMustExist: true });
} catch (e) {
  emit("BLOCK", `Không mở được SQLite: ${e.message}`);
  resultAndExit(2);
  return;
}

try {
  const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tables = new Set(tableRows.map(x => x.name));
  const hasTable = (name) => tables.has(name);
  const columns = (name) => hasTable(name) ? db.prepare(`PRAGMA table_info(${name})`).all() : [];
  const columnSet = (name) => new Set(columns(name).map(x => x.name));

  const quick = db.prepare("PRAGMA quick_check").get();
  const quickValue = String(quick ? Object.values(quick)[0] || "" : "");
  stats.quick_check = quickValue;
  if (quickValue.toLowerCase() !== "ok") emit("BLOCK", `SQLite quick_check không đạt: ${quickValue || "không có kết quả"}`);
  else emit("OK", "SQLite quick_check=ok.");

  let fk = [];
  try { fk = db.prepare("PRAGMA foreign_key_check").all(); } catch (e) {
    emit("BLOCK", `Không chạy được foreign_key_check: ${e.message}`);
  }
  stats.foreign_key_violations = fk.length;
  if (fk.length) emit("BLOCK", `Có ${fk.length} vi phạm khóa ngoại.`);
  else emit("OK", "Không phát hiện vi phạm khóa ngoại.");

  if (!hasTable("devices")) {
    emit("BLOCK", "Thiếu bảng devices.");
  } else {
    const dcols = columnSet("devices");
    const devices = db.prepare("SELECT * FROM devices").all();
    stats.devices = devices.length;
    emit("OK", `Đọc được ${devices.length} thiết bị.`);

    if (!dcols.has("qr_uid")) {
      emit("WARN", "Database chưa có qr_uid; RC hỗ trợ tự sinh QR UID khi migration.");
    } else {
      const missingQr = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND TRIM(COALESCE(qr_uid,''))=''").get().c;
      stats.missing_qr_uid = Number(missingQr || 0);
      if (missingQr) emit("WARN", `Có ${missingQr} thiết bị đang quản lý chưa có QR UID; RC sẽ tự bổ sung khi migration.`);
    }

    if (dcols.has("serial")) {
      const dup = db.prepare(`
        SELECT lower(trim(serial)) k, COUNT(*) c
        FROM devices
        WHERE trim(COALESCE(serial,''))<>''
          AND upper(trim(serial)) NOT IN ('NN','N/A','NA','UNKNOWN','KHONG CO','CHUA RO','NONE','NIL','0','-','--')
        GROUP BY lower(trim(serial))
        HAVING COUNT(*)>1
      `).all();
      stats.duplicate_serial_groups = dup.length;
      if (dup.length) emit("WARN", `Có ${dup.length} nhóm Serial trùng cần xác minh trước chạy thật.`);
    }
  }

  if (hasTable("users")) {
    const ucols = columnSet("users");
    if (ucols.has("username")) {
      const dupUsers = db.prepare(`
        SELECT lower(trim(username)) k, COUNT(*) c
        FROM users
        WHERE trim(COALESCE(username,''))<>''
        GROUP BY lower(trim(username))
        HAVING COUNT(*)>1
      `).all();
      stats.duplicate_username_groups = dupUsers.length;
      if (dupUsers.length) emit("BLOCK", `Có ${dupUsers.length} nhóm username trùng không phân biệt hoa/thường.`);
    }
    if (!ucols.has("password_hash")) emit("WARN", "Schema user cũ chưa có password_hash; RC sẽ bổ sung khi migration.");
  }

  if (hasTable("repairs") && hasTable("devices")) {
    const rcols = columnSet("repairs");
    const dcols = columnSet("devices");
    if (rcols.has("processing_status")) {
      const duplicateOpen = db.prepare(`
        SELECT device_id, COUNT(*) c
        FROM repairs
        WHERE COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Đang kiểm tra','Mới tiếp nhận','Chờ linh kiện','')
        GROUP BY device_id
        HAVING COUNT(*)>1
      `).all();
      stats.duplicate_open_repair_devices = duplicateOpen.length;
      if (duplicateOpen.length) emit("BLOCK", `Có ${duplicateOpen.length} thiết bị đang có nhiều phiếu sửa chữa mở.`);

      if (dcols.has("status")) {
        const mismatches = db.prepare(`
          SELECT COUNT(DISTINCT r.device_id) c
          FROM repairs r JOIN devices d ON d.id=r.device_id
          WHERE COALESCE(r.processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Đang kiểm tra','Mới tiếp nhận','Chờ linh kiện','')
            AND COALESCE(d.status,'')<>'Chờ sửa chữa'
        `).get().c;
        stats.open_repair_status_mismatches = Number(mismatches || 0);
        if (mismatches) emit("BLOCK", `Có ${mismatches} thiết bị có phiếu sửa chữa mở nhưng trạng thái không phải Chờ sửa chữa.`);
      }
    } else {
      emit("WARN", "Schema repairs cũ chưa có processing_status; RC sẽ bổ sung khi migration.");
    }
  }

  if (hasTable("device_transfers")) {
    const info = columns("device_transfers");
    const tcols = new Set(info.map(x => x.name));
    const legacyRequired = info.filter(x => ["transfer_date","to_department"].includes(x.name) && Number(x.notnull || 0) === 1);
    const canonical = ["transfer_datetime","from_department_code","to_department_code"].every(x => tcols.has(x));
    if (!canonical || legacyRequired.length) {
      if (tcols.has("transfer_date") && tcols.has("to_department")) {
        emit("WARN", "Phát hiện schema điều chuyển legacy kiểu R15; RC hiện có migration rebuild bảo toàn lịch sử.");
        stats.legacy_transfer_schema = true;
      } else {
        emit("BLOCK", "Schema device_transfers không khớp dạng RC hoặc legacy R15 được hỗ trợ.");
      }
    } else {
      emit("OK", "Schema điều chuyển đã ở dạng RC.");
      stats.legacy_transfer_schema = false;
    }
  }

  if (hasTable("quality_ratings")) {
    const sqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='quality_ratings'").get();
    const legacyUnique = /device_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(String(sqlRow?.sql || ""));
    stats.legacy_quality_unique = legacyUnique;
    if (legacyUnique) emit("WARN", "Phát hiện quality_ratings legacy UNIQUE(device_id); RC hỗ trợ migration sang lịch sử nhiều lần.");
  }

  const fileRefs = [];
  function collectFileRefs(table, field) {
    if (!hasTable(table) || !columnSet(table).has(field)) return;
    for (const row of db.prepare(`SELECT id,${field} file_path FROM ${table} WHERE TRIM(COALESCE(${field},''))<>''`).all()) {
      fileRefs.push({ table, id: row.id, file_path: String(row.file_path || "") });
    }
  }
  collectFileRefs("incident_files","file_path");
  collectFileRefs("maintenances","file_path");
  collectFileRefs("documents","file_path");
  collectFileRefs("device_transfers","document_file_path");
  stats.referenced_files = fileRefs.length;
  let missingFiles = 0;
  for (const ref of fileRefs) {
    let rel = ref.file_path.replace(/\\/g,"/").replace(/^\/+/, "");
    if (rel.toLowerCase().startsWith("uploads/")) rel = rel.slice("uploads/".length);
    const target = path.join(uploadsRoot, rel);
    if (!fs.existsSync(target)) missingFiles += 1;
  }
  stats.missing_referenced_files = missingFiles;
  if (missingFiles) emit("BLOCK", `Thiếu ${missingFiles}/${fileRefs.length} file đang được database tham chiếu.`);
  else if (fileRefs.length) emit("OK", `Đủ ${fileRefs.length} file được database tham chiếu.`);
  else emit("WARN", "Database không có file_path đính kèm để đối chiếu.");

} catch (e) {
  emit("BLOCK", `Preflight gặp lỗi khi đọc dữ liệu: ${e.message}`);
} finally {
  try { db.close(); } catch {}
}

resultAndExit(blockers.length ? 2 : 0);
