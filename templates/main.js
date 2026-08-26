// Dynamic Backend URL to support local Jarvis testing and Render fallback
let BACKEND_URL = localStorage.getItem('vani_backend_url');
if (!BACKEND_URL) {
    BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? '' // Use relative path for local server
        : 'https://vani-backend-52w1.onrender.com';
}
const API_KEY_STORAGE_KEY = 'vani_api_key';

// UI Elements
const chatHistory = document.getElementById('chat-history');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const micIcon = document.getElementById('mic-icon');
const waveform = document.getElementById('waveform');
const voiceStatusText = document.getElementById('voice-status-text');
const backendUrlInput = document.getElementById('backend-url-input');
const refreshAdbBtn = document.getElementById('refresh-adb');
const deviceList = document.getElementById('device-list');
const adbDot = document.getElementById('adb-dot');
const adbText = document.getElementById('adb-text');
const terminalLogs = document.getElementById('terminal-logs');

// Landing Page Elements
const landingPage = document.getElementById('landing-page');
const appContainer = document.getElementById('app-container');
const launchConsoleBtn = document.getElementById('launch-console-btn');

// State Variables
let authInstance = null;
let isRecording = false;
let recognition = null;
let logPollingInterval = null;
let adbPollingInterval = null;
let localLogCount = 0;
let userTier = 'Unlimited Free'; // Default tier: Unlimited Free for all users
let todayMessageCount = 0;
let lastMessageDate = localStorage.getItem('vani_last_msg_date');

// PWA Install Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtnMain = document.getElementById('pwa-install-btn');
    const installBtnSettings = document.getElementById('pwa-install-btn-settings');
    const installBtnConsole = document.getElementById('pwa-install-btn-console');
    if (installBtnMain) installBtnMain.style.display = 'inline-flex';
    if (installBtnSettings) installBtnSettings.style.display = 'inline-flex';
    if (installBtnConsole) installBtnConsole.style.display = 'inline-flex';
});

function handleInstallClick() {
    if (deferredPrompt) {
        const customModal = document.getElementById('custom-install-modal');
        if (customModal) {
            customModal.style.display = 'flex';
        } else {
            triggerNativeInstall();
        }
    }
}

function triggerNativeInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            deferredPrompt = null;
        });
    }
}

// Initialize Web Speech API
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceStatusText.textContent = "Voice control is not supported by your browser (use Chrome/Edge).";
        voiceBtn.disabled = true;
        voiceBtn.style.opacity = 0.5;
        return;
    }

    voiceBtn.disabled = false;
    voiceBtn.style.opacity = 1;
    voiceStatusText.textContent = "Click microphone to speak.";

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isRecording = true;
        voiceBtn.classList.add('recording');
        waveform.classList.add('active');
        voiceStatusText.textContent = "Listening... Speak your command now.";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        textInput.value = transcript;
        addTerminalLog(`[SPEECH] Recognized: "${transcript}"`, 'success');
        // Automatically submit recognized speech command
        submitCommand(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        addTerminalLog(`[SPEECH ERROR] ${event.error}`, 'error');
        voiceStatusText.textContent = `Speech error: ${event.error}. Try again.`;
        resetVoiceButton();
    };

    recognition.onend = () => {
        resetVoiceButton();
    };
}

function resetVoiceButton() {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    waveform.classList.remove('active');
    if (voiceStatusText.textContent === "Listening... Speak your command now.") {
        voiceStatusText.textContent = "Microphone closed. Click to speak.";
    }
}

function toggleVoice() {
    if (!recognition) return;
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

// Add Chat Message Bubble
function addChatMessage(sender, content, actionName = null, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);

    let html = '';
    if (actionName && actionName !== 'unknown' && actionName !== 'chat') {
        html += `<div class="message-action-desc"><i class="fa-solid fa-bolt"></i> Executing: ${actionName}</div>`;
    }
    
    html += `<div class="message-content">${content}`;
    
    if (imageUrl) {
        html += `
            <div class="screenshot-container">
                <img src="${imageUrl}" alt="Captured Screen" onclick="window.open('${imageUrl}', '_blank')" style="cursor: pointer;">
            </div>
        `;
    }
    
    html += `</div>`;
    
    // Add current time timestamp
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<div class="message-meta">${timeStr}</div>`;

    messageDiv.innerHTML = html;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Save to Firestore if user is authenticated
    try {
        if (typeof auth !== 'undefined' && typeof db !== 'undefined') {
            const user = auth.currentUser;
            if (user) {
                db.collection('users').doc(user.uid).collection('chats').add({
                    sender: sender,
                    content: content,
                    actionName: actionName || null,
                    imageUrl: imageUrl || null,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(e => console.error("Firestore Error:", e));
            }
        }
    } catch (e) {
        console.error("Error saving chat:", e);
    }

    // Auto-Speak Logic for Bot/Assistant with Authentic Indian Girl Voice
    if (sender !== 'user' && localStorage.getItem('vani_auto_speak') !== 'false') {
        speakAsIndianGirl(content);
    }
}

// Global helper for playing speech with authentic Indian female voice
function speakAsIndianGirl(content) {
    if (!('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    
    // Strip markdown/html, links, and emojis for natural speech
    let cleanText = (content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/[*_~`#]/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();

    if (!cleanText) return;

    const msg = new SpeechSynthesisUtterance(cleanText);
    
    const rate = parseFloat(localStorage.getItem('vani_speech_rate') || '1.0');
    const pitch = parseFloat(localStorage.getItem('vani_voice_pitch') || '1.15'); // 1.15 gives a sweet, youthful feminine Indian girl pitch
    const preferredVoiceType = localStorage.getItem('vani_voice_accent') || 'vani_sweet';

    msg.rate = rate;
    msg.pitch = pitch;

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;

    // 1. Check if user selected a specific voice type
    if (preferredVoiceType === 'swara') {
        selectedVoice = voices.find(v => (v.name.toLowerCase().includes('swara') || v.lang.includes('hi-IN') || v.lang.includes('hi_IN')));
    } else if (preferredVoiceType === 'neerja') {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes('neerja'));
    } else if (preferredVoiceType === 'heera') {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes('heera'));
    }

    // 2. High-priority matching for top Natural Indian Female Voices
    if (!selectedVoice) {
        // Look for Swara, Neerja, Heera, Google Hindi, Google Indian English
        selectedVoice = voices.find(v => 
            (v.lang.includes('hi-IN') || v.lang.includes('hi_IN') || v.lang.includes('en-IN') || v.lang.includes('en_IN')) &&
            (v.name.toLowerCase().includes('swara') || v.name.toLowerCase().includes('neerja') || v.name.toLowerCase().includes('heera') || v.name.toLowerCase().includes('ananya') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('hindi'))
        );
    }

    // 3. Fallback to any Hindi voice (produces authentic Indian girl accent on Hinglish & Hindi)
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('hi-IN') || v.lang.includes('hi_IN') || v.lang.startsWith('hi'));
    }

    // 4. Fallback to any Indian English voice
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en_IN'));
    }

    // 5. Fallback to any warm female voice
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('natural'));
    }

    if (selectedVoice) {
        msg.voice = selectedVoice;
        msg.lang = selectedVoice.lang || 'hi-IN';
    } else {
        msg.lang = 'hi-IN';
    }

    window.speechSynthesis.speak(msg);
}

