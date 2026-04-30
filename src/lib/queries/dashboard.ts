import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { aggregatedLanguageLabel } from '@/lib/utils/language-label';
import {
  jstToday, jstYmd,
  addDays,
  monthStartOf, monthEndOf,
  offsetMonth, daysInMonthOf,
} from '@/lib/utils/jst-date';

/**
 * ダッシュボード系の集計クエリを 4 セクションに分割
 *
 * 各セクション関数は独立して呼び出し可能で、page.tsx 側で <Suspense> による
 * ストリーミングレンダリングに使う。
 *
 * 共通データ（前月以降の breakdown 行）は React.cache で 1 リクエスト内 dedup、
 * unstable_cache でクロスリクエスト 10 分キャッシュ。
 *
 * 全ての日付計算は JST 基準（jst-date util 経由）。
 */

function getDateRanges() {
  const today = jstToday();
  const { year, month, day } = jstYmd();
  const monthStart = monthStartOf(year, month);
  const prevM = offsetMonth(year, month, -1);
  const lastMonthStart = monthStartOf(prevM.year, prevM.month);
  const lastMonthEnd = monthEndOf(prevM.year, prevM.month);
  const startM = offsetMonth(year, month, -23);
  const monthlyChartStart = monthStartOf(startM.year, startM.month);
  const from30 = addDays(today, -30);
  const from60 = addDays(today, -60);
  // 前月同日（前月の最終日を超えないように clamp）
  const clampedDay = Math.min(day, daysInMonthOf(prevM.year, prevM.month));
  const lastMonthSameDay = `${prevM.year}-${String(prevM.month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  return {
    today, year, month, day,
    from30, from60,
    monthStart, monthlyChartStart,
    lastMonthStart, lastMonthEnd, lastMonthSameDay,
  };
}

// ============================================================
// 共通：前月以降の breakdown 行
//   KPI セクションと月次チャートセクションの両方が利用
// ============================================================
type MonthRangeRow = {
  sale_date: string;
  brand: string;
  platform: string;
  language: string;
  revenue: number | null;
};

export const getMonthRangeRows = cache(() =>
  _monthRangeCached(new Date().toISOString().slice(0, 10))
);

const _monthRangeCached = unstable_cache(
  async (_today: string): Promise<MonthRangeRow[]> => {
    const supabase = createServiceClient();
    const { lastMonthStart, today } = getDateRanges();
    const { data, error } = await supabase
      .from('daily_breakdown_summary')
      .select('sale_date, brand, platform, language, revenue')
      .gte('sale_date', lastMonthStart)
      .lte('sale_date', today);
    if (error) throw new Error(`getMonthRangeRows: ${error.message}`);
    return (data ?? []) as MonthRangeRow[];
  },
  ['month-range-rows', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

// ============================================================
// 1. KPI セクション
// ============================================================
export interface KpiData {
  last30dJpy: number;
  prev30dJpy: number;
  thisMonthJpy: number;
  lastMonthJpy: number;
  prevMonthUntilSameDayJpy: number;
  expectedMonthEndJpy: number;
  period: { from: string; to: string };
}

export const getKpiData = cache(() =>
  _kpiCached(new Date().toISOString().slice(0, 10))
);

const _kpiCached = unstable_cache(
  async (_today: string): Promise<KpiData> => {
    const supabase = createServiceClient();
    const {
      from30, from60, today, monthStart,
      lastMonthStart, lastMonthEnd, lastMonthSameDay, year, month,
    } = getDateRanges();

    const [last30Res, prev30Res, monthRangeRows] = await Promise.all([
      supabase
        .from('daily_breakdown_summary')
        .select('revenue')
        .gte('sale_date', from30)
        .lte('sale_date', today),
      supabase
        .from('daily_breakdown_summary')
        .select('revenue')
        .gte('sale_date', from60)
        .lt('sale_date', from30),
      getMonthRangeRows(),
    ]);

    if (last30Res.error) throw new Error(`KPI last30 fetch: ${last30Res.error.message}`);
    if (prev30Res.error) throw new Error(`KPI prev30 fetch: ${prev30Res.error.message}`);

    const last30dJpy = (last30Res.data ?? []).reduce(
      (a, r) => a + Number(r.revenue ?? 0),
      0
    );
    const prev30dJpy = (prev30Res.data ?? []).reduce(
      (a, r) => a + Number(r.revenue ?? 0),
      0
    );

    let thisMonthJpy = 0;
    let lastMonthJpy = 0;
    let prevMonthUntilSameDayJpy = 0;
    const dailyRevenue: Record<string, number> = {};
    for (const r of monthRangeRows) {
      const v = Number(r.revenue ?? 0);
      dailyRevenue[r.sale_date] = (dailyRevenue[r.sale_date] ?? 0) + v;
      if (r.sale_date >= monthStart) thisMonthJpy += v;
      if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthEnd) lastMonthJpy += v;
      if (r.sale_date >= lastMonthStart && r.sale_date <= lastMonthSameDay) {
        prevMonthUntilSameDayJpy += v;
      }
    }

    const datesWithData = Object.keys(dailyRevenue).sort();
    const last3 = datesWithData.slice(-3);
    const past3DaysAvg = last3.length
      ? last3.reduce((a, d) => a + (dailyRevenue[d] ?? 0), 0) / last3.length
      : 0;
    const lastDataDate = datesWithData.length
      ? datesWithData[datesWithData.length - 1]
      : null;
    const daysInThisMonth = daysInMonthOf(year, month);
    let daysRemaining = daysInThisMonth;
    if (lastDataDate && lastDataDate >= monthStart) {
      daysRemaining = daysInThisMonth - Number(lastDataDate.slice(8, 10));
    }
    const expectedMonthEndJpy =
      thisMonthJpy + Math.round(past3DaysAvg * daysRemaining);

    return {
      last30dJpy,
      prev30dJpy,
      thisMonthJpy,
      lastMonthJpy,
      prevMonthUntilSameDayJpy,
      expectedMonthEndJpy,
      period: { from: from30, to: today },
    };
  },
  ['kpi-data', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

// ============================================================
// 2. 直近30日チャートセクション
// ============================================================
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

export interface DailyChartData {
  dailySeries: DailyPoint[];
  dailyBrandLanguageSeries: DailyBrandLanguagePoint[];
  byPlatform: { dlsite: number; fanza: number; youtube: number };
  byBrand: Record<string, number>;
  byLanguage: Record<string, number>;
}

export const getDailyChartData = cache(() =>
  _dailyChartCached(new Date().toISOString().slice(0, 10))
);

const _dailyChartCached = unstable_cache(
  async (_today: string): Promise<DailyChartData> => {
    const supabase = createServiceClient();
    const { from30, today } = getDateRanges();

    const { data, error } = await supabase
      .from('daily_breakdown_summary')
      .select('sale_date, brand, platform, language, revenue, sales_count')
      .gte('sale_date', from30)
      .lte('sale_date', today);

    if (error) throw new Error(`Daily chart fetch: ${error.message}`);

    const rows = (data ?? []) as Array<{
      sale_date: string;
      brand: string;
      platform: string;
      language: string;
      revenue: number | null;
      sales_count: number | null;
    }>;

    const byPlatform = { dlsite: 0, fanza: 0, youtube: 0 };
    const byBrand: Record<string, number> = {
      CAPURI: 0,
      BerryFeel: 0,
      BLsand: 0,
      unknown: 0,
    };
    const byLanguage: Record<string, number> = {};
    const daily: Record<string, DailyPoint> = {};
    const dailyBrandLang: Record<
      string,
      Record<string, Record<string, number>>
    > = {};

    for (const r of rows) {
      const v = Number(r.revenue ?? 0);
      const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
      if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
        byPlatform[p] += v;
      }
      byBrand[r.brand] = (byBrand[r.brand] ?? 0) + v;
      byLanguage[r.language] = (byLanguage[r.language] ?? 0) + v;

      daily[r.sale_date] ??= {
        date: r.sale_date,
        dlsite: 0,
        fanza: 0,
        youtube: 0,
      };
      if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
        (daily[r.sale_date][p] as number) += v;
      }

      const lang = aggregatedLanguageLabel(r.language);
      dailyBrandLang[r.sale_date] ??= {};
      dailyBrandLang[r.sale_date][r.brand] ??= {};
      dailyBrandLang[r.sale_date][r.brand][lang] =
        (dailyBrandLang[r.sale_date][r.brand][lang] ?? 0) + v;
    }

    const dailySeries = Object.values(daily).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
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

    return {
      dailySeries,
      dailyBrandLanguageSeries,
      byPlatform,
      byBrand,
      byLanguage,
    };
  },
  ['daily-chart-data', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

// ============================================================
// 3. 月次チャートセクション
// ============================================================
export interface MonthlyPlatformPoint {
  date: string;
  dlsite: number;
  fanza: number;
  youtube: number;
  forecast: number;
}

export interface MonthlyLanguagePoint {
  date: string;
  日本語: number;
  英語: number;
  中国語: number;
  韓国語: number;
  forecast: number;
}

export interface MonthlyChartData {
  monthlySeries: MonthlyPlatformPoint[];
  monthlyLanguageSeries: MonthlyLanguagePoint[];
  monthlyBrandLanguageSeries: DailyBrandLanguagePoint[];
  monthlyForecastByDate: Record<string, number>;
}

export const getMonthlyChartData = cache(() =>
  _monthlyChartCached(new Date().toISOString().slice(0, 10))
);

const _monthlyChartCached = unstable_cache(
  async (_today: string): Promise<MonthlyChartData> => {
    const supabase = createServiceClient();
    const { monthlyChartStart, monthStart, year, month } = getDateRanges();

    const [platRes, langRes, brandLangRes, monthRangeRows] = await Promise.all([
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
      getMonthRangeRows(),
    ]);

    if (platRes.error) throw new Error(`Monthly platform fetch: ${platRes.error.message}`);
    if (langRes.error) throw new Error(`Monthly language fetch: ${langRes.error.message}`);
    if (brandLangRes.error) throw new Error(`Monthly brand-language fetch: ${brandLangRes.error.message}`);

    const monthlyByPlatform = new Map<
      string,
      { dlsite: number; fanza: number; youtube: number }
    >();
    for (const r of (platRes.data ?? []) as Array<{
      year_month: string;
      platform: string;
      revenue: number | null;
    }>) {
      const e = monthlyByPlatform.get(r.year_month) ?? {
        dlsite: 0,
        fanza: 0,
        youtube: 0,
      };
      const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
      if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
        e[p] += Number(r.revenue ?? 0);
      }
      monthlyByPlatform.set(r.year_month, e);
    }

    const monthlyByLanguage = new Map<
      string,
      { 日本語: number; 英語: number; 中国語: number; 韓国語: number }
    >();
    for (const r of (langRes.data ?? []) as Array<{
      year_month: string;
      language: string;
      revenue: number | null;
    }>) {
      const e =
        monthlyByLanguage.get(r.year_month) ??
        { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
      const lang = aggregatedLanguageLabel(r.language as string);
      if (lang === '日本語' || lang === '英語' || lang === '中国語' || lang === '韓国語') {
        e[lang] += Number(r.revenue ?? 0);
      }
      monthlyByLanguage.set(r.year_month, e);
    }

    const monthlyBrandLang = new Map<
      string,
      Record<string, Record<string, number>>
    >();
    for (const r of (brandLangRes.data ?? []) as Array<{
      year_month: string;
      brand: string;
      language: string;
      revenue: number | null;
    }>) {
      const lang = aggregatedLanguageLabel(r.language);
      if (lang !== '日本語' && lang !== '英語' && lang !== '中国語' && lang !== '韓国語') continue;
      const e = monthlyBrandLang.get(r.year_month) ?? {};
      e[r.brand] ??= {};
      e[r.brand][lang] = (e[r.brand][lang] ?? 0) + Number(r.revenue ?? 0);
      monthlyBrandLang.set(r.year_month, e);
    }

    const currentMonthPlatform = { dlsite: 0, fanza: 0, youtube: 0 };
    const currentMonthLanguage = { 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 };
    const currentMonthBrandLang: Record<string, Record<string, number>> = {};
    const dailyRevenue: Record<string, number> = {};
    for (const r of monthRangeRows) {
      const v = Number(r.revenue ?? 0);
      dailyRevenue[r.sale_date] = (dailyRevenue[r.sale_date] ?? 0) + v;
      if (r.sale_date >= monthStart) {
        const p = r.platform as 'dlsite' | 'fanza' | 'youtube';
        if (p === 'dlsite' || p === 'fanza' || p === 'youtube') {
          currentMonthPlatform[p] += v;
        }
        const lang = aggregatedLanguageLabel(r.language);
        if (lang === '日本語' || lang === '英語' || lang === '中国語' || lang === '韓国語') {
          currentMonthLanguage[lang] += v;
          currentMonthBrandLang[r.brand] ??= {};
          currentMonthBrandLang[r.brand][lang] =
            (currentMonthBrandLang[r.brand][lang] ?? 0) + v;
        }
      }
    }

    const datesWithData = Object.keys(dailyRevenue).sort();
    const last3 = datesWithData.slice(-3);
    const past3DaysAvg = last3.length
      ? last3.reduce((a, d) => a + (dailyRevenue[d] ?? 0), 0) / last3.length
      : 0;
    const lastDataDate = datesWithData.length
      ? datesWithData[datesWithData.length - 1]
      : null;
    const daysInThisMonth = daysInMonthOf(year, month);
    let daysRemaining = daysInThisMonth;
    if (lastDataDate && lastDataDate >= monthStart) {
      daysRemaining = daysInThisMonth - Number(lastDataDate.slice(8, 10));
    }
    const forecastTailJpy = Math.round(past3DaysAvg * daysRemaining);

    const currentMonthKey = monthStart.slice(0, 7);
    monthlyByPlatform.set(currentMonthKey, currentMonthPlatform);
    monthlyByLanguage.set(currentMonthKey, currentMonthLanguage);
    monthlyBrandLang.set(currentMonthKey, currentMonthBrandLang);

    const monthlySeries: MonthlyPlatformPoint[] = Array.from(
      monthlyByPlatform.entries()
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24)
      .map(([date, e]) => ({
        date,
        dlsite: e.dlsite,
        fanza: e.fanza,
        youtube: e.youtube,
        forecast: date === currentMonthKey ? forecastTailJpy : 0,
      }));

    const monthlyLanguageSeries: MonthlyLanguagePoint[] = Array.from(
      monthlyByLanguage.entries()
    )
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
      const e = monthlyBrandLang.get(date) ?? {};
      for (const brand of ['CAPURI', 'BerryFeel', 'BLsand', 'unknown']) {
        const langMap = e[brand] ?? {};
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

    return {
      monthlySeries,
      monthlyLanguageSeries,
      monthlyBrandLanguageSeries,
      monthlyForecastByDate: { [currentMonthKey]: forecastTailJpy },
    };
  },
  ['monthly-chart-data', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);

// ============================================================
// 4. Top10 セクション
// ============================================================
export interface TopWork {
  work_id: string;
  brand: string;
  title: string;
  slug: string | null;
  revenue_jpy: number;
  sales_count: number;
}

export const getTopWorks = cache(() =>
  _topWorksCached(new Date().toISOString().slice(0, 10))
);

const _topWorksCached = unstable_cache(
  async (_today: string): Promise<TopWork[]> => {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_top_works_d30', { top_n: 10 });
    if (error) throw new Error(`get_top_works_d30 RPC: ${error.message}`);
    return ((data ?? []) as Array<{
      work_id: string;
      title: string;
      slug: string | null;
      brand: string;
      revenue: number | string;
      sales_count: number | string;
    }>).map((w) => ({
      work_id: w.work_id,
      title: w.title,
      slug: w.slug,
      brand: w.brand,
      revenue_jpy: Number(w.revenue),
      sales_count: Number(w.sales_count),
    }));
  },
  ['top-works-d30', 'v1'],
  { revalidate: 600, tags: ['sales-data'] }
);
