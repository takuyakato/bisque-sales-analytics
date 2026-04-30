/**
 * 同タイトルの works が複数ある重複候補を検出する。
 * CAPURI/BerryFeel ブランドのみ対象。
 *
 * 実行: npx tsx scripts/audit-duplicate-works.ts
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  type Work = {
    id: string;
    title: string;
    slug: string | null;
    brand: string;
    auto_created: boolean;
    created_at: string;
  };

  const allWorks = await fetchAllPages<Work>(s, 'works', (q) =>
    q.select('id, title, slug, brand, auto_created, created_at')
      .in('brand', ['CAPURI', 'BerryFeel'])
      .order('created_at', { ascending: true })
  );
  console.log(`CAPURI/BerryFeel works 総数: ${allWorks.length}\n`);

  // タイトル正規化（空白・全角半角・記号差分を吸収）
  const norm = (t: string) =>
    t
      .replace(/[\s　]/g, '')           // 全空白除去
      .replace(/[～〜~]/g, '~')          // 波線統一
      .replace(/[（）()]/g, '')          // カッコ除去
      .replace(/[【】\[\]]/g, '')        // 【】[]除去
      .toLowerCase();

  // 正規化タイトルでグルーピング
  const byTitle = new Map<string, Work[]>();
  for (const w of allWorks) {
    const key = norm(w.title);
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push(w);
    byTitle.set(key, list);
  }

  const duplicates = [...byTitle.entries()].filter(([, list]) => list.length >= 2);
  console.log(`重複候補: ${duplicates.length} グループ\n`);

  // 各 work の variant 数と累計売上を取得
  type V = { id: string; work_id: string; language: string; product_id: string };
  const allVariants = await fetchAllPages<V>(s, 'product_variants', (q) =>
    q.select('id, work_id, language, product_id')
  );
  const variantsByWork = new Map<string, V[]>();
  for (const v of allVariants) {
    if (!v.work_id) continue;
    const list = variantsByWork.get(v.work_id) ?? [];
    list.push(v);
    variantsByWork.set(v.work_id, list);
  }

  type Sale = { variant_id: string; net_revenue_jpy: number | null };
  const allSales = await fetchAllPages<Sale>(s, 'sales_daily', (q) =>
    q.select('variant_id, net_revenue_jpy')
  );
  const revByVariant = new Map<string, number>();
  for (const sa of allSales) {
    revByVariant.set(sa.variant_id, (revByVariant.get(sa.variant_id) ?? 0) + (sa.net_revenue_jpy ?? 0));
  }

  // グループごとに表示
  for (const [, list] of duplicates) {
    const sortedByRev = list.map((w) => {
      const variants = variantsByWork.get(w.id) ?? [];
      const rev = variants.reduce((a, v) => a + (revByVariant.get(v.id) ?? 0), 0);
      return { work: w, variants, rev };
    }).sort((a, b) => b.rev - a.rev);

    const titleSample = list[0].title.slice(0, 40);
    console.log(`■ "${titleSample}..." [${list[0].brand}]`);
    for (const x of sortedByRev) {
      const langs = x.variants.map((v) => `${v.language}:${v.product_id}`).join(', ');
      console.log(`  ${x.work.id}  ¥${x.rev.toLocaleString().padStart(12)}  variants: ${langs || 'なし'}`);
    }
    console.log('');
  }

  // 統合提案サマリ
  console.log('\n=== 統合提案サマリ ===');
  console.log(`重複グループ: ${duplicates.length}`);
  const totalDupWorks = duplicates.reduce((a, [, list]) => a + (list.length - 1), 0);
  console.log(`削除候補 works: ${totalDupWorks}（メイン1件は残す）`);

  // マシン読み取り用 JSON も出力
  console.log('\n=== JSON (for merge script) ===');
  const proposals = duplicates.map(([, list]) => {
    const enriched = list.map((w) => {
      const variants = variantsByWork.get(w.id) ?? [];
      const rev = variants.reduce((a, v) => a + (revByVariant.get(v.id) ?? 0), 0);
      return { id: w.id, title: w.title, brand: w.brand, rev, variantCount: variants.length };
    }).sort((a, b) => b.rev - a.rev);
    return { main: enriched[0].id, dups: enriched.slice(1).map((x) => x.id), title: list[0].title, members: enriched };
  });
  console.log(JSON.stringify(proposals, null, 2));
})();
