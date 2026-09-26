param(
    [string]$Version = "5.0.0-RC",
    [string]$OutputDir = "",
    [switch]$IncludeDependencies
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $OutputDir) {
    $OutputDir = Join-Path $PSScriptRoot "dist"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$bundleName = "QY4-TTBYT-$Version"
$stage = Join-Path $OutputDir $bundleName
$zip = Join-Path $OutputDir "$bundleName.zip"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " QY4-TTBYT - BUILD RELEASE BUNDLE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$requiredFiles = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "README.md",
    "CHECKLIST-TEST-THUC-TE.md",
    "start-qy4-production.cmd",
    "start-qy4-production.ps1",
    "verify-backup.cmd",
    "audit-migration.cmd",
    "final-release-gate.cmd"
)
$requiredDirs = @("public","scripts")

foreach ($f in $requiredFiles) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $f) -PathType Leaf)) {
        throw "Thieu file bat buoc: $f"
    }
}
foreach ($d in $requiredDirs) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $d) -PathType Container)) {
        throw "Thieu thu muc bat buoc: $d"
    }
}

if ($IncludeDependencies) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Goi offline can Node.js trong PATH de xac minh dependency."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "Goi offline can npm trong PATH de xac minh dependency."
    }
    if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules") -PathType Container)) {
        throw "Chua co node_modules. Hay chay start-qy4-production.cmd/npm ci tren may Windows dich truoc khi build goi offline."
    }
    npm ls --depth=0 --silent *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "node_modules khong khop package.json/package-lock.json; khong dong goi offline."
    }
    node -e "require('better-sqlite3'); require('express'); require('multer'); require('exceljs'); require('qrcode-generator'); console.log('runtime dependencies ok')" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency runtime khong nap duoc tren may build; khong dong goi offline."
    }
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($f in $requiredFiles) {
    Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $stage $f) -Force
}
foreach ($d in $requiredDirs) {
    Copy-Item (Join-Path $PSScriptRoot $d) (Join-Path $stage $d) -Recurse -Force
}
if ($IncludeDependencies) {
    Write-Host "Dang dong kem node_modules da duoc xac minh tren may build..." -ForegroundColor Cyan
    Copy-Item (Join-Path $PSScriptRoot "node_modules") (Join-Path $stage "node_modules") -Recurse -Force
}

# Runtime data folders are intentionally not packaged.
# server.js creates db/uploads paths on first start; backups are created on demand.

$forbiddenPatterns = @(
    "^\.env$",
    "^\.env\.",
    "\.(sqlite|sqlite3|db)$",
    "-wal$",
    "-shm$",
    "\.log$"
)
$forbiddenSegments = @(".git","backups/prestart_")
if (-not $IncludeDependencies) {
    $forbiddenSegments += "node_modules"
}
$bad = @()
Get-ChildItem $stage -Recurse -Force -File | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length).TrimStart([char[]]"\/").Replace("\","/")
    foreach ($p in $forbiddenPatterns) {
        if ($rel -match $p) { $bad += $rel; break }
    }
    foreach ($seg in $forbiddenSegments) {
        if ($rel -like "*$seg*") { $bad += $rel; break }
    }
}
if ($bad.Count -gt 0) {
    throw "Release bundle chua file runtime/nhay cam: $((($bad | Sort-Object -Unique)) -join ', ')"
}

$manifestPath = Join-Path $stage "RELEASE-MANIFEST-SHA256.txt"
$manifestLines = @(
    "# QY4-TTBYT $Version",
    "# Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "# Build OS: $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)",
    "# Build architecture: $([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)",
    "# Node: $(if (Get-Command node -ErrorAction SilentlyContinue) { (node -v).Trim() } else { 'not-available' })",
    $(if ($IncludeDependencies) {
        "# Offline Windows bundle includes verified node_modules from the build machine; runtime database/uploads/backups/secrets remain excluded."
      } else {
        "# Source bundle intentionally excludes runtime database/uploads/backups/secrets/node_modules."
      }),
    ""
)
Get-ChildItem $stage -Recurse -File |
    Where-Object { $_.FullName -ne $manifestPath } |
    Sort-Object FullName |
    ForEach-Object {
        $rel = $_.FullName.Substring($stage.Length).TrimStart([char[]]"\/").Replace("\","/")
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifestLines += "$hash  $rel"
    }
Set-Content -Path $manifestPath -Value $manifestLines -Encoding UTF8

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal -Force

$zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item $zip).Length
Write-Host "[DAT] Da tao: $zip" -ForegroundColor Green
Write-Host "[DAT] SHA256 : $zipHash" -ForegroundColor Green
Write-Host "[DAT] Kich thuoc: $size byte" -ForegroundColor Green
if ($IncludeDependencies) {
    Write-Host "[DAT] Goi OFFLINE da kem node_modules duoc xac minh tren may build." -ForegroundColor Green
    Write-Host "[LUU Y] Chi dung goi offline nay cho cung he dieu hanh/kien truc voi may build; voi BVQY4 nen build tren Windows x64 dich." -ForegroundColor Yellow
} else {
    Write-Host "[LUU Y] Goi source khong kem node_modules; may dich can npm ci hoac cache dependency." -ForegroundColor Yellow
}
Write-Host "[LUU Y] Goi nay KHONG chua database/uploads/backups dang van hanh." -ForegroundColor Yellow
Write-Host "[LUU Y] Khi nang cap may that, sao luu du lieu va dung launcher/preflight theo README." -ForegroundColor Yellow

exit 0
