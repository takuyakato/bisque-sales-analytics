#!/usr/bin/env tsx
/**
 * ACCESS_PASSWORD_HASH と SESSION_SECRET を生成する
 *
 * 使い方:
 *   npx tsx scripts/hash-password.ts <新しいパスワード>
 *
 * 出力を Vercel / .env.local に登録する
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const pwd = process.argv[2];
if (!pwd) {
  console.error('使い方: npx tsx scripts/hash-password.ts <新しいパスワード>');
  process.exit(1);
}
if (pwd.length < 8) {
  console.error('⚠ パスワードは8文字以上推奨');
}

const hash = bcrypt.hashSync(pwd, 12);
const sessionSecret = crypto.randomBytes(48).toString('base64url');

console.log('\n=== .env.local / Vercel 環境変数に登録 ===\n');
console.log(`ACCESS_PASSWORD_HASH='${hash}'`);
console.log(`SESSION_SECRET='${sessionSecret}'`);
console.log('\n古い変数は削除してください:');
console.log('  APP_PASSWORD');
