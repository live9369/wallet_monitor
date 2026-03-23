"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const RefRedis = require('./src/db/redis');
require('dotenv').config();
const prefix = 'new_wallet:';
async function cleanupContractAddress() {
    const redis = new RefRedis({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' }, prefix);
    try {
        await redis.connect();
        // 要移除的合约地址
        const contractAddress = '0x3ac3d64978fda7768403f3b6ed33a4f6b9378306';
        console.log(`🗑️ 正在移除合约地址: ${contractAddress}`);
        // 直接尝试移除（不管是否存在）
        try {
            await redis.removeNode(contractAddress);
            console.log(`✅ 已尝试移除合约地址: ${contractAddress}`);
        }
        catch (error) {
            console.log(`⚠️ 移除失败: ${error.message}`);
        }
        // 也尝试移除小写版本
        try {
            await redis.removeNode(contractAddress.toLowerCase());
            console.log(`✅ 已尝试移除小写版本: ${contractAddress.toLowerCase()}`);
        }
        catch (error) {
            console.log(`⚠️ 移除小写版本失败: ${error.message}`);
        }
        // 显示当前监控地址列表
        const wallets = await redis.getAllWallets();
        console.log('\n📋 当前监控地址列表:');
        for (const wallet of wallets) {
            const name = await redis.getNameByWallet(wallet);
            console.log(`  - ${wallet} (${name})`);
        }
        // 断开连接
        await redis.disconnect();
    }
    catch (error) {
        console.error('❌ 清理失败:', error.message);
    }
}
async function cleanAll() {
    const redis = new RefRedis({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' }, prefix);
    try {
        await redis.connect();
        console.log('🗑️ 开始清理所有监控地址...');
        // 使用新的清理方法
        const removedCount = await redis.clearAllWallets();
        console.log(`✅ 已清理所有监控地址，删除了 ${removedCount} 个地址`);
        // 断开连接
        await redis.disconnect();
    }
    catch (error) {
        console.error('❌ 清理所有地址失败:', error.message);
    }
}
// 根据命令行参数选择执行哪个函数
const args = process.argv.slice(2);
if (args.includes('--all')) {
    cleanAll();
}
else {
    cleanupContractAddress();
}
