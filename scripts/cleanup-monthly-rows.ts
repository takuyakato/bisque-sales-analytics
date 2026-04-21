#!/usr/bin/env tsx
/**
 * Phase 3.5: 冗長な monthly 行を削除
 *
 * 対象: sales_daily で aggregation_unit='monthly' のうち、
 *       同月・同プラットフォームに aggregation_unit='daily' 行が存在するもの
 *
 * 使い方:
 *   npx tsx scripts/cleanup-monthly-rows.ts          # dry-run
 *   npx tsx scripts/cleanup-monthly-rows.ts --apply  # 削除実行
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

const APPLY = process.argv.includes('--apply');

(async () => {
  const s = createServiceClient();

  // sales_daily の全 daily/monthly 行を取得
  const rows = await fetchAllPages<{
    id: string;
    sale_date: string;
    platform: string;
    aggregation_unit: string;
    net_revenue_jpy: number | null;
  }>(
    s,
    'sales_daily',
    (q) => q.select('id, sale_date, platform, aggregation_unit, net_revenue_jpy')
  );
  console.log(`sales_daily 総行数: ${rows.length}`);

  // 同月・同プラットフォームに daily があるペアを特定
  const platformMonthHasDaily = new Set<string>();
  for (const r of rows) {
    if (r.aggregation_unit === 'daily') {
      const ym = String(r.sale_date).slice(0, 7);
      platformMonthHasDaily.add(`${r.platform}:${ym}`);
    }
  }

  // 削除対象: monthly 行で、同月同プラットフォームに daily がある
  const deletable = rows.filter((r) => {
    if (r.aggregation_unit !== 'monthly') return false;
    const ym = String(r.sale_date).slice(0, 7);
    return platformMonthHasDaily.has(`${r.platform}:${ym}`);
  });

  // プラットフォーム別集計
  const byPlatform: Record<string, { count: number; revenue: number }> = {};
  for (const r of deletable) {
    byPlatform[r.platform] ??= { count: 0, revenue: 0 };
    byPlatform[r.platform].count++;
    byPlatform[r.platform].revenue += r.net_revenue_jpy ?? 0;
  }
  console.log(`\n削除対象: ${deletable.length}行`);
  for (const [p, v] of Object.entries(byPlatform)) {
    console.log(`  ${p}: ${v.count}行 / ¥${v.revenue.toLocaleString()}（ゴースト累計）`);
  }

  // 残る monthly 行（daily がない期間）
  const remainingMonthly = rows.filter((r) => r.aggregation_unit === 'monthly' && !deletable.includes(r));
  console.log(`\n残る monthly 行（daily 未取得の期間）: ${remainingMonthly.length}行`);

  if (!APPLY) {
    console.log('\n(dry-run) --apply で削除します');
    return;
  }

  // バッチ削除（1000件ずつ）
  const ids = deletable.map((r) => r.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const { error } = await s.from('sales_daily').delete().in('id', batch);
    if (error) {
      console.error(`batch ${i}:`, error.message);
      continue;
    }
    deleted += batch.length;
    if ((i / 500) % 5 === 0) console.log(`  削除 ${deleted}/${ids.length}...`);
  }
  console.log(`\n✅ ${deleted}行削除完了`);
})();
