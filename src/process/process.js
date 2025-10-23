const { ethers } = require('ethers');

/**
 * 交易处理器 - 识别和解析交易类型
 * 支持原生BNB转账和ERC20代币交易识别
 */
class TransactionProcessor {
    constructor(provider) {
        this.provider = provider;
        
        // ERC20 Transfer 事件签名
        this.TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        // 常见的ERC20方法签名
        this.ERC20_METHODS = {
            transfer: '0xa9059cbb',
            transferFrom: '0x23b872dd',
            approve: '0x095ea7b3',
            allowance: '0xdd62ed3e',
            balanceOf: '0x70a08231',
            totalSupply: '0x18160ddd',
            name: '0x06fdde03',
            symbol: '0x95d89b41',
            decimals: '0x313ce567'
        };
    }

    /**
     * 检查地址是否为EOA（外部拥有账户）
     * @param {string} address - 要检查的地址
     * @returns {Promise<boolean>} 是否为EOA
     */
    async isEOA(address) {
        try {
            if (!ethers.isAddress(address)) {
                return false;
            }
            
            // 检查地址的代码长度，EOA的代码长度为0
            const code = await this.provider.getCode(address);
            return code === '0x';
        } catch (error) {
            console.error(`❌ 检查EOA失败 ${address}:`, error.message);
            return false;
        }
    }

    /**
     * 解析交易数据，识别交易类型
     * @param {Object} transaction - 交易对象
     * @param {Object} receipt - 交易收据（可选）
     * @returns {Promise<Object>} 解析后的交易数据
     */
    async parseTransaction(transaction, receipt = null) {
        try {
            const result = {
                // 基本信息
                hash: transaction.hash,
                blockNumber: transaction.blockNumber,
                timestamp: transaction.timestamp && !isNaN(transaction.timestamp) 
                    ? transaction.timestamp 
                    : Math.floor(Date.now() / 1000),
                from: transaction.from,
                to: transaction.to,
                value: transaction.value || '0',
                gasPrice: transaction.gasPrice || '0',
                gasLimit: transaction.gasLimit || '0',
                gasUsed: receipt?.gasUsed || '0',
                status: receipt?.status || transaction.status,
                
                // 交易类型分析
                isTransfer: false,
                isERC20Transaction: false,
                isEOA: false,
                
                // 金额变化
                bnbChange: {
                    from: '0',
                    to: '0'
                },
                erc20Changes: [],
                
                // 交易详情
                transactionType: 'unknown',
                methodSignature: null,
                inputData: transaction.data || '0x'
            };

            // console.log(result);

            // 检查是否为EOA
            if (transaction.to) {
                result.isEOA = await this.isEOA(transaction.to);
            }

            // 分析BNB变化
            await this.analyzeBNBChange(transaction, result);

            // 分析交易类型
            await this.analyzeTransactionType(transaction, result);

            // 如果有收据，分析ERC20事件
            if (receipt && receipt.logs) {
                await this.analyzeERC20Events(receipt.logs, result);
            }

            return result;

        } catch (error) {
            console.error(`❌ 解析交易失败 ${transaction.hash}:`, error.message);
            return null;
        }
    }

    /**
     * 分析BNB变化
     * @param {Object} transaction - 交易对象
     * @param {Object} result - 结果对象
     */
    async analyzeBNBChange(transaction, result) {
        const value = BigInt(transaction.value || '0');
        
        if (value > 0) {
            result.isTransfer = true;
            result.transactionType = 'bnb_transfer';
            
            // BNB从发送方减少
            result.bnbChange.from = `-${ethers.formatEther(value)}`;
            
            // BNB到接收方增加
            if (transaction.to) {
                result.bnbChange.to = ethers.formatEther(value);
            }
        }
    }

