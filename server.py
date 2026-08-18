#!/usr/bin/env python3
"""
DjPaz - Professional Web DJ Studio & Hardware Mixer Server
High-Performance Audio Engine, Multi-Channel Routing Proxy, and Real-Time Music Library.
"""

import os
import sys
import re
import json
import time
import uuid
import queue
import shutil
import argparse
import urllib.parse
import subprocess
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ==============================================================================
# Configuration & Path Resolver
# ==============================================================================

def get_default_music_dir():
    """Detect appropriate Music folder cross-platform (Linux, Windows, macOS)."""
    if "DJPAZ_MUSIC_DIR" in os.environ:
        return Path(os.environ["DJPAZ_MUSIC_DIR"]).expanduser().resolve()
    home = Path.home()
    for candidate in [home / "Music", home / "Música", home / "musica"]:
        if candidate.exists():
            return candidate.resolve()
    return (home / "Music").resolve()


def get_deno_path():
    """Detect Deno JavaScript runtime if available for YouTube extraction."""
    which_deno = shutil.which("deno")
    if which_deno:
        return Path(which_deno)
    user_deno = Path.home() / ".deno" / "bin" / "deno"
    if user_deno.exists():
        return user_deno
    return None


# Global Server Configuration (populated in main())
PORT = 4848
HOST = "0.0.0.0"
MUSIC_DIR = get_default_music_dir()
STATIC_DIR = Path(__file__).resolve().parent / "static"
DENO_PATH = get_deno_path()

# State Management
tasks_lock = threading.Lock()
download_tasks = []
download_queue = queue.Queue()
current_selected_sink = "default"


