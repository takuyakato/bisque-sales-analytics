import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  // works 全件
  const { data: allWorks } = await s.from('works').select('id, title, brand, auto_created');
  const workIds = new Set((allWorks ?? []).map((w) => w.id));

  // product_variants で参照されている work_id
  const { data: variants } = await s.from('product_variants').select('work_id');
  const workIdsInVariants = new Set((variants ?? []).map((v) => v.work_id).filter(Boolean));

  // sales_daily で参照されている work_id
  const salesRows = await fetchAllPages<{ work_id: string | null }>(
    s,
    'sales_daily',
    (q) => q.select('work_id')
  );
  const workIdsInSales = new Set(salesRows.map((r) => r.work_id).filter(Boolean));

  // youtube_metrics_daily で参照されている work_id
  const ytRows = await fetchAllPages<{ work_id: string | null }>(
    s,
    'youtube_metrics_daily',
    (q) => q.select('work_id')
  );
  const workIdsInYt = new Set(ytRows.map((r) => r.work_id).filter(Boolean));

  // 分類
  const orphan: string[] = []; // どこからも参照されていない
  const variantlessButSales: string[] = []; // variants からは参照されてないが sales_daily には参照がある（stale）
  const both: string[] = []; // 正常

  for (const w of allWorks ?? []) {
    const inVariants = workIdsInVariants.has(w.id);
    const inSales = workIdsInSales.has(w.id) || workIdsInYt.has(w.id);
    if (!inVariants && !inSales) orphan.push(w.id);
    else if (!inVariants && inSales) variantlessButSales.push(w.id);
    else both.push(w.id);
  }

  console.log(`works 総数: ${workIds.size}`);
  console.log(`  正常（variants・sales両方参照）: ${both.length}`);
  console.log(`  ⚠ variants参照なし・salesに古い参照あり: ${variantlessButSales.length}`);
  console.log(`  💀 完全孤立（誰も参照していない）: ${orphan.length}`);

  // sales_daily の work_id が product_variants.work_id と一致するか
  const { data: variantMap } = await s.from('product_variants').select('id, work_id');
  const variantToWorkId = new Map((variantMap ?? []).map((v) => [v.id, v.work_id]));

  const salesRows2 = await fetchAllPages<{ variant_id: string | null; work_id: string | null }>(
    s,
    'sales_daily',
    (q) => q.select('variant_id, work_id')
  );

  let consistent = 0, stale = 0;
  for (const r of salesRows2) {
    if (!r.variant_id) continue;
    const currentWid = variantToWorkId.get(r.variant_id);
    if (currentWid === r.work_id) consistent++;
    else stale++;
  }
  console.log(`\nsales_daily の work_id 整合性:`);
  console.log(`  product_variants.work_id と一致: ${consistent}行`);
  console.log(`  ⚠ stale (variantのwork_idが変わったあと): ${stale}行`);

  console.log(`\n=== variantlessButSales サンプル（修正候補） ===`);
  for (const id of variantlessButSales.slice(0, 5)) {
    const w = allWorks?.find((x) => x.id === id);
    console.log(`  ${id}: "${w?.title?.slice(0, 40)}" (${w?.brand})`);
  }
})();
