// ==========================================================================
// VIRTUAL DJ PRO - HIGH FIDELITY AUDIO MIXER & FULL HERCULES INPULSE 200 ENGINE
// FEATURING: DISCRETE 4-CHANNEL ROUTING (MASTER RCA 1-2 & HEADPHONE CUE 3-4)
// AND EXACT HERCULES DJCONTROL INPULSE 200 MK2 MIDI SPECIFICATION
// ==========================================================================

function formatTime(sec) {
    if (isNaN(sec) || sec === null || sec === undefined || sec < 0) return "00:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ds = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ds}`;
}
window.formatTime = formatTime;

class DJDeck {
    constructor(id, audioElId, jogElId, canvasId) {
        this.id = id; // 'a' or 'b'
        this.audio = document.getElementById(audioElId);
        this.jog = document.getElementById(jogElId);
        this.canvas = document.getElementById(canvasId);
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
        this.lastScratchAngle = 0;
        this.pitchBendTimer = null;
        this.isBraking = false;
        this.cuePreviewing = false;

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

        // 3-Band Parametric EQ (Studio Curves)
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

        this.vocalFilter = audioCtx.createBiquadFilter();
        this.vocalFilter.type = 'peaking';
        this.vocalFilter.frequency.value = 1400;
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

        // PFL Pre-Listen Tap (Pre-Channel Fader, Post-EQ & Filter)
        this.pflGain = audioCtx.createGain();
        this.pflGain.gain.value = 0.0;

        // Analyser
        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 256;

        // Audio Chain Routing:
        // Source -> Low -> Mid -> High -> Filter -> Stems (Bass->Vocal->Drum) -> Gain
        if (this.source) {
            this.source.connect(this.lowNode);
            this.lowNode.connect(this.midNode);
            this.midNode.connect(this.highNode);
            this.highNode.connect(this.filterNode);
            this.filterNode.connect(this.bassFilter);
            this.bassFilter.connect(this.vocalFilter);
            this.vocalFilter.connect(this.drumFilter);
            this.drumFilter.connect(this.gainNode);

            // FX Echo send
            this.gainNode.connect(this.fxDelayNode);
            this.fxWetGain.connect(this.channelFaderGain);

            // 1. MASTER PATH (Controlled strictly by Channel Fader & Crossfader)
            this.gainNode.connect(this.channelFaderGain);
            this.channelFaderGain.connect(this.crossfaderGain);
            this.crossfaderGain.connect(this.analyser);
            this.analyser.connect(masterGain);

            // 2. HEADPHONE CUE PATH (Pre-Channel Fader tap for CUE pre-listening)
            this.drumFilter.connect(this.pflGain);
            if (pflBus) this.pflGain.connect(pflBus);
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.audio) {
            this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.audio.addEventListener('play', () => this.onPlayStateChange());
            this.audio.addEventListener('pause', () => this.onPlayStateChange());
            this.audio.addEventListener('ended', () => this.onEnded());
        }

        // Screen Scratch
        if (this.jog) {
            this.jog.addEventListener('mousedown', (e) => this.startScratch(e));
            window.addEventListener('mousemove', (e) => this.moveScratch(e));
            window.addEventListener('mouseup', () => this.endScratch());

            this.jog.addEventListener('touchstart', (e) => this.startScratch(e.touches[0]));
            window.addEventListener('touchmove', (e) => this.moveScratch(e.touches[0]));
            window.addEventListener('touchend', () => this.endScratch());
        }

        // Screen Pitch Slider
        const pitchSlider = document.getElementById(`deck-${this.id}-pitch`);
        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                this.setPitch(parseFloat(e.target.value));
            });
        }

        const btnResetPitch = document.getElementById(`btn-deck-${this.id}-pitch-reset`);
        if (btnResetPitch) {
            btnResetPitch.addEventListener('click', () => {
                if (pitchSlider) pitchSlider.value = 0;
                this.setPitch(0);
            });
        }

        // Screen Transport
        if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
        if (this.cueBtn) this.cueBtn.addEventListener('click', () => this.cue());
        if (this.syncBtn) this.syncBtn.addEventListener('click', () => this.sync());

        // Knobs with Smooth Audio Scheduling
        this.bindSmoothKnob(`deck-${this.id}-gain`, (val) => {
            if (this.gainNode && this.ctx) this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
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
        this.bindSmoothKnob(`deck-${this.id}-filter`, (val) => {
            this.setDJFilter(val);
        });
        this.bindSmoothKnob(`deck-${this.id}-fader`, (val) => {
            if (this.channelFaderGain && this.ctx) this.channelFaderGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
        });
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

        if (this.vocalFilter) {
            this.vocalFilter.gain.setTargetAtTime(this.stems.vocals ? 0 : -26, now, 0.02);
        }
        if (this.bassFilter) {
            this.bassFilter.gain.setTargetAtTime(this.stems.bass ? 0 : -28, now, 0.02);
        }
        if (this.drumFilter) {
            this.drumFilter.gain.setTargetAtTime(this.stems.drums ? 0 : -24, now, 0.02);
        }

        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    triggerFX(fxIndex, isShift = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (fxIndex === 1) { // 1. FILTER LP / HPF BUILD
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
                showToast(`Deck ${this.id.toUpperCase()}: FX Echo ${!isActive ? 'ACTIVADO' : 'Off'} 🔁`, 'info');
            }
        } else if (fxIndex === 3) { // 3. FLANGER / BEATGRID
            if (this.midNode) {
                this.midNode.gain.setTargetAtTime(10, now, 0.05);
                this.midNode.frequency.setTargetAtTime(3200, now, 0.05);
                showToast(`Deck ${this.id.toUpperCase()}: FX Flanger Jet 🚀`, 'info');
                setTimeout(() => {
                    this.midNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
                    this.midNode.frequency.setTargetAtTime(1200, this.ctx.currentTime, 0.3);
                }, 1500);
            }
        } else if (fxIndex === 4) { // 4. VINYL BRAKE / MOTOR STOP
            if (!this.audio.paused && !this.isBraking) {
                this.isBraking = true;
                showToast(`Deck ${this.id.toUpperCase()}: FX Vinyl Brake 🛑`, 'info');
                const initialRate = this.audio.playbackRate;
                let step = 0;
                const interval = setInterval(() => {
                    step++;
                    if (this.audio && !this.audio.paused) {
                        this.audio.playbackRate = Math.max(0.05, initialRate * (1 - (step / 15)));
                    }
                    if (step >= 15) {
                        clearInterval(interval);
                        this.audio.pause();
                        this.audio.playbackRate = initialRate;
                        this.isBraking = false;
                    }
                }, 50);
            }
        }
    }

    loadTrack(name, url) {
        this.trackName = name;
        this.trackUrl = url;
        if (this.audio) {
            this.audio.src = url;
            this.audio.load();
        }

        if (this.titleEl) {
            this.titleEl.textContent = name.replace(/\.[^/.]+$/, "");
        }

        const bpmMatch = name.match(/(\d{2,3})\s*bpm/i);
        this.baseBpm = bpmMatch ? parseFloat(bpmMatch[1]) : (124.0 + (Math.abs(this.hashCode(name)) % 10));
        this.bpm = this.baseBpm;
        if (this.bpmEl) {
            this.bpmEl.textContent = `${this.bpm.toFixed(2)} BPM`;
        }
        const bpmDigits = document.getElementById(`deck-${this.id}-bpm-digits`);
        if (bpmDigits) {
            bpmDigits.textContent = this.bpm.toFixed(2);
        }

        this.cuePoint = 0.0;
        this.hotCues = [null, null, null, null];
        this.stems = { vocals: true, melody: true, bass: true, drums: true };
        this.updatePadsUI();
        this.setPitch(0);
        showToast(`Deck ${this.id.toUpperCase()}: ${name}`, 'info');
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    togglePlay(isShift = false) {
        if (!this.trackUrl || !this.audio || !this.trackName) {
            showToast(`⚠️ Carga primero una pista en el Deck ${this.id.toUpperCase()}`, 'info');
            return;
        }

        if (window.djAudioCtx && window.djAudioCtx.state === 'suspended') {
            window.djAudioCtx.resume();
        }

        if (isShift) { // Cue Stutter (Shift + Play)
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

        if (isShift) { // Return to beginning of track (Shift + CUE)
            this.audio.currentTime = 0;
            this.audio.pause();
            showToast(`Deck ${this.id.toUpperCase()}: Regreso al inicio (0:00)`, 'info');
            return;
        }

        if (isDown) {
            if (this.audio.paused) {
                // If paused, set Temporary Cue Point and start preview playback while held
                this.cuePoint = this.audio.currentTime;
                this.cuePreviewing = true;
                this.audio.play().catch(() => {});
                showToast(`Deck ${this.id.toUpperCase()}: CUE fijado en ${formatTime(this.cuePoint)}`, 'info');
            } else {
                // If playing, jump back to Cue point and pause
                this.audio.pause();
                this.audio.currentTime = this.cuePoint;
                showToast(`Deck ${this.id.toUpperCase()}: Salto a CUE`, 'info');
            }
        } else {
            // Button released: if was previewing, return to cue point and pause
            if (this.cuePreviewing) {
                this.cuePreviewing = false;
                this.audio.pause();
                this.audio.currentTime = this.cuePoint;
            }
        }
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    sync(isShift = false) {
        if (isShift) { // Shift + SYNC: Smooth Pitch Reset to 0%
            this.setPitch(0);
            const slider = document.getElementById(`deck-${this.id}-pitch`);
            if (slider) slider.value = 0;
            showToast(`Deck ${this.id.toUpperCase()}: Pitch restablecido a 0.0%`, 'info');
            if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
            return;
        }

        if (!this.trackName || !window.djMixer) return;
        const otherDeck = this.id === 'a' ? window.djMixer.deckB : window.djMixer.deckA;
        if (!otherDeck || !otherDeck.trackName) {
            showToast('Carga una pista en el otro Deck para sincronizar', 'info');
            return;
        }

        const targetBpm = otherDeck.bpm;
        const pitchNeeded = ((targetBpm - this.baseBpm) / this.baseBpm) * 100.0;
        const clampedPitch = Math.max(-16, Math.min(16, pitchNeeded));

        this.setPitch(clampedPitch);
        const pitchSlider = document.getElementById(`deck-${this.id}-pitch`);
        if (pitchSlider) pitchSlider.value = clampedPitch;

        if (!this.audio.paused && !otherDeck.audio.paused) {
            const beatLen = 60.0 / targetBpm;
            const phase = otherDeck.audio.currentTime % beatLen;
            const currentPhase = this.audio.currentTime % beatLen;
            this.audio.currentTime += (phase - currentPhase);
        }

        showToast(`SYNC Deck ${this.id.toUpperCase()} ➔ ${targetBpm.toFixed(1)} BPM`, 'success');
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    calcRate() {
        return 1.0 + (this.pitchPercent / 100.0);
    }

    setPitch(pct) {
        this.pitchPercent = pct;
        const rate = this.calcRate();
        if (this.audio) {
            this.audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        }
        this.bpm = this.baseBpm * rate;

        if (this.pitchValEl) {
            this.pitchValEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        }
        if (this.bpmEl) {
            this.bpmEl.textContent = `${this.bpm.toFixed(2)} BPM`;
        }
        const bpmDigits = document.getElementById(`deck-${this.id}-bpm-digits`);
        if (bpmDigits) {
            bpmDigits.textContent = this.bpm.toFixed(2);
        }
    }

    triggerHotCue(index) {
        if (!this.audio) return;
        const cueIdx = index - 1;
        if (this.hotCues[cueIdx] === null || this.hotCues[cueIdx] === undefined) {
            this.hotCues[cueIdx] = this.audio.currentTime;
            showToast(`Deck ${this.id.toUpperCase()}: Hot Cue ${index} FIJADO en ${formatTime(this.audio.currentTime)}`, 'success');
        } else {
            this.audio.currentTime = this.hotCues[cueIdx];
            if (this.audio.paused) {
                this.audio.play().catch(() => {});
            }
            showToast(`Deck ${this.id.toUpperCase()}: Salto a Hot Cue ${index} (${formatTime(this.hotCues[cueIdx])})`, 'info');
        }
        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    clearHotCue(index) {
        const cueIdx = index - 1;
        this.hotCues[cueIdx] = null;
        this.updatePadsUI();
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
        showToast(`Deck ${this.id.toUpperCase()}: Hot Cue ${index} borrado`, 'info');
    }

    setPadMode(mode) {
        this.padMode = mode;
        const btns = document.querySelectorAll(`[id^="btn-mode-${this.id}-"]`);
        btns.forEach(b => b.classList.toggle('active', b.id === `btn-mode-${this.id}-${mode}`));
        this.updatePadsUI();
        showToast(`Deck ${this.id.toUpperCase()} Modo Pads: ${mode.toUpperCase()}`, 'info');
        if (window.herculesMidi) window.herculesMidi.updateDeckLEDs(this.id);
    }

    updatePadsUI() {
        const padLabels = {
            'hotcue': ['CUE 1', 'CUE 2', 'CUE 3', 'CUE 4'],
            'stems': ['🎤 VOCAL', '🎹 MELO', '🎸 BASS', '🥁 DRUMS'],
            'fx': ['⚡ HPF', '🔁 ECHO', '🚀 FLANG', '🛑 BRAKE'],
            'sampler': ['🎺 HORN', '💿 SCRATCH', '⚡ LASER', '💣 808']
        };

        const labels = padLabels[this.padMode] || padLabels['hotcue'];
        for (let i = 1; i <= 4; i++) {
            const pad = document.getElementById(`pad-${this.id}-${i}`);
            if (pad) {
                pad.textContent = labels[i - 1];
                if (this.padMode === 'hotcue') {
                    pad.classList.toggle('has-cue', this.hotCues[i - 1] !== null && this.hotCues[i - 1] !== undefined);
                    pad.classList.remove('pad-muted', 'pad-active');
                } else if (this.padMode === 'stems') {
                    const stemKeys = ['vocals', 'melody', 'bass', 'drums'];
                    const isOn = this.stems[stemKeys[i - 1]];
                    pad.classList.toggle('pad-active', isOn);
                    pad.classList.toggle('pad-muted', !isOn);
                    pad.classList.remove('has-cue');
                } else {
                    pad.classList.remove('has-cue', 'pad-muted', 'pad-active');
                }
            }
        }
    }

    setLoopIn() {
        if (!this.trackName || !this.audio) return;
        this.loopStart = this.audio.currentTime;
        this.loopInSet = true;
        const inBtn = document.getElementById(`btn-loop-${this.id}-in`);
        if (inBtn) inBtn.classList.add('active');
        showToast(`Deck ${this.id.toUpperCase()}: LOOP IN fijado en ${formatTime(this.loopStart)}`, 'info');
        if (window.herculesMidi) {
            const ch = this.id === 'a' ? 0x91 : 0x92;
            window.herculesMidi.sendMidi([ch, 0x09, 0x7F]);
        }
    }

    setLoopOut() {
        if (!this.trackName || !this.audio) return;
        const beatSecs = 60.0 / this.bpm;
        if (!this.loopInSet) {
            this.loopStart = Math.max(0, this.audio.currentTime - (4 * beatSecs));
        }
        this.loopEnd = this.audio.currentTime;
        if (this.loopEnd <= this.loopStart) {
            this.loopEnd = this.loopStart + (4 * beatSecs);
        }
        this.loopActive = true;

        const inBtn = document.getElementById(`btn-loop-${this.id}-in`);
        const outBtn = document.getElementById(`btn-loop-${this.id}-out`);
        const exitBtn = document.getElementById(`btn-loop-${this.id}-exit`);
        if (inBtn) inBtn.classList.add('active');
        if (outBtn) outBtn.classList.add('active');
        if (exitBtn) exitBtn.classList.add('active');

        const beats = Math.max(1, Math.round((this.loopEnd - this.loopStart) / beatSecs));
        showToast(`Deck ${this.id.toUpperCase()}: LOOP ACTIVADO (${beats} Beats)`, 'success');
        if (window.herculesMidi) {
            const ch = this.id === 'a' ? 0x91 : 0x92;
            window.herculesMidi.sendMidi([ch, 0x0A, 0x7F]);
        }
    }

    halveLoop() {
        if (!this.loopActive) {
            this.setLoop(2);
            return;
        }
        const currentLen = this.loopEnd - this.loopStart;
        this.loopEnd = this.loopStart + (currentLen / 2.0);
        const beatSecs = 60.0 / this.bpm;
        const beats = Math.max(0.25, ((this.loopEnd - this.loopStart) / beatSecs)).toFixed(1);
        showToast(`Deck ${this.id.toUpperCase()}: Loop / 2 (${beats} Beats)`, 'info');
    }

    doubleLoop() {
        if (!this.loopActive) {
            this.setLoop(8);
            return;
        }
        const currentLen = this.loopEnd - this.loopStart;
        this.loopEnd = this.loopStart + (currentLen * 2.0);
        const beatSecs = 60.0 / this.bpm;
        const beats = Math.round((this.loopEnd - this.loopStart) / beatSecs);
        showToast(`Deck ${this.id.toUpperCase()}: Loop x 2 (${beats} Beats)`, 'info');
    }

    setLoop(beats) {
        if (!this.trackName || !this.audio) return;
        const beatSecs = 60.0 / this.bpm;
        const loopDuration = beats * beatSecs;
        this.loopStart = this.audio.currentTime;
        this.loopEnd = this.loopStart + loopDuration;
        this.loopActive = true;
        this.loopInSet = true;

        const inBtn = document.getElementById(`btn-loop-${this.id}-in`);
        const outBtn = document.getElementById(`btn-loop-${this.id}-out`);
        const exitBtn = document.getElementById(`btn-loop-${this.id}-exit`);
        if (inBtn) inBtn.classList.add('active');
        if (outBtn) outBtn.classList.add('active');
        if (exitBtn) exitBtn.classList.add('active');

        showToast(`Deck ${this.id.toUpperCase()}: Loop ${beats} Beats`, 'info');
        if (window.herculesMidi) {
            const ch = this.id === 'a' ? 0x91 : 0x92;
            window.herculesMidi.sendMidi([ch, 0x09, 0x7F]);
            window.herculesMidi.sendMidi([ch, 0x0A, 0x7F]);
        }
    }

    exitLoop() {
        this.loopActive = false;
        this.loopInSet = false;
        const inBtn = document.getElementById(`btn-loop-${this.id}-in`);
        const outBtn = document.getElementById(`btn-loop-${this.id}-out`);
        const exitBtn = document.getElementById(`btn-loop-${this.id}-exit`);
        if (inBtn) inBtn.classList.remove('active');
        if (outBtn) outBtn.classList.remove('active');
        if (exitBtn) exitBtn.classList.remove('active');

        if (window.herculesMidi) {
            const ch = this.id === 'a' ? 0x91 : 0x92;
            window.herculesMidi.sendMidi([ch, 0x09, 0x00]);
            window.herculesMidi.sendMidi([ch, 0x0A, 0x00]);
        }
        showToast(`Deck ${this.id.toUpperCase()}: Loop desactivado`, 'info');
    }

    toggleVinyl() {
        this.vinylActive = !this.vinylActive;
        const btn = document.getElementById(`btn-vinyl-${this.id}`);
        if (btn) btn.classList.toggle('active', this.vinylActive);

        if (window.herculesMidi) {
            const ch = this.id === 'a' ? 0x91 : 0x92;
            window.herculesMidi.sendMidi([ch, 0x03, this.vinylActive ? 0x7F : 0x00]);
        }
        showToast(`Deck ${this.id.toUpperCase()}: Modo Vinilo ${this.vinylActive ? 'ACTIVADO (Scratch)' : 'Desactivado (CDJ Nudge)'}`, 'info');
    }

    onTimeUpdate() {
        if (!this.audio) return;
        if (this.loopActive && this.audio.currentTime >= this.loopEnd) {
            this.audio.currentTime = this.loopStart;
        }

        if (this.timeCurEl) {
            this.timeCurEl.textContent = formatTime(this.audio.currentTime);
        }
        if (this.timeTotEl && !isNaN(this.audio.duration)) {
            this.timeTotEl.textContent = formatTime(this.audio.duration);
        }
    }

    onPlayStateChange() {
        if (!this.audio) return;
        const isPlaying = !this.audio.paused;
        if (this.playBtn) {
            this.playBtn.classList.toggle('is-playing', isPlaying);
        }
        if (this.jog) {
            this.jog.classList.toggle('spinning', isPlaying);
        }
        if (window.herculesMidi) {
            window.herculesMidi.updateDeckLEDs(this.id);
        }
    }

    onEnded() {
        this.onPlayStateChange();
    }

    startScratch(e) {
        if (!this.audio) return;
        this.isScratching = true;
        this.wasPlayingBeforeScratch = !this.audio.paused;
        this.audio.pause();
        const rect = this.jog.getBoundingClientRect();
        this.jogCenterX = rect.left + rect.width / 2;
        this.jogCenterY = rect.top + rect.height / 2;
        this.lastScratchAngle = Math.atan2(e.clientY - this.jogCenterY, e.clientX - this.jogCenterX);
    }

    moveScratch(e) {
        if (!this.isScratching || !this.audio) return;
        const currentAngle = Math.atan2(e.clientY - this.jogCenterY, e.clientX - this.jogCenterX);
        let delta = currentAngle - this.lastScratchAngle;

        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta -= 2 * Math.PI;

        this.rotation += delta * (180 / Math.PI);
        if (this.jog) this.jog.style.transform = `rotate(${this.rotation}deg)`;

        const scrubSeconds = (delta / (2 * Math.PI)) * 2.0;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + scrubSeconds));
        this.lastScratchAngle = currentAngle;
    }

    endScratch() {
        if (!this.isScratching || !this.audio) return;
        this.isScratching = false;
        if (this.wasPlayingBeforeScratch) {
            this.audio.play().catch(() => {});
        }
    }

    onHardwareTouchDown() {
        if (!this.audio) return;
        if (!this.vinylActive) return;
        this.isScratching = true;
        this.wasPlayingBeforeScratch = !this.audio.paused;
        if (this.wasPlayingBeforeScratch) {
            this.audio.pause();
        }
    }

    onHardwareTouchUp() {
        if (!this.audio) return;
        if (this.isScratching) {
            this.isScratching = false;
            if (this.wasPlayingBeforeScratch) {
                this.audio.play().catch(() => {});
            }
        }
    }

    applyHardwareJogDelta(delta, isTouch, isShift = false) {
        if (!this.trackName || !this.audio) return;

        this.rotation += delta * 4.5;
        if (this.jog) {
            this.jog.style.transform = `rotate(${this.rotation}deg)`;
        }

        if (isShift) { // SHIFT + JOG: Fast search / Seek forward & backward
            const seekSeconds = (delta / 64.0) * 4.0;
            this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + seekSeconds));
            return;
        }

        if (isTouch && this.vinylActive) {
            const scrubSeconds = (delta / 64.0) * 0.45;
            this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + scrubSeconds));
        } else {
            if (!this.audio.paused) {
                const bendFactor = 1.0 + (delta / 64.0) * 0.12;
                this.audio.playbackRate = Math.max(0.2, Math.min(3.0, this.calcRate() * bendFactor));
                
                clearTimeout(this.pitchBendTimer);
                this.pitchBendTimer = setTimeout(() => {
                    if (this.audio) this.audio.playbackRate = this.calcRate();
                }, 90);
            } else {
                const scrubSeconds = (delta / 64.0) * 0.08;
                this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + scrubSeconds));
            }
        }
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
}

