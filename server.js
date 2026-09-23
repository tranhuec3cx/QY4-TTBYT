
const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");
const multer = require("multer");
const os = require("os");
const crypto = require("crypto");
const qrcodeGenerator = require("qrcode-generator");

const app = express();
const PORT = process.env.PORT || 5000;
const AUTH_REQUIRED = process.env.QY4_AUTH_REQUIRED === "1";
const SESSION_COOKIE = "qy4_session";
const SESSION_HOURS = Math.max(1, Number(process.env.QY4_SESSION_HOURS || 12));
const QR_RATE_LIMIT = Math.max(5, Number(process.env.QY4_QR_RATE_LIMIT || 20));
const QR_RATE_WINDOW_MS = Math.max(10000, Number(process.env.QY4_QR_RATE_WINDOW_MS || 60000));
const APP_TIME_ZONE = String(process.env.QY4_TIME_ZONE || "Asia/Bangkok").trim() || "Asia/Bangkok";
const ALLOW_LEGACY_PUBLIC_QR = process.env.QY4_ALLOW_LEGACY_QR === "1";
const dbPath = path.join(__dirname, "db", "qy4_ttbyt.sqlite");
const uploadsDir = path.join(__dirname, "uploads", "documents");
const qrUploadsDir = path.join(__dirname, "uploads", "qr");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(qrUploadsDir, { recursive: true });

app.use(express.json({ limit: "10mb" }));

function parseCookies(header = "") {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}
function sessionTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}
function passwordHash(password, salt) {
  return crypto.scryptSync(String(password || ""), String(salt || ""), 64).toString("hex");
}
function setUserPassword(userId, password) {
  const value = String(password || "");
  if (value.length < 8) throw new Error("Mật khẩu phải có ít nhất 8 ký tự.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(value, salt);
  db.prepare("UPDATE users SET password_salt=?, password_hash=? WHERE id=?").run(salt, hash, Number(userId));
}
function verifyUserPassword(user, password) {
  if (!user || !user.password_hash || !user.password_salt) return false;
  const actual = Buffer.from(passwordHash(password, user.password_salt), "hex");
  const expected = Buffer.from(String(user.password_hash), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function readAuthenticatedUser(req) {
  if (!AUTH_REQUIRED) return null;
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = sessionTokenHash(token);
  const row = db.prepare(`
    SELECT u.id,u.full_name,u.username,u.role,u.department_code,u.status,s.expires_at
    FROM auth_sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=?
  `).get(tokenHash);
  if (!row || row.status !== "Hoạt động" || Number(row.expires_at || 0) <= Date.now()) {
    if (row) db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(tokenHash);
    return null;
  }
  return row;
}
function isAdminOnlyApiPath(p) {
  if (p === "/api/system/qr-origins") return false;
  return p.startsWith("/api/users")
    || p.startsWith("/api/departments")
    || p.startsWith("/api/device-groups")
    || p.startsWith("/api/system/")
    || p.startsWith("/api/audit-logs")
    || p.startsWith("/api/reset-seed");
}
function isDepartmentUserAllowed(req) {
  if (!["GET","HEAD"].includes(req.method)) return false;
  if (req.path === "/api/meta") return true;
  if (req.path === "/api/devices" || /^\/api\/devices\/\d+$/.test(req.path)) return true;
  return false;
}
function authApiGuard(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/auth/")
      || req.path.startsWith("/api/public/")
      || (req.method === "POST" && ["/api/qr/checks","/api/qr/incidents"].includes(req.path))) return next();
  if (!AUTH_REQUIRED) return next();

  const user = readAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
  req.authUser = user;

  if (isAdminOnlyApiPath(req.path) && user.role !== "Quản trị viên") {
    return res.status(403).json({ error: "Chỉ Quản trị viên được thực hiện chức năng này." });
  }
  if (user.role === "Người dùng khoa" && !isDepartmentUserAllowed(req)) {
    return res.status(403).json({ error: "Tài khoản khoa chỉ được xem thiết bị thuộc khoa mình và báo sự cố qua QR." });
  }
  next();
}
app.use(authApiGuard);

const qrWriteRate = new Map();
function qrPublicWriteLimiter(req, res, next) {
  if (req.method !== "POST") return next();
  const now = Date.now();
  const key = String(req.ip || req.socket?.remoteAddress || "unknown");
  let item = qrWriteRate.get(key);
  if (!item || now - item.started_at >= QR_RATE_WINDOW_MS) {
    item = { started_at: now, count: 0 };
  }
  item.count += 1;
  qrWriteRate.set(key, item);

  if (qrWriteRate.size > 1000) {
    for (const [k, v] of qrWriteRate.entries()) {
      if (now - v.started_at >= QR_RATE_WINDOW_MS) qrWriteRate.delete(k);
    }
  }
  if (item.count > QR_RATE_LIMIT) {
    const retrySeconds = Math.max(1, Math.ceil((QR_RATE_WINDOW_MS - (now - item.started_at)) / 1000));
    res.setHeader("Retry-After", String(retrySeconds));
    return res.status(429).json({ error: "Có quá nhiều yêu cầu gửi từ thiết bị này. Vui lòng thử lại sau." });
  }
  next();
}
app.use("/api/qr", qrPublicWriteLimiter);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor", express.static(path.join(__dirname, "node_modules", "xlsx", "dist")));
function departmentUserCanAccessUpload(user, relativePath) {
  if (!user || user.role !== "Người dùng khoa") return true;
  const departmentCode = String(user.department_code || "").trim();
  if (!departmentCode) return false;
  const filePath = "/uploads" + String(relativePath || "");
  const params = [filePath, departmentCode];
  const allowed = db.prepare(`
    SELECT 1 AS ok
    FROM documents x JOIN devices d ON d.id=x.device_id
    WHERE x.file_path=? AND d.department_code=?
    UNION ALL
    SELECT 1 AS ok
    FROM maintenances x JOIN devices d ON d.id=x.device_id
    WHERE x.file_path=? AND d.department_code=?
    UNION ALL
    SELECT 1 AS ok
    FROM incident_files x JOIN devices d ON d.id=x.device_id
    WHERE x.file_path=? AND d.department_code=?
    LIMIT 1
  `).get(...params, ...params, ...params);
  return Boolean(allowed?.ok);
}
app.use("/uploads", (req, res, next) => {
  if (!AUTH_REQUIRED) return next();
  const user = readAuthenticatedUser(req);
  if (!user) return res.status(401).send("Cần đăng nhập để xem tệp đính kèm.");
  if (!departmentUserCanAccessUpload(user, req.path)) {
    return res.status(403).send("Tài khoản khoa không được xem tệp của khoa khác.");
  }
  req.authUser = user;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  next();
}, express.static(path.join(__dirname, "uploads")));

function getLanQrOrigins(req) {
  const port = process.env.PORT || PORT || 5000;
  const proto = req.protocol || "http";
  const origins = new Set();
  origins.add(`${proto}://${req.get("host")}`);
  try {
    const nets = os.networkInterfaces();
    Object.values(nets).flat().filter(Boolean).forEach((net) => {
      if (net.family === "IPv4" && !net.internal) {
        origins.add(`http://${net.address}:${port}`);
      }
    });
  } catch (e) {}
  return Array.from(origins);
}

app.get("/api/system/qr-origins", (req, res) => {
  const origins = getLanQrOrigins(req);
  res.json({
    current_origin: `${req.protocol || "http"}://${req.get("host")}`,
    recommended_origin: origins.find(x => !/localhost|127\.0\.0\.1/i.test(x)) || origins[0] || "",
    origins
  });
});


const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
try { db.prepare('ALTER TABLE repairs ADD COLUMN processing_status TEXT DEFAULT "Đang xử lý"').run(); } catch (e) {}
try { db.prepare('ALTER TABLE repairs ADD COLUMN incident_id INTEGER').run(); } catch (e) {}
try { db.prepare('ALTER TABLE activity_history ADD COLUMN cost REAL DEFAULT 0').run(); } catch (e) {}
try { db.prepare('ALTER TABLE activity_history ADD COLUMN entry_type TEXT DEFAULT \"Cập nhật\"').run(); } catch (e) {}
try { db.prepare('ALTER TABLE repairs ADD COLUMN received_at TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE repairs ADD COLUMN updated_at TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE repairs ADD COLUMN completed_at TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE repairs ADD COLUMN status_before TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN local_resolution_note TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN reporter_phone TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN incident_code TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN device_code_snapshot TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN device_name_snapshot TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN department_snapshot TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN location_snapshot TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN created_at TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN updated_at TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE incidents ADD COLUMN updated_by TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE maintenances ADD COLUMN original_name TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE maintenances ADD COLUMN stored_name TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE maintenances ADD COLUMN file_path TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE maintenances ADD COLUMN file_mime TEXT').run(); } catch (e) {}
try { db.prepare('ALTER TABLE maintenances ADD COLUMN file_size INTEGER DEFAULT 0').run(); } catch (e) {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeBase}`);
  }
});
const uploadDocument = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allow = [".pdf",".doc",".docx",".xls",".xlsx",".jpg",".jpeg",".png",".zip"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allow.includes(ext)) return cb(new Error("Định dạng file không được hỗ trợ."));
    cb(null, true);
  }
});
const qrStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, qrUploadsDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname || "qr-file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeBase}`);
  }
});
const uploadQrFile = multer({
  storage: qrStorage,
  limits: { fileSize: 30 * 1024 * 1024, files: 6, fields: 20, parts: 26, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allow = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allow.includes(ext)) return cb(new Error("Chỉ hỗ trợ JPG, PNG, WEBP, MP4 hoặc MOV."));
    cb(null, true);
  }
});
const uploadIncidentMedia = multer({
  storage: qrStorage,
  limits: { fileSize: 30 * 1024 * 1024, files: 6, fields: 20, parts: 26, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allow = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allow.includes(ext)) return cb(new Error("Chỉ hỗ trợ ảnh JPG/PNG/WEBP và video MP4/MOV."));
    cb(null, true);
  }
});
const INCIDENT_STATUSES = ["Mới ghi nhận","Đã chuyển sửa chữa","Đã xử lý tại chỗ"];
const REPAIR_STATUSES = ["Đang xử lý","Chờ linh kiện","Đã hoàn thành","Không sửa được"];
function normalizeRepairStatus(status) {
  const raw = String(status || "").trim();
  if (["Đang xử lý","Đang kiểm tra","Đang xử lý","Đang sửa chữa"].includes(raw)) return "Đang xử lý";
  if (raw === "Chờ linh kiện") return "Chờ linh kiện";
  if (["Đã sửa xong","Bàn giao sử dụng","Đã hoàn thành","Hoàn thành"].includes(raw)) return "Đã hoàn thành";
  if (["Hủy","Không sửa được","Không thể sửa"].includes(raw)) return "Không sửa được";
  return "Đang xử lý";
}
function statusAfterFromRepairStatus(processingStatus, requested = "Đang hoạt động") {
  const st = normalizeRepairStatus(processingStatus);
  if (st === "Không sửa được") return "Ngừng hoạt động";
  if (st === "Đang xử lý" || st === "Chờ linh kiện") return "Chờ sửa chữa";
  if (st === "Đã hoàn thành") {
    return ["Đang hoạt động","Hoạt động hạn chế"].includes(String(requested || "").trim())
      ? String(requested).trim()
      : "Đang hoạt động";
  }
  return "Chờ sửa chữa";
}
function normalizeDateTime(value) {
  if (!value) return "";
  let v = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += " 00:00:00";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) v += ":00";
  return v;
}
function requireFields(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === "");
  return missing;
}
function sanitizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
function normalizeIncidentStatusForUi(status, linkedRepairId) {
  const raw = String(status || "").trim();
  if (raw === "Đã chuyển sửa chữa" || raw === "Chuyển sửa chữa" || raw === "Chờ linh kiện") return "Đã chuyển sửa chữa";
  if (raw === "Đã xử lý tại chỗ" || raw === "Đã xử lý" || raw === "Đóng" || raw === "Không cần sửa chữa") return "Đã xử lý tại chỗ";
  if (raw === "Đã tiếp nhận" || raw === "Tiếp nhận") return "Đã tiếp nhận";
  if (raw === "Mới ghi nhận" || raw === "Đã ghi nhận" || raw === "Theo dõi") return "Mới ghi nhận";
  if (REPAIR_STATUSES.includes(raw) || ["Đang kiểm tra","Đã sửa xong","Bàn giao sử dụng","Hủy","Đã hoàn thành"].includes(raw)) return linkedRepairId ? "Đã chuyển sửa chữa" : "Mới ghi nhận";
  return linkedRepairId ? "Đã chuyển sửa chữa" : "Mới ghi nhận";
}
function normalizeIncidentPayloadStatus(requestedStatus, oldStatus, linkedRepairId) {
  const normalized = normalizeIncidentStatusForUi(requestedStatus || oldStatus, linkedRepairId);
  // Trạng thái “Đã chuyển sửa chữa” chỉ do endpoint chuyển sửa chữa sinh ra.
  if (normalized === "Đã chuyển sửa chữa" && !linkedRepairId) return "Mới ghi nhận";
  return normalized === "Đã chuyển sửa chữa" ? "Đã chuyển sửa chữa" : normalized;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}
function cleanupSingleUpload(req) {
  if (req?.file?.path) safeUnlink(req.file.path);
}
function technicalFileReference(filePath) {
  const value=String(filePath || "").trim();
  if(!value) return null;
  const maintenance=db.prepare("SELECT id FROM maintenances WHERE file_path=? LIMIT 1").get(value);
  if(maintenance) return {type:"Bảo dưỡng",id:maintenance.id};
  const inspection=db.prepare("SELECT id FROM inspections WHERE file_note=? LIMIT 1").get(value);
  if(inspection) return {type:"Kiểm định/Hiệu chuẩn",id:inspection.id};
  return null;
}

