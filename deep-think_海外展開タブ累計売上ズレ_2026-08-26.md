# 海外展開タブの累計売上ズレ（deep-think 最終レポート）

## 問い・制約・判断基準
- 問い: 海外展開タブの累計売上が実データと食い違う（RJ01630440: 表示 ¥96,800 / DB ¥867,849）。原因と修正方針。
- 制約: 社内ダッシュボード（Next.js + Supabase）。実装は Codex へ発注、数時間規模。
- 判断基準: (1) 表示値が常にDB実値と一致 (2) 同じ欠陥を持つ他画面も直る (3) 変更が小さく退行リスク低 (4) データ増でも壊れにくい。

## 結論
- 原因: `src/lib/queries/paginate.ts` の `fetchAllPages` が ORDER BY なしの OFFSET ページングを並列実行しているため、ページ間で行が重複・欠落し合計がズレる（ローカル再現: 5回中1回で 976 行重複）。誤結果が 10 分キャッシュに固定される。ページ取得エラーも無音で `[]` に潰される。
- 修正: 金額集計をページャから外し、DB 側の単一 SQL 関数（RPC）で集計する。海外展開タブ＝`get_overseas_coverage()`（work 単位・日本語版と全言語の両方の累計を返す）、作品タブ／重複チェック＝`get_work_revenue_totals(work_ids)`（ライブ集計・work 単位1行）。`fetchAllPages` は順序指定必須・一意キー検証・エラー throw に改修し、非金額用途に限定する。link 操作時のキャッシュ破棄を追加。daily/monthly 併存の検知を取込ワークフローに組み込む。
- 実装仕様の全文は下記「最終仕様」。

## 根拠と却下した代替案
- 実データ: sales_daily 28,357 行は全て daily、DLsite variants 146 件、product_variants 全体 1,070 件。既存 MV `work_revenue_summary` は当該作品で 867,849（DB 実値と一致）。
- 却下: `.order('id')` の関数内強制（id のないビューで壊れ、同数の重複＋欠落を検出できない）／既存 MV を works・duplicates に流用（作品統合直後に古い金額が再キャッシュ）／daily 優先規則を集計 SQL に実装（部分月で過少計上・MV と定義分裂）／全 variant 集計 RPC の NULL 番兵（1,000 行上限再発）。

## 議論の経緯
- R1 Codex: NULL番兵の矛盾／order強制の破壊／短ページ判定の誤り／複数文はスナップショット不一致／集計定義未確定／SECURITY DEFINER 不要／RPC失敗の0円キャッシュ／業務定義（日本語版か全言語か）／MV 再利用 → 案を「目的特化RPC＋MV再利用＋ページャ互換改修」に改訂。
- R2 Codex: 同数の重複＋欠落は count 検証をすり抜ける／MV 化で統合直後に誤額／work と SKU 粒度の混在／link 後のキャッシュ未破棄／monthly 二重計上の将来リスク → ライブ work 単位 RPC・order 必須＋uniqueKey・work 粒度統一・RPC は日本語版と全言語の両方を返す・併存検知に改訂。
- R3 Codex: duplicates の variant 明細経路／スクリプトの一意キー不成立／daily 優先規則の部分月問題／works RPC の行数 → variant 明細はページャ(id)で残す・スクリプト別に実在キー・優先規則撤回（MV と同定義＋検知）・work 単位1行＋jsonb に改訂。
- auditor: 不合格（残2件はいずれも仕様文の明確化で塞がる小さなもの、設計の骨格は妥当）→ 2件（data-coverage.ts の YouTube 列を落とさない／unlinked の定義を現行ロジックどおり NOT EXISTS で明文化）と注意点3件を最終仕様に反映済み。

## 未解決論点（要・加藤さん判断）
1. 【決定 2026-08-26 加藤】海外展開タブの「累計売上」は**同一作品の全言語合算**にする。RPC は日本語版も返すので、列名は「累計売上（全言語）」とし、日本語版はツールチップ等で補助表示可。
2. monthly バックフィルを再開する前に、daily/monthly の優先規則を決めて RPC と MV 群に同時適用する（現在 monthly 0 行のため急がない。併存検知は本修正で運用に入る）。

## 判定結果
- Codex との往復 3 回（上限）を消化。auditor 判定は「不合格（重大 2 件、いずれも仕様文の明確化で解消可）」。2 件は判定後に最終仕様へ反映したが、その反映は auditor の再判定を経ていない。

