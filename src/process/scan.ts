// @ts-nocheck
const { ethers } = require('ethers');
const TransactionProcessor = require('./process');
require('dotenv').config();

/**
 * 区块扫描器 - 扫描指定区块区间的交易并解析
 */
class BlockScanner {
    constructor(providerUrl = process.env.RPC_URL || 'https://bsc-dataseed.binance.org/', logger) {
        this.provider = new ethers.JsonRpcProvider(providerUrl);
        this.logger = logger;
        this.processor = new TransactionProcessor(this.provider, this.logger);
        
        // 监控的地址列表
        this.watchedAddresses = new Set();
        
        // 扫描配置
        this.config = {
            minValue: ethers.parseEther('0.000'), // 最小交易金额 (BNB)
            maxValue: ethers.parseEther('10000'), // 最大交易金额 (BNB)
            includeInternal: true, // 是否包含内部交易
            includeTokenTransfers: true, // 是否包含代币转账
            batchSize: 5, // 批量处理大小
            delay: 100, // 请求间隔(ms)
        };
    }

    /**
     * 添加监控地址
     * @param {string} address - 以太坊地址
     */
    addWatchedAddress(address) {
        if (ethers.isAddress(address)) {
            this.watchedAddresses.add(address.toLowerCase());
            this.logger.success(`已添加监控地址: ${address}`);
        } else {
            this.logger.error(`无效地址: ${address}`);
        }
    }

    /**
     * 移除监控地址
     * @param {string} address - 以太坊地址
     */
    removeWatchedAddress(address) {
        this.watchedAddresses.delete(address.toLowerCase());
        this.logger.log(`🗑️ 已移除监控地址: ${address}`);
    }

