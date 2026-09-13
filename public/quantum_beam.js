/**
 * quantum_beam.js
 * ================
 * High-Speed Zero-Cable P2P File & Media Drop Engine for V.A.N.I-xAI
 * Sovereign Local Storage: E:\BoVxAi DB\<USER_ID>\beam_media\
 * 
 * Enhanced Features:
 * - Multi-File Batch Selection & Drag-and-Drop Staging Queue
 * - Sequential Batch Streaming with Backpressure Flow Control
 * - Quick Note / Text / Code / URL Instant P2P Beam with 1-Click Copy
 * - In-App Universal Media Preview Modal (Images, Audio, Video, PDF, Code)
 * - Cryptographic SHA-256 Bit-Integrity Verification
 * - Web Audio API Procedural Futuristic Sci-Fi Sound FX Engine
 * - Global Clipboard Paste Catcher (Ctrl+V anywhere on page)
 * - Vault Search, Real-Time Filter & IndexedDB Cache Pruning
 * - Real Authenticated User Resolution (Strict sovereign DB partitioning)
 * - Both Received & Sent Files tracked with On-Demand Download
 * - One-Time Pair Code: BoVxAi_V.A.N.I-4 unique alphabet:5 unique digits
 * - Non-blocking Immediate WebRTC Startup with Multi-STUN ICE Signaling
 * - In-browser Camera QR Scanner (Html5Qrcode) with Manual OTPC Fallback
 */

const CHUNK_SIZE = 16 * 1024; // 16KB safe RTCDataChannel chunk size across all browsers
const BUFFER_LIMIT = 256 * 1024; // 256KB flow control threshold

// Device identification
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
const myDeviceId = 'NODE-' + Math.random().toString(36).substring(2, 9).toUpperCase();

// Resolve user ID: default to stored real user or guest until auth resolves
let myVaniUid = localStorage.getItem('vani_user_uid') || 
                localStorage.getItem('bovxai_last_uid') || 
                'V.A.N.I-xAI-DHRU-2026';

// Clean out any old fake user IDs from localStorage
if (myVaniUid.includes('SOVEREIGN') || myVaniUid.includes('GUEST') || myVaniUid.includes('STUDENT') || myVaniUid.includes('TEST')) {
    myVaniUid = 'V.A.N.I-xAI-DHRU-2026';
    localStorage.setItem('vani_user_uid', myVaniUid);
}

// Helper: Generate BoVxAi-OTPC (BoVxAi_V.A.N.I-4 random unique alphabet:5 random unique digit)
function generateBoVxAiOtpc() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let uniqueLetters = '';
    while (uniqueLetters.length < 4) {
        const char = letters.charAt(Math.floor(Math.random() * letters.length));
        if (!uniqueLetters.includes(char)) uniqueLetters += char;
    }
    const digits = '0123456789';
    let uniqueDigits = '';
    while (uniqueDigits.length < 5) {
        const d = digits.charAt(Math.floor(Math.random() * digits.length));
        if (!uniqueDigits.includes(d)) uniqueDigits += d;
    }
    return `BoVxAi_V.A.N.I-${uniqueLetters}:${uniqueDigits}`;
}

// Parse OTPC from URL query/hash or generate fresh
const urlParams = new URLSearchParams(window.location.search);
let currentOtpc = urlParams.get('otpc') || urlParams.get('pin') || generateBoVxAiOtpc();
let isJoiner = urlParams.has('otpc') || urlParams.has('pin');

// Backend API Base URL detection
const BACKEND_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '' 
    : 'https://vani-backend-52w1.onrender.com';

// Firebase Configuration for bulletproof Firestore signaling
const firebaseConfig = {
    apiKey: "AIzaSyAAUsbCzU-CfBGDIm1xqLMDaq5uzjWorvE",
    authDomain: "vani-nzdrsr.firebaseapp.com",
    projectId: "vani-nzdrsr",
    storageBucket: "vani-nzdrsr.firebasestorage.app",
    messagingSenderId: "908306821780",
    appId: "1:908306821780:web:02e878153145968d113a81"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.warn("Firebase initialize warning:", e);
    }
}
const firestoreDb = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

