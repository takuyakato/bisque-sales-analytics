#!/usr/bin/env tsx
/**
 * DLsite の公開商品情報APIを叩いて、翻訳紐付け情報を取得できるか検証
 */
const SAMPLE_TRAD = 'RJ01049402'; // zh-Hant 掀??的西装
const SAMPLE_JP = 'RJ01041332'; // ja スーツの下を暴かせて

async function tryEndpoints(workno: string) {
  const endpoints = [
    `https://www.dlsite.com/api/=/product.json?workno=${workno}`,
    `https://www.dlsite.com/maniax/api/=/product.json?workno=${workno}`,
    `https://www.dlsite.com/maniax/product/info/ajax?product_id=${workno}`,
    `https://www.dlsite.com/api/=/product_info/ajax?product_id=${workno}`,
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });
      const ct = resp.headers.get('content-type') ?? '';
      console.log(`\n--- ${url}`);
      console.log(`  status: ${resp.status}, content-type: ${ct}`);
      if (resp.ok && ct.includes('json')) {
        const j = await resp.json();
        // 翻訳関連キーだけ抽出
        const keys = ['workno', 'product_name', 'original_workno', 'original_worknoOr', 'translator', 'translation_info', 'intro', 'options', 'original_title', 'original', 'trans_version_info', 'translators', 'language'];
        const obj = Array.isArray(j) ? j[0] : j;
        const filtered: Record<string, unknown> = {};
        if (obj && typeof obj === 'object') {
          for (const k of Object.keys(obj)) {
            if (keys.includes(k) || k.toLowerCase().includes('trans') || k.toLowerCase().includes('orig') || k.toLowerCase().includes('lang')) {
              filtered[k] = (obj as Record<string, unknown>)[k];
            }
          }
        }
        console.log('  翻訳関連フィールド:', JSON.stringify(filtered, null, 2).slice(0, 800));
        if (Object.keys(filtered).length === 0) {
          console.log('  全キー:', Object.keys(obj ?? {}).slice(0, 30).join(', '));
        }
      }
    } catch (e) {
      console.log(`  error: ${e instanceof Error ? e.message : e}`);
    }
  }
}

(async () => {
  console.log(`\n====== 翻訳版 ${SAMPLE_TRAD} ======`);
  await tryEndpoints(SAMPLE_TRAD);
  console.log(`\n====== 日本語版 ${SAMPLE_JP} ======`);
  await tryEndpoints(SAMPLE_JP);
})();
