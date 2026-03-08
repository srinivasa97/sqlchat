// Dashboard.jsx - Summary dashboard with pre-built charts
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS_GENDER = { Male: '#6366f1', Female: '#f472b6', Other: '#34d399' };
const COLORS_PIE = ['#6366f1', '#f472b6', '#34d399', '#fb923c', '#38bdf8', '#a78bfa', '#facc15'];

const CARD = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 24px',
};

const SECTION_TITLE = {
  fontSize: 13, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border2)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      {label && <div style={{ color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '3px solid ' + (color || 'var(--accent)') }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
        {value ?? <span style={{ fontSize: 18, color: 'var(--text3)' }}>—</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}

function pivot(rows, groupKey, subKey, countKey) {
  const map = {};
  for (const row of rows) {
    const group = row[groupKey] || 'Unknown';
    const sub = row[subKey] || 'Unknown';
    const count = Number(row[countKey]);
    if (!map[group]) map[group] = { name: group };
    map[group][sub] = count;
  }
  return Object.values(map);
}

function getKeys(data) {
  if (!data?.length) return [];
  const keys = new Set();
  data.forEach(row => Object.keys(row).forEach(k => { if (k !== 'name') keys.add(k); }));
  return Array.from(keys);
}

export default function Dashboard({ selectedDb, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedDb && token) load();
  }, [selectedDb, token]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/dashboard', {
        params: { dbId: selectedDb.id },
        headers: { Authorization: 'Bearer ' + token },
      });
      const d = res.data;
      setData({
        total: d.total,
        gender: d.gender.map(r => ({ name: r.gender, value: Number(r.count) })),
        profile: d.profile.map(r => ({ name: r.profile, value: Number(r.count) })),
        profileGender: pivot(d.profileGender, 'profile', 'gender', 'count'),
        instituteType: d.instituteType.map(r => ({ name: r.institute_type, value: Number(r.count) })),
        instituteTypeGender: pivot(d.instituteTypeGender, 'institute_type', 'gender', 'count'),
        suitable: d.suitable.map(r => ({ name: r.candidate_suitable, value: Number(r.count) })),
        suitableGender: pivot(d.suitableGender, 'candidate_suitable', 'gender', 'count'),
        allocation: d.allocation.map(r => ({ name: r.status, value: Number(r.count) })),
      });
    } catch (e) {
      console.error('[dashboard]', e.message);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedDb) return (
    <div style={s.empty}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No database selected</div>
      <div style={{ fontSize: 13, color: 'var(--text3)' }}>Select a database from the header to view the dashboard.</div>
    </div>
  );

  if (loading) return (
    <div style={s.empty}>
      <div style={s.spinner} />
      <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 16 }}>Loading dashboard...</div>
    </div>
  );

  if (error) return (
    <div style={s.empty}>
      <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 12 }}>Error: {error}</div>
      <button onClick={load} style={s.retryBtn}>↻ Retry</button>
    </div>
  );

  const allocated = data.allocation.find(r => r.name === 'Allocated')?.value || 0;
  const unallocated = data.allocation.find(r => r.name === 'Unallocated')?.value || 0;
  const allocPct = data.total > 0 ? Math.round((allocated / data.total) * 100) : 0;

  return (
    <div style={s.dashboard}>
      <div style={s.dashHeader}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{selectedDb.label}</div>
        </div>
        <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
      </div>

      <div style={s.statsRow}>
        <StatCard label="Total Candidates" value={data.total} color="#6366f1" />
        <StatCard label="Allocated" value={allocated} sub={allocPct + '% of total'} color="#34d399" />
        <StatCard label="Unallocated" value={unallocated} sub={(100 - allocPct) + '% of total'} color="#f87171" />
        {data.profile.map((p, i) => (
          <StatCard key={p.name} label={p.name} value={p.value} sub="candidates" color={COLORS_PIE[i % COLORS_PIE.length]} />
        ))}
      </div>

      <div style={s.row3}>
        <div style={{ ...CARD, flex: 1 }}>
          <div style={SECTION_TITLE}>Gender Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.gender} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}>
                {data.gender.map((e, i) => <Cell key={i} fill={COLORS_GENDER[e.name] || COLORS_PIE[i]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...CARD, flex: 1 }}>
          <div style={SECTION_TITLE}>Allocation Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: 'Allocated', value: allocated }, { name: 'Unallocated', value: unallocated }]}
                dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}>
                <Cell fill="#34d399" /><Cell fill="#f87171" />
              </Pie>
              <Tooltip content={<CustomTooltip />} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...CARD, flex: 1 }}>
          <div style={SECTION_TITLE}>Profile Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.profile} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}>
                {data.profile.map((e, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={CARD}>
        <div style={SECTION_TITLE}>Institute Type by Gender</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.instituteTypeGender} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <Tooltip content={<CustomTooltip />} /><Legend />
            {getKeys(data.instituteTypeGender).map((g, i) => (
              <Bar key={g} dataKey={g} fill={COLORS_GENDER[g] || COLORS_PIE[i]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={CARD}>
        <div style={SECTION_TITLE}>Profile by Gender</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.profileGender} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
            <Tooltip content={<CustomTooltip />} /><Legend />
            {getKeys(data.profileGender).map((g, i) => (
              <Bar key={g} dataKey={g} fill={COLORS_GENDER[g] || COLORS_PIE[i]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.suitable.length > 0 && (
        <div style={CARD}>
          <div style={SECTION_TITLE}>Candidate Suitability by Gender</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.suitableGender} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text3)' }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
              <Tooltip content={<CustomTooltip />} /><Legend />
              {getKeys(data.suitableGender).map((g, i) => (
                <Bar key={g} dataKey={g} fill={COLORS_GENDER[g] || COLORS_PIE[i]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const s = {
  dashboard: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  dashHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 },
  spinner: { width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' },
  refreshBtn: { background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontWeight: 500 },
  retryBtn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
};
