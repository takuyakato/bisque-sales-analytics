import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

/**
 * セッション認証プロキシ
 * - HMAC 署名付きセッショントークンを検証
 * - 未認証は /login にリダイレクト
 * - /login, /api/auth/*, /api/cron/* は除外（除外ルートは別途独自認証）
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token);

  if (valid) {
    // API Route は Origin 検証も追加（CSRF対策）
    if (pathname.startsWith('/api/') && request.method !== 'GET') {
      const origin = request.headers.get('origin');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      if (origin && origin !== appUrl) {
        return NextResponse.json({ error: 'invalid origin' }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  // API リクエストは 401、ページは /login へリダイレクト
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