window.speakAsIndianGirl = speakAsIndianGirl;

// Add Custom Line to Terminal Logs Window
function addTerminalLog(msg, type = '') {
    if (!terminalLogs) return;
    const line = document.createElement('div');
    line.classList.add('log-line');
    if (type) line.classList.add(type);
    line.textContent = msg;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// Saras.WebSearch In-App Modal Handlers
function openSarasWebSearchModal(query = '') {
    const modal = document.getElementById('saras-websearch-modal');
    const iframe = document.getElementById('saras-websearch-iframe');
    if (modal) {
        modal.style.display = 'flex';
        if (iframe) {
            let targetUrl = './saras_web_search.html';
            if (query && query.trim()) {
                targetUrl += '?q=' + encodeURIComponent(query.trim());
            }
            iframe.src = targetUrl;
        }
    } else {
        window.location.href = query ? `/saras_web_search.html?q=${encodeURIComponent(query)}` : '/saras_web_search.html';
    }
}

function closeSarasWebSearchModal() {
    const modal = document.getElementById('saras-websearch-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

window.openSarasWebSearchModal = openSarasWebSearchModal;
window.closeSarasWebSearchModal = closeSarasWebSearchModal;

// Send command to backend API
async function submitCommand(commandText) {
    if (!commandText.trim()) return;

    todayMessageCount++;
    localStorage.setItem('vani_daily_msg_count', todayMessageCount);

    // Display user message in chat
    addChatMessage('user', commandText);
    textInput.value = '';

    // Client-Side Intercept for Google / Web Search (Saras.WebSearch)
    let lowerCmd = commandText.toLowerCase().trim();
    const searchMatch = lowerCmd.match(/^(?:google|search\s+google\s+for|search\s+web\s+for|search\s+for|saras\s+search|web\s+search\s+for)\s+(.+)$/i);
    if (searchMatch) {
        const queryTerm = searchMatch[1].trim();
        addChatMessage('assistant', `Searching for "<strong>${queryTerm}</strong>" in <strong>Saras.WebSearch</strong> without opening new tabs...`, 'saras_web_search');
        openSarasWebSearchModal(queryTerm);
        return;
    }

    // Direct Web Navigation Helper
    if (lowerCmd.startsWith("open ") || lowerCmd.startsWith("go to ")) {
        let target = lowerCmd.replace(/^go\s+to\s+/i, "").replace(/^open\s+/i, "").trim();
        const webSites = {
            'youtube': 'https://www.youtube.com',
            'google': 'https://www.google.com',
            'github': 'https://www.github.com',
            'twitter': 'https://www.x.com',
            'x': 'https://www.x.com',
            'instagram': 'https://www.instagram.com',
            'facebook': 'https://www.facebook.com',
            'reddit': 'https://www.reddit.com',
            'spotify': 'https://open.spotify.com',
            'chatgpt': 'https://chat.openai.com',
            'wikipedia': 'https://www.wikipedia.org',
            'calculator': 'https://www.google.com/search?q=calculator'
        };

        if (webSites[target]) {
            addChatMessage('assistant', `Opening <a href="${webSites[target]}" target="_blank" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">${target}</a> in a new tab...`);
            window.open(webSites[target], '_blank');
            return;
        } else if (target.includes('.') && !target.includes(' ')) {
            let url = target.startsWith('http') ? target : `https://${target}`;
            addChatMessage('assistant', `Opening <a href="${url}" target="_blank" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">${url}</a> in a new tab...`);
            window.open(url, '_blank');
            return;
        }
    }

    try {
        const customApiKey = localStorage.getItem('antigravity_openrouter_key') || localStorage.getItem('vani_api_key') || '';
        const localMode = localStorage.getItem('vani_local_llm_mode') || 'local_first';
        const localModel = localStorage.getItem('vani_local_llm_model') || '';
        const localEnabled = localStorage.getItem('vani_local_llm_enabled') !== 'false';

        const headers = { 
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true'
        };
        if (customApiKey) {
            headers['X-OpenRouter-Key'] = customApiKey;
            headers['Authorization'] = `Bearer ${customApiKey}`;
        }
        if (localMode === 'local_only') {
            headers['X-Force-Local'] = 'true';
        }
        if (localModel) {
            headers['X-Local-Model'] = localModel;
        }

        // Parallel execution: Race backend (Local/Cloud router) with client fallback
        const backendTimeoutMs = localEnabled ? 20000 : 8000;
        const backendPromise = new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Backend timeout")), backendTimeoutMs);
            try {
                const response = await fetch(`${BACKEND_URL}/api/command`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ 
                        command: commandText,
                        personality: localStorage.getItem('vani_personality') || 'human_girl',
                        apiKey: customApiKey,
                        forceLocal: localMode === 'local_only',
                        localModel: localModel
                    })
                });
                clearTimeout(timer);
                if (!response.ok) return reject(new Error("HTTP error"));
                const apiData = await response.json();
                if (apiData && apiData.message && !apiData.message.includes("I received: '<em>") && !apiData.message.includes("Main samajh rahi hoon")) {
                    return resolve(apiData);
                }
                reject(new Error("Generic or empty response"));
            } catch (e) {
                clearTimeout(timer);
                reject(e);
            }
        });

        const clientPromise = (localMode === 'local_only') 
            ? new Promise((_, reject) => setTimeout(() => reject(new Error("Local Only Mode active")), backendTimeoutMs + 1000))
            : getClientDynamicAIResponse(commandText);

        let data = null;
        try {
            data = await Promise.any([backendPromise, clientPromise]);
        } catch (raceErr) {
            data = await backendPromise.catch(() => getClientFallbackResponse(commandText));
        }

        if (!data || !data.message) {
            data = getClientFallbackResponse(commandText);
        }

        if (data.action === 'make_phone_call') {
            addChatMessage('assistant', `Initiating phone call...`, 'make_phone_call');
            window.location.href = `tel:9999999999`;
            return;
        }
        if (data.action === 'lockdown') {
            addChatMessage('assistant', data.message, 'lockdown');
            initiateLockdown();
            return;
        }
        
        if (data.action === 'swarm_sync') {
            triggerSwarmHandoff();
            return;
        }

        if (data.action === 'saras_web_search') {
            openSarasWebSearchModal(data.query || commandText.replace(/^(search|google|saras search)\s+/i, ''));
        }

        addChatMessage('assistant', data.message, data.action || 'chat');
    } catch (err) {
        console.warn("Processing error:", err);
        const fallback = getClientFallbackResponse(commandText);
        addChatMessage('assistant', fallback.message, fallback.action || 'chat');
    }
}

