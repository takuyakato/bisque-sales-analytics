export type ForecastPlatform = 'dlsite' | 'fanza' | 'youtube';
export type ForecastBrand = 'CAPURI' | 'BerryFeel' | 'BLsand' | 'unknown';
export type ForecastLanguage = '日本語' | '英語' | '中国語' | '韓国語' | 'unknown';
export type ForecastSla = 'ok' | 'warning' | 'invalid';

export interface ForecastRow {
  sale_date: string;
  platform: ForecastPlatform;
  brand: string | null;
  language: string | null;
  revenue: number;
}

export interface ForecastCell {
  platform: ForecastPlatform;
  brand: ForecastBrand;
  language: ForecastLanguage;
  actual: number;
  rate: number;
  tail: number;
}

export interface ForecastResult {
  expectedMonthEndJpy: number | null;
  actualJpy: number;
  forecastTailJpy: number;
  forecastTailByPlatform: Record<ForecastPlatform, number>;
  forecastTailByBrand: Record<Exclude<ForecastBrand, 'unknown'>, number>;
  forecastTailByBrandLanguage: Record<
    Exclude<ForecastBrand, 'unknown'>,
    Record<Exclude<ForecastLanguage, 'unknown'>, number>
  >;
  freshness: Record<ForecastPlatform, string | null>;
  sla: Record<ForecastPlatform, ForecastSla>;
  cells: ForecastCell[];
}

const PLATFORMS: readonly ForecastPlatform[] = ['dlsite', 'fanza', 'youtube'];
const BRANDS: readonly Exclude<ForecastBrand, 'unknown'>[] = ['CAPURI', 'BerryFeel', 'BLsand'];
const LANGUAGES: readonly Exclude<ForecastLanguage, 'unknown'>[] = ['日本語', '英語', '中国語', '韓国語'];
const EXPECTED_LAG: Record<ForecastPlatform, number> = { dlsite: 1, fanza: 2, youtube: 3 };
const INVALID_AFTER_EXTRA_DAYS = 5;
const RATE_LOOKBACK_DAYS = 2;

/** 最大の正常遅延＋invalid猶予＋3日rate窓の前方2日。 */
export const FORECAST_LOOKBACK_DAYS = Math.max(...Object.values(EXPECTED_LAG))
  + INVALID_AFTER_EXTRA_DAYS
  + RATE_LOOKBACK_DAYS;

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function differenceInDays(later: string, earlier: string): number {
  return Math.round((parseDate(later).getTime() - parseDate(earlier).getTime()) / 86_400_000);
}

function normalizeBrand(value: string | null): ForecastBrand {
  return BRANDS.includes(value as Exclude<ForecastBrand, 'unknown'>)
    ? value as Exclude<ForecastBrand, 'unknown'>
    : 'unknown';
}

function normalizeLanguage(value: string | null): ForecastLanguage {
  return LANGUAGES.includes(value as Exclude<ForecastLanguage, 'unknown'>)
    ? value as Exclude<ForecastLanguage, 'unknown'>
    : 'unknown';
}

