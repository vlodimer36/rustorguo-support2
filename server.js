const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram bot configuration
const TELEGRAM_BOT_TOKEN = '8078550568:AAEtW8cTX3Rw_x1rUIJTg9Q46pntJVfOhuw';
const TELEGRAM_CHAT_ID = '-4795204209';
const SERVER_URL = 'https://rustorguo-support.onrender.com';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for messages
const messageStorage = new Map();

// Health check endpoint
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: 'Rustorguo Support Server',
        users: messageStorage.size,
        version: '2.0'
    });
});

// Get message history for user
app.get('/api/messages/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        const userMessages = messageStorage.get(userId) || [];
        
        res.json({
            success: true,
            messages: userMessages
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Send message to Telegram
app.post('/api/send-message', async (req, res) => {
    try {
        const { userId, userName, userEmail, text, pageUrl } = req.body;

        if (!text || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Message text and user ID are required'
            });
        }

        // Format message for Telegram
        const telegramMessage = `
📨 Новое сообщение от пользователя

👤 Имя: ${userName || 'Гость'}
📧 Email: ${userEmail || 'Не указан'}
💬 Сообщение: ${text}
🌐 Страница: ${pageUrl || 'Неизвестно'}
🆔 User ID: ${userId}
⏰ Время: ${new Date().toLocaleString('ru-RU')}

💡 Чтобы ответить, используйте команду:
/reply_${userId} Ваш ответ здесь
        `.trim();

        // Send to Telegram
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: 'HTML'
            },
            { timeout: 10000 }
        );

        // Store user message
        if (!messageStorage.has(userId)) {
            messageStorage.set(userId, []);
        }

        const userMessages = messageStorage.get(userId);
        userMessages.push({
            text: text,
            from: 'user',
            timestamp: new Date().toISOString(),
            displayed: true
        });

        console.log('Message sent to Telegram for user:', userId);

        res.json({
            success: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('Error sending message:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Endpoint for admin to send replies
app.post('/api/send-reply', async (req, res) => {
    try {
        const { userId, replyText } = req.body;

        if (!userId || !replyText) {
            return res.status(400).json({
                success: false,
                error: 'User ID and reply text are required'
            });
        }

        // Store bot reply
        if (!messageStorage.has(userId)) {
            messageStorage.set(userId, []);
        }

        const userMessages = messageStorage.get(userId);
        userMessages.push({
            text: replyText,
            from: 'bot',
            timestamp: new Date().toISOString(),
            displayed: false
        });

        console.log('Reply saved for user:', userId);

        // Also send to Telegram for notification
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: `✅ Ответ отправлен пользователю ${userId}`,
                parse_mode: 'HTML'
            }
        );

        res.json({
            success: true,
            message: 'Reply sent successfully'
        });

    } catch (error) {
        console.error('Error sending reply:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to send reply'
        });
    }
});

// Check for new replies
app.get('/api/check-replies/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        const userMessages = messageStorage.get(userId) || [];
        const newReplies = userMessages.filter(msg => 
            msg.from === 'bot' && !msg.displayed
        );

        // Mark as displayed
        newReplies.forEach(msg => msg.displayed = true);

        res.json({
            success: true,
            hasNewReplies: newReplies.length > 0,
            replies: newReplies
        });

    } catch (error) {
        console.error('Error checking replies:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get all users (for admin panel)
app.get('/api/users', (req, res) => {
    try {
        const users = Array.from(messageStorage.entries()).map(([userId, messages]) => {
            const userMessages = messages || [];
            const lastMessage = userMessages[userMessages.length - 1];
            const unreadCount = userMessages.filter(msg => 
                msg.from === 'bot' && !msg.displayed
            ).length;

            return {
                userId,
                messageCount: userMessages.length,
                lastActivity: lastMessage ? lastMessage.timestamp : null,
                unreadCount: unreadCount
            };
        });

        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Telegram webhook for direct replies
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        console.log('📨 Received Telegram webhook');
        
        const update = req.body;
        
        if (update.message && update.message.text) {
            const messageText = update.message.text;
            const chatId = update.message.chat.id.toString();
            const targetChatId = TELEGRAM_CHAT_ID.replace('-', '');

            console.log('💬 Message:', messageText);
            console.log('👥 Chat ID:', chatId, 'Target:', targetChatId);

            if (chatId === targetChatId && messageText.startsWith('/reply_')) {
                const parts = messageText.split(' ');
                const userId = parts[0].replace('/reply_', '');
                const replyText = parts.slice(1).join(' ').trim();

                console.log('🎯 Parsed - User:', userId, 'Text:', replyText);

                if (userId && replyText) {
                    // Save the reply
                    if (!messageStorage.has(userId)) {
                        messageStorage.set(userId, []);
                    }

                    const userMessages = messageStorage.get(userId);
                    userMessages.push({
                        text: replyText,
                        from: 'bot',
                        timestamp: new Date().toISOString(),
                        displayed: false
                    });

                    console.log('💾 Reply saved for user:', userId);

                    // Send confirmation
                    await axios.post(
                        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                        {
                            chat_id: TELEGRAM_CHAT_ID,
                            text: `✅ Ответ сохранен для пользователя ${userId}`,
                            parse_mode: 'HTML'
                        }
                    );

                    console.log('📤 Confirmation sent to Telegram');
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Error in webhook:', error.message);
        res.status(200).send('OK');
    }
});
// Telegram webhook for direct replies
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        console.log('📨 Received Telegram webhook');
        
        const update = req.body;
        console.log('Update:', JSON.stringify(update, null, 2));
        
        // Всегда отвечаем OK Telegramу сразу
        res.status(200).send('OK');
        
        if (update.message && update.message.text) {
            const messageText = update.message.text;
            const chatId = update.message.chat.id.toString();
            const targetChatId = TELEGRAM_CHAT_ID.replace('-', '');

            console.log('💬 Message:', messageText);
            console.log('👥 Chat ID:', chatId, 'Target:', targetChatId);

            // Проверяем что сообщение из нужного чата
            if (chatId !== targetChatId) {
                console.log('❌ Ignoring message from wrong chat:', chatId);
                return;
            }

            // Обрабатываем команду /reply_
            if (messageText.startsWith('/reply_')) {
                const parts = messageText.split(' ');
                if (parts.length < 2) {
                    console.log('❌ Invalid command format');
                    return;
                }

                const userId = parts[0].replace('/reply_', '');
                const replyText = parts.slice(1).join(' ').trim();

                console.log('🎯 Parsed - User:', userId, 'Text:', replyText);

                if (userId && replyText) {
                    // Save the reply
                    if (!messageStorage.has(userId)) {
                        messageStorage.set(userId, []);
                    }

                    const userMessages = messageStorage.get(userId);
                    userMessages.push({
                        text: replyText,
                        from: 'bot',
                        timestamp: new Date().toISOString(),
                        displayed: false
                    });

                    console.log('💾 Reply saved for user:', userId);

                    // Send confirmation to Telegram
                    try {
                        await axios.post(
                            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                            {
                                chat_id: TELEGRAM_CHAT_ID,
                                text: `✅ Ответ сохранен для пользователя ${userId}`,
                                parse_mode: 'HTML'
                            },
                            { timeout: 5000 }
                        );
                        console.log('📤 Confirmation sent to Telegram');
                    } catch (error) {
                        console.error('❌ Error sending confirmation:', error.message);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error in webhook:', error.message);
        // Всегда отвечаем OK даже при ошибке
        res.status(200).send('OK');
    }
});
// Setup webhook endpoint - для ручной настройки webhook
app.get('/setup-webhook', async (req, res) => {
    try {
        console.log('🔄 Setting up Telegram webhook manually...');
        
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
        
        console.log('✅ Webhook set successfully:', response.data);
        
        // Проверяем статус webhook
        const webhookInfo = await axios.get(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
        );
        
        res.json({
            success: true,
            message: 'Webhook configured successfully',
            webhook: webhookInfo.data,
            setup: response.data
        });
        
    } catch (error) {
        console.error('❌ Error setting webhook:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || 'No response details'
        });
    }
});

// Get webhook info endpoint - для проверки статуса
app.get('/webhook-info', async (req, res) => {
    try {
        const response = await axios.get(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
        );
        
        res.json({
            success: true,
            webhook: response.data
        });
        
    } catch (error) {
        console.error('❌ Error getting webhook info:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test endpoint для проверки работы webhook
app.get('/test-webhook', async (req, res) => {
    try {
        // Тестовая команда для проверки
        const testResponse = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: '🤖 Webhook тест: сервер работает!',
                parse_mode: 'HTML'
            }
        );
        
        res.json({
            success: true,
            message: 'Test message sent to Telegram',
            data: testResponse.data
        });
        
    } catch (error) {
        console.error('❌ Test webhook error:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve static files (admin.html)
app.use(express.static(path.join(__dirname)));

// Serve admin.html from root
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/status`);
    console.log(`👨‍💼 Admin panel: http://localhost:${PORT}/admin`);
    console.log(`🤖 Webhook setup: http://localhost:${PORT}/setup-webhook`);
    console.log(`🔍 Webhook info: http://localhost:${PORT}/webhook-info`);
});

module.exports = app;
