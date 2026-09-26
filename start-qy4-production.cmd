@echo off
setlocal
cd /d "%~dp0"
title QY4-TTBYT 5.0.0
echo ============================================
echo  QY4-TTBYT 5.0.0 - CHAY CHINH THUC
echo ============================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-qy4-production.ps1"
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo QY4-TTBYT dung voi ma loi %EXITCODE%.
) else (
  echo QY4-TTBYT da dung.
)
pause
exit /b %EXITCODE%
