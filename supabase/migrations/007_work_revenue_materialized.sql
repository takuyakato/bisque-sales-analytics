-- ============================================================
-- Phase 3.7b: work_revenue_summary を MATERIALIZED VIEW 化
--
-- 通常 VIEW では 1M行 超の sales_unified_daily 集計が API timeout に
-- 抵触するため、事前計算して物理テーブルとして保存する。
-- 以降のクエリはインデックスで瞬時。
--
-- REFRESH はアプリから rpc('refresh_work_revenue_summary') で呼び出す。
-- ============================================================

-- 長めのタイムアウトでセッションを設定（初回集計が重いため）
SET statement_timeout = '10min';

DROP VIEW IF EXISTS work_revenue_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS work_revenue_summary CASCADE;

CREATE MATERIALIZED VIEW work_revenue_summary AS
SELECT
  work_id,
  platform,
  SUM(revenue_jpy)::BIGINT              AS revenue_all,
  COALESCE(SUM(sales_count), 0)::BIGINT AS sales_all
FROM sales_unified_daily
WHERE work_id IS NOT NULL
GROUP BY work_id, platform;

CREATE UNIQUE INDEX idx_work_revenue_summary
  ON work_revenue_summary (work_id, platform);

-- CONCURRENTLY で REFRESH するヘルパー関数
CREATE OR REPLACE FUNCTION refresh_work_revenue_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_revenue_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 誰でも読めるようにする（RLS対象外）
GRANT SELECT ON work_revenue_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_work_revenue_summary() TO service_role;
