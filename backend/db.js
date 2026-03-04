// db.js - MySQL connection pool (XAMPP, user=root, no password)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'allocation',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection()
  .then(conn => {
    console.log('[db] MySQL connected to "allocation"');
    conn.release();
  })
  .catch(err => {
    console.error('[db] MySQL connection failed:', err.message);
  });

module.exports = pool;
