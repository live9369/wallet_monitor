const TgBot = require('../src/notify/bot');
require('dotenv').config();

/**
 * 简单的Bot测试
 */
async function testBot() {
    console.log('🤖 测试Telegram Bot...\n');
    
    // 检查环境变量
    if (!process.env.BOT_TOKEN) {
        console.error('❌ 未配置BOT_TOKEN环境变量');
        return;
    }
    
    // 使用硬编码的CHAT_ID进行测试
    const chatId = process.env.CHAT_ID || '-4940120432';
    
    console.log(`✅ BOT_TOKEN: ${process.env.BOT_TOKEN.slice(0, 10)}...`);
    console.log(`✅ CHAT_ID: ${chatId}`);
    
    try {
        const bot = new TgBot();
        
        // 发送简单测试消息
        console.log('\n📤 发送测试消息...');
        await bot.sendHtmlImmediate(chatId, '<b>🧪 测试消息</b>\n\n这是一条测试消息，用于验证Bot配置是否正确。');
        
        console.log('✅ 测试消息发送成功！');
        
        // 等待一下再发送队列消息测试
        console.log('\n📤 测试队列消息...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        bot.sendHtml(chatId, '<b>📋 队列测试</b>\n\n这是一条队列消息测试。');
        
        // 等待队列处理
        console.log('⏳ 等待队列处理...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const queueStatus = bot.getQueueStatus();
        console.log(`📊 队列状态:`, queueStatus);
        
        console.log('\n✅ Bot测试完成！');
        
    } catch (error) {
        console.error('❌ Bot测试失败:', error.message);
        console.error('详细错误:', error);
    } finally {
        // 强制退出进程
        console.log('🔄 退出测试...');
        process.exit(0);
    }
}

// 运行测试
if (require.main === module) {
    testBot().catch(console.error);
}

module.exports = { testBot };
