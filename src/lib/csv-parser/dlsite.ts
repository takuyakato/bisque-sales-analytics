import { parse } from 'csv-parse/sync';
import { CanonicalSalesRow, ParseResult } from '@/lib/types';
import { brandFromCircle } from '@/lib/constants/brand-mapping';
import { detectLanguage } from '@/lib/utils/detect-language';
import { resolveAggregation } from './period';

/**
 * DLsite CSVのカラム構成
 * サークルID,サークル名,販売サイト,作品ID,作品名,販売価格,卸価格,販売数,売上額
 */
interface DlsiteRow {
  サークルID: string;
  サークル名: string;
  販売サイト: string;
  作品ID: string;
  作品名: string;
  販売価格: string;
  卸価格: string;
  販売数: string;
  売上額: string;
}

/**
 * DLsite CSV（UTF-8デコード済み文字列）をパースして標準化された行に変換
 *
 * @param csvText デコード済みのCSVテキスト
 * @param period  取込期間（UIで指定、DLsiteはファイル名に期間情報がないため必須）
 */
export function parseDlsiteCsv(
  csvText: string,
  period: { from: string; to: string }
): ParseResult {
  const warnings: string[] = [];
  const rows: CanonicalSalesRow[] = [];
  let skipped = 0;

  const records: DlsiteRow[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const { aggregation_unit, sale_date } = resolveAggregation(period.from, period.to);

  for (const r of records) {
    // TOTAL行はスキップ
    if (r['作品ID'] === 'TOTAL' || !r['作品ID']) {
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
    const sales_price_jpy = toInt(r['販売価格']);
    const wholesale_price_jpy = toInt(r['卸価格']);
    const sales_count = toInt(r['販売数']);
    const net_revenue_jpy = toInt(r['売上額']);

    rows.push({
      platform: 'dlsite',
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
    periodFrom: period.from,
    periodTo: period.to,
  };
}

function toInt(v: string | undefined): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
