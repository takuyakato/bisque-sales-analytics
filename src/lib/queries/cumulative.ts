import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';

export interface CumulativeTotals {
  total: number;
  byPlatform: Record<string, number>;
  byBrand: Record<string, number>;
  byLanguage: Record<string, number>;
}

export interface MonthlyPlatformPoint {
  date: string;
  dlsite: number;
  fanza: number;
  youtube: number;
}

/**
 * 全期間累計（プラットフォーム / レーベル / 言語別）
 *
 * DB 側の monthly_*_summary VIEW（migration 004 で作成）から取得し、
 * フロント側でプラットフォーム・レーベル・言語別に集計する。
 * 750k行→数百行にデータ転送を圧縮。
 */
export async function getCumulativeTotals(): Promise<CumulativeTotals> {
  const todayKey = new Date().toISOString().slice(0, 10);
  return _cached(todayKey);
}

const _cached = unstable_cache(
  async (_today: string) => _impl(),
  ['cumulative-totals', 'v2'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _impl(): Promise<CumulativeTotals> {
  const supabase = createServiceClient();

  const [plat, brand, lang] = await Promise.all([
    supabase.from('monthly_platform_summary').select('platform, revenue'),
    supabase.from('monthly_brand_summary').select('brand, revenue'),
    supabase.from('monthly_language_summary').select('language, revenue'),
  ]);

  const cumulative: CumulativeTotals = {
    total: 0,
    byPlatform: { dlsite: 0, fanza: 0, youtube: 0 },
    byBrand: { CAPURI: 0, BerryFeel: 0, BLsand: 0 },
    byLanguage: { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 },
  };

  for (const r of plat.data ?? []) {
    const rev = Number(r.revenue ?? 0);
    if (r.platform in cumulative.byPlatform) cumulative.byPlatform[r.platform] += rev;
    cumulative.total += rev;
  }
  for (const r of brand.data ?? []) {
    const rev = Number(r.revenue ?? 0);
    if (r.brand in cumulative.byBrand) cumulative.byBrand[r.brand] += rev;
  }
  for (const r of lang.data ?? []) {
    const rev = Number(r.revenue ?? 0);
    const label = aggregatedLanguageLabel(r.language);
    if (label in cumulative.byLanguage) cumulative.byLanguage[label] += rev;
  }

  return cumulative;
}

/**
 * 月次推移（全期間・プラットフォーム別）
 * monthly_platform_summary VIEW から取得して year_month 昇順で返す。
 */
export async function getMonthlySeriesAll(): Promise<MonthlyPlatformPoint[]> {
  const todayKey = new Date().toISOString().slice(0, 10);
  return _monthlyCached(todayKey);
}

const _monthlyCached = unstable_cache(
  async (_today: string) => _monthlyImpl(),
  ['monthly-series-all', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _monthlyImpl(): Promise<MonthlyPlatformPoint[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('monthly_platform_summary')
    .select('year_month, platform, revenue')
    .order('year_month', { ascending: true });

  const byMonth = new Map<string, { dlsite: number; fanza: number; youtube: number }>();
  for (const r of data ?? []) {
    const entry = byMonth.get(r.year_month) ?? { dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      entry[p] += Number(r.revenue ?? 0);
    }
    byMonth.set(r.year_month, entry);
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ date, dlsite: e.dlsite, fanza: e.fanza, youtube: e.youtube }));
}
