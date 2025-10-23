const WalletMonitor = require('./main');

const prefix = 'new_wallet:';
const chatId = '-4904614816';

// 新钱包识别启动脚本
async function startWithNewWalletDetection() {
    console.log('🚀 启动钱包监控系统（启用新钱包识别）');
    
    const monitor = new WalletMonitor({
        enableNewWalletDetection: true,
        redisPrefix: prefix,
        chatId: chatId
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
startWithNewWalletDetection().catch(console.error);
