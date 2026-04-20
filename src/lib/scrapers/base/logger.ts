import { createServiceClient } from '@/lib/supabase/service';
import { IngestionStatus, Platform } from '@/lib/types';

/**
 * スクレイパー実行の構造化ログ
 * ingestion_log テーブルに進行中→成功/失敗の形で記録
 */
export class ScraperLogger {
  private supabase = createServiceClient();
  private logId: string | null = null;

  constructor(
    private platform: Platform,
    private runner: string,
    private sourceVersion: string
  ) {}

  /**
   * 実行開始を記録。ingestion_log に行を作って ID を返す
   */
  async start(targetFrom: string, targetTo: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('ingestion_log')
      .insert({
        platform: this.platform,
        source: 'scrape',
        target_date_from: targetFrom,
        target_date_to: targetTo,
        status: 'success', // 仮、最終的に finish で上書き
        source_version: this.sourceVersion,
        runner: this.runner,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`ingestion_log start failed: ${error?.message}`);
    this.logId = data.id as string;
    return this.logId;
  }

  /**
   * 実行終了を記録（成功／部分成功／失敗）
   */
  async finish(
    status: IngestionStatus,
    counts: { inserted: number; updated: number; skipped: number },
    errorMessage?: string,
    screenshotPath?: string
  ) {
    if (!this.logId) return;
    await this.supabase
      .from('ingestion_log')
      .update({
        status,
        records_inserted: counts.inserted,
        records_updated: counts.updated,
        records_skipped: counts.skipped,
        error_message: errorMessage ?? null,
        error_screenshot_path: screenshotPath ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', this.logId);
  }

  /**
   * 中間ステップのログ（コンソール出力のみ、ingestion_log には記録しない）
   */
  step(name: string, info?: Record<string, unknown>) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${this.platform}] ${name}${info ? ' ' + JSON.stringify(info) : ''}`);
  }

  getLogId(): string | null {
    return this.logId;
  }
}
