import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { createServiceClient } from '../src/lib/supabase/service';

// 拡充した簡体字/繁体字の対応表
// それぞれ「その字形は一方にしか現れない」と言える字を厳選
const SIMP_ONLY = /[简体台湾为会并传专学习国当说时来这个这些点头怀干价儿实两开关门听书买发没谁还装单产运远达边进过应响龙电马车门机问见样条里觉变权灵坏觉过鸟鱼鸡狗猫爱亲义乐乡复旧尸层术朴权归图园队兴养该认识谁请谢谢谢试证讲诉]/;
const TRAD_ONLY = /[繁體臺灣為會並傳專學習國當說時來這個這些點頭懷幹價兒實兩開關門聽書買發沒誰還裝單產運遠達邊進過應響龍電馬車門機問見樣條裡覺變權靈壞覺過鳥魚雞狗貓愛親義樂鄉復舊屍層術樸權歸圖園隊興養該認識誰請謝謝謝試證講訴]/;

(async () => {
  const s = createServiceClient();
  const { data } = await s
    .from('product_variants')
    .select('product_id, language, product_title, works!inner(brand)')
    .eq('platform', 'dlsite')
    .in('language', ['zh-Hant', 'zh-Hans']);

  let toHans = 0, toHant = 0, keepHans = 0, keepHant = 0, bothMatch = 0, neitherMatch = 0;
  const suggestions: Array<{ id: string; from: string; to: string; title: string; reason: string }> = [];

  for (const v of data ?? []) {
    const brand = (v.works as unknown as { brand: string })?.brand;
    if (brand !== 'CAPURI' && brand !== 'BerryFeel') continue;

    const title = v.product_title ?? '';
    const hasSimp = SIMP_ONLY.test(title);
    const hasTrad = TRAD_ONLY.test(title);
    let shouldBe: string;
    let reason: string;
    if (hasSimp && !hasTrad) { shouldBe = 'zh-Hans'; reason = 'simp-only文字あり'; }
    else if (hasTrad && !hasSimp) { shouldBe = 'zh-Hant'; reason = 'trad-only文字あり'; }
    else if (hasSimp && hasTrad) { shouldBe = v.language; reason = '両方混在（既存尊重）'; bothMatch++; }
    else { shouldBe = v.language; reason = '判定不能（既存尊重）'; neitherMatch++; }

    if (shouldBe !== v.language) {
      if (shouldBe === 'zh-Hans') toHans++;
      if (shouldBe === 'zh-Hant') toHant++;
      suggestions.push({ id: v.product_id, from: v.language, to: shouldBe, title, reason });
    } else {
      if (v.language === 'zh-Hans') keepHans++;
      else keepHant++;
    }
  }

  console.log('=== 現状 ===');
  console.log(`zh-Hant保持: ${keepHant}, zh-Hans保持: ${keepHans}`);
  console.log(`両方文字混在: ${bothMatch}, 判定不能: ${neitherMatch}`);
  console.log(`\n=== 変更提案 ===`);
  console.log(`? -> zh-Hans: ${toHans}件`);
  console.log(`? -> zh-Hant: ${toHant}件`);
  console.log('');
  for (const s of suggestions.slice(0, 20)) {
    console.log(`  ${s.id} [${s.from}=>${s.to}] ${s.reason}: ${s.title.slice(0, 60)}`);
  }
  if (suggestions.length > 20) console.log(`  ...他${suggestions.length - 20}件`);
})();
