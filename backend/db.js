const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "zawam_db",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // SSL مطلوب عند الاتصال بـ Aiven
    ssl: process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: false
        }
        : undefined
});

pool.getConnection()
    .then(connection => {
        console.log("✅ تم الاتصال بقاعدة بيانات ZAWAM");
        connection.release();
    })
    .catch(error => {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", error.message);
    });

module.exports = pool;