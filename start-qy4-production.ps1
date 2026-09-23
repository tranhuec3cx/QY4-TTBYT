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

$env:QY4_DEMO_SEED = "0"
$env:QY4_AUTH_REQUIRED = "1"
$env:QY4_ADMIN_USERNAME = $(if ($env:QY4_ADMIN_USERNAME) { $env:QY4_ADMIN_USERNAME } else { "admin" })
$env:QY4_SESSION_HOURS = $(if ($env:QY4_SESSION_HOURS) { $env:QY4_SESSION_HOURS } else { "12" })
$env:QY4_BACKUP_KEEP = $(if ($env:QY4_BACKUP_KEEP) { $env:QY4_BACKUP_KEEP } else { "30" })
$env:QY4_QR_RATE_LIMIT = $(if ($env:QY4_QR_RATE_LIMIT) { $env:QY4_QR_RATE_LIMIT } else { "20" })
$env:QY4_QR_RATE_WINDOW_MS = $(if ($env:QY4_QR_RATE_WINDOW_MS) { $env:QY4_QR_RATE_WINDOW_MS } else { "60000" })
$env:QY4_TIME_ZONE = $(if ($env:QY4_TIME_ZONE) { $env:QY4_TIME_ZONE } else { "Asia/Bangkok" })

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

if (-not (Test-Path "node_modules")) {
    Write-Host "Chua co node_modules - dang chay npm ci..." -ForegroundColor Yellow
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci khong thanh cong." }
}

Write-Host ""
Write-Host "Cau hinh:" -ForegroundColor Green
Write-Host "  Demo seed      : $env:QY4_DEMO_SEED"
Write-Host "  Xac thuc       : $env:QY4_AUTH_REQUIRED"
Write-Host "  Time zone      : $env:QY4_TIME_ZONE"
Write-Host "  Backup keep    : $env:QY4_BACKUP_KEEP"
Write-Host "  QR rate limit  : $env:QY4_QR_RATE_LIMIT / $env:QY4_QR_RATE_WINDOW_MS ms"
Write-Host ""
Write-Host "Sau khi server khoi dong:" -ForegroundColor Cyan
Write-Host "  1. Mo http://localhost:5000/login.html"
Write-Host "  2. Vao Cai dat -> He thong -> San sang trien khai"
Write-Host "  3. Xu ly het muc 'Can xu ly' truoc khi in QR hang loat"
Write-Host ""

npm start
