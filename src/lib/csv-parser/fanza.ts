import { parse } from 'csv-parse/sync';
import { CanonicalSalesRow, ParseResult } from '@/lib/types';
import { brandFromCircle } from '@/lib/constants/brand-mapping';
import { detectLanguage } from '@/lib/utils/detect-language';
import { normalizeDate, resolveAggregation } from './period';

/**
 * Fanza CSVのカラム構成
 * サークル名,作品ID,作品名,単価,卸金額,販売数,販売金額合計,卸金額合計,期間(From),期間(to)
 */
interface FanzaRow {
  サークル名: string;
  作品ID: string;
  作品名: string;
  単価: string;
  卸金額: string;
  販売数: string;
  販売金額合計: string;
  卸金額合計: string;
  '期間(From)': string;
  '期間(to)': string;
}

/**
 * Fanza CSV（UTF-8デコード済み文字列）をパースして標準化された行に変換
 *
 * @param csvText デコード済みのCSVテキスト
 * @param periodOverride UIで期間を手動指定した場合はそれを優先、省略時はCSV内の期間列を使用
 */
export function parseFanzaCsv(
  csvText: string,
  periodOverride?: { from: string; to: string }
): ParseResult {
  const warnings: string[] = [];
  const rows: CanonicalSalesRow[] = [];
  let skipped = 0;

  const records: FanzaRow[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: ['Fanza CSV に取込対象の行がありません'],
      periodFrom: periodOverride?.from ?? '',
      periodTo: periodOverride?.to ?? '',
    };
  }

  // 期間：UIオーバーライド優先、無ければ CSV 行から取得（全行共通前提）
  let from = periodOverride?.from;
  let to = periodOverride?.to;
  if (!from || !to) {
    const first = records[0];
    from = normalizeDate(first['期間(From)'] ?? '');
    to = normalizeDate(first['期間(to)'] ?? '');
  }
  if (!from || !to) {
    warnings.push('期間情報を特定できません');
    return {
      rows: [],
      skipped: records.length,
      warnings,
      periodFrom: from ?? '',
      periodTo: to ?? '',
    };
  }

  const { aggregation_unit, sale_date } = resolveAggregation(from, to);

  for (const r of records) {
    if (!r['作品ID']) {
      skipped += 1;
      continue;
    }

    const brand = brandFromCircle(r['サークル名'] ?? '');
    if (brand === 'unknown') {
      warnings.push(`未知のサークル名: "${r['サークル名']}"（brand=unknownで記録）`);
    }

    const product_id = r['作品ID'].trim();
    const product_title = (r['作品名'] ?? '').trim();
    const language = detectLanguage(product_title);
    const sales_price_jpy = toInt(r['単価']);
    const wholesale_price_jpy = toInt(r['卸金額']);
    const sales_count = toInt(r['販売数']);
    const net_revenue_jpy = toInt(r['卸金額合計']);

    rows.push({
      platform: 'fanza',
      brand,
      product_id,
      product_title,
      language,
      sales_price_jpy,
      wholesale_price_jpy,
      sales_count,
      net_revenue_jpy,
      sale_date,
      aggregation_unit,
      raw: r as unknown as Record<string, string>,
    });
  }

  return {
    rows,
    skipped,
    warnings,
    periodFrom: from,
    periodTo: to,
  };
}

function toInt(v: string | undefined): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
