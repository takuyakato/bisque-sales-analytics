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

export async function MonthlyChartSection() {
  let data;
  try {
    data = await getMonthlyChartData();
  } catch (e) {
    console.error('MonthlyChartSection error:', e);
    return <ErrorMessage section="月次推移チャート" message={e instanceof Error ? e.message : undefined} />;
  }
  return (
    <>
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（過去24か月・プラットフォーム別）</h2>
        <StackedBarChart data={data.monthlySeries} xKey="date" stacks={MONTHLY_STACKS} />
      </div>
      <LanguageBrandFilterChart
        title="月次推移（過去24か月・言語別）"
        rows={data.monthlyBrandLanguageSeries}
        forecastByDate={data.monthlyForecastByDate}
      />
    </>
  );
}
