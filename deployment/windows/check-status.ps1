param([int]$Port = 5000)

$ErrorActionPreference = "SilentlyContinue"
$serverTask = Get-ScheduledTask -TaskName "QY4-TTBYT Server"
$backupTask = Get-ScheduledTask -TaskName "QY4-TTBYT Backup"

Write-Host "=== TRANG THAI QY4-TTBYT ===" -ForegroundColor Cyan
if ($serverTask) { Write-Host "Server task: $($serverTask.State)" } else { Write-Host "Server task: CHUA CAI" -ForegroundColor Yellow }
if ($backupTask) { Write-Host "Backup task: $($backupTask.State)" } else { Write-Host "Backup task: CHUA CAI" -ForegroundColor Yellow }

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/system/health" -TimeoutSec 5
  Write-Host "Dich vu: HOAT DONG" -ForegroundColor Green
  Write-Host "May: $($health.hostname)"
  Write-Host "CSDL: $($health.database_ready)"
  Write-Host "Uploads: $($health.uploads_ready)"
  Write-Host "Uptime: $($health.uptime_seconds) giay"
  foreach ($ip in $health.lan_addresses) { Write-Host "LAN: http://${ip}:$Port" -ForegroundColor Cyan }
} catch {
  Write-Host "Dich vu: KHONG PHAN HOI tai cong $Port" -ForegroundColor Red
  Write-Host "Kiem tra logs\qy4-ttbyt-server.log va Task Scheduler."
}
