"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const RefRedis = require('../db/redis');
require('dotenv').config();
/**
 * 数据库清理执行器
 * 用于清理数据库中的异常数据，如孤点数据
 */
class DatabaseCleanupExecutor {
    constructor(prefix = 'new_wallet:') {
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
        }
        catch (error) {
            console.error('❌ Redis连接失败:', error.message);
            throw error;
        }
    }
    /**
     * 断开数据库连接
     */
    async disconnect() {
        await this.redis.disconnect();
    }
    /**
     * 查找所有孤点数据（非顶级的）
     * 孤点数据定义：层级大于1，refer 字段指向的节点不存在
     * 注意：顶级节点层级是1，不是0。层级为1的节点不应该被检测为孤点
     * @param {boolean} autoInit - 是否自动初始化连接（默认 true）
     * @returns {Promise<Array>} 孤点节点列表
     */
    async findOrphanNodes(autoInit = true) {
        if (autoInit) {
            await this.init();
        }
        try {
            console.log('🔍 开始查找孤点数据...');
            const allWallets = await this.redis.getAllWallets();
            console.log(`📊 总共有 ${allWallets.length} 个钱包地址`);
            const orphanNodes = [];
            const walletSet = new Set(allWallets.map(w => w.toLowerCase()));
            // 遍历所有钱包
            for (const wallet of allWallets) {
                try {
                    const nodeInfo = await this.redis.getNodeInfo(wallet);
                    if (!nodeInfo) {
                        console.warn(`⚠️ 节点信息为空: ${wallet}`);
                        continue;
                    }
                    const level = nodeInfo.lv || 1;
                    const refer = nodeInfo.refer || '';
                    // 孤点条件：
                    // 1. 层级必须大于1（层级1是顶级节点，不应该被视为孤点）
                    // 2. 有 refer 且 refer 不为空或"0"
                    // 3. refer 指向的节点不存在
                    // 检查是否为顶级节点：refer 为空、"0" 或层级为1
                    const isTopLevel = level === 1 || !refer || refer.trim() === '' || refer.trim() === '0';
                    if (isTopLevel) {
                        // 顶级节点，跳过
                        continue;
                    }
                    // 非顶级节点，检查 refer 指向的节点是否存在
                    const referTrimmed = refer.trim().toLowerCase();
                    const referExists = walletSet.has(referTrimmed);
                    if (!referExists) {
                        // 这是一个孤点：层级 > 1 且有 refer，但 refer 指向的节点不存在
                        orphanNodes.push({
                            wallet: wallet,
                            name: nodeInfo.name || 'Unknown',
                            refer: refer,
                            level: level,
                            nodeInfo: nodeInfo
                        });
                        console.log(`🔴 发现孤点: ${nodeInfo.name || wallet} (${wallet}) - 层级 ${level} -> refer: ${refer} (不存在)`);
                    }
                }
                catch (error) {
                    console.error(`❌ 处理钱包 ${wallet} 时出错:`, error.message);
                }
            }
            console.log(`\n📋 找到 ${orphanNodes.length} 个孤点节点`);
            return orphanNodes;
        }
        catch (error) {
            console.error('❌ 查找孤点数据失败:', error.message);
            throw error;
        }
    }
    /**
     * 删除所有非顶级的孤点数据
     * @param {boolean} dryRun - 是否为试运行模式（只查找不删除，默认 false）
     * @returns {Promise<Object>} 删除结果
     */
    async removeOrphanNodes(dryRun = false) {
        await this.init();
        try {
            // 查找所有孤点（不重复初始化连接）
            const orphanNodes = await this.findOrphanNodes(false);
            if (orphanNodes.length === 0) {
                console.log('✅ 没有发现孤点数据');
                return {
                    success: true,
                    message: '没有发现孤点数据',
                    deletedCount: 0,
                    orphanNodes: []
                };
            }
            if (dryRun) {
                console.log('\n🔍 试运行模式：以下节点将被删除（但实际不会删除）:');
                orphanNodes.forEach((node, index) => {
                    console.log(`${index + 1}. ${node.name} (${node.wallet})`);
                    console.log(`   层级: ${node.level}, Refer: ${node.refer}`);
                });
                return {
                    success: true,
                    message: `试运行完成，发现 ${orphanNodes.length} 个孤点节点`,
                    deletedCount: 0,
                    orphanNodes: orphanNodes,
                    dryRun: true
                };
            }
            // 实际删除
            console.log(`\n🗑️ 开始删除 ${orphanNodes.length} 个孤点节点...`);
            const deletedNodes = [];
            const failedNodes = [];
            for (let i = 0; i < orphanNodes.length; i++) {
                const node = orphanNodes[i];
                try {
                    await this.redis.removeNode(node.wallet);
                    deletedNodes.push(node);
                    // 每删除10个节点显示一次进度
                    if ((i + 1) % 10 === 0 || i === orphanNodes.length - 1) {
                        console.log(`🗑️ 删除进度: ${i + 1}/${orphanNodes.length} - ${node.name || node.wallet}`);
                    }
                }
                catch (error) {
                    console.error(`❌ 删除孤点节点失败 ${node.wallet}:`, error.message);
                    failedNodes.push({
                        node: node,
                        error: error.message
                    });
                }
            }
            console.log(`\n✅ 删除完成:`);
            console.log(`   成功: ${deletedNodes.length} 个`);
            console.log(`   失败: ${failedNodes.length} 个`);
            if (failedNodes.length > 0) {
                console.log('\n❌ 删除失败的节点:');
                failedNodes.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.node.wallet}: ${item.error}`);
                });
            }
            return {
                success: true,
                message: `成功删除 ${deletedNodes.length} 个孤点节点`,
                deletedCount: deletedNodes.length,
                failedCount: failedNodes.length,
                orphanNodes: orphanNodes,
                deletedNodes: deletedNodes,
                failedNodes: failedNodes
            };
        }
        catch (error) {
            console.error('❌ 删除孤点数据失败:', error.message);
            return {
                success: false,
                message: `删除失败: ${error.message}`,
                deletedCount: 0,
                orphanNodes: []
            };
        }
        finally {
            await this.disconnect();
        }
    }
    /**
     * 删除指定地址及其所有子集
     * @param {string} wallet - 钱包地址
     * @param {boolean} dryRun - 是否为试运行模式（只查找不删除，默认 false）
     * @param {boolean} autoInit - 是否自动初始化连接（默认 true）
     * @returns {Promise<Object>} 删除结果
     */
    async removeWalletAndDescendants(wallet, dryRun = false, autoInit = true) {
        if (autoInit) {
            await this.init();
        }
        try {
            if (!wallet) {
                return {
                    success: false,
                    message: '钱包地址不能为空',
                    deletedCount: 0,
                    data: null
                };
            }
            // 检查地址是否存在
            const exists = await this.redis.existsWallet(wallet);
            if (!exists) {
                console.log(`❌ 地址不存在: ${wallet}`);
                return {
                    success: false,
                    message: `地址不存在: ${wallet}`,
                    deletedCount: 0,
                    data: null
                };
            }
            // 获取删除前的信息
            const nodeInfo = await this.redis.getNodeInfo(wallet);
            const mainName = await this.redis.getNameByWallet(wallet);
            console.log(`\n🗑️ 开始删除钱包: ${wallet}`);
            console.log(`名称: ${mainName || 'Unknown'}`);
            console.log(`层级: ${nodeInfo?.lv || 0}`);
            console.log(`上级: ${nodeInfo?.refer || '无'}`);
            // 递归查找所有子集地址
            console.log(`\n🔍 正在查找所有子集地址...`);
            const descendants = await this.redis.getAllDescendants(wallet);
            console.log(`📊 找到 ${descendants.length} 个子集地址`);
            // 记录要删除的地址列表（包括自己和所有子集）
            const allToDeleteSet = new Set();
            allToDeleteSet.add(wallet.toLowerCase());
            descendants.forEach(addr => allToDeleteSet.add(addr.toLowerCase()));
            const allToDelete = Array.from(allToDeleteSet);
            console.log(`📋 准备删除 ${allToDelete.length} 个地址（包括主地址）`);
            if (dryRun) {
                console.log(`\n🔍 试运行模式：以下节点将被删除（但实际不会删除）:`);
                // 获取所有节点信息用于显示
                const toDisplay = [];
                for (const addr of allToDelete) {
                    try {
                        const info = await this.redis.getNodeInfo(addr);
                        const name = await this.redis.getNameByWallet(addr);
                        const isMain = addr.toLowerCase() === wallet.toLowerCase();
                        toDisplay.push({
                            wallet: addr,
                            name: name || 'Unknown',
                            level: info?.lv || 0,
                            isMain: isMain
                        });
                    }
                    catch (error) {
                        toDisplay.push({
                            wallet: addr,
                            name: 'Unknown',
                            level: 0,
                            isMain: addr.toLowerCase() === wallet.toLowerCase()
                        });
                    }
                }
                // 按层级排序
                toDisplay.sort((a, b) => {
                    if (a.isMain !== b.isMain) {
                        return a.isMain ? -1 : 1;
                    }
                    if (a.level !== b.level) {
                        return b.level - a.level; // 层级降序
                    }
                    return a.wallet.localeCompare(b.wallet);
                });
                toDisplay.forEach((item, index) => {
                    const marker = item.isMain ? ' [主地址]' : '';
                    console.log(`${index + 1}. ${item.name} (${item.wallet}) - 层级 ${item.level}${marker}`);
                });
                return {
                    success: true,
                    message: `试运行完成，将删除 ${allToDelete.length} 个节点`,
                    deletedCount: 0,
                    data: {
                        wallet: wallet,
                        name: mainName,
                        level: nodeInfo?.lv || 0,
                        totalToDelete: allToDelete.length,
                        descendantsCount: descendants.length,
                        nodesToDelete: toDisplay
                    },
                    dryRun: true
                };
            }
            // 优化：一次性获取所有需要删除的地址信息，减少数据库查询次数
            const toDeleteWithLevel = [];
            const allNodeInfoMap = new Map(); // 缓存节点信息
            // 批量获取所有节点信息
            for (const addr of allToDelete) {
                try {
                    const info = await this.redis.getNodeInfo(addr);
                    if (info) {
                        allNodeInfoMap.set(addr.toLowerCase(), info);
                        toDeleteWithLevel.push({ wallet: addr, level: info.lv || 0 });
                    }
                }
                catch (error) {
                    console.warn(`⚠️ 获取节点信息失败 ${addr}:`, error.message);
                }
            }
            // 按层级降序排序（先删除深层级的）
            toDeleteWithLevel.sort((a, b) => b.level - a.level);
            const deletedAddresses = [];
            const deletedNames = [];
            const mainWalletLower = wallet.toLowerCase();
            const totalCount = toDeleteWithLevel.length;
            console.log(`\n🚀 开始删除 ${totalCount} 个地址...`);
            // 删除所有地址（包括自己和子集）
            for (let i = 0; i < toDeleteWithLevel.length; i++) {
                const item = toDeleteWithLevel[i];
                const addr = item.wallet;
                try {
                    // 从缓存的节点信息中获取名称
                    const cachedInfo = allNodeInfoMap.get(addr.toLowerCase());
                    const name = cachedInfo?.name || await this.redis.getNameByWallet(addr);
                    const isMainWallet = addr.toLowerCase() === mainWalletLower;
                    // 从数据库删除钱包
                    await this.redis.removeNode(addr);
                    deletedAddresses.push(addr);
                    deletedNames.push({
                        wallet: addr,
                        name: name || addr,
                        level: item.level,
                        isMain: isMainWallet
                    });
                    // 每10个地址记录一次进度，避免日志过多
                    if ((i + 1) % 10 === 0 || i === totalCount - 1) {
                        console.log(`🗑️ 删除进度: ${i + 1}/${totalCount} - ${name || addr}`);
                    }
                }
                catch (error) {
                    console.error(`❌ 删除节点失败 ${addr}:`, error.message);
                }
            }
            const deletedCount = deletedAddresses.length;
            const message = deletedCount > 1
                ? `成功删除钱包 ${wallet} 及其 ${deletedCount - 1} 个子集（共 ${deletedCount} 个）`
                : `成功删除钱包: ${wallet}`;
            console.log(`\n✅ 删除完成: ${message}`);
            console.log(`   成功: ${deletedCount} 个`);
            console.log(`   失败: ${totalCount - deletedCount} 个`);
            // 按层级统计
            const levelStats = new Map();
            deletedNames.forEach(item => {
                const level = item.level || 0;
                levelStats.set(level, (levelStats.get(level) || 0) + 1);
            });
            if (levelStats.size > 0) {
                console.log(`\n📊 各层级删除统计:`);
                const sortedLevels = Array.from(levelStats.keys()).sort((a, b) => b - a);
                for (const level of sortedLevels) {
                    console.log(`   层级 ${level}: ${levelStats.get(level)} 个`);
                }
            }
            return {
                success: true,
                message: message,
                deletedCount: deletedCount,
                failedCount: totalCount - deletedCount,
                data: {
                    wallet: wallet,
                    name: mainName,
                    level: nodeInfo?.lv || 0,
                    deletedAddresses: deletedAddresses,
                    deletedNames: deletedNames,
                    descendantsCount: descendants.length,
                    levelStats: Object.fromEntries(levelStats)
                }
            };
        }
        catch (error) {
            console.error(`❌ 删除钱包失败:`, error.message);
            return {
                success: false,
                message: `删除失败: ${error.message}`,
                deletedCount: 0,
                data: null
            };
        }
    }
    /**
     * 获取所有钱包列表
     * @param {Object} options - 选项
     * @param {number} options.minLevel - 最小层级（可选）
     * @param {number} options.maxLevel - 最大层级（可选）
     * @param {boolean} options.sortByLevel - 是否按层级排序（默认 true）
     * @param {boolean} autoInit - 是否自动初始化连接（默认 true）
     * @returns {Promise<Object>} 钱包列表
     */
    async getAllWallets(options = {}, autoInit = true) {
        if (autoInit) {
            await this.init();
        }
        try {
            const { minLevel = null, maxLevel = null, sortByLevel = true } = options;
            console.log('📋 正在获取所有钱包...');
            const allWallets = await this.redis.getAllWallets();
            console.log(`📊 找到 ${allWallets.length} 个钱包地址`);
            const walletList = [];
            const levelCount = new Map();
            const referMap = new Map(); // refer -> count
            // 获取每个钱包的详细信息
            for (const wallet of allWallets) {
                try {
                    const nodeInfo = await this.redis.getNodeInfo(wallet);
                    const name = await this.redis.getNameByWallet(wallet);
                    if (!nodeInfo) {
                        console.warn(`⚠️ 节点信息为空: ${wallet}`);
                        continue;
                    }
                    const level = nodeInfo.lv || 1;
                    const refer = nodeInfo.refer || '';
                    // 层级过滤
                    if (minLevel !== null && level < minLevel)
                        continue;
                    if (maxLevel !== null && level > maxLevel)
                        continue;
                    levelCount.set(level, (levelCount.get(level) || 0) + 1);
                    if (refer) {
                        referMap.set(refer, (referMap.get(refer) || 0) + 1);
                    }
                    walletList.push({
                        wallet: wallet,
                        name: name || 'Unknown',
                        level: level,
                        refer: refer,
                        id: nodeInfo.id || '',
                        nodeInfo: nodeInfo
                    });
                }
                catch (error) {
                    console.error(`❌ 处理钱包 ${wallet} 时出错:`, error.message);
                }
            }
            // 排序
            if (sortByLevel) {
                walletList.sort((a, b) => {
                    if (a.level !== b.level) {
                        return a.level - b.level; // 按层级升序
                    }
                    return a.wallet.localeCompare(b.wallet); // 同层级按地址排序
                });
            }
            // 显示详细信息
            console.log(`\n📋 钱包详细信息 (共 ${walletList.length} 个):`);
            console.log('='.repeat(80));
            if (walletList.length === 0) {
                console.log('❌ 暂无钱包地址');
                return {
                    success: true,
                    message: '暂无钱包地址',
                    data: {
                        total: 0,
                        wallets: [],
                        levelDistribution: {},
                        statistics: {
                            totalNodes: 0,
                            topLevelNodes: 0,
                            maxLevel: 0
                        }
                    }
                };
            }
            // 按层级分组显示
            let currentLevel = -1;
            const topLevelNodes = [];
            for (const item of walletList) {
                if (item.level !== currentLevel) {
                    if (currentLevel >= 0) {
                        console.log(''); // 层级之间空行
                    }
                    const count = levelCount.get(item.level) || 0;
                    console.log(`📍 层级 ${item.level} (共 ${count} 个):`);
                    currentLevel = item.level;
                }
                const isTopLevel = !item.refer || item.refer.trim() === '';
                if (isTopLevel) {
                    topLevelNodes.push(item);
                    console.log(`  • ${item.name} (${item.wallet}) [顶级]`);
                }
                else {
                    const referName = walletList.find(w => w.wallet.toLowerCase() === item.refer.toLowerCase())?.name || item.refer;
                    console.log(`  • ${item.name} (${item.wallet})`);
                    console.log(`    上级: ${referName} (${item.refer})`);
                }
            }
            // 显示统计信息
            console.log('\n' + '='.repeat(80));
            console.log(`📊 统计信息:`);
            console.log(`总钱包数: ${walletList.length}`);
            console.log(`顶级节点: ${topLevelNodes.length} 个`);
            if (levelCount.size > 0) {
                console.log(`各层级分布:`);
                const sortedLevels = Array.from(levelCount.keys()).sort((a, b) => a - b);
                const maxLevel = Math.max(...sortedLevels);
                for (const level of sortedLevels) {
                    const count = levelCount.get(level);
                    const percentage = ((count / walletList.length) * 100).toFixed(2);
                    console.log(`  层级 ${level}: ${count} 个 (${percentage}%)`);
                }
                console.log(`最大层级: ${maxLevel}`);
            }
            return {
                success: true,
                message: `成功获取 ${walletList.length} 个钱包`,
                data: {
                    total: walletList.length,
                    wallets: walletList,
                    levelDistribution: Object.fromEntries(levelCount),
                    topLevelNodes: topLevelNodes,
                    statistics: {
                        totalNodes: walletList.length,
                        topLevelNodes: topLevelNodes.length,
                        maxLevel: levelCount.size > 0 ? Math.max(...Array.from(levelCount.keys())) : 0,
                        minLevel: levelCount.size > 0 ? Math.min(...Array.from(levelCount.keys())) : 0
                    }
                }
            };
        }
        catch (error) {
            console.error('❌ 获取钱包列表失败:', error.message);
            return {
                success: false,
                message: `获取失败: ${error.message}`,
                data: null
            };
        }
    }
    /**
     * 获取统计信息
     * @param {boolean} autoInit - 是否自动初始化连接（默认 true）
     * @returns {Promise<Object>} 统计信息
     */
    async getStats(autoInit = true) {
        if (autoInit) {
            await this.init();
        }
        try {
            const allWallets = await this.redis.getAllWallets();
            const walletSet = new Set(allWallets.map(w => w.toLowerCase()));
            let totalNodes = 0;
            let topLevelNodes = 0; // 顶级节点（层级为1，或refer为空、"0"）
            let orphanNodes = 0;
            let validNodes = 0; // 有效节点（层级>1，有 refer 且 refer 存在）
            for (const wallet of allWallets) {
                try {
                    const nodeInfo = await this.redis.getNodeInfo(wallet);
                    if (!nodeInfo)
                        continue;
                    totalNodes++;
                    const level = nodeInfo.lv || 1;
                    const refer = nodeInfo.refer || '';
                    // 检查是否为顶级节点：层级为1，或refer为空、"0"
                    const isTopLevel = level === 1 || !refer || refer.trim() === '' || refer.trim() === '0';
                    if (isTopLevel) {
                        topLevelNodes++;
                    }
                    else {
                        // 非顶级节点，检查 refer 是否存在
                        const referTrimmed = refer.trim().toLowerCase();
                        const referExists = walletSet.has(referTrimmed);
                        if (referExists) {
                            validNodes++;
                        }
                        else {
                            // 层级>1 且 refer 指向的节点不存在，才是孤点
                            orphanNodes++;
                        }
                    }
                }
                catch (error) {
                    console.error(`❌ 处理节点 ${wallet} 时出错:`, error.message);
                }
            }
            return {
                totalNodes,
                topLevelNodes,
                validNodes,
                orphanNodes,
                percentage: totalNodes > 0 ? ((orphanNodes / totalNodes) * 100).toFixed(2) : 0
            };
        }
        catch (error) {
            console.error('❌ 获取统计信息失败:', error.message);
            throw error;
        }
        finally {
            await this.disconnect();
        }
    }
}
// 如果直接运行此文件，执行清理操作
if (require.main === module) {
    (async () => {
        // 从命令行参数获取前缀和命令
        const args = process.argv.slice(2);
        const prefix = args.find(arg => arg.startsWith('--prefix='))?.split('=')[1] || 'new_wallet:';
        const dryRun = args.includes('--dry-run') || args.includes('-d');
        // 检查命令类型
        const removeIndex = args.findIndex(arg => arg === 'remove' || arg === 'del');
        const listIndex = args.findIndex(arg => arg === 'list' || arg === 'ls');
        if (listIndex >= 0) {
            // 列出所有钱包
            const executor = new DatabaseCleanupExecutor(prefix);
            try {
                // 解析过滤选项
                const minLevel = args.find(arg => arg.startsWith('--min-level='))?.split('=')[1];
                const maxLevel = args.find(arg => arg.startsWith('--max-level='))?.split('=')[1];
                const options = {
                    minLevel: minLevel ? parseInt(minLevel) : null,
                    maxLevel: maxLevel ? parseInt(maxLevel) : null,
                    sortByLevel: true
                };
                console.log(`📋 获取所有钱包列表`);
                console.log(`前缀: ${prefix}`);
                if (minLevel)
                    console.log(`最小层级: ${minLevel}`);
                if (maxLevel)
                    console.log(`最大层级: ${maxLevel}`);
                console.log('='.repeat(80));
                const result = await executor.getAllWallets(options);
                if (result.success) {
                    console.log(`\n✅ ${result.message}`);
                }
                else {
                    console.log(`\n❌ ${result.message}`);
                    process.exit(1);
                }
                await executor.disconnect();
            }
            catch (error) {
                console.error('❌ 执行失败:', error);
                process.exit(1);
            }
        }
        else if (removeIndex >= 0 && removeIndex + 1 < args.length) {
            // 删除指定地址及其子集
            const wallet = args[removeIndex + 1];
            console.log(`🗑️ 删除地址及其所有子集`);
            console.log(`前缀: ${prefix}`);
            console.log(`地址: ${wallet}`);
            console.log(`模式: ${dryRun ? '试运行（不会实际删除）' : '删除模式'}`);
            console.log('='.repeat(80));
            const executor = new DatabaseCleanupExecutor(prefix);
            try {
                const result = await executor.removeWalletAndDescendants(wallet, dryRun);
                if (result.success) {
                    console.log(`\n✅ ${result.message}`);
                }
                else {
                    console.log(`\n❌ ${result.message}`);
                    process.exit(1);
                }
                await executor.disconnect();
            }
            catch (error) {
                console.error('❌ 执行失败:', error);
                process.exit(1);
            }
        }
        else {
            // 默认清理孤点数据
            console.log(`📊 数据库清理工具`);
            console.log(`前缀: ${prefix}`);
            console.log(`模式: ${dryRun ? '试运行（不会实际删除）' : '删除模式'}`);
            console.log('='.repeat(80));
            const executor = new DatabaseCleanupExecutor(prefix);
            try {
                // 先显示统计信息
                console.log('\n📊 统计信息:');
                await executor.init();
                const stats = await executor.getStats(false);
                console.log(`总节点数: ${stats.totalNodes}`);
                console.log(`顶级节点: ${stats.topLevelNodes}`);
                console.log(`有效节点: ${stats.validNodes}`);
                console.log(`孤点节点: ${stats.orphanNodes} (${stats.percentage}%)`);
                // 执行清理（复用已有连接）
                console.log('\n' + '='.repeat(80));
                const result = await executor.removeOrphanNodes(dryRun);
                if (result.success) {
                    console.log(`\n✅ ${result.message}`);
                }
                else {
                    console.log(`\n❌ ${result.message}`);
                    process.exit(1);
                }
                await executor.disconnect();
            }
            catch (error) {
                console.error('❌ 执行失败:', error);
                process.exit(1);
            }
        }
    })();
}
module.exports = DatabaseCleanupExecutor;
