#!/usr/bin/env tsx
/**
 * Phase 1b 検証: 実CSV 2本をパース＋Supabaseに取込して結果を確認する
 * 使い方: npx tsx scripts/test-csv-ingest.ts
 */

import { readFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseCsv } from '../src/lib/csv-parser/index';
import { ingestCsvRows } from '../src/lib/ingestion/csv-ingest';

// .env.local 読み込み
const envText = readFileSync(path.resolve('.env.local'), 'utf8');
const env: Record<string, string> = {};
envText.split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});
Object.assign(process.env, env);

async function main() {

console.log('=== Phase 1b CSV取込 検証 ===\n');

// 1. DLsite CSV
console.log('1. DLsite CSV (sales (2).csv) をパース');
const dlsiteBuffer = readFileSync(path.resolve('data/sales (2).csv'));
const dlsiteResult = parseCsv({
  buffer: dlsiteBuffer,
  filename: 'sales (2).csv',
  platform: 'dlsite',
  periodOverride: { from: '2026-04-01', to: '2026-04-30' },
});
console.log(`   行数: ${dlsiteResult.rows.length} / スキップ: ${dlsiteResult.skipped} / 警告: ${dlsiteResult.warnings.length}`);
console.log(`   期間: ${dlsiteResult.periodFrom} 〜 ${dlsiteResult.periodTo} (${dlsiteResult.rows[0]?.aggregation_unit})`);

const langDist: Record<string, number> = {};
for (const r of dlsiteResult.rows) langDist[r.language] = (langDist[r.language] ?? 0) + 1;
console.log(`   言語分布: ${JSON.stringify(langDist)}`);

// 2. Fanza CSV
console.log('\n2. Fanza CSV (sales_all_0_20260401_20260419.csv) をパース');
const fanzaBuffer = readFileSync(path.resolve('data/sales_all_0_20260401_20260419.csv'));
const fanzaResult = parseCsv({
  buffer: fanzaBuffer,
  filename: 'sales_all_0_20260401_20260419.csv',
  platform: 'fanza',
});
console.log(`   行数: ${fanzaResult.rows.length} / スキップ: ${fanzaResult.skipped} / 警告: ${fanzaResult.warnings.length}`);
console.log(`   期間: ${fanzaResult.periodFrom} 〜 ${fanzaResult.periodTo} (${fanzaResult.rows[0]?.aggregation_unit})`);

const fanzaLangDist: Record<string, number> = {};
for (const r of fanzaResult.rows) fanzaLangDist[r.language] = (fanzaLangDist[r.language] ?? 0) + 1;
console.log(`   言語分布: ${JSON.stringify(fanzaLangDist)}`);

// 3. 取込
console.log('\n3. Supabase 取込');
const dlIngestResult = await ingestCsvRows({
  platform: 'dlsite',
  rows: dlsiteResult.rows,
  periodFrom: dlsiteResult.periodFrom,
  periodTo: dlsiteResult.periodTo,
  source: 'csv-upload',
  runner: 'manual',
});
console.log('   DLsite:', JSON.stringify(dlIngestResult));

const fzIngestResult = await ingestCsvRows({
  platform: 'fanza',
  rows: fanzaResult.rows,
  periodFrom: fanzaResult.periodFrom,
  periodTo: fanzaResult.periodTo,
  source: 'csv-upload',
  runner: 'manual',
});
console.log('   Fanza:', JSON.stringify(fzIngestResult));

// 4. DB確認
console.log('\n4. DB状態確認');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count: worksCount } = await supabase.from('works').select('*', { count: 'exact', head: true });
const { count: variantsCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
const { count: salesCount } = await supabase.from('sales_daily').select('*', { count: 'exact', head: true });
console.log(`   works: ${worksCount}件 / product_variants: ${variantsCount}件 / sales_daily: ${salesCount}件`);

const { data: byBrand } = await supabase.from('sales_unified_daily').select('brand, revenue_jpy');
const brandTotal: Record<string, number> = {};
for (const r of byBrand ?? []) brandTotal[r.brand] = (brandTotal[r.brand] ?? 0) + (r.revenue_jpy ?? 0);
console.log('   ブランド別売上:', brandTotal);

const { data: byLang } = await supabase.from('sales_unified_daily').select('language, revenue_jpy');
const langTotal: Record<string, number> = {};
for (const r of byLang ?? []) langTotal[r.language] = (langTotal[r.language] ?? 0) + (r.revenue_jpy ?? 0);
console.log('   言語別売上:', langTotal);

const { data: byPlatform } = await supabase.from('sales_unified_daily').select('platform, revenue_jpy');
const platformTotal: Record<string, number> = {};
for (const r of byPlatform ?? []) platformTotal[r.platform] = (platformTotal[r.platform] ?? 0) + (r.revenue_jpy ?? 0);
console.log('   プラットフォーム別売上:', platformTotal);

console.log('\n✅ Phase 1b 検証完了');

}

main().catch((err) => { console.error(err); process.exit(1); });
