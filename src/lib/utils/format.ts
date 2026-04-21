/**
 * 金額を万/億の単位で短縮表記（グラフ軸向け）
 * 例: 800000000 → "8億"、80000000 → "8000万"、10000 → "1万"、5000 → "5000"
 */
export function formatJpyShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100000000) {
    const oku = v / 100000000;
    return `${oku.toFixed(oku >= 10 ? 0 : 1)}億`;
  }
  if (abs >= 10000) {
    const man = v / 10000;
    // 1万以上は整数、10万以上も整数
    return `${Math.round(man)}万`;
  }
  return `${Math.round(v)}`;
}
