require('dotenv').config();

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const app = express();
const PORT = process.env.PORT || 3000;
// ✅✅✅ ДОБАВЬТЕ ЭТИ 3 СТРОКИ ДЛЯ CORS ✅✅✅
const cors = require('cors'); // 1. Импортируем пакет
app.use(cors());              // 2. Разрешаем запросы со всех доменов
// app.use(cors({ origin: 'https://ваш-сайт.ru' })); // Или так, для конкретного домена
// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // для статических файлов

// Ваши данные Telegram из .env файла
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8078550568:AAEtW8cTX3Rw_x1rUIJTg9Q46pntJVfOhuw';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-4795204209';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Проверка, что переменные окружения загружены
if (!TELEGRAM_BOT_TOKEN) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env файле');
    process.exit(1);
}

console.log('Server starting...');
console.log('Telegram Bot Token:', TELEGRAM_BOT_TOKEN);
console.log('Telegram Group ID:', TELEGRAM_GROUP_ID);

// Хранилище для сообщений (в продакшене используйте базу данных)
let messages = {};
let userSessions = {};

// Функция для отправки сообщений в Telegram
async function sendTelegramMessage(chatId, text, parse_mode = 'HTML') {
    try {
        const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: parse_mode,
            disable_web_page_preview: true
        });
        return response.data;
    } catch (error) {
        console.error('Ошибка отправки сообщения в Telegram:', error.response?.data || error.message);
        throw error;
    }
}

// Корневой route для проверки работы сервера
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'RustorgUO Support Server is running',
        timestamp: new Date().toISOString()
    });
});

