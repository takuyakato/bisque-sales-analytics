# SPEC: 取込結果契約の統一（静かな失敗の根絶・取込側）

## 目的
スクレイパー・取込・MV更新の失敗が「GitHub Actions緑・通知なし・偽success」で埋もれる構造を、
失敗が必ず終了コードとログに現れる構造に統一する。
背景は `deep-think_サービス改善ロードマップ_2026-07-18.md` P0-3（合格済み）。auditor注意事項も反映済み。

## 現状の問題（実コード確認済み）
1. `src/lib/scrapers/base/logger.ts:29` が開始時に `status='success'` で行を作成
   → 強制終了・timeoutで偽successが残る（completed_at=nullのまま）
2. `scripts/scraper-run.ts`：dailyモードは失敗を終了コードに反映（:284）するが、
   Fanza日次が実際に使う backfill 経路（`runDailyBackfillReusingBrowser` :120）は失敗件数を返さず
   呼出側も終了コード未設定 → Actionsが緑のまま。partial も全経路で緑
3. `src/lib/ingestion/csv-ingest.ts:52-63` が logger と別に ingestion_log 行を作成（1実行で二重ログ）
   → 成功率集計が実行単位にならない
4. `csv-ingest.ts:170-171`：rows=[] なら errors=0 で success（空CSV・DOM変更で空取得を検出できない）
5. `logger.ts:51-62`：finish() の update 結果を検査していない（ログ書込失敗が無音）
6. `src/app/api/cron/revalidate/route.ts:46-68`：MV REFRESH失敗でも 200 / ok:true（console.warnのみ）
7. `.github/workflows/*.yml`：revalidate呼び出しが `curl -s ... || true` で、401/500/通信断も成功扱い

## 変更対象
- 変更：`src/lib/scrapers/base/logger.ts`、`scripts/scraper-run.ts`、`src/lib/ingestion/csv-ingest.ts`、
  `src/app/api/cron/revalidate/route.ts`
- 変更：`.github/workflows/scrape-dlsite-daily.yml`、`scrape-fanza-daily.yml`、`scrape-youtube-daily.yml`
  （backfill系2本とmirror/smokeは revalidate curl がある場合のみ同修正）
- 新規：`supabase/migrations/018_ingestion_log_running_status.sql`（status CHECK制約に 'running' 追加）
- 新規：`scripts/ingestion-contract-test.ts`（純粋部分の単体テスト、DB不要）
- 影響する画面：`src/app/(dashboard)/ingestion/page.tsx` 等で status を集計・表示している箇所は
  'running' を適切に表示（実行中として区別、successに数えない）

## 要求仕様
1. **running状態**：migration で ingestion_log.status の CHECK 制約を `('running','success','partial','failed')` に変更（追加型・既存データ変更なし）。logger.start() は `status='running'` で行を作成し、finish() で success/partial/failed に更新。completed_at=null かつ running のまま残った行は「異常終了」と解釈できる
2. **1実行1ログ**：csv-ingest.ts は新規ログ行を作らず、呼出元（logger）の ingestion_log_id を受け取って
   その行を更新する設計に統一。呼出関係を調査し、logger を持たない呼出元（CSVアップロードUI等）は
   従来どおり自前で1行作る（その場合も running→終了状態の遷移に従う）
3. **終了コード契約**：本番日次（daily/backfill いずれの経路でも）で failed または partial が1件でも
   あればプロセスを非0終了。`runDailyBackfillReusingBrowser` 等の全経路が失敗件数を返すよう統一
4. **空データ検証**：スクレイプ結果が0行の場合は success にせず partial として記録し、
   ログの error_message に「0行取得（サイト変更または正当な無売上日の可能性）」を残す
   ※DLsite/Fanzaで売上0円の日は実在しうるため failed にはしない。判定はプラットフォーム単位
5. **logger自体の失敗**：start()/finish() の Supabase update エラーを検査し、失敗したら
   console.error＋プロセス非0終了（取込自体が成功していてもログ欠損は異常として扱う）
6. **revalidate**：1個でもMV REFRESHが失敗したら HTTP 500 で `{ ok:false, failed:[MV名] }` を返す。
   成功時は従来どおり。`export const maxDuration = 60` を明示
7. **workflow**：revalidate 呼び出しを `curl --fail-with-body` に変更し `|| true` を全廃。
   これによりMV更新失敗・401・通信断でジョブが赤になる
8. `scripts/ingestion-contract-test.ts`：DB不要の純粋部分をテスト
   - 空rows→partial判定／失敗件数→終了コードのマッピング／status遷移の妥当性 など最低5ケース

## スコープ外
- Slack通知・デイリーダイジェスト（P1-5）
- source_watermarks / projection_refresh_runs（P1-6）
- advisory lockによるMV直列化（P1-6）
- Snapshot/Notionの部分失敗（P1-8）
- スクレイパーのセレクター・取得ロジック自体の変更

## 受け入れ基準
- [ ] `npx tsx scripts/ingestion-contract-test.ts` 全assert成功
- [ ] `npx tsc --noEmit` 成功
- [ ] `npm run build` 成功（Claude側）
- [ ] migration 018 が追加型のみ（既存行の書き換えなし）で適用成功（Claude側）
- [ ] workflow yml から `|| true` が消えている（grep）
- [ ] /ingestion 画面が running を実行中として表示し success に数えない
- [ ] git diff が変更対象のみ
- [ ] 翌朝の日次ジョブが正常時は緑・ログはsuccessで完了する（Claude側で翌日観測）

## 動作確認方法
- Codex側：contract-test／tsc／yml静的確認（actionlint相当の目視）
- Claude側：build→migration適用→デプロイ→翌朝の実運用観測（正常系）。異常系は
  ingestion-contract-test と、可能ならローカルで空rows・失敗注入のドライランで確認

## 制約・注意
- workflowのcron時刻・実行内容（スクレイプコマンド）は変更しない
- ingestion_log の既存列は変更しない（statusのCHECK制約のみ）
- Vercel Hobby プランの関数上限（60s）を超える maxDuration を設定しない
- 為替関連（fetch-usd-jpy-rates.ts）はこの発注では触らない（P0-4で扱う）