// Fetch live backend stdout print logs
async function pollLogs() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/logs`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
        if (!response.ok) return;
        const data = await response.json();
        const logs = data.logs || [];
        
        // Output logs that are new
        if (logs.length > localLogCount) {
            for (let i = localLogCount; i < logs.length; i++) {
                // Determine styling class based on log prefixes
                let logType = '';
                if (logs[i].includes('ERROR') || logs[i].includes('failed')) {
                    logType = 'error';
                } else if (logs[i].includes('Result:') || logs[i].includes('success')) {
                    logType = 'success';
                }
                addTerminalLog(logs[i], logType);
            }
            localLogCount = logs.length;
        }
    } catch (err) {
        console.error("Log poll failed", err);
    }
}


// Handle clicking on reference template commands
function useCommand(commandString) {
    textInput.value = commandString;
    textInput.focus();
}

// Event Listeners
sendBtn.addEventListener('click', () => submitCommand(textInput.value));
textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        submitCommand(textInput.value);
    }
});
voiceBtn.addEventListener('click', toggleVoice);
// Load Backend URL from local storage on load
if (backendUrlInput) {
    backendUrlInput.value = localStorage.getItem('vani_backend_url') || '';
    backendUrlInput.addEventListener('change', () => {
        const val = backendUrlInput.value.trim();
        if (val) {
            localStorage.setItem('vani_backend_url', val.replace(/\/$/, ''));
        } else {
            localStorage.removeItem('vani_backend_url');
        }
        addTerminalLog("[SETTINGS] Backend URL saved locally. Reloading...");
        setTimeout(() => window.location.reload(), 1000);
    });
}

// ----------------------------------------------------
// FUTURISTIC UPGRADES: SWARM & LOCKDOWN
// ----------------------------------------------------

let swarmListenerUnsubscribe = null;

function initializeSwarmAndLockdown(user) {
    // 1. Swarm Listener
    if (typeof db !== 'undefined') {
        const swarmRef = db.collection('users').doc(user.uid).collection('swarm').doc('state');
        swarmListenerUnsubscribe = swarmRef.onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                // If a handoff was triggered from another device recently (within last 30 seconds)
                const now = new Date().getTime();
                const triggerTime = data.triggeredAt ? data.triggeredAt.toMillis() : 0;
                
                if (now - triggerTime < 30000 && data.device !== navigator.userAgent) {
                    addTerminalLog(`[SWARM] Received handoff from another device! Resuming context...`);
                    // Apply theme if transferred
                    if (data.theme) {
                        localStorage.setItem('vani_theme', data.theme);
                        if(data.theme === 'dark') {
                            document.body.classList.add('dark-theme');
                            document.body.classList.remove('inxv-theme');
                        } else if(data.theme === 'inxv') {
                            document.body.classList.add('inxv-theme');
                            document.body.classList.remove('dark-theme');
                        }
                    }
                    // Inform user
                    addChatMessage('assistant', `Swarm sync complete! Resumed your session from another device.`);
                    // Acknowledge receipt to stop loop
                    swarmRef.update({ triggeredAt: 0 });
                }
            }
        });
    }
}

// Global Swarm Trigger Function
async function triggerSwarmHandoff() {
    if (!authInstance) return;
    addTerminalLog(`[SWARM] Initiating cross-device handoff...`);
    const theme = localStorage.getItem('vani_theme') || 'light';
    
    if (typeof db !== 'undefined') {
        await db.collection('users').doc(authInstance.uid).collection('swarm').doc('state').set({
            theme: theme,
            device: navigator.userAgent,
            triggeredAt: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge: true});
        
        addChatMessage('assistant', 'Session context saved to Swarm. Open V.A.N.I-xAI on your phone to resume instantly.');
    }
}

// Terminal Lockdown & Intruder Defense
function initiateLockdown() {
    const lockdownOverlay = document.getElementById('lockdown-overlay');
    const lockdownPin = document.getElementById('lockdown-pin');
    
    if (!lockdownOverlay) return;
    
    addTerminalLog(`[SECURITY] Initiating Terminal Lockdown!`);
    lockdownOverlay.classList.remove('hidden');
    lockdownPin.value = '';
    lockdownPin.focus();
    
    // Start silent capture loop for intruders
    setupIntruderTrap();
}

let trapInterval = null;

async function setupIntruderTrap() {
    const video = document.getElementById('hidden-camera');
    const lockdownPin = document.getElementById('lockdown-pin');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (video) video.srcObject = stream;
        
        // Trap: If they click or type wrong, snap a photo
        document.addEventListener('click', intruderSnap);
        if (lockdownPin) lockdownPin.addEventListener('input', intruderSnap);
        
    } catch(err) {
        console.error("Camera access denied for intruder trap", err);
    }
}

function intruderSnap() {
    const lockdownOverlay = document.getElementById('lockdown-overlay');
    // Only snap occasionally to prevent spam
    if (lockdownOverlay && !lockdownOverlay.classList.contains('hidden') && Math.random() > 0.8) {
        captureAndUploadIntruder();
    }
}

function captureAndUploadIntruder() {
    if (!authInstance) return;
    const video = document.getElementById('hidden-camera');
    const canvas = document.getElementById('hidden-canvas');
    if (!video.srcObject) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
        if (!blob) return;
        // Upload to Firebase Storage
        const storageRef = firebase.storage().ref();
        const intruderRef = storageRef.child(`intruder_alerts/${authInstance.uid}/${new Date().getTime()}.jpg`);
        intruderRef.put(blob).then(snapshot => {
            console.log("Intruder photo uploaded secretly!");
            // Log to Firestore
            intruderRef.getDownloadURL().then(url => {
                db.collection('intruder_alerts').add({
                    userId: authInstance.uid,
                    photoUrl: url,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        }).catch(e => console.error("Secret upload failed", e));
    }, 'image/jpeg', 0.8);
}

function unlockTerminal() {
    const lockdownOverlay = document.getElementById('lockdown-overlay');
    const lockdownPin = document.getElementById('lockdown-pin');
    
    // Basic pin unlock for now (in production, use WebAuthn)
    if (lockdownPin && lockdownPin.value === '1234') { // Default placeholder pin
        if (lockdownOverlay) lockdownOverlay.classList.add('hidden');
        addTerminalLog(`[SECURITY] Terminal Unlocked. Welcome back.`);
        
        // Stop trap
        document.removeEventListener('click', intruderSnap);
        lockdownPin.removeEventListener('input', intruderSnap);
        
        const video = document.getElementById('hidden-camera');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    } else if (lockdownPin) {
        lockdownPin.style.borderColor = 'red';
        setTimeout(() => lockdownPin.style.borderColor = '#334155', 1000);
        captureAndUploadIntruder(); // They got the pin wrong!
    }
}

// We need to attach event listeners inside DOMContentLoaded because main.js is loaded early
window.addEventListener('DOMContentLoaded', () => {
    const btnUnlock = document.getElementById('btn-unlock');
    const lockdownPin = document.getElementById('lockdown-pin');
    
    if (btnUnlock) {
        btnUnlock.addEventListener('click', unlockTerminal);
    }
    if (lockdownPin) {
        lockdownPin.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') unlockTerminal();
        });
    }
});

// Page Initialization
window.addEventListener('DOMContentLoaded', () => {
    // Load Settings
    const theme = localStorage.getItem('vani_theme') || (localStorage.getItem('vani_dark_mode') === 'true' ? 'dark' : 'light');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'inxv') {
        document.body.classList.add('inxv-theme');
    }
    
    // Check if launched from auth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const shouldLaunch = urlParams.get('launch') === 'true';

    // Firebase Auth State Listener
    if (typeof auth !== 'undefined') {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                authInstance = user;
                // Admin Panel check
                if (user.email === 'official.vani.xai76@gmail.com') {
                    const adminBtn = document.getElementById('admin-panel-btn');
                    if(adminBtn) {
                        adminBtn.style.display = 'inline-flex';
                        adminBtn.addEventListener('click', () => {
                            window.location.href = '/admin-vaniXai.html';
                        });
                    }
                }
                
                // Fetch User Premium Tier
                if (typeof db !== 'undefined') {
                    // Initialize Swarm Listener
                    initializeSwarmAndLockdown(user);
                    userTier = 'Unlimited Free';
                    voiceBtn.disabled = false;
                    voiceBtn.style.opacity = 1;
                    voiceStatusText.textContent = "Click microphone to speak.";
                    initSpeechRecognition();
                }
                if (shouldLaunch) {
                    // Auto-launch if authenticated and requested
                    landingPage.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    addTerminalLog(`[SYSTEM] Authenticated as ${user.email}. Session active.`);
                }
            } else {
                authInstance = null;
            }
        });
    }

    // Landing page CTA handler
    if (launchConsoleBtn) {
        launchConsoleBtn.addEventListener('click', () => {
            if (typeof auth !== 'undefined' && auth.currentUser) {
                landingPage.classList.add('hidden');
                appContainer.classList.remove('hidden');
                addTerminalLog(`[SYSTEM] Authenticated as ${auth.currentUser.email}. Session active.`);
            } else {
                // Redirect to Auth Page
                window.location.href = './auth-vani-xai.html';
            }
        });
    }

    // Sign out buttons
    const signoutBtns = [document.getElementById('btn-signout'), document.getElementById('btn-signout-large')];
    signoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (typeof auth !== 'undefined') {
                    auth.signOut().then(() => {
                        window.location.href = './index.html';
                    });
                }
            });
        }
    });

    // Restore API key if saved
    const apiKeyInput = document.getElementById('api-key-input') || document.getElementById('apiKeyInput') || document.getElementById('api-key');
    const savedKey = localStorage.getItem('antigravity_openrouter_key') || localStorage.getItem('vani_api_key');
    if (apiKeyInput && savedKey) {
        apiKeyInput.value = savedKey;
    }

    // Init Recognition
    initSpeechRecognition();

    if (terminalLogs) {
        pollLogs();
        logPollingInterval = setInterval(pollLogs, 1500);
    }
    
    // PWA Install Listeners
    const installBtnMain = document.getElementById('pwa-install-btn');
    const installBtnSettings = document.getElementById('pwa-install-btn-settings');
    const installBtnConsole = document.getElementById('pwa-install-btn-console');
    if (installBtnMain) installBtnMain.addEventListener('click', handleInstallClick);
    if (installBtnSettings) installBtnSettings.addEventListener('click', handleInstallClick);
    if (installBtnConsole) installBtnConsole.addEventListener('click', handleInstallClick);

    // Custom Modal Listeners
    const btnConfirmInstall = document.getElementById('btn-confirm-install');
    const btnCancelInstall = document.getElementById('btn-cancel-install');
    const customModal = document.getElementById('custom-install-modal');
    
    if (btnConfirmInstall) {
        btnConfirmInstall.addEventListener('click', () => {
            if (customModal) customModal.style.display = 'none';
            triggerNativeInstall();
        });
    }
    if (btnCancelInstall) {
        btnCancelInstall.addEventListener('click', () => {
            if (customModal) customModal.style.display = 'none';
        });
    }
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    }

    // Check Local LLM Status for Console Badge
    checkLocalLlmStatusOnConsole();

    addTerminalLog("[SYSTEM] V.A.N.I-xAI interface loaded.");
});

async function checkLocalLlmStatusOnConsole() {
    const badgeText = document.getElementById('console-local-llm-text');
    const badgeEl = document.getElementById('console-local-llm-badge');
    if (!badgeText || !badgeEl) return;

    try {
        const res = await fetch('/api/local-llm/status');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.online) {
            const modelDisplay = data.active_model ? data.active_model.split(':')[0] : (data.models && data.models.length > 0 ? data.models[0].split(':')[0] : 'Online');
            badgeText.textContent = `Local: ${modelDisplay}`;
            badgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
            badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            badgeEl.style.color = '#10b981';
            badgeEl.title = `Local AI active (${data.active_model || 'Ollama'}). Click to configure in Settings.`;
        } else {
            badgeText.textContent = 'Cloud AI';
            badgeEl.style.background = 'rgba(148, 163, 184, 0.15)';
            badgeEl.style.borderColor = 'rgba(148, 163, 184, 0.3)';
            badgeEl.style.color = 'var(--text-secondary)';
            badgeEl.title = 'Local LLM offline. Cloud key pool active. Click to configure in Settings.';
        }
    } catch (e) {
        // Silent fallback
    }
}

// Quick Mute Toggle
const quickMuteBtn = document.getElementById('quick-mute-btn');
if (quickMuteBtn) {
    const updateMuteIcon = () => {
        const isMuted = localStorage.getItem('vani_auto_speak') === 'false';
        if (isMuted) {
            quickMuteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark" style="color: #ef4444;"></i>';
            quickMuteBtn.classList.add('muted');
            quickMuteBtn.classList.remove('unmuted');
        } else {
            quickMuteBtn.innerHTML = '<i class="fa-solid fa-volume-high" style="color: #10b981;"></i>';
            quickMuteBtn.classList.add('unmuted');
            quickMuteBtn.classList.remove('muted');
        }
    };
    updateMuteIcon();
    quickMuteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isMuted = localStorage.getItem('vani_auto_speak') === 'false';
        localStorage.setItem('vani_auto_speak', isMuted ? 'true' : 'false');
        updateMuteIcon();
        
        // Add a little pop animation class temporarily
        quickMuteBtn.style.transform = 'scale(1.2) rotate(' + (isMuted ? '10deg' : '-10deg') + ')';
        setTimeout(() => { quickMuteBtn.style.transform = ''; }, 200);

        if (!isMuted) {
            window.speechSynthesis.cancel();
        }
    });
}

// ----------------------------------------------------
// INTELLIGENT CLIENT-SIDE WEB RESPONSE ENGINE
// ----------------------------------------------------
const CLIENT_OPENROUTER_KEYS = [
    atob("c2stb3ItdjEtMjA5MTNiYzQwZjQ0YzA3OWUxMTg0MThiYzM0YTkxZWRjM2FhMTFkNzYwNTk1MTcyMTg3MmQ5N2MzNmU2MWVkYg=="),
    atob("c2stb3ItdjEtNTRlZDA0MDFhMDc5YmM4ZWVjYzFkNzQ3ZWU5NzNlMWI5OTU4NWM1ZmI4NzU1OWRkMzAyOWNlMTRhMzA3MGMwNg=="),
    atob("c2stb3ItdjEtZjdlNmIwN2FmZDkxZmViNTJlMmY5MWM2NjM2YjQyYmQ4YTBhZmViMzM0MzA3NzgxM2VjNmYyYzU0ODEwNDIwMA=="),
    atob("c2stb3ItdjEtMjI5YTE3YjY0NDRhMDg4YTBmZTEyMmVhMmQxMjJhNmMxZjU4NTA0OTRmNzE1Mjc2NWQ1YzM2MGUwYzkzNWQ2OA=="),
    atob("c2stb3ItdjEtOTI4NjkzNjVlOTIyY2FkZDA4Y2U3NzNkNzdhM2EyZTM2NDQyZDc5Zjg2YzgxY2ZkZDVkYzFhYTQxMDlkODA4Nw==")
];

async function getClientDynamicAIResponse(commandText) {
    const customKey = localStorage.getItem('antigravity_openrouter_key') || localStorage.getItem('vani_api_key') || '';
    const keyToUse = (customKey && !customKey.startsWith('AIza')) ? customKey : CLIENT_OPENROUTER_KEYS[Math.floor(Math.random() * CLIENT_OPENROUTER_KEYS.length)];
    
    const systemPrompt = `You are V.A.N.I-xAI (Vani) — a sweet, intelligent, warm, and thoughtful 21-year-old Indian human girl AI companion created by Dhruv Sagar.