// Вебхук для получения сообщений от Telegram
app.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        
        const { message } = req.body;
        
        if (message && message.text) {
            const chatId = message.chat.id;
            const text = message.text;
            const userId = message.from.id;
            const userName = message.from.first_name + (message.from.last_name ? ' ' + message.from.last_name : '');
            
            console.log(`Сообщение от ${userName} (${userId}): ${text}`);
            
            // Если сообщение из группы поддержки
            if (chatId.toString() === TELEGRAM_GROUP_ID.replace('-100', '-')) {
                // Проверяем, является ли сообщение ответом на вопрос пользователя
                if (message.reply_to_message && message.reply_to_message.text) {
                    const originalMessage = message.reply_to_message.text;
                    // Ищем userId в сообщении (мы его добавляем при пересылке)
                    const userIdMatch = originalMessage.match(/User ID: (\S+)/);
                    
                    if (userIdMatch && userIdMatch[1]) {
                        const targetUserId = userIdMatch[1];
                        
                        // Форматируем ответ
                        const responseText = `👨‍💼 <b>Поддержка RUSTORGUO:</b>\n${text}`;
                        
                        // Отправляем ответ пользователю
                        try {
                            await sendTelegramMessage(targetUserId, responseText);
                            
                            // Сохраняем в историю
                            if (!messages[targetUserId]) {
                                messages[targetUserId] = [];
                            }
                            messages[targetUserId].push({
                                text: text,
                                timestamp: new Date(),
                                from: 'support',
                                supportAgent: userName
                            });
                            
                            console.log(`Ответ отправлен пользователю ${targetUserId}`);
                            
                            // Отправляем подтверждение в группу
                            await sendTelegramMessage(TELEGRAM_GROUP_ID, `✅ Ответ отправлен пользователю ${targetUserId}`);
                            
                        } catch (error) {
                            console.error('Ошибка отправки ответа пользователю:', error);
                            await sendTelegramMessage(TELEGRAM_GROUP_ID, `❌ Ошибка отправки ответа: ${error.message}`);
                        }
                    }
                }
            }
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка в webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API для отправки сообщений от пользователей сайта
app.post('/api/send-message', async (req, res) => {
    try {
        const { userId, userName, userEmail, text, pageUrl } = req.body;
        
        // Валидация
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Текст сообщения не может быть пустым' 
            });
        }
        
        // Генерируем уникальный ID сессии, если не предоставлен
        const sessionId = userId || `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Сохраняем сообщение
        if (!messages[sessionId]) {
            messages[sessionId] = [];
        }
        messages[sessionId].push({
            text: text,
            timestamp: new Date(),
            from: 'user',
            userName: userName || 'Гость',
            userEmail: userEmail || 'Не указан'
        });
        
        // Формируем сообщение для Telegram
        const telegramMessage = `
📩 <b>НОВОЕ СООБЩЕНИЕ ИЗ ЧАТА RUSTORGUO</b>
┌─ <b>Пользователь:</b> ${userName || 'Гость'}
├─ <b>Email:</b> ${userEmail || 'Не указан'}
├─ <b>User ID:</b> <code>${sessionId}</code>
├─ <b>Страница:</b> ${pageUrl || 'Не указана'}
├─ <b>Время:</b> ${new Date().toLocaleString('ru-RU')}
└─ <b>Сообщение:</b> 
${text}
        `.trim();
        
        // Отправляем сообщение в группу Telegram
        try {
            await sendTelegramMessage(TELEGRAM_GROUP_ID, telegramMessage);
            
            // Сохраняем сессию пользователя
            userSessions[sessionId] = {
                userName: userName || 'Гость',
                userEmail: userEmail || 'Не указан',
                lastActivity: new Date()
            };
            
            res.json({ 
                success: true, 
                sessionId: sessionId,
                message: 'Сообщение отправлено в поддержку' 
            });
            
        } catch (error) {
            console.error('Ошибка отправки в Telegram:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Ошибка отправки сообщения в поддержку' 
            });
        }
        
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// API для получения истории сообщений
app.get('/api/messages/:sessionId', (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const userMessages = messages[sessionId] || [];
        
        // Фильтруем только последние 50 сообщений
        const recentMessages = userMessages.slice(-50);
        
        res.json({
            success: true,
            messages: recentMessages,
            count: recentMessages.length
        });
    } catch (error) {
        console.error('Ошибка получения сообщений:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка получения сообщений' 
        });
    }
});

// API для проверки статуса сервера
app.get('/api/status', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        serverTime: new Date().toLocaleString('ru-RU'),
        messagesCount: Object.keys(messages).length,
        usersCount: Object.keys(userSessions).length
    });
});

// Установка вебхука
app.post('/set-webhook', async (req, res) => {
    try {
        const webhookUrl = process.env.RENDER_EXTERNAL_URL ? 
            `${process.env.RENDER_EXTERNAL_URL}/webhook` : 
            req.body.webhookUrl;
            
        if (!webhookUrl) {
            return res.status(400).json({ error: 'URL вебхука не указан' });
        }
        
        console.log('Setting webhook to:', webhookUrl);
        
        const response = await axios.post(
            `${TELEGRAM_API_URL}/setWebhook`, 
            { url: webhookUrl }
        );
        
        res.json(response.data);
    } catch (error) {
        console.error('Ошибка настройки вебхука:', error);
        res.status(500).json({ 
            error: 'Ошибка настройки вебхука',
            details: error.response?.data || error.message 
        });
    }
});

// Удаление вебхука
app.post('/delete-webhook', async (req, res) => {
    try {
        const response = await axios.post(
            `${TELEGRAM_API_URL}/deleteWebhook`
        );
        res.json(response.data);
    } catch (error) {
        console.error('Ошибка удаления вебхука:', error);
        res.status(500).json({ 
            error: 'Ошибка удаления вебхука',
            details: error.response?.data || error.message 
        });
    }
});

// Получение информации о вебхуке
app.get('/get-webhook-info', async (req, res) => {
    try {
        const response = await axios.get(
            `${TELEGRAM_API_URL}/getWebhookInfo`
        );
        res.json(response.data);
    } catch (error) {
        console.error('Ошибка получения информации о вебхуке:', error);
        res.status(500).json({ 
            error: 'Ошибка получения информации о вебхуке',
            details: error.response?.data || error.message 
        });
    }
});

// Получение информации о боте
app.get('/get-bot-info', async (req, res) => {
    try {
        const response = await axios.get(
            `${TELEGRAM_API_URL}/getMe`
        );
        res.json(response.data);
    } catch (error) {
        console.error('Ошибка получения информации о боте:', error);
        res.status(500).json({ 
            error: 'Ошибка получения информации о боте',
            details: error.response?.data || error.message 
        });
    }
});

// Очистка старых сессий (каждый день в 3:00)
cron.schedule('0 3 * * *', () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    let clearedCount = 0;
    
    for (const sessionId in userSessions) {
        if (userSessions[sessionId].lastActivity < thirtyDaysAgo) {
            delete userSessions[sessionId];
            delete messages[sessionId];
            clearedCount++;
        }
    }
    
    console.log(`Очищено ${clearedCount} старых сессий`);
});

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Внутренняя ошибка сервера' 
    });
});

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Endpoint не найден' 
    });
});

// Старт сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📍 Локальный URL: http://localhost:${PORT}`);
    console.log(`🤖 Telegram Bot: ${TELEGRAM_BOT_TOKEN}`);
    console.log(`👥 Telegram Group: ${TELEGRAM_GROUP_ID}`);
    console.log('──────────────────────────────────────');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    process.exit(0);
});