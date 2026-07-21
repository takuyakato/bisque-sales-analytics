-- ============================================================
-- 022: public スキーマの関数から PUBLIC 実行権限を剥奪
--
-- 背景:
--   PostgreSQL は関数作成時にデフォルトで PUBLIC へ EXECUTE を付与するため、
--   017 の anon / authenticated 個別 REVOKE だけでは公開を防げない。
--   全関数を service_role 専用にし、今後作成する関数のデフォルト権限も変更する。
-- ============================================================

DO $$
DECLARE
  routine RECORD;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',
      routine.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      routine.signature
    );
  END LOOP;
END
$$;

-- 今後、この migration を実行するロールが作成する関数にも公開権限を付けない。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- SECURITY DEFINER 関数のオブジェクト解決先を固定し、search_path 注入を防ぐ。
ALTER FUNCTION public.refresh_monthly_platform_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_monthly_brand_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_monthly_language_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_monthly_brand_language_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_daily_breakdown_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_work_d30_summary()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_work_revenue_summary()
  SET search_path = public, pg_temp;
