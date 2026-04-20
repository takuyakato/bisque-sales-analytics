import { redirect } from 'next/navigation';
import { getAvailableMonths, getMonthlyReport } from '@/lib/queries/monthly-report';
import { DailyTrendChart } from '@/components/charts/DailyTrendChart';
import { LanguagePieChart } from '@/components/charts/LanguagePieChart';
import { BarCompareChart } from '@/components/charts/BarCompareChart';
import { ReportActions } from './ReportActions';
import { MonthSelector } from './MonthSelector';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<{ month?: string }>;

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function pctLabel(p: number | null): string {
  if (p === null) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const { month: monthParam } = await searchParams;
  const months = await getAvailableMonths();

  if (months.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold">月次レポート</h1>
        <p className="text-gray-500 mt-4">データがありません。先にCSV取込またはスクレイピングを実行してください。</p>
      </div>
    );
  }

  const month = monthParam && months.includes(monthParam) ? monthParam : months[0];
  if (!monthParam) redirect(`/reports?month=${month}`);

  const data = await getMonthlyReport(month);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">月次レポート {month}</h1>
          <p className="text-sm text-gray-500 mt-1">
            月単位の振り返り・エクスポート用。速報は <a href="/" className="text-blue-600 hover:underline">ダッシュボード</a> で
          </p>
        </div>

        <MonthSelector current={month} months={months} />
      </div>

      {/* 月次サマリカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="月次合計" value={fmt(data.summary.totalJpy)} sub={`${data.summary.salesCount.toLocaleString()} 件`} />
        <KpiCard label="前月比" value={pctLabel(data.summary.monthOverMonthPct)} sub={`前月 ${fmt(data.summary.prevMonthTotalJpy)}`} />
        <KpiCard label="前年同月比" value={pctLabel(data.summary.yearOverYearPct)} sub={`前年 ${fmt(data.summary.prevYearSameMonthJpy)}`} />
        <KpiCard label="プラットフォーム数" value={`${data.byPlatform.length}`} />
      </div>

      {/* エクスポートアクション */}
      <ReportActions month={month} />

      {/* 日次推移グラフ */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次推移</h2>
        <DailyTrendChart data={data.dailyTable.map((d) => ({
          date: d.date,
          dlsite: d.dlsite,
          fanza: d.fanza,
          youtube: d.youtube,
        }))} />
      </div>

      {/* 3カラム */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">言語別</h2>
          <LanguagePieChart data={Object.fromEntries(data.byLanguage.map((r) => [r.language, r.revenue]))} />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">ブランド別</h2>
          <BarCompareChart
            data={Object.fromEntries(data.byBrand.map((r) => [r.brand, r.revenue]))}
            colors={{ CAPURI: '#2563eb', BerryFeel: '#ec4899', BLsand: '#10b981', unknown: '#9ca3af' }}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">プラットフォーム別</h2>
          <BarCompareChart
            data={Object.fromEntries(data.byPlatform.map((r) => [r.platform, r.revenue]))}
            colors={{ dlsite: '#2563eb', fanza: '#dc2626', youtube: '#ef4444' }}
          />
        </div>
      </div>

      {/* 日次テーブル */}
      <div className="bg-white rounded-lg shadow p-5 mb-6 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次テーブル</h2>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-2">日付</th>
              <th className="text-right p-2">DLsite</th>
              <th className="text-right p-2">Fanza</th>
              <th className="text-right p-2">YouTube</th>
              <th className="text-right p-2">合計</th>
              <th className="text-right p-2">前日比</th>
            </tr>
          </thead>
          <tbody>
            {data.dailyTable.map((r) => (
              <tr key={r.date} className="border-b border-gray-100">
                <td className="p-2">{r.date}</td>
                <td className="p-2 text-right">{fmt(r.dlsite)}</td>
                <td className="p-2 text-right">{fmt(r.fanza)}</td>
                <td className="p-2 text-right">{fmt(r.youtube)}</td>
                <td className="p-2 text-right font-semibold">{fmt(r.total)}</td>
                <td className={`p-2 text-right ${r.prevDayPct && r.prevDayPct < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {pctLabel(r.prevDayPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* トップ10作品 */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">トップ10作品</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200">
            <tr className="text-xs text-gray-500">
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
                  <a href={`/works/${w.work_id}`} className="text-blue-600 hover:underline">
                    {w.slug ?? w.title}
                  </a>
                </td>
                <td className="py-2 text-gray-600">{w.brand}</td>
                <td className="py-2 text-right">{w.salesCount.toLocaleString()}</td>
                <td className="py-2 text-right font-semibold">{fmt(w.revenue)}</td>
              </tr>
            ))}
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
