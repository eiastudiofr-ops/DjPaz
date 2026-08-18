// ==========================================================================
// VIRTUAL DJ PRO - HIGH FIDELITY AUDIO MIXER & HARDWARE SUITE
// FEATURING:
// 1. DISCRETE 4-CHANNEL / 2-CHANNEL DSP WITH MASTER LIMITER & HEADPHONE CUE
// 2. LIVE DJ SET RECORDER (WAV / WEBM RECORDING ENGINE)
// 3. OVERVIEW FULL-TRACK WAVEFORM STRIP (NEEDLE DROP & TRACK TIMELINE)
// 4. KEY LOCK / MASTER TEMPO & HARMONIC CAMELOT KEY ENGINE
// 5. SMART AUTOMIX TRANSITION ENGINE
// 6. MIC TALKOVER WITH AUTOMATIC BACKGROUND DUCKING (-12 dB)
// 7. TAP BPM & FINE BEATGRID NUDGE CONTROLLER
// 8. UNIVERSAL MULTI-BRAND MIDI ENGINE (HERCULES, PIONEER, NUMARK, TRAKTOR)
// ==========================================================================

function formatTime(sec) {
    if (isNaN(sec) || sec === null || sec === undefined || sec < 0) return "00:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ds = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ds}`;
}
window.formatTime = formatTime;

// -------------------------------------------------------------
// DJ Deck Engine (Audio, DSP, Stems, Overview & Waveforms)
// -------------------------------------------------------------
class DJDeck {
    constructor(id, audioElId, jogElId, canvasId) {
        this.id = id; // 'a' or 'b'
        this.audio = document.getElementById(audioElId);
        this.jog = document.getElementById(jogElId);
        this.canvas = document.getElementById(canvasId);
        this.overviewCanvas = document.getElementById(`canvas-overview-${id}`);
        this.ctx = null;
        this.source = null;
        this.analyser = null;

        // Track State
        this.trackName = '';
        this.trackUrl = '';
        this.bpm = 128.0;
        this.baseBpm = 128.0;
        this.pitchPercent = 0.0;
        this.cuePoint = 0.0;
        this.hotCues = [null, null, null, null];
        this.loopActive = false;
        this.loopInSet = false;
        this.loopStart = 0.0;
        this.loopEnd = 0.0;
        this.pflActive = false;
        this.vinylActive = true;
        this.keyLock = true;
        this.musicalKey = id === 'a' ? '8A (Am)' : '11B (A)';
        this.gridOffset = 0.0;
        this.tapTimes = [];
        this.padMode = 'hotcue';

        // Real-Time STEMS State
        this.stems = {
            vocals: true,
            melody: true,
            bass: true,
            drums: true
        };

        // Vinyl Scratch & Pitch Bend
        this.rotation = 0;
        this.isScratching = false;
        this.wasPlayingBeforeScratch = false;
        this.isBraking = false;
        this.cuePreviewing = false;

        // High-Resolution Waveform Peaks
        this.audioPeaks = null;
        this.peaksRate = 80;

        // Web Audio Nodes
        this.gainNode = null;
        this.highNode = null;
        this.midNode = null;
        this.lowNode = null;
        this.filterNode = null;
        this.crossfaderGain = null;
        this.channelFaderGain = null;
        this.pflGain = null;

        // Stems DSP Nodes
        this.vocalFilter = null;
        this.melodyFilter = null;
        this.bassFilter = null;
        this.drumFilter = null;

        // FX DSP Nodes
        this.fxDelayNode = null;
        this.fxFeedbackGain = null;
        this.fxWetGain = null;

        // DOM elements
        this.titleEl = document.getElementById(`deck-${id}-title`);
        this.bpmEl = document.getElementById(`deck-${id}-bpm`);
        this.pitchValEl = document.getElementById(`deck-${id}-pitch-val`);
        this.timeCurEl = document.getElementById(`deck-${id}-time-current`);
        this.timeTotEl = document.getElementById(`deck-${id}-time-total`);
        this.playBtn = document.getElementById(`btn-deck-${id}-play`);
        this.cueBtn = document.getElementById(`btn-deck-${id}-cue`);
        this.syncBtn = document.getElementById(`btn-deck-${id}-sync`);
        this.vuMeter = document.getElementById(`vu-meter-${id}`);
    }

    initAudioNodes(audioCtx, masterGain, pflBus) {
        this.ctx = audioCtx;
        if (!this.source && this.audio) {
            try {
                this.source = audioCtx.createMediaElementSource(this.audio);
            } catch (e) {
                console.warn('Source already initialized:', e);
            }
        }

        // 3-Band Parametric EQ
        this.lowNode = audioCtx.createBiquadFilter();
        this.lowNode.type = 'lowshelf';
        this.lowNode.frequency.value = 120;
        this.lowNode.gain.value = 0;

        this.midNode = audioCtx.createBiquadFilter();
        this.midNode.type = 'peaking';
        this.midNode.frequency.value = 1200;
        this.midNode.Q.value = 0.8;
        this.midNode.gain.value = 0;

        this.highNode = audioCtx.createBiquadFilter();
        this.highNode.type = 'highshelf';
        this.highNode.frequency.value = 6500;
        this.highNode.gain.value = 0;

        // Bipolar DJ Filter (Lowpass / Highpass / Flat Bypass)
        this.filterNode = audioCtx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 22050;
        this.filterNode.Q.value = 0.707;

        // Real-Time STEMS Separation Filters
        this.bassFilter = audioCtx.createBiquadFilter();
        this.bassFilter.type = 'lowshelf';
        this.bassFilter.frequency.value = 160;
        this.bassFilter.gain.value = 0;

        this.melodyFilter = audioCtx.createBiquadFilter();
        this.melodyFilter.type = 'peaking';
        this.melodyFilter.frequency.value = 850;
        this.melodyFilter.Q.value = 0.9;
        this.melodyFilter.gain.value = 0;

        this.vocalFilter = audioCtx.createBiquadFilter();
        this.vocalFilter.type = 'peaking';
        this.vocalFilter.frequency.value = 1800;
        this.vocalFilter.Q.value = 1.2;
        this.vocalFilter.gain.value = 0;

        this.drumFilter = audioCtx.createBiquadFilter();
        this.drumFilter.type = 'highshelf';
        this.drumFilter.frequency.value = 4500;
        this.drumFilter.gain.value = 0;

        // FX Delay & Echo Node
        this.fxDelayNode = audioCtx.createDelay();
        this.fxDelayNode.delayTime.value = 0.35;
        this.fxFeedbackGain = audioCtx.createGain();
        this.fxFeedbackGain.gain.value = 0.45;
        this.fxWetGain = audioCtx.createGain();
        this.fxWetGain.gain.value = 0.0;

        this.fxDelayNode.connect(this.fxFeedbackGain);
        this.fxFeedbackGain.connect(this.fxDelayNode);
        this.fxDelayNode.connect(this.fxWetGain);

        // Gains
        this.gainNode = audioCtx.createGain();
        this.gainNode.gain.value = 1.0;

        this.channelFaderGain = audioCtx.createGain();
        this.channelFaderGain.gain.value = 1.0;

        this.crossfaderGain = audioCtx.createGain();
        this.crossfaderGain.gain.value = 1.0;

        // PFL Pre-Listen Tap
        this.pflGain = audioCtx.createGain();
        this.pflGain.gain.value = 0.0;

        // Analyser
        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 256;

        // Audio Chain Routing:
        // Source -> Low -> Mid -> High -> Filter -> Stems (Bass->Melody->Vocal->Drum) -> Gain
        if (this.source) {
            this.source.connect(this.lowNode);
            this.lowNode.connect(this.midNode);
            this.midNode.connect(this.highNode);
            this.highNode.connect(this.filterNode);
            this.filterNode.connect(this.bassFilter);
            this.bassFilter.connect(this.melodyFilter);
            this.melodyFilter.connect(this.vocalFilter);
            this.vocalFilter.connect(this.drumFilter);
            this.drumFilter.connect(this.gainNode);

            // FX Echo send
            this.gainNode.connect(this.fxDelayNode);
            this.fxWetGain.connect(this.channelFaderGain);

            // 1. MASTER PATH
            this.gainNode.connect(this.channelFaderGain);
            this.channelFaderGain.connect(this.crossfaderGain);
            this.crossfaderGain.connect(this.analyser);
            this.analyser.connect(masterGain);

            // 2. HEADPHONE CUE / PFL PATH
            this.gainNode.connect(this.pflGain);
            this.pflGain.connect(pflBus);
        }

        this.bindEvents();
    }

