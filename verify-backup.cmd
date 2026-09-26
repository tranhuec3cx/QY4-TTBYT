@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - KIEM TRA PHUC HOI BACKUP
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH.
  echo Cai Node.js 20+ hoac mo file nay tren may da chay QY4-TTBYT.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\better-sqlite3" (
  echo [LOI] Thieu dependency better-sqlite3.
  echo Hay chay start-qy4-production.cmd de kiem tra/cai dependency truoc.
  echo.
  pause
  exit /b 1
)

node "scripts\verify-backup-restore.js"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Backup moi nhat da vuot qua restore rehearsal.
) else (
  echo [CAN XU LY] Backup chua vuot qua restore rehearsal. Khong dung backup nay lam moc phuc hoi chinh thuc.
)
echo.
pause
exit /b %RC%
