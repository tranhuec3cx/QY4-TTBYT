$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DatabasePath = Join-Path $Root "db\qy4_ttbyt.sqlite"
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "qy4-public-incident.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path $DatabasePath)) {
  throw "Không tìm thấy database triển khai tại $DatabasePath. Gateway công khai không được khởi động."
}

$node = Get-Command node -ErrorAction Stop
if (-not $env:PUBLIC_INCIDENT_PORT) { $env:PUBLIC_INCIDENT_PORT = "5050" }
if (-not $env:PUBLIC_INCIDENT_HOST) { $env:PUBLIC_INCIDENT_HOST = "127.0.0.1" }

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] Khoi dong cong bao su co QR tai $env:PUBLIC_INCIDENT_HOST`:$env:PUBLIC_INCIDENT_PORT" | Out-File -FilePath $LogFile -Append -Encoding utf8

Set-Location $Root
& $node.Source (Join-Path $Root "public-incident-gateway.js") *>> $LogFile
