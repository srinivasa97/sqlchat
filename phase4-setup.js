#!/usr/bin/env node
/**
 * phase4-setup.js
 * Run from C:\Users\Varun Sathvik\Repos\sqlchat
 * Usage: node phase4-setup.js
 *
 * What this adds:
 *  Backend:
 *    - backend/data/history.json     (empty store)
 *    - backend/history.js            (history helpers)
 *    - backend/server.js             (updated - history routes added)
 *
 *  Frontend:
 *    - src/components/HistorySidebar.jsx  (new - left panel with conversations)
 *    - src/App.jsx                        (updated - history integrated)
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
// backend/data/history.json
// ─────────────────────────────────────────────
write('backend/data/history.json', '[]');

// ─────────────────────────────────────────────
// backend/history.js
// ─────────────────────────────────────────────
write('backend/history.js', `// history.js - Chat history helpers
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_PER_USER = 50;

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeAll(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// List conversations for a user (summary only, no messages)
function listForUser(userId) {
  const all = readAll();
  return all
    .filter(c => c.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(c => ({
      id: c.id,
      title: c.title,
      dbId: c.dbId,
      dbLabel: c.dbLabel,
      messageCount: c.messages.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
}

// Get full conversation including messages
function getConversation(id, userId) {
  const all = readAll();
  const conv = all.find(c => c.id === id);
  if (!conv) throw new Error('Conversation not found');
  if (conv.userId !== userId) throw new Error('Access denied');
  return conv;
}

// Create new conversation
function createConversation(userId, dbId, dbLabel, firstQuestion) {
  const all = readAll();

  // Prune oldest if over limit
  const userConvs = all.filter(c => c.userId === userId);
  if (userConvs.length >= MAX_PER_USER) {
    const oldest = userConvs.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))[0];
    const pruned = all.filter(c => c.id !== oldest.id);
    writeAll(pruned);
  }

  const title = firstQuestion.length > 50
    ? firstQuestion.substring(0, 50) + '...'
    : firstQuestion;

  const conv = {
    id: 'ch_' + Date.now(),
    userId,
    dbId,
    dbLabel,
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fresh = readAll();
  fresh.push(conv);
  writeAll(fresh);
  return conv;
}

// Append a message to conversation
function appendMessage(id, userId, message) {
  const all = readAll();
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Conversation not found');
  if (all[idx].userId !== userId) throw new Error('Access denied');

  all[idx].messages.push(message);
  all[idx].updatedAt = new Date().toISOString();
  writeAll(all);
  return all[idx];
}

// Delete conversation
function deleteConversation(id, userId) {
  const all = readAll();
  const conv = all.find(c => c.id === id);
  if (!conv) throw new Error('Conversation not found');
  if (conv.userId !== userId) throw new Error('Access denied');
  writeAll(all.filter(c => c.id !== id));
}

module.exports = {
  listForUser,
  getConversation,
  createConversation,
  appendMessage,
  deleteConversation,
};
`);

// ─────────────────────────────────────────────
// backend/server.js  (updated - history routes)
// ─────────────────────────────────────────────
write('backend/server.js', `// server.js - Express API with JWT auth + multi-DB + chat history
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

    const firstWord = sql.trim().split(/\\s+/)[0].toUpperCase();
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
`);

// ─────────────────────────────────────────────
// frontend/src/components/HistorySidebar.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/HistorySidebar.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';

function groupByDate(convs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'Last 7 days': [], Older: [] };

  for (const c of convs) {
    const d = new Date(c.updatedAt);
    d.setHours(0, 0, 0, 0);
    if (d >= today) groups['Today'].push(c);
    else if (d >= yesterday) groups['Yesterday'].push(c);
    else if (d >= weekAgo) groups['Last 7 days'].push(c);
    else groups['Older'].push(c);
  }

  return groups;
}

export default function HistorySidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
  refreshTrigger,
}) {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    load();
  }, [refreshTrigger]);

  const load = async () => {
    try {
      const res = await axios.get('/api/history');
      setConvs(res.data);
    } catch (e) {
      console.error('History load failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await axios.delete('/api/history/' + id);
      setConvs(prev => prev.filter(c => c.id !== id));
      if (activeId === id) onNew();
    } catch (e) {
      console.error('Delete failed', e.message);
    }
  };

  const groups = groupByDate(convs);

  return (
    <div style={s.sidebar}>

      {/* New chat button */}
      <div style={s.top}>
        <button style={s.newBtn} onClick={onNew}>
          <span style={s.newIcon}>+</span>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div style={s.list}>
        {loading && <div style={s.hint}>Loading...</div>}
        {!loading && convs.length === 0 && (
          <div style={s.hint}>No conversations yet.<br />Ask your first question!</div>
        )}

        {Object.entries(groups).map(([label, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <div style={s.groupLabel}>{label}</div>
              {items.map(c => (
                <div
                  key={c.id}
                  style={{
                    ...s.item,
                    ...(activeId === c.id ? s.itemActive : {}),
                    ...(hoverId === c.id && activeId !== c.id ? s.itemHover : {}),
                  }}
                  onClick={() => onSelect(c.id)}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <div style={s.itemContent}>
                    <div style={s.itemTitle}>{c.title}</div>
                    <div style={s.itemMeta}>
                      {c.dbLabel}
                      <span style={s.dot2}>·</span>
                      {c.messageCount} msg{c.messageCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {(hoverId === c.id || activeId === c.id) && (
                    <button
                      style={s.deleteBtn}
                      onClick={(e) => handleDelete(e, c.id)}
                      title="Delete"
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg2)',
    overflow: 'hidden',
  },
  top: {
    padding: '10px 10px 6px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  newBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  newIcon: {
    fontSize: 18,
    color: 'var(--accent2)',
    lineHeight: 1,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 6px',
  },
  hint: {
    color: 'var(--text3)',
    fontSize: 12,
    padding: '12px 8px',
    lineHeight: 1.6,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    padding: '10px 8px 4px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 8px',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 2,
    transition: 'background 0.1s',
  },
  itemActive: {
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
  },
  itemHover: {
    background: 'var(--bg3)',
  },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 13,
    color: 'var(--text)',
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    fontSize: 11,
    color: 'var(--text3)',
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dot2: { color: 'var(--border2)' },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 4,
    flexShrink: 0,
    opacity: 0.6,
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/App.jsx  (phase 4 - history)
// ─────────────────────────────────────────────
write('frontend/src/App.jsx', `import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useRole } from './components/RoleContext';
import LoginPage from './components/LoginPage';
import SchemaPanel from './components/SchemaPanel';
import SqlBadge from './components/SqlBadge';
import ResultChart from './components/ResultChart';
import ResultTable from './components/ResultTable';
import DbSelector from './components/DbSelector';
import AdminPanel from './components/AdminPanel';
import HistorySidebar from './components/HistorySidebar';

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

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [querying, setQuerying] = useState(false);

  // DB + conversation state
  const [selectedDb, setSelectedDb] = useState(null);
  const [activeConvId, setActiveConvId] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // UI state
  const [showSchema, setShowSchema] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Set axios auth header whenever token changes
  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    else delete axios.defaults.headers.common['Authorization'];
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  if (loading) return <div style={s.loading}>Loading...</div>;
  if (!user) return <LoginPage />;

  // ── Start a new blank conversation ────────────
  const startNewChat = () => {
    setMessages([]);
    setActiveConvId(null);
    setInput('');
    inputRef.current?.focus();
  };

  // ── Load an existing conversation ─────────────
  const loadConversation = async (id) => {
    try {
      const res = await axios.get('/api/history/' + id);
      const conv = res.data;
      setMessages(conv.messages);
      setActiveConvId(id);

      // If the conv's DB differs from current selection, try to match
      if (conv.dbId !== selectedDb?.id) {
        const dbRes = await axios.get('/api/databases');
        const match = dbRes.data.find(d => d.id === conv.dbId);
        if (match) setSelectedDb(match);
      }
    } catch (e) {
      console.error('Load conversation failed', e.message);
    }
  };

  // ── Ask a question ────────────────────────────
  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || querying || !selectedDb) return;

    setInput('');

    // Create conversation on first message
    let convId = activeConvId;
    if (!convId) {
      try {
        const res = await axios.post('/api/history', {
          dbId: selectedDb.id,
          dbLabel: selectedDb.label,
          firstQuestion: q,
        });
        convId = res.data.id;
        setActiveConvId(convId);
        setHistoryRefresh(n => n + 1); // refresh sidebar
      } catch (e) {
        console.error('Create conversation failed', e.message);
      }
    }

    const userMsg = { role: 'user', text: q, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setQuerying(true);

    try {
      const res = await axios.post('/api/query', {
        question: q,
        dbId: selectedDb.id,
        conversationId: convId,
      });

      const botMsg = {
        role: 'bot',
        type: 'result',
        sql: res.data.sql,
        columns: res.data.columns,
        rows: res.data.rows,
        rowCount: res.data.rowCount,
        durationMs: res.data.durationMs,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, botMsg]);
      setHistoryRefresh(n => n + 1); // update message count in sidebar
    } catch (err) {
      if (err.response?.status === 401) { logout(); return; }
      const errData = err.response?.data;
      setMessages(prev => [...prev, {
        role: 'bot',
        type: 'error',
        text: errData?.error || 'Something went wrong.',
        sql: errData?.sql || null,
        timestamp: new Date().toISOString(),
      }]);
      setHistoryRefresh(n => n + 1);
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
          <span style={s.logo}>sqlchat</span>
          <DbSelector selectedDb={selectedDb} onSelect={(db) => { setSelectedDb(db); startNewChat(); }} />
        </div>

        <div style={s.headerRight}>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowSchema(o => !o)}
                style={{ ...s.iconBtn, color: showSchema ? 'var(--accent2)' : 'var(--text3)' }}
                title="Toggle schema panel"
              >
                ⊞ Schema
              </button>
              <button onClick={() => setShowAdmin(true)} style={s.adminBtn}>
                ⚙ Admin
              </button>
            </>
          )}
          <div style={s.userInfo}>
            <span style={s.userName}>{user.username}</span>
            <span style={{
              ...s.rolePill,
              background: isAdmin ? '#1e1b4b' : '#0f2818',
              color: isAdmin ? '#818cf8' : '#4ade80',
            }}>
              {user.role}
            </span>
          </div>
          <button onClick={logout} style={s.logoutBtn}>Sign out</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={s.body}>

        {/* History sidebar — always visible when logged in */}
        <HistorySidebar
          activeId={activeConvId}
          onSelect={loadConversation}
          onNew={startNewChat}
          onDelete={(id) => { if (activeConvId === id) startNewChat(); }}
          refreshTrigger={historyRefresh}
        />

        {/* Schema panel — admin only, toggleable */}
        {isAdmin && (
          <SchemaPanel visible={showSchema} dbId={selectedDb?.id} token={token} />
        )}

        {/* Main chat area */}
        <div style={s.chatCol}>
          <div style={s.chat}>

            {messages.length === 0 && (
              <div style={s.welcome}>
                <div style={s.welcomeIcon}>🗄️</div>
                <div style={s.welcomeTitle}>Ask your database anything</div>
                <div style={s.welcomeSub}>
                  {selectedDb
                    ? 'Connected to ' + selectedDb.label
                    : 'Select a database above to get started'}
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

            {messages.map((msg, i) => (
              <Message key={i} msg={msg} isAdmin={isAdmin} />
            ))}

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

          {/* Input bar */}
          <div style={s.inputBar}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={selectedDb
                ? 'Ask a question about ' + selectedDb.label + '...'
                : 'Select a database first...'}
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

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
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
  loading: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14 },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', height: 48,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontSize: 16, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '-0.5px' },
  iconBtn: {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 12, padding: '4px 10px',
    cursor: 'pointer', fontWeight: 500,
  },
  adminBtn: {
    fontSize: 12, fontWeight: 600, color: 'var(--accent2)',
    background: '#1e1b4b', border: '1px solid #4f46e5',
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
  },
  userInfo: { display: 'flex', alignItems: 'center', gap: 6 },
  userName: { fontSize: 13, color: 'var(--text2)', fontWeight: 500 },
  rolePill: { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6 },
  logoutBtn: {
    fontSize: 12, color: 'var(--text3)', background: 'none',
    border: '1px solid var(--border)', borderRadius: 6,
    padding: '4px 10px', cursor: 'pointer',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  chatCol: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  chat: { flex: 1, overflowY: 'auto', padding: '24px 24px 8px', display: 'flex', flexDirection: 'column', gap: 20 },
  welcome: { margin: 'auto', textAlign: 'center', maxWidth: 520, paddingBottom: 40 },
  welcomeIcon: { fontSize: 36, marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 },
  welcomeSub: { fontSize: 14, color: 'var(--text3)', marginBottom: 24 },
  exampleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  exampleBtn: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text2)', padding: '10px 14px',
    fontSize: 13, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4,
  },
  msgUser: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    background: 'var(--accent)', color: '#fff',
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 16px', maxWidth: '65%', fontSize: 14, lineHeight: 1.5,
  },
  msgBot: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 30, height: 30, borderRadius: 8,
    background: 'var(--bg3)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700, color: 'var(--accent2)',
    flexShrink: 0, marginTop: 2,
  },
  dots: { display: 'flex', gap: 5, alignItems: 'center', paddingTop: 8 },
  dot: {
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    background: 'var(--accent)', animation: 'bounce 1.2s infinite ease-in-out',
  },
  errorBox: {
    background: 'var(--errorBg)', border: '1px solid var(--errorBorder)',
    borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13,
  },
  inputBar: {
    display: 'flex', gap: 10, padding: '12px 24px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)', flexShrink: 0,
  },
  textarea: {
    flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)',
    borderRadius: 10, color: 'var(--text)', padding: '10px 14px',
    fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.5,
  },
  sendBtn: {
    background: 'var(--accent)', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 22px', fontSize: 14,
    fontWeight: 600, flexShrink: 0, transition: 'opacity 0.15s',
  },
};
`);

console.log('');
console.log('Phase 4 files created!');
console.log('');
console.log('No new npm packages needed.');
console.log('Backend will hot-reload via nodemon.');
console.log('Frontend will hot-reload via Vite.');
console.log('');
console.log('New features:');
console.log('  - Chat history sidebar (left panel, like ChatGPT)');
console.log('  - Conversations grouped: Today / Yesterday / Last 7 days / Older');
console.log('  - Auto-title from first question');
console.log('  - Click to reload any past conversation');
console.log('  - Delete conversation (trash icon on hover)');
console.log('  - History synced to backend (works across devices)');
console.log('  - Schema panel now toggled via header button');
console.log('  - New Chat button at top of sidebar');
