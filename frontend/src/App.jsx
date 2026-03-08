import { useState, useRef, useEffect } from 'react';
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
import Dashboard from './components/Dashboard';

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

  const [selectedDb, setSelectedDb] = useState(null);
  const [activeConvId, setActiveConvId] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const [showSchema, setShowSchema] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'chat'

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (token) axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
    else delete axios.defaults.headers.common['Authorization'];
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  if (loading) return <div style={s.loading}>Loading...</div>;
  if (!user) return <LoginPage />;

  const startNewChat = () => {
    setMessages([]);
    setActiveConvId(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const loadConversation = async (id) => {
    try {
      const res = await axios.get('/api/history/' + id);
      const conv = res.data;
      setMessages(conv.messages);
      setActiveConvId(id);
      if (conv.dbId !== selectedDb?.id) {
        const dbRes = await axios.get('/api/databases');
        const match = dbRes.data.find(d => d.id === conv.dbId);
        if (match) setSelectedDb(match);
      }
    } catch (e) {
      console.error('Load conversation failed', e.message);
    }
  };

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || querying || !selectedDb) return;

    setInput('');

    // Step 1: create conversation if this is a new chat
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
        setHistoryRefresh(n => n + 1);
      } catch (e) {
        console.error('Create conversation failed', e.message);
        // continue without history if it fails
      }
    }

    // Step 2: show user message in UI
    setMessages(prev => [...prev, {
      role: 'user',
      text: q,
      timestamp: new Date().toISOString(),
    }]);
    setQuerying(true);

    // Step 3: run query
    try {
      const res = await axios.post('/api/query', {
        question: q,
        dbId: selectedDb.id,
        conversationId: convId || null,
      });

      setMessages(prev => [...prev, {
        role: 'bot',
        type: 'result',
        sql: res.data.sql,
        columns: res.data.columns,
        rows: res.data.rows,
        rowCount: res.data.rowCount,
        durationMs: res.data.durationMs,
        timestamp: new Date().toISOString(),
      }]);
      setHistoryRefresh(n => n + 1);

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

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.logo}>sqlchat</span>
          <DbSelector
            selectedDb={selectedDb}
            onSelect={(db) => { setSelectedDb(db); startNewChat(); }}
          />
        </div>

        <div style={s.headerRight}>
          {/* View toggle */}
          <div style={s.viewToggle}>
            <button
              onClick={() => setView('dashboard')}
              style={{ ...s.toggleBtn, ...(view === 'dashboard' ? s.toggleActive : {}) }}
              title="Dashboard"
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setView('chat')}
              style={{ ...s.toggleBtn, ...(view === 'chat' ? s.toggleActive : {}) }}
              title="Chat"
            >
              💬 Chat
            </button>
          </div>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowSchema(o => !o)}
                style={{
                  ...s.iconBtn,
                  color: showSchema ? 'var(--accent2)' : 'var(--text3)',
                  borderColor: showSchema ? 'var(--accent)' : 'var(--border)',
                }}
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
          <button onClick={() => { startNewChat(); logout(); }} style={s.logoutBtn}> Sign out</button>
        </div>
      </div>

      {/* Body */}
      <div style={s.body}>

        {/* Dashboard view */}
        {view === 'dashboard' && (
          <Dashboard selectedDb={selectedDb} token={token} />
        )}

        {/* Chat view */}
        {view === 'chat' && (<>
        {/* History sidebar */}
        <HistorySidebar
          activeId={activeConvId}
          onSelect={loadConversation}
          onNew={startNewChat}
          onDelete={(id) => { if (activeConvId === id) startNewChat(); }}
          refreshTrigger={historyRefresh}
          token={token}
          key={user?.id}
        />

        {/* Schema panel — admin only */}
        {isAdmin && (
          <SchemaPanel visible={showSchema} dbId={selectedDb?.id} token={token} />
        )}

        {/* Chat area */}
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
                      <button key={i} style={s.exampleBtn} onClick={() => ask(q)}>
                        {q}
                      </button>
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
          <div style={s.inputHint}>
            💡 Tip: Add "as pie chart" or "as bar chart" to your question for a specific chart type.&nbsp;&nbsp;|&nbsp;&nbsp;Press <kbd style={s.kbd}>Enter</kbd> to send, <kbd style={s.kbd}>Shift+Enter</kbd> for new line.
          </div>
        </div>
        </>)}
      </div>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      <style>{dotAnim}</style>
    </div>
  );
}

const dotAnim = `
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40%           { transform: translateY(-6px); opacity: 1; }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
`;

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
  viewToggle: {
    display: 'flex', background: 'var(--bg3)',
    border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2,
  },
  toggleBtn: {
    background: 'none', border: 'none', borderRadius: 6,
    color: 'var(--text3)', fontSize: 12, fontWeight: 500,
    padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s',
  },
  toggleActive: {
    background: 'var(--bg2)', color: 'var(--text)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  iconBtn: {
    background: 'none', border: '1px solid',
    borderRadius: 6, fontSize: 12, padding: '4px 10px',
    cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
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
  inputHint: {
    textAlign: 'center', fontSize: 11, color: 'var(--text3)',
    padding: '4px 24px 10px', background: 'var(--bg2)',
  },
  kbd: {
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    borderRadius: 4, padding: '1px 5px', fontSize: 10,
    color: 'var(--text2)', fontFamily: 'monospace',
  },
};
