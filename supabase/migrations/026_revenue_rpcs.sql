-- ============================================================
-- 026: 売上集計 RPC と monthly 行検査 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_overseas_coverage()
RETURNS TABLE(
  kind TEXT,
  work_id TEXT,
  title TEXT,
  brand TEXT,
  ja_product_ids TEXT[],
  has_en BOOLEAN,
  has_zh_hans BOOLEAN,
  has_zh_hant BOOLEAN,
  has_ko BOOLEAN,
  revenue_ja_jpy BIGINT,
  revenue_all_lang_jpy BIGINT,
  sales_ja BIGINT,
  product_id TEXT,
  language TEXT,
  product_title TEXT,
  origin_status TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sales_by_variant AS (
    SELECT
      sd.variant_id,
      COALESCE(SUM(sd.net_revenue_jpy), 0)::BIGINT AS revenue_jpy,
      COALESCE(SUM(sd.sales_count), 0)::BIGINT AS sales_count
    FROM public.sales_daily AS sd
    GROUP BY sd.variant_id
  ),
  eligible_works AS (
    SELECT w.id, w.title, w.brand
    FROM public.works AS w
    WHERE w.brand IN ('CAPURI', 'BerryFeel')
      AND EXISTS (
        SELECT 1
        FROM public.product_variants AS pv
        WHERE pv.work_id = w.id
          AND pv.platform = 'dlsite'
          AND pv.language = 'ja'
      )
  ),
  work_rows AS (
    SELECT
      'work'::TEXT AS kind,
      w.id::TEXT AS work_id,
      w.title::TEXT AS title,
      w.brand::TEXT AS brand,
      ARRAY_AGG(pv.product_id ORDER BY pv.product_id)
        FILTER (WHERE pv.language = 'ja')::TEXT[] AS ja_product_ids,
      BOOL_OR(pv.language = 'en') AS has_en,
      BOOL_OR(pv.language = 'zh-Hans') AS has_zh_hans,
      BOOL_OR(pv.language = 'zh-Hant') AS has_zh_hant,
      BOOL_OR(pv.language = 'ko') AS has_ko,
      COALESCE(SUM(sbv.revenue_jpy) FILTER (WHERE pv.language = 'ja'), 0)::BIGINT AS revenue_ja_jpy,
      COALESCE(SUM(sbv.revenue_jpy), 0)::BIGINT AS revenue_all_lang_jpy,
      COALESCE(SUM(sbv.sales_count) FILTER (WHERE pv.language = 'ja'), 0)::BIGINT AS sales_ja,
      NULL::TEXT AS product_id,
      NULL::TEXT AS language,
      NULL::TEXT AS product_title,
      NULL::TEXT AS origin_status
    FROM eligible_works AS w
    JOIN public.product_variants AS pv
      ON pv.work_id = w.id
     AND pv.platform = 'dlsite'
    LEFT JOIN sales_by_variant AS sbv ON sbv.variant_id = pv.id
    GROUP BY w.id, w.title, w.brand
  ),
  unlinked_rows AS (
    SELECT
      'unlinked'::TEXT AS kind,
      pv.work_id::TEXT AS work_id,
      w.title::TEXT AS title,
      w.brand::TEXT AS brand,
      NULL::TEXT[] AS ja_product_ids,
      FALSE AS has_en,
      FALSE AS has_zh_hans,
      FALSE AS has_zh_hant,
      FALSE AS has_ko,
      0::BIGINT AS revenue_ja_jpy,
      0::BIGINT AS revenue_all_lang_jpy,
      0::BIGINT AS sales_ja,
      pv.product_id::TEXT AS product_id,
      pv.language::TEXT AS language,
      pv.product_title::TEXT AS product_title,
      pv.origin_status::TEXT AS origin_status
    FROM public.product_variants AS pv
    JOIN public.works AS w ON w.id = pv.work_id
    WHERE pv.platform = 'dlsite'
      AND w.brand IN ('CAPURI', 'BerryFeel')
      AND pv.language <> 'ja'
      AND pv.origin_status IS DISTINCT FROM 'standalone'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_variants AS ja
        WHERE ja.work_id = pv.work_id
          AND ja.platform = 'dlsite'
          AND ja.language = 'ja'
      )
  ),
  combined AS (
    SELECT * FROM work_rows
    UNION ALL
    SELECT * FROM unlinked_rows
  )
  SELECT combined.*, COUNT(*) OVER ()::BIGINT AS total_count
  FROM combined
  ORDER BY (combined.kind = 'work') DESC, combined.revenue_all_lang_jpy DESC, combined.work_id, combined.product_id;
