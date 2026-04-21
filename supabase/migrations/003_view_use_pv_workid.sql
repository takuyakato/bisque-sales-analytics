-- ============================================================
-- sales_unified_daily VIEW を修正：
--   sd.work_id / sd.platform（denormalized）ではなく、
--   pv.work_id / pv.platform（単一の真実のソース）を参照する
--
-- 背景：
--   product_variants.work_id の紐付けを変更しても、
--   denormalize された sales_daily.work_id が古いままで
--   レポート・ランキング画面で翻訳版が JP 原作と別扱いされていた。
--
-- この migration により、variants を紐付け直せば即座に表示に反映される。
-- ============================================================

CREATE OR REPLACE VIEW sales_unified_daily AS
WITH fallback_rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key='usd_jpy_rate'
)
SELECT
  sd.sale_date,
  sd.aggregation_unit,
  pv.work_id AS work_id,                 -- ★ sd.work_id → pv.work_id
  COALESCE(w.brand, 'unknown') AS brand, -- pv.work_id 経由で works を JOIN
  pv.platform AS platform,               -- ★ sd.platform → pv.platform
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  sd.net_revenue_jpy AS revenue_jpy,
  sd.sales_count,
  NULL::INT AS views
FROM sales_daily sd
JOIN product_variants pv ON sd.variant_id = pv.id
LEFT JOIN works w ON pv.work_id = w.id   -- ★ sd.work_id → pv.work_id

UNION ALL

SELECT
  ym.metric_date AS sale_date,
  'daily' AS aggregation_unit,
  pv.work_id AS work_id,                 -- ★ ym.work_id → pv.work_id
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
