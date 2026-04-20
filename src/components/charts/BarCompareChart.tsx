'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

interface Props {
  data: Record<string, number>;
  colors?: Record<string, string>;
  height?: number;
}

const DEFAULT_COLORS = ['#2563eb', '#dc2626', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export function BarCompareChart({ data, colors, height = 220 }: Props) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">データなし</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={entries}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
        <Bar dataKey="value">
          {entries.map((e, i) => (
            <Cell key={e.name} fill={colors?.[e.name] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
