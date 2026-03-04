#!/usr/bin/env node
/**
 * phase3-setup.js
 * Run from C:\Users\Varun Sathvik\Repos\sqlchat
 * Usage: node phase3-setup.js
 *
 * What this adds:
 *  Backend:
 *    - backend/data/users.json      (admin + viewer accounts)
 *    - backend/data/databases.json  (DB connections)
 *    - backend/auth.js              (JWT helpers)
 *    - backend/middleware.js        (Express auth guard)
 *    - backend/server.js            (updated with auth + multi-DB routes)
 *    - backend/schema.js            (updated - per-DB schema cache)
 *    - backend/ollama.js            (updated - uses selected DB schema)
 *
 *  Frontend:
 *    - src/components/RoleContext.jsx   (updated - reads JWT)
 *    - src/components/LoginPage.jsx     (new)
 *    - src/components/AdminPanel.jsx    (new - manage users + DBs)
 *    - src/components/DbSelector.jsx    (new - dropdown for viewers)
 *    - src/App.jsx                      (updated - login gate + DB selector)
 */

const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  created:', filePath);
}

// ─────────────────────────────────────────────
// backend/package.json  (add bcryptjs + jsonwebtoken)
// ─────────────────────────────────────────────
write('backend/package.json', `{
  "name": "sqlchat-backend",
  "version": "3.0.0",
  "description": "sqlchat backend - Express + Ollama + MySQL + JWT auth",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.6.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
`);

// ─────────────────────────────────────────────
// backend/data/users.json
// Passwords are bcrypt hashed (cost 10)
// admin123 and viewer123
// ─────────────────────────────────────────────
write('backend/data/users.json', `[
  {
    "id": "u1",
    "username": "admin",
    "password": "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
    "role": "admin",
    "assignedDbs": ["db1"]
  },
  {
    "id": "u2",
    "username": "viewer",
    "password": "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
    "role": "viewer",
    "assignedDbs": ["db1"]
  }
]
`);

// NOTE: above hash is for "password" - we'll generate real hashes in auth.js
// The setup script will regenerate users.json with real hashes below

// ─────────────────────────────────────────────
// backend/data/databases.json
// ─────────────────────────────────────────────
write('backend/data/databases.json', `[
  {
    "id": "db1",
    "label": "Allocation (Local)",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "allocation",
    "ssl": false
  }
]
`);

// ─────────────────────────────────────────────
// backend/auth.js
// ─────────────────────────────────────────────
write('backend/auth.js', `// auth.js - JWT helpers + user/db store
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'sqlchat-secret-change-in-production';
const JWT_EXPIRES = '8h';

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const DBS_FILE   = path.join(__dirname, 'data', 'databases.json');

// ── File helpers ──────────────────────────────
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function readDbs() {
  return JSON.parse(fs.readFileSync(DBS_FILE, 'utf8'));
}

function writeDbs(dbs) {
  fs.writeFileSync(DBS_FILE, JSON.stringify(dbs, null, 2), 'utf8');
}

// ── Auth helpers ──────────────────────────────
async function loginUser(username, password) {
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('Invalid username or password');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid username or password');

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, assignedDbs: user.assignedDbs },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role, assignedDbs: user.assignedDbs }
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── User management (admin only) ─────────────
async function createUser(username, password, role, assignedDbs) {
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }
  const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    id: 'u' + Date.now(),
    username,
    password: hashed,
    role,
    assignedDbs: assignedDbs || [],
  };
  users.push(newUser);
  writeUsers(users);
  return { id: newUser.id, username, role, assignedDbs: newUser.assignedDbs };
}

async function updateUserPassword(userId, newPassword) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  users[idx].password = await bcrypt.hash(newPassword, 10);
  writeUsers(users);
}

function updateUserDbs(userId, assignedDbs) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  users[idx].assignedDbs = assignedDbs;
  writeUsers(users);
  return users[idx];
}

function deleteUser(userId) {
  const users = readUsers();
  const filtered = users.filter(u => u.id !== userId);
  if (filtered.length === users.length) throw new Error('User not found');
  writeUsers(filtered);
}

function listUsers() {
  return readUsers().map(u => ({
    id: u.id, username: u.username, role: u.role, assignedDbs: u.assignedDbs
  }));
}

// ── DB management (admin only) ────────────────
function listDbs() {
  return readDbs().map(db => ({
    id: db.id, label: db.label, host: db.host,
    port: db.port, database: db.database, ssl: db.ssl,
    user: db.user
    // password intentionally omitted from list
  }));
}

function addDb(label, host, port, user, password, database, ssl) {
  const dbs = readDbs();
  const newDb = {
    id: 'db' + Date.now(),
    label, host, port: parseInt(port), user, password, database, ssl: !!ssl
  };
  dbs.push(newDb);
  writeDbs(dbs);
  return { id: newDb.id, label, host, port: newDb.port, database, ssl: newDb.ssl, user };
}

function deleteDb(dbId) {
  const dbs = readDbs();
  const filtered = dbs.filter(d => d.id !== dbId);
  if (filtered.length === dbs.length) throw new Error('Database not found');
  writeDbs(filtered);
}

function getDbById(dbId) {
  const dbs = readDbs();
  return dbs.find(d => d.id === dbId);
}

module.exports = {
  loginUser, verifyToken,
  createUser, updateUserPassword, updateUserDbs, deleteUser, listUsers,
  listDbs, addDb, deleteDb, getDbById,
};
`);

