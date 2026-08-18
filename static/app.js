// ==============================================================================
// VIRTUAL DJ PRO - UNIVERSAL FRONTEND CONTROLLER, CRATE ENGINE & HARDWARE I/O
// ==============================================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// DOM Elements Cache
const mainSearchForm = document.getElementById('main-search-form');
const mainSearchInput = document.getElementById('main-search-input');
const youtubeResultsGrid = document.getElementById('youtube-results-grid');
const trackList = document.getElementById('track-list');
const crateTrackList = document.getElementById('crate-track-list');
const libraryCount = document.getElementById('library-count');
const crateFilteredCount = document.getElementById('crate-filtered-count');
const crateCategoryTitle = document.getElementById('crate-category-title');
const queueList = document.getElementById('queue-list');
const queueBadge = document.getElementById('queue-badge');
const crateSearchInput = document.getElementById('crate-search-input');
const librarySearchInput = document.getElementById('library-search-input');

// Audio routing & settings modal elements
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');
const selectAudioMaster = document.getElementById('select-audio-master');
const selectAudioHeadphones = document.getElementById('select-audio-headphones');
const selectAudioMic = document.getElementById('select-audio-mic');
const inputCustomMusicDir = document.getElementById('input-custom-music-dir');
const btnApplyMusicDir = document.getElementById('btn-apply-music-dir');

// Navigation Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// State
let youtubeResults = [];
let libraryTracks = [];
let availableOutputs = [];
let availableInputs = [];
let currentPlayingId = null;
let currentPlayingType = null;
let currentFolderFilter = 'all';

// Audio preview element
const audioElement = new Audio();
audioElement.volume = 1.0;

// Toast notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 250);
    }, 2800);
}
window.showToast = showToast;

// -------------------------------------------------------------
// Universal Audio Hardware Detection (Browser + Backend)
// -------------------------------------------------------------
async function loadAudioDevicesConfig() {
    try {
        let outputs = [];
        let inputs = [];

        // 1. Browser Native MediaDevices Query (Chrome, Edge, Brave, Firefox)
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            try {
                const devs = await navigator.mediaDevices.enumerateDevices();
                devs.forEach((dev, idx) => {
                    const label = dev.label || (dev.kind === 'audiooutput' ? `Salida de Audio ${idx+1}` : `Entrada Micrófono ${idx+1}`);
                    const n_low = label.toLowerCase();
                    if (dev.kind === 'audiooutput') {
                        let icon = '🔊';
                        if (n_low.includes('headphone') || n_low.includes('auricular') || n_low.includes('cue') || n_low.includes('jack')) icon = '🎧';
                        else if (n_low.includes('dj') || n_low.includes('hercules') || n_low.includes('pioneer') || n_low.includes('inpulse') || n_low.includes('traktor')) icon = '🎛️';
                        outputs.push({
                            id: dev.deviceId,
                            name: label,
                            icon: icon,
                            is_default: dev.deviceId === 'default'
                        });
                    } else if (dev.kind === 'audioinput') {
                        inputs.push({
                            id: dev.deviceId,
                            name: label,
                            icon: '🎤',
                            is_default: dev.deviceId === 'default'
                        });
                    }
                });
            } catch (e) {}
        }

        // 2. Fetch server-side system soundcards (ALSA/PipeWire/WMI/CoreAudio)
        const res = await fetch('/api/audio-config');
        if (res.ok) {
            const data = await res.json();
            if (outputs.length === 0 && data.outputs) outputs = data.outputs;
            if (inputs.length === 0 && data.inputs) inputs = data.inputs;
            if (inputCustomMusicDir && data.music_dir) {
                inputCustomMusicDir.value = data.music_dir;
            }
        }

        availableOutputs = outputs;
        availableInputs = inputs;
        populateDeviceSelects();
    } catch (err) {
        console.warn('Failed to load audio config:', err);
    }
}

