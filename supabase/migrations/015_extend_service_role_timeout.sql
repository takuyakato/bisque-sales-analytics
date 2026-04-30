-- ============================================================
-- 015: service_role / authenticator の statement_timeout を延長
--
-- 背景:
--   関数内 SET LOCAL statement_timeout が効かなかった（PostgREST 経由）。
--   ロール自体の statement_timeout を延長することで、MV REFRESH RPC を
--   service_role 経由でも通せるようにする。
--
-- セキュリティ:
--   service_role は API サーバーサイドからのみ使う。重いクエリで詰まるリスクは
--   一般ユーザー (anon) には影響しない。MV REFRESH のための延長は妥当。
-- ============================================================

ALTER ROLE service_role SET statement_timeout = '120s';
ALTER ROLE authenticator SET statement_timeout = '120s';
