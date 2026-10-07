#!/usr/bin/env bash
set -euo pipefail

if [ -z "${QY4_BUNDLE_URL:-}" ]; then
  echo "QY4_BUNDLE_URL is required" >&2
  exit 1
fi

rm -rf public db uploads
rm -f server.js package.json package-lock.json Procfile .dockerignore

curl -fL "$QY4_BUNDLE_URL" -o /tmp/qy4-rc42.tgz
tar -xzf /tmp/qy4-rc42.tgz -C .
rm -f /tmp/qy4-rc42.tgz

python3 render-patch-rc44.py
cp rc44-login.js public/login.js
python3 rc44-cache-patch.py
node -c public/api.js
node -c public/mobile-app.js
node -c public/login.js
npm ci

echo "QY4-TTBYT RC44 mobile/QR/login/cache patch installed successfully"