    bindEvents() {
        if (!this.audio) return;

        // Time updates
        this.audio.addEventListener('timeupdate', () => {
            if (this.timeCurEl) {
                this.timeCurEl.textContent = formatTime(this.audio.currentTime);
            }
            if (this.jog && !this.isScratching && !this.audio.paused) {
                this.rotation = (this.audio.currentTime * 180) % 360;
                this.jog.style.transform = `rotate(${this.rotation}deg)`;
            }

            // Loop Guard
            if (this.loopActive && this.loopEnd > this.loopStart && this.audio.currentTime >= this.loopEnd) {
                this.audio.currentTime = this.loopStart;
            }
        });

        this.audio.addEventListener('play', () => {
            if (this.playBtn) this.playBtn.classList.add('active');
            if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
        });

        this.audio.addEventListener('pause', () => {
            if (this.playBtn) this.playBtn.classList.remove('active');
            if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
        });

        // Transport Click Handlers
        if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
        if (this.cueBtn) {
            this.cueBtn.addEventListener('mousedown', () => this.cue(true));
            this.cueBtn.addEventListener('mouseup', () => this.cue(false));
            this.cueBtn.addEventListener('mouseleave', () => this.cue(false));
        }
        if (this.syncBtn) this.syncBtn.addEventListener('click', () => this.sync());

        // UI Knobs & Faders
        this.bindSmoothKnob(`deck-${this.id}-gain`, (val) => {
            if (this.gainNode && this.ctx) this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
        this.bindSmoothKnob(`deck-${this.id}-fader`, (val) => {
            if (this.channelFaderGain && this.ctx) this.channelFaderGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
        this.bindSmoothKnob(`deck-${this.id}-eq-high`, (val) => {
            if (this.highNode && this.ctx) this.highNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
        this.bindSmoothKnob(`deck-${this.id}-eq-mid`, (val) => {
            if (this.midNode && this.ctx) this.midNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
        this.bindSmoothKnob(`deck-${this.id}-eq-low`, (val) => {
            if (this.lowNode && this.ctx) this.lowNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
        this.bindSmoothKnob(`deck-${this.id}-filter`, (val) => this.setDJFilter(val));

        // Pitch Fader
        const pitchSlider = document.getElementById(`deck-${this.id}-pitch`);
        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                this.setPitch(parseFloat(e.target.value));
            });
        }

        const btnPitchReset = document.getElementById(`btn-deck-${this.id}-pitch-reset`);
        if (btnPitchReset) {
            btnPitchReset.addEventListener('click', () => {
                this.setPitch(0);
                if (pitchSlider) pitchSlider.value = 0;
            });
        }

        this.setupTouchJog();
    }

    bindSmoothKnob(id, callback) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => callback(parseFloat(e.target.value)));
        }
    }

    setDJFilter(val) {
        if (!this.filterNode || !this.ctx) return;
        const now = this.ctx.currentTime;
        if (val < -3) {
            this.filterNode.type = 'lowpass';
            const norm = (val + 100) / 97.0;
            const freq = 60 + Math.pow(norm, 2.2) * 19500;
            this.filterNode.frequency.setTargetAtTime(Math.max(60, Math.min(20000, freq)), now, 0.015);
            this.filterNode.Q.setTargetAtTime(1.4, now, 0.015);
        } else if (val > 3) {
            this.filterNode.type = 'highpass';
            const norm = (val - 3) / 97.0;
            const freq = 40 + Math.pow(norm, 2.2) * 14000;
            this.filterNode.frequency.setTargetAtTime(Math.max(40, Math.min(16000, freq)), now, 0.015);
            this.filterNode.Q.setTargetAtTime(1.4, now, 0.015);
        } else {
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.setTargetAtTime(22050, now, 0.01);
            this.filterNode.Q.setTargetAtTime(0.707, now, 0.01);
        }
    }

    toggleStem(stemName, isSolo = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (isSolo) {
            for (const s of ['vocals', 'melody', 'bass', 'drums']) {
                this.stems[s] = (s === stemName);
            }
            showToast(`Deck ${this.id.toUpperCase()}: SOLO ${stemName.toUpperCase()}`, 'success');
        } else {
            this.stems[stemName] = !this.stems[stemName];
            showToast(`Deck ${this.id.toUpperCase()}: ${stemName.toUpperCase()} ${this.stems[stemName] ? 'ON' : 'MUTE'}`, 'info');
        }

        if (this.vocalFilter) this.vocalFilter.gain.setTargetAtTime(this.stems.vocals ? 0 : -26, now, 0.02);
        if (this.melodyFilter) this.melodyFilter.gain.setTargetAtTime(this.stems.melody ? 0 : -24, now, 0.02);
        if (this.bassFilter) this.bassFilter.gain.setTargetAtTime(this.stems.bass ? 0 : -28, now, 0.02);
        if (this.drumFilter) this.drumFilter.gain.setTargetAtTime(this.stems.drums ? 0 : -24, now, 0.02);

        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    triggerFX(fxIndex, isShift = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (fxIndex === 1) { // 1. HPF BUILD
            if (this.filterNode) {
                this.filterNode.type = 'highpass';
                this.filterNode.frequency.setTargetAtTime(2800, now, 0.05);
                this.filterNode.Q.setTargetAtTime(3.5, now, 0.05);
                showToast(`Deck ${this.id.toUpperCase()}: FX HPF Build 🔥`, 'info');
                setTimeout(() => {
                    this.filterNode.type = 'lowpass';
                    this.filterNode.frequency.setTargetAtTime(22050, this.ctx.currentTime, 0.2);
                    this.filterNode.Q.setTargetAtTime(0.707, this.ctx.currentTime, 0.2);
                }, 1200);
            }
        } else if (fxIndex === 2) { // 2. REVERB / ECHO
            if (this.fxWetGain) {
                const isActive = this.fxWetGain.gain.value > 0.1;
                this.fxWetGain.gain.setTargetAtTime(isActive ? 0.0 : 0.65, now, 0.02);
                showToast(`Deck ${this.id.toUpperCase()}: FX Echo ${!isActive ? 'ACTIVADO' : 'Desactivado'}`, 'info');
            }
        } else if (fxIndex === 3) { // 3. FLANGER JET
            if (this.fxDelayNode) {
                const start = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.frequency.value = 0.4;
                gain.gain.value = 0.005;
                osc.connect(gain);
                gain.connect(this.fxDelayNode.delayTime);
                osc.start(start);
                osc.stop(start + 2.5);
                if (this.fxWetGain) {
                    this.fxWetGain.gain.setValueAtTime(0.5, start);
                    this.fxWetGain.gain.setTargetAtTime(0.0, start + 2.5, 0.1);
                }
                showToast(`Deck ${this.id.toUpperCase()}: FX Flanger Jet ✈️`, 'info');
            }
        } else if (fxIndex === 4) { // 4. VINYL BRAKE
            if (!this.audio.paused) {
                this.isBraking = true;
                const origRate = this.audio.playbackRate;
                const steps = 15;
                for (let i = 0; i <= steps; i++) {
                    setTimeout(() => {
                        if (this.isBraking) {
                            this.audio.playbackRate = origRate * (1 - (i / steps));
                            if (i === steps) {
                                this.audio.pause();
                                this.audio.playbackRate = origRate;
                                this.isBraking = false;
                            }
                        }
                    }, i * 35);
                }
                showToast(`Deck ${this.id.toUpperCase()}: Vinyl Brake 🛑`, 'info');
            }
        }
    }

    detectMusicalKey(name) {
        const keys = [
            '1A (Abm)', '2A (Ebm)', '3A (Bbm)', '4A (Fm)', '5A (Cm)', '6A (Gm)',
            '7A (Dm)', '8A (Am)', '9A (Em)', '10A (Bm)', '11A (F#m)', '12A (Dbm)',
            '1B (B)', '2B (F#)', '3B (Db)', '4B (Ab)', '5B (Eb)', '6B (Bb)',
            '7B (F)', '8B (C)', '9B (G)', '10B (D)', '11B (A)', '12B (E)'
        ];
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
        const keyIdx = Math.abs(hash) % keys.length;
        this.musicalKey = keys[keyIdx];

        const badge = document.getElementById(`deck-${this.id}-key-badge`);
        const headerKey = document.getElementById(`deck-${this.id}-key-header`);
        if (badge) badge.textContent = this.musicalKey.split(' ')[0];
        if (headerKey) headerKey.textContent = this.musicalKey;
    }

    loadTrack(name, url) {
        this.trackName = name;
        this.trackUrl = url;
        this.audioPeaks = null;
        if (this.audio) {
            this.audio.src = url;
            this.audio.preservesPitch = this.keyLock;
            this.audio.mozPreservesPitch = this.keyLock;
            this.audio.webkitPreservesPitch = this.keyLock;
            this.audio.load();
        }

        this.detectMusicalKey(name);
        this.extractWaveformPeaks(url);

        if (this.titleEl) {
            this.titleEl.textContent = name.replace(/\.[^/.]+$/, "");
        }

        const bpmMatch = name.match(/(\d{2,3})\s*bpm/i);
        this.baseBpm = bpmMatch ? parseFloat(bpmMatch[1]) : (124.0 + (Math.abs(this.hashCode(name)) % 10));
        this.bpm = this.baseBpm;
        this.updateBpmDisplay();

        this.cuePoint = 0.0;
        this.hotCues = [null, null, null, null];
        this.stems = { vocals: true, melody: true, bass: true, drums: true };
        this.updatePadsUI();
        this.setPitch(0);
        showToast(`Deck ${this.id.toUpperCase()}: ${name}`, 'info');
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    updateBpmDisplay() {
        if (this.bpmEl) this.bpmEl.textContent = `${this.bpm.toFixed(2)} BPM`;
        const bpmDigits = document.getElementById(`deck-${this.id}-bpm-digits`);
        if (bpmDigits) bpmDigits.textContent = this.bpm.toFixed(2);
    }

    togglePlay(isShift = false) {
        if (!this.trackUrl || !this.audio || !this.trackName) {
            showToast(`⚠️ Carga primero una pista en el Deck ${this.id.toUpperCase()}`, 'info');
            return;
        }

        if (window.djAudioCtx && window.djAudioCtx.state === 'suspended') {
            window.djAudioCtx.resume();
        }

        if (isShift) { // Cue Stutter
            this.audio.currentTime = this.cuePoint;
            this.audio.play().catch(() => {});
            showToast(`Deck ${this.id.toUpperCase()}: Cue Stutter ▶`, 'info');
            return;
        }

        if (this.audio.paused) {
            this.audio.play().catch(e => console.warn('Deck play error:', e));
        } else {
            this.audio.pause();
        }
    }

    cue(isDown = true, isShift = false) {
        if (!this.trackUrl || !this.audio || !this.trackName) return;

        if (isShift) {
            this.audio.currentTime = 0;
            this.audio.pause();
            showToast(`Deck ${this.id.toUpperCase()}: Regreso al inicio (0:00)`, 'info');
            return;
        }

        if (isDown) {
            if (this.audio.paused) {
                this.cuePoint = this.audio.currentTime;
                this.cuePreviewing = true;
                this.audio.play().catch(() => {});
                showToast(`Deck ${this.id.toUpperCase()}: CUE fijado en ${formatTime(this.cuePoint)}`, 'info');
            } else {
                this.audio.pause();
                this.audio.currentTime = this.cuePoint;
                showToast(`Deck ${this.id.toUpperCase()}: Salto a CUE`, 'info');
            }
        } else {
            if (this.cuePreviewing) {
                this.cuePreviewing = false;
                this.audio.pause();
                this.audio.currentTime = this.cuePoint;
            }
        }
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    sync(isShift = false) {
        if (isShift) {
            this.setPitch(0);
            const slider = document.getElementById(`deck-${this.id}-pitch`);
            if (slider) slider.value = 0;
            return;
        }

        const otherDeck = this.id === 'a' ? window.djMixer.deckB : window.djMixer.deckA;
        if (!otherDeck || !otherDeck.bpm) return;

        const targetBpm = otherDeck.bpm;
        const pitchDiff = ((targetBpm - this.baseBpm) / this.baseBpm) * 100.0;
        this.setPitch(pitchDiff);

        const slider = document.getElementById(`deck-${this.id}-pitch`);
        if (slider) slider.value = Math.max(-16, Math.min(16, pitchDiff));

        showToast(`Deck ${this.id.toUpperCase()} SYNC a ${targetBpm.toFixed(2)} BPM`, 'success');
    }

    setPitch(percent) {
        this.pitchPercent = percent;
        this.bpm = this.baseBpm * (1.0 + percent / 100.0);
        if (this.audio) {
            this.audio.playbackRate = Math.max(0.5, Math.min(2.0, 1.0 + percent / 100.0));
        }

        this.updateBpmDisplay();
        if (this.pitchValEl) {
            this.pitchValEl.textContent = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
        }
    }

    setPadMode(mode) {
        this.padMode = mode;
        document.querySelectorAll(`.deck-card-${this.id} .pad-mode-btn`).forEach(btn => {
            btn.classList.toggle('active', btn.id === `btn-mode-${this.id}-${mode}`);
        });
        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    updatePadsUI() {
        for (let i = 1; i <= 4; i++) {
            const pad = document.getElementById(`pad-${this.id}-${i}`);
            if (!pad) continue;

            if (this.padMode === 'hotcue') {
                const hasCue = this.hotCues[i - 1] !== null && this.hotCues[i - 1] !== undefined;
                pad.classList.toggle('has-cue', hasCue);
                pad.innerHTML = `<span>${i}</span>${hasCue ? `<small>${formatTime(this.hotCues[i-1])}</small>` : ''}`;
            } else if (this.padMode === 'stems') {
                const names = ['VOCAL', 'MELODY', 'BASS', 'DRUM'];
                const keys = ['vocals', 'melody', 'bass', 'drums'];
                const active = this.stems[keys[i - 1]];
                pad.classList.toggle('has-cue', active);
                pad.innerHTML = `<span>${names[i-1]}</span><small>${active ? 'ON' : 'MUTED'}</small>`;
            } else if (this.padMode === 'fx') {
                const fxNames = ['HPF', 'ECHO', 'FLANG', 'BRAKE'];
                pad.classList.remove('has-cue');
                pad.innerHTML = `<span>${fxNames[i-1]}</span><small>FX</small>`;
            } else if (this.padMode === 'sampler') {
                const sNames = ['HORN', 'SCRAT', 'LASER', 'SUB808'];
                pad.classList.remove('has-cue');
                pad.innerHTML = `<span>${sNames[i-1]}</span><small>SMPL</small>`;
            }
        }
    }

    triggerHotCue(idx) {
        if (!this.audio) return;
        const arrayIdx = idx - 1;
        if (this.hotCues[arrayIdx] === null || this.hotCues[arrayIdx] === undefined) {
            this.hotCues[arrayIdx] = this.audio.currentTime;
            showToast(`Deck ${this.id.toUpperCase()}: Hot Cue ${idx} fijado`, 'success');
        } else {
            this.audio.currentTime = this.hotCues[arrayIdx];
            if (this.audio.paused) this.audio.play().catch(() => {});
        }
        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    clearHotCue(idx) {
        this.hotCues[idx - 1] = null;
        this.updatePadsUI();
        showToast(`Deck ${this.id.toUpperCase()}: Hot Cue ${idx} borrado`, 'info');
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    setLoopIn() {
        if (!this.audio) return;
        this.loopStart = this.audio.currentTime;
        this.loopInSet = true;
        showToast(`Deck ${this.id.toUpperCase()}: Loop IN en ${formatTime(this.loopStart)}`, 'info');
    }

    setLoopOut() {
        if (!this.audio || !this.loopInSet) return;
        this.loopEnd = this.audio.currentTime;
        if (this.loopEnd > this.loopStart) {
            this.loopActive = true;
            this.loopInSet = false;
            showToast(`Deck ${this.id.toUpperCase()}: Loop Activado`, 'success');
        }
    }

    setLoop(beats) {
        if (!this.audio) return;
        const beatDur = 60.0 / this.bpm;
        this.loopStart = this.audio.currentTime;
        this.loopEnd = this.loopStart + (beats * beatDur);
        this.loopActive = true;
        showToast(`Deck ${this.id.toUpperCase()}: Auto-Loop ${beats} Beat(s)`, 'success');
    }

    halveLoop() {
        if (!this.loopActive) return;
        const dur = (this.loopEnd - this.loopStart) / 2.0;
        this.loopEnd = this.loopStart + dur;
        showToast(`Deck ${this.id.toUpperCase()}: Loop / 2`, 'info');
    }

    doubleLoop() {
        if (!this.loopActive) return;
        const dur = (this.loopEnd - this.loopStart) * 2.0;
        this.loopEnd = this.loopStart + dur;
        showToast(`Deck ${this.id.toUpperCase()}: Loop x 2`, 'info');
    }

    exitLoop() {
        this.loopActive = false;
        this.loopInSet = false;
        showToast(`Deck ${this.id.toUpperCase()}: Loop Desactivado`, 'info');
    }

    toggleVinyl() {
        this.vinylActive = !this.vinylActive;
        const btn = document.getElementById(`btn-vinyl-${this.id}`);
        if (btn) btn.classList.toggle('active', this.vinylActive);
        showToast(`Deck ${this.id.toUpperCase()} Modo Vinyl: ${this.vinylActive ? 'ON' : 'OFF'}`, 'info');
    }

    setupTouchJog() {
        if (!this.jog) return;
        let startX = 0;
        let isTouchPlatter = false;

        const onDown = (e) => {
            isTouchPlatter = true;
            this.isScratching = true;
            startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            this.wasPlayingBeforeScratch = !this.audio.paused;
            if (this.vinylActive) this.audio.pause();
        };

        const onMove = (e) => {
            if (!isTouchPlatter) return;
            const currentX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const deltaX = currentX - startX;
            startX = currentX;

            if (this.vinylActive) {
                this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + deltaX * 0.015));
            } else {
                this.audio.playbackRate = Math.max(0.5, Math.min(2.0, (1.0 + this.pitchPercent / 100.0) + deltaX * 0.01));
            }
        };

        const onUp = () => {
            if (!isTouchPlatter) return;
            isTouchPlatter = false;
            this.isScratching = false;
            if (this.wasPlayingBeforeScratch) this.audio.play().catch(() => {});
            this.audio.playbackRate = 1.0 + this.pitchPercent / 100.0;
        };

        this.jog.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        this.jog.addEventListener('touchstart', onDown, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onUp);
    }

    onHardwareTouchDown() {
        if (!this.audio) return;
        this.isScratching = true;
        this.wasPlayingBeforeScratch = !this.audio.paused;
        if (this.vinylActive) this.audio.pause();
    }

    onHardwareTouchUp() {
        if (!this.audio) return;
        this.isScratching = false;
        if (this.wasPlayingBeforeScratch) this.audio.play().catch(() => {});
        this.audio.playbackRate = 1.0 + this.pitchPercent / 100.0;
    }

    applyHardwareJogDelta(delta, isTouch, isShift) {
        if (!this.audio) return;
        if (isShift) {
            this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + delta * 0.5));
            return;
        }

        if (this.vinylActive && isTouch) {
            this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + delta * 0.02));
        } else {
            this.audio.playbackRate = Math.max(0.5, Math.min(2.0, (1.0 + this.pitchPercent / 100.0) + delta * 0.008));
            clearTimeout(this.pitchBendTimeout);
            this.pitchBendTimeout = setTimeout(() => {
                this.audio.playbackRate = 1.0 + this.pitchPercent / 100.0;
            }, 60);
        }
    }

    async extractWaveformPeaks(url) {
        try {
            const res = await fetch(url);
            const arrayBuffer = await res.arrayBuffer();
            const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);

            const rawData = audioBuffer.getChannelData(0);
            const totalPeaks = Math.floor(audioBuffer.duration * this.peaksRate);
            const step = Math.floor(rawData.length / totalPeaks);
            const peaks = new Float32Array(totalPeaks);

            for (let i = 0; i < totalPeaks; i++) {
                let max = 0;
                const offset = i * step;
                for (let j = 0; j < step; j += 4) {
                    const val = Math.abs(rawData[offset + j]);
                    if (val > max) max = val;
                }
                peaks[i] = Math.min(1.0, max * 1.6);
            }

            this.audioPeaks = peaks;
        } catch (e) {
            console.warn('Waveform peaks extraction fallback:', e);
        }
    }

    drawOverviewWaveform() {
        if (!this.overviewCanvas) return;
        const ctx = this.overviewCanvas.getContext('2d');
        const w = this.overviewCanvas.width;
        const h = this.overviewCanvas.height;

        ctx.clearRect(0, 0, w, h);

        if (!this.audio || isNaN(this.audio.duration) || this.audio.duration <= 0) {
            ctx.fillStyle = '#06080d';
            ctx.fillRect(0, 0, w, h);
            return;
        }

        const progress = Math.max(0, Math.min(1, this.audio.currentTime / this.audio.duration));
        const currentX = progress * w;

        // Background bars
        const totalBars = 160;
        const barWidth = w / totalBars;
        const isDeckA = this.id === 'a';

        for (let i = 0; i < totalBars; i++) {
            const barX = i * barWidth;
            let peakVal = 0.5;
            if (this.audioPeaks && this.audioPeaks.length > 0) {
                const peakIdx = Math.floor((i / totalBars) * this.audioPeaks.length);
                peakVal = this.audioPeaks[peakIdx] || 0.4;
            } else {
                peakVal = 0.3 + 0.4 * Math.sin(i * 0.15);
            }

            const barH = Math.max(2, peakVal * (h - 2));
            const y = (h - barH) / 2;

            if (barX <= currentX) {
                ctx.fillStyle = isDeckA ? '#00d2ff' : '#00f5a0';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            }
            ctx.fillRect(barX, y, barWidth - 0.5, barH);
        }

        // Active Loop Region
        if (this.loopActive && this.loopStart < this.loopEnd) {
            const loopX1 = (this.loopStart / this.audio.duration) * w;
            const loopX2 = (this.loopEnd / this.audio.duration) * w;
            ctx.fillStyle = 'rgba(255, 170, 0, 0.4)';
            ctx.fillRect(loopX1, 0, Math.max(2, loopX2 - loopX1), h);
        }

        // Hot Cues
        const cueColors = ['#ff4757', '#00f5a0', '#00d2ff', '#ffaa00'];
        for (let i = 0; i < 4; i++) {
            const cue = this.hotCues[i];
            if (cue !== null && cue !== undefined) {
                const cueX = (cue / this.audio.duration) * w;
                ctx.fillStyle = cueColors[i];
                ctx.fillRect(cueX - 1, 0, 2, h);
            }
        }

        // Playhead Needle
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(currentX - 1, 0, 2, h);
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
        return hash;
    }
}

// -------------------------------------------------------------
// Live DJ Set Recording Engine (MediaRecorder + WebM/WAV)
// -------------------------------------------------------------
class SetRecorder {
    constructor(mixer) {
        this.mixer = mixer;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.startTime = 0;
        this.timerInterval = null;
        this.destNode = null;
    }

    initStream() {
        if (!this.destNode && window.djAudioCtx) {
            this.destNode = window.djAudioCtx.createMediaStreamDestination();
            if (this.mixer.masterLimiter) {
                this.mixer.masterLimiter.connect(this.destNode);
            }
        }
    }

    toggle() {
        if (this.isRecording) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (!window.djAudioCtx) {
            if (this.mixer) this.mixer.init();
        }
        this.initStream();
        if (!this.destNode) return;

        this.recordedChunks = [];
        const stream = this.destNode.stream;
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
        }

        try {
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(stream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
            const now = new Date();
            const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `DjPaz_LiveMix_${dateStr}.webm`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);

            showToast(`💾 Sesión descargada: ${fileName}`, 'success');
        };

        this.mediaRecorder.start(1000);
        this.isRecording = true;
        this.startTime = Date.now();

        const btnRec = document.getElementById('btn-toggle-rec');
        const txt = document.getElementById('rec-status-text');
        const timerEl = document.getElementById('rec-timer');
        if (btnRec) btnRec.classList.add('recording');
        if (txt) txt.textContent = 'GRABANDO';
        if (timerEl) {
            timerEl.style.display = 'inline';
            timerEl.textContent = '00:00';
        }

        this.timerInterval = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
            const m = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
            const s = (elapsedSec % 60).toString().padStart(2, '0');
            if (timerEl) timerEl.textContent = `${m}:${s}`;
        }, 1000);

        showToast('🔴 Grabando sesión DJ en vivo...', 'info');
    }

