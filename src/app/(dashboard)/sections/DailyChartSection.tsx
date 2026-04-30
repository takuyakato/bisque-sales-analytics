import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { LanguageBrandFilterChart } from '@/components/charts/LanguageBrandFilterChart';
import { getDailyChartData } from '@/lib/queries/dashboard';
import { ErrorMessage } from './Skeletons';

const PLATFORM_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
];

export async function DailyChartSection() {
  let data;
  try {
    data = await getDailyChartData();
  } catch (e) {
    console.error('DailyChartSection error:', e);
    return <ErrorMessage section="直近30日チャート" message={e instanceof Error ? e.message : undefined} />;
  }
  return (
    <>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（プラットフォーム別）</h2>
        <StackedBarChart data={data.dailySeries} xKey="date" stacks={PLATFORM_STACKS} />
      </div>
      <LanguageBrandFilterChart
        title="直近30日の売上推移（言語別）"
        rows={data.dailyBrandLanguageSeries}
      />
    </>
  );
}