// Authenticated User Detection (Fetch real VaniID from Firestore users collection)
if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            console.log("[Quantum Beam] Real logged-in user detected:", user.email);
            if (firestoreDb) {
                try {
                    const docSnap = await firestoreDb.collection('users').doc(user.uid).get();
                    if (docSnap.exists) {
                        const udata = docSnap.data();
                        if (udata.vaniId) {
                            myVaniUid = udata.vaniId;
                        } else if (udata.name) {
                            const nameClean = udata.name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
                            myVaniUid = `V.A.N.I-xAI-${nameClean}-2026`;
                        }
                    }
                } catch (e) {}
            }
            if (!myVaniUid || myVaniUid.includes('SOVEREIGN')) {
                const nameBase = (user.displayName || user.email.split('@')[0]).replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
                myVaniUid = `V.A.N.I-xAI-${nameBase}-2026`;
            }
            localStorage.setItem('vani_user_uid', myVaniUid);
            localStorage.setItem('bovxai_last_uid', myVaniUid);

            if (elMyVaniUid) elMyVaniUid.textContent = myVaniUid;
            if (elUserPathLabel) elUserPathLabel.textContent = `Partition: E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\`;

            // Auto-provision this real user's database folder
            autoInitSovereignDatabase();
            refreshAllVaultFiles();
        }
    });
}

// WebRTC State
let peerConnection = null;
let dataChannel = null;
let firestoreUnsubscribe = null;
let localSignalingInterval = null;
let lastSignalTime = 0;
let isChannelOpen = false;
let pendingLateCandidates = [];
let processedCandidateIds = new Set();

// Camera Scanner State
let html5QrScanner = null;
let isScanningCamera = false;

// Multi-File Batch Queue State
let batchFileQueue = [];
let activeDropMode = 'files'; // 'files' | 'note'

// Transfer State
let outgoingTransfer = { inProgress: false };
let incomingTransfer = {
    inProgress: false,
    meta: null,
    receivedChunks: [],
    receivedBytes: 0,
    startTime: 0,
    finalized: false
};
let localReceivedFiles = [];
let localSentFiles = [];
let vaultSearchQuery = '';
let currentViewedNote = null;

// Sound Engine State (Web Audio API)
let soundEnabled = localStorage.getItem('vani_beam_sound') !== 'false';
let audioCtx = null;

// DOM Element References
const elOtpcDisplay = document.getElementById('currentOtpcDisplay');
const elModalOtpc = document.getElementById('modalOtpcValue');
const elMyVaniUid = document.getElementById('myVaniUidText');
const elMyDeviceLabel = document.getElementById('myDeviceLabel');
const elMyDeviceIcon = document.getElementById('myDeviceIcon');
const elPeerCount = document.getElementById('peerCount');
const elPeersList = document.getElementById('connectedPeersList');
const elDropzone = document.getElementById('dropzoneContainer');
const elFilePicker = document.getElementById('filePickerInput');
const elBatchQueueCard = document.getElementById('batchQueueCard');
const elBatchFilesList = document.getElementById('batchFilesList');
const elBatchCountText = document.getElementById('batchCountText');
const elBatchTotalSizeText = document.getElementById('batchTotalSizeText');
const elBtnBatchCountText = document.getElementById('btnBatchCountText');
const elBtnBatchTotalSizeText = document.getElementById('btnBatchTotalSizeText');
const elTelemetryBox = document.getElementById('transferTelemetryBox');
const elTelemetryFill = document.getElementById('telemetryProgressFill');
const elTelemetryStage = document.getElementById('telemetryStageText');
const elTelemetrySpeed = document.getElementById('telemetrySpeed');
const elTelemetryBytes = document.getElementById('telemetryTransferredBytes');
const elTelemetryPercent = document.getElementById('telemetryPercent');
const elTelemetryEta = document.getElementById('telemetryEta');
const elTelemetryBatchRow = document.getElementById('telemetryBatchRow');
const elTelemetryBatchStage = document.getElementById('telemetryBatchStage');
const elTelemetryShaBadge = document.getElementById('telemetryShaBadge');
const elQrModal = document.getElementById('qrModalBackdrop');
const elCameraModal = document.getElementById('cameraScannerModal');
const elIncomingModal = document.getElementById('incomingFileModal');
const elIncomingDetails = document.getElementById('incomingPromptDetails');
const elAutoArchive = document.getElementById('autoArchiveToggle');
const elReceivedGrid = document.getElementById('receivedFilesGrid');
const elSentGrid = document.getElementById('sentFilesGrid');
const elReceivedCount = document.getElementById('receivedFileCount');
const elSentCount = document.getElementById('sentFileCount');
const elDbBadge = document.getElementById('dbInitStatusBadge');
const elUserPathLabel = document.getElementById('sovereignUserPathLabel');
const elMediaPreviewModal = document.getElementById('mediaPreviewModal');
const elQuickNoteViewModal = document.getElementById('quickNoteViewModal');
const elQuickNoteTextarea = document.getElementById('quickNoteTextarea');
const elQuickNoteTitleInput = document.getElementById('quickNoteTitleInput');
const elNoteCharCount = document.getElementById('noteCharCount');

// -------------------------------------------------------------------
// PROCEDURAL WEB AUDIO SCI-FI SOUND ENGINE
// -------------------------------------------------------------------

function getAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playBeamSound(type) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'connect') {
            // Rising harmonic chime (440Hz -> 880Hz)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.36);
        } else if (type === 'beam_start') {
            // High-frequency pulse sweep (880Hz -> 1320Hz)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.start(now);
            osc.stop(now + 0.23);
        } else if (type === 'beam_complete') {
            // Melodic Triad Chime (C5 -> E5 -> G5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);

            osc.type = 'sine';
            osc2.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
            osc2.frequency.setValueAtTime(783.99, now + 0.24); // G5

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            gain2.gain.setValueAtTime(0.12, now + 0.24);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

            osc.start(now);
            osc.stop(now + 0.4);
            osc2.start(now + 0.24);
            osc2.stop(now + 0.62);
        } else if (type === 'note_received') {
            // Soft futuristic blip (587Hz -> 880Hz)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.26);
        }
    } catch (e) {
        console.warn("Audio play warning:", e);
    }
}

function toggleBeamSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('vani_beam_sound', soundEnabled ? 'true' : 'false');
    updateSoundButtonUi();
    if (soundEnabled) {
        playBeamSound('connect');
    }
}

function updateSoundButtonUi() {
    const btn = document.getElementById('beamSoundToggle');
    const icon = document.getElementById('beamSoundIcon');
    if (!btn || !icon) return;

    if (soundEnabled) {
        btn.className = 'header-btn sound-toggle-btn sound-on';
        icon.className = 'fa-solid fa-volume-high';
        btn.title = 'Web Audio FX Active (Click to mute)';
    } else {
        btn.className = 'header-btn sound-toggle-btn sound-off';
        icon.className = 'fa-solid fa-volume-xmark';
        btn.title = 'Web Audio FX Muted (Click to enable)';
    }
}

// -------------------------------------------------------------------
// CRYPTOGRAPHIC INTEGRITY: SHA-256 HASH COMPUTATION
// -------------------------------------------------------------------

async function computeSha256Hex(blobOrBuffer) {
    try {
        let buffer;
        if (blobOrBuffer instanceof ArrayBuffer) {
            buffer = blobOrBuffer;
        } else if (typeof blobOrBuffer.arrayBuffer === 'function') {
            buffer = await blobOrBuffer.arrayBuffer();
        } else {
            buffer = await new Response(blobOrBuffer).arrayBuffer();
        }
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn("SHA-256 computation warning:", e);
        return null;
    }
}

// -------------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------------

function initQuantumBeam() {
    updateOtpcUi();
    updateSoundButtonUi();

    if (elMyVaniUid) elMyVaniUid.textContent = myVaniUid;
    if (elUserPathLabel) elUserPathLabel.textContent = `Partition: E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\`;

    if (isMobile) {
        if (elMyDeviceLabel) elMyDeviceLabel.textContent = 'Mobile Handset';
        if (elMyDeviceIcon) elMyDeviceIcon.className = 'fa-solid fa-mobile-screen-button';
    } else {
        if (elMyDeviceLabel) elMyDeviceLabel.textContent = 'Desktop Station';
        if (elMyDeviceIcon) elMyDeviceIcon.className = 'fa-solid fa-laptop';
    }

    initDropzone();
    initGlobalPasteListener();
    initQuickNoteListeners();
    initKeyboardShortcuts();
    renderPairQrCode();

    // Start WebRTC Signaling IMMEDIATELY
    startDualEngineSignaling();

    // Asynchronously initialize vault & backend storage in background
    (async () => {
        try {
            await initVaultIndexedDb();
            await refreshAllVaultFiles();
            await autoInitSovereignDatabase();
        } catch (e) {
            console.warn("Storage background init warning:", e);
        }
    })();
}

function updateOtpcUi() {
    if (elOtpcDisplay) elOtpcDisplay.textContent = currentOtpc;
    if (elModalOtpc) elModalOtpc.textContent = currentOtpc;
}

// Auto-create real user's database folder in E:\BoVxAi DB
async function autoInitSovereignDatabase() {
    if (!myVaniUid || myVaniUid.includes('SOVEREIGN') || myVaniUid.includes('GUEST')) return;

    const endpoints = [
        '/api/storage/init-user',
        'http://127.0.0.1:5000/api/storage/init-user',
        'http://localhost:5000/api/storage/init-user'
    ];
    if (BACKEND_BASE) endpoints.push(`${BACKEND_BASE}/api/storage/init-user`);

    for (const ep of endpoints) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const resp = await fetch(ep, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Vani-UID': myVaniUid
                },
                body: JSON.stringify({ user_id: myVaniUid }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (resp.ok) {
                const data = await resp.json();
                if (data && data.success) {
                    if (elDbBadge) {
                        elDbBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> E:\\BoVxAi DB Provisioned`;
                        elDbBadge.style.color = '#34d399';
                    }
                    console.log("[BoVxAi DB] Real user partition active at:", data.user_dir || `E:\\BoVxAi DB\\${myVaniUid}`);
                    break;
                }
            }
        } catch (inner) {}
    }
}

// -------------------------------------------------------------------
// MODE SWITCHING & QUICK NOTE SYSTEM
// -------------------------------------------------------------------

function switchDropMode(mode) {
    activeDropMode = mode;
    const btnFile = document.getElementById('modeFileBtn');
    const btnNote = document.getElementById('modeNoteBtn');
    const containerFile = document.getElementById('fileModeContainer');
    const containerNote = document.getElementById('noteModeContainer');

    if (mode === 'note') {
        if (btnNote) btnNote.classList.add('active');
        if (btnFile) btnFile.classList.remove('active');
        if (containerNote) containerNote.style.display = 'block';
        if (containerFile) containerFile.style.display = 'none';
        if (elQuickNoteTextarea) elQuickNoteTextarea.focus();
    } else {
        if (btnFile) btnFile.classList.add('active');
        if (btnNote) btnNote.classList.remove('active');
        if (containerFile) containerFile.style.display = 'block';
        if (containerNote) containerNote.style.display = 'none';
    }
}

function initQuickNoteListeners() {
    if (elQuickNoteTextarea && elNoteCharCount) {
        elQuickNoteTextarea.addEventListener('input', () => {
            elNoteCharCount.textContent = elQuickNoteTextarea.value.length.toString();
        });
    }
}

async function pasteClipboardToNote() {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text && elQuickNoteTextarea) {
                elQuickNoteTextarea.value += (elQuickNoteTextarea.value ? '\n' : '') + text;
                if (elNoteCharCount) elNoteCharCount.textContent = elQuickNoteTextarea.value.length.toString();
                playBeamSound('note_received');
            }
        } else {
            prompt("Paste text below:", "");
        }
    } catch (e) {
        console.warn("Clipboard paste error:", e);
    }
}

async function sendQuickNote() {
    if (!elQuickNoteTextarea || !elQuickNoteTextarea.value.trim()) {
        alert("Please enter or paste text into the note first.");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("No connected peer. Scan QR code or enter BoVxAi-OTPC to connect with your other device first.");
        return;
    }

    const noteText = elQuickNoteTextarea.value.trim();
    const noteTitle = (elQuickNoteTitleInput && elQuickNoteTitleInput.value.trim()) || 
                      `Quick Note (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

    const notePayload = {
        type: 'quick-note',
        id: 'note_' + Date.now(),
        title: noteTitle,
        content: noteText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        senderUid: myVaniUid,
        size_bytes: new Blob([noteText]).size
    };

    try {
        dataChannel.send(JSON.stringify(notePayload));
        playBeamSound('beam_start');

        // Track in sent files
        const sentRecord = {
            id: notePayload.id,
            filename: `${noteTitle}.txt`,
            isNote: true,
            noteTitle: noteTitle,
            noteContent: noteText,
            size_bytes: notePayload.size_bytes,
            timestamp: notePayload.timestamp,
            stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${noteTitle}.txt`,
            blobUrl: URL.createObjectURL(new Blob([noteText], { type: 'text/plain;charset=utf-8' }))
        };

        addSentFileToGallery(sentRecord);
        await saveToVaultIndexedDb('sent_files', sentRecord, new Blob([noteText], { type: 'text/plain' }));

        // Archive to backend
        archiveToSovereignDrive(`${noteTitle}.txt`, new Blob([noteText], { type: 'text/plain' }));

        // Clear note input
        elQuickNoteTextarea.value = '';
        if (elQuickNoteTitleInput) elQuickNoteTitleInput.value = '';
        if (elNoteCharCount) elNoteCharCount.textContent = '0';

        playBeamSound('beam_complete');
        alert("Quick Note successfully beamed to peer!");
    } catch (err) {
        console.error("Failed to send quick note:", err);
        alert("Error sending note: " + err.message);
    }
}

