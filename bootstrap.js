const path = require("path");
const express = require("express");

// Nạp bổ sung các phân hệ LCM ngay trước khi server bắt đầu lắng nghe,
// giữ nguyên server.js hiện tại để giảm rủi ro ảnh hưởng các phân hệ đang chạy.
const originalListen = express.application.listen;
let lcmRegistered = false;

express.application.listen = function patchedListen(...args) {
  if (!lcmRegistered) {
    require(path.join(__dirname, "lcm-routes"))(this);
    require(path.join(__dirname, "lcm-movements-routes"))(this);
    require(path.join(__dirname, "lcm-replacement-routes"))(this);
    lcmRegistered = true;
  }
  return originalListen.apply(this, args);
};

require("./server");
