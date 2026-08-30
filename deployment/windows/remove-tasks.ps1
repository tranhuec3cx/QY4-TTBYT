param([int]$Port = 5000)

$ErrorActionPreference = "SilentlyContinue"
$ServerTask = "QY4-TTBYT Server"
$BackupTask = "QY4-TTBYT Backup"
$FirewallName = "QY4-TTBYT LAN TCP $Port"

try { Stop-ScheduledTask -TaskName $ServerTask } catch {}
try { Unregister-ScheduledTask -TaskName $ServerTask -Confirm:$false } catch {}
try { Unregister-ScheduledTask -TaskName $BackupTask -Confirm:$false } catch {}
try { Remove-NetFirewallRule -DisplayName $FirewallName } catch {}

Write-Host "Da go cac Scheduled Task va firewall rule cua QY4-TTBYT." -ForegroundColor Green
Write-Host "Du lieu, database, uploads va backups KHONG bi xoa." -ForegroundColor Yellow