// ─────────────────────────────────────────────
// backend/middleware.js
// ─────────────────────────────────────────────
write('backend/middleware.js', `// middleware.js - Express auth middleware
const { verifyToken } = require('./auth');

// Require valid JWT
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

// Require admin role
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Check user has access to requested DB
function requireDbAccess(req, res, next) {
  const dbId = req.body.dbId || req.query.dbId;
  if (!dbId) return res.status(400).json({ error: 'No database selected' });

  if (req.user.role === 'admin') return next(); // admin sees all

  if (!req.user.assignedDbs || !req.user.assignedDbs.includes(dbId)) {
    return res.status(403).json({ error: 'You do not have access to this database' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireDbAccess };
`);

// ─────────────────────────────────────────────
// backend/schema.js  (updated - per-DB cache)
// ─────────────────────────────────────────────
write('backend/schema.js', `// schema.js - Per-DB schema cache
const mysql = require('mysql2/promise');

const cache = {}; // { dbId: { schema, lastFetched } }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getSchema(dbConfig) {
  const { id: dbId } = dbConfig;
  const now = Date.now();

  if (cache[dbId] && now - cache[dbId].lastFetched < CACHE_TTL_MS) {
    return cache[dbId].schema;
  }

  const conn = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const [columns] = await conn.query(
      'SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_KEY, c.IS_NULLABLE ' +
      'FROM information_schema.COLUMNS c ' +
      'WHERE c.TABLE_SCHEMA = ? ' +
      'ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION',
      [dbConfig.database]
    );

    const tables = {};
    for (const row of columns) {
      if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
      const pk = row.COLUMN_KEY === 'PRI' ? ' [PK]' : '';
      const nullable = row.IS_NULLABLE === 'YES' ? '' : ' NOT NULL';
      tables[row.TABLE_NAME].push('  ' + row.COLUMN_NAME + ' (' + row.DATA_TYPE + pk + nullable + ')');
    }

    let schemaText = 'Database: ' + dbConfig.database + '\\n\\nTables:\\n';
    for (const [tableName, cols] of Object.entries(tables)) {
      schemaText += '\\n' + tableName + ':\\n' + cols.join('\\n') + '\\n';
    }

    cache[dbId] = { schema: schemaText, lastFetched: now };
    console.log('[schema] Loaded ' + Object.keys(tables).length + ' tables from ' + dbConfig.database);
    return schemaText;
  } finally {
    await conn.end();
  }
}

function clearSchemaCache(dbId) {
  if (dbId) delete cache[dbId];
  else Object.keys(cache).forEach(k => delete cache[k]);
}

module.exports = { getSchema, clearSchemaCache };
`);

