import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

// Detect if results are chartable:
// Chartable = exactly 2 columns, one string + one number
function detectChart(columns, rows) {
  if (!columns || columns.length !== 2 || !rows || rows.length < 2) return null;

  const [colA, colB] = columns;
  const sample = rows[0];

  const aIsString = typeof sample[colA] === 'string';
  const bIsNumber = typeof sample[colB] === 'number' || !isNaN(Number(sample[colB]));

  if (!aIsString || !bIsNumber) return null;

  // Use pie if <= 6 items, bar otherwise
  const type = rows.length <= 6 ? 'pie' : 'bar';
  return { type, labelKey: colA, valueKey: colB };
}

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#a78bfa','#34d399','#fb923c'];

export default function ResultChart({ columns, rows }) {
  const chart = detectChart(columns, rows);
  if (!chart) return null;

  const data = rows.map(row => ({
    name: String(row[chart.labelKey]),
    value: Number(row[chart.valueKey]),
  }));

  if (chart.type === 'pie') {
    return (
      <div style={s.wrap}>
        <div style={s.chartTitle}>{chart.valueKey} by {chart.labelKey}</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#0f1525', border: '1px solid #1e2d45', borderRadius: 6 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.chartTitle}>{chart.valueKey} by {chart.labelKey}</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0f1525', border: '1px solid #1e2d45', borderRadius: 6 }}
            labelStyle={{ color: '#e2e8f0' }}
            cursor={{ fill: '#1e2d45' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const s = {
  wrap: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 12,
    color: 'var(--text3)',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
};
