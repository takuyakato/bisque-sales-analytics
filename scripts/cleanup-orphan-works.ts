#!/usr/bin/env tsx
/**
 * Phase 4: 孤立 works を削除
 *
 * 判定: `product_variants` から参照されていない works
 * （Phase 2 で sales_daily.work_id を DROP 済みなので variants のみチェックでOK）
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

const APPLY = process.argv.includes('--apply');

(async () => {
  const s = createServiceClient();

  // 全 works
  const works = await fetchAllPages<{ id: string; title: string; brand: string; auto_created: boolean | null }>(
    s, 'works', (q) => q.select('id, title, brand, auto_created')
  );
  console.log(`works 総数: ${works.length}`);

  // 全 variants の work_id 一覧
  const variants = await fetchAllPages<{ work_id: string | null }>(
    s, 'product_variants', (q) => q.select('work_id')
  );
  const referenced = new Set(variants.map((v) => v.work_id).filter(Boolean) as string[]);
  console.log(`variants から参照されている works: ${referenced.size}`);

  // 孤立 works
  const orphans = works.filter((w) => !referenced.has(w.id));
  console.log(`\n孤立 works: ${orphans.length}件`);

  // 内訳（ブランド別・auto/manual）
  const byBrand: Record<string, { total: number; auto: number }> = {};
  for (const w of orphans) {
    byBrand[w.brand] ??= { total: 0, auto: 0 };
    byBrand[w.brand].total++;
    if (w.auto_created) byBrand[w.brand].auto++;
  }
  console.log('\n=== 内訳 ===');
  for (const [b, v] of Object.entries(byBrand)) {
    console.log(`  ${b}: ${v.total}件（うち auto_created: ${v.auto}件）`);
  }

  console.log('\n=== サンプル（先頭10件） ===');
  for (const w of orphans.slice(0, 10)) {
    console.log(`  ${w.id} [${w.brand}] ${w.auto_created ? 'auto' : 'manual'}: "${w.title.slice(0, 50)}"`);
  }

  // manual で orphan なものは注意喚起
  const manualOrphans = orphans.filter((w) => !w.auto_created);
  if (manualOrphans.length > 0) {
    console.log(`\n⚠ 手動作成なのに孤立している works: ${manualOrphans.length}件`);
    for (const w of manualOrphans.slice(0, 5)) {
      console.log(`  ${w.id} [${w.brand}]: "${w.title.slice(0, 50)}"`);
    }
  }

  if (!APPLY) {
    console.log('\n(dry-run) --apply で削除');
    return;
  }

  // auto_created のみ削除（手動作成は意図的に残された可能性があるので除外）
  const toDelete = orphans.filter((w) => w.auto_created);
  console.log(`\n削除対象（auto_created のみ）: ${toDelete.length}件`);

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100).map((w) => w.id);
    const { error } = await s.from('works').delete().in('id', batch);
    if (error) { console.error(`batch ${i}:`, error.message); continue; }
    deleted += batch.length;
  }
  console.log(`✅ ${deleted}件削除完了`);

  if (manualOrphans.length > 0) {
    console.log(`\n⚠ 手動作成の孤立 ${manualOrphans.length}件 は残しました。個別確認してください。`);
  }
})();
