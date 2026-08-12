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
            
            // Strip markdown/html from content for speaking
            const cleanText = content.replace(/<[^>]+>/g, '').replace(/[*_~`]/g, '');
            const msg = new SpeechSynthesisUtterance(cleanText);
            
            const rate = parseFloat(localStorage.getItem('vani_speech_rate') || '1.0');
            msg.rate = rate;
            
            // Try to pick a good voice
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Microsoft') && v.lang.startsWith('en'));
            if (preferredVoice) msg.voice = preferredVoice;

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

    // Client-Side Intercept for URLs (Mobile & Desktop)
    let lowerCmd = commandText.toLowerCase().trim();
    if (lowerCmd.startsWith("open ") || lowerCmd.startsWith("go to ") || lowerCmd.includes("whatsapp")) {
        // Check Advanced Tier requirement for OS/App control
        if (userTier === 'Free' || userTier === 'Starter' || userTier === 'Pro') {
            addChatMessage('assistant', 'Local App, OS control, and WhatsApp Automation require the Advanced Tier or higher. Please upgrade to unlock this feature.', 'error');
            return;
        }

        let parts = lowerCmd.replace("go to ", "").replace("open ", "").trim().split(" ");
        let potentialUrl = parts[parts.length - 1];
        
        // Prevent intercepting known desktop apps so they go to the Python backend
        const desktopApps = ['notepad', 'calculator', 'cmd', 'terminal', 'explorer', 'settings', 'chrome', 'edge', 'spotify', 'code', 'vscode'];
        
        if (potentialUrl.includes(".") && potentialUrl.length > 3 && !potentialUrl.endsWith(".")) {
            // Keep as is, it's a domain
        } else if (parts.length === 1 && !desktopApps.includes(potentialUrl)) {
            potentialUrl = `https://www.${potentialUrl}.com`;
        } else {
            potentialUrl = ""; // It's an app, let backend handle it
        }

        if (potentialUrl) {
            if (!potentialUrl.startsWith("http")) {
                potentialUrl = "https://" + potentialUrl;
            }
            addChatMessage('bot', `Opening ${potentialUrl} in your browser...`);
            window.open(potentialUrl, '_blank');
            return; // Do not send to backend
        }
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/command`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Bypass-Tunnel-Reminder': 'true' 
            },
            body: JSON.stringify({ 
                command: commandText,
                personality: localStorage.getItem('vani_personality') || 'helpful'
            })
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            if (data.action === 'make_phone_call') {
                let target = (data.parsed.contact_name_or_number || data.parsed.phone_number || '').trim();
                let contacts = JSON.parse(localStorage.getItem('vani_contacts') || '{"dhruv sagar": "+919555778474"}');
                let targetLower = target.toLowerCase();
                let phoneNumber = target;
                
                if (contacts[targetLower]) {
                    phoneNumber = contacts[targetLower];
                }
                
                let cleanNumber = phoneNumber.replace(/[^\d\+]/g, '');
                
                if (cleanNumber) {
                    addChatMessage('assistant', `Initiating cellular phone call to ${target}...`, 'make_phone_call');
                    window.location.href = `tel:${cleanNumber}`;
                } else {
                    addChatMessage('assistant', `Could not find contact '${target}' in your web contact book.`, 'error');
                }
                return;
            }
            
            addChatMessage('assistant', data.message, data.action, data.image_url);
        } else {
            addChatMessage('assistant', `Failed: ${data.message || 'Error occurred.'}`, data.action || 'unknown');
        }
    } catch (err) {
        console.error("Command send error:", err);
        addChatMessage('assistant', "Network error connecting to Flask backend. Make sure the server is running.");
        addTerminalLog(`[SERVER ERROR] Failed to connect: ${err}`, 'error');
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
    const savedKey = localStorage.getItem('antigravity_openrouter_key');
    if (savedKey) {
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
