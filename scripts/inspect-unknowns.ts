import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // 言語 unknown の variants
  const { data: langUnknown } = await s
    .from('product_variants')
    .select('platform, product_id, product_title, language, work_id')
    .eq('language', 'unknown');

  console.log(`\n=== language=unknown variants (${langUnknown?.length ?? 0}) ===`);
  const byPlatform: Record<string, number> = {};
  for (const v of langUnknown ?? []) {
    byPlatform[v.platform] = (byPlatform[v.platform] ?? 0) + 1;
  }
  for (const [p, n] of Object.entries(byPlatform)) console.log(`  ${p}: ${n}件`);

  console.log('\n--- サンプル（上位15件）---');
  for (const v of (langUnknown ?? []).slice(0, 15)) {
    console.log(`  [${v.platform}] ${v.product_id}: ${v.product_title?.slice(0, 60)}`);
  }

  // ブランド unknown の works
  const { data: brandUnknown } = await s
    .from('works')
    .select('id, title, brand, auto_created')
    .eq('brand', 'unknown');

  console.log(`\n=== brand=unknown works (${brandUnknown?.length ?? 0}) ===`);
  console.log('--- サンプル（上位15件）---');
  for (const w of (brandUnknown ?? []).slice(0, 15)) {
    console.log(`  ${w.id}: ${w.title?.slice(0, 60)}`);
  }

  // 売上影響を見る
  const { data: langRevenue } = await s
    .from('sales_unified_daily')
    .select('language, revenue_jpy')
    .eq('language', 'unknown')
    .limit(5000);
  const totalUnknownLang = (langRevenue ?? []).reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  console.log(`\n=== 売上影響 ===`);
  console.log(`language=unknown の累計売上: ¥${totalUnknownLang.toLocaleString()} (${langRevenue?.length} 行)`);

  const { data: brandRevenue } = await s
    .from('sales_unified_daily')
    .select('brand, revenue_jpy')
    .eq('brand', 'unknown')
    .limit(5000);
  const totalUnknownBrand = (brandRevenue ?? []).reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  console.log(`brand=unknown の累計売上: ¥${totalUnknownBrand.toLocaleString()} (${brandRevenue?.length} 行)`);
})();