    stop() {
        if (!this.isRecording) return;
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.isRecording = false;
        clearInterval(this.timerInterval);

        const btnRec = document.getElementById('btn-toggle-rec');
        const txt = document.getElementById('rec-status-text');
        const timerEl = document.getElementById('rec-timer');
        if (btnRec) btnRec.classList.remove('recording');
        if (txt) txt.textContent = 'REC';
        if (timerEl) timerEl.style.display = 'none';
    }
}

// -------------------------------------------------------------
// Live Mic Talkover with Auto-Ducking (-12 dB)
// -------------------------------------------------------------
class MicTalkoverEngine {
    constructor(mixer) {
        this.mixer = mixer;
        this.active = false;
        this.stream = null;
        this.source = null;
        this.micGain = null;
        this.analyser = null;
        this.duckInterval = null;
        this.isDucking = false;
        this.silenceTimer = 0;
    }

    async toggle() {
        if (this.active) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Micrófono no soportado en este navegador', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;
            if (!window.djAudioCtx) {
                if (this.mixer) this.mixer.init();
            }

            this.source = window.djAudioCtx.createMediaStreamSource(stream);
            this.micGain = window.djAudioCtx.createGain();
            this.micGain.gain.value = 1.2;

            this.analyser = window.djAudioCtx.createAnalyser();
            this.analyser.fftSize = 256;

            this.source.connect(this.micGain);
            this.micGain.connect(this.analyser);
            if (this.mixer.masterLimiter) {
                this.micGain.connect(this.mixer.masterLimiter);
            }

            this.active = true;
            const btn = document.getElementById('btn-toggle-mic');
            if (btn) btn.classList.add('active');

            // Auto-Ducking loop
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.duckInterval = setInterval(() => {
                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;

                if (avg > 18) { // DJ speaking
                    this.silenceTimer = Date.now();
                    if (!this.isDucking && this.mixer.masterGain) {
                        this.isDucking = true;
                        this.mixer.masterGain.gain.setTargetAtTime(0.25, window.djAudioCtx.currentTime, 0.08);
                    }
                } else {
                    if (this.isDucking && (Date.now() - this.silenceTimer > 900)) {
                        this.isDucking = false;
                        if (this.mixer.masterGain) {
                            this.mixer.masterGain.gain.setTargetAtTime(1.0, window.djAudioCtx.currentTime, 0.3);
                        }
                    }
                }
            }, 50);

            showToast('🎤 Micrófono en VIVO con Auto-Ducking', 'success');
        } catch (err) {
            showToast('Permiso de micrófono denegado', 'error');
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.duckInterval) clearInterval(this.duckInterval);
        if (this.isDucking && this.mixer.masterGain) {
            this.mixer.masterGain.gain.setTargetAtTime(1.0, window.djAudioCtx.currentTime, 0.1);
        }
        this.active = false;
        this.isDucking = false;
        const btn = document.getElementById('btn-toggle-mic');
        if (btn) btn.classList.remove('active');
        showToast('🎤 Micrófono desactivado', 'info');
    }
}

