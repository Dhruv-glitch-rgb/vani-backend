/**
 * EmailJS Configuration & Helper for VANI-xAI
 * Service ID: service_yggzy44
 * Template ID: template_36dqyp7
 * Public Key: Y32jq70kG6Ku5x4XP
 */

const EMAILJS_CONFIG = {
    SERVICE_ID: "service_yggzy44",
    TEMPLATE_ID: "template_36dqyp7",
    PUBLIC_KEY: "Y32jq70kG6Ku5x4XP"
};

// Expose globally
if (typeof window !== 'undefined') {
    window.EMAILJS_CONFIG = EMAILJS_CONFIG;

    // Auto-initialize EmailJS if SDK is loaded
    if (typeof emailjs !== 'undefined') {
        try {
            emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
        } catch (e) {
            console.warn("EmailJS auto-init warning:", e);
        }
    }
}

/**
 * Direct REST API fallback in case EmailJS SDK is blocked by adblocker / CDN
 */
async function sendViaDirectFetch(payload) {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            service_id: EMAILJS_CONFIG.SERVICE_ID,
            template_id: EMAILJS_CONFIG.TEMPLATE_ID,
            user_id: EMAILJS_CONFIG.PUBLIC_KEY,
            template_params: payload
        })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`EmailJS HTTP ${res.status}: ${errText || res.statusText}`);
    }
    return { status: res.status, text: 'OK' };
}

/**
 * Send email using configured EmailJS credentials with auto-retry and direct-fetch fallback
 * @param {Object} params - Template parameters (user_email, to_name, message, activation_key, etc.)
 * @returns {Promise<Object>}
 */
async function sendVaniEmail(params) {
    const rawEmail = params.email || params.to_email || params.user_email || params.recipient || params.recipient_email || '';
    const recipient = String(rawEmail).trim().toLowerCase();
    if (!recipient || !recipient.includes('@')) {
        throw new Error("Valid recipient email address is required.");
    }

    const userName = (params.to_name || params.userName || params.user_name || params.name || recipient.split('@')[0] || 'Valued User').trim();
    const activationKey = (params.activation_key || params.activationKey || params.key || params.passcode || '').trim();

    // Comprehensive payload mapping all template placeholders
    const payload = {
        to_name: userName,
        user_name: userName,
        name: userName,
        from_name: params.from_name || 'Bureau of V.A.N.I-xAI',
        to_email: recipient,
        user_email: recipient,
        email: recipient,
        recipient: recipient,
        recipient_email: recipient,
        reply_to: params.reply_to || 'official.vanixai.india@gmail.com',
        subject: params.subject || `Welcome to V.A.N.I-xAI! Activation Key: ${activationKey}`,
        message: params.message || '',
        welcome_message: params.welcome_message || params.message || '',
        activation_key: activationKey,
        key: activationKey,
        passcode: activationKey,
        otp: activationKey,
        vani_id: params.vani_id || params.vaniId || '',
        plan_name: params.plan_name || params.planName || 'Sovereign Clearance',
        expire_date: params.expire_date || params.expireDate || '',
        contact_number: params.contact_number || params.phone || '',
        support_email: 'official.vanixai.india@gmail.com',
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    };

    console.log("[EmailJS] Initiating robust email dispatch to:", recipient, "key:", activationKey);

    // Try sending with automatic retry and direct fetch fallback
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            // Attempt with SDK if available
            if (typeof emailjs !== 'undefined' && typeof emailjs.send === 'function') {
                try {
                    return await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, payload, EMAILJS_CONFIG.PUBLIC_KEY);
                } catch (sdkErr) {
                    console.warn(`[EmailJS] SDK send failed (attempt ${attempt}), falling back to direct fetch:`, sdkErr);
                    return await sendViaDirectFetch(payload);
                }
            } else {
                // Direct REST API fetch
                return await sendViaDirectFetch(payload);
            }
        } catch (err) {
            lastError = err;
            console.warn(`[EmailJS] Dispatch attempt ${attempt} encountered error:`, err);
            if (attempt < 3) {
                // Exponential backoff
                await new Promise(res => setTimeout(res, attempt * 1200));
            }
        }
    }

    throw lastError || new Error("Failed to deliver email after 3 attempts.");
}

if (typeof window !== 'undefined') {
    window.sendVaniEmail = sendVaniEmail;
}


