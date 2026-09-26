@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  QY4-TTBYT 5.0.0 - VERIFY RELEASE BUNDLE
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js trong PATH.
  echo.
  pause
  exit /b 1
)

if not exist "RELEASE-MANIFEST-SHA256.txt" (
  echo [LOI] Khong tim thay RELEASE-MANIFEST-SHA256.txt.
  echo Hay chay file nay ben trong thu muc release da giai nen.
  echo.
  pause
  exit /b 1
)

node "scripts\verify-release-bundle.js"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [DAT] Goi release nguyen ven theo manifest SHA256.
) else (
  echo [CAN XU LY] Goi release bi thieu/sai file. Khong dung de cap nhat may that.
)
echo.
pause
exit /b %RC%
