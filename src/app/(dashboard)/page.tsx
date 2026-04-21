import Link from 'next/link';
import { getDashboardData } from '@/lib/queries/dashboard';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { aggregateByLanguage } from '@/lib/utils/language-label';

const PLATFORM_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
];
const MONTHLY_STACKS = [
  ...PLATFORM_STACKS,
  { dataKey: 'forecast', label: '着地見込み（予測）', color: '#9ca3af' },
];
const LANGUAGE_STACKS = [
  { dataKey: '日本語', label: '日本語', color: '#2563eb' },
  { dataKey: '英語', label: '英語', color: '#f59e0b' },
  { dataKey: '中国語', label: '中国語', color: '#10b981' },
  { dataKey: '韓国語', label: '韓国語', color: '#ec4899' },
];
const BRAND_COLORS = { CAPURI: '#2563eb', BerryFeel: '#ec4899', BLsand: '#10b981' };
const PLATFORM_COLORS = { DLsite: '#2563eb', Fanza: '#dc2626', YouTube: '#ef4444' };
const LANGUAGE_COLORS = { 日本語: '#2563eb', 英語: '#f59e0b', 中国語: '#10b981', 韓国語: '#ec4899' };

// データは unstable_cache でキャッシュ（10分）＋取込完了時にタグ破棄
// 静的ビルド時のDB全件取得で失敗するため、ページ自体は動的レンダリングに戻す
export const dynamic = 'force-dynamic';

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function pct(curr: number, base: number): string {
  if (!base) return '—';
  const diff = ((curr - base) / base) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

export default async function Dashboard() {
  const data = await getDashboardData();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">ダッシュボード</h1>
        <p className="text-xs md:text-sm text-gray-500">
          直近30日（{data.period.from} 〜 {data.period.to}）の速報
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KpiCard label="直近30日" value={fmt(data.kpi.last30dJpy)} />
        <KpiCard
          label="今月累計"
          value={fmt(data.kpi.thisMonthJpy)}
          sub={`前月同日まで: ${fmt(data.kpi.prevMonthUntilSameDayJpy)} (${pct(data.kpi.thisMonthJpy, data.kpi.prevMonthUntilSameDayJpy)})`}
        />
        <KpiCard
          label="前月同日まで比"
          value={pct(data.kpi.thisMonthJpy, data.kpi.prevMonthUntilSameDayJpy)}
          sub={`今月累計 ${fmt(data.kpi.thisMonthJpy)} / 前月同日まで ${fmt(data.kpi.prevMonthUntilSameDayJpy)}`}
        />
        <KpiCard
          label="今月着地見込み"
          value={fmt(data.kpi.expectedMonthEndJpy)}
          sub={`前月: ${fmt(data.kpi.lastMonthJpy)} (${pct(data.kpi.expectedMonthEndJpy, data.kpi.lastMonthJpy)})`}
        />
      </div>

      {/* 日次推移 */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（プラットフォーム別）</h2>
<StackedBarChart data={data.dailySeries} xKey="date" stacks={PLATFORM_STACKS} />
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（言語別）</h2>
<StackedBarChart data={data.dailyLanguageSeries} xKey="date" stacks={LANGUAGE_STACKS} />
      </div>

      {/* 月次推移（過去24か月・プラットフォーム積み上げ＋最新月は着地見込みを予測色で追加） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（過去24か月・プラットフォーム別）</h2>
        <StackedBarChart data={data.monthlySeries} xKey="date" stacks={MONTHLY_STACKS} />
      </div>

      {/* 3カラム: 言語別・レーベル別・プラットフォーム別（直近30日の構成） */}
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

      {/* トップ10作品 */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">トップ10作品（直近30日）</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">作品</th>
              <th className="text-left py-2">レーベル</th>
              <th className="text-right py-2">販売数</th>
              <th className="text-right py-2">売上</th>
            </tr>
          </thead>
          <tbody>
            {data.topWorks.map((w, i) => (
              <tr key={w.work_id} className="border-b border-gray-100">
                <td className="py-2 text-gray-500">{i + 1}</td>
                <td className="py-2">
                  <Link href={`/works/${w.work_id}`} className="text-blue-600 hover:underline">
                    {w.slug ?? w.title}
                  </Link>
                </td>
                <td className="py-2 text-gray-600">{w.brand}</td>
                <td className="py-2 text-right">{w.sales_count.toLocaleString()}</td>
                <td className="py-2 text-right font-semibold">{fmt(w.revenue_jpy)}</td>
              </tr>
            ))}
            {data.topWorks.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  データなし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
