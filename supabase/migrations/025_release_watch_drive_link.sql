-- bisque-release-watch: DLsite系新作通知にGoogleドライブ動画リンクを添付する（specs/SPEC_drive_link_hold.md）
-- drive_url: video-localizerのNotion海外版管理表から解決した作品フォルダURL。
-- NULL=未解決。driveLink対象ソースではNULLの間は通知を保留する（上限3日）ため、通知可否の判定にも使う
ALTER TABLE release_watch.items ADD COLUMN drive_url TEXT;
