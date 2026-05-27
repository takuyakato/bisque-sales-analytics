'use client';

import { useMemo, useState } from 'react';
import { StackedBarChart, type StackDef } from '@/components/charts/StackedBarChart';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<Record<string, any>>;
  xKey: string;
  stacks: StackDef[];
  /** 現在月を示す date 値（series の date と一致する） */
  currentMonthKey: string;
  /** 現在月の着地見込み内訳。stack の dataKey をキーに、その系列のみの予測値 */
  forecastByStack: Record<string, number>;
}

/**
 * 月次の積み上げチャート＋着地見込み（フィルター連動版）
 * - 系列を凡例から隠したら、その系列分だけ forecast バーも縮める
 * - forecast 凡例自体を隠したら予測バー全体が消える
 */
export function MonthlyForecastChart({ data, xKey, stacks, currentMonthKey, forecastByStack }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleStack = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredData = useMemo(() => {
    return data.map((row) => {
      if (row[xKey] !== currentMonthKey) return row;
      if (hidden.has('forecast')) return { ...row, forecast: 0 };
      const sum = stacks
        .filter((s) => s.dataKey !== 'forecast' && !hidden.has(s.dataKey))
        .reduce((a, s) => a + (forecastByStack[s.dataKey] ?? 0), 0);
      return { ...row, forecast: sum };
    });
  }, [data, xKey, currentMonthKey, hidden, stacks, forecastByStack]);

  return (
    <StackedBarChart
      data={filteredData}
      xKey={xKey}
      stacks={stacks}
      hidden={hidden}
      onToggleStack={toggleStack}
    />
  );
}
