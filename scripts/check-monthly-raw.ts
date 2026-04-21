import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const ym = process.argv[2] ?? '2026-04';
  const from = `${ym}-01`;
  const to = `${ym}-30`;

  console.log('当月detail取得...');
  const monthRows = await fetchAllPages<{
    sale_date: string;
    brand: string;
    platform: string;
    language: string;
    work_id: string;
    revenue_jpy: number | null;
    sales_count: number | null;
    aggregation_unit: string;
  }>(
    s,
    'sales_unified_daily',
    (q) =>
      q
        .select('sale_date, brand, platform, language, work_id, revenue_jpy, sales_count, aggregation_unit')
        .gte('sale_date', from)
        .lte('sale_date', to)
  );
  console.log(`  ${monthRows.length}行`);
  console.log(`  サンプル:`, monthRows[0]);

  const total = monthRows.reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  console.log(`  合計: ¥${total.toLocaleString()}`);
})();
