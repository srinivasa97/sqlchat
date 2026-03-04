import { useState, useEffect } from 'react';
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
