-- ============================================================
-- bisque-sales-analytics 初期スキーマ（v3.6準拠）
-- ============================================================
-- 作成順序: ingestion_log → works → product_variants → sales_daily
--           → youtube_metrics_daily → app_settings → notion_pages → VIEW → RLS
-- ============================================================

-- ============================================================
-- 1. ingestion_log（先に作成：sales_daily / youtube_metrics_daily から参照）
-- ============================================================
CREATE TABLE ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scrape','csv-upload','api')),
  target_date_from DATE,
  target_date_to DATE,
  status TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  error_message TEXT,
  error_screenshot_path TEXT,
  source_version TEXT,
  runner TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_started ON ingestion_log(started_at DESC);
CREATE INDEX idx_ingestion_platform_status ON ingestion_log(platform, status);

-- ============================================================
-- 2. works（作品マスタ）
-- ============================================================
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  brand TEXT NOT NULL CHECK (brand IN ('CAPURI','BerryFeel','BLsand','unknown')),
  genre TEXT CHECK (genre IN ('BL','TL','all-ages')),
  release_date DATE,
  auto_created BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_works_brand ON works(brand);
CREATE INDEX idx_works_auto ON works(auto_created);
CREATE INDEX idx_works_slug ON works(slug);

-- ============================================================
-- 3. product_variants（言語別プラットフォームSKU）
-- ============================================================
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT REFERENCES works(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('dlsite','fanza','youtube')),
  product_id TEXT NOT NULL,
  product_title TEXT,
  language TEXT NOT NULL DEFAULT 'unknown'
    CHECK (language IN ('ja','en','zh-Hant','zh-Hans','ko','unknown')),
  origin_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (origin_status IN ('original','translation','unknown')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, product_id)
);

CREATE INDEX idx_variants_work ON product_variants(work_id);
CREATE INDEX idx_variants_platform_lang ON product_variants(platform, language);

-- ============================================================
-- 4. sales_daily（日次売上トランザクション）
-- ============================================================
CREATE TABLE sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  work_id TEXT REFERENCES works(id),
  platform TEXT NOT NULL,
  sale_date DATE NOT NULL,
  aggregation_unit TEXT NOT NULL CHECK (aggregation_unit IN ('daily','monthly')),
  sales_price_jpy INT,
  wholesale_price_jpy INT,
  sales_count INT NOT NULL,
  net_revenue_jpy INT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scrape','csv-upload','manual')),
  raw_data JSONB,
  ingestion_log_id UUID REFERENCES ingestion_log(id),
  ingested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(variant_id, sale_date, aggregation_unit, sales_price_jpy)
);

CREATE INDEX idx_sales_daily_date ON sales_daily(sale_date DESC);
CREATE INDEX idx_sales_daily_work ON sales_daily(work_id);
CREATE INDEX idx_sales_daily_platform ON sales_daily(platform);
CREATE INDEX idx_sales_daily_agg ON sales_daily(aggregation_unit);

-- ============================================================
-- 5. youtube_metrics_daily
-- ============================================================
CREATE TABLE youtube_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  work_id TEXT REFERENCES works(id),
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  video_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  views INT,
  watch_time_minutes INT,
  subscribers_gained INT,
  estimated_revenue_usd NUMERIC(10,4),
  membership_revenue_usd NUMERIC(10,4),
  raw_data JSONB,
  ingestion_log_id UUID REFERENCES ingestion_log(id),
  ingested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(video_id, metric_date)
);

CREATE INDEX idx_yt_daily_date ON youtube_metrics_daily(metric_date DESC);
CREATE INDEX idx_yt_daily_channel ON youtube_metrics_daily(channel_id);
CREATE INDEX idx_yt_daily_variant ON youtube_metrics_daily(variant_id);

-- ============================================================
-- 6. app_settings（アプリケーション設定）
-- ============================================================
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('usd_jpy_rate', '150', 'YouTube USD → JPY換算の固定レート'),
  ('yt_channel_id_jp', '', 'BLサンド日本チャンネルID'),
  ('yt_channel_id_en', '', 'BLサンド英語チャンネルID');

-- ============================================================
-- 7. notion_pages（Notion月次ページの追跡）
-- ============================================================
CREATE TABLE notion_pages (
  month TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_url TEXT,
  summary_block_id TEXT,
  daily_table_block_id TEXT,
  top_works_table_block_id TEXT,
  language_summary_block_id TEXT,
  brand_summary_block_id TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. sales_unified_daily（プラットフォーム横断VIEW）
-- ============================================================
CREATE OR REPLACE VIEW sales_unified_daily AS
WITH rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key='usd_jpy_rate'
)
SELECT
  sd.sale_date,
  sd.aggregation_unit,
  sd.work_id,
  w.brand,
  sd.platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  sd.net_revenue_jpy AS revenue_jpy,
  sd.sales_count,
  NULL::INT AS views
FROM sales_daily sd
JOIN product_variants pv ON sd.variant_id = pv.id
JOIN works w ON sd.work_id = w.id

UNION ALL

SELECT
  ym.metric_date AS sale_date,
  'daily' AS aggregation_unit,
  ym.work_id,
  'BLsand' AS brand,
  'youtube' AS platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  ROUND(
    (COALESCE(ym.estimated_revenue_usd, 0) + COALESCE(ym.membership_revenue_usd, 0))
      * (SELECT usd_jpy FROM rate)
  )::INT AS revenue_jpy,
  NULL::INT AS sales_count,
  ym.views
FROM youtube_metrics_daily ym
LEFT JOIN product_variants pv ON ym.variant_id = pv.id;

-- ============================================================
-- 9. Row Level Security（RLS）
-- ============================================================
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY works_read ON works FOR SELECT USING (true);
CREATE POLICY product_variants_read ON product_variants FOR SELECT USING (true);
CREATE POLICY sales_daily_read ON sales_daily FOR SELECT USING (true);
CREATE POLICY youtube_metrics_daily_read ON youtube_metrics_daily FOR SELECT USING (true);
CREATE POLICY app_settings_read ON app_settings FOR SELECT USING (true);
CREATE POLICY notion_pages_read ON notion_pages FOR SELECT USING (true);
CREATE POLICY ingestion_log_read ON ingestion_log FOR SELECT USING (true);
