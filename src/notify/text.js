const fs = require('fs');
const path = require('path');

/**
 * 消息模板封装
 * 使用HTML格式，简洁明了
 */
class MessageTemplates {
    // 地址昵称映射
    static addressNicknames = new Map();
    
    /**
     * 初始化地址昵称映射
     */
    static initAddressNicknames() {
        try {
            const nicknamesPath = path.join(__dirname, '../../data/address_nicknames.json');
            const nicknamesData = JSON.parse(fs.readFileSync(nicknamesPath, 'utf8'));
            
            // 转换为小写地址的映射
            for (const [address, nickname] of Object.entries(nicknamesData)) {
                this.addressNicknames.set(address.toLowerCase(), nickname);
            }
            
            console.log(`✅ 已加载 ${this.addressNicknames.size} 个地址昵称`);
        } catch (error) {
            console.warn('⚠️ 加载地址昵称失败:', error.message);
        }
    }
    
    /**
     * 获取地址昵称
     * @param {string} address - 地址
     * @returns {string} 昵称或格式化地址
     */
    static getAddressNickname(address) {
        if (!address) return 'Unknown';
        
        const nickname = this.addressNicknames.get(address.toLowerCase());
        if (nickname) {
            return nickname;
        }
        
        // 如果没有昵称，返回格式化的地址
        return this.formatAddress(address);
    }
    
