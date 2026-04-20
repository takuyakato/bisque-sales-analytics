import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<{
  brand?: string;
  auto?: string;
  q?: string;
}>;

export default async function WorksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = createServiceClient();

  let query = supabase
    .from('works')
    .select('id, slug, title, brand, genre, release_date, auto_created')
    .order('created_at', { ascending: false });

  if (params.brand && params.brand !== 'all') query = query.eq('brand', params.brand);
  if (params.auto === 'true') query = query.eq('auto_created', true);
  if (params.auto === 'false') query = query.eq('auto_created', false);
  if (params.q) query = query.ilike('title', `%${params.q}%`);

  const { data: works, error } = await query.limit(500);

  // 各worksに紐付いたvariants数、売上合計を取得
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

    const { data: sales } = await supabase
      .from('sales_daily')
      .select('work_id, net_revenue_jpy')
      .in('work_id', workIds);
    for (const s of sales ?? []) {
      if (s.work_id) revenueMap[s.work_id] = (revenueMap[s.work_id] ?? 0) + (s.net_revenue_jpy ?? 0);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">作品マスタ</h1>
          <p className="text-sm text-gray-500">{works?.length ?? 0}件表示</p>
        </div>
      </div>

      {/* フィルタ */}
      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ブランド</label>
          <select name="brand" defaultValue={params.brand ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="CAPURI">CAPURI</option>
            <option value="BerryFeel">BerryFeel</option>
            <option value="BLsand">BLsand</option>
            <option value="unknown">unknown</option>
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600">
              <th className="text-left px-3 py-2">ID / slug</th>
              <th className="text-left px-3 py-2">タイトル</th>
              <th className="text-left px-3 py-2">ブランド</th>
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
