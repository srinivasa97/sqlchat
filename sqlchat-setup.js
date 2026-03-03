#!/usr/bin/env node
/**
 * sqlchat-setup.js
 * Run this once from C:\Users\Varun Sathvik\sqlchat to generate all project files.
 * Usage: node sqlchat-setup.js
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
// BACKEND FILES
// ─────────────────────────────────────────────

write('backend/package.json', `{
  "name": "sqlchat-backend",
  "version": "1.0.0",
  "description": "AskYourDatabase backend - Express + Ollama + MySQL",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "mysql2": "^3.6.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
`);

write('backend/db.js', `// db.js - MySQL connection pool (XAMPP, user=root, no password)
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
`);

write('backend/schema.js', `// schema.js - Loads and caches live MySQL schema for use in Ollama prompts
const pool = require('./db');

let cachedSchema = null;
let lastFetched = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getSchema() {
  const now = Date.now();
  if (cachedSchema && lastFetched && now - lastFetched < CACHE_TTL_MS) {
    return cachedSchema;
  }

  const sql =
    "SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_KEY, c.IS_NULLABLE " +
    "FROM information_schema.COLUMNS c " +
    "WHERE c.TABLE_SCHEMA = 'allocation' " +
    "ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION";

  const [columns] = await pool.query(sql);

  const tables = {};
  for (const row of columns) {
    if (!tables[row.TABLE_NAME]) tables[row.TABLE_NAME] = [];
    const pk = row.COLUMN_KEY === 'PRI' ? ' [PK]' : '';
    const nullable = row.IS_NULLABLE === 'YES' ? '' : ' NOT NULL';
    tables[row.TABLE_NAME].push('  ' + row.COLUMN_NAME + ' (' + row.DATA_TYPE + pk + nullable + ')');
  }

  let schemaText = 'Database: allocation\\n\\nTables:\\n';
  for (const [tableName, cols] of Object.entries(tables)) {
    schemaText += '\\n' + tableName + ':\\n' + cols.join('\\n') + '\\n';
  }

  cachedSchema = schemaText;
  lastFetched = now;
  console.log('[schema] Loaded ' + Object.keys(tables).length + ' tables');
  return cachedSchema;
}

function clearSchemaCache() {
  cachedSchema = null;
  lastFetched = null;
}

module.exports = { getSchema, clearSchemaCache };
`);

write('backend/ollama.js', `// ollama.js - Converts natural language to SQL using Ollama
const axios = require('axios');
const { getSchema } = require('./schema');

const OLLAMA_BASE_URL = 'http://192.168.1.10:11434';
const MODEL = 'qwen3-coder:30b';

async function questionToSQL(question) {
  const schema = await getSchema();

  const prompt =
    'You are a MySQL expert. Convert the question below to a MySQL SELECT query.\\n\\n' +
    'SCHEMA:\\n' + schema + '\\n\\n' +
    'RULES:\\n' +
    '- Reply with ONLY a raw SQL SELECT query. No explanation, no markdown, no backticks.\\n' +
    '- Never use DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE.\\n' +
    '- Always add LIMIT 200 unless the user asks for more.\\n' +
    '- Use JOINs when data spans multiple tables.\\n' +
    '- If unclear, make a reasonable guess.\\n\\n' +
    'Question: ' + question + '\\n\\nSQL:';

  const response = await axios.post(OLLAMA_BASE_URL + '/api/generate', {
    model: MODEL,
    prompt: prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 500 },
  });

  let sql = response.data.response.trim();

  // Strip markdown fences
  sql = sql.replace(/^\`\`\`sql\\s*/i, '').replace(/^\`\`\`\\s*/i, '').replace(/\`\`\`\\s*$/i, '').trim();

  // Strip <think> blocks (qwen3 thinking mode)
  sql = sql.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();

  // Keep only first statement
  const semi = sql.indexOf(';');
  if (semi !== -1) sql = sql.substring(0, semi + 1);

  console.log('[ollama] SQL:', sql);
  return sql;
}

module.exports = { questionToSQL };
`);

write('backend/server.js', `// server.js - Express API server
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
    const firstWord = sql.trim().split(/\\s+/)[0].toUpperCase();
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
`);

// ─────────────────────────────────────────────
// FRONTEND FILES
// ─────────────────────────────────────────────

write('frontend/package.json', `{
  "name": "sqlchat-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
`);

write('frontend/vite.config.js', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to backend so no CORS issues in dev
      '/api': 'http://localhost:3001',
    },
  },
});
`);

write('frontend/index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>sqlchat - Ask Your Database</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`);

