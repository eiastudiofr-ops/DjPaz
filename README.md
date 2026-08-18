# 🎧 DjPaz - Professional Web DJ Studio & Hardware Integration

<p align="center">
  <img src="icon.svg" width="120" height="120" alt="DjPaz Logo">
</p>

<p align="center">
  <strong>Estación de mezcla digital para DJ profesional en tiempo real para navegador web con integración nativa de hardware para Hercules DJControl Inpulse 200 MK2 / 200.</strong>
</p>

<p align="center">
  <a href="#-instalación-rápida-1-línea"><img src="https://img.shields.io/badge/Instalación-1--Línea-brightgreen.svg" alt="Instalación 1 Línea"></a>
  <a href="#-compatibilidad-hardware"><img src="https://img.shields.io/badge/Hardware-Hercules%20Inpulse%20200%20MK2-blue.svg" alt="Hercules Support"></a>
  <a href="#-arquitectura-de-audio-discreta-de-4-canales"><img src="https://img.shields.io/badge/Audio-4.0%20Discrete%20(Master%20%2B%20CUE)-orange.svg" alt="4-Channel Discrete Audio"></a>
  <a href="#-licencia"><img src="https://img.shields.io/badge/Licencia-MIT-purple.svg" alt="Licencia MIT"></a>
</p>

---

