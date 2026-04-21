-- ============================================================
-- Phase 2: 冗長な denormalized 列を DROP
--
-- sales_unified_daily VIEW は既に pv.work_id / pv.platform を参照しており（migration 003）、
-- アプリ側の ingest も column 未書込に更新済みなので、ここで物理的に削除する。
--
-- 前提：
--   - 先に deploy で新コード（列を書き込まない）を本番反映させる
--   - 既存の読み取りクエリは VIEW または variant JOIN 経由
-- ============================================================

-- sales_daily の platform は NOT NULL なので VIEW 再構築を避けるため CASCADE
ALTER TABLE sales_daily DROP COLUMN IF EXISTS work_id CASCADE;
ALTER TABLE sales_daily DROP COLUMN IF EXISTS platform CASCADE;

-- youtube_metrics_daily の work_id を DROP
ALTER TABLE youtube_metrics_daily DROP COLUMN IF EXISTS work_id CASCADE;

-- CASCADE で壊れた可能性のある VIEW を再作成
-- sales_unified_daily
CREATE OR REPLACE VIEW sales_unified_daily AS
WITH fallback_rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key='usd_jpy_rate'
)
SELECT
  sd.sale_date,
  sd.aggregation_unit,
  pv.work_id AS work_id,
  COALESCE(w.brand, 'unknown') AS brand,
  pv.platform AS platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  sd.net_revenue_jpy AS revenue_jpy,
  sd.sales_count,
  NULL::INT AS views
FROM sales_daily sd
JOIN product_variants pv ON sd.variant_id = pv.id
LEFT JOIN works w ON pv.work_id = w.id

UNION ALL

SELECT
  ym.metric_date AS sale_date,
  'daily' AS aggregation_unit,
  pv.work_id AS work_id,
  'BLsand' AS brand,
  'youtube' AS platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  ROUND(
    (COALESCE(ym.estimated_revenue_usd, 0) + COALESCE(ym.membership_revenue_usd, 0))
      * COALESCE(
          (SELECT usd_jpy FROM daily_rates WHERE rate_date = ym.metric_date),
          (SELECT usd_jpy FROM fallback_rate)
        )
  )::INT AS revenue_jpy,
  NULL::INT AS sales_count,
  ym.views
FROM youtube_metrics_daily ym
LEFT JOIN product_variants pv ON ym.variant_id = pv.id;

-- monthly_platform_summary
CREATE OR REPLACE VIEW monthly_platform_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  platform,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, platform
ORDER BY year_month, platform;

-- monthly_brand_summary
CREATE OR REPLACE VIEW monthly_brand_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  brand,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, brand
ORDER BY year_month, brand;

-- monthly_language_summary
CREATE OR REPLACE VIEW monthly_language_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  language,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, language
ORDER BY year_month, language;

-- work_revenue_summary (MATERIALIZED) — 列構成は元のまま
-- CASCADE で削除された場合のみ再作成（存在しなければ作る）
SET statement_timeout = '10min';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'work_revenue_summary') THEN
    CREATE MATERIALIZED VIEW work_revenue_summary AS
    SELECT
      work_id,
      platform,
      SUM(revenue_jpy)::BIGINT AS revenue_all,
      SUM(
        CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '365 days' THEN revenue_jpy ELSE 0 END
      )::BIGINT AS revenue_y1,
      SUM(
        CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN revenue_jpy ELSE 0 END
      )::BIGINT AS revenue_d30,
      COALESCE(SUM(sales_count), 0)::BIGINT AS sales_all
    FROM sales_unified_daily
    WHERE work_id IS NOT NULL
    GROUP BY work_id, platform;

    CREATE UNIQUE INDEX idx_work_revenue_summary ON work_revenue_summary (work_id, platform);
  END IF;
END $$;

-- REFRESH を最新化
REFRESH MATERIALIZED VIEW work_revenue_summary;