export function computeForecast(
  rows: readonly ForecastRow[],
  opts: { year: number; month: number; todayJst: string }
): ForecastResult {
  const month = String(opts.month).padStart(2, '0');
  const monthStart = `${opts.year}-${month}-01`;
  const monthEnd = formatDate(new Date(Date.UTC(opts.year, opts.month, 0)));

  const freshness: Record<ForecastPlatform, string | null> = {
    dlsite: null,
    fanza: null,
    youtube: null,
  };
  for (const platform of ['dlsite', 'fanza'] as const) {
    const dates = rows.filter((row) => row.platform === platform).map((row) => row.sale_date);
    freshness[platform] = dates.length ? dates.sort().at(-1)! : null;
  }
  const youtubeByLanguage = new Map<string, string>();
  for (const row of rows) {
    if (row.platform !== 'youtube') continue;
    const partition = row.language ?? 'unknown';
    const previous = youtubeByLanguage.get(partition);
    if (!previous || row.sale_date > previous) youtubeByLanguage.set(partition, row.sale_date);
  }
  freshness.youtube = youtubeByLanguage.size
    ? [...youtubeByLanguage.values()].sort()[0]
    : null;

  const sla = Object.fromEntries(PLATFORMS.map((platform) => {
    const cutoff = freshness[platform];
    if (!cutoff) return [platform, 'invalid'];
    const age = differenceInDays(opts.todayJst, cutoff);
    if (age > EXPECTED_LAG[platform] + INVALID_AFTER_EXTRA_DAYS) return [platform, 'invalid'];
    if (age > EXPECTED_LAG[platform] + 2) return [platform, 'warning'];
    return [platform, 'ok'];
  })) as Record<ForecastPlatform, ForecastSla>;

  const revenueByCellDate = new Map<string, number>();
  const cellDimensions = new Map<string, Pick<ForecastCell, 'platform' | 'brand' | 'language'>>();
  for (const row of rows) {
    if (!PLATFORMS.includes(row.platform)) continue;
    const brand = normalizeBrand(row.brand);
    const language = normalizeLanguage(row.language);
    const cellKey = `${row.platform}\u0000${brand}\u0000${language}`;
    cellDimensions.set(cellKey, { platform: row.platform, brand, language });
    const dateKey = `${cellKey}\u0000${row.sale_date}`;
    revenueByCellDate.set(dateKey, (revenueByCellDate.get(dateKey) ?? 0) + Number(row.revenue || 0));
  }

  const cells: ForecastCell[] = [];
  for (const [cellKey, dimensions] of cellDimensions) {
    const cutoff = freshness[dimensions.platform];
    let actual = 0;
    let rate = 0;
    let tailDays = 0;
    if (cutoff) {
      for (const row of rows) {
        if (
          row.platform === dimensions.platform
          && normalizeBrand(row.brand) === dimensions.brand
          && normalizeLanguage(row.language) === dimensions.language
          && row.sale_date >= monthStart
          && row.sale_date <= monthEnd
          && row.sale_date <= cutoff
        ) {
          actual += Number(row.revenue || 0);
        }
      }
      for (let offset = -2; offset <= 0; offset++) {
        rate += revenueByCellDate.get(`${cellKey}\u0000${addDays(cutoff, offset)}`) ?? 0;
      }
      rate /= 3;
      if (cutoff < monthStart) tailDays = Number(monthEnd.slice(8, 10));
      else if (cutoff < monthEnd) tailDays = differenceInDays(monthEnd, cutoff);
    }
    cells.push({ ...dimensions, actual, rate, tail: rate * tailDays });
  }

  const forecastTailByPlatform = { dlsite: 0, fanza: 0, youtube: 0 };
  const forecastTailByBrand = { CAPURI: 0, BerryFeel: 0, BLsand: 0 };
  const emptyLanguages = () => ({ 日本語: 0, 英語: 0, 中国語: 0, 韓国語: 0 });
  const forecastTailByBrandLanguage = {
    CAPURI: emptyLanguages(),
    BerryFeel: emptyLanguages(),
    BLsand: emptyLanguages(),
  };
  let actualJpy = 0;
  let forecastTailJpy = 0;
  for (const cell of cells) {
    actualJpy += cell.actual;
    forecastTailJpy += cell.tail;
    forecastTailByPlatform[cell.platform] += cell.tail;
    if (cell.brand !== 'unknown') {
      forecastTailByBrand[cell.brand] += cell.tail;
      if (cell.language !== 'unknown') {
        forecastTailByBrandLanguage[cell.brand][cell.language] += cell.tail;
      }
    }
  }

  const roundedActualJpy = Math.round(actualJpy);
  const roundedForecastTailJpy = Math.round(forecastTailJpy);
  const roundedForecastTailByPlatform = Object.fromEntries(
    PLATFORMS.map((platform) => [platform, Math.round(forecastTailByPlatform[platform])])
  ) as Record<ForecastPlatform, number>;
  const roundedForecastTailByBrand = Object.fromEntries(
    BRANDS.map((brand) => [brand, Math.round(forecastTailByBrand[brand])])
  ) as Record<Exclude<ForecastBrand, 'unknown'>, number>;
  const roundedForecastTailByBrandLanguage = Object.fromEntries(BRANDS.map((brand) => [
    brand,
    Object.fromEntries(LANGUAGES.map((language) => [
      language,
      Math.round(forecastTailByBrandLanguage[brand][language]),
    ])),
  ])) as ForecastResult['forecastTailByBrandLanguage'];

  return {
    expectedMonthEndJpy: Object.values(sla).includes('invalid')
      ? null
      : Math.round(actualJpy + forecastTailJpy),
    actualJpy: roundedActualJpy,
    forecastTailJpy: roundedForecastTailJpy,
    forecastTailByPlatform: roundedForecastTailByPlatform,
    forecastTailByBrand: roundedForecastTailByBrand,
    forecastTailByBrandLanguage: roundedForecastTailByBrandLanguage,
    freshness,
    sla,
    cells,
  };
}
