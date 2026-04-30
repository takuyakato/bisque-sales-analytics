import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { aggregateByLanguage } from '@/lib/utils/language-label';
import { getDailyChartData } from '@/lib/queries/dashboard';
import { ErrorMessage } from './Skeletons';

const BRAND_COLORS = { CAPURI: '#2563eb', BerryFeel: '#ec4899', BLsand: '#10b981' };
const PLATFORM_COLORS = { DLsite: '#2563eb', Fanza: '#dc2626', YouTube: '#ef4444' };
const LANGUAGE_COLORS = { 日本語: '#2563eb', 英語: '#f59e0b', 中国語: '#10b981', 韓国語: '#ec4899' };

export async function BreakdownSection() {
  let data;
  try {
    data = await getDailyChartData();
  } catch (e) {
    console.error('BreakdownSection error:', e);
    return <ErrorMessage section="言語/レーベル/プラットフォーム別" message={e instanceof Error ? e.message : undefined} />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">言語別（直近30日）</h2>
        <HorizontalBarChart data={aggregateByLanguage(data.byLanguage)} colors={LANGUAGE_COLORS} />
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">レーベル別（直近30日）</h2>
        <HorizontalBarChart data={data.byBrand} colors={BRAND_COLORS} />
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">プラットフォーム別（直近30日）</h2>
        <HorizontalBarChart
          data={{
            DLsite: data.byPlatform.dlsite ?? 0,
            Fanza: data.byPlatform.fanza ?? 0,
            YouTube: data.byPlatform.youtube ?? 0,
          }}
          colors={PLATFORM_COLORS}
        />
      </div>
    </div>
  );
}