function populateDeviceSelects() {
    if (!selectAudioMaster || !selectAudioHeadphones || !selectAudioMic) return;

    // Detect if we have an Inpulse 200 / Hercules / DJ Soundcard
    const hasDjCard = availableOutputs.some(dev => dev.name.toLowerCase().includes('inpulse') || dev.name.toLowerCase().includes('hercules') || dev.name.toLowerCase().includes('4.0'));

    selectAudioMaster.innerHTML = availableOutputs.map(dev => {
        const isDjCard = dev.name.toLowerCase().includes('inpulse') || dev.name.toLowerCase().includes('hercules') || dev.name.toLowerCase().includes('4.0');
        const isSelected = hasDjCard ? isDjCard : dev.is_default;
        return `
            <option value="${escapeHtml(dev.id)}" ${isSelected ? 'selected' : ''}>
                ${dev.icon} ${escapeHtml(dev.name)} ${dev.is_default ? '(Predeterminado)' : ''}
            </option>
        `;
    }).join('');

    selectAudioHeadphones.innerHTML = `
        <option value="hardware_cue" selected>🎛️ Salida Jack Integrada Controladora (Canales 3-4)</option>
    ` + availableOutputs.map(dev => `
        <option value="${escapeHtml(dev.id)}">
            ${dev.icon} ${escapeHtml(dev.name)}
        </option>
    `).join('');

    selectAudioMic.innerHTML = `
        <option value="none">🚫 Ninguno / Desactivado</option>
    ` + availableInputs.map(dev => `
        <option value="${escapeHtml(dev.id)}" ${dev.is_default ? 'selected' : ''}>
            ${dev.icon} ${escapeHtml(dev.name)}
        </option>
    `).join('');
}

if (btnApplyMusicDir && inputCustomMusicDir) {
    btnApplyMusicDir.addEventListener('click', async () => {
        const newDir = inputCustomMusicDir.value.trim();
        if (!newDir) return;

        try {
            const res = await fetch('/api/set-music-dir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ music_dir: newDir })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showToast(`Directorio actualizado: ${data.music_dir}`, 'success');
                fetchLibrary();
            } else {
                showToast(`Error: ${data.error}`, 'error');
            }
        } catch (e) {
            showToast('Error al cambiar directorio', 'error');
        }
    });
}

if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
        loadAudioDevicesConfig();
        settingsModal?.classList.remove('hidden');
    });
}

function closeSettings() {
    if (settingsModal) settingsModal.classList.add('hidden');
}

if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettings);

if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
        const masterSink = selectAudioMaster?.value || 'default';
        const headphonesSink = selectAudioHeadphones?.value || 'hardware_cue';
        const micSource = selectAudioMic?.value;

        localStorage.setItem('dj_master_sink', masterSink);
        localStorage.setItem('dj_headphones_sink', headphonesSink);
        localStorage.setItem('dj_mic_source', micSource);

        if (masterSink && masterSink !== 'default' && masterSink !== 'hardware_cue') {
            try {
                const res = await fetch('/api/set-audio-route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        master_id: masterSink,
                        device_id: masterSink,
                        headphones_id: headphonesSink
                    })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    showToast(`Salida de Audio configurada: ${data.device_id || masterSink}`, 'success');
                }
            } catch (err) {}
        }

        closeSettings();
    });
}

// -------------------------------------------------------------
// Universal Local File & Drag & Drop Handling
// -------------------------------------------------------------
window.handleDeckFileInput = function(deckId, inputEl) {
    if (inputEl.files && inputEl.files.length > 0) {
        const file = inputEl.files[0];
        window.loadLocalAudioFileToDeck(deckId, file);
    }
};

window.loadLocalAudioFileToDeck = function(deckId, file) {
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const fileName = file.name;
    if (!window.djMixer.initialized) window.djMixer.init();
    const deck = deckId === 'a' ? window.djMixer.deckA : window.djMixer.deckB;
    if (deck) {
        deck.loadTrack(fileName, blobUrl);
        showToast(`📂 Archivo local cargado en Deck ${deckId.toUpperCase()}: ${fileName}`, 'success');
    }
};

