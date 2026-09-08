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
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);

    // Build comprehensive parameters to match any template placeholders
    const payload = {
        to_name: params.to_name || params.userName || params.name || 'VANI-xAI User',
        from_name: params.from_name || 'VANI-xAI Team',
        to_email: params.to_email || params.user_email || params.email || '',
        user_email: params.user_email || params.to_email || params.email || '',
        email: params.email || params.user_email || params.to_email || '',
        reply_to: params.reply_to || params.user_email || 'official.vanixai.india@gmail.com',
        subject: params.subject || 'Notification from VANI-xAI',
        message: params.message || '',
        vani_id: params.vani_id || params.vaniId || '',
        plan_name: params.plan_name || params.planName || '',
        expire_date: params.expire_date || params.expireDate || '',
        activation_key: params.activation_key || params.activationKey || '',
        key: params.key || params.activation_key || params.activationKey || '',
        contact_number: params.contact_number || params.phone || '',
        timestamp: new Date().toLocaleString()
    };

    return await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, payload);
}

if (typeof window !== 'undefined') {
    window.sendVaniEmail = sendVaniEmail;
}
