import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const rows = await fetchAllPages<{sale_date: string; platform: string; aggregation_unit: string; revenue_jpy: number | null}>(
    s, 'sales_unified_daily', (q) => q.select('sale_date, platform, aggregation_unit, revenue_jpy')
  );
  const byYmUnit: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const ym = String(r.sale_date).slice(0,7);
    const key = `${r.platform}/${r.aggregation_unit}`;
    byYmUnit[ym] ??= {};
    byYmUnit[ym][key] = (byYmUnit[ym][key] ?? 0) + (r.revenue_jpy ?? 0);
  }
  console.log('YM\t[platform/unit]\trevenue');
  for (const [ym, m] of Object.entries(byYmUnit).sort()) {
    for (const [k, v] of Object.entries(m)) {
      console.log(`${ym}\t${k}\t${v}`);
    }
  }
})();
