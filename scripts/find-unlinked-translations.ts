import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';
import { fetchAllPages } from '../src/lib/queries/paginate';

(async () => {
  const s = createServiceClient();

  // CAPURI/BerryFeel に絞る
  type V = {
    id: string;
    product_id: string;
    language: string;
    product_title: string | null;
    work_id: string | null;
    works: { id: string; title: string; slug: string | null; brand: string } | null;
  };

  // 全 product_variants を取得（works の brand も含む、1000 行制限を超えるためページング）
  const allVariants = await fetchAllPages<V>(s, 'product_variants', (q) =>
    q.select('id, product_id, language, product_title, work_id, works(id, title, slug, brand)')
  );
  const typed = allVariants;
  const filtered = typed.filter((v) => v.works?.brand === 'CAPURI' || v.works?.brand === 'BerryFeel');

  // JP variants の work_id 集合
  const jpWorkIds = new Set(
    filtered.filter((v) => v.language === 'ja').map((v) => v.work_id).filter(Boolean) as string[]
  );

  // 紐付いていない 翻訳 variant を抽出
  const unlinked = filtered.filter(
    (v) => v.language !== 'ja' && (!v.work_id || !jpWorkIds.has(v.work_id))
  );

  console.log(`紐付いていない翻訳variant: ${unlinked.length} 件\n`);
  for (const v of unlinked) {
    console.log('--');
    console.log(`  variant_id   : ${v.id}`);
    console.log(`  product_id   : ${v.product_id}`);
    console.log(`  language     : ${v.language}`);
    console.log(`  product_title: ${v.product_title}`);
    console.log(`  work_id (現) : ${v.work_id}`);
    console.log(`  works.title  : ${v.works?.title}`);
    console.log(`  works.brand  : ${v.works?.brand}`);
  }

  // それぞれの「対応する日本語版候補」を product_title から推測
  console.log('\n=== 候補となる日本語版（タイトルが類似するもの）===\n');
  for (const v of unlinked) {
    const title = v.product_title ?? v.works?.title ?? '';
    // タイトルから言語マーカーや英語文字を除去して、JPと類似するキーワードを抽出
    const stripped = title
      .replace(/【[^】]*】/g, '')  // 【...】を除去
      .replace(/\([^)]*\)/g, '')  // (...)を除去
      .replace(/[A-Za-z0-9]+/g, '')  // 英数字を除去
      .replace(/\s+/g, '')
      .trim();
    const keyword = stripped.slice(0, 8);  // 先頭8文字（漢字・かな）

    console.log(`[unlinked variant ${v.id}]`);
    console.log(`  原タイトル: ${title}`);
    console.log(`  検索キー  : "${keyword}"`);

    if (!keyword) {
      console.log(`  → 検索キーが取れず、自動候補なし\n`);
      continue;
    }

    const { data: candidates } = await s
      .from('works')
      .select('id, title, slug, brand')
      .ilike('title', `%${keyword}%`)
      .in('brand', ['CAPURI', 'BerryFeel']);
    const filteredCands = (candidates ?? []).filter((w) => w.id !== v.work_id);

    if (filteredCands.length === 0) {
      console.log(`  → 候補なし（手動調査が必要）\n`);
    } else {
      for (const c of filteredCands.slice(0, 5)) {
        console.log(`  候補 work: ${c.id} / ${c.brand} / ${c.title}`);
      }
      console.log('');
    }
  }
})();