// -------------------------------------------------------------
// DJ SAMPLER AUDIO SYNTHESIS ENGINE
// -------------------------------------------------------------
function playDJSoundSample(sampleIdx) {
    if (!window.djAudioCtx) return;
    const ctx = window.djAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    if (sampleIdx === 1) { // 🎺 AIRHORN
        const freqs = [466.16, 587.33, 700.0];
        freqs.forEach(f => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now);
            osc.frequency.exponentialRampToValueAtTime(f * 1.05, now + 0.35);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.45);
        });
        showToast('🎺 SAMPLER: Airhorn Drop', 'info');
    } else if (sampleIdx === 2) { // 💿 SCRATCH SAMPLE
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.18);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
        showToast('💿 SAMPLER: Scratch Drop', 'info');
    } else if (sampleIdx === 3) { // ⚡ LASER IMPACT
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.3);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
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
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);
        showToast('💣 SAMPLER: 808 Sub Drop', 'info');
    }
}

// -------------------------------------------------------------
// Hercules DJControl Inpulse 200 MK2 MIDI Engine
// -------------------------------------------------------------
class HerculesMidiController {
    constructor(mixer) {
        this.mixer = mixer;
        this.midiAccess = null;
        this.input = null;
        this.output = null;
        this.connected = false;
        this.touchA = false;
        this.touchB = false;
        this.shiftA = false;
        this.shiftB = false;
        this.beatmatchGuide = true;
        this.selectedCrateIndex = 0;
        this.assistantEnergy = 1;

        this.pitchState = {
            a: { msb: 64, lsb: 0 },
            b: { msb: 64, lsb: 0 }
        };
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser.');
            return;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.midiAccess.addEventListener('statechange', (e) => this.onStateChange(e));
            this.scanDevices();
        } catch (err) {
            console.warn('Standard Web MIDI init error:', err);
        }
    }

    scanDevices() {
        if (!this.midiAccess) return;
        let herculesInput = null;
        let herculesOutput = null;

        for (const input of this.midiAccess.inputs.values()) {
            const name = (input.name || '').toLowerCase();
            if (name.includes('inpulse') || name.includes('hercules') || name.includes('djcontrol') || name.includes('dj')) {
                herculesInput = input;
                break;
            }
        }

        for (const output of this.midiAccess.outputs.values()) {
            const name = (output.name || '').toLowerCase();
            if (name.includes('inpulse') || name.includes('hercules') || name.includes('djcontrol') || name.includes('dj')) {
                herculesOutput = output;
                break;
            }
        }

        if (!herculesInput && this.midiAccess.inputs.size > 0) {
            herculesInput = this.midiAccess.inputs.values().next().value;
        }
        if (!herculesOutput && this.midiAccess.outputs.size > 0) {
            herculesOutput = this.midiAccess.outputs.values().next().value;
        }

        if (herculesInput) {
            this.input = herculesInput;
            this.output = herculesOutput;
            this.input.onmidimessage = (msg) => this.onMidiMessage(msg);
            this.connected = true;
            this.updateMidiPill(this.input.name || 'Hercules Conectada');

            // Handshake & LED Init
            this.sendMidi([0xB0, 0x7F, 0x7F]);
            this.sendMidi([0x91, 0x03, 0x7F]);
            this.sendMidi([0x92, 0x03, 0x7F]);
            this.sendMidi([0x90, 0x04, 0x01]);
            this.sendMidi([0x90, 0x08, 0x7F]);
            this.updateAllLEDs();

            showToast(`🎛️ Conectada: ${this.input.name || 'Hercules Inpulse 200'}`, 'success');
        }
    }

    onStateChange(e) {
        if (e.port && e.port.type === 'input') {
            this.scanDevices();
        }
    }

    sendMidi(bytes) {
        if (this.output) {
            try {
                this.output.send(bytes);
            } catch (err) {}
        }
    }

    updateMidiPill(name) {
        const text = document.getElementById('midi-name-text');
        if (text) text.textContent = name.replace(/Hercules /i, '');
    }

    updateAllLEDs() {
        this.updateDeckLEDs('a');
        this.updateDeckLEDs('b');
    }

    updateDeckLEDs(deckId) {
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

            // Performance Pad LEDs
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

    onMidiMessage(msg) {
        try {
            const [status, data1, data2] = msg.data;
            const cmd = status >> 4;
            const channel = status & 0xF;

            if (window.djAudioCtx && window.djAudioCtx.state === 'suspended') {
                window.djAudioCtx.resume();
            }

            // 1. BUTTONS & PADS (Note On / Off)
            if (cmd === 9 || cmd === 8) {
                const isDown = (cmd === 9 && data2 > 0);

                // Jog Platter Touch (Note 0x08 on Channel 1 & 2)
                if ((channel === 1 || channel === 2) && data1 === 0x08) {
                    if (channel === 1) {
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

                // Shift buttons (Note 0x04 or 0x0B)
                if (channel === 1 && (data1 === 0x04 || data1 === 0x0B)) {
                    this.shiftA = isDown;
                    return;
                }
                if (channel === 2 && (data1 === 0x04 || data1 === 0x0B)) {
                    this.shiftB = isDown;
                    return;
                }

                // ==================== CUE BUTTON RELEASE (FOR CUE PREVIEW) ====================
                if (cmd === 8 || (cmd === 9 && data2 === 0)) {
                    if (channel === 1 && data1 === 0x06) this.mixer.deckA.cue(false, this.shiftA);
                    if (channel === 2 && data1 === 0x06) this.mixer.deckB.cue(false, this.shiftB);
                    return;
                }

                if (!isDown) return;

                // ==================== HEADPHONE CUE (PFL) SHORTCUTS ====================
                if (channel === 1 && (data1 === 0x0C || data1 === 0x0A || data1 === 0x0E)) {
                    toggleDeckPFL('a');
                    return;
                }
                if (channel === 2 && (data1 === 0x0C || data1 === 0x0A || data1 === 0x0E)) {
                    toggleDeckPFL('b');
                    return;
                }
                if (channel === 0) {
                    if (data1 === 0x0C || data1 === 0x0E) {
                        toggleDeckPFL('a');
                        return;
                    }
                    if (data1 === 0x0D || data1 === 0x0F) {
                        toggleDeckPFL('b');
                        return;
                    }
                    if (data1 === 0x0B || data1 === 0x07) {
                        toggleMasterPFL();
                        return;
                    }
                }

                // ==================== DECK A BUTTONS ====================
                if (channel === 1) {
                    if (data1 === 0x07) {
                        this.mixer.deckA.togglePlay(this.shiftA);
                    }
                    else if (data1 === 0x06) {
                        this.mixer.deckA.cue(true, this.shiftA);
                    }
                    else if (data1 === 0x05) {
                        this.mixer.deckA.sync(this.shiftA);
                    }
                    else if (data1 === 0x03) {
                        this.mixer.deckA.toggleVinyl();
                    }
                    else if (data1 === 0x09) { // LOOP IN / 1/2
                        if (this.shiftA) this.mixer.deckA.halveLoop();
                        else this.mixer.deckA.setLoopIn();
                    }
                    else if (data1 === 0x0A) { // LOOP OUT / 2X / EXIT
                        if (this.shiftA) this.mixer.deckA.doubleLoop();
                        else if (this.mixer.deckA.loopActive) this.mixer.deckA.exitLoop();
                        else this.mixer.deckA.setLoopOut();
                    }
                    else if (data1 === 0x0D || data1 === 0x0E) {
                        if (this.shiftA) this.mixer.deckA.loadTrack('', '');
                        else this.loadSelectedTrackToDeck('a');
                    }
                    else if (data1 === 0x00) this.mixer.deckA.setPadMode('hotcue');
                    else if (data1 === 0x01) this.mixer.deckA.setPadMode('stems');
                    else if (data1 === 0x02) this.mixer.deckA.setPadMode('fx');
                    else if (data1 === 0x0F) this.mixer.deckA.setPadMode('sampler');
                }

                // ==================== DECK B BUTTONS ====================
                else if (channel === 2) {
                    if (data1 === 0x07) {
                        this.mixer.deckB.togglePlay(this.shiftB);
                    }
                    else if (data1 === 0x06) {
                        this.mixer.deckB.cue(true, this.shiftB);
                    }
                    else if (data1 === 0x05) {
                        this.mixer.deckB.sync(this.shiftB);
                    }
                    else if (data1 === 0x03) {
                        this.mixer.deckB.toggleVinyl();
                    }
                    else if (data1 === 0x09) { // LOOP IN / 1/2
                        if (this.shiftB) this.mixer.deckB.halveLoop();
                        else this.mixer.deckB.setLoopIn();
                    }
                    else if (data1 === 0x0A) { // LOOP OUT / 2X / EXIT
                        if (this.shiftB) this.mixer.deckB.doubleLoop();
                        else if (this.mixer.deckB.loopActive) this.mixer.deckB.exitLoop();
                        else this.mixer.deckB.setLoopOut();
                    }
                    else if (data1 === 0x0D || data1 === 0x0E) {
                        if (this.shiftB) this.mixer.deckB.loadTrack('', '');
                        else this.loadSelectedTrackToDeck('b');
                    }
                    else if (data1 === 0x00) this.mixer.deckB.setPadMode('hotcue');
                    else if (data1 === 0x01) this.mixer.deckB.setPadMode('stems');
                    else if (data1 === 0x02) this.mixer.deckB.setPadMode('fx');
                    else if (data1 === 0x0F) this.mixer.deckB.setPadMode('sampler');
                }

                // ==================== DECK A PADS (UNIVERSAL CHANNELS 6, 4, 8, 1) ====================
                if (channel === 6 || channel === 4 || channel === 8 || (channel === 1 && data1 >= 0x10 && data1 <= 0x2F)) {
                    const padIdx = (data1 & 0x03);
                    const isShift = this.shiftA || (data1 >= 0x08 && data1 <= 0x0B) || (data1 >= 0x18 && data1 <= 0x1B);
                    this.handlePadAction('a', padIdx + 1, isShift);
                    return;
                }

                // ==================== DECK B PADS (UNIVERSAL CHANNELS 7, 5, 9, 2) ====================
                if (channel === 7 || channel === 5 || channel === 9 || (channel === 2 && data1 >= 0x10 && data1 <= 0x2F)) {
                    const padIdx = (data1 & 0x03);
                    const isShift = this.shiftB || (data1 >= 0x08 && data1 <= 0x0B) || (data1 >= 0x18 && data1 <= 0x1B);
                    this.handlePadAction('b', padIdx + 1, isShift);
                    return;
                }

                // ==================== CENTRAL BROWSER & ASSISTANT (CHANNEL 0) ====================
                else if (channel === 0) {
                    if (data1 === 0x00 || data1 === 0x01) {
                        this.onBrowserClick();
                    }
                    else if (data1 === 0x03 || data1 === 0x04) {
                        this.toggleAssistant();
                    }
                    else if (data1 === 0x02 || data1 === 0x05 || data1 === 0x09) {
                        this.prepareSelectedTrack();
                    }
                    else if (data1 === 0x08 || data1 === 0x0E) {
                        this.beatmatchGuide = !this.beatmatchGuide;
                        this.sendMidi([0x90, 0x08, this.beatmatchGuide ? 0x7F : 0x00]);
                        showToast(`Guía Beatmatch: ${this.beatmatchGuide ? 'ACTIVADA' : 'Desactivada'}`, 'info');
                    }
                }
            }

            // 2. FADERS & KNOBS (CC)
            else if (cmd === 11) {
                if (channel === 0) {
                    if (data1 === 0x00) {
                        const pct = (data2 / 127.0) * 100;
                        const xfader = document.getElementById('mixer-crossfader');
                        if (xfader) {
                            xfader.value = pct;
                            xfader.dispatchEvent(new Event('input'));
                        }
                    } else if (data1 === 0x01 || data1 === 0x03) {
                        const delta = data2 > 64 ? data2 - 128 : data2;
                        this.navigateCrate(delta);
                    } else if (data1 === 0x06) {
                        const masterKnob = document.getElementById('master-volume');
                        if (masterKnob) {
                            masterKnob.value = (data2 / 127.0) * 1.5;
                            masterKnob.dispatchEvent(new Event('input'));
                        }
                    } else if (data1 === 0x07) {
                        const val = (data2 / 127.0) * 1.5;
                        if (this.mixer.headphoneGain && window.djAudioCtx) {
                            this.mixer.headphoneGain.gain.setTargetAtTime(val, window.djAudioCtx.currentTime, 0.015);
                        }
                        showToast(`🎧 Volumen Auriculares: ${Math.round((data2 / 127.0) * 100)}%`, 'info');
                    }
                }

                // Deck A CCs
                else if (channel === 1) {
                    if (data1 === 0x00) this.setSlider('deck-a-fader', data2 / 127.0);
                    else if (data1 === 0x01) this.setSlider('deck-a-filter', ((data2 - 64) / 64.0) * 100);
                    else if (data1 === 0x02) this.setSlider('deck-a-eq-low', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x03) this.setSlider('deck-a-eq-mid', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x04) this.setSlider('deck-a-eq-high', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x05) this.setSlider('deck-a-gain', (data2 / 127.0) * 2.0);
                    else if (data1 === 0x08) {
                        this.pitchState.a.msb = data2;
                        this.apply14BitPitch('a');
                    } else if (data1 === 0x28) {
                        this.pitchState.a.lsb = data2;
                        this.apply14BitPitch('a');
                    }
                    else if (data1 === 0x0A || data1 === 0x09) {
                        const delta = data2 > 64 ? data2 - 128 : data2;
                        this.mixer.deckA.applyHardwareJogDelta(delta, this.touchA, this.shiftA);
                    }
                }

                // Deck B CCs
                else if (channel === 2) {
                    if (data1 === 0x00) this.setSlider('deck-b-fader', data2 / 127.0);
                    else if (data1 === 0x01) this.setSlider('deck-b-filter', ((data2 - 64) / 64.0) * 100);
                    else if (data1 === 0x02) this.setSlider('deck-b-eq-low', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x03) this.setSlider('deck-b-eq-mid', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x04) this.setSlider('deck-b-eq-high', ((data2 - 64) / 64.0) * 24);
                    else if (data1 === 0x05) this.setSlider('deck-b-gain', (data2 / 127.0) * 2.0);
                    else if (data1 === 0x08) {
                        this.pitchState.b.msb = data2;
                        this.apply14BitPitch('b');
                    } else if (data1 === 0x28) {
                        this.pitchState.b.lsb = data2;
                        this.apply14BitPitch('b');
                    }
                    else if (data1 === 0x0A || data1 === 0x09) {
                        const delta = data2 > 64 ? data2 - 128 : data2;
                        this.mixer.deckB.applyHardwareJogDelta(delta, this.touchB, this.shiftB);
                    }
                }
            }
        } catch (err) {
            console.warn('MIDI event exception:', err);
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
            const targetStem = stemNames[padIndex - 1];
            deck.toggleStem(targetStem, isShift);
        } else if (deck.padMode === 'fx') {
            deck.triggerFX(padIndex, isShift);
        } else if (deck.padMode === 'sampler') {
            playDJSoundSample(padIndex);
        }
    }

    apply14BitPitch(deckId) {
        const state = this.pitchState[deckId];
        const val14 = (state.msb << 7) | state.lsb;
        const pitchPct = ((val14 - 8192) / 8192.0) * 16.0;

        const deck = deckId === 'a' ? this.mixer.deckA : this.mixer.deckB;
        deck.setPitch(pitchPct);

        const slider = document.getElementById(`deck-${deckId}-pitch`);
        if (slider) slider.value = pitchPct;
    }

    setSlider(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input'));
        }
    }

    navigateCrate(delta) {
        const rows = document.querySelectorAll('.crate-track-row');
        if (rows.length === 0) return;

        this.selectedCrateIndex = Math.max(0, Math.min(rows.length - 1, this.selectedCrateIndex + delta));
        rows.forEach((r, idx) => {
            const isSel = idx === this.selectedCrateIndex;
            r.classList.toggle('selected-track', isSel);
            if (isSel) {
                r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    onBrowserClick() {
        const rows = document.querySelectorAll('.crate-track-row');
        if (rows.length === 0) return;
        const targetRow = rows[this.selectedCrateIndex] || rows[0];

        const isPlayingA = this.mixer.deckA.audio && !this.mixer.deckA.audio.paused;
        const targetDeck = isPlayingA ? 'b' : 'a';

        const btn = targetRow?.querySelector(`.load-${targetDeck}`);
        if (btn) {
            btn.click();
            showToast(`🎵 Cargada en Deck ${targetDeck.toUpperCase()} desde Browser`, 'success');
        }
    }

    toggleAssistant() {
        this.assistantEnergy = ((this.assistantEnergy || 0) % 4) + 1;
        const energies = {
            1: { name: 'Azul (Chill / Intro)', midiVal: 0x01 },
            2: { name: 'Verde (Warm-up)', midiVal: 0x02 },
            3: { name: 'Ámbar (Peak Time)', midiVal: 0x03 },
            4: { name: 'Rojo (Máxima Energía)', midiVal: 0x04 }
        };
        const eInfo = energies[this.assistantEnergy];

        this.sendMidi([0x90, 0x03, eInfo.midiVal]);
        this.sendMidi([0x90, 0x04, eInfo.midiVal]);

        showToast(`✨ ASISTENTE DJ: Nivel ${this.assistantEnergy} - ${eInfo.name}`, 'info');

        const rows = document.querySelectorAll('.crate-track-row');
        if (rows.length > 0) {
            const targetIdx = (this.assistantEnergy * 3) % rows.length;
            this.selectedCrateIndex = targetIdx;
            this.navigateCrate(0);
        }
    }

    prepareSelectedTrack() {
        const rows = document.querySelectorAll('.crate-track-row');
        if (rows.length === 0) return;
        const targetRow = rows[this.selectedCrateIndex] || rows[0];
        if (targetRow) {
            targetRow.classList.toggle('prepared-track');
            this.sendMidi([0x90, 0x02, 0x7F]);
            this.sendMidi([0x90, 0x05, 0x7F]);
            const trackTitle = targetRow.querySelector('.crate-track-name-cell')?.textContent || 'Pista';
            showToast(`⭐ ${trackTitle.trim()} añadida a Preparación (ASSIST PREP)`, 'success');
        }
    }

    loadSelectedTrackToDeck(deckId) {
        const rows = document.querySelectorAll('.crate-track-row');
        if (rows.length === 0) return;
        const targetRow = rows[this.selectedCrateIndex] || rows[0];
        const btn = targetRow?.querySelector(`.load-${deckId}`);
        if (btn) btn.click();
    }
}

// -------------------------------------------------------------
// DJ Mixer Global Controller (Discrete Dual Audio Architecture)
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

            // Master to Headphone tap (controlled by MASTER PFL button)
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

            window.herculesMidi = new HerculesMidiController(this);
            window.herculesMidi.init();

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
            // 4-CHANNEL SURROUND (Hercules Inpulse 200: Master = 0 & 1, Headphones = 2 & 3)
            dest.channelCount = 4;
            dest.channelCountMode = 'explicit';
            dest.channelInterpretation = 'discrete';

            this.channelMerger = window.djAudioCtx.createChannelMerger(4);

            // Master L/R -> Discrete Channels 0 & 1 (RCA Back Out)
            const masterSplitter = window.djAudioCtx.createChannelSplitter(2);
            this.masterLimiter.connect(masterSplitter);
            masterSplitter.connect(this.channelMerger, 0, 0);
            masterSplitter.connect(this.channelMerger, 1, 1);

            // Headphone CUE L/R -> Discrete Channels 2 & 3 (Front 3.5mm Jack)
            const hpSplitter = window.djAudioCtx.createChannelSplitter(2);
            this.headphoneGain.connect(hpSplitter);
            hpSplitter.connect(this.channelMerger, 0, 2);
            hpSplitter.connect(this.channelMerger, 1, 3);

            this.channelMerger.connect(dest);
            console.log('[*] 4-Channel Discrete DJ Output Enabled: Master (0,1) & Headphones (2,3)');
        } else {
            // STEREO DESTINATION (Master ONLY - CUE stays separate and never bleeds into speakers)
            dest.channelCount = 2;
            dest.channelCountMode = 'max';
            dest.channelInterpretation = 'speakers';

            this.masterLimiter.connect(dest);
            console.log('[*] 2-Channel Master Output Active.');
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

            if (this.deckA?.analyser) {
                this.deckA.analyser.getByteTimeDomainData(dataArrayA);
                this.drawDeckWaveform(ctxA, canvasA, dataArrayA, '#00d2ff', this.deckA);
                if (vuMeterA) {
                    const rmsA = this.calculateRMS(dataArrayA);
                    vuMeterA.style.height = `${Math.min(100, rmsA * 180)}%`;
                }
            }

            if (this.deckB?.analyser) {
                this.deckB.analyser.getByteTimeDomainData(dataArrayB);
                this.drawDeckWaveform(ctxB, canvasB, dataArrayB, '#00f5a0', this.deckB);
                if (vuMeterB) {
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

    drawDeckWaveform(ctx, canvas, dataArray, color, deck) {
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#07090e';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();

        const sliceWidth = w / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * h) / 2;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();
    }
}

// -------------------------------------------------------------
// Global Export & Functions
// -------------------------------------------------------------
window.djMixer = new DJMixer();

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

    // Route pre-fader audio into CUE Bus
    if (deck.pflGain && window.djAudioCtx) {
        deck.pflGain.gain.setTargetAtTime(deck.pflActive ? 1.0 : 0.0, window.djAudioCtx.currentTime, 0.01);
    }

    const btn = document.getElementById(`btn-deck-${deckId}-pfl`);
    if (btn) btn.classList.toggle('active', deck.pflActive);

    if (window.herculesMidi) {
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
