import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { hasValidCronBearer, hasValidSession } from '../src/lib/auth/cron';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session';

const originalEnv = {
  CRON_SECRET: process.env.CRON_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function request(method = 'POST', headers: HeadersInit = {}): NextRequest {
  return new NextRequest('https://example.com/api/cron/notion', { method, headers });
}

async function run(): Promise<void> {
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-16-chars';
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';

  assert.equal(
    hasValidCronBearer(request('POST', { authorization: 'Bearer test-cron-secret' })),
    true,
    'Bearer一致は許可する'
  );
  assert.equal(
    hasValidCronBearer(request('POST', { authorization: 'Bearer wrong-secret' })),
    false,
    'Bearer不一致は拒否する'
  );
  delete process.env.CRON_SECRET;
  assert.equal(
    hasValidCronBearer(request('POST', { authorization: 'Bearer test-cron-secret' })),
    false,
    'CRON_SECRET未設定時は拒否する'
  );

  const token = await createSessionToken();
  const cookie = `${SESSION_COOKIE_NAME}=${token}`;
  assert.equal(
    await hasValidSession(request('POST', { cookie, origin: 'https://example.com' })),
    true,
    '有効Cookieと同一OriginのPOSTは許可する'
  );
  assert.equal(
    await hasValidSession(request('POST', { cookie: `${SESSION_COOKIE_NAME}=invalid` })),
    false,
    '無効Cookieは拒否する'
  );
  assert.equal(
    await hasValidSession(request('POST', { cookie, origin: 'https://evil.example' })),
    false,
    '有効Cookieでも異OriginのPOSTは拒否する'
  );
  assert.equal(
    await hasValidSession(request('POST', { cookie })),
    true,
    'Origin未指定でも有効CookieのPOSTは許可する'
  );

  const unauthenticated = request();
  assert.equal(hasValidCronBearer(unauthenticated), false, 'Bearerなしは拒否する');
  assert.equal(await hasValidSession(unauthenticated), false, 'Cookieなしは拒否する');

  console.log('cron auth tests passed');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