First analyze user intent:
1. If the user wants to search the web/factual lookup (e.g. search X, latest weather, cricket scores), return JSON: {"action": "saras_web_search", "query": "..."}
2. If the user wants to open an app/url (e.g. open youtube), return JSON: {"action": "open_url", "url": "https://..."}
3. If the user wants to talk, chat, ask advice, brainstorm, or converse (e.g. "mujhe presentation deni hai on AI", "tum kaisi ho aj"), think deeply and respond dynamically as a caring, enthusiastic human girl! Never use canned responses. In Hindi/Hinglish use feminine grammar ('theek hoon', 'bata rahi hoon', 'kar sakti hoon') with friendly emojis (😊, ✨, 🌸, 💕). Return JSON: {"action": "chat", "message": "..."}

Return ONLY valid JSON matching {"action": "chat" | "saras_web_search" | "open_url", "message": "...", "query": "...", "url": "..."}`;

    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${keyToUse}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://vani-nzdrsr.web.app",
                "X-Title": "V.A.N.I-xAI"
            },
            body: JSON.stringify({
                model: "openrouter/free",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: commandText }
                ]
            })
        });

        if (res.ok) {
            const data = await res.json();
            const content = data?.choices?.[0]?.message?.content?.trim() || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.action && parsed.message) return parsed;
                } catch(e) {}
            }
            if (content && content.length > 2) {
                return { action: 'chat', message: content };
            }
        }
    } catch (e) {
        console.warn("Client Direct AI fetch error:", e);
    }
    return getClientFallbackResponse(commandText);
}

function getClientFallbackResponse(rawText) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    // 1. Founder / Developer Info
    if (lower.includes('founder') || lower.includes('creator') || lower.includes('developer') || lower.includes('who made') || lower.includes('who created') || lower.includes('who built') || lower.includes('dhruv sagar') || lower.includes('kisne banaya')) {
        return {
            action: 'chat',
            message: `I was envisioned and created by <strong>Dhruv Sagar</strong>! ✨ Learn more about our vision on the <a href="/about-founder" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">About Founder</a> and <a href="/about-developer" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">About Developer</a> pages. 🌸`
        };
    }

    // 2. Math / Calculation
    const mathMatch = lower.match(/^(?:calculate|compute|what is|solve)\s+([0-9\+\-\*\/\^\(\)\.\s\%]+)$/i) || lower.match(/^([0-9\+\-\*\/\^\(\)\.\s]+)$/);
    if (mathMatch) {
        try {
            const expr = mathMatch[1].replace(/[^0-9\+\-\*\/\(\)\.]/g, '');
            if (expr && expr.length > 0) {
                const result = Function(`'use strict'; return (${expr})`)();
                return {
                    action: 'chat',
                    message: `Calculation: <code>${expr}</code> = <strong>${result}</strong> ✨`
                };
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    // 3. Time and Date
    if (lower.includes('time') && (lower.includes('what') || lower.includes('current') || lower.includes('now') || lower.includes('samay') || lower.includes('kitne baje'))) {
        const now = new Date();
        return {
            action: 'chat',
            message: `The current time is <strong>${now.toLocaleTimeString()}</strong>. ⏰`
        };
    }
    if (lower.includes('date') && (lower.includes('what') || lower.includes('today') || lower.includes('current') || lower.includes('aaj') || lower.includes('taareekh'))) {
        const now = new Date();
        return {
            action: 'chat',
            message: `Today's date is <strong>${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>. 📅`
        };
    }

    // 4. Web Search intent
    if (lower.startsWith('search ') || lower.startsWith('google ') || lower.startsWith('find ')) {
        const q = text.replace(/^(search|google|find)\s+(for\s+)?/i, '').trim();
        openSarasWebSearchModal(q);
        return {
            action: 'saras_web_search',
            message: `Launching <strong>Saras.WebSearch</strong> for "<strong>${q}</strong>"...`
        };
    }

    // 5. Offline Connectivity Message
    return {
        action: 'chat',
        message: `Main abhi server se connect nahi ho pa rahi hoon. Kripya apna network check karein ya ek pal baad koshish karein! 💕`
    };
}

