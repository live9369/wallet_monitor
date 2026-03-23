// @ts-nocheck
const fs = require('fs');
const path = require('path');

/**
 * 日志管理器 - 支持按实例名称分离日志
 */
class Logger {
    constructor(instanceName = 'default') {
        this.instanceName = instanceName;
        this.logDir = './logs';
        this.setupLogDirectory();
        this.setupLogStreams();
    }

    /**
     * 创建日志目录
     */
    setupLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * 设置日志流
     */
    setupLogStreams() {
        const logFile = path.join(this.logDir, `${this.instanceName}.log`);
        const errorFile = path.join(this.logDir, `${this.instanceName}_error.log`);
        
        // 清理旧的日志文件（如果存在）
        if (fs.existsSync(logFile)) {
            fs.unlinkSync(logFile);
        }
        if (fs.existsSync(errorFile)) {
            fs.unlinkSync(errorFile);
        }
        
        // 创建新的日志流（使用追加模式，但因为是新文件所以等同于覆盖）
        this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
        this.errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
    }

    /**
     * 格式化日志消息
     */
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => {
            if (typeof arg === 'bigint') {
                return arg.toString();
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, (key, value) => 
                        typeof value === 'bigint' ? value.toString() : value
                    );
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ') : '';
        
        return `[${timestamp}] [${this.instanceName}] [${level}] ${message}${formattedArgs}`;
    }

    /**
     * 写入日志文件
     */
    writeToFile(stream, message) {
        stream.write(message + '\n');
    }

    /**
     * 输出到控制台
     */
    writeToConsole(level, message, ...args) {
        const formattedMessage = this.formatMessage(level, message, ...args);
        console.log(formattedMessage);
    }

    /**
     * 标准日志
     */
    log(message, ...args) {
        const formattedMessage = this.formatMessage('INFO', message, ...args);
        // this.writeToConsole('INFO', message, ...args);
        this.writeToFile(this.logStream, formattedMessage);
    }

    /**
     * 错误日志
     */
    error(message, ...args) {
        const formattedMessage = this.formatMessage('ERROR', message, ...args);
        console.error(`[${this.instanceName}] ❌ ${message}`, ...args);
        this.writeToFile(this.errorStream, formattedMessage);
    }

    /**
     * 警告日志
     */
    warn(message, ...args) {
        const formattedMessage = this.formatMessage('WARN', message, ...args);
        console.warn(`[${this.instanceName}] ⚠️ ${message}`, ...args);
        this.writeToFile(this.logStream, formattedMessage);
    }

    /**
     * 成功日志
     */
    success(message, ...args) {
        const formattedMessage = this.formatMessage('SUCCESS', message, ...args);
        // console.log(`[${this.instanceName}] ✅ ${message}`, ...args);
        this.writeToFile(this.logStream, formattedMessage);
    }

    /**
     * 调试日志
     */
    debug(message, ...args) {
        if (process.env.DEBUG === 'true') {
            const formattedMessage = this.formatMessage('DEBUG', message, ...args);
            // console.log(`[${this.instanceName}] 🔍 ${message}`, ...args);
            this.writeToFile(this.logStream, formattedMessage);
        }
    }

    /**
     * 关闭日志流
     */
    close() {
        this.logStream.end();
        this.errorStream.end();
    }
}

module.exports = Logger;
