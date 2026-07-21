# SPEC: P2 — MVリフレッシュをGitHub Actionsへ移し、revalidateを軽量化

## 目的
現在 `/api/cron/revalidate` は7本のMV（集計ビュー）を順次REFRESHしており合計約76秒かかる。Vercelの関数実行時間制限（Hobbyでも最大300秒だが、7/18に60秒へ縮小されて504障害が発生）という「サーバーレスの時間制約」に構造的に縛られている。重い処理はGitHub Actions側（時間制限が緩い）に移し、Vercelのrevalidateは「キャッシュを捨てるだけ」の軽量エンドポイント（1秒未満）に戻す。あわせてキャッシュ破棄方式を、取込直後の初回アクセスから最新データを保証する方式に変更する。

## 変更対象
- 新規作成: `scripts/refresh-mvs.ts`（MVリフレッシュ専用スクリプト）
- 削除: `scripts/refresh-mvs-individual.ts`（旧スクリプト。env無条件読込・失敗でも終了コード0で流用不可。どこからも参照されていない）
- 変更: `src/app/api/cron/revalidate/route.ts`（MVリフレッシュ処理を削除し軽量化）
- 変更: `.github/workflows/scrape-dlsite-daily.yml`
- 変更: `.github/workflows/scrape-fanza-daily.yml`
- 変更: `.github/workflows/scrape-youtube-daily.yml`

## 要求仕様

### 1. `scripts/refresh-mvs.ts`（新規）
7本のMVリフレッシュRPCを順次実行するCLIスクリプト。
- 対象RPC（この順序）: `refresh_monthly_platform_summary` / `refresh_monthly_brand_summary` / `refresh_monthly_language_summary` / `refresh_monthly_brand_language_summary` / `refresh_daily_breakdown_summary` / `refresh_work_d30_summary` / `refresh_work_revenue_summary`
- **env読み込み**: `.env.local` が存在する場合のみ読み込む（`fs.existsSync` で確認してから）。存在しなくてもエラーにしない（CIでは環境変数がworkflowから渡る）。
- **env検証**: 起動時に `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が両方セットされているか確認し、欠けていれば標準エラーにメッセージを出して `process.exit(1)`。
- **クライアント**: `src/lib/supabase/service.ts` の `createServiceClient()` を使う。
- **実行と再試行**: 各RPCを実行。エラーが返ったら指数バックオフ（例: 1秒→2秒）で最大2回まで追加再試行する（MVリフレッシュは冪等なので安全）。1本が最終的に失敗しても残りのRPCは続行する（全本を試みる）。
- **ログ出力**: RPCごとに1行のJSONを標準出力に出す。フィールド: `{ "mv": "<関数名>", "ms": <所要ミリ秒>, "ok": true|false, "attempts": <試行回数>, "error": "<エラーメッセージ or null>" }`。
- **終了コード**: 1本でも最終的に失敗したら `process.exit(1)`。全本成功なら 0。
- **最後に**: 成功本数・失敗本数・合計所要時間のサマリを1行で標準出力に出す。

### 2. `src/app/api/cron/revalidate/route.ts`（軽量化）
- MVリフレッシュ処理（`REFRESH_FUNCTIONS` ループ・`createServiceClient` 呼び出し・`mvDetails`・500返却）を**すべて削除**する。
- POST は認証（既存の Bearer CRON_SECRET チェック）を通過したら、`tags`（デフォルト `['sales-data']`）に対して `revalidateTag(t, { expire: 0 })` を呼び、`{ ok: true, tags, at }` を返すだけにする。
  - 現行の `revalidateTag(t, 'max')` は stale-while-revalidate（初回アクセスに古い値を返す）ため、取込直後の最新化を保証するには `{ expire: 0 }` を使う（外部サービスがRoute Handlerを呼ぶ場合のNext.js公式推奨パターン）。
- `export const maxDuration = 60;` に戻す（300は不要になる）。
- 使わなくなった import（`createServiceClient`）を削除する。
- GET（疎通確認用）は現状のまま残す。

### 3. 3つのワークフロー（共通の変更）
各ワークフローの末尾にある「Revalidate Vercel cache」ステップの**手前**に、新しいステップ「Refresh materialized views」を追加する。
- 「Refresh materialized views」ステップ:
  - `if: success()`
  - `run: npx tsx scripts/refresh-mvs.ts`
  - `env:` に `NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}` と `SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}` を渡す
- 既存の「Revalidate Vercel cache」ステップの curl に `--retry 3 --max-time 30` を追加する（軽量化されたので短いタイムアウトで十分、一時的失敗はリトライ）。`if: success()` は維持。
- DLsite と Fanza のワークフローは `timeout-minutes: 15` を `30` に変更する（MVリフレッシュがスクレイプと同じジョブに乗るため）。YouTube は既に60なので変更不要。

## スコープ外（やらないこと）
- MVそのものの統合・削減（7本→2本など。これはP3の観測後に判断する別件）
- MV定義（migration）の変更
- Vercel Cron（notion / snapshot）の変更
- スクレイパー本体のロジック変更
- Slack等の通知の追加

## 受け入れ基準
- [ ] `scripts/refresh-mvs.ts` が新規作成され、`.env.local` 非存在でもクラッシュせず、env欠如時に exit 1 する
- [ ] `scripts/refresh-mvs-individual.ts` が削除されている
- [ ] `revalidate/route.ts` から MVリフレッシュ処理と `createServiceClient` import が消え、`revalidateTag(t, { expire: 0 })` を使い、`maxDuration = 60` になっている
- [ ] 3ワークフローに「Refresh materialized views」ステップが追加され、curlに `--retry 3 --max-time 30` が付いている
- [ ] DLsite・Fanza の `timeout-minutes` が 30 になっている
- [ ] `npx tsc --noEmit` が通る
- [ ] `npx tsx scripts/refresh-mvs.ts`（.env.localあり）で7本すべてが `"ok":true` のJSONを出し、終了コード0（← Claude側で実行）

## 動作確認方法
（Codex側・ネットワーク遮断のため静的確認まで）
- `npx tsc --noEmit` が成功することを報告
- `node -e "require('...')"` 等は不要。ワークフローYAMLの構造とroute.tsの差分を目視で報告

（Claude側・検収）
- `.env.local` を読ませて `npx tsx scripts/refresh-mvs.ts` を実行し、7本の `"ok":true` と exit 0 を確認
- env変数を1つ外して実行し exit 1 を確認
- ローカルで `revalidate/route.ts` をビルド（`npm run build`）が通ることを確認
- デプロイ後、本番 `/api/cron/revalidate` を叩き、2秒未満のHTTP 200を確認

## 制約・注意
- `scripts/` は tsconfig の exclude に入っている（ビルド対象外）。`npx tsx` で実行される前提。
- 既存の workflow の他ステップ（checkout / setup-node / npm ci / playwright install / scraper / upload-artifact）には手を触れない。
- YouTubeワークフローはスクレイプに約30分かかり timeout-minutes: 60。MVリフレッシュ追加後も60で十分。
- revalidate の認証ロジック（Bearer CRON_SECRET 照合）は変更しない。
- コミット・プッシュ・デプロイ・migration適用は Codex では行わない（Claude側）。
