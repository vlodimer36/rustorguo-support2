const axios = require('axios');

const TELEGRAM_BOT_TOKEN = '8078550568:AAEtW8cTX3Rw_x1rUIJTg9Q46pntJVfOhuw';
const SERVER_URL = 'https://rustorguo-support.onrender.com';

async function setWebhook() {
    try {
        console.log('🔄 Setting Telegram webhook...');
        console.log('📋 Bot Token:', TELEGRAM_BOT_TOKEN);
        console.log('🌐 Server URL:', SERVER_URL);
        
        const response = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
            {
                url: `${SERVER_URL}/api/telegram-webhook`,
                allowed_updates: ['message', 'edited_message'],
                drop_pending_updates: true
            },
            { 
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Webhook set successfully!');
        console.log('📊 Response:', JSON.stringify(response.data, null, 2));
        
        // Проверяем статус webhook
        const webhookInfo = await axios.get(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
        );
        
        console.log('🔍 Webhook info:', JSON.stringify(webhookInfo.data, null, 2));
        
    } catch (error) {
        console.error('❌ Error setting webhook:');
        if (error.response) {
            console.error('📡 Telegram API error:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('💥 Network error:', error.message);
        }
    }
}

setWebhook();
