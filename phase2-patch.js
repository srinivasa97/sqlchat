#!/usr/bin/env node
/**
 * phase2-patch.js
 * Run from C:\Users\Varun Sathvik\Repos\sqlchat
 * Usage: node phase2-patch.js
 *
 * Fixes:
 *  1. Schema sidebar column count showing 0
 *  2. Role-based visibility (Admin/Viewer toggle in header)
 *     - Admin: sees schema sidebar + SQL badge
 *     - Viewer: no sidebar, no SQL, just chart + table
 */

const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  updated:', filePath);
}

// ─────────────────────────────────────────────
// frontend/src/components/SchemaPanel.jsx
// Fix: column count parsing + only visible to admin (controlled by parent)
// ─────────────────────────────────────────────
write('frontend/src/components/SchemaPanel.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';

export default function SchemaPanel({ visible }) {
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchSchema(); }, []);

  const fetchSchema = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/schema');
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
      await axios.post('/api/schema/refresh');
      await fetchSchema();
    } finally {
      setRefreshing(false);
    }
  };

  // FIX: parse schema text properly into { name, columns[] }
  const parseSchema = (text) => {
    const result = [];
    if (!text) return result;

    const lines = text.split('\\n');
    let current = null;

    for (const raw of lines) {
      const line = raw.trimEnd();

      // Table header line: "tablename:" with no leading space
      if (/^[a-zA-Z_][a-zA-Z0-9_]*:$/.test(line)) {
        current = { name: line.slice(0, -1), columns: [] };
        result.push(current);
        continue;
      }

      // Column line: starts with 2 spaces
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

      <div style={s.dbLabel}>allocation</div>

      {loading && <div style={s.hint}>Loading...</div>}

      {!loading && tables.length === 0 && (
        <div style={s.hint}>No tables found.</div>
      )}

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
                      <span style={{ ...s.colName, color: isPK ? '#818cf8' : '#94a3b8' }}>
                        {isPK && <span style={s.pkDot} title="Primary Key">⬡ </span>}
                        {namePart}
                      </span>
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
  panel: {
    width: 230,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg2)',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  refreshBtn: {
    fontSize: 11,
    color: 'var(--text3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
  },
  dbLabel: {
    fontSize: 12,
    color: 'var(--accent2)',
    padding: '7px 14px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
    flexShrink: 0,
  },
  hint: {
    color: 'var(--text3)',
    fontSize: 12,
    padding: '10px 14px',
  },
  tableList: { flex: 1, overflowY: 'auto' },
  tableBlock: { borderBottom: '1px solid var(--border)' },
  tableBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text)',
    fontSize: 12,
    textAlign: 'left',
  },
  arrow: { color: 'var(--text3)', fontSize: 10, width: 10, flexShrink: 0 },
  tableName: { flex: 1, fontWeight: 500 },
  badge: {
    fontSize: 10,
    color: 'var(--text3)',
    background: 'var(--bg3)',
    padding: '1px 6px',
    borderRadius: 8,
    minWidth: 18,
    textAlign: 'center',
  },
  colList: { paddingBottom: 4 },
  colRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 14px 3px 28px',
    gap: 6,
  },
  colName: { fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pkDot: { fontSize: 9, marginRight: 2 },
  colType: {
    fontSize: 10,
    color: 'var(--text3)',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/RoleContext.jsx
// Simple React context — holds current role, exposes toggle
// ─────────────────────────────────────────────
write('frontend/src/components/RoleContext.jsx', `import { createContext, useContext, useState } from 'react';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRole] = useState('admin'); // default: admin

  const toggle = () => setRole(r => r === 'admin' ? 'viewer' : 'admin');

  return (
    <RoleContext.Provider value={{ role, toggle, isAdmin: role === 'admin' }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
`);

// ─────────────────────────────────────────────
// frontend/src/main.jsx  — wrap app in RoleProvider
// ─────────────────────────────────────────────
write('frontend/src/main.jsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RoleProvider } from './components/RoleContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RoleProvider>
      <App />
    </RoleProvider>
  </React.StrictMode>
);
`);

// ─────────────────────────────────────────────
// frontend/src/App.jsx  — role-aware
// ─────────────────────────────────────────────
write('frontend/src/App.jsx', `import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useRole } from './components/RoleContext';
import SchemaPanel from './components/SchemaPanel';
import SqlBadge from './components/SqlBadge';
import ResultChart from './components/ResultChart';
import ResultTable from './components/ResultTable';

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
          {/* Admin only: show SQL on errors too */}
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
        {/* Admin only: SQL badge */}
        {isAdmin && msg.sql && <SqlBadge sql={msg.sql} />}

        {/* Everyone: chart + table */}
        <ResultChart columns={msg.columns} rows={msg.rows} />
        <ResultTable columns={msg.columns} rows={msg.rows} durationMs={msg.durationMs} />
      </div>
    </div>
  );
}

