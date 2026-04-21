/**
 * 作品タイトルから言語を自動判定（v3.6 §5-3 準拠）
 * Phase 0 実測：DLsite 101作品中 誤判定0%、unknown 14%（文字化け由来）
 */
export type DetectedLang = 'ja' | 'en' | 'zh-Hant' | 'zh-Hans' | 'ko' | 'unknown';

export function detectLanguage(title: string): DetectedLang {
  if (!title) return 'unknown';

  // ハングル（最優先：? が多くても確実に判定可能）
  if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(title)) return 'ko';

  // ひらがな/カタカナ → 日本語（? まじりでも判定可能）
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(title)) return 'ja';

  // CJK統合漢字 → 中国語（? まじりでも可。簡/繁 の固有字で判定し、無ければ繁体字フォールバック）
  if (/[\u4E00-\u9FFF]/.test(title)) {
    const hasTrad = /[繁體臺灣為會並傳專學習國當說時來這個這些點頭懷幹價兒實兩開關門聽書買發沒誰還]/.test(title);
    const hasSimp = /[简体台湾为会并传专学习国当说时来这个这些点头怀干价儿实两开关门听书买发没谁还]/.test(title);
    if (hasSimp && !hasTrad) return 'zh-Hans';
    if (hasTrad) return 'zh-Hant';
    return 'zh-Hant';
  }

  // ラテン文字＋全角記号（～、…、！？、全角英数、伏せ字 × など）のみ → 英語
  // - ASCII (0x00-0x7F)
  // - Latin-1 Supplement (0xA0-0xFF): × ÷ © ® ° ™ なども含む
  // - 各種ダッシュ/省略記号 (2013, 2014, 2026)
  // - 全角英数・全角記号 (FF01-FF5E)
  // - 全角空白 (3000)、全角伏せ字 × (FF58は英字xなので除外、× U+FF09 などは別)
  if (/^[\x00-\x7F\u00A0-\u00FF\u2013\u2014\u2026\uFF01-\uFF5E\u3000]+$/.test(title)) return 'en';

  // ここまで当てはまらない場合は ? まじりで判定できないケース
  return 'unknown';
}
