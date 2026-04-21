-- ============================================================
-- 日次為替レート（USD→JPY）を保持し、sales_unified_daily VIEW で
-- YouTube収益を「当時のレート」で円換算する
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_rates (
  rate_date DATE PRIMARY KEY,
  usd_jpy NUMERIC(10, 4) NOT NULL,
  source TEXT DEFAULT 'frankfurter',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_rates_date ON daily_rates(rate_date DESC);

-- RLS: 読み取りのみ（全員可）
ALTER TABLE daily_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_rates_read ON daily_rates FOR SELECT USING (true);

-- VIEW を更新して daily_rates.usd_jpy を優先使用、無い日は app_settings.usd_jpy_rate にフォールバック
CREATE OR REPLACE VIEW sales_unified_daily AS
WITH fallback_rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key='usd_jpy_rate'
)
SELECT
  sd.sale_date,
  sd.aggregation_unit,
  sd.work_id,
  w.brand,
  sd.platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  sd.net_revenue_jpy AS revenue_jpy,
  sd.sales_count,
  NULL::INT AS views
FROM sales_daily sd
JOIN product_variants pv ON sd.variant_id = pv.id
JOIN works w ON sd.work_id = w.id

UNION ALL

SELECT
  ym.metric_date AS sale_date,
  'daily' AS aggregation_unit,
  ym.work_id,
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
