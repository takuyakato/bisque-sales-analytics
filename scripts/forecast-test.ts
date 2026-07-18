import assert from 'node:assert/strict';
import {
  computeForecast,
  type ForecastPlatform,
  type ForecastRow,
} from '../src/lib/queries/forecast';
import { calculateForecasts, type DailyRevenue } from './forecast-backtest';

const PLATFORMS: readonly ForecastPlatform[] = ['dlsite', 'fanza', 'youtube'];

function row(
  sale_date: string,
  platform: ForecastPlatform,
  revenue: number,
  brand = 'CAPURI',
  language = '日本語'
): ForecastRow {
  return { sale_date, platform, brand, language, revenue };
}

function completeRows(dates: readonly string[], revenue = 30): ForecastRow[] {
  return PLATFORMS.flatMap((platform) => dates.map((date) => row(date, platform, revenue)));
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}

// 1. cellsを基準に、全軸の合算が一致する。
{
  const rows = completeRows(['2026-07-13', '2026-07-14', '2026-07-15']);
  rows.push(
    row('2026-07-15', 'dlsite', 9, '未分類', '日本語'),
    row('2026-07-15', 'fanza', 6, 'CAPURI', 'その他'),
    row('2026-07-15', 'dlsite', 1, 'BerryFeel', '中国語')
  );
  const result = computeForecast(rows, { year: 2026, month: 7, todayJst: '2026-07-16' });
  const rawTail = result.cells.reduce((sum, cell) => sum + cell.tail, 0);
  const rawActual = result.cells.reduce((sum, cell) => sum + cell.actual, 0);
  assert.ok(!Number.isInteger(rawTail));
  assert.equal(result.forecastTailJpy, Math.round(rawTail));
  assert.equal(result.expectedMonthEndJpy, Math.round(rawActual + rawTail));
  for (const platform of PLATFORMS) {
    const rawPlatformTail = result.cells.filter((cell) => cell.platform === platform).reduce((sum, cell) => sum + cell.tail, 0);
    assert.equal(result.forecastTailByPlatform[platform], Math.round(rawPlatformTail));
  }
  for (const brand of ['CAPURI', 'BerryFeel', 'BLsand'] as const) {
    const rawBrandTail = result.cells.filter((cell) => cell.brand === brand).reduce((sum, cell) => sum + cell.tail, 0);
    assert.equal(result.forecastTailByBrand[brand], Math.round(rawBrandTail));
    for (const language of ['日本語', '英語', '中国語', '韓国語'] as const) {
      const rawBrandLanguageTail = result.cells
        .filter((cell) => cell.brand === brand && cell.language === language)
        .reduce((sum, cell) => sum + cell.tail, 0);
      assert.equal(result.forecastTailByBrandLanguage[brand][language], Math.round(rawBrandLanguageTail));
    }
  }
  const knownBrandTail = result.cells.filter((cell) => cell.brand !== 'unknown').reduce((sum, cell) => sum + cell.tail, 0);
  const unknownBrandTail = result.cells.filter((cell) => cell.brand === 'unknown').reduce((sum, cell) => sum + cell.tail, 0);
  close(knownBrandTail + unknownBrandTail, rawTail);
  const publishedBrandLanguage = result.cells
    .filter((cell) => cell.brand !== 'unknown' && cell.language !== 'unknown')
    .reduce((sum, cell) => sum + cell.tail, 0);
  const unpublishedLanguageOrBrand = result.cells
    .filter((cell) => cell.brand === 'unknown' || cell.language === 'unknown')
    .reduce((sum, cell) => sum + cell.tail, 0);
  close(publishedBrandLanguage + unpublishedLanguageOrBrand, rawTail);
  assert.ok([
    result.expectedMonthEndJpy,
    result.actualJpy,
    result.forecastTailJpy,
    ...Object.values(result.forecastTailByPlatform),
    ...Object.values(result.forecastTailByBrand),
    ...Object.values(result.forecastTailByBrandLanguage).flatMap(Object.values),
  ].every((value) => value === null || Number.isInteger(value)));
}

// 2. 月初に全PFの確定日が前月なら、当月実績0・当月日数分のテールになる。
{
  const result = computeForecast(completeRows(['2026-06-28', '2026-06-29', '2026-06-30'], 30), {
    year: 2026, month: 7, todayJst: '2026-07-01',
  });
  assert.equal(result.actualJpy, 0);
  close(result.forecastTailJpy, 30 * 31 * 3);
  assert.ok(result.cells.every((cell) => cell.rate === 30));
}

// 3. 疎セルは不存在日を0として3暦日で割る。
{
  const rows = completeRows(['2026-07-13', '2026-07-14', '2026-07-15'], 0);
  rows.push(row('2026-07-15', 'dlsite', 90, 'BerryFeel', '英語'));
  const result = computeForecast(rows, { year: 2026, month: 7, todayJst: '2026-07-16' });
  const sparse = result.cells.find((cell) => cell.platform === 'dlsite' && cell.brand === 'BerryFeel');
  assert.equal(sparse?.rate, 30);
  assert.equal(sparse?.tail, 480);
}