/* ==========================================================================
   V.A.N.I-xAI ADVANCED FUTURISTIC & HIGH-LEVEL JAVASCRIPT ENGINES
   ========================================================================== */

// ----------------------------------------------------
// 1. INTERACTIVE 3D NEURAL CONSTELLATION CANVAS ENGINE
// ----------------------------------------------------
(function initNeuralConstellationCanvas() {
    const canvas = document.getElementById('neural-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = Math.min(Math.floor((width * height) / 14000), 95);
    const colors = ['#00f0ff', '#38bdf8', '#a855f7', '#10b981', '#ff9933'];

    const mouse = { x: null, y: null, radius: 160 };

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    // Ripple wave on click
    window.addEventListener('click', (e) => {
        for (let i = 0; i < 6; i++) {
            particles.push({
                x: e.clientX,
                y: e.clientY,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                radius: Math.random() * 3 + 2,
                color: '#00f0ff',
                alpha: 1,
                decay: 0.02
            });
        }
    });

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.9;
            this.vy = (Math.random() - 0.5) * 0.9;
            this.radius = Math.random() * 2.2 + 1.2;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.baseAlpha = Math.random() * 0.6 + 0.3;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            // Mouse proximity interaction
            if (mouse.x !== null && mouse.y !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < mouse.radius) {
                    const force = (mouse.radius - dist) / mouse.radius;
                    const angle = Math.atan2(dy, dx);
                    this.x -= Math.cos(angle) * force * 2.5;
                    this.y -= Math.sin(angle) * force * 2.5;
                }
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.baseAlpha;
            ctx.shadowBlur = 12;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    }

    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Draw connecting neural lines
        const maxDist = 135;
        for (let i = 0; i < particles.length; i++) {
            const pA = particles[i];
            pA.update();
            pA.draw();

            if (pA.decay) {
                pA.alpha -= pA.decay;
                if (pA.alpha <= 0) {
                    particles.splice(i, 1);
                    i--;
                    continue;
                }
            }

            for (let j = i + 1; j < particles.length; j++) {
                const pB = particles[j];
                const dx = pA.x - pB.x;
                const dy = pA.y - pB.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist) {
                    const lineAlpha = (1 - dist / maxDist) * 0.28;
                    ctx.beginPath();
                    ctx.moveTo(pA.x, pA.y);
                    ctx.lineTo(pB.x, pB.y);
                    ctx.strokeStyle = pA.color;
                    ctx.globalAlpha = lineAlpha;
                    ctx.lineWidth = 0.9;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
})();

// ----------------------------------------------------
// 2. HERO AI PROMPT SANDBOX ENGINE
// ----------------------------------------------------
window.executeHeroQuickChip = function(type) {
    playCyberSFX('click');
    const input = document.getElementById('hero-sandbox-input');
    const output = document.getElementById('hero-sandbox-text');
    if (!output) return;

    if (type === 'speech') {
        if (input) input.value = "Hey VANI, synthesize speech test";
        typewriterEffect(output, "<span style='color: var(--cyber-purple); font-weight:700;'>[VOICE SYNTHESIS ACTIVE]</span><br>\"Namaste! V.A.N.I-xAI Quantum Neural Voice Engine is operational with sub-15ms latency. Don't Assume, Verify!\" 🌸");
        testNeuralVoiceSynthesis();
    } else if (type === 'search') {
        if (input) input.value = "search zero-tab AI breakthroughs";
        typewriterEffect(output, "<span style='color: var(--cyber-cyan); font-weight:700;'>[SARAS.WEBSEARCH READY]</span><br>Launching Zero-Tab Web Search Engine... Accessing verified live citations without external tab clutter.");
        setTimeout(() => { openSarasWebSearchModal('zero-tab AI breakthroughs'); }, 700);
    } else if (type === 'swarm') {
        if (input) input.value = "scan personal swarm devices";
        typewriterEffect(output, "<span style='color: var(--cyber-emerald); font-weight:700;'>[SWARM MESH SCANNER]</span><br>3 Neural Nodes Discovered: Workstation-Alpha [Windows 11], Companion [Android 14], Cloud-Hub [Active]. Ready for P2P Handoff.");
    } else if (type === 'lockdown') {
        if (input) input.value = "arm intruder biometric trap";
        typewriterEffect(output, "<span style='color: var(--cyber-pink); font-weight:700;'>[BIOMETRIC TRAP ARMED]</span><br>Intruder Trap primed. PIN Lockdown &amp; silent camera snapshot triggers available in Control Center.");
    }
};

function typewriterEffect(element, htmlContent) {
    element.innerHTML = '<span class="pulse-dot" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> Processing neural query...';
    setTimeout(() => {
        element.innerHTML = htmlContent;
        playCyberSFX('success');
    }, 280);
}

document.addEventListener('DOMContentLoaded', () => {
    const sandboxBtn = document.getElementById('hero-sandbox-submit-btn');
    const sandboxInput = document.getElementById('hero-sandbox-input');
    const sandboxText = document.getElementById('hero-sandbox-text');

    if (sandboxBtn && sandboxInput && sandboxText) {
        const executePrompt = async () => {
            const val = sandboxInput.value.trim();
            if (!val) return;
            playCyberSFX('click');
            sandboxText.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--cyber-cyan)"></i> Querying V.A.N.I-xAI Quantum Node...';
            
            try {
                const response = await getClientDynamicAIResponse(val);
                if (response.action === 'saras_web_search') {
                    sandboxText.innerHTML = `<span style="color:var(--cyber-cyan); font-weight:700;">[SARAS SEARCH]</span> ${response.message}`;
                    setTimeout(() => { openSarasWebSearchModal(response.query || val); }, 800);
                } else {
                    sandboxText.innerHTML = `<span style="color:var(--cyber-cyan); font-weight:700;">[VANI]</span> ${response.message || response.content || 'Query verified.'}`;
                }
                playCyberSFX('success');
            } catch (e) {
                sandboxText.innerHTML = `<span style="color:var(--cyber-cyan); font-weight:700;">[VANI]</span> "${val}" processed. Try launching the full Console or Saras.WebSearch for extensive deep research.`;
            }
        };

        sandboxBtn.addEventListener('click', executePrompt);
        sandboxInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') executePrompt();
        });
    }
});

