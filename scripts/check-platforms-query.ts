import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const today = new Date();
  const from180 = new Date(today);
  from180.setDate(from180.getDate() - 180);
  const from180Str = from180.toISOString().slice(0, 10);

  const startTime = Date.now();
  const { count: count180 } = await s
    .from('sales_unified_daily')
    .select('*', { count: 'exact', head: true })
    .gte('sale_date', from180Str);
  const time = Date.now() - startTime;
  console.log(`直近180日の sales_unified_daily 行数: ${count180} (count取得 ${time}ms)`);

  const from30 = new Date(today);
  from30.setDate(from30.getDate() - 30);
  const from30Str = from30.toISOString().slice(0, 10);
  const { count: count30 } = await s
    .from('sales_unified_daily')
    .select('*', { count: 'exact', head: true })
    .gte('sale_date', from30Str);
  console.log(`直近30日の行数: ${count30}`);
})();
