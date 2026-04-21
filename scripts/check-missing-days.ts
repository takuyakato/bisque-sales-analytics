import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  // DLsite: 2022-02-01 〜 2026-04-30 で daily 行がない日
  // Fanza: 2025-11-01 〜 2026-04-21 で daily 行がない日
  for (const plat of [
    { platform: 'dlsite', from: '2022-02-01', to: '2026-04-30' },
    { platform: 'fanza', from: '2025-11-01', to: '2026-04-21' },
  ]) {
    const rows = await fetchAllPages<{ sale_date: string }>(
      s,
      'sales_daily',
      (q) =>
        q
          .select('sale_date')
          .eq('platform', plat.platform)
          .eq('aggregation_unit', 'daily')
          .gte('sale_date', plat.from)
          .lte('sale_date', plat.to)
    );
    const seen = new Set(rows.map((r) => r.sale_date));
    const missing: string[] = [];
    const start = new Date(plat.from);
    const end = new Date(plat.to);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!seen.has(iso)) missing.push(iso);
    }
    console.log(`\n[${plat.platform}] ${plat.from}〜${plat.to} で daily 行が無い日: ${missing.length}`);
    if (missing.length < 30) console.log(`  ${missing.join(', ')}`);
    else console.log(`  最初の10件: ${missing.slice(0, 10).join(', ')}`);
  }
})();
