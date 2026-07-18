-- anon / authenticated から public スキーマの DB オブジェクトを遮断する。
-- service_role の権限は変更しない。

DO $$
DECLARE
  relation RECORD;
  routine RECORD;
BEGIN
  FOR relation IN
    SELECT format('%I.%I', schemaname, tablename) AS qualified_name
    FROM pg_tables
    WHERE schemaname = 'public'
    UNION ALL
    SELECT format('%I.%I', schemaname, viewname) AS qualified_name
    FROM pg_views
    WHERE schemaname = 'public'
    UNION ALL
    SELECT format('%I.%I', schemaname, matviewname) AS qualified_name
    FROM pg_matviews
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE %s FROM anon, authenticated',
      relation.qualified_name
    );
  END LOOP;

  FOR routine IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated',
      routine.signature
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS works_read ON public.works;
DROP POLICY IF EXISTS product_variants_read ON public.product_variants;
DROP POLICY IF EXISTS sales_daily_read ON public.sales_daily;
DROP POLICY IF EXISTS youtube_metrics_daily_read ON public.youtube_metrics_daily;
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
DROP POLICY IF EXISTS notion_pages_read ON public.notion_pages;
DROP POLICY IF EXISTS ingestion_log_read ON public.ingestion_log;
DROP POLICY IF EXISTS daily_rates_read ON public.daily_rates;

-- 今後、この migration を実行するロールが作成するオブジェクトにも公開権限を付けない。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
