import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

type SearchParams = Promise<{
  brand?: string;
  q?: string;
}>;

export default async function OverseasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const brand = params.brand ?? 'all';
  const q = params.q ?? '';

  const data = await getOverseasCoverage();
  let rows = data.rows;
  if (brand !== 'all') rows = rows.filter((r) => r.brand === brand);
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(ql));
  }

  const coverage = {
    ja: rows.length,
    en: rows.filter((r) => r.hasEn).length,
    zhHans: rows.filter((r) => r.hasZhHans).length,
    zhHant: rows.filter((r) => r.hasZhHant).length,
    ko: rows.filter((r) => r.hasKo).length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">海外展開</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            DLsite（CAPURI / BerryFeel）の日本語作品と各言語翻訳の有無を一覧表示
          </p>
        </div>
        <Link
          href="/variants"
          className="self-start md:self-auto text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
        >
          → 翻訳作品を紐付け（SKU管理）
        </Link>
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4">
        <SumCard label="日本語作品" value={coverage.ja} subValue={`展開源`} />
        <SumCard label="英語展開" value={coverage.en} subValue={`${pct(coverage.en, coverage.ja)}`} />
        <SumCard label="簡体字展開" value={coverage.zhHans} subValue={`${pct(coverage.zhHans, coverage.ja)}`} />
        <SumCard label="繁体字展開" value={coverage.zhHant} subValue={`${pct(coverage.zhHant, coverage.ja)}`} />
        <SumCard label="韓国語展開" value={coverage.ko} subValue={`${pct(coverage.ko, coverage.ja)}`} />
      </div>

      {/* フィルタ */}
      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">レーベル</label>
          <select name="brand" defaultValue={brand} className="px-3 py-1.5 border border-gray-300 rounded-md">
            <option value="all">すべて</option>
            <option value="CAPURI">CAPURI</option>
            <option value="BerryFeel">BerryFeel</option>
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

      {/* マトリクス */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600">
              <th className="text-left px-3 py-2">RJ</th>
              <th className="text-left px-3 py-2">タイトル（日本語）</th>
              <th className="text-left px-3 py-2">レーベル</th>
              <th className="text-center px-3 py-2">英語</th>
              <th className="text-center px-3 py-2">簡体字</th>
              <th className="text-center px-3 py-2">繁体字</th>
              <th className="text-center px-3 py-2">韓国語</th>
              <th className="text-right px-3 py-2">累計売上（全言語）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.work_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.jaProductIds.join(', ')}</td>
                <td className="px-3 py-2 max-w-md">
                  <Link href={`/works/${r.work_id}`} className="text-blue-600 hover:underline line-clamp-2" title={r.title}>
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.brand}</td>
                <td className="px-3 py-2 text-center">{r.hasEn ? <Mark /> : <Blank />}</td>
                <td className="px-3 py-2 text-center">{r.hasZhHans ? <Mark /> : <Blank />}</td>
                <td className="px-3 py-2 text-center">{r.hasZhHant ? <Mark /> : <Blank />}</td>
                <td className="px-3 py-2 text-center">{r.hasKo ? <Mark /> : <Blank />}</td>
                <td
                  className="px-3 py-2 text-right font-semibold"
                  title={`日本語版 ¥${r.revenueJa.toLocaleString()}`}
                >
                  ¥{r.revenueAll.toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  該当作品がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.unlinked.total > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            ⚠ 紐付いていない翻訳variant: {data.unlinked.total} 件
          </p>
          <p className="text-xs text-amber-800 mb-2">
            翻訳作品が別の work_id で登録されているため、この表では ○ が付きません。
            <Link href="/variants" className="underline ml-1">SKU管理</Link>
            で翻訳作品を日本語版と同じ work に手動で紐付けると反映されます。
          </p>
          <div className="text-xs text-amber-800 flex flex-wrap gap-3">
            <span>英語: {data.unlinked.en}</span>
            <span>簡体字: {data.unlinked.zhHans}</span>
            <span>繁体字: {data.unlinked.zhHant}</span>
            <span>韓国語: {data.unlinked.ko}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Mark() {
  return <span className="inline-block w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs leading-6 font-bold">○</span>;
}
function Blank() {
  return <span className="inline-block text-gray-300">—</span>;
}

function pct(n: number, d: number): string {
  if (!d) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function SumCard({ label, value, subValue }: { label: string; value: number; subValue?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}

// ================== データ取得 ==================

interface OverseasRow {
  work_id: string;
  title: string;
  brand: string;
  jaProductIds: string[];
  hasEn: boolean;
  hasZhHans: boolean;
  hasZhHant: boolean;
  hasKo: boolean;
  revenueJa: number;
  revenueAll: number;
}

interface OverseasData {
  rows: OverseasRow[];
  unlinked: {
    total: number;
    en: number;
    zhHans: number;
    zhHant: number;
    ko: number;
  };
}

async function getOverseasCoverage(): Promise<OverseasData> {
  const todayKey = new Date().toISOString().slice(0, 10);
  return _cached(todayKey);
}

const _cached = unstable_cache(
  async (_today: string) => _impl(),
  ['overseas-coverage', 'v2'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _impl(): Promise<OverseasData> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('get_overseas_coverage');
  if (error) throw new Error(`海外展開データの取得に失敗しました: ${error.message}`);

  interface RpcRow {
    kind: 'work' | 'unlinked';
    work_id: string | null;
    title: string | null;
    brand: string | null;
    ja_product_ids: string[] | null;
    has_en: boolean | null;
    has_zh_hans: boolean | null;
    has_zh_hant: boolean | null;
    has_ko: boolean | null;
    revenue_ja_jpy: number | null;
    revenue_all_lang_jpy: number | null;
    language: string | null;
    total_count: number;
  }
  const rpcRows = (data ?? []) as RpcRow[];
  if (rpcRows.length > 0 && rpcRows.length !== Number(rpcRows[0].total_count)) {
    throw new Error(`海外展開データが上限で欠落しました: expected=${rpcRows[0].total_count}, actual=${rpcRows.length}`);
  }

  const rows: OverseasRow[] = rpcRows
    .filter((row) => row.kind === 'work')
    .map((row) => ({
      work_id: row.work_id ?? '',
      title: row.title ?? '',
      brand: row.brand ?? '',
      jaProductIds: row.ja_product_ids ?? [],
      hasEn: row.has_en ?? false,
      hasZhHans: row.has_zh_hans ?? false,
      hasZhHant: row.has_zh_hant ?? false,
      hasKo: row.has_ko ?? false,
      revenueJa: Number(row.revenue_ja_jpy ?? 0),
      revenueAll: Number(row.revenue_all_lang_jpy ?? 0),
    }))
    .sort((a, b) => b.revenueAll - a.revenueAll);

  const unlinked = { total: 0, en: 0, zhHans: 0, zhHant: 0, ko: 0 };
  for (const row of rpcRows) {
    if (row.kind !== 'unlinked') continue;
    unlinked.total++;
    if (row.language === 'en') unlinked.en++;
    else if (row.language === 'zh-Hans') unlinked.zhHans++;
    else if (row.language === 'zh-Hant') unlinked.zhHant++;
    else if (row.language === 'ko') unlinked.ko++;
  }

  return { rows, unlinked };
}
