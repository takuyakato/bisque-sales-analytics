#!/usr/bin/env tsx
/**
 * DLsite API で各 variant の正確なタイトル・言語・翻訳関係を取得して
 * 1. product_title をクリーンなものに更新
 * 2. language を options フィールドから確定的に判定して更新
 * 3. 翻訳版を JP 原作と同じ work_id に紐付け直す
 * 4. JP原作が存在しない単独配信の翻訳は origin_status='standalone' を立てる
 *
 * API呼び出しは「チェックが必要な variant」だけに絞る（既定）：
 *   - 未紐付けの翻訳（非ja かつ ja兄弟 work_id を持たず standalone でもない）
 *   - 直近 N 日（既定7日）に新規作成された variant（タイトル・言語・紐付けの初期整備用）
 * work_id 解決のための参照表は全 variant から作るので、絞り込んでも正しく紐付く。
 *
 * 使い方:
 *   npx tsx scripts/dlsite-link-translations.ts                 # dry-run（絞り込み）
 *   npx tsx scripts/dlsite-link-translations.ts --apply         # 反映（絞り込み）
 *   npx tsx scripts/dlsite-link-translations.ts --apply --all   # 全 variant を再チェック
 *   npx tsx scripts/dlsite-link-translations.ts --recent-days=14 # 新規判定の窓を変更
 *
 * CI（GitHub Actions）では .env.local が無いので、存在する場合のみ読み込み、
 * 無ければ process.env（secrets 経由）をそのまま使う。
 */
import { existsSync, readFileSync } from 'fs';
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
import { createServiceClient } from '../src/lib/supabase/service';

const APPLY = process.argv.includes('--apply');
const SCAN_ALL = process.argv.includes('--all');
const RECENT_DAYS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--recent-days='));
  const n = arg ? Number(arg.split('=')[1]) : 7;
  return Number.isFinite(n) && n >= 0 ? n : 7;
})();

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

interface V {
  id: string;
  work_id: string | null;
  product_id: string;
  language: string;
  product_title: string | null;
  origin_status: string | null;
  created_at: string | null;
  works: { brand: string };
}

