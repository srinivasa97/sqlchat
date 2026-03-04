// db.js - Dynamic MySQL connections per dbConfig
const mysql = require('mysql2/promise');

const pools = {};

function getPool(dbConfig) {
  if (pools[dbConfig.id]) return pools[dbConfig.id];

  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  pools[dbConfig.id] = pool;
  console.log('[db] Pool created for: ' + dbConfig.label);
  return pool;
}

module.exports = { getPool };
