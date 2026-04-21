const MAP: Record<string, string> = {
  ja: '日本語',
  en: '英語',
  ko: '韓国語',
  'zh-Hans': '簡体字',
  'zh-Hant': '繁体字',
  unknown: '不明',
};

export function languageLabel(code: string): string {
  return MAP[code] ?? code;
}

/**
 * 簡体字・繁体字を「中国語」にまとめたラベル（レポート向け）
 * 管理画面（variants）では個別に表示したいので、用途を分ける
 */
export function aggregatedLanguageLabel(code: string): string {
  if (code === 'zh-Hans' || code === 'zh-Hant') return '中国語';
  return languageLabel(code);
}

/** 集約後のラベル順（日本語→英語→韓国語→中国語→不明） */
export const AGGREGATED_LANGUAGE_ORDER = ['日本語', '英語', '韓国語', '中国語', '不明'];

/**
 * 言語別の金額マップを集約後ラベルでまとめ直す
 */
export function aggregateByLanguage(
  data: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(data)) {
    const label = aggregatedLanguageLabel(code);
    out[label] = (out[label] ?? 0) + v;
  }
  return out;
}

export const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: '英語' },
  { value: 'ko', label: '韓国語' },
  { value: 'zh-Hans', label: '簡体字' },
  { value: 'zh-Hant', label: '繁体字' },
  { value: 'unknown', label: '不明' },
];
