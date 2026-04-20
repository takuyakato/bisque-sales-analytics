/**
 * 作品タイトルから言語を自動判定（v3.6 §5-3 準拠）
 * Phase 0 実測：DLsite 101作品中 誤判定0%、unknown 14%（文字化け由来）
 */
export type DetectedLang = 'ja' | 'en' | 'zh-Hant' | 'zh-Hans' | 'ko' | 'unknown';

export function detectLanguage(title: string): DetectedLang {
  if (!title) return 'unknown';

  // 文字化け「?」比率が高い場合は unknown（手動補正前提）
  const qRatio = (title.match(/\?/g)?.length ?? 0) / title.length;
  if (qRatio > 0.2) return 'unknown';

  // ハングル
  if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(title)) return 'ko';

  // ひらがな/カタカナ
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(title)) return 'ja';

  // 漢字（CJK統合漢字）
  if (/[\u4E00-\u9FFF]/.test(title)) {
    const hasTrad = /[繁體臺灣為會並傳專學習國當說時來這個這些點頭]/.test(title);
    const hasSimp = /[简体台湾为会并传专学习国当说时来这个这些点头]/.test(title);
    if (hasSimp && !hasTrad) return 'zh-Hans';
    if (hasTrad) return 'zh-Hant';
    return 'zh-Hant'; // どちらの固有字も含まない場合のデフォルト（調整可能）
  }

  // ラテン文字のみ
  if (/^[\x00-\x7F]+$/.test(title)) return 'en';

  return 'unknown';
}
