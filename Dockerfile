# ==============================================================================
# DjPaz - Universal Docker Container
# Lightweight, Portable, Multi-Platform (AMD64 & ARM64)
# ==============================================================================

FROM python:3.11-slim

# Install multimedia dependencies (FFmpeg, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY server.py .
COPY static/ ./static/

# Default environment
ENV PORT=4848
ENV HOST=0.0.0.0
ENV DJPAZ_MUSIC_DIR=/music

# Create music directory
RUN mkdir -p /music

EXPOSE 4848

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4848/ || exit 1

CMD ["python3", "server.py", "--port", "4848", "--host", "0.0.0.0", "--music-dir", "/music"]
