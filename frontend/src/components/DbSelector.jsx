import { useState, useEffect } from 'react';
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