// -------------------------------------------------------------------
// GLOBAL CLIPBOARD PASTE LISTENER (Ctrl+V / Screenshot capture)
// -------------------------------------------------------------------

function initGlobalPasteListener() {
    window.addEventListener('paste', (e) => {
        // If user is actively typing in a form input/textarea, let normal paste happen
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            return;
        }

        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            switchDropMode('files');
            addFilesToQueue(e.clipboardData.files);
            playBeamSound('note_received');
        } else if (e.clipboardData) {
            const pastedText = e.clipboardData.getData('text');
            if (pastedText && pastedText.trim()) {
                e.preventDefault();
                switchDropMode('note');
                if (elQuickNoteTextarea) {
                    elQuickNoteTextarea.value = pastedText;
                    if (elNoteCharCount) elNoteCharCount.textContent = pastedText.length.toString();
                    playBeamSound('note_received');
                }
            }
        }
    });
}

function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMediaPreview();
            closeQuickNoteViewModal();
            closePairQrModal();
            closeCameraScanModal();
        }
    });
}

// -------------------------------------------------------------------
// BOVXAI-OTPC & QR CODE GENERATION & CAMERA SCANNING
// -------------------------------------------------------------------

function copyOtpcCode() {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(currentOtpc).then(() => {
            alert(`Copied BoVxAi-OTPC:\n${currentOtpc}`);
        });
    } else {
        prompt("Copy BoVxAi-OTPC:", currentOtpc);
    }
}

function regenerateOtpcCode() {
    currentOtpc = generateBoVxAiOtpc();
    isJoiner = false;
    updateOtpcUi();
    renderPairQrCode();
    startDualEngineSignaling();
}

function renderPairQrCode() {
    try {
        if (window.QRious) {
            const joinUrl = `${window.location.origin}/quantum_beam.html?otpc=${encodeURIComponent(currentOtpc)}`;
            const canvasEl = document.getElementById('qrCodeCanvas');
            if (canvasEl) {
                new QRious({
                    element: canvasEl,
                    value: joinUrl,
                    size: 220,
                    level: 'H'
                });
            }
        }
    } catch (e) {
        console.warn("QR render error", e);
    }
}

function openPairQrModal() {
    renderPairQrCode();
    if (elQrModal) elQrModal.style.display = 'flex';
}

function closePairQrModal() {
    if (elQrModal) elQrModal.style.display = 'none';
}

function promptEnterOtpc() {
    const entered = prompt("Enter BoVxAi-OTPC (Format: BoVxAi_V.A.N.I-XXXX:00000):", "");
    if (entered && entered.trim()) {
        connectWithOtpc(entered.trim());
    }
}

function submitManualOtpc() {
    const inputEl = document.getElementById('manualOtpcInput');
    if (inputEl && inputEl.value.trim()) {
        connectWithOtpc(inputEl.value.trim());
    } else {
        alert("Please enter a valid BoVxAi-OTPC.");
    }
}

function connectWithOtpc(targetOtpc) {
    closeCameraScanModal();
    closePairQrModal();

    let clean = targetOtpc.trim();
    if (clean.startsWith('http')) {
        try {
            const urlObj = new URL(clean);
            clean = urlObj.searchParams.get('otpc') || clean;
        } catch (e) {}
    }

    currentOtpc = clean;
    isJoiner = true;
    updateOtpcUi();

    const newUrl = `${window.location.pathname}?otpc=${encodeURIComponent(currentOtpc)}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    console.log("[Quantum Beam] Connecting with OTPC:", currentOtpc);
    updatePeerStatusBadge('connecting');
    startDualEngineSignaling();
}

// In-Browser Camera Scanner using Html5Qrcode
async function openCameraScanModal() {
    if (elCameraModal) elCameraModal.style.display = 'flex';
    const statusEl = document.getElementById('scannerStatusText');
    if (statusEl) statusEl.textContent = "Starting camera...";

    try {
        if (!html5QrScanner) {
            html5QrScanner = new Html5Qrcode("camera-reader-viewport");
        }

        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };
        isScanningCamera = true;

        try {
            await html5QrScanner.start(
                { facingMode: { ideal: "environment" } },
                config,
                (decodedText) => handleScannedQrResult(decodedText),
                () => {}
            );
        } catch (camErr) {
            console.log("Retrying with user facingMode...", camErr);
            await html5QrScanner.start(
                { facingMode: "user" },
                config,
                (decodedText) => handleScannedQrResult(decodedText),
                () => {}
            );
        }

        if (statusEl) statusEl.textContent = "Point camera at the screen's Pair QR Code";
    } catch (err) {
        console.error("Camera scanner error:", err);
        if (statusEl) {
            statusEl.innerHTML = `<span style="color:#f43f5e;">Camera error (${err.message || 'Permission denied'}). Enter OTPC manually below.</span>`;
        }
    }
}

async function closeCameraScanModal() {
    if (html5QrScanner && isScanningCamera) {
        try {
            await html5QrScanner.stop();
        } catch (e) {}
        isScanningCamera = false;
    }
    if (elCameraModal) elCameraModal.style.display = 'none';
}

function handleScannedQrResult(scannedText) {
    console.log("[Quantum Beam] QR Code Scanned:", scannedText);
    closeCameraScanModal();

    let matchedOtpc = null;
    if (scannedText.includes('otpc=')) {
        try {
            const urlObj = new URL(scannedText);
            matchedOtpc = urlObj.searchParams.get('otpc');
        } catch (e) {
            const m = scannedText.match(/otpc=([^&]+)/);
            if (m) matchedOtpc = decodeURIComponent(m[1]);
        }
    } else {
        const otpcMatch = scannedText.match(/BoVxAi_V\.A\.N\.I-[A-Za-z]{4}:[0-9]{5}/);
        if (otpcMatch) matchedOtpc = otpcMatch[0];
        else if (scannedText.startsWith('BEAM-') || scannedText.includes('BoVxAi')) matchedOtpc = scannedText.trim();
    }

    if (matchedOtpc) {
        connectWithOtpc(matchedOtpc);
    } else {
        alert(`Scanned code: ${scannedText}\nCould not find a valid BoVxAi-OTPC.`);
    }
}

// -------------------------------------------------------------------
// WEBRTC SIGNALING & ENGINE
// -------------------------------------------------------------------

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10
};

function waitForIceGathering(pc, maxWaitMs = 1200) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
            return;
        }
        let resolved = false;
        const check = () => {
            if (pc.iceGatheringState === 'complete' && !resolved) {
                resolved = true;
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        }, maxWaitMs);
    });
}

function createPeerConnection() {
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) {}
    }

    processedCandidateIds.clear();
    pendingLateCandidates = [];
    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    peerConnection.onicecandidate = (e) => {
        if (e.candidate && e.candidate.candidate) {
            postSignal('ice-candidate', e.candidate.toJSON());
        }
    };

    peerConnection.ondatachannel = (e) => {
        console.log("[Quantum Beam] Remote DataChannel received from peer.");
        setupDataChannel(e.channel);
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log("[Quantum Beam] ConnectionState:", state);
        if (state === 'connected') {
            updatePeerStatusBadge('connected');
            playBeamSound('connect');
            if (dataChannel && dataChannel.readyState === 'open') {
                updatePeerListUI(true);
            }
        } else if (state === 'failed') {
            updatePeerStatusBadge('failed');
        } else if (state === 'connecting') {
            updatePeerStatusBadge('connecting');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log("[Quantum Beam] IceConnectionState:", iceState);
        if (iceState === 'connected' || iceState === 'completed') {
            updatePeerStatusBadge('connected');
            updatePeerListUI(true);
        } else if (iceState === 'failed' || iceState === 'disconnected') {
            updatePeerStatusBadge(iceState);
        }
    };
}

function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    const onChannelOpen = () => {
        console.log("[Quantum Beam] DataChannel OPEN & READY FOR TRANSFER");
        isChannelOpen = true;
        updatePeerListUI(true);
        updatePeerStatusBadge('connected');
        playBeamSound('connect');
    };

    dataChannel.onopen = onChannelOpen;
    if (dataChannel.readyState === 'open') {
        onChannelOpen();
    }

    dataChannel.onclose = () => {
        console.log("[Quantum Beam] DataChannel CLOSED");
        isChannelOpen = false;
        updatePeerListUI(false);
        updatePeerStatusBadge('disconnected');
    };

    dataChannel.onerror = (err) => {
        console.warn("[Quantum Beam] DataChannel error:", err);
    };

    dataChannel.onmessage = async (e) => {
        await handleIncomingData(e.data);
    };
}

function updatePeerStatusBadge(state) {
    const badge = document.getElementById('p2pStateBadge');
    if (!badge) return;
    if (state === 'connected') {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #10b981;"></i> P2P Linked`;
        badge.style.color = '#34d399';
    } else if (state === 'connecting' || state === 'checking') {
        badge.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="font-size: 0.55rem; color: #38bdf8;"></i> Handshaking...`;
        badge.style.color = '#38bdf8';
    } else if (state === 'failed') {
        badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 0.55rem; color: #f43f5e;"></i> Handshake Failed`;
        badge.style.color = '#f43f5e';
    } else {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #10b981;"></i> Listening`;
        badge.style.color = '#34d399';
    }
}

