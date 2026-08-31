/**
 * V.A.N.I-xAI Firebase Cloud Messaging (FCM) Web Push Notifications Client Helper
 * Handles permission requests, service worker registration, token syncing to Firestore,
 * foreground notification toasts, and background message reception.
 */

window.VaniFCM = (function () {
    let messaging = null;
    let currentUser = null;
    let registeredToken = null;
    const DEFAULT_VAPID_KEY = 'BLSjYGs7GQVe37BgSaJUlAl39LgcMoZtO2zaavKgKfttnqJfIrnJQ9v-cZNB1kdvLE5wBUUNwiRbm5Uju2ollhQ';

    /**
     * Check browser support for FCM Web Push
     */
    function isSupported() {
        return 'serviceWorker' in navigator && 'Notification' in window && 'fetch' in window;
    }

    /**
     * Get current Notification Permission state
     * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
     */
    function getPermissionState() {
        if (!isSupported()) return 'unsupported';
        return Notification.permission;
    }

    /**
     * Initialize FCM Service Worker and Messaging Client
     * @param {Object} user - Authenticated Firebase User object
     * @param {Object} options - Optional config { vapidKey: string, autoPrompt: boolean }
     */
    async function init(user, options = {}) {
        if (!isSupported()) {
            console.warn('[VaniFCM] Push notifications are not supported in this browser.');
            updateUIStatus('unsupported');
            return false;
        }

        currentUser = user;

        try {
            // Register FCM Service Worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                scope: '/'
            });
            console.log('[VaniFCM] Service worker registered with scope:', registration.scope);

            // Initialize FCM Messaging
            if (typeof firebase !== 'undefined' && firebase.messaging) {
                messaging = firebase.messaging();
                messaging.useServiceWorker(registration);

                // Setup Foreground Notification Handler
                messaging.onMessage((payload) => {
                    console.log('[VaniFCM] Foreground notification received:', payload);
                    showForegroundToast(payload);
                });

                // If permission is already granted, fetch token and update Firestore
                if (Notification.permission === 'granted') {
                    await syncToken(options.vapidKey);
                } else if (options.autoPrompt && Notification.permission === 'default') {
                    showPromptBanner(options.vapidKey);
                }

                updateUIStatus(Notification.permission);
                return true;
            } else {
                console.error('[VaniFCM] Firebase Messaging SDK not loaded.');
                return false;
            }
        } catch (err) {
            console.error('[VaniFCM] Initialization error:', err);
            return false;
        }
    }

    /**
     * Request User Permission for Push Notifications and get Device Token
     * @param {string} [vapidKey] - Optional Web Push Certificate Public VAPID Key
     */
    async function requestPermission(vapidKey) {
        if (!isSupported()) {
            alert('Push Notifications are not supported in your current browser.');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            updateUIStatus(permission);

            if (permission === 'granted') {
                console.log('[VaniFCM] Notification permission granted by user.');
                const token = await syncToken(vapidKey);
                hidePromptBanner();
                showToastNotification('Push Notifications Enabled!', 'You will now receive system updates even when V.A.N.I-xAI is closed.', 'success');
                return token;
            } else if (permission === 'denied') {
                console.warn('[VaniFCM] Notification permission denied by user.');
                showToastNotification('Notifications Blocked', 'You have blocked notification permissions in browser settings.', 'warning');
                return false;
            }
        } catch (err) {
            console.error('[VaniFCM] Permission request failed:', err);
            return false;
        }
    }

    /**
     * Fetch FCM Device Token & Sync to Firestore User Document
     * @param {string} [vapidKey]
     */
    async function syncToken(vapidKey) {
        if (!messaging) return null;

        try {
            const keyToUse = vapidKey || DEFAULT_VAPID_KEY;
            const tokenOptions = keyToUse ? { vapidKey: keyToUse } : {};
            const token = await messaging.getToken(tokenOptions);

            if (token) {
                console.log('[VaniFCM] Device Token obtained:', token.substring(0, 15) + '...');
                registeredToken = token;

                // Sync to Firestore if user logged in
                if (currentUser && typeof firebase !== 'undefined' && firebase.firestore) {
                    const db = firebase.firestore();
                    await db.collection('users').doc(currentUser.uid).set({
                        fcmToken: token,
                        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
                        fcmEnabled: true,
                        lastFcmUpdate: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    console.log('[VaniFCM] Device Token saved to Firestore.');
                }
                return token;
            } else {
                console.warn('[VaniFCM] No Registration token available. Request permission to generate one.');
                return null;
            }
        } catch (err) {
            console.error('[VaniFCM] Error retrieving token:', err);
            return null;
        }
    }

    /**
     * Show foreground floating toast notification banner when user is on the app
     */
    function showForegroundToast(payload) {
        const title = payload.notification?.title || payload.data?.title || 'V.A.N.I-xAI Notification';
        const body = payload.notification?.body || payload.data?.body || 'New system event detected.';
        showToastNotification(title, body, 'info');
    }

    /**
     * UI Helper: Render customized toast banner
     */
    function showToastNotification(title, body, type = 'info') {
        let toastContainer = document.getElementById('vani-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'vani-toast-container';
            toastContainer.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                display: flex; flex-direction: column; gap: 10px; pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = 'vani-fcm-toast';
        toast.style.cssText = `
            pointer-events: auto; min-width: 300px; max-width: 400px;
            background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(99, 102, 241, 0.4);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(99, 102, 241, 0.3);
            border-radius: 12px; padding: 14px 18px; color: #f8fafc;
            font-family: 'Outfit', 'Inter', sans-serif; backdrop-filter: blur(10px);
            display: flex; align-items: center; gap: 14px; transform: translateY(-20px); opacity: 0;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        const iconUrl = '/vani_icon.png';
        toast.innerHTML = `
            <img src="${iconUrl}" style="width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;" alt="V.A.N.I-xAI">
            <div style="flex-grow: 1; overflow: hidden;">
                <div style="font-weight: 700; font-size: 0.95rem; color: #a5b4fc; margin-bottom: 2px;">${escapeHtml(title)}</div>
                <div style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.3;">${escapeHtml(body)}</div>
            </div>
            <button style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; padding: 0 4px;" onclick="this.parentElement.remove()">✕</button>
        `;

        toastContainer.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        // Auto Remove after 6 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                setTimeout(() => toast.remove(), 400);
            }
        }, 6000);
    }

    /**
     * UI Helper: Render prompt banner for enabling background push
     */
    function showPromptBanner(vapidKey) {
        if (document.getElementById('vani-fcm-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'vani-fcm-banner';
        banner.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            z-index: 9999; width: 90%; max-width: 520px;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 27, 75, 0.95));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 14px;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.25);
            padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px;
            color: #ffffff; font-family: 'Outfit', sans-serif; backdrop-filter: blur(12px);
            animation: fcmSlideUp 0.5s ease-out;
        `;

        banner.innerHTML = `
            <style>
                @keyframes fcmSlideUp { from { transform: translate(-50%, 100px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
            </style>
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="/vani_icon.png" style="width: 38px; height: 38px; border-radius: 50%;" alt="Icon">
                <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #a5b4fc;">Stay Connected</div>
                    <div style="font-size: 0.82rem; color: #94a3b8;">Enable background notifications to receive alerts when off V.A.N.I-xAI.</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                <button id="vani-fcm-btn-enable" style="
                    background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none;
                    padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); transition: 0.2s;
                ">Enable</button>
                <button onclick="document.getElementById('vani-fcm-banner').remove()" style="
                    background: rgba(255,255,255,0.1); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2);
                    padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; cursor: pointer;
                ">Later</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('vani-fcm-btn-enable').addEventListener('click', () => {
            requestPermission(vapidKey);
        });
    }

    function hidePromptBanner() {
        const banner = document.getElementById('vani-fcm-banner');
        if (banner) banner.remove();
    }

    function updateUIStatus(status) {
        const badge = document.getElementById('fcm-status-badge');
        if (badge) {
            if (status === 'granted') {
                badge.className = 'status-badge active';
                badge.textContent = 'Active (Background Push Enabled)';
                badge.style.color = '#34d399';
            } else if (status === 'denied') {
                badge.className = 'status-badge blocked';
                badge.textContent = 'Blocked by Browser';
                badge.style.color = '#f87171';
            } else {
                badge.className = 'status-badge default';
                badge.textContent = 'Not Enabled';
                badge.style.color = '#fbbf24';
            }
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return {
        isSupported: isSupported,
        getPermissionState: getPermissionState,
        init: init,
        requestPermission: requestPermission,
        syncToken: syncToken,
        showToast: showToastNotification
    };
})();
