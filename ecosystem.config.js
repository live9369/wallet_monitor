module.exports = {
    apps: [

        /* =======================
         * 单 Node 脚本
         * ======================= */
        { name: "wallet_monitor", script: "npm", args: "run start", max_memory_restart: "400M", restart_delay: 15000, autorestart: true },
    ]
}