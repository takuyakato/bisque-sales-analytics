import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from './session';

/**
 * Route Handler 内で使う多層防御用ヘルパー。
 * middleware で弾いている前提でも、念のため Handler 内で再検証する。
 *
 * 使い方:
 *   const unauth = await requireAuth(request);
 *   if (unauth) return unauth;  // 401 レスポンスを即返す
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token);
  if (!valid) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
