const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const configDir = path.join(__dirname, "config");
const secretPath = path.join(configDir, "public-qr-secret.txt");
let cachedSecret = "";

function readSecretFile() {
  if (!fs.existsSync(secretPath)) return "";
  return fs.readFileSync(secretPath, "utf8").trim();
}

function getOrCreateSecret() {
  const envSecret = String(process.env.PUBLIC_QR_SECRET || "").trim();
  if (envSecret) return envSecret;
  if (cachedSecret) return cachedSecret;

  fs.mkdirSync(configDir, { recursive: true });
  const existing = readSecretFile();
  if (existing) {
    cachedSecret = existing;
    return cachedSecret;
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretPath, generated + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    try { fs.chmodSync(secretPath, 0o600); } catch (_) {}
    cachedSecret = generated;
  } catch (error) {
    if (error && error.code === "EEXIST") {
      cachedSecret = readSecretFile();
    } else {
      throw error;
    }
  }
  if (!cachedSecret) throw new Error("Không tạo được khóa bảo vệ QR công khai.");
  return cachedSecret;
}

function signatureFor(deviceId) {
  const id = String(Number(deviceId));
  return crypto.createHmac("sha256", getOrCreateSecret()).update(`qy4-incident:${id}`).digest("base64url").slice(0, 24);
}

function makePublicIncidentToken(deviceId) {
  const id = Number(deviceId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Mã thiết bị không hợp lệ.");
  return `${id}.${signatureFor(id)}`;
}

function verifyPublicIncidentToken(token) {
  const raw = String(token || "").trim();
  const match = raw.match(/^(\d+)\.([A-Za-z0-9_-]{24})$/);
  if (!match) return null;
  const id = Number(match[1]);
  const supplied = Buffer.from(match[2], "utf8");
  const expected = Buffer.from(signatureFor(id), "utf8");
  if (supplied.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(supplied, expected)) return null;
  return id;
}

function publicBaseUrl() {
  const configured = String(process.env.PUBLIC_INCIDENT_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const port = Number(process.env.PUBLIC_INCIDENT_PORT || 5050);
  return `http://127.0.0.1:${port}`;
}

function publicIncidentUrl(deviceId) {
  return `${publicBaseUrl()}/s/${makePublicIncidentToken(deviceId)}`;
}

module.exports = {
  getOrCreateSecret,
  makePublicIncidentToken,
  verifyPublicIncidentToken,
  publicBaseUrl,
  publicIncidentUrl
};
