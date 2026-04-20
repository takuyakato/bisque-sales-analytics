<!-- Notion: （未作成） -->

# bisque-sales-analytics 仕様書

最終更新：2026-04-20（v3.6：残存内部矛盾5件＋技術論点4件＋改善2件を反映。認証Cookie詳細、`/ingestion` タブ分割、Fanza/DLsite スクレイピング仕様明記、環境変数同期チェックリスト。改訂履歴は末尾）

## 1. プロジェクト概要

### 1-1. 目的
BisqueのプロダクトであるBLサンド（YouTube）・CAPURI（DLsite/Fanza成人向けBL）・BerryFeel（DLsite/Fanza成人向けTL）の売上データを、プラットフォーム横断で1箇所に集約し、作品別・日次別・言語別に分析可能にする。

### 1-2. 用途とユーザー
- **ダッシュボード本体**：加藤（代表）のみが使う分析ツール。認証は極小設定
- **月次レポート画面**：ダッシュボード内に `/reports` ビューを置き、日次テーブル＋月次KPI＋ビジュアルを提供。Markdown/画像エクスポートも可能
- **Notion自動反映**：日次Cronで月次サマリページを自動生成・更新。チームメンバー（ディレクター・プロデューサー）はNotion経由で状況把握
- **Claude Code連携**：戦略ドキュメント（海外展開シミュレーション等）を更新する際の定量的根拠として使用

### 1-3. 把握したい重要な視点
- 英語・繁体字・簡体字・韓国語の**売上比率（DLsite/Fanza/YouTube全プラットフォーム横断）**
- 作品別の売上トレンド（どの作品が伸びているか）
- プラットフォーム別構成（DLsite比率・Fanza比率・YouTube比率）

細かい財務数字や制作者・原価情報は扱わない。

### 1-4. 扱うプラットフォーム（Phase 1）
- **DLsite**（CAPURI / BerryFeel）… 日次スクレイピング＋過去分CSVアップロード
- **Fanza**（CAPURI / BerryFeel）… 日次スクレイピング＋過去分CSVアップロード
- **YouTube**（BLサンド日本チャンネル / BLサンド英語チャンネル）… 日次 API 取得

### 1-5. 将来拡張の想定
- Fanza海外版（英語・韓国語・中国語）対応 → `product_variants.language` を拡張するだけで自動対応
- Patreon / pixivFANBOX / Fantia / OceanVeil / Coolmic / Laftel等
- 為替API連携（固定レート→日次レートへ）
- 異常値検出・Slack通知

---

## 2. 技術スタック

### 2-1. アプリケーション基盤
- **Next.js 15**（App Router）+ TypeScript
- **Supabase Pro**（PostgreSQL・Storage・Auth使用可）
- **shadcn/ui** + Tailwind CSS v3
- **Recharts**
- **Zustand**（クライアント状態管理）
- **zod**（スキーマ検証、idea-cascade準拠）

### 2-2. スクレイピング・API連携
- **Playwright**（DLsite/Fanzaスクレイピング）… **GitHub Actions上で実行**
- **iconv-lite**（CP932 CSV デコード）
- **csv-parse**（CSV解析、papaparseより型が厳密で好み）
- **googleapis**（YouTube Data API v3 + Analytics API）
- **@notionhq/client**（Notion月次ページ自動更新、§7）
- **date-fns**（日付操作）
- **言語判定**：まずは正規表現版で開始（Phase 0で実用レベル達成を確認、§5-3参照）。精度向上が必要なら `franc` 導入を検討（オプション）

### 2-3. 実行基盤
- **Vercel Hobby**（Next.jsアプリホスティング、Vercel Cronで日次ジョブ1本を実行）
- **GitHub Actions**（スクレイピング実行。無料2000分/月、メモリ7GB、実行時間6時間まで）
- **Supabase Storage**（スクショ・CSVスナップショット保存）

### 2-4. 月額コスト試算
| 項目 | 金額 |
|---|---|
| Supabase Pro | $25/月 |
| Vercel Hobby | $0/月（Cron 1本に統合） |
| GitHub Actions | $0（無料枠2000分で十分） |
| YouTube API / Notion API | $0 |
| **合計** | **$25/月（約¥3,800/月、¥45,600/年）** |

v3.2（$45/月）から **$20/月削減**。Vercel Cronを3本→1本に統合（§6-2）で実現。Notion API は無料で使えるため、Notion自動連携を復活しても費用は変わらない。

#### GitHub Actions 実行時間の試算（無料枠 2,000分/月）

**日次運用**：
- DLsite日次スクレイピング：30秒 × 30日 = 15分/月
- Fanza日次スクレイピング：30秒 × 30日 = 15分/月
- **合計：約30〜50分/月**（無料枠の2%）

**過去4年分のバックフィル（1回限り）**：
- **月次unit推奨**：30秒 × 48ヶ月 × 2プラットフォーム = 約**50分**で完了
- 日次unit（詳細版）：30秒 × 1,460日 × 2プラットフォーム = 約**24時間**（複数ジョブに分割して並行実行可能）
- **結論：月次バックフィルなら一発で完了、追加コスト ¥0**

---

## 3. Phase 0：実装前の技術検証（半日〜1日）

実装に入る前に**致命的論点を事前検証する**。ここで詰まる論点を先に潰しておかないと手戻りが大きい。

### 3-1. 確認済み事項（v3.1時点）
- **DLsite/Fanza共通**：長期間CSVは一括取得不可。**期間指定（1日 or 1ヶ月単位）でCSVを都度生成・ダウンロードする必要がある**
- **2段階認証**：DLsite/Fanzaともにオフ、ID/パスワードのみでログイン可
- **Fanza実CSV**：ファイル名に期間情報（`sales_all_0_YYYYMMDD_YYYYMMDD.csv`）、1行1作品、単価・卸金額・販売数・期間を含む

### 3-2. 検証項目と進捗

**Phase 0 本体は A / B / G の3項目**（実装前に必要な情報収集）。C / D / E / F は Phase 1 各段階で実装と同時に検証する「前提検証項目」として別扱い。

#### Phase 0 本体（実装前）
| # | 検証項目 | ステータス | 成果物 |
|---|---|---|---|
| A | DLsite管理画面の**期間指定UIのセレクター特定** | ✅ ドラフト完成（2026-04-20） | `scripts/phase0/config/dlsite-selectors.draft.ts`。Phase 1dで実Playwright実行して最終確定 |
| B | Fanza管理画面の**期間指定UIのセレクター特定** | ✅ ドラフト完成（2026-04-20） | `scripts/phase0/config/fanza-selectors.draft.ts`。Phase 1eで最終確定 |
| G | **実CSV2本で言語自動判定の精度測定** | ✅ 完了（2026-04-20） | 正規表現版で誤判定0%、unknown 14%。**実用レベル到達**、`franc` 導入はオプション扱いに |

→ **Phase 0 本体は完了済み**。Phase 1a から着手可能。

#### Phase 1 各段階の前提検証項目
| # | 検証項目 | 検証タイミング | ブロッカー |
|---|---|---|---|
| C | Playwrightが**GitHub Actions上でログイン＋CSV DL完結** | Phase 1d/1e | ログイン情報（Phase 1d着手時に加藤から） |
| D | Supabaseで`app_settings`テーブル＋VIEWが作成可能 | Phase 1a | Supabaseプロジェクト情報（Phase 1a着手時に加藤から） |
| E | YouTube Analytics APIで前日分の収益データがOAuth経由で取得できる | Phase 1f | GCP OAuth設定（加藤待ち） |
| F | Notion APIでテストページにブロック挿入が可能 | Phase 1g | Notion Integration発行（加藤待ち） |

### 3-3. Phase 0の成果物
- `docs/phase0-results.md`：各検証項目の結果、発見事項、実装への影響
- 検証中に使ったミニスクリプト群は `scripts/phase0/` に残す
- `config/*-selectors.ts` の初期バージョンが確定

### 3-4. Phase 0の進め方
1. 加藤のDLsite/Fanza管理画面を**スクリーンショット共有**（項目A、B）。Claude Codeがセレクターを特定して `config/*-selectors.ts` のドラフト作成
2. 項目C〜Fは Claude Codeが並行で実施
3. 項目Gは実データで精度測定、結果を `detect-language.ts` にフィードバック
4. 結果をまとめ、**本仕様書 v3.2として最終確定してからPhase 1aに入る**

---

## 4. データモデル（Supabaseスキーマ）

### 4-1. `works`（作品マスタ）
作品の原典を管理。BLサンドのYouTube動画もここに1レコードずつ登録する。

```sql
CREATE TABLE works (
  id TEXT PRIMARY KEY,                    -- 'auto-XXXXXXXX' 形式の自動採番（§4-1-1）
  slug TEXT UNIQUE,                       -- 加藤が付ける人間可読名（任意、例: 'capuri-001'）
  title TEXT NOT NULL,                    -- 作品の正式日本語タイトル
  brand TEXT NOT NULL CHECK (brand IN ('CAPURI','BerryFeel','BLsand','unknown')),
  genre TEXT CHECK (genre IN ('BL','TL','all-ages')),
  release_date DATE,
  auto_created BOOLEAN DEFAULT false,     -- true = product_variant検出時の自動生成（後から加藤が編集）
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_works_brand ON works(brand);
CREATE INDEX idx_works_auto ON works(auto_created);
CREATE INDEX idx_works_slug ON works(slug);
```

**v3.5の変更点**：
- `id` は常に `'auto-' + crypto.randomUUID().slice(0,8)` 形式で統一（手動採番との混在解消）
- 人間可読名は別途 `slug` 列（UNIQUE）で管理、加藤が好みで設定可能
- `/works` 画面では `slug || id` を表示名として使う

#### 4-1-1. 自動登録ロジック（運用負荷の削減）

**課題**：
- BLサンドの YouTube 動画400本超＋CAPURI/BerryFeelの翻訳版SKUが100件超 → 全件手動登録は非現実的
- v3.2までは手動採番前提だったが、v3.3で自動登録ロジックを追加

