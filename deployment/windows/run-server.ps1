$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "qy4-ttbyt-server.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$node = Get-Command node -ErrorAction Stop
if (-not $env:PORT) { $env:PORT = "5000" }

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] Khoi dong QY4-TTBYT tai cong $env:PORT" | Out-File -FilePath $LogFile -Append -Encoding utf8

Set-Location $Root
& $node.Source (Join-Path $Root "bootstrap.js") *>> $LogFile
