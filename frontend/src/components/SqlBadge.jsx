import { useState } from 'react';

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
