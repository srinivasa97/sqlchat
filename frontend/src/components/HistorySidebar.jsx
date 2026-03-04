import { useState, useEffect } from 'react';
import axios from 'axios';

function groupByDate(convs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'Last 7 days': [], Older: [] };

  for (const c of convs) {
    const d = new Date(c.updatedAt);
    d.setHours(0, 0, 0, 0);
    if (d >= today) groups['Today'].push(c);
    else if (d >= yesterday) groups['Yesterday'].push(c);
    else if (d >= weekAgo) groups['Last 7 days'].push(c);
    else groups['Older'].push(c);
  }

  return groups;
}

export default function HistorySidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
  refreshTrigger,
}) {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    load();
  }, [refreshTrigger]);

  const load = async () => {
    try {
      const res = await axios.get('/api/history');
      setConvs(res.data);
    } catch (e) {
      console.error('History load failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await axios.delete('/api/history/' + id);
      setConvs(prev => prev.filter(c => c.id !== id));
      if (activeId === id) onNew();
    } catch (e) {
      console.error('Delete failed', e.message);
    }
  };

  const groups = groupByDate(convs);

  return (
    <div style={s.sidebar}>

      {/* New chat button */}
      <div style={s.top}>
        <button style={s.newBtn} onClick={onNew}>
          <span style={s.newIcon}>+</span>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div style={s.list}>
        {loading && <div style={s.hint}>Loading...</div>}
        {!loading && convs.length === 0 && (
          <div style={s.hint}>No conversations yet.<br />Ask your first question!</div>
        )}

        {Object.entries(groups).map(([label, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <div style={s.groupLabel}>{label}</div>
              {items.map(c => (
                <div
                  key={c.id}
                  style={{
                    ...s.item,
                    ...(activeId === c.id ? s.itemActive : {}),
                    ...(hoverId === c.id && activeId !== c.id ? s.itemHover : {}),
                  }}
                  onClick={() => onSelect(c.id)}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <div style={s.itemContent}>
                    <div style={s.itemTitle}>{c.title}</div>
                    <div style={s.itemMeta}>
                      {c.dbLabel}
                      <span style={s.dot2}>·</span>
                      {c.messageCount} msg{c.messageCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {(hoverId === c.id || activeId === c.id) && (
                    <button
                      style={s.deleteBtn}
                      onClick={(e) => handleDelete(e, c.id)}
                      title="Delete"
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg2)',
    overflow: 'hidden',
  },
  top: {
    padding: '10px 10px 6px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  newBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  newIcon: {
    fontSize: 18,
    color: 'var(--accent2)',
    lineHeight: 1,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 6px',
  },
  hint: {
    color: 'var(--text3)',
    fontSize: 12,
    padding: '12px 8px',
    lineHeight: 1.6,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    padding: '10px 8px 4px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 8px',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 2,
    transition: 'background 0.1s',
  },
  itemActive: {
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
  },
  itemHover: {
    background: 'var(--bg3)',
  },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 13,
    color: 'var(--text)',
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    fontSize: 11,
    color: 'var(--text3)',
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dot2: { color: 'var(--border2)' },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 4,
    flexShrink: 0,
    opacity: 0.6,
  },
};
