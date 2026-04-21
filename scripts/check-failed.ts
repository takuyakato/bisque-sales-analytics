import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();
  const { data, count } = await s
    .from('ingestion_log')
    .select('platform, target_date_from, target_date_to, status, error_message, started_at', { count: 'exact' })
    .eq('status', 'failed')
    .order('target_date_from', { ascending: true });
  console.log(`失敗ログ総数: ${count}\n`);
  for (const l of data ?? []) {
    console.log(`  [${l.platform}] ${l.target_date_from}: ${l.error_message?.slice(0, 100) ?? '(no msg)'}`);
  }
})();
