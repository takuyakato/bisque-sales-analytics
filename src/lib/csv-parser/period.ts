import { AggregationUnit } from '@/lib/types';

/**
 * 期間の from / to から aggregation_unit と sale_date を決める
 *
 * ルール（v3.6 §4-3、§5-1 準拠）：
 * - 期間 from == to （1日）→ aggregation_unit='daily'、sale_date=その日
 * - 期間 from != to （複数日）→ aggregation_unit='monthly'、sale_date=from（月初日）
 */
export function resolveAggregation(
  from: string,
  to: string
): { aggregation_unit: AggregationUnit; sale_date: string } {
  if (from === to) {
    return { aggregation_unit: 'daily', sale_date: from };
  }
  return { aggregation_unit: 'monthly', sale_date: from };
}

/**
 * YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD を YYYY-MM-DD に正規化
 */
export function normalizeDate(input: string): string {
  const s = input.trim();
  // YYYYMMDD（8桁数字）
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // YYYY/MM/DD or YYYY.MM.DD
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

/**
 * Fanza CSVファイル名 sales_all_0_YYYYMMDD_YYYYMMDD.csv から期間を抽出
 */
export function extractFanzaPeriodFromFilename(
  filename: string
): { from: string; to: string } | null {
  const m = filename.match(/sales_all_\d+_(\d{8})_(\d{8})\.csv$/);
  if (!m) return null;
  return {
    from: normalizeDate(m[1]),
    to: normalizeDate(m[2]),
  };
}
