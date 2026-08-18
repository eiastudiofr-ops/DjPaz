#!/usr/bin/env python3
"""
DJ Music Downloader & Interactive YouTube Studio for Mixxx
Features: YouTube Search, Direct Local Audio Streaming Proxy, Batch Download, and WirePlumber/wpctl Headphone Audio Isolation.
"""

import os
import sys
import re
import json
import time
import uuid
import queue
import shutil
import urllib.parse
import subprocess
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

PORT = 4848
MUSIC_DIR = Path("/home/orouhost/Música")
STATIC_DIR = Path(__file__).resolve().parent / "static"
DENO_PATH = Path("/home/orouhost/.deno/bin/deno")

# Ensure directories exist
MUSIC_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# State management
tasks_lock = threading.Lock()
download_tasks = []
download_queue = queue.Queue()
current_selected_sink = "uc03_usb"


def get_env():
    env = os.environ.copy()
    if DENO_PATH.exists():
        env["PATH"] = f"{DENO_PATH.parent}:{env.get('PATH', '')}"
    return env


def background_worker():
    """Worker thread processing download tasks sequentially."""
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

        if DENO_PATH.exists():
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
                try:
                    subprocess.run(
                        ["notify-send", "-i", "audio-headphones", "Mixxx - Descarga Lista", f"{task.get('title', query)}"],
                        check=False
                    )
                except Exception:
                    pass
            else:
                with tasks_lock:
                    task["status"] = "failed"
                    task["error"] = "Error al descargar el audio de YouTube."
        except Exception as e:
            with tasks_lock:
                task["status"] = "failed"
                task["error"] = str(e)

        download_queue.task_done()


worker_thread = threading.Thread(target=background_worker, daemon=True)
worker_thread.start()


def get_pipewire_audio_devices():
    """Detect available physical audio output targets via PipeWire."""
    return [
        {
            "id": "uc03_usb",
            "name": "Adaptador USB UC03",
            "subtitle": "🎧 Salida privada de Auriculares USB",
            "icon": "🔌",
            "pattern": "UC03"
        },
        {
            "id": "hercules_headphones",
            "name": "Auriculares Hercules Inpulse 200",
            "subtitle": "🎧 Canales 3-4 (Conector Frontal CUE)",
            "icon": "🎧",
            "pattern": "DJControl Inpulse 200"
        },
        {
            "id": "pc_internal",
            "name": "Jack / Altavoces del PC",
            "subtitle": "💻 Salida 3.5mm integrada",
            "icon": "💻",
            "pattern": "Built-in Audio"
        }
    ]


def get_pipewire_devices_detailed():
    """Parse wpctl status to return detailed outputs (sinks) and inputs (sources)."""
    sinks = []
    sources = []
    try:
        res = subprocess.run(["wpctl", "status"], capture_output=True, text=True, timeout=2)
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
        print("[!] Error parsing pipewire devices:", e)

    if not sinks:
        sinks = [
            {"id": "88", "name": "UC03 Adaptador USB Estéreo", "is_default": True, "icon": "🎧", "type": "sinks"},
            {"id": "36", "name": "DJControl Inpulse 200 Mk2 (Master & CUE)", "is_default": False, "icon": "🎛️", "type": "sinks"},
            {"id": "50", "name": "Built-in Audio Estéreo analógico (PC)", "is_default": False, "icon": "💻", "type": "sinks"}
        ]
    if not sources:
        sources = [
            {"id": "51", "name": "Micrófono Integrado del PC", "is_default": True, "icon": "🎤", "type": "sources"},
            {"id": "80", "name": "Micrófono USB UC03", "is_default": False, "icon": "🎙️", "type": "sources"}
        ]
    return sinks, sources


