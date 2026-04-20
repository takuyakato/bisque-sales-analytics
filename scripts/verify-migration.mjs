#!/usr/bin/env node
/**
 * Phase 1a 検証: Supabase migration 実行後に全テーブル・VIEW・RLSが揃っているか確認
 * 使い方: node scripts/verify-migration.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

// .env.local を読む
const envText = readFileSync(path.resolve('.env.local'), 'utf8');
const env = {};
envText.split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Supabase 環境変数が .env.local に設定されていません');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const expectedTables = [
  'ingestion_log',
  'works',
  'product_variants',
  'sales_daily',
  'youtube_metrics_daily',
  'app_settings',
  'notion_pages',
];

const expectedSettings = ['usd_jpy_rate', 'yt_channel_id_jp', 'yt_channel_id_en'];

let allOk = true;

console.log('\n=== bisque-sales-analytics Phase 1a 検証 ===\n');

// 1. テーブル存在確認（SELECT 0件で確認）
console.log('1. テーブル存在確認');
for (const table of expectedTables) {
  const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(0);
  if (error) {
    console.log(`  ❌ ${table}: ${error.message}`);
    allOk = false;
  } else {
    console.log(`  ✅ ${table}`);
  }
}

// 2. VIEW の動作確認
console.log('\n2. VIEW 動作確認');
const { error: viewError } = await supabase
  .from('sales_unified_daily')
  .select('*', { head: true, count: 'exact' })
  .limit(0);
if (viewError) {
  console.log(`  ❌ sales_unified_daily: ${viewError.message}`);
  allOk = false;
} else {
  console.log('  ✅ sales_unified_daily VIEW');
}

// 3. app_settings のデフォルト値確認
console.log('\n3. app_settings デフォルト値確認');
const { data: settings, error: settingsError } = await supabase
  .from('app_settings')
  .select('key, value');
if (settingsError) {
  console.log(`  ❌ app_settings 読み取り失敗: ${settingsError.message}`);
  allOk = false;
} else {
  for (const k of expectedSettings) {
    const found = settings.find((s) => s.key === k);
    if (found) {
      console.log(`  ✅ ${k}: "${found.value}"`);
    } else {
      console.log(`  ❌ ${k} がありません`);
      allOk = false;
    }
  }
}

// 4. RLS 有効確認（anon key で SELECT できることを確認）
console.log('\n4. RLS ポリシー動作確認（anon key で SELECT できるか）');
const anonClient = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
for (const table of expectedTables.slice(0, 3)) {
  const { error } = await anonClient.from(table).select('*', { head: true, count: 'exact' }).limit(0);
  if (error) {
    console.log(`  ❌ ${table} (anon): ${error.message}`);
    allOk = false;
  } else {
    console.log(`  ✅ ${table} (anon 読み取り可能)`);
  }
}

console.log('\n' + '='.repeat(50));
if (allOk) {
  console.log('✅ Phase 1a 検証すべて成功！Phase 1b に進めます。');
  process.exit(0);
} else {
  console.log('❌ 一部の検証に失敗しました。上記エラーを確認してください。');
  process.exit(1);
}
