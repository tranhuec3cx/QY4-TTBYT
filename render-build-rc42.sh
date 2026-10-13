#!/usr/bin/env bash
set -euo pipefail

BUNDLE_FILE=/tmp/qy4-rc42.tgz
USE_BUNDLE=0

# Ưu tiên bundle triển khai đã cấu hình. Nếu đường dẫn bundle cũ không còn hợp lệ,
# tiếp tục dùng chính mã nguồn đã checkout trong nhánh triển khai để tránh gián đoạn.
if [ -n "${QY4_BUNDLE_URL:-}" ]; then
  if curl -fL "$QY4_BUNDLE_URL" -o "$BUNDLE_FILE"; then
    USE_BUNDLE=1
  else
    echo "QY4_BUNDLE_URL is unavailable; using repository source as fallback" >&2
    rm -f "$BUNDLE_FILE"
  fi
else
  echo "QY4_BUNDLE_URL is not set; using repository source as fallback" >&2
fi

if [ "$USE_BUNDLE" -eq 1 ]; then
  rm -rf public db uploads
  rm -f server.js package.json package-lock.json Procfile .dockerignore
  tar -xzf "$BUNDLE_FILE" -C .
  rm -f "$BUNDLE_FILE"
fi

python3 render-patch-rc44.py
cp rc44-login.js public/login.js
python3 rc44-cache-patch.py
python3 render-demo-accounts.py
python3 rc49-settings-tabs-patch.py
python3 rc50-system-cleanup-patch.py
node -c public/api.js
node -c public/mobile-app.js
node -c public/login.js
node -c public/settings-system.js
node -c public/inventory.js
npm ci

echo "QY4-TTBYT RC51 inventory location labels installed successfully"
