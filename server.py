#!/usr/bin/env python3
# ==============================================================================
# DjPaz Studio - Universal Professional Web DJ Backend & Audio Engine
# Universal Multiplatform Server (Linux, Windows, macOS, Docker)
# Cross-Platform Hardware I/O Detection & Universal File Engine
# ==============================================================================

import os
import sys
import json
import time
import shutil
import urllib.parse
import subprocess
import threading
import argparse
import platform
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# ------------------------------------------------------------------------------
# System Detection & Path Resolvers
# ------------------------------------------------------------------------------

def get_default_music_dir() -> Path:
    """Return default music directory based on OS and environment."""
    env_dir = os.getenv("DJPAZ_MUSIC_DIR")
    if env_dir:
        p = Path(env_dir).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    home = Path.home()
    if sys.platform == "win32":
        candidates = [home / "Music", home / "Música", home / "Downloads"]
    elif sys.platform == "darwin":
        candidates = [home / "Music", home / "Downloads"]
    else:
        candidates = [home / "Música", home / "Music", home / "Downloads"]

    for c in candidates:
        if c.exists():
            return c

    default_path = home / "Music"
    default_path.mkdir(parents=True, exist_ok=True)
    return default_path


def get_deno_path() -> str:
    """Dynamically locate deno executable across platforms without hardcoding."""
    which_deno = shutil.which("deno")
    if which_deno:
        return which_deno

    home = Path.home()
    if sys.platform == "win32":
        candidates = [
            home / ".deno" / "bin" / "deno.exe",
            Path(os.getenv("LOCALAPPDATA", "")) / "deno" / "deno.exe",
            Path(os.getenv("PROGRAMFILES", "")) / "deno" / "deno.exe"
        ]
    else:
        candidates = [
            home / ".deno" / "bin" / "deno",
            Path("/usr/local/bin/deno"),
            Path("/opt/homebrew/bin/deno"),
            Path("/usr/bin/deno")
        ]

    for c in candidates:
        if c.exists() and os.access(c, os.X_OK):
            return str(c)

    return "deno"


