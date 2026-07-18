#!/usr/bin/env tsx
/** YouTubeの日次収益をJPYで再取得し、既存メトリクスを補正する。 */
import { existsSync, readFileSync } from 'fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

import { ingestYoutubeMetrics } from '../src/lib/ingestion/youtube-ingest';
import { YoutubeScraper, type YoutubeChannelLabel, type YoutubeMetricRow } from '../src/lib/scrapers/youtube';
import { createServiceClient } from '../src/lib/supabase/service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHUNK_DAYS = 15;

function parseArgs(): { from: string; to: string } {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(from|to)=(.+)$/);
    if (!match) throw new Error(`不明な引数です: ${arg}`);
    args.set(match[1], match[2]);
  }

  const from = args.get('from');
  const to = args.get('to');
  if (!from || !to) {
    throw new Error('引数 --from=YYYY-MM-DD と --to=YYYY-MM-DD は必須です');
  }
  if (!isValidDate(from) || !isValidDate(to)) {
    throw new Error('日付は実在する YYYY-MM-DD 形式で指定してください');
  }
  if (from > to) throw new Error('--from は --to 以前の日付を指定してください');
  return { from, to };
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateChunks(from: string, to: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  for (let start = from; start <= to; start = addDays(start, CHUNK_DAYS)) {
    const end = addDays(start, CHUNK_DAYS - 1);
    chunks.push({ from: start, to: end < to ? end : to });
  }
  return chunks;
}

async function updateExistingRows(metrics: YoutubeMetricRow[]): Promise<{
  updated: number;
  missing: YoutubeMetricRow[];
  errors: string[];
}> {
  const supabase = createServiceClient();
  let updated = 0;
  const missing: YoutubeMetricRow[] = [];
  const errors: string[] = [];

  for (const metric of metrics) {
    const { data, error } = await supabase
      .from('youtube_metrics_daily')
      .update({ estimated_revenue_jpy: metric.estimated_revenue_jpy })
      .eq('video_id', metric.video_id)
      .eq('metric_date', metric.metric_date)
      .select('id');

    if (error) {
      errors.push(`${metric.video_id} ${metric.metric_date}: ${error.message}`);
    } else if (!data?.length) {
      missing.push(metric);
    } else {
      updated += data.length;
    }
  }
  return { updated, missing, errors };
}

async function runChannel(label: YoutubeChannelLabel, from: string, to: string) {
  console.log(`\n=== YouTube ${label}: ${from}〜${to} ===`);
  const scraper = new YoutubeScraper(label);
  await scraper.init();
  const videos = await scraper.fetchVideos(2000);
  const videoIds = videos.map((video) => video.video_id);
  if (videoIds.length === 0) {
    console.log('動画がないためスキップしました');
    return { updated: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  }

  const chunks = dateChunks(from, to);
  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    try {
      const metrics = await scraper.fetchDailyMetrics(chunk.from, chunk.to, videoIds);
      const result = await updateExistingRows(metrics);
      updated += result.updated;
      skipped += result.errors.length;
      errors.push(...result.errors);

      if (result.missing.length > 0) {
        const ingest = await ingestYoutubeMetrics({
          channelLabel: label,
          videos,
          metrics: result.missing,
          runner: 'backfill-youtube-jpy',
          periodFrom: chunk.from,
          periodTo: chunk.to,
        });
        inserted += ingest.inserted;
        skipped += ingest.skipped;
        if (ingest.status !== 'success') {
          errors.push(
            `${chunk.from}〜${chunk.to} の新規取込: ${ingest.error_message ?? ingest.status}`
          );
        }
      }
      console.log(
        `[${index + 1}/${chunks.length}] ${chunk.from}〜${chunk.to}: ` +
          `取得${metrics.length} / 更新${result.updated} / 新規候補${result.missing.length} / エラー${result.errors.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${chunk.from}〜${chunk.to}: ${message}`);
      console.error(`[${index + 1}/${chunks.length}] 失敗: ${message}`);
    }
  }
  return { updated, inserted, skipped, errors };
}

async function main() {
  const { from, to } = parseArgs();
  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const label of ['jp', 'en'] satisfies YoutubeChannelLabel[]) {
    try {
      const result = await runChannel(label, from, to);
      updated += result.updated;
      inserted += result.inserted;
      skipped += result.skipped;
      errors.push(...result.errors.map((error) => `${label}: ${error}`));
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n=== 完了: 更新${updated} / 新規${inserted} / スキップ${skipped} / エラー${errors.length} ===`);
  if (errors.length > 0) {
    console.error(errors.slice(0, 20).join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
