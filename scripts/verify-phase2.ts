import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // 列が DROP されたか確認
  const { data: sd } = await s.from('sales_daily').select('*').limit(1);
  if (sd && sd.length > 0) {
    const cols = Object.keys(sd[0]);
    console.log('sales_daily columns:', cols.join(', '));
    console.log('  work_id DROPPED:', !cols.includes('work_id') ? 'YES' : 'NO');
    console.log('  platform DROPPED:', !cols.includes('platform') ? 'YES' : 'NO');
  }
  const { data: yt } = await s.from('youtube_metrics_daily').select('*').limit(1);
  if (yt && yt.length > 0) {
    const cols = Object.keys(yt[0]);
    console.log('\nyoutube_metrics_daily columns:', cols.slice(0, 10).join(', '), '...');
    console.log('  work_id DROPPED:', !cols.includes('work_id') ? 'YES' : 'NO');
  }

  // VIEWが動作するか
  console.log('\n=== VIEW動作確認 ===');
  const { count: c1 } = await s.from('sales_unified_daily').select('*', { count: 'exact', head: true });
  console.log(`sales_unified_daily: ${c1} 行`);

  const mpResult = await s.from('monthly_platform_summary').select('year_month, platform, revenue').limit(3);
  console.log(`monthly_platform_summary:`, mpResult.error ? `ERROR: ${mpResult.error.message}` : mpResult.data);

  const { data: mv } = await s
    .from('work_revenue_summary')
    .select('work_id, platform, revenue_all, revenue_y1, revenue_d30')
    .order('revenue_all', { ascending: false })
    .limit(3);
  console.log(`work_revenue_summary sample:`, mv);
})();
