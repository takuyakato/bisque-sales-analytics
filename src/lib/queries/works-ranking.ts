import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

export type Period = 'all' | 'y1' | 'd30';
export type PlatformFilter = 'all' | 'dlsite' | 'fanza' | 'youtube';

export interface WorkAgg {
  work_id: string;
  title: string;
  slug: string | null;
  brand: string;
  platforms: string[];
  skuCount: number;
  totalAll: number;
  totalY1: number;
  totalD30: number;
  salesAll: number;
  byPlat: Record<string, number>;
}

/**
 * 全作品を集計した売上ランキング（全期間・直近1年・直近30日）
 * `work_revenue_summary` MATERIALIZED VIEW を使用（DB側で事前集計済み）
 * unstable_cache で 10分＋取込完了時に 'sales-data' タグで破棄
 */
export async function getWorksRanking(): Promise<WorkAgg[]> {
  const todayKey = new Date().toISOString().slice(0, 10);
  return _cached(todayKey);
}

const _cached = unstable_cache(
  async (_todayKey: string) => _impl(),
  ['works-ranking', 'v2'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _impl(): Promise<WorkAgg[]> {
  const supabase = createServiceClient();

  // MV から作品×プラットフォーム別サマリ取得（数千行、高速）
  const { data: summary, error } = await supabase
    .from('work_revenue_summary')
    .select('work_id, platform, revenue_all, revenue_y1, revenue_d30, sales_all');
  if (error) {
    console.error('work_revenue_summary fetch failed:', error.message);
    return [];
  }

  // work_id ごとに集約
  const agg: Record<string, WorkAgg> = {};
  for (const r of summary ?? []) {
    const id = r.work_id as string;
    if (!id) continue;
    agg[id] ??= {
      work_id: id,
      title: id,
      slug: null,
      brand: 'unknown',
      platforms: [],
      skuCount: 0,
      totalAll: 0,
      totalY1: 0,
      totalD30: 0,
      salesAll: 0,
      byPlat: {},
    };
    agg[id].totalAll += Number(r.revenue_all ?? 0);
    agg[id].totalY1 += Number(r.revenue_y1 ?? 0);
    agg[id].totalD30 += Number(r.revenue_d30 ?? 0);
    agg[id].salesAll += Number(r.sales_all ?? 0);
    agg[id].byPlat[r.platform] = (agg[id].byPlat[r.platform] ?? 0) + Number(r.revenue_all ?? 0);
  }

  const workIds = Object.keys(agg);
  if (workIds.length === 0) return [];

  // works メタ情報
  const worksMetaAll: Array<{ id: string; title: string; slug: string | null; brand: string }> = [];
  for (let i = 0; i < workIds.length; i += 500) {
    const chunk = workIds.slice(i, i + 500);
    const { data } = await supabase
      .from('works')
      .select('id, title, slug, brand')
      .in('id', chunk);
    if (data) worksMetaAll.push(...data);
  }
  const metaMap = new Map(worksMetaAll.map((w) => [w.id, w]));

  // variants カウント＋プラットフォーム一覧
  const variantsCountMap: Record<string, number> = {};
  const platformMap: Record<string, Set<string>> = {};
  for (let i = 0; i < workIds.length; i += 500) {
    const chunk = workIds.slice(i, i + 500);
    const { data } = await supabase
      .from('product_variants')
      .select('work_id, platform')
      .in('work_id', chunk);
    for (const v of data ?? []) {
      if (!v.work_id) continue;
      variantsCountMap[v.work_id] = (variantsCountMap[v.work_id] ?? 0) + 1;
      platformMap[v.work_id] ??= new Set();
      platformMap[v.work_id].add(v.platform);
    }
  }

  return workIds.map((id) => {
    const a = agg[id];
    const meta = metaMap.get(id);
    return {
      ...a,
      title: meta?.title ?? id,
      slug: meta?.slug ?? null,
      brand: meta?.brand ?? 'unknown',
      skuCount: variantsCountMap[id] ?? 0,
      platforms: Array.from(platformMap[id] ?? new Set()),
    };
  });
}

/**
 * ランキングの並び替えとフィルタ
 */
export function applyRankingFilter(
  rows: WorkAgg[],
  opts: {
    platform?: PlatformFilter;
    period?: Period;
    brand?: string;
    q?: string;
  }
): WorkAgg[] {
  const period = opts.period ?? 'all';
  const valueOf = (a: WorkAgg) => {
    if (opts.platform && opts.platform !== 'all') {
      return a.byPlat[opts.platform] ?? 0;
    }
    return period === 'all' ? a.totalAll : period === 'y1' ? a.totalY1 : a.totalD30;
  };

  let list = rows.slice();
  if (opts.platform && opts.platform !== 'all') {
    list = list.filter((a) => (a.byPlat[opts.platform!] ?? 0) > 0);
  }
  if (opts.brand && opts.brand !== 'all') {
    list = list.filter((a) => a.brand === opts.brand);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    list = list.filter((a) => a.title.toLowerCase().includes(q) || (a.slug ?? '').toLowerCase().includes(q));
  }

  return list.sort((a, b) => valueOf(b) - valueOf(a));
}
