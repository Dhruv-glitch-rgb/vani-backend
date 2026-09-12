/**
 * quantum_beam.js
 * ================
 * High-Speed Zero-Cable P2P File & Media Drop Engine for V.A.N.I-xAI
 * Features:
 * - One-Time Pair Code: BoVxAi_V.A.N.I-4 unique alphabet:5 unique digits
 * - In-browser Camera QR Scanner (Html5Qrcode)
 * - Dual-layer signaling (Firebase Firestore + Local Flask Fallback)
 * - Auto-creation of user database folder in E:\BoVxAi DB
 * - Live Received Files & Sovereign Archive Gallery on the same page
 */

const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const BUFFER_LIMIT = 512 * 1024; // 512KB backpressure threshold

// Device identification
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
const myDeviceId = 'NODE-' + Math.random().toString(36).substring(2, 9).toUpperCase();
let myVaniUid = localStorage.getItem('vani_user_uid') || localStorage.getItem('bovxai_last_uid') || 'V.A.N.I-xAI-SOVEREIGN';

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
const isJoiner = urlParams.has('otpc') || urlParams.has('pin');

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
    firebase.initializeApp(firebaseConfig);
}
const firestoreDb = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

// WebRTC State
let peerConnection = null;
let dataChannel = null;
let firestoreUnsubscribe = null;
let localSignalingInterval = null;
let lastSignalTime = 0;
let isChannelOpen = false;

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
const elReceivedCount = document.getElementById('receivedFileCount');
const elDbBadge = document.getElementById('dbInitStatusBadge');
const elUserPathLabel = document.getElementById('sovereignUserPathLabel');

// -------------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------------

async function initQuantumBeam() {
    // 1. Setup UI labels
    if (elOtpcDisplay) elOtpcDisplay.textContent = currentOtpc;
    if (elModalOtpc) elModalOtpc.textContent = currentOtpc;
    if (elMyVaniUid) elMyVaniUid.textContent = myVaniUid;
    if (elUserPathLabel) elUserPathLabel.textContent = `Partition: E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\`;

    if (isMobile) {
        if (elMyDeviceLabel) elMyDeviceLabel.textContent = 'Mobile Handset';
        if (elMyDeviceIcon) elMyDeviceIcon.className = 'fa-solid fa-mobile-screen-button';
    } else {
        if (elMyDeviceLabel) elMyDeviceLabel.textContent = 'Desktop Station';
        if (elMyDeviceIcon) elMyDeviceIcon.className = 'fa-solid fa-laptop';
    }

    // 2. Auto-create user database folder in E:\BoVxAi DB
    await autoInitSovereignDatabase();

    // 3. Initialize Dropzone & File Pickers
    initDropzone();

    // 4. Render Pair QR code
    renderPairQrCode();

    // 5. Load previously received files from E:\BoVxAi DB
    await refreshReceivedFilesList();

    // 6. Start WebRTC Dual-Engine Signaling
    startDualEngineSignaling();
}

// Auto-create user database folder in E:\BoVxAi DB
async function autoInitSovereignDatabase() {
    try {
        const resp = await fetch('/api/storage/init-user', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Vani-UID': myVaniUid
            },
            body: JSON.stringify({ user_id: myVaniUid })
        });
        const data = await resp.json();
        if (data && data.success) {
            if (elDbBadge) {
                elDbBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> E:\\BoVxAi DB Provisioned`;
                elDbBadge.style.color = '#34d399';
            }
            console.log("Sovereign folder provisioned at:", data.user_dir);
        }
    } catch (e) {
        console.warn("Storage auto-init notice:", e);
    }
}

// -------------------------------------------------------------------
// BOVXAI-OTPC & QR CODE GENERATION & SCANNING
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
    if (elOtpcDisplay) elOtpcDisplay.textContent = currentOtpc;
    if (elModalOtpc) elModalOtpc.textContent = currentOtpc;
    renderPairQrCode();
    // Restart signaling under new OTPC
    startDualEngineSignaling();
}

