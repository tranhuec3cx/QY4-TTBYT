@echo off
setlocal
chcp 65001 >nul
title QY4-TTBYT - TEST LCM
cd /d "%~dp0"

echo ============================================================
echo  QY4-TTBYT - KIEM TRA NHANH PHAN HE LCM
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Khong tim thay Node.js trong PATH.
  echo Cai/kiem tra Node.js roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

node scripts\test-lcm.js
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo Hoan tat. Neu can, anh chup man hinh nay gui cho em.
) else (
  echo Co loi/canh bao can xem. Anh chup man hinh nay gui cho em.
)
echo.
pause
exit /b %RC%
