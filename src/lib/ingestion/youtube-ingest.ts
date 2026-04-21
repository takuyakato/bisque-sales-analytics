import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import type { YoutubeMetricRow, YoutubeChannelLabel, YoutubeVideo } from '@/lib/scrapers/youtube';

function genAutoWorkId(): string {
  return `auto-${randomBytes(4).toString('hex')}`;
}

function labelToLanguage(label: YoutubeChannelLabel): 'ja' | 'en' | 'ko' {
  if (label === 'jp') return 'ja';
  return label;
}

export interface YoutubeIngestOptions {
  channelLabel: YoutubeChannelLabel;
  videos: YoutubeVideo[];
  metrics: YoutubeMetricRow[];
  runner?: string;
  periodFrom: string;
  periodTo: string;
}

export interface YoutubeIngestResult {
  status: 'success' | 'partial' | 'failed';
  ingestion_log_id: string;
  inserted: number;
  updated: number;
  skipped: number;
  new_variants: number;
  new_works: number;
  error_message?: string;
}

/**
 * YouTube メトリクスを Supabase に書き込む
 *
 * 処理:
 *   1. ingestion_log 作成
 *   2. 動画ごとに product_variants + works を auto-create（既存はスキップ）
 *   3. youtube_metrics_daily に upsert（UNIQUE(video_id, metric_date)）
 */
export async function ingestYoutubeMetrics(
  options: YoutubeIngestOptions
): Promise<YoutubeIngestResult> {
  const supabase = createServiceClient();
  const language = labelToLanguage(options.channelLabel);

  // 1. ingestion_log
  const { data: logRow, error: logErr } = await supabase
    .from('ingestion_log')
    .insert({
      platform: 'youtube',
      source: 'scrape',
      target_date_from: options.periodFrom,
      target_date_to: options.periodTo,
      status: 'success',
      runner: options.runner ?? 'manual',
    })
    .select('id')
    .single();
  if (logErr || !logRow) throw new Error(`ingestion_log 作成失敗: ${logErr?.message}`);
  const ingestion_log_id = logRow.id as string;

  // 2. 動画→variant/work のマップを構築（新規動画は auto-create）
  const variantMap = new Map<string, { variant_id: string; work_id: string }>();
  let new_variants = 0;
  let new_works = 0;

  for (const video of options.videos) {
    const { data: existing } = await supabase
      .from('product_variants')
      .select('id, work_id')
      .eq('platform', 'youtube')
      .eq('product_id', video.video_id)
      .maybeSingle();

    if (existing) {
      const workId = existing.work_id ?? (await createAutoWork(supabase, video.title, 'BLsand'));
      if (!existing.work_id) {
        await supabase.from('product_variants').update({ work_id: workId }).eq('id', existing.id);
      }
      variantMap.set(video.video_id, { variant_id: existing.id, work_id: workId });
    } else {
      const workId = await createAutoWork(supabase, video.title, 'BLsand');
      new_works += 1;
      const { data: inserted, error: insErr } = await supabase
        .from('product_variants')
        .insert({
          work_id: workId,
          platform: 'youtube',
          product_id: video.video_id,
          product_title: video.title,
          language,
          origin_status: 'unknown',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.warn(`product_variants insert失敗 (${video.video_id}): ${insErr?.message}`);
        continue;
      }
      variantMap.set(video.video_id, { variant_id: inserted.id, work_id: workId });
      new_variants += 1;
    }
  }

  // 3. メトリクスをバッチで upsert
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const m of options.metrics) {
    try {
      const mapping = variantMap.get(m.video_id);
      // work_id は product_variants から JOIN で取得するため保存しない（Phase 2 denormalization 排除）
      const payload = {
        variant_id: mapping?.variant_id ?? null,
        channel_id: m.channel_id,
        channel_name: m.channel_name,
        video_id: m.video_id,
        metric_date: m.metric_date,
        views: m.views,
        watch_time_minutes: m.watch_time_minutes,
        subscribers_gained: m.subscribers_gained,
        estimated_revenue_usd: m.estimated_revenue_usd,
        membership_revenue_usd: m.membership_revenue_usd,
        raw_data: m as unknown as Record<string, unknown>,
        ingestion_log_id,
      };

      const { data: existingMetric } = await supabase
        .from('youtube_metrics_daily')
        .select('id')
        .eq('video_id', m.video_id)
        .eq('metric_date', m.metric_date)
        .maybeSingle();

      if (existingMetric) {
        const { error } = await supabase
          .from('youtube_metrics_daily')
          .update(payload)
          .eq('id', existingMetric.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from('youtube_metrics_daily').insert(payload);
        if (error) throw error;
        inserted += 1;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      skipped += 1;
    }
  }

  const status: YoutubeIngestResult['status'] =
    errors.length === 0
      ? 'success'
      : errors.length < options.metrics.length
        ? 'partial'
        : 'failed';

  await supabase
    .from('ingestion_log')
    .update({
      status,
      records_inserted: inserted,
      records_updated: updated,
      records_skipped: skipped,
      error_message: errors.length ? errors.slice(0, 5).join(' | ') : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', ingestion_log_id);

  return {
    status,
    ingestion_log_id,
    inserted,
    updated,
    skipped,
    new_variants,
    new_works,
    error_message: errors.length ? errors.slice(0, 5).join(' | ') : undefined,
  };
}

async function createAutoWork(
  supabase: ReturnType<typeof createServiceClient>,
  title: string,
  brand: string
): Promise<string> {
  const id = genAutoWorkId();
  const { error } = await supabase.from('works').insert({
    id,
    title: title || id,
    brand,
    auto_created: true,
  });
  if (error) throw new Error(`works auto-create失敗: ${error.message}`);
  return id;
}