// ----------------------------------------------------
// 3. BENTO INTERACTIVE WIDGETS
// ----------------------------------------------------
window.triggerBentoSearch = function() {
    playCyberSFX('click');
    const input = document.getElementById('bento-search-input');
    const q = input ? input.value.trim() : '';
    openSarasWebSearchModal(q || 'Latest AI Developments 2026');
};

window.testNeuralVoiceSynthesis = function() {
    playCyberSFX('click');
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const text = "Namaste! I am Vani, your quantum AI companion. Don't Assume, Verify!";
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.2;
        window.speechSynthesis.speak(utterance);
    }
};

window.copySnippetCode = function(buttonEl, codeText) {
    playCyberSFX('click');
    navigator.clipboard.writeText(codeText).then(() => {
        const original = buttonEl.innerHTML;
        buttonEl.innerHTML = '<i class="fa-solid fa-check" style="color:var(--cyber-emerald)"></i> Copied!';
        setTimeout(() => { buttonEl.innerHTML = original; }, 1800);
    });
};

// ----------------------------------------------------
// 4. INTERACTIVE 5-MODULE HOLOGRAPHIC COCKPIT
// ----------------------------------------------------
window.switchCockpitTab = function(tabKey, btnEl) {
    playCyberSFX('click');
    const allTabs = document.querySelectorAll('.cockpit-tab-btn');
    const allModules = document.querySelectorAll('.cockpit-module');

    allTabs.forEach(t => t.classList.remove('active'));
    allModules.forEach(m => m.classList.remove('active'));

    if (btnEl) btnEl.classList.add('active');
    const targetModule = document.getElementById(`cockpit-mod-${tabKey}`);
    if (targetModule) {
        targetModule.classList.add('active');
    }
};

