// refRedis.js

const { createClient } = require("redis");

class RefRedis {
  /**
   * @param {object} options redis 配置选项
   * @param {string} prefix key 前缀，防冲突
   */
  constructor(options = {}, prefix = "ref:") {
    this.redis = createClient(options);
    this.prefix = prefix;

    // 连接错误监听
    this.redis.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  async connect() {
    if (!this.redis.isOpen) {
      await this.redis.connect();
    }
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
    } else {
      const parentKey = this.nodeKey(refer);
      const parent = await this.redis.hGetAll(parentKey);
      const parentLv = parseInt(parent.lv || "0");
      const parentReferId = parent.refer_id || "";
      lv = parentLv + 1;
      if (parentReferId && parentReferId.length > 0) {
        referIdChain = parentReferId + ";" + parent.id;
      } else {
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
    if (fields.id !== undefined) updateHash.id = fields.id;
    if (fields.name !== undefined) updateHash.name = fields.name;
    if (fields.refer !== undefined) updateHash.refer = fields.refer.toLowerCase();
    if (fields.refer_id !== undefined) updateHash.refer_id = fields.refer_id;
    if (fields.lv !== undefined) updateHash.lv = fields.lv.toString();

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
        } catch (error) {
          console.warn(`⚠️ 删除钱包节点失败 ${wallet}:`, error.message);
        }
      }
      
      // 清空所有钱包集合
      await this.redis.del(this.allWalletsKey());
      
      console.log(`✅ 已清理 ${removedCount} 个钱包地址`);
      return removedCount;
      
    } catch (error) {
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
    } catch (error) {
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
}

module.exports = RefRedis;

//
if (require.main === module) {

async function test() {
    const ref = new RefRedis({ url: "redis://127.0.0.1:6379" }, "myref:");
  
    await ref.addNodeLite("0xabc1", "Alice", "");
    await ref.addNodeLite("0xdef2", "Bob", "0xabc1");
    await ref.addNodeLite("0xghi3", "Carol", "0xdef2");
  
    console.log("Exists Bob:", await ref.existsWallet("0xdef2"));  // true
    console.log("Name of ghi3:", await ref.getNameByWallet("0xghi3")); // "Carol"
    console.log("All wallets:", await ref.getAllWallets()); // ["0xabc1", "0xdef2", "0xghi3"]
  
    console.log("Node info of ghi3:", await ref.getNodeInfo("0xghi3"));
    // 输出类似 { id: "...", name: "Carol", wallet: "0xghi3", refer: "0xdef2", refer_id: "...", lv: 3 }
  
    // 更新
    await ref.updateNode("0xghi3", { name: "Carol_New" });
    console.log("New Name:", await ref.getNameByWallet("0xghi3"));
  
    // 移除
    await ref.removeNode("0xghi3");
    console.log("Exists ghi3:", await ref.existsWallet("0xghi3"));  // false
  }
  
  test().catch(console.error);
}