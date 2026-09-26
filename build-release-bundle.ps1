param(
    [string]$Version = "5.0.0-RC",
    [string]$OutputDir = ""
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
$forbiddenSegments = @("node_modules",".git","backups/prestart_")
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
    "# Source bundle intentionally excludes runtime database/uploads/backups/secrets/node_modules.",
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
Write-Host "[LUU Y] Goi nay KHONG chua database/uploads/backups dang van hanh." -ForegroundColor Yellow
Write-Host "[LUU Y] Khi nang cap may that, sao luu du lieu va dung launcher/preflight theo README." -ForegroundColor Yellow

exit 0
