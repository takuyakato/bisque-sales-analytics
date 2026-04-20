'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { DailyPoint } from '@/lib/queries/dashboard';

export function DailyTrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v) => `¥${Number(v).toLocaleString()}`}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="dlsite" stroke="#2563eb" name="DLsite" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="fanza" stroke="#dc2626" name="Fanza" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="youtube" stroke="#ef4444" name="YouTube" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
