import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const t0 = Date.now();
  const { data, error } = await s
    .from('work_revenue_summary')
    .select('work_id, platform, revenue_all, revenue_y1, revenue_d30, sales_all')
    .order('revenue_all', { ascending: false })
    .limit(5);
  const ms = Date.now() - t0;
  if (error) {
    console.error('ERROR:', error.message);
    return;
  }
  console.log(`取得時間: ${ms}ms`);
  console.log('トップ5:');
  for (const r of data ?? []) {
    console.log(`  ${r.work_id} [${r.platform}] 累計:¥${Number(r.revenue_all).toLocaleString()} / 1y:¥${Number(r.revenue_y1).toLocaleString()} / 30d:¥${Number(r.revenue_d30).toLocaleString()}`);
  }
})();
