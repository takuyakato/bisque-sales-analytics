-- ============================================================
-- work_revenue_summary に期間フィルタ (y1, d30) を追加
-- MATERIALIZED VIEW なので CASE 式も一度だけ計算される
-- REFRESH のタイミングで CURRENT_DATE が再評価されるので日次 REFRESH で日付境界も正しく動く
-- ============================================================

SET statement_timeout = '10min';

DROP VIEW IF EXISTS work_revenue_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS work_revenue_summary CASCADE;

CREATE MATERIALIZED VIEW work_revenue_summary AS
SELECT
  work_id,
  platform,
  SUM(revenue_jpy)::BIGINT                                AS revenue_all,
  SUM(
    CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '365 days' THEN revenue_jpy ELSE 0 END
  )::BIGINT                                                AS revenue_y1,
  SUM(
    CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN revenue_jpy ELSE 0 END
  )::BIGINT                                                AS revenue_d30,
  COALESCE(SUM(sales_count), 0)::BIGINT                   AS sales_all
FROM sales_unified_daily
WHERE work_id IS NOT NULL
GROUP BY work_id, platform;

CREATE UNIQUE INDEX idx_work_revenue_summary
  ON work_revenue_summary (work_id, platform);

CREATE OR REPLACE FUNCTION refresh_work_revenue_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_revenue_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON work_revenue_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_work_revenue_summary() TO service_role;
