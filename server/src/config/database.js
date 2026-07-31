const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "sera_user",
  password: process.env.DB_PASSWORD || "SeraPass_2026!db",
  database: process.env.DB_NAME || "seravavatar_hub",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: "utf8mb4",
});

module.exports = pool;
