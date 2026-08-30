param(
  [Parameter(Mandatory = $true)]
  [string]$PublicBaseUrl,
  [int]$PublicPort = 5050
)

$ErrorActionPreference = "Stop"

function Require-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Hãy mở Windows PowerShell bằng Run as administrator rồi chạy lại setup-public-incident.ps1."
  }
}

Require-Administrator

$PublicBaseUrl = $PublicBaseUrl.Trim().TrimEnd('/')
if ($PublicBaseUrl -notmatch '^https://[A-Za-z0-9.-]+(?::\d+)?$') {
  throw "PublicBaseUrl phải là địa chỉ HTTPS hợp lệ, ví dụ https://ten-mien.ngrok-free.app"
}
if ($PublicPort -lt 1024 -or $PublicPort -gt 65535) {
  throw "PublicPort phải nằm trong khoảng 1024-65535."
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DatabasePath = Join-Path $Root "db\qy4_ttbyt.sqlite"
$RunScript = Join-Path $PSScriptRoot "run-public-incident.ps1"
$PowerShellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$GatewayTask = "QY4-TTBYT Public Incident Gateway"
$MainTask = "QY4-TTBYT Server"

if (-not (Test-Path $DatabasePath)) {
  throw "Không tìm thấy database triển khai tại $DatabasePath. Bộ cài đã dừng."
}

$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm -ErrorAction Stop

Write-Host "=== CAI DAT CONG BAO SU CO QR ===" -ForegroundColor Cyan
Write-Host "Ung dung quan tri van dung cong 5000 trong mang noi bo."
Write-Host "Cong cong khai chi bao su co: 127.0.0.1:$PublicPort"
Write-Host "Dia chi HTTPS: $PublicBaseUrl"
Write-Host ""

Write-Host "Cai dat/cap nhat thu vien Node.js..." -ForegroundColor Yellow
Push-Location $Root
try {
  & $npm.Source install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install không thành công." }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null

# Lưu cấu hình ở cấp máy để tác vụ SYSTEM nhận được sau khi Windows khởi động.
[Environment]::SetEnvironmentVariable("PUBLIC_INCIDENT_PORT", [string]$PublicPort, "Machine")
[Environment]::SetEnvironmentVariable("PUBLIC_INCIDENT_HOST", "127.0.0.1", "Machine")
[Environment]::SetEnvironmentVariable("PUBLIC_INCIDENT_BASE_URL", $PublicBaseUrl, "Machine")
$env:PUBLIC_INCIDENT_PORT = [string]$PublicPort
$env:PUBLIC_INCIDENT_HOST = "127.0.0.1"
$env:PUBLIC_INCIDENT_BASE_URL = $PublicBaseUrl

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""
$action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $actionArgs -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup

try { Stop-ScheduledTask -TaskName $GatewayTask -ErrorAction SilentlyContinue } catch {}
Register-ScheduledTask -TaskName $GatewayTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "QY4-TTBYT - cổng HTTPS/tunnel chỉ tiếp nhận báo sự cố từ QR" -Force | Out-Null
Start-ScheduledTask -TaskName $GatewayTask
Start-Sleep -Seconds 2

# Nếu ứng dụng nội bộ đã được cài dưới dạng Scheduled Task thì khởi động lại
# để màn hình tạo QR nhận PUBLIC_INCIDENT_BASE_URL mới.
if (Get-ScheduledTask -TaskName $MainTask -ErrorAction SilentlyContinue) {
  try { Stop-ScheduledTask -TaskName $MainTask -ErrorAction SilentlyContinue } catch {}
  Start-ScheduledTask -TaskName $MainTask
}

Write-Host ""
Write-Host "=== HOAN TAT ===" -ForegroundColor Green
Write-Host "Gateway bao su co: http://127.0.0.1:$PublicPort"
Write-Host "Health check: http://127.0.0.1:$PublicPort/health"
Write-Host "Public URL dung de tao QR: $PublicBaseUrl"
Write-Host ""
Write-Host "QUAN TRONG: Chi cau hinh ngrok/Cloudflare Tunnel vao 127.0.0.1:$PublicPort." -ForegroundColor Yellow
Write-Host "KHONG tunnel cong 5000 cua phan mem quan tri." -ForegroundColor Red
Write-Host "Khong can mo Windows Firewall cong $PublicPort vi gateway chi lang nghe localhost." -ForegroundColor Yellow
