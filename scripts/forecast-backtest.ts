/**
 * 着地見込み4方式のバックテスト。
 *
 * 過去時点の暫定値から確定値への変動は再現できないため、シミュレーション日 D に
 * 見えていたデータを「sale_date <= D - プラットフォーム別確定ラグ」の行で近似する。
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Platform = 'dlsite' | 'fanza' | 'youtube';
type Method = 'method1' | 'method2' | 'method3' | 'method4';
type Phase = '1〜5日' | '6〜15日' | '16日〜月末';

export type DailyRevenue = {
  sale_date: string;
  platform: Platform;
  revenue: number;
};

type Forecasts = Record<Method, number>;

export type ForecastCalculation = Forecasts & {
  method3TailByPlatform: Record<Platform, number>;
};

type RawResult = {
  date: string;
  month: string;
  phase: Phase;
  actual: number;
  forecasts: Forecasts;
};

type MetricSet = {
  signedMeanErrorRate: number;
  maeRate: number;
  dailyChangeRate: number;
};

const PLATFORMS: readonly Platform[] = ['dlsite', 'fanza', 'youtube'];
const METHODS: readonly Method[] = ['method1', 'method2', 'method3', 'method4'];
const METHOD_LABELS: Record<Method, string> = {
  method1: '方式1（現行）',
  method2: '方式2（共通打ち切り）',
  method3: '方式3（PF別窓）',
  method4: '方式4（共通窓＋PF別実績）',
};
const LAG: Record<Platform, number> = { dlsite: 1, fanza: 2, youtube: 3 };
const TARGET_MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'output/forecast-backtest-raw.json'
);

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number): string {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return formatDate(value);
}

function dayDifference(later: string, earlier: string): number {
  return Math.round((parseDate(later).getTime() - parseDate(earlier).getTime()) / 86_400_000);
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, monthNumber, 0)));
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function phaseOf(date: string): Phase {
  const day = Number(date.slice(8, 10));
  if (day <= 5) return '1〜5日';
  if (day <= 15) return '6〜15日';
  return '16日〜月末';
}

function createRevenueIndex(rows: readonly DailyRevenue[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.platform}:${row.sale_date}`;
    index.set(key, (index.get(key) ?? 0) + row.revenue);
  }
  return index;
}

function revenueOn(index: ReadonlyMap<string, number>, platform: Platform, date: string): number {
  return index.get(`${platform}:${date}`) ?? 0;
}

function sumRange(
  index: ReadonlyMap<string, number>,
  platforms: readonly Platform[],
  start: string,
  end: string
): number {
  if (end < start) return 0;
  let total = 0;
  for (const date of dateRange(start, end)) {
    for (const platform of platforms) total += revenueOn(index, platform, date);
  }
  return total;
}

/** DBに依存しない、4方式の見込み計算。 */
export function calculateForecasts(
  rows: readonly DailyRevenue[],
  simulationDate: string,
  targetMonth: string
): ForecastCalculation {
  const index = createRevenueIndex(rows);
  const start = `${targetMonth}-01`;
  const end = monthEnd(targetMonth);
  const cutoffs = Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform,
      addDays(simulationDate, -LAG[platform]) < end ? addDays(simulationDate, -LAG[platform]) : end,
    ])
  ) as Record<Platform, string>;
  const commonCutoff = PLATFORMS.map((platform) => cutoffs[platform]).sort()[0];

  // 方式1: dashboard.ts の存在日ベース（ゼロ埋めなし）と丸めを再現する。
  const visibleByDate = new Map<string, number>();
  for (const row of rows) {
    if (row.sale_date <= cutoffs[row.platform]) {
      visibleByDate.set(row.sale_date, (visibleByDate.get(row.sale_date) ?? 0) + row.revenue);
    }
  }
  const existingDates = [...visibleByDate.keys()].sort();
  const lastThreeExistingDates = existingDates.slice(-3);
  const existingDateAverage = lastThreeExistingDates.length === 0
    ? 0
    : lastThreeExistingDates.reduce((sum, date) => sum + (visibleByDate.get(date) ?? 0), 0)
      / lastThreeExistingDates.length;
  const lastExistingDate = existingDates.at(-1) ?? null;
  const method1Remaining = lastExistingDate && lastExistingDate >= start
    ? dayDifference(end, lastExistingDate)
    : Number(end.slice(8, 10));
  const method1Actual = PLATFORMS.reduce(
    (sum, platform) => sum + sumRange(index, [platform], start, cutoffs[platform]),
    0
  );
  const method1 = method1Actual + Math.round(existingDateAverage * method1Remaining);

  const commonWindowStart = addDays(commonCutoff, -2);
  const commonActual = sumRange(index, PLATFORMS, start, commonCutoff);
  const commonRate = sumRange(index, PLATFORMS, commonWindowStart, commonCutoff) / 3;
  const method2 = commonActual + commonRate * dayDifference(end, commonCutoff);

  let method3 = 0;
  let method4 = 0;
  const method3TailByPlatform = { dlsite: 0, fanza: 0, youtube: 0 };
  for (const platform of PLATFORMS) {
    const cutoff = cutoffs[platform];
    const actual = sumRange(index, [platform], start, cutoff);
    const remaining = dayDifference(end, cutoff);
    const platformRate = sumRange(index, [platform], addDays(cutoff, -2), cutoff) / 3;
    const commonPlatformRate = sumRange(index, [platform], commonWindowStart, commonCutoff) / 3;
    method3TailByPlatform[platform] = platformRate * remaining;
    method3 += actual + method3TailByPlatform[platform];
    method4 += actual + commonPlatformRate * remaining;
  }

  return { method1, method2, method3, method4, method3TailByPlatform };
}

