/**
 * プロジェクト全体で使う共通型
 */

export type Brand = 'CAPURI' | 'BerryFeel' | 'BLsand' | 'unknown';
export type Platform = 'dlsite' | 'fanza' | 'youtube';
export type Language = 'ja' | 'en' | 'zh-Hant' | 'zh-Hans' | 'ko' | 'unknown';
export type AggregationUnit = 'daily' | 'monthly';
export type IngestionSource = 'scrape' | 'csv-upload' | 'api';
export type IngestionStatus = 'success' | 'partial' | 'failed';
export type OriginStatus = 'original' | 'translation' | 'unknown';

/**
 * CSVパース後の標準化された売上行
 * DLsite / Fanza どちらのパーサーもこの形式で返す
 */
export interface CanonicalSalesRow {
  platform: Platform;
  brand: Brand;
  product_id: string;
  product_title: string;
  language: Language;
  sales_price_jpy: number;
  wholesale_price_jpy: number;
  sales_count: number;
  net_revenue_jpy: number;
  /** 月次集計時は期間from（月初日）、日次はその日 */
  sale_date: string; // YYYY-MM-DD
  aggregation_unit: AggregationUnit;
  /** 元のCSV行（デバッグ用、raw_data JSONB に保存） */
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: CanonicalSalesRow[];
  skipped: number; // TOTAL行などスキップ件数
  warnings: string[];
  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
}
