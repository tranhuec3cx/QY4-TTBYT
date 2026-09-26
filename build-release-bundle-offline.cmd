@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - BUILD OFFLINE BUNDLE
echo ============================================
echo.
echo Goi nay se kem node_modules da duoc xac minh tren may Windows hien tai.
echo Khong dong kem database, uploads, backups hoac secrets.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay npm trong PATH.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\better-sqlite3" (
  echo [LOI] Chua co dependency day du.
  echo Hay chay start-qy4-production.cmd hoac npm ci tren chinh may Windows nay truoc.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-bundle.ps1" -IncludeDependencies
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Goi OFFLINE da duoc tao trong thu muc dist.
  echo [LUU Y] Nen dung tren Windows x64 tuong thich voi may build.
) else (
  echo [CAN XU LY] Khong tao duoc goi offline.
)
echo.
pause
exit /b %RC%
