-- ============================================================
-- 011: ダッシュボード高速化用の集計マテビュー追加
--
-- ダッシュボード (`/`) は sales_unified_daily (1M+ 行) を
-- 直近30日・前30日・前月以降・直近24か月の4区間にわたり明細フェッチして
-- JS 側で集計していたため SSR が重くなっていた。
-- DB 側で GROUP BY 済みのマテビューと Top10 RPC を用意し、
-- フロントの取得行数を桁違いに減らす。
--
-- 設計方針:
--   既存 work_revenue_summary（/works ページが稼働中）には触らず、
--   ダッシュボード専用に追加するだけ。ロールバックは新MV/関数を DROP するだけで完結。
--
-- 変更点:
-- 1. daily_breakdown_summary 新規  (sale_date × brand × platform × language)
-- 2. monthly_brand_language_summary 新規  (year_month × brand × language)
-- 3. work_d30_summary 新規  (直近30日 × work_id, Top10 RPC 用)
-- 4. get_top_works_d30(top_n) RPC 追加
-- 5. refresh_all_summaries() を新MVも REFRESH するよう更新
-- ============================================================

SET statement_timeout = '10min';

-- ------------------------------------------------------------
-- 1. daily_breakdown_summary
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS daily_breakdown_summary CASCADE;

CREATE MATERIALIZED VIEW daily_breakdown_summary AS
SELECT
  sale_date,
  brand,
  platform,
  language,
  SUM(revenue_jpy)::BIGINT             AS revenue,
  COALESCE(SUM(sales_count), 0)::BIGINT AS sales_count
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY sale_date, brand, platform, language;

CREATE UNIQUE INDEX idx_daily_breakdown_summary
  ON daily_breakdown_summary (sale_date, brand, platform, language);

CREATE INDEX idx_daily_breakdown_summary_date
  ON daily_breakdown_summary (sale_date);

GRANT SELECT ON daily_breakdown_summary TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2. monthly_brand_language_summary
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS monthly_brand_language_summary CASCADE;

CREATE MATERIALIZED VIEW monthly_brand_language_summary AS
SELECT
  TO_CHAR(TO_DATE(sale_date::text, 'YYYY-MM-DD'), 'YYYY-MM') AS year_month,
  brand,
  language,
  SUM(revenue_jpy)::BIGINT AS revenue
FROM sales_unified_daily
WHERE revenue_jpy IS NOT NULL
GROUP BY year_month, brand, language;

CREATE UNIQUE INDEX idx_monthly_brand_language_summary
  ON monthly_brand_language_summary (year_month, brand, language);

GRANT SELECT ON monthly_brand_language_summary TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. work_d30_summary （直近30日 work_id 別集計、Top10 RPC 用）
--    既存 work_revenue_summary には触らず、専用の小さな MV を追加。
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS work_d30_summary CASCADE;

CREATE MATERIALIZED VIEW work_d30_summary AS
SELECT
  work_id,
  SUM(revenue_jpy)::BIGINT             AS revenue,
  COALESCE(SUM(sales_count), 0)::BIGINT AS sales_count
FROM sales_unified_daily
WHERE work_id IS NOT NULL
  AND revenue_jpy IS NOT NULL
  AND sale_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY work_id;

CREATE UNIQUE INDEX idx_work_d30_summary ON work_d30_summary (work_id);

GRANT SELECT ON work_d30_summary TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Top10 RPC （直近30日 売上トップ N 作品）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_top_works_d30(top_n INT DEFAULT 10)
RETURNS TABLE(
  work_id     TEXT,
  title       TEXT,
  slug        TEXT,
  brand       TEXT,
  revenue     BIGINT,
  sales_count BIGINT
) AS $$
  SELECT
    s.work_id,
    COALESCE(w.title, s.work_id)::TEXT  AS title,
    w.slug,
    COALESCE(w.brand, 'unknown')::TEXT  AS brand,
    s.revenue,
    s.sales_count
  FROM work_d30_summary s
  LEFT JOIN works w ON s.work_id = w.id
  WHERE s.revenue > 0
  ORDER BY s.revenue DESC
  LIMIT top_n;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION get_top_works_d30(INT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. refresh_all_summaries を更新（新MVも対象に）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_all_summaries()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_platform_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_language_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_language_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_breakdown_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_d30_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_revenue_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_all_summaries() TO service_role;
