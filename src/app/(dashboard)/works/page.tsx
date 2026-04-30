import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllPages } from '@/lib/queries/paginate';
import { getWorksRanking, applyRankingFilter, type Period, type PlatformFilter } from '@/lib/queries/works-ranking';
import { getCumulativeTotals, getMonthlySeriesAll } from '@/lib/queries/cumulative';
import { getDuplicateWorkGroups } from '@/lib/queries/duplicates';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { DuplicateCandidates } from './DuplicateCandidates';

const PLATFORM_STACKS = [
  { dataKey: 'dlsite', label: 'DLsite', color: '#2563eb' },
  { dataKey: 'fanza', label: 'Fanza', color: '#dc2626' },
  { dataKey: 'youtube', label: 'YouTube', color: '#ef4444' },
];

type SearchParams = Promise<{
  view?: string;
  platform?: string;
  period?: string;
  brand?: string;
  auto?: string;
  q?: string;
  page?: string;
}>;

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

const PAGE_SIZE = 50;

export default async function WorksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === 'manage' ? 'manage' : 'ranking';
  if (view === 'manage') return <ManageView params={params} />;
  return <RankingView params={params} />;
}

// ========== ランキング表示 ==========
async function RankingView({ params }: { params: Awaited<SearchParams> }) {
  const platform = (params.platform as PlatformFilter) ?? 'all';
  const period = (params.period as Period) ?? 'all';
  const brand = params.brand ?? 'all';
  const q = params.q ?? '';
  const page = Math.max(1, Number(params.page ?? '1'));

  const [rows, cumulative, monthlySeries] = await Promise.all([
    getWorksRanking(),
    getCumulativeTotals(),
    getMonthlySeriesAll(),
  ]);
  const filtered = applyRankingFilter(rows, { platform, period, brand, q });
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const periodLabel = period === 'd30' ? '直近30日' : period === 'y1' ? '直近1年' : '全期間';
  const platformLabel =
    platform === 'dlsite' ? 'DLsite'
      : platform === 'fanza' ? 'Fanza'
        : platform === 'youtube' ? 'YouTube'
          : 'すべて';

  const sumRevenue = filtered.reduce((a, r) => a + revenueFor(r, period, platform), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">作品売上ランキング</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            {platformLabel} / {periodLabel}：{total.toLocaleString()}件・合計 {fmt(sumRevenue)}
          </p>
        </div>
        <Link
          href="/works?view=manage"
          className="self-start md:self-auto text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
        >
          → 手動管理（DLsite / Fanza）
        </Link>
      </div>

      {/* 累計サマリ（全期間） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">累計（全期間）</h2>
        <div className="text-3xl font-bold text-gray-800 mb-4">{fmt(cumulative.total)}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SumBlock
            title="プラットフォーム別"
            items={[
              { label: 'DLsite', value: cumulative.byPlatform.dlsite, color: '#2563eb' },
              { label: 'Fanza', value: cumulative.byPlatform.fanza, color: '#dc2626' },
              { label: 'YouTube', value: cumulative.byPlatform.youtube, color: '#ef4444' },
            ]}
          />
          <SumBlock
            title="レーベル別"
            items={[
              { label: 'CAPURI', value: cumulative.byBrand.CAPURI, color: '#2563eb' },
              { label: 'BerryFeel', value: cumulative.byBrand.BerryFeel, color: '#ec4899' },
              { label: 'BLsand', value: cumulative.byBrand.BLsand, color: '#10b981' },
            ]}
          />
          <SumBlock
            title="言語別"
            items={[
              { label: '日本語', value: cumulative.byLanguage.日本語, color: '#2563eb' },
              { label: '英語', value: cumulative.byLanguage.英語, color: '#f59e0b' },
              { label: '中国語', value: cumulative.byLanguage.中国語, color: '#10b981' },
              { label: '韓国語', value: cumulative.byLanguage.韓国語, color: '#ec4899' },
            ]}
          />
        </div>
      </div>

      {/* 月次推移（全期間・プラットフォーム別） */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">月次推移（全期間・プラットフォーム別）</h2>
        <StackedBarChart data={monthlySeries} xKey="date" stacks={PLATFORM_STACKS} />
      </div>

      {/* フィルタ */}
      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end text-sm">
        <input type="hidden" name="view" value="ranking" />
        <div>
          <label className="block text-xs text-gray-500 mb-1">期間</label>
          <select name="period" defaultValue={period} className="px-3 py-1.5 border border-gray-300 rounded-md">
            <option value="all">全期間</option>
            <option value="y1">直近1年</option>
            <option value="d30">直近30日</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">プラットフォーム</label>
          <select name="platform" defaultValue={platform} className="px-3 py-1.5 border border-gray-300 rounded-md">
            <option value="all">すべて</option>
            <option value="dlsite">DLsite</option>
            <option value="fanza">Fanza</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">レーベル</label>
          <select name="brand" defaultValue={brand} className="px-3 py-1.5 border border-gray-300 rounded-md">
            <option value="all">すべて</option>
            <option value="CAPURI">CAPURI</option>
            <option value="BerryFeel">BerryFeel</option>
            <option value="BLsand">BLsand</option>
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-gray-500 mb-1">タイトル検索</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md"
          />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          絞り込み
        </button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600">
              <th className="text-right px-3 py-2">#</th>
              <th className="text-left px-3 py-2">タイトル</th>
              <th className="text-left px-3 py-2">レーベル</th>
              <th className="text-left px-3 py-2">プラットフォーム</th>
              <th className="text-right px-3 py-2">SKU</th>
              <th className="text-right px-3 py-2">販売数</th>
              <th className="text-right px-3 py-2">売上（{periodLabel}）</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.work_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-right text-gray-500">{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                <td className="px-3 py-2 max-w-xs">
                  <Link href={`/works/${r.work_id}`} className="text-blue-600 hover:underline line-clamp-2" title={r.title}>
                    {r.slug ?? r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.brand}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.platforms.join(', ')}</td>
                <td className="px-3 py-2 text-right">{r.skuCount}</td>
                <td className="px-3 py-2 text-right">{r.salesAll.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {fmt(revenueFor(r, period, platform))}
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">
                  該当作品がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          params={params}
        />
      )}
    </div>
  );
}

