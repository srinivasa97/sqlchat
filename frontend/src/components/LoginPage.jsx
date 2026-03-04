import { useState } from 'react';
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