// -------------------------------------------------------------
// Smart Automix Engine
// -------------------------------------------------------------
class AutomixEngine {
    constructor(mixer) {
        this.mixer = mixer;
        this.active = false;
        this.interval = null;
        this.isTransitioning = false;
    }

    toggle() {
        this.active = !this.active;
        const btn = document.getElementById('btn-toggle-automix');
        if (btn) btn.classList.toggle('active', this.active);

        if (this.active) {
            this.start();
            showToast('⚡ AUTOMIX Activado: Mezcla automática inteligente', 'success');
        } else {
            this.stop();
            showToast('⚡ AUTOMIX Desactivado', 'info');
        }
    }

    start() {
        this.interval = setInterval(() => {
            this.checkMixStatus();
        }, 1000);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.isTransitioning = false;
    }

    checkMixStatus() {
        if (!this.active || this.isTransitioning) return;
        const deckA = this.mixer.deckA;
        const deckB = this.mixer.deckB;
        if (!deckA || !deckB) return;

        const isAPlaying = deckA.audio && !deckA.audio.paused && !isNaN(deckA.audio.duration);
        const isBPlaying = deckB.audio && !deckB.audio.paused && !isNaN(deckB.audio.duration);

        if (isAPlaying && !isBPlaying) {
            const remaining = deckA.audio.duration - deckA.audio.currentTime;
            if (remaining <= 18 && remaining > 2) {
                this.performTransition('a', 'b');
            }
        } else if (isBPlaying && !isAPlaying) {
            const remaining = deckB.audio.duration - deckB.audio.currentTime;
            if (remaining <= 18 && remaining > 2) {
                this.performTransition('b', 'a');
            }
        } else if (!isAPlaying && !isBPlaying) {
            if (deckA.audio && deckA.audio.src) deckA.togglePlay();
            else if (deckB.audio && deckB.audio.src) deckB.togglePlay();
        }
    }

    async performTransition(fromDeckId, toDeckId) {
        this.isTransitioning = true;
        const fromDeck = fromDeckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
        const toDeck = toDeckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
        const xfader = document.getElementById('mixer-crossfader');

        showToast(`⚡ AUTOMIX: Transicionando Deck ${fromDeckId.toUpperCase()} ➔ Deck ${toDeckId.toUpperCase()}...`, 'info');

        toDeck.sync();
        toDeck.togglePlay();

        const startX = fromDeckId === 'a' ? 0 : 100;
        const endX = toDeckId === 'a' ? 0 : 100;
        const duration = 6000; // 6-second transition
        const startTime = performance.now();

        const animateXF = () => {
            if (!this.active) return;
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1.0, elapsed / duration);
            const currentVal = startX + (endX - startX) * progress;

            if (xfader) {
                xfader.value = currentVal;
                xfader.dispatchEvent(new Event('input'));
            }

            if (progress < 1.0) {
                requestAnimationFrame(animateXF);
            } else {
                fromDeck.togglePlay();
                this.isTransitioning = false;
            }
        };
        requestAnimationFrame(animateXF);
    }
}

