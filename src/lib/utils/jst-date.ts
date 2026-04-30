/**
 * JST (UTC+9) 基準の日付ユーティリティ
 *
 * Vercel サーバーレスは UTC 動作のため、JST 早朝（00:00〜09:00）に
 * `new Date().toISOString().slice(0, 10)` を呼ぶと前日扱いになる問題を回避する。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * JST 基準の今日（YYYY-MM-DD）
 */
export function jstToday(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * JST 基準の年月日コンポーネント（month は 1-indexed）
 */
export function jstYmd(d: Date = new Date()): { year: number; month: number; day: number } {
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
  };
}

/**
 * YYYY-MM-DD 文字列に N 日加算（負数で減算）
 */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 指定年月の月初（YYYY-MM-DD）
 */
export function monthStartOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * 指定年月の月末（YYYY-MM-DD）
 */
export function monthEndOf(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * 月の加減算（year/month は 1-indexed）
 */
export function offsetMonth(year: number, month: number, offset: number): { year: number; month: number } {
  let m = month + offset;
  let y = year;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { year: y, month: m };
}

/**
 * 指定年月の日数
 */
export function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
