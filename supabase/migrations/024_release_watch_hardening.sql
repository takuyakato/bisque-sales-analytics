-- bisque-release-watch 堅牢化（実装レビュー2026-08-04の対応）。追加のみ・既存データ無変更。
-- baseline_frozen_at: ベースライン集合の確定時刻。NULL=未確定（0件ソースでも確定を区別できるように）
-- note: 通知に付ける注記（例: brand未分類）。プロセスメモリ保持だと再送時に消えるためDBへ永続化

ALTER TABLE release_watch.sources ADD COLUMN baseline_frozen_at TIMESTAMPTZ;
ALTER TABLE release_watch.items ADD COLUMN note TEXT;

-- 稼働済みソースのbackfill: baseline確定済み（=pending以外）の既存行にfrozen時刻を補完する。
-- これがないと既存ソースがquarantine後にrebaseline（frozen必須）できなくなる
UPDATE release_watch.sources
SET baseline_frozen_at = COALESCE(baselined_at, NOW())
WHERE state <> 'pending_baseline' AND baseline_frozen_at IS NULL;
