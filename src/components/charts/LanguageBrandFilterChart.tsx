'use client';

import { useMemo, useState } from 'react';
import { StackedBarChart, type StackDef } from '@/components/charts/StackedBarChart';

const BRAND_OPTIONS = [
  { value: 'CAPURI', label: 'CAPURI', color: '#2563eb' },
  { value: 'BerryFeel', label: 'BerryFeel', color: '#ec4899' },
  { value: 'BLsand', label: 'BLsand', color: '#10b981' },
] as const;

const LANGUAGE_STACKS = [
  { dataKey: '日本語', label: '日本語', color: '#2563eb' },
  { dataKey: '英語', label: '英語', color: '#f59e0b' },
  { dataKey: '中国語', label: '中国語', color: '#10b981' },
  { dataKey: '韓国語', label: '韓国語', color: '#ec4899' },
] satisfies StackDef[];
const FORECAST_STACK = { dataKey: 'forecast', label: '着地見込み（予測）', color: '#9ca3af' } satisfies StackDef;

export interface DailyBrandLanguagePoint {
  date: string;
  brand: string;
  日本語: number;
  英語: number;
  中国語: number;
  韓国語: number;
}

interface Props {
  title: string;
  rows: DailyBrandLanguagePoint[];
  forecastByDate?: Record<string, number>;
}

export function LanguageBrandFilterChart({ title, rows, forecastByDate = {} }: Props) {
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());

  const toggleBrand = (brand: string) => {
    setHiddenBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  const chartData = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string;
        日本語: number;
        英語: number;
        中国語: number;
        韓国語: number;
        forecast?: number;
      }
    >();

    for (const row of rows) {
      if (hiddenBrands.has(row.brand)) continue;
      const date = row.date.length === 10 ? row.date.slice(5) : row.date;
      const entry =
        byDate.get(date) ??
        { date, 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
      entry.日本語 += row.日本語;
      entry.英語 += row.英語;
      entry.中国語 += row.中国語;
      entry.韓国語 += row.韓国語;
      byDate.set(date, entry);
    }

    for (const [dateKey, forecast] of Object.entries(forecastByDate)) {
      const date = dateKey.length === 10 ? dateKey.slice(5) : dateKey;
      const entry =
        byDate.get(date) ??
        { date, 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
      entry.forecast = forecast;
      byDate.set(date, entry);
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [forecastByDate, hiddenBrands, rows]);

  const stacks = Object.keys(forecastByDate).length
    ? [...LANGUAGE_STACKS, FORECAST_STACK]
    : LANGUAGE_STACKS;

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      <StackedBarChart
        data={chartData}
        xKey="date"
        stacks={stacks}
        legendBefore={
          <div className="flex flex-wrap justify-center gap-1">
            {BRAND_OPTIONS.map((option) => {
              const isHidden = hiddenBrands.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleBrand(option.value)}
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
                    style={{ backgroundColor: option.color }}
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        }
      />
    </div>
  );
}
