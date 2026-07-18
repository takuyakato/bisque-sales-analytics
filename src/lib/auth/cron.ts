import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session';

/** CRON_SECRET と完全一致する Bearer 認証か判定する。 */
export function hasValidCronBearer(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

/** 有効なセッションCookieと、非GET時のOriginを検証する。 */
export async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) return false;

  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (origin && origin !== appUrl) return false;
  }

  return true;
}
