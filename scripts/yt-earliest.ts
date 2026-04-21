import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { YoutubeScraper } from '../src/lib/scrapers/youtube';

(async () => {
  for (const label of ['jp', 'en'] as const) {
    const s = new YoutubeScraper(label);
    await s.init();
    const videos = await s.fetchVideos(2000);
    videos.sort((a, b) => a.published_at.localeCompare(b.published_at));
    const earliest = videos[0];
    const latest = videos[videos.length - 1];
    console.log(`${label}: ${s.getChannelName()}`);
    console.log(`  動画数: ${videos.length}`);
    console.log(`  最古: ${earliest?.video_id} ${earliest?.published_at?.slice(0,10)} ${earliest?.title?.slice(0,40)}`);
    console.log(`  最新: ${latest?.video_id} ${latest?.published_at?.slice(0,10)} ${latest?.title?.slice(0,40)}`);
  }
})();