function setupUniversalDragAndDrop() {
    ['a', 'b'].forEach(deckId => {
        const deckCard = document.querySelector(`.deck-card-${deckId}`);
        if (!deckCard) return;

        deckCard.addEventListener('dragover', (e) => {
            e.preventDefault();
            deckCard.style.outline = '2px dashed var(--deck-a-color)';
        });

        deckCard.addEventListener('dragleave', () => {
            deckCard.style.outline = '';
        });

        deckCard.addEventListener('drop', (e) => {
            e.preventDefault();
            deckCard.style.outline = '';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                window.loadLocalAudioFileToDeck(deckId, file);
            }
        });
    });
}

// -------------------------------------------------------------
// Quick Test Sound
// -------------------------------------------------------------
window.testAudioTone = function(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(type === 'master' ? 440 : 880, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        showToast(`Tono de prueba ${type.toUpperCase()} enviado`, 'info');
    } catch (e) {}
};

// -------------------------------------------------------------
// Fullscreen Control
// -------------------------------------------------------------
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', toggleFullscreen);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
    }
});

// -------------------------------------------------------------
// Tab Switching
// -------------------------------------------------------------
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
    });
});

function switchTab(tabId) {
    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
    tabPanes.forEach(p => p.classList.toggle('active', p.id === tabId));

    if (tabId === 'tab-mixer' && window.djMixer && !window.djMixer.initialized) {
        window.djMixer.init();
    }
}

// -------------------------------------------------------------
// YouTube Search & Preview Streaming
// -------------------------------------------------------------
if (mainSearchForm) {
    mainSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = mainSearchInput.value.trim();
        if (!query) return;

        if (query.includes('playlist?list=')) {
            await sendDownloadRequest({ query, title: query });
            switchTab('tab-queue');
            return;
        }

        await performYouTubeSearch(query);
    });
}

async function performYouTubeSearch(query) {
    switchTab('tab-youtube');
    youtubeResultsGrid.innerHTML = `
        <div class="empty-state">
            <h4>Buscando "${escapeHtml(query)}" en YouTube...</h4>
            <p class="text-muted">Extrayendo pistas para preescucha.</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        youtubeResults = data.results || [];
        renderYouTubeResults();
    } catch (err) {
        youtubeResultsGrid.innerHTML = `
            <div class="empty-state">
                <h4>Error al buscar en YouTube</h4>
            </div>
        `;
    }
}

function renderYouTubeResults() {
    if (youtubeResults.length === 0) {
        youtubeResultsGrid.innerHTML = `<div class="empty-state"><h4>No se encontraron resultados</h4></div>`;
        return;
    }

    youtubeResultsGrid.innerHTML = youtubeResults.map((item) => {
        const isPlaying = currentPlayingType === 'youtube' && currentPlayingId === item.id && !audioElement.paused;
        return `
            <div class="yt-card ${isPlaying ? 'active-preview' : ''}" id="yt-card-${escapeHtml(item.id)}">
                <div class="yt-thumbnail-wrapper">
                    <img class="yt-thumbnail" src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(item.title)}" loading="lazy">
                    <span class="yt-duration-badge">${escapeHtml(item.duration_string || '00:00')}</span>
                </div>
                <div class="yt-card-body">
                    <div>
                        <div class="yt-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                        <div class="yt-card-channel">${escapeHtml(item.uploader || '')}</div>
                    </div>
                    <div class="yt-card-actions">
                        <button class="btn-preview" onclick="togglePreviewYouTube('${escapeHtml(item.id)}', '${encodeURIComponent(item.url)}', '${encodeURIComponent(item.title)}')">
                            ${isPlaying ? '⏸ Pausa' : '▶ Escuchar'}
                        </button>
                        <button class="btn-download-card" id="btn-dl-${escapeHtml(item.id)}" onclick="downloadYouTubeTrack('${encodeURIComponent(item.url)}', '${encodeURIComponent(item.title)}', '${escapeHtml(item.id)}')">
                            ⬇ Bajar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.togglePreviewYouTube = async function(id, encUrl, encTitle) {
    const title = decodeURIComponent(encTitle);
    if (currentPlayingType === 'youtube' && currentPlayingId === id) {
        if (audioElement.paused) {
            audioElement.play();
        } else {
            audioElement.pause();
        }
        renderYouTubeResults();
        return;
    }

    currentPlayingId = id;
    currentPlayingType = 'youtube';
    renderYouTubeResults();

    audioElement.src = `/api/preview-stream?id=${encodeURIComponent(id)}`;
    try {
        await audioElement.play();
        showToast(`Preescucha: ${title}`, 'info');
    } catch (err) {}
};