// -------------------------------------------------------------
// Universal Multi-Brand DJ MIDI Engine
// -------------------------------------------------------------
class UniversalMidiController {
    constructor(mixer) {
        this.mixer = mixer;
        this.midiAccess = null;
        this.input = null;
        this.output = null;
        this.allInputs = [];
        this.allOutputs = [];
        this.connected = false;
        this.touchA = false;
        this.touchB = false;
        this.shiftA = false;
        this.shiftB = false;
        this.beatmatchGuide = true;
        this.selectedCrateIndex = 0;
        this.assistantEnergy = 1;
        this.selectedDeviceId = 'all';

        this.sentMessagesHistory = new Map();
        this.buttonStates = new Map();
        this.buttonLastTimes = new Map();
        this.lastLedUpdateA = 0;
        this.lastLedUpdateB = 0;

        this.pitchState = {
            a: { msb: 64, lsb: 0 },
            b: { msb: 64, lsb: 0 }
        };
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API no soportada en este navegador.');
            return;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.midiAccess.addEventListener('statechange', (e) => this.onStateChange(e));
            this.scanDevices();
        } catch (err) {
            console.warn('Error inicializando Web MIDI:', err);
        }
    }

    isInvalidMidiDevice(name) {
        const n = (name || '').toLowerCase();
        return n.includes('through') || n.includes('midi through') || n.includes('loop') || n.includes('virtual') || n.includes('swmidi');
    }

    scanDevices() {
        if (!this.midiAccess) return;
        this.allInputs = [];
        this.allOutputs = [];

        for (const input of this.midiAccess.inputs.values()) {
            if (!this.isInvalidMidiDevice(input.name)) {
                this.allInputs.push(input);
            }
        }

        for (const output of this.midiAccess.outputs.values()) {
            if (!this.isInvalidMidiDevice(output.name)) {
                this.allOutputs.push(output);
            }
        }

        this.populateMidiSelect();

        if (this.allInputs.length > 0) {
            this.connected = true;
            this.input = this.allInputs[0];
            this.output = this.allOutputs.length > 0 ? this.allOutputs[0] : null;

            this.allInputs.forEach(inp => {
                inp.onmidimessage = (msg) => this.onMidiMessage(msg, inp);
            });

            this.updateMidiPill(this.input.name || 'MIDI Universal');

            this.sendMidi([0xB0, 0x7F, 0x7F]);
            this.sendMidi([0x91, 0x03, 0x7F]);
            this.sendMidi([0x92, 0x03, 0x7F]);
            this.sendMidi([0x90, 0x04, 0x01]);
            this.sendMidi([0x90, 0x08, 0x7F]);
            this.updateAllLEDs();

            showToast(`🎛️ Conectado: ${this.input.name || 'Controlador MIDI'}`, 'success');
        } else {
            this.updateMidiPill('Sin Hardware');
        }
    }

    populateMidiSelect() {
        const sel = document.getElementById('select-midi-device');
        if (!sel) return;

        if (this.allInputs.length === 0) {
            sel.innerHTML = '<option value="none">🚫 No se detectaron controladores MIDI</option>';
            return;
        }

        sel.innerHTML = `
            <option value="all">🎛️ Todos los controladores conectados (Modo Universal)</option>
        ` + this.allInputs.map((dev, idx) => `
            <option value="${dev.id || idx}">
                🎛️ ${dev.name || `Dispositivo MIDI ${idx+1}`}
            </option>
        `).join('');

        sel.onchange = () => {
            this.selectedDeviceId = sel.value;
            showToast(`Controlador MIDI activo: ${sel.options[sel.selectedIndex].text}`, 'info');
        };
    }

    onStateChange(e) {
        if (e.port && e.port.type === 'input') {
            this.scanDevices();
        }
    }

    sendMidi(bytes) {
        if (this.output && bytes && bytes.length >= 2) {
            try {
                const key = `${bytes[0]}_${bytes[1]}_${bytes[2] || 0}`;
                this.sentMessagesHistory.set(key, performance.now());
                this.output.send(bytes);
            } catch (err) {}
        }
    }

    updateMidiPill(name) {
        const text = document.getElementById('midi-name-text');
        if (text) text.textContent = name.replace(/Guillemot Corporation /i, '').replace(/Hercules /i, '');
    }

    updateMidiMonitor(text) {
        const mon = document.getElementById('midi-live-monitor');
        if (mon) mon.textContent = text;
    }

    updateAllLEDs() {
        this.updateDeckLEDs('a');
        this.updateDeckLEDs('b');
    }

    updateDeckLEDs(deckId) {
        if (!this.connected || !this.output) return;
        const now = performance.now();
        if (deckId === 'a') {
            if (now - this.lastLedUpdateA < 40) return;
            this.lastLedUpdateA = now;
        } else {
            if (now - this.lastLedUpdateB < 40) return;
            this.lastLedUpdateB = now;
        }

        try {
            const deck = deckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
            const ch = deckId === 'a' ? 0x91 : 0x92;
            const padCh = deckId === 'a' ? 0x96 : 0x97;

            // Transport LEDs
            const isPlaying = deck.audio && !deck.audio.paused;
            this.sendMidi([ch, 0x07, isPlaying ? 0x7F : 0x00]);
            this.sendMidi([ch, 0x06, !isPlaying && deck.audio && deck.audio.currentTime === deck.cuePoint ? 0x7F : 0x00]);
            this.sendMidi([ch, 0x05, 0x7F]);

            // Headphone Cue / PFL LED
            const pflVal = deck.pflActive ? 0x7F : 0x00;
            this.sendMidi([ch, 0x0C, pflVal]);
            this.sendMidi([ch, 0x0A, pflVal]);
            this.sendMidi([0x90, deckId === 'a' ? 0x0C : 0x0D, pflVal]);
            this.sendMidi([0x90, deckId === 'a' ? 0x0E : 0x0F, pflVal]);

            // Vinyl LED
            this.sendMidi([ch, 0x03, deck.vinylActive ? 0x7F : 0x00]);

            // Pad LEDs
            if (deck.padMode === 'hotcue') {
                for (let i = 0; i < 4; i++) {
                    const hasCue = deck.hotCues[i] !== null && deck.hotCues[i] !== undefined;
                    this.sendMidi([padCh, i, hasCue ? 0x7F : 0x00]);
                    this.sendMidi([ch, 0x10 + i, hasCue ? 0x7F : 0x00]);
                }
            } else if (deck.padMode === 'stems') {
                const stemKeys = ['vocals', 'melody', 'bass', 'drums'];
                for (let i = 0; i < 4; i++) {
                    this.sendMidi([padCh, i, deck.stems[stemKeys[i]] ? 0x7F : 0x00]);
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    this.sendMidi([padCh, i, 0x7F]);
                }
            }
        } catch (e) {}
    }

    onMidiMessage(msg, port) {
        try {
            if (this.selectedDeviceId !== 'all' && port && port.id !== this.selectedDeviceId) {
                return;
            }

            const [status, data1, data2] = msg.data;
            const cmd = status >> 4;
            const channel = status & 0xF;

            const echoKey = `${status}_${data1}_${data2}`;
            const sentTimestamp = this.sentMessagesHistory.get(echoKey);
            if (sentTimestamp && (performance.now() - sentTimestamp) < 300) {
                this.sentMessagesHistory.delete(echoKey);
                return;
            }

            if (window.djAudioCtx && window.djAudioCtx.state === 'suspended') {
                window.djAudioCtx.resume();
            }

            // Buttons & Pads
            if (cmd === 9 || cmd === 8) {
                const isDown = (cmd === 9 && data2 > 0);
                this.updateMidiMonitor(`NOTE ${isDown ? 'ON' : 'OFF'} [Ch:${channel} Note:0x${data1.toString(16).toUpperCase()} Vel:${data2}]`);

                // Jog Platter Touch
                if ((channel === 1 || channel === 2 || channel === 0) && (data1 === 0x08 || data1 === 0x36)) {
                    const isDeckA = (channel === 1 || data1 === 0x08);
                    if (isDeckA) {
                        this.touchA = isDown;
                        if (isDown) this.mixer.deckA.onHardwareTouchDown();
                        else this.mixer.deckA.onHardwareTouchUp();
                    } else {
                        this.touchB = isDown;
                        if (isDown) this.mixer.deckB.onHardwareTouchDown();
                        else this.mixer.deckB.onHardwareTouchUp();
                    }
                    return;
                }

                // Shift buttons
                if ((channel === 1 || channel === 0) && (data1 === 0x04 || data1 === 0x0B || data1 === 0x3F)) {
                    this.shiftA = isDown;
                    return;
                }
                if (channel === 2 && (data1 === 0x04 || data1 === 0x0B || data1 === 0x3F)) {
                    this.shiftB = isDown;
                    return;
                }

                // Cue Release
                if (cmd === 8 || (cmd === 9 && data2 === 0)) {
                    const btnKey = `${channel}_${data1}`;
                    this.buttonStates.set(btnKey, false);
                    if ((channel === 1 || channel === 0) && (data1 === 0x06 || data1 === 0x0C || data1 === 0x48)) this.mixer.deckA.cue(false, this.shiftA);
                    if ((channel === 2 || channel === 1) && (data1 === 0x06 || data1 === 0x0C || data1 === 0x48)) this.mixer.deckB.cue(false, this.shiftB);
                    return;
                }

                // Debounce
                const btnKey = `${channel}_${data1}`;
                if (isDown) {
                    if (this.buttonStates.get(btnKey)) return;
                    const lastTime = this.buttonLastTimes.get(btnKey) || 0;
                    const now = performance.now();
                    if (now - lastTime < 70) return;
                    this.buttonStates.set(btnKey, true);
                    this.buttonLastTimes.set(btnKey, now);
                } else {
                    this.buttonStates.set(btnKey, false);
                    return;
                }

                // PFL Cue
                if ((channel === 1 && (data1 === 0x0C || data1 === 0x0A || data1 === 0x0E || data1 === 0x54)) || (channel === 0 && (data1 === 0x0C || data1 === 0x0E || data1 === 0x18))) {
                    toggleDeckPFL('a');
                    return;
                }
                if ((channel === 2 && (data1 === 0x0C || data1 === 0x0A || data1 === 0x0E || data1 === 0x54)) || (channel === 0 && (data1 === 0x0D || data1 === 0x0F || data1 === 0x19))) {
                    toggleDeckPFL('b');
                    return;
                }
                if (channel === 0 && (data1 === 0x0B || data1 === 0x07)) {
                    toggleMasterPFL();
                    return;
                }

                // Deck A Buttons
                if (channel === 1 || (channel === 0 && data1 <= 0x0F)) {
                    if (data1 === 0x07 || data1 === 0x0B || data1 === 0x47) this.mixer.deckA.togglePlay(this.shiftA);
                    else if (data1 === 0x06 || data1 === 0x0C || data1 === 0x48) this.mixer.deckA.cue(true, this.shiftA);
                    else if (data1 === 0x05 || data1 === 0x58) this.mixer.deckA.sync(this.shiftA);
                    else if (data1 === 0x03 || data1 === 0x1A) this.mixer.deckA.toggleVinyl();
                    else if (data1 === 0x09 || data1 === 0x40) {
                        if (this.shiftA) this.mixer.deckA.halveLoop();
                        else this.mixer.deckA.setLoopIn();
                    } else if (data1 === 0x0A || data1 === 0x41) {
                        if (this.shiftA) this.mixer.deckA.doubleLoop();
                        else if (this.mixer.deckA.loopActive) this.mixer.deckA.exitLoop();
                        else this.mixer.deckA.setLoopOut();
                    } else if (data1 === 0x00) this.mixer.deckA.setPadMode('hotcue');
                    else if (data1 === 0x01) this.mixer.deckA.setPadMode('stems');
                    else if (data1 === 0x02) this.mixer.deckA.setPadMode('fx');
                    else if (data1 === 0x0F) this.mixer.deckA.setPadMode('sampler');
                }

                // Deck B Buttons
                else if (channel === 2 || (channel === 1 && data1 >= 0x40)) {
                    if (data1 === 0x07 || data1 === 0x0B || data1 === 0x47) this.mixer.deckB.togglePlay(this.shiftB);
                    else if (data1 === 0x06 || data1 === 0x0C || data1 === 0x48) this.mixer.deckB.cue(true, this.shiftB);
                    else if (data1 === 0x05 || data1 === 0x58) this.mixer.deckB.sync(this.shiftB);
                    else if (data1 === 0x03 || data1 === 0x1A) this.mixer.deckB.toggleVinyl();
                    else if (data1 === 0x09 || data1 === 0x40) {
                        if (this.shiftB) this.mixer.deckB.halveLoop();
                        else this.mixer.deckB.setLoopIn();
                    } else if (data1 === 0x0A || data1 === 0x41) {
                        if (this.shiftB) this.mixer.deckB.doubleLoop();
                        else if (this.mixer.deckB.loopActive) this.mixer.deckB.exitLoop();
                        else this.mixer.deckB.setLoopOut();
                    } else if (data1 === 0x00) this.mixer.deckB.setPadMode('hotcue');
                    else if (data1 === 0x01) this.mixer.deckB.setPadMode('stems');
                    else if (data1 === 0x02) this.mixer.deckB.setPadMode('fx');
                    else if (data1 === 0x0F) this.mixer.deckB.setPadMode('sampler');
                }

                // Deck A Pads
                if (channel === 6 || channel === 4 || channel === 8 || (channel === 1 && data1 >= 0x10 && data1 <= 0x2F)) {
                    const padIdx = (data1 & 0x03);
                    const isShift = this.shiftA || (data1 >= 0x08 && data1 <= 0x0B) || (data1 >= 0x18 && data1 <= 0x1B);
                    this.handlePadAction('a', padIdx + 1, isShift);
                    return;
                }

                // Deck B Pads
                if (channel === 7 || channel === 5 || channel === 9 || (channel === 2 && data1 >= 0x10 && data1 <= 0x2F)) {
                    const padIdx = (data1 & 0x03);
                    const isShift = this.shiftB || (data1 >= 0x08 && data1 <= 0x0B) || (data1 >= 0x18 && data1 <= 0x1B);
                    this.handlePadAction('b', padIdx + 1, isShift);
                    return;
                }
            }

            // Faders & Knobs
            else if (cmd === 11) {
                this.updateMidiMonitor(`CC [Ch:${channel} CC:0x${data1.toString(16).toUpperCase()} Val:${data2}]`);

                if (channel === 0) {
                    if (data1 === 0x00 || data1 === 0x1F || data1 === 0x08) {
                        const pct = (data2 / 127.0) * 100;
                        const xfader = document.getElementById('mixer-crossfader');
                        if (xfader) {
                            xfader.value = pct;
                            xfader.dispatchEvent(new Event('input'));
                        }
                    } else if (data1 === 0x06 || data1 === 0x10) {
                        const masterKnob = document.getElementById('master-volume');
                        if (masterKnob) {
                            masterKnob.value = (data2 / 127.0) * 1.5;
                            masterKnob.dispatchEvent(new Event('input'));
                        }
                    } else if (data1 === 0x07 || data1 === 0x11) {
                        const val = (data2 / 127.0) * 1.5;
                        if (this.mixer.headphoneGain && window.djAudioCtx) {
                            this.mixer.headphoneGain.gain.setTargetAtTime(val, window.djAudioCtx.currentTime, 0.015);
                        }
                    }
                }

                // Deck A CCs
                else if (channel === 1) {
                    if (data1 === 0x00 || data1 === 0x13) this.setSlider('deck-a-fader', data2 / 127.0);
                    else if (data1 === 0x01 || data1 === 0x17) this.setSlider('deck-a-filter', ((data2 - 64) / 64.0) * 100);
                    else if (data1 === 0x02 || data1 === 0x09) this.setSlider('deck-a-eq-low', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x03 || data1 === 0x08) this.setSlider('deck-a-eq-mid', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x04 || data1 === 0x07) this.setSlider('deck-a-eq-high', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x05 || data1 === 0x04) this.setSlider('deck-a-gain', (data2 / 127.0) * 2.0);
                    else if (data1 === 0x08) {
                        this.pitchState.a.msb = data2;
                        this.apply14BitPitch('a');
                    } else if (data1 === 0x28) {
                        this.pitchState.a.lsb = data2;
                        this.apply14BitPitch('a');
                    }
                    else if (data1 === 0x0A || data1 === 0x09 || data1 === 0x21 || data1 === 0x22) {
                        const delta = data2 > 64 ? data2 - 128 : data2;
                        this.mixer.deckA.applyHardwareJogDelta(delta, this.touchA, this.shiftA);
                    }
                }

                // Deck B CCs
                else if (channel === 2) {
                    if (data1 === 0x00 || data1 === 0x14) this.setSlider('deck-b-fader', data2 / 127.0);
                    else if (data1 === 0x01 || data1 === 0x18) this.setSlider('deck-b-filter', ((data2 - 64) / 64.0) * 100);
                    else if (data1 === 0x02 || data1 === 0x0D) this.setSlider('deck-b-eq-low', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x03 || data1 === 0x0C) this.setSlider('deck-b-eq-mid', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x04 || data1 === 0x0B) this.setSlider('deck-b-eq-high', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x05 || data1 === 0x05) this.setSlider('deck-b-gain', (data2 / 127.0) * 2.0);
                    else if (data1 === 0x08) {
                        this.pitchState.b.msb = data2;
                        this.apply14BitPitch('b');
                    } else if (data1 === 0x28) {
                        this.pitchState.b.lsb = data2;
                        this.apply14BitPitch('b');
                    }
                    else if (data1 === 0x0A || data1 === 0x09 || data1 === 0x21 || data1 === 0x22) {
                        const delta = data2 > 64 ? data2 - 128 : data2;
                        this.mixer.deckB.applyHardwareJogDelta(delta, this.touchB, this.shiftB);
                    }
                }
            }
        } catch (err) {
            console.warn('Excepción MIDI:', err);
        }
    }

    handlePadAction(deckId, padIndex, isShift) {
        const deck = deckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
        if (!deck) return;

        if (deck.padMode === 'hotcue') {
            if (isShift) deck.clearHotCue(padIndex);
            else deck.triggerHotCue(padIndex);
        } else if (deck.padMode === 'stems') {
            const stemNames = ['vocals', 'melody', 'bass', 'drums'];
            deck.toggleStem(stemNames[padIndex - 1], isShift);
        } else if (deck.padMode === 'fx') {
            deck.triggerFX(padIndex, isShift);
        } else if (deck.padMode === 'sampler') {
            playDJSoundSample(padIndex);
        }
    }

    apply14BitPitch(deckId) {
        const state = this.pitchState[deckId];
        const raw14Bit = (state.msb << 7) | (state.lsb & 0x7F);
        const pitchPercent = ((raw14Bit - 8192) / 8192.0) * 16.0;

        const deck = deckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
        if (deck) deck.setPitch(pitchPercent);

        const slider = document.getElementById(`deck-${deckId}-pitch`);
        if (slider) slider.value = pitchPercent;
    }

    setSlider(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input'));
        }
    }
}

