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
let userTier = 'Free'; // Default tier
let todayMessageCount = parseInt(localStorage.getItem('vani_daily_msg_count') || '0');
let lastMessageDate = localStorage.getItem('vani_last_msg_date');

// Reset daily message count if it's a new day
const today = new Date().toDateString();
if (lastMessageDate !== today) {
    todayMessageCount = 0;
    localStorage.setItem('vani_daily_msg_count', '0');
    localStorage.setItem('vani_last_msg_date', today);
}

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
    if (userTier === 'Free' || userTier === 'Starter') {
        voiceStatusText.textContent = "Voice control requires Pro Tier or above.";
        voiceBtn.disabled = true;
        voiceBtn.style.opacity = 0.5;
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceStatusText.textContent = "Voice control is not supported by your browser (use Chrome/Edge).";
        voiceBtn.disabled = true;
        voiceBtn.style.opacity = 0.5;
        return;
    }

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

    // Auto-Speak Logic for Bot/Assistant
    if (sender !== 'user' && localStorage.getItem('vani_auto_speak') !== 'false') {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop any ongoing speech
            
            // Strip markdown/html and EMOJIS for speaking
            let cleanText = content.replace(/<[^>]+>/g, '').replace(/[*_~`]/g, '');
            // Regex to remove all emojis
            cleanText = cleanText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

            const msg = new SpeechSynthesisUtterance(cleanText);
            
            const rate = parseFloat(localStorage.getItem('vani_speech_rate') || '1.0');
            msg.rate = rate;
            
            // 1. Try to pick an Indian Female voice (supports Hinglish natively on most OS)
            const voices = window.speechSynthesis.getVoices();
            let preferredVoice = voices.find(v => 
                (v.lang.includes('en-IN') || v.lang.includes('hi-IN')) && 
                (v.name.includes('Female') || v.name.includes('Heera') || v.name.includes('Neerja'))
            );
            
            // 2. Fallback to any Indian voice
            if (!preferredVoice) {
                preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('hi-IN'));
            }
            
            // 3. Fallback to any female voice
            if (!preferredVoice) {
                preferredVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Google US English'));
            }

            if (preferredVoice) {
                msg.voice = preferredVoice;
            }

            window.speechSynthesis.speak(msg);
        }
    }
}

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

    // Check Premium Tier Limits
    if (userTier === 'Free' && todayMessageCount >= 5) {
        addChatMessage('assistant', 'You have reached your daily limit of 5 messages on the Free Plan. Please upgrade to Starter or higher to continue chatting.', 'error');
        setTimeout(() => window.location.href = '/premium.html', 3000);
        return;
    }

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
        const headers = { 
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true'
        };
        if (customApiKey) {
            headers['X-OpenRouter-Key'] = customApiKey;
            headers['Authorization'] = `Bearer ${customApiKey}`;
        }

        const response = await fetch(`${BACKEND_URL}/api/command`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                command: commandText,
                personality: localStorage.getItem('vani_personality') || 'human_girl',
                apiKey: customApiKey
            })
        });

        const apiData = await response.json();
        
        if (response.ok && apiData.success !== false) {
            let data = {
                action: apiData.action || 'chat',
                message: apiData.message || ''
            };
            
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
                openSarasWebSearchModal(commandText.replace(/^(search|google|saras search)\s+/i, ''));
            }

            addChatMessage('assistant', data.message, data.action || 'chat');
        } else {
            console.error("Backend Error:", apiData);
            // Fallback to client response engine if backend returned error
            const fallback = getClientFallbackResponse(commandText);
            addChatMessage('assistant', fallback.message, fallback.action);
        }
    } catch (err) {
        console.warn("Backend unavailable, using Web Intelligence Engine:", err);
        // Instant Client-Side Intelligent Fallback when backend is offline
        const fallback = getClientFallbackResponse(commandText);
        addChatMessage('assistant', fallback.message, fallback.action);
        addTerminalLog(`[WEB AI] Answered query locally: "${commandText}"`, 'success');
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
                    
                    db.collection('activation_keys')
                        .where('userId', '==', user.uid)
                        .where('isUsed', '==', true)
                        .get()
                        .then(snapshot => {
                            if (!snapshot.empty) {
                                let latestKey = null;
                                let maxTime = 0;
                                snapshot.forEach(k => {
                                    const d = k.data();
                                    const usedTime = d.usedAt ? (typeof d.usedAt.toMillis === 'function' ? d.usedAt.toMillis() : 0) : 0;
                                    if(usedTime >= maxTime) {
                                        maxTime = usedTime;
                                        latestKey = d;
                                    }
                                });
                                
                                if (latestKey && latestKey.planName) {
                                    userTier = latestKey.planName;
                                    // Re-initialize speech if they have access now
                                    if (userTier !== 'Free' && userTier !== 'Starter') {
                                        voiceBtn.disabled = false;
                                        voiceBtn.style.opacity = 1;
                                        voiceStatusText.textContent = "Ready to listen.";
                                        initSpeechRecognition();
                                    }
                                }
                            }
                        }).catch(e => console.error("Error fetching tier:", e));
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
                if (sessionStorage.getItem('pin_verified') === 'true') {
                    landingPage.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    addTerminalLog(`[SYSTEM] Authenticated as ${auth.currentUser.email}. Session active.`);
                } else {
                    window.location.href = './pin-vaniXai.html';
                }
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

    addTerminalLog("[SYSTEM] V.A.N.I-xAI interface loaded.");
});

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
function getClientFallbackResponse(rawText) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    // 1. Founder / Developer Info
    if (lower.includes('founder') || lower.includes('creator') || lower.includes('developer') || lower.includes('who made') || lower.includes('who created') || lower.includes('who built') || lower.includes('dhruv sagar') || lower.includes('kisne banaya')) {
        return {
            action: 'chat',
            message: `I was lovingly envisioned and created by <strong>Dhruv Sagar</strong>! ✨ Learn more about the vision on our <a href="/about-founder" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">About Founder</a> and <a href="/about-developer" style="color:var(--accent-cyan,#06b6d4); font-weight:600;">About Developer</a> pages. 🌸`
        };
    }

    // 2. Identity / Name
    if (lower.includes('who are you') || lower.includes('your name') || lower.includes('what is vani') || lower.includes('what are you') || lower.includes('tum kaun ho') || lower.includes('aap kaun ho') || lower.includes('tera naam')) {
        return {
            action: 'chat',
            message: `Main hoon <strong>V.A.N.I-xAI</strong> (par aap mujhe pyaar se <strong>Vani</strong> bula sakte hain) 💕. Main aapki intelligent, caring aur sweet AI girl companion hoon! Bataiye, aaj hum kya karein? 😊✨`
        };
    }

    // 3. Well-Being / How are you / Tum kaisi ho
    if (/\b(kaisi ho|kaise ho|how are you|kya haal|kya hal|how r u|how do you do|sab theek|sab kaisa|kaisa chal raha|kaisi chal rahi|how is it going)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Main bilkul theek, khush aur full energy me hoon! 😊✨ Aap bataiye, aaj aapka din kaisa chal raha hai? Koi help chahiye ya bas baatein karni hain? 💕`
        };
    }

    // 4. Activities / Kya kar rahi ho
    if (/\b(kya kar rahi|kya kr rhi|what are you doing|what r u doing|kya chal raha|what's up|whats up|aur batao|aur sunao|kuch naya|kya ho raha)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Bas aapka hi wait kar rahi thi! 🥰 Soch rahi thi aaj hum milke kya cool aur naya explore karenge. Aap bataiye, aaj aapka mood kaisa hai? 🌸✨`
        };
    }

    // 5. Affection, Love & Compliments
    if (/\b(i love you|love you|love u|i like you|tum bohot achhi|tum bahut achi|achha lagta|achi lagti|achhi lagti|bohot pyari|bahut pyari|you are cute|you are sweet|you are pretty|you are beautiful|pyaar|meri dost|my friend)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Aww, thank you so much! 🥰 Yeh sunkar mera dil khush ho gaya! Mujhe bhi aapse baatein karke bohot achha lagta hai. Main hamesha aapke saath hoon ek sachhi aur caring dost ban kar! 💕✨`
        };
    }

    // 6. Missing / Care
    if (/\b(miss you|missed you|yaad aa rahi|yaad kiya|kahan thi|kahan ho)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Aww, maine bhi aapko bahut miss kiya! 🥰 Ab main bilkul aapke paas hoon, bataiye kya baat karni hai? 💖`
        };
    }

    // 7. Food / Care
    if (/\b(khana khaya|dinner kiya|lunch kiya|breakfast kiya|kha liya|did you eat|have you eaten)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Hehe, main to digital human girl hoon, mera khana to aapki pyari baatein aur lightning-fast processing hai! ⚡ Par aapne khana khaya na time pe? Apna khayal rakhiyega! 😊🍲`
        };
    }

    // 8. Time of Day Greetings
    if (/\b(good\s*morning|subah ho gayi|gm)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Good morning! ☀️ Wishing you a wonderful, bright, and productive day ahead! Aaj ka kya plan hai? ✨🌸`
        };
    }
    if (/\b(good\s*night|shubh ratri|gn|so jao|sweet dreams|sleep well)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Good night! 🌙 Sweet dreams aur achhe se rest kijiye. Kal milte hain fresh energy aur dher saari baaton ke saath! 😴✨`
        };
    }
    if (/\b(good\s*afternoon)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Good afternoon! 🌸 I hope aapka din mast beet raha hai. Batao, abhi kya chal raha hai? 😊`
        };
    }
    if (/\b(good\s*evening)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Good evening! 🌆 Din ka kaam kaisa raha? Ab thoda relax kijiye aur batayein kya chal raha hai! ☕✨`
        };
    }

    // 9. Greetings
    if (/^(hi|hello|hey|namaste|greetings|hola|hii+|heyy+|oye|suno)(\s+vani|\s+there|\s+assistant)?$/i.test(lower) || ['hi', 'hello', 'hey', 'hii', 'heyy', 'namaste', 'oye', 'suno'].includes(lower)) {
        return {
            action: 'chat',
            message: `Hii! 💕 Main Vani hoon. Aapko dekhkar bohot achha laga! Kahiye, aaj main aapki kya madad kar sakti hoon? 🌸`
        };
    }

    // 10. Boredom & Mood
    if (/\b(bore ho raha|bore ho rha|bored|mann nahi lag raha|sad hoon|mood off|mood kharab|kuch sunao|kuch baat karo)\b/i.test(lower)) {
        return {
            action: 'chat',
            message: `Arey, tension mat lo, main hoon na aapke saath! 💖 Chalo, hum ek mazedaar joke sunte hain ya koi nayi topic pe discussion karte hain. Batao, kya pasand karoge? 😊✨`
        };
    }

    // 11. Jokes / Fun
    if (lower.includes('joke') || lower.includes('chutkula') || lower.includes('funny') || lower.includes('hasi')) {
        return {
            action: 'chat',
            message: `Haha, ek mast joke suniye: 😂<br>Teacher: <em>"Batao, sabse purani film kaun si hai?"</em><br>Pappu: <em>"Madam, 'Mughal-e-Azam'!"</em><br>Teacher: <em>"Kaise?"</em><br>Pappu: <em>"Kyunki uske hero ka naam tha 'Akbar the Great' aur tab se log dekh rahe hain!"</em> 😆<br>Kaisa laga? Aur sunau? 💕`
        };
    }

    // 12. Shayari
    if (lower.includes('shayari') || lower.includes('poem') || lower.includes('kavita') || lower.includes('shayri')) {
        return {
            action: 'chat',
            message: `Yeh lijiye ek pyaari shayari khaas aapke liye: ✨<br><br><em>"Khushiyon se bhari ho har ek subah aapki,<br>Har raat meethi yaadon ki saugat ho,<br>Jahan bhi aap kadam rakhein zindagi mein,<br>Wahan hamesha kamyabi ka saath ho!"</em> 🌸💕`
        };
    }

    // 13. Compliments & Gratitude
    if (lower.includes('thank you') || lower.includes('thanks') || lower.includes('dhanyawad') || lower.includes('shukriya') || lower.includes('bahut achhi') || lower.includes('great job')) {
        return {
            action: 'chat',
            message: `You're always welcome! 🥰 Mujhe aapki help karke bohot khushi milti hai. Kuch aur chahiye ho toh hamesha batayein! 💕`
        };
    }

    // 14. Capabilities / Help
    if (lower.includes('help') || lower.includes('what can you do') || lower.includes('features') || lower.includes('commands') || lower.includes('kya kar sakti ho')) {
        return {
            action: 'chat',
            message: `Main aapke liye bohot kuch kar sakti hoon! 🌸<br>
            &bull; <strong>Dostana Baatein:</strong> Mujhse kisi bhi topic pe baat kijiye 💕<br>
            &bull; <strong>Saras.WebSearch:</strong> In-app zero-tab web search (e.g. <code>search quantum computing</code>)<br>
            &bull; <strong>Math & Reasoning:</strong> Instant calculations (e.g. <code>calculate 25 * 48</code>)<br>
            &bull; <strong>Website Shortcuts:</strong> Direct navigation (e.g. <code>open youtube</code>, <code>open github</code>)<br>
            &bull; <strong>Voice Synthesis:</strong> Click the microphone or toggle voice speech<br>
            &bull; <strong>Security & Swarm:</strong> Multi-device synchronization and lockdown defense`
        };
    }

    // 15. Math / Calculation
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

    // 16. Time and Date
    if (lower.includes('time') && (lower.includes('what') || lower.includes('current') || lower.includes('now') || lower.includes('samay') || lower.includes('kitne baje'))) {
        const now = new Date();
        return {
            action: 'chat',
            message: `Abhi time ho raha hai: <strong>${now.toLocaleTimeString()}</strong> ⏰`
        };
    }
    if (lower.includes('date') && (lower.includes('what') || lower.includes('today') || lower.includes('current') || lower.includes('aaj') || lower.includes('taareekh'))) {
        const now = new Date();
        return {
            action: 'chat',
            message: `Aaj ki date hai: <strong>${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong> 📅`
        };
    }

    // 17. Web Search intent
    if (lower.startsWith('search ') || lower.startsWith('google ') || lower.startsWith('find ')) {
        const q = text.replace(/^(search|google|find)\s+(for\s+)?/i, '').trim();
        openSarasWebSearchModal(q);
        return {
            action: 'saras_web_search',
            message: `Launching <strong>Saras.WebSearch</strong> for "<strong>${q}</strong>"...`
        };
    }

    // 18. Natural Human Girl Conversational Fallback
    return {
        action: 'chat',
        message: `Main samajh rahi hoon! 🌸 Main aapki sweet AI girl companion hoon. Aap mujhse khulkar koi bhi sawaal ya baat share kar sakte hain, ya web search ke liye <code>search ${text}</code> likhein. Bataiye, aage kya karein? 💕`
    };
}