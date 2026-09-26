@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - FINAL RELEASE GATE
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\better-sqlite3" (
  echo [LOI] Thieu dependency. Hay chay start-qy4-production.cmd truoc.
  echo.
  pause
  exit /b 1
)

node "scripts\final-release-gate.js"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Cac cong kiem tra ky thuat offline da dat.
  echo Van phai kiem tra man San sang trien khai va QR tren dien thoai cung LAN.
) else (
  echo [CAN XU LY] Chua du dieu kien chot Release Candidate.
)
echo.
pause
exit /b %RC%
