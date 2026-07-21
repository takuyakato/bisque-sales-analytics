# SPEC: P1 — MVリフレッシュRPC等のPUBLIC EXECUTE権限を剥奪（脆弱性修正）

## 目的
public スキーマの関数（特に重いMVリフレッシュ用 RPC）が、ブラウザに公開される anon キーで誰でも実行できる状態になっている（実測でHTTP 204成功）。PostgreSQLは関数作成時にデフォルトでPUBLICへEXECUTEを付与するため、migration 017 の anon/authenticated 個別REVOKEだけでは塞げていない。PUBLIC からEXECUTEを剥奪し、サーバーサイド専用の service_role のみ実行可能にする。

## 変更対象
- 新規作成: `supabase/migrations/022_revoke_function_public_execute.sql`
- 上記以外のファイルは変更しない

## 要求仕様
1. public スキーマの**全関数**について `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` を行う。migration 017 の DO ループ（pg_proc を回して signature を組み立てる方式）と同じ書き方を踏襲する。
2. 同ループ内で、剥奪後もサーバーサイドが実行できるよう各関数へ `GRANT EXECUTE ON FUNCTION ... TO service_role` を明示的に付け直す（既存GRANTがあっても冪等）。
3. 今後この migration を実行するロールが新規作成する関数にもPUBLIC実行権が付かないよう、`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` を追加する。
4. SECURITY DEFINER 関数（`refresh_monthly_platform_summary` / `refresh_monthly_brand_summary` / `refresh_monthly_language_summary` / `refresh_monthly_brand_language_summary` / `refresh_daily_breakdown_summary` / `refresh_work_d30_summary` / `refresh_work_revenue_summary` の7本）に対し、search_path 注入攻撃対策として `ALTER FUNCTION <name>() SET search_path = public, pg_temp` を付与する。これら7本はいずれも引数なし（`()`）。
5. 冒頭にこの migration の目的・背景をコメントで記載する（017・015 と同じスタイル）。

## スコープ外（やらないこと）
- anon/authenticated への追加のREVOKE（017で対応済み。重複して害はないが不要）
- テーブル・ビューの権限変更（本件は関数のみ）
- 関数の中身（ロジック）の変更
- migration の適用（リモートDBへの `supabase db push` は Claude 側が検収で行う。Codexは適用しない）

## 受け入れ基準
- [ ] `supabase/migrations/022_revoke_function_public_execute.sql` が新規作成されている
- [ ] ファイル内に PUBLIC からのREVOKE・service_role へのGRANT・DEFAULT PRIVILEGES・SECURITY DEFINER 7本への search_path 設定がすべて含まれる
- [ ] SQL構文が正しい（後述の psql --dry ではなく Claude 側でリモート適用して確認する）

## 動作確認方法
（Codex側）SQLファイルの構文を目視で確認し、DOブロックの構造が migration 017 と整合していることを報告する。ネットワーク遮断環境のためDB適用はしない。
（Claude側・検収）`supabase db push` でリモート適用 → anon キーで `POST /rest/v1/rpc/refresh_work_d30_summary` が 401/403 で拒否されること、service_role キーで同RPCが 204 で成功することの両方を実測する。

## 制約・注意
- 既存 migration の連番は 021 まで（020は欠番）。次は 022。
- migration 017 (`supabase/migrations/017_revoke_public_access.sql`) を必ず参照し、DOループの書き方・`format('%I.%I', ...)` や `p.oid::regprocedure::text` の使い方を揃えること。
- service_role の実行権を誤って剥奪すると毎朝の取込パイプラインが全停止する。service_role への GRANT を必ず含めること。
- Supabase CLI 経由の適用が前提（Dashboard SQL Editor は使わない）。
