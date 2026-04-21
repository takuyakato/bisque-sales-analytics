#!/usr/bin/env tsx
/**
 * Frankfurter API から USD/JPY 日次レートを取得して daily_rates に投入
 * https://api.frankfurter.app/ （無料・APIキー不要）
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

const FROM = process.argv[2] ?? '2020-01-01';
const TODAY = new Date().toISOString().slice(0, 10);
const TO = process.argv[3] ?? TODAY;

async function fetchRates(from: string, to: string): Promise<Record<string, number>> {
  const url = `https://api.frankfurter.app/${from}..${to}?from=USD&to=JPY`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Frankfurter API: ${resp.status} ${resp.statusText}`);
  const json = await resp.json() as { rates: Record<string, { JPY: number }> };
  const out: Record<string, number> = {};
  for (const [date, r] of Object.entries(json.rates)) {
    if (r && typeof r.JPY === 'number') out[date] = r.JPY;
  }
  return out;
}

(async () => {
  console.log(`USD/JPY レート取得: ${FROM} 〜 ${TO}`);

  // 年ごとに分割（Frankfurter は 1000日でも動くがタイムアウト回避）
  const rates: Record<string, number> = {};
  const startY = Number(FROM.slice(0, 4));
  const endY = Number(TO.slice(0, 4));
  for (let y = startY; y <= endY; y++) {
    const from = y === startY ? FROM : `${y}-01-01`;
    const to = y === endY ? TO : `${y}-12-31`;
    console.log(`  ${from} 〜 ${to} 取得中...`);
    const yearRates = await fetchRates(from, to);
    Object.assign(rates, yearRates);
    console.log(`    ${Object.keys(yearRates).length} 営業日取得`);
  }

  // 平日のみ取得なので、土日は直前の平日のレートで埋める
  const allDates: string[] = [];
  const cur = new Date(FROM);
  const end = new Date(TO);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    allDates.push(iso);
    cur.setDate(cur.getDate() + 1);
  }

  let lastRate: number | null = null;
  const rows: Array<{ rate_date: string; usd_jpy: number; source: string }> = [];
  for (const d of allDates) {
    if (rates[d] !== undefined) {
      lastRate = rates[d];
      rows.push({ rate_date: d, usd_jpy: rates[d], source: 'frankfurter' });
    } else if (lastRate !== null) {
      rows.push({ rate_date: d, usd_jpy: lastRate, source: 'frankfurter-carry-forward' });
    }
  }

  console.log(`\n投入対象: ${rows.length} 行（営業日 ${Object.keys(rates).length} + 土日埋め）`);

  // Supabase に upsert
  const s = createServiceClient();
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await s.from('daily_rates').upsert(batch, { onConflict: 'rate_date' });
    if (error) {
      console.error(`batch ${i}: error`, error.message);
      continue;
    }
    inserted += batch.length;
    console.log(`  ${Math.round((inserted / rows.length) * 100)}% ${inserted}/${rows.length}`);
  }
  console.log(`\n完了: ${inserted}行 投入`);

  // サンプル表示
  const samples = await s.from('daily_rates').select('rate_date, usd_jpy').order('rate_date', { ascending: false }).limit(5);
  console.log('\n最新5日:');
  for (const r of samples.data ?? []) console.log(`  ${r.rate_date}: ${r.usd_jpy}`);
})();
