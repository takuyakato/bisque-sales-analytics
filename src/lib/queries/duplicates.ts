import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllPages } from './paginate';

/**
 * 重複候補 works の検出
 *
 * 同タイトル＋同ブランドで複数 works に分散しているケースを抽出。
 * D 案: DLsite と Fanza のクロスは別作品扱い（情報として表示するが、統合は人間判断）。
 *
 * 各グループのメンバーは累計売上降順。先頭がメイン候補。
 */

export interface DuplicateVariant {
  id: string;
  language: string;
  product_id: string;
  platform: string;
}

export interface DuplicateMember {
  work_id: string;
  title: string;
  brand: string;
  variants: DuplicateVariant[];
  totalRevenue: number;
}

export interface DuplicateGroup {
  title: string;
  brand: string;
  members: DuplicateMember[];
}

const norm = (t: string) =>
  t
    .replace(/[\s　]/g, '')
    .replace(/[～〜~]/g, '~')
    .replace(/[（）()]/g, '')
    .replace(/[【】\[\]]/g, '')
    .toLowerCase();

export const getDuplicateWorkGroups = unstable_cache(
  _impl,
  ['duplicate-work-groups', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _impl(): Promise<DuplicateGroup[]> {
  const s = createServiceClient();

  const { data: allWorks } = await s
    .from('works')
    .select('id, title, brand')
    .in('brand', ['CAPURI', 'BerryFeel']);
  if (!allWorks) return [];

  const variants = await fetchAllPages<DuplicateVariant & { work_id: string }>(
    s,
    'product_variants',
    (q) => q.select('id, work_id, language, product_id, platform'),
    { order: ['id'], uniqueKey: ['id'] }
  );
  const variantsByWork = new Map<string, DuplicateVariant[]>();
  for (const v of variants) {
    if (!v.work_id) continue;
    const list = variantsByWork.get(v.work_id) ?? [];
    list.push({ id: v.id, language: v.language, product_id: v.product_id, platform: v.platform });
    variantsByWork.set(v.work_id, list);
  }

  const workIds = allWorks.map((work) => work.id);
  const { data: totals, error: totalsError } = await s.rpc('get_work_revenue_totals', {
    work_ids: workIds,
  });
  if (totalsError) throw new Error(`重複候補の売上取得に失敗しました: ${totalsError.message}`);
  if (totals && totals.length > 0 && totals.length !== Number(totals[0].total_count)) {
    throw new Error(`重複候補の売上が上限で欠落しました: expected=${totals[0].total_count}, actual=${totals.length}`);
  }
  const typedTotals = (totals ?? []) as Array<{ work_id: string; revenue_jpy: number | null }>;
  const revenueByWork = new Map(
    typedTotals.map((total) => [total.work_id, Number(total.revenue_jpy ?? 0)] as const)
  );

  const byKey = new Map<string, typeof allWorks>();
  for (const w of allWorks) {
    const key = `${w.brand}|${norm(w.title)}`;
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(w);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const members: DuplicateMember[] = list
      .map((w) => {
        const vs = variantsByWork.get(w.id) ?? [];
        return {
          work_id: w.id,
          title: w.title,
          brand: w.brand,
          variants: vs,
          totalRevenue: revenueByWork.get(w.id) ?? 0,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    groups.push({
      title: list[0].title,
      brand: list[0].brand,
      members,
    });
  }

  groups.sort((a, b) => (b.members[0]?.totalRevenue ?? 0) - (a.members[0]?.totalRevenue ?? 0));

  return groups;
}
