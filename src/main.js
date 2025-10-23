const { ethers } = require('ethers');
const RefRedis = require('./db/redis');
const TgBot = require('./notify/bot');
const BlockScanner = require('./process/scan');
const MessageTemplates = require('./notify/text');
const { getIsCexDict } = require('./utils');
const Logger = require('./utils/logger');
require('dotenv').config();

/**
 * 钱包监控主程序
 * 从数据库获取监控地址，监控最新区块，推送交易通知
 */
class WalletMonitor {
    constructor(options = {}) {
        // 配置
        this.config = {
            chatId: options.chatId || process.env.CHAT_ID || '-4940120432',
            threadId: options.threadId || process.env.THREAD_ID || null,
            scanInterval: parseInt(options.scanInterval || process.env.SCAN_INTERVAL) || 3000, // 3秒扫描一次
            batchSize: parseInt(options.batchSize || process.env.BATCH_SIZE) || 5, // 每次处理5个区块
            minValue: ethers.parseEther(options.minValue || process.env.MIN_VALUE || '0.000'), // 最小交易金额
            enableNewWalletDetection: options.enableNewWalletDetection !== false, // 新钱包识别开关，默认开启
            redisPrefix: options.redisPrefix || 'wallet:', // 数据库前缀，用于数据隔离
        };

        this.config.baseToken = [
            {
                "token": "0x55d398326f99059ff775485246999027b3197955",
                "symbol": "USDT",
                "decimals": 18,
                "minValue": 1000.0
            },
            {
                "token": "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
                "symbol": "WBNB",
                "decimals": 18,
                "minValue": 1.0
            }
        ]
        
        // 特殊钱包过滤配置
        this.config.baseTokenArray = this.config.baseToken.map(item => item.token)
        this.config.baseTokenMap = new Map(this.config.baseToken.map(item => [item.token, item]))
        
        // 初始化组件
        this.redis = new RefRedis({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' }, this.config.redisPrefix);
        this.bot = new TgBot();

        // 初始化日志器
        this.logger = new Logger(options.instanceName);
        this.scanner = new BlockScanner(process.env.RPC_URL || 'https://dragon.maiko.icu/bsc2h', this.logger);
        
        // 状态
        this.isRunning = false;
        this.lastProcessedBlock = 0;
        this.startTime = Date.now();
        this.stats = {
            processedBlocks: 0,
            foundTransactions: 0,
            sentNotifications: 0,
            newWalletsAdded: 0
        };
        
        // 监控地址缓存
        this.monitoredAddresses = new Set();
        this.addressNames = new Map(); // 地址 -> 名称映射
        
    }

    /**
     * 启动监控
     */
    async start() {
        try {
            this.logger.log(`🚀 启动钱包监控系统... ${this.config.enableNewWalletDetection ? '✅ 已启用' : '❌ 已禁用'}`);
            
            // 初始化数据库连接
            await this.redis.connect();
            this.logger.success('Redis连接成功');
            
            // 初始化地址昵称映射
            MessageTemplates.initAddressNicknames();
            
            // 加载监控地址
            await this.loadMonitoredAddresses();
            this.logger.success(`已加载 ${this.monitoredAddresses.size} 个监控地址`);
            
            // 获取最新区块号
            this.lastProcessedBlock = await this.scanner.getLatestBlockNumber();
            this.logger.success(`当前最新区块: ${this.lastProcessedBlock}`);
            
            // 设置扫描器配置
            this.scanner.setConfig({
                minValue: this.config.minValue,
                maxValue: ethers.parseEther('10000'),
                delay: 100
            });
            
            // 添加监控地址到扫描器
            this.monitoredAddresses.forEach(address => {
                this.scanner.addWatchedAddress(address);
            });
            
            // 启动监控循环
            this.isRunning = true;
            this.startMonitoringLoop();
            
            this.logger.success('钱包监控系统启动成功');
            this.logger.log(`🔧 新钱包识别: ${this.config.enableNewWalletDetection ? '✅ 已启用' : '❌ 已禁用'}`);
            this.logger.log(`🗄️ 数据库前缀: ${this.config.redisPrefix}`);
            this.logger.log(`💬 聊天ID: ${this.config.chatId}`);
            
        } catch (error) {
            this.logger.error('启动失败:', error.message);
            await this.sendErrorNotification(error);
            process.exit(1);
        }
    }

    /**
     * 停止监控
     */
    async stop() {
        this.logger.log('🛑 正在停止钱包监控系统...');
        this.isRunning = false;
        
        // 发送停止通知
        const uptime = this.getUptime();
        await this.sendSystemStatus({
            ...this.stats,
            uptime,
            status: 'stopped'
        });
        
        // 断开Redis连接
        try {
            await this.redis.disconnect();
        } catch (error) {
            this.logger.warn('⚠️ 断开Redis连接时出错:', error.message)
        }
        
        this.logger.log('✅ 钱包监控系统已停止')
    }

    /**
     * 从数据库加载监控地址
     */
    async loadMonitoredAddresses() {
        try {
            const wallets = await this.redis.getAllWallets();
            
            this.monitoredAddresses.clear();
            this.addressNames.clear();
            
            for (const wallet of wallets) {
                this.monitoredAddresses.add(wallet);
                
                // 获取地址对应的名称
                const name = await this.redis.getNameByWallet(wallet);
                if (name) {
                    // 使用小写地址作为key，确保与text.js中的查找逻辑一致
                    this.addressNames.set(wallet.toLowerCase(), name);
                }
            }
            
            this.logger.log(`📋 已加载监控地址: ${Array.from(this.monitoredAddresses).join(', ')}`)
            
        } catch (error) {
            this.logger.error('❌ 加载监控地址失败:', error.message)
            throw error;
        }
    }

    /**
     * 启动监控循环
     */
    async startMonitoringLoop() {
        while (this.isRunning) {
            try {
                await this.scanNewBlocks();
                await this.sleep(this.config.scanInterval);
            } catch (error) {
                this.logger.error('监控循环错误:', error.message);
                await this.sendErrorNotification(error);
                await this.sleep(5000); // 错误后等待5秒再继续
            }
        }
    }

    /**
     * 扫描新区块
     */
    async scanNewBlocks() {
        try {
            const currentBlock = await this.scanner.getLatestBlockNumber();
            
            if (currentBlock <= this.lastProcessedBlock) {
                return; // 没有新区块
            }
            
            const startBlock = this.lastProcessedBlock + 1;
            const totalBlocksToProcess = currentBlock - this.lastProcessedBlock;
            
            // 如果落后太多区块，使用更大的批次大小
            let batchSize = this.config.batchSize;
            if (totalBlocksToProcess > 20) {
                batchSize = Math.min(20, totalBlocksToProcess); // 最多并行处理20个区块
                this.logger.log(`⚡ 检测到落后 ${totalBlocksToProcess} 个区块，使用并行处理 (批次大小: ${batchSize})`);
            }
            
            const endBlock = Math.min(currentBlock, startBlock + batchSize - 1);
            
            this.logger.log(`🔍 扫描区块 ${startBlock} - ${endBlock} (共 ${endBlock - startBlock + 1} 个区块)`);
            
            // 并行扫描区块
            const results = await this.scanner.scanBlockRangeParallel(startBlock, endBlock);
            
            if (results.length > 0) {
                this.logger.log(`📊 找到 ${results.length} 笔相关交易`);
                await this.processTransactions(results);
            }
            
            // 更新状态
            this.lastProcessedBlock = endBlock;
            this.stats.processedBlocks += (endBlock - startBlock + 1);
            this.stats.foundTransactions += results.length;
            
        } catch (error) {
            this.logger.error('扫描新区块失败:', error.message);
            throw error;
        }
    }

    /**
     * 处理交易结果
     */
    async processTransactions(transactions) {
        for (const tx of transactions) {
            try {
                // 使用MessageTemplates分析交易
                const analysis = MessageTemplates.analyzeTransaction(tx, this.monitoredAddresses, this.addressNames);
                
                if (analysis.hasActivity) {
                    await this.sendTransactionNotification(tx, analysis);
                    
                    // 检查是否为新钱包（如果开关开启）
                    if (this.config.enableNewWalletDetection) {
                        this.logger.log('检查新钱包标记')
                        await this.checkNewWallet(tx);
                    }
                }
                
            } catch (error) {
                this.logger.error('❌ 处理交易失败:', error.message)
            }
        }
    }

    /**
     * 发送交易通知
     * @param {Object} tx - 交易数据
     * @param {Object} analysis - 分析结果
     */
    async sendTransactionNotification(tx, analysis) {
        const message = MessageTemplates.tokenTransfer({
            hash: tx.hash,
            walletName: analysis.walletName,
            walletAddress: analysis.walletAddress,
            received: analysis.received,
            sent: analysis.sent
        });
        
        await this.bot.sendHtml(this.config.chatId, message, this.config.threadId);
        this.stats.sentNotifications++;
        
        this.logger.log(`📤 已发送交易通知: ${analysis.walletName} (${analysis.received.length}接收, ${analysis.sent.length}发送)`)
    }

    /**
     * 检查新钱包
     */
    async checkNewWallet(tx) {
        try {
            // 检查BNB转账中的新钱包
            await this.checkNewWalletFromBNB(tx);
            
            // 检查ERC20转账中的新钱包
            await this.checkNewWalletFromERC20(tx);
            
        } catch (error) {
            this.logger.error('❌ 检查新钱包失败:', error.message)
        }
    }
    
    /**
     * 检查BNB转账中的新钱包
     * 条件1: 有且仅有BNB的转账
     */
    async checkNewWalletFromBNB(tx) {
        const toAddress = tx.to.toLowerCase();
        
        // 检查接收方是否为新钱包
        if (!this.monitoredAddresses.has(toAddress)) {
            // 条件1: 有且仅有BNB的转账
            const hasBNBTransfer = tx.bnbChange && (tx.bnbChange.from !== '0' || tx.bnbChange.to !== '0');
            const hasNoERC20Transfer = !tx.erc20Changes || tx.erc20Changes.length === 0;
            const minValue = tx.bnbChange.to >= this.config.minValue;

            this.logger.log(`minValue: ${minValue}  --  toAddress: ${toAddress}  --  tx.bnbChange.to: ${tx.bnbChange.to.toString()}`)

            if (hasBNBTransfer && hasNoERC20Transfer && minValue) {
                // 检查是否为EOA地址（不是合约地址）
                const isEOA = await this.scanner.processor.isEOA(toAddress);
                
                if (isEOA) {
                    await this.addNewWallet(toAddress, tx.from.toLowerCase());
                } else {
                    this.logger.log(`⚠️ 跳过合约地址: ${toAddress} (不是EOA)`)
                }
            } else {
                this.logger.log(`⚠️ 跳过复杂交易: ${toAddress} (不是纯BNB转账)`)
            }
        }
    }
    
    /**
     * 检查ERC20转账中的新钱包
     * 条件2: 有且仅有token转账（仅涉及一种token）
     */
    async checkNewWalletFromERC20(tx) {
        if (tx.erc20Changes && tx.erc20Changes.length > 0) {
            // 条件2: 有且仅有token转账（仅涉及一种token）
            const hasNoBNBTransfer = !tx.bnbChange || (tx.bnbChange.from === '0' && tx.bnbChange.to === '0');
            const hasOnlyOneTokenType = this.hasOnlyOneTokenType(tx.erc20Changes);
            
            if (hasNoBNBTransfer && hasOnlyOneTokenType) {
                for (const change of tx.erc20Changes) {
                    const fromAddress = change.from.toLowerCase();
                    const toAddress = change.to.toLowerCase();
                    const tokenAddress = change.tokenAddress.toLowerCase();
                    const minValue = this.config.baseTokenMap.get(tokenAddress)?.minValue

                    // 过滤未达到最小值的交易，未达最小值的去掉不进行后续检查
                    const isMinValue = minValue && change.formattedValue >= minValue
                    this.logger.log(`isMinValue: ${isMinValue}  --  fromAddress: ${fromAddress}  --  toAddress: ${toAddress}  --  tokenAddress: ${tokenAddress}  --  minValue: ${minValue}  --  change.formattedValue: ${change.formattedValue}`)
                    
                    // 只检查涉及监控地址的ERC20转账
                    if (isMinValue && this.monitoredAddresses.has(fromAddress) && !this.monitoredAddresses.has(toAddress)) {
                        // 检查接收方是否为EOA地址
                        const isEOA = await this.scanner.processor.isEOA(toAddress);
                        
                        if (isEOA) {
                            await this.addNewWallet(toAddress, fromAddress);
                        } else {
                            this.logger.log(`⚠️ 跳过合约地址: ${toAddress} (不是EOA)`)
                        }
                    }
                }
            } else {
                this.logger.log(`⚠️ 跳过复杂交易: 不是纯token转账或涉及多种token`)
            }
        }
    }
    
    /**
     * 检查是否只涉及一种token类型
     * @param {Array} erc20Changes - ERC20变化数组
     * @returns {boolean} 是否只涉及一种token
     */
    hasOnlyOneTokenType(erc20Changes) {
        if (!erc20Changes || erc20Changes.length === 0) {
            return false;
        }
        
        // 获取所有涉及的token地址
        const tokenAddresses = new Set();
        for (const change of erc20Changes) {
            tokenAddresses.add(change.tokenAddress.toLowerCase());
        }
        
        // 只涉及一种token类型
        return tokenAddresses.size === 1;
    }
    
    /**
     * 添加新钱包到监控列表
     */
    async addNewWallet(walletAddress, fromAddress) {
        try {
            // 检查地址是否已存在
            const addressExists = await this.redis.existsWallet(walletAddress);
            
            if (!addressExists) {
                // 获取发送方名称
                const fromName = this.addressNames.get(fromAddress) || 'Unknown';

                // getIsCexDict
                const isCex = await getIsCexDict(walletAddress);
                if (isCex) {
                    this.logger.log(`⚠️ 跳过CEX钱包: ${walletAddress}`)
                    return;
                }
                
                // 添加新钱包到数据库
                // await this.redis.addNodeLite(walletAddress, fromName, fromAddress);
                
                // 更新本地缓存
                this.monitoredAddresses.add(walletAddress);
                this.addressNames.set(walletAddress.toLowerCase(), fromName);
                this.scanner.addWatchedAddress(walletAddress);
                
                // 发送新钱包通知
                const message = MessageTemplates.newWallet({
                    wallet: walletAddress,
                    name: fromName,
                    refer: fromAddress,
                    referName: fromName
                });
                
                await this.bot.sendHtml(this.config.chatId, message, this.config.threadId);
                this.stats.sentNotifications++;
                this.stats.newWalletsAdded++;
                
                this.logger.log(`🆕 发现新钱包: ${walletAddress} (上级: ${fromName})`);
            } else {
                this.logger.log(`ℹ️ 地址已存在，跳过添加: ${walletAddress}`);
            }
        } catch (error) {
            this.logger.error(`❌ 添加新钱包失败 ${walletAddress}:`, error.message)
        }
    }

    /**
     * 发送错误通知
     */
    async sendErrorNotification(error) {
        try {
            const message = MessageTemplates.error({
                error: error.message,
                blockNumber: this.lastProcessedBlock,
                timestamp: new Date().toISOString()
            });
            
            await this.bot.sendHtml(this.config.chatId, message, this.config.threadId);
        } catch (sendError) {
            this.logger.error('❌ 发送错误通知失败:', sendError.message)
        }
    }

    /**
     * 发送系统状态通知
     */
    async sendSystemStatus(data) {
        try {
            const message = MessageTemplates.systemStatus({
                monitoredWallets: this.monitoredAddresses.size,
                latestBlock: this.lastProcessedBlock,
                processedBlocks: this.stats.processedBlocks,
                foundTransactions: this.stats.foundTransactions,
                uptime: data.uptime || this.getUptime()
            });
            
            await this.bot.sendHtml(this.config.chatId, message, this.config.threadId);
        } catch (error) {
            this.logger.error('❌ 发送系统状态失败:', error.message)
        }
    }

    /**
     * 获取运行时间
     */
    getUptime() {
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * 睡眠函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            monitoredAddresses: this.monitoredAddresses.size,
            lastProcessedBlock: this.lastProcessedBlock,
            uptime: this.getUptime()
        };
    }

/*******************************************************************************************
 ************************************** 管理接口 **************************************
 *******************************************************************************************/

    /**
     * 添加监控地址
     * @param {string} wallet - 钱包地址
     * @param {string} name - 钱包名称
     * @returns {Promise<Object>} 操作结果
     */
    async addWallet(wallet, name) {
        try {
            if (!wallet || !name) {
                return {
                    success: false,
                    message: '钱包地址和名称不能为空',
                    data: null
                };
            }

            // 检查地址是否已存在
            const exists = await this.redis.existsWallet(wallet);
            if (exists) {
                return {
                    success: false,
                    message: `地址已存在: ${wallet}`,
                    data: null
                };
            }

            // 手动添加的地址都是level为0的最顶级地址，refer为空
            await this.redis.addNodeLite(wallet, name, '');
            
            // 更新内存缓存
            this.monitoredAddresses.add(wallet);
            this.addressNames.set(wallet.toLowerCase(), name);
            this.scanner.addWatchedAddress(wallet);
            
            // 获取添加后的信息
            const nodeInfo = await this.redis.getNodeInfo(wallet);
            
            return {
                success: true,
                message: `成功添加钱包: ${name} (${wallet}) - Level 0`,
                data: {
                    chatId: this.config.chatId,
                    wallet,
                    name,
                    nodeInfo
                }
            };

        } catch (error) {
            this.logger.error(`❌ 添加钱包失败:`, error.message)
            return {
                success: false,
                message: `添加失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 删除监控地址
     * @param {string} wallet - 钱包地址
     * @returns {Promise<Object>} 操作结果
     */
    async removeWallet(wallet) {
        try {
            if (!wallet) {
                return {
                    success: false,
                    message: '钱包地址不能为空',
                    data: null
                };
            }

            // 检查地址是否存在
            const exists = await this.redis.existsWallet(wallet);
            if (!exists) {
                return {
                    success: false,
                    message: `地址不存在: ${wallet}`,
                    data: null
                };
            }

            // 获取删除前的信息
            const nodeInfo = await this.redis.getNodeInfo(wallet);
            
            // 从数据库删除钱包
            await this.redis.removeNode(wallet);
            
            // 从内存缓存中删除
            this.monitoredAddresses.delete(wallet);
            this.addressNames.delete(wallet.toLowerCase());
            this.scanner.removeWatchedAddress(wallet);
            
            return {
                success: true,
                message: `成功删除钱包: ${wallet}`,
                data: {
                    wallet,
                    deletedInfo: nodeInfo
                }
            };

        } catch (error) {
            this.logger.error(`❌ 删除钱包失败:`, error.message)
            return {
                success: false,
                message: `删除失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 查询监控地址
     * @param {string} wallet - 钱包地址（可选，不提供则查询所有）
     * @returns {Promise<Object>} 查询结果
     */
    async queryWallet(wallet = null) {
        try {
            if (wallet) {
                // 查询单个钱包
                const exists = await this.redis.existsWallet(wallet);
                if (!exists) {
                    return {
                        success: false,
                        message: `地址不存在: ${wallet}`,
                        data: null
                    };
                }

                const nodeInfo = await this.redis.getNodeInfo(wallet);
                const name = await this.redis.getNameByWallet(wallet);
                
                return {
                    success: true,
                    message: `查询成功: ${wallet}`,
                    data: {
                        wallet,
                        name,
                        nodeInfo,
                        exists: true
                    }
                };
            } else {
                // 查询所有钱包
                const wallets = await this.redis.getAllWallets();
                const walletList = [];
                
                for (const walletAddr of wallets) {
                    const nodeInfo = await this.redis.getNodeInfo(walletAddr);
                    const name = await this.redis.getNameByWallet(walletAddr);
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
                        total: walletList.length,
                        wallets: walletList
                    }
                };
            }

        } catch (error) {
            this.logger.error(`❌ 查询钱包失败:`, error.message)
            return {
                success: false,
                message: `查询失败: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * 获取统计信息
     * @returns {Promise<Object>} 统计信息
     */
    async getStatsInfo() {
        try {
            const wallets = await this.redis.getAllWallets();
            
            return {
                success: true,
                data: {
                    prefix: this.config.redisPrefix,
                    totalWallets: wallets.length,
                    monitoredAddresses: this.monitoredAddresses.size,
                    lastProcessedBlock: this.lastProcessedBlock,
                    uptime: this.getUptime(),
                    stats: this.getStats()
                }
            };
        } catch (error) {
            this.logger.error(`❌ 获取统计信息失败:`, error.message)
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
内存缓存地址数: ${data.monitoredAddresses}
最新区块: ${data.lastProcessedBlock}
运行时间: ${data.uptime}
处理区块数: ${data.stats.processedBlocks}
发现交易数: ${data.stats.foundTransactions}
发送通知数: ${data.stats.sentNotifications}
新钱包数: ${data.stats.newWalletsAdded}`;
    }
}

// 主程序入口
async function main() {
    // 从命令行参数或环境变量获取新钱包识别开关
    const args = process.argv.slice(2);
    const disableNewWalletDetection = args.includes('--disable-new-wallet') || 
                                     process.env.ENABLE_NEW_WALLET_DETECTION === 'false';
    
    const monitor = new WalletMonitor({
        enableNewWalletDetection: !disableNewWalletDetection,
        redisPrefix: process.env.REDIS_PREFIX || 'wallet:'
    });
    
    // 优雅关闭处理
    process.on('SIGINT', async () => {
        console.log('\n🛑 收到停止信号...');
        await monitor.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\n🛑 收到终止信号...');
        await monitor.stop();
        process.exit(0);
    });
    
    // 启动监控
    await monitor.start();
}

// 如果直接运行此文件，则启动主程序
if (require.main === module) {
    main().catch(console.error);
}

module.exports = WalletMonitor;
