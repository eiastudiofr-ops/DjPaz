# Notas técnicas — huecos, entorno original y lo que hay que arreglar

Documento de auditoría del código actual (`main` en `5e6f0fd`).  
Sirve para portar DjPaz fuera de la máquina Ubuntu donde se escribió y para no repetir trabajo.

---

## 1. De dónde sale este código

El servidor **no nació como DjPaz**. El encabezado de `server.py` sigue diciendo:

> DJ Music Downloader & Interactive YouTube Studio for Mixxx

Pistas de la máquina original:

| Dato | Valor en el código |
| :--- | :--- |
| Usuario Linux | `orouhost` |
| Carpeta de música | `/home/orouhost/Música` |
| Deno (runtime JS de yt-dlp) | `/home/orouhost/.deno/bin/deno` |
| Sink de audio por defecto | `uc03_usb` (adaptador USB UC03) |
| Controladora | Hercules DJControl Inpulse 200 / 200 MK2 |
| Audio OS | PipeWire + WirePlumber (`wpctl`) |
| Abrir carpeta | `xdg-open` |
| Notificaciones | `notify-send` |
| Servicio viejo (README anterior) | `~/.local/share/dj-music-downloader` |
| Servicio nuevo | `~/proyectos/DjPaz` (`djpaz.service`) |

No faltan otros repositorios Git que clonar. Lo que “no se subió” son **rutas, paquetes de sistema y un entorno de audio Linux**, no módulos Python extra. `requirements.txt` solo lista `yt-dlp`. El HTTP server, MIDI y DSP viven en stdlib + el navegador.

Dependencias externas reales (no van dentro de este repo):

