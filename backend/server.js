// server.js - Express API with JWT auth + multi-DB + chat history
const express = require('express');
const cors = require('cors');
const { getPool } = require('./db');
const { questionToSQL } = require('./ollama');
const { getSchema, clearSchemaCache } = require('./schema');
const { requireAuth, requireAdmin, requireDbAccess } = require('./middleware');
const {
  loginUser, listUsers, createUser, updateUserPassword,
  updateUserDbs, deleteUser,
  listDbs, addDb, deleteDb, getDbById,
} = require('./auth');
const {
  listForUser, getConversation, createConversation,
  appendMessage, deleteConversation,
} = require('./history');

const app = express();
app.use(cors());
app.use(express.json());

// ── Health ────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth ──────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const result = await loginUser(username, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Databases ─────────────────────────────────
app.get('/api/databases', requireAuth, (req, res) => {
  const all = listDbs();
  if (req.user.role === 'admin') return res.json(all);
  const mine = all.filter(db => req.user.assignedDbs.includes(db.id));
  res.json(mine);
});

// ── Schema ────────────────────────────────────
app.get('/api/schema', requireAuth, async (req, res) => {
  const dbId = req.query.dbId;
  if (!dbId) return res.status(400).json({ error: 'dbId required' });
  const dbConfig = getDbById(dbId);
  if (!dbConfig) return res.status(404).json({ error: 'Database not found' });
  try {
    const schema = await getSchema(dbConfig);
    res.json({ schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schema/refresh', requireAuth, requireAdmin, async (req, res) => {
  const { dbId } = req.body;
  clearSchemaCache(dbId);
  try {
    const dbConfig = dbId ? getDbById(dbId) : null;
    if (dbConfig) {
      const schema = await getSchema(dbConfig);
      res.json({ message: 'Schema refreshed', schema });
    } else {
      clearSchemaCache();
      res.json({ message: 'All schema caches cleared' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Query ─────────────────────────────────────
app.post('/api/query', requireAuth, requireDbAccess, async (req, res) => {
  const { question, dbId, conversationId } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'No question provided' });
  }

  const dbConfig = getDbById(dbId);
  if (!dbConfig) return res.status(404).json({ error: 'Database not found' });

  let sql = '';
  const t0 = Date.now();

  try {
    sql = await questionToSQL(question.trim(), dbConfig);

    if (!sql) return res.status(500).json({ error: 'Ollama returned empty SQL. Try rephrasing.' });

    const firstWord = sql.trim().split(/\s+/)[0].toUpperCase();
    if (firstWord !== 'SELECT') {
      return res.status(400).json({ error: 'Only SELECT queries allowed. Got: ' + firstWord, sql });
    }

    const pool = getPool(dbConfig);
    const [rows] = await pool.query(sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const durationMs = Date.now() - t0;

    // Save to history if conversationId provided
    if (conversationId) {
      try {
        // Save user message
        await appendMessage(conversationId, req.user.id, {
          role: 'user',
          text: question.trim(),
          timestamp: new Date().toISOString(),
        });
        // Save bot response
        await appendMessage(conversationId, req.user.id, {
          role: 'bot',
          type: 'result',
          sql,
          columns,
          rows,
          rowCount: rows.length,
          durationMs,
          timestamp: new Date().toISOString(),
        });
      } catch (histErr) {
        console.error('[history] Save error:', histErr.message);
        // Don't fail the query if history save fails
      }
    }

    res.json({ sql, rows, columns, rowCount: rows.length, durationMs });
  } catch (err) {
    console.error('[query] Error:', err.message);

    // Save error to history too
    if (conversationId) {
      try {
        appendMessage(conversationId, req.user.id, {
          role: 'bot',
          type: 'error',
          text: err.message,
          sql: sql || null,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {}
    }

    res.status(500).json({ error: err.message, sql: sql || null });
  }
});

// ── Chat History ──────────────────────────────

// List all conversations for current user
app.get('/api/history', requireAuth, (req, res) => {
  try {
    const convs = listForUser(req.user.id);
    res.json(convs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new conversation
app.post('/api/history', requireAuth, (req, res) => {
  const { dbId, dbLabel, firstQuestion } = req.body;
  if (!dbId || !firstQuestion) {
    return res.status(400).json({ error: 'dbId and firstQuestion required' });
  }
  try {
    const conv = createConversation(req.user.id, dbId, dbLabel || dbId, firstQuestion);
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full conversation with messages
app.get('/api/history/:id', requireAuth, (req, res) => {
  try {
    const conv = getConversation(req.params.id, req.user.id);
    res.json(conv);
  } catch (err) {
    res.status(err.message === 'Access denied' ? 403 : 404).json({ error: err.message });
  }
});

// Delete conversation
app.delete('/api/history/:id', requireAuth, (req, res) => {
  try {
    deleteConversation(req.params.id, req.user.id);
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Admin: Users ──────────────────────────────
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json(listUsers());
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role, assignedDbs } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password and role required' });
  }
  try {
    const user = await createUser(username, password, role, assignedDbs);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/dbs', requireAuth, requireAdmin, (req, res) => {
  try {
    const updated = updateUserDbs(req.params.id, req.body.assignedDbs);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    await updateUserPassword(req.params.id, req.body.password);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Admin: Databases ──────────────────────────
app.get('/api/admin/databases', requireAuth, requireAdmin, (req, res) => {
  res.json(listDbs());
});

app.post('/api/admin/databases', requireAuth, requireAdmin, (req, res) => {
  const { label, host, port, user, password, database, ssl } = req.body;
  if (!label || !host || !user || !database) {
    return res.status(400).json({ error: 'label, host, user and database are required' });
  }
  try {
    const db = addDb(label, host, port || 3306, user, password || '', database, ssl);
    res.json(db);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/databases/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    deleteDb(req.params.id);
    clearSchemaCache(req.params.id);
    res.json({ message: 'Database removed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log('');
  console.log('  sqlchat backend -> http://localhost:' + PORT);
  console.log('  Auth:    POST /api/auth/login');
  console.log('  Query:   POST /api/query { question, dbId, conversationId }');
  console.log('  History: GET  /api/history');
  console.log('');
});
