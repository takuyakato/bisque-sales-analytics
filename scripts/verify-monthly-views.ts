import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const t0 = Date.now();
  const { data, error } = await s.from('monthly_platform_summary').select('*');
  const ms = Date.now() - t0;
  if (error) {
    console.error('ERROR:', error.message);
    return;
  }
  console.log(`monthly_platform_summary: ${data?.length ?? 0}行 (${ms}ms)`);
  console.log('サンプル:', data?.slice(0, 5));
})();
