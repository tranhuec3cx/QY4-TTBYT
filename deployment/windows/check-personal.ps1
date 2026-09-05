$ErrorActionPreference = "SilentlyContinue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DbPath = Join-Path $Root "db\qy4_ttbyt.sqlite"
$BackupRoot = Join-Path $Root "backups"

function Test-Port {
  param([int]$Port)
  $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return [bool]$c
}

function Test-HttpJson {
  param([string]$Url)
  try {
    $r = Invoke-RestMethod -Uri $Url -TimeoutSec 3
    return @{ ok = $true; value = $r }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

Write-Host "=== QY4-TTBYT - KIEM TRA NHANH ===" -ForegroundColor Cyan
Write-Host "Thoi gian: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Host "Thu muc : $Root"
Write-Host ""

if (Test-Path $DbPath) {
  $db = Get-Item $DbPath
  Write-Host "[OK] Database: $($db.Length) bytes - cap nhat $($db.LastWriteTime.ToString('dd/MM/yyyy HH:mm:ss'))" -ForegroundColor Green
} else {
  Write-Host "[LOI] Khong tim thay database db\qy4_ttbyt.sqlite" -ForegroundColor Red
}

$port5000 = Test-Port 5000
$port5050 = Test-Port 5050
if ($port5000) { Write-Host "[OK] Cong 5000 dang LISTENING" -ForegroundColor Green } else { Write-Host "[LOI] Cong 5000 chua chay" -ForegroundColor Red }
if ($port5050) { Write-Host "[OK] Cong 5050 dang LISTENING" -ForegroundColor Green } else { Write-Host "[LOI] Cong 5050 chua chay" -ForegroundColor Red }

if ($port5000) {
  $health = Test-HttpJson "http://127.0.0.1:5000/api/system/health"
  if ($health.ok) {
    Write-Host "[OK] API quan tri /api/system/health phan hoi" -ForegroundColor Green
  } else {
    Write-Host "[CANH BAO] Cong 5000 co mo nhung health API khong phan hoi: $($health.error)" -ForegroundColor Yellow
  }
}

if ($port5050) {
  $incidentHealth = Test-HttpJson "http://127.0.0.1:5050/health"
  if ($incidentHealth.ok) {
    Write-Host "[OK] Gateway bao su co /health phan hoi" -ForegroundColor Green
  } else {
    Write-Host "[CANH BAO] Cong 5050 co mo nhung /health khong phan hoi: $($incidentHealth.error)" -ForegroundColor Yellow
  }
}

$ngrok = Get-Process ngrok -ErrorAction SilentlyContinue
if ($ngrok) {
  Write-Host "[OK] ngrok dang chay (PID: $($ngrok.Id -join ', '))" -ForegroundColor Green
} else {
  Write-Host "[CANH BAO] ngrok chua chay - QR Internet se khong truy cap duoc" -ForegroundColor Yellow
}

if (Test-Path $BackupRoot) {
  $lastBackup = Get-ChildItem $BackupRoot -Directory -Filter "QY4-TTBYT_*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($lastBackup) {
    $age = (Get-Date) - $lastBackup.LastWriteTime
    $message = "Backup gan nhat: $($lastBackup.Name) - $($lastBackup.LastWriteTime.ToString('dd/MM/yyyy HH:mm:ss'))"
    if ($age.TotalHours -le 24) {
      Write-Host "[OK] $message" -ForegroundColor Green
    } else {
      Write-Host "[CANH BAO] $message (qua 24 gio)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "[CANH BAO] Chua co ban backup nao" -ForegroundColor Yellow
  }
} else {
  Write-Host "[CANH BAO] Chua co thu muc backups" -ForegroundColor Yellow
}

Write-Host ""
if ($port5000 -and $port5050 -and $ngrok) {
  Write-Host "KET LUAN: HE THONG DANG HOAT DONG DAY DU." -ForegroundColor Green
} elseif ($port5000 -and $port5050) {
  Write-Host "KET LUAN: NOI BO HOAT DONG; QR INTERNET CHUA SAN SANG." -ForegroundColor Yellow
} else {
  Write-Host "KET LUAN: HE THONG CHUA HOAT DONG DAY DU." -ForegroundColor Red
}