function renderPairQrCode() {
    try {
        if (window.QRious) {
            const joinUrl = `${window.location.origin}/quantum_beam.html?otpc=${encodeURIComponent(currentOtpc)}`;
            new QRious({
                element: document.getElementById('qrCodeCanvas'),
                value: joinUrl,
                size: 220,
                level: 'H'
            });
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
        const clean = entered.trim();
        window.location.href = `/quantum_beam.html?otpc=${encodeURIComponent(clean)}`;
    }
}

// In-Browser Camera Scanner using Html5Qrcode
async function openCameraScanModal() {
    if (elCameraModal) elCameraModal.style.display = 'flex';
    const statusEl = document.getElementById('scannerStatusText');
    if (statusEl) statusEl.textContent = "Requesting camera permissions...";

    try {
        if (!html5QrScanner) {
            html5QrScanner = new Html5Qrcode("camera-reader-viewport");
        }

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        isScanningCamera = true;

        await html5QrScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                handleScannedQrResult(decodedText);
            },
            (error) => {
                // scanning in progress, ignore per-frame misses
            }
        );

        if (statusEl) statusEl.textContent = "Point camera at the screen's Pair QR Code";
    } catch (err) {
        console.error("Camera scanner error:", err);
        if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">Camera error: ${err.message || 'Permission denied'}. Enter OTPC manually.</span>`;
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
    console.log("QR Code Scanned:", scannedText);
    closeCameraScanModal();

    // Look for OTPC in decoded string
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
        else if (scannedText.startsWith('BEAM-')) matchedOtpc = scannedText.trim();
    }

    if (matchedOtpc) {
        alert(`Pair QR Detected!\nConnecting via OTPC: ${matchedOtpc}`);
        window.location.href = `/quantum_beam.html?otpc=${encodeURIComponent(matchedOtpc)}`;
    } else {
        alert(`Scanned code: ${scannedText}\nCould not find a valid BoVxAi-OTPC.`);
    }
}

// -------------------------------------------------------------------
// WEBRTC PEER CONNECTION & DUAL-ENGINE SIGNALING
// -------------------------------------------------------------------

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

function createPeerConnection() {
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) {}
    }

    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            postSignal('ice-candidate', e.candidate.toJSON());
        }
    };

    peerConnection.ondatachannel = (e) => {
        setupDataChannel(e.channel);
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        updatePeerStatusBadge(state);
    };
}

function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log("Quantum Beam DataChannel OPEN");
        isChannelOpen = true;
        updatePeerListUI(true);
        updatePeerStatusBadge('connected');
    };

    dataChannel.onclose = () => {
        console.log("Quantum Beam DataChannel CLOSED");
        isChannelOpen = false;
        updatePeerListUI(false);
        updatePeerStatusBadge('disconnected');
    };

    dataChannel.onmessage = (e) => {
        handleIncomingData(e.data);
    };
}