---
# 最終仕様（Codex 発注用）
## 指摘対応表（Codex ラウンド3）
| # | 指摘 | 対応 | 内容 |
|---|---|---|---|
| 1 | duplicates の variant 明細経路が消えている | 受入 | duplicates の `product_variants` 取得はページャで残す：`order:['id'], uniqueKey:['id']`（id は PK で一意。1,070行） |
| 2 | 金額スクリプトの一意順序が成立しない | 受入 | スクリプトごとに実在の一意キーを使う：bonus-monthly-revenue.ts → `daily_breakdown_summary` の UNIQUE INDEX（sale_date, brand, platform, language）。data-coverage.ts → `sales_unified_daily`（一意キー無し）を止め、`sales_daily`（order:['id'], uniqueKey:['id']）と `youtube_metrics_daily`（同）を取得し、YouTube は migration 019 と同じ USD→JPY 換算を JS で再現して DLsite/Fanza/YouTube の3列を維持する。ビューに行IDは足さない【auditor指摘1反映】 |
| 3 | 「dailyが1行あればmonthly全捨て」は部分月で過少計上 | 受入（規則撤回） | 新設RPCは既存MV（migration 008）と**同じ定義（aggregation_unit 無差別 SUM）**にし、集計定義の分裂を作らない。代わりに**検出を運用に組み込む**：`scripts/refresh-mvs.ts`（全取込ワークフロー末尾で実行）に「同一 variant×月に daily と monthly が併存する件数」チェックを追加し、1件以上なら exit 1（Actions 失敗→既存の healthchecks 監視で通知）。優先規則の設計は monthly バックフィル再開時の別タスク（未解決論点へ） |
| 4 | works RPC は 500 works×3 platform で 1,000 行超 | 受入 | `get_work_revenue_totals` は **work 単位 1 行**（work_id, revenue_jpy, sales_count, by_platform jsonb, total_count）にする。最大 500 行 |
| 軽微1 | coverage と unlinked が別文 | 受入 | 1関数 `get_overseas_coverage()` が `kind`（'work' / 'unlinked'）列つきの単一結果集合を返す（UNION ALL の1文＝単一スナップショット） |
| 軽微2 | revalidateTag の形式 | 受入 | link route は既存 cron と同じ `revalidateTag('sales-data', { expire: 0 })` |
| 将来 | MV群への規則適用 | 記録 | 未解決論点へ |

## 問い・制約・判断基準
- 問い: 海外展開タブの累計売上が実データと食い違う（RJ01630440: 表示 ¥96,800 / DB ¥867,849）。原因と修正方針。
- 制約: 社内ダッシュボード（Next.js + Supabase）。Codex へ実装発注、数時間規模。
- 判断基準: (1) 表示値が常にDB実値と一致 (2) 同じ欠陥を持つ他画面も直る (3) 変更が小さく退行リスク低 (4) データ増でも壊れにくい。

## 原因（確定した範囲）
- `src/lib/queries/paginate.ts` の `fetchAllPages` は ORDER BY なしの OFFSET ページングを並列実行しており、PostgreSQL は順序を保証しないためページ間で行の重複・欠落が起きる。ローカル再現：5回中1回で 19,366 行中 976 行重複（同数欠落）、RJ01630440=830,449・RJ01557147=2,976,418 と誤集計。
- 誤結果が `unstable_cache`（10分／取込後の revalidate まで）に固定され、常時誤っているように見える。
- 同関数はページ取得エラーを `[]` に潰すため、部分失敗も無音で打ち切られる。
- 本番の 96,800 がこの原因である直接ログはないため「再現済みの有力原因」。修正後の本番一致で決着させる。
- 実データ確認済み：sales_daily 28,357 行は全て daily（monthly 0行）。DLsite variants 146 件（1,000 未満）。product_variants 全体 1,070 件。

