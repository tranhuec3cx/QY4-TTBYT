const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");

function argValue(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const jsonMode = process.argv.includes("--json");
const root = process.cwd();
const backupDir = path.resolve(root, argValue("--backup-dir", "backups"));
const explicitBackup = argValue("--backup", "");
const keepRestore = process.argv.includes("--keep-restore");

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(x => /^qy4_ttbyt_.*\.sqlite$/i.test(x))
    .sort()
    .reverse();
}
function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}
function fileStats(rootDir) {
  const out = { count: 0, bytes: 0 };
  if (!fs.existsSync(rootDir)) return out;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const child = fileStats(full);
      out.count += child.count;
      out.bytes += child.bytes;
    } else if (entry.isFile()) {
      out.count += 1;
      out.bytes += Number(fs.statSync(full).size || 0);
    }
  }
  return out;
}
function normalizeUploadPath(value) {
  let rel = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.toLowerCase().startsWith("uploads/")) rel = rel.slice("uploads/".length);
  return rel;
}
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function columnSet(db, table) {
  if (!tableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name));
}

const blockers = [];
const warnings = [];
const notes = [];
const stats = {};
const block = m => blockers.push(m);
const warn = m => warnings.push(m);
const ok = m => notes.push(m);

let backupName = explicitBackup;
if (backupName) {
  backupName = path.basename(backupName);
} else {
  backupName = listBackups()[0] || "";
}
if (!backupName) {
  block("Không tìm thấy backup SQLite để rehearsal.");
  finish(2);
  return;
}

const sourceDb = path.join(backupDir, backupName);
const sourceFiles = path.join(backupDir, backupName.replace(/\.sqlite$/i, ".files"));
if (!fs.existsSync(sourceDb)) block("Thiếu file backup SQLite.");
if (!fs.existsSync(sourceFiles)) block("Thiếu snapshot .files đi kèm backup.");
if (blockers.length) {
  finish(2);
  return;
}

const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qy4-restore-rehearsal-"));
const restoreDb = path.join(restoreRoot, "db", "qy4_ttbyt.sqlite");
const restoreUploads = path.join(restoreRoot, "uploads");
fs.mkdirSync(path.dirname(restoreDb), { recursive: true });

