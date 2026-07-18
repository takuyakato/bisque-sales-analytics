-- ============================================================
-- 019: YouTube 収益を Analytics API の JPY 直取得値へ切替
--
-- 移行中は JPY 未取得行に限り、従来の USD 換算へフォールバックする。
-- ============================================================

ALTER TABLE youtube_metrics_daily
  ADD COLUMN IF NOT EXISTS estimated_revenue_jpy NUMERIC;

-- 列構成・型は変更しないため、依存する VIEW / MATERIALIZED VIEW を維持したまま
-- 定義だけを差し替えられる。
CREATE OR REPLACE VIEW sales_unified_daily AS
WITH fallback_rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key = 'usd_jpy_rate'
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
    COALESCE(
      ym.estimated_revenue_jpy
        -- Membership 収益は現状常に0。JPY直接取得へ移行するまでは従来どおりUSD換算して加算する。
        + COALESCE(COALESCE(ym.membership_revenue_usd, 0) * rate.usd_jpy, 0),
      (COALESCE(ym.estimated_revenue_usd, 0) + COALESCE(ym.membership_revenue_usd, 0))
        * rate.usd_jpy
    )
  )::INT AS revenue_jpy,
  NULL::INT AS sales_count,
  ym.views
FROM youtube_metrics_daily ym
LEFT JOIN product_variants pv ON ym.variant_id = pv.id
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT usd_jpy FROM daily_rates WHERE rate_date = ym.metric_date),
    (SELECT usd_jpy FROM fallback_rate)
  ) AS usd_jpy
) rate;
