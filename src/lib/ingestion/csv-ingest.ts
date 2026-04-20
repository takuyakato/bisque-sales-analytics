import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { CanonicalSalesRow, IngestionStatus, Platform } from '@/lib/types';

/**
 * works の自動採番ID（v3.6 §4-1）
 * 形式: `auto-XXXXXXXX`（8桁のhex）
 */
function genAutoWorkId(): string {
  return `auto-${randomBytes(4).toString('hex')}`;
}

export interface IngestCsvOptions {
  /** プラットフォーム（ingestion_logに記録） */
  platform: Platform;
  /** パース済みの標準化行 */
  rows: CanonicalSalesRow[];
  /** 期間（ingestion_logに記録） */
  periodFrom: string;
  periodTo: string;
  /** 実行主体（'manual' or 'github-actions' or 'vercel-cron'） */
  runner?: string;
  /** どこから呼ばれたか */
  source?: 'csv-upload' | 'scrape' | 'api';
}

export interface IngestResult {
  status: IngestionStatus;
  ingestion_log_id: string;
  inserted: number;
  updated: number;
  skipped: number;
  new_variants: number;
  new_works: number;
  error_message?: string;
}

/**
 * 標準化済みの売上行をSupabaseに書き込む
 *
 * 処理フロー：
 *   1. ingestion_log に進行中レコード作成
 *   2. 各行について:
 *      - product_variants を upsert（既存なければ新規、works も同時に自動生成）
 *      - sales_daily に upsert（UNIQUE制約で冪等）
 *   3. ingestion_log を更新（success / partial / failed）
 */
export async function ingestCsvRows(options: IngestCsvOptions): Promise<IngestResult> {
  const supabase = createServiceClient();

  // 1. ingestion_log 作成
  const { data: logRow, error: logError } = await supabase
    .from('ingestion_log')
    .insert({
      platform: options.platform,
      source: options.source ?? 'csv-upload',
      target_date_from: options.periodFrom,
      target_date_to: options.periodTo,
      status: 'success', // 仮、最後に更新
      runner: options.runner ?? 'manual',
    })
    .select('id')
    .single();

  if (logError || !logRow) {
    throw new Error(`ingestion_log 作成失敗: ${logError?.message}`);
  }

  const ingestion_log_id = logRow.id as string;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let new_variants = 0;
  let new_works = 0;
  const errors: string[] = [];

  for (const row of options.rows) {
    try {
      // 2-a. product_variants 検索・作成
      const { data: existingVariant } = await supabase
        .from('product_variants')
        .select('id, work_id')
        .eq('platform', row.platform)
        .eq('product_id', row.product_id)
        .maybeSingle();

      let variantId: string;
      let workId: string;

      if (existingVariant) {
        variantId = existingVariant.id;
        workId = existingVariant.work_id ?? (await createAutoWork(supabase, row));
        // work_id が埋まっていなかった場合は紐付け
        if (!existingVariant.work_id) {
          await supabase.from('product_variants').update({ work_id: workId }).eq('id', variantId);
        }
      } else {
        // 新規 variant → works も auto-create（§4-1-1）
        workId = await createAutoWork(supabase, row);
        new_works += 1;

        const { data: insertedVariant, error: variantError } = await supabase
          .from('product_variants')
          .insert({
            work_id: workId,
            platform: row.platform,
            product_id: row.product_id,
            product_title: row.product_title,
            language: row.language,
            origin_status: 'unknown',
          })
          .select('id')
          .single();

        if (variantError || !insertedVariant) {
          throw new Error(
            `product_variants insert失敗 (${row.product_id}): ${variantError?.message}`
          );
        }
        variantId = insertedVariant.id;
        new_variants += 1;
      }

      // 2-b. sales_daily に upsert
      const { data: existingSale } = await supabase
        .from('sales_daily')
        .select('id')
        .eq('variant_id', variantId)
        .eq('sale_date', row.sale_date)
        .eq('aggregation_unit', row.aggregation_unit)
        .eq('sales_price_jpy', row.sales_price_jpy)
        .maybeSingle();

      const salePayload = {
        variant_id: variantId,
        work_id: workId,
        platform: row.platform,
        sale_date: row.sale_date,
        aggregation_unit: row.aggregation_unit,
        sales_price_jpy: row.sales_price_jpy,
        wholesale_price_jpy: row.wholesale_price_jpy,
        sales_count: row.sales_count,
        net_revenue_jpy: row.net_revenue_jpy,
        source: options.source ?? 'csv-upload',
        raw_data: row.raw,
        ingestion_log_id,
      };

      if (existingSale) {
        const { error: upErr } = await supabase
          .from('sales_daily')
          .update(salePayload)
          .eq('id', existingSale.id);
        if (upErr) throw new Error(`sales_daily update失敗: ${upErr.message}`);
        updated += 1;
      } else {
        const { error: insErr } = await supabase.from('sales_daily').insert(salePayload);
        if (insErr) throw new Error(`sales_daily insert失敗: ${insErr.message}`);
        inserted += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      skipped += 1;
    }
  }

  // 3. ingestion_log 更新
  const status: IngestionStatus =
    errors.length === 0 ? 'success' : errors.length < options.rows.length ? 'partial' : 'failed';

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

/**
 * works を auto-create して id を返す
 */
async function createAutoWork(
  supabase: ReturnType<typeof createServiceClient>,
  row: CanonicalSalesRow
): Promise<string> {
  const id = genAutoWorkId();
  const { error } = await supabase.from('works').insert({
    id,
    title: row.product_title || id,
    brand: row.brand,
    auto_created: true,
  });
  if (error) throw new Error(`works auto-create失敗: ${error.message}`);
  return id;
}
