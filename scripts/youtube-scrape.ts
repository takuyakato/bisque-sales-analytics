#!/usr/bin/env tsx
/**
 * YouTube 日次取込CLI
 *
 * 使い方:
 *   npx tsx scripts/youtube-scrape.ts jp --from=2026-04-14 --to=2026-04-20
 *   npx tsx scripts/youtube-scrape.ts jp --days=7                    # 直近7日
 *   npx tsx scripts/youtube-scrape.ts all --days=7                   # jp + en 両方
 */
import { readFileSync, existsSync } from 'fs';
// ローカル実行時のみ .env.local を読む。GitHub Actions 等では Secrets が既に注入されている
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { YoutubeScraper, type YoutubeChannelLabel } from '../src/lib/scrapers/youtube';
import { ingestYoutubeMetrics } from '../src/lib/ingestion/youtube-ingest';

function todayJst(): string {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

function analyticsSettledCutoff(): string {
  // YouTube Analytics は日次値の確定に2〜3日かかるため、3日分まるごと経過した日までを検証対象にする
  return addDays(todayJst(), -4);
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(3)) {
    const m = a.match(/^--([a-z]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

/**
 * 期間が長い場合は 15日ずつ（--chunk-days）に分割してAnalyticsの10000行制限を回避
 */
function* dateChunks(from: string, to: string, chunkDays: number): Generator<{ from: string; to: string }> {
  const start = parseDate(from);
  const end = parseDate(to);
  let cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    yield { from: formatDate(cur), to: formatDate(chunkEnd) };
    cur = new Date(chunkEnd);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

function assertSettledDatesHaveMetrics(from: string, to: string, metrics: { metric_date: string }[]) {
  const cutoff = analyticsSettledCutoff();
  const settledDays = daysBetween(from, to).filter((d) => d <= cutoff);
  if (settledDays.length === 0) return;

  const datesWithMetrics = new Set(metrics.map((m) => m.metric_date));
  const missing = settledDays.filter((d) => !datesWithMetrics.has(d));
  if (missing.length === settledDays.length) {
    throw new Error(
      `YouTube Analytics の確定済み日付でメトリクスが0件です ` +
      `(missing=${missing.join(',')}, settled_cutoff=${cutoff})`
    );
  }
}

async function runOne(label: YoutubeChannelLabel, from: string, to: string, chunkDays: number) {
  console.log(`\n=== YouTube ${label} ${from} 〜 ${to} (chunk=${chunkDays}日) ===`);
  const scraper = new YoutubeScraper(label);
  await scraper.init();
  console.log(`Channel: ${scraper.getChannelName()}`);

  const videos = await scraper.fetchVideos(2000);
  console.log(`動画数: ${videos.length}`);
  if (videos.length === 0) {
    console.log('動画なし、スキップ');
    return;
  }
  const videoIds = videos.map((v) => v.video_id);

  const chunks = Array.from(dateChunks(from, to, chunkDays));
  console.log(`チャンク数: ${chunks.length}`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let failedChunks = 0;
  const started = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    try {
      const metrics = await scraper.fetchDailyMetrics(c.from, c.to, videoIds);
      assertSettledDatesHaveMetrics(c.from, c.to, metrics);
      const result = await ingestYoutubeMetrics({
        channelLabel: label,
        videos,
        metrics,
        periodFrom: c.from,
        periodTo: c.to,
        runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'manual',
      });
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      if (result.status !== 'success') {
        throw new Error(
          `取込ステータスが ${result.status} です ` +
          `(skipped=${result.skipped}, error=${result.error_message ?? 'なし'})`
        );
      }
      const elapsed = (Date.now() - started) / 1000;
      const per = elapsed / (i + 1);
      const remain = Math.round((chunks.length - i - 1) * per);
      console.log(
        `[${Math.round(((i + 1) / chunks.length) * 100)}% ${i + 1}/${chunks.length}] ` +
        `${c.from}〜${c.to}: +${result.inserted}行 / 経過${Math.round(elapsed / 60)}分 / 残り${Math.round(remain / 60)}分`
      );
    } catch (e) {
      failedChunks += 1;
      console.warn(`  失敗 ${c.from}〜${c.to}:`, e instanceof Error ? e.message : e);
    }
  }
  if (failedChunks > 0) {
    throw new Error(`${label}: ${failedChunks}/${chunks.length} チャンクの取得または取込に失敗しました`);
  }
  console.log(`\n=== ${label} 完了 ===`);
  console.log(`inserted: ${totalInserted}, updated: ${totalUpdated}`);
}

(async () => {
  const target = process.argv[2];
  if (!target || !['jp', 'en', 'ko', 'all'].includes(target)) {
    console.error('引数: jp / en / ko / all のいずれか');
    process.exit(1);
  }
  const args = parseArgs();

  let from: string, to: string;
  if (args.from && args.to) {
    from = args.from;
    to = args.to;
  } else {
    const days = Number(args.days ?? 1);
    const t = todayJst();
    from = addDays(t, -days);
    to = t;
  }

  const labels: YoutubeChannelLabel[] =
    target === 'all' ? ['jp', 'en'] : [target as YoutubeChannelLabel];

  const chunkDays = Number(args.chunk ?? 15);

  for (const label of labels) {
    try {
      await runOne(label, from, to, chunkDays);
    } catch (e) {
      console.error(`${label} 失敗:`, e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  }
})();
