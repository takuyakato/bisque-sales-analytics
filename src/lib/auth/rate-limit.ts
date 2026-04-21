/**
 * シンプルな in-memory レート制限（IPごとの試行回数）
 * Serverless の各インスタンスごとのメモリなので完全ではないが、
 * 小規模運用（数名）でのブルートフォース遅延には十分。
 *
 * 制限: 5回/分、超過後60秒ロック
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_ATTEMPTS - 1, retryAfterSec: 0 };
  }

  if (b.count >= MAX_ATTEMPTS) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }

  b.count += 1;
  return { ok: true, remaining: MAX_ATTEMPTS - b.count, retryAfterSec: 0 };
}

/** 成功時の試行カウントリセット（任意） */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}
