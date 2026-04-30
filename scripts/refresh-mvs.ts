import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const start = Date.now();
  console.log('Refreshing all materialized views...');
  const { error } = await s.rpc('refresh_all_summaries');
  const ms = Date.now() - start;
  if (error) {
    console.error(`✗ failed (${ms}ms):`, error);
    process.exit(1);
  }
  console.log(`✓ refreshed in ${ms}ms`);
})();
