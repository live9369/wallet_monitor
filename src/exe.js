const fs = require('fs');
const path = require('path');
const RefRedis = require('./db/redis');
require('dotenv').config();

const prefix = 'new_wallet:';

/**
 * 数据库执行器
 * 用于向Redis数据库添加监控数据，支持从JSON文件批量导入
 */
class DatabaseExecutor {
    constructor() {
        this.redis = new RefRedis({ 
            url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' 
        }, prefix);
    }

    /**
     * 初始化数据库连接
     */
    async init() {
        try {
            await this.redis.connect();
            console.log('✅ Redis连接成功');
        } catch (error) {
            console.error('❌ Redis连接失败:', error.message);
            throw error;
        }
    }

    /**
     * 添加单个监控地址
     * @param {string} wallet - 钱包地址
     * @param {string} name - 钱包名称
     * @param {string} refer - 上级地址
     */
    async addWallet(wallet, name, refer = '') {
        try {
            // 检查地址是否已存在
            const exists = await this.redis.existsWallet(wallet);
            if (exists) {
                console.log(`ℹ️ 地址已存在，跳过添加: ${wallet}`);
                return true;
            }
            
            await this.redis.addNodeLite(wallet, name, refer);
            console.log(`✅ 已添加钱包: ${name} (${wallet})`);
            return true;
        } catch (error) {
            console.error(`❌ 添加钱包失败 ${wallet}:`, error.message);
            return false;
        }
    }

    /**
     * 从JSON文件批量导入数据
     * @param {string} filePath - JSON文件路径
     */
    async importFromJson(filePath) {
        try {
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`文件不存在: ${filePath}`);
            }

            // 读取JSON文件
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);

            console.log(`📁 开始导入文件: ${filePath}`);
            console.log(`📊 数据条数: ${data.length}`);

            let successCount = 0;
            let failCount = 0;

            // 批量导入
            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                
                // 验证必要字段
                if (!item.wallet || !item.name) {
                    console.error(`❌ 第${i + 1}条数据缺少必要字段:`, item);
                    failCount++;
                    continue;
                }

                // 添加钱包
                const success = await this.addWallet(
                    item.wallet, 
                    item.name, 
                    item.refer || ''
                );

                if (success) {
                    successCount++;
                } else {
                    failCount++;
                }

                // 显示进度
                if ((i + 1) % 10 === 0 || i === data.length - 1) {
                    console.log(`📈 进度: ${i + 1}/${data.length} (成功: ${successCount}, 失败: ${failCount})`);
                }

                // 避免操作过于频繁
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log(`\n📊 导入完成:`);
            console.log(`✅ 成功: ${successCount} 条`);
            console.log(`❌ 失败: ${failCount} 条`);
            console.log(`📈 总计: ${data.length} 条`);

        } catch (error) {
            console.error('❌ 导入失败:', error.message);
            throw error;
        }
    }

    /**
     * 导出数据到JSON文件
     * @param {string} filePath - 导出文件路径
     */
    async exportToJson(filePath) {
        try {
            console.log('📤 开始导出数据...');
            
            // 获取所有钱包地址
            const wallets = await this.redis.getAllWallets();
            console.log(`📊 找到 ${wallets.length} 个钱包地址`);

            const exportData = [];

            // 获取每个钱包的详细信息
            for (const wallet of wallets) {
                const nodeInfo = await this.redis.getNodeInfo(wallet);
                if (nodeInfo) {
                    exportData.push({
                        wallet: nodeInfo.wallet,
                        name: nodeInfo.name,
                        refer: nodeInfo.refer,
                        id: nodeInfo.id,
                        lv: nodeInfo.lv,
                        refer_id: nodeInfo.refer_id
                    });
                }
            }

            // 写入文件
            const jsonContent = JSON.stringify(exportData, null, 2);
            fs.writeFileSync(filePath, jsonContent, 'utf8');

            console.log(`✅ 数据已导出到: ${filePath}`);
            console.log(`📊 导出条数: ${exportData.length}`);

        } catch (error) {
            console.error('❌ 导出失败:', error.message);
            throw error;
        }
    }

    /**
     * 列出所有监控地址
     */
    async listWallets() {
        try {
            console.log('📋 监控地址列表:');
            console.log('='.repeat(80));

            const wallets = await this.redis.getAllWallets();
            
            if (wallets.length === 0) {
                console.log('❌ 暂无监控地址');
                return;
            }

            for (let i = 0; i < wallets.length; i++) {
                const wallet = wallets[i];
                const nodeInfo = await this.redis.getNodeInfo(wallet);
                
                if (nodeInfo) {
                    console.log(`${i + 1}. ${nodeInfo.name}`);
                    console.log(`   地址: ${nodeInfo.wallet}`);
                    console.log(`   上级: ${nodeInfo.refer || '无'}`);
                    console.log(`   层级: ${nodeInfo.lv}`);
                    console.log(`   ID: ${nodeInfo.id}`);
                    console.log('');
                }
            }

            console.log(`📊 总计: ${wallets.length} 个监控地址`);

        } catch (error) {
            console.error('❌ 获取地址列表失败:', error.message);
        }
    }

    /**
     * 删除监控地址
     * @param {string} wallet - 钱包地址
     */
    async removeWallet(wallet) {
        try {
            await this.redis.removeNode(wallet);
            console.log(`✅ 已删除钱包: ${wallet}`);
        } catch (error) {
            console.error(`❌ 删除钱包失败 ${wallet}:`, error.message);
        }
    }

    /**
     * 清空所有监控数据
     */
    async clearAll() {
        try {
            const wallets = await this.redis.getAllWallets();
            
            if (wallets.length === 0) {
                console.log('ℹ️ 没有监控地址需要清理');
                return;
            }
            
            console.log(`⚠️ 即将删除 ${wallets.length} 个监控地址`);
            console.log('⚠️ 此操作不可恢复！');
            
            // 使用新的清理方法
            const removedCount = await this.redis.clearAllWallets();
            
            console.log(`✅ 已清空所有监控数据，删除了 ${removedCount} 个地址`);
        } catch (error) {
            console.error('❌ 清空数据失败:', error.message);
        }
    }

    /**
     * 显示当前配置
     */
    async showConfig() {
        try {
            console.log('📋 当前配置信息:');
            console.log('='.repeat(50));
            
            // 显示环境变量配置
            console.log(`🔧 新钱包识别: ${process.env.ENABLE_NEW_WALLET_DETECTION !== 'false' ? '✅ 已启用' : '❌ 已禁用'}`);
            console.log(`📡 RPC URL: ${process.env.RPC_URL || 'https://dragon.maiko.icu/bsc2h'}`);
            console.log(`⏱️ 扫描间隔: ${process.env.SCAN_INTERVAL || '3000'}ms`);
            console.log(`📦 批次大小: ${process.env.BATCH_SIZE || '5'} 个区块`);
            console.log(`💰 最小金额: ${process.env.MIN_VALUE || '0.000'} BNB`);
            console.log(`💬 聊天ID: ${process.env.CHAT_ID || '未设置'}`);
            console.log(`🧵 线程ID: ${process.env.THREAD_ID || '未设置'}`);
            console.log(`🗄️ Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`);
            
            // 显示数据库统计
            const wallets = await this.redis.getAllWallets();
            console.log(`\n📊 数据库统计:`);
            console.log(`   监控地址数量: ${wallets.length}`);
            
            if (wallets.length > 0) {
                console.log(`   地址列表:`);
                for (const wallet of wallets) {
                    const name = await this.redis.getNameByWallet(wallet);
                    console.log(`     - ${wallet} (${name})`);
                }
            }
            
        } catch (error) {
            console.error('❌ 获取配置失败:', error.message);
        }
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log(`
🔧 数据库执行器使用说明

命令格式: node src/exe.js <命令> [参数]

可用命令:
  add <wallet> <name> [refer]     - 添加单个监控地址
  import <file>                   - 从JSON文件批量导入
  export <file>                   - 导出数据到JSON文件
  list                           - 列出所有监控地址
  remove <wallet>                - 删除指定监控地址
  clear                          - 清空所有监控数据
  config                         - 显示当前配置
  help                           - 显示帮助信息

示例:
  node src/exe.js add 0x1234... Alice
  node src/exe.js add 0x5678... Bob 0x1234...
  node src/exe.js import data/wallets.json
  node src/exe.js export backup/wallets.json
  node src/exe.js list
  node src/exe.js remove 0x1234...

JSON文件格式:
[
  {
    "wallet": "0x1234567890abcdef...",
    "name": "Alice",
    "refer": "0x5678901234abcdef..."
  },
  {
    "wallet": "0xabcdef1234567890...",
    "name": "Bob",
    "refer": ""
  }
]
        `);
    }
}

