'use client';

import { ReactNode, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatJpyShort } from '@/lib/utils/format';

export interface StackDef {
  dataKey: string;
  label: string;
  color: string;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<Record<string, any>>;
  xKey: string;
  stacks: StackDef[];
  height?: number;
  legendBefore?: ReactNode;
}

/**
 * 汎用積み上げ縦棒（時系列）
 *  - 棒の高さ＝合計、色＝構成要素
 *  - マウスオーバー時のツールチップに内訳＋合計を表示
 *  - Legend クリックで系列の表示/非表示切替、Y軸も自動調整
 */
export function StackedBarChart({ data, xKey, stacks, height = 300, legendBefore }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleStack = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">💡 下の凡例をクリックで表示/非表示を切り替え</p>
      <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatJpyShort(Number(v))} />
        <Tooltip
          content={(props) => {
            const { active, payload, label } = props as unknown as {
              active?: boolean;
              payload?: ReadonlyArray<{ name?: string; value?: number | string; color?: string; dataKey?: string }>;
              label?: string;
            };
            if (!active || !payload || payload.length === 0) return null;
            const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
            return (
              <div className="bg-white border border-gray-200 rounded shadow-lg p-2 text-xs">
                <div className="font-semibold text-gray-800 mb-1">{label}</div>
                {payload.map((p, i) => (
                  <div key={p.dataKey ?? i} className="flex items-center gap-2 text-gray-700">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="flex-1">{p.name}</span>
                    <span className="font-medium">¥{Number(p.value ?? 0).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 mt-1 pt-1 flex items-center gap-2 font-semibold text-gray-800">
                  <span className="inline-block w-2 h-2" />
                  <span className="flex-1">合計</span>
                  <span>¥{total.toLocaleString()}</span>
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, cursor: 'pointer', paddingTop: 8 }}
          content={(props) => {
            const payload =
              (props.payload as Array<{
                dataKey?: string;
                value?: string;
                color?: string;
              }>) ?? [];
            const sortedPayload = payload.slice().sort((a, b) => {
              if (a.dataKey === 'forecast') return 1;
              if (b.dataKey === 'forecast') return -1;
              return 0;
            });
            return (
              <div className="flex flex-col items-center gap-1">
                {legendBefore}
                <div className="flex flex-wrap justify-center gap-1">
                  {sortedPayload.map((entry) => {
                    const key = entry.dataKey;
                    const isHidden = key && hidden.has(key);
                    return (
                      <button
                        key={key ?? entry.value}
                        type="button"
                        onClick={() => key && toggleStack(key)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border transition"
                        style={{
                          borderColor: isHidden ? '#e5e7eb' : '#d1d5db',
                          backgroundColor: isHidden ? '#f9fafb' : '#fff',
                          color: isHidden ? '#9ca3af' : '#374151',
                          textDecoration: isHidden ? 'line-through' : 'none',
                        }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        {entry.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }}
        />
        {stacks.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.label}
            stackId="1"
            fill={s.color}
            hide={hidden.has(s.dataKey)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
