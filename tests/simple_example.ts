// @ts-nocheck
const { ethers } = require('ethers');
require('dotenv').config();

/**
 * 简化的区块交易过滤器示例
 * 用于快速演示过滤指定区块区间和指定地址的交易功能
 */
class SimpleBlockFilter {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
        this.watchedAddresses = new Set();
    }

    // 添加监控地址
    addAddress(address) {
        if (ethers.isAddress(address)) {
            this.watchedAddresses.add(address.toLowerCase());
            console.log(`✅ 添加地址: ${address}`);
        } else {
            console.error(`❌ 无效地址: ${address}`);
        }
    }

    // 检查交易是否涉及监控地址
    isRelevant(tx) {
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        return this.watchedAddresses.has(from) || this.watchedAddresses.has(to);
    }

    // 扫描区块区间
    async scanBlocks(startBlock, endBlock) {
        console.log(`🔍 扫描区块 ${startBlock} - ${endBlock}`);
        
        const results = [];
        
        for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
            try {
                const block = await this.provider.getBlock(blockNum, true);
                if (block && block.transactions) {
                    const relevantTxs = block.transactions.filter(tx => this.isRelevant(tx));
                    
                    relevantTxs.forEach(tx => {
                        results.push({
                            block: blockNum,
                            hash: tx.hash,
                            from: tx.from,
                            to: tx.to,
                            value: ethers.formatEther(tx.value || '0'),
                            timestamp: new Date(block.timestamp * 1000).toLocaleString()
                        });
                    });
                }
                
                // 显示进度
                if ((blockNum - startBlock + 1) % 5 === 0) {
                    console.log(`📊 已处理 ${blockNum - startBlock + 1}/${endBlock - startBlock + 1} 个区块`);
                }
                
                // 避免请求过快
                await new Promise(resolve => setTimeout(resolve, 50));
                
            } catch (error) {
                console.error(`❌ 区块 ${blockNum} 处理失败:`, error.message);
            }
        }
        
        return results;
    }
}

// 运行示例
async function runSimpleExample() {
    console.log('🚀 简化版区块交易过滤器示例\n');
    
    const filter = new SimpleBlockFilter();
    
    // 添加一些知名地址
    filter.addAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); // Vitalik
    filter.addAddress('0x28C6c06298d514Db089934071355E5743bf21d60'); // Binance
    
    // 获取最新区块号
    const latestBlock = await filter.provider.getBlockNumber();
    console.log(`📦 最新区块: ${latestBlock}\n`);
    
    // 扫描最近 20 个区块
    const startBlock = latestBlock - 20;
    const results = await filter.scanBlocks(startBlock, latestBlock);
    
    console.log('\n📋 扫描结果:');
    console.log('='.repeat(60));
    
    if (results.length === 0) {
        console.log('❌ 未找到相关交易');
    } else {
        results.forEach((tx, i) => {
            console.log(`\n${i + 1}. 区块: ${tx.block}`);
            console.log(`   哈希: ${tx.hash}`);
            console.log(`   从: ${tx.from}`);
            console.log(`   到: ${tx.to}`);
            console.log(`   金额: ${tx.value} ETH`);
            console.log(`   时间: ${tx.timestamp}`);
        });
    }
    
    console.log(`\n📊 总计找到 ${results.length} 笔相关交易`);
    console.log('✅ 示例完成!');
}

// 运行示例
if (require.main === module) {
    runSimpleExample().catch(console.error);
}

module.exports = SimpleBlockFilter;
