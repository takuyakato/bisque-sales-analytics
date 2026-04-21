import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const { data } = await s
    .from('product_variants')
    .select('language, product_id, product_title, work_id, works!inner(brand)')
    .eq('platform', 'dlsite');

  const byLang: Record<string, number> = {};
  for (const v of data ?? []) {
    const brand = (v.works as unknown as { brand: string })?.brand;
    if (brand !== 'CAPURI' && brand !== 'BerryFeel') continue;
    byLang[v.language] = (byLang[v.language] ?? 0) + 1;
  }
  console.log('DLsite CAPURI/BerryFeel 言語別variants数:');
  for (const [k, v] of Object.entries(byLang)) console.log(`  ${k}: ${v}`);

  console.log('\n=== 非JA variants サンプル ===');
  for (const v of data ?? []) {
    const brand = (v.works as unknown as { brand: string })?.brand;
    if (brand !== 'CAPURI' && brand !== 'BerryFeel') continue;
    if (v.language !== 'ja') {
      console.log(`  [${v.language}] ${v.product_id}: ${v.product_title?.slice(0, 60)}`);
    }
  }
})();
