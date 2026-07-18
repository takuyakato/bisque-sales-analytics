# SPEC: YouTube収益のJPY直取得への切替＋過去補正（P0-4）

## 目的
YouTube収益を「USD建て×外部レート換算」から「YouTube Analytics APIのJPY直取得（Google換算）」に切替える。
これにより外部レート依存（daily_rates・固定150円）を排除し、全月4〜15%の過小計上を是正する。
背景・検証結果は `docs/spike_youtube_jpy_2026-07-18.md`（実データで取得可能性・過去取得可否・差分を確認済み）。
ユーザー承認済み（過去分の上書き含む）。

## 現状（実コード確認済み）
- 取得：`src/lib/scrapers/youtube.ts:152-161` が `metrics: '...,estimatedRevenue'` を currency 指定なし（＝USD既定）で取得し、`estimated_revenue_usd` に格納
- 格納：`src/lib/ingestion/youtube-ingest.ts:126-127` が estimated_revenue_usd / membership_revenue_usd を insert
- 換算：`sales_unified_daily` VIEW（最新定義は migration 009）が `(estimated_revenue_usd + membership_revenue_usd) × COALESCE(daily_rates当日, app_settings固定150)` で JPY 化
- daily_rates は 2026-04-20 で更新停止、fetch-usd-jpy-rates.ts はどのworkflowからも呼ばれていない

## 変更対象
- 新規：`supabase/migrations/019_youtube_revenue_jpy.sql`（列追加＋VIEW更新）
- 新規：`scripts/backfill-youtube-jpy.ts`（過去分をJPYで再取得し既存行を更新）
- 変更：`src/lib/scrapers/youtube.ts`（currency=JPY 追加、JPYフィールドで返す）
- 変更：`src/lib/ingestion/youtube-ingest.ts`（JPY列へ格納）
- 変更：`src/lib/scrapers/youtube.ts` の返り値型・関連 type 定義（estimated_revenue_jpy 追加）
- 参照のみ：docs/spike_youtube_jpy_2026-07-18.md

## 要求仕様
1. **migration 019（追加型）**：
   - `youtube_metrics_daily` に `estimated_revenue_jpy NUMERIC` を追加（NULL許容。既存行はNULLのまま＝バックフィルで埋める）
   - `sales_unified_daily` VIEW を更新：YouTube行の revenue_jpy を
     `COALESCE(ym.estimated_revenue_jpy, (旧USD×レート換算式))::INT` にする。
     ＝JPY値があればそれを使い、無い行（バックフィル未了）は従来換算にフォールバック（移行中の安全策）。
     membership_revenue_usd は当面USD換算のまま加算（現状常に0のため実害なし。コメントで明記）
   - VIEWに依存するMV（daily_breakdown_summary等）がCASCADEで壊れないよう、必要なら
     既存migrationと同じ手順でVIEW→MVの再作成順を守る（009のパターンを踏襲）
2. **youtube.ts**：analytics.reports.query に `currency: 'JPY'` を追加。取得値を
   `estimated_revenue_jpy`（数値）として返す。列名変更に伴い返り値型を更新。
   USD時代の `estimated_revenue_usd` フィールドは返り値から削除（DBの旧列は残す）
3. **youtube-ingest.ts**：insert payload を `estimated_revenue_jpy` に変更。
   `estimated_revenue_usd` は今後 NULL または 0 を入れる（列は残すが新規書込はしない）。
   membership_revenue_usd は従来どおり（0固定のまま）
4. **backfill-youtube-jpy.ts**：
   - 既存の youtube スクレイパーの JPY取得ロジックを使い、指定期間を再取得
   - 引数 `--from=YYYY-MM-DD --to=YYYY-MM-DD`（無指定時のデフォルトは実装者判断でなく、
     引数必須にして無指定ならエラーにする＝全期間誤爆防止）
   - JP/EN両チャンネルを処理
   - **既存の youtube_metrics_daily 行の estimated_revenue_jpy を UPDATE で埋める**（video_id×metric_date一致）。
     該当行が無い日は新規 upsert してよい（既存の取込関数を再利用）
   - 進捗と、更新行数・スキップ数をログ出力
   - DBエラーは continue せず集計して非0終了（P0-3の契約に合わせる）
5. daily_rates / fetch-usd-jpy-rates.ts / app_settings.usd_jpy_rate は**このPRでは削除しない**
   （VIEWのフォールバックが参照しているため。全行JPY化を確認後の別PRでクリーンアップ）

## スコープ外
- daily_rates・fetch-usd-jpy-rates.ts の削除（全行JPY化確認後の別PR）
- 日次workflowの変更（youtube.ts が JPY を返せば既存の日次取込が自動でJPYになる。
  ただし念のため youtube-ingest 経由で JPY 列が埋まることをテストで確認）
- MV REFRESH の実行（Claude側で実施）

## 受け入れ基準
- [ ] `npx tsc --noEmit` 成功
- [ ] `npm run build` 成功（Claude側）
- [ ] migration 019 適用成功、VIEW が JPY優先・USD換算フォールバックで動く（Claude側）
- [ ] backfill スクリプトが引数必須で、指定期間の estimated_revenue_jpy を更新できる（Claude側で実行）
- [ ] バックフィル後、sales_unified_daily の YouTube 月別合計が docs/spike の「API JPY直」列に一致（±1%、Claude側で検証）
- [ ] git diff が変更対象のみ
- [ ] 既存の youtube-ingest のテスト（scripts/test-notion-sync等に相当があれば）が壊れない

## 動作確認方法
- Codex側：tsc／SQL静的レビュー（VIEW再作成の依存順・冪等性）／backfillスクリプトのdry構文確認
- Claude側：migration適用→backfill実行（2026-01以降、取得可能なら全期間）→MV REFRESH→
  月別合計をspike値と突合→デプロイ→本番ダッシュボードでYouTube売上が上振れ反映を確認

## 制約・注意
- YouTube Analytics API の month次元は月初〜月末境界でないとエラーになる（スパイクで確認）。
  backfillは day次元で取得して集計する
- estimated_revenue_jpy は NUMERIC で保持し、VIEWで ::INT 丸め（既存踏襲）
- OAuth refresh token（JP/EN）は .env.local から既存スクレイパーと同じ方法で読む
- service_role 経由（migration 017 で anon 遮断済み。スクリプトは createServiceClient を使う）
- 破壊的操作（既存行UPDATE）を含むが、estimated_revenue_usd 列は保持するため元に戻せる
