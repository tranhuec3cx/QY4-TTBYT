const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const manifest = path.join(root, "RELEASE-MANIFEST-SHA256.txt");
const blockers = [];
const notes = [];
const stats = { checked: 0, missing: 0, mismatched: 0 };

function sha256(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

if (!fs.existsSync(manifest)) {
  blockers.push("Không tìm thấy RELEASE-MANIFEST-SHA256.txt trong thư mục hiện tại.");
} else {
  const lines = fs.readFileSync(manifest, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([a-fA-F0-9]{64})\s{2}(.+)$/);
    if (!m) continue;
    const expected = m[1].toLowerCase();
    const rel = m[2].trim().replace(/\\/g, "/");
    const target = path.resolve(root, ...rel.split("/"));
    const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (!(target === root || target.startsWith(rootPrefix))) {
      blockers.push("Manifest chứa đường dẫn không an toàn: " + rel);
      continue;
    }
    stats.checked += 1;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      stats.missing += 1;
      blockers.push("Thiếu file trong release: " + rel);
      continue;
    }
    const actual = sha256(target);
    if (actual !== expected) {
      stats.mismatched += 1;
      blockers.push("SHA256 không khớp: " + rel);
    }
  }
  if (!stats.checked) blockers.push("Manifest không có dòng SHA256 hợp lệ.");
  if (!blockers.length) notes.push(`Đã xác minh ${stats.checked} file theo SHA256 manifest.`);
}

const ok = blockers.length === 0;
const jsonMode = process.argv.includes("--json");
const out = { ok, blockers, notes, stats };
if (jsonMode) {
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
} else {
  console.log("============================================");
  console.log(" QY4-TTBYT 5.0.0 - VERIFY RELEASE BUNDLE");
  console.log("============================================");
  for (const x of notes) console.log("[DAT] ", x);
  for (const x of blockers) console.log("[CHAN]", x);
  console.log("--------------------------------------------");
  console.log(ok ? "KET QUA: GOI RELEASE NGUYEN VEN" : `KET QUA: GOI RELEASE KHONG DAT (${blockers.length} muc)`);
}
process.exitCode = ok ? 0 : 2;
