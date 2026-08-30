const os = require("os");
const fs = require("fs");
const path = require("path");

module.exports = function registerDeploymentRoutes(app) {
  const root = __dirname;
  const dbPath = path.join(root, "db", "qy4_ttbyt.sqlite");
  const uploadsPath = path.join(root, "uploads");

  app.get("/api/system/health", (_req, res) => {
    const lan = [];
    try {
      const nets = os.networkInterfaces();
      Object.values(nets).flat().filter(Boolean).forEach(net => {
        if (net.family === "IPv4" && !net.internal) lan.push(net.address);
      });
    } catch (_) {}

    res.json({
      ok: true,
      service: "QY4-TTBYT",
      hostname: os.hostname(),
      port: Number(process.env.PORT || 5000),
      uptime_seconds: Math.round(process.uptime()),
      database_ready: fs.existsSync(dbPath),
      uploads_ready: fs.existsSync(uploadsPath),
      lan_addresses: [...new Set(lan)],
      checked_at: new Date().toISOString()
    });
  });
};
