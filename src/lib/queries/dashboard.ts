import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllPages } from './paginate';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';

/**
 * ダッシュボード系の集計クエリを一箇所に集約
 * Server Components から呼ぶ前提
 */

export interface KpiSummary {
  todayJpy: number;
  last30dJpy: number;
  thisMonthJpy: number;
  lastMonthJpy: number;
  /** 前月の月初〜前月同日までの累計 */
  prevMonthUntilSameDayJpy: number;
}

export interface GroupedTotal {
  label: string;
  value: number;
}

export interface DailyPoint {
  date: string;
  dlsite: number;
  fanza: number;
  youtube: number;
}

export interface TopWork {
  work_id: string;
  brand: string;
  title: string;
  slug: string | null;
  revenue_jpy: number;
  sales_count: number;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ダッシュボード用のデータを1セット取得
 * unstable_cache で 10分キャッシュ＋取込完了時に 'sales-data' タグで破棄
 * キャッシュキーに日付を含めて日をまたいだときに自動で別エントリにする
 */
export async function getDashboardData() {
  const todayKey = new Date().toISOString().slice(0, 10);
  return _getDashboardDataCached(todayKey);
}

const _getDashboardDataCached = unstable_cache(
  async (_todayKey: string) => _getDashboardDataImpl(),
  ['dashboard-data', 'v2'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _getDashboardDataImpl() {
  const supabase = createServiceClient();
  const now = new Date();
  const today = fmtDate(now);

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const from30 = fmtDate(d30);

  const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth(), 0));

  // 最初からの月次（制限なし）

  // 直近30日分（monthly 行は Phase 3.5 で削除済みなので単純フェッチ）
  const rows = await fetchAllPages<{
    sale_date: string;
    brand: string;
    platform: string;
    language: string;
    work_id: string;
    revenue_jpy: number | null;
    sales_count: number | null;
  }>(supabase, 'sales_unified_daily', (q) =>
    q
      .select('sale_date, brand, platform, language, work_id, revenue_jpy, sales_count')
      .gte('sale_date', from30)
      .lte('sale_date', today)
  );

  // 当月・前月の集計（monthly 行は Phase 3.5 で削除済み）
  const monthRows = await fetchAllPages<{
    sale_date: string;
    platform: string;
    revenue_jpy: number | null;
  }>(supabase, 'sales_unified_daily', (q) =>
    q
      .select('sale_date, platform, revenue_jpy')
      .gte('sale_date', lastMonthStart)
      .lte('sale_date', today)
  );

  // 月次推移（全期間）：DB側の monthly_platform_summary VIEW を使う（高速）
  const { data: monthlySummary } = await supabase
    .from('monthly_platform_summary')
    .select('year_month, platform, revenue')
    .order('year_month', { ascending: true });
  const monthlyByPlatform = new Map<string, { dlsite: number; fanza: number; youtube: number }>();
  for (const r of monthlySummary ?? []) {
    const entry = monthlyByPlatform.get(r.year_month) ?? { dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      entry[p] += Number(r.revenue ?? 0);
    }
    monthlyByPlatform.set(r.year_month, entry);
  }
  const monthlySeries = Array.from(monthlyByPlatform.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([date, e]) => ({ date, dlsite: e.dlsite, fanza: e.fanza, youtube: e.youtube }));

  // KPI
  let todayJpy = 0;
  let last30dJpy = 0;
  let thisMonthJpy = 0;
  let lastMonthJpy = 0;
  let prevMonthUntilSameDayJpy = 0;

  // 前月の月初〜前月同日（今日と同じ日付ラベル）までの累計
  const lastMonthSameDay = fmtDate(
    new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  );

  for (const r of rows ?? []) {
    const v = r.revenue_jpy ?? 0;
    if (r.sale_date === today) todayJpy += v;
    last30dJpy += v;
  }

  for (const r of monthRows ?? []) {
    const v = r.revenue_jpy ?? 0;
    if (r.sale_date >= monthStart) thisMonthJpy += v;
    if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthEnd) lastMonthJpy += v;
    // 前月同日までの累計（月初〜前月同日）
    if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthSameDay) {
      prevMonthUntilSameDayJpy += v;
    }
  }

  const kpi: KpiSummary = {
    todayJpy,
    last30dJpy,
    thisMonthJpy,
    lastMonthJpy,
    prevMonthUntilSameDayJpy,
  };

  // プラットフォーム別
  const byPlatform: Record<string, number> = { dlsite: 0, fanza: 0, youtube: 0 };
  for (const r of rows ?? []) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + (r.revenue_jpy ?? 0);

  // ブランド別
  const byBrand: Record<string, number> = { CAPURI: 0, BerryFeel: 0, BLsand: 0, unknown: 0 };
  for (const r of rows ?? []) byBrand[r.brand] = (byBrand[r.brand] ?? 0) + (r.revenue_jpy ?? 0);

  // 言語別
  const byLanguage: Record<string, number> = {};
  for (const r of rows ?? []) byLanguage[r.language] = (byLanguage[r.language] ?? 0) + (r.revenue_jpy ?? 0);

  // 日次推移（日付 × platform）
  const daily: Record<string, DailyPoint> = {};
  for (const r of rows ?? []) {
    daily[r.sale_date] ??= { date: r.sale_date, dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as keyof DailyPoint;
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      (daily[r.sale_date][p] as number) += r.revenue_jpy ?? 0;
    }
  }
  const dailySeries = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));

  // 日次×言語（集約後ラベル）
  const dailyLang: Record<string, Record<string, number>> = {};
  for (const r of rows ?? []) {
    const lang = aggregatedLanguageLabel(r.language);
    dailyLang[r.sale_date] ??= {};
    dailyLang[r.sale_date][lang] = (dailyLang[r.sale_date][lang] ?? 0) + (r.revenue_jpy ?? 0);
  }
  const dailyLanguageSeries = Object.entries(dailyLang)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, langMap]) => ({
      date,
      日本語: langMap['日本語'] ?? 0,
      英語: langMap['英語'] ?? 0,
      韓国語: langMap['韓国語'] ?? 0,
      中国語: langMap['中国語'] ?? 0,
      不明: langMap['不明'] ?? 0,
    }));

  // 作品トップ10
  const byWork: Record<string, { revenue: number; count: number }> = {};
  for (const r of rows ?? []) {
    byWork[r.work_id] ??= { revenue: 0, count: 0 };
    byWork[r.work_id].revenue += r.revenue_jpy ?? 0;
    byWork[r.work_id].count += r.sales_count ?? 0;
  }
  const topWorkIds = Object.entries(byWork)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([id]) => id);

  const { data: topWorksMeta } = topWorkIds.length
    ? await supabase.from('works').select('id, title, brand, slug').in('id', topWorkIds)
    : { data: [] };

  const topWorks: TopWork[] = topWorkIds.map((id) => {
    const meta = topWorksMeta?.find((w) => w.id === id);
    return {
      work_id: id,
      brand: meta?.brand ?? 'unknown',
      title: meta?.title ?? id,
      slug: meta?.slug ?? null,
      revenue_jpy: byWork[id].revenue,
      sales_count: byWork[id].count,
    };
  });

  return {
    kpi,
    byPlatform,
    byBrand,
    byLanguage,
    dailySeries,
    dailyLanguageSeries,
    monthlySeries,
    topWorks,
    period: { from: from30, to: today },
  };
}
