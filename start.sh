#!/usr/bin/env bash
# ==============================================================================
# DjPaz - Fast Startup Launcher Script
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${1:-4848}"
HOST="${2:-0.0.0.0}"

echo "================================================================="
echo "🎧 Iniciando DjPaz Studio..."
echo "📍 Directorio: $DIR"
echo "🌐 URL Local:  http://localhost:$PORT"
echo "🌐 URL Red:    http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo "0.0.0.0"):$PORT"
echo "================================================================="

exec python3 server.py --port "$PORT" --host "$HOST"
