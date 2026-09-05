@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ===============================================
echo   QY4-TTBYT - TAT HE THONG AN TOAN
echo ===============================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\windows\stop-personal.ps1"
if errorlevel 1 (
  echo.
  echo [LOI] Khong the tat he thong an toan. Kiem tra thong bao phia tren.
  pause
  exit /b 1
)

timeout /t 2 /nobreak >nul
exit /b 0
