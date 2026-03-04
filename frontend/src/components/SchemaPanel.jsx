import { useState, useEffect } from 'react';
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

    const lines = text.split('\n');
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
                  const typePart = col.match(/\(([^)]+)\)/)?.[1] || '';
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
