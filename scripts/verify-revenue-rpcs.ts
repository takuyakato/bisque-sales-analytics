import { existsSync, readFileSync } from 'fs';
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

interface Work {
  id: string;
  brand: string;
}

interface Variant {
  id: string;
  work_id: string | null;
  platform: string;
  product_id: string;
  language: string;
  origin_status: string | null;
}

interface Sale {
  id: string;
  variant_id: string;
  net_revenue_jpy: number | null;
  sales_count: number | null;
  aggregation_unit: string;
}

interface ExpectedTotal {
  revenue: number;
  sales: number;
  variantCount: number;
  byPlatform: Record<string, number>;
  byLanguage: Record<string, number>;
}

function stableObject(value: Record<string, number>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

async function main() {
  const productIndex = process.argv.indexOf('--product');
  const productId = productIndex >= 0 ? process.argv[productIndex + 1] : undefined;
  if (productIndex >= 0 && !productId) throw new Error('--product の後に product_id を指定してください');

  const supabase = createServiceClient();
  const [works, variants, sales] = await Promise.all([
    fetchAllPages<Work>(supabase, 'works', (q) => q.select('id, brand'), {
      order: ['id'], uniqueKey: ['id'],
    }),
    fetchAllPages<Variant>(
      supabase,
      'product_variants',
      (q) => q.select('id, work_id, platform, product_id, language, origin_status'),
      { order: ['id'], uniqueKey: ['id'] }
    ),
    fetchAllPages<Sale>(
      supabase,
      'sales_daily',
      (q) => q.select('id, variant_id, net_revenue_jpy, sales_count, aggregation_unit'),
      { order: ['id'], uniqueKey: ['id'] }
    ),
  ]);

  const failures: string[] = [];
  const workById = new Map(works.map((work) => [work.id, work]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const variantsByWork = new Map<string, Variant[]>();
  const totalsByWork = new Map<string, ExpectedTotal>();
  const revenueByVariant = new Map<string, number>();

  for (const work of works) {
    totalsByWork.set(work.id, {
      revenue: 0,
      sales: 0,
      variantCount: 0,
      byPlatform: {},
      byLanguage: {},
    });
  }
  for (const variant of variants) {
    if (!variant.work_id) continue;
    const list = variantsByWork.get(variant.work_id) ?? [];
    list.push(variant);
    variantsByWork.set(variant.work_id, list);
    const total = totalsByWork.get(variant.work_id);
    if (total) {
      total.variantCount++;
      total.byPlatform[variant.platform] ??= 0;
      total.byLanguage[variant.language] ??= 0;
    }
  }
  let monthlyRows = 0;
  for (const sale of sales) {
    if (sale.aggregation_unit === 'monthly') monthlyRows++;
    const revenue = Number(sale.net_revenue_jpy ?? 0);
    const count = Number(sale.sales_count ?? 0);
    revenueByVariant.set(sale.variant_id, (revenueByVariant.get(sale.variant_id) ?? 0) + revenue);
    const variant = variantById.get(sale.variant_id);
    if (!variant?.work_id) continue;
    const total = totalsByWork.get(variant.work_id);
    if (!total) continue;
    total.revenue += revenue;
    total.sales += count;
    total.byPlatform[variant.platform] = (total.byPlatform[variant.platform] ?? 0) + revenue;
    total.byLanguage[variant.language] = (total.byLanguage[variant.language] ?? 0) + revenue;
  }

  const { data: coverageData, error: coverageError } = await supabase.rpc('get_overseas_coverage');
  if (coverageError) throw coverageError;
  const coverage = coverageData ?? [];
  if (coverage.length > 0 && coverage.length !== Number(coverage[0].total_count)) {
    failures.push(`coverage total_count: expected=${coverage[0].total_count} actual=${coverage.length}`);
  }

  const expectedEligible = works.filter((work) =>
    (work.brand === 'CAPURI' || work.brand === 'BerryFeel')
      && (variantsByWork.get(work.id) ?? []).some(
        (variant) => variant.platform === 'dlsite' && variant.language === 'ja'
      )
  );
  const coverageWorks = coverage.filter((row) => row.kind === 'work');
  if (coverageWorks.length !== expectedEligible.length) {
    failures.push(`coverage work rows: expected=${expectedEligible.length} actual=${coverageWorks.length}`);
  }
  for (const row of coverageWorks) {
    const dlsite = (variantsByWork.get(row.work_id) ?? []).filter((variant) => variant.platform === 'dlsite');
    const ja = dlsite.filter((variant) => variant.language === 'ja');
    const expectedJaRevenue = ja.reduce((sum, variant) => sum + (revenueByVariant.get(variant.id) ?? 0), 0);
    const expectedAllRevenue = dlsite.reduce((sum, variant) => sum + (revenueByVariant.get(variant.id) ?? 0), 0);
    const expectedIds = ja.map((variant) => variant.product_id).sort();
    const checks: Array<[string, unknown, unknown]> = [
      ['revenue_ja_jpy', expectedJaRevenue, Number(row.revenue_ja_jpy)],
      ['revenue_all_lang_jpy', expectedAllRevenue, Number(row.revenue_all_lang_jpy)],
      ['has_en', dlsite.some((variant) => variant.language === 'en'), row.has_en],
      ['has_zh_hans', dlsite.some((variant) => variant.language === 'zh-Hans'), row.has_zh_hans],
      ['has_zh_hant', dlsite.some((variant) => variant.language === 'zh-Hant'), row.has_zh_hant],
      ['has_ko', dlsite.some((variant) => variant.language === 'ko'), row.has_ko],
      ['ja_product_ids', JSON.stringify(expectedIds), JSON.stringify(row.ja_product_ids)],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== actual) failures.push(`coverage ${row.work_id} ${name}: expected=${expected} actual=${actual}`);
    }
  }

  const expectedUnlinked = variants.filter((variant) => {
    const work = variant.work_id ? workById.get(variant.work_id) : undefined;
    return variant.platform === 'dlsite'
      && (work?.brand === 'CAPURI' || work?.brand === 'BerryFeel')
      && variant.language !== 'ja'
      && variant.origin_status !== 'standalone'
      && !(variantsByWork.get(variant.work_id ?? '') ?? []).some(
        (candidate) => candidate.platform === 'dlsite' && candidate.language === 'ja'
      );
  });
  const actualUnlinked = coverage.filter((row) => row.kind === 'unlinked');
  if (actualUnlinked.length !== expectedUnlinked.length) {
    failures.push(`coverage unlinked rows: expected=${expectedUnlinked.length} actual=${actualUnlinked.length}`);
  }

  const workIds = works.map((work) => work.id);
  const { data: totalData, error: totalError } = await supabase.rpc('get_work_revenue_totals', {
    work_ids: workIds,
  });
  if (totalError) throw totalError;
  const rpcTotals = totalData ?? [];
  if (rpcTotals.length > 0 && rpcTotals.length !== Number(rpcTotals[0].total_count)) {
    failures.push(`work totals total_count: expected=${rpcTotals[0].total_count} actual=${rpcTotals.length}`);
  }
  if (rpcTotals.length !== works.length) {
    failures.push(`work totals rows: expected=${works.length} actual=${rpcTotals.length}`);
  }
  for (const row of rpcTotals) {
    const expected = totalsByWork.get(row.work_id);
    if (!expected) {
      failures.push(`work totals unexpected work_id=${row.work_id}`);
      continue;
    }
    if (Number(row.revenue_jpy) !== expected.revenue) failures.push(`work ${row.work_id} revenue_jpy mismatch`);
    if (Number(row.sales_count) !== expected.sales) failures.push(`work ${row.work_id} sales_count mismatch`);
    if (Number(row.variant_count) !== expected.variantCount) failures.push(`work ${row.work_id} variant_count mismatch`);
    if (stableObject(row.by_platform as Record<string, number>) !== stableObject(expected.byPlatform)) {
      failures.push(`work ${row.work_id} by_platform mismatch`);
    }
  }

  const { data: monthlyData, error: monthlyError } = await supabase.rpc('count_monthly_rows');
  if (monthlyError) throw monthlyError;
  if (Number(monthlyData) !== monthlyRows) {
    failures.push(`monthly rows: expected=${monthlyRows} actual=${monthlyData}`);
  }

  if (productId) {
    const variant = variants.find((candidate) => candidate.product_id === productId);
    if (!variant?.work_id) {
      failures.push(`product ${productId} に紐付く work がありません`);
    } else {
      const rpc = rpcTotals.find((row) => row.work_id === variant.work_id);
      const expected = totalsByWork.get(variant.work_id);
      console.log(JSON.stringify({
        product_id: productId,
        work_id: variant.work_id,
        rpc_revenue_jpy: Number(rpc?.revenue_jpy ?? 0),
        independent_revenue_jpy: expected?.revenue ?? 0,
      }));
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`NG: ${failure}`);
    process.exit(1);
  }
  console.log('ALL OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