    /**
     * 分析交易类型
     * @param {Object} transaction - 交易对象
     * @param {Object} result - 结果对象
     */
    async analyzeTransactionType(transaction, result) {
        const inputData = transaction.data || '0x';
        
        if (inputData === '0x' || inputData === '0x0') {
            // 没有输入数据，纯BNB转账
            if (BigInt(transaction.value || '0') > 0) {
                result.transactionType = 'bnb_transfer';
                result.isTransfer = true;
            } else {
                result.transactionType = 'contract_call';
            }
        } else {
            // 有输入数据，可能是合约调用
            const methodSignature = inputData.slice(0, 10);
            result.methodSignature = methodSignature;
            
            // 检查是否为ERC20方法
            if (Object.values(this.ERC20_METHODS).includes(methodSignature)) {
                result.isERC20Transaction = true;
                result.transactionType = 'erc20_transaction';
                
                // 识别具体的ERC20方法
                if (methodSignature === this.ERC20_METHODS.transfer) {
                    result.transactionType = 'erc20_transfer';
                } else if (methodSignature === this.ERC20_METHODS.transferFrom) {
                    result.transactionType = 'erc20_transfer_from';
                } else if (methodSignature === this.ERC20_METHODS.approve) {
                    result.transactionType = 'erc20_approve';
                }
            } else {
                result.transactionType = 'contract_call';
            }
        }
    }

    /**
     * 分析ERC20事件
     * @param {Array} logs - 事件日志
     * @param {Object} result - 结果对象
     */
    async analyzeERC20Events(logs, result) {
        for (const log of logs) {
            if (log.topics[0] === this.TRANSFER_EVENT_SIGNATURE) {
                try {
                    const erc20Change = await this.parseTransferEvent(log);
                    if (erc20Change) {
                        result.erc20Changes.push(erc20Change);
                        result.isERC20Transaction = true;
                        
                        // 如果是Transfer事件，标记为转账交易
                        if (erc20Change.type === 'transfer') {
                            result.isTransfer = true;
                        }
                    }
                } catch (error) {
                    console.error(`❌ 解析Transfer事件失败:`, error.message);
                }
            }
        }
    }

    /**
     * 解析Transfer事件
     * @param {Object} log - 事件日志
     * @returns {Promise<Object>} 解析后的事件数据
     */
    async parseTransferEvent(log) {
        try {
            // Transfer事件结构: Transfer(address indexed from, address indexed to, uint256 value)
            const from = ethers.getAddress('0x' + log.topics[1].slice(26));
            const to = ethers.getAddress('0x' + log.topics[2].slice(26));
            const value = BigInt(log.data);

            // 获取代币信息
            const tokenInfo = await this.getTokenInfo(log.address);

            return {
                type: 'transfer',
                tokenAddress: log.address,
                tokenSymbol: tokenInfo.symbol,
                tokenName: tokenInfo.name,
                tokenDecimals: tokenInfo.decimals,
                from: from,
                to: to,
                value: value.toString(),
                formattedValue: this.formatTokenValue(value, tokenInfo.decimals),
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
                logIndex: log.logIndex
            };

        } catch (error) {
            console.error(`❌ 解析Transfer事件失败:`, error.message);
            return null;
        }
    }

    /**
     * 获取代币信息
     * @param {string} tokenAddress - 代币合约地址
     * @returns {Promise<Object>} 代币信息
     */
    async getTokenInfo(tokenAddress) {
        try {
            const contract = new ethers.Contract(tokenAddress, [
                'function name() view returns (string)',
                'function symbol() view returns (string)',
                'function decimals() view returns (uint8)'
            ], this.provider);

            const [name, symbol, decimals] = await Promise.all([
                contract.name().catch(() => 'Unknown'),
                contract.symbol().catch(() => 'UNKNOWN'),
                contract.decimals().catch(() => 18)
            ]);

            return { name, symbol, decimals };

        } catch (error) {
            console.error(`❌ 获取代币信息失败 ${tokenAddress}:`, error.message);
            return { name: 'Unknown', symbol: 'UNKNOWN', decimals: 18 };
        }
    }

    /**
     * 格式化代币数量
     * @param {BigInt} value - 原始值
     * @param {number} decimals - 小数位数
     * @returns {string} 格式化后的值
     */
    formatTokenValue(value, decimals) {
        try {
            return ethers.formatUnits(value, decimals);
        } catch (error) {
            return value.toString();
        }
    }