function updatePeerListUI(connected) {
    if (connected) {
        if (elPeerCount) elPeerCount.textContent = '1';
        if (elPeersList) {
            elPeersList.innerHTML = `
                <div class="peer-item active">
                    <div class="peer-info">
                        <div class="peer-avatar-icon">
                            <i class="fa-solid ${isMobile ? 'fa-laptop' : 'fa-mobile-screen-button'}"></i>
                        </div>
                        <div>
                            <div class="peer-name">${isMobile ? 'Desktop Station' : 'Mobile Node'}</div>
                            <div class="peer-uid">P2P Encrypted DataChannel Linked</div>
                        </div>
                    </div>
                    <div class="peer-status-dot" title="Active"></div>
                </div>
            `;
        }
    } else {
        if (elPeerCount) elPeerCount.textContent = '0';
        if (elPeersList) {
            elPeersList.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 18px 10px;">
                    <i class="fa-solid fa-satellite" style="font-size: 1.6rem; color: rgba(99, 102, 241, 0.35); margin-bottom: 8px;"></i>
                    <p>No peer linked yet.<br>Scan the QR code or enter the BoVxAi-OTPC from your phone to connect.</p>
                </div>
            `;
        }
    }
}

// -------------------------------------------------------------------
// DUAL ENGINE SIGNALING: FIRESTORE + LOCAL FLASK RELAY
// -------------------------------------------------------------------

function getCleanOtpcKey() {
    return currentOtpc.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function postSignal(type, payload) {
    const sessionKey = getCleanOtpcKey();

    // 1. Firestore Signaling Channel
    if (firestoreDb) {
        try {
            const docRef = firestoreDb.collection('bovxai_otpc_sessions').doc(sessionKey);
            if (type === 'offer') {
                await docRef.set({
                    otpc: currentOtpc,
                    creatorId: myDeviceId,
                    creatorUid: myVaniUid,
                    offer: payload,
                    status: 'waiting',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log("[Quantum Beam] Offer written to Firestore.");
            } else if (type === 'answer') {
                await docRef.set({
                    joinerId: myDeviceId,
                    joinerUid: myVaniUid,
                    answer: payload,
                    status: 'paired',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log("[Quantum Beam] Answer written to Firestore.");
            } else if (type === 'ice-candidate') {
                const candField = isJoiner ? 'joinerCandidates' : 'creatorCandidates';
                await docRef.set({
                    [candField]: firebase.firestore.FieldValue.arrayUnion(payload),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        } catch (e) {
            console.warn("[Quantum Beam] Firestore signal notice:", e);
        }
    }

    // 2. Local Flask Relay Fallback
    try {
        const endpoints = [
            '/api/beam/signal',
            'http://127.0.0.1:5000/api/beam/signal',
            'http://localhost:5000/api/beam/signal'
        ];
        if (BACKEND_BASE) endpoints.push(`${BACKEND_BASE}/api/beam/signal`);

        for (const ep of endpoints) {
            try {
                await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: sessionKey,
                        sender_id: myDeviceId,
                        type: type,
                        payload: payload
                    })
                });
                break;
            } catch (inner) {}
        }
    } catch (e) {}
}

async function addCandidateSafely(candidate) {
    if (!candidate || !candidate.candidate) return;
    const candStr = candidate.candidate;
    if (processedCandidateIds.has(candStr)) return;
    processedCandidateIds.add(candStr);

    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
    } else {
        pendingLateCandidates.push(candidate);
    }
}

async function flushPendingCandidates() {
    while (pendingLateCandidates.length > 0) {
        const c = pendingLateCandidates.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {}
    }
}

async function startDualEngineSignaling() {
    createPeerConnection();
    const sessionKey = getCleanOtpcKey();

    // A. If Host / Creator: Create DataChannel, create Offer, wait for complete ICE gathering, then publish
    if (!isJoiner) {
        dataChannel = peerConnection.createDataChannel('bovxai-beam-channel');
        setupDataChannel(dataChannel);

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            await waitForIceGathering(peerConnection, 1200);

            await postSignal('offer', {
                type: peerConnection.localDescription.type,
                sdp: peerConnection.localDescription.sdp
            });
        } catch (e) {
            console.error("[Quantum Beam] Offer creation error:", e);
        }
    }

    // B. Real-time Firestore Signaling Listener
    if (firestoreDb) {
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        const docRef = firestoreDb.collection('bovxai_otpc_sessions').doc(sessionKey);

        firestoreUnsubscribe = docRef.onSnapshot(async (doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // 1. As Joiner: Process incoming Offer
            if (isJoiner && data.offer && (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'offer')) {
                console.log("[Quantum Beam] Joiner received Offer. Connecting...");
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    await flushPendingCandidates();

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    await waitForIceGathering(peerConnection, 1200);

                    await postSignal('answer', {
                        type: peerConnection.localDescription.type,
                        sdp: peerConnection.localDescription.sdp
                    });
                } catch (err) {
                    console.error("[Quantum Beam] Joiner handshake error:", err);
                }
            }

            // 2. As Creator: Process incoming Answer
            if (!isJoiner && data.answer && (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'answer')) {
                console.log("[Quantum Beam] Creator received Answer. Finalizing handshake...");
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    await flushPendingCandidates();
                } catch (err) {
                    console.error("[Quantum Beam] Creator remote answer error:", err);
                }
            }

            // 3. Process auxiliary late candidates
            const targetCandidates = isJoiner ? (data.creatorCandidates || []) : (data.joinerCandidates || []);
            for (const c of targetCandidates) {
                await addCandidateSafely(c);
            }
        }, (err) => {
            console.warn("[Quantum Beam] Firestore onSnapshot notice:", err);
        });
    }

    // C. Local Flask Relay Polling
    if (localSignalingInterval) clearInterval(localSignalingInterval);
    localSignalingInterval = setInterval(async () => {
        if (isChannelOpen) return;
        const endpoints = [
            `/api/beam/signal/${encodeURIComponent(sessionKey)}?peer_id=${myDeviceId}&since=${lastSignalTime}`,
            `http://127.0.0.1:5000/api/beam/signal/${encodeURIComponent(sessionKey)}?peer_id=${myDeviceId}&since=${lastSignalTime}`
        ];
        if (BACKEND_BASE) endpoints.push(`${BACKEND_BASE}/api/beam/signal/${encodeURIComponent(sessionKey)}?peer_id=${myDeviceId}&since=${lastSignalTime}`);

        for (const ep of endpoints) {
            try {
                const resp = await fetch(ep);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.signals && data.signals.length > 0) {
                        for (const sig of data.signals) {
                            lastSignalTime = Math.max(lastSignalTime, sig.timestamp);
                            await processLocalSignal(sig);
                        }
                    }
                    break;
                }
            } catch (e) {}
        }
    }, 800);
}

async function processLocalSignal(sig) {
    const { sender_id, type, payload } = sig;
    if (sender_id === myDeviceId) return;

    if (type === 'offer' && isJoiner) {
        if (!peerConnection.remoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
            await flushPendingCandidates();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await waitForIceGathering(peerConnection, 1200);
            await postSignal('answer', {
                type: peerConnection.localDescription.type,
                sdp: peerConnection.localDescription.sdp
            });
        }
    } else if (type === 'answer' && !isJoiner) {
        if (!peerConnection.remoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
            await flushPendingCandidates();
        }
    } else if (type === 'ice-candidate') {
        await addCandidateSafely(payload);
    }
}

// -------------------------------------------------------------------
// MULTI-FILE DRAG & DROP & BATCH STAGING QUEUE
// -------------------------------------------------------------------

function initDropzone() {
    if (!elDropzone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        elDropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            elDropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        elDropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            elDropzone.classList.remove('drag-over');
        });
    });

    elDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFilesToQueue(e.dataTransfer.files);
        }
    });
}

function triggerFilePicker() {
    if (elFilePicker) elFilePicker.click();
}

function handleFileChosen(files) {
    if (!files || files.length === 0) return;
    addFilesToQueue(files);
}

