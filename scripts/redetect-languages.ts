import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { detectLanguage } from '../src/lib/utils/detect-language';

(async () => {
  const s = createServiceClient();
  // ページングで全件取得
  const all: Array<{ id: string; platform: string; product_id: string; product_title: string | null; language: string }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await s
      .from('product_variants')
      .select('id, platform, product_id, product_title, language')
      .range(offset, offset + pageSize - 1);
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  const data = all;

  const toUpdate: Array<{ id: string; from: string; to: string; title: string }> = [];
  for (const v of data ?? []) {
    if (!v.product_title) continue;
    // YouTube はチャンネル単位で言語を持つので再判定しない
    if (v.platform === 'youtube') continue;
    const newLang = detectLanguage(v.product_title);
    // unknown → 何か に変える／明確に判定できた場合のみ上書き（既存 en/ja/zh は尊重）
    if (newLang === 'unknown') continue;
    if (newLang !== v.language) {
      toUpdate.push({ id: v.id, from: v.language, to: newLang, title: v.product_title });
    }
  }

  console.log(`Candidates: ${toUpdate.length} / Total: ${data?.length}`);
  for (const u of toUpdate.slice(0, 20)) {
    console.log(`  [${u.from} -> ${u.to}] ${u.title.slice(0, 60)}`);
  }
  if (toUpdate.length > 20) console.log(`  ... and ${toUpdate.length - 20} more`);

  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('\n(dry-run) pass --apply to update.');
    return;
  }

  for (const u of toUpdate) {
    await s.from('product_variants').update({ language: u.to }).eq('id', u.id);
  }
  console.log(`Updated ${toUpdate.length} variants.`);
})();