    /**
     * 批量处理交易
     * @param {Array} transactions - 交易列表
     * @param {Array} receipts - 交易收据列表（可选）
     * @returns {Promise<Array>} 处理后的交易数据
     */
    async processTransactions(transactions, receipts = []) {
        const results = [];
        
        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            const receipt = receipts[i] || null;
            // console.log('x');
            
            try {
                const parsed = await this.parseTransaction(transaction, receipt);
                if (parsed) {
                    results.push(parsed);
                }
                // console.log('xx');
                
                // 避免请求过于频繁
                if (i % 10 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
            } catch (error) {
                console.error(`❌ 处理交易失败 ${transaction.hash}:`, error.message);
            }
        }
        
        return results;
    }

    /**
     * 获取交易收据
     * @param {string} transactionHash - 交易哈希
     * @returns {Promise<Object>} 交易收据
     */
    async getTransactionReceipt(transactionHash) {
        try {
            return await this.provider.getTransactionReceipt(transactionHash);
        } catch (error) {
            console.error(`❌ 获取交易收据失败 ${transactionHash}:`, error.message);
            return null;
        }
    }

    /**
     * 获取交易
     * @param {string} transactionHash - 交易哈希
     * @returns {Promise<Object>} 交易
     */
    async getTransaction(transactionHash) {
        try {
            return await this.provider.getTransaction(transactionHash);
        } catch (error) {
            console.error(`❌ 获取交易失败 ${transactionHash}:`, error.message);
            return null;
        }
    }

    /**
     * 格式化输出结果
     * @param {Object} parsedTransaction - 解析后的交易数据
     * @returns {Object} 格式化后的结果
     */
    formatOutput(parsedTransaction) {
        return {
            // 基本信息
            hash: parsedTransaction.hash,
            blockNumber: parsedTransaction.blockNumber,
            timestamp: parsedTransaction.timestamp && !isNaN(parsedTransaction.timestamp) 
                ? new Date(parsedTransaction.timestamp * 1000).toISOString()
                : new Date().toISOString(), // 如果时间戳无效，使用当前时间
            from: parsedTransaction.from,
            to: parsedTransaction.to,
            
            // 交易类型
            transactionType: parsedTransaction.transactionType,
            isTransfer: parsedTransaction.isTransfer,
            isERC20Transaction: parsedTransaction.isERC20Transaction,
            isEOA: parsedTransaction.isEOA,
            
            // 金额变化
            bnbChange: {
                from: parsedTransaction.bnbChange.from,
                to: parsedTransaction.bnbChange.to,
                formatted: {
                    from: parsedTransaction.bnbChange.from ? `${parsedTransaction.bnbChange.from} BNB` : '0 BNB',
                    to: parsedTransaction.bnbChange.to ? `${parsedTransaction.bnbChange.to} BNB` : '0 BNB'
                }
            },
            
            // ERC20变化
            erc20Changes: parsedTransaction.erc20Changes.map(change => ({
                type: change.type,
                tokenAddress: change.tokenAddress,
                tokenSymbol: change.tokenSymbol,
                tokenName: change.tokenName,
                from: change.from,
                to: change.to,
                value: change.value,
                formattedValue: change.formattedValue,
                formatted: `${change.formattedValue} ${change.tokenSymbol}`
            })),
            
            // Gas信息
            gas: {
                price: ethers.formatUnits(parsedTransaction.gasPrice, 'gwei'),
                limit: parsedTransaction.gasLimit.toString(),
                used: parsedTransaction.gasUsed.toString(),
                formatted: {
                    price: `${ethers.formatUnits(parsedTransaction.gasPrice, 'gwei')} Gwei`,
                    limit: parsedTransaction.gasLimit.toString(),
                    used: parsedTransaction.gasUsed.toString()
                }
            },
            
            // 状态
            status: parsedTransaction.status,
            success: parsedTransaction.status === 1
        };
    }
}

module.exports = TransactionProcessor;

// 
if (require.main === module) {
    (async () => {
        const provider = new ethers.JsonRpcProvider('https://dragon.maiko.icu/bsc2h');
        const processor = new TransactionProcessor(provider);
        const txHash = '0x376e9add623dc0a1eaac5f7252cfcabab66fb746727d2debb92a4ceb310f3d20';
        const transaction = await processor.getTransaction(txHash);
        const receipt = await processor.getTransactionReceipt(txHash);
        // console.log(receipt);
        processor.processTransactions([transaction], [receipt]).then(_r => {
            console.log(_r[0].erc20Changes);
        });
    })();

}