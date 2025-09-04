const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram bot configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8078550568:AAEtW8cTX3Rw_x1rUIJTg9Q46pntJVfOhuw';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4795204209';

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
        users: messageStorage.size
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

        // Validate required fields
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

💡 Чтобы ответить, напишите:
Ответ для ${userId}: Ваш текст ответа
        `.trim();

        // Send to Telegram
        const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: 'HTML'
            },
            { timeout: 10000 }
        );

        // Store message in memory
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
        console.error('Error sending message to Telegram:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to send message to Telegram',
            details: error.message
        });
    }
});

// Webhook для получения сообщений от Telegram бота
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        console.log('Telegram webhook received:', JSON.stringify(update, null, 2));

        // Проверяем что это текстовое сообщение
        if (update.message && update.message.text) {
            const messageText = update.message.text;
            const chatId = update.message.chat.id;
            
            // Игнорируем сообщения не из нужного чата
            const targetChatId = TELEGRAM_CHAT_ID.replace('-', '');
            if (chatId.toString() !== targetChatId) {
                console.log('Ignoring message from chat:', chatId);
                return res.status(200).send('OK');
            }

            console.log('Processing message from admin chat:', messageText);

            // Ищем шаблон ответа: "Ответ для user_123: текст ответа"
            const responseMatch = messageText.match(/Ответ для (user_[^:]+):\s*(.*)/i);
            
            if (responseMatch) {
                const userId = responseMatch[1];
                const responseText = responseMatch[2].trim();
                
                if (!responseText) {
                    console.log('Empty response text');
                    return res.status(200).send('OK');
                }

                console.log('Saving response for user:', userId, 'Text:', responseText);

                // Сохраняем ответ в историю пользователя
                if (!messageStorage.has(userId)) {
                    messageStorage.set(userId, []);
                }
                
                const userMessages = messageStorage.get(userId);
                userMessages.push({
                    text: responseText,
                    from: 'bot',
                    timestamp: new Date().toISOString(),
                    fromTelegram: true,
                    displayed: false // Помечаем как непрочитанное
                });

                // Отправляем подтверждение в Telegram
                await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id: TELEGRAM_CHAT_ID,
                        text: `✅ Ответ сохранен для пользователя ${userId}`,
                        parse_mode: 'HTML'
                    }
                );

                console.log('Response saved successfully for user:', userId);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error in Telegram webhook:', error.message);
        res.status(200).send('OK'); // Всегда отвечаем OK Telegramу
    }
});

// Endpoint для проверки непрочитанных сообщений
app.get('/api/unread-messages/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false,
                error: 'User ID is required' 
            });
        }

        const userMessages = messageStorage.get(userId) || [];
        const unreadMessages = userMessages.filter(msg => 
            msg.from === 'bot' && !msg.displayed
        );

        // Помечаем сообщения как прочитанные
        unreadMessages.forEach(msg => {
            msg.displayed = true;
        });

        res.json({
            success: true,
            unreadCount: unreadMessages.length,
            messages: unreadMessages
        });
    } catch (error) {
        console.error('Error getting unread messages:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Endpoint для получения информации о пользователе
app.get('/api/user-info/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const userMessages = messageStorage.get(userId) || [];
        
        res.json({
            success: true,
            userId: userId,
            messageCount: userMessages.length,
            lastActivity: userMessages.length > 0 
                ? userMessages[userMessages.length - 1].timestamp 
                : null
        });
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
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
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/status`);
    console.log(`🤖 Telegram webhook: http://localhost:${PORT}/api/telegram-webhook`);
    console.log(`💬 Message storage: ${messageStorage.size} users`);
});

module.exports = app;