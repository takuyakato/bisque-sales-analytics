import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';

/**
 * ダッシュボード系の集計クエリを一箇所に集約
 * Server Components から呼ぶ前提
 *
 * Phase 4 (migration 011): 全クエリを DB 側集計済みマテビュー / RPC に切替＋ Promise.all で並列化。
 * sales_unified_daily の明細フェッチは廃止。
 */

export interface KpiSummary {
  last30dJpy: number;
  /** 直近30日のさらに1つ前の30日（60日前〜31日前） */
  prev30dJpy: number;
  thisMonthJpy: number;
  lastMonthJpy: number;
  /** 前月の月初〜前月同日までの累計 */
  prevMonthUntilSameDayJpy: number;
  /** 今月着地見込み：今月累計＋（最新データがある3日の平均 × 月末までの残日数） */
  expectedMonthEndJpy: number;
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

export interface DailyBrandLanguagePoint {
  date: string;
  brand: string;
  日本語: number;
  英語: number;
  韓国語: number;
  中国語: number;
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
  ['dashboard-data', 'v10'],
  { revalidate: 600, tags: ['sales-data'] }
);

async function _getDashboardDataImpl() {
  const supabase = createServiceClient();
  const now = new Date();
  const today = fmtDate(now);

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const from30 = fmtDate(d30);

  const d60 = new Date(now);
  d60.setDate(d60.getDate() - 60);
  const from60 = fmtDate(d60);

  const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthlyChartStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 23, 1));
  const lastMonthStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth(), 0));
  const lastMonthSameDay = fmtDate(
    new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  );

  // 全集計クエリを並列実行（DB側で GROUP BY 済みのマテビュー / RPC を引く）
  const [
    last30Res,
    prev30Res,
    monthRangeRes,
    monthlyPlatformRes,
    monthlyLanguageRes,
    monthlyBrandLanguageRes,
    topWorksRes,
  ] = await Promise.all([
    supabase
      .from('daily_breakdown_summary')
      .select('sale_date, brand, platform, language, revenue, sales_count')
      .gte('sale_date', from30)
      .lte('sale_date', today),
    supabase
      .from('daily_breakdown_summary')
      .select('revenue')
      .gte('sale_date', from60)
      .lt('sale_date', from30),
    supabase
      .from('daily_breakdown_summary')
      .select('sale_date, brand, platform, language, revenue')
      .gte('sale_date', lastMonthStart)
      .lte('sale_date', today),
    supabase
      .from('monthly_platform_summary')
      .select('year_month, platform, revenue')
      .order('year_month', { ascending: true }),
    supabase
      .from('monthly_language_summary')
      .select('year_month, language, revenue')
      .order('year_month', { ascending: true }),
    supabase
      .from('monthly_brand_language_summary')
      .select('year_month, brand, language, revenue')
      .gte('year_month', monthlyChartStart.slice(0, 7))
      .order('year_month', { ascending: true }),
    supabase.rpc('get_top_works_d30', { top_n: 10 }),
  ]);

  type DailyRow = {
    sale_date: string;
    brand: string;
    platform: string;
    language: string;
    revenue: number | null;
    sales_count: number | null;
  };

  const rows = (last30Res.data ?? []) as DailyRow[];
  const prev30Rows = (prev30Res.data ?? []) as Array<{ revenue: number | null }>;
  const monthRows = (monthRangeRes.data ?? []) as Array<{
    sale_date: string;
    brand: string;
    platform: string;
    language: string;
    revenue: number | null;
  }>;
  const monthlySummary = (monthlyPlatformRes.data ?? []) as Array<{
    year_month: string;
    platform: string;
    revenue: number | null;
  }>;
  const monthlyLanguageSummary = (monthlyLanguageRes.data ?? []) as Array<{
    year_month: string;
    language: string;
    revenue: number | null;
  }>;
  const monthlyBrandLanguageRows = (monthlyBrandLanguageRes.data ?? []) as Array<{
    year_month: string;
    brand: string;
    language: string;
    revenue: number | null;
  }>;
  const topWorksRpc = (topWorksRes.data ?? []) as Array<{
    work_id: string;
    title: string;
    slug: string | null;
    brand: string;
    revenue: number | string;
    sales_count: number | string;
  }>;

  const prev30dJpy = prev30Rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0);

  // 月次推移マップ（DB集計を Map に投入）
  const monthlyByPlatform = new Map<string, { dlsite: number; fanza: number; youtube: number }>();
  for (const r of monthlySummary) {
    const entry = monthlyByPlatform.get(r.year_month) ?? { dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      entry[p] += Number(r.revenue ?? 0);
    }
    monthlyByPlatform.set(r.year_month, entry);
  }

  const monthlyByLanguage = new Map<
    string,
    { 日本語: number; 英語: number; 中国語: number; 韓国語: number }
  >();
  for (const r of monthlyLanguageSummary) {
    const entry =
      monthlyByLanguage.get(r.year_month) ??
      { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
    const lang = aggregatedLanguageLabel(r.language as string);
    if (lang === '日本語' || lang === '英語' || lang === '中国語' || lang === '韓国語') {
      entry[lang] += Number(r.revenue ?? 0);
    }
    monthlyByLanguage.set(r.year_month, entry);
  }

  const monthlyBrandLang = new Map<string, Record<string, Record<string, number>>>();
  for (const r of monthlyBrandLanguageRows) {
    const month = r.year_month;
    const lang = aggregatedLanguageLabel(r.language);
    if (lang !== '日本語' && lang !== '英語' && lang !== '中国語' && lang !== '韓国語') {
      continue;
    }
    const monthEntry = monthlyBrandLang.get(month) ?? {};
    monthEntry[r.brand] ??= {};
    monthEntry[r.brand][lang] = (monthEntry[r.brand][lang] ?? 0) + Number(r.revenue ?? 0);
    monthlyBrandLang.set(month, monthEntry);
  }

  // KPI集計
  let last30dJpy = 0;
  let thisMonthJpy = 0;
  let lastMonthJpy = 0;
  let prevMonthUntilSameDayJpy = 0;

  for (const r of rows) {
    last30dJpy += Number(r.revenue ?? 0);
  }

  // 日付ごとの売上（着地見込み計算のため）/ 今月分プラットフォーム別・言語別・brand×言語別（マテビュー遅延対策）
  const dailyRevenue: Record<string, number> = {};
  const currentMonthPlatform = { dlsite: 0, fanza: 0, youtube: 0 };
  const currentMonthLanguage = { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
  const currentMonthBrandLang: Record<string, Record<string, number>> = {};
  for (const r of monthRows) {
    const v = Number(r.revenue ?? 0);
    dailyRevenue[r.sale_date] = (dailyRevenue[r.sale_date] ?? 0) + v;
    if (r.sale_date >= monthStart) {
      thisMonthJpy += v;
      const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
      if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
        currentMonthPlatform[p] += v;
      }
      const lang = aggregatedLanguageLabel(r.language);
      if (lang === '日本語' || lang === '英語' || lang === '中国語' || lang === '韓国語') {
        currentMonthLanguage[lang] += v;
        currentMonthBrandLang[r.brand] ??= {};
        currentMonthBrandLang[r.brand][lang] = (currentMonthBrandLang[r.brand][lang] ?? 0) + v;
      }
    }
    if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthEnd) lastMonthJpy += v;
    if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthSameDay) {
      prevMonthUntilSameDayJpy += v;
    }
  }

  // 今月着地見込み
  const datesWithData = Object.keys(dailyRevenue).sort();
  const last3Dates = datesWithData.slice(-3);
  const past3DaysAvg = last3Dates.length
    ? last3Dates.reduce((a, d) => a + (dailyRevenue[d] ?? 0), 0) / last3Dates.length
    : 0;
  const lastDataDate = datesWithData.length ? datesWithData[datesWithData.length - 1] : null;
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let daysRemaining = daysInThisMonth;
  if (lastDataDate && lastDataDate >= monthStart) {
    const lastDataDay = Number(lastDataDate.slice(8, 10));
    daysRemaining = daysInThisMonth - lastDataDay;
  }
  const forecastTailJpy = Math.round(past3DaysAvg * daysRemaining);
  const expectedMonthEndJpy = thisMonthJpy + forecastTailJpy;

  // 今月分はマテビューの遅延を避けるため日次データで上書き
  const currentMonthKey = monthStart.slice(0, 7);
  monthlyByPlatform.set(currentMonthKey, currentMonthPlatform);
  monthlyByLanguage.set(currentMonthKey, currentMonthLanguage);
  monthlyBrandLang.set(currentMonthKey, currentMonthBrandLang);

  const monthlySeries = Array.from(monthlyByPlatform.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([date, e]) => ({
      date,
      dlsite: e.dlsite,
      fanza: e.fanza,
      youtube: e.youtube,
      forecast: date === currentMonthKey ? forecastTailJpy : 0,
    }));

  const monthlyLanguageSeries = Array.from(monthlyByLanguage.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([date, e]) => ({
      date,
      日本語: e.日本語,
      英語: e.英語,
      中国語: e.中国語,
      韓国語: e.韓国語,
      forecast: date === currentMonthKey ? forecastTailJpy : 0,
    }));

  const monthlyBrandLanguageSeries: DailyBrandLanguagePoint[] = [];
  const recentMonths = Array.from(monthlyByLanguage.keys()).sort().slice(-24);
  for (const date of recentMonths) {
    const monthEntry = monthlyBrandLang.get(date) ?? {};
    for (const brand of ['CAPURI', 'BerryFeel', 'BLsand', 'unknown']) {
      const langMap = monthEntry[brand] ?? {};
      monthlyBrandLanguageSeries.push({
        date,
        brand,
        日本語: langMap['日本語'] ?? 0,
        英語: langMap['英語'] ?? 0,
        韓国語: langMap['韓国語'] ?? 0,
        中国語: langMap['中国語'] ?? 0,
      });
    }
  }

  const kpi: KpiSummary = {
    last30dJpy,
    prev30dJpy,
    thisMonthJpy,
    lastMonthJpy,
    prevMonthUntilSameDayJpy,
    expectedMonthEndJpy,
  };

  // プラットフォーム別（直近30日）
  const byPlatform: Record<string, number> = { dlsite: 0, fanza: 0, youtube: 0 };
  for (const r of rows) {
    byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + Number(r.revenue ?? 0);
  }

  // ブランド別（直近30日）
  const byBrand: Record<string, number> = { CAPURI: 0, BerryFeel: 0, BLsand: 0, unknown: 0 };
  for (const r of rows) {
    byBrand[r.brand] = (byBrand[r.brand] ?? 0) + Number(r.revenue ?? 0);
  }

  // 言語別（直近30日）
  const byLanguage: Record<string, number> = {};
  for (const r of rows) {
    byLanguage[r.language] = (byLanguage[r.language] ?? 0) + Number(r.revenue ?? 0);
  }

  // 日次推移（日付 × platform）
  const daily: Record<string, DailyPoint> = {};
  for (const r of rows) {
    daily[r.sale_date] ??= { date: r.sale_date, dlsite: 0, fanza: 0, youtube: 0 };
    const p = r.platform as keyof DailyPoint;
    if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
      (daily[r.sale_date][p] as number) += Number(r.revenue ?? 0);
    }
  }
  const dailySeries = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));

  // 日次×言語＆日次×brand×言語
  const dailyLang: Record<string, Record<string, number>> = {};
  const dailyBrandLang: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) {
    const lang = aggregatedLanguageLabel(r.language);
    const v = Number(r.revenue ?? 0);
    dailyLang[r.sale_date] ??= {};
    dailyLang[r.sale_date][lang] = (dailyLang[r.sale_date][lang] ?? 0) + v;

    dailyBrandLang[r.sale_date] ??= {};
    dailyBrandLang[r.sale_date][r.brand] ??= {};
    dailyBrandLang[r.sale_date][r.brand][lang] =
      (dailyBrandLang[r.sale_date][r.brand][lang] ?? 0) + v;
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

  const dailyBrandLanguageSeries: DailyBrandLanguagePoint[] = [];
  for (const date of Object.keys(dailyBrandLang).sort()) {
    for (const brand of ['CAPURI', 'BerryFeel', 'BLsand', 'unknown']) {
      const langMap = dailyBrandLang[date][brand] ?? {};
      dailyBrandLanguageSeries.push({
        date,
        brand,
        日本語: langMap['日本語'] ?? 0,
        英語: langMap['英語'] ?? 0,
        韓国語: langMap['韓国語'] ?? 0,
        中国語: langMap['中国語'] ?? 0,
      });
    }
  }

  // Top10（RPC で取得済み）
  const topWorks: TopWork[] = topWorksRpc.map((w) => ({
    work_id: w.work_id,
    title: w.title,
    slug: w.slug,
    brand: w.brand,
    revenue_jpy: Number(w.revenue),
    sales_count: Number(w.sales_count),
  }));

  return {
    kpi,
    byPlatform,
    byBrand,
    byLanguage,
    dailySeries,
    dailyLanguageSeries,
    dailyBrandLanguageSeries,
    monthlySeries,
    monthlyLanguageSeries,
    monthlyBrandLanguageSeries,
    monthlyForecastByDate: { [currentMonthKey]: forecastTailJpy },
    topWorks,
    period: { from: from30, to: today },
  };
}
