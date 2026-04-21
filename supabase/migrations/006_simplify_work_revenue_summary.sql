-- ============================================================
-- Phase 3.7b 改修: work_revenue_summary を単純化
-- 旧版は CASE 式が 2 つ（y1, d30）あって 750k 行×2回評価で timeout
-- → 全期間累計のみの単純な VIEW に（CASE なし）
-- 直近1年・直近30日の期間フィルタは、app 側で sales_daily に直接
-- 短期フィルタクエリを投げる形に変更する。
-- ============================================================

DROP VIEW IF EXISTS work_revenue_summary;

CREATE OR REPLACE VIEW work_revenue_summary AS
SELECT
  work_id,
  platform,
  SUM(revenue_jpy)::BIGINT            AS revenue_all,
  COALESCE(SUM(sales_count), 0)::BIGINT AS sales_all
FROM sales_unified_daily
WHERE work_id IS NOT NULL
GROUP BY work_id, platform;