function zonedDateParts(date = new Date(), includeTime = false) {
  const options = {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.second = "2-digit";
    options.hourCycle = "h23";
  }
  const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(new Date(date));
  const out = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = p.value;
  return out;
}
function localDateISO(date = new Date()) {
  const p = zonedDateParts(date, false);
  return `${p.year}-${p.month}-${p.day}`;
}
function shiftIsoDate(value, days) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(value || "").slice(0,10);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]) + Number(days || 0), 12, 0, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function localDatePlusDays(days, base = new Date()) {
  return shiftIsoDate(localDateISO(base), days);
}
function nowSql() {
  const p = zonedDateParts(new Date(), true);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function makeIncidentCode(id, incidentDate = nowSql()) {
  const d = normalizeDateTime(incidentDate || nowSql()).slice(0, 10).replace(/-/g, "");
  return `SC-${d}-${String(id).padStart(4, "0")}`;
}

function buildIncidentSnapshot(deviceId) {
  const dv = db.prepare(`
    SELECT dv.*, d.name AS department_name
    FROM devices dv
    LEFT JOIN departments d ON d.code = dv.department_code
    WHERE dv.id=?
  `).get(deviceId);
  if (!dv) return null;
  return {
    device_code_snapshot: getDeviceCode(deviceId),
    device_name_snapshot: dv.name || "",
    department_snapshot: dv.department_name || dv.department_code || "",
    department_code_snapshot: dv.department_code || "",
    location_snapshot: dv.location || ""
  };
}

function completeIncidentRow(id, deviceId, actor = "", incidentDate = nowSql()) {
  const snap = buildIncidentSnapshot(deviceId) || {
    device_code_snapshot: "",
    device_name_snapshot: "",
    department_snapshot: "",
    department_code_snapshot: "",
    location_snapshot: ""
  };
  const t = nowSql();
  db.prepare(`
    UPDATE incidents
    SET incident_code = COALESCE(NULLIF(incident_code,''), @incident_code),
        device_code_snapshot = COALESCE(NULLIF(device_code_snapshot,''), @device_code_snapshot),
        device_name_snapshot = COALESCE(NULLIF(device_name_snapshot,''), @device_name_snapshot),
        department_snapshot = COALESCE(NULLIF(department_snapshot,''), @department_snapshot),
        department_code_snapshot = COALESCE(NULLIF(department_code_snapshot,''), @department_code_snapshot),
        location_snapshot = COALESCE(NULLIF(location_snapshot,''), @location_snapshot),
        created_at = COALESCE(NULLIF(created_at,''), @created_at),
        updated_at = @updated_at,
        updated_by = @updated_by
    WHERE id = @id
  `).run({
    id,
    incident_code: makeIncidentCode(id, incidentDate),
    created_at: t,
    updated_at: t,
    updated_by: actor || "",
    ...snap
  });
}

function touchIncident(id, deviceId, actor = "") {
  const snap = buildIncidentSnapshot(deviceId) || {};
  db.prepare(`
    UPDATE incidents
    SET device_code_snapshot = COALESCE(NULLIF(device_code_snapshot,''), @device_code_snapshot),
        device_name_snapshot = COALESCE(NULLIF(device_name_snapshot,''), @device_name_snapshot),
        department_snapshot = COALESCE(NULLIF(department_snapshot,''), @department_snapshot),
        department_code_snapshot = COALESCE(NULLIF(department_code_snapshot,''), @department_code_snapshot),
        location_snapshot = COALESCE(NULLIF(location_snapshot,''), @location_snapshot),
        updated_at = @updated_at,
        updated_by = @updated_by
    WHERE id = @id
  `).run({ id, updated_at: nowSql(), updated_by: actor || "", ...snap });
}

function replaceIncidentSnapshot(id, deviceId, actor = "") {
  const snap = buildIncidentSnapshot(deviceId);
  if (!snap) throw new Error("Thiết bị không tồn tại.");
  db.prepare(`
    UPDATE incidents
    SET device_code_snapshot=@device_code_snapshot,
        device_name_snapshot=@device_name_snapshot,
        department_snapshot=@department_snapshot,
        department_code_snapshot=@department_code_snapshot,
        location_snapshot=@location_snapshot,
        updated_at=@updated_at,
        updated_by=@updated_by
    WHERE id=@id
  `).run({ id:Number(id), updated_at:nowSql(), updated_by:actor || "", ...snap });
}

function writeHistory(module, recordId, actor, actionType, oldStatus = "", newStatus = "", note = "", cost = 0, entryType = "Cập nhật", actionTime = "") {
  const at = normalizeDateTime(actionTime || nowSql()) || nowSql();
  db.prepare(`
    INSERT INTO activity_history (module, record_id, action_time, actor, action_type, old_status, new_status, note, cost, entry_type)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(module, recordId, at, actor || "", actionType, oldStatus || "", newStatus || "", note || "", Number(cost || 0), entryType || "Cập nhật");
}


function refreshDemoTodayData() {
  const today = localDateISO();
  const t1 = `${today} 08:15`;
  const t2 = `${today} 09:10`;
  const t3 = `${today} 10:20`;
  try {
    const checkIds = db.prepare("SELECT id FROM daily_checks ORDER BY id LIMIT 2").all().map(x => x.id);
    checkIds.forEach((id, idx) => db.prepare("UPDATE daily_checks SET check_datetime=? WHERE id=?").run(idx === 0 ? t1 : t2, id));

    const incidentIds = db.prepare("SELECT id FROM incidents ORDER BY id LIMIT 2").all().map(x => x.id);
    incidentIds.forEach((id, idx) => db.prepare("UPDATE incidents SET incident_datetime=? WHERE id=?").run(idx === 0 ? t2 : t3, id));

    const repairIds = db.prepare("SELECT id FROM repairs ORDER BY id LIMIT 2").all().map(x => x.id);
    repairIds.forEach(id => db.prepare("UPDATE repairs SET repair_date=? WHERE id=?").run(today, id));

    const countChecksToday = db.prepare("SELECT COUNT(*) c FROM daily_checks WHERE substr(check_datetime,1,10)=?").get(today).c;
    if (!countChecksToday) {
      const d1 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1").get();
      const d2 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 1").get();
      if (d1) db.prepare(`INSERT INTO daily_checks (device_id,check_datetime,inspector,content,result,note) VALUES (?,?,?,?,?,?)`).run(d1.id,t1,"KTV TTBYT","Kiểm tra đầu ngày","Đạt","Dữ liệu demo");
      if (d2) db.prepare(`INSERT INTO daily_checks (device_id,check_datetime,inspector,content,result,note) VALUES (?,?,?,?,?,?)`).run(d2.id,t2,"KTV TTBYT","Kiểm tra đầu ngày","Đạt có lưu ý","Dữ liệu demo");
    }

    const countIncToday = db.prepare("SELECT COUNT(*) c FROM incidents WHERE substr(incident_datetime,1,10)=?").get(today).c;
    if (!countIncToday) {
      const d1 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 2").get() || db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1").get();
      const d2 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 3").get() || db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 1").get();
      if (d1) db.prepare(`INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,status,note) VALUES (?,?,?,?,?,?,?)`).run(d1.id,t2,"Sự cố demo trong ngày","Trung bình","KTV TTBYT","Mới ghi nhận","Tạo tự động để demo");
      if (d2) db.prepare(`INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,status,note) VALUES (?,?,?,?,?,?,?)`).run(d2.id,t3,"Cảnh báo demo trong ngày","Thấp","KTV TTBYT","Mới ghi nhận","Tạo tự động để demo");
    }

    const countRepairsToday = db.prepare("SELECT COUNT(*) c FROM repairs WHERE repair_date=?").get(today).c;
    if (!countRepairsToday) {
      const d1 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 4").get() || db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1").get();
      const d2 = db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 5").get() || db.prepare("SELECT id FROM devices ORDER BY id LIMIT 1 OFFSET 1").get();
      if (d1) db.prepare(`INSERT INTO repairs (device_id,repair_date,issue,work,person,method,cost,result,status_after,processing_status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(d1.id,today,"Lỗi demo trong ngày","Tiếp nhận xử lý","KTV TTBYT","Nội bộ",0,"Đang theo dõi","Đang hoạt động","Đang xử lý");
      if (d2) db.prepare(`INSERT INTO repairs (device_id,repair_date,issue,work,person,method,cost,result,status_after,processing_status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(d2.id,today,"Lỗi demo trong ngày","Đang chờ linh kiện","KTV TTBYT","Nội bộ",0,"Chờ linh kiện","Chờ sửa chữa","Chờ linh kiện");
    }
  } catch (e) {}
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_groups (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      department_code TEXT,
      status TEXT NOT NULL,
      phone TEXT,
      FOREIGN KEY (department_code) REFERENCES departments(code)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_code TEXT NOT NULL,
      group_code TEXT NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      year_in_use INTEGER,
      warranty_end TEXT,
      status TEXT,
      quality_level INTEGER DEFAULT 3,
      serial TEXT,
      country TEXT,
      year_manufactured INTEGER,
      cost INTEGER DEFAULT 0,
      funding TEXT,
      location TEXT,
      note TEXT,
      device_code TEXT,
      insurance_code TEXT,
      FOREIGN KEY (department_code) REFERENCES departments(code),
      FOREIGN KEY (group_code) REFERENCES device_groups(code)
    );

    CREATE TABLE IF NOT EXISTS accessories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      maker_country TEXT,
      serial TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      repair_date TEXT,
      issue TEXT,
      work TEXT,
      person TEXT,
      method TEXT,
      cost INTEGER DEFAULT 0,
      result TEXT,
      status_after TEXT,
      status_before TEXT,
      processing_status TEXT DEFAULT "Đang xử lý",
      incident_id INTEGER,
      received_at TEXT,
      updated_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS maintenances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      maintenance_date TEXT,
      type TEXT,
      content TEXT,
      result TEXT,
      performer TEXT,
      user_confirm TEXT,
      vendor TEXT,
      next_date TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      log_datetime TEXT,
      user_name TEXT,
      department_code TEXT,
      usage_count TEXT,
      status_before TEXT,
      status_after TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      doc_date TEXT,
      updated_by TEXT,
      note TEXT,
      original_name TEXT,
      stored_name TEXT,
      file_path TEXT,
      file_mime TEXT,
      file_size INTEGER DEFAULT 0,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      check_datetime TEXT NOT NULL,
      inspector TEXT NOT NULL,
      content TEXT NOT NULL,
      result TEXT NOT NULL,
      note TEXT,
      source_channel TEXT,
      department_code_snapshot TEXT,
      location_snapshot TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      incident_datetime TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      reporter TEXT NOT NULL,
      reporter_phone TEXT,
      status TEXT NOT NULL,
      note TEXT,
      local_resolution_note TEXT,
      incident_code TEXT,
      device_code_snapshot TEXT,
      device_name_snapshot TEXT,
      department_snapshot TEXT,
      department_code_snapshot TEXT,
      location_snapshot TEXT,
      source_channel TEXT,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      updated_by TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incident_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      device_id INTEGER NOT NULL,
      original_name TEXT,
      stored_name TEXT,
      file_path TEXT,
      file_mime TEXT,
      file_size INTEGER DEFAULT 0,
      uploaded_at TEXT,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      action_time TEXT NOT NULL,
      actor TEXT,
      action_type TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      note TEXT,
      cost REAL DEFAULT 0,
      entry_type TEXT DEFAULT 'Cập nhật'
    );
  `);

  try {
    const incidentRowsNeedCode = db.prepare(`
      SELECT id, device_id, incident_datetime, reporter
      FROM incidents
      WHERE incident_code IS NULL OR incident_code='' OR created_at IS NULL OR created_at=''
         OR device_code_snapshot IS NULL OR device_code_snapshot=''
    `).all();
    for (const r of incidentRowsNeedCode) {
      completeIncidentRow(r.id, r.device_id, r.reporter || "Hệ thống", r.incident_datetime || nowSql());
    }
  } catch (e) {}

  const maintCols = db.prepare("PRAGMA table_info(maintenances)").all().map(x => x.name);
  if (!maintCols.includes("original_name")) db.exec("ALTER TABLE maintenances ADD COLUMN original_name TEXT");
  if (!maintCols.includes("stored_name")) db.exec("ALTER TABLE maintenances ADD COLUMN stored_name TEXT");
  if (!maintCols.includes("file_path")) db.exec("ALTER TABLE maintenances ADD COLUMN file_path TEXT");
  if (!maintCols.includes("file_mime")) db.exec("ALTER TABLE maintenances ADD COLUMN file_mime TEXT");
  if (!maintCols.includes("file_size")) db.exec("ALTER TABLE maintenances ADD COLUMN file_size INTEGER DEFAULT 0");

  const docCols = db.prepare("PRAGMA table_info(documents)").all().map(x => x.name);
  if (!docCols.includes("original_name")) db.exec("ALTER TABLE documents ADD COLUMN original_name TEXT");
  if (!docCols.includes("stored_name")) db.exec("ALTER TABLE documents ADD COLUMN stored_name TEXT");
  if (!docCols.includes("file_path")) db.exec("ALTER TABLE documents ADD COLUMN file_path TEXT");
  if (!docCols.includes("file_mime")) db.exec("ALTER TABLE documents ADD COLUMN file_mime TEXT");
  if (!docCols.includes("file_size")) db.exec("ALTER TABLE documents ADD COLUMN file_size INTEGER DEFAULT 0");

  const deptCount = db.prepare("SELECT COUNT(*) AS c FROM departments").get().c;
  // Không tự chèn dữ liệu mẫu trên bản chạy thật. Chỉ seed khi chủ động bật QY4_DEMO_SEED=1.
  if (deptCount === 0 && process.env.QY4_DEMO_SEED === "1") seedData();
}

function seedData() {
  const departments = [
    ["A1","A1 - Khoa Quốc tế"],["A10","A10 - Khoa Y học cổ truyền"],["A12","A12 - Khoa Hồi sức tích cực - Chống độc"],
    ["A15","A15 - Khoa Nội thận - Lọc máu"],["A2","A2 - Khoa Nội tim mạch - Hô hấp"],["A3","A3 - Khoa Nội tiêu hóa - Huyết học lâm sàng"],
    ["A4","A4 - Khoa Truyền nhiễm - Da liễu - Dị ứng"],["A6","A6 - Khoa Ung bướu"],["A7","A7 - Khoa Thần kinh - Tâm thần"],
    ["A8","A8 - Khoa Đột quỵ"],["A9","A9 - Khoa Phục hồi chức năng"],["B1","B1 - Khoa Chấn thương chỉnh hình"],
    ["B10","B10 - Khoa Phụ sản - Nhi"],["B11","B11 - Khoa Răng - Hàm - Mặt"],["B3","B3 - Khoa Ngoại tổng hợp"],
    ["B5","B5 - Khoa Gây mê hồi sức"],["B7","B7 - Khoa Mắt"],["B9","B9 - Khoa Tai - Mũi - Họng"],
    ["C1","C1 - Khoa Khám bệnh"],["C15","C15 - Khoa Cấp cứu"],["C2","C2 - Khoa Xét nghiệm - Giải phẫu bệnh"],
    ["C7","C7 - Khoa Chẩn đoán hình ảnh - Chẩn đoán chức năng"],["C10","C10 - Khoa Trang bị"]
  ];
  const groups = [
    ["XQ","Xquang"],["CT","CT"],["MRI","MRI"],["SP","SPECT"],["SA","Siêu âm"],["MON","Monitor"],
    ["DT","Điện tim"],["MTH","Máy thở"],["MT","Máy thận"],["XN","Xét nghiệm"],["HH","Huyết học"],
    ["MD","Miễn dịch"],["SH","Sinh hóa"],["DM","Đông máu"],["KHV","Kính hiển vi"],["K","Khác"]
  ];
  const users = [
    ["Nguyễn Văn Admin","admin","Quản trị viên","C10","Hoạt động","0988000001"],
    ["Trần Văn Kỹ thuật","kythuat01","Kỹ sư TTBYT","C10","Hoạt động","0988000002"],
    ["Hoàng Thị Lan","cdha01","Người dùng khoa","C7","Hoạt động","0988000003"],
    ["Phạm Đức Hùng","hstc01","Người dùng khoa","A12","Hoạt động","0988000004"],
    ["Lê Thị Mai","xetnghiem01","Người dùng khoa","C2","Hoạt động","0988000005"]
  ];
  const insertDept = db.prepare("INSERT INTO departments (code,name) VALUES (?,?)");
  const insertGroup = db.prepare("INSERT INTO device_groups (code,name) VALUES (?,?)");
  const insertUser = db.prepare("INSERT INTO users (full_name,username,role,department_code,status,phone) VALUES (?,?,?,?,?,?)");
  departments.forEach(r => insertDept.run(...r));
  groups.forEach(r => insertGroup.run(...r));
  users.forEach(r => insertUser.run(...r));

  const insertDevice = db.prepare(`
    INSERT INTO devices (department_code,group_code,name,manufacturer,model,year_in_use,warranty_end,status,quality_level,serial,country,year_manufactured,cost,funding,location,note,device_code,insurance_code)
    VALUES (@department_code,@group_code,@name,@manufacturer,@model,@year_in_use,@warranty_end,@status,@quality_level,@serial,@country,@year_manufactured,@cost,@funding,@location,@note,@device_code,@insurance_code)
  `);
  const insertAccessory = db.prepare("INSERT INTO accessories (device_id,name,code,maker_country,serial,note) VALUES (?,?,?,?,?,?)");
  const insertRepair = db.prepare("INSERT INTO repairs (device_id,repair_date,issue,work,person,method,cost,result,status_after,processing_status) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const insertMaintenance = db.prepare("INSERT INTO maintenances (device_id,maintenance_date,type,content,result,performer,user_confirm,vendor,next_date,note) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const insertOperation = db.prepare("INSERT INTO operation_logs (device_id,log_datetime,user_name,department_code,usage_count,status_before,status_after,note) VALUES (?,?,?,?,?,?,?,?)");
  const insertDocument = db.prepare("INSERT INTO documents (device_id,name,type,doc_date,updated_by,note) VALUES (?,?,?,?,?,?)");
  const insertCheck = db.prepare("INSERT INTO daily_checks (device_id,check_datetime,inspector,content,result,note) VALUES (?,?,?,?,?,?)");
  const insertIncident = db.prepare("INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,status,note) VALUES (?,?,?,?,?,?,?)");

  const devices = [
    { department_code:"C1",group_code:"DT",name:"Máy điện tim 12 chuyển đạo",manufacturer:"Nihon Kohden",model:"Cardiofax G ECG-2350",year_in_use:2020,warranty_end:"2025-05-15",status:"Đang hoạt động",serial:"ECG2350-C1-001",country:"Nhật Bản",year_manufactured:2019,cost:185000000,funding:"Ngân sách Quốc phòng",location:"Phòng khám tim mạch",note:"Máy sử dụng thường xuyên tại phòng khám tim mạch.",
      accessories:[["Dây điện tim 10 cực","ECG-CABLE","Nihon Kohden - Nhật Bản","CB-001","Đầy đủ"],["Bộ kẹp điện cực","CLAMP","Nihon Kohden - Nhật Bản","CL-001","Tốt"]],
      repairs:[["2026-02-12","In nhiệt kém","Thay giấy in và vệ sinh đầu in","Nguyễn Văn A","Nội bộ",0,"Hoạt động tốt","Đang hoạt động"]],
      maints:[["2026-03-05","Bảo dưỡng định kỳ","Kiểm tra dây nguồn, điện cực và độ ổn định tín hiệu","Đạt","Tổ TTBYT","Khoa Khám bệnh","Nội bộ","2026-09-05","Máy ổn định"]],
      logs:[["2026-04-10 08:20","Điều dưỡng Lan","C1","18 ca","Bình thường","Bình thường",""]],
      docs:[["Biên bản bàn giao máy ECG","Biên bản bàn giao","2020-02-10","Khoa Trang bị","Bản scan PDF"]]
    },
    { department_code:"C7",group_code:"CT",name:"Máy CT Scanner 64 lát",manufacturer:"Canon Medical",model:"Aquilion Prime SP",year_in_use:2022,warranty_end:"2027-12-31",status:"Đang hoạt động",serial:"CT64002",country:"Nhật Bản",year_manufactured:2021,cost:16500000000,funding:"Ngân sách Nhà nước",location:"Phòng CT",note:"Máy chính phục vụ chẩn đoán hình ảnh toàn viện.",
      accessories:[["Bàn bệnh nhân","CT-TABLE","Canon Medical - Nhật Bản","CT-64002-TB","Tốt"],["Bộ xử lý ảnh","CT-WKS","Canon Medical - Nhật Bản","CT-64002-WKS","Tốt"]],
      repairs:[["2026-04-03","Quạt làm mát phát tiếng ồn","Vệ sinh quạt và căn chỉnh cụm giá đỡ","Nguyễn Văn B","Nội bộ",0,"Theo dõi thêm","Đang hoạt động"]],
      maints:[["2026-04-02","Kiểm tra chất lượng","Kiểm tra quạt làm mát, nhiệt độ hệ thống, độ ổn định nguồn","Đạt có lưu ý","Nguyễn Hữu Hoàng","Khoa CĐHA","Nội bộ","2026-05-02","Theo dõi thêm tiếng ồn và nhiệt độ quạt"]],
      logs:[["2026-04-11 09:00","KTV Hùng","C7","32 ca","Bình thường","Có lưu ý","Tiếng quạt hơi lớn"]],
      docs:[["Hướng dẫn sử dụng CT 64 lát","Hướng dẫn sử dụng","2022-01-05","Canon Medical","Bản mềm PDF"]]
    },
    { department_code:"C7",group_code:"MRI",name:"Hệ thống MRI 1.5T",manufacturer:"GE Healthcare",model:"SIGNA Creator",year_in_use:2022,warranty_end:"2027-10-20",status:"Đang hoạt động",serial:"MRI15T-C7-001",country:"Mỹ",year_manufactured:2021,cost:23800000000,funding:"Ngân sách Nhà nước",location:"Phòng MRI",note:"Máy chụp cộng hưởng từ 1.5T.",
      accessories:[["Cuộn thu đầu","HEAD-COIL","GE Healthcare - Mỹ","HC-115A","Tốt"],["Cuộn thu cột sống","SPINE-COIL","GE Healthcare - Mỹ","SC-220B","Tốt"]],
      repairs:[],
      maints:[["2026-03-18","Bảo dưỡng định kỳ","Kiểm tra cryogen, hệ thống lạnh, độ ổn định gradient","Đạt","GE Service","Khoa CĐHA","GE Healthcare","2026-09-18","Hệ thống ổn định"]],
      logs:[["2026-04-11 14:10","KTV Tú","C7","12 ca","Bình thường","Bình thường",""]],
      docs:[]
    },
    { department_code:"A12",group_code:"MON",name:"Monitor theo dõi bệnh nhân 5 thông số",manufacturer:"Mindray",model:"iPM 10",year_in_use:2022,warranty_end:"2026-09-30",status:"Đang hoạt động",serial:"MON-A12-001",country:"Trung Quốc",year_manufactured:2021,cost:58000000,funding:"Ngân sách Quốc phòng",location:"Buồng HSTC 1",note:"Monitor giường hồi sức.",accessories:[],repairs:[],maints:[["2026-01-15","Kiểm tra an toàn điện","Đo rò điện và kiểm tra pin","Đạt","Tổ TTBYT","A12","Nội bộ","2027-01-15",""]],logs:[],docs:[] },
    { department_code:"A12",group_code:"MTH",name:"Máy thở chức năng cao",manufacturer:"Dräger",model:"Evita V500",year_in_use:2021,warranty_end:"2026-08-31",status:"Đang hoạt động",serial:"VENT-A12-001",country:"Đức",year_manufactured:2020,cost:980000000,funding:"Nguồn viện trợ",location:"Buồng HSTC 2",note:"Máy thở hồi sức xâm nhập/không xâm nhập.",accessories:[["Bình làm ẩm","HUM-01","Dräger - Đức","HM-091","Tốt"]],repairs:[],maints:[["2026-02-20","Bảo dưỡng định kỳ","Thay lọc khí, kiểm tra cảm biến lưu lượng","Đạt","Dräger Service","A12","Dräger","2026-08-20",""]],logs:[],docs:[] },
    { department_code:"A15",group_code:"MT",name:"Máy thận nhân tạo",manufacturer:"Fresenius",model:"4008S",year_in_use:2021,warranty_end:"2026-11-30",status:"Đang hoạt động",serial:"HD-A15-001",country:"Đức",year_manufactured:2020,cost:420000000,funding:"Nguồn dịch vụ",location:"Đơn nguyên lọc máu 1",note:"Máy chạy thận nhân tạo thường quy.",accessories:[["Bộ kẹp đường máu","CLAMP-HD","Fresenius - Đức","CL-789","Tốt"]],repairs:[],maints:[["2026-03-10","Kiểm tra chất lượng","Kiểm tra bơm dịch và cảm biến áp lực","Đạt","Fresenius VN","A15","Fresenius","2026-09-10",""]],logs:[],docs:[] },
    { department_code:"C2",group_code:"SH",name:"Máy xét nghiệm sinh hóa tự động",manufacturer:"Beckman Coulter",model:"AU5800",year_in_use:2021,warranty_end:"2026-12-31",status:"Đang hoạt động",serial:"SH-C2-001",country:"Mỹ",year_manufactured:2020,cost:2100000000,funding:"Ngân sách Nhà nước",location:"Phòng sinh hóa",note:"Máy sinh hóa công suất lớn.",accessories:[["Bộ trộn mẫu","MIXER","Beckman - Mỹ","MX-09","Tốt"]],repairs:[],maints:[["2026-03-28","Bảo dưỡng định kỳ","Vệ sinh hệ thống hút mẫu, calibrate quang học","Đạt","Hãng","C2","Beckman","2026-09-28",""]],logs:[],docs:[] },
    { department_code:"C2",group_code:"HH",name:"Máy xét nghiệm huyết học 5 thành phần",manufacturer:"Sysmex",model:"XN-1000",year_in_use:2020,warranty_end:"2025-08-15",status:"Hoạt động hạn chế",serial:"HH-C2-001",country:"Nhật Bản",year_manufactured:2019,cost:890000000,funding:"Ngân sách Nhà nước",location:"Phòng huyết học",note:"Thỉnh thoảng báo lỗi hút mẫu.",accessories:[["Module hút mẫu","SAMPLER","Sysmex - Nhật Bản","SM-33","Mới ghi nhận"]],repairs:[["2026-03-30","Báo lỗi hút mẫu","Kiểm tra bơm và thay ống mềm","KTV Trang bị","Nội bộ",1200000,"Đã khắc phục tạm thời","Hoạt động hạn chế"]],maints:[],logs:[],docs:[] },
    { department_code:"C2",group_code:"MD",name:"Máy xét nghiệm miễn dịch tự động",manufacturer:"Roche",model:"Cobas e 411",year_in_use:2022,warranty_end:"2027-03-20",status:"Đang hoạt động",serial:"MD-C2-001",country:"Thụy Sĩ",year_manufactured:2021,cost:1380000000,funding:"Ngân sách Nhà nước",location:"Phòng miễn dịch",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C2",group_code:"DM",name:"Máy xét nghiệm đông máu tự động",manufacturer:"Stago",model:"STA Compact Max",year_in_use:2023,warranty_end:"2028-01-15",status:"Đang hoạt động",serial:"DM-C2-001",country:"Pháp",year_manufactured:2022,cost:760000000,funding:"Ngân sách Nhà nước",location:"Phòng đông máu",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C2",group_code:"KHV",name:"Kính hiển vi 2 mắt điện",manufacturer:"Olympus",model:"CX23",year_in_use:2019,warranty_end:"2024-12-31",status:"Đang hoạt động",serial:"MIC-C2-001",country:"Nhật Bản",year_manufactured:2018,cost:32000000,funding:"Ngân sách Quốc phòng",location:"Phòng GPB",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C7",group_code:"XQ",name:"Máy Xquang kỹ thuật số cố định",manufacturer:"Shimadzu",model:"RADspeed Pro",year_in_use:2021,warranty_end:"2026-10-15",status:"Đang hoạt động",serial:"XQ-C7-001",country:"Nhật Bản",year_manufactured:2020,cost:4300000000,funding:"Ngân sách Nhà nước",location:"Phòng Xquang 1",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C7",group_code:"SA",name:"Máy siêu âm màu tổng quát 4D",manufacturer:"GE",model:"Voluson E10",year_in_use:2021,warranty_end:"2026-07-15",status:"Đang hoạt động",serial:"SA-C7-001",country:"Áo",year_manufactured:2020,cost:2850000000,funding:"Nguồn dịch vụ",location:"Phòng siêu âm",note:"",accessories:[["Đầu dò Convex","C1-5","GE - Áo","CVX-00321","Đầy đủ"],["Đầu dò Linear","L3-12","GE - Áo","LIN-00892","Đầy đủ"]],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C7",group_code:"SP",name:"Hệ thống máy chụp xạ hình SPECT",manufacturer:"Siemens",model:"Symbia Evo",year_in_use:2023,warranty_end:"2028-02-28",status:"Đang hoạt động",serial:"SP-C7-001",country:"Đức",year_manufactured:2022,cost:19800000000,funding:"Ngân sách Nhà nước",location:"Phòng y học hạt nhân",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"A2",group_code:"DT",name:"Hệ thống Holter điện tim/Huyết áp",manufacturer:"GE",model:"SEER 1000",year_in_use:2022,warranty_end:"2027-09-01",status:"Đang hoạt động",serial:"DT-A2-001",country:"Mỹ",year_manufactured:2021,cost:240000000,funding:"Ngân sách Quốc phòng",location:"Phòng chẩn đoán chức năng tim mạch",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"B9",group_code:"K",name:"Hệ thống nội soi khám Tai Mũi Họng",manufacturer:"Karl Storz",model:"ENT Complete",year_in_use:2021,warranty_end:"2026-06-30",status:"Đang hoạt động",serial:"ENT-B9-001",country:"Đức",year_manufactured:2020,cost:960000000,funding:"Nguồn dịch vụ",location:"Phòng nội soi TMH",note:"Tạm xếp nhóm Khác để hiển thị ngoài bảng.",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"B7",group_code:"K",name:"Kính hiển vi khám mắt đèn khe",manufacturer:"Topcon",model:"SL-D701",year_in_use:2020,warranty_end:"2025-12-31",status:"Đang hoạt động",serial:"MAT-B7-001",country:"Nhật Bản",year_manufactured:2019,cost:165000000,funding:"Ngân sách Quốc phòng",location:"Phòng khám mắt",note:"Xếp nhóm Khác do danh sách nhóm ngoài bảng được giữ gọn.",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"B11",group_code:"XQ",name:"Máy Xquang răng kỹ thuật số",manufacturer:"Vatech",model:"EzRay Air",year_in_use:2023,warranty_end:"2028-03-12",status:"Đang hoạt động",serial:"XQ-B11-001",country:"Hàn Quốc",year_manufactured:2022,cost:198000000,funding:"Nguồn dịch vụ",location:"Phòng RHM",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"B3",group_code:"MON",name:"Monitor theo dõi bệnh nhân 7 thông số",manufacturer:"Philips",model:"IntelliVue MX550",year_in_use:2022,warranty_end:"2027-04-22",status:"Đang hoạt động",serial:"MON-B3-001",country:"Mỹ",year_manufactured:2021,cost:128000000,funding:"Ngân sách Quốc phòng",location:"Hậu phẫu Ngoại",note:"",accessories:[],repairs:[],maints:[],logs:[],docs:[] },
    { department_code:"C15",group_code:"MTH",name:"Máy thở dã chiến",manufacturer:"Aeonmed",model:"VG70",year_in_use:2020,warranty_end:"2025-10-10",status:"Chờ sửa chữa",serial:"VENT-C15-001",country:"Trung Quốc",year_manufactured:2019,cost:325000000,funding:"Nguồn viện trợ",location:"Kho cấp cứu",note:"Đang chờ thay cảm biến oxy.",accessories:[],repairs:[["2026-04-08","Sai lệch chỉ số oxy","Đặt hàng cảm biến thay thế","Tổ TTBYT","Nội bộ",2500000,"Chờ linh kiện","Chờ sửa chữa"]],maints:[],logs:[],docs:[] }
  ];

  const tx = db.transaction(() => {
    devices.forEach(device => {
      // Bảo đảm chế độ demo cũng có đủ mọi named parameter của câu INSERT.
      const info = insertDevice.run({ quality_level: 3, device_code: "", insurance_code: "", ...device });
      const deviceId = info.lastInsertRowid;
      device.accessories.forEach(x => insertAccessory.run(deviceId, ...x));
      device.repairs.forEach(x => insertRepair.run(deviceId, ...x));
      device.maints.forEach(x => insertMaintenance.run(deviceId, ...x));
      device.logs.forEach(x => insertOperation.run(deviceId, ...x));
      device.docs.forEach(x => insertDocument.run(deviceId, ...x));
    });
  });

  tx();

  const existingAccessories = db.prepare("SELECT COUNT(*) AS c FROM accessories WHERE device_id=?");
  const existingLogs = db.prepare("SELECT COUNT(*) AS c FROM operation_logs WHERE device_id=?");
  const existingDocs = db.prepare("SELECT COUNT(*) AS c FROM documents WHERE device_id=?");
  const allSeedDevices = db.prepare("SELECT id, group_code, serial, department_code FROM devices").all();

  function defaultAccessories(groupCode, serial) {
    if (groupCode === "DT") return [["Cáp điện tim 10 lõi",`PK-${serial}-01`,"Nhật Bản",`${serial}-A01`,"Phụ kiện đồng bộ theo máy"],["Bộ điện cực ngực",`PK-${serial}-02`,"Nhật Bản",`${serial}-A02`,"Sử dụng cùng máy"]];
    if (groupCode === "CT") return [["Bộ bơm tiêm thuốc cản quang",`PK-${serial}-01`,"Hoa Kỳ",`${serial}-A01`,"Phụ kiện đồng bộ hệ CT"],["Bộ UPS công suất lớn",`PK-${serial}-02`,"Việt Nam",`${serial}-A02`,"Nguồn lưu điện"]];
    if (groupCode === "MRI") return [["Head Coil",`PK-${serial}-01`,"Hoa Kỳ",`${serial}-A01`,"Cuộn thu tín hiệu đồng bộ"],["Spine Coil",`PK-${serial}-02`,"Hoa Kỳ",`${serial}-A02`,"Phụ kiện đồng bộ MRI"]];
    if (groupCode === "MON") return [["Cáp ECG 5 chuyển đạo",`PK-${serial}-01`,"Trung Quốc",`${serial}-A01`,"Phụ kiện đồng bộ monitor"],["Cảm biến SpO2",`PK-${serial}-02`,"Trung Quốc",`${serial}-A02`,"Phụ kiện đồng bộ monitor"]];
    if (groupCode === "MTH" || groupCode === "MT") return [["Bộ dây máy",`PK-${serial}-01`,"Đức",`${serial}-A01`,"Phụ kiện đồng bộ theo máy"],["Cảm biến theo máy",`PK-${serial}-02`,"Đức",`${serial}-A02`,"Phụ kiện đồng bộ"]];
    if (["SH","HH","XN","MD","DM"].includes(groupCode)) return [["Máy in nhiệt",`PK-${serial}-01`,"Trung Quốc",`${serial}-A01`,"Phụ trợ in kết quả"],["Bộ giá mẫu",`PK-${serial}-02`,"Hoa Kỳ",`${serial}-A02`,"Phụ kiện theo máy"]];
    if (groupCode === "SA") return [["Đầu dò chính",`PK-${serial}-01`,"Hoa Kỳ",`${serial}-A01`,"Đầu dò đồng bộ"],["Đầu dò phụ",`PK-${serial}-02`,"Hoa Kỳ",`${serial}-A02`,"Đầu dò đồng bộ"]];
    if (groupCode === "XQ") return [["Tấm nhận ảnh DR",`PK-${serial}-01`,"Hàn Quốc",`${serial}-A01`,"Phụ kiện đồng bộ"],["Bộ ắc quy lưu động",`PK-${serial}-02`,"Hàn Quốc",`${serial}-A02`,"Nguồn cho máy lưu động"]];
    return [["Phụ kiện đi kèm 1",`PK-${serial}-01`,"Việt Nam",`${serial}-A01`,"Phụ kiện đồng bộ"]];
  }

  allSeedDevices.forEach(d => {
    if (existingAccessories.get(d.id).c === 0) defaultAccessories(d.group_code, d.serial).forEach(x => insertAccessory.run(d.id, ...x));
    if (existingLogs.get(d.id).c === 0) {
      insertOperation.run(d.id, "2026-04-10 08:00", "KTV phụ trách", d.department_code, "1 ca", "Sẵn sàng", "Hoạt động tốt", "Khởi động đầu ngày");
      insertOperation.run(d.id, "2026-04-10 15:30", "KTV phụ trách", d.department_code, "2-5 ca", "Đang hoạt động", "Đang hoạt động", "Ghi nhận cuối ca");
    }
    if (existingDocs.get(d.id).c === 0) {
      insertDocument.run(d.id, "Biên bản bàn giao", "Hồ sơ pháp lý", "2025-01-15", "Admin", "Lưu hồ sơ gốc");
      insertDocument.run(d.id, "Phiếu bảo hành", "Hồ sơ kỹ thuật", "2025-01-20", "Admin", "Theo nhà cung cấp");
      insertDocument.run(d.id, "Hướng dẫn sử dụng", "Tài liệu kỹ thuật", "2025-01-21", "Admin", "Bản mềm nội bộ");
    }
  });

  insertCheck.run(2, "2026-04-11 08:15", "Nguyễn Hữu Hoàng", "Kiểm tra nhiệt độ hệ thống và quạt làm mát", "Đạt có lưu ý", "Theo dõi tiếng ồn quạt");
  insertCheck.run(4, "2026-04-11 09:05", "Phạm Đức Hùng", "Kiểm tra dây ECG, cảm biến SpO2, pin monitor", "Đạt", "");
  insertCheck.run(7, "2026-04-11 09:40", "Lê Thị Mai", "Kiểm tra hệ thống hút mẫu và quang học", "Đạt", "");
  insertCheck.run(20, "2026-04-11 10:10", "Tổ TTBYT", "Kiểm tra cảm biến oxy và nguồn nuôi", "Không đạt", "Chờ thay cảm biến");

  insertIncident.run(20, "2026-04-11 08:50", "Sai lệch chỉ số oxy khi vận hành", "Cao", "Điều dưỡng Cấp cứu", "Mới ghi nhận", "Đã báo Tổ TTBYT");
  insertIncident.run(8, "2026-04-11 09:15", "Báo lỗi hút mẫu không ổn định", "Trung bình", "KTV Xét nghiệm", "Mới ghi nhận", "Máy vẫn vận hành hạn chế");
  insertIncident.run(2, "2026-04-10 14:30", "Quạt làm mát phát tiếng ồn", "Thấp", "KTV CĐHA", "Mới ghi nhận", "Đang theo dõi");
}


function dateRangeFromPreset(preset, date, fromDate, toDate) {
  if (fromDate && toDate) return { start: String(fromDate).slice(0,10), end: String(toDate).slice(0,10) };
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : localDateISO();
  if (preset === "yesterday") {
    const day = shiftIsoDate(selected, -1);
    return { start: day, end: day };
  }
  if (preset === "last7") return { start: shiftIsoDate(selected, -6), end: selected };
  return { start: selected, end: selected };
}

function normalizeDeviceCode(value, departmentCode = "XX", groupCode = "K") {
  const dept = String(departmentCode || "XX").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "XX";
  const group = String(groupCode || "K").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "K";
  const raw = String(value || "").trim().toUpperCase();
  let m = raw.match(/^QY4[-.]?([A-Z0-9]+)[-.]([A-Z0-9]+)[-.](\d{4})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = raw.match(/^([A-Z0-9]+)[-.]([A-Z0-9]+)[-.](\d{4})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = raw.match(/(\d{4})$/);
  if (m) return `${dept}.${group}.${m[1]}`;
  return "";
}

function getDeviceCode(id) {
  const row = db.prepare(`SELECT device_code, department_code, group_code FROM devices WHERE id = ?`).get(id);
  if (!row) return "";
  const normalized = normalizeDeviceCode(row.device_code, row.department_code, row.group_code);
  if (normalized) {
    if (normalized !== row.device_code) db.prepare("UPDATE devices SET device_code=? WHERE id=?").run(normalized, id);
    return normalized;
  }
  const code = generateDeviceCode(row.department_code, row.group_code);
  db.prepare("UPDATE devices SET device_code=? WHERE id=?").run(code, id);
  return code;
}


function enrichDevice(device) {
  return { ...device, device_code: getDeviceCode(device.id), qr_uid: ensureDeviceQrUid(device.id) };
}

function ensureDeviceCodeColumnsAndData() {
  const cols = db.prepare("PRAGMA table_info(devices)").all().map(c => c.name);
  if (!cols.includes("device_code")) db.prepare("ALTER TABLE devices ADD COLUMN device_code TEXT").run();
  if (!cols.includes("insurance_code")) db.prepare("ALTER TABLE devices ADD COLUMN insurance_code TEXT").run();
  const rows = db.prepare("SELECT id, department_code, group_code, serial, device_code, insurance_code FROM devices ORDER BY id").all();
  const seen = new Set();
  for (const r of rows) {
    // Không tự di chuyển/xóa Serial sang mã bảo hiểm. Hai trường này là dữ liệu độc lập.
    const current = normalizeDeviceCode(r.device_code, r.department_code, r.group_code);
    if (current && !seen.has(current)) {
      seen.add(current);
      if (current !== r.device_code) db.prepare("UPDATE devices SET device_code=? WHERE id=?").run(current, r.id);
      continue;
    }
    const code = generateDeviceCode(r.department_code, r.group_code);
    seen.add(code);
    db.prepare("UPDATE devices SET device_code=? WHERE id=?").run(code, r.id);
  }
  try { db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code)").run(); } catch (e) {}
}
function generateDeviceCode(departmentCode, groupCode) {
  const dept = String(departmentCode || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XX';
  const group = String(groupCode || 'K').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'K';
  const prefix = `${dept}.${group}.`;
  const rows = db.prepare("SELECT device_code FROM devices WHERE device_code LIKE ? ORDER BY device_code").all(prefix + "%");
  let max = 0;
  for (const r of rows) {
    const normalized = normalizeDeviceCode(r.device_code, dept, group);
    const m = String(normalized || '').match(/\.(\d{4})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function normalizeIncidentStatusesInDb() {
  try {
    db.prepare(`UPDATE incidents SET status='Đã chuyển sửa chữa' WHERE status IN ('Chuyển sửa chữa','Chờ linh kiện','Đang kiểm tra','Đang sửa chữa','Đã sửa xong','Bàn giao sử dụng')`).run();
    db.prepare(`UPDATE incidents SET status='Đã xử lý tại chỗ' WHERE status IN ('Đã xử lý','Đóng','Không cần sửa chữa')`).run();
    db.prepare(`UPDATE incidents SET status='Đã tiếp nhận' WHERE status IN ('Tiếp nhận')`).run();
    db.prepare(`UPDATE incidents SET status='Mới ghi nhận' WHERE status IN ('Đã ghi nhận','Theo dõi') OR status IS NULL OR status=''`).run();
    db.prepare(`
      UPDATE incidents
      SET status='Đã chuyển sửa chữa'
      WHERE id IN (SELECT DISTINCT incident_id FROM repairs WHERE incident_id IS NOT NULL)
    `).run();
    db.prepare(`
      UPDATE incidents
      SET status='Mới ghi nhận'
      WHERE status NOT IN ('Mới ghi nhận','Đã tiếp nhận','Đã chuyển sửa chữa','Đã xử lý tại chỗ')
        AND id NOT IN (SELECT DISTINCT incident_id FROM repairs WHERE incident_id IS NOT NULL)
    `).run();
  } catch (e) {}
}

function ensureDeviceQualityColumn() {
  const cols = db.prepare("PRAGMA table_info(devices)").all().map(c => c.name);
  if (!cols.includes("quality_level")) {
    db.prepare("ALTER TABLE devices ADD COLUMN quality_level INTEGER DEFAULT 3").run();
  }
}

function makeQrUid() {
  return crypto.randomUUID();
}

function ensureDeviceQrUid(deviceId) {
  const row = db.prepare("SELECT id, qr_uid FROM devices WHERE id=?").get(Number(deviceId));
  if (!row) return "";
  if (row.qr_uid) return row.qr_uid;
  let uid = makeQrUid();
  while (db.prepare("SELECT 1 FROM devices WHERE qr_uid=?").get(uid)) uid = makeQrUid();
  db.prepare("UPDATE devices SET qr_uid=? WHERE id=?").run(uid, row.id);
  return uid;
}

function ensureCoreManagementSchema() {
  const cols = db.prepare("PRAGMA table_info(devices)").all().map(c => c.name);
  if (!cols.includes("qr_uid")) db.prepare("ALTER TABLE devices ADD COLUMN qr_uid TEXT").run();
  if (!cols.includes("is_archived")) db.prepare("ALTER TABLE devices ADD COLUMN is_archived INTEGER DEFAULT 0").run();
  if (!cols.includes("archived_at")) db.prepare("ALTER TABLE devices ADD COLUMN archived_at TEXT").run();

  const checkCols = db.prepare("PRAGMA table_info(daily_checks)").all().map(c => c.name);
  if (!checkCols.includes("source_channel")) db.prepare("ALTER TABLE daily_checks ADD COLUMN source_channel TEXT").run();
  if (!checkCols.includes("department_code_snapshot")) db.prepare("ALTER TABLE daily_checks ADD COLUMN department_code_snapshot TEXT").run();
  if (!checkCols.includes("location_snapshot")) db.prepare("ALTER TABLE daily_checks ADD COLUMN location_snapshot TEXT").run();
  db.prepare("UPDATE daily_checks SET source_channel='Không xác định' WHERE source_channel IS NULL OR trim(source_channel)=''").run();

  const incidentCols = db.prepare("PRAGMA table_info(incidents)").all().map(c => c.name);
  if (!incidentCols.includes("acknowledged_at")) db.prepare("ALTER TABLE incidents ADD COLUMN acknowledged_at TEXT").run();
  if (!incidentCols.includes("acknowledged_by")) db.prepare("ALTER TABLE incidents ADD COLUMN acknowledged_by TEXT").run();
  if (!incidentCols.includes("completed_at")) db.prepare("ALTER TABLE incidents ADD COLUMN completed_at TEXT").run();
  if (!incidentCols.includes("source_channel")) db.prepare("ALTER TABLE incidents ADD COLUMN source_channel TEXT").run();
  if (!incidentCols.includes("department_code_snapshot")) db.prepare("ALTER TABLE incidents ADD COLUMN department_code_snapshot TEXT").run();
  db.prepare("UPDATE incidents SET source_channel='Không xác định' WHERE source_channel IS NULL OR trim(source_channel)=''").run();
  db.prepare(`
    UPDATE incidents
    SET department_code_snapshot = COALESCE(
      (SELECT d.code FROM departments d WHERE d.name=incidents.department_snapshot LIMIT 1),
      (SELECT d.code FROM departments d WHERE d.code=incidents.department_snapshot LIMIT 1),
      (SELECT dv.department_code FROM devices dv WHERE dv.id=incidents.device_id LIMIT 1),
      ''
    )
    WHERE department_code_snapshot IS NULL OR trim(department_code_snapshot)=''
  `).run();

  const rows = db.prepare("SELECT id, qr_uid FROM devices ORDER BY id").all();
  for (const r of rows) {
    if (!r.qr_uid) ensureDeviceQrUid(r.id);
  }
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_qr_uid ON devices(qr_uid)").run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS device_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      transfer_datetime TEXT NOT NULL,
      from_department_code TEXT,
      from_location TEXT,
      to_department_code TEXT NOT NULL,
      to_location TEXT,
      reason TEXT,
      actor TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_device_transfers_device ON device_transfers(device_id, transfer_datetime);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_time TEXT NOT NULL,
      actor TEXT,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(action_time DESC);

    CREATE TABLE IF NOT EXISTS inventory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_date TEXT NOT NULL,
      department_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Đang kiểm kê',
      actor TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      device_id INTEGER NOT NULL,
      expected_department_code TEXT,
      expected_location TEXT,
      result TEXT NOT NULL DEFAULT 'Chưa kiểm kê',
      actual_department_code TEXT,
      actual_location TEXT,
      note TEXT,
      updated_at TEXT,
      updated_by TEXT,
      UNIQUE(session_id, device_id),
      FOREIGN KEY (session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_items_session ON inventory_items(session_id);
  `);
}

function requestActor(req, fallback = "Hệ thống") {
  return String(req.authUser?.full_name || req.body?.actor || fallback || "Hệ thống").trim() || "Hệ thống";
}

function writeAudit(actor, actionType, entityType, entityId, details = "") {
  try {
    db.prepare(`
      INSERT INTO audit_logs (action_time, actor, action_type, entity_type, entity_id, details)
      VALUES (?,?,?,?,?,?)
    `).run(nowSql(), actor || "Hệ thống", actionType, entityType, String(entityId || ""), details || "");
  } catch (e) {
    console.error("writeAudit error:", e.message);
  }
}

function ensureAuthSchema() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(x => x.name);
  if (!cols.includes("password_hash")) db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run();
  if (!cols.includes("password_salt")) db.prepare("ALTER TABLE users ADD COLUMN password_salt TEXT").run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
  `);
  db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(Date.now());

  if (AUTH_REQUIRED) {
    const bootstrapPassword = String(process.env.QY4_ADMIN_PASSWORD || "");
    let admin = db.prepare("SELECT * FROM users WHERE role='Quản trị viên' ORDER BY id LIMIT 1").get();
    if (!admin && bootstrapPassword) {
      const username = String(process.env.QY4_ADMIN_USERNAME || "admin").trim() || "admin";
      const info = db.prepare(`
        INSERT INTO users (full_name,username,role,department_code,status,phone)
        VALUES (?,?,?,?,?,?)
      `).run("Quản trị viên", username, "Quản trị viên", null, "Hoạt động", "");
      admin = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    }
    if (admin && !admin.password_hash && bootstrapPassword) {
      setUserPassword(admin.id, bootstrapPassword);
      console.log("Đã thiết lập mật khẩu quản trị ban đầu từ QY4_ADMIN_PASSWORD.");
    }
    const readyAdmin = db.prepare("SELECT id FROM users WHERE role='Quản trị viên' AND status='Hoạt động' AND COALESCE(password_hash,'')<>'' LIMIT 1").get();
    if (!readyAdmin) {
      console.warn("QY4_AUTH_REQUIRED=1 nhưng chưa có tài khoản Quản trị viên có mật khẩu. Hãy đặt QY4_ADMIN_PASSWORD khi khởi động lần đầu.");
    }
  }
}

initDb();
ensureCoreManagementSchema();
ensureAuthSchema();
ensureDeviceCodeColumnsAndData();
normalizeIncidentStatusesInDb();
try {
  db.prepare("UPDATE devices SET status='Chờ sửa chữa' WHERE status='Hoạt động hạn chế'").run();
  db.prepare("UPDATE repairs SET processing_status='Đang xử lý' WHERE processing_status IN ('Mới tiếp nhận','Đang kiểm tra','Đang sửa chữa')").run();
  db.prepare("UPDATE repairs SET processing_status='Đã hoàn thành' WHERE processing_status IN ('Đã sửa xong','Bàn giao sử dụng')").run();
  db.prepare("UPDATE repairs SET received_at=COALESCE(NULLIF(received_at,''), repair_date) WHERE received_at IS NULL OR received_at=''").run();
  db.prepare("UPDATE repairs SET updated_at=COALESCE(NULLIF(updated_at,''), repair_date) WHERE updated_at IS NULL OR updated_at=''").run();
  db.prepare("UPDATE repairs SET completed_at=COALESCE(NULLIF(completed_at,''), repair_date) WHERE processing_status IN ('Đã hoàn thành') AND (completed_at IS NULL OR completed_at='')").run();
} catch (e) {}



app.get("/api/auth/status", (req, res) => {
  const ready = AUTH_REQUIRED
    ? Boolean(db.prepare("SELECT id FROM users WHERE role='Quản trị viên' AND status='Hoạt động' AND COALESCE(password_hash,'')<>'' LIMIT 1").get())
    : true;
  res.json({ auth_required: AUTH_REQUIRED, ready });
});

app.get("/api/auth/me", (req, res) => {
  if (!AUTH_REQUIRED) return res.json({ auth_required: false, user: null });
  const user = readAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Chưa đăng nhập." });
  res.json({
    auth_required: true,
    user: {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      department_code: user.department_code || ""
    }
  });
});

app.post("/api/auth/login", (req, res) => {
  if (!AUTH_REQUIRED) return res.status(400).json({ error: "Chế độ đăng nhập chưa được bật." });
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(username);
  if (!user || user.status !== "Hoạt động" || !verifyUserPassword(user, password)) {
    return res.status(401).json({ error: "Tài khoản hoặc mật khẩu không đúng." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const created = Date.now();
  const expires = created + SESSION_HOURS * 3600 * 1000;
  db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(created);
  db.prepare("INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)")
    .run(sessionTokenHash(token), user.id, created, expires);
  const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS*3600}${secure ? "; Secure" : ""}`);
  writeAudit(user.full_name || user.username, "Đăng nhập", "auth", user.id, user.username);
  res.json({ ok: true, user: { id:user.id, full_name:user.full_name, username:user.username, role:user.role, department_code:user.department_code || "" } });
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token) db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(sessionTokenHash(token));
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

function initExtendedModules() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      inspection_date TEXT,
      type TEXT,
      organization TEXT,
      certificate_no TEXT,
      result TEXT,
      next_date TEXT,
      file_note TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quality_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL UNIQUE,
      rating_date TEXT,
      age_score INTEGER DEFAULT 0,
      performance_score INTEGER DEFAULT 0,
      repair_score INTEGER DEFAULT 0,
      inspection_score INTEGER DEFAULT 0,
      sparepart_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      grade TEXT,
      recommendation TEXT,
      evaluator TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER,
      indicator TEXT,
      value INTEGER DEFAULT 0,
      unit TEXT,
      note TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );
  `);

  if (process.env.QY4_DEMO_SEED !== "1") return;

  const inspectionCount = db.prepare("SELECT COUNT(*) c FROM inspections").get().c;
  if (inspectionCount === 0) {
    const devices = db.prepare("SELECT id, group_code FROM devices ORDER BY id LIMIT 12").all();
    const insertInspection = db.prepare(`INSERT INTO inspections (device_id,inspection_date,type,organization,certificate_no,result,next_date,file_note,note) VALUES (?,?,?,?,?,?,?,?,?)`);
    devices.forEach((d, idx) => {
      const type = ["CT","MRI","XQ"].includes(d.group_code) ? "Kiểm định an toàn bức xạ" : (["MON","MTH","DT"].includes(d.group_code) ? "Hiệu chuẩn" : "Kiểm định");
      const m = String((idx % 9) + 1).padStart(2,"0");
      insertInspection.run(d.id, `2026-${m}-15`, type, "Trung tâm kiểm định/hiệu chuẩn", `QY4-${String(idx+1).padStart(4,"0")}`, "Đạt", `2027-${m}-15`, "Đính kèm bản scan khi có", "Dữ liệu mẫu");
    });
  }

  const qualityCount = db.prepare("SELECT COUNT(*) c FROM quality_ratings").get().c;
  if (qualityCount === 0) {
    const devices = db.prepare("SELECT id, year_in_use, status FROM devices ORDER BY id").all();
    const insertQuality = db.prepare(`INSERT INTO quality_ratings (device_id,rating_date,age_score,performance_score,repair_score,inspection_score,sparepart_score,total_score,grade,recommendation,evaluator,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const currentYear = new Date().getFullYear();
    devices.forEach(d => {
      const age = Math.max(0, currentYear - Number(d.year_in_use || currentYear));
      const age_score = age <= 3 ? 25 : age <= 7 ? 20 : age <= 10 ? 15 : 8;
      const performance_score = d.status === "Đang hoạt động" ? 25 : d.status === "Hoạt động hạn chế" ? 18 : 8;
      const repair_score = d.status === "Chờ sửa chữa" ? 8 : 20;
      const inspection_score = 15;
      const sparepart_score = age <= 7 ? 15 : 10;
      const total = age_score + performance_score + repair_score + inspection_score + sparepart_score;
      const grade = total >= 90 ? "A" : total >= 80 ? "B" : total >= 65 ? "C" : "D";
      const recommendation = grade === "A" ? "Tiếp tục khai thác" : grade === "B" ? "Theo dõi định kỳ" : grade === "C" ? "Lập kế hoạch sửa chữa/thay thế" : "Đề nghị thay thế hoặc thanh lý";
      insertQuality.run(d.id, "2026-06-05", age_score, performance_score, repair_score, inspection_score, sparepart_score, total, grade, recommendation, "Khoa Trang bị", "Tự động sinh dữ liệu mẫu");
    });
  }

  const usageCount = db.prepare("SELECT COUNT(*) c FROM usage_reports").get().c;
  if (usageCount === 0) {
    const devices = db.prepare("SELECT id, group_code FROM devices ORDER BY id LIMIT 20").all();
    const insertUsage = db.prepare(`INSERT INTO usage_reports (device_id,year,month,indicator,value,unit,note) VALUES (?,?,?,?,?,?,?)`);
    devices.forEach((d, idx) => {
      let indicator = "Số ca", unit = "ca";
      if (["SH","HH","XN","MD","DM"].includes(d.group_code)) { indicator = "Số test"; unit = "test"; }
      if (["CT","MRI","XQ","SA"].includes(d.group_code)) { indicator = "Ca chụp/siêu âm"; unit = "ca"; }
      if (["MTH","MON"].includes(d.group_code)) { indicator = "Ngày sử dụng"; unit = "ngày"; }
      insertUsage.run(d.id, 2026, null, indicator, (idx+1)*120 + 450, unit, "Dữ liệu mẫu phục vụ báo cáo thực lực");
    });
  }
}

initExtendedModules();



app.get("/api/departments", (req, res) => {
  const rows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM devices dv WHERE dv.department_code = d.code) AS device_count,
      (SELECT COUNT(*) FROM users u WHERE u.department_code = d.code) AS user_count
    FROM departments d
    ORDER BY d.code
  `).all();
  res.json(rows);
});

app.post("/api/departments", (req, res) => {
  const { code, name } = req.body;
  db.prepare("INSERT INTO departments (code, name) VALUES (?, ?)").run(code, name);
  res.json({ ok: true });
});

app.put("/api/departments/:code", (req, res) => {
  const oldCode = req.params.code;
  const { code, name } = req.body;
  const tx = db.transaction(() => {
    if (oldCode !== code) {
      db.prepare("UPDATE devices SET department_code = ? WHERE department_code = ?").run(code, oldCode);
      db.prepare("UPDATE users SET department_code = ? WHERE department_code = ?").run(code, oldCode);
      db.prepare("UPDATE operation_logs SET department_code = ? WHERE department_code = ?").run(code, oldCode);
    }
    db.prepare("UPDATE departments SET code = ?, name = ? WHERE code = ?").run(code, name, oldCode);
  });
  tx();
  res.json({ ok: true });
});

app.delete("/api/departments/:code", (req, res) => {
  const code = req.params.code;
  const used = db.prepare("SELECT COUNT(*) AS c FROM devices WHERE department_code = ?").get(code).c
             + db.prepare("SELECT COUNT(*) AS c FROM users WHERE department_code = ?").get(code).c;
  if (used > 0) return res.status(400).json({ error: "Khoa/phòng đang được sử dụng, không thể xóa." });
  db.prepare("DELETE FROM departments WHERE code = ?").run(code);
  res.json({ ok: true });
});

app.get("/api/device-groups", (req, res) => {
  const rows = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM devices dv WHERE dv.group_code = g.code) AS device_count
    FROM device_groups g
    ORDER BY g.code
  `).all();
  res.json(rows);
});

app.post("/api/device-groups", (req, res) => {
  const { code, name } = req.body;
  db.prepare("INSERT INTO device_groups (code, name) VALUES (?, ?)").run(code, name);
  res.json({ ok: true });
});

app.put("/api/device-groups/:code", (req, res) => {
  const oldCode = req.params.code;
  const { code, name } = req.body;
  const tx = db.transaction(() => {
    if (oldCode !== code) {
      db.prepare("UPDATE devices SET group_code = ? WHERE group_code = ?").run(code, oldCode);
    }
    db.prepare("UPDATE device_groups SET code = ?, name = ? WHERE code = ?").run(code, name, oldCode);
  });
  tx();
  res.json({ ok: true });
});

app.delete("/api/device-groups/:code", (req, res) => {
  const code = req.params.code;
  const used = db.prepare("SELECT COUNT(*) AS c FROM devices WHERE group_code = ?").get(code).c;
  if (used > 0) return res.status(400).json({ error: "Nhóm thiết bị đang được sử dụng, không thể xóa." });
  db.prepare("DELETE FROM device_groups WHERE code = ?").run(code);
  res.json({ ok: true });
});

app.get("/api/meta", (req, res) => {
  res.json({
    departments: db.prepare("SELECT * FROM departments ORDER BY code").all(),
    groups: db.prepare("SELECT * FROM device_groups ORDER BY code").all()
  });
});

const USER_ROLES = ["Quản trị viên","Kỹ sư TTBYT","Người dùng khoa"];
function activeAdminCount(excludeId = 0) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM users
    WHERE role='Quản trị viên' AND status='Hoạt động' AND (?=0 OR id<>?)
  `).get(Number(excludeId || 0), Number(excludeId || 0)).c;
}

app.get("/api/users", (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.full_name,u.username,u.role,u.department_code,u.status,u.phone,
           CASE WHEN COALESCE(u.password_hash,'')<>'' THEN 1 ELSE 0 END AS has_password,
           d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON d.code = u.department_code
    ORDER BY u.id
  `).all();
  res.json(rows);
});

app.post("/api/users", (req, res) => {
  try {
    const { full_name, username, role, department_code, status, phone, password } = req.body;
    if (!full_name || !username || !role) return res.status(400).json({ error: "Thiếu họ tên, tài khoản hoặc vai trò." });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ error: "Vai trò người dùng không hợp lệ." });
    if (status && !["Hoạt động","Ngừng hoạt động"].includes(status)) return res.status(400).json({ error: "Trạng thái người dùng không hợp lệ." });
    if (AUTH_REQUIRED && !password) return res.status(400).json({ error: "Khi bật xác thực, người dùng mới phải có mật khẩu." });
    const info = db.prepare(`
      INSERT INTO users (full_name, username, role, department_code, status, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(full_name, username, role, department_code || null, status || "Hoạt động", phone || "");
    if (password) setUserPassword(info.lastInsertRowid, password);
    writeAudit(req.authUser?.full_name || "Quản trị viên", "Tạo người dùng", "user", info.lastInsertRowid, username);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/users/:id", (req, res) => {
  try {
    const { full_name, username, role, department_code, status, phone, password } = req.body;
    const old = db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.params.id));
    if (!old) return res.status(404).json({ error: "Không tìm thấy người dùng." });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ error: "Vai trò người dùng không hợp lệ." });
    if (!["Hoạt động","Ngừng hoạt động"].includes(status || "Hoạt động")) return res.status(400).json({ error: "Trạng thái người dùng không hợp lệ." });
    const wouldRemoveActiveAdmin = old.role === "Quản trị viên" && old.status === "Hoạt động"
      && (role !== "Quản trị viên" || (status || "Hoạt động") !== "Hoạt động");
    if (wouldRemoveActiveAdmin && activeAdminCount(old.id) === 0) {
      return res.status(400).json({ error: "Không thể hạ quyền hoặc ngừng hoạt động Quản trị viên cuối cùng." });
    }
    db.prepare(`
      UPDATE users SET full_name=?, username=?, role=?, department_code=?, status=?, phone=?
      WHERE id=?
    `).run(full_name, username, role, department_code || null, status || "Hoạt động", phone || "", req.params.id);
    if (password) setUserPassword(req.params.id, password);
    if (status !== "Hoạt động") db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(Number(req.params.id));
    writeAudit(req.authUser?.full_name || "Quản trị viên", "Cập nhật người dùng", "user", req.params.id, `${old.username} → ${username}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "Không tìm thấy người dùng." });
  if (AUTH_REQUIRED && Number(req.authUser?.id || 0) === id) {
    return res.status(400).json({ error: "Không thể tự xóa tài khoản đang đăng nhập." });
  }
  if (old.role === "Quản trị viên" && old.status === "Hoạt động" && activeAdminCount(id) === 0) {
    return res.status(400).json({ error: "Không thể xóa Quản trị viên cuối cùng." });
  }
  db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  writeAudit(req.authUser?.full_name || "Quản trị viên", "Xóa người dùng", "user", id, old.username || "");
  res.json({ ok: true });
});

app.get("/api/devices", (req, res) => {
  const includeArchived = String(req.query.include_archived || "") === "1";
  const scopedDepartment = AUTH_REQUIRED && req.authUser?.role === "Người dùng khoa"
    ? String(req.authUser.department_code || "")
    : "";
  const rows = db.prepare(`
    SELECT dv.*, d.name AS department_name, g.name AS group_name
    FROM devices dv
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    WHERE (? = 1 OR COALESCE(dv.is_archived,0)=0)
      AND (? = '' OR dv.department_code = ?)
    ORDER BY dv.id
  `).all(includeArchived ? 1 : 0, scopedDepartment, scopedDepartment).map(enrichDevice);
  res.json(rows);
});

function serialKey(value) {
  return String(value || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function isMeaningfulSerial(value) {
  const key=serialKey(value);
  if(!key) return false;
  return !new Set(["NN","N/A","NA","UNKNOWN","KHONG CO","CHUA RO","NONE","NIL","0","-","--"]).has(key);
}
function findSerialDuplicate(serial, excludeId = 0) {
  if(!isMeaningfulSerial(serial)) return null;
  return db.prepare(`
    SELECT id,device_code,name,department_code,is_archived
    FROM devices
    WHERE lower(trim(serial))=lower(trim(?)) AND trim(serial)<>''
      AND (?=0 OR id<>?)
    ORDER BY COALESCE(is_archived,0),id
    LIMIT 1
  `).get(String(serial).trim(), Number(excludeId||0), Number(excludeId||0)) || null;
}

app.get("/api/devices/duplicate-check", (req, res) => {
  const serial = String(req.query.serial || "").trim();
  const name = String(req.query.name || "").trim();
  const model = String(req.query.model || "").trim();
  const excludeId = Number(req.query.exclude_id || 0);
  const serialMatches = isMeaningfulSerial(serial) ? db.prepare(`
    SELECT id, device_code, name, model, serial, department_code
    FROM devices
    WHERE lower(trim(serial))=lower(trim(?)) AND trim(serial)<>'' AND (?=0 OR id<>?)
    ORDER BY id
  `).all(serial, excludeId, excludeId).map(enrichDevice) : [];
  const similarMatches = (name && model) ? db.prepare(`
    SELECT id, device_code, name, model, serial, department_code
    FROM devices
    WHERE lower(trim(name))=lower(trim(?)) AND lower(trim(model))=lower(trim(?))
      AND (?=0 OR id<>?)
    ORDER BY id
  `).all(name, model, excludeId, excludeId).map(enrichDevice) : [];
  res.json({
    serial_duplicate: serialMatches.length > 0,
    serial_matches: serialMatches,
    similar_matches: similarMatches
  });
});

app.get("/api/devices/:id", (req, res) => {
  const device = db.prepare(`
    SELECT dv.*, d.name AS department_name, g.name AS group_name
    FROM devices dv
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    WHERE dv.id = ?
  `).get(req.params.id);
  if (!device) return res.status(404).json({ error: "Not found" });
  if (AUTH_REQUIRED && req.authUser?.role === "Người dùng khoa"
      && String(device.department_code || "") !== String(req.authUser.department_code || "")) {
    return res.status(403).json({ error: "Thiết bị không thuộc khoa của tài khoản này." });
  }
  const id = Number(req.params.id);
  const incidentRows = db.prepare(`
      SELECT i.*, lr.id AS linked_repair_id, lr.processing_status AS linked_repair_status
      FROM incidents i
      LEFT JOIN repairs lr ON lr.incident_id = i.id
      WHERE i.device_id = ?
      ORDER BY i.incident_datetime DESC, i.id DESC
    `).all(id);
  const incidentFiles = getIncidentFilesMap(incidentRows.map(r => r.id));
  const data = {
    ...enrichDevice(device),
    accessories: db.prepare("SELECT * FROM accessories WHERE device_id = ? ORDER BY id").all(id),
    repairs: db.prepare(`
      SELECT r.*, i.id AS source_incident_id, i.description AS source_incident_description
      FROM repairs r
      LEFT JOIN incidents i ON i.id = r.incident_id
      WHERE r.device_id = ?
      ORDER BY COALESCE(r.received_at, r.repair_date) DESC, r.id DESC
    `).all(id).map(r => ({ ...r, processing_status: normalizeRepairStatus(r.processing_status) })),
    incidents: incidentRows.map(r => ({ ...r, status: normalizeIncidentStatusForUi(r.status, r.linked_repair_id), files: incidentFiles[r.id] || [] })),
    maintenances: db.prepare("SELECT * FROM maintenances WHERE device_id = ? ORDER BY id DESC").all(id),
    inspections: db.prepare("SELECT * FROM inspections WHERE device_id = ? ORDER BY id DESC").all(id).map(r => ({ ...r, device_code: getDeviceCode(r.device_id), device_name: device.name, department_code: device.department_code })),
    operation_logs: db.prepare("SELECT * FROM operation_logs WHERE device_id = ? ORDER BY id DESC").all(id),
    documents: db.prepare("SELECT * FROM documents WHERE device_id = ? ORDER BY id DESC").all(id),
    transfers: db.prepare("SELECT * FROM device_transfers WHERE device_id = ? ORDER BY transfer_datetime DESC, id DESC").all(id)
  };
  res.json(data);
});

function buildDevicePayload(input = {}, current = null) {
  const src = input || {};
  const old = current || {};
  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  };
  const text = (value, fallback = "") => String(value ?? fallback ?? "").trim();
  const quality = Math.max(1, Math.min(5, Math.round(num(src.quality_level, old.quality_level || 3) || 3)));
  return {
    department_code:text(src.department_code, old.department_code),
    group_code:text(src.group_code, old.group_code),
    name:text(src.name, old.name),
    manufacturer:text(src.manufacturer, old.manufacturer),
    model:text(src.model, old.model),
    year_in_use:num(src.year_in_use, old.year_in_use),
    warranty_end:text(src.warranty_end, old.warranty_end),
    status:text(src.status, old.status || "Đang hoạt động") || "Đang hoạt động",
    quality_level:quality,
    serial:text(src.serial, old.serial),
    country:text(src.country, old.country),
    year_manufactured:num(src.year_manufactured, old.year_manufactured),
    cost:Math.max(0, num(src.cost, old.cost)),
    funding:text(src.funding, old.funding),
    location:text(src.location, old.location),
    note:text(src.note, old.note),
    device_code:text(src.device_code, old.device_code),
    insurance_code:text(src.insurance_code, old.insurance_code)
  };
}
function validateDevicePayload(payload) {
  const missing=[];
  if(!payload.department_code) missing.push("Khoa sử dụng");
  if(!payload.group_code) missing.push("Nhóm thiết bị");
  if(!payload.name) missing.push("Tên thiết bị");
  if(missing.length) return `Thiếu thông tin bắt buộc: ${missing.join(", ")}`;
  if(!db.prepare("SELECT code FROM departments WHERE code=?").get(payload.department_code)) return "Khoa sử dụng không tồn tại trong danh mục.";
  if(!db.prepare("SELECT code FROM device_groups WHERE code=?").get(payload.group_code)) return "Nhóm thiết bị không tồn tại trong danh mục.";
  if(!["Đang hoạt động","Hoạt động hạn chế","Chờ sửa chữa","Ngừng hoạt động"].includes(payload.status)) return "Tình trạng thiết bị không hợp lệ.";
  if(payload.year_in_use && (payload.year_in_use < 1900 || payload.year_in_use > 2100)) return "Năm sử dụng không hợp lệ.";
  if(payload.year_manufactured && (payload.year_manufactured < 1900 || payload.year_manufactured > 2100)) return "Năm sản xuất không hợp lệ.";
  return "";
}

app.post("/api/devices", (req, res) => {
  try {
    const payload = buildDevicePayload(req.body || {});
    const error = validateDevicePayload(payload);
    if (error) return res.status(400).json({ error });
    payload.device_code = payload.device_code
      ? (normalizeDeviceCode(payload.device_code, payload.department_code, payload.group_code) || payload.device_code)
      : generateDeviceCode(payload.department_code, payload.group_code);
    if (db.prepare("SELECT id FROM devices WHERE device_code=? LIMIT 1").get(payload.device_code)) {
      return res.status(400).json({ error:"Mã thiết bị đã được sử dụng, kể cả trong hồ sơ đã lưu trữ." });
    }
    const serialDuplicate=findSerialDuplicate(payload.serial,0);
    const allowDuplicateSerial = req.body?.allow_duplicate_serial === true || String(req.body?.allow_duplicate_serial || "") === "1";
    if(serialDuplicate && !allowDuplicateSerial){
      return res.status(409).json({ error:`Serial ${payload.serial} đã có ở ${serialDuplicate.device_code || "thiết bị #"+serialDuplicate.id}. Hãy kiểm tra lại trước khi lưu.` });
    }
    const info = db.prepare(`
      INSERT INTO devices (department_code,group_code,name,manufacturer,model,year_in_use,warranty_end,status,quality_level,serial,country,year_manufactured,cost,funding,location,note,device_code,insurance_code)
      VALUES (@department_code,@group_code,@name,@manufacturer,@model,@year_in_use,@warranty_end,@status,@quality_level,@serial,@country,@year_manufactured,@cost,@funding,@location,@note,@device_code,@insurance_code)
    `).run(payload);
    const qrUid = ensureDeviceQrUid(info.lastInsertRowid);
    writeAudit(requestActor(req), "Tạo thiết bị", "device", info.lastInsertRowid, `${payload.device_code} | ${payload.name}`);
    if(serialDuplicate && allowDuplicateSerial) writeAudit(requestActor(req), "Xác nhận Serial trùng", "device", info.lastInsertRowid, `${payload.serial} trùng với ${serialDuplicate.device_code || "#"+serialDuplicate.id}`);
    res.json({ id: info.lastInsertRowid, qr_uid: qrUid });
  } catch (e) {
    console.error("POST /api/devices error:", e);
    res.status(400).json({ error:e.message || "Không thể tạo thiết bị." });
  }
});

app.put("/api/devices/:id", (req, res) => {
  try {
    const old = db.prepare("SELECT * FROM devices WHERE id=?").get(Number(req.params.id));
    if (!old) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
    const payload = buildDevicePayload(req.body || {}, old);
    const error = validateDevicePayload(payload);
    if (error) return res.status(400).json({ error });
    if (payload.device_code) {
      payload.device_code = normalizeDeviceCode(payload.device_code, payload.department_code, payload.group_code) || payload.device_code;
      const duplicateCode = db.prepare("SELECT id FROM devices WHERE device_code=? AND id<>? LIMIT 1").get(payload.device_code, Number(req.params.id));
      if (duplicateCode) return res.status(400).json({ error:"Mã thiết bị đã được sử dụng, kể cả trong hồ sơ đã lưu trữ." });
    }
    const serialDuplicate=findSerialDuplicate(payload.serial,Number(req.params.id));
    const allowDuplicateSerial = req.body?.allow_duplicate_serial === true || String(req.body?.allow_duplicate_serial || "") === "1";
    if(serialDuplicate && !allowDuplicateSerial){
      return res.status(409).json({ error:`Serial ${payload.serial} đã có ở ${serialDuplicate.device_code || "thiết bị #"+serialDuplicate.id}. Hãy kiểm tra lại trước khi lưu.` });
    }
    db.prepare(`
      UPDATE devices SET
        department_code=@department_code, group_code=@group_code, name=@name, manufacturer=@manufacturer,
        model=@model, year_in_use=@year_in_use, warranty_end=@warranty_end, status=@status, quality_level=@quality_level, serial=@serial,
        country=@country, year_manufactured=@year_manufactured, cost=@cost, funding=@funding, location=@location, note=@note,
        device_code=COALESCE(NULLIF(@device_code,''), device_code), insurance_code=@insurance_code
      WHERE id=@id
    `).run({ ...payload, id: Number(req.params.id) });
    ensureDeviceQrUid(req.params.id);
    writeAudit(requestActor(req), "Cập nhật thiết bị", "device", req.params.id, `Mã: ${old.device_code || ""}; Serial: ${old.serial || ""} → ${payload.serial || ""}; Khoa: ${old.department_code || ""} → ${payload.department_code || ""}`);
    if(serialDuplicate && allowDuplicateSerial) writeAudit(requestActor(req), "Xác nhận Serial trùng", "device", req.params.id, `${payload.serial} trùng với ${serialDuplicate.device_code || "#"+serialDuplicate.id}`);
    res.json({ ok: true, qr_uid: ensureDeviceQrUid(req.params.id) });
  } catch (e) {
    console.error("PUT /api/devices/:id error:", e);
    res.status(400).json({ error:e.message || "Không thể cập nhật thiết bị." });
  }
});

app.delete("/api/devices/:id", (req, res) => {
  const id = Number(req.params.id);
  const device = db.prepare("SELECT * FROM devices WHERE id=?").get(id);
  if (!device) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  if (Number(device.is_archived || 0) === 1) return res.json({ ok:true, archived:true, qr_uid:ensureDeviceQrUid(id), already_archived:true });

  const openRepair=db.prepare("SELECT id FROM repairs WHERE device_id=? AND COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Chờ linh kiện') LIMIT 1").get(id);
  if(openRepair) return res.status(400).json({error:`Thiết bị còn phiếu sửa chữa #${openRepair.id} chưa hoàn thành; chưa thể lưu trữ.`});
  const openIncident=db.prepare("SELECT id FROM incidents WHERE device_id=? AND status IN ('Mới ghi nhận','Đã tiếp nhận') LIMIT 1").get(id);
  if(openIncident) return res.status(400).json({error:`Thiết bị còn sự cố #${openIncident.id} chưa hoàn tất; chưa thể lưu trữ.`});
  const openInventory=db.prepare(`
    SELECT s.id
    FROM inventory_items i JOIN inventory_sessions s ON s.id=i.session_id
    WHERE i.device_id=? AND s.status='Đang kiểm kê'
    LIMIT 1
  `).get(id);
  if(openInventory) return res.status(400).json({error:`Thiết bị đang nằm trong đợt kiểm kê #${openInventory.id}; hãy hoàn thành kiểm kê trước khi lưu trữ.`});

  db.prepare("UPDATE devices SET is_archived=1, archived_at=?, status='Ngừng hoạt động' WHERE id=?").run(nowSql(), id);
  writeAudit(requestActor(req), "Lưu trữ thiết bị", "device", id, `${device.device_code || ""} | ${device.name || ""}`);
  res.json({ ok: true, archived: true, qr_uid: ensureDeviceQrUid(id) });
});

app.get("/api/repairs", (req, res) => {
  const rows = db.prepare(`
    SELECT
      r.*,
      COALESCE(r.processing_status, 'Đang xử lý') AS processing_status,
      dv.name AS device_name,
      dv.department_code,
      dv.group_code,
      dv.location,
      dv.model,
      dv.serial,
      i.id AS source_incident_id,
      i.description AS source_incident_description,
      d.name AS department_name,
      g.name AS group_name
    FROM repairs r
    LEFT JOIN devices dv ON dv.id = r.device_id
    LEFT JOIN incidents i ON i.id = r.incident_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    ORDER BY r.id DESC
  `).all().map(r => ({ ...r, processing_status: normalizeRepairStatus(r.processing_status), device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

app.post("/api/repairs", (req, res) => {
  try {
    const p = req.body || {};
    if (p.incident_id) return res.status(400).json({ error: "Phiếu liên kết sự cố phải được tạo từ chức năng Chuyển sửa chữa của sự cố." });
    if (!p.device_id) return res.status(400).json({ error: "Vui lòng chọn thiết bị." });
    const device = db.prepare("SELECT id,status FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(Number(p.device_id));
    if (!device) return res.status(400).json({ error: "Thiết bị không tồn tại hoặc đã lưu trữ." });
    const existingOpen = db.prepare("SELECT id FROM repairs WHERE device_id=? AND COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Chờ linh kiện') ORDER BY id DESC LIMIT 1").get(Number(p.device_id));
    if (existingOpen) return res.status(400).json({ error: `Thiết bị đang có phiếu sửa chữa #${existingOpen.id} chưa hoàn thành.` });
    const payload = {
      device_id: Number(p.device_id),
      repair_date: normalizeDateTime(p.repair_date || ""),
      issue: p.issue || "",
      work: p.work || "",
      person: p.person || "",
      method: p.method || "",
      cost: Number(p.cost || 0),
      result: p.result || "",
      status_after: statusAfterFromRepairStatus(p.processing_status || "Đang xử lý", p.status_after || "Đang hoạt động"),
      status_before: device.status || "Đang hoạt động",
      processing_status: normalizeRepairStatus(p.processing_status || "Đang xử lý"),
      incident_id: p.incident_id ? Number(p.incident_id) : null,
      received_at: normalizeDateTime(p.received_at || p.repair_date || nowSql()),
      updated_at: nowSql(),
      completed_at: ["Đã hoàn thành"].includes(normalizeRepairStatus(p.processing_status || "Đang xử lý")) ? nowSql() : ""
    };
    const info = db.prepare(`
      INSERT INTO repairs (device_id, repair_date, issue, work, person, method, cost, result, status_after, status_before, processing_status, incident_id, received_at, updated_at, completed_at)
      VALUES (@device_id, @repair_date, @issue, @work, @person, @method, @cost, @result, @status_after, @status_before, @processing_status, @incident_id, @received_at, @updated_at, @completed_at)
    `).run(payload);
    db.prepare(`UPDATE devices SET status=? WHERE id=?`).run(payload.status_after, payload.device_id);
    if (!p.skip_history) {
      const note = payload.incident_id
        ? `Tạo phiếu sửa chữa từ sự cố ${p.incident_code || ('#' + payload.incident_id)}`
        : (payload.issue || payload.work || "Tạo phiếu sửa chữa");
      writeHistory("repair", info.lastInsertRowid, payload.person || "Khoa Trang bị", payload.incident_id ? "Tạo từ sự cố" : "Tạo phiếu", "", payload.processing_status, note, payload.cost, payload.incident_id ? "Tự động" : "Tự động", p.action_time || payload.received_at || payload.repair_date);
      writeAudit(requestActor(req, payload.person || "Khoa Trang bị"), "Tạo phiếu sửa chữa", "repair", info.lastInsertRowid, note);
    }
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error("POST /api/repairs error:", e);
    res.status(500).json({ error: e.message });
  }
});


app.post("/api/accessories", (req, res) => {
  const p = req.body;
  const info = db.prepare(`
    INSERT INTO accessories (device_id,name,code,maker_country,serial,note)
    VALUES (@device_id,@name,@code,@maker_country,@serial,@note)
  `).run(p);
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/accessories/:id", (req, res) => {
  const p = req.body;
  db.prepare(`
    UPDATE accessories SET name=@name, code=@code, maker_country=@maker_country, serial=@serial, note=@note
    WHERE id=@id
  `).run({ ...p, id: Number(req.params.id) });
  res.json({ ok: true });
});

app.delete("/api/accessories/:id", (req, res) => {
  db.prepare("DELETE FROM accessories WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.put("/api/repairs/:id", (req, res) => {
  try {
    const p = req.body || {};
    if (!p.device_id) return res.status(400).json({ error: "Vui lòng chọn thiết bị." });
    const old = db.prepare("SELECT * FROM repairs WHERE id=?").get(req.params.id);
    if (!old) return res.status(404).json({ error: "Không tìm thấy phiếu sửa chữa." });
    if (Number(old.device_id) !== Number(p.device_id)) {
      return res.status(400).json({ error: "Không thể đổi thiết bị của phiếu sửa chữa đã tạo. Nếu là phiếu độc lập tạo nhầm, hãy xóa phiếu khi còn đủ điều kiện và tạo lại." });
    }
    const payload = {
      device_id: Number(p.device_id),
      repair_date: normalizeDateTime(p.repair_date || ""),
      issue: p.issue || "",
      work: p.work || "",
      person: p.person || "",
      method: p.method || "",
      cost: Number(p.cost || 0),
      result: p.result || "",
      status_after: statusAfterFromRepairStatus(p.processing_status || old.processing_status || "Đang xử lý", p.status_after || old.status_after || "Đang hoạt động"),
      processing_status: normalizeRepairStatus(p.processing_status || old.processing_status || "Đang xử lý"),
      incident_id: old.incident_id || null,
      received_at: normalizeDateTime(p.received_at || old.received_at || old.repair_date || p.repair_date || nowSql()),
      updated_at: nowSql(),
      completed_at: ["Đã hoàn thành"].includes(normalizeRepairStatus(p.processing_status || old.processing_status || "Đang xử lý")) ? (old.completed_at || nowSql()) : "",
      id: Number(req.params.id)
    };
    db.prepare(`
      UPDATE repairs SET
        device_id=@device_id,
        repair_date=@repair_date,
        issue=@issue,
        work=@work,
        person=@person,
        method=@method,
        cost=@cost,
        result=@result,
        status_after=@status_after,
        processing_status=@processing_status,
        incident_id=@incident_id,
        received_at=@received_at,
        updated_at=@updated_at,
        completed_at=@completed_at
      WHERE id=@id
    `).run(payload);
    db.prepare(`UPDATE devices SET status=? WHERE id=?`).run(payload.status_after, payload.device_id);
    if (!p.skip_history) {
      const actionType = payload.processing_status === "Đã hoàn thành" ? "Hoàn thành" : (payload.processing_status === "Không sửa được" ? "Không sửa được" : "Cập nhật");
      const note = payload.work || payload.result || payload.issue || "Cập nhật phiếu sửa chữa";
      writeHistory("repair", Number(req.params.id), payload.person || "Khoa Trang bị", actionType, old.processing_status || "", payload.processing_status || "", note, payload.cost, actionType, p.action_time || payload.updated_at);
      writeAudit(requestActor(req, payload.person || "Khoa Trang bị"), "Cập nhật sửa chữa", "repair", req.params.id, `${old.processing_status || ""} → ${payload.processing_status || ""} | ${note}`);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/repairs/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/repairs/:id", (req, res) => {
  try {
    const id=Number(req.params.id);
    const old = db.prepare("SELECT * FROM repairs WHERE id=?").get(id);
    if (!old) return res.status(404).json({ error: "Không tìm thấy phiếu sửa chữa." });
    if (old.incident_id) {
      return res.status(400).json({ error: "Phiếu sửa chữa được tạo từ sự cố nên không được xóa để bảo toàn chuỗi hồ sơ. Hãy cập nhật kết quả xử lý trên phiếu." });
    }
    const status = normalizeRepairStatus(old.processing_status || "Đang xử lý");
    const historyCount = db.prepare("SELECT COUNT(*) c FROM activity_history WHERE module='repair' AND record_id=?").get(id).c;
    if (status !== "Đang xử lý" || historyCount > 1) {
      return res.status(400).json({ error: "Chỉ được xóa phiếu sửa chữa độc lập khi đang xử lý và chưa có lịch sử xử lý quan trọng." });
    }
    if (!String(old.status_before || "").trim()) {
      return res.status(400).json({ error: "Phiếu cũ chưa lưu trạng thái thiết bị trước sửa chữa; không xóa tự động để tránh khôi phục sai trạng thái." });
    }
    const tx=db.transaction(()=>{
      writeHistory("repair", id, old.person || "Khoa Trang bị", "Xóa", old.processing_status || "", "", old.issue || old.work || "Xóa phiếu sửa chữa", old.cost || 0, "Cập nhật");
      db.prepare("DELETE FROM repairs WHERE id=?").run(id);
      db.prepare("UPDATE devices SET status=? WHERE id=?").run(old.status_before, old.device_id);
      writeAudit(requestActor(req, old.person || "Khoa Trang bị"), "Xóa phiếu sửa chữa", "repair", id, `Khôi phục trạng thái thiết bị: ${old.status_before}`);
    });
    tx();
    res.json({ ok: true, restored_device_status: old.status_before });
  } catch(e) {
    console.error("DELETE /api/repairs/:id error:",e);
    res.status(500).json({error:e.message});
  }
});

app.get("/api/repairs/:id/history", (req, res) => {
  const repair = db.prepare(`
    SELECT r.*, i.incident_code, i.id AS source_incident_id
    FROM repairs r
    LEFT JOIN incidents i ON i.id = r.incident_id
    WHERE r.id=?
  `).get(req.params.id) || {};
  let rows = db.prepare(`SELECT * FROM activity_history WHERE module='repair' AND record_id=? ORDER BY action_time DESC, id DESC`).all(req.params.id);

  // Chuẩn hóa lịch sử cũ: phiếu tạo từ sự cố chỉ hiển thị 01 mốc tự động, tránh trùng thời gian.
  const incidentCode = repair.incident_code || (repair.source_incident_id ? `#${repair.source_incident_id}` : "");
  const isCreateFromIncident = (r) => {
    const txt = String([r.action_type, r.note, r.entry_type].join(" ")).toLowerCase();
    return Boolean(repair.incident_id || repair.source_incident_id) &&
      (txt.includes("sự cố") || txt.includes("su co") || r.action_type === "Tạo từ sự cố");
  };
  const createRows = rows.filter(isCreateFromIncident);
  if (createRows.length) {
    const sortedCreate = [...createRows].sort((a, b) => String(a.action_time || "").localeCompare(String(b.action_time || "")) || Number(a.id || 0) - Number(b.id || 0));
    const base = sortedCreate[0];
    const synthetic = {
      ...base,
      actor: "Hệ thống",
      action_type: "Tạo từ sự cố",
      new_status: normalizeRepairStatus(base.new_status || repair.processing_status || "Đang xử lý"),
      note: `Tạo phiếu sửa chữa từ sự cố ${incidentCode}`.trim(),
      cost: Number(base.cost || 0),
      entry_type: "Tự động"
    };
    rows = rows.filter(r => !isCreateFromIncident(r));
    rows.push(synthetic);
    rows.sort((a, b) => String(b.action_time || "").localeCompare(String(a.action_time || "")) || Number(b.id || 0) - Number(a.id || 0));
  }
  rows = rows.map(r => ({
    ...r,
    cost: Number(r.cost || 0),
    new_status: normalizeRepairStatus(r.new_status || repair.processing_status || "Đang xử lý")
  }));
  res.json(rows);
});

app.put("/api/maintenances/:id", uploadDocument.single("file"), (req, res) => {
  try {
    const p = req.body || {};
    const id = Number(req.params.id);
    const old = db.prepare("SELECT * FROM maintenances WHERE id=?").get(id);
    if (!old) {
      cleanupSingleUpload(req);
      return res.status(404).json({ error: "Không tìm thấy bản ghi bảo dưỡng." });
    }
    const deviceId = Number(p.device_id || 0);
    const device = db.prepare("SELECT id FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(deviceId);
    if (!device) {
      cleanupSingleUpload(req);
      return res.status(400).json({ error: "Thiết bị không tồn tại hoặc đã lưu trữ." });
    }
    const file = req.file || null;
    const payload = {
      id,
      device_id: deviceId,
      maintenance_date: normalizeDateTime(p.maintenance_date || ""),
      type: p.type || "",
      content: p.content || "",
      result: p.result || "",
      performer: p.performer || "",
      user_confirm: p.user_confirm || "",
      vendor: p.vendor || "",
      next_date: p.next_date || "",
      note: p.note || "",
      original_name: file ? file.originalname : old.original_name,
      stored_name: file ? file.filename : old.stored_name,
      file_path: file ? `/uploads/documents/${file.filename}` : old.file_path,
      file_mime: file ? file.mimetype : old.file_mime,
      file_size: file ? file.size : (old.file_size || 0)
    };
    if (!payload.maintenance_date || !payload.content) {
      cleanupSingleUpload(req);
      return res.status(400).json({ error: "Thiếu thời gian hoặc nội dung bảo dưỡng." });
    }
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE maintenances SET
          device_id=@device_id, maintenance_date=@maintenance_date, type=@type, content=@content, result=@result,
          performer=@performer, user_confirm=@user_confirm, vendor=@vendor, next_date=@next_date, note=@note,
          original_name=@original_name, stored_name=@stored_name, file_path=@file_path, file_mime=@file_mime, file_size=@file_size
        WHERE id=@id
      `).run(payload);
      if (file) {
        db.prepare(`
          INSERT INTO documents (device_id,name,type,doc_date,updated_by,note,original_name,stored_name,file_path,file_mime,file_size)
          VALUES (@device_id,@name,@type,@doc_date,@updated_by,@note,@original_name,@stored_name,@file_path,@file_mime,@file_size)
        `).run({
          device_id: deviceId,
          name: `Tài liệu bảo dưỡng - ${payload.maintenance_date.slice(0,10)}`,
          type: "Bảo dưỡng",
          doc_date: payload.maintenance_date.slice(0,10),
          updated_by: payload.performer,
          note: payload.note || "Tệp đính kèm từ phiếu bảo dưỡng",
          original_name: file.originalname,
          stored_name: file.filename,
          file_path: payload.file_path,
          file_mime: file.mimetype,
          file_size: file.size
        });
      }
      writeHistory("maintenance", id, payload.performer, "Cập nhật", old.result || "", payload.result || "", payload.content || payload.note || "");
      writeAudit(requestActor(req, payload.performer || "Khoa Trang bị"), "Cập nhật bảo dưỡng", "maintenance", id, payload.content || payload.note || "");
    });
    tx();
    // Không xóa file cũ: file đã được ghi vào bảng documents là một phần của lịch sử hồ sơ.
    res.json({ ok: true, file_path: payload.file_path });
  } catch (e) {
    cleanupSingleUpload(req);
    console.error("PUT /api/maintenances/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/maintenances/:id", (req, res) => {
  try{
    const id=Number(req.params.id);
    const old=db.prepare("SELECT * FROM maintenances WHERE id=?").get(id);
    if(!old) return res.status(404).json({error:"Không tìm thấy bản ghi bảo dưỡng."});
    if(String(old.file_path||"").trim()){
      return res.status(400).json({error:"Bản ghi bảo dưỡng đã có file hồ sơ; không được xóa để bảo toàn tài liệu lịch sử."});
    }
    db.prepare("DELETE FROM maintenances WHERE id=?").run(id);
    writeAudit(requestActor(req, old.performer || "Khoa Trang bị"), "Xóa bảo dưỡng chưa có file", "maintenance", id, old.content || old.note || "");
    res.json({ok:true});
  }catch(e){
    console.error("DELETE /api/maintenances/:id error:",e);
    res.status(500).json({error:e.message});
  }
});

app.post("/api/operation-logs", (req, res) => {
  const p = req.body;
  const info = db.prepare(`
    INSERT INTO operation_logs (device_id,log_datetime,user_name,department_code,usage_count,status_before,status_after,note)
    VALUES (@device_id,@log_datetime,@user_name,@department_code,@usage_count,@status_before,@status_after,@note)
  `).run(p);
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/operation-logs/:id", (req, res) => {
  const p = req.body;
  db.prepare(`
    UPDATE operation_logs SET log_datetime=@log_datetime, user_name=@user_name, department_code=@department_code, usage_count=@usage_count, status_before=@status_before, status_after=@status_after, note=@note
    WHERE id=@id
  `).run({ ...p, id: Number(req.params.id) });
  res.json({ ok: true });
});

app.delete("/api/operation-logs/:id", (req, res) => {
  db.prepare("DELETE FROM operation_logs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/documents", uploadDocument.single("file"), (req, res) => {
  try {
    const p = req.body || {};
    const file = req.file || null;
    const deviceId = Number(p.device_id || 0);
    const device = db.prepare("SELECT id FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(deviceId);
    if (!device) {
      cleanupSingleUpload(req);
      return res.status(400).json({ error: "Thiết bị không tồn tại hoặc đã lưu trữ." });
    }
    if (!String(p.name || "").trim() && !file) {
      return res.status(400).json({ error: "Tài liệu phải có tên hoặc file đính kèm." });
    }
    const payload = {
      device_id: deviceId,
      name: String(p.name || file?.originalname || "Tài liệu").trim(),
      type: String(p.type || "").trim(),
      doc_date: String(p.doc_date || localDateISO()).slice(0,10),
      updated_by: String(p.updated_by || "").trim(),
      note: p.note || "",
      original_name: file ? file.originalname : null,
      stored_name: file ? file.filename : null,
      file_path: file ? `/uploads/documents/${file.filename}` : null,
      file_mime: file ? file.mimetype : null,
      file_size: file ? file.size : 0
    };
    const info = db.prepare(`
      INSERT INTO documents (device_id,name,type,doc_date,updated_by,note,original_name,stored_name,file_path,file_mime,file_size)
      VALUES (@device_id,@name,@type,@doc_date,@updated_by,@note,@original_name,@stored_name,@file_path,@file_mime,@file_size)
    `).run(payload);
    writeAudit(requestActor(req, payload.updated_by || "Khoa Trang bị"), "Tạo tài liệu", "document", info.lastInsertRowid, payload.name);
    res.json({ id: info.lastInsertRowid, file_path: payload.file_path, original_name: payload.original_name });
  } catch (e) {
    cleanupSingleUpload(req);
    console.error("POST /api/documents error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/documents/:id", uploadDocument.single("file"), (req, res) => {
  try {
    const p = req.body || {};
    const id = Number(req.params.id);
    const old = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
    if (!old) {
      cleanupSingleUpload(req);
      return res.status(404).json({ error: "Không tìm thấy tài liệu." });
    }
    const file = req.file || null;
    const payload = {
      id,
      name: String(p.name ?? old.name ?? "").trim(),
      type: String(p.type ?? old.type ?? "").trim(),
      doc_date: String(p.doc_date ?? old.doc_date ?? localDateISO()).slice(0,10),
      updated_by: String(p.updated_by ?? old.updated_by ?? "").trim(),
      note: p.note ?? old.note ?? "",
      original_name: file ? file.originalname : old.original_name,
      stored_name: file ? file.filename : old.stored_name,
      file_path: file ? `/uploads/documents/${file.filename}` : old.file_path,
      file_mime: file ? file.mimetype : old.file_mime,
      file_size: file ? file.size : (old.file_size || 0)
    };
    db.prepare(`
      UPDATE documents SET
        name=@name, type=@type, doc_date=@doc_date, updated_by=@updated_by, note=@note,
        original_name=@original_name, stored_name=@stored_name, file_path=@file_path, file_mime=@file_mime, file_size=@file_size
      WHERE id=@id
    `).run(payload);
    // Chỉ xóa file vật lý cũ sau khi DB đã cập nhật thành công và
    // không còn hồ sơ kỹ thuật nào tham chiếu tới file đó.
    if (file && old.file_path && old.file_path !== payload.file_path) {
      const technicalRef=technicalFileReference(old.file_path);
      if (!technicalRef) safeUnlink(path.join(__dirname, old.file_path.replace(/^\//, "")));
    }
    writeAudit(requestActor(req, payload.updated_by || "Khoa Trang bị"), "Cập nhật tài liệu", "document", id, payload.name);
    res.json({ ok: true, file_path: payload.file_path });
  } catch (e) {
    cleanupSingleUpload(req);
    console.error("PUT /api/documents/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/documents/:id/download", (req, res) => {
  const row = db.prepare("SELECT * FROM documents WHERE id=?").get(Number(req.params.id));
  if (!row || !row.file_path) return res.status(404).json({ error: "Tài liệu chưa có file đính kèm." });
  const abs = path.join(__dirname, row.file_path.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "Không tìm thấy file." });
  res.download(abs, row.original_name || path.basename(abs));
});

app.delete("/api/documents/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
  if (!row) return res.status(404).json({ error: "Không tìm thấy tài liệu." });
  const technicalRef=technicalFileReference(row.file_path);
  if(technicalRef){
    return res.status(400).json({error:`File đang được ${technicalRef.type} #${technicalRef.id} sử dụng; không được xóa Tài liệu để tránh mất hồ sơ kỹ thuật.`});
  }
  db.prepare("DELETE FROM documents WHERE id=?").run(id);
  if (row.file_path) safeUnlink(path.join(__dirname, row.file_path.replace(/^\//, "")));
  writeAudit(requestActor(req), "Xóa tài liệu", "document", id, row.name || "");
  res.json({ ok: true });
});



function latestDeviceMaintenance(deviceId) {
  return db.prepare(`
    SELECT maintenance_date, type, result, performer, next_date
    FROM maintenances
    WHERE device_id=?
    ORDER BY COALESCE(maintenance_date,'') DESC, id DESC
    LIMIT 1
  `).get(deviceId) || null;
}
function latestDeviceInspection(deviceId) {
  return db.prepare(`
    SELECT inspection_date, type, organization, certificate_no, result, next_date
    FROM inspections
    WHERE device_id=?
    ORDER BY COALESCE(inspection_date,'') DESC, id DESC
    LIMIT 1
  `).get(deviceId) || null;
}
function openDeviceRepair(deviceId) {
  return db.prepare(`
    SELECT id, processing_status, issue, received_at, repair_date
    FROM repairs
    WHERE device_id=? AND COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Chờ linh kiện')
    ORDER BY COALESCE(updated_at, received_at, repair_date,'') DESC, id DESC
    LIMIT 1
  `).get(deviceId) || null;
}
function getQrDevicePayload(deviceId) {
  const row = db.prepare(`
    SELECT dv.*, d.name AS department_name, g.name AS group_name
    FROM devices dv
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    WHERE dv.id=?
  `).get(Number(deviceId));
  if (!row) return null;
  return {
    ...enrichDevice(row),
    latest_maintenance: latestDeviceMaintenance(row.id),
    latest_inspection: latestDeviceInspection(row.id),
    open_repair: openDeviceRepair(row.id)
  };
}

app.get("/api/maintenances", (req, res) => {
  const rows = db.prepare(`
    SELECT
      m.*,
      dv.name AS device_name,
      dv.department_code,
      dv.group_code,
      dv.location,
      dv.model,
      dv.serial,
      d.name AS department_name,
      g.name AS group_name
    FROM maintenances m
    LEFT JOIN devices dv ON dv.id = m.device_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    ORDER BY m.id DESC
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

app.post("/api/maintenances", uploadDocument.single("file"), (req, res) => {
  try {
    const p = req.body || {};
    const file = req.file || null;
    const deviceId = Number(p.device_id || 0);
    const device = db.prepare("SELECT id FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(deviceId);
    if (!device) {
      cleanupSingleUpload(req);
      return res.status(400).json({ error: "Thiết bị không tồn tại hoặc đã lưu trữ." });
    }
    const payload = {
      device_id: deviceId,
      maintenance_date: normalizeDateTime(p.maintenance_date || ""),
      type: p.type || "",
      content: p.content || "",
      result: p.result || "",
      performer: p.performer || "",
      user_confirm: p.user_confirm || "",
      vendor: p.vendor || "",
      next_date: p.next_date || "",
      note: p.note || "",
      original_name: file ? file.originalname : null,
      stored_name: file ? file.filename : null,
      file_path: file ? `/uploads/documents/${file.filename}` : null,
      file_mime: file ? file.mimetype : null,
      file_size: file ? file.size : 0
    };
    if (!payload.maintenance_date || !payload.content) {
      cleanupSingleUpload(req);
      return res.status(400).json({ error: "Thiếu thời gian hoặc nội dung bảo dưỡng." });
    }
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO maintenances (device_id,maintenance_date,type,content,result,performer,user_confirm,vendor,next_date,note,original_name,stored_name,file_path,file_mime,file_size)
        VALUES (@device_id,@maintenance_date,@type,@content,@result,@performer,@user_confirm,@vendor,@next_date,@note,@original_name,@stored_name,@file_path,@file_mime,@file_size)
      `).run(payload);
      if (file) {
        db.prepare(`
          INSERT INTO documents (device_id,name,type,doc_date,updated_by,note,original_name,stored_name,file_path,file_mime,file_size)
          VALUES (@device_id,@name,@type,@doc_date,@updated_by,@note,@original_name,@stored_name,@file_path,@file_mime,@file_size)
        `).run({
          device_id: deviceId,
          name: `Tài liệu bảo dưỡng - ${payload.maintenance_date.slice(0,10)}`,
          type: "Bảo dưỡng",
          doc_date: payload.maintenance_date.slice(0,10),
          updated_by: payload.performer,
          note: payload.note || "Tệp đính kèm từ phiếu bảo dưỡng",
          original_name: file.originalname,
          stored_name: file.filename,
          file_path: payload.file_path,
          file_mime: file.mimetype,
          file_size: file.size
        });
      }
      writeHistory("maintenance", info.lastInsertRowid, payload.performer, "Tạo mới", "", payload.result || "", payload.content || payload.note || "");
      writeAudit(requestActor(req, payload.performer || "Khoa Trang bị"), "Tạo bảo dưỡng", "maintenance", info.lastInsertRowid, payload.content || payload.note || "");
      return info.lastInsertRowid;
    });
    const id = tx();
    res.json({ id, file_path: payload.file_path });
  } catch (e) {
    cleanupSingleUpload(req);
    console.error("POST /api/maintenances error:", e);
    res.status(500).json({ error: e.message });
  }
});




function getQrDevicePayloadByUid(qrUid) {
  const row = db.prepare("SELECT id FROM devices WHERE qr_uid=?").get(String(qrUid || "").trim());
  return row ? getQrDevicePayload(row.id) : null;
}

function getPublicDevicePayload(deviceId) {
  const d = getQrDevicePayload(deviceId);
  if (!d) return null;
  return {
    qr_uid: d.qr_uid || ensureDeviceQrUid(d.id),
    device_code: d.device_code,
    name: d.name,
    department_name: d.department_name || d.department_code || "",
    location: d.location || "",
    status: d.status || "",
    model: d.model || "",
    serial: d.serial || "",
    is_archived: Number(d.is_archived || 0) === 1
  };
}

function getPublicDevicePayloadByUid(qrUid) {
  const d = getQrDevicePayloadByUid(qrUid);
  return d ? getPublicDevicePayload(d.id) : null;
}

app.get("/q/:qr_uid", (req, res) => {
  const row = db.prepare("SELECT id FROM devices WHERE qr_uid=?").get(req.params.qr_uid);
  if (!row) return res.status(404).send("Mã QR thiết bị không hợp lệ.");
  res.sendFile(path.join(__dirname, "public", "inspect.html"));
});

app.get("/api/public/device-qr/:qr_uid", (req, res) => {
  const data = getPublicDevicePayloadByUid(req.params.qr_uid);
  if (!data) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  res.json(data);
});

// QR cũ theo id/mã có thể bị dò tuần tự nên tắt mặc định trên bản triển khai.
app.get("/api/public/device/:id", (req, res) => {
  if (!ALLOW_LEGACY_PUBLIC_QR) return res.status(410).json({ error: "QR cũ theo ID đã được tắt. Vui lòng in lại QR UID cố định." });
  const data = getPublicDevicePayload(req.params.id);
  if (!data) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  res.json(data);
});

app.get("/api/public/device-code/:code", (req, res) => {
  if (!ALLOW_LEGACY_PUBLIC_QR) return res.status(410).json({ error: "QR cũ theo mã thiết bị đã được tắt. Vui lòng dùng QR UID cố định." });
  const row = db.prepare("SELECT id FROM devices WHERE device_code=?").get(String(req.params.code || "").trim());
  if (!row) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  const data = getPublicDevicePayload(row.id);
  res.json(data);
});

app.get("/api/qr-image", (req, res) => {
  try {
    const data = String(req.query.data || "").trim();
    if (!data || data.length > 2048) return res.status(400).send("Dữ liệu QR không hợp lệ.");
    let parsed;
    try { parsed = new URL(data); } catch { return res.status(400).send("URL QR không hợp lệ."); }
    if (!["http:","https:"].includes(parsed.protocol)) return res.status(400).send("Giao thức QR không hợp lệ.");
    let qrUid = "";
    try {
      const m = decodeURIComponent(parsed.pathname || "").match(/^\/q\/([^/]+)$/);
      qrUid = m ? m[1] : "";
    } catch {}
    if (!qrUid) return res.status(400).send("Đường dẫn QR không hợp lệ.");
    const device = db.prepare("SELECT id FROM devices WHERE qr_uid=? AND COALESCE(is_archived,0)=0").get(qrUid);
    if (!device) return res.status(404).send("QR UID không tồn tại hoặc thiết bị đã lưu trữ.");

    const qr = qrcodeGenerator(0, "M");
    qr.addData(data, "Byte");
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(svg);
  } catch (e) {
    console.error("GET /api/qr-image error:", e);
    res.status(500).send("Không tạo được mã QR.");
  }
});

app.get("/api/qr/device-uid/:qr_uid", (req, res) => {
  const data = getQrDevicePayloadByUid(req.params.qr_uid);
  if (!data) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  res.json(data);
});

app.get("/api/qr/device/:id", (req, res) => {
  const data = getQrDevicePayload(req.params.id);
  if (!data) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  res.json(data);
});

app.get("/api/qr/device-code/:code", (req, res) => {
  const row = db.prepare("SELECT id FROM devices WHERE device_code=?").get(req.params.code);
  if (!row) return res.status(404).json({ error: "Không tìm thấy thiết bị." });
  const data = getQrDevicePayload(row.id);
  res.json(data);
});

app.post("/api/qr/checks", uploadIncidentMedia.array("media", 6), (req, res) => {
  try {
    const p = req.body || {};
    const qrUid = String(p.qr_uid || "").trim();
    if (!qrUid) return qrRequestError(req, res, 400, "Thiếu mã QR cố định của thiết bị.");
    const qrRow = db.prepare("SELECT id FROM devices WHERE qr_uid=? AND COALESCE(is_archived,0)=0").get(qrUid);
    if (!qrRow) return qrRequestError(req, res, 404, "Mã QR không hợp lệ hoặc thiết bị đã lưu trữ.");
    const deviceId = Number(qrRow.id);
    const condition = String(p.condition || "").trim();
    const inspector = String(p.inspector || "").trim();
    const reporterPhone = String(p.reporter_phone || "").trim();
    validateIncidentFiles(req.files);
    if (!deviceId) return qrRequestError(req, res, 400, "Thiếu thiết bị.");
    if (!inspector) return qrRequestError(req, res, 400, "Vui lòng nhập tên người kiểm tra.");
    const normalizedCondition = condition === "Tốt" ? "Bình thường" : condition;
    if (!["Bình thường", "Có vấn đề"].includes(normalizedCondition)) return qrRequestError(req, res, 400, "Tình trạng kiểm tra không hợp lệ.");
    const description = String(p.description || "").trim();
    if (normalizedCondition === "Có vấn đề" && !description) {
      return qrRequestError(req, res, 400, "Vui lòng nhập mô tả vấn đề.");
    }
    const device = db.prepare("SELECT * FROM devices WHERE id=?").get(deviceId);
    if (!device) return qrRequestError(req, res, 404, "Không tìm thấy thiết bị.");
    const files = req.files || [];
    const noteParts = [];
    if (description) noteParts.push(`Mô tả: ${description}`);
    if (p.note) noteParts.push(`Ghi chú: ${p.note}`);
    const resultText = normalizedCondition === "Bình thường" ? "Bình thường" : "Có vấn đề";
    const info = db.prepare(`
      INSERT INTO daily_checks (device_id,check_datetime,inspector,content,result,note,source_channel,department_code_snapshot,location_snapshot)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(deviceId, nowSql(), inspector, "Kiểm tra nhanh bằng mã QR", resultText, noteParts.join("\n"), "QR", device.department_code || "", device.location || "");
    for (const file of files) {
      db.prepare(`
        INSERT INTO documents (device_id,name,type,doc_date,updated_by,note,original_name,stored_name,file_path,file_mime,file_size)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(deviceId, `Ảnh/Video kiểm tra - ${nowSql().slice(0,10)}`, "Kiểm tra", nowSql().slice(0,10), inspector, p.note || description || "Tệp đính kèm từ kiểm tra", file.originalname, file.filename, `/uploads/qr/${file.filename}`, file.mimetype, file.size);
    }
    writeHistory("check", info.lastInsertRowid, inspector, "Tạo từ QR", "", resultText, description || p.note || "Kiểm tra nhanh thiết bị");
    let incidentId = null;
    if ((p.create_incident === "1" || p.create_incident === "true" || normalizedCondition === "Có vấn đề") && normalizedCondition === "Có vấn đề") {
      const severity = ["Thấp","Trung bình","Cao"].includes(String(p.severity || "")) ? String(p.severity) : "Trung bình";
      const inc = db.prepare(`
        INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,reporter_phone,status,note,local_resolution_note,source_channel)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(deviceId, nowSql(), description || `Kiểm tra: ${condition}`, severity, inspector, reporterPhone, "Mới ghi nhận", p.note || "Tạo từ kiểm tra thiết bị", "", "QR");
      incidentId = inc.lastInsertRowid;
      completeIncidentRow(incidentId, deviceId, inspector, nowSql());
      saveIncidentFiles(incidentId, deviceId, files);
    }
    res.json({ ok: true, check_id: info.lastInsertRowid, incident_id: incidentId });
  } catch (e) {
    cleanupUploadedFiles(req.files);
    console.error("POST /api/qr/checks error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/qr/incidents", uploadIncidentMedia.array("media", 6), (req, res) => {
  try {
    const p = req.body || {};
    const qrUid = String(p.qr_uid || "").trim();
    if (!qrUid) return qrRequestError(req, res, 400, "Thiếu mã QR cố định của thiết bị.");
    const qrRow = db.prepare("SELECT id FROM devices WHERE qr_uid=? AND COALESCE(is_archived,0)=0").get(qrUid);
    if (!qrRow) return qrRequestError(req, res, 404, "Mã QR không hợp lệ hoặc thiết bị đã lưu trữ.");
    const deviceId = Number(qrRow.id);
    const reporter = String(p.reporter || "").trim();
    const description = String(p.description || "").trim();
    const severity = String(p.severity || "Trung bình").trim();
    const reporterPhone = String(p.reporter_phone || "").trim();
    validateIncidentFiles(req.files);
    if (!deviceId) return qrRequestError(req, res, 400, "Thiếu thiết bị.");
    if (!reporter) return qrRequestError(req, res, 400, "Vui lòng nhập người báo.");
    if (!description) return qrRequestError(req, res, 400, "Vui lòng nhập mô tả sự cố.");
    if (!["Thấp","Trung bình","Cao"].includes(severity)) return qrRequestError(req, res, 400, "Mức độ không hợp lệ.");
    const device = db.prepare("SELECT * FROM devices WHERE id=?").get(deviceId);
    if (!device) return qrRequestError(req, res, 404, "Không tìm thấy thiết bị.");
    const files = req.files || [];
    const noteParts = [];
    if (p.note) noteParts.push(String(p.note));
    const info = db.prepare(`
      INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,reporter_phone,status,note,local_resolution_note,source_channel)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(deviceId, nowSql(), description, severity, reporter, reporterPhone, "Mới ghi nhận", noteParts.join("\n"), "", "QR");
    completeIncidentRow(info.lastInsertRowid, deviceId, reporter, nowSql());
    saveIncidentFiles(info.lastInsertRowid, deviceId, files);
    writeAudit(reporter, "Báo sự cố QR", "incident", info.lastInsertRowid, description);
    for (const file of files) {
      db.prepare(`
        INSERT INTO documents (device_id,name,type,doc_date,updated_by,note,original_name,stored_name,file_path,file_mime,file_size)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(deviceId, `Ảnh/Video sự cố QR - ${nowSql().slice(0,10)}`, "Sự cố QR", nowSql().slice(0,10), reporter, p.note || description, file.originalname, file.filename, `/uploads/qr/${file.filename}`, file.mimetype, file.size);
    }
    res.json({ ok: true, incident_id: info.lastInsertRowid });
  } catch (e) {
    cleanupUploadedFiles(req.files);
    console.error("POST /api/qr/incidents error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/checks", (req, res) => {
  const { preset = "today", date, from_date, to_date } = req.query;
  const { start, end } = dateRangeFromPreset(preset, date, from_date, to_date);
  const rows = db.prepare(`
    SELECT c.*, dv.name AS device_name, dv.department_code, dv.group_code
    FROM daily_checks c JOIN devices dv ON dv.id = c.device_id
    WHERE substr(c.check_datetime,1,10) >= ? AND substr(c.check_datetime,1,10) <= ?
    ORDER BY c.check_datetime DESC, c.id DESC
  `).all(start, end).map(r => ({ ...r, device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

app.post("/api/checks", (req, res) => {
  const p = req.body || {};
  const deviceId = Number(p.device_id || 0);
  const device = db.prepare("SELECT department_code,location FROM devices WHERE id=?").get(deviceId);
  if (!device) return res.status(400).json({ error:"Thiết bị không tồn tại." });
  const payload = {
    device_id:deviceId,
    check_datetime:normalizeDateTime(p.check_datetime || nowSql()),
    inspector:String(p.inspector || "").trim(),
    content:String(p.content || "").trim(),
    result:String(p.result || "").trim(),
    note:p.note || "",
    source_channel:"Nhập trực tiếp",
    department_code_snapshot:device.department_code || "",
    location_snapshot:device.location || ""
  };
  const info = db.prepare(`
    INSERT INTO daily_checks (device_id,check_datetime,inspector,content,result,note,source_channel,department_code_snapshot,location_snapshot)
    VALUES (@device_id,@check_datetime,@inspector,@content,@result,@note,@source_channel,@department_code_snapshot,@location_snapshot)
  `).run(payload);
  writeHistory("check", info.lastInsertRowid, payload.inspector, "Tạo mới", "", payload.result, payload.content || payload.note || "");
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/checks/:id", (req, res) => {
  const p = req.body;
  const old = db.prepare("SELECT * FROM daily_checks WHERE id=?").get(req.params.id) || {};
  db.prepare(`
    UPDATE daily_checks
    SET check_datetime=@check_datetime, inspector=@inspector, content=@content, result=@result, note=@note
    WHERE id=@id
  `).run({
    id:Number(req.params.id),
    check_datetime:normalizeDateTime(p.check_datetime || old.check_datetime || nowSql()),
    inspector:p.inspector || old.inspector || "",
    content:p.content || old.content || "",
    result:p.result || old.result || "",
    note:p.note ?? old.note ?? ""
  });
  writeHistory("check", Number(req.params.id), p.inspector, "Cập nhật", old.result || "", p.result || "", p.content || p.note || "");
  res.json({ ok: true });
});

app.delete("/api/checks/:id", (req, res) => {
  const old = db.prepare("SELECT * FROM daily_checks WHERE id=?").get(req.params.id);
  if (old) writeHistory("check", Number(req.params.id), old.inspector, "Xóa", old.result || "", "", old.content || old.note || "");
  db.prepare("DELETE FROM daily_checks WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

function cleanupUploadedFiles(files) {
  for (const file of (Array.isArray(files) ? files : [])) {
    safeUnlink(file.path || (file.filename ? path.join(qrUploadsDir, file.filename) : ""));
  }
}

function qrRequestError(req, res, status, message) {
  cleanupUploadedFiles(req.files);
  return res.status(status).json({ error: message });
}

function validateIncidentFiles(files){
  const list = Array.isArray(files) ? files : [];
  const images = list.filter(f => String(f.mimetype||"").startsWith("image/"));
  const videos = list.filter(f => String(f.mimetype||"").startsWith("video/") || /\.(mp4|mov)$/i.test(f.originalname||""));
  if (images.length > 5) throw new Error("Chỉ được tải tối đa 5 ảnh cho mỗi sự cố.");
  if (videos.length > 1) throw new Error("Chỉ được tải tối đa 1 video cho mỗi sự cố.");
  for (const f of images) if (f.size > 5 * 1024 * 1024) throw new Error("Mỗi ảnh tối đa 5MB.");
  for (const f of videos) if (f.size > 30 * 1024 * 1024) throw new Error("Video tối đa 30MB.");
}
function saveIncidentFiles(incidentId, deviceId, files){
  const list = Array.isArray(files) ? files : [];
  const stmt = db.prepare(`INSERT INTO incident_files (incident_id,device_id,original_name,stored_name,file_path,file_mime,file_size,uploaded_at) VALUES (?,?,?,?,?,?,?,?)`);
  for (const f of list) stmt.run(incidentId, deviceId, f.originalname, f.filename, `/uploads/qr/${f.filename}`, f.mimetype, f.size, nowSql());
}
function getIncidentFilesMap(ids){
  if (!ids || !ids.length) return {};
  const placeholders = ids.map(()=>"?").join(",");
  const rows = db.prepare(`SELECT * FROM incident_files WHERE incident_id IN (${placeholders}) ORDER BY id`).all(...ids);
  const map = {};
  for (const r of rows) {
    if (!map[r.incident_id]) map[r.incident_id] = [];
    map[r.incident_id].push(r);
  }
  return map;
}

app.get("/api/incidents", (req, res) => {
  // Nếu frontend không truyền khoảng ngày thì trả toàn bộ sự cố.
  // Trước đây route mặc định preset=today/last7 làm bản ghi vừa tạo dễ “mất” khỏi bảng
  // khi người dùng nhập thời gian ngoài 7 ngày hoặc bộ lọc đang rộng hơn dữ liệu tải về.
  const { preset, date, from_date, to_date } = req.query;
  let sql = `
    SELECT i.*,
           dv.name AS current_device_name,
           dv.department_code AS current_department_code,
           dv.group_code,
           dv.location AS current_location,
           dv.model,dv.serial,
           d.name AS current_department_name,
           g.name AS group_name,
           lr.id AS linked_repair_id,
           lr.processing_status AS linked_repair_status,
           lr.completed_at AS linked_repair_completed_at,
           CASE WHEN i.acknowledged_at IS NOT NULL AND i.acknowledged_at<>''
             THEN ROUND((julianday(i.acknowledged_at)-julianday(i.incident_datetime))*24*60,1) ELSE NULL END AS response_minutes,
           CASE WHEN lr.completed_at IS NOT NULL AND lr.completed_at<>''
             THEN ROUND((julianday(lr.completed_at)-julianday(i.incident_datetime))*24*60,1) ELSE NULL END AS resolution_minutes
    FROM incidents i
    JOIN devices dv ON dv.id = i.device_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    LEFT JOIN (
      SELECT incident_id, MAX(id) AS max_repair_id
      FROM repairs
      WHERE incident_id IS NOT NULL
      GROUP BY incident_id
    ) lrm ON lrm.incident_id = i.id
    LEFT JOIN repairs lr ON lr.id = lrm.max_repair_id
  `;
  const params = [];
  if (preset || date || from_date || to_date) {
    const { start, end } = dateRangeFromPreset(preset || "custom", date, from_date, to_date);
    sql += ` WHERE substr(i.incident_datetime,1,10) >= ? AND substr(i.incident_datetime,1,10) <= ?`;
    params.push(start, end);
  }
  sql += ` ORDER BY i.incident_datetime DESC, i.id DESC`;
  const baseRows = db.prepare(sql).all(...params);
  const fileMap = getIncidentFilesMap(baseRows.map(r => r.id));
  const rows = baseRows.map(r => {
    const files = fileMap[r.id] || [];
    return {
      ...r,
      status: normalizeIncidentStatusForUi(r.status, r.linked_repair_id),
      device_code: r.device_code_snapshot || getDeviceCode(r.device_id),
      device_name: r.device_name_snapshot || r.current_device_name || "",
      department_code: r.department_code_snapshot || r.current_department_code || "",
      department_name: r.department_snapshot || r.current_department_name || r.department_code_snapshot || r.current_department_code || "",
      location: r.location_snapshot || r.current_location || "",
      files,
      media_count: files.length,
      first_media_path: files[0]?.file_path || "",
      has_video: files.some(f => String(f.file_mime||"").startsWith("video/") || /\.(mp4|mov)$/i.test(f.original_name||""))
    };
  });
  res.json(rows);
});

app.post("/api/incidents", uploadIncidentMedia.array("media", 6), (req, res) => {
  try {
    const p = req.body || {};
    validateIncidentFiles(req.files);
    const missing = requireFields(p, ["device_id", "incident_datetime", "description", "severity", "reporter", "status"]);
    if (missing.length) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: `Thiếu thông tin bắt buộc: ${missing.join(", ")}` });
    }
    const payload = {
      device_id: Number(p.device_id),
      incident_datetime: normalizeDateTime(p.incident_datetime),
      description: String(p.description || "").trim(),
      severity: p.severity || "Trung bình",
      reporter: String(p.reporter || "").trim(),
      reporter_phone: String(p.reporter_phone || "").trim(),
      status: normalizeIncidentPayloadStatus(p.status || "Mới ghi nhận", "Mới ghi nhận", null),
      note: p.note || "",
      local_resolution_note: p.local_resolution_note || "",
      source_channel: "Nhập trực tiếp"
    };
    const deviceExists = db.prepare("SELECT id FROM devices WHERE id=?").get(payload.device_id);
    if (!deviceExists) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: "Thiết bị không tồn tại." });
    }
    const info = db.prepare(`
      INSERT INTO incidents (device_id,incident_datetime,description,severity,reporter,reporter_phone,status,note,local_resolution_note,source_channel)
      VALUES (@device_id,@incident_datetime,@description,@severity,@reporter,@reporter_phone,@status,@note,@local_resolution_note,@source_channel)
    `).run(payload);
    completeIncidentRow(info.lastInsertRowid, payload.device_id, payload.reporter, payload.incident_datetime);
    saveIncidentFiles(info.lastInsertRowid, payload.device_id, req.files);
    writeAudit(requestActor(req, payload.reporter || "Hệ thống"), "Tạo sự cố", "incident", info.lastInsertRowid, payload.description);
    const row = db.prepare(`
      SELECT i.*, dv.name AS device_name, dv.department_code, dv.group_code, dv.location, dv.model, dv.serial,
             d.name AS department_name, g.name AS group_name,
             lr.id AS linked_repair_id,
             lr.processing_status AS linked_repair_status
      FROM incidents i
      JOIN devices dv ON dv.id = i.device_id
      LEFT JOIN departments d ON d.code = dv.department_code
      LEFT JOIN device_groups g ON g.code = dv.group_code
      LEFT JOIN repairs lr ON lr.incident_id = i.id
      WHERE i.id=?
      ORDER BY lr.id DESC
    `).get(info.lastInsertRowid);
    res.json({ ok: true, id: info.lastInsertRowid, row: { ...row, status: normalizeIncidentStatusForUi(row.status, row.linked_repair_id), device_code: getDeviceCode(row.device_id) } });
  } catch (e) {
    cleanupUploadedFiles(req.files);
    console.error("POST /api/incidents error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/incidents/:id", uploadIncidentMedia.array("media", 6), (req, res) => {
  try {
    const p = req.body || {};
    validateIncidentFiles(req.files);
    const old = db.prepare("SELECT * FROM incidents WHERE id=?").get(req.params.id);
    if (!old) {
      cleanupUploadedFiles(req.files);
      return res.status(404).json({ error: "Không tìm thấy sự cố." });
    }
    const missing = requireFields(p, ["device_id", "incident_datetime", "description", "severity", "reporter", "status"]);
    if (missing.length) return res.status(400).json({ error: `Thiếu thông tin bắt buộc: ${missing.join(", ")}` });
    const linkedRepair = db.prepare("SELECT id FROM repairs WHERE incident_id=? ORDER BY id DESC LIMIT 1").get(Number(req.params.id));
    const payload = {
      id: Number(req.params.id),
      device_id: Number(p.device_id),
      incident_datetime: normalizeDateTime(p.incident_datetime),
      description: String(p.description || "").trim(),
      severity: p.severity || "Trung bình",
      reporter: String(p.reporter || "").trim(),
      reporter_phone: String(p.reporter_phone || old.reporter_phone || "").trim(),
      status: normalizeIncidentPayloadStatus(p.status || old.status || "Mới ghi nhận", old.status || "Mới ghi nhận", linkedRepair?.id),
      note: p.note || "",
      local_resolution_note: p.local_resolution_note || old.local_resolution_note || ""
    };
    const deviceExists = db.prepare("SELECT id FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(payload.device_id);
    if (!deviceExists) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error:"Thiết bị không tồn tại hoặc đã lưu trữ." });
    }
    const deviceChanged = Number(old.device_id) !== Number(payload.device_id);
    if (deviceChanged && linkedRepair) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error:"Không thể đổi thiết bị sau khi sự cố đã chuyển sang sửa chữa." });
    }
    db.prepare(`
      UPDATE incidents
      SET device_id=@device_id, incident_datetime=@incident_datetime, description=@description, severity=@severity, reporter=@reporter, reporter_phone=@reporter_phone, status=@status, note=@note, local_resolution_note=@local_resolution_note
      WHERE id=@id
    `).run(payload);
    if (deviceChanged) replaceIncidentSnapshot(Number(req.params.id), payload.device_id, payload.reporter);
    else touchIncident(Number(req.params.id), payload.device_id, payload.reporter);
    const receivingActor = String(req.authUser?.full_name || p.acknowledged_by || "Khoa Trang bị").trim();
    if (payload.status === "Đã tiếp nhận" && !old.acknowledged_at) {
      db.prepare("UPDATE incidents SET acknowledged_at=?, acknowledged_by=? WHERE id=?").run(nowSql(), receivingActor, Number(req.params.id));
    }
    if (payload.status === "Đã xử lý tại chỗ") {
      db.prepare("UPDATE incidents SET acknowledged_at=COALESCE(NULLIF(acknowledged_at,''),?), acknowledged_by=COALESCE(NULLIF(acknowledged_by,''),?), completed_at=COALESCE(NULLIF(completed_at,''),?) WHERE id=?").run(nowSql(), receivingActor, nowSql(), Number(req.params.id));
    }
    saveIncidentFiles(Number(req.params.id), payload.device_id, req.files);
    writeAudit(requestActor(req, payload.reporter || "Hệ thống"), "Cập nhật sự cố", "incident", req.params.id, `${old.status || ""} → ${payload.status || ""} | ${payload.description}`);
    res.json({ ok: true });
  } catch (e) {
    cleanupUploadedFiles(req.files);
    console.error("PUT /api/incidents/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/incidents/:id/acknowledge", (req, res) => {
  try {
    const incident = db.prepare("SELECT * FROM incidents WHERE id=?").get(Number(req.params.id));
    if (!incident) return res.status(404).json({ error:"Không tìm thấy sự cố." });
    if (incident.status === "Đã chuyển sửa chữa" || incident.status === "Đã xử lý tại chỗ") {
      return res.status(400).json({ error:"Sự cố đã được xử lý/chuyển sửa chữa." });
    }
    const actor = String(req.authUser?.full_name || req.body?.actor || "Khoa Trang bị").trim();
    const at = incident.acknowledged_at || nowSql();
    db.prepare("UPDATE incidents SET status='Đã tiếp nhận', acknowledged_at=?, acknowledged_by=COALESCE(NULLIF(acknowledged_by,''),?), updated_at=?, updated_by=? WHERE id=?")
      .run(at, actor, nowSql(), actor, incident.id);
    writeAudit(actor, "Tiếp nhận sự cố", "incident", incident.id, incident.incident_code || incident.description || "");
    res.json({ok:true, acknowledged_at:at});
  } catch(e) {
    console.error("POST /api/incidents/:id/acknowledge error:",e);
    res.status(500).json({error:e.message});
  }
});

app.post("/api/incidents/:id/transfer-repair", (req, res) => {
  try {
    const incident = db.prepare("SELECT * FROM incidents WHERE id=?").get(req.params.id);
    if (!incident) return res.status(404).json({ error: "Không tìm thấy sự cố." });
    if (incident.status === "Đã xử lý tại chỗ") return res.status(400).json({ error: "Sự cố đã xử lý tại chỗ, không chuyển sửa chữa." });
    const existed = db.prepare("SELECT id FROM repairs WHERE incident_id=? ORDER BY id DESC LIMIT 1").get(incident.id);
    if (existed) return res.json({ ok: true, repair_id: existed.id, existed: true });
    const device = db.prepare("SELECT id,status FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(Number(incident.device_id));
    if (!device) return res.status(400).json({ error: "Thiết bị không tồn tại hoặc đã lưu trữ." });
    const otherOpen = db.prepare("SELECT id FROM repairs WHERE device_id=? AND COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Chờ linh kiện') ORDER BY id DESC LIMIT 1").get(Number(incident.device_id));
    if (otherOpen) return res.status(400).json({ error: `Thiết bị đang có phiếu sửa chữa #${otherOpen.id} chưa hoàn thành. Hãy xử lý trên phiếu hiện có.` });
    const actor = req.authUser?.full_name || req.body?.actor || "Khoa Trang bị";
    const payload = {
      device_id: Number(incident.device_id),
      repair_date: normalizeDateTime(req.body?.repair_date || incident.incident_datetime || nowSql()),
      issue: incident.description || "",
      work: "Chờ kiểm tra và xử lý kỹ thuật",
      person: actor || "Khoa Trang bị",
      method: "Nội bộ",
      cost: 0,
      result: "",
      status_after: "Chờ sửa chữa",
      status_before: device.status || "Đang hoạt động",
      processing_status: "Đang xử lý",
      incident_id: Number(incident.id),
      received_at: normalizeDateTime(req.body?.repair_date || nowSql()),
      updated_at: nowSql(),
      completed_at: ""
    };
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO repairs (device_id, repair_date, issue, work, person, method, cost, result, status_after, status_before, processing_status, incident_id, received_at, updated_at, completed_at)
        VALUES (@device_id, @repair_date, @issue, @work, @person, @method, @cost, @result, @status_after, @status_before, @processing_status, @incident_id, @received_at, @updated_at, @completed_at)
      `).run(payload);
      db.prepare("UPDATE incidents SET status=?, acknowledged_at=COALESCE(NULLIF(acknowledged_at,''),?), acknowledged_by=COALESCE(NULLIF(acknowledged_by,''),?) WHERE id=?").run("Đã chuyển sửa chữa", nowSql(), String(actor || "Khoa Trang bị"), incident.id);
      db.prepare("UPDATE devices SET status=? WHERE id=?").run("Chờ sửa chữa", incident.device_id);
      writeHistory("repair", info.lastInsertRowid, "Hệ thống", "Tạo từ sự cố", "", payload.processing_status, `Tạo phiếu sửa chữa từ sự cố ${incident.incident_code || ('#' + incident.id)}`, 0, "Tự động", payload.received_at);
      writeAudit(actor || "Khoa Trang bị", "Chuyển sự cố sang sửa chữa", "incident", incident.id, `Phiếu sửa chữa #${info.lastInsertRowid}`);
      return info.lastInsertRowid;
    });
    const repairId = tx();
    res.json({ ok: true, repair_id: repairId });
  } catch (e) {
    console.error("POST /api/incidents/:id/transfer-repair error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/incidents/:id", (req, res) => {
  try {
    const id=Number(req.params.id);
    const old=db.prepare("SELECT * FROM incidents WHERE id=?").get(id);
    if(!old) return res.status(404).json({error:"Không tìm thấy sự cố."});
    const linked=db.prepare("SELECT COUNT(*) c FROM repairs WHERE incident_id=?").get(id).c;
    if(linked>0) return res.status(400).json({error:"Sự cố đã chuyển sửa chữa, không thể xóa. Vui lòng xử lý trong phiếu sửa chữa."});
    if(String(old.acknowledged_at||"").trim() || String(old.status||"")==="Đã tiếp nhận") {
      return res.status(400).json({error:"Sự cố đã được tiếp nhận nên không được xóa để bảo toàn lịch sử. Hãy cập nhật trạng thái/xử lý thay vì xóa."});
    }
    const files=db.prepare("SELECT file_path FROM incident_files WHERE incident_id=?").all(id);
    const tx=db.transaction(()=>{
      db.prepare("DELETE FROM incidents WHERE id=?").run(id);
      writeAudit(requestActor(req, old.reporter || "Khoa Trang bị"), "Xóa sự cố chưa tiếp nhận", "incident", id, `${old.incident_code || ""} | ${old.description || ""}`);
    });
    tx();
    for(const row of files){
      if(row.file_path) safeUnlink(path.join(__dirname,String(row.file_path).replace(/^\//,"")));
    }
    res.json({ok:true,deleted_files:files.length});
  }catch(e){
    console.error("DELETE /api/incidents/:id error:",e);
    res.status(500).json({error:e.message});
  }
});


app.get("/api/checks/:id/history", (req, res) => {
  const rows = db.prepare(`SELECT * FROM activity_history WHERE module='check' AND record_id=? ORDER BY action_time DESC, id DESC`).all(req.params.id);
  res.json(rows);
});



function getDepartmentRows(scopeCode = "ALL") {
  const rows = db.prepare("SELECT code, name FROM departments ORDER BY code").all();
  return scopeCode && scopeCode !== "ALL" ? rows.filter(x => x.code === scopeCode) : rows;
}
function getGroupRows(scopeCode = "ALL") {
  const rows = db.prepare("SELECT code, name FROM device_groups ORDER BY code").all();
  return scopeCode && scopeCode !== "ALL" ? rows.filter(x => x.code === scopeCode) : rows;
}
function getScopedDevices(scopeDepartment = "ALL", scopeGroup = "ALL") {
  let rows = db.prepare(`
    SELECT dv.id, dv.name, dv.department_code, dv.group_code
    FROM devices dv
    WHERE COALESCE(dv.is_archived,0)=0
    ORDER BY dv.id
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.id) }));
  if (scopeDepartment && scopeDepartment !== "ALL") rows = rows.filter(x => x.department_code === scopeDepartment);
  if (scopeGroup && scopeGroup !== "ALL") rows = rows.filter(x => x.group_code === scopeGroup);
  return rows;
}
function styleTemplateSheet(ws) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const header = ws.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1F4E78" } };
  header.eachCell(cell => {
    cell.border = {
      top: { style: "thin", color: { argb: "D9E2F3" } },
      left: { style: "thin", color: { argb: "D9E2F3" } },
      bottom: { style: "thin", color: { argb: "D9E2F3" } },
      right: { style: "thin", color: { argb: "D9E2F3" } }
    };
  });
}
function addListValidation(ws, startCol, endCol, formulaName, startRow = 2, endRow = 500) {
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      ws.getCell(`${col}${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`=${formulaName}`],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Giá trị không hợp lệ",
        error: "Vui lòng chọn giá trị trong danh sách có sẵn."
      };
    }
  }
}
async function buildExcelTemplate(kind, scopeDepartment = "ALL", scopeGroup = "ALL") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Khoa Trang bị - Bệnh viện Quân y 4";
  workbook.company = "Bệnh viện Quân y 4";
  workbook.created = new Date();

  const listSheet = workbook.addWorksheet("DanhMuc");
  listSheet.state = "hidden";

  const departments = getDepartmentRows(scopeDepartment);
  const groups = getGroupRows(scopeGroup);
  const devices = getScopedDevices(scopeDepartment, scopeGroup);

  listSheet.getCell("A1").value = "Khoa/phòng";
  departments.forEach((d, i) => listSheet.getCell(`A${i+2}`).value = d.name);

  listSheet.getCell("B1").value = "Nhóm thiết bị";
  groups.forEach((g, i) => listSheet.getCell(`B${i+2}`).value = g.name);

  listSheet.getCell("C1").value = "Mã thiết bị";
  devices.forEach((d, i) => listSheet.getCell(`C${i+2}`).value = d.device_code);

  listSheet.getCell("D1").value = "Tình trạng";
  ["Đang hoạt động","Hoạt động hạn chế","Chờ sửa chữa","Ngừng hoạt động"].forEach((v, i) => listSheet.getCell(`D${i+2}`).value = v);

  listSheet.getCell("E1").value = "Hình thức";
  ["Nội bộ","Thuê ngoài","Thay thế linh kiện","Nâng cấp thiết bị"].forEach((v, i) => listSheet.getCell(`E${i+2}`).value = v);

  listSheet.getCell("F1").value = "Loại thực hiện";
  ["Bảo dưỡng định kỳ","Vệ sinh thiết bị","Thay vật tư định kỳ","Kiểm tra an toàn điện","Kiểm tra chất lượng","Cập nhật phần mềm"].forEach((v, i) => listSheet.getCell(`F${i+2}`).value = v);

  listSheet.getCell("G1").value = "Đánh giá";
  ["Đạt","Đạt có lưu ý","Không đạt","Cần theo dõi thêm"].forEach((v, i) => listSheet.getCell(`G${i+2}`).value = v);

  workbook.definedNames.add("DepartmentList", `DanhMuc!$A$2:$A$${Math.max(2, departments.length+1)}`);
  workbook.definedNames.add("GroupList", `DanhMuc!$B$2:$B$${Math.max(2, groups.length+1)}`);
  workbook.definedNames.add("DeviceList", `DanhMuc!$C$2:$C$${Math.max(2, devices.length+1)}`);
  workbook.definedNames.add("StatusList", `DanhMuc!$D$2:$D$5`);
  workbook.definedNames.add("MethodList", `DanhMuc!$E$2:$E$5`);
  workbook.definedNames.add("MaintenanceTypeList", `DanhMuc!$F$2:$F$7`);
  workbook.definedNames.add("MaintenanceResultList", `DanhMuc!$G$2:$G$5`);

  if (kind === "devices") {
    const ws = workbook.addWorksheet("Template");
    ws.columns = [
      { header: "Khoa/phòng", key: "department_name", width: 28 },
      { header: "Nhóm thiết bị", key: "group_name", width: 22 },
      { header: "Tên thiết bị", key: "name", width: 32 },
      { header: "Hãng sản xuất", key: "manufacturer", width: 22 },
      { header: "Model", key: "model", width: 20 },
      { header: "Serial", key: "serial", width: 22 },
      { header: "Nước sản xuất", key: "country", width: 18 },
      { header: "Năm sản xuất", key: "year_manufactured", width: 14 },
      { header: "Năm sử dụng", key: "year_in_use", width: 14 },
      { header: "Hạn bảo hành", key: "warranty_end", width: 16 },
      { header: "Tình trạng", key: "status", width: 20 },
      { header: "Nguyên giá", key: "cost", width: 14 },
      { header: "Nguồn kinh phí", key: "funding", width: 20 },
      { header: "Vị trí đặt máy", key: "location", width: 22 },
      { header: "Ghi chú", key: "note", width: 26 }
    ];
    styleTemplateSheet(ws);
    ws.getRow(2).values = [
      departments[0]?.name || "",
      groups[0]?.name || "",
      "Máy CT Scanner 64 lát",
      "Canon Medical",
      "Aquilion Prime SP",
      "CT-NEW-001",
      "Nhật Bản",
      2025,
      2026,
      "2027-12-31",
      "Đang hoạt động",
      0,
      "",
      "Phòng CT",
      ""
    ];
    addListValidation(ws, "A", "A", "DepartmentList");
    addListValidation(ws, "B", "B", "GroupList");
    addListValidation(ws, "K", "K", "StatusList");
    ws.getCell("Q1").value = "Lưu ý";
    ws.getCell("Q2").value = "Bấm vào từng ô dữ liệu từ dòng 2 trở xuống để hiện danh sách chọn sẵn.";
  }

  if (kind === "repairs") {
    const ws = workbook.addWorksheet("Template");
    ws.columns = [
      { header: "Ngày", key: "repair_date", width: 14 },
      { header: "Khoa/phòng", key: "department_name", width: 28 },
      { header: "Nhóm thiết bị", key: "group_name", width: 22 },
      { header: "Mã thiết bị", key: "device_code", width: 18 },
      { header: "Tình trạng / nguyên nhân hỏng", key: "issue", width: 34 },
      { header: "Nội dung sửa chữa", key: "work", width: 30 },
      { header: "Người thực hiện", key: "person", width: 20 },
      { header: "Hình thức", key: "method", width: 18 },
      { header: "Kinh phí", key: "cost", width: 14 },
      { header: "Kết quả", key: "result", width: 22 },
      { header: "TTTB sau sửa chữa", key: "status_after", width: 22 }
    ];
    styleTemplateSheet(ws);
    ws.getRow(2).values = [
      "2026-04-12",
      departments[0]?.name || "",
      groups[0]?.name || "",
      devices[0]?.device_code || "",
      "Sai lệch chỉ số oxy",
      "Thay cảm biến oxy",
      "Tổ TTBYT",
      "Nội bộ",
      0,
      "Đã xử lý",
      "Đang hoạt động"
    ];
    addListValidation(ws, "B", "B", "DepartmentList");
    addListValidation(ws, "C", "C", "GroupList");
    addListValidation(ws, "D", "D", "DeviceList");
    addListValidation(ws, "H", "H", "MethodList");
    addListValidation(ws, "K", "K", "StatusList");
  }

  if (kind === "maintenances") {
    const ws = workbook.addWorksheet("Template");
    ws.columns = [
      { header: "Ngày thực hiện", key: "maintenance_date", width: 16 },
      { header: "Khoa/phòng", key: "department_name", width: 28 },
      { header: "Nhóm thiết bị", key: "group_name", width: 22 },
      { header: "Mã thiết bị", key: "device_code", width: 18 },
      { header: "Loại", key: "type", width: 24 },
      { header: "Nội dung", key: "content", width: 32 },
      { header: "Đánh giá", key: "result", width: 18 },
      { header: "Người thực hiện", key: "performer", width: 20 },
      { header: "Người sử dụng xác nhận", key: "user_confirm", width: 24 },
      { header: "Đơn vị / NCC", key: "vendor", width: 22 },
      { header: "Đến hạn tiếp theo", key: "next_date", width: 18 },
      { header: "Ghi chú", key: "note", width: 24 }
    ];
    styleTemplateSheet(ws);
    ws.getRow(2).values = [
      "2026-04-12",
      departments[0]?.name || "",
      groups[0]?.name || "",
      devices[0]?.device_code || "",
      "Bảo dưỡng định kỳ",
      "Kiểm tra hệ thống và hiệu chỉnh cơ bản",
      "Đạt",
      "Tổ TTBYT",
      "KTV CĐHA",
      "Nội bộ",
      "2026-10-12",
      ""
    ];
    addListValidation(ws, "B", "B", "DepartmentList");
    addListValidation(ws, "C", "C", "GroupList");
    addListValidation(ws, "D", "D", "DeviceList");
    addListValidation(ws, "E", "E", "MaintenanceTypeList");
    addListValidation(ws, "G", "G", "MaintenanceResultList");
  }

  return workbook;
}


app.get("/api/inspections", (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, dv.name AS device_name, dv.department_code, dv.group_code, d.name AS department_name, g.name AS group_name
    FROM inspections i
    JOIN devices dv ON dv.id = i.device_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    ORDER BY COALESCE(i.next_date, i.inspection_date) ASC, i.id DESC
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

function buildInspectionPayload(input = {}) {
  return {
    device_id:Number(input.device_id || 0),
    inspection_date:normalizeDateTime(input.inspection_date || ""),
    type:String(input.type || "").trim(),
    organization:String(input.organization || "").trim(),
    certificate_no:String(input.certificate_no || "").trim(),
    result:String(input.result || "Đạt").trim() || "Đạt",
    next_date:String(input.next_date || "").slice(0,10),
    file_note:String(input.file_note || "").trim(),
    note:String(input.note || "")
  };
}
function validateInspectionPayload(payload) {
  if (!payload.device_id) return "Vui lòng chọn thiết bị.";
  const device = db.prepare("SELECT id FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(payload.device_id);
  if (!device) return "Thiết bị không tồn tại hoặc đã lưu trữ.";
  if (!payload.inspection_date) return "Vui lòng nhập thời gian thực hiện.";
  if (!payload.type) return "Vui lòng chọn loại kiểm định/hiệu chuẩn.";
  if (!["Đạt","Đạt có lưu ý","Không đạt"].includes(payload.result)) return "Kết quả không hợp lệ.";
  return "";
}

app.post("/api/inspections", (req, res) => {
  try {
    const payload=buildInspectionPayload(req.body || {});
    const error=validateInspectionPayload(payload);
    if(error) return res.status(400).json({error});
    const info = db.prepare(`INSERT INTO inspections (device_id,inspection_date,type,organization,certificate_no,result,next_date,file_note,note) VALUES (@device_id,@inspection_date,@type,@organization,@certificate_no,@result,@next_date,@file_note,@note)`).run(payload);
    writeAudit(requestActor(req), "Tạo kiểm định/hiệu chuẩn", "inspection", info.lastInsertRowid, `${payload.type} | ${payload.certificate_no}`);
    res.json({ id: info.lastInsertRowid });
  } catch(e) {
    console.error("POST /api/inspections error:",e);
    res.status(400).json({error:e.message || "Không thể lưu kiểm định/hiệu chuẩn."});
  }
});

app.put("/api/inspections/:id", (req, res) => {
  try {
    const id=Number(req.params.id);
    const old=db.prepare("SELECT * FROM inspections WHERE id=?").get(id);
    if(!old) return res.status(404).json({error:"Không tìm thấy hồ sơ kiểm định/hiệu chuẩn."});
    const payload=buildInspectionPayload(req.body || {});
    const error=validateInspectionPayload(payload);
    if(error) return res.status(400).json({error});
    db.prepare(`UPDATE inspections SET device_id=@device_id, inspection_date=@inspection_date, type=@type, organization=@organization, certificate_no=@certificate_no, result=@result, next_date=@next_date, file_note=@file_note, note=@note WHERE id=@id`).run({...payload,id});
    writeAudit(requestActor(req), "Cập nhật kiểm định/hiệu chuẩn", "inspection", id, `${payload.type} | ${payload.certificate_no}`);
    res.json({ ok: true });
  } catch(e) {
    console.error("PUT /api/inspections/:id error:",e);
    res.status(400).json({error:e.message || "Không thể cập nhật kiểm định/hiệu chuẩn."});
  }
});

app.delete("/api/inspections/:id", (req, res) => {
  try{
    const id=Number(req.params.id);
    const old=db.prepare("SELECT * FROM inspections WHERE id=?").get(id);
    if(!old) return res.status(404).json({error:"Không tìm thấy hồ sơ kiểm định/hiệu chuẩn."});
    if(String(old.file_note||"").trim().startsWith("/uploads/")){
      return res.status(400).json({error:"Hồ sơ kiểm định/hiệu chuẩn đã có file chứng nhận; không được xóa để bảo toàn hồ sơ."});
    }
    db.prepare("DELETE FROM inspections WHERE id=?").run(id);
    writeAudit(requestActor(req), "Xóa kiểm định/hiệu chuẩn chưa có file", "inspection", id, `${old.type || ""} | ${old.certificate_no || ""}`);
    res.json({ok:true});
  }catch(e){
    console.error("DELETE /api/inspections/:id error:",e);
    res.status(500).json({error:e.message});
  }
});

app.get("/api/quality-ratings", (req, res) => {
  const rows = db.prepare(`
    SELECT q.*, dv.name AS device_name, dv.department_code, dv.group_code, d.name AS department_name, g.name AS group_name
    FROM quality_ratings q
    JOIN devices dv ON dv.id = q.device_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    ORDER BY q.total_score ASC, q.id DESC
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

app.post("/api/quality-ratings", (req, res) => {
  const p = req.body;
  const total = Number(p.age_score||0)+Number(p.performance_score||0)+Number(p.repair_score||0)+Number(p.inspection_score||0)+Number(p.sparepart_score||0);
  const grade = total >= 90 ? "A" : total >= 80 ? "B" : total >= 65 ? "C" : "D";
  const info = db.prepare(`INSERT OR REPLACE INTO quality_ratings (id,device_id,rating_date,age_score,performance_score,repair_score,inspection_score,sparepart_score,total_score,grade,recommendation,evaluator,note) VALUES ((SELECT id FROM quality_ratings WHERE device_id=@device_id),@device_id,@rating_date,@age_score,@performance_score,@repair_score,@inspection_score,@sparepart_score,@total_score,@grade,@recommendation,@evaluator,@note)`).run({ ...p, total_score: total, grade });
  res.json({ id: info.lastInsertRowid, total_score: total, grade });
});

app.delete("/api/quality-ratings/:id", (req, res) => {
  db.prepare("DELETE FROM quality_ratings WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/usage-reports", (req, res) => {
  const rows = db.prepare(`
    SELECT u.*, dv.name AS device_name, dv.department_code, dv.group_code, d.name AS department_name, g.name AS group_name
    FROM usage_reports u
    JOIN devices dv ON dv.id = u.device_id
    LEFT JOIN departments d ON d.code = dv.department_code
    LEFT JOIN device_groups g ON g.code = dv.group_code
    ORDER BY u.year DESC, u.month DESC, u.id DESC
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.device_id) }));
  res.json(rows);
});

app.post("/api/usage-reports", (req, res) => {
  const p = req.body;
  const info = db.prepare(`INSERT INTO usage_reports (device_id,year,month,indicator,value,unit,note) VALUES (@device_id,@year,@month,@indicator,@value,@unit,@note)`).run(p);
  res.json({ id: info.lastInsertRowid });
});

app.delete("/api/usage-reports/:id", (req, res) => {
  db.prepare("DELETE FROM usage_reports WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/devices/:id/transfers", (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, fd.name AS from_department_name, td.name AS to_department_name
    FROM device_transfers t
    LEFT JOIN departments fd ON fd.code=t.from_department_code
    LEFT JOIN departments td ON td.code=t.to_department_code
    WHERE t.device_id=?
    ORDER BY t.transfer_datetime DESC, t.id DESC
  `).all(Number(req.params.id));
  res.json(rows);
});

app.post("/api/devices/:id/transfer", (req, res) => {
  try {
    const id = Number(req.params.id);
    const d = db.prepare("SELECT * FROM devices WHERE id=? AND COALESCE(is_archived,0)=0").get(id);
    if (!d) return res.status(404).json({ error: "Không tìm thấy thiết bị đang quản lý." });
    const toDepartment = String(req.body.to_department_code || "").trim();
    if (!toDepartment) return res.status(400).json({ error: "Thiếu khoa/phòng nhận." });
    if (!db.prepare("SELECT code FROM departments WHERE code=?").get(toDepartment)) {
      return res.status(400).json({ error: "Khoa/phòng nhận không tồn tại trong danh mục." });
    }
    const toLocation = String(req.body.to_location || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "Vui lòng nhập lý do điều chuyển." });
    if (toDepartment === String(d.department_code || "") && toLocation === String(d.location || "")) {
      return res.status(400).json({ error: "Khoa/phòng và vị trí mới không thay đổi so với hiện tại." });
    }
    const openRepair = db.prepare("SELECT id FROM repairs WHERE device_id=? AND COALESCE(processing_status,'') IN ('Đang xử lý','Đang sửa chữa','Chờ linh kiện') ORDER BY id DESC LIMIT 1").get(id);
    if (openRepair) return res.status(400).json({ error: `Thiết bị đang có phiếu sửa chữa #${openRepair.id} chưa hoàn thành; chưa điều chuyển khoa quản lý.` });
    const openIncident = db.prepare("SELECT id FROM incidents WHERE device_id=? AND status IN ('Mới ghi nhận','Đã tiếp nhận') ORDER BY id DESC LIMIT 1").get(id);
    if (openIncident) return res.status(400).json({ error: `Thiết bị đang có sự cố #${openIncident.id} chưa hoàn tất; chưa điều chuyển khoa quản lý.` });

    const at = normalizeDateTime(req.body.transfer_datetime || nowSql()) || nowSql();
    const actor = requestActor(req, "");
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO device_transfers
        (device_id,transfer_datetime,from_department_code,from_location,to_department_code,to_location,reason,actor,note)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(id, at, d.department_code || "", d.location || "", toDepartment, toLocation, reason, actor, req.body.note || "");
      db.prepare("UPDATE devices SET department_code=?, location=? WHERE id=?").run(toDepartment, toLocation, id);
      writeAudit(actor, "Điều chuyển thiết bị", "device", id, `${d.department_code || ""}/${d.location || ""} → ${toDepartment}/${toLocation} | ${reason}`);
      return info.lastInsertRowid;
    });
    res.json({ ok: true, id: tx(), qr_uid: ensureDeviceQrUid(id) });
  } catch(e) {
    console.error("POST /api/devices/:id/transfer error:",e);
    res.status(500).json({error:e.message});
  }
});

app.get("/api/devices/:id/technical-history", (req, res) => {
  const id = Number(req.params.id);
  const from = String(req.query.from_date || "");
  const to = String(req.query.to_date || "");
  const type = String(req.query.type || "ALL");
  const inRange = (v) => {
    const d = String(v || "").slice(0,10);
    return (!from || d >= from) && (!to || d <= to);
  };
  let rows = [];
  db.prepare("SELECT * FROM incidents WHERE device_id=?").all(id).forEach(r => rows.push({
    type:"Sự cố", date:r.incident_datetime, status:normalizeIncidentStatusForUi(r.status, db.prepare("SELECT id FROM repairs WHERE incident_id=? LIMIT 1").get(r.id)?.id),
    content:r.description || "", person:r.reporter || "", record_id:r.id
  }));
  db.prepare("SELECT * FROM repairs WHERE device_id=?").all(id).forEach(r => rows.push({
    type:"Sửa chữa", date:r.received_at || r.repair_date, status:normalizeRepairStatus(r.processing_status),
    content:[r.issue,r.work,r.result].filter(Boolean).join(" | "), person:r.person || "", record_id:r.id
  }));
  db.prepare("SELECT * FROM maintenances WHERE device_id=?").all(id).forEach(r => rows.push({
    type:"Bảo dưỡng", date:r.maintenance_date, status:r.result || "", content:[r.type,r.content].filter(Boolean).join(" | "), person:r.performer || "", record_id:r.id
  }));
  db.prepare("SELECT * FROM inspections WHERE device_id=?").all(id).forEach(r => rows.push({
    type:r.type || "Kiểm định", date:r.inspection_date, status:r.result || "", content:[r.organization,r.certificate_no].filter(Boolean).join(" | "), person:r.organization || "", record_id:r.id
  }));
  rows = rows.filter(r => inRange(r.date) && (type === "ALL" || r.type === type)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  res.json(rows);
});

app.get("/api/inventory-sessions", (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, d.name AS department_name,
      COUNT(i.id) AS total_items,
      SUM(CASE WHEN i.result<>'Chưa kiểm kê' THEN 1 ELSE 0 END) AS checked_items,
      SUM(CASE WHEN i.result='Không thấy' THEN 1 ELSE 0 END) AS missing_items,
      SUM(CASE WHEN i.result IN ('Sai vị trí','Sai khoa') THEN 1 ELSE 0 END) AS mismatch_items
    FROM inventory_sessions s
    LEFT JOIN departments d ON d.code=s.department_code
    LEFT JOIN inventory_items i ON i.session_id=s.id
    GROUP BY s.id
    ORDER BY s.inventory_date DESC, s.id DESC
  `).all();
  res.json(rows);
});

app.post("/api/inventory-sessions", (req, res) => {
  const departmentCode = String(req.body.department_code || "").trim();
  const inventoryDate = String(req.body.inventory_date || nowSql().slice(0,10)).slice(0,10);
  const actor = String(req.body.actor || "").trim();
  if (!departmentCode) return res.status(400).json({ error:"Thiếu khoa/phòng kiểm kê." });
  const dept = db.prepare("SELECT code FROM departments WHERE code=?").get(departmentCode);
  if (!dept) return res.status(400).json({ error:"Khoa/phòng không tồn tại." });
  const openSession = db.prepare("SELECT id FROM inventory_sessions WHERE department_code=? AND status='Đang kiểm kê' ORDER BY id DESC LIMIT 1").get(departmentCode);
  if (openSession) return res.status(409).json({ error:`Khoa/phòng đang có đợt kiểm kê #${openSession.id} chưa hoàn thành.` });

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO inventory_sessions (inventory_date,department_code,status,actor,note,created_at)
      VALUES (?,?,?,?,?,?)
    `).run(inventoryDate, departmentCode, "Đang kiểm kê", actor, req.body.note || "", nowSql());
    const devices = db.prepare(`
      SELECT id, department_code, location
      FROM devices
      WHERE department_code=? AND COALESCE(is_archived,0)=0
      ORDER BY id
    `).all(departmentCode);
    const insert = db.prepare(`
      INSERT INTO inventory_items
      (session_id,device_id,expected_department_code,expected_location,result,actual_department_code,actual_location,note,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    for (const d of devices) {
      insert.run(info.lastInsertRowid,d.id,d.department_code,d.location || "","Chưa kiểm kê",d.department_code,d.location || "","",nowSql(),actor);
    }
    writeAudit(actor,"Tạo đợt kiểm kê","inventory",info.lastInsertRowid,`${departmentCode} | ${inventoryDate} | ${devices.length} thiết bị`);
    return { id:info.lastInsertRowid, count:devices.length };
  });
  res.json(tx());
});

app.get("/api/inventory-sessions/:id", (req, res) => {
  const session = db.prepare(`
    SELECT s.*, d.name AS department_name
    FROM inventory_sessions s LEFT JOIN departments d ON d.code=s.department_code
    WHERE s.id=?
  `).get(Number(req.params.id));
  if (!session) return res.status(404).json({ error:"Không tìm thấy đợt kiểm kê." });
  const items = db.prepare(`
    SELECT i.*, dv.device_code, dv.name AS device_name, dv.model, dv.serial,
           d.name AS actual_department_name
    FROM inventory_items i
    JOIN devices dv ON dv.id=i.device_id
    LEFT JOIN departments d ON d.code=i.actual_department_code
    WHERE i.session_id=?
    ORDER BY dv.name, dv.device_code
  `).all(session.id).map(r => ({...r, device_code:getDeviceCode(r.device_id)}));
  res.json({ session, items });
});

app.put("/api/inventory-items/:id", (req, res) => {
  const old = db.prepare(`
    SELECT i.*,s.status AS session_status
    FROM inventory_items i JOIN inventory_sessions s ON s.id=i.session_id
    WHERE i.id=?
  `).get(Number(req.params.id));
  if (!old) return res.status(404).json({ error:"Không tìm thấy dòng kiểm kê." });
  if (old.session_status === "Đã hoàn thành") return res.status(400).json({ error:"Đợt kiểm kê đã hoàn thành; không được sửa kết quả." });

  const allowed = ["Chưa kiểm kê","Có","Không thấy","Sai vị trí","Sai khoa"];
  const result = allowed.includes(req.body.result) ? req.body.result : "Chưa kiểm kê";
  let actualDepartment = String(req.body.actual_department_code || old.actual_department_code || old.expected_department_code || "").trim();
  let actualLocation = String(req.body.actual_location ?? old.actual_location ?? "").trim();

  if (!db.prepare("SELECT code FROM departments WHERE code=?").get(actualDepartment)) {
    return res.status(400).json({ error:"Khoa/phòng thực tế không tồn tại trong danh mục." });
  }
  if (result === "Có") {
    actualDepartment = String(old.expected_department_code || "");
    actualLocation = String(old.expected_location || "");
  }
  if (result === "Sai khoa" && actualDepartment === String(old.expected_department_code || "")) {
    return res.status(400).json({ error:"Kết quả “Sai khoa” phải chọn khoa/phòng thực tế khác khoa dự kiến." });
  }
  if (result === "Sai vị trí" && (!actualLocation || actualLocation === String(old.expected_location || ""))) {
    return res.status(400).json({ error:"Kết quả “Sai vị trí” phải nhập vị trí thực tế khác vị trí dự kiến." });
  }
  const actor = String(req.authUser?.full_name || req.body.updated_by || "").trim();
  db.prepare(`
    UPDATE inventory_items
    SET result=?, actual_department_code=?, actual_location=?, note=?, updated_at=?, updated_by=?
    WHERE id=?
  `).run(result, actualDepartment, actualLocation, req.body.note || "", nowSql(), actor, old.id);
  writeAudit(actor,"Cập nhật kiểm kê","inventory_item",old.id,`${old.result} → ${result}; thực tế ${actualDepartment}/${actualLocation}`);
  res.json({ok:true});
});

app.post("/api/inventory-sessions/:id/complete", (req, res) => {
  const id = Number(req.params.id);
  const session = db.prepare("SELECT * FROM inventory_sessions WHERE id=?").get(id);
  if (!session) return res.status(404).json({ error:"Không tìm thấy đợt kiểm kê." });
  if (session.status === "Đã hoàn thành") return res.json({ok:true,pending:0,already_completed:true});
  const pending = db.prepare("SELECT COUNT(*) c FROM inventory_items WHERE session_id=? AND result='Chưa kiểm kê'").get(id).c;
  if (pending > 0 && String(req.body.force || "") !== "1") {
    return res.status(400).json({ error:`Còn ${pending} thiết bị chưa kiểm kê.` });
  }
  db.prepare("UPDATE inventory_sessions SET status='Đã hoàn thành', completed_at=? WHERE id=?").run(nowSql(),id);
  writeAudit(req.authUser?.full_name || req.body.actor || session.actor || "","Hoàn thành kiểm kê","inventory",id,`Còn chưa kiểm kê: ${pending}`);
  res.json({ok:true,pending});
});

app.get("/api/dashboard/operations", (req, res) => {
  const today = localDateISO();
  const plus30 = localDatePlusDays(30);
  const total = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0").get().c;
  const active = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND status='Đang hoạt động'").get().c;
  const repairing = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND status='Chờ sửa chữa'").get().c;
  const openIncidents = db.prepare("SELECT COUNT(*) c FROM incidents WHERE status IN ('Mới ghi nhận','Đã tiếp nhận')").get().c;
  const unacknowledgedIncidents = db.prepare("SELECT COUNT(*) c FROM incidents WHERE status='Mới ghi nhận' AND (acknowledged_at IS NULL OR acknowledged_at='')").get().c;
  const avgResponseMinutes = Number(db.prepare(`
    SELECT AVG((julianday(acknowledged_at)-julianday(incident_datetime))*24*60) v
    FROM incidents
    WHERE acknowledged_at IS NOT NULL AND acknowledged_at<>'' AND incident_datetime IS NOT NULL
  `).get().v || 0);
  const avgResolutionMinutes = Number(db.prepare(`
    SELECT AVG((julianday(r.completed_at)-julianday(i.incident_datetime))*24*60) v
    FROM repairs r JOIN incidents i ON i.id=r.incident_id
    WHERE r.completed_at IS NOT NULL AND r.completed_at<>'' AND i.incident_datetime IS NOT NULL
  `).get().v || 0);
  const dueInspection = db.prepare("SELECT COUNT(*) c FROM inspections i JOIN devices d ON d.id=i.device_id WHERE COALESCE(d.is_archived,0)=0 AND i.next_date>=? AND i.next_date<=?").get(today,plus30).c;
  const overdueInspection = db.prepare("SELECT COUNT(*) c FROM inspections i JOIN devices d ON d.id=i.device_id WHERE COALESCE(d.is_archived,0)=0 AND i.next_date<?").get(today).c;
  const waitingParts = db.prepare("SELECT COUNT(*) c FROM repairs r JOIN devices d ON d.id=r.device_id WHERE COALESCE(d.is_archived,0)=0 AND r.processing_status='Chờ linh kiện'").get().c;
  const qrChecksToday = db.prepare("SELECT COUNT(*) c FROM daily_checks WHERE source_channel='QR' AND substr(check_datetime,1,10)=?").get(today).c;
  const qrIssuesToday = db.prepare("SELECT COUNT(*) c FROM daily_checks WHERE source_channel='QR' AND substr(check_datetime,1,10)=? AND result='Có vấn đề'").get(today).c;
  const todayParts = today.split("-").map(Number);
  const monthStartUtc = new Date(Date.UTC(todayParts[0], todayParts[1]-1-5, 1, 12, 0, 0));
  const monthStart = `${monthStartUtc.getUTCFullYear()}-${String(monthStartUtc.getUTCMonth()+1).padStart(2,"0")}-01`;
  const monthlyIncidents = db.prepare(`
    SELECT substr(incident_datetime,1,7) month, COUNT(*) count
    FROM incidents
    WHERE substr(incident_datetime,1,10)>=?
    GROUP BY substr(incident_datetime,1,7)
    ORDER BY month
  `).all(monthStart);
  res.json({ today, timeZone:APP_TIME_ZONE, total, active, repairing, openIncidents, unacknowledgedIncidents, dueInspection, overdueInspection, waitingParts, qrChecksToday, qrIssuesToday, avgResponseMinutes, avgResolutionMinutes, monthlyIncidents });
});

app.get("/api/audit-logs", (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
  res.json(db.prepare("SELECT * FROM audit_logs ORDER BY action_time DESC, id DESC LIMIT ?").all(limit));
});

const backupDir = path.join(__dirname, "backups");
function listDatabaseBackups() {
  fs.mkdirSync(backupDir, { recursive: true });
  return fs.readdirSync(backupDir).filter(x => /^qy4_ttbyt_.*\.sqlite$/i.test(x)).sort().reverse();
}
function backupFilesDirFor(filename) {
  return path.join(backupDir, String(filename || "").replace(/\.sqlite$/i, ".files"));
}
function snapshotDirectoryWithHardlinks(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive:true });
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes:true })) {
    const src=path.join(sourceDir,entry.name);
    const dst=path.join(targetDir,entry.name);
    if (entry.isDirectory()) {
      snapshotDirectoryWithHardlinks(src,dst);
    } else if (entry.isFile()) {
      try { fs.linkSync(src,dst); }
      catch { fs.copyFileSync(src,dst); }
    }
  }
}
function removeBackupBundle(filename) {
  try { fs.unlinkSync(path.join(backupDir, filename)); } catch {}
  try { fs.rmSync(backupFilesDirFor(filename), { recursive:true, force:true }); } catch {}
}
function verifySqliteBackup(target) {
  let checkDb=null;
  try {
    checkDb=new Database(target,{readonly:true,fileMustExist:true});
    const row=checkDb.prepare("PRAGMA quick_check").get();
    const value=row ? String(Object.values(row)[0] || "") : "";
    if (value.toLowerCase() !== "ok") throw new Error(`SQLite quick_check: ${value || "không có kết quả"}`);
  } finally {
    if (checkDb) checkDb.close();
  }
}
function pruneDatabaseBackups() {
  const keep = Math.max(3, Number(process.env.QY4_BACKUP_KEEP || 30));
  const files = listDatabaseBackups();
  files.slice(keep).forEach(removeBackupBundle);
}
async function createDatabaseBackup(actor = "Hệ thống", reason = "Sao lưu dữ liệu") {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = nowSql().replace(/[-: ]/g,"").slice(0,14);
  const millis = String(Date.now() % 1000).padStart(3,"0");
  const filename = `qy4_ttbyt_${stamp}_${millis}.sqlite`;
  const target = path.join(backupDir, filename);
  const filesTarget = backupFilesDirFor(filename);
  try {
    await db.backup(target);
    verifySqliteBackup(target);
    fs.rmSync(filesTarget,{recursive:true,force:true});
    snapshotDirectoryWithHardlinks(path.join(__dirname,"uploads"), filesTarget);
    pruneDatabaseBackups();
    writeAudit(actor, reason, "system", filename, `${target} + ${filesTarget}`);
    return filename;
  } catch (e) {
    removeBackupBundle(filename);
    throw e;
  }
}
async function ensureDailyBackup() {
  try {
    const day = nowSql().slice(0,10).replace(/-/g,"");
    const completeToday = listDatabaseBackups().find(x => x.includes(day) && fs.existsSync(backupFilesDirFor(x)));
    if (completeToday) return;
    await createDatabaseBackup("Hệ thống", "Sao lưu tự động hằng ngày");
  } catch (e) {
    console.error("Auto backup error:", e.message);
  }
}

app.get("/api/system/readiness", (req, res) => {
  const backups = listDatabaseBackups();
  const origins = getLanQrOrigins(req);
  const recommendedOrigin = origins.find(x => !/localhost|127\.0\.0\.1/i.test(x)) || origins[0] || "";
  const totalDevices = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0").get().c;
  const missingSerial = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(serial,''))=''").get().c;
  const missingModel = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(model,''))=''").get().c;
  const missingLocation = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(location,''))=''").get().c;
  const missingYear = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND COALESCE(year_in_use,0)<=0").get().c;
  const missingQr = db.prepare("SELECT COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(qr_uid,''))=''").get().c;
  const duplicateSerialGroups = db.prepare(`
    SELECT COUNT(*) c FROM (
      SELECT lower(trim(serial)) k
      FROM devices
      WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(serial,''))<>''
      GROUP BY lower(trim(serial))
      HAVING COUNT(*)>1
    )
  `).get().c;
  const activeAdmins = db.prepare("SELECT COUNT(*) c FROM users WHERE role='Quản trị viên' AND status='Hoạt động' AND trim(COALESCE(password_hash,''))<>''").get().c;
  const activeUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE status='Hoạt động'").get().c;
  const unacknowledged = db.prepare("SELECT COUNT(*) c FROM incidents WHERE status='Mới ghi nhận' AND trim(COALESCE(acknowledged_at,''))=''").get().c;
  let qrUploadWritable = true, documentUploadWritable = true, backupWritable = true;
  try { fs.accessSync(qrUploadsDir, fs.constants.W_OK); } catch { qrUploadWritable = false; }
  try { fs.accessSync(uploadsDir, fs.constants.W_OK); } catch { documentUploadWritable = false; }
  try { fs.mkdirSync(backupDir,{recursive:true}); fs.accessSync(backupDir, fs.constants.W_OK); } catch { backupWritable = false; }
  const uploadWritable = qrUploadWritable && documentUploadWritable && backupWritable;
  let dbSize = 0;
  try { dbSize = fs.statSync(dbPath).size; } catch {}
  let liveDbIntegrity = "Lỗi";
  try {
    const row=db.prepare("PRAGMA quick_check").get();
    liveDbIntegrity=String(row ? Object.values(row)[0] || "" : "").toLowerCase()==="ok" ? "Đạt" : "Lỗi";
  } catch { liveDbIntegrity="Lỗi"; }

  const incompleteCore = db.prepare(`
    SELECT COUNT(*) c FROM devices
    WHERE COALESCE(is_archived,0)=0 AND (
      trim(COALESCE(serial,''))='' OR trim(COALESCE(model,''))='' OR trim(COALESCE(manufacturer,''))=''
      OR trim(COALESCE(location,''))='' OR COALESCE(year_in_use,0)<=0
    )
  `).get().c;
  const completeCore = Math.max(0, Number(totalDevices)-Number(incompleteCore));
  const completePercent = totalDevices ? Number((completeCore*100/totalDevices).toFixed(1)) : 100;

  const checks = [
    {
      key:"database_integrity",
      level:liveDbIntegrity === "Đạt" ? "Đạt" : "Cần xử lý",
      title:"Toàn vẹn database SQLite",
      detail:liveDbIntegrity === "Đạt" ? "PRAGMA quick_check = ok." : "SQLite quick_check không đạt; không nên tiếp tục nhập dữ liệu trước khi kiểm tra/khôi phục backup."
    },
    {
      key:"demo",
      level:process.env.QY4_DEMO_SEED === "1" ? "Cần xử lý" : "Đạt",
      title:"Chế độ dữ liệu mẫu",
      detail:process.env.QY4_DEMO_SEED === "1" ? "QY4_DEMO_SEED=1. Phải tắt trước khi dùng dữ liệu thật." : "Dữ liệu mẫu đang tắt."
    },
    {
      key:"auth",
      level:AUTH_REQUIRED && activeAdmins>0 ? "Đạt" : "Cần xử lý",
      title:"Đăng nhập và quản trị",
      detail:AUTH_REQUIRED ? (activeAdmins>0 ? `Đã bật xác thực; có ${activeAdmins} Quản trị viên hoạt động.` : "Đã bật xác thực nhưng chưa có Quản trị viên có mật khẩu.") : "QY4_AUTH_REQUIRED đang tắt."
    },
    {
      key:"backup",
      level:backups.length && fs.existsSync(backupFilesDirFor(backups[0])) ? "Đạt" : "Cần xử lý",
      title:"Sao lưu dữ liệu + file đính kèm",
      detail:backups.length
        ? (fs.existsSync(backupFilesDirFor(backups[0]))
            ? `Có ${backups.length} bản sao lưu; mới nhất: ${backups[0]} kèm snapshot uploads.`
            : `Bản backup mới nhất ${backups[0]} chưa có snapshot uploads; hãy tạo backup mới.`)
        : "Chưa có bản sao lưu dữ liệu."
    },
    {
      key:"qr_origin",
      level:recommendedOrigin && !/localhost|127\.0\.0\.1/i.test(recommendedOrigin) ? "Đạt" : "Cần xử lý",
      title:"Địa chỉ QR trên mạng nội bộ",
      detail:recommendedOrigin
        ? (/localhost|127\.0\.0\.1/i.test(recommendedOrigin)
            ? `Địa chỉ hiện tại ${recommendedOrigin} chỉ dùng trên chính máy chủ; cần chốt IP/hostname LAN trước khi in QR.`
            : `Địa chỉ LAN đề xuất: ${recommendedOrigin}. Hãy giữ IP/hostname này ổn định sau khi in QR.`)
        : "Chưa xác định được địa chỉ LAN cho QR."
    },
    {
      key:"timezone",
      level:APP_TIME_ZONE === "Asia/Bangkok" ? "Đạt" : "Lưu ý",
      title:"Múi giờ ứng dụng",
      detail:`${APP_TIME_ZONE} · ngày hệ thống: ${localDateISO()} · thời gian: ${nowSql().slice(11,19)}.`
    },
    {
      key:"legacy_qr",
      level:ALLOW_LEGACY_PUBLIC_QR ? "Lưu ý" : "Đạt",
      title:"QR cũ theo ID/mã thiết bị",
      detail:ALLOW_LEGACY_PUBLIC_QR
        ? "Đang bật tương thích QR cũ. Sau khi in lại tem QR UID cố định, nên tắt QY4_ALLOW_LEGACY_QR."
        : "Đã tắt endpoint QR cũ có thể dò tuần tự; chỉ QR UID cố định được dùng công khai."
    },
    {
      key:"uploads",
      level:uploadWritable ? "Đạt" : "Cần xử lý",
      title:"Quyền ghi dữ liệu và file",
      detail:uploadWritable
        ? "Thư mục ảnh/video QR, tài liệu đính kèm và backup đều có quyền ghi."
        : `Thiếu quyền ghi: QR=${qrUploadWritable?"OK":"LỖI"}, tài liệu=${documentUploadWritable?"OK":"LỖI"}, backup=${backupWritable?"OK":"LỖI"}.`
    },
    {
      key:"data_quality",
      level:completePercent >= 95 ? "Đạt" : "Lưu ý",
      title:"Độ đầy đủ dữ liệu thiết bị cốt lõi",
      detail:`${completePercent}% (${completeCore}/${totalDevices}). Thiếu Serial: ${missingSerial}; Model: ${missingModel}; vị trí: ${missingLocation}; năm sử dụng: ${missingYear}.`
    },
    {
      key:"qr_uid",
      level:missingQr===0 ? "Đạt" : "Cần xử lý",
      title:"QR UID cố định",
      detail:missingQr===0 ? `Toàn bộ ${totalDevices} thiết bị đang quản lý đã có QR UID.` : `Còn ${missingQr} thiết bị chưa có QR UID.`
    },
    {
      key:"duplicate_serial",
      level:duplicateSerialGroups===0 ? "Đạt" : "Lưu ý",
      title:"Serial trùng",
      detail:duplicateSerialGroups===0 ? "Không phát hiện nhóm Serial trùng." : `Có ${duplicateSerialGroups} nhóm Serial trùng cần xác minh.`
    },
    {
      key:"incidents",
      level:unacknowledged===0 ? "Đạt" : "Lưu ý",
      title:"Sự cố chưa tiếp nhận",
      detail:unacknowledged===0 ? "Không có sự cố mới đang thiếu mốc tiếp nhận." : `Có ${unacknowledged} sự cố mới chưa có mốc tiếp nhận.`
    }
  ];
  const blocking = checks.filter(x=>x.level==="Cần xử lý").length;
  const warnings = checks.filter(x=>x.level==="Lưu ý").length;
  res.json({
    generated_at:nowSql(),
    overall:blocking===0 ? (warnings===0 ? "Sẵn sàng" : "Sẵn sàng có lưu ý") : "Chưa sẵn sàng",
    blocking,
    warnings,
    checks,
    system:{
      time_zone:APP_TIME_ZONE,
      database_size_bytes:dbSize,
      database_integrity:liveDbIntegrity,
      active_users:activeUsers,
      total_devices:totalDevices,
      recommended_qr_origin:recommendedOrigin,
      backups:backups.length
    }
  });
});

app.get("/api/system/backups", (req, res) => {
  res.json(listDatabaseBackups());
});

app.post("/api/system/backup", async (req, res) => {
  try {
    const filename = await createDatabaseBackup(req.authUser?.full_name || req.body?.actor || "Quản trị viên", "Sao lưu dữ liệu");
    res.json({ ok:true, filename });
  } catch (e) {
    res.status(500).json({ error:e.message });
  }
});

app.get("/api/leadership-dashboard", (req, res) => {
  const devices = db.prepare("SELECT * FROM devices WHERE COALESCE(is_archived,0)=0").all();
  const total = devices.length;
  const totalCost = devices.reduce((s,d)=>s+Number(d.cost||0),0);
  const active = devices.filter(d=>d.status === "Đang hoạt động").length;
  const repair = devices.filter(d=>d.status === "Chờ sửa chữa").length;
  const currentYear = Number(localDateISO().slice(0,4));
  const old10 = devices.filter(d=>Number(d.year_in_use||0) && (currentYear - Number(d.year_in_use)) > 10).length;
  const today = localDateISO();
  const plus30 = localDatePlusDays(30);
  const dueInspections = db.prepare("SELECT COUNT(*) c FROM inspections i JOIN devices dv ON dv.id=i.device_id WHERE COALESCE(dv.is_archived,0)=0 AND i.next_date >= ? AND i.next_date <= ?").get(today, plus30).c;
  const overdueInspections = db.prepare("SELECT COUNT(*) c FROM inspections i JOIN devices dv ON dv.id=i.device_id WHERE COALESCE(dv.is_archived,0)=0 AND i.next_date < ?").get(today).c;
  const dueMaint = db.prepare("SELECT COUNT(*) c FROM maintenances m JOIN devices dv ON dv.id=m.device_id WHERE COALESCE(dv.is_archived,0)=0 AND m.next_date >= ? AND m.next_date <= ?").get(today, plus30).c;
  const overdueMaint = db.prepare("SELECT COUNT(*) c FROM maintenances m JOIN devices dv ON dv.id=m.device_id WHERE COALESCE(dv.is_archived,0)=0 AND m.next_date < ?").get(today).c;
  const quality = db.prepare("SELECT quality_level AS grade, COUNT(*) c FROM devices WHERE COALESCE(is_archived,0)=0 GROUP BY quality_level ORDER BY quality_level").all();
  const byDept = db.prepare(`SELECT d.code, d.name, COUNT(dv.id) count, SUM(COALESCE(dv.cost,0)) cost FROM departments d LEFT JOIN devices dv ON dv.department_code=d.code AND COALESCE(dv.is_archived,0)=0 GROUP BY d.code,d.name ORDER BY count DESC`).all();
  res.json({ total, totalCost, active, repair, old10, dueInspections, overdueInspections, dueMaint, overdueMaint, quality, byDept });
});

app.get("/api/reports/summary", (req, res) => {
  const now = new Date();
  const today = localDateISO(now);
  const days = Number(req.query.days || 60);
  const future = localDatePlusDays(days, now);
  const devices = db.prepare(`
    SELECT dv.*, d.name AS department_name, g.name AS group_name
    FROM devices dv
    LEFT JOIN departments d ON d.code=dv.department_code
    LEFT JOIN device_groups g ON g.code=dv.group_code
    WHERE COALESCE(dv.is_archived,0)=0
    ORDER BY dv.id
  `).all().map(enrichDevice);
  const maint = db.prepare("SELECT device_id, MAX(substr(maintenance_date,1,10)) last_date, MAX(next_date) next_date FROM maintenances GROUP BY device_id").all();
  const insp = db.prepare("SELECT device_id, MAX(substr(inspection_date,1,10)) last_date, MAX(next_date) next_date FROM inspections GROUP BY device_id").all();
  const repairs = db.prepare("SELECT device_id, COUNT(*) repair_count, SUM(cost) total_cost FROM repairs GROUP BY device_id").all();
  const maintMap = new Map(maint.map(x => [Number(x.device_id), x]));
  const inspMap = new Map(insp.map(x => [Number(x.device_id), x]));
  const repairMap = new Map(repairs.map(x => [Number(x.device_id), x]));
  const enriched = devices.map(d => ({...d, maintenance: maintMap.get(d.id) || {}, inspection: inspMap.get(d.id) || {}, repair: repairMap.get(d.id) || {repair_count:0,total_cost:0}}));
  const warrantySoon = enriched.filter(d => d.warranty_end && d.warranty_end >= today && d.warranty_end <= future);
  const maintenanceOverdue = enriched.filter(d => d.maintenance.next_date && d.maintenance.next_date < today);
  const inspectionOverdue = enriched.filter(d => d.inspection.next_date && d.inspection.next_date < today);
  const frequentRepairs = enriched.filter(d => Number(d.repair.repair_count || 0) >= 2).sort((a,b)=>Number(b.repair.repair_count)-Number(a.repair.repair_count));
  const replaceList = enriched.filter(d => ["Chờ sửa chữa","Ngừng hoạt động","Hoạt động hạn chế"].includes(d.status) || Number(d.quality_level || 3) >= 4 || Number(d.repair.repair_count || 0) >= 3);
  const costByDepartment = db.prepare(`
    SELECT dv.department_code, d.name AS department_name, COUNT(r.id) repair_count, SUM(COALESCE(r.cost,0)) total_cost
    FROM repairs r JOIN devices dv ON dv.id=r.device_id LEFT JOIN departments d ON d.code=dv.department_code
    WHERE COALESCE(dv.is_archived,0)=0
    GROUP BY dv.department_code ORDER BY total_cost DESC
  `).all();
  const statusRatio = db.prepare("SELECT COALESCE(status,'Chưa rõ') status, COUNT(*) count FROM devices WHERE COALESCE(is_archived,0)=0 GROUP BY status ORDER BY count DESC").all();
  res.json({ warrantySoon, maintenanceOverdue, inspectionOverdue, frequentRepairs, replaceList, costByDepartment, statusRatio });
});

app.get("/api/reports/data-quality", (req, res) => {
  const rows = db.prepare(`
    SELECT id,device_code,name,department_code,manufacturer,model,serial,insurance_code,
           country,year_manufactured,year_in_use,location,qr_uid,is_archived
    FROM devices
    WHERE COALESCE(is_archived,0)=0
    ORDER BY department_code,name,id
  `).all().map(r=>({...r,device_code:getDeviceCode(r.id),qr_uid:ensureDeviceQrUid(r.id)}));

  const missing = key => rows.filter(r=>String(r[key]??"").trim()==="");
  const suspiciousSerial = rows.filter(r=>!String(r.serial||"").trim() && String(r.insurance_code||"").trim());
  const duplicateSerialGroups = db.prepare(`
    SELECT lower(trim(serial)) AS serial_key, MIN(serial) AS serial, COUNT(*) AS count
    FROM devices
    WHERE COALESCE(is_archived,0)=0 AND trim(COALESCE(serial,''))<>''
    GROUP BY lower(trim(serial))
    HAVING COUNT(*)>1
    ORDER BY count DESC,serial
  `).all();
  const incompleteRows = rows.filter(r =>
    !String(r.model||"").trim() || !String(r.serial||"").trim() || !String(r.manufacturer||"").trim()
    || !String(r.location||"").trim() || !Number(r.year_in_use||0)
  );

  const total=rows.length;
  const completeCore=total-incompleteRows.length;
  res.json({
    summary:{
      total_devices:total,
      core_complete_devices:completeCore,
      core_complete_percent:total?Number((completeCore*100/total).toFixed(1)):0,
      missing_serial:missing("serial").length,
      missing_model:missing("model").length,
      missing_manufacturer:missing("manufacturer").length,
      missing_location:missing("location").length,
      missing_year_in_use:rows.filter(r=>!Number(r.year_in_use||0)).length,
      missing_qr_uid:missing("qr_uid").length,
      serial_blank_with_insurance_code:suspiciousSerial.length,
      duplicate_serial_groups:duplicateSerialGroups.length
    },
    suspicious_serial_rows:suspiciousSerial,
    duplicate_serial_groups:duplicateSerialGroups,
    incomplete_devices:incompleteRows
  });
});

app.get("/api/reports/kpi", (req, res) => {
  const today = localDateISO();
  const currentYear = today.slice(0,4);
  const fromDate = String(req.query.from_date || `${currentYear}-01-01`).slice(0,10);
  const toDate = String(req.query.to_date || today).slice(0,10);
  const departmentCode = String(req.query.department_code || "ALL").trim();
  const responseTargetMinutes = Math.max(1, Math.min(1440, Number(req.query.response_target_minutes || 30)));

  let sql = `
    SELECT i.id,i.incident_code,i.device_id,i.incident_datetime,i.description,i.status,i.reporter,
           i.source_channel,i.acknowledged_at,i.acknowledged_by,i.completed_at,
           COALESCE(NULLIF(i.department_snapshot,''), d.name, dv.department_code) AS department_name,
           COALESCE(NULLIF(i.device_code_snapshot,''), dv.device_code) AS device_code,
           COALESCE(NULLIF(i.device_name_snapshot,''), dv.name) AS device_name,
           COALESCE(NULLIF(i.department_code_snapshot,''),dv.department_code) AS department_code,
           r.id AS repair_id,r.processing_status AS repair_status,r.completed_at AS repair_completed_at,
           CASE WHEN i.acknowledged_at IS NOT NULL AND i.acknowledged_at<>''
             THEN MAX(0,(julianday(i.acknowledged_at)-julianday(i.incident_datetime))*24*60) ELSE NULL END AS response_minutes,
           CASE
             WHEN COALESCE(NULLIF(r.completed_at,''),NULLIF(i.completed_at,'')) IS NOT NULL
             THEN MAX(0,(julianday(COALESCE(NULLIF(r.completed_at,''),NULLIF(i.completed_at,'')))-julianday(i.incident_datetime))*24*60)
             ELSE NULL
           END AS resolution_minutes
    FROM incidents i
    JOIN devices dv ON dv.id=i.device_id
    LEFT JOIN departments d ON d.code=dv.department_code
    LEFT JOIN repairs r ON r.id=(SELECT rr.id FROM repairs rr WHERE rr.incident_id=i.id ORDER BY rr.id DESC LIMIT 1)
    WHERE substr(i.incident_datetime,1,10)>=? AND substr(i.incident_datetime,1,10)<=?
  `;
  const params = [fromDate,toDate];
  if (departmentCode && departmentCode !== "ALL") {
    sql += " AND COALESCE(NULLIF(i.department_code_snapshot,''),dv.department_code)=?";
    params.push(departmentCode);
  }
  sql += " ORDER BY i.incident_datetime DESC,i.id DESC";
  const records = db.prepare(sql).all(...params).map(r => ({
    ...r,
    source_channel: r.source_channel || "Không xác định",
    response_minutes: r.response_minutes == null ? null : Number(Number(r.response_minutes).toFixed(1)),
    resolution_minutes: r.resolution_minutes == null ? null : Number(Number(r.resolution_minutes).toFixed(1))
  }));

  let checkSql = `
    SELECT c.id,c.device_id,c.check_datetime,c.inspector,c.result,c.source_channel,
           c.department_code_snapshot,c.location_snapshot,dv.device_code,dv.name AS device_name
    FROM daily_checks c
    JOIN devices dv ON dv.id=c.device_id
    WHERE substr(c.check_datetime,1,10)>=? AND substr(c.check_datetime,1,10)<=?
      AND c.source_channel='QR'
  `;
  const checkParams=[fromDate,toDate];
  if (departmentCode && departmentCode !== "ALL") {
    checkSql += " AND c.department_code_snapshot=?";
    checkParams.push(departmentCode);
  }
  checkSql += " ORDER BY c.check_datetime DESC,c.id DESC";
  const qrChecks=db.prepare(checkSql).all(...checkParams);
  const qrCheckIssueCount=qrChecks.filter(r=>String(r.result||"")==="Có vấn đề").length;
  const qrCheckNormalCount=qrChecks.filter(r=>String(r.result||"")==="Bình thường").length;
  const qrCheckUniqueDevices=new Set(qrChecks.map(r=>Number(r.device_id))).size;

  const median = values => {
    const arr = values.filter(v => Number.isFinite(v)).sort((a,b)=>a-b);
    if (!arr.length) return null;
    const m = Math.floor(arr.length/2);
    return arr.length % 2 ? arr[m] : (arr[m-1]+arr[m])/2;
  };
  const avg = values => values.length ? values.reduce((s,v)=>s+v,0)/values.length : null;
  const responseValues = records.map(r=>r.response_minutes).filter(v=>Number.isFinite(v));
  const resolutionValues = records.map(r=>r.resolution_minutes).filter(v=>Number.isFinite(v));
  const qrIncidents = records.filter(r=>r.source_channel==="QR").length;
  const directIncidents = records.filter(r=>r.source_channel==="Nhập trực tiếp").length;
  const unknownIncidents = records.filter(r=>!["QR","Nhập trực tiếp"].includes(r.source_channel)).length;
  const withinTarget = responseValues.filter(v=>v<=responseTargetMinutes).length;
  const resolved = records.filter(r=>Number.isFinite(r.resolution_minutes)).length;
  const open = records.filter(r=>["Mới ghi nhận","Đã tiếp nhận"].includes(normalizeIncidentStatusForUi(r.status,r.repair_id))).length;

  const sourceMap = new Map();
  for (const r of records) {
    if (!sourceMap.has(r.source_channel)) sourceMap.set(r.source_channel, []);
    sourceMap.get(r.source_channel).push(r);
  }
  const bySource = Array.from(sourceMap.entries()).map(([source,rows])=>{
    const response=rows.map(r=>r.response_minutes).filter(v=>Number.isFinite(v));
    const resolution=rows.map(r=>r.resolution_minutes).filter(v=>Number.isFinite(v));
    const within=response.filter(v=>v<=responseTargetMinutes).length;
    return {
      source,
      count:rows.length,
      responded_incidents:response.length,
      response_data_completeness_percent:rows.length ? Number((response.length*100/rows.length).toFixed(1)) : 0,
      avg_response_minutes:avg(response)==null ? null : Number(avg(response).toFixed(1)),
      median_response_minutes:median(response)==null ? null : Number(median(response).toFixed(1)),
      response_within_target:within,
      response_within_target_percent:response.length ? Number((within*100/response.length).toFixed(1)) : 0,
      resolved_incidents:resolution.length,
      avg_resolution_minutes:avg(resolution)==null ? null : Number(avg(resolution).toFixed(1)),
      median_resolution_minutes:median(resolution)==null ? null : Number(median(resolution).toFixed(1))
    };
  }).sort((a,b)=>b.count-a.count);

  const monthMap = new Map();
  const dayMap = new Map();
  for (const r of records) {
    const month=String(r.incident_datetime||"").slice(0,7);
    const day=String(r.incident_datetime||"").slice(0,10);
    if(month) {
      const cur=monthMap.get(month)||{month,count:0,qr_count:0,qr_checks:0};
      cur.count++;
      if(r.source_channel==="QR") cur.qr_count++;
      monthMap.set(month,cur);
    }
    if(day) {
      const cur=dayMap.get(day)||{date:day,incidents:0,qr_incidents:0,qr_checks:0,qr_check_issues:0,device_ids:new Set()};
      cur.incidents++;
      if(r.source_channel==="QR") cur.qr_incidents++;
      dayMap.set(day,cur);
    }
  }

  for (const r of qrChecks) {
    const month=String(r.check_datetime||"").slice(0,7);
    const day=String(r.check_datetime||"").slice(0,10);
    if(month) {
      const cur=monthMap.get(month)||{month,count:0,qr_count:0,qr_checks:0};
      cur.qr_checks=(cur.qr_checks||0)+1;
      monthMap.set(month,cur);
    }
    if(day) {
      const cur=dayMap.get(day)||{date:day,incidents:0,qr_incidents:0,qr_checks:0,qr_check_issues:0,device_ids:new Set()};
      cur.qr_checks++;
      if(String(r.result||"")==="Có vấn đề") cur.qr_check_issues++;
      cur.device_ids.add(Number(r.device_id));
      dayMap.set(day,cur);
    }
  }
  const byDay=Array.from(dayMap.values()).map(x=>({
    date:x.date,
    incidents:x.incidents,
    qr_incidents:x.qr_incidents,
    qr_checks:x.qr_checks,
    qr_check_issues:x.qr_check_issues,
    qr_unique_devices:x.device_ids.size
  })).sort((a,b)=>a.date.localeCompare(b.date));

  res.json({
    period:{from_date:fromDate,to_date:toDate,department_code:departmentCode,response_target_minutes:responseTargetMinutes},
    summary:{
      total_incidents:records.length,
      qr_incidents:qrIncidents,
      direct_incidents:directIncidents,
      unknown_source_incidents:unknownIncidents,
      qr_share_percent:records.length ? Number((qrIncidents*100/records.length).toFixed(1)) : 0,
      qr_checks:qrChecks.length,
      qr_check_unique_devices:qrCheckUniqueDevices,
      qr_check_issue_count:qrCheckIssueCount,
      qr_check_normal_count:qrCheckNormalCount,
      responded_incidents:responseValues.length,
      response_data_completeness_percent:records.length ? Number((responseValues.length*100/records.length).toFixed(1)) : 0,
      avg_response_minutes:avg(responseValues)==null ? null : Number(avg(responseValues).toFixed(1)),
      median_response_minutes:median(responseValues)==null ? null : Number(median(responseValues).toFixed(1)),
      response_within_target:withinTarget,
      response_within_target_percent:responseValues.length ? Number((withinTarget*100/responseValues.length).toFixed(1)) : 0,
      resolved_incidents:resolved,
      avg_resolution_minutes:avg(resolutionValues)==null ? null : Number(avg(resolutionValues).toFixed(1)),
      median_resolution_minutes:median(resolutionValues)==null ? null : Number(median(resolutionValues).toFixed(1)),
      open_incidents:open
    },
    by_source:bySource,
    by_month:Array.from(monthMap.values()).sort((a,b)=>a.month.localeCompare(b.month)),
    by_day:byDay,
    check_records:qrChecks,
    records
  });
});

app.get("/api/force-report", (req, res) => {
  const rows = db.prepare(`
    SELECT dv.id, dv.name, dv.manufacturer, dv.model, dv.serial, dv.country, dv.year_manufactured, dv.year_in_use, dv.cost, dv.funding, dv.status,
           d.code AS department_code, d.name AS department_name, g.code AS group_code, g.name AS group_name,
           dv.quality_level AS grade,
           CASE
             WHEN dv.quality_level IN (1,2) THEN 'Tiếp tục khai thác'
             WHEN dv.quality_level = 3 THEN 'Theo dõi, bảo dưỡng định kỳ'
             WHEN dv.quality_level = 4 THEN 'Lập kế hoạch sửa chữa lớn/thay thế'
             WHEN dv.quality_level = 5 THEN 'Đề nghị thay thế hoặc thanh lý'
             ELSE ''
           END AS recommendation,
           COALESCE((SELECT SUM(value) FROM usage_reports u WHERE u.device_id=dv.id),0) AS usage_total
    FROM devices dv
    LEFT JOIN departments d ON d.code=dv.department_code
    LEFT JOIN device_groups g ON g.code=dv.group_code
    ORDER BY d.code, g.code, dv.name
  `).all().map(r => ({ ...r, device_code: getDeviceCode(r.id) }));
  res.json(rows);
});


app.get("/api/excel-template/:kind", async (req, res) => {
  try {
    const kind = req.params.kind;
    const departmentCode = req.query.department_code || "ALL";
    const groupCode = req.query.group_code || "ALL";
    if (!["devices","repairs","maintenances"].includes(kind)) {
      return res.status(400).send("Invalid template kind");
    }
    const workbook = await buildExcelTemplate(kind, departmentCode, groupCode);
    const buffer = await workbook.xlsx.writeBuffer();
    const filenameMap = { devices: "mau_nhap_thiet_bi.xlsx", repairs: "mau_nhap_sua_chua.xlsx", maintenances: "mau_nhap_bao_duong.xlsx" };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameMap[kind]}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).send("Không tạo được file Excel mẫu");
  }
});

app.post("/api/reset-seed", (req, res) => {
  if (process.env.QY4_DEMO_SEED !== "1") {
    return res.status(403).json({ error: "Reset dữ liệu chỉ được phép khi chạy chế độ demo (QY4_DEMO_SEED=1)." });
  }
  db.exec(`
    DELETE FROM accessories;
    DELETE FROM repairs;
    DELETE FROM maintenances;
    DELETE FROM operation_logs;
    DELETE FROM documents;
    DELETE FROM daily_checks;
    DELETE FROM incidents;
    DELETE FROM inspections;
    DELETE FROM quality_ratings;
    DELETE FROM usage_reports;
    DELETE FROM devices;
    DELETE FROM users;
    DELETE FROM departments;
    DELETE FROM device_groups;
  `);
  seedData();
  initExtendedModules();
  res.json({ ok: true });
});

if (process.env.QY4_DEMO_SEED === "1") refreshDemoTodayData();

app.get("/", (req, res) => {
  res.redirect("/dashboard.html");
});

app.listen(PORT, () => {
  console.log(`QY4 TTBYT app running at http://localhost:${PORT}`);
  console.log(`Xác thực người dùng: ${AUTH_REQUIRED ? "BẬT" : "TẮT (chế độ thử nghiệm/nội bộ)"}`);
  try {
    const lan = Object.values(os.networkInterfaces()).flat().filter(Boolean).find(net => net.family === "IPv4" && !net.internal);
    if (lan) console.log(`QR/mobile LAN URL: http://${lan.address}:${PORT}`);
  } catch (e) {}
  ensureDailyBackup();
  setInterval(ensureDailyBackup, 6 * 60 * 60 * 1000).unref();
});

