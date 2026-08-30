param(
  [int]$Port = 5000,
  [string]$BackupTime = "16:00",
  [switch]$AllowDemoSeed
)

$ErrorActionPreference = "Stop"

function Require-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Hãy mở Windows PowerShell bằng Run as administrator rồi chạy lại setup.ps1."
  }
}

Require-Administrator

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$RunServerScript = Join-Path $PSScriptRoot "run-server.ps1"
$BackupScript = Join-Path $Root "scripts\backup.js"
$DatabasePath = Join-Path $Root "db\qy4_ttbyt.sqlite"
$PowerShellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$ServerTask = "QY4-TTBYT Server"
$BackupTask = "QY4-TTBYT Backup"
$FirewallName = "QY4-TTBYT LAN TCP $Port"

Write-Host "=== CAI DAT QY4-TTBYT NOI BO ===" -ForegroundColor Cyan
Write-Host "Thu muc: $Root"

if (-not (Test-Path $DatabasePath) -and -not $AllowDemoSeed) {
  throw "Chưa có database triển khai tại $DatabasePath. Bộ cài đã dừng để tránh tự sinh dữ liệu demo. Hãy chép database đang dùng thật vào thư mục db rồi chạy lại. Chỉ dùng -AllowDemoSeed khi cố ý dựng máy DEMO."
}
if (-not (Test-Path $DatabasePath) -and $AllowDemoSeed) {
  Write-Host "CANH BAO: Chua co database. Lan chay dau co the sinh du lieu DEMO." -ForegroundColor Yellow
}

$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm -ErrorAction Stop
Write-Host "Node.js: $($node.Source)"

Write-Host "Cai dat/cap nhat thu vien Node.js..." -ForegroundColor Yellow
Push-Location $Root
try {
  & $npm.Source install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install không thành công." }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "backups") | Out-Null

# Chỉ mở cổng trong mạng Domain/Private; không mở cho Public network.
if (-not (Get-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain,Private | Out-Null
  Write-Host "Da mo TCP $Port cho mang Domain/Private." -ForegroundColor Green
} else {
  Write-Host "Firewall rule da ton tai: $FirewallName"
}

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

$serverArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$RunServerScript`""
$serverAction = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $serverArgs -WorkingDirectory $Root
$serverTrigger = New-ScheduledTaskTrigger -AtStartup

try { Stop-ScheduledTask -TaskName $ServerTask -ErrorAction SilentlyContinue } catch {}
Register-ScheduledTask -TaskName $ServerTask -Action $serverAction -Trigger $serverTrigger -Principal $principal -Settings $settings -Description "QY4-TTBYT - tự khởi động phần mềm khi bật máy C10" -Force | Out-Null

try {
  $backupAt = [DateTime]::ParseExact($BackupTime, "HH:mm", $null)
} catch {
  throw "BackupTime phải có dạng HH:mm, ví dụ 16:00."
}
$backupArgs = "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$Root'; & '$($node.Source)' '$BackupScript' *>> '$Root\logs\qy4-ttbyt-backup.log'`""
$backupAction = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $backupArgs -WorkingDirectory $Root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $backupAt
Register-ScheduledTask -TaskName $BackupTask -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Description "QY4-TTBYT - sao lưu SQLite và file đính kèm hằng ngày" -Force | Out-Null

# Truyền PORT ở cấp máy để tác vụ SYSTEM nhận được sau khi khởi động.
[Environment]::SetEnvironmentVariable("PORT", [string]$Port, "Machine")
$env:PORT = [string]$Port

Start-ScheduledTask -TaskName $ServerTask
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== HOAN TAT ===" -ForegroundColor Green
Write-Host "Tu dong chay khi bat may: CO"
Write-Host "Khung gio van hanh du kien tai C10: 08:00 - 16:10"
Write-Host "Backup hang ngay luc: $BackupTime"
Write-Host "Thu muc backup mac dinh: $(Join-Path $Root 'backups')"
Write-Host "Kiem tra tai may chu: http://127.0.0.1:$Port/api/system/health"
Write-Host ""

$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } |
  Select-Object -ExpandProperty IPAddress -Unique
foreach ($ip in $addresses) {
  Write-Host "Truy cap tu may khac: http://${ip}:$Port" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Luu y: De dia chi khong thay doi, de nghi bo phan CNTT dat IP LAN tinh/Dat DHCP reservation cho may C10." -ForegroundColor Yellow
Write-Host "Khong mo cong nay tren mang Public/Internet khi chua duoc phe duyet bao mat." -ForegroundColor Yellow