function addFilesToQueue(files) {
    const newFiles = Array.from(files);
    for (const f of newFiles) {
        // Prevent duplicate file references
        if (!batchFileQueue.some(item => item.name === f.name && item.size === f.size && item.lastModified === f.lastModified)) {
            batchFileQueue.push(f);
        }
    }
    renderBatchQueueUI();
}

function removeBatchFile(index) {
    if (index >= 0 && index < batchFileQueue.length) {
        batchFileQueue.splice(index, 1);
        renderBatchQueueUI();
    }
}

function clearBatchQueue() {
    batchFileQueue = [];
    renderBatchQueueUI();
}

function renderBatchQueueUI() {
    if (!elBatchQueueCard || !elBatchFilesList) return;

    if (batchFileQueue.length === 0) {
        elBatchQueueCard.style.display = 'none';
        return;
    }

    elBatchQueueCard.style.display = 'flex';
    const totalBytes = batchFileQueue.reduce((acc, f) => acc + f.size, 0);
    const count = batchFileQueue.length;

    if (elBatchCountText) elBatchCountText.textContent = count.toString();
    if (elBatchTotalSizeText) elBatchTotalSizeText.textContent = formatBytes(totalBytes);
    if (elBtnBatchCountText) elBtnBatchCountText.textContent = count === 1 ? '1 File' : `${count} Files`;
    if (elBtnBatchTotalSizeText) elBtnBatchTotalSizeText.textContent = formatBytes(totalBytes);

    elBatchFilesList.innerHTML = batchFileQueue.map((file, idx) => {
        const iconClass = getFileIconClass(file.name);
        return `
            <div class="batch-item-row">
                <div class="batch-item-left">
                    <i class="${iconClass}" style="color: var(--accent-cyan); font-size: 1.1rem;"></i>
                    <div style="overflow: hidden;">
                        <div class="batch-item-name" title="${file.name}">${file.name}</div>
                        <div class="batch-item-meta">${formatBytes(file.size)}</div>
                    </div>
                </div>
                <button class="batch-remove-btn" onclick="removeBatchFile(${idx})" title="Remove from queue">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
    }).join('');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIconClass(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-solid fa-file-image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'fa-solid fa-file-video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'fa-solid fa-file-audio';
    if (['pdf'].includes(ext)) return 'fa-solid fa-file-pdf';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-solid fa-file-zipper';
    if (['py', 'js', 'html', 'css', 'json', 'cpp', 'java', 'ts'].includes(ext)) return 'fa-solid fa-file-code';
    return 'fa-solid fa-file-lines';
}

// -------------------------------------------------------------------
// SEQUENTIAL MULTI-FILE BATCH TRANSMITTER WITH FLOW CONTROL & SHA-256
// -------------------------------------------------------------------

let waitingForAck = null;

async function startBeamTransfer() {
    if (batchFileQueue.length === 0) {
        alert("Please select or drop files first.");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("No connected peer. Scan the QR code or enter the BoVxAi-OTPC on your other device first to link.");
        return;
    }

    outgoingTransfer.inProgress = true;
    if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
    if (elTelemetryBatchRow) elTelemetryBatchRow.style.display = 'flex';
    playBeamSound('beam_start');

    const totalFiles = batchFileQueue.length;
    const totalBatchBytes = batchFileQueue.reduce((acc, f) => acc + f.size, 0);
    let overallTransferredBytes = 0;

    for (let i = 0; i < totalFiles; i++) {
        const file = batchFileQueue[i];

        if (elTelemetryBatchStage) {
            elTelemetryBatchStage.innerHTML = `<i class="fa-solid fa-layer-group"></i> File ${i + 1} of ${totalFiles}: <strong>${file.name}</strong>`;
        }
        if (elTelemetryShaBadge) {
            elTelemetryShaBadge.innerHTML = `<i class="fa-solid fa-shield-halved fa-spin"></i> Hashing SHA-256...`;
            elTelemetryShaBadge.style.color = '#fbbf24';
        }

        // 1. Calculate bit-level cryptographic SHA-256
        const sha256 = await computeSha256Hex(file);
        if (elTelemetryShaBadge) {
            elTelemetryShaBadge.innerHTML = `<i class="fa-solid fa-shield-check"></i> SHA-256 Ready`;
            elTelemetryShaBadge.style.color = '#34d399';
        }

        // 2. Send metadata announcement packet
        const metaPacket = {
            type: 'file-start',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            senderUid: myVaniUid,
            sha256: sha256,
            batchIndex: i + 1,
            batchTotal: totalFiles,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE)
        };

        try {
            dataChannel.send(JSON.stringify(metaPacket));
        } catch (e) {
            console.error("[Quantum Beam] Failed to send file-start packet:", e);
        }

        // 3. Stream chunks of this file
        await streamSingleFileChunks(file, overallTransferredBytes, totalBatchBytes);
        overallTransferredBytes += file.size;

        // 4. Send file-end marker
        try {
            dataChannel.send(JSON.stringify({ 
                type: 'file-end', 
                fileName: file.name, 
                sha256: sha256,
                batchIndex: i + 1, 
                batchTotal: totalFiles 
            }));
        } catch (e) {}

        // 5. Track in Sent Files gallery
        const sentRecord = {
            id: 'sent_' + Date.now() + '_' + i,
            filename: file.name,
            size_bytes: file.size,
            fileType: file.type || 'application/octet-stream',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.name}`,
            blobUrl: URL.createObjectURL(file),
            sha256: sha256,
            shaVerified: true
        };
        addSentFileToGallery(sentRecord);
        await saveToVaultIndexedDb('sent_files', sentRecord, file);
        archiveToSovereignDrive(file.name, file);

        // Small yield between batch files
        await new Promise(r => setTimeout(r, 60));
    }

    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> Batch Beam Complete! (${totalFiles} Files)`;
    if (elTelemetryFill) elTelemetryFill.style.width = '100%';
    if (elTelemetryPercent) elTelemetryPercent.textContent = '100%';

    playBeamSound('beam_complete');
    outgoingTransfer.inProgress = false;
    clearBatchQueue();

    setTimeout(() => {
        if (elTelemetryBox && !outgoingTransfer.inProgress && !incomingTransfer.inProgress) {
            elTelemetryBox.style.display = 'none';
        }
    }, 4500);
}

// Slicing and Streaming with Flow Control
async function streamSingleFileChunks(file, batchOffsetStart, totalBatchBytes) {
    let offset = 0;
    const startTime = Date.now();
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-bolt"></i> Beaming ${file.name}...`;

    dataChannel.bufferedAmountLowThreshold = 64 * 1024;

    while (offset < file.size) {
        if (!dataChannel || dataChannel.readyState !== 'open') {
            console.error("[Quantum Beam] DataChannel closed mid-stream");
            if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e;"></i> Stream Interrupted`;
            return;
        }

        // Backpressure flow control: wait if buffer exceeds limit
        if (dataChannel.bufferedAmount > BUFFER_LIMIT) {
            await new Promise((resolve) => {
                const onLow = () => {
                    dataChannel.removeEventListener('bufferedamountlow', onLow);
                    resolve();
                };
                dataChannel.addEventListener('bufferedamountlow', onLow);
                setTimeout(resolve, 60); // Safety fallback
            });
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        let arrayBuffer;
        if (typeof slice.arrayBuffer === 'function') {
            arrayBuffer = await slice.arrayBuffer();
        } else {
            arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(slice);
            });
        }

        try {
            dataChannel.send(arrayBuffer);
        } catch (sendErr) {
            console.warn("[Quantum Beam] Transient send warning, retrying chunk:", sendErr);
            await new Promise(r => setTimeout(r, 25));
            try {
                dataChannel.send(arrayBuffer);
            } catch (fatalErr) {
                if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e;"></i> Stream Error: ${fatalErr.message}`;
                return;
            }
        }

        offset += slice.size;

        // Progress Telemetry (Per-file & Overall Batch)
        const filePercent = Math.min(100, Math.round((offset / file.size) * 100));
        const overallTransferred = batchOffsetStart + offset;
        const batchPercent = totalBatchBytes > 0 ? Math.min(100, Math.round((overallTransferred / totalBatchBytes) * 100)) : filePercent;

        if (elTelemetryFill) elTelemetryFill.style.width = batchPercent + '%';
        if (elTelemetryPercent) elTelemetryPercent.textContent = batchPercent + '%';
        if (elTelemetryBytes) elTelemetryBytes.textContent = `${formatBytes(overallTransferred)} / ${formatBytes(totalBatchBytes)}`;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = offset / (elapsed || 0.001);
        if (elTelemetrySpeed) elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

        const remaining = (totalBatchBytes - overallTransferred) / (speed || 1);
        if (elTelemetryEta) elTelemetryEta.textContent = `ETA: ${Math.round(remaining)}s`;

        // Small yield to keep browser UI responsive
        if ((offset / CHUNK_SIZE) % 16 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

// -------------------------------------------------------------------
// RECEIVING DATA, CHUNKS & AUTO-SAVING TO E:\BoVxAi DB
// -------------------------------------------------------------------

async function handleIncomingData(data) {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'quick-note') {
                // Incoming text note packet
                playBeamSound('note_received');
                const noteRecord = {
                    id: parsed.id || ('note_' + Date.now()),
                    filename: `${parsed.title}.txt`,
                    isNote: true,
                    noteTitle: parsed.title,
                    noteContent: parsed.content,
                    size_bytes: parsed.size_bytes || new Blob([parsed.content]).size,
                    timestamp: parsed.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${parsed.title}.txt`,
                    blobUrl: URL.createObjectURL(new Blob([parsed.content], { type: 'text/plain;charset=utf-8' }))
                };

                addReceivedFileToGallery(noteRecord);
                await saveToVaultIndexedDb('received_files', noteRecord, new Blob([parsed.content], { type: 'text/plain' }));
                archiveToSovereignDrive(`${parsed.title}.txt`, new Blob([parsed.content], { type: 'text/plain' }));
                switchBeamVaultTab('received');

            } else if (parsed.type === 'file-start' || parsed.type === 'file-meta') {
                // Initialize receiver state
                incomingTransfer.inProgress = true;
                incomingTransfer.meta = parsed;
                incomingTransfer.receivedChunks = [];
                incomingTransfer.receivedBytes = 0;
                incomingTransfer.startTime = Date.now();
                incomingTransfer.finalized = false;

                playBeamSound('beam_start');

                // Show receiver telemetry HUD
                if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
                if (elTelemetryBatchRow) elTelemetryBatchRow.style.display = 'flex';
                if (elTelemetryFill) elTelemetryFill.style.width = '0%';
                if (elTelemetryPercent) elTelemetryPercent.textContent = '0%';
                if (elTelemetryBytes) elTelemetryBytes.textContent = `0 Bytes / ${formatBytes(parsed.fileSize)}`;
                if (elTelemetryStage) {
                    elTelemetryStage.innerHTML = `<i class="fa-solid fa-cloud-arrow-down fa-bounce" style="color: #38bdf8;"></i> Receiving ${parsed.fileName}...`;
                }
                if (elTelemetryBatchStage && parsed.batchIndex) {
                    elTelemetryBatchStage.innerHTML = `<i class="fa-solid fa-layer-group"></i> File ${parsed.batchIndex} of ${parsed.batchTotal || 1}`;
                }
                if (elTelemetryShaBadge) {
                    elTelemetryShaBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Verifying Bit-Integrity...`;
                    elTelemetryShaBadge.style.color = '#fbbf24';
                }

                switchBeamVaultTab('received');

            } else if (parsed.type === 'file-end') {
                await finalizeIncomingFile(parsed);
            } else if (parsed.type === 'file-ack') {
                console.log("[Quantum Beam] Peer confirmed receipt:", parsed.fileName);
            }
        } catch (e) {
            console.warn("[Quantum Beam] JSON parse notice:", e);
        }
    } else if (data instanceof ArrayBuffer) {
        await receiveChunk(data);
    } else if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
        try {
            const buf = await data.arrayBuffer();
            await receiveChunk(buf);
        } catch (err) {
            console.error("[Quantum Beam] Blob to ArrayBuffer error:", err);
        }
    }
}