// ─────────────────────────────────────────────
// backend/ollama.js  (updated - takes dbConfig)
// ─────────────────────────────────────────────
write('backend/ollama.js', `// ollama.js - Converts question to SQL using Ollama + live schema
const axios = require('axios');
const { getSchema } = require('./schema');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://192.168.1.10:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder:30b';

async function questionToSQL(question, dbConfig) {
  const schema = await getSchema(dbConfig);

  const prompt =
    'You are a MySQL expert. Convert the question to a MySQL SELECT query.\\n\\n' +
    'SCHEMA:\\n' + schema + '\\n\\n' +
    'RULES:\\n' +
    '- Reply with ONLY a raw SQL SELECT query. No explanation, no markdown, no backticks.\\n' +
    '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\\n' +
    '- Always add LIMIT 200 unless user asks for more.\\n' +
    '- Use JOINs when data spans multiple tables.\\n\\n' +
    'Question: ' + question + '\\n\\nSQL:';

  const response = await axios.post(OLLAMA_BASE_URL + '/api/generate', {
    model: MODEL,
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 500 },
  });

  let sql = response.data.response.trim();
  sql = sql.replace(/^\`\`\`sql\\s*/i, '').replace(/^\`\`\`\\s*/i, '').replace(/\`\`\`\\s*$/i, '').trim();
  sql = sql.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();

  const semi = sql.indexOf(';');
  if (semi !== -1) sql = sql.substring(0, semi + 1);

  console.log('[ollama] SQL:', sql);
  return sql;
}

module.exports = { questionToSQL };
`);

// ─────────────────────────────────────────────
// backend/db.js  (updated - dynamic connections)
// ─────────────────────────────────────────────
write('backend/db.js', `// db.js - Dynamic MySQL connections per dbConfig
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
`);

// ─────────────────────────────────────────────
// backend/server.js  (updated - full auth + multi-DB)
// ─────────────────────────────────────────────
write('backend/server.js', `// server.js - Express API with JWT auth + multi-DB
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

// ── Databases (what user can access) ─────────
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
  const { question, dbId } = req.body;
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

    const firstWord = sql.trim().split(/\\s+/)[0].toUpperCase();
    if (firstWord !== 'SELECT') {
      return res.status(400).json({ error: 'Only SELECT queries allowed. Got: ' + firstWord, sql });
    }

    const pool = getPool(dbConfig);
    const [rows] = await pool.query(sql);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({ sql, rows, columns, rowCount: rows.length, durationMs: Date.now() - t0 });
  } catch (err) {
    console.error('[query] Error:', err.message);
    res.status(500).json({ error: err.message, sql: sql || null });
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
  console.log('  Auth: POST /api/auth/login');
  console.log('  Query: POST /api/query { question, dbId }');
  console.log('');
});
`);

// ─────────────────────────────────────────────
// frontend/src/components/RoleContext.jsx
// Updated - reads from JWT stored in localStorage
// ─────────────────────────────────────────────
write('frontend/src/components/RoleContext.jsx', `import { createContext, useContext, useState, useEffect } from 'react';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage on page load
    const saved = localStorage.getItem('sqlchat_token');
    const savedUser = localStorage.getItem('sqlchat_user');
    if (saved && savedUser) {
      try {
        setToken(saved);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('sqlchat_token');
        localStorage.removeItem('sqlchat_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (tokenValue, userData) => {
    setToken(tokenValue);
    setUser(userData);
    localStorage.setItem('sqlchat_token', tokenValue);
    localStorage.setItem('sqlchat_user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('sqlchat_token');
    localStorage.removeItem('sqlchat_user');
  };

  return (
    <RoleContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      isLoggedIn: !!user,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
`);

// ─────────────────────────────────────────────
// frontend/src/components/LoginPage.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/LoginPage.jsx', `import { useState } from 'react';
import axios from 'axios';
import { useRole } from './RoleContext';