    /**
     * 检查交易是否涉及监控地址
     * @param {Object} transaction - 交易对象
     * @returns {boolean} 是否涉及监控地址
     */
    isTransactionRelevant(transaction) {
        // if (!transaction) return false;

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
     * 获取指定区块的交易
     * @param {number} blockNumber - 区块号
     * @returns {Promise<Array>} 交易列表
     */
    async getBlockTransactions(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber, true);
            if (!block || !block.prefetchedTransactions) {
                return [];
            }

            // 确保区块有时间戳
            if (!block.timestamp || isNaN(block.timestamp)) {
                this.logger.warn(`⚠️ 区块 ${blockNumber} 时间戳无效，跳过`);
                return [];
            }
                        
            return block.prefetchedTransactions;
        } catch (error) {
            this.logger.error(`❌ 获取区块 ${blockNumber} 失败:`, error.message);
            return [];
        }
    }

    /**
     * 获取交易收据
     * @param {string} transactionHash - 交易哈希
     * @returns {Promise<Object>} 交易收据
     */
    async getTransactionReceipt(transactionHash) {
        try {
            return await this.provider.getTransactionReceipt(transactionHash);
        } catch (error) {
            this.logger.error(`❌ 获取交易收据失败 ${transactionHash}:`, error.message);
            return null;
        }
    }

    /**
     * 扫描指定区块区间的交易
     * @param {number} startBlock - 起始区块号
     * @param {number} endBlock - 结束区块号
     * @returns {Promise<Array>} 解析后的交易数据
     */
    async scanBlockRange(startBlock, endBlock) {
        this.logger.log(`🔍 开始扫描区块区间: ${startBlock} - ${endBlock}`);
        
        const allResults = [];
        const totalBlocks = endBlock - startBlock + 1;
        let processedBlocks = 0;

        for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
            try {
                // 获取区块交易
                const transactions = await this.getBlockTransactions(blockNumber);
                // 过滤交易
                const filteredTxs = transactions.filter(tx => this.filterTransaction(tx));
                this.logger.log(filteredTxs.length);
                
                if (filteredTxs.length > 0) {
                    this.logger.log(`📦 区块 ${blockNumber}: 找到 ${filteredTxs.length} 笔相关交易`);
                    
                    // 获取交易收据
                    const receipts = [];
                    for (const tx of filteredTxs) {
                        const receipt = await this.getTransactionReceipt(tx.hash);
                        receipts.push(receipt);
                        
                        // 避免请求过于频繁
                        await new Promise(resolve => setTimeout(resolve, this.config.delay));
                    }
                    
                    // 处理交易
                    const processedTxs = await this.processor.processTransactions(filteredTxs, receipts);
                    
                    // 格式化输出
                    const formattedResults = processedTxs.map(tx => this.processor.formatOutput(tx));
                    allResults.push(...formattedResults);
                }

                processedBlocks++;
                
                // 显示进度
                if (processedBlocks % 10 === 0 || processedBlocks === totalBlocks) {
                    const progress = ((processedBlocks / totalBlocks) * 100).toFixed(1);
                    this.logger.log(`📊 进度: ${progress}% (${processedBlocks}/${totalBlocks}) - 找到 ${allResults.length} 笔相关交易`);
                }

                // 避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, this.config.delay));

            } catch (error) {
                this.logger.error(`❌ 处理区块 ${blockNumber} 时出错:`, error.message);
            }
        }

        this.logger.log(`✅ 扫描完成! 共找到 ${allResults.length} 笔相关交易`);
        return allResults;
    }

    /**
     * 获取最新区块号
     * @returns {Promise<number>} 最新区块号
     */
    async getLatestBlockNumber() {
        try {
            const blockNumber = await this.provider.getBlockNumber();
            this.logger.log(`📦 当前最新区块号: ${blockNumber}`);
            return blockNumber;
        } catch (error) {
            this.logger.error('❌ 获取最新区块号失败:', error.message);
            return 0;
        }
    }

    /**
     * 设置扫描配置
     * @param {Object} config - 配置对象
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.logger.log('⚙️ 配置已更新:', this.config);
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

    /**
     * 打印扫描结果
     * @param {Array} results - 扫描结果
     */
    printResults(results) {
        this.logger.log('\n📋 扫描结果:')
        this.logger.log('='.repeat(100))
        
        if (results.length === 0) {
            this.logger.log('❌ 未找到符合条件的交易')
            return;
        }

        results.forEach((tx, index) => {
            this.logger.log(`\n${index + 1}. 交易哈希: ${tx.hash}`)
            this.logger.log(`   区块号: ${tx.blockNumber}`)
            this.logger.log(`   时间: ${tx.timestamp}`)
            this.logger.log(`   发送方: ${tx.from}`)
            this.logger.log(`   接收方: ${tx.to}`)
            this.logger.log(`   交易类型: ${tx.transactionType}`)
            this.logger.log(`   是否转账: ${tx.isTransfer ? '✅' : '❌'}`)
            this.logger.log(`   是否ERC20: ${tx.isERC20Transaction ? '✅' : '❌'}`)
            this.logger.log(`   目标是否EOA: ${tx.isEOA ? '✅' : '❌'}`)
            this.logger.log(`   交易状态: ${tx.success ? '✅ 成功' : '❌ 失败'}`)
            
            // BNB变化
            if (tx.bnbChange.from !== '0' || tx.bnbChange.to !== '0') {
                this.logger.log(`   BNB变化:`)
                if (tx.bnbChange.from !== '0') {
                    this.logger.log(`     发送方: ${tx.bnbChange.formatted.from}`)
                }
                if (tx.bnbChange.to !== '0') {
                    this.logger.log(`     接收方: ${tx.bnbChange.formatted.to}`)
                }
            }
            
            // ERC20变化
            if (tx.erc20Changes.length > 0) {
                this.logger.log(`   ERC20变化:`)
                tx.erc20Changes.forEach((change, i) => {
                    this.logger.log(`     ${i + 1}. ${change.formatted} (${change.tokenName})`)
                    this.logger.log(`        从: ${change.from}`)
                    this.logger.log(`        到: ${change.to}`)
                });
            }
            
            // Gas信息
            this.logger.log(`   Gas: ${tx.gas.formatted.price} (使用: ${tx.gas.formatted.used})`)
        });
    }

    /**
     * 并行扫描指定区块区间的交易
     * @param {number} startBlock - 起始区块号
     * @param {number} endBlock - 结束区块号
     * @returns {Promise<Array>} 解析后的交易数据
     */
    async scanBlockRangeParallel(startBlock, endBlock) {
        this.logger.log(`⚡ 开始并行扫描区块区间: ${startBlock} - ${endBlock}`);
        
        const totalBlocks = endBlock - startBlock + 1;
        const blockNumbers = Array.from({ length: totalBlocks }, (_, i) => startBlock + i);
        
        // 并行处理区块，但限制并发数量避免过载
        const concurrency = Math.min(10, totalBlocks); // 最多同时处理10个区块
        const results = [];
        
        for (let i = 0; i < blockNumbers.length; i += concurrency) {
            const batch = blockNumbers.slice(i, i + concurrency);
            
            this.logger.log(`🔄 处理批次 ${Math.floor(i / concurrency) + 1}: 区块 ${batch[0]} - ${batch[batch.length - 1]}`);
            
            // 并行处理当前批次
            const batchPromises = batch.map(blockNumber => this.processBlock(blockNumber));
            const batchResults = await Promise.allSettled(batchPromises);
            
            // 收集成功的结果
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.length > 0) {
                    results.push(...result.value);
                } else if (result.status === 'rejected') {
                    this.logger.error(`❌ 区块 ${batch[index]} 处理失败:`, result.reason.message);
                }
            });
            
            // 显示进度
            const processed = Math.min(i + concurrency, blockNumbers.length);
            const progress = ((processed / totalBlocks) * 100).toFixed(1);
            this.logger.log(`📊 进度: ${progress}% (${processed}/${totalBlocks}) - 找到 ${results.length} 笔相关交易`);
            
            // 批次间短暂延迟，避免RPC过载
            if (i + concurrency < blockNumbers.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        this.logger.log(`✅ 并行扫描完成! 共找到 ${results.length} 笔相关交易`);
        return results;
    }

    /**
     * 处理单个区块
     * @param {number} blockNumber - 区块号
     * @returns {Promise<Array>} 该区块的相关交易
     */
    async processBlock(blockNumber) {
        try {
            // 获取区块交易
            const transactions = await this.getBlockTransactions(blockNumber);
            
            // 过滤交易
            const filteredTxs = transactions.filter(tx => this.filterTransaction(tx));
            
            if (filteredTxs.length === 0) {
                return [];
            }
            
            this.logger.log(`📦 区块 ${blockNumber}: 找到 ${filteredTxs.length} 笔相关交易`);
            
            // 并行获取交易收据
            const receiptPromises = filteredTxs.map(tx => this.getTransactionReceipt(tx.hash));
            const receipts = await Promise.allSettled(receiptPromises);
            
            // 处理收据结果，过滤掉未确认的交易
            const validTransactions = [];
            const validReceipts = [];
            
            receipts.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    // 交易已确认，有收据
                    validTransactions.push(filteredTxs[index]);
                    validReceipts.push(result.value);
                } else {
                    this.logger.warn(`⚠️ 跳过未确认交易 ${filteredTxs[index].hash}:`, 
                        result.status === 'fulfilled' ? '无收据' : result.reason.message)
                }
            });
            
            if (validTransactions.length === 0) {
                return [];
            }
            
            // 处理已确认的交易
            const processedTxs = await this.processor.processTransactions(validTransactions, validReceipts);
            
            // 格式化输出
            return processedTxs.map(tx => this.processor.formatOutput(tx));
            
        } catch (error) {
            this.logger.error(`❌ 处理区块 ${blockNumber} 时出错:`, error.message);
            return [];
        }
    }

    /**
     * 生成统计报告
     * @param {Array} results - 扫描结果
     */
    generateReport(results) {
        this.logger.log('\n📊 统计报告:');
        this.logger.log('='.repeat(50));
        
        const stats = {
            totalTransactions: results.length,
            bnbTransfers: 0,
            erc20Transactions: 0,
            contractCalls: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            eoaTargets: 0,
            contractTargets: 0,
            tokenTypes: new Set()
        };

        results.forEach(tx => {
            // 交易类型统计
            if (tx.transactionType === 'bnb_transfer') {
                stats.bnbTransfers++;
            } else if (tx.isERC20Transaction) {
                stats.erc20Transactions++;
            } else {
                stats.contractCalls++;
            }

            // 成功/失败统计
            if (tx.success) {
                stats.successfulTransactions++;
            } else {
                stats.failedTransactions++;
            }

            // EOA/合约统计
            if (tx.isEOA) {
                stats.eoaTargets++;
            } else {
                stats.contractTargets++;
            }

            // 代币类型统计
            tx.erc20Changes.forEach(change => {
                stats.tokenTypes.add(change.tokenSymbol);
            });
        });

        this.logger.log(`总交易数: ${stats.totalTransactions}`);
        this.logger.log(`BNB转账: ${stats.bnbTransfers}`);
        this.logger.log(`ERC20交易: ${stats.erc20Transactions}`);
        this.logger.log(`合约调用: ${stats.contractCalls}`);
        this.logger.log(`成功交易: ${stats.successfulTransactions}`);
        this.logger.log(`失败交易: ${stats.failedTransactions}`);
        this.logger.log(`EOA目标: ${stats.eoaTargets}`);
        this.logger.log(`合约目标: ${stats.contractTargets}`);
        this.logger.log(`涉及代币类型: ${stats.tokenTypes.size} 种`);
        
        if (stats.tokenTypes.size > 0) {
            this.logger.log(`代币列表: ${Array.from(stats.tokenTypes).join(', ')}`);
        }
    }
}

