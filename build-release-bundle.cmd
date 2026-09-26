@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - BUILD RELEASE BUNDLE
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-bundle.ps1"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Goi release da duoc tao trong thu muc dist.
) else (
  echo [CAN XU LY] Khong tao duoc goi release.
)
echo.
pause
exit /b %RC%
