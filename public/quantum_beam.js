/**
 * quantum_beam.js
 * ================
 * High-Speed Zero-Cable P2P File & Media Transfer Engine for V.A.N.I-xAI
 * Uses WebRTC RTCDataChannel with backpressure flow control.
 * Saves received files to local sovereign storage (E:\BoVxAi DB).
 */

const CHUNK_SIZE = 64 * 1024; // 64KB chunks for optimal throughput
const BUFFER_LIMIT = 512 * 1024; // 512KB backpressure threshold

// Device identification
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
const myDeviceId = 'NODE-' + Math.random().toString(36).substring(2, 9).toUpperCase();
let myVaniUid = localStorage.getItem('vani_user_uid') || 'V.A.N.I-xAI-SOVEREIGN';

// Parse or generate Room PIN
const urlParams = new URLSearchParams(window.location.search);
let currentRoomPin = urlParams.get('pin') || ('BEAM-' + Math.floor(1000 + Math.random() * 9000));

// WebRTC State
let peerConnection = null;
let dataChannel = null;
let activePeerId = null;
let isInitiator = false;
let signalingInterval = null;
let lastSignalTime = 0;

// Transfer State
let currentSelectedFile = null;
let outgoingTransfer = { inProgress: false };
let incomingTransfer = {
    inProgress: false,
    meta: null,
    receivedChunks: [],
    receivedBytes: 0,
    startTime: 0
};

// DOM Elements
const elCurrentPin = document.getElementById('currentRoomPin');
const elModalPin = document.getElementById('modalPinValue');
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
const elTelemetryBox = document.getElementById('transferTelemetryBox');
const elTelemetryFill = document.getElementById('telemetryProgressFill');
const elTelemetryStage = document.getElementById('telemetryStageText');
const elTelemetrySpeed = document.getElementById('telemetrySpeed');
const elTelemetryBytes = document.getElementById('telemetryTransferredBytes');
const elTelemetryPercent = document.getElementById('telemetryPercent');
const elTelemetryEta = document.getElementById('telemetryEta');
const elQrModal = document.getElementById('qrModalBackdrop');
const elIncomingModal = document.getElementById('incomingFileModal');
const elIncomingDetails = document.getElementById('incomingPromptDetails');
const elAutoArchive = document.getElementById('autoArchiveToggle');

// Initialize UI
function initUI() {
    elCurrentPin.textContent = currentRoomPin;
    elModalPin.textContent = currentRoomPin;
    elMyVaniUid.textContent = myVaniUid;

    if (isMobile) {
        elMyDeviceLabel.textContent = 'Mobile Handset';
        elMyDeviceIcon.className = 'fa-solid fa-mobile-screen-button';
    } else {
        elMyDeviceLabel.textContent = 'Desktop Station';
        elMyDeviceIcon.className = 'fa-solid fa-laptop';
    }

    renderQrCode();
    initDropzone();
    startSignaling();
}

// Render QR Code using QRious
function renderQrCode() {
    try {
        if (window.QRious) {
            const joinUrl = `${window.location.origin}/quantum_beam.html?pin=${encodeURIComponent(currentRoomPin)}`;
            new QRious({
                element: document.getElementById('qrCodeCanvas'),
                value: joinUrl,
                size: 200,
                level: 'M'
            });
        }
    } catch (e) {
        console.warn("QR render failed", e);
    }
}

function openQrModal() {
    renderQrCode();
    elQrModal.style.display = 'flex';
}

function closeQrModal() {
    elQrModal.style.display = 'none';
}

function enterManualPin() {
    const entered = prompt("Enter 6-digit Quantum Beam PIN (e.g. BEAM-4821):", "");
    if (entered && entered.trim()) {
        window.location.href = `/quantum_beam.html?pin=${encodeURIComponent(entered.trim().toUpperCase())}`;
    }
}

// Drag & Drop Setup
function initDropzone() {
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
    elFilePicker.click();
}