window.downloadYouTubeTrack = async function(encUrl, encTitle, id) {
    const url = decodeURIComponent(encUrl);
    const title = decodeURIComponent(encTitle);
    const btn = document.getElementById(`btn-dl-${id}`);
    if (btn) {
        btn.textContent = '⏳ En cola...';
        btn.disabled = true;
    }

    await sendDownloadRequest({ query: url, title: title });
    showToast(`"${title}" en cola`, 'success');
};

async function sendDownloadRequest(payload) {
    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        fetchQueue();
    } catch (err) {}
}

document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        if (query) {
            if (mainSearchInput) mainSearchInput.value = query;
            performYouTubeSearch(query);
        }
    });
});

// -------------------------------------------------------------
// Folder Tree & Crate Table Filtering (All Audio Formats)
// -------------------------------------------------------------
window.filterCrateByFolder = function(folderKey) {
    currentFolderFilter = folderKey;
    document.querySelectorAll('.tree-node').forEach(node => {
        node.classList.toggle('active', node.getAttribute('data-filter') === folderKey);
    });

    const labels = {
        'all': '📁 Toda la Música',
        'afro': '🌴 Afro House & Deep',
        'latin': '🔥 Latin & Reparto',
        'dance': '⚡ EDM, Dance & Club',
        'pop': '🇪🇸 Pop & Indie Español',
        'mixxx': '📂 Carpeta Mixxx'
    };

    if (crateCategoryTitle) {
        const titleText = labels[folderKey] || '📁 Biblioteca';
        crateCategoryTitle.innerHTML = `${titleText} <span class="badge" id="crate-filtered-count">0</span>`;
    }

    renderCrateTable();
};

async function fetchLibrary() {
    try {
        const res = await fetch('/api/library');
        if (!res.ok) return;
        const data = await res.json();
        libraryTracks = data.tracks || [];

        if (libraryCount) libraryCount.textContent = data.count || 0;

        renderTrackList();
        renderCrateTable();
    } catch (err) {}
}

function getFilteredTracks() {
    const query = (crateSearchInput?.value || '').trim().toLowerCase();
    
    return libraryTracks.filter(track => {
        const name = (track.name || '').toLowerCase();
        const matchesQuery = !query || name.includes(query);
        if (!matchesQuery) return false;

        if (currentFolderFilter === 'all') return true;
        if (currentFolderFilter === 'afro') return name.includes('afro') || name.includes('deep') || name.includes('house');
        if (currentFolderFilter === 'latin') return name.includes('latin') || name.includes('reparto') || name.includes('bunny') || name.includes('salsa') || name.includes('quevedo') || name.includes('anthony');
        if (currentFolderFilter === 'dance') return name.includes('edm') || name.includes('titanium') || name.includes('guetta') || name.includes('dance') || name.includes('club') || name.includes('gladiator') || name.includes('titanic');
        if (currentFolderFilter === 'pop') return name.includes('indie') || name.includes('español') || name.includes('gipsy') || name.includes('izal') || name.includes('pop');
        if (currentFolderFilter === 'mixxx') return name.includes('mixxx') || name.includes('mix');
        return true;
    });
}

function renderCrateTable() {
    if (!crateTrackList) return;
    const filtered = getFilteredTracks();

    const countBadge = document.getElementById('crate-filtered-count');
    if (countBadge) {
        countBadge.textContent = filtered.length;
    }

    if (filtered.length === 0) {
        crateTrackList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:0.75rem; color:var(--text-dim);">No hay pistas en esta carpeta.</td></tr>`;
        return;
    }

    crateTrackList.innerHTML = filtered.map((track, idx) => `
        <tr class="crate-track-row" id="crate-row-${idx}">
            <td class="crate-track-name-cell" title="${escapeHtml(track.name)}">🎵 ${escapeHtml(track.stem)}</td>
            <td>${track.size_mb}M</td>
            <td><span style="color:var(--deck-a-color); font-weight:700;">${escapeHtml(track.ext)}</span></td>
            <td style="text-align:right;">
                <button class="btn-load-inline load-a" onclick="loadTrackToDeck('a', '${encodeURIComponent(track.rel_path || track.name)}', '${encodeURIComponent(track.stem)}')">👈 A</button>
                <button class="btn-load-inline load-b" onclick="loadTrackToDeck('b', '${encodeURIComponent(track.rel_path || track.name)}', '${encodeURIComponent(track.stem)}')">B 👉</button>
            </td>
        </tr>
    `).join('');
}

