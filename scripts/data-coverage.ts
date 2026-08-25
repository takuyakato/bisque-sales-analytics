import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

interface Variant {
  id: string;
  platform: string;
  language: string;
}

interface Sale {
  id: string;
  variant_id: string;
  sale_date: string;
  net_revenue_jpy: number | null;
}

interface YoutubeMetric {
  id: string;
  variant_id: string | null;
  metric_date: string;
  estimated_revenue_jpy: number | null;
  estimated_revenue_usd: number | null;
  membership_revenue_usd: number | null;
}

(async () => {
  const s = createServiceClient();
  const [variants, sales, youtube, ratesResult, fallbackResult] = await Promise.all([
    fetchAllPages<Variant>(s, 'product_variants', (q) => q.select('id, platform, language'), {
      order: ['id'], uniqueKey: ['id'],
    }),
    fetchAllPages<Sale>(s, 'sales_daily', (q) => q.select('id, variant_id, sale_date, net_revenue_jpy'), {
      order: ['id'], uniqueKey: ['id'],
    }),
    fetchAllPages<YoutubeMetric>(
      s,
      'youtube_metrics_daily',
      (q) => q.select('id, variant_id, metric_date, estimated_revenue_jpy, estimated_revenue_usd, membership_revenue_usd'),
      { order: ['id'], uniqueKey: ['id'] }
    ),
    s.from('daily_rates').select('rate_date, usd_jpy'),
    s.from('app_settings').select('value').eq('key', 'usd_jpy_rate').single(),
  ]);

  if (ratesResult.error) throw ratesResult.error;
  if (fallbackResult.error) throw fallbackResult.error;
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const rates = new Map((ratesResult.data ?? []).map((rate) => [rate.rate_date, Number(rate.usd_jpy)]));
  const fallbackRate = Number(fallbackResult.data.value);
  const byYm: Record<string, { dlsite: number; fanza: number; yt: number; rows: number }> = {};
  const byLang: Record<string, number> = {};
  let rowCount = 0;

  const add = (date: string, platform: string, language: string, revenue: number) => {
    const ym = date.slice(0, 7);
    byYm[ym] ??= { dlsite: 0, fanza: 0, yt: 0, rows: 0 };
    if (platform === 'dlsite') byYm[ym].dlsite += revenue;
    if (platform === 'fanza') byYm[ym].fanza += revenue;
    if (platform === 'youtube') byYm[ym].yt += revenue;
    byYm[ym].rows++;
    rowCount++;
    byLang[language] = (byLang[language] ?? 0) + revenue;
  };

  for (const row of sales) {
    const variant = variantById.get(row.variant_id);
    if (!variant) continue;
    add(row.sale_date, variant.platform, variant.language ?? 'unknown', Number(row.net_revenue_jpy ?? 0));
  }
  for (const row of youtube) {
    const rate = rates.get(row.metric_date) ?? fallbackRate;
    const membershipJpy = Number(row.membership_revenue_usd ?? 0) * rate;
    const revenue = row.estimated_revenue_jpy !== null
      ? Math.round(Number(row.estimated_revenue_jpy) + membershipJpy)
      : Math.round(
          (Number(row.estimated_revenue_usd ?? 0) + Number(row.membership_revenue_usd ?? 0)) * rate
        );
    const language = row.variant_id ? variantById.get(row.variant_id)?.language ?? 'unknown' : 'unknown';
    add(row.metric_date, 'youtube', language, revenue);
  }

  const months = Object.keys(byYm).sort();
  console.log(`Range: ${months[0]} 〜 ${months[months.length - 1]} / ${months.length} months / ${rowCount} rows\n`);
  console.log('Month\tDLsite\tFanza\tYouTube\tRows');
  for (const month of months) {
    const values = byYm[month];
    console.log(`${month}\t${values.dlsite}\t${values.fanza}\t${values.yt}\t${values.rows}`);
  }
  console.log('\nBy language:');
  for (const [language, revenue] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${language}: ¥${revenue.toLocaleString()}`);
  }
})();
