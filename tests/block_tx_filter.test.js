const { ethers } = require('ethers');
require('dotenv').config();

/**
 * 区块交易过滤器功能示例
 * 用于过滤指定区块区间和指定地址的交易
 */
class BlockTransactionFilter {
    constructor(providerUrl = 'https://dragon.maiko.icu/bsc2h') {
        // 初始化以太坊提供者
        this.provider = new ethers.JsonRpcProvider(providerUrl);
        
        // 监控的地址列表
        this.watchedAddresses = new Set();
        
        // 过滤配置
        this.config = {
            minValue: ethers.parseEther('0.1'), // 最小交易金额 (ETH)
            maxValue: ethers.parseEther('1000'), // 最大交易金额 (ETH)
            includeInternal: true, // 是否包含内部交易
            includeTokenTransfers: true, // 是否包含代币转账
        };
    }

    /**
     * 添加要监控的地址
     * @param {string} address - 以太坊地址
     */
    addWatchedAddress(address) {
        if (ethers.isAddress(address)) {
            this.watchedAddresses.add(address.toLowerCase());
            console.log(`✅ 已添加监控地址: ${address}`);
        } else {
            console.error(`❌ 无效地址: ${address}`);
        }
    }

    /**
     * 移除监控地址
     * @param {string} address - 以太坊地址
     */
    removeWatchedAddress(address) {
        this.watchedAddresses.delete(address.toLowerCase());
        console.log(`🗑️ 已移除监控地址: ${address}`);
    }

    /**
     * 获取指定区块的交易
     * @param {number} blockNumber - 区块号
     * @returns {Promise<Array>} 交易列表
     */
    async getBlockTransactions(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber, true);
            if (!block || !block.transactions) {
                return [];
            }
            return block.transactions;
        } catch (error) {
            console.error(`❌ 获取区块 ${blockNumber} 失败:`, error.message);
            return [];
        }
    }

    /**
     * 检查交易是否涉及监控地址
     * @param {Object} transaction - 交易对象
     * @returns {boolean} 是否涉及监控地址
     */
    isTransactionRelevant(transaction) {
        if (!transaction) return false;

        const from = transaction.from?.toLowerCase();
        const to = transaction.to?.toLowerCase();
        
        return this.watchedAddresses.has(from) || this.watchedAddresses.has(to);
    }

    /**
     * 过滤交易
     * @param {Object} transaction - 交易对象
     * @returns {boolean} 是否通过过滤
     */
    filterTransaction(transaction) {
        if (!transaction) return false;

        // 检查交易金额
        const value = BigInt(transaction.value || '0');
        if (value < this.config.minValue || value > this.config.maxValue) {
            return false;
        }

        // 检查是否涉及监控地址
        if (!this.isTransactionRelevant(transaction)) {
            return false;
        }

        return true;
    }

    /**
     * 格式化交易信息
     * @param {Object} transaction - 交易对象
     * @returns {Object} 格式化的交易信息
     */
    formatTransaction(transaction) {
        return {
            hash: transaction.hash,
            blockNumber: transaction.blockNumber,
            from: transaction.from,
            to: transaction.to,
            value: ethers.formatEther(transaction.value || '0'),
            gasPrice: ethers.formatUnits(transaction.gasPrice || '0', 'gwei'),
            gasLimit: transaction.gasLimit?.toString(),
            timestamp: new Date(transaction.timestamp * 1000).toISOString(),
            type: transaction.type,
            status: transaction.status
        };
    }

    /**
     * 扫描指定区块区间的交易
     * @param {number} startBlock - 起始区块号
     * @param {number} endBlock - 结束区块号
     * @returns {Promise<Array>} 过滤后的交易列表
     */
    async scanBlockRange(startBlock, endBlock) {
        console.log(`🔍 开始扫描区块区间: ${startBlock} - ${endBlock}`);
        
        const relevantTransactions = [];
        const totalBlocks = endBlock - startBlock + 1;
        let processedBlocks = 0;

        this.provider.

        console.log(`✅ 扫描完成! 共找到 ${relevantTransactions.length} 笔相关交易`);
        return relevantTransactions;
    }

    /**
     * 获取最新区块号
     * @returns {Promise<number>} 最新区块号
     */
    async getLatestBlockNumber() {
        try {
            const blockNumber = await this.provider.getBlockNumber();
            console.log(`📦 当前最新区块号: ${blockNumber}`);
            return blockNumber;
        } catch (error) {
            console.error('❌ 获取最新区块号失败:', error.message);
            return 0;
        }
    }

    /**
     * 设置过滤配置
     * @param {Object} config - 配置对象
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        console.log('⚙️ 配置已更新:', this.config);
    }

    /**
     * 获取当前配置
     * @returns {Object} 当前配置
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * 获取监控地址列表
     * @returns {Array} 监控地址列表
     */
    getWatchedAddresses() {
        return Array.from(this.watchedAddresses);
    }
}

/**
 * 功能示例和测试
 */
async function runExample() {
    console.log('🚀 启动区块交易过滤器示例...\n');

    // 创建过滤器实例
    const filter = new BlockTransactionFilter();

    // 添加一些示例地址进行监控
    const exampleAddresses = [
        '0x16Ad903472621101Cd3778ee53f486878027a60D'
    ];

    console.log('📝 添加监控地址:');
    exampleAddresses.forEach(addr => filter.addWatchedAddress(addr));

    // 设置过滤配置
    filter.setConfig({
        minValue: ethers.parseEther('0.01'), // 最小 0.01 ETH
    });

    // 获取最新区块号
    const latestBlock = await filter.getLatestBlockNumber();
    
    // 扫描最近 100 个区块
    const startBlock = 63796236;
    const endBlock = 63796237;

    console.log(`\n🔍 开始扫描区块 ${startBlock} 到 ${endBlock}...\n`);

    // 执行扫描
    const relevantTransactions = await filter.scanBlockRange(startBlock, endBlock);

    // 显示结果
    console.log('\n📋 扫描结果:');
    console.log('='.repeat(80));
    
    if (relevantTransactions.length === 0) {
        console.log('❌ 未找到符合条件的交易');
    } else {
        relevantTransactions.forEach((tx, index) => {
            console.log(`\n${index + 1}. 交易哈希: ${tx.hash}`);
            console.log(`   区块号: ${tx.blockNumber}`);
            console.log(`   发送方: ${tx.from}`);
            console.log(`   接收方: ${tx.to}`);
            console.log(`   金额: ${tx.value} ETH`);
            console.log(`   时间: ${tx.timestamp}`);
            console.log(`   Gas价格: ${tx.gasPrice} Gwei`);
        });
    }

    console.log('\n📊 统计信息:');
    console.log(`- 监控地址数量: ${filter.getWatchedAddresses().length}`);
    console.log(`- 扫描区块数量: ${endBlock - startBlock + 1}`);
    console.log(`- 找到相关交易: ${relevantTransactions.length}`);
    console.log(`- 平均每区块交易数: ${(relevantTransactions.length / (endBlock - startBlock + 1)).toFixed(2)}`);

    console.log('\n✅ 示例运行完成!');
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
    runExample().catch(console.error);
}

module.exports = BlockTransactionFilter;