// -------------------------------------------------------------
// DJ Sound Sampler DSP
// -------------------------------------------------------------
function playDJSoundSample(sampleIdx) {
    if (!window.djAudioCtx) return;
    const ctx = window.djAudioCtx;
    const now = ctx.currentTime;
    const targetGain = window.djMixer?.masterLimiter || ctx.destination;

    if (sampleIdx === 1) { // 📢 AIR HORN
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(466.16, now + i * 0.09);
            osc.frequency.exponentialRampToValueAtTime(450, now + i * 0.09 + 0.08);

            gain.gain.setValueAtTime(0.35, now + i * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.09 + 0.08);

            osc.connect(gain);
            gain.connect(targetGain);
            osc.start(now + i * 0.09);
            osc.stop(now + i * 0.09 + 0.08);
        }
        showToast('📢 SAMPLER: Air Horn', 'info');
    } else if (sampleIdx === 2) { // 🎚️ VINYL SCRATCH
        const bufferSize = ctx.sampleRate * 0.18;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200, now);
        filter.Q.value = 4.0;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(targetGain);
        noise.start(now);
        showToast('🎚️ SAMPLER: Scratch', 'info');
    } else if (sampleIdx === 3) { // ⚡ LASER IMPACT
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(3200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(targetGain);
        osc.start(now);
        osc.stop(now + 0.3);
        showToast('⚡ SAMPLER: Laser Impact', 'info');
    } else if (sampleIdx === 4) { // 💣 808 SUB DROP
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.6);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(gain);
        gain.connect(targetGain);
        osc.start(now);
        osc.stop(now + 0.65);
        showToast('💣 SAMPLER: 808 Sub Drop', 'info');
    }
}

// -------------------------------------------------------------
// DJ Mixer Global Controller
// -------------------------------------------------------------
class DJMixer {
    constructor() {
        this.initialized = false;
        this.deckA = null;
        this.deckB = null;
        this.masterGain = null;
        this.masterLimiter = null;
        this.pflBus = null;
        this.headphoneGain = null;
        this.pflMasterGain = null;
        this.channelMerger = null;
        this.crossfader = null;
        this.animFrameId = null;

        // Pro Sub-engines
        this.recorder = null;
        this.micEngine = null;
        this.automixEngine = null;
    }

