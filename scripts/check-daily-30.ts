import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const now = new Date();
  const from30 = new Date(now);
  from30.setDate(from30.getDate() - 30);
  const from30str = from30.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const rows = await fetchAllPages<{ sale_date: string; platform: string; revenue_jpy: number | null }>(
    s,
    'sales_unified_daily',
    (q) => q.select('sale_date, platform, revenue_jpy').gte('sale_date', from30str).lte('sale_date', today)
  );
  console.log(`直近30日 rows: ${rows.length}`);

  const byDate: Record<string, { dlsite: number; fanza: number; youtube: number }> = {};
  for (const r of rows) {
    byDate[r.sale_date] ??= { dlsite: 0, fanza: 0, youtube: 0 };
    if (r.platform === 'dlsite' || r.platform === 'fanza' || r.platform === 'youtube') {
      byDate[r.sale_date][r.platform] += r.revenue_jpy ?? 0;
    }
  }
  console.log('日付\tDLsite\tFanza\tYouTube');
  for (const [d, v] of Object.entries(byDate).sort()) {
    console.log(`${d}\t${v.dlsite}\t${v.fanza}\t${v.youtube}`);
  }
})();