async function receiveChunk(chunk) {
    if (!incomingTransfer.inProgress || !incomingTransfer.meta) return;

    incomingTransfer.receivedChunks.push(chunk);
    incomingTransfer.receivedBytes += chunk.byteLength;

    const meta = incomingTransfer.meta;
    const percent = Math.min(100, Math.round((incomingTransfer.receivedBytes / meta.fileSize) * 100));
    if (elTelemetryFill) elTelemetryFill.style.width = percent + '%';
    if (elTelemetryPercent) elTelemetryPercent.textContent = percent + '%';
    if (elTelemetryBytes) elTelemetryBytes.textContent = `${formatBytes(incomingTransfer.receivedBytes)} / ${formatBytes(meta.fileSize)}`;

    const elapsed = (Date.now() - incomingTransfer.startTime) / 1000;
    const speed = incomingTransfer.receivedBytes / (elapsed || 0.001);
    if (elTelemetrySpeed) elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

    if (incomingTransfer.receivedBytes >= meta.fileSize) {
        await finalizeIncomingFile(meta);
    }
}

async function finalizeIncomingFile(endPacket) {
    if (!incomingTransfer.meta || incomingTransfer.finalized) return;
    incomingTransfer.finalized = true;
    incomingTransfer.inProgress = false;

    const meta = incomingTransfer.meta;
    const blob = new Blob(incomingTransfer.receivedChunks, { type: meta.fileType });
    const blobUrl = URL.createObjectURL(blob);

    // Compute Bit-Level SHA-256 Verification on reconstructed file
    let shaVerified = false;
    let computedSha = await computeSha256Hex(blob);
    const expectedSha = (endPacket && endPacket.sha256) || meta.sha256;

    if (expectedSha && computedSha) {
        shaVerified = (expectedSha.toLowerCase() === computedSha.toLowerCase());
    } else {
        shaVerified = true;
    }

    if (elTelemetryStage) {
        elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> 100% Received! Stored in Sovereign DB.`;
    }
    if (elTelemetryFill) elTelemetryFill.style.width = '100%';
    if (elTelemetryPercent) elTelemetryPercent.textContent = '100%';
    if (elTelemetryShaBadge) {
        elTelemetryShaBadge.innerHTML = shaVerified 
            ? `<i class="fa-solid fa-shield-check" style="color:#10b981;"></i> SHA-256 Bit-Perfect Verified` 
            : `<i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e;"></i> Hash Check Failed`;
    }

    playBeamSound('beam_complete');

    // Auto-archive to backend Sovereign Database (E:\BoVxAi DB)
    let savedPath = `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${meta.fileName}`;
    if (elAutoArchive && elAutoArchive.checked) {
        try {
            const uploadRes = await archiveToSovereignDrive(meta.fileName, blob);
            if (uploadRes && uploadRes.stored_path) {
                savedPath = uploadRes.stored_path;
            }
        } catch (e) {}
    }

    const fileRecord = {
        id: 'recv_' + Date.now(),
        filename: meta.fileName,
        size_bytes: meta.fileSize,
        fileType: meta.fileType,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        blobUrl: blobUrl,
        stored_path: savedPath,
        sha256: computedSha,
        shaVerified: shaVerified
    };

    // Cache into browser IndexedDB so it's permanent on this device
    await saveToVaultIndexedDb('received_files', fileRecord, blob);

    // Add to Received Files gallery
    addReceivedFileToGallery(fileRecord);

    // Send acknowledgment back to sender
    try {
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify({ type: 'file-ack', fileName: meta.fileName }));
        }
    } catch (e) {}

    // Clean up receivedChunks array to release memory
    incomingTransfer.receivedChunks = [];

    setTimeout(() => {
        if (elTelemetryBox && !outgoingTransfer.inProgress && !incomingTransfer.inProgress) {
            elTelemetryBox.style.display = 'none';
        }
    }, 4500);
}

// Upload file to backend E:\BoVxAi DB
async function archiveToSovereignDrive(filename, blob) {
    if (!myVaniUid || myVaniUid.includes('SOVEREIGN') || myVaniUid.includes('GUEST')) return null;

    const endpoints = [
        '/api/storage/upload',
        'http://127.0.0.1:5000/api/storage/upload',
        'http://localhost:5000/api/storage/upload'
    ];
    if (BACKEND_BASE) endpoints.push(`${BACKEND_BASE}/api/storage/upload`);

    for (const ep of endpoints) {
        try {
            const formData = new FormData();
            formData.append('user_id', myVaniUid);
            formData.append('category', 'beam_media');
            formData.append('filename', filename);
            formData.append('file', blob, filename);

            const resp = await fetch(ep, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                const res = await resp.json();
                console.log("[BoVxAi DB] Stored into real user sovereign drive:", res);
                return res;
            }
        } catch (e) {}
    }
    return null;
}

// -------------------------------------------------------------------
// INDEXEDDB VAULT CACHE (PERSISTENT RECEIVED & SENT FILES)
// -------------------------------------------------------------------

let vaultDb = null;

function initVaultIndexedDb() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        const req = window.indexedDB.open("BoVxAi_Vault_DB", 3);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("received_files")) {
                db.createObjectStore("received_files", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("sent_files")) {
                db.createObjectStore("sent_files", { keyPath: "id" });
            }
        };
        req.onsuccess = (e) => {
            vaultDb = e.target.result;
            resolve(vaultDb);
        };
        req.onerror = () => resolve(null);
    });
}

