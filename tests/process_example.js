const { ethers } = require('ethers');
const BlockScanner = require('../src/process/scan');
require('dotenv').config();

/**
 * 交易处理器功能示例
 * 演示如何使用process脚本进行交易类型识别和解析
 */
async function runProcessExample() {
    console.log('🚀 启动交易处理器示例...\n');

    // 创建扫描器实例
    const scanner = new BlockScanner('https://dragon.maiko.icu/bsc2h');

    // 添加监控地址
    const exampleAddresses = [
        '0x16Ad903472621101Cd3778ee53f486878027a60D'
    ];

    console.log('📝 添加监控地址:');
    exampleAddresses.forEach(addr => scanner.addWatchedAddress(addr));

    // 设置扫描配置
    scanner.setConfig({
        minValue: ethers.parseEther('0.001'), // 最小 0.001 BNB
        maxValue: ethers.parseEther('10000'), // 最大 10000 BNB
        delay: 50, // 减少延迟以加快测试
    });

    // 获取最新区块号
    const latestBlock = await scanner.getLatestBlockNumber();
    
    // 扫描指定区块区间
    const startBlock = 63796236;
    const endBlock = 63796237;

    console.log(`\n🔍 开始扫描区块 ${startBlock} 到 ${endBlock}...\n`);

    // 执行扫描
    const results = await scanner.scanBlockRange(startBlock, endBlock);

    // 显示结果
    scanner.printResults(results);

    // 生成统计报告
    scanner.generateReport(results);

    // 演示数据结构
    if (results.length > 0) {
        console.log('\n📋 数据结构示例:');
        console.log('='.repeat(50));
        console.log(JSON.stringify(results[0], null, 2));
    }

    console.log('\n✅ 示例运行完成!');
}

// 运行示例
if (require.main === module) {
    runProcessExample().catch(console.error);
}

module.exports = { runProcessExample };
