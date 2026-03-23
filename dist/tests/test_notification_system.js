"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const MessageTemplates = require('../src/notify/text');
const TgBot = require('../src/notify/bot');
require('dotenv').config();
/**
 * 测试通知系统
 * 生成测试数据，测试消息生成和推送功能
 */
class NotificationTester {
    constructor() {
        this.bot = new TgBot();
        this.monitoredAddresses = new Set();
        this.addressNames = new Map();
        // 初始化测试数据
        this.setupTestData();
    }
    /**
     * 设置测试数据
     */
    setupTestData() {
        // 添加监控地址
        const testAddresses = [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0xabcdef1234567890abcdef1234567890abcdef12',
            '0x9876543210fedcba9876543210fedcba98765432',
            '0xfedcba0987654321fedcba0987654321fedcba09'
        ];
        testAddresses.forEach(addr => {
            this.monitoredAddresses.add(addr.toLowerCase());
        });
        // 设置地址名称
        this.addressNames.set('0x1234567890abcdef1234567890abcdef12345678', 'Alice');
        this.addressNames.set('0xabcdef1234567890abcdef1234567890abcdef12', 'Bob');
        this.addressNames.set('0x9876543210fedcba9876543210fedcba98765432', 'Charlie');
        this.addressNames.set('0xfedcba0987654321fedcba0987654321fedcba09', 'David');
        console.log('✅ 测试数据初始化完成');
        console.log(`📋 监控地址: ${Array.from(this.monitoredAddresses).join(', ')}`);
    }
    /**
     * 生成测试交易数据
     */
    generateTestTransactions() {
        return [
            // 测试1: 纯BNB转账
            {
                hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
                blockNumber: 12345678,
                timestamp: '2024-01-15T10:30:00.000Z',
                from: '0x1234567890abcdef1234567890abcdef12345678',
                to: '0xabcdef1234567890abcdef1234567890abcdef12',
                bnbChange: {
                    from: '-1.5',
                    to: '1.5'
                },
                erc20Changes: [],
                transactionType: 'bnb_transfer',
                isTransfer: true,
                isERC20Transaction: false
            },
            // 测试2: 代币转账
            {
                hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
                blockNumber: 12345679,
                timestamp: '2024-01-15T10:31:00.000Z',
                from: '0xabcdef1234567890abcdef1234567890abcdef12',
                to: '0x9876543210fedcba9876543210fedcba98765432',
                bnbChange: {
                    from: '0',
                    to: '0'
                },
                erc20Changes: [
                    {
                        type: 'transfer',
                        tokenAddress: '0x55d398326f99059ff775485246999027b3197955',
                        tokenSymbol: 'USDT',
                        tokenName: 'Tether USD',
                        from: '0xabcdef1234567890abcdef1234567890abcdef12',
                        to: '0x9876543210fedcba9876543210fedcba98765432',
                        value: '1000000000',
                        formattedValue: '1000.0'
                    }
                ],
                transactionType: 'erc20_transfer',
                isTransfer: true,
                isERC20Transaction: true
            },
            // 测试3: 混合交易（BNB + 代币）
            {
                hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
                blockNumber: 12345680,
                timestamp: '2024-01-15T10:32:00.000Z',
                from: '0x9876543210fedcba9876543210fedcba98765432',
                to: '0xfedcba0987654321fedcba0987654321fedcba09',
                bnbChange: {
                    from: '-0.5',
                    to: '0.5'
                },
                erc20Changes: [
                    {
                        type: 'transfer',
                        tokenAddress: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
                        tokenSymbol: 'USDC',
                        tokenName: 'USD Coin',
                        from: '0x9876543210fedcba9876543210fedcba98765432',
                        to: '0xfedcba0987654321fedcba0987654321fedcba09',
                        value: '500000000',
                        formattedValue: '500.0'
                    }
                ],
                transactionType: 'mixed_transfer',
                isTransfer: true,
                isERC20Transaction: true
            },
            // 测试4: 多次发送和接收
            {
                hash: '0x4444444444444444444444444444444444444444444444444444444444444444',
                blockNumber: 12345681,
                timestamp: '2024-01-15T10:33:00.000Z',
                from: '0xfedcba0987654321fedcba0987654321fedcba09',
                to: '0x1234567890abcdef1234567890abcdef12345678',
                bnbChange: {
                    from: '-0.2',
                    to: '0.2'
                },
                erc20Changes: [
                    {
                        type: 'transfer',
                        tokenAddress: '0x55d398326f99059ff775485246999027b3197955',
                        tokenSymbol: 'USDT',
                        tokenName: 'Tether USD',
                        from: '0xfedcba0987654321fedcba0987654321fedcba09',
                        to: '0x1234567890abcdef1234567890abcdef12345678',
                        value: '200000000',
                        formattedValue: '200.0'
                    },
                    {
                        type: 'transfer',
                        tokenAddress: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
                        tokenSymbol: 'USDC',
                        tokenName: 'USD Coin',
                        from: '0x1234567890abcdef1234567890abcdef12345678',
                        to: '0xfedcba0987654321fedcba0987654321fedcba09',
                        value: '100000000',
                        formattedValue: '100.0'
                    }
                ],
                transactionType: 'complex_transfer',
                isTransfer: true,
                isERC20Transaction: true
            },
            // 测试5: 不涉及监控地址的交易（应该被过滤）
            {
                hash: '0x5555555555555555555555555555555555555555555555555555555555555555',
                blockNumber: 12345682,
                timestamp: '2024-01-15T10:34:00.000Z',
                from: '0x1111111111111111111111111111111111111111',
                to: '0x2222222222222222222222222222222222222222',
                bnbChange: {
                    from: '-1.0',
                    to: '1.0'
                },
                erc20Changes: [],
                transactionType: 'bnb_transfer',
                isTransfer: true,
                isERC20Transaction: false
            }
        ];
    }
    /**
     * 测试消息生成
     */
    testMessageGeneration() {
        console.log('\n🧪 测试消息生成...\n');
        const testTransactions = this.generateTestTransactions();
        testTransactions.forEach((tx, index) => {
            console.log(`📋 测试 ${index + 1}: ${tx.transactionType}`);
            console.log('='.repeat(60));
            // 分析交易
            const analysis = MessageTemplates.analyzeTransaction(tx, this.monitoredAddresses, this.addressNames);
            if (analysis.hasActivity) {
                console.log(`✅ 检测到活动: ${analysis.walletName}`);
                console.log(`📥 接收: ${analysis.received.length} 项`);
                console.log(`📤 发送: ${analysis.sent.length} 项`);
                // 生成消息
                const message = MessageTemplates.tokenTransfer({
                    hash: tx.hash,
                    walletName: analysis.walletName,
                    walletAddress: analysis.walletAddress,
                    received: analysis.received,
                    sent: analysis.sent
                });
                console.log('\n📱 生成的消息:');
                console.log(message);
            }
            else {
                console.log('❌ 未检测到相关活动（正确过滤）');
            }
            console.log('\n' + '='.repeat(60) + '\n');
        });
    }
    /**
     * 测试消息推送
     */
    async testMessagePush() {
        console.log('\n📤 测试消息推送...\n');
        const testTransactions = this.generateTestTransactions();
        const chatId = process.env.CHAT_ID || '-4940120432';
        const threadId = process.env.THREAD_ID || null;
        let sentCount = 0;
        for (const tx of testTransactions) {
            // 分析交易
            const analysis = MessageTemplates.analyzeTransaction(tx, this.monitoredAddresses, this.addressNames);
            if (analysis.hasActivity) {
                // 生成消息
                const message = MessageTemplates.tokenTransfer({
                    hash: tx.hash,
                    walletName: analysis.walletName,
                    walletAddress: analysis.walletAddress,
                    received: analysis.received,
                    sent: analysis.sent
                });
                try {
                    // 使用立即发送方法
                    await this.bot.sendHtmlImmediate(chatId, message);
                    sentCount++;
                    console.log(`✅ 已发送测试消息 ${sentCount}: ${analysis.walletName}`);
                    // 等待一下避免发送过快
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                catch (error) {
                    console.error(`❌ 发送消息失败:`, error.message);
                }
            }
        }
        console.log(`\n📊 推送测试完成，共发送 ${sentCount} 条消息`);
    }
    /**
     * 运行完整测试
     */
    async runFullTest() {
        console.log('🚀 开始通知系统测试...\n');
        try {
            // 测试消息生成
            this.testMessageGeneration();
            // 询问是否进行推送测试
            console.log('❓ 是否进行消息推送测试？(需要配置有效的BOT_TOKEN和CHAT_ID)');
            console.log('   如果环境变量未配置，推送测试将失败');
            // 这里可以添加用户输入确认，但为了自动化测试，我们直接运行
            if (process.env.BOT_TOKEN && process.env.CHAT_ID) {
                await this.testMessagePush();
            }
            else {
                console.log('⚠️ 跳过推送测试（未配置BOT_TOKEN或CHAT_ID）');
            }
            console.log('\n✅ 通知系统测试完成!');
        }
        catch (error) {
            console.error('❌ 测试失败:', error.message);
        }
        finally {
            // 强制退出进程
            console.log('🔄 退出测试...');
            process.exit(0);
        }
    }
}
// 运行测试
if (require.main === module) {
    const tester = new NotificationTester();
    tester.runFullTest().catch(console.error);
}
module.exports = NotificationTester;