function updatePeerStatusBadge(state) {
    const badge = document.getElementById('p2pStateBadge');
    if (!badge) return;
    if (state === 'connected') {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #10b981;"></i> P2P Linked`;
        badge.style.color = '#34d399';
    } else if (state === 'connecting') {
        badge.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="font-size: 0.55rem; color: #38bdf8;"></i> Handshake`;
        badge.style.color = '#38bdf8';
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
                            <div class="peer-name">${isMobile ? 'Desktop Host' : 'Mobile Node'}</div>
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
            } else if (type === 'answer') {
                await docRef.set({
                    joinerId: myDeviceId,
                    joinerUid: myVaniUid,
                    answer: payload,
                    status: 'paired',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } else if (type === 'ice-candidate') {
                const candField = isJoiner ? 'joinerCandidates' : 'creatorCandidates';
                await docRef.set({
                    [candField]: firebase.firestore.FieldValue.arrayUnion(payload),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        } catch (e) {
            console.warn("Firestore signal write error", e);
        }
    }

    // 2. Local Flask Relay Fallback
    try {
        await fetch('/api/beam/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: sessionKey,
                sender_id: myDeviceId,
                type: type,
                payload: payload
            })
        });
    } catch (e) {}
}

async function startDualEngineSignaling() {
    createPeerConnection();

    const sessionKey = getCleanOtpcKey();

    // If I am NOT a joiner (I created the room/OTPC), I create DataChannel and send Offer
    if (!isJoiner) {
        dataChannel = peerConnection.createDataChannel('bovxai-beam-channel');
        setupDataChannel(dataChannel);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await postSignal('offer', { type: offer.type, sdp: offer.sdp });
    }

    // A. Listen via Firestore Real-Time Snapshot
    if (firestoreDb) {
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        const docRef = firestoreDb.collection('bovxai_otpc_sessions').doc(sessionKey);

        firestoreUnsubscribe = docRef.onSnapshot(async (doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // As Joiner: if Offer exists and we haven't set remote description
            if (isJoiner && data.offer && (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'offer')) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                await postSignal('answer', { type: answer.type, sdp: answer.sdp });
            }

            // As Creator: if Answer exists and we haven't set remote description
            if (!isJoiner && data.answer && (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'answer')) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }

            // Process candidates
            const targetCandidates = isJoiner ? (data.creatorCandidates || []) : (data.joinerCandidates || []);
            for (const c of targetCandidates) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(c));
                } catch (e) {}
            }
        });
    }

    // B. Local Flask Relay Polling (every 800ms)
    if (localSignalingInterval) clearInterval(localSignalingInterval);
    localSignalingInterval = setInterval(async () => {
        if (isChannelOpen) return;
        try {
            const resp = await fetch(`/api/beam/signal/${encodeURIComponent(sessionKey)}?peer_id=${myDeviceId}&since=${lastSignalTime}`);
            const data = await resp.json();
            if (data && data.signals && data.signals.length > 0) {
                for (const sig of data.signals) {
                    lastSignalTime = Math.max(lastSignalTime, sig.timestamp);
                    await processLocalSignal(sig);
                }
            }
        } catch (e) {}
    }, 800);
}

async function processLocalSignal(sig) {
    const { sender_id, type, payload } = sig;
    if (sender_id === myDeviceId) return;

    if (type === 'offer' && isJoiner) {
        if (!peerConnection.remoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await postSignal('answer', { type: answer.type, sdp: answer.sdp });
        }
    } else if (type === 'answer' && !isJoiner) {
        if (!peerConnection.remoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
        }
    } else if (type === 'ice-candidate') {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {}
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
// TRANSMITTING FILE WITH BACKPRESSURE FLOW CONTROL
// -------------------------------------------------------------------

async function startBeamTransfer() {
    if (!currentSelectedFile) {
        alert("Please select or drop a file first.");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("No connected peer. Scan the QR code or enter the BoVxAi-OTPC on another device first.");
        return;
    }

    const file = currentSelectedFile;
    outgoingTransfer.inProgress = true;
    if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Requesting Peer Approval...`;

    // Send metadata packet
    const metaPacket = {
        type: 'file-meta',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        senderUid: myVaniUid,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE)
    };
    dataChannel.send(JSON.stringify(metaPacket));
}

function handleIncomingData(data) {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'file-meta') {
                promptIncomingFile(parsed);
            } else if (parsed.type === 'accept-file') {
                beginStreamingChunks();
            } else if (parsed.type === 'decline-file') {
                alert("Peer declined the incoming file transfer.");
                if (elTelemetryBox) elTelemetryBox.style.display = 'none';
            }
        } catch (e) {}
    } else if (data instanceof ArrayBuffer) {
        receiveChunk(data);
    }
}

function promptIncomingFile(meta) {
    incomingTransfer.meta = meta;
    incomingTransfer.receivedChunks = [];
    incomingTransfer.receivedBytes = 0;
    incomingTransfer.startTime = Date.now();

    if (elIncomingDetails) {
        elIncomingDetails.innerHTML = `
            <strong>${meta.fileName}</strong><br>
            Size: <span style="color:var(--accent-cyan); font-weight:700;">${formatBytes(meta.fileSize)}</span><br>
            Sender: <span style="color:#fbbf24; font-family:'Fira Code'; font-size:0.75rem;">${meta.senderUid || 'Peer'}</span>
        `;
    }
    if (elIncomingModal) elIncomingModal.style.display = 'flex';
}

function acceptIncomingFile() {
    if (elIncomingModal) elIncomingModal.style.display = 'none';
    dataChannel.send(JSON.stringify({ type: 'accept-file' }));
    if (elTelemetryBox) elTelemetryBox.style.display = 'flex';
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-download"></i> Receiving Stream...`;
}