    init() {
        if (this.initialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            window.djAudioCtx = new AudioContext({ latencyHint: 'interactive' });

            // 1. MASTER BUS CHAIN
            this.masterGain = window.djAudioCtx.createGain();
            this.masterGain.gain.value = 1.0;

            this.masterLimiter = window.djAudioCtx.createDynamicsCompressor();
            this.masterLimiter.threshold.setValueAtTime(-0.5, window.djAudioCtx.currentTime);
            this.masterLimiter.knee.setValueAtTime(3.0, window.djAudioCtx.currentTime);
            this.masterLimiter.ratio.setValueAtTime(12.0, window.djAudioCtx.currentTime);
            this.masterLimiter.attack.setValueAtTime(0.003, window.djAudioCtx.currentTime);
            this.masterLimiter.release.setValueAtTime(0.12, window.djAudioCtx.currentTime);

            this.masterGain.connect(this.masterLimiter);

            // 2. HEADPHONE CUE BUS CHAIN
            this.pflBus = window.djAudioCtx.createGain();
            this.pflBus.gain.value = 1.0;

            this.headphoneGain = window.djAudioCtx.createGain();
            this.headphoneGain.gain.value = 1.0;
            this.pflBus.connect(this.headphoneGain);

            this.pflMasterGain = window.djAudioCtx.createGain();
            this.pflMasterGain.gain.value = 0.0;
            this.masterLimiter.connect(this.pflMasterGain);
            this.pflMasterGain.connect(this.headphoneGain);

            // 3. Configure Hardware Audio Routing
            this.setupHardwareOutputs();

            this.deckA = new DJDeck('a', 'audio-deck-a', 'jog-wheel-a', 'canvas-wave-a');
            this.deckB = new DJDeck('b', 'audio-deck-b', 'jog-wheel-b', 'canvas-wave-b');

            this.deckA.initAudioNodes(window.djAudioCtx, this.masterGain, this.pflBus);
            this.deckB.initAudioNodes(window.djAudioCtx, this.masterGain, this.pflBus);

            this.setupCrossfader();
            this.setupMasterVolume();
            this.startWaveformVisualizers();

            // Initialize Sub-Engines
            this.recorder = new SetRecorder(this);
            this.micEngine = new MicTalkoverEngine(this);
            this.automixEngine = new AutomixEngine(this);

            window.universalMidi = window.herculesMidi = new UniversalMidiController(this);
            window.universalMidi.init();

            this.initialized = true;
        } catch (e) {
            console.warn('DJMixer init error:', e);
        }
    }

    setupHardwareOutputs() {
        if (!window.djAudioCtx) return;
        const dest = window.djAudioCtx.destination;
        const maxChannels = dest.maxChannelCount || 2;

        if (maxChannels >= 4) {
            dest.channelCount = 4;
            dest.channelCountMode = 'explicit';
            dest.channelInterpretation = 'discrete';

            this.channelMerger = window.djAudioCtx.createChannelMerger(4);

            const masterSplitter = window.djAudioCtx.createChannelSplitter(2);
            this.masterLimiter.connect(masterSplitter);
            masterSplitter.connect(this.channelMerger, 0, 0);
            masterSplitter.connect(this.channelMerger, 1, 1);

            const hpSplitter = window.djAudioCtx.createChannelSplitter(2);
            this.headphoneGain.connect(hpSplitter);
            hpSplitter.connect(this.channelMerger, 0, 2);
            hpSplitter.connect(this.channelMerger, 1, 3);

            this.channelMerger.connect(dest);
        } else {
            dest.channelCount = 2;
            dest.channelCountMode = 'max';
            dest.channelInterpretation = 'speakers';

            this.masterLimiter.connect(dest);
            this.headphoneGain.connect(dest);
        }
    }

    setupCrossfader() {
        this.crossfader = document.getElementById('mixer-crossfader');
        if (!this.crossfader) return;

        this.crossfader.addEventListener('input', (e) => {
            if (!window.djAudioCtx) return;
            const x = parseFloat(e.target.value) / 100.0;
            const gainA = Math.cos(x * 0.5 * Math.PI);
            const gainB = Math.cos((1.0 - x) * 0.5 * Math.PI);

            if (this.deckA && this.deckA.crossfaderGain) {
                this.deckA.crossfaderGain.gain.setTargetAtTime(gainA, window.djAudioCtx.currentTime, 0.015);
            }
            if (this.deckB && this.deckB.crossfaderGain) {
                this.deckB.crossfaderGain.gain.setTargetAtTime(gainB, window.djAudioCtx.currentTime, 0.015);
            }
        });
    }

    setupMasterVolume() {
        const masterKnob = document.getElementById('master-volume');
        if (masterKnob) {
            masterKnob.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (this.masterGain && window.djAudioCtx) {
                    this.masterGain.gain.setTargetAtTime(val, window.djAudioCtx.currentTime, 0.015);
                }
            });
        }
    }

    startWaveformVisualizers() {
        const canvasA = document.getElementById('canvas-wave-a');
        const canvasB = document.getElementById('canvas-wave-b');
        if (!canvasA || !canvasB) return;

        const ctxA = canvasA.getContext('2d');
        const ctxB = canvasB.getContext('2d');

        const bufferLengthA = this.deckA?.analyser?.frequencyBinCount || 128;
        const dataArrayA = new Uint8Array(bufferLengthA);
        const dataArrayB = new Uint8Array(bufferLengthA);

        const vuMeterA = document.getElementById('vu-meter-a');
        const vuMeterB = document.getElementById('vu-meter-b');

        const render = () => {
            this.animFrameId = requestAnimationFrame(render);

            if (this.deckA) {
                this.drawDeckWaveform(ctxA, canvasA, '#00d2ff', this.deckA);
                this.deckA.drawOverviewWaveform();
                if (vuMeterA && this.deckA.analyser) {
                    this.deckA.analyser.getByteTimeDomainData(dataArrayA);
                    const rmsA = this.calculateRMS(dataArrayA);
                    vuMeterA.style.height = `${Math.min(100, rmsA * 180)}%`;
                }
            }

            if (this.deckB) {
                this.drawDeckWaveform(ctxB, canvasB, '#00f5a0', this.deckB);
                this.deckB.drawOverviewWaveform();
                if (vuMeterB && this.deckB.analyser) {
                    this.deckB.analyser.getByteTimeDomainData(dataArrayB);
                    const rmsB = this.calculateRMS(dataArrayB);
                    vuMeterB.style.height = `${Math.min(100, rmsB * 180)}%`;
                }
            }
        };

        render();
    }

    calculateRMS(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const val = (dataArray[i] - 128) / 128.0;
            sum += val * val;
        }
        return Math.sqrt(sum / dataArray.length);
    }

    drawDeckWaveform(ctx, canvas, color, deck) {
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = canvas.offsetHeight;
        if (w === 0 || h === 0) return;

        const centerY = h / 2;
        const centerX = w / 2;

        ctx.fillStyle = '#06080e';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(w, centerY);
        ctx.stroke();

        if (!deck || !deck.audio) return;

        const currentTime = (deck.audio.currentTime || 0) + (deck.gridOffset || 0);
        const duration = deck.audio.duration || 1;
        const bpm = deck.bpm || 128.0;

        const secondsOnScreen = 8.0;
        const pxPerSec = w / secondsOnScreen;
        const startTime = currentTime - (secondsOnScreen / 2.0);
        const endTime = currentTime + (secondsOnScreen / 2.0);

        // 1. BEAT GRID
        const beatDuration = 60.0 / bpm;
        if (beatDuration > 0) {
            const startBeat = Math.floor(startTime / beatDuration);
            const endBeat = Math.ceil(endTime / beatDuration);

            for (let b = startBeat; b <= endBeat; b++) {
                const beatTime = b * beatDuration;
                if (beatTime < 0 || beatTime > duration) continue;

                const beatX = centerX + (beatTime - currentTime) * pxPerSec;
                const isBar = (b % 4 === 0);

                if (isBar) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(beatX, 0);
                    ctx.lineTo(beatX, h);
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.font = '8px monospace';
                    ctx.fillText(`${b/4 + 1}`, beatX + 3, 9);
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(beatX, h * 0.25);
                    ctx.lineTo(beatX, h * 0.75);
                    ctx.stroke();
                }
            }
        }

        // 2. ACTIVE LOOP REGION
        if (deck.loopActive && deck.loopStart < deck.loopEnd) {
            const loopX1 = centerX + (deck.loopStart - currentTime) * pxPerSec;
            const loopX2 = centerX + (deck.loopEnd - currentTime) * pxPerSec;

            ctx.fillStyle = 'rgba(255, 170, 0, 0.25)';
            ctx.fillRect(loopX1, 0, Math.max(2, loopX2 - loopX1), h);

            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 2;
            ctx.strokeRect(loopX1, 0, Math.max(2, loopX2 - loopX1), h);
        }

        // 3. FREQUENCY SPECTRUM BARS
        const totalBars = 160;
        const barWidth = w / totalBars;
        const timeStep = secondsOnScreen / totalBars;

        for (let i = 0; i < totalBars; i++) {
            const barTime = startTime + i * timeStep;
            if (barTime < 0 || barTime > duration) continue;

            const barX = i * barWidth;
            let peak = 0.5;

            if (deck.audioPeaks && deck.audioPeaks.length > 0) {
                const peakIdx = Math.floor(barTime * deck.peaksRate);
                if (peakIdx >= 0 && peakIdx < deck.audioPeaks.length) {
                    peak = deck.audioPeaks[peakIdx];
                }
            } else {
                const beatPhase = (barTime % beatDuration) / beatDuration;
                const isKick = beatPhase < 0.15 ? 1.0 : 0.2;
                peak = 0.3 + isKick * 0.6;
            }

            const barHeight = Math.max(3, peak * (h * 0.9));
            const yTop = centerY - barHeight / 2;

            const isBassHeavy = (barTime % (beatDuration * 2)) < (beatDuration * 0.5);
            if (isBassHeavy) {
                ctx.fillStyle = '#ff4757'; // Red Bass
            } else if (barTime % beatDuration < beatDuration * 0.5) {
                ctx.fillStyle = color; // Deck Color (Mids)
            } else {
                ctx.fillStyle = '#ffffff'; // Highs
            }

            ctx.fillRect(barX, yTop, barWidth - 1, barHeight);
        }

        // 4. HOT CUES
        const cueColors = ['#ff4757', '#00f5a0', '#00d2ff', '#ffaa00'];
        for (let i = 0; i < 4; i++) {
            const cue = deck.hotCues[i];
            if (cue !== null && cue !== undefined && cue >= startTime && cue <= endTime) {
                const cueX = centerX + (cue - currentTime) * pxPerSec;
                ctx.fillStyle = cueColors[i];
                ctx.fillRect(cueX - 1.5, 0, 3, h);

                ctx.font = 'bold 8px sans-serif';
                ctx.fillStyle = '#fff';
                ctx.fillText(`[${i+1}]`, cueX + 3, h - 3);
            }
        }

        // 5. CENTER PLAYHEAD NEEDLE
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, h);
        ctx.stroke();

        ctx.fillStyle = '#ff4757';
        ctx.beginPath();
        ctx.moveTo(centerX - 4, 0);
        ctx.lineTo(centerX + 4, 0);
        ctx.lineTo(centerX, 6);
        ctx.fill();
    }
}