**動作**：
- スクレイピング・CSV取込・YouTube API取得時に、未登録の `product_id` を検出したら：
  1. `product_variants` に新規行を追加（既存設計通り、`work_id=null`）
  2. **同時に `works` にも新規レコードを自動生成**：
     - `id = 'auto-' + crypto.randomUUID().slice(0,8)`
     - `title = product_title`（翻訳版の場合は翻訳タイトルが初期値）
     - `brand = サークル名/チャンネル名 から推測`（例：CAPURI→CAPURI、BLサンド日本→BLsand）
     - `auto_created = true`
  3. 新しく作った `works.id` を対応する `product_variants.work_id` にセット

- 加藤は `/works` 画面で `auto_created=true` の作品を一覧表示、必要に応じて：
  - 既存の別work（原作版）に統合（作品IDマージ）
  - タイトルを正式日本語タイトルに修正
  - ブランドの訂正
  - `auto_created=false` に変更して「確認済み」マーク

**brand推測ルール**（`lib/constants/brand-mapping.ts`）：
```ts
const CIRCLE_TO_BRAND: Record<string, Brand> = {
  'CAPURI': 'CAPURI',
  'BerryFeel': 'BerryFeel',
  // YouTube チャンネルIDから推測
  [YOUTUBE_CHANNEL_ID_JP]: 'BLsand',
  [YOUTUBE_CHANNEL_ID_EN]: 'BLsand',
};
// マッチしない場合は 'unknown' （後から加藤が訂正）
```

### 4-2. `product_variants`（言語別プラットフォームSKU）
1作品×プラットフォーム×言語ごとに1レコード。BLサンドのYouTube動画も `platform='youtube'` で扱う。

```sql
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT REFERENCES works(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('dlsite','fanza','youtube')),
  product_id TEXT NOT NULL,               -- 'RJ01516722' / YouTube動画ID
  product_title TEXT,                     -- その言語でのタイトル
  language TEXT NOT NULL DEFAULT 'unknown'
    CHECK (language IN ('ja','en','zh-Hant','zh-Hans','ko','unknown')),
  origin_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (origin_status IN ('original','translation','unknown')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, product_id)
);

CREATE INDEX idx_variants_work ON product_variants(work_id);
CREATE INDEX idx_variants_platform_lang ON product_variants(platform, language);
```

**v2からの変更**：`is_original BOOLEAN` → `origin_status TEXT` に変更（NULL扱いの曖昧さ解消）。

### 4-3. `sales_daily`（日次売上トランザクション）

⚠️ **migration作成順序**: `sales_daily` は `ingestion_log`（§4-7）を外部参照するため、**migration内で `ingestion_log` を先に CREATE** する必要がある。仕様書上の節番号と物理的な作成順序は異なる。

```sql
CREATE TABLE sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  work_id TEXT REFERENCES works(id),      -- JOIN高速化用に冗長格納
  platform TEXT NOT NULL,
  sale_date DATE NOT NULL,                -- 月次集計時は期間from（月初日）
  aggregation_unit TEXT NOT NULL CHECK (aggregation_unit IN ('daily','monthly')),
  sales_price_jpy INT,                    -- その期間の販売価格
  wholesale_price_jpy INT,                -- 卸価格
  sales_count INT NOT NULL,
  net_revenue_jpy INT NOT NULL,           -- サークル入金額（= 販売数 × 卸価格）
  source TEXT NOT NULL CHECK (source IN ('scrape','csv-upload','manual')),
  raw_data JSONB,                         -- 元CSV行保持（スキーマ変遷耐性）
  ingestion_log_id UUID REFERENCES ingestion_log(id),  -- どの取込で入ったか
  ingested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(variant_id, sale_date, aggregation_unit, sales_price_jpy)
);

CREATE INDEX idx_sales_daily_date ON sales_daily(sale_date DESC);
CREATE INDEX idx_sales_daily_work ON sales_daily(work_id);
CREATE INDEX idx_sales_daily_platform ON sales_daily(platform);
CREATE INDEX idx_sales_daily_agg ON sales_daily(aggregation_unit);
```

**`sale_date` の意味（重要）**：
- `aggregation_unit='daily'` の場合：その日付の売上
- `aggregation_unit='monthly'` の場合：**期間from（月初日）** を格納。例：2026-04月次 → `sale_date='2026-04-01'`
- 表示時は `aggregation_unit` で分岐してラベル（`2026-04-01` → `2026年4月` 等）

**v2/v3.2からの変更点**：
- `gross_revenue_jpy` → `net_revenue_jpy` にリネーム（実CSVの「売上額＝販売数×卸価格＝サークル入金額」に合わせ、名前と実態を一致）
- `aggregation_unit` 列追加：月次集計CSV取込分と日次スクレイピング分を区別し、集計時の二重計上を防ぐ
- `ingestion_log_id` 外部キー：どの取込ジョブで入ったか追跡。ロールバック（特定ジョブのデータ全削除）が可能に
- v3.3：`sale_date` の意味を月次/日次別に明文化

### 4-4. `youtube_metrics_daily`（YouTube日次指標）

YouTube側は売上だけでなく視聴指標も扱うため、`sales_daily` とは別テーブルを維持。

```sql
CREATE TABLE youtube_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  work_id TEXT REFERENCES works(id),
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  video_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  views INT,
  watch_time_minutes INT,
  subscribers_gained INT,
  estimated_revenue_usd NUMERIC(10,4),
  membership_revenue_usd NUMERIC(10,4),
  raw_data JSONB,
  ingestion_log_id UUID REFERENCES ingestion_log(id),
  ingested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(video_id, metric_date)
);

CREATE INDEX idx_yt_daily_date ON youtube_metrics_daily(metric_date DESC);
CREATE INDEX idx_yt_daily_channel ON youtube_metrics_daily(channel_id);
CREATE INDEX idx_yt_daily_variant ON youtube_metrics_daily(variant_id);
```

### 4-5. `app_settings`（アプリケーション設定）

VIEW内で参照する設定値を物理テーブルで保持（SupabaseでALTER DATABASE SETが使えないリスクを回避）。

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('usd_jpy_rate', '150', 'YouTube USD → JPY換算の固定レート'),
  ('yt_channel_id_jp', '', 'BLサンド日本チャンネルID'),
  ('yt_channel_id_en', '', 'BLサンド英語チャンネルID');

-- RLS: VIEWがJOINするため、anon key から SELECT のみ許可
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_settings_read ON app_settings FOR SELECT USING (true);
-- 書き込みは service role のみ（RLSの暗黙動作）
```

アプリケーション起動時に環境変数 `USD_JPY_RATE` / `YOUTUBE_CHANNEL_ID_JP` / `YOUTUBE_CHANNEL_ID_EN` から自動同期するユーティリティを用意。

**後から値を変える場合**：
- 方法A（推奨）：Vercel 環境変数を更新 → 次回デプロイ（もしくは `/api/admin/sync-settings` を叩く）で DB 同期
- 方法B：Supabase Studio で `UPDATE app_settings SET value='155' WHERE key='usd_jpy_rate'` 直接
- どちらも事故防止のため、変更履歴は `updated_at` で追跡可能

### 4-6. `sales_unified_daily`（プラットフォーム横断VIEW）

性能最適化として、`app_settings` のサブクエリを**1回だけ評価するCTE**に切り出す。

```sql
CREATE OR REPLACE VIEW sales_unified_daily AS
WITH rate AS (
  SELECT value::numeric AS usd_jpy FROM app_settings WHERE key='usd_jpy_rate'
)
-- DLsite/Fanza
SELECT
  sd.sale_date,
  sd.aggregation_unit,
  sd.work_id,
  w.brand,
  sd.platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  sd.net_revenue_jpy AS revenue_jpy,
  sd.sales_count,
  NULL::INT AS views
FROM sales_daily sd
JOIN product_variants pv ON sd.variant_id = pv.id
JOIN works w ON sd.work_id = w.id

UNION ALL

-- YouTube（チャンネル→言語マッピング＋USD→JPY換算）
SELECT
  ym.metric_date AS sale_date,
  'daily' AS aggregation_unit,
  ym.work_id,
  'BLsand' AS brand,
  'youtube' AS platform,
  COALESCE(pv.language, 'unknown') AS language,
  pv.product_id,
  ROUND(
    (COALESCE(ym.estimated_revenue_usd, 0) + COALESCE(ym.membership_revenue_usd, 0))
      * (SELECT usd_jpy FROM rate)
  )::INT AS revenue_jpy,
  NULL::INT AS sales_count,
  ym.views
FROM youtube_metrics_daily ym
LEFT JOIN product_variants pv ON ym.variant_id = pv.id;
```

**v3.3の変更点**：
- `WITH rate AS (...)` CTE で `app_settings` を1回だけ評価 → 性能改善
- `COALESCE(pv.language, 'unknown')` で `language` の NULL 対応 → 代表クエリの `GROUP BY language` でNULLグループが出ない

**代表クエリ**：

```sql
-- 直近30日の言語別売上比率（全プラットフォーム横断、日次のみ）
SELECT language, SUM(revenue_jpy) AS revenue
FROM sales_unified_daily
WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
  AND aggregation_unit = 'daily'
GROUP BY language ORDER BY revenue DESC;