// 4. YouTubeは言語別最終日の最小を確定日とし、それより後の行を実績に含めない。
{
  const rows = completeRows(['2026-07-13', '2026-07-14', '2026-07-15'], 10);
  rows.push(
    row('2026-07-13', 'youtube', 10, 'CAPURI', '英語'),
    row('2026-07-14', 'youtube', 10, 'CAPURI', '英語'),
    row('2026-07-15', 'youtube', 10, 'CAPURI', '英語')
  );
  rows.push(row('2026-07-16', 'youtube', 100, 'CAPURI', '日本語'), row('2026-07-17', 'youtube', 100, 'CAPURI', '日本語'));
  const result = computeForecast(rows, { year: 2026, month: 7, todayJst: '2026-07-18' });
  assert.equal(result.freshness.youtube, '2026-07-15');
  assert.equal(result.cells.filter((cell) => cell.platform === 'youtube').reduce((sum, cell) => sum + cell.actual, 0), 60);
}

// 5. 確定日以下のレコード不存在日はrateを下げる。
{
  const rows = completeRows(['2026-07-13', '2026-07-15'], 30);
  const result = computeForecast(rows, { year: 2026, month: 7, todayJst: '2026-07-16' });
  assert.ok(result.cells.every((cell) => cell.rate === 20));
}

// 6. 月末確定ならテール0、総額は実績と一致する。
{
  const result = computeForecast(completeRows(['2026-07-29', '2026-07-30', '2026-07-31'], 10), {
    year: 2026, month: 7, todayJst: '2026-08-03',
  });
  assert.equal(result.forecastTailJpy, 0);
  assert.equal(result.expectedMonthEndJpy, result.actualJpy);
}

// 7. SLA境界はlag+2までok、lag+3からwarning、lag+5もwarning、lag+6からinvalid。
{
  const result = computeForecast([
    row('2026-07-08', 'dlsite', 1),
    row('2026-07-07', 'fanza', 1),
    row('2026-07-06', 'youtube', 1),
  ], { year: 2026, month: 7, todayJst: '2026-07-12' });
  assert.deepEqual(result.sla, { dlsite: 'warning', fanza: 'warning', youtube: 'warning' });
  const ok = computeForecast([
    row('2026-07-09', 'dlsite', 1),
    row('2026-07-08', 'fanza', 1),
    row('2026-07-07', 'youtube', 1),
  ], { year: 2026, month: 7, todayJst: '2026-07-11' });
  assert.deepEqual(ok.sla, { dlsite: 'ok', fanza: 'ok', youtube: 'ok' });
  const lagPlusFive = computeForecast([
    row('2026-07-06', 'dlsite', 1),
    row('2026-07-05', 'fanza', 1),
    row('2026-07-04', 'youtube', 1),
  ], { year: 2026, month: 7, todayJst: '2026-07-12' });
  assert.deepEqual(lagPlusFive.sla, { dlsite: 'warning', fanza: 'warning', youtube: 'warning' });
  const invalid = computeForecast([
    row('2026-07-05', 'dlsite', 1),
    row('2026-07-04', 'fanza', 1),
    row('2026-07-03', 'youtube', 1),
  ], { year: 2026, month: 7, todayJst: '2026-07-12' });
  assert.deepEqual(invalid.sla, { dlsite: 'invalid', fanza: 'invalid', youtube: 'invalid' });
  assert.equal(invalid.expectedMonthEndJpy, null);
  const missingPlatform = computeForecast([row('2026-07-11', 'dlsite', 1)], {
    year: 2026, month: 7, todayJst: '2026-07-12',
  });
  assert.equal(missingPlatform.sla.fanza, 'invalid');
  assert.equal(missingPlatform.freshness.fanza, null);
}

// 8. invalidでなければ総額はactualセル＋tailセルの和を最終段で丸める。
{
  const result = computeForecast(completeRows(['2026-07-13', '2026-07-14', '2026-07-15'], 12), {
    year: 2026, month: 7, todayJst: '2026-07-16',
  });
  const rawActual = result.cells.reduce((sum, cell) => sum + cell.actual, 0);
  const rawTail = result.cells.reduce((sum, cell) => sum + cell.tail, 0);
  assert.equal(result.actualJpy, Math.round(rawActual));
  assert.equal(result.forecastTailJpy, Math.round(rawTail));
  assert.equal(result.expectedMonthEndJpy, Math.round(rawActual + rawTail));
}

// 9. バックテスト方式3の実装と、PF別テールが一致する。
{
  const rows: DailyRevenue[] = [];
  for (let day = 1; day <= 10; day++) {
    const date = `2026-02-${String(day).padStart(2, '0')}`;
    rows.push(
      { sale_date: date, platform: 'dlsite', revenue: 10 },
      { sale_date: date, platform: 'fanza', revenue: 20 },
      { sale_date: date, platform: 'youtube', revenue: 30 }
    );
  }
  const backtest = calculateForecasts(rows, '2026-02-10', '2026-02');
  const visibleRows = rows.filter((candidate) => {
    const cutoff = { dlsite: '2026-02-09', fanza: '2026-02-08', youtube: '2026-02-07' }[candidate.platform];
    return candidate.sale_date <= cutoff;
  }).map((candidate) => ({ ...candidate, brand: 'CAPURI', language: '日本語' }));
  const result = computeForecast(visibleRows, { year: 2026, month: 2, todayJst: '2026-02-10' });
  for (const platform of PLATFORMS) {
    const computeTail = result.cells.filter((cell) => cell.platform === platform).reduce((sum, cell) => sum + cell.tail, 0);
    close(computeTail, backtest.method3TailByPlatform[platform]);
    assert.equal(result.forecastTailByPlatform[platform], Math.round(backtest.method3TailByPlatform[platform]));
  }
  close(backtest.method3, 1680);
}

console.log('forecast-test: 9件の不変条件テストに成功しました');
