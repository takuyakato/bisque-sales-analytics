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
    (q) => q.select('id, work_id, language, product_id, platform')
  );
  const variantsByWork = new Map<string, DuplicateVariant[]>();
  for (const v of variants) {
    if (!v.work_id) continue;
    const list = variantsByWork.get(v.work_id) ?? [];
    list.push({ id: v.id, language: v.language, product_id: v.product_id, platform: v.platform });
    variantsByWork.set(v.work_id, list);
  }

  const sales = await fetchAllPages<{ variant_id: string; net_revenue_jpy: number | null }>(
    s,
    'sales_daily',
    (q) => q.select('variant_id, net_revenue_jpy')
  );
  const revByVariant = new Map<string, number>();
  for (const sa of sales) {
    revByVariant.set(
      sa.variant_id,
      (revByVariant.get(sa.variant_id) ?? 0) + (sa.net_revenue_jpy ?? 0)
    );
  }

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
        const rev = vs.reduce((a, v) => a + (revByVariant.get(v.id) ?? 0), 0);
        return {
          work_id: w.id,
          title: w.title,
          brand: w.brand,
          variants: vs,
          totalRevenue: rev,
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
