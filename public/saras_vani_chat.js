let currentUser = null;
let currentChatId = null;
let messagesUnsubscribe = null;
let contactsUnsubscribe = null;

// Elements
const myNameEl = document.getElementById('my-name');
const myAvatarInitials = document.getElementById('my-avatar-initials');
const contactListEl = document.getElementById('contact-list');
const emptyChatState = document.getElementById('empty-chat-state');
const activeChatContainer = document.getElementById('active-chat-container');
const chatPartnerNameEl = document.getElementById('chat-partner-name');
const chatPartnerAvatarsEl = document.getElementById('chat-partner-avatars');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const searchInput = document.getElementById('contact-search');

// 1. Auth State
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        const nameBase = (user.displayName || user.email.split('@')[0]);
        myNameEl.textContent = nameBase;
        myAvatarInitials.textContent = nameBase.charAt(0).toUpperCase();
        
        // Update user status
        updateUserPresence(true);
        window.addEventListener('beforeunload', () => updateUserPresence(false));
        
        loadContacts();
    } else {
        window.location.href = '/index.html';
    }
});

async function updateUserPresence(isOnline) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set({
            isOnline: isOnline,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error("Error updating presence:", e);
    }
}

// 2. Load Contacts
function loadContacts() {
    if (!currentUser) return;
    
    contactsUnsubscribe = db.collection('users').doc(currentUser.uid).collection('contacts')
        .orderBy('updatedAt', 'desc')
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                contactListEl.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--text-sidebar-muted); font-size: 0.9rem;">
                        No paired contacts yet.<br><br>
                        Click the pair icon below to find someone.
                    </div>
                `;
                return;
            }
            
            contactListEl.innerHTML = ''; // Clear current
            
            snapshot.forEach(doc => {
                const contact = doc.data();
                const contactId = doc.id;
                renderContactItem(contactId, contact);
            });
            
            // Add search filtering
            filterContacts();
        });
}

function renderContactItem(contactId, contact) {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.dataset.email = contact.email; // For search
    if (currentChatId === contact.chatId) {
        item.classList.add('active');
    }
    
    const initials = (contact.name || contact.email.split('@')[0]).substring(0, 2).toUpperCase();
    const isOnline = false; // We could listen to their user doc for real status, keeping simple for now.
    
    // Format time
    let timeStr = '';
    if (contact.updatedAt) {
        const date = contact.updatedAt.toDate();
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } else {
            timeStr = date.toLocaleDateString([], {month: 'short', day: 'numeric'});
        }
    }
    
    item.innerHTML = `
        <div class="contact-avatar">
            ${initials}
            <div class="contact-status-dot ${isOnline ? 'online' : ''}"></div>
        </div>
        <div class="contact-info">
            <div class="contact-name-row">
                <div class="contact-name">${contact.name || contact.email.split('@')[0]}</div>
                <div class="contact-time">${timeStr}</div>
            </div>
            <div class="contact-last-msg">${contact.lastMessage || 'Connected'}</div>
        </div>
    `;
    
    item.addEventListener('click', () => {
        // Remove active class from all
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        
        openChat(contact.chatId, contact.name || contact.email.split('@')[0], initials);
    });
    
    contactListEl.appendChild(item);
}

// 3. Search Contacts
searchInput.addEventListener('input', filterContacts);

function filterContacts() {
    const term = searchInput.value.toLowerCase();
    const items = contactListEl.querySelectorAll('.contact-item');
    
    items.forEach(item => {
        const email = item.dataset.email.toLowerCase();
        if (email.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// 4. Open Chat
function openChat(chatId, partnerName, partnerInitials) {
    currentChatId = chatId;
    
    emptyChatState.style.display = 'none';
    activeChatContainer.style.display = 'flex';
    
    chatPartnerNameEl.textContent = partnerName;
    chatPartnerAvatarsEl.innerHTML = `
        <div class="avatar" style="background-color: var(--msg-sent); color: white;">
            ${partnerInitials}
        </div>
    `;
    
    loadMessages(chatId, partnerInitials);
}

// 5. Load Messages
function loadMessages(chatId, partnerInitials) {
    if (messagesUnsubscribe) {
        messagesUnsubscribe(); // Unsubscribe previous chat
    }
    
    messagesContainer.innerHTML = '';
    
    messagesUnsubscribe = db.collection('chats').doc(chatId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    renderMessage(msg, partnerInitials);
                }
            });
            scrollToBottom();
        });
}

function renderMessage(msg, partnerInitials) {
    const isSentByMe = msg.senderId === currentUser.uid;
    const row = document.createElement('div');
    row.className = `message-row ${isSentByMe ? 'sent' : 'received'}`;
    
    let timeStr = '';
    if (msg.timestamp) {
        timeStr = msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    
    const avatarHtml = isSentByMe ? '' : `
        <div class="message-avatar">${partnerInitials}</div>
    `;
    
    row.innerHTML = `
        <div class="message-content">
            ${avatarHtml}
            <div>
                <div class="message-bubble">${escapeHtml(msg.text)}</div>
                <div class="message-meta">
                    ${timeStr} ${isSentByMe ? '<i class="fa-solid fa-check-double message-status"></i>' : ''}
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(row);
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 6. Send Message
async function sendMessage() {
    if (!currentChatId || !currentUser) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    messageInput.value = ''; // clear immediately for UX
    messageInput.focus();
    
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    
    try {
        // 1. Add to messages subcollection
        await db.collection('chats').doc(currentChatId).collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            senderEmail: currentUser.email,
            timestamp: timestamp
        });
        
        // 2. Update chat metadata (optional, for sorting chat list globally if needed)
        await db.collection('chats').doc(currentChatId).update({
            lastMessage: text,
            updatedAt: timestamp
        });
        
        // 3. We also need to update the 'contacts' for BOTH users so their sidebar updates.
        // To do this securely from client side without knowing the other user's UID perfectly, 
        // we can fetch the chat document to get participants, then update their contact docs.
        const chatDoc = await db.collection('chats').doc(currentChatId).get();
        if (chatDoc.exists) {
            const participants = chatDoc.data().participants || [];
            
            // Note: In a production app, this dual-write is better suited for a Cloud Function
            // to ensure security (users can't write to other users' contact lists).
            // But for this local demo architecture, we'll write it if rules allow.
            // A simpler approach: we just update OUR contact doc, and rely on the other user 
            // refreshing/re-opening chat, OR we ensure rules allow this specific update.
            // Let's try updating our own contact list first.
            
            await db.collection('users').doc(currentUser.uid)
                .collection('contacts').doc(currentChatId).set({
                    lastMessage: text,
                    updatedAt: timestamp
                }, {merge: true});
                
            // Let's attempt to update the other participant's contact doc as well
            const otherUid = participants.find(uid => uid !== currentUser.uid);
            if (otherUid) {
                 await db.collection('users').doc(otherUid)
                    .collection('contacts').doc(currentChatId).set({
                        lastMessage: text,
                        updatedAt: timestamp
                    }, {merge: true}).catch(err => {
                        console.log("Could not update other user's contact list directly (expected if rules restrict).");
                    });
            }
        }
        
    } catch (err) {
        console.error("Error sending message:", err);
        alert("Failed to send message.");
    }
}

sendMsgBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Helper
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
