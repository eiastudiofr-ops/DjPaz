# 🎧 DjPaz - Professional Web DJ Studio & Hardware Integration

**DjPaz** es una estación de trabajo para DJs profesionales y estudio de mezcla digital en tiempo real basado en navegador web, con integración de hardware plug-and-play para la controladora **Hercules DJControl Inpulse 200 MK2** (y 200 standard), arquitectura de audio discreto multicanal (Master RCA y Preescucha en Auriculares CUE), motor de separación de **STEMS en tiempo real**, **Performance FX**, sintetizador de **Pads / Sampler** y gestor integrado de descarga y análisis de pistas musicales a 320kbps 48kHz.

---

## 🌟 Características Principales

### 1. 🎛️ Arquitectura de Audio Discreta de 4 Canales (Master & CUE)
* **Master Bus (Canales 1 y 2 / RCA Traseros):** Señal post-fader y crossfader con limitador y compresor dinámico de estudio para evitar distorsión o clipping.
* **Headphone CUE Bus (Canales 3 y 4 / Jack 3.5mm Frontal):** Ruta pre-fader independiente para preescucha de canciones en auriculares con control de volumen independiente (`HEADPHONE VOL`).
* **Aislamiento Total:** El audio de preescucha CUE nunca se mezcla ni se filtra a los altavoces del Master.

### 2. 🎮 Mapeo Hardware Hercules DJControl Inpulse 200 MK2 (MIDI Bidireccional)
* **Transporte:** `PLAY/PAUSE` con Cue Stutter (`SHIFT + PLAY`), `CUE` con Hold Preview y regreso al inicio (`SHIFT + CUE`), `SYNC` con Smooth Pitch Reset (`SHIFT + SYNC`).
* **Jog Wheels:** Detección táctil capacitiva para **Scratch de Vinilo** real, aceleración/freno de compás (*Pitch Bend / Nudge*) en el borde exterior, y búsqueda rápida de aguja (*Needle Search*) con `SHIFT + JOG`.
* **Pitch Faders de 14 Bits:** Calibración de alta resolución (MSB + LSB) con rangos ultra precisos de $\pm 16\%$.
* **Bucles Dinámicos:** `LOOP IN` y `LOOP OUT` con división de bucle a la mitad (`1/2`) y duplicación (`2X`) con `SHIFT`.
* **Navegador Central:** Encoder rotatorio con selector de carpetas y pistas, carga automática inteligente (`BROWSER PUSH`), asistente de energía musical IMA (`ASSISTANT`) con anillo LED RGB de 4 colores y preparación de pistas (`ASSIST PREP`).

### 3. 🎹 4 Modos de Performance Pads con Soporte SHIFT

| Modo | Pad 1 | Pad 2 | Pad 3 | Pad 4 | Acción con SHIFT |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`HOT CUE`** | Hot Cue 1 | Hot Cue 2 | Hot Cue 3 | Hot Cue 4 | Borrar CUE seleccionado |
| **`STEMS`** | 🎤 Vocales (On/Mute) | 🎹 Melodía (On/Mute) | 🎸 Bajos (On/Mute) | 🥁 Batería (On/Mute) | **SOLO** (Aísla solo ese instrumento) |
| **`FX`** | ⚡ HPF Build Sweep | 🔁 Echo 1/2 Beat | 🚀 Flanger Jet | 🛑 Vinyl Brake (Freno) | Efecto temporal |
| **`SAMPLER`** | 🎺 Airhorn Drop | 💿 Scratch Sample | ⚡ Impacto Láser | 💣 808 Sub Boom | Disparo de muestra |

### 4. 🎚️ Ecualización de 3 Bandas y Filtros Bipolares
* **EQ de 3 Bandas:** Graves (Lowshelf 120Hz), Medios (Peaking 1.2kHz Q=0.8) y Agudos (Highshelf 6.5kHz).
* **Filtro DJ Bipolar:** Paso Bajo resonante hacia la izquierda, Paso Alto resonante hacia la derecha, y bypass lineal transparente al centro (sin coloración de fase).

### 5. 📂 Explorador de Música de 2 Paneles & Descargas HQ
* Árbol de carpetas jerárquico integrado con explorador de pistas musicales.
* Motor de descargas de audio mediante `yt-dlp` a máxima calidad (320kbps MP3 / AAC, 48.000 Hz).
* Detección y análisis automático de BPM.

---

## 🛠️ Requisitos del Sistema