// -------------------------------------------------------------
// Global Window Functions & Hotkeys
// -------------------------------------------------------------
window.djMixer = new DJMixer();

window.toggleSetRecording = function() {
    if (!window.djMixer.initialized) window.djMixer.init();
    if (window.djMixer.recorder) window.djMixer.recorder.toggle();
};

window.toggleMicTalkover = function() {
    if (!window.djMixer.initialized) window.djMixer.init();
    if (window.djMixer.micEngine) window.djMixer.micEngine.toggle();
};

window.toggleAutomix = function() {
    if (!window.djMixer.initialized) window.djMixer.init();
    if (window.djMixer.automixEngine) window.djMixer.automixEngine.toggle();
};

window.toggleDeckKeyLock = function(deckId) {
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck) return;
    deck.keyLock = !deck.keyLock;
    if (deck.audio) {
        deck.audio.preservesPitch = deck.keyLock;
        deck.audio.mozPreservesPitch = deck.keyLock;
        deck.audio.webkitPreservesPitch = deck.keyLock;
    }
    const btn = document.getElementById(`btn-keylock-${deckId}`);
    if (btn) btn.classList.toggle('active', deck.keyLock);
    showToast(`Deck ${deckId.toUpperCase()} Key Lock (Master Tempo): ${deck.keyLock ? 'ACTIVADO' : 'Desactivado'}`, 'info');
};

window.tapDeckBpm = function(deckId) {
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck) return;
    const now = performance.now();
    if (!deck.tapTimes) deck.tapTimes = [];

    if (deck.tapTimes.length > 0 && (now - deck.tapTimes[deck.tapTimes.length - 1] > 2500)) {
        deck.tapTimes = [];
    }

    deck.tapTimes.push(now);
    if (deck.tapTimes.length > 8) deck.tapTimes.shift();

    if (deck.tapTimes.length >= 3) {
        let totalDiff = 0;
        for (let i = 1; i < deck.tapTimes.length; i++) {
            totalDiff += (deck.tapTimes[i] - deck.tapTimes[i - 1]);
        }
        const avgDiffMs = totalDiff / (deck.tapTimes.length - 1);
        const calculatedBpm = Math.round((60000 / avgDiffMs) * 10) / 10;
        if (calculatedBpm >= 60 && calculatedBpm <= 200) {
            deck.baseBpm = calculatedBpm;
            deck.bpm = calculatedBpm;
            deck.updateBpmDisplay();
            showToast(`🎯 BPM Detectado por TAP: ${calculatedBpm.toFixed(2)}`, 'success');
        }
    }
};

window.nudgeDeckGrid = function(deckId, dir) {
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck) return;
    if (!deck.gridOffset) deck.gridOffset = 0.0;
    deck.gridOffset += (dir * 0.015);
    showToast(`Rejilla Grid: ${(deck.gridOffset * 1000).toFixed(0)} ms`, 'info');
};

window.handleNeedleDrop = function(deckId, event) {
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck || !deck.audio || isNaN(deck.audio.duration)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    deck.audio.currentTime = ratio * deck.audio.duration;
    showToast(`📍 Salto a: ${formatTime(deck.audio.currentTime)}`, 'info');
};

window.loadTrackToDeck = function(deckId, filename, stemName) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const url = `/api/audio?file=${filename}`;
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.loadTrack(stemName || decodeURIComponent(filename), url);
};

window.triggerHotCue = function(deckId, idx) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.triggerHotCue(idx);
};

window.setDeckPadMode = function(deckId, mode) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.setPadMode(mode);
};

window.handlePadClick = function(deckId, padIndex) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck) return;

    if (deck.padMode === 'hotcue') {
        deck.triggerHotCue(padIndex);
    } else if (deck.padMode === 'stems') {
        const stemNames = ['vocals', 'melody', 'bass', 'drums'];
        deck.toggleStem(stemNames[padIndex - 1]);
    } else if (deck.padMode === 'fx') {
        deck.triggerFX(padIndex, false);
    } else if (deck.padMode === 'sampler') {
        playDJSoundSample(padIndex);
    }
};

window.setDeckLoopIn = function(deckId) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.setLoopIn();
};

window.setDeckLoopOut = function(deckId) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.setLoopOut();
};

window.halveDeckLoop = function(deckId) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.halveLoop();
};

window.doubleDeckLoop = function(deckId) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.doubleLoop();
};

window.toggleDeckVinyl = function(deckId) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.toggleVinyl();
};

window.setDeckLoop = function(deckId, beats) {
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.setLoop(beats);
};

window.exitDeckLoop = function(deckId) {
    if (!window.djMixer.initialized) return;
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) deck.exitLoop();
};

window.toggleDeckPFL = function(deckId) {
    if (!window.djMixer || !window.djMixer.initialized) return;
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (!deck) return;

    deck.pflActive = !deck.pflActive;

    if (deck.pflGain && window.djAudioCtx) {
        deck.pflGain.gain.setTargetAtTime(deck.pflActive ? 1.0 : 0.0, window.djAudioCtx.currentTime, 0.01);
    }

    const btn = document.getElementById(`btn-deck-${deckId}-pfl`);
    if (btn) btn.classList.toggle('active', deck.pflActive);

    if (window.herculesMidi && window.herculesMidi.connected) {
        const ch = deckId === 'a' ? 0x91 : 0x92;
        const val = deck.pflActive ? 0x7F : 0x00;
        window.herculesMidi.sendMidi([ch, 0x0C, val]);
        window.herculesMidi.sendMidi([ch, 0x0A, val]);
        window.herculesMidi.sendMidi([0x90, deckId === 'a' ? 0x0C : 0x0D, val]);
        window.herculesMidi.sendMidi([0x90, deckId === 'a' ? 0x0E : 0x0F, val]);
    }

    showToast(
        deck.pflActive 
            ? `🎧 Preescucha Auriculares: Deck ${deckId.toUpperCase()} [ACTIVADA]` 
            : `🎧 Preescucha Auriculares: Deck ${deckId.toUpperCase()} [Desactivada]`,
        deck.pflActive ? 'success' : 'info'
    );
};

window.toggleMasterPFL = function() {
    if (!window.djMixer || !window.djMixer.initialized) return;
    const isMasterPFL = window.djMixer.pflMasterGain.gain.value > 0.1;
    window.djMixer.pflMasterGain.gain.setTargetAtTime(isMasterPFL ? 0.0 : 1.0, window.djAudioCtx.currentTime, 0.01);
    showToast(`🎧 Preescucha MASTER en Auriculares: ${!isMasterPFL ? 'ACTIVADA' : 'Desactivada'}`, 'info');
};

// Automatic Startup Initializer
document.addEventListener('DOMContentLoaded', () => {
    if (window.djMixer && !window.djMixer.initialized) {
        window.djMixer.init();
    }

    setTimeout(() => {
        if (window.djMixer?.deckA) window.djMixer.deckA.updatePadsUI();
        if (window.djMixer?.deckB) window.djMixer.deckB.updatePadsUI();
    }, 100);

    document.querySelectorAll('.vdj-pad').forEach(pad => {
        pad.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const id = pad.id;
            const parts = id.split('-');
            const deckId = parts[1];
            const padIdx = parseInt(parts[2], 10);
            const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
            if (deck) {
                if (deck.padMode === 'hotcue') {
                    deck.clearHotCue(padIdx);
                } else if (deck.padMode === 'stems') {
                    const stemNames = ['vocals', 'melody', 'bass', 'drums'];
                    deck.toggleStem(stemNames[padIdx - 1], true);
                }
            }
        });
    });
});

document.addEventListener('click', () => {
    if (window.djAudioCtx && window.djAudioCtx.state === 'suspended') {
        window.djAudioCtx.resume();
    }
}, { once: true });

// Keyboard Hotkeys
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    if (!window.djMixer || !window.djMixer.initialized) {
        window.djMixer.init();
    }

    const key = e.key.toLowerCase();

    // Deck A Hotkeys
    if (key === 'q') window.djMixer.deckA.togglePlay(e.shiftKey);
    else if (key === 'w') window.djMixer.deckA.cue(true, e.shiftKey);
    else if (key === 'e') window.djMixer.deckA.sync(e.shiftKey);
    else if (key === '1') window.handlePadClick('a', 1);
    else if (key === '2') window.handlePadClick('a', 2);
    else if (key === '3') window.handlePadClick('a', 3);
    else if (key === '4') window.handlePadClick('a', 4);
    else if (key === 'tab') {
        e.preventDefault();
        window.toggleDeckPFL('a');
    }

    // Deck B Hotkeys
    else if (key === 'u') window.djMixer.deckB.togglePlay(e.shiftKey);
    else if (key === 'i') window.djMixer.deckB.cue(true, e.shiftKey);
    else if (key === 'o') window.djMixer.deckB.sync(e.shiftKey);
    else if (key === '7') window.handlePadClick('b', 1);
    else if (key === '8') window.handlePadClick('b', 2);
    else if (key === '9') window.handlePadClick('b', 3);
    else if (key === '0') window.handlePadClick('b', 4);
    else if (key === '\\' || key === 'p') window.toggleDeckPFL('b');

    // Spacebar Master Play/Pause
    else if (key === ' ') {
        e.preventDefault();
        const isDeckAPlaying = window.djMixer.deckA.audio && !window.djMixer.deckA.audio.paused;
        if (isDeckAPlaying) window.djMixer.deckA.togglePlay();
        else window.djMixer.deckB.togglePlay();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    if (key === 'w' && window.djMixer?.deckA) {
        window.djMixer.deckA.cue(false, e.shiftKey);
    } else if (key === 'i' && window.djMixer?.deckB) {
        window.djMixer.deckB.cue(false, e.shiftKey);
    }
});