$$;

CREATE OR REPLACE FUNCTION public.get_work_revenue_totals(work_ids TEXT[])
RETURNS TABLE(
  work_id TEXT,
  revenue_jpy BIGINT,
  sales_count BIGINT,
  variant_count BIGINT,
  by_platform JSONB,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH requested_works AS (
    SELECT w.id
    FROM public.works AS w
    WHERE work_ids IS NOT NULL
      AND CARDINALITY(work_ids) > 0
      AND w.id = ANY(work_ids)
  ),
  sales_by_variant AS (
    SELECT
      sd.variant_id,
      COALESCE(SUM(sd.net_revenue_jpy), 0)::BIGINT AS revenue_jpy,
      COALESCE(SUM(sd.sales_count), 0)::BIGINT AS sales_count
    FROM public.sales_daily AS sd
    GROUP BY sd.variant_id
  ),
  variant_totals AS (
    SELECT
      pv.work_id,
      COUNT(*)::BIGINT AS variant_count,
      COALESCE(SUM(sbv.revenue_jpy), 0)::BIGINT AS revenue_jpy,
      COALESCE(SUM(sbv.sales_count), 0)::BIGINT AS sales_count
    FROM public.product_variants AS pv
    JOIN requested_works AS rw ON rw.id = pv.work_id
    LEFT JOIN sales_by_variant AS sbv ON sbv.variant_id = pv.id
    GROUP BY pv.work_id
  ),
  platform_totals AS (
    SELECT
      platform_rows.work_id,
      JSONB_OBJECT_AGG(platform_rows.platform, platform_rows.revenue_jpy) AS by_platform
    FROM (
      SELECT
        pv.work_id,
        pv.platform,
        COALESCE(SUM(sbv.revenue_jpy), 0)::BIGINT AS revenue_jpy
      FROM public.product_variants AS pv
      JOIN requested_works AS rw ON rw.id = pv.work_id
      LEFT JOIN sales_by_variant AS sbv ON sbv.variant_id = pv.id
      GROUP BY pv.work_id, pv.platform
    ) AS platform_rows
    GROUP BY platform_rows.work_id
  ),
  totals AS (
    SELECT
      rw.id::TEXT AS work_id,
      COALESCE(vt.revenue_jpy, 0)::BIGINT AS revenue_jpy,
      COALESCE(vt.sales_count, 0)::BIGINT AS sales_count,
      COALESCE(vt.variant_count, 0)::BIGINT AS variant_count,
      COALESCE(pt.by_platform, '{}'::JSONB) AS by_platform
    FROM requested_works AS rw
    LEFT JOIN variant_totals AS vt ON vt.work_id = rw.id
    LEFT JOIN platform_totals AS pt ON pt.work_id = rw.id
  )
  SELECT totals.*, COUNT(*) OVER ()::BIGINT AS total_count
  FROM totals
  ORDER BY totals.work_id;
$$;

CREATE OR REPLACE FUNCTION public.count_monthly_rows()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.sales_daily
  WHERE aggregation_unit = 'monthly';
$$;

REVOKE EXECUTE ON FUNCTION public.get_overseas_coverage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overseas_coverage() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_work_revenue_totals(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_work_revenue_totals(TEXT[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.count_monthly_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_monthly_rows() TO service_role;
