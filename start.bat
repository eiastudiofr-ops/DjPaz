@echo off
REM ==============================================================================
REM DjPaz - Windows Batch Launcher
REM ==============================================================================

setlocal enabledelayedexpansion

set PORT=4848
if not "%~1"=="" set PORT=%~1

echo =================================================================
echo 🎧 Iniciando DjPaz Studio para Windows...
echo 🌐 URL: http://localhost:%PORT%
echo =================================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] ERROR: Python no esta instalado o no se encuentra en el PATH.
    echo Descargalo e instalalo desde: https://www.python.org/downloads/
    pause
    exit /b 1
)

python server.py --port %PORT% --host 0.0.0.0
pause
