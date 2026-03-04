import { useState, useRef, useEffect } from 'react';
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
