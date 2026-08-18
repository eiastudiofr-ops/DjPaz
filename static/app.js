// Virtual DJ Pro Studio - Main Client Engine (1280x800 Zero-Scroll Edition with Folder Tree)

let youtubeResults = [];
let libraryTracks = [];
let currentPlayingId = null;
let currentPlayingType = null;
let queuePollingInterval = null;
let currentFolderFilter = 'all';

let availableOutputs = [];
let availableInputs = [];

// DOM Elements
const mainSearchForm = document.getElementById('main-search-form');
const mainSearchInput = document.getElementById('main-search-input');
const youtubeResultsGrid = document.getElementById('youtube-results-grid');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const trackList = document.getElementById('track-list');
const crateTrackList = document.getElementById('crate-track-list');
const crateSearchInput = document.getElementById('crate-search-input');
const crateCategoryTitle = document.getElementById('crate-category-title');
const crateFilteredCount = document.getElementById('crate-filtered-count');
const libraryCount = document.getElementById('library-count');
const librarySearchInput = document.getElementById('library-search-input');

const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const queueStatusText = document.getElementById('queue-status-text');

const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
const fsTextLabel = document.getElementById('fs-text-label');

const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');

const selectAudioMaster = document.getElementById('select-audio-master');
const selectAudioHeadphones = document.getElementById('select-audio-headphones');
const selectAudioMic = document.getElementById('select-audio-mic');
const selectCrossfaderCurve = document.getElementById('select-crossfader-curve');
const selectJogSensitivity = document.getElementById('select-jog-sensitivity');

const audioElement = document.getElementById('global-audio-element');

// Toast notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
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

// -------------------------------------------------------------
// Settings Modal & Audio Routing
// -------------------------------------------------------------
async function loadAudioDevicesConfig() {
    try {
        const res = await fetch('/api/audio-config');
        if (!res.ok) return;
        const data = await res.json();

        availableOutputs = data.outputs || [];
        availableInputs = data.inputs || [];

        populateDeviceSelects();
    } catch (err) {
        console.warn('Failed to load audio config:', err);
    }
}

function populateDeviceSelects() {
    if (!selectAudioMaster || !selectAudioHeadphones || !selectAudioMic) return;

    selectAudioMaster.innerHTML = availableOutputs.map(dev => `
        <option value="${dev.id}">
            ${dev.icon} ${dev.name} ${dev.is_default ? '(Predeterminado)' : ''}
        </option>
    `).join('');

    selectAudioHeadphones.innerHTML = availableOutputs.map(dev => `
        <option value="${dev.id}" ${dev.name.toLowerCase().includes('uc03') ? 'selected' : ''}>
            ${dev.icon} ${dev.name}
        </option>
    `).join('');

    selectAudioMic.innerHTML = `
        <option value="none">🚫 Ninguno / Desactivado</option>
    ` + availableInputs.map(dev => `
        <option value="${dev.id}" ${dev.is_default ? 'selected' : ''}>
            ${dev.icon} ${dev.name}
        </option>
    `).join('');
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
        const masterSink = selectAudioMaster?.value || '36';
        const headphonesSink = selectAudioHeadphones?.value || '88';
        const micSource = selectAudioMic?.value;

        localStorage.setItem('dj_master_sink', masterSink);
        localStorage.setItem('dj_headphones_sink', headphonesSink);
        localStorage.setItem('dj_mic_source', micSource);

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
                showToast(`✅ Salida activada: ${data.device_name || masterSink}`, 'success');
            } else {
                showToast('Salida configurada', 'info');
            }
        } catch (err) {
            showToast('Error al aplicar', 'error');
        }
        closeSettings();
    });
}

window.testAudioTone = function(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(type === 'master' ? 440 : 880, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.4);

        showToast(`🔊 Tono de prueba ${type.toUpperCase()}`, 'info');
    } catch (e) {}
};

// -------------------------------------------------------------
// Fullscreen Mode Controller
// -------------------------------------------------------------
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', toggleFullscreen);
}

document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    if (fsTextLabel) {
        fsTextLabel.textContent = isFs ? '⛶ Salir Pantalla' : '⛶ Pantalla Completa';
    }
});

