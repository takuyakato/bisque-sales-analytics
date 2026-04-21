-- ============================================================
-- 月次サマリ VIEW を MATERIALIZED VIEW 化
-- sales_unified_daily が 1M 行超になり通常 VIEW は timeout するため
-- ============================================================

SET statement_timeout = '10min';

-- monthly_platform_summary
DROP VIEW IF EXISTS monthly_platform_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS monthly_platform_summary CASCADE;

CREATE MATERIALIZED VIEW monthly_platform_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  platform,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, platform;

CREATE UNIQUE INDEX idx_monthly_platform_summary
  ON monthly_platform_summary (year_month, platform);

-- monthly_brand_summary
DROP VIEW IF EXISTS monthly_brand_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS monthly_brand_summary CASCADE;

CREATE MATERIALIZED VIEW monthly_brand_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  brand,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, brand;

CREATE UNIQUE INDEX idx_monthly_brand_summary
  ON monthly_brand_summary (year_month, brand);

-- monthly_language_summary
DROP VIEW IF EXISTS monthly_language_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS monthly_language_summary CASCADE;

CREATE MATERIALIZED VIEW monthly_language_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  language,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, language;

CREATE UNIQUE INDEX idx_monthly_language_summary
  ON monthly_language_summary (year_month, language);

-- 一括 REFRESH 用の関数（既存の refresh_work_revenue_summary と統合）
CREATE OR REPLACE FUNCTION refresh_all_summaries()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_platform_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_language_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_revenue_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON monthly_platform_summary TO anon, authenticated, service_role;
GRANT SELECT ON monthly_brand_summary    TO anon, authenticated, service_role;
GRANT SELECT ON monthly_language_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_all_summaries() TO service_role;
