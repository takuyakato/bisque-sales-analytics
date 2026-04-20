import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'bisque-analytics-auth';
const COOKIE_VALUE = 'authenticated';

/**
 * Cookie認証プロキシ（v3.6 §10準拠）
 * Next.js 16 で middleware → proxy にリネームされたため proxy として実装
 * - 未認証は /login にリダイレクト
 * - /login, /api/auth/*, /api/cron/* は除外
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 認証除外パス
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next();
  }

  // Cookie 検証
  const auth = request.cookies.get(COOKIE_NAME);
  if (auth?.value === COOKIE_VALUE) {
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

  // 未認証 → /login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * 以下を除外: _next/static, _next/image, favicon.ico, public配下の静的ファイル
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
