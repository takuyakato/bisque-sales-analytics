import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const t0 = Date.now();
  const { data, error, count } = await s
    .from('work_revenue_summary')
    .select('*', { count: 'planned', head: false })
    .limit(10);
  const ms = Date.now() - t0;
  if (error) { console.error(error); return; }
  console.log(`work_revenue_summary: ${count} 行 (${ms}ms)`);
  console.log('サンプル:', data?.slice(0, 3));
})();
