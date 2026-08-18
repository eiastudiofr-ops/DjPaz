@echo off
REM ==============================================================================
REM DjPaz - 1-Click Automated Installer for Windows
REM ==============================================================================

setlocal enabledelayedexpansion
title Instalador DjPaz Studio

echo =================================================================
echo 🎧 Instalador Automatizado de DjPaz Studio (Windows)
echo =================================================================

REM 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] ERROR: Python no esta instalado o no se encuentra en el PATH.
    echo Descarga e instala Python 3 desde: https://www.python.org/downloads/
    echo (Asegurate de marcar "Add Python to PATH" durante la instalacion)
    pause
    exit /b 1
)
echo [V] Python detectado correctamente.

REM 2. Install requirements
echo [*] Instalando dependencias de Python (yt-dlp)...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] Advertencia al instalar requisitos con pip.
)

REM 3. Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] AVISO: FFmpeg no se detecto en el PATH de Windows.
    echo Para habilitar la descarga de audio en MP3 320k, descarga FFmpeg de:
    echo https://www.gyan.dev/ffmpeg/builds/ y anade su carpeta bin/ al PATH.
) else (
    echo [V] FFmpeg detectado correctamente.
)

echo =================================================================
echo 🎉 ¡Instalacion completada!
echo Puedes iniciar DjPaz ejecutando start.bat o start.ps1
echo =================================================================
pause