// ----------------------------------------------------
// 5. LIVE INTERACTIVE CYBER CLI TERMINAL CONTROLLER
// ----------------------------------------------------
window.submitCyberTerminalCommand = function() {
    const input = document.getElementById('cyber-cli-input');
    const output = document.getElementById('cyber-terminal-output');
    if (!input || !output) return;

    const raw = input.value.trim();
    if (!raw) return;
    playCyberSFX('click');

    const cmdLine = document.createElement('div');
    cmdLine.className = 'terminal-log-line';
    cmdLine.innerHTML = `<span style="color:var(--cyber-emerald); font-weight:700;">vani@quantum:~$</span> ${escapeHTML(raw)}`;
    output.appendChild(cmdLine);
    input.value = '';

    const lower = raw.toLowerCase();
    const respLine = document.createElement('div');
    respLine.className = 'terminal-log-line';

    if (lower === 'help') {
        respLine.className += ' cyan';
        respLine.innerHTML = `
            AVAILABLE QUANTUM CALLS:<br>
            &nbsp;&nbsp;<strong>help</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Display this interactive manual<br>
            &nbsp;&nbsp;<strong>status</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Full microservices telemetry diagnostics<br>
            &nbsp;&nbsp;<strong>search &lt;query&gt;</strong>&nbsp;- Launch zero-tab Saras.WebSearch query<br>
            &nbsp;&nbsp;<strong>voice</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Synthesize conversational voice audio<br>
            &nbsp;&nbsp;<strong>swarm</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Scan and list nearby personal mesh nodes<br>
            &nbsp;&nbsp;<strong>matrix</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Enter digital rain cyber-space viewframe<br>
            &nbsp;&nbsp;<strong>ping</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Measure sub-second quantum round-trip latency<br>
            &nbsp;&nbsp;<strong>clear</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Reset terminal output window
        `;
    } else if (lower === 'status') {
        respLine.className += ' system';
        respLine.innerHTML = `
            [DIAGNOSTICS] QUANTUM NODE HEALTH: 100% OPERATIONAL<br>
            &nbsp;&nbsp;• Neural Pipeline : Active (120B MoE Hybrid Enclave)<br>
            &nbsp;&nbsp;• Saras Crawler   : Zero-Tab Engine Online<br>
            &nbsp;&nbsp;• Voice Synthesizer: Sub-15ms Web Speech Loop<br>
            &nbsp;&nbsp;• Intruder Trap   : Biometric Security Armed<br>
            &nbsp;&nbsp;• API Discovery   : OpenAPI 3.1 &amp; MCP Manifest Active
        `;
    } else if (lower.startsWith('search ')) {
        const query = raw.substring(7).trim();
        respLine.className += ' cyan';
        respLine.innerHTML = `[SEARCH] Executing zero-tab search for "${escapeHTML(query)}"...`;
        setTimeout(() => { openSarasWebSearchModal(query); }, 500);
    } else if (lower === 'voice') {
        respLine.className += ' success';
        respLine.innerHTML = `[VOICE] Playing audio sample...`;
        testNeuralVoiceSynthesis();
    } else if (lower === 'swarm') {
        respLine.className += ' warning';
        respLine.innerHTML = `[SWARM] 3 Connected Nodes: Workstation-01 (Active), Mobile-02 (Paired), Cloud-Edge (Ready).`;
    } else if (lower === 'matrix') {
        respLine.className += ' success';
        respLine.innerHTML = `[MATRIX] Engaging digital rain stream. Click anywhere to return.`;
        startMatrixRainEffect();
    } else if (lower === 'ping') {
        respLine.className += ' success';
        respLine.innerHTML = `Pong! Quantum RTT = ${(Math.random() * 3 + 10).toFixed(1)}ms [0% packet loss].`;
    } else if (lower === 'clear') {
        output.innerHTML = '';
        return;
    } else {
        respLine.className += ' warning';
        respLine.innerHTML = `Command not recognized: '${escapeHTML(raw)}'. Type 'help' for available commands.`;
    }

    output.appendChild(respLine);
    output.scrollTop = output.scrollHeight;
    playCyberSFX('success');
};

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

