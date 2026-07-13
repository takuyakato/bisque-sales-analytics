import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { createServiceClient } from '../src/lib/supabase/service';

type MetricRow = {
  metric_date: string;
  channel_id: string;
  channel_name: string;
  video_id: string;
  views: number | null;
  estimated_revenue_usd: number | null;
  membership_revenue_usd: number | null;
  ingestion_log_id: string | null;
  product_variants: { language: string | null } | null;
  ingestion_log: { runner: string | null; status: string | null; completed_at: string | null } | null;
};

type UnifiedRow = {
  sale_date: string;
  language: string | null;
  revenue_jpy: number | null;
  views: number | null;
};

async function fetchAll<T>(
  queryFactory: (from: number, to: number) => unknown,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const query = queryFactory(from, from + pageSize - 1) as PromiseLike<{ data: T[] | null; error: Error | null }>;
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function add<K extends string>(
  map: Map<K, { rows: number; videos: Set<string>; views: number; usd: number; jpy: number }>,
  key: K,
  row: { video_id?: string; views?: number | null; usd?: number | null; jpy?: number | null }
) {
  const entry = map.get(key) ?? { rows: 0, videos: new Set<string>(), views: 0, usd: 0, jpy: 0 };
  entry.rows += 1;
  if (row.video_id) entry.videos.add(row.video_id);
  entry.views += row.views ?? 0;
  entry.usd += row.usd ?? 0;
  entry.jpy += row.jpy ?? 0;
  map.set(key, entry);
}

(async () => {
  const s = createServiceClient();
  const from = '2026-05-01';
  const to = '2026-05-11';

  const metrics = await fetchAll<MetricRow>((rangeFrom, rangeTo) =>
    s
      .from('youtube_metrics_daily')
      .select(
        'metric_date, channel_id, channel_name, video_id, views, estimated_revenue_usd, membership_revenue_usd, ingestion_log_id, product_variants(language), ingestion_log(runner, status, completed_at)'
      )
      .gte('metric_date', from)
      .lte('metric_date', to)
      .order('metric_date', { ascending: true })
      .range(rangeFrom, rangeTo)
  );

  const byDateChannel = new Map<string, { rows: number; videos: Set<string>; views: number; usd: number; jpy: number }>();
  const byDateLanguage = new Map<string, { rows: number; videos: Set<string>; views: number; usd: number; jpy: number }>();
  const byDateLog = new Map<string, { rows: number; videos: Set<string>; views: number; usd: number; jpy: number }>();
  const channels = new Map<string, string>();

  for (const r of metrics) {
    const usd = (r.estimated_revenue_usd ?? 0) + (r.membership_revenue_usd ?? 0);
    const lang = r.product_variants?.language ?? 'unknown';
    channels.set(r.channel_id, r.channel_name);
    add(byDateChannel, `${r.metric_date}\t${r.channel_name}`, {
      video_id: r.video_id,
      views: r.views,
      usd,
    });
    add(byDateLanguage, `${r.metric_date}\t${lang}`, {
      video_id: r.video_id,
      views: r.views,
      usd,
    });
    add(
      byDateLog,
      `${r.metric_date}\t${r.ingestion_log?.runner ?? 'unknown'}\t${r.ingestion_log?.status ?? 'unknown'}\t${r.ingestion_log?.completed_at ?? 'not_completed'}\t${r.ingestion_log_id ?? 'null'}`,
      {
        video_id: r.video_id,
        views: r.views,
        usd,
      }
    );
  }

  const unified = await fetchAll<UnifiedRow>((rangeFrom, rangeTo) =>
    s
      .from('sales_unified_daily')
      .select('sale_date, language, revenue_jpy, views')
      .eq('platform', 'youtube')
      .gte('sale_date', from)
      .lte('sale_date', to)
      .order('sale_date', { ascending: true })
      .range(rangeFrom, rangeTo)
  );

  const unifiedByDateLanguage = new Map<
    string,
    { rows: number; videos: Set<string>; views: number; usd: number; jpy: number }
  >();
  for (const r of unified) {
    add(unifiedByDateLanguage, `${r.sale_date}\t${r.language ?? 'unknown'}`, {
      views: r.views,
      jpy: r.revenue_jpy,
    });
  }

  console.log(`=== 対象期間: ${from} 〜 ${to} ===`);
  console.log(`youtube_metrics_daily rows: ${metrics.length}`);
  console.log(`channels:`);
  for (const [id, name] of channels) console.log(`  ${name}: ${id}`);

  console.log('\n=== metric_date × channel ===');
  console.log('date\tchannel\trows\tvideos\tviews\tusd');
  for (const [key, v] of [...byDateChannel.entries()].sort()) {
    const [date, channel] = key.split('\t');
    console.log(`${date}\t${channel}\t${v.rows}\t${v.videos.size}\t${v.views}\t${v.usd.toFixed(3)}`);
  }

  console.log('\n=== metric_date × product_variants.language ===');
  console.log('date\tlanguage\trows\tvideos\tviews\tusd');
  for (const [key, v] of [...byDateLanguage.entries()].sort()) {
    const [date, language] = key.split('\t');
    console.log(`${date}\t${language}\t${v.rows}\t${v.videos.size}\t${v.views}\t${v.usd.toFixed(3)}`);
  }

  console.log('\n=== sales_unified_daily × language ===');
  console.log('date\tlanguage\trows\tviews\tjpy');
  for (const [key, v] of [...unifiedByDateLanguage.entries()].sort()) {
    const [date, language] = key.split('\t');
    console.log(`${date}\t${language}\t${v.rows}\t${v.views}\t${Math.round(v.jpy)}`);
  }

  console.log('\n=== metric_date × ingestion_log ===');
  console.log('date\trunner\tstatus\tcompleted_at\tlog_id\trows\tvideos\tviews\tusd');
  for (const [key, v] of [...byDateLog.entries()].sort()) {
    const [date, runner, status, completedAt, logId] = key.split('\t');
    console.log(`${date}\t${runner}\t${status}\t${completedAt}\t${logId}\t${v.rows}\t${v.videos.size}\t${v.views}\t${v.usd.toFixed(3)}`);
  }
})();
