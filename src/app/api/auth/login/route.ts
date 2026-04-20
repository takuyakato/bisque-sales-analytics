import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

/**
 * POST /api/auth/login
 * 共通パスワード認証（v3.6 §10準拠）
 * - タイミング攻撃対策として timingSafeEqual で比較
 * - 成功時は HttpOnly Cookie を発行
 */
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (typeof password !== 'string') {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const expected = process.env.APP_PASSWORD;
    if (!expected) {
      return NextResponse.json({ error: 'server misconfiguration' }, { status: 500 });
    }

    const input = Buffer.from(password);
    const expectedBuf = Buffer.from(expected);
    const ok =
      input.length === expectedBuf.length && timingSafeEqual(input, expectedBuf);

    if (!ok) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set('bisque-analytics-auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30日
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
