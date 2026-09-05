@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

set "PUBLIC_INCIDENT_BASE_URL=https://seduce-mace-handball.ngrok-free.dev"
set "PUBLIC_INCIDENT_HOST=127.0.0.1"

echo ===============================================
echo   QY4-TTBYT - KHOI DONG HE THONG
echo ===============================================

if not exist "db\qy4_ttbyt.sqlite" (
  echo [LOI] Khong tim thay db\qy4_ttbyt.sqlite
  echo Khong khoi dong de tranh tao nham du lieu demo.
  pause
  exit /b 1
)

where node >nul 2>nul || (
  echo [LOI] Chua tim thay Node.js trong PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo [LOI] Chua tim thay npm trong PATH.
  pause
  exit /b 1
)

where ngrok >nul 2>nul || (
  echo [LOI] Chua tim thay ngrok trong PATH.
  echo Cai ngrok hoac mo lai Windows sau khi cai.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul
if errorlevel 1 (
  echo [1/3] Khoi dong quan tri cong 5000...
  start "QY4 TTBYT - Quan tri 5000" cmd /k "cd /d \"%~dp0\" && set PUBLIC_INCIDENT_BASE_URL=%PUBLIC_INCIDENT_BASE_URL% && npm start"
) else (
  echo [1/3] Cong 5000 dang hoat dong - bo qua.
)

netstat -ano | findstr /R /C:":5050 .*LISTENING" >nul
if errorlevel 1 (
  echo [2/3] Khoi dong gateway bao su co cong 5050...
  start "QY4 TTBYT - Bao su co 5050" cmd /k "cd /d \"%~dp0\" && set PUBLIC_INCIDENT_HOST=%PUBLIC_INCIDENT_HOST% && npm run start:public-incident"
) else (
  echo [2/3] Cong 5050 dang hoat dong - bo qua.
)

echo Dang cho cong 5050 san sang...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(30); do { try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',5050,$null,$null); if($iar.AsyncWaitHandle.WaitOne(300) -and $c.Connected){$c.EndConnect($iar);$c.Close();exit 0};$c.Close() } catch {}; Start-Sleep -Milliseconds 700 } while((Get-Date)-lt $deadline); exit 1"
if errorlevel 1 (
  echo [CANH BAO] Cong 5050 chua san sang sau 30 giay.
) else (
  echo Cong 5050 da san sang.
)

tasklist /FI "IMAGENAME eq ngrok.exe" 2>nul | find /I "ngrok.exe" >nul
if errorlevel 1 (
  echo [3/3] Khoi dong ngrok cho cong 5050...
  start "QY4 TTBYT - ngrok 5050" cmd /k "ngrok http 5050"
) else (
  echo [3/3] ngrok dang hoat dong - bo qua.
)

echo Dang cho cong 5000 san sang...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(30); do { try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('127.0.0.1',5000,$null,$null); if($iar.AsyncWaitHandle.WaitOne(300) -and $c.Connected){$c.EndConnect($iar);$c.Close();exit 0};$c.Close() } catch {}; Start-Sleep -Milliseconds 700 } while((Get-Date)-lt $deadline); exit 1"
if errorlevel 1 (
  echo [LOI] Cong 5000 khong san sang sau 30 giay. Khong mo trinh duyet.
  echo Hay xem cua so "QY4 TTBYT - Quan tri 5000" de kiem tra loi.
  pause
  exit /b 1
)

echo Cong 5000 da san sang. Mo trang Su co...
start "" "http://localhost:5000/tickets.html"

echo.
echo Da khoi dong he thong.
echo Quan tri: http://localhost:5000
echo QR Internet: %PUBLIC_INCIDENT_BASE_URL%
echo.
echo Luu y: chi cong 5050 duoc dua qua ngrok; khong tunnel cong 5000.
timeout /t 3 /nobreak >nul
exit /b 0