let db = null;
try {
  fs.copyFileSync(sourceDb, restoreDb);
  copyDirectory(sourceFiles, restoreUploads);
  const srcStats = fileStats(sourceFiles);
  const dstStats = fileStats(restoreUploads);
  stats.source_files = srcStats.count;
  stats.source_files_bytes = srcStats.bytes;
  stats.restored_files = dstStats.count;
  stats.restored_files_bytes = dstStats.bytes;
  if (srcStats.count !== dstStats.count || srcStats.bytes !== dstStats.bytes) {
    block(`Snapshot uploads phục hồi không khớp nguồn: source ${srcStats.count} file/${srcStats.bytes} byte; restore ${dstStats.count} file/${dstStats.bytes} byte.`);
  } else {
    ok(`Đã copy đủ ${dstStats.count} file/${dstStats.bytes} byte sang vùng phục hồi tạm.`);
  }

  db = new Database(restoreDb, { fileMustExist: true });
  db.pragma("foreign_keys=ON");

  const quick = db.prepare("PRAGMA quick_check").get();
  const quickValue = String(quick ? Object.values(quick)[0] || "" : "");
  stats.quick_check = quickValue;
  if (quickValue.toLowerCase() !== "ok") block(`SQLite quick_check không đạt: ${quickValue || "không có kết quả"}`);
  else ok("SQLite phục hồi quick_check=ok.");

  const fk = db.prepare("PRAGMA foreign_key_check").all();
  stats.foreign_key_violations = fk.length;
  if (fk.length) block(`Database phục hồi có ${fk.length} vi phạm khóa ngoại.`);
  else ok("Database phục hồi không có vi phạm khóa ngoại.");

  const requiredTables = ["devices","departments","device_groups","incidents","repairs","maintenances","inspections","device_transfers","users"];
  const missingTables = requiredTables.filter(t => !tableExists(db, t));
  stats.missing_required_tables = missingTables;
  if (missingTables.length) block("Thiếu bảng bắt buộc sau phục hồi: " + missingTables.join(", "));
  else ok("Các bảng nghiệp vụ lõi đều có trong bản phục hồi.");

  if (tableExists(db, "auth_sessions")) {
    const sessions = Number(db.prepare("SELECT COUNT(*) c FROM auth_sessions").get().c || 0);
    stats.auth_sessions = sessions;
    if (sessions) block(`Backup phục hồi còn ${sessions} session đăng nhập; backup an toàn phải có 0 session.`);
    else ok("Backup phục hồi không chứa session đăng nhập.");
  }

  const counts = {};
  for (const t of requiredTables) {
    if (tableExists(db, t)) counts[t] = Number(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c || 0);
  }
  stats.table_counts = counts;
  if (Number(counts.devices || 0) <= 0) warn("Backup không có thiết bị; chỉ phù hợp nếu đây là database trống có chủ đích.");

  const fileRefs = [];
  function collect(table, field, sizeField = "") {
    const cols = columnSet(db, table);
    if (!cols.has(field)) return;
    const sizeExpr = sizeField && cols.has(sizeField) ? `, COALESCE(${sizeField},0) expected_size` : ", 0 expected_size";
    for (const row of db.prepare(`SELECT id,${field} file_path${sizeExpr} FROM ${table} WHERE TRIM(COALESCE(${field},''))<>''`).all()) {
      fileRefs.push({
        table,
        id: row.id,
        file_path: String(row.file_path || ""),
        expected_size: Math.max(0, Number(row.expected_size || 0))
      });
    }
  }
  collect("incident_files","file_path","file_size");
  collect("maintenances","file_path","file_size");
  collect("documents","file_path","file_size");
  collect("device_transfers","document_file_path","document_file_size");

  let missingRefs = 0;
  let sizeMismatches = 0;
  for (const ref of fileRefs) {
    const target = path.join(restoreUploads, normalizeUploadPath(ref.file_path));
    if (!fs.existsSync(target)) {
      missingRefs += 1;
      continue;
    }
    if (ref.expected_size > 0 && Number(fs.statSync(target).size || 0) !== ref.expected_size) {
      sizeMismatches += 1;
    }
  }
  stats.referenced_files = fileRefs.length;
  stats.missing_referenced_files = missingRefs;
  stats.referenced_file_size_mismatches = sizeMismatches;
  if (missingRefs) block(`Bản phục hồi thiếu ${missingRefs}/${fileRefs.length} file đang được DB tham chiếu.`);
  if (sizeMismatches) block(`Có ${sizeMismatches} file phục hồi có kích thước khác metadata DB.`);
  if (!missingRefs && !sizeMismatches) ok(`Đối chiếu ${fileRefs.length} file tham chiếu trong DB: đạt.`);

  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec("CREATE TABLE __qy4_restore_probe (id INTEGER PRIMARY KEY, note TEXT)");
    db.prepare("INSERT INTO __qy4_restore_probe(note) VALUES (?)").run("restore rehearsal");
    const probe = db.prepare("SELECT COUNT(*) c FROM __qy4_restore_probe").get();
    if (Number(probe.c || 0) !== 1) throw new Error("Không đọc lại được bản ghi probe.");
    db.exec("ROLLBACK");
    const remains = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__qy4_restore_probe'").get();
    if (remains) block("Transaction rollback thử nghiệm không dọn được bảng probe.");
    else ok("Bản phục hồi mở ở chế độ ghi được; transaction thử nghiệm ghi + rollback thành công.");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    block("Không thể thực hiện transaction ghi trên bản phục hồi tạm: " + e.message);
  }
} catch (e) {
  block("Restore rehearsal gặp lỗi: " + e.message);
} finally {
  try { if (db) db.close(); } catch {}
}

finish(blockers.length ? 2 : 0);

function finish(code) {
  const out = {
    ok: blockers.length === 0,
    backup: backupName,
    restore_dir: keepRestore ? restoreRoot : null,
    blockers,
    warnings,
    notes,
    stats
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    console.log("============================================");
    console.log(" QY4-TTBYT 5.0.0 - RESTORE REHEARSAL");
    console.log("============================================");
    console.log("Backup:", backupName);
    for (const x of notes) console.log("[DAT] ", x);
    for (const x of warnings) console.log("[LUU Y]", x);
    for (const x of blockers) console.log("[CHAN]", x);
    if (keepRestore) console.log("Thu muc phuc hoi tam:", restoreRoot);
    console.log("--------------------------------------------");
    console.log(blockers.length ? `KET QUA: PHUC HOI THU CHUA DAT (${blockers.length} muc can xu ly)` : `KET QUA: PHUC HOI THU DAT (${warnings.length} luu y)`);
  }
  if (!keepRestore && typeof restoreRoot === "string" && fs.existsSync(restoreRoot)) {
    try { fs.rmSync(restoreRoot, { recursive: true, force: true }); } catch {}
  }
  process.exitCode = code;
}
