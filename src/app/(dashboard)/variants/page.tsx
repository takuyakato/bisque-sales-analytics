import { createServiceClient } from '@/lib/supabase/service';
import { VariantEditor } from './VariantEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<{
  platform?: string;
  language?: string;
  q?: string;
}>;

export default async function VariantsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = createServiceClient();

  let query = supabase
    .from('product_variants')
    .select('id, work_id, platform, product_id, product_title, language, origin_status, created_at')
    .order('created_at', { ascending: false });

  if (params.platform && params.platform !== 'all') query = query.eq('platform', params.platform);
  if (params.language && params.language !== 'all') query = query.eq('language', params.language);
  if (params.q) query = query.ilike('product_title', `%${params.q}%`);

  const { data: variants } = await query.limit(500);

  // 紐付け先の works 名を取得
  const workIds = Array.from(new Set((variants ?? []).map((v) => v.work_id).filter(Boolean))) as string[];
  const { data: works } = workIds.length
    ? await supabase.from('works').select('id, title, slug, brand').in('id', workIds)
    : { data: [] };

  const workMap = new Map((works ?? []).map((w) => [w.id, w]));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800">SKU管理</h1>
        <p className="text-sm text-gray-500">
          プラットフォーム別SKUの言語・作品紐付けを管理（{variants?.length ?? 0}件表示）
        </p>
      </div>

      {/* フィルタ */}
      <form className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">プラットフォーム</label>
          <select name="platform" defaultValue={params.platform ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="dlsite">DLsite</option>
            <option value="fanza">Fanza</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">言語</label>
          <select name="language" defaultValue={params.language ?? 'all'} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">
            <option value="all">すべて</option>
            <option value="ja">ja</option>
            <option value="en">en</option>
            <option value="zh-Hant">zh-Hant</option>
            <option value="zh-Hans">zh-Hans</option>
            <option value="ko">ko</option>
            <option value="unknown">unknown</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">タイトル検索</label>
          <input type="text" name="q" defaultValue={params.q ?? ''} className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          絞り込み
        </button>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600">
              <th className="text-left px-3 py-2">プラットフォーム</th>
              <th className="text-left px-3 py-2">作品ID</th>
              <th className="text-left px-3 py-2">タイトル</th>
              <th className="text-left px-3 py-2">紐付け先 work</th>
              <th className="text-center px-3 py-2">言語</th>
              <th className="text-center px-3 py-2">区分</th>
              <th className="text-center px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {(variants ?? []).map((v) => {
              const work = v.work_id ? workMap.get(v.work_id) : undefined;
              return (
                <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">{v.platform}</td>
                  <td className="px-3 py-2 font-mono text-xs">{v.product_id}</td>
                  <td className="px-3 py-2 max-w-md truncate" title={v.product_title ?? ''}>
                    {v.product_title}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {work ? (
                      <a href={`/works/${work.id}`} className="text-blue-600 hover:underline">
                        {work.slug ?? work.title.slice(0, 30)}
                      </a>
                    ) : (
                      <span className="text-gray-400">未紐付け</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <VariantEditor
                      variantId={v.id}
                      field="language"
                      value={v.language}
                      options={['ja', 'en', 'zh-Hant', 'zh-Hans', 'ko', 'unknown']}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <VariantEditor
                      variantId={v.id}
                      field="origin_status"
                      value={v.origin_status}
                      options={['original', 'translation', 'unknown']}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <VariantEditor variantId={v.id} field="work_link" value={v.work_id ?? ''} options={[]} />
                  </td>
                </tr>
              );
            })}
            {(!variants || variants.length === 0) && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">
                  SKUがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
