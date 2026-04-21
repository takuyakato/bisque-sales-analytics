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
  LabelList,
} from 'recharts';
import { formatJpyShort } from '@/lib/utils/format';

const DEFAULT_COLORS = ['#2563eb', '#dc2626', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

interface Props {
  data: Record<string, number>;
  colors?: Record<string, string>;
  height?: number;
}

/**
 * 汎用横棒グラフ（構成比 / 比較スナップショット向け）
 *  - 縦軸＝カテゴリ
 *  - 横軸＝値（¥）
 *  - ラベルが常に水平で読みやすい
 */
export function HorizontalBarChart({ data, colors, height = 220 }: Props) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">データなし</p>;
  }

  // 高さは項目数に応じて（最低20px/項目）
  const computedHeight = Math.max(height, entries.length * 30 + 40);

  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      <BarChart data={entries} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatJpyShort(Number(v))} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={80} />
        <Tooltip
          formatter={(v) => `¥${Number(v).toLocaleString()}`}
          contentStyle={{ fontSize: 12 }}
          cursor={{ fill: '#f5f5f5' }}
        />
        <Bar dataKey="value">
          {entries.map((e, i) => (
            <Cell key={e.label} fill={colors?.[e.label] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => formatJpyShort(Number(v))}
            style={{ fontSize: 11, fill: '#374151' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
