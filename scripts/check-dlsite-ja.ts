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
    .select('product_id, language, product_title, works!inner(brand)')
    .eq('platform', 'dlsite')
    .in('works.brand', ['CAPURI', 'BerryFeel'])
    .order('product_id', { ascending: true });

  const byLang: Record<string, typeof data> = { ja: [], en: [], 'zh-Hant': [], 'zh-Hans': [], ko: [], unknown: [] };
  for (const v of data ?? []) {
    byLang[v.language] ??= [];
    byLang[v.language]!.push(v);
  }
  for (const [lang, arr] of Object.entries(byLang)) {
    console.log(`\n=== ${lang}: ${arr?.length ?? 0}件 ===`);
    for (const v of (arr ?? []).slice(0, 10)) {
      console.log(`  ${v.product_id}: ${v.product_title?.slice(0, 60)}`);
    }
    if ((arr?.length ?? 0) > 10) console.log(`  ...他${(arr?.length ?? 0) - 10}件`);
  }
})();
