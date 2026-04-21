import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // youtube_metrics_daily の集計
  const { count: totalCount } = await s
    .from('youtube_metrics_daily')
    .select('*', { count: 'exact', head: true });

  const { data: byChannel } = await s
    .from('youtube_metrics_daily')
    .select('channel_id, channel_name')
    .limit(1000);

  const channels = new Map<string, { name: string; count: number }>();
  for (const r of byChannel ?? []) {
    const entry = channels.get(r.channel_id) ?? { name: r.channel_name, count: 0 };
    entry.count++;
    channels.set(r.channel_id, entry);
  }

  console.log(`youtube_metrics_daily 総行数: ${totalCount}\n`);
  for (const [id, { name, count }] of channels) {
    console.log(`  ${name} (${id}): ${count}行（上位1000件からカウント）`);
  }

  // sales_unified_daily で youtube の円換算後集計
  const { data: ytUnified } = await s
    .from('sales_unified_daily')
    .select('sale_date, revenue_jpy, views')
    .eq('platform', 'youtube')
    .order('sale_date', { ascending: false })
    .limit(100);

  const totalRev = (ytUnified ?? []).reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  const totalViews = (ytUnified ?? []).reduce((a, r) => a + (r.views ?? 0), 0);
  console.log(`\nsales_unified_daily (youtube 上位100行):`);
  console.log(`  合計円換算: ¥${totalRev.toLocaleString()}`);
  console.log(`  合計views: ${totalViews.toLocaleString()}`);
})();
