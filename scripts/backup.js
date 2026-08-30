const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "db", "qy4_ttbyt.sqlite");
const UPLOADS_PATH = path.join(ROOT, "uploads");
const PUBLIC_QR_SECRET_PATH = path.join(ROOT, "config", "public-qr-secret.txt");
const BACKUP_ROOT = process.env.QY4_BACKUP_DIR
  ? path.resolve(process.env.QY4_BACKUP_DIR)
  : path.join(ROOT, "backups");
const RETENTION_DAYS = Math.max(1, Number(process.env.QY4_BACKUP_RETENTION_DAYS || 30));

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function purgeOldBackups() {
  if (!fs.existsSync(BACKUP_ROOT)) return [];
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const entry of fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("QY4-TTBYT_")) continue;
    const full = path.join(BACKUP_ROOT, entry.name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(full, { recursive: true, force: true });
        removed.push(entry.name);
      }
    } catch (_) {}
  }
  return removed;
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Không tìm thấy cơ sở dữ liệu: ${DB_PATH}`);
  }

  ensureDir(BACKUP_ROOT);
  const folder = `QY4-TTBYT_${stamp()}`;
  const destination = path.join(BACKUP_ROOT, folder);
  ensureDir(destination);

  const dbDestination = path.join(destination, "qy4_ttbyt.sqlite");
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    // API backup của better-sqlite3 tạo bản sao nhất quán ngay cả khi DB đang dùng WAL.
    await db.backup(dbDestination);
  } finally {
    db.close();
  }

  let uploadsCopied = false;
  if (fs.existsSync(UPLOADS_PATH)) {
    fs.cpSync(UPLOADS_PATH, path.join(destination, "uploads"), { recursive: true, force: true });
    uploadsCopied = true;
  }

  let publicQrSecretCopied = false;
  if (fs.existsSync(PUBLIC_QR_SECRET_PATH)) {
    const configDestination = path.join(destination, "config");
    ensureDir(configDestination);
    fs.copyFileSync(PUBLIC_QR_SECRET_PATH, path.join(configDestination, "public-qr-secret.txt"));
    publicQrSecretCopied = true;
  }

  const manifest = {
    application: "QY4-TTBYT",
    created_at_local: isoLocal(),
    hostname: os.hostname(),
    database: "qy4_ttbyt.sqlite",
    uploads_copied: uploadsCopied,
    public_qr_secret_copied: publicQrSecretCopied,
    retention_days: RETENTION_DAYS,
    source_root: ROOT
  };
  fs.writeFileSync(path.join(destination, "backup-info.json"), JSON.stringify(manifest, null, 2), "utf8");

  const removed = purgeOldBackups();
  console.log(`[QY4-TTBYT] Backup hoàn thành: ${destination}`);
  if (publicQrSecretCopied) console.log("[QY4-TTBYT] Đã sao lưu khóa ký QR công khai.");
  if (removed.length) console.log(`[QY4-TTBYT] Đã xóa ${removed.length} bản sao lưu quá ${RETENTION_DAYS} ngày.`);
}

main().catch(err => {
  console.error("[QY4-TTBYT] Backup thất bại:", err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
