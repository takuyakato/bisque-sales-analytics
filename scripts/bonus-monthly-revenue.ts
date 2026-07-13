import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const from = '2025-01-01';

  const rows = await fetchAllPages<{ sale_date: string; brand: string | null; platform: string; revenue: number | null }>(
    s,
    'daily_breakdown_summary',
    (q) => q.select('sale_date, brand, platform, revenue').gte('sale_date', from)
  );

  const byMonth: Record<string, { total: number; brands: Record<string, number> }> = {};
  for (const r of rows) {
    const ym = r.sale_date.slice(0, 7);
    byMonth[ym] ??= { total: 0, brands: {} };
    const rev = Number(r.revenue ?? 0);
    byMonth[ym].total += rev;
    const b = r.brand ?? 'unknown';
    byMonth[ym].brands[b] = (byMonth[ym].brands[b] ?? 0) + rev;
  }

  const months = Object.keys(byMonth).sort();
  console.log('rows:', rows.length);
  console.log('月\t合計\tCAPURI\tBerryFeel\tBLsand');
  for (const ym of months) {
    const d = byMonth[ym];
    console.log(
      `${ym}\t${Math.round(d.total).toLocaleString()}\t${Math.round(d.brands['CAPURI'] ?? 0).toLocaleString()}\t${Math.round(d.brands['BerryFeel'] ?? 0).toLocaleString()}\t${Math.round(d.brands['BLsand'] ?? 0).toLocaleString()}`
    );
  }
  const allBrands = new Set<string>();
  for (const ym of months) for (const b of Object.keys(byMonth[ym].brands)) allBrands.add(b);
  console.log('検出ブランド:', [...allBrands].join(', '));
})();