def set_system_sink_by_device_id(device_id):
    """Enforce the audio sink via wpctl set-default at the OS level."""
    global current_selected_sink
    current_selected_sink = str(device_id)

    # 1. If device_id is a numeric PipeWire node ID (e.g. "36", "88", "50")
    if str(device_id).isdigit():
        try:
            res = subprocess.run(["wpctl", "set-default", str(device_id)], capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                print(f"[*] Successfully set default audio sink to {device_id}")
                return True
        except Exception as e:
            print("[!] Error setting numeric wpctl sink:", e)

    # 2. If device_id is a mnemonic or pattern string
    devices = get_pipewire_audio_devices()
    target_device = next((d for d in devices if d["id"] == str(device_id)), None)
    pattern = target_device["pattern"] if target_device else str(device_id)

    try:
        res = subprocess.run(["wpctl", "status"], capture_output=True, text=True, timeout=2)
        in_sinks = False
        for line in res.stdout.splitlines():
            if "Sinks:" in line:
                in_sinks = True
                continue
            if in_sinks:
                if "Sink endpoints:" in line or "Sources:" in line or not line.strip():
                    break
                if pattern.lower() in line.lower():
                    m = re.search(r"(\d+)\.", line)
                    if m:
                        sink_id = m.group(1)
                        subprocess.run(["wpctl", "set-default", sink_id], capture_output=True)
                        print(f"[*] Set default audio sink to {sink_id} ({pattern})")
                        return True
    except Exception as e:
        print("[!] Error setting wpctl sink:", e)
    return False


class DJRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # API: Audio Output Devices & Detailed Config
        if path == "/api/audio-devices" or path == "/api/audio-config":
            devices = get_pipewire_audio_devices()
            sinks, sources = get_pipewire_devices_detailed()
            self.send_json({
                "devices": devices,
                "outputs": sinks,
                "inputs": sources,
                "current_sink": current_selected_sink,
                "current_master": current_selected_sink,
                "current_headphones": current_selected_sink
            })
            return

        # API: Search YouTube
        if path == "/api/search":
            q = params.get("q", [""])[0].strip()
            if not q:
                self.send_json({"results": []})
                return

            try:
                cmd = ["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"ytsearch8:{q}"]
                res = subprocess.run(cmd, capture_output=True, text=True, env=get_env(), timeout=12)
                results = []
                if res.returncode == 0:
                    data = json.loads(res.stdout)
                    entries = data.get("entries", [])
                    for e in entries:
                        if not e:
                            continue
                        duration = e.get("duration")
                        dur_str = "0:00"
                        if duration and not isinstance(duration, str):
                            m = int(duration) // 60
                            s = int(duration) % 60
                            dur_str = f"{m}:{s:02d}"

                        vid_id = e.get("id")
                        thumb = e.get("thumbnail") or e.get("thumbnails", [{}])[-1].get("url")
                        if not thumb and vid_id:
                            thumb = f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg"

                        results.append({
                            "id": vid_id,
                            "title": e.get("title", "Desconocido"),
                            "channel": e.get("uploader") or e.get("channel", "YouTube"),
                            "duration_str": dur_str,
                            "thumbnail": thumb,
                            "url": f"https://www.youtube.com/watch?v={vid_id}" if vid_id else e.get("url")
                        })
                self.send_json({"results": results})
            except Exception as e:
                self.send_json({"error": str(e), "results": []}, 500)
            return

        # API: Direct Local Streaming Proxy (Instant, zero CORS issues)
        if path == "/api/preview-stream":
            vid_url = params.get("url", [""])[0].strip()
            vid_id = params.get("id", [""])[0].strip()
            target = vid_url or (f"https://www.youtube.com/watch?v={vid_id}" if vid_id else "")
            if not target:
                self.send_error(400, "Missing url or id")
                return

            set_system_sink_by_device_id(current_selected_sink)

            cmd = [
                "yt-dlp",
                "-o", "-",
                "-f", "ba/18/b",
                "--no-playlist",
                "--no-warnings",
                "--extractor-args", "youtube:player_client=web,mweb,ios",
                target
            ]
            if DENO_PATH.exists():
                cmd.extend(["--js-runtimes", f"deno:{DENO_PATH}"])

            try:
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=65536,
                    env=get_env()
                )

                self.send_response(200)
                self.send_header("Content-Type", "audio/mp4")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                try:
                    while True:
                        chunk = proc.stdout.read(16384)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                except Exception:
                    pass
                finally:
                    proc.terminate()
                    proc.wait()
            except Exception as e:
                pass
            return

        # API: List Library
        if path == "/api/library":
            tracks = []
            valid_exts = {".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac", ".opus", ".wma"}
            if MUSIC_DIR.exists():
                for p in sorted(MUSIC_DIR.iterdir(), key=lambda f: f.stat().st_mtime if f.is_file() else 0, reverse=True):
                    if p.is_file() and p.suffix.lower() in valid_exts:
                        try:
                            stat = p.stat()
                            tracks.append({
                                "name": p.name,
                                "stem": p.stem,
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

        # API: List Queue
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
            if not str(file_path).startswith(str(MUSIC_DIR.resolve())) or not file_path.exists():
                self.send_error(404, "File not found")
                return

            set_system_sink_by_device_id(current_selected_sink)
            self.serve_audio_file(file_path)
            return

        # Serve static files
        if path == "/" or path == "/index.html":
            target_file = STATIC_DIR / "index.html"
            content_type = "text/html; charset=utf-8"
        else:
            rel_path = path.lstrip("/")
            target_file = (STATIC_DIR / rel_path).resolve()
            if not str(target_file).startswith(str(STATIC_DIR.resolve())) or not target_file.exists():
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

    def serve_audio_file(self, file_path):
        """Serve local audio file with Range requests."""
        try:
            file_size = file_path.stat().st_size
            range_header = self.headers.get("Range")

            ext = file_path.suffix.lower()
            mime_types = {
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".wav": "audio/wav",
                ".m4a": "audio/mp4",
                ".ogg": "audio/ogg",
                ".opus": "audio/opus",
                ".aac": "audio/aac",
            }
            mime = mime_types.get(ext, "audio/mpeg")

            if range_header:
                bytes_range = range_header.strip().replace("bytes=", "").split("-")
                start = int(bytes_range[0])
                end = int(bytes_range[1]) if bytes_range[1] else file_size - 1
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                with open(file_path, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
            else:
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                with open(file_path, "rb") as f:
                    shutil.copyfileobj(f, self.wfile)
        except Exception:
            pass

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
            master_id = data.get("master_id") or data.get("device_id", "36")
            success = set_system_sink_by_device_id(master_id)
            
            sinks, _ = get_pipewire_devices_detailed()
            matched = next((s for s in sinks if str(s["id"]) == str(master_id)), None)
            name = matched["name"] if matched else str(master_id)

            self.send_json({
                "status": "ok" if success else "error",
                "device_id": master_id,
                "device_name": name
            })
            return

        # API: Request Download
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

            if not to_add:
                self.send_json({"error": "No query provided"}, 400)
                return

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

        # API: Open Music Folder
        if path == "/api/open-folder":
            try:
                subprocess.Popen(["xdg-open", str(MUSIC_DIR)])
                self.send_json({"status": "opened", "path": str(MUSIC_DIR)})
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
            return

        self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # API: Delete audio file
        if path == "/api/library":
            filename = params.get("file", [""])[0]
            if not filename:
                self.send_error(400, "Missing filename")
                return

            file_path = (MUSIC_DIR / filename).resolve()
            if not str(file_path).startswith(str(MUSIC_DIR.resolve())) or not file_path.exists():
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


def run():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), DJRequestHandler)
    print(f"🎵 DJ Downloader Server running at http://127.0.0.1:{PORT}")
    try:
        set_system_sink_by_device_id("uc03_usb")
        server.serve_forever()
    except KeyboardInterrupt:
        download_queue.put(None)
        server.shutdown()


if __name__ == "__main__":
    run()
