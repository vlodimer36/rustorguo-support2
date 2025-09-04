const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '8078550568:AAEtW8cTX3Rw_x1rUIJTg9Q46pntJVfOhuw';
const SERVER_URL = 'https://rustorguo-support.onrender.com'; // Замени на свой URL

async function setWebhook() {
    try {
        console.log('Setting webhook for URL:', `${SERVER_URL}/api/telegram-webhook`);
        
        const response = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
            {
                url: `${SERVER_URL}/api/telegram-webhook`,
                allowed_updates: ['message', 'edited_message'],
                drop_pending_updates: true
            }
        );
        
        console.log('Webhook set successfully:', response.data);
    } catch (error) {
        console.error('Error setting webhook:', error.response?.data || error.message);
    }
}

setWebhook();