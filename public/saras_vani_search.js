let currentUser = null;
let publicIp = null;
let currentOtp = null;
let searchUnsubscribe = null;
let hostUnsubscribe = null;
let matchedUsers = new Map(); // Store matched users

// Elements
const blipsContainer = document.getElementById('blips-container');
const statusText = document.getElementById('status-text');
const hostModal = document.getElementById('host-modal');
const joinModal = document.getElementById('join-modal');
const otpDisplay = document.getElementById('otp-display');
const otpInput = document.getElementById('otp-input');
const hostStatus = document.getElementById('host-status');

// 1. Fetch Public IP
async function fetchIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        publicIp = data.ip;
        statusText.textContent = `Scanning local airspace (IP: ${publicIp})...`;
        startRadar();
    } catch (err) {
        statusText.textContent = "Error: Could not determine network footprint.";
    }
}

// 2. Auth State
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        fetchIp();
    } else {
        window.location.href = '/index.html';
    }
});

// 3. Start Radar & Presence
function startRadar() {
    if (!currentUser || !publicIp) return;
    
    // Register self
    const myRef = db.collection('saras_search_pool').doc(currentUser.uid);
    myRef.set({
        ip: publicIp,
        email: currentUser.email,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        otp: null,
        pairedWith: null
    }, { merge: true });

    // Keep-alive heartbeat
    setInterval(() => {
        myRef.update({
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });
    }, 10000);

    // Clean up on exit
    window.addEventListener('beforeunload', () => {
        myRef.delete();
    });

    // Listen for others on the same IP
    searchUnsubscribe = db.collection('saras_search_pool')
        .where('ip', '==', publicIp)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                const docId = change.doc.id;
                if (docId === currentUser.uid) {
                    // This is us, check if someone paired with us!
                    const data = change.doc.data();
                    if (data.pairedWith && hostModal.classList.contains('active')) {
                        handleSuccessfulPairing(data.pairedWith);
                        // Reset
                        myRef.update({ pairedWith: null, otp: null });
                    }
                    return;
                }

                if (change.type === 'added' || change.type === 'modified') {
                    // Make sure they are recently active (within last 30s)
                    const data = change.doc.data();
                    const lastSeen = data.lastSeen ? data.lastSeen.toDate() : new Date();
                    const now = new Date();
                    
                    if (now - lastSeen < 30000) {
                        addBlip(docId, data.email);
                    } else {
                        removeBlip(docId);
                    }
                }
                
                if (change.type === 'removed') {
                    removeBlip(docId);
                }
            });
        });
}

// 4. UI Blips
function addBlip(id, email) {
    if (matchedUsers.has(id)) return; // Already rendered
    
    matchedUsers.set(id, email);
    
    // Random position within the circle
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 40 + 10; // 10% to 50% radius
    
    const x = 50 + Math.cos(angle) * distance;
    const y = 50 + Math.sin(angle) * distance;
    
    const blip = document.createElement('div');
    blip.className = 'blip';
    blip.id = `blip-${id}`;
    blip.style.left = `${x}%`;
    blip.style.top = `${y}%`;
    
    const label = document.createElement('div');
    label.className = 'blip-label';
    label.textContent = email.split('@')[0];
    blip.appendChild(label);
    
    // Click to pair
    blip.addEventListener('click', () => {
        generateHostOtp(id);
    });
    
    blipsContainer.appendChild(blip);
}

function removeBlip(id) {
    matchedUsers.delete(id);
    const blip = document.getElementById(`blip-${id}`);
    if (blip) {
        blip.remove();
    }
}

// 5. Host OTP Generation
async function generateHostOtp(targetId) {
    currentOtp = Math.floor(1000 + Math.random() * 9000).toString();
    otpDisplay.textContent = currentOtp;
    hostStatus.textContent = "Waiting for other device to enter OTP...";
    hostModal.classList.add('active');
    
    await db.collection('saras_search_pool').doc(currentUser.uid).update({
        otp: currentOtp,
        pairedWith: null
    });
}

// 6. Client Join via OTP
function openJoinModal() {
    joinModal.classList.add('active');
    otpInput.value = '';
    otpInput.focus();
}

async function submitOtp() {
    const enteredOtp = otpInput.value.trim();
    if (enteredOtp.length !== 4) {
        alert("Please enter a valid 4-digit OTP.");
        return;
    }
    
    const btn = document.getElementById('btn-submit-otp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    try {
        // Find the host in the pool with this OTP
        const snapshot = await db.collection('saras_search_pool')
            .where('ip', '==', publicIp)
            .where('otp', '==', enteredOtp)
            .get();
            
        if (snapshot.empty) {
            alert("Invalid OTP or host disconnected.");
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
            return;
        }
        
        // We found a host!
        const hostDoc = snapshot.docs[0];
        const hostUid = hostDoc.id;
        const hostEmail = hostDoc.data().email;
        
        // Tell the host we paired
        await hostDoc.ref.update({
            pairedWith: currentUser.email,
            pairedWithUid: currentUser.uid
        });
        
        // 1. Create a Chat Document
        const newChatRef = db.collection('chats').doc();
        const chatId = newChatRef.id;
        
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        await newChatRef.set({
            participants: [currentUser.uid, hostUid],
            createdAt: timestamp,
            updatedAt: timestamp,
            lastMessage: 'Chat started'
        });
        
        // 2. Add Host to Client's contacts
        await db.collection('users').doc(currentUser.uid).collection('contacts').doc(chatId).set({
            chatId: chatId,
            email: hostEmail,
            name: hostEmail.split('@')[0],
            updatedAt: timestamp,
            lastMessage: 'Chat started'
        });
        
        // 3. Add Client to Host's contacts
        await db.collection('users').doc(hostUid).collection('contacts').doc(chatId).set({
            chatId: chatId,
            email: currentUser.email,
            name: currentUser.email.split('@')[0],
            updatedAt: timestamp,
            lastMessage: 'Chat started'
        }).catch(e => console.log("Host contact update might fail due to strict rules, but often works in test projects"));
        
        joinModal.classList.remove('active');
        statusText.textContent = "Chat Link Established!";
        statusText.style.color = "#4ade80";
        statusText.style.textShadow = "0 0 15px #4ade80";
        
        setTimeout(() => {
            window.location.href = '/saras_vani_chat.html';
        }, 2000);
        
    } catch (err) {
        console.error("Error submitting OTP", err);
        alert("Failed to connect.");
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
    }
}

function closeModals() {
    hostModal.classList.remove('active');
    joinModal.classList.remove('active');
    if (currentUser) {
        db.collection('saras_search_pool').doc(currentUser.uid).update({
            otp: null,
            pairedWith: null
        });
    }
}

async function handleSuccessfulPairing(pairedEmail) {
    hostStatus.textContent = `Connected to ${pairedEmail}!`;
    hostStatus.style.color = "#4ade80";
    
    // The client pushed their state and created the chat, we just need to redirect.
    setTimeout(() => {
        closeModals();
        statusText.textContent = "Chat Link Established!";
        statusText.style.color = "#4ade80";
        statusText.style.textShadow = "0 0 15px #4ade80";
        setTimeout(() => {
            window.location.href = '/saras_vani_chat.html';
        }, 1500);
    }, 1500);
}
