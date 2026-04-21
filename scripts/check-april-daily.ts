import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const rows = await fetchAllPages<{ sale_date: string; net_revenue_jpy: number | null }>(
    s,
    'sales_daily',
    (q) =>
      q
        .select('sale_date, net_revenue_jpy')
        .eq('platform', 'dlsite')
        .eq('aggregation_unit', 'daily')
        .gte('sale_date', '2026-04-01')
        .lte('sale_date', '2026-04-30')
  );
  const byDate: Record<string, { count: number; rev: number }> = {};
  for (const r of rows) {
    byDate[r.sale_date] ??= { count: 0, rev: 0 };
    byDate[r.sale_date].count++;
    byDate[r.sale_date].rev += r.net_revenue_jpy ?? 0;
  }
  console.log('日付 / 行数 / 売上');
  for (const [d, info] of Object.entries(byDate).sort()) {
    console.log(`  ${d}\t${info.count}行\t¥${info.rev.toLocaleString()}`);
  }
})();