## 📑 Tabla de Contenidos
1. [Características Principales](#-características-principales)
2. [Instalación Rápida (1 Línea)](#-instalación-rápida-1-línea)
3. [Instalación Manual por Sistema Operativo](#-instalación-manual-por-sistema-operativo)
4. [Estructura del Proyecto](#-estructura-del-proyecto)
5. [Arquitectura del Sistema y Audio](#-arquitectura-del-sistema-y-audio)
6. [Mapeo MIDI Oficial Completo (Hercules Inpulse 200 MK2)](#-mapeo-midi-oficial-completo)
7. [Guía de Modos de Performance Pads](#-guía-de-modos-de-performance-pads)
8. [Configuración del Servicio en Segundo Plano (systemd)](#-configuración-del-servicio-systemd)
9. [Repositorios, Librerías y Estándares Externos Utilizados](#-repositorios-librerías-y-estándares-externos)
10. [Preguntas Frecuentes y Solución de Problemas](#-preguntas-frecuentes-y-solución-de-problemas)

---

## 🌟 Características Principales

* 🎛️ **Audio Discreto de 4 Canales (Master & CUE):** Separación física real entre altavoces Master (RCA trasero Canales 1-2) y Preescucha en Auriculares (Jack 3.5mm frontal Canales 3-4).
* 🎮 **Soporte Nativo Plug-and-Play para Hercules Inpulse 200 MK2:** Comunicación Web MIDI bidireccional de baja latencia con sincronización de LEDs, botones de transporte, rueda Jog capacitiva, faders de 14 bits y rueda de navegación.
* 🎤 **Separación de STEMS en Tiempo Real:** Silenciamiento o aislamiento (*Solo*) en vivo de **Vocales**, **Melodía/Sintetizador**, **Bajos** y **Batería/Percusión** mediante filtros paramétricos de alta resolución.
* ⚡ **Performance FX Suite:** Barridos de filtro resonante (*HPF Build*), Eco rítmico a compás (*1/2 Beat Delay*), *Flanger Jet* y parada emulada de motor de tocadiscos (*Vinyl Brake*).
* 🎺 **Sintetizador de Pads / DJ Sampler:** Disparador de efectos de club clásicos (*Airhorn*, *Scratch Vocal*, *Laser Shot*, *808 Sub Drop*).
* 🔁 **Sistema Completo de Loops:** Bucle manual y automático `IN` / `OUT` con multiplicación `2X` y división `1/2` continua.
* 📂 **Explorador de Crate de 2 Paneles:** Navegación por árbol de carpetas con el encoder rotatorio físico de la controladora.
* 🚀 **Descargador de Audio Integrado en Alta Fidelidad:** Extracción y conversión automática a **320 kbps MP3 / AAC a 48.000 Hz** con detección de BPM.
* 🖥️ **Diseño Adaptativo para Pantallas Pequeñas:** Toda la consola (Deck A, Mesa Central y Deck B) visible simultáneamente sin scroll vertical general.

---

## ⚡ Instalación Rápida (1 Línea)

En cualquier distribución Linux (Ubuntu, Debian, Fedora, Arch):

```bash
git clone https://github.com/eiastudiofr-ops/DjPaz.git && cd DjPaz && ./install.sh
```

El script se encargará de instalar los paquetes del sistema, las dependencias de Python y activar el servicio en segundo plano. Abre luego tu navegador en:
👉 **`http://localhost:4848`**

---

## 💻 Instalación Manual por Sistema Operativo

### 🐧 1. Ubuntu / Debian / Linux Mint / Pop!_OS
```bash
# 1. Instalar dependencias del sistema y multimedia
sudo apt update
sudo apt install -y python3 python3-pip ffmpeg pipewire wireplumber alsa-utils curl git

# 2. Clonar el repositorio
git clone https://github.com/eiastudiofr-ops/DjPaz.git
cd DjPaz

# 3. Instalar librerías de Python
pip3 install -r requirements.txt --break-system-packages

# 4. Iniciar el servidor
./start.sh
```

### 🎩 2. Fedora / Red Hat / CentOS
```bash
# 1. Instalar dependencias
sudo dnf install -y python3 python3-pip ffmpeg pipewire wireplumber alsa-utils curl git

# 2. Clonar e instalar
git clone https://github.com/eiastudiofr-ops/DjPaz.git
cd DjPaz
pip3 install -r requirements.txt

# 3. Iniciar
./start.sh
```

### 🏹 3. Arch Linux / Manjaro
```bash
# 1. Instalar dependencias
sudo pacman -Sy --noconfirm python python-pip ffmpeg pipewire pipewire-pulse wireplumber alsa-utils yt-dlp git

# 2. Clonar y lanzar
git clone https://github.com/eiastudiofr-ops/DjPaz.git
cd DjPaz
./start.sh
```

### 🍏 4. macOS
```bash
# 1. Instalar Homebrew si no lo tienes: https://brew.sh
brew install python ffmpeg yt-dlp git

# 2. Clonar y lanzar
git clone https://github.com/eiastudiofr-ops/DjPaz.git
cd DjPaz
python3 server.py --port 4848 --host 0.0.0.0
```

### 🪟 5. Windows
1. Instala [Python 3](https://www.python.org/downloads/) (asegúrate de marcar *"Add Python to PATH"*).
2. Descarga e instala [FFmpeg](https://www.gyan.dev/ffmpeg/builds/) y agrégalo a las variables de entorno.
3. Clona o descarga este repositorio:
   ```cmd
   git clone https://github.com/eiastudiofr-ops/DjPaz.git
   cd DjPaz
   pip install -r requirements.txt
   python server.py --port 4848
   ```

---

## 📁 Estructura del Proyecto

```
DjPaz/
├── server.py              # Servidor HTTP multihilo, API REST, PipeWire y yt-dlp
├── requirements.txt       # Dependencias de Python (yt-dlp)
├── install.sh             # Script instalador automatizado para Linux/macOS
├── start.sh               # Lanzador directo de la aplicación
├── djpaz.service          # Plantilla de servicio systemd de usuario
├── README.md              # Documentación técnica completa
├── icon.svg               # Logotipo de la aplicación
├── .gitignore             # Exclusiones de temporales, caché y descargas
└── static/
    ├── index.html         # Interfaz web responsiva minimalista
    ├── style.css          # Estilos CSS puros para pantallas pequeñas
    ├── mixer.js           # Motor Web Audio DSP de 4 canales y protocolo MIDI
    ├── app.js             # Lógica de interfaz, descargas y árbol de carpetas
    └── favicon.ico        # Icono de pestaña del navegador
```

---

## 🔊 Arquitectura del Sistema y Audio

### Flujo de Señal Web Audio (DSP 4 Canales):

```
                                  ┌───────────────────────────┐
                                  │      Pista de Audio       │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │   3-Band Parametric EQ    │
                                  │   (Low / Mid / High)      │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │    Bipolar DJ Filter      │
                                  │ (Lowpass / Bypass / High) │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │     STEMS Isolation       │
                                  │(Vocal/Melody/Bass/Drums)  │
                                  └──────┬─────────────┬──────┘
                                         │             │
                    [Pre-Fader PFL Tap]  │             │ [Main Output Path]
                                         │             ▼
                                  ┌──────▼──────┐┌────────────▼──────────┐
                                  │ PFL Gain A/B││ Channel & Cross Fader │
                                  └──────┬──────┘└────────────┬──────────┘
                                         │                    ▼
                                  ┌──────▼──────┐┌────────────▼──────────┐
                                  │Headphone Bus││  Master Studio Bus    │
                                  │(Gain + CUE) ││ (Compressor / Limiter)│
                                  └──────┬──────┘└────────────┬──────────┘
                                         │                    │
              [Canales 2 y 3 (RL / RR)]  │                    │ [Canales 0 y 1 (FL / FR)]
                                         ▼                    ▼
                                  ┌─────────────┐┌───────────────────────┐
                                  │  Auriculares││  Altavoces Principales│
                                  │ (Jack 3.5mm)││      (RCA Trasero)    │
                                  └─────────────┘└───────────────────────┘
```

---

## 🗺️ Mapeo MIDI Oficial Completo

Especificación validada para la **Hercules DJControl Inpulse 200 MK2**:

### 1. Canales y Asignaciones
* **Canal MIDI 1:** Deck A (Transporte, Knobs, Faders, Jog Wheel, Loops).
* **Canal MIDI 2:** Deck B (Misma distribución que Deck A).
* **Canal MIDI 0:** Mesa Central (Crossfader, Browser Rotary, CUE PFL, Assistant, Beatmatch Guide).
* **Canales MIDI 6 / 7 (o 4 / 5 / 8 / 9):** Performance Pads 1 al 4 de los Decks A y B.

### 2. Tabla de Mensajes y Acciones

| Comando / Canal | Byte 1 (Hex) | Control Hardware | Acción Normal | Acción con `SHIFT` Pulsado |
| :--- | :--- | :--- | :--- | :--- |
| **Ch 1 / Ch 2** | `0x07` (Note) | **`PLAY / PAUSE`** | Reproducir / Pausar pista | **Cue Stutter:** reanuda desde el CUE en directo |
| **Ch 1 / Ch 2** | `0x06` (Note) | **`CUE`** | Fijar punto CUE / Saltar / Mantener preview | **Regreso al inicio (0:00)** de la pista |
| **Ch 1 / Ch 2** | `0x05` (Note) | **`SYNC`** | Cuadrar BPM y fase con el otro Deck | **Smooth Pitch Reset:** vuelve a `0.00%` |
| **Ch 1 / Ch 2** | `0x03` (Note) | **`VINYL`** | Alterna modo Vinilo Scratch (LED rojo) | — |
| **Ch 1 / Ch 2** | `0x08` (Note) | **`JOG TOUCH`** | Detección táctil capacitiva del plato | Scratch / Búsqueda |
| **Ch 1 / Ch 2** | `0x09` (Note) | **`LOOP IN`** | Fija punto inicial de bucle manual | **Dividir Loop (`1/2`):** reduce a la mitad |
| **Ch 1 / Ch 2** | `0x0A` (Note) | **`LOOP OUT`** | Fija punto final y activa bucle / Salir | **Duplicar Loop (`2X`):** duplica duración |
| **Ch 1 / Ch 2** | `0x0D` (Note) | **`LOAD`** | Carga la pista seleccionada en el Deck | **Descargar pista (Unload)** |
| **Ch 1 / Ch 2** | `0x00` (Note) | **`PAD MODE: HOT CUE`** | Activa modo Hot Cue (LED fijo) | — |
| **Ch 1 / Ch 2** | `0x01` (Note) | **`PAD MODE: STEMS`** | Activa modo Stems / Roll (LED fijo) | — |
| **Ch 1 / Ch 2** | `0x02` (Note) | **`PAD MODE: FX`** | Activa modo FX (LED parpadeante) | — |
| **Ch 1 / Ch 2** | `0x0F` (Note) | **`PAD MODE: SAMPLER`** | Activa modo Sampler (LED parpadeante) | — |
| **Ch 1 / Ch 2** | `CC 0x00` | **`VOLUME FADER`** | Volumen del canal | — |
| **Ch 1 / Ch 2** | `CC 0x01` | **`FILTER KNOB`** | Filtro Paso Bajo (izq) / Paso Alto (der) | — |
| **Ch 1 / Ch 2** | `CC 0x02` | **`LOW EQ`** | Ecualizador de Graves (Bajos) | — |
| **Ch 1 / Ch 2** | `CC 0x03` | **`MID EQ`** | Ecualizador de Medios (Voces) | — |
| **Ch 1 / Ch 2** | `CC 0x04` | **`HIGH EQ`** | Ecualizador de Agudos (Brillos) | — |
| **Ch 1 / Ch 2** | `CC 0x05` | **`GAIN KNOB`** | Ganancia pre-fader del canal | — |
| **Ch 1 / Ch 2** | `CC 0x08 / 0x28` | **`TEMPO PITCH`** | Fader de velocidad 14-Bit (MSB + LSB) | $\pm 16\%$ calibrado |
| **Ch 1 / Ch 2** | `CC 0x0A / 0x09` | **`JOG ROTATION`** | Scratch (tocado) / Pitch Bend (aro) | **Needle Search:** búsqueda rápida adelante/atrás |
| **Ch 0** | `CC 0x00` | **`CROSSFADER`** | Transición suave Deck A $\leftrightarrow$ Deck B | — |
| **Ch 0** | `CC 0x01 / 0x03` | **`BROWSER ROTARY`** | Subir / Bajar en lista de canciones | — |
| **Ch 0** | `Note 0x00` | **`BROWSER CLICK`** | Carga inteligente en el Deck inactivo | Alternar vista de carpetas |
| **Ch 0** | `Note 0x03 / 0x04`| **`ASSISTANT`** | Cicla niveles de energía IMA (Anillo LED) | — |
| **Ch 0** | `Note 0x02 / 0x05`| **`ASSIST PREP`** | Marca tema preparado para la sesión | — |
| **Ch 0** | `Note 0x0C` | **`🎧 PFL DECK A`** | Preescucha de Deck A en auriculares | — |
| **Ch 0** | `Note 0x0D` | **`🎧 PFL DECK B`** | Preescucha de Deck B en auriculares | — |
| **Ch 0** | `Note 0x0B` | **`🎧 MASTER PFL`** | Envía Master a los auriculares | — |
| **Ch 0** | `Note 0x08` | **`BEATMATCH GUIDE`** | Alterna luces de asistencia de tempo/fase| — |

---

## 🎛️ Guía de Modos de Performance Pads

| Modo | Pad 1 | Pad 2 | Pad 3 | Pad 4 | Acción con `SHIFT` (o Clic Derecho) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`HOT CUE`** | Hot Cue 1 | Hot Cue 2 | Hot Cue 3 | Hot Cue 4 | **Borra el CUE** correspondiente |
| **`STEMS`** | 🎤 Vocales (Mute) | 🎹 Melodía (Mute) | 🎸 Bajos (Mute) | 🥁 Batería (Mute) | **SOLO:** Aísla exclusivamente ese instrumento |
| **`FX`** | ⚡ HPF Build | 🔁 Echo 1/2 Beat | 🚀 Flanger Jet | 🛑 Vinyl Brake | Efecto momentáneo de retorno |
| **`SAMPLER`** | 🎺 Airhorn Drop | 💿 Scratch Vocal | ⚡ Laser Shot | 💣 808 Sub Drop | Disparo de sample con sintetizador Web Audio |

---

## ⚙️ Configuración del Servicio systemd

Para que **DjPaz** arranque automáticamente con el sistema y se mantenga en ejecución:

```bash
# 1. Copiar plantilla de servicio
mkdir -p ~/.config/systemd/user
cp djpaz.service ~/.config/systemd/user/

# 2. Recargar y activar
systemctl --user daemon-reload
systemctl --user enable --now djpaz.service

# 3. Comprobar estado y logs
systemctl --user status djpaz.service
journalctl --user -u djpaz.service -f
```

---

## 📚 Repositorios, Librerías y Estándares Externos

El proyecto **DjPaz** integra y hace uso de los siguientes estándares, herramientas y bibliotecas de código abierto:

1. **[yt-dlp](https://github.com/yt-dlp/yt-dlp):** Motor de descarga y extracción de metadatos de audio de alto rendimiento.
2. **[FFmpeg](https://ffmpeg.org/):** Framework multimedia utilizado para la decodificación, remuestreo a 48.000 Hz y compresión estéreo a 320 kbps.
3. **[PipeWire & WirePlumber](https://pipewire.org/):** Servidor de audio profesional para Linux de baja latencia con enrutamiento dinámico mediante `wpctl` y `pw-link`.
4. **[Web MIDI API (W3C)](https://www.w3.org/TR/webmidi/):** Estándar de comunicación directa por hardware entre el navegador y la controladora MIDI USB sin drivers adicionales.
5. **[Web Audio API (W3C)](https://www.w3.org/TR/webaudio/):** Motor de procesamiento digital de señales (DSP) en tiempo real (`BiquadFilterNode`, `DynamicsCompressorNode`, `ChannelMergerNode`, `ChannelSplitterNode`, `DelayNode`, `OscillatorNode`).
6. **[Google Fonts - Outfit & Orbitron](https://fonts.google.com/):** Tipografías modernas optimizadas para interfaces de usuario y pantallas LCD digitales.
7. **[Hercules DJ Community & Mixxx Controller Mappings](https://mixxx.org/):** Referencias técnicas y especificaciones de ingeniería inversa para la serie Hercules Inpulse 200 / 200 MK2.

---

## ❓ Preguntas Frecuentes y Solución de Problemas

### 1. No se escucha la preescucha en los auriculares o se mezcla con el Master
* Asegúrate de seleccionar como dispositivo de salida en la barra superior: **`DJControl Inpulse 200 Mk2 (Master & CUE)`**.
* La controladora asignará automáticamente:
  * Altavoces principales $\rightarrow$ Conectores RCA traseros.
  * Auriculares $\rightarrow$ Minijack 3.5mm delantero.

### 2. La controladora Hercules no responde al conectarla
* Asegúrate de usar un navegador compatible con Web MIDI (**Google Chrome, Chromium, Brave, Microsoft Edge**).
* Cuando el navegador pregunte: *"¿Deseas permitir que localhost acceda a tus dispositivos MIDI?"*, haz clic en **Permitir**.
* Comprueba que la luz indicadora **`MIDI: Conectada`** aparezca en verde en la esquina superior derecha.

### 3. Error al descargar pistas con yt-dlp
* Asegúrate de tener `ffmpeg` instalado en tu sistema (`sudo apt install ffmpeg` o `brew install ffmpeg`).
* Actualiza yt-dlp a la última versión: `pip3 install --upgrade yt-dlp`.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más información. Desarrollado con ❤️ para la comunidad de DJs y productores musicales.
