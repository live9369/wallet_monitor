"use strict";
// @ts-nocheck
// refRedis.js
Object.defineProperty(exports, "__esModule", { value: true });
const { createClient } = require("redis");
class RefRedis {
    /**
     * @param {object} options redis 配置选项
     * @param {string} prefix key 前缀，防冲突
     */
    constructor(options = {}, prefix = "ref:") {
        // 合并默认配置，启用自动重连
        const defaultOptions = {
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('❌ Redis重连失败次数过多，停止重试');
                        return new Error('Redis重连失败');
                    }
                    // 指数退避：1秒、2秒、4秒...最多5秒
                    const delay = Math.min(retries * 1000, 5000);
                    console.log(`🔄 Redis重连中... (第${retries}次，${delay}ms后重试)`);
                    return delay;
                },
                connectTimeout: 10000,
            },
        };
        // 合并用户配置和默认配置
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            socket: {
                ...defaultOptions.socket,
                ...(options.socket || {})
            }
        };
        this.redis = createClient(mergedOptions);
        this.prefix = prefix;
        // 连接错误监听
        this.redis.on("error", (err) => {
            console.error("Redis error:", err);
        });
        // 监听重连事件
        this.redis.on("reconnecting", () => {
            console.log("🔄 Redis正在重连...");
        });
        // 监听连接就绪事件
        this.redis.on("ready", () => {
            console.log("✅ Redis连接就绪");
        });
    }
    /**
     * 确保Redis连接有效
     * 如果连接断开，会尝试重新连接
     */
    async connect() {
        try {
            // 如果连接已断开，尝试重连
            if (!this.redis.isOpen) {
                try {
                    await this.redis.connect();
                }
                catch (connectError) {
                    // 如果是"客户端正在连接中"的错误，忽略
                    if (connectError.message && !connectError.message.includes('Client is already connecting')) {
                        throw connectError;
                    }
                }
            }
            // 验证连接是否真的可用（通过ping测试）
            try {
                await this.redis.ping();
            }
            catch (pingError) {
                // ping失败，说明连接无效，强制重连
                console.warn('⚠️ Redis连接无效，尝试重新连接...');
                try {
                    if (this.redis.isOpen) {
                        await this.redis.quit().catch(() => { }); // 忽略关闭错误
                    }
                }
                catch (e) {
                    // 忽略关闭错误
                }
                // 等待一下再重连
                await new Promise(resolve => setTimeout(resolve, 100));
                await this.redis.connect();
                // 再次验证
                await this.redis.ping();
            }
        }
        catch (error) {
            // 如果是连接数限制错误，等待后重试
            if (error.message && error.message.includes('max number of clients')) {
                console.warn('⚠️ Redis连接数已达上限，等待后重试...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
                // 递归重试（最多3次）
                if (!this._retryCount)
                    this._retryCount = 0;
                if (this._retryCount < 3) {
                    this._retryCount++;
                    return this.connect();
                }
                this._retryCount = 0;
            }
            console.error('❌ Redis连接失败:', error.message);
            throw error;
        }
        // 重置重试计数
        this._retryCount = 0;
    }
    nodeKey(wallet) {
        return `${this.prefix}node:${wallet.toLowerCase()}`;
    }
    allWalletsKey() {
        return `${this.prefix}all_wallets`;
    }
    generateId() {
        // 简单 id 生成方式：时间戳 + 随机
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    /** 通用增加 */
    async addNode(info) {
        await this.connect();
        const wallet = info.wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        const exists = await this.redis.exists(key);
        if (exists) {
            throw new Error(`Node already exists for wallet: ${wallet}`);
        }
        const hash = {
            id: info.id,
            name: info.name,
            wallet: wallet,
            refer: info.refer.toLowerCase(),
            refer_id: info.refer_id,
            lv: info.lv.toString(),
        };
        await this.redis.hSet(key, hash);
        await this.redis.sAdd(this.allWalletsKey(), wallet);
    }
    /** 简略增加：只提供 wallet, name, refer */
    async addNodeLite(wallet, name, refer) {
        await this.connect();
        wallet = wallet.toLowerCase();
        refer = refer.toLowerCase();
        const existsRef = await this.existsWallet(refer);
        let lv, referIdChain;
        if (!existsRef) {
            // 没有上级，做顶层
            lv = 1;
            referIdChain = "";
        }
        else {
            const parentKey = this.nodeKey(refer);
            const parent = await this.redis.hGetAll(parentKey);
            const parentLv = parseInt(parent.lv || "0");
            const parentReferId = parent.refer_id || "";
            lv = parentLv + 1;
            if (parentReferId && parentReferId.length > 0) {
                referIdChain = parentReferId + ";" + parent.id;
            }
            else {
                referIdChain = parent.id;
            }
        }
        const id = this.generateId();
        const info = {
            id,
            name,
            wallet,
            refer,
            refer_id: referIdChain,
            lv,
        };
        await this.addNode(info);
    }
    /** 更新节点字段（部分更新） */
    async updateNode(wallet, fields) {
        await this.connect();
        wallet = wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        const exists = await this.redis.exists(key);
        if (!exists) {
            throw new Error(`Node does not exist for wallet: ${wallet}`);
        }
        const updateHash = {};
        if (fields.id !== undefined)
            updateHash.id = fields.id;
        if (fields.name !== undefined)
            updateHash.name = fields.name;
        if (fields.refer !== undefined)
            updateHash.refer = fields.refer.toLowerCase();
        if (fields.refer_id !== undefined)
            updateHash.refer_id = fields.refer_id;
        if (fields.lv !== undefined)
            updateHash.lv = fields.lv.toString();
        if (Object.keys(updateHash).length > 0) {
            await this.redis.hSet(key, updateHash);
        }
    }
    /** 移除节点 */
    async removeNode(wallet) {
        await this.connect();
        const originalWallet = wallet;
        wallet = wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        await this.redis.del(key);
        // 尝试移除原始版本和小写版本
        await this.redis.sRem(this.allWalletsKey(), originalWallet);
        await this.redis.sRem(this.allWalletsKey(), wallet);
    }
    /** 清理所有地址 */
    async clearAllWallets() {
        await this.connect();
        try {
            // 获取所有钱包地址
            const wallets = await this.getAllWallets();
            console.log(`🗑️ 开始清理 ${wallets.length} 个钱包地址...`);
            let removedCount = 0;
            // 逐个删除钱包节点
            for (const wallet of wallets) {
                try {
                    const key = this.nodeKey(wallet.toLowerCase());
                    await this.redis.del(key);
                    removedCount++;
                }
                catch (error) {
                    console.warn(`⚠️ 删除钱包节点失败 ${wallet}:`, error.message);
                }
            }
            // 清空所有钱包集合
            await this.redis.del(this.allWalletsKey());
            console.log(`✅ 已清理 ${removedCount} 个钱包地址`);
            return removedCount;
        }
        catch (error) {
            console.error('❌ 清理所有钱包失败:', error.message);
            throw error;
        }
    }
    /** 断开Redis连接 */
    async disconnect() {
        try {
            if (this.redis && this.redis.isOpen) {
                await this.redis.quit();
                console.log('✅ Redis连接已断开');
            }
        }
        catch (error) {
            console.error('❌ 断开Redis连接失败:', error.message);
        }
    }
    /** 查询地址是否存在 */
    async existsWallet(wallet) {
        await this.connect();
        wallet = wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        const ex = await this.redis.exists(key);
        return ex === 1;
    }
    /** 查询 name 通过 wallet */
    async getNameByWallet(wallet) {
        await this.connect();
        wallet = wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        const name = await this.redis.hGet(key, "name");
        return name;
    }
    /** 查询地址列表 */
    async getAllWallets() {
        await this.connect();
        return await this.redis.sMembers(this.allWalletsKey());
    }
    /** 获取完整节点信息 */
    async getNodeInfo(wallet) {
        await this.connect();
        wallet = wallet.toLowerCase();
        const key = this.nodeKey(wallet);
        const obj = await this.redis.hGetAll(key);
        if (!obj || Object.keys(obj).length === 0) {
            return null;
        }
        return {
            id: obj.id,
            name: obj.name,
            wallet: obj.wallet,
            refer: obj.refer,
            refer_id: obj.refer_id,
            lv: parseInt(obj.lv || "0"),
        };
    }
    /** 查找所有直接子集地址 */
    async getChildrenWallets(parentWallet) {
        await this.connect();
        parentWallet = parentWallet.toLowerCase();
        const allWallets = await this.getAllWallets();
        const children = [];
        for (const wallet of allWallets) {
            const nodeInfo = await this.getNodeInfo(wallet);
            if (nodeInfo && nodeInfo.refer && nodeInfo.refer.toLowerCase() === parentWallet) {
                children.push(wallet);
            }
        }
        return children;
    }
    /** 递归查找所有子集地址（包括子集的子集） */
    async getAllDescendants(parentWallet) {
        await this.connect();
        const descendants = [];
        const toProcess = [parentWallet.toLowerCase()];
        while (toProcess.length > 0) {
            const current = toProcess.shift();
            const children = await this.getChildrenWallets(current);
            for (const child of children) {
                if (!descendants.includes(child)) {
                    descendants.push(child);
                    toProcess.push(child.toLowerCase());
                }
            }
        }
        return descendants;
    }
}
module.exports = RefRedis;
//
if (require.main === module) {
    async function test() {
        const ref = new RefRedis({ url: "redis://127.0.0.1:6379" }, "myref:");
        await ref.addNodeLite("0xabc1", "Alice", "");
        await ref.addNodeLite("0xdef2", "Bob", "0xabc1");
        await ref.addNodeLite("0xghi3", "Carol", "0xdef2");
        console.log("Exists Bob:", await ref.existsWallet("0xdef2")); // true
        console.log("Name of ghi3:", await ref.getNameByWallet("0xghi3")); // "Carol"
        console.log("All wallets:", await ref.getAllWallets()); // ["0xabc1", "0xdef2", "0xghi3"]
        console.log("Node info of ghi3:", await ref.getNodeInfo("0xghi3"));
        // 输出类似 { id: "...", name: "Carol", wallet: "0xghi3", refer: "0xdef2", refer_id: "...", lv: 3 }
        // 更新
        await ref.updateNode("0xghi3", { name: "Carol_New" });
        console.log("New Name:", await ref.getNameByWallet("0xghi3"));
        // 移除
        await ref.removeNode("0xghi3");
        console.log("Exists ghi3:", await ref.existsWallet("0xghi3")); // false
    }
    test().catch(console.error);
}