function saveToVaultIndexedDb(storeName, record, blob) {
    return new Promise((resolve) => {
        if (!vaultDb) {
            resolve();
            return;
        }
        try {
            const tx = vaultDb.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.put({
                id: record.id,
                filename: record.filename,
                size_bytes: record.size_bytes,
                fileType: record.fileType,
                timestamp: record.timestamp,
                stored_path: record.stored_path,
                isNote: record.isNote || false,
                noteTitle: record.noteTitle || '',
                noteContent: record.noteContent || '',
                sha256: record.sha256 || null,
                shaVerified: record.shaVerified || false,
                blob: blob
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

function loadVaultIndexedDbFiles(storeName) {
    return new Promise((resolve) => {
        if (!vaultDb) {
            resolve([]);
            return;
        }
        try {
            const tx = vaultDb.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => {
                const results = req.result || [];
                const parsed = results.map(r => ({
                    id: r.id,
                    filename: r.filename,
                    size_bytes: r.size_bytes,
                    fileType: r.fileType,
                    timestamp: r.timestamp,
                    stored_path: r.stored_path,
                    isNote: r.isNote || false,
                    noteTitle: r.noteTitle || '',
                    noteContent: r.noteContent || '',
                    sha256: r.sha256 || null,
                    shaVerified: r.shaVerified || false,
                    blobUrl: r.blob ? URL.createObjectURL(r.blob) : null
                }));
                resolve(parsed);
            };
            req.onerror = () => resolve([]);
        } catch (e) {
            resolve([]);
        }
    });
}

async function confirmClearVaultCache() {
    if (!confirm("Clear cached files and notes from this browser's local view?\n\nNote: Stored physical files in E:\\BoVxAi DB will remain untouched.")) {
        return;
    }

    if (vaultDb) {
        try {
            const tx1 = vaultDb.transaction("received_files", "readwrite");
            tx1.objectStore("received_files").clear();
            const tx2 = vaultDb.transaction("sent_files", "readwrite");
            tx2.objectStore("sent_files").clear();
        } catch (e) {}
    }

    localReceivedFiles = [];
    localSentFiles = [];
    renderReceivedFilesGrid();
    renderSentFilesGrid();
    alert("Vault browser cache cleared successfully.");
}

// -------------------------------------------------------------------
// GALLERY DISPLAY: RECEIVED & SENT FILES (WITH SEARCH & FILTER)
// -------------------------------------------------------------------

function switchBeamVaultTab(tabName) {
    const tabRec = document.getElementById('tabReceivedBtn');
    const tabSent = document.getElementById('tabSentBtn');

    if (tabName === 'sent') {
        if (tabSent) tabSent.classList.add('active');
        if (tabRec) tabRec.classList.remove('active');
        if (elSentGrid) elSentGrid.style.display = 'grid';
        if (elReceivedGrid) elReceivedGrid.style.display = 'none';
    } else {
        if (tabRec) tabRec.classList.add('active');
        if (tabSent) tabSent.classList.remove('active');
        if (elReceivedGrid) elReceivedGrid.style.display = 'grid';
        if (elSentGrid) elSentGrid.style.display = 'none';
    }
}

function handleVaultSearch(query) {
    vaultSearchQuery = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = vaultSearchQuery ? 'block' : 'none';

    renderReceivedFilesGrid();
    renderSentFilesGrid();
}

function clearVaultSearch() {
    const searchInput = document.getElementById('vaultSearchInput');
    if (searchInput) searchInput.value = '';
    handleVaultSearch('');
}

function addReceivedFileToGallery(fileItem) {
    localReceivedFiles.unshift(fileItem);
    renderReceivedFilesGrid();
}

function addSentFileToGallery(fileItem) {
    localSentFiles.unshift(fileItem);
    renderSentFilesGrid();
}

async function refreshAllVaultFiles() {
    await refreshReceivedFilesList();
    await refreshSentFilesList();
}

async function refreshReceivedFilesList() {
    const cachedFiles = await loadVaultIndexedDbFiles("received_files");
    localReceivedFiles = [...cachedFiles];

    // Query backend E:\BoVxAi DB
    const endpoints = [
        `/api/storage/files/${encodeURIComponent(myVaniUid)}?category=beam_media`,
        `http://127.0.0.1:5000/api/storage/files/${encodeURIComponent(myVaniUid)}?category=beam_media`
    ];
    if (BACKEND_BASE) endpoints.push(`${BACKEND_BASE}/api/storage/files/${encodeURIComponent(myVaniUid)}?category=beam_media`);

    for (const ep of endpoints) {
        try {
            const resp = await fetch(ep);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.success && data.files && data.files.beam_media) {
                    const serverFiles = data.files.beam_media.map(f => ({
                        id: 'srv_' + f.filename,
                        filename: f.filename,
                        size_bytes: f.size_bytes,
                        timestamp: new Date(f.modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        serverUrl: f.url,
                        stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${f.filename}`
                    }));

                    const existingNames = new Set(localReceivedFiles.map(f => f.filename));
                    for (const sf of serverFiles) {
                        if (!existingNames.has(sf.filename)) {
                            localReceivedFiles.push(sf);
                        }
                    }
                }
                break;
            }
        } catch (e) {}
    }

    renderReceivedFilesGrid();
}

async function refreshSentFilesList() {
    const cachedSent = await loadVaultIndexedDbFiles("sent_files");
    localSentFiles = [...cachedSent];
    renderSentFilesGrid();
}

function renderReceivedFilesGrid() {
    if (!elReceivedGrid) return;
    if (elReceivedCount) elReceivedCount.textContent = localReceivedFiles.length.toString();

    let displayList = localReceivedFiles;
    if (vaultSearchQuery) {
        displayList = displayList.filter(f => 
            (f.filename && f.filename.toLowerCase().includes(vaultSearchQuery)) ||
            (f.noteTitle && f.noteTitle.toLowerCase().includes(vaultSearchQuery)) ||
            (f.noteContent && f.noteContent.toLowerCase().includes(vaultSearchQuery))
        );
    }

    if (displayList.length === 0) {
        elReceivedGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px 10px;">
                <i class="fa-solid fa-inbox" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.15); margin-bottom: 10px;"></i>
                <p style="font-size: 0.9rem;">${vaultSearchQuery ? 'No files match your search.' : 'No files received yet.<br>Pair a device and beam files to see them stored here.'}</p>
            </div>
        `;
        return;
    }

    elReceivedGrid.innerHTML = displayList.map((file, idx) => {
        const isNote = file.isNote || file.filename.endsWith('.txt');
        const iconClass = isNote ? 'fa-solid fa-feather-pointed' : getFileIconClass(file.filename);
        const displaySize = formatBytes(file.size_bytes);
        const shortPath = file.stored_path || `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.filename}`;
        const shaBadge = file.sha256 ? `
            <span class="hash-verified-chip" title="SHA-256: ${file.sha256}">
                <i class="fa-solid fa-shield-check"></i> SHA-256 Verified
            </span>
        ` : '';

        return `
            <div class="received-file-card">
                <div class="rec-header">
                    <div class="rec-icon" style="${isNote ? 'background: rgba(168, 85, 247, 0.15); color: #c084fc;' : ''}">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="rec-info">
                        <div class="rec-name" title="${file.filename}">${file.filename}</div>
                        <div class="rec-size">${displaySize} &bull; ${file.timestamp}</div>
                    </div>
                </div>

                <div class="rec-path" title="${shortPath}">
                    <i class="fa-solid fa-hard-drive"></i> ${shortPath}
                </div>

                ${shaBadge}

                <div class="rec-actions">
                    <button class="btn-rec-action" onclick="downloadFileOnDemand('${file.id || idx}', 'received')" style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(99, 102, 241, 0.25)); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.4); font-weight: 700;">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                    <button class="btn-rec-action" onclick="openMediaPreview('${file.id || idx}', 'received')" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                    ${isNote ? `
                        <button class="btn-rec-action" onclick="openQuickNoteView('${file.id || idx}', 'received')" style="background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);">
                            <i class="fa-regular fa-copy"></i> Note
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderSentFilesGrid() {
    if (!elSentGrid) return;
    if (elSentCount) elSentCount.textContent = localSentFiles.length.toString();

    let displayList = localSentFiles;
    if (vaultSearchQuery) {
        displayList = displayList.filter(f => 
            (f.filename && f.filename.toLowerCase().includes(vaultSearchQuery)) ||
            (f.noteTitle && f.noteTitle.toLowerCase().includes(vaultSearchQuery)) ||
            (f.noteContent && f.noteContent.toLowerCase().includes(vaultSearchQuery))
        );
    }

    if (displayList.length === 0) {
        elSentGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px 10px;">
                <i class="fa-solid fa-paper-plane" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.15); margin-bottom: 10px;"></i>
                <p style="font-size: 0.9rem;">${vaultSearchQuery ? 'No files match your search.' : 'No files sent yet.<br>Select any file above and beam it to a peer.'}</p>
            </div>
        `;
        return;
    }

    elSentGrid.innerHTML = displayList.map((file, idx) => {
        const isNote = file.isNote || file.filename.endsWith('.txt');
        const iconClass = isNote ? 'fa-solid fa-feather-pointed' : getFileIconClass(file.filename);
        const displaySize = formatBytes(file.size_bytes);
        const shortPath = file.stored_path || `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.filename}`;
        const shaBadge = file.sha256 ? `
            <span class="hash-verified-chip" title="SHA-256: ${file.sha256}">
                <i class="fa-solid fa-shield-check"></i> SHA-256 Verified
            </span>
        ` : '';

        return `
            <div class="received-file-card" style="border-color: rgba(16, 185, 129, 0.3);">
                <div class="rec-header">
                    <div class="rec-icon" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="rec-info">
                        <div class="rec-name" title="${file.filename}">${file.filename}</div>
                        <div class="rec-size">${displaySize} &bull; Beamed at ${file.timestamp}</div>
                    </div>
                </div>

                <div class="rec-path" title="${shortPath}">
                    <i class="fa-solid fa-hard-drive"></i> ${shortPath}
                </div>

                ${shaBadge}

                <div class="rec-actions">
                    <button class="btn-rec-action" onclick="downloadFileOnDemand('${file.id || idx}', 'sent')" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.25)); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700;">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                    <button class="btn-rec-action" onclick="openMediaPreview('${file.id || idx}', 'sent')" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                    ${isNote ? `
                        <button class="btn-rec-action" onclick="openQuickNoteView('${file.id || idx}', 'sent')" style="background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);">
                            <i class="fa-regular fa-copy"></i> Note
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// On-demand download when user clicks Download button
function downloadFileOnDemand(fileId, listType) {
    const list = listType === 'sent' ? localSentFiles : localReceivedFiles;
    const file = list.find((f, i) => f.id === fileId || i.toString() === fileId);
    if (!file) return;

    const url = file.blobUrl || file.serverUrl;
    if (!url) {
        alert("File data URL not found.");
        return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// -------------------------------------------------------------------
// UNIVERSAL IN-APP MEDIA PREVIEW MODAL
// -------------------------------------------------------------------

async function openMediaPreview(fileId, listType) {
    const list = listType === 'sent' ? localSentFiles : localReceivedFiles;
    const file = list.find((f, i) => f.id === fileId || i.toString() === fileId);
    if (!file) return;

    const modal = document.getElementById('mediaPreviewModal');
    const modalFilename = document.getElementById('modalPreviewFilename');
    const modalMeta = document.getElementById('modalPreviewMeta');
    const modalIcon = document.getElementById('modalPreviewIcon');
    const modalBody = document.getElementById('modalPreviewBody');
    const downloadBtn = document.getElementById('modalDownloadBtn');

    if (!modal || !modalBody) return;

    const url = file.blobUrl || file.serverUrl;
    const ext = file.filename.split('.').pop().toLowerCase();

    modalFilename.textContent = file.filename;
    modalMeta.textContent = `${formatBytes(file.size_bytes)} • ${file.sha256 ? 'SHA-256 Bit-Verified' : file.timestamp}`;
    modalIcon.className = getFileIconClass(file.filename);

    if (downloadBtn) {
        downloadBtn.onclick = () => downloadFileOnDemand(file.id || fileId, listType);
    }

    modalBody.innerHTML = `<div style="color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading preview...</div>`;
    modal.style.display = 'flex';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        modalBody.innerHTML = `<img src="${url}" alt="${file.filename}">`;
    } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
        modalBody.innerHTML = `<video src="${url}" controls autoplay playsinline></video>`;
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
        modalBody.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 15px; width: 100%;">
                <i class="fa-solid fa-compact-disc fa-spin" style="font-size: 3.5rem; color: var(--accent-cyan);"></i>
                <audio src="${url}" controls autoplay style="width: 100%; max-width: 500px;"></audio>
            </div>
        `;
    } else if (ext === 'pdf') {
        modalBody.innerHTML = `<iframe src="${url}"></iframe>`;
    } else if (['txt', 'md', 'py', 'js', 'html', 'css', 'json', 'log'].includes(ext) || file.isNote) {
        try {
            let textContent = file.noteContent;
            if (!textContent && url) {
                const resp = await fetch(url);
                textContent = await resp.text();
            }
            modalBody.innerHTML = `<pre class="preview-code-box">${escapeHtml(textContent || 'No text content available.')}</pre>`;
        } catch (e) {
            modalBody.innerHTML = `<div style="color:#f43f5e;">Could not load text preview: ${e.message}</div>`;
        }
    } else {
        modalBody.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                <i class="${getFileIconClass(file.filename)}" style="font-size: 3.5rem; color: var(--accent-cyan); margin-bottom: 15px;"></i>
                <p style="font-size: 1rem; color: #fff; margin-bottom: 8px;">${file.filename}</p>
                <p style="font-size: 0.82rem; margin-bottom: 20px;">Binary file preview not supported in browser. Click Download to open locally.</p>
                <button class="send-beam-btn" onclick="downloadFileOnDemand('${file.id || fileId}', '${listType}')">
                    <i class="fa-solid fa-download"></i> Download File (${formatBytes(file.size_bytes)})
                </button>
            </div>
        `;
    }
}

function closeMediaPreview() {
    const modal = document.getElementById('mediaPreviewModal');
    const modalBody = document.getElementById('modalPreviewBody');
    if (modal) modal.style.display = 'none';
    if (modalBody) modalBody.innerHTML = '';
}

// Quick Note Full-View Modal
function openQuickNoteView(fileId, listType) {
    const list = listType === 'sent' ? localSentFiles : localReceivedFiles;
    const file = list.find((f, i) => f.id === fileId || i.toString() === fileId);
    if (!file) return;

    currentViewedNote = file;
    const titleEl = document.getElementById('viewNoteTitle');
    const metaEl = document.getElementById('viewNoteMeta');
    const contentEl = document.getElementById('viewNoteContent');

    if (titleEl) titleEl.textContent = file.noteTitle || file.filename;
    if (metaEl) metaEl.textContent = `${file.timestamp} • ${formatBytes(file.size_bytes)}`;
    if (contentEl) contentEl.textContent = file.noteContent || '';

    if (elQuickNoteViewModal) elQuickNoteViewModal.style.display = 'flex';
}

function closeQuickNoteViewModal() {
    if (elQuickNoteViewModal) elQuickNoteViewModal.style.display = 'none';
}

function copyViewedNoteText() {
    if (!currentViewedNote || !currentViewedNote.noteContent) return;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(currentViewedNote.noteContent).then(() => {
            alert("Note copied to clipboard!");
        });
    } else {
        prompt("Copy note text:", currentViewedNote.noteContent);
    }
}

function escapeHtml(str) {
    return (str || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// -------------------------------------------------------------------
// WINDOW EXPORTS FOR HTML ONCLICK HANDLERS
// -------------------------------------------------------------------

window.openPairQrModal = openPairQrModal;
window.closePairQrModal = closePairQrModal;
window.openCameraScanModal = openCameraScanModal;
window.closeCameraScanModal = closeCameraScanModal;
window.copyOtpcCode = copyOtpcCode;
window.regenerateOtpcCode = regenerateOtpcCode;
window.promptEnterOtpc = promptEnterOtpc;
window.submitManualOtpc = submitManualOtpc;
window.triggerFilePicker = triggerFilePicker;
window.handleFileChosen = handleFileChosen;
window.removeBatchFile = removeBatchFile;
window.clearBatchQueue = clearBatchQueue;
window.startBeamTransfer = startBeamTransfer;
window.switchDropMode = switchDropMode;
window.pasteClipboardToNote = pasteClipboardToNote;
window.sendQuickNote = sendQuickNote;
window.toggleBeamSound = toggleBeamSound;
window.refreshReceivedFilesList = refreshReceivedFilesList;
window.refreshSentFilesList = refreshSentFilesList;
window.refreshAllVaultFiles = refreshAllVaultFiles;
window.switchBeamVaultTab = switchBeamVaultTab;
window.downloadFileOnDemand = downloadFileOnDemand;
window.openMediaPreview = openMediaPreview;
window.closeMediaPreview = closeMediaPreview;
window.openQuickNoteView = openQuickNoteView;
window.closeQuickNoteViewModal = closeQuickNoteViewModal;
window.copyViewedNoteText = copyViewedNoteText;
window.handleVaultSearch = handleVaultSearch;
window.clearVaultSearch = clearVaultSearch;
window.confirmClearVaultCache = confirmClearVaultCache;

// Safe startup: execute once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuantumBeam);
} else {
    initQuantumBeam();
}