function runBacktest(rows: readonly DailyRevenue[], months: readonly string[]): RawResult[] {
  const index = createRevenueIndex(rows);
  const results: RawResult[] = [];
  for (const month of months) {
    const start = `${month}-01`;
    const end = monthEnd(month);
    const actual = sumRange(index, PLATFORMS, start, end);
    if (actual <= 0) throw new Error(`${month} の正解値が0以下のため、誤差率を計算できません`);
    for (const date of dateRange(start, end)) {
      results.push({
        date,
        month,
        phase: phaseOf(date),
        actual,
        forecasts: calculateForecasts(rows, date, month),
      });
    }
  }
  return results;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregate(
  results: readonly RawResult[],
  allResults: readonly RawResult[] = results
): Record<Method, MetricSet> {
  return Object.fromEntries(METHODS.map((method) => {
    const signedErrors = results.map((row) => (row.forecasts[method] - row.actual) / row.actual);
    const changes: number[] = [];
    for (const row of results) {
      const previous = allResults.find(
        (candidate) => candidate.month === row.month && candidate.date === addDays(row.date, -1)
      );
      if (previous) changes.push(Math.abs(row.forecasts[method] - previous.forecasts[method]) / row.actual);
    }
    return [method, {
      signedMeanErrorRate: mean(signedErrors),
      maeRate: mean(signedErrors.map(Math.abs)),
      dailyChangeRate: mean(changes),
    }];
  })) as Record<Method, MetricSet>;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function printTable(
  title: string,
  results: readonly RawResult[],
  allResults: readonly RawResult[] = results
): void {
  const metrics = aggregate(results, allResults);
  console.log(`\n### ${title}\n`);
  console.log('| 方式 | 符号付き平均誤差率 | MAE率 | 日次変動率 |');
  console.log('|---|---:|---:|---:|');
  for (const method of METHODS) {
    const value = metrics[method];
    console.log(
      `| ${METHOD_LABELS[method]} | ${percent(value.signedMeanErrorRate)} | ${percent(value.maeRate)} | ${percent(value.dailyChangeRate)} |`
    );
  }
}

function printReport(results: readonly RawResult[]): void {
  console.log('# 着地見込み方式バックテスト');
  printTable('全期間', results);
  for (const phase of ['1〜5日', '6〜15日', '16日〜月末'] as const) {
    printTable(`フェーズ: ${phase}`, results.filter((row) => row.phase === phase), results);
  }
  for (const month of [...new Set(results.map((row) => row.month))]) {
    printTable(`月別: ${month}`, results.filter((row) => row.month === month));
  }
}

function fixtureRows(): DailyRevenue[] {
  const rows: DailyRevenue[] = [];
  for (const date of dateRange('2026-01-01', '2026-02-28')) {
    rows.push(
      { sale_date: date, platform: 'dlsite', revenue: 10 },
      { sale_date: date, platform: 'fanza', revenue: 20 },
      { sale_date: date, platform: 'youtube', revenue: 30 }
    );
  }
  return rows;
}

function runFixture(): RawResult[] {
  const rows = fixtureRows();
  const forecasts = calculateForecasts(rows, '2026-02-10', '2026-02');
  // 2/10時点: cutoffは順に2/9, 2/8, 2/7。月合計の正解値は 60×28=1680。
  // 方式1は実績460 + round((60+30+10)/3 × 19日) = 1093。
  assert.equal(forecasts.method1, 1093);
  assert.equal(forecasts.method2, 1680);
  assert.equal(forecasts.method3, 1680);
  assert.equal(forecasts.method4, 1680);
  const results = runBacktest(rows, ['2026-02']);
  assert.equal(results.length, 28);
  assert.equal(results[0].actual, 1680);
  assert.ok(METHODS.every((method) => Number.isFinite(results[0].forecasts[method])));
  console.log('fixture: 全方式の期待値assertに成功しました');
  return results;
}

function loadEnvLocal(): void {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function fetchRows(): Promise<DailyRevenue[]> {
  loadEnvLocal();
  const { createServiceClient } = await import('../src/lib/supabase/service');
  const supabase = createServiceClient();
  const pageSize = 1000;
  const rawRows: Array<{ sale_date: string; platform: string; revenue_jpy: number | null }> = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('sales_unified_daily')
      .select('sale_date, platform, revenue_jpy')
      .gte('sale_date', '2026-01-01')
      .lte('sale_date', '2026-06-30')
      .order('sale_date', { ascending: true })
      .order('platform', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`sales_unified_daily取得失敗: ${error.message}`);
    rawRows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const aggregated = new Map<string, DailyRevenue>();
  for (const row of rawRows) {
    if (!PLATFORMS.includes(row.platform as Platform)) continue;
    const platform = row.platform as Platform;
    const key = `${platform}:${row.sale_date}`;
    const current = aggregated.get(key);
    aggregated.set(key, {
      sale_date: row.sale_date,
      platform,
      revenue: (current?.revenue ?? 0) + Number(row.revenue_jpy ?? 0),
    });
  }
  return [...aggregated.values()];
}

async function saveRawResults(results: readonly RawResult[]): Promise<void> {
  const rawRows = results.flatMap((row) => METHODS.map((method) => ({
    date: row.date,
    month: row.month,
    phase: row.phase,
    method,
    forecast: row.forecasts[method],
    actual: row.actual,
  })));
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(rawRows, null, 2)}\n`, 'utf8');
  console.log(`\n生データ: ${OUTPUT_PATH}`);
}

async function main(): Promise<void> {
  const fixture = process.argv.includes('--fixture');
  const results = fixture ? runFixture() : runBacktest(await fetchRows(), TARGET_MONTHS);
  printReport(results);
  await saveRawResults(results);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