def open_file_or_folder(target_path: Path):
    """Open folder or file using the native OS file manager."""
    try:
        if sys.platform == "win32":
            os.startfile(str(target_path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target_path)])
        else:
            subprocess.Popen(["xdg-open", str(target_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception as e:
        print(f"[!] Error opening folder: {e}")
        return False


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Verify target_path is within base_dir to prevent path traversal."""
    try:
        return target_path.resolve().is_relative_to(base_dir.resolve())
    except (ValueError, AttributeError):
        try:
            return str(target_path.resolve()).startswith(str(base_dir.resolve()) + os.sep)
        except Exception:
            return False


# Global Configuration
STATIC_DIR = Path(__file__).parent.resolve() / "static"
MUSIC_DIR = get_default_music_dir()
DENO_PATH = get_deno_path()
PORT = int(os.getenv("PORT", "4848"))
HOST = os.getenv("HOST", "0.0.0.0")

current_selected_sink = "default"

# Download Queue & Worker State
download_queue = []
download_tasks = []
tasks_lock = threading.Lock()
queue_event = threading.Event()


# ------------------------------------------------------------------------------
# Universal System Audio Device Detection
# ------------------------------------------------------------------------------

def get_universal_system_audio_devices():
    """Enumerate physical and virtual audio inputs and outputs across all OSes."""
    sinks = []
    sources = []

    # 1. Linux PipeWire / WirePlumber
    if shutil.which("wpctl"):
        try:
            res = subprocess.run(["wpctl", "status"], capture_output=True, text=True, timeout=2, encoding="utf-8", errors="replace")
            lines = res.stdout.splitlines()
            section = None
            for line in lines:
                if "Sinks:" in line:
                    section = "sinks"
                    continue
                elif "Sources:" in line:
                    section = "sources"
                    continue
                elif "Streams:" in line or "Sink endpoints:" in line or "Source endpoints:" in line or "Settings" in line:
                    section = None
                    continue

                if section in ("sinks", "sources"):
                    line_str = line.strip().replace("│", "").strip()
                    m = re.search(r"(\*?)\s*(\d+)\.\s+(.+?)\s+\[", line_str)
                    if m:
                        is_default = bool(m.group(1))
                        node_id = m.group(2)
                        name = m.group(3).strip()

                        icon = "🔊" if section == "sinks" else "🎤"
                        n_low = name.lower()
                        if "headphone" in n_low or "auricular" in n_low or "cascos" in n_low or "jack" in n_low:
                            icon = "🎧"
                        elif "inpulse" in n_low or "hercules" in n_low or "ddj" in n_low or "traktor" in n_low or "dj" in n_low:
                            icon = "🎛️"
                        elif "built-in" in n_low or "altavoces" in n_low or "speaker" in n_low:
                            icon = "💻"

                        dev_obj = {
                            "id": node_id,
                            "name": name,
                            "is_default": is_default,
                            "icon": icon,
                            "type": section
                        }
                        if section == "sinks":
                            sinks.append(dev_obj)
                        else:
                            sources.append(dev_obj)
        except Exception:
            pass

    # 2. Linux ALSA Fallback
    if not sinks and shutil.which("aplay"):
        try:
            res = subprocess.run(["aplay", "-l"], capture_output=True, text=True, timeout=2, encoding="utf-8", errors="replace")
            for line in res.stdout.splitlines():
                if line.startswith("card"):
                    parts = line.split(":")
                    if len(parts) >= 2:
                        dev_name = parts[1].split("[")[0].strip()
                        card_num = parts[0].replace("card", "").strip()
                        sinks.append({
                            "id": f"hw:{card_num},0",
                            "name": dev_name,
                            "is_default": len(sinks) == 0,
                            "icon": "🎛️" if "dj" in dev_name.lower() or "hercules" in dev_name.lower() else "🔊",
                            "type": "sinks"
                        })
        except Exception:
            pass

    # 3. Windows Audio Devices Query (via PowerShell / WMI)
    if sys.platform == "win32" and not sinks:
        try:
            ps_cmd = 'Get-CimInstance Win32_SoundDevice | Select-Object -Property Name,Status | ConvertTo-Json'
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=3, encoding="utf-8", errors="replace")
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                items = data if isinstance(data, list) else [data]
                for idx, item in enumerate(items):
                    name = item.get("Name", f"Audio Device {idx+1}")
                    n_low = name.lower()
                    icon = "🎛️" if ("dj" in n_low or "hercules" in n_low or "pioneer" in n_low) else ("🎧" if "headphone" in n_low else "🔊")
                    sinks.append({
                        "id": f"win_{idx}",
                        "name": name,
                        "is_default": idx == 0,
                        "icon": icon,
                        "type": "sinks"
                    })
        except Exception:
            pass

    # 4. macOS Audio Devices Query (CoreAudio)
    if sys.platform == "darwin" and not sinks:
        try:
            res = subprocess.run(["system_profiler", "SPAudioDataType", "-json"], capture_output=True, text=True, timeout=3, encoding="utf-8", errors="replace")
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                audio_items = data.get("SPAudioDataType", [])
                for idx, item in enumerate(audio_items):
                    name = item.get("_name", f"CoreAudio Device {idx+1}")
                    sinks.append({
                        "id": f"mac_{idx}",
                        "name": name,
                        "is_default": idx == 0,
                        "icon": "🔊",
                        "type": "sinks"
                    })
        except Exception:
            pass

    # Universal Web Audio Direct Fallback
    if not sinks:
        sinks = [
            {"id": "default", "name": "Dispositivo de Audio Principal del Sistema", "is_default": True, "icon": "🔊", "type": "sinks"},
            {"id": "headphones", "name": "Salida de Auriculares / CUE (Secundario)", "is_default": False, "icon": "🎧", "type": "sinks"},
            {"id": "dj_interface", "name": "Controladora / Interfaz DJ Multicanal", "is_default": False, "icon": "🎛️", "type": "sinks"}
        ]
    if not sources:
        sources = [
            {"id": "default_mic", "name": "Micrófono del Sistema (Live Talkover)", "is_default": True, "icon": "🎤", "type": "sources"}
        ]

    return sinks, sources


def set_system_sink_by_device_id(device_id):
    """Set system audio sink via wpctl when PipeWire is present."""
    global current_selected_sink
    current_selected_sink = str(device_id)

    if not shutil.which("wpctl"):
        return True

    if str(device_id).isdigit():
        try:
            res = subprocess.run(["wpctl", "set-default", str(device_id)], capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                return True
        except Exception:
            pass
    return False


# ------------------------------------------------------------------------------
# Background YouTube Downloader Worker
# ------------------------------------------------------------------------------

def background_worker():
    global download_queue
    while True:
        task = None
        with tasks_lock:
            if download_queue:
                task = download_queue.pop(0)

        if not task:
            queue_event.wait(timeout=2)
            queue_event.clear()
            continue

        task_id = task["id"]
        query = task["query"]
        task_title = task.get("title", query)

        with tasks_lock:
            task["status"] = "downloading"
            task["progress"] = 5

        MUSIC_DIR.mkdir(parents=True, exist_ok=True)
        output_template = str(MUSIC_DIR / "%(title)s.%(ext)s")

        cmd = [
            sys.executable, "-m", "yt_dlp",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "320k",
            "--output", output_template,
            "--no-playlist",
            "--ignore-errors",
            "--no-warnings"
        ]

        if DENO_PATH and (shutil.which(DENO_PATH) or Path(DENO_PATH).exists()):
            cmd.extend(["--extractor-args", f"youtube:player-client=web,default;javascript_runtime={DENO_PATH}"])

        is_direct_url = query.startswith("http://") or query.startswith("https://")
        if is_direct_url:
            cmd.append(query)
        else:
            cmd.append(f"ytsearch1:{query}")

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace"
            )

            for line in proc.stdout:
                line_str = line.strip()
                if "[download]" in line_str and "%" in line_str:
                    try:
                        pct_match = re.search(r"(\d+\.?\d*)%", line_str)
                        if pct_match:
                            pct = float(pct_match.group(1))
                            with tasks_lock:
                                task["progress"] = min(95, int(pct * 0.9))
                    except Exception:
                        pass

            proc.wait()

            with tasks_lock:
                if proc.returncode == 0:
                    task["status"] = "completed"
                    task["progress"] = 100
                else:
                    task["status"] = "failed"
                    task["progress"] = 0
        except Exception as e:
            with tasks_lock:
                task["status"] = "failed"
                task["progress"] = 0
                task["error"] = str(e)


# ------------------------------------------------------------------------------
# HTTP Request Handler & REST API
# ------------------------------------------------------------------------------

class DJRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.end_headers()

    def serve_audio_file(self, file_path: Path):
        """Serve audio with full HTTP 206 Range request support for seeking."""
        try:
            file_size = file_path.stat().st_size
            ext = file_path.suffix.lower()
            mime_map = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".wav": "audio/wav",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac",
                ".ogg": "audio/ogg",
                ".opus": "audio/opus",
                ".aiff": "audio/aiff",
                ".aif": "audio/aiff",
                ".wma": "audio/x-ms-wma",
                ".webm": "audio/webm"
            }
            mime = mime_map.get(ext, "audio/mpeg")

            range_header = self.headers.get("Range")
            if range_header and range_header.startswith("bytes="):
                ranges = range_header.replace("bytes=", "").split("-")
                start = int(ranges[0]) if ranges[0] else 0
                end = int(ranges[1]) if ranges[1] else file_size - 1
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                with open(file_path, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
            else:
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                with open(file_path, "rb") as f:
                    shutil.copyfileobj(f, self.wfile)
        except Exception:
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # API: Search YouTube
        if path == "/api/search":
            query = params.get("q", [""])[0].strip()
            if not query:
                self.send_json({"results": []})
                return

            results = []
            cmd = [
                sys.executable, "-m", "yt_dlp",
                f"ytsearch10:{query}",
                "--dump-json",
                "--no-playlist",
                "--ignore-errors",
                "--no-warnings"
            ]

            if DENO_PATH and (shutil.which(DENO_PATH) or Path(DENO_PATH).exists()):
                cmd.extend(["--extractor-args", f"youtube:player-client=web,default;javascript_runtime={DENO_PATH}"])

            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
                for line in proc.stdout:
                    try:
                        data = json.loads(line.strip())
                        duration_sec = data.get("duration", 0) or 0
                        m = int(duration_sec // 60)
                        s = int(duration_sec % 60)
                        results.append({
                            "id": data.get("id"),
                            "title": data.get("title"),
                            "uploader": data.get("uploader") or data.get("channel") or "",
                            "duration": duration_sec,
                            "duration_string": f"{m:02d}:{s:02d}",
                            "thumbnail": data.get("thumbnail") or "",
                            "url": data.get("webpage_url") or f"https://www.youtube.com/watch?v={data.get('id')}"
                        })
                    except Exception:
                        continue
            except Exception as e:
                print(f"[!] YouTube search error: {e}")

            self.send_json({"results": results})
            return

        # API: Universal Music Library Listing (All Formats & Folders)
        if path == "/api/library":
            tracks = []
            valid_exts = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac", ".opus", ".wma", ".aiff", ".aif", ".webm"}
            if MUSIC_DIR.exists():
                for p in sorted(MUSIC_DIR.rglob("*"), key=lambda f: f.stat().st_mtime if f.is_file() else 0, reverse=True):
                    if p.is_file() and p.suffix.lower() in valid_exts:
                        try:
                            stat = p.stat()
                            rel_path = str(p.relative_to(MUSIC_DIR))
                            folder = p.parent.name if p.parent != MUSIC_DIR else "Biblioteca Principal"
                            tracks.append({
                                "name": p.name,
                                "stem": p.stem,
                                "rel_path": rel_path,
                                "folder": folder,
                                "ext": p.suffix.lower().replace(".", "").upper(),
                                "size_bytes": stat.st_size,
                                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                                "modified": int(stat.st_mtime),
                                "modified_str": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime)),
                            })
                        except Exception:
                            continue

            total_size_mb = sum(t["size_mb"] for t in tracks)
            self.send_json({
                "tracks": tracks,
                "count": len(tracks),
                "total_size_mb": round(total_size_mb, 1),
                "music_dir": str(MUSIC_DIR),
                "supported_formats": sorted(list(valid_exts))
            })
            return

        # API: List Active Download Queue
        if path == "/api/queue":
            with tasks_lock:
                tasks_copy = list(reversed(download_tasks[-50:]))
            self.send_json({"tasks": tasks_copy})
            return

        # API: Stream Local Audio
        if path == "/api/audio":
            filename = params.get("file", [""])[0]
            if not filename:
                self.send_error(400, "Missing filename")
                return

            file_path = (MUSIC_DIR / filename).resolve()
            if not is_safe_path(MUSIC_DIR, file_path) or not file_path.exists():
                self.send_error(404, "File not found")
                return

            self.serve_audio_file(file_path)
            return

        # API: Audio Config / Hardware Devices
        if path == "/api/audio-config":
            sinks, sources = get_universal_system_audio_devices()
            self.send_json({
                "outputs": sinks,
                "inputs": sources,
                "platform": sys.platform,
                "music_dir": str(MUSIC_DIR)
            })
            return

        # Serve static frontend files
        if path == "/" or path == "/index.html":
            target_file = STATIC_DIR / "index.html"
            content_type = "text/html; charset=utf-8"
        else:
            rel_path = path.lstrip("/")
            target_file = (STATIC_DIR / rel_path).resolve()
            if not is_safe_path(STATIC_DIR, target_file) or not target_file.exists():
                self.send_error(404, "Not Found")
                return

            suffix = target_file.suffix.lower()
            content_types = {
                ".html": "text/html; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".js": "application/javascript; charset=utf-8",
                ".json": "application/json",
                ".png": "image/png",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".woff2": "font/woff2",
                ".woff": "font/woff",
                ".ttf": "font/ttf"
            }
            content_type = content_types.get(suffix, "application/octet-stream")

        try:
            with open(target_file, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception:
            self.send_error(500, "Internal Server Error")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Enqueue YouTube Download
        if path == "/api/download":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8")
            try:
                data = json.loads(body)
                query = data.get("query", "").strip()
                title = data.get("title", query)
                if not query:
                    self.send_json({"error": "Empty query"}, 400)
                    return

                task_id = f"task_{int(time.time() * 1000)}"
                task = {
                    "id": task_id,
                    "query": query,
                    "title": title,
                    "status": "pending",
                    "progress": 0,
                    "created_at": time.time()
                }

                with tasks_lock:
                    download_queue.append(task)
                    download_tasks.append(task)
                queue_event.set()

                self.send_json({"status": "enqueued", "task_id": task_id})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        # API: Change Music Library Directory
        if path == "/api/set-music-dir":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8")
            try:
                global MUSIC_DIR
                data = json.loads(body)
                new_dir_str = data.get("music_dir", "").strip()
                if new_dir_str:
                    new_path = Path(new_dir_str).expanduser().resolve()
                    new_path.mkdir(parents=True, exist_ok=True)
                    MUSIC_DIR = new_path
                    self.send_json({"status": "ok", "music_dir": str(MUSIC_DIR)})
                    return
                self.send_json({"error": "Ruta inválida"}, 400)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        # API: Set System Audio Route
        if path == "/api/set-audio-route":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8")
            try:
                data = json.loads(body)
                device_id = data.get("master_id") or data.get("device_id") or "default"
                success = set_system_sink_by_device_id(device_id)
                self.send_json({"status": "ok" if success else "fallback", "device_id": device_id})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        # API: Open Music Folder in Native File Explorer
        if path == "/api/open-folder":
            success = open_file_or_folder(MUSIC_DIR)
            self.send_json({"status": "ok" if success else "error", "folder": str(MUSIC_DIR)})
            return

        self.send_error(404, "Not Found")


# ------------------------------------------------------------------------------
# Server Entry Point & CLI Parser
# ------------------------------------------------------------------------------

def main():
    global PORT, HOST, MUSIC_DIR

    parser = argparse.ArgumentParser(description="DjPaz - Universal Professional Web DJ Studio Server")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port to bind server (default: {PORT})")
    parser.add_argument("--host", type=str, default=HOST, help=f"Host address to bind (default: {HOST})")
    parser.add_argument("--music-dir", type=str, default=None, help="Custom path to music library folder")
    args = parser.parse_args()

    PORT = args.port
    HOST = args.host
    if args.music_dir:
        MUSIC_DIR = Path(args.music_dir).expanduser().resolve()
        MUSIC_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 65)
    print(f"🎧 DjPaz Studio - Universal Multiplatform DJ Engine")
    print("=" * 65)
    print(f"[*] Sistema Operativo:  {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"[*] Servidor Activo en: http://{HOST}:{PORT}")
    print(f"[*] Acceso Local:       http://localhost:{PORT}")
    print(f"[*] Carpeta de Música:  {MUSIC_DIR}")
    print(f"[*] Deno JS Runtime:    {DENO_PATH}")
    print(f"[*] Formatos Soportados: MP3, FLAC, WAV, M4A, OGG, AAC, OPUS, AIFF, WMA")
    print("=" * 65)

    # Start background worker thread
    worker_thread = threading.Thread(target=background_worker, daemon=True)
    worker_thread.start()

    server = ThreadingHTTPServer((HOST, PORT), DJRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[!] Deteniendo servidor DjPaz...")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
