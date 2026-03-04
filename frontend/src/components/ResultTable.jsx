export default function ResultTable({ columns, rows, durationMs }) {
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
