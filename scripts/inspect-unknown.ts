import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const { data, error } = await s
    .from('product_variants')
    .select('platform, product_id, product_title, language')
    .eq('language', 'unknown')
    .order('product_id');
  if (error) { console.error(error); process.exit(1); }
  console.log(`Unknown language SKUs: ${data?.length ?? 0}\n`);
  for (const v of data ?? []) {
    console.log(`[${v.platform}] ${v.product_id}: ${v.product_title}`);
  }
})();
