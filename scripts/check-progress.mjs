import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env.local', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count: salesCount } = await supabase.from('sales_daily').select('*', { count: 'exact', head: true });
const { count: worksCount } = await supabase.from('works').select('*', { count: 'exact', head: true });
const { count: variantsCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });

// paginate
const total = {};
const byUnit = { daily: 0, monthly: 0 };
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase
    .from('sales_unified_daily')
    .select('platform, revenue_jpy, aggregation_unit')
    .range(offset, offset + 999);
  if (error || !data || data.length === 0) break;
  for (const r of data) {
    total[r.platform] = (total[r.platform] ?? 0) + (r.revenue_jpy ?? 0);
    byUnit[r.aggregation_unit] = (byUnit[r.aggregation_unit] ?? 0) + (r.revenue_jpy ?? 0);
  }
  if (data.length < 1000) break;
}

console.log(`sales_daily: ${salesCount} / works: ${worksCount} / product_variants: ${variantsCount}`);
console.log('platform totals:', Object.fromEntries(Object.entries(total).map(([k, v]) => [k, `¥${v.toLocaleString()}`])));
console.log('aggregation_unit totals:', Object.fromEntries(Object.entries(byUnit).map(([k, v]) => [k, `¥${v.toLocaleString()}`])));
const totalAll = Object.values(total).reduce((a, b) => a + b, 0);
console.log(`total: ¥${totalAll.toLocaleString()}`);
