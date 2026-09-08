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
 * Send email using configured EmailJS credentials
 * @param {Object} params - Template parameters (user_email, to_name, message, activation_key, etc.)
 * @returns {Promise<Object>}
 */
async function sendVaniEmail(params) {
    if (typeof emailjs === 'undefined') {
        throw new Error("EmailJS SDK is not loaded.");
    }
    
    // Ensure initialized
    try {
        emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    } catch (e) {
        console.warn("emailjs.init error:", e);
    }

    const recipient = (params.email || params.to_email || params.user_email || params.recipient || params.recipient_email || '').trim();
    if (!recipient) {
        throw new Error("Recipient email address is missing.");
    }

    const userName = params.to_name || params.userName || params.user_name || params.name || (recipient.split('@')[0]) || 'Valued User';
    const activationKey = params.activation_key || params.activationKey || params.key || params.passcode || '';

    // Build comprehensive parameters to match any template placeholders in EmailJS dashboard
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

    console.log("[EmailJS] Dispatching email to:", recipient, "with key:", activationKey);
    return await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, payload, EMAILJS_CONFIG.PUBLIC_KEY);
}

if (typeof window !== 'undefined') {
    window.sendVaniEmail = sendVaniEmail;
}

