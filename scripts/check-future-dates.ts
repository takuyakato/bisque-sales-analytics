import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  // 2026-04-22 以降のデータを確認
  const { data } = await s
    .from('sales_daily')
    .select('sale_date, platform, aggregation_unit, net_revenue_jpy, sales_count')
    .gte('sale_date', '2026-04-22')
    .order('sale_date', { ascending: true });

  console.log(`2026-04-22以降のsales_daily行数: ${data?.length ?? 0}\n`);
  const byDate: Record<string, { count: number; rev: number; platforms: Set<string>; units: Set<string> }> = {};
  for (const r of data ?? []) {
    byDate[r.sale_date] ??= { count: 0, rev: 0, platforms: new Set(), units: new Set() };
    byDate[r.sale_date].count++;
    byDate[r.sale_date].rev += r.net_revenue_jpy ?? 0;
    byDate[r.sale_date].platforms.add(r.platform);
    byDate[r.sale_date].units.add(r.aggregation_unit);
  }
  for (const [d, info] of Object.entries(byDate).sort()) {
    console.log(`  ${d}: ${info.count}行, ¥${info.rev.toLocaleString()}, platforms=${[...info.platforms].join(',')}, units=${[...info.units].join(',')}`);
  }

  // 4月全体での aggregation_unit 内訳
  console.log('\n=== 2026-04 全体の aggregation_unit 別集計 ===');
  const { data: aprData } = await s
    .from('sales_daily')
    .select('sale_date, platform, aggregation_unit, net_revenue_jpy')
    .gte('sale_date', '2026-04-01')
    .lte('sale_date', '2026-04-30');
  const agg: Record<string, { rows: number; rev: number }> = {};
  for (const r of aprData ?? []) {
    const key = `${r.platform}/${r.aggregation_unit}`;
    agg[key] ??= { rows: 0, rev: 0 };
    agg[key].rows++;
    agg[key].rev += r.net_revenue_jpy ?? 0;
  }
  for (const [k, v] of Object.entries(agg)) console.log(`  ${k}: ${v.rows}行, ¥${v.rev.toLocaleString()}`);
})();
