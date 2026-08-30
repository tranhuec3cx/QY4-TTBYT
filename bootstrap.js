const path = require("path");
const express = require("express");

// Nạp bổ sung các phân hệ mở rộng ngay trước khi server bắt đầu lắng nghe,
// giữ nguyên server.js hiện tại để giảm rủi ro ảnh hưởng các phân hệ đang chạy.
const originalListen = express.application.listen;
let extensionsRegistered = false;

express.application.listen = function patchedListen(...args) {
  if (!extensionsRegistered) {
    require(path.join(__dirname, "deployment-routes"))(this);
    require(path.join(__dirname, "public-incident-admin-routes"))(this);
    require(path.join(__dirname, "lcm-routes"))(this);
    require(path.join(__dirname, "lcm-movements-routes"))(this);
    require(path.join(__dirname, "lcm-replacement-routes"))(this);
    extensionsRegistered = true;
  }
  return originalListen.apply(this, args);
};

require("./server");
