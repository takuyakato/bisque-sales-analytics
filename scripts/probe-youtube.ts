#!/usr/bin/env tsx
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { YoutubeScraper } from '../src/lib/scrapers/youtube';

const label = (process.argv[2] ?? 'jp') as 'jp' | 'en';

(async () => {
  const s = new YoutubeScraper(label);
  await s.init();
  console.log(`Channel: ${s.getChannelName()} (${s.getChannelId()})`);

  const videos = await s.fetchVideos(10);
  console.log(`\n最新${videos.length}動画:`);
  for (const v of videos) {
    console.log(`  ${v.video_id} : ${v.title.slice(0, 60)} (${v.published_at.slice(0, 10)})`);
  }

  // 直近7日のAnalytics
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  console.log(`\nAnalytics ${from} 〜 ${to}:`);
  const metrics = await s.fetchDailyMetrics(from, to, videos.map(v => v.video_id));
  const sum = metrics.reduce((a, m) => ({
    views: a.views + m.views,
    watch: a.watch + m.watch_time_minutes,
    subs: a.subs + m.subscribers_gained,
    rev: a.rev + m.estimated_revenue_usd,
  }), { views: 0, watch: 0, subs: 0, rev: 0 });
  console.log(`  行数: ${metrics.length} / views: ${sum.views} / watch: ${sum.watch}min / subs: ${sum.subs} / rev: $${sum.rev.toFixed(2)}`);
  if (metrics.length) console.log(`  サンプル:`, metrics[0]);
})();
