# ==============================================================================
# DjPaz - Windows PowerShell Launcher
# ==============================================================================

param (
    [int]$Port = 4848,
    [string]$HostIP = "0.0.0.0",
    [string]$MusicDir = ""
)

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🎧 Iniciando DjPaz Studio para Windows..." -ForegroundColor Green
Write-Host "🌐 URL Local: http://localhost:$Port" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[!] ERROR: Python no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "Instálalo desde: https://www.python.org/downloads/" -ForegroundColor White
    exit 1
}

$argsList = @("server.py", "--port", "$Port", "--host", "$HostIP")
if ($MusicDir -ne "") {
    $argsList += @("--music-dir", "$MusicDir")
}

& python $argsList