function revenueFor(r: { byPlat: Record<string, number>; totalAll: number; totalY1: number; totalD30: number }, period: Period, platform: PlatformFilter): number {
  if (platform && platform !== 'all') return r.byPlat[platform] ?? 0;
  return period === 'all' ? r.totalAll : period === 'y1' ? r.totalY1 : r.totalD30;
}

function SumBlock({ title, items }: { title: string; items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, it) => a + it.value, 0);
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const p = total ? ((it.value / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={it.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: it.color }} />
                <span className="text-gray-700">{it.label}</span>
              </span>
              <span>
                <span className="font-semibold text-gray-800">¥{it.value.toLocaleString()}</span>
                <span className="text-xs text-gray-400 ml-1">{p}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pagination({ page, pageCount, params }: { page: number; pageCount: number; params: Awaited<SearchParams> }) {
  const { page: _, ...rest } = params;
  void _;
  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(rest)) if (v) sp.set(k, String(v));
    sp.set('page', String(p));
    return `/works?${sp.toString()}`;
  };
  const prev = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <Link
        href={buildHref(prev)}
        aria-disabled={page === 1}
        className={`px-3 py-1.5 rounded-md ${page === 1 ? 'text-gray-300 pointer-events-none' : 'text-blue-600 hover:bg-blue-50'}`}
      >
        ← 前
      </Link>
      <span className="text-gray-600">
        {page} / {pageCount} ページ
      </span>
      <Link
        href={buildHref(next)}
        aria-disabled={page === pageCount}
        className={`px-3 py-1.5 rounded-md ${page === pageCount ? 'text-gray-300 pointer-events-none' : 'text-blue-600 hover:bg-blue-50'}`}
      >
        次 →
      </Link>
    </div>
  );
}