export default function App() {
  const { role, toggle, isAdmin } = useRole();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // When switching to viewer, close schema panel
  useEffect(() => {
    if (!isAdmin) setSchemaOpen(false);
    if (isAdmin) setSchemaOpen(true);
  }, [isAdmin]);

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);

    try {
      const res = await axios.post('/api/query', { question: q });
      setMessages(prev => [...prev, {
        role: 'bot',
        type: 'result',
        sql: res.data.sql,
        columns: res.data.columns,
        rows: res.data.rows,
        rowCount: res.data.rowCount,
        durationMs: res.data.durationMs,
      }]);
    } catch (err) {
      const errData = err.response?.data;
      setMessages(prev => [...prev, {
        role: 'bot',
        type: 'error',
        text: errData?.error || 'Backend not reachable. Is the server running on port 3005?',
        sql: errData?.sql || null,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <div style={s.app}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          {/* Schema toggle — admin only */}
          {isAdmin && (
            <button
              onClick={() => setSchemaOpen(o => !o)}
              style={s.iconBtn}
              title="Toggle schema panel"
            >
              ☰
            </button>
          )}
          <span style={s.logo}>sqlchat</span>
          <span style={s.headerPill}>allocation</span>
        </div>

        <div style={s.headerRight}>
          {/* Role switcher — temporary until full auth */}
          <div style={s.roleSwitcher}>
            <span style={s.roleLabel}>View as:</span>
            <button
              onClick={toggle}
              style={{
                ...s.roleBtn,
                background: isAdmin ? '#1e1b4b' : '#0f2818',
                borderColor: isAdmin ? '#4f46e5' : '#166534',
                color: isAdmin ? '#818cf8' : '#4ade80',
              }}
            >
              {isAdmin ? '⚙ Admin' : '👤 Viewer'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={s.body}>

        {/* Schema sidebar — admin only */}
        {isAdmin && <SchemaPanel visible={schemaOpen} />}

        <div style={s.chatCol}>
          <div style={s.chat}>

            {messages.length === 0 && (
              <div style={s.welcome}>
                <div style={s.welcomeIcon}>🗄️</div>
                <div style={s.welcomeTitle}>Ask your database anything</div>
                <div style={s.welcomeSub}>
                  {isAdmin
                    ? 'Admin mode — schema visible, SQL shown.'
                    : 'Ask a question in plain English and get instant results.'}
                </div>
                <div style={s.exampleGrid}>
                  {EXAMPLES.map((q, i) => (
                    <button key={i} style={s.exampleBtn} onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <Message key={i} msg={msg} isAdmin={isAdmin} />
            ))}

            {loading && (
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
              placeholder="Ask a question about your data..."
              rows={1}
              style={s.textarea}
              disabled={loading}
            />
            <button
              onClick={() => ask()}
              disabled={loading || !input.trim()}
              style={{
                ...s.sendBtn,
                opacity: (loading || !input.trim()) ? 0.4 : 1,
                cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              Ask
            </button>
          </div>
        </div>
      </div>

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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 48,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
  },
  logo: { fontSize: 16, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '-0.5px' },
  headerPill: {
    fontSize: 11,
    color: 'var(--text3)',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    padding: '2px 8px',
    borderRadius: 10,
  },
  roleSwitcher: { display: 'flex', alignItems: 'center', gap: 8 },
  roleLabel: { fontSize: 11, color: 'var(--text3)' },
  roleBtn: {
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  chatCol: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  chat: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 24px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  welcome: {
    margin: 'auto',
    textAlign: 'center',
    maxWidth: 520,
    paddingBottom: 40,
  },
  welcomeIcon: { fontSize: 36, marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 },
  welcomeSub: { fontSize: 14, color: 'var(--text3)', marginBottom: 24 },
  exampleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  exampleBtn: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text2)',
    padding: '10px 14px',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    lineHeight: 1.4,
  },
  msgUser: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 16px',
    maxWidth: '65%',
    fontSize: 14,
    lineHeight: 1.5,
  },
  msgBot: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--accent2)',
    flexShrink: 0,
    marginTop: 2,
  },
  dots: { display: 'flex', gap: 5, alignItems: 'center', paddingTop: 8 },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'bounce 1.2s infinite ease-in-out',
  },
  errorBox: {
    background: 'var(--errorBg)',
    border: '1px solid var(--errorBorder)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: 13,
  },
  inputBar: {
    display: 'flex',
    gap: 10,
    padding: '12px 24px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '10px 14px',
    fontSize: 14,
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
  },
  sendBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
};
`);

console.log('');
console.log('Patch applied!');
console.log('');
console.log('No npm install needed — no new packages.');
console.log('');
console.log('Just save and the Vite dev server will hot-reload.');
console.log('');
console.log('What changed:');
console.log('  - Schema sidebar column counts now show correctly');
console.log('  - Role switcher in header: Admin / Viewer toggle');
console.log('  - Admin: schema sidebar + SQL badge visible');
console.log('  - Viewer: no sidebar, no SQL, just chart + table');
console.log('  - RoleContext.jsx added (ready to wire into real auth later)');
