# SPEC: 累計売上のDB側集計化とページング関数の是正

## 目的
海外展開タブ等の累計売上が実データとズレる不具合（原因: `fetchAllPages` の ORDER BY なし並列 OFFSET ページングで行が重複・欠落）を根治する。金額集計を DB 側の単一 SQL 関数（RPC）に移し、ページング関数は順序必須・エラー throw に改める。
背景と議論の経緯は `deep-think_海外展開タブ累計売上ズレ_2026-08-26.md`（本仕様と矛盾する場合は本仕様が優先）。

## 変更対象
- 新規: `supabase/migrations/026_revenue_rpcs.sql`
- `src/lib/queries/paginate.ts`
- `src/app/(dashboard)/overseas/page.tsx`
- `src/app/(dashboard)/works/page.tsx`
- `src/lib/queries/duplicates.ts`
- `src/app/api/variants/[id]/link/route.ts`
- `scripts/refresh-mvs.ts`
- `scripts/bonus-monthly-revenue.ts`、`scripts/data-coverage.ts`
- 新規: `scripts/verify-revenue-rpcs.ts`
- 削除: `scripts/check-rj01630440.ts`, `check-rj-cum.ts`, `check-overseas-repro.ts`, `check-overseas-compare.ts`, `check-paginate-stability.ts`, `check-mv-rj.ts`, `check-agg-mix.ts`, `check-facts-r2.ts`, `check-variant-trunc.ts`, `check-coverage-gaps.ts`（今回の調査用一時ファイル。verify に統合）

## 要求仕様

### 1. migration 026: RPC 3本
共通: `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp`。テーブル参照は `public.` で修飾。末尾で各関数に `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ON FUNCTION ... TO service_role;`（migration 022 の流儀）。
集計定義は `sales_daily.net_revenue_jpy` / `sales_count` の単純 SUM（`aggregation_unit` で分岐しない。既存 MV `work_revenue_summary`（migration 008）と同定義）。

1-1. `get_overseas_coverage()` — 1つの SQL 文（UNION ALL を外側で包み `count(*) over()` を付ける）で以下を返す。
- 対象 work: `works.brand IN ('CAPURI','BerryFeel')` かつ `platform='dlsite' AND language='ja'` の variant を1件以上持つ work。**work 単位1行**。
- 列: `kind text`（'work' / 'unlinked'）, `work_id text`, `title text`（works.title）, `brand text`, `ja_product_ids text[]`（JP variant の product_id、昇順）, `has_en bool`, `has_zh_hans bool`, `has_zh_hant bool`, `has_ko bool`（同 work の dlsite variant に該当 language が EXISTS）, `revenue_ja_jpy bigint`（同 work の dlsite・language='ja' variant の売上合計）, `revenue_all_lang_jpy bigint`（同 work の dlsite 全言語 variant の売上合計）, `sales_ja bigint`（同 ja の sales_count 合計）, `product_id text`, `language text`, `product_title text`, `origin_status text`（unlinked 行用。work 行は NULL）, `total_count bigint`。
- 売上は variant 単位で先に集約してから work に合算する（JOIN による行の多重化で売上を膨らませないこと）。売上行のない work は 0。
- `kind='unlinked'` 行の定義（現行 `overseas/page.tsx` L268-L283 と同一）: `platform='dlsite'` かつ works.brand IN ('CAPURI','BerryFeel') かつ `language <> 'ja'` かつ `origin_status IS DISTINCT FROM 'standalone'` かつ **その variant の work_id に language='ja' の dlsite variant が存在しない（NOT EXISTS）** variant。`work_id IS NULL` の意味ではない。1 variant 1行。
- work 行は `revenue_all_lang_jpy DESC` の順で返す（並び順は UI 側でも再ソートしてよい）。

1-2. `get_work_revenue_totals(work_ids text[])` — **work 単位1行**: `work_id text`, `revenue_jpy bigint`（全 platform・全言語の合計）, `sales_count bigint`, `variant_count bigint`（product_variants の件数）, `by_platform jsonb`（例 `{"dlsite": 123, "fanza": 45}`。platform ごとの売上）, `total_count bigint`。引数に含まれる work_id のうち variant が0件の work も 0 で1行返す。`work_ids` が NULL または空なら 0 行。

