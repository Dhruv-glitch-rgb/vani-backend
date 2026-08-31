// Firebase Cloud Messaging Background Service Worker for V.A.N.I-xAi
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Firebase Configuration (Matching project vani-nzdrsr)
const firebaseConfig = {
    apiKey: "AIzaSyAAUsbCzU-CfBGDIm1xqLMDaq5uzjWorvE",
    authDomain: "vani-nzdrsr.firebaseapp.com",
    projectId: "vani-nzdrsr",
    storageBucket: "vani-nzdrsr.firebasestorage.app",
    messagingSenderId: "908306821780",
    appId: "1:908306821780:web:02e878153145968d113a81",
    measurementId: "G-RJB5892YTQ"
};

// Initialize Firebase App in Service Worker
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// Handle Background Push Notifications (Triggered when app tab is closed or in background)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background FCM Payload received:', payload);

    const title = payload.notification?.title || payload.data?.title || 'V.A.N.I-xAI Notification';
    const body = payload.notification?.body || payload.data?.body || 'You have a new message from V.A.N.I-xAI.';
    const icon = payload.notification?.icon || payload.data?.icon || '/vani_icon.png';
    const clickUrl = payload.data?.url || payload.data?.click_action || '/ai4consol.html';

    const notificationOptions = {
        body: body,
        icon: icon,
        badge: '/vani_icon.png',
        tag: 'vani-fcm-push-' + Date.now(),
        data: {
            url: clickUrl
        },
        requireInteraction: false
    };

    return self.registration.showNotification(title, notificationOptions);
});

// Handle Notification Click Event (Opens or focuses V.A.N.I-xAi app)
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event);
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/ai4consol.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window open with target URL
            for (let client of windowClients) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new window/tab
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
