# SPEC: DB公開権限の遮断（anon/authenticated のアクセス撤廃）

## 目的
売上テーブル・VIEW・MV・RPCが Supabase の anon キー（公開前提のキー）で直接読める状態を遮断する。
背景は `deep-think_サービス改善ロードマップ_2026-07-18.md` P0-1（合格済み）。
アプリのDBアクセスは全て service client（service_role、RLSバイパス）経由であることを確認済み。

## 変更対象
- 新規：`supabase/migrations/<次番号>_revoke_public_access.sql`
- 新規：`docs/rollback_revoke_public_access.sql`（復元用。migrations/ には置かない＝自動適用させない）
- 新規：`scripts/verify-anon-blocked.ts`（検収スクリプト）
- 削除：`src/lib/supabase/client.ts`、`src/lib/supabase/server.ts`（未使用を再確認の上で）
- 変更：`.env.example`（NEXT_PUBLIC_SUPABASE_ANON_KEY 行を削除）
- 上記以外のファイルは変更禁止

## 要求仕様
1. 実装前に、src/ 全域で `supabase/client` / `supabase/server` の import と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の参照が本当にゼロか grep で再確認する。1件でも見つかったら**実装を止めて報告**する
2. migration の内容：
   - public スキーマの全テーブル・全VIEW・全MVに対する anon / authenticated への権限を REVOKE（SELECT/INSERT/UPDATE/DELETE すべて）
   - 全関数（RPC。get_top_works_d30 / get_top_works_month / refresh系 等）の EXECUTE を anon / authenticated から REVOKE
   - `USING (true)` 系の緩い RLS ポリシーを DROP（RLS 自体は有効のまま維持。service_role はRLSをバイパスするためポリシー不要）
   - `ALTER DEFAULT PRIVILEGES` で、今後 public スキーマに作られるテーブル・関数にも anon / authenticated へ自動GRANTされないようにする
   - 対象の洗い出しは既存 migration（001/002/007/008/010/011/012/013/014）を精査して漏れなく列挙すること（information_schema を使った動的REVOKEでも、明示列挙でもよいが、冪等に再実行できること）
3. rollback SQL：migration が REVOKE / DROP したものを復元する逆操作を docs/ に置く（適用はしない）
4. `scripts/verify-anon-blocked.ts`：
   - `.env.local` の URL と（退役予定の）anon キーで @supabase/supabase-js クライアントを作り、
     主要オブジェクトへの読み取りを試行：sales_daily / works / product_variants / sales_unified_daily /
     daily_breakdown_summary / monthly_platform_summary / monthly_brand_summary / monthly_language_summary /
     monthly_brand_language_summary / work_revenue_summary / work_d30_summary / ingestion_log、
     RPC get_top_works_d30
   - **全てが権限エラー（またはデータ0件の拒否応答）になれば exit 0、1つでも読めたら exit 1** で対象名を出力
   - anon キーが .env.local に無い場合は引数 `--anon-key=<key>` で渡せるようにする
5. src/lib/supabase/client.ts・server.ts の削除と .env.example からのキー行削除

## スコープ外（やらないこと）
- cron 認証の修正（次の発注 P0-2 で行う）
- Storage バケットの変更（private 確認済み）
- migration の実際の適用（`supabase db push` は Claude 側で実行する）
- Vercel / GitHub Secrets 上の環境変数削除（Claude側で実施）

## 受け入れ基準
- [ ] `npx tsc --noEmit` 成功（client.ts/server.ts 削除後もビルドが壊れない）
- [ ] `npm run build` 成功（Claude側）
- [ ] migration 適用後、`npx tsx scripts/verify-anon-blocked.ts` が exit 0（Claude側で適用・実行）
- [ ] 適用後もダッシュボード・月次レポートの表示が正常（Claude側でデータ層検証＋本番確認）
- [ ] migration ファイルが冪等（同じSQLを2回実行してもエラーにならない）
- [ ] git diff が「変更対象」記載のファイルのみ

## 動作確認方法
- Codex側（ネットワーク不可）：grep再確認結果の報告／`npx tsc --noEmit`／migration SQL の静的レビュー（構文・冪等性）
- Claude側：`supabase db push` → verify-anon-blocked.ts 実行 → クエリ関数の実データ実行 → デプロイ → 本番表示確認

## 制約・注意
- migration は Supabase CLI 管理（プロジェクトCLAUDE.md準拠）。SQL Editor手動実行を前提にしない
- `REVOKE ... FROM anon, authenticated` は存在しない権限に対してもエラーにならないが、DROP POLICY は `IF EXISTS` を付けて冪等にする
- service_role の権限は一切変更しない（アプリ・スクレイパー・スクリプトすべてこの経路）
- postgres ロール（supabase管理画面）には影響を与えない