/**
 * 功能示例和测试
 */
async function runExample() {
    console.log('🚀 启动区块扫描器示例...\n');

    // 创建扫描器实例
    const scanner = new BlockScanner();

    // 添加监控地址
    const exampleAddresses = [
        '0x4f4a2f8AdD41cD13600feb91B62D1729BA5b4871'
    ];

    console.log('📝 添加监控地址:');
    exampleAddresses.forEach(addr => scanner.addWatchedAddress(addr));

    // 设置扫描配置
    scanner.setConfig({
        minValue: ethers.parseEther('0.000'), // 最小 0.001 BNB
        maxValue: ethers.parseEther('10000'), // 最大 10000 BNB
    });

    // 获取最新区块号
    const latestBlock = await scanner.getLatestBlockNumber();
    
    // 扫描指定区块区间
    const startBlock = 63868337;
    const endBlock = startBlock + 1;

    console.log(`\n🔍 开始扫描区块 ${startBlock} 到 ${endBlock}...\n`);

    // 执行扫描
    const results = await scanner.scanBlockRange(startBlock, endBlock);

    // 显示结果
    scanner.printResults(results);

    // 生成统计报告
    scanner.generateReport(results);

    console.log('\n✅ 示例运行完成!');
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
    runExample().catch(console.error);
}

module.exports = BlockScanner;
