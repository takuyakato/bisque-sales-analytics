import { readFileSync } from 'fs';
import { createServiceClient } from '../src/lib/supabase/service';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

type UnifiedRow = {
  sale_date: string;
  work_id: string | null;
  brand: string;
  platform: string;
  language: string;
  aggregation_unit: string;
  revenue_jpy: number | null;
  sales_count: number | null;
};

type SummaryRow = {
  sale_date: string;
  brand: string;
  platform: string;
  language: string;
  revenue: number | null;
  sales_count: number | null;
};

async function fetchAll<T>(
  table: string,
  build: (query: ReturnType<ReturnType<typeof createServiceClient>['from']>) => unknown
): Promise<T[]> {
  const supabase = createServiceClient();
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const query = build(supabase.from(table)) as {
      range: (from: number, to: number) => Promise<{ data: T[] | null; error: Error | null }>;
    };
    const { data, error } = await query.range(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function sum<T extends Record<string, unknown>>(rows: T[], key: keyof T): number {
  return rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
}

function addToMap(
  map: Record<string, { rows: number; rev: number; count: number }>,
  key: string,
  revenue: number,
  count: number
) {
  map[key] ??= { rows: 0, rev: 0, count: 0 };
  map[key].rows += 1;
  map[key].rev += revenue;
  map[key].count += count;
}

async function main() {
  const ym = process.argv[2] ?? '2026-05';
  const from = `${ym}-01`;
  const monthEnd = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const to = `${ym}-${String(monthEnd).padStart(2, '0')}`;
  const supabase = createServiceClient();

  const { data: works, error: worksError } = await supabase
    .from('works')
    .select('id,title,slug')
    .eq('brand', 'CAPURI');
  if (worksError) throw worksError;
  const titleByWorkId = new Map(
    (works ?? []).map((w) => [w.id as string, ((w.slug as string | null) ?? (w.title as string | null) ?? '')])
  );

  const unified = await fetchAll<UnifiedRow>('sales_unified_daily', (q) =>
    q
      .select('sale_date,work_id,brand,platform,language,aggregation_unit,revenue_jpy,sales_count')
      .eq('platform', 'dlsite')
      .eq('brand', 'CAPURI')
      .gte('sale_date', from)
      .lte('sale_date', to)
  );

  const summary = await fetchAll<SummaryRow>('daily_breakdown_summary', (q) =>
    q
      .select('sale_date,brand,platform,language,revenue,sales_count')
      .eq('platform', 'dlsite')
      .eq('brand', 'CAPURI')
      .gte('sale_date', from)
      .lte('sale_date', to)
  );

  console.log(`=== DLsite CAPURI ${ym} ===`);
  console.log(`sales_unified_daily: rows=${unified.length}, revenue=${sum(unified, 'revenue_jpy')}, sales_count=${sum(unified, 'sales_count')}`);
  console.log(`daily_breakdown_summary: rows=${summary.length}, revenue=${sum(summary, 'revenue')}, sales_count=${sum(summary, 'sales_count')}`);

  const byUnit: Record<string, { rows: number; rev: number; count: number }> = {};
  const byDate: Record<string, { rows: number; rev: number; count: number }> = {};
  const byWork: Record<string, { rows: number; rev: number; count: number }> = {};

  for (const r of unified) {
    const revenue = Number(r.revenue_jpy ?? 0);
    const count = Number(r.sales_count ?? 0);
    addToMap(byUnit, r.aggregation_unit, revenue, count);
    addToMap(byDate, r.sale_date, revenue, count);
    addToMap(byWork, `${r.work_id ?? '(no work)'} ${titleByWorkId.get(r.work_id ?? '') ?? ''}`, revenue, count);
  }

  console.log('\n=== aggregation_unit ===');
  for (const [key, value] of Object.entries(byUnit)) console.log(key, value);

  console.log('\n=== by date ===');
  for (const [key, value] of Object.entries(byDate).sort()) console.log(key, value);

  console.log('\n=== top works ===');
  for (const [key, value] of Object.entries(byWork).sort((a, b) => b[1].rev - a[1].rev).slice(0, 20)) {
    console.log(value, key);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
