import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllPages } from './paginate';

/**
 * ダッシュボード系の集計クエリを一箇所に集約
 * Server Components から呼ぶ前提
 */

export interface KpiSummary {
  todayJpy: number;
  last30dJpy: number;
  thisMonthJpy: number;
  lastMonthJpy: number;
  prevMonthSameDayJpy: number;
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
 */
export async function getDashboardData() {
  const supabase = createServiceClient();
  const now = new Date();
  const today = fmtDate(now);

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const from30 = fmtDate(d30);

  const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth(), 0));

  // 直近30日分（ページングで1000行制限を超えて取得）
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

  // 当月・前月の集計は monthly unit を含めて（過去分を考慮）
  const monthRows = await fetchAllPages<{
    sale_date: string;
    revenue_jpy: number | null;
    aggregation_unit: string;
  }>(supabase, 'sales_unified_daily', (q) =>
    q
      .select('sale_date, revenue_jpy, aggregation_unit')
      .gte('sale_date', lastMonthStart)
      .lte('sale_date', today)
  );

  // KPI
  let todayJpy = 0;
  let last30dJpy = 0;
  let thisMonthJpy = 0;
  let lastMonthJpy = 0;
  let prevMonthSameDayJpy = 0;

  for (const r of rows ?? []) {
    const v = r.revenue_jpy ?? 0;
    if (r.sale_date === today) todayJpy += v;
    last30dJpy += v;
  }

  for (const r of monthRows ?? []) {
    const v = r.revenue_jpy ?? 0;
    if (r.sale_date >= monthStart) thisMonthJpy += v;
    if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthEnd) lastMonthJpy += v;
    // 前月同日（同じ日付ラベル）
    const lastMonthSameDay = fmtDate(
      new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    );
    if (r.sale_date === lastMonthSameDay) prevMonthSameDayJpy += v;
  }

  const kpi: KpiSummary = {
    todayJpy,
    last30dJpy,
    thisMonthJpy,
    lastMonthJpy,
    prevMonthSameDayJpy,
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
    topWorks,
    period: { from: from30, to: today },
  };
}
