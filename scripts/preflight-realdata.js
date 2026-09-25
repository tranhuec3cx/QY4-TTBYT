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

    const activeClause = dcols.has("is_archived") ? "COALESCE(is_archived,0)=0 AND " : "";
    const missingName = db.prepare(`SELECT COUNT(*) c FROM devices WHERE ${activeClause}TRIM(COALESCE(name,''))=''`).get().c;
    const missingDepartment = dcols.has("department_code")
      ? db.prepare(`SELECT COUNT(*) c FROM devices WHERE ${activeClause}TRIM(COALESCE(department_code,''))=''`).get().c
      : devices.length;
    const missingGroup = dcols.has("group_code")
      ? db.prepare(`SELECT COUNT(*) c FROM devices WHERE ${activeClause}TRIM(COALESCE(group_code,''))=''`).get().c
      : devices.length;
    stats.missing_device_name = Number(missingName || 0);
    stats.missing_device_department = Number(missingDepartment || 0);
    stats.missing_device_group = Number(missingGroup || 0);
    if (missingName || missingDepartment || missingGroup) {
      emit("BLOCK", `Thiết bị thiếu dữ liệu định danh lõi: tên=${missingName}, khoa/phòng=${missingDepartment}, nhóm=${missingGroup}.`);
    }

    let unknownDepartmentRefs=0;
    let unknownGroupRefs=0;
    if (dcols.has("department_code") && hasTable("departments")) {
      unknownDepartmentRefs=Number(db.prepare(`
        SELECT COUNT(*) c
        FROM devices dv
        LEFT JOIN departments d ON d.code=dv.department_code
        WHERE ${activeClause}TRIM(COALESCE(dv.department_code,''))<>'' AND d.code IS NULL
      `).get().c || 0);
    } else if (dcols.has("department_code") && !hasTable("departments")) {
      unknownDepartmentRefs=Number(db.prepare(`SELECT COUNT(*) c FROM devices WHERE ${activeClause}TRIM(COALESCE(department_code,''))<>''`).get().c || 0);
    }
    if (dcols.has("group_code") && hasTable("device_groups")) {
      unknownGroupRefs=Number(db.prepare(`
        SELECT COUNT(*) c
        FROM devices dv
        LEFT JOIN device_groups g ON g.code=dv.group_code
        WHERE ${activeClause}TRIM(COALESCE(dv.group_code,''))<>'' AND g.code IS NULL
      `).get().c || 0);
    } else if (dcols.has("group_code") && !hasTable("device_groups")) {
      unknownGroupRefs=Number(db.prepare(`SELECT COUNT(*) c FROM devices WHERE ${activeClause}TRIM(COALESCE(group_code,''))<>''`).get().c || 0);
    }
    stats.unknown_device_department_refs=unknownDepartmentRefs;
    stats.unknown_device_group_refs=unknownGroupRefs;
    if (unknownDepartmentRefs || unknownGroupRefs) {
      emit("BLOCK", `Thiết bị tham chiếu danh mục không tồn tại: khoa/phòng=${unknownDepartmentRefs}, nhóm=${unknownGroupRefs}.`);
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
    if (ucols.has("role") && ucols.has("department_code")) {
      let unknownDepartmentUsers=0;
      if (hasTable("departments")) {
        unknownDepartmentUsers=Number(db.prepare(`
          SELECT COUNT(*) c
          FROM users u
          LEFT JOIN departments d ON d.code=u.department_code
          WHERE u.role='Người dùng khoa'
            AND TRIM(COALESCE(u.department_code,''))<>''
            AND d.code IS NULL
        `).get().c || 0);
      } else {
        unknownDepartmentUsers=Number(db.prepare(`
          SELECT COUNT(*) c FROM users
          WHERE role='Người dùng khoa' AND TRIM(COALESCE(department_code,''))<>''
        `).get().c || 0);
      }
      stats.department_users_unknown_department=unknownDepartmentUsers;
      if (unknownDepartmentUsers) {
        emit("BLOCK", `Có ${unknownDepartmentUsers} tài khoản Người dùng khoa tham chiếu khoa/phòng không tồn tại.`);
      }
    }
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
  function collectFileRefs(table, field, sizeField = "") {
    if (!hasTable(table) || !columnSet(table).has(field)) return;
    const cols=columnSet(table);
    const sizeExpr=sizeField && cols.has(sizeField) ? `, COALESCE(${sizeField},0) expected_size` : ", 0 expected_size";
    for (const row of db.prepare(`SELECT id,${field} file_path${sizeExpr} FROM ${table} WHERE TRIM(COALESCE(${field},''))<>''`).all()) {
      fileRefs.push({
        table,
        id: row.id,
        file_path: String(row.file_path || ""),
        expected_size: Math.max(0, Number(row.expected_size || 0))
      });
    }
  }
  collectFileRefs("incident_files","file_path","file_size");
  collectFileRefs("maintenances","file_path","file_size");
  collectFileRefs("documents","file_path","file_size");
  collectFileRefs("device_transfers","document_file_path","document_file_size");
  stats.referenced_files = fileRefs.length;
  let missingFiles = 0;
  let fileSizeMismatches = 0;
  for (const ref of fileRefs) {
    let rel = ref.file_path.replace(/\\/g,"/").replace(/^\/+/, "");
    if (rel.toLowerCase().startsWith("uploads/")) rel = rel.slice("uploads/".length);
    const target = path.join(uploadsRoot, rel);
    if (!fs.existsSync(target)) {
      missingFiles += 1;
      continue;
    }
    if (ref.expected_size > 0) {
      let actualSize=0;
      try { actualSize=Number(fs.statSync(target).size || 0); } catch {}
      if (actualSize !== ref.expected_size) fileSizeMismatches += 1;
    }
  }
  stats.missing_referenced_files = missingFiles;
  stats.referenced_file_size_mismatches = fileSizeMismatches;
  if (missingFiles) emit("BLOCK", `Thiếu ${missingFiles}/${fileRefs.length} file đang được database tham chiếu.`);
  if (fileSizeMismatches) emit("BLOCK", `Có ${fileSizeMismatches} file đính kèm tồn tại nhưng kích thước không khớp metadata trong database.`);
  if (!missingFiles && !fileSizeMismatches && fileRefs.length) emit("OK", `Đủ ${fileRefs.length} file được database tham chiếu và kích thước khớp metadata.`);
  else if (!fileRefs.length) emit("WARN", "Database không có file_path đính kèm để đối chiếu.");

} catch (e) {
  emit("BLOCK", `Preflight gặp lỗi khi đọc dữ liệu: ${e.message}`);
} finally {
  try { db.close(); } catch {}
}

resultAndExit(blockers.length ? 2 : 0);
