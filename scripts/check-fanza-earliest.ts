import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // 既に取り込み済みのFanza売上
  const { data: sales } = await s
    .from('sales_daily')
    .select('sale_date')
    .eq('platform', 'fanza')
    .order('sale_date', { ascending: true })
    .limit(5);

  console.log('=== 取込済み Fanza sales_daily の最古5件 ===');
  for (const r of sales ?? []) console.log('  ', r.sale_date);

  // Fanza product_variants (何商品登録されているか)
  const { data: variants } = await s
    .from('product_variants')
    .select('product_id, product_title')
    .eq('platform', 'fanza');
  console.log(`\n=== Fanza variants 総数: ${variants?.length ?? 0} ===`);
  for (const v of (variants ?? []).slice(0, 20)) {
    console.log(`   ${v.product_id}: ${v.product_title?.slice(0, 60)}`);
  }

  // ingestion_log の最古 Fanza 取込
  const { data: logs } = await s
    .from('ingestion_log')
    .select('target_period_from, target_period_to, records_inserted, started_at, status')
    .eq('platform', 'fanza')
    .order('target_period_from', { ascending: true })
    .limit(5);
  console.log('\n=== ingestion_log の最古 Fanza 取込 5件 ===');
  for (const l of logs ?? []) {
    console.log(`  ${l.target_period_from} 〜 ${l.target_period_to}: ${l.records_inserted}件 (${l.status})`);
  }
})();
