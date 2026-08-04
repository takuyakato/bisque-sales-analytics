-- bisque-release-watch（作品公開Slack通知）の状態管理スキーマと専用ロール。
-- 既存テーブルは一切変更しない（読取ポリシーの追加のみ）。
-- スキーマ定義の正本はこの migration。利用側コードは takuyakato/bisque-release-watch。

CREATE SCHEMA IF NOT EXISTS release_watch;

CREATE TABLE release_watch.sources (
  source_key TEXT PRIMARY KEY,
  config_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending_baseline'
    CHECK (state IN ('pending_baseline','active','quarantined','disabled')),
  baselined_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ
);

CREATE TABLE release_watch.items (
  source_key TEXT NOT NULL REFERENCES release_watch.sources(source_key),
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  slack_ts TEXT,
  is_baseline BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (source_key, item_id),
  -- baseline 登録分が通知済みになる矛盾状態を DB レベルで禁止
  CHECK (NOT (is_baseline AND notified_at IS NOT NULL))
);

CREATE INDEX idx_release_watch_items_pending
  ON release_watch.items (source_key)
  WHERE notified_at IS NULL AND NOT is_baseline;

-- 専用ロール。パスワードは管理者が psql で別途 ALTER ROLE ... PASSWORD を実行する
-- （資格情報操作は migration に平文を書かない。手順は bisque-release-watch/README 参照）
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'release_watch_bot') THEN
    CREATE ROLE release_watch_bot LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA release_watch TO release_watch_bot;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA release_watch TO release_watch_bot;
ALTER DEFAULT PRIVILEGES IN SCHEMA release_watch
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO release_watch_bot;

-- 既存テーブルは以下 3 つの SELECT のみ許可（CREATE/TRUNCATE/TRIGGER 等は付与しない）
GRANT USAGE ON SCHEMA public TO release_watch_bot;
GRANT SELECT ON public.works, public.product_variants, public.ingestion_log TO release_watch_bot;

-- 3 テーブルは RLS 有効（001）かつ公開ポリシーは 017 で撤去済みのため、専用の読取ポリシーが必要
CREATE POLICY release_watch_read_works
  ON public.works FOR SELECT TO release_watch_bot USING (true);
CREATE POLICY release_watch_read_variants
  ON public.product_variants FOR SELECT TO release_watch_bot USING (true);
CREATE POLICY release_watch_read_ingestion
  ON public.ingestion_log FOR SELECT TO release_watch_bot USING (true);