if (crateSearchInput) {
    crateSearchInput.addEventListener('input', renderCrateTable);
}

function renderTrackList() {
    if (!trackList) return;
    const query = (librarySearchInput?.value || '').trim().toLowerCase();
    const filtered = libraryTracks.filter(t => !query || (t.name || '').toLowerCase().includes(query));

    if (filtered.length === 0) {
        trackList.innerHTML = `<div class="loading-state text-muted" style="padding:0.5rem;">No se encontraron pistas.</div>`;
        return;
    }

    trackList.innerHTML = filtered.map(track => `
        <div class="track-item">
            <div style="flex:1; min-width:0; margin-right:0.5rem;">
                <strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🎵 ${escapeHtml(track.stem)}</strong>
                <span class="text-dim" style="font-size:0.7rem;">${escapeHtml(track.ext)} • ${track.size_mb} MB</span>
            </div>
            <div class="track-actions">
                <button class="btn-load-inline load-a" onclick="loadTrackToDeck('a', '${encodeURIComponent(track.rel_path || track.name)}', '${encodeURIComponent(track.stem)}')">👈 DECK A</button>
                <button class="btn-load-inline load-b" onclick="loadTrackToDeck('b', '${encodeURIComponent(track.rel_path || track.name)}', '${encodeURIComponent(track.stem)}')">DECK B 👉</button>
            </div>
        </div>
    `).join('');
}

// -------------------------------------------------------------
// Download Queue & Polling
// -------------------------------------------------------------
async function fetchQueue() {
    try {
        const res = await fetch('/api/queue');
        if (!res.ok) return;
        const data = await res.json();
        const tasks = data.tasks || [];

        const pending = tasks.filter(t => t.status === 'pending' || t.status === 'downloading');
        if (queueBadge) {
            queueBadge.textContent = pending.length;
            queueBadge.style.display = pending.length > 0 ? 'inline-block' : 'none';
        }

        renderQueue(tasks);
    } catch (err) {}
}

function renderQueue(tasks) {
    if (!queueList) return;
    if (tasks.length === 0) {
        queueList.innerHTML = `<div class="empty-state"><h4>No hay descargas activas</h4></div>`;
        return;
    }

    queueList.innerHTML = tasks.map(task => {
        let badgeClass = 'badge-pending';
        let statusText = 'En cola';
        if (task.status === 'downloading') {
            badgeClass = 'badge-downloading';
            statusText = `Descargando ${task.progress}%`;
        } else if (task.status === 'completed') {
            badgeClass = 'badge-completed';
            statusText = 'Completado';
        } else if (task.status === 'failed') {
            badgeClass = 'badge-failed';
            statusText = 'Error';
        }

        return `
            <div class="queue-item">
                <div class="queue-item-header">
                    <strong>${escapeHtml(task.title || task.query)}</strong>
                    <span class="badge ${badgeClass}">${statusText}</span>
                </div>
                ${task.status === 'downloading' ? `
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width:${task.progress}%"></div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Global folder opener
const btnOpenFolder = document.getElementById('btn-open-folder');
if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', async () => {
        try {
            await fetch('/api/open-folder', { method: 'POST' });
            showToast('Abriendo carpeta de música...', 'info');
        } catch (e) {}
    });
}

// Auto-polling & Init
document.addEventListener('DOMContentLoaded', () => {
    fetchLibrary();
    fetchQueue();
    setupUniversalDragAndDrop();
    setInterval(fetchQueue, 2000);
    setInterval(fetchLibrary, 5000);
});
