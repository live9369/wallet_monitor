const WalletMonitor = require('./main');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config()

const token = process.env.BOT_TOKEN;

// interaction
class App_Start {
    constructor() {
        this.bot = new TelegramBot(token, {polling: true});
        this.chatIdMap = new Map();   // chatId --> WalletMonitor
    }

    init(_map = []) {
        if (_map.length === 0) process.exit(1);
        for (const item of _map) {
            this.chatIdMap.set(item.chatId, item.walletMonitor);
        }
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

        // list命令 - 列出所有监控地址
        this.bot.onText(/\/list/, async (msg) => await this.handleList(msg));

        // stats命令 - 获取统计信息
        this.bot.onText(/\/stats/, async (msg) => await this.handleStats(msg));

        // help命令 - 显示帮助信息
        this.bot.onText(/\/help/, async (msg) => await this.handleHelp(msg));
    }

/***********************************************************************************
 ************************************ handle ***************************************
 ***********************************************************************************/
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
        if (!walletMonitor) return;

        const result = await walletMonitor.addWallet(address, name);
        if (result.success) {
            await this.bot.sendMessage(chatId, `✅ ${result.message}`);
        } else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }

    async handleDel(msg, match) {
        const chatId = msg.chat.id;
        const address = match[1].trim();
        
        if (!this.checkAddressFormat(address)) {
            await this.bot.sendMessage(chatId, '❌ 钱包地址格式错误');
            return;
        }
        
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor) return;

        const result = await walletMonitor.removeWallet(address);
        if (result.success) {
            await this.bot.sendMessage(chatId, `✅ ${result.message}`);
        } else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
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
        if (!walletMonitor) return;

        const result = await walletMonitor.queryWallet(address);
        if (result.success) {
            const formattedData = this.formatQueryResult(result.data);
            await this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${formattedData}`);
        } else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }

    async handleList(msg) {
        const chatId = msg.chat.id;
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor) return;
        
        const result = await walletMonitor.queryWallet();
        if (result.success) {
            const formattedData = this.formatListResult(result.data);
            await this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${formattedData}`);
        } else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }

    async handleStats(msg) {
        const chatId = msg.chat.id;
        const walletMonitor = await this.checkAndGetWalletMonitor(chatId);
        if (!walletMonitor) return;

        const result = await walletMonitor.getStatsInfo();
        if (result.success) {
            const formattedData = this.formatStatsResult(result.data);
            await this.bot.sendMessage(chatId, `📊 统计信息:\n\n${formattedData}`);
        } else {
            await this.bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    }

    async handleHelp(msg) {
        const chatId = msg.chat.id;
        await this.bot.sendMessage(chatId, `
🤖 钱包监控命令帮助

/add <钱包地址> <钱包名称> - 添加监控地址（Level 0）
/del <钱包地址> - 删除监控地址
/query [钱包地址] - 查询监控地址（不提供地址则查询所有）
/list - 列出所有监控地址
/stats - 获取统计信息
/help - 显示帮助信息

示例:
/add 0x1234... WalletName
/del 0x1234...
/query 0x1234...
/query
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
        } else {
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
        const walletMonitor = this.chatIdMap.get(String(chatId));
        if (!walletMonitor) {
            await this.bot.sendMessage(chatId, '❌ 钱包监控器未初始化');
            return null;
        }
        return walletMonitor;
    }
}

//
if (require.main === module) {
    (async () => {
        console.log('✅ 程序启动');

        const cengji_prefix = 'new_wallet:';
        const cengji_chatId = '-4904614816';
        const noKey_prefix = 'wallet:';
        const noKey_chatId = '-4940120432';
        const me_prefix = 'my_wallet:';
        const me_chatId = '-4791455791';

        const cengji_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: true,
            redisPrefix: cengji_prefix,
            chatId: cengji_chatId
        });
        
        const noKey_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: false,
            redisPrefix: noKey_prefix,
            chatId: noKey_chatId
        });
        
        const me_walletMonitor = new WalletMonitor({
            enableNewWalletDetection: false,
            redisPrefix: me_prefix,
            chatId: me_chatId
        });

        await cengji_walletMonitor.start();
        await noKey_walletMonitor.start();
        await me_walletMonitor.start();

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
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('✅ 程序关闭');
            await cengji_walletMonitor.stop();
            await noKey_walletMonitor.stop();
            await me_walletMonitor.stop();
            process.exit(0);
        });
    })();
}