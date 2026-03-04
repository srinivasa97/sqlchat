#!/usr/bin/env node
/**
 * phase2-setup.js
 * Run from C:\Users\Varun Sathvik\Repos\sqlchat
 * Usage: node phase2-setup.js
 *
 * What this does:
 *  - Updates frontend/package.json with recharts
 *  - Overwrites frontend/src/App.jsx with shadcn-style UI + recharts
 *  - Overwrites frontend/src/index.css
 *  - Creates frontend/src/components/ — reusable pieces
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
// frontend/package.json  (add recharts)
// ─────────────────────────────────────────────
write('frontend/package.json', `{
  "name": "sqlchat-frontend",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
`);

// ─────────────────────────────────────────────
// frontend/src/index.css
// ─────────────────────────────────────────────
write('frontend/src/index.css', `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #0a0e1a;
  --bg2:       #0f1525;
  --bg3:       #151d30;
  --border:    #1e2d45;
  --border2:   #253350;
  --accent:    #6366f1;
  --accent2:   #818cf8;
  --text:      #e2e8f0;
  --text2:     #94a3b8;
  --text3:     #475569;
  --success:   #22c55e;
  --error:     #ef4444;
  --errorBg:   #1a0808;
  --errorBorder:#7f1d1d;
}

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  font-size: 14px;
  line-height: 1.5;
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

button { font-family: inherit; }
input, textarea { font-family: inherit; }
`);

// ─────────────────────────────────────────────
// frontend/src/components/SchemaPanel.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/SchemaPanel.jsx', `import { useState, useEffect } from 'react';
import axios from 'axios';

export default function SchemaPanel({ visible }) {
  const [schema, setSchema] = useState('');
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchSchema();
  }, []);

  const fetchSchema = async () => {
    try {
      const res = await axios.get('/api/schema');
      setSchema(res.data.schema);
      setTables(parseSchema(res.data.schema));
    } catch (e) {
      console.error('Schema load failed', e);
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

  const parseSchema = (text) => {
    const tables = [];
    const lines = text.split('\\n');
    let current = null;
    for (const line of lines) {
      if (line.endsWith(':') && !line.startsWith(' ') && !line.startsWith('Database') && !line.startsWith('Tables')) {
        current = { name: line.slice(0, -1), columns: [] };
        tables.push(current);
      } else if (current && line.trim().startsWith(' ')) {
        current.columns.push(line.trim());
      }
    }
    return tables;
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

      <div style={s.db}>allocation</div>

      {loading && <div style={s.loading}>Loading...</div>}

      <div style={s.tableList}>
        {tables.map(t => (
          <div key={t.name} style={s.tableBlock}>
            <button style={s.tableBtn} onClick={() => toggle(t.name)}>
              <span style={s.tableIcon}>{open[t.name] ? '▾' : '▸'}</span>
              <span style={s.tableName}>{t.name}</span>
              <span style={s.colCount}>{t.columns.length}</span>
            </button>
            {open[t.name] && (
              <div style={s.columns}>
                {t.columns.map((col, i) => {
                  const isPK = col.includes('[PK]');
                  const name = col.split('(')[0].trim();
                  const type = col.match(/\\(([^)]+)\\)/)?.[1] || '';
                  return (
                    <div key={i} style={s.col}>
                      <span style={{ ...s.colName, color: isPK ? '#818cf8' : '#94a3b8' }}>{name}</span>
                      <span style={s.colType}>{type}</span>
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
    width: 220,
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
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: 11,
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
  db: {
    fontSize: 12,
    color: 'var(--accent2)',
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
  },
  loading: { color: 'var(--text3)', fontSize: 12, padding: 14 },
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
    fontSize: 13,
    textAlign: 'left',
  },
  tableIcon: { color: 'var(--text3)', fontSize: 10, width: 10 },
  tableName: { flex: 1, fontWeight: 500 },
  colCount: {
    fontSize: 10,
    color: 'var(--text3)',
    background: 'var(--bg3)',
    padding: '1px 5px',
    borderRadius: 8,
  },
  columns: { paddingBottom: 4 },
  col: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 14px 3px 30px',
    gap: 8,
  },
  colName: { fontSize: 12, flex: 1 },
  colType: { fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/SqlBadge.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/SqlBadge.jsx', `import { useState } from 'react';

export default function SqlBadge({ sql }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={s.wrap}>
      <div style={s.top}>
        <span style={s.label}>SQL</span>
        <code style={{
          ...s.code,
          whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
        }}>
          {sql}
        </code>
        <button onClick={() => setExpanded(e => !e)} style={s.btn}>
          {expanded ? 'collapse' : 'expand'}
        </button>
        <button onClick={copy} style={{ ...s.btn, color: copied ? '#22c55e' : 'var(--text3)' }}>
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 10px',
    marginBottom: 8,
  },
  top: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    overflow: 'hidden',
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--accent2)',
    background: '#1e1b4b',
    padding: '2px 6px',
    borderRadius: 4,
    flexShrink: 0,
    marginTop: 1,
  },
  code: {
    fontSize: 12,
    color: 'var(--text2)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'monospace',
    lineHeight: 1.6,
  },
  btn: {
    fontSize: 11,
    color: 'var(--text3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    padding: '2px 4px',
    whiteSpace: 'nowrap',
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/ResultChart.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/ResultChart.jsx', `import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

// Detect if results are chartable:
// Chartable = exactly 2 columns, one string + one number
function detectChart(columns, rows) {
  if (!columns || columns.length !== 2 || !rows || rows.length < 2) return null;

  const [colA, colB] = columns;
  const sample = rows[0];

  const aIsString = typeof sample[colA] === 'string';
  const bIsNumber = typeof sample[colB] === 'number' || !isNaN(Number(sample[colB]));

  if (!aIsString || !bIsNumber) return null;

  // Use pie if <= 6 items, bar otherwise
  const type = rows.length <= 6 ? 'pie' : 'bar';
  return { type, labelKey: colA, valueKey: colB };
}

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#a78bfa','#34d399','#fb923c'];

export default function ResultChart({ columns, rows }) {
  const chart = detectChart(columns, rows);
  if (!chart) return null;

  const data = rows.map(row => ({
    name: String(row[chart.labelKey]),
    value: Number(row[chart.valueKey]),
  }));

  if (chart.type === 'pie') {
    return (
      <div style={s.wrap}>
        <div style={s.chartTitle}>{chart.valueKey} by {chart.labelKey}</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f1525', border: '1px solid #1e2d45', borderRadius: 6 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.chartTitle}>{chart.valueKey} by {chart.labelKey}</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0f1525', border: '1px solid #1e2d45', borderRadius: 6 }}
            labelStyle={{ color: '#e2e8f0' }}
            cursor={{ fill: '#1e2d45' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const s = {
  wrap: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 12,
    color: 'var(--text3)',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/components/ResultTable.jsx
// ─────────────────────────────────────────────
write('frontend/src/components/ResultTable.jsx', `export default function ResultTable({ columns, rows, durationMs }) {
  if (!rows || rows.length === 0) {
    return <div style={s.empty}>No results returned.</div>;
  }

  return (
    <div style={s.wrap}>
      <div style={s.meta}>
        <span>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
        {durationMs && <span style={s.timing}>{durationMs}ms</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} style={s.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                {columns.map(col => (
                  <td key={col} style={s.td}>
                    {row[col] === null
                      ? <span style={s.nullVal}>null</span>
                      : String(row[col])}
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

const s = {
  wrap: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 12,
    color: 'var(--text3)',
  },
  timing: { color: 'var(--text3)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    background: 'var(--bg2)',
    color: 'var(--accent2)',
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 500,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  },
  trEven: { background: 'var(--bg)' },
  trOdd: { background: 'var(--bg2)' },
  td: {
    padding: '7px 12px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text)',
    maxWidth: 280,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nullVal: { color: 'var(--text3)', fontStyle: 'italic' },
  empty: {
    color: 'var(--text3)',
    fontSize: 13,
    padding: 16,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
  },
};
`);

// ─────────────────────────────────────────────
// frontend/src/App.jsx  (main — phase 2)
// ─────────────────────────────────────────────
write('frontend/src/App.jsx', `import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import SchemaPanel from './components/SchemaPanel';
import SqlBadge from './components/SqlBadge';
import ResultChart from './components/ResultChart';
import ResultTable from './components/ResultTable';

const EXAMPLES = [
  'How many candidates are there in total?',
  'Show me candidates grouped by city',
  'How many candidates per job title?',
  'List the top 10 candidates by name',
];

function Message({ msg }) {
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
          {msg.sql && <SqlBadge sql={msg.sql} />}
          <div style={s.errorBox}>{msg.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.msgBot}>
      <Avatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.sql && <SqlBadge sql={msg.sql} />}
        <ResultChart columns={msg.columns} rows={msg.rows} />
        <ResultTable columns={msg.columns} rows={msg.rows} durationMs={msg.durationMs} />
      </div>
    </div>
  );
}

function Avatar() {
  return <div style={s.avatar}>DB</div>;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(true);
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
          <button
            onClick={() => setSchemaOpen(o => !o)}
            style={s.schemaToggle}
            title="Toggle schema panel"
          >
            ☰
          </button>
          <span style={s.logo}>sqlchat</span>
          <span style={s.headerPill}>allocation</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.headerHint}>Press Enter to ask</span>
        </div>
      </div>

      {/* ── Body: sidebar + chat ── */}
      <div style={s.body}>

        <SchemaPanel visible={schemaOpen} />

        <div style={s.chatCol}>

          {/* Chat messages */}
          <div style={s.chat}>
            {messages.length === 0 && (
              <div style={s.welcome}>
                <div style={s.welcomeIcon}>🗄️</div>
                <div style={s.welcomeTitle}>Ask your database anything</div>
                <div style={s.welcomeSub}>No SQL needed — plain English works.</div>
                <div style={s.exampleGrid}>
                  {EXAMPLES.map((q, i) => (
                    <button key={i} style={s.exampleBtn} onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => <Message key={i} msg={msg} />)}

            {loading && (
              <div style={s.msgBot}>
                <Avatar />
                <div style={s.thinkingDots}>
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

      <style>{dotAnimation}</style>
    </div>
  );
}

const dotAnimation = \`
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
}
\`;

const s = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
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
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  schemaToggle: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
  },
  logo: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--accent2)',
    letterSpacing: '-0.5px',
  },
  headerPill: {
    fontSize: 11,
    color: 'var(--text3)',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    padding: '2px 8px',
    borderRadius: 10,
  },
  headerHint: { fontSize: 11, color: 'var(--text3)' },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  chatCol: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
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
    maxWidth: 520,
    paddingBottom: 40,
  },
  welcomeIcon: { fontSize: 36, marginBottom: 12 },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 6,
  },
  welcomeSub: {
    fontSize: 14,
    color: 'var(--text3)',
    marginBottom: 24,
  },
  exampleGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
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
  msgUser: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  userBubble: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 16px',
    maxWidth: '65%',
    fontSize: 14,
    lineHeight: 1.5,
  },
  msgBot: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
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
  thinkingDots: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    paddingTop: 8,
  },
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
console.log('Phase 2 files created!');
console.log('');
console.log('Next steps:');
console.log('  cd frontend');
console.log('  npm install       (picks up recharts)');
console.log('  npm run dev');
console.log('');
console.log('New features:');
console.log('  - Schema sidebar (collapsible, shows all tables + columns)');
console.log('  - Auto bar/pie chart when results have 2 columns (label + number)');
console.log('  - Expandable SQL badge with copy button');
console.log('  - Animated thinking dots while loading');
console.log('  - 2-column example question grid on welcome screen');
