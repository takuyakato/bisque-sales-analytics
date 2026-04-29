import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllPages } from './paginate';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';

export interface MonthlyReportData {
  month: string; // YYYY-MM
  /** 現在月（今日が属する月）を表示しているか */
  isCurrentMonth: boolean;
  summary: {
    totalJpy: number;
    prevMonthTotalJpy: number;
    prevYearSameMonthJpy: number;
    monthOverMonthPct: number | null;
    yearOverYearPct: number | null;
    salesCount: number;
    /** 現在月表示のとき：前月の月初〜前月同日までの累計 */
    prevMonthUntilSameDayJpy: number;
    /** 現在月表示のとき：前年同月の月初〜前年同月同日までの累計 */
    prevYearUntilSameDayJpy: number;
    monthOverMonthSameDayPct: number | null;
    yearOverYearSameDayPct: number | null;
    /** 現在月表示のとき：今月着地見込み（実績＋残日数×直近3日平均）。非現在月は null */
    expectedMonthEndJpy: number | null;
    /** 現在月表示のとき：着地見込みと前月総額の比較 % */
    expectedVsPrevMonthPct: number | null;
  };
  byBrand: Array<{ brand: string; revenue: number; salesCount: number }>;
  byPlatform: Array<{ platform: string; revenue: number; salesCount: number }>;
  byLanguage: Array<{ language: string; revenue: number; salesCount: number }>;
  /** この月に日次粒度のデータが存在するか（false なら daily テーブルは月合計を1日目にだけ載せる） */
  hasDailyData: boolean;
  /** 日次×レーベル */
  dailyBrand: Array<{
    date: string;
    CAPURI: number;
    BerryFeel: number;
    BLsand: number;
  }>;
  /** 日次×言語（集約後：日本語/英語/韓国語/中国語） */
  dailyLanguage: Array<{
    date: string;
    日本語: number;
    英語: number;
    韓国語: number;
    中国語: number;
  }>;
  /** 日次×レーベル×言語（レーベルフィルタ付き言語別グラフ用） */
  dailyBrandLanguage: Array<{
    date: string;
    brand: string;
    日本語: number;
    英語: number;
    韓国語: number;
    中国語: number;
  }>;
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
 * unstable_cache で 10分キャッシュ＋取込完了時に 'sales-data' タグで破棄
 * 月単位でキャッシュキー分離（過去月は実質無限キャッシュヒット）
 */
export const getMonthlyReport = unstable_cache(
  _getMonthlyReportImpl,
  ['monthly-report', 'v3'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _getMonthlyReportImpl(ym: string): Promise<MonthlyReportData> {
  const supabase = createServiceClient();
  const monthStart = `${ym}-01`;
  const monthEnd = lastDayOfMonth(ym);

  // 現在月判定
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = ym === currentYm;
  const todayDay = now.getDate();

  // 前月・前年同月
  const [prevM, prevY] = [prevMonth(ym), prevYearSame(ym)];
  const prevMStart = `${prevM}-01`, prevMEnd = lastDayOfMonth(prevM);
  const prevYStart = `${prevY}-01`, prevYEnd = lastDayOfMonth(prevY);
  // 前月同日・前年同月同日（現在月表示のときのみ使う）
  const prevMUntilSameDay = isCurrentMonth
    ? `${prevM}-${String(Math.min(todayDay, Number(prevMEnd.slice(8)))).padStart(2, '0')}`
    : prevMEnd;
  const prevYUntilSameDay = isCurrentMonth
    ? `${prevY}-${String(Math.min(todayDay, Number(prevYEnd.slice(8)))).padStart(2, '0')}`
    : prevYEnd;

  const sumRange = async (from: string, to: string): Promise<number> => {
    const rows = await fetchAllPages<{ revenue_jpy: number | null }>(
      supabase,
      'sales_unified_daily',
      (q) => q.select('revenue_jpy').gte('sale_date', from).lte('sale_date', to)
    );
    return rows.reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  };

  // 当月データ（詳細）・前月合計・前年同月合計・前月同日まで・前年同月同日まで を並列取得
  // 現在月表示時は着地見込み算出用に前月末の10日間も追加取得（月初の精度対策）
  const forecastLookbackStart = (() => {
    if (!isCurrentMonth) return null;
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1 - 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [monthRows, prevMonthTotal, prevYearTotal, prevMonthUntilSameDay, prevYearUntilSameDay, forecastLookbackRows] = await Promise.all([
    fetchAllPages<{
      sale_date: string;
      brand: string;
      platform: string;
      language: string;
      work_id: string;
      revenue_jpy: number | null;
      sales_count: number | null;
    }>(
      supabase,
      'sales_unified_daily',
      (q) =>
        q
          .select('sale_date, brand, platform, language, work_id, revenue_jpy, sales_count')
          .gte('sale_date', monthStart)
          .lte('sale_date', monthEnd)
    ),
    sumRange(prevMStart, prevMEnd),
    sumRange(prevYStart, prevYEnd),
    sumRange(prevMStart, prevMUntilSameDay),
    sumRange(prevYStart, prevYUntilSameDay),
    forecastLookbackStart
      ? fetchAllPages<{ sale_date: string; revenue_jpy: number | null }>(
          supabase,
          'sales_unified_daily',
          (q) => q.select('sale_date, revenue_jpy').gte('sale_date', forecastLookbackStart).lt('sale_date', monthStart)
        )
      : Promise.resolve([] as { sale_date: string; revenue_jpy: number | null }[]),
  ]);

  let totalJpy = 0;
  let salesCount = 0;
  const byBrand: Record<string, { revenue: number; salesCount: number }> = {};
  const byPlatform: Record<string, { revenue: number; salesCount: number }> = {};
  const byLanguage: Record<string, { revenue: number; salesCount: number }> = {};
  const daily: Record<string, { dlsite: number; fanza: number; youtube: number }> = {};
  const dailyLangMap: Record<string, Record<string, number>> = {};
  const dailyBrandMap: Record<string, Record<string, number>> = {};
  const dailyBrandLangMap: Record<string, Record<string, Record<string, number>>> = {};
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

    // daily は実日付に、monthly は月初日の sale_date に載せる（日次内訳がない月も総額が見えるように）
    daily[r.sale_date] ??= { dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      daily[r.sale_date][p] += v;
    }
    const lang = aggregatedLanguageLabel(r.language);
    dailyLangMap[r.sale_date] ??= {};
    dailyLangMap[r.sale_date][lang] = (dailyLangMap[r.sale_date][lang] ?? 0) + v;

    dailyBrandMap[r.sale_date] ??= {};
    dailyBrandMap[r.sale_date][r.brand] = (dailyBrandMap[r.sale_date][r.brand] ?? 0) + v;

    dailyBrandLangMap[r.sale_date] ??= {};
    dailyBrandLangMap[r.sale_date][r.brand] ??= {};
    dailyBrandLangMap[r.sale_date][r.brand][lang] =
      (dailyBrandLangMap[r.sale_date][r.brand][lang] ?? 0) + v;

    byWork[r.work_id] ??= { revenue: 0, salesCount: 0 };
    byWork[r.work_id].revenue += v;
    byWork[r.work_id].salesCount += c;
  }

  const hasDailyData = monthRows.length > 0;

  // 日次テーブル整形（月初〜月末を埋める）
  const dailyTable: MonthlyReportData['dailyTable'] = [];
  const dailyLanguage: MonthlyReportData['dailyLanguage'] = [];
  const dailyBrand: MonthlyReportData['dailyBrand'] = [];
  const dailyBrandLanguage: MonthlyReportData['dailyBrandLanguage'] = [];
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
    const langRow = dailyLangMap[dateStr] ?? {};
    dailyLanguage.push({
      date: dateStr,
      日本語: langRow['日本語'] ?? 0,
      英語: langRow['英語'] ?? 0,
      韓国語: langRow['韓国語'] ?? 0,
      中国語: langRow['中国語'] ?? 0,
    });

    const brandRow = dailyBrandMap[dateStr] ?? {};
    dailyBrand.push({
      date: dateStr,
      CAPURI: brandRow['CAPURI'] ?? 0,
      BerryFeel: brandRow['BerryFeel'] ?? 0,
      BLsand: brandRow['BLsand'] ?? 0,
    });

    const brandLangRow = dailyBrandLangMap[dateStr] ?? {};
    for (const brand of ['CAPURI', 'BerryFeel', 'BLsand']) {
      const langValues = brandLangRow[brand] ?? {};
      dailyBrandLanguage.push({
        date: dateStr,
        brand,
        日本語: langValues['日本語'] ?? 0,
        英語: langValues['英語'] ?? 0,
        韓国語: langValues['韓国語'] ?? 0,
        中国語: langValues['中国語'] ?? 0,
      });
    }
  }

  // 今月着地見込み：現在月のみ、取れている直近3日の平均 × 月末までの残日数
  let expectedMonthEndJpy: number | null = null;
  let expectedVsPrevMonthPct: number | null = null;
  if (isCurrentMonth) {
    const forecastDaily: Record<string, number> = {};
    for (const r of monthRows) {
      forecastDaily[r.sale_date] = (forecastDaily[r.sale_date] ?? 0) + (r.revenue_jpy ?? 0);
    }
    for (const r of forecastLookbackRows) {
      forecastDaily[r.sale_date] = (forecastDaily[r.sale_date] ?? 0) + (r.revenue_jpy ?? 0);
    }
    const datesWithData = Object.keys(forecastDaily).sort();
    const last3 = datesWithData.slice(-3);
    const past3DaysAvg = last3.length
      ? last3.reduce((a, d) => a + forecastDaily[d], 0) / last3.length
      : 0;
    const lastDataDate = datesWithData.length ? datesWithData[datesWithData.length - 1] : null;
    let daysRemaining = daysInMonth;
    if (lastDataDate && lastDataDate >= monthStart) {
      daysRemaining = daysInMonth - Number(lastDataDate.slice(8, 10));
    }
    expectedMonthEndJpy = Math.round(totalJpy + past3DaysAvg * daysRemaining);
    expectedVsPrevMonthPct = pct(expectedMonthEndJpy, prevMonthTotal);
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
    isCurrentMonth,
    summary: {
      totalJpy,
      prevMonthTotalJpy: prevMonthTotal,
      prevYearSameMonthJpy: prevYearTotal,
      monthOverMonthPct: pct(totalJpy, prevMonthTotal),
      yearOverYearPct: pct(totalJpy, prevYearTotal),
      salesCount,
      prevMonthUntilSameDayJpy: prevMonthUntilSameDay,
      prevYearUntilSameDayJpy: prevYearUntilSameDay,
      monthOverMonthSameDayPct: pct(totalJpy, prevMonthUntilSameDay),
      yearOverYearSameDayPct: pct(totalJpy, prevYearUntilSameDay),
      expectedMonthEndJpy,
      expectedVsPrevMonthPct,
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
    hasDailyData,
    dailyBrand,
    dailyLanguage,
    dailyBrandLanguage,
    dailyTable,
    topWorks,
  };
}

/**
 * 利用可能な月リスト（sales_unified_daily に存在する年月を抽出）
 * 10分キャッシュ＋取込完了時破棄
 */
export const getAvailableMonths = unstable_cache(
  _getAvailableMonthsImpl,
  ['available-months', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _getAvailableMonthsImpl(): Promise<string[]> {
  const supabase = createServiceClient();
  // 最早・最遅だけを最小クエリで取得し、その間の月を列挙する
  const [earliestSales, latestSales, earliestYt, latestYt] = await Promise.all([
    supabase.from('sales_daily').select('sale_date').order('sale_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('sales_daily').select('sale_date').order('sale_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('youtube_metrics_daily').select('metric_date').order('metric_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('youtube_metrics_daily').select('metric_date').order('metric_date', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const dates: string[] = [
    earliestSales.data?.sale_date,
    latestSales.data?.sale_date,
    earliestYt.data?.metric_date,
    latestYt.data?.metric_date,
  ].filter(Boolean) as string[];
  if (dates.length === 0) return [];
  const sorted = dates.map((d) => String(d)).sort();
  const firstYm = sorted[0].slice(0, 7);
  const lastYm = sorted[sorted.length - 1].slice(0, 7);

  const months: string[] = [];
  const [fy, fm] = firstYm.split('-').map(Number);
  const [ly, lm] = lastYm.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months.sort((a, b) => b.localeCompare(a)); // 新しい月を先頭
}
