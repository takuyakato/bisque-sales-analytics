import { createServiceClient } from '@/lib/supabase/service';

const BUCKET = 'bisque-snapshots';

/**
 * Claude Code / 戦略ドキュメント連携用のCSVスナップショットを生成して
 * Supabase Storage にアップロード（v3.6 §8-1 準拠）
 *
 * 出力:
 *   latest/sales_by_work.csv
 *   latest/sales_by_platform.csv
 *   latest/sales_by_language.csv
 *   latest/youtube_metrics.csv
 *   latest/summary.csv
 *   daily/YYYY-MM-DD.csv          （当日実行分のサマリをアーカイブ）
 */
export async function generateSnapshots(): Promise<{
  files: string[];
  totalRevenueJpy: number;
}> {
  const supabase = createServiceClient();
  await ensureBucket(supabase);

  // --- sales_unified_daily 全行を取得（1000行制限を超えてページング） ---
  const rows: Array<{
    sale_date: string;
    aggregation_unit: string;
    work_id: string;
    brand: string;
    platform: string;
    language: string;
    product_id: string | null;
    revenue_jpy: number | null;
    sales_count: number | null;
    views: number | null;
  }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data: chunk, error } = await supabase
      .from('sales_unified_daily')
      .select('sale_date, aggregation_unit, work_id, brand, platform, language, product_id, revenue_jpy, sales_count, views')
      .order('sale_date', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !chunk || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  const daily = rows.filter((r) => r.aggregation_unit === 'daily');
  const monthly = rows.filter((r) => r.aggregation_unit === 'monthly');

  // --- works 情報を取得してマージ用に ---
  const { data: works } = await supabase.from('works').select('id, title, slug, brand');
  const workMap = new Map((works ?? []).map((w) => [w.id, w]));

  // 1. sales_by_work.csv（作品別累計＋直近30日）
  const byWork = new Map<string, { total: number; last30: number; count: number; count30: number }>();
  const today = new Date();
  const from30 = fmtDate(addDays(today, -30));
  for (const r of daily) {
    const v = r.revenue_jpy ?? 0;
    const c = r.sales_count ?? 0;
    const cur = byWork.get(r.work_id) ?? { total: 0, last30: 0, count: 0, count30: 0 };
    cur.total += v;
    cur.count += c;
    if (r.sale_date >= from30) {
      cur.last30 += v;
      cur.count30 += c;
    }
    byWork.set(r.work_id, cur);
  }
  // 月次分も累計に加算
  for (const r of monthly) {
    const v = r.revenue_jpy ?? 0;
    const c = r.sales_count ?? 0;
    const cur = byWork.get(r.work_id) ?? { total: 0, last30: 0, count: 0, count30: 0 };
    cur.total += v;
    cur.count += c;
    byWork.set(r.work_id, cur);
  }

  const salesByWorkCsv = [
    'work_id,slug,title,brand,total_revenue_jpy,total_sales_count,last30d_revenue_jpy,last30d_sales_count',
    ...Array.from(byWork.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([id, v]) => {
        const w = workMap.get(id);
        const title = (w?.title ?? id).replace(/"/g, '""');
        return `${id},${w?.slug ?? ''},"${title}",${w?.brand ?? ''},${v.total},${v.count},${v.last30},${v.count30}`;
      }),
  ].join('\n');

  // 2. sales_by_platform.csv（プラットフォーム×月）
  const platformByMonth = new Map<string, Map<string, number>>();
  for (const r of [...daily, ...monthly]) {
    const ym = String(r.sale_date).slice(0, 7);
    const m = platformByMonth.get(ym) ?? new Map();
    m.set(r.platform, (m.get(r.platform) ?? 0) + (r.revenue_jpy ?? 0));
    platformByMonth.set(ym, m);
  }
  const salesByPlatformCsv = [
    'month,platform,revenue_jpy',
    ...Array.from(platformByMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([ym, m]) =>
        Array.from(m.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([p, v]) => `${ym},${p},${v}`)
      ),
  ].join('\n');

  // 3. sales_by_language.csv（言語×月）
  const langByMonth = new Map<string, Map<string, number>>();
  for (const r of [...daily, ...monthly]) {
    const ym = String(r.sale_date).slice(0, 7);
    const m = langByMonth.get(ym) ?? new Map();
    m.set(r.language, (m.get(r.language) ?? 0) + (r.revenue_jpy ?? 0));
    langByMonth.set(ym, m);
  }
  const salesByLanguageCsv = [
    'month,language,revenue_jpy',
    ...Array.from(langByMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([ym, m]) =>
        Array.from(m.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([l, v]) => `${ym},${l},${v}`)
      ),
  ].join('\n');

  // 4. youtube_metrics.csv
  const { data: yt } = await supabase
    .from('youtube_metrics_daily')
    .select('metric_date, channel_name, video_id, video_title, views, watch_time_minutes, subscribers_gained, estimated_revenue_usd, membership_revenue_usd')
    .order('metric_date', { ascending: false })
    .limit(10000);

  const youtubeCsv = [
    'metric_date,channel_name,video_id,video_title,views,watch_time_minutes,subscribers_gained,estimated_revenue_usd,membership_revenue_usd',
    ...(yt ?? []).map((r) => {
      const title = (r.video_title ?? '').replace(/"/g, '""').replace(/\n/g, ' ');
      return `${r.metric_date},${r.channel_name},${r.video_id},"${title}",${r.views ?? 0},${r.watch_time_minutes ?? 0},${r.subscribers_gained ?? 0},${r.estimated_revenue_usd ?? 0},${r.membership_revenue_usd ?? 0}`;
    }),
  ].join('\n');

  // 5. summary.csv（概況）
  const totalRevenue = [...daily, ...monthly].reduce((a, r) => a + (r.revenue_jpy ?? 0), 0);
  const dailyCount = daily.length;
  const monthlyCount = monthly.length;
  const platforms = new Set(rows.map((r) => r.platform)).size;
  const languages = new Set(rows.map((r) => r.language)).size;
  const workCount = byWork.size;
  const { count: variantCount } = await supabase
    .from('product_variants')
    .select('*', { count: 'exact', head: true });

  const summaryCsv = [
    'key,value',
    `snapshot_at,${new Date().toISOString()}`,
    `total_revenue_jpy,${totalRevenue}`,
    `rows_daily,${dailyCount}`,
    `rows_monthly,${monthlyCount}`,
    `platforms,${platforms}`,
    `languages,${languages}`,
    `works,${workCount}`,
    `product_variants,${variantCount ?? 0}`,
  ].join('\n');

  // アップロード
  const todayStr = fmtDate(today);
  const uploads: Array<{ path: string; body: string }> = [
    { path: 'latest/sales_by_work.csv', body: salesByWorkCsv },
    { path: 'latest/sales_by_platform.csv', body: salesByPlatformCsv },
    { path: 'latest/sales_by_language.csv', body: salesByLanguageCsv },
    { path: 'latest/youtube_metrics.csv', body: youtubeCsv },
    { path: 'latest/summary.csv', body: summaryCsv },
    { path: `daily/${todayStr}.csv`, body: summaryCsv },
  ];

  const uploaded: string[] = [];
  for (const u of uploads) {
    const buffer = Buffer.from(u.body, 'utf-8');
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(u.path, buffer, { contentType: 'text/csv; charset=utf-8', upsert: true });
    if (error) {
      console.warn(`snapshot upload failed for ${u.path}: ${error.message}`);
    } else {
      uploaded.push(u.path);
    }
  }

  return { files: uploaded, totalRevenueJpy: totalRevenue };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

async function ensureBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false });
}
