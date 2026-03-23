// @ts-nocheck
const RefRedis = require('../db/redis');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

/**
 * 钱包监控处理器
 * 支持交互式命令，提供add、del、query命令
 */
class Handle {
    constructor() {
        // chatid到数据库前缀的映射
        this.CHATID_PREFIX_MAP = {
            '-4940120432': 'wallet:',
            '-4904614816': 'new_wallet:',
        };
        
        // Redis连接配置
        this.redisConfig = {
            url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
        };
        
        // 当前活跃的Redis连接
        this.activeConnections = new Map();
        
        // 初始化Telegram Bot
        this.bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
        this.setupCommands();
    }

    /**
     * 设置交互式命令
     */
    setupCommands() {
        // add命令 - 添加监控地址
        this.bot.onText(/\/add (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const args = match[1].split(' ');
            
            if (args.length < 2) {
                this.bot.sendMessage(chatId, '❌ 用法: /add <钱包地址> <钱包名称> [上级地址]');
                return;
            }
            
            const [wallet, name, refer = ''] = args;
            const result = await this.add(chatId, wallet, name, refer);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `✅ ${result.message}`);
            } else {
                this.bot.sendMessage(chatId, `❌ ${result.message}`);
            }
        });

        // del命令 - 删除监控地址
        this.bot.onText(/\/del (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const wallet = match[1].trim();
            
            if (!wallet) {
                this.bot.sendMessage(chatId, '❌ 用法: /del <钱包地址>');
                return;
            }
            
            const result = await this.del(chatId, wallet);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `✅ ${result.message}`);
            } else {
                this.bot.sendMessage(chatId, `❌ ${result.message}`);
            }
        });

        // query命令 - 查询监控地址
        this.bot.onText(/\/query(.*)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const wallet = match[1].trim();
            
            const result = await this.query(chatId, wallet);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${this.formatQueryResult(result.data)}`);
            } else {
                this.bot.sendMessage(chatId, `❌ ${result.message}`);
            }
        });

        // list命令 - 列出所有监控地址
        this.bot.onText(/\/list/, async (msg) => {
            const chatId = msg.chat.id;
            const result = await this.query(chatId);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `✅ ${result.message}\n\n${this.formatQueryResult(result.data)}`);
            } else {
                this.bot.sendMessage(chatId, `❌ ${result.message}`);
            }
        });

        // stats命令 - 获取统计信息
        this.bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            const result = await this.getStats(chatId);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `📊 统计信息:\n\n${this.formatStatsResult(result.data)}`);
            } else {
                this.bot.sendMessage(chatId, `❌ ${result.message}`);
            }
        });

        // help命令 - 显示帮助信息
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const helpText = `
🤖 钱包监控命令帮助

/add <钱包地址> <钱包名称> [上级地址] - 添加监控地址
/del <钱包地址> - 删除监控地址
/query [钱包地址] - 查询监控地址（不提供地址则查询所有）
/list - 列出所有监控地址
/stats - 获取统计信息
/help - 显示帮助信息

示例:
/add 0x1234... WalletName
/add 0x1234... WalletName 0x5678...
/del 0x1234...
/query 0x1234...
/query
/list
/stats
            `;
            this.bot.sendMessage(chatId, helpText);
        });

        console.log('✅ 交互式命令已设置完成');
    }

    /**
     * 获取指定chatid的Redis连接
     * @param {string} chatId - 聊天ID
     * @returns {Promise<RefRedis>} Redis连接实例
     */
    async getRedisConnection(chatId) {
        if (this.activeConnections.has(chatId)) {
            return this.activeConnections.get(chatId);
        }

        const prefix = this.CHATID_PREFIX_MAP[chatId] || 'wallet:';
        const redis = new RefRedis(this.redisConfig, prefix);
        
        try {
            await redis.connect();
            this.activeConnections.set(chatId, redis);
            console.log(`✅ 已连接到Redis (chatId: ${chatId}, prefix: ${prefix})`);
            return redis;
        } catch (error) {
            console.error(`❌ 连接Redis失败 (chatId: ${chatId}):`, error.message);
            throw error;
        }
    }

    /**
     * 添加监控地址
     * @param {string} chatId - 聊天ID
     * @param {string} wallet - 钱包地址
     * @param {string} name - 钱包名称
     * @param {string} refer - 上级地址（可选）
     * @returns {Promise<Object>} 操作结果
     */
    async add(chatId, wallet, name, refer = '') {
        try {
            if (!wallet || !name) {
                return {
                    success: false,
                    message: '钱包地址和名称不能为空',
                    data: null
                };
            }

            const redis = await this.getRedisConnection(chatId);
            
            // 检查地址是否已存在
            const exists = await redis.existsWallet(wallet);
            if (exists) {
                return {
                    success: false,
                    message: `地址已存在: ${wallet}`,
                    data: null
                };
            }

            // 添加钱包
            await redis.addNodeLite(wallet, name, refer);
            
            // 获取添加后的信息
            const nodeInfo = await redis.getNodeInfo(wallet);
            
            return {
                success: true,
                message: `成功添加钱包: ${name} (${wallet})`,
                data: {
                    chatId,
                    wallet,
                    name,
                    refer,
                    nodeInfo
                }
            };

        } catch (error) {
            console.error(`❌ 添加钱包失败 (chatId: ${chatId}):`, error.message);
            return {
                success: false,
                message: `添加失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 删除监控地址
     * @param {string} chatId - 聊天ID
     * @param {string} wallet - 钱包地址
     * @returns {Promise<Object>} 操作结果
     */
    async del(chatId, wallet) {
        try {
            if (!wallet) {
                return {
                    success: false,
                    message: '钱包地址不能为空',
                    data: null
                };
            }

            const redis = await this.getRedisConnection(chatId);
            
            // 检查地址是否存在
            const exists = await redis.existsWallet(wallet);
            if (!exists) {
                return {
                    success: false,
                    message: `地址不存在: ${wallet}`,
                    data: null
                };
            }

            // 获取删除前的信息
            const nodeInfo = await redis.getNodeInfo(wallet);
            
            // 删除钱包
            await redis.removeNode(wallet);
            
            return {
                success: true,
                message: `成功删除钱包: ${wallet}`,
                data: {
                    chatId,
                    wallet,
                    deletedInfo: nodeInfo
                }
            };

        } catch (error) {
            console.error(`❌ 删除钱包失败 (chatId: ${chatId}):`, error.message);
            return {
                success: false,
                message: `删除失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 查询监控地址
     * @param {string} chatId - 聊天ID
     * @param {string} wallet - 钱包地址（可选，不提供则查询所有）
     * @returns {Promise<Object>} 查询结果
     */
    async query(chatId, wallet = null) {
        try {
            const redis = await this.getRedisConnection(chatId);
            
            if (wallet) {
                // 查询单个钱包
                const exists = await redis.existsWallet(wallet);
                if (!exists) {
                    return {
                        success: false,
                        message: `地址不存在: ${wallet}`,
                        data: null
                    };
                }

                const nodeInfo = await redis.getNodeInfo(wallet);
                const name = await redis.getNameByWallet(wallet);
                
                return {
                    success: true,
                    message: `查询成功: ${wallet}`,
                    data: {
                        chatId,
                        wallet,
                        name,
                        nodeInfo,
                        exists: true
                    }
                };
            } else {
                // 查询所有钱包
                const wallets = await redis.getAllWallets();
                const walletList = [];
                
                for (const walletAddr of wallets) {
                    const nodeInfo = await redis.getNodeInfo(walletAddr);
                    const name = await redis.getNameByWallet(walletAddr);
                    walletList.push({
                        wallet: walletAddr,
                        name,
                        nodeInfo
                    });
                }
                
                return {
                    success: true,
                    message: `查询成功，共找到 ${walletList.length} 个钱包`,
                    data: {
                        chatId,
                        total: walletList.length,
                        wallets: walletList
                    }
                };
            }

        } catch (error) {
            console.error(`❌ 查询钱包失败 (chatId: ${chatId}):`, error.message);
            return {
                success: false,
                message: `查询失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 获取统计信息
     * @param {string} chatId - 聊天ID
     * @returns {Promise<Object>} 统计信息
     */
    async getStats(chatId) {
        try {
            const redis = await this.getRedisConnection(chatId);
            const wallets = await redis.getAllWallets();
            
            return {
                success: true,
                data: {
                    chatId,
                    prefix: this.CHATID_PREFIX_MAP[chatId] || 'wallet:',
                    totalWallets: wallets.length,
                    wallets: wallets
                }
            };
        } catch (error) {
            console.error(`❌ 获取统计信息失败 (chatId: ${chatId}):`, error.message);
            return {
                success: false,
                message: `获取统计信息失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 格式化查询结果
     * @param {Object} data - 查询数据
     * @returns {string} 格式化后的字符串
     */
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
            if (data.total === 0) {
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
    }

    /**
     * 格式化统计结果
     * @param {Object} data - 统计数据
     * @returns {string} 格式化后的字符串
     */
    formatStatsResult(data) {
        return `聊天ID: ${data.chatId}
数据库前缀: ${data.prefix}
监控地址总数: ${data.totalWallets}
地址列表: ${data.wallets.length > 0 ? data.wallets.join(', ') : '无'}`;
    }

    /**
     * 清理指定chatid的Redis连接
     * @param {string} chatId - 聊天ID
     */
    async cleanupConnection(chatId) {
        try {
            if (this.activeConnections.has(chatId)) {
                const redis = this.activeConnections.get(chatId);
                await redis.disconnect();
                this.activeConnections.delete(chatId);
                console.log(`✅ 已清理Redis连接 (chatId: ${chatId})`);
            }
        } catch (error) {
            console.error(`❌ 清理Redis连接失败 (chatId: ${chatId}):`, error.message);
        }
    }

    /**
     * 清理所有Redis连接
     */
    async cleanupAllConnections() {
        try {
            const chatIds = Array.from(this.activeConnections.keys());
            for (const chatId of chatIds) {
                await this.cleanupConnection(chatId);
            }
            console.log('✅ 已清理所有Redis连接');
        } catch (error) {
            console.error('❌ 清理所有Redis连接失败:', error.message);
        }
    }
}

module.exports = Handle;

// 如果直接运行此文件，则启动交互式命令处理器
if (require.main === module) {
    console.log('🚀 启动钱包监控交互式命令处理器...');
    console.log('📱 支持的命令:');
    console.log('  /add <钱包地址> <钱包名称> [上级地址] - 添加监控地址');
    console.log('  /del <钱包地址> - 删除监控地址');
    console.log('  /query [钱包地址] - 查询监控地址');
    console.log('  /list - 列出所有监控地址');
    console.log('  /stats - 获取统计信息');
    console.log('  /help - 显示帮助信息');
    console.log('\n💡 使用Telegram机器人发送命令即可开始使用!');
    
    const handle = new Handle();
    
    // 优雅关闭处理
    process.on('SIGINT', async () => {
        console.log('\n🛑 收到停止信号...');
        await handle.cleanupAllConnections();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\n🛑 收到终止信号...');
        await handle.cleanupAllConnections();
        process.exit(0);
    });
}
