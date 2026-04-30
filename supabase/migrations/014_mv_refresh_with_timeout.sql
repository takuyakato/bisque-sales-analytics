-- ============================================================
-- 014: MV REFRESH 関数内で statement_timeout を延長
--
-- 背景:
--   service_role の statement_timeout は 8s（Supabase デフォルト）。
--   REFRESH MATERIALIZED VIEW CONCURRENTLY は sales_unified_daily (1M+行) を
--   GROUP BY するため 8 秒では終わらない（特に monthly_*_summary）。
--
-- 対策:
--   関数内で `set_config('statement_timeout', '...', true)` で
--   トランザクションローカルにタイムアウトを延長する。
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_monthly_platform_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_platform_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_monthly_brand_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_monthly_language_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_language_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_monthly_brand_language_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_language_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_daily_breakdown_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_breakdown_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_work_d30_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_d30_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION refresh_work_revenue_summary()
RETURNS void AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_revenue_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