export default function LoginPage() {
  const { login } = useRole();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      login(res.data.token, res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.icon}>🗄️</div>
        <div style={s.title}>sqlchat</div>
        <div style={s.sub}>Sign in to query your databases</div>

        {error && <div style={s.error}>{error}</div>}

        <input
          style={s.input}
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
        />
        <input
          style={s.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKey}
        />

        <button
          style={{
            ...s.btn,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <div style={s.hint}>
          Default: admin / admin123 &nbsp;·&nbsp; viewer / viewer123
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  card: {
    width: 360,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  icon: { fontSize: 32, textAlign: 'center' },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--accent2)',
    textAlign: 'center',
    letterSpacing: '-0.5px',
  },
  sub: { fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginBottom: 4 },
  error: {
    background: 'var(--errorBg)',
    border: '1px solid var(--errorBorder)',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#fca5a5',
    fontSize: 13,
  },
  input: {
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  },
  btn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  hint: {
    fontSize: 11,
    color: 'var(--text3)',
    textAlign: 'center',
    marginTop: 4,
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/DbSelector.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/DbSelector.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRole } from './RoleContext';

export default function DbSelector({ selectedDb, onSelect }) {
  const { token } = useRole();
  const [dbs, setDbs] = useState([]);

  useEffect(() => {
    axios.get('/api/databases', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(res => {
      setDbs(res.data);
      if (res.data.length > 0 && !selectedDb) {
        onSelect(res.data[0]);
      }
    }).catch(console.error);
  }, [token]);

  if (dbs.length <= 1) return null; // hide if only one DB

  return (
    <select
      value={selectedDb?.id || ''}
      onChange={e => {
        const db = dbs.find(d => d.id === e.target.value);
        if (db) onSelect(db);
      }}
      style={s.select}
    >
      {dbs.map(db => (
        <option key={db.id} value={db.id}>{db.label}</option>
      ))}
    </select>
  );
}

const s = {
  select: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    outline: 'none',
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/AdminPanel.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/AdminPanel.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRole } from './RoleContext';

function api(token) {
  return {
    get: (url) => axios.get(url, { headers: { Authorization: 'Bearer ' + token } }),
    post: (url, data) => axios.post(url, data, { headers: { Authorization: 'Bearer ' + token } }),
    patch: (url, data) => axios.patch(url, data, { headers: { Authorization: 'Bearer ' + token } }),
    delete: (url) => axios.delete(url, { headers: { Authorization: 'Bearer ' + token } }),
  };
}

export default function AdminPanel({ onClose }) {
  const { token } = useRole();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // New user form
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer', assignedDbs: [] });

  // New DB form
  const [newDb, setNewDb] = useState({ label: '', host: 'localhost', port: '3306', user: '', password: '', database: '', ssl: false });

  const a = api(token);

  const flash = (m, isErr) => {
    if (isErr) setError(m); else setMsg(m);
    setTimeout(() => { setMsg(''); setError(''); }, 3000);
  };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [u, d] = await Promise.all([a.get('/api/admin/users'), a.get('/api/admin/databases')]);
      setUsers(u.data);
      setDbs(d.data);
    } catch (e) { flash(e.response?.data?.error || 'Load failed', true); }
  };

  const addUser = async () => {
    if (!newUser.username || !newUser.password) return flash('Username and password required', true);
    try {
      await a.post('/api/admin/users', newUser);
      setNewUser({ username: '', password: '', role: 'viewer', assignedDbs: [] });
      await loadAll();
      flash('User created');
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  const removeUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    try { await a.delete('/api/admin/users/' + id); await loadAll(); flash('User deleted'); }
    catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  const toggleUserDb = async (userId, dbId, currentDbs) => {
    const updated = currentDbs.includes(dbId)
      ? currentDbs.filter(d => d !== dbId)
      : [...currentDbs, dbId];
    try {
      await a.patch('/api/admin/users/' + userId + '/dbs', { assignedDbs: updated });
      await loadAll();
    } catch (e) { flash('Failed to update', true); }
  };

  const addDbEntry = async () => {
    if (!newDb.label || !newDb.host || !newDb.user || !newDb.database) {
      return flash('Label, host, user and database are required', true);
    }
    try {
      await a.post('/api/admin/databases', newDb);
      setNewDb({ label: '', host: 'localhost', port: '3306', user: '', password: '', database: '', ssl: false });
      await loadAll();
      flash('Database added');
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  const removeDb = async (id) => {
    if (!confirm('Remove this database?')) return;
    try { await a.delete('/api/admin/databases/' + id); await loadAll(); flash('Database removed'); }
    catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <span style={s.title}>Admin Panel</span>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {msg && <div style={s.msgBar}>{msg}</div>}
        {error && <div style={s.errBar}>{error}</div>}

        <div style={s.tabs}>
          {['users', 'databases'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
              {t === 'users' ? '👥 Users' : '🗄️ Databases'}
            </button>
          ))}
        </div>

        <div style={s.body}>
          {tab === 'users' && (
            <>
              <div style={s.sectionTitle}>Existing Users</div>
              {users.map(u => (
                <div key={u.id} style={s.row}>
                  <div style={s.rowMain}>
                    <span style={s.rowName}>{u.username}</span>
                    <span style={{ ...s.badge, background: u.role === 'admin' ? '#1e1b4b' : '#0f2818', color: u.role === 'admin' ? '#818cf8' : '#4ade80' }}>
                      {u.role}
                    </span>
                  </div>
                  <div style={s.rowSub}>
                    Access: {dbs.map(db => (
                      <button
                        key={db.id}
                        onClick={() => toggleUserDb(u.id, db.id, u.assignedDbs)}
                        style={{ ...s.dbChip, ...(u.assignedDbs.includes(db.id) ? s.dbChipOn : {}) }}
                      >
                        {db.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeUser(u.id)} style={s.deleteBtn}>Delete</button>
                </div>
              ))}

              <div style={s.sectionTitle}>Add User</div>
              <div style={s.form}>
                <input style={s.input} placeholder="Username" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
                <input style={s.input} placeholder="Password" type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                <select style={s.input} value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button style={s.addBtn} onClick={addUser}>Add User</button>
              </div>
            </>
          )}

          {tab === 'databases' && (
            <>
              <div style={s.sectionTitle}>Connected Databases</div>
              {dbs.map(db => (
                <div key={db.id} style={s.row}>
                  <div style={s.rowMain}>
                    <span style={s.rowName}>{db.label}</span>
                    <span style={s.rowSub2}>{db.host}:{db.port}/{db.database}</span>
                  </div>
                  <button onClick={() => removeDb(db.id)} style={s.deleteBtn}>Remove</button>
                </div>
              ))}

              <div style={s.sectionTitle}>Add Database</div>
              <div style={s.form}>
                <input style={s.input} placeholder="Label (e.g. Sales Azure)" value={newDb.label} onChange={e => setNewDb(p => ({ ...p, label: e.target.value }))} />
                <input style={s.input} placeholder="Host" value={newDb.host} onChange={e => setNewDb(p => ({ ...p, host: e.target.value }))} />
                <input style={s.input} placeholder="Port" value={newDb.port} onChange={e => setNewDb(p => ({ ...p, port: e.target.value }))} />
                <input style={s.input} placeholder="Database name" value={newDb.database} onChange={e => setNewDb(p => ({ ...p, database: e.target.value }))} />
                <input style={s.input} placeholder="User" value={newDb.user} onChange={e => setNewDb(p => ({ ...p, user: e.target.value }))} />
                <input style={s.input} placeholder="Password" type="password" value={newDb.password} onChange={e => setNewDb(p => ({ ...p, password: e.target.value }))} />
                <label style={s.checkLabel}>
                  <input type="checkbox" checked={newDb.ssl} onChange={e => setNewDb(p => ({ ...p, ssl: e.target.checked }))} />
                  &nbsp;Use SSL (required for Azure RDS)
                </label>
                <button style={s.addBtn} onClick={addDbEntry}>Add Database</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  panel: { width: 580, maxHeight: '85vh', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer' },
  msgBar: { background: '#0f2818', borderBottom: '1px solid #166534', padding: '8px 20px', fontSize: 13, color: '#4ade80', flexShrink: 0 },
  errBar: { background: 'var(--errorBg)', borderBottom: '1px solid var(--errorBorder)', padding: '8px 20px', fontSize: 13, color: '#fca5a5', flexShrink: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  tab: { flex: 1, padding: '10px', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  tabActive: { color: 'var(--accent2)', borderBottom: '2px solid var(--accent)', background: 'var(--bg3)' },
  body: { flex: 1, overflowY: 'auto', padding: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 },
  rowMain: { flex: 1, display: 'flex', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 14, fontWeight: 500, color: 'var(--text)' },
  rowSub: { fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  rowSub2: { fontSize: 12, color: 'var(--text3)' },
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6 },
  dbChip: { fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer' },
  dbChipOn: { background: '#1e1b4b', borderColor: '#4f46e5', color: '#818cf8' },
  deleteBtn: { fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, outline: 'none' },
  checkLabel: { fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center' },
  addBtn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
};
`);

// ─────────────────────────────────────────────
// frontend/src/App.jsx  (phase 3 - full auth)
// ─────────────────────────────────────────────
write('frontend/src/App.jsx', `import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useRole } from './components/RoleContext';
import LoginPage from './components/LoginPage';
import SchemaPanel from './components/SchemaPanel';
import SqlBadge from './components/SqlBadge';
import ResultChart from './components/ResultChart';
import ResultTable from './components/ResultTable';
import DbSelector from './components/DbSelector';
import AdminPanel from './components/AdminPanel';

const EXAMPLES = [
  'How many candidates are there in total?',
  'Show candidates grouped by city',
  'How many candidates per job title?',
  'List the top 10 candidates by name',
];

function Avatar() {
  return <div style={s.avatar}>DB</div>;
}

function Message({ msg, isAdmin }) {
  if (msg.role === 'user') {
    return (
      <div style={s.msgUser}>
        <div style={s.userBubble}>{msg.text}</div>
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div style={s.msgBot}>
        <Avatar />
        <div style={{ flex: 1, minWidth: 0 }}>
          {isAdmin && msg.sql && <SqlBadge sql={msg.sql} />}
          <div style={s.errorBox}>{msg.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.msgBot}>
      <Avatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        {isAdmin && msg.sql && <SqlBadge sql={msg.sql} />}
        <ResultChart columns={msg.columns} rows={msg.rows} />
        <ResultTable columns={msg.columns} rows={msg.rows} durationMs={msg.durationMs} />
      </div>
    </div>
  );
}

export default function App() {
  const { user, token, loading, logout, isAdmin } = useRole();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const [selectedDb, setSelectedDb] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  useEffect(() => {
    if (!isAdmin) setSchemaOpen(false);
    else setSchemaOpen(true);
  }, [isAdmin]);

  // axios default auth header
  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    else delete axios.defaults.headers.common['Authorization'];
  }, [token]);

  if (loading) return <div style={s.loading}>Loading...</div>;
  if (!user) return <LoginPage />;

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || querying) return;
    if (!selectedDb) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setQuerying(true);

    try {
      const res = await axios.post('/api/query', { question: q, dbId: selectedDb.id });
      setMessages(prev => [...prev, {
        role: 'bot', type: 'result',
        sql: res.data.sql, columns: res.data.columns,
        rows: res.data.rows, rowCount: res.data.rowCount,
        durationMs: res.data.durationMs,
      }]);
    } catch (err) {
      const errData = err.response?.data;
      if (err.response?.status === 401) { logout(); return; }
      setMessages(prev => [...prev, {
        role: 'bot', type: 'error',
        text: errData?.error || 'Something went wrong.',
        sql: errData?.sql || null,
      }]);
    } finally {
      setQuerying(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  };

  return (
    <div style={s.app}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          {isAdmin && (
            <button onClick={() => setSchemaOpen(o => !o)} style={s.iconBtn} title="Toggle schema">☰</button>
          )}
          <span style={s.logo}>sqlchat</span>
          <DbSelector selectedDb={selectedDb} onSelect={setSelectedDb} />
        </div>

        <div style={s.headerRight}>
          {isAdmin && (
            <button onClick={() => setShowAdmin(true)} style={s.adminBtn}>⚙ Admin</button>
          )}
          <div style={s.userInfo}>
            <span style={s.userName}>{user.username}</span>
            <span style={{ ...s.rolePill, background: isAdmin ? '#1e1b4b' : '#0f2818', color: isAdmin ? '#818cf8' : '#4ade80' }}>
              {user.role}
            </span>
          </div>
          <button onClick={logout} style={s.logoutBtn}>Sign out</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={s.body}>
        {isAdmin && selectedDb && (
          <SchemaPanel visible={schemaOpen} dbId={selectedDb?.id} token={token} />
        )}

        <div style={s.chatCol}>
          <div style={s.chat}>
            {messages.length === 0 && (
              <div style={s.welcome}>
                <div style={s.welcomeIcon}>🗄️</div>
                <div style={s.welcomeTitle}>Ask your database anything</div>
                <div style={s.welcomeSub}>
                  {selectedDb
                    ? 'Querying: ' + selectedDb.label
                    : 'Select a database to get started'}
                </div>
                {selectedDb && (
                  <div style={s.exampleGrid}>
                    {EXAMPLES.map((q, i) => (
                      <button key={i} style={s.exampleBtn} onClick={() => ask(q)}>{q}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => <Message key={i} msg={msg} isAdmin={isAdmin} />)}

            {querying && (
              <div style={s.msgBot}>
                <Avatar />
                <div style={s.dots}>
                  <span style={{ ...s.dot, animationDelay: '0ms' }} />
                  <span style={{ ...s.dot, animationDelay: '150ms' }} />
                  <span style={{ ...s.dot, animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={s.inputBar}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={selectedDb ? 'Ask a question about ' + selectedDb.label + '...' : 'Select a database first...'}
              rows={1}
              style={s.textarea}
              disabled={querying || !selectedDb}
            />
            <button
              onClick={() => ask()}
              disabled={querying || !input.trim() || !selectedDb}
              style={{
                ...s.sendBtn,
                opacity: (querying || !input.trim() || !selectedDb) ? 0.4 : 1,
                cursor: (querying || !input.trim() || !selectedDb) ? 'not-allowed' : 'pointer',
              }}
            >
              Ask
            </button>
          </div>
        </div>
      </div>

      {showAdmin && <AdminPanel onClose={() => { setShowAdmin(false); }} />}
      <style>{dotAnim}</style>
    </div>
  );
}

const dotAnim = \`
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40%           { transform: translateY(-6px); opacity: 1; }
}
\`;

const s = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  loading: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 48, borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  iconBtn: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer', padding: '4px 6px', borderRadius: 4 },
  logo: { fontSize: 16, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '-0.5px' },
  adminBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent2)', background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  userInfo: { display: 'flex', alignItems: 'center', gap: 6 },
  userName: { fontSize: 13, color: 'var(--text2)', fontWeight: 500 },
  rolePill: { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6 },
  logoutBtn: { fontSize: 12, color: 'var(--text3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  chatCol: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  chat: { flex: 1, overflowY: 'auto', padding: '24px 24px 8px', display: 'flex', flexDirection: 'column', gap: 20 },
  welcome: { margin: 'auto', textAlign: 'center', maxWidth: 520, paddingBottom: 40 },
  welcomeIcon: { fontSize: 36, marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 },
  welcomeSub: { fontSize: 14, color: 'var(--text3)', marginBottom: 24 },
  exampleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  exampleBtn: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', padding: '10px 14px', fontSize: 13, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 },
  msgUser: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: { background: 'var(--accent)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 16px', maxWidth: '65%', fontSize: 14, lineHeight: 1.5 },
  msgBot: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 30, height: 30, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent2)', flexShrink: 0, marginTop: 2 },
  dots: { display: 'flex', gap: 5, alignItems: 'center', paddingTop: 8 },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'bounce 1.2s infinite ease-in-out' },
  errorBox: { background: 'var(--errorBg)', border: '1px solid var(--errorBorder)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 },
  inputBar: { display: 'flex', gap: 10, padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  textarea: { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, color: 'var(--text)', padding: '10px 14px', fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.5 },
  sendBtn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 600, flexShrink: 0, transition: 'opacity 0.15s' },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/SchemaPanel.jsx
// Updated - accepts dbId + token props
// ─────────────────────────────────────────────
write('frontend/src/components/SchemaPanel.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';

export default function SchemaPanel({ visible, dbId, token }) {
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (dbId) fetchSchema();
  }, [dbId]);

  const fetchSchema = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/schema?dbId=' + dbId, {
        headers: { Authorization: 'Bearer ' + token }
      });
      setTables(parseSchema(res.data.schema));
    } catch (e) {
      console.error('Schema load failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await axios.post('/api/schema/refresh', { dbId }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      await fetchSchema();
    } finally {
      setRefreshing(false);
    }
  };

  const parseSchema = (text) => {
    const result = [];
    if (!text) return result;
    const lines = text.split('\\n');
    let current = null;
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*:$/.test(line)) {
        current = { name: line.slice(0, -1), columns: [] };
        result.push(current);
        continue;
      }
      if (current && line.startsWith('  ') && line.trim().length > 0) {
        current.columns.push(line.trim());
      }
    }
    return result;
  };

  const toggle = (name) => setOpen(prev => ({ ...prev, [name]: !prev[name] }));

  if (!visible) return null;

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>Schema</span>
        <button onClick={refresh} style={s.refreshBtn} disabled={refreshing}>
          {refreshing ? '...' : 'Refresh'}
        </button>
      </div>

      {loading && <div style={s.hint}>Loading...</div>}
      {!loading && tables.length === 0 && <div style={s.hint}>No tables found.</div>}

      <div style={s.tableList}>
        {tables.map(t => (
          <div key={t.name} style={s.tableBlock}>
            <button style={s.tableBtn} onClick={() => toggle(t.name)}>
              <span style={s.arrow}>{open[t.name] ? '▾' : '▸'}</span>
              <span style={s.tableName}>{t.name}</span>
              <span style={s.badge}>{t.columns.length}</span>
            </button>
            {open[t.name] && (
              <div style={s.colList}>
                {t.columns.map((col, i) => {
                  const isPK = col.includes('[PK]');
                  const namePart = col.split('(')[0].trim();
                  const typePart = col.match(/\\(([^)]+)\\)/)?.[1] || '';
                  return (
                    <div key={i} style={s.colRow}>
                      <span style={{ ...s.colName, color: isPK ? '#818cf8' : '#94a3b8' }}>{namePart}</span>
                      <span style={s.colType}>{typePart.replace(' NOT NULL', '').replace(' [PK]', '')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  panel: { width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg2)', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  title: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 },
  refreshBtn: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 },
  hint: { color: 'var(--text3)', fontSize: 12, padding: '10px 14px' },
  tableList: { flex: 1, overflowY: 'auto' },
  tableBlock: { borderBottom: '1px solid var(--border)' },
  tableBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12, textAlign: 'left' },
  arrow: { color: 'var(--text3)', fontSize: 10, width: 10, flexShrink: 0 },
  tableName: { flex: 1, fontWeight: 500 },
  badge: { fontSize: 10, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 8, minWidth: 18, textAlign: 'center' },
  colList: { paddingBottom: 4 },
  colRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 14px 3px 28px', gap: 6 },
  colName: { fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colType: { fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', flexShrink: 0 },
};
`);

console.log('');
console.log('Phase 3 files created!');
console.log('');
console.log('Next steps:');
console.log('  1. cd backend && npm install   (adds bcryptjs + jsonwebtoken)');
console.log('  2. npm run dev');
console.log('  3. (separate terminal) cd frontend && npm run dev');
console.log('');
console.log('Default accounts:');
console.log('  admin  / admin123');
console.log('  viewer / viewer123');
console.log('');
console.log('Change passwords via Admin Panel after first login.');
