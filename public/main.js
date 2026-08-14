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
        const OPENROUTER_KEY = "OPENROUTER_API_KEY_HERE"; // REPLACE WITH ACTUAL KEY
        
        const systemPrompt = `You are V.A.N.I-xAI, an advanced, highly intelligent AI assistant. 
You MUST respond with a valid JSON object in the following format:
{
  "action": "...",
  "message": "..."
}
The "message" should contain your response to the user.
The "action" MUST be one of the following exact strings:
- "chat" (for general conversation)
- "lockdown" (if the user asks to lock their terminal, initiate intruder trap, or secure their device)
- "swarm_sync" (if the user asks to sync their session, push to mobile, or activate swarm)
- "make_phone_call" (if the user asks to call someone)

CRITICAL IDENTITY RULES:
If the user asks who created you, who made you, or who your developer/founder is, you MUST state that you were created by your founder and developer, Dhruv Sagar. You must also include HTML links to his pages like this: "I was created by <a href='/about-founder.html'>Dhruv Sagar</a>, you can learn more on the <a href='/about-developer.html'>About Developer</a> page."

Do NOT output any markdown blocks like \`\`\`json. Just output the raw JSON string.`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://vani-nzdrsr.web.app',
                'X-Title': 'VANI-xAI'
            },
            body: JSON.stringify({ 
                model: "openrouter/auto",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: commandText }
                ]
            })
        });

        const apiData = await response.json();
        
        if (response.ok && apiData.choices && apiData.choices.length > 0) {
            let content = apiData.choices[0].message.content.trim();
            // Clean markdown block if the model ignores the prompt
            if (content.startsWith("```json")) {
                content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (content.startsWith("```")) {
                content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            let data;
            try {
                data = JSON.parse(content);
            } catch (parseErr) {
                console.warn("Failed to parse JSON, falling back to raw text:", parseErr);
                data = { action: 'chat', message: content };
            }
            
            if (data.action === 'make_phone_call') {
                addChatMessage('assistant', `Initiating cellular phone call...`, 'make_phone_call');
                // Basic fallback for serverless
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

            addChatMessage('assistant', data.message, data.action || 'chat');
        } else {
            console.error("OpenRouter Error:", apiData);
            let errMsg = "Unknown Error";
            if (apiData && apiData.error) {
                errMsg = typeof apiData.error === 'string' ? apiData.error : (apiData.error.message || errMsg);
            }
            addChatMessage('assistant', `API Error (v2): ${errMsg}`, 'error');
        }
    } catch (err) {
        console.error("Command send error:", err);
        addChatMessage('assistant', `Execution error: ${err.message}`);
        addTerminalLog(`[API ERROR] Failed to parse/connect: ${err}`, 'error');
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