function declineIncomingFile() {
    if (elIncomingModal) elIncomingModal.style.display = 'none';
    dataChannel.send(JSON.stringify({ type: 'decline-file' }));
}

// Slicing and Streaming
async function beginStreamingChunks() {
    const file = currentSelectedFile;
    let offset = 0;
    const startTime = Date.now();
    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-bolt"></i> Beaming ${file.name}...`;

    dataChannel.bufferedAmountLowThreshold = 64 * 1024;

    function sendNext() {
        while (offset < file.size) {
            if (dataChannel.bufferedAmount > BUFFER_LIMIT) {
                dataChannel.onbufferedamountlow = () => {
                    dataChannel.onbufferedamountlow = null;
                    sendNext();
                };
                return;
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();
            reader.onload = (e) => {
                dataChannel.send(e.target.result);
                offset += slice.size;

                // Update Progress Telemetry
                const percent = Math.min(100, Math.round((offset / file.size) * 100));
                if (elTelemetryFill) elTelemetryFill.style.width = percent + '%';
                if (elTelemetryPercent) elTelemetryPercent.textContent = percent + '%';
                if (elTelemetryBytes) elTelemetryBytes.textContent = `${formatBytes(offset)} / ${formatBytes(file.size)}`;

                const elapsed = (Date.now() - startTime) / 1000;
                const speed = offset / (elapsed || 0.001);
                if (elTelemetrySpeed) elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

                const remaining = (file.size - offset) / (speed || 1);
                if (elTelemetryEta) elTelemetryEta.textContent = `ETA: ${Math.round(remaining)}s`;

                if (offset < file.size) {
                    sendNext();
                } else {
                    if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> Transfer Complete!`;
                    setTimeout(() => {
                        if (elTelemetryBox) elTelemetryBox.style.display = 'none';
                    }, 4000);
                }
            };
            reader.readAsArrayBuffer(slice);
            return;
        }
    }

    sendNext();
}

// -------------------------------------------------------------------
// RECEIVING CHUNKS, AUTO-SAVING TO E:\BoVxAi DB & DISPLAYING IN GALLERY
// -------------------------------------------------------------------

async function receiveChunk(chunk) {
    incomingTransfer.receivedChunks.push(chunk);
    incomingTransfer.receivedBytes += chunk.byteLength;

    const meta = incomingTransfer.meta;
    if (!meta) return;

    const percent = Math.min(100, Math.round((incomingTransfer.receivedBytes / meta.fileSize) * 100));
    if (elTelemetryFill) elTelemetryFill.style.width = percent + '%';
    if (elTelemetryPercent) elTelemetryPercent.textContent = percent + '%';
    if (elTelemetryBytes) elTelemetryBytes.textContent = `${formatBytes(incomingTransfer.receivedBytes)} / ${formatBytes(meta.fileSize)}`;

    const elapsed = (Date.now() - incomingTransfer.startTime) / 1000;
    const speed = incomingTransfer.receivedBytes / (elapsed || 0.001);
    if (elTelemetrySpeed) elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

    if (incomingTransfer.receivedBytes >= meta.fileSize) {
        // Assembly complete!
        if (elTelemetryStage) elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> 100% Received!`;
        const blob = new Blob(incomingTransfer.receivedChunks, { type: meta.fileType });
        const blobUrl = URL.createObjectURL(blob);

        // Auto download locally in browser
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = meta.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Auto-archive to Sovereign Database (E:\BoVxAi DB)
        let savedPath = `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${meta.fileName}`;
        if (elAutoArchive && elAutoArchive.checked) {
            const uploadRes = await archiveToSovereignDrive(meta.fileName, blob);
            if (uploadRes && uploadRes.stored_path) {
                savedPath = uploadRes.stored_path;
            }
        }

        // Add to Received Files display immediately on the same page
        addReceivedFileToGallery({
            filename: meta.fileName,
            size_bytes: meta.fileSize,
            timestamp: new Date().toLocaleTimeString(),
            blobUrl: blobUrl,
            stored_path: savedPath
        });

        setTimeout(() => {
            if (elTelemetryBox) elTelemetryBox.style.display = 'none';
        }, 3500);
    }
}

// Upload received file to backend E:\BoVxAi DB
async function archiveToSovereignDrive(filename, blob) {
    try {
        const formData = new FormData();
        formData.append('user_id', myVaniUid);
        formData.append('category', 'beam_media');
        formData.append('filename', filename);
        formData.append('file', blob, filename);

        const resp = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData
        });
        const res = await resp.json();
        console.log("Auto-stored into E:\\BoVxAi DB:", res);
        return res;
    } catch (e) {
        console.warn("Storage upload notice", e);
        return null;
    }
}

// -------------------------------------------------------------------
// RECEIVED FILES GALLERY ON THE SAME PAGE
// -------------------------------------------------------------------

function addReceivedFileToGallery(fileItem) {
    localReceivedFiles.unshift(fileItem);
    renderReceivedFilesGrid();
}

async function refreshReceivedFilesList() {
    try {
        const resp = await fetch(`/api/storage/files/${encodeURIComponent(myVaniUid)}?category=beam_media`);
        const data = await resp.json();
        if (data && data.success && data.files && data.files.beam_media) {
            const serverFiles = data.files.beam_media.map(f => ({
                filename: f.filename,
                size_bytes: f.size_bytes,
                timestamp: new Date(f.modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                serverUrl: f.url,
                stored_path: `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${f.filename}`
            }));

            // Merge with local session files avoiding duplicate filenames
            const existingNames = new Set(localReceivedFiles.map(f => f.filename));
            for (const sf of serverFiles) {
                if (!existingNames.has(sf.filename)) {
                    localReceivedFiles.push(sf);
                }
            }
        }
    } catch (e) {}

    renderReceivedFilesGrid();
}

function renderReceivedFilesGrid() {
    if (!elReceivedGrid) return;
    if (elReceivedCount) elReceivedCount.textContent = localReceivedFiles.length.toString();

    if (localReceivedFiles.length === 0) {
        elReceivedGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px 10px;">
                <i class="fa-solid fa-inbox" style="font-size: 2.5rem; color: rgba(255, 255, 255, 0.15); margin-bottom: 10px;"></i>
                <p style="font-size: 0.9rem;">No files received yet.<br>Pair a device and beam files to see them stored and displayed here in real time.</p>
            </div>
        `;
        return;
    }

    elReceivedGrid.innerHTML = localReceivedFiles.map((f, idx) => {
        const iconCls = getFileIconClass(f.filename);
        const downloadHref = f.blobUrl || f.serverUrl || '#';
        const displayPath = f.stored_path || `E:\\BoVxAi DB\\${myVaniUid}\\beam_media\\${f.filename}`;

        return `
            <div class="received-file-item">
                <div class="received-file-header">
                    <div class="received-file-icon">
                        <i class="${iconCls}"></i>
                    </div>
                    <div class="received-file-meta">
                        <div class="received-file-name" title="${f.filename}">${f.filename}</div>
                        <div class="received-file-size">${formatBytes(f.size_bytes)} &bull; ${f.timestamp || 'Just now'}</div>
                    </div>
                </div>

                <div class="sovereign-db-tag" title="${displayPath}">
                    <i class="fa-solid fa-hard-drive"></i> ${displayPath}
                </div>

                <div class="received-file-actions">
                    <a href="${downloadHref}" download="${f.filename}" class="file-action-btn btn-save-db">
                        <i class="fa-solid fa-download"></i> Save / Download
                    </a>
                    ${downloadHref !== '#' ? `
                    <a href="${downloadHref}" target="_blank" class="file-action-btn">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
                    </a>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Global Exports
window.openPairQrModal = openPairQrModal;
window.closePairQrModal = closePairQrModal;
window.openCameraScanModal = openCameraScanModal;
window.closeCameraScanModal = closeCameraScanModal;
window.copyOtpcCode = copyOtpcCode;
window.regenerateOtpcCode = regenerateOtpcCode;
window.promptEnterOtpc = promptEnterOtpc;
window.triggerFilePicker = triggerFilePicker;
window.handleFileChosen = handleFileChosen;
window.startBeamTransfer = startBeamTransfer;
window.acceptIncomingFile = acceptIncomingFile;
window.declineIncomingFile = declineIncomingFile;
window.refreshReceivedFilesList = refreshReceivedFilesList;

// Start on DOM ready
document.addEventListener('DOMContentLoaded', initQuantumBeam);
