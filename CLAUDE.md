# CLAUDE.md — bisque-sales-analytics 開発ガイド

## プロジェクト概要
Bisque（CAPURI・BerryFeel・BLsand）の売上データをプラットフォーム横断（DLsite/Fanza/YouTube）で集約・分析・Notion自動反映するダッシュボード。

**詳細仕様**：`SPEC.md` を参照（v3.6が最新）。

## 技術スタック
- **Next.js 16**（App Router）+ TypeScript
- **Supabase Pro**（PostgreSQL・Storage・RLS）
- **Tailwind CSS v3**（projects/CLAUDE.md準拠、v4は使わない）
- **shadcn/ui**（Phase 1c以降で導入）
- **Recharts**（チャート）
- **Zustand**（状態管理、必要に応じて）
- **zod**（スキーマ検証）
- **Playwright**（DLsite/Fanzaスクレイピング、GitHub Actions上で実行）
- **googleapis**（YouTube Data/Analytics API）
- **@notionhq/client**（Notion月次ページ自動更新）
- **iconv-lite** + **csv-parse**（CP932 CSV処理）
- **date-fns**（日付操作）

## ディレクトリ構造
```
src/
├── app/
│   ├── api/
│   │   ├── auth/login/route.ts       # パスワード認証
│   │   └── cron/                     # Phase 1f以降
│   ├── login/page.tsx                # パスワードログイン画面
│   ├── layout.tsx
│   ├── globals.css
│   └── page.tsx                      # ダッシュボード（Phase 1c で拡張）
├── lib/
│   ├── supabase/                     # 3層（client/server/service）
│   ├── constants/brand-mapping.ts    # サークル名→Brand
│   ├── utils/
│   │   ├── detect-language.ts        # 言語自動判定
│   │   └── app-settings.ts           # 環境変数→DB 同期
│   └── scrapers/                     # Phase 1d以降
├── middleware.ts                     # Cookie認証
supabase/migrations/
└── 001_initial_schema.sql            # 全テーブル・VIEW・RLS
scripts/phase0/                       # Phase 0 成果物（セレクタドラフト等）
docs/                                 # Phase 0 結果等
data/                                 # 実CSVサンプル＋管理画面スクショ
```

## コマンド
```bash
npm run dev          # 開発サーバー (http://localhost:3000)
npm run build        # 本番ビルド
npm run lint         # ESLint
```

## DB migration の適用（重要）

スキーマ変更（テーブル・VIEW・関数の追加変更）は Supabase CLI 経由で行う。

```bash
# 1. 新しい migration ファイルを作成
#    supabase/migrations/<番号>_<名前>.sql

# 2. リモートDBに適用（履歴も schema_migrations に登録される）
supabase db push

# 3. PostgREST スキーマキャッシュは Supabase が自動更新
#    （SQL Editor 手動実行時のような NOTIFY pgrst, 'reload schema' は不要）
```

セットアップ済み事項（2026-04-30 完了）：
- Supabase CLI v2.x がローカルにインストール済み (`brew install supabase/tap/supabase`)
- プロジェクトリンク済み（project-ref: `gvjkeruvqqgmverbavkt`）
- 過去 migration 001〜011 は `supabase migration repair --status applied` で適用済みマーク完了
- 認証情報は `~/.supabase/access-token` に保存

トラブル時：
- 401 認証エラー → 別ターミナルで `supabase login` を再実行
- 「Cannot find project ref」 → `supabase link --project-ref gvjkeruvqqgmverbavkt`
- migration がローカルとリモートでズレた → `supabase migration list` で差分確認 →
  `supabase migration repair --status applied <version>` または
  `supabase migration repair --status reverted <version>` で調整

絶対やらないこと：
- Supabase Dashboard SQL Editor で migration ファイルを手動実行しない
  （CLI 履歴とズレる原因になるため）

## 認証
- 共通パスワード認証（idea-cascade準拠）
- Cookie: `bisque-analytics-auth=authenticated`
- Cookie属性: HttpOnly, Secure（本番）, SameSite=Lax, Max-Age=30日
- パスワード比較は `timingSafeEqual`
- CSRF対策: SameSite=Lax + Origin検証

## 重要な設計ルール

### データモデル
- `works`（作品）+ `product_variants`（言語別SKU）+ `sales_daily`（日次売上）+ `youtube_metrics_daily`（YouTube指標）+ `app_settings`（為替レート等）+ `notion_pages`（Notion block_id追跡）+ `ingestion_log`（取込履歴）
- `works.id` は `auto-XXXXXXXX` 形式の自動生成、`slug` 列で人間可読名
- 新規 product_variant 検出時は同時に works を自動生成（`auto_created=true`）
- 月次集計は `aggregation_unit='monthly'`、`sale_date=月初日`
- 横断分析は `sales_unified_daily` VIEW 経由（DLsite+Fanza+YouTube統合、USD→JPY換算）

### スクレイピング
- DLsite/Fanzaは**期間指定の自動化**（1日 or 1ヶ月単位）
- GitHub Actions上でPlaywright実行（Vercelでは動かさない）
- セレクターは `src/lib/scrapers/config/` に定数化（UI変更時はここだけ修正）
- 失敗時はスクショ自動保存（Supabase Storage + GA Artifact）
- 動作モード：`daily` / `backfill` / `check`

### Cron
- GitHub Actions: `scrape-dlsite-daily.yml`（JST 05:00）、`scrape-fanza-daily.yml`（JST 05:15）
- Vercel Cron（Hobby、2本まで）：
  - `/api/cron/daily`（JST 05:30）YouTube + Snapshot
  - `/api/cron/notion`（JST 05:45）Notion sync
- 実行前に `ingestion_log` で前工程成功を確認

### Notion自動反映
- block_id追跡方式（`notion_pages` テーブル）
- テーブル列数は作成時に固定、変更不可（Notion API制約）
- マーカー外のブロックは保持される（加藤の手動編集と共存）

### 開発ルール
- UI動作確認は **Browser Use CLI 2.0**（projects/CLAUDE.md準拠、Playwrightは本番コード用）
- コミット粒度：機能単位、PRはスカッシュマージ
- 実装後は `/simplify` でコード品質確認

## Phase 1 の進行状況
- ✅ Phase 0：セレクターA/B、言語判定Gは完了
- 🔄 Phase 1a：基盤（Next.js init + Supabase migration + 認証）← 現在
- ⏳ Phase 1b〜1i：仕様書§12参照

## 環境変数
`.env.example` をコピーして `.env.local` を作る。値の管理は `docs/env-sync-checklist.md` 参照予定。

## 関連ドキュメント
- `SPEC.md`: 詳細仕様（v3.6）
- `docs/phase0-results.md`: Phase 0 検証結果
- `/Users/takuyakato/projects/CLAUDE.md`: projects共通ルール
- `/Users/takuyakato/CLAUDE.md`: 全社共通ルール
- `/Users/takuyakato/roadie/management/strategy/成人向けLive2D動画の海外展開戦略.md`: 連携対象の戦略ドキュメント