## 結論（実装仕様）
### DB: migration 026
1. `get_overseas_coverage()`：1文（UNION ALL）で `kind='work'` 行（work_id, title, brand, ja_product_ids text[], has_en, has_zh_hans, has_zh_hant, has_ko, revenue_ja_jpy, revenue_all_lang_jpy, sales_ja）と `kind='unlinked'` 行（定義＝現行 page.tsx L268-275 と同一：`platform='dlsite'` かつ works.brand IN ('CAPURI','BerryFeel') かつ language<>'ja' かつ origin_status<>'standalone' かつ **その work_id に language='ja' の dlsite variant が存在しない（NOT EXISTS）** variant：product_id, language, product_title。`work_id IS NULL` ではない【auditor指摘2反映】）を返す。全行に `total_count`（count(*) over()）。
2. `get_work_revenue_totals(work_ids text[])`：work 単位 1 行（work_id, revenue_jpy, sales_count, by_platform jsonb, total_count）。
- 集計定義は既存 MV `work_revenue_summary` と同一（sales_daily の net_revenue_jpy を aggregation_unit 無差別に SUM）。
- 属性: `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp`、`public.` 修飾、`REVOKE EXECUTE ... FROM PUBLIC; GRANT EXECUTE ... TO service_role`。

### アプリ
- `overseas/page.tsx`：RPC 1 のみで描画。`error` は throw、受信行数 ≠ total_count は throw。product_variants / sales_daily の直接取得を削除。キャッシュキー `['overseas-coverage','v2']`。列名「累計売上（全言語）」（既定は revenue_all_lang_jpy。決定 2026-08-26）。React key は work_id。
- `works/page.tsx`・`lib/queries/duplicates.ts`：RPC 2 で売上取得、sales_daily 直接取得を削除。duplicates の variant 明細は `fetchAllPages(..., { order:['id'], uniqueKey:['id'] })`。
- `api/variants/[id]/link/route.ts`：`revalidateTag('sales-data', { expire: 0 })` 追加。
- `paginate.ts`：`opts: { order: string[]; uniqueKey?: string[] }` を必須引数化（未指定 throw）。exact count を先に取り必要ページのみ並列取得。ページエラーは throw。取得合計 ≠ count は throw。uniqueKey 指定時は複合キー重複で throw。JSDoc「金額集計は RPC を使う」。
- スクリプト：bonus-monthly-revenue.ts（order = MV の UNIQUE INDEX 列）、data-coverage.ts（sales_daily order:['id'] へ書き換え）。他の診断スクリプトは未指定 throw で気付く運用。
- `scripts/refresh-mvs.ts`：daily/monthly 併存チェックを追加（検知用 RPC `count_daily_monthly_overlap()` を migration 026 に同梱。1件以上で exit 1）。**チェックは Vercel キャッシュ破棄ステップの後段に置く**（検知失敗でキャッシュが古いまま残らないように）【auditor注意点反映】。
- `get_work_revenue_totals` に `variant_count` を含め、works/page.tsx L307-310 の product_variants 単発取得も廃止する【auditor注意点反映】。
- Codex 発注文に「`fetchAllPages` の order 未指定 throw は仕様（削除系スクリプトが次回実行時に止まるのは意図どおり）」と明記。UNION ALL に `count(*) over()` を付けるには外側で包む。

### 検証・リリース
1. `scripts/verify-revenue-rpcs.ts`：(a) 独立経路（`order:['id'], uniqueKey:['id']` の sales_daily 全件＋JS 集計）と RPC 2本の全 work／全 JP variant 突合、期待件数は同時点 DB から導出 (b) daily/monthly 併存件数 (c) MV `work_revenue_summary` との比較は「JP variant ちょうど1件・非JA 0件」の work に限定。
2. 本番デプロイ → `curl -X POST https://bisque-sales-analytics.vercel.app/api/cron/revalidate -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"tags":["sales-data"]}'` → /overseas 全行を取得し (a) と一致確認（RJ01630440 が 867,849 相当）。
3. 今回の一時スクリプト（scripts/check-*.ts のうち今回作成分）は verify に統合して削除。

## 却下した代替案
- `.order('id')` を関数内で強制：id のないビューで壊れる／同数の重複・欠落を検出できない。
- 既存 MV を works/duplicates に流用：作品統合直後に古い金額が再キャッシュされる。
- daily 優先規則を集計SQLに実装：部分月で過少計上、既存 MV と定義が分裂。→ 検出に切替。
- 全 variant 集計 RPC（NULL 番兵）：1,000 行上限の再発、誤呼び出し時の被害。

## 未解決論点（要・加藤さん判断）
1. 海外展開タブの既定表示を「日本語版のみ」（推奨・現行踏襲）にするか「同一作品の全言語合算」にするか。RPC は両方返すため UI のみで切替可。
2. monthly バックフィルを再開する前に、daily/monthly の優先規則を決めて RPC と MV 群に同時適用する（現在 monthly 0行のため急がない。併存検知は本修正で運用に入る）。