1-3. `count_monthly_rows()` → `bigint`（`sales_daily` の `aggregation_unit='monthly'` の件数）。

### 2. `src/lib/queries/paginate.ts`
- シグネチャを `fetchAllPages<T>(supabase, table, build, opts: { order: string[]; uniqueKey?: string[]; pageSize?: number; parallelism?: number })` に変更。`opts.order` が空または未指定なら **throw**（メッセージに「金額集計は RPC を使うこと」を含める）。
- `order` の各列を `.order(col, { ascending: true })` として build の後に連結する。
- 先に `count: 'exact', head: true` で総件数を取得し、必要なページ数だけ並列取得する（「短いページ＝終端」判定を廃止）。
- ページ取得エラーは throw。取得合計 ≠ 総件数なら throw。
- `uniqueKey` 指定時は複合キー（`|` 連結）の重複を検出し、重複があれば throw。
- JSDoc に「金額の合計にはこの関数を使わない。DB 側 RPC を使う。順序は一意になる列の組を渡す」と明記。
- 既存の呼び出し側（scripts/ 配下の多数）は本仕様の対象外のものについて改修しない。未指定 throw で止まるのは意図どおり（無音の誤集計・誤削除を防ぐ）。

### 3. `overseas/page.tsx`
- `product_variants` / `sales_daily` の直接取得を全て削除し、`supabase.rpc('get_overseas_coverage')` のみで描画する。`error` は throw。受信行数 ≠ `total_count`（先頭行）なら throw（0行のときは total_count 検証をスキップ）。
- 行 = work 単位。`OverseasRow` に `revenueJa`, `revenueAll`, `jaProductIds` を持たせ、表の「RJ」列は `ja_product_ids` を `, ` 区切りで表示。React key は `work_id`。
- 「累計売上」列の見出しを **「累計売上（全言語）」** とし、値は `revenue_all_lang_jpy`。同セルに `title` 属性で「日本語版 ¥X」を付ける。ソートは全言語売上の降順。
- 「日本語作品」件数・各言語の展開数/率・未リンク件数（total/en/zhHans/zhHant/ko）は RPC の行から算出（未リンクは `kind='unlinked'` 行を language で数える）。
- `unstable_cache` のキーを `['overseas-coverage', 'v2']` に変更。ブランド絞り込み・タイトル検索の UI 挙動は現行どおり（page.tsx L55-L80 の searchParams 処理を維持）。

### 4. `works/page.tsx`
- L306-L332 の `product_variants` 取得＋`fetchAllPages(sales_daily)` を削除し、`supabase.rpc('get_work_revenue_totals', { work_ids: workIds })` で `revenueMap` と `variantCountMap` を作る。`error` は throw、行数 ≠ total_count なら throw。表示内容は現行どおり（累計売上と variant 件数）。

### 5. `src/lib/queries/duplicates.ts`
- `sales_daily` の `fetchAllPages` を削除し、`get_work_revenue_totals(allWorks の id 配列)` の `revenue_jpy` を `totalRevenue` に使う。
- `product_variants` の取得は `fetchAllPages(..., { order: ['id'], uniqueKey: ['id'] })` で維持。

### 6. `api/variants/[id]/link/route.ts`
- work_id 更新成功後に `revalidateTag('sales-data', { expire: 0 })` を呼ぶ（`src/app/api/cron/revalidate/route.ts` L34 と同形式）。

### 7. `scripts/refresh-mvs.ts`
- MV リフレッシュ完了後に `count_monthly_rows` を呼び、1 以上なら `{"check":"monthly_rows","count":N,"ok":false}` を出力して exit 1（0 なら ok:true を出力）。RPC 呼び出し失敗も exit 1。既存の MV リフレッシュ処理は変更しない。

### 8. スクリプト改修
- `scripts/bonus-monthly-revenue.ts`: `fetchAllPages` に `{ order: ['sale_date','brand','platform','language'], uniqueKey: 同 }`（`daily_breakdown_summary` の UNIQUE INDEX、migration 011 L41-42）。
- `scripts/data-coverage.ts`: `sales_unified_daily` の取得をやめ、`sales_daily`（`order:['id'], uniqueKey:['id']`、`product_variants` を JS で結合して platform を得る）と `youtube_metrics_daily`（`order:['id'], uniqueKey:['id']`）から集計する。YouTube の JPY 換算は migration 019 の定義（`revenue_jpy` 列があればそれを、なければ USD×為替）を読んで同じ結果になるように再現する。出力形式（月別 DLsite/Fanza/YouTube）は現行どおり（scripts/data-coverage.ts L14-L31）。

