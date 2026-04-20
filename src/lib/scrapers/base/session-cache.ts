import { createServiceClient } from '@/lib/supabase/service';
import type { BrowserContext } from 'playwright';

/**
 * Playwright Cookie キャッシュ（v3.6 §5-2 準拠）
 * Supabase Storage プライベートバケット `scraper-sessions/` に JSON 保存、24時間TTL
 */

const BUCKET = 'scraper-sessions';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

type StoredSession = {
  savedAt: number;
  storageState: unknown; // Playwright BrowserContext.storageState() の型（構造は複雑なのでunknown）
};

/**
 * セッション保存
 */
export async function saveSession(platform: string, context: BrowserContext) {
  const supabase = createServiceClient();
  const state = await context.storageState();
  const payload: StoredSession = {
    savedAt: Date.now(),
    storageState: state,
  };
  const body = Buffer.from(JSON.stringify(payload));
  await ensureBucket(supabase);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${platform}.json`, body, {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) console.warn(`saveSession failed: ${error.message}`);
}

/**
 * セッション取得。期限切れ/欠落時は null を返す
 */
export async function loadSession(platform: string): Promise<unknown | null> {
  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${platform}.json`);
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as StoredSession;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      console.log(`session expired for ${platform}, will re-login`);
      return null;
    }
    return parsed.storageState;
  } catch {
    return null;
  }
}

/**
 * セッション削除（ログイン失敗時など）
 */
export async function clearSession(platform: string) {
  const supabase = createServiceClient();
  await supabase.storage.from(BUCKET).remove([`${platform}.json`]);
}

async function ensureBucket(
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false });
}
