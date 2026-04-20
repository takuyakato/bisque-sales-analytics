'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
  ja: '#2563eb',
  en: '#f59e0b',
  'zh-Hant': '#10b981',
  'zh-Hans': '#8b5cf6',
  ko: '#ec4899',
  unknown: '#9ca3af',
};

export function LanguagePieChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">データなし</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={entries}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(e) => e.name}
          labelLine={{ stroke: '#999' }}
        >
          {entries.map((e) => (
            <Cell key={e.name} fill={COLORS[e.name] ?? '#888'} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