window.addEventListener('keydown', (e) => {
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
            <h4>Buscando "${query}" en YouTube...</h4>
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
            <div class="yt-card ${isPlaying ? 'active-preview' : ''}" id="yt-card-${item.id}">
                <div class="yt-thumbnail-wrapper">
                    <img class="yt-thumbnail" src="${item.thumbnail}" alt="${item.title}" loading="lazy">
                    <span class="yt-duration-badge">${item.duration_str}</span>
                </div>
                <div class="yt-card-body">
                    <div>
                        <div class="yt-card-title" title="${item.title}">${item.title}</div>
                        <div class="yt-card-channel">${item.channel}</div>
                    </div>
                    <div class="yt-card-actions">
                        <button class="btn-preview" onclick="togglePreviewYouTube('${item.id}', '${item.url.replace(/'/g, "\\'")}', '${item.title.replace(/'/g, "\\'")}', '${item.channel.replace(/'/g, "\\'")}')">
                            ${isPlaying ? '⏸ Pausa' : '▶ Escuchar'}
                        </button>
                        <button class="btn-download-card" id="btn-dl-${item.id}" onclick="downloadYouTubeTrack('${item.url.replace(/'/g, "\\'")}', '${item.title.replace(/'/g, "\\'")}', '${item.id}')">
                            ⬇ Bajar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.togglePreviewYouTube = async function(id, url, title, channel) {
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

window.downloadYouTubeTrack = async function(url, title, id) {
    const btn = document.getElementById(`btn-dl-${id}`);
    if (btn) {
        btn.textContent = '⏳ En cola...';
        btn.disabled = true;
    }

    await sendDownloadRequest({ query: url, title: title });
    showToast(`"${title}" en cola`, 'success');
};

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
// Folder Tree & Crate Table Filtering (Zero-Scroll Edition)
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
        crateCategoryTitle.textContent = labels[folderKey] || '📁 Biblioteca';
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
        const name = track.name.toLowerCase();
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

    if (crateFilteredCount) {
        crateFilteredCount.textContent = filtered.length;
    }

    if (filtered.length === 0) {
        crateTrackList.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:0.75rem; color:var(--text-dim);">No hay pistas en esta carpeta.</td></tr>`;
        return;
    }

    crateTrackList.innerHTML = filtered.map((track, idx) => `
        <tr class="crate-track-row" id="crate-row-${idx}">
            <td class="crate-track-name-cell" title="${track.name}">🎵 ${track.stem}</td>
            <td>${track.size_mb}M</td>
            <td><span style="color:var(--deck-a-color); font-weight:700;">${track.ext}</span></td>
            <td style="text-align:right;">
                <button class="btn-load-inline load-a" onclick="loadTrackToDeck('a', '${encodeURIComponent(track.name)}', '${track.stem.replace(/'/g, "\\'")}')">👈 A</button>
                <button class="btn-load-inline load-b" onclick="loadTrackToDeck('b', '${encodeURIComponent(track.name)}', '${track.stem.replace(/'/g, "\\'")}')">B 👉</button>
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
    const filtered = libraryTracks.filter(t => !query || t.name.toLowerCase().includes(query));

    if (filtered.length === 0) {
        trackList.innerHTML = `<div class="loading-state text-muted" style="padding:0.5rem;">No se encontraron pistas.</div>`;
        return;
    }

    trackList.innerHTML = filtered.map(track => `
        <div class="track-item">
            <div style="flex:1; min-width:0; margin-right:0.5rem;">
                <strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🎵 ${track.stem}</strong>
                <span class="text-dim" style="font-size:0.7rem;">${track.ext} • ${track.size_mb} MB</span>
            </div>
            <div class="track-actions">
                <button class="btn-load-inline load-a" onclick="loadTrackToDeck('a', '${encodeURIComponent(track.name)}', '${track.stem.replace(/'/g, "\\'")}')">👈 DECK A</button>
                <button class="btn-load-inline load-b" onclick="loadTrackToDeck('b', '${encodeURIComponent(track.name)}', '${track.stem.replace(/'/g, "\\'")}')">DECK B 👉</button>
            </div>
        </div>
    `).join('');
}

if (librarySearchInput) {
    librarySearchInput.addEventListener('input', renderTrackList);
}

// -------------------------------------------------------------
// Download Queue Polling & UI
// -------------------------------------------------------------
async function sendDownloadRequest(payload) {
    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'queued') {
            showToast(`Descarga encolada`, 'success');
            fetchQueue();
        }
    } catch (err) {}
}

async function fetchQueue() {
    try {
        const res = await fetch('/api/queue');
        if (!res.ok) return;
        const data = await res.json();
        renderQueue(data.tasks || []);
    } catch (err) {}
}

let lastCompletedCount = 0;

function renderQueue(tasks) {
    if (queueCount) queueCount.textContent = tasks.length;
    const hasActive = tasks.some(t => t.status === 'downloading' || t.status === 'pending');
    if (queueStatusText) {
        queueStatusText.textContent = hasActive ? 'Descargando...' : 'Inactivo';
        queueStatusText.className = `status-indicator ${hasActive ? 'active' : ''}`;
    }

    const currentCompleted = tasks.filter(t => t.status === 'completed').length;
    if (currentCompleted > lastCompletedCount) {
        lastCompletedCount = currentCompleted;
        fetchLibrary();
    }

    if (!queueList) return;
    if (tasks.length === 0) {
        queueList.innerHTML = `<div class="text-muted" style="padding:0.5rem;">No hay descargas en curso.</div>`;
        return;
    }

    queueList.innerHTML = tasks.slice(0, 10).map(task => `
        <div style="background:var(--vdj-bg-surface); border:1px solid var(--vdj-border); padding:0.4rem 0.65rem; border-radius:4px; margin-bottom:0.3rem; display:flex; justify-content:space-between; font-size:0.75rem;">
            <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">${task.title || task.query}</span>
            <span style="color:var(--deck-b-color); font-weight:700;">${task.status === 'downloading' ? `${task.progress}%` : task.status}</span>
        </div>
    `).join('');
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
fetchLibrary();
fetchQueue();
loadAudioDevicesConfig();
queuePollingInterval = setInterval(fetchQueue, 1500);
