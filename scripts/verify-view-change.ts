import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();
  const rows = await fetchAllPages<{ work_id: string; language: string; platform: string }>(
    s,
    'sales_unified_daily',
    (q) => q.select('work_id, language, platform').eq('platform', 'dlsite')
  );
  const workLangs = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.work_id) continue;
    if (!workLangs.has(r.work_id)) workLangs.set(r.work_id, new Set());
    workLangs.get(r.work_id)!.add(r.language);
  }
  let multi = 0, single = 0;
  for (const langs of workLangs.values()) {
    if (langs.size > 1) multi++;
    else single++;
  }
  console.log(`DLsite works:`);
  console.log(`  単一言語のみ: ${single}`);
  console.log(`  多言語（翻訳紐付け済み）: ${multi}`);
})();