(async () => {
  const s = createServiceClient();

  // 全 DLsite CAPURI/BerryFeel variants を取得（work_id 参照表＋未紐付け判定の基礎）
  const { data: variants } = await s
    .from('product_variants')
    .select('id, work_id, product_id, language, product_title, origin_status, created_at, works!inner(brand)')
    .eq('platform', 'dlsite');

  const all = ((variants ?? []) as unknown as V[]).filter(
    (v) => v.works.brand === 'CAPURI' || v.works.brand === 'BerryFeel'
  );

  // ja版が存在する work_id 集合（= 翻訳の紐付け先になりうる work）
  const jaWorkIds = new Set(
    all.filter((v) => v.language === 'ja' && v.work_id).map((v) => v.work_id as string)
  );
  const isUnlinkedTranslation = (v: V): boolean =>
    v.language !== 'ja' &&
    v.origin_status !== 'standalone' &&
    !(v.work_id && jaWorkIds.has(v.work_id));

  // API をかける対象を絞る：未紐付け翻訳 ∪ 直近作成
  const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
  const toCheck = SCAN_ALL
    ? all
    : all.filter(
        (v) => isUnlinkedTranslation(v) || (v.created_at != null && v.created_at >= recentCutoff)
      );

  console.log(`全variants: ${all.length}件 / APIチェック対象: ${toCheck.length}件` +
    (SCAN_ALL ? '（--all）' : `（未紐付け翻訳＋直近${RECENT_DAYS}日）`));

  // work_id 参照表は「全 variant」から作る（古い既紐付けのJP原作も解決できるように）
  const workIdByProductId = new Map<string, string>();
  for (const v of all) {
    if (v.work_id) workIdByProductId.set(v.product_id, v.work_id);
  }

  if (toCheck.length === 0) {
    console.log('\nチェック対象なし。未紐付け翻訳は 0 件です。');
    return;
  }

  // 対象だけ API 取得
  const apiByWorkno = new Map<string, ApiResult>();
  for (let i = 0; i < toCheck.length; i++) {
    const v = toCheck[i];
    const result = await fetchProduct(v.product_id);
    if (result) apiByWorkno.set(v.product_id, result);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${toCheck.length} 取得...`);
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }
  console.log(`API取得成功: ${apiByWorkno.size}/${toCheck.length}\n`);

  // 各 variant の原作（JP）を特定：language_editions の lang='JPN' が原作
  const jpOriginalOf = new Map<string, string>(); // translation RJ -> JP RJ
  for (const [rj, info] of apiByWorkno) {
    const jpEdition = info.language_editions?.find((e) => e.lang === 'JPN');
    if (jpEdition && jpEdition.workno !== rj) {
      jpOriginalOf.set(rj, jpEdition.workno);
    }
  }

  // 更新案作成
  const updates: Array<{
    variantId: string;
    productId: string;
    titleUpdate?: string;
    langUpdate?: string;
    workIdUpdate?: string;
    originStatusUpdate?: string;
    currentLang: string;
    currentTitle: string;
    currentWorkId: string | null;
  }> = [];

  for (const v of toCheck) {
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
    const effectiveLang = u.langUpdate ?? v.language;

    // work_id 紐付け変更（翻訳版の場合、JP原作のwork_idに変更）
    const jpOrig = jpOriginalOf.get(v.product_id);
    if (jpOrig) {
      const jpWorkId = workIdByProductId.get(jpOrig);
      if (jpWorkId && jpWorkId !== v.work_id) {
        u.workIdUpdate = jpWorkId;
      }
    } else if (effectiveLang !== 'ja') {
      // 非ja なのに JPN edition が API に無い → DLsite上に日本語原作が存在しない単独配信
      // （JPN edition はあるが原作が未取込のケースは jpOrig が立つのでここには来ない）
      const hasJpEdition = (api.language_editions ?? []).some((e) => e.lang === 'JPN');
      if (!hasJpEdition && v.origin_status !== 'standalone') {
        u.originStatusUpdate = 'standalone';
      }
    }

    if (u.titleUpdate || u.langUpdate || u.workIdUpdate || u.originStatusUpdate) updates.push(u);
  }

  console.log('=== 更新サマリ ===');
  console.log(`タイトル更新: ${updates.filter((u) => u.titleUpdate).length}件`);
  console.log(`言語更新: ${updates.filter((u) => u.langUpdate).length}件`);
  console.log(`work_id再紐付け: ${updates.filter((u) => u.workIdUpdate).length}件`);
  console.log(`standalone マーク: ${updates.filter((u) => u.originStatusUpdate).length}件`);

  // 言語変更の内訳
  const langChanges: Record<string, number> = {};
  for (const u of updates) {
    if (u.langUpdate) {
      const key = `${u.currentLang} -> ${u.langUpdate}`;
      langChanges[key] = (langChanges[key] ?? 0) + 1;
    }
  }
  if (Object.keys(langChanges).length > 0) {
    console.log('\n=== 言語変更内訳 ===');
    for (const [k, v] of Object.entries(langChanges)) console.log(`  ${k}: ${v}件`);
  }

  console.log('\n=== サンプル（更新対象 上位10） ===');
  for (const u of updates.slice(0, 10)) {
    console.log(`  ${u.productId}:`);
    if (u.titleUpdate) console.log(`    title: "${u.currentTitle.slice(0, 30)}" -> "${u.titleUpdate.slice(0, 30)}"`);
    if (u.langUpdate) console.log(`    lang: ${u.currentLang} -> ${u.langUpdate}`);
    if (u.workIdUpdate) console.log(`    work_id: ${u.currentWorkId} -> ${u.workIdUpdate}`);
    if (u.originStatusUpdate) console.log(`    origin_status: -> ${u.originStatusUpdate}`);
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
    if (u.originStatusUpdate) patch.origin_status = u.originStatusUpdate;
    const { error } = await s.from('product_variants').update(patch).eq('id', u.variantId);
    if (error) console.error(`  ${u.productId} 失敗: ${error.message}`);
    else ok++;
  }
  console.log(`\n反映: ${ok}/${updates.length}件`);

  // 反映後の残り未紐付け件数を再判定（work_id 更新を反映した状態で）
  const linkedNow = new Set(
    updates.filter((u) => u.workIdUpdate).map((u) => u.variantId)
  );
  const standaloneNow = new Set(
    updates.filter((u) => u.originStatusUpdate === 'standalone').map((u) => u.variantId)
  );
  const remaining = all.filter(
    (v) => isUnlinkedTranslation(v) && !linkedNow.has(v.id) && !standaloneNow.has(v.id)
  );
  console.log(`残り未紐付け翻訳: ${remaining.length}件` +
    (remaining.length > 0 ? '（JP原作が未取込の可能性。原作が取り込まれ次第、次回実行で自動紐付け）' : ''));

  // 孤立した works（誰も指していない）は cleanup-orphan-works.ts で掃除する
  console.log('\n※ 再紐付けで孤立した works は cleanup-orphan-works.ts --apply で削除してください');
})();