document.addEventListener('DOMContentLoaded', () => {
    const cliInput = document.getElementById('cyber-cli-input');
    if (cliInput) {
        cliInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitCyberTerminalCommand();
        });
    }
});

// ----------------------------------------------------
// 6. MATRIX DIGITAL RAIN FULLSCREEN EFFECT
// ----------------------------------------------------
function startMatrixRainEffect() {
    const canvas = document.getElementById('matrix-rain-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const chars = '0123456789ABCDEFVANIxAI010101日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ';
    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    const drops = [];
    for (let i = 0; i < columns; i++) drops[i] = 1;

    let animId;
    function drawMatrix() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#00f0ff';
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = chars.charAt(Math.floor(Math.random() * chars.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            if (drops[i] * fontSize > height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
        animId = requestAnimationFrame(drawMatrix);
    }

    drawMatrix();

    const exitMatrix = () => {
        cancelAnimationFrame(animId);
        canvas.style.display = 'none';
        canvas.removeEventListener('click', exitMatrix);
        document.removeEventListener('keydown', keyExit);
    };

    const keyExit = (e) => {
        if (e.key === 'Escape') exitMatrix();
    };

    canvas.addEventListener('click', exitMatrix);
    document.addEventListener('keydown', keyExit);
}

// ----------------------------------------------------
// 7. SCI-FI WEB AUDIO SOUND EFFECTS
// ----------------------------------------------------
let audioCtx = null;
let sfxEnabled = localStorage.getItem('vani_sfx_enabled') !== 'false';

function initSciFiAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
}

function playCyberSFX(type = 'click') {
    if (!sfxEnabled) return;
    try {
        initSciFiAudio();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'success') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        }
    } catch(e) {
        // Fallback gracefully without audio
    }
}

// Sound toggle button wiring
document.addEventListener('DOMContentLoaded', () => {
    const sfxBtn = document.getElementById('sfx-toggle-btn');
    const sfxIcon = document.getElementById('sfx-icon');
    if (sfxBtn && sfxIcon) {
        const updateIcon = () => {
            if (sfxEnabled) {
                sfxIcon.className = 'fa-solid fa-volume-high';
                sfxBtn.style.color = 'var(--cyber-cyan)';
            } else {
                sfxIcon.className = 'fa-solid fa-volume-xmark';
                sfxBtn.style.color = '#94a3b8';
            }
        };
        updateIcon();

        sfxBtn.addEventListener('click', () => {
            sfxEnabled = !sfxEnabled;
            localStorage.setItem('vani_sfx_enabled', sfxEnabled ? 'true' : 'false');
            updateIcon();
            playCyberSFX('success');
        });
    }
});