import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';
import { rateLimit, rateLimitReset } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/auth/login
 * - bcrypt で ACCESS_PASSWORD_HASH と照合
 * - 成功時は HMAC 署名付きセッショントークンを HttpOnly Cookie で発行
 * - IP ごとにレート制限（5回/分）
 */
export async function POST(request: NextRequest) {
  // レート制限（IP単位）
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const rl = rateLimit(`login:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'too many attempts', retryAfter: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const { password } = await request.json();
    if (typeof password !== 'string') {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const expectedHash = process.env.ACCESS_PASSWORD_HASH;
    if (!expectedHash) {
      console.error('ACCESS_PASSWORD_HASH が未設定');
      return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 });
    }

    const ok = await bcrypt.compare(password, expectedHash);
    if (!ok) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 成功：レート制限カウンタをリセット＋署名トークン発行
    rateLimitReset(`login:${ip}`);
    const token = await createSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
