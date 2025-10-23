const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config()

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token);

class TgBot{
    constructor() {
        this.token = process.env.BOT_TOKEN;
        this.bot = bot;
        
        // 消息队列系统
        this.messageQueue = [];
        this.isProcessing = false;
        this.rateLimitUntil = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // 批量处理设置
        this.batchSize = 5; // 每次处理5条消息
        this.processInterval = 200; // 每200ms处理一次
        
        // 启动队列处理器
        this.startQueueProcessor();
    }

    // 启动队列处理器
    startQueueProcessor() {
        setInterval(() => {
            this.processQueue();
        }, this.processInterval);
    }

    // 处理消息队列
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        // 检查是否还在限流期内
        if (Date.now() < this.rateLimitUntil) {
            return;
        }

        this.isProcessing = true;
        
        try {
            // 批量处理消息
            const batch = this.messageQueue.splice(0, this.batchSize);
            
            // 并行发送消息
            const promises = batch.map(message => this.sendMessageWithRetry(message));
            await Promise.allSettled(promises);
            
        } catch (error) {
            console.error('队列处理错误:', error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    // 带重试的消息发送
    async sendMessageWithRetry(messageData) {
        const { chatId, html, thread_id, disable_web_page_preview, options, retryCount = 0 } = messageData;
        
        try {
            const extra = {
                parse_mode: 'HTML',
                disable_web_page_preview: disable_web_page_preview ?? true,
                ...options
            };
            if (thread_id) {
                extra.message_thread_id = thread_id;
            }
            
            await this.bot.sendMessage(chatId, html, extra);
            this.retryCount = 0;
            
        } catch (error) {
            if (error.message.includes('429 Too Many Requests')) {
                // 解析 retry after 时间
                const retryAfterMatch = error.message.match(/retry after (\d+)/);
                const retryAfter = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 2; // 减少等待时间
                
                console.warn(`❌ TG 限流: 需要等待 ${retryAfter} 秒`);
                
                // 设置限流结束时间
                this.rateLimitUntil = Date.now() + (retryAfter * 1000);
                
                // 如果重试次数未超限，重新加入队列
                if (retryCount < this.maxRetries) {
                    this.messageQueue.unshift({
                        ...messageData,
                        retryCount: retryCount + 1
                    });
                } else {
                    console.error(`❌ 消息发送失败，已达到最大重试次数`);
                }
            } else {
                console.error('❌ TG 发送失败:', error.message);
            }
        }
    }

    // 添加消息到队列
    queueMessage(chatId, html, thread_id = null, disable_web_page_preview = true, options = {}) {
        this.messageQueue.push({
            chatId,
            html,
            thread_id,
            disable_web_page_preview,
            options
        });
        
        // 只在队列长度变化较大时打印日志
        if (this.messageQueue.length % 50 === 0) {
            console.log(`📝 消息已加入队列，当前队列长度: ${this.messageQueue.length}`);
        }
    }

    send(chatId, msg, message_thread_id) {
        this.bot.sendMessage(chatId, msg, {
            message_thread_id: message_thread_id,
            parse_mode:"MarkdownV2"
        });
    }

    // 修改 sendHtml 方法，使用队列系统
    sendHtml(chatId, html, thread_id = null, disable_web_page_preview = true, options = {}) {
        this.queueMessage(chatId, html, thread_id, disable_web_page_preview, options);
        return new Promise((resolve) => {
            setTimeout(() => resolve(), 50); // 减少等待时间
        });
    }

    // 立即发送消息（用于紧急情况）
    async sendHtmlImmediate(chatId, html, thread_id = null, disable_web_page_preview = true, options = {}) {
        return this.sendMessageWithRetry({
            chatId,
            html,
            thread_id,
            disable_web_page_preview,
            options
        });
    }

    sendPhoto(chatId, photoUrl, options = {}) {
        const extra = { ...options };
        return this.bot.sendPhoto(chatId, photoUrl, extra);
    }

    // 获取队列状态
    getQueueStatus() {
        return {
            queueLength: this.messageQueue.length,
            isProcessing: this.isProcessing,
            rateLimitUntil: this.rateLimitUntil,
            retryCount: this.retryCount
        };
    }

    // 清空队列（紧急情况使用）
    clearQueue() {
        this.messageQueue = [];
        console.log('🗑️ 队列已清空');
    }
}

module.exports = TgBot;

if(require.main === module) {
    const bot = new TgBot();
    const chatid = '-4940120432';
    bot.sendHtml(chatid, 'Hello, world!');
    process.exit(0);
}