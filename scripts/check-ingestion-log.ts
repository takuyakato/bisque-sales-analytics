import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

(async () => {
  const s = createServiceClient();

  // ingestion_log の column 一覧
  const { data: one } = await s.from('ingestion_log').select('*').limit(1);
  console.log('ingestion_log columns:', Object.keys(one?.[0] ?? {}));

  // 直近 10 件
  const { data: recent } = await s
    .from('ingestion_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10);
  console.log('\n=== ingestion_log 直近 10 件 ===');
  for (const r of recent ?? []) {
    console.log(JSON.stringify(r));
  }
})();
