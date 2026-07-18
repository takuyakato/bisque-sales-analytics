-- 017_revoke_public_access.sql のロールバック用。自動適用しないこと。

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
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO anon, authenticated',
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
      'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated',
      routine.signature
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS works_read ON public.works;
CREATE POLICY works_read ON public.works FOR SELECT USING (true);
DROP POLICY IF EXISTS product_variants_read ON public.product_variants;
CREATE POLICY product_variants_read ON public.product_variants FOR SELECT USING (true);
DROP POLICY IF EXISTS sales_daily_read ON public.sales_daily;
CREATE POLICY sales_daily_read ON public.sales_daily FOR SELECT USING (true);
DROP POLICY IF EXISTS youtube_metrics_daily_read ON public.youtube_metrics_daily;
CREATE POLICY youtube_metrics_daily_read ON public.youtube_metrics_daily FOR SELECT USING (true);
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS notion_pages_read ON public.notion_pages;
CREATE POLICY notion_pages_read ON public.notion_pages FOR SELECT USING (true);
DROP POLICY IF EXISTS ingestion_log_read ON public.ingestion_log;
CREATE POLICY ingestion_log_read ON public.ingestion_log FOR SELECT USING (true);
DROP POLICY IF EXISTS daily_rates_read ON public.daily_rates;
CREATE POLICY daily_rates_read ON public.daily_rates FOR SELECT USING (true);

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
