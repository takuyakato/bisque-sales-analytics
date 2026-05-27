import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { LanguageBrandFilterChart } from '@/components/charts/LanguageBrandFilterChart';
import { getDailyChartData } from '@/lib/queries/dashboard';
import { ErrorMessage } from './Skeletons';

const PLATFORM_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
];

const BRAND_STACKS = [
  { dataKey: 'CAPURI', label: 'CAPURI', color: '#2563eb' },
  { dataKey: 'BerryFeel', label: 'BerryFeel', color: '#ec4899' },
  { dataKey: 'BLsand', label: 'BLsand', color: '#10b981' },
];

export async function DailyChartSection() {
  let data;
  try {
    data = await getDailyChartData();
  } catch (e) {
    console.error('DailyChartSection error:', e);
    return <ErrorMessage section="直近30日チャート" message={e instanceof Error ? e.message : undefined} />;
  }

  const brandByDate = new Map<string, { date: string; CAPURI: number; BerryFeel: number; BLsand: number }>();
  for (const r of data.dailyBrandLanguageSeries) {
    const entry = brandByDate.get(r.date) ?? { date: r.date, CAPURI: 0, BerryFeel: 0, BLsand: 0 };
    const total = r.日本語 + r.英語 + r.中国語 + r.韓国語;
    if (r.brand === 'CAPURI' || r.brand === 'BerryFeel' || r.brand === 'BLsand') {
      entry[r.brand] += total;
    }
    brandByDate.set(r.date, entry);
  }
  const dailyBrandSeries = Array.from(brandByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（プラットフォーム別）</h2>
        <StackedBarChart data={data.dailySeries} xKey="date" stacks={PLATFORM_STACKS} />
      </div>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（レーベル別）</h2>
        <StackedBarChart data={dailyBrandSeries} xKey="date" stacks={BRAND_STACKS} />
      </div>
      <LanguageBrandFilterChart
        title="直近30日の売上推移（言語別）"
        rows={data.dailyBrandLanguageSeries}
      />
    </>
  );
}
