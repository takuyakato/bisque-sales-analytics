import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * サービスロールキー使用の Supabase クライアント（サーバー専用）
 * RLSをバイパスして書き込みできる。API Route や Cron ジョブから使う
 *
 * ⚠️ 絶対にクライアントコードにバンドルしないこと
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase 環境変数が設定されていません（NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY）');
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
