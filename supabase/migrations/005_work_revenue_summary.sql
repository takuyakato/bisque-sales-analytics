-- ============================================================
-- Phase 3.7b: 作品別売上集計 VIEW
-- /works ランキング画面用。sales_unified_daily 全行（750k超）を
-- フロント側で work_id 別に集計していた処理を DB 側に寄せる。
-- 結果は (work_id × platform) 粒度の数千行に圧縮される。
-- ============================================================

CREATE OR REPLACE VIEW work_revenue_summary AS
SELECT
  work_id,
  platform,
  SUM(revenue_jpy)::BIGINT                                AS revenue_all,
  SUM(
    CASE
      WHEN sale_date >= CURRENT_DATE - INTERVAL '365 days' THEN revenue_jpy
      ELSE 0
    END
  )::BIGINT                                                AS revenue_y1,
  SUM(
    CASE
      WHEN sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN revenue_jpy
      ELSE 0
    END
  )::BIGINT                                                AS revenue_d30,
  COALESCE(SUM(sales_count), 0)::BIGINT                   AS sales_all
FROM sales_unified_daily
WHERE work_id IS NOT NULL
GROUP BY work_id, platform;