* **Sistema Operativo:** GNU/Linux (Ubuntu, Debian, Fedora, Arch), macOS o Windows.
* **Servidor de Sonido:** PipeWire / PulseAudio / ALSA con soporte para tarjetas de 4 canales.
* **Python:** Python 3.9 o superior (`urllib`, `http.server`, `json`, `subprocess`).
* **Dependencias opcionales:** `yt-dlp` y `ffmpeg` para descargas de audio.
* **Navegador:** Google Chrome, Chromium, Brave, Microsoft Edge o cualquier navegador con soporte Web MIDI API y Web Audio API.

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/DjPaz.git
cd DjPaz
```

### 2. Ejecutar el Servidor
```bash
python3 server.py --port 4848 --host 0.0.0.0
```

### 3. Abrir en el Navegador
Abre tu navegador e ingresa a:
```
http://localhost:4848
```

---

## ⚙️ Servicio en Segundo Plano (systemd)

Para mantener la aplicación ejecutándose como un servicio continuo en Linux:

1. Crear el archivo `~/.config/systemd/user/dj-downloader.service`:
```ini
[Unit]
Description=DjPaz - DJ Music Studio & Hardware Mixer Server
After=network.target sound.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/dj-music-downloader
ExecStart=/usr/bin/python3 %h/.local/share/dj-music-downloader/server.py --port 4848 --host 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

2. Habilitar e iniciar el servicio:
```bash
systemctl --user daemon-reload
systemctl --user enable --now dj-downloader.service
```

3. Comprobar el estado:
```bash
systemctl --user status dj-downloader.service
```

---

## 🗺️ Mapa de Mensajes MIDI (Hercules Inpulse 200 MK2)

```
=============================================================================
CANAL / COMANDO      BYTE 1 (NOTA/CC)   FUNCIÓN
=============================================================================
Ch 1 (Deck A)        Note 0x07          PLAY / PAUSE (Shift: Cue Stutter)
Ch 1 (Deck A)        Note 0x06          CUE (Shift: Inicio 0:00)
Ch 1 (Deck A)        Note 0x05          SYNC (Shift: Pitch Reset)
Ch 1 (Deck A)        Note 0x03          VINYL Mode Toggle
Ch 1 (Deck A)        Note 0x08          Jog Platter Touch (Scratch)
Ch 1 (Deck A)        Note 0x09          LOOP IN (Shift: Loop 1/2)
Ch 1 (Deck A)        Note 0x0A          LOOP OUT (Shift: Loop 2X)
Ch 1 (Deck A)        Note 0x0D          LOAD Track (Shift: Unload)
Ch 1 (Deck A)        CC 0x00            Channel Volume Fader
Ch 1 (Deck A)        CC 0x01            Filter Knob
Ch 1 (Deck A)        CC 0x02            Low EQ Knob
Ch 1 (Deck A)        CC 0x03            Mid EQ Knob
Ch 1 (Deck A)        CC 0x04            High EQ Knob
Ch 1 (Deck A)        CC 0x05            Gain Knob
Ch 1 (Deck A)        CC 0x08 / 0x28     Pitch Fader (14-Bit MSB / LSB)
Ch 1 (Deck A)        CC 0x0A / 0x09     Jog Wheel Rotation (Shift: Fast Seek)

Ch 2 (Deck B)        Mismos controles que Deck A mapeados al Canal MIDI 2

Ch 6 / 7 / 4 / 5     Note 0x00..0x03    Pads 1..4 (Hot Cue, Stems, FX, Sampler)
Ch 6 / 7 / 4 / 5     Note 0x08..0x0B    SHIFT + Pads 1..4

Ch 0 (Mixer)         CC 0x00            Crossfader
Ch 0 (Mixer)         CC 0x01 / 0x03     Browser Rotary Encoder
Ch 0 (Mixer)         Note 0x00          Browser Push Click
Ch 0 (Mixer)         Note 0x03 / 0x04   IMA Assistant Button (Color LED Ring)
Ch 0 (Mixer)         Note 0x02 / 0x05   Assist Prep Button
Ch 0 (Mixer)         Note 0x0C          🎧 Headphone PFL Deck A
Ch 0 (Mixer)         Note 0x0D          🎧 Headphone PFL Deck B
Ch 0 (Mixer)         Note 0x0B          🎧 Master Headphone PFL
Ch 0 (Mixer)         Note 0x08          Beatmatch Guide Toggle
=============================================================================
```

---

## 📄 Licencia

Desarrollado para la comunidad de DJs y productores. Licencia MIT.
