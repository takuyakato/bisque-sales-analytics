#!/usr/bin/env tsx
/**
 * Notion同期ローカルテスト
 * 使い方: npx tsx scripts/test-notion-sync.ts [YYYY-MM]
 */
import { readFileSync } from 'fs';
import path from 'path';
import { syncMonthToNotion } from '../src/lib/notion/sync';

try {
  const envText = readFileSync(path.resolve('.env.local'), 'utf8');
  envText.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch {}

async function main() {
  const month = process.argv[2] ?? new Date().toISOString().slice(0, 7);
  console.log(`=== Notion同期テスト: ${month} ===`);
  const r = await syncMonthToNotion(month);
  console.log('結果:', r);
}
main().catch((e) => { console.error(e); process.exit(1); });
