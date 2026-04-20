import Link from 'next/link';
import { getDashboardData } from '@/lib/queries/dashboard';
import { DailyTrendChart } from '@/components/charts/DailyTrendChart';
import { LanguagePieChart } from '@/components/charts/LanguagePieChart';
import { BarCompareChart } from '@/components/charts/BarCompareChart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        <h1 className="text-2xl font-bold text-gray-800">ダッシュボード</h1>
        <p className="text-sm text-gray-500">
          直近30日（{data.period.from} 〜 {data.period.to}）の速報
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="今日" value={fmt(data.kpi.todayJpy)} />
        <KpiCard label="直近30日" value={fmt(data.kpi.last30dJpy)} />
        <KpiCard
          label="今月累計"
          value={fmt(data.kpi.thisMonthJpy)}
          sub={`前月: ${fmt(data.kpi.lastMonthJpy)} (${pct(data.kpi.thisMonthJpy, data.kpi.lastMonthJpy)})`}
        />
        <KpiCard
          label="前月同日比"
          value={pct(data.kpi.todayJpy, data.kpi.prevMonthSameDayJpy)}
          sub={`今日 ${fmt(data.kpi.todayJpy)} / 前月同日 ${fmt(data.kpi.prevMonthSameDayJpy)}`}
        />
      </div>

      {/* 日次推移 */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">直近30日の売上推移（プラットフォーム別）</h2>
        <DailyTrendChart data={data.dailySeries} />
      </div>

      {/* 3カラム: 言語別・ブランド別・プラットフォーム別 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">言語別</h2>
          <LanguagePieChart data={data.byLanguage} />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">ブランド別</h2>
          <BarCompareChart
            data={data.byBrand}
            colors={{ CAPURI: '#2563eb', BerryFeel: '#ec4899', BLsand: '#10b981', unknown: '#9ca3af' }}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">プラットフォーム別</h2>
          <BarCompareChart
            data={data.byPlatform}
            colors={{ dlsite: '#2563eb', fanza: '#dc2626', youtube: '#ef4444' }}
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
              <th className="text-left py-2">ブランド</th>
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