### 9. `scripts/verify-revenue-rpcs.ts`（新規）
`.env.local` 読み込み方式は他スクリプトと同じ。以下を実行し、全て一致なら `ALL OK` を出力して exit 0、不一致があれば内容を出力して exit 1。
- (a) 独立経路: `sales_daily` を `fetchAllPages(..., { order:['id'], uniqueKey:['id'] })` で全件取得し、`product_variants`（同様）と JS で結合して variant→work/platform/language を解決。work×platform、work×language の合計を JS で算出。
- (b) `get_overseas_coverage()` の work 行すべてについて `revenue_ja_jpy` / `revenue_all_lang_jpy` / 各 has_* / ja_product_ids を (a) と突合。work 行数が (a) から導出した「JP dlsite variant を持つ CAPURI/BerryFeel work 数」と一致。unlinked 行数が (a) 由来の同定義の件数と一致。
- (c) `get_work_revenue_totals(全 work_id)` の各行を (a) と突合（revenue_jpy, sales_count, variant_count, by_platform）。
- (d) `count_monthly_rows()` = (a) の monthly 行数。
- (e) `--product RJ01630440` のように指定した product_id の work について RPC 値と (a) の値を表示する（回帰確認用）。

## スコープ外（やらないこと）
- 既存 MV 群の定義変更、`unstable_cache` → `use cache` 移行、UI デザイン変更。
- 対象外スクリプト（要求仕様 8 以外の scripts/ 配下）の `fetchAllPages` 呼び出し改修。
- migration の適用・本番デプロイ（Claude 側で実施）。

## 受け入れ基準
- [ ] `npx tsc --noEmit` がエラー 0。`npm run lint` がエラー 0。
- [ ] `git diff --check` がクリーン。
- [ ] `grep -n "from('sales_daily')" 'src/app/(dashboard)/overseas/page.tsx' 'src/app/(dashboard)/works/page.tsx' src/lib/queries/duplicates.ts` が 0 件（今回の変更対象3ファイルから sales_daily 直接取得が消えている。monthly-report.ts / csv-ingest.ts / works/[id]/page.tsx / ingestion/rollback は対象外）。
- [ ] `grep -n "fetchAllPages" src/app src/lib -r` の結果が `paginate.ts` と `duplicates.ts`（product_variants、order/uniqueKey 指定あり）のみ。
- [ ] migration 026 に 3 関数と REVOKE/GRANT があり、`SECURITY DEFINER` を含まない。
- [ ] （Claude 側）`supabase db push` 成功後、`npx tsx scripts/verify-revenue-rpcs.ts --product RJ01630440` が `ALL OK` を出力し、RJ01630440 の work の全言語累計が (a) と一致する。
- [ ] （Claude 側）本番デプロイ＋revalidate 後、/overseas の RJ01630440 行の累計売上（全言語）が verify (e) の値と一致する。
- [ ] （Claude 側）`npx tsx scripts/refresh-mvs.ts` の末尾に `{"check":"monthly_rows","count":0,"ok":true}` が出る。

## 動作確認方法
- Codex 側（ネットワーク遮断のため静的確認まで）: `npx tsc --noEmit` / `npm run lint` / `git diff --check` / 上記 grep。
- Claude 側: migration 適用 → verify スクリプト → デプロイ → 本番確認。

## 制約・注意
- RPC は service_role クライアント（`src/lib/supabase/service.ts`）から呼ぶ。anon には公開しない。
- 依存パッケージの追加は不可。
- `sales_daily` の列名は `sale_date`, `sales_count`, `net_revenue_jpy`, `aggregation_unit`, `variant_id`（`date`/`units` ではない）。`works.id` は text（例 `auto-8b8a7f60`）。`product_variants.id` は uuid。
- Supabase(PostgREST) は 1 リクエスト最大 1,000 行。RPC の戻りも同様なので `total_count` 検証を必ず入れる。
- 既存の型定義・命名規約・エラーハンドリングの書き方は周辺コードに合わせる。
