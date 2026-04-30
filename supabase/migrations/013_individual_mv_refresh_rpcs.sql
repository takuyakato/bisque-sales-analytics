-- ============================================================
-- 013: 各 MV の個別 REFRESH RPC を追加
--
-- 背景:
--   refresh_all_summaries() は 6 個の MV を CONCURRENTLY REFRESH するが、
--   PostgREST 経由 (service_role) で呼ぶと statement_timeout に引っかかり
--   失敗していた (mvRefreshed: false)。
--   結果として monthly_platform_summary などが古いまま放置され、
--   ダッシュボードが古い数値を表示する事象が発生。
--
-- 対策:
--   各 MV ごとに個別の REFRESH RPC を作って、API 側で順次呼ぶ。
--   個別 REFRESH は数秒〜十数秒で終わり、タイムアウトに余裕がある
--   （実測: refresh_work_revenue_summary = 5.8 秒）
--
--   既存の refresh_work_revenue_summary はそのまま使う。
--   新規追加: refresh_monthly_platform_summary,
--             refresh_monthly_brand_summary,
--             refresh_monthly_language_summary,
--             refresh_monthly_brand_language_summary,
--             refresh_daily_breakdown_summary,
--             refresh_work_d30_summary
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_monthly_platform_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_platform_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_monthly_platform_summary() TO service_role;

CREATE OR REPLACE FUNCTION refresh_monthly_brand_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_monthly_brand_summary() TO service_role;

CREATE OR REPLACE FUNCTION refresh_monthly_language_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_language_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_monthly_language_summary() TO service_role;

CREATE OR REPLACE FUNCTION refresh_monthly_brand_language_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_brand_language_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_monthly_brand_language_summary() TO service_role;

CREATE OR REPLACE FUNCTION refresh_daily_breakdown_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_breakdown_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_daily_breakdown_summary() TO service_role;

CREATE OR REPLACE FUNCTION refresh_work_d30_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY work_d30_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION refresh_work_d30_summary() TO service_role;
