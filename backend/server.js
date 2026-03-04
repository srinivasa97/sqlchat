// server.js - Express API server
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { questionToSQL } = require('./ollama');
const { getSchema, clearSchemaCache } = require('./schema');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', mysql: true });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Get schema for display
app.get('/api/schema', async (req, res) => {
  try {
    const schema = await getSchema();
    res.json({ schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force schema refresh
app.post('/api/schema/refresh', async (req, res) => {
  clearSchemaCache();
  try {
    const schema = await getSchema();
    res.json({ message: 'Schema refreshed', schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main: question -> SQL -> results
app.post('/api/query', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'No question provided' });
  }

  let sql = '';
  const t0 = Date.now();

  try {
    sql = await questionToSQL(question.trim());

    if (!sql) {
      return res.status(500).json({ error: 'Ollama returned empty SQL. Try rephrasing.' });
    }

    // Safety guard - only SELECT allowed
    const firstWord = sql.trim().split(/\s+/)[0].toUpperCase();
    if (firstWord !== 'SELECT') {
      return res.status(400).json({
        error: 'Only SELECT queries are allowed. Got: ' + firstWord,
        sql,
      });
    }

    const [rows] = await pool.query(sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({
      sql,
      rows,
      columns,
      rowCount: rows.length,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[server] Error:', err.message);
    res.status(500).json({ error: err.message, sql: sql || null });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('');
  console.log('  sqlchat backend -> http://localhost:' + PORT);
  console.log('  POST /api/query { question: "..." }');
  console.log('');
});
