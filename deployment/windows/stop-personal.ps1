param(
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$BackupScript = Join-Path $Root "scripts\backup.js"

function Stop-ListenerNode {
  param([int]$Port)

  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Host "Cong $Port khong co tien trinh LISTENING."
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      if ($proc.ProcessName -ne "node") {
        Write-Warning "Cong $Port dang do tien trinh '$($proc.ProcessName)' (PID $processId) su dung. Khong tu dong dung tien trinh nay."
        continue
      }

      $parentId = $null
      try {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
        $parentId = [int]$cim.ParentProcessId
      } catch {}

      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Da dung Node.js tren cong $Port (PID $processId)." -ForegroundColor Green

      if ($parentId) {
        try {
          $parent = Get-Process -Id $parentId -ErrorAction Stop
          if ($parent.ProcessName -eq "cmd") {
            Stop-Process -Id $parentId -Force -ErrorAction SilentlyContinue
          }
        } catch {}
      }
    } catch {
      Write-Warning "Khong dung duoc tien trinh tren cong ${Port}: $($_.Exception.Message)"
    }
  }
}

Write-Host "=== QY4-TTBYT - TAT HE THONG AN TOAN ===" -ForegroundColor Cyan
Write-Host "Thu muc: $Root"

if (-not $SkipBackup) {
  $node = Get-Command node -ErrorAction Stop
  if (-not (Test-Path $BackupScript)) {
    throw "Khong tim thay scripts\backup.js. Khong tat he thong de tranh bo qua backup."
  }

  Write-Host "[1/3] Dang sao luu du lieu truoc khi tat..." -ForegroundColor Yellow
  Push-Location $Root
  try {
    & $node.Source $BackupScript
    if ($LASTEXITCODE -ne 0) {
      throw "Backup khong thanh cong. He thong chua bi tat."
    }
  } finally {
    Pop-Location
  }
  Write-Host "Backup hoan thanh." -ForegroundColor Green
} else {
  Write-Warning "Da bo qua backup theo yeu cau."
}

Write-Host "[2/3] Dang dung cong 5000 va 5050..." -ForegroundColor Yellow
Stop-ListenerNode -Port 5000
Stop-ListenerNode -Port 5050

Write-Host "[3/3] Dang dung ngrok..." -ForegroundColor Yellow
$ngrokProcesses = Get-Process ngrok -ErrorAction SilentlyContinue
foreach ($ngrok in $ngrokProcesses) {
  $parentId = $null
  try {
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($ngrok.Id)" -ErrorAction Stop
    $parentId = [int]$cim.ParentProcessId
  } catch {}

  try {
    Stop-Process -Id $ngrok.Id -Force -ErrorAction Stop
    Write-Host "Da dung ngrok (PID $($ngrok.Id))." -ForegroundColor Green
  } catch {
    Write-Warning "Khong dung duoc ngrok PID $($ngrok.Id): $($_.Exception.Message)"
  }

  if ($parentId) {
    try {
      $parent = Get-Process -Id $parentId -ErrorAction Stop
      if ($parent.ProcessName -eq "cmd") {
        Stop-Process -Id $parentId -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}
if (-not $ngrokProcesses) {
  Write-Host "ngrok khong chay."
}

Write-Host ""
Write-Host "Da tat QY4-TTBYT an toan." -ForegroundColor Green
