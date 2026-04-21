#!/usr/bin/env tsx
/**
 * 未来日付の DLsite daily 行を削除する
 * （スクレイパーが未来日付に対して月次累計を返してきた誤データを削除）
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

const APPLY = process.argv.includes('--apply');

(async () => {
  const s = createServiceClient();

  // JST の今日
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayJst = nowJst.toISOString().slice(0, 10);
  console.log(`JST today: ${todayJst}\n`);

  // 今日より後の daily 行（platform問わず）
  const { count, data } = await s
    .from('sales_daily')
    .select('sale_date, platform, net_revenue_jpy', { count: 'exact' })
    .eq('aggregation_unit', 'daily')
    .gt('sale_date', todayJst);

  console.log(`未来日付の daily 行: ${count}`);

  const byDate: Record<string, { count: number; rev: number }> = {};
  for (const r of data ?? []) {
    const k = `${r.sale_date}/${r.platform}`;
    byDate[k] ??= { count: 0, rev: 0 };
    byDate[k].count++;
    byDate[k].rev += r.net_revenue_jpy ?? 0;
  }
  for (const [k, v] of Object.entries(byDate).sort()) {
    console.log(`  ${k}: ${v.count}行 / ¥${v.rev.toLocaleString()}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run) --apply で削除します');
    return;
  }

  const { error } = await s
    .from('sales_daily')
    .delete()
    .eq('aggregation_unit', 'daily')
    .gt('sale_date', todayJst);
  if (error) {
    console.error('削除エラー:', error.message);
    process.exit(1);
  }
  console.log(`\n✅ 削除完了`);
})();