    /**
     * 格式化代币数值为4位小数
     * @param {string} value - 代币数值字符串
     * @returns {string} 格式化后的数值
     */
    static formatTokenValue(value) {
        if (!value) return '0.0000';
        
        try {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) return value;
            
            // 格式化为4位小数，移除末尾的0
            return numValue.toFixed(4).replace(/\.?0+$/, '');
        } catch (error) {
            return value;
        }
    }
    
    /**
     * 分析交易中的发送和接收情况
     * @param {Object} tx - 交易数据
     * @param {Set} monitoredAddresses - 监控地址集合
     * @param {Map} addressNames - 地址名称映射
     * @returns {Object} 分析结果
     */
    static analyzeTransaction(tx, monitoredAddresses, addressNames) {
        const analysis = {
            hasActivity: false,
            walletName: '',
            walletAddress: '',
            received: [],
            sent: []
        };

        // 确定钱包名称（暂时只监控发送方）
        const walletAddress = tx.from;
        analysis.walletAddress = walletAddress;
        analysis.walletName = addressNames.get(walletAddress.toLowerCase()) || 'Unknown';

        // 分析BNB变化
        if (tx.bnbChange && (tx.bnbChange.from !== '0' || tx.bnbChange.to !== '0')) {
            // 检查是否涉及监控地址
            const fromAddress = tx.from.toLowerCase();
            const toAddress = tx.to.toLowerCase();
            
            // 只监控发送方地址（tx.from）
            if (monitoredAddresses.has(fromAddress)) {
                analysis.hasActivity = true;
                
                // 处理接收的BNB
                // 由于监控都是基于tx.from，监控地址通常不会接收BNB
                // 只有在特殊情况下（如转账给监控地址）才会接收BNB
                // 但这种情况很少见，暂时不处理
                
                // 处理发送的BNB（用户发送BNB给合约）
                if (tx.bnbChange.from !== '0') {
                    analysis.sent.push({
                        type: 'bnb',
                        formattedValue: tx.bnbChange.from,
                        from: fromAddress, // 从用户地址发送
                        to: toAddress      // 到合约地址
                    });
                }
            }
        }

        // 分析ERC20变化
        if (tx.erc20Changes && tx.erc20Changes.length > 0) {
            // 只监控交易发起者（tx.from）
            if (monitoredAddresses.has(tx.from.toLowerCase())) {
                analysis.hasActivity = true;
                
                for (const change of tx.erc20Changes) {
                    const fromAddress = change.from.toLowerCase();
                    const toAddress = change.to.toLowerCase();
                    const txFromAddress = tx.from.toLowerCase();
                    
                    // 处理接收的代币（监控地址接收代币）
                    if (toAddress === txFromAddress) {
                        analysis.received.push({
                            type: 'token',
                            tokenAddress: change.tokenAddress,
                            tokenSymbol: change.tokenSymbol,
                            formattedValue: change.formattedValue,
                            from: fromAddress,
                            to: toAddress
                        });
                    }
                    
                    // 处理发送的代币（监控地址发送代币）
                    if (fromAddress === txFromAddress) {
                        analysis.sent.push({
                            type: 'token',
                            tokenAddress: change.tokenAddress,
                            tokenSymbol: change.tokenSymbol,
                            formattedValue: change.formattedValue,
                            from: fromAddress,
                            to: toAddress
                        });
                    }
                }
            }
        }

        return analysis;
    }
    
    /**
     * 交易消息模板（统一处理BNB和代币）
     * @param {Object} data - 交易数据
     * @returns {string} HTML格式消息
     */
    static tokenTransfer(data) {
        const { 
            hash, 
            walletName, 
            walletAddress,
            received, 
            sent 
        } = data;
        
        let message = `<a href="https://bscscan.com/address/${walletAddress}">${walletName}</a> · BNB\n`;
        
        // 处理接收
        if (received && received.length > 0) {
            received.forEach(item => {
                if (item.type === 'bnb') {
                    const fromNickname = this.getAddressNickname(item.from);
                    message += `Received: ${item.formattedValue} BNB From <a href="https://bscscan.com/address/${item.from}">${fromNickname}</a>\n`;
                } else if (item.type === 'token') {
                    const fromNickname = this.getAddressNickname(item.from);
                    // 格式化代币数值为4位小数
                    const formattedTokenValue = this.formatTokenValue(item.formattedValue);
                    message += `Received: ${formattedTokenValue} <a href="https://bscscan.com/token/${item.tokenAddress}">${item.tokenSymbol}</a> From <a href="https://bscscan.com/address/${item.from}">${fromNickname}</a>\n`;
                }
            });
        }
        
        // 处理发送
        if (sent && sent.length > 0) {
            sent.forEach(item => {
                if (item.type === 'bnb') {
                    const toNickname = this.getAddressNickname(item.to);
                    // 将负值转换为正值显示
                    const displayValue = item.formattedValue.startsWith('-') 
                        ? item.formattedValue.substring(1) 
                        : item.formattedValue;
                    message += `Sent: ${displayValue} BNB To <a href="https://bscscan.com/address/${item.to}">${toNickname}</a>\n`;
                } else if (item.type === 'token') {
                    const toNickname = this.getAddressNickname(item.to);
                    // 将负值转换为正值显示并格式化代币数值为4位小数
                    const displayValue = item.formattedValue.startsWith('-') 
                        ? item.formattedValue.substring(1) 
                        : item.formattedValue;
                    const formattedTokenValue = this.formatTokenValue(displayValue);
                    message += `Sent: ${formattedTokenValue} <a href="https://bscscan.com/token/${item.tokenAddress}">${item.tokenSymbol}</a> To <a href="https://bscscan.com/address/${item.to}">${toNickname}</a>\n`;
                }
            });
        }
        
        message += `<a href="https://bscscan.com/tx/${hash}">TX hash</a>`;
        
        return message.trim();
    }

    /**
     * 纯BNB转账消息模板
     * @param {Object} data - 交易数据
     * @returns {string} HTML格式消息
     */
    static bnbTransfer(data) {
        const { 
            hash, 
            walletName, 
            received, 
            sent 
        } = data;
        
        let message = `<b>${walletName} · BNB</b>\n`;
        
        // 处理接收的BNB
        if (received && received.length > 0) {
            received.forEach(item => {
                message += `Received: ${item.formattedValue} BNB From <a href="https://bscscan.com/address/${item.from}">${item.from.slice(0, 6)}...${item.from.slice(-4)}</a>\n`;
            });
        }
        
        // 处理发送的BNB
        if (sent && sent.length > 0) {
            sent.forEach(item => {
                message += `Sent: ${item.formattedValue} BNB To <a href="https://bscscan.com/address/${item.to}">${item.to.slice(0, 6)}...${item.to.slice(-4)}</a>\n`;
            });
        }
        
        message += `<a href="https://bscscan.com/tx/${hash}">TX hash</a>`;
        
        return message.trim();
    }

    /**
     * 新钱包发现消息模板
     * @param {Object} data - 新钱包数据
     * @returns {string} HTML格式消息
     */
    static newWallet(data) {
        const { wallet, name, refer, referName } = data;
        
        return `
<b>🆕 新钱包发现</b>

<b>地址:</b> <code>${wallet}</code>
<b>名称:</b> ${name}
<b>上级:</b> ${referName} (<code>${refer}</code>)

<b>已自动添加到监控列表</b>
        `.trim();
    }

    /**
     * 系统状态消息模板
     * @param {Object} data - 状态数据
     * @returns {string} HTML格式消息
     */
    static systemStatus(data) {
        const { 
            monitoredWallets, 
            latestBlock, 
            processedBlocks, 
            foundTransactions,
            uptime 
        } = data;
        
        return `
<b>📊 系统状态</b>

<b>监控地址:</b> ${monitoredWallets} 个
<b>最新区块:</b> ${latestBlock}
<b>已处理区块:</b> ${processedBlocks}
<b>发现交易:</b> ${foundTransactions}
<b>运行时间:</b> ${uptime}
        `.trim();
    }

    /**
     * 错误消息模板
     * @param {Object} data - 错误数据
     * @returns {string} HTML格式消息
     */
    static error(data) {
        const { error, blockNumber, timestamp } = data;
        
        return `
<b>❌ 系统错误</b>

<b>错误:</b> ${error}
<b>区块:</b> ${blockNumber || 'N/A'}
<b>时间:</b> ${timestamp || new Date().toISOString()}
        `.trim();
    }

    /**
     * 批量交易汇总消息模板
     * @param {Object} data - 汇总数据
     * @returns {string} HTML格式消息
     */
    static batchSummary(data) {
        const { 
            blockRange, 
            totalTransactions, 
            bnbTransfers, 
            tokenTransfers,
            newWallets 
        } = data;
        
        return `
<b>📈 区块汇总</b>

<b>区块范围:</b> ${blockRange}
<b>总交易:</b> ${totalTransactions}
<b>BNB转账:</b> ${bnbTransfers}
<b>代币转账:</b> ${tokenTransfers}
<b>新钱包:</b> ${newWallets}
        `.trim();
    }

    /**
     * 格式化地址显示（截取前后部分）
     * @param {string} address - 完整地址
     * @param {number} prefixLength - 前缀长度
     * @param {number} suffixLength - 后缀长度
     * @returns {string} 格式化后的地址
     */
    static formatAddress(address, prefixLength = 6, suffixLength = 4) {
        if (!address || address.length <= prefixLength + suffixLength) {
            return address;
        }
        return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
    }

    /**
     * 格式化时间显示
     * @param {string} timestamp - 时间戳字符串
     * @returns {string} 格式化后的时间
     */
    static formatTime(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return timestamp;
        }
    }

    /**
     * 格式化金额显示
     * @param {string} amount - 金额字符串
     * @param {number} decimals - 小数位数
     * @returns {string} 格式化后的金额
     */
    static formatAmount(amount, decimals = 4) {
        try {
            const num = parseFloat(amount);
            if (isNaN(num)) return amount;
            
            if (num >= 1000000) {
                return `${(num / 1000000).toFixed(2)}M`;
            } else if (num >= 1000) {
                return `${(num / 1000).toFixed(2)}K`;
            } else {
                return num.toFixed(decimals);
            }
        } catch (error) {
            return amount;
        }
    }
}

module.exports = MessageTemplates;
