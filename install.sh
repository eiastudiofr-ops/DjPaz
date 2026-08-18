#!/usr/bin/env bash
# ==============================================================================
# DjPaz - One-Click Automated Installer & Environment Setup Script
# Compatible with Ubuntu, Debian, Fedora, Arch Linux, and macOS
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "================================================================="
echo "🎧 Instalador Automático de DjPaz"
echo "================================================================="

# 1. Detect Package Manager and Install Dependencies
if command -v apt-get >/dev/null 2>&1; then
    echo "[*] Detectado gestor de paquetes APT (Ubuntu/Debian)..."
    echo "[*] Instalando dependencias del sistema..."
    sudo apt-get update -qq
    sudo apt-get install -y python3 python3-pip ffmpeg pipewire wireplumber alsa-utils curl
elif command -v dnf >/dev/null 2>&1; then
    echo "[*] Detectado gestor de paquetes DNF (Fedora/RHEL)..."
    sudo dnf install -y python3 python3-pip ffmpeg pipewire wireplumber alsa-utils curl
elif command -v pacman >/dev/null 2>&1; then
    echo "[*] Detectado gestor de paquetes PACMAN (Arch/Manjaro)..."
    sudo pacman -Sy --noconfirm python python-pip ffmpeg pipewire pipewire-pulse wireplumber alsa-utils yt-dlp curl
elif command -v brew >/dev/null 2>&1; then
    echo "[*] Detectado Homebrew (macOS)..."
    brew install python ffmpeg yt-dlp
else
    echo "[!] No se detectó un gestor de paquetes automático. Asegúrate de tener Python 3, ffmpeg y yt-dlp instalados."
fi

# 2. Install Python Packages
echo "[*] Instalando dependencias de Python..."
if [ -f "requirements.txt" ]; then
    pip3 install -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -r requirements.txt
fi

# 3. Configure systemd User Service (Linux)
if command -v systemctl >/dev/null 2>&1; then
    echo "[*] Configurando servicio systemd de usuario..."
    mkdir -p ~/.config/systemd/user
    
    # Generate tailored service file
    cat <<EOF > ~/.config/systemd/user/djpaz.service
[Unit]
Description=DjPaz - Professional Web DJ Studio & Hardware Mixer Server
Documentation=https://github.com/eiastudiofr-ops/DjPaz
After=network.target sound.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$(which python3) $DIR/server.py --port 4848 --host 0.0.0.0
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable djpaz.service
    systemctl --user restart djpaz.service
    echo "[✓] Servicio djpaz.service habilitado e iniciado."
fi

# 4. Make scripts executable
chmod +x "$DIR/start.sh" "$DIR/install.sh"

echo "================================================================="
echo "🎉 ¡Instalación de DjPaz completada con éxito!"
echo "📍 Abre tu navegador en: http://localhost:4848"
echo "🎛️ Conecta tu controladora Hercules DJControl Inpulse 200 MK2 por USB"
echo "================================================================="
