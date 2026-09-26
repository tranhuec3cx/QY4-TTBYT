@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - KIEM TRA SAU MIGRATION
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
  echo [LOI] Thieu dependency better-sqlite3.
  echo Hay chay start-qy4-production.cmd truoc.
  echo.
  pause
  exit /b 1
)

if not exist "db\qy4_ttbyt.sqlite" (
  echo [LOI] Khong tim thay database hien tai.
  echo.
  pause
  exit /b 1
)

node "scripts\audit-migration.js"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Migration audit dat. Khong phat hien mat ID/ban ghi cu.
) else (
  echo [CAN XU LY] Migration audit khong dat. Khong tiep tuc chot phien ban cho toi khi doi chieu xong.
)
echo.
pause
exit /b %RC%