/**
 * 主程序入口
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('❌ 请提供命令参数');
        console.log('使用 "node src/exe.js help" 查看帮助信息');
        process.exit(1);
    }

    const command = args[0];
    const executor = new DatabaseExecutor();

    try {
        await executor.init();

        switch (command) {
            case 'add':
                if (args.length < 3) {
                    console.error('❌ 用法: add <wallet> <name> [refer]');
                    process.exit(1);
                }
                await executor.addWallet(args[1], args[2], args[3] || '');
                break;

            case 'import':
                if (args.length < 2) {
                    console.error('❌ 用法: import <file>');
                    process.exit(1);
                }
                await executor.importFromJson(args[1]);
                break;

            case 'export':
                if (args.length < 2) {
                    console.error('❌ 用法: export <file>');
                    process.exit(1);
                }
                await executor.exportToJson(args[1]);
                break;

            case 'list':
                await executor.listWallets();
                break;

            case 'remove':
                if (args.length < 2) {
                    console.error('❌ 用法: remove <wallet>');
                    process.exit(1);
                }
                await executor.removeWallet(args[1]);
                break;

            case 'clear':
                await executor.clearAll();
                break;

            case 'config':
                await executor.showConfig();
                break;

            case 'help':
                executor.showHelp();
                break;

            default:
                console.error(`❌ 未知命令: ${command}`);
                console.log('使用 "node src/exe.js help" 查看帮助信息');
                process.exit(1);
        }

    } catch (error) {
        console.error('❌ 执行失败:', error.message);
        process.exit(1);
    } finally {
        // 断开Redis连接
        try {
            await executor.redis.disconnect();
        } catch (error) {
            console.warn('⚠️ 断开连接时出错:', error.message);
        }
        process.exit(0);
    }
}

// 如果直接运行此文件，则执行主程序
if (require.main === module) {
    main().catch(console.error);
}

module.exports = DatabaseExecutor;