def get_env():
    """Build environment with Deno and system PATH."""
    env = os.environ.copy()
    if DENO_PATH and DENO_PATH.exists():
        env["PATH"] = f"{DENO_PATH.parent}:{env.get('PATH', '')}"
    return env


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Validate that target_path is within base_dir (prevent path traversal)."""
    try:
        target = target_path.resolve()
        base = base_dir.resolve()
        return target.is_relative_to(base)
    except (AttributeError, ValueError):
        try:
            return str(target_path.resolve()).startswith(str(base_dir.resolve()))
        except Exception:
            return False


def open_system_folder(path: Path):
    """Open folder in OS file manager cross-platform (Windows, Linux, macOS)."""
    path_str = str(path.resolve())
    if sys.platform == "win32":
        try:
            os.startfile(path_str)
            return True
        except Exception as e:
            print("[!] Error opening Windows Explorer:", e)
    elif sys.platform == "darwin":
        try:
            subprocess.Popen(["open", path_str])
            return True
        except Exception as e:
            print("[!] Error opening macOS Finder:", e)
    else:
        if shutil.which("xdg-open"):
            try:
                subprocess.Popen(["xdg-open", path_str])
                return True
            except Exception as e:
                print("[!] Error opening Linux file manager:", e)
    return False


def send_system_notification(title: str, message: str):
    """Send OS desktop notification if available."""
    if sys.platform.startswith("linux") and shutil.which("notify-send"):
        try:
            subprocess.run(["notify-send", "-i", "audio-headphones", title, message], check=False, timeout=1)
        except Exception:
            pass


# ==============================================================================
# Background Download Worker
# ==============================================================================

def background_worker():
    """Worker thread processing download tasks sequentially with yt-dlp."""
    while True:
        task_id = download_queue.get()
        if task_id is None:
            break

        task = None
        with tasks_lock:
            for t in download_tasks:
                if t["id"] == task_id:
                    task = t
                    break

        if not task:
            download_queue.task_done()
            continue

        with tasks_lock:
            task["status"] = "downloading"
            task["progress"] = 10
            task["error"] = None

        query = task["query"]
        print(f"[*] Starting download: {query}")

        cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--prefer-ffmpeg",
            "--postprocessor-args", "ExtractAudio:-b:a 320k -ar 48000",
            "--embed-metadata",
            "--embed-thumbnail",
            "--extractor-args", "youtube:player_client=web,mweb,ios",
            "--ignore-errors",
            "--no-warnings",
            "--newline",
            "-o", str(MUSIC_DIR / "%(title)s.%(ext)s")
        ]

        if DENO_PATH and DENO_PATH.exists():
            cmd.extend(["--js-runtimes", f"deno:{DENO_PATH}"])

        if query.startswith("http://") or query.startswith("https://"):
            if "playlist?list=" in query or "&list=" in query:
                cmd.append("--yes-playlist")
            else:
                cmd.append("--no-playlist")
            cmd.append(query)
        else:
            cmd.append(f"ytsearch1:{query}")

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=get_env()
            )

            for line in process.stdout:
                line_str = line.strip()
                if "[download]" in line_str and "%" in line_str:
                    parts = line_str.split()
                    for p in parts:
                        if p.endswith("%"):
                            try:
                                pct = float(p.replace("%", ""))
                                with tasks_lock:
                                    task["progress"] = min(int(pct * 0.9), 90)
                            except ValueError:
                                pass
                elif "[ExtractAudio]" in line_str:
                    with tasks_lock:
                        task["progress"] = 92
                elif "[Metadata]" in line_str or "[EmbedThumbnail]" in line_str:
                    with tasks_lock:
                        task["progress"] = 96
                elif "Destination:" in line_str:
                    dest_file = line_str.split("Destination:", 1)[1].strip()
                    title_found = Path(dest_file).stem
                    with tasks_lock:
                        task["title"] = title_found

            process.wait()

            if process.returncode == 0:
                with tasks_lock:
                    task["status"] = "completed"
                    task["progress"] = 100
                    if not task.get("title"):
                        task["title"] = query
                send_system_notification("DjPaz - Descarga Lista", str(task.get('title', query)))
            else:
                with tasks_lock:
                    task["status"] = "failed"
                    task["error"] = "Error al descargar el audio de YouTube con yt-dlp."
        except Exception as e:
            with tasks_lock:
                task["status"] = "failed"
                task["error"] = str(e)

        download_queue.task_done()


worker_thread = threading.Thread(target=background_worker, daemon=True)
worker_thread.start()


# ==============================================================================
# Audio Device & PipeWire Integrator
# ==============================================================================

def get_pipewire_devices_detailed():
    """Parse wpctl status to return real audio outputs and inputs."""
    sinks = []
    sources = []

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
                    line_str = line.strip()
                    if not line_str or line_str.startswith("│"):
                        line_str = line.replace("│", "").strip()
                    m = re.search(r"(\*?)\s*(\d+)\.\s+(.+?)\s+\[", line_str)
                    if m:
                        is_default = bool(m.group(1))
                        node_id = m.group(2)
                        name = m.group(3).strip()
                        
                        icon = "🔊" if section == "sinks" else "🎤"
                        if "uc03" in name.lower() or "headphone" in name.lower() or "auricular" in name.lower():
                            icon = "🎧"
                        elif "inpulse" in name.lower() or "hercules" in name.lower():
                            icon = "🎛️"
                        elif "built-in" in name.lower():
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
        except Exception as e:
            print("[!] Error parsing PipeWire devices:", e)

    if not sinks:
        sinks = [
            {"id": "default", "name": "Dispositivo de Audio Principal del Sistema", "is_default": True, "icon": "🔊", "type": "sinks"},
            {"id": "hercules", "name": "Hercules DJControl Inpulse 200 MK2 (4 Canales)", "is_default": False, "icon": "🎛️", "type": "sinks"}
        ]
    if not sources:
        sources = [
            {"id": "default_mic", "name": "Micrófono del Sistema", "is_default": True, "icon": "🎤", "type": "sources"}
        ]
    return sinks, sources


def set_system_sink_by_device_id(device_id):
    """Enforce audio sink via wpctl set-default on Linux/PipeWire."""
    global current_selected_sink
    current_selected_sink = str(device_id)

    if not shutil.which("wpctl"):
        return True

    if str(device_id).isdigit():
        try:
            res = subprocess.run(["wpctl", "set-default", str(device_id)], capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                print(f"[*] Successfully set default audio sink to {device_id}")
                return True
        except Exception as e:
            print("[!] Error setting wpctl sink:", e)
    return False


# ==============================================================================
# HTTP Request Handler & REST API
# ==============================================================================

class DJRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_audio_file(self, file_path: Path):
        """Serve audio with full HTTP Range request support for seeking."""
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
                ".opus": "audio/opus"
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

            cmd = [
                "yt-dlp",
                "--dump-json",
                "--default-search", "ytsearch8",
                "--no-playlist",
                "--skip-download",
                "--extractor-args", "youtube:player_client=web,mweb",
                f"ytsearch8:{query}"
            ]
            if DENO_PATH and DENO_PATH.exists():
                cmd.extend(["--js-runtimes", f"deno:{DENO_PATH}"])

            results = []
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=15,
                    env=get_env(),
                    encoding="utf-8",
                    errors="replace"
                )
                for line in proc.stdout.splitlines():
                    if not line.strip():
                        continue
                    try:
                        info = json.loads(line)
                        dur = info.get("duration", 0)
                        results.append({
                            "id": info.get("id"),
                            "title": info.get("title"),
                            "uploader": info.get("uploader"),
                            "duration": dur,
                            "duration_string": f"{dur // 60}:{dur % 60:02d}" if dur else "00:00",
                            "thumbnail": info.get("thumbnail"),
                            "url": f"https://www.youtube.com/watch?v={info.get('id')}"
                        })
                    except Exception:
                        continue
            except Exception as e:
                print(f"[!] YouTube search error: {e}")

            self.send_json({"results": results})
            return

        # API: List Music Library (Recursive scan with folders)
        if path == "/api/library":
            tracks = []
            valid_exts = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac", ".opus", ".wma"}
            if MUSIC_DIR.exists():
                for p in sorted(MUSIC_DIR.rglob("*"), key=lambda f: f.stat().st_mtime if f.is_file() else 0, reverse=True):
                    if p.is_file() and p.suffix.lower() in valid_exts:
                        try:
                            stat = p.stat()
                            rel_path = str(p.relative_to(MUSIC_DIR))
                            folder = p.parent.name if p.parent != MUSIC_DIR else "Root"
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
                "music_dir": str(MUSIC_DIR)
            })
            return

        # API: List Active Queue
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
                ".jpg": "image/jpeg",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
            }
            content_type = content_types.get(suffix, "application/octet-stream")

        try:
            with open(target_file, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len) if content_len > 0 else b"{}"

        try:
            data = json.loads(post_body.decode("utf-8"))
        except Exception:
            data = {}

        # API: Audio Configuration (Inputs & Outputs)
        if path == "/api/audio-config":
            sinks, sources = get_pipewire_devices_detailed()
            self.send_json({
                "outputs": sinks,
                "inputs": sources,
                "current_master": current_selected_sink,
                "current_headphones": current_selected_sink
            })
            return

        # API: Set Exclusive Audio Route
        if path == "/api/set-audio-route":
            master_id = data.get("master_id") or data.get("device_id", "default")
            headphones_id = data.get("headphones_id", master_id)
            success = set_system_sink_by_device_id(master_id)
            
            sinks, _ = get_pipewire_devices_detailed()
            matched = next((s for s in sinks if str(s["id"]) == str(master_id)), None)
            name = matched["name"] if matched else str(master_id)

            self.send_json({
                "status": "ok" if success else "error",
                "device_id": master_id,
                "headphones_id": headphones_id,
                "device_name": name
            })
            return

        # API: Request Audio Download
        if path == "/api/download":
            query = data.get("query", "").strip()
            title = data.get("title", "").strip() or query
            queries = data.get("queries", [])

            to_add = []
            if query:
                to_add.append({"query": query, "title": title})
            if isinstance(queries, list):
                for q in queries:
                    q_clean = str(q).strip()
                    if q_clean and not any(t["query"] == q_clean for t in to_add):
                        to_add.append({"query": q_clean, "title": q_clean})

            added_tasks = []
            with tasks_lock:
                for item in to_add:
                    task = {
                        "id": str(uuid.uuid4())[:8],
                        "query": item["query"],
                        "title": item["title"],
                        "status": "pending",
                        "progress": 0,
                        "created_at": int(time.time()),
                        "error": None
                    }
                    download_tasks.append(task)
                    added_tasks.append(task)
                    download_queue.put(task["id"])

            self.send_json({"status": "queued", "count": len(added_tasks), "tasks": added_tasks})
            return

        # API: Open Music Folder in File Manager
        if path == "/api/open-folder":
            success = open_system_folder(MUSIC_DIR)
            self.send_json({"status": "opened" if success else "error", "path": str(MUSIC_DIR)})
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # API: Delete Audio File from Library
        if path == "/api/library":
            filename = params.get("file", [""])[0]
            if not filename:
                self.send_error(400, "Missing filename")
                return

            file_path = (MUSIC_DIR / filename).resolve()
            if not is_safe_path(MUSIC_DIR, file_path) or not file_path.exists():
                self.send_error(404, "File not found")
                return

            try:
                file_path.unlink()
                for thumb_ext in [".jpg", ".png", ".webp"]:
                    thumb_path = file_path.with_suffix(thumb_ext)
                    if thumb_path.exists():
                        thumb_path.unlink()
                self.send_json({"status": "deleted", "filename": filename})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        self.send_error(404, "Not Found")


# ==============================================================================
# CLI Entrypoint
# ==============================================================================

def main():
    global PORT, HOST, MUSIC_DIR

    parser = argparse.ArgumentParser(description="DjPaz - Professional Web DJ Studio & Hardware Mixer Server")
    parser.add_argument("--port", "-p", type=int, default=int(os.environ.get("PORT", 4848)), help="Port to listen on (default: 4848)")
    parser.add_argument("--host", "-H", type=str, default=os.environ.get("HOST", "0.0.0.0"), help="Host address to bind (default: 0.0.0.0)")
    parser.add_argument("--music-dir", "-m", type=str, default=None, help="Custom music library directory path")
    args = parser.parse_args()

    PORT = args.port
    HOST = args.host
    if args.music_dir:
        MUSIC_DIR = Path(args.music_dir).expanduser().resolve()
        MUSIC_DIR.mkdir(parents=True, exist_ok=True)

    print("=================================================================")
    print(f"🎧 DjPaz Studio Server")
    print(f"📍 Directorio de Música: {MUSIC_DIR}")
    print(f"🌐 Servidor escuchando en: http://{HOST}:{PORT}")
    print(f"🌐 Acceso local:          http://localhost:{PORT}")
    print("=================================================================")

    server = ThreadingHTTPServer((HOST, PORT), DJRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Apagando servidor DjPaz...")
        download_queue.put(None)
        server.shutdown()


if __name__ == "__main__":
    main()
