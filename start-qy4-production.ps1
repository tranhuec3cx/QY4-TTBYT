param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " QY4-TTBYT 5.0.0 - CHAY CHINH THUC" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Chua tim thay Node.js trong PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Chua tim thay npm trong PATH."
}

# Khong cho khoi dong them mot server tren cung cong.
$port = 5000
try {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        throw "Cong $port dang duoc su dung. Hay dong ban QY4-TTBYT dang chay truoc khi cap nhat/khoi dong lai."
    }
} catch [System.Management.Automation.CommandNotFoundException] {
    # Windows cu co the khong co Get-NetTCPConnection; server van tu bao loi neu cong bi chiem.
}

$env:NODE_ENV = "production"
$env:QY4_DEMO_SEED = "0"
$env:QY4_AUTH_REQUIRED = "1"
$env:QY4_ALLOW_LEGACY_QR = "0"
$env:QY4_ADMIN_USERNAME = $(if ($env:QY4_ADMIN_USERNAME) { $env:QY4_ADMIN_USERNAME } else { "admin" })
$env:QY4_SESSION_HOURS = $(if ($env:QY4_SESSION_HOURS) { $env:QY4_SESSION_HOURS } else { "12" })
$env:QY4_AUTH_LOGIN_LIMIT = $(if ($env:QY4_AUTH_LOGIN_LIMIT) { $env:QY4_AUTH_LOGIN_LIMIT } else { "8" })
$env:QY4_AUTH_LOGIN_WINDOW_MS = $(if ($env:QY4_AUTH_LOGIN_WINDOW_MS) { $env:QY4_AUTH_LOGIN_WINDOW_MS } else { "900000" })
$env:QY4_BACKUP_KEEP = $(if ($env:QY4_BACKUP_KEEP) { $env:QY4_BACKUP_KEEP } else { "30" })
$env:QY4_QR_RATE_LIMIT = $(if ($env:QY4_QR_RATE_LIMIT) { $env:QY4_QR_RATE_LIMIT } else { "20" })
$env:QY4_QR_RATE_WINDOW_MS = $(if ($env:QY4_QR_RATE_WINDOW_MS) { $env:QY4_QR_RATE_WINDOW_MS } else { "60000" })
$env:QY4_TIME_ZONE = $(if ($env:QY4_TIME_ZONE) { $env:QY4_TIME_ZONE } else { "Asia/Bangkok" })

# Tao ban sao DB truoc khi server chay migration. Copy ca WAL/SHM neu ton tai.
$dbMain = Join-Path $PSScriptRoot "db\qy4_ttbyt.sqlite"
if (Test-Path $dbMain) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $preDir = Join-Path $PSScriptRoot "backups\prestart_$stamp"
    New-Item -ItemType Directory -Path $preDir -Force | Out-Null
    Get-ChildItem (Join-Path $PSScriptRoot "db") -Filter "qy4_ttbyt.sqlite*" -File -ErrorAction SilentlyContinue |
        Copy-Item -Destination $preDir -Force
    Write-Host "Da sao luu DB truoc cap nhat: $preDir" -ForegroundColor Green
}

if (-not $SkipInstall) {
    Write-Host ""
    Write-Host "Dang dong bo dependency theo package-lock (npm ci)..." -ForegroundColor Yellow
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci khong thanh cong." }
} elseif (-not (Test-Path "node_modules")) {
    throw "Da chon -SkipInstall nhung chua co node_modules."
}

if (-not $env:QY4_ADMIN_PASSWORD) {
    Write-Host ""
    Write-Host "Neu day la lan khoi dong dau tien co xac thuc, nhap mat khau Quan tri vien." -ForegroundColor Yellow
    Write-Host "Neu tai khoan Quan tri vien da co mat khau, co the nhan Enter de bo qua." -ForegroundColor DarkGray
    $secure = Read-Host "Mat khau Quan tri vien ban dau" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    if ($plain) {
        if ($plain.Length -lt 8) {
            throw "Mat khau phai co it nhat 8 ky tu."
        }
        $env:QY4_ADMIN_PASSWORD = $plain
    }
}

Write-Host ""
Write-Host "Cau hinh:" -ForegroundColor Green
Write-Host "  Node env       : $env:NODE_ENV"
Write-Host "  Demo seed      : $env:QY4_DEMO_SEED"
Write-Host "  Xac thuc       : $env:QY4_AUTH_REQUIRED"
Write-Host "  Legacy QR      : $env:QY4_ALLOW_LEGACY_QR"
Write-Host "  Time zone      : $env:QY4_TIME_ZONE"
Write-Host "  Backup keep    : $env:QY4_BACKUP_KEEP"
Write-Host "  QR rate limit  : $env:QY4_QR_RATE_LIMIT / $env:QY4_QR_RATE_WINDOW_MS ms"
if ($env:QY4_BACKUP_MIRROR_DIR) {
    Write-Host "  Backup mirror  : $env:QY4_BACKUP_MIRROR_DIR"
} else {
    Write-Host "  Backup mirror  : CHUA CAU HINH (nen dat sang o dia/thu muc khac)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Sau khi server khoi dong:" -ForegroundColor Cyan
Write-Host "  1. Mo http://localhost:5000/login.html"
Write-Host "  2. Vao Cai dat -> He thong -> San sang trien khai"
Write-Host "  3. Xu ly het muc 'Can xu ly' truoc khi dung du lieu that/in QR hang loat"
Write-Host "  4. Tren dien thoai, dung IP LAN duoc server in ra - KHONG dung localhost"
Write-Host ""

npm start