// ========== 手動管理画面 ==========
async function ManageView({ params }: { params: Awaited<SearchParams> }) {
  const supabase = createServiceClient();
  const duplicateGroups = await getDuplicateWorkGroups();

  let query = supabase
    .from('works')
    .select('id, slug, title, brand, genre, release_date, auto_created')
    .in('brand', ['CAPURI', 'BerryFeel'])
    .order('created_at', { ascending: false });

  if (params.brand && params.brand !== 'all') query = query.eq('brand', params.brand);
  if (params.auto === 'true') query = query.eq('auto_created', true);
  if (params.auto === 'false') query = query.eq('auto_created', false);
  if (params.q) query = query.ilike('title', `%${params.q}%`);

  const { data: works, error } = await query.limit(500);

  const workIds = (works ?? []).map((w) => w.id);
  const variantCountMap: Record<string, number> = {};
  const revenueMap: Record<string, number> = {};

  if (workIds.length) {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('work_id')
      .in('work_id', workIds);
    for (const v of variants ?? []) {
      if (v.work_id) variantCountMap[v.work_id] = (variantCountMap[v.work_id] ?? 0) + 1;
    }

    const sales = await fetchAllPages<{ work_id: string | null; net_revenue_jpy: number | null }>(
      supabase,
      'sales_daily',
      (q) => q.select('work_id, net_revenue_jpy').in('work_id', workIds)
    );
    for (const s of sales) {
      if (s.work_id) revenueMap[s.work_id] = (revenueMap[s.work_id] ?? 0) + (s.net_revenue_jpy ?? 0);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">作品マスタ管理（DLsite / Fanza）</h1>
          <p className="text-xs md:text-sm text-gray-500">{works?.length ?? 0}件表示</p>
        </div>
        <Link
          href="/works"
          className="self-start md:self-auto text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
        >
          ← 売上ランキングへ
        </Link>
      </div>

      <DuplicateCandidates groups={duplicateGroups} />

      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <input type="hidden" name="view" value="manage" />
        <div>
          <label className="block text-xs text-gray-500 mb-1">レーベル</label>
          <select name="brand" defaultValue={params.brand ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="CAPURI">CAPURI</option>
            <option value="BerryFeel">BerryFeel</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">auto_created</label>
          <select name="auto" defaultValue={params.auto ?? ''} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="">すべて</option>
            <option value="true">自動生成のみ</option>
            <option value="false">確認済みのみ</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">タイトル検索</label>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ''}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          絞り込み
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error.message}</p>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600">
              <th className="text-left px-3 py-2">ID / slug</th>
              <th className="text-left px-3 py-2">タイトル</th>
              <th className="text-left px-3 py-2">レーベル</th>
              <th className="text-left px-3 py-2">ジャンル</th>
              <th className="text-right px-3 py-2">SKU数</th>
              <th className="text-right px-3 py-2">累計売上</th>
              <th className="text-center px-3 py-2">状態</th>
            </tr>
          </thead>
          <tbody>
            {(works ?? []).map((w) => (
              <tr key={w.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/works/${w.id}`} className="text-blue-600 hover:underline">
                    {w.slug ?? w.id}
                  </Link>
                </td>
                <td className="px-3 py-2 max-w-xs truncate" title={w.title}>
                  {w.title}
                </td>
                <td className="px-3 py-2">{w.brand}</td>
                <td className="px-3 py-2 text-gray-500">{w.genre ?? '—'}</td>
                <td className="px-3 py-2 text-right">{variantCountMap[w.id] ?? 0}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  ¥{(revenueMap[w.id] ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-center">
                  {w.auto_created ? (
                    <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                      auto
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                      確認済
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(!works || works.length === 0) && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">
                  作品がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
