import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // DLsite の CAPURI/BerryFeel variants すべて取得
  const { data: variants } = await s
    .from('product_variants')
    .select('id, work_id, language, product_id, product_title, platform, works!inner(brand)')
    .eq('platform', 'dlsite');

  const byWork: Record<string, Array<{ product_id: string; language: string; title: string | null }>> = {};
  let total = 0, multiLang = 0;
  for (const v of variants ?? []) {
    const brand = (v.works as unknown as { brand: string })?.brand;
    if (brand !== 'CAPURI' && brand !== 'BerryFeel') continue;
    const wid = v.work_id ?? '';
    byWork[wid] ??= [];
    byWork[wid].push({ product_id: v.product_id, language: v.language, title: v.product_title });
    total++;
  }

  console.log(`DLsite CAPURI/BerryFeel variants: ${total}`);
  const workIds = Object.keys(byWork);
  console.log(`紐付いた works: ${workIds.length}`);
  for (const wid of workIds) {
    const group = byWork[wid];
    if (group.length > 1) {
      multiLang++;
      console.log(`\n  ${wid}: ${group.length} variants`);
      for (const v of group) console.log(`    [${v.language}] ${v.product_id}: ${v.title?.slice(0, 50)}`);
    }
  }
  console.log(`\n複数languageが紐付いているworks: ${multiLang}`);
  console.log(`1言語だけのworks: ${workIds.length - multiLang}`);
})();
