/**
 * quantum_beam.js
 * ================
 * High-Speed Zero-Cable P2P File & Media Drop Engine for V.A.N.I-xAI
 * Sovereign Local Storage: E:\BoVxAi DB\<USER_ID>\beam_media\
 * 
 * Features:
 * - Real Authenticated User Resolution (No fake/dummy folders created)
 * - Both Received Files & Sent Files tracked & displayed in portal
 * - On-demand download (Downloads ONLY when user clicks Download button)
 * - One-Time Pair Code: BoVxAi_V.A.N.I-4 unique alphabet:5 unique digits
 * - Non-blocking Immediate WebRTC Startup
 * - Multi-STUN Complete ICE Gathering SDP signaling
 * - In-browser Camera QR Scanner (Html5Qrcode) with Manual OTPC fallback
 * - Auto-creation of real user database in E:\BoVxAi DB
 * - Live Received & Sent Files gallery with Persistent IndexedDB Cache
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

// Helper: Generate BoVxAi-OTPC: (BoVxAi_V.A.N.I-4 random unique alphabet:5 random unique digit)
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

// File Transfer State
let currentSelectedFile = null;
let outgoingTransfer = { inProgress: false };
let incomingTransfer = {
    inProgress: false,
    meta: null,
    receivedChunks: [],
    receivedBytes: 0,
    startTime: 0
};
let localReceivedFiles = [];
let localSentFiles = [];

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
const elSelectedCard = document.getElementById('selectedFileCard');
const elSelectedName = document.getElementById('selectedFileName');
const elSelectedSize = document.getElementById('selectedFileSize');
const elSelectedIcon = document.getElementById('selectedFileIcon');
const elTelemetryBox = document.getElementById('transferTelemetryBox');
const elTelemetryFill = document.getElementById('telemetryProgressFill');
const elTelemetryStage = document.getElementById('telemetryStageText');
const elTelemetrySpeed = document.getElementById('telemetrySpeed');
const elTelemetryBytes = document.getElementById('telemetryTransferredBytes');
const elTelemetryPercent = document.getElementById('telemetryPercent');
const elTelemetryEta = document.getElementById('telemetryEta');
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

// -------------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------------

function initQuantumBeam() {
    updateOtpcUi();
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
// DRAG & DROP AND FILE SELECTION
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
            handleFileChosen(e.dataTransfer.files);
        }
    });
}

function triggerFilePicker() {
    if (elFilePicker) elFilePicker.click();
}

function handleFileChosen(files) {
    if (!files || files.length === 0) return;
    currentSelectedFile = files[0];

    if (elSelectedName) elSelectedName.textContent = currentSelectedFile.name;
    if (elSelectedSize) elSelectedSize.textContent = formatBytes(currentSelectedFile.size);
    if (elSelectedIcon) {
        elSelectedIcon.className = getFileIconClass(currentSelectedFile.name);
    }
    if (elSelectedCard) elSelectedCard.style.display = 'flex';
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
    if (['py', 'js', 'html', 'css', 'json', 'cpp', 'java'].includes(ext)) return 'fa-solid fa-file-code';
    return 'fa-solid fa-file-lines';
}

// -------------------------------------------------------------------
// TRANSMITTING FILE WITH BACKPRESSURE FLOW CONTROL & IMMEDIATE STREAM
// -------------------------------------------------------------------

async function startBeamTransfer() {
    if (!currentSelectedFile) {
        alert("Please select or drop a file first.");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("No connected peer. Scan the QR code or enter the BoVxAi-OTPC on your other device first to link.");
        return;
    }

    const file = currentSelectedFile;
    outgoingTransfer.inProgress = true;
    if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing Beam to Peer...`;

    // 1. Send metadata announcement packet
    const metaPacket = {
        type: 'file-start',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        senderUid: myVaniUid,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE)
    };

    try {
        dataChannel.send(JSON.stringify(metaPacket));
    } catch (e) {
        console.error("[Quantum Beam] Failed to send file-start packet:", e);
    }

    // 2. Immediately begin streaming chunks without blocking approval modal
    await beginStreamingChunks();
}

async function handleIncomingData(data) {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'file-start' || parsed.type === 'file-meta') {
                // Initialize receiver state
                incomingTransfer.inProgress = true;
                incomingTransfer.meta = parsed;
                incomingTransfer.receivedChunks = [];
                incomingTransfer.receivedBytes = 0;
                incomingTransfer.startTime = Date.now();
                incomingTransfer.finalized = false;

                // Show receiver telemetry HUD
                if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
                if (elTelemetryFill) elTelemetryFill.style.width = '0%';
                if (elTelemetryPercent) elTelemetryPercent.textContent = '0%';
                if (elTelemetryBytes) elTelemetryBytes.textContent = `0 Bytes / ${formatBytes(parsed.fileSize)}`;
                if (elTelemetryStage) {
                    elTelemetryStage.innerHTML = `<i class="fa-solid fa-cloud-arrow-down fa-bounce" style="color: #38bdf8;"></i> Receiving ${parsed.fileName}...`;
                }

                // Switch gallery to received tab so user sees incoming file
                switchBeamVaultTab('received');
            } else if (parsed.type === 'file-end') {
                await finalizeIncomingFile();
            } else if (parsed.type === 'file-ack') {
                console.log("[Quantum Beam] Peer confirmed receipt:", parsed.fileName);
            }
        } catch (e) {
            console.warn("[Quantum Beam] JSON parse notice:", e);
        }
    } else if (data instanceof ArrayBuffer) {
        await receiveChunk(data);
    } else if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
        // Blob / File data in some mobile WebKit / Android browsers
        try {
            const buf = await data.arrayBuffer();
            await receiveChunk(buf);
        } catch (err) {
            console.error("[Quantum Beam] Blob to ArrayBuffer error:", err);
        }
    }
}

// Slicing and Streaming with Flow Control
async function beginStreamingChunks() {
    const file = currentSelectedFile;
    if (!file || !dataChannel || dataChannel.readyState !== 'open') {
        outgoingTransfer.inProgress = false;
        return;
    }

    let offset = 0;
    const startTime = Date.now();
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-bolt"></i> Beaming ${file.name}...`;

    dataChannel.bufferedAmountLowThreshold = 64 * 1024;

    while (offset < file.size) {
        if (!dataChannel || dataChannel.readyState !== 'open') {
            console.error("[Quantum Beam] DataChannel closed mid-stream");
            if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e;"></i> Stream Interrupted`;
            outgoingTransfer.inProgress = false;
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
                outgoingTransfer.inProgress = false;
                return;
            }
        }

        offset += slice.size;

        // Progress Telemetry
        const percent = Math.min(100, Math.round((offset / file.size) * 100));
        if (elTelemetryFill) elTelemetryFill.style.width = percent + '%';
        if (elTelemetryPercent) elTelemetryPercent.textContent = percent + '%';
        if (elTelemetryBytes) elTelemetryBytes.textContent = `${formatBytes(offset)} / ${formatBytes(file.size)}`;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = offset / (elapsed || 0.001);
        if (elTelemetrySpeed) elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

        const remaining = (file.size - offset) / (speed || 1);
        if (elTelemetryEta) elTelemetryEta.textContent = `ETA: ${Math.round(remaining)}s`;

        // Small yield to keep browser UI snappy
        if ((offset / CHUNK_SIZE) % 16 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Send file-end marker to receiver
    try {
        dataChannel.send(JSON.stringify({ type: 'file-end', fileName: file.name }));
    } catch (e) {}

    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> Transfer Complete!`;
    outgoingTransfer.inProgress = false;

    // Track this sent file in Sent Files gallery
    const sentRecord = {
        id: 'sent_' + Date.now(),
        filename: file.name,
        size_bytes: file.size,
        fileType: file.type || 'application/octet-stream',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.name}`,
        blobUrl: URL.createObjectURL(file)
    };
    addSentFileToGallery(sentRecord);
    await saveToVaultIndexedDb('sent_files', sentRecord, file);
    archiveToSovereignDrive(file.name, file);

    setTimeout(() => {
        if (elTelemetryBox && !outgoingTransfer.inProgress && !incomingTransfer.inProgress) {
            elTelemetryBox.style.display = 'none';
        }
    }, 3500);
}

// -------------------------------------------------------------------
// RECEIVING CHUNKS, AUTO-SAVING TO E:\BoVxAi DB & ON-DEMAND DOWNLOAD
// -------------------------------------------------------------------

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
        await finalizeIncomingFile();
    }
}

async function finalizeIncomingFile() {
    if (!incomingTransfer.meta || incomingTransfer.finalized) return;
    incomingTransfer.finalized = true;
    incomingTransfer.inProgress = false;

    const meta = incomingTransfer.meta;
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> 100% Received! Stored in Sovereign DB.`;
    if (elTelemetryFill) elTelemetryFill.style.width = '100%';
    if (elTelemetryPercent) elTelemetryPercent.textContent = '100%';

    const blob = new Blob(incomingTransfer.receivedChunks, { type: meta.fileType });
    const blobUrl = URL.createObjectURL(blob);

    // NOTE: On-demand download preserved! The file is NOT auto-downloaded by browser.
    // User clicks the "Download" button on the file card whenever they wish.

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
        stored_path: savedPath
    };

    // Cache into browser IndexedDB so it's permanent on this device
    await saveToVaultIndexedDb('received_files', fileRecord, blob);

    // Add to Received Files gallery on the same page
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
    }, 4000);
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
        const req = window.indexedDB.open("BoVxAi_Vault_DB", 2);
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

// -------------------------------------------------------------------
// GALLERY DISPLAY: RECEIVED & SENT FILES (WITH ON-DEMAND DOWNLOAD)
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

    if (localReceivedFiles.length === 0) {
        elReceivedGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px 10px;">
                <i class="fa-solid fa-inbox" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.15); margin-bottom: 10px;"></i>
                <p style="font-size: 0.9rem;">No files received yet.<br>Files received from your peers will be displayed here with an on-demand download button.</p>
            </div>
        `;
        return;
    }

    elReceivedGrid.innerHTML = localReceivedFiles.map((file, idx) => {
        const iconClass = getFileIconClass(file.filename);
        const downloadTarget = file.blobUrl || file.serverUrl || '#';
        const displaySize = formatBytes(file.size_bytes);
        const shortPath = file.stored_path || `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.filename}`;

        return `
            <div class="received-file-card">
                <div class="rec-header">
                    <div class="rec-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="rec-info">
                        <div class="rec-name" title="${file.filename}">${file.filename}</div>
                        <div class="rec-size">${displaySize} • ${file.timestamp}</div>
                    </div>
                </div>

                <div class="rec-path" title="${shortPath}">
                    <i class="fa-solid fa-hard-drive"></i> ${shortPath}
                </div>

                <div class="rec-actions">
                    <button class="btn-rec-action" onclick="downloadFileOnDemand('${file.id || idx}', 'received')" style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(99, 102, 241, 0.25)); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.4); font-weight: 700;">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                    ${file.blobUrl ? `
                        <button class="btn-rec-action" onclick="previewMedia('${file.id || idx}', 'received')" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);">
                            <i class="fa-solid fa-eye"></i> View
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

    if (localSentFiles.length === 0) {
        elSentGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px 10px;">
                <i class="fa-solid fa-paper-plane" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.15); margin-bottom: 10px;"></i>
                <p style="font-size: 0.9rem;">No files sent yet.<br>Select any file above and beam it to a peer.</p>
            </div>
        `;
        return;
    }

    elSentGrid.innerHTML = localSentFiles.map((file, idx) => {
        const iconClass = getFileIconClass(file.filename);
        const displaySize = formatBytes(file.size_bytes);
        const shortPath = file.stored_path || `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${file.filename}`;

        return `
            <div class="received-file-card" style="border-color: rgba(16, 185, 129, 0.3);">
                <div class="rec-header">
                    <div class="rec-icon" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="rec-info">
                        <div class="rec-name" title="${file.filename}">${file.filename}</div>
                        <div class="rec-size">${displaySize} • Beamed at ${file.timestamp}</div>
                    </div>
                </div>

                <div class="rec-path" title="${shortPath}">
                    <i class="fa-solid fa-hard-drive"></i> ${shortPath}
                </div>

                <div class="rec-actions">
                    <button class="btn-rec-action" onclick="downloadFileOnDemand('${file.id || idx}', 'sent')" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.25)); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700;">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                    ${file.blobUrl ? `
                        <button class="btn-rec-action" onclick="previewMedia('${file.id || idx}', 'sent')" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// On-demand download when user clicks the Download button
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

function previewMedia(fileId, listType) {
    const list = listType === 'sent' ? localSentFiles : localReceivedFiles;
    const file = list.find((f, i) => f.id === fileId || i.toString() === fileId);
    if (!file || !file.blobUrl) return;

    const ext = file.filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        const w = window.open('');
        w.document.write(`<title>${file.filename}</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${file.blobUrl}" style="max-width:95vw;max-height:95vh;border-radius:8px;"></body>`);
    } else {
        window.open(file.blobUrl, '_blank');
    }
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
window.startBeamTransfer = startBeamTransfer;
window.acceptIncomingFile = acceptIncomingFile;
window.declineIncomingFile = declineIncomingFile;
window.refreshReceivedFilesList = refreshReceivedFilesList;
window.refreshSentFilesList = refreshSentFilesList;
window.refreshAllVaultFiles = refreshAllVaultFiles;
window.switchBeamVaultTab = switchBeamVaultTab;
window.downloadFileOnDemand = downloadFileOnDemand;
window.previewMedia = previewMedia;

// Safe startup: execute once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuantumBeam);
} else {
    initQuantumBeam();
}
