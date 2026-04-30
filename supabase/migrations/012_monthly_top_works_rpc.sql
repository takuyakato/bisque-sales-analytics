-- ============================================================
-- 012: 月次 Top10 RPC を追加
--
-- monthly-report.ts (`/reports`) で当月明細を sales_unified_daily から
-- fetchAllPages して JS 側で Top10 を計算していたのを DB 側で完結させる。
-- ============================================================

CREATE OR REPLACE FUNCTION get_top_works_month(
  target_year_month TEXT,
  top_n INT DEFAULT 10
)
RETURNS TABLE(
  work_id     TEXT,
  title       TEXT,
  slug        TEXT,
  brand       TEXT,
  revenue     BIGINT,
  sales_count BIGINT
) AS $$
  SELECT
    s.work_id::TEXT,
    COALESCE(w.title, s.work_id)::TEXT  AS title,
    w.slug,
    COALESCE(w.brand, 'unknown')::TEXT  AS brand,
    SUM(s.revenue_jpy)::BIGINT          AS revenue,
    COALESCE(SUM(s.sales_count), 0)::BIGINT AS sales_count
  FROM sales_unified_daily s
  LEFT JOIN works w ON s.work_id = w.id
  WHERE s.work_id IS NOT NULL
    AND s.revenue_jpy IS NOT NULL
    AND TO_CHAR(s.sale_date::date, 'YYYY-MM') = target_year_month
  GROUP BY s.work_id, w.title, w.slug, w.brand
  HAVING SUM(s.revenue_jpy) > 0
  ORDER BY SUM(s.revenue_jpy) DESC
  LIMIT top_n;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION get_top_works_month(TEXT, INT)
  TO anon, authenticated, service_role;
