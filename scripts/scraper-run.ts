#!/usr/bin/env tsx
/**
 * スクレイパー実行CLI（v3.6 §5-2 準拠）
 *
 * 使い方:
 *   npm run scraper:daily dlsite
 *   npm run scraper:backfill dlsite -- --from=2026-03 --to=2026-04 --unit=monthly
 *   npm run scraper:check dlsite
 */

import { readFileSync } from 'fs';
import path from 'path';
import { DlsiteScraper } from '../src/lib/scrapers/dlsite';
import { FanzaScraper } from '../src/lib/scrapers/fanza';
import { parseCsv } from '../src/lib/csv-parser/index';
import { ingestCsvRows } from '../src/lib/ingestion/csv-ingest';
import { ScraperLogger } from '../src/lib/scrapers/base/logger';
import { ScraperError } from '../src/lib/scrapers/base/errors';
import type { BaseScraper } from '../src/lib/scrapers/base/scraper';

// .env.local を読む（ローカル実行時）
try {
  const envText = readFileSync(path.resolve('.env.local'), 'utf8');
  envText.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch {
  // GitHub Actions 等で env が既に注入されている場合
}

type Mode = 'daily' | 'backfill' | 'check';
type Platform = 'dlsite' | 'fanza';

interface Args {
  mode: Mode;
  platform: Platform;
  from?: string;  // YYYY-MM (backfill) or YYYY-MM-DD (single)
  to?: string;
  unit?: 'daily' | 'monthly';
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const mode = argv[0] as Mode;
  const platform = argv[1] as Platform;
  if (!['daily', 'backfill', 'check'].includes(mode)) throw new Error(`invalid mode: ${mode}`);
  if (!['dlsite', 'fanza'].includes(platform)) throw new Error(`invalid platform: ${platform}`);

  const flags: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([a-z]+)=(.+)$/);
    if (m) flags[m[1]] = m[2];
  }
  return {
    mode,
    platform,
    from: flags.from,
    to: flags.to,
    unit: (flags.unit as Args['unit']) ?? 'monthly',
  };
}

function yesterdayJst(): { from: string; to: string } {
  // JST の前日（UTCで 15:00 以降は JST が翌日）
  const now = new Date(Date.now() - 9 * 60 * 60 * 1000 * 1 /* just use naive: */);
  const nowJst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const yest = new Date(nowJst);
  yest.setDate(yest.getDate() - 1);
  const iso = yest.toISOString().slice(0, 10);
  return { from: iso, to: iso };
  void now;
}

function* monthRange(from: string, to: string): Generator<{ from: string; to: string }> {
  // 'YYYY-MM' → 月ごとに [月初日, 月末日] を yield
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDate = new Date(y, m, 0).getDate();
    const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    yield { from: firstDay, to: lastDay };
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

interface ScraperConstructor {
  new (debug?: boolean): BaseScraper & {
    fetchSalesCsv: (from: string, to: string) => Promise<Buffer>;
  };
  VERSION: string;
}

function getScraperClass(platform: Platform): ScraperConstructor {
  switch (platform) {
    case 'dlsite':
      return DlsiteScraper as unknown as ScraperConstructor;
    case 'fanza':
      return FanzaScraper as unknown as ScraperConstructor;
    default:
      throw new Error(`unsupported platform: ${platform}`);
  }
}

async function runScrapeOnce(platform: Platform, from: string, to: string, version: string) {
  const ScraperClass = getScraperClass(platform);
  const scraper = new ScraperClass();
  const logger = new ScraperLogger(
    platform,
    process.env.GITHUB_ACTIONS ? 'github-actions' : 'manual',
    version
  );
  let screenshotPath: string | undefined;
  let errorMessage: string | undefined;
  const counts = { inserted: 0, updated: 0, skipped: 0 };
  let status: 'success' | 'partial' | 'failed' = 'success';

  try {
    await scraper.launch();
    await logger.start(from, to);
    logger.step('login-ensure');
    await scraper.ensureLoggedIn();

    logger.step('fetch-csv', { from, to });
    const csvBuffer = await scraper.fetchSalesCsv(from, to);

    logger.step('parse-csv', { size: csvBuffer.byteLength });
    const parsed = parseCsv({
      buffer: csvBuffer,
      filename: `${platform}_${from}_${to}.csv`,
      platform,
      periodOverride: { from, to },
    });
    logger.step('parse-done', { rows: parsed.rows.length, skipped: parsed.skipped });

    const ingestResult = await ingestCsvRows({
      platform,
      rows: parsed.rows,
      periodFrom: from,
      periodTo: to,
      source: 'scrape',
      runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'manual',
    });
    counts.inserted += ingestResult.inserted;
    counts.updated += ingestResult.updated;
    counts.skipped += ingestResult.skipped;
    if (ingestResult.status !== 'success') status = ingestResult.status;
    if (ingestResult.error_message) errorMessage = ingestResult.error_message;

    logger.step('ingest-done', { ...ingestResult });
  } catch (e) {
    status = 'failed';
    const kind = e instanceof ScraperError ? e.kind : 'unknown';
    errorMessage = e instanceof Error ? `[${kind}] ${e.message}` : String(e);
    logger.step('error', { message: errorMessage });
    screenshotPath = await scraper.captureErrorScreenshot('scrape-failed').catch(() => undefined);
  } finally {
    await logger.finish(status, counts, errorMessage, screenshotPath);
    await scraper.close();
  }

  return { status, counts, errorMessage, screenshotPath };
}

async function main() {
  const args = parseArgs();
  const ScraperClass = getScraperClass(args.platform);
  const version = ScraperClass.VERSION;

  if (args.mode === 'check') {
    console.log(`=== scraper:check ${args.platform} (v${version}) ===`);
    const scraper = new ScraperClass();
    try {
      await scraper.launch();
      await scraper.ensureLoggedIn();
      console.log('✅ ログイン成功');
    } catch (e) {
      console.error('❌ ログイン失敗:', e instanceof Error ? e.message : e);
      const p = await scraper.captureErrorScreenshot('check-failed').catch(() => undefined);
      if (p) console.error('   screenshot:', p);
      process.exitCode = 1;
    } finally {
      await scraper.close();
    }
    return;
  }

  if (args.mode === 'daily') {
    const { from, to } = yesterdayJst();
    console.log(`=== scraper:daily ${args.platform} (${from}) v${version} ===`);
    const r = await runScrapeOnce(args.platform, from, to, version);
    console.log('結果:', r);
    if (r.status === 'failed') process.exitCode = 1;
    return;
  }

  if (args.mode === 'backfill') {
    if (!args.from || !args.to) throw new Error('backfill には --from=YYYY-MM --to=YYYY-MM が必須');
    console.log(`=== scraper:backfill ${args.platform} ${args.from}..${args.to} unit=${args.unit} v${version} ===`);
    if (args.unit === 'monthly') {
      for (const range of monthRange(args.from, args.to)) {
        console.log(`\n→ ${range.from} 〜 ${range.to}`);
        const r = await runScrapeOnce(args.platform, range.from, range.to, version);
        console.log('  結果:', r.status, r.counts);
        await new Promise((res) => setTimeout(res, 1500));
      }
    } else {
      const [fy, fm] = args.from.split('-').map(Number);
      const [ty, tm] = args.to.split('-').map(Number);
      const startDate = new Date(fy, fm - 1, 1);
      const endDate = new Date(ty, tm, 0);
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        console.log(`\n→ ${iso}`);
        const r = await runScrapeOnce(args.platform, iso, iso, version);
        console.log('  結果:', r.status, r.counts);
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
