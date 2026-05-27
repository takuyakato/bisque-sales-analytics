import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { LanguageBrandFilterChart } from '@/components/charts/LanguageBrandFilterChart';
import { getMonthlyChartData } from '@/lib/queries/dashboard';
import { ErrorMessage } from './Skeletons';

const MONTHLY_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
  { dataKey: 'forecast', label: '着地見込み（予測）', color: '#9ca3af' },
];

const MONTHLY_BRAND_STACKS = [
  { dataKey: 'CAPURI', label: 'CAPURI', color: '#2563eb' },
  { dataKey: 'BerryFeel', label: 'BerryFeel', color: '#ec4899' },
  { dataKey: 'BLsand', label: 'BLsand', color: '#10b981' },
  { dataKey: 'forecast', label: '着地見込み（予測）', color: '#9ca3af' },
];

export async function MonthlyChartSection() {
  let data;
  try {
    data = await getMonthlyChartData();
  } catch (e) {
    console.error('MonthlyChartSection error:', e);
    return <ErrorMessage section="月次推移チャート" message={e instanceof Error ? e.message : undefined} />;
  }

  const brandByMonth = new Map<string, { date: string; CAPURI: number; BerryFeel: number; BLsand: number; forecast: number }>();
  for (const r of data.monthlyBrandLanguageSeries) {
    const entry = brandByMonth.get(r.date) ?? { date: r.date, CAPURI: 0, BerryFeel: 0, BLsand: 0, forecast: 0 };
    const total = r.日本語 + r.英語 + r.中国語 + r.韓国語;
    if (r.brand === 'CAPURI' || r.brand === 'BerryFeel' || r.brand === 'BLsand') {
      entry[r.brand] += total;
    }
    brandByMonth.set(r.date, entry);
  }
  for (const [date, forecast] of Object.entries(data.monthlyForecastByDate)) {
    const entry = brandByMonth.get(date) ?? { date, CAPURI: 0, BerryFeel: 0, BLsand: 0, forecast: 0 };
    entry.forecast = forecast;
    brandByMonth.set(date, entry);
  }
  const monthlyBrandSeries = Array.from(brandByMonth.values()).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（過去24か月・プラットフォーム別）</h2>
        <StackedBarChart data={data.monthlySeries} xKey="date" stacks={MONTHLY_STACKS} />
      </div>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（過去24か月・レーベル別）</h2>
        <StackedBarChart data={monthlyBrandSeries} xKey="date" stacks={MONTHLY_BRAND_STACKS} />
      </div>
      <LanguageBrandFilterChart
        title="月次推移（過去24か月・言語別）"
        rows={data.monthlyBrandLanguageSeries}
        forecastByDate={data.monthlyForecastByDate}
      />
    </>
  );
}