function handleFileChosen(files) {
    if (!files || files.length === 0) return;
    currentSelectedFile = files[0];
    elSelectedName.textContent = currentSelectedFile.name;
    elSelectedSize.textContent = formatBytes(currentSelectedFile.size);
    elSelectedCard.style.display = 'flex';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// WebRTC Setup
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function createPeerConnection() {
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) {}
    }

    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            sendSignal('ice-candidate', e.candidate);
        }
    };

    peerConnection.ondatachannel = (e) => {
        setupDataChannel(e.channel);
    };

    peerConnection.onconnectionstatechange = () => {
        updatePeerStatusBadge(peerConnection.connectionState);
    };
}

function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log("Quantum Beam DataChannel OPEN");
        updatePeerListUI(true);
        updatePeerStatusBadge('connected');
    };

    dataChannel.onclose = () => {
        console.log("Quantum Beam DataChannel CLOSED");
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
        elPeerCount.textContent = '1';
        elPeersList.innerHTML = `
            <div class="peer-item active">
                <div class="peer-info">
                    <div class="peer-avatar-icon">
                        <i class="fa-solid ${isMobile ? 'fa-laptop' : 'fa-mobile-screen-button'}"></i>
                    </div>
                    <div>
                        <div class="peer-name">${isMobile ? 'Desktop Host' : 'Mobile Node'}</div>
                        <div class="peer-uid">P2P Encrypted DataChannel</div>
                    </div>
                </div>
                <div class="peer-status-dot" title="Active"></div>
            </div>
        `;
    } else {
        elPeerCount.textContent = '0';
        elPeersList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 10px;">
                <i class="fa-solid fa-satellite" style="font-size: 1.8rem; color: rgba(99, 102, 241, 0.35); margin-bottom: 8px;"></i>
                <p>Waiting for peer connection...<br>Scan the QR code or enter PIN from another device.</p>
            </div>
        `;
    }
}

// Local Server Signaling Relay
async function sendSignal(type, payload) {
    try {
        await fetch('/api/beam/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: currentRoomPin,
                sender_id: myDeviceId,
                type: type,
                payload: payload
            })
        });
    } catch (e) {
        console.warn("Signal send error", e);
    }
}

function startSignaling() {
    createPeerConnection();

    // Advertise presence
    sendSignal('announce', { deviceType: isMobile ? 'mobile' : 'desktop', uid: myVaniUid });

    signalingInterval = setInterval(async () => {
        try {
            const resp = await fetch(`/api/beam/signal/${encodeURIComponent(currentRoomPin)}?peer_id=${myDeviceId}&since=${lastSignalTime}`);
            const data = await resp.json();
            if (data && data.signals && data.signals.length > 0) {
                for (const sig of data.signals) {
                    lastSignalTime = Math.max(lastSignalTime, sig.timestamp);
                    await processIncomingSignal(sig);
                }
            }
        } catch (e) {
            // offline or silent
        }
    }, 800);
}

async function processIncomingSignal(sig) {
    const { sender_id, type, payload } = sig;
    if (sender_id === myDeviceId) return;

    if (type === 'announce') {
        if (!isInitiator && !dataChannel) {
            isInitiator = true;
            dataChannel = peerConnection.createDataChannel('quantum-beam-channel');
            setupDataChannel(dataChannel);

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendSignal('offer', offer);
        }
    } else if (type === 'offer') {
        if (!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal('answer', answer);
    } else if (type === 'answer') {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
        }
    } else if (type === 'ice-candidate') {
        if (peerConnection && payload) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
            } catch (e) {}
        }
    }
}

// Sending File over DataChannel
async function startBeamTransfer() {
    if (!currentSelectedFile) {
        alert("Please select a file first.");
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("No connected peer. Please pair a phone or desktop first via QR code or PIN.");
        return;
    }

    const file = currentSelectedFile;
    outgoingTransfer.inProgress = true;
    elTelemetryBox.style.display = 'flex';
    elTelemetryStage.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Requesting Peer Approval...`;

    // 1. Send file metadata packet
    const metaPacket = {
        type: 'file-meta',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        totalChunks: Math.ceil(file.size / CHUNK_SIZE)
    };
    dataChannel.send(JSON.stringify(metaPacket));
}

