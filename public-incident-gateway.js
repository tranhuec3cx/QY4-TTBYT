const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const multer = require("multer");
const { verifyPublicIncidentToken, getOrCreateSecret } = require("./public-incident-security");

const ROOT = __dirname;
const dbPath = path.join(ROOT, "db", "qy4_ttbyt.sqlite");
const publicDir = path.join(ROOT, "public-incident");
const uploadsDir = path.join(ROOT, "uploads", "qr");
const PORT = Number(process.env.PUBLIC_INCIDENT_PORT || 5050);
const HOST = String(process.env.PUBLIC_INCIDENT_HOST || "127.0.0.1");

if (!fs.existsSync(dbPath)) {
  console.error(`[PUBLIC INCIDENT] Không tìm thấy database thật: ${dbPath}`);
  console.error("Gateway dừng để tránh tự tạo database rỗng.");
  process.exit(1);
}

fs.mkdirSync(uploadsDir, { recursive: true });
getOrCreateSecret();

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
for (const required of ["devices", "departments", "incidents", "incident_files"]) {
  if (!tableExists(required)) {
    console.error(`[PUBLIC INCIDENT] Database thiếu bảng bắt buộc: ${required}`);
    process.exit(1);
  }
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}
function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `public-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];
    const allowedMime = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedExt.includes(ext) || !allowedMime.includes(file.mimetype)) {
      return cb(new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP."));
    }
    cb(null, true);
  }
});

function nowSql() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function incidentCode(id, dateTime) {
  const date = String(dateTime || nowSql()).slice(0, 10).replace(/-/g, "");
  return `SC-${date}-${String(id).padStart(4, "0")}`;
}
function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}
function deviceForToken(token) {
  const deviceId = verifyPublicIncidentToken(token);
  if (!deviceId) return null;
  return db.prepare(`
    SELECT dv.id, dv.name, dv.serial, dv.location, dv.department_code,
           COALESCE(d.name, dv.department_code, '') AS department_name,
           COALESCE(dv.device_code, '') AS device_code
    FROM devices dv
    LEFT JOIN departments d ON d.code = dv.department_code
    WHERE dv.id = ?
  `).get(deviceId) || null;
}
function removeUploaded(files) {
  for (const file of files || []) {
    try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "QY4 public incident gateway" }));
app.get("/assets/incident.css", (_req, res) => res.sendFile(path.join(publicDir, "incident.css")));
app.get("/assets/incident.js", (_req, res) => res.sendFile(path.join(publicDir, "incident.js")));
app.get("/assets/logo.jpg", (_req, res) => res.sendFile(path.join(ROOT, "public", "assets", "BVQY4.jpg")));

app.get("/s/:token", (req, res) => {
  if (!rateLimit(`page:${clientKey(req)}`, 60, 60 * 1000)) return res.status(429).send("Thao tác quá nhanh. Vui lòng thử lại sau.");
  if (!deviceForToken(req.params.token)) return res.status(404).send("Liên kết QR không hợp lệ hoặc thiết bị không tồn tại.");
  res.sendFile(path.join(publicDir, "incident.html"));
});

app.get("/api/device/:token", (req, res) => {
  if (!rateLimit(`device:${clientKey(req)}`, 60, 60 * 1000)) return res.status(429).json({ error: "Thao tác quá nhanh." });
  const device = deviceForToken(req.params.token);
  if (!device) return res.status(404).json({ error: "Liên kết QR không hợp lệ." });
  res.json({
    name: device.name || "",
    serial: device.serial || "",
    department_name: device.department_name || "",
    location: device.location || ""
  });
});

app.post("/api/incidents/:token", (req, res) => {
  upload.array("images", 3)(req, res, (uploadError) => {
    if (uploadError) {
      removeUploaded(req.files);
      const message = uploadError.code === "LIMIT_FILE_SIZE" ? "Mỗi ảnh tối đa 5MB." : (uploadError.message || "Ảnh tải lên không hợp lệ.");
      return res.status(400).json({ error: message });
    }

    const device = deviceForToken(req.params.token);
    if (!device) {
      removeUploaded(req.files);
      return res.status(404).json({ error: "Liên kết QR không hợp lệ." });
    }

    const ip = clientKey(req);
    if (!rateLimit(`submit-ip:${ip}`, 5, 10 * 60 * 1000) || !rateLimit(`submit-device:${device.id}`, 8, 60 * 60 * 1000)) {
      removeUploaded(req.files);
      return res.status(429).json({ error: "Đã gửi nhiều báo cáo trong thời gian ngắn. Vui lòng liên hệ trực tiếp Khoa Trang bị nếu khẩn cấp." });
    }

    const reporter = clean(req.body?.reporter, 100);
    const phone = clean(req.body?.phone, 30);
    const description = clean(req.body?.description, 1200);
    const publicSeverity = clean(req.body?.severity, 20);
    const honeypot = clean(req.body?.website, 100);

    if (honeypot) {
      removeUploaded(req.files);
      return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
    }
    if (reporter.length < 2) {
      removeUploaded(req.files);
      return res.status(400).json({ error: "Vui lòng nhập người báo sự cố." });
    }
    if (description.length < 5) {
      removeUploaded(req.files);
      return res.status(400).json({ error: "Vui lòng mô tả sự cố rõ hơn." });
    }

    const severity = publicSeverity === "Khẩn" ? "Cao" : "Trung bình";
    const t = nowSql();
    const files = Array.isArray(req.files) ? req.files : [];

    try {
      const createIncident = db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO incidents (
            device_id, incident_datetime, description, severity, reporter, reporter_phone,
            status, note, local_resolution_note, device_code_snapshot, device_name_snapshot,
            department_snapshot, location_snapshot, created_at, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'Mới ghi nhận', ?, '', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          device.id, t, description, severity, reporter, phone,
          "Báo sự cố qua QR công khai",
          device.device_code || "", device.name || "", device.department_name || "", device.location || "",
          t, t, "QR công khai"
        );

        const id = Number(info.lastInsertRowid);
        const code = incidentCode(id, t);
        db.prepare("UPDATE incidents SET incident_code=? WHERE id=?").run(code, id);

        const fileStmt = db.prepare(`
          INSERT INTO incident_files (incident_id, device_id, original_name, stored_name, file_path, file_mime, file_size, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const file of files) {
          fileStmt.run(id, device.id, file.originalname || "", file.filename, `/uploads/qr/${file.filename}`, file.mimetype, file.size, t);
        }

        if (tableExists("activity_history")) {
          try {
            db.prepare(`
              INSERT INTO activity_history (module, record_id, action_time, actor, action_type, old_status, new_status, note, cost, entry_type)
              VALUES ('incident', ?, ?, ?, 'Báo sự cố qua QR công khai', '', 'Mới ghi nhận', ?, 0, 'Tạo mới')
            `).run(id, t, reporter, description);
          } catch (_) {}
        }
        return { id, code };
      });

      const created = createIncident();
      res.status(201).json({ ok: true, incident_id: created.id, incident_code: created.code });
    } catch (error) {
      console.error("[PUBLIC INCIDENT] create incident error:", error);
      removeUploaded(files);
      res.status(500).json({ error: "Chưa gửi được sự cố. Vui lòng thử lại hoặc liên hệ Khoa Trang bị." });
    }
  });
});

app.use((_req, res) => res.status(404).send("Không tìm thấy nội dung."));

app.listen(PORT, HOST, () => {
  console.log(`[PUBLIC INCIDENT] Incident-only gateway: http://${HOST}:${PORT}`);
  console.log("[PUBLIC INCIDENT] Chỉ tunnel cổng này; KHÔNG tunnel cổng quản trị 5000.");
});
