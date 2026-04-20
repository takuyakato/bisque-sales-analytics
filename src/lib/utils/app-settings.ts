import { createServiceClient } from '@/lib/supabase/service';

/**
 * 環境変数から app_settings テーブルへ値を同期するユーティリティ
 * v3.6 §4-5 準拠
 *
 * Phase 1a のセットアップ時に1度実行すれば、VIEW が環境変数の値を参照可能になる。
 * 運用中に環境変数を変えた時も、この関数を叩けばDBに反映される。
 */
export async function syncAppSettings() {
  const supabase = createServiceClient();

  const settings: Record<string, string> = {
    usd_jpy_rate: process.env.USD_JPY_RATE ?? '150',
    yt_channel_id_jp: process.env.YOUTUBE_CHANNEL_ID_JP ?? '',
    yt_channel_id_en: process.env.YOUTUBE_CHANNEL_ID_EN ?? '',
  };

  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) throw new Error(`app_settings sync failed: ${error.message}`);

  return settings;
}