-- 作品別×プラットフォーム別×言語別マトリクス
SELECT work_id, platform, language, SUM(revenue_jpy) AS revenue
FROM sales_unified_daily
WHERE sale_date >= '2026-01-01'
GROUP BY work_id, platform, language;
```

### 4-7. `notion_pages`（Notion月次ページの追跡）

Notion APIで更新すべきblock_idを記録する。ページ単位・ブロック単位でIDを保持することで、HTMLコメントマーカーのような脆い方式を回避する。

```sql
CREATE TABLE notion_pages (
  month TEXT PRIMARY KEY,                     -- 'YYYY-MM' 形式
  page_id TEXT NOT NULL,                      -- Notion ページID
  page_url TEXT,                              -- 共有用URL
  summary_block_id TEXT,                      -- 月次サマリCalloutのID
  daily_table_block_id TEXT,                  -- 日次テーブル
  top_works_table_block_id TEXT,              -- 作品トップ10テーブル
  language_summary_block_id TEXT,             -- 言語別サマリ
  brand_summary_block_id TEXT,                -- ブランド別サマリ
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notion_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY notion_pages_read ON notion_pages FOR SELECT USING (true);
```

新規月の初回sync時にNotionページ＋テンプレート構造を作成、そのblock_idsをこのテーブルに保存。2回目以降のsyncは保存済みblock_idを直接更新。

### 4-8. `ingestion_log`（取込履歴）

```sql
CREATE TABLE ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scrape','csv-upload','api')),
  target_date_from DATE,
  target_date_to DATE,
  status TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  error_message TEXT,
  error_screenshot_path TEXT,             -- Supabase Storageのパス
  source_version TEXT,                    -- セレクター定義のversion または CSVフォーマットのversion
  runner TEXT,                            -- 'github-actions' | 'vercel-cron' | 'manual'
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_started ON ingestion_log(started_at DESC);
CREATE INDEX idx_ingestion_platform_status ON ingestion_log(platform, status);
```

### 4-9. Row Level Security（RLS）

Supabase標準のRLSを有効化。
- 全テーブルでRLSを有効
- **anon key**からは読み取り専用（SELECT のみ許可）
- **service role key**からは全操作許可（GitHub ActionsとVercel Cronはservice roleを使う）
- ログイン済みユーザー（加藤）も読み取り専用

```sql
-- 全テーブル一括でRLS有効＋読み取り許可
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY works_read ON works FOR SELECT USING (true);
CREATE POLICY product_variants_read ON product_variants FOR SELECT USING (true);
CREATE POLICY sales_daily_read ON sales_daily FOR SELECT USING (true);
CREATE POLICY youtube_metrics_daily_read ON youtube_metrics_daily FOR SELECT USING (true);
CREATE POLICY app_settings_read ON app_settings FOR SELECT USING (true);
CREATE POLICY notion_pages_read ON notion_pages FOR SELECT USING (true);
CREATE POLICY ingestion_log_read ON ingestion_log FOR SELECT USING (true);
```

書き込みはすべてサーバーサイド（API Route or GitHub Actions）経由。

**セキュリティ上の注意**：
- 本仕様の RLS は「anon keyで読み取り全許可」の設計。**anon keyがブラウザに露出するため、鍵が漏洩すれば全売上データが読まれる**
- 加藤のみ利用の前提で受容リスクとし、チームメンバーへ公開URLを広く共有するのは避ける
- 本格的な多ユーザー化時は、Supabase Auth導入 or Next.js API Route経由取得（Supabaseへの直接アクセスをサーバーのみに限定）に切り替え

---

## 5. データ取込仕様

### 5-1. CSV取込（過去データ・手動）

#### 実CSVの構造（両社ともCP932エンコード）

**DLsite**（例：`sales (2).csv` ＝月次）
```
サークルID,サークル名,販売サイト,作品ID,作品名,販売価格,卸価格,販売数,売上額
RG01060496,BerryFeel,DLsite日本語版,RJ01516722,【オクスリえっち...】,1430,990,51,50490
RG63532,CAPURI,DLsite日本語版,TOTAL,,,,2031,2259712
```
特徴：
- ファイル名に期間情報なし（取込時にUIで指定）
- 作品ID形式：`RJ[0-9]+` または `VJ[0-9]+`
- 最終行に `TOTAL` 集計行あり（スキップ対象）
- 翻訳版は別作品IDで登録される

**Fanza**（例：`sales_all_0_20260401_20260419.csv`）
```
サークル名,作品ID,作品名,単価,卸金額,販売数,販売金額合計,卸金額合計,期間(From),期間(to)
CAPURI,703666,ガチムチ刑務所...,1300,990,1,1300,990,2026-04-01,2026-04-19
```
特徴：
- **ファイル名に期間情報あり**：`sales_all_0_YYYYMMDD_YYYYMMDD.csv`
- **各行に期間(From)/期間(to)列あり**（自動抽出の根拠に使える）
- 作品ID形式：数字のみ（6桁〜7桁）
- サークルIDカラムなし（サークル名のみ）
- TOTAL集計行なし
- 現状は日本語版のみ（将来海外版対応時は言語列が増える可能性）

#### 取込UI（`/ingestion/upload`）
- **バルクアップロード対応**（複数ファイル同時選択）
- プラットフォーム選択（DLsite / Fanza）
- **期間の自動抽出ルール**：
  - Fanzaは**ファイル名**`sales_all_0_YYYYMMDD_YYYYMMDD.csv` または**CSV内の期間列**から抽出
  - DLsiteは**UI手動指定**（ファイル名に期間情報がないため）
- プレビュー表示：各ファイルの行数・対象期間・新規作品数・未紐付け作品数
- **「プレビュー確認」→「確定取込」**の2段階フロー

#### 取込処理フロー
1. ファイルを受信、`iconv-lite` で CP932 → UTF-8 変換、`csv-parse` でパース
2. プラットフォーム別に列マッピング（§5-1-1）
3. 期間を取得：Fanzaは自動抽出、DLsiteはUI指定
4. 各行を処理：
   - DLsiteの `作品ID = "TOTAL"` 行はスキップ
   - `サークル名` → `brand` マッピング（BerryFeel / CAPURI / 他）
   - `作品ID` で `product_variants` 検索、なければ新規作成（`work_id=null`、`origin_status='unknown'`）
   - `作品名` から言語自動判定（§5-3）
   - `sales_daily` に upsert（`aggregation_unit` は期間範囲から自動判定：1日＝daily、2日以上＝monthly）
5. 取込結果を `ingestion_log` に記録

#### 5-1-1. プラットフォーム別の列マッピング

| 内部カラム | DLsite列 | Fanza列 |
|---|---|---|
| `brand`（サークル名→ブランド） | サークル名 | サークル名 |
| `product_id`（作品ID） | 作品ID（RJ/VJ） | 作品ID（数字） |
| `product_title`（作品名） | 作品名 | 作品名 |
| `sales_price_jpy`（販売価格） | 販売価格 | 単価 |
| `wholesale_price_jpy`（卸価格） | 卸価格 | 卸金額 |
| `sales_count`（販売数） | 販売数 | 販売数 |
| `net_revenue_jpy`（卸合計） | 売上額 | 卸金額合計 |

#### ロールバック
`/ingestion` 画面で `ingestion_log_id` 指定で該当取込レコード一括削除（`sales_daily.ingestion_log_id = 取消対象ID` の行を DELETE）。

### 5-2. スクレイピング（日次・自動、GitHub Actions）

#### 前提：DLsite/Fanza両方で**期間指定**スクレイピングが必須
両サイトとも「期間を指定してCSVを生成→ダウンロード」の手順を毎日自動実行する。1日ずつ指定すれば日次データ、1ヶ月ずつ指定すれば月次集計が取れる。

#### プラットフォーム別のスクレイピング仕様
- **DLsite**：サークル選択を**「すべて」で固定**（Bisqueは `RG01060496`（BerryFeel）と `RG63532`（CAPURI）の複数サークル保有のため、1ファイルで全サークル分を一括取得）。売上区分は「総合売上」、販売サイトは「すべて」
- **Fanza**：**「商品売上」タブを選択**（「PC売上」「スマートフォン売上」は内訳なので対象外）、サークル選択は「すべて」

#### 実行基盤：GitHub Actions
DLsite/Fanzaスクレイピングは**GitHub Actions**上で実行。Vercelのメモリ制約・実行時間制約を回避。

**ワークフロー構成**（`.github/workflows/`）：
```
├── scrape-dlsite-daily.yml        # 日次 05:00 JST（前日分のみ）
├── scrape-fanza-daily.yml         # 日次 05:15 JST（前日分のみ）
├── scrape-dlsite-backfill.yml     # 手動トリガー（過去分バッチ取込）
├── scrape-fanza-backfill.yml      # 手動トリガー（過去分バッチ取込）
└── smoke-test-scrapers.yml        # 手動トリガー（スモークテスト）
```

**日次cron定義例**（`scrape-dlsite-daily.yml`）：
```yaml
on:
  schedule:
    - cron: '0 20 * * *'   # UTC 20:00 = JST 05:00
  workflow_dispatch:        # 手動トリガー可能
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run scraper:daily dlsite   # 前日の1日分を取得
        env:
          DLSITE_USERNAME: ${{ secrets.DLSITE_USERNAME }}
          DLSITE_PASSWORD: ${{ secrets.DLSITE_PASSWORD }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**過去分バッチcron定義例**（`scrape-dlsite-backfill.yml`、手動トリガー）：
```yaml
on:
  workflow_dispatch:
    inputs:
      from: { description: '開始年月 YYYY-MM', required: true }
      to:   { description: '終了年月 YYYY-MM', required: true }
      unit: { description: 'daily|monthly', required: true, default: 'monthly' }
jobs:
  backfill:
    runs-on: ubuntu-latest
    timeout-minutes: 360   # 最大6時間
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run scraper:backfill dlsite -- --from=${{ inputs.from }} --to=${{ inputs.to }} --unit=${{ inputs.unit }}
        env: { /* 同上 */ }
```

#### スクレイパーの動作モード

`npm run scraper:daily <platform>`（日次モード）：
- 前日（JST）の1日分を期間指定で取得
- `aggregation_unit='daily'` で格納

`npm run scraper:backfill <platform> --from=YYYY-MM --to=YYYY-MM --unit=monthly`（バッチモード）：
- 指定範囲を月次 or 日次ループで順次取得
- 月次：各月1日〜月末を1リクエスト＝48ヶ月で約24〜60分
- 日次：各日を1リクエスト＝4年で約12時間（分割推奨）
- 各リクエスト間に1〜2秒のsleep（レート制限対策）

`npm run scraper:check <platform>`（スモークテスト）：
- ログインだけ試行してセッション確立確認

#### スクレイパーのディレクトリ構造（メンテナンス性優先）
```
src/lib/scrapers/
├── base/
│   ├── scraper.ts            # 基底クラス: ログイン、リトライ、スクショ
│   ├── errors.ts             # AuthError | SelectorNotFoundError | TimeoutError | NetworkError
│   └── logger.ts             # 構造化ログ（Supabaseに書き出し）
├── config/
│   ├── dlsite-selectors.ts   # DLsiteセレクター定義（UI変更時はここだけ直す）
│   └── fanza-selectors.ts
├── dlsite.ts
├── fanza.ts
├── csv-parser.ts             # CP932 CSV共通パース
└── session-cache.ts          # セッションCookie再利用（24時間有効）

scripts/
├── scraper-run.ts            # CLIエントリ: npm run scraper:run <platform>
└── scraper-check.ts          # スモークテスト: npm run scraper:check <platform>
```

#### セッション再利用
毎回ログインするのは認証側に負荷。初回ログイン後のCookieをSupabase Storage（プライベートバケット `scraper-sessions/`）に保存し、24時間以内なら再利用する。Cookie期限切れ時は再ログイン。

#### 失敗時の挙動
1. 現在のページのスクリーンショットを撮影
2. Supabase Storage（`scraper-errors/`）にアップロード、パスを `ingestion_log.error_screenshot_path` に保存
3. 構造化エラー（`AuthError` / `SelectorNotFoundError` / `TimeoutError` / `NetworkError`）で `ingestion_log.error_message` に記録
4. GitHub Actions ワークフロー側も `actions/upload-artifact` でスクショをArtifactとして保存（二重バックアップ）
5. ダッシュボード `/ingestion` に赤アラート表示

#### メンテナンス容易化
- **セレクター定数化**（`config/*-selectors.ts` を変更するだけでUI変更対応）
- **失敗時スクショ自動保存**（UI変更でコケた瞬間の画面を残す）
- **構造化エラー型**（原因分類が容易）
- **デバッグモード**（`DEBUG_SCRAPER=1` でヘッドレス解除＋詳細ログ）
- **スモークテストコマンド**（`npm run scraper:check dlsite` でログインのみ試行）
- **セレクターversion tracking**（変更時に `version` フィールドを更新、`ingestion_log.source_version` に記録）

### 5-3. 言語自動判定（`lib/utils/detect-language.ts`）

**Phase 0 実測結果**：正規表現ベースでDLsite 101作品中 **誤判定 0%、unknown 14%**（文字化け由来）を達成。実用レベルと判断し、Phase 1bでは正規表現版で実装。`franc` 導入は精度改善の余地があればオプションで検討。

```ts
export type DetectedLang = 'ja' | 'en' | 'zh-Hant' | 'zh-Hans' | 'ko' | 'unknown';

export function detectLanguage(title: string): DetectedLang {
  // 文字化け「?」比率が高い場合は unknown（手動補正前提）
  const qRatio = (title.match(/\?/g)?.length ?? 0) / title.length;
  if (qRatio > 0.2) return 'unknown';

  if (/[\u3131-\u318E\uAC00-\uD7A3]/.test(title)) return 'ko';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(title)) return 'ja';

  if (/[\u4E00-\u9FFF]/.test(title)) {
    const hasTrad = /[繁體臺灣為會並傳專學習國當說時來這個這些點頭]/.test(title);
    const hasSimp = /[简体台湾为会并传专学习国当说时来这个这些点头]/.test(title);
    if (hasSimp && !hasTrad) return 'zh-Hans';
    if (hasTrad) return 'zh-Hant';
    return 'zh-Hant'; // どちらの固有字も含まない場合のデフォルト
  }

  if (/^[\x00-\x7F]+$/.test(title)) return 'en';
  return 'unknown';
}
```

**Phase 0 実測結果（DLsite CSV 101作品）**：
| 判定結果 | 件数 | 割合 | 目視チェック |
|---|---|---|---|
| ja | 45 | 44.6% | 正確 |
| zh-Hant | 30 | 29.7% | 正確（繁体字） |
| en | 9 | 8.9% | 正確 |
| zh-Hans | 3 | 3.0% | 正確（簡体字） |
| unknown | 14 | 13.9% | 文字化け由来、推測では簡体字版が多い |

判定結果は `product_variants.language` に格納され、`/variants` 画面で手動補正可能。unknown の大半は同一作品のRJ番号パターンから簡体字版と推測できるため、**RJ番号ベースで兄弟関係を自動提案するUI**を `/variants` 画面に持たせる（§9-3）。

### 5-4. YouTube API取込（日次・自動、Vercel Cron）

YouTube APIはGitHub Actions不要（Playwright不要なので軽量）。Vercel Cronで十分。§6-2の統合Cronルート（`/api/cron/daily`）の一ステップとして実装。

#### 使用API
- **YouTube Data API v3**: 動画メタデータ（タイトル、公開日）
- **YouTube Analytics API**: 日次指標（views, watchTime, estimatedRevenue, membershipsRevenue）

#### クォータ管理
YouTube Analytics APIのデフォルトクォータは 10,000 units/day。
- **複数動画まとめ取り**：`reports.query` に `filters=video==v1,v2,v3` で渡す（1リクエストで最大 100 動画）
- 1チャンネル200動画なら2リクエスト程度で済む
- クォータ不足時は翌日リトライ、`ingestion_log.status='partial'` で記録

#### 実装
毎日JST 05:30に `/api/cron/daily` の一部として実行。両チャンネル分を順次処理：
1. 全動画リスト取得（Data API）
2. 前日分のAnalytics指標を100動画ずつまとめ取り
3. **`product_variants` に未登録の動画があれば自動追加**（`platform='youtube'`、`language=channel_id→推定`）
4. **同時に対応する `works` レコードも自動生成**（§4-1-1参照、`auto_created=true`）
5. `youtube_metrics_daily` にupsert

#### 過去分バックフィルの可否（要検証）
YouTube Analytics API は過去データの遡及取得に制限がある可能性：
- 古い期間は集計済み粒度しか出ない（月次のみ等）
- チャンネル開始日より前は取得不可
- Phase 1f 着手時に、**まずサンプルで過去4年分の日次取得を試す**。ダメなら月次粒度で `aggregation_unit='monthly'` 相当で格納

---

## 6. Cron設計

### 6-1. GitHub Actions Cron（スクレイピング系）
```
scrape-dlsite-daily.yml : 日次 UTC 20:00 (JST 05:00)
scrape-fanza-daily.yml  : 日次 UTC 20:15 (JST 05:15)
```

### 6-2. Vercel Cron（軽量処理系、`vercel.json`）

**タイムアウトリスク（60秒ギリギリ）回避のため、最初から Cron 2本に分離**。Vercel Hobby は Cron 2本まで無料で利用可能。

```json
{
  "crons": [
    { "path": "/api/cron/daily",  "schedule": "30 20 * * *" },
    { "path": "/api/cron/notion", "schedule": "45 20 * * *" }
  ]
}
```

#### `/api/cron/daily`（UTC 20:30 = JST 05:30、maxDuration=60）
1. DLsite/Fanzaスクレイピング完了チェック（`ingestion_log` 参照、§6-4）
2. YouTube API取得（20〜40秒）
3. Snapshot生成（5秒）
- 合計想定：**25〜50秒**

#### `/api/cron/notion`（UTC 20:45 = JST 05:45、maxDuration=60）
1. 当日分データ到着チェック（YouTube取込が完了したか）
2. Notion月次ページ更新（§7-2、15〜30秒）
- 合計想定：**20〜35秒**

**認可**：両ルートで `Authorization: Bearer $CRON_SECRET` を検証。

**分離の利点**：
- 片方が失敗しても他方は実行される
- 各エンドポイントが単一責任、デバッグが容易
- Notion API リトライに余裕を持って3〜4回試行できる

### 6-3. 実行タイミング
JST 05:00起点は**Phase 1i で実データで反映タイミングを確認**した後に最終調整。仮設定は05:00〜06:00帯、もし前日分が昼以降に反映される場合は10:00〜11:00に後ろ倒し。

### 6-4. 各ジョブの実行順序と遅延耐性
- 順序：GitHub Actions（DLsite 5:00 → Fanza 5:15）→ Vercel Cron `/daily`（5:30）→ Vercel Cron `/notion`（5:45）
- 間隔：各15分

**完了チェックのロジック（疑似コード）**：

```ts
// /api/cron/daily の冒頭（YouTube+Snapshot 実行前にDLsite/Fanza完了確認）
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd'); // JST基準
const scrapeDone = await supabase.from('ingestion_log')
  .select('platform')
  .eq('target_date_from', yesterday).eq('target_date_to', yesterday)
  .in('platform', ['dlsite', 'fanza']).eq('status', 'success');

if (scrapeDone.data.length < 2) {
  await logSkip('daily-cron', `scrape not ready (${scrapeDone.data.length}/2)`);
  return NextResponse.json({ skipped: true });
}
// YouTube+Snapshotを順次実行
```

```ts
// /api/cron/notion の冒頭（Notion sync 実行前に3ソース完了確認）
const requiredPlatforms = ['dlsite', 'fanza', 'youtube'];
const allDone = await supabase.from('ingestion_log')
  .select('platform')
  .eq('target_date_from', yesterday).eq('target_date_to', yesterday)
  .in('platform', requiredPlatforms).eq('status', 'success');

if (allDone.data.length < 3) {
  await logSkip('notion-cron', `sources not ready (${allDone.data.length}/3)`);
  return NextResponse.json({ skipped: true });
}
// Notion syncを実行
```

**リカバー方針**：
- スキップ時は `/ingestion` 画面に黄アラート表示
- 加藤が `/ingestion/trigger` から再実行可能（Vercel API Route → GitHub Actions `workflow_dispatch` または `/api/cron/notion` 直接呼び出し）
- 連続2日スキップされた場合は赤アラート

---

## 7. 月次レポート画面＋Notion自動反映

ダッシュボード内の `/reports` 画面と、Notionへの日次自動反映の両方を提供する。

### 7-1. `/reports` 画面の構成
加藤がブラウザで詳細に確認するための画面。
- 月選択ドロップダウン（例：2026-04）
- **月次サマリカード**：当月累計・前月比・前年同月比・ブランド別・言語別・プラットフォーム別
- **日次推移テーブル**：
  | 日付 | DLsite(¥) | Fanza(¥) | YouTube収益(¥) | YouTube再生 | 日次合計(¥) | 前日比 |
- **チャート**：
  - 日次推移 LineChart（プラットフォーム重ね）
  - 言語別比率 PieChart
  - ブランド別推移 BarChart
- **エクスポート機能**（手動）：
  - 「Markdown形式でコピー」ボタン（クリップボードへ）
  - 「画像として保存」ボタン（html-to-imageで画面領域をPNG化）
  - 「CSV出力」ボタン（月次データをzipでDL）

### 7-2. Notion自動反映

日次Cronで月次サマリページを自動生成・更新。チームメンバーはNotion経由で状況把握できる。

#### 7-2-1. ページ構造
親ページ（環境変数 `NOTION_KPI_PARENT_PAGE_ID`）配下に月次サブページを自動生成：

```
📁 Bisque KPIレポート（親ページ）
  ├─ 📄 2026-04 KPIレポート（自動生成・日次更新）
  │   ├─ H1: 月次サマリ
  │   ├─ Callout（summary_block_id）: 当月累計・前月比・前年同月比
  │   ├─ H2: 日次推移
  │   ├─ Table（daily_table_block_id）: 日次テーブル
  │   ├─ H2: 作品別トップ10
  │   ├─ Table（top_works_table_block_id）: トップ10
  │   ├─ H2: 言語別売上比率
  │   ├─ Callout（language_summary_block_id）: 言語別の数字
  │   ├─ H2: ブランド別
  │   └─ Callout（brand_summary_block_id）: ブランド別の数字
  ├─ 📄 2026-03 KPIレポート（前月、最終同期時の状態で凍結）
  └─ 📄 2026-02 KPIレポート
```

前月ページは自動更新しない（翌月初回Cron時点で凍結）。

#### 7-2-2. block_id追跡方式（v3.1のマーカー方式から改善）

v3.1のHTMLコメントマーカー方式は**Notion APIではHTMLコメントブロックが存在しないため実現不可**という問題があった。v3.4では以下の方式に変更：

1. 新規月の初回sync時：
   - Notion APIで `pages.create` で新規ページ作成（親ページを指定）
   - テンプレート構造（H1/H2・Callout・Table スケルトン）を `blocks.children.append` で一括挿入
   - レスポンスの `results` 配列から各トップレベルブロックのIDを取得
   - **Tableブロックは作成されるが、`table_row` 子ブロックはレスポンスに含まれない**ため、別途 `blocks.children.list({ block_id: tableBlockId })` を呼んで行IDを取得（初期テンプレートでは空行をN行入れておく）
   - `notion_pages` テーブル（§4-7）に `month, page_id, *_block_id` を保存
2. 2回目以降のsync時：
   - `notion_pages` から当月の block_id 群を取得
   - **Callout/H系**：`PATCH blocks/{block_id}` で `rich_text` を上書き（1ブロック単位）
   - **Tableの行**：
     - `GET blocks/{table_block_id}/children` で既存行を取得
     - 各行を `DELETE blocks/{row_id}` で削除（or `archived=true` で論理削除）
     - `PATCH blocks/{table_block_id}/children` で新行を100件ずつバッチ挿入

**利点**：
- マーカー範囲の文字列操作が不要、ブロック単位の精密な更新
- 加藤がページ内にマーカー外のブロックを追加しても影響なし（管理されたblock_idのみ操作）
- Notion側でページの位置変更・タイトル変更・プロパティ追加などは保持される

**制約（Notion API仕様）**：
- `table` ブロックの **`table_width`（列数）は作成後に変更不可**。日次テーブル・トップ10テーブルの列構成は作成時に確定
- 将来、言語別列を増やしたくなった場合は、テーブルブロックを削除＋再作成（`notion_pages.daily_table_block_id` を更新）する運用になる
- `has_column_header`、`has_row_header` も作成時に固定

#### 7-2-3. API制限への対応
- **1リクエスト100ブロック上限**：日次テーブル30行なら1リクエストで完了、大きなテーブルはチャンク分割
- **3 req/sec レート制限**：呼び出し間に `await sleep(350)` 程度
- **429 エラー**：指数バックオフ（1s, 2s, 4s, 8s）で最大3回再試行
- 最終失敗時：`ingestion_log` に `status='failed'` で記録、ダッシュボード `/ingestion` に赤アラート

#### 7-2-3-1. 失敗時のリカバー動作
- **翌日Cron**：再実行時は block_id ベースで最新データに上書き（前日失敗分も含めて復旧）
- **2日連続失敗**：Notionページは**前日成功時点の古い状態**のまま残る。加藤が気付いたら `/ingestion` から手動トリガー or Notion認証を確認
- **手動トリガー**：`/ingestion` に「Notion sync を今すぐ再実行」ボタンを用意、Vercel API Route 経由で `/api/cron/notion` を呼ぶ（CRON_SECRETで認可）
- **前月ページの更新**：デフォルトでは凍結。必要時は `/ingestion` から「対象月を指定して再sync」で実行可能

#### 7-2-4. 月切り替え
- Cron実行時、対象月の `notion_pages` レコードがなければ新規ページ作成
- 月末23:59（JST）時点で当月ページは「確定」扱い、翌月初回Cronで新ページ作成
- 前月ページは凍結（手動でCronリトリガーすれば再更新可能）

#### 7-2-5. 実行時間見積もり
- 新規ページ作成（月初のみ、初回）：約5秒
- 既存ページ更新（通常）：15〜30秒
- `/api/cron/notion` 単体の想定実行時間：**20〜35秒**（maxDuration 60s に十分な余裕）
- Cron 2本分離設計（§6-2）により、`/api/cron/daily` のYouTube+Snapshotとは独立して動作

#### 7-2-6. Notionへの認可設定（加藤側作業、10分程度）
1. https://www.notion.so/my-integrations でInternal Integration作成
2. シークレットトークン取得 → 環境変数 `NOTION_API_TOKEN`
3. `notion-bisque` ワークスペース内に「Bisque KPIレポート」親ページ作成
4. 親ページ右上「…」→「接続」→ 作成したIntegrationを接続
5. 親ページURLから末尾のID部分を取得 → 環境変数 `NOTION_KPI_PARENT_PAGE_ID`

---

## 8. Claude Code用CSVスナップショット

日次Cron実行後、Supabase Storage の `bisque-snapshots/` バケットにCSV出力。

### 8-1. 出力ファイル
```
Supabase Storage: bisque-snapshots/
├── latest/
│   ├── sales_by_work.csv
│   ├── sales_by_platform.csv
│   ├── sales_by_language.csv
│   ├── youtube_metrics.csv
│   └── summary.csv
└── daily/
    ├── 2026-04-20.csv
    └── ...
```

### 8-2. Claude Codeからの利用

**主経路：Gitリポジトリ内にミラー** — Supabase Storageに出したCSVを、GitHub Actions経由でGitにcommit同期。Claude Codeは`data/snapshots/`をローカルで直接読める。

```yaml
# .github/workflows/mirror-snapshots.yml
on:
  schedule:
    - cron: '0 22 * * *'   # UTC 22:00 = JST 07:00、snapshot生成後
  workflow_dispatch:
jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check snapshot freshness
        run: node scripts/check-snapshot-fresh.mjs  # ingestion_log で当日snapshot成功を確認、失敗ならexit 1
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - run: node scripts/download-snapshots.mjs  # Supabase Storage → data/snapshots/
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - name: Commit
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add data/snapshots/
          git diff --staged --quiet || git commit -m "chore: sync snapshots $(date +%Y-%m-%d)"
          git push
```

**事前チェック**：`scripts/check-snapshot-fresh.mjs` が当日の `ingestion_log` で snapshot 生成成功（`platform='snapshot', status='success'`）を確認し、成功していなければ早期 exit。古いスナップショットで上書きされる事故を防ぐ。

**補助経路**：
- `supabase-js` で直接ダウンロード（スクリプト等から使う場合）
- SQLクエリ直接（service role key使用、細かい集計が必要な時）

**活用シナリオ**：
- 戦略ドキュメント（例：`/Users/takuyakato/roadie/management/strategy/成人向けLive2D動画の海外展開戦略.md`）の売上シミュレーション推測値を、最新実績で更新
- Claude Codeが `data/snapshots/latest/sales_by_language.csv` を読んで「直近3ヶ月の英語売上比率は X%」と引用

---

## 9. 画面構成

想定ユーザーは加藤のみ。ディレクター・プロデューサーはNotion経由で把握するため、**ダッシュボードはシンプルな管理画面**として作る。

### 9-1. `/` ダッシュボード（**速報ビュー**）
「今日〜直近の状況をサッと確認」用途。月を選択せず、常に最新直近を表示。

- **KPIカード（最上部）**：今日の総売上・今週累計・今月累計・前月同日比
- **直近30日の売上推移**：日次LineChart（プラットフォーム重ね表示）
- **直近30日の言語別売上比率**：円グラフ
- **直近30日のブランド別売上**：棒グラフ
- **直近30日のプラットフォーム別売上**：棒グラフ
- **トップ10作品**：直近30日累計

月単位での深い振り返りは `/reports`（§9-5）で実施。

### 9-2. `/works` 作品マスタ
- 作品一覧（ブランド・ジャンル・リリース日フィルタ、`auto_created` フラグフィルタ）
- **表示名**：`slug || id`（加藤が `slug='capuri-001'` のように付けていれば優先表示、未設定なら `auto-xxxxxxxx` を表示）
- 新規作品追加・編集（`title`、`slug`、`brand`、`genre`、`release_date`、`notes` を編集、`auto_created` 解除も可能）
- 作品詳細：日次売上推移・言語別内訳・翻訳版SKU一覧
- **未紐付けSKUがあれば作品詳細で直接紐付け可能**
- 自動生成作品の整理操作：別work に統合（`product_variants.work_id` を書き換え、空になったauto-workを削除）

### 9-3. `/variants` 言語別SKU管理
- SKU一覧（プラットフォーム・作品ID単位）
- **未紐付けSKUの一括紐付けUI**（タイトル類似度ベースで推測候補を提示、採用ボタンで即紐付け）
- 言語手動補正UI

### 9-4. `/platforms` プラットフォーム別
- DLsite / Fanza / YouTube 時系列推移
- プラットフォーム比較・言語別内訳

### 9-5. `/reports` 月次レポート（**振り返りビュー**）
「月単位での振り返り・チーム共有」用途。月を選択して、その月の詳細を表示。§7-1 に構成詳細。
- `/` との違い：**月を選べる**（過去の月の振り返りに使える）、**エクスポート機能あり**（Markdown/画像/CSV）、Notion自動反映との整合性が取れる

### 9-6. `/ingestion` 取込管理（タブ分割）
機能過多を避けるため、3タブに分割。親ページは直近サマリと次回実行予定のみ。

#### 9-6-1. `/ingestion`（トップ、直近サマリ）
- 最近24時間のステータス（成功・失敗・スキップ件数）
- 次回自動実行予定（DLsite/Fanza GA、Vercel Cron）
- 未紐付けSKU件数・未確認auto-works件数（`/works`へのリンク）

#### 9-6-2. `/ingestion/history` 取込履歴
- `ingestion_log` 一覧（プラットフォーム・日付・ステータスでフィルタ）
- 失敗時のスクリーンショットリンク・エラー詳細
- ingestion_log_id 指定でロールバック（該当データ削除）

#### 9-6-3. `/ingestion/upload` CSVアップロード
- バルクアップロード（複数ファイル同時選択、§5-1）
- プレビュー → 確定の2段階フロー

#### 9-6-4. `/ingestion/trigger` 手動実行
- **スクレイピング再実行**（対象日・プラットフォーム指定、GitHub Actions workflow_dispatch経由）
- **過去分バックフィル**（期間・unit 指定、backfill workflow 経由）
- **Notion sync 再実行**（対象月指定、`/api/cron/notion` を直接呼び出し）
- **Snapshot再生成**（`/api/cron/daily` の Snapshot部分だけ実行するエンドポイント）

### 9-7. `/login` パスワード認証

---

## 10. 認証

**加藤のみ利用**。idea-cascade準拠のCookie認証。チーム共有はNotion経由（ダッシュボードへのアクセスは加藤のみ）。

### 10-1. Cookie設定
- 名前：`bisque-analytics-auth=authenticated`
- **HttpOnly**: true（JSからのアクセス不可）
- **Secure**: true（本番はHTTPSのみ）
- **SameSite**: `Lax`（同一オリジンからのPOSTは許可、クロスサイトは拒否 → CSRF対策として機能）
- **Path**: `/`
- **有効期限**：30日（`Max-Age=2592000`）、ブラウザ閉じてもログイン状態維持

### 10-2. ログイン処理（`POST /api/auth/login`）
```ts
import { timingSafeEqual } from 'crypto';

const input = Buffer.from(password);
const expected = Buffer.from(process.env.APP_PASSWORD!);
// 長さが違うと false、さらにタイミング攻撃対策
const ok = input.length === expected.length
  && timingSafeEqual(input, expected);

if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

const res = NextResponse.json({ ok: true });
res.cookies.set('bisque-analytics-auth', 'authenticated', {
  httpOnly: true, secure: true, sameSite: 'lax',
  path: '/', maxAge: 60 * 60 * 24 * 30,
});
return res;
```

### 10-3. CSRF対策
- `SameSite=Lax` により、クロスサイトPOSTはCookieが送られない → CSRF実質不可能
- さらに `Origin`/`Referer` ヘッダを middleware で検証（本番ドメイン以外からのPOSTは拒否）
- **追加トークンは不要**（加藤のみ利用・単一オリジン前提）

### 10-4. middleware.ts の責務
- 全ページで Cookie 検証、未認証は `/login` にリダイレクト
- `/login` と `/api/auth/login`、`/api/cron/*`（CRON_SECRETで別途認可）は除外
- API Route は Cookie検証＋`Origin` 検証で保護

---

## 11. 環境変数

### 11-1. Vercel（`.env.local` / 本番）
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# 認証
APP_PASSWORD
CRON_SECRET

# YouTube
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN_JP
YOUTUBE_REFRESH_TOKEN_EN
YOUTUBE_CHANNEL_ID_JP
YOUTUBE_CHANNEL_ID_EN

# Notion
NOTION_API_TOKEN
NOTION_KPI_PARENT_PAGE_ID

# 為替
USD_JPY_RATE                # デフォルト '150'

# URL
NEXT_PUBLIC_APP_URL
```

### 11-2. GitHub Actions Secrets
```
DLSITE_USERNAME
DLSITE_PASSWORD
FANZA_USERNAME
FANZA_PASSWORD
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

スクレイピングに必要な最小限の情報だけGitHub Actions側に設定。

### 11-3. Vercel ⇄ GitHub Actions の同期チェックリスト

下記の値は**両環境で同じ値**を設定する必要がある。片方だけ更新すると取込失敗やデータ不整合を起こす。

| 値 | Vercel側の名前 | GitHub Actions側の名前 | 更新タイミング |
|---|---|---|---|
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` | Supabase プロジェクト変更時 |
| Supabase Service Role Key | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | キー再生成時 |

**運用ルール**：
- 変更時は必ず両方を同じタイミングで更新
- `docs/env-sync-checklist.md` に変更ログを残す（誰がいつ何を変えたか）
- Phase 1a で CLI スクリプト `npm run check:env-sync` を用意し、Vercel env と GitHub Secrets（表示のみ、値は読めない）の項目一致を目視確認できるようにする

---

## 12. 実装フェーズ

### Phase 0：技術検証（半日〜1日）
§3参照。DLsite日次CSV可否、Playwright動作、Supabase設定、YouTube API、Notion APIを事前検証。成果物は `docs/phase0-results.md`。

### Phase 1a：基盤（最小動作）
1. Next.js初期化（`create-next-app`）
2. 依存インストール
3. Supabaseプロジェクト設定、migration（`001_initial_schema.sql`）
4. `lib/supabase/` 3層
5. `middleware.ts` + `/login` 認証
6. RLSポリシー適用
7. `app_settings` テーブルへの環境変数同期ユーティリティ
8. CLAUDE.md 作成、projects/README.md更新

### Phase 1b：CSV取込MVP
9. CSVパーサー（CP932対応、`csv-parse`）
10. 言語自動判定（正規表現版を移植、Phase 0で実用レベル確認済み）
11. `/ingestion/upload` 画面（バルクアップロード対応）
12. CSV取込APIルート
13. **実CSV 2本（`sales (2).csv`、`sales_all_0_20260401_20260419.csv`）で取込確認**

### Phase 1c：作品マスタ・UI
14. `/works` 画面
15. `/variants` 画面（推測紐付けUI含む）
16. ダッシュボード（基本KPI）
17. Browser Use CLI 2.0 で動作確認

### Phase 1d：スクレイパー基盤＋DLsite
18. スクレイパー基底クラス・エラー型・ロガー
19. セッションキャッシュ
20. DLsiteセレクター定義・本体
21. スモークテストコマンド（`npm run scraper:check dlsite`）
22. GitHub Actions ワークフロー（`scrape-dlsite.yml`）
23. 失敗時スクショ保存（Supabase Storage + GA Artifact）

### Phase 1e：Fanzaスクレイパー
24. Fanzaセレクター定義・本体
25. `scrape-fanza.yml`

### Phase 1f：YouTube API
26. Google Cloud Console セットアップ（加藤の手動作業を手順書化）
27. OAuth認可スクリプト（2チャンネル分）
28. YouTube API連携（クォータ管理含む）
29. 新規動画時の works 自動登録（§4-1-1）
30. `/api/cron/daily` の YouTube ステップ実装

### Phase 1g：月次レポート画面＋Notion自動反映
31. `/reports` 月次レポート画面（§7-1）
32. Markdown/画像/CSVエクスポート機能
33. `notion_pages` テーブル追加
34. Notionテンプレート構造の作成ユーティリティ（§7-2-2）
35. Notion block_id追跡での更新ロジック
36. `/api/cron/daily` の Notion sync ステップ実装（実行時間が60秒超なら別Cron化）

### Phase 1h：スナップショット＋管理画面
37. CSVスナップショット出力（Supabase Storage）
38. `/api/cron/daily` の Snapshot ステップ実装
39. `/platforms` 画面
40. `/ingestion` 取込履歴・手動トリガー・ロールバックUI

### Phase 1i：デプロイ・過去分バックフィル・運用
41. Vercel Hobby 本番デプロイ
42. GitHub Actions 本番稼働（日次スクレイピング開始）
43. Vercel Cron 動作確認（`/api/cron/daily`）
44. **過去4年分のバックフィル**（以下の2段構えを推奨）：
    - (a) `scrape-{dlsite,fanza}-backfill.yml` を**月次unit**で発火 → 48ヶ月分が各プラットフォーム約24〜60分で完了。`aggregation_unit='monthly'`で格納
    - (b) 必要に応じて直近12ヶ月のみ**日次unit**で再取得 → より詳細な分析が可能に
45. `CLAUDE.md` / `README.md` 仕上げ

---

## 13. リスクと対応

| # | リスク | 影響 | 対応 |
|---|---|---|---|
| 1 | DLsite/FanzaのUI変更でスクレイパー破損 | 日次データ取得不可 | セレクター定数化、失敗時スクショ自動保存、ダッシュボード赤アラート、source_versionで変更追跡 |
| 2 | DLsiteが日次CSVを出さない | 日次グラフ描画不可 | Phase 0で検証。月次のみなら `aggregation_unit='monthly'` で格納、日次ビューは「当月累計」として表示 |
| 3 | 2段階認証が後から有効化 | ログイン不可 | 加藤側でOFF維持、Phase 0で確認、将来TOTP対応 |
| 4 | Fanza管理画面の構造不明 | Fanza取込不可 | Phase 0で構造確認、DLsiteと大きく違えばPhase 1eを先送り |
| 5 | GitHub Actionsがアクセスブロックされる | スクレイピング全停止 | Action側のIPは固定でないため複数回試行、ダメならVercel ProやローカルMacに退避 |
| 6 | 規約違反でアカウント凍結 | 販売停止に波及 | 人間操作範囲・日次1回、過度アクセス回避、セッション再利用で無駄ログイン削減 |
| 7 | Notion APIレート・ブロック制限 | 日次サマリ更新失敗 | block_id追跡方式（§7-2-2）、指数バックオフ、チャンク分割、失敗は`ingestion_log`に記録。`/api/cron/daily` が60秒を超える場合は Notion sync を別Cron化 |
| 8 | 過去4年分CSVが重い | ブラウザタイムアウト | バルクアップロードでサーバー側ストリーム処理、月単位で分割取込 |
| 9 | YouTube API クォータ超過 | YouTube指標欠損 | `filters=video==` で複数まとめ取り、partial記録で翌日再試行 |
| 10 | 言語自動判定の誤判定 | 分析が歪む | `/variants` で手動補正、文字化け率高い場合は`unknown`、Phase 0で精度測定 |
| 11 | 月次/日次データの二重計上 | 売上集計が狂う | `aggregation_unit` 列でフィルタ、集計クエリで常に片方のみ参照 |
| 12 | Supabaseバックアップ失敗 | データ損失 | Supabase Pro標準の日次バックアップ（7日間保持）＋**週次 GitHub Actions で `pg_dump` 実行、結果を private リポジトリ `bisque-sales-analytics-backups` にcommit**（別repo運用でサイズ爆発時も本体リポジトリに影響せず） |
| 13 | `current_setting`がSupabaseで使えない | VIEW動作不可 | `app_settings` テーブル方式採用（§4-5、§4-6）で回避済 |

---

## 14. 検証方法

### Phase 0完了時
- 各検証項目の合否を `docs/phase0-results.md` にまとめる
- NG項目は仕様書の最新版で対応策を反映

### Phase 1a完了時
- `npm run dev` → `/login` 認証 → `/` にリダイレクト
- Supabase Studioで全テーブル・VIEW・RLS確認
- `app_settings` が環境変数から同期される

### Phase 1b完了時
- `sales (2).csv` と `sales_all_0_20260401_20260419.csv` をアップロード → `sales_daily` に正しくレコード
- 言語判定の結果がPhase 0実測値と同じ分布（ja 45 / zh-Hant 30 / en 9 / zh-Hans 3 / unknown 14）になる
- DLsite `TOTAL` 行スキップ
- Fanza ファイル名からの期間自動抽出
- 重複アップロードで二重挿入されない
- ロールバックで該当レコード全削除

### Phase 1c完了時
- `/works` で作品作成・編集
- `/variants` で未紐付けSKUを作品に紐付け（推測採用含む）
- ダッシュボードに取込済みデータが可視化

### Phase 1d/1e完了時
- `npm run scraper:check dlsite` でログイン成功
- GitHub Actionsを手動トリガーして前日分取込成功
- わざとセレクターを壊す→Artifactとスクショ両方に画像が残る

### Phase 1f完了時
- YouTube APIで2チャンネル分のメタデータ＋前日指標取得
- 未登録動画が `product_variants` に自動追加される

### Phase 1g完了時
- `/reports` 月次レポート画面が動作
- Markdown/画像エクスポートボタンで月次サマリをクリップボードに出力できる
- Notion親ページ配下に「2026-04 KPIレポート」が自動生成・更新される
- `notion_pages` テーブルに block_id 群が保存される
- 翌日再実行で上書きされる（block_id方式で手動編集の他ブロックは保持）

### Phase 1h完了時
- CSVスナップショットが Supabase Storage に日次で出力される
- `/platforms` と `/ingestion` 画面が動作

### Phase 1i完了時
- 本番URL（Vercel Hobby）でダッシュボード動作
- GitHub ActionsでDLsite/Fanzaが日次稼働
- Vercel Cron（`/api/cron/daily`）で YouTube + Notion + Snapshot が日次稼働
- 過去4年分のバックフィルが完了（月次単位）

### テスト戦略

#### 単体テスト（Vitest）
- **言語判定** `detectLanguage()`: 各言語5ケース以上＋文字化けケース
- **CSVパーサー**: DLsite/Fanza各1ファイル（既に `data/` に実サンプルあり）
- **Notion生成**: 月次サマリ・日次テーブル・言語別Calloutの各ブロック生成関数
- **app_settings同期**: 環境変数→DB同期ユーティリティ
- **カバレッジ目標**: コア業務ロジック（lib/utils, lib/scrapers/csv-parser, lib/notion/）で**80%以上**

#### 統合テスト
- 実CSV2本（`sales (2).csv`、`sales_all_0_20260401_20260419.csv`）を取込 → `sales_daily` の件数・合計金額がCSVのTOTAL行と一致
- `sales_unified_daily` VIEWの代表クエリ3本が期待値を返す
- Notion block_id 追跡が2日連続で正しく更新される

#### E2Eテスト
- スクレイパーはモックHTML（Playwrightで固定HTMLをサーブ）でテスト
- 実サイトテストはスモークコマンド（`npm run scraper:check`）でローカル手動実行

#### 壊れ耐性テスト
- セレクター未一致 → `SelectorNotFoundError` が throw され、スクショが保存される
- タイムアウト → `TimeoutError` で ingestion_log に記録
- ログイン失敗 → `AuthError` で記録＋アラート
- Notion 429 → 指数バックオフで正常復帰

---

## 15. 運用シナリオ（典型ケース）

実装時の検証基準としても使う。

### 15-1. 新作リリース時
1. CAPURIで新作がDLsiteに登録される（加藤の作業）
2. 翌日のGitHub Actions日次スクレイピングで前日分売上を取得
3. 新規 `product_id` を検出 → `product_variants` に自動追加（`work_id=null` のまま）→ 同時に `works` にも自動生成（`auto_created=true`、`id='auto-XXXXXXXX'`、`title=作品名`、`brand='CAPURI'`）→ `product_variants.work_id` をセット
4. 加藤が `/works` 画面で `auto_created=true` の新作を確認、タイトル修正・`slug` 付与・ジャンル設定、`auto_created=false` に変更
5. 翻訳版（英語・繁体字等）が後日リリースされたら、同様のフローで新 `product_variants` が作られる。加藤が `/variants` 画面でRJ番号近接パターンから**既存の原作workに統合**（`work_id` を書き換え、余った auto-work を削除）

### 15-2. スクレイパーがDLsite UI変更で失敗
1. 日次Cron実行時、セレクター一致せず `SelectorNotFoundError` をthrow
2. スクショ自動保存（Supabase Storage `scraper-errors/`）、`ingestion_log.status='failed'` で記録
3. ダッシュボード `/ingestion` に赤アラート、スクショへのリンクあり
4. 加藤がリンクでスクショを開き、変更後のセレクターをClaude Codeに伝える
5. Claude Codeが `config/dlsite-selectors.ts` を修正、`version` を更新
6. `/ingestion` から該当日の再実行トリガー → 正常取込

### 15-3. 加藤が過去分を再取込したい
1. `/ingestion/upload` でCSVをアップロード（DLsite期間指定 or Fanzaファイル名自動抽出）
2. プレビューで確認 → 確定
3. `sales_daily` に upsert（既存データは上書き）
4. 問題があれば `/ingestion` 履歴から `ingestion_log_id` 指定でロールバック

### 15-4. Notionの月次ページを加藤が手動編集したい
1. 加藤が Notion の当月KPIレポートページに「今月のコメント」ブロックを追加
2. 翌日のCronで Notion sync が走る
3. block_id追跡方式により、加藤が追加したブロックは保持される（管理対象の block_id のみ更新）
4. 加藤のコメントとシステム自動更新が共存

---

## 16. 将来拡張

- **Fanza海外版**（英語・韓国語・中国語）：`product_variants.language` を拡張するだけで既存横断分析に自動反映（テーブル変更不要）
- **Patreon / pixivFANBOX / Fantia**：`scrapers/` に新ファイル追加、`platform` enum拡張
- **OceanVeil / Coolmic / Laftel**等の海外プラットフォーム：APIまたはレポート取込先として追加
- **為替換算の高度化**：固定レート→日次為替API連携。過去データは格納時の固定レートを保持、新規データのみ日次レート適用
- **異常値検出・Slack通知**：前日比大幅減・取込失敗時にSlack通知
- **海外展開戦略シミュレーション連携**：`/Users/takuyakato/roadie/management/strategy/成人向けLive2D動画の海外展開戦略.md` の推測値を実績で更新
- **多ユーザー化**：Supabase Auth 導入 or API Route経由取得に切り替え、RLSの厳格化

---

## 17. 参考

### 17-1. 既存コードの参照元
- Supabase 3層構造：`/Users/takuyakato/projects/idea-cascade/src/lib/supabase/{client,server,service}.ts`
- middleware認証：`/Users/takuyakato/projects/idea-cascade/src/middleware.ts`
- Vercel Cron設定：`/Users/takuyakato/projects/idea-cascade/vercel.json`
- CLAUDE.md構成：`/Users/takuyakato/projects/idea-cascade/CLAUDE.md`

### 17-2. 開発時ルール
- **UI動作確認**：Browser Use CLI 2.0（`projects/CLAUDE.md` 準拠）
- **本番スクレイピング**：Playwright（GitHub Actions上で実行）
- **コミット粒度**：機能単位でPR分割、スカッシュマージ
- **実装後**：`/simplify` でコード品質確認

### 17-3. 関連ドキュメント
- `CLAUDE.md`：プロジェクト固有の開発ガイド（AI向け）
- `/Users/takuyakato/projects/CLAUDE.md`：projects共通ルール
- `/Users/takuyakato/CLAUDE.md`：全社共通ルール
- `/Users/takuyakato/roadie/management/strategy/成人向けLive2D動画の海外展開戦略.md`：連携対象の戦略ドキュメント

---

## 18. 改訂履歴

### v3.5 → v3.6（2026-04-20）

レビューで検出された内部矛盾5件＋技術論点4件＋改善2件を反映。Slack通知（S11）はユーザー判断で見送り。

#### 内部矛盾の修正（M1-M5）
- **M1**：§7-2-5 に残っていた Cron 1本時代の古い記述を修正。`/api/cron/notion` 単体の実行時間（20〜35秒）として書き直し
- **M2**：`/api/cron/notion` 冒頭の完了チェックに **YouTube の成功確認** を追加（3ソース必須：DLsite/Fanza/YouTube）
- **M3**：`product_variants.language` を `NOT NULL DEFAULT 'unknown'` に変更（自動判定との整合）。`origin_status` も同様
- **M4**：§9-2 `/works` 画面に `slug` 表示・編集仕様を追記（`slug || id` 表示、auto-work 整理操作）
- **M5**：§8-2 mirror-snapshots.yml に `check-snapshot-fresh.mjs` 事前チェックを追加（古いsnapshotでの上書き事故を防ぐ）

#### 技術論点の反映（R8-R11）
- **R8**：§10 認証を詳細化。Cookie オプション（HttpOnly、Secure、SameSite=Lax、Max-Age 30日）、CSRF対策（SameSite + Origin検証）、`timingSafeEqual` でのパスワード比較
- **R9**：§9-6 `/ingestion` をタブ分割（`/ingestion` トップ、`/history`、`/upload`、`/trigger`）。機能過多の解消
- **R10**：§5-2 に **Fanza「商品売上」タブ選択**を明記
- **R11**：§5-2 に **DLsite サークル選択「すべて」固定**を明記（Bisqueの複数サークル `RG01060496`/`RG63532` を1ファイルで取得）

#### 改善の反映（S12-S13）
- **S12**：§4-5 に `app_settings` の後から値変更するフローを追記（Vercel環境変数更新→同期、Supabase Studio直接編集の2方式）
- **S13**：§11-3 に Vercel ⇄ GitHub Actions 同期チェックリストを追加。`docs/env-sync-checklist.md` で変更ログ管理、`npm run check:env-sync` CLI

#### 見送り
- S11 Slack通知 → ユーザー判断で見送り（将来拡張扱い）
- Q12 BLサンド日英対応 → 設計（works + product_variants の柔軟モデル）で「混在」前提に対応可能なため、デフォルト挙動で進める

### v3.4 → v3.5（2026-04-20）

レビューで検出された残存技術論点7件＋改善6件を反映。スコープは v3.4 と同一（C1-C5 のスコープ拡張・Q4の認証変更はユーザー判断で見送り）。

#### 残存技術論点の修正（R1-R7）
- **R1**：`/api/cron/daily` のタイムアウト懸念解消のため、**最初から Cron 2本に分離**（`/api/cron/daily` + `/api/cron/notion`）。Vercel Hobby 2本制限内（§6-2）
- **R2**：Notion API の `table` ブロック列数固定制約を §7-2-2 に明記
- **R3**：`works.id` を `auto-XXXXXXXX` 形式に統一、人間可読名は `slug` 列で別管理（§4-1）
- **R4**：GitHub Actions完了チェックのロジックを疑似コードで明示、リカバー方針追記（§6-4）
- **R5**：Notion初回ページ作成時の block_id 取得手順を明示（`table_row` は `blocks.children.list` で別途取得）（§7-2-2）
- **R6**：Phase 0 の定義を「A/B/G の3項目に限定」、C/D/E/F は「Phase 1各段階の前提検証」として別扱いに整理（§3-2）
- **R7**：§14 Phase 0 完了時の古い版数記述を修正（「v3.1で対応」→「最新版で対応」）

#### 改善の反映（S1-S6）
- **S1**：Claude Code連携フローを明確化。GitHub Actionsで Supabase Storage → Gitリポジトリの `data/snapshots/` にミラーする仕組みを追加（§8-2）
- **S2**：バックアップ戦略を明確化。週次 GitHub Actions で `pg_dump` → private リポジトリへcommit（§13 #12）
- **S3**：Notion 失敗時のリカバー動作を追記（§7-2-3-1）。翌日Cronでの復旧・手動トリガー・前月ページ再sync
- **S4**：`/` ダッシュボードと `/reports` の役割区別を明確化（§9-1、§9-5）。`/` は速報、`/reports` は月振り返り＋エクスポート
- **S5**：運用シナリオ4ケースを§15に追加（新作リリース／スクレイパー故障／過去分再取込／Notion手動編集との共存）
- **S6**：テスト戦略を具体化。カバレッジ目標80%、テストケース例を明示（§14）

#### その他
- セクション番号繰り下げ：§15 に運用シナリオを挿入、将来拡張→§16、参考→§17、改訂履歴→§18

### v3.3 → v3.4（2026-04-20）

Notion自動反映を復活（v3.3で除外したもの）。ただし v3.1 の HTML コメントマーカー方式ではなく、**block_id追跡テーブル方式**で実装することで保守性を確保。

- **Notion自動反映を Phase 1 に復帰**（§1-2、§7-2、§11-1、§12 Phase 1g、§13 #7、§14）
- **`notion_pages` テーブル追加**（§4-7）：月・page_id・各ブロックIDを保存
- **block_id追跡方式**（§7-2-2）：v3.1のHTMLコメントマーカー方式の問題を解決。各ブロックの更新は保存済みblock_idを直接指定
- **`/api/cron/daily` に Notion sync ステップ追加**（§6-2）：YouTube + Notion + Snapshot の3ステップ、実行時間30〜55秒想定
- **タイムアウトリスク対応**（§6-2、§13 #7）：60秒超の場合は Notion sync を `/api/cron/notion-sync` に分離（Vercel Hobby 2本制限内）
- **環境変数復活**（§11-1）：`NOTION_API_TOKEN`、`NOTION_KPI_PARENT_PAGE_ID`
- **依存追加復活**（§2-2）：`@notionhq/client`
- **Phase 1h以降を1段スライド**（§12）：Phase 1g が Notion実装、Phase 1h が Snapshot+管理画面、Phase 1i がデプロイ
- **§15 将来拡張から Notion 自動連携を削除**（本体に組み込まれたため）
- **コストは v3.3 と同額の$25/月を維持**（Notion API は無料）

### v3.2 → v3.3（2026-04-20）

レビューで検出された致命的論点5件を反映、Vercelコストを$20削減、Notion連携を除外。

- **Vercel Hobby化**（§2-4、§6-2）：Vercel Cron を3本→1本に統合（`/api/cron/daily`）。月額$45→$25に削減
- **Notion自動連携を Phase 1 から除外**（§7、§15）：ダッシュボード内 `/reports` 画面でMarkdown/画像/CSVエクスポート機能を提供、必要時は加藤が手動コピー。Notion sync は将来拡張扱い
- **`works` 自動登録ロジック追加**（§4-1、§4-1-1、§5-4）：新規product_variant検出時に `works` も自動生成、`auto_created=true` で識別、後から加藤が編集可能
- **`app_settings` の RLS 明記**（§4-5）：`SELECT USING (true)` ポリシー追加。VIEWがJOINするため必須
- **VIEWの性能改善**（§4-6）：`WITH rate AS (...)` CTE化でサブクエリ評価回数を削減、`COALESCE(pv.language, 'unknown')` でNULL対応
- **`sales_daily.sale_date` の意味明文化**（§4-3）：月次集計時は期間from（月初日）を格納
- **`ingestion_log` 作成順序注記**（§4-3）：`sales_daily` より先に CREATE する必要あり
- **§17 改訂履歴のMarkdown階層修正**：v2→v3 のサブセクションを `####` に降格
- **その他**：Notion関連環境変数削除（§11-1）、リスク#7（Notion関連）を打消線処理（§13）、将来拡張に Notion自動連携・多ユーザー化を追記（§15）

### v3.1 → v3.2（2026-04-20）
- **Phase 0 の A/B（セレクター特定）を ✅ 完了**にステータス更新。ドラフトは `scripts/phase0/config/*.draft.ts` に保存、Phase 1d/1eで実動作確認後に本体に昇格
- **Phase 0 の G（言語判定精度測定）を ✅ 完了**にステータス更新。実測結果を §5-3 に表で反映
- **言語判定ライブラリの方針変更**：正規表現版がPhase 0で実用レベル達成したため、Phase 1bの実装は正規表現ベースに。`franc` 導入はオプション扱い（§2-2、§5-3、§11 Phase 1b）
- **Phase 1b の検証基準更新**：Phase 0 実測値（ja 45 / zh-Hant 30 / en 9 / zh-Hans 3 / unknown 14）と一致することを確認基準に（§14）
- **`/variants` 画面の要件追加**：RJ番号パターンで兄弟関係を自動提案するUIを推奨（unknown 14件の大半が簡体字版と推測されるため）（§5-3、§9-3）
- **Phase 0 成果物の保管場所明確化**：`docs/phase0-results.md`、`scripts/phase0/` 配下

### v3 → v3.1（2026-04-20）
- **DLsite/Fanza両方で「期間指定スクレイピング」の制約を確認**。両サイトとも長期間CSVは一括取得不可、1日〜1ヶ月単位で期間指定してCSV生成→ダウンロードの自動化が必要
- **Fanza実CSV構造を §5-1 に追記**（`sales_all_0_20260401_20260419.csv` 構造、ファイル名・CSV内列の両方に期間情報あり）
- **プラットフォーム別列マッピング表を追加**（§5-1-1）
- **スクレイパーの動作モード3種を定義**（`daily`/`backfill`/`check`）
- **過去分バックフィル戦略を明確化**：月次unit優先で48ヶ月を約50分で完了（§2-4、§5-2、§11 Phase 1i）
- **Phase 0検証項目を更新**：「日次CSV可否」は確認済みで削除、「期間指定UIのセレクター特定」に変更（§3-2）

### v2 → v3（2026-04-20）

#### 致命的論点の修正
- **VIEW設計**：`current_setting('app.xxx')` 依存 → `app_settings` 物理テーブル方式（§4-5、§4-6）
- **Phase 0 技術検証を追加**（§3）：DLsite日次CSV可否、Playwright動作、Supabase設定、Fanza構造、YouTube API、Notion APIを事前検証
- **認証ユーザー範囲の不整合解消**：加藤のみ利用に統一、チーム共有はNotion経由（§1-2、§10）

#### 重大論点の反映
- **BLサンドの作品モデル統一**：`works.youtube_video_ids` 配列を廃止、YouTubeも `product_variants` で管理（§4-1、§4-2）
- **スクレイピング実行基盤**：GitHub Actions採用（§5-2、§6）。Vercel Proは軽量Cronのみ
- **月次/日次データ共存対策**：`aggregation_unit` 列追加（§4-3、§5-1）
- **言語判定**：正規表現 → `franc` ライブラリ（§5-3）、実データでの精度測定はPhase 0/1b
- **Notion更新方式**：全削除再作成 → マーカー範囲置換（§7-2）、手動編集部分を保護
- **CSVバルクアップロード対応**（§5-1、§9-5）：過去4年分の運用負荷を削減
- **運用負荷削減**：`/variants` 画面にタイトル類似度ベースの推測紐付けUI（§9-3）
- **ロールバック対応**：`ingestion_log_id` 外部キーでジョブ単位の削除を可能に（§4-3、§9-5）

#### 中規模・軽微論点の反映
- **コスト明記**：月額$45（Supabase Pro + Vercel Pro）（§2-4）
- **RLS**：全テーブルにポリシー（§4-8）
- **YouTube APIクォータ管理**：`filters=video==` での複数動画まとめ取り（§5-4）
- **セッション再利用**：DLsite/Fanzaのログイン Cookie をSupabase Storageで保持（§5-2）
- **テスト戦略**：単体・統合・E2E・壊れ耐性の4層（§14）
- **バックアップ**：Supabase Pro標準＋週次pg_dump（§13）
- **カラム名修正**：`gross_revenue_jpy` → `net_revenue_jpy`（意味と合わせる）、`is_original BOOLEAN` → `origin_status TEXT`、`scraper_version` → `source_version`
- **依存追加**：`zod`、`date-fns`、`csv-parse`、`franc`（§2-2）
- **CHECK制約**：主要テーブルに enum 値を明示（§4-1、§4-2、§4-3、§4-7）
