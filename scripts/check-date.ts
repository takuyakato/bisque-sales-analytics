import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const date = process.argv[2] ?? '2025-08-15';

  // sales_unified_daily で当該日
  const { data: unified } = await s
    .from('sales_unified_daily')
    .select('platform, aggregation_unit, revenue_jpy, sales_count')
    .eq('sale_date', date);
  console.log(`\n=== sales_unified_daily (${date}) ===`);
  const perPlatform: Record<string, { rows: number; rev: number }> = {};
  for (const r of unified ?? []) {
    const key = `${r.platform}/${r.aggregation_unit}`;
    perPlatform[key] ??= { rows: 0, rev: 0 };
    perPlatform[key].rows++;
    perPlatform[key].rev += r.revenue_jpy ?? 0;
  }
  for (const [k, v] of Object.entries(perPlatform)) console.log(`  ${k}: ${v.rows}行 / ¥${v.rev.toLocaleString()}`);

  // sales_daily 直接
  const { data: sd } = await s
    .from('sales_daily')
    .select('platform, aggregation_unit, net_revenue_jpy, sales_count')
    .eq('sale_date', date);
  console.log(`\n=== sales_daily (${date}) ===`);
  console.log(`  ${sd?.length ?? 0} 行`);
  for (const r of (sd ?? []).slice(0, 5)) {
    console.log(`    [${r.platform}/${r.aggregation_unit}] ¥${r.net_revenue_jpy} / ${r.sales_count}`);
  }

  // youtube_metrics_daily 直接
  const { data: yt, count: ytCount } = await s
    .from('youtube_metrics_daily')
    .select('channel_name, views, estimated_revenue_usd', { count: 'exact' })
    .eq('metric_date', date)
    .limit(5);
  console.log(`\n=== youtube_metrics_daily (${date}) ===`);
  console.log(`  総行数: ${ytCount}`);
  for (const r of yt ?? []) {
    console.log(`    ${r.channel_name}: views=${r.views} / $${r.estimated_revenue_usd}`);
  }

  // ingestion_log でその日にDLsiteが取込されたか
  const { data: logs } = await s
    .from('ingestion_log')
    .select('platform, status, records_inserted, target_date_from, target_date_to, started_at')
    .eq('target_date_from', date)
    .eq('target_date_to', date);
  console.log(`\n=== ingestion_log (target=${date}) ===`);
  for (const l of logs ?? []) {
    console.log(`  ${l.platform}: ${l.status} (+${l.records_inserted}行) @ ${l.started_at}`);
  }
})();
