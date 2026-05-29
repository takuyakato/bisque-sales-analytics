-- product_variants.origin_status に 'standalone' を追加
--
-- 背景：DLsite上に日本語原作が存在しない単独配信の翻訳作品を区別するため。
-- これにより海外展開ページの「紐付いていない翻訳variant」カウントから除外でき、
-- 日次のリンク掃引でも毎回 API 再チェックされ続けるのを防ぐ。
ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_origin_status_check;

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_origin_status_check
  CHECK (origin_status IN ('original','translation','unknown','standalone'));
