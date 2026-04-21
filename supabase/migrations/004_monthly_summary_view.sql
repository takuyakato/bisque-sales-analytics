-- ============================================================
-- 月次×プラットフォーム／レーベル／言語の集計 VIEW
-- フロント側で sales_unified_daily 全行をフェッチしていた重いクエリを
-- DB 側で GROUP BY した小さな結果セットに置き換える
-- ============================================================

CREATE OR REPLACE VIEW monthly_platform_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  platform,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, platform
ORDER BY year_month, platform;

CREATE OR REPLACE VIEW monthly_brand_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  brand,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, brand
ORDER BY year_month, brand;

CREATE OR REPLACE VIEW monthly_language_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  language,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, language
ORDER BY year_month, language;
