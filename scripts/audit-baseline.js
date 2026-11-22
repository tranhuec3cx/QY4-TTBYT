#!/usr/bin/env node
// Read-only baseline audit. Never seeds or modifies the database.
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const dbFile = process.env.QY4_DB_PATH || path.join(__dirname, "..", "db", "qy4_ttbyt.sqlite");
const expected = Number(process.env.QY4_EXPECTED_DEVICES || 397);
if (!fs.existsSync(dbFile)) {
  console.error("Không tìm thấy database. Không được tự khởi tạo database để kiểm tra:", dbFile);
  process.exit(2);
}
const db = new Database(dbFile, { readonly: true, fileMustExist: true });
let failure = false;
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name);
  const required = ["devices","repairs","incidents","maintenances","documents","daily_checks","operation_logs"];
  for (const name of required) if (!tables.includes(name)) { console.error("THIẾU BẢNG:", name); failure = true; }
  if (tables.includes("devices")) {
    const n = db.prepare("SELECT COUNT(*) AS n FROM devices").get().n;
    const cols = db.prepare("PRAGMA table_info(devices)").all().map(x => x.name);
    console.log("Thiết bị hiện có:", n, "| Mốc đối chiếu:", expected);
    if (n !== expected) { console.error("CẢNH BÁO: Số lượng không khớp mốc; xác nhận bản dữ liệu đang dùng trước khi nâng cấp."); failure = true; }
    console.log("Có qr_uid:", cols.includes("qr_uid") ? "CÓ" : "CHƯA CÓ (QR hiện hành không được coi là UID cố định)");
    if (cols.includes("qr_uid")) {
      const q = db.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT qr_uid) AS distinct_n, SUM(CASE WHEN qr_uid IS NULL OR TRIM(qr_uid)='' THEN 1 ELSE 0 END) AS blank FROM devices").get();
      if (q.distinct_n !== q.n || q.blank) { console.error("LỖI qr_uid: giá trị trống hoặc trùng lặp",q); failure = true; }
    }
    const ids = db.prepare("SELECT id FROM devices ORDER BY id").all().map(x => x.id);
    const crypto = require("crypto");
    console.log("SHA-256 ID thiết bị:", crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex"));
  }
  const fk = db.pragma("foreign_key_check");
  if (fk.length) { console.error("LỖI khóa ngoại:", JSON.stringify(fk.slice(0,20))); failure = true; }
  else console.log("Kiểm tra khóa ngoại: không phát hiện lỗi");
  console.log("LƯU Ý: cần sao lưu nhất quán SQLite + WAL và tệp đính kèm, thử khôi phục trước migration.");
} finally { db.close(); }
process.exitCode = failure ? 1 : 0;
