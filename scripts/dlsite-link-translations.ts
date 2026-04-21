#!/usr/bin/env tsx
/**
 * DLsite API で各 variant の正確なタイトル・言語・翻訳関係を取得して
 * 1. product_title をクリーンなものに更新
 * 2. language を options フィールドから確定的に判定して更新
 * 3. 翻訳版を JP 原作と同じ work_id に紐付け直す
 *
 * 使い方:
 *   npx tsx scripts/dlsite-link-translations.ts          # dry-run
 *   npx tsx scripts/dlsite-link-translations.ts --apply  # 反映
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

const APPLY = process.argv.includes('--apply');

interface ApiEdition {
  workno: string;
  edition_type: string;
  label: string;
  lang: string;
}
interface ApiResult {
  workno: string;
  product_name: string;
  options: string;
  language_editions?: ApiEdition[];
}

// options フィールド（例: "MV2#MS2#SND#BL1#CHI#CHI_HANS#DLP"）から言語を抽出
function langFromOptions(options: string): string {
  if (options.includes('CHI_HANS')) return 'zh-Hans';
  if (options.includes('CHI_HANT')) return 'zh-Hant';
  if (options.includes('CHI')) return 'zh-Hant'; // 古い表記
  if (options.includes('ENG')) return 'en';
  if (options.includes('KOR')) return 'ko';
  if (options.includes('JPN')) return 'ja';
  return 'ja'; // デフォルト
}

async function fetchProduct(workno: string): Promise<ApiResult | null> {
  const url = `https://www.dlsite.com/maniax/api/=/product.json?workno=${workno}`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const first = Array.isArray(j) ? j[0] : j;
    if (!first) return null;
    return {
      workno: first.workno,
      product_name: first.product_name ?? '',
      options: first.options ?? '',
      language_editions: first.language_editions ?? [],
    };
  } catch (e) {
    console.warn(`fetch失敗 ${workno}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

(async () => {
  const s = createServiceClient();

  // 対象: DLsite CAPURI/BerryFeel variants
  const { data: variants } = await s
    .from('product_variants')
    .select('id, work_id, product_id, language, product_title, works!inner(brand)')
    .eq('platform', 'dlsite');

  interface V {
    id: string;
    work_id: string | null;
    product_id: string;
    language: string;
    product_title: string | null;
    works: { brand: string };
  }
  const target = ((variants ?? []) as unknown as V[]).filter(
    (v) => v.works.brand === 'CAPURI' || v.works.brand === 'BerryFeel'
  );
  console.log(`対象variants: ${target.length}件\n`);

  // APIから情報取得
  const apiByWorkno = new Map<string, ApiResult>();
  for (let i = 0; i < target.length; i++) {
    const v = target[i];
    const result = await fetchProduct(v.product_id);
    if (result) apiByWorkno.set(v.product_id, result);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${target.length} 取得...`);
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }
  console.log(`API取得成功: ${apiByWorkno.size}/${target.length}\n`);

  // 各variantの原作（JP）を特定
  // language_editions の中で lang='JPN' のものが原作
  const jpOriginalOf = new Map<string, string>(); // translation RJ -> JP RJ
  for (const [rj, info] of apiByWorkno) {
    const jpEdition = info.language_editions?.find((e) => e.lang === 'JPN');
    if (jpEdition && jpEdition.workno !== rj) {
      jpOriginalOf.set(rj, jpEdition.workno);
    }
  }

  // JP variant の work_id を product_id でマップ（紐付け先の work_id を決定）
  const workIdByProductId = new Map<string, string>();
  for (const v of target) {
    if (v.work_id) workIdByProductId.set(v.product_id, v.work_id);
  }

  // 更新案作成
  const updates: Array<{
    variantId: string;
    productId: string;
    titleUpdate?: string;
    langUpdate?: string;
    workIdUpdate?: string;
    currentLang: string;
    currentTitle: string;
    currentWorkId: string | null;
  }> = [];

  for (const v of target) {
    const api = apiByWorkno.get(v.product_id);
    if (!api) continue;

    const u: typeof updates[0] = {
      variantId: v.id,
      productId: v.product_id,
      currentLang: v.language,
      currentTitle: v.product_title ?? '',
      currentWorkId: v.work_id,
    };

    // タイトル更新
    if (api.product_name && api.product_name !== v.product_title) {
      u.titleUpdate = api.product_name;
    }

    // 言語更新
    const newLang = langFromOptions(api.options);
    if (newLang !== v.language) u.langUpdate = newLang;

    // work_id 紐付け変更（翻訳版の場合、JP原作のwork_idに変更）
    const jpOrig = jpOriginalOf.get(v.product_id);
    if (jpOrig) {
      const jpWorkId = workIdByProductId.get(jpOrig);
      if (jpWorkId && jpWorkId !== v.work_id) {
        u.workIdUpdate = jpWorkId;
      }
    }

    if (u.titleUpdate || u.langUpdate || u.workIdUpdate) updates.push(u);
  }

  console.log('=== 更新サマリ ===');
  console.log(`タイトル更新: ${updates.filter((u) => u.titleUpdate).length}件`);
  console.log(`言語更新: ${updates.filter((u) => u.langUpdate).length}件`);
  console.log(`work_id再紐付け: ${updates.filter((u) => u.workIdUpdate).length}件`);

  // 言語変更の内訳
  const langChanges: Record<string, number> = {};
  for (const u of updates) {
    if (u.langUpdate) {
      const key = `${u.currentLang} -> ${u.langUpdate}`;
      langChanges[key] = (langChanges[key] ?? 0) + 1;
    }
  }
  console.log('\n=== 言語変更内訳 ===');
  for (const [k, v] of Object.entries(langChanges)) console.log(`  ${k}: ${v}件`);

  console.log('\n=== サンプル（更新対象 上位10） ===');
  for (const u of updates.slice(0, 10)) {
    console.log(`  ${u.productId}:`);
    if (u.titleUpdate) console.log(`    title: "${u.currentTitle.slice(0, 30)}" -> "${u.titleUpdate.slice(0, 30)}"`);
    if (u.langUpdate) console.log(`    lang: ${u.currentLang} -> ${u.langUpdate}`);
    if (u.workIdUpdate) console.log(`    work_id: ${u.currentWorkId} -> ${u.workIdUpdate}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run) --apply で反映します');
    return;
  }

  // 適用
  console.log('\n=== 反映中... ===');
  let ok = 0;
  for (const u of updates) {
    const patch: Record<string, string> = {};
    if (u.titleUpdate) patch.product_title = u.titleUpdate;
    if (u.langUpdate) patch.language = u.langUpdate;
    if (u.workIdUpdate) patch.work_id = u.workIdUpdate;
    const { error } = await s.from('product_variants').update(patch).eq('id', u.variantId);
    if (error) console.error(`  ${u.productId} 失敗: ${error.message}`);
    else ok++;
  }
  console.log(`\n反映: ${ok}/${updates.length}件`);

  // 孤立した works（誰も指していない）を掃除するのは別スクリプトで
  console.log('\n※ 再紐付けで孤立した works レコードは sales_daily/product_variants の外部キー経由で手動削除が必要');
})();