1. [yt-dlp](https://github.com/yt-dlp/yt-dlp)
2. [FFmpeg](https://ffmpeg.org/)
3. [PipeWire / WirePlumber](https://pipewire.org/) (`wpctl`) — solo Linux
4. Deno — opcional, para extractores JS de YouTube
5. Web MIDI API + Web Audio API (Chrome / Edge / Brave)
6. Referencia de mapeo: Mixxx / Hercules Inpulse 200

---

## 2. Mentiras README ↔ código

`install.sh` y `start.sh` llaman:

```bash
python3 server.py --port 4848 --host 0.0.0.0
```

`server.py` **no importa argparse**. `run()` hace:

```python
ThreadingHTTPServer(("127.0.0.1", PORT), DJRequestHandler)  # PORT = 4848 fijo
```

`--port` y `--host` se ignoran. El proceso no queda en `0.0.0.0`.

Otras promesas rotas:

| README / UI | Código |
| :--- | :--- |
| STEMS en tiempo real (vocal / melody / bass / drums) | Tres filtros EQ. **Melody no tiene nodo DSP**: silenciarlo no cambia el audio. |
| Análisis automático de BPM | Regex `NNN bpm` en el filename, si no: `124 + hash(nombre)`. |
| Árbol de carpetas real | `/api/library` lista **solo** archivos sueltos en `MUSIC_DIR`. Afro/Latin/Dance/Pop/Mixxx son filtros de texto. |
| Master RCA + CUE jack aislados | Solo si `destination.maxChannelCount >= 4`. En estéreo (casi todo Windows) el bus CUE **no se conecta** y PFL no suena. |
| `--host 0.0.0.0` | Bind a `127.0.0.1`. |
| Archivo `LICENSE` MIT | **No existe** en el repo. |
| Curva de crossfader / sensibilidad jog (Ajustes) | Selects en HTML; no se guardan ni se aplican. |
| Volumen de auriculares | Solo MIDI CC `0x07`; no hay control en la UI. |

---

## 3. Bloqueos en Windows (este entorno)

El workspace local es Windows. Con el código actual:

1. Al importar `server.py` se crea `C:\home\orouhost\Música` (traducción de la ruta POSIX). Biblioteca y descargas no van a la carpeta de música del usuario.
2. `wpctl`, `xdg-open`, `notify-send` no existen. El selector de audio enseña sinks inventados (`88`, `36`, `50`).
3. `install.sh` / `start.sh` / systemd no corren en PowerShell.
4. Preescucha CUE muda si la interfaz es estéreo.
5. `subprocess` con `text=True` sin `encoding` puede romper el worker de yt-dlp con títulos no UTF-8.

Para arrancar aquí hace falta, como mínimo:

- `MUSIC_DIR` portable (`~/Music`, `%USERPROFILE%\Music`, o variable de entorno `DJPAZ_MUSIC_DIR`)
- `argparse` real para `--host` / `--port`
- Enumeración de dispositivos sin PipeWire (o aceptar que el routing OS es cosa del navegador / Hercules)
- Conectar el bus CUE a `destination` cuando solo hay 2 canales (p. ej. cue mix o mute Master al hacer PFL)
- Script `start.ps1` / `start.bat` + FFmpeg en PATH
- Deno opcional, no hardcodeado a `/home/orouhost/.deno`

---

## 4. Errores de código a corregir

### Críticos

- `server.py:22-24` — `MUSIC_DIR` y `DENO_PATH` absolutos de Ubuntu.
- `server.py:686-688` — sin CLI; bind `127.0.0.1`.
- `static/mixer.js` `setupHardwareOutputs()` — si `maxChannels < 4`, `headphoneGain` no va al destino → CUE mudo.
- `POST /api/set-audio-route` — usa `master_id` y **descarta** `headphones_id`.

### Altos

- STEMS falsos; stem `melody` inerte (`toggleStem` no toca ningún filtro de melodía).
- BPM inventado (`loadTrack`).
- Biblioteca no recursiva; árbol de crate cosmético.
- Scratch de jog: `if (delta < -Math.PI) delta -= 2 * Math.PI` debería **sumar** `2π`.
- XSS: títulos de YouTube interpolados en HTML y `onclick` sin escapar (`app.js` `renderYouTubeResults`).
- Path traversal débil: `str(file_path).startswith(str(MUSIC_DIR))` (p. ej. `C:\music` vs `C:\music_evil`). Usar `Path.is_relative_to()`.

### Medios

- `filterCrateByFolder` hace `textContent` en `#crate-category-title` y **borra** `#crate-filtered-count`.
- Sampler (`playDJSoundSample`) conecta a `ctx.destination`, no al bus Master/CUE.
- `testAudioTone` ignora el dispositivo elegido.
- `/api/preview-stream` llama `set_system_sink_by_device_id` (cambia el sink **de todo el sistema**) y manda `Accept-Ranges` sin implementar Range.
- MIDI: `name.includes('dj')` puede enganchar cualquier dispositivo con “dj” en el nombre.
- Botón CUE de pantalla: `click` → `cue()` con `isDown=true`; no hay `mouseup`, el preview no se corta como en hardware.

---

## 5. Qué no hace falta clonar

No hay submódulos ni repos hermanos en GitHub (`eiastudiofr-ops` solo publica `DjPaz` y `eiastudio`).  
No hay `package.json`: el front es JS plano en `static/`.

Lo que sí hay que tener **instalado en el OS**, no “subido”:

```
python3 >= 3.9
ffmpeg
yt-dlp          # pip install -r requirements.txt
pipewire + wireplumber + wpctl   # Linux audio
chrome/edge/brave                # Web MIDI
```

Windows: Python + FFmpeg en PATH + `pip install -r requirements.txt`. PipeWire no aplica.

---

## 6. Orden de parche recomendado (para que arranque en Windows)

1. `argparse`: `--host`, `--port`, `--music-dir`.
2. `MUSIC_DIR` / `DENO_PATH` con defaults por OS y env (`DJPAZ_MUSIC_DIR`).
3. CUE en 2 canales (no dejar el bus colgando).
4. Dejar de llamar `wpctl` si no existe; no inventar IDs de sink.
5. `start.ps1` + nota de FFmpeg.
6. Luego: BPM real o quitar la promesa; STEMS honestos en README; escape XSS; `is_relative_to`; scratch wrap; contador de crate.

---

## 7. Datos que siguen haciendo falta del autor original

Si se quiere un 4.0 discreto idéntico a Ubuntu:

- ¿La Hercules se ve en Windows como dispositivo de **4 canales** WASAPI o solo estéreo?
- ¿Sigue existiendo el dongle **UC03** o ahora Master/CUE van solo por la Inpulse?
- Carpeta de música real en cada máquina (no `/home/orouhost/Música`).
- Si Deno es obligatorio para YouTube en 2026 o basta yt-dlp del pip.

Sin eso se puede dejar la app usable en estéreo (Master por altavoces, CUE por el mismo dispositivo o mix en cascos).
