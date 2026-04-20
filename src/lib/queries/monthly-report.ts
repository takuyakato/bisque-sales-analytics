import { createServiceClient } from '@/lib/supabase/service';

export interface MonthlyReportData {
  month: string; // YYYY-MM
  summary: {
    totalJpy: number;
    prevMonthTotalJpy: number;
    prevYearSameMonthJpy: number;
    monthOverMonthPct: number | null;
    yearOverYearPct: number | null;
    salesCount: number;
  };
  byBrand: Array<{ brand: string; revenue: number; salesCount: number }>;
  byPlatform: Array<{ platform: string; revenue: number; salesCount: number }>;
  byLanguage: Array<{ language: string; revenue: number; salesCount: number }>;
  dailyTable: Array<{
    date: string;
    dlsite: number;
    fanza: number;
    youtube: number;
    total: number;
    prevDayPct: number | null;
  }>;
  topWorks: Array<{
    work_id: string;
    title: string;
    slug: string | null;
    brand: string;
    revenue: number;
    salesCount: number;
  }>;
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function prevYearSame(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

function pct(a: number, b: number): number | null {
  if (!b) return null;
  return Math.round(((a - b) / b) * 1000) / 10;
}

/**
 * 指定月のレポートデータを取得
 */
export async function getMonthlyReport(ym: string): Promise<MonthlyReportData> {
  const supabase = createServiceClient();
  const monthStart = `${ym}-01`;
  const monthEnd = lastDayOfMonth(ym);

  // 当月データ（日次 + 月次両方を含む sales_unified_daily）
  const { data: monthRows } = await supabase
    .from('sales_unified_daily')
    .select('sale_date, brand, platform, language, work_id, revenue_jpy, sales_count, aggregation_unit')
    .gte('sale_date', monthStart)
    .lte('sale_date', monthEnd);

  // 前月・前年同月の総額
  const [prevM, prevY] = [prevMonth(ym), prevYearSame(ym)];
  const prevMStart = `${prevM}-01`, prevMEnd = lastDayOfMonth(prevM);
  const prevYStart = `${prevY}-01`, prevYEnd = lastDayOfMonth(prevY);

  const sumRange = async (from: string, to: string): Promise<number> => {
    const { data } = await supabase
      .from('sales_unified_daily')
      .select('revenue_jpy')
      .gte('sale_date', from)
      .lte('sale_date', to);
    return (data ?? []).reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  };

  const [prevMonthTotal, prevYearTotal] = await Promise.all([
    sumRange(prevMStart, prevMEnd),
    sumRange(prevYStart, prevYEnd),
  ]);

  let totalJpy = 0;
  let salesCount = 0;
  const byBrand: Record<string, { revenue: number; salesCount: number }> = {};
  const byPlatform: Record<string, { revenue: number; salesCount: number }> = {};
  const byLanguage: Record<string, { revenue: number; salesCount: number }> = {};
  const daily: Record<string, { dlsite: number; fanza: number; youtube: number }> = {};
  const byWork: Record<string, { revenue: number; salesCount: number }> = {};

  for (const r of monthRows ?? []) {
    const v = r.revenue_jpy ?? 0;
    const c = r.sales_count ?? 0;
    totalJpy += v;
    salesCount += c;

    byBrand[r.brand] ??= { revenue: 0, salesCount: 0 };
    byBrand[r.brand].revenue += v;
    byBrand[r.brand].salesCount += c;

    byPlatform[r.platform] ??= { revenue: 0, salesCount: 0 };
    byPlatform[r.platform].revenue += v;
    byPlatform[r.platform].salesCount += c;

    byLanguage[r.language] ??= { revenue: 0, salesCount: 0 };
    byLanguage[r.language].revenue += v;
    byLanguage[r.language].salesCount += c;

    if (r.aggregation_unit === 'daily') {
      daily[r.sale_date] ??= { dlsite: 0, fanza: 0, youtube: 0 };
      const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
      if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
        daily[r.sale_date][p] += v;
      }
    }

    byWork[r.work_id] ??= { revenue: 0, salesCount: 0 };
    byWork[r.work_id].revenue += v;
    byWork[r.work_id].salesCount += c;
  }

  // 日次テーブル整形（月初〜月末を埋める）
  const dailyTable: MonthlyReportData['dailyTable'] = [];
  const [yy, mm] = ym.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  let prevTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
    const row = daily[dateStr] ?? { dlsite: 0, fanza: 0, youtube: 0 };
    const total = row.dlsite + row.fanza + row.youtube;
    dailyTable.push({
      date: dateStr,
      dlsite: row.dlsite,
      fanza: row.fanza,
      youtube: row.youtube,
      total,
      prevDayPct: d === 1 ? null : pct(total, prevTotal),
    });
    prevTotal = total;
  }

  // トップ10作品
  const topWorkIds = Object.entries(byWork)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([id]) => id);

  const { data: worksMeta } = topWorkIds.length
    ? await supabase.from('works').select('id, title, slug, brand').in('id', topWorkIds)
    : { data: [] };

  const topWorks: MonthlyReportData['topWorks'] = topWorkIds.map((id) => {
    const meta = worksMeta?.find((w) => w.id === id);
    return {
      work_id: id,
      title: meta?.title ?? id,
      slug: meta?.slug ?? null,
      brand: meta?.brand ?? 'unknown',
      revenue: byWork[id].revenue,
      salesCount: byWork[id].salesCount,
    };
  });

  return {
    month: ym,
    summary: {
      totalJpy,
      prevMonthTotalJpy: prevMonthTotal,
      prevYearSameMonthJpy: prevYearTotal,
      monthOverMonthPct: pct(totalJpy, prevMonthTotal),
      yearOverYearPct: pct(totalJpy, prevYearTotal),
      salesCount,
    },
    byBrand: Object.entries(byBrand)
      .map(([brand, v]) => ({ brand, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byPlatform: Object.entries(byPlatform)
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byLanguage: Object.entries(byLanguage)
      .map(([language, v]) => ({ language, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    dailyTable,
    topWorks,
  };
}

/**
 * 利用可能な月リスト（sales_unified_daily に存在する年月を抽出）
 */
export async function getAvailableMonths(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('sales_unified_daily')
    .select('sale_date')
    .order('sale_date', { ascending: false });

  const set = new Set<string>();
  for (const r of data ?? []) set.add(String(r.sale_date).slice(0, 7));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}
