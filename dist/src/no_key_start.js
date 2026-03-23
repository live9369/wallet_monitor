"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const WalletMonitor = require('./main');
const prefix = 'wallet:';
// 禁用新钱包识别启动脚本
async function startWithoutNewWalletDetection() {
    console.log('🚀 启动钱包监控系统（禁用新钱包识别）');
    const monitor = new WalletMonitor({
        enableNewWalletDetection: false,
        redisPrefix: prefix
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
// 启动程序
startWithoutNewWalletDetection().catch(console.error);
