import { redirect } from 'next/navigation';
import { getAvailableMonths, getMonthlyReport } from '@/lib/queries/monthly-report';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';
import { ReportActions } from './ReportActions';
import { MonthSelector } from './MonthSelector';

const PLATFORM_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
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

// searchParams 使用のため dynamic（データは unstable_cache でキャッシュ済み）

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">月次レポート {month}</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            月単位の振り返り・エクスポート用。速報は <a href="/" className="text-blue-600 hover:underline">ダッシュボード</a> で
          </p>
        </div>

        <MonthSelector current={month} months={months} />
      </div>

      {/* 月次サマリカード（現在月なら同日まで比較、過去月なら月合計比較） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <KpiCard label="月次合計" value={fmt(data.summary.totalJpy)} sub={`${data.summary.salesCount.toLocaleString()} 件`} />
        {data.isCurrentMonth ? (
          <>
            <KpiCard
              label="前月同日まで比"
              value={pctLabel(data.summary.monthOverMonthSameDayPct)}
              sub={`前月同日まで ${fmt(data.summary.prevMonthUntilSameDayJpy)}`}
            />
            <KpiCard
              label="前年同月同日まで比"
              value={pctLabel(data.summary.yearOverYearSameDayPct)}
              sub={`前年同月同日まで ${fmt(data.summary.prevYearUntilSameDayJpy)}`}
            />
          </>
        ) : (
          <>
            <KpiCard label="前月比" value={pctLabel(data.summary.monthOverMonthPct)} sub={`前月 ${fmt(data.summary.prevMonthTotalJpy)}`} />
            <KpiCard label="前年同月比" value={pctLabel(data.summary.yearOverYearPct)} sub={`前年 ${fmt(data.summary.prevYearSameMonthJpy)}`} />
          </>
        )}
      </div>

      {/* エクスポートアクション */}
      <ReportActions month={month} />

      {!data.hasDailyData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-xs text-amber-800">
          この月は月次集計のみ取り込まれています（日次内訳なし）。月合計が {month}-01 に集約されて表示されます。
        </div>
      )}

      {/* 日次推移グラフ（プラットフォーム別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次推移（プラットフォーム別）</h2>
        <StackedBarChart
          data={data.dailyTable.map((d) => ({
            date: d.date.slice(5),
            dlsite: d.dlsite,
            fanza: d.fanza,
            youtube: d.youtube,
          }))}
          xKey="date"
          stacks={PLATFORM_STACKS}
        />
      </div>

      {/* 日次推移グラフ（言語別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次推移（言語別）</h2>
        <StackedBarChart
          data={data.dailyLanguage.map((d) => ({
            date: d.date.slice(5),
            日本語: d.日本語,
            英語: d.英語,
            中国語: d.中国語,
            韓国語: d.韓国語,
          }))}
          xKey="date"
          stacks={LANGUAGE_STACKS}
        />
      </div>

      {/* 3カラム（当月の構成比） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">言語別</h2>
          <HorizontalBarChart
            data={(() => {
              const agg: Record<string, number> = { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
              for (const r of data.byLanguage) {
                const label = aggregatedLanguageLabel(r.language);
                if (label in agg) agg[label] += r.revenue;
              }
              return agg;
            })()}
            colors={LANGUAGE_COLORS}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">レーベル別</h2>
          <HorizontalBarChart
            data={Object.fromEntries(data.byBrand.map((r) => [r.brand, r.revenue]))}
            colors={BRAND_COLORS}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">プラットフォーム別</h2>
          <HorizontalBarChart
            data={Object.fromEntries(
              data.byPlatform.map((r) => [
                r.platform === 'dlsite' ? 'DLsite' : r.platform === 'fanza' ? 'Fanza' : r.platform === 'youtube' ? 'YouTube' : r.platform,
                r.revenue,
              ])
            )}
            colors={PLATFORM_COLORS}
          />
        </div>
      </div>

      {/* 日次テーブル（プラットフォーム別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次テーブル（プラットフォーム別）</h2>
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
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
            <tr>
              <td className="p-2">月合計</td>
              <td className="p-2 text-right">{fmt(data.dailyTable.reduce((a, r) => a + r.dlsite, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyTable.reduce((a, r) => a + r.fanza, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyTable.reduce((a, r) => a + r.youtube, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyTable.reduce((a, r) => a + r.total, 0))}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 日次テーブル（レーベル別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次テーブル（レーベル別）</h2>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-2">日付</th>
              <th className="text-right p-2">CAPURI</th>
              <th className="text-right p-2">BerryFeel</th>
              <th className="text-right p-2">BLsand</th>
              <th className="text-right p-2">合計</th>
            </tr>
          </thead>
          <tbody>
            {data.dailyBrand.map((r) => {
              const total = r.CAPURI + r.BerryFeel + r.BLsand;
              return (
                <tr key={r.date} className="border-b border-gray-100">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2 text-right">{fmt(r.CAPURI)}</td>
                  <td className="p-2 text-right">{fmt(r.BerryFeel)}</td>
                  <td className="p-2 text-right">{fmt(r.BLsand)}</td>
                  <td className="p-2 text-right font-semibold">{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
            <tr>
              <td className="p-2">月合計</td>
              <td className="p-2 text-right">{fmt(data.dailyBrand.reduce((a, r) => a + r.CAPURI, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyBrand.reduce((a, r) => a + r.BerryFeel, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyBrand.reduce((a, r) => a + r.BLsand, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyBrand.reduce((a, r) => a + r.CAPURI + r.BerryFeel + r.BLsand, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 日次テーブル（言語別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">日次テーブル（言語別）</h2>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-2">日付</th>
              <th className="text-right p-2">日本語</th>
              <th className="text-right p-2">英語</th>
              <th className="text-right p-2">中国語</th>
              <th className="text-right p-2">韓国語</th>
              <th className="text-right p-2">合計</th>
            </tr>
          </thead>
          <tbody>
            {data.dailyLanguage.map((r) => {
              const total = r.日本語 + r.英語 + r.中国語 + r.韓国語;
              return (
                <tr key={r.date} className="border-b border-gray-100">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2 text-right">{fmt(r.日本語)}</td>
                  <td className="p-2 text-right">{fmt(r.英語)}</td>
                  <td className="p-2 text-right">{fmt(r.中国語)}</td>
                  <td className="p-2 text-right">{fmt(r.韓国語)}</td>
                  <td className="p-2 text-right font-semibold">{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
            <tr>
              <td className="p-2">月合計</td>
              <td className="p-2 text-right">{fmt(data.dailyLanguage.reduce((a, r) => a + r.日本語, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyLanguage.reduce((a, r) => a + r.英語, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyLanguage.reduce((a, r) => a + r.中国語, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyLanguage.reduce((a, r) => a + r.韓国語, 0))}</td>
              <td className="p-2 text-right">{fmt(data.dailyLanguage.reduce((a, r) => a + r.日本語 + r.英語 + r.中国語 + r.韓国語, 0))}</td>
            </tr>
          </tfoot>
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