// Handling Incoming DataPackets
function handleIncomingData(data) {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'file-meta') {
                promptIncomingFile(parsed);
            } else if (parsed.type === 'accept-file') {
                beginStreamingChunks();
            } else if (parsed.type === 'decline-file') {
                alert("Peer declined the file transfer.");
                elTelemetryBox.style.display = 'none';
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

    elIncomingDetails.innerHTML = `
        <strong>${meta.fileName}</strong><br>
        Size: <span style="color:var(--accent-cyan); font-weight:700;">${formatBytes(meta.fileSize)}</span>
    `;
    elIncomingModal.style.display = 'flex';
}

function acceptIncomingFile() {
    elIncomingModal.style.display = 'none';
    dataChannel.send(JSON.stringify({ type: 'accept-file' }));
    elTelemetryBox.style.display = 'flex';
    elTelemetryStage.innerHTML = `<i class="fa-solid fa-download"></i> Receiving Stream...`;
}

function declineIncomingFile() {
    elIncomingModal.style.display = 'none';
    dataChannel.send(JSON.stringify({ type: 'decline-file' }));
}

// Slicing and Streaming with Backpressure Flow Control
async function beginStreamingChunks() {
    const file = currentSelectedFile;
    let offset = 0;
    const startTime = Date.now();
    elTelemetryStage.innerHTML = `<i class="fa-solid fa-bolt"></i> Beaming ${file.name}...`;

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
                elTelemetryFill.style.width = percent + '%';
                elTelemetryPercent.textContent = percent + '%';
                elTelemetryBytes.textContent = `${formatBytes(offset)} / ${formatBytes(file.size)}`;

                const elapsed = (Date.now() - startTime) / 1000;
                const speed = offset / (elapsed || 0.001); // bytes/sec
                elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

                const remaining = (file.size - offset) / (speed || 1);
                elTelemetryEta.textContent = `ETA: ${Math.round(remaining)}s`;

                if (offset < file.size) {
                    sendNext();
                } else {
                    elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> Transfer Complete!`;
                    elTelemetrySpeed.textContent = `Average: ${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
                    setTimeout(() => {
                        elTelemetryBox.style.display = 'none';
                    }, 4000);
                }
            };
            reader.readAsArrayBuffer(slice);
            return;
        }
    }

    sendNext();
}

// Receiving Chunk and Assembly
async function receiveChunk(chunk) {
    incomingTransfer.receivedChunks.push(chunk);
    incomingTransfer.receivedBytes += chunk.byteLength;

    const meta = incomingTransfer.meta;
    if (!meta) return;

    const percent = Math.min(100, Math.round((incomingTransfer.receivedBytes / meta.fileSize) * 100));
    elTelemetryFill.style.width = percent + '%';
    elTelemetryPercent.textContent = percent + '%';
    elTelemetryBytes.textContent = `${formatBytes(incomingTransfer.receivedBytes)} / ${formatBytes(meta.fileSize)}`;

    const elapsed = (Date.now() - incomingTransfer.startTime) / 1000;
    const speed = incomingTransfer.receivedBytes / (elapsed || 0.001);
    elTelemetrySpeed.textContent = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

    if (incomingTransfer.receivedBytes >= meta.fileSize) {
        // Assembled!
        elTelemetryStage.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#10b981;"></i> Received 100%!`;
        const blob = new Blob(incomingTransfer.receivedChunks, { type: meta.fileType });

        // Trigger Instant Browser Download
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = meta.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Sovereign Archive to E:\BoVxAi DB
        if (elAutoArchive && elAutoArchive.checked) {
            archiveToSovereignDrive(meta.fileName, blob);
        }

        setTimeout(() => {
            elTelemetryBox.style.display = 'none';
        }, 4000);
    }
}

// Archive directly to E:\BoVxAi DB\<USER_ID>\beam_media\
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
        console.log("Saved to Sovereign E:\\BoVxAi DB:", res);
    } catch (e) {
        console.warn("Auto-archive to E:\\BoVxAi DB failed", e);
    }
}

// Start on DOM ready
document.addEventListener('DOMContentLoaded', initUI);
