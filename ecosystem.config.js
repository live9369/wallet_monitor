module.exports = {
    apps: [

        /* =======================
         * 单 Node 脚本
         * ======================= */
        {
            name: "wallet_monitor",
            script: "dist/src/start.js",
            cwd: __dirname,
            interpreter: "node",
            max_memory_restart: "400M",
            restart_delay: 15000,
            autorestart: true
        },
    ]
}
