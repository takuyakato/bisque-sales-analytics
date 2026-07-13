/**
 * YouTube の取込状況を確認
 * - youtube_metrics_daily の直近データ日付
 * - ingestion_log の YouTube 関連の直近実行履歴
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // 1. youtube_metrics_daily の直近データ
  const { data: latest } = await s
    .from('youtube_metrics_daily')
    .select('metric_date, variant_id, views, estimated_revenue_usd')
    .order('metric_date', { ascending: false })
    .limit(10);
  console.log('=== youtube_metrics_daily 直近 10 行 ===');
  for (const r of latest ?? []) {
    console.log(`  ${r.metric_date} | views=${r.views} | rev=$${r.estimated_revenue_usd}`);
  }

  // 2. metric_date 別の行数（直近10日）
  const { data: byDate } = await s
    .from('youtube_metrics_daily')
    .select('metric_date')
    .order('metric_date', { ascending: false })
    .limit(6000);
  const counts: Record<string, number> = {};
  for (const r of byDate ?? []) {
    counts[r.metric_date] = (counts[r.metric_date] ?? 0) + 1;
  }
  console.log('\n=== 直近10日 metric_date ごとの行数 ===');
  for (const d of Object.keys(counts).sort().reverse().slice(0, 10)) {
    console.log(`  ${d}: ${counts[d]} 行`);
  }

  // 3. ingestion_log の YouTube 関連の直近実行
  const { data: logs } = await s
    .from('ingestion_log')
    .select('*')
    .eq('platform', 'youtube')
    .order('started_at', { ascending: false })
    .limit(10);
  console.log('\n=== ingestion_log YouTube 関連の直近 10 行 ===');
  for (const r of logs ?? []) {
    console.log(JSON.stringify(r, null, 2));
  }
})();
