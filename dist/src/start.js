"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const WalletMonitor = require('./main');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const token = process.env.BOT_TOKEN;
// interaction
class App_Start {
    constructor() {
        this.bot = new TelegramBot(token, { polling: true });
        this.chatIdMap = new Map(); // chatId --> WalletMonitor
    }
    init(_map = []) {
        if (_map.length === 0)
            process.exit(1);
        for (const item of _map) {
            // 统一将 chatId 转换为字符串存储，确保查找时一致
            const chatIdKey = String(item.chatId);
            this.chatIdMap.set(chatIdKey, item.walletMonitor);
            console.log(`✅ 注册钱包监控器: chatId=${chatIdKey}`);
        }
        console.log(`📋 已注册 ${this.chatIdMap.size} 个钱包监控器`);
    }
    start() {
        this.setupCommands();
    }
    /**
     * 设置交互式命令
     */
    setupCommands() {
        // add命令 - 添加监控地址
        this.bot.onText(/\/add (.+)/, async (msg, match) => await this.handleAdd(msg, match));
        // del命令 - 删除监控地址
        this.bot.onText(/\/del (.+)/, async (msg, match) => await this.handleDel(msg, match));
        // query命令 - 查询监控地址
        this.bot.onText(/\/query(.*)/, async (msg, match) => await this.handleQuery(msg, match));
        // descendants命令 - 查询指定地址的所有子集
        this.bot.onText(/\/descendants (.+)/, async (msg, match) => await this.handleDescendants(msg, match));
        // list命令 - 列出所有监控地址
        this.bot.onText(/\/list/, async (msg) => await this.handleList(msg));
        // stats命令 - 获取统计信息
        this.bot.onText(/\/stats/, async (msg) => await this.handleStats(msg));
        // help命令 - 显示帮助信息
        this.bot.onText(/\/help/, async (msg) => await this.handleHelp(msg));
        // chatid命令 - 获取聊天ID
        this.bot.onText(/\/chatid/, async (msg) => await this.handleChatid(msg));
    }
    /***********************************************************************************
     ************************************ handle ***************************************
     ***********************************************************************************/
    async handleChatid(msg) {
        const chatId = msg.chat.id;
        let message_thread_id = null;
        if (msg.message_thread_id) {
            message_thread_id = msg.message_thread_id;
        }
        if (message_thread_id) {
            await this.bot.sendMessage(chatId, `聊天ID: ${chatId}\n消息线程ID: ${message_thread_id}`, {
                reply_to_message_id: message_thread_id
            });
        }
        else {
            await this.bot.sendMessage(chatId, `聊天ID: ${chatId}`);
        }
    }
    async handleAdd(msg, match) {
        const chatId = msg.chat.id;
        const args = match[1].split(' ');
        if (args.length < 2) {
            await this.bot.sendMessage(chatId, '❌ 用法: /add <钱包地址> <钱包名称>');
            return;
        }
        const address = args[0].trim();
        const name = args[1].trim();
        if (!this.checkAddressFormat(address)) {
            await this.bot.sendMessage(chatId, '❌ 钱包地址格式错误');
            return;
        }
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor)
            return;
        const result = await walletMonitor.addWallet(address, name);
        if (result.success) {
            await this.bot.sendMessage(chatId, `✅ ${result.message}`);
        }
        else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }
    async handleDel(msg, match) {
        const chatId = msg.chat.id;
        try {
            // 检查参数是否存在
            if (!match || !match[1]) {
                await this.bot.sendMessage(chatId, '❌ 用法: /del <钱包地址>');
                return;
            }
            const address = match[1].trim();
            if (!address) {
                await this.bot.sendMessage(chatId, '❌ 用法: /del <钱包地址>');
                return;
            }
            if (!this.checkAddressFormat(address)) {
                await this.bot.sendMessage(chatId, '❌ 钱包地址格式错误');
                return;
            }
            const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
            if (!walletMonitor)
                return;
            // 先发送一个"正在处理"的消息，避免用户以为没有响应
            let processingMessage = null;
            try {
                processingMessage = await this.bot.sendMessage(chatId, '⏳ 正在删除钱包及其所有子集，请稍候...');
            }
            catch (sendError) {
                console.error('⚠️ 发送处理中消息失败:', sendError);
            }
            const result = await walletMonitor.removeWallet(address);
            // 如果发送了处理中消息，先删除它
            if (processingMessage && processingMessage.message_id) {
                try {
                    await this.bot.deleteMessage(chatId, processingMessage.message_id);
                }
                catch (deleteError) {
                    // 忽略删除消息失败的错误
                }
            }
            // 确保 result 存在
            if (!result) {
                await this.bot.sendMessage(chatId, '❌ 删除操作失败：未返回结果');
                return;
            }
            if (result.success) {
                let message = `✅ ${result.message}`;
                // 如果有删除的子集，显示详细信息
                if (result.data && result.data.deletedCount > 1 && result.data.deletedNames) {
                    message += `\n\n📋 已删除的地址（共 ${result.data.deletedCount} 个）：`;
                    // 显示所有已删除的地址（主地址和子集）
                    // 第一个是主地址
                    message += `\n• ${result.data.deletedNames[0]} (主地址)`;
                    // 其余是子集
                    if (result.data.deletedNames.length > 1) {
                        result.data.deletedNames.slice(1).forEach(name => {
                            message += `\n• ${name} (子集)`;
                        });
                    }
                }
                await this.bot.sendMessage(chatId, message);
            }
            else {
                await this.bot.sendMessage(chatId, `❌ ${result.message || '删除失败'}`);
            }
        }
        catch (error) {
            console.error('❌ handleDel 异常:', error);
            try {
                await this.bot.sendMessage(chatId, `❌ 删除操作失败: ${error.message || '未知错误'}`);
            }
            catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError);
            }
        }
    }
    async handleQuery(msg, match) {
        const chatId = msg.chat.id;
        const address = match[1].trim();
        if (address && !this.checkAddressFormat(address)) {
            await this.bot.sendMessage(chatId, '❌ 钱包地址格式错误');
            return;
        }
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor)
            return;
        const result = await walletMonitor.queryWallet(address);
        if (result.success) {
            const formattedData = this.formatQueryResult(result.data);
            await this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${formattedData}`);
        }
        else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }
    async handleDescendants(msg, match) {
        const chatId = msg.chat.id;
        try {
            // 检查参数是否存在
            if (!match || !match[1]) {
                await this.bot.sendMessage(chatId, '❌ 用法: /descendants <钱包地址>');
                return;
            }
            const address = match[1].trim();
            if (!address) {
                await this.bot.sendMessage(chatId, '❌ 用法: /descendants <钱包地址>');
                return;
            }
            if (!this.checkAddressFormat(address)) {
                await this.bot.sendMessage(chatId, '❌ 钱包地址格式错误');
                return;
            }
            const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
            if (!walletMonitor)
                return;
            // 发送处理中消息
            let processingMessage = null;
            try {
                processingMessage = await this.bot.sendMessage(chatId, '⏳ 正在查询子集，请稍候...');
            }
            catch (sendError) {
                console.error('⚠️ 发送处理中消息失败:', sendError);
            }
            const result = await walletMonitor.queryDescendants(address);
            // 删除处理中消息
            if (processingMessage && processingMessage.message_id) {
                try {
                    await this.bot.deleteMessage(chatId, processingMessage.message_id);
                }
                catch (deleteError) {
                    // 忽略删除消息失败的错误
                }
            }
            if (result.success) {
                if (result.data.count === 0) {
                    await this.bot.sendMessage(chatId, `✅ ${result.data.name || address}\n📊 该地址没有子集`);
                }
                else {
                    let message = `✅ ${result.data.name || address}\n📊 共有 ${result.data.count} 个子集\n\n`;
                    // 按层级组织显示
                    const levelGroups = {};
                    for (const desc of result.data.descendants) {
                        const level = desc.level || 0;
                        if (!levelGroups[level]) {
                            levelGroups[level] = [];
                        }
                        levelGroups[level].push(desc);
                    }
                    const sortedLevels = Object.keys(levelGroups).sort((a, b) => parseInt(a) - parseInt(b));
                    for (const level of sortedLevels) {
                        const count = levelGroups[level].length;
                        message += `📍 层级 ${level}: ${count} 个\n`;
                        // 显示前5个，如果超过5个则省略
                        const displayCount = Math.min(5, count);
                        for (let i = 0; i < displayCount; i++) {
                            const desc = levelGroups[level][i];
                            message += `  • ${desc.name || desc.wallet}\n`;
                        }
                        if (count > displayCount) {
                            message += `  ... 还有 ${count - displayCount} 个\n`;
                        }
                        message += `\n`;
                    }
                    // 添加统计信息
                    if (result.data.levelDistribution) {
                        message += `📈 层级分布:\n`;
                        const sortedDist = Object.keys(result.data.levelDistribution)
                            .sort((a, b) => parseInt(a) - parseInt(b));
                        for (const level of sortedDist) {
                            message += `  层级 ${level}: ${result.data.levelDistribution[level]} 个\n`;
                        }
                    }
                    await this.bot.sendMessage(chatId, message);
                }
            }
            else {
                await this.bot.sendMessage(chatId, `❌ ${result.message || '查询失败'}`);
            }
        }
        catch (error) {
            console.error('❌ handleDescendants 异常:', error);
            try {
                await this.bot.sendMessage(chatId, `❌ 查询子集失败: ${error.message || '未知错误'}`);
            }
            catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError);
            }
        }
    }
    async handleList(msg) {
        const chatId = msg.chat.id;
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor)
            return;
        const result = await walletMonitor.queryWallet();
        if (result.success) {
            const formattedData = this.formatListResult(result.data);
            await this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${formattedData}`);
        }
        else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }
    async handleStats(msg) {
        const chatId = msg.chat.id;
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor)
            return;
        const result = await walletMonitor.getStatsInfo();
        if (result.success) {
            const formattedData = this.formatStatsResult(result.data);
            await this.bot.sendMessage(chatId, `📊 统计信息:\n\n${formattedData}`);
        }
        else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }
    async handleHelp(msg) {
        const chatId = msg.chat.id;
        await this.bot.sendMessage(chatId, `
🤖 钱包监控命令帮助

/add <钱包地址> <钱包名称> - 添加监控地址（Level 1，顶级）
/del <钱包地址> - 删除监控地址
/query [钱包地址] - 查询监控地址（不提供地址则查询所有）
/descendants <钱包地址> - 查询指定地址的所有子集
/list - 列出所有监控地址
/stats - 获取统计信息
/help - 显示帮助信息

示例:
/add 0x1234... WalletName
/del 0x1234...
/query 0x1234...
/query
/descendants 0x1234...
/list
/stats`);
    }
    /***********************************************************************************
     ************************************ utils ***************************************
     ***********************************************************************************/
    checkAddressFormat(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    formatListResult(data) {
        if (!data || !data.wallets || data.wallets.length === 0) {
            return '📋 暂无监控地址';
        }
        let result = `📋 监控地址列表 (共${data.total}个):\n\n`;
        data.wallets.forEach((wallet, index) => {
            result += `${index + 1}. ${wallet.name}\n`;
            result += `   地址: ${wallet.wallet}\n`;
            result += `   层级: ${wallet.nodeInfo?.lv || 'N/A'}\n`;
            result += `   上级: ${wallet.nodeInfo?.refer || '无'}\n\n`;
        });
        return result.trim();
    }
    formatQueryResult(data) {
        if (data.wallet) {
            // 单个钱包查询结果
            return `📋 钱包信息:
地址: ${data.wallet}
名称: ${data.name}
层级: ${data.nodeInfo?.lv || 'N/A'}
上级: ${data.nodeInfo?.refer || '无'}
ID: ${data.nodeInfo?.id || 'N/A'}`;
        }
        else {
            // 所有钱包查询结果
            return this.formatListResult(data);
        }
    }
    formatStatsResult(data) {
        return `数据库前缀: ${data.prefix}
监控地址总数: ${data.totalWallets}
内存缓存地址数: ${data.monitoredAddresses}
最新区块: ${data.lastProcessedBlock}
运行时间: ${data.uptime}
处理区块数: ${data.stats.processedBlocks}
发现交易数: ${data.stats.foundTransactions}
发送通知数: ${data.stats.sentNotifications}
新钱包数: ${data.stats.newWalletsAdded}`;
    }
    async checkAndGetWalletMonitor(chatId) {
        try {
            // 尝试字符串和数字两种格式
            let walletMonitor = this.chatIdMap.get(String(chatId));
            if (!walletMonitor && typeof chatId === 'number') {
                walletMonitor = this.chatIdMap.get(chatId.toString());
            }
            if (!walletMonitor) {
                console.error(`❌ 找不到对应的钱包监控器: chatId=${chatId} (类型: ${typeof chatId})`);
                console.error(`📋 当前注册的chatId:`, Array.from(this.chatIdMap.keys()));
                try {
                    await this.bot.sendMessage(chatId, '❌ 钱包监控器未初始化');
                }
                catch (sendError) {
                    console.error('❌ 发送错误消息失败:', sendError);
                }
                return null;
            }
            return walletMonitor;
        }
        catch (error) {
            console.error('❌ checkAndGetWalletMonitor 异常:', error);
            try {
                await this.bot.sendMessage(chatId, `❌ 获取钱包监控器失败: ${error.message || '未知错误'}`);
            }
            catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError);
            }
            return null;
        }
    }
}
//
if (require.main === module) {
    (async () => {
        console.log('✅ 程序启动');
        const cengji_prefix = 'new_wallet:';
        const cengji_chatId = '-1003279159060';
        const noKey_prefix = 'wallet:';
        const noKey_chatId = '-4940120432';
        const me_prefix = 'my_wallet:';
        const me_chatId = '-1003095835033';
        const bsc_scan_url = 'https://bscscan.com/';
        const pga_scan_url = 'https://pgp.elastos.io/';
        const pga_url = 'https://pgpnode.pgachain.org';
        const pga_prefix = 'pga_wallet:';
        const pga_chatId = '-1003011943556';
        const cengji_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: true,
            redisPrefix: cengji_prefix,
            chatId: cengji_chatId,
            instanceName: 'cengji',
            scanUrl: bsc_scan_url
        });
        const noKey_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: false,
            redisPrefix: noKey_prefix,
            chatId: noKey_chatId,
            instanceName: 'noKey',
            scanUrl: bsc_scan_url
        });
        const me_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: false,
            redisPrefix: me_prefix,
            chatId: me_chatId,
            instanceName: 'me',
            scanUrl: bsc_scan_url
        });
        const pga_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: false,
            redisPrefix: pga_prefix,
            chatId: pga_chatId,
            instanceName: 'pga',
            scanUrl: pga_scan_url
        }, pga_url);
        await cengji_walletMonitor.start();
        await noKey_walletMonitor.start();
        await me_walletMonitor.start();
        await pga_walletMonitor.start();
        const map = [
            {
                chatId: cengji_chatId,
                walletMonitor: cengji_walletMonitor
            },
            {
                chatId: noKey_chatId,
                walletMonitor: noKey_walletMonitor
            },
            {
                chatId: me_chatId,
                walletMonitor: me_walletMonitor
            },
            {
                chatId: pga_chatId,
                walletMonitor: pga_walletMonitor
            }
        ];
        const app = new App_Start();
        app.init(map);
        app.start();
        process.on('SIGINT', async () => {
            console.log('✅ 程序关闭');
            await cengji_walletMonitor.stop();
            await noKey_walletMonitor.stop();
            await me_walletMonitor.stop();
            await pga_walletMonitor.stop();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            console.log('✅ 程序关闭');
            await cengji_walletMonitor.stop();
            await noKey_walletMonitor.stop();
            await me_walletMonitor.stop();
            await pga_walletMonitor.stop();
            process.exit(0);
        });
    })();
}
