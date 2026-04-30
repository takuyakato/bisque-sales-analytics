/**
 * 各 MV を個別の RPC で順次 REFRESH
 * 1個失敗しても他は続行する
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

const RPC_FUNCTIONS = [
  'refresh_monthly_platform_summary',
  'refresh_monthly_brand_summary',
  'refresh_monthly_language_summary',
  'refresh_monthly_brand_language_summary',
  'refresh_daily_breakdown_summary',
  'refresh_work_d30_summary',
  'refresh_work_revenue_summary',
];

(async () => {
  const s = createServiceClient();
  for (const fn of RPC_FUNCTIONS) {
    const start = Date.now();
    const { error } = await s.rpc(fn);
    const ms = Date.now() - start;
    if (error) {
      console.log(`✗ ${fn}: ${ms}ms / ${error.code} / ${error.message}`);
    } else {
      console.log(`✓ ${fn}: ${ms}ms`);
    }
  }
})();
