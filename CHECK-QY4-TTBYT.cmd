@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\windows\check-personal.ps1"
echo.
pause
