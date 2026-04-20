import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import { WorkEditor } from './WorkEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = Promise<{ id: string }>;

function fmt(n: number): string {
  return `¥${n.toLocaleString()}`;
}

export default async function WorkDetail({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: work } = await supabase.from('works').select('*').eq('id', id).maybeSingle();
  if (!work) notFound();

  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, platform, product_id, product_title, language, origin_status, created_at')
    .eq('work_id', id)
    .order('created_at', { ascending: true });

  const { data: sales } = await supabase
    .from('sales_daily')
    .select('sale_date, aggregation_unit, platform, sales_count, net_revenue_jpy, sales_price_jpy')
    .eq('work_id', id)
    .order('sale_date', { ascending: false });

  const totalRevenue = (sales ?? []).reduce((a, s) => a + (s.net_revenue_jpy ?? 0), 0);
  const totalCount = (sales ?? []).reduce((a, s) => a + (s.sales_count ?? 0), 0);

  // 言語別内訳（このworkの variants と sales を JOIN して計算）
  const langRevenue: Record<string, number> = {};
  for (const s of sales ?? []) {
    const v = variants?.find((x) => x.platform === s.platform);
    // variant_idベースでない簡易マッピング（同一作品・同一プラットフォーム）
    if (v) langRevenue[v.language] = (langRevenue[v.language] ?? 0) + (s.net_revenue_jpy ?? 0);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/works" className="text-sm text-blue-600 hover:underline">
          ← 作品一覧に戻る
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左：詳細＋編集 */}
        <div className="md:col-span-2 space-y-6">
          <WorkEditor work={work} />

          {/* SKU一覧 */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              紐付いたSKU（{variants?.length ?? 0}件）
            </h2>
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2">プラットフォーム</th>
                  <th className="text-left py-2">作品ID</th>
                  <th className="text-left py-2">タイトル</th>
                  <th className="text-center py-2">言語</th>
                  <th className="text-center py-2">区分</th>
                </tr>
              </thead>
              <tbody>
                {(variants ?? []).map((v) => (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="py-2">{v.platform}</td>
                    <td className="py-2 font-mono">{v.product_id}</td>
                    <td className="py-2 max-w-xs truncate" title={v.product_title ?? ''}>
                      {v.product_title}
                    </td>
                    <td className="py-2 text-center">{v.language}</td>
                    <td className="py-2 text-center text-gray-500">{v.origin_status}</td>
                  </tr>
                ))}
                {(!variants || variants.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400">
                      SKUなし
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 売上履歴（最新20件） */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">売上履歴（最新20件）</h2>
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2">期間</th>
                  <th className="text-left py-2">粒度</th>
                  <th className="text-left py-2">プラットフォーム</th>
                  <th className="text-right py-2">価格</th>
                  <th className="text-right py-2">販売数</th>
                  <th className="text-right py-2">売上</th>
                </tr>
              </thead>
              <tbody>
                {(sales ?? []).slice(0, 20).map((s, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{s.sale_date}</td>
                    <td className="py-2 text-gray-500">{s.aggregation_unit}</td>
                    <td className="py-2">{s.platform}</td>
                    <td className="py-2 text-right">¥{s.sales_price_jpy ?? 0}</td>
                    <td className="py-2 text-right">{s.sales_count}</td>
                    <td className="py-2 text-right font-semibold">{fmt(s.net_revenue_jpy ?? 0)}</td>
                  </tr>
                ))}
                {(!sales || sales.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-gray-400">
                      売上データなし
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右：サマリ */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">累計</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">売上</dt>
                <dd className="font-semibold">{fmt(totalRevenue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">販売数</dt>
                <dd className="font-semibold">{totalCount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">SKU数</dt>
                <dd className="font-semibold">{variants?.length ?? 0}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">言語別売上</h2>
            <ul className="text-sm space-y-1">
              {Object.entries(langRevenue)
                .sort((a, b) => b[1] - a[1])
                .map(([lang, v]) => (
                  <li key={lang} className="flex justify-between">
                    <span className="text-gray-600">{lang}</span>
                    <span className="font-semibold">{fmt(v)}</span>
                  </li>
                ))}
              {Object.keys(langRevenue).length === 0 && (
                <li className="text-gray-400">データなし</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
