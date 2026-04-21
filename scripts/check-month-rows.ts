import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const month = process.argv[2] ?? '2026-04';
  const monthStart = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, 0).getDate();
  const monthEnd = `${month}-${String(end).padStart(2, '0')}`;

  const { count } = await s
    .from('sales_unified_daily')
    .select('*', { count: 'exact', head: true })
    .gte('sale_date', monthStart)
    .lte('sale_date', monthEnd);
  console.log(`sales_unified_daily (${monthStart}〜${monthEnd}): ${count}行`);

  // aggregate 動作確認
  const { data, error } = await s
    .from('sales_unified_daily')
    .select('revenue_jpy.sum(),sales_count.sum()')
    .gte('sale_date', monthStart)
    .lte('sale_date', monthEnd);
  console.log('aggregate result:', error ?? data);
})();
