import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const rows = await fetchAllPages<{sale_date: string; platform: string; language: string; revenue_jpy: number | null}>(
    s, 'sales_unified_daily', (q) => q.select('sale_date, platform, language, revenue_jpy')
  );
  const byYm: Record<string, {dlsite:number; fanza:number; yt:number; rows:number}> = {};
  const byLang: Record<string, number> = {};
  for (const r of rows) {
    const ym = String(r.sale_date).slice(0,7);
    byYm[ym] ??= {dlsite:0, fanza:0, yt:0, rows:0};
    const v = r.revenue_jpy ?? 0;
    if (r.platform === 'dlsite') byYm[ym].dlsite += v;
    if (r.platform === 'fanza') byYm[ym].fanza += v;
    if (r.platform === 'youtube') byYm[ym].yt += v;
    byYm[ym].rows++;
    byLang[r.language] = (byLang[r.language] ?? 0) + v;
  }
  const months = Object.keys(byYm).sort();
  console.log(`Range: ${months[0]} 〜 ${months[months.length-1]} / ${months.length} months / ${rows.length} rows\n`);
  console.log('Month\tDLsite\tFanza\tYouTube\tRows');
  for (const m of months) {
    const x = byYm[m];
    console.log(`${m}\t${x.dlsite}\t${x.fanza}\t${x.yt}\t${x.rows}`);
  }
  console.log('\nBy language:');
  for (const [k, v] of Object.entries(byLang).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k}: ¥${v.toLocaleString()}`);
  }
})();