write('frontend/src/main.jsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);

write('frontend/src/index.css', `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  min-height: 100vh;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
`);

write('frontend/src/App.jsx', `import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const EXAMPLE_QUESTIONS = [
  'How many candidates are there in total?',
  'Show me the top 10 candidates by name',
  'How many candidates are from each city?',
  'Which candidates were added this month?',
];

function SqlBadge({ sql }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={styles.sqlBadge}>
      <span style={styles.sqlLabel}>SQL</span>
      <code style={styles.sqlCode}>{sql}</code>
      <button onClick={copy} style={styles.copyBtn}>{copied ? 'Copied!' : 'Copy'}</button>
    </div>
  );
}

function ResultTable({ columns, rows }) {
  if (!rows || rows.length === 0) {
    return <div style={styles.emptyMsg}>No results returned.</div>;
  }
  return (
    <div style={styles.tableWrap}>
      <div style={styles.rowCount}>{rows.length} row{rows.length !== 1 ? 's' : ''}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} style={styles.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                {columns.map(col => (
                  <td key={col} style={styles.td}>
                    {row[col] === null ? <span style={styles.nullVal}>NULL</span> : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div style={styles.msgUser}>
        <div style={styles.msgUserBubble}>{msg.text}</div>
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div style={styles.msgBot}>
        <div style={styles.botAvatar}>DB</div>
        <div style={{ flex: 1 }}>
          {msg.sql && <SqlBadge sql={msg.sql} />}
          <div style={styles.errorBox}>{msg.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.msgBot}>
      <div style={styles.botAvatar}>DB</div>
      <div style={{ flex: 1 }}>
        {msg.sql && <SqlBadge sql={msg.sql} />}
        <ResultTable columns={msg.columns} rows={msg.rows} />
        {msg.durationMs && (
          <div style={styles.timing}>{msg.durationMs}ms</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
        text: errData?.error || 'Something went wrong. Check that the backend is running.',
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
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>sqlchat</span>
        <span style={styles.headerSub}>allocation database</span>
      </div>

      {/* Chat area */}
      <div style={styles.chat}>
        {messages.length === 0 && (
          <div style={styles.welcome}>
            <div style={styles.welcomeTitle}>Ask your database anything</div>
            <div style={styles.welcomeSub}>No SQL needed — just type a question in plain English.</div>
            <div style={styles.examples}>
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} style={styles.exampleBtn} onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {loading && (
          <div style={styles.msgBot}>
            <div style={styles.botAvatar}>DB</div>
            <div style={styles.thinking}>Thinking...</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={styles.inputBar}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question about your data..."
          rows={1}
          style={styles.textarea}
          disabled={loading}
        />
        <button
          onClick={() => ask()}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendBtn,
            opacity: (loading || !input.trim()) ? 0.5 : 1,
            cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '...' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: 900,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 24px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  },
  logo: {
    fontSize: 18,
    fontWeight: 600,
    color: '#818cf8',
    letterSpacing: '-0.5px',
  },
  headerSub: {
    fontSize: 13,
    color: '#475569',
    borderLeft: '1px solid #1e293b',
    paddingLeft: 12,
  },
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
    paddingBottom: 40,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 8,
  },
  welcomeSub: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 28,
  },
  examples: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  exampleBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#94a3b8',
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  msgUser: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  msgUserBubble: {
    background: '#4f46e5',
    color: '#fff',
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 16px',
    maxWidth: '70%',
    fontSize: 15,
    lineHeight: 1.5,
  },
  msgBot: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: '#1e293b',
    border: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    color: '#818cf8',
    flexShrink: 0,
    marginTop: 2,
  },
  thinking: {
    color: '#475569',
    fontSize: 14,
    paddingTop: 6,
    fontStyle: 'italic',
  },
  sqlBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#0f1117',
    border: '1px solid #1e293b',
    borderRadius: 6,
    padding: '6px 10px',
    marginBottom: 8,
    overflow: 'hidden',
  },
  sqlLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#818cf8',
    background: '#1e1b4b',
    padding: '2px 6px',
    borderRadius: 4,
    flexShrink: 0,
  },
  sqlCode: {
    fontSize: 12,
    color: '#94a3b8',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
  },
  copyBtn: {
    fontSize: 11,
    color: '#475569',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    padding: '2px 4px',
  },
  tableWrap: {
    background: '#0f1117',
    border: '1px solid #1e293b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  rowCount: {
    fontSize: 12,
    color: '#475569',
    padding: '6px 12px',
    borderBottom: '1px solid #1e293b',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    background: '#0d1424',
    color: '#818cf8',
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 500,
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  trEven: { background: '#0f1117' },
  trOdd: { background: '#0d1424' },
  td: {
    padding: '7px 12px',
    borderBottom: '1px solid #0d1424',
    color: '#cbd5e1',
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nullVal: { color: '#475569', fontStyle: 'italic' },
  emptyMsg: {
    color: '#475569',
    fontSize: 14,
    padding: 16,
    background: '#0f1117',
    border: '1px solid #1e293b',
    borderRadius: 8,
  },
  errorBox: {
    background: '#1c0e0e',
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: 13,
  },
  timing: {
    fontSize: 11,
    color: '#334155',
    marginTop: 6,
    textAlign: 'right',
  },
  inputBar: {
    display: 'flex',
    gap: 10,
    padding: '16px 24px',
    borderTop: '1px solid #1e293b',
    flexShrink: 0,
    background: '#0f1117',
  },
  textarea: {
    flex: 1,
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 10,
    color: '#e2e8f0',
    padding: '10px 14px',
    fontSize: 15,
    resize: 'none',
    outline: 'none',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.5,
  },
  sendBtn: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 600,
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
};
`);

write('.gitignore', `node_modules/
dist/
.env
*.log
`);

write('README.md', `# sqlchat

Ask your MySQL database questions in plain English.

## Setup

### Backend
\`\`\`
cd backend
npm install
npm run dev
\`\`\`
Runs on http://localhost:3001

### Frontend
\`\`\`
cd frontend
npm install
npm run dev
\`\`\`
Runs on http://localhost:5173

## Requirements
- XAMPP MySQL running with \`allocation\` database
- Ollama running on 192.168.1.10:11434 with \`qwen3-coder:30b\` model

## API Endpoints
- \`GET  /api/health\`        - Check MySQL + server status
- \`GET  /api/schema\`        - View loaded schema
- \`POST /api/schema/refresh\` - Force schema reload
- \`POST /api/query\`         - \`{ question: "..." }\` -> \`{ sql, rows, columns, rowCount, durationMs }\`
`);

console.log('');
console.log('All files created!');
console.log('');
console.log('Next steps:');
console.log('  1. cd backend && npm install && npm run dev');
console.log('  2. (new terminal) cd frontend && npm install && npm run dev');
console.log('  3. Open http://localhost:5173');